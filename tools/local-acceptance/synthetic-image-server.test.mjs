import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {decodeSyntheticImageRequest,syntheticImagePrompt,localSyntheticImageConfig} from './synthetic-image-server.mjs';
const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),Buffer.from('parser-only bytes; not a decoded image')]);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const boundary='workbench-test-boundary',contentType=`multipart/form-data; boundary=${boundary}`;
const spec={caseId:'m6',directionId:'steady',variant:0,slogan:'万家灯火，同圆新梦',supportingCopy:'本地工程样图，非成稿',phase:'final',selectedImage:{imageId:'selected-original',sha256:sha(png)}};
function body({input=png,prompt=syntheticImagePrompt(spec),duplicate=false,omit=false}={}){
 const fields={model:'local-synthetic-image-v1',prompt,n:1,size:'1280x720',quality:'standard',output_format:'png',response_format:'b64_json'};
 const chunks=Object.entries(fields).map(([k,v])=>Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
 if(!omit)for(let n=0;n<(duplicate?2:1);n++)chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="image[]"; filename="image-1.png"\r\nContent-Type: image/png\r\n\r\n`),input,Buffer.from('\r\n'));
 chunks.push(Buffer.from(`--${boundary}--\r\n`));return Buffer.concat(chunks);
}
test('multipart retains exact supplied selected bytes and checks prompt hash; this is parser-only not image decode',()=>{
 const result=decodeSyntheticImageRequest({bytes:body(),contentType,edit:true});assert.deepEqual(result.images[0].bytes,png);assert.equal(result.images[0].sha256,spec.selectedImage.sha256);assert.equal(result.spec.selectedImage.imageId,'selected-original');
 const changed=Buffer.concat([png,Buffer.from('changed')]);assert.throws(()=>decodeSyntheticImageRequest({bytes:body({input:changed}),contentType,edit:true}),/SELECTED_IMAGE_CHANGED/);
 assert.equal(localSyntheticImageConfig({baseUrl:'http://127.0.0.1:4399/v1'}).operations.edit,true);
});
test('edit rejects missing duplicate or malformed source instead of pretending refinement',()=>{
 for(const bytes of [body({omit:true}),body({duplicate:true}),Buffer.concat([body(),Buffer.from('trailing')])])assert.throws(()=>decodeSyntheticImageRequest({bytes,contentType,edit:true}));
 assert.throws(()=>decodeSyntheticImageRequest({bytes:body(),contentType:'application/json',edit:true}),/MULTIPART_INVALID/);
 assert.throws(()=>syntheticImagePrompt({...spec,selectedImage:undefined}),/SELECTED_IMAGE_REQUIRED/);
});
test('final image cannot use generation route without mandatory original image',()=>{
 const fields={model:'local-synthetic-image-v1',prompt:syntheticImagePrompt(spec),n:1,size:'1280x720',quality:'standard',output_format:'png',response_format:'b64_json'};
 assert.throws(()=>decodeSyntheticImageRequest({bytes:Buffer.from(JSON.stringify(fields)),contentType:'application/json',edit:false}),/PHASE_OPERATION_MISMATCH/);
});
