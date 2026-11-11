# 开发、运行与使用

规范版本：1.2.0。此目录是应用工程入口。业务方法和页面要求仍以[规范基线](../specs/README.md)为准，Agent分工见[岗位组织](../agents/README.md)。

## 本地启动

要求Node 24.13.0及Python 3.11或更新版本。Node版本由根`.node-version`固定；Python默认检查仅用标准库。npm依赖以应用的package-lock.json锁定，默认安装禁用依赖安装脚本；该方式已在独立检出验证。

```sh
git clone git@github.com:marctubud-pixel/pitch-agent.git
cd pitch-agent
npm run setup:frontend
npm run dev
```

打开 `http://127.0.0.1:4420/`。青屿终审入口为 `http://127.0.0.1:4420/#/p/qingyu/proposal/delivery`。这会启动当前中文桌面预览，默认使用浏览器本地模拟服务，不需要模型密钥，也不启动业务后端。

## 连接本地简报服务

新建、读取、保存与确认已接入独立SQLite服务。按[简报HTTP合同](http-brief.md)在两个终端运行`npm run dev:brief`和`npm run dev:http`。这条入口只处理简报，不启动模型或后续阶段，默认演示入口保持。

## 日常验证

```sh
npm run check
```

命令包含规范及隔离反例、Git与清单对账及原件身份、前端类型与测试、明示核心和域测试、依赖恶意输入回归、前端构建。实际UI操作、原生PPT和业务放行单独验收，详见[验证范围](testing.md)。

## 目录与入口

| 位置 | 职责 |
| --- | --- |
| `apps/workbench-preview` | 当前七阶段应用及案例预览的后续开发入口 |
| `apps/proposal-workbench` | 较早正式对接源码，保留历史边界，不覆盖当前预览 |
| `tools/workbench` | Node业务域、版本存储、任务编排、HTTP及供应商边界 |
| `tools/auto-layout` | 原生排版、图表与交付核验；本机运行库移植仍待做 |
| `tools/local-acceptance` | 既有本地联调、编辑与恢复测试工具，按授权单独使用 |
| `docs/specs`、`docs/agents`、`docs/pages` | 有效规范、岗位和页面合同 |
| `docs/usage` | 使用者操作说明 |
| `status/issues` | 可随Git和PR审阅的明确待办 |
| `scripts/repository-files.json` | 本轮明示源码与文档纳管清单 |

`.scratch`、`.data`、`output`和旧预览继续原位保留，未整体上传。新应用来自活跃源的字节导入，来源、适配及测试原件见[源码与资源](resources.md)。规范提交、源码提交和运行数据恢复范围分别记录。

继续阅读[运行架构](../architecture/runtime.md)、[配置与服务边界](configuration.md)、[提交与回退](git-and-recovery.md)。后续改进见[已知问题](../../status/issues/README.md)。

本轮已修与真实生产能力缺口见[后续调整顺序](remaining-work.md)。不要将域测试转绿当作真实七阶段生产链完成。
