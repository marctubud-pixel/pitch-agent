# Bridge Spec: `ppt-slide-script` → Deck Studio 1.7 (`deck.json`)

Use this mapping specification when passing a finalized slide-by-slide PPT script (`PPT逐页稿`) into **Deck Studio 1.7 (版式工坊)** to generate a native editable `.pptx` / Keynote deck.

## 1. Core Bridge Rules (Mandatory)

1. **Bypass `deckctl generate`**: Never feed the script into `deckctl generate` (which re-plans slides and rewrites copy). Always map the script **1:1 into `deck.json`** (same slide count, same order), then run `deckctl validate deck.json` and `deckctl build deck.json -o out.pptx`.
2. **Zero Agency Logo**: Always set `"agency": { "name": "", "place": "none" }` so no agency/company logo appears on cover or closing slides.
3. **Title Length & Keyword Highlight (`hl`)**: Keep every slide `data.title` **≤ 14 Chinese characters** to pass `deckctl validate` cleanly. Move extra context into `data.sub` (or `data.intro`), and set `data.hl` to 1 short keyword from `title` to paint it in the brand color.
4. **Speaker Notes Isolation (`内部备注` → `notes`)**: Never put `内部备注` inside visible `data` fields. Map `内部备注` directly to the top-level `"notes": "..."` field on each slide object (supported in the patched `deck-studio-1.7` via `sl.addNotes()`).
5. **Unbiased Comparison (`mineLast: false`)**: On multi-direction `compare` slides where all directions are your own proposals (not competitor vs. self), set `"mineLast": false` so the last card is not erroneously highlighted as "ours".
6. **Theme & Style Selection**: Match `theme.ptype` (`packaging` / `visual` / `video` / `campaign`) and `theme.style` (`elegant` / `guochao` / `modern` / `fresh` / `business` / `warm` / `bold`) plus brand `primary` and `accent` hexes to the client's category.

## 2. 1:1 Slide Role Mapping Table

| `ppt-slide-script` 页面角色 | Deck Studio `type` | Recommended `variant` | Key Fields Mapping |
| :--- | :--- | :--- | :--- |
| `[封面]` | `cover` | `split` / `full` | `kicker`, `title`, `sub`, `meta`, `img` |
| `[目录]` | `contents` | `list` | `title: "目录"`, `auto: false`, `items: [{t, en}]` (3–5 chapter names only) |
| `[需求回顾]` | `summary` | `pillars` / `list` | `title`, `hl`, `sub`, `points: [{k, d}]` (2–4 cards) |
| `[趋势洞察]` | `market` | `hbar` / `trend` / `share` | `title`, `hl`, `sub`, `chartTitle`, `source`, `series: [{label, value}]`, `findings: [{k, d}]` |
| `[竞品参考]` / `[同类参考]` | `competitor` | `table` / `cards` | `selfFirst: false`, `h0..h3`, `rows: [{name, a, b, c}]`, `points: [{k, d}]` |
| `[核心策略]` | `summary` | `statement` (`tone: "brand"`) | `title: "核心策略"`, `statement` (one-sentence strategy), `sub` (core proposition) |
| `[版式规划]` / `[画面节奏]` / `[双载体联动]` | `process` | `line` / `chevron` | `title`, `hl`, `sub`, `steps: [{t, d}]` |
| `[方向阐述]` | `design` | `half` / `halfR` (alternate) | `title`, `hl`, `intro` (verbatim main/sub copy), `img` (real image path), `points: [{k, d}]` |
| `[成品展示]` | `upload` | `framed` (`tone: "dark"`) | `title`, `img` (real image path), `fit: "contain"` |
| `[横向对比]` | `compare` | `posters` / `lineup` | `mineLast: false`, `ratio: "3:4"` or `"16:9"`, `posters: [{name, note, img}]` |
| `[推荐与待确认]` / `[决策与待确认]` | `summary` | `pillars` / `list` | `title`, `hl`, `sub` (provisional recommendation if any), `points: [{k, d}]` (client checklist) |
| `[封底]` | `closing` | `split` / `type` | `title: "感谢观看"`, `sub`, `meta`, `img` |
