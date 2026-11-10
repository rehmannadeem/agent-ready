import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {BudgetLedger,dollars} from './budget.mjs';
const [approvalPath,resultsDir]=process.argv.slice(2);
try{
 if(!approvalPath||!resultsDir)throw Error('Usage: status.mjs APPROVAL_JSON RESULTS_DIR');
 const approval=JSON.parse(await readFile(approvalPath,'utf8'));
 const ledger=JSON.parse(await readFile(approval.budget_ledger_path,'utf8'));
 if(ledger.evaluationRunId!==approval.evaluation_run_id)throw Error('RESULT_RUN_ID_MISMATCH');
 let report;try{report=JSON.parse(await readFile(join(resultsDir,'results.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
 const runs=report?.runs||[],count=s=>runs.filter(r=>r.status===s).length,totals=BudgetLedger.totals(ledger),active=runs.find(r=>r.status==='RUNNING');
 console.log(JSON.stringify({evaluation_run_id:approval.evaluation_run_id,total:75,passed:count('PASSED'),mechanical_pass_pending_human_review:count('PENDING_REVIEW'),failed:count('FAILED'),blocked:count('BLOCKED'),not_run:runs.length?count('NOT_RUN'):75,running:count('RUNNING'),active:active?{scenario:active.id,repetition:active.repetition,turn:active.turns?.length}:null,model_calls:Object.keys(ledger.reservations).length,confirmed_usd:dollars(totals.spentNanoUsd),reserved_unknown_usd:dollars(totals.reservedNanoUsd),funded_limit_usd:dollars(totals.fundedNanoUsd),authorized_cap_usd:10,halt:totals.halt,last_outcome:runs.filter(r=>['FAILED','BLOCKED','PENDING_REVIEW'].includes(r.status)).at(-1)?.status||null}));
}catch(e){console.error(e.message);process.exitCode=1;}
