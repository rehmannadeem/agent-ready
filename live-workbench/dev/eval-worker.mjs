// Evaluation-only entry. Never use this entry/config for a remote deployment.
import worker from '../src/worker.mjs';
import {ArmansSessionState as RuntimeSessionState} from '../src/session-state.mjs';
import {authenticateCommerce,sessionKey} from '../src/session-security.mjs';
const STORE='karachi-kicks-supportops-lab.myshopify.com';
const EXTERNAL='/__eval/private-cart',INTERNAL='/__eval/inspect-owned-cart';
const cartPattern=/^gid:\/\/shopify\/Cart\/[A-Za-z0-9_-]+(?:\?key=[A-Za-z0-9_%-]+)?$/;
const deny=(error,status=403)=>new Response(JSON.stringify({error}),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
const fail=(code,status=403)=>Object.assign(new Error(code),{status});
function localRequest(req){
 const url=new URL(req.url);
 return url.protocol==='http:'&&['127.0.0.1','localhost'].includes(url.hostname)&&!url.username&&!url.password&&req.headers.get('host')===url.host;
}
async function requireEmptyBody(req){
 if(req.body===null)return;
 const reader=req.body.getReader();let timer;
 try{
  const item=await Promise.race([reader.read(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(fail('EVAL_INSPECTION_REQUEST_REJECTED')),1000);})]);
  if(!item.done)throw fail('EVAL_INSPECTION_REQUEST_REJECTED');
 }finally{clearTimeout(timer);await reader.cancel().catch(()=>{});}
}
async function inspectionPrincipal(req,env){
 const secret=env.LOCAL_EVAL_INSPECTION_SECRET;
 if(env.SHOPIFY_STORE!==STORE||typeof secret!=='string'||new TextEncoder().encode(secret).length<32||secret===env.COMMERCE_SERVICE_SECRET||secret===env.SESSION_ISSUER_SECRET)throw fail('EVAL_INSPECTION_CONFIGURATION',503);
 if(req.method!=='POST'||new URL(req.url).search||req.headers.has('origin')||[...req.headers.keys()].some(k=>k.startsWith('sec-fetch-')&&(k!=='sec-fetch-mode'||req.headers.get(k)!=='cors')))throw fail('EVAL_INSPECTION_REQUEST_REJECTED');
 const candidate=req.headers.get('x-armans-eval-inspection')||'';
 if(candidate.length>1024)throw fail('EVAL_INSPECTION_UNAUTHORIZED',401);
 const digest=async value=>new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)));
 const [a,b]=await Promise.all([digest(secret),digest(candidate)]);let different=0;
 for(let i=0;i<a.length;i++)different|=a[i]^b[i];
 if(different)throw fail('EVAL_INSPECTION_UNAUTHORIZED',401);
 const principal=await authenticateCommerce(req,env);
 await requireEmptyBody(req);
 return principal;
}
function safeFailure(error){return deny(/^[A-Z][A-Z0-9_]+$/.test(error?.code||error?.message||'')?(error.code||error.message):'EVAL_INSPECTION_FAILED',Number.isInteger(error?.status)?error.status:503);}

// The subclass shares the runtime namespace/state and serializes inspection on
// its existing queue. No private cart operation is added to the production class.
export class ArmansSessionState extends RuntimeSessionState {
 async fetch(req){
  if(new URL(req.url).pathname!==INTERNAL)return super.fetch(req);
  const job=this.queue.then(async()=>{
   try{
    if(new URL(req.url).origin!=='https://session.internal')throw fail('EVAL_INTERNAL_ROUTE_REQUIRED');
    const principal=await inspectionPrincipal(req,this.env),owner=await sessionKey(principal);
    const state=await this.ctx.storage.get('session');
    if(!state||state.owner!==owner)throw fail('EVAL_CART_NOT_OWNED',403);
    if(state.phase!=='READY'||!Number.isInteger(state.revision)||state.revision<1||typeof state.cartId!=='string'||state.cartId.length>1024||!cartPattern.test(state.cartId))throw fail('EVAL_CART_NOT_CONFIRMED',409);
    return new Response(JSON.stringify({cart_id:state.cartId,revision:state.revision,store:STORE}),{headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
   }catch(error){return safeFailure(error);}
  });
  this.queue=job.catch(()=>{});return job;
 }
}
export default {async fetch(req,env,ctx){
 // Reject the whole evaluation entry on any non-loopback request. No redirects,
 // CORS, request-body IDs or identity headers can select a stored victim cart.
 if(!localRequest(req))return deny('EVAL_LOOPBACK_REQUIRED');
 if(new URL(req.url).pathname!==EXTERNAL)return worker.fetch(req,env,ctx);
 try{
  const principal=await inspectionPrincipal(req,env);
  if(!env.SESSION_STATE?.idFromName||!env.SESSION_STATE?.get)throw fail('EVAL_STATE_UNAVAILABLE',503);
  const stub=env.SESSION_STATE.get(env.SESSION_STATE.idFromName(await sessionKey(principal)));
  const headers=new Headers({Authorization:req.headers.get('authorization'),'X-Armans-Session':req.headers.get('x-armans-session'),'X-Armans-Eval-Inspection':req.headers.get('x-armans-eval-inspection')});
  return await stub.fetch(new Request('https://session.internal'+INTERNAL,{method:'POST',headers}));
 }catch(error){return safeFailure(error);}
}};
