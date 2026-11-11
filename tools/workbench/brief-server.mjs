import http from 'node:http';
import {randomUUID, createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {openStore} from './store.mjs';
import {layoutPublicProject} from './layout-boundary.mjs';
import {DomainError, projectView} from './project.mjs';

const MAX_BODY_BYTES = 128 * 1024;
const commandFields = {'revise-task-card': ['taskCardId', 'brief'], 'confirm-task-card': ['taskCardId']};
class HttpError extends Error {
  constructor(status, code, message) { super(message); Object.assign(this, {status, code}); }
}
function invalid(message) { throw new HttpError(400, 'INVALID_REQUEST', message); }
function fields(body, allowed) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) invalid('JSON object required');
  for (const key of Object.keys(body)) if (!allowed.includes(key)) invalid(`Unexpected field: ${key}`);
}
function string(body, key, required = true) {
  if (body[key] === undefined && !required) return;
  if (typeof body[key] !== 'string' || !body[key].trim() || body[key].length > 60000) invalid(`${key} must be a nonempty string of at most 60000 characters`);
}
async function jsonBody(req) {
  if (!/^application\/json(?:\s*;.*)?$/i.test(req.headers['content-type'] ?? '')) throw new HttpError(415, 'JSON_REQUIRED', 'Use application/json');
  if (Number(req.headers['content-length']) > MAX_BODY_BYTES) throw new HttpError(413, 'BODY_TOO_LARGE', 'JSON body exceeds permitted size');
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += Buffer.byteLength(chunk);
    if (size > MAX_BODY_BYTES) throw new HttpError(413, 'BODY_TOO_LARGE', 'JSON body exceeds permitted size');
    chunks.push(Buffer.from(chunk));
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { invalid('Malformed JSON'); }
}
function response(res, status, body) {
  res.writeHead(status, {'Content-Type': 'application/json; charset=utf-8'});
  res.end(JSON.stringify(body));
}
const humanContext = () => ({actorType: 'human', actorId: 'local-operator', runId: `human:${randomUUID()}`, contextId: `local-ui:${randomUUID()}`, now: new Date().toISOString()});
const result = project => ({project: layoutPublicProject(project), view: projectView(project)});
function frontendOrigin(value) {
  if (value === undefined) return;
  let url;
  try { url = new URL(value); } catch { throw new Error('origin must be an explicit HTTP loopback origin'); }
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(url.hostname) || !url.port || url.origin !== value) throw new Error('origin must be an explicit HTTP loopback origin');
  return value;
}

export function createBriefServer({dbPath, port = 4182, origin} = {}) {
  if (typeof dbPath !== 'string' || !dbPath.trim()) throw new Error('An explicit dbPath is required');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('port must be between 1 and 65535');
  const allowedOrigin = frontendOrigin(origin);
  const store = openStore(dbPath);
  const requests = new Set();
  let closing = false, shutdown, closeResult;
  const drain = async () => { while (requests.size) await Promise.allSettled([...requests]); };
  const finishClose = () => {
    closing = true;
    shutdown ??= drain().then(() => store.close());
    return shutdown;
  };
  const handle = async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    try {
      if (closing) throw new HttpError(503, 'SERVER_CLOSING', 'Brief service is shutting down');
      const activePort = server.address()?.port ?? port;
      if (![ `127.0.0.1:${activePort}`, `localhost:${activePort}` ].includes(req.headers.host)) throw new HttpError(403, 'INVALID_HOST', 'Use the local service address');
      const localOrigin = `http://${req.headers.host}`;
      const url = new URL(req.url, localOrigin);
      if (url.origin !== localOrigin) throw new HttpError(403, 'INVALID_HOST', 'Request target must use the local origin');
      if ((req.headers.origin && req.headers.origin !== localOrigin && req.headers.origin !== allowedOrigin) || req.headers['sec-fetch-site'] === 'cross-site') throw new HttpError(403, 'CROSS_ORIGIN', 'Only the configured local frontend is allowed');
      if (req.headers.origin) {
        res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
        res.setHeader('Vary', 'Origin');
      }
      const projectMatch = /^\/api\/v1\/projects\/([A-Za-z0-9-]+)(\/commands)?$/.exec(url.pathname);
      const methods = url.pathname === '/api/v1/capabilities' ? ['GET'] : url.pathname === '/api/v1/projects' ? ['GET', 'POST'] : projectMatch ? [projectMatch[2] ? 'POST' : 'GET'] : [];
      if (!methods.length) throw new HttpError(404, 'NOT_FOUND', 'Route not found');
      const revision = url.searchParams.get('revision');
      const targetMethod = req.method === 'OPTIONS' ? req.headers['access-control-request-method'] : req.method;
      if (url.search && !(projectMatch && !projectMatch[2] && targetMethod === 'GET' && [...url.searchParams.keys()].every(k => k === 'revision') && url.searchParams.getAll('revision').length === 1 && /^\d+$/.test(revision) && Number.isSafeInteger(Number(revision)))) invalid('Only a nonnegative revision query is supported on project reads');
      if (req.method === 'OPTIONS') {
        if (!req.headers.origin || !methods.includes(req.headers['access-control-request-method']) || (req.headers['access-control-request-headers'] ?? '').split(',').some(h => h.trim() && h.trim().toLowerCase() !== 'content-type')) invalid('Invalid preflight');
        res.setHeader('Access-Control-Allow-Methods', methods.join(', '));
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        res.writeHead(204); res.end(); return;
      }
      if (!methods.includes(req.method)) throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Method not allowed');
      if (url.pathname === '/api/v1/capabilities') {
        response(res, 200, {apiVersion: 'v1', surface: 'brief-v1', executionAvailable: false, commands: Object.keys(commandFields)}); return;
      }
      if (url.pathname === '/api/v1/projects' && req.method === 'GET') {
        response(res, 200, {projects: store.list().map(({id}) => { const p = store.read(id); return {id, name: p.name, revision: p.revision}; })}); return;
      }
      if (url.pathname === '/api/v1/projects') {
        const body = await jsonBody(req);
        fields(body, ['name', 'brief', 'mode', 'humanGates', 'commandId']);
        if (body.mode !== undefined && !['auto', 'assisted'].includes(body.mode)) invalid('mode must be auto or assisted');
        if (body.humanGates !== undefined && (!Array.isArray(body.humanGates) || !body.humanGates.every(stage => ['strategy', 'copy', 'visual', 'final_review'].includes(stage)))) invalid('humanGates must contain current manual stages');
        string(body, 'name'); string(body, 'brief'); string(body, 'commandId', false);
        if (body.commandId === '__proto__') invalid('Reserved commandId');
        const id = body.commandId ? `project-${createHash('sha256').update(body.commandId).digest('hex')}` : randomUUID();
        const input = {id, name: body.name.trim(), brief: body.brief, mode: body.mode ?? 'assisted', humanGates: body.humanGates ?? [], authorizedThrough: 'research'};
        try { response(res, 201, result(store.create(input, humanContext()))); }
        catch (error) {
          if (error.code !== 'PROJECT_EXISTS' || !body.commandId) throw error;
          const initial = store.read(id, 0), policy = initial.policies[0];
          if (initial.name !== input.name || initial.taskCards[0].brief !== input.brief || policy.mode !== input.mode || policy.authorizedThrough !== input.authorizedThrough || JSON.stringify(policy.humanGates) !== JSON.stringify([...new Set(input.humanGates)])) throw new HttpError(409, 'COMMAND_ID_REUSED', 'Creation command ID belongs to another payload');
          response(res, 200, result(store.read(id)));
        }
        return;
      }
      if (!projectMatch[2]) { response(res, 200, result(store.read(projectMatch[1], revision === null ? undefined : Number(revision)))); return; }
      const body = await jsonBody(req);
      if (!body || typeof body.kind !== 'string' || !Object.hasOwn(commandFields, body.kind)) throw new HttpError(403, 'COMMAND_FORBIDDEN', 'Only Brief revisions and confirmations are supported');
      fields(body, ['kind', 'commandId', 'expectedRevision', ...commandFields[body.kind]]);
      for (const key of ['commandId', ...commandFields[body.kind]]) string(body, key);
      if (body.commandId === '__proto__' || !Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 0) invalid('Valid command ID and nonnegative revision required');
      const replayed = Object.hasOwn(store.read(projectMatch[1]).processedCommands, body.commandId);
      const project = store.command(projectMatch[1], body, humanContext());
      response(res, 200, {...result(project), receipt: {commandId: body.commandId, replayed}});
    } catch (error) {
      const status = error.status ?? (error instanceof DomainError ? error.code === 'NOT_FOUND' ? 404 : ['REVISION_CONFLICT', 'COMMAND_ID_REUSED', 'PROJECT_EXISTS'].includes(error.code) ? 409 : 422 : 500);
      response(res, status, {error: {code: status === 500 ? 'INTERNAL_ERROR' : error.code, message: status === 500 ? 'Brief service could not complete the request' : error.message}});
    }
  };
  const server = http.createServer((req, res) => {
    const request = handle(req, res);
    requests.add(request);
    request.finally(() => requests.delete(request)).catch(() => {});
  });
  const listen = server.listen.bind(server);
  server.listen = (callback) => {
    if (callback !== undefined && typeof callback !== 'function') throw new Error('Brief service only listens on its configured loopback address');
    return listen(port, '127.0.0.1', callback);
  };
  server.drain = drain;
  server.once('close', () => { finishClose().catch(error => server.emit('error', error)); });
  const close = server.close.bind(server);
  server.close = callback => {
    closing = true;
    closeResult ??= new Promise(resolve => close(error => {
      finishClose().then(() => resolve(error?.code === 'ERR_SERVER_NOT_RUNNING' ? undefined : error), resolve);
    }));
    if (typeof callback === 'function') closeResult.then(callback);
    return server;
  };
  return server;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = {}, args = process.argv.slice(2);
    for (let i = 0; i < args.length; i += 2) {
      if (!['--db', '--port', '--origin'].includes(args[i]) || args[i + 1] === undefined || Object.hasOwn(options, args[i])) throw new Error('Use --db PATH [--port PORT] [--origin HTTP_LOOPBACK_ORIGIN]');
      options[args[i]] = args[i + 1];
    }
    const server = createBriefServer({dbPath: options['--db'], port: options['--port'] === undefined ? 4182 : Number(options['--port']), origin: options['--origin']});
    server.once('error', error => { console.error(error.message); server.close(() => { process.exitCode = 1; }); });
    server.listen(() => console.log(`Brief service available at http://127.0.0.1:${server.address().port}`));
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.close(error => { if (error) process.exitCode = 1; }));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
