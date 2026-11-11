import {describe,it,expect} from 'vitest';
import type {SourceInput} from '../../domain/models';
import {HttpWorkbenchService} from './HttpWorkbenchService';
const source={id:'registered-one',taskCardId:'card',title:'Provided text',publisher:'Named publisher',url:'',excerpt:'Original text',intendedUse:'audience',verificationStatus:'unverified',createdAt:'synthetic-time',addedBy:'synthetic-user'};
const raw=()=>({project:{id:'p',name:'Synthetic',revision:1,activeTaskCardId:'card',taskCards:[{id:'card',brief:'Synthetic brief'}],sourceEntries:[source],jobs:[],artifacts:[],sourceCaptures:[],audit:[],processedCommands:{}},view:{policy:{mode:'assisted',humanGates:[],authorizedThrough:'research'},stages:[]}});
describe('original source interface wires real service records without changing UI',()=>{
 it('saves blank URL as unverified supplied text and returns the actual persisted identity',async()=>{
  let sent:unknown;
  const service=new HttpWorkbenchService({baseUrl:'/api',fetchImpl:async(_url,init)=>{if(init?.method==='GET')return Response.json(raw());sent=JSON.parse(String(init?.body));return Response.json({...raw(),sourceId:source.id});}});
  const input:SourceInput={title:source.title,publisher:source.publisher,url:'',excerpt:source.excerpt,intendedUse:'audience',attachToClaimId:null};
  const meta={commandId:'save-one',expectedRevision:1};const result=await service.addSource('p',input,meta);
  expect(sent).toEqual({...input,...meta});expect(result.data).toMatchObject({id:source.id,url:'',verificationStatus:'unverified',intendedUse:'audience',excerpt:source.excerpt});
 });
 it('freezes registered IDs across a lost mutation response and newer source inventory',async()=>{
  const bodies:string[]=[];let reads=0;
  const service=new HttpWorkbenchService({baseUrl:'/api',fetchImpl:async(_url,init)=>{
   const current=raw();
   if(init?.method==='GET'){if(reads++>0)current.project.sourceEntries.push({...source,id:'later-source'});return Response.json(current);}
   bodies.push(String(init?.body));if(bodies.length===1)throw new TypeError('Synthetic response loss');
   return Response.json({...current,jobId:'job-one',project:{...current.project,revision:2,jobs:[{id:'job-one',stage:'research',status:'queued',attempts:[],outputVersionIds:[]}]}});
  }});
  const meta={commandId:'research-one',expectedRevision:1};await expect(service.generateResearch('p',meta)).rejects.toMatchObject({outcomeUnknown:true});
  expect((await service.generateResearch('p',meta)).data).toMatchObject({id:'job-one',simulated:false});
  expect(bodies[0]).toBe(bodies[1]);expect(JSON.parse(bodies[0])).toEqual({stage:'research',sourceEntryIds:[source.id],...meta});
 });
 it('refuses old-card automatic adoption and enriches optimistic conflicts',async()=>{
  const old=raw();old.project.sourceEntries[0]={...source,taskCardId:'old'};
  const service=new HttpWorkbenchService({baseUrl:'/api',fetchImpl:async()=>Response.json(old)});
  await expect(service.generateResearch('p',{commandId:'run',expectedRevision:1})).rejects.toMatchObject({kind:'not_eligible'});
  const conflict=new HttpWorkbenchService({baseUrl:'/api',fetchImpl:async(_url,init)=>init?.method==='GET'?Response.json(raw()):Response.json({error:{code:'REVISION_CONFLICT',message:'Changed'}},{status:409})});
  await expect(conflict.addSource('p',{title:'t',publisher:'p',url:'',excerpt:'e',intendedUse:'category',attachToClaimId:null},{commandId:'save',expectedRevision:0})).rejects.toMatchObject({kind:'conflict',conflict:{expectedRevision:0,currentRevision:1}});
 });
});
