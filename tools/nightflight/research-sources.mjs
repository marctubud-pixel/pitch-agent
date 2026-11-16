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

// Count only conclusions visible on this research page and the originals they actually cite.
export function automaticResearchGaps(report, project) {
  const chapters = ['行业与市场','竞争与同类传播','人群与接触情境','产品与品牌'];
  const subjects = ['market','competitor','audience','product'];
  const rows = report?.sections ?? [];
  const findings = report?.findings ?? [];
  const gaps = [];
  const audiences = new Map();
  const comparisonImages = [];
  const normalize = value => (value || '').normalize('NFKC').replace(/[\s\p{P}]/gu,'').toLowerCase();
  const external = f => /^https:\/\//iu.test(f.url) || project.attachments?.some(a=>a.name===f.source);
  for (const [index,chapter] of chapters.entries()) {
    let covered = false;
    for (const row of rows.filter(r=>r.chapter===chapter && r.conclusion?.trim() && r.explanation?.trim())) {
      const refs = (row.evidenceIndices ?? []).map(i=>findings[i]).filter(f=>f && !f.visualOnly && f.evidence?.trim() && f.source?.trim());
      const verified = refs.filter(f=>external(f) && (f.passage?.trim() || f.images?.length));
      const matches = verified.filter(f=>f.subject===subjects[index] || (index===1 && f.images?.length));
      if (index===3 ? verified.some(f=>f.subject!=='product') && refs.some(f=>f.subject==='product') : matches.length) covered = true;
      if (index===1) comparisonImages.push(...matches.flatMap(f=>f.images ?? []));
      if (index===2 && matches.length) {
        const key = normalize(row.conclusion);
        audiences.set(key,new Set([...(audiences.get(key) ?? []),...matches.map(f=>normalize(f.evidence))]));
      }
    }
    if (!covered) gaps.push(researchGap('decision',index===3 ? '产品与品牌还缺本案条件与外部资料的对照。' : chapter+'还缺能回到原件的结论。',chapter));
  }
  // Each displayed observation needs its own evidence. One survey may support several facts.
  const assigned = new Map();
  function assign(row, seen) {
    for (const quote of audiences.get(row)) {
      if (seen.has(quote)) continue;
      seen.add(quote);
      if (!assigned.has(quote) || assign(assigned.get(quote),seen)) {
        assigned.set(quote,row);
        return true;
      }
    }
    return false;
  }
  for (const row of audiences.keys()) assign(row,new Set());
  if (assigned.size<3) gaps.push(researchGap('decision','消费者画像已核 '+assigned.size+'/3 条，还需不同的消费事实及其原文。',chapters[2]));
  const carriers = new Set([...(project.briefScope?.types ?? []),...(report?.carriers ?? []),project.proposalKind]);
  for (const type of ['kv','packaging'].filter(t=>carriers.has(t))) {
    const seen = comparisonImages.some(i=>i.carrier===type && i.sameCategory && i.sha256 && i.pageUrl && i.sourceUrl &&
      (type!=='kv' || i.publicationQuote));
    if (!seen) gaps.push(researchGap('visual',type==='kv' ? '还缺同类品牌实际发布的海报原图和发布出处。' : '还缺已看过的同类包装原图和出处。',chapters[1]));
  }
  return gaps;
}
