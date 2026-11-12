import {readFileSync} from 'node:fs';import {it,expect} from 'vitest';
import http from 'node:http';
import {parseSnapshot,object,records} from './dto';import {mapProject} from './briefModels';import {prelayoutReadScope} from './prelayoutReadback';import {HttpWorkbenchService} from './HttpWorkbenchService';import {HttpProposalService} from './HttpProposalService';
function fixture(state='queued'):Record<string,unknown>{return object(JSON.parse(readFileSync(new URL('../../../test-prelayout/'+state+'.json',import.meta.url),'utf8')));}
function parts(value:Record<string,unknown>){const p=object(value.project),j=records(p.jobs)[0],native=object(object(j.task).nativeRequest),commands=object(p.processedCommands),queue=Object.values(commands).map(v=>object(JSON.parse(String(v)))).find(c=>c.kind==='queue-proposal-prelayout');if(!queue)throw Error('Missing original queue command');const event=records(p.audit).find(a=>a.commandId===queue.commandId);if(!event)throw Error('Missing original queue audit');return {p,j,native,commands,queue,event};}
function changeBoth(value:Record<string,unknown>,revision:unknown):void{const {native,commands,queue}=parts(value);native.expectedRevision=revision;queue.nativeRequest=structuredClone(native);commands[String(queue.commandId)]=JSON.stringify(queue);}
it('correct queue pre-revision zero is tied to audit one, while later legitimate snapshot revisions remain readable',()=>{
  for(const state of ['queued','running','unknown','clear','stale','invalid']){const value=fixture(state),{native,event,p}=parts(value),before=JSON.stringify(value);expect(native.expectedRevision).toBe(0);expect(event.revision).toBe(1);expect(Number(p.revision)).toBeGreaterThanOrEqual(1);expect(()=>mapProject(parseSnapshot(value))).not.toThrow();expect(prelayoutReadScope(parseSnapshot(value)).records[0].physicalOriginalsVerified).toBe(false);expect(JSON.stringify(value)).toBe(before);}
});
it('independent million-revision counterexample rejects in both read scope and canonical map after queue body is changed too',()=>{
  const value=fixture(),{event,p}=parts(value);changeBoth(value,1_000_000);expect(event.revision).toBe(1);expect(p.revision).toBe(1);expect(()=>prelayoutReadScope(parseSnapshot(value))).toThrow();expect(()=>mapProject(parseSnapshot(value))).toThrow();
});
it('negative, fractional, wrong nearby, string and null queue revisions cannot match the actual audit witness',()=>{
  for(const revision of [-1,0.5,1,'0',null,Number.MAX_SAFE_INTEGER]){const value=fixture();changeBoth(value,revision);expect(()=>mapProject(parseSnapshot(value))).toThrow();}
});
it('job-only and command-only revision drift remain rejected by original-body equality',()=>{
  for(const side of ['job','command']){const value=fixture(),{native,queue,commands}=parts(value);if(side==='job')native.expectedRevision=1;else{object(queue.nativeRequest).expectedRevision=1;commands[String(queue.commandId)]=JSON.stringify(queue);}expect(()=>mapProject(parseSnapshot(value))).toThrow();}
});
it('backward/forward audit drift and queue audit beyond the response head cannot admit the original request',()=>{
  for(const eventRevision of [0,2,100]){const value=fixture('unknown'),{event}=parts(value);event.revision=eventRevision;expect(()=>mapProject(parseSnapshot(value))).toThrow();}
});
it('actual canonical GET and Proposal cold mapper preserve unknown/clear and reject the forged revision with zero writes',async()=>{
  for(const state of ['queued','unknown','clear'])for(const forged of [false,true]){
    const response=fixture(state),{p}=parts(response),before=JSON.stringify(response),methods:string[]=[];if(forged)changeBoth(response,1_000_000);
    const server=http.createServer((request,result)=>{methods.push(request.method??'GET');result.setHeader('Content-Type','application/json');result.end(JSON.stringify(request.url==='/capabilities'?{surface:'brief-v1',executionAvailable:false}:response));});
    await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
    try{const address=server.address();if(!address||typeof address==='string')throw Error('Missing local fixture port');const service=new HttpWorkbenchService({baseUrl:`http://127.0.0.1:${address.port}`}),pending=new HttpProposalService(service).getProposal(String(p.id));
      if(forged)await expect(pending).rejects.toMatchObject({kind:'validation'});else{const proposal=await pending;expect(proposal.prelayoutRecords?.[0].status).toBe(state==='unknown'?'awaiting_reconciliation':state==='clear'?'succeeded':'queued');expect(proposal.stages.layout.status).toBe('not_started');expect(JSON.stringify(response)).toBe(before);}expect(methods).toEqual(['GET','GET']);
    }finally{server.closeAllConnections();await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
  }
});
