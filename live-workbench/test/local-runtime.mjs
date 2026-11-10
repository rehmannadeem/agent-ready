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
const service=randomBytes(48).toString('base64url'),issuer=randomBytes(48).toString('base64url');
const port=8797,origin=`http://127.0.0.1:${port}`;
const logs=[],checks=[],requests=[];let child;
const startedAt=new Date().toISOString();
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const config={name:'armans-local-runtime-evidence',main:join(sandbox,'entry.mjs'),compatibility_date:'2026-11-09',workers_dev:false,preview_urls:false,durable_objects:{bindings:[{name:'SESSION_STATE',class_name:'ArmansSessionState'}]},migrations:[{tag:'runtime-v1',new_sqlite_classes:['ArmansSessionState']}],vars:{SHOPIFY_STORE:'karachi-kicks-supportops-lab.myshopify.com',SHOPIFY_API_VERSION:'2026-07',UCP_AGENT_PROFILE_URL:'https://armans-agent-ready-live.veenus-rehman.workers.dev/agent-profile.json',SESSION_REQUESTS_PER_MINUTE:'1',OBSERVABILITY_ENABLED:'true'},observability:{enabled:true},dev:{ip:'127.0.0.1',port,local_protocol:'http'}};
await writeFile(join(sandbox,'wrangler.jsonc'),JSON.stringify(config,null,2)+'\n',{mode:0o600});
await writeFile(join(sandbox,'.dev.vars'),`COMMERCE_SERVICE_SECRET=${service}\nSESSION_ISSUER_SECRET=${issuer}\n`,{mode:0o600});
await chmod(join(sandbox,'.dev.vars'),0o600);
const actual=join(workbench,'src/worker.mjs');
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
  child=spawn(process.execPath,[join(workbench,'node_modules/wrangler/bin/wrangler.js'),'dev','--config',join(sandbox,'wrangler.jsonc'),'--local','--ip','127.0.0.1','--port',String(port),'--inspector-port','9797','--persist-to',join(sandbox,'state'),'--log-level','info','--show-interactive-dev-session','false'],{cwd:workbench,env,stdio:['ignore','pipe','pipe']});
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
  const noAuth=await call('/api/mcp',{jsonrpc:'2.0',id:1,method:'tools/list'});check('missing_bearer_401',noAuth.response.status===401);
  const badAuth=await call('/api/mcp',{jsonrpc:'2.0',id:2,method:'tools/list'},{Authorization:'Bearer wrong-secret'});check('wrong_bearer_401',badAuth.response.status===401);
  const a=await auth('runtime_session_A'),b=await auth('runtime_session_B');
  const listed=await call('/api/mcp',{jsonrpc:'2.0',id:3,method:'tools/list'},a);check('signed_tools_list_seven',listed.response.status===200&&listed.data.result?.tools?.length===7,{tools:listed.data.result?.tools?.map(t=>t.name)});
  // Allow enough time before a minute boundary for the process restart; the
  // application intentionally uses a wall-clock minute for its rate bucket.
  const second=Math.floor(Date.now()/1000)%60;if(second>40)await wait((61-second)*1000);
  const firstMinute=Math.floor(Date.now()/60000);
  const first=await call('/api/shop',{name:'get_cart',arguments:{}},a);check('session_a_empty_cart_actual_do',first.response.status===200&&first.data.status==='no_current_cart');
  await stop();await start();
  check('restart_stayed_in_same_rate_minute',Math.floor(Date.now()/60000)===firstMinute);
  const secondCall=await call('/api/shop',{name:'get_cart',arguments:{}},a);check('rate_limit_survives_workerd_restart',secondCall.response.status===429&&secondCall.data.error==='SESSION_RATE_LIMITED');
  const isolated=await call('/api/shop',{name:'get_cart',arguments:{}},b);check('session_b_isolated_actual_do',isolated.response.status===200&&isolated.data.status==='no_current_cart');
  const guard=await(await fetch(`${origin}/__runtime-test-guard`)).json();check('outbound_fetch_blocker_zero_attempts',guard.blocked===true&&guard.outbound_attempts===0);
  await stop();
  const joined=logs.join('');check('logs_have_no_secret_values',![service,issuer,a['X-Armans-Session'],b['X-Armans-Session']].some(secret=>joined.includes(secret)));
  check('logs_have_no_outbound_attempt',!joined.includes('LOCAL_TEST_OUTBOUND_BLOCKED'));
  check('real_application_observability_emitted',joined.includes('"event":"request"'));
}catch(error){failure=String(error?.message||'RUNTIME_TEST_FAILED');}
finally{await stop();}

// Keep a redacted log only; ephemeral secret material stays in the ignored folder.
let sanitized=logs.join('').replaceAll(service,'[REDACTED]').replaceAll(issuer,'[REDACTED]');
sanitized=sanitized.replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{30,}/g,'[SESSION_REDACTED]');
const evidence={started_at:startedAt,completed_at:new Date().toISOString(),runtime:'Wrangler 4.158.0 / actual workerd with SQLite-backed Durable Object',scope:'Local HTTP auth, session isolation, persisted rate limiting and log redaction. Global Worker fetch is blocked by a temporary instrumentation entry; no Shopify traffic or commerce mutation is exercised.',wrangler_config:'temporary isolated configuration; no production bindings',port,checks,requests,all_passed:!failure&&checks.every(c=>c.passed),failure,shopify_fetch_attempts:logs.some(x=>x.includes('LOCAL_TEST_OUTBOUND_BLOCKED'))?'blocked attempt observed':0,paid_model_calls:0,processes_stopped:true};
const evidencePath=join(workbench,'sdd/evidence/local-runtime-2026-11-10.json');
await writeFile(evidencePath,JSON.stringify(evidence,null,2)+'\n');
await writeFile(join(sandbox,'runtime-redacted.log'),sanitized,{mode:0o600});
console.log(JSON.stringify({...evidence,evidence_path:evidencePath},null,2));
if(failure){console.error(sanitized.slice(-7000));process.exitCode=1;}
