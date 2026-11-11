import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { extractHtml } from './source-acquisition.mjs';

test('malformed image attributes cannot monopolize the capture process', async () => {
  const moduleUrl = new URL('./source-acquisition.mjs', import.meta.url).href;
  const script = `import { extractHtml } from ${JSON.stringify(moduleUrl)};
    const result = extractHtml('<img ' + 'a'.repeat(250000) + '><p>Actual text</p>', 'https://example.com/');
    if (!result.text.includes('Actual text') || result.images.length) process.exit(2);`;
  await promisify(execFile)(process.execPath, ['--input-type=module', '-e', script], {
    timeout: 2000,
    killSignal: 'SIGKILL',
  });
});

test('nested template content is excluded until the outer template closes', () => {
  const result = extractHtml('<template><template></template><p>Template-only claim</p><img src="https://example.com/hidden.jpg"></template><p>Visible</p>', 'https://example.com/');
  assert.equal(result.text, 'Visible');
  assert.deepEqual(result.images, []);
});
