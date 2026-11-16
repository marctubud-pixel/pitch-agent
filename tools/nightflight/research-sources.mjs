// A follow-up keeps verified sources for checking earlier findings, but discovers fresh pages separately.
export function followupSources({brief,carrier,queries,targets}) {
  const beer = /精酿|啤酒|craft beer/i.test(brief) && carrier.includes('packaging');
  const planned = (Array.isArray(targets) ? targets : []).filter(t=>t &&
    typeof t.domain==='string' && /^(?:[a-z0-9-]+\.)+[a-z]{2,}$/i.test(t.domain) &&
    typeof t.query==='string' && t.query.length<=160 && t.query.trim() &&
    !/[\r\n@:/]|\b1[3-9]\d{9}\b/u.test(t.query) && !(brief.length>=12 && t.query.includes(brief)));
  if (beer) return [
    {domain:'brewdog.com', query:'BrewDog Punk IPA can product'},
    {domain:'tsingtao.com.cn', query:'青岛啤酒 精酿 产品 包装'},
    {domain:'jd.com', query:'精酿啤酒 罐装 单罐 容量 售价'},
    {domain:'packagingoftheworld.com', query:'craft beer can packaging design brewery'},
    {domain:'thedieline.com', query:'craft beer packaging design brewery'},
    ...planned.slice(0,2),
  ];
  const topic = queries[0];
  if (!topic) return planned;
  return [
    ...planned.slice(0,4),
    {domain:'jd.com',query:topic+' 在售 商品 规格'},
    {domain:carrier.includes('packaging')?'packagingoftheworld.com':'digitaling.com',query:topic+' 品牌 设计案例'},
  ];
}
export function matchesDomain(url,domain) {
  try {const host=new URL(url).hostname;return host===domain || host.endsWith('.'+domain)} catch {return false}
}
