# 开发与提交

先读[开发入口](docs/development/README.md)、[规范基线](docs/specs/README.md)及[Agent组织](docs/agents/README.md)。从`main`建立`codex/<任务>`分支，每个PR解决一个明确问题。

1. 在任务记录写清输入、范围、验收及不涉及的暂停能力。业务方法或页面有变化时先定位现行注册项。
2. 在`apps/workbench-preview`开发当前中文桌面应用。旧`apps/proposal-workbench`保留接入历史，不覆盖；后端源码按各模块边界修改。
3. 执行`npm run check`，补本次实际操作或产物证据。页面改动必须按项目固定UI Skill核真实界面；独立代码及规格复核分别留证。
4. 规范变化更新注册版本、CHANGELOG和锁。文件纳管使用明示清单，新增文件同步`repository-files.json`；原件字节或导入适配变化同步其身份清单。
5. 按PR模板说明问题、结果、规范影响、实际验证、已知失败和回退办法。评审后合并，不能用绿色CI替代业务或人类批准。

当前任务跟踪仍使用本地Markdown；需要跨机器协作的正式问题放`status/issues`，通过Git和PR审阅。GitHub Issues启用后可引用其编号，避免同时维护两套未关联待办。

只暂存核过的清单文件，提交前读`git diff --cached`和`git diff --cached --check`。推送到用户授权的origin，保留远程历史，使用常规快进或PR合并。

版本回退见[Git与恢复](docs/development/git-and-recovery.md)。应用代码、运行数据和供应商外部效果各自恢复；Git不能恢复未纳入版本控制的数据库与旧业务回执。
