import {readFileSync} from 'node:fs';
import {it,expect} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {parseSnapshot,object,records} from './dto';
import {mapProject} from './briefModels';
import {prelayoutReadScope} from './prelayoutReadback';
import {HttpWorkbenchService} from './HttpWorkbenchService';
import {HttpProposalService} from './HttpProposalService';
import {PrelayoutHistory} from '../../views/project/PrelayoutHistory';
import {I18nProvider} from '../../i18n';
import {ServiceProvider} from '../../app/services';
import {createServices} from '../index';
import {sha256} from './sha256';
function fixture(state='queued'):Record<string,unknown>{return object(JSON.parse(readFileSync(new URL('../../../test-prelayout/'+state+'.json',import.meta.url),'utf8')));}
const raw=(value:Record<string,unknown>)=>object(value.project);
const job=(value:Record<string,unknown>)=>records(raw(value).jobs)[0];
function command(value:Record<string,unknown>,kind:string):Record<string,unknown>{return Object.values(object(raw(value).processedCommands)).map(v=>object(JSON.parse(String(v)))).find(c=>c.kind===kind)??{};}
function saveCommand(value:Record<string,unknown>,c:Record<string,unknown>):void{object(raw(value).processedCommands)[String(c.commandId)]=JSON.stringify(c);}
const stateCases=[['queued','queued'],['running','running'],['unknown','awaiting_reconciliation'],['clear','succeeded'],['stale','succeeded_stale'],['invalid','succeeded']];
for(const [state,status] of stateCases)it('purpose-limited native metadata cold parse/map retains '+state+' without IO qualification',()=>{
  const response=fixture(state),before=JSON.stringify(response),snapshot=parseSnapshot(response),scope=prelayoutReadScope(snapshot),record=scope.records[0];
  expect(()=>mapProject(snapshot)).not.toThrow();expect(scope.jobs.size).toBe(1);expect(record.status).toBe(status);
  expect(scope.artifacts.size).toBe(state==='queued'||state==='running'||state==='unknown'?4:5);
  expect(record.physicalOriginalsVerified).toBe(false);expect(record.executionEligible).toBe(false);expect(record.humanApproval).toBe(false);expect(record.finalReviewApproval).toBe(false);
  expect(JSON.stringify(response)).toBe(before);if(state==='unknown')expect(record.attempt?.status).toBe('awaiting_reconciliation');if(state==='stale'&&record.kind==='reported')expect(record.report.status).toBe('stale');if(state==='invalid'&&record.kind==='reported')expect(record.report.status).toBe('invalid_report');
});
it('canonical GET through actual HttpWorkbench parseSnapshot and HttpProposal mapProject performs zero writes',async()=>{
  const response=fixture('unknown'),p=raw(response),calls:Array<{method:string;url:string}>=[];
  const workbench=new HttpWorkbenchService({baseUrl:'http://transport.invalid',fetchImpl:async(input,init)=>{const url=String(input),method=init?.method??'GET';calls.push({method,url});if(url.endsWith('/capabilities'))return Response.json({surface:'brief-v1',executionAvailable:false});return Response.json(response);}});
  const proposal=await new HttpProposalService(workbench).getProposal(String(p.id));
  expect(proposal.prelayoutRecords?.[0].status).toBe('awaiting_reconciliation');expect(proposal.stages.layout.status).toBe('not_started');expect(proposal.decisions).toEqual([]);expect(calls.length).toBe(2);expect(calls.every(c=>c.method==='GET')).toBe(true);
});
it('a real changed task-card container leaves the original job state untouched and marks historical inputs',()=>{
  const response=fixture('clear'),p=raw(response),cards=records(p.taskCards),old=cards[0],envelope=object(JSON.parse(String(old.brief))),fields=object(envelope.fields);fields.background=String(fields.background)+' Changed transport-only task.';const next={...old,id:String(old.id)+'-next',brief:JSON.stringify(envelope)};p.taskCards=[...cards,next];p.activeTaskCardId=next.id;
  const before=JSON.stringify(p),snapshot=parseSnapshot(response),record=prelayoutReadScope(snapshot).records[0];expect(record.relation).toBe('historical_inputs');expect(record.status).toBe('succeeded');expect(()=>mapProject(snapshot)).not.toThrow();expect(JSON.stringify(p)).toBe(before);
});
it('foreign project, source text, task, tuple, method and report association tampering reject',()=>{
  const changes:Array<(v:Record<string,unknown>)=>void>=[v=>{raw(v).id='foreign';},v=>{job(v).stage='content_review';},v=>{object(object(job(v).task).prelayoutInput).sourceTupleHash='0'.repeat(64);},v=>{object(object(object(job(v).task).prelayoutInput).originals).research={originalText:'foreign'};},v=>{object(object(object(job(v).task).prelayoutInput).directorMethod).originalText='wrong';},v=>{records(raw(v).artifacts).find(a=>a.stage==='layout')!.contentHash='0'.repeat(64);}];
  for(const mutate of changes){const value=fixture('clear');mutate(value);expect(()=>mapProject(parseSnapshot(value))).toThrow();}
});
it('unknown request-hash changes reject after original claim command is updated as well',()=>{
  const value=fixture('unknown'),j=job(value),attempt=records(j.attempts)[0],claim=command(value,'claim-proposal-prelayout');attempt.requestHash='0'.repeat(64);claim.requestHash=attempt.requestHash;saveCommand(value,claim);expect(()=>mapProject(parseSnapshot(value))).toThrow();
});
it('same actor IDs cannot borrow claim by changing actual now; receipt runtime/input hashes cannot change',()=>{
  for(const mode of ['owner-now','runtime','input']){const value=fixture('clear'),attempt=records(job(value).attempts)[0];if(mode==='owner-now')object(attempt.executor).now='2026-11-12T01:00:00.000Z';else{const receipt=object(attempt.receipt),name=mode==='runtime'?'runtimePacketHash':'inputPacketHash';receipt[name]='0'.repeat(64);object(receipt.providerExecution)[name]=receipt[name];}expect(()=>mapProject(parseSnapshot(value))).toThrow();}
});
it('caller clear/valid/physical flags never grant approval or execution and cannot replace original request',()=>{
  const value=fixture('clear');Object.assign(raw(value),{physicalOriginalsVerified:true,qualified:true});Object.assign(job(value),{valid:true,humanApproval:true,finalReviewApproval:true});const record=prelayoutReadScope(parseSnapshot(value)).records[0];expect(record.physicalOriginalsVerified).toBe(false);expect(record.executionEligible).toBe(false);expect(record.humanApproval).toBe(false);expect(record.finalReviewApproval).toBe(false);
  const input=object(object(job(value).task).prelayoutInput),queue=command(value,'queue-proposal-prelayout');input.valid=true;queue.input=input;saveCommand(value,queue);expect(()=>mapProject(parseSnapshot(value))).toThrow();
});
it('adding any unsupported real B producer job still rejects; input descriptors do not admit producer jobs',()=>{
  const value=fixture('queued'),p=raw(value);p.jobs=[...records(p.jobs),{id:'unsupported-B-producer',stage:'visual',purpose:'final_visual',status:'queued',attempts:[]}];expect(prelayoutReadScope(parseSnapshot(value)).jobs.size).toBe(1);expect(()=>mapProject(parseSnapshot(value))).toThrow();
  p.jobs=[];expect(()=>mapProject(parseSnapshot(value))).toThrow();
});
it('report raw text and artifact source association cannot be changed even with recomputed raw SHA',()=>{
  const value=fixture('clear'),j=job(value),attempt=records(j.attempts)[0],receipt=object(attempt.receipt),artifact=records(raw(value).artifacts).find(a=>a.stage==='layout');if(!artifact)throw Error('missing fixture report');const report=object(j.prelayoutReport);receipt.responseText='{}';object(receipt.providerExecution).responseText='{}';report.contentHash=sha256('{}');artifact.contentHash=report.contentHash;artifact.executionReceipt=receipt;const finish=command(value,'finish-proposal-prelayout');finish.originalText='{}';finish.contentHash=report.contentHash;saveCommand(value,finish);expect(()=>mapProject(parseSnapshot(value))).toThrow();
});
it('Chinese readonly panel preserves unknown/stale, exposes report details and has zero action buttons',()=>{
  const rows=['queued','unknown','clear','stale','invalid'].flatMap(state=>prelayoutReadScope(parseSnapshot(fixture(state))).records),services=createServices();
  try{const html=renderToStaticMarkup(createElement(ServiceProvider,{service:services.workbench,intake:services.intake,assistant:services.assistant,proposals:services.proposals,children:createElement(I18nProvider,{children:createElement(PrelayoutHistory,{records:rows})})}));
    expect(html).toContain('结果待核');expect(html).toContain('输入已变更');expect(html).toContain('原件资格未核实');expect(html).toContain('查看已保存报告原文');expect((html.match(/<button/g)??[]).length).toBe((html.match(/class="pw-more__btn"/g)??[]).length);expect(html).not.toContain('重新派发</button>');expect(html).not.toContain('终审已通过');expect(html).not.toContain('awaiting_reconciliation');
  }finally{services.team.destroy();}
});
