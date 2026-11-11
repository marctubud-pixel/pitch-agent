# Git、PR与版本恢复

规范版本：1.0.2。origin为 `git@github.com:marctubud-pixel/pitch-agent.git`。可见性与远程保护设置按实际GitHub状态判断，不能由本地配置推断。

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
