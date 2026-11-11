import {createHash} from 'node:crypto';
import {isDeepStrictEqual as equal} from 'node:util';
const hash=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const need=(value,code)=>{if(!value)throw Object.assign(Error(code),{code});};
const text=value=>typeof value==='string'&&value.trim().length>0&&value.length<=20000;
function source(artifact,contentText){
 need(artifact?.stage==='copy'&&typeof contentText==='string'&&Buffer.byteLength(contentText)<=1024*1024&&hash(contentText)===artifact.contentHash,'LOCAL_COPY_TARGET_SOURCE_REQUIRED');
 const content=JSON.parse(contentText),directions=content.directions;
 need(Array.isArray(directions)&&directions.length===3&&directions.every(d=>text(d.id)&&d.id.length<=100)&&new Set(directions.map(d=>d.id)).size===3,'LOCAL_COPY_TARGET_DIRECTIONS_REQUIRED');return content;
}
export function copyDirectionOptions({artifact,contentText}){
 const content=source(artifact,contentText);
 need(content.directions.every(d=>text(d.title)&&text(d.slogan)),'LOCAL_COPY_TARGET_LABELS_REQUIRED');
 return {artifactId:artifact.id,contentHash:artifact.contentHash,directions:content.directions.map(({id,title,slogan})=>({id,title,slogan}))};
}
export function planCopyDirectionTarget({artifact,contentText,contribution}){
 need(contribution&&Object.keys(contribution).every(k=>['kind','directionId','text','intendedUse'].includes(k))&&contribution.kind==='copy_theme'&&text(contribution.text)&&text(contribution.intendedUse),'LOCAL_COPY_TARGET_INPUT_INVALID');
 need(text(contribution.directionId)&&contribution.directionId.length<=100,'LOCAL_COPY_TARGET_SELECTION_REQUIRED');
 const content=source(artifact,contentText),direction=content.directions.find(d=>d.id===contribution.directionId);need(direction,'LOCAL_COPY_TARGET_NOT_CURRENT');
 return {protocol:'local-copy-direction-target-v1',artifactId:artifact.id,contentHash:artifact.contentHash,directionId:direction.id,originalDirectionHash:hash(direction),themeText:contribution.text,intendedUse:contribution.intendedUse,origin:'human-preference-not-evidence',requiresIndependentReview:true,factualAuthority:false,semanticReviewVerified:false};
}
export function verifyCopyDirectionRewrite({artifact,contentText,contribution,target,revisedContent}){
 const before=source(artifact,contentText);need(equal(target,planCopyDirectionTarget({artifact,contentText,contribution})),'LOCAL_COPY_TARGET_CHANGED');
 const original=before.directions.find(d=>d.id===target.directionId);need(original&&hash(original)===target.originalDirectionHash,'LOCAL_COPY_TARGET_CHANGED');
 need(Array.isArray(revisedContent?.directions)&&equal(before.directions.map(d=>d.id),revisedContent.directions.map(d=>d.id)),'LOCAL_COPY_DIRECTION_SET_CHANGED');
 const rest=({directions,...value})=>value;need(equal(rest(before),rest(revisedContent)),'LOCAL_COPY_UNRELATED_CONTENT_CHANGED');
 const editable=new Set(['title','slogan','supportingCopy','creativeExplanation','rationale','differentiation']);
 for(const old of before.directions){const current=revisedContent.directions.find(d=>d.id===old.id);if(old.id!==target.directionId){need(equal(old,current),'LOCAL_COPY_OTHER_DIRECTION_CHANGED');continue;}
  const locked=value=>Object.fromEntries(Object.entries(value).filter(([key])=>!editable.has(key)));need(equal(locked(old),locked(current)),'LOCAL_COPY_DIRECTION_SOURCE_CHANGED');
  need(current.title===target.themeText&&current.slogan===target.themeText,'LOCAL_COPY_THEME_NOT_APPLIED');
  need(text(current.supportingCopy)&&text(current.creativeExplanation)&&text(current.rationale)&&text(current.differentiation),'LOCAL_COPY_THEME_EXPLANATION_REQUIRED');
 }
 return {directionId:target.directionId,themeIncorporated:true,scopeVerified:true,factualAuthority:false,semanticReviewVerified:false,released:false,approved:false};
}
