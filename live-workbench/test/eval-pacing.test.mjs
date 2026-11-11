import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequestPacer,createWorkerClient} from '../evals/runner.mjs';

test('one shared pacer spaces model, setup and companion requests across sessions',async()=>{
 let now=0;const waits=[],starts=[];
 const beforeRequest=createRequestPacer({minIntervalMs:3000,clock:{now:()=>now,sleep:async ms=>{await new Promise(setImmediate);waits.push(ms);now+=ms;}}});
 const fetcher=async()=>{starts.push(now);return new Response(JSON.stringify({result:{structuredContent:{products:[]}}}));};
 const a=createWorkerClient({baseUrl:'http://127.0.0.1:8787',headersForSession:async()=>({}),fetcher,beforeRequest});
 const b=createWorkerClient({baseUrl:'http://127.0.0.1:8787',headersForSession:async()=>({}),fetcher,beforeRequest});
 await Promise.all([a.callTool('search_catalog',{},{}),b.callTool('get_cart',{},{}),(async()=>{await beforeRequest();starts.push(now);})()]);
 assert.deepEqual(starts,[0,3000,6000]);assert.deepEqual(waits,[3000,3000]);
});

test('pacing defaults to no extra wait and rejects unbounded configuration',async()=>{
 let sleeps=0;const pace=createRequestPacer({clock:{now:()=>100,sleep:async()=>{sleeps++;}}});await pace();await pace();assert.equal(sleeps,0);
 for(const value of [-1,10001,1.5,'3000',NaN])assert.throws(()=>createRequestPacer({minIntervalMs:value}),/INVALID_REQUEST_PACING/);
});

test('worker client preserves bounded Retry-After without retrying mutations',async()=>{
 for(const value of [0,1,86400,-1,86401,'3',null]){
  let requests=0;const client=createWorkerClient({baseUrl:'http://127.0.0.1:8787',headersForSession:async()=>({}),fetcher:async()=>{requests++;return new Response(JSON.stringify({result:{isError:true,structuredContent:{error:'RATE_LIMITED',retry_after_seconds:value}}}));}});
  const result=await client.callTool('create_cart',{},{});assert.equal(result.error,'RATE_LIMITED');assert.equal(requests,1);
  assert.equal(Object.hasOwn(result,'retry_after_seconds'),Number.isInteger(value)&&value>=0&&value<=86400);
 }
});
