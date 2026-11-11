import {readNativeManifestFile} from './native-manifest.mjs';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {randomUUID} from 'node:crypto';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const runsDir = path.join(root, 'output/auto-layout/runs');
const brandPath = path.join(root, 'output/auto-layout/inputs/brand.json');
const assetsPath = path.join(root, 'output/auto-layout/inputs/assets.json');
const ledgerPath = path.join(root, 'output/ppt/m6-integrated-v5/content-ledger.json');
const styles = ['editorial', 'stage', 'evidence'];
const editable = ['title', 'section', 'sub', 'takeaway', 'note', 'items'];
const readJSON = async file => JSON.parse(await fs.readFile(file, 'utf8'));
const problem = (message, status = 400) => Object.assign(new Error(message), {status});
const fileURL = file => `/files?path=${encodeURIComponent(path.relative(runsDir, file))}`;

async function sample() {
  const [brand, ledger] = await Promise.all([readJSON(brandPath), readJSON(ledgerPath)]);
  brand.font.files = brand.font.files.map(file => path.resolve(path.dirname(brandPath), file));
  return {brand, ledger};
}

async function safeFile(relative) {
  if (!relative || path.isAbsolute(relative)) throw problem('文件路径不合法', 403);
  const candidate = path.resolve(runsDir, relative);
  if (!candidate.startsWith(runsDir + path.sep)) throw problem('文件不在成品目录内', 403);
  const base = await fs.realpath(runsDir);
  const file = await fs.realpath(candidate);
  if (!file.startsWith(base + path.sep)) throw problem('文件不在成品目录内', 403);
  if (!(await fs.stat(file)).isFile()) throw problem('文件不存在', 404);
  return file;
}

async function listRuns() {
  await fs.mkdir(runsDir, {recursive: true});
  const results = [];
  for (const entry of await fs.readdir(runsDir, {withFileTypes: true})) {
    if (!entry.isDirectory()) continue;
    try {
      const manifestFile = await safeFile(`${entry.name}/layout-manifest.json`);
      const receipt = await readJSON(await safeFile(`${entry.name}/build/validation.json`));
      if (receipt.packageIntegrity?.status !== 'pass' || receipt.presentationLayout?.exitCode !== 0 || receipt.firstPartyImport?.passed !== true) continue;
      const manifest = readNativeManifestFile(manifestFile).manifest;
      if (!styles.includes(manifest.style) || !manifest.slides?.length) continue;
      const deck = await safeFile(`${entry.name}/delivery/deck.pptx`);
      const renders = [];
      for (let i = 0; i < manifest.slides.length; i++) {
        renders.push(fileURL(await safeFile(`${entry.name}/renders/slide-${String(i + 1).padStart(2, '0')}.png`)));
      }
      results.push({id: entry.name, style: manifest.style, createdAt: (await fs.stat(deck)).mtime.toISOString(), deck: fileURL(deck), renders,
        manifest: {width: manifest.width, height: manifest.height, fontFamily: manifest.fontFamily, slideCount: manifest.slides.length,
          templates: [...new Set(manifest.slides.map(slide => slide.template))], decisions: manifest.decisions, inputHashes: manifest.inputHashes}});
    } catch {}
  }
  return results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function textShape(value, original) {
  if (typeof original === 'string') return typeof value === 'string' && value.length <= 20000 && (original.trim() ? Boolean(value.trim()) : true);
  return Array.isArray(original) && Array.isArray(value) && value.length === original.length && value.every((item, i) => textShape(item, original[i]));
}

async function validate(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || Object.keys(payload).some(key => !['style', 'brand', 'ledger'].includes(key))) throw problem('请求只能包含 style、brand、ledger');
  if (!styles.includes(payload.style)) throw problem('请选择有效排版风格');
  const original = await sample();
  const {brand, ledger} = payload;
  if (!brand || typeof brand.name !== 'string' || !brand.name.trim() || brand.name.length > 200) throw problem('品牌名称须为 1 至 200 字符');
  if (!brand.colors || Object.keys(brand.colors).length !== 5 || Object.keys(original.brand.colors).some(key => !/^#[0-9a-f]{6}$/i.test(brand.colors[key]))) throw problem('品牌颜色须为 #RRGGBB');
  const expectedBrand = {...original.brand, name: brand.name, colors: brand.colors};
  if (!isDeepStrictEqual(brand, expectedBrand)) throw problem('仅允许修改品牌名称和颜色，字体与字号使用固定配置');
  if (!ledger || !Array.isArray(ledger.pages) || ledger.pages.length !== original.ledger.pages.length) throw problem('原文页数不能改变');
  const expectedLedger = structuredClone(original.ledger);
  for (let i = 0; i < expectedLedger.pages.length; i++) {
    const supplied = ledger.pages[i];
    if (!supplied || typeof supplied !== 'object') throw problem(`第 ${i + 1} 页格式错误`);
    if (expectedLedger.pages[i].kind === 'kvfull' && !isDeepStrictEqual(supplied, expectedLedger.pages[i])) throw problem('完整海报的文字已融入图像，请更换海报资产后再修改');
    for (const key of editable) if (Object.hasOwn(expectedLedger.pages[i], key)) {
      if (!textShape(supplied[key], expectedLedger.pages[i][key])) throw problem(`第 ${i + 1} 页 ${key} 格式错误或内容为空`);
      expectedLedger.pages[i][key] = supplied[key];
    }
  }
  if (!isDeepStrictEqual(ledger, expectedLedger)) throw problem('仅允许编辑原文文字，不允许修改资产、证据引用或页面结构');
  return {style: payload.style, brand: expectedBrand, ledger: expectedLedger};
}

async function bodyJSON(req) {
  if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) throw problem('请使用 JSON 请求', 415);
  const chunks = await new Promise((resolve, reject) => {
    let size = 0;
    let exceeded = false;
    const collected = [];
    req.on('data', chunk => {
      size += chunk.length;
      if (size > 2 * 1024 * 1024) {
        if (!exceeded) reject(problem('请求体超过 2 MB', 413));
        exceeded = true;
        collected.length = 0;
      } else if (!exceeded) collected.push(chunk);
    });
    req.on('end', () => { if (!exceeded) resolve(collected); });
    req.on('error', reject);
    req.on('aborted', () => reject(problem('请求已中断')));
  });
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw problem('JSON 格式错误'); }
}

export function createServer() {
  let job = {status: 'idle'};
  let accepting = false;
  async function build(input, id) {
    const output = path.join(runsDir, id);
    try {
      await fs.mkdir(output, {recursive: true});
      const ledger = path.join(output, 'input-ledger.json');
      const brand = path.join(output, 'input-brand.json');
      await Promise.all([fs.writeFile(ledger, JSON.stringify(input.ledger, null, 2)), fs.writeFile(brand, JSON.stringify(input.brand, null, 2))]);
      const {buildDeck} = await import('./index.mjs');
      await buildDeck({ledger, brand, assets: assetsPath, style: input.style, output});
      job = {...job, status: 'completed', finishedAt: new Date().toISOString(), runId: id};
    } catch (error) {
      job = {...job, status: 'failed', finishedAt: new Date().toISOString(), error: error.message};
    }
  }
  return http.createServer(async (req, res) => {
    const send = (status, data) => { res.writeHead(status, {'Content-Type': 'application/json; charset=utf-8'}); res.end(JSON.stringify(data)); };
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self'; frame-ancestors 'none'");
    try {
      const port = req.socket.localPort;
      const allowedHosts = [`127.0.0.1:${port}`, `localhost:${port}`];
      if (!allowedHosts.includes(req.headers.host)) throw problem('Host 不允许', 403);
      const url = new URL(req.url, `http://${req.headers.host}`);
      if (req.method === 'POST') {
        if (req.headers.origin !== `http://${req.headers.host}` || (req.headers['sec-fetch-site'] && req.headers['sec-fetch-site'] !== 'same-origin')) throw problem('只接受操作页的同源请求', 403);
        if (url.pathname !== '/api/build') throw problem('接口不存在', 404);
        if (accepting || job.status === 'running') throw problem('已有生成任务，请等待完成', 409);
        accepting = true;
        try {
          const input = await validate(await bodyJSON(req));
          const id = `${new Date().toISOString().replace(/[:.]/g, '-')}-${input.style}-${randomUUID().slice(0, 8)}`;
          job = {id, style: input.style, status: 'running', startedAt: new Date().toISOString(), message: '正在排版、渲染与校验，完成后自动显示。'};
          send(202, job);
          void build(input, id);
        } finally { accepting = false; }
        return;
      }
      if (req.method !== 'GET') throw problem('方法不支持', 405);
      if (url.pathname === '/api/sample') return send(200, await sample());
      if (url.pathname === '/api/runs') return send(200, {runs: await listRuns()});
      if (url.pathname === '/api/job') return send(200, job);
      if (url.pathname === '/') {
        res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
        return res.end(await fs.readFile(path.join(here, 'ui.html')));
      }
      if (url.pathname === '/files') {
        const file = await safeFile(url.searchParams.get('path'));
        const types = {'.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation', '.json': 'application/json'};
        const ext = path.extname(file).toLowerCase();
        if (!types[ext]) throw problem('不支持此文件类型', 403);
        if (ext === '.pptx') res.setHeader('Content-Disposition', 'attachment; filename="deck.pptx"');
        res.writeHead(200, {'Content-Type': types[ext]});
        return res.end(await fs.readFile(file));
      }
      throw problem('页面不存在', 404);
    } catch (error) {
      if (!res.headersSent) send(error.status || (error.code === 'ENOENT' ? 404 : 500), {error: error.status ? error.message : '无法读取或处理本地文件'});
      else res.end();
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const port = Number(process.env.PORT || 4180);
  createServer().listen(port, '127.0.0.1', () => console.log(`自动排版工作台 http://127.0.0.1:${port}`));
}
