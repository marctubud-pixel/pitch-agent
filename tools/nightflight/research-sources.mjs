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
