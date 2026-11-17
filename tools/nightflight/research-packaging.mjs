import {execFile} from 'node:child_process';
import {createHash} from 'node:crypto';
import {promisify} from 'node:util';
import {mkdir, mkdtemp, readFile, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {pythonBinary} from './runtime-dependencies.mjs';

const execute=promisify(execFile);
const zones=['左上','右上','左下','右下','中央'];
const string={type:'string'};
const object=properties=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const firstSchema=object({brand:string,front:string,regions:{type:'array',items:{type:'string',enum:zones}}});
const detailSchema=object({verifiedFront:string,checks:{type:'array',items:object({
  question:string,location:string,marking:string,status:{type:'string',enum:['看清','未核实']},
})}});

export async function readPackaging({call,dir,image,brief,previous,signal}) {
  const root=join(dir,'.research-evidence','packaging-reads');
  await mkdir(root,{recursive:true});
  const folder=await mkdtemp(join(root,image.sha256+'-'));
  let firstRead=previous?.firstRead;
  if (!firstRead) {
    const response=await call('只看这件包装原图。按客户 Brief 实际关心的问题观察，Brief 描述的是客户自己的产品。front 写你第一次实际看见的内容，包括与问题有关的文字、标识及其位置；看不清的写“未核实”。看不到文字不能断言包装没有该功能。brand 写可辨品牌。regions 按重要性选一至三个需要放大检查的区域，可包含横跨左右的区域，不猜答案。',[image],firstSchema,
      {rules:[],assignment:'单张包装读图',context:JSON.stringify({brief})});
    const answer=response.parsedOutput;
    firstRead={...answer,raw:response.responseText || JSON.stringify(answer),model:response.model,requestId:response.threadId};
  }
  await writeFile(join(folder,'first.json'),JSON.stringify({sha256:image.sha256,pageUrl:image.pageUrl,firstRead}),{mode:0o600});
  const selected=[...new Set(firstRead.regions ?? [])].filter(z=>zones.includes(z));
  const regions=(selected.length ? selected : ['中央','左上','右下']).slice(0,3);
  await execute(await pythonBinary(),['-I',fileURLToPath(new URL('./packaging-crops.py',import.meta.url)),image.path,folder,...regions],{signal,timeout:30000});
  const details=await Promise.all(regions.map(async (zone,i)=>{
    const path=join(folder,i+'.png');
    const bytes=await readFile(path);
    return {name:zone+'.png',imageId:'detail_'+i,mediaType:'image/png',path,byteLength:bytes.length,
      sha256:createHash('sha256').update(bytes).digest('hex')};
  }));
  const review=await call('第一张是原图，接着是同一原图的真实局部放大，顺序见 regions。核对品类、品牌和客户问题。verifiedFront 只写实际可见的正面外观，与品类不相干或辨认不出包装时留空。checks 逐项回答客户关心的细节。看清时报告具体位置、逐字抄下可辨的标注或准确描述可辨图形；不能辨认或这张图无法验证，就选未核实。图上有标注只支持标注本身，不能证明实际体验。不得从客户自己的规格、商品名或第一眼的遗漏推断竞品没有某项。',[image,...details],detailSchema,
    {rules:[],assignment:'单张包装核图',context:JSON.stringify({brief,product:image.title,firstObservation:firstRead.front,regions})});
  const {verifiedFront,checks=[]}=review.parsedOutput;
  if (!verifiedFront?.trim()) return null;
  const lines=checks.filter(c=>c.question?.trim()).map(c=>c.status==='看清' && c.location?.trim() && c.marking?.trim()
    ? c.question+'：'+c.location+'，'+c.marking : c.question+'：未核实。');
  const observation=[verifiedFront,...lines].join('\n');
  await writeFile(join(folder,'detail.json'),JSON.stringify({sha256:image.sha256,regions,checks,observation}),{mode:0o600});
  return {firstRead,regions,observation};
}
