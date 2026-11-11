import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createBridge, trustedSessionFactory } from '../dev/bridge.mjs';
import { authenticateCommerce } from '../src/session-security.mjs';

const env={COMMERCE_SERVICE_SECRET:'service-only-test-secret-'.repeat(3),SESSION_ISSUER_SECRET:'issuer-only-test-secret-'.repeat(3),SHOPIFY_STORE:'karachi-kicks-supportops-lab.myshopify.com'};
const origin='http://127.0.0.1:8788';
const req=(path,options={})=>new Request(origin+path,{...options,headers:{Host:'127.0.0.1:8788',...(options.headers||{})}});
const post=(path,body,headers={})=>req(path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
async function login(bridge){const {url}=bridge.issueBootstrap();const bootstrap=new URLSearchParams(new URL(url).hash.slice(1)).get('bootstrap');const response=await bridge.handle(post('/login',{bootstrap}));assert.equal(response.status,200);return {bootstrap,cookie:response.headers.get('set-cookie').split(';')[0],response};}

test('missing session, cross-site origin and rebinding host never reach Worker',async()=>{
  let calls=0;const bridge=createBridge({env,fetcher:async()=>{calls++;return new Response('{}');}});
  try{
    assert.equal((await bridge.handle(req('/api/catalog'))).status,401);
    assert.equal((await bridge.handle(req('/api/session'))).status,401);
    assert.equal((await bridge.handle(req('/api/catalog',{headers:{Host:'evil.invalid'}}))).status,403);
    assert.equal((await bridge.handle(post('/api/shop',{}, {Origin:'https://evil.invalid'}))).status,403);
    assert.equal((await bridge.handle(req('/api/catalog',{headers:{'Sec-Fetch-Site':'cross-site'}}))).status,403);
    assert.equal(calls,0);
  }finally{bridge.close();}
});

test('one-use operator bootstrap sets protected cookie and refuses arbitrary identities',async()=>{
  const bridge=createBridge({env});
  try{
    const first=await login(bridge);
    assert.match(first.response.headers.get('set-cookie'),/HttpOnly; SameSite=Strict/);
    assert.equal((await bridge.handle(post('/login',{bootstrap:first.bootstrap}))).status,401);
    assert.equal((await bridge.handle(post('/login',{bootstrap:'x'.repeat(43),sub:'other_user'}))).status,401);
    const status=await bridge.handle(req('/api/session',{headers:{Cookie:first.cookie}}));
    assert.equal(status.status,200);assert.deepEqual(Object.keys(await status.json()).sort(),['authenticated','expires_at']);
    assert.equal((await bridge.handle(post('/api/shop',{}, {Cookie:first.cookie,Origin:''}))).status,403);
  }finally{bridge.close();}
});

test('cross-site top-level document navigation exposes only the public login shell',async()=>{
  let calls=0;const bridge=createBridge({env,fetcher:async()=>{calls++;return new Response('private');}});
  try{
    const first=await login(bridge);
    const metadata={'Sec-Fetch-Site':'cross-site','Sec-Fetch-Mode':'navigate','Sec-Fetch-Dest':'document',Cookie:first.cookie};
    for(const path of ['/','/index.html']){const response=await bridge.handle(req(path,{headers:metadata}));assert.equal(response.status,303);assert.equal(response.headers.get('location'),'/login');}
    const page=await bridge.handle(req('/login',{headers:metadata}));assert.equal(page.status,200);assert.ok((await page.text()).includes('Armans development session'));
    for(const path of ['/api/session','/api/catalog','/login.js'])assert.equal((await bridge.handle(req(path,{headers:metadata}))).status,403);
    for(const extra of [{Origin:'https://evil.invalid'},{'Sec-Fetch-Dest':'iframe'},{'Sec-Fetch-Mode':'cors'}])assert.equal((await bridge.handle(req('/login',{headers:{...metadata,...extra}}))).status,403);
    assert.equal((await bridge.handle(post('/login',{bootstrap:'x'.repeat(43)},metadata))).status,403);
    assert.equal(calls,0);
  }finally{bridge.close();}
});

test('caller headers cannot choose another session; upstream credentials and headers stay private',async()=>{
  const seen=[];const bridge=createBridge({env,fetcher:async(url,init)=>{const ctx=await authenticateCommerce(new Request(url,{headers:init.headers}),env);seen.push({url,ctx,headers:init.headers});return new Response('{"ok":true}',{headers:{'Content-Type':'application/json','Set-Cookie':'attacker=1','Authorization':'secret-response','X-Armans-Session':'secret-response'}});}});
  try{
    const a=await login(bridge),b=await login(bridge);
    const fake={'Authorization':'Bearer client-controlled','X-Armans-Session':'forged','X-User-Id':'someone_else'};
    const ra=await bridge.handle(post('/api/shop',{name:'get_cart',arguments:{}},{Cookie:a.cookie,...fake}));
    assert.equal(ra.status,200);assert.equal(ra.headers.get('set-cookie'),null);assert.equal(ra.headers.get('authorization'),null);assert.equal(ra.headers.get('x-armans-session'),null);
    await bridge.handle(post('/api/shop',{name:'get_cart',arguments:{}},{Cookie:b.cookie,...fake}));
    await bridge.handle(req('/api/catalog?limit=10',{headers:{Cookie:a.cookie,...fake}}));
    assert.notEqual(seen[0].ctx.sid,seen[1].ctx.sid);assert.equal(seen[0].ctx.sid,seen[2].ctx.sid);assert.equal(seen[0].ctx.sub,seen[1].ctx.sub);
    assert.equal(seen[0].headers.get('x-user-id'),null);assert.equal(seen[0].headers.get('cookie'),null);assert.equal(seen[0].headers.get('authorization'),`Bearer ${env.COMMERCE_SERVICE_SECRET}`);
    assert.equal(seen[2].url,'http://127.0.0.1:8787/api/catalog?limit=10');
    assert.equal((await bridge.handle(req('/api/mcp',{headers:{Cookie:a.cookie}}))).status,404);
  }finally{bridge.close();}
});

test('persistent session survives bridge restart; expired session and bootstrap fail closed',async()=>{
  const folder=mkdtempSync(join(tmpdir(),'armans-bridge-'));const path=join(folder,'state.sqlite');let clock=1794326400;
  let bridge=createBridge({env,dbPath:path,now:()=>clock,sessionTtl:120});
  try{
    const first=await login(bridge);const token=first.cookie.split('=')[1];const nonce=bridge.issueBootstrap();
    bridge.close();bridge=createBridge({env,dbPath:path,now:()=>clock,sessionTtl:120});
    assert.equal((await bridge.handle(req('/api/session',{headers:{Cookie:first.cookie}}))).status,200);
    assert.equal(readFileSync(path).includes(Buffer.from(token)),false);
    assert.equal(readFileSync(path).includes(Buffer.from(first.bootstrap)),false);
    clock+=301;
    assert.equal((await bridge.handle(req('/api/session',{headers:{Cookie:first.cookie}}))).status,401);
    assert.equal((await bridge.handle(post('/login',{bootstrap:new URLSearchParams(new URL(nonce.url).hash.slice(1)).get('bootstrap')}))).status,401);
  }finally{bridge.close();rmSync(folder,{recursive:true,force:true});}
});

test('logout revokes session and login assets never contain server credentials',async()=>{
  const bridge=createBridge({env});
  try{
    for(const path of ['/login','/login.js']){const text=await(await bridge.handle(req(path))).text();assert.ok(!text.includes(env.COMMERCE_SERVICE_SECRET));assert.ok(!text.includes(env.SESSION_ISSUER_SECRET));assert.ok(!text.includes('Authorization'));}
    const first=await login(bridge);assert.equal((await bridge.handle(post('/logout',{}, {Cookie:first.cookie}))).status,200);
    assert.equal((await bridge.handle(req('/api/session',{headers:{Cookie:first.cookie}}))).status,401);
  }finally{bridge.close();}
});

test('upstream redirects denied and request size bounded',async()=>{
  let calls=0;const bridge=createBridge({env,fetcher:async()=>{calls++;return new Response(null,{status:302,headers:{Location:'https://elsewhere.invalid'}});}});
  try{
    const first=await login(bridge);
    assert.equal((await bridge.handle(req('/api/catalog',{headers:{Cookie:first.cookie}}))).status,502);
    assert.equal((await bridge.handle(post('/api/shop',{large:'x'.repeat(33000)},{Cookie:first.cookie}))).status,413);
    assert.equal(calls,1);
  }finally{bridge.close();}
});

test('trusted harness factory creates isolated bounded assertions without browser identity input',async()=>{
  let now=1794326400;const factory=trustedSessionFactory(env,{now:()=>now,ttlSeconds:60});
  const sessions=Array.from({length:20},()=>factory.create());assert.equal(new Set(sessions.map(x=>x.context.sid)).size,20);
  for(const session of sessions){const claims=await authenticateCommerce(new Request('http://127.0.0.1:8787/api/mcp',{headers:await session.headers()}),env,now);assert.equal(claims.sid,session.context.sid);assert.equal(claims.store,env.SHOPIFY_STORE);}
  now+=61;await assert.rejects(()=>sessions[0].headers(),/SESSION_EXPIRED/);
  assert.throws(()=>trustedSessionFactory({...env,SESSION_ISSUER_SECRET:env.COMMERCE_SERVICE_SECRET}),/INDEPENDENT/);
  assert.throws(()=>trustedSessionFactory({...env,SHOPIFY_STORE:'different.myshopify.com'}),/STORE_MISMATCH/);
});
