# 页面基线与责任索引

规范版本：1.1.1。16份页面规格含15个当前页面条目和1个退役条目。当前条目不表示该页完整交互已经定稿或正式接通。

全部当前页面由[工作台UI负责人](../agents/workbench-ui-owner.md)维护外观与交互一致性，由开发统筹派发实现，修改后按[UI审核岗位](../agents/ui-review-owner.md)核真实界面。下表列业务内容责任人；内容责任不等于该岗位兼做前端开发。

| 页面与规格 | 业务内容责任 | 保留的页面基线 | 明确边界 |
| --- | --- | --- | --- |
| [首页](home.md) | 比稿Agent提供项目状态，UI负责人维护展示 | 蓝色文件夹、雾灰白列表、纸卡层次与错落标签、只显示日期 | 项目示例不能作真实进度 |
| [新建提案](new.md) | 简报负责人 | 输入或上传Brief、核单份任务卡、品牌资料与汇报时间 | 上传不表示模型已读取 |
| [项目概览](overview.md) | 比稿Agent | 五区域、七阶段、实际摘要与当前处理对象 | 进度显示不代表正式完成 |
| [简报与任务](brief.md) | 简报负责人 | 六主字段、单份任务卡、当前卡内修改、右侧版本与想法 | 确认与更新、冲突和历史只读分别表达 |
| [研究](research.md) | 调研负责人 | 四维主干及研究结论、结论与图版先行、细节展开、单一整报告下载 | r7方法；待补不由页面放行 |
| [策略](strategy.md) | 策略负责人 | 三板块、两三页、三环与右侧结论、沿用研究图版 | 简洁要求，不恢复复杂Skill |
| [文案与主题](themes.md) | 文案负责人 | 三实质方向、主副文与推导、详细原评和异议展开 | 推荐和人类选定分开 |
| [视觉开发](visual.md) | 视觉负责人 | 大图与右评审、参考扇面、草图文件夹、样机位置、版本对照 | 固定Skill，试稿和正式阶段分开 |
| [版式](layout.md) | 排版负责人 | 整案阅读、同版Deck预览和原生导出、既有版式 | 23页是案例，不是强制页数 |
| [终审与交付](delivery.md) | 终审负责人，由比稿Agent组织 | 先成稿、再问题与范围、最后交付，详细依据和比较展开 | 演练审读、正式终审、人类批准分开 |
| [资料库](library.md) | 简报负责人核材料用途 | 原件、来源与读取采用状态可追溯 | 完整专项交互待定 |
| [流程与历史](history.md) | 比稿Agent | 当前状态与原生版本、历史原文分别展示 | 完整专项交互待定 |
| [协作与通知](team.md) | 比稿Agent协调，真实权限由人类及服务合同决定 | 右上人类在线、五种人类角色、AI岗位分开 | 游客只读，正式账号与通知仍待接 |
| [交付中心](delivery_center.md) | 终审负责人 | 实际交付对象及范围、版本和真实完成状态 | 完整专项交互待定 |
| [助手](assistant.md) | 比稿Agent | 沿用有效任务和阶段，不凭摘要编造状态 | 完整专项交互待定 |
| [旧内容审阅](content_review.md) | 退役，历史记录只读 | 原意见与回执保持原身份 | 无新负责人，不是第八阶段 |

每页具体字段、动作、空态、异常和验收按链接规格执行，共同外观按[UI基线](../specs/ui-system.md)。该索引供导航；具体要求只在对应规格维护。

## 基线的证据与接线

[截图清单](../specs/screenshot-provenance.json)绑定16张历史留档。截图用于回看已认可布局，不代替当前运行、业务通过或完整交互合同。后续实际界面可能已有修订，须从状态与本轮原生回执查证。

仓库当前开发入口为 `apps/workbench-preview`；原活跃预览 `.scratch/frontend-ui-optimization-20261108/source/proposal-workbench` 与旧4417保留原位，另与 `apps/proposal-workbench` 的较早正式对接源分开。七阶段导航、案例展示和本地模拟不证明岗位真实调度已接通。跨页统一负责人是本轮明确的开发职责，自动巡检服务尚未实现。

## 规格ID与实际入口

以下相对源码路径以 `apps/workbench-preview` 为根，来自2026-11-11实际源码核查。规格ID不是新增路由指令。

| 规格ID | 当前入口 | 主要组件 |
| --- | --- | --- |
| home | `#/`，路由名为dashboard | `src/views/HomeView.tsx` |
| new | `#/new` | `src/views/NewProjectView.tsx` |
| overview | `#/p/<项目>` | `src/views/project/OverviewArea.tsx` |
| brief、research、strategy、themes、visual、layout、delivery | `#/p/<项目>/proposal/<阶段>` | `src/views/project/ProposalArea.tsx`及`src/views/stages/*Stage.tsx` |
| library | `#/p/<项目>/library` | `src/views/project/LibraryArea.tsx` |
| history | `#/p/<项目>/process` | `src/views/project/ProcessArea.tsx` |
| delivery_center | `#/p/<项目>/delivery`，与生产阶段delivery不同 | `src/views/project/DeliveryArea.tsx` |
| team | 跨页右上工具，没有独立team路由 | `src/collaboration/TeamTools.tsx` |
| assistant | 跨页助手，没有独立assistant路由 | `src/workbot/WorkBot.tsx` |
| content_review | 旧生产阶段URL替换至layout，原意见只读 | `src/views/ProjectWorkspace.tsx`的阶段路由解析及历史读取 |

路由合同从 `src/app/router.tsx` 定位。青屿layout与delivery复用 `src/proposal/qingyu-layout/QingyuLayoutPreview.tsx`，本地终审摘要在 `src/proposal/qingyu-final-review`，它们不写正式阶段通过。

`src/services/index.ts`默认使用MockProposalService；配置HTTP地址后使用HttpWorkbenchService与HttpProposalService读取真实同快照，研究原件通过WorkbenchService独立读取，未接阶段保持空态。HTTP助手仍为显式不可用占位，默认演示助手为Mock；旧助手后端已有实现，尚未迁入此入口。四辅助页已有组件和局部动作，专项未定稿不等于没有实现。跨页UI负责人是维护职责，无需因本次对账另建常驻巡检服务。实际复用和接线差异见[六线对账](../development/capability-reconciliation-20261111.md)。
