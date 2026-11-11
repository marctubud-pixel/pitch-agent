import test from 'node:test';
import assert from 'node:assert/strict';
import {planDeck} from './layout.mjs';
import {narrativeImageFrames} from './semantic-composition.mjs';
const shapes={landscape:{width:1280,height:720},portrait:{width:720,height:1280}};
function input(orientations,{carrier=false,tinyHero=false,borrowed=false}={}){
 const ids=orientations.map((_,i)=>i?'proof-'+i:'hero');
 const assets=Object.fromEntries(ids.map((id,i)=>[id,{...shapes[orientations[i]],role:'art',...((i===0&&carrier||i>0&&borrowed)?{application:{mockupId:'frame'}}:{})}]));
 if(carrier)assets.frame={...shapes[orientations[0]],role:'mockup',aperture:tinyHero?{x:.45,y:.45,w:.1,h:.1}:{x:.1,y:.1,w:.8,h:.8}};
 return {brand:{name:'Bounded image geometry fixture',font:{family:'Arial',files:[]},minBodySize:22,colors:{primary:'#173C78',accent:'#C9A864',paper:'#F6F3EC',ink:'#152B48',muted:'#59687A'}},assets,cases:{},audience:{findings:[]},semantic:{title:'Image group geometry',blocksById:{},obligationsByOrigin:{},sourcesById:{},intents:[{id:'main',kind:'narrative',central:{kind:'image',imageId:'hero'},centralMessage:'',heroImageId:'hero',imageIds:ids,blockIds:[],allowedSplitAfterBlockIds:[],atomicGroups:[],localObligations:[],location:{artifactId:'bounded-fixture',pointer:'/main',owner:'layout-lead'}}]}};
}
function verifyReadablePlan(data,style){
 const plan=planDeck(data,style),images=plan.slides[0].elements.filter(e=>e.type==='image'),hero=images.find(e=>e.assetId==='hero');
 assert.equal(images.length,data.semantic.intents[0].imageIds.length);
 for(const image of images){assert.ok(Math.min(image.w,image.h)>=100);assert.ok(Math.max(image.w,image.h)>=180);assert.ok(image.x>=0&&image.y>=0&&image.x+image.w<=1280&&image.y+image.h<=720);if(image!==hero)assert.ok(hero.w*hero.h>image.w*image.h);}
 for(let i=0;i<images.length;i++)for(let j=i+1;j<images.length;j++)assert.ok(Math.min(images[i].x+images[i].w,images[j].x+images[j].w)<=Math.max(images[i].x,images[j].x)||Math.min(images[i].y+images[i].h,images[j].y+images[j].h)<=Math.max(images[i].y,images[j].y));
 return plan;
}
for(const style of ['editorial','stage','evidence'])for(const orientations of [['landscape','landscape'],['portrait','landscape'],['landscape','portrait'],['portrait','portrait'],['landscape','landscape','landscape']])test(`${style} renders readable dominant hero for ${orientations.join('/')}`,()=>verifyReadablePlan(input(orientations),style));
for(const style of ['editorial','evidence'])for(const orientations of [['portrait','portrait','portrait'],['landscape','landscape','portrait'],['portrait','landscape','portrait']])test(`${style} fits stacked portrait and landscape proofs ${orientations.join('/')}`,()=>verifyReadablePlan(input(orientations),style));
for(const style of ['editorial','stage','evidence'])test(`${style} own carrier stays subordinate to the actual central artwork`,()=>{
 const data=input(['landscape','landscape'],{carrier:true}),plan=planDeck(data,style),images=plan.slides[0].elements.filter(e=>e.type==='image'),hero=images.find(e=>e.assetId==='hero'),proof=images.find(e=>e.assetId==='proof-1'),carrier=images.find(e=>e.assetId==='frame');
 assert.ok(carrier.w*carrier.h>hero.w*hero.h);assert.ok(hero.w*hero.h>proof.w*proof.h);assert.equal(hero.contentRefs.centralImageIntentId,'main');
});
for(const borrowed of [false,true])test(`tiny actual central artwork cannot borrow ${borrowed?'another view carrier with the same asset':'its own carrier'} for prominence`,()=>assert.throws(()=>planDeck(input(['landscape','landscape'],{carrier:true,tinyHero:true,borrowed}),'editorial'),{code:'SEMANTIC_IMAGE_CENTRAL_PROMINENCE'}));
test('physically insufficient proof slots still reject at unchanged readability floors',()=>{
 assert.throws(()=>planDeck(input(['landscape','portrait','portrait']),'stage'),{code:'SEMANTIC_IMAGE_GROUP_OVERFLOW'});
 const data=input(['landscape','landscape']),q={...data.semantic.intents[0],originId:'main',geometry:{images:{x:0,y:0,w:300,h:150}}};
 assert.throws(()=>narrativeImageFrames(q,'editorial',data.assets),{code:'SEMANTIC_IMAGE_GROUP_OVERFLOW'});
});
