import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {AUTHORIZED_SLOTS,CRITICAL_SCENARIOS,CRITICAL_NOT_BEFORE,EVALUATION_DEADLINE,assertScheduledLaunch,resumeEligibility,finalizeDeadline} from '../evals/launch-policy.mjs';
import {suitePlan} from '../evals/scenarios.mjs';
import {summarizeSlots,runSuite} from '../evals/runner.mjs';
import {SessionRegistry} from '../evals/session-registry.mjs';
import {resumeEvaluation} from '../evals/resume-evaluation.mjs';
import {BUDGET} from '../evals/budget.mjs';
const approval=dir=>({owner_approved:true,gateway_tariff_verified:true,gateway_balance_confirmed:true,single_call_transport_verified:true,worker_preflight_passed:true,seed_verified:true,max_usd:10,max_iterations:5,model:BUDGET.model,evaluation_run_id:'continuation_test',funded_limit_usd:1.9,budget_ledger_path:join(dir,'ledger.json')});
async function env(t){const dir=await mkdtemp(join(tmpdir(),'armans-resume-'));t.after(()=>rm(dir,{recursive:true,force:true}));return dir;}
test('exact33 selection has12 critical then21 first repetitions,42 excluded',()=>{
 assert.equal(AUTHORIZED_SLOTS.length,33);assert.deepEqual(AUTHORIZED_SLOTS.slice(0,12).map(r=>r.id),CRITICAL_SCENARIOS.flatMap(id=>[id,id,id]));assert.ok(AUTHORIZED_SLOTS.slice(12).every(r=>r.repetition===1&&!CRITICAL_SCENARIOS.includes(r.id)));assert.equal(summarizeSlots(suitePlan(),AUTHORIZED_SLOTS).out_of_scope,42);
});
test('knownRetryAfter requires full delay plus900seconds; unknown hint fails closed',()=>{
 const s={observed_at:'2026-11-11T15:00:00Z',retry_after_seconds:3600};assert.equal(resumeEligibility(s,{now:Date.parse('2026-11-11T16:14:59Z')}).allowed,false);assert.equal(resumeEligibility(s,{now:Date.parse('2026-11-11T16:15:00Z')}).allowed,true);assert.equal(resumeEligibility({...s,retry_after_seconds:undefined}).reason,'RETRY_AFTER_UNKNOWN_OPERATOR_REQUIRED');assert.equal(resumeEligibility(s,{now:Date.parse(EVALUATION_DEADLINE)}).reason,'EVALUATION_DEADLINE_REACHED');
});
test('deadline onlylabels anonymouslimit whenthat isknownblocker',()=>{
 const a={runs:suitePlan(),suspension:{reason:'PROVIDER_RATE_LIMITED'}},b={runs:suitePlan()};for(const r of [a,b])finalizeDeadline(r,{now:Date.parse(EVALUATION_DEADLINE)});assert.equal(a.runs.filter(r=>r.reason==='not run: anonymous access limit').length,33);assert.equal(b.runs.filter(r=>r.reason==='not run: evaluation deadline').length,33);assert.ok(a.runs.every(r=>r.status==='NOT_RUN'));
});
test('registry preserves owner andvictim andunknown mutation acrossrestart',async t=>{
 const dir=await env(t),path=join(dir,'sessions.json'),r=await new SessionRegistry(path,'run').load();await r.add({sid:'owner'},'S21:1');await r.add({sid:'victim'},'S21:1');await r.before({sid:'victim'},'create_cart');const reopened=await new SessionRegistry(path,'run').load();assert.equal(reopened.getCase('S21:1').sessions.length,2);assert.equal(reopened.getCase('S21:1').sessions[1].mutation_outcome_unknown,true);await assert.rejects(reopened.before({sid:'victim'},'cancel_cart'),/AMBIGUOUS/);
 await reopened.after({sid:'victim'},'create_cart',{error:'RATE_LIMITED',ambiguous:false});assert.equal(reopened.getCase('S21:1').sessions[1].mutation_outcome_unknown,false);
});
test('resume beforeeligible time makeszero adapter calls andpreservesevidence',async t=>{
 const dir=await env(t),a=approval(dir),report={evaluation_run_id:a.evaluation_run_id,runs:suitePlan(),suspension:{reason:'PROVIDER_RATE_LIMITED',observed_at:'2026-11-11T15:00:00Z',retry_after_seconds:3600}};await writeFile(join(dir,'results.json'),JSON.stringify(report));let calls=0;const result=await resumeEvaluation({outputDir:dir,approval:a,now:()=>Date.parse('2026-11-11T16:00:00Z'),createAdapter:async()=>{calls++;}});assert.equal(result.status,'WAIT');assert.equal(calls,0);assert.deepEqual(JSON.parse(await readFile(join(dir,'results.json'),'utf8')),report);
});
test('deadline before nextcase keepsall untouched NOT_RUN without session/model dispatch',async t=>{
 const dir=await env(t);let calls=0;const report=await runSuite({oracle:{digest:'test',seed:{products:[]}},approval:approval(dir),outputDir:dir,slots:AUTHORIZED_SLOTS,now:()=>Date.parse(EVALUATION_DEADLINE),adapter:{client:{callTool:async()=>{}},createSession:async()=>{calls++;},assertRequestWindow:()=>{throw Error('EVALUATION_DEADLINE_REACHED');}},modelTransport:async()=>{calls++;}});assert.equal(calls,0);assert.equal(report.selected_summary.not_run,33);assert.equal(report.selected_summary.failed,0);assert.equal(report.selected_summary.out_of_scope_not_run,42);
});
test('eligible recovery clears suspension but never replays or changes blocked firstattempt',async t=>{
 const dir=await env(t),a=approval(dir),rows=suitePlan(),row=rows.find(r=>r.id==='S05'&&r.repetition===1);Object.assign(row,{status:'BLOCKED',reason:'PROVIDER_RATE_LIMITED',cleanup_pending:true,restoration_pending:true});
 const report={evaluation_run_id:a.evaluation_run_id,runs:rows,suspension:{reason:'PROVIDER_RATE_LIMITED',observed_at:'2026-11-11T15:00:00Z',retry_after_seconds:0}};await writeFile(join(dir,'results.json'),JSON.stringify(report));let reads=0,restores=0;
 const session={sub:'armans_eval_owner',sid:'eval_owned_context_1',store:'karachi-kicks-supportops-lab.myshopify.com'};
 const record={scenario:'S05',repetition:1,sessions:[{session,cleaned:false}],simulations:[]};
 const result=await resumeEvaluation({outputDir:dir,approval:a,now:()=>Date.parse('2026-11-11T15:15:00Z'),createAdapter:async()=>({assertRequestWindow(){},recoverSimulations:async()=>{restores++;},getSuspension:()=>null,recoveryRegistry:{pendingCases:()=>['S05:1'],getCase:()=>record,persistCase:async()=>{}},recoveryClient:{callTool:async name=>{reads++;assert.equal(name,'get_cart');return {status:'not_found',line_items:[]};}}})});
 assert.equal(result.status,'READY');assert.equal(reads,1);assert.equal(restores,1);const saved=JSON.parse(await readFile(join(dir,'results.json'),'utf8'));assert.equal(saved.runs.find(r=>r.id==='S05').status,'BLOCKED');assert.equal(saved.runs.find(r=>r.id==='S05').cleanup_pending,false);assert.equal(saved.suspension,undefined);assert.equal(saved.suspension_history.length,1);assert.equal(saved.selected_summary.not_run,32);
});
test('deadline without any prior launch creates offline33-slot finalization',async t=>{
 const dir=await env(t),a=approval(dir);let network=0;const result=await resumeEvaluation({outputDir:join(dir,'never-started'),approval:a,now:()=>Date.parse(EVALUATION_DEADLINE),createAdapter:async()=>{network++;}});assert.equal(result.status,'DEADLINE_FINALIZED');assert.equal(result.selected_summary.not_run,33);assert.equal(network,0);
});
import {trackRawRequest} from '../evals/raw-request.mjs';
test('rawcompanion unknownmutation marks entirecase whileknown rejection doesnot',async()=>{
 const events=[],registry={before:async()=>events.push('intent'),after:async(s,n,r)=>events.push(r.ambiguous?'unknown':'known'),markCaseUnknown:async()=>events.push('case_unknown')},args={registry,session:{},body:{name:'cancel_cart'}};
 await trackRawRequest({...args,request:async()=>({status:400,body:{error:'INVALID_INPUT'}})});assert.deepEqual(events,['intent','known']);events.length=0;
 await assert.rejects(trackRawRequest({...args,request:async()=>{throw Error('network');}}),/network/);assert.deepEqual(events,['intent','unknown','case_unknown']);events.length=0;
 await assert.rejects(trackRawRequest({...args,request:async()=>{throw Object.assign(Error('PROVIDER_RATE_LIMITED'),{code:'RATE_LIMITED'});}}));assert.deepEqual(events,['intent','known']);
});
