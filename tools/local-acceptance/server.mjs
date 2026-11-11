import http from 'node:http';
import {randomBytes,createHash} from 'node:crypto';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {exportEditableProposal} from '../auto-layout/editable-proposal.mjs';
import {readManagedLayoutBytes} from '../workbench/managed-layout-bytes.mjs';
import {normalizeDecisionWire} from './request-identity.mjs';
import {IMAGE_LIMITS} from '../workbench/image-evidence.mjs';

const publicRoot=fileURLToPath(new URL('./',import.meta.url));
const validId=value=>typeof value==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(value);
const error=(message,status=422)=>Object.assign(new Error(message),{status,code:message});
export function acceptanceAdvanceRequest(body){if(!body||!validId(body.commandId))throw error('ACCEPTANCE_ADVANCE_COMMAND_REQUIRED');return body;}
export async function createLocalAcceptanceServer({store,rootDir,documentIds=[],pipeline=null,beforeMutation}) {
  await mkdir(rootDir,{recursive:true});
  const token=randomBytes(32).toString('hex'),exports=new Map();
  const json=(res,status,body)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(body));};
  const readBody=async(req,limit=2*1024*1024)=>{const chunks=[];let bytes=0;for await(const chunk of req){bytes+=chunk.length;if(bytes>limit)throw error('REQUEST_TOO_LARGE',413);chunks.push(chunk);}let body;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw error('INVALID_JSON');}await beforeMutation?.();return body;};
  const driver=()=>{if(!pipeline)throw error('LOCAL_PIPELINE_NOT_CONNECTED',501);return pipeline;};
  const server=http.createServer(async(req,res)=>{
    try {
      const authority=`127.0.0.1:${server.address().port}`;
      if(req.headers.host!==authority)throw error('LOCAL_HOST_REQUIRED',403);
      const url=new URL(req.url,`http://${authority}`),parts=url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
      res.setHeader('X-Content-Type-Options','nosniff');
      res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'");
      if(req.method==='POST'){
        if(req.headers.origin!==`http://${authority}`||req.headers['x-acceptance-token']!==token||req.headers['content-type']?.split(';')[0]!=='application/json')throw error('LOCAL_SESSION_REQUIRED',403);
        await beforeMutation?.();
      }else if(req.method!=='GET')throw error('METHOD_NOT_ALLOWED',405);
      if(req.method==='GET'&&url.pathname==='/api/session')return json(res,200,{token,testOnly:true});
      if(req.method==='GET'&&['/','/client.css','/client.js','/client-flow.mjs','/chart-insertion.mjs','/font-descriptors.mjs','/reference-view-dom.mjs','/reference-input-controller.mjs','/reference-input-dom.mjs','/browser-pending.mjs','/request-identity.mjs'].includes(url.pathname)){
        const name=url.pathname==='/'?'client.html':url.pathname.slice(1),content=await readFile(path.join(publicRoot,name));
        res.writeHead(200,{'Content-Type':name.endsWith('.html')?'text/html; charset=utf-8':name.endsWith('.css')?'text/css':'text/javascript','Cache-Control':'no-store'});return res.end(content);
      }
      if(parts[0]!=='api')throw error('NOT_FOUND',404);
      if(parts[1]==='cases'){
        const p=driver();
        if(parts.length===2&&req.method==='GET')return json(res,200,await p.list());
        if(parts.length===2&&req.method==='POST')return json(res,201,await p.create(await readBody(req)));
        if(!validId(parts[2]))throw error('CASE_ID_INVALID');
        if(parts.length===3&&req.method==='GET')return json(res,200,await p.read(parts[2]));
        if(parts.length===4&&parts[3]==='reference-uploads'&&req.method==='POST'){
          if(typeof p.uploadReference!=='function')throw error('LOCAL_REFERENCE_UPLOAD_NOT_CONNECTED',501);
          const body=await readBody(req,4*Math.ceil(IMAGE_LIMITS.bytes/3)+65536),result=await p.uploadReference(parts[2],body);return json(res,201,typeof p.readReferenceCommand==='function'?{...result,commandReceipt:await p.readReferenceCommand(parts[2],body.commandId)}:result);
        }
        if(parts.length===4&&parts[3]==='reference-materials'&&req.method==='POST'){
          if(typeof p.submitReferenceMaterial!=='function')throw error('LOCAL_REFERENCE_MATERIAL_NOT_CONNECTED',501);
          const body=await readBody(req),result=await p.submitReferenceMaterial(parts[2],body);return json(res,201,typeof p.readReferenceCommand==='function'?{...result,commandReceipt:await p.readReferenceCommand(parts[2],body.commandId)}:result);
        }
        if(parts.length===4&&parts[3]==='reference-withdrawals'&&req.method==='POST'){
          if(typeof p.withdrawReferenceMaterial!=='function')throw error('LOCAL_REFERENCE_WITHDRAWAL_NOT_CONNECTED',501);
          return json(res,200,await p.withdrawReferenceMaterial(parts[2],await readBody(req)));
        }
        if(parts.length===5&&parts[3]==='reference-commands'&&req.method==='GET'){
          if(!validId(parts[4]))throw error('REFERENCE_COMMAND_ID_INVALID');
          if(typeof p.readReferenceCommand!=='function')throw error('LOCAL_REFERENCE_RECEIPT_NOT_CONNECTED',501);
          return json(res,200,await p.readReferenceCommand(parts[2],parts[4]));
        }
        if(parts.length===5&&parts[3]==='decisions'&&req.method==='GET'){
          if(!validId(parts[4]))throw error('DECISION_COMMAND_ID_INVALID');
          if(typeof p.decisionReceipt!=='function')throw error('DECISION_RECEIPT_UNAVAILABLE',503);
          return json(res,200,await p.decisionReceipt(parts[2],parts[4]));
        }
        if(parts.length===4&&['continue','advance'].includes(parts[3])&&req.method==='POST'){
          const body=acceptanceAdvanceRequest(await readBody(req));
          if(body.decision){
            return json(res,200,await p.decide(parts[2],normalizeDecisionWire(body),{wireRequest:body}));
          }
          return json(res,200,await p.advance(parts[2],body));
        }
      }
      if(parts[1]==='documents'){
        if(parts.length===2&&req.method==='GET')return json(res,200,documentIds.map(id=>{const d=store.read(id);return {id,revision:d.revision,status:d.status};}));
        const id=parts[2];if(!validId(id))throw error('DOCUMENT_ID_INVALID');
        if(parts.length===3&&req.method==='GET'){
          const revision=url.searchParams.has('revision')?Number(url.searchParams.get('revision')):undefined;
          if(revision!==undefined&&(!Number.isSafeInteger(revision)||revision<1))throw error('REVISION_INVALID');
          return json(res,200,store.read(id,revision));
        }
        if(parts.length===5&&parts[3]==='commands'&&req.method==='GET'){if(!validId(parts[4]))throw error('COMMAND_ID_INVALID');if(typeof store.commandReceipt!=='function')throw error('COMMAND_STATUS_NOT_CONNECTED',501);return json(res,200,store.commandReceipt(id,parts[4]));}
        if(parts.length===4&&parts[3]==='history'&&req.method==='GET')return json(res,200,store.history(id));
        if(parts.length===4&&['save','restore'].includes(parts[3])&&req.method==='POST')return json(res,200,store[parts[3]](id,await readBody(req)));
        if(parts.length===4&&parts[3]==='export'&&req.method==='POST'){
          const body=await readBody(req),receipt=await exportEditableProposal({store,id,revision:body.revision,outputRoot:path.join(rootDir,'exports')});
          const key=randomBytes(16).toString('hex');exports.set(key,receipt);
          await writeFile(path.join(rootDir,'export-'+key+'.json'),JSON.stringify(receipt,null,2),{flag:'wx'});
          return json(res,200,{receipt,downloadUrl:'/api/downloads/'+key});
        }
        if(parts.length===5&&['assets','fonts'].includes(parts[3])&&req.method==='GET'){
          const revision=url.searchParams.has('revision')?Number(url.searchParams.get('revision')):undefined;
          if(revision!==undefined&&(!Number.isSafeInteger(revision)||revision<1))throw error('REVISION_INVALID');
          const d=store.read(id,revision),fontIndex=Number(parts[4]);
          const asset=parts[3]==='fonts'?(Number.isSafeInteger(fontIndex)&&fontIndex>=0?d.input.brand.font.files[fontIndex]:null):(Object.hasOwn(d.input.assets,parts[4])?d.input.assets[parts[4]]:null);if(!asset)throw error('ASSET_NOT_FOUND',404);
          const types=parts[3]==='fonts'?{'.ttf':'font/ttf','.otf':'font/otf'}:{'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp'};
          const type=types[path.extname(asset.file)];if(!type)throw error('ASSET_TYPE_INVALID');
          const bytes=await readManagedLayoutBytes(rootDir,asset.file,64*1024*1024);if(bytes.length!==asset.byteLength||createHash('sha256').update(bytes).digest('hex')!==asset.sha256)throw error('ASSET_CHANGED',409);
          res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store'});return res.end(bytes);
        }
      }
      if(parts.length===3&&parts[1]==='downloads'&&req.method==='GET'){
        if(!/^[a-f0-9]{32}$/.test(parts[2]))throw error('EXPORT_NOT_FOUND',404);
        let receipt=exports.get(parts[2]);
        if(!receipt){try{receipt=JSON.parse((await readManagedLayoutBytes(rootDir,path.join(rootDir,'export-'+parts[2]+'.json'))).toString('utf8'));}catch{throw error('EXPORT_NOT_FOUND',404);}}
        if(!validId(receipt.id)||!Number.isSafeInteger(receipt.revision)||receipt.revision<1||!receipt.deckPath)throw error('EXPORT_RECEIPT_INVALID',409);
        const bytes=await readManagedLayoutBytes(path.join(rootDir,'exports'),receipt.deckPath,128*1024*1024);if(createHash('sha256').update(bytes).digest('hex')!==receipt.sha256)throw error('EXPORT_CHANGED',409);
        res.writeHead(200,{'Content-Type':'application/vnd.openxmlformats-officedocument.presentationml.presentation','Content-Disposition':`attachment; filename="${receipt.id}-r${receipt.revision}.pptx"`});return res.end(bytes);
      }
      throw error('NOT_FOUND',404);
    }catch(e){if(!res.headersSent)json(res,e.status??500,{error:e.code??'LOCAL_ACCEPTANCE_ERROR',message:e.message,testOnly:true});else res.destroy();}
  });
  return {server,listen:port=>new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',()=>resolve(`http://127.0.0.1:${server.address().port}/`));}),close:()=>new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()))};
}
