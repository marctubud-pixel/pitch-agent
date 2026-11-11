import {declaredArticleImages} from './script-image-declarations.mjs';
import https from 'node:https';
import dns from 'node:dns/promises';
import net from 'node:net';
import { createHash } from 'node:crypto';
import { mkdir, writeFile, readFile, lstat, realpath } from 'node:fs/promises';
import path from 'node:path';

const sha256 = value => createHash('sha256').update(value).digest('hex');
const defaults = { timeoutMs: 20000, maxBytes: 12 * 1024 * 1024, maxRedirects: 5 };
const privateV4 = new net.BlockList();
for (const [address, prefix] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4]]) privateV4.addSubnet(address, prefix);
const reservedV6 = new net.BlockList();
for (const [address, prefix] of [['2001::', 23], ['2001:db8::', 32], ['2002::', 16], ['3fff::', 20]]) reservedV6.addSubnet(address, prefix, 'ipv6');
const globalV6 = new net.BlockList();
globalV6.addSubnet('2000::', 3, 'ipv6');

export function isPublicAddress(address) {
  const family = net.isIP(address);
  return family === 4 ? !privateV4.check(address) : family === 6 && globalV6.check(address, 'ipv6') && !reservedV6.check(address, 'ipv6');
}

function publicUrl(value, base) {
  const url = new URL(value, base);
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) throw new Error('Only public HTTPS URLs without credentials on port 443 are supported');
  url.hash = '';
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || (!host.includes('.') && !net.isIP(host))) throw new Error('Local hostnames are forbidden');
  if (net.isIP(host) && !isPublicAddress(host)) throw new Error('Non-public address is forbidden');
  return url;
}

export function httpsTransport({ url, address, family, signal, maxBytes }) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, {
      signal, agent: false,
      headers: { 'user-agent': 'ProposalWorkbenchSourceCapture/1.0', accept: 'text/html,application/pdf,image/*;q=0.8', 'accept-encoding': 'identity' },
      lookup: (_hostname, options, callback) => callback(null, options?.all ? [{ address, family }] : address, family),
    }, response => {
      const chunks = [];
      let size = 0;
      response.on('data', chunk => {
        size += chunk.length;
        if (size > maxBytes) { response.destroy(new Error('Response exceeds byte limit')); return; }
        chunks.push(chunk);
      });
      response.on('error', reject);
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks) }));
    });
    request.on('error', reject);
  });
}

function decodeEntities(text) {
  const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  return text.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (match, value) => {
    if (!value.startsWith('#')) return named[value.toLowerCase()] ?? match;
    const number = value[1].toLowerCase() === 'x' ? parseInt(value.slice(2), 16) : Number(value.slice(1));
    return number > 0 && number <= 0x10ffff && !(number >= 0xd800 && number <= 0xdfff) ? String.fromCodePoint(number) : '\ufffd';
  });
}

function* htmlTokens(html) {
  let index = 0;
  while (index < html.length) {
    const start = index;
    if (html[index] !== '<') {
      const next = html.indexOf('<', index);
      index = next < 0 ? html.length : next;
    } else if (html.startsWith('<!--', index)) {
      const next = html.indexOf('-->', index + 4);
      index = next < 0 ? html.length : next + 3;
    } else if (/^<\/?[a-z!]/i.test(html.slice(index, index + 4))) {
      let quote = null;
      index += 1;
      while (index < html.length) {
        const character = html[index++];
        if (quote) { if (character === quote) quote = null; }
        else if (character === '"' || character === "'") quote = character;
        else if (character === '>') break;
      }
    } else index += 1;
    yield { 0: html.slice(start, index), index: start };
  }
}

function imageAttributes(raw, index) {
  const attributes = Object.create(null);
  while (index < raw.length) {
    if (!/[\w:-]/.test(raw[index])) { index += 1; continue; }
    const nameStart = index;
    while (index < raw.length && /[\w:-]/.test(raw[index])) index += 1;
    const name = raw.slice(nameStart, index).toLowerCase();
    while (index < raw.length && /\s/.test(raw[index])) index += 1;
    if (raw[index] !== '=') continue;
    index += 1;
    while (index < raw.length && /\s/.test(raw[index])) index += 1;
    const quote = raw[index] === '"' || raw[index] === "'" ? raw[index++] : null;
    const valueStart = index;
    while (index < raw.length && (quote ? raw[index] !== quote : !/[\s>]/.test(raw[index]))) index += 1;
    attributes[name] ??= decodeEntities(raw.slice(valueStart, index));
    if (quote && raw[index] === quote) index += 1;
  }
  return attributes;
}

// Conservative static token extraction. It does not render DOM, CSS, or JavaScript.
export function extractHtml(html, baseUrl) {
  const text = [];
  const images = [];
  let suppressed = null;
  let templateDepth = 0;
  let title = '';
  let inTitle = false;
  let figure = null;
  let inCaption = false;
  const tokens = htmlTokens(html);
  for (const token of tokens) {
    const raw = token[0];
    const tag = /^<(\/)?([a-z][\w:-]*)\b/i.exec(raw);
    if (tag) {
      const closing = Boolean(tag[1]);
      const name = tag[2].toLowerCase();
      if (suppressed) { if (closing && name === suppressed) suppressed = null; continue; }
      if (['script', 'style', 'noscript'].includes(name) && !closing) { suppressed = name; continue; }
      if (name === 'template') { templateDepth = Math.max(0, templateDepth + (closing ? -1 : 1)); continue; }
      if (templateDepth) continue;
      if (name === 'title') inTitle = !closing;
      if (name === 'figure') {
        if (closing && figure) { for (const index of figure.images) images[index].caption = figure.caption.trim(); figure = null; }
        else if (!closing) figure = { images: [], caption: '' };
      }
      if (name === 'figcaption') inCaption = !closing;
      if (name === 'img' && !closing) {
        const attributes = imageAttributes(raw, tag[0].length);
        const src = attributes.src || attributes['data-src'];
        if (src) {
          try {
            const url = publicUrl(src, baseUrl).href;
            images.push({ url, alt: attributes.alt || '', caption: '', locator: { kind: 'html_utf16', start: token.index, end: token.index + raw.length } });
            figure?.images.push(images.length - 1);
          } catch { /* Non-public image references are not acquisition candidates. */ }
        }
      }
      if (['p', 'div', 'br', 'li', 'h1', 'h2', 'h3', 'section', 'article', 'figcaption', 'title'].includes(name)) text.push('\n');
      continue;
    }
    if (raw.startsWith('<') || suppressed || templateDepth) continue;
    const decoded = decodeEntities(raw).replace(/\s+/g, ' ');
    text.push(decoded);
    if (inTitle) title += decoded;
    if (figure && inCaption) figure.caption += decoded;
  }
  let declared = [];
  try {
    declared = declaredArticleImages(html, baseUrl).map(image => ({url: publicUrl(image.value, baseUrl).href, alt: '', caption: '', locator: image.locator, discovery: image.discovery}));
  } catch { declared = []; }
  images.push(...declared);
  return { method: declared.length ? 'static-html-tokenizer-v2' : 'static-html-tokenizer-v1', title: title.trim(), text: text.join('').replace(/[ \t]+\n/g, '\n').replace(/\n[ \t]+/g, '\n').replace(/\n{3,}/g, '\n\n').trim(), images };
}

async function immutableWrite(root, relative, bytes) {
  const directory = path.join(root, path.dirname(relative));
  await mkdir(directory, { recursive: true });
  if ((await realpath(directory)) !== directory) throw new Error('Capture directory must not contain symlinks');
  const filename = path.join(root, relative);
  try { await writeFile(filename, bytes, { flag: 'wx', mode: 0o444 }); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    if (!(await lstat(filename)).isFile() || !(await readFile(filename)).equals(Buffer.from(bytes))) throw new Error('Immutable capture collision or unsafe path');
  }
  return filename;
}

export async function capturePublicSource({ url: requestedUrl, storeRoot, limits: overrides = {} }, dependencies = {}) {
  const limits = { ...defaults, ...overrides };
  for (const key of Object.keys(defaults)) if (!Number.isSafeInteger(limits[key]) || limits[key] < (key === 'maxRedirects' ? 0 : 1) || limits[key] > defaults[key] * 5 + 1) throw new Error(`Invalid acquisition limit ${key}`);
  const lookup = dependencies.lookup ?? (hostname => dns.lookup(hostname, { all: true, verbatim: true }));
  const transport = dependencies.transport ?? httpsTransport;
  const signal = AbortSignal.timeout(limits.timeoutMs);
  const bounded = async operation => {
    let onAbort;
    try {
      return await Promise.race([operation, new Promise((_, reject) => {
        onAbort = () => reject(new Error('Acquisition timed out'));
        if (signal.aborted) onAbort();
        else signal.addEventListener('abort', onAbort, { once: true });
      })]);
    } finally { signal.removeEventListener('abort', onAbort); }
  };
  let current = publicUrl(requestedUrl);
  const redirects = [];
  let response;
  for (;;) {
    const hostname = current.hostname.replace(/^\[|\]$/g, '');
    const addresses = net.isIP(hostname) ? [{ address: hostname, family: net.isIP(hostname) }] : await bounded(lookup(hostname));
    if (!addresses.length || addresses.some(item => !isPublicAddress(item.address))) throw new Error('DNS must resolve exclusively to public addresses');
    const target = addresses[0];
    response = await bounded(transport({ url: current, ...target, signal, maxBytes: limits.maxBytes }));
    if (!Number.isInteger(response.status) || response.status < 100 || response.status > 599) throw new Error('Invalid HTTP status');
    if (!Buffer.isBuffer(response.body) || response.body.length > limits.maxBytes) throw new Error('Response exceeds byte limit or is not bytes');
    if (![301, 302, 303, 307, 308].includes(response.status)) break;
    if (redirects.length >= limits.maxRedirects) throw new Error('Redirect limit exceeded');
    if (typeof response.headers.location !== 'string' || !response.headers.location.trim()) throw new Error('Redirect location is missing');
    const next = publicUrl(response.headers.location, current);
    redirects.push({ url: current.href, status: response.status, location: next.href });
    current = next;
  }
  const retrievedAt = (dependencies.now?.() ?? new Date()).toISOString();
  const mimeType = String(response.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  if (response.headers['content-encoding'] && response.headers['content-encoding'] !== 'identity') throw new Error('Encoded responses are not supported');
  const requestedRoot = path.resolve(storeRoot);
  await mkdir(requestedRoot, { recursive: true });
  if ((await lstat(requestedRoot)).isSymbolicLink()) throw new Error('Capture root must not be a symlink');
  const root = await realpath(requestedRoot);
  const rawHash = sha256(response.body);
  const rawFile = `raw/${rawHash}.bin`;
  await immutableWrite(root, rawFile, response.body);
  let extraction = { method: 'none', reason: 'Unsupported MIME or unsuccessful HTTP response', text: '', images: [] };
  if (response.status >= 200 && response.status < 300) {
    if (mimeType === 'text/html' || mimeType === 'application/xhtml+xml') {
      const charset = /charset\s*=\s*["']?([^;\s"']+)/i.exec(response.headers['content-type'] || '')?.[1] || 'utf-8';
      const html = new TextDecoder(charset, { fatal: false }).decode(response.body);
      extraction = { ...extractHtml(html, current.href), charset };
    } else if (mimeType === 'application/pdf') {
      extraction = { method: 'none', reason: 'PDF raw capture only; no extractor was run', text: '', images: [] };
      if (dependencies.pdfExtractor) {
        const result = await bounded(dependencies.pdfExtractor(Buffer.from(response.body), { url: current.href, signal }));
        if (typeof result?.text !== 'string' || typeof result?.method !== 'string' || !result.method.trim() || result.method === 'none') throw new Error('PDF extractor must identify its method and text');
        extraction = { method: result.method, text: result.text, images: [], locators: result.locators ?? [] };
      }
    } else if (mimeType.startsWith('image/')) extraction = { method: 'none', reason: 'Image bytes captured; no visual interpretation', text: '', images: [] };
  }
  extraction.textHash = sha256(extraction.text);
  extraction.locator = { kind: 'extracted_text_utf16', start: 0, end: extraction.text.length };
  const record = { schemaVersion: 1, requestedUrl: String(requestedUrl), normalizedRequestedUrl: publicUrl(requestedUrl).href, finalUrl: current.href, redirects, retrievedAt, httpStatus: response.status, mimeType, raw: { sha256: rawHash, file: rawFile, byteLength: response.body.length }, extraction, limits };
  const recordBytes = Buffer.from(JSON.stringify(record, null, 2) + '\n');
  const recordHash = sha256(recordBytes);
  const recordPath = await immutableWrite(root, `captures/${recordHash}.json`, recordBytes);
  return { record, recordHash, recordPath };
}
