import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_PRIVATE_DIR } from './bridge.mjs';

mkdirSync(DEFAULT_PRIVATE_DIR,{recursive:true,mode:0o700});chmodSync(DEFAULT_PRIVATE_DIR,0o700);
const path=join(DEFAULT_PRIVATE_DIR,'server.local.env');
// Exclusive creation prevents silently invalidating existing Worker/bridge sessions.
writeFileSync(path,`COMMERCE_SERVICE_SECRET=${randomBytes(48).toString('base64url')}\nSESSION_ISSUER_SECRET=${randomBytes(48).toString('base64url')}\nSHOPIFY_STORE=karachi-kicks-supportops-lab.myshopify.com\n`,{flag:'wx',mode:0o600});
chmodSync(path,0o600);
console.log(`Independent local server secrets created in ${path}. Values were not printed.`);
console.log('Load the same values into the isolated local Worker and bridge process. Do not place the seed app credential in either process.');
