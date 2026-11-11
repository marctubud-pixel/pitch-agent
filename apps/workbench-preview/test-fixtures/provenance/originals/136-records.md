# 记录与检查接口

## 原生记录

每次调用保存任务 ID/父级 ID、负责人、范围与输入版本、Skill 实际路径/版本/内容哈希、任务目的、授权来源及终点、模式和人工节点、完成条件、失败退回位置、轮次与预算。实际执行模型和费用可知即记；不可核费用记 unknown。预算单位须明确，操作次数与金额不能混用。

保留六类原件。任务与授权、搜索与借鉴、阶段产物及版本、评审与问题、选择与修改、交付与未决项。图像另存版本及 SHA-256，原图字节、图源、采集时间和借鉴边界保留。问题按 ID 记录阶段、位置、证据、影响、验收条件及处理。采用、用户指定采用、已修改、已复核分别有实际记录才成立。上游改变后保留旧记录，标待复核，补当前票后再交接。

建议每个执行者使用独立目录，由负责人合并。身份、授权及轮次来自可信任务记录或本地封存来源；手填 ID 或 pass 布尔值不构成权限或审美证明。

## 检查器的边界

`node scripts/check-stage.mjs <work-package.json>` 只读，路径相对工作包位置解析，可使用绝对路径。标准输出只有 `{decision, reasons}`。返回码 0 表示 `record_only`、`component_use_only` 或 `eligible_for_requested_transition`，其他决定返回码 1。其他决定为 `re_review`、`cannot_assess`、`awaiting_confirmation`、`pause`、`reject`、`revise`。它们是本地证据与流程结构判断，不是业务数据库状态、实际执行或美学结论。

`loadEvidence(input, baseDirectory)` 读取文件、核 SHA-256，将 JSON 原件放进 `documents` Map，将产物放进 `artifacts` Map，并返回 errors。`evaluateStage(input, evidence)` 是纯判定，不读磁盘。只有通过前者获得的即时证据快照才用于外部输入；不要把调用者自行构造的 Map 当核验。快照之后的文件变化须重新读取，纯判定不会追踪磁盘变化。

实际非 intake 图对象及参考卡需 PNG/JPEG/GIF/WebP 字节签名和哈希。签名检测不证明文件完整可渲染，更不证明已看图；裁判仍需实际打开原图，不能以路径存在替代审美评审。其他格式先由负责人保留原件并提供可核查看副本，不静默当已查看。原票必须是可核的本地 JSON 原件，当前脚本不访问远程 URL、不验证数字签名或人的身份、不作为正式权限控制器。

## 工作包字段

所有指针形状为 `{path, sha256}`，哈希是小写十六进制 SHA-256。JSON 原件的哈希按保存字节计算。下面是协议字段说明，合成测试只用于规则验证，不是青屿当前稿评分。

| 字段 | 内容 |
| --- | --- |
| skillVersion | 当前为 `1.0.0` |
| task | `id, scopeVersion, inputVersion, requiresNode, creatorIds[]` |
| currentInput | 可信当前输入原件指针 |
| authorization | 可信授权原件指针 |
| stage | `reference_intake, reference_review, sketch_review, refine_review, overall_review` |
| action | `record, advance, revise` |
| nextStage | record/revise 为原阶段；advance 为阶段序列下一项，overall_review 后为 delivery |
| revisionsUsed | 当前方向/阶段已完成的修改次数，取封存检查点；初稿为 0，上限由授权给定且不超过 3 |
| budgetSpent / budgetUnit | 同一可信检查点的实际支出/单位，不凭空估计 |
| object | `id, version, kind, task, file`，file 为实际被审产物指针 |
| reviews | 原票指针数组，非 intake 必须四岗评分、四对应对抗、一个独立裁定，共九件 |
| confirmation | 配置人工节点时，明确人工决定的原件指针 |
| referenceSet | 参考方向冻结集，见下文；只有 component 的集合不能准入整方向 |

`object.kind` 为 `component`、`direction` 或 `artwork`；intake 可用 intake 自身类型。脚本的 component 固定必评模板仅支持 `componentUse: material` 或 `color`，其他局部用途先由独立岗位明确必评项，不能套此模板自动减项。参考 direction 另有 `translation, comparison, innovationHypothesis`，均为可核的用途卡内容，不能把假设写成已兑现。`object.task` 必须与当前输入的 reviewTask 一致。intake 的 file 为实际候选/缺口 JSON 清单，action 只能 record；可以如实记 unknown 费用并封存，不因此授权后续工作。

当前输入原件至少包含 `taskId, scopeVersion, inputVersion, reviewTask, requiresNode, creatorIds[]`。授权原件至少包含相同三项身份、`currentInputSha256, allowedStages[], mode, humanNodes[], revisionLimit, budget`。授权与原票绑定当前输入字节，即使版本标签忘了更新，字节改变仍待复核。mode 是 automatic 或 assisted，人工节点两种模式均生效。

已知预算为 `{status:"known", limit, unit}`，limit 和 budgetSpent 是非负有限数；未知为 `{status:"unknown"}`。未知预算只允许封存 record，继续工作需有明确边界。达到限次可交接已达标的第三次修改稿，不能请求第四次。超支停止，不用更低标准凑通过。

## 原票协议

九件原件均包含 `taskId, scopeVersion, inputVersion, currentInputSha256, skillVersion, stage, objectId, objectVersion, artifactSha256, objectSha256, task, reviewerId, kind, observation, unknowns[], hardIssues[]`。task 是实际被审用途，observation 是看实际图得到的位置/现象，不是泛泛“通过”。objectSha256 是 Node 对完整 object 执行 `createHash('sha256').update(JSON.stringify(object)).digest('hex')` 的值，绑定用途卡与图对象。改图片、改对象版本、改用途卡、改输入、改阶段后原票失配，不自动继承。评审真正独立与身份真实仍须可信来源；脚本只核声明身份之间无重复、无创作者混入。

- score 原件有 role，固定为 visual/brand/user/spread。草图及成稿有整数整体 score，1–5；四票均分未舍入。参考有两件 `dimensions[{name,status,score,evidence}]`，固定本职维度见[阶段规则](stage-review.md)。rated 为整数 1–5，5 另有 comparisonEvidence；unknown 或 not_applicable 分数为 null，理由写 evidence。仅 component 的 spread 另有 `boundary:"boundary_clear", boundaryEvidence`。
- challenge 原件有对应 role、`findings[]`，没有 score。每件 finding 为 `{id, rule, location, observation, impact, acceptance}`，先独立写问题再核断言。
- adjudication 原件有 `criticalChecks`，theme/brand/node/comprehension 各为 `{status,evidence}`。status 为 supported/contradicted/unknown，node 在 requiresNode=false 时可 not_applicable；仅材质/配色 component 的 theme/node 也可有理由地 not_applicable，不能要求辅助图独自承担整案主题与节点。`resolutions[{issueId,ruling,evidence,acceptance}]` 按每个 finding 原 ID 采纳 accept 或驳回 reject。空数组仅表示没有 findings，不能删除已有问题。已证硬伤不因裁定者想放行而豁免。

unknowns 中每件为 `{id, critical, missing}`；hardIssues 中每件为 `{id, rule, location, observation}`，只放有可见证据成立的硬伤，所有此类项阻断。尚有争议的问题放 findings 并由独立裁定说明证据，关键证据无法确认时放 critical unknown。必要条件矛盾及有证硬伤优先于高分；已知缺用途卡先补卡，外部关键证据看不到则待核。

单卡 direction 的 record 可先封存自身原票；只有 advance 才需完整组合。参考冻结集为 `{mainId, cards:[{id, kind, file, use, prohibited}]}`。主卡必须是 direction，所有卡须可查看且边界明确。整组评审的实际图对象应能呈现完整方案关系，不只交一张辅助材质。adjudication 另有 bundleCoverage 和 styleCompatibility 的具体证据，以及 `referenceSetSha256`，该值为 Node `createHash('sha256').update(JSON.stringify(referenceSet)).digest('hex')`。这绑定完整集的顺序/用途/来源与本轮原裁定；源集合变化需重新审，不允许靠全 component 拼出整组通过。

人工确认原件包含 `taskId, scopeVersion, inputVersion, currentInputSha256, artifactSha256, objectVersion, stage, nextStage, decision:"confirm", humanId, recordedAt`。普通意见、超时、用户指定采用或待答复均不是 confirm。保留真实来源和原话，不由 Agent 自动代填。

## 本地验证

`node --test tests/check-stage.test.mjs` 创建并清除独立合成文件，覆盖版本失效、原件缺失/篡改、缺票、角色分离、硬伤/未知、人工节点、授权终点、轮次预算、参考逐项与组件边界。它证明接口结构行为，不证明评审准确、艺术质量或当前业务阶段已通过。验证输出保留在任务验证目录，内容清单哈希排除这些输出，避免自循环。
