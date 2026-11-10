// This assertion is issued by a trusted backend, never from model arguments.
export class SessionError extends Error {
  constructor(code,message,status=401){super(message);this.code=code;this.status=status;}
}
const enc=new TextEncoder();
const keys=['sub','sid','store','market','currency','iat','exp'];
function bytes64(bytes){return btoa(String.fromCharCode(...bytes)).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');}
function from64(value){
  if(typeof value!=='string'||!value||!/^[A-Za-z0-9_-]+$/.test(value))throw new Error('encoding');
  const bytes=Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
  if(bytes64(bytes)!==value)throw new Error('canonical encoding');
  return bytes;
}
async function key(secret){
  if(typeof secret!=='string'||enc.encode(secret).length<32)throw new SessionError('SECURITY_CONFIGURATION','Configure independent service and session issuer secrets.',503);
  return crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
}
export async function signSession(payload,secret){
  const part=bytes64(enc.encode(JSON.stringify(payload)));
  return `${part}.${bytes64(new Uint8Array(await crypto.subtle.sign('HMAC',await key(secret),enc.encode(part))))}`;
}
export async function sessionKey(context){
  return bytes64(new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(JSON.stringify([context.sub,context.sid,context.store])))));
}
async function equalSecret(a,b){
  const [aa,bb]=await Promise.all([crypto.subtle.digest('SHA-256',enc.encode(a)),crypto.subtle.digest('SHA-256',enc.encode(b))]);
  const x=new Uint8Array(aa),y=new Uint8Array(bb);let difference=0;
  for(let i=0;i<x.length;i++)difference|=x[i]^y[i];
  return difference===0;
}
export async function authenticateCommerce(req,env,now=Math.floor(Date.now()/1000)){
  const service=env.COMMERCE_SERVICE_SECRET,issuer=env.SESSION_ISSUER_SECRET;
  await key(service);await key(issuer);
  if(service===issuer)throw new SessionError('SECURITY_CONFIGURATION','Service and session issuer secrets must be independent.',503);
  const authorization=req.headers.get('authorization')||'';
  if(!authorization.startsWith('Bearer ')||authorization.length>1024||!await equalSecret(authorization.slice(7),service))throw new SessionError('UNAUTHORIZED','A trusted service and signed session are required.');
  const assertion=req.headers.get('x-armans-session')||'';
  try{
    if(assertion.length>2048)throw new Error('size');
    const parts=assertion.split('.');if(parts.length!==2)throw new Error('parts');
    if(!await crypto.subtle.verify('HMAC',await key(issuer),from64(parts[1]),enc.encode(parts[0])))throw new Error('signature');
    const payload=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(from64(parts[0])));
    if(!payload||Array.isArray(payload)||Object.keys(payload).length!==keys.length||keys.some(k=>!Object.hasOwn(payload,k)))throw new Error('claims');
    for(const k of ['sub','sid'])if(typeof payload[k]!=='string'||!/^[A-Za-z0-9_-]{8,128}$/.test(payload[k]))throw new Error('identity');
    if(!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(payload.store)||payload.store!==env.SHOPIFY_STORE||payload.market!=='US'||payload.currency!=='USD')throw new Error('scope');
    if(!Number.isInteger(payload.iat)||!Number.isInteger(payload.exp)||payload.exp<=now||payload.iat>now+30||payload.iat<now-3600||payload.exp<=payload.iat||payload.exp-payload.iat>3600)throw new Error('lifetime');
    return Object.freeze(payload);
  }catch(e){if(e instanceof SessionError)throw e;throw new SessionError('INVALID_SESSION','The trusted session assertion is invalid or expired.');}
}
