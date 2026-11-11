import test from 'node:test';
import assert from 'node:assert/strict';
import {readCatalog,gateProducts,gateVariants,parseCatalogFilters,CATALOG_QUERY} from '../src/catalog.mjs';
const response=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}});
const base={SHOPIFY_STORE:'karachi-kicks-supportops-lab.myshopify.com',SHOPIFY_API_VERSION:'2026-07',SHOPIFY_PUBLICATION_ID:'gid://shopify/Publication/1',COMMERCE_SERVICE_SECRET:'s'.repeat(40),SHOPIFY_CLIENT_SECRET:'NEVER_PRINT'};
let serial=0;
const env=()=>({...base,SHOPIFY_CLIENT_ID:`catalog-test-${++serial}`});
const product=(extra={})=>({id:'gid://shopify/Product/1',title:'Runner',handle:'runner',status:'ACTIVE',productType:'Running shoes',vendor:'Fictional Vendor 01',publishedOnPublication:true,publishedInContext:true,...extra});
const variant=(n=1,extra={})=>({id:`gid://shopify/ProductVariant/${n}`,title:`Size ${n}`,availableForSale:true,publishedOnPublication:true,inventoryQuantity:2,inventoryPolicy:'DENY',inventoryItem:{tracked:true},selectedOptions:[{name:'Size',value:String(n)}],contextualPricing:{price:{amount:'79.00',currencyCode:'USD'}},...extra});
const page=(nodes,hasNextPage=false,endCursor=null)=>({nodes,pageInfo:{hasNextPage,endCursor}});
const catalog=(products,hasNextPage=false,endCursor=null)=>({data:{shop:{name:'Test store',currencyCode:'USD'},products:page(products,hasNextPage,endCursor)}});
function fake(responses){const calls=[];return{calls,fetcher:async(url,init)=>{calls.push({url,init});if(url.endsWith('/oauth/access_token'))return response({access_token:'PRIVATE_TOKEN',expires_in:86400});const next=responses.shift();if(next instanceof Error)throw next;return next instanceof Response?next:response(next);}};}

test('Admin projection removes handle restriction and validates each filter',()=>{
  assert.doesNotMatch(CATALOG_QUERY,/handle:\$|first:5/);
  for(const q of ['host=evil.example','limit=11','limit=0','min_price=-1','max_price=1.2','in_stock=yes','q=a&q=b','min_price=20&max_price=10'])assert.throws(()=>parseCatalogFilters(new URLSearchParams(q)),e=>e.status===400);
  assert.equal(parseCatalogFilters(new URLSearchParams('category=Shoes&vendor=Vendor&min_price=900&max_price=24900&in_stock=true')).filters.in_stock,true);
});
test('catalog follows every variant page and does not truncate at first 16',async()=>{
  const first=product({variants:page(Array.from({length:16},(_,i)=>variant(i+1)),true,'variants-page2')});
  const f=fake([catalog([first]),{data:{product:product({variants:page(Array.from({length:16},(_,i)=>variant(i+17)))})}}]);
  const result=await readCatalog(env(),f.fetcher);
  assert.equal(result.products[0].variants.length,32);assert.equal(result.products[0].more_variants,false);
  assert.equal(result.products[0].variants[0].stock,'Low stock');assert.doesNotMatch(JSON.stringify(result),/PRIVATE|NEVER_PRINT/);
  assert.equal(JSON.parse(f.calls[2].init.body).variables.after,'variants-page2');
});
test('hidden, draft and non-US products never escape Admin projection',async()=>{
  const p=extra=>product({variants:page([variant()]),...extra});
  const f=fake([catalog([p({status:'DRAFT'}),p({status:'ARCHIVED'}),p({publishedOnPublication:false}),p({publishedInContext:false}),p({id:'gid://shopify/Product/5'})])]);
  const data=await readCatalog(env(),f.fetcher);assert.deepEqual(data.products.map(p=>p.id),['gid://shopify/Product/5']);
});
test('publication change during variant pagination removes the entire product',async()=>{
  const f=fake([catalog([product({variants:page([variant()],true,'more')})]),{data:{product:product({publishedOnPublication:false,variants:page([variant(2)])})}}]);
  assert.equal((await readCatalog(env(),f.fetcher)).products.length,0);
});
test('price and stock filters apply to the same exact variant; unavailable variants never silently qualify',async()=>{
  const f=fake([catalog([product({variants:page([variant(1,{availableForSale:false}),variant(2,{contextualPricing:{price:{amount:'129.00',currencyCode:'USD'}}}),variant(3,{inventoryItem:{tracked:false}})])})])]);
  const data=await readCatalog(env(),f.fetcher,new URLSearchParams('max_price=10000&in_stock=true'));
  assert.deepEqual(data.products[0].variants.map(v=>v.id),['gid://shopify/ProductVariant/3']);assert.match(data.products[0].variants[0].stock,/untracked/);
});
test('product cursors are signed and bound to filters and market; tampering never causes an upstream call',async()=>{
  const e=env(),f=fake([catalog([product({variants:page([variant()])})],true,'next-shopify-page'),catalog([])]);
  const first=await readCatalog(e,f.fetcher,new URLSearchParams('vendor=Vendor'));
  const before=f.calls.length;
  await assert.rejects(()=>readCatalog(e,f.fetcher,new URLSearchParams({vendor:'Other',cursor:first.pagination.cursor})),e=>e.code==='INVALID_CURSOR');
  await assert.rejects(()=>readCatalog(e,f.fetcher,new URLSearchParams({vendor:'Vendor',cursor:first.pagination.cursor+'x'})),e=>e.code==='INVALID_CURSOR');
  assert.equal(f.calls.length,before);
  await readCatalog(e,f.fetcher,new URLSearchParams({vendor:'Vendor',cursor:first.pagination.cursor}));
  assert.equal(JSON.parse(f.calls.at(-1).init.body).variables.after,'next-shopify-page');
});
test('free text is quoted to prevent administrative search-filter injection',async()=>{
  const f=fake([catalog([])]);await readCatalog(env(),f.fetcher,new URLSearchParams({q:'x" OR status:draft',vendor:'safe" OR vendor:*'}));
  const q=JSON.parse(f.calls.at(-1).init.body).variables.search;assert.match(q,/"x\\" OR status:draft"/);assert.match(q,/vendor:"safe\\" OR vendor:\*"/);
});
test('missing publication, wrong merchant and wrong market fail closed without network',async()=>{
  let calls=0;const fetcher=async()=>{calls++;throw Error();};
  await assert.rejects(()=>readCatalog({...env(),SHOPIFY_PUBLICATION_ID:''},fetcher),e=>e.code==='PUBLICATION_NOT_CONFIGURED');
  await assert.rejects(()=>readCatalog({...env(),SHOPIFY_STORE:'evil.test'},fetcher),e=>e.code==='CONFIGURATION');
  await assert.rejects(()=>readCatalog(env(),fetcher,new URLSearchParams(),{market:'CA'}),e=>e.code==='CONTEXT_DENIED');assert.equal(calls,0);
});
test('product gate verifies individual variant publication and matching parent',async()=>{
  const p=product(),f=fake([{data:{nodes:[p]}},{data:{nodes:[{...variant(1),product:p},{...variant(2),publishedOnPublication:false,product:p},{...variant(3),product:product({id:'gid://shopify/Product/9'})}]}}]);
  const result=await gateProducts([{...p,variants:[1,2,3].map(i=>({...variant(i),availability:{available:true}}))}],env(),f.fetcher);
  assert.deepEqual(result[0].variants.map(v=>v.id),['gid://shopify/ProductVariant/1']);
});
test('mutation gate rejects out-of-stock, unpublished, nonexistent, cross-market and draft variants',async()=>{
  for(const v of [null,{...variant(),availableForSale:false,product:product()},{...variant(),publishedOnPublication:false,product:product()},{...variant(),product:product({publishedInContext:false})},{...variant(),product:product({status:'DRAFT'})}]){
    const f=fake([{data:{nodes:[v]}}]);await assert.rejects(()=>gateVariants(['gid://shopify/ProductVariant/1'],env(),f.fetcher),e=>e.code==='PRODUCT_UNAVAILABLE');
  }
  assert.equal(await gateVariants([],env(),()=>{throw Error('no network');}),true);
});
test('HTTP200 GraphQL errors and repeated variant cursors fail safely',async()=>{
  const f=fake([{errors:[{message:'SECRET',extensions:{code:'ACCESS_DENIED'}}]}]);await assert.rejects(()=>readCatalog(env(),f.fetcher),e=>e.code==='SHOPIFY_QUERY_ERROR'&&!e.message.includes('SECRET'));
  const repeat=product({variants:page([variant()],true,'same')});const g=fake([catalog([repeat]),{data:{product:repeat}}]);await assert.rejects(()=>readCatalog(env(),g.fetcher),e=>e.code==='PAGINATION_FAILED');
});
test('rejected cached credentials are discarded and throttles never auto-retry',async()=>{
  const e=env(),f=fake([response({},401),catalog([])]);await assert.rejects(()=>readCatalog(e,f.fetcher),e=>e.code==='SHOPIFY_AUTH');await readCatalog(e,f.fetcher);assert.equal(f.calls.filter(c=>c.url.endsWith('/oauth/access_token')).length,2);
  const g=fake([response({},429)]);await assert.rejects(()=>readCatalog(env(),g.fetcher),e=>e.code==='RATE_LIMITED');assert.equal(g.calls.length,2);
});
