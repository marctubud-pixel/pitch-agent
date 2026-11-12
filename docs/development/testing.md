# 验证范围与已知失败

规范版本：1.12.1。默认验证目标是可检出的当前应用、规范和明示核心域边界。它不证明所有历史后端测试、原生渲染或业务流程均通过。

| 命令 | 实际验证对象 |
| --- | --- |
| `npm run check:specs` | 规范、引用、版本、固定方法及截图，另含隔离反例 |
| `npm run check:repository` | 明示文件与Git受控集合、导入和封存证据，含真实隔离Git反例；无Git时明确只核清单 |
| `npm run typecheck` | 当前预览应用TypeScript |
| `npm run test:frontend` | 当前应用共置测试，含案例、哈希绑定、权限与导出结构 |
| `npm run test:core` | 明示的存储、身份、枚举分区、客户端恢复和图表证据测试 |
| `npm run build` | 当前应用生产构建 |
| `npm run test:domain` | 已修的26项域合同与专用权限拒绝；不证明正式生成链成功 |
| `npm run test:brief-http` | 受限简报服务与新SQLite，含原生重放回执、冲突、请求边界与无任务恢复 |
| `npm run test:dependency` | 恶意图片终止、正常PNG和PPTX图片原字节；子进程隔离超时 |
| `npm run test:backend:legacy` | 兼容旧命令，现转到test:domain |

默认命令集合写在根package.json，CI执行同一套入口。锁定安装曾报告、现已修复的image-size公告见[005](../../status/issues/005-dependency-advisory.md)，两更新锁审计已零公告，冻结历史环境另记。新增测试依赖先确认它是否需要真实服务、预算、个人运行库或旧案例资产，避免通配运行所有旧脚本。

## 视觉与明确视图专项

`npm run test:visual-workflow`包含初始参考/原图HTTP、fixed-target未知停止、新durable replay及真实SQLite两store claim竞争、旧protocol拒绝和原native明确视图约束。它使用新小根与明确metadata，不依赖个人129案例库、不执行模型，也不证明实际草图/v2或美术通过。

原图测试的当前python3需Pillow，与image-scope相同。CI复用已安装PDF venv的PATH运行两组；生产解码器选择逻辑不变。前端129映射使用固定gzip metadata，来源/省略范围在test-fixtures/visual-reference-map/provenance.json，不含可运行旧库或完整原IO。

COPY专项增加原结果只读重放、pending、旧scope准入及同store/双store竞争。完整当前COPY HTTP正向、每轮实际UI与独立业务核验仍分别记录；便携metadata绿不能代替它们。

## 历史失败及本轮修复

原project测试22项中10项依赖旧通用成功夹具，遇到当前专用授权拒绝。现有26项保持生产守卫、按当前合同重建实际成功和拒绝边界，已纳入默认检查；覆盖见[映射](backend-fixture-coverage.md)。

当前78项核心测试与26项域测试是明示集合，不能称后端全量通过。正式后半生产链和原生成功仍在002、003，不因测试转绿而关闭。

前端HTTP集成测试另用实际受限服务处理器和SQLite，覆盖类型、旧隐藏字段、真实作者、业务版本、附件元数据、创建恢复、同版冲突及刷新后重放。实际TCP及UI未覆盖范围见[简报HTTP联调](http-brief.md)。

## 实际界面与产物

页面改动按项目[UI审核方法](../../skills/ui-review/SKILL.md)核真实运行界面、目标桌面和交互，保存前后证据及未覆盖状态。测试、截图和构建分别支持对应结论，不相互替代。

同版Deck的浏览器下载须定位实际文件并绑定SHA，核页序、原文、图片字节、图表工作簿和原生对象。PowerPoint实际渲染与在线编辑保存仍需另验，不能由PPTX结构测试推断。

单纯源码导入先证明生产文件原字节、必要资源和全部测试证据在仓库内闭合，再于独立入口核运行。原件历史绝对路径只保留身份，测试通过专用映射读取仓库内原字节。

## 当前七阶段与研究接入

新协议、来源登记、受限研究与原件读取、方法绑定和缺能力时停止的具体范围见[接续说明](seven-stage-research.md)。当前已接同版独立正文阅读、实际修订复查与研究声明/放行，详见[读者合同](research-reader.md)。自动采集已按[受限运行合同](research-acquisition.md)接线，简洁策略按[策略合同](simple-strategy.md)接线，双负责人接收、三方向文案及独立评审按[文案接续合同](simple-copy.md)接线；视觉至交付仍待迁移，默认不执行模型。

## PDF原件子路径

默认test:brief-http加入brief-intake-service与brief-original-http两组，使用自有小SQLite与原件fixture，覆盖未确认保存/读取/重开、同体恢复、跨项目/错版/损坏、字段与HTTP边界，原件子包当时不执行解析或模型。前端intakeHttp使用真实受限处理器与Blob，实际Chrome和独立只读UI另见[本轮核验](brief-originals-verification-20261111.md)。该PDF保存核验不覆盖读者运行；读者新工作包另见下节，简洁策略另按专项核验，不由原件保存测试证明。


## 研究读者回归

`test:research-contract`覆盖预登记、完整正文、独立席位、原生调用、typed修订、逐项处置、同版复查、owner绑定、真实文件损坏及恢复。部分测试启动仅本机合成HTTP提供方；不访问真实模型或旧run。前端reader测试调用当前native处理器及新临时SQLite，验证原文SHA、回执、权限和丢响应同体恢复。

实际Chrome及独立只读UI另留[核验记录](research-reader-verification-20261111.md)。范围包括理解通过的工程正例与仍待补的实际界面负例，不把测试数量或UI通过当成研究语义质量。全链包装/KV及PPT验收仍按总目标另做。

## 本地PDF解析专项

当前`test:brief-http`另含解析HTTP组。本地无专用Python环境时仍测原件/缺能力/旧卡及HTTP边界；真实解析专项明确skip。Application CI在独立虚拟环境安装固定PDF依赖并明确设置PITCH_PDF_TEST_PYTHON，真实专项不能以skip代替通过。指定环境后运行：

```sh
PITCH_PDF_TEST_PYTHON=/absolute/path/to/python3 npm run test:brief-http
```

指定但不能运行应FAIL，不能把skip计通过。真实专项涵盖partial/空页/no_text/UTF16、加密/非法/资源限制、原件与JSON哈希、同body/错body/换卡历史、失败显式重试和running未知零重发；仅新临时SQLite和已装本地工具。首claim永久中断尚无接管，不冒称所有恢复已完成。前端及Chrome实际范围单独按最终回执记录，后续全链与原生PPT专项不由此通过。

`intake-python-environment.test.mjs`加入Brief/PDF组：标准无pip symlink venv通过.pth引用已装实际包，真实probe/mixed/UTF16与资源限制验证配置环境；直接Python、缺路径、调用中配置变动、symlink重定向/删除分别核受控结果。它不安装软件或修改系统环境。原realpath后spawn基础解释器的失败反例保留；CI同样必须以配置venv运行。

## 自动采集受限回归

`npm run test:research-acquisition`明示执行basic、boundary、selection、material、manifest以及新service、bridge-http七文件。默认根`check`和Application CI纳入此集合；CI先安装冻结的workbench依赖。它不执行旧完整`research-acquisition-http.test.mjs`或恢复旧scheduler。

新测试核新SQLite上的默认零执行、固定原任务重放、actual claim的卡/问题登记/revision竞争、真实PDF原件及封口、unknown原IO恢复和历史生产者拒绝。实际PDF专项需要显式`PITCH_PDF_TEST_PYTHON`；无环境的明确skip不算PDF正例通过。前端专项另核严格回执、同body日志、权限及原生unknown停止。真实界面、独立复核、远程CI与两案例整链各按实际回执登记，详见[采集合同](research-acquisition.md)。

## 简洁策略专项边界

`npm run test:simple-strategy`串行执行三板块纯合同、实际原生运行、显式配置与受限HTTP四文件，纳入根`check`和Application CI。前端真实HTTP专项使用新SQLite、原生处理器及仅本机合成模型；其中正例使用当前结构化KV任务卡，并读取真实ProposalService，避免只测WorkbenchService而漏掉页面类型边界。

纯协议`seven-stage-strategy.test.mjs`检查三板块、真实原句定位、事实/要求/假设性质及限制继承。`simple-strategy-runtime.test.mjs`核原研究continuation及实际全文核验，HARD_BLOCKER不能因空claims而删除。`simple-strategy-http.test.mjs`和`simple-strategy-configuration.test.mjs`使用新隔离SQLite、本机合成模型HTTP，分别核原job/回执/当前性、创建授权/原终点重放、producer与verification原IO恢复，以及历史unknown拒绝。

当前源码专项、完整门禁、真实UI、独立审查及文案接续必须分别留证，先前候选日志不证明后来字节已验。各专项最终字节的实际结果以本轮原生回执为准。磁盘不足期间只保存小文档和静态审查，不能用它们代替暂缓的运行验收。具体合同见[简洁策略](simple-strategy.md)。

## 文案接续专项

当前源码有simple-copy-runtime、simple-copy-http、simple-copy-negative、simple-copy-scope、simple-copy-stop和simple-copy-replay六组专项。可直接串行执行：

```sh
node --test --test-concurrency=1 tools/workbench/simple-copy-runtime.test.mjs tools/workbench/simple-copy-http.test.mjs tools/workbench/simple-copy-negative.test.mjs tools/workbench/simple-copy-scope.test.mjs tools/workbench/simple-copy-stop.test.mjs tools/workbench/simple-copy-replay.test.mjs
```

这些测试使用新SQLite和本机合成HTTP，覆盖实际双负责人、唯一copy、全文核验、17节点、明确人工策略checkpoint、固定集合重放、unknown及上游变化拒绝。已核回SIMPLE专项另核原作者、原attempt、原IO文件身份在下游执行前后保持。工程IO证明不能代替原生校准、真实语义异议处理或客户批准。

前端copyWorkflowHttp、copyCreativeProjection及既有恢复、权限测试核正文SHA、原回执、17节点完整packet/phase/inputs与合法历史可读。copyCreativeProjection默认读取仓库内明确合成的原生快照，原packet/17节点反例与合法历史测试不再依赖个人.scratch环境或静默skip；可显式PITCH_COPY_PROJECTION_SNAPSHOT覆盖为另一实际快照。快照来源和SHA记录在test-fixtures/simple-copy/origin.json；纯投影不代表CI实际访问了历史原件文件。

`simple-copy-stop`直接检查整组首项未知后停止、原body重放零续派、新命令入账前拒绝、无edge不混入研究和不同edge隔离。实际HTTP正例另用同一新案的原历史快照执行合法start/dispatched/interrupted，再核第二原claim拒绝；不写原历史或重造模型结果。

`npm run test:simple-copy`已按上述六文件串行集合加入根check及Application CI。实际原生双owner与17评审有真实IO成本，Application job上限由15分钟调为30分钟，不降低任何测试断言或业务门槛。候选owner测试和独立反例只支持其冻结字节与具体范围。根完整回归、修后受影响检查、实际UI及PR #9分别记录在[本轮核验](simple-copy-verification-20261112.md)，远程结果按准确head回执更新。不得用旧候选自述签根验收，也不把合成空异议票称为真实质量通过。

## 图片只读核验回归

`npm run test:image-scope`纳入根check；九个微型真实PNG/JPEG及本机HTTP original fixture核缓存生命周期和每次原件IO，另六项纯metadata核上下文谓词等值与bounded depth，不依赖旧DB。当前python3需Pillow；缺少直接失败，CI使用已安装的PDF venv并仅对此step前置其bin路径。已有venv的运行方法、原红例与边界见[图片原件只读核验](image-readback.md)。不以减少纯解码代替原来源、业务门槛或端到端性能验收。

本轮配置PDF后的全量冷运行曾使两项真实PDF前端用例撞到Vitest默认5秒；单独16项通过。仅originalDocumentsHttp的真实页字节用例和researchAcquisitionHttp的实际PDF入r7用例设30秒外层时限，原断言、业务期限及解析器资源限制保持。不能把此前超时记录为产品通过，最终结果见[本轮验证](visual-workflow-verification-20261112.md)。

PR #11首个应用CI的完整双owner/copy/17票前端用例在240秒外层超时，其他786项通过；本地相同用例已通过。仅copyWorkflowHttp的该首用例改600秒，第二个恢复用例仍240秒，原assertions/生产deadline及CI job30分钟保持；修后是否通过以准确head的实际CI回执为准。

新增visualAKnownRejection前端测试实际解码原PNG，Application CI前端步骤显式把已配置PDF venv（含固定Pillow）加入PATH，和image/visual专项一致，不依赖runner系统偶然安装Pillow；生产Python默认选择不改。

## 实际打开文件的回归

`test:core`新增store-opened-file四项独立子进程：默认store不授证明；Darwin干净打开及close撤销；路径恢复不能掩盖另一inode的SQLite句柄；其它普通描述符导致明确拒绝。非Darwin实际核拒绝分支，不能把它算Darwin正例。根首次测试缺run/context身份的失败保留，补测试上下文后4项通过，生产guard不改；SIMPLE/COPY新actor签发时间另有13项durable根回归。只使用新测试库，不打开或接管实际主案，不执行模型。详见[身份合同](native-store-identity.md)。


## B便携边界

`test:visual-workflow`新增六个visual-b测试文件，共61项B检查，覆盖默认关闭、严格路由、固定target/dispatch及实际claim、随机marker同owner竞争、exact只读重放、pending/unknown停止、父child revisionResult与新真实时间。它们不运行上游或模型，不证明实际成稿图片、13节点原评或B当前页面通过。

HTTP边界用自有新空SQLite，保留于`.scratch/visual-b-http-evidence`。根首次61项运行曾按原候选输出在`tools/workbench/evidence`；原目录保留、不纳管，随后仅改测试证据路径，不改断言或生产源。其它新回归同样保留原失败与独立复验身份。

完整本地回归曾出现首个129节点映射用例5000ms外层超时（787通过、1超时、1既有skip）；独立原文件5/5通过、首例独跑3.16秒且源/夹具字节未变。仅该首用例外层改30秒，全部129断言、生产deadline和其余测试不改；原失败、独立诊断与修后结果分别保留，不把分段复验冒称首次整命令成功。

PR #13首14de CI另有首个完整采集HTTP用例默认5000ms超时，其余787通过、1既有skip；完整后端/图像/构建在该次CI被skip，不能当成功。原文件单跑8通过、1未配置PDF的skip，总1.59秒，无断言差异。核验前提后，仅该完整多步用例外层改30秒；生产适配器deadline、全部断言和其它用例时限保持，不扩大全局默认预算。后续准确head CI另核。
