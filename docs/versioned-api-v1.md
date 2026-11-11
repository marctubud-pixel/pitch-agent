# 本地工作台 HTTP API v1

本页描述 `tools/workbench/server.mjs` 当前公开的本地接口。基础地址为运行时打印的 `http://127.0.0.1:<port>`。所有 v1 路径以 `/api/v1` 开头。旧 `/api` 路径继续供已有调用者使用；除下文特别说明的调研采集外，共用同一持久化状态、命令身份、校验与响应处理。未知的 `/api/v2` 等版本返回 `404 UNSUPPORTED_API_VERSION`，不会回退到旧接口。此合同不承诺未配置模型、真实消费者研究、自动外部检索或最终交付已可用。

## 请求与响应规则

- 只接受本机 `127.0.0.1` 或 `localhost` 的当前服务端口。写请求的 `Origin` 必须与本机地址相同；`Sec-Fetch-Site: cross-site` 被拒绝。错误为 `403 INVALID_HOST` 或 `403 CROSS_ORIGIN`。
- POST 使用 `Content-Type: application/json`，JSON 顶层为对象。一般请求上限为 128 KiB；图片与文档上传有独立有界上限。未经列出的字段会被拒绝。未提供其他认证机制；本地同源边界不是远程多用户认证。
- 可重试的写命令传 `commandId` 与创建命令以外的 `expectedRevision`。同一命令在旧路径与 v1 路径共享去重记录；相同意图重放返回已保存结果，复用身份提交不同内容或用过期修订提交新命令返回 `409`。先读项目的 `revision`，再提交期望值；不得把 `commandId` 当作授权凭据。
- `GET /projects/{id}` 返回 `{project,view}`，与旧 `GET /api/projects/{id}` 共用公开项目投影。`?revision=N` 读取指定历史项目快照及从该快照计算的视图，N 为非负安全整数；后续项目命令不改变同一历史响应，`project.revision` 标识所读版本。历史 `view.references` 是当时项目记录的展示状态，不执行当前原件校验；当前修订读取仍校验原件。历史 `view.researchWorkflow` 使用当时的策略与审批记录计算，但其中模型可用性检查使用本次服务的 `bindings`/`providers`，并非历史模型配置或历史批准证明。需要当前执行资格时，重新读取当前项目与能力。列表返回 `{projects:[{id,name,revision}]}`。创建与大多数旧业务操作返回 `{project,view}` 或以该对象扩展的结果；输入子资源、助手、终审另有明确响应形状。
- v1 普通项目路由只接受清单列出的查询字段：项目根的单个 `revision`、`readiness-resolutions` 的单个 `jobId` 和 `attemptId`、`sketch-review-input` 的单个 `generationId`。其他普通路由不接受查询字段；意外字段在进入写处理前返回 `422 INVALID_QUERY`。输入、助手、终审由各自模块处理查询；输入项目根无效 `revision` 返回 `400 INVALID_REQUEST`，其他输入路由意外查询返回该模块的 `422 INVALID_REQUEST`，助手意外查询返回 `400 ASSISTANT_INVALID_REQUEST`，终审意外查询按其模块错误返回。缺失、重复或格式错误的必填查询值仍由对应路由校验。
- `GET /capabilities` 返回助手能力、每阶段 `configured`/`available`/`invocationSupported`、各模块能力与理由。`configured` 仅表示配置已加载；`available` 不能代替一次实际执行、认证、来源核验或人工放行。`finalReview` 的实现部件与 `executionAvailable`、`finalAuthorityAvailable`、`deliveryAvailable` 是不同字段，当前后三者均为 `false`。客户端应以每次响应和项目状态为准。

## 路由清单

下表中的路径相对于 `/api/v1`；`{id}` 为项目 ID。`POST` 请求字段列出直接 HTTP 接受的主要字段；模块中的嵌套形状由对应 `GET` 状态及错误 `issues` 限定。未列出的方法或路径返回 404。

| 方法 | 路径 | 输入与响应 |
| --- | --- | --- |
| GET | `/capabilities` | 返回运行时能力对象；旧 `/api/capabilities` 同形状。 |
| GET, POST | `/projects` | GET 列表；POST `{name,brief,mode?,humanGates?,authorizedThrough?,commandId?}`，首次 201、同命令重放 200，返回 `{project,view}`。 |
| GET | `/projects/{id}` | `{project,view}`；可用 `?revision=N` 读取历史。 |
| POST；GET | `/projects/{id}/images`；`/projects/{id}/images/{imageId}` | POST 图片 `{base64,metadata,commandId,expectedRevision}` 返回 `{asset,project,view}`；GET 只读取本项目登记的图片字节，带媒体类型、长度、ETag。 |
| GET | `/projects/{id}/artifacts/{artifactId}/content` | 读取受校验的内容 JSON；无权访问任意磁盘路径。 |
| POST；GET | `/projects/{id}/sources`；`/projects/{id}/sources/{sourceId}/content` | POST `{title,publisher,url,excerpt,intendedUse,attachToClaimId:null,commandId,expectedRevision}` 返回 `{sourceId,project,view}`；GET 仅返回登记摘录文本。来源登记和摘录不是事实真实性认证。 |
| POST | `/projects/{id}/commands` | `{kind,commandId,expectedRevision,...}`；仅允许 `confirm-task-card`、`revise-task-card`、`set-policy`、`adopt-complete-content`、`adopt-final-visual`、`adopt-creative`、`authorize-visual` 的相应字段。伪造模型运行、审查记录或执行结果返回 403。 |
| POST | `/projects/{id}/jobs` | `{stage,commandId,expectedRevision,sourceRecords?或sourceEntryIds?}`；stage 仅 `research`、`strategy`、`copy`；202 `{jobId,project,view}`。无提供方时持久化阻塞，不伪造成功。 |
| POST | `/projects/{id}/verifications`、`/readiness`、`/handoffs`、`/reconciliations`、`/readiness-resolutions` | 项目审核与恢复操作；使用目标 `artifactId` 或 `jobId`、`commandId`、`expectedRevision`，`readiness-resolutions` 还要求 `action`、`attemptId`，替代调用需显式确认。通常返回 200 或排队时 202。 |
| GET | `/projects/{id}/readiness-resolutions?jobId=...&attemptId=...` | 精确查询一项待解决尝试。 |
| POST | `/projects/{id}/research-handoffs`、`/research-release`、`/continuations` | 研究负责人声明、放行及下游继续。分别要求目标内容/依据哈希与人工声明或政策版本；复用修订和命令身份，不自动批准证据。 |
| POST | `/projects/{id}/research-continuations`、`/research-cancellations` | **v1 调研采集协议**。续接使用 `protocolVersion:"research-acquisition-v1",commandId,expectedRevision,sourceEntryIds,materialIds`，两个 ID 数组可以为空但必须提供；取消使用 `generationId,commandId,expectedRevision,reason`。有独立原件/任务语义；同名旧 `/api/projects/{id}/research-continuations` 是历史研究续接协议，不能互换请求。 |
| GET | `/projects/{id}/research-status` | v1 采集/研究状态响应；当前处理器与旧状态查询同形状，但后续应按 v1 合同消费。 |
| POST | `/projects/{id}/strategy-continuations`、`/copy-continuations`、`/creative-panels` | 对已确认上游原件的续接或独立评审排队；需命令身份、修订和相应 `artifactId`/配置字段。 |
| POST | `/projects/{id}/feedback`、`/revisions`、`/feedback-reviews`、`/correction-reviews` | 人类意见、真实改稿及落实检查；需目标原件和命令身份，复审不等于真实客户批准。 |
| POST | `/projects/{id}/source-captures`、`/case-identities`、`/observations`、`/observation-reviews` | 来源采集、案例身份、登记图片观察和审查；采集 URL 仅允许公开 HTTPS；观察图片 ID 必须来自本项目。 |
| POST | `/projects/{id}/reference-materials`、`/reference-choices`、`/reference-actions` | 参考资料增删、候选选择与暂停/恢复/采用/修订/退回；业务字段受 `action` 限定。 |
| POST | `/projects/{id}/sketch-continuations`、`/sketch-review-continuations`、`/final-visual-continuations` | 已配置阶段的续接；主要传 `{commandId,expectedRevision}`；202 含 `continuation` 和项目响应。 |
| GET | `/projects/{id}/sketch-review-input?generationId=...` | 精确读取一轮草图评审输入。 |
| POST | `/projects/{id}/content-continuations`、`/content-revisions`、`/layout-continuations`、`/layout-revisions` | 完整内容/排版续接与修订；传 `{commandId,expectedRevision}`；202 含 `continuation` 与项目响应。 |
| GET | `/projects/{id}/content-status`、`/content-draft`、`/layout-status`、`/layout-semantic-plans` | 当前阶段状态、草稿或语义方案；状态与能力不等于交付完成。 |
| GET | `/intake/capabilities` | 输入解析能力与配置。 |
| GET | `/projects/{id}/documents`、`/documents/{documentId}`、`/documents/{documentId}/original` | 已登记输入清单、单件及校验后的原始文件下载。原件下载有固定附件类型、字节长度和 ETag。 |
| GET | `/projects/{id}/task-card-drafts`、`/task-cards`、`/task-cards/{cardId}`、`/jobs/{intakeJobId}` | 输入草稿、卡片、确认与输入任务快照。`/jobs/{intakeJobId}` 仅是输入任务读取，不是通用执行任务的提交路径。 |
| POST | `/projects/{id}/documents`、`/documents/url`、`/task-card-extractions` | 上传 PDF/图片、采集 URL 或请求结构化提取；需各模块字段、命令身份及期望修订；实际解析或模型可用性以 `/intake/capabilities` 和任务状态为准。 |
| POST | `/projects/{id}/task-card-drafts/{draftId}/adoptions`、`/task-cards/{cardId}/decisions`、`/revisions`、`/confirmations` | 人工采用、逐字段决定、修订与精确确认。嵌套输入由输入模块校验。 |
| POST | `/projects/{id}/jobs/{intakeJobId}/local-retries`、`/reconciliations` | 输入任务本地重试或未知结果对账；不对未知远端执行自动重复收费调用。 |
| GET | `/assistant/capabilities`、`/assistant/schema`、`/assistant/{general|draft|projects/{id}}/{conversation|suggestions|history}` | 助手能力、协议、会话、建议和历史；响应含助手协议标识。会话/历史可接受该模块规定的查询字段。 |
| POST | `/assistant/questions`、`/conversations`、`/reconciliations` | 提问、清空会话、未知结果对账；结果可能为 200、202、422、502 或 503，`state` 与错误应一并处理。 |
| GET | `/projects/{id}/final-review-status`、`/final-deliveries` | 终审状态与已选交付记录，由终审模块独立处理；当前能力字段不可推断成品可下载。 |
| POST | `/projects/{id}/final-review-continuations`、`/final-review-decisions`、`/final-deliveries` | 准备、明确的人工采用/退回与交付放行；使用命令身份、期望修订和目标绑定。无资格/配置/原件时由模块拒绝，不静默放行。 |
| GET | `/projects/{id}/final-deliveries/{deliveryId}/{editorial|stage|evidence}.pptx` | 只读取指定的已归属、已校验 PPTX；`deliveryId` 为 64 位小写十六进制摘要。其他风格、路径或原件不可下载。 |

## 错误与集成示例

普通项目接口的错误体为 `{ "error": { "code": "...", "message": "...", "issues"?: [] } }`。常见状态：`400 INVALID_REQUEST`（请求正文或必填查询值无效）、`403 COMMAND_FORBIDDEN`/`INVALID_HOST`/`CROSS_ORIGIN`、`404 NOT_FOUND`/`UNSUPPORTED_API_VERSION`、`409 REVISION_CONFLICT`/`COMMAND_ID_REUSED`、`413 BODY_TOO_LARGE`、`415 JSON_REQUIRED`、`422 INVALID_QUERY`（未列出的普通 v1 查询字段）或领域前置条件及原件校验失败、`503 SERVER_CLOSING`。助手错误另含 `protocol` 和 `retryable`；不同模块还可返回更具体的领域代码。`5xx` 或网络中断后的命令先读取项目/状态并用同一 `commandId` 对账，不能直接换 ID 重跑外部调用。

```js
const base = 'http://127.0.0.1:4181/api/v1'; // 改为本次服务实际端口
const headers = {'Content-Type': 'application/json'};
const created = await fetch(`${base}/projects`, {
  method: 'POST', headers,
  body: JSON.stringify({name:'示例', brief:'用户提交的简报', commandId:'create-example-001'})
}).then(r => r.json());
const id = created.project.id;
const snapshot = await fetch(`${base}/projects/${id}?revision=0`).then(r => r.json());
const capabilities = await fetch(`${base}/capabilities`).then(r => r.json());
// 先核对能力、上游原件和人工门禁，再提交适用的阶段命令。
```

本机开发测试可以传 `providers:{}` 来证明路由、持久化和拒绝行为；这不构成真实模型、采集质量或交付可用性的验收。
