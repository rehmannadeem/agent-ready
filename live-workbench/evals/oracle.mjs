import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
export const TARGET_STORE='karachi-kicks-supportops-lab.myshopify.com';
export async function loadOracle(seedPath,manifestPath){
 const bytes=await readFile(seedPath),seed=JSON.parse(bytes),manifest=JSON.parse(await readFile(manifestPath,'utf8'));
 const digest=createHash('sha256').update(bytes).digest('hex');
 if(seed.store!==TARGET_STORE||manifest.store!==TARGET_STORE)throw Error('STORE_MISMATCH');
 if(manifest.seed_sha256!==digest)throw Error('SEED_MANIFEST_DIGEST_MISMATCH');
 const byFixture=new Map(seed.products.map(p=>[p.fixture_id,p]));
 const product=key=>{const fid=seed.fixtures[key]??key;if(typeof fid!=='string'||!byFixture.has(fid))throw Error('FIXTURE_MISSING:'+key);return byFixture.get(fid);};
 const productId=key=>{const p=product(key),id=manifest.products?.[p.fixture_id]?.id;if(!/^gid:\/\/shopify\/Product\/\d+$/.test(id||''))throw Error('LIVE_PRODUCT_ID_MISSING:'+key);return id;};
 const variant=(key,criteria={})=>{const p=product(key);const v=p.variants.find(v=>Object.entries(criteria).every(([name,value])=>v.options.some(o=>o.name===name&&o.value===value)));if(!v)throw Error('VARIANT_FIXTURE_MISSING:'+key);const id=manifest.products?.[p.fixture_id]?.variants?.[v.fixture_variant_id]?.id;if(!/^gid:\/\/shopify\/ProductVariant\/\d+$/.test(id||''))throw Error('LIVE_VARIANT_ID_MISSING:'+key);return {...v,id};};
 const byVariantId=new Map();
 for(const p of seed.products)for(const v of p.variants){const id=manifest.products?.[p.fixture_id]?.variants?.[v.fixture_variant_id]?.id;if(id)byVariantId.set(id,{...v,product:p});}
 return {seed,manifest,digest,product,productId,variant,byVariantId};
}
