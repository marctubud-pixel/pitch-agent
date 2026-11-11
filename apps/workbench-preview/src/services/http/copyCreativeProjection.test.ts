import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {expect,it} from 'vitest';
import {bridgeCopyJob} from './copyWorkflowProjection';
import {creativeReportBound} from './copyCreativeProjection';
import {object,records,parseSnapshot} from './dto';
import {sha256} from './sha256';
const evidence=process.env.PITCH_COPY_PROJECTION_SNAPSHOT??fileURLToPath(new URL('../../../test-fixtures/simple-copy/native-snapshot.json.gz',import.meta.url));
function native(){const bytes=readFileSync(evidence);return object(JSON.parse((evidence.endsWith('.gz')?gunzipSync(bytes):bytes).toString('utf8')));}
function snapshot(raw:Record<string,unknown>){return parseSnapshot({project:raw,view:{policy:records(raw.policies).at(-1),stages:[]}});}
it('synchronous snapshot SHA agrees with Node for UTF8 and block boundaries',()=>{for(const input of ['', 'abc','中文🙂',...Array.from({length:130},(_,i)=>'界'.repeat(i))])expect(sha256(input)).toBe(createHash('sha256').update(input).digest('hex'));});
it('admits every original owner/copy/review node from retained native evidence',()=>{const raw=native(),p=snapshot(raw),jobs=p.jobs.filter(j=>j.stage==='copy'||j.purpose==='owner_acceptance');for(const j of jobs)expect(bridgeCopyJob(p,j),String(j.id)).toBe(true);for(const report of records(raw.creativeReports))expect(creativeReportBound(p,report)).toBe(true);});
it('rejects changed original packet, task, all-node coverage and exact phase input bindings',()=>{
 const mutations:Array<[string,(raw:Record<string,unknown>,job:Record<string,unknown>,panel:Record<string,unknown>)=>void]>=[
 ['input role',(_r,j)=>{object(object(j.task).creativeInput).role='brand';}],
 ['input packet hash',(_r,j)=>{object(object(j.task).creativeInput).panelPacketHash='0'.repeat(64);}],
 ['panel packet hash',(_r,_j,p)=>{p.packetHash='0'.repeat(64);}],
 ['stale task',(_r,_j,p)=>{object(object(p.packet).taskCard).brief='stale task';}],
 ['duplicate nodes',(_r,_j,p)=>{const nodes=records(p.nodes);p.nodes=nodes.map(()=>nodes[0]);}],
 ['changed subjects',(_r,j)=>{object(object(j.task).creativeInput).subjects=[];}],
 ['changed policy',(_r,_j,p)=>{object(p.packet).policyVersion=999;}],
 ['changed report metadata',(r)=>{records(r.creativeReports)[0].role='brand';}],
 ['changed report raw binding',(r)=>{object(records(r.creativeReports)[0].rawReport).panelPacketHash='0'.repeat(64);}],
 ];
 for(const [name,mutate] of mutations){const raw=native(),panel=records(raw.creativePanels)[0],job=records(raw.jobs).find(j=>j.id===records(panel.nodes)[0].jobId);if(!job)throw Error('Missing actual original job');mutate(raw,job,panel);expect(bridgeCopyJob(snapshot(raw),job),name).toBe(false);}
});
it('checks contextual phases against the exact original predecessors and full frozen input',()=>{const original=native();for(const phase of ['score','opposition_first_read','opposition','director']){const raw=structuredClone(original),job=records(raw.jobs).find(j=>j.purpose==='creative_review'&&object(object(j.task).creativeInput).phase===phase);if(!job)throw Error('Missing phase');object(object(job.task).creativeInput).taskCard={id:'wrong'};expect(bridgeCopyJob(snapshot(raw),job),phase).toBe(false);}});

it('keeps frozen original jobs readable as history after a new active brief and policy',()=>{const raw=native();raw.activeTaskCardId='new-brief';raw.taskCards=[...records(raw.taskCards),{...records(raw.taskCards).at(-1),id:'new-brief',brief:'new task'}];raw.policies=[...records(raw.policies),{...records(raw.policies).at(-1),version:999}];const p=snapshot(raw);for(const job of p.jobs.filter(j=>j.stage==='copy'||j.purpose==='owner_acceptance'))expect(bridgeCopyJob(p,job),String(job.id)).toBe(true);});
