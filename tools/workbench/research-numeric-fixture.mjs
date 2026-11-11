import {diskReceipt} from './selected-stage-fixture.mjs';
import {mkdtemp,rm,writeFile,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {engineeringFixture} from '../auto-layout/native-charts/chart-fixture.mjs';
import {researchChartSourceBinding} from './research-chart-data.mjs';
import {openStore} from './store.mjs';
import {createExecutor} from './executor.mjs';
import {output,source as qualitativeSource,bindings as initialBindings,human} from './research-operator-fixture.mjs';
import {syntheticStrategyV2} from './strategy-fixtures.mjs';
import {syntheticOwnerOutput,panelFixtureOutput,syntheticCopy} from './owner-edge-fixtures.mjs';
import {STRATEGY_CREATIVE_PROTOCOL} from './creative-panel.mjs';
export const hash=x=>createHash('sha256').update(x).digest('hex');
export const quoted=request=>JSON.parse(request.prompt.slice(request.prompt.indexOf('UNTRUSTED_JSON_DATA\n')+20,request.prompt.lastIndexOf('\nEND_UNTRUSTED_JSON_DATA')));
export async function numericFixture({swap=false,negative=false,budget=false,compact=false,retainRoot=false,transform}={}){
 const root=await realpath(await mkdtemp(join(tmpdir(),'numeric-research-'))),store=openStore(join(root,'db')),calls=[];
 if(retainRoot)console.log(JSON.stringify({ownedNumericRoot:root,pid:process.pid}));
 const fixture=budget?maximumNumericalFixture():compact?compactNumericalFixture():engineeringFixture(),source={...qualitativeSource,text:fixture.sources[0].text+'\n'+qualitativeSource.text},binding=researchChartSourceBinding([source]);
 const raw=structuredClone(fixture.raw);
 const remap=v=>{if(!v||typeof v!=='object')return;if(v.indexing==='utf16'){v.sourceId=binding.mapping[0].chartSourceId;v.sourceHash=hash(source.text);}Object.values(v).forEach(remap);};remap(raw);
 if(swap)[raw.charts[0].categories[0].label,raw.charts[0].categories[1].label]=[raw.charts[0].categories[1].label,raw.charts[0].categories[0].label];
 const provider={model:'synthetic',execute:async request=>{
  const input=quoted(request);calls.push({request,input});
  const fixed=Object.fromEntries(Object.entries(request.outputSchema.properties).filter(([,v])=>v.enum).map(([k,v])=>[k,v.enum[0]]));
  let out;
  if(input.strategyBasis)out=syntheticStrategyV2(input);
  else if(input.envelope)out=syntheticOwnerOutput(input);
  else if(input.phase)out=panelFixtureOutput(input);
  else if(request.outputSchema.properties.outputKind?.enum[0]==='copy')out=syntheticCopy;
  else if(input.claimManifest&&input.content.researchContractVersion!=='research-data-v2')out={...fixed,quantitativeResults:[],results:[],wholeTextScan:{status:'complete',creativeClaimKeys:input.claimManifest.filter(c=>c.claim.kind==='creative').map(c=>c.claimKey),omissions:[],mismatchedCreative:[],operationalAssertions:[]},limitations:['Synthetic review only.']};
  else {
   out=output(request);
   if(request.outputSchema.properties.researchContractVersion){out={...out,chartData:raw,quantitativeClaims:raw.charts.map(c=>({chartId:c.chartId,claimIndex:1})),claims:[...out.claims,{text:'The supplied source reports these synthetic matrices, without establishing business truth.',kind:'fact',evidenceRefs:[source.id],limitations:['Source-relative synthetic engineering data only.']}]};}
   if(input.correctionInput&&request.outputSchema.properties.researchContractVersion){
    out.chartData=structuredClone(raw);if(swap)[out.chartData.charts[0].categories[0].label,out.chartData.charts[0].categories[1].label]=[out.chartData.charts[0].categories[1].label,out.chartData.charts[0].categories[0].label];
    out.summary+=' Revised the category association against the original source.';
    out.revisionResponses=input.correctionInput.sources.flatMap(s=>s.findings).map(f=>({findingKey:f.key,action:'applied',explanation:'Restored the original category-to-value association; independent review is still required.',outputLocations:[{location:'/chartData/charts/0/categories/0/label/text',quote:out.chartData.charts[0].categories[0].label.text}]}));
   }
   if(input.claimManifest){
    const wrongAssociation=swap&&input.content.chartData.charts[0].categories[0].label.text!==fixture.raw.charts[0].categories[0].label.text;
    for(const result of out.results)for(const citation of result.citations){citation.textHash=hash(source.text);citation.quote=source.text;}
    for(const result of out.quantitativeResults){const assertion=input.quantitativeManifest.find(a=>a.assertionKey===result.assertionKey);if(negative||wrongAssociation&&assertion.chartId==='column-percent'&&assertion.kind==='cell'){result.outcome='unsupported';result.rationale='Category-to-value association contradicts the original engineering table order.';result.limitations=['Literal presence does not support the claimed category association.'];}}
   }
   if(out.sourceAssessments)out.sourceAssessments[0].textHash=hash(source.text);
  }
  const receipt={runId:request.runId,model:'synthetic',requestedModel:'synthetic',threadId:randomUUID(),inputPacketHash:hash(JSON.stringify({runId:request.runId,model:'synthetic',prompt:request.prompt,outputSchema:request.outputSchema})),exitCode:0,responseText:JSON.stringify(out),parsedOutput:out,cost:null};
  return diskReceipt(root,request,transform?await transform(receipt,request):receipt);
 }};
 const bindings={...initialBindings,...Object.fromEntries(['copy','creative_score_strategy','creative_opposition_strategy','creative_director'].map(role=>[role,{providerId:'numeric',model:'synthetic',role:role+'-lead'}]))};
 const providers=Object.fromEntries(['author','reviewer','strategist','numeric'].map(id=>[id,provider]));
 const calibration=join(root,'calibration');await writeFile(calibration,'synthetic-only');
 const creativeCalibrations=[{protocolVersion:STRATEGY_CREATIVE_PROTOCOL,stage:'strategy',role:'strategy',providerId:'numeric',model:'synthetic',evidenceRef:calibration,evidenceHash:hash('synthetic-only')}];
 const executor=createExecutor({store,rootDir:root,bindings,providers,creativeCalibrations,imageProvider:null});
 store.create({id:'p',name:'Numerical engineering only',brief:'Explore the supplied blue packaging example, without audience claims.',mode:'auto',humanGates:[]},human);
 store.command('p',{kind:'confirm-task-card',taskCardId:'p:scope:1',commandId:'confirm',expectedRevision:0},human);
 return {root,store,calls,source,raw,bindings,providers,creativeCalibrations,executor,close:async()=>{store.close();if(!retainRoot)await rm(root,{recursive:true,force:true});}};
}

export function maximumNumericalFixture(){
 let text='SYNTHETIC BUDGET TABLE ONLY\n';const spans=[];
 const bound=value=>{const start=text.length;text+=value+'\n';const evidence={sourceId:'fixture',sourceHash:'',indexing:'utf16',start,end:start+value.length,text:value};spans.push(evidence);return {text:value,evidence};};
 const charts=Array.from({length:8},(_,i)=>({chartId:`chart-${i}`,type:'bar',direction:'column',title:bound(`T${i}`),unit:{kind:'count',label:bound('count')},period:bound('2026'),population:bound('synthetic'),limitations:Array.from({length:16},(_,j)=>bound(`L${j}`)),categoryCount:25,seriesCount:1,categories:Array.from({length:25},(_,j)=>({categoryId:`c${j}`,label:bound(`C${j}`)})),series:[{seriesId:'s',name:bound('S'),values:Array.from({length:25},(_,j)=>{const value=String(j+1),b=bound(value);return {decimal:value,lexeme:value,conversion:'identity',evidence:b.evidence};})}],numberFormat:'0'}));
 const sha256=hash(text);spans.forEach(e=>e.sourceHash=sha256);return {raw:{schema:'chart-data-v1',charts},sources:[{sourceId:'fixture',text,sha256,kind:'synthetic-engineering-fixture'}]};
}

export function compactNumericalFixture(){
 let text='SYNTHETIC TABLE ONLY\n';const spans=[];
 const bound=value=>{const start=text.length;text+=value+'\n';const evidence={sourceId:'fixture',sourceHash:'',indexing:'utf16',start,end:start+value.length,text:value};spans.push(evidence);return {text:value,evidence};};
 const chart={chartId:'synthetic-counts',type:'bar',direction:'column',title:bound('Synthetic packaging counts'),unit:{kind:'count',label:bound('count')},period:bound('2026'),population:bound('Engineering observations'),limitations:[bound('Synthetic only. No consumer evidence.')],categoryCount:2,seriesCount:1,categories:['Blue','White'].map((v,i)=>({categoryId:`category-${i}`,label:bound(v)})),series:[{seriesId:'examples',name:bound('Examples'),values:['2','3'].map(v=>{const b=bound(v);return {decimal:v,lexeme:v,conversion:'identity',evidence:b.evidence};})}],numberFormat:'0'};
 const sha256=hash(text);spans.forEach(e=>e.sourceHash=sha256);return {raw:{schema:'chart-data-v1',charts:[chart]},sources:[{sourceId:'fixture',text,sha256,kind:'synthetic-engineering-fixture'}]};
}
