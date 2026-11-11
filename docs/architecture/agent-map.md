> 岗位执行规范统一从[规范基线](../specs/README.md)读取；业务与开发调度、内部执行角色及UI总责任见[组织总览](../agents/README.md)。下表保留既有实现地图，工具文件存在不证明新规则已接通，临时案例状态不覆盖长期岗位规范。

# 统一岗位职责补充 · 2026-11-11

[现行工作流](../workflows/提案工作流_现行规则.md)区分人类比稿负责人、比稿 Agent、板块负责人和独立裁判。比稿 Agent 对应下表原“提案总监及调度”职责，逐阶段审核衔接，并在排版前检查新增矛盾、错版或缺件。前台七阶段，独立内容审阅页面及岗位退役，排版后终审保留。

这是已确认的业务分工。[比稿岗位方法](../agents/proposal-director.md)与[排版岗位方法](../agents/layout-owner.md)供后续调用。[青屿23页排版](../../output/qingyu-layout-20261111/README.md)已实际组装、导出及UI复验；旧审读原件留作历史，不伪造通过。通用业务自动编排仍未重接。每轮页面使用 `ui-review` 核验实际界面，并沿用整套工作台的视觉体系。以下表格保留实际工程入口，不能据此视为自动流程已完成。

## 当前视觉岗位 · 2026-11-10

视觉开发与接续统一读取 [visual-development-lead](../../skills/visual-development-lead/SKILL.md)。[视觉负责人岗位](../agents/visual-owner.md)说明调用、独立评审与实际接入边界。项目 Skill 和检查器不替代正式服务调度、图像评审或人类确认。以下旧工具映射保留。

## 产品岗位与开发协作

业务依据是[三级协作约定](../workflows/任务范围与三级协作.md)。三级是责任分工，不表示每个岗位常驻一个进程。

| 岗位 | 输入、产物和交接 | 工具及实际入口 | 上下文、写入与失败边界 |
| --- | --- | --- | --- |
| 提案总监及调度 | 任务卡、阶段回执 → 分派、下一步与整案复核 | [executor](../../tools/workbench/executor.mjs)、[coordinator](../../tools/workbench/local-acceptance-coordinator.mjs) | 只消费有效版本；通过原生命令写任务状态，失败退回所属模块 |
| 调研负责人及搜集、核验执行者 | 同一范围卡 → 来源、断言、支持关系、缺口 | [research bindings 与本地驱动](../../tools/workbench/local-research-drivers.mjs)、[语义复核](../../tools/workbench/research-semantic-review.mjs) | 事实和偏好分开；证据不支持时补证或修订，不由总监豁免 |
| 策略负责人 | 研究结论、产品特质与目标用户 → 交叉点与清楚的发力方向 | 当前[基础岗位要求](../agents/strategy-owner.md)；既有工程接口为[strategy contract](../../tools/workbench/strategy-contract.mjs)、[owner-edge](../../tools/workbench/owner-edge.mjs) | 三个简短板块；据实保留依据与版本，缺口标明；原策略Skill不再强制调用 |
| 文案总监及执行者 | 策略、品牌与人群 → 主张、主题、主副文、创意说明与整稿润色 | [copy driver](../../tools/workbench/local-acceptance-copy-driver.mjs)、[creative panel](../../tools/workbench/creative-panel.mjs) | 创作与评分角色分开；改稿保留原文，文案通过才成为视觉输入 |
| 视觉总监及执行者 | 主题、搜索卡、参考 → 候选、草图、视觉、应用 mockup | [reference dossier](../../tools/workbench/reference-dossier.mjs)、[sketch](../../tools/workbench/sketch-runtime.mjs)、[final visual](../../tools/workbench/final-visual-runtime.mjs) | 原图与借鉴用途一起传递；新素材不得伪装为已核验事实；失败退参考、结构或精修负责人 |
| 旧流程内容审阅（历史） | 原审读、问题与处理原件只读保留 | [退役说明](../agents/content-review-owner.md)与[原审读记录](../../output/qingyu-content-review-20261110/README.md) | 不再作为前台环节或独立岗位；当前检查由比稿Agent承担 |
| 排版负责人 | 有效上游内容、页目的、图片、图表及比稿检查结果 → 页面模型和可编辑导出 | 当前[岗位方法](../agents/layout-owner.md)与[版式工坊接入](../../output/deck-studio-integration-20261109/README.md)；既有[layout runtime](../../tools/workbench/layout-runtime.mjs) | 修改事实或主张退回所属负责人；预览/导出同Deck，排版后终审另验；原编排工具未因前台修改自动迁移 |
| 评分组、对应对抗及独立总监 | 规定范围的实际稿件 → 原票、具体问题及有据裁定 | [reference review](../../tools/workbench/reference-review.mjs)、[creative panel](../../tools/workbench/creative-panel.mjs)、[最终审核](../../tools/workbench/final-review-runtime.mjs) | 各阶段 packet 控制读取；首读不带作者推荐或其他裁判意见；不得自创自审 |
| 人工参与者 | 已勾选节点、观点或素材 → 确认、退回或带异议的指定采用 | [contribution plan](../../tools/workbench/local-contribution-plan.mjs)、[reference input](../../tools/workbench/local-reference-input.mjs) | 人工偏好不是事实证据；超时不等于同意；完整参考输入界面和采用仍待接通 |

策略岗位以2026-11-10最新基础要求为准，不再强制旧Skill的固定评分或多轮角色流程。表中后端工具为既有工程接口，尚未按本轮岗位要求重接自动编排。

当前本地服务的实际模型绑定是 `local-synthetic / synthetic`，见 [local-research-drivers](../../tools/workbench/local-research-drivers.mjs) 与 [copy 配置](../../tools/workbench/local-acceptance-copy-driver.mjs)。这是工程夹具，不是实际多模型美学评审或消费者测试。岗位需要的研究、推理、文案、视觉理解和生图能力属于可替换服务要求，真实模型配置与质量测试暂缓。

开发 Agent 使用 [AGENTS.md](../../AGENTS.md) 和本地任务记录。当前可用的开发复核子 Agent 只承担代码或证据审查，不等同业务中的品牌方、用户或传播裁判。独立审查记录与原始业务票据分别保留。

交接的现有实现以 [owner-edge](../../tools/workbench/owner-edge.mjs)、[research-handoff](../../tools/workbench/research-handoff.mjs) 及各阶段合同为准。输入版本、负责人绑定、上下文身份、输出及限制进入原生记录。一般化长期偏好 Memory 权限服务尚未建立，不能从岗位表推断已可自由读写共享记忆。
