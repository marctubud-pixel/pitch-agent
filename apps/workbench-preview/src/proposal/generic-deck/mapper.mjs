import {semanticProjection} from './semantic.mjs';
import {hashBytes,inspectProposalDeckInput} from './input.ts';
const enc=new TextEncoder(),fail=(code,target)=>{throw Object.assign(Error(`${code}: ${target}`),{code,target});};
const need=(ok,code,target)=>{if(!ok)fail(code,target);};
function known(body,keys,slot){need(body&&typeof body==='object'&&!Array.isArray(body),'MAPPER_SOURCE_REQUIRED',slot);for(const key of Object.keys(body))need(keys.includes(key),'MAPPER_UNSUPPORTED_FIELD',slot+'.'+key);}
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
const same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
function claims(body,slot){need(Array.isArray(body.claims)&&body.claims.every(c=>typeof c==='string'&&c.trim()||c&&typeof c==='object'&&!Array.isArray(c)&&typeof c.text==='string'&&c.text.trim()),'MAPPER_CLAIM_SHAPE_REQUIRED',slot);}
const sha=text=>hashBytes(enc.encode(text));
const ptr=key=>String(key).replaceAll('~','~0').replaceAll('/','~1');
/** Index literal JSON value tokens, including escaped UTF8 source spans, without rewriting source. */
export function literalIndex(text){
 JSON.parse(text);let i=0,byte=0;const leaves=[];
 function step(){const cp=text.codePointAt(i);i+=cp>65535?2:1;byte+=cp<=127?1:cp<=2047?2:cp<=65535?3:4;}
 function white(){while(/\s/.test(text[i]??'')&&i<text.length)step();}
 function string(){const start=i,byteStart=byte;step();while(i<text.length){if(text[i]==='"'){step();return {value:JSON.parse(text.slice(start,i)),start:byteStart,end:byte,token:text.slice(start,i)};}if(text[i]==='\\'){step();step();}else step();}fail('JSON_TOKEN_UNTERMINATED',i);}
 function value(path){white();if(text[i]==='{'){step();white();if(text[i]==='}'){step();return;}while(true){const key=string().value;white();step();value(path+'/'+ptr(key));white();if(text[i]==='}'){step();break;}step();white();}}else if(text[i]==='['){step();white();if(text[i]===']'){step();return;}let n=0;while(true){value(path+'/'+n++);white();if(text[i]===']'){step();break;}step();}}else if(text[i]==='"'){leaves.push({pointer:path,...string()});}else{while(i<text.length&&!/[\s,}\]]/.test(text[i]))step();}}
 value('');return leaves;
}
function parsed(original,slot){need(original&&typeof original.originalText==='string','MAPPER_SOURCE_REQUIRED',slot);return JSON.parse(original.originalText);}
async function original(source,slot){need(source&&typeof source.originalText==='string'&&source.originalText.trim(),'MAPPER_SOURCE_REQUIRED',slot);need(typeof (slot==='task'?source.taskCardId:source.artifactId)==='string','MAPPER_IDENTITY_REQUIRED',slot);need(await sha(source.originalText)===source.sha256,'MAPPER_SOURCE_BYTES_CHANGED',slot);if(source.bytes!==undefined)need(enc.encode(source.originalText).length===source.bytes,'MAPPER_SOURCE_BYTES_CHANGED',slot);return {identity:source.artifactId??source.taskCardId,sha256:source.sha256,bytes:enc.encode(source.originalText).length,originalText:source.originalText};}
function projectOriginals(sourceOriginals,directionIds){
 const coverage=[];for(const [stage,body] of Object.entries(sourceOriginals))for(const leaf of literalIndex(body.originalText))coverage.push({stage,pointer:leaf.pointer,value:leaf.value,visible:false,archived:true,sourceSha256:body.sha256,byteSpan:{start:leaf.start,end:leaf.end,token:leaf.token}});
 return {projection:semanticProjection(sourceOriginals,coverage,directionIds),coverage};
}
/** Pure deterministic projection only. Checked input owns every body, qualifier, heading and record. */
export function deriveDeckProjection(input){return projectOriginals(Object.fromEntries(Object.entries(input.sources).filter(([,source])=>source!==null).map(([stage,source])=>[stage,source.original])),input.directionIds);}
export async function mapNativeSources(diagnostic){
 diagnostic=structuredClone(diagnostic);
 need(diagnostic&&['sources_read','rejected'].includes(diagnostic.kind),'MAPPER_DIAGNOSTIC_REQUIRED','kind');
 const snapshot=diagnostic.kind==='rejected'?diagnostic.verifiedPrefix:diagnostic;
 need(snapshot?.sources&&snapshot.identity,'MAPPER_SOURCE_REQUIRED','five sources');
 const id=snapshot.identity,projectId=id.projectId,taskCardId=id.taskCardId,method=id.method;
 need(typeof projectId==='string'&&typeof taskCardId==='string'&&Number.isSafeInteger(id.policyVersion),'MAPPER_IDENTITY_REQUIRED','identity');
 const native=snapshot.sources,sourceOriginals={brief:await original(native.task,'task'),research:await original(native.research,'research'),strategy:await original(native.simple,'simple'),copy:await original(native.copy,'copy')};
 const task=parsed(native.task,'task');need(task.id===taskCardId&&typeof task.brief==='string','MAPPER_TASK_CHANGED','task');
 const brief=JSON.parse(task.brief);need(brief.format==='proposal-workbench-brief-v1','MAPPER_TYPED_TASK_REQUIRED','brief');
 const rawRequirements=brief.fields?.visualRequirements;need(Array.isArray(rawRequirements)&&rawRequirements.length>0,'MAPPER_TYPED_VIEWS_REQUIRED','task');
 const requirements=rawRequirements.map(r=>{need(r&&Array.isArray(r.views)&&r.views.every(v=>typeof v==='string'),'MAPPER_TYPED_VIEWS_REQUIRED','views');return {kind:r.kind,views:r.views.map(v=>v.trim()).filter(Boolean)};});
 const taskContainer=sourceOriginals.brief;sourceOriginals.brief={identity:taskCardId+'#/brief@'+taskContainer.sha256,sha256:await sha(task.brief),bytes:enc.encode(task.brief).length,originalText:task.brief};
 const research=parsed(native.research,'research'),strategy=parsed(native.simple,'simple'),copy=parsed(native.copy,'copy');
 need(research.outputKind==='research_findings'&&research.status==='complete'&&research.researchContractVersion==='research-data-v2','MAPPER_RESEARCH_REQUIRED','research');
 known(research,['outputKind','status','title','summary','sections','claims','gaps','limitations','evidenceClassifications','researchContractVersion','chartData','quantitativeClaims'],'research');
 need(Array.isArray(research.quantitativeClaims),'MAPPER_TYPED_RESEARCH_VIEW_REQUIRED','quantitativeClaims');
 if(research.chartData===null)need(research.quantitativeClaims.length===0,'MAPPER_TYPED_RESEARCH_VIEW_REQUIRED','null chartData');
 else {need(research.chartData?.schema==='chart-data-v1'&&Array.isArray(research.chartData.charts)&&research.chartData.charts.length>0,'MAPPER_TYPED_RESEARCH_VIEW_REQUIRED','chartData');need(research.quantitativeClaims.length===research.chartData.charts.length&&research.chartData.charts.every(c=>research.quantitativeClaims.filter(q=>q.chartId===c.chartId&&research.claims?.[q.claimIndex]?.kind==='fact').length===1),'MAPPER_TYPED_RESEARCH_VIEW_REQUIRED','native chart claim bindings');}
 known(strategy,['strategyContractVersion','strategyBasisHash','outputKind','status','title','summary','strategy','gaps','limitations'],'simple');
 known(copy,['outputKind','status','title','summary','sections','claims','gaps','limitations','directions'],'copy');
 need(strategy.outputKind==='strategy'&&strategy.strategyContractVersion==='proposal-simple-strategy-v1'&&strategy.status==='complete'&&Array.isArray(strategy.strategy?.researchConclusions)&&strategy.strategy.researchConclusions.length&&strategy.strategy.intersection&&strategy.strategy.focus,'MAPPER_SIMPLE_REQUIRED','three blocks');
 need(copy.status==='complete'&&copy.outputKind==='copy'&&Array.isArray(copy.directions)&&copy.directions.length===3,'MAPPER_COPY_REQUIRED','copy');
 const directionIds=copy.directions.map(d=>d.id);need(directionIds.every(id=>typeof id==='string'&&id)&&new Set(directionIds).size===3,'MAPPER_DIRECTIONS_REQUIRED','copy');
 claims(research,'research');claims(copy,'copy');
 if(!native.visual)return {kind:'missing_B',authority:'none',input:null,...projectOriginals(sourceOriginals,directionIds),taskContainer,blockers:[{code:'MAPPER_B_FINAL_REQUIRED',target:'visual'}]};
 sourceOriginals.visual=await original(native.visual,'visual');const visual=parsed(native.visual,'visual');
 known(visual,['protocol','sourceHash','planHash','directions','sourceImages','referenceQualifications','refinementHandoffs'],'visual');
 need(visual.protocol==='final-visual-v1'&&Array.isArray(visual.directions)&&visual.directions.length===3,'MAPPER_B_REQUIRED','visual');
 need(Array.isArray(diagnostic.typedViews)&&same(diagnostic.typedViews,requirements),'MAPPER_TYPED_VIEWS_CHANGED','native/task');
 need(Array.isArray(diagnostic.directionIds)&&new Set(visual.directions.map(d=>d.directionId)).size===3&&same([...diagnostic.directionIds].sort(),[...directionIds].sort()),'MAPPER_DIRECTIONS_REQUIRED','visual/copy');
 need(Array.isArray(diagnostic.targets)&&Array.isArray(diagnostic.images),'MAPPER_TARGET_REQUIRED','native targets/images');
 const images=[];for(const d of visual.directions){claims(d,'visual/'+d.directionId);need(directionIds.includes(d.directionId)&&same(d.approvedCopy,copy.directions.find(c=>c.id===d.directionId)),'MAPPER_COPY_CHANGED',d.directionId);need(Array.isArray(d.targets)&&d.targets.length>0,'MAPPER_TARGET_REQUIRED',d.directionId);
  for(const target of d.targets){const declared=diagnostic.targets?.filter(t=>t.targetId===target.targetId&&t.directionId===d.directionId);need(declared?.length===1&&same(declared[0],Object.fromEntries(Object.entries(target).filter(([k])=>k!=='plan'))),'MAPPER_TARGET_CHANGED',target.targetId);const found=diagnostic.images?.filter(i=>i.imageId===target.imageId);need(found?.length===1,'MAPPER_IMAGE_REQUIRED',target.imageId);const media=found[0];need(media.sha256===target.sha256&&media.bytes===target.byteLength&&media.width===target.width&&media.height===target.height&&media.mediaType===target.mediaType,'MAPPER_IMAGE_CHANGED',target.imageId);
   images.push({imageId:target.imageId,directionId:d.directionId,targetId:target.targetId,kind:target.kind,requiredViews:target.requiredViews,visualArtifactId:native.visual.artifactId,visualContentHash:native.visual.sha256,originalLocator:media.locator,sha256:media.sha256,bytes:media.bytes,mediaType:media.mediaType,width:media.width,height:media.height});
  }
 }
 need(images.length===diagnostic.targets.length,'MAPPER_TARGET_CHANGED','complete target set');
 const sources=Object.fromEntries(Object.entries(sourceOriginals).map(([stage,original])=>[stage,{artifactId:stage==='brief'?taskCardId:stage==='strategy'?native.simple.artifactId:native[stage].artifactId,projectId,taskCardId,original}]));
 const input={protocol:'proposal-deck-input-v2',projectId,taskCardId,policyVersion:id.policyVersion,proposalType:brief.fields?.proposalType??brief.metadata?.type,researchMethod:method,sources,directionIds,images,visualRequirements:requirements,prelayoutCheck:null,relation:{kind:'not_supplied'}};
 const inspection=await inspectProposalDeckInput(input,method);need(inspection.gaps.every(g=>g.code==='missing_prelayout_check'),'MAPPER_INPUT_INCOMPLETE',JSON.stringify(inspection.gaps));
 const {projection,coverage}=deriveDeckProjection(inspection.input),mappingSha256=await sha(JSON.stringify({inputSha256:inspection.inputSha256,sourceIdentity:id,projection}));
 return {kind:'mapped',authority:'none',input:inspection.input,inputSha256:inspection.inputSha256,mappingSha256,sourceIdentity:structuredClone(id),projection,coverage,taskContainer,blockers:inspection.gaps};
}
