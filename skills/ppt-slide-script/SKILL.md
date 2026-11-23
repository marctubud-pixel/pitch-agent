---
name: ppt-slide-script
description: Convert collected research data, conclusions, copywriting, and design assets into a standardized slide-by-slide PPT script (PPT逐页稿) for client pitch proposals, and optionally render it 1:1 into a high-craft native-editable PowerPoint (.pptx) using the Route B Fusion design system. Use whenever the user asks to generate a PPT逐页稿, slide-by-slide outline, pitch deck script, or client pitch PPT for poster (海报提案), packaging (包装提案), video (视频提案), or hybrid (混合提案) pitches.
---
# ppt-slide-script

Two-stage end-to-end client pitch skill:
- **Stage 1 (Default)**: Transform an upstream material archive (raw messy notes or structured multi-agent JSON dossiers) into a client-ready, copy-polished slide-by-slide PPT script (`PPT逐页稿`).
- **Stage 2 (On Request / Direct-to-PPT)**: Convert the finalized script **strictly 1:1** into a native-editable `.pptx` deck following the **Route B Fusion** design system (`references/route-b-ppt-design.md`), or map it into Deck Studio 1.7 `deck.json` (`references/deck-studio-bridge.md`).

## When to Use

- The user provides collected research notes, strategy conclusions, copywriting, or design images and wants a slide-by-slide PPT script before generating the actual PPT.
- The user specifies a client pitch proposal type: 海报提案 (poster/KV), 包装提案 (packaging), 视频提案 (video/TVC), or 混合提案 (hybrid/integrated).
- The user wants to convert a finalized `PPT逐页稿` directly into a high-craft, native-editable client pitch `.pptx`.

## Core Scope Rules

- **Dual-Mode Handling: Given Info vs. Incomplete Info (双模式处理规则)**:
  1. **Mode 1 — Info Explicitly Given (材料已明确给出 → 严格照办)**: Whenever the input dossier specifies facts, figures, target audience, strategy, verbatim main/sub copy, or a chosen/recommended direction, follow it 100% faithfully—never search externally, never fabricate contradictory claims, and never override client-decided inputs.
  2. **Mode 2 — Info Incomplete or Unfinished (客户未定 / 内部未做完 → 合理判断、照常完稿)**: Even when the client has not finalized key business details (brand name, pricing, channels, winning direction) or upstream design assets are still unfinished (missing side/back views, draft flaws, missing cover image), **never stall or output a half-baked outline**. Complete the entire script cleanly by:
     - **Reasoned judgment grounded in existing material**: When no final winner or bridge is stated in the dossier, infer natural connective logic, direction suitability judgments, and a provisional recommendation strictly from the dossier's own goals, audience, and visual facts—always framing it transparently as a **建议 / 待确认** rather than a settled fact.
     - **Clean gap routing**: Group undecided client business items into the closing `[推荐与待确认]` checklist; keep all missing visual slots in place with `[待补充: ...]` and isolate internal rework/flaw notes inside `内部备注`.
- **Zero external search & flexible blueprints**: Never search the web or invent outside statistics/case studies. Only include blueprint sections supported by the dossier's reality rather than fabricating filler pages.
- **Proposal content only**: Strictly exclude agency/company introduction (公司介绍), team configuration (团队配置), service workflows/SLAs (工作流程), and historical agency case studies (过往案例), unless the user explicitly asks to include them.
- **Asset & copy fidelity**: Preserve verified research figures, exact client-provided main/sub copy, and exact asset IDs/filenames (e.g., `A1` / `A1-visual-1-xxx.png`) without inventing fake data or fabricated filenames.
- **Active Copywriting Polish & Simplification (提案措辞优化与精简)**:
  - Always run the mandatory copy-polish SOP in `references/copy-polish-rules.md` to strip AI jargon, engineering titles, meta chatter, and cross-slide spoilers so every slide reads naturally in a live client pitch.
- **Internal vs. Client-Facing Filtering (内外信息分流规则)**:
  1. **写入客户正文 (Client-Facing)**: Core brief, disciplined research takeaways with clean source attributions, provided strategy, creative rationale, direction comparison, reasoned provisional recommendation (when undecided), and client confirmation items.
  2. **静默遵守，不上页面 (Silent Guardrails)**: Internal research self-critiques (missing sample sizes, unverified baselines), statistical scope disclaimers, OCR `uncertain` unreadable small text, and internal falsification tests. Obey them silently without printing internal QA disclaimers onto client slides.
  3. **仅放内部备注 (Internal Production Notes)**: Visual review blockers (draft watermarks, bottle-shape similarity warnings, missing side/back renders, missing keyframe actions), post-launch test metrics, and internal asset reminders. Isolate these in an optional `内部备注` sub-bullet so Stage 2 routes them strictly into PowerPoint speaker notes.

## Stage 1 Workflow: Material Archive → Slide-by-Slide Script

### Step 1: Audit Inputs, Classify Proposal Type & Plan Pacing

1. Inventory the input dossier into four buckets (noting both confirmed facts and open/unfinished items):
   - **背景与需求** (brief, deliverables list, target audience, product facts, client-pending items)
   - **调研与竞品** (market/audience trends, competitor/peer benchmarks)
   - **策略与创意** (core strategy, creative proposition, directions, verbatim main/sub copy)
   - **视觉与素材** (real images with filenames & orientation, figure IDs, missing angles/assets)

2. Classify into one of four types: **海报提案** / **包装提案** / **视频提案** / **混合提案**.

3. Follow **One Point Per Slide (一页一重点，不水页、不硬挤)**:
   - Never pad one point across two slides, and never cram two distinct arguments onto one slide.
   - Keep **trends and competitors separate** (when both exist).
   - Keep **one-sentence core strategy** and **layout/pacing breakdown** on separate slides.
   - **High-density real image anti-repetition (实图防复读)**: When an uploaded real image already displays embedded timestamps, dialogue, or SFX text, focus the preceding `[方向阐述]` slide on verbatim main/sub copy, creative logic, and highlights—leaving frame-by-frame reading to the full-bleed `[成品展示]` slide.

4. Read `references/proposal-blueprints.md` and `references/copy-polish-rules.md` before drafting.

### Step 2: Write Every Slide in the Standard 4-Field Format

Output clean Markdown grouped under chapter headings (`## 01 ...`), formatting every slide with these exact fields:

```markdown
### P01 | [页面角色标签]

- **标题/重点**：一句话核心结论、主题名或页面主标题（直接给客户看，自然顺口）
- **解释内容**：数据分析、创意阐述、策略推演、脚本文案或客户待确认项（纯图页/金句页可极简或写「无」）
- **图片**：对应设计稿图号、文件名与画幅/排版方式（如 `竖版全幅展示：采用原图/A1-xxx.png` 或 `3 张竖版包装图等高三列并排`；纯文字页可写「无」；缺失素材标注 `[待补充: ...]`）
- **内部备注**（可选，仅在存在制作/审图提醒时出现）：演练图待修项、视觉阻断提醒或下游排版提示（生成客户 PPT 时不写入页面正文，仅入演讲者备注）
```

### Step 3: Mandatory Copy-Polish Pass & Quality Self-Check

Execute `references/copy-polish-rules.md` line by line:
- Run the 5-category rewrite table, the 4 simplification moves (砍半句 / 砍复读 / 砍空词 / 控长度), and the 3-second Read-Aloud Gate.
- Verify Dual-Mode integrity (all given facts preserved; any provisional recommendation clearly framed as `建议 / 待确认`).
- Verify zero company/team/workflow/case-study slides, ultra-clean `目录`, separate trend vs. peer slides, separate strategy vs. execution slides, and explicit image orientation/alignment notes.

## Stage 2 Workflow (Optional): Slide Script → Native-Editable PPTX

When the user approves the script (or asks to generate the PPT directly):

- **Default Pipeline — Route B Fusion (`references/route-b-ppt-design.md`)**: Build a strict **1:1 native-editable `.pptx`** (exact slide count match, full-bleed dark cover/closing, Chinese Serif titles + brand keyword `hl` highlights, hairline whitespace, 50/50 full-bleed direction splits, custom native wireframes/KPI banners/charts, minimal brand+page footer, and all `内部备注` written into speaker notes). Always render slides to PNG and visually verify zero overlaps before delivery.
- **Alternative Pipeline — Deck Studio 1.7 (`references/deck-studio-bridge.md`)**: If deploying into a `deck-studio-1.7` CLI/MCP environment, map the script 1:1 into `deck.json` (`agency.place: "none"`, `title ≤ 14 chars + hl`, `notes` pass-through) and run `deckctl validate` + `deckctl build`.
