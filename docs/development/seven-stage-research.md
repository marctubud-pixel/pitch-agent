# 七阶段与研究入口接续

规范版本：1.0.1。使用当前开发应用，保持默认演示及旧预览。业务判断见[七阶段运行合同](../specs/seven-stage-runtime.md)，旧成果与接线差异见[六线对账](capability-reconciliation-20261111.md)。

## 默认运行

沿用两个终端`npm run dev:brief`和`npm run dev:http`。新项目自动登记七阶段协议，当前任务确认后可读取研究工作区、登记本版来源和查看真实研究记录；旧项目不会自动升级。默认研究执行关闭，界面显示原因，生成按钮禁用。来源原文可落库，但仍未独立核实；没有研究产物不画示例图补全。

来源、研究请求、核验、交接等提交沿用未决记录。记录以接口和本地角色隔离，按path/body重建稳定kind与权限；保留旧简报会话记录兼容。刷新后核对同一原始命令，身份在整个核对过程中锁定；错版返回冲突，原请求保留。

## 实际接口

API根仍为`/api/v1`。受限服务增加本版来源登记、研究工作流、原生正文读取、研究请求／证据核验／充分性检查及交接／放行入口。JSON字段白名单、Host、Origin和body上限保持。正文返回artifactId、contentHash、content及contentText，前端按实际原文字节核SHA和对象一致性。

HTTP原件、论点、来源、核验和交接投影从旧正式前端定向迁移。声明不生成接受记录；已有研究但没有当前报告、核验或接收时保留待核。未分类证据保留在原文并提示缺口，不猜用途。策略续接始终拒绝，不使用旧复杂策略合同。

## 执行配置边界

默认没有执行器。程序化researchOptions或CLI显式研究配置可加载既有供应商与独立评审设置；启用执行需同时提供同一隔离数据库的配置和`--research-execution enabled`。配置入口为`--research-config PATH`，未启用时只作读取，不执行模型。配置中的独立semantic角色使用既有原生配置租约，不自动改现存不同配置。

这套入口只执行本次请求指定研究任务，不恢复旧job，不自动重试未知结果，不接旧完整server的调度循环。命令示例不替代真实运行授权与预算；本轮使用新临时SQLite及合成provider验证合同，没有实际计费调用。

r7独立读者方法、三任务理解测试和青屿修订后回读已有成果；当前缺少新协议的同版读者执行/报告与复核判定，正向交接及正式放行仍拒绝。来源、生成、核验与原件读取可单独验收，完整“Brief→研究→研究交接”仍未接完。下一项复用旧intake/采集模块，接品牌原文件与同版读者报告，不重做研究Skill或旧报告。本地工程接线可用明确测试配置在新隔离项目验证，真实模型质量和费用另按授权处理，不补成功记录。

## 验证与Git

本轮首先创建[简报PR #1](https://github.com/marctubud-pixel/pitch-agent/pull/1)，其specifications和application两项远程CI均success，正常合并为`4aaf32163b76026b88b0d44747523817399d5b09`。七阶段与研究工程随后经[PR #2](https://github.com/marctubud-pixel/pitch-agent/pull/2)两项CI成功合并为`df719104205662812b28b3ad3a91af52d14860d1`。本地原生checks和merge回执保存在`.scratch/seven-stage-research-20261111/PUBLISH-RECEIPT.json`；保护设置未由此证明。

本轮专用命令`npm run test:research-contract`验证新旧协议、方法实际字节、回执调用、默认拒绝、来源重放和合成生成。前端HTTP回归核原件SHA、投影、旧稿失效、角色与恢复；实际UI按项目固定ui-review另留证。核心域、既有工程与新变更分别验证，不将合成研究作为真实市场结论。

本轮实际范围与证据见[核验记录](seven-stage-verification-20261111.md)。
