// Single-merchant UCP adapter. No Admin credentials, payment or order tools.
export const UCP_VERSION = '2026-08-25';
export const AGENT_PROFILE = {ucp:{version:UCP_VERSION,services:{'dev.ucp.shopping':[{version:UCP_VERSION,transport:'mcp',spec:`https://ucp.dev/${UCP_VERSION}/specification/overview/`,schema:`https://ucp.dev/${UCP_VERSION}/services/shopping/mcp.openrpc.json`}]},payment_handlers:{},capabilities:Object.fromEntries([
  'dev.ucp.shopping.catalog.search','dev.ucp.shopping.catalog.lookup','dev.shopify.catalog',
  'dev.ucp.shopping.cart','dev.ucp.shopping.fulfillment','dev.ucp.shopping.discount','dev.ucp.shopping.buyer_consent'
].map(name=>[name,[{version:UCP_VERSION,...(name==='dev.shopify.catalog'?{extends:['dev.ucp.shopping.catalog.search','dev.ucp.shopping.catalog.lookup']}:['dev.ucp.shopping.fulfillment','dev.ucp.shopping.discount','dev.ucp.shopping.buyer_consent'].includes(name)?{extends:['dev.ucp.shopping.cart']}:{})}]]))}};

const schema = (properties, required) => ({type:'object',properties,required,additionalProperties:false});
const cartId = {type:'string',description:'Exact cart id returned by create_cart. Private to this conversation.'};
export const TOOLS = [
  {name:'search_catalog',description:'Search this development store using live Shopify UCP. Prices use minor currency units: USD 7900 means $79.00. Search availability is provisional; cart validation is authoritative.',inputSchema:schema({query:{type:'string',minLength:1,maxLength:160},max_price:{type:'integer',minimum:0,maximum:1000000,description:'Optional maximum price in minor currency units (USD cents).'}},['query'])},
  {name:'create_cart',description:'Create a test cart for a buyer-selected variant and quantity. Does not place an order. Check ready_for_handoff and all messages; an empty cart is a failure. The buyer can open continue_url to review on Shopify.',inputSchema:schema({variant_id:{type:'string',pattern:'^gid://shopify/ProductVariant/[0-9]+$'},quantity:{type:'integer',minimum:1,maximum:10}},['variant_id','quantity'])},
  {name:'get_cart',description:'Refresh this conversation\'s cart before presenting its total or handoff link.',inputSchema:schema({id:cartId},['id'])},
  {name:'cancel_cart',description:'Cancel this conversation\'s test cart when the buyer asks or when cleaning up a test.',inputSchema:schema({id:cartId},['id'])}
];

export class CommerceError extends Error {
  constructor(code,message,status=502){super(message);this.code=code;this.status=status;}
}
function host(env){if(!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(env.SHOPIFY_STORE||''))throw new CommerceError('CONFIGURATION','Configure the merchant domain.',503);return env.SHOPIFY_STORE;}
function profile(env){const value=env.UCP_AGENT_PROFILE_URL;let u;try{u=new URL(value);}catch{}if(!u||u.protocol!=='https:'||u.username||u.password)throw new CommerceError('CONFIGURATION','Configure the agent profile URL.',503);return u.href;}
export function safeLink(value,env){try{const u=new URL(value);return u.protocol==='https:'&&u.hostname===host(env)&&!u.username&&!u.password?u.href:null;}catch{return null;}}
function validate(name,args){
  const tool=TOOLS.find(t=>t.name===name);
  if(!tool)throw new CommerceError('TOOL_NOT_ALLOWED','This assistant cannot execute that operation.',400);
  if(!args||typeof args!=='object'||Array.isArray(args))throw new CommerceError('INVALID_INPUT','Supply an argument object.',400);
  for(const key of Object.keys(args))if(!(key in tool.inputSchema.properties))throw new CommerceError('INVALID_INPUT','Unexpected input field.',400);
  for(const key of tool.inputSchema.required)if(args[key]===undefined)throw new CommerceError('INVALID_INPUT','A required input is missing.',400);
  if(name==='search_catalog'&&(typeof args.query!=='string'||!args.query.trim()||args.query.length>160||args.max_price!==undefined&&(!Number.isInteger(args.max_price)||args.max_price<0||args.max_price>1000000)))throw new CommerceError('INVALID_INPUT','Provide a short product search and a valid price limit.',400);
  if(name==='create_cart'&&(!/^gid:\/\/shopify\/ProductVariant\/\d+$/.test(args.variant_id)||!Number.isInteger(args.quantity)||args.quantity<1||args.quantity>10))throw new CommerceError('INVALID_INPUT','Choose a valid variant and a quantity from 1 to 10.',400);
  if(['get_cart','cancel_cart'].includes(name)&&!(typeof args.id==='string'&&/^gid:\/\/shopify\/Cart\/[a-zA-Z0-9_-]+(?:\?key=[a-zA-Z0-9_%-]+)?$/.test(args.id)&&args.id.length<1024))throw new CommerceError('INVALID_INPUT','Use the cart returned by this store.',400);
}
async function boundedJSON(response,limit=524288){
  if(!response.body)throw new CommerceError('INVALID_RESPONSE','Shopify returned an empty response.');
  const reader=response.body.getReader();let total=0,body='';const decoder=new TextDecoder();
  try{while(true){const {value,done}=await reader.read();if(done)break;total+=value.byteLength;if(total>limit)throw new CommerceError('RESPONSE_LIMIT','Shopify response exceeded the size limit.');body+=decoder.decode(value,{stream:true});}body+=decoder.decode();}
  finally{await reader.cancel().catch(()=>{});}
  try{return JSON.parse(body);}catch{throw new CommerceError('INVALID_RESPONSE','Shopify returned an unreadable response.');}
}
const plain = value => typeof value==='string'?value.replace(/<[^>]*>/g,'').slice(0,1200):'';
export async function callCommerce(name,args,env,fetcher=fetch){
  validate(name,args);
  const meta={'ucp-agent':{profile:profile(env)}};
  let arguments_={meta};
  if(name==='search_catalog')arguments_.catalog={query:args.query.trim(),pagination:{limit:5},...(args.max_price===undefined?{}:{filters:{price:{max:args.max_price}}})};
  if(name==='create_cart')arguments_.cart={line_items:[{item:{id:args.variant_id},quantity:args.quantity}]};
  if(name==='get_cart'||name==='cancel_cart')arguments_.id=args.id;
  if(name==='cancel_cart')meta['idempotency-key']=crypto.randomUUID();
  let response;
  try{response=await fetcher(`https://${host(env)}/api/ucp/mcp`,{method:'POST',redirect:'manual',signal:AbortSignal.timeout(20000),headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:crypto.randomUUID(),method:'tools/call',params:{name,arguments:arguments_}})});}
  catch{throw new CommerceError('UPSTREAM_UNREACHABLE','Shopify did not respond. Refresh the cart before retrying a change.');}
  if(response.status===429)throw new CommerceError('RATE_LIMITED','Shopify is limiting requests. Wait before retrying.',429);
  if([401,403].includes(response.status))throw new CommerceError('ACCESS_BLOCKED','Shopify requires additional access for this operation.',503);
  if(!response.ok)throw new CommerceError('UPSTREAM_HTTP',`Shopify returned HTTP ${response.status}.`);
  const payload=await boundedJSON(response);
  let data=payload.result?.structuredContent;
  if(!data&&payload.result?.content?.[0]?.type==='text'){try{data=JSON.parse(payload.result.content[0].text);}catch{}}
  if(payload.error||!data||typeof data!=='object'||Array.isArray(data))throw new CommerceError('COMMERCE_REJECTED','Shopify could not complete this operation. No successful cart or checkout is confirmed.');
  const messages=Array.isArray(data.messages)?data.messages:[];
  const common={source:'Shopify UCP MCP',store:host(env),observed_at:new Date().toISOString(),environment:'development store',messages};
  const cart=data.cart||data;
  const cartMessages=Array.isArray(cart.messages)?cart.messages:messages;
  // Shopify's live missing-cart response uses isError=true and cart_not_found.
  // Preserve only this explicit structured business outcome before generic rejection.
  const missingCart=name==='get_cart'&&payload.result?.structuredContent&&cart&&typeof cart==='object'&&!Array.isArray(cart)&&typeof cart.id!=='string'&&(cart.ucp?.version||data.ucp?.version)===UCP_VERSION&&cartMessages.some(m=>m?.type==='error'&&m.severity==='unrecoverable'&&['not_found','cart_not_found'].includes(m.code));
  if(missingCart)return {...common,id:null,status:'not_found',line_items:[],totals:[],messages:cartMessages,continue_url:null,ready_for_handoff:false,order_placed:false,payment_submitted:false};
  if(payload.result?.isError||data.ucp?.status==='error'||cart.ucp?.status==='error')throw new CommerceError('COMMERCE_REJECTED','Shopify could not complete this operation. No successful cart or checkout is confirmed.');
  if(name==='search_catalog'){
    if(!Array.isArray(data.products))throw new CommerceError('INVALID_RESPONSE','Shopify did not return a product list.');
    return {...common,products:data.products.slice(0,5).map(p=>({id:p.id,title:p.title,description:plain(p.description?.html),variants:(p.variants||[]).slice(0,20).map(v=>({id:v.id,title:v.title,price:v.price,availability:v.availability,options:v.options})),product_url:safeLink(p.url,env)})),has_next_page:data.pagination?.has_next_page===true};
  }
  if(typeof cart.id!=='string')throw new CommerceError('INVALID_RESPONSE','Shopify did not return a cart identifier.');
  const items=Array.isArray(cart.line_items)?cart.line_items:[];
  // Keep merchant warnings/disclosures and ordered totals intact. Never infer success from HTTP 200.
  const url=safeLink(cart.continue_url,env);
  const blocked=cartMessages.some(m=>m.type==='error'||/out_of_stock|unavailable|insufficient|not_enough/i.test(m.code||''));
  return {...common,id:cart.id,status:cart.status||null,currency:cart.currency,line_items:items,totals:cart.totals||[],messages:cartMessages,continue_url:url,expires_at:cart.expires_at,ready_for_handoff:name!=='cancel_cart'&&items.length>0&&!blocked&&Boolean(url),order_placed:false,payment_submitted:false};
}
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});}
export async function handleCommerce(req,env,fetcher=fetch){
  const url=new URL(req.url);
  if(url.pathname==='/agent-profile.json'){
    if(!['GET','HEAD'].includes(req.method))return json({error:'METHOD_NOT_ALLOWED'},405);
    const response=json(AGENT_PROFILE);response.headers.set('Cache-Control','public, max-age=300');return response;
  }
  if(!['/api/mcp','/api/shop'].includes(url.pathname))return null;
  if(req.method!=='POST')return json({error:'METHOD_NOT_ALLOWED'},405);
  const origin=req.headers.get('origin');
  if(origin&&origin!==url.origin)return json({error:'ORIGIN_DENIED'},403);
  if(url.search)return json({error:'QUERY_NOT_SUPPORTED'},400);
  if(!req.headers.get('content-type')?.toLowerCase().startsWith('application/json'))return json({error:'JSON_REQUIRED'},415);
  let body;try{body=await boundedJSON(req,8192);}catch{return json({error:'INVALID_BODY'},400);}
  if(!body||typeof body!=='object'||Array.isArray(body))return json({error:'INVALID_BODY'},400);
  const mcp=url.pathname==='/api/mcp';
  const id=typeof body.id==='string'||typeof body.id==='number'?body.id:null;
  if(mcp){
    if(body.jsonrpc!=='2.0'||Array.isArray(body))return json({jsonrpc:'2.0',id,error:{code:-32600,message:'Invalid request'}},400);
    if(body.method==='notifications/initialized')return new Response(null,{status:202});
    if(body.method==='initialize')return json({jsonrpc:'2.0',id,result:{protocolVersion:'2025-03-26',capabilities:{tools:{listChanged:false}},serverInfo:{name:'armans-shopify-shopping',version:'0.2.0'},instructions:'Development store. Search and cart tools only. Human Shopify handoff; never place orders.'}});
    if(body.method==='tools/list')return json({jsonrpc:'2.0',id,result:{tools:TOOLS}});
    if(body.method==='ping')return json({jsonrpc:'2.0',id,result:{}});
    if(body.method!=='tools/call')return json({jsonrpc:'2.0',id,error:{code:-32601,message:'Method not found'}});
  }
  try{
    const result=await callCommerce(mcp?body.params?.name:body.name,mcp?body.params?.arguments:body.arguments,env,fetcher);
    return json(mcp?{jsonrpc:'2.0',id,result:{content:[{type:'text',text:JSON.stringify(result)}],structuredContent:result,isError:false}}:result);
  }catch(e){
    const data={error:e instanceof CommerceError?e.code:'INTERNAL_ERROR',message:e instanceof CommerceError?e.message:'The shopping operation failed safely.'};
    return json(mcp?{jsonrpc:'2.0',id,result:{content:[{type:'text',text:JSON.stringify(data)}],isError:true}}:data,mcp?200:e.status||500);
  }
}

