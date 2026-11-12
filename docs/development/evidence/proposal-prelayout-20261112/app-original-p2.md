# prelayout App readlane独立复核

结论：发现1项P2，当前暂不给整包GO。其余purpose边界、反例与UI具名范围通过，不能覆盖该原queue见证缺口。

固定对象：9源c89d20a1d0fb2fc300ebd1168d7f3be105762e23a6a42927d7da288ee41a86dc；OWNER-REPORT 56cdb09db3ec9c7b4e358400513231e63e41aa1f9bd78444177bb35f67efe9ab；author manifest 2dcdd523aebbb7762beab07c1c77bec6d15d64678eb1fdf7d6e266f540d315fa。生产补丁已在自有固定before副本实际patch应用，9文件after SHA逐项相同。

## [P2] nativeRequest.expectedRevision没有绑定真实queue审计

位置：candidate/apps/workbench-preview/src/services/http/prelayoutReadback.ts的nativeRequest检查与queue witnessed段（约60–62行）。nativeRequest只核字段集合及project/task/policy/source，遗漏expectedRevision的类型、值与原queue审计对应。

实际反例：queued原件nativeRequest.expectedRevision=0，queue audit revision=1、snapshot revision=1，正控可读。仅将job.task.nativeRequest.expectedRevision及原queue command.nativeRequest同字段改为1,000,000；input/sourceTuple、各原文SHA、jobId及审计全部不变。prelayoutReadScope和mapProject仍成功，relation仍same_inputs。两份metadata互相相等不证明其来自真实排队版本。

原native proposal-prelayout-domain的queue分支要求nativeRequest.expectedRevision等于排队前p.revision，落入本Snapshot的queue audit revision须为该值+1。修复应要求nativeRequest.expectedRevision是合法非负整型且**严格等于真实queue audit revision−1**，queue command原件同值；保留原audit唯一性/原task与input绑定，勿改fixture审计来过、勿扩大其它purpose或native资格。

原红：run-red.mjs → app/src/services/http/prelayout-queue-revision-red.test.ts，queue-revision-red.log，queue-revision-observation.json。最后断言“必须拒绝”红exit1；新r2复制同数据/篡改可在拒绝后直接转绿。首轮原红源码/日志亦保留为queue-revision-first-red.*。

这是只读metadata原queue身份一致性缺口，**不宣称native执行、物理原件、人类/终审权限被突破**；那些旗标仍false。

## 通过的具名范围

- 原目标15＋邻接15＋独立新增7＝37/37、0skip；own完整src typecheck通过。少引用及错source SHA/pointer/quote的反例先完整更新raw response、artifact/receipt与finish hash；正确return报告正控通、坏引用拒。错attempt连同claim更新仍不能借旧locator/report；wrong requestHash连同claim更新仍拒。新增active task及caller current/physical/human旗标无法掩盖historical关系；invalid原文不能只改状态伪装clear。
- 只承认精确proposal_prelayout_check purpose/stage及其4个输入artifact descriptors。附加final_visual_image/owner/aggregate或任意旧visual purpose依旧拒；descriptors没有给B producer job资格。未删除B jobs制造完整正例，完整B coldGET桥仍是明确未实现依赖。
- 同快照原queue/claim、owner-now、request/receipt、report/artifact关系的其余守卫在上述正负例保持；queued/running/unknown/succeeded_stale/invalid原文状态没有被归一成通过。physical/execution/human/final始终false。
- 旧HTTP断行修复在新自有副本4/4通过；fake consume/capture/mapper/verifier断言实际执行，upstream native qualification继续拒。只用自有新组件SQLite与合成loopback，三个实际协议响应；不是模型或当前B正例。
- 固定ui-review实际Chrome两桌面、六状态12视图：Enter/Space与aria-controls可用，焦点可见，原report textContent逐字相等；单root/h1/section，无横溢或pageerror，harness GET-only/无POST、无写入动作。见UI-REVIEW.md及ui原证据；不以截图签业务。
- 作者148与旧637产物逐SHA在复验前后全匹配。旧637仅静态保护性字节哈希（包含冻结合成SQLite文件），未连接/查询旧或主数据库；新HTTP测试仅连接本目录新component.sqlite。无作者/根/Git/主案/固定服务写入，无外部/付费模型；临时Vite/Chrome/loopback已关闭。

## 交接

先由原作者新r2做queue审计的最小绑定修复，再用此原红与37/HTTP4/UI范围快速复核。当前不采用本9源包、不放宽B或旧visual guard。正式排版、B/current-source/physical资格、完整主案coldGET、后台原件/运行、App真实写入与人类/终审均未取得本报告批准。
