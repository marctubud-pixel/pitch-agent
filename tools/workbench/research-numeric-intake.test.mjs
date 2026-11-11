import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,chmod,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createExecutor} from './executor.mjs';
import {numericFixture,hash} from './research-numeric-fixture.mjs';
import {TASK_FIELDS,cardHash,cardFields} from './intake-contract.mjs';
import {digest} from './intake-document-store.mjs';
import {human} from './research-operator-fixture.mjs';

test('actual local PDF extraction, explicit full TaskCardV1 confirmation and numerical production preserve all input identities',async t=>{
 const f=await numericFixture();t.after(f.close);
 const intakeProvider={model:'synthetic',execute:async request=>{
  const input=JSON.parse(request.prompt.slice(request.prompt.indexOf('\n')+1)),m=input.materials.find(m=>m.kind==='pdf');
  const fields=Object.fromEntries(TASK_FIELDS.map(k=>[k,{value:null,knowledge:'not_stated',sources:[],suggestions:[],limitations:[]}]));
  const stated=value=>({value,knowledge:'stated',sources:[{kind:'pdf_text',documentId:m.id,extractionHash:m.extractionHash,page:1,startUtf16:m.text.indexOf(value),endUtf16:m.text.indexOf(value)+value.length,quote:value}],suggestions:[],limitations:[]});
  for(const key of ['taskType','deliverables'])fields[key]=stated('Packaging');for(const key of ['initialProblem','objective'])fields[key]=stated('Explore blue packaging');fields.age=stated('25');
  const output={protocol:'task-card-extraction-v1',brief:'Explore the supplied blue packaging example, without audience claims.',fields,productParameters:[{name:'ABV',field:{value:null,knowledge:'not_stated',sources:[],suggestions:[],limitations:[]}}],openQuestions:['Purchaser and user remain unstated.'],limitations:['Synthetic PDF with blank page. No source authentication.']};
  return {runId:request.runId,requestedModel:'synthetic',threadId:'intake-'+request.runId,inputPacketHash:digest(JSON.stringify({runId:request.runId,model:'synthetic',prompt:request.prompt,outputSchema:request.outputSchema})),exitCode:0,responseText:JSON.stringify(output),parsedOutput:output,cost:null};
 }};
 const executor=createExecutor({store:f.store,rootDir:f.root,bindings:{...f.bindings,intake:{providerId:'intake',model:'synthetic',role:'intake-lead'}},providers:{...f.providers,intake:intakeProvider},imageProvider:null,intakeConfiguration:{pythonBinary:'/Users/marc/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3'}});
 const state=()=>f.store.read('p'),command=extra=>({commandId:crypto.randomUUID(),expectedRevision:state().revision,...extra});
 const bytes=await readFile(new URL('./fixtures/intake/mixed.pdf',import.meta.url)),upload=await executor.intake.upload('p',command({originalFilename:'synthetic.pdf'}),bytes);await executor.intake.execute('p',upload.jobId);assert.equal(state().jobs.at(-1).status,'succeeded',JSON.stringify(state().jobs.at(-1).error));
 let base=state().taskCards.at(-1);const extraction=await executor.intake.requestExtraction('p',command({documentIds:[upload.documentId],baseTaskCardId:base.id,baseTaskCardHash:cardHash(base)}));await executor.intake.execute('p',extraction.jobId);assert.equal(state().jobs.at(-1).status,'succeeded');
 const draft=state().intakeDrafts.at(-1);await executor.intake.humanAction('p','intake-adopt',command({draftId:draft.id,draftHash:digest(draft),baseTaskCardId:state().activeTaskCardId}),human);
 let card=state().taskCards.at(-1);await executor.intake.humanAction('p','intake-decide',command({taskCardId:card.id,taskCardHash:cardHash(card),decisions:cardFields(card).map(({pointer,field})=>({fieldPointer:pointer,action:field.value===null?'retain_unknown':'retain_stated',value:field.value,reason:'Explicit synthetic input decision.'}))}),human);
 card=state().taskCards.at(-1);await executor.intake.humanAction('p','intake-confirm',command({taskCardId:card.id,taskCardHash:cardHash(card),decisionSetHash:digest(card.decisions)}),human);
 const job=await executor.execute('p',executor.enqueue('p','research',{sourceRecords:[f.source]}));assert.equal(job.status,'succeeded',JSON.stringify(job.error));assert.deepEqual(job.task.researchDataBasis.taskCard,card);assert.equal(card.protocol,'task-card-v1');assert.equal(card.fields.age.value,'25');assert.equal(card.fields.purchaser.value,null);assert.equal(card.productParameters[0].field.value,null);assert.ok(card.inputDocumentRefs[0].rawHash);assert.equal(job.task.researchDataBasis.confirmations[0].taskCardHash,cardHash(card));
 const a=state().artifacts.at(-1),verification=await executor.execute('p',await executor.enqueueVerification('p',a.id));assert.equal(verification.status,'succeeded',JSON.stringify(verification.error));assert.deepEqual(verification.task.verificationInput.taskCard,card);
 const doc=state().intakeDocuments[0],file=join(f.root,'intake','objects',doc.raw.sha256);await chmod(file,0o600);await writeFile(file,Buffer.alloc(bytes.length));const before=f.calls.length;
 const blocked=await executor.execute('p',executor.enqueue('p','research',{sourceRecords:[f.source]}));assert.equal(blocked.status,'blocked');assert.equal(blocked.error.code,'DOCUMENT_CORRUPT');assert.equal(f.calls.length,before);
});
