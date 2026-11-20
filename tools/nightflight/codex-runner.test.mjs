import {createHash} from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { validateStrategyAdvice, validateResearchDigest, reviewedFindings, missingResearchCoverage } from './research-digest.mjs';
import { strategyCarrier, reviseFlaggedLines } from './strategy-one-pager.mjs';
import { createStageRunner } from './codex-runner.mjs';

const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNgYGAAAAAEAAH2FzhVAAAAAElFTkSuQmCC';
const competitorPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAKAAAADwCAAAAACiKjAGAAAAPElEQVR4nO3BAQ0AAADCoPdPbQ8HFAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPBpbwAAHEOZGbAAAAAElFTkSuQmCC','base64');
// Used only by the test CLI, which gets a new thread and private request for each call.
function copyFixture(input, action) {
  const step = input.match(/(?:COPY|SLOGAN)_([A-Z_]+)/)?.[1];
  const packet = JSON.parse(input.split('实际项目输入（JSON）').at(-1));
  const source = '制作测试茶的包装概念稿';
  const directions = ['山风', '晨雾', '旧街'].map((name, i) => ({
    id: ['A','B','C'][i], duty: ['emotion','continuity','feature'][i],
    name, basis: source, claim: name + '的主张', mechanism: name + '的创意方法', strategyLink: name + '承接策略',
    main: name + '原稿主文', risk: name + '的风险',
  }));
  if(input.includes('DIRECTOR_SELECT')) return {directionId:'B',reason:'适合简报',tradeoff:'偏稳健',memory:'特征',retell:'可复述',scene:'点单'};
  if (step==='EXPLORE') return {directions:directions.map(d=>({id:d.id,coordinates:'坐标',motive:'动机',connection:'连接',methods:'方法',candidates:[0,1,2].map(i=>({text:i?d.main+i:d.main,method:'短句'}))}))};
  if (['READING','APPEAL'].includes(step)) return {items:packet.lines.map(text=>({text,observation:'独立阅读',usable:true}))};
  if (step==='POLISH') return {directions:packet.plan.directions.map(d=>({id:d.id,original:d.candidates[0].text,killed:d.candidates.slice(1).map(c=>({text:c.text,reason:'不同的选择'})),versions:['','短','顺'].map(s=>({text:d.candidates[0].text+s,use:'包装',tradeoff:'取舍'})),sound:'节奏',backup:'备选',edits:'记录',extensions:'延展',risks:'风险'}))};
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
if (args.join(' ')==='--version') { console.log('codex-cli 0.167.0'); process.exit(0); }
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
 const stop=path.join(home,'stop-at');
 if(fs.existsSync(stop) && input.includes(fs.readFileSync(stop,'utf8'))){
   fs.unlinkSync(stop);process.exit(78);
 }
 if(action==='failed'){console.log('{"type":"turn.failed"}'); process.exitCode=1;return;}
 if(!action.startsWith('copy') && action!=='badcopy' && !(action==='image' && (input.includes('独立读图者') || input.includes('视觉参考原图登记'))) && !input.includes('发布前精简自己的文案') && !input.includes('从所附原文重新摘录') && !input.includes('比稿负责人整理研究摘要') && !input.includes('单张包装') && !input.includes('竞品原图观察') && !input.includes('只读所附网页原文') && !input.includes('只负责策略首页的表达盲读') && !input.includes('只处理独立读者指出的表达问题') && !input.includes('测试茶')) process.exit(4);
 if(action==='pdf' && !input.includes('NIGHTFLIGHT PDF TEST')) process.exit(8);
 if(action==='final' && (!input.includes('ppt/slides/slide140.xml') || !input.includes('实际页面证据') || input.includes('大块预览输入'))) process.exit(6);
 if(action==='attachment' && (!input.includes('只有附件才有的词') || !args.includes('--image'))) process.exit(7);
 let body = {body:'按材料制订测试茶任务卡'};
 if(['pdf','attachment'].includes(action)) {
   const quote=action==='pdf'?'NIGHTFLIGHT PDF TEST':'只有附件才有的词';
   body={briefScope:{status:'accepted',types:['packaging'],reason:'客户委托包装设计'},facts:[{label:'提案任务',quote,value:quote}],unknowns:[]};
 }
 if(action==='final-return'){
   if(input.includes('逐张检查页面')){
     if(!args.includes('--image')) process.exit(14);
     body={body:'第 1 页包装说明超出版心。'};
   } else if(input.includes('根据实际页面审读')){
     if(!input.includes('第 1 页包装说明超出版心')) process.exit(15);
     body={outcome:'return',returnStage:'layout',reason:'第 1 页包装说明超出版心，缩短标题后重排。'};
   }
 }
 if(action.startsWith('research-')){
   const schema=JSON.parse(fs.readFileSync(args[args.indexOf('--output-schema')+1],'utf8')).properties;
   if(action==='research-followup' && !input.includes('用户暂不确定渠道'))process.exit(10);
   if(schema.queries) {
     if(!args.includes('web_search="disabled"')) process.exit(30);
     body={queries:['公开茶类年报'],carrier:action==='research-combined'?'packaging+kv':input.includes('包装概念稿')?'packaging':'unspecified',anchorQuestions:action==='research-repair'?['仅一问？']:['渠道与货架？','竞品压力？','用户如何选择？','无传播节点。']};
     if(action==='research-pack-lookup') Object.assign(body,{visualCategory:'茶',packagingTerm:'包装盒',comparisonCategory:'茶饮',packagingBrands:[{name:'测试茶',officialDomain:'source.example.org'}]});
     if(action==='research-report-lookup') Object.assign(body,{queries:['即饮茶 市场 销量 销售额 价格带 报告','茶叶包装'],reportCategories:['即饮茶','茶饮','瓶装茶'],segmentTerms:['无糖茶']});
   }
   else if(schema.reads) {
     const {documents}=JSON.parse(input.split('实际项目输入（JSON）').at(-1));
     if(!documents[0].text.includes('无糖茶占20%'))process.exit(36);
     body={reads:[{url:documents[0].url,title:'合成行业报告',kind:'original',segmentQuote:'无糖茶占20%'}]};
   }
   else if(schema.anchorQuestions) { body={anchorQuestions:['渠道？','竞品？','人群？','节点？']}; }
   else if(schema.findings) {
     if (action==='research-combined' && !(input.includes('包装竞品：') && input.includes('KV竞品：'))) process.exit(31);
     console.log(JSON.stringify({type:'item.completed',item:{type:'web_search',action:{type:'search',queries:['测试公开品类']}}}));
     body={findings:[{chapter:'行业与市场',conclusion:'茶礼场景更强调赠礼用途',source:'合成行业报告',url:'https://source.example.org/report',evidence:action==='research-fiction'?'这是虚构引文':'本次样本单列礼盒用途',implication:'策略需比较礼赠与日常使用情境'}],gaps:['渠道尚未选定'],next:'比较可核实的渠道样本'};
     if(action==='research-pack-lookup') body.findings.push({...body.findings[0],chapter:'竞争与同类传播',conclusion:'文字称茶盒透明',describesPackagingAppearance:true});
     if(action==='research-scope') Object.assign(body.findings[0],{subject:'competitor',chapter:'竞争与同类传播'});
     if(action==='research-thin') Object.assign(body.findings[0],{subject:'audience',chapter:'人群与接触情境'});
     if(action==='research-repair') Object.assign(body.findings[0],{url:'https://source.example.org/blocked',source:'未能打开的报告',evidence:'改写过的、不见于网页的引文'});
     if(action==='research-brief-only') Object.assign(body.findings[0],{
       chapter:'产品与品牌',conclusion:'演练产品条件',source:'brief-test.md',url:'',evidence:'配料为水和燕麦',implication:'以配方为条件比较表达'
     });
     if(action==='research-ok') {
       const names=['礼盒上架','供应商进入','礼盒容量','包装品类字','购买渠道','茶味偏好'];
       body.findings=names.map((name,i)=>({...body.findings[0],chapter:i===4?'行业与市场':body.findings[0].chapter,conclusion:name,evidence:name}));
     }
     if(action.startsWith('research-board')) body.competitorPages=[{url:'https://source.example.org/product',title:'测试茶包装',imageUrl:''}];
     if(action==='research-followup')body.findings=[];
   } else if(schema.evidence) {
     body=action==='research-repair' ? {url:'https://source.example.org/report',evidence:'本次样本单列礼盒用途'} : {url:'',evidence:''};
   } else if(schema.front) {
     const packet=JSON.parse(input.split('实际项目输入（JSON）').at(-1));
     if(!args.includes('--image') || input.includes('source.example.org') || !packet.questions?.length || packet.brief)process.exit(56);
     body={brand:'测试茶',front:'包装中央标有茶类',regions:['中央']};
   } else if(schema.verifiedFront) {
     const packet=JSON.parse(input.split('实际项目输入（JSON）').at(-1));
     if(!packet.questions?.length || packet.brief || packet.firstObservation || packet.product)process.exit(56);
     body={visibleProduct:'测试茶',actualPackaging:true,categoryMatch:'同类',verifiedFront:'包装中央标有茶类',checks:[{question:'正面文字',location:'正面中央',marking:'茶类',status:'看清'}]};
   } else if(schema.samples) {
     const packet=JSON.parse(input.split('实际项目输入（JSON）').at(-1));
     if (!args.includes('--image') || packet.sources.length!==1) process.exit(25);
     if(action==='research-pack-lookup' && (packet.brief || packet.sources[0].pageUrl || packet.sources[0].sourcePassages))process.exit(56);
     body={samples:[{source:packet.sources[0].source,title:action==='research-pack-lookup'?'测试茶 · 样本茶盒':'样本茶盒',observation:'包装中央标有茶类',sameCategory:true,strategyGroup:'突出品类名称',creatorRationale:'以品类字突出茶类',rationaleSourceUrl:packet.sources[0].pageUrl,rationaleQuote:'设计方把茶类名放在中央',takeaway:'可借品类字读序，仅适用于正面展示。'}],conclusion:'该样本正面标出品类',implication:'比较正面字序'};
   } else if(schema.digest) {
     if (!args.includes('web_search="disabled"') || input.includes('用户暂不确定渠道') || !input.includes('比稿负责人整理研究摘要')) process.exit(19);
     const {findings}=JSON.parse(input.split('实际项目输入（JSON）').at(-1));
     body={strategyAdvice:[{recommendation:'优先测试品类信息',findingIndices:[findings[0].findingIndex]}],digest:findings.map(f=>({chapter:f.chapter,findingIndex:f.findingIndex,title:f.conclusion,detail:f.evidence}))};
   } else if(schema.edits) {
     if(input.includes('你是比稿负责人此次委托的临时执行者') || !args.includes('web_search="disabled"')) process.exit(27);
     const items=JSON.parse(input.split('实际项目输入（JSON）').at(-1));
     body={edits:items.map(({index})=>({index,conclusion:'礼盒主要用于赠礼',explanation:'样本将礼赠列为单独用途。',sourceDetail:'限本次样本。'}))};
     if(action==='research-compact' && !input.includes('上一版仍有长句')) body.edits[0].explanation='先说一个事实。又重复一次。';
   } else if(schema.rows) {
     if (input.includes('你是比稿负责人此次委托的临时执行者') || !input.includes('直接撰写客户读到的四块研究页')) process.exit(26);
     const packet=JSON.parse(input.split('实际项目输入（JSON）').at(-1));
     const rows=packet.evidence.map(f=>({chapter:f.chapter,conclusion:f.observation,explanation:f.evidence,evidenceIndices:[f.index],audienceTopic:f.chapter==='人群与接触情境'?'使用场景':'',surveyQuestion:f.chapter==='人群与接触情境'?'本次样本的使用场景是什么？':''}));
     body={rows,ready:['research-ok','research-brief-only','research-thin'].includes(action),
       question:action==='research-blocked' && packet.followup?'优先门店还是线上？还有多少预算？':'',
       gaps:packet.gaps.map(g=>({chapter:g.chapter || '产品与品牌',message:g.message})),next:'结合渠道验证礼赠方向'};
     if(action==='research-thin') body.gaps.push({chapter:'行业与市场',message:'行业与市场还需补查可比年份的销量'});
     if(action==='research-compact') rows[0].explanation='本次样本单列礼盒用途。对不同用途的逐项统计以及样本范围，均可在原报告中查看。';
     if(action==='research-scope') body.rows.unshift({...rows[0],chapter:'行业与市场'});
   } else process.exit(12);
 }
 if(action.startsWith('onepager-') && input.includes('你是独立读者，只负责策略首页的表达盲读。')) {
   const packet=JSON.parse(input.split('实际项目输入（JSON）').at(-1));
   if(Object.keys(packet).join()!=='page' || input.includes('测试茶') || args.includes('--image') || !args.includes('web_search="disabled"') || !input.includes('此次委托的临时执行者') || input.includes('访谈样本提及原味') ||
       input.includes('价格与配料属于任务卡') || input.includes('（发现2）') || input.includes('包装与 KV 一页策略')) process.exit(59);
   body={issues:action==='onepager-reader'?[{line:1,quote:'一眼认出',kind:'不直观',difficulty:'先看到包装的哪个信息？'}]:[]};
 } else if(action.startsWith('onepager-') && input.includes('只处理独立读者指出的表达问题')) {
   const packet=JSON.parse(input.split('实际项目输入（JSON）').at(-1));
   if(packet.issues.length!==1 || input.includes('此次委托的临时执行者')) process.exit(60);
   body={edits:[{line:1,operation:'改说法',original:packet.page[0].text,replacement:'在货架上先让顾客看清这盒茶是原味。'},{line:4,operation:'改说法',original:packet.page[3].text,replacement:'改变产品主张。'}]};
 } else if(action.startsWith('onepager-') && input.includes('请作为同一负责人精简这份策略首页')) {
   const packet=JSON.parse(input.split('实际项目输入（JSON）').at(-1));
   body={copy:{...packet.draft,coreStrategy:'让找原味的人一眼认出茶。'}};
   if(action==='onepager-bad-edit') body.copy.touchpoints=[];
 } else if(action.startsWith('onepager-')) {
   const packet=JSON.parse(input.split('实际项目输入（JSON）').at(-1));
   if (!input.includes('包装与 KV 一页策略') || packet.researchAdvice[0]?.findingNumbers?.join()!=='2' ||
       packet.findings.map(f=>f.findingNumber).join()!=='2' || !packet.brief.includes('测试茶')) process.exit(55);
   const derivation={text:'现有场景资料支持在盒面先放品类名。',findingNumbers:[action==='onepager-wrong-ref'?1:2]};
   const outcome={coreStrategy:'让顾客在货架前一眼认出这盒原味茶。（发现2）',insight:'顾客想选原味，又担心买到调味饮品。',brandRole:'让品类和配方读得清。',proposition:'优先表达原味。',actions:['正面放大茶类名。','品名旁写口味。','侧面并列配料。'],
     touchpoints:[{kind:'front',name:'正面',action:'展示品类。'},{kind:'side',name:'侧面',action:'解释配料。'},{kind:'back',name:'背面',action:'放产品说明。'}],
     metrics:[{name:'待测：品类识别率',method:'货架盲看记录正确人数占比（待测）'},{name:'口味复述准确率',method:'看图后口述并计数'},{name:'配料查找时间',method:'计时查找配料用时'}],
     constraints:'价格与配料属于任务卡的模拟设定。',opportunity:derivation,decision:derivation,priority:derivation,intersection:'货架辨认和原味表达相交。'};
   if (packet.carrier==='general') outcome.touchpoints=[{kind:'contact',name:'若在门店首次接触',action:'查看品名'}];
   if (packet.carrier==='kv') outcome.touchpoints=[];
   if (action==='onepager-front-kv') {
     if (packet.requiredFaces?.join()!=='front') process.exit(56);
     outcome.touchpoints=outcome.touchpoints.slice(0,1);
   }
   if (['kv','packaging+kv'].includes(packet.carrier)) outcome.touchpoints.push({kind:'kv',name:action==='onepager-front-kv'?'电商详情页首屏':'门店海报',action:'用瓶身衔接货架。'});
   if(['onepager-compact','onepager-bad-edit'].includes(action)) outcome.coreStrategy='让顾客在经过货架时注意到这一盒茶。再仔细看清品名、口味和配方。';
   if(action==='onepager-wrong-touch') outcome.touchpoints.pop();
   if(action==='onepager-scored') outcome.metrics[0].method='实测显示已提升40%';
   if(action==='onepager-internal') outcome.insight='模拟设定的测试茶。';
   body={outcome:action==='onepager-return'?{researchReturn:'请补查本地渠道的实际接触场景'}:outcome};
 }

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
 } else if(input.includes('比稿负责人分配参考图')){
   const packet=JSON.parse(input.split('实际项目输入（JSON）').at(-1));
   fs.writeFileSync(path.join(home,'比稿负责人分配参考图.json'),JSON.stringify(packet));
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
     body={items:[1,2,3].map(n=>({candidate:n,reason:'可见依据',...(fields.score?{score:[4,5,3][n-1]}:{}),...(fields.onPackStatus?{onPackStatus:'verified'}:{}),...(fields.priority?{priority:n,blocked:false,edit:'放大水源说明',research:'核查产品资料'}:{})}))};
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
   const rgb=require('node:crypto').createHash('sha256').update(input).digest().subarray(0,3);
   const header=Buffer.from('00000001000000010802000000','hex');
   const output=Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',header),chunk('IDAT',z.deflateSync(Buffer.from([0,...rgb]))),chunk('IEND',Buffer.alloc(0))]);
   fs.writeFileSync(path.join(folder,'exec-'+id+'.png'),output);
 }
 const invalidOnce=path.join(home,'invalid-once');
 if(fs.existsSync(invalidOnce) && input.includes(fs.readFileSync(invalidOnce,'utf8'))){
   fs.unlinkSync(invalidOnce);body={items:[]};
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
      if (url.pathname==='/blocked') return {status:403,headers:{'content-type':'text/html'},body:Buffer.from('拒绝访问')};
      if (url.href==='https://source.example.org/product') return {status:200,headers:{'content-type':'text/html'},body:Buffer.from('<title>测试茶包装</title><p>设计方把茶类名放在中央。</p><img src="/product.png">')};
      if (url.href==='https://source.example.org/product.png') return {status:200,headers:{'content-type':'image/png'},body:competitorPng};
      if(url.hostname==='lite.duckduckgo.com') throw Error('fixture discovery unavailable');
      if(action==='research-pack-lookup' && url.hostname==='cn.bing.com' && url.searchParams.get('q')==='测试茶 包装')
        return {status:200,headers:{'content-type':'text/xml'},body:Buffer.from('<rss><channel><item><title>包装</title><link>https://source.example.org/sku</link></item></channel></rss>')};
      if(action==='research-pack-lookup' && url.pathname==='/sku') return {status:200,headers:{'content-type':'text/html'},
        body:Buffer.from('<title>茶盒商品页</title><p>设计方把茶类名放在中央。</p><img src="/blank.gif" alt="测试茶" data-lazy-img="/product.png">')};
      if(action==='research-report-lookup' && url.hostname==='cn.bing.com' && ['即饮茶报告','茶饮报告'].includes(url.searchParams.get('q')))
        return {status:200,headers:{'content-type':'text/xml'},body:Buffer.from('<rss><channel><item><title>茶字释义</title><link>https://source.example.org/dictionary</link></item></channel></rss>')};
      if(action==='research-report-lookup' && url.hostname==='m.so.com' && url.searchParams.get('q')==='茶饮报告')
        return {status:200,headers:{'content-type':'text/html'},body:Buffer.from('<a data-md="{&quot;b&quot;:&quot;title&quot;}" href="https://m.so.com/jump?u=https%3A%2F%2Fsource.example.org%2Freport"><h3 class="res-title"><em>茶饮</em>研究报告</h3></a>')};
      if(action==='research-report-lookup' && url.pathname==='/report')
        return {status:200,headers:{'content-type':'text/html'},body:Buffer.from('<title>合成行业报告</title><p>本次样本单列礼盒用途。</p><p>'+'无糖茶定义。'.repeat(3000)+'无糖茶占20%。</p>')};
      if(url.hostname==='cn.bing.com') return {status:200,headers:{'content-type':'text/xml'},body:Buffer.from('<rss><channel><item><title>合成报告</title><link>https://source.example.org/report</link></item></channel></rss>')};
      return {status:200,headers:{'content-type':'text/html'},body:Buffer.from('<html><title>合成行业报告</title><p>本次样本单列礼盒用途。礼盒上架、供应商进入、礼盒容量、包装品类字、购买渠道、茶味偏好。</p></html>')};
    },
  };
  const runner = createStageRunner({binary,codexHome:home,model:'fixture',historicalPanels:true,researchDependencies,...options});
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
test('copy corrects a missing blind read once without repaying its sibling or restarting the draft',async t=>{
  const f=await fixture(t,'copy-clean'),events=[];
  await writeFile(join(f.home,'invalid-once'),'SLOGAN_APPEAL');
  const result=await f.run('copy',{onEvent:event=>events.push(event)});
  assert.equal(result.copyReview.status,'ready');
  assert.equal(events.filter(event=>event.includes('只重问该项')).length,1);
  assert.equal((await readdir(join(f.dir,'.codex-runs'))).length,result.copyReview.calls.length+1);
});

for (const [stage,action,stopAt] of [['copy','copy','COPY_ANONYMOUS'],['visual','image','独立读图者']]) {
  test(stage+' resumes completed calls after the provider stops mid-stage',async t=>{
    const f=await fixture(t,action);
    const retryDir=join(f.home,'new-attempt'),checkpointDir=join(f.home,'stable-checkpoint');
    await mkdir(retryDir);
    if(stage==='visual') {
      f.project.attachments.push({name:'同类包装.png'});
      for(const dir of [retryDir,f.dir]) await writeFile(join(dir,'同类包装.png'),Buffer.from(png,'base64'));
    }
    await writeFile(join(f.home,'stop-at'),stopAt);
    await assert.rejects(f.run(stage,{checkpointDir}),/调用失败/);
    async function runIds(dir) {
      const runs=join(dir,'.codex-runs');
      return Promise.all((await readdir(runs)).map(async name=>JSON.parse(await readFile(join(runs,name,'receipt.json'),'utf8')).runId));
    }
    const first=await runIds(f.dir);
    const result=await f.run(stage,{dir:retryDir,checkpointDir});
    assert.ok(result.artifacts.length);
    if(stage==='copy') {
      const originalRun=result.copyReview.calls[0].runId;
      assert.ok(first.includes(originalRun));
      assert.ok(!(await runIds(retryDir)).includes(originalRun));
    } else {
      assert.equal((await readFile(join(f.home,'generation-inputs.jsonl'),'utf8')).trim().split('\n').length,3);
    }
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
  for (const task of ['视觉参考检索词','比稿负责人分配参考图']) {
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

test('all nine visual calls use each direction’s main original and three different borrow and change plans',async t=>{
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
  const transfers = [
    {borrow:['布局','景别','笔法'],change:['配色','字体']},
    {borrow:['配色','笔法','字体'],change:['布局','景别']},
    {borrow:['配色','布局','景别'],change:['笔法','字体']},
  ];
  for(const [i,direction] of f.project.directions.entries()){
    const expected=[hashes[i],hashes[4]];
    const requests=packets.filter(p=>!p.outputSchema && p.prompt.includes('指定方向：'+JSON.stringify(direction)));
    assert.equal(requests.length,3);
    assert.deepEqual(actual.filter(r=>r.direction===direction).map(r=>r.received),[expected,expected,expected]);
    const payloads=requests.map(request=>{
      assert.deepEqual(request.images.map(s=>s.sha256),expected);
      const payload=JSON.parse(request.prompt.split('实际项目输入（JSON）').at(-1));
      assert.deepEqual(payload.referenceHandoff.references.map(ref=>ref.sha256),expected);
      assert.equal(payload.auxiliaryNotes.length,i===1?1:0);
      return payload.transfer;
    });
    for(const transfer of transfers) assert.ok(payloads.some(p=>JSON.stringify(p)===JSON.stringify(transfer)));
    for(const a of main.filter(a=>a.visual.direction===direction)) {
      const receipt=JSON.parse(await readFile(join(f.dir,a.name+'.receipt.json'),'utf8'));
      assert.deepEqual(receipt.inputImages,expected);
      assert.deepEqual(receipt.transfer,transfers[a.visual.candidate-1]);
      assert.deepEqual(a.visual.referenceHandoff.references.map(r=>r.sha256),i===1?[...expected,hashes[3]]:expected);
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
  ['research-thin', true, 1],
  ['research-blocked', false, 1],
  ['research-fiction', false, 0],
]) {
  test(
    action + ' executes discovery from a sparse brief and gates only on the director’s sourced page',
    async (t) => {
      const f = await fixture(t, action);
      f.project.brief = '测试茶';
      f.project.previousResearch = { legacyText: '上次的待补问题' };
      const { research, artifacts } = await f.run('research');
      assert.equal(research.ready, ready);
      assert.equal(research.digestPending,undefined);
      assert.equal(research.sections.length,count);
      assert.equal(research.question,'');
      if (action==='research-thin') assert.ok(research.next);
      assert.ok(artifacts[0].text.includes('调研方法版本：' + research.methodVersion));
      assert.equal(research.findings.length, count);
      assert.ok(f.requests.some((url) => url.startsWith('https://cn.bing.com/search?')));
      assert.ok(f.requests.includes('https://source.example.org/report'));
      assert.match(artifacts[0].text, /测试公开品类/);
      if (count) assert.match(artifacts[0].text, /本次样本单列礼盒用途|礼盒上架/);
      else assert.match(research.gaps.map(g=>g.message).join(' '), /未从.*核对/);
    },
  );
}
test('packaging retries a short brand query, publishes its reviewed original and keeps text-only appearance in sourced gaps',async t=>{
  const f=await fixture(t,'research-pack-lookup');
  const {research}=await f.run('research');
  const queries=research.searchScope.queries;
  assert.ok(queries.indexOf('茶 包装盒')>=0 && queries.indexOf('茶饮 品牌包装')>queries.indexOf('茶 包装盒'));
  assert.ok(queries.includes('茶饮 社交平台关键词报告'));
  assert.deepEqual(queries.filter(q=>q.startsWith('测试茶')),['测试茶 茶饮','测试茶','测试茶 包装']);
  const photo=research.findings.flatMap(f=>f.images ?? [])[0];
  assert.equal(photo.pageUrl,'https://source.example.org/sku');
  assert.equal(photo.sourceUrl,'https://source.example.org/product.png');
  assert.ok(!research.findings.some(f=>f.conclusion==='文字称茶盒透明'));
  assert.ok(research.gaps.some(g=>g.message.includes('合成行业报告') && g.message.includes('缺对应原图') && g.message.includes('/report')));
});

test('industry search switches short category terms and verifies segment data deep inside the report',async t=>{
  const f=await fixture(t,'research-report-lookup');
  const {research}=await f.run('research');
  assert.deepEqual(research.searchScope.attempts.filter(a=>a.source!=='SocialBeta 品牌发布案例').map(a=>a.query),['即饮茶报告','即饮茶','茶饮报告','茶饮','茶叶包装']);
  assert.equal(research.searchScope.attempts[1].source,'199IT 报告目录');
  assert.deepEqual(research.searchScope.reportReads,[{query:'茶饮报告',url:'https://source.example.org/report',title:'合成行业报告',kind:'original',segmentQuote:'无糖茶占20%'}]);
});

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

test('follow-up preserves earlier verified evidence, considers user feedback and does not repeat a question', async (t) => {
  const f = await fixture(t, 'research-followup');
  const earlier = {chapter:'行业与市场', conclusion:'礼赠是此次样本中的一个场景', source:'上轮报告', url:'https://source.example.org/older', evidence:'本次样本单列礼盒用途', implication:'礼赠和日常用途可分别比较'};
  f.project.previousResearch = {question:'优先门店还是线上？',findings:[earlier]};
  f.project.researchFollowup = true;
  f.project.researchQuestionAnswered = true;
  f.project.feedback = [{stage:'research',text:'用户暂不确定渠道'}];
  const {research} = await f.run('research');
  assert.ok(!f.requests.includes(earlier.url));
  assert.deepEqual(research.findings,[earlier]);
  assert.equal(research.question,'');
  assert.equal(research.ready,false);
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

test('final reads the matching rendered pages and returns the responsible stage',async t=>{
  const f=await fixture(t,'final-return');
  const requireApp=createRequire(new URL('../../apps/workbench-preview/package.json',import.meta.url));
  const {zipSync,strToU8}=requireApp('fflate');
  const slide=strToU8('<p:sld xmlns:p="urn:slide" xmlns:a="urn:text"><a:p><a:r><a:t>实际页面证据</a:t></a:r></a:p></p:sld>');
  await writeFile(join(f.dir,'提案-test.pptx'),zipSync({'ppt/slides/slide1.xml':slide}));
  await writeFile(join(f.dir,'page-0001-test.jpg'),Buffer.from(png,'base64'));
  f.project.artifacts=[{stage:'layout',kind:'pptx',name:'提案-test.pptx'},{stage:'layout',kind:'image',name:'page-0001-test.jpg'}];
  const result=await f.run('final');
  assert.equal(result.finalReview.returnStage,'layout');
  assert.equal(result.finalReview.outcome,'return');
  assert.deepEqual(result.finalReview.pages,[1]);
  assert.match(result.artifacts[0].text,/第 1 页包装说明超出/);
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
  async function rank(scores, blocked, packaging = false, findComparators, onPack = ['verified', 'verified', 'verified']) {
    const brandReferences = packaging ? [1,2,3].map(n=>({name:'客户原件 '+n,sha256:'customer-product-'+n})) : [];
    return reviewVisualBatch({
      findComparators, makeBoard:async (_images,refs)=>({name:refs[0].name+' board'}),
      direction: '产品', context: '测试', theme: '四种配料，正面读完', images: [1,2,3].map(n => ({sha256: String(n)})),
      brandReferences,
      call: async (_prompt, _images, schema, task) => {
        if (schema.properties.first) return {parsedOutput:{first:'一瓶茶',action:'水入杯',words:'无糖',alternative:'不确定'}};
        if (schema.properties.indices) return {parsedOutput:{packaging,indices:_images.length?[1]:[]}};
        const fields = schema.properties.items.items.properties;
        if (fields.onPackStatus) {
          assert.deepEqual(_images.slice(-brandReferences.length),brandReferences);
          assert.equal(task.comparison,true);
        }
        const items = scores.map((score, i) => ({
          candidate: i+1, reason: '测试依据',
          ...(fields.score && {score}),
          ...(fields.onPackStatus && {onPackStatus: onPack[i]}),
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
  const printedTheme=await rank([5,5,4],[],true,async()=>[{name:'商品包装',sha256:'comparator'}],['theme_printed','unverified','verified']);
  assert.equal(printedTheme.winner,3);
  assert.deepEqual(printedTheme.ruling.items.map(item=>item.blocked),[false,false,false]);
  assert.match(printedTheme.candidates[0].reason,/主题印在包装本体/);
  assert.match(printedTheme.candidates[1].reason,/包装印字位置或内容待核实/);
  assert.match(missing.candidates[0].research,/补充同类/);
  await assert.rejects(rank([4,0,5], []), /分数无效/);
});

test('poster recommendation requires the selected slogan to be read from the actual artwork', async () => {
  const {reviewVisualBatch} = await import('./visual-batch.mjs');
  const posterSlogan = '这周六，把还喜欢的那件带来';
  const shortened = {status:'readable',text:'这周六，把还喜欢的那件',location:'海报上方'};
  const unreadable = {status:'unreadable',text:'这周六',location:'海报上方后半句模糊'};
  const absent = {status:'missing',text:'',location:''};
  const correct = {status:'readable',text:'这周六，\n把还喜欢的那件带来',location:'海报上方两行'};

  async function review(readings, selected=posterSlogan) {
    const images = [1,2,3].map(n=>({imageId:String(n),sha256:String(n)}));
    return reviewVisualBatch({direction:'本案方向',posterSlogan:selected,images,context:selected,
      call:async (prompt, pictures, schema, task)=>{
        if (schema.properties.first) {
          assert.ok(![prompt, task.context, JSON.stringify(task.rules)].join('\n').includes(selected));
          assert.equal(pictures.length,1);
          assert.equal(pictures[0].imageId,'anonymous');
          return {threadId:'read-'+pictures[0].sha256,model:'gpt-6.2-sol',parsedOutput:{first:'活动海报',action:'修衣服',words:'周六',alternative:'服务广告',
            slogan:readings[Number(pictures[0].sha256)-1]}};
        }
        if(schema.properties.indices) return {parsedOutput:{packaging:false,indices:[]}};
        const fields = schema.properties.items.items.properties;
        return {parsedOutput:{items:[1,2,3].map(candidate=>({candidate,reason:'各岗均支持推荐',
          ...(fields.score && {score:[5,4,5][candidate-1]}),
          ...(fields.priority && {priority:candidate,blocked:false,edit:'无',research:'无'}),
        }))}};
      },
    });
  }
  const some = await review([shortened,correct,unreadable]);
  assert.equal(some.winner,2);
  assert.deepEqual(some.candidates.map(c=>c.blocked),[true,false,true]);
  assert.match(some.candidates[0].reason,/文字与本案已选 slogan 不符/);
  assert.match(some.candidates[2].reason,/尚无法读清/);
  assert.equal(some.blind[1].model,'gpt-6.2-sol');
  const none = await review([shortened,absent,unreadable]);
  assert.equal(none.winner,null);
  assert.match(none.candidates[1].reason,/缺少已选 slogan/);
  const english = await review([{...correct,text:'JUSTDOIT'},{...correct,text:'JUST\nDO IT'},absent],'JUST DO IT');
  assert.equal(english.winner,2);
  const wrap = await review([absent,{...correct,text:'COOL,\nFRESH 20\n26!'},absent],'COOL,FRESH 2026!');
  assert.equal(wrap.winner,2);
  const glyph = await review([{...correct,text:'豈'},absent,absent],'豈');
  assert.equal(glyph.winner,null);
});


test('strategy advice cites only findings in the current customer digest',()=>{
  const digest=[{findingIndex:3}];
  const recommendation='在货架小样上测试品类辨认';
  const advice=[{recommendation,findingIndices:[3]}];
  assert.deepEqual(validateStrategyAdvice(advice,digest),advice);
  for (const findingIndices of [[0],[3,3],[],['3']])
    assert.throws(()=>validateStrategyAdvice([{recommendation,findingIndices}],digest),/必须引用/);
  assert.throws(()=>validateStrategyAdvice([],digest),/一至三条/);
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
  assert.equal(reviewedFindings([{...record,url:'',chapter:'产品与品牌'}],[0],[labels[0]])[0].editorialAngle,undefined);
  assert.equal(reviewedFindings([{...record,images:[{}]}],[0],[labels[0]])[0].editorialAngle,undefined);
  assert.deepEqual(reviewedFindings(findings,[],[labels[0]]),[]);

});


test('after the targeted search nonblocking coverage gaps can accompany a grounded strategy handoff',async t=>{
  const f=await fixture(t,'research-thin');
  f.project.brief='测试茶';
  f.project.researchFollowup=true;
  const {research}=await f.run('research');
  assert.equal(research.ready,true);
  assert.equal(research.findings.length,1);
  assert.equal(research.findings[0].chapter,'人群与接触情境');
  assert.match(research.gaps.map(g=>g.message).join(' '),/行业与市场还需补查/);
  assert.equal(research.sections[0].chapter,'人群与接触情境');
  assert.deepEqual(research.sections[0].evidenceIndices,[0]);
});


test('the director publishes the observed packaging and its exact original bytes',async t=>{
    const f=await fixture(t,'research-board-accept');
    const {research,artifacts}=await f.run('research');
    const board=research.findings.find(row=>row.images?.length);
    const files=artifacts.filter(a=>a.kind==='image');
    const published=(await readdir(f.dir)).filter(name=>name.startsWith('research-peer-'));
    assert.ok(f.requests.includes('https://source.example.org/product.png'));
    assert.ok(research.sections.some(row=>row.chapter==='竞争与同类传播' && row.evidenceIndices.includes(research.findings.indexOf(board))));
    assert.ok(!research.gaps.some(g=>g.kind==='visual'));
    const [ref]=board.images;
    assert.equal(ref.sha256,createHash('sha256').update(competitorPng).digest('hex'));
    assert.equal(ref.pageUrl,'https://source.example.org/product');
    assert.equal(ref.sourceUrl,'https://source.example.org/product.png');
    assert.deepEqual(files,[{kind:'image',name:ref.name}]);
    assert.deepEqual(published,[ref.name]);
    assert.deepEqual(await readFile(join(f.dir,ref.name)),competitorPng);
  });

test('new research automatically compacts crowded copy before publishing and keeps its original citations',async t=>{
  const f=await fixture(t,'research-compact');
  const {research,artifacts}=await f.run('research');
  const [row]=research.sections;
  assert.equal(row.conclusion,'礼盒主要用于赠礼');
  assert.equal(row.explanation,'样本将礼赠列为单独用途。');
  assert.equal(row.sourceDetail,'限本次样本。');
  assert.deepEqual(row.evidenceIndices,[0]);
  assert.equal(research.findings[0].evidence,'本次样本单列礼盒用途');
  assert.match(artifacts[0].text,/礼盒主要用于赠礼/);
});

test('a single competitor quote cannot support an industry row',async t=>{
  const f=await fixture(t,'research-scope');
  const {research}=await f.run('research');
  assert.deepEqual(research.sections.map(row=>row.chapter),['竞争与同类传播']);
});

test('a packaging and KV brief collects and reviews both carrier-specific gaps after the offline anchors',async t=>{
  const f=await fixture(t,'research-combined');
  f.project.brief='测试茶，需要同时制作包装与春节KV。';
  const {research,artifacts}=await f.run('research');
  assert.equal(research.anchorQuestions.length,4);
  assert.match(artifacts[0].text,/研究载体：包装与KV/);
  assert.match(research.gaps.map(g=>g.message).join(' '),/包装原图/);
  assert.match(research.gaps.map(g=>g.message).join(' '),/KV原图/);
});


for (const action of ['ok','kv','linked','front-kv','general','reader','compact','bad-edit','return','wrong-ref','wrong-touch','scored','internal']) {
  test('one-page packaging strategy from verified findings: '+action,async t=>{
    const f=await fixture(t,'onepager-'+action);
    if (action==='general') f.project.brief='为测试茶制作新品上市创意提案';
    if (action==='kv') f.project.brief='制作测试茶的春节KV';
    if (action==='linked') f.project.brief='设计测试茶包装与KV';
    if (action==='front-kv') {
      f.project.brief='测试茶包装做外盒正面，KV 用在电商详情页首屏。';
      f.project.proposalKind='packaging+kv';
    }
    const finding={conclusion:'受访顾客关注原味',evidence:'访谈样本提及原味',source:'研究访谈',implication:'标明口味'};
    f.project.research={ready:true,findings:[{...finding,visualOnly:true},finding],strategyAdvice:[{recommendation:'正面写品类',findingIndices:[1]}]};
    if (!['ok','kv','linked','front-kv','general','reader','compact','bad-edit'].includes(action)) { await assert.rejects(f.run('strategy')); return; }
    const result=await f.run('strategy');
    const md=result.artifacts[0].text,front=md.split('## 研究结论')[0];
    assert.deepEqual(result.strategy.findingNumbers,[2]);
    if (action==='reader') {
      assert.equal(result.strategy.focus,'在货架上先让顾客看清这盒茶是原味。');
      assert.match(md,/优先表达原味/);
      assert.doesNotMatch(md,/改变产品主张/);
    }
    if (action==='compact') assert.equal(result.strategy.focus,'让找原味的人一眼认出茶。');
    if (action==='bad-edit') assert.match(result.strategy.focus,/再仔细看清/);
    assert.match(md,/## 核心策略[\s\S]*## 衡量方式[\s\S]*## 研究结论[\s\S]*研究 2/);
    assert.ok(md.includes(action==='general'?'## 视觉与传播触点':action==='kv'?'## 视觉与 KV 触点':['linked','front-kv'].includes(action)?'## 视觉与包装／KV 触点':'## 视觉与包装触点'));
    assert.equal(md.includes('- 正面：'),!['kv','general'].includes(action));
    assert.equal(md.includes('- 门店海报：'),['kv','linked'].includes(action));
    assert.equal(md.includes('- 电商详情页首屏：'),action==='front-kv');
    if (action==='front-kv') assert.doesNotMatch(md,/- (?:背面|侧面)：/u);
    assert.equal(front.match(/（待测）/g)?.length,3);
    assert.doesNotMatch(front,/模拟设定|待测：|发现2/);
    assert.doesNotMatch(result.strategy.focus,/发现2/);
    assert.match(md.split('## 推导依据')[1],/模拟设定/);
  });
}

test('strategy owner may remove an unclear clause without substituting a reader’s guess',async()=>{
  const text='学生先看清这瓶是什么茶、是不是真茶。';
  const edits=[
    {line:1,operation:'删片段',original:'、是不是真茶',replacement:'、是否为原叶冲泡'},
    {line:1,operation:'删片段',original:'、是不是真茶',replacement:''},
    {line:2,operation:'改说法',original:'12元',replacement:'10元'},
  ];
  const page=[{line:1,text},{line:2,text:'一杯12元。'}];
  const changes=await reviseFlaggedLines(page,[{line:1},{line:2}],{brief:'',constraints:''},async()=>({parsedOutput:{edits}}));
  assert.deepEqual(changes,[{line:1,before:text,after:'学生先看清这瓶是什么茶。'}]);
});

test('strategy carrier handles excluded and linked outputs while preserving other briefs',()=>{
  const detect=brief=>strategyCarrier({brief,artifacts:[]},{texts:[]});
  assert.equal(detect('设计春节KV，包装仅作参考'),'kv');
  assert.equal(detect('制作包装，不需要包装与KV联动'),'packaging');
  assert.equal(detect('制作包装与KV'),'packaging+kv');
  assert.equal(detect('做包装，另需设计海报'),'packaging+kv');
  assert.equal(detect('只需要制作TVC，参考包装与KV'),null);
});

test('packaging follow-up changes source families and rejects off-site results',async()=>{
  const {followupSources,matchesDomain}=await import('./research-sources.mjs');
  const plan=[{domain:'maker.org',query:'品类 产品与规格'}];
  assert.deepEqual(followupSources({brief:'精酿啤酒包装',targets:plan}),plan);
  assert.deepEqual(followupSources({brief:'精酿啤酒包装'}),[]);
  assert.equal(matchesDomain('https://item.jd.com/123','jd.com'),true);
  assert.equal(matchesDomain('https://jd.com.example.org/123','jd.com'),false);
});

test('source quote tolerates typography, preserves the actual source text and rejects altered quantities',async()=>{
  const {locateQuote}=await import('./research-sources.mjs');
  const text='访谈显示，“日常”——约１，２００人。';
  assert.equal(locateQuote(text,'"日常"-约1200人').evidence,'“日常”——约１，２００人');
  assert.equal(locateQuote(text,'"日常"-约1300人'),null);
  const findings=[{chapter:'行业与市场',evidence:'约三成受访者参与。'}];
  const row=detail=>[{findingIndex:0,chapter:'行业与市场',title:'参与者约占三成',detail}];
  assert.doesNotThrow(()=>validateResearchDigest(row('图1中约30%参与。'),findings));
  assert.throws(()=>validateResearchDigest(row('约33%参与。'),findings),/数值/);
});

test('research repairs anchors and recovers a blocked citation only from an independently captured page',async t=>{
  const f=await fixture(t,'research-repair');
  f.project.brief='测试茶';
  const {research}=await f.run('research');
  assert.equal(research.anchorQuestions.length,4);
  assert.equal(research.findings[0].url,'https://source.example.org/report');
  assert.equal(research.findings[0].source,'合成行业报告');
  assert.ok(research.findings[0].passage.includes(research.findings[0].evidence));
  assert.ok(research.searchScope.attempts.some(a=>a.count===1));
  assert.equal(research.searchScope.unreadable.find(s=>s.url.endsWith('/blocked')).reason,'原站返回 HTTP 403');
  assert.deepEqual(research.searchScope.replacements,[{from:'https://source.example.org/blocked',to:'https://source.example.org/report'}]);
});

test('operator-provided RSS search preserves query and bypasses default providers',async t=>{
  const {discoverPublicPages}=await import('./codex-runner.mjs');
  const root=await mkdtemp(join(tmpdir(),'nightflight-rss-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const calls=[];
  const result=await discoverPublicPages('茶礼盒',root,{
    searchRss:'https://search.example.org/rss?locale=zh',
    lookup:async()=>[{address:'93.184.216.34',family:4}],
    transport:async ({url})=>{
      calls.push(url);
      return {status:200,headers:{'content-type':'application/rss+xml'},
        body:Buffer.from('<rss><channel><item><title>测试原稿</title><link>https://brand.example.org/original</link></item></channel></rss>')};
    },
  });
  assert.equal(calls.length,1);assert.equal(calls[0].hostname,'search.example.org');
  assert.equal(calls[0].searchParams.get('q'),'茶礼盒');
  assert.equal(calls[0].searchParams.get('locale'),'zh');
  assert.equal(result.results[0].url,'https://brand.example.org/original');
});

test('DeepSeek writer chooses each headline and the director only recommends among the three author picks',async t=>{
  const f=await fixture(t,'copy-clean',{historicalPanels:false});
  const executable=join(f.home,'fake-deepseek');
  const requestLog=join(f.home,'deepseek-requests.jsonl');
  const brief=f.project.brief;
  const workbook={directions:['A','B','C'].map((id,i)=>({
    id,name:['清晨茶时','好茶有形','三口之间'][i],basis:brief,
    claim:'主张'+id,mechanism:'机制'+id,strategyLink:'连接'+id,secondary:'副标'+id,
    candidates:[1,2,3].map(n=>({text:id+'候选'+n,use:'提案页'})),
  }))};
  const authorCheck={
    selections:['A候选2','B候选3','C候选1'].map((phrase,i)=>({directionId:'ABC'[i],phrase,takeaway:'创意证据'+phrase,sloganReady:true})),
    pairs:['AB','AC','BC'].map(pair=>({pair,distinct:true,reason:'每对读出了不同的本案连接'})),
  };
  const writing={workbook,picks:{A:'A2',B:'B3',C:'C1'},authorCheck};
  const recommendation={directionId:'B',reason:'具体呈现茶与包装的联系'};
  await writeFile(executable,`#!/usr/bin/env node
const fs=require('node:fs');
if(process.argv[3]==='profile') {
  console.log(JSON.stringify({host:'api.deepseek.com',base:'https://api.deepseek.com',model:'deepseek-fixture'}));
} else {
  const packet=JSON.parse(fs.readFileSync(0,'utf8'));
  const prompt=packet.body.messages[1].content;
  const stage=prompt.includes('COPY_ENGINE_WRITE')?'writer':'director';
  fs.appendFileSync(${JSON.stringify(requestLog)}, JSON.stringify({stage,prompt})+'\\n');
  const output=stage==='writer'?${JSON.stringify(writing)}:${JSON.stringify(recommendation)};
  console.log(JSON.stringify({id:stage,model:'deepseek-fixture',choices:[{message:{content:JSON.stringify(output)},finish_reason:'stop'}]}));
}
`,{mode:0o700});
  const previous=process.env.ONEPITCH_TEXT_EXECUTABLE;
  process.env.ONEPITCH_TEXT_EXECUTABLE=executable;
  t.after(()=>{
    if(previous===undefined) delete process.env.ONEPITCH_TEXT_EXECUTABLE;
    else process.env.ONEPITCH_TEXT_EXECUTABLE=previous;
  });

  const {engineCopyHandoffReady,engineCopyProtocol}=await import('./copy-review.mjs');
  const {copyReview,artifacts,directions}=await f.run('copy');
  const published=artifacts[0].text;
  assert.equal(copyReview.protocol,engineCopyProtocol);
  assert.equal(copyReview.recommendation.directionId,'B');
  assert.equal(copyReview.skillHash,'b79000179b4df961d67acb662e66730bf97df88b7f5d2ca6493fd0beb36bc239');
  assert.deepEqual(copyReview.draft.directions.map(d=>d.main),['A候选2','B候选3','C候选1']);
  assert.doesNotMatch(published,/A候选1/);
  assert.match(published,/主标题：B候选3\n副标：副标B/);
  assert.deepEqual(copyReview.calls.map(c=>c.phase),['COPY_ENGINE_WRITE','COPY_ENGINE_RECOMMEND']);
  assert.deepEqual(copyReview.authorCheck,authorCheck);
  assert.equal(engineCopyHandoffReady(copyReview,directions,published),true);
  const historical=structuredClone(copyReview);
  delete historical.authorCheck;
  assert.equal(engineCopyHandoffReady(historical,directions,published),true);
  const misquoted=structuredClone(copyReview);
  misquoted.authorCheck.selections[0].phrase='稿外文案';
  assert.equal(engineCopyHandoffReady(misquoted,directions,published),false);
  const tampered=structuredClone(copyReview);
  tampered.picks.B='B4';
  assert.equal(engineCopyHandoffReady(tampered,directions,published),false);
  tampered.picks.B='A2';
  assert.equal(engineCopyHandoffReady(tampered,directions,published),false);
  assert.equal(engineCopyHandoffReady(copyReview,directions,published+'改字'),false);

  const calls=(await readFile(requestLog,'utf8')).trim().split('\n').map(line=>JSON.parse(line));
  assert.deepEqual(calls.map(call=>call.stage),['writer','director']);
  const skill=await readFile(new URL('../../skills/slogan-engine/SKILL.md',import.meta.url),'utf8');
  assert.ok(calls[0].prompt.includes(skill));
  assert.doesNotMatch(calls[1].prompt,/name: slogan-engine|B候选1|A候选3|创意证据/);
  const packet=JSON.parse(calls[1].prompt.split('实际项目输入（JSON）').at(-1).trim());
  assert.deepEqual(packet.directions,copyReview.draft.directions.map(({id,name,main})=>({id,name,main})));
});

test('copy does not send notice-only choices, overlapping ideas or invented title evidence to the director',async t=>{
  const {runCopyReview}=await import('./copy-review.mjs');
  const skill=await readFile(new URL('../../skills/slogan-engine/SKILL.md',import.meta.url),'utf8');
  const brief='馆内亲子导览。讲解员带看昆虫标本。每场45分钟，须预约。';
  const titles=['带孩子进馆，夜访昆虫','夜访昆虫，45分钟一场','夜访昆虫，须预约'];
  const workbook={directions:titles.map((text,i)=>({
    id:'ABC'[i],name:['馆内夜访','45分钟一场','先约再访'][i],basis:brief,
    claim:['把展柜前的夜晚变成亲子行程','说明每场时长','提醒提前预约'][i],
    mechanism:['用进馆动作接上亲子夜访','把时长放在活动名后','把预约条件放在活动名后'][i],
    strategyLink:'记住馆内活动',secondary:'每场45分钟，须预约。',
    candidates:[text,'今晚'+text,'周末'+text].map(candidate=>({text:candidate,use:'微信封面'})),
  }))};
  const writing={workbook,picks:{A:'A1',B:'B1',C:'C1'}};
  const checked={
    selections:titles.map((phrase,i)=>({directionId:'ABC'[i],phrase,takeaway:'带孩子认识馆内的昆虫',sloganReady:true})),
    pairs:['AB','AC','BC'].map(pair=>({pair,distinct:true,reason:'读者记住的场景不同'})),
  };
  for (const scenario of [
    {name:'notice',change:check=>{check.selections[1].sloganReady=false;},error:/B.*公告信息/},
    {name:'overlap',change:check=>{check.pairs[2].distinct=false;},error:/BC.*创意差异/},
    {name:'invented evidence',change:check=>{check.selections[0].phrase='展柜里的秘密';},error:/A.*主标题原文/},
  ]) await t.test(scenario.name,async()=>{
    const authorCheck=structuredClone(checked);
    scenario.change(authorCheck);
    const phases=[];
    await assert.rejects(runCopyReview({project:{brief,proposalKind:'kv'},inputs:{texts:[]},rules:[skill],singleOwner:true,
      call:async (instruction,_images,schema)=>{
        const phase=instruction.split('\n')[0];
        phases.push(phase);
        const parsedOutput=phase==='COPY_ENGINE_WRITE'
          ? (schema.properties.authorCheck ? {...writing,authorCheck} : writing)
          : {directionId:'C',reason:'让家长知道须预约'};
        return {parsedOutput,runId:phase+'-run',threadId:phase+'-thread',model:'deepseek-fixture',inputPacketHash:'a'.repeat(64)};
      },
    }),scenario.error);
    assert.deepEqual(phases,['COPY_ENGINE_WRITE']);
  });
});

test('single director copy requires a configured DeepSeek text model',async t=>{
  if(process.env.ONEPITCH_TEXT_EXECUTABLE) t.skip('requires missing desktop text configuration');
  else {
    const f=await fixture(t,'copy-clean',{historicalPanels:false});
    await assert.rejects(f.run('copy'),/文字 API 设置中选择 DeepSeek/);
  }
});

test('director keeps approved A and B while repairing only C after blind reading',async()=>{
  const {buildSloganWorkbook,checkSloganChoices}=await import('./slogan-workbook.mjs');
  const polished=[];
  let round=0;
  async function run(phase,instruction,schema,packet){
    let output;
    if(phase==='COPY_POLISH'){
      round++;
      const plan={directions:packet.plan.directions.filter(d=>round===1 || d.id==='C')};
      output=copyFixture(phase+'实际项目输入（JSON）'+JSON.stringify({plan}),'copy-clean');
      polished.push(output.directions.map(d=>d.id));
      if(round===2) output.directions[0].versions[1].text='仅修订C';
    } else {
      output=copyFixture(phase+'实际项目输入（JSON）'+JSON.stringify(packet),'copy-clean');
      if(phase==='SLOGAN_READING' && round===1) {
        for(const item of output.items) if(item.text.startsWith('旧街')) item.usable=false;
      }
    }
    return {output,receipt:{runId:phase+round}};
  }
  const book=await buildSloganWorkbook(run,{},{freezeAccepted:true});
  assert.deepEqual(polished,[['A','B','C'],['C']]);
  checkSloganChoices({directions:['山风原稿主文','晨雾原稿主文','仅修订C'].map((main,i)=>({id:'ABC'[i],main}))},book);
  assert.equal(book.discarded.length,1);
});

test('consumer research broadens across categories and opens publisher reports after irrelevant results',async()=>{
  const {consumerSearchTopics}=await import('./research-sources.mjs');
  const {researchConsumerReports}=await import('./codex-runner.mjs');
  const topics=consumerSearchTopics(['户外消费','出行消费','自行车']);
  assert.deepEqual(topics.map(t=>t.term),['户外','出行','自行车']);
  assert.deepEqual(consumerSearchTopics(['咖啡'])[0].queries,['咖啡消费报告','咖啡消费者调查']);
  const discovered=[],lookups=[],opened=[];
  const url='https://research.example.org/document',pdf=url+'.pdf';
  const fact={url:pdf,title:'出行调查',scope:'本次受访者',angle:'情境',quote:'受访者通常在早晨出行',conclusion:'受访者多在早晨出行'};
  const result=await researchConsumerReports({topics,discovered,
    discover:async({query})=>({query,via:'检索',results:[{title:'出行词典',url:'https://dictionary.example.org/'}]}),
    directory:async(query,provider)=>{
      lookups.push([query,provider]);
      return query==='出行' && provider==='ipsos' ? [{title:'出行调查报告',url}] : [];
    },
    capture:async link=>{
      opened.push(link);
      return link===url ? {url,source:'出行报告下载',text:'报告目录',pdfLinks:[pdf]} :
        {url:pdf,source:'出行调查',text:'这次调查发现受访者通常在早晨出行。'};
    },
    call:async()=>({parsedOutput:{observations:[fact,{...fact,quote:'没有在报告出现的数字'}]}}),
  });
  assert.deepEqual(opened,[url,pdf]);
  assert.ok(lookups.some(([term,provider])=>term==='户外' && provider==='ipsos'));
  assert.ok(discovered.some(s=>s.query==='出行消费报告'));
  assert.deepEqual(result.findings.map(f=>[f.url,f.evidence,f.sampleScope]),[[pdf,fact.quote,fact.scope]]);
});

test('compacting an audience comparison keeps both survey options in the visible text',async()=>{
  const {compactResearchPage}=await import('./research-digest.mjs');
  const row={conclusion:'样本通常在工作时使用',explanation:'工作占48%，出行占36%。这两个选项来自同一题。',sourceDetail:'',
    audienceTopic:'使用场景',evidenceIndices:[0]};
  let attempts=0;
  const call=async()=>({parsedOutput:{edits:[{index:0,conclusion:'使用场景以工作为主',
    explanation:++attempts===1?'工作占48%。':'工作占48%，出行占36%。',sourceDetail:''}]}});
  const [written]=await compactResearchPage(call,[row],[{source:'调查报告',evidence:'工作48%，出行36%'}]);
  assert.equal(attempts,2);
  assert.equal(written.explanation,'工作占48%，出行占36%。');
});

test('category lookups keep project filters out of the first comparison and search public attention', async () => {
  const {categoryLookups}=await import('./research-sources.mjs');
  assert.deepEqual(categoryLookups('猫粮',['packaging'],[],[],false),
    ['猫粮 品牌包装','猫粮 热门话题','猫粮 社交平台关键词报告']);
  assert.ok(categoryLookups('扫地机器人',['kv'],[],[{name:'甲'}],false).includes('甲 扫地机器人 海报'));
  assert.ok(categoryLookups('夜跑',[],['activity'],[],true).includes('夜跑 活动回顾'));
});

test('platform attention requires a traceable platform, period and topic-specific measure', async () => {
  const {supportedSocialMetric}=await import('./research-sources.mjs');
  const quote='猫粮保存入选热门关键词，相关笔记120篇。';
  const text='2025年5月，小红书。'+quote+'另一话题500篇。';
  const metric={platform:'小红书',period:'2025年5月',topic:'猫粮保存',measure:'120篇'};
  assert.ok(supportedSocialMetric(metric,text,quote));
  assert.ok(supportedSocialMetric({...metric,measure:'热门关键词'},text,quote));
  assert.equal(supportedSocialMetric({...metric,measure:'500篇'},text,quote),false);
  assert.equal(supportedSocialMetric({...metric,period:''},text,quote),false);
});

test('a verified platform topic can appear as attention but cannot establish who buys', async () => {
  const {writeResearchPage}=await import('./codex-runner.mjs');
  const metric={platform:'平台甲',period:'本月',topic:'猫粮保存',measure:'120篇'};
  const finding={chapter:'人群与接触情境',subject:'audience',conclusion:'猫粮保存受到关注。',source:'月报',
    url:'https://source.example.org/trends',evidence:'猫粮保存相关帖子120篇。',socialMetric:metric};
  const row={chapter:finding.chapter,conclusion:finding.conclusion,explanation:finding.evidence,
    sourceDetail:'平台甲本月记录。',surveyQuestion:'讨论了什么？',audienceTopic:'其他',evidenceIndices:[0]};
  const report=await writeResearchPage({call:async()=>({parsedOutput:{rows:[{...row,audienceTopic:'人群'},row],gaps:[],ready:false}}),
    project:{mode:'collab'},findings:[finding],gaps:[],carriers:[],anchorQuestions:[]});
  assert.deepEqual(report.sections.map(s=>s.audienceTopic),['其他']);
  assert.ok(report.gaps.some(g=>g.message.includes('受众身份')));
});

test('a report discovered in industry search can also supply a category-level user observation', async () => {
  const {researchConsumerReports}=await import('./codex-runner.mjs');
  const url='https://source.example.org/running', quote='受访跑者通常和朋友一起跑步。';
  const result=await researchConsumerReports({brief:'成都周三夜跑活动',topics:[{term:'跑步',queries:[]}],
    openedReports:[{url,title:'跑步行业观察'}],directory:async()=>[],discovered:[],
    capture:async()=>({url,source:'跑步行业观察',text:quote}),call:async()=>({parsedOutput:{
      observations:[{url,quote,title:'跑步行业观察',scope:'全国跑者',angle:'情境',conclusion:'样本中的跑者常结伴跑步。'}],
    }})});
  assert.equal(result.findings[0].sampleScope,'全国跑者');
  assert.equal(result.findings[0].evidence,quote);
});

test('a verified same-category poster resolves only the general image gap', async () => {
  const {writeResearchPage}=await import('./codex-runner.mjs');
  const chapter='竞争与同类传播';
  const image={title:'海报',carrier:'kv',sameCategory:true,sha256:'hash',pageUrl:'https://source.example.org/p',
    sourceUrl:'https://source.example.org/i',assetType:'宣传海报或主视觉',publicationPlacement:'article',publicationQuote:'品牌发布了海报。'};
  const finding={chapter,images:[image],source:'同类发布页',url:image.pageUrl,evidence:'画面突出机身。',conclusion:'海报突出机身。'};
  const gaps=[{chapter,message:'缺同类海报。',scope:'kv',blocksStrategy:true},
    {chapter,message:'未查到商场灯箱投放。',scope:'optionalSegment',blocksStrategy:false}];
  const r=await writeResearchPage({call:async()=>({parsedOutput:{rows:[],gaps,ready:false,next:'补同类海报。'}}),
    project:{mode:'auto'},findings:[finding],carriers:['kv'],anchorQuestions:[],gaps:[]});
  assert.ok(r.gaps.some(g=>g.message===gaps[1].message));
  assert.ok(!r.gaps.some(g=>g.message===gaps[0].message));
  assert.ok(!r.next.includes('补同类海报'));
  assert.equal(r.ready,false);
});

test('dictionary-only activity search changes queries and searches organizer records and four social sources',async()=>{
  const {activityCaseSearches}=await import('./codex-runner.mjs');
  const first={query:'夜跑 活动案例',results:[{title:'夜跑的意思 汉典',url:'https://dict.example.org/night'}]};
  const attempts=await activityCaseSearches({first,category:'夜跑',categories:['跑步'],followup:false,
    directory:async(query,provider)=>provider==='sogou' ? [
      {title:'跑团夜跑活动回顾',url:'https://mp.weixin.qq.com/s/test'},
      {title:'夜跑百科',url:'https://example.org/wiki'}] : []});
  assert.deepEqual(first.results,[]);
  assert.ok(attempts.some(s=>s.query.startsWith('门店 夜跑') && s.results.length===1));
  for (const via of ['微博','小红书','抖音','微信公众号']) assert.ok(attempts.some(s=>s.via===via));
  assert.equal(attempts.find(s=>s.via==='微信公众号公开网页索引').results.length,1);
  assert.equal(attempts.find(s=>s.via==='微博公开网页索引').results.length,0);
});

test('an activity case needs an organizer action in the cited source; return intent is optional', async () => {
  const {writeResearchPage}=await import('./codex-runner.mjs');
  const chapter='竞争与同类传播';
  const action='跑团带队沿江夜跑。';
  const findings=[action,'品牌在展会上陈列跑鞋。'].map((passage,index)=>({
    chapter,subject:'competitor',source:'活动记录',url:'https://example.org/event/'+index,passage,evidence:passage,
  }));
  const rows=findings.map((f,index)=>({chapter,conclusion:'跑团组织夜跑。',explanation:f.passage,
    evidenceIndices:[index],participantActionQuote:action}));
  const gap={chapter:'人群与接触情境',message:'缺复参意愿。',scope:'participationMotive',blocksStrategy:true};
  const report=await writeResearchPage({call:async()=>({parsedOutput:{rows,gaps:[gap],ready:false}}),
    project:{mode:'auto',briefScope:{types:['activity']}},findings,gaps:[],carriers:[],anchorQuestions:[]});
  assert.deepEqual(report.sections.map(row=>row.evidenceIndices),[[0]]);
  assert.ok(!report.gaps.some(item=>item.message===gap.message));
  assert.equal(report.ready,false);
});

test('a brief-linked visible marking leads the competitor homepage and keeps use performance separate',async()=>{
  const {writeResearchPage}=await import('./codex-runner.mjs');
  const chapter='竞争与同类传播';
  const brief='客户希望拆袋后容易收好。';
  const image={sha256:'b'.repeat(64),pageUrl:'https://example.org/rice',sourceUrl:'https://example.org/rice.jpg',
    sameCategory:true,carrier:'packaging',detailRegions:['右上'],title:'大米袋',
    observation:'开合标识：右上，PRESS TO CLOSE\n材料阻隔性：未核实。'};
  const findings=[{chapter,subject:'competitor',evidence:image.observation,images:[image],source:'商品页',url:image.pageUrl},
    {chapter,subject:'competitor',evidence:'另一个品牌在社区开设门店。',passage:'另一个品牌在社区开设门店。',source:'活动记录',url:'https://example.org/retail'}];
  const highlight={briefQuote:'拆袋后容易收好',markId:0,visibleQuote:'PRESS TO CLOSE',conclusion:'样本在袋角标出了按压封口方式。',untestedEffect:'实际密封效果'};
  const rows=['品牌标志最大。','品牌和系列都在中央。','另一品牌采用门店活动。'].map((conclusion,i)=>({
    chapter,conclusion,explanation:'有记录。',sourceDetail:'',evidenceIndices:[i===2?1:0],
  }));
  const project={brief,mode:'collab'};
  const r=await writeResearchPage({call:async(instruction,images,schema,task)=>{
    const marks=JSON.parse(task.context).packagingMarks;
    assert.deepEqual(marks.map(m=>m.marking),['PRESS TO CLOSE']);
    return {parsedOutput:{packagingHighlights:[
      {...highlight,visibleQuote:'not on image'}, {...highlight,briefQuote:'并非客户要求'},
      highlight,highlight],rows,gaps:[],ready:false}};
  },project,findings,carriers:['packaging'],anchorQuestions:[],gaps:[]});
  assert.deepEqual(r.sections.map(row=>row.conclusion),[highlight.conclusion,rows[2].conclusion]);
  assert.deepEqual(r.sections[0].evidenceIndices,[0]);
  assert.equal(r.sections[0].explanation,'原图已核实，右上可见“PRESS TO CLOSE”。实际密封效果未核实。');
});

test('automatic research uses its evidence gate even if the writer reports that optional detail is missing',async()=>{
  const {writeResearchPage}=await import('./codex-runner.mjs');
  const chapters=['行业与市场','竞争与同类传播','人群与接触情境','产品与品牌'];
  const findings=['market','competitor','audience','audience','product'].map((subject,index)=>({
    subject,source:'来源'+index,url:subject==='product'?'':'https://source.example.org/'+index,
    evidence:'原文'+index,passage:'原文'+index,conclusion:'发现'+index,implication:'用于本案比较',
  }));
  const rows=[0,1,2,2,3].map((chapter,index)=>({
    chapter:chapters[chapter],conclusion:'发现'+index,explanation:'依据'+index,evidenceIndices:index===4?[4,1]:[index],
    audienceTopic:['','','使用场景','选择因素',''][index],surveyQuestion:['','','在哪里用','为什么买',''][index],
  }));
  const gap={chapter:chapters[0],scope:'optionalSegment',blocksStrategy:true,message:'尚无同规格、同渠道的价格对照。'};
  async function outcome(suppliedRows,mode='auto') {
    return writeResearchPage({project:{mode},carriers:[],anchorQuestions:[],findings,gaps:[],
      call:async()=>({parsedOutput:{rows:suppliedRows,gaps:[gap],ready:false,next:gap.message}})});
  }
  const report=await outcome(rows);
  assert.equal(report.ready,true);
  assert.ok(report.gaps.some(g=>g.message===gap.message));
  assert.match(report.next,/进入策略/u);
  assert.equal((await outcome(rows.filter((_,i)=>i!==3))).ready,false);
  assert.equal((await outcome(rows,'collab')).ready,false);
});

test('consumer research opens precise publisher results ahead of broader directory suggestions',async()=>{
  const {researchConsumerReports}=await import('./codex-runner.mjs');
  const resource='https://example.org/cat-survey';
  const quote='受访者通常为室内成年猫购买猫粮。';
  const seen=[];
  const result=await researchConsumerReports({brief:'猫粮包装',topics:[{term:'猫粮',queries:[]}],discovered:[],
    directory:async(_term,provider)=>provider==='reports' ? [{title:'猫粮购买调研报告',url:resource}] :
      [0,1,2].map(i=>({title:'消费观察'+i,url:'https://example.org/'+provider+i})),
    capture:async url=>{seen.push(url);return {url,source:'报告',text:url===resource?quote:'通用资料'};},
    call:async()=>({parsedOutput:{observations:[{url:resource,title:'猫粮购买调研',scope:'该调查受访者',angle:'决策',quote,conclusion:'样本多为室内成年猫购买猫粮。'}]}}),
  });
  assert.equal(seen[0],resource);
  assert.equal(result.findings[0].evidence,quote);
});

test('DeepSeek copy repairs a missing pick and a broken quotation without rewriting the original candidates',async()=>{
  const {runCopyReview,engineCopyHandoffReady}=await import('./copy-review.mjs');
  const skill=await readFile(new URL('../../skills/slogan-engine/SKILL.md',import.meta.url),'utf8');
  const brief='制作燕麦饮包装。每瓶有燕麦和水。用于通勤早餐。';
  const basis='用于通勤早餐';
  const workbook={directions:['A','B','C'].map(id=>({
    id,name:id+'方向',basis:id==='B'?'拼接的错误依据':basis,claim:id+'主张',mechanism:id+'机制',strategyLink:'承接通勤',
    secondary:'燕麦饮',candidates:[1,2,3].map(n=>({text:id+'候选'+n,use:'提案页'})),
  }))};
  const picks={A:'A1',B:'B2',C:'C3'};
  const authorCheck={
    selections:['A候选1','B候选2','C候选3'].map((phrase,i)=>({directionId:'ABC'[i],phrase,takeaway:'创意证据'+phrase,sloganReady:true})),
    pairs:['AB','AC','BC'].map(pair=>({pair,distinct:true,reason:'画面不同'})),
  };
  const replies={
    COPY_ENGINE_WRITE:{workbook,picks:{A:'A1',B:'B4',C:'C3'},authorCheck:{...authorCheck,pairs:authorCheck.pairs.slice(0,2)}},
    COPY_ENGINE_GROUND:{citations:[{id:'B',basis,supported:true}]},
    COPY_ENGINE_PICK:{picks,authorCheck},
    COPY_ENGINE_RECOMMEND:{directionId:'C',reason:'承接通勤'},
  };
  const calls=[];
  const {copyReview,body,directions}=await runCopyReview({project:{brief},inputs:{texts:[]},rules:[skill],singleOwner:true,
    call:async (instruction,_images,_schema,task)=>{
      const phase=instruction.split('\n')[0];
      calls.push(phase);
      const packet=JSON.parse(task.context);
      if (phase.endsWith('GROUND')) assert.deepEqual(packet.listedDirections.map(d=>d.id),['B']);
      if (phase.endsWith('PICK')) {
        assert.deepEqual(packet.workbook.directions.map(d=>d.candidates),workbook.directions.map(d=>d.candidates));
        assert.deepEqual(packet.fixedPicks,{A:'A1',C:'C3'});
      }
      return {parsedOutput:replies[phase],runId:phase+'-run',threadId:phase+'-thread',model:'deepseek-fixture',inputPacketHash:'b'.repeat(64)};
    }});
  assert.deepEqual(calls,Object.keys(replies));
  assert.equal(workbook.directions[1].basis,'拼接的错误依据');
  assert.equal(copyReview.workbook.directions[1].basis,basis);
  assert.deepEqual(copyReview.repairs.map(r=>r.phase),['COPY_ENGINE_GROUND','COPY_ENGINE_PICK']);
  assert.equal(engineCopyHandoffReady(copyReview,directions,body),true);
  copyReview.repairs[0].threadId=copyReview.calls[0].threadId;
  assert.equal(engineCopyHandoffReady(copyReview,directions,body),false);
  const conflicting=structuredClone(workbook);
  conflicting.directions[1].claim='每盒100克';
  await assert.rejects(runCopyReview({project:{brief:brief+'每盒净含量为80克。'},inputs:{texts:[]},rules:[skill],singleOwner:true,
    call:async instruction=>{
      const phase=instruction.split('\n')[0];
      const parsedOutput=phase==='COPY_ENGINE_WRITE' ? {...replies.COPY_ENGINE_WRITE,workbook:conflicting} :
        {citations:[{id:'B',supported:true,basis:'每盒净含量为80克'}]};
      assert.ok(['COPY_ENGINE_WRITE','COPY_ENGINE_GROUND'].includes(phase));
      return {parsedOutput,runId:phase+'-run',threadId:phase+'-thread',model:'deepseek-fixture',inputPacketHash:'b'.repeat(64)};
    }}),/主张缺少与原件一致的依据/);
});

test('visual directory lookups can broaden a repeated category using the plan’s own catalog terms',async()=>{
  const {visualLookupCategory}=await import('./research-sources.mjs');
  assert.equal(visualLookupCategory('混合坚果','混合坚果',['每日坚果','坚果','小袋坚果','零食']),'坚果');
  assert.equal(visualLookupCategory('混合坚果','坚果炒货',['坚果']),'坚果炒货');
  assert.equal(visualLookupCategory('steam cleaner','steam cleaner',['team','cleaner']),'cleaner');
  assert.equal(visualLookupCategory('猫粮','猫粮',['猫砂','宠物']),'猫粮');
  assert.equal(visualLookupCategory('无糖汽水','无糖',['无糖','汽水']),'汽水');
  assert.equal(visualLookupCategory('暖白光台灯','暖白光台灯',['暖白光','台灯']),'台灯');
});

test('research charts are not released promotional posters even if a vision response gives them the same label',async()=>{
  const {supportsPoster}=await import('./research-sources.mjs');
  const assetType='宣传海报或主视觉';
  assert.equal(supportsPoster({assetType,title:'食品饮料包装十大趋势'},'研究团队总结了包装趋势。'),false);
  assert.equal(supportsPoster({assetType,title:'食饮趋势活动'},'品牌在本次包装趋势展发布系列海报。'),true);
});
