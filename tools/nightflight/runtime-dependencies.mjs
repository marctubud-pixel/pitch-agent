import {execFile} from 'node:child_process';
import {constants, existsSync, promises as fs} from 'node:fs';
import {createRequire} from 'node:module';
import {delimiter, dirname, isAbsolute, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';

const repo = fileURLToPath(new URL('../../', import.meta.url));
const requireApp = createRequire(join(repo, 'apps/workbench-preview/package.json'));
const execute = promisify(execFile);
export const codexVersion = '0.167.0';

export async function pythonBinary() {
  if (process.env.NIGHTFLIGHT_PYTHON) {
    if (!isAbsolute(process.env.NIGHTFLIGHT_PYTHON)) throw Error('NIGHTFLIGHT_PYTHON 需指向 Python 绝对路径');
    return process.env.NIGHTFLIGHT_PYTHON;
  }
  const roots = [repo];
  const gitFile = await fs.readFile(join(repo, '.git'), 'utf8').catch(() => '');
  const gitDir = gitFile.match(/^gitdir: (.+)$/m)?.[1];
  if (gitDir) {
    const metadata = resolve(repo, gitDir.trim());
    const common = await fs.readFile(join(metadata, 'commondir'), 'utf8').catch(() => '');
    if (common) roots.push(dirname(resolve(metadata, common.trim())));
  }
  for (const root of roots) {
    const path = join(root, '.scratch/pdf-test-runtime/bin/python');
    if (await fs.access(path, constants.X_OK).then(() => true, () => false)) return path;
  }
  for (const folder of (process.env.PATH ?? '').split(delimiter).filter(Boolean)) {
    const path = resolve(folder, 'python3');
    if (await fs.access(path, constants.X_OK).then(() => true, () => false)) return path;
  }
  throw Error('找不到 Python 3；请运行 npm run setup:python 或设置 NIGHTFLIGHT_PYTHON');
}

export function chromiumPath() {
  const {chromium} = requireApp('playwright');
  if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE) return process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
  const bundled = chromium.executablePath();
  if (existsSync(bundled)) return bundled;
  const systemChrome = process.platform === 'darwin'
    ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : '/usr/bin/google-chrome';
  return existsSync(systemChrome) ? systemChrome : bundled;
}

export async function checkCodex(binary) {
  const {stdout} = await execute(binary, ['--version'], {timeout: 5000});
  if (stdout.trim() !== 'codex-cli ' + codexVersion) throw Error('夜航本机模型接口需要 Codex CLI ' + codexVersion + '，检测到 ' + stdout.trim().slice(0,80));
}

export async function checkDependencies() {
  const problems = [];
  try { await execute(await pythonBinary(), ['-I', '-c', 'import PIL, pypdf, pdfplumber'], {timeout: 15000}); }
  catch { problems.push('PDF／图片环境不可用，请运行 npm run setup:python'); }
  try { await fs.access(chromiumPath(), constants.X_OK); }
  catch { problems.push('排版浏览器不可用，请运行 npm run setup:browser 或指定 PLAYWRIGHT_CHROMIUM_EXECUTABLE'); }
  if (!process.env.ONEPITCH_TEXT_EXECUTABLE) {
    try { await checkCodex('codex'); }
    catch { problems.push('本机模型需要 Codex CLI '+codexVersion+'；桌面／服务器模型桥可独立运行'); }
  }
  return problems;
}
