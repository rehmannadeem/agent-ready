import test from 'node:test';
import assert from 'node:assert/strict';
import {assertCriticalLaunch,CRITICAL_NOT_BEFORE,CRITICAL_SCENARIOS} from '../evals/launch-policy.mjs';
const gates={owner_resume_authorized:true,load_finding_acknowledged:true,prior_cart_cancellations_acknowledged:true,automatic_resume:false,scope:'critical_12_only',not_before:CRITICAL_NOT_BEFORE,scenario_ids:[...CRITICAL_SCENARIOS]};
const config={min_request_interval_ms:10000};
test('hard UTC gate opens at19:15PKT and never launches early',()=>{
 assert.throws(()=>assertCriticalLaunch({gates,config,now:Date.parse(CRITICAL_NOT_BEFORE)-1}),/TIME_GATE_NOT_OPEN/);
 assert.equal(assertCriticalLaunch({gates,config,now:Date.parse(CRITICAL_NOT_BEFORE)}).attempts,12);
});
test('critical scope and ten-second pacing required; old-cart absence is not a gate',()=>{
 const now=Date.parse(CRITICAL_NOT_BEFORE);
 assert.equal(assertCriticalLaunch({gates:{...gates,pending_carts_absent:false},config,now}).attempts,12);
 for(const change of [{scope:'full75'},{scenario_ids:['S01']},{automatic_resume:true},{prior_cart_cancellations_acknowledged:false}])assert.throws(()=>assertCriticalLaunch({gates:{...gates,...change},config,now}));
 assert.throws(()=>assertCriticalLaunch({gates,config:{min_request_interval_ms:3000},now}),/PACING_REQUIRED/);
});

import {summarizeSelection} from '../evals/runner.mjs';
import {suitePlan} from '../evals/scenarios.mjs';
test('selected twelve summary is distinct from untouched sixty-three',()=>{
 const runs=suitePlan();runs.find(r=>r.id==='S05').status='BLOCKED';
 assert.deepEqual(summarizeSelection(runs,CRITICAL_SCENARIOS),{authorized_attempts:12,passed:0,mechanical_pass_pending_human_review:0,failed:0,blocked:1,not_run:11,running:0,out_of_scope:63,out_of_scope_not_run:63});
});
