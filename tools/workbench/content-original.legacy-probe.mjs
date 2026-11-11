import {contentRequest,contentPlanningManifest,ingestContent,validateContentReceipt} from './complete-content.mjs';
import {sketchRequire as need} from './sketch-authority.mjs';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual as equal} from 'node:util';
export async function legacyOriginal(p,j,originalRoot,allowInvalidPlan,root) {
   const a=j.attempts.at(-1),folder=join(root,a.id),request=contentRequest(p,originalRoot,j.node).request;need(await readFile(join(folder,'packet.json'),'utf8')===JSON.stringify({runId:a.id,model:j.binding.model,...request})&&await readFile(join(folder,'receipt.json'),'utf8')===JSON.stringify(a.receipt)&&await readFile(join(folder,'response.txt'),'utf8')===a.receipt.responseText,'CONTENT_ORIGINAL_BYTES_CHANGED','Original content packet, response and receipt bytes required');validateContentReceipt(p,originalRoot,j,a,a.receipt);
   const parsed=ingestContent(contentRequest(p,originalRoot,j.node).input,a.receipt,contentPlanningManifest(p,originalRoot));
   if(j.node.phase==='plan'&&!parsed.valid){need(allowInvalidPlan&&parsed.diagnostics.includes('CONTENT_PLAN_ASSIGNMENT_INVALID')&&equal(parsed.raw,j.contentReport.raw),'CONTENT_PLAN_ASSIGNMENT_INVALID','Saved original work order is invalid under exact module binding authority');}
   else need(equal(j.contentReport.projection,parsed),'CONTENT_ORIGINAL_CHANGED','Original response projection changed');
   for(const i of a.receipt.images??[]){const b=await readFile(i.path);need(b.length===i.byteLength&&createHash('sha256').update(b).digest('hex')===i.sha256,'CONTENT_ATTACHMENT_CHANGED','Actual original attachment bytes changed');}
  }
