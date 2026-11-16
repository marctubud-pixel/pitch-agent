// A follow-up keeps verified sources for checking earlier findings, but discovers fresh pages separately.
export function followupSources({brief,targets}) {
  const planned = (Array.isArray(targets) ? targets : []).filter(t=>t &&
    typeof t.domain==='string' && /^(?:[a-z0-9-]+\.)+[a-z]{2,}$/i.test(t.domain) &&
    typeof t.query==='string' && t.query.length<=160 && t.query.trim() &&
    !/[\r\n@:/]|\b1[3-9]\d{9}\b/u.test(t.query) && !(brief.length>=12 && t.query.includes(brief)));
  return planned.slice(0,8);
}
export function matchesDomain(url,domain) {
  try {const host=new URL(url).hostname;return host===domain || host.endsWith('.'+domain)} catch {return false}
}

// Map normalized characters back to their locations in the source. Display the actual source quote.
export function locateQuote(text, quote) {
  const fold = value => value.normalize('NFKC').replace(/。/gu,'.').replace(/[“”„]/gu,'"').replace(/[‘’]/gu,"'").replace(/[‐‑‒–—−]/gu,'-');
  const index = value => {
    let folded = '';
    const offsets = [];
    const tokens = /[\s\S]/gu;
    for (const {0:char,index:offset} of value.matchAll(tokens)) {
      if (/\s/u.test(char) || /[,，]/u.test(char) && /[\d０-９]/u.test(value[offset-1] || '') && /^[\d０-９]{3}(?:[,，][\d０-９]{3})*(?![\d０-９])/.test(value.slice(offset+1))) continue;
      const part = fold(char);
      if (part === '-' && folded.endsWith('-')) continue;
      folded += part;
      for (let i=0;i<part.length;i++) offsets.push(offset);
    }
    return {folded,offsets};
  };
  const source=index(text), needle=index(quote).folded;
  const hit=needle ? source.folded.indexOf(needle) : -1;
  if (hit<0) return null;
  const start=source.offsets[hit],last=source.offsets[hit+needle.length-1];
  const end=last+(text.codePointAt(last)>0xffff ? 2 : 1);
  return {evidence:text.slice(start,end),passage:text.slice(Math.max(0,start-240),end+240)};
}

export const researchGap = (kind, message, chapter = '', findingRef = '') => ({kind, chapter, message, findingRef});


export function reportSearchTerms(categories, previous = []) {
  const queries = [];
  for (const value of categories ?? []) {
    if (typeof value !== 'string') continue;
    const category = value.trim().replace(/(?:行业)?(?:报告|白皮书)$/u,'');
    if (!/^[\p{L}\p{N}·-]{1,14}$/u.test(category) || /(?:20\d\d|增长率|销售额|同比|市场规模|渠道结构)/u.test(category)) continue;
    const query = ['报告','白皮书'].map(suffix=>category+suffix).find(q=>!previous.includes(q));
    if (query && !queries.includes(query)) queries.push(query);
  }
  return queries.slice(0,4);
}

// Keep context around in-document matches even when the table is past the introductory pages.
export function reportExcerpts(text, terms) {
  if (text.length<=16000) return text;
  const ranges = [[0,1800]];
  for (const term of terms.filter(Boolean)) {
    const contexts = [];
    let start = 0;
    while (start<text.length) {
      const index = text.indexOf(term,start);
      if (index<0) break;
      const before = Math.max(0,index-200), after = Math.min(text.length,index+term.length+420);
      const nearby = text.slice(Math.max(0,index-100),index+term.length+140);
      const hasMeasure = /\d[\d,.]*\s*(?:[%％万亿吨升元]|瓶|件|million|billion)/iu.test(nearby);
      contexts.push({before,after,hasMeasure});
      start=index+term.length;
    }
    // Repeated category names in the introduction must not crowd out later tables.
    contexts.sort((a,b)=>Number(b.hasMeasure)-Number(a.hasMeasure));
    const selected = [];
    for (const item of contexts) {
      if (selected.some(other=>item.before<other.after && item.after>other.before)) continue;
      selected.push(item);
      ranges.push([item.before,item.after]);
      if (selected.length===4) break;
    }
  }
  const merged = [];
  for (const [start,end] of ranges.sort((a,b)=>a[0]-b[0])) {
    const last = merged.at(-1);
    if (last && start<=last[1]) last[1]=Math.max(last[1],end);
    else merged.push([start,end]);
  }
  return merged.map(([start,end])=>text.slice(start,end)).join('\n[…]\n').slice(0,11500);
}
