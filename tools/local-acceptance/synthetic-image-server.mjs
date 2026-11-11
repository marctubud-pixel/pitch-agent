import http from 'node:http';
import {createHash} from 'node:crypto';
import {renderSyntheticSketch,validateSyntheticSketchSpec} from '../auto-layout/local-synthetic-sketch.mjs';
export const SYNTHETIC_IMAGE_MODEL='local-synthetic-image-v1';
const pngMagic=Buffer.from([137,80,78,71,13,10,26,10]);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const need=(ok,code)=>{if(!ok)throw Object.assign(Error(code),{code});};
export function syntheticImagePrompt(spec){return 'Synthetic local engineering fixture; not a real image model.\nSYNTHETIC_SKETCH_JSON\n'+JSON.stringify(validateSyntheticSketchSpec(spec))+'\nEND_SYNTHETIC_SKETCH_JSON';}
export function parseSyntheticImagePrompt(prompt){
 const marker='SYNTHETIC_SKETCH_JSON\n',end='\nEND_SYNTHETIC_SKETCH_JSON';
 need(typeof prompt==='string'&&prompt.split(marker).length===2&&prompt.endsWith(end),'SYNTHETIC_PROMPT_INVALID');
 return validateSyntheticSketchSpec(JSON.parse(prompt.slice(prompt.indexOf(marker)+marker.length,-end.length)));
}
export function localSyntheticImageConfig({baseUrl,model=SYNTHETIC_IMAGE_MODEL,credentialEnv='LOCAL_SYNTHETIC_IMAGE_TOKEN'}){
 const u=new URL(baseUrl);need(u.protocol==='http:'&&u.hostname==='127.0.0.1'&&u.pathname==='/v1'&&!u.search&&!u.hash&&!u.username&&!u.password,'LOCAL_LOOPBACK_IMAGE_URL_REQUIRED');
 const options={size:['1280x720'],quality:['standard'],output_format:['png'],response_format:['b64_json']};
 return {providerId:'local-synthetic-image',adapter:'openai-images-v1',baseUrl,model,credentialEnv,operations:{generate:true,edit:true},supportedOptions:{generate:structuredClone(options),edit:structuredClone(options)},timeoutMs:30000,maxInputImages:1,maxRequestBytes:8*1024*1024,maxResponseBytes:8*1024*1024};
}
// Deliberately accepts only the exact bounded multipart dialect emitted by image-api-provider.
export function parseSyntheticMultipart(bytes,contentType){
 need(Buffer.isBuffer(bytes)&&bytes.length<=8*1024*1024,'SYNTHETIC_MULTIPART_LIMIT');
 const match=/^multipart\/form-data; boundary=(workbench-[A-Za-z0-9-]{1,100})$/.exec(contentType??'');need(match,'SYNTHETIC_MULTIPART_INVALID');
 const boundary=Buffer.from('--'+match[1]),separator=Buffer.from('\r\n--'+match[1]),headerEnd=Buffer.from('\r\n\r\n');
 const fields={},images=[];let offset=0,parts=0;
 while(true){
  need(bytes.subarray(offset,offset+boundary.length).equals(boundary),'SYNTHETIC_MULTIPART_INVALID');offset+=boundary.length;
  if(bytes.subarray(offset).equals(Buffer.from('--\r\n')))break;
  need(bytes.subarray(offset,offset+2).equals(Buffer.from('\r\n')),'SYNTHETIC_MULTIPART_INVALID');offset+=2;
  const end=bytes.indexOf(headerEnd,offset);need(end>offset&&end-offset<1024&&++parts<=9,'SYNTHETIC_MULTIPART_INVALID');
  const headers=bytes.subarray(offset,end).toString('ascii'),next=bytes.indexOf(separator,end+4);need(next>=0,'SYNTHETIC_MULTIPART_INVALID');
  const value=bytes.subarray(end+4,next),image=/^Content-Disposition: form-data; name="image\[\]"; filename="image-1\.png"\r\nContent-Type: image\/png$/.test(headers);
  if(image){need(images.length===0&&value.length>8&&value.subarray(0,8).equals(pngMagic),'SYNTHETIC_INPUT_IMAGE_INVALID');images.push({bytes:Buffer.from(value),sha256:sha(value),mediaType:'image/png'});}
  else{const header=/^Content-Disposition: form-data; name="([a-z_]+)"$/.exec(headers);need(header&&['model','prompt','n','size','quality','output_format','response_format'].includes(header[1])&&!Object.hasOwn(fields,header[1])&&value.length<=40000,'SYNTHETIC_MULTIPART_INVALID');fields[header[1]]=value.toString('utf8');}
  offset=next+2;
 }
 need(images.length===1,'SYNTHETIC_SELECTED_IMAGE_REQUIRED');return {fields,images};
}
export function decodeSyntheticImageRequest({bytes,contentType,edit,model=SYNTHETIC_IMAGE_MODEL}){
 let body,images=[];if(edit){const parsed=parseSyntheticMultipart(bytes,contentType);body=parsed.fields;images=parsed.images;}else{need(contentType==='application/json'&&bytes.length<=65536,'SYNTHETIC_REQUEST_INVALID');body=JSON.parse(bytes.toString('utf8'));}
 need(body&&Object.keys(body).every(k=>['model','prompt','n','size','quality','output_format','response_format'].includes(k))&&body.model===model&&body.n===(edit?'1':1)&&body.size==='1280x720'&&body.quality==='standard'&&body.output_format==='png'&&body.response_format==='b64_json','SYNTHETIC_REQUEST_INVALID');
 const spec=parseSyntheticImagePrompt(body.prompt);need(edit?spec.phase==='final':spec.phase!=='final','SYNTHETIC_PHASE_OPERATION_MISMATCH');
 if(edit)need(images[0].sha256===spec.selectedImage.sha256,'SYNTHETIC_SELECTED_IMAGE_CHANGED');
 return {spec,images};
}
// Importing never starts a listener. Caller must explicitly listen(port, '127.0.0.1').
export function createSyntheticImageServer({token,model=SYNTHETIC_IMAGE_MODEL,fontPath,render=renderSyntheticSketch}={}){
 need(typeof token==='string'&&token.length>=24,'LOCAL_TEST_TOKEN_REQUIRED');
 const server=http.createServer(async(req,res)=>{
  const send=(status,body)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(body));};
  if(!['127.0.0.1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress))return send(403,{error:'LOCAL_ONLY'});
  if(req.method!=='POST'||!['/v1/images/generations','/v1/images/edits'].includes(req.url))return send(404,{error:'SYNTHETIC_ROUTE_UNSUPPORTED'});
  if(req.headers.authorization!==`Bearer ${token}`)return send(401,{error:'LOCAL_TEST_TOKEN_INVALID'});
  const edit=req.url==='/v1/images/edits';let chunks=[],size=0;
  try{for await(const chunk of req){size+=chunk.length;if(size>(edit?8*1024*1024:65536)){send(413,{error:'SYNTHETIC_REQUEST_TOO_LARGE'});return;}chunks.push(chunk);}
   const {spec,images}=decodeSyntheticImageRequest({bytes:Buffer.concat(chunks),contentType:req.headers['content-type'],edit,model}),png=await render(spec,{fontPath,inputImages:images});
   need(Buffer.isBuffer(png)&&png.length<=7*1024*1024&&png.subarray(0,8).equals(pngMagic),'SYNTHETIC_RENDER_INVALID');
   send(200,{id:'synthetic-'+sha(png).slice(0,20),model,data:[{b64_json:png.toString('base64')}],syntheticOnly:true,qualityVerified:false,...(edit?{syntheticInputImageHash:images[0].sha256}:{})});
  }catch(e){send(422,{error:e.code??'SYNTHETIC_REQUEST_OR_RENDER_INVALID'});}
 });
 const originalListen=server.listen.bind(server);server.listen=(port,host,...args)=>{need(host==='127.0.0.1'&&Number.isSafeInteger(port)&&port>=1&&port<=65535,'EXPLICIT_LOOPBACK_PORT_REQUIRED');return originalListen(port,host,...args);};return server;
}
