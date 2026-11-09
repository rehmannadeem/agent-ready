const el = id => document.getElementById(id);
let evidence = null;
const labels = { PASSWORD_GATE:'Password gate', WRONG_CONTENT:'Wrong content', PROFILE_SHAPE_OK:'Basic shape passed', PROFILE_SHAPE_FAILED:'Profile shape failed', NOT_FOUND:'Profile not found', INVALID_JSON:'Invalid JSON', RATE_LIMITED:'Rate limited', ACCESS_BLOCKED:'Access blocked', EXTERNAL_REDIRECT:'External redirect', HTTP_ERROR:'HTTP error' };
const time = value => value ? new Date(value).toLocaleString() : '—';
const set = (id, value) => { el(id).textContent = value; };

async function check(path) {
  try {
    const response = await fetch(path, { cache:'no-store', signal:AbortSignal.timeout(25000) });
    const data = await response.json();
    return { ok:response.ok, http_status:response.status, cache:response.headers.get('X-Workbench-Cache'), data };
  } catch { return { ok:false, data:{ error:'REQUEST_FAILED', message:'The application could not complete this request. Please retry.' } }; }
}

function renderProducts(result) {
  const target = el('products'); target.replaceChildren();
  const data = result.data;
  el('catalog-badge').className = `badge ${result.ok ? 'good' : 'warn'}`;
  set('catalog-badge', result.ok ? 'LIVE API' : 'ACTION NEEDED');
  if (!result.ok) {
    const message = document.createElement('div'); message.className = 'empty error'; message.textContent = data.message || 'The catalog request failed.'; target.append(message);
    set('catalog-status', data.error === 'SETUP_REQUIRED' ? 'Setup required' : 'Check failed');
    set('catalog-detail', data.error || 'Request failed');
    set('catalog-meta','No product observation was produced by this request.');
    return;
  }
  set('catalog-status','Connected');
  set('catalog-detail',`${data.products.length} product${data.products.length === 1 ? '' : 's'} returned`);
  set('catalog-note',`${data.shop_name} · ${data.store}`);
  set('catalog-meta',`Observed ${time(data.observed_at)} · ${result.cache === 'HIT' ? 'Cached observation, up to 30 seconds old' : 'Fresh observation'} · ${data.source}`);
  if (!data.products.length) { const message = document.createElement('div'); message.className = 'empty'; message.textContent = `The API connected successfully, but no product matched ${data.product_filter}. Verify the product handle in Shopify.`; target.append(message); }
  for (const product of data.products) {
    const card = document.createElement('article'); card.className = 'product-card';
    const heading = document.createElement('div'); heading.className = 'product-title';
    const text = document.createElement('div'); const title = document.createElement('h3'); title.textContent = product.title;
    const info = document.createElement('p'); info.textContent = `${product.handle} · ${product.status}`; text.append(title,info);
    const link = document.createElement('a'); link.className = 'product-link'; link.textContent = 'Open product ↗'; link.href = product.product_url; link.target = '_blank'; link.rel = 'noopener noreferrer'; heading.append(text,link); card.append(heading);
    const table = document.createElement('table'); const thead = document.createElement('thead'); const tr = document.createElement('tr');
    for (const title of ['VARIANT',`PRICE / ${data.currency}`]) { const th = document.createElement('th'); th.scope='col'; th.textContent=title; tr.append(th); } thead.append(tr); table.append(thead);
    const tbody=document.createElement('tbody');
    for (const variant of product.variants) { const row=document.createElement('tr'); for (const value of [variant.title,variant.price]) { const td=document.createElement('td'); td.textContent=value; row.append(td); } tbody.append(row); }
    table.append(tbody); card.append(table);
    if (product.more_variants) { const note=document.createElement('p'); note.className='section-note'; note.textContent='Showing the first 10 variants.'; card.append(note); }
    target.append(card);
  }
}

function renderDiscovery(result) {
  const data=result.data; const title=result.ok ? (labels[data.classification] || data.classification) : 'Check failed';
  set('discovery-status',title); set('discovery-detail',result.ok ? 'Public request completed' : (data.error || 'Request failed'));
  set('finding-title',title); set('finding-meaning',data.meaning || data.message || 'No conclusion available.');
  el('finding').className=`finding ${data.classification === 'PROFILE_SHAPE_OK' ? 'good' : 'warn'}`;
  set('http-status',data.http_status ?? '—'); set('content-type',data.content_type || '—'); set('redirects',data.redirects?.length ?? '—'); set('discovery-time',time(data.observed_at)); set('final-url',data.final_url || data.url || '');
}

async function run() {
  el('run').disabled=true; el('download').disabled=true; set('run-status','Checking the live services…');
  const [health,catalog,discovery]=await Promise.all([check('/api/health'),check('/api/catalog'),check('/api/discovery')]);
  set('app-status',health.ok ? 'Online' : 'Unavailable'); set('app-detail',health.ok ? `Cloudflare Worker · v${health.data.version}` : 'Check connection');
  renderProducts(catalog); renderDiscovery(discovery);
  evidence={application:'Armans.AI Agent-Ready Live',captured_at:new Date().toISOString(),environment:'development store',health,catalog,discovery,not_tested:['UCP service operations','AI platform listing','carts','checkout','payments','production customer handling']};
  set('raw-output',JSON.stringify(evidence,null,2)); set('run-status',`Checks finished at ${new Date().toLocaleTimeString()}`); el('run').disabled=false; el('download').disabled=false;
}
el('run').addEventListener('click',run);
el('download').addEventListener('click',()=>{if(!evidence)return;const url=URL.createObjectURL(new Blob([JSON.stringify(evidence,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`agent-ready-evidence-${new Date().toISOString().replace(/[:.]/g,'-')}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
run();
