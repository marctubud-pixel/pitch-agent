import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openEditableProposalStore} from '../auto-layout/editable-proposal.mjs';
import {createLocalAcceptanceServer} from './server.mjs';
test('actual isolated HTTP serves reviewed reference renderer under unchanged local CSP',async t=>{
 const root=await mkdtemp(join(tmpdir(),'reference-read-http-')),store=await openEditableProposalStore({databasePath:join(root,'drafts.sqlite'),resourceRoot:join(root,'resources')}),app=await createLocalAcceptanceServer({store,rootDir:root});
 t.after(async()=>{if(app.server.listening)await app.close();store.close();await rm(root,{recursive:true,force:true});});
 const base=await app.listen(0),page=await(await fetch(base)).text(),client=await(await fetch(base+'client.js')).text(),response=await fetch(base+'reference-view-dom.mjs');
 assert.match(page,/id="reference-records" hidden/);assert.match(client,/renderReferenceReadView\(\$\('reference-records'\),flow\)/);assert.equal(response.status,200);assert.match(response.headers.get('content-security-policy'),/connect-src 'self'/);assert.match(response.headers.get('content-type'),/javascript/);assert.equal(response.headers.get('cache-control'),'no-store');assert.match(await response.text(),/root.replaceChildren\(\)/);assert.equal((await fetch(base+'unreviewed-module.mjs')).status,404);
 const mutation=await fetch(base+'api/cases/not-real/reference-materials',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});assert.equal(mutation.status,403);
});
