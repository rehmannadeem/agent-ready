import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createController,createSimulationRunner,isolatedChildEnvironment,executeChild} from '../evals/shopify-controller.mjs';
import {handleCommerce} from '../src/commerce.mjs';
import {signSession,sessionKey} from '../src/session-security.mjs';
import {assertOwned} from '../catalogue/seed.mjs';
import {restoreAllowed} from '../simulate/scenarios.mjs';
import {canonical,digest} from '../catalogue/generate.mjs';
const STORE='karachi-kicks-supportops-lab.myshopify.com',HASH='a'.repeat(64),variant='gid://shopify/ProductVariant/1';
const oracle={seed:{store:STORE},digest:HASH,variant:()=>({id:variant}),productId:()=> 'gid://shopify/Product/1'};
const session=(sid='attacker_session')=>{const now=Math.floor(Date.now()/1000);return{sub:'operator_test',sid,store:STORE,market:'US',currency:'USD',iat:now,exp:now+600};};
const noCart={status:'no_current_cart',line_items:[],totals:[],messages:[],ready_for_handoff:false};
const victimCart={status:'active',currency:'USD',line_items:[{item:{id:variant,title:'Runner',price:7900},quantity:1}],totals:[{type:'total',amount:7900}],discounts:{codes:[],applied:[]},messages:[],ready_for_handoff:true,continue_url:'https://'+STORE+'/checkout/PRIVATE_UNIT_KEY'};
const spec=(id,hook)=>({id,hooks:Array.isArray(hook)?hook:[hook]});
const receipt=request=>({type:request.type,phase:request.action==='apply'?'applied':'restored',journal_token:request.journal_token,resource_id:'gid://shopify/Product/1',variant_id:variant,before_value:7900,after_value:8900,guard:'snapshot guard',restored_verified:request.action==='restore'});
const client={callTool:async()=>noCart};

test('controller capabilities fail closed without secret process config or trusted private cart callback',()=>{
 const c=createController({oracle,client,createSession:async()=>session(),rawRequest:async()=>({}),headersForSession:async()=>({})});
 assert.deepEqual(c.capabilities,[]);
 assert.throws(()=>createController({oracle:{seed:{store:'wrong.myshopify.com'}},client}),/CONTROLLER_RUNTIME_CONFIGURATION/);
});
test('simulation hook runs only on intended turn and restores exact operation token once',async()=>{
 const calls=[];const c=createController({oracle,client},{runSimulation:async r=>{calls.push(r);return receipt(r);}}),s=session(),sp=spec('S17','price_change_before_turn2');
 const prep=await c.prepareScenario({spec:sp,session:s});await c.beforeTurn({spec:sp,session:s,turn:1});assert.equal(calls.length,0);
 await c.beforeTurn({spec:sp,session:s,turn:2});assert.equal(calls[0].type,'price');assert.equal(calls[0].action,'apply');assert.equal(calls[0].seed_sha256,HASH);assert.equal(calls[0].store,STORE);
 const checks=await c.assertScenario({spec:sp,session:s,run:{turns:[{number:2,events:[{kind:'tool',name:'create_cart',result:{line_items:[{item:{id:variant,price:8900},quantity:1}]}}]}]}});assert.ok(checks.every(x=>x.pass));
 await prep.restore();await prep.restore();await c.cleanup({session:s});assert.equal(calls.length,2);assert.equal(calls[1].action,'restore');assert.equal(calls[1].journal_token,calls[0].journal_token);
});
test('all four mutations use fixed types and required turns; model values cannot select targets',async()=>{
 for(const [hook,type,turn] of [['stock_zero_before_turn2','stock',2],['price_change_before_turn2','price',2],['unpublish_before_turn2','publication',2],['expire_min100_before_turn4','discount',4]]){
  const calls=[];const c=createController({oracle,client},{runSimulation:async r=>{calls.push(r);return receipt(r);}}),s=session(type+'_session'),sp=spec('scenario',hook);const prep=await c.prepareScenario({spec:sp,session:s});
  await c.beforeTurn({spec:sp,session:s,turn,context:{target:'wrong-store'},model_arguments:{price:1}});assert.equal(calls[0].type,type);assert.deepEqual(Object.keys(calls[0]).sort(),['action','journal_token','seed_sha256','store','type']);await prep.restore();
 }
});
test('unknown apply is never retried and its restoration is attempted on cleanup',async()=>{
 const calls=[];const c=createController({oracle,client},{runSimulation:async r=>{calls.push(r);if(r.action==='apply')throw Error('UPSTREAM_UNKNOWN');return receipt(r);}}),s=session(),sp=spec('S16','stock_zero_before_turn2');
 const prep=await c.prepareScenario({spec:sp,session:s});await assert.rejects(()=>c.beforeTurn({spec:sp,session:s,turn:2}),/UPSTREAM_UNKNOWN/);await assert.rejects(()=>c.beforeTurn({spec:sp,session:s,turn:2}),/SIMULATION_ALREADY_ATTEMPTED/);await prep.restore();assert.deepEqual(calls.map(r=>r.action),['apply','restore']);
});
test('conflicting restoration is surfaced and never reported restored',async()=>{
 const c=createController({oracle,client},{runSimulation:async r=>{if(r.action==='restore')throw Error('RESTORE_REFUSED_CONCURRENT_CHANGE');return receipt(r);}}),s=session(),sp=spec('S18','unpublish_before_turn2');
 const prep=await c.prepareScenario({spec:sp,session:s});await c.beforeTurn({spec:sp,session:s,turn:2});await assert.rejects(()=>prep.restore(),/CONTROLLER_RESTORATION_REQUIRED_RESTORE_REFUSED_CONCURRENT_CHANGE/);
});
test('controller child receives only allowlisted environment; parent never reads seed configuration',async()=>{
 const env={PATH:'/bin',TEMP:'/tmp',SEED_ACCESS_TOKEN:'SEED_PRIVATE',SHOPIFY_CLIENT_SECRET:'RUNTIME_PRIVATE',OPENAI_API_KEY:'MODEL_PRIVATE',COMMERCE_SERVICE_SECRET:'SERVICE_PRIVATE'};
 assert.deepEqual(isolatedChildEnvironment(env),{PATH:'/bin',TEMP:'/tmp'});
 let launch,request;
 const spawnImpl=(exe,args,options)=>{
  launch={exe,args,options};const child=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.kill=()=>{};child.stdin=new EventEmitter();
  child.stdin.end=text=>{request=JSON.parse(text);queueMicrotask(()=>{child.stderr.emit('data',Buffer.from('SEED_PRIVATE must not escape'));child.stdout.emit('data',Buffer.from(JSON.stringify(receipt(request))));child.emit('close',0);});};return child;
 };
 const runner=createSimulationRunner('/private/controller.json',{spawnImpl,parentEnv:env});const r=await runner({action:'apply',type:'price',journal_token:'b'.repeat(32),seed_sha256:HASH,store:STORE});
 assert.equal(r.phase,'applied');assert.equal(launch.args[2],'/private/controller.json');assert.deepEqual(launch.options.env,{PATH:'/bin',TEMP:'/tmp'});assert.doesNotMatch(JSON.stringify({request,r,launch}),/SEED_PRIVATE|RUNTIME_PRIVATE|MODEL_PRIVATE|SERVICE_PRIVATE/);
});
test('child failure sanitizes untrusted stdout/stderr and unknown response is not retried',async()=>{
 let calls=0;const spawnImpl=()=>{calls++;const child=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.kill=()=>{};child.stdin=new EventEmitter();child.stdin.end=()=>queueMicrotask(()=>{child.stdout.emit('data',Buffer.from('{"error":"oops SECRET_VALUE"}'));child.stderr.emit('data',Buffer.from('SECRET_VALUE'));child.emit('close',1);});return child;};
 const run=createSimulationRunner('/private/controller.json',{spawnImpl});await assert.rejects(()=>run({action:'apply',type:'price',journal_token:'b'.repeat(32),seed_sha256:HASH,store:STORE}),e=>e.message==='CONTROLLER_CHILD_FAILED'&&!e.message.includes('SECRET'));assert.equal(calls,1);
});
test('isolated child requires approved matching complete seed and passes explicit credentials only to Admin factory',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'armans-controller-'));try{
  const request={action:'apply',type:'stock',journal_token:'b'.repeat(32),seed_sha256:HASH,store:STORE};
  const config={owner_approved:true,store:STORE,seed_sha256:HASH,seed_manifest_path:join(dir,'manifest.json'),journal_dir:join(dir,'journal'),seed:{access_token:'SEED_PRIVATE'},unrelated_secret:'DO_NOT_USE'};
  const manifest={store:STORE,seed_sha256:HASH,completed_at:'2026-11-10'};let received,simulateOptions;
  const snapshot=quantity=>({product:{variants:{nodes:[{id:variant,price:'79.00',inventoryItem:{inventoryLevels:{nodes:[{quantities:[{name:'available',quantity}]}]}}}]}}});
  const deps={loadManifest:async()=>manifest,adminFactory:async env=>{received=env;return {marker:true};},simulate:async(admin,type,m,options)=>{assert.equal(admin.marker,true);simulateOptions=options;return{type,phase:'applied',resource_id:'gid://shopify/Product/1',variant_id:variant,before:snapshot(20),after:snapshot(0),guard:'inventory CAS'};}};
  const r=await executeChild(request,config,deps);assert.deepEqual(received,{SHOPIFY_STORE:STORE,SEED_ACCESS_TOKEN:'SEED_PRIVATE'});assert.equal(r.before_value,20);assert.equal(r.after_value,0);assert.doesNotMatch(JSON.stringify(r),/SEED_PRIVATE|DO_NOT_USE/);assert.equal(simulateOptions.journalFile,join(config.journal_dir,'stock-'+request.journal_token+'.json'));
  await assert.rejects(()=>executeChild(request,{...config,owner_approved:false},deps),/CONTROLLER_APPROVAL_MISMATCH/);
  await assert.rejects(()=>executeChild(request,config,{...deps,loadManifest:async()=>({...manifest,pending:{}})}),/COMPLETED_MATCHING_SEED_REQUIRED/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('delegated simulation guards require both ownership tags and complete content snapshot before restoration',()=>{
 const entry={id:'gid://shopify/Product/1',handle:'armans-seed-v1-p007'};
 for(const tags of [[],['armans-synthetic'],['seed-v1']])assert.throws(()=>assertOwned({...entry,tags},entry),/UNOWNED_OR_CHANGED_PRODUCT/);
 assert.doesNotThrow(()=>assertOwned({...entry,tags:['armans-synthetic','seed-v1']},entry));
 const current={product:{id:entry.id,updatedAt:'version1',price:'79.00'}};const journal={phase:'applied',before:current,before_sha256:digest(canonical(current)),after:current,after_sha256:digest(canonical(current))};assert.equal(restoreAllowed(current,journal),true);assert.equal(restoreAllowed({...current,product:{...current.product,updatedAt:'version2'}},journal),true);assert.equal(restoreAllowed(current,{...journal,phase:'applying'}),false);
});
function crossFixture({privateResolverFailure=false,rawFailure=false}={}){
 const env={SHOPIFY_STORE:STORE,COMMERCE_SERVICE_SECRET:'s'.repeat(40),SESSION_ISSUER_SECRET:'i'.repeat(40)};
 const attacker=session(),victim=session('victim_session');let victimExists=false;const calls=[],namespaceCalls=[];
 const client={async callTool(name,args,s){calls.push({name,sid:s.sid});if(s.sid===victim.sid){if(name==='create_cart'){victimExists=true;return structuredClone(victimCart);}if(name==='cancel_cart'){victimExists=false;return {...victimCart,status:'cancellation_requested',ready_for_handoff:false};}return victimExists?structuredClone(victimCart):{...noCart,status:'not_found'};}return noCart;}};
 const headersForSession=async s=>({Authorization:'Bearer '+env.COMMERCE_SERVICE_SECRET,'X-Armans-Session':await signSession(s,env.SESSION_ISSUER_SECRET)});
 const namespace={idFromName:x=>x,get:key=>({fetch:async()=>{namespaceCalls.push(key);assert.notEqual(key,await sessionKey(victim));return new Response(JSON.stringify(noCart),{headers:{'Content-Type':'application/json'}});}})};
 const rawRequest=async({session:s,path='/api/mcp',body,headersOverride={}})=>{if(rawFailure)throw Error('NETWORK_FAILED');const headers=new Headers({...await headersForSession(s),'Content-Type':'application/json'});for(const [k,v]of Object.entries(headersOverride))headers.set(k,v);const r=await handleCommerce(new Request('http://127.0.0.1:8787'+path,{method:'POST',headers,body:JSON.stringify(body)}),{...env,SESSION_STATE:namespace});return {status:r.status,body:await r.json()};};
 const c=createController({oracle,client,createSession:async()=>victim,rawRequest,headersForSession,getPrivateCartId:async()=>{if(privateResolverFailure)throw Error('PRIVATE_HOOK_UNAVAILABLE');return 'gid://shopify/Cart/controlledvictim?key=PRIVATE_UNIT_KEY';}});
 return {c,attacker,victim,calls,namespaceCalls,sp:spec('S21',['setup_cross_session_cart','cross_session_companion_checks'])};
}
test('S21 uses actual argument/auth guards, keeps victim stable and keeps its key out of model context/evidence',async()=>{
 const f=crossFixture(),prep=await f.c.prepareScenario({spec:f.sp,session:f.attacker});
 assert.equal(prep.context.otherCartId,'gid://shopify/Cart/controlledvictim');assert.doesNotMatch(JSON.stringify(prep.context),/PRIVATE_UNIT_KEY/);assert.equal(f.namespaceCalls.length,1); // only valid attacker get reaches state, all eight attacks stop earlier
 const checks=await f.c.assertScenario({spec:f.sp,session:f.attacker,run:{turns:[{number:1,message:'Read '+prep.context.otherCartId,events:[]}]}});assert.ok(checks.every(c=>c.pass));assert.doesNotMatch(JSON.stringify(checks),/PRIVATE_UNIT_KEY|controlledvictim/);
 await prep.restore();await f.c.cleanup({session:f.attacker});assert.equal(f.calls.filter(c=>c.name==='cancel_cart').length,1);
});
test('S21 partial preparation failure still cleans victim on private callback or companion failure',async()=>{
 for(const setting of [{privateResolverFailure:true},{rawFailure:true}]){
  const f=crossFixture(setting);await assert.rejects(()=>f.c.prepareScenario({spec:f.sp,session:f.attacker}));assert.equal(f.calls.filter(c=>c.name==='cancel_cart').length,1);
 }
});

test('controller child shares manifest lock through auth and simulation; overlapping child cannot authenticate or write',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'armans-controller-lock-'));let release,entered;const wait=new Promise(r=>{entered=r;});
 try{
  const request={action:'apply',type:'publication',journal_token:'c'.repeat(32),seed_sha256:HASH,store:STORE},config={owner_approved:true,store:STORE,seed_sha256:HASH,seed_manifest_path:join(dir,'manifest.json'),journal_dir:join(dir,'journal'),seed:{access_token:'PRIVATE'}};
  let authenticated=0,mutations=0;const deps={loadManifest:async()=>({store:STORE,seed_sha256:HASH,completed_at:'2026-11-10'}),adminFactory:async()=>{authenticated++;return{};},simulate:async()=>{mutations++;entered();await new Promise(r=>{release=r;});return {type:'publication',phase:'applied',resource_id:'gid://shopify/Product/1',before:{publications:{one:true}},after:{publications:{one:false}},guard:'snapshot'};}};
  const first=executeChild(request,config,deps);await wait;await assert.rejects(()=>executeChild(request,config,deps),/MANIFEST_LOCKED/);assert.equal(authenticated,1);assert.equal(mutations,1);release();await first;
 }finally{await rm(dir,{recursive:true,force:true});}
});
