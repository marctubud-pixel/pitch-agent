import {localFixtureProfileOf,localFixtureIdentityFor} from './local-fixture-descriptor.mjs';
import {requireLocalFixtureAdmission} from './local-fixture-session.mjs';
import {prepareLocalReferencePoolRuntime} from './local-reference-pool-runtime.mjs';
import {referenceRuntimeProfileOf,LOCAL_REFERENCE_POOL_RUNTIME} from './local-reference-runtime-profile.mjs';
import {realpath} from 'node:fs/promises';
import {join} from 'node:path';
import {prepareLocalAcceptanceRuntime} from './local-acceptance-runtime.mjs';
import {openLocalAcceptanceCoordinator,ACCEPTANCE_MODULES,assertLocalFixtureWorkflowProfile} from './local-acceptance-coordinator.mjs';
import {LOCAL_REFERENCE_ENGINEERING_CONTRACT} from './local-reference-engineering-contract.mjs';
import {createLazyLocalLayoutController} from './local-lazy-layout-controller.mjs';
import {localLayoutToolStatus} from './local-layout-resource-bridge.mjs';
import {createFinalReviewReader} from './final-review-reader.mjs';
import {createLocalEngineeringPanel} from './local-engineering-panel.mjs';
import {createEngineeringEditorBridge} from './local-engineering-editor-bridge.mjs';
const need=(value,code)=>{if(!value)throw Object.assign(Error(code),{code});};

export async function openCompleteLocalAcceptance(options={}){
 need(Object.keys(options).every(k=>['databasePath','projectStore','editableStore','executionRoot','editableResourceRoot','localImageService','tools','fontRecords','calls','referenceRuntimeProfile','fixtureProfile','fixtureAdmission'].includes(k)),'LOCAL_COMPLETE_OPTION_INVALID');
 const referenceRuntimeProfile=referenceRuntimeProfileOf(options.referenceRuntimeProfile);
 const fixtureProfile=localFixtureProfileOf(options.fixtureProfile),fixtureIdentity=await localFixtureIdentityFor(fixtureProfile);
 need((fixtureIdentity!==undefined)===(options.fixtureAdmission!==undefined),'LOCAL_FIXTURE_ADMISSION_REQUIRED');
 const {databasePath,projectStore,editableStore,executionRoot,editableResourceRoot,localImageService,tools,fontRecords,calls=[]}=options;
 need(typeof executionRoot==='string'&&await realpath(executionRoot)===executionRoot&&typeof editableResourceRoot==='string'&&await realpath(editableResourceRoot)===editableResourceRoot,'LOCAL_COMPLETE_CANONICAL_ROOT_REQUIRED');
 need(typeof databasePath==='string'&&typeof projectStore?.list==='function'&&typeof projectStore?.read==='function','LOCAL_COMPLETE_STORE_REQUIRED');
 if(fixtureIdentity)requireLocalFixtureAdmission(options.fixtureAdmission,{...options,fixtureIdentity});
 assertLocalFixtureWorkflowProfile({databasePath,projectStore,fixtureIdentity});
 const toolStatus=await localLayoutToolStatus(tools);
 need(toolStatus.status==='configured','LOCAL_COMPLETE_NATIVE_TOOLS_REQUIRED');
 need(Array.isArray(fontRecords)&&fontRecords.length>0,'LOCAL_COMPLETE_FONT_RECORDS_REQUIRED');
 let pipeline;
 const caseIdForProject=projectId=>{need(pipeline,'LOCAL_COMPLETE_CASE_REGISTRY_UNAVAILABLE');const record=pipeline.caseRegistrationForProject(projectId);need(record.initializationState==='ready','LOCAL_COMPLETE_CASE_INITIALIZATION_PENDING');return record.caseId;};
 const runtime=await (referenceRuntimeProfile===LOCAL_REFERENCE_POOL_RUNTIME?prepareLocalReferencePoolRuntime:prepareLocalAcceptanceRuntime)({projectStore,executionRoot,calls,includeReferences:true,includeCreative:true,localImageService,referenceResponseContract:{version:LOCAL_REFERENCE_ENGINEERING_CONTRACT,projectIds:[],registrationMode:'acceptance-case-initializer'},...(fixtureIdentity?{fixtureProfile,caseIdForProject}:{})});
 const layout=await createLazyLocalLayoutController({projectStore,executor:runtime.executor,imageStore:runtime.imageStore,executionRoot,tools:toolStatus.paths,fontRecords,caseIdForProject});
 const reader=createFinalReviewReader({store:projectStore,root:executionRoot,content:layout.executor,imageStore:runtime.imageStore,pythonBinary:toolStatus.paths.python,providerRoot:join(executionRoot,'provider'),referenceLibraries:runtime.referenceLibraries});
 const engineeringPanel=createLocalEngineeringPanel({reader,store:projectStore,executionRoot});
 const editorBridge=createEngineeringEditorBridge({editableStore,executionRoot,editableResourceRoot,pythonBinary:toolStatus.paths.python});
 pipeline=openLocalAcceptanceCoordinator({databasePath,projectStore,executor:layout.executor,drivers:{...runtime.drivers,layout:layout.driver},engineeringPanel,editorBridge,editableStore,executionRoot,imageStore:runtime.imageStore,deliveryBindings:runtime.deliveryBindings,caseInitializer:runtime.initializeCase,contributionExecution:true,referenceRuntimeProfile,...(fixtureIdentity?{fixtureIdentity}:{})});
 return {pipeline,referenceRuntimeProfile,...(fixtureIdentity?{fixtureIdentity}:{}),declaredModules:ACCEPTANCE_MODULES.slice(),syntheticOnly:true,realQualityVerified:false,productionFinalAuthority:false,wholeChainVerified:false};
}
