import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
const need=(ok,code)=>{if(!ok)throw Object.assign(Error(code),{code});};
export function validateSyntheticSketchSpec(spec){
 need(spec&&Object.keys(spec).every(k=>['caseId','directionId','variant','slogan','supportingCopy','phase','selectedImage'].includes(k)),'SYNTHETIC_SPEC_INVALID');
 need(['m6','dexian'].includes(spec.caseId)&&['steady','product','user'].includes(spec.directionId)&&Number.isSafeInteger(spec.variant)&&spec.variant>=0&&spec.variant<3,'SYNTHETIC_SPEC_INVALID');
 need(['slogan','supportingCopy'].every(k=>typeof spec[k]==='string'&&spec[k].trim()&&spec[k].length<=400),'SYNTHETIC_COPY_REQUIRED');
 need(spec.phase===undefined||['sketch','final'].includes(spec.phase),'SYNTHETIC_PHASE_INVALID');
 if(spec.phase==='final')need(spec.selectedImage&&Object.keys(spec.selectedImage).sort().join(',')==='imageId,sha256'&&/^[A-Za-z0-9_-]{1,100}$/.test(spec.selectedImage.imageId)&&/^[a-f0-9]{64}$/.test(spec.selectedImage.sha256),'SYNTHETIC_SELECTED_IMAGE_REQUIRED');else need(spec.selectedImage===undefined,'SYNTHETIC_SELECTED_IMAGE_UNEXPECTED');return structuredClone(spec);
}
export async function renderSyntheticSketch(input,{fontPath,inputImages=[]}={}){
 const spec=validateSyntheticSketchSpec(input),require=createRequire(import.meta.url),{createCanvas,GlobalFonts,loadImage}=require('@napi-rs/canvas');
 if(fontPath)need(GlobalFonts.registerFromPath(fontPath,'LocalSyntheticChinese'),'SYNTHETIC_FONT_INVALID');
 const canvas=createCanvas(1280,720),c=canvas.getContext('2d'),m6=spec.caseId==='m6',v=spec.variant;
 if(spec.phase==='final'){
  need(inputImages.length===1&&inputImages[0].sha256===spec.selectedImage.sha256&&createHash('sha256').update(inputImages[0].bytes).digest('hex')===spec.selectedImage.sha256,'SYNTHETIC_SELECTED_IMAGE_REQUIRED');
  const original=await loadImage(inputImages[0].bytes);c.drawImage(original,0,0,1280,720);c.fillStyle='#101b2c';c.fillRect(0,660,1280,60);c.fillStyle='#ffffff';c.font='18px LocalSyntheticChinese, sans-serif';c.fillText('SYNTHETIC REFINEMENT — ORIGINAL SKETCH PRESERVED — NOT AI GENERATION OR AESTHETIC APPROVAL',28,695);return canvas.toBuffer('image/png');
 }
 const bg=m6?'#092044':'#f0ece1',ink=m6?'#e9cc88':'#243f35',soft=m6?'#4d79a6':'#c7b793';
 c.fillStyle=bg;c.fillRect(0,0,1280,720);c.strokeStyle=ink;c.fillStyle=ink;c.lineWidth=4;
 const circle=(x,y,r)=>{c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.stroke();};
 const bottle=(x,y,w,h)=>{c.fillStyle=soft;c.fillRect(x+w*.35,y,w*.3,h*.18);c.beginPath();c.moveTo(x+w*.35,y+h*.18);c.lineTo(x,y+h*.33);c.lineTo(x,y+h);c.lineTo(x+w,y+h);c.lineTo(x+w,y+h*.33);c.lineTo(x+w*.65,y+h*.18);c.closePath();c.fill();c.fillStyle=ink;c.fillRect(x+w*.15,y+h*.5,w*.7,h*.28);};
 if(spec.directionId==='steady'){
  if(v===0){circle(850,360,220);circle(850,360,180);bottle(800,220,100,280);}
  if(v===1){c.save();c.translate(850,360);c.rotate(-.18);c.strokeRect(-230,-180,460,360);c.strokeRect(-190,-140,380,280);bottle(-40,-120,80,240);c.restore();}
  if(v===2){c.beginPath();c.moveTo(650,590);c.lineTo(960,140);c.lineTo(1170,590);c.closePath();c.stroke();bottle(920,280,100,280);}
 }else if(spec.directionId==='product'){
  // The product contour becomes the spatial carrier, rather than a bottle inside the same frame.
  c.save();c.translate(620+v*50,130+v*30);if(v===1)c.rotate(-.12);
  bottle(0,0,400-v*45,470-v*25);
  c.fillStyle=bg;c.fillRect(75,205,250-v*35,265-v*25);
  c.strokeStyle=ink;c.lineWidth=6;c.strokeRect(75,205,250-v*35,265-v*25);
  c.beginPath();c.moveTo(110,470-v*25);c.lineTo(245-v*20,295);c.lineTo(290-v*25,470-v*25);c.stroke();c.restore();
 }else{
  // The shared invitation is the hero; no central product silhouette is reused.
  c.save();c.translate(850+v*35,360-v*25);c.rotate([-.25,.18,-.08][v]);
  c.fillStyle=soft;c.fillRect(-185,-145,370,290);
  c.strokeStyle=ink;c.beginPath();c.moveTo(-185,-145);c.lineTo(0,25);c.lineTo(185,-145);c.moveTo(-185,145);c.lineTo(-65,0);c.moveTo(185,145);c.lineTo(65,0);c.stroke();
  c.fillStyle=ink;c.beginPath();c.arc(0,25,29,0,Math.PI*2);c.fill();c.restore();
  c.strokeStyle=ink;c.lineWidth=20;c.beginPath();c.moveTo(580,570-v*30);c.bezierCurveTo(700,370,1040,690,1180,230+v*80);c.stroke();
 }
 // Holiday must exist in pixels: lantern+single new-year seal, not text alone.
 if(m6){c.fillStyle='#ba443d';c.fillRect(1110,32,65,110);c.fillStyle=ink;c.font='40px LocalSyntheticChinese, sans-serif';c.fillText('春',1122,99);c.strokeStyle=ink;c.lineWidth=4;c.beginPath();c.moveTo(1142,0);c.lineTo(1142,32);c.moveTo(1142,142);c.lineTo(1142,175);c.stroke();}
 c.fillStyle=ink;c.font='bold 44px LocalSyntheticChinese, sans-serif';let y=240;
 // Text is rasterized in the fixture itself, never subsequently overlaid by export.
 for(let start=0;start<spec.slogan.length;start+=11){c.fillText(spec.slogan.slice(start,start+11),60,y);y+=64;}
 c.font='21px LocalSyntheticChinese, sans-serif';for(let start=0;start<spec.supportingCopy.length;start+=23){c.fillText(spec.supportingCopy.slice(start,start+23),60,y+30);y+=32;}
 c.font='18px LocalSyntheticChinese, sans-serif';c.fillText(m6?'梦之蓝 M6+ · 通用春节概念':'得闲 · 包装概念 · 度数/容量未定',60,630);
 c.fillStyle=m6?'#a9c0dc':'#536a61';c.font='16px LocalSyntheticChinese, sans-serif';c.fillText(`SYNTHETIC LOCAL ${spec.phase??'sketch'} ${spec.directionId}/${v+1} — ENGINEERING FIXTURE, NOT AESTHETIC APPROVAL`,30,700);
 return canvas.toBuffer('image/png');
}
