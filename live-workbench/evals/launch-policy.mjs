// Owner-authorized critical-only evaluation window. No network in this module.
export const CRITICAL_SCENARIOS=Object.freeze(['S05','S19','S20','S21']);
export const CRITICAL_NOT_BEFORE='2026-11-11T14:15:00.000Z';
export function assertCriticalLaunch({gates,config,now=Date.now()}){
 if(!Number.isFinite(now)||now<Date.parse(CRITICAL_NOT_BEFORE))throw Error('EVALUATION_TIME_GATE_NOT_OPEN');
 for(const key of ['owner_resume_authorized','load_finding_acknowledged','prior_cart_cancellations_acknowledged'])if(gates?.[key]!==true)throw Error('GATE_REQUIRED_'+key);
 if(gates?.automatic_resume!==false||gates?.scope!=='critical_12_only'||gates?.not_before!==CRITICAL_NOT_BEFORE||JSON.stringify(gates?.scenario_ids)!==JSON.stringify(CRITICAL_SCENARIOS))throw Error('CRITICAL_SCOPE_MISMATCH');
 if(config?.min_request_interval_ms!==10000)throw Error('CRITICAL_PACING_REQUIRED');
 return {scenario_ids:[...CRITICAL_SCENARIOS],attempts:12,not_before:CRITICAL_NOT_BEFORE,minimum_request_interval_ms:10000};
}

import {SCENARIOS} from './scenarios.mjs';
export const EVALUATION_DEADLINE='2026-11-12T13:00:00.000Z';
export const AUTHORIZED_SLOTS=Object.freeze([
 ...CRITICAL_SCENARIOS.flatMap(id=>[1,2,3].map(repetition=>Object.freeze({id,repetition}))),
 ...SCENARIOS.filter(s=>!CRITICAL_SCENARIOS.includes(s.id)).map(s=>Object.freeze({id:s.id,repetition:1}))
]);
export const slotKey=row=>`${row.id}:${row.repetition}`;
export function assertScheduledLaunch({gates,config,now=Date.now()}){
 if(!Number.isFinite(now)||now<Date.parse(CRITICAL_NOT_BEFORE))throw Error('EVALUATION_TIME_GATE_NOT_OPEN');
 if(now>=Date.parse(EVALUATION_DEADLINE))throw Error('EVALUATION_DEADLINE_REACHED');
 for(const key of ['owner_resume_authorized','load_finding_acknowledged','prior_cart_cancellations_acknowledged'])if(gates?.[key]!==true)throw Error('GATE_REQUIRED_'+key);
 if(gates?.scope!=='critical12_then21_once'||gates?.not_before!==CRITICAL_NOT_BEFORE||gates?.deadline!==EVALUATION_DEADLINE||JSON.stringify(gates?.slots)!==JSON.stringify(AUTHORIZED_SLOTS))throw Error('SCHEDULED_SCOPE_MISMATCH');
 if(config?.min_request_interval_ms!==10000||config?.execution_deadline!==EVALUATION_DEADLINE||config?.request_not_before!==CRITICAL_NOT_BEFORE)throw Error('SCHEDULED_PACING_OR_WINDOW_REQUIRED');
 return {slots:AUTHORIZED_SLOTS,attempts:33,not_before:CRITICAL_NOT_BEFORE,deadline:EVALUATION_DEADLINE,minimum_request_interval_ms:10000};
}
export function resumeEligibility(suspension,{now=Date.now()}={}){
 if(now>=Date.parse(EVALUATION_DEADLINE))return {allowed:false,reason:'EVALUATION_DEADLINE_REACHED'};
 if(!suspension)return {allowed:now>=Date.parse(CRITICAL_NOT_BEFORE),eligible_at:CRITICAL_NOT_BEFORE};
 const observed=Date.parse(suspension.observed_at),seconds=suspension.retry_after_seconds;
 if(!Number.isFinite(observed)||!Number.isInteger(seconds)||seconds<0||seconds>86400)return {allowed:false,reason:'RETRY_AFTER_UNKNOWN_OPERATOR_REQUIRED'};
 const eligible=Math.max(Date.parse(CRITICAL_NOT_BEFORE),observed+(seconds+900)*1000);
 return {allowed:now>=eligible,eligible_at:new Date(eligible).toISOString(),reason:now<eligible?'PROVIDER_COOLDOWN_PENDING':undefined};
}
export function finalizeDeadline(report,{now=Date.now()}={}){
 if(now<Date.parse(EVALUATION_DEADLINE))throw Error('EVALUATION_DEADLINE_NOT_REACHED');
 const selected=new Set(AUTHORIZED_SLOTS.map(slotKey));
 const rateBlocked=report.suspension?.reason==='PROVIDER_RATE_LIMITED'&&!report.recovery_blocker;
 for(const row of report.runs)if(selected.has(slotKey(row))&&row.status==='NOT_RUN')row.reason=rateBlocked?'not run: anonymous access limit':report.recovery_blocker?'not run: '+report.recovery_blocker:'not run: evaluation deadline';
 report.deadline_finalized_at=new Date(now).toISOString();report.deadline=EVALUATION_DEADLINE;report.automatic_resume=false;
 return report;
}
