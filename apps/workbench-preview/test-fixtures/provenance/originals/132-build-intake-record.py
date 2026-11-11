"""Rebuild bounded intake records from read-only originals; no remote calls."""
from pathlib import Path
from datetime import datetime, timezone
import hashlib
import json
import subprocess
from PIL import Image

OWNER = Path(__file__).resolve().parent
ROOT = OWNER.parents[1]
PROJECT = ROOT.parents[1]
SKILL = ROOT / 'skill-candidate/visual-development-lead'
MANIFEST = ROOT / 'SKILL-MANIFEST.json'
REQUEST = ROOT / 'intake/REQUEST.json'
EXPECTED_MANIFEST = '8bf6da565da5a14b8efcd53b0d7580e499f1d5aaef257607eaf258b7687fd22d'

def now():
    return datetime.now(timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z')

def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()

def pointer(path):
    return {'path': str(Path(path).resolve()), 'sha256': sha(path)}

def save(name, value):
    path = OWNER / name
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
    return pointer(path)

assert sha(MANIFEST) == EXPECTED_MANIFEST
manifest = json.loads(MANIFEST.read_text())
for name, expected in manifest['files'].items():
    assert sha(SKILL / name) == expected, name
req = json.loads(REQUEST.read_text())
editorial_path = Path(req['referenceEditorialPath'])
assert sha(editorial_path) == req['referenceEditorialSha256']
editorial = json.loads(editorial_path.read_text())
copy_path = Path(req['sourcePaths'][0]['path'])
assert sha(copy_path) == req['input']['copySha256']
copy = json.loads(copy_path.read_text())
current_draft = next(x for x in copy['rounds'] if x['id'] == copy['currentRoundId'])['draft']
assert current_draft['directions'] == req['copyDirections']
research_path = PROJECT / '.scratch/qingyu-copy-full-20261110/inputs/research-r4.json'
assert sha(research_path) == req['input']['researchSha256']
research = json.loads(research_path.read_text())

observations = {
    'two-name-rangcha': {
        'seen': '正面上部左侧绿色竖排“让茶”与右侧黑色竖排“竹香乌龙”分列，下方有竹叶图形；左上另有真人肖像元素。',
        'location': '瓶标上半部的品牌名与茶名分列关系。',
        'unknown': '168×428 原图仅支持大字与区域观察；微字未读清。真人肖像与原品牌资产不在借鉴范围。',
    },
    'two-name-chun': {
        'seen': '瓶身上部圆形区可见“淳茶舍”，中央白色竖向区依次出现“冷萃”和“茉莉花茶”，旁有红色“无糖”；叶片、白花及茶碗亦可见。',
        'location': '品牌区域与中央工艺/茶名区域的不同位置及大小关系。',
        'unknown': 'view_image 将2267×2267缩至1600×1600呈现；不核微字，不据图认定青屿茶种、冷萃工艺或其他产品事实。',
    },
    'trip-longjing': {
        'seen': '颈部绿色品牌区与浅色正标分离；正标可见柳枝、展翅鸟和较多浅色空隙，竖排“龙井新茶”。',
        'location': '正标柳枝、鸟与浅色空隙的关系。',
        'unknown': '这些图形不是虎跑现场记录，未核它们对工位茶歇文案的适用性，也不迁移龙井茶种或春茶主张。',
    },
    'trip-changbai': {
        'seen': '白色瓶标中央偏左为较大的虎形象，右侧竖排“长白雪”，标签下部可见红色数字；瓶盖、瓶肩、瓶底轮廓可见。',
        'location': '瓶标主视区的单一动物形象与品牌文字关系。',
        'unknown': '局部细字与图下容量字未读清；地域归属来自既有来源记录，不能仅凭虎形象证明产地，也不能把东北虎移作虎跑事实。',
    },
    'memory-coke': {
        'seen': '两瓶实物近景，黄色瓶盖、红色瓶标；正面分别可读“干饭人”“时髦精”，下有对应人物图形，旁边同时出现促销信息；背景为虚化绿植，瓶底不在画面内。',
        'location': '瓶标面向人的称呼与人物图形；不是整个拍摄场景。',
        'unknown': 'view_image 将3840×2560缩至1920×1280；未核微字、促销有效性或社交效果。editorial另附fullImage未在本轮打开，不能将其视作已核全貌。',
    },
    'memory-rabbit': {
        'seen': '并列两只细长瓶：左瓶一只较大的兔子，右瓶为数只相伴/叠置的兔子；两瓶有农夫山泉品牌字与2023字样。',
        'location': '单兔与群兔、两瓶并列所形成的关系表达。',
        'unknown': '兔群不能证明真实赠礼关系或消费者感受；底部容量位置未读清，材质与成本不能凭图确认。',
    },
}

directions = [
    {
        'id': 'n7',
        'visualQuestion': '在包装实际展示面上，既有信息组织参考对辨认青屿的品牌身份、无糖茶品类和虎跑泉水的用料身份能提供哪些可核线索；哪些证据仍不足以排除“两张名片”被理解为附卡？',
        'focus': ['两个名字各自的身份与阅读顺序', '主副文共同呈现时的完整理解', '保留与原地茶歇、共同旧游两案的机制差异'],
        'limits': ['沿用当前r2文案，不新增文案或具体画面方案', '只收集参考，主/辅/备用均未选定', '品牌身份、茶种和工艺不能从参考移入青屿'],
        'gaps': ['青屿具体茶种/SKU、瓶型、正标尺寸与展示面待补', '实际文字长度与两行分离后的理解未核', '让茶微字受原图分辨率限制'],
        'referenceIds': ['two-name-rangcha', 'two-name-chun'],
    },
    {
        'id': 'k4',
        'visualQuestion': '既有地域表达参考对“人在工位喝茶即算到虎跑”的主副文关系有哪些可借线索和证据缺口，怎样核查它们不会把虚构的原地茶歇读成真实出游或把参考地域认作虎跑？',
        'focus': ['原地喝茶与想象抵达之间的理解', '地名与配方用水依据的关系', '现有地域意象的借鉴边界'],
        'limits': ['参考图中的柳鸟、东北虎均不等于虎跑实景', '不迁移跨品类价位、口感或购买效果', '本轮不确定视觉主角、草图构图或造型'],
        'gaps': ['地域参考对工位茶歇机制的适用性尚未评审', '主副文在实际瓶标同读时的理解未核', '青屿展示面、尺寸及品牌图形资产待补'],
        'referenceIds': ['trip-longjing', 'trip-changbai'],
    },
    {
        'id': 'v2',
        'visualQuestion': '既有称呼和相伴关系参考对“认出虎跑名字、想起曾同行的人、因此捎茶”这条现有文案因果链能提供哪些待核线索，如何区分关系表达与已证实的赠礼/社交效果？',
        'focus': ['看见地名与想起特定对象的因果关系', '主副文及既有随茶留言的用途差别', '称呼、相伴关系作为局部借鉴的范围'],
        'limits': ['不把参考称呼、卡通人物或兔群直接当作青屿方案', '不借用促销字样或纪念瓶材质/成本/销售模式', '共同到访经历为虚构情景，非消费者证据'],
        'gaps': ['共同经历这一窄适用前提及文案自然度未核', '分享瓶近景无瓶底，另附全图本轮未查看', '青屿单瓶/其他包材的实际交付范围待补'],
        'referenceIds': ['memory-coke', 'memory-rabbit'],
    },
]

image_verification = []
cards = []
for ref in req['references']:
    p = Path(ref['path'])
    src = next(x for x in editorial['references'] if x['id'] == ref['id'])
    assert sha(p) == ref['sha256'] == src['sha256']
    assert ref['sourceUrl'] == src['sourceUrl']
    assert ref['borrow'] == src['borrow'] and ref['limits'] == src['limits']
    assert p == Path(req['imageRoot']) / src['image'].lstrip('/')
    with Image.open(p) as im:
        im.load()
        assert list(im.size) == [src['width'], src['height']]
        size, fmt, mode = list(im.size), im.format, im.mode
    image_verification.append({'id': ref['id'], 'file': pointer(p), 'dimensions': size, 'format': fmt, 'mode': mode, 'decoded': True, 'requestHashMatched': True, 'editorialHashAndDimensionsMatched': True})
    cards.append({
        'id': ref['id'], 'directionId': ref['directionId'], 'title': ref['title'],
        'file': pointer(p), 'dimensions': size, 'format': fmt,
        'sourceUrl': ref['sourceUrl'], 'imageUrl': src['imageUrl'], 'sourceNameAsRecorded': src['sourceName'],
        'sourceVerification': '本地REQUEST与editorial记录一致；未访问或验证远端网页/图源。',
        'originalAcquiredAt': 'unknown', 'intakeObservedDuring': {'firstClockSample': '2026-11-10T12:18:07Z', 'lastBound': '2026-11-10T12:20:37Z'},
        'viewMethod': 'functions.exec -> tools.view_image，实际打开原件；Pillow另做只读解码/尺寸核对。',
        'visualObservation': observations[ref['id']]['seen'],
        'borrowLocation': observations[ref['id']]['location'], 'borrowAsSupplied': ref['borrow'],
        'translationHypothesis': '既有借鉴用途作为待审假设保留；是否适用于当前方向须在另行授权的参考评审核实。',
        'limitsAsSupplied': ref['limits'], 'additionalUnknowns': [observations[ref['id']]['unknown'], '远端来源当前可达性、历史采集时间与复制使用许可未核。'],
        'status': 'collected_unreviewed', 'selectedRole': None,
    })

revision = save('NORM-REVISION.json', {
    'recordedAt': now(), 'reason': '根在最终封存前修订候选规范并指示重新绑定；本Agent未修改Skill。',
    'initialManifestSha256': '0717b59fe91e5e46e6c5b8f635121933b6acd7eb14e3f40da43daddfd214431d',
    'initialRead': ['SKILL.md', 'references/records.md', 'references/packaging.md', 'scripts/check-stage.mjs'],
    'notInitiallyRead': ['references/stage-review.md', 'references/kv.md', 'tests/check-stage.test.mjs'],
    'pause': '收到根要求后未封存最终包、未运行检查器，六原图观察沿用。',
    'currentManifest': pointer(MANIFEST),
    'rereadAfterRootConfirmation': ['SKILL.md', 'references/packaging.md', 'references/stage-review.md'],
    'changeObserved': '硬退准入语句修正为无关键unknown、无有证硬退；补充每方向三个不同草图、最高分仍须达标、四类参考创新和包装概念交付要求。',
    'effectOnThisCall': '当前仍仅reference_intake；不生成草图，不开展评审，不伪称旧规范下已读新内容。',
})

gaps = [
    {'id': 'INTAKE-G-SOURCE', 'stage': 'reference_intake', 'location': '六参考图源记录', 'evidence': '本轮明确禁止网页调用；仅核本地记录及图像字节。', 'impact': '不能宣称远端来源已重新验证或取得复制使用授权。', 'acceptance': '后续获相应授权时补原始采集回执、日期与必要许可；保留原字节。', 'status': 'open'},
    {'id': 'INTAKE-G-PRODUCT', 'stage': 'reference_intake', 'location': '青屿产品输入', 'evidence': current_draft['factualScope'], 'impact': '不能宣称可生产，也不能把参考茶种/工艺/容器当成本品事实。', 'acceptance': '补具体SKU/茶种、瓶型/包材、尺寸/展示面、品牌资产及事实凭据。', 'status': 'open'},
    {'id': 'INTAKE-G-REVIEW', 'stage': 'reference_intake', 'location': '参考适用性与方向冻结', 'evidence': '当前授权排除reference_review与select_main_reference；reviews为空。', 'impact': '没有参考审美通过或整方向准入结论。', 'acceptance': '另有明确参考评审授权后，按当前规范取得实际原票并决定主辅备用。', 'status': 'open'},
    {'id': 'INTAKE-G-LEGIBILITY', 'stage': 'reference_intake', 'location': '让茶微字及其他图像细字/局部缺面', 'evidence': '168×428让茶原图；分享瓶近景无瓶底；另附fullImage未查看。', 'impact': '这些位置不能作为已核微字、全部包装面或生产信息证据。', 'acceptance': '必要时取得并查看较清晰原件与实际所需视角；无此需求则保留范围限制。', 'status': 'open'},
    {'id': 'INTAKE-G-RESEARCH', 'stage': 'reference_intake', 'location': '研究源文件', 'evidence': research['scopeNote'], 'impact': '本轮仅核hash、binding、scopeNote与gaps，未实质阅读全部facts/findings/chapters；不得推成受众偏好或选择效果。', 'acceptance': '未来所需断言逐条回读对应原证据；当前不提出此类结论。', 'status': 'open'},
    {'id': 'INTAKE-G-COST', 'stage': 'reference_intake', 'location': '模型及API工具实际费用', 'evidence': '本次工具无可核计费回执。', 'impact': '费用必须记unknown；不能记为0元。', 'acceptance': '有真实计费回执后补充；本轮停止于记录。', 'status': 'open'},
]

ledger = save('EVIDENCE-VERIFY.json', {
    'verifiedAt': now(), 'method': ['SHA-256按实际原件字节计算', 'Pillow只读解码全部六图并核尺寸', '逐图tools.view_image实际观察；非图像评分', 'REQUEST、editorial与copy当前r2定点字段交叉核对'],
    'manifest': pointer(MANIFEST), 'manifestFilesAllMatched': True,
    'request': pointer(REQUEST), 'copy': pointer(copy_path), 'research': pointer(research_path), 'editorial': pointer(editorial_path),
    'currentCopyDirectionsMatchRequest': True, 'images': image_verification,
    'limitations': ['本检查不核远端来源或许可', 'check-stage的intake分支只核候选清单等结构；图像真实性核对由本只读ledger另记', '非审美评分或视觉业务全链测试'],
})
candidate = save('CANDIDATES-AND-GAPS.json', {
    'schemaVersion': 1, 'id': req['taskId'] + '-collection-v1', 'taskId': req['taskId'],
    'input': req['input'], 'skillManifest': pointer(MANIFEST), 'request': pointer(REQUEST),
    'status': 'collected_unreviewed', 'result': {'kind': 'collected_unreviewed', 'reviewCount': 0, 'artworkCount': 0},
    'selection': {'mainId': None, 'auxiliaryIds': [], 'reserveIds': [], 'status': 'unselected'},
    'productFactBoundary': req['productFactBoundary'], 'directions': directions, 'candidates': cards, 'gaps': gaps,
    'evidenceVerification': ledger, 'normRevision': revision,
    'stopAt': 'reference_intake；参考待审，未进入reference_review，未选主辅备用，未画草图。',
})

task = {'id': req['taskId'], 'scopeVersion': 'reference-intake-only-v1', 'inputVersion': req['input']['referenceSetId'] + '+' + req['input']['bundleId'] + '+' + req['input']['roundId'], 'requiresNode': False, 'creatorIds': ['/root/visual_reference_intake']}
review_task = '核对既有六张包装参考的原图、来源记录和借鉴边界，封存候选与缺口；不作视觉评分或选优。'
current = save('CURRENT-INPUT.json', {
    'taskId': task['id'], 'scopeVersion': task['scopeVersion'], 'inputVersion': task['inputVersion'],
    'reviewTask': review_task, 'requiresNode': False, 'creatorIds': task['creatorIds'],
    'sourceRequest': pointer(REQUEST), 'input': req['input'], 'copyDirections': req['copyDirections'],
    'sourcePointers': [pointer(copy_path), pointer(editorial_path), pointer(research_path)],
    'requiresNodeDerivation': '本次包装参考收集任务未指定营销/节庆节点；不代表未来阶段配置。',
    'skillManifest': pointer(MANIFEST),
})
authorization = save('AUTHORIZATION.json', {
    'taskId': task['id'], 'scopeVersion': task['scopeVersion'], 'inputVersion': task['inputVersion'],
    'currentInputSha256': current['sha256'], 'sourceRequest': pointer(REQUEST), 'sourceAuthorization': req['authorization'],
    'through': 'reference_intake', 'allowedStages': ['reference_intake'], 'allowedActions': ['record'],
    'mode': 'automatic', 'humanNodes': [], 'revisionLimit': 0, 'budget': {'status': 'unknown'},
    'derivation': '根据根本轮任务消息所述工程自动模式及REQUEST的intake授权生成本地适配记录；仅授权封存，不改变业务模式或扩大REQUEST范围。0修改限额是更窄的本次边界。',
    'notHumanApproval': '这是从封存REQUEST派生的协议适配，不是Agent代签用户确认，不是授权进入评审。',
})
package = save('WORK-PACKAGE.json', {
    'skillVersion': manifest['version'], 'task': task, 'currentInput': current, 'authorization': authorization,
    'stage': 'reference_intake', 'action': 'record', 'nextStage': 'reference_intake', 'revisionsUsed': 0,
    'budgetSpent': 'unknown', 'budgetUnit': 'unknown',
    'object': {'id': req['taskId'] + '-intake', 'version': 'v1', 'kind': 'intake', 'task': review_task, 'file': candidate},
    'reviews': [],
})

check_started = now()
command = ['node', str(SKILL / 'scripts/check-stage.mjs'), package['path']]
checked = subprocess.run(command, capture_output=True, text=True)
(OWNER / 'CHECK-STDOUT.json').write_text(checked.stdout)
(OWNER / 'CHECK-STDERR.txt').write_text(checked.stderr)
check = save('CHECK-RESULT.json', {'command': command, 'startedAt': check_started, 'completedAt': now(), 'exitCode': checked.returncode, 'stdout': checked.stdout, 'stderr': checked.stderr, 'workPackage': package, 'checker': pointer(SKILL / 'scripts/check-stage.mjs'), 'meaning': '仅当次reference_intake记录结构检查，不是审美通过、实际来源真实性证明或全部视觉业务链测试。'})

invocation = save('INVOCATION.json', {
    'taskId': req['taskId'], 'parentId': '/root', 'agentId': '/root/visual_reference_intake', 'ownerRole': req['assignedRole'],
    'actualModel': 'gpt-6.1-sol', 'fees': {'status': 'unknown', 'amount': None, 'unit': None, 'reason': 'API与工具费用无可核回执，不填0元。'},
    'startedAt': None, 'startTimeStatus': '精确首工具调用秒数未采样；首次读任务与规范先于首次时钟采样。',
    'firstClockSampleAt': '2026-11-10T12:18:07Z', 'completedAt': now(),
    'skillPath': str(SKILL / 'SKILL.md'), 'skillVersion': manifest['version'], 'skillManifest': pointer(MANIFEST),
    'skillScope': manifest['scope'], 'automaticBusinessRuntimeConnected': False,
    'actualCallPath': ['/root 委派 -> /root/visual_reference_intake', 'functions.exec -> tools.exec_command 只读原件/计算hash/生成owner记录', 'functions.exec -> tools.view_image 原件六图逐一查看', 'functions.exec -> tools.apply_patch 保存可重跑的owner记录生成器', '本地node scripts/check-stage.mjs WORK-PACKAGE.json'],
    'request': pointer(REQUEST), 'authorization': authorization, 'scope': req['authorization'],
    'mode': 'automatic', 'humanNodes': [], 'iteration': {'referenceIntake': 1, 'revisionsUsed': 0},
    'readScope': {'copy': '完整读取当前r2 draft；首次读取全文件输出截断，随后定点读取。未完整阅读历史评审。', 'research': '核字节hash及id/binding/origin/asOf/status/scopeNote/gaps；未完整阅读facts/findings/chapters。', 'skill': '主文、records、packaging和脚本已读；修订后重读主文、packaging和stage-review；KV及测试文件仅核hash。'},
    'actualCounts': {'imagesViewed': 6, 'reviews': 0, 'artworkCreated': 0, 'newSearches': 0},
    'prohibitedActionsPerformed': [], 'selectionStatus': '主/辅/备用均未选定',
    'completionCondition': '六原图hash/尺寸/查看记录与来源边界、三方向问题、缺口及本地intake接续包封存。',
    'failureReturn': '原件或hash不一致则停止并退回输入核对；检查器失败则保留原输出，不补造通过。',
    'stopAt': 'reference_intake；参考待审；后续评审、草图、精修、样机均未执行。', 'checkResult': check,
})

sources = [pointer(REQUEST), pointer(MANIFEST)]
sources += [pointer(SKILL / name) for name in manifest['files']]
sources += [pointer(copy_path), pointer(editorial_path), pointer(research_path)]
sources += [pointer(ref['path']) for ref in req['references']]
packet = save('PAGE-PACKET.json', {
    'schemaVersion': 1, 'id': req['taskId'] + '-page-packet-v1',
    'skill': {'name': manifest['name'], 'version': manifest['version'], 'manifestSha256': EXPECTED_MANIFEST},
    'input': {k: req['input'][k] for k in ['referenceSetId', 'bundleId', 'roundId', 'directionIds', 'copySha256', 'researchSha256']},
    'authorization': {'through': 'reference_intake'}, 'result': {'kind': 'collected_unreviewed', 'reviewCount': 0, 'artworkCount': 0},
    'directions': directions, 'sources': sources, 'performedAt': now(),
})

closed = json.loads((OWNER / 'PAGE-PACKET.json').read_text())
assert all(sha(s['path']) == s['sha256'] for s in closed['sources'])
assert closed['input']['copySha256'] == sha(copy_path)
assert closed['input']['researchSha256'] == sha(research_path)
assert checked.returncode == 0, checked.stdout
assert json.loads(checked.stdout)['decision'] == 'record_only'
save('SOURCE-CLOSURE-CHECK.json', {'checkedAt': now(), 'pagePacket': packet, 'sourceCount': len(sources), 'allSourceHashesMatch': True, 'copyAndResearchHashesMatchPacket': True, 'result': 'intake来源闭包已核；无审美或后续准入结论。'})
print(json.dumps({'packet': packet, 'candidate': candidate, 'invocation': invocation, 'checkExitCode': checked.returncode, 'check': json.loads(checked.stdout), 'sourceCount': len(sources)}, ensure_ascii=False))
