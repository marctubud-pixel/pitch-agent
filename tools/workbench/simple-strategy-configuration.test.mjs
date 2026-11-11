import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {loadLaunchSettings,buildLaunchOptions} from './launch-config.mjs';
import {host} from './simple-strategy-http-fixture.mjs';
test('configured creation endpoint maps explicitly, defaults research and rejects undefined endpoints',async t=>{const root=await mkdtemp(join(tmpdir(),'simple-config-'));t.after(()=>rm(root,{recursive:true,force:true}));const file=join(root,'config.json'),base={schemaVersion:'workbench-launch-v1',server:{port:4182,dbPath:'db',executionRoot:'originals'},textProviders:{},bindings:{}};
 for(const endpoint of [undefined,'final_review']){await writeFile(file,JSON.stringify({...base,server:{...base.server,...(endpoint?{creationAuthorizedThrough:endpoint}:{})}}));assert.equal(buildLaunchOptions(await loadLaunchSettings({configPath:file})).creationAuthorizedThrough,endpoint??'research');}
 await writeFile(file,JSON.stringify({...base,server:{...base.server,creationAuthorizedThrough:'approved'}}));await assert.rejects(loadLaunchSettings({configPath:file}));
});
test('actual creation replay binds original server authorization and public fields stay closed',async t=>{const root=await mkdtemp(join(tmpdir(),'simple-create-'));t.after(()=>rm(root,{recursive:true,force:true}));const dbPath=join(root,'db'),body={name:'Explicit new engineering',brief:'Synthetic only',commandId:'create'};const first=await host({dbPath,creationAuthorizedThrough:'final_review'});const created=await first.request('/api/v1/projects',body);assert.equal(created.status,201);assert.equal(created.body.project.policies[0].authorizedThrough,'final_review');assert.equal((await first.request('/api/v1/projects',body)).status,200);await first.close();const next=await host({dbPath});t.after(()=>next.close());const replay=await next.request('/api/v1/projects',body);assert.equal(replay.status,409);assert.equal(replay.body.error.code,'COMMAND_ID_REUSED');});
