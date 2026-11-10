import test from 'node:test';
import assert from 'node:assert/strict';
import {authenticateCommerce,signSession,sessionKey} from '../src/session-security.mjs';
import {ArmansSessionState} from '../src/session-state.mjs';
import {handleCommerce} from '../src/commerce.mjs';
const env={SHOPIFY_STORE:'karachi-kicks-supportops-lab.myshopify.com',UCP_AGENT_PROFILE_URL:'https://demo.example/agent-profile.json',COMMERCE_SERVICE_SECRET:'s'.repeat(40),SESSION_ISSUER_SECRET:'i'.repeat(40)};
const claims=(sid='session_one',extra={})=>{const now=Math.floor(Date.now()/1000);return {sub:'principal_one',sid,store:env.SHOPIFY_STORE,market:'US',currency:'USD',iat:now,exp:now+600,...extra};};
const v='gid://shopify/ProductVariant/1',v2='gid://shopify/ProductVariant/2';
const privateId='gid://shopify/Cart/mock_private?key=private_key';
const create={line_items:[{variant_id:v,quantity:1}]};
const merchantCart=(lines=create.line_items)=>({id:privateId,currency:'USD',line_items:lines.map(l=>({item:{id:l.variant_id,title:'Runner',price:7900},quantity:l.quantity})),totals:[{type:'total',amount:7900}],discounts:{codes:[],applied:[]},messages:[],continue_url:`https://${env.SHOPIFY_STORE}/cart/mock_private?key=private_key`});
const response=data=>new Response(JSON.stringify({result:{structuredContent:data}}));
const gates={gateProducts:async p=>p,gateVariants:async()=>true,consumeRate:async()=>{}};
class Storage{constructor(){this.data=new Map();}async get(k){return structuredClone(this.data.get(k));}async put(k,v){this.data.set(k,structuredClone(v));}}
async function signedReq(payload=claims(),body={name:'get_cart',arguments:{}},path='https://session.internal/operate'){
 return new Request(path,{method:'POST',headers:{Authorization:`Bearer ${env.COMMERCE_SERVICE_SECRET}`,'X-Armans-Session':await signSession(payload,env.SESSION_ISSUER_SECRET),'Content-Type':'application/json'},body:JSON.stringify(body)});
}
function makeState(fetcher,storage=new Storage(),settings={}){return{storage,object:new ArmansSessionState({storage},{...env,...settings},{fetcher,gates})};}
async function op(object,name,args={},principal=claims()){const r=await object.fetch(await signedReq(principal,{name,arguments:args}));return {status:r.status,data:await r.json()};}

test('independent service bearer and signed scoped session are both required',async()=>{
 const req=await signedReq();assert.equal((await authenticateCommerce(req,env)).sid,'session_one');
 for(const h of ['Authorization','X-Armans-Session']){const bad=await signedReq();bad.headers.delete(h);await assert.rejects(()=>authenticateCommerce(bad,env),e=>e.status===401);}
 const bearer=await signedReq();bearer.headers.set('Authorization','Bearer wrong');await assert.rejects(()=>authenticateCommerce(bearer,env),e=>e.status===401);
 await assert.rejects(async()=>authenticateCommerce(await signedReq(),{...env,SESSION_ISSUER_SECRET:env.COMMERCE_SERVICE_SECRET}),e=>e.status===503);
});
test('forged, expired, wrong-store, wrong-market, and overlong assertions rejected',async()=>{
 const valid=claims();
 for(const p of [{...valid,exp:valid.iat-1},{...valid,exp:valid.iat+3601},{...valid,store:'another.myshopify.com'},{...valid,market:'PK'},{...valid,currency:'PKR'},{...valid,sub:'x'},{...valid,extra:'claim'}])await assert.rejects(async()=>authenticateCommerce(await signedReq(p),env),e=>e.status===401);
 const r=await signedReq();const token=r.headers.get('X-Armans-Session');r.headers.set('X-Armans-Session',token.slice(0,-2)+'XX');await assert.rejects(()=>authenticateCommerce(r,env),e=>e.status===401);
});
test('state key binds principal, session and store independently',async()=>{
 const a=await sessionKey(claims());assert.notEqual(a,await sessionKey(claims('session_two')));assert.notEqual(a,await sessionKey(claims('session_one',{sub:'principal_two'})));assert.notEqual(a,await sessionKey(claims('session_one',{store:'another.myshopify.com'})));
});
test('mock durable storage preserves current cart through restart and excludes private IDs from tool data',async()=>{
 let calls=0;const f=async()=>{calls++;return response(merchantCart());};const {object,storage}=makeState(f);
 const created=await op(object,'create_cart',create);assert.equal(created.status,200);assert.equal(created.data.id,undefined);assert.equal(created.data.revision,1);
 const restarted=makeState(f,storage).object;const refreshed=await op(restarted,'get_cart');assert.equal(refreshed.data.line_items[0].quantity,1);assert.equal(refreshed.data.revision,1);assert.equal(calls,2);
 // The handoff URL is intentionally disclosed only to this authenticated owner.
 assert.equal((await storage.get('session')).cartId,privateId);
 assert.equal((await op(restarted,'create_cart',create)).data.error,'CURRENT_CART_EXISTS');assert.equal(calls,2);
});
test('cross-session and cross-principal access to an already bound object fail before upstream',async()=>{
 let calls=0;const {object}=makeState(async()=>{calls++;return response(merchantCart());});await op(object,'create_cart',create);
 for(const principal of [claims('session_two'),claims('session_one',{sub:'principal_two'})])assert.equal((await op(object,'get_cart',{},principal)).status,403);
 assert.equal(calls,1);assert.equal((await op(object,'get_cart',{id:privateId})).status,400);assert.equal(calls,1);
});
test('route dispatcher resolves sessions to different durable objects; bearer cannot choose a victim cart',async()=>{
 const objects=new Map();let calls=0;const namespace={idFromName:key=>key,get:key=>{if(!objects.has(key))objects.set(key,makeState(async()=>{calls++;return response(merchantCart());}).object);return objects.get(key);}};
 let r=await handleCommerce(await signedReq(claims(),{name:'create_cart',arguments:create},'https://demo.example/api/shop'),{...env,SESSION_STATE:namespace});assert.equal(r.status,200);
 r=await handleCommerce(await signedReq(claims('session_two'),{name:'get_cart',arguments:{}},'https://demo.example/api/shop'),{...env,SESSION_STATE:namespace});assert.equal((await r.json()).status,'no_current_cart');assert.equal(calls,1);assert.equal(objects.size,2);
});
test('concurrent create requests serialize and only one merchant create runs (mock DO)',async()=>{
 let calls=0;const {object}=makeState(async()=>{calls++;await new Promise(resolve=>setTimeout(resolve,15));return response(merchantCart());});
 const results=await Promise.all([op(object,'create_cart',create),op(object,'create_cart',create)]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);assert.equal(calls,1);
});
test('concurrent full-state edits serialize their fresh reads and writes (mock DO)',async()=>{
 const order=[];let current=merchantCart();const {object}=makeState(async(_,init)=>{const p=JSON.parse(init.body).params;order.push(p.name);await new Promise(resolve=>setTimeout(resolve,5));if(p.name==='update_cart')current=merchantCart(p.arguments.cart.line_items.map(l=>({variant_id:l.item.id,quantity:l.quantity})));return response(current);});
 await op(object,'create_cart',create);await Promise.all([op(object,'update_cart',{line_items:[{variant_id:v,quantity:2}]}),op(object,'update_cart',{line_items:[{variant_id:v,quantity:3},{variant_id:v2,quantity:1}]})]);
 assert.deepEqual(order,['create_cart','get_cart','update_cart','get_cart','update_cart']);const refreshed=await op(object,'get_cart');assert.equal(refreshed.data.line_items[0].quantity,3);assert.equal(refreshed.data.revision,3);
});
test('unknown create timeout persists through restart and never automatically retries',async()=>{
 let calls=0;const f=async()=>{calls++;throw Error('timeout');};const {object,storage}=makeState(f);
 assert.equal((await op(object,'create_cart',create)).data.error,'UPSTREAM_UNREACHABLE');assert.equal((await storage.get('session')).phase,'UNKNOWN');
 const restarted=makeState(f,storage).object;assert.equal((await op(restarted,'create_cart',create)).data.error,'MUTATION_OUTCOME_UNKNOWN');assert.equal((await op(restarted,'get_cart')).data.error,'MUTATION_OUTCOME_UNKNOWN');assert.equal(calls,1);
});
test('pending mutation after crash is treated as unknown until a known cart is refreshed',async()=>{
 const storage=new Storage();await storage.put('session',{owner:await sessionKey(claims()),revision:3,cartId:privateId,phase:'PENDING',cursors:[],rate:{minute:0,count:0}});
 let calls=0;const {object}=makeState(async()=>{calls++;return response(merchantCart());},storage);
 assert.equal((await op(object,'cancel_cart')).data.error,'MUTATION_OUTCOME_UNKNOWN');assert.equal(calls,0);
 assert.equal((await op(object,'get_cart')).data.status,'active');assert.equal((await storage.get('session')).phase,'READY');assert.equal(calls,1);
});
test('cancel acknowledgement keeps cart until explicit not_found read, then permits new cart',async()=>{
 let cancelled=false;const {object}=makeState(async(_,init)=>{const name=JSON.parse(init.body).params.name;if(name==='cancel_cart'){cancelled=true;return response(merchantCart());}if(name==='get_cart'&&cancelled)return response({ucp:{version:'2026-08-25',status:'error'},messages:[{type:'error',code:'cart_not_found',severity:'unrecoverable'}]});return response(merchantCart());});
 await op(object,'create_cart',create);assert.equal((await op(object,'cancel_cart')).data.status,'cancellation_requested');assert.equal((await op(object,'create_cart',create)).data.error,'CURRENT_CART_EXISTS');const d=await op(object,'get_cart');assert.equal(d.data.status,'not_found');assert.equal(d.data.continue_url,null);assert.equal((await op(object,'create_cart',create)).status,200);
});
test('opaque cursor persists and binds exact session/query/filter/limit',async()=>{
 const inputs=[];const f=async(_,init)=>{inputs.push(JSON.parse(init.body).params.arguments.catalog);return response({products:[],pagination:{has_next_page:true,cursor:'merchant_cursor_private'}});};const {object,storage}=makeState(f);
 const first=await op(object,'search_catalog',{query:'Runner',max_price:10000,limit:5});const token=first.data.next_cursor;assert.notEqual(token,'merchant_cursor_private');
 const restarted=makeState(f,storage).object;assert.equal((await op(restarted,'search_catalog',{query:'Runner',max_price:10000,limit:5,cursor:token})).status,200);assert.equal(inputs[1].pagination.cursor,'merchant_cursor_private');
 assert.equal((await op(restarted,'search_catalog',{query:'Other',max_price:10000,limit:5,cursor:token})).data.error,'INVALID_CURSOR');
 const other=makeState(f).object;assert.equal((await op(other,'search_catalog',{query:'Runner',max_price:10000,limit:5,cursor:token},claims('session_two'))).data.error,'INVALID_CURSOR');assert.equal(inputs.length,2);
});
test('per-session rate limit is persisted, including across object restart',async()=>{
 const f=async()=>response({products:[]});const {object,storage}=makeState(f,undefined,{SESSION_REQUESTS_PER_MINUTE:1});assert.equal((await op(object,'search_catalog',{query:'x'})).status,200);
 const restarted=makeState(f,storage,{SESSION_REQUESTS_PER_MINUTE:1}).object;assert.equal((await op(restarted,'search_catalog',{query:'x'})).status,429);
});

test('shared limiter grants at most one permit per second across principals and survives restart (mock clock/DO)',async()=>{
 let now=0;const grants=[],waits=[];const storage=new Storage();
 const clock={now:()=>now,wait:async ms=>{waits.push(ms);now+=ms;}};
 const limiter=new ArmansSessionState({storage},env,{clock});
 const consume=async(object,principal)=>{const r=await object.fetch(await signedReq(principal,{},'https://session.internal/consume'));if(r.ok)grants.push(now);return r;};
 assert.equal((await consume(limiter,claims())).status,200);
 assert.equal((await consume(limiter,claims('session_two',{sub:'principal_two'}))).status,200);
 const restarted=new ArmansSessionState({storage},env,{clock});
 assert.equal((await consume(restarted,claims('session_three'))).status,200);
 assert.deepEqual(grants,[0,1000,2000]);assert.deepEqual(waits,[1000,1000]);assert.equal((await storage.get('service-rate')).nextAt,3000);
});
test('global limiter queue is bounded, overflow returns429 and corrupt state fails closed',async()=>{
 let now=0,release,entered;const waiting=new Promise(resolve=>{entered=resolve;});const storage=new Storage();await storage.put('service-rate',{nextAt:1000});
 const clock={now:()=>now,wait:async ms=>{entered();await new Promise(resolve=>{release=resolve;});now+=ms;}};
 const limiter=new ArmansSessionState({storage},env,{clock});
 const requests=await Promise.all([signedReq(claims(),{},'https://session.internal/consume'),signedReq(claims('session_two'),{},'https://session.internal/consume'),signedReq(claims('session_three'),{},'https://session.internal/consume')]);
 const first=limiter.fetch(requests[0]);await waiting;
 const rest=requests.slice(1).map(r=>limiter.fetch(r));assert.equal((await Promise.race(rest)).status,429);assert.equal(limiter.rateQueued,2);release();
 const results=await Promise.all([first,...rest]);assert.equal(results.filter(r=>r.status===200).length,1);assert.equal(results.filter(r=>r.status===429).length,2);
 await storage.put('service-rate',{nextAt:'corrupt'});assert.equal((await limiter.fetch(await signedReq(claims(),{},'https://session.internal/consume'))).status,503);
});
test('global limiter rejection prevents merchant call and never marks mutation pending',async()=>{
 let merchantCalls=0,permits=0;
 const settings={...env,SESSION_STATE:{idFromName:x=>x,get:key=>{assert.equal(key,'global-rate');return{fetch:async()=>{permits++;return new Response('{}',{status:429});}};}}};
 const storage=new Storage();const object=new ArmansSessionState({storage},settings,{fetcher:async()=>{merchantCalls++;return response(merchantCart());},gates:{gateProducts:gates.gateProducts,gateVariants:gates.gateVariants}});
 const r=await op(object,'create_cart',create);assert.equal(r.status,429);assert.equal(r.data.error,'SERVICE_RATE_LIMITED');assert.equal(permits,1);assert.equal(merchantCalls,0);assert.equal((await storage.get('session')).phase,'READY');
});
test('missing or unavailable global limiter never grants an implicit merchant permit',async()=>{
 for(const settings of [env,{...env,SESSION_STATE:{idFromName:x=>x,get:()=>({fetch:async()=>{throw Error('failure');}})}}]){
  let calls=0;const object=new ArmansSessionState({storage:new Storage()},settings,{fetcher:async()=>{calls++;return response(merchantCart());},gates:{gateProducts:gates.gateProducts,gateVariants:gates.gateVariants}});
  const r=await op(object,'create_cart',create);assert.equal(r.status,503);assert.equal(r.data.error,'SERVICE_RATE_UNAVAILABLE');assert.equal(calls,0);
 }
});
