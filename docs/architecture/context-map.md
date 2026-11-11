# Memory 与上下文的实际入口

本项目没有因本轮整理新增向量 Memory、独立记忆数据库或自动偏好学习系统。自然语言摘要是索引，事实核验、人工批准与恢复以原生记录为准。

| 信息类型 | 当前保存位置 | 使用与纠正方式 |
| --- | --- | --- |
| 开发约定及长期业务决定 | [AGENTS](../../AGENTS.md)、[开发说明](../../多线调研工作台_开发说明_v0.3.md)、[workflows](../workflows/) | 已确认决定沿用；新决定更新原规范，旧讨论保留来源和时间 |
| 用户偏好与历史审美校准 | [evaluation 规则](../evaluation/)、[历史评分报告](../../output/evaluation/)及各项目人工记录 | 仅适用已确认范围；本轮未同步或重评 Eagle；不能升格为市场事实 |
| 项目与任务状态 | [store](../../tools/workbench/store.mjs) 的任务卡、修订、head、jobs、attempts、评审、决定、audit | 由原生命令和版本控制更新；上游变更触发下游失效，历史不覆盖 |
| 单次执行和恢复上下文 | 实际 executionRoot、运行 metadata、锁及回执；[当前索引](../../.scratch/end-to-end-local-20261102/ACTIVE-RUNS.json) | 当前 PID 或句柄必须重新观察；状态文件本身不证明任务活跃；未知结果先对账 |
| 经验证经验和局限 | 单次测试、失败及独立审查原件；[当前检查点](../../.scratch/end-to-end-local-20261102/CHECKPOINT.md) | 按实际验证范围引用，不把单元测试扩成整体验收 |

## 按任务读取上下文

开发恢复先读 [status/current](../../status/current.md)、当前检查点及相关模块地图。修改具体模块时再读该模块源码、测试及适用规则，不必重复装入全部历史讨论。

业务输入的实际组装在 [artifact-content](../../tools/workbench/artifact-content.mjs)、[owner-edge](../../tools/workbench/owner-edge.mjs)、[creative-panel](../../tools/workbench/creative-panel.mjs) 和各阶段协议中。完整原文、输入版本和限制随合同传递，不能只传摘要。助手的有限投影在 [assistant-projection](../../tools/workbench/assistant-projection.mjs)，受 [store read admission](../../tools/workbench/store.mjs) 的读取限制约束。

参考评审的首读、评分、对抗及总监阶段见 [reference-review](../../tools/workbench/reference-review.mjs)。隔离范围按 packet 协议执行，不能为复用上下文让盲评者读取作者推荐或其他裁判分数。本地合成响应不证明真实模型隔离或审美能力。

这里只建立读取入口，没有测量 Token 节省幅度。全局 Memory 的检索、偏好合并、过期和权限管理仍需另行设计与验收。
