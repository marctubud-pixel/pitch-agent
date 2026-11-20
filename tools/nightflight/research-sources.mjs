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

export const minimumAudienceFacts=2;
export const audiencePriorities=['人群','使用场景','选择因素'];
export const audienceTopics=[...audiencePriorities,'使用频率','其他'];
const questionKey=value=>(typeof value==='string' ? value : '').normalize('NFKC').replace(/[\s\p{P}]/gu,'').toLowerCase();

// A survey question may have several answer options, several quotations and several publication URLs.
export function selectAudienceRows(rows) {
  const selected=[];
  const ordered=rows.filter(r=>audienceTopics.includes(r.audienceTopic) && questionKey(r.surveyQuestion) && Array.isArray(r.evidenceIndices))
    .sort((a,b)=>audienceTopics.indexOf(a.audienceTopic)-audienceTopics.indexOf(b.audienceTopic));
  for (const row of ordered) {
    const duplicate=selected.find(s=>questionKey(s.surveyQuestion)===questionKey(row.surveyQuestion) ||
      (row.audienceTopic!=='其他' && s.audienceTopic===row.audienceTopic));
    if (!duplicate) {
      selected.push({...row,evidenceIndices:[...row.evidenceIndices]});
      continue;
    }
    duplicate.evidenceIndices=[...new Set([...duplicate.evidenceIndices,...row.evidenceIndices])];
    if (row.audienceTopic==='使用场景' && duplicate.audienceTopic===row.audienceTopic &&
        !duplicate.explanation.includes(row.explanation)) {
      duplicate.explanation=duplicate.explanation.replace(/[。！？]$/u,'')+'，'+row.explanation;
    }
    const detail=duplicate.explanation.includes(row.explanation) ? '' : row.explanation;
    duplicate.sourceDetail=[...new Set([duplicate.sourceDetail,detail,row.sourceDetail].filter(Boolean))].join(' ');
  }
  return selected;
}

export function missingAudienceTopics(rows) {
  const descriptions=['受众身份或特征','使用时间或场景','选择时看重的因素'];
  return audiencePriorities.flatMap((topic,i)=>rows.some(r=>r.audienceTopic===topic) ? [] :
    [researchGap('source','缺少关于'+descriptions[i]+'的可核依据。','人群与接触情境')]);
}

// An article announcing a film can also release a poster, but a film-only quote cannot establish that.
export function supportsPoster(row,quote) {
  if (row.assetType!=='宣传海报或主视觉' || !quote) return false;
  const filmFrame=/视频(?:帧|截图|画面)|(?:广告片|影片|短片|宣传片)(?:中)?(?:的)?(?:截图|画面)|剧照|\b(?:film still|video frame)\b/iu;
  const movingWork=/广告片|短片|宣传片|电影|影片|轻喜剧|电视剧|视频|\b(?:video|film|tvc|trailer)\b/iu;
  const publishedPrint=/海报|平面广告|主视觉|宣传图|长图|\b(?:poster|key visual|print ad)\b/iu;
  return !filmFrame.test(row.title) && (!movingWork.test(quote) || publishedPrint.test(quote));
}

// Count only conclusions visible on this research page and the originals they actually cite.
export function hasCategoryImage(images, type) {
  return images.some(i=>i.carrier===type && i.sameCategory && i.sha256 && i.pageUrl && i.sourceUrl &&
    (type==='packaging' ? i.actualPackaging===true && i.categoryMatch==='同类' && i.visibleProduct?.trim() : type!=='kv' || supportsPoster(i,i.publicationQuote) && ['article','attachment'].includes(i.publicationPlacement)));
}

// A mixed historical board may contain a verified original next to an obsolete image.
// Keep only observations traceable to surviving images; the old group conclusion covers both.
export function reusableResearchFindings(findings) {
  return findings.flatMap(f=>{
    if (!f.images?.length) return [f];
    const kept=f.images.filter(i=>!['packaging','kv'].includes(i.carrier) || hasCategoryImage([i],i.carrier));
    if (kept.length===f.images.length) return [f];
    return kept.filter(i=>i.title && i.observation).map(i=>({
      chapter:f.chapter,subject:'competitor',source:i.title,url:i.pageUrl,images:[i],visualOnly:false,
      conclusion:i.title+'：'+i.observation,evidence:i.observation+(i.publicationQuote?'；'+i.publicationQuote:''),
      implication:i.takeaway || '仅就该图可见的内容进行比较。',
    }));
  });
}

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
    const chapterRows=rows.filter(r=>r.chapter===chapter && r.conclusion?.trim() && r.explanation?.trim());
    for (const row of index===2 ? selectAudienceRows(chapterRows) : chapterRows) {
      const refs = (row.evidenceIndices ?? []).map(i=>findings[i]).filter(f=>f && !f.visualOnly && f.evidence?.trim() && f.source?.trim());
      const verified = refs.filter(f=>external(f) && (f.passage?.trim() || f.images?.length));
      const matches = verified.filter(f=>f.subject===subjects[index] || (index===1 && f.images?.length));
      if (index===3 ? verified.some(f=>f.subject!=='product') && refs.some(f=>f.subject==='product') : matches.length) covered = true;
      if (index===1) comparisonImages.push(...matches.flatMap(f=>f.images ?? []));
      if (index===2 && matches.length) {
        const key = questionKey(row.surveyQuestion);
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
  if (assigned.size<minimumAudienceFacts) gaps.push(researchGap('decision',
    `消费者画像已核 ${assigned.size}/${minimumAudienceFacts} 条，还需不同的消费事实及其原文。`,chapters[2]));
  const carriers = new Set([...(project.briefScope?.types ?? []),...(report?.carriers ?? []),project.proposalKind]);
  for (const type of ['kv','packaging'].filter(t=>carriers.has(t))) {
    if (!hasCategoryImage(comparisonImages,type)) gaps.push(researchGap('visual',type==='kv' ? '还缺同类品牌实际发布的海报原图和发布出处。' : '还缺已看过的同类包装原图和出处。',chapters[1]));
  }
  return gaps;
}

// Rank cases within the publisher's results. Commerce is a preference, never an admission gate.
export function campaignPages(results,{category,broadCategory,brands=[],commerce=false}) {
  const names=[...new Set([category,broadCategory,...brands.map(b=>b.name)].filter(Boolean))];
  const resultScore=title=>Number(commerce && /电商|旗舰店|天猫|京东|商城|大促|双11|618/iu.test(title))*3+
    Number(brands.some(b=>b.name && title.includes(b.name)))*2+Number(/海报|平面|宣传图/iu.test(title));
  return results.filter(r=>names.some(n=>r.title?.includes(n)))
    .sort((a,b)=>resultScore(b.title)-resultScore(a.title));
}

export function broadVisualQueries(category,carriers,packagingTerm='包装') {
  if (typeof category!=='string' || !/^[\p{L}\p{N} ·-]{1,32}$/u.test(category)) return [];
  const form=['包装盒','包装袋','瓶装包装','罐装包装'].includes(packagingTerm)?packagingTerm:'包装';
  return carriers.map(type=>category+' '+(type==='packaging'?form:'海报'));
}

// Start from the category itself. The planner's project-specific searches follow these lookups.
export function categoryLookups(category, carriers, types, brands, followup) {
  if (typeof category!=='string' || !/^[\p{L}\p{N} ·-]{1,32}$/u.test(category)) return [];
  const queries = [];
  if (carriers.includes('packaging')) queries.push(category+' 品牌包装');
  if (carriers.includes('kv')) {
    queries.push(category+' 品牌海报');
    for (const brand of brands.slice(0,3)) {
      if (typeof brand?.name==='string' && /^[\p{L}\p{N} ·&-]{1,32}$/u.test(brand.name)) queries.push(brand.name+' '+category+' 海报');
    }
  }
  if (types.includes('activity')) queries.push(category+(followup?' 活动回顾':' 活动案例'));
  if (types.includes('tvc')) queries.push(category+' 品牌广告片');
  queries.push(...(followup ? [' 热搜',' 社交媒体趋势报告'] : [' 热门话题',' 社交平台关键词报告']).map(s=>category+s));
  return [...new Set(queries)];
}

export function supportedSocialMetric(metric, text, passage) {
  return ['platform','period','topic','measure'].every(key=>typeof metric?.[key]==='string' &&
    metric[key].trim() && locateQuote(['topic','measure'].includes(key) ? passage : text,metric[key])) &&
    /\d|热搜榜|热词榜|热门关键词|趋势关键词|trending/iu.test(metric.measure);
}

export function consumerSearchTopics(categories, followup=false) {
  const topics=[];
  for (const raw of categories ?? []) {
    if (typeof raw!=='string') continue;
    const term=raw.trim().replace(/(?:消费者调查|消费报告|行业报告|白皮书|报告)$/u,'').replace(/(?:行业|消费)$/u,'');
    if (!/^[\p{L}\p{N}·-]{1,12}$/u.test(term) || topics.some(t=>t.term===term)) continue;
    const suffixes=followup ? ['消费白皮书','行业报告'] : ['消费报告','消费者调查'];
    topics.push({term,queries:suffixes.map(s=>term+s)});
  }
  return topics.slice(0,4);
}
