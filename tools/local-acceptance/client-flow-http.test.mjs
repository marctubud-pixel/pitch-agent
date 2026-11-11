import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openEditableProposalStore} from '../auto-layout/editable-proposal.mjs';
import {createLocalAcceptanceServer} from './server.mjs';
test('independent page serves its actual controller module and pause control under the existing local policy',async t=>{
 const root=await mkdtemp(join(tmpdir(),'acceptance-flow-http-'));
 const store=await openEditableProposalStore({databasePath:join(root,'drafts.sqlite'),resourceRoot:join(root,'resources')});
 const app=await createLocalAcceptanceServer({store,rootDir:root});
 t.after(async()=>{if(app.server.listening)await app.close();store.close();await rm(root,{recursive:true,force:true});});
 const base=await app.listen(0),page=await(await fetch(base)).text(),client=await(await fetch(base+'client.js')).text(),response=await fetch(base+'client-flow.mjs');
 assert.match(page,/id="stop-flow" hidden/);assert.match(page,/id="reference-input-controls" hidden/);for(const file of ['reference-input-controller.mjs','reference-input-dom.mjs']){const served=await fetch(base+file);assert.equal(served.status,200);assert.match(served.headers.get('content-type'),/javascript/);assert.equal(served.headers.get('cache-control'),'no-store');}assert.match(client,/mountReferenceInputForm/);assert.match(client,/from '\.\/client-flow\.mjs'/);assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/javascript/);assert.match(await response.text(),/export async function runAcceptanceFlow/);
 assert.match(response.headers.get('content-security-policy'),/connect-src 'self'/);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal((await fetch(base+'not-a-client-module.mjs')).status,404);
});
