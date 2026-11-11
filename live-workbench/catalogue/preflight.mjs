import {STORE,TAGS,digest,canonical} from './generate.mjs';
import {APPROVED_SCOPES,API_VERSION,paginate} from './admin.mjs';
import {Q} from './operations.mjs';
export function attestLocations(apiLocations,attestation,{now=Date.now()}={}){
 if(!attestation||attestation.store!==STORE||attestation.source!=='Shopify Admin settings UI'||typeof attestation.verified_by!=='string'||!attestation.verified_by.trim())throw Error('PREFLIGHT_STOP:LOCATION_ATTESTATION_IDENTITY');
 const observed=Date.parse(attestation.observed_at);if(!Number.isFinite(observed)||observed>now+120000||now-observed>24*60*60*1000)throw Error('PREFLIGHT_STOP:LOCATION_ATTESTATION_STALE_OR_FUTURE');
 if(!Array.isArray(attestation.locations)||!attestation.locations.length)throw Error('PREFLIGHT_STOP:LOCATION_ATTESTATION_EMPTY');
 const entries=new Map();for(const location of attestation.locations){const api=apiLocations.find(x=>x.id===location.id);const numeric=location.id?.match(/^gid:\/\/shopify\/Location\/(\d+)$/)?.[1];const expectedUrl=`https://admin.shopify.com/store/karachi-kicks-supportops-lab/settings/locations/${numeric}`;
  if(!api||!numeric||entries.has(location.id))throw Error('PREFLIGHT_STOP:LOCATION_ATTESTATION_ID_MISMATCH');if(location.evidence_url!==expectedUrl||typeof location.isActive!=='boolean'||typeof location.fulfillsOnlineOrders!=='boolean'||!/^([A-Z]{2})$/.test(location.address?.countryCode||''))throw Error('PREFLIGHT_STOP:LOCATION_ATTESTATION_FIELDS');
  for(const field of ['isActive','fulfillsOnlineOrders'])if(api[field]!==undefined&&api[field]!==location[field])throw Error('PREFLIGHT_STOP:LOCATION_API_UI_CONFLICT');if(api.address?.countryCode&&api.address.countryCode!==location.address.countryCode)throw Error('PREFLIGHT_STOP:LOCATION_API_UI_CONFLICT');
  entries.set(location.id,{...api,isActive:location.isActive,fulfillsOnlineOrders:location.fulfillsOnlineOrders,address:{countryCode:location.address.countryCode},attribute_evidence:{source:attestation.source,observed_at:attestation.observed_at,verified_by:attestation.verified_by,url:location.evidence_url},limitations:location.limitations||[]});
 }
 return apiLocations.map(location=>entries.get(location.id)||location);
}
export async function checkSchema(admin){
 // Full schema and operation validation is read-only and mandatory before writes.
 const {buildClientSchema,getIntrospectionQuery,parse,validate,getVariableValues}=await import('graphql');
 const introspection=await admin.raw(getIntrospectionQuery({descriptions:false,inputValueDeprecation:true,oneOf:true}));
 const schema=buildClientSchema(introspection);const documents=new Map();
 const parseAndValidate=query=>{let document=documents.get(query);if(!document){document=parse(query);const errors=validate(schema,document);if(errors.length)throw Error(`SCHEMA_OPERATION_INVALID:${errors.map(e=>e.message).join('; ').slice(0,2000)}`);documents.set(query,document);}return document;};
 for(const [name,query]of Object.entries(Q)){try{parseAndValidate(query);}catch(e){throw Error(`${name}:${e.message}`);}}
 admin.validateOperation=(query,variables)=>{const document=parseAndValidate(query);const definition=document.definitions.find(d=>d.kind==='OperationDefinition');const coerced=getVariableValues(schema,definition.variableDefinitions||[],variables);if(coerced.errors?.length)throw Error(`SCHEMA_VARIABLES_INVALID:${coerced.errors.map(e=>e.message).join('; ').slice(0,2000)}`);};
 return {checked_at:new Date().toISOString(),api_version:API_VERSION,schema_sha256:digest(canonical(introspection)),operations_sha256:digest(canonical(Q)),validated_operations:Object.keys(Q),method:'Full live Admin API introspection; GraphQL parse/validate of every operation and variable coercion before every subsequent request. Shopify custom scalar semantic validation remains server-side.'};
}
export async function probeProductRead(admin,products,manifest={}){
 // Execute the exact nested read before creating anything. Introspection alone
 // cannot prove requested query cost, field permissions or response semantics.
 if(admin.writeEnabled===true)throw Error('PREFLIGHT_STOP:READ_PROBE_AFTER_AUTHORIZATION');
 const owned=new Set(Object.values(manifest.products||{}).map(p=>p.id));
 const baseline=products.find(p=>!owned.has(p.id));if(!baseline)throw Error('PREFLIGHT_STOP:NO_BASELINE_PRODUCT_FOR_READ_PROBE');
 const product=(await admin.query('product',{id:baseline.id})).product;
 const connection=(value,max)=>value&&Array.isArray(value.nodes)&&value.nodes.length<=max&&typeof value.pageInfo?.hasNextPage==='boolean'&&(!value.pageInfo.hasNextPage||value.nodes.length>0);
 if(!product||product.id!==baseline.id||product.handle!==baseline.handle||!connection(product.variants,40)||!product.variants.nodes.length)throw Error('PREFLIGHT_STOP:PRODUCT_READ_SHAPE');
 for(const v of product.variants.nodes){
  if(typeof v.id!=='string'||typeof v.price!=='string'||!Array.isArray(v.selectedOptions)||typeof v.inventoryItem?.tracked!=='boolean'||typeof v.inventoryItem.id!=='string'||!connection(v.inventoryItem.inventoryLevels,5))throw Error('PREFLIGHT_STOP:VARIANT_READ_SHAPE');
  for(const level of v.inventoryItem.inventoryLevels.nodes)if(typeof level.location?.id!=='string'||!Array.isArray(level.quantities)||!level.quantities.some(q=>q.name==='available'&&Number.isInteger(q.quantity)))throw Error('PREFLIGHT_STOP:INVENTORY_READ_SHAPE');
 }
 const requestedCost=admin.costs?.get('SeedProduct');
 if(!Number.isFinite(requestedCost)||requestedCost<=0||requestedCost>1000)throw Error('PREFLIGHT_STOP:PRODUCT_READ_COST_UNVERIFIED');
 return {verified:true,operation:'SeedProduct',product_id:product.id,requested_query_cost:requestedCost,observed_variant_count:product.variants.nodes.length,baseline_has_more_variants:product.variants.pageInfo.hasNextPage,baseline_has_more_inventory_levels:product.variants.nodes.some(v=>v.inventoryItem.inventoryLevels.pageInfo.hasNextPage),checked_at:new Date().toISOString(),scope:'Exact seeded-product read shape and requested cost tested on one existing product; existing product pagination may continue and is not a complete baseline inventory audit.'};
}
export function validatePreflight({data,products,locations,publications,manifest,selectedLocationIds,selectedPublicationIds,throttle,schema,productRead}){
 const fail=reason=>{throw Error(`PREFLIGHT_STOP:${reason}`);};const shop=data.shop;
 if(shop.myshopifyDomain!==STORE)fail('STORE_MISMATCH');if(shop.currencyCode!=='USD')fail('CURRENCY_MISMATCH');if(shop.plan?.partnerDevelopment!==true)fail('NOT_DEVELOPMENT_STORE');if(!/basic/i.test(shop.plan.publicDisplayName))fail('PLAN_MISMATCH');
 const scopes=data.currentAppInstallation.accessScopes.map(x=>x.handle);for(const scope of APPROVED_SCOPES)if(!scopes.includes(scope))fail(`MISSING_SCOPE:${scope}`);
 const allowed=new Set(APPROVED_SCOPES.flatMap(s=>[s,s.replace('write_','read_')]));for(const scope of scopes)if(!allowed.has(scope))fail(`UNAPPROVED_SCOPE:${scope}`);
 if(data.productsCount.precision!=='EXACT'||data.productVariantsCount.precision!=='EXACT')fail('COUNTS_NOT_EXACT');if(data.productVariantsCount.count>=50000)fail('RESOURCE_THROTTLE_THRESHOLD');if(products.length!==data.productsCount.count)fail('PRODUCT_COUNT_MISMATCH');
 const owned=Object.values(manifest?.products||{});for(const entry of owned){const p=products.find(x=>x.id===entry.id);if(!p||p.handle!==entry.handle||!TAGS.every(t=>p.tags.includes(t)))fail(`OWNERSHIP_CHANGED:${entry.handle}`);}
 const expectedVariants=27+owned.reduce((n,p)=>n+Object.keys(p.variants||{}).length,0);if(data.productVariantsCount.count!==expectedVariants)fail(`VARIANT_BASELINE_CHANGED:${data.productVariantsCount.count},expected:${expectedVariants}`);
 const ownedIds=new Set(owned.map(x=>x.id));const unowned=products.filter(p=>!ownedIds.has(p.id));if(unowned.length!==18)fail(`UNOWNED_PRODUCT_BASELINE:${unowned.length},expected:18`);
 const baseline=manifest?.baseline_products;if(baseline&&JSON.stringify(unowned.map(p=>[p.id,p.handle,p.updatedAt]).sort())!==JSON.stringify(baseline.map(p=>[p.id,p.handle,p.updatedAt]).sort()))fail('BASELINE_PRODUCTS_CHANGED');
 if(!throttle||!(throttle.restoreRate>0)||!(throttle.maximumAvailable>0))fail('THROTTLE_STATUS_UNVERIFIED');
 if(productRead?.verified!==true||!(productRead.requested_query_cost>0)||productRead.requested_query_cost>1000)fail('PRODUCT_READ_COST_UNVERIFIED');
 const chosenLocations=selectedLocationIds||manifest?.preflight?.location_ids||[];const chosenPublications=selectedPublicationIds||manifest?.preflight?.publication_ids||[];
 if(!chosenLocations.length)fail('SELECT_EXISTING_LOCATION_IDS');for(const id of chosenLocations){const l=locations.find(x=>x.id===id);if(!l?.isActive||!l.fulfillsOnlineOrders)fail(`UNSUITABLE_LOCATION:${id}`);}if(!locations.some(x=>chosenLocations.includes(x.id)&&x.address.countryCode==='US'))fail('US_LOCATION_REQUIRED');
 if(!chosenPublications.length)fail('SELECT_SHOPPER_PUBLICATION_IDS');for(const id of chosenPublications)if(!publications.some(p=>p.id===id))fail(`UNKNOWN_PUBLICATION:${id}`);
 if(publications.some(p=>p.channels.pageInfo.hasNextPage))fail('PUBLICATION_CHANNELS_TRUNCATED');
 return {ok:true,store:STORE,api_version:API_VERSION,schema_checked:!!schema,at:new Date().toISOString(),shop,scopes,products_count:data.productsCount.count,variants_count:data.productVariantsCount.count,baseline_products:unowned,location_ids:chosenLocations,publication_ids:chosenPublications,all_publication_ids:publications.map(x=>x.id),locations,publications,throttle,schema,product_read:productRead,second_location_tested:chosenLocations.length>1,market:'US selected in the runtime; active US market independently verified in merchant admin; seed app has no market scope'};
}
export async function readPreflight(admin,{manifest={},selectedLocationIds,selectedPublicationIds,locationAttestation}={}){
 const data=await admin.query('preflight');if(data.shop.myshopifyDomain!==STORE||data.shop.plan?.partnerDevelopment!==true)throw Error('PREFLIGHT_STOP:STORE_OR_DEVELOPMENT_MISMATCH');
 const apiLocations=await paginate(admin,'locations','locations');const attestation=locationAttestation||manifest.preflight?.location_attestation;const locations=attestation?attestLocations(apiLocations,attestation):apiLocations;const publications=await paginate(admin,'publications','publications');const products=await paginate(admin,'products','products');const schema=await checkSchema(admin);
 const productRead=await probeProductRead(admin,products,manifest);
 const observation={data,locations,publications,products,throttle:admin.throttle,schema,productRead};
 if(!selectedLocationIds?.length&&!manifest.preflight?.location_ids?.length)return {ok:false,store:STORE,reason:'SELECT_EXISTING_LOCATION_IDS_AND_PUBLICATION_IDS',...observation};
 return {...validatePreflight({...observation,manifest,selectedLocationIds,selectedPublicationIds}),location_attestation:attestation||null,location_api_fields:['id'],location_attribute_source:attestation?'Separately verified Shopify Admin settings UI':'Admin API',second_location_configured:(selectedLocationIds||manifest.preflight?.location_ids||[]).length>1,second_location_tested:false};
}
