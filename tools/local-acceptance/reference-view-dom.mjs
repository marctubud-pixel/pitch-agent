export function renderReferenceReadView(root,flow){
 const document=root.ownerDocument,view=flow?.referenceReview,input=flow?.referenceInput;
 root.replaceChildren();root.hidden=!view&&!input;if(root.hidden)return;
 const add=(tag,text,parent=root)=>{const element=document.createElement(tag);element.textContent=text;parent.append(element);return element;};
 add('h3','参考图登记与评审记录');
 add('p','本地工程记录，不代表真实审美验收、用户研究或客户批准。');
 if(input){
  add('p','参考图收集前的人工参与节点。登记不等于采纳；本区域展示已保存记录。');
  const poolV2=flow.referenceRuntimeProfile==='local-reference-pool-v2';
  if(poolV2)add('p','本轮使用候选池：每方向最多 3 张不同原图、12 条借鉴用途。当前尚未封口计算补图库方案，不代表参考或审美通过。用途纠正分为撤回旧用途、登记新用途两步；旧记录保留。');
  for(const direction of input.directions??[]){
   const capacity=input.capacity?.find(row=>row.directionId===direction.id);
   add('p',direction.title+(capacity?` · 已登记 ${capacity.registeredDistinctImages} 张不同原图，原生上限 ${capacity.nativeMaximumDistinctImages} 张。`:''));
   if(!poolV2&&capacity?.potentialFixedLibraryCapacityConflict)add('p','现有固定图库补图可能与已登记图片发生容量冲突，尚未完成候选池适配；此提示不增加额度或移除你的参考图。');
  }
 }
 if(!view)return;
 add('p',view.originalsVerified?'原生工程原件核验已完成；不等于参考图已获创意或审美批准。':'已保存记录；当前未完成或未获得原生工程原件核验。');
 const materials=view.materials??[];
 if(!materials.length)add('p','当前文案版本没有已登记的参考用途。');
 for(const material of materials){
  const row=add('details','');add('summary',`${material.directionId} · ${material.id} · ${material.removed?'已撤回':'已登记，尚不代表采纳'}`,row);
  add('p',material.borrowingNote||'借鉴说明尚未记录。',row);if(material.removed)add('p','已保存撤回理由：'+(material.removedReason??'旧记录未提供')+' · '+(material.removedBy??'操作者未提供'),row);
  const decisions=(view.collectorActions??[]).filter(action=>action.materialId===material.id);
  if(!decisions.length)add('p','尚无可关联的搜集负责人用途处理记录。',row);
  for(const action of decisions){add('p',`${action.disposition==='purpose_in_candidate'?'纳入候选用途':'退回用途'} · ${action.reason??'原记录未提供理由'}`,row);add('p',`报告 ${action.reportId} · ${action.originalsVerified?'工程原件已核验':'尚未完成工程原件核验'}`,row);}
 }
 const lead=view.leadActions??[];
 if(lead.length){const group=add('details','');add('summary',`参考负责人候选用途汇总 · ${lead.length} 条`,group);for(const action of lead)add('p',`${action.useId} · ${action.disposition==='use_in_candidate'?'进入候选':'退回'} · ${action.comparison??'未记录整体比较'}。单项理由：${action.individualReason??'原记录未提供'}`,group);}
 const reports=view.reports??[];
 if(reports.length){const group=add('details','');add('summary',`已保存报告来源 · ${reports.length} 份`,group);for(const report of reports)add('p',`${report.nodeKey} · ${report.providerId??'来源未记录'} / ${report.model??'模型未记录'} · ${report.originalsVerified?'工程原件已核验':'尚未完成工程原件核验'}${report.staleReason?' · 已过期 '+report.staleReason:''}`,group);}
 if(view.historicalMaterialCount)add('p',`另有 ${view.historicalMaterialCount} 条旧文案版本参考记录，未混入本轮候选。`);
}
