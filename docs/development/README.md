# 开发、运行与使用

规范版本：1.6.0。此目录是应用工程入口。业务方法和页面要求仍以[规范基线](../specs/README.md)为准，Agent分工见[岗位组织](../agents/README.md)。

## 本地启动

要求Node 24.13.0及Python 3.11或更新版本。Node版本由根`.node-version`固定；Python默认检查仅用标准库。npm依赖以应用的package-lock.json锁定，默认安装禁用依赖安装脚本；该方式已在独立检出验证。业务工具依赖另由tools/workbench的pnpm-lock.yaml固定，`setup:workbench`使用声明的pnpm 11.25.0安装，不启动业务。

```sh
git clone git@github.com:marctubud-pixel/pitch-agent.git
cd pitch-agent
npm run setup:frontend
npm run setup:workbench
npm run dev
```

打开 `http://127.0.0.1:4420/`。青屿终审入口为 `http://127.0.0.1:4420/#/p/qingyu/proposal/delivery`。这会启动当前中文桌面预览，默认使用浏览器本地模拟服务，不需要模型密钥，也不启动业务后端。

## 连接本地简报服务

新建、读取、保存与确认已接入独立SQLite服务。按[简报HTTP合同](http-brief.md)在两个终端运行`npm run dev:brief`和`npm run dev:http`；当前还可登记来源、读取研究原件及检查。默认不启动模型，显式研究配置可启用指定研究任务，策略及后续生产未开放，详见[研究接续](seven-stage-research.md)。默认演示入口保持。

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

既有成果、当前接线及方法差异先查[六线能力对账](capability-reconciliation-20261111.md)，再按[后续调整顺序](remaining-work.md)迁移。旧实现和原范围通过证据应沿用，不把当前页面未接说成尚未实现；也不将域测试转绿当作真实七阶段生产链完成。

## 当前七阶段与研究接入

新协议、来源登记、受限研究与原件读取、方法绑定和缺能力时停止的具体范围见[接续说明](seven-stage-research.md)。当前已接同版独立正文阅读、实际修订复查与研究声明/放行，详见[读者合同](research-reader.md)。自动采集已按[受限运行合同](research-acquisition.md)接线，后续生产仍未完成；默认不执行模型。

## PDF原件输入

沿用当前两个开发命令，新建已可保存和下载PDF品牌原件；按实际能力限制格式/大小，默认不执行解析或模型；显式本地解析另见[解析合同](brief-extraction.md)。合同与真实UI证据见[PDF原件保存](brief-originals.md)。旧intake复用已接此子路径，研究读者已接；采集按[运行合同](research-acquisition.md)接线，后续生产继续目标工作包。


## 研究独立读者工作包

当前r7预登记、独立正文阅读、typed修订、逐项处理、独立复查、原件核对及研究交接见[运行合同](research-reader.md)和[实际核验](research-reader-verification-20261111.md)。本轮复用既有执行器与SQLite；默认关闭模型，后续策略仍按新合同接入，不解封旧复杂策略。完整七阶段目标继续推进，PDF解析按独立合同接入，采集不因读者通过完成。
