import { existsSync } from 'node:fs';
import { readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

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
        ].join(';');
      },
    }],
    build: { write: false, minify: false, lib: { entry: id, name: 'NightflightDeck', formats: ['iife'] } },
  });
  return (Array.isArray(result) ? result[0] : result).output.find(item => item.type === 'chunk').code;
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

// Runs inside headless Chromium with its actual font metrics and image decoder.
async function render({ title, sections }) {
  const { compile, exportDeckStudio, paginateText } = globalThis.NightflightDeck;
  const theme = { primary: '#143F9B', accent: '#08746D', style: 'business', mode: 'light' };
  const drafts = [];
  const inventory = [];
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
          const page = compile([makeDraft(text)], title, theme)[0];
          return page.nodes.some(node => node.kind === 'text' && node.size >= 42
            && normalized(node.lines.join('')) === normalized(text));
        } catch { return false; }
      };
      const text = section.text.trim();
      const fragments = fits(text) ? [{ raw: text }] : paginateText(text, fits);
      for (const [i, fragment] of fragments.entries()) drafts.push(makeDraft(fragment.raw, i));
    }
    inventory.push({ source: section.name, first, last: drafts.length });
  }
  const pages = compile(drafts, title, theme);
  const blob = await exportDeckStudio({ title, pages, status: '本地试运行' }, new AbortController().signal);
  const data = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
  return { data, inventory, deck: { title, pages } };
}

export async function runLayout({ project, dir, onEvent = () => {}, signal = new AbortController().signal }) {
  signal.throwIfAborted();
  const root = await realpath(dir);
  const sections = await readSources(project, root);
  onEvent('正在将本次简报、各阶段正文与原图编入 Deck Studio');
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
  const tmp = join(root, '.' + id + '.tmp');
  try {
    signal.throwIfAborted();
    const page = await browser.newPage({ offline: true });
    await page.addScriptTag({ content: code });
    const { data, inventory, deck } = await page.evaluate(render, { title: project.title, sections });
    signal.throwIfAborted();
    await writeFile(tmp, Buffer.from(data, 'base64'), { flag: 'wx', signal });
    signal.throwIfAborted();
    onEvent('已排成 ' + inventory.at(-1).last + ' 页，正在保存可编辑 PPTX');
    await writeFile(join(root, preview), JSON.stringify(deck), { flag: 'wx', signal });
    await rename(tmp, join(root, name));
    return { artifacts: [{ kind: 'pptx', name }, { kind: 'text', name: preview }], pages: deck.pages.length };
  } finally {
    signal.removeEventListener('abort', abort);
    await browser.close();
    await rm(tmp, { force: true });
  }
}
