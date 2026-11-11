import json, hashlib, copy, subprocess
from pathlib import Path
from datetime import datetime, timezone
ROOT=Path('/Users/marc/Documents/ChatGPT/调研agent')
BASE=ROOT/'.scratch/qingyu-visual-workflow-20261110'
OLD=BASE/'intake/owner'; OUT=BASE/'intake/owner-r2'; SK=BASE/'skill-final/visual-development-lead'
def now(): return datetime.now(timezone.utc).isoformat().replace('+00:00','Z')
def read(p): return json.loads(p.read_text())
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def ptr(p): return {'path':str(p),'sha256':sha(p)}
def write(name,d):
 p=OUT/name; p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n'); return ptr(p)
def verify(p):
 assert Path(p['path']).is_file(),p
 assert sha(Path(p['path']))==p['sha256'],p
start=now()
req=read(BASE/'intake/REQUEST.json'); request=ptr(BASE/'intake/REQUEST.json')
assert request['sha256']=='ad33eef169e1c565228df076df3172fa7aa885c8c73caa5e2c582d61f8c4840e'
manifest=ptr(BASE/'SKILL-MANIFEST-FINAL.json')
assert manifest['sha256']=='2c197d5a8a8d7716700a1ef11fafd5388158a39e4d5354d8b257c47fd8fe3e00'
m=read(Path(manifest['path']))
skillFiles=[{'path':str(SK/p),'sha256':h} for p,h in m['files'].items()]
for p in skillFiles: verify(p)
oldSources=read(OLD/'PAGE-PACKET.json')['sources']
oldRecords=[ptr(p) for p in sorted(OLD.iterdir()) if p.is_file()]
for p in oldSources+oldRecords: verify(p)
# Snapshot the old closure before any local r2 output. All originals remain read-only.
write('EVIDENCE-VERIFY.json',{'checkedAtISO':now(),'request':request,'skillManifest':manifest,'skillFiles':skillFiles,'oldOwnerRecords':oldRecords,'oldPageSources':oldSources,'allHashesMatch':True,'imagesHashChecked':6,'imagesViewedThisRole':0,'observationSource':ptr(OLD/'CANDIDATES-AND-GAPS.json'),'observationBoundary':'六图仅重核原字节hash；继承原owner实际查看观察，本角色没有重新看图。源URL、远端研究、微字及原有缺面边界继续待核；hash相同不证明来源有效或审美适用。'})
ci=read(OLD/'CURRENT-INPUT.json'); ci['skillManifest']=manifest
ci['creatorIds']=['/root/visual_reference_intake','/root/visual_reference_intake_r2']
ci['continuation']={'kind':'same_case_same_input_norm_recheck','originalInput':ptr(OLD/'CURRENT-INPUT.json'),'originalInvocation':ptr(OLD/'INVOCATION.json'),'businessInputChanged':False,'newBusinessCaseCreated':False,'observationMode':'inherited_original_owner_observation_not_reopened'}
cip=write('CURRENT-INPUT.json',ci)
auth=read(OLD/'AUTHORIZATION.json'); auth['currentInputSha256']=cip['sha256']; auth['originalAuthorization']=ptr(OLD/'AUTHORIZATION.json'); auth['derivation']='同案例同输入的规范接续复核；根本轮委派及原REQUEST仅授权reference_intake登记，不扩大授权，不代签人工确认。'; ap=write('AUTHORIZATION.json',auth)
questions={'n7':'如何让青屿品牌和虎跑泉用水分别清楚，同时形成完整包装？','k4':'包装怎样把工位茶歇和虎跑泉用水连起来，避免被看成旅游宣传？','v2':'包装怎样承载想起某个人的情绪，减少对长文案的依赖？'}
c=read(OLD/'CANDIDATES-AND-GAPS.json'); c['id']='visual-intake-qingyu-20261110-01-collection-norm-r2'; c['skillManifest']=manifest
c['continuation']={'originalCollection':ptr(OLD/'CANDIDATES-AND-GAPS.json'),'originalInvocation':ptr(OLD/'INVOCATION.json'),'imagesViewedThisRole':0,'imagesHashChecked':6,'observationBoundary':'下列visualObservation、尺寸、原观察时间及借鉴推理继承原owner原件；不表示本角色重新逐图观察。无新增研究/生成/文案。','displayQuestionsSource':'根本轮委派明示：PLAN已讨论确认的展示短问题；原owner详细推理保持来源。'}
for d in c['directions']:
 d['originalDetailedQuestion']=d['visualQuestion']; d['visualQuestion']=questions[d['id']]
for v in c['candidates']:
 v['inheritedViewMethod']=v.pop('viewMethod'); v['viewMethod']='本角色仅核hash，未重新打开图片；实际图像观察继承原owner。'; v['observationSource']=ptr(OLD/'CANDIDATES-AND-GAPS.json')
c['evidenceVerification']=ptr(OUT/'EVIDENCE-VERIFY.json'); cp=write('CANDIDATES-AND-GAPS.json',c)
w=read(OLD/'WORK-PACKAGE.json'); w['task']['creatorIds']=ci['creatorIds']; w['currentInput']=cip; w['authorization']=ap; w['object']['version']='norm-r2'; w['object']['file']=cp; wp=write('WORK-PACKAGE.json',w)
command=['node',str(SK/'scripts/check-stage.mjs'),str(OUT/'WORK-PACKAGE.json')]
checkStart=now(); r=subprocess.run(command,capture_output=True,text=True); checkEnd=now()
(OUT/'CHECK-STDOUT.json').write_text(r.stdout); (OUT/'CHECK-STDERR.txt').write_text(r.stderr)
result=json.loads(r.stdout)
cr=write('CHECK-RESULT.json',{'command':command,'startedAtISO':checkStart,'completedAtISO':checkEnd,'exitCode':r.returncode,'result':result,'workPackage':wp,'checker':ptr(SK/'scripts/check-stage.mjs'),'stdout':ptr(OUT/'CHECK-STDOUT.json'),'stderr':ptr(OUT/'CHECK-STDERR.txt'),'boundary':'只证明本地证据和流程结构；不是审美、真实身份、真实授权有效性或后续准入证明。'})
assert r.returncode==0 and result['decision']=='record_only'
inv=write('INVOCATION.json',{'taskId':req['taskId'],'parentId':'/root','agentId':'/root/visual_reference_intake_r2','ownerRole':'视觉负责人 Agent · 规范接续复核','actualModel':'unknown','modelReason':'本角色运行时未提供可核实际模型标识；不沿用原owner模型声明冒充本轮。','startedAt':None,'firstClockSampleAt':start,'startTimeStatus':'首次读规范早于本脚本时钟采样；不伪造精确开始时间。','completedAt':now(),'request':request,'originalInvocation':ptr(OLD/'INVOCATION.json'),'originalPagePacket':ptr(OLD/'PAGE-PACKET.json'),'skillPath':str(SK/'SKILL.md'),'skillVersion':'1.0.0','skillManifest':manifest,'skillFiles':skillFiles,'currentInput':cip,'authorization':ap,'scope':req['authorization'],'mode':'automatic','humanNodes':[],'budget':{'status':'unknown'},'fees':{'status':'unknown','amount':None,'unit':None},'iteration':{'kind':'same_case_same_input_norm_recheck','revisionsUsed':0},'actualCallPath':['/root 委派 -> /root/visual_reference_intake_r2','functions.exec -> tools.exec_command 读候选规范与原owner记录、hash复核','python3 owner-r2/build-intake-record.py -> subprocess.run node skill-final/visual-development-lead/scripts/check-stage.mjs owner-r2/WORK-PACKAGE.json'],'actualCounts':{'imagesViewed':0,'originalOwnerImagesInherited':6,'imageHashesChecked':6,'reviews':0,'artworkCreated':0,'newSearches':0},'readScope':{'skill':'实际读SKILL、records、packaging、stage-review；KV、测试与脚本完整hash核对；脚本只定点读结构。','copyResearch':'仅核原文件hash与原owner输入身份，不重新实质阅读研究本体。'},'automaticBusinessRuntimeConnected':False,'prohibitedActionsPerformed':[],'selectionStatus':'主/辅/备用均未选定','completionCondition':'新规范与相同业务输入身份核对，封存继承观察、候选缺口与真实record_only检查。','failureReturn':'hash不一致退回输入核对；检查失败保留原输出，不补造通过。','stopAt':'reference_intake','checkResult':cr})
sources=[]
for p in [request,manifest]+skillFiles+oldRecords+oldSources+[ptr(OUT/f) for f in ['build-intake-record.py','EVIDENCE-VERIFY.json','CURRENT-INPUT.json','AUTHORIZATION.json','CANDIDATES-AND-GAPS.json','WORK-PACKAGE.json','CHECK-STDOUT.json','CHECK-STDERR.txt','CHECK-RESULT.json','INVOCATION.json']]:
 if p['path'] not in {s['path'] for s in sources}: sources.append(p)
packet=write('PAGE-PACKET.json',{'schemaVersion':1,'id':'visual-intake-qingyu-20261110-01-page-norm-r2','skill':{'name':'visual-development-lead','version':'1.0.0','manifestSha256':manifest['sha256']},'input':req['input'],'authorization':{'through':'reference_intake'},'result':{'kind':'collected_unreviewed','reviewCount':0,'artworkCount':0},'directions':[{k:d[k] for k in ['id','visualQuestion','focus','limits','gaps','referenceIds']} for d in c['directions']],'sources':sources,'performedAtISO':now(),'observationBoundary':'继承原owner实际观察；本角色只核六图hash，未重新看图。','originalOwnerPagePacket':ptr(OLD/'PAGE-PACKET.json')})
# Read back every source and verify exact saved bytes; avoid circular packet/closure references.
p=read(Path(packet['path']))
for s in p['sources']: verify(s)
for s in oldRecords: verify(s)
closure=write('SOURCE-CLOSURE-CHECK.json',{'checkedAtISO':now(),'pagePacket':packet,'originalOwnerPagePacket':ptr(OLD/'PAGE-PACKET.json'),'sourceCount':len(p['sources']),'allSourceHashesMatch':True,'oldOwnerUnchanged':True,'copyAndResearchHashesMatchPacket':all(any(s['sha256']==p['input'][k] for s in p['sources']) for k in ['copySha256','researchSha256']),'workPackage':wp,'checkerExitCode':r.returncode,'decision':result['decision'],'boundary':'来源hash闭包与流程结构检查，不是美学或权限真实性验证。'})
print(json.dumps({'pagePacket':packet,'originalPagePacket':ptr(OLD/'PAGE-PACKET.json'),'workPackage':wp,'sourceCount':len(sources),'closure':closure,'exitCode':r.returncode,'result':result},ensure_ascii=False,indent=2))
