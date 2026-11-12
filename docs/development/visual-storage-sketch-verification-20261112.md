# 视觉本地存储与同快照只读接缝核验

基于已合并PR #13的main437ab4fa，采用已独立审查的A存储两源、四文件UI与草图桥r2。26份实现/既有fixture只在visualAProjection.ts一处三方合并；4个原小测试仅便携化import、读取同字节gzip并去除一个未用import，根原test:visual-workflow显式纳入。方法14文件、旧原件、数据库及回执未改；旧模块字节另保存本地。采用原逐件old/new SHA见[原记录](evidence/visual-storage-sketch-20261112/root-adoption.json)。

## 已核范围

- 后端storage-only在关闭模型时真实保存原图/用途；同body重放不新增版本，错字段/图片与advance_pending拒绝。原createReferenceMaterialStorage与完整runtime共用同一实现，不构造搜索或执行器。
- canonical项目GET附带当前同快照readback，历史不签当前资格；unknown严格只读。原错误image requestHash反例已由独立r2复验关闭，不能用外层hash重算伪装；[独立报告](evidence/visual-storage-sketch-20261112/sketch-r2-independent.md)只签metadata/原件拒绝与只读行为，未签真实9图/54报告。
- 根实际typecheck、20项受影响前端与16项新便携后端通过。首个前端命令因相对config与root叠加而未启动，原日志保留；修正绝对config后通过，不改生产规则。第二轮完整check结果见下文，准确head远程CI及PR最终结果另行登记。
- UI同212包装案、1280浅色/910深色、相同填充字段与原图：原版两保存disabled，候选两保存enabled；模型按钮始终disabled，0POST、无横溢，原图SHA与完整native project不变。实际8张前后/灰度图、20原则和限制见[UI报告](evidence/visual-storage-sketch-20261112/UI-REVIEW.md)，[独立UI代码复核](evidence/visual-storage-sketch-20261112/ui-independent.md)。GET-only页面复验不证明点击保存成功，18次实际原HTTP写入证据另保留本地。已知favicon404未冒充本次回归。

同一新包装案从185以18个预存原HTTP请求保存9PNG/9用途到212，原字节均核回。新真实physical/r7 capture与producer请求预检通过后，初始129已实际受限运行；数量、失败与最新保存点读取status/current及本地native原回执，不由本静态核验预签完成。旧choice_blocked负例、旧青屿23页及正式空layout/delivery保持原身份。

## 当前边界

本包未开启sketchAppSupported或referenceChoiceAppSupported，未签草图三纸页、实际9/54、B页面、整案Deck、排版前比稿检查、终审或包装/KV两整链。候选新草图及Deck工程组件另在隔离目录，工程样张和模拟评审不能签真实审美、消费者研究、人类或客户批准。

运行中的34161在启动时固定base437＋unit3-A2，源码采用后继续原缓存，不自动升级、不重启。其旧244闭包在新进程必须拒绝；不能重写原守卫或恢复旧token。后续模块在新root显式重基并重新核资格。原76572同样保持原运行身份。真实/付费模型、生产、旧run和在线PPT编辑保存继续暂停。

选入仓库的证据与未加工原SHA见[EVIDENCE-SOURCES](evidence/visual-storage-sketch-20261112/EVIDENCE-SOURCES.json)。原本地数据库、完整IO、失败及原图没有上传；摘要不替代它们。

## 在途完整快照读取

真实603原页可读但重复完整项目GET造成排队；实际映射离线成功，未用假输入改投影。窄修只共享同service中相同project/revision/current、locale/actor的在途Promise，完成后不缓存，每caller独立Snapshot；任何data-changed、语言/actor变更、主写起止或视觉提交前切断旧flight，自定义headers保守不共享，原失败传给各caller并可新读。0POST去重，不读取write journal作为只读前提。

[独立23项](evidence/visual-storage-sketch-20261112/snapshot-independent.md)和根40项受影响前端/typecheck通过；根31合流另有[独立8项及61规范检查](evidence/visual-storage-sketch-20261112/integration-independent.md)。同603原HTTP捕获的两桌面真实UI从20个完整项目GET降至2个，6方向视图/9PNG和原报告不变，0POST；仅签请求数与功能，未签速度倍数或新native当前性。详见[UI补充](evidence/visual-storage-sketch-20261112/UI-REVIEW.md)。

## 首轮完整检查与129历史读取预算

配置既有PDF/Pillow环境的首轮check停在前端：812通过、1既有skip，唯一失败是完整129历史图谱用例被默认5秒外层中断（6.322秒），不是断言差异；后续native/构建在这次未执行。原文件不改单跑5/5通过，共7.03秒。仅给该完整129历史读取设与现有完整129用例相同的30秒外层，原所有正文/断言、全局配置和生产期限不变；修后5/5，共7.27秒。[首轮原记录](evidence/visual-storage-sketch-20261112/root-full-first.txt)、[预算范围](evidence/visual-storage-sketch-20261112/history-test-budget.json)。第二轮完整输出已到生产构建结束：前端813通过、1既有skip，九组native共496通过、0失败或skip，规范、仓库、类型、依赖与构建通过。[第二轮原输出](evidence/visual-storage-sketch-20261112/root-full-second.txt)保留了每个步骤。终端会话结束后未取回单独exit字段，故不补造该字段；准确head远程CI继续实核。
