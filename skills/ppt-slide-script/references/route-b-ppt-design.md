# Route B Fusion: Native-Editable PPTX Design System (路子 B 自由排版 + 工坊美学规范)

Use this specification whenever converting a finalized `PPT逐页稿` into a native-editable `.pptx` presentation (e.g., via `python-pptx`). It combines **high-freedom custom visual components** (wireframes, KPI banners, 2×2 numbered cards, native charts) with **modern Chinese editorial studio aesthetics** (serif display titles + brand keyword highlights, hairline whitespace, 50/50 full-bleed splits, minimal footers).

---

## 1. Strict 1:1 Fidelity Contract (严格 1:1 映射铁律)

1. **Zero added or dropped slides**: If the script has N slides (`P01`–`P16`), the `.pptx` MUST have **exact N slides** in the exact same sequence. Never merge showcase slides into rationale slides, and never inject unrequested extra pages.
2. **Exact copy & figure fidelity**: Keep all direction main/sub headlines verbatim and embed real uploaded assets (`采用原图/...`) at their exact native aspect ratios without stretching.
3. **Speaker-notes isolation**: Never print `内部备注` on visible slide canvases. Route every `内部备注` (and data source URLs) strictly into each slide's PowerPoint speaker notes (`slide.notes_slide.notes_text_frame.text`).
4. **Zero agency/company branding**: Never add agency logos, team rosters, or "Confidential / Agency Name" footers.

---

## 2. Four Editorial Aesthetic Genes (四大美学基因)

1. **Chinese Serif Titles + Brand Keyword Highlight (`hl`)**:
   - Display / Slide Titles: `Noto Serif CJK SC` (or `Source Han Serif SC` / `Songti SC`), 22–26 pt bold, kept cleanly on 1 line (`≤ 16` Chinese chars).
   - Pick **1 core keyword** per interior slide title and paint that single run in the brand `ACCENT` color (e.g., `无糖茶` + **`逆势稳增`** + `，课间茶歇成重点`) while keeping the rest in deep ink `TEXT`.
   - Body Copy: `Noto Sans CJK SC` (or `PingFang SC` / `Microsoft YaHei`), 9.5–11 pt, line spacing `1.28–1.38`.
2. **Hairlines & Whitespace Over Heavy Boxes (细线留白、去厚重卡片化)**:
   - Use a warm editorial paper background (`#FAFAF7` or `#F8F7F3`) instead of stark `#FFFFFF`.
   - On agendas (`目录`), competitor analyses (`竞品参考`), direction rationales (`方向阐述`), and side-by-side comparisons (`横向对比`), use **0.75 pt hairlines (`#D8DFD9`) + generous whitespace** rather than wrapping every block in heavy grey rounded rectangles.
   - Reserve solid tinted/dark fills strictly for high-emphasis anchors (KPI banners, core strategy statement slides, 2×2 brief/checklist cards, and key wireframe highlight zones).
3. **50/50 Full-Bleed Edge-to-Edge Image Splits (方向阐述页 50/50 满出血分屏)**:
   - On `[方向阐述]` slides, center-crop the hero visual to bleed edge-to-edge across 48.5% width × 100% slide height (`0` top/bottom/outer margin), alternating **left → right → left** across consecutive directions.
   - Place the Serif+`hl` title, verbatim main/sub copy, and 3 hairline-separated `label | description` rows on the clean paper half.
4. **Minimal Consistent Footer (极简统一底栏)**:
   - On every interior slide (`02`–`N-1`), place subtle muted brand/project name (`8.5 pt`) at bottom-left (`x=0.55 in, y=5.26 in`) and 2-digit page number (`02`, `03`, ...) at bottom-right (`x=8.85 in, y=5.26 in`). Omit on cover and closing.

---

## 3. Slide-by-Slide Component Recipes (16:9 Canvas `10.0 × 5.625 in`)

| 页面角色 | 推荐版式结构 | 核心视觉细节 |
| :--- | :--- | :--- |
| `[封面]` / `[封底]` | **全屏暗调满出血大图** | 16:9 氛围底图（左侧深暗留白、右侧主题视觉），左排 `Noto Serif CJK SC` 34–38 pt 白字大标题 + 琥珀金短横线 + 简洁副题 |
| `[目录]` | **左大字右细线极简目录** | 左侧 `目录 / CONTENTS` + 短品牌色线；右侧仅列 3–5 个大板块编号与中英名称，项间用细横线分隔，零页码、零剧透 |
| `[需求回顾]` | **2×2 编号卡片网格** | 4 张柔和浅底卡片，左上角圆形编号章（`01`–`04`）+ 衬线小标题 + 细横线 + 精炼说明 |
| `[趋势洞察]` | **左观点右横向条形图** | 左侧大字核心判断 + 2 条细线分隔的洞察点 + 底部来源小字；右侧浅底面板内画清晰横向数据条形图（首项用品牌主色强调） |
| `[竞品参考]` | **顶深色 KPI 横幅 + 底细线双栏** | 顶部深色横幅排 2–3 个大号衬线核心数据；下方 2–3 列竞品拆解直接用顶部彩色细线 + 衬线小标题 + 细横线分隔，不套灰框 |
| `[核心策略]` | **深色全屏大字金句定调页** | 整页深品牌暗底 + 琥珀金大引号 + 30 pt 衬线核心策略一句定调 + 短金线 + 核心主张与人群洞察，极致留白 |
| `[版式规划]` / `[双载体联动]` | **左细线清单 + 右原生结构线框图** | 左侧 3–4 条细线分隔说明；右侧用原生矢量矩形与文字直接绘制三面瓶标线框、公众号三区线框或双载体联动图 |
| `[方向阐述]` | **50/50 满出血大图分屏（左右交替）** | 一半边到边满出血实图，另一半衬线高亮标题 + 主副标原文 + 3 行细线分隔的「设计思路 / 核心看点」 |
| `[成品展示]` | **深色画廊全幅纯图展示** | 深品牌暗底，顶部仅留一行简洁衬线标题，居中按原始比例最大尺寸展示完整原图（`fit: contain`，严禁裁切或拉伸），零解释正文 |
| `[横向对比]` | **多图等高并排 + 底部细线说明** | 上半屏按统一高度并排展示各方向原图（保持原始比例不拉伸），下半屏细横线 + 衬线方向名 + 适用场景与特点 |
| `[推荐与待确认]` | **顶深色建议条 + 下 2×2 确认卡** | 顶部深色横幅写明初步推进建议（若材料未定则标“供决策参考”）；下方 2×2 编号卡片列出客户待确认/待补事项 |

---

## 4. Brand Palette Adaptation & Quality Gate

- **Adapt palette per client**: Never reuse one generic blue palette—derive `BG_DARK` (deep brand shadow), `BG_LIGHT` (`#FAFAF7` warm paper), `TINT` (soft muted tint), `ACCENT` (brand ink for `hl`), and `ACCENT2` (warm highlight) from the client's category (e.g., 茶饮 → 墨竹青 + 琥珀金；博物馆夜场 → 深蓝夜空 + 暖橙聚光；白酒春节 → 梦之蓝深海蓝 + 暖金).
- **Mandatory Visual Inspection**: After generating the `.pptx`, always convert to PNG slides via LibreOffice (`soffice --headless --convert-to pdf` + `pdftoppm`) and inspect the full contact sheet to verify zero Chinese text wrapping collisions, zero image distortion, and exact slide count match before delivering.
