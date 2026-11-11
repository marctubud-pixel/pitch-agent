import {isDeepStrictEqual as equal} from 'node:util';
const roles=['content','visual','brand','user','communication'];
const present=value=>({state:'present',value});
const need=(value,code)=>{if(!value)throw Object.assign(Error(code),{code});};
export function deriveFinalMaterialDuties({trusted,catalog,native,materials}){
 const {contract,source}=trusted,manuscript=contract.manuscript;
 need(Array.isArray(materials)&&materials.length>0&&new Set(materials.map(m=>m.identity)).size===materials.length,'FINAL_MATERIAL_INVENTORY_REQUIRED');
 const manuscriptAddress=pointer=>({domain:'manuscript',artifactId:contract.artifactId,contentHash:trusted.contentHash,manuscriptHash:contract.manuscriptHash,pointer});
 const memberAddress=(collection,index,key)=>({domain:'effective_source_member',rootJobId:contract.rootJobId,sourceHash:source.sourceHash,collection,memberId:source[collection][index][key],memberIndex:index,pointer:`/${collection}/${index}`});
 const cells=materials.map(material=>{
  const file=material.file?.value,dimensions=material.dimensions?.value;
  need(material.file?.state==='present'&&material.dimensions?.state==='present'&&dimensions.boundSha256===file.sha256&&dimensions.boundBytes===file.bytes,'FINAL_MATERIAL_CORRESPONDENCE_REQUIRED');
  const evidence=[{domain:'visual_asset',imageId:material.identity,sha256:file.sha256,originalPath:file.originalPath}],placements=[];
  if(material.kind==='source_image'){
   const i=source.images.findIndex(row=>row.imageId===material.identity);
   need(i>=0&&equal(source.images[i],material.sourceRow)&&material.sourceRow.sha256===file.sha256&&material.sourceRow.byteLength===file.bytes,'FINAL_SOURCE_IMAGE_CHANGED');
   evidence.push(memberAddress('images',i,'imageId'));
  }else {
   need(material.kind==='native_mockup'&&material.nativeAssets?.length>0,'FINAL_MOCKUP_ORIGINAL_REQUIRED');
   const resource=native.assetsResource.value.parsed.assets[material.identity],aperture=resource?.aperture;
   need(resource?.role==='mockup'&&aperture&&['x','y','w','h'].every(k=>Number.isFinite(aperture[k])&&aperture[k]>=0&&aperture[k]<=1)&&aperture.w>0&&aperture.h>0&&aperture.x+aperture.w<=1&&aperture.y+aperture.h<=1,'FINAL_MOCKUP_RESOURCE_CHANGED');
   const applications=Object.entries(native.assetsResource.value.parsed.assets).filter(([,r])=>r.application?.mockupId===material.identity);
   need(applications.length>0&&material.applications?.length===applications.length,'FINAL_MOCKUP_APPLICATION_REQUIRED');
   for(const [applicationId,member] of applications){
    const retained=material.applications.find(a=>a.applicationId===applicationId);
    need(member.application.kind==='rectangular-aperture'&&member.application.purpose===resource.purpose&&retained&&equal(retained.resourceMember,member)&&retained.observations.length>0&&retained.observations.every(o=>o.assetId===applicationId&&equal(o.resourceMember,member)&&o.file.sha256===o.descriptor.sha256&&o.file.bytes===o.descriptor.byteLength&&o.dimensions.value.boundSha256===o.file.sha256),'FINAL_MOCKUP_APPLICATION_CHANGED');
   }
  }
  for(const edition of native.editions){
   const lm=edition.layoutManifest.raw;
   need(Array.isArray(lm.slides)&&Array.isArray(lm.placements),'FINAL_PLACEMENT_REQUIRED');
   for(const [slideIndex,slide] of lm.slides.entries())for(const [elementIndex,element] of slide.elements.entries()){
    const refs=element.contentRefs,uses=refs?.imageIds?.includes(material.identity)||element.assetId===material.identity;
    if(!uses)continue;
    need(refs&&refs.imageIds?.includes(material.identity),'FINAL_MATERIAL_PLACEMENT_CHANGED');
    const expected={intentId:slide.originId,slideId:slide.id,elementId:element.id,occurrenceId:element.occurrenceId,...refs};
    need(lm.placements.filter(p=>equal(p,expected)).length===1,'FINAL_MATERIAL_PLACEMENT_CHANGED');
    const pageIndex=manuscript.pageIntents.findIndex(p=>p.id===slide.originId);
    need(pageIndex>=0,'FINAL_MATERIAL_PLACEMENT_CHANGED');
    const resource=lm.imageResources?.[material.identity];
    need(resource&&resource.sha256===file.sha256&&resource.byteLength===file.bytes&&resource.width===dimensions.width&&resource.height===dimensions.height,'FINAL_NATIVE_MATERIAL_CHANGED');
    if(material.kind==='native_mockup'){
     const original=material.nativeAssets.filter(a=>a.editionAttemptId===edition.originalAttemptId&&a.assetId===material.identity);
     need(original.length===1&&equal(original[0].descriptor,resource)&&equal(original[0].resourceMember,native.assetsResource.value.parsed.assets[material.identity]),'FINAL_MOCKUP_RESOURCE_CHANGED');
    }
    const nativeAddress={domain:'native_manifest',editionAttemptId:edition.originalAttemptId,manifestSha256:edition.layoutManifest.sha256,pointer:`/slides/${slideIndex}/elements/${elementIndex}`};
    evidence.push(nativeAddress,manuscriptAddress(`/pageIntents/${pageIndex}`));placements.push([edition.originalAttemptId,element.occurrenceId]);
    for(const originId of new Set([...(refs.claimOrigins??[]),...(refs.obligationOrigins??[])])){
     const index=source.obligations.findIndex(o=>o.originId===originId);need(index>=0,'FINAL_MATERIAL_OBLIGATION_CHANGED');evidence.push(memberAddress('obligations',index,'originId'));
    }
    for(const relation of refs.materialPlacements??[]){
     const clause=manuscript.clausePlacements?.[relation.placementIndex];
     need(clause?.clauseId===relation.clauseId&&equal(clause.occurrenceScopeKeys,relation.occurrenceScopeKeys)&&clause.pageIntentIds.includes(slide.originId),'FINAL_MATERIAL_PLACEMENT_CHANGED');
     evidence.push(manuscriptAddress(`/clausePlacements/${relation.placementIndex}`));
     const row=catalog.rows.find(row=>row.originId===relation.clauseId);need(row&&catalog.entries.some(e=>equal(e.location,row.derived)),'FINAL_MATERIAL_LOCATION_REQUIRED');evidence.push({domain:'content_location',location:row.derived});
    }
   }
  }
  need(material.kind==='source_image'||placements.length>0,'FINAL_MOCKUP_APPLICATION_REQUIRED');
  return {materialIdentity:material.identity,decision:present({required:true,evidence:[...new Map(evidence.map(a=>[JSON.stringify(a),a])).values()]}),reason:placements.length?`Inspect exact original material and all ${placements.length} retained native placement occurrences.`:'Inspect original source inventory; no placement in any current native edition.'};
 });
 return roles.map(role=>({role,applicability:present(structuredClone(cells))}));
}
