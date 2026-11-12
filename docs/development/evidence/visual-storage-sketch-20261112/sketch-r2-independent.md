# 独立Spec复验：sketch bridge r2

结论：原P2已关闭。本次三源窄增量及实跑范围没有新增可证P1/P2，可进入根集成审查；不是实际九图/54票或UI/业务通过。

审查对象：r2完整patch `ca1fadfd57019d0bc220de9ebfd26080adf6406097cc21f1b991dfad2fd564d7`，r1→r2 delta `fed6fcffd47a2cb473a169738597e22009dc81e5fe9512747df61d3d08a4af9a`；source summary实际重算为 `4cdc1c67256243d776c1d2a9a9738381d6a90c2919ced172de2c17096a632786`。固定base5ed，gzip仍46033B/SHA `a7432098d0ff26a4ed41886479949bcdf664a8d973ed362bea5f50546d00df40`。

## 原红反例闭合

复用我r1原始 `independent-spec/attempt-hash-counterexample.mjs`，只把候选import指向r2，并将输出留在本目录；原“必须拒绝”的断言、原task/job/attempt、正确hash计算及全0错误hash均没有改为接受。原正确请求仍得到unresolved；全0错误请求现在抛 `SKETCH_READ_GRAPH_CHANGED`。本次脚本exit0，`attempt-hash-observation.json` 为 accepted:false。r1旧红脚本、观察和日志保持原样。

另复用原独立浏览器4项测试和fixture，在新的隔离app仅覆盖精确r2候选源码。原来“改错requestHash后，重算snapshot/admission/jobs/attempts全部摘要，应拒绝”的断言现在通过，jobs.size为0；合法准确hash仍为12个只读unresolved jobs。没有降低外层摘要或把未知状态改成queued来获得通过。

## 代码与相关结构

实际r1→r2仅3源改变：native sketch-read-graph、browser sketch-contracts/inspect及sketchReadback.test。其余18个候选源包括native reader/private readAdmission/HTTP接线、正向原件入口、其他U2生成/评审/成稿规则与gzip均字节不变。

native和browser unknown图片分支现在都按原native claim-sketch-job同一个 imageTask(p,g,j,attempt.id)，递归排序stable后做同构SHA。校验精确请求、candidate、job、attempt及原allowance；没有全0/f黑名单或任意新digest白名单。

review未知分支继续原buildReviewRequest完整任务匹配；若已有retained receipt，inputPacketHash绑定本attempt.id、冻结model和**canonical重建的request**。caller仅重排对象键而语义不变时保留原正确hash可读，按caller键顺序另造hash仍拒，换请求同样拒。没有receipt时没有补造回执/批准。

正确unknown继续原status、attempt与dispatch记录，readonly/writeEligible/physicalIOVerified/appCapabilityGranted均false。原strict U2仍拒unknown；本修复不授IO、恢复、重试、推进或采用。真实native current-source资格仍由原native guards承担，不由浏览器摘要自签。

## 本次独立实跑

- `original-counterexample-now-refused.log`＋`attempt-hash-observation.json`：原native红案例转为正确拒绝，正确hash正例保留，0业务执行。
- `native13.log`：13/13，0skip。含原小库/private admission/并发snapshot与semantic/冷GET unsupported，以及新准确hash、0/f、跨candidate、换attempt、canonical review retained hash、caller重排与错误hash/request拒。
- `frontend11.log`：11/11。r2原接线7项＋原独立4项。包括冷12生产/54注册review metadata、production/review未知只读、原strict U2拒unknown、caller valid/physical flag不能升级、重算全部传输摘要仍拒原错误请求。
- 未重跑未变A/COPY/Brief全邻接、完整typecheck/build或UI；作者的其他绿色没有计入本独立实跑。

FREEZE30项、候选21源、root986个原source pins逐SHA前后不变。source summary独立重算一致；r1 FREEZE及原独立manifest不变。`before.json`/`after.json`保存身份保护。只写本目录和测试自有小库；未打开主DB、启动固定服务/上游/模型、改根或Git。

未验范围保持：真实九图/54票业务执行、native qualified/unresolved完整业务正例、实际reviewed artifact原文件、B、完整App和真实Chrome/UI。此次11个前端正例是明确transport metadata，不能当实际业务资格。原129负例及业务门槛没有变化。

## 复跑入口

仓库根：

```
node --experimental-loader ./.scratch/seven-stage-static-goal-20261111/design/sketch-app-root-bridge/r2/loader.mjs .scratch/seven-stage-static-goal-20261111/design/sketch-app-root-bridge/independent-spec-r2/original-attempt-hash-counterexample.mjs
npm --prefix .scratch/seven-stage-static-goal-20261111/design/sketch-app-root-bridge/independent-spec-r2/app test -- --config vitest.config.mjs --no-cache src/services/http/sketchReadback.test.ts src/services/http/sketchSpec.test.ts
```

loader仍要求固定root source pins；后续根采用其他已审源码须明确新before/after，不能绕开漂移拒绝或让旧结果冒充新源验证。
