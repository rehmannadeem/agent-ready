import {readFile,writeFile,rename,mkdir} from 'node:fs/promises';
import {dirname} from 'node:path';
const mutations=new Set(['create_cart','update_cart','cancel_cart']);
export class SessionRegistry{
 constructor(path,runId){this.path=path;this.runId=runId;this.data={evaluation_run_id:runId,sessions:[]};}
 async load(){try{this.data=JSON.parse(await readFile(this.path,'utf8'));if(this.data.evaluation_run_id!==this.runId)throw Error('SESSION_REGISTRY_RUN_MISMATCH');}catch(e){if(e.code!=='ENOENT')throw e;}return this;}
 async save(){await mkdir(dirname(this.path),{recursive:true,mode:0o700});const tmp=this.path+'.tmp';await writeFile(tmp,JSON.stringify(this.data,null,2),{mode:0o600});await rename(tmp,this.path);}
 async add(session,caseId){if(!/^S\d{2}:[123]$/.test(caseId)||this.data.sessions.some(r=>r.session.sid===session.sid))throw Error('SESSION_REGISTRY_IDENTITY_INVALID');this.data.sessions.push({case_id:caseId,session,cleaned:false,mutation_outcome_unknown:false,cleanup_phase:null});await this.save();}
 row(session){const row=this.data.sessions.find(r=>r.session.sid===session.sid);if(!row)throw Error('UNREGISTERED_EVALUATION_SESSION');return row;}
 async before(session,name){if(!mutations.has(name))return;const row=this.row(session);if(row.mutation_outcome_unknown||row.pending_mutation)throw Error('AMBIGUOUS_MUTATION_OPERATOR_RECOVERY_REQUIRED');row.pending_mutation={name,sent_at:new Date().toISOString()};await this.save();}
 async after(session,name,result){if(!mutations.has(name))return;const row=this.row(session);row.mutation_outcome_unknown=result?.ambiguous===true;if(row.mutation_outcome_unknown)row.last_unknown_mutation=row.pending_mutation;row.pending_mutation=null;await this.save();}
 getCase(caseId){const [scenario,repetition]=caseId.split(':');return {scenario,repetition:Number(repetition),sessions:this.data.sessions.filter(r=>r.case_id===caseId).map(r=>({...r,mutation_outcome_unknown:r.mutation_outcome_unknown||!!r.pending_mutation})),simulations:[]};}
 async persistCase(record){for(const next of record.sessions){const row=this.row(next.session);if(row.case_id!==`${record.scenario}:${record.repetition}`)throw Error('RECOVERY_CASE_MISMATCH');Object.assign(row,next);}await this.save();}
 async markClean(caseId){for(const row of this.data.sessions.filter(r=>r.case_id===caseId)){if(row.pending_mutation||row.mutation_outcome_unknown)throw Error('AMBIGUOUS_MUTATION_OPERATOR_RECOVERY_REQUIRED');row.cleaned=true;row.cleanup_phase='verified_absent';}await this.save();}
 async markCaseUnknown(session){const caseId=this.row(session).case_id;for(const row of this.data.sessions.filter(r=>r.case_id===caseId))row.mutation_outcome_unknown=true;await this.save();}
 pendingCases(){return [...new Set(this.data.sessions.filter(r=>!r.cleaned).map(r=>r.case_id))];}
}
