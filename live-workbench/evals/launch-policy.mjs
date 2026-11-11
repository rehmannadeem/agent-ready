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
