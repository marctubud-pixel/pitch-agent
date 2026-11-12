import {lstatSync,realpathSync} from 'node:fs';
import {isAbsolute,resolve} from 'node:path';
import {assertNativeOpenedFileIdentity,assertDurableFinalOperationStore} from './store.mjs';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
const nativeRoot=new URL('./',import.meta.resolve('./store.mjs')).href,ownRoot=new URL('./',import.meta.url).href;
const receiver=import.meta.resolve('./current-copy-source-original-receiver.mjs');
const locals=new Set(['./generic-deck-source-identity.mjs','./generic-deck-native-admission.mjs','./generic-deck-b-original-receiver.mjs']);
const seeds=['./store.mjs','./project.mjs','./final-visual-original.mjs','./current-copy-source-original-receiver.mjs','./generic-deck-b-original-receiver.mjs','./generic-deck-native-admission.mjs','./generic-deck-source-identity.mjs'];
function resolveRelative(specifier,parent){
 if(parent.startsWith(ownRoot)){if(specifier==='./current-copy-source-original-receiver.mjs')return receiver;if(!locals.has(specifier))return new URL(specifier,nativeRoot).href;}
 if(parent===receiver)return new URL(specifier,nativeRoot).href;
 return new URL(specifier,parent).href;
}
async function identity(){
 const pending=seeds.map(s=>import.meta.resolve(s)),records=new Map();
 for(let i=0;i<pending.length;i++){
  const url=pending[i];if(records.has(url))continue;
  const bytes=await readFile(new URL(url));records.set(url,createHash('sha256').update(bytes).digest('hex'));
  if(/\.[cm]?js$/.test(new URL(url).pathname))for(const match of bytes.toString('utf8').matchAll(/\b(?:from\s*|import\s*\(\s*|import\s*)['"](\.[^'"]+)['"]/g))pending.push(resolveRelative(match[1],url));
 }
 return Object.fromEntries([...records].sort(([a],[b])=>a.localeCompare(b)));
}
export const loadedImplementation=Object.freeze(await identity());
export async function requireLoadedImplementation(){if(!isDeepStrictEqual(await identity(),loadedImplementation))throw Object.assign(Error('Loaded native implementation changed; explicit rebase/reload required'),{code:'DECK_IMPLEMENTATION_CHANGED'});return loadedImplementation;}

/** Program-only selection. Never obtain dbPath/pin from an HTTP body or source DTO. */
export function selectDeckDatabase(store,dbPath,pin){
 const fail=code=>{throw Object.assign(Error(code),{code});};
 if(typeof dbPath!=='string'||!isAbsolute(dbPath)||resolve(dbPath)!==dbPath||!pin||Object.keys(pin).sort().join(',')!=='dev,ino'||!Number.isSafeInteger(pin.dev)||pin.dev<0||!Number.isSafeInteger(pin.ino)||pin.ino<=0)fail('DECK_DATABASE_CONFIGURATION_REQUIRED');
 const selection=Object.freeze({dbPath,dev:pin.dev,ino:pin.ino});
 assertDeckDatabase(store,selection);return selection;
}
export function assertDeckDatabase(store,selection){
 assertDurableFinalOperationStore(store,undefined,selection.dbPath);
 assertNativeOpenedFileIdentity(store,selection);
 let path;try{path=lstatSync(selection.dbPath);if(realpathSync(selection.dbPath)!==selection.dbPath)throw Error('canonical path changed');}catch{throw Object.assign(Error('Selected database canonical path changed'),{code:'DECK_DATABASE_PATH_CHANGED'});}
 if(!path.isFile()||path.isSymbolicLink()||path.dev!==selection.dev||path.ino!==selection.ino)throw Object.assign(Error('Selected database fixed path identity changed'),{code:'DECK_DATABASE_PATH_CHANGED'});
 // The final FD assertion follows the pathname inspection; neither alone grants identity.
 assertNativeOpenedFileIdentity(store,selection);
}
