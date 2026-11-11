# 提案工作台 · Pitch Agent

中文桌面提案应用，从简报、研究、策略、文案与主题、视觉开发到版式和终审交付。当前七阶段预览及青屿23页案例可运行，真实模型编排、正式多人账号和部分业务服务仍待接通。

## 快速开始

要求Node 24.13.0和Python 3.11或更新版本。

```sh
git clone git@github.com:marctubud-pixel/pitch-agent.git
cd pitch-agent
npm run setup:frontend
npm run dev
```

打开 http://127.0.0.1:4420/ 。默认本地演示不需要密钥或业务后端。青屿终审位于 `#/p/qingyu/proposal/delivery`。完整操作见[使用说明](docs/usage/README.md)。

本地简报真实读写已接通：按[HTTP启动与范围](docs/development/http-brief.md)运行`npm run dev:brief`和`npm run dev:http`，使用独立SQLite；后续生产阶段仍待接线。

## 开发与协作

- [开发入口](docs/development/README.md)：安装、启动、目录和验证命令。
- [应用与Agent架构](docs/architecture/runtime.md)：前端、服务、存储、编排、原生工具及实际接线。
- [Agent组织与职责](docs/agents/README.md)：业务与开发统筹、各岗位MD、执行与独立评审。
- [页面责任与基线](docs/pages/README.md)：逐页负责人、保留版式、实际路由与空态。
- [规范基线](docs/specs/README.md)：固定方法、版本锁、交接和[终审协议](docs/specs/final-review.md)。
- [提交约定](CONTRIBUTING.md)与[PR和回退](docs/development/git-and-recovery.md)：分支、检查、评审和版本恢复。
- [当前状态](status/current.md)与[明确待办](status/issues/README.md)：已验范围、失败与下一步。

## 检查

```sh
npm run check
```

包括规范及隔离反例、仓库与证据身份、前端类型及测试、明示核心域测试和构建。[测试说明](docs/development/testing.md)另列已知旧后端失败、实际UI和原生PPT未验范围。CI文件已配置，远程运行结果与保护设置须按实际GitHub回执确认。

## 源码和数据

当前开发入口是 `apps/workbench-preview`，由原活跃scratch前端按字节导入。较早的 `apps/proposal-workbench`、三组tools源码、测试、必要夹具和既有文档分别保留。详见[纳管边界](docs/specs/repository-scope.md)、[源码与资源](docs/development/resources.md)。

数据库、原业务run、失败原件、外部PDF和完整交付池保持本地原位，不整体上传。Git保护明示纳管的源码和文档，不能恢复未纳管运行数据或重建此前未提交历史。研究参照、品牌图片、生成试稿及第三方代码保留各自来源和权利，未新授予统一开源许可。
