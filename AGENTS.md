# 提案工作台开发约定

## 默认开发方法

用户于 2026-10-21 指定采用 mattpocock/skills 作为后续开发的方法库。技能已安装在 `/Users/marc/.codex/skills/`，版本和完整目录见 `docs/agents/skills-installation.json`。这是固定版本安装，更新需显式执行，不自动跟随上游。

- 先读 `docs/specs/README.md` 中的现行规范，再结合实际实现核实状态；总体范围或历史决定需要追溯时按需读 `多线调研工作台_开发说明_v0.3.md`，已达成的共识沿用，不重复盘问。
- 需求与边界讨论默认使用 `grill-with-docs`（`grilling` + `domain-modeling`），每轮只讨论前置条件已明确的问题，给出建议，保持简洁。事实自行查证，产品取舍由用户决定。
- 跨阶段且不确定性大的规划使用 `wayfinder`；明确的小任务直接推进，无需套完整流程。
- 形成规格使用 `to-spec`，拆分可验收任务使用 `to-tickets`；实现按任务选择 `implement` / `implement-spec`，测试、审查与复盘按需使用 `tdd`、`code-review`、`retro`。调用前读取相应 SKILL.md 及必要引用。
- 持续区分产品业务流程与开发协作方法。模型替换不得改变已确认的业务输入输出、证据追溯与验收约定。
- 保留用户已有的子 agent 协作与独立评审要求；模拟评审不宣称为真实客户批准或真实消费者研究。
- `in-progress` 与 `misc` 下技能虽已安装，但仅在任务适配时使用；安装不意味着启用其 hooks、迁移、外部发布或特定平台配置。
- 用户明确要求按此方法继续开发，常规本地配置沿用以下默认值；不为每项可逆配置反复确认。重大产品决策仍需讨论。

## Agent skills

### Issue tracker

默认使用本地 Markdown：`.scratch/<feature>/`。见 `docs/agents/issue-tracker.md`。已配置Git远程不自动切换任务跟踪平台。

### Triage labels

使用默认五类状态。见 `docs/agents/triage-labels.md`。

### Domain docs

采用单一上下文：根目录 `GLOSSARY.md` 与 `docs/adr/`，有确定内容时再创建。见 `docs/agents/domain.md`。

## Dream Loop 使用提醒

- 当任务涉及游戏、3D 场景或应用的明显视觉升级，并适合通过目标效果图与实际运行截图反复对照改进时，主动简短提醒用户可以调用 `dream-loop`，说明它对当前任务的具体帮助。
- 结合当前项目的引擎、目标设备性能、资产预算和已有工作流判断是否适合；普通功能开发、小修复或单张图片任务无需提醒。提醒本身不自动启动完整迭代流程。

## 项目导航维护

- 恢复开发时，从 `README.md`、`status/current.md` 定位当前原生记录，再按任务读取相关实现。
- 模块职责、接口或资源引用改变时，定点更新 `docs/architecture/overview.md` 及对应索引。
- 节点整理或清理时读取 `docs/storage-retention.md`；活跃路径与证据保持原位，状态摘要不能替代实际回执。

## 视觉开发规范

- 执行或接续视觉开发时，先读取 [视觉开发负责人 Skill](skills/visual-development-lead/SKILL.md)，按任务类型加载附录，保存实际规范版本、输入、授权终点和阶段记录。视觉负责人组织创作，独立评分、对抗和裁定保持分离。
- 本项目视觉修改常规最多三次，达标可提前结束，超限暂停；旧额外三次专项不默认启用。只有当前阶段实际通过且下一步在授权范围内才能推进。

## 提案工作流与页面一致性

- 创建或接续任何 Brief、调整阶段职责或制作阶段页面前，读取[现行工作流](docs/workflows/提案工作流_现行规则.md)的最新规则，按阶段加载既有方法和版式。比稿 Agent 逐阶段检查内容衔接，并在排版前完成简短后台检查；前台使用七阶段，不再设独立内容审阅页面或负责人，保留排版后终审。具体方法见[比稿负责人智能体](docs/agents/proposal-director.md)，人类比稿负责人的决定权单独保留。
- 每轮页面完成或修改后调用 `ui-review` 检查实际界面，修正信息层级、重复内容、交互及跨板块视觉差异。业务评审和 UI 审核分别记录实际范围。

## 规范基线与版本

- 开始制作或修改阶段、页面、Agent方法时，先读 [规范入口](docs/specs/README.md) 和对应注册项，按岗位／页面加载固定方法，避免整段历史规则进入当前执行上下文。
- 派发业务或开发任务时读取[Agent组织与责任](docs/agents/README.md)；页面开发同时读取[页面责任与基线索引](docs/pages/README.md)。比稿Agent统筹业务，开发统筹组织实现，工作台UI负责人维护跨页基线，独立UI审核者复验。终审使用[排版后终审协议](docs/specs/final-review.md)。
- 当前规范路径与版本由 `docs/specs/registry.json` 指定，文件锁为 `docs/specs/spec-lock.json`。变更同步更新对应版本和 `docs/specs/CHANGELOG.md`，运行 `python3 scripts/check-specs.py`；跨提交检查可加 `--base <提交>`。历史原文只用于追溯。
- 项目调研Skill固定在 `skills/design-research-lead/SKILL.md`；页面UI审核固定在 `skills/ui-review/SKILL.md`。这些本地方法快照不自动证明生产运行时已经接入，也不改旧产物生成身份。
- Git只按明确纳管清单暂存；规范提交不能冒称源码全量备份。目的仓库、公开范围及远程PR均按实际授权与回执记录。

## 当前仓库开发入口

- 当前应用默认修改 `apps/workbench-preview`，先读[工程入口](docs/development/README.md)和[模块约定](apps/workbench-preview/AGENTS.md)。较早正式 `apps/proposal-workbench`及原scratch活跃源保持身份，不互相覆盖。
- 业务工具按[tools边界](tools/AGENTS.md)，不因源码纳管启动旧run、付费模型、原生PPT或在线编辑。根 `npm run check`只验证明示范围，已知旧测试失败见[问题索引](status/issues/README.md)。
- 纳管与暂存按 `scripts/repository-files.json`，变更原件或导入适配时同步来源与版本记录。后续PR和回退按[提交约定](CONTRIBUTING.md)，运行数据仍按存储保留合同处理。
