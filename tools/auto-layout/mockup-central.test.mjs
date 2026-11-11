import test from 'node:test';
import assert from 'node:assert/strict';
import {planDeck} from './layout.mjs';
function input({tinyHero=false,otherImage=false,borrowedFrame=false}={}){
 const images=['hero',...(otherImage?['proof']:[])];
 return {brand:{name:'Local fixture',font:{family:'Arial',files:[]},minBodySize:22,colors:{primary:'#173C78',accent:'#C9A864',paper:'#F6F3EC',ink:'#152B48',muted:'#59687A'}},assets:{hero:{width:1280,height:720,role:'art',application:{mockupId:'frame'}},frame:{width:1280,height:720,role:'mockup',aperture:tinyHero?{x:.45,y:.45,w:.1,h:.1}:{x:.1,y:.1,w:.8,h:.8}},...(otherImage?{proof:{width:1280,height:720,role:'art',...(borrowedFrame?{application:{mockupId:'frame'}}:{})}}:{})},cases:{},audience:{findings:[]},semantic:{title:'Engineering composition fixture',blocksById:{},obligationsByOrigin:{},sourcesById:{},intents:[{id:'main',kind:'narrative',central:{kind:'image',imageId:'hero'},centralMessage:'',heroImageId:'hero',imageIds:images,blockIds:[],allowedSplitAfterBlockIds:[],atomicGroups:[],localObligations:[],location:{artifactId:'test-only',pointer:'/main',owner:'layout-lead'}}]}};
}
for(const style of ['editorial','stage','evidence'])test(`${style}: declared mockup carrier does not compete with its own central artwork`,()=>{
 const plan=planDeck(input(),style),elements=plan.slides[0].elements,hero=elements.find(e=>e.assetId==='hero'),frame=elements.find(e=>e.assetId==='frame');
 assert(hero&&frame);assert(frame.w*frame.h>hero.w*hero.h);assert.equal(hero.contentRefs.centralImageIntentId,'main');assert.deepEqual(hero.contentRefs.imageIds,['hero']);assert(elements.every(e=>!Object.hasOwn(e,'mockupCarrierFor')),'carrier relation stays internal, not an unsupported exported element field');
});
test('a separate image remains subject to central prominence even with a mockup',()=>{
 assert.throws(()=>planDeck(input({tinyHero:true,otherImage:true}),'editorial'),e=>e.code==='SEMANTIC_IMAGE_CENTRAL_PROMINENCE');
});
test('another artworks carrier is not excluded even when it uses the same frame asset',()=>{
 assert.throws(()=>planDeck(input({tinyHero:true,otherImage:true,borrowedFrame:true}),'editorial'),e=>e.code==='SEMANTIC_IMAGE_CENTRAL_PROMINENCE');
});
