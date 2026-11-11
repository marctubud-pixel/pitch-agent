import assert from 'node:assert/strict';
import {imageManifest, IMAGE_LIMITS} from './image-evidence.mjs';

const images = Array.from({length: 7}, (_, index) => ({imageId: 'img_' + index, sha256: 'a'.repeat(64), mediaType: index % 2 ? 'image/jpeg' : 'image/png', byteLength: 100, width: 2, height: 2}));
const envelope = operation => ({operation, limits: {maxImages: 6, maxBytes: 600, maxPixels: 24}});
const expected = images.map(({imageId, sha256, mediaType, byteLength}) => ({imageId, sha256, mediaType, byteLength}));
let assertions = 0;
const same = (actual, wanted) => { assert.deepEqual(actual, wanted); assertions++; };
const refuses = action => { assert.throws(action); assertions++; };

for (const operation of ['sketch-review-v2', 'final-visual-v1', 'complete-content-v1']) {
  same(imageManifest(images.slice(0, 5), envelope(operation)), expected.slice(0, 5));
  same(imageManifest(images.slice(0, 6), envelope(operation)), expected.slice(0, 6));
  refuses(() => imageManifest(images, envelope(operation)));
  refuses(() => imageManifest(images.slice(0, 6), {...envelope(operation), limits: {...envelope(operation).limits, maxBytes: 599}}));
}
for (let count = 1; count <= 4; count++) same(imageManifest(images.slice(0, count)), expected.slice(0, count));
same(imageManifest([{...images[0], imageId: undefined, id: 'legacy'}]), [{...expected[0], imageId: 'legacy'}]);
same(imageManifest([{...images[0], byteLength: IMAGE_LIMITS.bytes}]), [{...expected[0], byteLength: IMAGE_LIMITS.bytes}]);
for (const value of [[], images.slice(0, 5), null, {}]) refuses(() => imageManifest(value));
for (const value of [null, false, 0, '', [], {}, {operation:'observe', limits:envelope('sketch-review-v2').limits}, {operation:'sketch-review-v2'}, {operation:'sketch-review-v2',limits:[]}, {...envelope('sketch-review-v2'), extra:true}]) refuses(() => imageManifest(images.slice(0, 1), value));
for (const key of ['maxImages', 'maxBytes', 'maxPixels']) {
  for (const invalid of [undefined, null, '6', 0, -1, 1.5, Infinity, -Infinity, NaN, Number.MAX_SAFE_INTEGER + 1]) {
    const value = envelope('sketch-review-v2');
    value.limits[key] = invalid;
    refuses(() => imageManifest(images.slice(0, 1), value));
  }
}
const invalidImages = [null, undefined, [], {}, {...images[0],imageId:'invalid id'}, {...images[0],sha256:'invalid'}, {...images[0],mediaType:'image/gif'}, ...[0,-1,1.5,Infinity,NaN,IMAGE_LIMITS.bytes+1].map(byteLength=>({...images[0],byteLength}))];
for (const invalid of invalidImages) {
  refuses(() => imageManifest([invalid]));
  refuses(() => imageManifest([invalid], envelope('sketch-review-v2')));
}
refuses(() => imageManifest([images[0], images[0]]));
refuses(() => imageManifest([images[0], images[0]], envelope('sketch-review-v2')));
refuses(() => imageManifest([{...images[0],id:'other'}, {...images[1],imageId:undefined,id:images[0].imageId}], envelope('sketch-review-v2')));
refuses(() => imageManifest([], envelope('sketch-review-v2')));
const untrustedDimensions = [{...images[0],width:Infinity,height:Infinity}];
same(imageManifest(untrustedDimensions,envelope('sketch-review-v2')),expected.slice(0,1));
const frozenImages = Object.freeze(images.slice(0,5).map(image=>Object.freeze({...image})));
same(imageManifest(frozenImages,Object.freeze({operation:'sketch-review-v2',limits:Object.freeze({maxImages:5,maxBytes:500,maxPixels:1})})),expected.slice(0,5));
export const result = {status:'passed',assertions,scope:'pure descriptor manifest only; no file image reads, decoder, process, DB, model or network calls'};
