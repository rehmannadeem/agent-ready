import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {signSession} from '../src/session-security.mjs';
import {createWorkerClient,createRequestPacer,createRateLimitGuard} from './runner.mjs';

const absentCart=r=>r?.error==='NO_CURRENT_CART'||(!r?.error&&['not_found','no_current_cart'].includes(r?.status)&&Array.isArray(r.line_items)&&r.line_items.length===0);
export async function cleanupCurrentCart(client,session){
 const current=await client.callTool('get_cart',{},session);
 if(absentCart(current))return;
 if(current?.error||!Array.isArray(current?.line_items))throw Error('CART_CLEANUP_READ_UNCONFIRMED');
 const cancelled=await client.callTool('cancel_cart',{},session);
 if(cancelled?.error)throw Error('CART_CLEANUP_CANCELLATION_UNCONFIRMED');
 const verified=await client.callTool('get_cart',{},session);
 if(!absentCart(verified))throw Error('CART_CLEANUP_UNCONFIRMED');
}

/** Owner-controlled Node adapter, NEVER browser code. Point ARMANS_EVAL_CONFIG at
 * a private, ignored JSON file containing worker_url, service_secret and
 * session_issuer_secret. No Shopify write credential is accepted here.
 * Optional controller_module supplies separately approved simulations and their
 * assertions/restoration. Missing simulation capabilities block those scenarios.
 */
export async function createAdapter({oracle}){
 if(!process.env.ARMANS_EVAL_CONFIG)throw Error('ARMANS_EVAL_CONFIG_REQUIRED');
 const config=JSON.parse(await readFile(process.env.ARMANS_EVAL_CONFIG,'utf8'));
 if(typeof config.service_secret!=='string'||config.service_secret.length<32||typeof config.session_issuer_secret!=='string'||config.session_issuer_secret.length<32)throw Error('PRIVATE_SERVICE_CONFIGURATION_REQUIRED');
 const healthResponse=await fetch(new URL('/api/health',config.worker_url),{signal:AbortSignal.timeout(10000)});
 const health=await healthResponse.json();if(!healthResponse.ok||health.store!==oracle.seed.store)throw Error('STORE_MISMATCH');
 const createSession=async()=>{const now=Math.floor(Date.now()/1000);return {sub:'armans_eval_owner',sid:'eval_'+randomUUID().replaceAll('-','_'),store:oracle.seed.store,market:'US',currency:'USD',iat:now,exp:now+3600};};
 const headersForSession=async s=>({Authorization:'Bearer '+config.service_secret,'X-Armans-Session':await signSession(s,config.session_issuer_secret)});
 const guard=createRateLimitGuard(),pace=createRequestPacer({minIntervalMs:config.min_request_interval_ms??0});
 const beforeRequest=async()=>{guard.check();await pace();guard.check();};
 const base=createWorkerClient({baseUrl:config.worker_url,headersForSession,beforeRequest,observeResult:guard.observe});
 const rawRequest=async({session,body,headersOverride={},path='/api/mcp'})=>{
  if(!['/api/mcp','/api/shop'].includes(path))throw Error('COMPANION_PATH_NOT_ALLOWED');
  const headers={...await headersForSession(session),'Content-Type':'application/json',...headersOverride};
  for(const k of Object.keys(headers))if(headers[k]===null||headers[k]===undefined)delete headers[k];
  await beforeRequest();
  const response=await fetch(new URL(path,config.worker_url),{method:'POST',redirect:'error',headers,body:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
  if(response.status===429){guard.observe({http_status:429});guard.check();}
  const text=await response.text();if(Buffer.byteLength(text)>524288)throw Error('COMPANION_RESPONSE_TOO_LARGE');
  let parsed;try{parsed=JSON.parse(text);}catch{throw Error('COMPANION_RESPONSE_INVALID');}
  let result=parsed.result?.structuredContent;
  if(!result&&parsed.result?.content?.[0]?.text){try{result=JSON.parse(parsed.result.content[0].text);}catch{}}
  guard.observe({...result,http_status:response.status});guard.check();
  return {status:response.status,body:parsed};
 };
 const faults=new Map();
 const client={async callTool(name,args,s){const fault=faults.get(s.sid);if(fault){faults.delete(s.sid);return {...fault,fault_injection:true,latency_ms:0};}return base.callTool(name,args,s);}};
 let getPrivateCartId;
 if(config.private_cart_inspection_secret){
  const {createPrivateCartInspector}=await import('../dev/private-cart-inspector.mjs');
  getPrivateCartId=createPrivateCartInspector({workerUrl:config.worker_url,inspectionSecret:config.private_cart_inspection_secret,headersForSession});
 }
 const controllerModule=config.controller_module?await import(pathToFileURL(resolve(config.controller_module))):{};
 const controller=typeof controllerModule.createController==='function'?await controllerModule.createController({oracle,client:base,createSession,workerUrl:config.worker_url,headersForSession,rawRequest,controllerConfigPath:config.controller_config_path,agentProfileUrl:config.agent_profile_url,getPrivateCartId}):controllerModule;
 const capacities=['setup_two_line_cart','setup_shoe_bottle_cart','setup_discount_cart','setup_below_minimum_cart','exclusion_companion_checks','late_page_preflight','inject_429_turn1_timeout_turn2'];
 const checkpoints=new Map();
 function line(key,quantity=1){const v=oracle.variant(key,key.includes('shoe')?{Size:'10',Colour:'Black'}:{});return {variant_id:v.id,quantity};}
 const adapter={
  getSuspension:guard.get,client,capabilities:[...new Set([...capacities,...(controller.capabilities||[])])],
  createSession,
  async prepareScenario({spec,session}){
   let currentState={},context={},restore;
   const localEvidence=[];
   if(spec.hooks.some(h=>h.startsWith('setup_')&&h!=='setup_cross_session_cart')){
    const lines=[line('bundle_shoe'),line(spec.hooks.includes('setup_shoe_bottle_cart')?'bundle_bottle':'bundle_socks')];
    const cart=await client.callTool('create_cart',{line_items:lines},session);
    if(cart.error||cart.line_items?.length!==2||cart.messages?.some(m=>m.type==='error'))throw Error('FIXTURE_CART_SETUP_FAILED');
    currentState={last_observed_cart:cart};
    if(spec.hooks.includes('setup_below_minimum_cart'))currentState.approved_addition={...line('bundle_bottle',2),title:oracle.product('bundle_bottle').title};
    localEvidence.push({name:'fixture_cart_prepared',pass:true});
   }
   if(spec.hooks.includes('exclusion_companion_checks')){
    for(const fid of oracle.seed.fixtures.exclusions){
     const p=oracle.product(fid),pid=oracle.productId(fid),vid=oracle.variant(fid).id;
     const search=await client.callTool('search_catalog',{query:p.title,limit:10},session);
     const lookup=await client.callTool('lookup_catalog',{ids:[pid,vid]},session);
     const detail=await client.callTool('get_product',{id:pid},session);
     const mutation=await client.callTool('create_cart',{line_items:[{variant_id:vid,quantity:1}]},session);
     const pass=!search.error&&!lookup.error&&!(search.products||[]).some(x=>x.id===pid)&&!(lookup.products||[]).some(x=>x.id===pid)&&!detail.error&&!detail.product&&['PRODUCT_UNAVAILABLE','PRODUCT_NOT_ELIGIBLE','VARIANT_NOT_ELIGIBLE','CATALOG_NOT_ELIGIBLE'].includes(mutation.error);
     localEvidence.push({name:'excluded_'+fid,pass});
     if(!pass)throw Error('EXCLUSION_COMPANION_FAILED:'+fid);
    }
   }
   if(spec.hooks.includes('late_page_preflight')){
    let cursor,targetPage=null;
    for(let page=1;page<=10;page++){
     const r=await client.callTool('search_catalog',{query:'Running Shoe',limit:10,...(cursor?{cursor}:{})},session);
     if(r.error)throw Error('PAGING_PREFLIGHT_FAILED');
     if(r.products?.some(p=>p.id===oracle.productId('late_page'))){targetPage=page;break;}
     if(!r.next_cursor)break;cursor=r.next_cursor;
    }
    if(!targetPage||targetPage===1)throw Error('LATE_PAGE_FIXTURE_NOT_BEYOND_FIRST_PAGE');
    localEvidence.push({name:'late_page_fixture_observed',pass:true,page:targetPage});
   }
   const extra=await controller.prepareScenario?.({spec,session,oracle,client,context,currentState})||{};
   context={...context,...extra.context};currentState={...currentState,...extra.currentState};restore=extra.restore;
   checkpoints.set(session.sid,{localEvidence,context});return {context,currentState,restore};
  },
  async beforeTurn(args){
   if(args.spec.id==='S25')faults.set(args.session.sid,args.turn===1?{error:'RATE_LIMITED',message:'Injected upstream HTTP 429. Retry-After: 1 second.',http_status:429,retry_after:1}:{error:'UPSTREAM_UNREACHABLE',message:'Injected upstream timeout. The request outcome is unknown; do not claim success.'});
   await controller.beforeTurn?.({...args,client});
  },
  async assertScenario(args){
   const checks=[...(checkpoints.get(args.session.sid)?.localEvidence||[])];
   if(args.spec.id==='S25')checks.push({name:'both_faults_injected',pass:[1,2].every(n=>args.run.turns.find(t=>t.number===n)?.events.some(e=>e.kind==='tool'&&e.result?.fault_injection))});
   checks.push(...(await controller.assertScenario?.({...args,client})||[]));return checks;
  },
  async cleanup({session}){
   if(!session)return;
   faults.delete(session.sid);
   const errors=[];
   try{await cleanupCurrentCart(base,session);}catch(e){errors.push(e.message);}
   try{guard.check();await controller.cleanup?.({session,oracle,client:base});}catch(e){errors.push(e.message);}
   checkpoints.delete(session.sid);if(errors.length)throw Error(errors.join('; '));
  }
 };
 return adapter;
}
