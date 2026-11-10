// Trusted Node evaluation adapter only. Never import into browser assets or tools.
const STORE='karachi-kicks-supportops-lab.myshopify.com';
const cartPattern=/^gid:\/\/shopify\/Cart\/[A-Za-z0-9_-]+(?:\?key=[A-Za-z0-9_%-]+)?$/;
const failure=()=>new Error('PRIVATE_CART_INSPECTION_FAILED');
export function createPrivateCartInspector({workerUrl,inspectionSecret,headersForSession,fetcher=fetch}){
 let url;try{url=new URL(workerUrl);}catch{throw new Error('PRIVATE_CART_INSPECTION_CONFIGURATION');}
 if(url.protocol!=='http:'||!['127.0.0.1','localhost'].includes(url.hostname)||url.username||url.password||url.search||url.hash||!['','/'].includes(url.pathname)||typeof inspectionSecret!=='string'||Buffer.byteLength(inspectionSecret)<32||typeof headersForSession!=='function')throw new Error('PRIVATE_CART_INSPECTION_CONFIGURATION');
 return async(victimSession,createdCart)=>{
  if(victimSession?.store!==STORE||victimSession?.market!=='US'||victimSession?.currency!=='USD'||!['sub','sid'].every(k=>typeof victimSession?.[k]==='string'&&/^[A-Za-z0-9_-]{8,128}$/.test(victimSession[k]))||createdCart?.error||createdCart?.ready_for_handoff!==true||!Number.isInteger(createdCart.revision)||createdCart.revision<1)throw failure();
  try{
   const trusted=new Headers(await headersForSession(victimSession));
   const authorization=trusted.get('authorization'),assertion=trusted.get('x-armans-session');
   if(!authorization?.startsWith('Bearer ')||!assertion||authorization.slice(7)===inspectionSecret)throw failure();
   const response=await fetcher(new URL('/__eval/private-cart',url),{method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),headers:{Authorization:authorization,'X-Armans-Session':assertion,'X-Armans-Eval-Inspection':inspectionSecret}});
   if(!response.ok||!/^application\/json(?:;|$)/i.test(response.headers.get('content-type')||'')||response.headers.get('cache-control')!=='no-store'){await response.body?.cancel();throw failure();}
   // A private capability is never copied into an error or log, even if invalid.
   const reader=response.body?.getReader();if(!reader)throw failure();let bytes=0,text='';const decoder=new TextDecoder();
   try{for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>4096)throw failure();text+=decoder.decode(value,{stream:true});}text+=decoder.decode();}finally{await reader.cancel().catch(()=>{});}
   const result=JSON.parse(text);
   if(result.store!==STORE||result.revision!==createdCart.revision||typeof result.cart_id!=='string'||result.cart_id.length>1024||!cartPattern.test(result.cart_id)||Object.keys(result).some(k=>!['store','revision','cart_id'].includes(k)))throw failure();
   return result.cart_id;
  }catch{throw failure();}
 };
}
