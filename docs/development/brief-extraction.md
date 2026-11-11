# 当前项目PDF本地解析

规范版本：1.0.1。复用旧intake的本地PDF解析器，在[原件保存](brief-originals.md)之上接入显式解析、原结果读取和同体请求核对。它是简报的内部资料能力，不增加前台阶段，不执行任务卡模型、采集或研究，也不自动采用任何字段。

## 默认与配置

上传仍只保存原件并登记queued、零attempt的本地PDF job。默认没有解析配置，保存及下载可用；不能用配置存在替代运行能力。

单独启用时，从新的隔离数据库启动：

```sh
node tools/workbench/brief-server.mjs --db .data/pdf-example.sqlite --port 4182 --origin http://127.0.0.1:4420 --pdf-python /absolute/path/to/python3
```

所选Python需具备既有pypdf、pdfplumber及实际可用的资源监测；服务不自动安装、寻找或替换它。开发者可在独立Python虚拟环境中按`tools/workbench/requirements-pdf.txt`显式安装已测固定依赖，再将该环境的Python绝对路径交给服务；不要修改系统或旧业务环境。解析器按捕获的配置路径启动Python，以保留普通symlink虚拟环境的site-packages；realpath及物理二进制SHA只用于身份核对，执行后还核路径与字节未变。路径重定向或删除时受控拒绝，不回退到系统Python。程序化配置为`createBriefServer({intakeConfiguration:{pythonBinary:ABS_PATH}, ...})`，不借研究执行开关启动解析。`/capabilities.originals`先实际probe再报告`localExtractionAvailable`与`localExtraction`，模型读取能力仍为false。探针不可用时显示真实原因，不能根据沙箱拒绝资源监测就断言缺库。

PDF限制沿旧工具：12MiB原件、100页、1MiB提取文本、100000文字节点、4MiB工具输出、20秒和512MiB监测预算；程序化limits只能缩小。保存实际Python/worker身份、包版本、限制及资源监测结果。平台不支持硬地址空间限制时，按实际RSS监测报告，不能声称硬内存上限已生效。

## 接口与记录

以下均在`/api/v1/projects/:projectId`内，沿用Host、Origin、字段与版本守卫。

| 接口 | 行为 |
| --- | --- |
| GET `/documents/:documentId/extraction` | 同项目核原PDF及已保存提取JSON，返回document、extraction、extractionRef、scope及同修订project/view；未解析为null |
| POST 同路径 | 显式执行指定本地PDF job，或核同一原请求；普通128KiB JSON限制 |

POST严格字段为`documentId`、`taskCardId`、`taskCardHash`、`commandId`、`expectedRevision`及`action`（extract或retry_local）。路径与body的documentId必须一致。首操作须当前卡完整hash、当前原件及有效修订；确认Brief前也可执行。retry_local由实际本地human操作上下文登记，不等于客户批准。

首claim通过真实intake-start保存原请求，既有processedCommands是命令账本；不另造恢复日志。原件原字节由intake-document-store核SHA、长度、受控路径和登记关系；抽取JSON按实际文件SHA与字节长度读取，原rawHash、文本hash、分页与工具身份保持。HTTP不拼接旧文件和新head。

## 页面与结果判断

当前资料下载行保留，在副层显示本地解析状态、显式解析操作和已有正文。当前卡可开始，历史卡仅查看原结果。页面沿既有中文桌面组件，不要求使用者输入路径、hash或JSON定位符；工具身份按需展开。

| 实际状态 | 含义 |
| --- | --- |
| 无extraction、job queued | 原件已保存，尚未解析 |
| running或未知调用 | 结果待核对，不换命令重发 |
| text_extracted | 当前工具从各页提取到文字 |
| partial | 部分页有文字，空页及遗漏限制保留 |
| no_text | 未提取到文字，不自动OCR或补写 |
| password_required | 文件需密码，不索取或尝试绕过 |
| invalid | 工具不能读取此PDF |
| limit_exceeded | 达到实际资源限制 |
| failed、blocked | 本次本地操作未完成；符合原条件时显式retry_local |

job succeeded和document ready只表示本地处理结果已保存，不能替代extraction.status。如果job已succeeded而提取JSON的status为failed，仍显示未取得文字与原诊断，不能伪造可重试按钮；当前显式retry仅接受原job的failed/blocked/awaiting_reconciliation，重新提取已保存failed结果的协议仍未覆盖。全部结果的modelReading、humanAdoption保持not_verified；提取文本不是已确认Brief、市场事实或研究充分性。部分结果保留空页、页码、UTF16位置和限制，不裁掉坏页制造“完整”。

## 原请求恢复与历史

浏览器extract_original未决类别按manage权限保存完整原body、path、命令与修订。响应丢失后只重放此请求。错回执或真正未知保留日志；核到原terminal结果后才结束记录。已知历史先核原claim/job/文件，再提示历史并保留可复制的原提交；不能用当前卡重新构造旧请求。

同体重放不会自动新增attempt。显式retry_local保留原失败attempt，仅重试当前原件的本地工作。已保存历史原件和抽取可在关闭解析配置时读取，isCurrent=false，不自动归入新卡。解析后重放旧上传也应核真实原登记与字节，不要求文件永远停在queued。

首claim之后进程永久中断可能保留running未知。目前没有为这一状态接入判死、接管或自动重试协议；它继续待核，不冒称所有崩溃恢复已覆盖。启动服务不扫描、执行或核回旧job。

## 验证和保留

默认无解析运行环境时，普通测试仍覆盖原件、缺配置和历史守卫；真实PDF专项用`PITCH_PDF_TEST_PYTHON=/absolute/path/to/python3`显式选择已安装环境。本地未设置时明确跳过对应专项；设置但不能运行应失败，不能默默计通过。Application CI配置在独立虚拟环境显式安装固定PDF依赖并设置此变量，真实解析专项因此必须运行；实际远程结果按PR回执确认。HTTP、前端与实际UI的最终范围以[本轮核验](brief-extraction-verification-20261111.md)和原回执为准，候选局部测试不能替代应用验收。

SQLite、旁文件、`.originals/intake`原件及提取JSON一起按[保留规则](../storage-retention.md)保留，Git只保护明示源码与文档。原研究目录身份保持；未来采集要在新的隔离配置对齐根目录，不移动旧原件。多格式Office/图片、OCR、模型提取、人工采用、生产账号和在线PPT编辑均不由此启用。
