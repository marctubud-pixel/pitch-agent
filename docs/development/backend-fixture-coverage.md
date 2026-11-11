# 001 后端夹具漂移：已采用覆盖映射

候选根：`.scratch/maintenance-20261111/backend-candidate`。

本轮已采用 `tools/workbench/project.test.mjs`，问题状态由根代理同步；原候选目录保留过程证据，其余隔离源码未整体覆盖原仓库。

## 原10项失败

| 原意图 | 修后实际覆盖 | 保留的能力限制 |
| --- | --- | --- |
| scope→全阶段独立审核与handoff→complete | research/strategy/copy/references四阶段实际命令成功，独立评分、反方与裁定、handoff、不可变性及audit；草图通用request拒绝且状态不变 | 不再声称全链路complete |
| 导出文件／状态旗标不能替代layout渲染回执 | content_review专用route拒绝；layout/final_review通用request拒绝；历史native metadata带全4回执releaseReadiness、release和ack均拒绝；旧in-flight completion拒绝 | 当前无原生成功授权，不能合法抵达仅缺render的旧happy path |
| copy替换使freeze/layout/final失效 | 实际替换copy后已发布references stale，旧artifact/release仍保留，重新release旧版本拒绝；scope历史in-flight失效原测试保持 | 未生成的content/native阶段不能假装曾完成；其当前专用route拒绝另覆盖 |
| content review与可选sketch授权不得跳过 | sketch通用request拒绝；缺sketch的visual拒绝；content通用request拒绝；以references冒充sketch授权拒绝且无授权记录 | 未伪造有效sketch来取得授权成功 |
| late hard dissent使已完成链撤销 | 在实际已发布strategy/copy/references上增加late factual blocker，strategy回awaiting_release，copy/references不能继续使用，原review全量保留 | 不声称此前已完成原生终审 |
| 每条消费边均需两个owner | strategy已向content_review双边交接并发布仍不能给copy使用；copy producer单边仍拒绝，补consumer才可实际产生copy | 原消费边语义保留，无需走不可达visual |
| endpoint＋selected sketch精确授权 | endpoint=references后visual请求准确AUTHORIZATION_ENDPOINT；references选定gate必须实际human adopt；随后仍不能通用生成sketch | 专用sketch正向授权未由此测试证明；冒用reference授权由上项负向覆盖 |
| 四原始分均值与reference fit分离 | references四个5分不能替代reference fit；当前deriveSketchReviewOutcome通过均值4、拒绝未四舍五入3.999，保留所有四原始vote，输入不变 | 算法report seam不证明真实原件；只用每方向单候选切片，非生产生成fixture |
| 空reject未解决、单角色不能占四席 | 空strategy reject仍不能release；references实际四岗panel同actor跨岗拒绝且缺票release拒绝 | 复用当前同样四岗语义，未制造sketch provenance |
| panel评分前冻结、不能换人抬分 | references PANEL_REQUIRED、SELF_REVIEW、REVIEW_SEAT_REUSED、UNASSIGNED_REVIEWER、PANEL_FROZEN、SCORE_ALREADY_RECORDED全部保留；原3/3/3/3完整保留；当前算法另覆盖低均值拒绝 | references适配性门槛独立，本身不套草图均值门槛 |

## 新增负向合同

- 旧native metadata携带package/layout/import/render全回执仍不能release、ack或complete。
- 旧in-flight sketch/layout/final_review的通用complete-stage即使附completed和全回执仍拒绝，状态与产物集合不变。
- 当前草图评分算法缺任意有效原始vote或必要条件unknown，即便全5分仍blocked。

## 证据

- 原件复现：22 tests，12 pass，10 fail，全部首错REVIEWED_SKETCH_REQUIRED。
- 候选最终：`node --test tools/workbench/project.test.mjs`，26 tests，26 pass，0 fail/cancelled/skipped/todo；输出 `project-test-result.txt`。
- `mutation-results.json`：均值门槛放到3.999、通用sketch request放行、native release authority放行，三次目标测试各exit 1，证明拒绝/阈值断言有实际失效信号。修改仅在候选副本临时进行，finally恢复。恢复后再次26/26通过。
- 对候选tools与原tools进行SHA-256逐文件比较，仅project.test.mjs不同。
- 未联网、未启服务、未执行付费或旧run，未提交。

## 未解决范围

这些26项证明领域合同及拒绝边界，不能当作专用sketch/final visual/content/native layout完整集成验收。原生渲染、真实供应商、实际导出终审、应用接通继续由003及各模块原问题负责。
