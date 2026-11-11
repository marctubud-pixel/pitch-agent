> 规范归属与版本现由[规范基线](../specs/README.md)统一登记；本页用于定位实际实现，不将工具存在当作业务已接通。

# 终审阅读模式 · 2026-11-11

[终审页接续](../../output/qingyu-delivery-20261111/README.md)在活跃独立预览复用QingyuLayoutPreview，新增可选presentation联合类型，默认layout，delivery模式先Deck、再只读待审摘要与折叠比较、最后演练下载。原current/historical/unavailable输入校验、同源prepare及取消保护保持；无新增业务API或正式状态写入。

DeliveryStage精确分派青屿，原生案例内嵌实际Deck，比较默认折叠。ProposalArea仅将delivery人工面板后置，原actor、权限、expectedRevision保持。stageOwners仅显示终审为比稿Agent，不改保存的历史lead。旧静态入口恢复原字节，当前4417由独立Vite提供，正式apps与后台未接续。以下历史实现记录保留。

# 七阶段与青屿整案排版投影 · 2026-11-11

[本轮排版与UI复验](../../output/qingyu-layout-20261111/README.md)在原4415采用。`domain/proposal.ts`保留八个存储身份，新增七项`ACTIVE_STAGES`；前台导航、统计、待办、助手及本地新模拟使用活动序列，视觉直接进入layout。原审阅正文与意见只读保留在历史；旧主route替换到layout并清除旧审阅focus/version。四个旧写入口拒绝新增决定、意见、正文修改及意见处理；原数据不标done。

`proposal/qingyu-layout/preview.ts`复用主题依据resolver，核青屿项目、研究头、Brief及封存策略/文案/图像登记，输出current/historical/unavailable。`assemble.ts`以原研究9页、策略3页及当前三方向原句原图组装23页Deck；`QingyuLayoutPreview`用既有准备/下载取消保护将同Deck交给Viewer和导出器。`LayoutStage`仅对精确青屿且原layout为空时进入只读分支，其余原生方案及风格选择保持。

比稿Agent实际做排版前材料核对，既有缺口随稿保留，不另设前台审阅门槛；岗位见[比稿Agent](../agents/proposal-director.md)及[排版负责人](../agents/layout-owner.md)。本轮未新增生产HTTP API、业务状态写入或通用无人值守编排。原得闲后端和冻结源不迁移；排版后终审与在线编辑仍按实际权限和状态独立处理。

实际浏览器逐页、翻页、缩略、目录、键盘、全屏、两桌面宽与主题及下载核对完成。R4修当前未开始导航淡字，R5修全屏说明与新增方向副文分行；均有独立窄审、构建与实际复验。最终PPTX核23页、3原生图表及XLSX、三圈、原文和11件原图；未作PowerPoint原生渲染。以下是退役环节的历史实现与此前节点。

# 历史：内容审阅的固定模板与真实快照 · 2026-11-11

[内容审阅页](../../output/qingyu-content-review-20261110/README.md)新增通用 `content-review/model.ts` 与 `ContentReadthrough.tsx`，分别承载总体、原审、比稿摘要及实际问题、承接、叙事、原句配图和真实修改记录。青屿 `qingyu-content-review/preview.ts` 单独适配原审与比稿原件，继承主题的项目、头、Brief和R4守卫，并逐字比较实际策略、文案和视觉注册输入。

ContentReviewStage保留原正式编辑，青屿预览只匹配正式内容为空且阶段未开始。ProposalArea复用唯一Contributions与既有右栏，stageOwners更正旧保存岗位的显示，不修改业务对象。R2分离署名并补原句，R3只修本页grid间距和深色选中色。实际浏览器核验完成，无新业务HTTP接口或后台启动。当前三项未决，正式阶段、排版及PPT编辑保持原边界。以下为此前节点。

# 视觉页完整试稿投影 · 2026-11-10

[本轮UI与素材](../../output/qingyu-visual-ui-fill-20261110/README.md)新增qingyu-visual/concept-images.ts typed表，限定封存bundle/r2与n7,k4,v2集合，按方向绑定主图、三草图、整板样机。15PNG在public/visual-concepts/qingyu-20261110追加，旧六参考/原件/来源及只读resolver保持；并未构造正式VisualBranch或通过记录。

QingyuVisualPreview维持原方向/三视图和Modal；协作唯一挂载并前置，VisualOwnerInfo默认折叠。R2整板最大宽940px、缩略图aria-hidden，主图alt保留。ProposalArea只更正演示说明，权限、草稿、API及正式业务接线保持。生成身份、原件与提示词和前端实现采用分别记录。以下为此前实现。

# 视觉页面恢复原版式 · 2026-11-10

[原4415当前实现](../../output/qingyu-visual-layout-repair-20261110/README.md)恢复QingyuVisualPreview的主图与右侧评审、三样机图位及三纸页结构。PreviewWorkspace默认收起规范与协作，展开不再占主区列，唯一Contributions持续挂载；显式开关管理焦点。查询、resolver、身份、权限及正式阶段接线保持，未增加业务API。以下为此前实现记录。

# 青屿视觉流程与项目规范 · 2026-11-10

当前[视觉流程与页面](../../output/qingyu-visual-workflow-20261110/README.md)继续使用只读 QingyuVisualPreview。`eligibility.ts`供 VisualStage 与 ProposalArea 共用精确分支；`workflow-intake.ts`核对封存参考接续与既有文案/研究，状态仅为 collected-unreviewed 或 unverified，不产生正式视觉对象或通过结论。`workflow-record.ts`关联实际岗位接续包与规范身份。输入主区和侧栏由同一次 resolver 持有，保留历史、不可用和刷新异常。

ProposalArea 将唯一 Contributions 节点传入 VisualStage 的青屿预览，其他项目及已有正式视觉仍沿原路径；原 actor、expectedRevision、权限、草稿和整阶段 target 保持。当前 n7/k4/v2 不映射成正式视觉方向。三视图对照与空稿只读；原六包装图不改字节。

项目[视觉开发负责人](../agents/visual-owner.md)从[统一 Skill](../../skills/visual-development-lead/SKILL.md)读取阶段检查和任务附录，保存调用版本与授权。本次只有真实参考接续，未运行独立视觉评审、生成或完整后台编排。规范结构检查不能证明美学成立。以下旧实现和原生成身份保留。

# 模块与实现地图

最新[青屿实际包装参考](../../output/qingyu-packaging-references-20261110/README.md)在qingyu-visual新增静态类型清单，严格绑定文案包/r2/n7,k4,v2，复用原resolver和身份三态。只替换参考区域，未传part时默认process；所有正式视觉及后续图位沿用。五件原图public追加、两件r3原件复用，没有新业务API或存储写入。见[接续说明](../../output/qingyu-packaging-references-20261110/FRONTEND-HANDOFF.md)。

最新[青屿视觉布局预览](../../output/qingyu-visual-layout-20261110/README.md)由qingyu-visual/QingyuVisualPreview.tsx提供专用只读投影。VisualStage仅在精确青屿包装、正式主题和视觉均为空时进入；非空视觉及其他项目沿原组件。新CSS限定预览范围，复用原扇面、文件夹和左右结构。

数据直接消费现有文案resolver的封存当前轮，继续保护case/head/brief/R4与current/historical/unavailable及刷新错误。局部状态仅为浏览、参考卡和Modal；不构造VisualBranch、ArtSpec、分数或视觉版本。原n7/k4/v2不强转A/B/C。没有新增业务API或持久化写入。实际接续见[前端交接](../../output/qingyu-visual-layout-20261110/FRONTEND-HANDOFF.md)。以下为此前结构。

最新[青屿文案完整一轮](../../output/qingyu-copy-full-20261110/README.md)在qingyu-themes新增封存包与边界解析。原稿、四岗原评、对应对抗、追加复核及总监推荐分别绑定实际来源；复核经异议、方向、维度、原分和状态对应形成有类型投影，保留原始JSON。正文只读三卡及建议，三组详情默认关闭。数据身份为本地R1/R2两稿，不伪装为后台已自动编排。

preview继续复用既有case/head/brief/R4/当前策略保护和只读查询，历史/不可用/刷新错误行为保持。实际字节核对在本地构建与采用前完成，浏览器只验证包内对应和展示。原研究生成仍r6，策略仍用户认可的简洁三板块；无新业务API、状态写入或方向选定。实际接续见[前端交接](../../output/qingyu-copy-full-20261110/FRONTEND-HANDOFF.md)。以下为此前结构及其当时状态。

最新[三环策略图与文案初稿](../../output/strategy-rings-copy-20261110/README.md)由qingyu-strategy/intersection-page.ts在同套原生Node上构造第二页，Page.template增加strategy.venn身份，Draft及vendor未改。仍先按原顺序编译整三页再替换中页，首末页与页码不变。文字、圆和引线由既有SVG和PPT对象写出器消费，本轮没有实际PPT导出或编辑验收。

qingyu-themes/preview.ts绑定当前策略展示稿ID并复用既有只读依据resolver。QingyuThemesPreview.tsx接入ThemesStage的精确青屿包装/空文案分支，三套初稿、理由与备选可读，其他项目仍走原实现。未增加业务命令、状态写入、方向选定或Skill；正式编排仍待对接。以下为此前结构及采用记录。

当前[策略三板块](../../output/strategy-owner-simple-20261110/README.md)使用本地summary.ts固定三页，经现有compile和DeckStudioPage纵向显示；主题与研究一致，不扩共享模板、内核或导出接口。正文为研究结论、三维交叉点与发力点，页末统一依据与历史。preview.ts继续拥有case/head/brief/R4及当前、历史、不可用三态。

策略负责人按[基础岗位要求](../agents/strategy-owner.md)工作，当前方法导航不再要求策略Skill。此为项目岗位要求与独立前端的采用，正式业务自动编排尚未重接。旧r3/r2/r1、原研究身份和审查均保存，新展示稿不继承旧批准。以下策略方法与实现描述为历史节点。

当前[青屿策略第三版方法重推](../../output/qingyu-strategy-r3-20261110/README.md)已更新4415。`draft-r3.json`保存送审正文和七项判断，安全渲染段落、列表与比较表；`reviewed-strategy.md`及`reviewed-packet.json`绑定实际送审稿、账本和显示身份。三方独立中性首读后核完整依据，原角色复核v2并关闭STR-01。范围只到定位建设与优先验证，不是实际购买或正式业务批准。

`preview.ts`保持case/head/brief/R4字节及三态保护，只读原研究与任务卡。`ClaimRecord`分列原R4闭包、本轮用户虎跑泉设定与公开补查。外置身份和本地采用核验固定策略方法r3、原研究r6、输入清单、三角色原件及问题关闭；CURRENT仍是项目方法导航，未接正式后台自动执行。见[前端接续](../../output/qingyu-strategy-r3-20261110/FRONTEND-HANDOFF.md)。

以下策略r2/r1段落均为历史结构和当时身份。r2曾[被用户退回](../../output/qingyu-strategy-rejection-20261110/README.md)，旧稿、样图、文案及原审查保留，不构成当前认可。

当前[青屿策略r2](../../output/qingyu-strategy-r2-20261109/README.md)已实际使用[策略方法r2](../../output/strategy-independent-review-r2-20261109/README.md)重推并更新原4415。两个隔离角色先独立读稿，用户先冷读样例再核证；修改实际稿件后，两个新上下文复核同一02版。方法指针仍为项目导航，未接正式业务编排或改变研究/策略状态。

独立前端`src/proposal/qingyu-strategy`用单份`draft-r2.json`拥有页面实质文字和14条判断，`sample.svg`为同包冻结的原生矢量资源，分区引用而不重绘。JSON边界核引用与候选/机制/样例关系，纯resolver保留原case/head/brief、R4原字节守卫及current/historical/unavailable；页面只读原研究与任务卡两接口。外置identity由本地工具真实核回执字段、SHA与第一读，不冒称浏览器运行时密码核验。研究原生成r6与当前策略r2分列，旧[策略r1](../../output/qingyu-strategy-20261109/README.md)保留。见[前端边界](../../output/qingyu-strategy-r2-20261109/FRONTEND-HANDOFF.md)。

当前[版式工坊](../../output/deck-studio-integration-20261109/README.md)在研究和整案两个入口复用。独立前端`src/proposal/deck-studio`封装原DeckEngine 1.7.0，`templates.ts`检查受控模板与容量，`engine.ts`调用真实build并核图元及具名槽，`chart-layout.ts`准备共享图形坐标。`prepareResearchDeck`读原R4和R2，`prepareProposalDeck`读已有实际提案与风格，两者输出同一Deck/Page模型，供SVG及`exportDeckStudio`消费。导出使用原生PPTX对象与内嵌XLSX，未调用原包服务器、AI、字体下载或示例生成。

`QingyuStudioView.tsx`为默认五章九页阅读，完整证据和历史价后置；R1至R4继续可选。`LayoutStage.tsx`及`DeliveryArea.tsx`按本案每个风格准备实际Deck，未就绪项目不生成整案。`deck-studio-ui.tsx`管理上下文、取消及实际下载。原版本绑定、媒体SHA、权限与expectedRevision保持，模块不创建业务批准或阶段写入。[项目Skill r7采用](../../.scratch/deck-studio-integration-20261109/SKILL-ADOPTION.json)仅是模板输出规范，原R4/r6及R2/r3生成身份保持。源码和原入口实际身份见[前端接续](../../output/deck-studio-integration-20261109/FRONTEND-HANDOFF.md)。以下为此前实现记录。

当前青屿研究页默认[公开资料报告修订4](../../output/qingyu-research-r4-20261109/README.md)。`QingyuReportRevisions.tsx`保持原case/head/brief守卫，再选择R4及历史阅读版；非法R4不回落冒充正文。`report-r4.ts`解析五章六类图版与来源闭包；图表仅引用事实数值，竞争分组引用带依据的综合判断。四件原包装登记逐项继承R3，生成情境独立标识。`QingyuR4View.tsx`只读展示并收起完整依据；`pptx-r4.ts`按同源路径、签名和SHA核图后在浏览器生成原生PPTX，保留图表工作簿和完整备注，无新业务API或服务端生成放行。

[项目Skill r6采用](../../.scratch/qingyu-research-r4-20261109/SKILL-ADOPTION.json)为本轮人群/竞争实际研究的方法身份，源数据、实现清单与[原入口回执](../../.scratch/qingyu-research-r4-20261109/verification/LIVE-VERIFICATION.json)分别记录。正文/详情/排除材料先分流，竞争覆盖与清晰原图分开，四维综合不重复四段摘要；事实核验、模拟读者和原生呈现各自验收。项目Skill未全局安装或接正式业务编排，原R2/R3继续保留各自生成身份。下述是历史实现记录。

当前青屿采用[研究修订3](../../output/qingyu-research-r3-20261109/README.md)。`qingyu-report/report-r3.ts`在边界解析独立schema3：sources/facts/findings/gaps/media与五章内联blocks；数值只存Fact.quantity，模块引用事实ID。封闭当前四种证据身份，本地BRIEF不能冒充公开研究，产品媒体只接受原产品图。共享证据可达集跟进finding原子事实及派生依据；网页详情与PPT备注使用相同完整记录。

`QingyuReportRevisions.tsx`保留原binding拒绝与历史上下文，再显式切3/2/保存1；修订3错误不伪装回退。`QingyuR3View.tsx`呈现21个模块与底部唯一整报告下载，旧两版逐图控件移除，原数据/原件/导出历史不删。`pptx-r3.ts`用已装PptxGenJS生成原生图表/内嵌工作簿、独立文本形状表格与图片；全媒体同源/签名/SHA核齐，取消或上下文改变不交付。31页当前下载与逐页证据见交付记录。没有新增正式业务HTTP API、批准、job或存储写入。

[项目Skill r5采用](../../.scratch/qingyu-research-r3-20261109/SKILL-ADOPTION.json)为本轮真实资料重跑的方法身份，前端实现CB952…为独立实现身份；旧R2仍保留旧r3研究与r4图版来源，不能冒称新版本生成。源、采用、前端接续和未接能力见[交接说明](../../output/qingyu-research-r3-20261109/FRONTEND-HANDOFF.md)。以下保留历史实现记录。

此前青屿修订2通过[六张研究图版](../../output/qingyu-visual-boards-20261109/README.md)默认呈现。[ChapterBoards.tsx](../../.scratch/frontend-ui-optimization-20261108/source/proposal-workbench/src/proposal/qingyu-report/ChapterBoards.tsx)组织六类图形与资产身份，`QingyuR2View.tsx`把完整章节放进可展开详情。`board-export.ts`克隆实际SVG并核SHA内嵌图片，PNG固定1920×1080；SVG接收环境需要中文字体。生成场景为独立示意资产，不进入原八图证据清单。著作图版必要引用不足或集合超出支持范围时明确不可用，合法原分析仍可读。解析器、绑定、版本选择及业务接口未改。

项目[Skill r4采用记录](../../.scratch/qingyu-visual-boards-20261109/SKILL-ADOPTION.json)绑定八份文件，新增任务与证据匹配图形、结论先行、详情后置及图像身份随导出的合同。下述原r3采用身份仍是当前R2研究的生成依据，本轮r4只改变呈现规范。正式业务编排和全局安装仍未接入。

此前青屿研究页默认展示[公开资料报告修订2](../../output/qingyu-research-rerun-20261109/README.md)。`QingyuReportRevisions.tsx`在原绑定守卫之后选择新稿与保存的第1版，切换卸载抽屉，版本选择仅驻留组件状态。`content-r2.json`通过独立边界解析，规格、包装报价、图像身份和图表数值各自引用；未知价格不补零，历史价不冒认当前标价。六件茶包装与两件邻近品类分组，比例图明示0至100%轴。新稿损坏明确报错，不用旧稿冒充新稿。未写回保存的研究头、任务确认、批准或阶段状态。

项目[调研Skill采用身份](../../.scratch/qingyu-research-rerun-20261109/SKILL-ADOPTION.json)绑定七份实际文件。先按任务目的提出市场、人群、竞争、产品与载体作用问题，再并行资料检索、负责人综合、独立事实及读者复核。本次实际调用发生在开发调研过程，正式业务编排器没有因此接入Skill或新增API。

首版青屿包装案例的[结果模块](../../.scratch/frontend-ui-optimization-20261108/source/proposal-workbench/src/proposal/qingyu-report/QingyuReportView.tsx)保留为可选历史稿。固定五块为行业与市场、人群、竞品、产品本身、研究结论，先结果后图证，方法与核验默认折叠。单一 `content.json` 经过边界解析，图表数值引用datum及valuePath；`binding.ts` 严格绑定独立研究头和任务卡第1版，混读、同版范围变化与头更换拒绝正文，新简报仅提示历史状态。公开资料和原图不等于消费者实测，任务本身是虚构工程示例。见[首版界面与交付范围](../../output/package-results-workbench-20261109/README.md)。

`services/cases/installQingyu.ts` 在原normal库的各自锁内重读并增量安装独立示例，schema6/4保持；安装marker随原库保存，已装项目删除后不自动复活，占用身份不覆盖，empty场景不安装。两个存储key分别恢复，不保证跨key原子提交；无Web Locks的本地存储不安装。青屿无确认、评审、job或放行记录，正数coverage缺口阻止默认就绪。原用户数据、命令及露玛独立报告保留；没有新增正式后端API或研究编排器。

设计调研方法另有[可审阅Skill候选与三任务演练](../../output/design-research-skill-v2-20261109/README.md)。候选位于 `.scratch/design-research-skill-v2-20261109/candidate/design-research-lead`，分工来源底稿、事实/图像原件、独立读者及来源核验分别保存；独立演练页由该目录 `render-lab.py` 读取统一台账生成，R2.2增加实际可见的事实级定位，原版本保留。包装试稿内容已单独接入上面的结果模块，Skill本身尚未接业务编排或任何业务API，不覆盖已保存报告、Brief、审批或运行身份。

露玛研究页当前采用[具体案例报告模块](../../.scratch/frontend-ui-optimization-20261108/source/proposal-workbench/src/proposal/research-case/CaseSlot.tsx)。固定报告 `case-report:luma-uk-20261109-v1` 按行业与市场、人群细分、竞品分析、产品与包装、突破口五章组织，读取单一公开资料/数值/图片观察/分析前提账本，独立于原工程研究Artifact、Claim及审批。英国为明确的案例范围，原始简报不回写。公开来源详情不进入旧论点核验器；原检查条、方法视图和研究板在露玛的“既有研究与核验记录”内保留，青屿外的其他项目沿用原视图。

`research-case/binding.ts` 要求项目、历史简报快照及两份读取结果中的当前研究身份一致，也核对项目修订号；混合版本暂不展示，并可只读重新核对。新简报仅提示历史适用范围，不自动改正文。`report.ts` 校验来源、前提无环、单位与计算输入，每个SKU的单位价格必须用自己的标价与容量。参考图按原件SHA留存。正文和图表不触发模型、生成、业务写入或批准。具体研究结果、公开出处和本轮范围见[案例报告](../../output/luma-research-report-20261109/RESEARCH.md)及[界面核对](../../output/luma-research-report-20261109/review.html)。下述方法模块仍用于其他工程示例或历史查看，不能代表实际业务研究已执行。

研究阶段新增[方法与图表模块](../../.scratch/frontend-ui-optimization-20261108/source/proposal-workbench/src/proposal/research-method/ResearchMethodView.tsx)，读取现有 `ResearchWorkspace` 与 `getBriefHistory`，按报告 `basedOn.briefVersion` 选取历史任务条件，再形成三个视角与机会假设的只读投影。`Artifact.researchMethodPlan` 是可选的版本化问题记录，由现有本地 `createResearchVersion` 创建新报告时附带；不迁移旧数据，不表示真实智能体执行。有效的历史问题内容保持原版，当前简报只用于提示过期。`researchClaims` 集中完整ID优先匹配、当前报告归属与观察证据资格；来源缺失或核验过期不会升级为已证实观察。

图表使用带来源身份的可辨识联合类型及统一SVG/数据表，当前报告图与主动展开的9类独立工程示例分开。默认Luma的4/2仅为本地模拟走查记录统计，旧数值附件严格匹配原报告、简报及摘录，修改后不沿用。未知数值不按零绘图。`services/mock/i18n` 按计划绑定简报身份处理演示本地化，保留用户原文；现有版本、权限、核验和放行协议保持。见[研究方法约定](../workflows/研究方法与图表表达.md)及[本轮实际验证](../../output/research-method-charts-20261109/review.html)。这些变更仅在4415独立前端，真实研究/模型编排与正式业务API仍未接入。

品牌资料由可选 `Proposal.brandResources` 保存文件元数据和用途说明，原件由[独立仓库](../../.scratch/frontend-ui-optimization-20261108/source/proposal-workbench/src/services/proposal/BrandResourceRepository.ts)在浏览器IndexedDB按项目与文件复合键保存，提交完成后才返回成功，下载核对归属与SHA。新建页冻结文件句柄及元数据，在原工作台回执之后、提案JSON之前批量保存；未知首步结果保持锁定并复用原请求。任务页和资料库复用只读列表，服务写入沿用manage、下载沿用read策略。真实上传API、服务端文件存储及模型上下文读取仍未接入；[实际边界与验证](../../output/brand-resources-20261108/review.html)与旧业务原件分开。

任务卡编辑器当前统一新建、当前、历史与更新视图：项目名称后为手选提案类型，另有品牌或产品、背景、目标受众、交付内容；底部补充字段为调研问题和限制条件。新建页和补充字段的多行输入固定三行，项目任务卡主区固定五行并内部滚动。`TaskCardEditor.multilineBrand` 默认关闭，仅简报的当前、历史和材料更新视图开启，使品牌与背景同高。原13字段值和来源保留存储；可见决定字段由 `ACTIVE_TASK_FIELDS` 定义，隐藏待决来源不自动接受，也不作为确定目标供本地概览、助手及模拟器消费。项目内 `BriefEditor` 持有字段/类型草稿、保存、确认与版本审阅；负责人在未确认时使用“确认简报”，已确认后使用“更新简报”保存内联修改。未确认且有修改时，仅在保存返回真实回执后按该修订号确认。已确认修改仍审阅并保存为新的待确认版本。字段在命令期间禁用；查询和手动保留编辑仅采纳更高修订号，避免同版回填清空刚输入的内容。历史只读，材料更新固定初始 Brief、修订号及类型，避免随异步读取悄悄更新CAS基线。见[当前任务卡交付](../../output/taskcard-content-20261108/review.html)，此前展示见[项目页精简记录](../../output/project-page-refine-20261108/review.html)。

简报阶段通过 `BriefView.settings` 和 `supportingContent` 组合展示，`TaskCardEditor.moreContent` 仅保留单份品牌与参考资料，位于禁用字段集之外。模式草稿由稳定的 `BriefStage` 持有，当前卡仅显示自动/协作选项，既有确认阶段配置仍保留数据。`BriefVersionRecords` 复用 BriefHistory 读取实际版本与备注；新写入的 `editedBy/editedAt` 来自受保护命令，不以确认人或查看者补历史作者，空备注可按相邻保存版本的真实字段差异概括。`ProposalArea` 仍只有一个原有想法组件，与版本记录同处简报右栏，意见作者、阶段及稿件对象不变。

独立前端的 `Brief.proposalType` 为可选版本字段，当前类型由 `MockProposalService.sync` 投影，旧记录无此字段时保留原提案类型，历史缺值标为未记录。`BriefInput.editScope: 'task_card'` 在原有CAS命令内只更新可见字段，隐藏原始值和来源直接保留底层记录，避免本地化显示回写原文。未传此编辑范围的旧调用保持原完整保存语义。新建将同一手选类型传入初始Brief与提案创建回执；不增加独立类型写入或数据库迁移。上述合同及可见字段校验目前仅在独立本地模拟服务实现，正式接口仍需对接。

前端 `useNavigationBlocker` 可由调用方指定会替换编辑器的查询键；简报正文和更新候选监听 `version/intake`，其他调用保持仅路径保护。页内历史链接使用规范提案路由；浏览器历史项记录位置，取消离开时回到原位置，不覆盖目标历史项。实际回归、独立审查与使用限制见[简报阶段整合记录](../../output/brief-stage-refine-20261108/review.html)。

项目概览通过只读[摘要投影](../../.scratch/frontend-ui-optimization-20261108/source/proposal-workbench/src/proposal/projectDetails.ts)读取成功加载的当前 `Brief`，保留草稿/已确认与版本身份；已有任务卡中被清空的字段不回退旧提案摘要。只有成功读取但无当前任务卡时才回退原 `proposal.task`，其中范围与限制保持不同含义，不写回存储。项目页头展示已保存的本地汇报日期时间，并从团队已配置的比稿负责人角色显示确认人；不从在线状态猜测负责人，也不新增项目指派或服务端身份能力。

新建提案的选填汇报时间由独立前端的 `Proposal.presentationLocalTime` 保存，摘要透传到首页两处日期显示；值为不带时区的本地日历分钟，首页仅显示日期，旧日期键只读回退。原自由文本“时间安排”保持独立，schema 4 不升级或重置。创建页等待项目与提案两次保存后才跳转，部分保存重试复用首步回执。实际核对与其他文案建议见[本轮审阅](../../output/new-proposal-time/review.html)，不代表真实后端接口已接通。

人类成员、智能体岗位、在线状态及完成通知分别按[角色与协作需求](../workflows/人类角色与协作通知.md)和[领域词表](../../GLOSSARY.md)理解。2026-11-08已明确以人类比稿负责人为中心，并包含工作台使用者、人类视觉负责人、设计师和只读游客；右上角在线成员、统一角色权限及负责人站内完成通知已在[独立前端本地演示](../../.scratch/frontend-ui-optimization-20261108/source/proposal-workbench/docs/TEAM-COLLABORATION.md)实现；真实账号、跨设备同步、后台完成事件及外部消息尚未接入。

当前采用[中文桌面前端](../../.scratch/frontend-ui-optimization-20261108/source/proposal-workbench/docs/DESKTOP-CN.md)，结果见[交付与审阅](../../output/frontend-desktop-cn-20261108/README.md)。固定zh-CN，移除其他语言词典与手机分支；演示DB、项目、助手与设置使用独立存储键，保留旧记录。来源原始摘录继续参与原有核验，列表可折叠，核验详情仍完整展开；未改变后端API、阶段、审批或计费。

2026-11-08 前端体验优化在[独立源码](../../.scratch/frontend-ui-optimization-20261108/source/proposal-workbench/README.md)完成，当前界面规则见[新版规格](../../.scratch/frontend-ui-optimization-20261108/source/proposal-workbench/docs/EXPERIENCE-20261108.md)，入口与核对结果见[交付说明](../../output/frontend-ui-optimized-20261108/README.md)。该版继续使用原有服务边界和模拟数据，只调整阅读顺序、导航与响应布局；没有把工程case API接入正式前端，也没有恢复业务运行时。原定版、旧apps工程和业务根保持原位。

本轮新增模块为 src/collaboration（成员、能力表、权限包装、回执收件箱）、services/mock/transactions（共享存储事务）、proposal/contributionTargets 与 recordTargets（方向、稿件版号及历史定位）。原数据生成身份不变，未新增真实生产API。

本表是实现导航，不替代规格或运行状态。各行的测试只证明其声明的范围。完整验收入口在[开发状态](../../status/current.md)。

| 模块 | 输入与输出 | 上下游及实现入口 | 验证入口与限制 |
| --- | --- | --- | --- |
| 需求、任务卡、输入资料 | 文本、PDF、图片、链接；任务卡版本与明确确认 | [intake-runtime](../../tools/workbench/intake-runtime.mjs)、[intake-domain](../../tools/workbench/intake-domain.mjs)、[project](../../tools/workbench/project.mjs) → 调研 | [intake-recovery 测试](../../tools/workbench/intake-recovery.test.mjs)；不能自行补年龄或产品事实 |
| 调研与来源 | 同用途范围、专业资料及品牌和用户问题；来源、断言和缺口 | [research-acquisition](../../tools/workbench/research-acquisition.mjs)、[source-capture-store](../../tools/workbench/source-capture-store.mjs) → 核验 | [source-acquisition 测试](../../tools/workbench/source-acquisition.test.mjs)；合成来源不是真实市场调查 |
| 核验、修改、独立复核 | 断言、允许引用的结构化证据；支持状态、修订及复核回执 | [research-semantic-review](../../tools/workbench/research-semantic-review.mjs)、[research-readiness-split](../../tools/workbench/research-readiness-split.mjs) → 交接 | [research-operator-correction-source 测试](../../tools/workbench/research-operator-correction-source.test.mjs)；任务成功与研究通过分开 |
| 交接与策略 | 已核验资料及限制；策略原文、三圈交集、切口和结论 | [research-handoff](../../tools/workbench/research-handoff.mjs)、[handoff 测试](../../tools/workbench/handoff-runtime.test.mjs)、[strategy-contract](../../tools/workbench/strategy-contract.mjs) → 文案 | [strategy-contract 测试](../../tools/workbench/strategy-contract.test.mjs)；结论必须回答核心问题 |
| 主题与文案 | 策略与品牌、用户及传播边界；三个方向、主副文案和创意说明 | [creative-panel](../../tools/workbench/creative-panel.mjs)、[copy 目标合同](../../tools/workbench/copy-direction-target.mjs)、[local copy driver](../../tools/workbench/local-acceptance-copy-driver.mjs) → 视觉 | [copy-message 测试](../../tools/workbench/copy-message.test.mjs)；模拟评分不代表文案质量或客户批准 |
| 参考池 | 已确认文案、用户用途与同用途图库；候选、借鉴范围及评审档案 | [reference-dossier](../../tools/workbench/reference-dossier.mjs)、[V2 driver](../../tools/workbench/local-acceptance-reference-pool-driver.mjs)、[pool runtime](../../tools/workbench/local-reference-pool-runtime.mjs) → 草图 | [driver 测试](../../tools/workbench/local-acceptance-reference-pool-driver.test.mjs)；V2 完整人工采用与 129 节点评审尚未由本节点证明 |
| 草图、视觉及手板 | 文案主题、经评参考与原图；草图、选定稿、视觉稿和 mockup | [sketch-runtime](../../tools/workbench/sketch-runtime.mjs)、[sketch-review-v2](../../tools/workbench/sketch-review-v2.mjs)、[final-visual-runtime](../../tools/workbench/final-visual-runtime.mjs) → 全案内容 | [sketch review 测试](../../tools/workbench/sketch-review-original.test.mjs)；结构通过不等于美术或成稿通过 |
| 整案内容与措辞 | 策略、文案及视觉；冻结的可排版内容合同 | [complete-content](../../tools/workbench/complete-content.mjs)、[complete-content-runtime](../../tools/workbench/complete-content-runtime.mjs) → 排版 | [local content driver 测试](../../tools/workbench/local-acceptance-content-driver.test.mjs)；两案当前仍在本阶段 |
| 排版、编辑、导出 | 冻结内容、品牌参数、图片、图表；页面模型、版本及 PPTX | [layout-runtime](../../tools/workbench/layout-runtime.mjs)、[editable-proposal](../../tools/auto-layout/editable-proposal.mjs)、[受控导出](../../tools/auto-layout/controlled-export.mjs) | [编辑生命周期测试](../../tools/auto-layout/editable-lifecycle.test.mjs)；整案实际浏览器操作及指定版本完整导出仍待验收 |
| 全局终审 | 内容及实际布局、原件和导出检查；交付门禁与回执 | [final-review-runtime](../../tools/workbench/final-review-runtime.mjs)、[engineering panel](../../tools/workbench/local-engineering-panel.mjs) → 编辑交付 | [final-review-runtime 测试](../../tools/workbench/final-review-runtime.test.mjs)；工程终审不是审美认证 |
| 编排、恢复与人工节点 | 当前版本、配置、命令、决定与预算；下一动作及持久记录 | [executor](../../tools/workbench/executor.mjs)、[store](../../tools/workbench/store.mjs)、[coordinator](../../tools/workbench/local-acceptance-coordinator.mjs) | [coordinator 测试](../../tools/workbench/local-acceptance-coordinator.test.mjs)；未知调用不自动重试，偏好不升级事实 |
| 助手与前端适配 | 有限项目投影和服务 DTO；解释当前状态与来源 | [assistant-runtime](../../tools/workbench/assistant-runtime.mjs)、[assistant-projection](../../tools/workbench/assistant-projection.mjs)、[前端工程](../../apps/proposal-workbench/README.md) | [assistant-http 测试](../../tools/workbench/assistant-http.test.mjs)；通用前端最终联调仍未完成 |

## 数据与版本的实际关系

[store.mjs](../../tools/workbench/store.mjs) 用 SQLite 保存项目修订和当前 head，项目快照关联任务卡、产物、jobs、attempts、评审、人工决定与 audit。快照版本不是自然语言记忆。执行回执、来源和图片保留实际管理路径及哈希；读取原件的边界在 [managed-layout-bytes](../../tools/workbench/managed-layout-bytes.mjs) 和 [artifact-content](../../tools/workbench/artifact-content.mjs)。

[editable-proposal.mjs](../../tools/auto-layout/editable-proposal.mjs) 管理在线编辑文档及版本。编辑后的稿件保留来源并进入待复审状态。指定版本导出不等于重新获得上游批准。现有普通 API 见 [versioned-api-v1](../versioned-api-v1.md)，独立验收 HTTP 见 [server.mjs](../../tools/local-acceptance/server.mjs)，两者不应混当同一生产鉴权入口。

## 本轮路径对应

`apps/`、`tools/`、`output/`、`sites/`、`.data/`、`.scratch/`、`.audit/`、`tmp/` 全部保持原位。新增 `README.md`、`status/`、`docs/architecture/`、`docs/integrations/index.md` 及 `projects/README.md` 作为导航。未建立第二套项目数据库、证据库或 Memory 服务。

独立验收页的辅助参考输入由 [controller](../../tools/local-acceptance/reference-input-controller.mjs) 维护两步原图/用途登记及已提交待刷新状态，[DOM](../../tools/local-acceptance/reference-input-dom.mjs) 接入原页面 action/pending 协议。只在显式 V2 的收集前人工节点开放，未接撤回和用途纠正，未证明浏览器或完整参考采纳。

## 当前并发与迁移候选

本轮在线静态提案不以在线编辑验收为前置。当前运行源仍固定在0dc，不能将候选代码或隔离测试算作已在4494运行。

[R7 组合候选](../../.scratch/backend-release-r7/independent-review/VERDICT.json)在并发和正文读取候选上增加单次草图核验内的图片解码复用。每次引用仍重新读取和校验文件字节。该版本只验证了组合与空库启动；迁移候选不支持将当前已进入后续阶段的案例切换到此版本。

[并发候选](../../.scratch/bounded-execution/RUNTIME-HANDOFF.md)将任务分为父线程准备、独立worker计算和父线程集中提交。worker只读冻结输入并隔离原件，父线程统一领取、登记和完成任务；有依赖的对抗审查及总监节点不能提前执行。[实际双任务证据](../../.scratch/bounded-execution/native-batch-case995/RESULT.json)只证明同一案例历史快照上的原生批处理和隔离SQLite提交，不证明现场迁移或整个流程的提速。

[版本迁移候选](../../.scratch/fixture-migration-candidate/HANDOFF.md)保留历史origin与实际runtime身份，通过独占根、原件核验及一致备份接续同一案例。它尚未提升；[当前审查阻断](../../.scratch/fixture-migration-candidate/ROOT-REVIEW.json)要求证明未知HTTP记录不会在二次重开时被改写或重复执行。不能通过更新旧记录为“成功”绕开。

## 保存结果的只读发布

[独立publication](../../.scratch/static-publication/design.md)在原流程真实complete且closed之后获取同一数据根的原fixture lease，以只读事务打开project/workflow/drafts。它返回保存的阶段结果，不调用business inspect、模型或生成；任何POST明确暂缓。生成来源身份与发布实现SHA分别记录，当前采用文件不代表实际案例验收通过。

页面仍按保存的native plan坐标、字体、图片fit和来源图表呈现。只读准入把正文、资源、原生manifest和原layout anchor绑定；自洽修改正文hash、替换图片字体或填入无来源图表均会拒绝。已有模型质量和客户批准不会从本地工程状态推断。

R4 发布器另提供折叠的工程参考记录统计，数据来自同一案例的参考素材元数据。它位于原生提案之外，不表示市场或消费者数据。发布实现的固定身份和独立审查见[采用记录](../../.scratch/dexian-final-run/PUBLICATION-ADOPTION.json)。

[最终HTTP工具](../../.scratch/dexian-final-run/verify-static-complete.mjs)将验证原件资源、重复GET和同根重开；[产物收集器](../../.scratch/dexian-final-run/collect-static-delivery.py)核对静态PPT/PDF、页面图和文字。两工具当前只完成代码/早期准入检查，实际整案尚未执行，视觉溢出仍需实际页面检查。
