// Owner-only recovery of durable evaluation sessions. Never accepts load contexts.
// Call only after the coordinator's provider cooldown. This module has no timers,
// credentials, model calls, retry loop, or ability to start another scenario.
const STORE='karachi-kicks-supportops-lab.myshopify.com';
const absent=r=>!r?.error&&['not_found','no_current_cart'].includes(r?.status)&&Array.isArray(r.line_items)&&r.line_items.length===0&&r.ready_for_handoff!==true;
const rate=r=>r?.error==='RATE_LIMITED'||r?.code==='RATE_LIMITED'||r?.http_status===429||r?.status===429||/^RATE_LIMIT/.test(r?.message||'');
const safeCode=e=>/^[A-Z][A-Z0-9_]{2,100}$/.test(e?.code||e?.message||'')?(e.code||e.message):'RECOVERY_UNCONFIRMED';
export async function recoverEvaluation({record,client,restoreSimulation,persist,now=()=>Date.now(),notBefore,deadline}){
 if(typeof persist!=='function'||typeof client?.callTool!=='function'||!record||!Array.isArray(record.sessions)||!Array.isArray(record.simulations))throw Error('RECOVERY_CONFIGURATION_REQUIRED');
 if(!Number.isFinite(notBefore)||!Number.isFinite(deadline)||now()<notBefore||now()>=deadline)throw Error('RECOVERY_TIME_WINDOW_CLOSED');
 if(!/^S\d{2}$/.test(record.scenario||'')||!Number.isInteger(record.repetition)||record.repetition<1)throw Error('EVALUATION_CASE_REQUIRED');
 if(record.sessions.some(x=>!x.session||x.session.store!==STORE||x.session.sub!=='armans_eval_owner'||!/^eval_[A-Za-z0-9_]+$/.test(x.session.sid||''))||new Set(record.sessions.map(x=>x.session.sid)).size!==record.sessions.length)throw Error('EVALUATION_SESSIONS_REQUIRED');
 const report={scenario:record.scenario,repetition:record.repetition,status:'RUNNING',checks:[],model_calls:0};
 const stop=(reason,result)=>{report.status='BLOCKED';report.reason=reason;if(rate(result)){const seconds=result?.retry_after_seconds??result?.suspension?.retry_after_seconds;report.throttled=true;if(Number.isInteger(seconds)&&seconds>=0&&seconds<=86400)report.retry_after_seconds=seconds;}return report;};
 const checkTime=()=>{if(now()>=deadline)throw Error('RECOVERY_DEADLINE_REACHED');};
 // Restore only fully journaled applied simulations. applying/restoring records
 // have an unknown write outcome and must never be replayed automatically.
 for(const item of [...record.simulations].reverse()){
  if(item.phase==='restored')continue;
  if(item.phase!=='applied')return stop('SIMULATION_OUTCOME_REQUIRES_RECONCILIATION');
  if(typeof restoreSimulation!=='function')return stop('RESTORATION_CALLBACK_REQUIRED');
  try{checkTime();item.phase='restoring';await persist(record);const result=await restoreSimulation(item);
   if(rate(result))return stop('PROVIDER_RATE_LIMITED',result);
   if(result?.phase!=='restored'||result?.restored_verified!==true)return stop('RESTORATION_UNCONFIRMED');
   item.phase='restored';await persist(record);report.checks.push({kind:'simulation_restored',type:item.type,pass:true});
  }catch(e){return stop(rate(e)?'PROVIDER_RATE_LIMITED':safeCode(e),e);}
 }
 for(const entry of record.sessions){
  if(entry.cleaned===true)continue;
  // Refresh time claims only; owner, session ID and merchant remain unchanged.
  const seconds=Math.floor(now()/1000),session={...entry.session,iat:seconds,exp:seconds+3600};
  try{
   checkTime();const current=await client.callTool('get_cart',{},session);
   if(rate(current))return stop('PROVIDER_RATE_LIMITED',current);
   if(absent(current)){entry.cleaned=true;entry.cleanup_phase='absence_verified';await persist(record);report.checks.push({kind:'cart_absence',pass:true});continue;}
   if(current?.error||!Array.isArray(current?.line_items))return stop('CART_READ_UNCONFIRMED');
   if(entry.mutation_outcome_unknown||['cancel_intent','cancel_acknowledged'].includes(entry.cleanup_phase))return stop('CART_OUTCOME_REQUIRES_RECONCILIATION');
   checkTime();entry.cleanup_phase='cancel_intent';await persist(record);
   const cancelled=await client.callTool('cancel_cart',{},session);
   if(rate(cancelled)){if(cancelled.ambiguous!==true){delete entry.cleanup_phase;await persist(record);}return stop('PROVIDER_RATE_LIMITED',cancelled);}
   if(cancelled?.error||cancelled?.status!=='cancellation_requested')return stop('CANCELLATION_OUTCOME_UNCONFIRMED');
   entry.cleanup_phase='cancel_acknowledged';await persist(record);
   checkTime();const verified=await client.callTool('get_cart',{},session);
   if(rate(verified))return stop('PROVIDER_RATE_LIMITED',verified);
   if(!absent(verified))return stop('CART_ABSENCE_UNCONFIRMED');
   entry.cleaned=true;entry.cleanup_phase='absence_verified';await persist(record);report.checks.push({kind:'cart_absence',pass:true});
  }catch(e){return stop(rate(e)?'PROVIDER_RATE_LIMITED':safeCode(e),e);}
 }
 report.status='RECOVERED';return report;
}
