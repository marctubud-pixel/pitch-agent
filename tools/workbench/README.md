
### Pure domain workflow API

`project.mjs` validates supplied trusted-runtime metadata only. It does not call providers, verify physical isolation, prove factual truth, or certify consumer research. All tests use synthetic artifacts, evidence, scores and render receipts.

### Snapshot storage

`store.mjs` keeps each project revision as a complete snapshot in the existing three-column `revisions` table. Legacy SQL `TEXT` values remain JSON and are read with `JSON.parse`. New writes store a version 1 `BLOB` in the same `snapshot` column. The private 84-byte header identifies raw DEFLATE, records the exact UTF-8 JSON length, and holds SHA-256 digests of both the original JSON bytes and the compressed payload. The reader rejects corrupt frames, trailing stream data, invalid UTF-8, and invalid JSON. These digests detect accidental changes; they do not authenticate database contents.

New writes have a 256 MiB UTF-8 JSON limit and a 257 MiB compressed payload limit. Exceeding a write limit raises `SNAPSHOT_ENCODING_LIMIT` with HTTP status 507 and rolls back the revision. Legacy `TEXT` rows retain their existing read behavior and have no new size limit. The reader guards oversized `BLOB` values in SQL before returning their bodies to JavaScript and bounds actual inflation output. This does not set a process memory limit: JSON strings, project objects, SQLite pages, and buffers can coexist. Retained whole revisions continue to grow the database; this change does not migrate, remove, or reclaim old rows.

The new executable reads both formats. Older executables and direct SQL readers that call `JSON.parse(snapshot)` cannot read a new `BLOB` head. Downgrading after a new write requires a compatible reader or a separate export operation.

`createProject` accepts `mode`, `humanGates`, and `authorizedThrough` (default `final_review`). Initial task-card confirmation is human. Auto runs to that endpoint with no implicit per-sketch stop; a selected `sketch` human gate additionally requires `authorize-visual` for the exact sketch. Policy revisions preserve the endpoint unless explicitly changed and invalidate prior release eligibility.

`REVIEW_ROLES` defines required independent scoring seats by stage. Before any review, the trusted runtime issues `assign-panel {artifactId, seats:[{role,actorId,runId,contextId}]}` for every required role, using runtime-issued identities and lineage metadata. Assignment binds the exact artifact and is immutable even before the first vote. Creator lineage and shared actor/run/context identities cannot occupy seats. Only the assigned identity can score its role, once; later criticism uses independent opposition and cannot replace the original score or raise its mean. A revised artifact requires a new panel. Separately recorded re-evaluation is a future capability; original evaluations cannot be erased. `record-review` requires `role` and `reviewType` (`score`, the default, or `opposition`). Each score needs its own matching opposition with `pairedReviewId` and `firstReadRef`; opposition may expose only that score after the saved first read. Actors, runs and contexts cannot occupy multiple seats on the same artifact. The runtime must enforce actual packet capture and ordering. Sketch and visual require four original 1–5 scores with an unrounded mean ≥4. References instead require `referenceFit: {status:'pass', criteriaRef, evidenceRefs}` on every score.

`record-disposition` records an independent director's `outcome` (`adopt`, `defer`, `reject`, `pending`), `reason`, and `evidenceRefs`, binding all reviews then present. `outcome` applies to the criticism: `reject` means the director rejects the criticism with rationale and evidence, not that the artifact is rejected. `adopt` means accepting a proposed change that still needs a revised artifact. `adopt`, `defer`, and `pending` remain unresolved; only rejecting criticism or explicit human creative adoption resolves creative disagreement, and neither can waive a hard finding. Human `adopt-creative` additionally satisfies selected human gates and records command kind, canonical `adopt_creative` outcome, reviewed IDs and reason. Ordinary human dispositions never satisfy a gate; adoption must cover every current review under the current policy, so new reviews require fresh human adoption. Original reviews and scores remain unchanged; later reviews require fresh dispositions. Findings become hard blockers only with `blocking:true`, `severity:'major'|'critical'`, evidence references and an actionable `requirement`; ordinary observations remain advisory. Unverified factual/inference claims always block.

Release history is append-only. Effective release is recomputed from current policy, reviews, dispositions and the full dependency chain. Each consuming edge requires matching producer/consumer acknowledgments when requested. A newer same-stage request supersedes older jobs for activation; late completions remain historical with `succeeded_stale`.

## 本地项目界面

使用系统捆绑的 Node 24 运行：

```sh
/Users/marc/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node tools/workbench/server.mjs
```

打开 http://127.0.0.1:4181 。默认数据库为 `.data/workbench.sqlite`。`WORKBENCH_DB` 可指定其他数据库，`PORT` 可指定端口。4180 的旧排版工具保持独立。

当前可创建项目、确认或修改任务卡、设置自动或辅助模式及人工节点、查看只读历史。确认任务卡不会调用模型。设置 WORKBENCH_MODEL 后可执行调研、策略、文案文字阶段，资料通过来源网页、摘录、用途和纳入理由录入。摘录一律为 captured，不能从界面伪造已核验状态。自动联网研究、PDF资料解析和视觉生成尚未全流程接入。已支持PNG/JPEG登记与独立观察；策略/文案的实际创意评审见后文，默认未校准，不能自动通过。不能提交伪造模型身份、评分或通过记录。

保存期间控件锁定。如果响应丢失，页面保留原请求并提供原样重试，避免重复创建版本。未确定结果只存在当前浏览器内存，离开页面有提醒；跨浏览器重启恢复此未确认请求尚未实现。项目已提交的版本则保存在SQLite。

复验：`node --test tools/workbench/*.test.mjs`。UI保存恢复浏览器记录见 `.scratch/workbench-v1/ui-save-check.md`，仍不能代替真实生产执行验收。


## 图像 API 传输与输出

图像 API 的传输与受管输出已单独接入，配置及支持范围见 [图像 API 说明](IMAGE_API.md)。通过 `WORKBENCH_IMAGE_CONFIG` 指定后端配置，密钥只从配置所命名的本地环境变量读取。没有默认服务或模型，检查配置不会发起网络请求。

该单元支持单图生成、有序参考图编辑及已锚定结果的无网络恢复。正式图片队列、项目级调用预算和参考到草图的交接尚未接入，`image.available` 与 `stageIntegrated` 保持 `false`。本地夹具验证不代表真实供应商或视觉质量验收。

## 文字阶段执行

```sh
WORKBENCH_MODEL=gpt-6.1-sol PORT=4182 /Users/marc/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node tools/workbench/server.mjs
```

使用本机已登录的 Codex CLI。接口 POST `/api/projects/:id/jobs` 接受 stage、commandId、expectedRevision、sourceRecords。相同提交编号原样重试不会重复调用；不同内容复用编号会拒绝。任务卡必须先确认，策略和文案必须有已放行且完成交接的上游。文字生成与独立摘录核验已接入；创意评分和对抗评审尚未接通，生成稿不会自动成为可放行成果。

启动时恢复已持久化的排队任务。已运行但所属进程确实退出的任务进入待核对，不再次请求。运行中的原进程、未知进程和远端结果不擅自判定失败。实际模型、原始回执、使用量和可用费用均保存在任务记录中，费用未知显示 null。


生成稿可在“当前成果与评审”直接查看正文、缺口、引用和原始JSON。读取接口仅服务本项目登记、位于托管目录且哈希一致的内容，不通过客户端路径读取任意文件。

`evidence-review.mjs` 是摘录支持核验协议。POST `/api/projects/:id/verifications` 接受 artifactId、commandId 和 expectedRevision；界面提供“运行独立资料核验”。运行时读取哈希校验后的全文，冻结任务卡、来源和论断，调用新的模型上下文。程序定位引文，报告和调用回执追加到项目历史，不修改作者原始事实状态。任何未解决的阻断报告仍阻止放行，不能靠最新一次通过覆盖。

新请求冻结excerpt-support-v3及服务端派生的catalogueState，区分案例已登记的内部状态与外部事实依据。该状态只来自成功独立案例检查及完全匹配的原稿来源，不能认证网站、证明消费者偏好或代替研究充分性。分类理由仍接受完整扫描，混合句不能因含有真实内部状态而豁免外部断言。无版本的旧任务保持v2原请求及原报告。v3实际调用必须绑定完整请求哈希、原响应与模型；研究交接继承同一冻结状态。独立审查见`.scratch/workbench-v1/evidence-state-independent-review.md`。

实际集成试跑见 `.scratch/workbench-v1/integrated-verification-live.json`。得闲种子草稿的三条论断得到非阻断结果，放行记录仍为零。早期失败试验保留在 evidence-live 和 evidence-live-v2。摘录核验不能认证网站真实性或代表消费者研究；其他评审、交接和选中的人工节点仍须满足。

## 来源用途与稿件采用方式

来源目录保存原始 scopeRelation 和 verification。调研稿中的 evidenceClassifications.scopeRelation 表示该稿采用方式；suppliedScopeRelation 和 sourceVerification 由程序从原始目录补入，模型不能伪造。直接比较来源可保守用于背景或待核验；未核验的直接来源不能用作直接比较。背景和视觉参考不能互换或提升为直接比较。保守采用不修改原资料，也不把任何论断变成已核验。

旧任务校验失败后不能通过修改状态或重发调用恢复。得闲四源返回稿已离线重校验，但现已提供正式恢复入口；原失败记录保留。

## 恢复已保存的阶段结果

在校验失败且已保存成功模型响应的任务下，点击“核对已保存结果并恢复”。接口 POST `/api/projects/:id/reconciliations` 接收 jobId、commandId、expectedRevision、reason。系统校验原始输入、输出、回执与完成事件，再本地重校验稿件，不重新调用模型。仅支持 Codex 文字阶段 INVALID_STAGE_OUTPUT 的恢复，未知执行结果和核验任务不自动恢复。

恢复记录单独追加，原失败 attempt 保持不变，作者保持原执行身份。旧输入或已被新任务替代的结果不会激活。恢复不新增放行、评审或人工决定。得闲实际恢复证据见 `.scratch/workbench-v1/dexian-live-recovery.json`。

其后独立核验因引用了来源 reason 中的操作备注而被拒收，原报告保留。只有 sourceRecords.text 可作摘录引用；备注不能代替原文。这轮研究仍待补证与重新核验。

## 研究是否足够进入策略

调研成果的“检查是否足够进入策略”调用独立研究审查。POST `/api/projects/:id/readiness` 接收 artifactId、commandId、expectedRevision。报告绑定全文原始字节、任务卡、来源与覆盖问题，判断实际研究是否支持后续策略。模型提出的 ready 或 needs_research 连同原始回执保存，不等于真实客户批准。

真实模型生成的调研稿放行必须同时满足摘录核验、有效 ready 报告与交接及人工节点。任何未解决的负面充分性报告都会阻断，同稿后一次通过不覆盖旧报告。补充研究产生新稿，旧稿保留。

## 研究交付与策略接收

POST `/api/projects/:id/handoffs` 接收 artifactId、side、commandId、expectedRevision。side 为 producer 或 consumer，分别调用研究负责人和策略负责人。系统冻结稿件、任务卡、核验与充分性报告；策略接收还依赖研究负责人的有效签收。客户端不能提交模型身份或代填评审报告。

签收保留允许用途、禁止推论、未解决问题及调用回执。策略任务携带这些约束。双向签收不自动放行，也不代替人工确认。得闲的实际研究尚未通过充分性审查，因此尚无实际通过的双向签收。实现验证见 `.scratch/workbench-v1/handoff-runtime-review.md`。

得闲任务卡第二版已按用户回复确认“轻型”为轻松社交、轻负担的品牌表达，度数未定。该表达不构成低酒精度或健康功效声明。旧稿因任务卡版本变化不能直接放行。

## 继续到策略

POST `/api/projects/:id/continuations` 接收 artifactId、policyVersion、commandId、expectedRevision。只支持调研到策略，服务端核对当前版本全部门禁后放行调研并提交策略任务。持久化意图支持中断恢复与重复点击，不替代人工采用或负责人签收。模型配置变化会阻断派发。

页面显示首个领域阻断原因。得闲当前仍需补充资料并重新核验，不能继续。自动测试使用合成提供方；184项通过不代表全流程已完成。独立复核见 `.scratch/workbench-v1/continuation-review.md`。

## 图片输入单元

`image-evidence.mjs` 按字节保存PNG/JPEG，验证解码、尺寸和哈希。需要Python 3及Pillow。`createImageEvidenceStore` 保留来源声明与截图类型，不认证外部来源。`buildImageObservationRequest` 与 `validateImageObservationOutput` 分离像素观察、文字转录和不确定项。

Codex提供方接受最多四个内部图片描述，实际传入 `--image`，记录有序哈希清单及附件副本；HTTP尚未开放任意路径输入。输入描述在首次异步调用前冻结。文本调用保持兼容。

真实四图运行记录见 `output/dexian/image-observation-live`。独立像素复核排除f02和t11，原报告不改写。结构校验通过不代表描述正确，必须携带独立复核结果。项目上传入口、观察任务及研究引用继承尚待接通。

## 项目图片上传和观察

页面“图片资料与独立观察”接受PNG/JPEG。上传接口 POST `/api/projects/:id/images` 接收有界base64、metadata、commandId与expectedRevision；不接收本地路径。GET同一路径加图片ID仅返回该项目登记且哈希一致的图片。来源说明是提交者声明，不是来源认证。

POST `/api/projects/:id/observations` 接收imageIds、commandId、expectedRevision，使用observation岗位及实际图片附件。页面选择1至4张后提交，完成后刷新查看报告。任务、尝试和报告单独保存；报告不会自动进入研究或使研究放行。未知调用结果保留待核对，不自动重试。

真实得闲已验证HTTP上传、页面选择提交、实际模型观察及报告展示。文件选择器自动化此次未完成选择，不能视为完整浏览器上传验收。独立集成报告见 `.scratch/workbench-v1/observation-integration-review.md`。

## 图文研究依据

研究任务自动冻结当前任务卡下已成功观察、独立复核支持的视觉条目。`sourceRecords` 保存文本摘录，`visualCatalogue` 保存图片、区域、原描述和观察/复核哈希。视觉引用单独核验，不能证明消费者偏好、材料或来源真实性。

核验、研究充分性、负责人交接及策略/文案继承同一目录；后续负面或不确定复核不能被新正面结果覆盖。正文中的图像引用可展开查看对应图片及限制。独立审查见 `.scratch/workbench-v1/visual-citation-review.md`。得闲第5轮真实图文核验通过，但研究充分性不通过；不等于策略已放行。


## 原页与案例图片对应审查

POST `/api/projects/:id/source-captures` 提交url、commandId与expectedRevision。运行时保存公开HTTPS原页、正文、图片链接与载荷哈希。采集成功不等于来源真实性或事实认证。动态页面和验证页可能无法提供有效案例正文。

POST `/api/projects/:id/case-identities` 提交captureId、sourceImageUrl、referenceImageId、commandId与expectedRevision。sourceImageUrl必须在该采集结果中。模型同时查看项目参考图与实际采集的原页图片，分别判断品牌、产品、版本、时间、用途和图片对应。未知保持未知。只有符合任务用途的有效结果可进入直接比较目录；相邻用途仍保留为背景。后续有效否定报告会阻止同一案例旧通过继续使用。

新的研究充分性检查只要求逐条评估稿件实际采用的视觉条目，完整视觉目录仍保留并绑定。未采用图片不能被拿来补足结论。旧报告的全目录协议不重写。

摘录核验的遗漏位置使用content自身为根的JSON Pointer，如`/sections/0/body`或`/summary`。`/content/summary`无效。格式修复不自动恢复旧报告，也不代表调研充分。第8轮仍未通过，第9轮研究已提交；当前零放行。独立修复审查见`.scratch/workbench-v1/evidence-pointer-review.md`。


## 人工意见与文字修订

当前接通调研、策略、文案三个文字阶段。打开当前成果的“修改意见与修订过程”，填写修改要求、候选主题，并可选择最多四张已登记图片及借鉴说明。点击“提交修改意见”后，旧稿立即停止流转；旧稿和原评审继续保留。

点击“按全部意见生成新稿”。系统读取完整旧稿、全部阶段意见、当前上游正文和限制，并实际附上选中的图片。新稿单独保存修订父稿关系及逐项答复，逐项答复不进入对客正文。参考素材不是已验证事实，意见不能改变来源状态。勾选的人工节点不会因生成完成而自动采用。

点击“独立检查意见落实”。新模型上下文读取新旧稿、意见及实际附图，按项给出落实依据或未解决原因。这个检查不是审美评分、事实核验、品牌方批准或完整评审团通过。事实风险及缺失素材不能用人工创意采用豁免；创意异议与人工选择分别保留。原有事实、角色评分、对抗、交接及人工门禁仍独立生效。

HTTP入口如下，均绑定commandId与expectedRevision。

- POST `/api/projects/:id/feedback`保存artifactId、feedbackId、instructions、themes及materials。materials只接受本项目已登记imageId、intendedUse和borrowingNotes。
- POST `/api/projects/:id/revisions`接受artifactId，运行原岗位真实修订。
- POST `/api/projects/:id/feedback-reviews`接受修订artifactId，运行独立落实检查。

重复原请求返回原任务。调用结果不明时保持待核对，不自动重跑。新增意见、上游版本或参与节点变化会阻止旧任务继续；已完成的旧在途结果仅作历史。图片清单及完整请求哈希在生产完成与恢复入口都校验。视觉及后续阶段尚未接入该真实修订执行，不能把目前的文字闭环当作全工作台验收。


## 策略与文案独立创意评审

POST `/api/projects/:id/creative-panels` 只接收 `artifactId`、`commandId`、`expectedRevision`。界面的“启动独立创意评审”创建当前稿件的冻结计划；“恢复未完成评审”只续跑可执行节点。原请求重发及重开服务不会重复成功或结果未知的调用。HTTP不能提供评分、校准、角色身份、报告或通过状态。

策略使用策略/品牌立场一个评分席位，不混入用户评分。文案使用文案、品牌、用户、传播四席。每席分别运行匿名首读、评分、独立对抗首读、读取配对原评分后的对抗。最后由独立总监逐项裁定所有原始问题和对抗意见。文案共17次调用，策略共5次调用；每次都有自己的job、attempt、实际模型、原始响应、packetHash及线程。各上下文独立，不宣称跨厂商验证、真实品牌负责人批准或真实用户调查。

新文案协议creative-copy-message-v3首读只见匿名ID、Slogan和消费者可见辅助文案，不见作者方向标题、创意说明、策略依据、推荐和既有分数。旧v1/v2输入保持原样用于追溯，已暴露作者标题的v2不能批准当前交付。新策略使用creative-strategy-v2，完整读取三圈、交集、切口、推导与回答；旧策略协议仅保留历史读取。对抗先独立质疑，再看对应正方评分，允许零新增问题，不能打分。总监记录采纳、暂缓、驳回、待定及依据，不能修改原始分数。原始报告和每阶段job状态在独立过程入口保留。

校准从可信运行时 `creativeCalibrations` 配置注入，必须绑定协议版本、阶段、角色、provider、model与真实本地证据文件SHA256。证据文件必须在执行存储目录内。默认没有校准；正面分数因此只作诊断，结果为 `cannot_assess`，不能自动放行。文案不借用视觉图片的均分门槛，每个必评维度必须为scored且至少4分，unknown须为null，必评不能改成not_applicable；角色明确通过，三组主题成对比较也必须成立。策略保留维度诊断分，但使用明确任务判断，不设未经确认的数值门槛。人工可以明确指定采用创意取舍并保留异议，但不能改变事实核验、来源状态或硬性风险。

上游版本、任务卡、政策或新增反馈变化会停止旧评审。新反馈必须先形成真实修订稿，旧稿不能换一个评审编号继续。已有手工评审保留为历史元数据，不能解锁实际模型文字稿的创意门禁。实际评审不代替摘录核验、双向交接或勾选的人类确认。总监可用冻结原文和任务证据驳回不成立的批评；实际独立事实核验的阻断仍单独生效。只有运行时已持久记录dispatchStarted=false的提供方缺失或配置不符失败，才可在显式恢复时追加新的attempt身份。已派发、结果未知或缺少派发记录均不自动重试。视觉和排版评审尚不使用此文字协议。


## 本地派发上限与恢复

默认最多同时执行2个任务。可通过`createServer({maxConcurrentJobs})`或环境变量`WORKBENCH_MAX_CONCURRENT_JOBS`配置，允许整数1至8。运行中的实例按跨项目入队顺序派发并去重；重启按持久项目及任务扫描恢复，不承诺跨重启的全局先后顺序。

正常`server.drain()`等待排队任务、在途任务及可推进的创意后继节点。关闭时停止派发新任务，等待已进入的HTTP请求及在途保存后关闭数据库。未开始任务保留queued，重开恢复。超时调用仍为awaiting_reconciliation，不能通过重开或“恢复评审”按钮盲目重试。并发上限测试不是速度提升或超时根因证明。

当前真实文案探针只保存了5份有效首读，7次调用超时，完整文案对抗和总监环节未完成。测试里的完整17次调用均为合成提供方；实际模型验证与这些测试分开记录。


## 完整文案合同

新文案任务及修订冻结copy-message-v2。每个方向保留slogan、supportingCopy、creativeExplanation，以及原有rationale、differentiation、evidenceIds。页面分别显示支撑文案、创意说明、策略依据和方向差异。匿名评审只读取前两项消费者可见文字，不能用作者解释证明广告已经表达清楚。

没有版本的历史任务继续按旧schema和prompt执行或恢复，不填充、替换旧字段。旧稿可读但不算当前完整交付。生产和恢复按冻结版本校验完整正文哈希，服务端生成copyContract。无论实际生产或元数据导入，缺少完整合同都不能新放行；人工审美采用不能补足缺失产物。真实下游执行也检查这个条件。

新评审使用creative-copy-message-v3，已派发v1/v2请求按原协议保留。新v3可与同稿旧v2共存，旧请求重发仍返回旧记录，不能重新派发未知调用。旧v2因作者标题暴露不能自动批准或通过人工偏好绕过。各协议校准证据独立，不借用旧协议的校准。首读需引用本方向主题和辅助文案；单项评分可引用相关的本方向消费者文字，成对差异必须引用双方主题。

隔离开发实例实际生成完整文案并显示，旧v2有9份有效报告、5次超时，未完成总监评审。其上游是标明的合成数据，且匿名输入发现作者标题泄漏，因此不作为盲评或正式得闲验收。修复后的v3真实整组验证仍待完成。完整回归353项通过，含历史请求一致性及真实本地HTTP测试；合成提供方测试不代表模型评审质量。


## 脚本声明的来源图片候选

采集器支持搜狐文章页中匹配文章ID的静态cfgs.imgsList字面量。该适配器不执行JavaScript，不抓取脚本中的任意URL，也不据图片数组顺序赋予图注。支持页保留原img项，并追加带script-declared来源、适配器、声明路径和原始UTF16定位的候选。旧采集记录不会原地升级；重新提取需要新的采集命令及原始回执。

界面将这些项标为“脚本声明候选”。选择后，系统仍通过公开HTTPS、DNS固定、地址/跳转和文件限制取得实际图像，检查原页声明定位，再由独立模型核对两图、案例字段及任务用途。候选登记不证明页面实际显示、来源真实性或产品性能。2026-10-26的实际三酉记录可作限定同用途比较，不能作为25岁人群偏好证据。

## 提供方限流诊断

新提供方回执可附rateLimit历史观察，来自CLI受限重试日志，记录429、等待毫秒数、来源、证据行哈希及可解析时间。不复制原日志正文。成功后保留的观察不表示当前仍被限流。超时仍为awaiting_reconciliation，诊断不会授权重试、放行或改变旧回执。现有180秒截止与较长限流等待的冲突已由原日志确认，等待预算/节流恢复策略尚未实现。

## 当前研究阻断

得闲R11有15条获支持论断，但核验报告仍因分类理由中的两个内部登记状态而阻断。独立审计发现核验缺少独立的可信状态通道。旧报告保留为负面，不以新案例身份或代码测试数量代替研究充分性。下一步应修复新版本核验契约，仍检查所有自由文字中的市场断言，不能通过忽略方法备注来绕过事实检查。

`POST /api/projects/:id/revisions` additionally accepts optional `supplementalSourceRecords` for an actionable machine-backed correction. Each record has `id`, public HTTP(S) `url`, full captured `text`, `scopeRelation` (`background` or `unverified`), and optional `reason`. The server forces captured status. Verification, case identity, receipt and hash fields are forbidden. IDs must be new and unique across the retained parent and delta. Parent order, complete text, provenance and caveats remain unchanged. No truncation or implicit global source/image append occurs. Combined limits are 200 records, 20000 characters per text, 1000000 total text characters and a 2 MiB evidence envelope, in addition to the HTTP body limit. Reasons explain inclusion/limits and never supply missing textual evidence.

New machine corrections use `typed-revision-v3` with a single `correction-evidence-v1` envelope. Source and visual job/artifact catalogues are exact projections. `sourceSetHash` still hashes the original report inventory. New v3 producers require `correction-handling-v3`, whose context is reconstructed from the exact registered producer request, receipt, task card, upstream snapshots and materials. The checker receives complete source texts and accepted visual observations with limits. This does not claim fresh pixel inspection. Actual human material images remain attached and bound. Historic typed-v2 and handling-v1/v2 packets keep their original meaning and bytes. Ordinary factual review, readiness, owner acceptance and selected human gates still apply.

## Experimental explicit reference discovery parser

`reference-http-search.mjs` is the sole public package entry. Calling `searchPublicReferences({query, storeRoot, limits}, dependencies)` performs one bounded capture, then private literal HTML parsing and immutable discovery-only receipt persistence. It never fetches destination pages. App automatic reference search remains disabled.

Use Node 24.13.0 or later in the Node 24 line and pnpm 11.25.0. Bootstrap a user-managed pnpm installation with `npm install --global pnpm@11.25.0`, or use an existing managed pnpm 11.25.0. Check `node --version` and `pnpm --version` first. From `tools/workbench`, run:

```sh
pnpm install --frozen-lockfile --ignore-scripts --registry=https://registry.npmjs.org
node --test reference-http-search.test.mjs reference-search-parser.test.mjs
```

The private package pins parse5 8.0.1 and locks entities 8.1.0 with registry SHA-512 integrity. There is no vendored parser, global parser resolution or scanner fallback. Installation scripts are disabled. Do not copy prototype node_modules or caches. `reference-search-parser.mjs` and `reference-search-parser-worker.mjs` are private implementation files; direct filesystem imports remain possible in Node. The parser test enforces the import boundary across application modules. Tests can inspect private parsing to prove semantic selection before strict refusal.

Receipt schemaVersion 2 binds `parse5-8.0.1-strict-literal-v1` to the fixed parser policy. Existing experimental v1 history stays immutable and is not reinterpreted. Offsets index UTF-16 code units in fatal UTF-8 decoding with the BOM retained. Each quote is an exact original slice. Only source-backed, explicitly closed HTML result anchors and compatible inline titles are accepted. Static exclusions do not claim computed CSS visibility. Parse errors other than missing/non-conforming doctype refuse the entire response.

The acquisition and parse share at most 10000 ms. Parsing receives the smaller of 1000 ms and remaining acquisition time, including worker startup and reply. Each explicit search uses one short-lived worker, awaits termination on every terminal path and has no worker pool. The worker gets a 128 MiB old-generation heap limit and 4 MiB stack limit. These are not total RSS, ArrayBuffer or external-memory guarantees. Input bytes, anchor/title lengths, eligible counts, tree nodes/depth and parse errors have fixed ceilings recorded in the receipt policy. Traversal ceilings apply after parse5 constructs its tree. Worker termination supplies responsiveness and cancellation. It is not a hostile-code security sandbox. No page JavaScript or DOM resource request runs. Immutable filesystem persistence must still complete or throw; OS scheduling and disk operations are not covered by a hard wall-clock guarantee.


策略v2的生产、原件、评审、负责人交接与全案义务见 [STRATEGY_CONTRACT.md](STRATEGY_CONTRACT.md)。
