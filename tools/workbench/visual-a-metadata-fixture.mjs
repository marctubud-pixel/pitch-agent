import {createProject} from './project.mjs';
const context={actorType:'agent',actorId:'independent-metadata',runId:'independent-metadata',contextId:'independent-metadata'};
const input={id:'independent-a-boundary',name:'Metadata only, no artwork approval',brief:JSON.stringify({format:'proposal-workbench-brief-v1',fields:{proposalType:'packaging'}}),mode:'auto',humanGates:[],authorizedThrough:'final_review',workflowVersion:'proposal-seven-v1'};
function state(){const p=structuredClone(createProject(input,context));p.activeByStage.copy='copy';p.artifacts=[{id:'copy',stage:'copy',contentHash:'copy-hash'}];p.referenceDossiers=[{id:'d',envelope:{envelopeHash:'d-hash',source:{source:{artifactId:'copy'}}}}];p.jobs=[{id:'ref',purpose:'reference',dossierId:'d',binding:{model:'none'},status:'queued',attempts:[]}];return p;}
const request={commandId:'fixed-step',expectedRevision:0,phase:'references',targetId:'d',sourceHash:'d-hash',jobIds:['ref']};

function executor(advance){return {advanceReferences:advance,referenceStatus:async()=>({status:'working'}),referenceCapability:()=>({}),sketchCapability:()=>({}),sketchReviewCapability:()=>({})};}

export {state,executor,input,context,request};
