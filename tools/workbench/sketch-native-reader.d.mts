export interface NativeSourceIdentity {
 taskCardId:string;taskHash:string;policyHash:string;copyArtifactId:string;copyContentHash:string;
 copyProducer:{jobId:string|null;attemptId:string|null;bindingHash:string|null;authorHash:string|null;receiptHash:string|null};
 dossierId:string;envelopeHash:string;selectionHash:string;generationId:string;sourceHash:string;planHash:string|null;runId:string|null;packetHash:string|null;graphHash:string|null;bindingsHash:string;
}
export interface NativeMethodIdentity {path:string;version:string;sha256:string;carrier:'packaging'|'kv';appendices:Array<{path:string;sha256:string}>}
export interface NativeImageRead {imageId:string;sha256:string;mediaType:string;byteLength:number;width:number;height:number;verifier:string}
export interface NativeReadCoverage {
 images:NativeImageRead[];
 source:null|{verifier:string;status:'started'|'failed_partial'|'complete';sketchOriginalFacts?:Array<{kind:string;jobId:string;attemptId:string;outputVersionId:string;receiptHash:string;originalHash:string;dependencyHash:string}>;reviewOriginalFacts?:null|{runId:string;reports:Array<{reportId:string;nodeKey:string;jobId:string;attemptId:string;receiptHash:string;valid:boolean;rawHash:string;inputHash:string}>;dependenciesHash:string;imageOccurrencesHash:string};ordinaryHTTPAttempts?:Array<{jobId:string;attemptId:string;receiptHash:string}>;reviewPacketHash?:string|null;ordinaryScope?:string;referenceScope?:string;physicalAllFilesClaimed?:false};
}
interface Common {
 protocolVersion:'sketch-native-source-read-v2';projectId:string;revision:number;expectedRevision:number;snapshotSha256:string;snapshotHashEncoding:string;
 semantic:Record<string,unknown>|null;diagnostic:{code:string;message:string}|null;coverage:NativeReadCoverage;historyReadability:'not_established';writeEligible:false;appCapabilityGranted:false;physicalIOVerified:false;
 unresolvedRead?:unknown;
 admission:{snapshotHash:string;readAttempts:number;fetchedSnapshots:number;reservedDecodedBytes:number;reservedStoredBytes:number;physicalIo:'unmeasured';jsObjectMemory:'unmeasured'};
}
export type NativeSketchSourceRead = Common & (
 |{kind:'unsupported';identity:NativeSourceIdentity|null;method:NativeMethodIdentity|null;methodOrigin:null|{commandId:string;nativeCommandId:string;requestHash:string;methodHash:string};reason:string;currentQualification:{status:'unsupported';reason:string}}
 |{kind:'unresolved';identity:NativeSourceIdentity;method:NativeMethodIdentity;methodOrigin:{commandId:string;nativeCommandId:string;requestHash:string;methodHash:string};reason:'SKETCH_UNRESOLVED';currentQualification:{status:'stopped_unresolved';reason:string}}
 |{kind:'native_source_qualified';identity:NativeSourceIdentity;method:NativeMethodIdentity;methodOrigin:{commandId:string;nativeCommandId:string;requestHash:string;methodHash:string};reason:null;currentQualification:{status:'passed_original_native_guards'}}
);
export const SKETCH_SOURCE_READ_LIMITS:Readonly<{readAttempts:number;snapshotBytes:number;decodedBytes:number;storedBytes:number}>;
export function createSketchNativeReader(options:{store:unknown;rootDir:string}):Readonly<{inspect(projectId:string,request:{expectedRevision:number;generationId:string;runId?:string}):Promise<NativeSketchSourceRead>;envelope(project:unknown):Promise<unknown>}>;
