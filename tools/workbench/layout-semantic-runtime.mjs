import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {LAYOUT_PURPOSE,LAYOUT_STYLES,layoutJobInput,layoutHash} from './layout-boundary.mjs';
import {verifyLayoutCurrent} from './layout-status-contract.mjs';
import {verifyLayoutRenderer} from './layout-renderer.mjs';
import {verifyNativeResources,verifyExecutionPins} from './layout-native-proof.mjs';
import {readManagedLayoutBytes} from './managed-layout-bytes.mjs';
import {sketchRequire as need} from './sketch-authority.mjs';
export function createSemanticLayoutRuntime({store,root,content}){
 return async function semanticPlans(id){
  const p=store.read(id),job=p.jobs.findLast(j=>j.purpose===LAYOUT_PURPOSE&&j.task.binding),input=job&&layoutJobInput(p,job),binding=job?.task.binding;
  need(input&&JSON.parse(input.ledgerText).schemaVersion==='semantic-layout-v3','LAYOUT_SEMANTIC_V3_REQUIRED','Current prepared numeric semantic binding required');
  const verify=()=>verifyLayoutCurrent(store,content,id,input,async()=>{await verifyLayoutRenderer(binding.renderer);await verifyNativeResources(root,binding);if(binding.execution)await verifyExecutionPins(binding.execution);});
  await verify();
  const resources=await verifyNativeResources(root,binding),folder=join(root,'semantic-layout',input.bindingHash);
  await mkdir(folder,{recursive:true});
  const immutable=async(path,text)=>{try{await writeFile(path,text,{flag:'wx'});}catch(error){if(error.code!=='EEXIST')throw error;need((await readManagedLayoutBytes(root,path,64*1024*1024)).toString('utf8')===text,'LAYOUT_SEMANTIC_PLAN_CHANGED','Existing semantic plan bytes must remain exact');}};
  const ledger=join(folder,'ledger.json');await immutable(ledger,input.ledgerText);
  const {loadInput}=await import('../auto-layout/input.mjs'),{planDeck}=await import('../auto-layout/layout.mjs');
  const loaded=await loadInput({ledger,...resources}),plans=[];
  for(const style of LAYOUT_STYLES){
   const plan=planDeck(loaded,style),text=JSON.stringify(plan),path=join(folder,`${style}-plan.json`);
   await immutable(path,text);plans.push({style,path,sha256:layoutHash(text),slides:plan.slides.length,chartOccurrences:plan.slides.flatMap(s=>s.elements.filter(e=>e.type==='chart')).length,plan});
  }
  await verify();
  return {status:'semantic_plans_ready',bindingHash:input.bindingHash,sourceHash:binding.sourceHash,manuscriptHash:binding.manuscriptHash,plans,exportAvailable:false,finalAuthorityAvailable:false,nativeChartExportAvailable:false};
 };
}
