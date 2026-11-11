import {referenceInputIdentity} from './reference-input-controller.mjs';
export function mountReferenceInputForm(root,{controller,action}={}){
 const document=root.ownerDocument;
 const add=(tag,text,parent=root)=>{const e=document.createElement(tag);if(text)e.textContent=text;parent.append(e);return e;};
 const labelled=(text,tag)=>{const label=add('label',text);return add(tag,null,label);};
 add('h3','补充或纠正你的视觉参考');add('p','先上传图片，再选择借鉴用途。登记不等于采纳，也不作为市场事实或审美通过。');
 const file=labelled('1. 上传本地参考图（PNG、JPEG，最多 8 MiB）','input');file.type='file';file.accept='image/png,image/jpeg';
 const upload=add('button','上传原图');upload.type='button';
 const original=labelled('2. 选择已登记原图','select'),direction=labelled('对应创意方向','select'),profile=labelled('借鉴范围','select');
 for(const [value,title]of [['direction','完整方向机制'],['composition_component','只借鉴构图'],['material_color_component','只借鉴材质与配色'],['style_component','只借鉴美术风格'],['viewpoint_scene_component','只借鉴视角或场景'],['carrier_component','只借鉴载体形式']]){const option=add('option',title,profile);option.value=value;}
 profile.value='composition_component';const note=labelled('具体借鉴什么，如何转化到本项目','textarea');note.maxLength=10000;note.rows=3;
 const submit=add('button','登记参考用途');submit.type='button';add('p','纠正已登记用途时，先载入并撤回旧用途，再明确登记修改后的用途；两步分别保存，不覆盖旧稿。');const material=labelled('选择要撤回或纠正的旧用途','select'),loadPurpose=add('button','载入用途，准备纠正');loadPurpose.type='button';const reason=labelled('撤回理由','textarea');reason.rows=2;reason.maxLength=10000;const withdraw=add('button','撤回所选旧用途');withdraw.type='button';const status=add('p','');status.setAttribute('role','status');
 let key=null,flow=null,disabled=true,refreshNeeded=false;
 const sourceKey=f=>JSON.stringify([f?.id,f?.projectId,f?.referenceRuntimeProfile,f?.referenceInput?.artifactId,f?.referenceInput?.copyContentHash]);
 const selections=(select,rows,placeholder)=>{const prior=select.value;select.replaceChildren();const first=add('option',placeholder,select);first.value='';for(const row of rows){const option=add('option',row.title,select);option.value=row.id;}select.value=rows.some(r=>r.id===prior)?prior:'';};
 function lock(){for(const element of [file,upload,original,direction,profile,note,submit,material,loadPurpose,reason,withdraw])element.disabled=disabled||refreshNeeded||!referenceInputIdentity(flow);}
 upload.onclick=()=>action(async()=>{const captured=key,result=await controller.upload(file.files?.[0]);if(captured===key&&sourceKey(result.flow)===key){original.value=result.imageId;file.value='';status.textContent='原图已登记。请填写借鉴方式，再登记用途。';}});
 submit.onclick=()=>{const selection={imageId:original.value,directionId:direction.value,profile:profile.value,borrowingNote:note.value},captured=key;return action(async()=>{await controller.register(selection);if(captured===key)status.textContent='参考用途已登记，等待搜集与评审；尚不代表采纳。';});};
 loadPurpose.onclick=()=>{const selected=flow?.referenceInput?.materials?.find(m=>m.id===material.value&&!m.removed);if(!selected)return;original.value=selected.imageId;direction.value=selected.directionId;profile.value=selected.applicabilityProfile;note.value=selected.borrowingNote;status.textContent='已载入旧用途。请填写撤回理由并先撤回，再确认修改后的用途并重新登记。';};
 withdraw.onclick=()=>{const selection={materialId:material.value,reason:reason.value},captured=key;return action(async()=>{await controller.withdraw(selection);if(captured===key){reason.value='';status.textContent='旧用途已撤回，原记录保留。若需纠正，请确认编辑后的用途并重新登记。';}});};
 root.hidden=true;
 return {
  update(next){flow=next;refreshNeeded=controller.observe?.(flow)===true;if(refreshNeeded)status.textContent='已提交，待刷新核对。请使用刷新流程，不要重新上传或登记。';const available=Boolean(referenceInputIdentity(flow));root.hidden=!available;if(!available){if(sourceKey(next)!==key){key=null;file.value='';note.value='';reason.value='';status.textContent='';}lock();return;}
   if(flow.referenceInput.kind==='reference_correction')status.textContent='当前只开放用途纠正；原流程状态仍保留，不代表参考通过。';
   const nextKey=sourceKey(flow);if(key!==nextKey){key=nextKey;file.value='';note.value='';reason.value='';profile.value='composition_component';original.value='';direction.value='';status.textContent='';}
   selections(original,(flow.referenceInput.registeredOriginals??[]).map(x=>({id:x.imageId,title:(x.originalFilename||x.imageId)+' · '+x.sha256.slice(0,10)})),'选择原图');
   selections(material,(flow.referenceInput.materials??[]).filter(m=>!m.removed&&m.provenance?.kind==='manual_supplied').map(m=>({id:m.id,title:m.directionId+' · '+m.id})),'选择旧用途');
   selections(direction,flow.referenceInput.directions.map(x=>({id:x.id,title:x.title})),'选择方向');lock();
  },
  setDisabled(value){disabled=Boolean(value);refreshNeeded=controller.observe?.(flow)===true;if(refreshNeeded)status.textContent='已提交，待刷新核对。请使用刷新流程，不要重新上传或登记。';lock();}
 };
}
