import path from 'node:path';
import {mkdir,realpath} from 'node:fs/promises';
import {openEditableProposalStore} from '../auto-layout/editable-proposal.mjs';
import {createLocalAcceptanceServer} from './server.mjs';
import {editorFixture} from './editor-fixture.mjs';
import {openStore} from '../workbench/store.mjs';
import {openLocalAcceptanceCoordinator} from '../workbench/local-acceptance-coordinator.mjs';
import {prepareLocalAcceptanceRuntime} from '../workbench/local-acceptance-runtime.mjs';
const root=path.resolve('.data/local-editor-acceptance');
const store=await openEditableProposalStore({databasePath:path.join(root,'drafts.sqlite'),resourceRoot:path.join(root,'resources')});
try {store.read('editor-engineering');}catch(e){if(e.code!=='DRAFT_NOT_FOUND')throw e;await store.create(editorFixture());}
const pipelineEnabled=process.env.LOCAL_ACCEPTANCE_PIPELINE==='1';
let projectStore,pipeline,configuredModules=[];
if(pipelineEnabled){
  projectStore=openStore(path.join(root,'case-projects.sqlite'));
  const requestedRoot=path.join(root,'case-executions');
  await mkdir(requestedRoot,{recursive:true});
  const executionRoot=await realpath(requestedRoot);
  const runtime=await prepareLocalAcceptanceRuntime({projectStore,executionRoot,includeReferences:process.env.LOCAL_ACCEPTANCE_REFERENCES==='1'});
  configuredModules=['brief',...runtime.configuredModules];
  pipeline=openLocalAcceptanceCoordinator({databasePath:path.join(root,'case-workflow.sqlite'),projectStore,...runtime,editableStore:store,executionRoot});
}
const app=await createLocalAcceptanceServer({store,rootDir:root,documentIds:['editor-engineering'],pipeline});
console.log(JSON.stringify({url:await app.listen(Number(process.env.LOCAL_EDITOR_PORT??4380)),testOnly:true,pipelineConnected:pipelineEnabled,configuredModules,completePipeline:false,root}));
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,async()=>{await app.close();pipeline?.close();projectStore?.close();store.close();process.exit(0);});
