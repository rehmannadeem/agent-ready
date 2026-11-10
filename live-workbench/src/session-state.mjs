import { authenticateCommerce, sessionKey } from './session-security.mjs';
import { callCommerce, validateTool, boundedJSON, CommerceError, json, errorData } from './commerce.mjs';

const mutations=new Set(['create_cart','update_cart','cancel_cart']);
const knownNoChange=new Set(['INVALID_INPUT','TOOL_NOT_ALLOWED','NO_CURRENT_CART','STATE_REQUIRED','CONFIGURATION','SECURITY_CONFIGURATION','RATE_LIMITED','ACCESS_BLOCKED','PRODUCT_NOT_ELIGIBLE','VARIANT_NOT_ELIGIBLE','CATALOG_NOT_ELIGIBLE','ELIGIBILITY_DENIED','CATALOG_CONFIGURATION']);
const noCart=()=>({source:'Armans session state',status:'no_current_cart',line_items:[],totals:[],messages:[],continue_url:null,ready_for_handoff:false,order_placed:false,payment_submitted:false});

// SQLite-backed Durable Object storage in Wrangler; in-memory queue serializes
// fetch awaits. Persisted PENDING survives eviction/crash and fails closed.
export class ArmansSessionState {
  constructor(ctx,env,testDependencies={}){
    this.ctx=ctx;this.env=env;this.fetcher=testDependencies.fetcher||fetch;
    this.gates=testDependencies.gates;this.queue=Promise.resolve();this.rateQueued=0;
    this.clock=testDependencies.clock||{now:()=>Date.now(),wait:ms=>new Promise(resolve=>setTimeout(resolve,ms))};
  }
  async fetch(req){
    if(new URL(req.url).pathname==='/consume'){
      try{await authenticateCommerce(req,this.env);}catch(e){return json(errorData(e),e.status||401);}
      if(this.rateQueued>=2)return json({error:'SERVICE_RATE_LIMITED',message:'The service request queue is full.'},429);
      const admittedAt=this.clock.now();this.rateQueued++;
      const job=this.queue.then(()=>this.consume(req,admittedAt)).finally(()=>{this.rateQueued--;});
      this.queue=job.catch(()=>{});return job;
    }
    const job=this.queue.then(()=>this.operate(req));
    this.queue=job.catch(()=>{});return job;
  }
  async consume(req,admittedAt){
    try{
      if(req.method!=='POST'||new URL(req.url).search)throw new CommerceError('METHOD_NOT_ALLOWED','Unsupported permit operation.',405);
      const previous=await this.ctx.storage.get('service-rate');
      if(previous!==undefined&&(!previous||!Number.isFinite(previous.nextAt)||previous.nextAt<0))throw new CommerceError('SERVICE_RATE_UNAVAILABLE','The shared permit state requires operator review.',503);
      const now=this.clock.now(),wait=Math.max(0,(previous?.nextAt||0)-now);
      // One global permit per second. At most two callers can queue and no
      // merchant request is retried. Storage failures grant no permit.
      if(wait>1000||now-admittedAt+wait>1500)throw new CommerceError('SERVICE_RATE_LIMITED','The service request queue is full.',429);
      if(wait)await this.clock.wait(wait);
      await this.ctx.storage.put('service-rate',{nextAt:this.clock.now()+1000});
      return json({allowed:true});
    }catch(e){return json(errorData(e),e.status||503);}
  }
  async operate(req){
    try{
      const principal=await authenticateCommerce(req,this.env);
      if(req.method!=='POST'||new URL(req.url).pathname!=='/operate')throw new CommerceError('METHOD_NOT_ALLOWED','Unsupported session operation.',405);
      const body=await boundedJSON(req,16384),name=body?.name,args=validateTool(name,body?.arguments);
      const owner=await sessionKey(principal),now=Date.now();
      let state=await this.ctx.storage.get('session');
      if(state&&state.owner!==owner)throw new CommerceError('SESSION_MISMATCH','The session does not own this cart.',403);
      if(!state)state={owner,revision:0,cartId:null,phase:'READY',cursors:[],rate:{minute:0,count:0}};
      // A previous invocation may have stopped after sending a mutation.
      if(state.phase==='PENDING')state.phase='UNKNOWN';
      const minute=Math.floor(now/60000);
      if(state.rate?.minute!==minute)state.rate={minute,count:0};
      const rateLimit=Math.max(1,Math.min(300,Number(this.env.SESSION_REQUESTS_PER_MINUTE)||120));
      if(state.rate.count>=rateLimit)throw new CommerceError('SESSION_RATE_LIMITED','This session is busy. Wait a minute before retrying.',429);
      state.rate.count++;
      state.cursors=(state.cursors||[]).filter(c=>c.expires>now).slice(-20);
      await this.ctx.storage.put('session',state);
      if(state.phase==='UNKNOWN'&&name!=='get_cart'&&mutations.has(name))throw new CommerceError('MUTATION_OUTCOME_UNKNOWN','The last change has an unknown outcome. Refresh the known cart before any further change; an unknown creation requires operator recovery.',409);
      if(name==='create_cart'&&state.cartId)throw new CommerceError('CURRENT_CART_EXISTS','This session already has a cart. Update it or cancel and verify its absence first.',409);
      if(['update_cart','cancel_cart','get_cart'].includes(name)&&!state.cartId){
        if(state.phase==='UNKNOWN')throw new CommerceError('MUTATION_OUTCOME_UNKNOWN','A previous creation has an unknown outcome and no confirmed cart ID. Operator recovery is required; no automatic recreation.',409);
        if(name==='get_cart')return json({...noCart(),revision:state.revision});
        throw new CommerceError('NO_CURRENT_CART','This session has no current cart.',409);
      }
      const context={...principal,cartId:state.cartId,authentication:{Authorization:req.headers.get('authorization'),'X-Armans-Session':req.headers.get('x-armans-session')}};
      const queryKey=JSON.stringify([args.query,args.max_price??null,args.limit]);
      if(name==='search_catalog'&&args.cursor){
        const cursor=state.cursors.find(c=>c.token===args.cursor&&c.query===queryKey);
        if(!cursor)throw new CommerceError('INVALID_CURSOR','Use this session’s returned cursor with the same query, filter and limit.',400);
        context.upstreamCursor=cursor.upstream;
      }
      if(name==='update_cart'){
        const current=await callCommerce('get_cart',{},this.env,this.fetcher,context,this.gates);
        if(current.status==='not_found'){
          state.cartId=null;state.phase='READY';state.lastOutcome='not_found';await this.ctx.storage.put('session',state);
          return json({...this.publicResult(current),revision:state.revision});
        }
        context.snapshot=current._snapshot;
      }
      const mutation=mutations.has(name);let mutationSent=false;
      if(mutation){
        context.operationId=crypto.randomUUID();
        context.beforeMutation=async()=>{
          mutationSent=true;state.phase='PENDING';state.operation={name,id:context.operationId,started_at:now,revision:state.revision};
          await this.ctx.storage.put('session',state);
        };
      }
      let result;
      try{result=await callCommerce(name,args,this.env,this.fetcher,context,this.gates);}
      catch(e){
        if(mutationSent){state.phase=knownNoChange.has(e.code)?'READY':'UNKNOWN';state.lastOutcome=e.code||'UNKNOWN';await this.ctx.storage.put('session',state);}
        throw e;
      }
      if(name==='search_catalog'){
        if(result.has_next_page&&result.next_cursor){
          const token=crypto.randomUUID().replace(/-/g,'');
          state.cursors.push({token,query:queryKey,upstream:result.next_cursor,expires:now+20*60000});
          state.cursors=state.cursors.slice(-20);result.next_cursor=token;
        }else result.next_cursor=null;
      }
      if(['create_cart','update_cart','get_cart','cancel_cart'].includes(name)){
        if(result.status==='not_found'){state.cartId=null;state.phase='READY';}
        else{
          state.cartId=result.id;
          state.phase=name==='cancel_cart'?'CANCELLATION_REQUESTED':'READY';
        }
        state.lastOutcome=result.status;state.lastObservedAt=result.observed_at;
        state.lines=result.line_items.map(l=>({variant_id:l.item.id,quantity:l.quantity}));
        state.discountCodes=result.discounts?.codes||[];
        if(mutation)state.revision++;
        delete state.operation;
      }
      await this.ctx.storage.put('session',state);
      return json({...this.publicResult(result),revision:state.revision});
    }catch(e){return json(errorData(e),e.status||500);}
  }
  publicResult(result){const {id,_snapshot,...safe}=result;return safe;}
}
