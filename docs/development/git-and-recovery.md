# Git、PR与版本恢复

规范版本：1.0.6。origin为 `git@github.com:marctubud-pixel/pitch-agent.git`。可见性与远程保护设置按实际GitHub状态判断，不能由本地配置推断。

## 日常PR

```sh
git switch main
git pull --ff-only
git switch -c codex/任务简称
npm run check
```

完成可审改动后按明示清单暂存，读最终差异，提交并推送当前分支；在GitHub以main为目标创建PR。并行写入使用独立worktree，不能在共享工作区切换分支充当隔离。

PR说明按模板记录问题与结果、规范影响、实际验证和回退范围。需要的检查包括Specification baseline与Application baseline，以及适用的独立规格、代码、UI或业务评审。CODEOWNERS指定人类审阅责任，Agent岗位由组织文档定义。

CI文件、CODEOWNERS和模板进入仓库不等于分支保护已开启。是否强制检查、审批数及绕过权限属于GitHub仓库设置，须另核实际回执。首次工程导入保留已有初始化及规范历史，使用普通快进更新，不改写远程历史。

## 查看旧版

```sh
git log --oneline --decorate
git worktree add --detach /tmp/pitch-agent-checkpoint 提交SHA
```

使用新的独立目录查看旧版，保留当前未提交成果。依赖按该版锁文件恢复；历史业务数据、外部供应商效果和浏览器存储不随Git自动回退。

## 撤回已合并改动

从当前main建修复分支，通过`git revert 提交SHA`生成新提交，运行受影响检查后发PR。合并提交需要明确主线，不直接套用单提交命令。多人共享历史不使用强推、硬重置或清理删除用户文件。

规范改动按[变更规则](../specs/change-control.md)更新版本和锁。源码身份与原评绑定变化须重新核适用范围；回退源码不能让已经失效的业务批准重新生效。

## 运行数据恢复

SQLite主文件、WAL和SHM按同一数据库处理，使用既有恢复协议、原生回执和隔离验证。不要复制活跃数据库充当Git备份。当前运行数据与完整历史产物没有纳入Git；恢复边界见[存储保留](../storage-retention.md)。

## 已核PR回执

2026-11-11简报[PR #1](https://github.com/marctubud-pixel/pitch-agent/pull/1)的application与specifications两项远程检查成功，已正常合并为4aaf32163b76026b88b0d44747523817399d5b09。

七阶段与受限研究[PR #2](https://github.com/marctubud-pixel/pitch-agent/pull/2)的同两项检查均completed/success，head为d0298f0dfdc06af60ea0a95f9b32c6865e655644，正常合并为df719104205662812b28b3ad3a91af52d14860d1。原生回执在`.scratch/seven-stage-research-20261111/pr2-checks-before-merge.json`、`pr2-merge-receipt.json`及`PUBLISH-RECEIPT.json`，本次对账只读复核这些已保存原件，没有重新远程核设置。上述结果不证明保护、审批、可见性和协作者权限；后续PR也分别核验。

PDF原件[PR #4](https://github.com/marctubud-pixel/pitch-agent/pull/4)准确head双CI成功，合并44c495b14677cc8e16b77957fe060a483a4d3f84。研究读者与同版交接[PR #5](https://github.com/marctubud-pixel/pitch-agent/pull/5)在head cac8e589ea3505dab80f7ba78b5dd31ff16e6c90的application/specifications均completed/success，正常合并97f13ab562b231f689afb9536e658a2cd3c2558c。原回执分别在本地目标目录的ORIGINALS-CI/MERGE与READER-CI/MERGE.json；它们不证明整案闭环或远程保护设置。

文案[PR #9](https://github.com/marctubud-pixel/pitch-agent/pull/9)准确b5687cf3双CI与实际步骤成功，合并68b6302c；[文案核验](simple-copy-verification-20261112.md)保留原失败与独立复核。图片读取[PR #10](https://github.com/marctubud-pixel/pitch-agent/pull/10)准确80858680双CI和实际步骤成功，合并a5c6ee5b，五件最终回执/审查随[读取证据](evidence/image-readback-20261112/EVIDENCE-SOURCES.json)保存。后续发现的衔接重放问题另用新工作包修复，不改写PR #9当时的通过范围。

PR #11最终1c5c1091的specifications/application和全部实际安装、前端、后端、图片/视觉及构建步骤成功，已合并c434676f。准确[CI](evidence/visual-workflow-20261112/pr11-final-ci.json)、[实际job步骤](evidence/visual-workflow-20261112/pr11-final-job.json)和[合并](evidence/visual-workflow-20261112/pr11-merge.json)分别保留；本地新上下文时钟与可选store文件身份正在后续分支，不冒称已在main。


PR #12准确head f7400be0已通过specifications/application；实际安装、前端、完整便携后端、图片/视觉及构建步骤全部success，无必需skip。合并main为ecf6b47f，原回执在[CI](evidence/visual-workflow-20261112/pr12-final-ci.json)、[实际步骤](evidence/visual-workflow-20261112/pr12-final-job.json)及[合并](evidence/visual-workflow-20261112/pr12-merge.json)。本轮新分支`codex/visual-final-deck-20261112`继续B与Deck，尚未由PR #12的绿灯覆盖。
