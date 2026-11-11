import {Worker} from 'node:worker_threads';
import {performance} from 'node:perf_hooks';

export const parserPolicy = Object.freeze({id: 'parse5-8.0.1-strict-literal-v1', maxWorkerMs: 1000, acquisitionDeadlineMs: 10000, maxOldGenerationSizeMb: 128, stackSizeMb: 4, maxNodes: 100000, maxDepth: 256, maxParseErrors: 100, maxResultAnchors: 50, maxAnchorChars: 8192, maxTitleChars: 1024, maxBytes: 1048576});
const reasons = new Set(['MALFORMED_HTML', 'NO_LITERAL_RESULTS', 'RESULT_LIMIT', 'STRUCTURE_LIMIT', 'PARSE_ERROR_LIMIT', 'CHALLENGE', 'WORKER_TIMEOUT', 'WORKER_FAILURE']);
const failure = code => Object.assign(new Error(`Search parser refused response (${code})`), {reasonCode: code});
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).sort().join(',') === keys.slice().sort().join(',');

function validate(reply, bytes, acquisitionWindow) {
  if (exact(reply, ['type', 'code']) && reply.type === 'refused' && reasons.has(reply.code)) throw failure(reply.code);
  if (!exact(reply, acquisitionWindow ? ['type','anchors','window'] : ['type', 'anchors']) || reply.type !== 'parsed' || !Array.isArray(reply.anchors) || !reply.anchors.length || reply.anchors.length > 50) throw failure('WORKER_FAILURE');
  const html = new TextDecoder('utf-8', {fatal: true, ignoreBOM: true}).decode(bytes);
  const starts = new Set();
  for (const a of reply.anchors) {
    if (!exact(a, ['href', 'title', 'source']) || typeof a.href !== 'string' || a.href.length > 8192 || typeof a.title !== 'string' || !a.title.length || a.title.length > 1024 || !exact(a.source, ['kind', 'start', 'end', 'quote'])) throw failure('WORKER_FAILURE');
    const s = a.source;
    if (s.kind !== 'html_utf16' || !Number.isSafeInteger(s.start) || !Number.isSafeInteger(s.end) || s.start < 0 || s.end <= s.start || s.end > html.length || s.end - s.start > 8192 || typeof s.quote !== 'string' || s.quote !== html.slice(s.start, s.end) || starts.has(s.start)) throw failure('WORKER_FAILURE');
    starts.add(s.start);
  }
  reply.anchors.sort((a, b) => a.source.start - b.source.start);
  for (let i = 1; i < reply.anchors.length; i++) if (reply.anchors[i].source.start < reply.anchors[i - 1].source.end) throw failure('WORKER_FAILURE');
  if (acquisitionWindow) { const w = reply.window; if (!exact(w, ['considered','unexamined','maxItems']) || w.considered !== reply.anchors.length || w.maxItems !== 50 || ![0,'Unknown beyond first 50 literal anchors'].includes(w.unexamined)) throw failure('WORKER_FAILURE'); return {anchors:reply.anchors, window:w}; }
  return reply.anchors;
}

export async function parseSearchResults(bytes, {deadline, acquisitionWindow = false}) {
  const started = performance.now();
  const budget = Math.min(parserPolicy.maxWorkerMs, deadline - performance.now());
  if (budget <= 0) throw failure('WORKER_TIMEOUT');
  let worker;
  let timer;
  let reply;
  try {
    worker = new Worker(new URL('./reference-search-parser-worker.mjs', import.meta.url), {execArgv: [], resourceLimits: {maxOldGenerationSizeMb: parserPolicy.maxOldGenerationSizeMb, stackSizeMb: parserPolicy.stackSizeMb}});
    await new Promise((resolve, reject) => {
      let received = false;
      timer = setTimeout(() => reject(failure('WORKER_TIMEOUT')), Math.max(0, started + budget - performance.now()));
      worker.on('message', message => {
        if (received) { reject(failure('WORKER_FAILURE')); return; }
        received = true;
        reply = message;
      });
      worker.once('error', () => reject(failure('WORKER_FAILURE')));
      worker.once('exit', code => {
        if (performance.now() >= deadline || performance.now() >= started + budget) reject(failure('WORKER_TIMEOUT'));
        else if (code !== 0 || !received) reject(failure('WORKER_FAILURE'));
        else resolve();
      });
      worker.postMessage({type: acquisitionWindow ? 'parse-acquisition' : 'parse', bytes});
    });
    const anchors = validate(reply, bytes, acquisitionWindow);
    if (performance.now() >= started + budget) throw failure('WORKER_TIMEOUT');
    return anchors;
  } catch (error) {
    throw reasons.has(error.reasonCode) ? error : failure('WORKER_FAILURE');
  } finally {
    clearTimeout(timer);
    if (worker) await worker.terminate();
  }
}
