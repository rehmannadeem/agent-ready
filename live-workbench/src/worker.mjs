import { handleCommerce } from './commerce.mjs';
// Admin operations remain read-only; the UCP adapter supports test carts only.
export const CATALOG_QUERY = `query WorkbenchCatalog($search: String!) {
  shop { name currencyCode }
  products(first: 5, query: $search) {
    nodes {
      id title handle status
      variants(first: 10) { nodes { id title price } pageInfo { hasNextPage } }
    }
    pageInfo { hasNextPage }
  }
}`;

const VERSION = '0.2.0';
const MAX_BYTES = 262144;
const CACHE_SECONDS = 30;
const tokenCache = new Map();
export class SafeError extends Error {
  constructor(code, message, status = 502) { super(message); this.code = code; this.status = status; }
}

export function storeHost(env) {
  const host = env.SHOPIFY_STORE || '';
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(host)) {
    throw new SafeError('CONFIGURATION', 'A valid Shopify store domain must be configured.', 503);
  }
  return host;
}

export function productHandle(env) {
  const handle = env.CATALOG_HANDLE || '';
  if (!/^[a-z0-9][a-z0-9-]{0,150}$/.test(handle)) {
    throw new SafeError('CONFIGURATION', 'A demo product handle must be configured.', 503);
  }
  return handle;
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

async function readJSON(response) {
  try { return JSON.parse(await boundedText(response)); }
  catch (error) {
    if (error instanceof SafeError) throw error;
    throw new SafeError('UPSTREAM_INVALID_JSON', 'The upstream service returned invalid JSON.');
  }
}

function checkStatus(response, service) {
  if (response.status === 429) throw new SafeError('RATE_LIMITED', `${service} is limiting requests. Wait before retrying.`, 429);
  if ([401, 403].includes(response.status)) throw new SafeError('SHOPIFY_AUTH', 'Shopify rejected access. Check the installed app and its credentials.', 503);
  if (!response.ok) throw new SafeError('UPSTREAM_HTTP', `${service} returned HTTP ${response.status}.`);
}

async function getToken(env, fetcher) {
  const host = storeHost(env);
  if (!env.SHOPIFY_CLIENT_ID || !env.SHOPIFY_CLIENT_SECRET) {
    throw new SafeError('SETUP_REQUIRED', 'Add SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET as Cloudflare secrets to connect the live catalog.', 503);
  }
  const key = `${host}:${env.SHOPIFY_CLIENT_ID}`;
  const existing = tokenCache.get(key);
  if (existing && existing.expires > Date.now()) return existing.token;
  const response = await request(`https://${host}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: env.SHOPIFY_CLIENT_ID, client_secret: env.SHOPIFY_CLIENT_SECRET }).toString()
  }, fetcher);
  checkStatus(response, 'Shopify authentication');
  const data = await readJSON(response);
  if (typeof data.access_token !== 'string' || !data.access_token || !Number.isFinite(data.expires_in) || data.expires_in <= 0) {
    throw new SafeError('SHOPIFY_AUTH', 'Shopify did not return a usable access token.', 503);
  }
  tokenCache.set(key, { token: data.access_token, expires: Date.now() + Math.max(0, data.expires_in - 120) * 1000 });
  return data.access_token;
}

export async function readCatalog(env, fetcher = fetch) {
  const host = storeHost(env);
  const handle = productHandle(env);
  const version = env.SHOPIFY_API_VERSION;
  if (!/^20\d{2}-(01|04|07|10)$/.test(version || '')) throw new SafeError('CONFIGURATION', 'Set a supported Shopify API version.', 503);
  const token = await getToken(env, fetcher);
  const response = await request(`https://${host}/admin/api/${version}/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-Shopify-Access-Token': token },
    body: JSON.stringify({ query: CATALOG_QUERY, variables: { search: `handle:${handle}` } })
  }, fetcher);
  if (response.status === 401) tokenCache.delete(`${host}:${env.SHOPIFY_CLIENT_ID}`);
  checkStatus(response, 'Shopify catalog');
  const payload = await readJSON(response);
  if (Array.isArray(payload.errors) && payload.errors.length) {
    const throttled = payload.errors.some(e => e.extensions?.code === 'THROTTLED');
    throw new SafeError(throttled ? 'RATE_LIMITED' : 'SHOPIFY_QUERY_ERROR', throttled ? 'Shopify is limiting requests. Wait before retrying.' : 'Shopify could not complete the catalog query. Check the app scope and API version.', throttled ? 429 : 502);
  }
  if (!Array.isArray(payload.data?.products?.nodes) || !payload.data?.shop?.name) {
    throw new SafeError('SHOPIFY_RESPONSE_SHAPE', 'Shopify did not return the expected catalog structure.');
  }
  // Explicit projection: this endpoint never returns the raw API payload or credentials.
  const products = payload.data.products.nodes.filter(p => p?.handle === handle).map(p => ({
    id: p.id, title: p.title, handle: p.handle, status: p.status,
    product_url: `https://${host}/products/${encodeURIComponent(p.handle)}`,
    variants: (p.variants?.nodes || []).map(v => ({ id: v.id, title: v.title, price: v.price })),
    more_variants: p.variants?.pageInfo?.hasNextPage === true
  }));
  return {
    source: 'Shopify Admin API', environment: 'development store', observed_at: new Date().toISOString(),
    store: host, shop_name: payload.data.shop.name, currency: payload.data.shop.currencyCode,
    product_filter: handle, products, more_products: payload.data.products.pageInfo?.hasNextPage === true,
    limitation: 'Admin catalog access does not prove public storefront access, agent discovery, checkout or payment support.'
  };
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

export async function handleRequest(req, env, ctx = {}, fetcher = fetch, cache = null) {
  const url = new URL(req.url);
  const commerce = await handleCommerce(req, env, fetcher);
  if (commerce) return commerce;
  if (!['GET','HEAD'].includes(req.method)) return json({ error: 'METHOD_NOT_ALLOWED' }, 405, { Allow: 'GET, HEAD' });
  if (url.pathname === '/.well-known/ucp') return json({ error: 'NOT_A_COMMERCE_SERVICE', message: 'This application inspects commerce profiles. It does not implement a UCP merchant service.' }, 404);
  if (!url.pathname.startsWith('/api/')) return env.ASSETS ? env.ASSETS.fetch(req) : new Response('Not found', { status: 404 });
  if (url.search) return json({ error: 'QUERY_NOT_SUPPORTED', message: 'This preview inspects only its configured store and product.' }, 400);
  if (!['/api/health','/api/catalog','/api/discovery'].includes(url.pathname)) return json({ error: 'NOT_FOUND' }, 404);
  try {
    if (url.pathname === '/api/health') return json({ service: 'Armans.AI Agent-Ready Live', version: VERSION, environment: 'development store preview', store: storeHost(env), catalog_configured: Boolean(env.SHOPIFY_CLIENT_ID && env.SHOPIFY_CLIENT_SECRET), evidence_scope: 'Health only; shopping acceptance is recorded separately.', shopping_tools: ['search_catalog','create_cart','get_cart','cancel_cart'], payment_operations_enabled: false });
    const key = new Request(`${url.origin}${url.pathname}`, { method: 'GET' });
    const existing = cache ? await cache.match(key) : null;
    if (existing) { const result = new Response(existing.body, existing); result.headers.set('X-Workbench-Cache','HIT'); result.headers.set('Cache-Control','no-store'); return result; }
    const data = url.pathname === '/api/catalog' ? await readCatalog(env, fetcher) : await inspectDiscovery(env, fetcher);
    const result = json(data, 200, { 'X-Workbench-Cache': 'MISS' });
    if (cache && ctx.waitUntil) {
      const stored = new Response(JSON.stringify(data), { headers: { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control': `public, max-age=${CACHE_SECONDS}` } });
      ctx.waitUntil(cache.put(key, stored));
    }
    return result;
  } catch (error) {
    if (error instanceof SafeError) return json({ error: error.code, message: error.message, observed_at: new Date().toISOString() }, error.status);
    return json({ error: 'INTERNAL_ERROR', message: 'The check failed. No readiness conclusion was produced.' }, 500);
  }
}

export default { fetch(req, env, ctx) { return handleRequest(req, env, ctx, fetch, caches.default); } };

