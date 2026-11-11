import test from 'node:test';
import assert from 'node:assert/strict';
import {syntheticResearch} from './research-operator-fixture.mjs';
import {buildResearchReadinessRequest,validateResearchReadinessOutput} from './research-readiness.mjs';
import {buildSplitPlan,buildSplitRequest,assembleSplitReview} from './research-readiness-split.mjs';
const schemaOf=request=>request.expandedOutputSchema??request.outputSchema;
function select(raw,request,kind){
 const pick=(old,schema)=>{if(schema.anyOf){return pick(old,schema.anyOf.find(s=>Object.entries(s.properties).every(([k,v])=>!v.enum||v.enum.includes(old[k]))));}if(schema.type==='array'){if(schema.items.type==='string'&&schema.items.enum&&schema.items.enum.every(id=>Object.hasOwn(request.catalogue,id))&&old.every(x=>x&&typeof x==='object'&&x.location)){const locations=new Set(old.map(x=>x.location));return schema.items.enum.filter(id=>request.catalogue[id].refs.every(r=>locations.has(r.location)));}return old.map(x=>pick(x,schema.items));}if(schema.type==='object')return Object.fromEntries(Object.entries(schema.properties).map(([k,s])=>[k,k==='selectionProtocol'?schemaOf(request).properties.selectionProtocol.enum[0]:k==='selectionHash'?request.selectionHash:pick(old[k],s)]));return old;};
 const r=structuredClone(raw),key=kind==='readiness'?'coverage':'relations';r[key]=Object.fromEntries(r[key].map(({questionId,...v})=>[questionId,v]));
 if(schemaOf(request).properties.obligationAssessments?.type==='object'&&Array.isArray(r.obligationAssessments))r.obligationAssessments=Object.fromEntries(r.obligationAssessments.map(({originKey,...v})=>[originKey,v]));
 for(const[name,field]of [['sourceAssessments','sourceId'],['visualAssessments','visualId']])if(r[name])r[name]=Object.fromEntries(r[name].map(({[field]:id,...v})=>[id,v]));
 if(schemaOf(request).properties.useScan?.anyOf?.some(s=>s.properties.scanMode)){r.useScan=r.useScan.assessedOriginKeys.length?{scanMode:'conditional',...r.useScan}:{scanMode:'none',contentHash:r.useScan.contentHash};}
 return pick(r,schemaOf(request));
}

test('split assembly preserves original validator and rejects incomplete or mixed results',async t=>{
 const f=await syntheticResearch();t.after(f.close);const p=f.store.read('p'),record=p.readinessReports.at(-1),job=p.jobs.find(j=>j.id===record.jobId);
 const input={...job.task.readinessInput,evidenceSelectionProtocol:'evidence-selection-v5'};
 const plan=buildSplitPlan(input),raw=select(record.rawReport,plan.request,'readiness');
 const make=(part,prior)=>{const r=buildSplitRequest(plan,part,prior);return {part,planHash:r.planHash,dependencyHash:r.dependencyHash,output:Object.fromEntries(Object.keys(r.outputSchema.properties).map(k=>[k,raw[k]]))};};
 const obligations=make('obligations'),assessment=make('assessment'),scan=make('scan',obligations),all=[assessment,obligations,scan];
 assert.deepEqual(assembleSplitReview(plan,all).report,validateResearchReadinessOutput(raw,input));
 assert.equal(assembleSplitReview(plan,all).report.verdict,'ready');
 const checks=[
 ['missing',x=>x.pop()],['duplicate',x=>x[2]=x[1]],['mixed hash',x=>x[0].planHash='wrong'],
 ['stale dependency',x=>x[2].dependencyHash='wrong'],['unknown evidence',x=>Object.values(x[0].output.coverage)[0].refs=['unknown']],
 ['changed protocol',x=>x[0].output.selectionProtocol='evidence-selection-v4'],['extra field',x=>x[0].output.extra=true],
 ];
 for(const[name,mutate]of checks)await t.test(name,()=>{const x=structuredClone(all);mutate(x);assert.throws(()=>assembleSplitReview(plan,x));});
 await t.test('scan requires obligations first',()=>assert.throws(()=>buildSplitRequest(plan,'scan')));
 await t.test('tampered field partition',()=>{const bad=structuredClone(plan);bad.fields.assessment=[];assert.throws(()=>buildSplitRequest(bad,'assessment'));});
 await t.test('domain checks still reject unsupported coverage',()=>{const x=structuredClone(all);Object.values(x[0].output.coverage)[0].refs=[];assert.throws(()=>assembleSplitReview(plan,x));});
 await t.test('ready verdict cannot hide coverage gap',()=>{const x=structuredClone(all);Object.values(x[0].output.coverage)[0].status='gap';assert.equal(x[0].output.verdict,'ready');assert.throws(()=>assembleSplitReview(plan,x));});
 await t.test('retained definitions resolve',()=>{for(const part of ['assessment','obligations']){const r=buildSplitRequest(plan,part);const walk=x=>{if(!x||typeof x!=='object')return;if(x.$ref)assert(r.outputSchema.$defs[x.$ref.slice(8)]);Object.values(x).forEach(walk);};walk(r.outputSchema);assert.equal(r.prompt.startsWith(plan.request.prompt),true);}});
});
