import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CATALOG_QUERY, classifyProfile, inspectDiscovery, readCatalog, handleRequest } from '../src/worker.mjs';

const base = { SHOPIFY_STORE:'karachi-kicks-supportops-lab.myshopify.com', SHOPIFY_API_VERSION:'2026-07', CATALOG_HANDLE:'karachi-kicks-runner-pro' };
const fixture = { data: { shop: { name:'Test store', currencyCode:'PKR' }, products: { nodes:[{ id:'gid://shopify/Product/1', title:'Test Runner', handle:base.CATALOG_HANDLE, status:'ACTIVE', private_field:'MUST_NOT_ESCAPE', variants:{ nodes:[{id:'gid://shopify/ProductVariant/1',title:'Size 42',price:'4500.00',secret:'MUST_NOT_ESCAPE'}], pageInfo:{hasNextPage:false} } }],pageInfo:{hasNextPage:false} } } };
const response = (body,status=200,headers={}) => new Response(typeof body === 'string' ? body : JSON.stringify(body),{status,headers:{'content-type':'application/json',...headers}});

test('runtime uses the schema-validated catalog query',()=>{
  const normalize=s=>s.replace(/\s+/g,' ').trim();
  assert.equal(normalize(CATALOG_QUERY),normalize(readFileSync(new URL('../catalog.graphql',import.meta.url),'utf8')));
});
test('a 200 HTML response is never reported as a valid profile',()=>{
  assert.equal(classifyProfile(200,'text/html','<h1>Shop</h1>','/').classification,'WRONG_CONTENT');
});
test('a password redirect is reported separately from a routing error',()=>{
  assert.equal(classifyProfile(200,'text/html','password','/password').classification,'PASSWORD_GATE');
});
test('null, empty, array and malformed profiles fail without crashing',()=>{
  for(const text of ['null','[]','{}','{"ucp":null}','{"ucp":[]}','{"ucp":{}}']) assert.equal(classifyProfile(200,'application/json',text,'/').classification,'PROFILE_SHAPE_FAILED');
  assert.equal(classifyProfile(200,'application/json','{broken','/').classification,'INVALID_JSON');
});
test('basic profile shape is explicitly not a transaction verification',()=>{
  const result=classifyProfile(200,'application/json; charset=utf-8',JSON.stringify({ucp:{version:'2026-08-25',services:{},payment_handlers:{},capabilities:{}}}),'/');
  assert.equal(result.classification,'PROFILE_SHAPE_OK');
  assert.match(result.meaning,/have not been tested/);
});
test('discovery follows same-store password redirect without admin credentials',async()=>{
  const calls=[]; const result=await inspectDiscovery(base,async(url,init)=>{calls.push({url,init});return calls.length===1?new Response(null,{status:302,headers:{location:'/password'}}):response('<html>Enter password</html>',200,{'content-type':'text/html'});});
  assert.equal(calls.length,2); assert.equal(result.classification,'PASSWORD_GATE');
  assert.equal(calls[0].init.redirect,'manual'); assert.equal(calls[1].init.headers['X-Shopify-Access-Token'],undefined);
});
test('external and private-address redirects are recorded without being fetched',async()=>{
  let calls=0;const result=await inspectDiscovery(base,async()=>{calls++;return new Response(null,{status:302,headers:{location:'http://127.0.0.1/private?secret=example'}});});
  assert.equal(calls,1);assert.equal(result.classification,'EXTERNAL_REDIRECT');assert.equal(result.redirects[0].destination,'http://127.0.0.1/private');
});
test('invalid configured store cannot receive Shopify credentials',async()=>{
  let calls=0;await assert.rejects(()=>readCatalog({...base,SHOPIFY_STORE:'evil.example',SHOPIFY_CLIENT_ID:'id',SHOPIFY_CLIENT_SECRET:'secret'},async()=>{calls++;}),e=>e.code==='CONFIGURATION');assert.equal(calls,0);
});
test('missing secrets produce an actionable setup failure with no network call',async()=>{
  const result=await handleRequest(new Request('https://demo.test/api/catalog'),base,{},async()=>{throw Error('must not run');});
  assert.equal(result.status,503);assert.equal((await result.json()).error,'SETUP_REQUIRED');
});
test('catalog obtains credentials server-side and returns only selected product fields',async()=>{
  const calls=[];const env={...base,SHOPIFY_CLIENT_ID:'catalog-projection-test',SHOPIFY_CLIENT_SECRET:'PRIVATE_CLIENT_SECRET'};
  const result=await readCatalog(env,async(url,init)=>{calls.push({url,init});return calls.length===1?response({access_token:'PRIVATE_ACCESS_TOKEN',expires_in:86400}):response(fixture);});
  assert.match(calls[0].init.body,/client_credentials/);assert.equal(calls[1].init.headers['X-Shopify-Access-Token'],'PRIVATE_ACCESS_TOKEN');
  assert.equal(JSON.parse(calls[1].init.body).variables.search,`handle:${base.CATALOG_HANDLE}`);
  assert.equal(result.products[0].variants[0].price,'4500.00');assert.doesNotMatch(JSON.stringify(result),/PRIVATE|MUST_NOT_ESCAPE/);
});
test('GraphQL errors under HTTP 200 cannot become a successful catalog',async()=>{
  let calls=0;const env={...base,SHOPIFY_CLIENT_ID:'graphql-failure-test',SHOPIFY_CLIENT_SECRET:'private'};
  await assert.rejects(()=>readCatalog(env,async()=>++calls===1?response({access_token:'private',expires_in:300}):response({errors:[{message:'Sensitive upstream text',extensions:{code:'ACCESS_DENIED'}}]})),e=>e.code==='SHOPIFY_QUERY_ERROR'&&!e.message.includes('Sensitive'));
});
test('a rejected cached token is discarded before the next catalog attempt',async()=>{
  let calls=0;const env={...base,SHOPIFY_CLIENT_ID:'expired-token-test',SHOPIFY_CLIENT_SECRET:'private'};
  const fake=async()=>{calls++;if(calls===1||calls===3)return response({access_token:`private-${calls}`,expires_in:86400});if(calls===2)return response({},401);return response(fixture);};
  await assert.rejects(()=>readCatalog(env,fake),e=>e.code==='SHOPIFY_AUTH');
  const result=await readCatalog(env,fake);assert.equal(calls,4);assert.equal(result.products.length,1);
});
test('upstream rate limits remain visible and are not retried in a loop',async()=>{
  let calls=0;await assert.rejects(()=>readCatalog({...base,SHOPIFY_CLIENT_ID:'throttle-test',SHOPIFY_CLIENT_SECRET:'private'},async()=>{calls++;return response('wait',429);}),e=>e.code==='RATE_LIMITED');assert.equal(calls,1);
});
test('oversized response is bounded',async()=>{
  await assert.rejects(()=>inspectDiscovery(base,async()=>response('x'.repeat(262145))),e=>e.code==='RESPONSE_TOO_LARGE');
});
test('network failures do not leak internal error text',async()=>{
  const result=await handleRequest(new Request('https://demo.test/api/discovery'),base,{},async()=>{throw Error('token=PRIVATE');});
  const data=await result.json();assert.equal(result.status,502);assert.equal(data.error,'UPSTREAM_UNREACHABLE');assert.doesNotMatch(JSON.stringify(data),/PRIVATE/);
});
test('request parameters cannot turn the preview into an arbitrary URL proxy',async()=>{
  let calls=0;const r=await handleRequest(new Request('https://demo.test/api/discovery?url=http://127.0.0.1'),base,{},async()=>{calls++;});assert.equal(r.status,400);assert.equal(calls,0);
});
test('write requests are denied and the auditor does not advertise a fake merchant profile',async()=>{
  const write=await handleRequest(new Request('https://demo.test/api/catalog',{method:'POST'}),base);assert.equal(write.status,405);
  const profile=await handleRequest(new Request('https://demo.test/.well-known/ucp'),base);assert.equal(profile.status,404);assert.equal((await profile.json()).error,'NOT_A_COMMERCE_SERVICE');
});

