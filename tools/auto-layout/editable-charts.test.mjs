import {fileURLToPath} from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {execFileSync,spawnSync} from 'node:child_process';
import {openEditableProposalStore,exportEditableProposal} from './editable-proposal.mjs';
import {engineeringFixture} from './native-charts/chart-fixture.mjs';
const font='/Users/marc/Documents/ChatGPT/调研agent/output/ppt/m6-integrated-v5/build/PingFangSC-Regular.ttf';
function fixture(){
 const {raw,sources}=engineeringFixture();
 return {id:'charts',sourceBinding:{kind:'synthetic-only',approval:'not-granted'},input:{brand:{font:{family:'PingFang SC',files:[font]}},assets:{},draftChartSources:raw.charts.map(c=>({id:c.chartId,raw,sources,chartId:c.chartId}))},plan:{width:1280,height:720,slides:raw.charts.map((c,i)=>({id:`page-${i}`,background:'#FFFFFF',notes:'Original synthetic source limitations.',elements:[{type:'chart',id:`chart-${i}`,chartSourceId:c.chartId,x:80,y:80,w:1100,h:550}]}))}};
}
test('native bar line pie edits save and export exact-version chart caches and editable workbooks',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'editable-charts-'));const config={databasePath:path.join(root,'db'),resourceRoot:path.join(root,'resources')};
 if(process.env.KEEP_EDITABLE_TEST_OUTPUT!=='1')t.after(()=>fs.rm(root,{recursive:true,force:true}));
 let store=await openEditableProposalStore(config);const original=await store.create(fixture());
 const changes=original.plan.slides.map((slide,i)=>{const data=structuredClone(slide.elements[0].chartData);data.title=['Changed bar','Changed line','Changed pie'][i];data.type=['bar','line','pie'][i];data.direction='column';data.categories=['=NOT_FORMULA()','中文 B','C'];data.series=[{name:'Edited data',values:[i+1,2.5,4]}];if(i<2)data.series.push({name:'Second edited series',values:[-2,0,3.25]});data.numberFormat='0.0';return {slideId:slide.id,elementId:slide.elements[0].id,values:{chartData:data,x:100}};});
 const updated=store.save('charts',{commandId:'chart-edit',expectedRevision:1,changes});
 assert.equal(updated.revision,2);assert.equal(updated.finalAuthority,false);
 for(let i=0;i<3;i++){assert.deepEqual(updated.plan.slides[i].elements[0].chartSource,original.plan.slides[i].elements[0].chartSource);assert.equal(updated.plan.slides[i].elements[0].chartDataState,'user-edited-unverified');}
 assert.deepEqual(store.save('charts',{commandId:'chart-edit',expectedRevision:1,changes}),updated);
 store.close();store=await openEditableProposalStore(config);assert.deepEqual(store.read('charts',2),updated);
 const exporting=exportEditableProposal({store,id:'charts',revision:2,outputRoot:path.join(root,'exports')});
 const later=structuredClone(changes);later[0].values.chartData.series[0].values[0]=999;
 store.save('charts',{commandId:'late-edit',expectedRevision:2,changes:later});
 const result=await exporting;assert.equal(result.documentHash,updated.documentHash);assert.equal(result.revision,2);assert.equal(result.charts.length,3);
 const expected=path.join(root,'expected.json');await fs.writeFile(expected,JSON.stringify(updated));
 const inspection=execFileSync('python3',[fileURLToPath(new URL('./editable-chart-inspect.py',import.meta.url)),result.deckPath,expected],{encoding:'utf8'});assert.equal(JSON.parse(inspection).charts,3);
 const altered=path.join(root,'altered.pptx');
 execFileSync('python3',['-c',`import sys,zipfile,io,xml.etree.ElementTree as E
src=zipfile.ZipFile(sys.argv[1]);name=next(n for n in src.namelist() if n.endswith('.xlsx'));book=zipfile.ZipFile(io.BytesIO(src.read(name)));ns={'x':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'};sheet=E.fromstring(book.read('xl/worksheets/sheet1.xml'));cell=next(c for c in sheet.findall('.//x:c',ns) if c.attrib['r']=='B2');cell.find('x:v',ns).text='999';buffer=io.BytesIO()
with zipfile.ZipFile(buffer,'w') as out:
 for n in book.namelist():out.writestr(n,E.tostring(sheet) if n=='xl/worksheets/sheet1.xml' else book.read(n))
with zipfile.ZipFile(sys.argv[2],'x') as out:
 for n in src.namelist():out.writestr(n,buffer.getvalue() if n==name else src.read(n))`,result.deckPath,altered]);
 const rejected=spawnSync('python3',[fileURLToPath(new URL('./editable-chart-inspect.py',import.meta.url)),altered,expected],{encoding:'utf8'});assert.notEqual(rejected.status,0);assert.match(rejected.stderr,/Draft chart package mismatch/);
 for(const badFormula of ["'MISSING_SHEET'!$B$2:$B$4", "'[external.xlsx]Chart Data'!$B$2:$B$4", "SUM('Chart Data'!$B$2:$B$4)"]){
  const badPath=path.join(root,`bad-formula-${Buffer.from(badFormula).toString('hex')}.pptx`);
  execFileSync('python3',['-c',`import sys,zipfile,xml.etree.ElementTree as E
src=zipfile.ZipFile(sys.argv[1]);ns={'c':'http://schemas.openxmlformats.org/drawingml/2006/chart'}
with zipfile.ZipFile(sys.argv[2],'x') as out:
 for n in src.namelist():
  data=src.read(n)
  if n.endswith('chart1.xml'):
   tree=E.fromstring(data)
   for f in tree.findall('.//c:f',ns):f.text=sys.argv[3]
   data=E.tostring(tree)
  out.writestr(n,data)`,result.deckPath,badPath,badFormula]);
  const check=spawnSync('python3',[fileURLToPath(new URL('./editable-chart-inspect.py',import.meta.url)),badPath,expected],{encoding:'utf8'});
  assert.notEqual(check.status,0);assert.match(check.stderr,/Draft chart package mismatch/);
  const headers=spawnSync('python3',[fileURLToPath(new URL('./editable-chart-workbooks.py',import.meta.url)),badPath,badPath+'.linked'],{encoding:'utf8'});
  assert.notEqual(headers.status,0);assert.match(headers.stderr,/Draft chart package mismatch/);
 }
 assert.deepEqual(store.read('charts',1).plan,original.plan);assert.equal(store.read('charts').revision,3);store.close();
 console.log(JSON.stringify({root,deck:result.deckPath,inspection:JSON.parse(inspection)}));
});
test('malformed matrices, unsupported charts, source changes and nonfinite values cannot save',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'editable-chart-invalid-'));const store=await openEditableProposalStore({databasePath:path.join(root,'db'),resourceRoot:path.join(root,'resources')});await store.create(fixture());
 if(process.env.KEEP_EDITABLE_TEST_OUTPUT!=='1')t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const original=store.read('charts'),base=original.plan.slides[0].elements[0].chartData;
 for(const mutate of [d=>d.type='scatter',d=>d.series[0].values.pop(),d=>d.series[0].values[0]=NaN,d=>d.series[0].values[0]=Infinity,d=>d.series[0].values[0]=-0,d=>d.type='pie',d=>d.extra='ignored']){
  const data=structuredClone(base);mutate(data);assert.throws(()=>store.save('charts',{commandId:'invalid',expectedRevision:1,changes:[{slideId:'page-0',elementId:'chart-0',values:{chartData:data}}]}));assert.equal(store.read('charts').revision,1);
 }
 assert.throws(()=>store.save('charts',{commandId:'source',expectedRevision:1,changes:[{slideId:'page-0',elementId:'chart-0',values:{chartSource:{}}}]}),{code:'DRAFT_FIELD_NOT_EDITABLE'});
 const bad=fixture();bad.id='changed';bad.input.draftChartSources[0].sources[0].text+=' changed';await assert.rejects(()=>store.create(bad));
 const badRef=fixture();badRef.id='ref';badRef.plan.slides[0].elements[0].chartRef={artifactId:'invented'};await assert.rejects(()=>store.create(badRef));
 assert.deepEqual(store.read('charts'),original);store.close();
});
test('current research admission imports with its exact identity and refuses changed proof',async t=>{
 const main=fileURLToPath(new URL('../workbench/',import.meta.url));
 const {numericFixture}=await import(main+'research-numeric-fixture.mjs');
 const {acceptedOperatorResearch,releaseRequest,human}=await import(main+'research-operator-fixture.mjs');
 const {requireResearchChartAdmission,requireSemanticCoverage}=await import(main+'project.mjs');
 const f=await numericFixture({compact:true});t.after(f.close);
 const {createExecutor}=await import(main+'executor.mjs');
 const {SEMANTIC_PROTOCOL}=await import(main+'semantic-authority.mjs');
 const semanticLease=f.store.registerSemanticConfiguration({readinessBinding:f.bindings.readiness,challengeBinding:f.bindings.semantic,rubricVersion:SEMANTIC_PROTOCOL},{expectedEpoch:0});
 f.executor=createExecutor({store:f.store,rootDir:f.root,bindings:f.bindings,providers:f.providers,creativeCalibrations:f.creativeCalibrations,imageProvider:null,semanticLease});
 assert.equal((await f.executor.execute('p',f.executor.enqueue('p','research',{sourceRecords:[f.source]}))).status,'succeeded');
 f.artifact=f.store.read('p').artifacts[0];
 assert.equal((await f.executor.execute('p',await f.executor.enqueueVerification('p',f.artifact.id))).status,'succeeded');
 assert.equal((await f.executor.execute('p',await f.executor.enqueueReadiness('p',f.artifact.id,{protocolVersion:'research-readiness-v2'}))).status,'succeeded');
 assert.throws(()=>requireSemanticCoverage(f.store.read('p'),f.artifact.id),{code:'SEMANTIC_REVIEW_REQUIRED'});
 const challengeCalls=f.calls.length;
 const challengeId=await f.executor.enqueueSemanticChallenge('p',f.artifact.id);
 assert.equal((await f.executor.execute('p',challengeId)).status,'succeeded');
 assert.equal(f.store.read('p').coverageChallenges.length,1);
 assert.equal(f.calls.length,challengeCalls+1);
 requireSemanticCoverage(f.store.read('p'),f.artifact.id);
 await acceptedOperatorResearch(f);await f.executor.releaseResearch('p',releaseRequest(f),human);
 const admission=requireResearchChartAdmission(f.store.read('p'),f.artifact.id),chart=admission.charts[0];
 const source=fixture();source.id='admission';source.plan.slides=source.plan.slides.slice(0,1);
 const e=source.plan.slides[0].elements[0];delete e.chartSourceId;e.chartRef={artifactId:admission.artifactId,chartId:chart.chartId,dataHash:chart.dataHash,admissionHash:admission.admissionHash,occurrenceId:'occurrence',pageIntentId:'page'};
 source.input.semantic={source:{researchChartAdmissions:[admission]}};
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'editable-chart-admission-'));const store=await openEditableProposalStore({databasePath:path.join(root,'db'),resourceRoot:path.join(root,'resources')});t.after(()=>store.close());
 if(process.env.KEEP_EDITABLE_TEST_OUTPUT!=='1')t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const created=await store.create(source);assert.deepEqual(created.plan.slides[0].elements[0].chartSource.identity.reference,e.chartRef);
 const changed=structuredClone(source);changed.id='invalid';changed.input.semantic.source.researchChartAdmissions[0].admissionHash='0'.repeat(64);
 await assert.rejects(()=>store.create(changed),{code:'CONTENT_CHART_ADMISSION_CHANGED'});
 assert.equal(store.read('admission').finalAuthority,false);
});
test('snapshot formula resolver supports quoted sheet names and follows workbook relationships',()=>{
 execFileSync('python3',['-c',`import sys,io,zipfile
sys.path.insert(0,sys.argv[1])
from editable_chart_refs import worksheet,formula_range
b=io.BytesIO()
with zipfile.ZipFile(b,'w') as z:
 z.writestr('xl/workbook.xml','<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Client&apos;s Data" sheetId="7" r:id="rId7"/></sheets></workbook>')
 z.writestr('xl/_rels/workbook.xml.rels','<Relationships><Relationship Id="rId7" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/custom.xml"/></Relationships>')
 z.writestr('xl/worksheets/custom.xml','<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"/>')
name,sheet=worksheet(zipfile.ZipFile(b))
assert formula_range("'Client''s Data'!$B$2:$B$4",name)==('B',2,4)
assert formula_range('Data!B1','Data')==('B',1,1)
for formula in ["'Other'!$B$2:$B$4","'[Book]Client''s Data'!$B$2:$B$4","SUM('Client''s Data'!$B$2:$B$4)","'Client''s Data'!$B$2:$C$4"]:
 try:formula_range(formula,name)
 except ValueError:pass
 else:raise AssertionError(formula)
`,path.dirname(fileURLToPath(import.meta.url))]);
});
