// Bounded load measurement: twenty logical sessions, ONE HTTP request at a time.
// No model invocation and no Shopify Admin write credential is used here.
import {readFile,writeFile,mkdir,rename,open,unlink,access} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {loadOracle,TARGET_STORE} from './oracle.mjs';
import {createAdapter} from './local-adapter.mjs';
const STEPS=['search','create','cancel','verify_cancel'];
const N=20;
const clockDefault={now:()=>Date.now(),sleep:ms=>new Promise(r=>setTimeout(r,ms))};
const code=e=>String(e?.error||e?.code||'').match(/^[A-Z][A-Z0-9_]{1,79}$/)?.[0]||'TOOL_ERROR';
const safeReject=new Set(['PRODUCT_UNAVAILABLE','PRODUCT_NOT_ELIGIBLE','VARIANT_NOT_ELIGIBLE','CATALOG_NOT_ELIGIBLE','INVALID_INPUT','RATE_LIMITED','SERVICE_RATE_LIMITED','SESSION_RATE_LIMITED','ACCESS_BLOCKED','UNAUTHORIZED','INVALID_SESSION','SECURITY_CONFIGURATION','SETUP_REQUIRED','PUBLICATION_NOT_CONFIGURED','CONTEXT_DENIED']);
const fatalCodes=new Set(['UNAUTHORIZED','INVALID_SESSION','SECURITY_CONFIGURATION','SETUP_REQUIRED','PUBLICATION_NOT_CONFIGURED','CONTEXT_DENIED','STATE_UNAVAILABLE','SERVICE_RATE_UNAVAILABLE']);
export function percentile(values,p){if(!values.length)return null;const ordered=[...values].sort((a,b)=>a-b);return ordered[Math.max(0,Math.ceil(p*ordered.length)-1)];}
export function throttleKind(result){
 if(['SERVICE_RATE_LIMITED','SESSION_RATE_LIMITED'].includes(result?.error))return'application';
 if(result?.error==='RATE_LIMITED')return'upstream';
 if(result?.http_status===429)return'unknown';
 return null;
}
export function retryAfterMs(result,now){
 const value=result?.retry_after_seconds??result?.retry_after;
 if(value===undefined||value===null)return null;
 if((typeof value==='number'||typeof value==='string')&&/^\d+(?:\.\d+)?$/.test(String(value)))return Math.ceil(Number(value)*1000);
 if(typeof value==='string'){const at=Date.parse(value);if(Number.isFinite(at))return Math.max(0,at-now);}
 return null;
}
function approved(approval){
 for(const field of ['owner_approved','worker_preflight_passed','seed_verified','load_test_approved'])if(approval?.[field]!==true)throw Error('LOAD_PREFLIGHT_REQUIRED_'+field.toUpperCase());
}
function selectFixture(oracle,key){
 if(oracle?.seed?.store!==TARGET_STORE||oracle?.manifest?.store!==TARGET_STORE||oracle.manifest.seed_sha256!==oracle.digest||!oracle.manifest.completed_at||oracle.manifest.pending)throw Error('LOAD_SEED_IDENTITY_MISMATCH');
 const product=oracle.product(key),variant=oracle.variant(key,{Size:'10',Colour:'Black'}),entry=oracle.manifest.products?.[product.fixture_id];
 if(!product.shopper_eligible||!['armans-synthetic','seed-v1'].every(t=>product.tags?.includes(t))||entry?.phase!=='verified'||!/^gid:\/\/shopify\/ProductVariant\/\d+$/.test(variant.id)||variant.tracked&&variant.quantity<=0&&variant.inventory_policy!=='CONTINUE')throw Error('LOAD_FIXTURE_NOT_VERIFIED_IN_STOCK');
 return {productId:oracle.productId(key),variantId:variant.id,query:product.title,fixtureId:product.fixture_id};
}
function validateSession(s,now){
 if(!s||s.store!==TARGET_STORE||s.market!=='US'||s.currency!=='USD'||!['sub','sid'].every(k=>typeof s[k]==='string'&&/^[A-Za-z0-9_-]{8,128}$/.test(s[k]))||!Number.isInteger(s.iat)||!Number.isInteger(s.exp)||s.iat>Math.floor(now/1000)+30||s.exp<=Math.floor(now/1000)+180||s.exp-s.iat>3600)throw Error('LOAD_TRUSTED_SESSION_INVALID');
}
function timings(values){return{samples:values.length,p50_ms:percentile(values,.5),p95_ms:percentile(values,.95)};}
function terminal(row){return row.steps.search.status==='FAILED'||row.steps.create.status==='FAILED'&&row.cart_state==='none'||row.steps.verify_cancel.status!=='NOT_RUN'&&row.steps.verify_cancel.status!=='IN_PROGRESS';}
function summarize(report){
 const rows=report.sessions,attempts=rows.flatMap(r=>Object.values(r.steps)).filter(s=>s.dispatched===true);
 const finished=attempts.filter(s=>!['IN_PROGRESS','NOT_RUN'].includes(s.status));
 for(const row of rows){const values=Object.values(row.steps);row.status=values.every(s=>s.status==='PASSED')?'PASSED':values.every(s=>s.status==='NOT_RUN')?'NOT_RUN':terminal(row)?'FAILED':'INCOMPLETE';}
 const passed=rows.filter(r=>r.status==='PASSED').length,failed=rows.filter(r=>r.status==='FAILED').length;
 const errors=finished.filter(s=>s.tool_error).length,business=finished.filter(s=>s.status==='FAILED'&&!s.tool_error).length;
 report.summary={planned_sessions:N,passed_sessions:passed,failed_sessions:failed,not_run_sessions:rows.filter(r=>r.status==='NOT_RUN').length,incomplete_sessions:rows.filter(r=>r.status==='INCOMPLETE').length,completed_sessions:passed+failed,session_pass_rate:passed/N,planned_workload_requests:N*3,planned_verification_requests:N,attempted_requests:attempts.length,not_run_requests:N*4-attempts.length,tool_errors:errors,business_failures:business,error_rate:attempts.length?errors/attempts.length:null,error_rate_denominator:'all attempted API requests; NOT_RUN requests reported separately',complete:!report.stop_reason&&passed+failed===N,cleanup_failures:rows.filter(r=>r.cart_state!=='none').map(r=>({correlation:r.correlation,cart_state:r.cart_state,reason:report.stop_reason||r.steps.verify_cancel.error||r.steps.cancel.error||'CLEANUP_UNCONFIRMED'}))};
 report.latency={client_http:timings(finished.map(s=>s.duration_ms)),upstream_http:null,upstream_timing_note:'Worker tool responses do not expose isolated Shopify duration; client time includes Worker, rate permit, Admin eligibility and Shopify work.',logical_session:timings(rows.filter(r=>r.finished_at_ms!==undefined).map(r=>r.finished_at_ms-r.started_at_ms))};
 report.throttles={application:finished.filter(s=>s.throttle==='application').length,upstream:finished.filter(s=>s.throttle==='upstream').length,unknown:finished.filter(s=>s.throttle==='unknown').length,upstream_note:'RATE_LIMITED is upstream, but UCP and Admin eligibility throttles cannot be separated by the current response contract.'};
 return report;
}
/** saveReport receives only sanitized measurements; saveRecovery receives private
 * trusted session claims, never bearer keys, signed assertions or cart IDs. Both
 * must persist before mutation dispatch. No automatic resume or mutation retry. */
export async function runLoad({oracle,adapter,approval,dispatchIntervalMs=1100,fixtureKey='trail_black_10',clock=clockDefault,saveReport,saveRecovery}={}){
 approved(approval);
 if(!Number.isInteger(dispatchIntervalMs)||dispatchIntervalMs<1100||dispatchIntervalMs>10000)throw Error('LOAD_DISPATCH_INTERVAL_MUST_BE_1100_TO_10000_MS');
 if(typeof adapter?.createSession!=='function'||typeof adapter?.client?.callTool!=='function'||typeof saveReport!=='function'||typeof saveRecovery!=='function')throw Error('LOAD_TRUSTED_ADAPTER_AND_PERSISTENCE_REQUIRED');
 const fixture=selectFixture(oracle,fixtureKey),started=clock.now(),contexts=[];
 for(let i=0;i<N;i++){const s=await adapter.createSession({scenario:'bounded-load',repetition:i+1});validateSession(s,clock.now());if(contexts.some(p=>p.sid===s.sid||p.sub===s.sub&&p.sid===s.sid))throw Error('LOAD_SESSION_ISOLATION_FAILED');contexts.push(s);}
 const report={schema_version:1,run_id:randomUUID(),store:TARGET_STORE,seed_sha256:oracle.digest,fixture:fixture.fixtureId,started_at:new Date(started).toISOString(),status:'RUNNING',no_models:true,load:{logical_sessions:N,dispatch_interval_ms:dispatchIntervalMs,maximum_api_in_flight:1,actual_peak_api_in_flight:0,peak_started_unfinished_sessions:0,peak_confirmed_carts:0,request_parallelism:'serialized; twenty logical sessions do not mean twenty simultaneous HTTP or merchant requests'},stop_reason:null,sessions:contexts.map(s=>({correlation:createHash('sha256').update(s.sub+'\n'+s.sid).digest('hex').slice(0,16),status:'NOT_RUN',cart_state:'none',steps:Object.fromEntries(STEPS.map(k=>[k,{status:'NOT_RUN'}]))}))};
 let lastStart=-Infinity,notBefore=0,consecutiveThrottles=0,throttleTimes=[],inflight=0;
 const persist=async()=>{
  summarize(report);await saveRecovery({schema_version:1,run_id:report.run_id,store:TARGET_STORE,seed_sha256:oracle.digest,automatic_resume_allowed:false,sessions:contexts.map((s,i)=>({context:s,correlation:report.sessions[i].correlation,cart_state:report.sessions[i].cart_state,status:report.sessions[i].status}))});
  await saveReport(report);
 };
 const stop=reason=>{report.stop_reason||=reason;};
 const updatePeaks=()=>{
  report.load.peak_started_unfinished_sessions=Math.max(report.load.peak_started_unfinished_sessions,report.sessions.filter(r=>r.started_at_ms!==undefined&&r.finished_at_ms===undefined).length);
  report.load.peak_confirmed_carts=Math.max(report.load.peak_confirmed_carts,report.sessions.filter(r=>['confirmed','cancel_pending','cancel_acknowledged'].includes(r.cart_state)).length);
 };
 const attempt=async(index,step,name,args,accept)=>{
  if(report.stop_reason)return;
  const row=report.sessions[index];
  const wait=Math.max(0,lastStart+dispatchIntervalMs-clock.now(),notBefore-clock.now());if(wait>60000){stop('RETRY_AFTER_EXCEEDS_BOUNDED_WAIT');await persist();return;}
  if(wait)await clock.sleep(wait);
  const queuedAt=clock.now();
  row.started_at_ms??=queuedAt;row.steps[step]={status:'IN_PROGRESS',dispatched:false,started_at:new Date(queuedAt).toISOString()};
  if(step==='create')row.cart_state='creation_pending';if(step==='cancel')row.cart_state='cancel_pending';updatePeaks();await persist();
  const dispatchWait=Math.max(0,lastStart+dispatchIntervalMs-clock.now(),notBefore-clock.now());if(dispatchWait)await clock.sleep(dispatchWait);
  const startedAt=clock.now();lastStart=startedAt;
  row.steps[step].dispatched=true;
  let result;inflight++;report.load.actual_peak_api_in_flight=Math.max(report.load.actual_peak_api_in_flight,inflight);
  try{result=await adapter.client.callTool(name,args,contexts[index]);}catch{result={error:'TOOL_OUTCOME_UNKNOWN',ambiguous:step==='create'||step==='cancel'};}finally{inflight--;}
  if(!result||typeof result!=='object'||Array.isArray(result))result={error:'INVALID_TOOL_RESPONSE',ambiguous:step==='create'||step==='cancel'};
  const ended=clock.now(),throttle=throttleKind(result),error=result.error?code(result):null;
  const record={status:'PASSED',dispatched:true,duration_ms:Math.max(0,ended-startedAt),started_at:new Date(startedAt).toISOString(),http_status:Number.isInteger(result.http_status)?result.http_status:null,throttle};
  if(error){record.status='FAILED';record.tool_error=true;record.error=error;}
  else if(!accept(result)){record.status='FAILED';record.tool_error=false;record.error='BUSINESS_POSTCONDITION_FAILED';}
  row.steps[step]=record;
  if(throttle){
   consecutiveThrottles++;throttleTimes=throttleTimes.filter(t=>ended-t<=60000);throttleTimes.push(ended);
   const retry=retryAfterMs(result,ended);record.retry_after_available=retry!==null;record.cooldown_ms=retry??5000;notBefore=Math.max(notBefore,ended+record.cooldown_ms);
   if(consecutiveThrottles>=2||throttleTimes.length>=2)stop('SUSTAINED_THROTTLE');
  }else consecutiveThrottles=0;
  if(fatalCodes.has(error)||result.http_status===401)stop('AUTHORIZATION_OR_CONFIGURATION_FAILURE');
  const uncertain=(step==='create'||step==='cancel')&&(result.ambiguous===true||error&&!safeReject.has(error)||!error&&step==='cancel'&&record.status==='FAILED'||!error&&step==='create'&&!Array.isArray(result.line_items));
  if(step==='create')row.cart_state=error?(uncertain?'creation_unknown':'none'):'confirmed';
  if(step==='cancel')row.cart_state=error||record.status==='FAILED'?(uncertain?'cancellation_unknown':'confirmed'):'cancel_acknowledged';
  if(step==='verify_cancel'&&record.status==='PASSED')row.cart_state='none';
  if(uncertain)stop('MUTATION_OUTCOME_UNKNOWN');
  if(terminal(row))row.finished_at_ms=ended;
  updatePeaks();await persist();
 };
 await persist();
 try{
  // Stage barriers deliberately keep successful logical sessions overlapping.
  for(let i=0;i<N&&!report.stop_reason;i++)await attempt(i,'search','search_catalog',{query:fixture.query,limit:10},r=>r.products?.some(p=>p.id===fixture.productId&&p.variants?.some(v=>v.id===fixture.variantId&&v.availability?.available===true&&v.price?.currency==='USD'))===true);
  for(let i=0;i<N&&!report.stop_reason;i++)if(report.sessions[i].steps.search.status==='PASSED')await attempt(i,'create','create_cart',{line_items:[{variant_id:fixture.variantId,quantity:1}]},r=>r.ready_for_handoff===true&&r.currency==='USD'&&r.line_items?.length===1&&r.line_items[0].item?.id===fixture.variantId&&r.line_items[0].quantity===1&&r.order_placed===false&&r.payment_submitted===false);
  for(let i=0;i<N&&!report.stop_reason;i++)if(report.sessions[i].cart_state==='confirmed')await attempt(i,'cancel','cancel_cart',{},r=>r.status==='cancellation_requested'&&r.ready_for_handoff===false&&r.order_placed===false&&r.payment_submitted===false);
  for(let i=0;i<N&&!report.stop_reason;i++)if(['cancel_acknowledged','confirmed'].includes(report.sessions[i].cart_state))await attempt(i,'verify_cancel','get_cart',{},r=>['not_found','no_current_cart'].includes(r.status)&&r.ready_for_handoff===false&&(r.line_items?.length||0)===0);
 }catch{
  // Persistence/clock/controller failures may occur after a sent mutation. Do
  // not continue dispatch or claim cleanup; the prior private checkpoint remains.
  stop('HARNESS_INTERRUPTED_OPERATOR_REVIEW_REQUIRED');
 }
 report.status=report.stop_reason?'STOPPED':'FINISHED';report.finished_at=new Date(clock.now()).toISOString();report.elapsed_ms=clock.now()-started;
 await persist();return report;
}
async function persistence(output){
 await mkdir(dirname(output),{recursive:true,mode:0o700});const lock=await open(output+'.lock','wx',0o600);
 try{await access(output);await lock.close();await unlink(output+'.lock');throw Error('LOAD_REPORT_ALREADY_EXISTS');}catch(e){if(e.code!=='ENOENT')throw e;}
 const recovery=output+'.sessions.local.json';
 const write=async(file,value)=>{const temp=file+'.'+randomUUID()+'.tmp';await writeFile(temp,JSON.stringify(value,null,2)+'\n',{mode:0o600});await rename(temp,file);};
 return{saveReport:r=>write(output,r),saveRecovery:r=>write(recovery,r),close:async()=>{await lock.close();await unlink(output+'.lock');}};
}
async function main(){
 const args=process.argv.slice(2),get=k=>args[args.indexOf(k)+1];
 if(args.includes('--plan')){console.log(JSON.stringify({logical_sessions:N,planned_workload_requests:60,planned_verification_requests:20,dispatch_interval_ms:1100,maximum_api_in_flight:1,models:0,operations:STEPS,execution:'NOT_RUN'},null,2));return;}
 for(const flag of ['--seed','--manifest','--approval','--out'])if(!args.includes(flag)||!get(flag)||get(flag).startsWith('--'))throw Error('LOAD_ARGUMENT_REQUIRED');
 const oracle=await loadOracle(resolve(get('--seed')),resolve(get('--manifest'))),approval=JSON.parse(await readFile(resolve(get('--approval')),'utf8'));approved(approval);
 const adapter=await createAdapter({oracle}); // verifies Worker health/store and loads server-only credentials
 const files=await persistence(resolve(get('--out')));
 try{const report=await runLoad({oracle,adapter,approval,...files,dispatchIntervalMs:args.includes('--interval-ms')?Number(get('--interval-ms')):1100});console.log(JSON.stringify({status:report.status,stop_reason:report.stop_reason,summary:report.summary,latency:report.latency,throttles:report.throttles,load:report.load},null,2));if(!report.summary.complete||report.summary.passed_sessions!==N)process.exitCode=1;}
 finally{await files.close();}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(()=>{console.error('LOAD_FAILED: inspect private configuration and preserved checkpoints; no automatic retry.');process.exitCode=1;});
