import {ASSISTANT_PROTOCOL} from './assistant-runtime.mjs';
export async function handleAssistantHttp({req,res,url,assistant,jsonBody,response}){
 if(!url.pathname.startsWith('/api/v1/assistant/'))return false;
 try{
  const options=Object.fromEntries(url.searchParams);
  if([...url.searchParams].length!==Object.keys(options).length)throw Object.assign(Error('Duplicate query'),{code:'ASSISTANT_INVALID_REQUEST',status:400});
  const path=url.pathname.slice('/api/v1/assistant/'.length);
  let result,status=200;
  if(url.search&&!(req.method==='GET'&&/\/(conversation|history)$/.test(path)))throw Object.assign(Error('Unexpected query'),{code:'ASSISTANT_INVALID_REQUEST',status:400});
  if(req.method==='GET'&&path==='capabilities')result=assistant.capability();
  else if(req.method==='GET'&&path==='schema')result=assistant.schema();
  else if(req.method==='GET'){
   const m=/^(general|draft|projects\/([A-Za-z0-9][A-Za-z0-9_.:-]{0,159}))\/(conversation|suggestions|history)$/.exec(path);
   if(!m)throw Object.assign(Error('Assistant route not found'),{code:'ASSISTANT_NOT_FOUND',status:404});
   const scope=m[2]?{kind:'project',projectId:m[2]}:{kind:m[1]};result=m[3]==='conversation'?await assistant.conversation(scope,options):m[3]==='history'?assistant.history(scope,options):assistant.suggestions(scope);
  }else if(req.method==='POST'&&['questions','conversations','reconciliations'].includes(path)){
   const body=await jsonBody(req,32768);
   result=path==='questions'?await assistant.ask(body):path==='conversations'?assistant.clear(body):await assistant.reconcile(body);
   if(result.state==='unknown'||result.state==='reserved')status=202;
   else if(result.state==='unavailable')status=503;
   else if(result.state==='rejected')status=422;
   else if(result.state==='failed')status=502;
  }else throw Object.assign(Error('Assistant route not found'),{code:'ASSISTANT_NOT_FOUND',status:404});
  response(res,status,{protocol:ASSISTANT_PROTOCOL,...result});
 }catch(e){const status=Number.isInteger(e.status)&&e.status>=400&&e.status<=599?e.status:503;response(res,status,{protocol:ASSISTANT_PROTOCOL,error:{code:status===503&&!e.code?.startsWith('ASSISTANT_')?'ASSISTANT_STORAGE_UNAVAILABLE':e.code??'ASSISTANT_UNAVAILABLE',message:status===503?'Assistant infrastructure is unavailable. No automatic model repeat is performed.':e.code??'Assistant request refused',retryable:status===503}});}
 return true;
}
