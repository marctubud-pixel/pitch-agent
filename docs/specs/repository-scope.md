# Git纳管范围与源码位置

规范版本：1.1.0。本轮用户明确授权补齐应用与Agent工程、源码用法、PR及回退基础并推送到既有GitHub origin。最初无提交、之后仅规范纳管的状态保留为历史；当前范围以下表和明示清单为准。

| 对象 | 仓库位置 | 当前边界 |
| --- | --- | --- |
| 当前应用 | apps/workbench-preview | 从活跃scratch导入源码、测试、必要public及证据映射，后续开发从这里继续 |
| 较早正式前端 | apps/proposal-workbench | 保留旧对接源码，不覆盖当前应用，也不自动恢复正式联调 |
| 业务与工具源码 | tools/workbench、tools/auto-layout、tools/local-acceptance | 源码、测试、合同、必要夹具及vendor保留；本机专用能力明确未移植 |
| 规范与方法 | docs、skills及AGENTS | 现行岗位、页面、固定Skill、工程用法和历史依据分别导航 |
| 原活跃前端 | .scratch/frontend-ui-optimization-20261108/source/proposal-workbench | 原位保留，旧4417不因导入而切换；来源SHA写入source-import.json |
| 原业务状态及交付 | .data、.scratch、.audit、output及外部用户PDF | 原位保留，不整体上传，不清理或重开旧run |
| 依赖和构建 | node_modules、dist、Python缓存 | 可再生成，不纳入新版本 |

完整纳管范围由 `scripts/repository-files.json` 明确列出；规范检查所需便携子集仍由 `scripts/spec-upload-files.json`指定。暂存按明示清单进行，不使用 `git add .`。

后续安装、运行、结构和回退从[开发入口](../development/README.md)进入。导入文件与适配身份见[资源说明](../development/resources.md)，仓库检查不访问被忽略的本机scratch。

origin为 `git@github.com:marctubud-pixel/pitch-agent.git`。本轮已读取远程main，起点为723453920356749ac97e41d11df3966a4b119164的初始化提交；本地已有规范提交且保留其祖先历史。本轮提交和推送结果以实际Git回执记录，不以此文档预先宣称成功。

这次可以保护明示源码和文档，不能补出过去未提交的过程历史或恢复未纳管数据库。远程CI、分支保护、可见性与审批规则分别核验，不合并成一句“已经全部上线”。
