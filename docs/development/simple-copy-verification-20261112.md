# SIMPLE策略至文案接续核验 · 2026-11-12

当前本地接入：同版SIMPLE策略经实际双负责人交接，生成唯一三方向文案，再登记全文核验和原四岗17节点评审。合同见[文案接续](simple-copy.md)。本页记录实际工程范围；完整七阶段和远程PR结果按后续真实回执补记。

## 实际案例与界面

具名包装合成案例“文案包装 · 合成工程R1”，项目`project-783b3ceba8cad8e9ed9c1cd8de55e49cc404bbb5f7e373f957abd98be2625689`，原根`reader-owner-FyRazA`。实际准备了r7、独立读者、研究核验/交接、研究工程放行及SIMPLE；没有重开旧青屿或得闲业务。它是文案子链验收，不能代替从Brief起的包装/KV两整链。

真实Chrome操作完成双负责人、唯一copy、全文核验及17份原评审。最终revision163、30个实际job各1attempt，queued/unknown均0。文案子链21次唯一调用=双负责人2+copy1+全文核验1+评审17；上游研究策略9次。评审为四岗首读4、异议首读4、评分4、异议4、裁定1，三方向原正文保留。

文案保存响应被主动截断后，刷新使用完全相同的command/body恢复；revision65、任务数、唯一copy调用保持不变。导航和刷新不派发任务。原请求与最终计数见[UI回执](evidence/simple-copy-20261112/creator-ui-receipt.json)和[终态摘要](evidence/simple-copy-20261112/creator-final-summary.json)。

独立UI在同案revision140、12报告/待4任务时延迟真实GET：刷新中全部写入动作禁用，查询实际完成后才恢复继续按钮；0POST且项目不变，见[延迟GET回执](evidence/simple-copy-20261112/independent-refresh-settled.json)。最终同案17份报告及浅深主题已分别只读核对。最后只读重开再次核对“文案进行中／待视觉交接、策略完成”及已保存按钮原因，project、17报告和三方向artifact/SHA/content与前次final完全相等；executionAllowed=false、0POST及错误。见[独立UI报告](evidence/simple-copy-20261112/independent-ui.txt)和[最终读回](evidence/simple-copy-20261112/independent-readback-result.json)。

![原R1最终状态与阶段说明](evidence/simple-copy-20261112/readback-1280-light.png)

![原R1的910宽深色界面](evidence/simple-copy-20261112/readback-910-dark.png)

910宽初始位置及自然滚动到三卡的位置均未隐藏WorkBot，实际标题矩形与其可见元素无交集；该观察不覆盖任意滚动或悬停气泡。页面无横向溢出，三卡局部文字对比13.94:1；没有作整页无障碍合规声明。

合成director原记录同时保留`human:false/outcome:reject`及`creativeStatus/groupVerdict:pass`，人类决定数为0。不能从这些工程票推定真实创意质量、消费者偏好、客户批准或人类选定。

## 修复与保留的失败

首次frontend候选对creative packet、phase和原输入核对不足；r2补齐完整17节点、角色/依赖/packet/task/policy/target/input绑定，并保留合法历史可读。独立检查及候选原工具回执分别见[前端独立审查](evidence/simple-copy-20261112/frontend-independent.txt)和[原工具回执](evidence/simple-copy-20261112/frontend-original-tool-receipts.txt)，后者不是补造的stdout。

真实UI暴露队列刷新窗口可重复提交旧任务组。原生守卫以422拒绝新command；该command没有入账，旧4任务各1attempt且unknown0，见[原拒绝检查](evidence/simple-copy-20261112/rejected-command-check.json)。原错误body未被驱动保存，`INVALID_JOB`只属于源码/状态推断，没有重放来补回执。现页面在查询刷新或刷新失败时阻止新写，系统角色及phase使用中文。

驱动误以为一步完成双负责人、GET竞态提前关闭context、暂停后墙钟超时、Chrome响应缓存丢失及错误禁止全部AI decisions的断言均保留原失败。继续只执行同案剩余原队列；没有重造项目来覆盖失败。详见[creator原说明](evidence/simple-copy-20261112/creator-owner-notes.txt)。

## 原身份与边界

recovered SIMPLE的原attempt仍未知，产物作者保持原executor，恢复者另存reconciliation context。独立从保留SQLite历史revision41/43/44/154/155及10份原IO、19份负责人/评审原件重新计算SHA；revision43恢复receipt后至评审完成，原attempt、作者、receipt、正文与原IO一致。最后问题变化使交接失效，不能把旧评审当当前放行。见[恢复身份独立核验](evidence/simple-copy-20261112/recovered-identity-independent.txt)。

actual claim仍检查原commit、双负责人、当前任务卡/问题/policy/binding和授权；HTTP step仅运行请求冻结的1–4个原任务。显式人工策略checkpoint使用原生adopt-creative及decide/strategy权限，导航不代签。GET投影`originalsVerified:false`，不冒称本次读取已物理复验全部原件。

默认授权仍停研究，只有服务器显式配置影响新项目。文案、负责人及creative未知结果保留并停止，本包不开放它们的恢复重派；文案改稿再评、视觉继续、Deck/PPTX和两整链待接。在线编辑保存/恢复、付费模型、正式服务和旧业务run保持原边界。

## 检查与回执

根类型检查、2项实际前端HTTP测试、25项可移植绑定/合法历史/权限测试、7项原生变化/未知/来源边界已通过。portable快照只保存合成历史metadata，不包含物理原IO，不代替原生验收。精选[HTTP日志](evidence/simple-copy-20261112/root-http.txt)、[边界日志](evidence/simple-copy-20261112/root-boundaries.txt)及[类型日志](evidence/simple-copy-20261112/root-typecheck.txt)保留实际输出。

功能提交`c22184bacc8cadae41056fa71fa6b7a310fb582d`的根功能回归退出0：前端765通过/7跳过、核心78、域26、Brief/PDF31通过/26环境专项跳过、研究80、采集60通过/1环境专项跳过、策略26、文案12，类型、依赖原字节检查及构建通过。该命令未配置PDF环境；随后使用已安装的显式Python补验Brief/PDF57/57、前端原件5项及采集1项、后端采集1项均通过。六个前端环境专项已补齐，余1项为既有跳过。过滤命令中未选测试的skip不冒称执行；构建保留大chunk提示。[工具输出转录](evidence/simple-copy-20261112/root-check-tool-transcript.txt)注明初始命令标题已规范化及build stdout被重定向，不冒充完整原始stdout。

固定`c22184ba`两轴审查中，Standards无硬规范违例、1项字段表复制P3；Spec证实1项P2：原四节点组首项合法变为未知后，后续claim仍能启动。原报告和只读反例保留，见[Spec](evidence/simple-copy-20261112/final-spec.txt)、[Standards](evidence/simple-copy-20261112/final-standards.txt)。修复后新step在入账前拒同edge未决工作，已受理原组每次dispatch前重新读取并停止；原实际claim也用同edge门槛。缺edge不再误纳研究任务，已恢复SIMPLE的成功job及未知原attempt保持合法。五项调度行为先4红/1绿，再5/5通过；独立同原revision82证实第二claim由running变为`COPY_OUTCOME_UNKNOWN`，见[修后独立核验](evidence/simple-copy-20261112/final-spec-fixed.txt)。五操作字段表已共享，Standards窄复核无新增问题。修后域26+调度5、实际HTTP两项（含同一新案历史快照的合法unknown actual-claim拒绝）、原unknown边界1项及前端实际HTTP2项全部退出0，见[修后后端](evidence/simple-copy-20261112/stop-neighbors.txt)、[修后前端](evidence/simple-copy-20261112/stop-frontend-http.txt)和[Standards补核](evidence/simple-copy-20261112/final-standards-fixed.txt)。原完整通过与修后针对性验证分别保留。

[PR #9](https://github.com/marctubud-pixel/pitch-agent/pull/9)已从草稿转为待审。b1ef4726的规范CI成功，应用CI前端770通过/1既有跳过/1超时失败，原生测试与build尚未执行；失败是SIMPLE完整工作流正例30385ms超过测试框架30秒，见[原CI注释](evidence/simple-copy-20261112/ci-b1ef-failure-annotations.json)。只将该文件五个完整工作流的测试外层wall统一为120秒，所有正文/断言与生产/provider超时字节不变，见[前后身份](evidence/simple-copy-20261112/ci-timeout-fix.json)；[独立复核](evidence/simple-copy-20261112/ci-timeout-independent.txt)逆变换确认正文逐字节相等；CI实际checkout为PR合并ref，本地审查基准为b1ef4726。仅外层时限修正后，本地5/5复验通过，见[实际输出](evidence/simple-copy-20261112/ci-timeout-local.txt)。最终准确head `b5687cf3644be0e4f34b33eaf221e48e59745c0c` 的[两项CI](evidence/simple-copy-20261112/pr-final-ci.json)均成功；[应用job](evidence/simple-copy-20261112/pr-final-job.json)实际安装、源码检查、前端/原生测试及build全部成功。已[合并](evidence/simple-copy-20261112/pr-merge.json)为`68b6302c4a88f2a11b0548a9243ca4ab3530347a`，已从origin/main读回。最终规范基线1.11.1、58项注册及16张固定页面截图；393份导入和147份封存原件身份继续核对。视觉纯解码性能修复另在隔离候选验证，没有混入本PR。

[证据来源](evidence/simple-copy-20261112/EVIDENCE-SOURCES.json)逐文件记录原路径、字节数和SHA。完整SQLite、native快照、原IO、大图和失败留本地原位；仓库精选不能恢复未纳管的运行数据。
