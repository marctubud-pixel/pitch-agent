# Route B Fusion: Native-Editable PPTX Design System (路子 B 自由排版 + 工坊美学规范)

Use this specification and the bundled **`scripts/route_b_kit.py`** library whenever converting a finalized `PPT逐页稿` into a native-editable `.pptx` presentation. It combines **high-freedom custom visual components** (wireframes, KPI banners, 2×2 numbered cards, native charts) with **modern Chinese editorial studio aesthetics** (serif display titles + brand keyword highlights, hairline whitespace, 50/50 full-bleed splits, minimal footers).

---

## 1. Quick Start: Runnable Code Pattern (`scripts/route_b_kit.py`)

Only `python-pptx` and `Pillow` are required (`pip install python-pptx Pillow`). Import `RouteBDeck` directly from `scripts/route_b_kit.py`:

```python
import sys
sys.path.insert(0, "scripts")
from route_b_kit import RouteBDeck, Palette

# Use a preset ("tea", "museum_night", "baijiu_blue", "guochao_red") or custom Palette(...)
deck = RouteBDeck(brand_name="新中式瓶装茶", palette="tea")

# P01 Cover (full-bleed dark)
deck.add_cover(
    kicker="新品包装创意提案",
    title="3 元新中式瓶装茶\n新品包装提案",
    subtitle="面向高校便利店冷柜的新品主包装设计方案",
    meta="西湖龙井茶叶线索 · 杭州虎跑泉水源线索 · 无糖新中式",
    image_path="cover.jpg",
)

# P02 Ultra-clean hairline agenda (chapter names only, zero spoilers)
deck.add_agenda([
    ("项目背景", "BACKGROUND"),
    ("市场与竞品", "MARKET & COMPETITORS"),
    ("包装策略", "PACKAGING STRATEGY"),
    ("设计呈现", "DESIGN PRESENTATION"),
])

# P03 2x2 numbered cards
deck.add_grid_2x2(
    title="面向高校冷柜，打造 3 元新中式茶", hl="3 元新中式",
    subtitle="聚焦在校大学生日常便利店选购场景的四项核心需求",
    cards=[("人群与渠道", "..."), ("定价与方向", "..."), ("产品线索", "..."), ("上瓶边界", "...")],
)

# P04 Left hairline takeaways + right horizontal bars
deck.add_trend_bars(
    title="无糖茶逆势稳增，课间茶歇成重点", hl="逆势稳增",
    lead_text="2026 旺季无糖茶同比约增 10%，即饮茶体量居饮料首位",
    takeaways=[("无糖占比抬升", "由 28.2% 升至 38.4%。"), ("课间高频场景", "工作学习间隙占 23%。")],
    chart_title="无糖茶占比与即饮茶消费特征（%）",
    bars=[("2026 无糖茶占比", 38.4), ("口感口味", 31.0), ("18–25 岁人群", 29.0)],
    source="来源：马上赢、尼尔森 IQ、尚普咨询",
)

# P05 Top dark KPI banner + bottom hairline competitor columns
deck.add_competitor_kpi(
    title="两强份额超九成，已占茶名与糖型认知", hl="超九成",
    kpis=[("91.36%", "无糖茶 CR2"), ("0.84–0.90 元", "每百毫升均价"), ("96.79%", "无糖茶 CR5")],
    peers=[("东方树叶", "颈标放品牌 · 正标突出茶名", "• 绿色颈标...\n• 0 卡路里..."),
           ("三得利乌龙茶", "商品名直接区分糖型", "• 无糖 / 低糖 / 微甜...")],
)

# P06 Dark full-screen core strategy anchor
deck.add_strategy_statement(
    statement="课间在便利店挑饮料，\n先让学生从冷柜里认出这款茶。",
    proposition="核心主张：把茶名放在新中式瓶标最醒目的位置",
    insight="人群洞察：面对一整排饮料，怎么不用拿起来细看就知道是什么茶？",
)

# P07 Custom wireframe slide (use add_blank_custom + add_rect/add_hline/add_tb/add_footer)
# P08 Direction rationale (50/50 full-bleed edge-to-edge split, alternating left/right)
deck.add_split_editorial(
    title="方向一：隔柜先认茶", hl="隔柜先认茶",
    intro="副标：正标大字先给茶名，品牌在上另排；冷柜前不用拿起。",
    points=[("设计思路", "..."), ("正面看点", "..."), ("侧背陈列", "...")],
    image_path="采用原图/A1.png", side="left",
    notes="内部备注：A1 瓶型与东方树叶接近，推进时须做差异化微调。",
)

# P09 Pure dark gallery showcase (fit: contain, zero cropping)
deck.add_gallery_showcase("方向一「隔柜认茶」效果图（A1）", "采用原图/A1.png")

# P14 Equal-height multi-image comparison + hairline descriptions
deck.add_compare_row(
    title="三套包装方向横向对比", hl="横向对比",
    items=[("方向一｜A1", "采用原图/A1.png", "..."), ("方向二｜B3", "采用原图/B3.png", "..."), ("方向三｜C1", "采用原图/C1.png", "...")],
    highlight_index=1,
)

# P15 Top dark provisional recommendation banner + 2x2 client checklist
deck.add_grid_2x2(
    title="推进建议与 4 项待补资料", hl="推进建议",
    top_banner=("初步推进建议（供决策参考）", "优先考虑方向二（B3）..."),
    cards=[("定稿方向", "..."), ("正式商品资料", "..."), ("卖点与溯源凭证", "..."), ("瓶型与工艺规格", "...")],
)

# P16 Matching dark closing
deck.add_closing(title="感谢观看", subtitle="确认方向后推进正式落版", meta="3 元新中式瓶装茶｜新品包装提案", image_path="cover.jpg")

deck.save("output/proposal.pptx")
```

Then run the bundled visual QA renderer:
```bash
python3 scripts/render_preview.py output/proposal.pptx
```
Inspect the generated `proposal_sheet.png` contact sheet to confirm zero Chinese text collisions, zero image stretching, and exact 1:1 slide count before delivering.

---

## 2. Strict 1:1 Fidelity & Aesthetic Rules

1. **Exact 1:1 Slide Count**: Never merge `[成品展示]` into `[方向阐述]` and never add unrequested extra pages.
2. **Speaker Notes Isolation**: Every `内部备注` goes strictly into `notes=...` (never visible on slide canvas).
3. **Chinese Serif + `hl` Highlight**: Always pass `hl="关键词"` on interior titles so the brand color highlights one focal phrase.
4. **Hairlines Over Heavy Boxes**: Keep agendas, competitor columns, direction rationales, and comparisons light with hairlines and generous warm-paper (`#FAFAF7`) whitespace.
5. **50/50 Full-Bleed Alternating Splits**: Alternate `side="left"` and `side="right"` across consecutive creative directions (`add_split_editorial` auto-crops cleanly to avoid distortion).
6. **Zero Agency Branding**: Never place agency logos or team pages on the slides.
