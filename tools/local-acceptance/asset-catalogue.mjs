import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const repository=fileURLToPath(new URL('../../',import.meta.url));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const need=(value,code)=>{if(!value)throw Object.assign(Error(code),{code});};
const mainCases={BH01:'春节KV',BH04:'春节KV',C01:'品牌春节平面广告',C07:'竖版春节主题KV',C20:'竖版春节品牌主题KV'};
const auxiliaryCases={BH05:'春节竖海报',BH07:'平台活动KV'};
export function validatePosterCase(record,id,role) {
  const formats=role==='same-use-master-kv'?mainCases:role==='auxiliary-reference'?auxiliaryCases:null;
  need(formats&&Object.hasOwn(formats,id)&&record?.id===id&&record.format===formats[id]&&record.visually_checked===true,'LOCAL_REFERENCE_USE_MISMATCH');
  need(typeof record.source_url==='string'&&/^https?:\/\//.test(record.source_url),'LOCAL_REFERENCE_SOURCE_MISSING');
  return true;
}
async function resource(root,relative,expectedHash) {
  const file=path.resolve(root,relative),within=path.relative(path.resolve(root),file);
  need(within&&!within.startsWith('..')&&!path.isAbsolute(within),'LOCAL_REFERENCE_PATH_INVALID');
  const bytes=await readFile(file),sha256=hash(bytes);
  need(bytes.length>0&&(!expectedHash||sha256===expectedHash),'LOCAL_REFERENCE_BYTES_CHANGED');
  return {file,relativePath:relative,sha256,byteLength:bytes.length};
}
export async function loadLocalAcceptanceAssetCatalogue({root=repository}={}) {
  const records=JSON.parse(await readFile(path.join(root,'sites/light-baijiu-research/public/m6-editorial/cases.json'),'utf8'));
  const posters=[];
  for(const [role,choices] of [['same-use-master-kv',mainCases],['auxiliary-reference',auxiliaryCases]])for(const id of Object.keys(choices)){
    const record=records[id];validatePosterCase(record,id,role);
    posters.push({id,role,brand:record.brand,format:record.format,year:record.year,sourceUrl:record.source_url,imageUrl:record.image_url,provenanceState:'legacy-attribution-not-managed-capture',notes:record.notes,...await resource(root,'sites/light-baijiu-research/public/m6-spring/assets/'+record.file),limitations:[...(role==='auxiliary-reference'?['不计入同用途主KV比较。','主KV地位或投放用途未核实。']:['只能观察画面，不证明用户偏好、投放规模或传播效果。']),'保留历史来源署名；本目录不替代正式网页捕获和当前来源核验。']});
  }
  const packagingInput=JSON.parse(await readFile(path.join(root,'output/dexian/image-observation-live/input-assets.json'),'utf8'));
  const packaging=[];
  for(const [index,item] of packagingInput.assets.entries()){
    const image=await resource(root,`output/dexian/image-observation-live/provider/run-tvvnay/context/image-${index+1}.jpg`,item.sha256);
    packaging.push({id:item.id,role:'observed-competitor-packaging',sourceUrl:item.provenance.sourcePageUrl,representation:'screenshot',provenanceState:'managed-image-observation-history',...image,limitations:['竞品观察截图，不是得闲实物。','不证明25岁用户偏好、购买意愿或使用体验。']});
  }
  return {schemaVersion:'local-acceptance-assets-v1',purpose:'source-linked engineering acceptance; not creative approval',m6:{posters,coverage:'partial; not a completed five-year survey',historicalAiArtApproved:false},dexian:{packaging,realProductImageAvailable:false,realMockupAvailable:false},layout:{userApprovedScope:'layout only',reference:'sites/light-baijiu-research/public/m6-editorial/prototype-v3',plan:'output/auto-layout/checks/editorial/plan.json',brand:'output/auto-layout/inputs/brand.json',assets:'output/auto-layout/inputs/assets.json'},generatedMockup:{relativePath:'output/auto-layout/assets/outdoor.png',representation:'generated-test-scene',realPlacement:false}};
}
