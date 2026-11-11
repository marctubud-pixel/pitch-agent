import {createRequire} from 'node:module';
import {mkdir,writeFile,realpath} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {readManagedLayoutBytes} from '../workbench/managed-layout-bytes.mjs';
import {createHash} from 'node:crypto';
const purposes=['phone','outdoor','elevator','packaging-flat-front','packaging-concept-board'];
const need=(v,code)=>{if(!v)throw Object.assign(Error(code),{code});};
export function engineeringMockupFrame({purpose,artWidth,artHeight}){
 need(purposes.includes(purpose)&&[artWidth,artHeight].every(n=>Number.isSafeInteger(n)&&n>0&&n<=10000),'LOCAL_MOCKUP_FRAME_INVALID');
 const width=1280,height=900,ratio=artWidth/artHeight,w=Math.min(960,560*ratio),h=w/ratio;
 return {purpose,width,height,aperture:{x:(width-w)/2/width,y:(height-h)/2/height,w:w/width,h:h/height},sourceBoundary:purpose.startsWith('packaging-')?'Flat engineering presentation panel only. Not curved bottle wrapping, perspective packaging, 3D render, physical prototype or manufacturing evidence.':'Illustrative media frame only. Not an actual purchased media placement.'};
}
// Creates a controlled background asset only; existing native renderer places the actual artwork separately.
export async function createLocalEngineeringMockup({directory,purpose,artWidth,artHeight}){
 const frame=engineeringMockupFrame({purpose,artWidth,artHeight}),require=createRequire(import.meta.url),{createCanvas}=require('@napi-rs/canvas'),canvas=createCanvas(frame.width,frame.height),c=canvas.getContext('2d');
 c.fillStyle='#e8e5df';c.fillRect(0,0,frame.width,frame.height);const r={x:frame.aperture.x*frame.width,y:frame.aperture.y*frame.height,w:frame.aperture.w*frame.width,h:frame.aperture.h*frame.height};
 c.fillStyle='#192b37';c.fillRect(r.x-16,r.y-16,r.w+32,r.h+32);c.fillStyle='#fff';c.fillRect(r.x,r.y,r.w,r.h);
 c.fillStyle='#22313c';c.font='24px sans-serif';c.fillText(`LOCAL ENGINEERING / ${purpose.toUpperCase()}`,60,66);c.font='16px sans-serif';c.fillText('Illustrative flat frame only — not commercial placement, 3D packaging or a physical prototype.',60,850);
 const bytes=canvas.toBuffer('image/png'),sha256=createHash('sha256').update(bytes).digest('hex');await mkdir(directory,{recursive:true,mode:0o700});const root=await realpath(directory);need(resolve(directory)===root,'LOCAL_MOCKUP_ROOT_CANONICAL_REQUIRED');const path=join(root,'engineering-frame-'+sha256+'.png');try{await writeFile(path,bytes,{flag:'wx',mode:0o400});}catch(e){if(e.code!=='EEXIST')throw e;}
 need(createHash('sha256').update(await readManagedLayoutBytes(root,path,8*1024*1024)).digest('hex')===sha256,'LOCAL_MOCKUP_BYTES_CHANGED');
 return {purpose,aperture:frame.aperture,asset:{id:'mockup-'+sha256.slice(0,24),path,sha256,byteLength:bytes.length,sourceBoundary:frame.sourceBoundary},syntheticOnly:true,realQualityVerified:false};
}
