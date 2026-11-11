import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {renderSyntheticSketch} from './local-synthetic-sketch.mjs';
const require=createRequire(import.meta.url),{createCanvas,loadImage}=require('@napi-rs/canvas');
function crop(canvas,x,y,w,h){return canvas.getContext('2d').getImageData(x,y,w,h).data;}
function changedFraction(a,b){let changed=0;for(let n=0;n<a.length;n+=4)if(Math.abs(a[n]-b[n])+Math.abs(a[n+1]-b[n+1])+Math.abs(a[n+2]-b[n+2])>30)changed++;return changed/(a.length/4);}
test('same-copy direction winners have different dominant geometry, not merely labels or decorative trim',async()=>{
 for(const caseId of ['m6','dexian']){
  const images=[];
  for(const directionId of ['steady','product','user']){
   const bytes=await renderSyntheticSketch({caseId,directionId,variant:0,slogan:'Fixed headline',supportingCopy:'Synthetic structural comparison',phase:'sketch'});
   const image=await loadImage(bytes);assert.equal(image.width,1280);assert.equal(image.height,720);
   const canvas=createCanvas(1280,720);canvas.getContext('2d').drawImage(image,0,0);images.push(canvas);
  }
  for(let a=0;a<images.length;a++)for(let b=a+1;b<images.length;b++){
   assert.equal(changedFraction(crop(images[a],0,150,500,440),crop(images[b],0,150,500,440)),0,'Identical copy remains identical; no text change can pass this check');
   assert.ok(changedFraction(crop(images[a],600,180,600,430),crop(images[b],600,180,600,430))>.04,caseId+': dominant artwork must differ beyond a few decorative lines');
  }
 }
});
