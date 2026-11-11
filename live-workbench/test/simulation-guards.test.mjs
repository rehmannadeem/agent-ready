import test from 'node:test';
import assert from 'node:assert/strict';
import {canonical,digest} from '../catalogue/generate.mjs';
import {checkpointProduct} from '../catalogue/seed.mjs';
import {restoreAllowed,guardFixtureCheckpoint,checkpointRestoredFixture,verifyTransition} from '../simulate/scenarios.mjs';
const variant={id:'gid://shopify/ProductVariant/1',price_cents:7900};
function snapshot(){return {product:{id:'gid://shopify/Product/1',handle:'armans-seed-v1-p008',tags:['armans-synthetic','seed-v1'],title:'Owned fixture',updatedAt:'v1',variants:{nodes:[{id:variant.id,price:'79.00',inventoryItem:{id:'inventory1',inventoryLevels:{nodes:[{location:{id:'location1'},quantities:[{name:'available',quantity:12}]}]}}}]}},publications:{online:true,pos:false}};}
const journal=after=>({type:'price',phase:'applied',before:snapshot(),before_sha256:digest(canonical(snapshot())),after:structuredClone(after),after_sha256:digest(canonical(after))});
const entry=()=>({id:'gid://shopify/Product/1',handle:'armans-seed-v1-p008'});
test('product simulation apply uses full persisted proof and accepts only timestamp advancement',()=>{
 const original=snapshot(),owned=entry();checkpointProduct(owned,original);
 const newer=structuredClone(original);newer.product.updatedAt='v2';assert.equal(guardFixtureCheckpoint('price',newer,owned),true);
 assert.throws(()=>guardFixtureCheckpoint('price',newer,entry()),/CHECKPOINT_MISSING/);
 for(const change of [s=>s.product.title='Other',s=>s.product.variants.nodes[0].price='1.00',s=>s.product.variants.nodes[0].inventoryItem.inventoryLevels.nodes[0].quantities[0].quantity=99,s=>s.publications.pos=true]){const changed=structuredClone(newer);change(changed);assert.throws(()=>guardFixtureCheckpoint('price',changed,owned),/STATE_DRIFT/);}
 owned.expected_state.product.title='tampered';assert.throws(()=>guardFixtureCheckpoint('price',newer,owned),/CHECKPOINT_MISSING_OR_CORRUPT/);
});
test('restore tolerates product timestamps but validates both raw journal hashes and all content',()=>{
 const after=snapshot();after.product.variants.nodes[0].price='89.00';const record=journal(after),newer=structuredClone(after);newer.product.updatedAt='v3';
 assert.equal(restoreAllowed(newer,record),true);
 for(const change of [s=>s.product.variants.nodes[0].price='90.00',s=>s.product.variants.nodes[0].inventoryItem.inventoryLevels.nodes[0].quantities[0].quantity=0,s=>s.publications.online=false]){const changed=structuredClone(newer);change(changed);assert.equal(restoreAllowed(changed,record),false);}
 for(const field of ['before','after']){const corrupt=structuredClone(record);corrupt[field].product.updatedAt='tampered timestamp';assert.equal(restoreAllowed(newer,corrupt),false);}
 for(const phase of ['applying','restoring','restored'])assert.equal(restoreAllowed(newer,{...record,phase}),false);
 assert.equal(restoreAllowed(newer,{...record,after:undefined}),false);
});
test('discount simulation retains strict version guards for apply and restore',()=>{
 const current={id:'discount1',codeDiscount:{title:'ARMANS-SEED-V1-MIN100',endsAt:'2027-01-01',updatedAt:'v1'}},owned={id:'discount1',updated_at:'v1'};
 assert.equal(guardFixtureCheckpoint('discount',current,owned),true);
 const newer=structuredClone(current);newer.codeDiscount.updatedAt='v2';assert.throws(()=>guardFixtureCheckpoint('discount',newer,owned),/FIXTURE_CHANGED/);
 const record={type:'discount',phase:'applied',before:current,before_sha256:digest(canonical(current)),after:current,after_sha256:digest(canonical(current))};assert.equal(restoreAllowed(current,record),true);assert.equal(restoreAllowed(newer,record),false);
});
test('simulation postconditions allow only the intended field change, not concurrent drift',()=>{
 for(const type of ['price','stock','publication']){const before=snapshot(),after=structuredClone(before);after.product.updatedAt='v2';
  if(type==='price')after.product.variants.nodes[0].price='89.00';
  if(type==='stock')after.product.variants.nodes[0].inventoryItem.inventoryLevels.nodes[0].quantities[0].quantity=0;
  if(type==='publication')after.publications.online=false;
  assert.doesNotThrow(()=>verifyTransition(type,before,after,variant));after.product.title='Unrelated edit';assert.throws(()=>verifyTransition(type,before,after,variant),/POSTCONDITION_DRIFT/);
 }
});
test('restored product checkpoint supports another guarded simulation without stale timestamps',()=>{
 const original=snapshot(),restored=structuredClone(original),owned=entry();restored.product.updatedAt='restored-version';
 assert.doesNotThrow(()=>verifyTransition('price',original,restored,variant,{restore:true}));checkpointRestoredFixture('price',owned,restored);
 restored.product.updatedAt='background-version';assert.equal(guardFixtureCheckpoint('price',restored,owned),true);
 restored.publications.online=false;assert.throws(()=>verifyTransition('price',original,restored,variant,{restore:true}),/RESTORE_POSTCONDITION_FAILED/);
});
