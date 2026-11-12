import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,statSync,realpathSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {openStore} from '../store.mjs';import {createQualifiedInputMapper} from '../generic-deck-input-mapper.mjs';import {componentFixture} from './mapper-fixture.mjs';
test('only own native private token can map; plain successful-looking DTO or copied token cannot qualify',async()=>{
 if(process.platform!=='darwin'){const root=realpathSync(mkdtempSync(join(tmpdir(),'qualified-mapper-platform-')));assert.throws(()=>openStore(join(root,'unsupported'),{openedFileProof:true}),{code:'STORE_OPENED_FILE_UNSUPPORTED'});return;}
 const {diagnostic}=await componentFixture(),root=realpathSync(mkdtempSync(join(tmpdir(),'qualified-mapper-'))),file=join(root,'db');writeFileSync(file,'');const s=statSync(file),pin={dev:s.dev,ino:s.ino},store=openStore(file,{openedFileProof:true});
 try{const config={store,dbPath:file,pin,executionRoot:root,imageRoot:join(root,'images'),consumerBinding:{providerId:'own-reader',model:'read-only',role:'references-lead'}},mapper=createQualifiedInputMapper(config);
  await assert.rejects(mapper.capture(diagnostic),{code:'DECK_ADMISSION_REQUEST_INVALID'});
  await assert.rejects(mapper.capture({protocol:'native-deck-sources-capability-v3',id:'copied'}),{code:'DECK_ADMISSION_REQUEST_INVALID'});
  await assert.rejects(mapper.consume({protocol:'qualified-deck-input-v1',id:'copied'}),{code:'MAPPER_QUALIFIED_TOKEN_REQUIRED'});
  assert.throws(()=>createQualifiedInputMapper({...config,receiver:{assertCurrent:async()=>diagnostic}}),{code:'DECK_ADMISSION_CONFIGURATION_INVALID'});
  assert.throws(()=>createQualifiedInputMapper({...config,valid:true}),{code:'DECK_ADMISSION_CONFIGURATION_INVALID'});
  mapper.close();await assert.rejects(mapper.capture(diagnostic),{code:'MAPPER_CLOSED'});
 }finally{store.close();}
});
