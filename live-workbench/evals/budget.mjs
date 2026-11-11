import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';

export const BUDGET = Object.freeze({
  model: 'claude-haiku-5-5', capNanoUsd: 10_000_000_000,
  inputNanoUsdPerToken: 100, outputNanoUsdPerToken: 500,
  maxInputTokens: 24_000, maxOutputTokens: 2_000, maxContentBytes: 23_000,
  framingAllowanceTokens: 1_000, maxIterations: 5, retries: 0,
  tariffVerified: '2026-11-10', tariffSource: 'https://app.n8n.cloud/service-pricing',
});
export const dollars = nano => nano / 1_000_000_000;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const safeInteger = x => Number.isSafeInteger(x) && x >= 0;
export function boundedRequest(system, prompt) {
  if (typeof system !== 'string' || typeof prompt !== 'string' || !prompt.trim()) throw new Error('INVALID_MODEL_INPUT');
  const inputBytes = Buffer.byteLength(system, 'utf8') + Buffer.byteLength(prompt, 'utf8');
  if (inputBytes > BUDGET.maxContentBytes) throw new Error('INPUT_BOUND_EXCEEDED');
  return { model: BUDGET.model, system, prompt, max_output_tokens: BUDGET.maxOutputTokens,
    inputBytes, inputBound: BUDGET.maxInputTokens,
    digest: createHash('sha256').update(JSON.stringify({system,prompt})).digest('hex') };
}

/** Durable, integer-dollar ledger. Atomic reservations serialize across processes.
 * Lock files are never automatically stolen; after a crash, an operator must
 * verify the old process is dead before removing only the stale lock file.
 * The ledger and unresolved reservations must never be deleted to resume a run.
 */
export class BudgetLedger {
  constructor(path, { capNanoUsd = BUDGET.capNanoUsd, lockWaitMs = 5000, evaluationRunId = 'standalone-test', fundedNanoUsd = capNanoUsd } = {}) {
    if (!safeInteger(capNanoUsd) || capNanoUsd <= 0 || capNanoUsd > BUDGET.capNanoUsd) throw new Error('INVALID_CAP');
    if(!safeInteger(fundedNanoUsd)||fundedNanoUsd<=0||fundedNanoUsd>capNanoUsd)throw new Error('INVALID_FUNDED_LIMIT');
    if(typeof evaluationRunId!=='string'||!/^[A-Za-z0-9_-]{8,128}$/.test(evaluationRunId))throw new Error('INVALID_EVALUATION_RUN_ID');
    this.path = path; this.cap = capNanoUsd; this.lockWaitMs = lockWaitMs;this.evaluationRunId=evaluationRunId;this.funded=fundedNanoUsd;
  }
  async transaction(fn) {
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
    const lock = `${this.path}.lock`; const start = Date.now(); let fd;
    for (;;) {
      try { fd = await open(lock, 'wx', 0o600); break; }
      catch (e) { if (e.code !== 'EEXIST') throw e; if (Date.now()-start >= this.lockWaitMs) throw new Error('BUDGET_LOCK_BUSY'); await sleep(10); }
    }
    try {
      await fd.writeFile(JSON.stringify({pid:process.pid,at:new Date().toISOString()})); await fd.sync();
      let state;
      try { state = JSON.parse(await readFile(this.path, 'utf8')); }
      catch (e) { if (e.code !== 'ENOENT') throw new Error('BUDGET_LEDGER_UNREADABLE', {cause:e});
        state = {version:2,evaluationRunId:this.evaluationRunId,capNanoUsd:this.cap,fundedNanoUsd:this.funded,rates:{input:100,output:500},reservations:{},halt:null}; }
      if (state.version !== 2 || state.evaluationRunId !== this.evaluationRunId || state.capNanoUsd !== this.cap || state.fundedNanoUsd !== this.funded || state.rates?.input !== 100 || state.rates?.output !== 500 || !state.reservations || Array.isArray(state.reservations)) throw new Error('BUDGET_LEDGER_CONFIG_MISMATCH');
      for (const r of Object.values(state.reservations)) {
        if (!['reserved','settled','unknown'].includes(r.status) || !safeInteger(r.reserveNanoUsd) || (r.status === 'settled' && !safeInteger(r.actualNanoUsd))) throw new Error('BUDGET_LEDGER_CORRUPT');
      }
      const result = await fn(state);
      const temp = `${this.path}.${randomUUID()}.tmp`; const tf = await open(temp,'wx',0o600);
      try { await tf.writeFile(JSON.stringify(state,null,2)+'\n'); await tf.sync(); } finally { await tf.close(); }
      await rename(temp,this.path);
      return result;
    } finally { await fd.close(); await unlink(lock); }
  }
  static totals(state) {
    let spent=0,reserved=0;
    for(const r of Object.values(state.reservations)) { if(r.status==='settled')spent+=r.actualNanoUsd;else reserved+=r.reserveNanoUsd; }
    return {spentNanoUsd:spent,reservedNanoUsd:reserved,remainingNanoUsd:state.capNanoUsd-spent-reserved,capNanoUsd:state.capNanoUsd,fundedNanoUsd:state.fundedNanoUsd,fundedRemainingNanoUsd:state.fundedNanoUsd-spent-reserved,halt:state.halt};
  }
  async snapshot() { return this.transaction(s=>({...BudgetLedger.totals(s),calls:Object.keys(s.reservations).length,reservations:structuredClone(s.reservations)})); }
  async assertNoUnresolved() { return this.transaction(s=>{
    if(s.halt || Object.values(s.reservations).some(r=>r.status!=='settled'))throw new Error('UNRESOLVED_USAGE_REQUIRES_RECONCILIATION');
    return BudgetLedger.totals(s);
  }); }
  async reserve({ inputBound=BUDGET.maxInputTokens, outputBound=BUDGET.maxOutputTokens, digest, label={} }={}) {
    if(!safeInteger(inputBound)||inputBound>BUDGET.maxInputTokens||!safeInteger(outputBound)||outputBound>BUDGET.maxOutputTokens)throw new Error('INVALID_RESERVATION_BOUND');
    return this.transaction(s=>{
      if(s.halt)throw new Error(`BUDGET_HALTED:${s.halt}`);
      const reserveNanoUsd=inputBound*100+outputBound*500;
      const remaining=BudgetLedger.totals(s);
      if(reserveNanoUsd>remaining.remainingNanoUsd)throw new Error('BUDGET_CAP_REACHED');
      if(reserveNanoUsd>remaining.fundedRemainingNanoUsd)throw new Error('BUDGET_FUNDED_LIMIT_REACHED');
      const id=randomUUID();
      const cleanLabel=Object.fromEntries(['scenario','repetition','turn','iteration'].filter(k=>label[k]!==undefined).map(k=>[k,label[k]]));
      s.reservations[id]={status:'reserved',reserveNanoUsd,inputBound,outputBound,digest,label:cleanLabel,createdAt:new Date().toISOString()};
      return {id,reserveNanoUsd};
    });
  }
  async markUnknown(id, reason='MODEL_USAGE_UNKNOWN') {
    return this.transaction(s=>{const r=s.reservations[id];if(!r)throw new Error('UNKNOWN_RESERVATION');if(r.status==='settled')return;
      r.status='unknown';r.reason=reason;s.halt='UNRESOLVED_USAGE';});
  }
  async settle(id, usage, { executionId }={}) {
    const outcome=await this.transaction(s=>{
      const r=s.reservations[id]; if(!r)throw new Error('UNKNOWN_RESERVATION');
      if(r.status==='settled')throw new Error('RESERVATION_ALREADY_SETTLED');
      const input=usage?.input_tokens,output=usage?.output_tokens;
      if(!safeInteger(input)||!safeInteger(output)||!safeInteger(usage?.cache_creation_input_tokens??0)||!safeInteger(usage?.cache_read_input_tokens??0)||
          (usage.cache_creation_input_tokens??0)!==0||(usage.cache_read_input_tokens??0)!==0) {
        r.status='unknown';r.reason='MISSING_OR_UNEXPECTED_USAGE';s.halt='UNRESOLVED_USAGE';return {error:'MISSING_OR_UNEXPECTED_USAGE'};
      }
      const actualNanoUsd=input*100+output*500;
      r.status='settled';r.actualNanoUsd=actualNanoUsd;r.usage={input_tokens:input,output_tokens:output};
      r.settledAt=new Date().toISOString();if(executionId)r.executionId=String(executionId);
      if(input>r.inputBound||output>r.outputBound||actualNanoUsd>r.reserveNanoUsd){s.halt='PROVIDER_BOUND_VIOLATION';return {error:'PROVIDER_BOUND_VIOLATION'};}
      return {actualNanoUsd,usage:r.usage};
    });
    if(outcome.error)throw new Error(outcome.error); return outcome;
  }
}

/** Transport must perform exactly one request with retries disabled. Unknown
 * results retain the reservation and stop the suite; this function never retries.
 */
export async function invokeBudgeted({ledger,transport,system,prompt,label}) {
  const request=boundedRequest(system,prompt);
  const reservation=await ledger.reserve({inputBound:request.inputBound,outputBound:request.max_output_tokens,digest:request.digest,label});
  let response;
  try { response=await transport({...request,reservation_id:reservation.id,retries:0}); }
  catch(e){await ledger.markUnknown(reservation.id);throw new Error('MODEL_USAGE_UNKNOWN',{cause:e});}
  const billed=await ledger.settle(reservation.id,response?.usage,{executionId:response?.executionId});
  return {...response,reservationId:reservation.id,...billed};
}
