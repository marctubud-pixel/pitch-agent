# 研究自动采集运行合同

规范版本：1.0.0。本合同约束当前受限HTTP及研究页的采集接线。实现复用`research-acquisition-v1`、既有四分支、原件封口与唯一r7研究生产者，不增加业务阶段。业务方法仍以[调研负责人](../agents/research-owner.md)和[七阶段运行合同](../specs/seven-stage-runtime.md)为准。

## 运行与配置

默认`brief-server`没有执行器，不创建采集任务，不扫描或恢复队列。显式研究配置需要有效的搜索适配器、`research_planner`和`research`岗位绑定、匹配的提供方，以及采集预算。`capability.available`核实际适配器形状与配置，不证明远端在线或来源真实。

CLI沿用`--research-config PATH --research-execution enabled`，配置必须指向同一个新隔离SQLite。`launch-config.mjs`将`researchAcquisition`、`searchProviders`和`server.executionRoot`交给既有执行器。默认开发命令不提供可付费执行配置。程序化本地工程配置可注入合成提供方及搜索传输，须保留测试身份，不能登记为真实市场调研。

`tools/workbench/package.json`与`pnpm-lock.yaml`固定parse5及传递依赖。根`npm run setup:workbench`使用`pnpm@11.25.0`、冻结锁文件和禁用安装脚本安装这些依赖；Application CI显式执行该安装。安装依赖不会启动服务或执行采集。

## HTTP请求与回执

项目路径前缀为`/api/v1/projects/:id/research-acquisition`。接口限定如下。

| 方法与后缀 | 请求字段 | 行为 |
| --- | --- | --- |
| GET，无后缀 | 无body或query | 读取原生状态、实际原件及能力，不派发任务 |
| POST `/start` | 公共字段、`sourceEntryIds`、`materialIds` | 登记本次输入，创建原生采集计划任务 |
| POST `/step` | 公共字段、`generationId`、`jobIds` | 仅执行明确选中的1至4个合法任务 |
| POST `/reconcile` | 公共字段、`generationId`、`jobId` | 仅核对对应原保存结果，不重新调用 |

公共字段是`commandId`、`expectedRevision`、`taskCardId`和完整`taskCardHash`。字段必须完全匹配对应接口。来源与资料ID各最多20个且不能重复，客户端不能提交封口对象、采集引用或生成结果。接口沿用128KiB、JSON类型、方法、loopback Host、明确Origin及拒绝query的守卫。

返回包络为`{project,view,acquisition,capability,revision}`。POST另含`receipt:{commandId,replayed,operation,generationId,jobIds}`。项目、视图、状态及实际原件读取绑定同一revision，读取中改变返回409。前端核对原请求、回执和实际原生记录，不凭HTTP成功码确认结果。

## 同版输入与固定任务集合

开始前必须确认当前完整任务卡并预登记r7关键问题及读者计划。`research-acquisition-http-request`将原body、操作、固定任务集合、原卡、原问题登记及实际请求者保存到`researchAcquisitionHttpRequests`。执行审计保持实际Agent身份。这是技术请求账本，不是人工批准。

每次`step`只处理其原集合中仍queued且零attempt的任务。同body重放不会替换为后来产生的分支或研究生产者。实际原生claim再次核固定成员、原卡、原问题登记与预先捕获的revision，避免仅靠HTTP入口的前置检查。原claim已保存但未能证明派发结果时，不能自动重发。

计划产生行业与专业报告、品牌与产品、同任务竞品、人群与接触情景四个分支。四分支仍受既有预算、并发和截止限制。实际原件封口后，既有私有采集准入允许唯一研究生产者消费该版资料。原r7方法、问题登记及来源身份继续进入实际任务和调用原件。

## PDF原件资格

`capability.materialsRootShared`仅公布两处原件根是否相同，不暴露路径。选入PDF要求显式研究执行根等于同一新SQLite的`${dbPath}.originals`。默认研究根`${dbPath}.research`与PDF根不同，不能直接选入PDF。新配置对齐根目录，不移动或复制旧原件。

资料须来自当前任务卡的实际bridge登记，并通过原字节与已保存抽取结果核对。具备部分正文的`partial`结果可选入；空页、未覆盖内容及抽取限制继续保留。根不一致、历史卡或损坏原件均拒绝使用。解析成功和资料选入不代表事实核验或人类采用，详见[PDF解析合同](brief-extraction.md)。

来源和资料均可为空。有效显式搜索配置允许四分支自动取证，不要求先手填来源。

## 未知结果与恢复边界

HTTP返回丢失、结构不完整或无法绑定原请求时，前端保留原path与原body的会话日志，只能显式核对同一提交。不能用新revision、卡或任务集合重造原请求。

如果原技术账本与固定任务集合已核对，但原生任务为`awaiting_reconciliation`，HTTP提交已知，传输日志可以结束。业务结果仍未知，自动链停止；用户另行显式核对原采集或研究生成结果。缺原IO继续待核，不重新搜索、抓取或生成。

计划及分支可按原generation冻结的卡、计划和实际保存IO核回。没有提供方配置、原任务已变为历史时仍可核回，但返回`current:false`，不提升当前资格。唯一研究生产者仅在原卡和原问题计划仍当前时，通过既有`reconcile-stage`核对实际保存的HTTP结果。历史生产者返回`ACQUISITION_PRODUCER_HISTORY_UNSUPPORTED`，保留unknown，不能制造历史研究稿。

本包不承诺死亡owner接管、自动重试或所有崩溃位置恢复。原件、失败、未决及历史记录继续保留。

## 研究页行为

当前HTTP服务提供可选`WorkbenchService.researchAcquisition`，Mock和青屿既有投影不补此能力。研究页沿用原配色、组件和阅读结构，主操作为“采集并生成研究”或“继续本次研究”。来源与PDF选择、四分支覆盖、限制、原件状态和原结果核对放入折叠副层。

单次明确操作最多执行六个`step`，每步固定1至4个原任务。只有该集合全部实际成功，才提交下一步。冲突、unknown、原件错误或缺能力立即停止，刷新不自动续跑。当前报告已保存后转入核验与独立阅读；采集完成不表示研究充分或通过。

三个写入口及待核提交均按workflow权限保护，游客不能执行或恢复写操作。未配置采集时，既有“使用已登记来源生成研究稿”按原能力保留。已知历史结果明确提示历史，历史研究生产者的核回入口禁用并说明未支持范围。

## 验证范围

`research-acquisition-service.test.mjs`及唯一新名`research-acquisition-bridge-http.test.mjs`验证本包受限接口。旧`research-acquisition-http.test.mjs`仍是完整旧服务测试，不因名称相近纳入本包或重开旧运行。

受限验收使用新SQLite、本机合成模型HTTP、注入式搜索传输及显式真实PDF工具。范围包括原任务集合重放、实际claim换卡或换问题计划、默认零执行、已解析PDF与来源进入封口、当前生产者核原IO及历史拒绝。前端专项覆盖严格回执、两层unknown、同body恢复和权限。真实页面、独立审查与PR/CI另以实际回执登记，不能从候选自测推断通过。

后续仍需简洁三板块策略、文案视觉、通用同版Deck及终审交付接线，以及包装和KV整链验收。旧得闲、青屿、旧数据库、付费或真实模型、生产账号、外部通知、云部署及在线PPT编辑保存暂停范围保持。

当前采集的资料复选框回显原请求冻结的选择；刷新后仍按原集合显示并锁定。四分支先显示原记录的摘录与来源站点数量，完整范围和限制原文保留在二级原始记录中；数量不代表覆盖充分或适用性通过。
