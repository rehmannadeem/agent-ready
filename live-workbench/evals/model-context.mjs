/** Compact only catalog observations sent to the model. Full sanitized merchant
 * responses remain in evidence. Omission is explicit; a model must request the
 * selected product/options before choosing an omitted variant. No invented data.
 */
const pageProductBytes=520;
const bytes=value=>Buffer.byteLength(JSON.stringify(value));
const brief=product=>({id:product.id,title:typeof product.title==='string'?product.title.slice(0,110):''});

function pageProduct(product){
 const variants=Array.isArray(product.variants)?product.variants:[];
 const summary={...brief(product),variant_count:variants.length,variants_omitted:variants.length,variants:[]};
 if(product.price_range&&bytes({...summary,price_range:product.price_range})<=pageProductBytes){
  summary.price_range=product.price_range;
 }
 for(const variant of variants.slice(0,2)){
  const compact=Object.fromEntries(['id','title','price','availability','options']
   .filter(key=>variant[key]!==undefined).map(key=>[key,variant[key]]));
  const next=[...summary.variants,compact];
  if(bytes({...summary,variants:next})>pageProductBytes)break;
  summary.variants=next;
  summary.variants_omitted--;
 }
 return summary;
}

export function catalogForModel(result,{detail=false}={}){
 const project=p=>{
  if(!p||typeof p!=='object')return p;
  const variants=Array.isArray(p.variants)?p.variants:[];
  const limit=detail?16:2;
  return {...p,variants:variants.slice(0,limit),variant_count:variants.length,variants_omitted:Math.max(0,variants.length-limit),...(variants.length>limit?{variant_selection_note:'Additional live variants omitted from this model view. Use get_product with the buyer-selected options; never guess an omitted variant ID.'}:{})};
 };
 if(Array.isArray(result?.products))return {
  source:result.source,observed_at:result.observed_at,
  products:result.products.map(pageProduct),
  messages:result.messages?.slice(0,3).map(message=>({
   type:message.type,code:message.code,content:message.content?.slice(0,160)
  })),
  next_cursor:result.next_cursor,has_next_page:result.has_next_page,
  detail_note:'Read the selected product for full details and omitted variants. Use the returned cursor with the same query, filter and limit.'
 };
 if(result?.product)return {...result,product:project(result.product)};
 return result;
}
export function observationForModel(observation){
 return {...observation,result:['search_catalog','lookup_catalog','get_product'].includes(observation.name)?catalogForModel(observation.result,{detail:observation.name==='get_product'}):observation.result};
}
export function observationsForModel(observations){
 return observations.map((o,i)=>{
  const projected=observationForModel(o);
  if(i===observations.length-1||!['search_catalog','lookup_catalog','get_product'].includes(o.name))return projected;
  const earlier=p=>({...brief(p),variants_omitted:Array.isArray(p.variants)?p.variants.length:0});
  if(!Array.isArray(o.result.products)&&!o.result.product)return projected;
  return {...projected,result:{
   next_cursor:o.result.next_cursor,has_next_page:o.result.has_next_page,
   ...(Array.isArray(o.result.products)?{products:o.result.products.map(earlier)}:{product:earlier(o.result.product)}),
   detail_note:'Earlier catalog observation abbreviated. Re-read selected product for exact live variant fields.'
  }};
 });
}

export function catalogReferenceForMemory(result){
 return {source:result.source,observed_at:result.observed_at,products:(result.products||[]).map(brief),next_cursor:result.next_cursor,has_next_page:result.has_next_page,detail_note:'Stored catalog reference only. Read the selected product for live details and variant IDs.'};
}
