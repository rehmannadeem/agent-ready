import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {generate,canonical,digest,STORE} from '../catalogue/generate.mjs';
import {adminFromEnvironment} from '../catalogue/admin.mjs';
import {readPreflight} from '../catalogue/preflight.mjs';
import {withManifestLock} from '../catalogue/process-lock.mjs';
import {loadManifest,saveManifest,assertOwned,publicationState,DEFAULT_MANIFEST,money} from '../catalogue/seed.mjs';
export const TYPES=['stock','price','publication','discount'];
const seed=generate();
export function selectVariant(product,entry){const variant=product.variants.find(v=>v.options.some(o=>o.name==='Size'&&o.value==='10')&&v.options.some(o=>o.name==='Colour'&&o.value==='Black'))||product.variants[0];return {...variant,...entry.variants[variant.fixture_variant_id]};}
export function restoreAllowed(current,journal){return journal.phase==='applied'&&digest(canonical(current))===journal.after_sha256;}
export function comparable(snapshot){if(Array.isArray(snapshot))return snapshot.map(comparable);if(snapshot&&typeof snapshot==='object')return Object.fromEntries(Object.entries(snapshot).filter(([key])=>key!=='updatedAt').map(([key,value])=>[key,comparable(value)]));return snapshot;}
export function verifyTransition(type,before,after,variant,{restore=false}={}){
 if(restore){if(canonical(comparable(before))!==canonical(comparable(after)))throw Error('RESTORE_POSTCONDITION_FAILED');return;}
 if(type==='discount'){if(Date.parse(after.codeDiscount.endsAt)>=Date.now()||after.id!==before.id)throw Error('DISCOUNT_EXPIRY_FAILED');return;}
 if(type==='publication'){if(Object.values(after.publications).some(Boolean))throw Error('UNPUBLISH_FAILED');return;}
 const current=after.product.variants.nodes.find(v=>v.id===variant.id);if(!current)throw Error('SIMULATED_VARIANT_MISSING');
 if(type==='price'&&Number(current.price)!==(variant.price_cents+1000)/100)throw Error('PRICE_CHANGE_FAILED');
 if(type==='stock'&&current.inventoryItem.inventoryLevels.nodes.some(l=>l.quantities.find(q=>q.name==='available')?.quantity!==0))throw Error('STOCK_CHANGE_FAILED');
}
async function snapshot(admin,type,entry,variant,manifest){
 if(type==='discount'){const node=(await admin.query('discount',{code:'ARMANS-SEED-V1-MIN100'})).codeDiscountNodeByCode;if(!node||node.id!==entry.id||node.codeDiscount.title!=='ARMANS-SEED-V1-MIN100')throw Error('DISCOUNT_OWNERSHIP_MISMATCH');return node;}
 const product=(await admin.query('product',{id:entry.id})).product;assertOwned(product,entry);const pubs=await publicationState(admin,entry.id,manifest.preflight.all_publication_ids);return {product,publications:pubs};
}
async function setStock(admin,variant,before,targets,key){const levels=before.product.variants.nodes.find(v=>v.id===variant.id).inventoryItem.inventoryLevels; if(levels.pageInfo.hasNextPage)throw Error('INVENTORY_LEVELS_TRUNCATED');const quantities=targets.map(({locationId,quantity})=>{const level=levels.nodes.find(x=>x.location.id===locationId);if(!level)throw Error('INVENTORY_LEVEL_MISSING');return {inventoryItemId:variant.inventory_item_id,locationId,quantity,changeFromQuantity:level.quantities.find(q=>q.name==='available').quantity};});await admin.query('setInventory',{key,input:{name:'available',reason:'correction',referenceDocumentUri:`armans-seed://simulation/${key}`,quantities}});}
export async function simulate(admin,type,manifest,{restore=false,journalFile,manifestFile=DEFAULT_MANIFEST}={}){
 if(!TYPES.includes(type))throw Error('UNKNOWN_SIMULATION');if(!manifest.completed_at||manifest.pending)throw Error('COMPLETED_SEED_REQUIRED');
 const report=await readPreflight(admin,{manifest});if(!report.ok)throw Error('PREFLIGHT_FAILED');admin.authorize(report);
 const fixture=type==='discount'?null:seed.products.find(p=>p.fixture_id===seed.fixtures[`${type}_simulation`]);const entry=type==='discount'?manifest.discounts['ARMANS-SEED-V1-MIN100']:manifest.products[fixture.fixture_id];if(!entry)throw Error('OWNED_FIXTURE_MISSING');const variant=fixture?selectVariant(fixture,entry):null;
 if(restore){const journal=JSON.parse(await readFile(journalFile,'utf8'));if(journal.store!==STORE||journal.type!==type||journal.resource_id!==entry.id)throw Error('JOURNAL_TARGET_MISMATCH');const current=await snapshot(admin,type,entry,variant,manifest);if(!restoreAllowed(current,journal))throw Error('RESTORE_REFUSED_CONCURRENT_CHANGE');journal.phase='restoring';await saveManifest(journalFile,journal);
  if(type==='stock'){const original=journal.before.product.variants.nodes.find(v=>v.id===variant.id).inventoryItem.inventoryLevels.nodes;await setStock(admin,variant,current,original.map(l=>({locationId:l.location.id,quantity:l.quantities.find(q=>q.name==='available').quantity})),`${journal.id}-restore`);}
  if(type==='price')await admin.query('updatePrice',{productId:entry.id,variants:[{id:variant.id,price:journal.before.product.variants.nodes.find(v=>v.id===variant.id).price}]});
  if(type==='publication'){const ids=Object.entries(journal.before.publications).filter(([,v])=>v).map(([publicationId])=>({publicationId}));if(ids.length)await admin.query('publish',{id:entry.id,input:ids});}
  if(type==='discount')await admin.query('updateDiscount',{id:entry.id,input:{endsAt:journal.before.codeDiscount.endsAt}});
  const restored=await snapshot(admin,type,entry,variant,manifest);verifyTransition(type,journal.before,restored,variant,{restore:true});journal.restored=restored;journal.phase='restored';journal.restored_at=new Date().toISOString();await saveManifest(journalFile,journal);entry.updated_at=type==='discount'?restored.codeDiscount.updatedAt:restored.product.updatedAt;await saveManifest(manifestFile,manifest);return journal;
 }
 try{const existing=JSON.parse(await readFile(journalFile,'utf8'));if(existing.phase!=='restored')throw Error('EXISTING_SIMULATION_NOT_RESTORED');}catch(e){if(e.code!=='ENOENT')throw e;}
 const before=await snapshot(admin,type,entry,variant,manifest);const updated=type==='discount'?before.codeDiscount.updatedAt:before.product.updatedAt;if(updated!==entry.updated_at)throw Error('FIXTURE_CHANGED_BEFORE_SIMULATION');
 const journal={id:randomUUID(),store:STORE,type,resource_id:entry.id,variant_id:variant?.id,before,phase:'applying',created_at:new Date().toISOString(),guard:type==='stock'?'Shopify inventory compare-and-set plus state snapshot':'Read-before-write snapshot guard; Shopify exposes no atomic conditional update for this operation. Unknown outcomes require manual reconciliation.'};await saveManifest(journalFile,journal);
 if(type==='stock'){const actual=before.product.variants.nodes.find(v=>v.id===variant.id);await setStock(admin,variant,before,actual.inventoryItem.inventoryLevels.nodes.map(l=>({locationId:l.location.id,quantity:0})),journal.id);}
 if(type==='price')await admin.query('updatePrice',{productId:entry.id,variants:[{id:variant.id,price:money(variant.price_cents+1000)}]});
 if(type==='publication'){const ids=Object.entries(before.publications).filter(([,v])=>v).map(([publicationId])=>({publicationId}));if(!ids.length)throw Error('FIXTURE_ALREADY_UNPUBLISHED');await admin.query('unpublish',{id:entry.id,input:ids});}
 if(type==='discount')await admin.query('updateDiscount',{id:entry.id,input:{endsAt:'2026-11-10T00:00:01Z'}});
 journal.after=await snapshot(admin,type,entry,variant,manifest);verifyTransition(type,before,journal.after,variant);journal.after_sha256=digest(canonical(journal.after));journal.phase='applied';await saveManifest(journalFile,journal);return journal;
}
async function main(){const [type,...args]=process.argv.slice(2);if(!args.includes('--apply'))throw Error('SIMULATION_REQUIRES_EXPLICIT_--apply');return withManifestLock(process.env.SEED_MANIFEST_PATH||DEFAULT_MANIFEST,async({manifestFile})=>{const admin=await adminFromEnvironment();const manifest=await loadManifest(manifestFile);const journalFile=path.join(path.dirname(fileURLToPath(import.meta.url)),`${type}.local.json`);const result=await simulate(admin,type,manifest,{restore:args.includes('--restore'),journalFile,manifestFile});console.log(canonical({type:result.type,phase:result.phase,resource_id:result.resource_id,journal_file:journalFile,guard:result.guard}));});}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error(e.message);process.exitCode=1;});
