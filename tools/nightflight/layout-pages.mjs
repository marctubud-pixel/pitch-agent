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
  function fits(candidate, words) {
    let page;
    try { [page] = compile([candidate], footer, theme); }
    catch (error) {
      if (String(error.message).includes('版式文字超出容量')) return false;
      throw error;
    }
    const visible = page.nodes.filter(n => n.kind === 'text').map(n =>
      normalized(n.runs.length ? n.runs.map(r => r.text).join('') : n.lines.join('')));
    return words.filter(Boolean).every(s => visible.includes(normalized(s)));
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

  function contentPages(page) {
    const title = label(page.client_title, 28);
    let body = page.content.trim();
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
