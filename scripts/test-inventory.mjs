import {readFileSync} from 'node:fs';
const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url)));
const {files} = read('./repository-files.json');
const {scripts} = read('../package.json');
const commands = Object.entries(scripts).filter(([name]) => name.startsWith('test:'));
for (const file of files.filter(path => /(?:\.test\.(?:mjs|[jt]sx?|py)|_test\.py)$/.test(path))) {
  const named = commands.find(([, cmd]) => cmd.split(/\s+/).includes(file))?.[0];
  const group = named || (file.startsWith('tools/nightflight/') ? 'test:nightflight'
    : file.startsWith('deploy/onepitch/') ? 'test:portal'
    : file.startsWith('apps/workbench-preview/src/') ? 'test:frontend'
    : file.startsWith('tools/workbench/') ? '合同后端专项'
    : '历史工程或工具专项');
  console.log(group + '\t' + file);
}
