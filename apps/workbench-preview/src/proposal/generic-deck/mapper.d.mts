import type {ProposalDeckInputV2,Gap,Original,Stage} from './input';
import type {Projection} from './builder';
export type LiteralCoverage={stage:Stage;pointer:string;value:string;visible:boolean;archived:boolean;placement:'body'|'heading'|'target_heading'|'qualifier'|'record';blockIds:string[];sourceSha256:string;byteSpan:{start:number;end:number;token:string}};
type Shared={authority:'none';projection:Projection;coverage:LiteralCoverage[];taskContainer:Original};
export type MissingB=Shared&{kind:'missing_B';input:null;blockers:{code:'MAPPER_B_FINAL_REQUIRED';target:'visual'}[]};
export type Mapped=Shared&{kind:'mapped';input:ProposalDeckInputV2;inputSha256:string;mappingSha256:string;sourceIdentity:unknown;blockers:Gap[]};
export function mapNativeSources(diagnostic:unknown):Promise<MissingB|Mapped>;
export function literalIndex(text:string):{pointer:string;value:string;start:number;end:number;token:string}[];

export function deriveDeckProjection(input:ProposalDeckInputV2):Pick<Mapped,'projection'|'coverage'>;
