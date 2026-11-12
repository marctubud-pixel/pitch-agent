export function inspectSketchGenerationMetadata(project:unknown,id:string,complete?:boolean):unknown;
export function inspectSketchReviewMetadata(project:unknown,id:string):unknown;
export function inspectReviewedArtifactMetadata(project:unknown,id:string):unknown;
export function buildReviewRequest(run:unknown,node:unknown,reports:unknown):unknown;
export function imageTask(project:unknown,generation:unknown,job:unknown,attemptId:string):unknown;
export function sketchTextInput(project:unknown,generation:unknown,job:unknown):unknown;
export function sketchTextRequest(input:unknown):unknown;
export function reviewNodeBinding(run:unknown,node:unknown):unknown;

export function inspectReviewGraphMetadata(project:unknown,id:string):unknown;
export function inspectReviewJobTaskMetadata(project:unknown,runId:string,job:unknown):unknown;

export function inspectSketchUnresolvedMetadata(project:unknown,id:string):unknown;
