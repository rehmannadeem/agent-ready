import {mkdir,open,realpath,unlink} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {hostname} from 'node:os';

// This is a process lock, not a lease. Age or a missing PID never authorizes
// automatic removal: an interrupted Shopify write may still need reconciliation.
export async function acquireManifestLock(requestedPath){
 const requested=path.resolve(requestedPath);await mkdir(path.dirname(requested),{recursive:true});
 let manifestFile;try{manifestFile=await realpath(requested);}catch(error){if(error.code!=='ENOENT')throw error;manifestFile=path.join(await realpath(path.dirname(requested)),path.basename(requested));}
 const lockFile=`${manifestFile}.lock`;const owner=randomUUID();let handle;
 try{handle=await open(lockFile,'wx',0o600);}catch(error){if(error.code==='EEXIST')throw Error(`MANIFEST_LOCKED: ${lockFile}. Another process or an interrupted run owns this lock; operator review is required. No automatic stale-lock removal.`);throw error;}
 const record={schema_version:1,owner,pid:process.pid,host:hostname(),created_at:new Date().toISOString(),manifest_file:manifestFile};let identity;
 try{await handle.writeFile(JSON.stringify(record,null,2)+'\n','utf8');await handle.sync();identity=await handle.stat();}finally{await handle.close();}
 let released=false;
 return {manifestFile,lockFile,owner,async release(){
  if(released)return;let current;
  try{current=await open(lockFile,'r');}catch(error){if(error.code==='ENOENT')throw Error('MANIFEST_LOCK_MISSING_DURING_RELEASE');throw error;}
  try{const stat=await current.stat();const observed=JSON.parse(await current.readFile('utf8'));if(observed.owner!==owner||stat.dev!==identity.dev||stat.ino!==identity.ino)throw Error('MANIFEST_LOCK_OWNERSHIP_CHANGED');}finally{await current.close();}
  await unlink(lockFile);released=true;
 }};
}

export async function withManifestLock(manifestFile,work){const lock=await acquireManifestLock(manifestFile);try{return await work(lock);}finally{await lock.release();}}
