import test from 'node:test';
import assert from 'node:assert/strict';
import {syntheticResearch,output} from './research-operator-fixture.mjs';
import {semanticChallengeInput} from './project.mjs';
import {semanticHash,SEMANTIC_PROTOCOL} from './semantic-authority.mjs';
import {buildSemanticRequest,validateSemanticOutput} from './research-semantic-review.mjs';
function rehash(i){const {packetHash,...body}=i;return {...body,packetHash:semanticHash(body)};}
test('semantic refs need adopted same-question pairs and applicability exceptions cannot hide disputes',async t=>{
 const f=await syntheticResearch({semanticReview:false});t.after(f.close);const input=semanticChallengeInput(f.store.read('p'),f.artifact.id);
 const good=output(buildSemanticRequest(input));assert.equal(validateSemanticOutput(good,input).hasBlockingFindings,false);
 const na=rehash({...input,questions:input.questions.map((q,n)=>n? q:{...q,primaryApplicability:'not_applicable'})});assert.throws(()=>validateSemanticOutput({...good,packetHash:na.packetHash},na));
 const wrong=structuredClone(good);wrong.relations[0].refs=[{location:'/taskCard/brief',quote:input.taskCard.brief}];assert.throws(()=>validateSemanticOutput(wrong,input));
 const badQuote=structuredClone(good);badQuote.relations[0].refs[0].quote='absent';assert.throws(()=>validateSemanticOutput(badQuote,input));
 const missing=structuredClone(good);missing.relations.pop();assert.throws(()=>validateSemanticOutput(missing,input));
 const crossed=rehash({...input,sourceRecords:[...input.sourceRecords,{id:'s2',text:'Another product.'}],content:{...input.content,sections:[...input.content.sections,{heading:'Other',body:'Another product.',evidenceIds:['s2']}]},questions:input.questions.map(q=>({...q,refs:[...q.refs,{location:'/sourceRecords/1/text',quote:'Another product.'},{location:'/content/sections/1/body',quote:'Another product.'}]}))});
 const result=output(buildSemanticRequest(crossed));result.relations[0].refs=[{location:'/content/sections/0/body',quote:input.content.sections[0].body},{location:'/sourceRecords/1/text',quote:'Another product.'}];assert.throws(()=>validateSemanticOutput(result,crossed));
});
