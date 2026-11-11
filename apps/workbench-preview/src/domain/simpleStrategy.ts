import type {CommandMeta,MutationResult} from './models';
export const SIMPLE_STRATEGY='proposal-simple-strategy-v1';
export interface StrategyPoint {id:string;text:string;kind:'fact'|'requirement'|'inference'|'assumption';refs:Array<{sourceId:string;location:string;quote:string}>;limitations:string[]}
export interface SimpleStrategyContent {strategyContractVersion:typeof SIMPLE_STRATEGY;strategyBasisHash:string;outputKind:'strategy';status:'complete'|'blocked';title:string;summary:string;strategy:{researchConclusions:StrategyPoint[];intersection:StrategyPoint|null;focus:StrategyPoint|null};gaps:string[];limitations:string[]}
export interface SimpleStrategyWorkspace {projectId:string;revision:number;taskCardId:string;researchArtifactId:string|null;policyVersion:number;producerJobId:string|null;producerStatus:string|null;artifactId:string|null;contentHash:string|null;content:SimpleStrategyContent|null;current:boolean;available:boolean;reason:string;canContinue:boolean;continueReason:string;history:Array<{artifactId:string;contentHash:string}>;verification:null|{id:string;hasBlockingFindings:boolean;report:string};unknownJobs:Array<{jobId:string;purpose:string}>}
export interface SimpleStrategyService {
 get(id:string):Promise<SimpleStrategyWorkspace>;
 continue(id:string,input:{artifactId:string;policyVersion:number},meta:CommandMeta):Promise<MutationResult<SimpleStrategyWorkspace>>;
 verify(id:string,input:{artifactId:string},meta:CommandMeta):Promise<MutationResult<SimpleStrategyWorkspace>>;
 reconcile(id:string,input:{jobId:string},meta:CommandMeta):Promise<MutationResult<SimpleStrategyWorkspace>>;
}
