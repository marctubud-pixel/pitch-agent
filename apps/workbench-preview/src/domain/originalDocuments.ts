import type {CommandMeta,MutationResult} from './models';
export type PdfTextStatus='text_extracted'|'partial'|'no_text'|'password_required'|'invalid'|'limit_exceeded'|'failed';
export interface OriginalDocumentState {projectId:string;revision:number;documentId:string;taskCardId:string;taskCardHash:string;current:boolean;available:boolean;unavailableReason:string|null;capabilityDiagnostic:string|null;jobStatus:string;result:null|{status:PdfTextStatus;pages:Array<{number:number;text:string}>;diagnostics:string[];identity:string}}
export interface OriginalDocumentsService {
 get(projectId:string,resourceId:string):Promise<OriginalDocumentState>;
 extract(projectId:string,input:{documentId:string;taskCardId:string;taskCardHash:string;action:'extract'|'retry_local'},meta:CommandMeta):Promise<MutationResult<OriginalDocumentState>>;
}
