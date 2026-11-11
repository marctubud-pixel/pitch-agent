import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import {openEditableProposalStore,exportEditableProposal} from './editable-proposal.mjs';
const font='/Users/marc/Documents/ChatGPT/调研agent/output/ppt/m6-integrated-v5/build/PingFangSC-Regular.ttf';
const fixture=()=>({id:'fixture',sourceBinding:{projectId:'synthetic-only',sourceHash:'original-source-identity',approval:'not-granted'},input:{brand:{font:{family:'PingFang SC',files:[font]}},assets:{}},plan:{width:1280,height:720,slides:[{id:'cover',background:'#FFFFFF',elements:[{id:'title',type:'text',text:'原来的标题',size:48,color:'#123456',x:80,y:100,w:1000,h:100},{id:'rule',type:'line',x:80,y:250,w:400,h:0,width:3,color:'#123456'}]}]}});
const request=(commandId,expectedRevision,text,x=100)=>({commandId,expectedRevision,changes:[{slideId:'cover',elementId:'title',values:{text,x}}]});
test('save, reopen, immutable revisions, conflicts and exact-version native export',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'editable-proposal-test-'));const config={databasePath:path.join(root,'drafts.sqlite'),resourceRoot:path.join(root,'resources')};
 if(process.env.KEEP_EDITABLE_TEST_OUTPUT!=='1')t.after(()=>fs.rm(root,{recursive:true,force:true}));
 let store=await openEditableProposalStore(config);const first=await store.create(fixture());
 const change=request('edit-1',1,'保存后的新标题',140),second=store.save('fixture',change);
 assert.equal(second.revision,2);assert.equal(second.status,'draft_requires_review');assert.equal(second.finalAuthority,false);
 assert.deepEqual(second.sourceBinding,first.sourceBinding);assert.equal(store.read('fixture',1).plan.slides[0].elements[0].text,'原来的标题');
 assert.deepEqual(store.save('fixture',change),second);
 assert.throws(()=>store.save('fixture',request('edit-1',1,'变更重放')), {code:'DRAFT_COMMAND_ID_REUSED'});
 assert.throws(()=>store.save('fixture',request('stale',1,'过期')), {code:'DRAFT_REVISION_CONFLICT'});
 for(const x of [-1,1279,NaN])assert.throws(()=>store.save('fixture',request('bad',2,'拒绝坐标',x)),{code:'DRAFT_GEOMETRY_INVALID'});
 assert.equal(store.read('fixture').revision,2);
 store.close();store=await openEditableProposalStore(config);assert.deepEqual(store.read('fixture',2),second);
 const exporting=exportEditableProposal({store,id:'fixture',revision:2,outputRoot:path.join(root,'exports')});
 store.save('fixture',request('edit-2',2,'导出期间再修改',200));
 const receipt=await exporting;assert.equal(receipt.revision,2);assert.equal(receipt.documentHash,second.documentHash);assert.equal(receipt.finalAuthority,false);
 const output=execFileSync('python3',['-c',`import sys,zipfile,xml.etree.ElementTree as E,json
z=zipfile.ZipFile(sys.argv[1]); n={'a':'http://schemas.openxmlformats.org/drawingml/2006/main','p':'http://schemas.openxmlformats.org/presentationml/2006/main'}
r=E.fromstring(z.read('ppt/slides/slide1.xml')); text=''.join(t.text or '' for t in r.findall('.//a:t',n)); assert '保存后的新标题' in text and '导出期间再修改' not in text
shapes=r.findall('.//p:sp',n); match=[s for s in shapes if s.find('p:nvSpPr/p:cNvPr',n).get('name')=='title'];assert len(match)==1
assert int(match[0].find('p:spPr/a:xfrm/a:off',n).get('x'))==140*9525
assert len(r.findall('.//p:pic',n))==0
print(json.dumps({'editableText':text,'leftEmu':140*9525,'nativeShapeCount':len(shapes)}))`,receipt.deckPath],{encoding:'utf8'});
 assert.ok(JSON.parse(output).nativeShapeCount>=2);
 assert.equal(store.read('fixture').revision,3);assert.equal(store.read('fixture',1).documentHash,first.documentHash);
 await assert.rejects(()=>exportEditableProposal({store,id:'fixture',revision:2,outputRoot:root,format:'key'}),{code:'DRAFT_EXPORT_FORMAT_UNSUPPORTED'});
 const before=await fs.readFile(receipt.deckPath);await fs.writeFile(second.input.brand.font.files[0].file,'changed');
 await assert.rejects(()=>exportEditableProposal({store,id:'fixture',revision:2,outputRoot:root}),{code:'DRAFT_RESOURCE_CHANGED'});
 assert.deepEqual(await fs.readFile(receipt.deckPath),before);store.close();
 console.log(JSON.stringify({root,receipt,xml:JSON.parse(output)}));
});
test('image remains an editable image and separate connections cannot overwrite',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'editable-image-test-'));
 if(process.env.KEEP_EDITABLE_TEST_OUTPUT!=='1')t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const {createCanvas}=await import('@napi-rs/canvas');const canvas=createCanvas(64,32);const ctx=canvas.getContext('2d');ctx.fillStyle='#123456';ctx.fillRect(0,0,64,32);
 const image=path.join(root,'image.png');await fs.writeFile(image,canvas.toBuffer('image/png'));
 const config={databasePath:path.join(root,'draft.sqlite'),resourceRoot:path.join(root,'resources')};const one=await openEditableProposalStore(config),two=await openEditableProposalStore(config);
 const source=fixture();source.input.assets.photo={file:image,source:{type:'synthetic'}};source.plan.slides[0].elements.push({id:'photo',type:'image',assetId:'photo',x:700,y:300,w:100,h:100,fit:'cover'});source.plan.slides[0].notes=['Original source note'];source.plan.slides[0].elements[0].lineSpacing=1.4;await one.create(source);
 const edit=request('first',1,'图片与文字独立');one.save('fixture',edit);
 assert.throws(()=>two.save('fixture',request('other',1,'旧客户端')), {code:'DRAFT_REVISION_CONFLICT'});
 assert.deepEqual(two.save('fixture',edit),one.read('fixture',2));
 assert.throws(()=>one.save('fixture',{commandId:'source-edit',expectedRevision:2,changes:[{slideId:'cover',elementId:'title',values:{contentRefs:['invented']}}]}),{code:'DRAFT_FIELD_NOT_EDITABLE'});
 for(const values of [{size:24},{color:'#FF0000'},{lineSpacing:1.4}]) assert.throws(()=>one.save('fixture',{commandId:'image-invalid-field',expectedRevision:2,changes:[{slideId:'cover',elementId:'photo',values}]}),{code:'DRAFT_FIELD_NOT_EDITABLE'});
 const receipt=await exportEditableProposal({store:two,id:'fixture',revision:2,outputRoot:path.join(root,'exports')});
 execFileSync('python3',['-c',`import sys,zipfile,xml.etree.ElementTree as E
z=zipfile.ZipFile(sys.argv[1]); n={'p':'http://schemas.openxmlformats.org/presentationml/2006/main','a':'http://schemas.openxmlformats.org/drawingml/2006/main'}; r=E.fromstring(z.read('ppt/slides/slide1.xml'))
assert len(r.findall('.//p:pic',n))==1
assert r.find('.//a:srcRect',n) is not None
assert r.find('.//a:spcPct',n).get('val')=='140000'
notes=E.fromstring(z.read('ppt/notesSlides/notesSlide1.xml'));assert 'Original source note' in ''.join(t.text or '' for t in notes.findall('.//a:t',n))
assert '图片与文字独立' in ''.join(e.text or '' for e in r.findall('.//a:t',n))`,receipt.deckPath]);
 const bad=fixture();bad.id='chart';bad.plan.slides[0].elements.push({id:'chart',type:'chart',x:0,y:0,w:10,h:10});await assert.rejects(()=>one.create(bad),{code:'DRAFT_CHART_SOURCE_REQUIRED'});
 one.close();two.close();console.log(JSON.stringify({imageExport:receipt.deckPath}));
});
test('existing planner output imports without shape conversion and exports saved edits',async t=>{
 const main='/Users/marc/Documents/ChatGPT/调研agent/tools/auto-layout/';
 const {loadInput}=await import(main+'input.mjs');const {planDeck}=await import(main+'layout.mjs');
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'editable-planner-test-'));
 if(process.env.KEEP_EDITABLE_TEST_OUTPUT!=='1')t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const base='/Users/marc/Documents/ChatGPT/调研agent/';
 const input=await loadInput({ledger:base+'output/ppt/m6-integrated-v5/content-ledger.json',brand:base+'output/auto-layout/inputs/brand.json',assets:base+'output/auto-layout/inputs/assets.json'});const plan=planDeck(input,'editorial');
 const store=await openEditableProposalStore({databasePath:path.join(root,'draft.sqlite'),resourceRoot:path.join(root,'resources')});
 await store.create({id:'planner',plan,input,sourceBinding:{contentBinding:input.semantic.contentBinding??null,inputHashes:input.hashes}});
 const page=plan.slides[0],title=page.elements.find(e=>e.type==='text');
 const updated=store.save('planner',{commandId:'edit',expectedRevision:1,changes:[{slideId:page.id,elementId:title.id,values:{text:'Editable draft title'}}]});
 const result=await exportEditableProposal({store,id:'planner',revision:2,outputRoot:path.join(root,'exports')});
 execFileSync('python3',['-c',`import sys,zipfile,xml.etree.ElementTree as E,json
z=zipfile.ZipFile(sys.argv[1]);ns={'a':'http://schemas.openxmlformats.org/drawingml/2006/main'}
slides=[n for n in z.namelist() if n.startswith('ppt/slides/slide') and n.endswith('.xml')];assert len(slides)==int(sys.argv[2]);assert 'Editable draft title' in z.read('ppt/slides/slide1.xml').decode()
notes=E.fromstring(z.read('ppt/notesSlides/notesSlide1.xml'));text=''.join(n.text or '' for n in notes.findall('.//a:t',ns));assert 'UNREVIEWED WORKING DRAFT' in text
print(len(slides))`,result.deckPath,String(plan.slides.length)]);
 assert.deepEqual(updated.plan.slides[1],plan.slides[1]);store.close();console.log(JSON.stringify({plannerSlideCount:plan.slides.length,plannerDeck:result.deckPath}));
});

test('unsupported presentation fields reject both imports and edits without saving',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'editable-fields-test-'));
 if(process.env.KEEP_EDITABLE_TEST_OUTPUT!=='1')t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const store=await openEditableProposalStore({databasePath:path.join(root,'draft.sqlite'),resourceRoot:path.join(root,'resources')});
 await store.create(fixture());
 for(const [field,value] of [['fill','#FF0000'],['width',3],['fit','cover'],['rotation',45]]){
  assert.throws(()=>store.save('fixture',{commandId:'bad-field',expectedRevision:1,changes:[{slideId:'cover',elementId:'title',values:{[field]:value}}]}),{code:'DRAFT_FIELD_NOT_EDITABLE'});
  const input=fixture();input.id='invalid';input.plan.slides[0].elements[0][field]=value;
  await assert.rejects(()=>store.create(input),{code:'DRAFT_ELEMENT_FIELD_UNSUPPORTED'});
 }
 for(const [field,value] of [['size',24],['color','#FF0000'],['lineSpacing',1.4]]){
  const input=fixture();input.id='image-invalid';input.plan.slides[0].elements=[{id:'photo',type:'image',assetId:'photo',x:0,y:0,w:100,h:100,[field]:value}];
  await assert.rejects(()=>store.create(input),{code:'DRAFT_ELEMENT_FIELD_UNSUPPORTED'});
 }
 assert.equal(store.read('fixture').revision,1);
 assert.throws(()=>store.read('invalid'),{code:'DRAFT_NOT_FOUND'});store.close();
});
