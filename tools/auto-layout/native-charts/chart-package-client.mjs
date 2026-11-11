import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {parseChartEvidence} from './chart-data.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
export const python=process.env.RUNTIME_PYTHON??'/Users/marc/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3';
export function verifyNativeChartPackage(packagePath,raw,sources,manifest) {
  const expected=parseChartEvidence(raw,sources);
  const child=spawnSync(python,[path.join(here,'chart-package-verify.py'),packagePath],{input:JSON.stringify({expected,manifest}),encoding:'utf8',env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'},maxBuffer:8*1024*1024,timeout:30000});
  if(child.status!==0) throw new Error(child.stderr||child.error?.message||'CHART_PACKAGE_VERIFICATION_FAILED');
  return JSON.parse(child.stdout);
}
