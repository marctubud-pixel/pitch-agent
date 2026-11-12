# 配置与服务边界

规范版本：1.8.0。默认开发只启动本地预览。真实密钥、账户配置及已有数据库保持在本地受控位置，不进入Git。

## 前端

应用配置位置为`apps/workbench-preview/.env.local`，示例见同目录`.env.example`。默认不设置`VITE_WORKBENCH_API_URL`，使用本地演示服务。Vite的`VITE_`变量会进入浏览器，不能存放密钥。

设置完整`VITE_WORKBENCH_API_URL`选择真实简报HTTP适配及同快照提案投影；Brief提取仍使用实际本地解析，助手仍未接通。握手通过后显示本地简报服务；其余阶段不补入Mock产物。启动、修订、原件和单机身份边界见[简报HTTP合同](http-brief.md)。旧[前后端说明](../versioned-api-v1.md)供迁移追溯，不能作为当前全链路通过证明。

## 后端

当前已验入口为根`npm run dev:brief`，显式指定新SQLite与loopback来源，要求Node 24且无供应商配置。下述完整业务入口继续作为历史能力保留，不随本轮简报接线启动。

`tools/workbench`要求Node `>=24.13.0 <25`；parse5依赖由该目录package.json和pnpm-lock.yaml固定。根`npm run setup:workbench`使用pnpm 11.25.0、冻结锁及禁用安装脚本安装；Application CI显式执行此命令。安装不启动服务或采集。

配置读取由`tools/workbench/launch-config.mjs`负责。旧环境入口支持`PORT`、`WORKBENCH_DB`、`WORKBENCH_EXECUTIONS`、`WORKBENCH_MODEL`、`WORKBENCH_IMAGE_CONFIG`及`WORKBENCH_MAX_CONCURRENT_JOBS`。默认端口4181，数据库与执行路径属于运行数据。

新配置以`WORKBENCH_CONFIG`指定JSON，含server、textProviders、bindings及各业务模块配置，具体字段与校验按源码和`launch-config.test.mjs`。它不能混用上述旧入口；供应商密钥通过指定环境变量读取，业务输入不携带密钥。没有真实供应商配置与能力证明时，不写“自动业务可运行”。

本轮不提供伪造的“全链路可运行”配置，也不复用旧run。确需联调时，从空的隔离数据库、明确资源预算、有效配置和当前授权开始，验证失败与未知结果按原协议核账。

## 排版与专项能力

前端Deck导出依赖应用锁文件中的PptxGenJS和fflate，本地可直接验证。后端原生排版另依赖`@oai/artifact-tool`、`@napi-rs/canvas`、字体及Python原生工具，当前部分文件静态引用本机专用路径。它们是明确的移植待办，不属于根`npm run check`的承诺范围。

PDF、原生渲染及字体专项涉及pypdf、pdfplumber、pdfminer.six、Pillow、pypdfium2、LibreOffice、Poppler和Fontconfig，实际需要随选定工具判断；依赖需按实际配置核实；不因源码存在就声称这些能力全部已安装或运行。不得把本机路径统一替换成另一台机器的路径来伪造可移植性。

## 当前七阶段与研究接入

新协议、来源登记、受限研究与原件读取、方法绑定和缺能力时停止的具体范围见[接续说明](seven-stage-research.md)。当前已接同版独立正文阅读、实际修订复查与研究声明/放行，详见[读者合同](research-reader.md)。自动采集已按[受限运行合同](research-acquisition.md)接线，简洁策略按[策略合同](simple-strategy.md)接线，双负责人接收、三方向文案及独立评审按[文案接续合同](simple-copy.md)接线；视觉参考与后端草图路由见[受限合同](visual-workflow.md)，成稿至交付仍待迁移，默认不执行模型。

## PDF原件配置

默认本地服务无需模型配置即可保存当前项目PDF，原件位于SQLite路径旁的.originals/intake受控目录，必须随运行数据保留。当前HTTP只支持12MiB内PDF，显式`--pdf-python ABS_PATH`仅启用本地PDF解析，不启用图像或Office品牌文件；sessionStorage无法保留原请求时发送前拒绝。边界见[PDF原件合同](brief-originals.md)。


## 独立读者配置

现有显式研究配置另需`bindings.reader`及匹配provider/model/role。未配置时只允许读取和问题登记，不创建读者任务。reader scope为saved-report-prose，没有图像输入；recheckAvailable按实际配置返回。恢复保存的HTTP结果无需重开provider或凭据，也不派发新调用。

程序化本地验收可显式给provider `testOnly:true`，新生产和读者任务会保存合成工程标签；该标签不放宽任何资格。CLI供应商、服务端账号或付费授权未由此启用。测试的明确工程操作员只覆盖人工节点接线，不代表真实客户批准。PDF默认根与研究默认根分别保留。新采集配置只有显式将`server.executionRoot`设为同一新SQLite的`${dbPath}.originals`，才允许选入PDF；`materialsRootShared`如实显示共根资格，不移动旧原件。

## 显式本地PDF解析

配置与能力按[本地解析合同](brief-extraction.md)。服务端程序化`intakeConfiguration`默认为null；CLI只有明确`--pdf-python`才选用相应绝对路径。actual probe核Python、worker、包和RSS监测，失败如实不可用；不自动安装或启用任务卡模型。测试专用`PITCH_PDF_TEST_PYTHON`只用于真实PDF专项，不是业务开关；指定错误环境必须失败。原件保存仍默认queued零attempt。

PDF可选运行依赖固定在`tools/workbench/requirements-pdf.txt`，包含实际已测的两个解析包及所需传递依赖。服务不会自行安装；Application CI使用独立venv和binary wheel显式安装、pip check后运行真实解析专项，不触系统环境或旧业务。远程安装和测试是否成功以本次PR实际CI为准。

普通symlink虚拟环境按所配置的Python路径启动；解析器不会将它替换为基础解释器。物理realpath/SHA仍核验，运行中路径或二进制变化将停止采用结果。历史提取JSON保留原实际工具身份，不据配置修复重新解析旧原件。

## 自动采集配置

`--research-config`沿用经过验证的launch配置，另需`researchAcquisition`、其指定的`searchProviders`和实际`research_planner`/`research`绑定。缺搜索、模型适配器或预算时显示不可用；设置开关不证明外部服务在线或获准付费。空来源可以自动取证，选择PDF另需实际当前bridge原件、已核抽取及显式共根。字段、默认零执行和恢复限制见[采集合同](research-acquisition.md)。

## 简洁策略与新建授权

`creationAuthorizedThrough`是服务器创建配置，默认research。程序化`createBriefServer`和launch JSON的`server.creationAuthorizedThrough`都按既有STAGES枚举验证；本轮新隔离整链配置显式选final_review。CLI由research配置映射此字段，公共新建body不能上传，旧项目和set-policy不升级。授权终点不等于任意阶段路由开放，文案仅通过受限接续接口执行。

简洁策略另需strategy和verification绑定、执行开关及当前原研究放行。其capability只检查配置形状，不完整probe HTTP凭据或远端在线。默认没有执行器；付费/真实模型及旧run保持暂停。请求、固定任务及unknown恢复见[策略合同](simple-strategy.md)。

## 文案与四岗配置

受限copy复用同一research配置和执行器。available要求strategy、copy、verification、creative_director及copy、brand、user、communication四岗各自creative_score和creative_opposition绑定；每个binding必须对应已配置provider和同名model。原生评审继续要求真实校准证据，available不证明校准、网络或质量通过。

默认research终点不提升，显式final_review只作用新案。strategy人工节点通过单独confirm采用当前稿，不能改policy绕过。接口与固定任务见[文案合同](simple-copy.md)；本包不提供任意阶段或下游unknown恢复开关。

## 视觉参考配置

参考与后端草图路由复用同一显式执行器。launch的moduleConfigs.reference、sketch及sketchReview分别映射原referenceConfiguration、sketchConfiguration、sketchReviewConfiguration；bindings/providers、图像能力和预算仍由各原模块验证。available仅表示配置匹配，不证明供应商在线、原件或质量通过。

当前只接新协议manual_supplied与明确原target，不开启旧schedule、付费模型或旧run。原图storage-only与模型执行分开；当前UI尚未独立映射无执行器上传能力。COPY和视觉pending没有自动解除或原件恢复开关，旧未记录请求不补造结果。详细字段、方法与原claim见[视觉合同](visual-workflow.md)。
