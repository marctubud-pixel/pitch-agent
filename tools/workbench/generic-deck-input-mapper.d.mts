import type {Mapped,MissingB} from '../../apps/workbench-preview/src/proposal/generic-deck/mapper.mjs';
declare const qualifiedToken:unique symbol;
export type QualifiedInputToken=object&{readonly [qualifiedToken]:true};
export type ProgramConfiguration=Readonly<{store:object;dbPath:string;pin:Readonly<{dev:number;ino:number}>;executionRoot:string;imageRoot:string;consumerBinding:Readonly<{providerId:string;model:string;role:'references-lead'}>}>;
export type QualifiedMapped=Mapped&{prelayout:{status:string;sourceTuple?:unknown;original?:unknown}};
export function createQualifiedInputMapper(configuration:ProgramConfiguration):{
 capture(request:unknown):Promise<{kind:'mapped';token:QualifiedInputToken;diagnostic:QualifiedMapped}|{kind:'rejected';mapping:MissingB}>;
 consume(token:QualifiedInputToken):Promise<QualifiedMapped&{bytes:ReadonlyMap<string,Uint8Array>;qualification:{physicalOriginalsVerified:true;layoutAdmission:'prelayout_not_checked'|'prelayout_original_checked';semanticApproval:false;humanApproval:false;customerApproval:false;scope:string}}>;
 close():void;
};
