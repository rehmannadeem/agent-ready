// Read-only Admin projection and publication gate. Sources checked 2026-11-10:
// https://shopify.dev/docs/api/admin-graphql/2026-07/objects/Product
// https://shopify.dev/docs/api/admin-graphql/2026-07/objects/ProductVariant
// https://shopify.dev/docs/api/admin-graphql/2026-07/input-objects/ContextualPublicationContext
// Runtime needs read_products and read_publications; no seed credential is used.
export class CatalogError extends Error {
  constructor(code,message,status=502){super(message);this.code=code;this.status=status;}
}
const PRODUCT_ID=/^gid:\/\/shopify\/Product\/\d+$/;
const VARIANT_ID=/^gid:\/\/shopify\/ProductVariant\/\d+$/;
const tokenCache=new Map();
const VARIANT_PAGE_SIZE=16;
const fields=`id title handle status productType vendor
  publishedOnPublication(publicationId:$publicationId)
  publishedInContext(context:{country:US})`;
const variantFields=`id title availableForSale inventoryQuantity inventoryPolicy
  inventoryItem { tracked }
  selectedOptions { name value }
  publishedOnPublication(publicationId:$publicationId)
  contextualPricing(context:{country:US}) { price { amount currencyCode } compareAtPrice { amount currencyCode } }`;
export const CATALOG_QUERY=`query WorkbenchCatalog($search:String!,$after:String,$first:Int!,$publicationId:ID!){
  shop { name currencyCode }
  products(first:$first,after:$after,query:$search,sortKey:ID){
    nodes { ${fields} variants(first:${VARIANT_PAGE_SIZE}) { nodes { ${variantFields} } pageInfo { hasNextPage endCursor } } }
    pageInfo { hasNextPage endCursor }
  }
}`;
export const VARIANTS_QUERY=`query WorkbenchVariantPage($id:ID!,$after:String,$publicationId:ID!){
  product(id:$id){ ${fields} variants(first:${VARIANT_PAGE_SIZE},after:$after){ nodes { ${variantFields} } pageInfo { hasNextPage endCursor } } }
}`;
export const PRODUCT_GATE_QUERY=`query WorkbenchProductEligibility($ids:[ID!]!,$publicationId:ID!){
  nodes(ids:$ids){ ... on Product { ${fields} } }
}`;
export const VARIANT_GATE_QUERY=`query WorkbenchVariantEligibility($ids:[ID!]!,$publicationId:ID!){
  nodes(ids:$ids){ ... on ProductVariant { id availableForSale publishedOnPublication(publicationId:$publicationId) product { ${fields} } } }
}`;
export function storeHost(env){
  if(!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(env.SHOPIFY_STORE||''))throw new CatalogError('CONFIGURATION','Configure the approved Shopify development store.',503);
  return env.SHOPIFY_STORE;
}
function configuration(env,context={}){
  const store=storeHost(env);
  if(!/^20\d{2}-(01|04|07|10)$/.test(env.SHOPIFY_API_VERSION||''))throw new CatalogError('CONFIGURATION','Configure a supported Shopify API version.',503);
  if(!/^gid:\/\/shopify\/Publication\/\d+$/.test(env.SHOPIFY_PUBLICATION_ID||''))throw new CatalogError('PUBLICATION_NOT_CONFIGURED','Verify and configure the Online Store publication before browsing.',503);
  if(context.store!==undefined&&context.store!==store||context.market!==undefined&&context.market!=='US'||context.currency!==undefined&&context.currency!=='USD')throw new CatalogError('CONTEXT_DENIED','The configured shopping context is US / USD.',403);
  return {store,publicationId:env.SHOPIFY_PUBLICATION_ID};
}
async function boundedJSON(response){
  if(!response.body)throw new CatalogError('SHOPIFY_RESPONSE_SHAPE','Shopify returned no data.');
  const reader=response.body.getReader();let size=0,body='';const decoder=new TextDecoder();
  try{while(true){const{value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>1048576)throw new CatalogError('RESPONSE_TOO_LARGE','Shopify response exceeded the allowed size.');body+=decoder.decode(value,{stream:true});}body+=decoder.decode();}
  finally{await reader.cancel().catch(()=>{});}
  try{return JSON.parse(body);}catch{throw new CatalogError('UPSTREAM_INVALID_JSON','Shopify returned invalid JSON.');}
}
async function request(url,init,fetcher){try{return await fetcher(url,{...init,redirect:'manual',signal:AbortSignal.timeout(15000)});}catch{throw new CatalogError('UPSTREAM_UNREACHABLE','Shopify did not respond. Try again later.');}}
function checkStatus(response){
  if(response.status===429)throw new CatalogError('RATE_LIMITED','Shopify is limiting requests. Wait before retrying.',429);
  if([401,403].includes(response.status))throw new CatalogError('SHOPIFY_AUTH','Shopify rejected the read-only runtime app. Verify its product and publication read permissions.',503);
  if(!response.ok)throw new CatalogError('UPSTREAM_HTTP',`Shopify returned HTTP ${response.status}.`);
}
async function getToken(env,fetcher){
  const store=storeHost(env);
  if(!env.SHOPIFY_CLIENT_ID||!env.SHOPIFY_CLIENT_SECRET)throw new CatalogError('SETUP_REQUIRED','Configure the read-only runtime Shopify app credentials.',503);
  const key=`${store}:${env.SHOPIFY_CLIENT_ID}`,cached=tokenCache.get(key);
  if(cached&&cached.expires>Date.now())return cached.token;
  const res=await request(`https://${store}/admin/oauth/access_token`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',Accept:'application/json'},body:new URLSearchParams({grant_type:'client_credentials',client_id:env.SHOPIFY_CLIENT_ID,client_secret:env.SHOPIFY_CLIENT_SECRET}).toString()},fetcher);
  checkStatus(res);const data=await boundedJSON(res);
  if(typeof data.access_token!=='string'||!data.access_token||!Number.isFinite(data.expires_in)||data.expires_in<=0)throw new CatalogError('SHOPIFY_AUTH','Shopify did not return a usable access token.',503);
  tokenCache.set(key,{token:data.access_token,expires:Date.now()+Math.max(0,data.expires_in-120)*1000});return data.access_token;
}
export async function adminRead(env,query,variables,fetcher=fetch){
  const {store}=configuration(env);const token=await getToken(env,fetcher);
  const response=await request(`https://${store}/admin/api/${env.SHOPIFY_API_VERSION}/graphql.json`,{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json','X-Shopify-Access-Token':token},body:JSON.stringify({query,variables})},fetcher);
  if(response.status===401)tokenCache.delete(`${store}:${env.SHOPIFY_CLIENT_ID}`);
  checkStatus(response);const payload=await boundedJSON(response);
  if(payload.errors?.length){const throttled=payload.errors.some(e=>e.extensions?.code==='THROTTLED');throw new CatalogError(throttled?'RATE_LIMITED':'SHOPIFY_QUERY_ERROR',throttled?'Shopify is limiting requests. Wait before retrying.':'Shopify could not complete the read-only query. Verify publication scopes and API schema.',throttled?429:502);}
  if(!payload.data||typeof payload.data!=='object')throw new CatalogError('SHOPIFY_RESPONSE_SHAPE','Shopify did not return the expected catalog structure.');
  return payload.data;
}
function eligible(p){return p&&PRODUCT_ID.test(p.id)&&p.status==='ACTIVE'&&p.publishedOnPublication===true&&p.publishedInContext===true;}
function idsValid(ids,pattern,max){return Array.isArray(ids)&&ids.length<=max&&ids.every(id=>typeof id==='string'&&pattern.test(id));}
async function variantEligibility(ids,env,fetcher,publicationId){
  if(!idsValid(ids,VARIANT_ID,2048))throw new CatalogError('ELIGIBILITY_UNKNOWN','Variant visibility could not be verified.',403);
  const rows=[];const unique=[...new Set(ids)];
  for(let start=0;start<unique.length;start+=100){
    const data=await adminRead(env,VARIANT_GATE_QUERY,{ids:unique.slice(start,start+100),publicationId},fetcher);
    if(!Array.isArray(data.nodes))throw new CatalogError('ELIGIBILITY_UNKNOWN','Variant visibility could not be verified.',503);
    rows.push(...data.nodes.filter(v=>v&&VARIANT_ID.test(v.id)&&v.publishedOnPublication===true&&eligible(v.product)));
  }
  return new Map(rows.map(v=>[v.id,v]));
}
export async function gateProducts(products,env,fetcher=fetch,context={}){
  const{publicationId}=configuration(env,context);
  if(!Array.isArray(products)||products.length>10||!products.every(p=>p&&PRODUCT_ID.test(p.id)))throw new CatalogError('ELIGIBILITY_UNKNOWN','Product visibility could not be verified.',403);
  if(!products.length)return[];
  const data=await adminRead(env,PRODUCT_GATE_QUERY,{ids:[...new Set(products.map(p=>p.id))],publicationId},fetcher);
  if(!Array.isArray(data.nodes))throw new CatalogError('ELIGIBILITY_UNKNOWN','Product visibility could not be verified.',503);
  const allowed=new Set(data.nodes.filter(eligible).map(p=>p.id));
  const visible=products.filter(p=>allowed.has(p.id));
  const variantIds=visible.flatMap(p=>Array.isArray(p.variants)?p.variants.map(v=>v.id):[]);
  const variants=await variantEligibility(variantIds,env,fetcher,publicationId);
  return visible.map(p=>({...p,variants:(p.variants||[]).filter(v=>variants.get(v.id)?.product.id===p.id).map(v=>({...v,availability:{...v.availability,available:v.availability?.available===true&&variants.get(v.id).availableForSale===true}}))}));
}
export async function gateVariants(ids,env,fetcher=fetch,context={}){
  const{publicationId}=configuration(env,context);
  if(!idsValid(ids,VARIANT_ID,10))throw new CatalogError('INVALID_INPUT','Choose up to ten valid variants.',400);
  if(!ids.length)return true;
  const allowed=await variantEligibility(ids,env,fetcher,publicationId);
  if(ids.some(id=>!allowed.has(id)||allowed.get(id).availableForSale!==true))throw new CatalogError('PRODUCT_UNAVAILABLE','One or more selected variants are unavailable in this shop and market.',403);
  return true;
}
const quote=s=>`"${s.replace(/\\/g,'\\\\').replace(/"/g,'\\"')}"`;
export function parseCatalogFilters(params=new URLSearchParams()){
  const allowed=new Set(['q','category','vendor','min_price','max_price','in_stock','cursor','limit']);
  for(const key of params.keys())if(!allowed.has(key)||params.getAll(key).length!==1)throw new CatalogError('INVALID_FILTER','Unsupported or repeated catalog filter.',400);
  const filters={q:params.get('q')||'',category:params.get('category')||'',vendor:params.get('vendor')||'',min_price:null,max_price:null,in_stock:false,limit:10};
  for(const key of ['q','category','vendor'])if(filters[key].length>(key==='q'?160:80)||/[\u0000-\u001f\u007f]/.test(filters[key]))throw new CatalogError('INVALID_FILTER','Catalog text filters are too long or invalid.',400);
  for(const key of ['min_price','max_price'])if(params.has(key)){const raw=params.get(key);if(!/^\d+$/.test(raw)||Number(raw)>1000000)throw new CatalogError('INVALID_FILTER','Price filters must be whole cents between zero and 1,000,000.',400);filters[key]=Number(raw);}
  if(filters.min_price!==null&&filters.max_price!==null&&filters.min_price>filters.max_price)throw new CatalogError('INVALID_FILTER','Minimum price exceeds maximum price.',400);
  if(params.has('in_stock')&&!['true','false'].includes(params.get('in_stock')))throw new CatalogError('INVALID_FILTER','in_stock must be true or false.',400);
  filters.in_stock=params.get('in_stock')==='true';
  if(params.has('limit')){if(!/^[1-9]$|^10$/.test(params.get('limit')))throw new CatalogError('INVALID_FILTER','Page size must be one to ten.',400);filters.limit=Number(params.get('limit'));}
  const cursor=params.get('cursor');if(cursor!==null&&(cursor.length>2048||!cursor))throw new CatalogError('INVALID_CURSOR','Invalid catalog cursor.',400);
  return{filters,cursor};
}
function b64(data){return btoa(String.fromCharCode(...data)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
function unb64(s){if(!/^[A-Za-z0-9_-]+$/.test(s))throw new Error('invalid');return Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));}
async function cursorKey(env){if(typeof env.COMMERCE_SERVICE_SECRET!=='string'||env.COMMERCE_SERVICE_SECRET.length<32)throw new CatalogError('CONFIGURATION','Configure the protected catalog service.',503);return crypto.subtle.importKey('raw',new TextEncoder().encode(env.COMMERCE_SERVICE_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);}
function filterBinding(filters,env){return JSON.stringify({filters,store:storeHost(env),publication:env.SHOPIFY_PUBLICATION_ID,market:'US',currency:'USD'});}
async function encodeCursor(after,filters,env){const part=b64(new TextEncoder().encode(JSON.stringify({after,binding:filterBinding(filters,env)})));const signature=await crypto.subtle.sign('HMAC',await cursorKey(env),new TextEncoder().encode(part));return `${part}.${b64(new Uint8Array(signature))}`;}
async function decodeCursor(cursor,filters,env){if(!cursor)return null;try{const [part,sig,...rest]=cursor.split('.');if(rest.length||!part||!sig)throw Error();const valid=await crypto.subtle.verify('HMAC',await cursorKey(env),unb64(sig),new TextEncoder().encode(part));if(!valid)throw Error();const data=JSON.parse(new TextDecoder().decode(unb64(part)));if(data.binding!==filterBinding(filters,env)||typeof data.after!=='string'||data.after.length>1024)throw Error();return data.after;}catch(e){if(e instanceof CatalogError&&e.status===503)throw e;throw new CatalogError('INVALID_CURSOR','The cursor does not match these filters. Start a new search.',400);}}
function moneyCents(value){if(typeof value!=='string'||!/^\d+(?:\.\d{1,2})?$/.test(value))return null;const[a,b='']=value.split('.');const cents=Number(a)*100+Number(b.padEnd(2,'0'));return Number.isSafeInteger(cents)?cents:null;}
function projectVariant(v,filters){
  const price=v.contextualPricing?.price,amount=moneyCents(price?.amount);
  if(v.publishedOnPublication!==true||price?.currencyCode!=='USD'||amount===null)return null;
  if(filters.min_price!==null&&amount<filters.min_price||filters.max_price!==null&&amount>filters.max_price||filters.in_stock&&v.availableForSale!==true)return null;
  let stock='Unavailable';if(v.availableForSale===true){if(v.inventoryItem?.tracked===false)stock='Available · stock untracked';else if(v.inventoryPolicy==='CONTINUE'&&!(v.inventoryQuantity>0))stock='Available on backorder';else if(v.inventoryQuantity>0&&v.inventoryQuantity<=3)stock='Low stock';else stock='Available';}
  return{id:v.id,title:v.title,price:price.amount,currency:'USD',amount,available:v.availableForSale===true,stock,options:(v.selectedOptions||[]).map(o=>({name:o.name,value:o.value}))};
}
export async function readCatalog(env,fetcher=fetch,params=new URLSearchParams(),context={}){
  const{store,publicationId}=configuration(env,context),{filters,cursor}=parseCatalogFilters(params),after=await decodeCursor(cursor,filters,env);
  const search=['status:active','published_status:published',filters.q?quote(filters.q):'',filters.category?`product_type:${quote(filters.category)}`:'',filters.vendor?`vendor:${quote(filters.vendor)}`:''].filter(Boolean).join(' AND ');
  const data=await adminRead(env,CATALOG_QUERY,{search,after,first:filters.limit,publicationId},fetcher);
  if(!Array.isArray(data.products?.nodes)||typeof data.products.pageInfo?.hasNextPage!=='boolean'||!data.shop?.name||data.shop.currencyCode!=='USD')throw new CatalogError('SHOPIFY_RESPONSE_SHAPE','The catalog response or configured currency does not match US / USD.');
  const products=[];
  for(const p of data.products.nodes){
    if(!eligible(p))continue;
    if(!Array.isArray(p.variants?.nodes)||typeof p.variants.pageInfo?.hasNextPage!=='boolean')throw new CatalogError('SHOPIFY_RESPONSE_SHAPE','Variant pagination was incomplete.');
    let variants=[...p.variants.nodes],page=p.variants.pageInfo;const seen=new Set();let stillEligible=true;
    while(page.hasNextPage){
      if(typeof page.endCursor!=='string'||!page.endCursor||seen.has(page.endCursor)||variants.length>=2048)throw new CatalogError('PAGINATION_FAILED','Variant pagination could not be completed safely.');
      seen.add(page.endCursor);const next=await adminRead(env,VARIANTS_QUERY,{id:p.id,after:page.endCursor,publicationId},fetcher);
      if(!eligible(next.product)){stillEligible=false;break;}
      if(!Array.isArray(next.product.variants?.nodes)||typeof next.product.variants.pageInfo?.hasNextPage!=='boolean')throw new CatalogError('SHOPIFY_RESPONSE_SHAPE','Variant pagination was incomplete.');
      variants.push(...next.product.variants.nodes);page=next.product.variants.pageInfo;
    }
    if(!stillEligible)continue;
    const projected=variants.map(v=>projectVariant(v,filters)).filter(Boolean);if(!projected.length)continue;
    products.push({id:p.id,title:p.title,handle:p.handle,status:p.status,category:p.productType,vendor:p.vendor,product_url:`https://${store}/products/${encodeURIComponent(p.handle)}`,variants:projected,more_variants:false});
  }
  const page=data.products.pageInfo;
  if(page.hasNextPage&&(!page.endCursor||typeof page.endCursor!=='string'))throw new CatalogError('PAGINATION_FAILED','Shopify omitted the next product cursor.');
  return{source:'Shopify Admin API',environment:'development store',observed_at:new Date().toISOString(),store,shop_name:data.shop.name,currency:'USD',market:'US',products,filters,pagination:{has_next_page:page.hasNextPage,cursor:page.hasNextPage?await encodeCursor(page.endCursor,filters,env):null},more_products:page.hasNextPage,limitation:'Current publication and US market eligibility checked. Stock and final cart totals require Shopify cart validation.'};
}
