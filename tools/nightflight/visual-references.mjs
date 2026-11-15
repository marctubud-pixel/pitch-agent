const string = {type:'string'};
const list = items => ({type:'array',items});
const object = properties => ({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const use = object({source:string, borrow:string, apply:string});
const planSchema = object({sharedBrand:list(use),directions:list(object({direction:string, main:list(use), auxiliary:list(use), gap:string}))});
const observationSchema = object({observations:list(object({source:string, visible:string}))});
const nonempty = s => typeof s === 'string' && s.trim().length > 0;

export async function selectVisualReferences({call, project, images, active}) {
  const names = project.directions;
  const catalog = new Map();
  for (const image of images) if (!catalog.has(image.sha256)) catalog.set(image.sha256,image);
  const sources = [...catalog.values()];
  const authors = project.copyReview?.draft?.directions ?? [];
  const directions = names.map(name => authors.find(d=>d.name===name) ?? {name});
  const previousOwners = new Map();
  for (const item of project.previousVisual ?? []) {
    for (const ref of item.visual?.referenceHandoff?.references ?? []) {
      previousOwners.set(ref.sha256, ref.role==='sharedBrand' ? 'sharedBrand' : item.visual.direction);
    }
  }
  const packet = {brief:project.brief,directions,previousDrafts:[...new Set((project.previousVisual ?? []).map(p=>p.visual.direction))],feedback:project.feedback ?? [],sources:sources.map(s=>({
    source:s.imageId,name:s.name,previousDirection:previousOwners.get(s.sha256) ?? null,
  }))};
  if (!sources.length) throw Error('视觉主参考缺失：'+active.join('、')+'。请在对话区补充方向参考原图，发送后重试视觉阶段。');

  // Inspect larger pools in groups that fit the real four-image model transport.
  if (sources.length > 4) {
    packet.observations = [];
    for (let i=0;i<sources.length;i+=4) {
      const group = sources.slice(i,i+4);
      const result = await call('逐张记录可见内容、构图、材质、使用情境及可借鉴的局部。用所附图片的 source 身份返回。',group,observationSchema,{
        assignment:'视觉参考原图登记',context:JSON.stringify(group.map(s=>({source:s.imageId,name:s.name}))),
      });
      const rows=result.parsedOutput?.observations;
      if (!Array.isArray(rows) || rows.length!==group.length || !group.every(s=>rows.some(r=>r.source===s.imageId && nonempty(r.visible)))) throw Error('视觉参考原图观察与输入不对应，请重试。');
      packet.observations.push(...rows);
    }
  }
  const result = await call('逐案按文案方向的职责选一张主参考、至多两张用途不同的辅助图。陈述借哪一处、如何转译到本案。无适用主参考则 main 留空并写 gap。专用参考只给一个方向，已有归属必须保留。sharedBrand 只列确属本案的品牌标志、官方 VI 等全案约束；不要把普通同类图放入共享。每案生图最多附四张，改稿还需给原稿留一个位置。辅助按重要性排序。',sources.length<=4 ? sources : [],planSchema,{
    assignment:'视觉负责人分派参考图',context:JSON.stringify(packet),
  });
  const rows=result.parsedOutput?.directions;
  if (!Array.isArray(rows) || rows.length!==names.length || !names.every(n=>rows.some(r=>r?.direction===n))) throw Error('参考图分派与三份文案方向不一致。');
  const shared = result.parsedOutput.sharedBrand;
  if (!Array.isArray(shared)) throw Error('请明确全案共用的品牌素材。');
  const assigned = new Map(), plans = new Map();
  function bind(entry, role, owner) {
    const image = sources.find(s=>s.imageId===entry?.source);
    if (!image || !nonempty(entry.borrow) || !nonempty(entry.apply)) throw Error('参考图身份或借鉴用途不完整。');
    if (assigned.has(image.sha256) || (previousOwners.has(image.sha256) && previousOwners.get(image.sha256)!==owner)) {
      throw Error('不同方向的专用参考图发生冲突，请核对参考图归属。');
    }
    assigned.set(image.sha256,owner);
    return {image,reference:{role,name:image.name,sha256:image.sha256,borrow:entry.borrow.trim(),apply:entry.apply.trim()}};
  }
  const common = shared.map(e=>bind(e,'sharedBrand','sharedBrand'));
  for (const row of rows) {
    if (!Array.isArray(row.main) || row.main.length>1 || !Array.isArray(row.auxiliary) || row.auxiliary.length>2) throw Error('每方向最多一张主参考、两张辅助参考。');
    const primary = row.main.map(e=>bind(e,'main',row.direction));
    const auxiliary = row.auxiliary.map(e=>bind(e,'auxiliary',row.direction));
    const remaining = 4 - Number(packet.previousDrafts.includes(row.direction)) - common.length - primary.length;
    if (remaining<0 && active.includes(row.direction)) throw Error('「'+row.direction+'」的共享品牌图和主参考超出生图附件上限，请注明本轮必须保留的品牌图后重试。');
    const selected = [...primary,...common,...auxiliary.slice(0,Math.max(0,remaining))];
    const handoff = {direction:row.direction,selectionThread:result.threadId,references:selected.map(s=>s.reference),
      deferred:auxiliary.slice(Math.max(0,remaining)).map(s=>({...s.reference,reason:'本次生图最多附四张，已优先保留主参考、品牌约束及修改原稿。'}))};
    plans.set(row.direction,{images:selected.map(s=>s.image),handoff,missing:!primary.length,gap:row.gap});
  }
  const missing=active.filter(n=>plans.get(n).missing);
  if (missing.length) throw Error('视觉主参考待补：'+missing.map(n=>n+'（'+(plans.get(n).gap || '缺少能表达该方向的原图')+'）').join('、')+'。请在对话区发送参考原图，然后重试。');
  return plans;
}
