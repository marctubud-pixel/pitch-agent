export function referenceInputClosure(project,artifactId,{poolSeal=null}={}){
 if(typeof artifactId!=='string'||!artifactId)throw Object.assign(Error('REFERENCE_INPUT_SOURCE_REQUIRED'),{code:'REFERENCE_INPUT_SOURCE_REQUIRED'});
 const intent=(project.referenceIntents??[]).find(i=>i.artifactId===artifactId);
 if(intent)return {closed:true,reason:'native_continuation_intent',id:intent.id};
 const dossier=(project.referenceDossiers??[]).find(d=>d.envelope?.source?.source?.artifactId===artifactId);
 if(dossier)return {closed:true,reason:'native_dossier',id:dossier.id};
 const job=(project.jobs??[]).find(j=>j.purpose==='reference'&&(j.targetArtifactId===artifactId||j.inputVersionIds?.includes(artifactId)));
 if(job)return {closed:true,reason:'native_reference_job',id:job.id};
 if(poolSeal?.artifactId===artifactId)return {closed:true,reason:'admitted_pool_seal',id:poolSeal.id};
 return {closed:false,reason:null,id:null};
}
