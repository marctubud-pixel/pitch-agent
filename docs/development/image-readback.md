# 图片原件只读核验

规范版本：1.0.1。本模块在一次原件核验内复用相同图片bytes的纯解码结果，减少重复启动解码进程。每次原件读取、SHA、来源和当前权限检查仍执行。它不保存业务批准、原件有效性凭证或模型结果，不改变参考129节点、草图v2的54节点和任何评分门槛。

## 模块与生命周期

`ordinary-model-project.mjs`的`verifyOrdinaryProject`及`verifyOrdinaryReferenceProject`各自开启一个`withReadOnlyImageVerification(callback)`。实现位于`model-http-authority.mjs`，AsyncLocalStorage及Map均为私有对象；调用者只能提供callback，不能注入缓存或伪造成功条目。

key包括本次freshly read bytes的SHA及长度、固定PNG/JPEG解码策略、Node路径、解码脚本路径、cwd和环境摘要。环境原值不写入条目或回执。只有成功的mediaType/width/height被复制并冻结；bytes、文件descriptor及整个核验结论都不缓存。

每次出现仍重新检查受限路径及文件稳定性、原图bytes/hash、ID/MIME/manifest、logical/runtime/wire/receipt、binding/上下文、累计图片数量/bytes/pixels和本次deadline/abort。不同上下文的预算在缓存外执行；相同解码结果不产生放宽预算的资格。源码及依赖沿仓库固定版本维护，固定解码策略改变时同步更新其identity，不能将此机制描述为运行中恶意热换可信代码的防御。

callback结束即关闭scope并清空。嵌套callback或reopen拒绝会清空本分支全部祖先；invoke关闭本分支及祖先，禁止缓存跨调用派发。并发兄弟拥有自己的Map。generation计数阻止拒绝前已经启动的解码在结束后重新填回旧缓存。invoke及它自己的post-dispatch reopen不使用只读缓存。

该优化不跨请求、claim、dispatch或complete复用核验结果，不使用mtime捷径，不跳过来源/问题/policy/人工关口。缓存命中只省一次相同bytes的纯解码，不等于复用了业务放行。

## 便携回归与环境

```sh
npm run test:image-scope
```

其中九项图片测试在新的微型fixture中生成真实PNG/JPEG，实际向本机合成HTTP invoke一次并保存原件，再无credential reopen；没有访问个人历史DB。观察真实解码进程及每次fresh IO，覆盖scope复用、跨操作/并发/关闭、late篡改、嵌套祖先撤销、兄弟隔离和pending generation。成功清理本test夹具；失败保留并打印路径。它们不是速度benchmark，也不能替代所有业务门禁。

当前`python3`必须提供Pillow；缺少时测试明确失败，不静默skip。已有配置好的PDF测试venv可复用其Pillow，让固定解码器的`python3`使用该环境：

```sh
PATH="$(dirname "$PITCH_PDF_TEST_PYTHON"):$PATH" npm run test:image-scope
```

配置现有venv及固定依赖的方法见[本地解析](brief-extraction.md)。Application CI在已安装该venv后以同样PATH执行；没有修改生产解码器的Python选择逻辑。根`check`包含该测试，完整运行前需满足此环境条件。

## 上下文比较的纯谓词

同一工作包另将ordinarySameContext中的两个HTTP context标签比较前置。只有确定namespace/invocationId相同才继续原ordinarySuccess双方完整验证；不同context原本就返回false，不再先解析其正文。matching坏票、null/缺context、mixed/legacy分支的结果保持；没有新增缓存或减少原票/原件核验。六项纯metadata回归同时纳入test:image-scope，覆盖实际parse次数、matching完整校验及bounded depth；不访问历史DB或网络。

## 实际证据及限制

原同revision398的两份真实含图票，原实现6次解码/34次open，修后3次解码/34次open；完整原件微路径66→9次解码、720次open保持。它们仅证明减少重复解码，不能推算端到端加速比例或模型耗时。旧案/原DB与原IO没有为性能诊断改写。

首候选嵌套scope可跨invoke保留祖先缓存，独立实际反例失败，原候选和报告保留。r2增加祖先失效及pending generation后，同一独立反例与便携回归通过。根最初采用图片scope后的九项便携测试及52项邻接HTTP authority/security/JSON-profile全部通过；加入纯谓词后的根组合检查15项便携+55项邻接全部退出0、零skip，见[实际根输出](evidence/image-readback-20261112/root-combined-final.txt)。候选完整业务变化/unknown只读反例与根测试分别留证，不互相代签。

固定历史565的完整projectView派生output SHA保持相同，完整JSON parse计数345638→7088，35次prefix/1750次票验证/700次生产输入重建保持。独立5184组纯数据pairs结果及异常等值，matching坏HTTP仍拒绝；这不是端到端速度比例。根新加bounded测试首次误把重复key检查归给纯claim函数，原失败保留；改用其实际负责的深度上限反例，生产逻辑未因此修改。

来源、失败、独立复验和根采用身份见[证据清单](evidence/image-readback-20261112/EVIDENCE-SOURCES.json)。固定80858680的[最终规范审查](evidence/image-readback-20261112/final-standards.txt)与[最终规格审查](evidence/image-readback-20261112/final-spec.txt)没有未关闭P1/P2。准确head的[两项CI](evidence/image-readback-20261112/pr10-final-ci.json)和[实际应用步骤](evidence/image-readback-20261112/pr10-final-job.json)全部成功，[PR #10](https://github.com/marctubud-pixel/pitch-agent/pull/10)已正常合并为a5c6ee5b，[合并回执](evidence/image-readback-20261112/pr10-merge.json)保留。

视觉A、视觉B、Deck及完整交付仍是其他工作包；上述审查和CI不替它们签通过。
