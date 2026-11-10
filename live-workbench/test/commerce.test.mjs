import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {callCommerce,handleCommerce,safeLink,TOOLS,validateTool,CommerceError} from '../src/commerce.mjs';
import {signSession} from '../src/session-security.mjs';
const env={SHOPIFY_STORE:'karachi-kicks-supportops-lab.myshopify.com',UCP_AGENT_PROFILE_URL:'https://demo.example/agent-profile.json',COMMERCE_SERVICE_SECRET:'s'.repeat(40),SESSION_ISSUER_SECRET:'i'.repeat(40)};
const context={sub:'principal_one',sid:'session_one',store:env.SHOPIFY_STORE,market:'US',currency:'USD'};
const v='gid://shopify/ProductVariant/1',v2='gid://shopify/ProductVariant/2',pid='gid://shopify/Product/1';
const privateId='gid://shopify/Cart/test?key=private';
const cart={id:privateId,currency:'USD',line_items:[{id:'line1',item:{id:v,title:'Runner',price:7900},quantity:1,totals:[]}],totals:[{type:'total',amount:7900}],messages:[],discounts:{codes:['KEEP'],applied:[]},continue_url:`https://${env.SHOPIFY_STORE}/cart/c/test?key=private`};
const response=(data,error=false)=>new Response(JSON.stringify({result:{structuredContent:data,isError:error}}),{headers:{'Content-Type':'application/json'}});
const gates={gateProducts:async products=>products,gateVariants:async()=>true,consumeRate:async()=>{}};
const call=(name,args,fetcher=async()=>response(cart),ctx={})=>callCommerce(name,args,env,fetcher,{...context,...ctx},gates);
const create={line_items:[{variant_id:v,quantity:1}]};
const product={id:pid,title:'Runner',description:{html:'<b>Real text</b>'},variants:[{id:v,price:{amount:7900,currency:'USD'},availability:{available:true}}]};
async function request(body,path='/api/mcp',extra={}){const now=Math.floor(Date.now()/1000);return new Request(`https://demo.example${path}`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${env.COMMERCE_SERVICE_SECRET}`,'X-Armans-Session':await signSession({...context,iat:now,exp:now+600},env.SESSION_ISSUER_SECRET),...extra},body:JSON.stringify(body)});}

test('seven tools match saved merchant names and expose no cart ID or payment tool',()=>{
 const expected=['search_catalog','lookup_catalog','get_product','create_cart','get_cart','update_cart','cancel_cart'];
 assert.deepEqual(TOOLS.map(t=>t.name),expected);
 const saved=JSON.parse(readFileSync(new URL('../sdd/evidence/shopify-mcp-tools-2026-11-10.json',import.meta.url)));
 for(const name of expected)assert.ok(saved.selected_tools.find(t=>t.name===name));
 for(const name of ['get_cart','cancel_cart','create_cart','update_cart'])assert.equal(TOOLS.find(t=>t.name===name).inputSchema.properties.id,undefined);
});
test('public agent profile is cacheable, including body-free HEAD',async()=>{
 const r=await handleCommerce(new Request('https://demo.example/agent-profile.json'),env);assert.equal(r.status,200);assert.equal(r.headers.get('Cache-Control'),'public, max-age=300');assert.equal((await r.json()).ucp.version,'2026-08-25');
 assert.equal(await(await handleCommerce(new Request('https://demo.example/agent-profile.json',{method:'HEAD'}),env)).text(),'');
});
test('all protected routes and methods reject missing auth before parsing or dispatch',async()=>{
 for(const path of ['/api/mcp','/api/shop'])for(const method of ['GET','POST','OPTIONS','DELETE']){
  const r=await handleCommerce(new Request(`https://demo.example${path}`,{method,...(method==='POST'?{body:'not json'}:{})}),env,()=>{throw Error('must not fetch');});assert.equal(r.status,401);
 }
});
test('MCP list/initialize require both credentials; valid trusted request receives seven tools',async()=>{
 const r=await handleCommerce(await request({jsonrpc:'2.0',id:1,method:'tools/list'}),env);assert.equal((await r.json()).result.tools.length,7);
 const init=await handleCommerce(await request({jsonrpc:'2.0',id:1,method:'initialize'}),env);assert.equal((await init.json()).result.serverInfo.version,'0.3.0');
 const invalid=await handleCommerce(await request({jsonrpc:'2.0',id:1,method:'tools/list'},'/api/mcp',{'X-Armans-Session':''}),env);assert.equal(invalid.status,401);
});
test('authorized cross-origin, malformed bodies and absent state fail closed',async()=>{
 assert.equal((await handleCommerce(await request({},'/api/shop',{Origin:'https://evil.test'}),env)).status,403);
 for(const body of [null,5,[],'text'])assert.equal((await handleCommerce(await request(body),env)).status,400);
 const r=await handleCommerce(await request({name:'get_cart',arguments:{}},'/api/shop'),env);assert.equal(r.status,503);assert.equal((await r.json()).error,'STATE_UNAVAILABLE');
});
test('invalid operations, caller cart IDs, zero/negative/fractional quantity never reach merchant',async()=>{
 let calls=0;const f=async()=>{calls++;return response(cart);};
 for(const [name,args] of [['complete_checkout',{}],['get_cart',{id:privateId}],['create_cart',{...create,payment:{}}],['create_cart',{line_items:[{variant_id:v,quantity:0}]}],['create_cart',{line_items:[{variant_id:v,quantity:1.5}]}],['search_catalog',{query:'x',url:'http://127.0.0.1'}],['search_catalog',{query:'x',limit:11}]])await assert.rejects(()=>call(name,args,f));
 assert.equal(calls,0);
});
test('duplicate lines aggregate before per-variant quantity maximum',async()=>{
 assert.deepEqual(validateTool('create_cart',{line_items:[{variant_id:v,quantity:4},{variant_id:v,quantity:6}]}).line_items,[{variant_id:v,quantity:10}]);
 await assert.rejects(()=>call('create_cart',{line_items:[{variant_id:v,quantity:6},{variant_id:v,quantity:5}]}),e=>e.code==='INVALID_INPUT');
});
test('search sends real US/USD schema, fixed merchant endpoint, ten maximum and no Admin credential',async()=>{
 let request;const d=await callCommerce('search_catalog',{query:'Runner',max_price:8000,limit:2},{...env,SHOPIFY_CLIENT_SECRET:'PRIVATE_ADMIN'},async(url,init)=>{request={url,...init};return response({products:Array.from({length:12},()=>product),pagination:{has_next_page:true,cursor:'opaque_next'},messages:[]});},context,gates);
 assert.equal(d.products.length,2);assert.equal(d.next_cursor,'opaque_next');assert.equal(request.url,`https://${env.SHOPIFY_STORE}/api/ucp/mcp`);assert.equal(request.redirect,'manual');assert.doesNotMatch(JSON.stringify(request),/PRIVATE_ADMIN/);
 const c=JSON.parse(request.body).params.arguments.catalog;assert.deepEqual(c.context,{address_country:'US',currency:'USD',language:'en'});assert.deepEqual(c.filters,{available:true,price:{max:8000}});assert.equal(c.pagination.limit,2);
});
test('lookup preserves input correlation and product detail preserves option selection',async()=>{
 const p={...product,variants:[{...product.variants[0],inputs:[{id:v,match:'exact'}]}],selected:[{name:'Size',label:'42'}],options:[{name:'Size',values:[{label:'42',available:true}]}]};let input;
 const lookup=await call('lookup_catalog',{ids:[v]},async(_,init)=>{input=JSON.parse(init.body).params.arguments;return response({products:[p]});});assert.deepEqual(input.catalog.ids,[v]);assert.deepEqual(lookup.products[0].variants[0].inputs,[{id:v,match:'exact'}]);
 const detail=await call('get_product',{id:pid,selected:p.selected},async(_,init)=>{input=JSON.parse(init.body).params.arguments;return response({product:p});});assert.deepEqual(input.catalog.selected,p.selected);assert.deepEqual(detail.product.options,p.options);
});
test('publication gate runs on search, lookup and detail before exposure',async()=>{
 const denied={...gates,gateProducts:async()=>[]};
 for(const name of ['search_catalog','lookup_catalog','get_product']){
  const args=name==='search_catalog'?{query:'x'}:name==='lookup_catalog'?{ids:[pid]}:{id:pid};
  const r=await callCommerce(name,args,env,async()=>response(name==='get_product'?{product}:{products:[product]}),context,denied);
  if(name==='get_product')assert.equal(r.product,null);else assert.deepEqual(r.products,[]);
 }
});
test('variant eligibility denial occurs before mutation request',async()=>{
 let calls=0;await assert.rejects(()=>callCommerce('create_cart',create,env,async()=>{calls++;return response(cart);},context,{...gates,gateVariants:async()=>{throw new CommerceError('PRODUCT_UNAVAILABLE','Unavailable',403);}}));assert.equal(calls,0);
});
test('full-state update preserves omitted discount codes and supported fresh state; explicit [] clears',async()=>{
 const snapshot={...cart,buyer:{consent:{'dev.example.marketing':{granted:false,source:'platform'}}},context:{intent:'running'},attribution:{utm_source:'test'},fulfillment:{methods:[]},declared_fields:[{key:'note',value:'keep'}]};
 let sent;const f=async(_,init)=>{sent=JSON.parse(init.body).params.arguments;return response({...cart,line_items:[...cart.line_items,{item:{id:v2},quantity:2}]});};
 await call('update_cart',{line_items:[{variant_id:v,quantity:1},{variant_id:v2,quantity:2}]},f,{cartId:privateId,snapshot});
 assert.equal(sent.id,privateId);assert.deepEqual(sent.cart.discounts,{codes:['KEEP']});assert.equal(sent.cart.line_items.length,2);assert.equal(sent.cart.line_items[0].id,'line1');assert.deepEqual(sent.cart.buyer,snapshot.buyer);assert.deepEqual(sent.cart.declared_fields,snapshot.declared_fields);assert.equal(sent.cart.context.intent,'running');assert.equal(sent.cart.context.address_country,'US');
 await call('update_cart',{discount_codes:[]},f,{cartId:privateId,snapshot});assert.deepEqual(sent.cart.discounts.codes,[]);assert.equal(sent.cart.line_items.length,1);
 await call('update_cart',{line_items:[]},f,{cartId:privateId,snapshot});assert.deepEqual(sent.cart.line_items,[]);
});
test('cart totals/messages preserve merchant order; no buyer details in JSON projection',async()=>{
 const totals=[{type:'discount',amount:-200,display_text:'Offer'},{type:'total',amount:7700}],msgs=[{type:'warning',presentation:'disclosure',content:'Disclosure'}];
 const d=await call('create_cart',create,async()=>response({...cart,totals,messages:msgs,buyer:{email:'PRIVATE_EMAIL'}}));assert.deepEqual(d.totals,totals);assert.deepEqual(d.messages,msgs);assert.equal(d.ready_for_handoff,true);assert.doesNotMatch(JSON.stringify(d),/PRIVATE_EMAIL/);
});
test('stock warnings, wrong currency and external handoff URLs cannot claim readiness',async()=>{
 for(const change of [{line_items:[],messages:[{type:'warning',code:'merchandise_out_of_stock'}]},{currency:'EUR'},{continue_url:'https://attacker.test/checkout'}]){
  const d=await call('create_cart',create,async()=>response({...cart,...change}));assert.equal(d.ready_for_handoff,false);assert.equal(d.order_placed,false);assert.equal(d.payment_submitted,false);
 }
 assert.equal(safeLink('https://attacker.test/',env),null);assert.equal(safeLink(`https://${env.SHOPIFY_STORE}:8443/`,env),null);
});
test('live structured cart_not_found is preserved only for get_cart',async()=>{
 const missing={ucp:{version:'2026-08-25',status:'error'},messages:[{type:'error',code:'cart_not_found',content:'The requested cart does not exist',severity:'unrecoverable'}],continue_url:`https://${env.SHOPIFY_STORE}/`};
 const d=await call('get_cart',{},async()=>response(missing,true),{cartId:privateId});assert.equal(d.status,'not_found');assert.equal(d.continue_url,null);assert.equal(d.ready_for_handoff,false);assert.equal(d.id,null);assert.deepEqual(d.line_items,[]);
 await assert.rejects(()=>call('create_cart',create,async()=>response(missing,true)),e=>e.code==='COMMERCE_REJECTED');
 for(const bad of [{...missing,ucp:{}},{...missing,messages:[{type:'error',code:'arbitrary',severity:'unrecoverable'}]}])await assert.rejects(()=>call('get_cart',{},async()=>response(bad,true),{cartId:privateId}),e=>e.code==='COMMERCE_REJECTED');
});
test('documented nested missing cart accepted; malformed and mismatched carts rejected',async()=>{
 const d=await call('get_cart',{},async()=>response({cart:{ucp:{version:'2026-08-25'},messages:[{type:'error',code:'not_found',severity:'unrecoverable'}]}}),{cartId:privateId});assert.equal(d.status,'not_found');
 for(const malformed of [{cart:{}},{cart:{messages:[]}},{...cart,id:'gid://shopify/Cart/someoneelse'}])await assert.rejects(()=>call('get_cart',{},async()=>response(malformed),{cartId:privateId}),e=>e.code==='INVALID_RESPONSE');
});
test('cancel returns acknowledgement and suppresses handoff, not proof of deletion',async()=>{
 const d=await call('cancel_cart',{},undefined,{cartId:privateId});assert.equal(d.status,'cancellation_requested');assert.equal(d.ready_for_handoff,false);assert.equal(d.continue_url,null);
});
test('merchant cart with duplicate quantities over policy is blocked from handoff',async()=>{
 const over={...cart,line_items:[{item:{id:v},quantity:6},{item:{id:v},quantity:5}]};
 const d=await call('get_cart',{},async()=>response(over),{cartId:privateId});assert.equal(d.ready_for_handoff,false);assert.equal(d.continue_url,null);assert.ok(d.messages.some(m=>m.code==='quantity_limit_exceeded'));
});
test('merchant throttling and timeout are not automatically retried',async()=>{
 for(const f of [()=>new Response('',{status:429}),()=>{throw Error('PRIVATE_CONNECTION_STRING');}]){
  let count=0;await assert.rejects(()=>call('create_cart',create,async()=>{count++;return f();}),e=>['RATE_LIMITED','UPSTREAM_UNREACHABLE'].includes(e.code)&&!e.message.includes('PRIVATE'));assert.equal(count,1);
 }
});
