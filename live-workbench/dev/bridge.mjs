import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, createHash } from 'node:crypto';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { signSession } from '../src/session-security.mjs';

const STORE = 'karachi-kicks-supportops-lab.myshopify.com';
const COOKIE = 'armans_local_session';
const hash = value => createHash('sha256').update(value).digest('hex');
const randomToken = () => randomBytes(32).toString('base64url');
const staticPaths = new Set(['/', '/index.html', '/app.js', '/shopping.js', '/styles.css']);
const apiPaths = new Set(['/api/catalog', '/api/shop', '/api/health', '/api/discovery']);
const baseHeaders = {'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow'};
const json = (body,status=200,extra={}) => new Response(JSON.stringify(body),{status,headers:{...baseHeaders,'Content-Type':'application/json; charset=utf-8',...extra}});

function checkSecrets(env) {
  for(const name of ['COMMERCE_SERVICE_SECRET','SESSION_ISSUER_SECRET']) {
    if(typeof env[name]!=='string'||Buffer.byteLength(env[name])<32) throw new Error('BRIDGE_SECURITY_CONFIGURATION');
  }
  if(env.COMMERCE_SERVICE_SECRET===env.SESSION_ISSUER_SECRET) throw new Error('BRIDGE_INDEPENDENT_SECRETS_REQUIRED');
  if(env.SHOPIFY_STORE && env.SHOPIFY_STORE!==STORE) throw new Error('BRIDGE_STORE_MISMATCH');
}

/** Server-process interface for evaluation; never exposed as a browser route. */
export function trustedSessionFactory(env, {now=()=>Math.floor(Date.now()/1000),ttlSeconds=3600}={}) {
  checkSecrets(env);
  if(!Number.isInteger(ttlSeconds)||ttlSeconds<60||ttlSeconds>3600)throw new Error('SESSION_LIFETIME');
  const sub = `local_operator_${randomBytes(16).toString('hex')}`;
  return Object.freeze({
    create() {
      const sid = randomToken(), iat=now(), exp=iat+ttlSeconds;
      const context = Object.freeze({sub,sid,store:STORE,market:'US',currency:'USD',iat,exp});
      return Object.freeze({
        context,
        async headers() {
          if(now()>=exp)throw new Error('SESSION_EXPIRED');
          return {'Authorization':`Bearer ${env.COMMERCE_SERVICE_SECRET}`,'X-Armans-Session':await signSession(context,env.SESSION_ISSUER_SECRET)};
        }
      });
    }
  });
}

function openState(path) {
  if(path!==':memory:') {
    mkdirSync(dirname(path),{recursive:true,mode:0o700});
    chmodSync(dirname(path),0o700);
  }
  const db = new DatabaseSync(path);
  if(path!==':memory:')chmodSync(path,0o600);
  db.exec('PRAGMA journal_mode=DELETE; PRAGMA busy_timeout=3000; CREATE TABLE IF NOT EXISTS metadata (name TEXT PRIMARY KEY,value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS bootstraps (digest TEXT PRIMARY KEY,expires INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS sessions (digest TEXT PRIMARY KEY,sid TEXT UNIQUE NOT NULL,sub TEXT NOT NULL,created INTEGER NOT NULL,expires INTEGER NOT NULL);');
  db.prepare('INSERT OR IGNORE INTO metadata(name,value) VALUES (?,?)').run('principal',`local_operator_${randomBytes(16).toString('hex')}`);
  return db;
}

function cookieValue(request) {
  const values=(request.headers.get('cookie')||'').split(';').map(x=>x.trim()).filter(x=>x.startsWith(`${COOKIE}=`));
  if(values.length!==1)return null;
  const value=values[0].slice(COOKIE.length+1);
  return /^[A-Za-z0-9_-]{43}$/.test(value)?value:null;
}

async function boundedBody(request,max=32768) {
  if(Number(request.headers.get('content-length'))>max)throw new Error('BODY_LIMIT');
  if(!request.body)return new Uint8Array();
  const reader=request.body.getReader();let bytes=0,chunks=[];
  try {while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>max)throw new Error('BODY_LIMIT');chunks.push(value);}}
  finally{await reader.cancel().catch(()=>{});}
  return Buffer.concat(chunks);
}

const loginHTML = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="robots" content="noindex"><meta name="viewport" content="width=device-width"><title>Armans local session</title><body><h1>Armans development session</h1><p id="status">Opening your private development session…</p><script src="/login.js"></script></body></html>`;
// This script handles only the one-use local login nonce. Service/issuer secrets never enter it.
const loginJS = `const token=new URLSearchParams(location.hash.slice(1)).get('bootstrap');history.replaceState(null,'','/login');if(!token){document.getElementById('status').textContent='Start the local bridge to obtain a new one-use login link.';}else{fetch('/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({bootstrap:token})}).then(async r=>{if(!r.ok)throw new Error();location.replace('/');}).catch(()=>{document.getElementById('status').textContent='This login link expired or has already been used. Generate a new one from the local bridge.';});}`;

/** Loopback-only browser bridge. Credentials are injected only at the server boundary. */
export function createBridge({env,dbPath=':memory:',port=8788,workerPort=8787,fetcher=fetch,now=()=>Math.floor(Date.now()/1000),sessionTtl=3600}={}) {
  checkSecrets(env||{});
  if(!Number.isInteger(port)||port<1024||port>65535||!Number.isInteger(workerPort)||workerPort<1024||workerPort>65535)throw new Error('INVALID_LOCAL_PORT');
  if(!Number.isInteger(sessionTtl)||sessionTtl<60||sessionTtl>3600)throw new Error('SESSION_LIFETIME');
  const origin=`http://127.0.0.1:${port}`, expectedHost=`127.0.0.1:${port}`, upstream=`http://127.0.0.1:${workerPort}`;
  const db=openState(dbPath);
  const principal=db.prepare('SELECT value FROM metadata WHERE name=?').get('principal').value;
  const getSession=request=>{const value=cookieValue(request);return value?db.prepare('SELECT sid,sub,created,expires FROM sessions WHERE digest=? AND expires>?').get(hash(value),now()):null;};
  const issueBootstrap=()=>{
    const token=randomToken(),expires=now()+300;
    db.prepare('DELETE FROM bootstraps WHERE expires<=?').run(now());
    db.prepare('INSERT INTO bootstraps(digest,expires) VALUES (?,?)').run(hash(token),expires);
    return {url:`${origin}/login#bootstrap=${token}`,expires};
  };
  async function handle(request) {
    try {
      const url=new URL(request.url),host=request.headers.get('host');
      if(host!==expectedHost||url.origin!==origin)return json({error:'HOST_DENIED'},403);
      const reqOrigin=request.headers.get('origin');
      if(reqOrigin&&reqOrigin!==origin)return json({error:'ORIGIN_DENIED'},403);
      if(request.headers.get('sec-fetch-site')==='cross-site')return json({error:'ORIGIN_DENIED'},403);
      if(!['GET','HEAD','POST'].includes(request.method))return json({error:'METHOD_NOT_ALLOWED'},405);
      if(request.method==='POST'&&reqOrigin!==origin)return json({error:'ORIGIN_REQUIRED'},403);
      if(url.pathname==='/login'&&request.method==='GET'&&!url.search)return new Response(loginHTML,{headers:{...baseHeaders,'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'none'; script-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'"}});
      if(url.pathname==='/login.js'&&request.method==='GET'&&!url.search)return new Response(loginJS,{headers:{...baseHeaders,'Content-Type':'text/javascript; charset=utf-8'}});
      if(url.pathname==='/login'&&request.method==='POST'&&!url.search){
        if(!request.headers.get('content-type')?.startsWith('application/json'))return json({error:'JSON_REQUIRED'},415);
        const body=JSON.parse(new TextDecoder().decode(await boundedBody(request,1024)));
        if(!body||Object.keys(body).length!==1||typeof body.bootstrap!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(body.bootstrap))return json({error:'INVALID_BOOTSTRAP'},401);
        const token=randomToken(),sid=randomToken(),created=now(),expires=created+sessionTtl;
        db.exec('BEGIN IMMEDIATE');
        try{
          const consumed=db.prepare('DELETE FROM bootstraps WHERE digest=? AND expires>?').run(hash(body.bootstrap),created);
          if(consumed.changes!==1){db.exec('ROLLBACK');return json({error:'INVALID_BOOTSTRAP'},401);}
          db.prepare('INSERT INTO sessions(digest,sid,sub,created,expires) VALUES (?,?,?,?,?)').run(hash(token),sid,principal,created,expires);
          db.exec('COMMIT');
        }catch(error){db.exec('ROLLBACK');throw error;}
        return json({authenticated:true,expires_at:new Date(expires*1000).toISOString()},200,{'Set-Cookie':`${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${sessionTtl}`});
      }
      if(url.pathname==='/api/session'&&request.method==='GET'&&!url.search){const session=getSession(request);return json(session?{authenticated:true,expires_at:new Date(session.expires*1000).toISOString()}:{authenticated:false},session?200:401);}
      if(url.pathname==='/logout'&&request.method==='POST'&&!url.search){const token=cookieValue(request);if(token)db.prepare('DELETE FROM sessions WHERE digest=?').run(hash(token));return json({authenticated:false},200,{'Set-Cookie':`${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`});}
      const isAPI=apiPaths.has(url.pathname);
      if(!isAPI&&!staticPaths.has(url.pathname))return json({error:'NOT_FOUND'},404);
      if(url.pathname==='/api/shop'&&request.method!=='POST')return json({error:'METHOD_NOT_ALLOWED'},405);
      if(url.pathname!=='/api/shop'&&!['GET','HEAD'].includes(request.method))return json({error:'METHOD_NOT_ALLOWED'},405);
      const session=getSession(request);
      if(!session)return isAPI?json({error:'LOCAL_SESSION_REQUIRED'},401):new Response(null,{status:303,headers:{...baseHeaders,Location:'/login'}});
      const headers=new Headers({'Accept':isAPI?'application/json':'*/*'});
      if(isAPI){
        const iat=now(),payload={sub:session.sub,sid:session.sid,store:STORE,market:'US',currency:'USD',iat,exp:Math.min(iat+3600,session.expires)};
        headers.set('Authorization',`Bearer ${env.COMMERCE_SERVICE_SECRET}`);
        headers.set('X-Armans-Session',await signSession(payload,env.SESSION_ISSUER_SECRET));
      }
      let body;
      if(request.method==='POST'){
        if(!request.headers.get('content-type')?.startsWith('application/json'))return json({error:'JSON_REQUIRED'},415);
        headers.set('Content-Type','application/json');body=await boundedBody(request);
      }
      const response=await fetcher(`${upstream}${url.pathname}${url.search}`,{method:request.method,headers,body,redirect:'manual',signal:AbortSignal.timeout(30000)});
      // No redirects, Set-Cookie, Authorization or arbitrary upstream headers cross this boundary.
      if(response.status>=300&&response.status<400){await response.body?.cancel();return json({error:'UPSTREAM_REDIRECT_DENIED'},502);}
      const resultHeaders={...baseHeaders,'Content-Type':response.headers.get('content-type')||(isAPI?'application/json':'application/octet-stream')};
      if(response.headers.has('content-security-policy'))resultHeaders['Content-Security-Policy']=response.headers.get('content-security-policy');
      return new Response(response.body,{status:response.status,headers:resultHeaders});
    }catch(error){return json({error:error?.message==='BODY_LIMIT'?'BODY_LIMIT':'BRIDGE_REQUEST_FAILED'},error?.message==='BODY_LIMIT'?413:502);}
  }
  function server(){return createServer(async(req,res)=>{
    try{
      if(req.socket.remoteAddress!=='127.0.0.1'){res.writeHead(403);res.end();return;}
      const headers=new Headers();for(const [name,value] of Object.entries(req.headers))if(value!==undefined)headers.set(name,Array.isArray(value)?value.join(', '):value);
      const request=new Request(`${origin}${req.url}`,{method:req.method,headers,...(!['GET','HEAD'].includes(req.method)?{body:req,duplex:'half'}:{})});
      const response=await handle(request);res.writeHead(response.status,Object.fromEntries(response.headers));
      if(req.method==='HEAD'){await response.body?.cancel();res.end();return;}
      if(response.body)for await(const chunk of response.body)res.write(chunk);res.end();
    }catch{if(!res.headersSent)res.writeHead(502,baseHeaders);res.end();}
  });}
  return {handle,issueBootstrap,server,close:()=>db.close(),origin};
}

export const DEFAULT_PRIVATE_DIR=resolve(dirname(fileURLToPath(import.meta.url)),'private');
