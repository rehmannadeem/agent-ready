import {STORE} from './generate.mjs';
import {Q} from './operations.mjs';
export const API_VERSION='2026-07';
export const APPROVED_SCOPES=['write_products','write_inventory','write_publications','write_discounts'];
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export class SeedAdmin {
 constructor({token,store=STORE,fetcher=fetch,pause=delay}){if(store!==STORE)throw Error('STORE_MISMATCH');if(!token)throw Error('SEED_ACCESS_TOKEN_REQUIRED');this.token=token;this.store=store;this.fetcher=fetcher;this.pause=pause;this.writeEnabled=false;this.throttle=null;this.requests=0;this.costs=new Map();this.lastResponseAt=Date.now();}
 async raw(query,variables={}){
  const mutation=/^\s*mutation\b/.test(query);if(mutation&&!this.writeEnabled)throw Error('PREFLIGHT_REQUIRED');
  if(this.validateOperation)this.validateOperation(query,variables);
  const operation=query.match(/^\s*(?:query|mutation)\s+(\w+)/)?.[1]||'anonymous';const reserve=this.costs.get(operation)||(operation==='SeedProduct'?1000:250);
  if(this.throttle){const available=Math.min(this.throttle.maximumAvailable,this.throttle.currentlyAvailable+(Date.now()-this.lastResponseAt)/1000*this.throttle.restoreRate);if(reserve>this.throttle.maximumAvailable)throw Error('QUERY_COST_EXCEEDS_BUCKET');const ms=Math.max(0,Math.ceil((reserve-available)/this.throttle.restoreRate*1000));if(ms>60000)throw Error('RATE_WAIT_EXCEEDS_60_SECONDS');if(ms>0)await this.pause(ms);}
  const response=await this.fetcher(`https://${this.store}/admin/api/${API_VERSION}/graphql.json`,{method:'POST',headers:{'Content-Type':'application/json','X-Shopify-Access-Token':this.token},body:JSON.stringify({query,variables}),signal:AbortSignal.timeout(45000)});this.requests++;
  if(response.status===429)throw Error(`RATE_LIMIT_STOP retry_after=${response.headers.get('Retry-After')||'unknown'}`);
  if(!response.ok)throw Error(`ADMIN_HTTP_${response.status}`);
  const version=response.headers.get('X-Shopify-API-Version');if(version!==API_VERSION)throw Error(`API_VERSION_MISMATCH:${version||'missing'}`);
  const body=await response.json();if(body.extensions?.cost?.throttleStatus)this.throttle=body.extensions.cost.throttleStatus;if(body.extensions?.cost?.requestedQueryCost)this.costs.set(operation,body.extensions.cost.requestedQueryCost);this.lastResponseAt=Date.now();
  if(body.errors?.length)throw Error(`ADMIN_GRAPHQL_ERROR:${body.errors.map(e=>`${e.extensions?.code||'ERROR'}:${e.message}`).join('; ').slice(0,1500)}`);
  if(!body.data)throw Error('ADMIN_NO_DATA');return body.data;
 }
 async query(name,variables={}){if(!Q[name])throw Error(`UNKNOWN_OPERATION:${name}`);const data=await this.raw(Q[name],variables);for(const value of Object.values(data))if(value?.userErrors?.length)throw Error(`ADMIN_USER_ERRORS:${JSON.stringify(value.userErrors)}`);return data;}
 authorize(report){if(report.ok!==true||report.store!==this.store||report.schema_checked!==true||typeof this.validateOperation!=='function')throw Error('PREFLIGHT_NOT_PASSED');this.writeEnabled=true;}
}
export async function adminFromEnvironment(env=process.env){
 if(env.SHOPIFY_STORE&&env.SHOPIFY_STORE!==STORE)throw Error('STORE_MISMATCH');
 let token=env.SEED_ACCESS_TOKEN;
 if(!token&&env.SEED_CLIENT_ID&&env.SEED_CLIENT_SECRET){const response=await fetch(`https://${STORE}/admin/oauth/access_token`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'client_credentials',client_id:env.SEED_CLIENT_ID,client_secret:env.SEED_CLIENT_SECRET}),signal:AbortSignal.timeout(30000)});if(!response.ok)throw Error(`SEED_AUTH_HTTP_${response.status}`);const data=await response.json();token=data.access_token;}
 return new SeedAdmin({token});
}
export async function paginate(admin,name,path,variables={}){const nodes=[];let after=null;for(let page=0;page<200;page++){const data=await admin.query(name,{...variables,after});const connection=path.split('.').reduce((x,k)=>x?.[k],data);if(!connection||!Array.isArray(connection.nodes))throw Error(`PAGINATION_SHAPE:${name}`);nodes.push(...connection.nodes);if(!connection.pageInfo.hasNextPage)return nodes;if(!connection.pageInfo.endCursor||connection.pageInfo.endCursor===after)throw Error(`PAGINATION_STALLED:${name}`);after=connection.pageInfo.endCursor;}throw Error(`PAGINATION_CAP:${name}`);}
