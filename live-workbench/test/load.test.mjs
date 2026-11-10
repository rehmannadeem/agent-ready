import test from 'node:test';
import assert from 'node:assert/strict';
import {runLoad,percentile,throttleKind,retryAfterMs} from '../evals/load.mjs';
const store='karachi-kicks-supportops-lab.myshopify.com',hash='a'.repeat(64),pid='gid://shopify/Product/1',vid='gid://shopify/ProductVariant/1';
const approval={owner_approved:true,worker_preflight_passed:true,seed_verified:true,load_test_approved:true};
const oracle={digest:hash,seed:{store},manifest:{store,seed_sha256:hash,completed_at:'2026-11-10',products:{p001:{phase:'verified'}}},product:()=>({fixture_id:'p001',title:'Runner',shopper_eligible:true,tags:['armans-synthetic','seed-v1']}),productId:()=>pid,variant:()=>({id:vid,tracked:true,quantity:28,inventory_policy:'DENY'})};
function setup(override){
 let now=Date.parse('2026-11-10T18:00:00Z'),issued=0,inflight=0,peak=0;const calls=[],saved=[],privateSaved=[];
 const clock={now:()=>now,sleep:async ms=>{now+=ms;}};
 const normal=name=>name==='search_catalog'?{products:[{id:pid,variants:[{id:vid,availability:{available:true},price:{currency:'USD',amount:7900}}]}]}:name==='create_cart'?{status:'active',currency:'USD',line_items:[{item:{id:vid},quantity:1}],ready_for_handoff:true,order_placed:false,payment_submitted:false,continue_url:'https://'+store+'/cart/PRIVATE_KEY'}:name==='cancel_cart'?{status:'cancellation_requested',ready_for_handoff:false,order_placed:false,payment_submitted:false}:{status:'not_found',line_items:[],ready_for_handoff:false};
 const adapter={createSession:async()=>({sub:'operator_load',sid:'session_'+String(++issued).padStart(8,'0'),store,market:'US',currency:'USD',iat:Math.floor(now/1000),exp:Math.floor(now/1000)+3600}),client:{async callTool(name,args,s){inflight++;peak=Math.max(peak,inflight);calls.push({name,args,sid:s.sid,at:now});now+=10;const value=override?.({name,args,s,index:calls.length,normal})??normal(name);inflight--;return value;}}};
 return{options:{oracle,adapter,approval,clock,saveReport:async r=>{saved.push(structuredClone(r));},saveRecovery:async r=>{privateSaved.push(structuredClone(r));}},calls,saved,privateSaved,peak:()=>peak};
}
test('20 overlapping logical sessions run80 serialized requests, verified cleanup and honest timing metrics',async()=>{
 const s=setup(),r=await runLoad(s.options);assert.equal(r.summary.planned_sessions,20);assert.equal(r.summary.planned_workload_requests,60);assert.equal(r.summary.planned_verification_requests,20);assert.equal(r.summary.passed_sessions,20);assert.equal(r.summary.attempted_requests,80);assert.equal(r.summary.error_rate,0);assert.equal(r.summary.complete,true);assert.deepEqual(r.summary.cleanup_failures,[]);
 assert.equal(s.peak(),1);assert.equal(r.load.actual_peak_api_in_flight,1);assert.equal(r.load.peak_started_unfinished_sessions,20);assert.equal(r.load.peak_confirmed_carts,20);assert.equal(new Set(s.calls.map(c=>c.sid)).size,20);for(let i=1;i<s.calls.length;i++)assert.ok(s.calls[i].at-s.calls[i-1].at>=1100);
 assert.equal(r.latency.client_http.p50_ms,10);assert.equal(r.latency.client_http.p95_ms,10);assert.equal(r.latency.upstream_http,null);assert.doesNotMatch(JSON.stringify(r),/PRIVATE_KEY|session_000000|operator_load|continue_url/);assert.equal(s.privateSaved[0].sessions.length,20);assert.equal(s.privateSaved.at(-1).sessions.every(s=>s.cart_state==='none'),true);
});
test('two throttles stop all scheduling, retain80-request denominator and distinguish application/upstream',async()=>{
 const s=setup(({index})=>index===1?{error:'SERVICE_RATE_LIMITED',retry_after:2}:index===2?{error:'RATE_LIMITED',http_status:429,retry_after:4}:null),r=await runLoad(s.options);
 assert.equal(s.calls.length,2);assert.equal(s.calls[1].at-s.calls[0].at,2010);assert.equal(r.stop_reason,'SUSTAINED_THROTTLE');assert.equal(r.summary.attempted_requests,2);assert.equal(r.summary.not_run_requests,78);assert.equal(r.summary.not_run_sessions,18);assert.equal(r.summary.failed_sessions,2);assert.equal(r.summary.complete,false);assert.equal(r.throttles.application,1);assert.equal(r.throttles.upstream,1);assert.equal(r.summary.error_rate,1);
});
test('stop during create retains known carts for operator cleanup and never sends a cancel after stop',async()=>{
 const s=setup(({index})=>index===23||index===24?{error:'RATE_LIMITED',http_status:429}:null),r=await runLoad(s.options);
 assert.equal(s.calls.length,24);assert.equal(r.stop_reason,'SUSTAINED_THROTTLE');assert.equal(s.calls.some(c=>c.name==='cancel_cart'),false);assert.equal(r.summary.cleanup_failures.length,2);assert.equal(r.summary.not_run_requests,56);assert.equal(s.privateSaved.at(-1).sessions.filter(s=>s.cart_state==='confirmed').length,2);
});
test('unknown mutation stops immediately without retry and checkpoints private recovery context',async()=>{
 const s=setup(({name})=>name==='create_cart'?{error:'TOOL_OUTCOME_UNKNOWN',ambiguous:true}:null),r=await runLoad(s.options);
 assert.equal(s.calls.length,21);assert.equal(r.stop_reason,'MUTATION_OUTCOME_UNKNOWN');assert.equal(r.summary.cleanup_failures[0].cart_state,'creation_unknown');assert.equal(s.privateSaved.at(-1).sessions[0].cart_state,'creation_unknown');assert.equal(r.summary.passed_sessions,0);
});
test('cancel acknowledgement alone cannot become a pass; failed absence check stays visible',async()=>{
 const s=setup(({name,index})=>name==='get_cart'&&index===61?{status:'active',line_items:[{item:{id:vid},quantity:1}],ready_for_handoff:true}:null),r=await runLoad(s.options);
 assert.equal(r.summary.passed_sessions,19);assert.equal(r.summary.failed_sessions,1);assert.equal(r.summary.cleanup_failures.length,1);assert.equal(r.summary.business_failures,1);assert.equal(r.summary.error_rate,0);assert.equal(r.summary.session_pass_rate,19/20);
});
test('wrong store, seed, approval, interval or reused session stops before API dispatch',async()=>{
 for(const change of [{oracle:{...oracle,manifest:{...oracle.manifest,store:'wrong.myshopify.com'}}},{approval:{...approval,load_test_approved:false}},{dispatchIntervalMs:1000}]){const s=setup();await assert.rejects(()=>runLoad({...s.options,...change}));assert.equal(s.calls.length,0);}
 const s=setup();const create=s.options.adapter.createSession;let first;s.options.adapter.createSession=async()=>first||(first=await create());await assert.rejects(()=>runLoad(s.options),/LOAD_SESSION_ISOLATION_FAILED/);assert.equal(s.calls.length,0);
});
test('search must observe exact eligible seeded variant; unrelated results cannot create a cart',async()=>{
 const s=setup(({name})=>name==='search_catalog'?{products:[]}:null),r=await runLoad(s.options);assert.equal(s.calls.length,20);assert.equal(r.summary.failed_sessions,20);assert.equal(r.summary.passed_sessions,0);assert.equal(r.summary.not_run_requests,60);assert.equal(r.summary.cleanup_failures.length,0);
});
test('persistence failure before dispatch causes no merchant request and exposes interruption',async()=>{
 const s=setup();let saves=0;s.options.saveRecovery=async()=>{if(++saves===2)throw Error('disk full');};const r=await runLoad(s.options);assert.equal(s.calls.length,0);assert.equal(r.summary.attempted_requests,0);assert.equal(r.stop_reason,'HARNESS_INTERRUPTED_OPERATOR_REVIEW_REQUIRED');
});
test('percentiles and exposed Retry-After are explicit; unknown429 source stays unknown',()=>{
 assert.equal(percentile([],0.95),null);assert.equal(percentile([40,10,30,20],.5),20);assert.equal(percentile([40,10,30,20],.95),40);assert.equal(throttleKind({http_status:429,error:'OTHER'}),'unknown');assert.equal(retryAfterMs({retry_after:3},0),3000);assert.equal(retryAfterMs({},0),null);
});
