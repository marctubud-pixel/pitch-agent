# 提案工作台 · 规范基线

基线版本 **1.7.1**，整理日期 **2026-11-11**。此处是后续开发和人工编排的规范入口：12份岗位文档、16份页面规格、3个固定Skill入口、双团协议和排版后终审协议。既有用户决定沿用；本次补齐组织、页面维护和交接治理，不冒称历史上已确认或自动调度已接通。

先看[Agent组织与职责总览](../agents/README.md)，了解业务与开发两条统筹线、各岗位内部执行者和独立评审关系；再看[页面基线与责任索引](../pages/README.md)，按页面找责任、既有结构、实际路由和待定范围。

## 从任务找到依据

1. 先读[七阶段现行工作流](../workflows/提案工作流_现行规则.md)及[已确认决定](decisions.md)。
2. 从下表选当前岗位、页面，只加载该任务需要的 Skill 附录和上游原件。
3. 按[交接合同](handoff.md)记录本轮所用版本；页面修改按[中文桌面UI基线](ui-system.md)与对应页面规格复验。
4. 修改规范时按[变更与PR](change-control.md)更新版本、变更记录及锁。执行 `python3 scripts/check-specs.py`。

| 阶段／职责 | 执行规范 | 页面开发规格 | 方法 |
| --- | --- | --- | --- |
| 比稿统筹 | [比稿 Agent](../agents/proposal-director.md) | [项目概览](../pages/overview.md) | 逐阶段及排版前简短后台检查 |
| 简报 | [简报负责人](../agents/brief-owner.md) | [新建](../pages/new.md)、[简报与任务](../pages/brief.md) | 任务卡、确认和版本合同 |
| 研究 | [调研负责人](../agents/research-owner.md) | [研究](../pages/research.md) | [design-research-lead r7](../../skills/design-research-lead/SKILL.md) |
| 策略 | [策略负责人](../agents/strategy-owner.md) | [策略](../pages/strategy.md) | 两项基础要求，三个板块；无强制复杂Skill |
| 文案 | [文案负责人](../agents/copy-owner.md) | [文案与主题](../pages/themes.md) | 三方向、四岗评分及异议处理 |
| 视觉 | [视觉负责人](../agents/visual-owner.md) | [视觉开发](../pages/visual.md) | [visual-development-lead 1.0.0](../../skills/visual-development-lead/SKILL.md) |
| 排版 | [排版负责人](../agents/layout-owner.md) | [整案排版](../pages/layout.md) | Deck Studio 1.7适配模板与原生对象 |
| 终审交付 | [终审负责人](../agents/final-review-owner.md) | [终审](../pages/delivery.md)、[交付中心](../pages/delivery_center.md) | 真实页面／产物核验与人类决定 |
| 独立业务评审 | [独立评审者](../agents/independent-reviewer.md) | 对应当前阶段 | 按阶段协议，不能互换门槛 |
| 开发统筹 | [开发统筹Agent](../agents/development-lead.md) | 本轮涉及页面与实现 | 任务范围、实现、独立复核与接续 |
| 跨页UI维护 | [工作台UI负责人](../agents/workbench-ui-owner.md) | [全部页面](../pages/README.md) | 维护共同基线与差异化页面结构 |
| 开发UI审核 | [UI审核岗位](../agents/ui-review-owner.md) | 所有被修改页面 | [项目固定快照](../../skills/ui-review/SKILL.md) |

辅助页面：[首页](../pages/home.md)、[资料库](../pages/library.md)、[流程与历史](../pages/history.md)、[协作通知](../pages/team.md)、[助手](../pages/assistant.md)。资料库、历史、交付中心和助手尚未完整专项定稿，规格明确已知边界。旧[内容审阅](../pages/content_review.md)退役，只保留历史。

## 解决这次反复的方式

岗位文档回答“怎么做、交什么、何时结束、问题退给谁”；页面规格回答“显示什么、怎么操作、有哪些状态、如何核验”；Skill承载确有必要的可复用方法。三者分工，不把每个岗位都做成复杂Skill。

[注册表](registry.json)指定唯一有效路径与版本，[版本锁](spec-lock.json)绑定文件字节和固定截图。[变更记录](CHANGELOG.md)解释修改。历史规则保留在[历史工作流](../workflows/提案工作流_历史_截至20261111.md)，不与当前规则混读。用户后续明确修正时先更新相关规范，再据此开发，不能只改界面或只留在聊天。

## 当前工程与Git边界

规范齐备不代表自动业务编排已经接通。用户本轮授权按应用工程方式纳管源码与文档，当前仓库应用入口为 `apps/workbench-preview`，原scratch预览、较早正式前端、后端和运行数据保持各自身份。安装、配置、使用、验证及回退见[开发入口](../development/README.md)和[使用说明](../usage/README.md)。正式服务、付费模型和在线PPT编辑仍按原暂停范围执行。实际纳管清单见[源码范围](repository-scope.md)。

Git最初无提交和远程是历史起点。2026-11-11已按用户授权提交并推送工程基线，main、工程分支与检查点均已读回，见[发布回执](../development/publish-20261111.md)。后续PR #1/#2已有实际CI成功和合并记录，见[Git接续](../development/git-and-recovery.md)。可见性、协作者、审批及保护设置仍需单独核实，不能由推送和CI推断。

## 当前维护与后续

依赖、过期域测试和纳管门禁已按实际合同修复，当前简报HTTP已完成真实读取、保存、确认与重试，后续生产能力仍待接入。已修与仍缺能力分开列在[后续调整顺序](../development/remaining-work.md)，旧正式前端的HTTP能力按契约迁移，当前接入边界见[本地简报HTTP](../development/http-brief.md)，不重造已认可页面。

## 七阶段运行接入

新项目使用[七阶段运行合同](seven-stage-runtime.md)，原生历史保持旧身份。研究固定方法已绑定实际请求，来源与研究原件读取已接线；r7方法和局部独立读者成果已存在，新协议的同版读者执行、实际修订复查及原件交接已接入，正式放行仍需全部独立检查、双负责人原报告与显式人工条件。启动见[接续](../development/seven-stage-research.md)，旧成果与当前接入差异见[六线对账](../development/capability-reconciliation-20261111.md)。

## PDF原件子路径

当前项目已接[PDF原件保存](../development/brief-originals.md)，复用旧intake并保留原件/卡/选择/操作身份。只完成本地输入子路径，不自动执行解析/研究或签采用；同版reader运行现按读者合同接入；采集、解析和七阶段后续继续推进。
