const el=id=>document.getElementById(id);
let evidence=null,cursor=null,page=1,currentFilters=new URLSearchParams(),authenticated=false,catalogRequest=0;
const time=value=>value?new Date(value).toLocaleString():'—';
const set=(id,value)=>{el(id).textContent=value;};
const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
async function check(path){try{const r=await fetch(path,{cache:'no-store',credentials:'same-origin',signal:AbortSignal.timeout(45000)});return{ok:r.ok,http_status:r.status,data:await r.json()};}catch{return{ok:false,data:{error:'REQUEST_FAILED',message:'The request could not finish. No fresh result is available.'}};}}
function renderProducts(result){
  const target=el('products');target.replaceChildren();const data=result.data;
  set('catalog-badge',result.ok?'LIVE OBSERVATION':'ACTION NEEDED');el('catalog-badge').className=`badge ${result.ok?'good':'warn'}`;
  if(!result.ok){target.append(node('p',data.message||'The catalogue could not be read.','empty error'));set('catalog-status','Unavailable');set('catalog-detail',data.error||'Request failed');cursor=null;el('catalog-next').disabled=true;return;}
  set('catalog-status','Connected');set('catalog-detail',`${data.products.length} products on this page`);set('catalog-note',`${data.shop_name} · ${data.market} / ${data.currency}`);set('catalog-meta',`Last checked ${time(data.observed_at)} · ${data.source} · stock is rechecked when adding to the cart`);
  cursor=data.pagination?.cursor||null;el('catalog-next').disabled=!cursor;set('catalog-page',`Page ${page}`);
  if(!data.products.length)target.append(node('p',cursor?'No eligible matches on this page. Continue to the next page.':'No products match these filters.','empty'));
  for(const product of data.products){
    const card=node('article',undefined,'product-card');card.append(node('h3',product.title),node('p',`${product.category||'Unspecified category'} · ${product.vendor}`,'section-note'));
    const select=node('select');select.setAttribute('aria-label',`Variant for ${product.title}`);
    for(const v of product.variants){const option=node('option',`${v.title} · $${Number(v.price).toFixed(2)} · ${v.stock}`);option.value=v.id;option.disabled=!v.available;select.append(option);}
    const firstAvailable=product.variants.find(v=>v.available);if(firstAvailable)select.value=firstAvailable.id;
    const quantity=node('input');quantity.type='number';quantity.min='1';quantity.max='10';quantity.step='1';quantity.value='1';quantity.setAttribute('aria-label',`Quantity for ${product.title}`);
    const choose=node('button','Select variant');choose.disabled=!authenticated||!firstAvailable;choose.addEventListener('click',()=>{const v=product.variants.find(v=>v.id===select.value),q=Number(quantity.value);if(!v?.available||!Number.isInteger(q)||q<1||q>10){set('shop-status','Choose an available variant and a quantity from 1 to 10.');return;}document.dispatchEvent(new CustomEvent('select-variant',{detail:{variant_id:v.id,title:`${product.title} / ${v.title}`,quantity:q}}));});
    const controls=node('div',undefined,'variant-picker');controls.append(select,quantity,choose);card.append(controls);
    const details=node('details');details.append(node('summary',`All ${product.variants.length} matching variants`));const list=node('ul');for(const v of product.variants)list.append(node('li',`${v.title}: $${Number(v.price).toFixed(2)} · ${v.stock}`));details.append(list);card.append(details);target.append(card);
  }
}
function renderDiscovery(result){const d=result.data;set('discovery-status',result.ok?d.classification:'Unavailable');set('discovery-detail',result.ok?'Public request completed':d.error||'Request failed');set('finding-title',result.ok?d.classification:'Check failed');set('finding-meaning',d.meaning||d.message||'No conclusion available.');set('http-status',d.http_status??'—');set('content-type',d.content_type||'—');set('redirects',d.redirects?.length??'—');set('discovery-time',time(d.observed_at));set('final-url',d.final_url||d.url||'');}
async function loadCatalog(){const sequence=++catalogRequest,params=new URLSearchParams(currentFilters);if(cursor)params.set('cursor',cursor);const catalog=await check(`/api/catalog?${params}`);if(sequence!==catalogRequest)return catalog;renderProducts(catalog);if(evidence){evidence={...evidence,captured_at:new Date().toISOString(),catalog};set('raw-output',JSON.stringify(evidence,null,2));}return catalog;}
async function run(){
  el('run').disabled=true;set('run-status','Reading current data…');cursor=null;page=1;
  const [session,health,discovery]=await Promise.all([check('/api/session'),check('/api/health'),check('/api/discovery')]);
  authenticated=session.ok&&session.data.authenticated===true;document.dispatchEvent(new CustomEvent('session-ready',{detail:{authenticated}}));
  set('session-status',authenticated?'Protected development session ready.':'Open this workbench through the authenticated local test bridge to browse and shop.');
  el('catalog-filters').querySelectorAll('button').forEach(b=>b.disabled=!authenticated);
  set('app-status',health.ok?'Online':'Unavailable');set('app-detail',health.ok?health.data.version:'Check connection');renderDiscovery(discovery);
  const catalog=authenticated?await loadCatalog():{ok:false,data:{error:'SESSION_REQUIRED',message:'A protected session is required.'}};if(!authenticated)renderProducts(catalog);
  evidence={captured_at:new Date().toISOString(),environment:'development store',scope:'Read-only catalogue/discovery observation, not scenario validation',health,catalog,discovery};set('raw-output',JSON.stringify(evidence,null,2));el('download').disabled=false;el('run').disabled=false;set('run-status',`Finished at ${new Date().toLocaleTimeString()}`);
}
el('catalog-filters').addEventListener('submit',async event=>{event.preventDefault();currentFilters=new URLSearchParams();const f=new FormData(event.target);for(const key of ['q','category','vendor'])if(f.get(key))currentFilters.set(key,String(f.get(key)).trim());for(const [input,output]of[['min_usd','min_price'],['max_usd','max_price']])if(f.get(input)!=='')currentFilters.set(output,String(Math.round(Number(f.get(input))*100)));if(f.has('in_stock'))currentFilters.set('in_stock','true');cursor=null;page=1;await loadCatalog();});
el('catalog-filters').addEventListener('reset',()=>{currentFilters=new URLSearchParams();cursor=null;page=1;queueMicrotask(()=>loadCatalog());});
el('catalog-next').addEventListener('click',async()=>{if(!cursor)return;el('catalog-next').disabled=true;page++;await loadCatalog();});
el('run').addEventListener('click',run);
el('download').addEventListener('click',()=>{if(!evidence)return;const u=URL.createObjectURL(new Blob([JSON.stringify(evidence,null,2)],{type:'application/json'}));const a=node('a');a.href=u;a.download='agent-ready-observation.json';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);});
run();
