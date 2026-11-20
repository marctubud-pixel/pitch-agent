// This module runs in the same offline browser as Deck Studio's font and image measurement.
export async function compileOutline(outline, sources, { compile, paginateText }, theme) {
  const status = outline.hasGaps || outline.gaps.length ? '本地试排 · 含待补材料' : '本地试排';
  const footer = '夜航提案台 · ' + status;
  const media = new Map();
  for (const source of sources) {
    const img = new Image();
    img.src = source.data;
    await img.decode();
    media.set(source.id, { ...source, width: img.naturalWidth, height: img.naturalHeight });
  }

  const graphemes = new Intl.Segmenter('zh-CN', { granularity: 'grapheme' });
  function label(value, capacity) {
    const letters = [...graphemes.segment(value)].map(part => part.segment);
    if (letters.length <= capacity) return value;
    const head = letters.slice(0, capacity - 1).join('');
    return (head.match(/^(.{6,}?)[。！？\n]/su)?.[1] ?? head).trimEnd() + '…';
  }

  function draft(page, template) {
    return {
      id: page.instance_id, title: label(page.client_title, 28), chapter: page.chapter,
      eyebrow: label(page.direction ? page.chapter.split(' · ')[0] : page.chapter, 20),
      caption: '', notes: [page.client_title, page.chapter, page.status, page.material_ref].filter(Boolean).join('\n'), template,
    };
  }

  // Some engine layouts store a field in metadata without showing it. Check the actual
  // text shapes as well as engine fit so the downloadable slide contains every fragment.
  const normalized = text => text.replace(/\s/gu, '');
  function visibleText(page) {
    const nodes=page.nodes.flatMap(n=>n.kind==='chart' ? [...n.plot.labels,...n.plot.valueLabels] : [n]);
    return nodes.filter(n=>n.kind==='text').map(n=>normalized(n.runs.length ? n.runs.map(r=>r.text).join('') : n.lines.join('')));
  }
  function fits(candidate, words) {
    let page;
    try { [page] = compile([candidate], footer, theme); }
    catch (error) {
      if (String(error.message).includes('版式文字超出容量')) return false;
      throw error;
    }
    const visible=visibleText(page);
    return words.filter(Boolean).every(word=>(Array.isArray(word) ? word : [word]).some(s=>visible.includes(normalized(s))));
  }

  function textPages(page, content) {
    const title = label(page.client_title, 28);
    const make = body => draft(page, { kind: 'summary.statement', statement: title, sub: body });
    const wordsFit = body => fits(make(body.trim()), [title, body]);
    if (wordsFit(content)) return [make(content)];
    if (!wordsFit('')) {
      const makeStatement = text => draft(page, { kind: 'summary.statement', statement: text.trim(), sub: '' });
      const full = [page.client_title, content].filter(Boolean).join('\n');
      return paginateText(full, text => fits(makeStatement(text), [text])).map(f => makeStatement(f.raw));
    }
    return paginateText(content, wordsFit).map(fragment => make(fragment.raw.trim()));
  }

  function fallbackPages(page) {
    const title = label(page.client_title, 28);
    let body = page.content.trim();
    if (page.type_id==='back-cover' && body && body.length<=16) {
      // Deck Studio's closing title is a large acknowledgement. The project
      // name belongs in its subtitle and stays readable even when it is longer.
      const closing={...draft(page,{kind:'closing.type',sub:page.client_title,meta:''}),title:body};
      if (fits(closing,[body,page.client_title])) return [closing];
      closing.template.sub='';
      if (fits(closing,[body])) return [...textPages(page,page.client_title),closing];
    }
    if (page.type_id === 'cover' || page.type_id === 'back-cover') {
      const cover = draft(page, {
        kind: page.type_id === 'cover' ? 'cover.type' : 'closing.type',
        sub: body, meta: '',
      });
      if (fits(cover, [title, body])) return [cover];
      cover.template.sub = '';
      if (fits(cover, [title])) return [cover, ...textPages(page, body)];
    }
    if (title !== page.client_title && !body.includes(page.client_title)) {
      body = [page.client_title, body].filter(Boolean).join('\n');
    }
    const images = page.images.map(name => {
      const img = media.get(name);
      if (!img) throw Error('逐页稿引用的图片缺失：' + name);
      return img;
    });
    if (!images.length) return textPages(page, body);

    const result = [];
    let remaining = body;
    for (let i = 0; i < images.length; i += 6) {
      const group = images.slice(i, i + 6);
      const make = text => draft(page, group.length === 1
        ? { kind: 'design.stage', image: group[0], intro: text, points: [] }
        : { kind: 'compare.lineup', items: group.map(image => ({ image, name: label(image.alt, 16), desc: '' })), sub: text });
      if (fits(make(remaining), [title, remaining])) {
        result.push(make(remaining));
        remaining = '';
      } else {
        const figure = make('');
        if (fits(figure, [title])) result.push(figure);
        else {
          // Keep oversized labels in native text on their adjoining slide(s).
          // The picture grid needs no guessed abbreviations or truncated names.
          const names = group.length > 1 ? group.map(image => image.alt).join('\n') : '';
          const grid = draft(page, { kind: 'combo.grid', items: group.map(item => ({ item, cap: '' })) });
          grid.title = page.chapter.split(' · ')[0];
          result.push(grid, ...textPages(page, names));
        }
      }
    }
    if (remaining) result.push(...textPages(page, remaining));
    return result;
  }

  // Match the client's page purpose before considering the number of images.
  // A semantic page may be followed by its unabridged evidence and source images.
  const choices=new Map();
  const continuations=new Map();
  function contentPages(page) {
    const requested=page.template && [page.template.type,page.template.variant].join('.');
    function fallback(reason) {
      choices.set(page.instance_id,reason);
      return fallbackPages(page);
    }
    if (!requested) return fallback('历史逐页稿未指定模板');
    if (['cover.type','closing.type','summary.statement'].includes(requested)) {
      const drafts=fallbackPages(page);
      if (!drafts.some(d=>d.template.kind===requested)) choices.set(page.instance_id,page.images.length ?
        '本页另含需完整呈现的原图，使用图文模板' : '实际标题或正文超出指定模板容量');
      else if (drafts.length>1) continuations.set(page.instance_id,'原页的全文分至后续页');
      return drafts;
    }
    const images=page.images.map(name=>{
      const image=media.get(name);
      if (!image) throw Error('逐页稿引用的图片缺失：'+name);
      return image;
    });
    const title=label(page.client_title,28);
    const body=page.content.trim();
    const first=body.match(/^[^。！？\n]+[。！？]?/u)?.[0] || '';
    const facts=page.semantic || {};
    let template, required=[], used=0;
    const shortWords=points=>points.flatMap(p=>[p.k,p.d]);
    switch(requested) {
      case 'section.left':
        template={kind:requested,desc:first.length<=55 ? first : '',no:''};
        required=[template.desc];
        break;
      case 'market.bars':
        if (!facts.series) return fallback('缺少同一来源、同一指标和单位的两期以上数值');
        template={kind:requested,series:facts.series,unit:facts.unit,chartTitle:'单位：'+facts.unit,
          sub:facts.scope || '',source:facts.source,findings:[{k:'对设计的启示',d:facts.implication}]};
        required=[facts.scope,facts.implication,...facts.series.flatMap(s=>[s.label,[s.value,s.value+facts.unit]])];
        break;
      case 'competitor.table':
        if (!(facts.rows?.length>=2 && facts.rows.length<=6)) return fallback('对比表需要二至六项可追溯的观察');
        template={kind:requested,headers:['可见特征'],rows:facts.rows,sub:''};
        required=facts.rows.flatMap(row=>[row.name,...row.values]);
        break;
      case 'persona.single':
        if (!facts.profile) return fallback('缺少有依据的购买或使用场景');
        template={kind:requested,name:facts.name,profile:facts.profile,implication:facts.implication,image:images[0],quote:'',tags:'',needs:[],pains:[]};
        required=[facts.name,facts.profile,facts.implication]; used=images.length ? 1 : 0;
        break;
      case 'selling.spec':
        if (!facts.specs?.length || facts.specs.length>6) return fallback('缺少一至六项明确的产品属性及其取值');
        template={kind:requested,usp:title,specs:facts.specs,image:images[0]}; required=facts.specs.flatMap(s=>[s.k,s.v]);used=images.length ? 1 : 0;
        break;
      case 'summary.pillars':
      case 'summary.list': {
        const points=facts.points || body.split('\n').map(line=>/^([^：:]{1,16})[：:]\s*(.+)$/u.exec(line)).filter(Boolean).map(m=>({k:m[1],d:m[2]}));
        if (points.length<2 || points.length>(requested==='summary.pillars' ? 4 : 6))
          return fallback('缺少可并列展示的短标题及对应说明，或项目数超出模板容量');
        template={kind:requested,points};required=shortWords(points);break;
      }
      case 'design.half':
      case 'design.stage':
      case 'mood.split':
        if (!images.length) return fallback('缺少本页绑定的原图');
        template=requested==='mood.split' ? {kind:requested,slogan:title,sub:first.length<=55 ? first : '',image:images[0],en:''}
          : {kind:requested,intro:first.length<=55 ? first : '',points:[],image:images[0]};
        used=1; required=[template.intro || template.sub];break;
      case 'series.row':
        if (images.length<2 || images.length>6) return fallback('系列横排需要二至六张已绑定原图');
        template={kind:requested,items:images.map(image=>({name:label(image.alt,16),image})),sub:''};used=images.length;break;
      case 'combo.grid':
        if (!images.length || images.length>8) return fallback('图组需要一至八张已绑定原图');
        template={kind:requested,items:images.map(item=>({item,cap:label(item.alt,16)}))};used=images.length;break;
      case 'compare.lineup':
        if (images.length<2 || images.length>6) return fallback('并排比较需要二至六张同版作品');
        template={kind:requested,items:images.map(image=>({image,name:label(image.alt,16),desc:''})),sub:''};used=images.length;break;
      default: return fallback('旧稿模板尚未适配：'+requested);
    }
    const candidate=draft(page,template);
    if (!fits(candidate,required)) return fallback('指定模板的内容未全部显示，或字号与可用空间无法容纳实际文案');
    const rendered=compile([candidate],footer,theme)[0];
    const visible=visibleText(rendered);
    // Compare only the editor's two known labels with their matching, actually
    // rendered slots. Dates, numbers, qualifiers and questions remain significant.
    const statement=text=>normalized(text).replace(/[。．.]$/u,'');
    const shown=new Set(visible.map(statement));
    const labelledSlots={
      '依据':requested==='market.bars' ? facts.scope : requested==='persona.single' ? facts.profile : '',
      '对策略的用处':facts.implication,
    };
    function alreadyShown(line) {
      if (shown.has(statement(line))) return true;
      const match=/^(依据|对策略的用处)[：:]\s*(.+)$/u.exec(line.trim());
      if (!match) return false;
      const slot=labelledSlots[match[1]];
      return Boolean(slot && statement(slot)===statement(match[2]) && shown.has(statement(slot)));
    }
    const unshown=[page.client_title,...body.split('\n')].filter(s=>s.trim() && !alreadyShown(s));
    const continuation=unshown.join('\n');
    const remaining=page.images.slice(used);
    if (continuation || remaining.length) continuations.set(page.instance_id,[
      continuation && '原页部分标题、正文或依据未在首张模板完整显示',
      remaining.length && ('另有 '+remaining.length+' 张原图需完整展示'),
    ].filter(Boolean).join('；'));
    return [candidate,...(continuation || remaining.length ? fallbackPages({...page,type_id:'continuation',content:continuation,images:remaining}) : [])];
  }

  const chapters = [...new Set(outline.pages.map(p => p.chapter))];
  const chapterTitles = new Map(chapters.map((chapter, i) => {
    const short = label(chapter, 21);
    // Two author-supplied names can share the same opening words.
    const distinct = short === chapter ? short : (i + 1) + ' · ' + short;
    return [chapter, distinct];
  }));
  function contentsPages(page, starts) {
    const rows = chapters.map(chapter => ({ title: chapterTitles.get(chapter), page: starts.get(chapter) }));
    const result = [];
    for (let i = 0; i < rows.length;) {
      let count = Math.min(8, rows.length - i);
      for (; count > 0; count--) {
        const items = rows.slice(i, i + count);
        const candidate = draft(page, { kind: 'contents.list', items });
        if (fits(candidate, items.flatMap(item => [item.title, 'P' + String(item.page).padStart(2, '0')]))) {
          result.push(candidate);
          break;
        }
      }
      if (!count) throw Error('逐页稿章节名超出目录容量：' + rows[i].title);
      i += count;
    }
    return result;
  }

  const tocIndex = outline.pages.findIndex(p => p.type_id === 'toc');
  if (outline.pages[0]?.type_id !== 'cover' || tocIndex !== 1 ||
      new Set(outline.pages.map(p => p.instance_id)).size !== outline.pages.length) {
    throw Error('逐页稿需从封面、目录开始，每页标识必须唯一');
  }
  const groups = outline.pages.map(p => p.type_id === 'toc' ? [] : contentPages(p));
  let starts;
  let priorCount;
  do {
    priorCount = groups[tocIndex].length;
    starts = new Map();
    let number = 1;
    outline.pages.forEach((p, i) => {
      if (!starts.has(p.chapter)) starts.set(p.chapter, number);
      number += groups[i].length;
    });
    groups[tocIndex] = contentsPages(outline.pages[tocIndex], starts);
  } while (groups[tocIndex].length !== priorCount);
  const contents = [...starts].map(([chapter, start_page]) => ({ chapter, display_title: chapterTitles.get(chapter), start_page }));
  const drafts = [];
  const fullTitles = [];
  const plannedPages = groups.map((group, i) => {
    const page = outline.pages[i];
    const first_page = drafts.length + 1;
    for (const [index, d] of group.entries()) {
      drafts.push({ ...d, id: page.instance_id + '#' + (index + 1) });
      fullTitles.push(page.client_title);
    }
    return {
      ...page, display_title: group[0].title, first_page, last_page: drafts.length,
      applied_templates:group.map(d=>d.template.kind),
      ...(continuations.has(page.instance_id) ? {continuation_reason:continuations.get(page.instance_id)} : {}),
      ...(choices.has(page.instance_id) ? {fallback_reason:choices.get(page.instance_id)} : {}),
      ...(page.type_id === 'toc' ? { content: contents.map(c => c.display_title + '　P' + String(c.start_page).padStart(2, '0')).join('\n') } : {}),
    };
  });
  return {
    pages: compile(drafts, footer, theme).map((p, i) => ({ ...p, title: fullTitles[i] })), status,
    outline: { ...outline, contents, pages: plannedPages, physical_page_count: drafts.length },
  };
}

// Runs inside headless Chromium with its actual font metrics and image decoder.
export async function legacyPages(sections, { compile, paginateText }, theme) {
  // The engine repeats its brand argument in a fixed-width page footer.
  // Nightflight project titles come from the Brief and belong in the deck metadata.
  const footerBrand = '夜航提案台';
  const drafts = [];
  for (const section of sections) {
    const base = { title: section.chapter, eyebrow: section.chapter, chapter: section.chapter, caption: '', notes: section.name };
    const first = drafts.length + 1;
    if (section.data) {
      const img = new Image();
      img.src = section.data;
      await img.decode();
      drafts.push({ ...base, id: 'page-' + first, template: {
        kind: 'design.stage', intro: '', points: [], image: {
          id: section.name, data: section.data, width: img.naturalWidth, height: img.naturalHeight, alt: section.name,
        },
      } });
    } else {
      const makeDraft = (text, ordinal = 0) => ({
        ...base, id: 'page-' + (first + ordinal), notes: section.name + '\n' + text,
        template: { kind: 'summary.statement', statement: text.trim(), sub: '' },
      });
      const normalized = text => text.replace(/\s/gu, '');
      const fits = text => {
        try {
          const page = compile([makeDraft(text)], footerBrand, theme)[0];
          return page.nodes.some(node => node.kind === 'text' && node.size >= 42
            && normalized(node.lines.join('')) === normalized(text));
        } catch { return false; }
      };
      const text = section.text.trim();
      const fragments = fits(text) ? [{ raw: text }] : paginateText(text, fits);
      for (const [i, fragment] of fragments.entries()) drafts.push(makeDraft(fragment.raw, i));
    }
  }
  return { pages: compile(drafts, footerBrand, theme), status: '本地试运行' };
}

export function applyManuscriptEdits(plan, edits) {
  const slides=plan.pages.map(p=>({...p,points:[...p.points]}));
  for (const edit of edits) {
    const p=slides[edit.page-1];
    if (!p) throw Error('找不到需修改的第 '+edit.page+' 页');
    if (edit.imageSide) {
      if (p.role!=='direction') throw Error('只有方向阐述页支持切换分屏主图位置');
      p.imageSide=edit.imageSide;
      continue;
    }
    const fields=[p.title,...p.points];
    const matches=fields.flatMap((text,i)=>text.includes(edit.from)?[i]:[]);
    if (matches.length!==1 || fields[matches[0]].split(edit.from).length!==2) throw Error('第 '+edit.page+' 页需提供唯一的原文');
    const i=matches[0];
    if (/^(?:主标|副标) · /u.test(fields[i])) throw Error('本版主副标须原样排版，改文案请回文案与主题');
    fields[i]=fields[i].replace(edit.from,()=>edit.to);
    [p.title,...p.points]=fields;
  }
  return {...plan,pages:slides};
}

export async function compileManuscript(plan, sources, {compile}, theme, edits=[]) {
  const slides=applyManuscriptEdits(plan,edits).pages;
  const media=new Map(await Promise.all(sources.map(async source=>{
    const img=new Image();
    img.src=source.data;
    await img.decode();
    return [source.id,{...source,width:img.naturalWidth,height:img.naturalHeight}];
  })));
  const figures=new Map(plan.figures.map(f=>[f.id,f]));
  const placeholders=page=>[...page.imageNote.matchAll(/\[待补充\s*[:：]\s*([^\]]+)\]/gu)].map(m=>m[1]);
  let direction=0;
  const drafts=slides.map(page=>{
    const images=page.figures.map(id=>media.get(figures.get(id).name));
    if (images.some(image=>!image)) throw Error('第 '+page.number+' 页缺少逐页稿绑定的原图');
    const points=page.points;
    const lines=points.join('\n');
    const addNotes=page.sources.map(({source,url})=>[source,url].filter(Boolean).join(' '));
    const notes=[page.notes,...placeholders(page).map(text=>'待补充 '+text),...addNotes].filter(Boolean).join('\n');
    const draft={id:'P'+String(page.number).padStart(2,'0'),title:page.title,chapter:page.chapter || page.label,
      caption:'',eyebrow:page.label,notes};
    switch(page.role) {
      case 'cover': return {...draft,tone:'brand',template:{kind:'cover.type',sub:lines,meta:''}};
      case 'contents': return {...draft,template:{kind:'contents.list',items:points.map(title=>({title}))}};
      case 'strategy': return {...draft,tone:'brand',template:{kind:'summary.statement',statement:page.title,sub:''}};
      case 'direction': {
        const copy=points.filter(point=>/^(?:主标|副标) · /u.test(point));
        const explanation=points.slice(copy.length).map((d,i)=>({k:['创意思路','画面重点'][i],d}));
        const side=direction++%2===0?'左':'右';
        const kind=(page.imageSide || side)==='左'?'design.half':'design.halfR';
        return {...draft,template:{kind,image:images[0],intro:copy.join('\n'),points:explanation}};
      }
      case 'work': return {...draft,tone:'brand',template:{kind:'upload.framed',image:images[0]}};
      case 'compare': return {...draft,template:{kind:'compare.lineup',sub:points.slice(images.length).join('\n'),
        items:images.map((image,i)=>({image,name:figures.get(page.figures[i]).direction,desc:points[i] || ''}))}};
      case 'close': {
        const greeting=page.title.match(/^((?:感谢观看|谢谢观看|谢谢)(?:[，,。！!]|$))\s*(.*)$/u);
        if (greeting) return {...draft,title:greeting[1],template:{kind:'closing.type',sub:greeting[2],meta:''}};
        return {...draft,tone:'brand',template:{kind:'summary.statement',statement:page.title,sub:''}};
      }
      default: return {...draft,template:points.length>=2?{kind:'summary.list',points:points.map(d=>({k:'',d}))}:
        {kind:'summary.statement',statement:page.title,sub:lines}};
    }
  });
  const visible=text=>text.replace(/\s/gu,'');
  let pages;
  try { pages=compile(drafts,theme.brandName || plan.project.title,theme); }
  catch(error) {
    const at=drafts.findIndex(draft=>{
      try {compile([draft],theme.brandName || plan.project.title,theme);return false;} catch {return true;}
    });
    throw Error((at>=0?'逐页稿 P'+String(at+1).padStart(2,'0')+'：':'')+error.message,{cause:error});
  }
  if (pages.length!==plan.pages.length) throw Error('逐页稿和排版页数不一致');
  for (const [i,page] of pages.entries()) {
    const expected=slides[i];
    if (expected.refinements?.length) {
      refinePage(page,expected,theme,figures);
    }
    const words=visible(page.nodes.filter(n=>n.kind==='text').map(n=>n.runs.length?n.runs.map(r=>r.text).join(''):n.lines.join('')).join(''));
    const images=page.nodes.filter(n=>n.kind==='image').map(n=>n.image.id);
    if (page.id!==drafts[i].id || [expected.title,...expected.points].some(text=>!words.includes(visible(text))) ||
      expected.figures.some(id=>!images.includes(figures.get(id).name))) {
      throw Error('逐页稿 '+page.id+' 的原文或原图未完整排入该页');
    }
  }
  const gaps=slides.flatMap(p=>placeholders(p).map((reason,i)=>({instance_id:drafts[p.number-1].id+'-'+i,
    chapter:p.title,reason})));
  const outline={physical_page_count:pages.length,gaps,pages:slides.map((p,i)=>({
    instance_id:pages[i].id,first_page:p.number,last_page:p.number,client_title:p.title,
    content:p.points.join('\n'), material_ref:[...p.sources.map(s=>s.source),...p.figures.map(id=>id+' · '+figures.get(id).name)]
      .filter(Boolean).join(' ｜ '),status:placeholders(p).length?'含待补材料':'已排版',
  }))};
  return {pages,outline,status:gaps.length?'逐页排版 · 含待补材料':'逐页排版'};
}

function refinePage(page, source, theme, figures) {
  const steps=source.refinements;
  const images=page.nodes.filter(node=>node.kind==='image' && source.figures.some(id=>figures.get(id).name===node.image.id));
  if (steps.includes('gallery') && source.role==='work' && images.length===1) {
    const image=images[0];
    const scale=Math.min(572/image.image.width,532/image.image.height);
    const w=image.image.width*scale, h=image.image.height*scale;
    Object.assign(image,{w,h,x:(1280-w)/2,y:126+(532-h)/2});
    const frames=[7,15].map((gap,i)=>({kind:'rect',x:image.x-gap,y:image.y-gap,
      w:w+gap*2,h:h+gap*2,lw:1,fill:null,stroke:i===0?'#FFFFFF':theme.accent,
      opacity:i===0?.64:.85,radius:0}));
    page.nodes.splice(page.nodes.indexOf(image),0,...frames);
    page.nodes.push({kind:'text',x:64,y:378,w:160,h:24,size:16,face:'Noto Sans SC',weight:600,
      color:'#FFFFFF',lines:[source.figures[0]+' · 采用原图'],runs:[],align:'left',valign:'top',lh:1.2,ls:0,opacity:1});
  }
  if (steps.includes('comparison') && source.role==='compare') {
    for (const image of images) {
      const mid=image.x+image.w/2, bottom=image.y+image.h;
      const scale=Math.min(292/image.image.width,212/image.image.height);
      image.w=image.image.width*scale;
      image.h=image.image.height*scale;
      image.x=mid-image.w/2;
      image.y=bottom-image.h;
    }
  }
  const measure=steps.includes('reflow') ? document.createElement('canvas').getContext('2d') : null;
  const words=measure && new Intl.Segmenter('zh-CN',{granularity:'word'});
  const tint=steps.includes('rhythm');
  const colors=page.bg.match(/[0-9a-f]{2}/gi)?.map(c=>parseInt(c,16)) ?? [255,255,255];
  const dark=(colors[0]*299+colors[1]*587+colors[2]*114)/1000<146;
  for (const node of page.nodes) {
    if (node.kind!=='text') continue;
    if (tint && node.y>=666) node.color=dark?'#FFFFFF':'#263543';
    if (!measure || node.runs.length || node.lines.length<2 || node.vertical || node.rotate) continue;
    const last=node.lines.at(-1);
    if ([...last].length>5 && !/^\d/u.test(last)) continue;
    measure.font=node.weight+' '+node.size+'px "'+node.face+'"';
    const width=text=>measure.measureText(text).width+Math.max(0,[...text].length-1)*node.ls;
    const joined=node.lines.at(-2)+last;
    const breaks=[...words.segment(joined)].map(part=>part.index).filter(i=>i>0 &&
      !/^[、。，：；！？）》」\s]/u.test(joined.slice(i)));
    const split=breaks.map(i=>[joined.slice(0,i),joined.slice(i)])
      .filter(pair=>pair.every(text=>width(text)<=node.w))
      .sort((a,b)=>Math.abs(width(a[0])-width(a[1]))-Math.abs(width(b[0])-width(b[1])))[0];
    if (split) node.lines.splice(-2,2,...split);
  }
}

// Apply a user's precise correction to the same native text objects that feed both
// the SVG preview and the editable PowerPoint. Ambiguous or overflowing edits pause.
export function applyPageEdits(pages, edits) {
  const measure=document.createElement('canvas').getContext('2d');
  for(const {page:number,from,to} of edits) {
    const page=pages[number-1];
    if(!page) throw Error('找不到需要改字的第 '+number+' 页');
    const matches=[];
    for(const node of page.nodes.filter(n=>n.kind==='text')) {
      const strings=node.runs.length ? node.runs.map(r=>r.text) : node.lines;
      strings.forEach((text,index)=>{
        if(text.includes(from)) matches.push({node,index,text});
      });
    }
    if(matches.length!==1 || matches[0].text.split(from).length!==2)
      throw Error('第 '+number+' 页需提供唯一、在同一行内的原文：'+from);
    const {node,index,text}=matches[0];
    const updated=text.replace(from,()=>to);
    const width=(text,font)=>{
      measure.font=font.weight+' '+font.size+'px "'+font.face+'"';
      return measure.measureText(text).width+Math.max(0,[...text].length-1)*node.ls;
    };
    const usedWidth=node.runs.length ? node.runs.reduce((sum,r,i)=>sum+width(i===index?updated:r.text,r),0) : width(updated,node);
    if(usedWidth>node.w+1) throw Error('第 '+number+' 页替换文字放不下，请缩短新文后重试');
    if(node.runs.length) node.runs[index].text=updated;
    else node.lines[index]=updated;
    if(page.title===from) page.title=to;
  }
}
