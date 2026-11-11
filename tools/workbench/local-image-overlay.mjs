const need=(ok,code)=>{if(!ok)throw Object.assign(Error(code),{code});};
// Managed-ID dispatch only. A missing/changed original is never retried against another root.
export function createLocalImageOverlay({inherited,freshStore}){
 need(Array.isArray(inherited)&&freshStore?.read&&freshStore.ingestGenerated,'LOCAL_IMAGE_OVERLAY_REQUIRED');
 const owners=new Map();for(const {imageIds,store} of inherited){need(Array.isArray(imageIds)&&store?.read,'LOCAL_IMAGE_OVERLAY_REQUIRED');for(const id of imageIds){need(typeof id==='string'&&!owners.has(id),'LOCAL_IMAGE_ROOT_ID_COLLISION');owners.set(id,store);}}
 return {read:request=>(owners.get(request.imageId)??freshStore).read(request),ingestGenerated:request=>freshStore.ingestGenerated(request)};
}
