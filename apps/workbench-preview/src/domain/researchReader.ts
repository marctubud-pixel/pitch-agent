import type {CommandMeta, MutationResult} from './models';
export interface ReaderQuestion {id:string; question:string; critical:boolean}
export interface ReaderPlan {id:string; taskCardId:string; questions:ReaderQuestion[]; readerCount:1|2; registrationHash:string}
export type ReaderDispositionAction='revised'|'clarified'|'narrowed'|'withdrawn'|'unresolved';
export interface ReaderDisposition {issueId:string;action:ReaderDispositionAction;response:string;locations:Array<{location:string;quote:string}>}
export interface ReaderExcerpt {location:string;quote:string;label:string}
export interface ReaderState {recheckAvailable:boolean; revisionJobs:Array<{id:string;status:string;artifactId:string}>; dispositions:Array<{id:string;artifactId:string;previousReportId:string;seat:number;registrationId:string;items:ReaderDisposition[]}>;projectId:string; revision:number; confirmed:boolean; plan:ReaderPlan|null; artifactId:string|null; canRead:boolean; configured:boolean; jobs:Array<{id:string; seat:number; status:string;phase:'first_read'|'recheck'}>; reports:Array<{id:string; artifactId:string; contentHash:string; reportHash:string; seat:number;registrationId?:string;phase?:'first_read'|'recheck';consumedDispositionId?:string|null;consumedPreviousReportId?:string|null}>}
export interface ReaderReport {phase:'first_read'|'recheck';issues:Array<{id:string;detail:string;severity:string}>;id:string; current:boolean; understandingComplete:boolean; parts:Array<{heading:string; text:string; locations:Array<{location:string;quote:string}>}>; limitations:string[]}
export interface ResearchReaderService {
 revise(projectId:string,artifactId:string,meta:CommandMeta):Promise<MutationResult<ReaderState>>;
 dispose(projectId:string,input:{artifactId:string;previousReportId:string;dispositions:ReaderDisposition[]},meta:CommandMeta):Promise<MutationResult<ReaderState>>;
 excerpts(projectId:string,artifactId:string):Promise<ReaderExcerpt[]>;
 get(projectId:string):Promise<ReaderState>;
 report(projectId:string,reportId:string):Promise<ReaderReport>;
 register(projectId:string,input:{questions:ReaderQuestion[];readerCount:1|2},meta:CommandMeta):Promise<MutationResult<ReaderState>>;
 start(projectId:string,input:{artifactId:string;registrationId:string;seat:number;previousReportId?:string;dispositionId?:string},meta:CommandMeta):Promise<MutationResult<ReaderState>>;
 reconcile(projectId:string,jobId:string,meta:CommandMeta):Promise<MutationResult<ReaderState>>;
}

export interface ReaderDispositionHistoryEntry {record:ReaderState['dispositions'][number];kind:'response'|'consumed';historical:boolean}
export function readerDispositionHistory(data:ReaderState,reportId:string):ReaderDispositionHistoryEntry[]{
 const report=data.reports.find(r=>r.id===reportId);if(!report)return [];
 return data.dispositions.flatMap<ReaderDispositionHistoryEntry>(record=>{
  if(record.seat!==report.seat||record.registrationId!==report.registrationId)return [];
  const historical=record.artifactId!==data.artifactId;
  if(record.previousReportId===report.id)return [{record,kind:'response',historical} satisfies ReaderDispositionHistoryEntry];
  if(report.phase==='recheck'&&record.id===report.consumedDispositionId&&record.previousReportId===report.consumedPreviousReportId&&record.artifactId===report.artifactId)return [{record,kind:'consumed',historical} satisfies ReaderDispositionHistoryEntry];
  return [];
 });
}
