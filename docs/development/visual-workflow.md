# 视觉参考、草图与成稿的受限接线

规范版本：1.1.0。复用原参考、草图和sketch-review-v2运行时，接当前七阶段HTTP与参考组件。默认不执行模型；源码接线、工程测试、实际图像质量与人类批准分别记录。本合同不声明草图、深化、样机或整案已验收。

## 输入与方法

新项目必须保存proposal-seven-v1。当前同版SIMPLE策略、实际双负责人、唯一三方向文案、全文核验与原四岗评审继续按[文案合同](simple-copy.md)核对，参考入口不替它们补通过。只接manual_supplied，旧业务和旧数据库不自动迁入。

`visual-a-service.mjs`读取项目固定visual-development-lead 1.0.0及stage-review、对应packaging或kv、records附录字节。原任务、policy、问题登记、研究放行、策略、copy正文hash、参考材料、固定target/sourceHash和job binding进入原技术ledger。方法或上游变化时不能续用旧请求。

| phase | 固定target | sourceHash | 原实际claim |
| --- | --- | --- | --- |
| references | dossier | envelopeHash | start-job与mark-reference-dispatched |
| sketch | generation | generation.source.sourceHash | claim-sketch-job |
| sketch_review | reviewRun | reviewRun.sourceHash | claim-sketch-review |

step只选1至4个已经安排、零attempt的原job。每次派发及实际claim重核原请求成员、当前输入、binding、CAS与同target未知结果。running或awaiting_reconciliation停止；无关target和已核回SIMPLE成功job里的旧attempt不能误挡。没有视觉unknown重派或原件恢复端点。

## HTTP接口

前缀为`/api/v1/projects/:id`。保留原Host、Origin、方法、严格字段、同版本和同body重放检查。

| 接口 | 范围 |
| --- | --- |
| GET visual-workflow | 当前原记录、实际队列、参考判定、原图descriptor与衔接结果，不推进 |
| GET visual-images/:imageId | 同项目登记的原字节，核SHA及实际图片身份 |
| POST visual-image-uploads | PNG/JPEG原字节，最多8MiB |
| POST reference-materials | 当前原图、方向、用途、适用范围与借鉴边界 |
| POST copy-continuations | 原copy与manual_supplied发现方式 |
| POST visual-workflow/step | 固定phase、targetId、sourceHash及原jobIds |
| POST reference-choices | 明确主辅备提议，或采用已审查的精确editionHash |
| POST reference-adoptions | 明确采用本版selectionHash及理由 |
| POST sketch-continuations | 精确dossier及已核selectionHash |
| POST sketch-review-continuations | 原generation及sourceHash |
| POST sketch-adoptions | 原artifact、contentHash、reviewRun及人类理由 |

上传仅本路由接受`X-Workbench-Image-Meta`，最多2048字节base64 JSON，保存commandId、expectedRevision、文件名、说明与原字节SHA。其他JSON仍128KiB，不能借上传放开通用body。原图保存不签用途、适用性、复制许可或采用。

后端原图保存可在无执行器时工作；当前参考UI仍以执行可用性禁用该保存入口。这个能力映射差异尚未解决，不能把后端storage-only测试写成页面默认可上传。

## 单次衔接与只读重放

新step保存`visual-a-durable-advance-v1`。完成固定job-set后，先按原CAS保存唯一随机marker及实际claimOwner。只有从存储读回自己的marker和owner才可执行一次原phase的scoped advance，始终noRecovery。完成命令用同owner引用原marker，保存实际progress。

同原body重放只读已保存progress，关闭执行器也不会再advance或执行后来eligible的job。并发的另一caller不能把processedCommands幂等返回当自己获锁。换body拒绝，不能换commandId复用已入账job。

marker后中断、或实际advance后结果保存失败，保持advance_pending。GET显示待核，新的视觉写操作与实际claim停止；当前没有自动恢复或解除入口。旧无此协议的请求只读返回advance_state_unrecorded，不补造其原progress、marker或时间，也不让旧queued请求借原准入ID升级。

参考和草图调用继续消费原普通HTTP回执、原图与原文件验证；衔接结果不代替这些原件或业务门槛。专用release-reviewed-sketch-v2仍核完整原v2报告、选图、原件及人工条件，不开放generic release。

## 当前页面范围

参考组件保留三方向、原图扇面和每图借鉴，完整原评与原生阻断收起。已保存数量、真正未知、参考阻断、人工采用和后续阶段分别显示。129份报告保存不能写成参考通过。

原生初始manual参考图谱为10生产节点与7个17节点评审，共129。严格mapper核完整task、parentId、binding、producerAssignment、原作者/attempt/receipt及正文hash。历史读取和当前写资格分开。动态choice诊断、草图和v2的完整App映射及三纸页、大图右评、采用交互仍需各自真实原件验收；不能由参考组件或纯schema测试代签。

当前sketchAppSupported=false，页面禁用进入草图、继续草图及其独立评审，避免合法新节点创建后被尚未完成的App mapper拒绝；原后端草图路由保留，后续接齐映射才可开放。当前referenceChoiceAppSupported=false，手动重组及其版次采用在页面禁用，避免提交后进入尚未映射的动态节点。原生推荐selectionHash的明确采用另受原门槛，未因此禁用或代签；原native choice方法保持原范围。

## 版本冲突的有限核回

浏览器仅对HTTP409且code为REVISION_CONFLICT尝试核回：no-store读取同项目visual-workflow，重验原协议、版本和当前状态；完整native快照不得包含原commandId，原job须queued且零attempt，pending、legacy或任何running/unknown均不解除。先以独立诊断键保存并读回原body、图片原bytes、拒绝及核回snapshot SHA，成功后才结束浏览器待核，允许修正重提。配额或删除失败仍保留pending，不造成功回执、不解除native记录。

网络、500、422、其他4xx、COMMAND_ID_REUSED、成功缺回执身份或无法核实未写均保留原请求。当前坏PNG解码错误实际返回500，不能宣称所有已知拒绝都可结束。storage-only真实HTTP已验不代表页面默认可上传。

## 明确交付视图

当前Brief在既有交付内容中提供可选`fields.visualRequirements=[{kind,views}]`。kind仅packaging、kv或adaptation，每类唯一，最多12行非空且不重复的视图，每项trim后最多120字。没有提供就保持未知，省略更新保留原值，明确`[]`才清除。不从交付自由文猜测，也不默认所有包装都需要瓶盒。

原native final plan直接读取同版`source.task.brief`中的明确要求，与已有legacy task.finalVisualRequirements一起约束每个方向的完整target。它不改写taskCard或source字节；缺kind或所需view拒绝，畸形明确输入按DomainError阻断。方法对包装正面、立体和细节的要求继续独立存在，文字列出视图不证明实际像素满足。

## 验收与未接范围

原129合成案保留为choice_blocked负例。具体任务、像素和原角色证据不足时，不以工程身份、数量或通用免责声明豁免。新包装/KV正例须先核当前App输入、原图、逐use和角色证据；离线准备不算实际调用或独立质量判断。

B成稿与样机、通用同版Deck、终审/PPTX及至少两条当前App整链继续按实际原件接续。付费/真实模型、生产账号、旧run及在线PPT编辑保存仍按原暂停范围执行。当前检查与真实UI范围从[状态](../../status/current.md)和各工作包原回执读取。


## B成稿与样机的后端接缝

`visual-b-service.mjs`、`visual-b-http.mjs`与`visual-b-admission.mjs`接原final-visual-runtime，不建立另一套创作或评分方法。须同时满足全局`executionAllowed`与服务端`visualBExecutionAllowed===true`，默认关闭；公共请求不能提供此开关。策略、copy、已核草图、原v2报告、当前方法及原图资格仍由原native守卫核对，授权终点不足或原件缺失均拒绝。

前缀同上：GET `final-visual-workflow`只读；POST `final-visual-continuations`提交明确草图身份；POST `final-visual-workflow/step`只选同一run/sourceHash下1至4个queued零attempt job；POST `final-visual-adoptions`保留独立的人类采用记录；POST `final-visual-release`核对当前run、artifact、sourceHash与draftHash。没有扫描任务、unknown重派或通用恢复入口。当前前端尚未映射此B工作区，后端路由存在不等于页面可用或实际B完成。

每次dispatch及实际claim重核原ledger、target、job/dispatch binding、方法与CAS；其它target或未知结果不能被借用。step完成后以随机marker与实际claimOwner取得原存储归属，advance完成仍使用同一owner。新actor记录真实签发时间，不填旧audit。exact terminal body只读原progress，pending或旧未证明记录停止。正常revision切换父run至child时，保存原step的terminal revisionResult；不能因为当前run变化丢掉原回执，也不能把无原负责人修订依据的head变化当成功。

原native返回的`ready_for_content`仅保留内部历史状态名称；此入口不创建独立content_review页面、负责人或调度任务。排版前的比稿Agent检查和排版后终审仍按七阶段规则独立完成。

根61项B便携检查只签路由、metadata、存储归属、时间及父子版本边界，不生成图片、不执行13节点实际评审、不签原件/审美/客户通过。原129阻断案、所有暂停项及默认关闭边界保持。采用与独立证据见[本轮B接线验证](visual-b-verification-20261112.md)。
