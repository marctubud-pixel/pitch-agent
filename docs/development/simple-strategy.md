# 简洁三板块策略运行合同

规范版本：1.0.2。本合同规定当前七阶段应用的策略接线。业务要求仍是[策略负责人](../agents/strategy-owner.md)的两项基础要求，不恢复旧复杂策略Skill、候选推理图或固定多轮评分。

## 输入与三板块输出

协议为`proposal-simple-strategy-v1`。原生研究continuation intent使用当前研究放行派生唯一策略任务，复用既有执行器、存储、模型调用与交接。开始前仍需有效r7研究、同版预登记问题和独立读者、事实、readiness、semantic、研究双负责人实际报告及显式放行。工程操作员的合成放行只证明接线，不代表真实客户批准。

`strategyBasis`冻结完整任务卡、研究原稿与SHA、实际产品或用户输入、policy、交接权威原件及限制。其`basisHash`绑定实际请求。研究中的假设、未决问题、允许用途、禁止推论和reader限制继续传递，不能用任务要求升级市场事实。

输出严格包含以下字段。

| 字段 | 含义 |
| --- | --- |
| `strategyContractVersion`、`strategyBasisHash` | 固定协议和原输入身份 |
| `outputKind`、`status`、`title`、`summary` | 策略稿类型、生成状态和正文摘要 |
| `strategy.researchConclusions` | 研究结论数组 |
| `strategy.intersection` | 方向交叉点，关键缺证时可为null |
| `strategy.focus` | 策略发力点，关键缺证时可为null |
| `gaps`、`limitations` | 具体缺口与继承限制 |

每条判断包含`id`、`text`、`kind`、`refs`和`limitations`。`kind`为fact、requirement、inference或assumption。引用包含真实`sourceId`、JSON Pointer `location`及原句`quote`；非JSON原文定位`/text`。非假设判断须引用原文，假设须明示限制。引用存在不等于推论成立，独立核验继续判断其语义。

`status:complete`仅表示三板块生成完整、无阻断缺口。缺关键依据时输出`blocked`及具体gaps，保留已有结论，不用模板补齐。原basis限制不得遗漏。`complete`不表示事实、双方负责人接收、阶段放行或客户批准。

## 创建授权与能力

服务端`creationAuthorizedThrough`默认research。程序化服务和launch配置`server.creationAuthorizedThrough`按既有`STAGES`枚举校验，本轮隔离整链工程配置显式选用final_review。公共项目创建body不接受该字段；创建重放核原终点。修改服务器默认值不升级旧项目，也不开放旧`set-policy`。

授权终点与可执行路由分别成立。简洁策略生产与独立全文核验沿用本合同；策略双负责人至文案评审另见[文案接续合同](simple-copy.md)。设置final_review不自动开放视觉、排版或终审生产。

`capability`固定策略协议，并返回configured、executionAllowed、available和reason。configured核strategy/verification岗位与模型绑定、HTTP适配器标识或execute函数；它不是HTTP配置、凭据、远端在线或实际调用成功的完整探测。默认没有执行器，不扫描或恢复队列。执行还需当前版本、授权、研究放行及原件资格，不能凭available绕过。

## 四个受限接口

路径前缀为`/api/v1/projects/:id/simple-strategy`。公共字段为`commandId`及`expectedRevision`。

| 方法与后缀 | 请求字段 | 行为 |
| --- | --- | --- |
| GET，无后缀 | 无query | 读取当前工作区、实际正文与原核验报告 |
| POST `/continue` | 公共字段、研究`artifactId`、`policyVersion` | 续原研究放行意图，执行唯一策略任务 |
| POST `/verify` | 公共字段、策略`artifactId` | 复用既有独立全文核验任务 |
| POST `/reconcile` | 公共字段、原`jobId` | 核原保存结果，不派发新调用 |

body必须与操作的字段集合完全一致。接口沿用128KiB、JSON、方法、loopback Host、明确Origin及query守卫。GET包络为`{project,view,strategy,capability,revision}`；POST另有`receipt:{commandId,replayed,operation,jobId}`。异步读取前后核同revision，不将正文与另一版状态拼接。

`strategy.protocolVersion`为`simple-strategy-workspace-v1`。工作区含taskCardId、researchArtifactId、policyVersion、producerJobId/producerStatus/attemptCount、artifactId/contentHash/content、blockedOutput、failure、current、history、verification、unknownJobs和reason。未产出时content为null，历史保存真实artifactId/contentHash。原内容和报告先核实际文件，不以metadata补通过。

受阻结果保持job=blocked、artifactId/content=null，不登记完成稿。`blockedOutput`仅是原attempt诊断，含attemptId、contentHash和保留三板块的content；读取时核冻结原packet、原模型HTTP响应、schema、normalized路径与真实字节SHA。只有原STAGE_INPUT_GAP且确实blocked的输出才返回该诊断；不能用它启动核验、双owner或copy。`failure`绑定原job的code/message，页面就地显示缺项、已有结论及限制，不能只显示泛空态。旧完成稿不与较新的受阻producer拼接。

## 固定任务、版本与全文核验

`simpleStrategyHttpRequests`保存continue、verify或reconcile的原body、唯一原job、模型binding及原卡、完整policy、研究、放行与问题登记快照。它是技术账本，不是人工批准。命令同body重放只处理原job，不能换任务或用新head重造原请求。

实际claim使用捕获的revision和稳定派生命令，再核账本快照、原job及binding。服务在研究reader物理核验await之后再次比较配置binding。queued且零attempt才可执行；running或unknown保持原状态，不重派。已有同目标核验未决时，换command不能绕过。

全文核验读取完整三板块、限制、引用及实际原件，保留原独立执行者与`HARD_BLOCKER`。SIMPLE稿件没有旧复杂策略claims结构；核验适配的空claims投影不是事实通过证明。读取原件时去掉该投影并重算原文SHA，不能删除全文扫描或硬伤判定来适配schema。

## 两类原结果恢复

HTTP丢响应、错回执或无法绑定原记录时，前端保存精确path/body日志，刷新后显式核对同一提交。已核技术账本但native结果unknown时，可结束传输日志，业务仍待核，另发明确reconcile。queued/running或真正未知不能自动换命令重试。

策略生产者仅恢复仍当前冻结basis下、实际保存的普通HTTP结果。专用SIMPLE原件适配核原恢复命令和审计、job、attempt、receipt、输入packet、响应、normalized及实际正文SHA。

核验恢复使用窄命令`reconcile-simple-strategy-verification`，仅接受当前SIMPLE目标的原unknown attempt及实际成功HTTP locator。保留原attempt和原executor作为报告context，恢复人单独记录为`recoveredBy`。原独立核验、完整报告验证及原JSON/receipt/packet/manifest/正文SHA继续核对，不将unknown置回queued。

历史卡、问题计划、研究放行或policy已变化，以及缺原IO时，恢复保持拒绝和unknown。原提供方不可用时也不能重新调用。历史原件、失败、坏文件和未决记录保留，不用新标签制造恢复成功。本包不承诺死亡owner接管或所有崩溃位置恢复。

## 页面与完成状态

当前HTTP策略页通过可选`WorkbenchService.simpleStrategy`读取实际SIMPLE稿。Mock与青屿不补此能力。三板块保持研究结论、方向交叉点、策略发力点，沿用既有配色和三环加右侧结论结构。产品、人群、竞争三环仅表示分析关系，不表示统计面积或已验证人群重合。

逐点展示事实、任务要求、推论或假设、原引用及限制。原稿/SHA、完整核验及历史详情折叠；真正错误与未知不显示为完成。写入口和原提交恢复按workflow权限保护，游客只读。导航只GET，不自动继续、重派或签接收。

生成动作位于策略页，研究页旧`continueToStrategy`未因此改接。原生投影对有效SIMPLE产物显示`needs_acceptance`，不是stage complete；前端也不填造旧Proposal.strategy结构。策略双负责人交接到copy已按[文案接续合同](simple-copy.md)接线；策略修订、文案改稿再评及视觉至交付仍待接。

## 当前核验边界

本轮样本与HTTP模型仅为新隔离SQLite和本机合成工程配置，研究前置通过原r7/reader/事实/readiness/semantic/双负责人及显式工程release。HTTP/config专项结果、最终门禁、真实UI及独立复核分别按原生回执登记，候选静态审查不能替代运行通过。

三方向文案与独立评审已接线。完整目标还需文案改稿再评、视觉参考/草图/成稿/样机、同版Deck与终审、包装及KV两类整链和实际可编辑PPTX。旧得闲/青屿、原件/库/票及付费或真实模型、生产账号、通知、云部署和已暂缓在线编辑保存范围保持。
