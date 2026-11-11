# PDF本地解析接入核验

2026-11-11，基线97f13ab562b231f689afb9536e658a2cd3c2558c（研究PR #5已双CI合并），分支codex/brief-extraction-20261111。仅完整七阶段目标中的本地资料子路径，目标继续active。运行范围见[解析合同](brief-extraction.md)。

## 已接范围

复用旧intake/Python parser，指定当前原件的真实claim、提取JSON及同修订HTTP读取接当前资料副层；默认不解析，显式工具先probe。状态区分分页文字/空页、partial、无文字、需密码、非法与限制；job succeeded或document ready不代替提取状态。模型读取与人类采用恒not_verified，未启动任务卡模型或研究/采集。

已知原body核回，错回执/真正未知保留；历史文件可读但不可新派发。首claim永久中断仍running未知，没有全面判死/接管；job succeeded而结果failed也不伪造可重试。上述限制不因测试通过取消。

## 实际Chrome与原文件

新空库pdf-ui.sqlite、4186后端及4432当前前端。新工程项目project-7a7e2daebb09904a7f5854abcfe23d8270a30456b2937346668419c37883f963，使用仓库自有mixed/encrypted/invalid PDF夹具。没有重开得闲/青屿或旧DB。

实际浏览器完成新建并上传3份PDF，确认前开始本地解析。第1份真实响应已落库后截断返回，页面保留未决；刷新后原body逐字一致核回。实际只有1attempt；其余两份分别给password_required和invalid。最终3个本地job各1attempt，结果partial/2页（第2空页保留）、需密码/0页、非法/0页；0任务确认、0模型调用、0采用。原PDF下载与夹具逐字节相等。

[原回执字段投影](evidence/pdf-extraction-20261111/UI-RECEIPT-SUMMARY.json)保留原body、文件SHA与结果JSON引用；明确不是整库或完整HTTP响应。完整原回执、上传请求和原件留在本地。自行创建的4186服务正常exit0后以当前修复源码重载，GET核仍3attempt/0确认，不扫描或重新派发。

## 独立复核与修复

| 发现 | 修复及实际证据 |
| --- | --- |
| fresh与queued本地retry在预检后换卡仍可实际start，解析历史资料 | 实际start同时核原卡完整hash、冻结准入revision及原human retry账本；派生稳定start命令，CAS失败不增加attempt。先失败反例保留；独立8个竞态及1个丢返回/账本反例通过，受影响46/46通过 |
| 两份0页结果入口称“已保存正文” | 0页改“查看解析结果与诊断”，有页保留正文/页数；实际只读同条件复验，原结果与空页不变 |

[后端独立报告](evidence/pdf-extraction-20261111/http-independent-review.txt)保留初P2、fresh/queued两个旧反例与修后9/9、46/46。还验证真实127.0.0.1 HTTP、原字节/结果SHA、同修订、关闭parser后重放、同长度篡改拒绝。无专用环境时明确跳过真实解析专项；指定坏环境应失败，不计通过。

[独立UI报告](evidence/pdf-extraction-20261111/ui-review.txt)逐条记录20原则与实际限制。未参与实现的审核者拦截所有POST，只读1280浅色/910深色、3结果及3处工具诊断，键盘Space展开及正文Meta+C逐字一致；无横向溢出/页面错误/HTTP错误，POST0。它不代签后台并发、全面恢复或业务批准。

| 同条件对照 | 截图 |
| --- | --- |
| 未解析原状态 | [1280浅色](evidence/pdf-extraction-20261111/unparsed-before-1280-light.png) |
| 0页错误入口文字 | [修前](evidence/pdf-extraction-20261111/zero-pages-before-1280-light.png) |
| 0页明确说明入口 | [修后](evidence/pdf-extraction-20261111/zero-pages-after-1280-light.png) |
| 正文/空页与原诊断 | [910深色展开](evidence/pdf-extraction-20261111/expanded-after-910-dark.png) |

原件来源、长度和SHA见[证据清单](evidence/pdf-extraction-20261111/EVIDENCE-SOURCES.json)。截图只含工程数据，不是品牌、客户或研究批准。

## 最终工程验收

候选三文件独立预审24项加3个独立中断/历史反例通过；根原始采用16/16，retry修复后service25及相关HTTP/旧局部46项通过。前端作者实际native7项、745前端/1既有skip及类型构建通过。根完整整仓检查实际退出0：745前端/1既有skip、78核心、26域、51Brief/PDF HTTP、80研究合同，类型和构建通过；55规范、9项规范隔离、4项Git反例通过。当时1638项纳管，393导入/147封存身份保持。随后固定可选PDF依赖并配置CI独立venv实际跑解析专项；已核9个已测版本均与本机相同、官方发行及wheel存在，YAML解析通过，最终清单门禁另核。固定5af651db的[Spec审查](evidence/pdf-extraction-20261111/pdf-final-spec-review.txt)无P1/P2，[Standards审查](evidence/pdf-extraction-20261111/pdf-final-standards-review.txt)发现普通symlink venv被替换为base Python的P2。现以配置路径启动、保留物理SHA并执行后核未变；[独立修后复验](evidence/pdf-extraction-20261111/python-environment-fix-review.txt)21/21及旧/新venv对照通过。原本机base已装包，旧失败证明丢配置身份，不写成旧本机cap必为false。修后完整check再次退出0：745前端/1既有skip、78核心、26域、57Brief/PDF HTTP、80研究合同，类型构建通过，规范1.8.1；当时1642清单，最终补入独立报告后另核。远程Git/CI按实际回执补录。

自动采集、简洁策略、三方向文案/视觉、通用Deck/终审及包装/KV整链仍继续。真实供应商/付费/生产账号/通知/云部署和在线PPT编辑保存专项保持暂停。原件、数据库和失败回执原位保留，Git不代替运行数据恢复。
