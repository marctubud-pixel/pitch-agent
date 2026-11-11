import {diskReceipt} from './selected-stage-fixture.mjs';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {openStore} from './store.mjs';
import {createExecutor} from './executor.mjs';
import {buildResearchReadinessRequest} from './research-readiness.mjs';
const hash = text => createHash('sha256').update(text).digest('hex');
const source = {id: 's1', url: 'https://example.test/blue', text: 'Synthetic blue package.', scopeRelation: 'background', verification: 'captured'};
const production = {outputKind: 'research_findings', status: 'draft', title: 'Synthetic research', summary: 'Only a packaging excerpt.', sections: [{heading: 'Case', body: source.text, evidenceIds: ['s1']}], claims: [{text: 'Supplied excerpt describes a blue package.', kind: 'fact', evidenceRefs: ['s1'], limitations: ['Supplied excerpt only.']}], gaps: ['Missing audience research.'], evidenceClassifications: [{sourceId: 's1', scopeRelation: 'background', reason: 'A bounded example.'}]};
const bindings = {research: {providerId: 'author', model: 'synthetic', role: 'research-lead'}, readiness: {providerId: 'reviewer', model: 'synthetic', role: 'readiness-reviewer'}};
function needsResearch(input) {
  const {packet, outputSchema} = buildResearchReadinessRequest(input);
  return {...Object.fromEntries(Object.entries(outputSchema.properties).filter(([, value]) => value.enum).map(([key, value]) => [key, value.enum[0]])), verdict: 'needs_research',
    coverage: packet.expectedCoverage.map(item => ({questionId: item.id, status: 'gap', rationale: 'One excerpt cannot establish coverage.', refs: [{location: '/taskCard/brief', quote: input.taskCard.brief}], downstreamImpact: 'Strategy remains unsupported.', researchNeeded: 'Research users and use cases.'})),
    sourceAssessments: [{sourceId: source.id, textHash: hash(source.text), use: 'usable_with_limits', relevance: 'Packaging example.', provenance: 'Supplied excerpt.', limitations: ['Not authenticated.'], refs: [{location: '/sourceRecords/0/text', quote: source.text}]}], findings: [], downstreamUse: {allowed: ['Plan further research.'], prohibited: ['Do not infer audience preference.']}, limitations: ['Synthetic fixture, no real research.']};
}

const human={actorId:'development-simulation-human',actorType:'human',runId:'simulation-human-run',contextId:'simulation-human-context'};
export async function fixture(t,{saved=false,receiptOutcome={},initialVerdict='needs_research',remoteTimeout=false}={}){
 const root=await mkdtemp(join(tmpdir(),'readiness-resolution-test-')),db=join(root,'db');let store=openStore(db),calls=0,mode=remoteTimeout?'uncertain':'local_commit_failure',verdict=initialVerdict;

 const config={rootDir:root,bindings:{...bindings,readiness_alternate:{providerId:'alternate',model:'alternate-model',role:'readiness-reviewer'}},providers:{author:{model:'synthetic',execute:async request=>{const parsedOutput={...production,researchContractVersion:'research-data-v2',chartData:null,quantitativeClaims:[]},responseText=JSON.stringify(parsedOutput);return diskReceipt(root,request,{runId:request.runId,model:'synthetic',requestedModel:'synthetic',threadId:'author-thread',inputPacketHash:hash(JSON.stringify({runId:request.runId,model:'synthetic',prompt:request.prompt,outputSchema:request.outputSchema})),exitCode:0,responseText,parsedOutput,cost:null});}}}};
 const review=model=>({model,execute:async request=>{
  calls++;const job=store.read('p').jobs.find(j=>j.attempts.some(a=>a.id===request.runId)),input=job.task.readinessInput;
  const refs=[{location:'/content/sections/0/body',quote:source.text}];
  const output={...needsResearch(input),generationHash:request.packet.applicability.generationHash,obligationAssessments:request.packet.applicability.origins.map(o=>({originKey:o.key,preservation:{state:'retained',reason:'Original limitation retained.',refs},procurement:{kind:'required_now',state:'missing',material:'Audience evidence.',reason:'Present task still incomplete.',refs,decisionDependency:'Bounded strategy.'},requirementRefs:[{location:'/taskCard/brief',quote:input.taskCard.brief}],replacement:{originKeys:[],reason:'none',refs:[]},reason:'Synthetic test.'})),useScan:{contentHash:input.contentHash,assessedOriginKeys:[],findings:[]}};
  if(verdict==='ready'){output.verdict='ready';output.coverage=output.coverage.map(c=>({...c,status:'ready',researchNeeded:'none',refs:[{location:'/content/sections/0/body',quote:source.text}]}));}
  const raw=JSON.stringify(output),inputText=JSON.stringify({runId:request.runId,model,prompt:request.prompt,outputSchema:request.outputSchema});
  const folder=join(root,'provider',request.runId);await mkdir(folder,{recursive:true});const paths=Object.fromEntries(['input','receipt','stdout','output','schema'].map(k=>[k,join(folder,k+'.json')]));
  const disk={provider:'codex-cli',runId:request.runId,requestedModel:model,model,providerRequestId:'thread-'+request.runId,threadId:'thread-'+request.runId,inputPacketHash:hash(inputText),exitCode:mode==='uncertain'?null:0,signal:mode==='uncertain'?'SIGKILL':null,reason:mode==='uncertain'?'timeout':null,usage:null,cost:null,...receiptOutcome,paths};
  await writeFile(paths.schema,JSON.stringify(request.outputSchema));await writeFile(paths.input,inputText);await writeFile(paths.receipt,JSON.stringify(disk,null,2));await writeFile(paths.stdout,JSON.stringify({type:'thread.started',thread_id:disk.threadId})+'\n'+JSON.stringify({type:'turn.started'})+'\n');
  if(saved||mode==='success')await completeFiles(disk,raw);
  if(mode==='local_commit_failure')throw Object.assign(new Error('Synthetic terminal return loss after saved successful provider response'),{code:'SYNTHETIC_RETURN_LOSS',status:'awaiting_reconciliation',receipt:{...disk,responseText:raw,parsedOutput:output}});
  if(mode!=='uncertain'&&disk.exitCode===0&&['signal','reason','error'].every(k=>disk[k]==null))return {...disk,responseText:raw,parsedOutput:output};
  throw Object.assign(new Error('Synthetic uncertain call'),{code:'INVOCATION_UNCERTAIN',status:'awaiting_reconciliation',receipt:disk});
 }});
 config.providers.reviewer=review('synthetic');config.providers.alternate=review('alternate-model');
 store.create({id:'p',name:'Development simulation only',brief:'Research packaging users and use cases.',mode:'auto',humanGates:['research']},human);
 store.command('p',{kind:'confirm-task-card',taskCardId:'p:scope:1',commandId:'confirm',expectedRevision:0},human);
 let executor=createExecutor({store,...config});const produced=await executor.execute('p',executor.enqueue('p','research',{sourceRecords:[source]}));assert.equal(produced.status,'succeeded');
 const artifact=store.read('p').artifacts[0],id=await executor.enqueueReadiness('p',artifact.id,{commandId:'original-request',expectedRevision:store.read('p').revision,protocolVersion:'research-readiness-v2'});assert.equal((await executor.execute('p',id)).status,'awaiting_reconciliation');
 t.after(async()=>{store.close();console.log(JSON.stringify({retainedRoot:root,calls}));});
 return {root,artifact,get store(){return store;},get executor(){return executor;},get calls(){return calls;},reopen(){store.close();store=openStore(db);executor=createExecutor({store,...config});},origin(){return store.read('p').jobs.find(j=>j.id===id);},async request(){const job=this.origin();return {action:'recover-saved',jobId:id,attemptId:job.attempts[0].id,commandId:'recover-saved-'+store.read('p').revision,expectedRevision:store.read('p').revision};}};
}
async function completeFiles(receipt,raw){await writeFile(receipt.paths.output,raw);await writeFile(receipt.paths.stdout,[{type:'thread.started',thread_id:receipt.threadId},{type:'turn.started'},{type:'item.completed',item:{id:'result',type:'agent_message',text:raw}},{type:'turn.completed',usage:{input_tokens:10,output_tokens:10}}].map(x=>JSON.stringify(x)).join('\n')+'\n');}

