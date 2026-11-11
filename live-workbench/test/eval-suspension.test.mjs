import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRateLimitGuard,createWorkerClient,runSuite,isLiveRateLimit} from '../evals/runner.mjs';
import {BUDGET} from '../evals/budget.mjs';

test('live rate limit latches without timed retry, injected scenario fault does not',async()=>{
 const guard=createRateLimitGuard();let requests=0;
 const client=createWorkerClient({baseUrl:'http://localhost:8787',headersForSession:async()=>({}),beforeRequest:async()=>guard.check(),observeResult:guard.observe,fetcher:async()=>{requests++;return new Response(JSON.stringify({result:{isError:true,structuredContent:{error:'RATE_LIMITED',retry_after_seconds:2249}}}));}});
 const first=await client.callTool('get_cart',{},{});assert.equal(first.retry_after_seconds,2249);
 await assert.rejects(client.callTool('cancel_cart',{},{}),/PROVIDER_RATE_LIMITED/);assert.equal(requests,1);assert.equal(guard.get().automatic_resume,false);
 assert.equal(isLiveRateLimit({error:'RATE_LIMITED',fault_injection:true}),false);
 assert.equal(isLiveRateLimit({http_status:429}),true);
});

for(const phase of ['prepare','tool','cleanup'])test(`suite suspends on ${phase} rate limit, preserves ledger and refuses restart`,async t=>{
 const dir=await mkdtemp(join(tmpdir(),'armans-suspend-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const approval={owner_approved:true,gateway_tariff_verified:true,gateway_balance_confirmed:true,single_call_transport_verified:true,worker_preflight_passed:true,seed_verified:true,max_usd:10,max_iterations:5,model:BUDGET.model,evaluation_run_id:'suspension_test_run',funded_limit_usd:1.9,budget_ledger_path:join(dir,'ledger.json')};
 const guard=createRateLimitGuard();let modelCalls=0,toolCalls=0,cleanups=0,sessions=0;
 const throttle=()=>{guard.observe({error:'RATE_LIMITED',retry_after_seconds:2249});guard.check();};
 const adapter={capabilities:[],getSuspension:guard.get,createSession:async()=>{sessions++;return {sid:'private_owner_session'};},prepareScenario:async()=>{if(phase==='prepare')throttle();return {};},client:{callTool:async()=>{toolCalls++;guard.observe({error:'RATE_LIMITED',retry_after_seconds:2249});return {error:'RATE_LIMITED',retry_after_seconds:2249};}},cleanup:async()=>{cleanups++;if(phase==='cleanup')throttle();}};
 const options={oracle:{digest:'test',seed:{products:[]}},adapter,approval,outputDir:join(dir,'results'),system:'rules',modelTransport:async()=>{modelCalls++;return {usage:{input_tokens:10,output_tokens:10},text:JSON.stringify(phase==='cleanup'?{type:'final',message:'No match'}:{type:'tools',calls:[{name:'search_catalog',arguments:{query:'trail'}},{name:'search_catalog',arguments:{query:'second'}}]})};}};
 const report=await runSuite(options);
 assert.equal(report.runs[0].status,'BLOCKED');assert.equal(report.runs[0].reason,'PROVIDER_RATE_LIMITED');assert.equal(report.runs[0].cleanup_pending,true);assert.equal(report.runs[0].restoration_pending,true);
 assert.equal(report.runs.filter(r=>r.status==='NOT_RUN').length,74);assert.equal(sessions,1);assert.equal(modelCalls,phase==='prepare'?0:1);assert.equal(toolCalls,phase==='tool'?1:0);assert.equal(cleanups,phase==='cleanup'?1:0);assert.equal(report.cost.reserved_unknown_usd,0);
 const saved=JSON.parse(await readFile(join(dir,'results','suspended-session.local.json'),'utf8'));assert.equal(saved.session.sid,'private_owner_session');
 await assert.rejects(runSuite(options),/SUSPENDED_SUITE_OPERATOR_RECOVERY_REQUIRED/);assert.equal(sessions,1);assert.equal(modelCalls,phase==='prepare'?0:1);
});

import {suitePlan,prioritizeRuns} from '../evals/scenarios.mjs';
test('owner safety order runs all twelve critical cases first without omissions or duplication',()=>{
 const original=suitePlan(),ordered=prioritizeRuns(original,['S05','S19','S20','S21']);
 assert.deepEqual(ordered.slice(0,12).map(r=>r.id),['S05','S05','S05','S19','S19','S19','S20','S20','S20','S21','S21','S21']);
 assert.equal(ordered.length,75);assert.equal(new Set(ordered.map(r=>r.id+':'+r.repetition)).size,75);
 assert.equal(original[0].id,'S01');assert.equal(ordered.slice(12).length,63);
 assert.throws(()=>prioritizeRuns(original,['S05','S05']),/INVALID_SCENARIO_PRIORITY/);
 assert.throws(()=>prioritizeRuns(original,['S99']),/INVALID_SCENARIO_PRIORITY/);
});
