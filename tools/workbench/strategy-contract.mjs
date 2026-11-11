import {createHash} from 'node:crypto';
import {isDeepStrictEqual as equal} from 'node:util';
import {evidenceClaimManifest,evidenceStateHash} from './evidence-review.mjs';

export const STRATEGY_CONTRACT_VERSION='strategy-v2';
const invalid=message=>{throw Object.assign(new Error(message),{code:'INVALID_STAGE_OUTPUT'});};
const need=(condition,message)=>{if(!condition)invalid(message);};
const text={type:'string',minLength:1,maxLength:20000};
const id={type:'string',minLength:1,maxLength:200};
const en=values=>({type:'string',enum:values});
const arr=(items,minItems=0,maxItems=100)=>({type:'array',items,minItems,maxItems});
const obj=properties=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const refs=arr(id);
const limits=arr(text);
const requirement=obj({taskCardId:id,pointer:id,quote:text});
const researchRef=obj({artifactId:id,contentHash:id,claimKey:id});
export const STRATEGY_CIRCLES=['industryCompetitor','brandProduct','userUsage'];
const finding=obj({id,claimId:id,researchRefs:arr(researchRef),requirementRefs:arr(requirement)});
const gap=obj({description:text,effect:en(['blocks_now','conditional']),trigger:text,prohibitedUse:text});
const circle=obj({summary:text,findings:arr(finding),gaps:arr(gap)});
const links={findingIds:refs,claimIds:refs};
const cut=obj({id,title:text,proposition:text,mechanism:text,...links,permittedUse:limits,prohibitedInferences:limits,limitations:limits,disposition:en(['grounded','conditional','blocked'])});
const step=obj({id,role:en(['premise','development','synthesis']),text,...links,candidateIds:refs,priorStepIds:refs,limitations:limits});
const body=obj({
 coreQuestion:obj({id:en(['core-question']),text,requirementRefs:arr(requirement,1),decisionNeeded:text,scopeLimits:limits}),
 circles:obj(Object.fromEntries(STRATEGY_CIRCLES.map(k=>[k,circle]))),
 intersection:obj({text,...links,limitations:limits}),
 candidateCuts:arr(cut,0,3),
 reasoning:obj({form:en(['chain','total_parts_total']),steps:arr(step,1,30)}),
 answer:obj({questionId:en(['core-question']),text,recommendedCutId:{type:'string',maxLength:200},claimIds:refs,stepIds:refs,limitations:limits,decision:en(['grounded_proposal','conditional_exploration','blocked'])})
});
export function strategySchema(basis,evidenceRefs){
 validateStrategyBasis(basis);
 return {strategyContractVersion:en([STRATEGY_CONTRACT_VERSION]),strategyBasisHash:en([basis.basisHash]),strategy:body,
 claims:arr(obj({id,text,kind:en(['fact','inference','creative']),basisKind:en(['research','project_requirement','hypothesis']),evidenceRefs,limitations:limits}))};
}
export function validateStrategyBasis(basis){
 need(basis?.version===STRATEGY_CONTRACT_VERSION,'Unsupported strategy basis');
 const {basisHash,...data}=basis;
 need(basisHash===evidenceStateHash(data),'Strategy basis hash changed');
 need(basis.taskCard?.id&&basis.taskCard.brief&&basis.confirmations?.length,'Confirmed strategy task required');
 need(Array.isArray(basis.research)&&basis.research.length,'Actual frozen research required');
 return basis;
}
export function requireStrategyInputs(basis,inputArtifacts){
 validateStrategyBasis(basis);
 for(const research of basis.research){
  const input=inputArtifacts.find(x=>x.id===research.artifactId);
  need(input?.stage==='research'&&createHash('sha256').update(JSON.stringify(input.content,null,2)).digest('hex')===research.contentHash,'Exact original research bytes required for strategy');
  need(equal(evidenceClaimManifest(input.content),research.claimManifest),'Research claim manifest changed');
 }
}
function requirementText(card,pointer){
 if(typeof pointer!=='string'||!pointer.startsWith('/')||/~(?![01])/u.test(pointer))return undefined;
 let value=card;for(const token of pointer.slice(1).split('/')){const key=token.replaceAll('~1','/').replaceAll('~0','~');if(!value||typeof value!=='object'||!Object.hasOwn(value,key))return undefined;value=value[key];}
 return typeof value==='string'?value:undefined;
}
export function validateStrategy(value,basis){
 validateStrategyBasis(basis);
 const b=value.strategy,claims=new Map(value.claims.map(c=>[c.id,c])),findings=new Map(),cuts=new Map(b.candidateCuts.map(c=>[c.id,c]));
 need(claims.size===value.claims.length&&cuts.size===b.candidateCuts.length,'Unique strategy claim and candidate IDs required');
 const requireRefs=items=>{for(const r of items)need(r.taskCardId===basis.taskCard.id&&requirementText(basis.taskCard,r.pointer)?.includes(r.quote),'Requirement quote must match confirmed task');};
 requireRefs(b.coreQuestion.requirementRefs);
 const used=new Set();
 for(const key of STRATEGY_CIRCLES){const c=b.circles[key];need(c.findings.length||c.gaps.length,'Each strategy circle requires findings or explicit gaps');
  for(const f of c.findings){need(!findings.has(f.id),'Unique circle finding IDs required');findings.set(f.id,{...f,circle:key});const claim=claims.get(f.claimId);need(claim,'Unknown finding claim');used.add(claim.id);requireRefs(f.requirementRefs);
   for(const r of f.researchRefs){const research=basis.research.find(x=>x.artifactId===r.artifactId&&x.contentHash===r.contentHash);need(research?.claimManifest.some(c=>c.claimKey===r.claimKey),'Unknown exact research claim');}
   if(claim.basisKind==='research'){need(f.researchRefs.length,'Research finding requires actual research premise');const admitted=new Set(f.researchRefs.flatMap(r=>basis.research.find(x=>x.artifactId===r.artifactId).claimManifest.find(c=>c.claimKey===r.claimKey).claim.evidenceRefs));need(claim.evidenceRefs.length&&claim.evidenceRefs.every(x=>admitted.has(x)),'Research claim cites evidence outside its actual premises');}
   if(claim.basisKind==='project_requirement')need(f.requirementRefs.length&&!f.researchRefs.length,'Project requirement needs exact confirmed requirement reference');
   if(claim.basisKind==='hypothesis')need(claim.kind!=='fact'&&claim.limitations.length,'Hypothesis cannot become fact or lose limits');
  }
 }
 need(value.claims.every(c=>used.has(c.id)),'Every strategy claim must have a circle finding basis');
 const checkLinks=(item)=>{need(new Set(item.findingIds).size===item.findingIds.length&&new Set(item.claimIds).size===item.claimIds.length,'Duplicate strategy references');need(item.findingIds.every(x=>findings.has(x))&&item.claimIds.every(x=>claims.has(x)),'Unknown strategy graph reference');};
 checkLinks(b.intersection);
 const covered=new Set(b.intersection.findingIds.map(x=>findings.get(x).circle));
 const grounded=b.answer.decision==='grounded_proposal';
 if(STRATEGY_CIRCLES.some(k=>b.circles[k].gaps.some(g=>g.effect==='blocks_now')))need(b.answer.decision==='blocked','Present blocking evidence gap prevents usable strategy');
 if(b.answer.decision==='blocked')need(!b.answer.recommendedCutId,'Blocked strategy cannot recommend a candidate');
 if(grounded)need(covered.size===3&&STRATEGY_CIRCLES.every(k=>b.circles[k].gaps.length===0)&&b.intersection.findingIds.every(x=>claims.get(findings.get(x).claimId).basisKind!=='hypothesis'),'Grounded intersection needs supported findings from all three circles without unresolved gaps');
 if(grounded)need(b.candidateCuts.length>=2,'Grounded strategy needs two or three candidates');
 if(!grounded)need(b.answer.limitations.length&&value.gaps.length,'Conditional or blocked strategy must retain explicit gaps and answer limits');
 need((b.answer.decision==='blocked')===(value.status==='blocked'),'Blocked strategy answer and status must agree');
 for(const c of b.candidateCuts){checkLinks(c);need(c.findingIds.length&&c.findingIds.every(x=>b.intersection.findingIds.includes(x))&&c.claimIds.every(x=>c.findingIds.some(f=>findings.get(f).claimId===x)),'Candidate must derive from intersection');need(c.permittedUse.length&&c.prohibitedInferences.length,'Candidate must bound downstream use');if(c.disposition==='grounded')need(grounded,'Conditional strategy cannot advertise grounded candidate');if(c.disposition!=='grounded')need(c.limitations.length,'Conditional candidate requires limitations');}
 const normalized=s=>s.normalize('NFKC').replace(/[\s\p{P}\p{S}]/gu,'').toLowerCase();need(new Set(b.candidateCuts.map(c=>normalized(c.proposition))).size===b.candidateCuts.length,'Candidate propositions must differ');
 const steps=new Map();for(const s of b.reasoning.steps){checkLinks(s);need(!steps.has(s.id)&&s.priorStepIds.every(x=>steps.has(x)),'Reasoning must be ordered and acyclic');need(s.candidateIds.every(x=>cuts.has(x)),'Unknown reasoning candidate');need(s.findingIds.length||s.claimIds.length||s.candidateIds.length||s.priorStepIds.length,'Reasoning step needs a premise');steps.set(s.id,s);}
 const list=b.reasoning.steps,last=list.at(-1);need(last.role==='synthesis','Final reasoning step must synthesize');
 if(b.reasoning.form==='chain')need(list.every((s,i)=>i===0?s.priorStepIds.length===0:s.priorStepIds.includes(list[i-1].id)),'Chain requires consecutive linked steps');
 else need(list.length>=3&&list[0].role==='premise'&&list.slice(1,-1).every(s=>s.role==='development'&&s.priorStepIds.includes(list[0].id))&&list.slice(1,-1).every(s=>last.priorStepIds.includes(s.id)),'Total-parts-total requires opening premise, linked developments and closing synthesis');
 need(b.answer.stepIds.length&&b.answer.stepIds.includes(last.id)&&b.answer.stepIds.every(x=>steps.has(x))&&b.answer.claimIds.every(x=>claims.has(x)),'Answer must reference final legal reasoning');
 if(b.answer.recommendedCutId)need(cuts.has(b.answer.recommendedCutId)&&cuts.get(b.answer.recommendedCutId).disposition!=='blocked'&&last.candidateIds.includes(b.answer.recommendedCutId),'Recommendation must be a nonblocked final derived candidate');
 if(b.answer.decision!=='blocked')need(b.answer.recommendedCutId,'Usable strategy needs a recommendation');
}
const proseKeys=new Set(['title','summary','text','decisionNeeded','quote','description','trigger','prohibitedUse','proposition','mechanism']);
const limitKeys=new Set(['limitations','scopeLimits','gaps','prohibitedInferences']);
const proseArrays=new Set([...limitKeys,'permittedUse']);
export function strategyTextLeaves(content){
 if(!content.strategy)return [];
 const leaves=[];
 const visit=(value,pointer,key,limited=false)=>{
  if(typeof value==='string'){if(proseKeys.has(key)||proseArrays.has(key))leaves.push({pointer,value,kind:limited?'limitation':'text'});return;}
  if(Array.isArray(value)){value.forEach((v,i)=>visit(v,`${pointer}/${i}`,key,limited||limitKeys.has(key)));return;}
  if(value&&typeof value==='object')for(const [k,v] of Object.entries(value).filter(([k])=>!['requirementRefs','researchRefs'].includes(k)))visit(v,`${pointer}/${k}`,k,limited||limitKeys.has(k));
 };
 visit(content.strategy,'/strategy','strategy');
 return leaves;
}
export function strategyRestrictions(content){
 if(!content.strategy)return [];
 const leaves=[...strategyTextLeaves(content).filter(x=>x.kind==='limitation'),...(content.gaps??[]).map((value,i)=>({pointer:`/gaps/${i}`,value})),...(content.claims??[]).flatMap((c,i)=>c.limitations.map((value,j)=>({pointer:`/claims/${i}/limitations/${j}`,value})))];
 return leaves.map(x=>({id:`strategy:${x.pointer}`,kind:'limitations',text:x.value}));
}
export const STRATEGY_INSTRUCTIONS='Produce the complete strategy-v2 body as the single authoritative strategy. Do not author generic sections. Distinguish research facts, confirmed project requirements and hypotheses using claims and exact frozen basis references. Include the original core question, industry/competitor, brand/product and user/usage circles, their intersection, distinct candidate cuts, ordered chain or total_parts_total reasoning and a final answer. Research references identify exact original artifact, content hash and claim key. A confirmed brand or deliverable requires its task-card quote, not market research. A hypothesis is never fact. Missing evidence is an explicit circle gap and a conditional or blocked conclusion; never fill missing circles or candidate counts with invented facts. Only grounded proposals need two or three candidates. Conditional exploration may have one. Preserve all original research restrictions. Citation existence is not independent support. Use empty recommendedCutId only for a blocked answer. Copy exact strategyContractVersion and strategyBasisHash from the schema. Process fields are excluded from client prose.';
