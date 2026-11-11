import {resolveLocalFixtureProfile} from './local-fixture-profile.mjs';
import {localContributionBindings,localContributionResponse} from './local-contribution-response.mjs';
import {prepareLocalReferenceResponseContract} from './local-reference-engineering-contract.mjs';
import {createExecutor} from './executor.mjs';
import {prepareLocalResearchConfiguration,createLocalSyntheticProviders,createLocalResearchDrivers} from './local-research-drivers.mjs';
import {localCopyConfiguration,localCopyResponse,createLocalCopyDriver} from './local-acceptance-copy-driver.mjs';
import {realpath} from 'node:fs/promises';
import {createImageEvidenceStore} from './image-evidence.mjs';
import {loadLocalAcceptanceAssetCatalogue} from '../local-acceptance/asset-catalogue.mjs';
import {localReferenceConfiguration,createLocalReferenceDriver} from './local-acceptance-reference-driver.mjs';
import {localSketchConfiguration,localSketchResponse,createLocalSketchDriver} from './local-acceptance-sketch-driver.mjs';
import {localFinalVisualConfiguration,localFinalVisualResponse,createLocalFinalVisualDriver} from './local-acceptance-final-visual-driver.mjs';
import {localContentConfiguration,localContentResponse,createLocalContentDriver} from './local-acceptance-content-driver.mjs';
import {loadImageProvider} from './image-api-provider.mjs';
import {localSyntheticImageConfig} from '../local-acceptance/synthetic-image-server.mjs';
import {join} from 'node:path';

export function mergeLocalCalibrations(...groups) {
  const profiles=new Map();
  for(const group of groups)for(const profile of group){
    const identity=['protocolVersion','stage','role','providerId','model'];
    if(!identity.every(k=>typeof profile[k]==='string'&&profile[k]))throw Object.assign(Error('LOCAL_CALIBRATION_IDENTITY_REQUIRED'),{code:'LOCAL_CALIBRATION_IDENTITY_REQUIRED'});
    profiles.set(JSON.stringify(identity.map(k=>profile[k])),profile);
  }
  return [...profiles.values()];
}

export async function prepareLocalAcceptanceRuntime({projectStore,executionRoot,calls=[],includeReferences=false,includeCreative=false,localImageService,referenceResponseContract,referenceResponseAttemptRoot=executionRoot,fixtureProfile,caseIdForProject}) {
  if(typeof includeReferences!=='boolean')throw Object.assign(Error('LOCAL_REFERENCE_FLAG_INVALID'),{code:'LOCAL_REFERENCE_FLAG_INVALID'});
  if(typeof includeCreative!=='boolean')throw Object.assign(Error('LOCAL_CREATIVE_FLAG_INVALID'),{code:'LOCAL_CREATIVE_FLAG_INVALID'});
  if(includeCreative&&!includeReferences)throw Object.assign(Error('LOCAL_CREATIVE_REFERENCES_REQUIRED'),{code:'LOCAL_CREATIVE_REFERENCES_REQUIRED'});
  let imageProvider;
  if(includeCreative){
    if(typeof localImageService?.token!=='string'||!/^[A-Za-z0-9_-]{24,128}$/.test(localImageService.token))throw Object.assign(Error('LOCAL_CREATIVE_IMAGE_SERVICE_REQUIRED'),{code:'LOCAL_CREATIVE_IMAGE_SERVICE_REQUIRED'});
    const config=localSyntheticImageConfig({baseUrl:localImageService.baseUrl});
    const token=localImageService.token;
    imageProvider=loadImageProvider({config,allowLoopbackHttp:true,resolveCredential:()=>token});
    if(!imageProvider.capability().invocationSupported)throw Object.assign(Error('LOCAL_CREATIVE_IMAGE_SERVICE_INVALID'),{code:'LOCAL_CREATIVE_IMAGE_SERVICE_INVALID'});
  }
  if(includeReferences&&await realpath(executionRoot)!==executionRoot)throw Object.assign(Error('LOCAL_REFERENCE_CANONICAL_ROOT_REQUIRED'),{code:'LOCAL_REFERENCE_CANONICAL_ROOT_REQUIRED'});
  if(referenceResponseContract!==undefined&&!includeReferences)throw Object.assign(Error('LOCAL_REFERENCE_ENGINEERING_REFERENCES_REQUIRED'),{code:'LOCAL_REFERENCE_ENGINEERING_REFERENCES_REQUIRED'});
  const referenceResponse=await prepareLocalReferenceResponseContract({projectStore,executionRoot,attemptRoot:referenceResponseAttemptRoot,selection:referenceResponseContract});
  const research=await prepareLocalResearchConfiguration({projectStore,executionRoot});
  const copy=await localCopyConfiguration({executionRoot});
  const assetCatalogue=includeReferences?await loadLocalAcceptanceAssetCatalogue():null;
  const references=includeReferences?await localReferenceConfiguration({executionRoot,assetCatalogue}):null;
  const sketch=includeCreative?localSketchConfiguration({referenceBinding:copy.configuration.referenceBinding}):null;
  const visual=includeCreative?localFinalVisualConfiguration():null;
  const content=includeCreative?localContentConfiguration({strategyBinding:research.bindings.strategy,copyBinding:copy.bindings.copy}):null;
  const imageStore=includeReferences?createImageEvidenceStore({rootDir:join(executionRoot,'images')}):undefined;
  const bindings={...localContributionBindings,...research.bindings,...copy.bindings,...references?.bindings,...sketch?.bindings,...visual?.bindings,...content?.bindings};
  // Select the copy graph's shared strategy profile before any case is dispatched.
  const creativeCalibrations=mergeLocalCalibrations(research.creativeCalibrations,copy.creativeCalibrations);
  const fixture=resolveLocalFixtureProfile({fixtureProfile,caseIdForProject,legacyHandlers:[localContributionResponse,localCopyResponse,...(includeReferences?[referenceResponse.response]:[]),...(includeCreative?[localSketchResponse,localFinalVisualResponse,localContentResponse]:[])]});
  const providers=createLocalSyntheticProviders({projectStore,executionRoot,calls,handlers:fixture.handlers});
  const executor=createExecutor({store:projectStore,rootDir:executionRoot,bindings,providers,creativeCalibrations,semanticLease:research.semanticLease,...(includeReferences?{imageStore,referenceConfiguration:references.referenceConfiguration,referenceLibrary:references.referenceLibrary}:{}),...(includeCreative?{imageProvider,sketchConfiguration:sketch.sketchConfiguration,sketchReviewConfiguration:sketch.sketchReviewConfiguration,finalVisualConfiguration:visual.finalVisualConfiguration,contentConfiguration:content.contentConfiguration}:{})});
  const drivers={...createLocalResearchDrivers({projectStore,executor,executionRoot,copyBinding:bindings.copy}),copy:createLocalCopyDriver({projectStore,executor,executionRoot,configuration:copy.configuration})};
  if(includeReferences)drivers.references=createLocalReferenceDriver({projectStore,executor,imageStore,executionRoot,assetCatalogue,configuration:references});
  if(includeCreative){
    drivers.sketch=createLocalSketchDriver({projectStore,executor});
    drivers.visual=createLocalFinalVisualDriver({projectStore,executor,executionRoot,imageProvider,configuration:visual});
    drivers.content=createLocalContentDriver({projectStore,executor,configuration:content});
  }
  return {executor,drivers,imageStore,initializeCase:referenceResponse.registerProject?({registration})=>referenceResponse.registerProject(registration):undefined,referenceResponseRegistrationForProject:referenceResponse.registrationForProject,referenceResponseContract:referenceResponse.descriptor,referenceLibraries:references?{[references.referenceLibrary.catalogueDigest]:references.referenceLibraryFile}:{},deliveryBindings:{strategy:bindings.copy,copy:copy.configuration.referenceBinding},syntheticOnly:true,configuredModules:['research','strategy','copy',...(includeReferences?['references']:[]),...(includeCreative?['sketch','visual','content']:[])]};
}
