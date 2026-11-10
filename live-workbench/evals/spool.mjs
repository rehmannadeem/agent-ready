import {mkdir,open,readFile,rename,readdir} from 'node:fs/promises';
import {join} from 'node:path';
const uuid=/^[a-f0-9-]{36}$/;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function atomic(path,value){const tmp=path+'.tmp';const f=await open(tmp,'wx',0o600);try{await f.writeFile(JSON.stringify(value)+'\n');await f.sync();}finally{await f.close();}await rename(tmp,path);}

/** Local file bridge. The connector driver, not n8n Cloud, accesses these files.
 * No HTTP listener or public webhook is started. Never commit this spool.
 */
export function fileModelTransport(directory,{timeoutMs=120000,pollMs=250}={}){
 return async request=>{
  const id=request.reservation_id;if(!uuid.test(id))throw new Error('INVALID_RESERVATION_ID');
  await mkdir(directory,{recursive:true,mode:0o700});
  await atomic(join(directory,id+'.request.json'),{reservation_id:id,model:request.model,max_output_tokens:request.max_output_tokens,system:request.system,prompt:request.prompt,digest:request.digest});
  const start=Date.now();
  while(Date.now()-start<timeoutMs){
   try{const response=JSON.parse(await readFile(join(directory,id+'.response.json'),'utf8'));
    if(response.reservation_id!==id||response.model!==request.model||response.model_calls!==1||response.error)throw new Error('MODEL_BRIDGE_REJECTED');
    return {text:response.text,usage:response.usage,executionId:response.execution_id};
   }catch(e){if(e.code!=='ENOENT')throw e;}
   await sleep(pollMs);
  }
  throw new Error('MODEL_BRIDGE_TIMEOUT');
 };
}

/** Claim once before dispatch. A claimed request without a recorded execution ID
 * is ambiguous after a crash and must NOT be dispatched automatically again.
 */
export async function nextSpoolRequest(directory){
 const names=(await readdir(directory).catch(e=>e.code==='ENOENT'?[]:Promise.reject(e))).filter(x=>x.endsWith('.request.json')).sort();
 for(const name of names){const id=name.slice(0,-13);if(!uuid.test(id))continue;
  try{await readFile(join(directory,id+'.response.json'));continue;}catch(e){if(e.code!=='ENOENT')throw e;}
  const claimPath=join(directory,id+'.claim.json');
  try{const claim=JSON.parse(await readFile(claimPath,'utf8'));if(claim.execution_id)return {action:'poll',reservation_id:id,execution_id:claim.execution_id};return {action:'blocked',reservation_id:id,reason:'DISPATCH_STATE_UNKNOWN'};}
  catch(e){if(e.code!=='ENOENT')throw e;}
  let f;try{f=await open(claimPath,'wx',0o600);}catch(e){if(e.code==='EEXIST')continue;throw e;}
  try{await f.writeFile(JSON.stringify({claimed_at:new Date().toISOString()}));await f.sync();}finally{await f.close();}
  const body=JSON.parse(await readFile(join(directory,name),'utf8'));
  return {action:'execute',reservation_id:id,body};
 }
 return {action:'idle'};
}
export async function recordSpoolExecution(directory,id,executionId){
 if(!uuid.test(id)||!/^\d+$/.test(String(executionId)))throw new Error('INVALID_EXECUTION_REFERENCE');
 const path=join(directory,id+'.claim.json');const claim=JSON.parse(await readFile(path,'utf8'));
 if(claim.execution_id&&claim.execution_id!==String(executionId))throw new Error('EXECUTION_ALREADY_RECORDED');
 await atomic(path,{...claim,execution_id:String(executionId)});
}
export async function completeSpoolRequest(directory,response){
 if(!uuid.test(response?.reservation_id))throw new Error('INVALID_RESERVATION_ID');
 const claim=JSON.parse(await readFile(join(directory,response.reservation_id+'.claim.json'),'utf8'));
 if(String(response.execution_id)!==claim.execution_id)throw new Error('EXECUTION_MISMATCH');
 await atomic(join(directory,response.reservation_id+'.response.json'),response);
}
