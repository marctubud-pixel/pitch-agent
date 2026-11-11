import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inflateSync} from 'node:zlib';
import {spawnSync} from 'node:child_process';
import {layoutJobInput,layoutHash} from './layout-boundary.mjs';
import {finalRegisteredContentBasis} from './final-content-contract.mjs';
import {finalReviewOriginalMetadataBasis} from './final-review-authority.mjs';

const actual=JSON.parse(inflateSync(readFileSync(new URL('./fixtures/final-compact-metadata-v6.json.deflate',import.meta.url))));
const root=actual.jobs.find(j=>j.id===actual.actualLayoutRootId);
const binding=root.task.binding;
const content=actual.artifacts.find(a=>a.id===binding.contentArtifactId);
const source=actual.jobs.find(j=>j.id===binding.contentRootJobId);

test('actual revision 204 compact root reconstructs exact historical input for final metadata',()=>{
 assert.equal(actual.revision,204);
 assert.equal(root.task.inputVersion,'numeric-layout-input-ref-v1');
 assert.equal(Object.hasOwn(root.task,'input'),false);
 const input=layoutJobInput(actual,root);
 assert.equal(layoutHash(input.manuscriptText),binding.contentHash);
 assert.equal(layoutHash(input.ledgerText),binding.ledgerHash);
 const basis=finalRegisteredContentBasis(actual,root,content,source);
 assert.equal(basis.contentHash,binding.contentHash);
 assert.equal(basis.ledgerHash,binding.ledgerHash);
 assert.throws(()=>finalReviewOriginalMetadataBasis(actual,root.id),{code:'FINAL_LAYOUT_REQUIRED'});
});

test('actual compact root reaches numeric final metadata with constructed completed receipt prerequisites',()=>{
 const p=structuredClone(actual),r=p.jobs.find(j=>j.id===root.id);
 for(const [index,style] of ['editorial','stage','evidence'].entries()){
  const j=index===0?r:{id:`constructed-${style}`,purpose:'layout_export',task:{bindingHash:r.task.bindingHash,style}};
  j.task.style=style;
  const receipt={attemptId:`constructed-${style}`,bindingHash:r.task.bindingHash,style,anchorHash:layoutHash(style)};
  j.status='succeeded';j.receipt=receipt;j.attempts=[{id:receipt.attemptId,status:'succeeded',receipt}];
  if(index)p.jobs.push(j);
 }
 const basis=finalReviewOriginalMetadataBasis(p,r.id);
 assert.equal(basis.numericContent.ledgerHash,binding.ledgerHash);
 assert.equal(Object.hasOwn(r.task,'input'),false);
 const changed=structuredClone(p);
 changed.jobs.find(j=>j.id===root.id).task.binding.ledgerHash='0'.repeat(64);
 assert.throws(()=>finalReviewOriginalMetadataBasis(changed,r.id),{code:'FINAL_STALE_BASIS'});
});

test('actual compact reference rejects altered historical author and source',()=>{
 const changedAuthor=structuredClone(actual);
 changedAuthor.jobs.find(j=>j.contentRootJobId===source.id&&j.nodeKey==='author').contentReport.raw.manuscript.title+=' altered';
 assert.throws(()=>finalRegisteredContentBasis(changedAuthor,changedAuthor.jobs.find(j=>j.id===root.id),content,source),{code:'LAYOUT_BINDING_CHANGED'});
 const changedSource=structuredClone(actual);
 const changedRoot=changedSource.jobs.find(j=>j.id===source.id);
 changedRoot.task.source.obligations[0].value='altered';
 assert.throws(()=>finalRegisteredContentBasis(changedSource,changedSource.jobs.find(j=>j.id===root.id),content,changedRoot),{code:'CONTENT_CHART_SOURCE_CHANGED'});
});

test('actual compact metadata rejects a stale literal supplied beside the compact tag',()=>{
 const p=structuredClone(actual),r=p.jobs.find(j=>j.id===root.id),staleInput=layoutJobInput(p,r);
 for(const [index,style] of ['editorial','stage','evidence'].entries()){
  const j=index===0?r:{id:`constructed-${style}`,purpose:'layout_export',task:{bindingHash:r.task.bindingHash,style}};
  j.task.style=style;
  const receipt={attemptId:`constructed-${style}`,bindingHash:r.task.bindingHash,style,anchorHash:layoutHash(style)};
  j.status='succeeded';j.receipt=receipt;j.attempts=[{id:receipt.attemptId,status:'succeeded',receipt}];
  if(index)p.jobs.push(j);
 }
 p.jobs.find(j=>j.contentRootJobId===source.id&&j.nodeKey==='layout:producer').contentReport.forged=true;
 assert.throws(()=>finalReviewOriginalMetadataBasis(p,r.id),{code:'LAYOUT_BINDING_CHANGED'});
 r.task.input=staleInput;
 assert.throws(()=>finalReviewOriginalMetadataBasis(p,r.id),{code:'LAYOUT_INPUT_MISSING'});
 r.task.inputVersion='numeric-layout-input-ref-v2';
 assert.throws(()=>layoutJobInput(p,r),{code:'LAYOUT_INPUT_MISSING'});
 r.task.inputVersion=undefined;
 assert.throws(()=>layoutJobInput(p,r),{code:'LAYOUT_INPUT_MISSING'});
});

const factProbe=String.raw`import assert from 'node:assert/strict';
import {mock} from 'node:test';
const completePath=new URL(process.env.COMPLETE_CONTENT_URL);
const complete=await import(completePath);
let contract;
mock.module(completePath,{namedExports:{...complete,completeContentLayoutContract:()=>contract}});
const {checkedLayoutContract,layoutHash,requireLayoutPreparationCurrent}=await import(process.env.LAYOUT_BOUNDARY_URL);
const sourceHash='a'.repeat(64),manuscriptHash='b'.repeat(64),producer={raw:{decision:'accept'}},consumer={raw:{decision:'accept',nested:{mark:'original'}}};
const p={id:'p',activeTaskCardId:'tc',policies:[{version:1}],activeByStage:{content_review:'a'},artifacts:[{id:'a',contentHash:layoutHash('{}'),completeContent:{rootJobId:'r'}}],jobs:[{id:'r',task:{source:{}}},{id:'producer',contentRootJobId:'r',nodeKey:'layout:producer',contentReport:producer}],releases:[{artifactId:'a',policyVersion:1,sourceHash}]};
const artifact=p.artifacts[0];
function prepared(){const ownerReports={producer:structuredClone(producer),consumer:structuredClone(consumer)},ledgerText=JSON.stringify({source:{}}),manuscriptText='{}';const binding={protocol:'project-layout-v1',projectId:'p',taskCardId:'tc',policy:{version:1},contentArtifactId:'a',contentRootJobId:'r',sourceHash,manuscriptHash,contentHash:layoutHash(manuscriptText),ledgerHash:layoutHash(ledgerText),ownerReportsHash:layoutHash(ownerReports),styles:['editorial','stage','evidence']};return {binding,bindingHash:layoutHash(binding),ledgerText,manuscriptText,ownerReports};}
contract={sourceHash,manuscriptHash,layoutAcceptance:structuredClone(consumer)};
let t=prepared();let {contract:returned,fact}=checkedLayoutContract(p,artifact,()=>{});returned.manuscriptHash='0'.repeat(64);t.binding.manuscriptHash=returned.manuscriptHash;t.bindingHash=layoutHash(t.binding);assert.throws(()=>requireLayoutPreparationCurrent(p,t,()=>{},fact),{code:'LAYOUT_SOURCE_CHANGED'});
contract={sourceHash,manuscriptHash,layoutAcceptance:structuredClone(consumer)};t=prepared();({contract:returned,fact}=checkedLayoutContract(p,artifact,()=>{}));returned.layoutAcceptance.raw.nested.mark='forged';t.ownerReports.consumer.raw.nested.mark='forged';t.binding.ownerReportsHash=layoutHash(t.ownerReports);t.bindingHash=layoutHash(t.binding);assert.throws(()=>requireLayoutPreparationCurrent(p,t,()=>{},fact),{code:'LAYOUT_SOURCE_CHANGED'});
contract={sourceHash,manuscriptHash,layoutAcceptance:structuredClone(consumer)};t=prepared();({fact}=checkedLayoutContract(p,artifact,()=>{}));requireLayoutPreparationCurrent(p,t,()=>{},fact);console.log('fact private snapshot controls passed');
`;
test('checked layout fact preserves private scalar and nested contract values',()=>{
 const result=spawnSync(process.execPath,['--experimental-test-module-mocks','--input-type=module','-e',factProbe],{encoding:'utf8',env:{...process.env,COMPLETE_CONTENT_URL:new URL('./complete-content.mjs',import.meta.url).href,LAYOUT_BOUNDARY_URL:new URL('./layout-boundary.mjs',import.meta.url).href}});
 assert.equal(result.status,0,result.stderr);
 assert.match(result.stdout,/fact private snapshot controls passed/);
});
