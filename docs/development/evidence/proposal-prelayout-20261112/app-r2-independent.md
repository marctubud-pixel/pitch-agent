# prelayout App readlane r2 独立窄修补审

结论：原 P2「nativeRequest.expectedRevision 未绑定真实 queue 审计」已关闭。本次无新增 P1/P2，给予 purpose-specific App 只读 metadata lane 的有限 GO。

固定对象：9 源组合 `4ee149c2a3a80572a9b39d8c01b567048dd30bf7b0be163b85dfe05c73002cfe`；作者 manifest `06c54f15b1932b5cb1a49816f6497c6c4fa1ea48125be05039a61cd82dcc8580`；REPORT `b6690b6c81a7d5ac90ab2c8f496cf5f8cfeb80da32b39b15d0c938e4707f159b`；单源 delta patch `dc887e96be9e0ad0116c19d8fd88111a0e68bdbfe8cb8138c74e7e34f5664ebc`。9 源聚合已重新计算；补丁在自有 r1 原源码副本实际零 fuzz apply，9 个 after SHA 全部相等。唯一生产差异是 `prelayoutReadback.ts`，其余 8 源含 UI 两组件原字节不变，见 identities/source-manifest/patch-proof。

原 native `proposal-prelayout-native/candidate-apply-check/tools/workbench/proposal-prelayout-domain.mjs` 的 queue 分支明确要求 nativeRequest.expectedRevision 等于排队前 p.revision。r2 在原 job/queue command.nativeRequest 同值、原 input/binding 对应及唯一 queue audit witness 之后，要求 expectedRevision 是非负 safeInteger，并与同 commandId/kind 的 queue 审计严格满足 audit.revision=expectedRevision+1；原 witness 继续限制 audit 不超过响应 head。没有改为当前 head，也没有重算原 source tuple/hash 去放行错记录。

- 原红测试字节不变，分别置于自有 app-r1/app 两份独立 shadow。r1 仍 accepted=true、same_inputs，断言红 exit1，见 r1-original-red.log/r1-original-red-observation.json；r2 对相同百万修订号攻击拒绝，原红转绿 exit0，见 r2-original-red.log/queue-revision-observation.json。原旧作者/独立红文件未动。
- 作者原 30＋新增 6 项，加旧独立 7 和本次独立 3 项，共 46/46、0 skip；另上述同字节原红 1/1 转绿。完整 own app/src strict typecheck exit0。
- 初始 queue 0/audit1 保留；实际冻结 fixtures 后续 running/unknown/clear/stale/invalid 的 head 推进仍可读，状态与原报告文本不变。新增 synthetic shifted-metadata 正控 pre=7/31、audit=8/32、responseHead=11/35 均通，前后近邻值均拒，证明不误绑响应 head。它们只验证关系边界，不是新 native run 事实。见 nonzero-revision-observation.json。
- job/原 command body 同时改百万值、负数、小数、字符串、null、undefined、NaN、Infinity、超 safeInteger、布尔值，及单侧 body 漂移、审计前后漂移/越 head 均拒。原少引用、错 SHA/pointer/quote、错 attempt/requestHash、伪 current/physical、人类/终审 flags 及额外 B producer/旧 visual purpose 反例仍拒。
- 默认真实 fetch 经 HttpWorkbenchService→HttpProposalService→parseSnapshot/mapProject 的六次随机 loopback 冷读，queued/unknown/clear 各合法与错误修订号两例，共 12 GET、0 POST，合法状态保留、错值拒。各 server finally 关闭。首次 tests.log 中 45 绿/1失败仅为沙箱 listen EPERM；获准使用自有 127.0.0.1 随机端口后原断言未改，tests-final.log 全部 46 绿，不访问固定服务。

UI 证据沿用具名旧独立 UI-REVIEW.md 与 ui/proof.json：真实 Chrome 两桌面 1440/1180、六状态共 12 视图，键盘 Enter/Space/aria-controls、焦点、单 root/h1/section、无横溢/重复 UI、原 report textContent 逐字核对。该旧实际 UI 范围与局限保持，不将其称为 r2 新截图；本次只动读取拒绝边界，实际 HTTP 已补审，未重画页面或签业务。旧证据中因原 P2 阻断的整包结论由本次该 P2 的实证关闭更新，其余 dark/移动端/长列表等未验范围不变。

保护结果：旧作者148、旧独立529、旧 native637（覆盖其21源）及新作者30文件，连同四份 manifest 共1348项前后 SHA/长度全同。旧 SQLite 只为冻结保护做原字节 hash，没有数据库连接；0 主/旧业务库、0 固定服务、0 模型、0 根/Git 写入。只写本独立目录及受控临时运行文件。见 protection-before/after/result。

范围仍严格只读：4个 source descriptors 不授 B production job 资格；完整含真实 B jobs 的 cold GET 桥仍未实现，未删 B jobs 造正例。physicalOriginalsVerified/executionEligible/humanApproval/finalReviewApproval 保持 false。没有 actual B、physical IO、native 执行、人类/客户/排版后终审批准。已冻结并停止写入。
