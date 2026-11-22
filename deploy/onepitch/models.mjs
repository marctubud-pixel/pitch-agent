import {createCipheriv, createDecipheriv, randomBytes, randomUUID} from 'node:crypto';
import {chmodSync, linkSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';

const providers = new Map([
  ['text', {base: 'https://api.deepseek.com', model: 'deepseek-flash'}],
  ['vision', {base: 'https://api.openai.com/v1', model: 'gpt-4.1-mini'}],
  ['image', {base: 'https://api.openai.com/v1', model: 'gpt-image-2'}],
]);

function provider(role) {
  if (!providers.has(role)) throw Error('请选择有效的模型用途');
  return providers.get(role);
}

function privateWrite(path, bytes, publish) {
  const temp = path + '.' + randomUUID();
  writeFileSync(temp, bytes, {mode: 0o600, flag: 'wx'});
  try {
    publish(temp, path);
  } finally {
    try { unlinkSync(temp); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}

function encryptionKey(dir, create) {
  const file = join(dir, '.master-key');
  try { return readFileSync(file); }
  catch (error) { if (error.code !== 'ENOENT' || !create) throw error; }
  try { privateWrite(file, randomBytes(32), linkSync); }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
  return readFileSync(file);
}

function storedProfile(dir, role) {
  const {base, model} = provider(role);
  let encrypted;
  try { encrypted = JSON.parse(readFileSync(join(dir, role + '.json'), 'utf8')); }
  catch (error) {
    if (error.code === 'ENOENT') return {model, base, key: ''};
    throw Error('模型设置读取失败');
  }
  try {
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey(dir, false), Buffer.from(encrypted.iv, 'base64'));
    decipher.setAAD(Buffer.from(role));
    decipher.setAuthTag(Buffer.from(encrypted.tag, 'base64'));
    const data = Buffer.concat([decipher.update(Buffer.from(encrypted.data, 'base64')), decipher.final()]);
    const profile = JSON.parse(data);
    return {base, model: profile.model, key: profile.key};
  } catch { throw Error('模型设置解密失败，请检查设置目录及其主密钥备份'); }
}

export function publicProfiles(dir) {
  return Object.fromEntries([...providers.keys()].map(role => {
    const {model, key} = storedProfile(dir, role);
    return [role, {model, configured: Boolean(key)}];
  }));
}

export function saveProfile(dir, {role, model, key = ''}) {
  provider(role);
  if (typeof model !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,119}$/.test(model)) throw Error('请填写有效的模型名称');
  if (typeof key !== 'string' || !/^[!-~]{0,4096}$/.test(key)) throw Error('请检查 API Key 格式');
  const secret = key || storedProfile(dir, role).key;
  if (!secret) throw Error('请先填写 API Key');
  mkdirSync(dir, {recursive: true, mode: 0o700});
  chmodSync(dir, 0o700);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(dir, true), iv);
  cipher.setAAD(Buffer.from(role));
  const data = Buffer.concat([cipher.update(JSON.stringify({model, key: secret}), 'utf8'), cipher.final()]);
  const encrypted = {iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64')};
  privateWrite(join(dir, role + '.json'), JSON.stringify(encrypted), renameSync);
  return {model, configured: true};
}

export function configuredProfile(dir, role) {
  const profile = storedProfile(dir, role);
  if (!profile.key) throw Error('请在菜单「模型与 API」保存此用途的 Key 和模型');
  return profile;
}
