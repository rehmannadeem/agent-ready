import { handleCommerce, TOOLS } from './commerce.mjs';
import { authenticateCommerce } from './session-security.mjs';
import { readCatalog, CATALOG_QUERY, CatalogError, storeHost } from './catalog.mjs';
export { readCatalog, CATALOG_QUERY, storeHost } from './catalog.mjs';
export { ArmansSessionState } from './session-state.mjs';
const VERSION='0.3.0-candidate';
const MAX_BYTES=262144;
export class SafeError extends Error {
  constructor(code,message,status=502){super(message);this.code=code;this.status=status;}
}
async function boundedText(response, limit = MAX_BYTES) {
  if (Number(response.headers.get('content-length')) > limit) {
    await response.body?.cancel();
    throw new SafeError('RESPONSE_TOO_LARGE', 'The upstream response exceeded the preview size limit.');
  }
  if (!response.body) return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0, text = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > limit) throw new SafeError('RESPONSE_TOO_LARGE', 'The upstream response exceeded the preview size limit.');
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally { await reader.cancel().catch(() => {}); }
}

async function request(url, init, fetcher) {
  try {
    return await fetcher(url, { ...init, redirect: 'manual', signal: AbortSignal.timeout(10000) });
  } catch {
    throw new SafeError('UPSTREAM_UNREACHABLE', 'The upstream service did not respond. Try again shortly.');
  }
}

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export function classifyProfile(status, contentType, text, finalPath) {
  if (status === 429) return { classification: 'RATE_LIMITED', meaning: 'The merchant is limiting requests. No readiness conclusion can be drawn.' };
  if ([401, 403].includes(status)) return { classification: 'ACCESS_BLOCKED', meaning: 'Access was denied. Check authentication or bot protection before changing routes.' };
  if (status === 404) return { classification: 'NOT_FOUND', meaning: 'This public address did not serve a commerce profile.' };
  if (status < 200 || status >= 300) return { classification: 'HTTP_ERROR', meaning: `The endpoint returned HTTP ${status}.` };
  if (finalPath === '/password' || finalPath.startsWith('/password/')) return { classification: 'PASSWORD_GATE', meaning: 'The request reached the Shopify storefront password page. Private Admin API access can still work.' };
  if (!/^application\/(?:[\w.-]+\+)?json(?:\s*;|$)/i.test(contentType)) return { classification: 'WRONG_CONTENT', meaning: 'The request succeeded, but the response is not JSON. Inspect routing or access controls.' };
  let body;
  try { body = JSON.parse(text); } catch { return { classification: 'INVALID_JSON', meaning: 'The response claims to be JSON but cannot be parsed.' }; }
  const ucp = body?.ucp;
  if (!object(body) || !object(ucp) || !/^\d{4}-\d{2}-\d{2}$/.test(ucp.version || '') || !object(ucp.services) || !object(ucp.payment_handlers) || (ucp.capabilities !== undefined && !object(ucp.capabilities))) {
    return { classification: 'PROFILE_SHAPE_FAILED', meaning: 'Basic profile structure checks failed. This is not a full schema validator.' };
  }
  return { classification: 'PROFILE_SHAPE_OK', version: ucp.version, capability_names: Object.keys(ucp.capabilities || {}).slice(0,30), meaning: 'Basic JSON structure passed. Advertised operations have not been tested by this profile check. Use the shopping workflow to test search and carts.' };
}

export async function inspectDiscovery(env, fetcher = fetch) {
  const origin = `https://${storeHost(env)}`;
  const initial = `${origin}/.well-known/ucp`;
  let url = initial;
  const redirects = [];
  for (let hop = 0; hop <= 3; hop++) {
    const response = await request(url, { method: 'GET', headers: { Accept: 'application/json', 'User-Agent': 'Armans-Agent-Ready-Live/0.1' } }, fetcher);
    if ([301,302,303,307,308].includes(response.status)) {
      const location = response.headers.get('location');
      await response.body?.cancel();
      if (!location) throw new SafeError('INVALID_REDIRECT', 'A redirect response had no destination.');
      const next = new URL(location, url);
      // Redirect evidence drops query strings, credentials and fragments.
      redirects.push({ status: response.status, destination: `${next.origin}${next.pathname}` });
      if (next.origin !== origin || next.username || next.password) return { source: 'Public HTTP request', observed_at: new Date().toISOString(), url: initial, redirects, classification: 'EXTERNAL_REDIRECT', meaning: 'A redirect left the configured store. It was recorded without following it.' };
      url = next.href;
      continue;
    }
    const type = response.headers.get('content-type') || '';
    const text = await boundedText(response);
    return { source: 'Public HTTP request', observed_at: new Date().toISOString(), url: initial, final_url: `${new URL(url).origin}${new URL(url).pathname}`, http_status: response.status, content_type: type, redirects, ...classifyProfile(response.status, type, text, new URL(url).pathname) };
  }
  throw new SafeError('REDIRECT_LIMIT', 'The store exceeded the preview redirect limit.');
}

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data, null, 2), { status, headers: {
    'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', ...extra
  }});
}

export async function handleRequest(req,env,ctx={},fetcher=fetch,cache=null){
  const url=new URL(req.url);
  const commerce=await handleCommerce(req,env,fetcher);
  if(commerce)return commerce;
  if(url.pathname==='/api/catalog'){
    try{
      const principal=await authenticateCommerce(req,env);
      if(!['GET','HEAD'].includes(req.method))return json({error:'METHOD_NOT_ALLOWED'},405,{Allow:'GET, HEAD'});
      const data=await readCatalog(env,fetcher,url.searchParams,principal);
      return json(data,200,{'X-Workbench-Cache':'BYPASS'});
    }catch(error){
      if(error instanceof CatalogError||typeof error?.code==='string'&&Number.isInteger(error?.status))return json({error:error.code,message:error.message,observed_at:new Date().toISOString()},error.status);
      return json({error:'INTERNAL_ERROR',message:'Catalog visibility could not be verified.'},500);
    }
  }
  if(!['GET','HEAD'].includes(req.method))return json({error:'METHOD_NOT_ALLOWED'},405,{Allow:'GET, HEAD'});
  if(url.pathname==='/.well-known/ucp')return json({error:'NOT_A_COMMERCE_SERVICE',message:'This application inspects commerce profiles. It does not implement a UCP merchant service.'},404);
  if(!url.pathname.startsWith('/api/'))return env.ASSETS?env.ASSETS.fetch(req):new Response('Not found',{status:404});
  if(url.search)return json({error:'QUERY_NOT_SUPPORTED',message:'Only catalog browsing accepts query parameters.'},400);
  if(!['/api/health','/api/discovery'].includes(url.pathname))return json({error:'NOT_FOUND'},404);
  try{
    if(url.pathname==='/api/health')return json({service:'Armans.AI Agent-Ready Live',version:VERSION,environment:'development store validation candidate',store:storeHost(env),catalog_configured:Boolean(env.SHOPIFY_CLIENT_ID&&env.SHOPIFY_CLIENT_SECRET&&env.SHOPIFY_PUBLICATION_ID),evidence_scope:'Health only; scenario results are recorded separately.',shopping_tools:TOOLS.map(t=>t.name),browser_actions_require_authenticated_session:true,payment_operations_enabled:false});
    return json(await inspectDiscovery(env,fetcher),200,{'X-Workbench-Cache':'BYPASS'});
  }catch(error){
    if(error instanceof SafeError||error instanceof CatalogError)return json({error:error.code,message:error.message,observed_at:new Date().toISOString()},error.status);
    return json({error:'INTERNAL_ERROR',message:'The check failed. No readiness conclusion was produced.'},500);
  }
}
export default {async fetch(req,env,ctx){
  const started=Date.now();const response=await handleRequest(req,env,ctx);
  // No URL query, user text, payload, headers, cart IDs or tokens enter logs.
  if(env.OBSERVABILITY_ENABLED==='true'){
    const pathname=new URL(req.url).pathname;
    const route=['/api/catalog','/api/shop','/api/mcp','/api/health','/api/discovery','/agent-profile.json'].includes(pathname)?pathname:'asset';
    console.info(JSON.stringify({event:'request',route,method:req.method,status:response.status,duration_ms:Date.now()-started,correlation:crypto.randomUUID()}));
  }
  return response;
}};
