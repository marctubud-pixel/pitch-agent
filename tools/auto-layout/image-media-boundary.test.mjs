import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {writeImage} from './export.mjs';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jD1sAAAAASUVORK5CYII=','base64');
const sha=b=>createHash('sha256').update(b).digest('hex');
async function probe(bytes,fileName,metadata={},verify){
 const dir=await mkdtemp(path.join(tmpdir(),'image-export-boundary-'));
 try{
  const file=path.join(dir,fileName);await writeFile(file,bytes);
  const calls=[],objects=[];const slide={images:{add:value=>{calls.push(value);const result={};objects.push(result);return result;}}};
  const run=()=>writeImage(slide,{assetId:'asset',x:1,y:2,w:3,h:4,fit:'contain',alt:'Exact alt'},{assets:{asset:{file,...metadata}}},'native-image');
  await verify(run,calls,objects);
 }finally{await rm(dir,{recursive:true,force:true});}
}
test('managed PNG with no extension retains exact bytes, editable picture geometry and source identity',()=>probe(png,sha(png),{sha256:sha(png),byteLength:png.length,mediaType:'image/png'},async(run,calls,objects)=>{
 await run();assert.equal(calls.length,1);assert.equal(calls[0].contentType,'image/png');assert.deepEqual(Buffer.from(calls[0].blob),png);assert.deepEqual(calls[0].position,{left:1,top:2,width:3,height:4});assert.equal(calls[0].alt,'Exact alt');assert.equal(objects[0].name,'native-image');
}));
for(const [name,metadata,pattern] of [['hash',{sha256:'0'.repeat(64)},/Image bytes changed/],['length',{byteLength:png.length+1},/Image length changed/],['media type',{mediaType:'image/jpeg'},/Image media type changed/]])test(`changed ${name} rejects before adding a picture`,()=>probe(png,'asset.png',metadata,async(run,calls)=>{await assert.rejects(run,pattern);assert.equal(calls.length,0);}));
test('unknown bytes with an image extension reject before adding a picture',()=>probe(Buffer.from('not an image'),'asset.png',{},async(run,calls)=>{await assert.rejects(run,/Unsupported image format/);assert.equal(calls.length,0);}));
test('ordinary named PNG remains supported',()=>probe(png,'asset.PNG',{},async(run,calls)=>{await run();assert.equal(calls[0].contentType,'image/png');}));
test('named SVG keeps its original SVG content type and bytes',()=>{const svg=Buffer.from('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>');return probe(svg,'shape.svg',{},async(run,calls)=>{await run();assert.equal(calls[0].contentType,'image/svg+xml');assert.deepEqual(Buffer.from(calls[0].blob),svg);});});
