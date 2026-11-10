import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import evalWorker,{ArmansSessionState} from '../dev/eval-worker.mjs';
import {createPrivateCartInspector} from '../dev/private-cart-inspector.mjs';
import {signSession,sessionKey} from '../src/session-security.mjs';
import productionWorker from '../src/worker.mjs';
const store='karachi-kicks-supportops-lab.myshopify.com';
const envBase={SHOPIFY_STORE:store,COMMERCE_SERVICE_SECRET:'service-test-only-'.repeat(3),SESSION_ISSUER_SECRET:'issuer-test-only-'.repeat(3),LOCAL_EVAL_INSPECTION_SECRET:'inspection-test-only-'.repeat(3)};
const privateId='gid://shopify/Cart/fake_training_cart?key=fake_training_key';
function session(sid='session_test_one'){const iat=Math.floor(Date.now()/1000);return {sub:'operator_test_only',sid,store,market:'US',currency:'USD',iat,exp:iat+600};}
async function fixture(){
 const env={...envBase},objects=new Map(),states=new Map(),victim=session();
 env.SESSION_STATE={idFromName:key=>key,get:key=>{if(!objects.has(key))objects.set(key,new ArmansSessionState({storage:{get:async name=>name==='session'?states.get(key):undefined,put:async()=>{throw Error('INSPECTION_MUST_NOT_WRITE');}}},env,{fetcher:async()=>{throw Error('NO_LIVE_CALLS');}}));return objects.get(key);}};
 const key=await sessionKey(victim);states.set(key,{owner:key,cartId:privateId,revision:1,phase:'READY'});
 const headersForSession=async s=>({Authorization:'Bearer '+env.COMMERCE_SERVICE_SECRET,'X-Armans-Session':await signSession(s,env.SESSION_ISSUER_SECRET)});
 async function request({claims=victim,url='http://127.0.0.1:8787/__eval/private-cart',headers={},method='POST',body}={}){return new Request(url,{method,headers:{Host:new URL(url).host,...await headersForSession(claims),'X-Armans-Eval-Inspection':env.LOCAL_EVAL_INSPECTION_SECRET,...headers},...(body===undefined?{}:{body})});}
 return {env,objects,states,victim,key,headersForSession,request};
}
test('evaluation inspector returns only confirmed owned cart; production entry exposes no inspection',async()=>{
 const f=await fixture(),response=await evalWorker.fetch(await f.request(),f.env,{});
 assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
 assert.deepEqual(await response.json(),{cart_id:privateId,revision:1,store});
 const prod=await productionWorker.fetch(await f.request(),f.env,{});assert.equal(prod.status,405);assert.ok(!(await prod.text()).includes(privateId));
 const config=JSON.parse(await readFile(new URL('../wrangler.eval-local.jsonc',import.meta.url),'utf8'));
 assert.equal(config.main,'dev/eval-worker.mjs');assert.equal(config.dev.ip,'127.0.0.1');assert.equal(config.workers_dev,false);
});
test('host/origin/body guards reject browser, DNS rebinding, off-loopback and selector input',async()=>{
 const f=await fixture();
 for(const options of [{url:'https://example.com/__eval/private-cart'},{headers:{Host:'evil.example'}},{headers:{Origin:'http://127.0.0.1:8787'}},{headers:{'Sec-Fetch-Site':'same-origin'}},{headers:{'Sec-Fetch-Mode':'navigate'}},{headers:{'Sec-Fetch-Dest':'empty'}},{url:'http://localhost.evil.test/__eval/private-cart'},{url:'http://127.0.0.1:8787/__eval/private-cart?id=x'},{body:'{"sid":"session_test_two"}'},{method:'GET'}]){
  const response=await evalWorker.fetch(await f.request(options),f.env,{});assert.equal(response.status,403);assert.ok(!(await response.text()).includes(privateId));
 }
 assert.equal((await evalWorker.fetch(await f.request({url:'http://localhost:8787/__eval/private-cart',headers:{'Sec-Fetch-Mode':'cors'}}),f.env,{})).status,200);
});
test('independent inspection secret, service bearer and signed scoped session are all required',async()=>{
 const f=await fixture();
 for(const headers of [{'X-Armans-Eval-Inspection':''},{Authorization:'Bearer wrong'},{'X-Armans-Session':''},{'X-Armans-Session':'forged.signature'}])assert.equal((await evalWorker.fetch(await f.request({headers}),f.env,{})).status,401);
 assert.equal((await evalWorker.fetch(await f.request({claims:{...f.victim,store:'another.myshopify.com'}}),f.env,{})).status,401);
 for(const value of ['short',f.env.COMMERCE_SERVICE_SECRET,f.env.SESSION_ISSUER_SECRET])assert.equal((await evalWorker.fetch(await f.request(),{...f.env,LOCAL_EVAL_INSPECTION_SECRET:value},{})).status,503);
});
test('stored owner and signed session isolate victims; untrusted identity headers cannot select cart',async()=>{
 const f=await fixture();
 const stranger=await evalWorker.fetch(await f.request({claims:session('session_test_two'),headers:{'X-Session-ID':f.victim.sid,'X-User-ID':f.victim.sub,'X-Cart-ID':privateId}}),f.env,{});
 assert.equal(stranger.status,403);assert.ok(!(await stranger.text()).includes(privateId));
 f.states.set(f.key,{...f.states.get(f.key),owner:'wrong_owner'});assert.equal((await evalWorker.fetch(await f.request(),f.env,{})).status,403);
});
test('unknown, pending, cancelled and malformed cart states fail closed without a write',async()=>{
 const f=await fixture(),base=f.states.get(f.key);
 for(const override of [{phase:'PENDING'},{phase:'UNKNOWN'},{phase:'CANCELLATION_REQUESTED'},{cartId:null},{cartId:'https://example.com/cart'},{revision:0}]){
  f.states.set(f.key,{...base,...override});const r=await evalWorker.fetch(await f.request(),f.env,{});assert.equal(r.status,409);assert.ok(!(await r.text()).includes(privateId));
 }
});
test('inspection waits for the existing durable-state queue and internal route is not public',async()=>{
 const f=await fixture(),object=f.env.SESSION_STATE.get(f.key);let release;
 object.queue=new Promise(resolve=>{release=resolve;});let completed=false;
 const pending=evalWorker.fetch(await f.request(),f.env,{}).then(r=>{completed=true;return r;});
 await new Promise(resolve=>setTimeout(resolve,10));assert.equal(completed,false);release();assert.equal((await pending).status,200);
 const direct=await object.fetch(await f.request({url:'http://127.0.0.1:8787/__eval/inspect-owned-cart'}));assert.equal(direct.status,403);
 const external=await evalWorker.fetch(await f.request({url:'http://127.0.0.1:8787/__eval/inspect-owned-cart'}),f.env,{});assert.equal(external.status,405);
});
test('trusted helper binds response to the created revision and sends no arbitrary headers or body',async()=>{
 const f=await fixture();let requests=0;
 const inspector=createPrivateCartInspector({workerUrl:'http://127.0.0.1:8787',inspectionSecret:f.env.LOCAL_EVAL_INSPECTION_SECRET,headersForSession:async s=>({...await f.headersForSession(s),'X-Cart-ID':privateId,Cookie:'must-not-forward'}),fetcher:async(url,init)=>{
  requests++;assert.equal(init.redirect,'error');assert.equal(init.body,undefined);assert.equal(init.headers.Cookie,undefined);assert.equal(init.headers['X-Cart-ID'],undefined);
  return evalWorker.fetch(new Request(url,{...init,headers:{...init.headers,Host:new URL(url).host}}),f.env,{});
 }});
 assert.equal(await inspector(f.victim,{revision:1,ready_for_handoff:true}),privateId);
 await assert.rejects(inspector(f.victim,{revision:2,ready_for_handoff:true}),/^Error: PRIVATE_CART_INSPECTION_FAILED$/);
 await assert.rejects(inspector({...f.victim,store:'other.myshopify.com'},{revision:1,ready_for_handoff:true}),/PRIVATE_CART_INSPECTION_FAILED/);
 assert.equal(requests,2);
});
test('helper rejects remote configuration, redirects, leaked errors and oversized responses',async()=>{
 const f=await fixture(),base={inspectionSecret:f.env.LOCAL_EVAL_INSPECTION_SECRET,headersForSession:f.headersForSession};
 for(const workerUrl of ['https://example.com','https://127.0.0.1:8787','http://localhost.evil.test','http://user:password@127.0.0.1','http://127.0.0.1/api'])assert.throws(()=>createPrivateCartInspector({...base,workerUrl}),/CONFIGURATION/);
 for(const fetcher of [async()=>{throw Error(privateId);},async()=>new Response(privateId,{status:302,headers:{Location:'https://example.com'}}),async()=>new Response('x'.repeat(4097),{headers:{'Content-Type':'application/json','Cache-Control':'no-store'}})]){
  const inspector=createPrivateCartInspector({...base,workerUrl:'http://127.0.0.1:8787',fetcher});await assert.rejects(inspector(f.victim,{revision:1,ready_for_handoff:true}),error=>error.message==='PRIVATE_CART_INSPECTION_FAILED'&&!error.message.includes(privateId));
 }
});

test('workerd-style zero-byte POST stream and standalone Node fetch metadata are accepted',async()=>{
 const f=await fixture(),base=await f.request({headers:{'Sec-Fetch-Mode':'cors'}});
 const request=new Request(base.url,{method:'POST',headers:base.headers,body:new ReadableStream({start(controller){controller.close();}}),duplex:'half'});
 assert.notEqual(request.body,null);
 const response=await evalWorker.fetch(request,f.env,{});assert.equal(response.status,200);
 assert.equal((await response.json()).cart_id,privateId);
});
