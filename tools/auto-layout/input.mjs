import { readFile } from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {SEMANTIC_SCHEMA,normalizeManuscript,normalizeLegacy,layoutIssue} from './semantic-input.mjs';
import { resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { loadImage, GlobalFonts } from '@napi-rs/canvas';

const pageFields = {
  cover: ['sub'], brief: ['items'], statement: ['sub'], gallery: ['ids', 'takeaway'],
  feature: ['ids', 'sub'], audience: ['items', 'evidence'], evidence: ['items', 'evidence'],
  circles: ['items', 'sub'], direction: ['sub'], kvfull: ['direction', 'art'],
  explanation: ['direction', 'art', 'sub'], visualcomparison: ['items', 'arts'],
  application: ['direction', 'mockup'],
};
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = (at, message) => { throw new Error(`${at}: ${message}`); };
function object(value, at) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(at, 'expected an object');
  return value;
}
function string(value, at) {
  if (typeof value !== 'string' || !value.trim()) fail(at, 'expected a non-empty string');
  return value;
}
function list(value, at) {
  if (!Array.isArray(value) || !value.length) fail(at, 'expected a non-empty array');
  return value;
}
async function bytes(file, at, readBytes=readFile) {
  try { return await readBytes(file); }
  catch (error) { fail(at, `cannot read ${file} (${error.code || error.message})`); }
}
async function manifest(file, at, readBytes) {
  string(file, at);
  const path = resolve(file);
  const raw = await bytes(path, at, readBytes);
  let data;
  try { data = JSON.parse(raw.toString('utf8')); }
  catch (error) { fail(at, `invalid JSON in ${path} (${error.message})`); }
  return { data: object(data, at), dir: dirname(path), sha256: digest(raw), byteLength: raw.byteLength };
}

export async function loadInput({ ledger, brand, assets }, readBytes) {
  const [l, b, a] = await Promise.all([
    manifest(ledger, 'ledger',readBytes), manifest(brand, 'brand',readBytes), manifest(assets, 'assets',readBytes),
  ]);
  const semanticTransport=[SEMANTIC_SCHEMA,'semantic-layout-v2','semantic-layout-v3'].includes(l.data.schemaVersion);
  if(l.data.schemaVersion!==undefined&&!semanticTransport)layoutIssue('SEMANTIC_SCHEMA_UNSUPPORTED',{pointer:'/schemaVersion'},'Unsupported versioned ledger');
  const brandData = b.data;
  string(brandData.name, 'brand.name');
  object(brandData.colors, 'brand.colors');
  for (const key of ['primary', 'accent', 'paper', 'ink', 'muted']) {
    if (!/^#[0-9a-f]{6}$/i.test(brandData.colors[key] || '')) fail(`brand.colors.${key}`, 'expected #RRGGBB');
  }
  if (brandData.minBodySize !== 22) fail('brand.minBodySize', 'must be 22 for this contract');
  object(brandData.font, 'brand.font');
  string(brandData.font.family, 'brand.font.family');
  const fonts = {};
  const fontFiles = [];
  for (const [index, file] of list(brandData.font.files, 'brand.font.files').entries()) {
    const at = `brand.font.files[${index}]`;
    const path = resolve(b.dir, string(file, at));
    const raw = await bytes(path, at,readBytes).catch(error=>{if(semanticTransport)layoutIssue('SEMANTIC_FONT_MISSING',{artifactId:'brand',pointer:`/font/files/${index}`},error.message,{path});throw error;});
    if (!GlobalFonts.register(raw, brandData.font.family)){if(semanticTransport)layoutIssue('SEMANTIC_FONT_RESOURCE',{artifactId:'brand',pointer:`/font/files/${index}`},`Invalid actual font ${path}`);fail(at, `invalid font ${path}`);}
    fonts[path] = digest(raw);
    fontFiles.push(path);
  }
  if(semanticTransport&&a.data.pages!==undefined)layoutIssue('SEMANTIC_UNDECLARED_ASSET_PAGES',{artifactId:'assets',pointer:'/pages'},'Semantic editions take all page intents from the exact manuscript');
  const assetData = object(a.data.assets, 'assets.assets');
  const loadedAssets = {};
  for (const [id, asset] of Object.entries(assetData)) {
    const at = `assets.assets[${JSON.stringify(id)}]`;
    object(asset, at);
    if (!semanticTransport && !/^(case:[\w-]+|art:[ABC]|mockup:[\w-]+)$/.test(id)) fail(at, 'unknown asset identifier');
    const role = semanticTransport ? asset.role : id.split(':')[0];
    if(semanticTransport&&!['art','packaging','reference','mockup'].includes(role))layoutIssue('SEMANTIC_IMAGE_ROLE',{pointer:`/assets/${id}/role`,owner:'visual-lead',imageIds:[id]},'Unknown image role');
    if (asset.role !== role) fail(`${at}.role`, `must be ${role}`);
    if (typeof asset.source === 'string') string(asset.source, `${at}.source`);
    else {
      object(asset.source, `${at}.source`);
      string(asset.source.type, `${at}.source.type`);
      string(asset.source.description || asset.source.url, `${at}.source.description`);
    }
    if (role === 'mockup') {
      string(asset.purpose, `${at}.purpose`);
      object(asset.aperture, `${at}.aperture`);
      for (const key of ['x', 'y', 'w', 'h']) {
        const n = asset.aperture[key];
        if (!Number.isFinite(n) || n < 0 || n > 1 || (['w', 'h'].includes(key) && n === 0)) fail(`${at}.aperture.${key}`, 'must be a valid 0..1 ratio');
      }
      const { x, y, w, h } = asset.aperture;
      if (x + w > 1 || y + h > 1) fail(`${at}.aperture`, 'extends beyond image');
    }
    const file = resolve(a.dir, string(asset.file, `${at}.file`));
    const imageOrigin=l.data.source?.obligations?.find(o=>o.kind==='image'&&o.value.imageId===id)??{artifactId:'assets',pointer:`/assets/${id}/file`,owner:'visual-lead',imageIds:[id]};
    const raw = await bytes(file, `${at}.file`,readBytes).catch(error=>{if(semanticTransport)layoutIssue('SEMANTIC_IMAGE_MISSING',imageOrigin,error.message,{file});throw error;});
    let image;
    try { image = await loadImage(readBytes?raw:file); }
    catch (error) { if(semanticTransport)layoutIssue('SEMANTIC_IMAGE_DECODE',imageOrigin,error.message,{file});fail(`${at}.file`, `cannot decode image ${file} (${error.message})`); }
    if (!(image.width > 0 && image.height > 0)) fail(`${at}.file`, 'image has no dimensions');
    loadedAssets[id] = { ...asset, file, width: image.width, height: image.height, sha256: digest(raw), byteLength: raw.byteLength };
  }
  const resourceInput={brand:{...brandData,font:{...brandData.font,files:fontFiles}},assets:loadedAssets,hashes:{ledger:l.sha256,brand:b.sha256,assets:a.sha256,fonts}};
  if(semanticTransport){
    const semantic=normalizeManuscript(l.data,loadedAssets);
    const text=[brandData.name,semantic.title,...semantic.intents.map(i=>i.centralMessage),...Object.values(semantic.blocksById).map(b=>b.text),...Object.keys(semantic.sourcesById)].join('\n');
    const python=process.env.RUNTIME_PYTHON||'/Users/marc/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3';
    const inspection=await new Promise((resolve,reject)=>{
      const child=execFile(python,[fileURLToPath(new URL('./font-resource-check.py',import.meta.url))],{maxBuffer:4*1024*1024,timeout:30000},(error,stdout)=>{
        if(error)return reject(error);try{resolve(JSON.parse(stdout));}catch(e){reject(e);}
      });child.stdin.end(JSON.stringify({files:fontFiles,family:brandData.font.family,text}));
    }).catch(error=>layoutIssue('SEMANTIC_FONT_INSPECTION',{artifactId:'brand',pointer:'/font'},error.message));
    if(!inspection.passed)layoutIssue('SEMANTIC_FONT_RESOURCE',{artifactId:'brand',pointer:'/font'},'Requested internal family, real regular/bold faces and complete character coverage are required',inspection);
    return {...resourceInput,semantic,cases:{},audience:{findings:[]},fontInspection:inspection};
  }
  const cases = object(l.data.cases, 'ledger.cases');
  for (const [id, entry] of Object.entries(cases)) {
    object(entry, `ledger.cases.${id}`);
    if (entry.id !== id) fail(`ledger.cases.${id}.id`, `must match ${id}`);
    string(entry.title, `ledger.cases.${id}.title`);
    string(entry.source_url, `ledger.cases.${id}.source_url`);
    if (!loadedAssets[`case:${id}`]) fail(`ledger.cases.${id}`, `missing asset case:${id}`);
  }
  const audience = object(l.data.audience, 'ledger.audience');
  if (!Array.isArray(audience.findings)) fail('ledger.audience.findings', 'expected an array');
  const evidence = new Set();
  for (const [index, finding] of audience.findings.entries()) {
    const at = `ledger.audience.findings[${index}]`;
    object(finding, at);
    string(finding.id, `${at}.id`);
    if (evidence.has(finding.id)) fail(`${at}.id`, 'duplicate evidence id');
    for (const field of ['fact', 'url', 'limit']) string(finding[field], `${at}.${field}`);
    evidence.add(finding.id);
  }
  if (a.data.pages !== undefined && !Array.isArray(a.data.pages)) fail('assets.pages', 'expected an array');
  const pages = [...list(l.data.pages, 'ledger.pages'), ...(a.data.pages || [])];
  const pageIds = new Set();
  pages.forEach((page, index) => {
    const at = index < l.data.pages.length ? `ledger.pages[${index}]` : `assets.pages[${index - l.data.pages.length}]`;
    object(page, at);
    if (!Object.hasOwn(pageFields, page.kind)) fail(`${at}.kind`, `unknown page kind ${JSON.stringify(page.kind)}`);
    string(page.title, `${at}.title`);
    for (const field of pageFields[page.kind]) {
      if (['items', 'ids', 'evidence', 'arts'].includes(field)) list(page[field], `${at}.${field}`);
      else string(page[field], `${at}.${field}`);
    }
    for (const field of ['section', 'note', 'sub', 'takeaway']) {
      if (page[field] !== undefined && typeof page[field] !== 'string') fail(`${at}.${field}`, 'expected a string');
    }
    for (const field of ['items', 'ids', 'evidence', 'arts']) {
      if (page[field] !== undefined) list(page[field], `${at}.${field}`);
    }
    if (page.items) page.items.forEach((row, i) => {
      if (!Array.isArray(row) || row.length !== 3) fail(`${at}.items[${i}]`, 'expected exactly three fields: label, heading, detail');
      list(row, `${at}.items[${i}]`).forEach((text, j) => string(text, `${at}.items[${i}][${j}]`));
    });
    for (const id of page.ids || []) {
      string(id, `${at}.ids`);
      if (!Object.hasOwn(cases, id)) fail(`${at}.ids`, `unknown case ${id}`);
    }
    for (const id of page.evidence || []) {
      string(id, `${at}.evidence`);
      if (!evidence.has(id)) fail(`${at}.evidence`, `unknown evidence ${id}`);
    }
    if (page.direction && !['A', 'B', 'C'].includes(page.direction)) fail(`${at}.direction`, 'expected A, B or C');
    if (page.direction && !loadedAssets[`art:${page.direction}`]) fail(`${at}.direction`, `missing art:${page.direction}`);
    const artRefs = page.arts || (page.art ? [page.art] : []);
    if (page.kind === 'visualcomparison' && page.arts.length !== page.items.length) fail(`${at}.arts`, 'must match comparison item count');
    for (const ref of artRefs) {
      string(ref, `${at}.art`);
      const match = Object.entries(loadedAssets).find(([id, asset]) => id.startsWith('art:') && (id === ref || asset.ledgerFile === ref));
      if (!match) fail(`${at}.art`, `unknown artwork ${ref}`);
      if (page.direction && match[0] !== `art:${page.direction}`) fail(`${at}.art`, 'artwork does not match direction');
    }
    if (page.kind === 'application' && loadedAssets[page.mockup]?.role !== 'mockup') fail(`${at}.mockup`, `unknown mockup ${page.mockup}`);
    const id = page.id ?? `page-${String(index + 1).padStart(3, '0')}`;
    string(id, `${at}.id`);
    if (pageIds.has(id)) fail(`${at}.id`, `duplicate page id ${id}`);
    pageIds.add(id);
    pages[index] = { ...page, id };
  });
  return {
    cases, audience, semantic:normalizeLegacy(pages,cases,audience,loadedAssets),
    brand: { ...brandData, font: { ...brandData.font, files: fontFiles } },
    assets: loadedAssets,
    hashes: { ledger: l.sha256, brand: b.sha256, assets: a.sha256, fonts },
  };
}
