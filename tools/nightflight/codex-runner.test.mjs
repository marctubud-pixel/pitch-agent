import {createHash} from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { validateResearchDigest, reviewedFindings, missingResearchCoverage } from './research-digest.mjs';
import { createStageRunner } from './codex-runner.mjs';

const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNgYGAAAAAEAAH2FzhVAAAAAElFTkSuQmCC';
const competitorPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAKAAAADwCAAAAACiKjAGAAAAPElEQVR4nO3BAQ0AAADCoPdPbQ8HFAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPBpbwAAHEOZGbAAAAAElFTkSuQmCC','base64');
// Used only by the test CLI, which gets a new thread and private request for each call.
function copyFixture(input, action) {
  const step = input.match(/COPY_([A-Z_]+)/)?.[1];
  const packet = JSON.parse(input.split('实际项目输入（JSON）').at(-1));
  const source = '制作测试茶的包装概念稿';
  const directions = ['山风', '晨雾', '旧街'].map((name, i) => ({
    id: ['A','B','C'][i], duty: ['emotion','continuity','feature'][i],
    name, basis: source, claim: name + '的主张', mechanism: name + '的创意方法', strategyLink: name + '承接策略',
    main: name + '原稿主文', risk: name + '的风险',
  }));
  if (!['CREATE','REVISE'].includes(step) && (input.includes('的创意方法') || input.includes('承接策略'))) throw Error('评审泄露作者创作说明');
  if (step === 'CREATE') {
    if (action === 'badcopy') directions[2].duty = directions[0].duty;
    if (!input.includes('slogan-engine') || !input.includes('寻找连接与改句')) throw Error('创作没有加载口号方法');
    return {directions};
  }
  if (step === 'ANONYMOUS') {
    if (Object.keys(packet).sort().join() !== 'candidates,role' || input.includes(source) || input.includes('盲测污染哨兵')) throw Error('匿名首读泄露任务');
    return {items:packet.candidates.map(c => {
      if (Object.keys(c).sort().join() !== 'directionId,main') throw Error('匿名稿泄露创意解释');
      return {directionId:c.directionId,reading:'读到'+c.main,uncertainty:'品牌身份待了解'};
    })};
  }
  if (step === 'REVISE') {
    if (['copy-clarify','copy-clean'].includes(action)) throw Error('同稿纠正不该调用创作岗');
    if (!input.includes('寻找连接与改句')) throw Error('改稿没有加载口号方法');
    const revised=structuredClone(packet.draft.directions);
    if (action==='copy-frozen' && packet.failures) revised[0].main+='越权改稿';
    revised[1].main=packet.failures ? revised[1].main+'（再澄清）' : '晨雾修改后主文';
    return {baseHash:action==='copy-stale' && packet.failures ? '旧稿' : packet.baseHash,
      draft:{directions:revised},changes:['澄清晨雾主文']};
  }
  if (step === 'CRITIC_BLIND') {
    if (action === 'copy-clean') return {items:directions.map(d=>({directionId:d.id,risk:'',evidence:''}))};
    if (packet.vote || packet.dimensions || packet.firstVotes || input.includes('盲测污染哨兵')) throw Error('对抗首读泄露原票');
    const items=packet.draft.directions.map(d => ({directionId:d.id,risk:'检查能否读懂该案',evidence:d.main}));
    if (packet.role === 'brand') {
      const d=packet.draft.directions.find(d=>d.id==='B');
      items.push({directionId:d.id,risk:'标题还可能误读产品身份',evidence:d.main});
    }
    return {items};
  }
  if (['FIRST','RECHECK'].includes(step)) {
    if (step === 'FIRST' && (!packet.anonymousRead || !input.includes(source) || input.includes('盲测污染哨兵'))) throw Error('评分未取得封存首读与依据');
    if (action==='copy-observe-only') return {items:packet.draft.directions.map(d=>({
      directionId:d.id,decision:'hold',reason:'对复述有保留',hardRejects:['建议另测记忆'],blockers:['场景印象待核'],
      scores:packet.criteriaByDirection[d.id].slice(0,{copy:0,brand:1,user:2,comms:3}[packet.role]).map((dimension,i)=>({dimension,score:i===0?null:3,evidence:d.main,
        reason:'属于本岗观察，留给总监核对原句',scope:'本组标题'})),
    }))};
    return {items:packet.draft.directions.map((d) => {
      const low = action !== 'copy-clean' && d.id === 'B' && (packet.role === 'user' || action==='copy' && packet.role==='brand') && (step === 'FIRST' || action === 'copy-blocked' || action==='copy-polish-recheck' && !packet.priorAdjudication);
      return {directionId:d.id,decision:low?'revise':'pass',reason:'本案说明'+d.main,
        hardRejects:[],blockers:low?['需澄清用途']:[], scores:packet.criteriaByDirection[d.id].map((dimension) => ({
          dimension,score:low && dimension==='单句读得懂，念得顺'?3:4,evidence:action==='copy-meta-evidence'?source:d.main,reason:'据同版主文可以判断',scope:'本组文字概念',
        }))};
    })};
  }
  if (step === 'CHALLENGE') {
    if (!packet.vote || !packet.blindRead) throw Error('对应对抗缺原票或首读');
    const dimension=packet.vote.items[0].scores[0]?.dimension || packet.criteriaByDirection.A[0];
    const coverage=packet.blindRead.items.map(read=>({
      readId:read.readId,directionId:read.directionId,dimension,reason:'核对本案原评范围',
    }));
    if (action === 'copy-missing-coverage' && packet.role === 'brand') coverage.pop();
    const b=packet.draft.directions.find(d=>d.id==='B');
    const initial=b.main==='晨雾原稿主文';
    if (action==='copy-observe-only' && packet.role==='copy') return {coverage,items:[{
      directionId:'B',dimension:'单句读得懂，念得顺',objection:'原票未查复述是否受影响',evidence:b.main,action:'记录复述观察',blocking:false,
    }]};
    const fresh=action.startsWith('copy-new-challenge') && b.main==='晨雾修改后主文';
    return {coverage,
      items:action !== 'copy-clean' && packet.role === 'user' && (initial || fresh) ? [{
        directionId:'B',dimension:'单句读得懂，念得顺',objection:fresh?'新稿新增读者歧义':'核查原判引用',
        evidence:b.main,action:'复核读者理解',blocking:true,
      }]:[]};
  }
  if (step==='PLAN' && action==='copy-observe-only') return {rulings:packet.issues.map(x=>({
    challengeId:x.id,criterion:'推荐观察',problem:'复述时是否优先想起品牌',verdict:'accepted_later',action:'none',reason:'本案已完成职责，推荐另论',
  }))};
  if (step === 'PLAN') return {rulings:packet.issues.map(issue=>({challengeId:issue.id,criterion:'单句读得懂，念得顺',problem:'原句用途指代不清',verdict:'accepted_now',action:action==='copy-clarify' || (action==='copy-polish-recheck' && packet.initialDraft.directions[1].main!=='晨雾原稿主文') || (action==='copy-mixed' && issue.origin==='score') ? 'recheck':'revise',reason:'按原句核对使用情境'}))};
  if (step === 'REPAIR_PLAN') {
    if (action==='copy-polish-tool-error') throw Error('模拟工具中断');
    return {baseHash:packet.baseHash,actions:packet.failures.map(f=>{
      const d=packet.draft.directions.find(d=>d.id==='B' && f.eligible.includes(d.id))
        || packet.draft.directions.find(d=>f.eligible.includes(d.id));
      return {issueId:f.id,directionId:d.id,action:['copy-blocked','copy-similar'].includes(action)?'pause':action==='copy-new-challenge-bypass'?'recheck':
        action==='copy-polish-recheck'?'recheck':'revise',evidence:d.main,reason:'按本案的实际条件核对'};
    })};
  }
  const followupCase=['copy-polish','copy-frozen','copy-stale','copy-budget','copy-polish-tool-error'].includes(action);
  const distinct=action!=='copy-similar' && action!=='copy-budget' &&
    (!followupCase || packet.draft?.directions[1].main.includes('再澄清'));
  if (step === 'ADJUDICATE') return {ready:true,reason:'本地概念阶段完成',
    recommendation:{directionId:'B',reason:'说明清楚',tradeoff:'适用范围有限',memory:'记忆点',retell:'复述方式',scene:'适用场景'},
    rulings:packet.requiredRulingIds.map(challengeId=>({challengeId,verdict:'resolved',reason:'已按原始裁定核验'})),
    single:packet.draft.directions.map(d=>{
      const blocked=action==='copy-blocked' && d.id==='B';
      return {directionId:d.id,ready:!blocked,reason:blocked?'读者难以辨认对象':'主标题能独立阅读',
        checks:packet.criteriaByDirection[d.id].map(criterion=>({criterion,passed:!blocked || criterion!=='单句读得懂，念得顺',evidence:d.main,reason:'根据原句核验'}))};
    }),
    pairs:['AB','AC','BC'].map(pair=>({pair,distinct:pair==='AC' || distinct,reason:'逐对比对表达和使用情境'})),
    set:{ready:distinct,reason:'三案组内比较结论'}};
  throw Error('未知文案测试步骤');
}

const fake = `#!${process.execPath}
const fs = require('node:fs'); const path = require('node:path');
const args = process.argv.slice(2);
if (args.join(' ')==='login status') {
 const auth=fs.readFileSync(path.join(process.env.CODEX_HOME,'action'),'utf8');
 console.error(auth==='api-key'?'Logged in using an API key':'Logged in using ChatGPT');process.exit(0);
}
if (!args.includes('--ignore-user-config') || !args.includes('read-only') || !args.includes('shell_tool') || process.env.OPENAI_API_KEY) process.exit(3);
const home = process.env.CODEX_HOME;
const action = fs.readFileSync(path.join(home,'action'),'utf8');
const id = require('node:crypto').randomUUID();
let input=''; process.stdin.setEncoding('utf8');
process.stdin.on('data',x=>input+=x);
process.stdin.on('end',()=>{
 console.log(JSON.stringify({type:'thread.started',thread_id:id}));
 if(action==='failed'){console.log('{"type":"turn.failed"}'); process.exitCode=1;return;}
 if(!action.startsWith('copy') && action!=='badcopy' && !(action==='image' && (input.includes('独立读图者') || input.includes('视觉参考原图登记'))) && !input.includes('独立研究编辑') && !input.includes('测试茶')) process.exit(4);
 if(action==='pdf' && !input.includes('NIGHTFLIGHT PDF TEST')) process.exit(8);
 if(action==='final' && (!input.includes('ppt/slides/slide140.xml') || !input.includes('实际页面证据') || input.includes('大块预览输入'))) process.exit(6);
 if(action==='attachment' && (!input.includes('只有附件才有的词') || !args.includes('--image'))) process.exit(7);
 let body = {body:'按材料制订测试茶任务卡'};
 if(action.startsWith('research-')){
   const schema=JSON.parse(fs.readFileSync(args[args.indexOf('--output-schema')+1],'utf8')).properties;
   if(action==='research-followup' && !input.includes('用户暂不确定渠道'))process.exit(10);
   if(schema.queries) body={queries:['公开茶类年报']};
   else if(schema.findings) {
     console.log(JSON.stringify({type:'item.completed',item:{type:'web_search',action:{type:'search',queries:['测试公开品类']}}}));
     body={findings:[{chapter:'行业与市场',conclusion:'茶礼场景更强调赠礼用途',source:'合成行业报告',url:'https://source.example.org/report',evidence:action==='research-fiction'?'这是虚构引文':'本次样本单列礼盒用途',implication:'策略需比较礼赠与日常使用情境'}],gaps:['渠道尚未选定'],next:'比较可核实的渠道样本'};
     if(action==='research-brief-only') Object.assign(body.findings[0],{
       chapter:'产品与品牌',conclusion:'演练产品条件',source:'brief-test.md',url:'',evidence:'配料为水和燕麦',implication:'以配方为条件比较表达'
     });
     if(action==='research-ok') {
       const names=['礼盒上架','供应商进入','礼盒容量','包装品类字','购买渠道','茶味偏好'];
       body.findings=names.map((name,i)=>({...body.findings[0],chapter:i===4?'行业与市场':body.findings[0].chapter,conclusion:name,evidence:name}));
     }
     if(action.startsWith('research-board')) body.competitorPages=[{url:'https://source.example.org/product',title:'测试茶包装',imageUrl:''}];
     if(action==='research-followup')body.findings=[];
   } else if(schema.samples) {
     const packet=JSON.parse(input.split('实际项目输入（JSON）').at(-1));
     if (!args.includes('--image') || packet.sources.length!==1) process.exit(25);
     body={samples:[{source:packet.sources[0].source,title:'样本茶盒',observation:'包装中央标有茶类'}],conclusion:'该样本正面标出品类',implication:'比较正面字序'};
   } else if(schema.digest) {
     if (!args.includes('web_search="disabled"') || input.includes('用户暂不确定渠道') || !input.includes('独立研究编辑')) process.exit(19);
     const {findings}=JSON.parse(input.split('实际项目输入（JSON）').at(-1));
     body={digest:findings.map(f=>({chapter:f.chapter,findingIndex:f.findingIndex,title:f.conclusion,detail:f.evidence}))};
   } else if(schema.accepted){
     if(!input.includes('独立会话') || !(input.includes('本次样本单列礼盒用途') || input.includes('配料为水和燕麦') || input.includes('礼盒上架')))process.exit(11);
     body={ready:['research-ok','research-brief-only','research-thin'].includes(action),accepted:[0],labels:[],question:'优先门店还是线上？还有多少预算？',gaps:[],next:'结合渠道验证礼赠方向'};
     if(action.startsWith('research-board')) {
       const packet=JSON.parse(input.split('实际项目输入（JSON）').at(-1));
       const index=packet.research.findings.findIndex(f=>f.images?.[0]?.title==='样本茶盒');
       if (!args.includes('--image') || index<0) process.exit(26);
       if (action==='research-board-accept') {
         body.accepted.push(index);
         body.labels.push({findingIndex:index,chapter:'竞争与同类传播',angle:'画面与信息层级'});
       }
     }
     if(action==='research-thin') body.labels=[{findingIndex:0,chapter:'人群与接触情境',angle:'使用场景与时机'}];
     if(action==='research-ok') {
       const labels=[['行业与市场','品类创新与变化'],['行业与市场','供给与竞争格局'],['竞争与同类传播','规格与商品组合'],['竞争与同类传播','画面与信息层级'],['人群与接触情境','购买行为与渠道'],['人群与接触情境','选择偏好与顾虑']];
       body.labels=labels.map(([chapter,angle],findingIndex)=>({chapter,angle,findingIndex}));
       body.accepted=labels.map((_,i)=>i);
     }
   } else process.exit(12);
 }
 if(action==='strategy-return')body={body:'当前研究缺少适用依据。',researchReturn:'请补查本地渠道的实际接触场景'};
 if(action.startsWith('copy') || action==='badcopy') body=(${copyFixture.toString()})(input,action);
 if(action==='disabled-host') console.log(JSON.stringify({type:'item.completed',item:{type:'error',message:'code-mode host is disabled'}}));
 if(input.includes('视觉参考检索词')){
   const ctx=JSON.parse(input.split('实际项目输入（JSON）').at(-1));
   fs.writeFileSync(path.join(home,'视觉参考检索词.json'),JSON.stringify(ctx));
   body={queries:[ctx.previousQueries?.length?'tea cup':'tea ceremony']};
 } else if(input.includes('公开参考包独立评分')){
   const ctx=JSON.parse(input.split('实际项目输入（JSON）').at(-1));
   body={items:ctx.dimensions.map(d=>({dimension:d,score:ctx.role==='brand' && ctx.references.some(r=>r.query==='tea ceremony')?3:4,evidence:'瓶口的色块与当前产品层次'})),hardReject:''};
 } else if(input.includes('公开参考包对抗')){
   body={issue:'',evidence:'核对瓶口和品牌色'};
 } else if(input.includes('公开参考包独立裁定')){
   body={decisions:['visual','brand','user','spread'].map(role=>({role,accepted:false,reason:'已核原票'})),compatible:true,reason:'画面与用途互补'};
 } else if(input.includes('视觉参考原图登记')){
   const rows=JSON.parse(input.split('实际项目输入（JSON）').at(-1));
   body={observations:rows.map(r=>({source:r.source,visible:'原图可见的画面特征'}))};
 } else if(input.includes('视觉负责人分派参考图')){
   const packet=JSON.parse(input.split('实际项目输入（JSON）').at(-1));
   fs.writeFileSync(path.join(home,'视觉负责人分派参考图.json'),JSON.stringify(packet));
   body={sharedBrand:packet.sources.filter(s=>s.name==='测试茶标志.png').map(s=>({source:s.source,borrow:'本案标志',apply:'保持标志一致'})),directions:packet.directions.map((d,i)=>{
     const refs=packet.sources.filter(s=>s.searchDirection===d.name || s.name.startsWith(d.name) || (d.name==='晨雾' && s.name==='同类包装.png'));
     const use=r=>({source:r.source,borrow:'参考图可见的局部',apply:'作为本案用色依据',why:'帮助说明产品特征',avoid:'不沿用对方的标志与瓶标图案'});
     return {direction:d.name,main:refs.slice(0,1).map(use),auxiliary:refs.slice(1,3).map(use),gap:refs.length?'':'缺原图'};
   })};
 } else if(action==='image' && args.includes('--output-schema')){
   if(args[args.indexOf('image_generation')-1]!=='--disable')process.exit(9);
   const props=JSON.parse(fs.readFileSync(args[args.indexOf('--output-schema')+1])).properties;
   const count=args.filter(x=>x==='--image').length;
   if(props.first){
     if(count!==1 || input.includes('晨雾') || input.includes('测试茶'))process.exit(9);
     body={first:'第一眼',action:'泉水入杯',words:'品牌',alternative:'其他读法'};
   } else if(props.indices){
     body={packaging:true,indices:count?[1]:[]};
   } else {
     if(count!==5 && count!==6)process.exit(9);
     const fields=props.items.items.properties;
     body={items:[1,2,3].map(n=>({candidate:n,reason:'可见依据',...(fields.score?{score:[4,5,3][n-1]}:{}),...(fields.priority?{priority:n,blocked:false,edit:'放大水源说明',research:'核查产品资料'}:{})}))};
   }
 } else if(action==='image' || action==='other-thread'){
   if(args[args.indexOf('code_mode_host')-1]!=='--enable'||args[args.indexOf('image_generation')-1]!=='--enable')process.exit(9);
   if (!['山风','晨雾','旧街'].some(n=>input.includes('指定方向：'+JSON.stringify(n)))) process.exit(5);
   const received=args.flatMap((arg,i)=>arg==='--image'?[require('node:crypto').createHash('sha256').update(fs.readFileSync(args[i+1])).digest('hex')]:[]);
   fs.appendFileSync(path.join(home,'generation-inputs.jsonl'),JSON.stringify({direction:JSON.parse(input.split('实际项目输入（JSON）').at(-1)).referenceHandoff.direction,received})+'\\n');
   const folder=path.join(home,'generated_images',action==='image'?id:require('node:crypto').randomUUID());
   fs.mkdirSync(folder,{recursive:true});
   const z=require('node:zlib');
   const chunk=(name,bytes)=>{ const data=Buffer.concat([Buffer.from(name),bytes]);const n=Buffer.alloc(4),crc=Buffer.alloc(4);n.writeUInt32BE(bytes.length);crc.writeUInt32BE(z.crc32(data));return Buffer.concat([n,data,crc]); };
   const count=fs.readdirSync(path.join(home,'generated_images')).length;
   const header=Buffer.from('00000001000000010802000000','hex');
   const output=Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',header),chunk('IDAT',z.deflateSync(Buffer.from([0,count,78,90]))),chunk('IEND',Buffer.alloc(0))]);
   fs.writeFileSync(path.join(folder,'exec-'+id+'.png'),output);
 }
 fs.writeFileSync(args[args.indexOf('-o')+1],args.includes('--output-schema')?JSON.stringify(body):'茶园晨雾概念稿');
 console.log('{"type":"turn.completed"}');
});`;

async function fixture(t, action, options={}) {
  const root = await mkdtemp(join(tmpdir(),'nightflight-model-test-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const home = join(root,'home'),dir=join(root,'attempt'),binary=join(root,'fake-codex');
  await Promise.all([mkdir(home),mkdir(dir),writeFile(binary,fake,{mode:0o700})]);
  await writeFile(join(home,'action'),action);
  const requests=[];
  const researchDependencies={
    lookup:async()=>[{address:'93.184.216.34',family:4}],
    transport:async ({url})=>{
      requests.push(url.href);
      if (url.href==='https://source.example.org/product') return {status:200,headers:{'content-type':'text/html'},body:Buffer.from('<title>测试茶包装</title><img src="/product.png">')};
      if (url.href==='https://source.example.org/product.png') return {status:200,headers:{'content-type':'image/png'},body:competitorPng};
      if(url.hostname==='lite.duckduckgo.com') throw Error('fixture discovery unavailable');
      if(url.hostname==='cn.bing.com') return {status:200,headers:{'content-type':'text/xml'},body:Buffer.from('<rss><channel><item><title>合成报告</title><link>https://source.example.org/report</link></item></channel></rss>')};
      return {status:200,headers:{'content-type':'text/html'},body:Buffer.from('<html><title>合成行业报告</title><p>本次样本单列礼盒用途。礼盒上架、供应商进入、礼盒容量、包装品类字、购买渠道、茶味偏好。</p></html>')};
    },
  };
  const runner = createStageRunner({binary,codexHome:home,model:'fixture',researchDependencies,...options});
  const project = {title:'测试茶',brief:'制作测试茶的包装概念稿',mode:'collab',attachments:[],artifacts:[],directions:['山风','晨雾','旧街'],choice:'晨雾'};
  return {home,dir, project, requests, run:(stage,overrides={})=>runner({stage,dir,project,...overrides})};
}

test('copy releases three reviewed directions only after blind votes, revision, rechecks and independent ruling',async t=>{
  const f=await fixture(t,'copy');
  f.project.feedback=[{stage:'copy',text:'盲测污染哨兵'}];
  const result=await f.run('copy');
  assert.deepEqual(result.directions,['山风','晨雾','旧街']);
  assert.equal((await readFile(join(f.dir,result.artifacts[0].name),'utf8')).trim(),
    '## 山风\n主标题：山风原稿主文\n\n## 晨雾\n主标题：晨雾修改后主文\n\n## 旧街\n主标题：旧街原稿主文');
  assert.equal(result.copyReview.protocol,'dual-panel-headline-v4');
  assert.equal(result.copyReview.status,'ready');
  assert.equal(result.copyReview.recommendation.directionId,'B');
  assert.equal(result.copyReview.initialDraft.directions[1].main,'晨雾原稿主文');
  assert.equal(result.copyReview.draft.directions[1].main,'晨雾修改后主文');
  for (const [votes,expected] of [[result.copyReview.firstVotes,3],[result.copyReview.finalVotes,4]]) {
    assert.deepEqual(new Set(votes.map(v=>v.role)),new Set(['copy','brand','user','comms']));
    const item=votes.find(v=>v.role==='user').items.find(d=>d.directionId==='B');
    assert.equal(item.scores.find(s=>s.dimension==='单句读得懂，念得顺').score,expected);
  }
  assert.equal(result.copyReview.decisionPlan.editRequests.length,1);
  assert.deepEqual(new Set(result.copyReview.decisionPlan.editRequests[0].observations.map(o=>o.role)),new Set(['brand','user']));
  const runs=await readdir(join(f.dir,'.codex-runs'));
  const receipts=await Promise.all(runs.map(async(id)=>JSON.parse(await readFile(join(f.dir,'.codex-runs',id,'receipt.json'),'utf8'))));
  assert.equal(receipts.length,result.copyReview.calls.length);
  assert.equal(new Set(receipts.map(r=>r.threadId)).size,receipts.length);
  assert.deepEqual(result.copyReview.criticReads.map(r=>r.role).sort(), ['brand','comms','copy','user']);
  assert.ok(result.copyReview.criticReads.every(r=>r.items.every(item=>!('scores' in item))));
  const brandReads=result.copyReview.criticReads.find(r=>r.role==='brand').items.filter(i=>i.directionId==='B');
  const coverage=result.copyReview.challenges.find(c=>c.role==='brand').coverage.filter(c=>c.directionId==='B');
  assert.equal(brandReads.length,2);
  assert.equal(new Set(brandReads.map(r=>r.readId)).size,2);
  assert.deepEqual(coverage.map(c=>c.readId),brandReads.map(r=>r.readId));
  assert.deepEqual(coverage.map(c=>c.independentRead),brandReads);
  assert.deepEqual(result.copyReview.adjudication.pairs.map(p=>p.pair).sort(),['AB','AC','BC']);
  assert.ok(receipts.every(r=>r.exitCode===0));
});
test('copy releases four approved criteria despite low independent scores and recommendation concerns',async t=>{
  const f=await fixture(t,'copy-observe-only');
  const {copyReview:r}=await f.run('copy');
  assert.ok(r.finalVotes.every(v=>v.items.every(i=>i.decision==='hold' && i.scores.every(s=>s.score===null || s.score===3))));
  assert.deepEqual(r.finalVotes.map(v=>v.items[0].scores.length),[0,1,2,3]);
  assert.equal(r.challenges.find(c=>c.role==='copy').items.length,1);
  assert.ok(r.challenges.find(c=>c.role==='copy').coverage.every(c=>c.originalObserved===false && c.originalEvidence===null));
  assert.ok(!r.calls.some(c=>['COPY_REVISE','COPY_RECHECK'].includes(c.phase)));
  for (const [i,duty] of ['用户氛围或情绪放大','稳健延续','品牌或产品特征放大'].entries()) {
    assert.deepEqual(r.adjudication.single[i].checks.map(c=>c.criterion),['事实准确，归属清楚','单句读得懂，念得顺','能接上本案策略',duty]);
    assert.ok(r.adjudication.single[i].ready);
  }
});
test('copy rejects factual background as quoted headline evidence',async t=>{
  const f=await fixture(t,'copy-meta-evidence');
  await assert.rejects(f.run('copy'),/缺少可定位的稿件原文/);
});
test('copy blocks when one of two risks on the same direction lacks coverage',async t=>{
  const f=await fixture(t,'copy-missing-coverage');
  await assert.rejects(f.run('copy'),/未逐条覆盖/);
  assert.ok(!(await readdir(f.dir)).some(n=>n.endsWith('.md')));
});
test('copy keeps actual empty critic findings and reuses unchallenged votes',async t=>{
  const f=await fixture(t,'copy-clean');
  const {copyReview:r}=await f.run('copy');
  assert.ok(r.challenges.every(c=>c.items.length===0 && c.coverage.length===3));
  assert.deepEqual(r.decisionPlan.rulings,[]);
  assert.ok(!r.calls.some(c=>['COPY_RECHECK','COPY_REVISE'].includes(c.phase)));
  assert.deepEqual(r.finalVotes.map(v=>v.runId),r.firstVotes.map(v=>v.runId));
});
test('copy corrects a mistaken vote on the identical draft through the original role',async t=>{
  const f=await fixture(t,'copy-clarify');
  const {copyReview:r}=await f.run('copy');
  assert.deepEqual(r.draft,r.initialDraft);
  assert.equal(r.panelHistory.length,1);
  assert.ok(!r.calls.some(c=>c.phase==='COPY_REVISE'));
  assert.deepEqual(r.calls.filter(c=>c.phase==='COPY_RECHECK').map(c=>c.role),['user']);
  const userScore = votes=>votes.find(v=>v.role==='user').items.find(d=>d.directionId==='B').scores.find(s=>s.dimension==='单句读得懂，念得顺').score;
  assert.equal(userScore(r.firstVotes),3);
  assert.equal(userScore(r.finalVotes),4);
});
test('copy preserves the same-draft correction before reviewing a separately required edit',async t=>{
  const f=await fixture(t,'copy-mixed');
  const {copyReview:r}=await f.run('copy');
  assert.notDeepEqual(r.initialDraft,r.draft);
  const correction=r.sameDraftRechecks.find(v=>v.role==='user');
  const original=r.firstVotes.find(v=>v.role==='user');
  const revised=r.finalVotes.find(v=>v.role==='user');
  assert.equal(correction.draftHash,original.draftHash);
  assert.notEqual(revised.draftHash,correction.draftHash);
  assert.ok(r.calls.findIndex(c=>c.runId===correction.runId) < r.calls.findIndex(c=>c.phase==='COPY_REVISE'));
});
test('copy cannot release individually ready directions when the set lacks differences',async t=>{
  const f=await fixture(t,'copy-similar');
  await assert.rejects(f.run('copy'),/整组|差异|裁定/);
  assert.ok(!(await readdir(f.dir)).some(n=>n.endsWith('.md')));
});
test('copy stays unpublished when a director criterion fails',async t=>{
  const f=await fixture(t,'copy-blocked');
  await assert.rejects(f.run('copy'), /单案待改|文案复核未通过/);
  assert.ok(!(await readdir(f.dir)).some(n=>n.endsWith('.md')));
});

test('copy polishes a refused direction and leaves the two accepted directions intact',async t=>{
  const f=await fixture(t,'copy-polish');
  const {copyReview:r}=await f.run('copy');
  assert.equal(r.polishRounds.length,1);
  const prior=r.polishRounds[0];
  assert.equal(prior.adjudication.set.ready,false);
  assert.deepEqual(r.draft.directions[0],prior.draft.directions[0]);
  assert.deepEqual(r.draft.directions[2],prior.draft.directions[2]);
  assert.notEqual(r.draft.directions[1].main,prior.draft.directions[1].main);
  assert.ok(r.adjudication.set.ready && r.adjudication.pairs.every(p=>p.distinct));
  assert.equal(new Set(r.finalVotes.map(v=>v.draftHash)).size,1);
  assert.equal(r.finalVotes[0].draftHash,prior.revisedHash);
});
test('copy reopens paired challenges and pre-edit rulings on every changed draft',async t=>{
  const f=await fixture(t,'copy-new-challenge');
  const {copyReview:r}=await f.run('copy');
  const panels=r.panelHistory;
  assert.equal(panels.length,3);
  assert.equal(new Set(panels.map(p=>p.draftHash)).size,3);
  for (const panel of panels) {
    assert.equal(panel.criticReads.length,4);
    assert.equal(panel.challenges.length,4);
    for (const c of panel.challenges) {
      assert.ok(c.draftHash===panel.draftHash &&
        panel.votes.some(v=>v.runId===c.voteRunId && v.draftHash===panel.draftHash) &&
        panel.criticReads.some(v=>v.runId===c.blindReadRunId && v.draftHash===panel.draftHash));
    }
  }
  const newIssue=panels[1].issues.find(i=>i.objection==='新稿新增读者歧义');
  assert.ok(newIssue);
  assert.ok(panels[1].decisionPlan.rulings.some(r=>r.challengeId===newIssue.id && r.action==='revise'));
  assert.match(r.draft.directions[1].main,/再澄清/);
  assert.ok(r.adjudication.rulings.some(r=>r.challengeId===newIssue.id));
});
test('copy rejects a repair plan that tries to bypass a required new-draft challenge edit',async t=>{
  const f=await fixture(t,'copy-new-challenge-bypass');
  await assert.rejects(f.run('copy'),/本版独立裁定/);
  assert.ok(!(await readdir(f.dir)).some(n=>n.endsWith('.md')));
});
test('copy can correct a rejected final score on the identical text without another author call',async t=>{
  const f=await fixture(t,'copy-polish-recheck');
  const {copyReview:r}=await f.run('copy');
  assert.equal(r.polishRounds.length,1);
  assert.deepEqual(r.polishRounds[0].draft,r.draft);
  assert.equal(r.calls.filter(c=>c.phase==='COPY_REVISE').length,1);
  assert.deepEqual(r.polishRounds[0].sameDraftRechecks.map(v=>v.role),['user']);
});
for (const [action,error] of [['copy-frozen',/冻结方向/],['copy-stale',/冻结原稿身份/],
  ['copy-budget',/打磨上限/],['copy-polish-tool-error',/调用失败/]]) {
  test('copy polishing halts safely: '+action,async t=>{
    const f=await fixture(t,action);
    await assert.rejects(f.run('copy'),error);
    const files=await readdir(f.dir);
    assert.ok(!files.some(name=>name.endsWith('.md')));
    const log=JSON.parse(await readFile(join(f.dir,files.find(name=>name.startsWith('copy-review-attempt-'))),'utf8'));
    assert.ok(log.polishRounds.length <= 2);
    assert.equal(log.status,'blocked');
  });
}
test('collaboration generates the chosen direction using the current thread PNG bytes',async t=>{
  const f=await fixture(t,'image');
  await writeFile(join(f.dir,'同类包装.png'),Buffer.from(png,'base64'));
  f.project.attachments.push({name:'同类包装.png'});
  const result=await f.run('visual');
  assert.equal(result.artifacts.length,5);
  assert.equal(result.artifacts[0].visual.blind.action,'泉水入杯');
  assert.deepEqual(result.artifacts[3].visual.references,['同类包装.png']);
  assert.match(result.artifacts[0].name,/^visual-2-/);
  assert.deepEqual(result.artifacts.slice(0,3).map(a=>a.visual.recommended),[false,true,false]);
  assert.match(result.artifacts[4].text,/晨雾/);
});
test('empty uploads automatically acquire public bytes and deliver their provenance with the matching visual',async t=>{
  const bytes=Buffer.from(png,'base64'), sha256=createHash('sha256').update(bytes).digest('hex');
  let calls=0;
  const first=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGMQqTUBAAFuAMYhEMypAAAAAElFTkSuQmCC','base64');
  const f=await fixture(t,'image',{visualSearch:async ({query,dir})=>{
    calls++; assert.equal(query,calls===1?'tea ceremony':'tea cup');
    const fetched=calls===1?first:bytes;
    const path=join(dir,'source.png');
    await writeFile(path,fetched);
    return [{path,name:'tea.png',sha256:createHash('sha256').update(fetched).digest('hex'),byteLength:fetched.length,mediaType:'image/png',query,pageUrl:'https://gallery.example/tea',sourceUrl:'https://gallery.example/tea.png'}];
  }});
  const strategy = '用可辨识的地景解释产品用水选择';
  await writeFile(join(f.dir,'strategy.md'),strategy);
  f.project.artifacts.push({kind:'text',stage:'strategy',name:'strategy.md'});
  const {artifacts}=await f.run('visual');
  for (const task of ['视觉参考检索词','视觉负责人分派参考图']) {
    const packet=JSON.parse(await readFile(join(f.home,task+'.json'),'utf8'));
    assert.equal(packet.strategy,strategy);
  }
  const original=artifacts.find(a=>a.visual?.role==='reference');
  assert.equal(calls,2);
  assert.equal(original.visual.direction,'晨雾');
  assert.deepEqual(await readFile(join(f.dir,original.name)),bytes);
  const mains=artifacts.filter(a=>a.visual?.role==='main');
  assert.equal(mains.length,3);
  for(const main of mains) {
    const {priorAdmissions,admission}=main.visual.referenceHandoff;
    assert.equal(priorAdmissions[0].passed,false);
    assert.equal(admission.votes.length,4);
    assert.equal(admission.passed,true);
    const [ref]=main.visual.referenceHandoff.references;
    assert.equal(ref.pageUrl,original.visual.pageUrl);
    assert.equal(ref.name,original.name);
  }
  const inputs=(await readFile(join(f.home,'generation-inputs.jsonl'),'utf8')).trim().split('\n').map(JSON.parse);
  assert.deepEqual(inputs.map(i=>i.received),[[sha256],[sha256],[sha256]]);
});
test('reference handoff rejects missing primary, duplicated originals and a reassigned private image before dispatch',async()=>{
  const {selectVisualReferences}=await import('./visual-references.mjs');
  const project={directions:['A','B','C'],brief:'包装'};
  const source={imageId:'ref_1',sha256:'7'.repeat(64),name:'primary.png'};
  const alias={...source,name:'alias.png',imageId:'ref_2'};
  const use={source:source.imageId,borrow:'弧形',apply:'在瓶肩转译弧形'};
  async function plan(assignments,previousVisual){
    const call=async(instruction,images)=>{
      assert.deepEqual(images,[source]);
      return {threadId:'selection',parsedOutput:{sharedBrand:[],directions:project.directions.map(direction=>({
        direction,main:assignments.includes(direction)?[use]:[],auxiliary:[],gap:'缺主参考',
      }))}};
    };
    return selectVisualReferences({call,project:{...project,previousVisual},images:[source,alias],active:['B']});
  }
  await assert.rejects(plan([]),/B.*缺主参考/);
  await assert.rejects(plan(['A','B']),/专用参考图发生冲突/);
  await assert.rejects(plan(['B'],[{visual:{direction:'A',referenceHandoff:{references:[source]}}}]),/专用参考图发生冲突/);
  await assert.rejects(selectVisualReferences({project,images:[],active:['B']}),/对话区.*重试/);
});

test('all nine generator packets contain exactly the reference bytes assigned to that direction',async t=>{
  const f=await fixture(t,'image');
  const originals=[png,'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGMQqTUBAAFuAMYhEMypAAAAAElFTkSuQmCC','iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGMIqDUBAAIiAQIUhcD8AAAAAElFTkSuQmCC','iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGOYVmsCAAL0AUjegoXyAAAAAElFTkSuQmCC'];
  const names=['山风主参考.png','晨雾主参考.png','旧街主参考.png','晨雾辅助.png','测试茶标志.png'];
  const hashes=[];
  for(const [i,name] of names.entries()){
    const bytes=Buffer.from(originals[i] ?? 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAE0lEQVR4nGP8//8/AwMDEwMYAAAkBgMBXaJOiAAAAABJRU5ErkJggg==','base64');
    hashes.push(createHash('sha256').update(bytes).digest('hex'));
    await writeFile(join(f.dir,name),bytes);
    f.project.attachments.push({name,visualOnly:i===4});
  }
  f.project.mode='auto';
  const result=await f.run('visual'),main=result.artifacts.filter(a=>a.visual?.role==='main');
  assert.equal(main.length,9);
  const runs=join(f.dir,'.codex-runs');
  const packets=await Promise.all((await readdir(runs)).map(async id=>JSON.parse(await readFile(join(runs,id,'input.json'),'utf8'))));
  const actual=(await readFile(join(f.home,'generation-inputs.jsonl'),'utf8')).trim().split('\n').map(line=>JSON.parse(line));
  for(const [i,direction] of f.project.directions.entries()){
    const expected=i===1?[hashes[1],hashes[4],hashes[3]]:[hashes[i],hashes[4]];
    const requests=packets.filter(p=>!p.outputSchema && p.prompt.includes('指定方向：'+JSON.stringify(direction)));
    assert.equal(requests.length,3);
    assert.deepEqual(actual.filter(r=>r.direction===direction).map(r=>r.received),[expected,expected,expected]);
    for(const request of requests) assert.deepEqual(request.images.map(s=>s.sha256),expected);
    for(const a of main.filter(a=>a.visual.direction===direction)){
      assert.deepEqual(a.visual.referenceHandoff.references.map(r=>r.sha256),expected);
      assert.ok(a.visual.referenceHandoff.references.every(r=>r.borrow && r.apply));
    }
  }
});

for (const [action,stage,error] of [['disabled-host','visual',/工具宿主未启用/],['other-thread','visual',/未留下原生生图文件/],['badcopy','copy',/方向|职责|探索/],['failed','brief',/调用失败/],['api-key','brief',/ChatGPT 账户/]]) {
  test('reject '+action+' without publishing business artifacts',async t=>{
    const f=await fixture(t,action);
    if (stage==='visual') {
      await writeFile(join(f.dir,'晨雾原图.png'),Buffer.from(png,'base64'));
      f.project.attachments.push({name:'晨雾原图.png'});
    }
    await assert.rejects(f.run(stage),error);
    assert.deepEqual((await readdir(f.dir)).filter(n=>!n.startsWith('.') && !n.startsWith('copy-review-attempt-') && n!=='晨雾原图.png'),[]);
  });
}
test('no unselected collaborative image, invented review or path traversal',async t=>{
  const f=await fixture(t,'failed');
  delete f.project.choice;
  await assert.rejects(f.run('visual'),/先选定/);
  await assert.rejects(f.run('final'),/PPTX/);
  f.project.attachments.push({name:'../outside.md'});
  await assert.rejects(f.run('brief'),/文件名无效/);
});

test('reads attachment bytes and gives real image paths to Codex',async t=>{
  const f=await fixture(t,'attachment');
  await writeFile(join(f.dir,'参考.md'),'只有附件才有的词');
  await writeFile(join(f.dir,'产品.png'),Buffer.from(png,'base64'));
  f.project.attachments.push({name:'参考.md'},{name:'产品.png'});
  assert.equal((await f.run('brief')).artifacts.length,1);
});
for (const [action, ready, count] of [
  ['research-ok', true, 6],
  ['research-thin', false, 1],
  ['research-blocked', false, 1],
  ['research-fiction', false, 0],
]) {
  test(
    action + ' executes discovery from a sparse brief and gates only on grounded findings and review',
    async (t) => {
      const f = await fixture(t, action);
      f.project.brief = '测试茶';
      f.project.previousResearch = { legacyText: '上次的待补问题' };
      const { research, artifacts } = await f.run('research');
      assert.equal(research.ready, ready);
      assert.equal(research.digestPending,ready ? true : undefined);
      if (ready) {
        const before = [...f.requests];
        Object.assign(f.project,{research,researchDigestOnly:true});
        const edited = await f.run('research');
        assert.equal(edited.researchDigest[0].findingIndex,0);
        assert.deepEqual(edited.artifacts,[]);
        assert.deepEqual(f.requests,before);
      }
      assert.equal(research.question,'');
      if (action==='research-thin') assert.match(research.next,/行业与市场还需补查/);
      assert.ok(artifacts[0].text.includes('调研方法版本：' + research.methodVersion));
      assert.equal(research.findings.length, count);
      assert.ok(f.requests.some((url) => url.startsWith('https://cn.bing.com/search?')));
      assert.ok(f.requests.includes('https://source.example.org/report'));
      assert.match(artifacts[0].text, /测试公开品类/);
      if (count) assert.match(artifacts[0].text, /本次样本单列礼盒用途|礼盒上架/);
      else assert.match(research.gaps.join(' '), /未从.*核对/);
    },
  );
}
test('keeps a verified brief fact without releasing strategy on the brief alone',async t=>{
  const f=await fixture(t,'research-brief-only');
  await writeFile(join(f.dir,'brief-test.md'),'项目输入：配料为水和燕麦');
  f.project.artifacts.push({stage:'brief',kind:'text',name:'brief-test.md'});
  const {research}=await f.run('research');
  assert.equal(research.findings[0]?.source,'brief-test.md');
  assert.equal(research.ready,false);
});

test('automatic research keeps a key gap without asking for a user decision', async (t) => {
  const f = await fixture(t, 'research-blocked');
  f.project.mode = 'auto';
  const {research} = await f.run('research');
  assert.equal(research.ready, false);
  assert.equal(research.question, '');
  assert.equal(research.findings.length, 1);
});

test('collaboration can ask its first decision after a follow-up obtains usable evidence', async (t) => {
  const f = await fixture(t, 'research-blocked');
  f.project.researchFollowup = true;
  f.project.previousResearch = {ready:false,findings:[],question:'',next:'定位礼赠的来源'};
  const {research} = await f.run('research');
  assert.equal(research.ready,false);
  assert.equal(research.findings.length,1);
  assert.equal(research.question,'优先门店还是线上？');
});

test('follow-up rechecks earlier evidence, considers user feedback and does not repeat a question', async (t) => {
  const f = await fixture(t, 'research-followup');
  const earlier = {chapter:'行业与市场', conclusion:'礼赠是此次样本中的一个场景', source:'上轮报告', url:'https://source.example.org/older', evidence:'本次样本单列礼盒用途', implication:'礼赠和日常用途可分别比较'};
  f.project.previousResearch = {question:'优先门店还是线上？',findings:[earlier]};
  f.project.researchFollowup = true;
  f.project.researchQuestionAnswered = true;
  f.project.feedback = [{stage:'research',text:'用户暂不确定渠道'}];
  const {research} = await f.run('research');
  assert.ok(f.requests.includes(earlier.url));
  assert.deepEqual(research.findings,[earlier]);
  assert.equal(research.question,'');
  assert.equal(research.ready,false);
});

test('strategy returns specific research question when the handoff cannot support a decision', async (t) => {
  const f = await fixture(t, 'strategy-return');
  assert.match((await f.run('strategy')).researchReturn, /实际接触场景/);
});
test('final reads native slide XML, excludes bulky deck JSON and records missing rendered pages',async t=>{
  const f=await fixture(t,'final');
  const requireApp=createRequire(new URL('../../apps/workbench-preview/package.json',import.meta.url));
  const {zipSync,strToU8}=requireApp('fflate');
  const slide = strToU8('<p:sld xmlns:p="urn:slide" xmlns:a="urn:text"><a:p><a:r><a:t>实际页面证据</a:t></a:r></a:p></p:sld>');
  const pptx = zipSync(Object.fromEntries(Array.from({length:140},(_,i)=>['ppt/slides/slide'+(i+1)+'.xml',slide])));
  await writeFile(join(f.dir,'排版.pptx'),pptx);
  await writeFile(join(f.dir,'排版.deck.json'),'大块预览输入');
  f.project.artifacts=[{stage:'layout',name:'排版.pptx',kind:'pptx'},{stage:'layout',name:'排版.deck.json',kind:'text'}];
  const result=await f.run('final');
  assert.match(result.artifacts[0].text,/页级视觉审查待完成/);
});

test('rejects excessive image count and unsupported attachment type before starting Codex',async t=>{
  const f=await fixture(t,'failed');
  f.project.attachments=Array.from({length:5},(_,i)=>({name:'参考'+i+'.jpg'}));
  await assert.rejects(f.run('brief'),/最多上传 4 张/);
  f.project.attachments=[{name:'简报.pages'}];
  await writeFile(join(f.dir,'简报.pages'),'content');
  await assert.rejects(f.run('brief'),/转换成 PDF/);
});

test('extracts a real uploaded PDF with the pinned local runtime and passes its page text to Codex',
  {skip:process.env.NIGHTFLIGHT_TEST_PDF!=='1' && 'requires a local PDF runtime and owned-child RSS monitoring'}, async t=>{
    const f=await fixture(t,'pdf');
    const content='BT /F1 16 Tf 10 30 Td (NIGHTFLIGHT PDF TEST) Tj ET';
    const objects=['<</Type /Catalog /Pages 2 0 R>>','<</Type /Pages /Count 1 /Kids [3 0 R]>>',
      '<</Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Contents 4 0 R /Resources <</Font <</F1 5 0 R>>>>>>',
      '<</Length '+content.length+'>>\nstream\n'+content+'\nendstream',
      '<</Type /Font /Subtype /Type1 /BaseFont /Helvetica>>'];
    let pdf='%PDF-1.4\n';
    const offsets=[0];
    for(const [i,obj] of objects.entries()){
      offsets.push(pdf.length);
      pdf+=(i+1)+' 0 obj\n'+obj+'\nendobj\n';
    }
    const xref=pdf.length;
    pdf+='xref\n0 6\n0000000000 65535 f \n'+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+'trailer\n<</Size 6 /Root 1 0 R>>\nstartxref\n'+xref+'\n%%EOF';
    await writeFile(join(f.dir,'上传简报.pdf'),pdf);
    f.project.attachments=[{name:'上传简报.pdf'}];
    f.project.brief=''; // Only attachment submitted; no duplicate plaintext is supplied.
    assert.equal((await f.run('brief')).artifacts.length,1);
});

test('visual batch ranks only eligible images, resolves ties and leaves an unsuccessful batch open', async () => {
  const { reviewVisualBatch } = await import('./visual-batch.mjs');
  async function rank(scores, blocked, packaging = false, findComparators) {
    return reviewVisualBatch({
      findComparators, makeBoard:async (_images,refs)=>({name:refs[0].name+' board'}),
      direction: '产品', context: '测试', images: [1,2,3].map(n => ({sha256: String(n)})),
      call: async (_prompt, _images, schema) => {
        if (schema.properties.first) return {parsedOutput:{first:'一瓶茶',action:'水入杯',words:'无糖',alternative:'不确定'}};
        if (schema.properties.indices) return {parsedOutput:{packaging,indices:_images.length?[1]:[]}};
        const fields = schema.properties.items.items.properties;
        const items = scores.map((score, i) => ({
          candidate: i+1, reason: '测试依据',
          ...(fields.score && {score}),
          ...(fields.priority && {priority: 3-i, blocked: blocked.includes(i+1), edit:'无', research:'无'}),
        }));
        return {threadId: 'test', parsedOutput: {items}};
      },
    });
  }
  assert.equal((await rank([5,4,4], [1])).winner, 3);
  assert.equal((await rank([5,3,3], [1])).winner, null);
  const missing = await rank([5,5,5],[],true);
  assert.equal(missing.winner,null);
  const searched=await rank([5,5,5],[],true,async()=>[{name:'公开同类正面对照',sha256:'comparator'}]);
  assert.equal(searched.winner,3);
  assert.equal(searched.board,'公开同类正面对照 board');
  assert.match(missing.candidates[0].research,/补充同类/);
  await assert.rejects(rank([4,0,5], []), /分数无效/);
});


test('editorial selections keep their source, chapter, quantities and visual board',()=>{
  const findings=[
    {chapter:'人群与接触情境',evidence:'口味为50.1%，价格为50.9%'},
    {chapter:'竞争与同类传播',evidence:'可见250mL纸盒',images:[{observation:'正面可见字体'}]},
    {chapter:'竞争与同类传播',evidence:'容量为200毫升'},
  ];
  const row=(findingIndex,detail)=>({chapter:findings[findingIndex].chapter,findingIndex,title:'判断',detail});
  const rows=[row(0,'口味占50.1%，价格占50.9%。'),row(1,'可见250毫升纸盒')];
  assert.deepEqual(validateResearchDigest(rows,findings).map(r=>r.findingIndex),[1,0]);
  assert.throws(()=>validateResearchDigest([row(0,'口味占51%。'),rows[1]],findings),/数值或单位/);
  assert.throws(()=>validateResearchDigest([row(0,'销量为50.1万'),rows[1]],findings),/数值或单位/);
  assert.throws(()=>validateResearchDigest([{...rows[1],chapter:rows[0].chapter}],findings),/归组/);
  assert.doesNotThrow(()=>validateResearchDigest([{chapter:'行业与市场',title:'零售额回落',detail:'2023年为6.12亿元，2024年为5.12亿元。',findingIndex:0}],[{chapter:'行业与市场',conclusion:'2023和2024年分别为6.12亿元和5.12亿元。'}]));
  const oldChannel=[{chapter:'行业与市场',evidence:'受访者中40.79%选择便利店'}];
  assert.equal(validateResearchDigest([{chapter:'人群与接触情境',title:'受访者在便利店购买',detail:'调查中40.79%选便利店。',findingIndex:0}],oldChannel)[0].chapter,'人群与接触情境');
  assert.throws(()=>validateResearchDigest([rows[0],{...rows[1],findingIndex:9}],findings),/不存在/);
  assert.equal(validateResearchDigest([rows[1]],findings).length,1);
  for (const detail of ['可供比较名称与品类的呈现方式','摘要未确认样本量','不能据此推断早餐时段销量']) {
    assert.throws(()=>validateResearchDigest([row(1,detail)],findings),/删除用途和局限尾注/);
  }
  assert.throws(()=>validateResearchDigest([{...rows[0],title:'建议先关注购买渠道'}],findings),/直陈/);
  assert.doesNotThrow(()=>validateResearchDigest([row(0,'在受访者中，50.9%选择价格。')],findings));

  assert.throws(()=>validateResearchDigest([],findings),/至少精选/);
});


test('independent observation labels correct consumer-reported channels and count distinct angles only',()=>{
  const record={chapter:'行业与市场',url:'https://example.org/report',evidence:'调查问受访者在哪购买',conclusion:'受访者提到便利店'};
  const findings=[record, {...record,conclusion:'受访者提到商超'}];
  const labels=findings.map((_,findingIndex)=>({findingIndex,chapter:'人群与接触情境',angle:'购买行为与渠道'}));
  const accepted=reviewedFindings(findings,[0,1],labels);
  assert.equal(findings[0].chapter,'行业与市场');
  assert.equal(accepted[0].chapter,'人群与接触情境');
  assert.equal(accepted[0].evidence,record.evidence);
  assert.ok(missingResearchCoverage(accepted).some(g=>g.startsWith('人群与接触情境还需补查 1')));
  assert.throws(()=>reviewedFindings([{...record,url:'',chapter:'产品与品牌'}],[0],[labels[0]]),/产品条件/);
  assert.throws(()=>reviewedFindings([{...record,images:[{}]}],[0],[labels[0]]),/只能支持/);
  assert.throws(()=>reviewedFindings(findings,[],[labels[0]]),/有效发现/);
});


test('after the targeted search nonblocking coverage gaps can accompany a grounded strategy handoff',async t=>{
  const f=await fixture(t,'research-thin');
  f.project.brief='测试茶';
  f.project.researchFollowup=true;
  const {research}=await f.run('research');
  assert.equal(research.ready,true);
  assert.equal(research.findings.length,1);
  assert.equal(research.findings[0].chapter,'人群与接触情境');
  assert.match(research.gaps.join(' '),/行业与市场还需补查/);
  Object.assign(f.project,{research,researchDigestOnly:true});
  const edited=await f.run('research');
  assert.equal(edited.researchDigest.length,1);
  assert.equal(edited.researchDigest[0].chapter,'人群与接触情境');
});


for (const decision of ['accept','reject']) {
  test('research publishes original packaging bytes only for the classified board the independent reviewer chooses: '+decision,async t=>{
    const f=await fixture(t,'research-board-'+decision);
    const {research,artifacts}=await f.run('research');
    const board=research.findings.find(row=>row.images?.length);
    const files=artifacts.filter(a=>a.kind==='image');
    const published=(await readdir(f.dir)).filter(name=>name.startsWith('research-peer-'));
    assert.ok(f.requests.includes('https://source.example.org/product.png'));
    if (decision==='reject') {
      assert.equal(board,undefined);
      assert.deepEqual(files,[]);
      assert.deepEqual(published,[]);
      return;
    }
    assert.equal(board.editorialAngle,'画面与信息层级');
    const [ref]=board.images;
    assert.equal(ref.sha256,createHash('sha256').update(competitorPng).digest('hex'));
    assert.equal(ref.pageUrl,'https://source.example.org/product');
    assert.equal(ref.sourceUrl,'https://source.example.org/product.png');
    assert.deepEqual(files,[{kind:'image',name:ref.name}]);
    assert.deepEqual(published,[ref.name]);
    assert.deepEqual(await readFile(join(f.dir,ref.name)),competitorPng);
  });
}
