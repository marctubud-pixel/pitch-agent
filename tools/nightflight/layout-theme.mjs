import {basename, join} from 'node:path';
import {constants} from 'node:fs';
import {open} from 'node:fs/promises';
import {createLocalPdfExtractor, PDF_LIMITS} from '../workbench/intake-pdf.mjs';
import {pythonBinary} from './runtime-dependencies.mjs';

const styles = {
  '现代简约':'modern','国潮中国风':'guochao','高端雅致':'elegant','科技未来':'tech','潮酷街头':'street',
  '童趣 IP':'playful','清新自然':'fresh','商务稳重':'business','大字冲击':'bold','暗黑荧光':'neon',
  '杂志编辑':'editorial','温暖生活':'warm','色框卡片':'panel',
};
const fieldNames = {
  primary:['品牌色','品牌主色','主色','主色调','primary'], accent:['品牌辅助色','辅助色','强调色','辅色','accent'],
  brandName:['品牌','品牌名','品牌名称'], agencyName:['提案方','提案机构','代理公司','agency'],
  brandLogo:['品牌标志','品牌Logo','品牌 Logo','Logo'],agencyLogo:['提案方标志','提案方Logo','提案方 Logo','agency logo'],
  display:['标题字体','标题字'],body:['正文字体','正文字','品牌字体','字体'],style:['提案风格','版式风格','排版风格','PPT风格'],
  gradient:['渐变','渐变模式'],mode:['主题模式','版式模式'],
};
const fields = new Map(Object.entries(fieldNames).flatMap(([key,names])=>names.map(name=>[name.toLowerCase(),key])));
const hex = text => text?.match(/#[0-9a-f]{6}(?![0-9a-f])/i)?.[0].toUpperCase();
const font = text => text && /^[\p{L}\p{N}][\p{L}\p{N} _-]{0,59}$/u.test(text) ? text : undefined;

function readFields(text, target) {
  for (const entry of text.split(/[\n；;，]/u)) {
    const line = entry.trim().replace(/^(?:[-*#]+\s*|\|\s*)/,'').replaceAll('**','');
    const found=line.match(/^([^:：|]{1,20})\s*[:：|]\s*([^|]+)/u);
    const key=found && fields.get(found[1].trim().toLowerCase());
    if (key) target[key]=found[2].trim().replace(/[。;；]+$/u,'').trim();
  }
}

async function fileBytes(root,name,limit) {
  if (!name || basename(name)!==name || /[\\/:\0]/.test(name) || name.startsWith('.')) throw Error('品牌资料文件名无效');
  const file=await open(join(root,name),constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
  try {
    const stat=await file.stat();
    if (!stat.isFile() || stat.size>limit) throw Error('品牌资料文件超出大小限制：'+name);
    return await file.readFile();
  } finally {await file.close();}
}

function inferCategoryPalette(brief = '') {
  const s = String(brief || '');
  if (!s.trim()) return null;
  if (/猫|狗|宠物|幼猫|幼犬|猫粮|狗粮|母婴|婴儿|宝宝|烘焙|面包|糕点|饼干|燕麦|牛奶|羊乳|乳品|零食|坚果|甜品|蜂蜜|食品/u.test(s)) {
    return { primary: '#2C3A35', accent: '#C98A3E', style: 'warm' };
  }
  if (/茶|抹茶|咖啡|拿铁|果茶|奶茶|新中式|东方|草本|酒|白酒|青梅|清酒|精酿|饮品|果汁|气泡水/u.test(s)) {
    return { primary: '#23332C', accent: '#B57B45', style: 'elegant' };
  }
  if (/护肤|美妆|香氛|香水|精华|面霜|口红|洗护|洗发|沐浴|彩妆|个护/u.test(s)) {
    return { primary: '#2E2A27', accent: '#B8846B', style: 'editorial' };
  }
  if (/服饰|家居|生活|文创|博物馆|展览|书店|酒店|民宿|文旅|艺术|户外|露营/u.test(s)) {
    return { primary: '#293038', accent: '#B86B43', style: 'editorial' };
  }
  if (/科技|智能|AI|芯片|软件|SaaS|新能源|汽车|数码|电竞|手机/iu.test(s)) {
    return { primary: '#162A4C', accent: '#0EA5A0', style: 'tech' };
  }
  return null;
}

export async function projectTheme(project,root,kind,signal) {
  const hints={}, attachments=project.attachments ?? [];
  // Only original brand instructions can set the identity. Research and competitor images are excluded.
  const docs=attachments.filter(a=>a.kind==='attachment' && /\.(md|txt|pdf)$/i.test(a.name) &&
    !/竞品|竞对|参考|对标|案例|competitor|benchmark|reference/i.test(a.name));
  const materials=docs.filter(a=>/brief|简报|设计需求|品牌(?:规范|手册|资料)|视觉规范|(?:^|[ _-])vi(?:[ _.-]|$)/i.test(a.name) ||
    !project.brief?.trim() && docs.length===1);
  const all=new Map();
  for (const a of materials) {
    const documentFields={};
    if (/\.(?:md|txt)$/i.test(a.name)) readFields((await fileBytes(root,a.name,12*1024*1024)).toString('utf8'),documentFields);
    if (/\.pdf$/i.test(a.name)) {
      const bytes=await fileBytes(root,a.name,PDF_LIMITS.bytes);
      const result=await createLocalPdfExtractor({pythonBinary:await pythonBinary()}).extract(bytes,{signal});
      readFields(result.text || '',documentFields);
    }
    for (const [key,value] of Object.entries(documentFields)) {
      if (!all.has(key)) all.set(key,new Set());
      all.get(key).add(value);
    }
  }
  for (const [key,values] of all) if (values.size===1) hints[key]=[...values][0];
  readFields(project.brief || '',hints);
  const categoryPalette = inferCategoryPalette(project.brief || '');
  const style=(Object.hasOwn(styles,hints.style) ? styles[hints.style] : undefined) || (Object.values(styles).includes(hints.style) ? hints.style : undefined) ||
    ({packaging: categoryPalette?.style === 'warm' ? 'warm' : 'elegant', kv:'bold'}[kind] || categoryPalette?.style || 'business');
  const logos={};
  const available=attachments.filter(a=>a.kind==='attachment' && /\.(?:png|jpe?g)$/i.test(a.name));
  for (const [key,guess] of [['brandLogo',/^(?:(?:品牌|brand)[ _-]*)?(?:logo|标志)(?:[ _-]*(?:正式|透明|正稿|final))?\./i],['agencyLogo',/^(?:agency|提案方)[ _-]*(?:logo|标志)\./i]]) {
    const picks=hints[key] ? available.filter(a=>a.name===hints[key]) : available.filter(a=>guess.test(a.name));
    if (picks.length!==1) continue;
    const name=picks[0].name, bytes=await fileBytes(root,name,12*1024*1024);
    const mime=bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')) ? 'png' :
      bytes[0]===255 && bytes[1]===216 ? 'jpeg' : null;
    if (!mime) throw Error('品牌标志需要有效的 PNG 或 JPEG：'+name);
    logos[key]={id:'nightflight-'+key,alt:name,data:'data:image/'+mime+';base64,'+bytes.toString('base64')};
  }
  return {
    primary:hex(hints.primary) || categoryPalette?.primary || '#143F9B',
    accent:hex(hints.accent) || categoryPalette?.accent || '#08746D',
    style,
    mode:({浅色:'light',深色:'dark',light:'light',dark:'dark'})[hints.mode] || (['tech','street','neon'].includes(style)?'dark':'light'),
    gradient:({柔和:'soft',轻渐变:'soft',深渐变:'deep',soft:'soft',deep:'deep'})[hints.gradient] || 'none',
    fonts:{display:font(hints.display),body:font(hints.body)},
    brandName:hints.brandName?.slice(0,70),agencyName:hints.agencyName?.slice(0,70),...logos,
  };
}
