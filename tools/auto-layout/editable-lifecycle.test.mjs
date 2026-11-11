import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import {openEditableProposalStore,exportEditableProposal} from './editable-proposal.mjs';
const font='/Users/marc/Documents/ChatGPT/调研agent/output/ppt/m6-integrated-v5/build/PingFangSC-Regular.ttf';
const page=(id,text=id)=>({id,background:'#FFFFFF',elements:[{id:'title',type:'text',text,size:48,color:'#123456',x:80,y:100,w:1000,h:100}]});
const fixture=()=>({id:'lifecycle',sourceBinding:{projectId:'synthetic-only',sourceHash:'original-source',approval:'not-granted'},input:{brand:{font:{family:'PingFang SC',files:[font]}},assets:{}},plan:{width:1280,height:720,slides:[page('cover','Original cover')]}});
async function setup(t){const root=await fs.mkdtemp(path.join(os.tmpdir(),'editable-lifecycle-'));const config={databasePath:path.join(root,'draft.sqlite'),resourceRoot:path.join(root,'resources')};let store=await openEditableProposalStore(config);t.after(()=>{try{store.close();}catch{}});if(!process.env.EDITABLE_KEEP)t.after(()=>fs.rm(root,{recursive:true,force:true}));return {root,config,get store(){return store;},set store(value){store=value;}};}
test('page commands preserve exact historical versions and restore as a new head',async t=>{
 const f=await setup(t);const original=await f.store.create(fixture());
 const req={commandId:'pages',expectedRevision:1,changes:[{kind:'add-slide',slide:page('detail'),index:1},{kind:'duplicate-slide',slideId:'cover',newSlideId:'cover-copy',index:2},{kind:'reorder-slides',slideIds:['detail','cover-copy','cover']},{slideId:'cover-copy',elementId:'title',values:{text:'New duplicate title',x:140}}]};
 const changed=f.store.save('lifecycle',req);assert.deepEqual(changed.plan.slides.map(s=>s.id),['detail','cover-copy','cover']);assert.equal(changed.plan.slides[2].elements[0].text,'Original cover');assert.deepEqual(f.store.save('lifecycle',req),changed);
 assert.throws(()=>f.store.save('lifecycle',{...req,changes:[{kind:'delete-slide',slideId:'cover'}]}),{code:'DRAFT_COMMAND_ID_REUSED'});
 assert.throws(()=>f.store.save('lifecycle',{commandId:'bad-order',expectedRevision:2,changes:[{kind:'reorder-slides',slideIds:['cover','cover','detail']}]}),{code:'DRAFT_SLIDE_ORDER_INVALID'});
 assert.throws(()=>f.store.save('lifecycle',{commandId:'reserved-kind',expectedRevision:2,changes:[{kind:'constructor'}]}),{code:'DRAFT_CHANGE_INVALID'});
 const bad={commandId:'atomic',expectedRevision:2,changes:[{kind:'delete-slide',slideId:'detail'},{slideId:'cover',elementId:'title',values:{sourceText:'fabricated'}}]};assert.throws(()=>f.store.save('lifecycle',bad),{code:'DRAFT_FIELD_NOT_EDITABLE'});assert.equal(f.store.read('lifecycle').revision,2);assert.equal(f.store.read('lifecycle').plan.slides.length,3);
 const removed=f.store.save('lifecycle',{commandId:'delete',expectedRevision:2,changes:[{kind:'delete-slide',slideId:'detail'}]});assert.equal(removed.plan.slides.length,2);
 const restore={commandId:'restore-original',expectedRevision:3,revision:1};const restored=f.store.restore('lifecycle',restore);assert.equal(restored.revision,4);assert.equal(restored.restoredFromRevision,1);assert.deepEqual(restored.plan,original.plan);assert.deepEqual(restored.sourceBinding,original.sourceBinding);assert.equal(restored.finalAuthority,false);assert.equal(restored.parentHash,removed.documentHash);assert.throws(()=>f.store.restore('lifecycle',{commandId:'missing-history',expectedRevision:4,revision:100}),{code:'DRAFT_REVISION_NOT_FOUND'});assert.deepEqual(f.store.restore('lifecycle',restore),restored);
 assert.throws(()=>f.store.restore('lifecycle',{commandId:'stale-restore',expectedRevision:2,revision:1}),{code:'DRAFT_REVISION_CONFLICT'});assert.throws(()=>f.store.save('lifecycle',{commandId:'last',expectedRevision:4,changes:[{kind:'delete-slide',slideId:'cover'}]}),{code:'DRAFT_LAST_SLIDE'});
 f.store.close();f.store=await openEditableProposalStore(f.config);assert.deepEqual(f.store.read('lifecycle',1),original);assert.deepEqual(f.store.read('lifecycle',2),changed);assert.deepEqual(f.store.read('lifecycle'),restored);assert.deepEqual(f.store.history('lifecycle').map(v=>v.revision),[4,3,2,1]);assert.equal(f.store.history('lifecycle')[0].restoredFromRevision,1);
 const exact=await exportEditableProposal({store:f.store,id:'lifecycle',revision:2,outputRoot:path.join(f.root,'exports')});
 const xml=execFileSync('python3',['-c',`import zipfile,sys,xml.etree.ElementTree as E,json
z=zipfile.ZipFile(sys.argv[1]);ns={'a':'http://schemas.openxmlformats.org/drawingml/2006/main'}; texts=[''.join(t.text or '' for t in E.fromstring(z.read('ppt/slides/slide%d.xml'%i)).findall('.//a:t',ns)) for i in range(1,4)];assert texts==['detail','New duplicate title','Original cover'];print(json.dumps(texts))`,exact.deckPath],{encoding:'utf8'});assert.equal(JSON.parse(xml).length,3);assert.equal(f.store.read('lifecycle').revision,4);
});
test('replacement images use registered immutable resources and imported command replay survives original removal',async t=>{
 const f=await setup(t);const {createCanvas}=await import('@napi-rs/canvas');const make=async(name,color)=>{const c=createCanvas(80,60);const x=c.getContext('2d');x.fillStyle=color;x.fillRect(0,0,80,60);const file=path.join(f.root,name+'.png');await fs.writeFile(file,c.toBuffer('image/png'));return file;};const first=await make('first','#0011FF'),second=await make('second','#FFAA00');
 const input=fixture();input.input.assets.first={file:first,source:{kind:'synthetic',label:'Original'}};input.plan.slides[0].elements.push({id:'photo',type:'image',assetId:'first',x:80,y:300,w:500,h:300});const original=await f.store.create(input);
 await assert.rejects(()=>f.store.importAsset('lifecycle',{commandId:'reserved',expectedRevision:1,assetId:'__proto__',asset:{file:second}}),{code:'DRAFT_ASSET_REQUIRED'});
 const importing={commandId:'import',expectedRevision:1,assetId:'second',asset:{file:second,source:{kind:'user-provided-unverified'}}};const registered=await f.store.importAsset('lifecycle',importing);await fs.unlink(second);assert.deepEqual(await f.store.importAsset('lifecycle',importing),registered);
 const updated=f.store.save('lifecycle',{commandId:'replace',expectedRevision:2,changes:[{kind:'replace-image',slideId:'cover',elementId:'photo',assetId:'second'},{slideId:'cover',elementId:'photo',values:{x:200,w:400}}]});assert.equal(updated.plan.slides[0].elements[1].assetId,'second');assert.equal(f.store.read('lifecycle',1).plan.slides[0].elements[1].assetId,'first');assert.deepEqual(updated.input.assets.first,original.input.assets.first);
 assert.throws(()=>f.store.save('lifecycle',{commandId:'unknown-image',expectedRevision:3,changes:[{kind:'replace-image',slideId:'cover',elementId:'photo',assetId:'unregistered'}]}),{code:'DRAFT_ASSET_REQUIRED'});
 const deck=await exportEditableProposal({store:f.store,id:'lifecycle',revision:3,outputRoot:path.join(f.root,'exports')});execFileSync('python3',['-c',`import zipfile,sys,xml.etree.ElementTree as E
z=zipfile.ZipFile(sys.argv[1]); ns={'p':'http://schemas.openxmlformats.org/presentationml/2006/main','a':'http://schemas.openxmlformats.org/drawingml/2006/main'};r=E.fromstring(z.read('ppt/slides/slide1.xml'));pics=r.findall('.//p:pic',ns);assert len(pics)==1;assert int(pics[0].find('p:spPr/a:xfrm/a:off',ns).get('x'))==200*9525;assert len(r.findall('.//p:sp',ns))>=1`,deck.deckPath]);
 const restored=f.store.restore('lifecycle',{commandId:'restore',expectedRevision:3,revision:1});assert.equal(restored.plan.slides[0].elements[1].assetId,'first');assert.equal(Object.hasOwn(restored.input.assets,'second'),false);
});

test('adding chart pages preserves invalid numeric values for rejection instead of normalizing them',async t=>{
 const f=await setup(t);const {engineeringFixture}=await import('./native-charts/chart-fixture.mjs');const {raw,sources}=engineeringFixture();const c=raw.charts[0],input=fixture();input.input.draftChartSources=[{id:c.chartId,raw,sources,chartId:c.chartId}];input.plan.slides[0].elements.push({id:'chart',type:'chart',chartSourceId:c.chartId,x:80,y:300,w:1000,h:350});const original=await f.store.create(input);
 for(const [index,value]of [NaN,Infinity,-0].entries()){
  const slide=structuredClone(original.plan.slides[0]);slide.id='invalid-chart-'+index;slide.elements.find(e=>e.type==='chart').chartData.series[0].values[0]=value;
  assert.throws(()=>f.store.save('lifecycle',{commandId:'invalid-chart-'+index,expectedRevision:1,changes:[{kind:'add-slide',index:1,slide}]}));assert.equal(f.store.read('lifecycle').revision,1);
 }
});
