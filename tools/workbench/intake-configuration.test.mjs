import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {loadLaunchSettings,buildLaunchOptions} from './launch-config.mjs';
import {validateIntakeConfiguration} from './intake-pdf.mjs';
test('ordinary launch configuration supplies local PDF runtime and separately configured intake model',async()=>{
 const root=await mkdtemp(join(tmpdir(),'intake-config-')),config={schemaVersion:'workbench-launch-v1',server:{port:4181,dbPath:'db',executionRoot:'executions'},textProviders:{owned:{adapter:'codex-cli',model:'synthetic',binary:'/owned/not-invoked'}},bindings:{intake:{providerId:'owned',model:'synthetic',role:'intake-lead'}},moduleConfigs:{intake:'pdf.json'}};
 await writeFile(join(root,'pdf.json'),JSON.stringify({pythonBinary:'/Users/marc/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3',limits:{pages:25}}));await writeFile(join(root,'deployment.json'),JSON.stringify(config));const settings=await loadLaunchSettings({configPath:join(root,'deployment.json')}),options=buildLaunchOptions(settings);assert.equal(options.intakeConfiguration.limits.pages,25);assert.equal(options.bindings.intake.model,'synthetic');assert.equal(options.providers.owned.model,'synthetic');
 for(const invalid of [{pythonBinary:'python3'},{pythonBinary:'/x',limits:{pages:101}},{pythonBinary:'/x',limits:{timeoutMs:0}},{pythonBinary:'/x',extract:()=>({})},{pythonBinary:'/x',limits:{memoryBytes:Infinity}}])assert.throws(()=>validateIntakeConfiguration(invalid));
});
