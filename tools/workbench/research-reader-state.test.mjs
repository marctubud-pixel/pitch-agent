import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createProject,applyCommand,researchQuestionRegistration,researchReaderTarget} from './project.mjs';
import {researchMethodIdentity} from './research-method.mjs';
import {researchReaderCoverage,researchReaderReport,validateStoredResearchReader} from './research-reader-state.mjs';
import {researchDataBasis,RESEARCH_DATA_VERSION} from './research-chart-data.mjs';
import {semanticHash} from './semantic-authority.mjs';
import {buildResearchReaderPacket,projectResearchReaderReport,buildResearchReaderRequest,RESEARCH_READER_PROTOCOL} from './research-reader-loop.mjs';
const hash=s=>createHash('sha256').update(s).digest('hex');
const human={actorType:'human',actorId:'test-human',runId:'human-run',contextId:'human-context'};
const director={actorType:'agent',actorId:'director',runId:'director-run',contextId:'director-context'};
const author={actorType:'agent',actorId:'author',runId:'author-run',contextId:'author-context'};
const reader={actorType:'agent',actorId:'reader',runId:'reader-run',contextId:'reader-context'};
const command=(p,c,ctx=director)=>applyCommand(p,{commandId:`c${p.revision}`,expectedRevision:p.revision,...c},ctx);
function scope(readerCount=1){let p=createProject({id:'p',name:'Test only',brief:'包装识别研究',workflowVersion:'proposal-seven-v1',mode:'auto'},human);p=command(p,{kind:'confirm-task-card',taskCardId:p.activeTaskCardId},human);return command(p,{kind:'register-research-questions',registrationId:'qplan',taskCardId:p.activeTaskCardId,method:researchMethodIdentity(),questions:[{id:'q1',question:'如何理解识别条件？',critical:true}],readerCount});}
function queued(readerCount=1){
 let p=scope(readerCount),r=researchQuestionRegistration(p);const binding={providerId:'synthetic',model:'synthetic',role:'research'};
 p=command(p,{kind:'request-stage',stage:'research',jobId:'producer',binding,task:{id:'producer',owner:'research',parentId:'p',researchContractVersion:RESEARCH_DATA_VERSION,researchDataBasis:researchDataBasis({taskCard:p.taskCards[0],confirmations:p.confirmations,sourceRecords:[]}),researchMethod:r.method,researchQuestionRegistration:r,researchQuestionRegistrationId:r.id,researchQuestionRegistrationHash:r.registrationHash}});
 // Pure reducer fixture: existing executed artifact metadata, not a provider/quality claim.
 p=structuredClone(p);const contentText=JSON.stringify({title:'研究',sections:[{heading:'人群',body:'选择行为尚未确认。'}],gaps:['实际偏好未知。']});
 const a={id:'a1',stage:'research',payloadRef:'/not-read-in-pure-test/output.json',contentHash:hash(contentText),inputVersionIds:[p.activeTaskCardId],claims:[],author,provenance:'provider_execution',technicalReceipts:{sourceCatalogue:{version:1,records:[]},visualCatalogue:[]}};
 p.artifacts.push(a);p.activeByStage.research=a.id;p.jobs[0].status='succeeded';p.jobs[0].outputVersionIds=[a.id];
 const packet=buildResearchReaderPacket({taskCard:{id:p.activeTaskCardId,purpose:p.taskCards[0].brief},artifactId:a.id,contentHash:a.contentHash,contentText,method:r.method,questionRegistration:{id:r.id,taskCardId:r.taskCardId,questions:r.questions},visibleReport:projectResearchReaderReport(contentText),phase:'first_read',previous:null});
 p=command(p,{kind:'request-research-reader',artifactId:a.id,registrationId:r.id,seat:0,jobId:'reader-job',binding:{providerId:'synthetic',model:'synthetic',role:'reader'},task:{id:'reader-job',owner:'reader',parentId:'p',readerContentText:contentText,readerInput:packet,request:{artifactId:a.id,registrationId:r.id,seat:0}}});return p;
}
function result(p,jobId='reader-job',change=()=>{}){const job=p.jobs.find(j=>j.id===jobId),packet=job.task.readerInput,loc={location:'/sections/0/body',quote:'选择行为尚未确认'};
 const raw={protocolVersion:RESEARCH_READER_PROTOCOL,packetHash:packet.packetHash,phase:packet.phase,retellings:['market','audience','competition','product','carrier','synthesis'].map(dimension=>({dimension,understanding:'具体行为未知。',classification:'unknown',locations:[loc]})),answers:[{questionId:'q1',status:'unresolved',answer:'实际理解仍缺证。',locations:[loc]}],connections:[{dimensions:['market','audience'],explanation:'市场不说明人群。',strategyConstraint:'不能预选风格。',limitations:'人群未核。',locations:[loc]}],issues:[],rechecks:[],limitations:['合成纯状态测试，非真实读者。']};
 change(raw);
 const request=buildResearchReaderRequest(packet),attempt=job.attempts.at(-1),file=`/synthetic/${jobId}/reader.json`,normalized=JSON.stringify(raw,null,2);
 return {rawReport:raw,payloadRef:file,contentHash:hash(normalized),executionReceipt:{provider:'codex-cli',providerId:'synthetic',model:'synthetic',requestedModel:'synthetic',role:'reader',taskId:job.task.id,attemptId:attempt.id,runId:attempt.id,threadId:`synthetic-reader-thread:${attempt.id}`,exitCode:0,inputPacketHash:hash(JSON.stringify({runId:attempt.id,model:'synthetic',prompt:request.prompt,outputSchema:request.outputSchema})),responseText:JSON.stringify(raw),validatedOutputPath:file,validatedOutputHash:hash(normalized)}};
}
test('preregister exact full card and preserve question identity',()=>{const p=scope(),r=researchQuestionRegistration(p);assert.equal(r.taskCardHash,semanticHash(p.taskCards[0]));assert.equal(r.registeredRevision,p.revision);assert.throws(()=>command(p,{kind:'register-research-questions',registrationId:r.id,taskCardId:r.taskCardId,method:r.method,questions:r.questions,readerCount:1}));});
test('current reader job rejects changed card, producer registration and creator self review',()=>{const p=queued(),j=p.jobs[1];assert.equal(researchReaderTarget(p,j).id,'a1');const changed=structuredClone(p);changed.taskCards[0].brief='改卡';assert.throws(()=>researchReaderTarget(changed,changed.jobs[1]));const missing=structuredClone(p);delete missing.jobs[0].task.researchQuestionRegistration;assert.throws(()=>researchReaderTarget(missing,missing.jobs[1]));assert.throws(()=>command(p,{kind:'start-job',jobId:j.id,attemptId:'self'},author),/lineage/);});
test('reader requires one dispatch and exact native reply before persisting a blocked understanding report',()=>{let p=queued();p=command(p,{kind:'start-job',jobId:'reader-job',attemptId:'reader-run'},reader);const c={kind:'complete-research-reader',jobId:'reader-job',attemptId:'reader-run',reportId:'report-1',...result(p)};assert.throws(()=>command(p,c,reader),/dispatch/);p=command(p,{kind:'mark-research-reader-dispatched',jobId:'reader-job',attemptId:'reader-run'},reader);assert.throws(()=>command(p,{...c,rawReport:{...c.rawReport,limitations:['changed reply']}},reader),/original provider/);p=command(p,c,reader);assert.equal(p.researchReaderReports[0].eligibility.understandingComplete,false);assert.equal(p.jobs[1].status,'succeeded');assert.throws(()=>command(p,{kind:'retry-job',jobId:'reader-job',attemptId:'retry'},reader));});

test('reader recovery uses the exact saved call, adds only normalized wrapper fields and never retries',()=>{
 let p=queued();p=command(p,{kind:'start-job',jobId:'reader-job',attemptId:'reader-run'},reader);
 p=command(p,{kind:'mark-research-reader-dispatched',jobId:'reader-job',attemptId:'reader-run'},reader);
 const value=result(p),saved={...value.executionReceipt};delete saved.validatedOutputPath;delete saved.validatedOutputHash;
 p=command(p,{kind:'finish-job-error',jobId:'reader-job',attemptId:'reader-run',status:'awaiting_reconciliation',dispatchStarted:true,error:{code:'LOST_RESPONSE',message:'Synthetic unknown'},receipt:saved},reader);
 assert.throws(()=>command(p,{kind:'retry-job',jobId:'reader-job',attemptId:'new-call'},reader));
 const c={kind:'recover-research-reader',jobId:'reader-job',attemptId:'reader-run',reportId:'recovered',...value};
 assert.throws(()=>command(p,{...c,executionReceipt:{...value.executionReceipt,responseText:'{}'}},reader),/exact saved/);
 p=command(p,c,reader);assert.equal(p.jobs[1].attempts.length,1);assert.equal(p.researchReaderReports[0].attemptId,'reader-run');assert.equal(p.jobs[1].status,'succeeded');
});
test('human declaration cannot create a reader model report',()=>{
 let p=queued();p=command(p,{kind:'start-job',jobId:'reader-job',attemptId:'reader-run'},reader);p=command(p,{kind:'mark-research-reader-dispatched',jobId:'reader-job',attemptId:'reader-run'},reader);
 assert.throws(()=>command(p,{kind:'complete-research-reader',jobId:'reader-job',attemptId:'reader-run',reportId:'fake-human',...result(p)},{...reader,actorType:'human'}),/internal runtime/);
});
test('reader rejects registration made at or after producer request revision',()=>{
 const p=structuredClone(queued());p.researchQuestionRegistrations[0].registeredRevision=999;p.jobs[0].task.researchQuestionRegistration=p.researchQuestionRegistrations[0];
 assert.throws(()=>researchReaderTarget(p,p.jobs[1]),/precede research/);
});

test('packet hashes cannot hide altered or incomplete source projection',()=>{
 const p=structuredClone(queued()),job=p.jobs[1];job.task.readerInput.visibleReport.blocks=job.task.readerInput.visibleReport.blocks.filter(b=>b.location==='/title');const {packetHash,...body}=job.task.readerInput;job.task.readerInput.packetHash=semanticHash(body);
 assert.throws(()=>researchReaderTarget(p,job),/actual source bytes/);
});
test('two preregistered reader seats require different independent executor contexts',()=>{
 let p=queued(2);const first=p.jobs[1];p=command(p,{kind:'request-research-reader',artifactId:'a1',registrationId:'qplan',seat:1,jobId:'reader-2',binding:first.binding,task:{...first.task,id:'reader-2',request:{...first.task.request,seat:1}}});
 p=command(p,{kind:'start-job',jobId:'reader-job',attemptId:'reader-run'},reader);
 assert.throws(()=>command(p,{kind:'start-job',jobId:'reader-2',attemptId:'reader-2-attempt'},reader),/reader context/);
 p=command(p,{kind:'start-job',jobId:'reader-2',attemptId:'reader-2-attempt'},{actorType:'agent',actorId:'second-reader',runId:'second-run',contextId:'second-context'});
 assert.equal(p.jobs[2].status,'running');
});

function reviewed(){let p=queued();p=command(p,{kind:'start-job',jobId:'reader-job',attemptId:'reader-run'},reader);p=command(p,{kind:'mark-research-reader-dispatched',jobId:'reader-job',attemptId:'reader-run'},reader);return command(p,{kind:'complete-research-reader',jobId:'reader-job',attemptId:'reader-run',reportId:'old-report',...result(p,'reader-job',r=>r.issues.push({id:'i1',type:'understanding',severity:'major',questionIds:['q1'],detail:'误把未知理解成事实。',locations:[{location:'/sections/0/body',quote:'选择行为尚未确认'}]}))},reader);}
function revised(){
 let p=reviewed();const r=researchQuestionRegistration(p),producer=p.jobs[0];p=command(p,{kind:'request-stage',stage:'research',jobId:'producer-2',binding:producer.binding,task:{...producer.task,id:'producer-2'}});
 p=structuredClone(p);const old=p.artifacts[0],text=JSON.stringify({title:'研究修订',sections:[{heading:'人群',body:'选择行为尚未确认。必须核对真实寻找。'}],gaps:['实际偏好未知。']});
 p.artifacts.push({...old,id:'a2',contentHash:hash(text),revision:{revisionOf:{artifactId:old.id,contentHash:old.contentHash}}});p.activeByStage.research='a2';const j=p.jobs.find(j=>j.id==='producer-2');j.status='succeeded';j.outputVersionIds=['a2'];return {p,text,r};
}
function recheckQueued(){let {p,text,r}=revised();const old=researchReaderReport(p,'old-report'),dispositions=[{issueId:'i1',action:'clarified',response:'已写清未知。',locations:[{location:'/sections/0/body',quote:'必须核对真实寻找'}]}];
 p=command(p,{kind:'record-research-reader-dispositions',artifactId:'a2',previousReportId:'old-report',dispositionId:'disp-1',dispositions});
 const packet=buildResearchReaderPacket({taskCard:{id:p.activeTaskCardId,purpose:p.taskCards[0].brief},artifactId:'a2',contentHash:hash(text),contentText:text,method:r.method,questionRegistration:{id:r.id,taskCardId:r.taskCardId,questions:r.questions},visibleReport:projectResearchReaderReport(text),phase:'recheck',previous:{packet:old.packet,rawReport:old.report.rawReport,dispositions}});
 return command(p,{kind:'request-research-reader',artifactId:'a2',registrationId:r.id,seat:0,jobId:'recheck-job',binding:p.jobs[1].binding,task:{id:'recheck-job',owner:'reader',parentId:'p',readerContentText:text,readerInput:packet,readerPreviousReportId:'old-report',readerDispositionId:'disp-1',request:{artifactId:'a2',registrationId:r.id,seat:0,previousReportId:'old-report',dispositionId:'disp-1'}}});
}
const second={actorType:'agent',actorId:'new-reader',runId:'new-reader-run',contextId:'new-reader-context'};
test('recheck binds actual revision, original report and exact located dispositions',()=>{let p=recheckQueued();assert.equal(p.researchReaderDispositions[0].previousReportHash,p.researchReaderReports[0].reportHash);assert.equal(researchReaderTarget(p,p.jobs.at(-1)).id,'a2');const changed=structuredClone(p);changed.researchReaderDispositions[0].dispositions[0].response='not registered';assert.throws(()=>researchReaderTarget(changed,changed.jobs.at(-1)),/disposition binding/);p=command(p,{kind:'start-job',jobId:'recheck-job',attemptId:'new-reader-run'},second);p=command(p,{kind:'mark-research-reader-dispatched',jobId:'recheck-job',attemptId:'new-reader-run'},second);p=command(p,{kind:'complete-research-reader',jobId:'recheck-job',attemptId:'new-reader-run',reportId:'new-report',...result(p,'recheck-job',r=>{r.answers[0].status='answered';r.rechecks=[{issueId:'i1',status:'resolved',explanation:'已读实际修订正文。',locations:[{location:'/sections/0/body',quote:'必须核对真实寻找'}]}];})},second);assert.equal(p.researchReaderReports.at(-1).eligibility.understandingComplete,true);assert.equal(validateStoredResearchReader(p,p.researchReaderReports.at(-1),{current:true}).report.id,'new-report');});
test('old negative review cannot be bypassed with another first read or unrelated artifact',()=>{const {p,text,r}=revised(),a=p.artifacts.at(-1),packet=buildResearchReaderPacket({taskCard:{id:p.activeTaskCardId,purpose:p.taskCards[0].brief},artifactId:a.id,contentHash:a.contentHash,contentText:text,method:r.method,questionRegistration:{id:r.id,taskCardId:r.taskCardId,questions:r.questions},visibleReport:projectResearchReaderReport(text),phase:'first_read',previous:null});assert.throws(()=>command(p,{kind:'request-research-reader',artifactId:a.id,registrationId:r.id,seat:0,jobId:'bypass',binding:p.jobs[1].binding,task:{id:'bypass',owner:'reader',parentId:'p',readerContentText:text,readerInput:packet}}),/cannot be hidden/);const changed=structuredClone(p);delete changed.artifacts.at(-1).revision;assert.throws(()=>command(changed,{kind:'record-research-reader-dispositions',artifactId:'a2',previousReportId:'old-report',dispositionId:'d',dispositions:[]}),/ancestry/);});
test('unresolved rechecks must carry original issues instead of dropping them',()=>{let p=recheckQueued();p=command(p,{kind:'start-job',jobId:'recheck-job',attemptId:'new-reader-run'},second);p=command(p,{kind:'mark-research-reader-dispatched',jobId:'recheck-job',attemptId:'new-reader-run'},second);const c={kind:'complete-research-reader',jobId:'recheck-job',attemptId:'new-reader-run',reportId:'still-unresolved',...result(p,'recheck-job',r=>r.rechecks=[{issueId:'i1',status:'unresolved',explanation:'仍然误解。',locations:[{location:'/sections/0/body',quote:'选择行为尚未确认'}]}])};assert.throws(()=>command(p,c,second),/must remain/);});
test('current fixed method changes cannot reuse an old plan or alter historical raw reports',()=>{const p=reviewed();assert.equal(validateStoredResearchReader(p,p.researchReaderReports[0],{current:true}).report.id,'old-report');const changed=structuredClone(p),r=changed.researchQuestionRegistrations[0];r.method.sha256='b'.repeat(64);r.registrationHash=semanticHash(Object.fromEntries(['id','taskCardId','taskCardHash','method','questions','readerCount'].map(k=>[k,r[k]])));assert.throws(()=>researchQuestionRegistration(changed),/older fixed method/);const bad=structuredClone(p);bad.researchReaderReports[0].retellings[0].understanding='改了展示结论';assert.throws(()=>researchReaderReport(bad,'old-report'),/projected report/);});

test('all planned seats must have current reports and unknown work blocks coverage',()=>{let p=queued(2);assert.equal(researchReaderCoverage(p).understandingComplete,false);p=command(p,{kind:'start-job',jobId:'reader-job',attemptId:'reader-run'},reader);p=command(p,{kind:'mark-research-reader-dispatched',jobId:'reader-job',attemptId:'reader-run'},reader);p=command(p,{kind:'complete-research-reader',jobId:'reader-job',attemptId:'reader-run',reportId:'seat-0',...result(p,'reader-job',r=>r.answers[0].status='answered')},reader);assert.deepEqual(researchReaderCoverage(p).seats.map(s=>s.status),['understood','needs_reading']);assert.equal(researchReaderCoverage(p).understandingComplete,false);const unknown=structuredClone(p);unknown.jobs.push({...unknown.jobs[1],id:'unknown-old',status:'awaiting_reconciliation'});assert.equal(researchReaderCoverage(unknown).seats[0].status,'unsettled');});
