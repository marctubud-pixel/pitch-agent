import childProcess from 'node:child_process';
import fsPromises from 'node:fs/promises';
import {syncBuiltinESMExports} from 'node:module';
import {after} from 'node:test';
import assert from 'node:assert/strict';
export const monitor = {children: [], fixtureWrites: 0, fixtureBytes: 0, synchronousFixtureChildren: 0};
const spawn = childProcess.spawn;
const execFileSync = childProcess.execFileSync;
const writeFile = fsPromises.writeFile;
childProcess.spawn = function(...args) {
  assert(monitor.children.length < 32, 'decoder start budget');
  assert(monitor.children.every(child => child.terminal), 'decoder children must be sequential');
  const child = spawn.apply(this, args);
  const entry = {pid: child.pid, terminal: false};
  monitor.children.push(entry);
  const end = child.stdin.end;
  child.stdin.end = function(bytes, ...rest) {
    entry.bytes = bytes;
    return end.call(this, bytes, ...rest);
  };
  child.on('close', (code, signal) => Object.assign(entry, {terminal: true, code, signal}));
  return child;
};
childProcess.execFileSync = function(...args) {
  const result = execFileSync.apply(this, args);
  monitor.synchronousFixtureChildren++;
  return result;
};
fsPromises.writeFile = async function(path, data, options) {
  const bytes = typeof data === 'string' ? Buffer.byteLength(data) : data.byteLength;
  assert(Number.isFinite(bytes) && monitor.fixtureBytes + bytes <= 2 * 1024 * 1024, 'fixture write budget');
  monitor.fixtureWrites++; monitor.fixtureBytes += bytes;
  return writeFile.call(this, path, data, options);
};
syncBuiltinESMExports();
after(async () => {
  assert(monitor.children.every(child => child.terminal), 'every decoder must reach close');
  const result = {starts: monitor.children.length, closes: monitor.children.filter(child => child.terminal).length,
    fixtureWrites: monitor.fixtureWrites, fixtureBytes: monitor.fixtureBytes,
    synchronousFixtureChildren: monitor.synchronousFixtureChildren,
    children: monitor.children.map(({pid, terminal, code, signal, bytes}) => ({pid, terminal, code, signal, bytes: bytes?.length}))};
  console.log('IMAGE_READ_MONITOR ' + JSON.stringify(result));
  childProcess.spawn = spawn; childProcess.execFileSync = execFileSync; fsPromises.writeFile = writeFile;
  syncBuiltinESMExports();
});
