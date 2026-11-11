# 视觉开发负责人规范 · 2026-11-10

项目 [visual-development-lead](../../skills/visual-development-lead/SKILL.md)统一参考、草图、精修和整体复核，按需读取包装或主视觉附录。根 AGENTS 已指向此入口。规范采用和实际参考阶段接续见[本轮记录](../../output/qingyu-visual-workflow-20261110/README.md)。当前接入范围是项目 Agent 调用、结构准入检查和青屿只读页面；未接后台自动生成编排，不代表视觉评分通过。以下保留原接入记录。

# Skill、模型与工具索引

当前[青屿包装参考实图](../../output/qingyu-packaging-references-20261110/README.md)仅由本地静态清单和原图片文件展示，getResearchWorkspace/getBriefHistory保持原只读身份保护。图片来自品牌公开资料，两件旧原件与五件新原件的来源分别记录；没有生图、评审、正式参考采用API或收费接入。

最新[青屿视觉布局预览](../../output/qingyu-visual-layout-20261110/README.md)只复用原getResearchWorkspace/getBriefHistory与文案投影，未增加Skill、图片服务、评审服务或业务写接口。图片和评分位置尚无产物；n7/k4/v2保持文案身份，不能冒充正式视觉分支。原4415已实测查看交互，正式业务编排、真实生图与在线PPT编辑继续待接或暂缓。

| 分类 | 实际来源与版本入口 | 当前用途和限制 |
| --- | --- | --- |
| 青屿文案两轮与独立评审展示 | [实际页面和原件](../../output/qingyu-copy-full-20261110/README.md)、[接续边界](../../output/qingyu-copy-full-20261110/FRONTEND-HANDOFF.md) | 本地R1/R2创作、四岗评分及对应对抗、原岗追加复核和独立总监建议；静态封存包供原4415只读展示，未接正式生成编排或客户批准。原研究r6与当前简洁策略保持。 |
| 策略原生三环与文案初稿 | [实际页面与回执](../../output/strategy-rings-copy-20261110/README.md) | 本地strategy.venn图版与三方向只读文案；共用Node形状、文字、引线结构，原Skill停用决定保持。已核真实页面，未接正式编排或实际PPT导出。 |
| 策略负责人基础要求 | [岗位要求](../agents/strategy-owner.md)、[当前指针](../../.scratch/design-strategy-skill-20261109/CURRENT.json) | 用户2026-11-10改为研究、产品、用户交叉推导及三板块呈现；不强制策略Skill、评分表或多轮角色流程。正式业务自动编排尚未接此要求。 |
| 设计策略负责人Skill r3（历史停用） | [新方法](../../.scratch/design-strategy-skill-20261109/r3/design-strategy-lead/SKILL.md)、[方法采用](../../.scratch/design-strategy-skill-20261109/r3/ADOPTION.json)、[青屿应用](../../output/qingyu-strategy-r3-20261110/README.md) | 洞察、品牌作用与方向选择分别审，三角色中性首读后核依据，关键问题由原提问者复核；本轮定位建设与优先验证通过，非消费者实测或正式业务编排接通 |
| 设计策略负责人Skill r2（历史暂停版） | [原版本](../../.scratch/design-strategy-skill-20261109/r2/design-strategy-lead/SKILL.md)、[当前方法指针](../../.scratch/design-strategy-skill-20261109/CURRENT.json)、[退回诊断](../../output/qingyu-strategy-rejection-20261110/README.md) | 用户否定青屿r2质量，旧稿和原审查保留，后续r3也已按最新决定停用；原无阻断回执不证明旧方法可用，未接正式业务编排 |
| 设计策略负责人Skill r1 | [design-strategy-lead](../../.scratch/design-strategy-skill-20261109/candidate/design-strategy-lead/SKILL.md)、[实际应用与页面](../../output/qingyu-strategy-20261109/README.md) | 项目五文件采用，实际用于青屿条件推演并独立审校；两项非包装规划演练仅作方法核对。未全局安装、未接正式策略Agent编排或放行；研究生成身份与策略应用分开 |
| 研究图版与版式工坊Skill r7 | [项目调研Skill](../../.scratch/design-research-skill-v2-20261109/candidate/design-research-lead/SKILL.md)、[双入口采用](../../output/deck-studio-integration-20261109/README.md) | 当前呈现复用离线DeckEngine模板；R4生成仍r6，R2历史价仍r3。研究与整案共享Page结构，不代表全部业务内容或在线编辑已验 |
| 任务驱动设计调研Skill r4 | [design-research-lead](../../.scratch/design-research-skill-v2-20261109/candidate/design-research-lead/SKILL.md)、[八文件采用与实际图版](../../output/qingyu-visual-boards-20261109/README.md) | 项目已按八文件哈希采用图版输出合同，按问题和证据选图，详情展开，图像身份与范围随导出。既有青屿R2仍来自此前r3研究，未伪装为新研究。未全局安装或接正式自动业务编排，规划演练不代表跨任务实际效果已验 |
| 开发方法库 | [mattpocock 固定安装记录](../agents/skills-installation.json)，记录提交 `5beb35b040e3de97e54fa9e386d7e42d15c295c2` | 开发需求、设计、实现和审查的方法；安装不等于每次调用，非产品运行时插件注册表 |
| pstack 开发方法 | 本机 `/Users/marc/.codex/plugins/cache/pstack-claude/pstack/0.9.114/skills/` | 当前开发沿用 poteto 和适用审查方法；没有因本轮整理新增 hooks |
| 项目目录梳理 | 本机 `/Users/marc/.codex/skills/project-foundation/SKILL.md` | 本次明确授权的一轮导航和空间管理，不是新的产品模块 |
| 美学及文案评估参考 | [method-registry](../evaluation/method-registry.json)、[评估方法协议](../workflows/评估方法与裁判协议_v1.md) | 注册表区分方法借鉴与官方模型运行；不能宣称 PosterReward 等官方评分器已经安装执行 |
| 产品角色提示词及 schema | [creative-panel](../../tools/workbench/creative-panel.mjs)、[reference-review](../../tools/workbench/reference-review.mjs)、[complete-content](../../tools/workbench/complete-content.mjs) | 实际运行代码组装 packet 和输出合同，不是自动调用已安装的开发 Skill 文件 |
| 文字服务接口 | [codex-provider](../../tools/workbench/codex-provider.mjs)、[launch-config](../../tools/workbench/launch-config.mjs) | 可替换服务接入保留；真实调用及实际计费暂缓，本轮不执行可用性或鉴权探测 |
| 本地工程服务 | [legacy runtime](../../tools/workbench/local-acceptance-runtime.mjs)、[V2 runtime](../../tools/workbench/local-reference-pool-runtime.mjs) | 固定 synthetic 角色和回执；显式 V2 不混入旧版参考任务，非真实研究或质量验收 |
| 搜索、来源捕获 | [research-acquisition](../../tools/workbench/research-acquisition.mjs)、[source-acquisition](../../tools/workbench/source-acquisition.mjs) | 来源核验和网络限制保留；不因已有接口宣称所有外部平台可用 |
| 图片服务 | [image-api-provider](../../tools/workbench/image-api-provider.mjs)、[atomic store](../../tools/workbench/image-evidence-atomic.mjs) | 可替换图像 API、原件与回执；未配置的真实服务不算通过。图像记录为 generated 不自动证明是真实模型效果 |
| 原生排版与 PPTX 工具 | [资源桥](../../tools/workbench/local-layout-resource-bridge.mjs)、[可编辑导出](../../tools/auto-layout/editable-proposal.mjs) | 依赖本地工具清单、字体及固定源；Office 编辑因激活暂保留待验，原生 Keynote 不在本目标内 |

本机配置入口见 [NORMAL_LAUNCHER](../../NORMAL_LAUNCHER.md) 与 [独立验收 launcher](../../tools/local-acceptance/launch-complete.mjs)。配置记录路径和能力，密钥不进入文档、提案或聊天。费用未知保留未知，真实资金系统暂缓。当前声明和验证范围见 [status/current](../../status/current.md)。

2026-11-09 独立前端的任务卡类型与版本记录合同见[交付记录](../../output/taskcard-content-20261108/review.html)及[架构说明](../architecture/overview.md)。`proposalType` 与 `editScope: 'task_card'`、真实编辑人/编辑时间目前只由本地模拟服务支持；正式接口仍需按同一版本、CAS、重放、原文保留和权限约定接线，不是已联调能力。
