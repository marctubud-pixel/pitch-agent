# 研究独立读者运行合同

规范版本：1.0.1。范围为当前七阶段项目的研究问题预登记、AI正文首读、修订复查、原件核对及研究交接。方法沿用固定[调研Skill r7](../../skills/design-research-lead/SKILL.md)，不是另一套研究方法。

## 状态与责任

研究负责人先登记问题和一至两位读者，再生产研究稿。问题记录绑定完整任务卡、方法SHA、登记修订号；生产任务保存同一登记并实际带入请求。无预登记的已有草稿保持原身份，不能补一份问题记录就签r7完成。

读者从新隔离上下文读取实际报告的完整可见正文，先复述六维、逐题回答，再解释跨维综合、策略约束和具体问题。首读不给作者评分、预期答案或另一读者意见。当前入口不发送页面像素；页身份清单不能冒称看图。AI读者不代表真实消费者。

同版全部预定席位都要有原始报告；缺席、错卡、错稿、方法改变、关键未答、主要误解、关键缺证或未决调用均阻断理解完成。事实、研究充分性、semantic、负责人接收、人工放行继续独立判断。`factualSufficiencyVerified`、`consumerValidation`、`humanApproval`在读者证明中恒为false。

## 原生记录

| 对象 | 原生集合与绑定 |
| --- | --- |
| 预登记 | `researchQuestionRegistrations`：卡ID/完整hash、固定方法、问题、readerCount、registrationHash、registeredRevision和登记人 |
| 读者任务 | 既有`jobs`，purpose为`research_reader`；保存席位、原请求、readerInput、readerContentText及独立attempt |
| 原始报告 | `researchReaderReports`：原回复、六维复述、问答、综合、问题、复查、限制，绑定稿件/packet/report/job/attempt/receipt |
| 逐项处理 | `researchReaderDispositions`：原问题编号、负责人回应、实际处理、新稿原文引证，以及新旧稿/原报告/packet的hash |
| 交接证明 | `research-reader-evidence-v1`：本版全部席位的原packet/raw report和evidenceHash；进入声明basis与owner真实请求 |

`research-reader-loop.mjs`定义纯输入输出；`research-reader-state.mjs`处理登记、任务、处置和同版资格。它们不读取磁盘，不能单凭公开hash认证一次模型调用。

`executor.mjs`复用既有job/attempt及`invokeOrdinary`。`ordinary-model-project.mjs`重建精确请求、原生HTTP locator和保存结果。`research-reader-original.mjs`核实际研究生产原件、完整正文投影、调用输入/原始输出、规范化报告及全部修订祖先；`research-reader-workflow.mjs`在HTTP快照和正向操作核当前真实文件。文件缺失或损坏时，界面检查及推进权限都转待核。

## 修订与复查

读者报告作为`research_reader`类型的实际machine source进入既有typed修订引擎。问题、未答题和未解复查成为修订义务；原理解、已答内容和限制作为保留约束。不能把事实风险改成可豁免的审美偏好。

修订生成新的实际稿件。逐项处理引用新稿真实文字，不能只在对话里解释。复查绑定同plan、同席位最新报告、新旧稿SHA和实际修订祖先；选择旧通过票或另开首次阅读不能隐藏新负票。未解决的旧问题在新报告中保留原ID、类型和关键性。负责人回应保存与读者复查分别记录。

读者理解证明进入研究声明basis、生产者交出和策略负责人接收的原packet。owner必须保留读者原限制和未决说明。研究放行仍需要原事实/充分性/semantic检查、双负责人真实报告、无未知任务及显式人工操作。放行不授权执行旧复杂策略。

## HTTP接口

以下路径均以`/api/v1/projects/:id`开头。POST沿用`commandId`和`expectedRevision`，白名单、同源、128KiB请求限制及原生乐观锁保持。

| 接口 | 输入或输出 |
| --- | --- |
| POST `/research-questions` | questions含id/question/critical；readerCount为1或2。已确认卡可登记，默认不调用模型 |
| POST `/research-readers` | artifactId、registrationId、seat；复查另给previousReportId和dispositionId |
| POST `/research-revisions` | artifactId；复用已有typed修订，返回真实jobId |
| POST `/research-reader-dispositions` | 新稿artifactId、previousReportId及逐项dispositions；真实引文预检后保存 |
| POST `/research-reader-reconciliations` | 指定原jobId；读取保存的HTTP结果，不派发新调用 |
| GET `/research-reader-reports/:reportId` | 原报告和实际原件proof；历史稿可读，但current=false |

模型执行默认关闭；显式配置沿用受限研究开关，另需`bindings.reader`及对应provider/model。`capabilities.research.reader`区分configured、正文阅读scope和recheckAvailable。没有读者配置不创建任务。程序化测试provider可用`testOnly:true`把新生产/读者task标为合成本地工程；此标签不改变生成身份、证据或批准门槛。

## 未知结果与保留

三类阅读/修订/处理提交复用前端原请求日志，按path和body识别权限。问题登记与处理属edit_research；调用与核原结果属workflow。只读角色不能借新增接口写入。

回报丢失后重放原body、命令和修订号。原登记或任务已进入历史时，先核实际原回执，再清除已知结果的未决状态，并显示历史提示及原内容；不把旧稿当当前稿成功。错回执或真正未知继续保留原请求。

已派发的读者任务不能自动retry。原生HTTP结果落盘后丢返回，可以在没有provider配置时核同一locator、原输入和原回复恢复；缺原件继续unknown。修订任务的未知结果同样不能改ID重发。默认启动不扫描或恢复旧job。仅原请求完全匹配、当前卡/稿/问题计划/方法及冻结模型绑定仍有效、尚无attempt的queued任务，才允许在配置完整且明确启用时继续执行；已派发、未知及历史任务不借重放再次调用。

原结果核回与当前资格分别判断：换卡或替换问题计划后，可凭冻结原计划、原卡、实际原稿和同一HTTP locator核回历史读者报告，原件损坏仍不结案。前端对成功修订比较唯一实际输出和当前稿，对问题登记比较同卡最新计划；已知历史走历史提示，不能仅凭卡ID相同当作当前成功。首读、修订和核回的折叠详情保留实际原请求供核对和复制；问题与处理继续显示原实际内容。

原件与SQLite按[保留规则](../storage-retention.md)保留，Git不代替业务文件恢复。[本轮核验](research-reader-verification-20261111.md)区分合成工程接线、真实业务质量和未验范围。PDF解析/自动采集、简洁策略及其后全链仍单独接入；不重开旧案例或付费服务。
