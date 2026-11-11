# 生成可编辑提案

在项目根目录运行本地工作台。

```sh
RUNTIME_NODE_MODULES=/Users/marc/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules /Users/marc/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node tools/auto-layout/server.mjs
```

打开 http://127.0.0.1:4180 。选择风格，编辑标题、正文或提案配色，点击生成。完成后翻页预览并下载。旧版本保存在版本选择器与 runs 目录中，不进入提案正文。

品牌配色修改只影响提案版面。已有海报、案例图片和研究内容不会被换品牌或重绘。完整海报的主题字保留在图片里，PPT可整体替换图片，不能逐字编辑海报内部字体。

## 从结构化内容生成

```sh
RUNTIME_NODE_MODULES=/Users/marc/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules /Users/marc/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node tools/auto-layout/index.mjs \
  --ledger output/ppt/m6-integrated-v5/content-ledger.json \
  --brand output/auto-layout/inputs/brand.json \
  --assets output/auto-layout/inputs/assets.json \
  --style editorial \
  --output output/auto-layout/runs/my-edition
```

每次指定新的输出目录，程序拒绝覆盖已完成文件。`--plan-only` 仅验证与规划，不导出PPT。可选风格为 `editorial`、`stage`、`evidence`。

输入范例在 `output/auto-layout/inputs`。素材路径相对于清单文件，品牌字体必须可读取。图片按实际尺寸校验，海报和证据图保留完整比例。案例超过页容量会拆页，无法容纳的长段落明确报错，不删文或无限缩小字号。

首版界面使用梦之蓝案例的固定资产及证据集合。其他项目可通过命令行输入同格式台账、品牌配置和资产清单；自由Brief转换、拖拽导入新素材及任意页型尚未接入此界面。现有艺术方向采用 A、B、C 约定。

仅验证排版而不包含用户研究时，`audience.findings` 可为空数组。引用不存在的证据仍会报错。艺术图片的备注沿用清单中的真实来源，不再统一标记为AI稿。跨案例重构记录见 `output/auto-layout/crosscase/README.md`；这是用户提供的歪马包装方案页面重排，不是新Brief的完整研究与创作验收。

## 复验

```sh
/Users/marc/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node tools/auto-layout/test.mjs
/Users/marc/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node tools/auto-layout/regression.test.mjs
bash tools/auto-layout/native-check.sh \
  output/auto-layout/runs/editorial-r3/delivery/deck.pptx output/auto-layout/native/new-check \
  --brand output/auto-layout/inputs/brand.json \
  --layout output/auto-layout/runs/editorial-r3/layout-manifest.json \
  --validation output/auto-layout/runs/editorial-r3/build/validation.json
```

前两项核验布局行为和已修复缺陷。第三项要求全新输出目录及明确品牌、排版清单、最终校验回执。设置 `NATIVE_CHECK_AUTHOR_TASK_ID` 为实际作者任务身份。脚本快照并核对最终PPT、品牌、字体与资源，转换PDF，保留每个实际PDF页的1600像素完整页图。`verification.json` 分开记录 `sourceContractPassed`、`fontResourcesPassed`、`textCheckPassed`、`fontCheckPassed`。`automationPassed` 只表示自动义务通过。`passed` 始终为false，交付保持pending或blocked。字体检查不能证明文字可见或最终交付通过。

`review-manifest.json` 固定实际PPT/PDF/自动报告、全部输入、渲染器版本、每页尺寸、比例、图像哈希、必要文字、工作量与预算。默认最多100页及8000万像素，超预算保持incomplete，不降分辨率或跳页。不再使用手写PDF绘制几何判断认证可见性，也未将实验性像素贡献诊断提升为通用字形证明。字体、内容和原生结构故障仍阻断；ExtGState Font等无法解析的活跃字体状态明确失败。裁剪、遮挡、白底白字及错字形必须由独立审阅者检查实际保留页图。

独立审阅者应逐页调用 `view_image` 查看清单绑定的准确图像，对照 `requiredRuns`，必要时放大疑处，记录缺失、截断、重叠、隐藏、错字形或难以辨认。实际观察到的必要文字缺陷阻断交付。每页观察包含page、imageSha256、checkedRequiredRuns、status、observations、defects及viewImageEvidence，后者绑定实际调用ID、准确图路径和保留的调用证据文件哈希。记录顶层包含 `schemaVersion: native-render-observations.v1`、manifestSha256、pdfSha256、reviewerTaskId、`scope: internal-render-observation` 与 pages。

`native-render-review.py record --out <目录> --observations <记录>` 核对全部绑定、身份声明、逐页覆盖及证据文件。作者不能登记自己的独立审阅。未知、缺失、旧记录及错页不能通过。此独立CLI只保存 `unsigned-local-record-unverified`，不能认证传入身份或赋予项目批准权；即使观察全部为observed_pass也保持pending和passed=false。根协调器须核对独立agent实际工具调用及准确页图。本单元未实现正式工作台可信评审接入，不冒充客户批准、消费者研究、PowerPoint实机检查或完整PPT交付。历史报告原样保留。

## 场景应用

当前样本提供一个生成的户外正面灯箱场景，海报保持独立图片层。清单按 `purpose` 和 `aperture` 匹配用途及比例，错误匹配会阻止输出。灯箱采用浅色衬边，未模拟玻璃反射。其他正面屏幕可按同格式增加资产。透视投影、复杂遮挡、包装3D与多材质渲染尚未实现，不能把平面开窗视作完整三维mockup引擎。

## 参考与开发记录

- 六份PDF的516页索引在 `output/auto-layout/research/pdf/index.html`。覆盖全页缩略图与6张单页大图，未逐页测量字号或校对事实。
- 16张静态参考复核与动态抽帧记录在 `output/auto-layout/research/templates`。动态只用于静态结构观察，本版不含动画。
- 架构候选、交叉评审及合同在 `output/auto-layout/design`。
- 审查与验证在 `output/auto-layout/checks`，决策记录在 `.audit/auto-layout.tsv`。

本轮使用pstack的poteto-mode、figure-it-out、how、architect/arena、swarm和独立复审。Build the Lever落实为可重复运行的生成器；Model the Domain落实为输入与元素类型合同；Prove It Works落实为实际PPT、网页生成与兼容渲染验收。没有调用PPT Master自动美化工作流。
