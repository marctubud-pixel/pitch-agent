import fs from 'node:fs/promises';
import path from 'node:path';
import {createCanvas} from '@napi-rs/canvas';
import {hash,SEMANTIC_SCHEMA,obligationText} from './semantic-input.mjs';

export async function createControlledFixture(directory){
  await fs.mkdir(directory,{recursive:true});
  const obligations=[],images=[],assets={},blocks=[],intents=[],directions=[],visualDirections=[];
  const add=(artifactId,pointer,owner,kind,value)=>{const o={originId:artifactId+pointer,artifactId,pointer,owner,kind,value};obligations.push(o);return o;};
  const block=o=>{const id=`block-${blocks.length+1}`;blocks.push({id,kind:'source',text:obligationText(o),originIds:[o.originId]});return id;};
  const relations=[];
  const relate=(o,bids,iids,intent)=>relations.push({originId:o.originId,value:o.value,blockIds:bids,imageIds:iids,pageIntentIds:[intent]});
  const premise=add('controlled-strategy','/summary','strategy-lead','text','Controlled manuscript. This fixture tests transport and editable composition only.');
  const pb=block(premise);intents.push({id:'opening',centralMessage:'A controlled complete proposal',heroImageId:null,blockIds:[pb],imageIds:[],allowedSplitAfterBlockIds:[]});relate(premise,[pb],[],'opening');
  const sources=[{id:'internal-brief',type:'internal_requirement',title:'Controlled brief',locator:'fixture://controlled/brief',text:'The two views are illustrative geometry only.'}];
  const sourceOb=add('controlled-copy','/sources/internal-brief','copy-lead','source',sources[0]);
  const sb=block(sourceOb);intents.push({id:'source-note',centralMessage:'The source is an internal test brief',heroImageId:null,blockIds:[sb],imageIds:[],allowedSplitAfterBlockIds:[]});relate(sourceOb,[sb],[],'source-note');
  const claim={text:'The brief requests two views.',kind:'fact',evidenceRefs:['internal-brief'],limitations:['Controlled fixture only.']};
  const co=add('controlled-copy','/claims/0','copy-lead','claim',claim),cb=block(co);intents.push({id:'claim-note',centralMessage:'The claim retains its original scope',heroImageId:null,blockIds:[cb],imageIds:[],allowedSplitAfterBlockIds:[]});relate(co,[cb],[],'claim-note');
  const directionIds=['direction:cedar-41','private/amber','proposal omega'];
  for(const [n,directionId]of directionIds.entries()){
    const approvedCopy={id:directionId,title:`Direction ${n+1}`,slogan:`Test proposal ${n+1}`,supportingCopy:'Controlled layout text.',creativeExplanation:'A geometric visual.',rationale:'A fixture comparison.',differentiation:`Variant ${n+1}.`};
    const copy=add('controlled-copy',`/directions/${n}`,'copy-lead','direction',approvedCopy),copyBlock=block(copy),copyIntent=`direction-copy-${n+1}`;
    intents.push({id:copyIntent,centralMessage:`Direction ${n+1} retains every approved line`,heroImageId:null,blockIds:[copyBlock],imageIds:[],allowedSplitAfterBlockIds:[]});relate(copy,[copyBlock],[],copyIntent);
    const targetIds=[];
    for(const view of ['front','back']){
      const imageId=`original/image/${n+1}/${view}`,file=path.join(directory,`view-${n+1}-${view}.png`),canvas=createCanvas(300,500),ctx=canvas.getContext('2d');
      ctx.fillStyle='#F6F3EC';ctx.fillRect(0,0,300,500);ctx.fillStyle=['#173C78','#67523C','#426056'][n];ctx.fillRect(60,70,180,350);ctx.strokeStyle='#C9A864';ctx.lineWidth=5;ctx.strokeRect(75,85,150,320);ctx.fillStyle='#FFFFFF';ctx.font='18px sans-serif';ctx.fillText('CONTROLLED',85,210);ctx.fillText(`VIEW ${n+1} ${view}`,85,240);ctx.font='12px sans-serif';ctx.fillText('Not real client artwork',85,275);
      const raw=canvas.toBuffer('image/png');await fs.writeFile(file,raw);
      const image={imageId,sha256:hash(raw),mediaType:'image/png',byteLength:raw.length,width:300,height:500};images.push(image);
      assets[imageId]={role:'packaging',file,source:{type:'controlled-test-asset',description:'Owner-authored geometric test asset. Not client approval, research or a real product.'},view,purpose:'approved-packaging-render'};targetIds.push(imageId);
    }
    const targets=targetIds.map((imageId,i)=>({...images.find(x=>x.imageId===imageId),targetId:`target-${n+1}-${i}`,view:i===0?'front':'back'}));
    const explanation='Editable proposal explanation.',presentationIntent='Compare both original views.',limitations=['Illustrative geometry, not a manufactured package.'];
    const d={directionId,approvedCopy,explanation,presentationIntent,claims:[claim],limitations,targets};visualDirections.push(d);directions.push({...d,rendererDirectionId:['A','B','C'][n]});
    const e=add('controlled-visual',`/directions/${directionId}/explanation`,'visual-lead','text',explanation),p=add('controlled-visual',`/directions/${directionId}/presentationIntent`,'visual-lead','text',presentationIntent),l=add('controlled-visual',`/directions/${directionId}/limitations/0`,'visual-lead','limitation',limitations[0]);
    const bids=[e,p,l].map(block),intent=`direction-views-${n+1}`;
    intents.push({id:intent,centralMessage:`Direction ${n+1} shows front and back`,heroImageId:targetIds[0],blockIds:bids,imageIds:targetIds,allowedSplitAfterBlockIds:[]});
    for(const [i,o]of [e,p,l].entries())relate(o,[bids[i]],targetIds,intent);
    for(const t of targets){const o=add('controlled-visual',`/targets/${t.targetId}`,'visual-lead','image',t);relate(o,[],[t.imageId],intent);}
  }
  const sourceBody={protocol:'complete-content-v1',projectId:'controlled-fixture-only',strategy:{artifactId:'controlled-strategy'},copy:{artifactId:'controlled-copy'},visual:{artifactId:'controlled-visual',payload:{directions:visualDirections}},directionMap:directionIds.map((sourceDirectionId,i)=>({sourceDirectionId,rendererDirectionId:['A','B','C'][i]})),sources,claims:[claim],obligations,images};
  const source={...sourceBody,sourceHash:hash(sourceBody)},manuscript={title:'Controlled proposal',narrativeBlocks:blocks,directions,claims:[claim],sources,visibleObligations:relations,pageIntents:intents,edits:[]};
  const ledger={schemaVersion:SEMANTIC_SCHEMA,contentBinding:{artifactId:'controlled-manuscript-only',manuscriptHash:hash(manuscript),sourceHash:source.sourceHash,authority:'No project authority. Controlled local fixture only.'},source,manuscript};
  const brand={name:'Controlled fixture',colors:{primary:'#173C78',accent:'#C9A864',paper:'#F6F3EC',ink:'#152B48',muted:'#59687A'},font:{family:'PingFang SC',files:['/Users/marc/Documents/ChatGPT/调研agent/output/ppt/m6-integrated-v5/build/PingFangSC-Regular.ttf','/Users/marc/Documents/ChatGPT/调研agent/output/ppt/m6-integrated-v5/build/PingFangSC-Semibold.ttf']},minBodySize:22};
  const files={ledger:path.join(directory,'ledger.json'),brand:path.join(directory,'brand.json'),assets:path.join(directory,'assets.json')};
  for(const [name,value]of Object.entries({ledger,brand,assets:{assets}}))await fs.writeFile(files[name],JSON.stringify(value,null,2)+'\n');
  return JSON.parse(JSON.stringify({files,ledger,brand,assets:{assets}}));
}
