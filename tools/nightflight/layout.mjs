import { constants, existsSync } from 'node:fs';
import { open, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildProposalOutline } from './proposal-outline.mjs';

const app = fileURLToPath(new URL('../../apps/workbench-preview/', import.meta.url));
const requireApp = createRequire(join(app, 'package.json'));
const chapters = { brief: '简报与任务', research: '研究', strategy: '策略', copy: '文案与主题', visual: '视觉开发' };

// Compile only the existing Deck Studio modules. The browser receives one script in memory.
async function buildRenderer() {
  const { build } = await import(pathToFileURL(requireApp.resolve('vite')).href);
  const id = 'nightflight-deck-entry';
  const result = await build({
    root: app, configFile: false, logLevel: 'error', publicDir: false,
    plugins: [{
      name: id,
      resolveId(source) { if (source === id || source === join(app, id)) return '\0' + id; },
      load(source) {
        if (source !== '\0' + id) return;
        return [
          "export { compile } from '/src/proposal/deck-studio/engine.ts'",
          "export { exportDeckStudio } from '/src/proposal/deck-studio/export.ts'",
          "export { paginateText } from '/src/proposal/generic-deck/pagination.ts'",
          'export { compileOutline, legacyPages } from ' + JSON.stringify(fileURLToPath(new URL('./layout-pages.mjs', import.meta.url))),
        ].join(';');
      },
    }],
    build: { write: false, minify: false, lib: { entry: id, name: 'NightflightDeck', formats: ['iife'] } },
  });
  return (Array.isArray(result) ? result[0] : result).output.find(item => item.type === 'chunk').code;
}

async function readOutlineImages(outline, project, dir) {
  const allowed = new Map([...project.artifacts, ...(project.attachments ?? [])].filter(a =>
    a.kind === 'image' || a.kind === 'attachment').map(a => [a.name, a]));
  const images = [];
  for (const name of new Set(outline.pages.flatMap(p => p.images))) {
    const record = allowed.get(name);
    if (!record || basename(name) !== name || name.startsWith('.') || /[\\/:\x00-\x1f]/u.test(name)) {
      throw Error('逐页稿引用了本次输入以外的图片：' + name);
    }
    const file = await open(join(dir, name), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      const info = await file.stat();
      if (!info.isFile() || info.size <= 0 || info.size > 128 * 1024 * 1024) throw Error('排版图片文件无效：' + name);
      const bytes = await file.readFile();
      const mime = bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) ? 'image/png'
        : bytes[0] === 0xff && bytes[1] === 0xd8 ? 'image/jpeg' : null;
      if (!mime) throw Error('排版支持 PNG 或 JPEG 原图：' + name);
      images.push({ id: name, alt: record.visual?.direction || name.replace(/\.[^.]+$/u, ''), data: 'data:' + mime + ';base64,' + bytes.toString('base64') });
    } finally { await file.close(); }
  }
  return images;
}

async function readSources(project, dir) {
  const sections = [];
  if (typeof project.brief === 'string' && project.brief.trim()) {
    sections.push({ chapter: chapters.brief, name: '原始 Brief', text: project.brief });
  }
  for (const [stage, chapter] of Object.entries(chapters)) {
    for (const artifact of project.artifacts.filter(item => item.stage === stage)) {
      if (!['image', 'text'].includes(artifact.kind)) continue;
      if (!artifact.name || basename(artifact.name) !== artifact.name) throw Error('排版输入文件名无效');
      const file = await realpath(join(dir, artifact.name));
      if (dirname(file) !== dir) throw Error('排版输入超出本次验收目录');
      const bytes = await readFile(file);
      if (artifact.kind === 'image') {
        const mime = bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) ? 'image/png'
          : bytes[0] === 0xff && bytes[1] === 0xd8 ? 'image/jpeg' : null;
        if (!mime) throw Error('排版支持 PNG 或 JPEG 原图：' + artifact.name);
        sections.push({ chapter, name: artifact.name, data: 'data:' + mime + ';base64,' + bytes.toString('base64') });
      } else {
        const text = bytes.toString('utf8');
        if (!text.trim()) throw Error('排版输入正文为空：' + artifact.name);
        sections.push({ chapter, name: artifact.name, text });
      }
    }
    if (stage === 'copy' && project.directions?.length) {
      sections.push({ chapter, name: '创意方向', text: project.directions.join('\n') });
      if (project.choice) sections.push({ chapter, name: '采用方向', text: '采用方向：' + project.choice });
    }
  }
  if (!sections.length) throw Error('没有可排版的来源');
  return sections;
}

async function render({ title, sections, outline, images }) {
  const renderer = globalThis.NightflightDeck;
  const theme = { primary: '#143F9B', accent: '#08746D', style: 'business', mode: 'light' };
  const result = outline ? await renderer.compileOutline(outline, images, renderer, theme)
    : await renderer.legacyPages(sections, renderer, theme);
  const deck = { title, pages: result.pages, status: result.status };
  const blob = await renderer.exportDeckStudio(deck, new AbortController().signal);
  const data = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
  return { data, deck, outline: result.outline };
}

export async function runLayout({ project, dir, onEvent = () => {}, signal = new AbortController().signal }) {
  signal.throwIfAborted();
  const root = await realpath(dir);
  const outline = await buildProposalOutline(project, root);
  const sections = outline ? [] : await readSources(project, root);
  const images = outline ? await readOutlineImages(outline, project, root) : [];
  onEvent(outline ? '正在按客户逐页稿排版并核对目录与材料' : '正在将现有材料按原阶段顺序排版');
  const code = await buildRenderer();
  signal.throwIfAborted();
  const { chromium } = requireApp('playwright');
  const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || (existsSync(chrome) ? chrome : undefined);
  const browser = await chromium.launch({ headless: true, executablePath });
  const abort = () => { void browser.close().catch(() => {}); };
  signal.addEventListener('abort', abort, { once: true });
  const id = randomUUID();
  const name = '提案-' + id + '.pptx';
  const preview = '提案预览-' + id + '.deck.json';
  const outlineName = '客户逐页稿-' + id + '.outline.json';
  const tmp = join(root, '.' + id + '.tmp');
  const artifacts = [{ kind: 'pptx', name }, { kind: 'text', name: preview }];
  const created = [];
  try {
    signal.throwIfAborted();
    const page = await browser.newPage({ offline: true });
    await page.addScriptTag({ content: code });
    const { data, deck, outline: fitted } = await page.evaluate(render, { title: project.title, sections, outline, images });
    signal.throwIfAborted();
    await writeFile(tmp, Buffer.from(data, 'base64'), { flag: 'wx', signal });
    signal.throwIfAborted();
    onEvent('已排成 ' + deck.pages.length + ' 页，正在保存可编辑 PPTX');
    if (fitted) {
      await writeFile(join(root, outlineName), JSON.stringify(fitted), { flag: 'wx', signal });
      created.push(outlineName);
      artifacts.push({ kind: 'text', name: outlineName });
    }
    await writeFile(join(root, preview), JSON.stringify(deck), { flag: 'wx', signal });
    created.push(preview);
    signal.throwIfAborted();
    await rename(tmp, join(root, name));
    return { artifacts, pages: deck.pages.length };
  } catch (error) {
    await Promise.all(created.map(filename => rm(join(root, filename), { force: true })));
    throw error;
  } finally {
    signal.removeEventListener('abort', abort);
    await browser.close();
    await rm(tmp, { force: true });
  }
}
