import type {CommandMeta, MutationResult} from './models';
export interface CopyDirection {id:string;title:string;slogan:string;supportingCopy:string;creativeExplanation:string;rationale:string;differentiation:string;evidenceIds:string[]}
export interface CopyWorkspace {
 advancement?:{pending:boolean;unrecorded:number;results:string|null};
 projectId:string;revision:number;strategyArtifactId:string|null;strategyHash:string|null;current:boolean;available:boolean;reason:string;
 strategyVerified:boolean;humanConfirmationRequired:boolean;confirmed:boolean;edgeId:string|null;artifactId:string|null;contentHash:string|null;
 title:string;summary:string;directions:CopyDirection[];gaps:string[];queuedJobIds:string[];unknownJobs:string[];
 ownerReports:string[];verification:string|null;creativeReports:Array<{id:string;phase:string;role:string;report:string}>;creativeDecision:string|null;original:string|null;
}
export interface CopyWorkflowService {
 get(id:string):Promise<CopyWorkspace>;
 continue(id:string,input:{artifactId:string},meta:CommandMeta):Promise<MutationResult<CopyWorkspace>>;
 confirm(id:string,input:{artifactId:string;contentHash:string;reason:string},meta:CommandMeta):Promise<MutationResult<CopyWorkspace>>;
 step(id:string,input:{edgeId:string;jobIds:string[]},meta:CommandMeta):Promise<MutationResult<CopyWorkspace>>;
 verify(id:string,input:{artifactId:string},meta:CommandMeta):Promise<MutationResult<CopyWorkspace>>;
 review(id:string,input:{artifactId:string},meta:CommandMeta):Promise<MutationResult<CopyWorkspace>>;
}
