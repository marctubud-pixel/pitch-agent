# Git纳管范围与当前源码位置

本轮核查起点：main 无提交、无remote、无跟踪文件。原文件留在磁盘不等于已有版本控制。

| 对象 | 当前实际位置 | 本次处理 |
| --- | --- | --- |
| 规范 | docs/agents、docs/pages、docs/specs、现行工作流 | 选定文件形成首个可回退规范基线 |
| 方法 | skills/design-research-lead、skills/visual-development-lead、skills/ui-review | 原字节和源版本保留，引用固定路径，方法来源清单随Git纳管 |
| 页面视觉依据 | docs/specs/screenshots | 16张既有截图字节复制，来源和SHA随Git保存；不把截图当完整实现证明 |
| 当前独立前端 | .scratch/frontend-ui-optimization-20261108/source/proposal-workbench | 保持原位。本次不迁移、不把临时根整体加入Git；代码还不能靠本次规范提交回退 |
| 原apps工程 | apps/proposal-workbench | 是另一份交接源，不冒充当前预览；正式对接待继续 |
| 后端／工具 | tools/workbench、tools/auto-layout、tools/local-acceptance | 原位保留，后续按可复现源码与依赖边界独立纳管 |
| 业务库、失败原件、生成素材 | .data、.scratch、.audit、output及外部用户PDF | 原位保留；不放首批GitHub，不做删除或清理 |

首批准备范围由 `scripts/spec-upload-files.json` 明确列出，实际提交只按该清单暂存。`.gitignore` 是日常防误纳入；它不会删除磁盘文件，也不代替逐项暂存审阅。

## 后续源码PR应完成什么

从当前实际源冻结输入和SHA，核清 public 资源、模板、依赖许可证及最小夹具，确定长期应用目录。先在独立目录复现安装、构建和运行，再切入口；不得用旧apps源覆盖当前成果。源码、测试、必要配置进Git，依赖和可再生成产物排除，客户证据按权限另存。该PR的验收需含真实启动和所改功能，不把本次文档检查作为代码验收。

本轮可交付“规范可回退、来源可追踪、后续变更可检查”。全项目源码备份、远程分支保护和真实PR仍需分别落地，不能合并成一句“已经上GitHub”。
