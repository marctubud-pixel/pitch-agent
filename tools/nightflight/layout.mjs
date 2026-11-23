import {projectTheme} from './layout-theme.mjs';
import {chromiumPath} from './runtime-dependencies.mjs';
import { constants } from 'node:fs';
import { open, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildProposalOutline } from './proposal-outline.mjs';
import { readManuscriptPlan } from './manuscript.mjs';

const app = fileURLToPath(new URL('../../apps/workbench-preview/', import.meta.url));
const requireApp = createRequire(join(app, 'package.json'));
const chapters = { brief: '简报与任务', research: '研究', strategy: '策略', copy: '文案与主题', visual: '视觉开发' };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

// Compile only the existing Deck Studio modules. The browser receives one script in memory.
async function buildRenderer() {
  const { build } = await import(pathToFileURL(requireApp.resolve('vite')).href);
  const id = 'nightflight-deck-entry';
  const result = await build({
    root: app, define: {'process.env.NODE_ENV':JSON.stringify('production')}, esbuild: {jsx: 'automatic'}, configFile: false, logLevel: 'error', publicDir: false,
    plugins: [{
      name: id,
      resolveId(source) { if (source === id || source === join(app, id)) return '\0' + id; },
      load(source) {
        if (source !== '\0' + id) return;
        return [
          "import {createElement} from 'react'",
          "import {renderToStaticMarkup} from 'react-dom/server.browser'",
          "import {DeckStudioPage} from '/src/proposal/deck-studio/Viewer.tsx'",
          "export const pageMarkup = page => renderToStaticMarkup(createElement(DeckStudioPage,{page}))",
          "export { compile } from '/src/proposal/deck-studio/engine.ts'",
          "export { exportDeckStudio } from '/src/proposal/deck-studio/export.ts'",
          "export { paginateText } from '/src/proposal/generic-deck/pagination.ts'",
          'export { compileManuscript, compileOutline, legacyPages, applyPageEdits } from ' + JSON.stringify(fileURLToPath(new URL('./layout-pages.mjs', import.meta.url))),
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

async function render({ title, sections, outline, manuscript, images, edits, theme, refined }) {
  const renderer = globalThis.NightflightDeck;
  for (const key of ['brandLogo','agencyLogo']) {
    if (!theme[key]) continue;
    const image=new Image();
    image.src=theme[key].data;
    await image.decode();
    theme[key].width=image.naturalWidth;
    theme[key].height=image.naturalHeight;
  }
  const result = manuscript ? await renderer.compileManuscript(manuscript, images, renderer, theme, edits)
    : outline ? await renderer.compileOutline(outline, images, renderer, theme)
    : await renderer.legacyPages(sections, renderer, theme);
  const {brandLogo,agencyLogo,...settings}=theme;
  const deck = {title, pages:result.pages,status:result.status,style:theme.style,
    theme:{...settings,...(brandLogo && {brandLogoFile:brandLogo.alt}),...(agencyLogo && {agencyLogoFile:agencyLogo.alt})}};
  if (!manuscript) renderer.applyPageEdits(deck.pages,edits);
  const blob = await renderer.exportDeckStudio(deck, new AbortController().signal, refined);
  const data = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
  return { data, deck, outline: result.outline };
}

export function layoutEdits(project) {
  const edits=[...(project.previousLayoutChanges ?? [])];
  for(const item of (project.feedback ?? []).filter(f=>f.stage==='layout' && !['final','final_gate'].includes(f.source))) {
    for(const line of item.text.trim().split(/\r?\n/u)) {
      const split=line.trim().match(/^第\s*(\d+)\s*页[，,：:\s]*主图放([左右])[。.!！]?$/u);
      if (project.layoutFromManuscript && split && Number.isSafeInteger(Number(split[1])) && Number(split[1])>=1) {
        edits.push({page:Number(split[1]),imageSide:split[2]});
        continue;
      }
      const match=line.trim().match(/^第\s*(\d+)\s*页[，,：:\s]*(?:把|将)?\s*[「『“"](.+?)[」』”"]\s*(?:改成|改为|替换为|换成)\s*[「『“"](.+?)[」』”"][。.!！]?$/u);
      if(!match || !Number.isSafeInteger(Number(match[1])) || Number(match[1])<1)
        throw Error('请按「第 2 页，把『原文』改为『新文』」指定改字'+(project.layoutFromManuscript?'，分屏可写「第 8 页，主图放右」。':'。'));
      edits.push({page:Number(match[1]),from:match[2],to:match[3]});
    }
  }
  if(project.feedback?.some(f=>f.source==='final' && f.stage==='layout') && !project.feedback.some(f=>f.stage==='layout' && f.source!=='final'))
    throw Error('请按终审记录补充具体页码与改字，或先在相应阶段修改内容后重排。');
  return edits;
}

export async function runLayout({ project, dir, onEvent = () => {}, signal = new AbortController().signal, reviewDraft }) {
  signal.throwIfAborted();
  const root = await realpath(dir);
  const edits=reviewDraft ? [] : layoutEdits(project);
  const manuscript = reviewDraft ?? await readManuscriptPlan(project,root);
  if (project.layoutFromManuscript && !manuscript) throw Error('未取得本版逐页稿，请先编稿');
  const outline = manuscript ? null : await buildProposalOutline(project, root);
  const theme = await projectTheme(project,root,manuscript?.project.carriers[0] || outline?.kind || project.proposalKind,signal);
  if (manuscript) {delete theme.agencyLogo;delete theme.agencyName;}
  const sections = manuscript || outline ? [] : await readSources(project, root);
  const imageIndex = manuscript ? {pages:[{images:manuscript.figures.map(f=>f.name)}]} : outline;
  const images = imageIndex ? await readOutlineImages(imageIndex, project, root) : [];
  onEvent(manuscript ? '正在按本版逐页稿原页序生成可编辑 PPTX' : outline ? '正在按客户逐页稿排版并核对目录与材料' : '正在将现有材料按原阶段顺序排版');
  const code = await buildRenderer();
  signal.throwIfAborted();
  const { chromium } = requireApp('playwright');
  const executablePath = chromiumPath();
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
    const page = await browser.newPage({ offline: true, viewport:{width:1280,height:720} });
    await page.addScriptTag({ content: code });
    const { data, deck, outline: fitted } = await page.evaluate(render, {
      title: project.title, sections, outline, manuscript, images, edits, theme, refined:Boolean(reviewDraft),
    });
    signal.throwIfAborted();
    const pptx=Buffer.from(data,'base64');
    await writeFile(tmp, pptx, { flag: 'wx', signal });
    signal.throwIfAborted();
    onEvent('已排成 ' + deck.pages.length + ' 页，正在保存可编辑 PPTX');
    if (fitted) {
      await writeFile(join(root, outlineName), JSON.stringify(fitted), { flag: 'wx', signal });
      created.push(outlineName);
      artifacts.push({ kind: 'text', name: outlineName });
    }
    // Render the very same page object and component used by the Deck preview.
    await page.evaluate(()=>{document.body.style.margin='0'});
    const renders=[];
    for (const [index, slide] of deck.pages.entries()) {
      signal.throwIfAborted();
      await page.evaluate(async slide=>{
        document.body.innerHTML=globalThis.NightflightDeck.pageMarkup(slide);
        await document.fonts.ready;
        await Promise.all([...document.querySelectorAll('svg image')].map(node=>{
          const image=new Image(); image.src=node.getAttribute('href'); return image.decode();
        }));
      },slide);
      const file='page-'+String(index+1).padStart(4,'0')+'-'+id+'.jpg';
      const bytes=await page.locator('svg.deck-studio-page').screenshot({type:'jpeg',quality:86});
      await writeFile(join(root,file),bytes,{flag:'wx',signal});
      created.push(file);
      artifacts.push({kind:'image',name:file,renderPage:index+1});
      renders.push(hash(bytes));
    }
    deck.edition={pptxSha256:hash(pptx),renderSha256:renders};
    await writeFile(join(root, preview), JSON.stringify(deck), { flag: 'wx', signal });
    created.push(preview);
    await rename(tmp, join(root, name));
    return { artifacts, pages: deck.pages.length, layoutChanges:edits };
  } catch (error) {
    await Promise.all(created.map(filename => rm(join(root, filename), { force: true })));
    throw error;
  } finally {
    signal.removeEventListener('abort', abort);
    await browser.close();
    await rm(tmp, { force: true });
  }
}
