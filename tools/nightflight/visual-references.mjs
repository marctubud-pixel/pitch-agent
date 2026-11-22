import {promisedPackageUnits, confirmsInnerPackets} from './packaging-quantity.mjs';
import {invalidOutput,independentCalls} from './call-checkpoints.mjs';
const string = {type:'string'};
const list = items => ({type:'array',items});
const object = properties => ({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const use = object({source:string, borrow:string, apply:string});
const publicUse = object({...use.properties,why:string,avoid:string});
const observationSchema = object({observations:list(object({source:string, visible:string}))});
const imagePromptSchema = object({prompt:string});
const nonempty = s => typeof s === 'string' && s.trim().length > 0;

export const visualElements = ['配色', '布局', '景别', '笔法', '字体'];

export function posterStrategyPurpose(strategy) {
  const sections = strategy.split(/^##\s+/m).slice(1);
  return sections.flatMap(section => {
    const [title,...lines] = section.trim().split('\n');
    if (!['核心策略','人群洞察','品牌角色','核心主张'].includes(title.trim())) return [];
    const statement = lines.find(line => line.trim() && !/^\s*[-*]/.test(line));
    return statement ? [statement.trim()] : [];
  }).join('\n');
}

export async function readPosterReference({call, image}) {
  const result = await call(
    '只描述这一张主参考原图实际可见的五项。布局写标题、留白、主体与支撑背景分区的相对位置和大致占比；有明显分区时说清上、中、下层和留白从哪里开始。布局只记主要的空间关系，省去局部边框、图标和背景物件本身。景别写主体占画幅的大小和可见环境范围，主体触到画面边缘或出画时注明哪一边。笔法写线条、切边或摄影质感，字体写字形和字重，配色写主要色和对比。' +
    '逐项用简短一句话记录可借的抽象关系。用主体、标题区、前景物件等通称，不转录原画的品牌名、标志、联名角色、画面原字或原产品印花。景别只写主体占比、出画边缘和环境范围；景别术语不能替代实图关系。笔法只写画法。本次不评价本案，不把后续改法写成原图特征。看不清的一项填「未核实」，原图确实没有文字也照实写。',
    [image], object(Object.fromEntries(visualElements.map(element=>[element,string]))),
    {delegate:true,rules:[],assignment:'海报主参考原图核读',context:'附件只有本方向主参考原图。'},
  );
  const observations = result.parsedOutput;
  if (!observations || Object.keys(observations).length!==visualElements.length ||
      !visualElements.every(element=>nonempty(observations[element])) || !nonempty(result.model) || !nonempty(result.threadId)) {
    throw invalidOutput('海报主参考缺少实际原图的五项观察或读图回执。');
  }
  return {image,observations,model:result.model,threadId:result.threadId};
}

// A placement such as a refrigerator belongs to the delivery brief; framing carries only scale and viewing range.
export function posterFraming(value) {
  const shot=value.match(/大特写|中近景|中远景|近景|中景|远景|全景|特写/u)?.[0];
  const subject=value.match(/(?:主体|人物|角色|商品|物件)[^，。；]{0,16}?(?:占(?:画面|画幅|全景)?(?:比例)?|约)\s*(?:约|为)?\s*(\d{1,3}\s*%|[一二三四五六七八九十]+分之[一二三四五六七八九十]+)/u)?.[1];
  const edge=value.match(/(?:主体(?:的)?|杯)(底部?|顶部?|左侧|右侧)(?:出画|被(?:画面|画幅)?(?:[上下左右]边缘?)?(?:截断|裁切))/u)?.[1];
  const environment=value.match(/(?:环境|背景)(?:所占|的)?(?:范围|占比|比例)?(?:为|是)?(?:较|很|偏)?([大小宽窄])/u)?.[1] ??
    value.match(/(大|小|宽|窄)(?:的)?环境(?:范围|比例|占比)/u)?.[1];
  return [shot,subject && '主体约占画面 '+subject.replace(/\s/gu,''),edge && '主体'+({'底':'底部','顶':'顶部'}[edge] ?? edge)+'出画',
    environment ? '环境范围'+environment :
      /(?:背景|环境)[^，。；]{0,24}(?:简化|简洁)/u.test(value) ? '环境简化' : ''].filter(Boolean).join('，') ||
    '沿用原图中主体占画面的大小和环境范围。用本案内容重画。';
}

export function paperAspect(brief) {
  const named=brief.match(/\bA([0-6])\b/iu);
  const portrait=/竖版|竖幅|竖向|纵向|\bportrait\b/iu.test(brief);
  const landscape=/横版|横幅|横向|\blandscape\b/iu.test(brief);
  if (!named || portrait===landscape) return null;
  const aSeries=[[841,1189],[594,841],[420,594],[297,420],[210,297],[148,210],[105,148]];
  const [short,long]=aSeries[Number(named[1])];
  return {name:'A'+named[1]+(portrait?'竖版':'横版'),width:portrait?short:long,height:portrait?long:short};
}

export function oppositePosterOrientation(image, paper) {
  return Boolean(paper && image?.width>0 && image.height>0 && (image.width-image.height)*(paper.width-paper.height)<0);
}

const colors=/(?:[深浅淡亮暗暖冷]?[红橙橘黄绿青蓝紫粉褐棕灰黑白金银米]{1,3}色|蓝紫|橙紫|黑白|蓝白|红白|冷色|暖色|[深浅淡亮暗][红橙黄绿青蓝紫粉灰黑白]|乳白|米白|米黄|[红橙黄绿蓝紫白黑灰](?=衣服|上衣|外套|手套|背景|底色)|\b(?:navy|red|orange|yellow|green|blue|purple|pink|black|white|gr[ae]y|teal)\b)/giu;
function withoutColor(value,preserve=[]) {
  return value.replace(colors,(hue,index)=>preserve.some(literal=>{
    const start=value.lastIndexOf(literal,index);
    return start>=0 && start+literal.length>=index+hue.length;
  })?hue:'');
}

export function posterIdentityExclusions(value='') {
  const aesthetics=/(?:配色|色调|色彩|撞色|色板|字体|字形|字重|笔法|景别)(?:组合|搭配|风格)?[”」"]?$/u;
  const identity=/品牌|字标|商标|logo|专属|标识|角色|道具|标题原字|图形|独特/u;
  return value.split(/[。；;]/u).map(clause=>{
    const command=clause.trim().match(/^(?:不照搬|不保留|不采用|不使用|不要使用|禁用|不得使用|禁止使用)[：:]?/u)?.[0] ?? '';
    const items=clause.trim().slice(command.length).split(/[、，,]/u).map(item=>{
      const pieces=item.split(/(以及|及|和|与)/u);
      const kept=[];
      for (let i=0;i<pieces.length;i+=2) {
        const part=pieces[i];
        if (!nonempty(part) || (aesthetics.test(part.trim()) && !identity.test(part))) continue;
        kept.push((kept.length?pieces[i-1] ?? '、':'')+part);
      }
      return kept.join('');
    }).filter(nonempty);
    return items.length?command+items.join('、'):'';
  }).filter(Boolean).join('；');
}

function paletteAxes(value) {
  const roles=/主色|底色|对比|点缀|辅助色|背景色/u;
  return value.split(/[，,。；;\n]/u).flatMap(clause=>{
    const hues=[...new Set(clause.match(colors) ?? [])];
    const role=clause.match(roles)?.[0];
    return hues.length ? [hues.join('、')+(role?'（'+role+'）':'')] : [];
  }).join('；') || '以主参考的主色、对比色和点缀比例为准。';
}

function posterAxisObservations(observations) {
  const keepGeometry=withoutColor(observations.布局).replace(/背景大面积(?=[，,。；;]|$)/gu,'背景的大面积区域');
  const usable={配色:paletteAxes(observations.配色),布局:keepGeometry,景别:posterFraming(observations.景别),
    笔法:withoutColor(observations.笔法),字体:withoutColor(observations.字体).split(/[，,。；;]/u)
      .filter(part=>!/^填充|^与背景|^文字颜色/u.test(part)).join('，') || '只沿用字形和字重。'};
  return Object.fromEntries(visualElements.map(axis=>[axis,
    observations[axis].trim()==='未核实' ? '未核实' : usable[axis].trim() || '未核实']));
}

function posterHardCondition(proposed,target,sources) {
  const condition = proposed?.trim();
  if (!condition || !target.includes(condition)) return '';
  const optional = /可选|可以|建议|例如|如需/u;
  const aesthetic = /高级|好看|精美|精致|大气|有质感|有氛围|吸引人/u;
  const placement = /居中|中央|[上下左右][部方侧角边]|[顶底]边|画面内|出画|裁切|留白|完整可见/u;
  const proportion = /\d+(?:\.\d+)?\s*[%％]|[一二三四五六七八九十]+分之[一二三四五六七八九十]+/u;
  const appearance = /(?:主|底|背景|辅助|点缀)色|[红橙黄绿青蓝紫粉褐灰黑白金银]色|手绘|线描|实拍|摄影|平涂|剪纸|字重|字形|宋体|黑体|衬线/u;
  if (optional.test(condition) || aesthetic.test(condition) ||
      ![placement,proportion,appearance].some(pattern=>pattern.test(condition))) return '';

  const negated = /不要|不必|不需|不用|不要求|不保留|无须|无需|不得|禁止|避免|也可|不一定/u;
  const grounded = sources.some(source => typeof source==='string' &&
    source.split(/[。；;！？!?\r\n]/u).some(clause=>{
      const at = clause.indexOf(condition);
      if (at<0) return false;
      const prefix = clause.slice(0,at).split(/[，,、]/u).at(-1);
      return !optional.test(prefix) && !negated.test(prefix);
    }));
  return grounded ? condition : '';
}

async function writePosterPrompt({call, images, context, posterReference, posterSlogan}) {
  const {transfer,revision,previousTransferCriteria,mainReferenceUse,referenceTask,hasBrandArtwork, ...directionInput} = context;
  const {image,observations} = posterReference;
  const usableObservations = posterAxisObservations(observations);
  if (previousTransferCriteria && (!revision || previousTransferCriteria.referenceSha256!==image.sha256 ||
      Object.keys(previousTransferCriteria.axes ?? {}).length!==visualElements.length ||
      !visualElements.every(axis=>{
        const existing = previousTransferCriteria.axes[axis];
        return existing?.reference===usableObservations[axis] && nonempty(existing.target) &&
          (existing.reference===existing.target)===transfer.borrow.includes(axis) &&
          (existing.hardCondition===undefined || (nonempty(existing.hardCondition) && existing.target.includes(existing.hardCondition)));
      }))) throw invalidOutput('海报返修须沿用同一主参考和此稿锁定的五项借改条件。');
  const exclusions=posterIdentityExclusions(mainReferenceUse?.avoid);
  const revisionAxes=revision ? visualElements.filter(axis=>['应沿用','应变化','应改'].some(change=>revision.reason?.includes(axis+change)) ||
    revision.edit?.includes('沿用这项'+axis)) : [];
  const brief=directionInput.brief ?? '';
  const paper=paperAspect(brief);
  const briefQuotes=[...brief.matchAll(/[“「"]([^”」"]+)[”」"]/gu)].map(match=>match[1]);
  const at = images.findIndex(input=>input.sha256===image.sha256);
  const descriptionOnly=revision?.referenceInput==='observations';
  if (descriptionOnly ? at>=0 : at<0) throw Error('本张海报实际附件与核定的主参考借法不一致。');
  const schema = object({
    format:string, subject:string, background:string, lettering:list(string),
    ...(!previousTransferCriteria ? {
      changes:object(Object.fromEntries(transfer.change.map(element=>[element,string]))),
      hardConditions:object(Object.fromEntries(visualElements.map(axis=>[axis,string]))),
    } : {}),
    ...(revision ? {revisionFix:string} : {}),
  });
  const result = await call([
    '为这个海报方向写制图内容。用 referenceTask 和 mainReferenceUse 里已经准入的本案画面关系来写，保留本案重点和动作取舍。参考图的主体、标识、联名角色、包装、装饰、配料和字样均不能当作本案元素。只有客户原 Brief 确认的品牌和产品信息可印。遵守 mainReferenceUse.avoid 和辅助参考各自的禁用内容。',
    'format 写简报给定的载体、横竖、硬性尺寸和投放场所。subject 写本案画面主体和动作。background 写本案画面实际需要的背景。投放位置在冷柜、柜台或门店旁，不自动成为画面背景或动作。当前创意要求画它时再画。保留本方向的差异，看到场地相同也不用让三案画同一个购买过程。',
    '主体和背景字段只写本案内容，不重新指定配色、构图、景别、笔法和字体。保持客户明确指定的画面和物料。',
    previousTransferCriteria
      ? '本次返修沿用原稿锁定的五项实图条件。主体、背景和 revisionFix 遵守这些条件。'
      : 'changes 只写两项重新设计的内容。每项给可直接拿成图核对的目标，要看得出与原图观察的差异。改布局时说清主标题、主要画面主体及留白的新位置关系。改景别时说清主体可见占比、出画边缘和环境范围。',
    !previousTransferCriteria && 'hardConditions 按五项分别给一个必须落实的原文短语或空字符串。仅在原始 Brief、已确认任务卡或本方向已准入的画面关系明确要求且成图上可直接指出证据时填写，比如「大杯居中」或「杯身完整可见」。使用本项原图观察或实际改法中已经写明的相同字样。仅为画法参考、审美倾向、可选建议或原图独有内容均填空字符串。',
    '三项沿用内容由按轴整理的原图观察给出。这三项不在其他字段重新指定。配色含文字与背景的用色；布局只说区域位置与比例；字体只说字形和字重。',
    'lettering 只列需要印在画面中的简报信息或本案副标，逐条写实际文字。主标题已定稿。价格、型号或时段只在设计需要的位置出现一次。省略未确认字样，不新增产品标签上的原料、分类或功效。',
    revision && 'revisionFix 把退回原因写成一条针对本稿、可直接画出的修正。明确怎样落实 revision.axes 指出的原图关系；只用本案主体和原定三借两改。审稿意见与核定借改冲突时，按借改和客户要求。不要照抄审稿和原参考的具体物件。',
  ].filter(Boolean).join('\n'),[],schema,{
    assignment:'夜航海报生图提示词写作',rules:[],context:visualWriterContext({
      ...directionInput, ...(mainReferenceUse && {mainReferenceUse:{apply:withoutColor(mainReferenceUse.apply ?? ''),avoid:exclusions}}),
      ...(referenceTask && {referenceTask:{...referenceTask,focus:withoutColor(referenceTask.focus ?? ''),translation:withoutColor(referenceTask.translation ?? '')}}),
      ...(revision && {revision:{...revision,axes:revisionAxes}}),
      posterSlogan,mainReference:{...(descriptionOnly ? {descriptionOnly:true} : {imageNumber:at+1}),observations:usableObservations},transfer,
      ...(previousTransferCriteria ? {previousTransferCriteria} : {}),
      ...(typeof hasBrandArtwork==='boolean' ? {hasBrandArtwork} : {}),
    },posterSlogan),
  });
  const plan = result.parsedOutput;
  const normalize = value=>value.normalize('NFKC').replace(/[\s\p{P}]/gu,'');
  const preserve=[posterSlogan,...briefQuotes,...(Array.isArray(plan?.lettering)?plan.lettering.filter(line=>nonempty(line) && brief.includes(line)):[])].filter(nonempty);
  const changes=plan?.changes && Object.fromEntries(transfer.change.map(element=>{
    const value=plan.changes[element];
    return [element,element!=='配色' && typeof value==='string'?withoutColor(value).trim():value];
  }));
  const proposedHard = plan?.hardConditions;
  if (!plan || !['format','subject','background'].every(field=>nonempty(plan[field]) && plan[field].length<=600) ||
      !Array.isArray(plan.lettering) || plan.lettering.length>8 ||
      !plan.lettering.every(value=>nonempty(value) && value.length<=120) ||
      !previousTransferCriteria && (!plan.changes || Object.keys(plan.changes).length!==transfer.change.length ||
        !transfer.change.every(element=>nonempty(plan.changes[element]) && plan.changes[element].length<=450 &&
          nonempty(changes[element]) &&
          normalize(plan.changes[element])!==normalize(observations[element]) &&
          normalize(changes[element])!==normalize(usableObservations[element]))) ||
      !previousTransferCriteria && proposedHard!==undefined && (!proposedHard ||
        Object.keys(proposedHard).length!==visualElements.length || !visualElements.every(axis=>typeof proposedHard[axis]==='string')) ||
      revision && (!nonempty(plan.revisionFix) || plan.revisionFix.length>600) ||
      !nonempty(result.model) || !nonempty(result.threadId)) {
    throw invalidOutput('海报生图文字须按借改项目写出两项明确的新画法和本方向的画面内容。');
  }
  const hardSources = [brief,directionInput.taskCard,mainReferenceUse?.apply,referenceTask?.focus,referenceTask?.translation];
  const transferCriteria = previousTransferCriteria ?? {referenceSha256:image.sha256,
    axes:Object.fromEntries(visualElements.map(axis=>{
      const reference = usableObservations[axis];
      const target = transfer.borrow.includes(axis) ? reference : changes[axis];
      const hardCondition = posterHardCondition(proposedHard?.[axis],target,hardSources);
      return [axis,{reference,target,...(hardCondition ? {hardCondition} : {})}];
    }))};
  const technique = transferCriteria.axes.笔法.target;
  const flatIllustration=/扁平(?:卡通|插画|风格)|平涂|平面卡通|矢量插画/u.test(technique) &&
    !/融合|混合|拼贴|结合|摄影|实拍|三维|3D/iu.test(technique);
  const repair=revision && (revisionAxes.length
    ? '重画上一稿的'+revisionAxes.join('、')+'。执行下列已核定的画面关系和画法。'
    : '上一稿的具体修正。'+withoutColor(plan.revisionFix,preserve));
  const lettering=plan.lettering.filter(line=>normalize(line)!==normalize(posterSlogan));
  const prompt = [
    '生成一张完整海报／KV。' + plan.format,
    paper ? '成图画布使用 '+paper.name+'，宽高比 '+paper.width+':'+paper.height+'。保留完整标题与画面。' : '',
    descriptionOnly ? '参照信息来自同一原图观察，下方保留五项借改。请从空白画布重画本案。'
      : '实际第 '+(at+1)+' 张附件是本方向主参考原图，只借核定的画面关系或美术特征。',
    flatIllustration ? '整张海报画成二维平涂插画。商品、人物、手、道具和背景都用统一的手绘轮廓与色块，商品杯型和文字仍须清楚可辨。避免实拍皮肤、摄影反光或混入三维商品样机。' : '',
    repair,
    ...transfer.borrow.map(axis=>'沿用主参考的'+axis+'。'+transferCriteria.axes[axis].target),
    ...transfer.change.map(axis=>'重新设计'+axis+'。本张改为 '+transferCriteria.axes[axis].target),
    ...visualElements.flatMap(axis=>{
      const hardCondition = transferCriteria.axes[axis].hardCondition;
      return hardCondition ? ['必须落实的'+axis+'条件。'+hardCondition] : [];
    }),
    paper && transfer.borrow.includes('布局') ? '按本案纸幅重排空白，保留上述标题区、画面各层的位置关系和主体比例。重新绘制整幅画面，保留完整构图。' : '',
    '所有人物、商品包装、道具、背景、标志、图形与字样用本案内容重画。无品牌原件时只用本案确认的品牌原字。禁止使用参考品牌、联名标识或角色，也不要添加未确认的配方、功效和宣传声称。',
    exclusions ? '原图内容的禁用项。'+exclusions : '',
    '构图和景别遵照以上逐项借改安排。以下是本方向的新画面，按主体和背景重画。',
    '画面主体和动作。'+withoutColor(plan.subject,preserve),
    hasBrandArtwork===false ? '本案没有采用的品牌实物图。改画真实产品形状；包装或容器做纯色占位，杯盖、盒身及侧面留白。品牌、品名、规格和售价按下面文字在海报文字区排版。若客户明确要求哪几个字印在产品上，仅按指定原字排。' : '',
    '背景。'+withoutColor(plan.background,preserve),
    directionInput.auxiliaryNotes?.length ? '辅助参考的文字线索。'+directionInput.auxiliaryNotes.map(note=>[note.apply,note.avoid && '禁用：'+note.avoid].filter(Boolean).join(' ')).join(' ') : '',
    '完整主标题「'+posterSlogan+'」须逐字排进画面。允许合理换行，保留原句和标点。',
    lettering.length ? '其它需印在画面的文字。'+lettering.map(line=>'「'+line+'」').join('、') : '',
    '保持文字清晰可读。避免副标、价格等重复排印。主标题外的装饰不能代替标点。未定正式标志时可用已确认的文字品牌名，省略标志图案。',
  ].filter(Boolean).join('\n');
  return {model:result.model,threadId:result.threadId,prompt,plan,transferCriteria};
}

function includesPosterSlogan(prompt, slogan) {
  if (prompt.includes(slogan)) return true;
  const wrap = '[ \\t]*\\r?\\n[ \\t]*';
  const words = slogan.split(/([ \t]+)/u).filter(Boolean);
  const literal = words.map(part => part.trim()
    ? Array.from(part, RegExp.escape).join('(?:'+wrap+')?')
    : '(?:'+RegExp.escape(part)+'|'+wrap+')').join('');
  if (new RegExp(literal,'u').test(prompt)) return true;
  const rowLabel='第([一二三四五六七八九十]|[1-9]\\d*)行(?:逐字)?[ \\t]*(?:(?:写|排)(?:成|为)?[ \\t]*)?';
  const labeledLine = '[ \\t]*'+rowLabel+'[:：][ \\t]*([^\\r\\n]+)';
  const blocks = prompt.match(new RegExp('^(?:'+labeledLine+'(?:\\r?\\n|$)){2,}','gmu')) ?? [];
  const linePattern = new RegExp('^'+labeledLine+'$','u');
  const complete = new RegExp('^'+literal+'$','u');
  const exactRows=rows=>rows.length>=2 && rows.every((row,i)=>row && (row[1]===String(i+1) || row[1]==='一二三四五六七八九十'[i])) &&
    complete.test(rows.map(row=>row[2].trimEnd()).join('\n'));
  if (blocks.some(block=>exactRows(block.trimEnd().split(/\r?\n/u).map(line=>line.match(linePattern))))) return true;
  const quotedRow=new RegExp(rowLabel+'[:：]?[ \\t]*(?:「([^」\\r\\n]+)」|“([^”\\r\\n]+)”)','gu');
  const quotedRows=[...prompt.matchAll(quotedRow)]
    .map(([,number,corner,curly])=>[null,number,corner ?? curly]);
  return exactRows(quotedRows);
}

function targetPriceAmount(brief='') {
  const text=brief.normalize('NFKC');
  const target=text.match(/(?:目标价(?:格)?|拟售价(?:格)?)\s*(?:为|是)?\s*[:：]?\s*[¥￥]?\s*(\d+(?:\.\d+)?)\s*(?:元|块)/u)?.[1] ??
    text.match(/(\d+(?:\.\d+)?)\s*(?:元|块)(?:\s*\/[^，,。；;\s]{1,6})?\s*(?:为|是)\s*(?:电商)?\s*(?:目标价|拟售价)/u)?.[1];
  if (!target) return '';
  const confirmed=new RegExp('(?:已确认|已定|正式|最终)(?:零售|电商)?售价\\s*(?:为|是)?\\s*[:：]?\\s*[¥￥]?\\s*'+RegExp.escape(target)+'\\s*(?:元|块)','u');
  return confirmed.test(text)?'':target;
}

function visualWriterContext(context,posterSlogan) {
  const brief=context.brief ?? '';
  const target=targetPriceAmount(brief);
  if (!target) return JSON.stringify(context);
  const price=/目标价|拟售价|售价|价格|价签|标价/u;
  const canvas=/画面|包装|盒面|正面|标签|海报|主视觉|首屏|\bKV\b/u;
  const directive=/(?:请|需要|必须|务必|要求|须|要|把|将).{0,18}(?:标|印|放|露出|展示|显示|写|贴)|(?:海报|画面|首屏|盒面|包装上)(?:右下|左下|上)?(?:标出|印上|写上|展示|标注|露出)/u;
  const show=brief.split(/[。；;，,\r\n]/u).some(line=>price.test(line) && canvas.test(line) && directive.test(line) &&
    !/不要|不必|无需|不得|不允许|不用|不印|不标|不展示|不放|确认后/u.test(line));
  if (show) return JSON.stringify(context);
  const literal=RegExp.escape(target);
  const currency='(?<![\\d.])(?:[¥￥][ \\t]*)?'+literal+'[ \\t]*(?:元|块)(?:[ \\t]*[/／][ \\t]*(?:千克|公斤|克|袋|包|盒|箱|瓶|罐|杯|件|份))?|[¥￥][ \\t]*'+literal+'(?![\\d.])';
  if (posterSlogan && new RegExp(currency,'u').test(posterSlogan)) {
    throw invalidOutput('已选海报标题含未获上画授权的目标价。请在文案核对价格原意后再交图。');
  }
  const amount=new RegExp(currency,'gu');
  return JSON.stringify(context,(key,value)=>typeof value==='string' && !/^(?:id|name|file(?:name)?|mediaType)$|(?:id|url|path|sha256)$/iu.test(key) ?
    value.replace(amount,'（未确认且不上画）') : value);
}

function unqualifiedTargetPrice(prompt,brief) {
  const target=targetPriceAmount(brief);
  if (!target) return false;
  const amount=new RegExp('(?:^|[^\\d.])'+RegExp.escape(target)+'\\s*(?:元|块)','u');
  const retained=/目标价|拟售|暂定|价格示意|待确认|不(?:用|要|可)?(?:写|放|展示|印|出现)|省略|去掉|不画(?:价签|价格|售价|标价)|(?:元|块)(?:\/[^，,\s]{1,6})?\s*(?:只|仅)?留在提案材料|属于提案材料[，,]\s*不上画面/u;
  const priceCommand=new RegExp('(?:展示|显示|露出|印(?:上|出)?|写(?:上|出)?|放|标(?:上|出|为)?|贴).{0,10}'+RegExp.escape(target)+'\\s*(?:元|块)','u');
  let exclusion=false;
  for (const raw of prompt.split(/\r?\n/u)) {
    if (!raw.trim()) {exclusion=false;continue;}
    for (const part of raw.split(/(?=【[^】\r\n]+】)/u)) {
      const section=part.match(/^\s*【([^】]+)】\s*[:：]?\s*/u);
      if (section) exclusion=/^(?:画面)?(?:不出现|不得出现|不可出现|禁止出现|不画|不加入|排除项|禁止项|负面提示词)$/u.test(section[1].trim());
      else if (/^[^：:，,。；;]{2,22}[：:]/u.test(part.trim())) exclusion=false;
      const body=section ? part.slice(section[0].length) : part;
      if (body.split(/[。；;]/u).some(clause=>amount.test(clause) && !retained.test(clause) &&
          (!exclusion || priceCommand.test(clause)))) return true;
    }
  }
  return false;
}

const innerPacketsArtwork='【已确认的包装结构】外盒中的产品是独立内袋。配料特写作为可辨的平面印刷图案或盒外的使用场景。参考图的开窗式布局只借框形和位置，包装正面无真实食材窗时应完全封闭。客户明确要求透窗或打开外盒时，只能看到完整的独立小袋，不能看到外盒内未分袋的内容。';

async function submitVisualPrompt({call,images,written,posterSlogan,packagingBrief}) {
  const draft = written.parsedOutput?.prompt;
  if (!nonempty(draft) || draft.length>32000 || !nonempty(written.model) || !nonempty(written.threadId)) {
    throw invalidOutput('文字服务未交回可用的生图提示词与模型回执。');
  }
  const prompt=packagingBrief && confirmsInnerPackets(packagingBrief) ? draft+'\n\n'+innerPacketsArtwork : draft;
  if (posterSlogan && !includesPosterSlogan(prompt,posterSlogan)) {
    throw invalidOutput('海报生图提示词缺少该方向已选 slogan 的原句，请按制图要求完整写入。');
  }
  const visiblePackageUnits=packagingBrief ? promisedPackageUnits(prompt) : 0;
  if (visiblePackageUnits && visiblePackageUnits!==promisedPackageUnits(packagingBrief)) {
    throw invalidOutput('客户只确认了包装规格时，请让盒身写清件数。用闭盒正面、局部露出或单件取用表达创意，不承诺全部内装可见或可数。');
  }
  if (packagingBrief && unqualifiedTargetPrice(prompt,packagingBrief)) {
    throw invalidOutput('目标价保留待确认限定。简报未要求价格露出时，省略画面价签。');
  }
  const result = await call(prompt,images,null,{exactImagePrompt:true});
  return {result,promptWriting:{model:written.model,threadId:written.threadId,prompt,
    ...(visiblePackageUnits ? {visiblePackageUnits} : {})}};
}

export async function generateVisualWithDesktopModels({call, images, context, drawingBrief, posterSlogan, packaging, posterReference}) {
  if (posterReference) {
    const promptWriting = await writePosterPrompt({call,images,context,posterReference,posterSlogan});
    const result = await call(promptWriting.prompt,images,null,{exactImagePrompt:true});
    return {result,promptWriting};
  }
  const instruction = [
    '为夜航这个方向写一段可以直接交给生图模型的提示词。用简报、文案、借改项目和图片用途来写。',
    '写清画面、背景和前景的关系，明确要借的三项、重新设计的两项，以及每张实际附件怎样使用。按制图要求写清载体上的文字。',
    posterSlogan && '海报或 KV 要把本方向已选 slogan 的完整原句排成画面主标题。提示词中逐字列出原句，明确文字放在画面上。标题分行时用连续的行写全原字和标点。',
    packaging && '包装画面的设计主题转化成画面关系，包装本体只列确认可印的实际文字。盒内件数印在外盒上，单件只标对应单件规格。简报若只规定装量和外盒正面，优先闭盒正面或只露出局部、展示单件取用；不可凭空要求全数内装同时可见或可数。客户明确要求把全部内装画出时按原要求。目标价或拟售价留在提案材料，简报未要求上画时省略价签；要求上画时保留该限定。',
    packaging && confirmsInnerPackets(context.brief) && '外盒装的是独立小袋。参考图的透明窗、陈列框或食材区只能转用它的版面框形和位置；不能沿用与本品内装不符的盒型结构、材质或装料形态。若要借开窗式布局，画成明确可识别的平面印刷图框，或把食材特写放在外盒之外；若简报明确委托透窗，实物窗里只能显示完整独立袋。全篇的画面、借法、附件用途与包装转化要使用同一说法。',
    '返回一个 prompt 字段，内容是完整的生图提示词。',
  ].filter(Boolean).join('\n');
  const written = await call(instruction,[],imagePromptSchema,{
    assignment:'夜航生图提示词写作',rules:[],context:visualWriterContext({...context,drawingBrief},posterSlogan),
  });
  return submitVisualPrompt({call,images,written,posterSlogan,...(packaging ? {packagingBrief:context.brief} : {})});
}

export async function repairVisualTitle({call,image,posterSlogan,observed}) {
  const written=await call(
    '夜航局部修字。根据成稿的实际盲读，为图像编辑服务写一条制图指令。原样保留整张图、标题位置、字形、字号、配色、背景、包装、产品和其他字。只按定稿原句修主标题的标点，保留全部原字。明确要求画面不要出现指令中的引号。把核定原句完整写入提示词。返回 JSON 对象，仅含 prompt。',
    [],imagePromptSchema,{assignment:'视觉标题标点修正',rules:[],context:JSON.stringify({已见字样:observed.text,实际位置:observed.location,核定原句:posterSlogan,载体:'海报／KV主标题'})});
  return submitVisualPrompt({call,images:[image],written,posterSlogan});
}

export async function describeReferenceTasks({call, project, active, carriers}) {
  const directions=project.directions.flatMap((name,index)=>active.includes(name) ? [{
    ...(project.copyReview?.draft?.directions ?? []).find(item=>item.name===name),name,id:['A','B','C'][index],
  }] : []);
  const keys=directions.map(direction=>direction.id);
  const schema=object({directions:object(Object.fromEntries(keys.map(id=>[id,object({focus:string,translation:string})])))});
  const result=await call(
    '把已定各案写成找主参考的美术任务。focus 写原图可以提供的一种画面关系或笔法，translation 写本案如何使用这种关系。保留委托的艺术风格偏好。成分一目了然可找同类包装的标识层级，也可看其他作品怎样并排或分格呈现多个对象。只写画面关系，省略商品的具体配料、数量、规格、价格、品牌以及主副标原字。按输入的固定方向键回答。',
    [],schema,{editorial:true,assignment:'视觉参考美术任务',context:JSON.stringify({directions,brief:project.brief,strategy:project.strategyText,carriers})});
  const rows=result.parsedOutput?.directions;
  if (!rows || Object.keys(rows).length!==keys.length ||
      !keys.every(id=>nonempty(rows[id]?.focus) && nonempty(rows[id].translation)) || !nonempty(result.threadId)) {
    throw invalidOutput('选参考前需要各方向的美术任务和请求回执。');
  }
  return new Map(directions.map(({name,id})=>[name,{focus:rows[id].focus,translation:rows[id].translation,
    carriers,threadId:result.threadId}]));
}

export async function selectVisualReferences({call, project, images, active, observations=new Map(), priorAdmissions=[], accepted=[], referenceTasks, paper}) {
  const names = project.directions;
  const fixedIds = ['A','B','C'];
  const acceptedNames = new Set(accepted.map(plan=>plan.direction));
  const reserved = new Set(accepted.flatMap(plan=>plan.references.filter(ref=>ref.role!=='sharedBrand').map(ref=>ref.sha256)));
  const catalog = new Map();
  for (const image of images) if (!catalog.has(image.sha256)) catalog.set(image.sha256,image);
  const sources = [...catalog.values()].map((image,index)=>image.sourceUrl ? {...image,imageId:'R'+(index+1)} : image)
    .filter(image=>!reserved.has(image.sha256));
  const authors = project.copyReview?.draft?.directions ?? [];
  const directions = names.map((name,index)=>({name,id:fixedIds[index]})).filter(d=>!acceptedNames.has(d.name) &&
    (!referenceTasks || referenceTasks.has(d.name)));
  const directionIds = directions.map(direction=>direction.id);
  const previousOwners = new Map();
  for (const item of project.previousVisual ?? []) {
    for (const ref of item.visual?.referenceHandoff?.references ?? []) {
      previousOwners.set(ref.sha256, ref.role==='sharedBrand' ? 'sharedBrand' : item.visual.direction);
    }
  }
  const packet = { ...(referenceTasks ? {directions:directions.map(row=>({...row,...referenceTasks.get(row.name)}))} :
    {brief:project.brief,strategy:project.strategyText,directions:directions.map(row=>({...authors.find(d=>d.name===row.name),...row})),feedback:project.feedback ?? []}),
    ...(paper ? {posterPaper:paper} : {}),
    previousDrafts:[...new Set((project.previousVisual ?? []).map(p=>p.visual.direction))],sources:sources.map(s=>({
    source:s.imageId,...(s.sourceUrl ? {} : {name:s.name}),pageUrl:s.pageUrl,title:s.title,carrier:s.carrier,searchDirection:s.direction ?? null,previousDirection:previousOwners.get(s.sha256) ?? null,
    ...(paper && s.width>0 && s.height>0 ? {width:s.width,height:s.height,oppositeOrientation:oppositePosterOrientation(s,paper)} : {}),
  })),priorAdmissions,...(accepted.length ? {acceptedDirections:referenceTasks ? accepted.map(({direction,references})=>({direction,
    references:references.map(({role,sha256,borrow})=>({role,sha256,borrow}))})) : accepted} : {})};
  if (!sources.length) throw Object.assign(Error('视觉主参考缺失：'+active.join('、')+'。可在对话区补充原图后重试。'),{missing:active});

  const readSeparately=sources.length>4 || sources.some(image=>image.sourceUrl);
  if (readSeparately) {
    const unread=sources.filter(image=>!observations.has(image.sha256));
    for (let i=0;i<unread.length;i+=4) {
      const group = unread.slice(i,i+4);
      const result = await call('按附件顺序逐张只读原图，记录真实载体、主体、颜色、布局、景别、笔法、字体和使用情境。包装写清可见的袋、罐或盒及位置。数量和印字看不清就写未核实。用所附图号返回。',group,observationSchema,{
        assignment:'视觉参考原图登记',context:JSON.stringify(group.map(s=>({source:s.imageId}))),
      });
      const rows=result.parsedOutput?.observations;
      if (!Array.isArray(rows) || rows.length!==group.length || !group.every(s=>rows.some(r=>r.source===s.imageId && nonempty(r.visible)))) throw invalidOutput('视觉参考原图观察与输入不对应，请重试。');
      for (const image of group) observations.set(image.sha256,{visible:rows.find(row=>row.source===image.imageId).visible,threadId:result.threadId});
    }
    packet.observations=sources.map(image=>({source:image.imageId,visible:observations.get(image.sha256).visible}));
  }
  const selection = [
    '先为各方向分配互不重复的主参考，再按需选至多两张作用不同的辅助图。source 只填图册给出的图号，例如 R1。每张原图只分给一个用途。main 必须是一个对象，找不到时为 null 并写 gap。',
    paper ? '按 posterPaper 及原图实测尺寸选主参考。能回应同一美术任务时，优先横竖一致、长宽比接近的独立作品。相反版幅仅在相关作品仍缺且相对位置能重画时作为主参考。能参考使用动作的图可单独做辅助。多图拼接中几个独立广告的排版不代表单张海报的版式。' : '',
    referenceTasks ? '主参考用图上一个可定位的形式、布局、笔法或动作关系建立本案的整体读法。优先载体相近的原图。没有时，选相邻类别中能够呈现同一关系的图文版面、艺术作品或活动图。信息需一项项看清时，可用并排、图文对应、分格后突出一项或按阅读顺序呈现。原图能承担这项转译即可作为主参考。确无可借的画面关系才填 main=null。具体包装形态、品牌、配料、规格、价格和文案由后续出图按 Brief 处理。' : '',
    '主参考须能转译方向创意。说明实际载体及画面整体风格，观察配色、布局、景别、笔法、字体，以及背景怎样衬托主体。在 borrow 写可借位置，在 apply 写本案怎样重画。辅助图用于动作、场景或材质的文字说明。',
    '按 observations 里的可见原图写 borrow。Brief 的规格、品名、动作和新画法只写入 apply，原图看不到的细节不补写为原图事实。',
    '有 priorAdmissions 时，按各案的具体问题调整借法或换图。原图适合而借法有问题时，明确能借的画面位置与必须重新画的物件。主图和辅助图各有具体作用。',
    'searchDirection 标注的公开图及已有专用图只给其所属方向。稳健方向观察品类惯例，产品方向观察具体特征，用户方向观察使用情境和行为。销售判断需要销售来源。',
    '公开图在 why 说明任务关系和取舍，在 avoid 指明需要用本案内容重新设计的部分。sharedBrand 只列本案上传的官方标志、VI 等实际约束。辅助按重要性排序。',
    'directions 只返回输入 directions 列出的固定字母键。每键填写对应 main、auxiliary 和 gap。填写图册给出的 source 编号。若有 acceptedDirections，已准入方向沿用整包，只处理仍需选参考的方向。',
  ].filter(Boolean).join('\n');
  const fields = sources.some(s=>s.sourceUrl) ? publicUse.properties : use.properties;
  const itemSchema = object({...fields,source:{...string,enum:sources.map(s=>s.imageId)}});
  const directionFields = {main:{anyOf:[itemSchema,{type:'null'}]},auxiliary:{...list(itemSchema),maxItems:2},gap:string};
  const directionSchema = object(directionFields);
  const outputSchema = object({sharedBrand:list(itemSchema),directions:object(Object.fromEntries(directionIds.map(id=>[id,directionSchema])))});
  const result = await call(selection,readSeparately ? [] : sources,outputSchema,{
    assignment:'比稿负责人分配参考图',context:JSON.stringify(packet),
  });
  const byDirection=result.parsedOutput?.directions;
  if (!byDirection || Object.keys(byDirection).length!==directionIds.length ||
      !directionIds.every(id=>Object.hasOwn(byDirection,id) && byDirection[id] && typeof byDirection[id]==='object')) {
    throw invalidOutput('参考图按当前待选方向的固定字母键 '+directionIds.join('、')+' 交接。');
  }
  const rows=directions.map(({id,name})=>({...byDirection[id],direction:name}));
  const shared = result.parsedOutput.sharedBrand;
  if (!Array.isArray(shared)) throw invalidOutput('请明确全案共用的品牌素材。');
  const assigned = new Map(), plans = new Map();
  function bind(entry, role, owner) {
    const image = sources.find(s=>s.imageId===entry?.source);
    if (!image || !nonempty(entry.borrow) || !nonempty(entry.apply)) throw invalidOutput('参考图身份或借鉴用途不完整。');
    if (image.sourceUrl && (!nonempty(entry.why) || !nonempty(entry.avoid))) throw invalidOutput('公开参考缺少采用理由或禁止照搬的边界。');
    if (image.sourceUrl && role==='sharedBrand') throw invalidOutput('公开竞品只能供方向借鉴，不能作为本案共用品牌资产。');
    if ((image.direction && image.direction!==owner) || assigned.has(image.sha256) || (previousOwners.has(image.sha256) && previousOwners.get(image.sha256)!==owner)) {
      throw invalidOutput('不同方向的专用参考图发生冲突，请核对参考图归属。');
    }
    assigned.set(image.sha256,owner);
    return {image,reference:{role,name:image.name,sha256:image.sha256,...(image.sourceUrl ? {pageUrl:image.pageUrl,sourceUrl:image.sourceUrl,query:image.query,why:entry.why.trim(),avoid:entry.avoid.trim()} : {}),
      ...(observations.has(image.sha256) ? {observation:observations.get(image.sha256)} : {}),borrow:entry.borrow.trim(),apply:entry.apply.trim()}};
  }
  const common = shared.map(e=>bind(e,'sharedBrand','sharedBrand'));
  const primaries = new Map();
  for (const row of rows) {
    if (row.main!==null && (typeof row.main!=='object' || Array.isArray(row.main)) ||
        !Array.isArray(row.auxiliary) || row.auxiliary.length>2) throw invalidOutput('每方向最多一张主参考、两张辅助参考。');
    const empty = row.main && row.main.source===null && !nonempty(row.main.borrow) && !nonempty(row.main.apply) && nonempty(row.gap);
    primaries.set(row.direction,row.main && !empty ? [bind(row.main,'main',row.direction)] : []);
  }
  for (const row of rows) {
    const primary = primaries.get(row.direction);
    const auxiliary = row.auxiliary.flatMap(entry=>{
      const image=sources.find(source=>source.imageId===entry?.source);
      if (image && assigned.has(image.sha256)) return [];
      return [bind(entry,'auxiliary',row.direction)];
    });
    const remaining = 4 - Number(packet.previousDrafts.includes(row.direction)) - common.length - primary.length;
    if (remaining<0 && active.includes(row.direction)) throw invalidOutput('「'+row.direction+'」的共享品牌图和主参考超出生图附件上限，请注明本轮必须保留的品牌图后重试。');
    const selected = [...primary,...common,...auxiliary.slice(0,Math.max(0,remaining))];
    const handoff = {direction:row.direction,selectionThread:result.threadId,references:selected.map(s=>s.reference),
      ...(referenceTasks?.has(row.direction) ? {referenceTask:referenceTasks.get(row.direction)} : {}),
      deferred:auxiliary.slice(Math.max(0,remaining)).map(s=>({...s.reference,reason:'本轮参考包优先保留主参考、品牌约束和最相关的文字借鉴线索。'}))};
    plans.set(row.direction,{images:selected.map(s=>s.image),handoff,missing:!primary.length,gap:row.gap});
  }
  return plans;
}

const roles = {visual:['quality','composition'],brand:['compatibility','translation'],user:['understanding','feasibility'],spread:['memory','difference']};
const voteSchema = dimensions=>object({
  items:{...list(object({dimension:{...string,enum:dimensions},score:{enum:[1,2,3,4,5,null]},evidence:string})),minItems:2,maxItems:2},
  hardReject:string,
});
const challengeSchema = object({issue:string, evidence:string});
const rulingFields = Object.fromEntries(Object.keys(roles).map(role=>[role,object({status:{...string,enum:['通过','阻断']},reason:string})]));
const rulingSchema = object({decisions:object(rulingFields),compatible:{type:'boolean'},reason:string});

export async function reviewReferencePlan({call, project, direction, images, handoff, otherDirections}) {
  const references=handoff.references.map((ref,index)=>({...ref,imageNumber:index+1}));
  const packet = {direction,references,otherDirections,...(handoff.referenceTask ? {referenceTask:handoff.referenceTask} :
    {brief:project.brief,strategy:project.strategyText,directions:project.copyReview?.draft?.directions ?? project.directions})};
  const scope='附件依图号对应公开参考原图或本案上传的参考素材，目前尚未生成本案稿件。审核借法能否承接给定的美术任务，区分原图可见特征与 apply、avoid 约定的新画法。一项能说明本案画面关系的可见手法即可成立。原参考品牌、规格、场景或载体不同，只在借法必须保留且无法转译时影响评分。硬退须引用具体借法及图上依据，证明照搬风险或关键要求冲突。成稿印字、规格、相似度和设计完成度出图后另审。';
  const instruction=scope+' 两项维度均须判断。证据简述图号、实际位置、可见特征及转译用途。对比没有项目上下文时的原图观察，读不清就标明。总分尺度为 1 至 5。1事实抵触，2机制不成立，3连接或执行条件缺失，4有图卡依据，5另需具体对照优势。仅在有关键未核事实时填 null。没有销售依据不能断言销量。借法只换品牌文案或配色且复制整体结构时写入 hardReject，无成立硬伤留空。';
  const votes=await independentCalls(Object.entries(roles),async ([role,dimensions])=>{
    const result=await call(instruction,images,voteSchema(dimensions),{delegate:true,rules:[],assignment:'公开参考包独立评分',context:JSON.stringify({...packet,role,dimensions})});
    const vote=result.parsedOutput;
    if (!Array.isArray(vote?.items) || vote.items.length!==2 || !dimensions.every(key=>vote.items.some(i=>i.dimension===key && nonempty(i.evidence) &&
        (i.score===null || (Number.isInteger(i.score) && i.score>=1 && i.score<=5)))) || typeof vote.hardReject!=='string') throw invalidOutput('公开参考包缺少完整的本岗原票及图证。');
    return {role,threadId:result.threadId,...vote};
  });
  const challenges=await independentCalls(votes,async vote=>{
    const ctx={...packet,role:vote.role};
    const task={delegate:true,rules:[],assignment:'公开参考包对抗',context:JSON.stringify(ctx)};
    const first=await call(scope+' 先独立检查本岗两维有无遗漏或过度推断，写明可见依据。不另打分，无异议填空 issue。',images,challengeSchema,task);
    if(typeof first.parsedOutput?.issue!=='string' || !nonempty(first.parsedOutput.evidence)) throw invalidOutput('公开参考对抗缺少核对依据。');
    const checked=await call(scope+' 结合独立发现核对原票。只保留仍成立且有证的问题，缺少问题就留空 issue。不另打分。',images,challengeSchema,{...task,context:JSON.stringify({...ctx,findings:first.parsedOutput,vote})});
    if(typeof checked.parsedOutput?.issue!=='string' || !nonempty(checked.parsedOutput.evidence)) throw invalidOutput('公开参考对抗缺少核对依据。');
    return {role:vote.role,independent:{threadId:first.threadId,...first.parsedOutput},threadId:checked.threadId,...checked.parsedOutput};
  });
  const result=await call(scope+' 按岗逐条裁定对抗意见。decisions 按 visual、brand、user、spread 四个岗的固定键填写。该岗有仍成立且足以阻断的具体问题时填「阻断」，reason 引用问题并指出图号或拟采用的做法。独立裁定发现新问题时也要指出具体依据。无具体阻断问题填「通过」。另核主参考机制、辅助互补性、跨方向重复和整体照搬风险，compatible 表示借鉴方案相容。不可改原分。',images,rulingSchema,{delegate:true,rules:[],assignment:'公开参考包独立裁定',context:JSON.stringify({...packet,votes,challenges})});
  const ruling=result.parsedOutput;
  if (typeof ruling?.compatible!=='boolean' || !nonempty(ruling.reason) || Object.keys(ruling.decisions ?? {}).length!==4 ||
      !Object.keys(roles).every(role=>{
        const decision=ruling.decisions[role];
        return ['通过','阻断'].includes(decision?.status) && nonempty(decision.reason);
      })) throw invalidOutput('公开参考包裁定须按四岗分别填写通过或具体阻断。');
  const decisions=Object.keys(roles).map(role=>({role,...ruling.decisions[role],accepted:ruling.decisions[role].status==='阻断'}));
  const blockers=[];
  for (const vote of votes) {
    for (const item of vote.items) if (item.score===null || item.score<4) blockers.push(vote.role+'.'+item.dimension+'：'+item.evidence);
    if (vote.hardReject.trim()) blockers.push(vote.hardReject);
  }
  for (const d of decisions) if(d.accepted) blockers.push(d.reason);
  if (!ruling.compatible) blockers.push(ruling.reason);
  const threads=[handoff.selectionThread,...votes.map(v=>v.threadId),...challenges.flatMap(c=>[c.independent.threadId,c.threadId]),result.threadId];
  if(threads.some(t=>!nonempty(t)) || new Set(threads).size!==threads.length) throw invalidOutput('公开参考包复核会话未独立。');
  return {scope:'direction',direction,references:handoff.references,hashes:images.map(i=>i.sha256),votes,challenges,ruling:{threadId:result.threadId,...ruling,decisions},passed:!blockers.length,blockers};
}
