/** Compact only catalog observations sent to the model. Full sanitized merchant
 * responses remain in evidence. Omission is explicit; a model must request the
 * selected product/options before choosing an omitted variant. No invented data.
 */
export function catalogForModel(result,{detail=false}={}){
 const project=p=>{
  if(!p||typeof p!=='object')return p;
  const variants=Array.isArray(p.variants)?p.variants:[];
  const limit=detail?16:2;
  return {...p,variants:variants.slice(0,limit),variant_count:variants.length,variants_omitted:Math.max(0,variants.length-limit),...(variants.length>limit?{variant_selection_note:'Additional live variants omitted from this model view. Use get_product with the buyer-selected options; never guess an omitted variant ID.'}:{})};
 };
 if(Array.isArray(result?.products))return {...result,products:result.products.map(project)};
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
  const brief=p=>({id:p.id,title:p.title,variants_omitted:Array.isArray(p.variants)?p.variants.length:0,detail_note:'Earlier catalog observation abbreviated. Re-read selected product for exact live variant fields.'});
  return {...projected,result:{...projected.result,...(Array.isArray(o.result.products)?{products:o.result.products.map(brief)}:{}),...(o.result.product?{product:brief(o.result.product)}:{})}};
 });
}

export function catalogReferenceForMemory(result){
 const brief=p=>({id:p.id,title:p.title});
 return {source:result.source,observed_at:result.observed_at,products:(result.products||[]).map(brief),next_cursor:result.next_cursor,has_next_page:result.has_next_page,detail_note:'Stored catalog reference only. Read the selected product for live details and variant IDs.'};
}
