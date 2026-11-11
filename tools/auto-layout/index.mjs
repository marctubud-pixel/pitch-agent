import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {loadInput} from './input.mjs';
import {planDeck} from './layout.mjs';
import {exportDeck} from './export.mjs';

export async function buildDeck(request) {
  const input=await loadInput(request);
  const plan=planDeck(input,request.style);
  if(request.planOnly) return plan;
  const result=await exportDeck(input,plan,request.output);
  return {...result,slides:plan.slides.length};
}

if(process.argv[1] && import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) {
  const args=process.argv.slice(2),request={};
  for(let i=0;i<args.length;i++) {
    if(args[i]==='--plan-only')request.planOnly=true;
    else if(['--ledger','--brand','--assets','--style','--output'].includes(args[i]))request[args[i].slice(2)]=args[++i];
    else throw new Error(`Unknown argument ${args[i]}`);
  }
  try {
    const result=await buildDeck(request);
    if(request.planOnly&&request.output){await fs.mkdir(request.output,{recursive:true});await fs.writeFile(path.join(request.output,'plan.json'),JSON.stringify(result,null,2));console.log(`Planned ${result.slides.length} slides`);}
    else console.log(JSON.stringify(result,null,2));
  }catch(error){console.error(error.message);process.exitCode=1;}
}
