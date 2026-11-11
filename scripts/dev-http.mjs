import {spawn} from 'node:child_process';

const child = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['--prefix', 'apps/workbench-preview', 'run', 'dev', '--', '--host', '127.0.0.1', '--port', '4420', '--strictPort'], {
  stdio: 'inherit',
  env: {...process.env, VITE_WORKBENCH_API_URL: process.env.VITE_WORKBENCH_API_URL || 'http://127.0.0.1:4182/api/v1'},
});
child.once('error', error => {console.error(error.message); process.exitCode = 1;});
child.once('exit', (code, signal) => {process.exitCode = code ?? (signal ? 1 : 0);});
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => child.kill(signal));
