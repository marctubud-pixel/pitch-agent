# 配置与服务边界

规范版本：1.2.1。默认开发只启动本地预览。真实密钥、账户配置及已有数据库保持在本地受控位置，不进入Git。

## 前端

应用配置位置为`apps/workbench-preview/.env.local`，示例见同目录`.env.example`。默认不设置`VITE_WORKBENCH_API_URL`，使用本地演示服务。Vite的`VITE_`变量会进入浏览器，不能存放密钥。

设置完整`VITE_WORKBENCH_API_URL`选择真实简报HTTP适配及同快照提案投影；Brief提取仍使用实际本地解析，助手仍未接通。握手通过后显示本地简报服务；其余阶段不补入Mock产物。启动、修订、原件和单机身份边界见[简报HTTP合同](http-brief.md)。旧[前后端说明](../versioned-api-v1.md)供迁移追溯，不能作为当前全链路通过证明。

## 后端

当前已验入口为根`npm run dev:brief`，显式指定新SQLite与loopback来源，要求Node 24且无供应商配置。下述完整业务入口继续作为历史能力保留，不随本轮简报接线启动。

`tools/workbench`要求Node `>=24.13.0 <25`；parse5依赖由该目录package.json和pnpm-lock.yaml固定，可使用其声明的pnpm版本安装。默认开发命令不自动启动它。

配置读取由`tools/workbench/launch-config.mjs`负责。旧环境入口支持`PORT`、`WORKBENCH_DB`、`WORKBENCH_EXECUTIONS`、`WORKBENCH_MODEL`、`WORKBENCH_IMAGE_CONFIG`及`WORKBENCH_MAX_CONCURRENT_JOBS`。默认端口4181，数据库与执行路径属于运行数据。

新配置以`WORKBENCH_CONFIG`指定JSON，含server、textProviders、bindings及各业务模块配置，具体字段与校验按源码和`launch-config.test.mjs`。它不能混用上述旧入口；供应商密钥通过指定环境变量读取，业务输入不携带密钥。没有真实供应商配置与能力证明时，不写“自动业务可运行”。

本轮不提供伪造的“全链路可运行”配置，也不复用旧run。确需联调时，从空的隔离数据库、明确资源预算、有效配置和当前授权开始，验证失败与未知结果按原协议核账。

## 排版与专项能力

前端Deck导出依赖应用锁文件中的PptxGenJS和fflate，本地可直接验证。后端原生排版另依赖`@oai/artifact-tool`、`@napi-rs/canvas`、字体及Python原生工具，当前部分文件静态引用本机专用路径。它们是明确的移植待办，不属于根`npm run check`的承诺范围。

PDF、原生渲染及字体专项涉及pypdf、pdfplumber、pdfminer.six、Pillow、pypdfium2、LibreOffice、Poppler和Fontconfig，实际需要随选定工具判断；本轮未安装或运行这些旧能力。不得把本机路径统一替换成另一台机器的路径来伪造可移植性。

## 当前七阶段与研究接入

新协议、来源登记、受限研究与原件读取、方法绑定和缺能力时停止的具体范围见[接续说明](seven-stage-research.md)。r7独立读者回环未接入，完整研究交接与生产仍未完成。默认运行不会执行模型。

## PDF原件配置

默认本地服务无需模型配置即可保存当前项目PDF，原件位于SQLite路径旁的.originals/intake受控目录，必须随运行数据保留。当前HTTP只支持12MiB内PDF，不因此启用解析/图像或Office品牌文件；sessionStorage无法保留原请求时发送前拒绝。边界见[PDF原件合同](brief-originals.md)。
