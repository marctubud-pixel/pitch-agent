import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {buildCaseIdentityPacket, buildCaseIdentityRequest, validateCaseIdentityOutput, buildCaseEvidenceRecord, CASE_IDENTITY_PROTOCOL, CASE_IDENTITY_MEANING} from './case-identity.mjs';
const hash = value => createHash('sha256').update(value).digest('hex');
const seal = record => ({record, recordHash: hash(JSON.stringify(record, null, 2) + '\n')});
function fixture() {
  const pageUrl = 'https://example.com/case';
  const imageUrl = 'https://example.com/embedded.png';
  const body = 'Brand A launched Product B. Edition C packaging for dinner sharing. Published 2023.';
  const record = (url, mimeType, text, sha256, byteLength, images = []) => ({schemaVersion: 1, requestedUrl: url, normalizedRequestedUrl: url, finalUrl: url, redirects: [], retrievedAt: '2026-10-25T00:00:00.000Z', httpStatus: 200, mimeType, raw: {sha256, byteLength, file: `raw/${sha256}.bin`}, extraction: {method: text ? 'static-html-tokenizer-v1' : 'none', text, textHash: hash(text), images}});
  const sourceImage = {imageId: 'source', sha256: hash('source pixels'), byteLength: 13, mediaType: 'image/png', sourceImageUrl: imageUrl};
  const referenceImage = {imageId: 'reference', sha256: hash('reference pixels'), byteLength: 16, mediaType: 'image/png'};
  const input = {taskCard: {id: 'task', brief: 'Design dinner sharing packaging.'}, pageCapture: seal(record(pageUrl,'text/html',body,hash('raw page'),100,[{url:imageUrl,alt:'Product B',caption:'Edition C'}])), sourceImageCapture: seal(record(imageUrl,'image/png','',sourceImage.sha256,sourceImage.byteLength)), sourceImage, referenceImage};
  const packet = buildCaseIdentityPacket(input);
  const ref = quote => ({location: '/pageCapture/record/extraction/text', quote});
  const pixel = image => ({imageId: image.imageId, imageSha256: image.sha256, region: 'center', observation: 'Product B label and matching bottle silhouette'});
  const finding = (value, quote) => ({status:'supported',value,reason:'Captured page attributes this field to the case.',refs:[ref(quote)],pixels:[]});
  const raw = {protocolVersion:CASE_IDENTITY_PROTOCOL,packetHash:packet.packetHash,actualImageManifestHash:packet.actualImageManifestHash,identityMeaning:CASE_IDENTITY_MEANING,
    fields:{brand:finding('Brand A','Brand A launched Product B.'),product:finding('Product B','Brand A launched Product B.'),edition:finding('Edition C','Edition C packaging'),time:{status:'unknown',value:'unknown',reason:'Publication date does not establish product launch year.',refs:[],pixels:[]},use:finding('dinner sharing','packaging for dinner sharing.')},
    imageMatch:{status:'supported',reason:'Case name on page and matching label and silhouette in both images.',refs:[ref('Brand A launched Product B.')],pixels:[pixel(referenceImage),pixel(sourceImage)]},taskFit:{status:'same_use',reason:'Both concern dinner sharing packaging.',refs:[{location:'/taskCard/brief',quote:'Design dinner sharing packaging.'},ref('packaging for dinner sharing.')]},verdict:'usable',limitations:['Publication date is not verified product time.']};
  return {input,raw,images:[referenceImage,sourceImage]};
}
test('identity packet sends neutral complete capture and both ordered images without attachment paths', () => {
  const {input} = fixture(); input.referenceImage.path='/private/reference.png';
  const request = buildCaseIdentityRequest(input);
  assert.deepEqual(request.manifest.map(image=>image.imageId),['reference','source']);
  assert.equal(JSON.stringify(request.packet).includes('/private/reference.png'),false);
  assert.match(request.prompt,/BOTH actual attached images/);
  assert.match(request.prompt,/not product dates/);
  assert.ok(Object.isFrozen(request.packet.pageCapture.record.extraction));
});
test('usable bounded case preserves original attributed text and captured verification', () => {
  const {input,raw,images} = fixture();
  const source = buildCaseEvidenceRecord({input,rawReport:raw,actualImages:images,id:'case_a'});
  assert.equal(source.verification,'captured'); assert.equal(source.identityStatus,'identity_checked'); assert.equal(source.scopeRelation,'direct');
  assert.equal(source.text,input.pageCapture.record.extraction.text); assert.equal(source.caseIdentity.fields.time.value,'unknown');
});
test('packet rejects image URL absent from actual captured page and capture URL spoofing', () => {
  const {input} = fixture(); input.sourceImage.sourceImageUrl='https://example.com/other.png';
  assert.throws(()=>buildCaseIdentityPacket(input),/absent/);
  const second=fixture().input; second.sourceImageCapture.record.requestedUrl='https://example.com/wrong.png'; second.sourceImageCapture=seal(second.sourceImageCapture.record);
  assert.throws(()=>buildCaseIdentityPacket(second),/request does not match/);
});
test('packet rejects changed capture/extracted text and stale source bytes', () => {
  const {input}=fixture(); input.pageCapture.record.extraction.text+=' changed'; assert.throws(()=>buildCaseIdentityPacket(input),/hash mismatch/);
  const second=fixture().input; second.pageCapture.record.extraction.text+=' changed'; second.pageCapture=seal(second.pageCapture.record); assert.throws(()=>buildCaseIdentityPacket(second),/extraction hash/);
  const third=fixture().input; third.sourceImage.sha256=hash('wrong'); assert.throws(()=>buildCaseIdentityPacket(third),/differs from captured/);
});
test('actual ordered attachment manifest and full packet hash reject stale review', () => {
  const {input,raw,images}=fixture(); assert.throws(()=>validateCaseIdentityOutput(raw,input,[...images].reverse()),/attached image/);
  assert.throws(()=>validateCaseIdentityOutput(raw,input),/attached image/);
  input.taskCard.brief+=' New audience.'; assert.throws(()=>validateCaseIdentityOutput(raw,input,images),/status/);
});
test('supported match requires visible regions from both actual images', () => {
  const {input,raw,images}=fixture(); raw.imageMatch.pixels.pop(); assert.throws(()=>validateCaseIdentityOutput(raw,input,images),/both actual images/);
});
test('exact page quotations cannot cite operator metadata or invented text', () => {
  const {input,raw,images}=fixture(); raw.fields.brand.refs[0].location='/pageCapture/record/finalUrl'; assert.throws(()=>validateCaseIdentityOutput(raw,input,images),/captured page text/);
  raw.fields.brand.refs[0]={location:'/pageCapture/record/extraction/text',quote:'Not on the page'}; assert.throws(()=>validateCaseIdentityOutput(raw,input,images),/exact text/);
});
test('unknown dates stay unknown and cannot carry invented value or affirmative quote', () => {
  const {input,raw,images}=fixture(); raw.fields.time.value='2023'; assert.throws(()=>validateCaseIdentityOutput(raw,input,images),/stay unknown/);
});
test('adjacent or uncertain correspondence blocks record derivation', () => {
  const {input,raw,images}=fixture(); raw.imageMatch.status='uncertain'; assert.throws(()=>validateCaseIdentityOutput(raw,input,images),/contradicts/);
  raw.verdict='blocked'; assert.equal(validateCaseIdentityOutput(raw,input,images).verdict,'blocked'); assert.throws(()=>buildCaseEvidenceRecord({input,rawReport:raw,actualImages:images,id:'case_a'}),/Blocked identity/);
  raw.imageMatch.status='supported'; raw.taskFit.status='adjacent'; assert.equal(validateCaseIdentityOutput(raw,input,images).verdict,'blocked');
});
test('contradicted brand cannot be made usable and extra authenticity claims are rejected', () => {
  const {input,raw,images}=fixture(); raw.fields.brand.status='contradicted'; assert.throws(()=>validateCaseIdentityOutput(raw,input,images),/contradicts/);
  raw.fields.brand.status='supported'; raw.authenticated=true; assert.throws(()=>validateCaseIdentityOutput(raw,input,images),/object fields/);
});
test('capture redirect final must follow recorded image request chain', () => {
  const {input}=fixture(); input.sourceImageCapture.record.finalUrl='https://cdn.example.com/source.png'; input.sourceImageCapture=seal(input.sourceImageCapture.record); assert.throws(()=>buildCaseIdentityPacket(input),/redirects/);
  input.sourceImageCapture.record.redirects=[{url:input.sourceImage.sourceImageUrl,status:302,location:'https://cdn.example.com/source.png'}]; input.sourceImageCapture=seal(input.sourceImageCapture.record); assert.ok(buildCaseIdentityPacket(input));
});
test('legacy case identity request bytes match the pre-declaration fixture hash', () => {
  assert.equal(hash(JSON.stringify(buildCaseIdentityRequest(fixture().input))), 'a31e6a9178ba80b2598f75ac2eaebe08176cf7cc253d8fd228fd70d4a8f9042f');
});
test('script candidate notice applies only to a selected script-declared image', () => {
  const {input} = fixture();
  input.pageCapture.record.extraction.images[0].discovery={kind:'script-declared',adapter:'sohu-cfgs-imgsList-v1',declarationPath:'cfgs.imgsList[0].url'};
  input.pageCapture=seal(input.pageCapture.record);
  assert.match(buildCaseIdentityRequest(input).prompt,/do not prove rendered DOM visibility/);
  input.pageCapture.record.extraction.images[0].discovery=undefined;
  input.pageCapture.record.extraction.images.push({url:'https://example.com/unselected.png',discovery:{kind:'script-declared'}});
  input.pageCapture=seal(input.pageCapture.record);
  assert.doesNotMatch(buildCaseIdentityRequest(input).prompt,/selected source image is a script-declared candidate/);
});
