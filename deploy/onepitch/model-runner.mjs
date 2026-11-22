#!/usr/bin/env node
import {pathToFileURL} from 'node:url';
import {configuredProfile} from './models.mjs';

const roles = new Map([['--text-model', 'text'], ['--vision-model', 'vision'], ['--image-model', 'image']]);
const extensions = new Map([['image/jpeg', 'jpg'], ['image/png', 'png'], ['image/webp', 'webp']]);

export async function runModel({dir, mode, action, input, fetchImpl = fetch}) {
  const role = roles.get(mode);
  const {base, model, key} = configuredProfile(dir, role);
  if (action === 'profile') return {base, model, host: new URL(base).host};
  if (action !== 'completion') throw Error('未知的模型操作');
  const {body, images = []} = input;
  if (input.base !== base || body?.model !== model) throw Error('模型设置已变更，请重试此阶段');
  const headers = {Authorization: 'Bearer ' + key};
  let path = '/chat/completions';
  let payload;
  if (role === 'image' && images.length) {
    path = '/images/edits';
    payload = new FormData();
    for (const [name, value] of Object.entries(body)) payload.append(name, String(value));
    for (const [i, {mime, data}] of images.entries()) {
      if (!extensions.has(mime) || typeof data !== 'string' || !data) throw Error('参考图应为 PNG、JPEG 或 WebP');
      payload.append('image[]', new Blob([Buffer.from(data, 'base64')], {type: mime}), 'ref-' + i + '.' + extensions.get(mime));
    }
  } else {
    if (role === 'image') path = '/images/generations';
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  let response;
  try {
    response = await fetchImpl(base + path, {method: 'POST', headers, body: payload, redirect: 'error', signal: AbortSignal.timeout(280000)});
  } catch { throw Error('模型服务连接失败或超时，请检查服务器网络后重试'); }
  if (!response.ok) throw Error('模型服务返回 HTTP ' + response.status + '，请检查 Key、模型权限及额度');
  let result;
  try { result = await response.json(); } catch { throw Error('模型服务返回了无效的数据'); }
  if (role === 'image') return {data: result.data, requestId: response.headers.get('x-request-id')};
  return {choices: result.choices, id: result.id, model: result.model};
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    const [mode, action] = process.argv.slice(2);
    const dir = process.env.ONEPITCH_MODEL_DIR;
    if (!dir) throw Error('服务器尚未设置模型目录');
    let input;
    if (action === 'completion') {
      const parts = [];
      let size = 0;
      for await (const chunk of process.stdin) {
        size += chunk.length;
        if (size > 96 * 1024 * 1024) throw Error('模型输入过大');
        parts.push(chunk);
      }
      try { input = JSON.parse(Buffer.concat(parts)); } catch { throw Error('模型请求格式错误'); }
    }
    process.stdout.write(JSON.stringify(await runModel({dir, mode, action, input})));
  } catch (error) { process.stdout.write(JSON.stringify({failure: error.message})); }
}
