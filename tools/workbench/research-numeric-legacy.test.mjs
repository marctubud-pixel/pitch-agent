import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {buildStageRequest,validateStageOutput} from './stage-content.mjs';
import {buildEvidenceReviewRequest,validateEvidenceReviewOutput} from './evidence-review.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex');
test('original no-version research and v2/v3 evidence prompt, schema, request and normalized hashes remain exact',async()=>{
 const fixture=JSON.parse(await readFile(new URL('./fixtures/research-numeric-legacy-bytes.json',import.meta.url))),request=buildStageRequest({stage:'research',brief:fixture.taskCard.brief,sourceRecords:fixture.sourceRecords});
 assert.equal(hash(JSON.stringify(request)),fixture.requestHash);assert.equal(hash(request.prompt),fixture.promptHash);assert.equal(hash(JSON.stringify(request.outputSchema)),fixture.schemaHash);assert.equal(hash(JSON.stringify(validateStageOutput('research',fixture.rawProduction,{sourceRecords:fixture.sourceRecords}).content,null,2)),fixture.normalizedHash);
 for(const item of fixture.reviews){const req=buildEvidenceReviewRequest(item.input);assert.equal(hash(JSON.stringify(req)),item.requestHash);assert.equal(hash(req.prompt),item.promptHash);assert.equal(hash(JSON.stringify(req.outputSchema)),item.schemaHash);assert.equal(hash(JSON.stringify(validateEvidenceReviewOutput(item.raw,item.input),null,2)),item.normalizedHash);}
});
