const mutations=new Set(['create_cart','update_cart','cancel_cart']);
export async function trackRawRequest({registry,session,body,request}){
 const name=body?.params?.name||body?.name,tracked=registry&&mutations.has(name);
 if(tracked)await registry.before(session,name);
 try{
  const response=await request();if(tracked){let result=response.body?.result?.structuredContent;if(!result&&response.body?.result?.content?.[0]?.text){try{result=JSON.parse(response.body.result.content[0].text);}catch{}}const error=result?.error,protocol=response.body?.error;const ambiguous=response.status>=500||result?.ambiguous===true||(!!error&&!['INVALID_INPUT','UNAUTHORIZED','INVALID_SESSION','RATE_LIMITED'].includes(error))||(!!protocol&&!['INVALID_INPUT','UNAUTHORIZED','INVALID_SESSION','RATE_LIMITED'].includes(protocol)&&![-32600,-32601,-32602].includes(protocol.code));await registry.after(session,name,{ambiguous});if(ambiguous)await registry.markCaseUnknown(session);}
  return response;
 }catch(e){if(tracked){const knownRejected=e.code==='RATE_LIMITED'||e.suspension?.reason==='PROVIDER_RATE_LIMITED';await registry.after(session,name,{ambiguous:!knownRejected});if(!knownRejected)await registry.markCaseUnknown(session);}throw e;}
}
