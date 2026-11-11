// Actual Wrangler/workerd + SQLite Durable Object smoke test, with ALL Worker
// global fetch calls replaced by a fail-closed blocker. No Shopify request is made.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, readFile, chmod } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { signSession } from '../src/session-security.mjs';

const workbench=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const privateDir=join(workbench,'dev/private');
await mkdir(privateDir,{recursive:true,mode:0o700});
const sandbox=await mkdtemp(join(privateDir,'runtime-'));
const service=randomBytes(48).toString('base64url'),issuer=randomBytes(48).toString('base64url'),inspection=randomBytes(48).toString('base64url');
const port=8798,origin=`http://127.0.0.1:${port}`;
const logs=[],checks=[],requests=[];let child;
const startedAt=new Date().toISOString();
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const config={name:'armans-local-runtime-evidence',main:join(sandbox,'entry.mjs'),compatibility_date:'2026-11-09',workers_dev:false,preview_urls:false,durable_objects:{bindings:[{name:'SESSION_STATE',class_name:'ArmansSessionState'}]},migrations:[{tag:'runtime-v1',new_sqlite_classes:['ArmansSessionState']}],vars:{SHOPIFY_STORE:'karachi-kicks-supportops-lab.myshopify.com',SHOPIFY_API_VERSION:'2026-07',UCP_AGENT_PROFILE_URL:'https://armans-agent-ready-live.veenus-rehman.workers.dev/agent-profile.json',SESSION_REQUESTS_PER_MINUTE:'1',OBSERVABILITY_ENABLED:'true'},observability:{enabled:true},dev:{ip:'127.0.0.1',port,local_protocol:'http'}};
await writeFile(join(sandbox,'wrangler.jsonc'),JSON.stringify(config,null,2)+'\n',{mode:0o600});
await writeFile(join(sandbox,'.dev.vars'),`COMMERCE_SERVICE_SECRET=${service}\nSESSION_ISSUER_SECRET=${issuer}\nLOCAL_EVAL_INSPECTION_SECRET=${inspection}\n`,{mode:0o600});
await chmod(join(sandbox,'.dev.vars'),0o600);
const actual=join(workbench,'dev/eval-worker.mjs');
await writeFile(join(sandbox,'entry.mjs'),`import actual from ${JSON.stringify(actual)};
export { ArmansSessionState } from ${JSON.stringify(actual)};
let outboundAttempts=0;
const blockOutbound=async()=>{outboundAttempts++;console.error('LOCAL_TEST_OUTBOUND_BLOCKED');throw new Error('LOCAL_TEST_OUTBOUND_DISABLED');};
globalThis.fetch=blockOutbound;
if(globalThis.fetch!==blockOutbound)throw new Error('OUTBOUND_BLOCKER_NOT_INSTALLED');
export default {async fetch(req,env,ctx){
 if(new URL(req.url).pathname==='/__runtime-test-guard')return Response.json({blocked:globalThis.fetch===blockOutbound,outbound_attempts:outboundAttempts});
 return actual.fetch(req,env,ctx);
}};
`,{mode:0o600});

async function start(){
  const env={...process.env,WRANGLER_SEND_METRICS:'false',CI:'1'};
  delete env.CLOUDFLARE_API_TOKEN;delete env.CLOUDFLARE_API_KEY;delete env.CLOUDFLARE_EMAIL;
  child=spawn(process.execPath,[join(workbench,'node_modules/wrangler/bin/wrangler.js'),'dev','--config',join(sandbox,'wrangler.jsonc'),'--local','--ip','127.0.0.1','--port',String(port),'--inspector-port','9798','--persist-to',join(sandbox,'state'),'--log-level','info','--show-interactive-dev-session','false'],{cwd:workbench,env,stdio:['ignore','pipe','pipe']});
  child.stdout.on('data',data=>logs.push(data.toString()));child.stderr.on('data',data=>logs.push(data.toString()));
  const deadline=Date.now()+25000;
  while(Date.now()<deadline){
    if(child.exitCode!==null)throw new Error(`WRANGLER_EXIT_${child.exitCode}`);
    try{const response=await fetch(`${origin}/__runtime-test-guard`,{signal:AbortSignal.timeout(500)});if(response.ok){const guard=await response.json();assert.equal(guard.blocked,true);assert.equal(guard.outbound_attempts,0);return;}}catch{}
    await wait(150);
  }
  throw new Error('WRANGLER_START_TIMEOUT');
}
async function stop(){
  if(!child||child.exitCode!==null)return;
  const processToStop=child;processToStop.kill('SIGTERM');
  await Promise.race([new Promise(r=>processToStop.once('exit',r)),wait(5000)]);
  if(processToStop.exitCode===null){processToStop.kill('SIGKILL');await new Promise(r=>processToStop.once('exit',r));}
  child=null;
}
async function call(path,body,headers={}){
  const begun=Date.now();const response=await fetch(origin+path,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body),signal:AbortSignal.timeout(5000)});
  const data=await response.json();requests.push({path,method:body.method||body.name,status:response.status,duration_ms:Date.now()-begun});return {response,data};
}
async function auth(sid){const iat=Math.floor(Date.now()/1000);return {'Authorization':`Bearer ${service}`,'X-Armans-Session':await signSession({sub:'runtime_test_operator',sid,store:config.vars.SHOPIFY_STORE,market:'US',currency:'USD',iat,exp:iat+3600},issuer)};}
function check(name,passed,details){checks.push({name,passed,...(details?{details}:{})});assert.equal(passed,true,name);}
let failure=null;
try{
  await start();
  const a=await auth('runtime_session_A'),b=await auth('runtime_session_B');
  const empty=await call('/api/shop',{name:'get_cart',arguments:{}},a);
  check('actual_do_get_cart_empty',empty.response.status===200&&empty.data.status==='no_current_cart');
  for(const [label,headers,expectedStatus,expectedError] of [
    ['uninitialized_session',b,403,'EVAL_CART_NOT_OWNED'],
    ['known_empty_session',a,409,'EVAL_CART_NOT_CONFIRMED']
  ]){
    const started=Date.now();
    const response=await fetch(origin+'/__eval/private-cart',{method:'POST',headers:{...headers,'X-Armans-Eval-Inspection':inspection},signal:AbortSignal.timeout(5000)});
    const data=await response.json();
    requests.push({path:'/__eval/private-cart',method:'POST',session:label,status:response.status,error:data.error,duration_ms:Date.now()-started});
    check(label+'_reaches_private_state_guard',response.status===expectedStatus&&data.error===expectedError);
    check(label+'_empty_post_body_and_host_accepted',data.error!=='EVAL_INSPECTION_REQUEST_REJECTED'&&data.error!=='EVAL_LOOPBACK_REQUIRED');
  }
  const guard=await(await fetch(`${origin}/__runtime-test-guard`)).json();
  check('outbound_fetch_blocker_zero_attempts',guard.blocked===true&&guard.outbound_attempts===0);
  await stop();
  const joined=logs.join('');
  check('logs_have_no_secret_values',![service,issuer,inspection,a['X-Armans-Session'],b['X-Armans-Session']].some(secret=>joined.includes(secret)));
  check('logs_have_no_outbound_attempt',!joined.includes('LOCAL_TEST_OUTBOUND_BLOCKED'));
}catch(error){failure=String(error?.message||'RUNTIME_TEST_FAILED');}
finally{await stop();}

// Keep a redacted log only; ephemeral secret material stays in the ignored folder.
let sanitized=logs.join('').replaceAll(service,'[REDACTED]').replaceAll(issuer,'[REDACTED]').replaceAll(inspection,'[REDACTED]');
sanitized=sanitized.replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{30,}/g,'[SESSION_REDACTED]');
const evidence={started_at:startedAt,completed_at:new Date().toISOString(),runtime:'Wrangler 4.158.0 / actual workerd with SQLite-backed Durable Object',scope:'Actual evaluation-only Worker entry: empty-body POST preserves Host and passes all three credentials to the real Durable Object state guard. Global Worker fetch is blocked by a temporary instrumentation entry; no cart creation, Shopify traffic, or commerce mutation is exercised.',wrangler_config:'temporary isolated configuration; no production bindings',port,checks,requests,all_passed:!failure&&checks.every(c=>c.passed),failure,shopify_fetch_attempts:logs.some(x=>x.includes('LOCAL_TEST_OUTBOUND_BLOCKED'))?'blocked attempt observed':0,paid_model_calls:0,processes_stopped:true};
const evidencePath=join(workbench,'sdd/evidence/eval-private-runtime-2026-11-10.json');
await writeFile(evidencePath,JSON.stringify(evidence,null,2)+'\n');
await writeFile(join(sandbox,'runtime-redacted.log'),sanitized,{mode:0o600});
console.log(JSON.stringify({...evidence,evidence_path:evidencePath},null,2));
if(failure){console.error(sanitized.slice(-7000));process.exitCode=1;}
