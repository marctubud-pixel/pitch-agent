import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const [native, target] = process.argv.slice(2);
if (!native || !target) throw new Error('Usage: node scripts/verify-deck-studio.mjs <installed @napi-rs/canvas directory> <existing output directory>');
const cwd = fileURLToPath(new URL('../',import.meta.url));
const run=spawnSync(process.execPath,['node_modules/vitest/vitest.mjs','run','src/proposal/deck-studio/deck.test.ts'],{cwd,stdio:'inherit',env:{...process.env,DECK_STUDIO_CANVAS:native,DECK_STUDIO_OUTPUT:target}});
process.exitCode=run.status??1;
