import test from 'node:test';import assert from 'node:assert/strict';
import {recoverEvaluation} from '../evals/recovery.mjs';
const session={sub:'armans_eval_owner',sid:'eval_owner',store:'karachi-kicks-supportops-lab.myshopify.com',market:'US',currency:'USD',iat:1,exp:2};
const absent={status:'no_current_cart',line_items:[],ready_for_handoff:false};
const active={status:'active',line_items:[{quantity:1}]};
const record=()=>({scenario:'S21',repetition:1,sessions:[{session:{...session},cleaned:false}],simulations:[]});
const args=(r,call)=>({record:r,client:{callTool:call},persist:async()=>{},now:()=>100000,notBefore:99999,deadline:200000});
test('recovery only uses evaluation-owned contexts after cooldown and before deadline',async()=>{
 let calls=0;for(const overrides of [{notBefore:100001},{deadline:100000}])await assert.rejects(recoverEvaluation({...args(record(),async()=>{calls++;}),...overrides}),/TIME_WINDOW/);
 const r=record();r.sessions[0].session.sid='load_123';await assert.rejects(recoverEvaluation(args(r,async()=>{calls++;})),/EVALUATION_SESSIONS/);assert.equal(calls,0);
});
test('owner and victim absence refresh claims without replacing session identity',async()=>{
 const r=record();r.sessions.push({session:{...session,sid:'eval_victim'},cleaned:false});const seen=[];
 const result=await recoverEvaluation(args(r,async(name,a,s)=>{seen.push(s);assert.equal(name,'get_cart');return absent;}));
 assert.equal(result.status,'RECOVERED');assert.deepEqual(seen.map(x=>x.sid),['eval_owner','eval_victim']);assert.ok(seen.every(x=>x.iat===100&&x.exp===3700));assert.ok(r.sessions.every(x=>x.cleaned));
});
test('known active cart records cancellation intent before one mutation and verifies absence',async()=>{
 const r=record(),calls=[],saved=[];const responses=[active,{status:'cancellation_requested'},absent];
 const result=await recoverEvaluation({...args(r,async name=>{calls.push(name);if(name==='cancel_cart')assert.equal(saved.at(-1),'cancel_intent');return responses.shift();}),persist:async()=>saved.push(r.sessions[0].cleanup_phase)});
 assert.equal(result.status,'RECOVERED');assert.deepEqual(calls,['get_cart','cancel_cart','get_cart']);assert.equal(saved.at(-1),'absence_verified');
});
test('acknowledged or ambiguous cancellation is never repeated when still active',async()=>{
 for(const phase of ['cancel_intent','cancel_acknowledged']){const r=record();r.sessions[0].cleanup_phase=phase;const calls=[];const result=await recoverEvaluation(args(r,async name=>{calls.push(name);return active;}));assert.equal(result.status,'BLOCKED');assert.deepEqual(calls,['get_cart']);}
});
test('throttle stops all remaining recovery and preserves hint',async()=>{
 const r=record();r.sessions.push({session:{...session,sid:'eval_victim'},cleaned:false});let calls=0;
 const result=await recoverEvaluation(args(r,async()=>{calls++;return {error:'RATE_LIMITED',http_status:429,retry_after_seconds:3550};}));assert.equal(calls,1);assert.equal(result.retry_after_seconds,3550);assert.equal(result.status,'BLOCKED');assert.equal(r.sessions[0].cleaned,false);
});
test('unknown simulation outcomes block all requests; confirmed applied restoration is persisted',async()=>{
 for(const phase of ['applying','restoring']){const r=record();r.simulations=[{type:'stock',phase}];let calls=0;const result=await recoverEvaluation({...args(r,async()=>{calls++;}),restoreSimulation:async()=>{calls++;}});assert.equal(result.reason,'SIMULATION_OUTCOME_REQUIRES_RECONCILIATION');assert.equal(calls,0);}
 const r=record();r.simulations=[{type:'price',phase:'applied'}];const result=await recoverEvaluation({...args(r,async()=>absent),restoreSimulation:async item=>{assert.equal(item.phase,'restoring');return {phase:'restored',restored_verified:true};}});assert.equal(result.status,'RECOVERED');assert.equal(r.simulations[0].phase,'restored');
});
test('deadline reached between read and cancellation prevents mutation',async()=>{
 let now=100000,calls=0;const result=await recoverEvaluation({...args(record(),async()=>{calls++;now=200000;return active;}),now:()=>now});assert.equal(calls,1);assert.equal(result.reason,'RECOVERY_DEADLINE_REACHED');
});
test('network-unknown cancellation persists intent and cannot be retried on restart',async()=>{
 const r=record();let calls=0;const first=await recoverEvaluation(args(r,async name=>{calls++;if(name==='cancel_cart')throw Error('NETWORK_FAILURE');return active;}));assert.equal(first.status,'BLOCKED');assert.equal(r.sessions[0].cleanup_phase,'cancel_intent');const second=await recoverEvaluation(args(r,async()=>{calls++;return active;}));assert.equal(second.reason,'CART_OUTCOME_REQUIRES_RECONCILIATION');assert.equal(calls,3);
});

test('known rejected cancellation on429 clears intent but ambiguous rejection retains it',async()=>{
 for(const ambiguous of [false,true]){const r=record();let calls=0;const result=await recoverEvaluation(args(r,async()=>++calls===1?active:{error:'RATE_LIMITED',http_status:429,ambiguous,retry_after_seconds:60}));assert.equal(result.throttled,true);assert.equal(r.sessions[0].cleanup_phase,ambiguous?'cancel_intent':undefined);assert.equal(calls,2);}
});
