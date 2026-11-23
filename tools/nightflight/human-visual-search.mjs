import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {mkdir, readdir, readFile, stat, writeFile} from 'node:fs/promises';
import {extname, join} from 'node:path';
import {promisify} from 'node:util';
import {pythonBinary} from './runtime-dependencies.mjs';

const execFileAsync = promisify(execFile);
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

export const ADAPTER_LANGUAGES = Object.freeze({
  bpando: 'en',
  designboom: 'en',
  yellowtrace: 'en',
  openverse: 'en',
  colossal: 'en',
  digitaling: 'zh',
  huaban: 'zh',
  duitang: 'zh',
  gooood: 'zh',
  x_api: 'en',
});

export const VISUAL_TRACKS = Object.freeze({
  packaging: {
    id: 'packaging',
    name: '包装（Packaging）',
    goal: '寻找高审美的当代单帧包装/容器实拍参考图（重点看瓶型/盒型比例、材质肌理、标签留白排版与自然商业光影）。',
    humanRule: '严禁搜老派土味礼盒或电商白底抠图！花瓣/堆糖用设计圈词（如「光瓶酒 包装设计」「极简 瓶贴 工艺」），国际站跨品类借清酒/烈酒/香水/极简容器的包装骨架。必须单帧实拍，淘汰纯Logo卡、多图拼版、PPT示意图。',
    sources: [
      {adapter: 'huaban', lang: 'zh', hint: '2个中文设计圈词，如 光瓶酒 包装设计 / 极简 玻璃瓶 包装'},
      {adapter: 'duitang', lang: 'zh', hint: '2个中文美学词，如 极简 酒瓶 包装'},
      {adapter: 'bpando', lang: 'en', hint: '2-3个英文词，如 minimal bottle packaging / spirits bottle label'},
      {adapter: 'openverse', lang: 'en', hint: '2-3个英文纯光影静物词，如 glass bottle studio'},
    ],
  },
  poster: {
    id: 'poster',
    name: '海报（Poster / KV）',
    goal: '寻找当代高审美的单帧商业海报或情绪KV参考图（重点看字图留白、主体景别、色调对比与光线氛围）。',
    humanRule: '按视觉语法与情绪搜，不死绑单一品类。严禁促销模板、PPT策略分析页、概念示意图、三栏文字图、长图文截图、表情条、多图拼版。中文站用1-2个中文设计短词，英文站用2-3个英文词。',
    sources: [
      {adapter: 'huaban', lang: 'zh', hint: '2个中文设计词，如 微醺 海报设计 / 极简 排版 海报'},
      {adapter: 'digitaling', lang: 'zh', hint: '1个中文高频短词，如 微醺 / 海报'},
      {adapter: 'duitang', lang: 'zh', hint: '2个中文氛围词，如 电影感 饮品 摄影'},
      {adapter: 'bpando', lang: 'en', hint: '2-3个英文词，如 campaign poster / editorial photography'},
    ],
  },
  event: {
    id: 'event',
    name: '活动（Event / 快闪与空间装置）',
    goal: '寻找有真实三维空间尺度、快闪立面/装置母题与人群打卡氛围的线下活动或快闪空间实拍参考图。',
    humanRule: '必须呈现真实三维空间、快闪建筑立面、大玻璃橱窗/光影装置或人群互动比例！坚决淘汰纯平面活动预告海报、纯单品静物、PPT分析图。',
    sources: [
      {adapter: 'huaban', lang: 'zh', hint: '2个中文空间词，如 极简 快闪店 空间 / 艺术装置 展陈'},
      {adapter: 'digitaling', lang: 'zh', hint: '1-2个中文短词，如 快闪 空间'},
      {adapter: 'gooood', lang: 'zh', hint: '1个中文空间词，如 快闪 / 酒吧 / 展陈'},
      {adapter: 'yellowtrace', lang: 'en', hint: '2个英文词，如 retail bar / pop-up interior'},
      {adapter: 'designboom', lang: 'en', hint: '2个英文词，如 glass pavilion / pop-up installation'},
    ],
  },
});

export function detectVisualTrack(brief = '', carriers = [], direction = '') {
  const list = Array.isArray(carriers) ? carriers.map(c => String(c).toLowerCase()) : [];
  const text = `${brief} ${direction}`.toLowerCase();
  if (list.length === 1 && list[0] === 'tvc') return null;
  if (!list.length && /\btvc\b|广告片|短片脚本|分镜脚本/u.test(text) && !/包装|海报|kv|主视觉|快闪|活动|装置/u.test(text)) {
    return null;
  }
  if (list.includes('event') || list.includes('activation') || list.includes('popup')) return 'event';
  if (list.includes('packaging') && !list.includes('kv') && !list.includes('poster')) return 'packaging';
  if (list.includes('kv') || list.includes('poster')) return 'poster';
  if (/快闪|线下活动|pop-?up|装置|展陈|路演|空间体验|体验馆/u.test(text)) return 'event';
  if (/包装|瓶型|瓶身|礼盒|罐身|packaging|bottle/u.test(text) && !/海报|主视觉|\bkv\b/u.test(text)) return 'packaging';
  return 'poster';
}

export function sanitizeTrackQuery(adapter, raw) {
  const lang = ADAPTER_LANGUAGES[adapter] || 'en';
  let q = String(raw || '').replace(/["“”'‘’`]/g, ' ').trim();
  if (!q) return '';
  if (lang === 'en') {
    q = q.replace(/[\u4e00-\u9fff]+/g, ' ').replace(/[^a-zA-Z0-9\s-]/g, ' ').replace(/\s+/g, ' ').trim();
    return q.split(' ').filter(Boolean).slice(0, 3).join(' ');
  }
  const parts = q.split(/\s+/).filter(Boolean).slice(0, 2);
  let joined = parts.join(' ');
  if (joined.replace(/\s+/g, '').length > 8) joined = parts[0].slice(0, 6);
  return joined.trim();
}

async function fetchWithTimeout(url, {ms = 10000, headers = {}, signal} = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort, {once: true});
  try {
    return await fetch(url, {signal: controller.signal, headers: {'User-Agent': USER_AGENT, ...headers}});
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

const NORMALIZE_PY = `
import json, sys
from PIL import Image, ImageOps
with Image.open(sys.argv[1]) as im:
    im = ImageOps.exif_transpose(im).convert("RGB")
    w, h = im.size
    if max(w, h) > 1600:
        im.thumbnail((1600, 1600), Image.Resampling.LANCZOS)
    im.save(sys.argv[2], "JPEG", quality=90)
    print(json.dumps({"w": w, "h": h}))
`;

const CONTACT_SHEET_PY = `
import json, sys, os
from PIL import Image, ImageDraw, ImageOps, ImageFont

def load_font(size):
    for p in [
        "/System/Library/Fonts/Hiragino Sans GB.ttc",
        "/System/Library/Fonts/STHeiti Medium.ttc",
        "/System/Library/Fonts/Supplemental/Songti.ttc",
        "/System/Library/Fonts/Helvetica.ttc",
    ]:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size, index=0)
            except Exception:
                pass
    return ImageFont.load_default()

spec = json.loads(sys.stdin.read())
items = spec["items"]
out_path = spec["outPath"]
cols = spec.get("cols", 3)
cell_w, cell_h, header_h, pad = 420, 340, 34, 14
rows = (len(items) + cols - 1) // cols
canvas = Image.new("RGB", (pad + cols * (cell_w + pad), pad + rows * (cell_h + header_h + pad)), (242, 242, 244))
draw = ImageDraw.Draw(canvas)
font, badge_font, dim_font = load_font(15), load_font(18), load_font(13)

for idx, item in enumerate(items):
    r, c = idx // cols, idx % cols
    x0, y0 = pad + c * (cell_w + pad), pad + r * (cell_h + header_h + pad)
    draw.rectangle([x0, y0, x0 + cell_w, y0 + header_h + cell_h], fill=(255, 255, 255), outline=(210, 210, 215), width=1)
    draw.rectangle([x0, y0, x0 + cell_w, y0 + header_h], fill=(32, 34, 40))
    draw.rectangle([x0, y0, x0 + 54, y0 + header_h], fill=(214, 48, 49))
    draw.text((x0 + 10, y0 + 7), f"#{item['index']}", fill=(255, 255, 255), font=badge_font)
    draw.text((x0 + 62, y0 + 9), str(item.get("label", ""))[:30], fill=(240, 240, 244), font=font)
    try:
        with Image.open(item["path"]) as im:
            im = ImageOps.exif_transpose(im).convert("RGB")
            iw, ih = im.size
            scale = min((cell_w - 8) / iw, (cell_h - 8) / ih)
            nw, nh = max(1, int(iw * scale)), max(1, int(ih * scale))
            im = im.resize((nw, nh), Image.Resampling.LANCZOS)
            canvas.paste(im, (x0 + (cell_w - nw) // 2, y0 + header_h + (cell_h - nh) // 2))
            draw.rectangle([x0 + cell_w - 92, y0 + header_h + cell_h - 24, x0 + cell_w - 4, y0 + header_h + cell_h - 4], fill=(20, 20, 24))
            draw.text((x0 + cell_w - 88, y0 + header_h + cell_h - 22), f"{iw}x{ih}", fill=(235, 235, 240), font=dim_font)
    except Exception as e:
        draw.text((x0 + 16, y0 + header_h + 20), f"ERR: {str(e)[:40]}", fill=(180, 0, 0), font=font)

os.makedirs(os.path.dirname(out_path), exist_ok=True)
canvas.save(out_path, "JPEG", quality=88)
print(json.dumps({"ok": True, "outPath": out_path}))
`;

export async function makeContactSheet(items, outPath, {cols = 3, python, signal} = {}) {
  const py = python || await pythonBinary();
  const child = execFile(py, ['-c', CONTACT_SHEET_PY], {signal, maxBuffer: 10 * 1024 * 1024});
  const done = new Promise((resolve, reject) => {
    let out = '', err = '';
    child.stdout.on('data', d => { out += d; });
    child.stderr.on('data', d => { err += d; });
    child.on('close', code => code === 0 ? resolve(JSON.parse(out)) : reject(new Error(err || 'contact sheet failed')));
  });
  child.stdin.end(JSON.stringify({items, outPath, cols}));
  return done;
}

async function normalizeImageToJpg(srcPath, destJpg, {python, signal} = {}) {
  const py = python || await pythonBinary();
  const {stdout} = await execFileAsync(py, ['-c', NORMALIZE_PY, srcPath, destJpg], {signal});
  return JSON.parse(stdout.trim());
}

async function downloadAndNormalize(url, destBase, {referer = '', python, signal, fetcher = fetchWithTimeout} = {}) {
  try {
    if (!url || /\.gif(\?|$)/i.test(url)) return null;
    const response = await fetcher(url, {ms: 12000, headers: referer ? {Referer: referer} : {}, signal});
    if (!response.ok) return null;
    const ct = (response.headers.get('content-type') || '').toLowerCase();
    if (ct.includes('gif') || ct.includes('svg') || ct.includes('html')) return null;
    const buf = Buffer.from(await response.arrayBuffer());
    if (buf.length < 14000 || buf.length > 18 * 1024 * 1024) return null;
    const ext = ct.includes('webp') ? 'webp' : ct.includes('png') ? 'png' : 'jpg';
    const rawPath = `${destBase}.raw.${ext}`;
    const jpgPath = `${destBase}.jpg`;
    await writeFile(rawPath, buf, {mode: 0o600});
    const dims = await normalizeImageToJpg(rawPath, jpgPath, {python, signal}).catch(() => null);
    if (!dims || dims.w < 320 || dims.h < 220) return null;
    const ratio = dims.w / dims.h;
    if (ratio > 2.8 || ratio < 0.35) return null;
    const jpgBytes = await readFile(jpgPath);
    return {
      path: jpgPath,
      mediaType: 'image/jpeg',
      sha256: sha256(jpgBytes),
      byteLength: jpgBytes.length,
      width: dims.w,
      height: dims.h,
      sourceUrl: url,
    };
  } catch {
    signal?.throwIfAborted();
    return null;
  }
}

// ---------- PRIORITY #1: LOCAL CURATED REFERENCE LIBRARY HOOK ----------

const LOCAL_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp']);

export async function searchLocalReferenceLibrary({
  libraryDir = process.env.NIGHTFLIGHT_REFERENCE_LIBRARY || '',
  track = 'poster',
  keywords = [],
  limit = 4,
  dir,
  python,
  signal,
} = {}) {
  if (!libraryDir) return [];
  const candidates = [];
  const folders = [join(libraryDir, track), join(libraryDir, 'shared'), libraryDir];
  let manifest = {};
  try {
    manifest = JSON.parse(await readFile(join(libraryDir, 'manifest.json'), 'utf8'));
  } catch { /* optional manifest.json */ }

  const seenPaths = new Set();
  const tokens = keywords.flatMap(k => String(k || '').toLowerCase().split(/\s+/)).filter(Boolean);

  for (const folder of folders) {
    let entries;
    try { entries = await readdir(folder); } catch { continue; }
    for (const name of entries) {
      const ext = extname(name).toLowerCase();
      if (!LOCAL_EXTS.has(ext)) continue;
      const fullPath = join(folder, name);
      if (seenPaths.has(fullPath)) continue;
      seenPaths.add(fullPath);
      const info = await stat(fullPath).catch(() => null);
      if (!info?.isFile() || info.size < 4096) continue;
      const meta = manifest[name] || manifest[`${track}/${name}`] || {};
      const haystack = `${name} ${(meta.tags || []).join(' ')} ${meta.note || ''}`.toLowerCase();
      const score = (folder.endsWith(track) ? 2 : 0) + tokens.filter(t => haystack.includes(t)).length;
      candidates.push({fullPath, name, score, meta});
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  const picked = candidates.slice(0, limit);
  const results = [];
  for (let i = 0; i < picked.length; i++) {
    const item = picked[i];
    try {
      let outPath = item.fullPath;
      let width = 0, height = 0;
      if (dir) {
        await mkdir(dir, {recursive: true, mode: 0o700});
        const destJpg = join(dir, `local_${track}_${i + 1}.jpg`);
        const dims = await normalizeImageToJpg(item.fullPath, destJpg, {python, signal}).catch(() => null);
        if (dims) { outPath = destJpg; width = dims.w; height = dims.h; }
      }
      const bytes = await readFile(outPath);
      results.push({
        source: '本地精选库',
        title: item.meta.title || item.name,
        path: outPath,
        sha256: sha256(bytes),
        byteLength: bytes.length,
        mediaType: extname(outPath).toLowerCase() === '.png' ? 'image/png' : 'image/jpeg',
        width,
        height,
        pageUrl: `local://reference-library/${track}/${item.name}`,
        sourceUrl: '',
        query: `local:${track}`,
      });
    } catch { /* skip unreadable local asset */ }
  }
  return results;
}

// ---------- VERIFIED PUBLIC SOURCE ADAPTERS + OPTIONAL X API v2 ----------

export async function searchBPAndO(query, {limit = 5, signal, fetcher = fetchWithTimeout} = {}) {
  const clean = sanitizeTrackQuery('bpando', query);
  if (!clean) return [];
  try {
    const r = await fetcher(`https://bpando.org/wp-json/wp/v2/posts?search=${encodeURIComponent(clean)}&per_page=${limit}`, {signal});
    if (!r.ok) return [];
    const posts = await r.json();
    return (Array.isArray(posts) ? posts : []).map(p => {
      const content = p.content?.rendered || '';
      const imgs = [...new Set([...content.matchAll(/https:\/\/bpando\.org\/wp-content\/uploads\/[^"'\s>]+\.(?:jpg|jpeg|png|webp)/gi)]
        .map(m => m[0])
        .filter(u => !/-\d+x\d+\./.test(u)))];
      const cover = imgs.find(u => !/(logo|wordmark|monogram|symbol|icon|typeface)/i.test(u)) || imgs[0];
      return {
        source: 'BP&O',
        title: (p.title?.rendered || '').replace(/<[^>]+>|&#\d+;/g, ' ').trim(),
        projectUrl: p.link || '',
        coverUrl: cover,
        detailImageUrls: imgs,
      };
    }).filter(x => x.coverUrl);
  } catch {
    signal?.throwIfAborted();
    return [];
  }
}

export async function searchDesignboom(query, {limit = 4, signal, fetcher = fetchWithTimeout} = {}) {
  const clean = sanitizeTrackQuery('designboom', query);
  if (!clean) return [];
  try {
    const r = await fetcher(`https://www.designboom.com/wp-json/wp/v2/posts?search=${encodeURIComponent(clean)}&per_page=${limit}`, {signal});
    if (!r.ok) return [];
    const posts = await r.json();
    return (Array.isArray(posts) ? posts : []).map(p => {
      const content = p.content?.rendered || '';
      const imgs = [...new Set([...content.matchAll(/https:\/\/www\.designboom\.com\/(?:wp-content|cms)\/[^"'\s>]+\.(?:jpg|jpeg|png|webp)/gi)]
        .map(m => m[0])
        .filter(u => !/-\d+x\d+\./.test(u)))];
      return {
        source: 'Designboom',
        title: (p.title?.rendered || '').replace(/<[^>]+>|&#\d+;/g, ' ').trim(),
        projectUrl: p.link || '',
        coverUrl: imgs[0],
        detailImageUrls: imgs.slice(0, 6),
      };
    }).filter(x => x.coverUrl);
  } catch {
    signal?.throwIfAborted();
    return [];
  }
}

export async function searchDigitaling(query, {limit = 5, signal, fetcher = fetchWithTimeout} = {}) {
  const clean = sanitizeTrackQuery('digitaling', query);
  if (!clean) return [];
  try {
    const r = await fetcher(`https://www.digitaling.com/search/projects?kw=${encodeURIComponent(clean)}`, {signal});
    if (!r.ok) return [];
    const html = await r.text();
    const results = [];
    const seen = new Set();
    const cardRe = /href="(https:\/\/www\.digitaling\.com\/projects\/\d+\.html)"[\s\S]{0,1400}?(https:\/\/file\.digitaling\.com\/eImg\/cover\/[^"'\s)]+\.(?:jpg|jpeg|png|webp))/gi;
    let m;
    while ((m = cardRe.exec(html)) && results.length < limit) {
      const [, projectUrl, coverUrl] = m;
      if (seen.has(projectUrl)) continue;
      seen.add(projectUrl);
      results.push({source: '数英网', title: `数英(${clean})`, projectUrl, coverUrl, detailImageUrls: null});
    }
    if (!results.length) {
      const covers = [...new Set([...html.matchAll(/https:\/\/file\.digitaling\.com\/eImg\/cover\/[^"'\s)]+\.(?:jpg|jpeg|png|webp)/gi)].map(x => x[0]))];
      const links = [...new Set([...html.matchAll(/https:\/\/www\.digitaling\.com\/projects\/\d+\.html/g)].map(x => x[0]))];
      for (let i = 0; i < Math.min(limit, covers.length); i++) {
        results.push({source: '数英网', title: `数英(${clean}) #${i + 1}`, projectUrl: links[i] || '', coverUrl: covers[i], detailImageUrls: null});
      }
    }
    return results;
  } catch {
    signal?.throwIfAborted();
    return [];
  }
}

export async function fetchDigitalingDetailImages(projectUrl, {maxImgs = 6, signal, fetcher = fetchWithTimeout} = {}) {
  if (!projectUrl) return [];
  try {
    const r = await fetcher(projectUrl, {signal});
    if (!r.ok) return [];
    const html = await r.text();
    return [...new Set([...html.matchAll(/https:\/\/file\.digitaling\.com\/eImg\/uimages\/[^"'\s)]+\.(?:jpg|jpeg|png|webp)/gi)]
      .map(m => m[0])
      .filter(u => !/avatar|logo|qrcode|emoji/i.test(u)))].slice(0, maxImgs);
  } catch {
    signal?.throwIfAborted();
    return [];
  }
}

export async function searchOpenverse(query, {limit = 4, signal, fetcher = fetchWithTimeout} = {}) {
  const clean = sanitizeTrackQuery('openverse', query);
  if (!clean) return [];
  try {
    const r = await fetcher(`https://api.openverse.org/v1/images/?q=${encodeURIComponent(clean)}&page_size=${limit * 2}&mature=false`, {signal});
    if (!r.ok) return [];
    const data = await r.json();
    return (Array.isArray(data.results) ? data.results : []).slice(0, limit).map((x, i) => ({
      source: 'Openverse',
      title: (x.title || `Openverse(${clean}) #${i + 1}`).slice(0, 40),
      projectUrl: x.foreign_landing_url || '',
      coverUrl: x.thumbnail || x.url,
      detailImageUrls: [x.url || x.thumbnail],
    })).filter(x => x.coverUrl);
  } catch {
    signal?.throwIfAborted();
    return [];
  }
}

export async function searchColossal(query, {limit = 3, signal, fetcher = fetchWithTimeout} = {}) {
  const clean = sanitizeTrackQuery('colossal', query);
  if (!clean) return [];
  try {
    const r = await fetcher(`https://www.thisiscolossal.com/wp-json/wp/v2/posts?search=${encodeURIComponent(clean)}&per_page=${limit}`, {signal});
    if (!r.ok) return [];
    const posts = await r.json();
    return (Array.isArray(posts) ? posts : []).map(p => {
      const content = p.content?.rendered || '';
      const imgs = [...new Set([...content.matchAll(/https:\/\/www\.thisiscolossal\.com\/wp-content\/uploads\/[^"'\s>]+\.(?:jpg|jpeg|png|webp)/gi)]
        .map(m => m[0])
        .filter(u => !/-\d+x\d+\./.test(u)))];
      return {
        source: 'Colossal',
        title: (p.title?.rendered || '').replace(/<[^>]+>|&#\d+;/g, ' ').trim(),
        projectUrl: p.link || '',
        coverUrl: imgs[0],
        detailImageUrls: imgs.slice(0, 5),
      };
    }).filter(x => x.coverUrl);
  } catch {
    signal?.throwIfAborted();
    return [];
  }
}

export async function searchXApiImages(query, {token = process.env.X_BEARER_TOKEN || '', limit = 5, signal, fetcher = fetchWithTimeout} = {}) {
  const clean = sanitizeTrackQuery('x_api', query);
  if (!token || !clean) return [];
  try {
    const q = `${clean} has:images -is:retweet`;
    const u = `https://api.x.com/2/tweets/search/recent?query=${encodeURIComponent(q)}&max_results=10&expansions=attachments.media_keys&media.fields=url,type,width,height`;
    const r = await fetcher(u, {signal, headers: {Authorization: `Bearer ${token}`}});
    if (!r.ok) return [];
    const data = await r.json();
    const media = (data.includes?.media || []).filter(m => m.type === 'photo' && m.url);
    return media.slice(0, limit).map((m, i) => ({
      source: 'X(Twitter)',
      title: `X(${clean}) #${i + 1}`,
      projectUrl: 'https://x.com',
      coverUrl: m.url,
      detailImageUrls: [m.url],
    }));
  } catch {
    signal?.throwIfAborted();
    return [];
  }
}

const HUABAN_PROMO_NOISE = /促销|淘宝|详情页|手机海报|主图|模板|优惠券|双11|双十一|618|包邮|素材|PSD|样机下载/u;
const HUABAN_CURATED_SOURCES = /xiaohongshu\.com|behance\.net|pinterest\.com|dribbble\.com|zcool\.com\.cn|pushthink\.com|instagram\.com/i;

export function rankHuabanPins(pins = []) {
  return (Array.isArray(pins) ? pins : [])
    .filter(p => {
      if (!p?.file?.key) return false;
      if (p.extra?.material_id) return false; // 100% strip watermarked Huaban paid stock ads
      if ((p.file.width || 0) < 480 || (p.file.height || 0) < 360) return false;
      const ratio = (p.file.width || 1) / (p.file.height || 1);
      if (ratio > 2.6 || ratio < 0.38) return false;
      if (HUABAN_PROMO_NOISE.test(p.raw_text || '')) return false;
      return true;
    })
    .map(p => {
      const repin = Number(p.repin_count || 0);
      const like = Number(p.like_count || 0);
      const sourceBonus = HUABAN_CURATED_SOURCES.test(p.source || '') ? 80 : 0;
      const hdBonus = (p.file.width || 0) >= 900 ? 30 : 0;
      return {pin: p, score: repin + like * 4 + sourceBonus + hdBonus};
    })
    .sort((a, b) => b.score - a.score)
    .map(x => x.pin);
}

export async function searchHuaban(query, {limit = 5, signal, fetcher = fetchWithTimeout} = {}) {
  const clean = sanitizeTrackQuery('huaban', query);
  if (!clean) return [];
  try {
    const u = `https://api.huaban.com/search/file?text=${encodeURIComponent(clean)}&sort=all&limit=20&page=1&position=search_pin`;
    const r = await fetcher(u, {signal, headers: {Accept: 'application/json', Referer: 'https://huaban.com/'}});
    if (!r.ok) return [];
    const data = await r.json();
    const ranked = rankHuabanPins(data.pins || []).slice(0, limit);
    return ranked.map(p => {
      const imgUrl = `https://gd-hbimg.huaban.com/${p.file.key}_fw1200webp`;
      return {
        source: p.source && /xiaohongshu/i.test(p.source) ? '花瓣·小红书' : '花瓣网',
        title: (p.raw_text || `花瓣(${clean})`).replace(/\s+/g, ' ').trim().slice(0, 42),
        projectUrl: `https://huaban.com/pins/${p.pin_id}`,
        coverUrl: imgUrl,
        detailImageUrls: [imgUrl],
      };
    });
  } catch {
    signal?.throwIfAborted();
    return [];
  }
}

export async function searchDuitang(query, {limit = 4, signal, fetcher = fetchWithTimeout} = {}) {
  const clean = sanitizeTrackQuery('duitang', query);
  if (!clean) return [];
  try {
    const u = `https://www.duitang.com/napi/blogv2/list/by_search/?kw=${encodeURIComponent(clean)}&limit=16`;
    const r = await fetcher(u, {signal, headers: {Accept: 'application/json', Referer: 'https://www.duitang.com/'}});
    if (!r.ok) return [];
    const data = await r.json();
    const items = (data.data?.object_list || [])
      .filter(x => x?.photo?.path && (x.photo.width || 0) >= 480 && (x.photo.height || 0) >= 360 && !HUABAN_PROMO_NOISE.test(x.msg || ''))
      .sort((a, b) => Number(b.favorite_count || 0) - Number(a.favorite_count || 0))
      .slice(0, limit);
    return items.map((x, i) => ({
      source: '堆糖',
      title: (x.msg || `堆糖(${clean}) #${i + 1}`).replace(/\s+/g, ' ').trim().slice(0, 40),
      projectUrl: x.id ? `https://www.duitang.com/blog/?id=${x.id}` : 'https://www.duitang.com/',
      coverUrl: x.photo.path,
      detailImageUrls: [x.photo.path],
    }));
  } catch {
    signal?.throwIfAborted();
    return [];
  }
}

export async function searchYellowtrace(query, {limit = 4, signal, fetcher = fetchWithTimeout} = {}) {
  const clean = sanitizeTrackQuery('yellowtrace', query);
  if (!clean) return [];
  try {
    const r = await fetcher(`https://www.yellowtrace.com.au/wp-json/wp/v2/posts?search=${encodeURIComponent(clean)}&per_page=${limit}`, {signal});
    if (!r.ok) return [];
    const posts = await r.json();
    return (Array.isArray(posts) ? posts : []).map(p => {
      const content = p.content?.rendered || '';
      const imgs = [...new Set([...content.matchAll(/https:\/\/assets\.yellowtrace\.com\.au\/wp-content\/uploads\/[^"'\s>]+\.(?:jpg|jpeg|png|webp)/gi)]
        .map(m => m[0])
        .filter(u => !/-\d+x\d+\./.test(u)))];
      return {
        source: 'Yellowtrace',
        title: (p.title?.rendered || '').replace(/<[^>]+>|&#\d+;/g, ' ').trim(),
        projectUrl: p.link || '',
        coverUrl: imgs[0],
        detailImageUrls: imgs.slice(0, 6),
      };
    }).filter(x => x.coverUrl);
  } catch {
    signal?.throwIfAborted();
    return [];
  }
}

export async function searchGooood(query, {limit = 4, signal, fetcher = fetchWithTimeout} = {}) {
  const clean = sanitizeTrackQuery('gooood', query);
  if (!clean) return [];
  try {
    const r = await fetcher(`https://www.gooood.cn/?s=${encodeURIComponent(clean)}`, {signal});
    if (!r.ok) return [];
    const html = await r.text();
    const imgs = [...new Set([...html.matchAll(/https:\/\/oss\.gooood\.cn\/uploads\/[^"'\s)]+\.(?:jpg|jpeg|png|webp)/gi)]
      .map(m => m[0])
      .filter(u => !/fwx|avatar|logo|banner|ad-/i.test(u)))];
    return imgs.slice(0, limit).map((u, i) => ({
      source: '谷德设计网',
      title: `谷德(${clean}) #${i + 1}`,
      projectUrl: `https://www.gooood.cn/?s=${encodeURIComponent(clean)}`,
      coverUrl: u,
      detailImageUrls: [u],
    }));
  } catch {
    signal?.throwIfAborted();
    return [];
  }
}

async function runAdapter(adapter, query, opts) {
  switch (adapter) {
    case 'huaban': return searchHuaban(query, opts);
    case 'duitang': return searchDuitang(query, opts);
    case 'yellowtrace': return searchYellowtrace(query, opts);
    case 'gooood': return searchGooood(query, opts);
    case 'bpando': return searchBPAndO(query, opts);
    case 'designboom': return searchDesignboom(query, opts);
    case 'digitaling': return searchDigitaling(query, opts);
    case 'openverse': return searchOpenverse(query, opts);
    case 'colossal': return searchColossal(query, opts);
    case 'x_api': return searchXApiImages(query, opts);
    default: return [];
  }
}

// ---------- 4-STEP HUMAN VISUAL BROWSE LOOP ----------

const PLAN_SCHEMA = {
  type: 'object',
  properties: {
    thinking: {type: 'string'},
    queries: {
      type: 'array',
      items: {
        type: 'object',
        properties: {adapter: {type: 'string'}, query: {type: 'string'}, why: {type: 'string'}},
        required: ['adapter', 'query', 'why'],
        additionalProperties: false,
      },
    },
    xhsKeywords: {type: 'array', items: {type: 'string'}},
    xKeywords: {type: 'array', items: {type: 'string'}},
  },
  required: ['thinking', 'queries', 'xhsKeywords', 'xKeywords'],
  additionalProperties: false,
};

const SCAN_SCHEMA = {
  type: 'object',
  properties: {
    eyeImpression: {type: 'string'},
    openIndices: {type: 'array', items: {type: 'integer'}},
    rejectReasons: {type: 'string'},
    needRound2: {type: 'boolean'},
    round2Reason: {type: 'string'},
    round2Queries: {
      type: 'array',
      items: {
        type: 'object',
        properties: {adapter: {type: 'string'}, query: {type: 'string'}, why: {type: 'string'}},
        required: ['adapter', 'query', 'why'],
        additionalProperties: false,
      },
    },
  },
  required: ['eyeImpression', 'openIndices', 'rejectReasons', 'needRound2', 'round2Reason', 'round2Queries'],
  additionalProperties: false,
};

const PICK_SCHEMA = {
  type: 'object',
  properties: {
    fallbackToArtDirection: {type: 'boolean'},
    top1Index: {type: 'integer'},
    top2Index: {type: 'integer'},
    whyTop1: {type: 'string'},
    toneMatchNote: {type: 'string'},
    borrow3: {type: 'array', items: {type: 'string'}},
    avoid2: {type: 'array', items: {type: 'string'}},
    disqualifiedNotes: {type: 'string'},
  },
  required: ['fallbackToArtDirection', 'top1Index', 'top2Index', 'whyTop1', 'toneMatchNote', 'borrow3', 'avoid2', 'disqualifiedNotes'],
  additionalProperties: false,
};

export async function humanBrowseVisualReferences({
  call,
  brief = '',
  direction = '',
  creative = null,
  carriers = [],
  dir,
  signal,
  onEvent,
  libraryDir = process.env.NIGHTFLIGHT_REFERENCE_LIBRARY || '',
  deps = {},
}) {
  const trackId = detectVisualTrack(brief, carriers, direction);
  if (!trackId) return [];
  const track = VISUAL_TRACKS[trackId];
  const workDir = join(dir, 'human-visual-search', `${trackId}-${sha256(direction || brief).slice(0, 8)}`);
  await mkdir(workDir, {recursive: true, mode: 0o700});

  const searchAdapter = deps.searchAdapter || ((adapter, query) => runAdapter(adapter, query, {signal, fetcher: deps.fetcher}));
  const fetchDetail = deps.fetchDigitalingDetail || (url => fetchDigitalingDetailImages(url, {signal, fetcher: deps.fetcher}));
  const download = deps.download || ((url, destBase, referer) => downloadAndNormalize(url, destBase, {referer, python: deps.python, signal, fetcher: deps.fetcher}));
  const buildGrid = deps.makeContactSheet || ((items, outPath) => makeContactSheet(items, outPath, {python: deps.python, signal}));

  // Step 0: Priority #1 Local Curated Reference Library
  const localHits = await (deps.searchLocal || searchLocalReferenceLibrary)({
    libraryDir,
    track: trackId,
    keywords: [direction, creative?.main || '', brief.slice(0, 60)],
    dir: workDir,
    python: deps.python,
    signal,
  });

  // Step 1: Associative cross-category query planning (+ social keyword packs)
  await onEvent?.(`「${direction || track.name}」按【${track.name}】模式联想拆词搜图`);
  const planResp = await call(
    `你是资深广告美术指导，正在为以下 Brief 的【${track.name}】方向找视觉参考图。
Brief 摘要：${String(brief).slice(0, 420)}
当前创意方向：${direction || '主方向'}${creative?.main ? `（主张：${creative.main}）` : ''}
本方向目标：${track.goal}
找图规则：${track.humanRule}
安全要求：只用通用品类和公开视觉词，不泄漏客户/品牌名、项目名、联系人或未公开配方。

请输出：
1. queries：为下列每个公开图源各给 1 组严格限长的搜索词（英文站 2-3 个纯英文词，中文站 1-2 个中文短词且总字数≤6）：
${track.sources.map((s, i) => `${i + 1}. adapter="${s.adapter}" (${s.lang}): ${s.hint}`).join('\n')}
2. xhsKeywords：给 3 组最适合在【小红书】直接搜出高审美实拍参考的中文关键词。
3. xKeywords：给 3 组最适合在【X / Twitter】直接搜出国际高审美设计参考的英文关键词。`,
    [],
    PLAN_SCHEMA,
    {delegate: true, assignment: `视觉类人搜图拆词(${trackId})`, context: ''},
  );
  const initialPlan = planResp.parsedOutput || {queries: [], xhsKeywords: [], xKeywords: []};
  const socialKeywords = {xhs: initialPlan.xhsKeywords || [], x: initialPlan.xKeywords || []};
  let currentQueries = (initialPlan.queries || []).filter(q => q?.adapter && q?.query);
  if (process.env.X_BEARER_TOKEN && socialKeywords.x[0]) {
    currentQueries = [...currentQueries, {adapter: 'x_api', query: socialKeywords.x[0], why: 'X API v2 社媒实时参考'}];
  }

  const detailPool = [...localHits.map(item => ({
    ...item,
    projectUrl: item.pageUrl,
    imageUrl: item.sourceUrl,
  }))];
  const seenProjects = new Set();
  const seenImageUrls = new Set();

  for (let round = 1; round <= 2; round++) {
    signal?.throwIfAborted();
    const batches = await Promise.all(currentQueries.map(q => searchAdapter(q.adapter, sanitizeTrackQuery(q.adapter, q.query))));
    const projects = [];
    for (const batch of batches) {
      for (const p of batch || []) {
        const key = p.projectUrl || p.coverUrl;
        if (!key || seenProjects.has(key)) continue;
        seenProjects.add(key);
        projects.push(p);
      }
    }

    const coverItems = [];
    for (let i = 0; i < Math.min(9, projects.length); i++) {
      const p = projects[i];
      const dl = await download(p.coverUrl, join(workDir, `r${round}_cover_${i + 1}`), p.projectUrl);
      if (dl) {
        coverItems.push({
          index: coverItems.length + 1,
          label: `${p.source} | ${String(p.title || '').slice(0, 20)}`,
          path: dl.path,
          project: p,
          dl,
        });
      }
    }
    if (!coverItems.length) break;

    const gridPath = join(workDir, `round${round}_grid.jpg`);
    await buildGrid(coverItems.map(c => ({index: c.index, label: c.label, path: c.path})), gridPath);
    const allowedAdapters = [...new Set(track.sources.map(s => `${s.adapter}(${s.lang})`))].join(', ');

    await onEvent?.(`「${direction || track.name}」第 ${round} 轮九宫格扫图（${coverItems.length} 个项目）`);
    const scanResp = await call(
      `你是资深广告美术指导，正在「扫一屏项目封面图」（红底白字 #1 到 #${coverItems.length}）。
当前任务：【${track.name}】—— ${track.goal}
方向规则：${track.humanRule}
当前来源：
${coverItems.map(c => `#${c.index}: [${c.project.source}] ${c.project.title}`).join('\n')}

⚠️ 最关键的「借三改二」挑图心法（严禁死板找同款！）：
- 你不是在找已经长成一模一样产品的竞品同款，而是在找**视觉骨架足够高级、拿来改掉两样（产品/颜色/品牌字）就能用**的设计参考！
- 只要原图的**构图、光影、空间尺度、立面结构或标签留白比例**足够高级，即使品类或颜色不同，也大胆点进去翻图！
- 真正应该刷掉的是：**纯 Logo 字标卡、土味促销大字报、PPT 策略分析图/示意图、毫无空间感的纯平面（针对活动类）**。

请输出：
1. eyeImpression：一句话评这屏图的视觉骨架上限与可借鉴度。
2. openIndices：挑出 2–3 个最值得「点进项目详情页翻大图」的编号。
3. rejectReasons：简述刷掉其他编号的原因。
4. needRound2：如果是第 1 轮且想补搜另一角度，设为 true，并在 round2Queries 给 2 组【极短】新词（可用 adapter：${allowedAdapters}；英文源仅 2-3 个英文词绝不写中文，中文源 digitaling 仅 1 个中文短词）。`,
      [{path: gridPath, mediaType: 'image/jpeg'}],
      SCAN_SCHEMA,
      {delegate: true, assignment: `视觉扫图第${round}轮(${trackId})`, context: ''},
    );
    const scan = scanResp.parsedOutput || {openIndices: [], needRound2: false, round2Queries: []};
    const picked = (scan.openIndices || []).map(idx => coverItems.find(c => c.index === idx)).filter(Boolean).slice(0, 3);

    for (const item of picked) {
      const p = item.project;
      let detailUrls = p.detailImageUrls;
      if (!detailUrls && p.source === '数英网') detailUrls = await fetchDetail(p.projectUrl);
      detailUrls = detailUrls || [];
      const ordered = [];
      if (p.coverUrl && !/(logo|wordmark|monogram|icon)/i.test(p.coverUrl)) ordered.push(p.coverUrl);
      const preferred = (p.source === 'BP&O' || p.source === 'Designboom')
        ? [
            ...detailUrls.filter(u => /(bottle|packaging|label|poster|glass|pack|interior|bar|space|pavilion|facade|installation|exhibition)/i.test(u) && !/(logo|wordmark|icon|monogram|trio|grid)/i.test(u)),
            ...detailUrls.filter(u => !/(logo|wordmark|icon|monogram)/i.test(u)),
          ]
        : detailUrls;
      for (const u of preferred) if (!ordered.includes(u)) ordered.push(u);

      let grabbed = 0;
      for (const u of ordered.slice(0, 6)) {
        if (grabbed >= 3) break;
        if (seenImageUrls.has(u)) continue;
        seenImageUrls.add(u);
        const dl = await download(u, join(workDir, `detail_${detailPool.length + 1}`), p.projectUrl);
        if (dl) {
          detailPool.push({
            ...dl,
            source: p.source,
            title: p.title,
            pageUrl: p.projectUrl || u,
            query: currentQueries.map(q => q.query).join(' / '),
          });
          grabbed++;
        }
      }
    }

    if (round === 1 && (scan.needRound2 || detailPool.length < 4) && scan.round2Queries?.length) {
      currentQueries = scan.round2Queries.slice(0, 3);
    } else {
      break;
    }
  }

  const finalPool = detailPool.slice(0, 9);
  if (!finalPool.length) return [];

  const finalGridPath = join(workDir, 'final_grid.jpg');
  await buildGrid(finalPool.map((c, i) => ({
    index: i + 1,
    label: `${c.source} | ${String(c.title || '').slice(0, 20)}`,
    path: c.path,
  })), finalGridPath);

  const pickResp = await call(
    `你是 4A 资深美术指导。两轮扫图+进详情页后，桌面上摊开了这 ${finalPool.length} 张单帧大图（编号 #1 到 #${finalPool.length}）。
任务：【${track.name}】—— ${track.goal}
方向规则：${track.humanRule}

⚠️ 「借三改二」终选原则：
- 挑的是**视觉骨架最高级、拿来改掉品牌/颜色/产品就能出大片**的那 1 张单帧！原图品类/颜色/品牌名不同完全没关系，只要构图、光影、空间尺度或版式比例够高级，就可以选！
- **绝对硬红线（一票否决，严禁选中！）**：
  1. **PPT 策略分析页 / 概念示意图 / 原理图 / 三栏文字拆解图 / 手绘图表 / 信息表** —— 一律淘汰！
  2. **多图拼版 / 左右分屏 / 三联拼图（collage/trio）** —— 一律淘汰，只要干净单帧！
  3. **纯 Logo 字标卡 / 微信表情条 / 纯平面活动预告（对活动类）** —— 一律淘汰！
- **编号自检**：输出的 top1Index 整数必须与 whyTop1 中提到的图号完全一致！
- 只有当整桌图全踩上述硬红线时，才设 fallbackToArtDirection=true、top1Index=0。`,
    [{path: finalGridPath, mediaType: 'image/jpeg'}],
    PICK_SCHEMA,
    {delegate: true, assignment: `视觉摊桌面终选(${trackId})`, context: ''},
  );
  const pick = pickResp.parsedOutput || {fallbackToArtDirection: true, top1Index: 0, top2Index: 0};
  if (pick.fallbackToArtDirection || !pick.top1Index) return [];

  const chosen = [finalPool[pick.top1Index - 1], finalPool[pick.top2Index - 1]].filter(Boolean);
  const dedup = [];
  const seenSha = new Set();
  for (const item of chosen) {
    if (seenSha.has(item.sha256)) continue;
    seenSha.add(item.sha256);
    dedup.push({
      path: item.path,
      sha256: item.sha256,
      byteLength: item.byteLength,
      mediaType: item.mediaType,
      width: item.width,
      height: item.height,
      title: item.title,
      pageUrl: item.pageUrl,
      sourceUrl: item.sourceUrl,
      query: item.query,
      track: trackId,
      borrow3: pick.borrow3 || [],
      avoid2: pick.avoid2 || [],
      whyTop1: pick.whyTop1 || '',
      socialKeywords,
    });
  }
  return dedup;
}
