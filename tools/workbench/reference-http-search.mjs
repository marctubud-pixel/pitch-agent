import {createHash, randomUUID} from 'node:crypto';
import {mkdir, readFile, writeFile, realpath, lstat, link, unlink} from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import {performance} from 'node:perf_hooks';
import {parseSearchResults, parserPolicy} from './reference-search-parser.mjs';
import {capturePublicSource, isPublicAddress} from './source-acquisition.mjs';

const endpoint = 'https://lite.duckduckgo.com/lite/';
const caps = Object.freeze({timeoutMs: 10000, maxBytes: 1048576, maxResults: 10});
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const refusal = (code, message) => Object.assign(new Error(message), {reasonCode: code});
function destination(href) {
  if (href.length > 4096 || /[\u0000-\u0020\u007f\\]/.test(href)) throw refusal('UNSAFE_RESULT_URL', 'Unsafe result URL characters or length');
  let url = new URL(href, endpoint);
  const isWrapper = value => ['duckduckgo.com', 'www.duckduckgo.com', 'lite.duckduckgo.com'].includes(value.hostname) && value.pathname === '/l/';
  if (isWrapper(url)) {
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.searchParams.getAll('uddg').length !== 1) throw refusal('UNSAFE_RESULT_URL', 'Malformed search redirect wrapper');
    const unwrapped = url.searchParams.get('uddg');
    if (!unwrapped.startsWith('https://') || /[\u0000-\u0020\u007f\\]/.test(unwrapped)) throw refusal('UNSAFE_RESULT_URL', 'Unsafe wrapped result URL');
    url = new URL(unwrapped);
    if (isWrapper(url)) throw refusal('UNSAFE_RESULT_URL', 'Nested search redirect wrapper');
  }
  const host = url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (url.protocol !== 'https:' || url.username || url.password || url.port || host === 'localhost' || /\.(localhost|local|internal|test|invalid|example|home\.arpa)$/.test(host) || (!net.isIP(host) && (!host.includes('.') || host.length > 253 || !host.split('.').every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label)))) || (net.isIP(host) && !isPublicAddress(host)) || host === 'duckduckgo.com' || host.endsWith('.duckduckgo.com')) throw refusal('UNSAFE_RESULT_URL', 'Result must be a public HTTPS destination');
  url.hash = '';
  return url.href;
}

function retainResults(anchors, maxResults) {
  const results = [], rejected = [], seen = new Set();
  for (const [index, anchor] of anchors.entries()) {
    const naturalRank = index + 1;
    try {
      const url = destination(anchor.href);
      if (!seen.has(url)) {
        seen.add(url);
        if (results.length < maxResults) results.push({id: `ref_${hash(url)}`, naturalRank, url, title: anchor.title, destinationVerification: 'not_captured', source: anchor.source});
      }
    } catch (error) {
      if (!(error instanceof TypeError) && error.reasonCode !== 'UNSAFE_RESULT_URL') throw error;
      rejected.push({naturalRank, reason: 'UNSAFE_RESULT_URL'});
    }
  }
  if (!results.length) throw refusal('NO_LITERAL_RESULTS', 'No acceptable literal result-link anchors');
  return {results, rejected};
}

async function saveAttempt(root, receipt) {
  const directory = path.join(root, 'search-attempts');
  await mkdir(directory, {recursive: true});
  if (await realpath(directory) !== directory) throw new Error('Search attempt directory must not contain symlinks');
  const bytes = Buffer.from(JSON.stringify(receipt, null, 2) + '\n');
  const filename = path.join(directory, `${receipt.attemptId}.json`);
  const temporary = path.join(directory, `.${receipt.attemptId}.tmp`);
  await writeFile(temporary, bytes, {flag: 'wx', mode: 0o444});
  try { await link(temporary, filename); } finally { await unlink(temporary); }
  return {receipt, attemptRecord: {path: filename, sha256: hash(bytes), byteLength: bytes.length}};
}

/** SearchDiscoveryReceipt v2 records discovery leads only, with no factual or use approval. */
export async function searchPublicReferences({query, storeRoot, limits: overrides = {}}, dependencies = {}) {
  const requestedRoot = path.resolve(storeRoot);
  await mkdir(requestedRoot, {recursive: true});
  if ((await lstat(requestedRoot)).isSymbolicLink() || await realpath(requestedRoot) !== requestedRoot) throw new Error('Search store root must not contain symlinks');
  const receipt = {
    type: 'SearchDiscoveryReceipt', schemaVersion: 2, parserPolicy: {...parserPolicy}, attemptId: randomUUID(), transport: 'experimental_public_http',
    startedAt: new Date().toISOString(), endedAt: null, query: typeof query === 'string' && query.length <= 256 ? query : null,
    queryUrl: null, limits: {...caps, maxQueryChars: 256, maxQueryBytes: 1024, maxRequestUrlBytes: 4096, maxResultAnchors: 50, maxAnchorChars: 8192, maxTitleChars: 1024, maxRedirects: 0}, outcome: 'unavailable', reason: null, capture: null, results: [], rejected: [],
    discoveryOnly: true,
  };
  try {
    if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides) || Object.keys(overrides).some(key => !Object.hasOwn(caps, key))) throw refusal('INVALID_INPUT', 'Unknown search limit');
    for (const [key, value] of Object.entries(overrides)) {
      if (!Number.isSafeInteger(value) || value < 1 || value > caps[key]) throw refusal('INVALID_INPUT', `Invalid search limit ${key}`);
      receipt.limits[key] = value;
    }
    if (typeof query !== 'string' || !query.trim() || query !== query.trim() || query.length > 256 || Buffer.byteLength(query) > 1024 || /[\u0000-\u001f\u007f]/.test(query)) throw refusal('INVALID_INPUT', 'Search query must be 1 to 256 trimmed characters without controls');
    try { receipt.queryUrl = `${endpoint}?q=${encodeURIComponent(query)}`; }
    catch { throw refusal('INVALID_INPUT', 'Search query contains malformed Unicode'); }
    const deadline = performance.now() + receipt.limits.timeoutMs;
    const remaining = () => {
      const ms = Math.floor(deadline - performance.now());
      if (ms <= 0) throw refusal('WORKER_TIMEOUT', 'Search acquisition and parser deadline exhausted');
      return ms;
    };
    const captured = await capturePublicSource({url: receipt.queryUrl, storeRoot: requestedRoot, limits: {timeoutMs: remaining(), maxBytes: receipt.limits.maxBytes, maxRedirects: 0}}, dependencies);
    const {record, recordHash, recordPath} = captured;
    receipt.capture = {recordSha256: recordHash, recordPath, requestedUrl: record.requestedUrl, finalUrl: record.finalUrl, responseOrigin: new URL(record.finalUrl).origin, httpStatus: record.httpStatus, mimeType: record.mimeType, retrievedAt: record.retrievedAt, raw: {...record.raw}};
    if (record.httpStatus !== 200) throw refusal('HTTP_STATUS', `Search response HTTP ${record.httpStatus}`);
    if (record.mimeType !== 'text/html') throw refusal('NON_HTML', 'Search response must be text/html');
    if (!['utf-8', 'utf8'].includes(record.extraction.charset?.toLowerCase())) throw refusal('UNSUPPORTED_ENCODING', 'Search response must use UTF-8');
    remaining();
    const bytes = await readFile(path.join(requestedRoot, record.raw.file));
    if (bytes.length !== record.raw.byteLength || hash(bytes) !== record.raw.sha256) throw refusal('CAPTURE_MISMATCH', 'Saved search bytes do not match capture');
    remaining();
    const anchors = await parseSearchResults(bytes, {deadline});
    remaining();
    const parsed = retainResults(anchors, receipt.limits.maxResults);
    receipt.results = parsed.results.map(result => ({...result, source: {...result.source, rawSha256: record.raw.sha256, captureRecordSha256: recordHash}}));
    receipt.rejected = parsed.rejected;
    receipt.outcome = 'available';
  } catch (error) {
    receipt.reason = {code: error.reasonCode ?? 'CAPTURE_FAILED', message: error.reasonCode ? error.message : 'Public search capture failed', error: {name: String(error.name ?? 'Error').slice(0, 80), code: typeof error.code === 'string' ? error.code.slice(0, 80) : null, message: String(error.message ?? error).replace(/https?:\/\/[^\s]+/g, '[url]').replace(/(?:bearer|token|password|api[-_]?key)\s*[:=]\s*\S+/gi, '[redacted]').slice(0, 512)}};
    receipt.results = [];
  }
  receipt.endedAt = new Date().toISOString();
  return saveAttempt(requestedRoot, receipt);
}

export const acquisitionSearchParserPolicy=Object.freeze({...parserPolicy,windowBehavior:'first-50-literal-anchors'});
export function parseAcquisitionSearchOriginal(bytes){return parseSearchResults(bytes,{deadline:performance.now()+parserPolicy.maxWorkerMs+100,acquisitionWindow:true});}
