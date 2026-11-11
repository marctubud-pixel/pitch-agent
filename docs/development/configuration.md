# 配置与服务边界

规范版本：1.0.0。默认开发只启动本地预览。真实密钥、账户配置及已有数据库保持在本地受控位置，不进入Git。

## 前端

应用配置位置为`apps/workbench-preview/.env.local`，示例见同目录`.env.example`。默认不设置`VITE_WORKBENCH_API_URL`，使用本地演示服务。Vite的`VITE_`变量会进入浏览器，不能存放密钥。

设置`VITE_WORKBENCH_API_URL`只切换现有workbench、intake、assistant HTTP适配，提案阶段仍是Mock。实际接口定义见`src/domain`、`src/services/http`及原有[前后端说明](../versioned-api-v1.md)，接口存在不等于已联调通过。

## 后端

`tools/workbench`要求Node `>=24.13.0 <25`；parse5依赖由该目录package.json和pnpm-lock.yaml固定，可使用其声明的pnpm版本安装。默认开发命令不自动启动它。

配置读取由`tools/workbench/launch-config.mjs`负责。旧环境入口支持`PORT`、`WORKBENCH_DB`、`WORKBENCH_EXECUTIONS`、`WORKBENCH_MODEL`、`WORKBENCH_IMAGE_CONFIG`及`WORKBENCH_MAX_CONCURRENT_JOBS`。默认端口4181，数据库与执行路径属于运行数据。

新配置以`WORKBENCH_CONFIG`指定JSON，含server、textProviders、bindings及各业务模块配置，具体字段与校验按源码和`launch-config.test.mjs`。它不能混用上述旧入口；供应商密钥通过指定环境变量读取，业务输入不携带密钥。没有真实供应商配置与能力证明时，不写“自动业务可运行”。

本轮不提供伪造的“全链路可运行”配置，也不复用旧run。确需联调时，从空的隔离数据库、明确资源预算、有效配置和当前授权开始，验证失败与未知结果按原协议核账。

## 排版与专项能力

前端Deck导出依赖应用锁文件中的PptxGenJS和fflate，本地可直接验证。后端原生排版另依赖`@oai/artifact-tool`、`@napi-rs/canvas`、字体及Python原生工具，当前部分文件静态引用本机专用路径。它们是明确的移植待办，不属于根`npm run check`的承诺范围。

PDF、原生渲染及字体专项涉及pypdf、pdfplumber、pdfminer.six、Pillow、pypdfium2、LibreOffice、Poppler和Fontconfig，实际需要随选定工具判断；本轮未安装或运行这些旧能力。不得把本机路径统一替换成另一台机器的路径来伪造可移植性。
