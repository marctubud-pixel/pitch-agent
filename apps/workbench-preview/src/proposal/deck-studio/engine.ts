import './vendor/deck-engine.js';
import { chartLayout,type Plot } from './chart-layout';
import { templateInput } from './templates';
import type { Box, Chart, Draft, Font, Media, Node, Page, Template, Theme } from './model';

interface Engine {
  VERSION: string; FONTS: Record<string, { family: string; fallback: string; sys: { key: string; }; }>;
  STYLES: Record<string,{fonts:{d:string;b:string;m:string};numFont?:string}>;
  util:{wrapLines(text:string,width:number,font:string,weight:number,size:number,spacing:number):string[]};
  setPlatform(p: object): void; build(project: object, idx: number): unknown;
}
declare global { var DeckEngine: Engine; }
const engine = globalThis.DeckEngine;
if (engine.VERSION !== '1.7.0') throw new Error('版式内核版本不符');

engine.setPlatform({
  fontReady: (decl: string, chars: string) => globalThis.document?.fonts?.check(decl, chars) ?? true,
  loadFont: (decl: string, chars: string) => globalThis.document?.fonts?.load(decl, chars),
  zip: () => Promise.reject(new Error('仅用工作台原生导出')),
  loadImage: () => Promise.reject(new Error('仅用已核验图片'))
});

function obj(x: unknown): Record<string, unknown> {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) throw new Error('版式输出对象无效');
  return Object.fromEntries(Object.entries(x));
}
function num(x: unknown): number {
  if (typeof x !== 'number' || !Number.isFinite(x)) throw new Error('版式坐标或字号无效');
  return x;
}
function str(x: unknown): string {
  if (typeof x !== 'string') throw new Error('版式文本字段无效');
  return x;
}
function color(x: unknown) {
  const c = str(x);
  if (!/^#[a-f\d]{6}$/i.test(c)) throw new Error('版式颜色无效');
  return c;
}
function box(e: Record<string, unknown>): Box {
  const b = { x: num(e.x), y: num(e.y), w: num(e.w), h: num(e.h) };
  if (b.w <= 0 || b.h <= 0) throw new Error('版式容器无效');
  return b;
}
function font(e: Record<string, unknown>, ink: string): Font {
  const f = engine.FONTS[str(e.fk)];
  if (!f) throw new Error('版式字体未适配');
  return { face: f.family, fallback: f.fallback, weight: num(e.fw), size: num(e.size), color: color(e.color ?? ink) };
}
function oneOf<A extends string, B extends string, C extends string>(x: unknown, a: A, b: B, c: C): A | B | C {
  if (x === a) return a;
  if (x === b) return b;
  if (x === c) return c;
  throw new Error('文字对齐方式无效');
}
export function checkedNodes(raw: unknown, slots: ReadonlyMap<string, Media | Chart>, accent: string, measuredPlots: ReadonlyMap<string,Plot> = new Map()): { bg: string; nodes: Node[]; } {
  const built = obj(raw), ink = color(obj(built.th).text), bg = color(built.bg), seen = new Set<string>();
  if (!Array.isArray(built.els)) throw new Error('版式缺少图元');
  const nodes: Node[] = built.els.flatMap((rawNode: unknown): Node[] => {
    const e = obj(rawNode), opacity = num(e.op ?? 1);
    const rotate = e.rotate ? num(e.rotate) : undefined;
    const gradient = e.grad ? obj(e.grad) : undefined;
    switch (e.k) {
      case 'line': return [{ kind: 'line', rotate, x1: num(e.x1), x2: num(e.x2), y1: num(e.y1), y2: num(e.y2), width: num(e.w), color: color(e.color), opacity }];
      case 'rect': case 'ellipse': return [{
        ...box(e),
        kind: e.k, rotate,
        gradient: gradient ? {from:color(gradient.from),to:color(gradient.to),angle:num(gradient.ang)} : undefined,
        fill: e.fill ? color(e.fill) : null,
        stroke: e.line ? color(e.line) : null,
        lw: num(e.lw ?? 1),
        radius: num(e.r ?? 0),
        opacity
      }];
      case 'text': {
        if (e.fitOk !== true) throw new Error(`版式文字超出容量：${String(e.bind ?? e.value)}`);
        const lines = Array.isArray(e.lines) ? e.lines.map(str) : [], runs = Array.isArray(e.runs) ? e.runs.map((r: unknown) => {
          const run = obj(r);
          return { ...font(run, ink), text: str(run.value) };
        }) : [];
        if (!lines.length && !runs.some(r => r.text)) return [];
        return [{
          kind: 'text', rotate, vertical:e.vertical === true,
          highlight: e.hl ? {word:str(e.hl).trim(),color:color(e.hlColor)} : undefined,
          ...box(e),
          ...font(e, ink),
          lines,
          runs,
          lh: num(e.lh),
          ls: num(e.ls),
          align: oneOf(e.align, 'left', 'right', 'center'),
          valign: oneOf(e.valign, 'top', 'middle', 'bottom'),
          opacity
        }];
      }
      case 'image': {
        if (!e.id && !slots.has(String(e.bind))) return [];
        const bind = str(e.bind), value = slots.get(bind);
        if (!value || seen.has(bind) || value.id !== e.id) throw new Error(`图片槽不匹配：${bind}`);
        seen.add(bind);
        if ('kind' in value) {
          const frame = box(e);
          return [{ kind: 'chart', ...frame, chart: value, bind, color: accent, plot: measuredPlots.get(bind) ?? chartLayout(frame, value, accent) }];
        }
        if (!/^data:image\/(png|jpeg);base64,/.test(value.data) || value.width <= 0 || value.height <= 0) throw new Error('缺少本地图片');
        const b = box(e), scale = Math.min(b.w / value.width, b.h / value.height), w = value.width * scale, h = value.height * scale;
        return [{ kind: 'image', rotate, x: b.x + (b.w - w) / 2, y: b.y + (b.h - h) / 2, w, h, bind, image: value }];
      }
      default: throw new Error(`未适配的版式图元：${String(e.k)}`);
    }
  });
  if (seen.size !== slots.size) throw new Error('版式未生成全部具名图片槽');
  return { bg, nodes };
}
// The vendor persona reserves a photo, a quotation panel and two permanent
// columns. Keep its header, footer, named photo and type styles, then place only
// the actual project facts, using the engine's own font measurement.
function fitPersona(built: Record<string, unknown>, t: Extract<Template,{kind:'persona.single'}>, title: string) {
  const elements=(built.els as unknown[]).map(obj);
  const photo=elements.findIndex(e=>e.bind==='img');
  const footer=elements.findIndex((e,i)=>i>photo && Number(e.y)>=670);
  if(photo<0 || footer<0) throw Error('人物模板的照片或页脚结构发生变化');
  const heading=elements.find(e=>e.bind==='name')!, body=elements.find(e=>e.bind==='profile')!;
  const th=obj(built.th);
  const x=t.image?520:80, width=t.image?680:1050;
  let y=180;
  const content:Record<string,unknown>[]=[];
  const seen=new Set([title.trim()]);
  function add(value:string|undefined,base:Record<string,unknown>,size:number,gap:number,label?:string) {
    const text=value?.trim();
    if(!text || seen.has(text)) return;
    seen.add(text);
    if(label){
      content.push({...body,value:label,lines:[label],size:16,lh:1.4,fw:700,color:th.primaryInk,x,y,w:width,h:24,fitOk:true});
      y+=33;
    }
    const lines=engine.util.wrapLines(text,width,str(base.fk),num(base.fw),size,0);
    const height=Math.ceil(lines.length*size*1.5);
    content.push({...base,value:text,lines,size,lh:1.5,ls:0,x,y,w:width,h:height,fitOk:true});
    y+=height+gap;
  }
  add(t.name,heading,32,20);
  add(t.profile,body,23,35);
  add(t.tags,body,17,22);
  add(t.quote,heading,24,26);
  add(t.needs?.join('、'),body,20,18,'需求');
  add(t.pains?.join('、'),body,20,18,'痛点');
  add(t.implication,body,22,0,'对设计的启示');
  if(!content.length || y>658) throw Error('版式文字超出容量：人物观察');
  built.els=[...elements.slice(0,photo),...(t.image?[elements[photo]]:[]),...content,...elements.slice(footer)];
}

// The vendor supplies the chart geometry as editable bars and labels. Preserve
// that very geometry for SVG and publish the same series as a native Office chart.
function marketColumns(page:Pick<Page,'id'|'title'>,t:Extract<Template,{kind:'market.bars'}>,built:Record<string,unknown>, slots:ReadonlyMap<string,Media|Chart>, accent:string) {
  const all=(built.els as unknown[]).map(obj);
  const start=all.findIndex(e=>e.bind==='chartTitle')+1;
  const end=all.findIndex(e=>e.bind==='series.'+(t.series.length-1)+'.label')+1;
  if(!start || end<=start) throw Error('市场模板图表槽发生变化');
  const children=checkedNodes({...built,els:all.slice(start,end)},new Map(),accent).nodes;
  const colors=children.flatMap(n=>n.kind==='rect'?[n.fill || accent]:[]);
  const values=t.series.map(row=>Number(row.value));
  const chart:Chart={kind:'column',id:'market-'+page.id,title:page.title,basis:t.source ?? '',unit:t.unit ?? '',
    labels:t.series.map(r=>r.label),values,min:0,max:Math.max(...values,1)};
  const frame={x:536,y:232,w:628,h:400};
  const plot={box:frame,min:0,max:chart.max,minY:0,maxY:chart.max,points:[],bars:[],
    labels:children,valueLabels:[],groupColors:colors,rowY:[]};
  // Insert the chart at the original layer, below any subsequent logos or marks.
  const marker={k:'image',...frame,id:chart.id,bind:'market-chart'};
  return checkedNodes({...built,els:[...all.slice(0,start),marker,...all.slice(end)]},
    new Map([...slots,['market-chart',chart]]),accent,new Map([['market-chart',plot]]));
}

export function compile(drafts: Draft[], brand: string, theme: Theme): Page[] {
  if (!drafts.length || new Set(drafts.map(d => d.id)).size !== drafts.length) throw new Error('页数或页面身份无效');
  const inputs = drafts.map(templateInput);
  const marks = [theme.brandLogo,theme.agencyLogo].filter((img):img is Media=>!!img);
  const project = {
    name:brand, brand:{name:theme.brandName || brand,logo:theme.brandLogo?.id},
    agency:{name:theme.agencyName || '', logo:theme.agencyLogo?.id,place:theme.agencyName || theme.agencyLogo ? 'cover+closing' : 'none'},
    theme:{...theme,gradient:theme.gradient || 'none'},
    assets:Object.fromEntries(marks.map(img=>[img.id,{src:img.data,w:img.width,h:img.height}])),
    slides:inputs.map(input=>input.slide),
  };
  // The engine fits text before returning editable geometry. Apply a declared font at that same step.
  const style=engine.STYLES[theme.style];
  const previousFonts=style.fonts;
  const customKeys:string[]=[];
  style.fonts={...previousFonts};
  try {
    for (const [role, family] of [['d',theme.fonts?.display],['b',theme.fonts?.body]] as const) {
      if (!family) continue;
      const key='project-'+role+'-'+family;
      engine.FONTS[key]={...engine.FONTS[previousFonts[role]],family};
      style.fonts[role]=key;
      customKeys.push(key);
    }
    return drafts.map(({template,...page},i)=>{
      const built=obj(engine.build(project,i));
      const slots=new Map(inputs[i].slots);
      // Vendor decorations identify a logo by source bytes, while ordinary pictures have named slots.
      if (marks.length && Array.isArray(built.els)) {
        built.els=built.els.map((element:unknown,index:number)=>{
          const el=obj(element);
          if (el.k!=='image' || !el.deco || !el.src || el.bind) return el;
          const mark=marks.find(img=>img.data===el.src);
          if (!mark) return el;
          const bind=mark.id+'-'+index;
          slots.set(bind,mark);
          return {...el,bind,id:mark.id};
        });
      }
      if(template.kind==='persona.single') fitPersona(built,template,page.title);
      const content=template.kind==='market.bars' ? marketColumns(page,template,built,slots,theme.primary) : checkedNodes(built,slots,theme.primary);
      return {...page,template:template.kind,...content};
    });
  } finally {
    style.fonts=previousFonts;
    for (const key of customKeys) delete engine.FONTS[key];
  }
}
