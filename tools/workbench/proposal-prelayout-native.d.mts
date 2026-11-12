import type {ProgramConfiguration} from './generic-deck-input-mapper.mjs';
declare const currentPrelayout:unique symbol;
export type PrelayoutToken=object&{readonly [currentPrelayout]:true};
export type NativeSourceRequest={projectId:string;expectedRevision:number;taskCardId:string;policyVersion:number;copyArtifactId:string;copyContentHash:string;sourceHash:string;visualArtifactId:string|null;visualContentHash:string|null};
export type PrelayoutExecutionConfiguration=ProgramConfiguration&Readonly<{binding?:{providerId:string;model:string;role:'proposal-director'};provider?:{adapter:'workbench-model-http-v1';model:string;operatorConfig:object;environment?:Record<string,string>};executionAllowed?:boolean;prelayoutExecutionAllowed?:boolean}>;
export function createProposalPrelayoutNative(configuration:PrelayoutExecutionConfiguration):{
 capability():{executionAllowed:boolean;configured:boolean;semanticApproval:false;humanApproval:false;customerApproval:false};
 inspect(request:NativeSourceRequest):Promise<unknown>;
 captureCheck(request:NativeSourceRequest):Promise<{kind:'ready';token:PrelayoutToken}|{kind:'blocked';status:string;authority:'none'}>;
 consumeCheck(token:PrelayoutToken):Promise<{prelayoutCheck:{identity:string;originalText:string;sha256:string;bytes:number};sourceTuple:unknown;baseInputSha256:string;baseProjectionSha256:string;observedSnapshot:{revision:number;snapshotHash:string};original:{jobId:string;attemptId:string;requestHash:string;receiptHash:string};semanticApproval:false;humanApproval:false;customerApproval:false}>;
 prepare(request:{commandId:string;nativeRequest:NativeSourceRequest}):Promise<unknown>;
 execute(request:{projectId:string;jobId:string;commandId:string;expectedRevision:number}):Promise<unknown>;
 reconcileOriginal(request:{projectId:string;jobId:string;attemptId:string;commandId:string;expectedRevision:number}):Promise<unknown>;
 close():void;
};
/** Partial original IO fact only. Does not grant native current-source or layout authority. */
export function verifyProposalPrelayoutReportOriginal(project:unknown,job:unknown,options:{executionRoot:string;imageStore?:unknown}):Promise<unknown>;
