/** Select only the native model result from a filtered n8n execution response.
 * Never serialize the complete executionData/startData/authentication context. */
export function projectModelExecution(envelope,{executionId,reservationId,workflowId='McTDlGb8oc3hZ5gl'}={}){
 let data=envelope?.structuredContent||envelope;
 if(!data?.execution&&Array.isArray(envelope?.content)){
  const text=envelope.content.find(c=>c.type==='text')?.text;
  try{data=JSON.parse(text);}catch{throw Error('N8N_EXECUTION_ENVELOPE_INVALID');}
 }
 const execution=data?.execution;
 if(execution?.id!==String(executionId)||execution.workflowId!==workflowId||execution.mode!=='manual'||execution.status!=='success'||execution.retryOf||execution.retrySuccessId)throw Error('N8N_EXECUTION_NOT_ONE_SUCCESSFUL_MANUAL_ATTEMPT');
 const runs=data?.data?.resultData?.runData?.['One Haiku invocation'];
 if(!Array.isArray(runs)||runs.length!==1||runs[0].executionStatus!=='success')throw Error('NATIVE_MODEL_RUN_COUNT_UNKNOWN');
 const main=runs[0].data?.main;if(!Array.isArray(main)||main.length!==1||!Array.isArray(main[0])||main[0].length!==1)throw Error('NATIVE_MODEL_OUTPUT_COUNT_UNKNOWN');
 const result=main[0][0]?.json;
 if(result?.model!=='claude-haiku-5-5')throw Error('NATIVE_MODEL_RESPONSE_UNEXPECTED');
 const u=result.usage;
 if(!Number.isSafeInteger(u?.input_tokens)||u.input_tokens<0||!Number.isSafeInteger(u?.output_tokens)||u.output_tokens<0||(u.cache_creation_input_tokens??0)!==0||(u.cache_read_input_tokens??0)!==0)throw Error('NATIVE_MODEL_USAGE_UNVERIFIED');
 const textBlocks=Array.isArray(result.content)?result.content.filter(block=>block?.type==='text'):[];
 const contentValid=textBlocks.length>0&&result.content.every(block=>
  block?.type==='thinking'||block?.type==='redacted_thinking'||(block?.type==='text'&&typeof block.text==='string'));
 const error=result.stop_reason!=='end_turn'?'PROVIDER_STOP_REASON_'+String(result.stop_reason):!contentValid?'PROVIDER_CONTENT_UNEXPECTED':null;
 return {reservation_id:reservationId,execution_id:String(executionId),model:result.model,model_calls:1,text:contentValid?textBlocks.map(block=>block.text).join(''):'',stop_reason:result.stop_reason,...(error?{error}:{}),usage:{input_tokens:u.input_tokens,output_tokens:u.output_tokens,cache_creation_input_tokens:0,cache_read_input_tokens:0}};
}
