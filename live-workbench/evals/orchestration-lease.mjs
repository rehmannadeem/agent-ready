import {readFile,writeFile,unlink} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';import {resolve} from 'node:path';import {fileURLToPath} from 'node:url';
const TTL=300000;
const valid=x=>typeof x==='string'&&/^[a-f0-9-]{36}$/.test(x);
export async function leaseStatus(path,{now=Date.now}={}){
 try{const value=JSON.parse(await readFile(path,'utf8'));if(!valid(value.token)||!Number.isFinite(value.heartbeat_ms))return {status:'BLOCKED_UNKNOWN'};return {status:now()-value.heartbeat_ms>TTL?'STALE_REQUIRES_RECONCILIATION':'ACTIVE',lease_id:value.token,heartbeat_at:new Date(value.heartbeat_ms).toISOString()};}catch(e){if(e.code==='ENOENT')return {status:'FREE'};return {status:'BLOCKED_UNKNOWN'};}
}
export async function acquireLease(path,{now=Date.now}={}){
 const token=randomUUID(),at=now();try{await writeFile(path,JSON.stringify({token,created_ms:at,heartbeat_ms:at})+'\n',{flag:'wx',mode:0o600});return {status:'ACQUIRED',lease_id:token};}catch(e){if(e.code==='EEXIST')return leaseStatus(path,{now});throw e;}
}
// Serialize heartbeat/release using an exclusive companion lock. Never delete an
// existing companion lock automatically: interrupted mutations require review.
async function mutate(path,token,operation,{now=Date.now}={}){
 if(!valid(token))throw Error('LEASE_TOKEN_REQUIRED');const lock=path+'.operation';
 try{await writeFile(lock,token,{flag:'wx',mode:0o600});}catch(e){if(e.code==='EEXIST')return {status:'BUSY_OR_INTERRUPTED'};throw e;}
 try{let value;try{value=JSON.parse(await readFile(path,'utf8'));}catch(e){if(e.code==='ENOENT')return {status:'NOT_FOUND'};return {status:'BLOCKED_UNKNOWN'};}
  if(value.token!==token)return {status:'OWNER_MISMATCH'};
  if(operation==='release'){await unlink(path);return {status:'RELEASED'};}
  if(!Number.isFinite(value.heartbeat_ms)||now()-value.heartbeat_ms>TTL)return {status:'STALE_REQUIRES_RECONCILIATION'};
  value.heartbeat_ms=now();await writeFile(path,JSON.stringify(value)+'\n',{mode:0o600});return {status:'HEARTBEAT',lease_id:token};
 }finally{await unlink(lock);}
}
export const heartbeatLease=(path,token,options)=>mutate(path,token,'heartbeat',options);
export const releaseLease=(path,token,options)=>mutate(path,token,'release',options);
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [action,path,token]=process.argv.slice(2);try{if(!path||!['acquire','status','heartbeat','release'].includes(action))throw Error('LEASE_COMMAND_REQUIRED');const result=await ({acquire:()=>acquireLease(path),status:()=>leaseStatus(path),heartbeat:()=>heartbeatLease(path,token),release:()=>releaseLease(path,token)})[action]();console.log(JSON.stringify(result));if(!['ACQUIRED','FREE','HEARTBEAT','RELEASED'].includes(result.status))process.exitCode=2;}catch{console.error(JSON.stringify({status:'LEASE_OPERATION_FAILED'}));process.exitCode=1;}
}
