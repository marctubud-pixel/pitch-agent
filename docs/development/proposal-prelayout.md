# 排版前比稿检查与通用输入映射

规范版本：1.0.0。排版前检查属于现有版式阶段，由比稿Agent检查简报、研究、策略、文案和成稿的衔接。它不是独立内容审阅阶段，不替代排版后的终审。

## 原件与当前性

`createQualifiedInputMapper`复用原COPY、r7、草图及B原件接收。程序配置必须提供真实store、固定数据库路径和dev/ino；实际打开文件的证明在读取前、读取内和消费时重核。HTTP字段、复制的对象或caller校验回调不能取得私有票。

通用输入保留五份完整原文、原文SHA和UTF-8定位、原图、明确视图、原有限制与待核性质。`buildGenericProposalDeck`只从完整输入推导自己的projection，不接受caller改过的展示提纲。原文中的事实、推断、待核和概念制造限制不得因排版消失；没有可核数据时不造统计图。

检查的稳定元组绑定任务原文、policy、实际数据库身份、方法、semantic、上游原文、B原source/plan/targets、图像、尚无检查报告的baseInput及其projection。revision和本检查自己的报告不进入该稳定元组，观察到的snapshot另存。这样检查自身入账不会假造一次上游改版。

## 专用原生协议

`createProposalPrelayoutNative`默认不执行模型。显式受限程序才可安排`stage=layout / purpose=proposal_prelayout_check`，使用原普通HTTP提供方、比稿负责人原方法和完整有序附件。`proposal-prelayout-v1`只授予这个精确目的的有限图片容量，不能借给其它任务。

原生queue绑定排队前revision；claim、原请求、实际claimOwner、原IO及CAS分别保存。完成分clear、return、unknown，来源失效保留stale。新问题必须定位原句、图片和所属岗位；已声明的待补与限制随稿，不重复制造同一个新增问题。

unknown不再派发。已有原HTTP结果仅由`reconcileOriginal`读取原件恢复，不换attempt或模型重发。检查报告及请求、原响应和回执按原字节保存；clear也不是业务批准。

`captureCheck`与`consumeCheck`通过私有票重核真实报告、稳定元组和当前snapshot。报告入账后旧snapshot的映射票不能自动升级，须新capture。只有当前原报告确为clear，mapper才返回`prelayout_original_checked`及非空报告；纯descriptor不具此资格。

## 页面只读范围

canonical完整项目中的原记录由`prelayoutReadScope`核对，流程与历史页折叠显示原状态和原报告。queue请求的expectedRevision须为非负安全整数，与原queue command一致，且等于原queue审计revision减一。queued、running、unknown、clear、stale和invalid分别保留，输入关系与报告状态分开表达。

这条只读通路的physical、execution、人类和终审权限始终为false。四份上游artifact描述只供本检查读取，不能替完整B生产job取得准入。完整B冷读、A历史读取及实际五源正例按各自工作包接线。

## 验证与交付边界

`npm run test:prelayout`运行明确列出的30项映射、私票、原生域和临时HTTP检查。当前Mac真实FD与原HTTP结果恢复已实测；不支持实际FD证明的平台只核明确拒绝，不冒称运行了该正向路径。其它普通HTTP附件测试继续实际运行。

组件fixture明确是合成metadata，构造的上游仍须被原生接收拒绝。便携测试、页面只读和封存组件通过，不等于同案B、通用Deck、终审、PowerPoint渲染或两案例整链通过。实际采用及原失败见[本轮核验](proposal-prelayout-verification-20261112.md)。
