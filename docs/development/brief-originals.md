# 当前项目的PDF原件保存

规范版本：1.0.0。沿用当前Brief HTTP与旧intake原件存储，为新七阶段项目接入品牌PDF保存、下载和未决恢复。这是[静态闭环对账](capability-reconciliation-20261111.md)中输入接入的一条已实现路径，不代表采集、解析、r7读者运行或整案已完成。

## 使用与支持范围

沿用`npm run dev:brief`和`npm run dev:http`，不启用研究或模型即可保存PDF。新建页先按实际能力检查文件，再创建项目及逐个保存原件；确认Brief前也可以保存。资料仍在既有品牌区，当前项目可下载。原件保存、解析、模型读取和人类采用分别记录，上传不补后面三种状态。

`/capabilities.originals`的协议为brief-original-v1。目前仅支持实际PDF字节，单份最多12MiB，项目登记上限20份；前端与原有10份约束取交集。原有Mock多格式及50MB本地保存继续保留，不伪称HTTP也已支持这些格式。普通Brief附件的文本提取与此独立品牌原文件分开。

新建页根据实际能力显示PDF及大小/数量，未连接或能力不符时不放开上传；不支持文件在创建项目之前拒绝。文件名、用途说明及选择身份随原件保留。浏览器恢复记录需要保存原base64请求，sessionStorage容量可能小于服务12MiB；容量不足时在发送前拒绝并保留选择，不能去掉日志来绕过未知结果恢复。

## 受限接口

API根为`/api/v1`，沿用Host、Origin、方法、字段、查询和版本边界，不接旧完整server的启动扫描。

| 接口 | 行为 |
| --- | --- |
| GET /capabilities | originals公布真实支持范围，默认executionAvailable仍false |
| POST /projects/:id/documents | 当前卡ID/hash、commandId、expectedRevision、originalFilename、base64及可选metadata；输出真实项目、document和重放receipt |
| GET /projects/:id/documents | 同修订列本bridge实际登记原件，逐件核保存字节 |
| GET /projects/:id/documents/:documentId/original | 同项目受控原字节，真实Content-Type、长度与SHA ETag；下载不执行解析 |

上传JSON仅此路由按12MiB原字节的base64大小加有限metadata扩展，其余入口继续128KiB。客户端也按路由限制请求，不自动重发失败或未知调用。写入需当前项目和active任务卡身份，不要求先确认；卡换版后旧文件仍可读，isCurrent=false，不把旧资料变成新卡的采用记录。

metadata可含clientResourceId、declaredMediaType、lastModified和note。带客户端选择ID时，文件名最多255字符、无路径、扩展名PDF，note最多1000字；真实媒体类型与SHA来自字节，声明MIME只允许空或application/pdf。普通无clientResourceId的intake元数据按原有更宽范围保留，不强转BrandResource。已有选择ID不能换新命令重绑不同字节或元数据。

## 复用、版本和恢复

`brief-intake-service.mjs`调用旧createIntakeRuntime.upload和checkedDocument，原件由intake-document-store受控目录、SHA/大小、符号链接和读中变化检查保护。项目登记及原请求保存在既有intakeDocuments/intakeOperations，不另建业务状态数据库。

PDF上传附带旧本地解析器queued job，零attempt；这条入口不execute、schedule或recover它。当前前端只窄允许与bridge登记一一对应的intake_document/PDF queued零尝试job，不因此开放旧intake模型或其他生产。

前端保留原生完整任务卡计算原cardHash，不从丢字段DTO重建。选择时client UUID和服务端document ID分开；投影核原文件与操作/项目/原SHA/元数据，下载再核真实字节、长度、PDF头和SHA。HTTP原件保存在当前项目，不误称只在浏览器。

提交前按API和人类本地角色隔离保存upload_original未决记录；权限仍为manage。响应丢失后刷新重放原commandId、body、expectedRevision和卡hash，不换ID或用新head合成请求。核对成功回Brief资料所在页；同体重放不增文件、job或修订。已保存的部分原件按实际SHA复用，不重复上传；不支持或冲突保留输入及原记录。

## 保存与验收边界

原件对象位于显式SQLite路径旁的`.originals/intake`目录，和SQLite/旁文件一起按运行数据保留；Git只保护源码和文档，不能恢复未纳管原件。新服务不接旧数据库，不启动旧得闲或旧serve，也不因这条接线恢复付费模型或在线PPT编辑。

实际验证见[原件接入核验](brief-originals-verification-20261111.md)。研究采集、PDF解析/模型提取、其他品牌格式HTTP存储和正式采用仍需后续接入，原件保存不能签这些能力已完成。
