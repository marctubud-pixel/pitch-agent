# 简洁策略接线核验 · 2026-11-12

本包接通已放行研究到三板块策略、独立全文核验、原件读取与当前策略页。功能提交为 `6766324502ce6c82a3b060f1ecb24acd61aaf22a`，基于采集包合并提交 `359650601f992086b0825e9efc5d5d268dbfa387`。采用[简洁策略合同](simple-strategy.md)。初始规范基线1.10.0，受阻结果纠错后为1.10.1。最终两轴审查、远程PR与准确head CI按后续真实回执补录。

## 实际完成

复用研究放行和原continuation，策略仅有研究结论、方向交叉点、策略发力点。任务、研究、问题登记、policy、原job及模型binding保持绑定，claim前再核版本与原件。空claims不跳过独立全文扫描或HARD_BLOCKER。默认创建授权仍为research，显式服务器配置只影响新项目；公共请求不能注入授权终点，也不升级旧项目。

新合成KV工程案R3使用结构化任务卡，真实研究原件、r7读者、核验、双方研究交接和工程操作员放行。浏览器明确继续后保存唯一策略稿；首次全文核验故意中断响应，刷新没有自动POST，随后同原body核回。生产与核验分别只有一个job、一个attempt；核回前后revision46、9个job与原attemptId不变，copy为0、策略放行为0。见[实际核回回执](evidence/simple-strategy-20261112/UI-VERIFY-RECEIPT.json)及[无重派证据](evidence/simple-strategy-20261112/UI-NO-REEXECUTION.json)。它不是完整Brief至PPT案例，也不代表真实研究、消费者或客户批准。

## 失败与修正

- R1沿用纯文本夹具，没有提案类型，ProposalService正确拒绝页面加载；原案无策略任务。[启动失败](evidence/simple-strategy-20261112/R1-STARTUP-FAILURE.json)保留。
- R2已有类型，但合成策略仍引用旧`/text`，与结构化任务的真实`/fields/background`不符，原校验保持awaiting_reconciliation。[阻断](evidence/simple-strategy-20261112/R2-BLOCKER.json)和[原位置核对](evidence/simple-strategy-20261112/TYPED-POINTER-PROOF.json)保留；没有改写原回执或重派同任务。只修测试夹具后新建R3。
- R3第一次continue的路由观察过早，仅看到瞬时strategy和加载骨架，不能签成功恢复的路由。后续首次verify按稳定正文、报告及URL重新验证；未注入恢复日志补造before证据。
- 新状态断言最初放在全文核验之前，误期望已经“待负责人接收”，测试实际失败。将断言放到真实核验之后，四项HTTP全部通过；[原失败日志](evidence/simple-strategy-20261112/prior-ui-assertion-failure.txt)未删除，生产门槛未放宽。

## 独立真实UI

独立Chrome在1280浅色、910深色检查概览、研究、策略与展开状态，未参与生成或核验操作。实证并修复当前阶段仍停研究、研究摘要否认策略、OWNER_REQUIRED误译为需要修改、深色三环文字对比不足。随后根补发现已连接策略仍标演示内容，仅对connected策略修正身份标签；Mock青屿保持原标签和预览说明。

同R3复验显示策略进行中、待双方负责人接收，三板块、三圈及原配色保留；深色标签对比实测4.68:1。引用、SHA、完整原核验报告可展开，键盘复制原稿1875字符完整匹配。7个原目标状态及3个身份标签补验均无横溢，0业务变更请求、0页面错误。原项目对象前后完全相同，revision46、9个job不变。见[独立报告](evidence/simple-strategy-20261112/ui-review.txt)、[摘要](evidence/simple-strategy-20261112/UI-INDEPENDENT-SUMMARY.json)与[前后证据身份](evidence/simple-strategy-20261112/EVIDENCE-SOURCES.json)。

原creator进程结束后，独立after仅重开原R3数据库和原件，模型执行关闭，没有新建fixture或重跑研究；能力提示因此不同，项目记录未变。独立审核未触发空态、unknown、历史及坏原件状态，不扩大UI签署范围。固定规范的16份截图没有替换。

## 验证范围

根完整`npm run check`退出0：762前端通过、1项既有跳过，78核心、26域、57简报/PDF、80研究、61采集、25策略通过，类型与构建通过。使用显式已安装PDF解释器；没有把无环境skip算作解析通过。[完整日志](evidence/simple-strategy-20261112/root-check.txt)保留当时1681纳管、393原始导入、147封存身份。

完整检查的前端部分发生在最后UI修正前；最后字节另有类型、构建、[四项实际HTTP](evidence/simple-strategy-20261112/final-ui-http.txt)及上述独立UI复验。新增证据纳管后的清单数以最终门禁为准，不能把早先日志计数改成后来数量。

## 后续与保留

策略双owner到三方向文案仍是下一独立工作包，当前没有因此接通视觉、同版Deck或终审。策略修订、下游unknown恢复、包装/KV两整链和原生PowerPoint打开仍需各自验收；在线编辑保存继续暂缓。旧得闲、青屿、数据库、原件和原票保持各自身份，不重开旧服务或付费模型。

本轮用户授权的空间恢复另见[检查点](../../status/checkpoints/2026-11-12-space-recovery.json)及[独立复核](evidence/simple-strategy-20261112/cleanup-review.txt)：删除27处可重建派生产物，同字节副本采用同路径APFS写时复制；未删除原数据库、素材、源码或回执。最新约48GiB可用，后续系统级增加不全部归因清理；逻辑复制量不当作物理回收量。

## 最终Spec发现的受阻结果缺口

固定67663245的独立Standards无P1/P2或硬违例，Spec实际HTTP确证一项P2：blocked原结论与gaps保存在磁盘，工作区却只显示空态。保留初始两轴报告与实际失败案；修复没有把blocked提升为artifact。工作区增加独立blockedOutput诊断及原job failure，读取核原packet、模型响应、schema、normalized真实字节和SHA，前端再核attempt、receipt与内容SHA。通用complete-stage/放行守卫没有改动。

独立同原R8案只读复验：revision41、原body、1attempt、空artifact与80份原件SHA均不变，现可读已有结论与具体gap；内存篡改SHA、basis和packet均被拒。新受阻HTTP及前端专项各1项通过，核原请求重放零新调用、坏normalized拒绝和坏投影SHA拒绝。

另建具名结构化KV工程案R4，实际Chrome明确continue一次后显示具体缺项、保留结论及“不是完成稿”。revision41，策略任务blocked/1attempt，策略artifact、核验和copy均为0；刷新0POST且project完全相同。当前独立R4 UI与修后整套检查尚待最终回执；它不能替代真实研究、双owner、客户批准或完整两案。
