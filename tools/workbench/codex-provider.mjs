import {EVIDENCE_SELECTION_PROTOCOL} from './evidence-selection.mjs';
import {assertFinalOperationDispatch} from './final-operation-host.mjs';
import {spawn as nodeSpawn} from 'node:child_process';
import {access, mkdir, mkdtemp, writeFile, open} from 'node:fs/promises';
import {constants} from 'node:fs';
import {resolve, join, isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';

import {FINAL_CODEX_PHASE_PROTOCOL,serializeFinalCodexInput,decodeCodexJSON,codexText,codexDescriptor} from './final-review-codex-original.mjs';

import {imageManifest, readImageDescriptor, inspectImage} from './image-evidence.mjs';

const DEFAULT_BINARY = '/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex';
const CAPTURE_LIMIT = 4 * 1024 * 1024;
const OUTPUT_LIMIT = 2 * 1024 * 1024;
const RETRY_LINE_LIMIT = 4096;
const MAX_RETRY_AFTER_MS = 24 * 60 * 60 * 1000;

export function parseCodexRateLimit(stderr) {
  let observation;
  for (const line of stderr.split('\n')) {
    if (Buffer.byteLength(line) > RETRY_LINE_LIMIT) continue;
    const match = /^(\S+) +WARN codex_core::responses_retry: stream disconnected - retrying sampling request \(([1-9]\d*)\/([1-9]\d*) in (\d+(?:\.\d+)?)(ms|s)\)\.\.\. turn_id=[a-zA-Z0-9-]+ retries=([1-9]\d*) max_retries=([1-9]\d*) sampling_error=exceeded retry limit, last status: 429 Too Many Requests\r?$/.exec(line);
    if (!match || match[2] !== match[6] || match[3] !== match[7] || !Number.isSafeInteger(Number(match[2])) || !Number.isSafeInteger(Number(match[3]))) continue;
    const retryAfterMs = Math.ceil(Number(match[4]) * (match[5] === 's' ? 1000 : 1));
    if (!Number.isSafeInteger(retryAfterMs) || retryAfterMs <= 0 || retryAfterMs > MAX_RETRY_AFTER_MS || Number(match[2]) > Number(match[3])) continue;
    const timestamp = match[1];
    const date = new Date(timestamp);
    const validTimestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(timestamp)
      && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 19) === timestamp.slice(0, 19);
    observation = {status: 429, retryAfterMs, source: 'codex_cli_stderr', evidenceHash: createHash('sha256').update(line).digest('hex'), ...(validTimestamp ? {observedAt: date.toISOString()} : {})};
  }
  return observation;
}

export function parseCodexEvents(text) {
  let threadId = null;
  let usage = null;
  let completed = false;
  let failed = false;
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    let event;
    try { event = JSON.parse(line); } catch { continue; }
    if (event.type === 'thread.started' && typeof event.thread_id === 'string') threadId = event.thread_id;
    if (event.type === 'turn.failed' || event.type === 'error') failed = true;
    if (event.type === 'turn.completed') {
      completed = true;
      const raw = event.usage;
      if (raw && typeof raw === 'object') {
        usage = {};
        for (const key of ['input_tokens', 'cached_input_tokens', 'output_tokens']) {
          if (Number.isSafeInteger(raw[key]) && raw[key] >= 0) usage[key] = raw[key];
        }
      }
    }
  }
  return {threadId, usage, completed, failed};
}

function failure(code, message, status, receipt) {
  return Object.assign(new Error(message), {code, status, receipt});
}

function invoke(spawn, binary, args, {cwd, timeoutMs, stdin = '', signal, finalOperationDispatch}) {
  return new Promise(resolveResult => {
    let child;
    let stdout = Buffer.alloc(0);
    let stderr = Buffer.alloc(0);
    let reason = null;
    let error = null;
    let settled = false;
    let timer;
    let fallback;
    const finish = (exitCode = null, exitSignal = null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(fallback);
      signal?.removeEventListener('abort', aborted);
      resolveResult({stdoutBuffer:stdout,stderrBuffer:stderr,stdout: stdout.toString('utf8'), stderr: stderr.toString('utf8'), exitCode, signal:exitSignal, reason, error: error?.message ?? null});
    };
    const stop = why => {
      if (reason) return;
      reason = why;
      // Detached POSIX children own a process group; never signal the parent's group.
      try {
        if (spawn === nodeSpawn && process.platform !== 'win32' && Number.isInteger(child.pid) && child.pid > 1) process.kill(-child.pid, 'SIGKILL');
        else child.kill('SIGKILL');
      } catch {}
      fallback = setTimeout(() => finish(), 1000);
    };
    const aborted = () => stop('cancelled');
    const capture = (which, chunk) => {
      const bytes = Buffer.from(chunk);
      const current = which === 'stdout' ? stdout : stderr;
      const next = Buffer.concat([current, bytes.subarray(0, Math.max(0, CAPTURE_LIMIT - current.length))]);
      if (which === 'stdout') stdout = next; else stderr = next;
      if (current.length + bytes.length > CAPTURE_LIMIT) stop('capture_limit');
    };
    if(finalOperationDispatch)assertFinalOperationDispatch(finalOperationDispatch.capability,finalOperationDispatch.request,finalOperationDispatch.provider);
    try {
      child = spawn(binary, args, {cwd, shell: false, detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe']});
      child.stdout.on('data', chunk => capture('stdout', chunk));
      child.stderr.on('data', chunk => capture('stderr', chunk));
      child.on('error', caught => { error = caught; finish(); });
      child.on('close', finish);
      child.stdin.on('error', caught => { error = caught; stop('stdin_error'); });
      timer = setTimeout(() => stop('timeout'), timeoutMs);
      signal?.addEventListener('abort', aborted, {once:true});
      if(signal?.aborted)aborted();
      child.stdin.end(stdin);
    } catch (caught) { error = caught; finish(); }
  });
}

async function boundedOutput(path, raw = false, limit = OUTPUT_LIMIT) {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > limit) throw new Error('Output must be a regular file within 2 MiB');
    const buffer = Buffer.alloc(limit + 1);
    const {bytesRead} = await handle.read(buffer, 0, buffer.length, 0);
    if (bytesRead > limit) throw new Error('Output exceeds 2 MiB');
    const bytes=buffer.subarray(0,bytesRead);
    const text = raw?codexText(bytes,limit):bytes.toString('utf8');
    if (!text.trim()) throw new Error('Output file is empty');
    return raw?bytes:text;
  } finally { await handle.close(); }
}

export function createCodexProvider(options) { return createCodexProviderAdapter(options); }

function createCodexProviderAdapter({binary = DEFAULT_BINARY, model, rootDir, timeoutMs = 180000, spawn = nodeSpawn, reasoningEffort}, finalOperationDispatch) {
  if (!isAbsolute(binary)) throw new Error('Codex binary must be an absolute path');
  if (typeof model !== 'string' || !model.trim()) throw new Error('An explicit model is required');
  if (typeof rootDir !== 'string' || !rootDir) throw new Error('rootDir is required');
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) throw new Error('timeoutMs must be a positive integer');
  if (reasoningEffort !== undefined && !['low', 'medium', 'high', 'xhigh', 'max'].includes(reasoningEffort)) throw new Error('Unsupported reasoningEffort');
  const root = resolve(rootDir);
  const provider = {
    get model() { return model; },
    evidenceSelectionProtocol:EVIDENCE_SELECTION_PROTOCOL,
    async availability() {
      const base = {binary, model, authenticated: false, authenticationVerified: false};
      try { await access(binary, constants.X_OK); }
      catch { return {...base, available: false, version: null, reason: 'binary_unavailable'}; }
      const result = await invoke(spawn, binary, ['--version'], {timeoutMs: Math.min(timeoutMs, 5000)});
      return {...base, available: result.exitCode === 0 && !result.reason && !result.error, version: result.exitCode === 0 ? result.stdout.trim() : null, reason: result.reason ?? result.error};
    },
    async execute({runId, operation, prompt, outputSchema, images = [], imageEnvelope,adapterProtocol,signal,timeoutMs:callTimeoutMs,maxOutputBytes}) {
      const finalText=operation==='final-review-v1';
      if(signal!==undefined&&!(signal instanceof AbortSignal))throw new Error('Invalid per-call abort signal');
      if(callTimeoutMs!==undefined&&(!Number.isSafeInteger(callTimeoutMs)||callTimeoutMs<1))throw new Error('Invalid per-call timeout');
      if(maxOutputBytes!==undefined&&(!Number.isSafeInteger(maxOutputBytes)||maxOutputBytes<1||maxOutputBytes>OUTPUT_LIMIT))throw new Error('Invalid per-call output cap');
      const effectiveTimeout=Math.min(timeoutMs,callTimeoutMs??timeoutMs);
      if(operation!==undefined&&!finalText)throw new Error('Unsupported operation');
      if(finalText&&(callTimeoutMs!==undefined||maxOutputBytes!==undefined||signal!==undefined))throw new Error('Final operation does not accept acquisition call limits');
      if(finalText&&(!outputSchema||imageEnvelope||(adapterProtocol!==FINAL_CODEX_PHASE_PROTOCOL&&images.length)))throw new Error('Final text requires schema and forbids images');
      if (typeof runId !== 'string' || !runId.trim() || typeof prompt !== 'string' || !prompt.trim()) throw new Error('runId and prompt are required');
      if (outputSchema !== undefined && (!outputSchema || typeof outputSchema !== 'object' || Array.isArray(outputSchema))) throw new Error('outputSchema must be an object');
      if (!Array.isArray(images)) throw new Error('images must be an array');
      images = structuredClone(images);
      if(finalText&&images.length>4)throw new Error('Final transport supports at most four occurrences');
      const manifest = images.length ? imageManifest(images,imageEnvelope) : [];
      const imageBytes = [];
      for (const image of images) imageBytes.push(await readImageDescriptor(image));
      if(imageEnvelope){
        if(!['sketch-review-v2','final-visual-v1','complete-content-v1'].includes(imageEnvelope.operation)||!Number.isSafeInteger(imageEnvelope.limits?.maxPixels)||imageEnvelope.limits.maxPixels<1)throw new Error('Invalid review pixel bound');
        let pixels=0;for(const bytes of imageBytes){const decoded=await inspectImage(bytes);pixels+=decoded.width*decoded.height;}
        if(pixels>imageEnvelope.limits.maxPixels)throw new Error('Review aggregate pixel bound exceeded');
      }
      await access(binary, constants.X_OK).catch(() => { throw failure('BINARY_UNAVAILABLE', 'Codex executable is unavailable', 'blocked', null); });
      await mkdir(root, {recursive: true, mode: 0o700});
      const runDir = await mkdtemp(join(root, 'run-'));
      const cwd = join(runDir, 'context');
      await mkdir(cwd, {mode: 0o700});
      const paths = {runDir, input: join(runDir, 'input.json'), schema: outputSchema === undefined ? null : join(runDir, 'schema.json'), stdout: join(runDir, 'stdout.jsonl'), stderr: join(runDir, 'stderr.txt'), output: join(runDir, 'output.txt'), receipt: join(runDir, 'receipt.json'),...(finalText?{invocation:join(runDir,'invocation.json')}:{})};
      const attachments = [];
      for (let index = 0; index < manifest.length; index++) {
        const path = join(cwd, `image-${index + 1}.${manifest[index].mediaType === 'image/png' ? 'png' : 'jpg'}`);
        await writeFile(path, imageBytes[index], {flag: 'wx', mode: 0o400});
        attachments.push({...manifest[index], path});
      }
      const packet = finalText?serializeFinalCodexInput({runId,model,operation,prompt,outputSchema,adapterProtocol,images}):JSON.stringify({runId, model, prompt, ...(outputSchema === undefined ? {} : {outputSchema}), ...(manifest.length ? {images: manifest} : {}), ...(imageEnvelope ? {imageEnvelope} : {})});
      const inputPacketHash = createHash('sha256').update(packet).digest('hex');
      await writeFile(paths.input, packet, {flag: 'wx', mode: 0o400});
      if (paths.schema) await writeFile(paths.schema, JSON.stringify(outputSchema), {flag: 'wx', mode: 0o400});
      const args = ['exec', '--ignore-user-config', '--ephemeral', '--skip-git-repo-check', '-s', 'read-only', '-C', cwd, '--model', model, '--json', '-o', paths.output];
      if (reasoningEffort !== undefined) args.push('--config', `model_reasoning_effort=${JSON.stringify(reasoningEffort)}`);
      if (paths.schema) args.push('--output-schema', paths.schema);
      for (const attachment of attachments) args.push('--image', attachment.path);
      args.push('-');
      if(finalText){const invocation={binary,argv:args,cwd,timeoutMs,stdin:codexDescriptor(prompt)};await writeFile(paths.invocation,JSON.stringify(invocation),{flag:'wx',mode:0o400});}
      const startedAt = new Date().toISOString();
      const result = await invoke(spawn, binary, args, {cwd, timeoutMs:effectiveTimeout, stdin: prompt,signal,finalOperationDispatch});
      await writeFile(paths.stdout, finalText?result.stdoutBuffer:result.stdout, {flag: 'wx', mode: 0o400});
      await writeFile(paths.stderr, finalText?result.stderrBuffer:result.stderr, {flag: 'wx', mode: 0o400});
      const events = parseCodexEvents(result.stdout);
      const rateLimit = parseCodexRateLimit(result.stderr);
      const receipt = {runId,...(finalText?{operation,invocation:codexDescriptor(JSON.stringify({binary,argv:args,cwd,timeoutMs,stdin:codexDescriptor(prompt)}))}:{}), ...(attachments.length ? {images: attachments} : {}), provider: 'codex-cli', providerRequestId: events.threadId, threadId: events.threadId, model, requestedModel: model, ...(reasoningEffort === undefined ? {} : {requestedReasoningEffort: reasoningEffort}), reportedModel: null, usage: events.usage, cost: null, paths, inputPacketHash, contextHash: inputPacketHash, startedAt, finishedAt: new Date().toISOString(), exitCode: result.exitCode, signal: result.signal, reason: result.reason, error: result.error};
      if (rateLimit) receipt.rateLimit = rateLimit;
      await writeFile(paths.receipt, JSON.stringify(receipt, null, 2), {flag: 'wx', mode: 0o400});
      if (result.reason || result.error) throw failure('INVOCATION_UNCERTAIN', result.reason ?? result.error, 'awaiting_reconciliation', receipt);
      if (result.exitCode !== 0 || events.failed) throw failure('PROVIDER_FAILED', 'Codex invocation failed; inspect captured receipt', 'failed', receipt);
      if (!events.completed || !events.threadId) throw failure('INVOCATION_UNCERTAIN', 'Completion or invocation identity missing', 'awaiting_reconciliation', receipt);
      let responseText;
      let parsedOutput;
      try {
        const output=await boundedOutput(paths.output,finalText,maxOutputBytes??OUTPUT_LIMIT);
        responseText=finalText?codexText(output,OUTPUT_LIMIT):output;
        if (outputSchema !== undefined) parsedOutput = finalText?decodeCodexJSON(output,OUTPUT_LIMIT):JSON.parse(responseText);
      } catch (error) { throw failure('INVALID_OUTPUT', error.message, 'failed', receipt); }
      return {...receipt, responseText, ...(outputSchema === undefined ? {} : {parsedOutput}), schemaValidated: false};
    },
  };
  if (reasoningEffort !== undefined) Object.defineProperty(provider, 'reasoningEffort', {enumerable: true, get: () => reasoningEffort});
  return provider;
}

export function createProductionFinalCodexProvider(options){
 if(!options||Object.keys(options).some(k=>!['binary','model','rootDir','timeoutMs'].includes(k)))throw new Error('Unsupported production provider option');
 const provider=createCodexProvider(options);
 const requireProtocol=request=>{if(request.operation!=='final-review-v1'||request.adapterProtocol!==FINAL_CODEX_PHASE_PROTOCOL)throw new Error('Final phase protocol required');};
 return Object.freeze({
  get model(){return provider.model;},
  execute(request){requireProtocol(request);return provider.execute(request);},
  executeFinalOperation(request,capability){
   requireProtocol(request);
   const binding={binary:options.binary??DEFAULT_BINARY,model:options.model,rootDir:resolve(options.rootDir),timeoutMs:options.timeoutMs??180000};
   return createCodexProviderAdapter(options,{capability,request,provider:binding}).execute(request);
  },
 });
}
