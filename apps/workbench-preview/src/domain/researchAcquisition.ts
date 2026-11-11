import type {CommandMeta,MutationResult} from './models';
export const ACQUISITION_BRANCHES=['professional_reports','brand_product','same_purpose_competitors','users_scenes'] as const;
export type AcquisitionBranch=typeof ACQUISITION_BRANCHES[number];
export interface AcquisitionTarget {taskCardId:string;taskCardHash:string}
export interface AcquisitionState extends AcquisitionTarget {
 materialsRootShared:boolean;projectId:string;revision:number;confirmed:boolean;registered:boolean;available:boolean;reason:string;
 generationTarget:AcquisitionTarget|null;generationId:string|null;current:boolean;state:string;originalsVerified:boolean|null;
 frozenSourceIds:string[];frozenMaterialIds:string[];
 queuedJobIds:string[];jobs:Array<{id:string;status:string}>;
 branches:Array<{kind:AcquisitionBranch;status:string;coverageSummary:{usableExcerpts:number;independentOrigins:number}|null;coverage:string}>;
 producerJobId:string|null;producerStatus:string|null;limitations:string[];coverage:string;
 sources:Array<{id:string;title:string}>;materials:Array<{id:string;title:string;eligible:boolean;reason:string}>;
 reconciliation:Array<{jobId:string}>;
}
export interface ResearchAcquisitionService {
 get(projectId:string):Promise<AcquisitionState>;
 start(projectId:string,input:AcquisitionTarget&{sourceEntryIds:string[];materialIds:string[]},meta:CommandMeta):Promise<MutationResult<AcquisitionState>>;
 step(projectId:string,input:AcquisitionTarget&{generationId:string;jobIds:string[]},meta:CommandMeta):Promise<MutationResult<AcquisitionState>>;
 reconcile(projectId:string,input:AcquisitionTarget&{generationId:string;jobId:string},meta:CommandMeta):Promise<MutationResult<AcquisitionState>>;
}
