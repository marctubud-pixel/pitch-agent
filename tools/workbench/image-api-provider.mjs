import {createHash, randomUUID} from 'node:crypto';
import {openSync, fstatSync, readSync, closeSync, constants} from 'node:fs';
import {mkdir, open, realpath, lstat, link, unlink} from 'node:fs/promises';
import {resolve, join, dirname} from 'node:path';
import http from 'node:http';
import https from 'node:https';
import {isDeepStrictEqual} from 'node:util';
import {inspectImage, IMAGE_LIMITS} from './image-evidence.mjs';

const ADAPTER = 'openai-images-v1';
const VERSION = 'image-http-v1';
const MAX = Object.freeze({timeoutMs: 300000, maxInputImages: 4, maxRequestBytes: 34 * 1024 * 1024, maxResponseBytes: 12 * 1024 * 1024});
const sha = value => createHash('sha256').update(value).digest('hex');
const id = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(value);
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const fail = code => { throw new Error(code); };
function fields(value, allowed) {
  if (!object(value) || Object.keys(value).some(key => !allowed.includes(key))) fail('INVALID_SHAPE');
}
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (object(value)) return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  return value;
}
const serialize = value => JSON.stringify(stable(value));
function secretScanner(secret) {
  const representations = new Set();
  if (secret) {
    const bytes = Buffer.from(secret);
    const hex = bytes.toString('hex');
    for (const value of [secret, bytes.toString('base64'), bytes.toString('base64url'), hex, hex.toUpperCase(), encodeURIComponent(secret), [...bytes].map(byte => `%${byte.toString(16).padStart(2, '0')}`).join('')]) {
      representations.add(value);
    }
    representations.add([...bytes].map(byte => `%${byte.toString(16).padStart(2, '0').toUpperCase()}`).join(''));
    representations.add([...secret].map(char => `\\x${char.charCodeAt(0).toString(16).padStart(2, '0')}`).join(''));
    let unicode = secret;
    for (let depth = 0; depth < 2; depth++) {
      unicode = [...unicode].map(char => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`).join('');
      representations.add(unicode);
      representations.add(unicode.replace(/[a-f]/g, char => char.toUpperCase()));
    }
    for (const value of [...representations]) {
      let escaped = value;
      for (let depth = 0; depth < 2; depth++) {
        escaped = JSON.stringify(escaped).slice(1, -1);
        representations.add(escaped);
      }
    }
  }
  const needles = [...representations].map(value => Buffer.from(value));
  return value => {
    const bytes = Buffer.isBuffer(value) ? value : Buffer.from(typeof value === 'string' ? value : JSON.stringify(value));
    return needles.some(needle => bytes.includes(needle)) || /authorization\s*[:=]/i.test(bytes.toString('utf8'));
  };
}
function parseConfig(raw, allowLoopbackHttp) {
  fields(raw, ['providerId', 'adapter', 'baseUrl', 'model', 'credentialEnv', 'operations', 'supportedOptions', ...Object.keys(MAX)]);
  if (!id(raw.providerId) || raw.adapter !== ADAPTER || typeof raw.model !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,199}$/.test(raw.model) || typeof raw.credentialEnv !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]{0,99}$/.test(raw.credentialEnv)) fail('INVALID_CONFIG');
  if (typeof raw.baseUrl !== 'string' || raw.baseUrl.length > 2000 || /%|\\|\/\.\.?([/]|$)/.test(raw.baseUrl)) fail('INVALID_CONFIG');
  const url = new URL(raw.baseUrl);
  const local = allowLoopbackHttp && url.protocol === 'http:' && ['127.0.0.1', '[::1]'].includes(url.hostname);
  if ((!local && url.protocol !== 'https:') || url.username || url.password || url.search || url.hash) fail('INVALID_CONFIG');
  fields(raw.operations, ['generate', 'edit']);
  if (typeof raw.operations.generate !== 'boolean' || typeof raw.operations.edit !== 'boolean' || !Object.values(raw.operations).some(Boolean)) fail('INVALID_CONFIG');
  fields(raw.supportedOptions, ['generate', 'edit']);
  for (const kind of ['generate', 'edit']) {
    fields(raw.supportedOptions[kind], ['size', 'quality', 'background', 'output_format', 'response_format']);
    for (const [key, values] of Object.entries(raw.supportedOptions[kind])) {
      if (!Array.isArray(values) || !values.length || values.length > 30 || values.some(value => typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(value))) fail('INVALID_CONFIG');
      if (key === 'output_format' && values.some(value => !['png', 'jpeg'].includes(value))) fail('INVALID_CONFIG');
      if (key === 'response_format' && values.some(value => value !== 'b64_json')) fail('INVALID_CONFIG');
    }
  }
  const limits = {};
  for (const [key, maximum] of Object.entries(MAX)) {
    const value = raw[key] ?? maximum;
    if (!Number.isSafeInteger(value) || value < 1 || value > maximum) fail('INVALID_CONFIG');
    limits[key] = value;
  }
  return {...structuredClone(raw), baseUrl: url.href.replace(/\/$/, ''), ...limits};
}
function requestRecord(task) {
  fields(task, ['protocol', 'projectId', 'jobId', 'candidateId', 'attemptId', 'binding', 'operation']);
  if (task.protocol !== 'image-candidate-v1' || !['projectId', 'jobId', 'candidateId', 'attemptId'].every(key => id(task[key]))) fail('INVALID_REQUEST');
  fields(task.binding, ['providerId', 'adapter', 'model', 'configHash', 'adapterVersion']);
  if (!id(task.binding.providerId) || task.binding.adapter !== ADAPTER || task.binding.adapterVersion !== VERSION || !digest(task.binding.configHash) || typeof task.binding.model !== 'string') fail('INVALID_BINDING');
  fields(task.operation, ['kind', 'prompt', 'options', 'images']);
  const operation = task.operation;
  if (!['generate', 'edit'].includes(operation.kind) || typeof operation.prompt !== 'string' || !operation.prompt.trim() || operation.prompt.length > 32000 || !object(operation.options)) fail('INVALID_OPERATION');
  if (operation.kind === 'generate' && operation.images !== undefined) fail('INVALID_REFERENCES');
  if (operation.kind === 'edit') {
    if (!Array.isArray(operation.images) || !operation.images.length || operation.images.length > 4) fail('INVALID_REFERENCES');
    for (const input of operation.images) {
      fields(input, ['imageId', 'sha256']);
      if (!id(input.imageId) || !digest(input.sha256)) fail('INVALID_REFERENCES');
    }
    if (new Set(operation.images.map(input => input.imageId)).size !== operation.images.length) fail('INVALID_REFERENCES');
  }
  return structuredClone(task);
}
function encodeRequest(request, inputs) {
  const values = {model: request.binding.model, prompt: request.operation.prompt, n: 1, ...request.operation.options};
  if (request.operation.kind === 'generate') return {body: Buffer.from(JSON.stringify(values)), contentType: 'application/json'};
  const boundary = `workbench-${randomUUID()}`;
  const chunks = [];
  for (const [key, value] of Object.entries(values)) chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`));
  for (const [index, input] of inputs.entries()) {
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="image[]"; filename="image-${index + 1}.${input.mediaType === 'image/png' ? 'png' : 'jpg'}"\r\nContent-Type: ${input.mediaType}\r\n\r\n`), input.bytes, Buffer.from('\r\n'));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return {body: Buffer.concat(chunks), contentType: `multipart/form-data; boundary=${boundary}`};
}
function post(url, encoded, secret, config, signal) {
  return new Promise((resolveResult, reject) => {
    let done = false;
    let req;
    const finish = (error, value) => {
      if (done) return;
      done = true; clearTimeout(timer); signal?.removeEventListener('abort', abort);
      if (error) { req?.destroy(); reject(error); } else resolveResult(value);
    };
    const abort = () => finish(new Error('ABORTED'));
    const timer = setTimeout(() => finish(new Error('DEADLINE_EXCEEDED')), config.timeoutMs);
    signal?.addEventListener('abort', abort, {once: true});
    if (signal?.aborted) return abort();
    req = (url.protocol === 'https:' ? https : http).request(url, {method: 'POST', agent: false, headers: {'Content-Type': encoded.contentType, 'Content-Length': encoded.body.length, Authorization: `Bearer ${secret}`, 'Accept-Encoding': 'identity'}}, res => {
      const status = res.statusCode;
      if (status < 200 || status >= 300) {
        finish(null, {status, body: null, requestId: res.headers['x-request-id']}); res.destroy(); return;
      }
      if ((res.headers['content-encoding'] && res.headers['content-encoding'] !== 'identity') || !/^application\/json(?:\s*;|$)/i.test(res.headers['content-type'] ?? '')) { finish(new Error('INVALID_RESPONSE_HEADERS')); res.destroy(); return; }
      const chunks = []; let total = 0;
      res.on('data', chunk => {
        total += chunk.length;
        if (total > config.maxResponseBytes) { finish(new Error('RESPONSE_TOO_LARGE')); res.destroy(); return; }
        chunks.push(chunk);
      });
      res.on('error', () => finish(new Error('TRANSPORT_INTERRUPTED')));
      res.on('aborted', () => finish(new Error('TRANSPORT_INTERRUPTED')));
      res.on('end', () => finish(null, {status, body: Buffer.concat(chunks), requestId: res.headers['x-request-id']}));
    });
    req.on('error', () => finish(new Error('TRANSPORT_INTERRUPTED')));
    req.end(encoded.body);
  });
}
async function decodeResponse(body, scan, pythonBinary) {
  const raw = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(body));
  if (!object(raw) || !Array.isArray(raw.data) || raw.data.length !== 1 || !object(raw.data[0])) fail('INVALID_OUTPUT');
  const b64 = raw.data[0].b64_json;
  if (typeof b64 !== 'string' || !b64.length || b64.length > 4 * Math.ceil(IMAGE_LIMITS.bytes / 3) || !/^[A-Za-z0-9+/]*={0,2}$/.test(b64)) fail('INVALID_OUTPUT');
  const bytes = Buffer.from(b64, 'base64');
  if (bytes.toString('base64') !== b64) fail('INVALID_OUTPUT');
  const safeString = value => value == null ? null : typeof value === 'string' && /^[A-Za-z0-9_.:/-]{1,200}$/.test(value) ? value : fail('INVALID_OUTPUT');
  const safeCount = value => value === null || (Number.isSafeInteger(value) && value >= 0) ? value : fail('INVALID_OUTPUT');
  let usage = null;
  if (raw.usage != null) {
    if (!object(raw.usage)) fail('INVALID_OUTPUT');
    usage = {};
    for (const key of ['input_tokens', 'output_tokens', 'total_tokens']) {
      if (raw.usage[key] !== undefined) usage[key] = safeCount(raw.usage[key]);
    }
    for (const key of ['input_tokens_details', 'output_tokens_details']) {
      const details = raw.usage[key];
      if (details === undefined) continue;
      if (details === null) { usage[key] = null; continue; }
      if (!object(details)) fail('INVALID_OUTPUT');
      const extracted = {};
      for (const token of ['image_tokens', 'text_tokens']) {
        if (details[token] !== undefined) extracted[token] = safeCount(details[token]);
      }
      usage[key] = Object.keys(extracted).length ? extracted : null;
    }
  }
  const safe = {data: [{b64_json: b64}], model: safeString(raw.model), id: safeString(raw.id), usage};
  if (scan(bytes) || scan(safe)) fail('SECRET_ECHO_REJECTED');
  const dimensions = await inspectImage(bytes, {pythonBinary});
  const rawResponseRetained = false;
  const retained = Buffer.from(JSON.stringify({data: safe.data, ...(safe.model === null ? {} : {model: safe.model}), ...(safe.id === null ? {} : {id: safe.id}), ...(safe.usage === null ? {} : {usage: safe.usage})}));
  return {bytes, retained, rawResponseRetained, generated: {sha256: sha(bytes), byteLength: bytes.length, ...dimensions}, reportedModel: safe.model, providerRequestId: safe.id, usage};
}
async function privateDirectory(path) {
  await mkdir(path, {recursive: true, mode: 0o700});
  const stat = await lstat(path);
  if (!stat.isDirectory() || await realpath(path) !== path || (stat.mode & 0o077)) fail('UNSAFE_EVIDENCE_DIRECTORY');
}
async function protectedWrite(path, bytes) {
  const temp = join(dirname(path), `.writing-${randomUUID()}`);
  const handle = await open(temp, 'wx', 0o400);
  try {
    await handle.writeFile(bytes); await handle.sync();
    await link(temp, path);
  } finally { await handle.close(); await unlink(temp); }
}
async function protectedRead(path, limit) {
  if (await realpath(dirname(path)) !== dirname(path)) fail('INVALID_EVIDENCE');
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size < 1 || stat.size > limit || (stat.mode & 0o377)) fail('INVALID_EVIDENCE');
    const bytes = Buffer.alloc(stat.size + 1);
    const {bytesRead} = await handle.read(bytes, 0, bytes.length, 0);
    if (bytesRead !== stat.size) fail('INVALID_EVIDENCE');
    return bytes.subarray(0, bytesRead);
  } finally { await handle.close(); }
}
const attemptPath = (evidenceDir, request) => join(resolve(evidenceDir), sha(serialize([request.projectId, request.attemptId])));
async function persistEvidence(evidenceDir, request, receipt, decoded) {
  const root = resolve(evidenceDir); await privateDirectory(root);
  const directory = attemptPath(root, request); await privateDirectory(directory);
  const files = {'request.json': Buffer.from(serialize(request)), 'response.json': decoded.retained, 'image.bin': decoded.bytes, 'receipt.json': Buffer.from(serialize(receipt))};
  for (const [name, bytes] of Object.entries(files)) await protectedWrite(join(directory, name), bytes);
  const manifest = Buffer.from(serialize({protocol: VERSION, files: Object.fromEntries(Object.entries(files).map(([name, bytes]) => [name, {sha256: sha(bytes), byteLength: bytes.length}]))}));
  await protectedWrite(join(directory, 'manifest.json'), manifest);
  const handle = await open(directory, 'r'); try { await handle.sync(); } finally { await handle.close(); }
  return {sha256: sha(manifest), protocol: VERSION};
}

export function loadImageProvider({configPath, resolveCredential = name => process.env[name], config: injectedConfig, allowLoopbackHttp = false, pythonBinary = 'python3'} = {}) {
  let config = null, binding = null, reason = 'NOT_CONFIGURED';
  function currentCredential() {
    if (!config) return {secret: null, diagnostic: reason};
    try {
      const secret = resolveCredential(config.credentialEnv);
      if (typeof secret !== 'string' || !secret.length || secret.length > 4096 || /[^\x21-\x7e]/.test(secret)) return {secret: null, diagnostic: 'CREDENTIAL_UNAVAILABLE'};
      if (secretScanner(secret)(config)) return {secret: null, diagnostic: 'INVALID_CONFIG'};
      return {secret, diagnostic: null};
    } catch { return {secret: null, diagnostic: 'CREDENTIAL_UNAVAILABLE'}; }
  }
  try {
    let raw = injectedConfig;
    if (raw === undefined && configPath) {
      const handle = openSync(configPath, constants.O_RDONLY | constants.O_NONBLOCK);
      try {
        const stat = fstatSync(handle);
        if (!stat.isFile() || stat.size < 1 || stat.size > 16384) fail('INVALID_CONFIG');
        const bytes = Buffer.alloc(stat.size + 1);
        const count = readSync(handle, bytes, 0, bytes.length, 0);
        if (count !== stat.size) fail('INVALID_CONFIG');
        raw = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes.subarray(0, count)));
      } finally { closeSync(handle); }
    }
    if (raw !== undefined) {
      config = parseConfig(raw, allowLoopbackHttp);
      const credential = currentCredential();
      if (credential.diagnostic === 'INVALID_CONFIG') fail('INVALID_CONFIG');
      reason = null;
      binding = {providerId: config.providerId, adapter: ADAPTER, model: config.model, configHash: sha(serialize(config)), adapterVersion: VERSION};
    }
  } catch { config = null; binding = null; reason = 'INVALID_CONFIG'; }
  const preparedCalls = new WeakMap();
  return Object.freeze({
    capability() {
      const credential = currentCredential();
      const safeConfig = config && credential.diagnostic !== 'INVALID_CONFIG';
      return {available: false, configured: !!safeConfig, invocationSupported: !!credential.secret, stageIntegrated: false, liveVerification: {generate: 'not_verified', edit: 'not_verified'}, reason: credential.diagnostic ?? 'STAGE_NOT_INTEGRATED', binding: safeConfig && binding ? structuredClone(binding) : null, operations: safeConfig ? structuredClone(config.operations) : {generate: false, edit: false}, limits: safeConfig ? Object.fromEntries(Object.keys(MAX).map(key => [key, config[key]])) : null};
    },
    async prepare(task, verifiedInputs = []) {
      const {secret, diagnostic} = currentCredential();
      if (!secret) return {kind: 'refused', diagnostic};
      const scan = secretScanner(secret);
      try {
        const request = requestRecord(task);
        if (scan(request) || !isDeepStrictEqual(request.binding, binding)) fail('INVALID_REQUEST');
        const operation = request.operation;
        if (!config.operations[operation.kind]) fail('UNSUPPORTED_OPERATION');
        for (const [key, value] of Object.entries(operation.options)) if (!Object.hasOwn(config.supportedOptions[operation.kind], key) || !config.supportedOptions[operation.kind][key].includes(value)) fail('UNSUPPORTED_OPTION');
        if (!Array.isArray(verifiedInputs) || verifiedInputs.length !== (operation.images?.length ?? 0) || verifiedInputs.length > config.maxInputImages) fail('INVALID_REFERENCES');
        const inputs = [];
        for (const [index, input] of verifiedInputs.entries()) {
          const reference = operation.images[index];
          if (!object(input) || !(input.bytes instanceof Uint8Array) || input.bytes.byteLength > IMAGE_LIMITS.bytes || input.imageId !== reference.imageId || input.sha256 !== reference.sha256) fail('INVALID_REFERENCES');
          const bytes = Buffer.from(input.bytes);
          if (scan(bytes)) fail('SECRET_ECHO_REJECTED');
          if (sha(bytes) !== reference.sha256 || bytes.length !== input.byteLength) fail('INVALID_REFERENCES');
          const dimensions = await inspectImage(bytes, {pythonBinary});
          if (dimensions.mediaType !== input.mediaType) fail('INVALID_REFERENCES');
          inputs.push({...reference, mediaType: dimensions.mediaType, byteLength: bytes.length, bytes});
        }
        const encoded = encodeRequest(request, inputs);
        if (encoded.body.length > config.maxRequestBytes) fail('REQUEST_TOO_LARGE');
        const current = currentCredential();
        if (!current.secret || current.secret !== secret) return {kind: 'refused', diagnostic: current.diagnostic ?? 'CREDENTIAL_CHANGED'};
        const prepared = Object.freeze({kind: 'prepared', attemptId: request.attemptId, requestHash: sha(serialize(request)), request: structuredClone(request)});
        preparedCalls.set(prepared, {secret, request, encoded, orderedInputs: inputs.map(({bytes, ...input}) => input)});
        return prepared;
      } catch (error) {
        const allowed = ['INVALID_REQUEST', 'INVALID_SHAPE', 'INVALID_BINDING', 'INVALID_OPERATION', 'INVALID_REFERENCES', 'UNSUPPORTED_OPERATION', 'UNSUPPORTED_OPTION', 'REQUEST_TOO_LARGE', 'SECRET_ECHO_REJECTED'];
        return {kind: 'refused', diagnostic: allowed.includes(error.message) ? error.message : 'INVALID_INPUT'};
      }
    },
    async execute(prepared, {evidenceDir, signal} = {}) {
      const call = preparedCalls.get(prepared);
      if (!call) return {kind: 'refused', diagnostic: 'INVALID_PREPARED_CALL'};
      preparedCalls.delete(prepared);
      if (typeof evidenceDir !== 'string' || !evidenceDir || signal?.aborted) return {kind: 'refused', diagnostic: signal?.aborted ? 'ABORTED_BEFORE_DISPATCH' : 'EVIDENCE_DIRECTORY_REQUIRED'};
      const current = currentCredential();
      if (!current.secret || current.secret !== call.secret) return {kind: 'refused', dispatch: 'not_started', diagnostic: current.diagnostic ?? 'CREDENTIAL_CHANGED'};
      const {secret, request, encoded, orderedInputs} = call;
      const scan = secretScanner(secret);
      const receipt = {protocol: 'image-http-receipt-v1', projectId: request.projectId, jobId: request.jobId, candidateId: request.candidateId, attemptId: request.attemptId, requestHash: sha(serialize(request)), binding: structuredClone(binding), operation: request.operation.kind, orderedInputs, dispatchedAt: new Date().toISOString(), finishedAt: null, outcome: 'unknown', httpStatus: null, providerRequestId: null, responseHeaderRequestId: null, reportedModel: null, usage: null, cost: null, responseEvidence: null, generated: null, rawResponseRetained: false, diagnostic: null};
      try {
        const url = new URL(`${config.baseUrl}/images/${request.operation.kind === 'generate' ? 'generations' : 'edits'}`);
        const response = await post(url, encoded, secret, config, signal);
        receipt.httpStatus = response.status;
        const headerId = response.requestId;
        receipt.responseHeaderRequestId = typeof headerId === 'string' && /^[A-Za-z0-9_.:/-]{1,200}$/.test(headerId) && !scan(headerId) ? headerId : null;
        receipt.providerRequestId = receipt.responseHeaderRequestId;
        if (!response.body) {
          receipt.outcome = response.status >= 400 && response.status < 500 ? 'remote_rejected' : 'unknown';
          receipt.diagnostic = response.status >= 300 && response.status < 400 ? 'REDIRECT_REFUSED' : 'HTTP_ERROR';
          receipt.finishedAt = new Date().toISOString();
          return {kind: receipt.outcome === 'remote_rejected' ? 'rejected' : 'unknown', receipt};
        }
        const decoded = await decodeResponse(response.body, scan, pythonBinary);
        Object.assign(receipt, {finishedAt: new Date().toISOString(), outcome: 'output_received', generated: decoded.generated, rawResponseRetained: decoded.rawResponseRetained, reportedModel: decoded.reportedModel, providerRequestId: decoded.providerRequestId ?? receipt.responseHeaderRequestId, usage: decoded.usage});
        receipt.responseEvidence = await persistEvidence(evidenceDir, request, receipt, decoded);
        return {kind: 'image', receipt, bytes: decoded.bytes};
      } catch (error) {
        const allowed = ['ABORTED', 'DEADLINE_EXCEEDED', 'TRANSPORT_INTERRUPTED', 'RESPONSE_TOO_LARGE', 'INVALID_RESPONSE_HEADERS', 'SECRET_ECHO_REJECTED'];
        Object.assign(receipt, {finishedAt: new Date().toISOString(), outcome: 'unknown', generated: null, rawResponseRetained: false, providerRequestId: null, responseHeaderRequestId: null, reportedModel: null, usage: null, responseEvidence: null, diagnostic: allowed.includes(error.message) ? error.message : 'OUTPUT_NOT_VERIFIED'});
        return {kind: 'unknown', receipt};
      }
    },
    async recover(task, attemptId, evidenceDir, {expectedEvidence} = {}) {
      const scan = secretScanner(currentCredential().secret);
      try {
        const request = requestRecord(task);
        if (request.attemptId !== attemptId || !digest(expectedEvidence?.sha256) || expectedEvidence.protocol !== VERSION) fail('INVALID_EVIDENCE');
        const directory = attemptPath(evidenceDir, request);
        const directoryStat = await lstat(directory);
        if (!directoryStat.isDirectory() || (directoryStat.mode & 0o077)) fail('INVALID_EVIDENCE');
        const manifestBytes = await protectedRead(join(directory, 'manifest.json'), 16384);
        if (scan(manifestBytes) || sha(manifestBytes) !== expectedEvidence.sha256) fail('INVALID_EVIDENCE');
        const manifest = JSON.parse(manifestBytes);
        if (manifest.protocol !== VERSION || !isDeepStrictEqual(Object.keys(manifest.files).sort(), ['image.bin', 'receipt.json', 'request.json', 'response.json'])) fail('INVALID_EVIDENCE');
        const files = {};
        for (const name of Object.keys(manifest.files)) {
          const limit = name === 'image.bin' ? IMAGE_LIMITS.bytes : name === 'response.json' ? MAX.maxResponseBytes : 256 * 1024;
          const bytes = await protectedRead(join(directory, name), limit);
          if (scan(bytes) || bytes.length !== manifest.files[name].byteLength || sha(bytes) !== manifest.files[name].sha256) fail('INVALID_EVIDENCE');
          files[name] = bytes;
        }
        if (!isDeepStrictEqual(JSON.parse(files['request.json']), request)) fail('INVALID_EVIDENCE');
        const receipt = JSON.parse(files['receipt.json']);
        const decoded = await decodeResponse(files['response.json'], scan, pythonBinary);
        if (receipt.responseHeaderRequestId !== null && (typeof receipt.responseHeaderRequestId !== 'string' || !/^[A-Za-z0-9_.:/-]{1,200}$/.test(receipt.responseHeaderRequestId))) fail('INVALID_EVIDENCE');
        if (!decoded.bytes.equals(files['image.bin']) || receipt.outcome !== 'output_received' || receipt.diagnostic !== null || receipt.projectId !== request.projectId || receipt.jobId !== request.jobId || receipt.candidateId !== request.candidateId || receipt.attemptId !== attemptId || receipt.requestHash !== sha(serialize(request)) || !isDeepStrictEqual(receipt.binding, request.binding) || !isDeepStrictEqual(receipt.generated, decoded.generated) || receipt.reportedModel !== decoded.reportedModel || receipt.providerRequestId !== (decoded.providerRequestId ?? receipt.responseHeaderRequestId) || !isDeepStrictEqual(receipt.usage, decoded.usage) || receipt.operation !== request.operation.kind || receipt.cost !== null) fail('INVALID_EVIDENCE');
        if (!isDeepStrictEqual(receipt.orderedInputs.map(({imageId, sha256}) => ({imageId, sha256})), request.operation.images ?? [])) fail('INVALID_EVIDENCE');
        return {kind: 'image', receipt: {...receipt, responseEvidence: structuredClone(expectedEvidence)}, bytes: decoded.bytes};
      } catch { return {kind: 'unavailable', diagnostic: 'EVIDENCE_NOT_VERIFIED'}; }
    },
  });
}
