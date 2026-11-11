import {readFile,writeFile,rename,mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {resumeEligibility,finalizeDeadline,EVALUATION_DEADLINE,CRITICAL_NOT_BEFORE,AUTHORIZED_SLOTS} from './launch-policy.mjs';
import {suitePlan} from './scenarios.mjs';
import {createSuiteLedger,summarizeSlots} from './runner.mjs';
import {recoverEvaluation} from './recovery.mjs';
async function persist(path,report){const tmp=path+'.tmp';await writeFile(tmp,JSON.stringify(report,null,2)+'\n',{mode:0o600});await rename(tmp,path);}
export async function resumeEvaluation({outputDir,approval,createAdapter,now=()=>Date.now()}){
 const path=join(outputDir,'results.json');let report;
 try{report=JSON.parse(await readFile(path,'utf8'));}catch(e){if(e.code==='ENOENT'){if(now()<Date.parse(EVALUATION_DEADLINE))return {status:'NEW_RUN'};report={schema_version:1,evaluation_run_id:approval.evaluation_run_id,runs:suitePlan(),execution_scope:{slots:AUTHORIZED_SLOTS,authorized_attempts:33,suite_denominator:75,excluded_attempts:42}};}else throw e;}
 if(report.evaluation_run_id!==approval.evaluation_run_id)throw Error('RESULT_RUN_ID_MISMATCH');
 if(now()>=Date.parse(EVALUATION_DEADLINE)){await mkdir(outputDir,{recursive:true,mode:0o700});finalizeDeadline(report,{now:now()});report.selected_summary=summarizeSlots(report.runs,AUTHORIZED_SLOTS);await persist(path,report);return {status:'DEADLINE_FINALIZED',selected_summary:report.selected_summary};}
 if(report.recovery_blocker)return {status:'BLOCKED',reason:report.recovery_blocker};
 if(!report.suspension){if(report.runs.some(r=>r.status==='RUNNING'||r.cleanup_pending||r.restoration_pending||r.cleanup_error))return {status:'BLOCKED',reason:'INTERRUPTED_OR_UNCONFIRMED_RECOVERY_REQUIRES_OPERATOR'};return {status:'READY'};}
 const eligibility=resumeEligibility(report.suspension,{now:now()});if(!eligibility.allowed)return {status:'WAIT',...eligibility};
 await createSuiteLedger(approval).assertNoUnresolved();
 const adapter=await createAdapter();const registry=adapter.recoveryRegistry;
 if(!registry)throw Error('DURABLE_RECOVERY_REGISTRY_REQUIRED');
 const cases=registry.pendingCases();
 for(const caseId of cases){
  let recovery;
  try{
   adapter.assertRequestWindow();await adapter.recoverSimulations(caseId);
   recovery=await recoverEvaluation({record:registry.getCase(caseId),client:adapter.recoveryClient,persist:record=>registry.persistCase(record),now,notBefore:Date.parse(eligibility.eligible_at||CRITICAL_NOT_BEFORE),deadline:Date.parse(EVALUATION_DEADLINE)});
  }catch(e){recovery={status:'BLOCKED',reason:e.code||e.message};}
  report.recovery_history??=[];report.recovery_history.push({case_id:caseId,at:new Date(now()).toISOString(),...recovery});
  const suspension=adapter.getSuspension();
  if(suspension){report.suspension_history??=[];report.suspension_history.push(report.suspension);report.suspension=suspension;await persist(path,report);return {status:'WAIT',...resumeEligibility(suspension,{now:now()}),reason:'PROVIDER_RATE_LIMITED'};}
  if(recovery.status!=='RECOVERED'){report.recovery_blocker=recovery.reason;await persist(path,report);return {status:'BLOCKED',reason:recovery.reason};}
  const [id,repetition]=caseId.split(':');const row=report.runs.find(r=>r.id===id&&r.repetition===Number(repetition));if(row){row.cleanup_pending=false;row.restoration_pending=false;row.recovery_verified_at=new Date(now()).toISOString();}
 }
 if(report.runs.some(r=>r.cleanup_pending||r.restoration_pending))return {status:'BLOCKED',reason:'RECOVERY_CASE_MISSING'};
 report.suspension_history??=[];report.suspension_history.push({...report.suspension,recovered_at:new Date(now()).toISOString()});delete report.suspension;delete report.recovery_blocker;
 report.selected_summary=summarizeSlots(report.runs,AUTHORIZED_SLOTS);await persist(path,report);
 return {status:'READY',recovered:true,selected_summary:report.selected_summary};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{
  const [approvalPath,outputDir,seedPath,manifestPath]=process.argv.slice(2);if(!approvalPath||!outputDir||!seedPath||!manifestPath)throw Error('RESUME_ARGUMENTS_REQUIRED');
  const approval=JSON.parse(await readFile(approvalPath,'utf8'));
  const result=await resumeEvaluation({outputDir,approval,createAdapter:async()=>{const {loadOracle}=await import('./oracle.mjs');const {createAdapter}=await import('./local-adapter.mjs');return createAdapter({oracle:await loadOracle(seedPath,manifestPath)});}});
  console.log(JSON.stringify(result));if(result.status==='BLOCKED')process.exitCode=2;
 }catch(e){console.error(JSON.stringify({status:'BLOCKED',reason:e.code||e.message}));process.exitCode=1;}
}
