import test from 'node:test';
import assert from 'node:assert/strict';
import {localLayoutApplicationRequirements,localLayoutToolStatus,prepareLocalLayoutRuntime} from './local-layout-resource-bridge.mjs';
import {localLayoutAssets} from './local-acceptance-layout-driver.mjs';
import {engineeringMockupFrame} from '../auto-layout/local-engineering-mockup.mjs';
const digest='a'.repeat(64);
function input(){const directions=['steady','product','user'].map(id=>({directionId:id,targets:[{imageId:id,kind:'packaging'}]}));return {source:{visual:{directions},images:directions.map(d=>({imageId:d.directionId,sha256:digest})),obligations:directions.map(d=>({kind:'image',value:{imageId:d.directionId}}))},manuscript:{pageIntents:directions.map(d=>({imageIds:[d.directionId]}))},imageRecords:directions.map(d=>({imageId:d.directionId,sha256:digest,path:'/managed/'+d.directionId+'.png'}))};}
test('every actual target requires explicit matching application, empty mockups cannot pass full sample',()=>{
 const i=input(),required=localLayoutApplicationRequirements({source:i.source,caseId:'dexian'});assert.equal(required.length,3);assert(required.every(r=>r.purpose==='packaging-concept-board'));
 assert.throws(()=>localLayoutAssets({...i,requiredApplications:required}),{code:'LOCAL_LAYOUT_REQUIRED_APPLICATION_MISSING'});
 assert.throws(()=>localLayoutApplicationRequirements({source:i.source,caseId:'dexian',requiredApplications:[]}),{code:'LOCAL_LAYOUT_REQUIRED_APPLICATION_COVERAGE'});
 i.source.task={requiredApplications:required};assert.throws(()=>localLayoutAssets({...i,requiredApplications:[]}),{code:'LOCAL_LAYOUT_TASK_APPLICATIONS_CHANGED'});
});
test('packaging uses controlled flat panel instead of pretend phone or curved bottle render',()=>{
 const i=input(),requiredApplications=localLayoutApplicationRequirements({source:i.source,caseId:'dexian'}),mockups=requiredApplications.map((r,n)=>({...r,asset:{id:'mock-'+n,path:'/managed/mock-'+n+'.png',sha256:digest},aperture:engineeringMockupFrame({purpose:r.purpose,artWidth:1280,artHeight:720}).aperture}));
 const result=localLayoutAssets({...i,requiredApplications,mockups});assert.match(result.assets['mock-0'].source.description,/not bottle wrapping/);assert.equal(result.assets.steady.application.purpose,'packaging-concept-board');
 mockups[0].purpose='phone';assert.throws(()=>localLayoutAssets({...i,requiredApplications,mockups}),{code:'LOCAL_LAYOUT_MOCKUP_PURPOSE_UNSUPPORTED'});
});
test('flat frame aperture preserves actual original aspect for all declared view ratios without rendering',()=>{
 for(const [artWidth,artHeight]of [[1280,720],[720,1280],[500,500]])for(const purpose of ['phone','outdoor','elevator','packaging-flat-front','packaging-concept-board']){
  const f=engineeringMockupFrame({purpose,artWidth,artHeight});assert(Math.abs((f.aperture.w*f.width)/(f.aperture.h*f.height)-artWidth/artHeight)<1e-12);assert(f.aperture.x>=0&&f.aperture.y>=0&&f.aperture.x+f.aperture.w<=1&&f.aperture.y+f.aperture.h<=1);
 }
 assert.throws(()=>engineeringMockupFrame({purpose:'real-3d-bottle',artWidth:1280,artHeight:720}),{code:'LOCAL_MOCKUP_FRAME_INVALID'});
});
test('missing actual native paths fail not_configured before resources or exports are touched',async()=>{
 assert.equal((await localLayoutToolStatus()).status,'not_configured');assert.equal((await prepareLocalLayoutRuntime({})).reason,'LOCAL_LAYOUT_NATIVE_TOOL_PATHS_REQUIRED');
 const tools=Object.fromEntries(['node','engine','nativeCheck','python','soffice','bash','nativeRuntime','presentationsSkill'].map(k=>[k,'/not-a-real-local-tool/'+k]));assert.equal((await localLayoutToolStatus(tools)).status,'not_configured');
});
test('binary preflight requires execute bits only on actual executable slots',async()=>{
 const {mkdtemp,writeFile,chmod,mkdir,realpath}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join}=await import('node:path');
 const root=await realpath(await mkdtemp(join(tmpdir(),'layout-tool-mode-'))),tools={};
 for(const key of ['node','engine','nativeCheck','python','soffice','bash']){tools[key]=join(root,key);await writeFile(tools[key],'small opaque tool-mode fixture',{mode:0o755});}
 for(const key of ['nativeRuntime','presentationsSkill']){tools[key]=join(root,key);await mkdir(tools[key]);}
 await chmod(tools.engine,0o644);await chmod(tools.nativeCheck,0o644);assert.equal((await localLayoutToolStatus(tools)).status,'configured');
 for(const key of ['node','python','soffice','bash']){await chmod(tools[key],0o644);const result=await localLayoutToolStatus(tools);assert.equal(result.status,'not_configured');assert.equal(result.tool,key);await chmod(tools[key],0o755);}
 assert.equal((await localLayoutToolStatus(tools)).status,'configured');
});
