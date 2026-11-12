import type {CommandMeta, MutationResult} from './models';
export type VisualPhase = 'references'|'sketch'|'sketch_review';
export interface VisualTarget {phase:VisualPhase;targetId:string;sourceHash:string}
export interface VisualImage {imageId:string;sha256:string;mediaType:'image/png'|'image/jpeg';width:number;height:number;byteLength:number}
export interface VisualWorkspace {
 advancePending:boolean;unrecordedAdvances:number;advanceResults:string|null;
 projectId:string;revision:number;copyArtifactId:string|null;current:boolean;available:boolean;
 storage:{imageUpload:boolean;referenceMaterials:boolean};
 target:VisualTarget|null;queuedJobIds:string[];unknownJobs:string[];runningJobs:string[];progress:{referenceReports:number;referencePlanned:number|null;sketchImages:number;sketchPlanned:number|null;reviewReports:number;reviewPlanned:number|null};images:VisualImage[];
 directions:Array<{id:string;title:string}>;referenceStatus:string;referenceChoiceAppSupported:boolean;sketchAppSupported:boolean;referenceStateOriginal:string|null;selectionHash:string|null;
 dossierId:string|null;generationId:string|null;generationHash:string|null;reports:Array<{title:string;body:string}>;
 choice:{catalogHash:string;pending:boolean;editionHash:string|null;directions:Array<{directionId:string;uses:Array<{id:string;imageId:string;kind:string;note:string;disabled:boolean}>}>}|null;
 materials:Array<{imageId:string;directionId:string;borrowingNote:string}>;
}
export type VisualAction =
 | {route:'copy-continuations';input:{artifactId:string;discoveryMode:'manual_supplied'}}
 | {route:'reference-materials';input:{artifactId:string;imageId:string;directionId:string;kind:'direction'|'component';applicabilityProfile:'direction'|'material_color_component'|'style_component'|'composition_component'|'viewpoint_scene_component'|'carrier_component';borrowingNote:string}}
 | {route:'visual-workflow/step';input:VisualTarget&{jobIds:string[]}}
 | {route:'reference-adoptions';input:{dossierId:string;selectionHash:string;reason:string}}
 | {route:'reference-choices';input:{dossierId:string;action:'adopt';editionHash:string;reason:string}}
 | {route:'reference-choices';input:{dossierId:string;action:'propose';catalogHash:string;selection:Array<{directionId:string;mainUseId:string;complementUseIds:string[];backupUseIds:string[]}>;reason:string}}
 | {route:'sketch-continuations';input:{dossierId:string;selectionHash:string}}
 | {route:'sketch-review-continuations';input:{generationId:string;sourceHash:string}}
 | {route:'sketch-adoptions';input:{artifactId:string;contentHash:string;runId:string;reason:string}};
export interface VisualAService {
 get(id:string):Promise<VisualWorkspace>;
 act(id:string,action:VisualAction,meta:CommandMeta):Promise<MutationResult<VisualWorkspace>>;
 upload(id:string,file:File,description:string,meta:CommandMeta):Promise<MutationResult<VisualImage>>;
 image(id:string,image:VisualImage):Promise<Blob>;
 pending():boolean;
 retry():Promise<void>;
}
