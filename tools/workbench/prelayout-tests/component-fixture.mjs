import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {mapNativeSources} from '../../../apps/workbench-preview/src/proposal/generic-deck/mapper.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
export async function componentFixture(type='packaging'){
 const d=JSON.parse(await readFile(new URL('./source-prefix.json',import.meta.url))),s=d.verifiedPrefix,copy=JSON.parse(s.sources.copy.originalText),task=JSON.parse(s.sources.task.originalText),brief=JSON.parse(task.brief);
 const views=type==='packaging'?['front','three_quarter','bottle_box','detail']:['master','adaptation'];
 brief.fields.proposalType=type;brief.fields.visualRequirements=[{kind:type,views}];task.brief=JSON.stringify(brief);s.sources.task.originalText=JSON.stringify(task);s.sources.task.sha256=sha(s.sources.task.originalText);
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jGWQAAAAASUVORK5CYII=','base64'),targets=[],images=[];
 const directions=copy.directions.map((c,n)=>{const target={targetId:'component-target-'+n,directionId:c.id,kind:type,requiredViews:views,imageId:'component-image-'+n,sha256:sha(png),mediaType:'image/png',byteLength:png.length,width:1,height:1};targets.push(target);images.push({imageId:target.imageId,sha256:target.sha256,bytes:png.length,mediaType:'image/png',width:1,height:1,locator:'component-only:no-native-original'});return {directionId:c.id,approvedCopy:c,explanation:'Component mapping literal only; not a completed native B.',presentationIntent:'Preserve the declared target/view fields.',claims:[],limitations:['Component mapping fixture; no native source qualification or visual judgment.'],targets:[{...target,plan:{componentOnly:true}}]};});
 const originalText=JSON.stringify({protocol:'final-visual-v1',sourceHash:'component-only',planHash:'component-only',directions,sourceImages:[],referenceQualifications:[],refinementHandoffs:[]});
 s.sources.visual={artifactId:'component-only-B',sha256:sha(originalText),bytes:Buffer.byteLength(originalText),originalText};
 const diagnostic={kind:'sources_read',physicalOriginalsVerified:false,identity:s.identity,sources:s.sources,typedViews:brief.fields.visualRequirements,directionIds:copy.directions.map(c=>c.id),targets,images};
 const mapped=await mapNativeSources(diagnostic);if(mapped.kind!=='mapped')throw Error('COMPONENT_MAPPING_MISSING');
 return {diagnostic,mapped,media:Object.fromEntries(images.map(i=>[i.imageId,[...png]])),method:mapped.input.researchMethod};
}
