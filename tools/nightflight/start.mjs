import http from 'node:http';
import { homedir } from 'node:os';
import { createReadStream, existsSync, statSync, readFileSync } from 'node:fs';
import { resolve, sep, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';
import { createNightflight } from './service.mjs';
import { runStage } from './codex-runner.mjs';
import { runLayout } from './layout.mjs';

const dist = fileURLToPath(new URL('../../apps/workbench-preview/dist/', import.meta.url));
const dataHome = process.platform === 'darwin' ? 'Library/Application Support' : '.local/share';
const root = resolve(process.env.NIGHTFLIGHT_DATA || resolve(homedir(), dataHome, 'PitchAgent/nightflight'));
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
};
if (!existsSync(resolve(dist, 'nightflight/index.html'))) throw Error('请先运行 npm run build');
let service;
const server = http.createServer(async (req, res) => {
  if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(req.headers.host ?? '')) {
    res.writeHead(403).end();
    return;
  }
  if (req.url.startsWith('/api/')) {
    await service.handle(req, res);
    return;
  }
  if (!['GET', 'HEAD'].includes(req.method)) {
    res.writeHead(405).end();
    return;
  }
  try {
    const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = resolve(dist, '.' + path + (path.endsWith('/') ? 'index.html' : ''));
    if (!file.startsWith(resolve(dist) + sep) || !statSync(file).isFile()) throw Error();
    res.writeHead(200, {
      'Content-Type': mime[extname(file)] ?? 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': file.includes('/assets/') ? 'public,max-age=31536000,immutable' : 'no-cache',
    });
    if (req.method === 'HEAD') res.end();
    else if (file === resolve(dist, 'index.html'))
      res.end(
        readFileSync(file, 'utf8').replace(
          '<head>',
          "<head><script>if (!location.hash.startsWith('#/') && !new URLSearchParams(location.search).has('classic')) location.replace('./nightflight/'+location.search+location.hash)</script>",
        ),
      );
    else await pipeline(createReadStream(file), res);
  } catch {
    if (!res.headersSent) res.writeHead(404);
    res.end();
  }
});
const port = Number(process.env.NIGHTFLIGHT_PORT || 4420);
server.listen(port, '127.0.0.1', () => {
  service = createNightflight({ root, runStage, runLayout });
  console.log('夜航提案台 http://127.0.0.1:'+server.address().port+'/ （等待用户开始）');
});
for (const sig of ['SIGINT', 'SIGTERM'])
  process.once(sig, () => {
    service?.close();
    server.close();
  });
