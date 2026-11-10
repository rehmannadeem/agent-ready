import { existsSync, mkdirSync, chmodSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createBridge, DEFAULT_PRIVATE_DIR } from './bridge.mjs';

// Load an explicitly supplied local server configuration; never use seed credentials.
const envFile=resolve(process.env.ARMANS_BRIDGE_ENV_FILE||'.env.local');
if(existsSync(envFile))process.loadEnvFile(envFile);
if(Object.entries(process.env).some(([key,value])=>key.startsWith('SEED_')&&value))throw new Error('SEED_CREDENTIAL_NOT_ALLOWED_IN_BRIDGE_PROCESS');
mkdirSync(DEFAULT_PRIVATE_DIR,{recursive:true,mode:0o700});chmodSync(DEFAULT_PRIVATE_DIR,0o700);
const bridge=createBridge({env:{COMMERCE_SERVICE_SECRET:process.env.COMMERCE_SERVICE_SECRET,SESSION_ISSUER_SECRET:process.env.SESSION_ISSUER_SECRET,SHOPIFY_STORE:process.env.SHOPIFY_STORE},dbPath:join(DEFAULT_PRIVATE_DIR,'bridge.sqlite')});
const http=bridge.server();
http.once('error',()=>{console.error('Local bridge could not bind to 127.0.0.1:8788.');bridge.close();process.exitCode=1;});
http.listen(8788,'127.0.0.1',()=>{
  const bootstrap=bridge.issueBootstrap(),path=join(DEFAULT_PRIVATE_DIR,'bootstrap-url.txt');
  writeFileSync(path,`${bootstrap.url}\n`,{mode:0o600});chmodSync(path,0o600);
  console.log('Local bridge listening on http://127.0.0.1:8788.');
  console.log(`One-use login link saved privately at ${path}; expires in five minutes. Do not publish this file.`);
});
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>http.close(()=>{bridge.close();process.exit(0);}));
