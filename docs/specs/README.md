# 提案工作台 · 规范基线

基线版本 **1.0.0**，整理日期 **2026-11-11**。此处是后续开发和人工编排的规范入口：10 份岗位文档、16 份页面规格、3 个固定方法入口。既有用户决定沿用；本次新增的版本锁、PR和检查规则是工程治理整理，待本轮审阅，不冒称历史上已确认。

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
| 开发UI审核 | [UI审核岗位](../agents/ui-review-owner.md) | 所有被修改页面 | [项目固定快照](../../skills/ui-review/SKILL.md) |

辅助页面：[首页](../pages/home.md)、[资料库](../pages/library.md)、[流程与历史](../pages/history.md)、[协作通知](../pages/team.md)、[助手](../pages/assistant.md)。资料库、历史、交付中心和助手尚未完整专项定稿，规格明确已知边界。旧[内容审阅](../pages/content_review.md)退役，只保留历史。

## 解决这次反复的方式

岗位文档回答“怎么做、交什么、何时结束、问题退给谁”；页面规格回答“显示什么、怎么操作、有哪些状态、如何核验”；Skill承载确有必要的可复用方法。三者分工，不把每个岗位都做成复杂Skill。

[注册表](registry.json)指定唯一有效路径与版本，[版本锁](spec-lock.json)绑定文件字节和固定截图。[变更记录](CHANGELOG.md)解释修改。历史规则保留在[历史工作流](../workflows/提案工作流_历史_截至20261111.md)，不与当前规则混读。用户后续明确修正时先更新相关规范，再据此开发，不能只改界面或只留在聊天。

## 当前实现与Git边界

规范齐备不代表自动业务编排已经接通。当前独立前端仍在本地临时源目录，正式前端、后端、数据库、付费模型和在线PPT编辑按原暂停范围执行。实际位置见[源码纳管范围](repository-scope.md)。本次首个提交只保护明示的规范、方法快照、截图和治理工具，不能回退尚未纳入Git的源码，也不能恢复过去未提交的开发历史。

Git核查：本轮开始时 main 无提交、无远程、无跟踪文件。本地未形成PR历史；不能据此推断其他目录或账号从未有PR。GitHub目的仓库及授权未确定前，不对外推送。
