"""Route B Fusion — Standalone Native-Editable PPTX Component Library.

Dependencies: python-pptx, Pillow (PIL).
Canvas: 16:9 widescreen (10.0 x 5.625 in).
Design genes: Chinese Serif titles with brand keyword highlight (hl),
hairline whitespace over heavy boxes, 50/50 full-bleed direction splits,
dark full-bleed covers/closings, minimal brand + page footer, and native
speaker notes isolation.
"""

from __future__ import annotations

import os
import tempfile
from dataclasses import dataclass
from typing import Iterable, Sequence

from PIL import Image
from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import MSO_ANCHOR, PP_ALIGN
from pptx.util import Inches, Pt


def _rgb(hex_str: str) -> RGBColor:
    h = hex_str.lstrip("#")
    return RGBColor(int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))


@dataclass
class Palette:
    bg_dark: str = "162926"       # Deep brand dark (cover, closing, strategy, KPI banner)
    bg_light: str = "FAFAF7"      # Warm editorial paper canvas
    tint: str = "EEF1EC"          # Subtle soft surface for cards/charts
    accent: str = "2A5C55"        # Primary brand ink (also used for title hl highlight)
    accent2: str = "B87D3B"       # Warm secondary accent
    gold_soft: str = "ECD6A4"     # Soft light highlight on dark surfaces
    text: str = "192221"          # Deep ink body text
    muted: str = "5E6B68"         # Muted secondary text
    light_muted: str = "C2CECB"   # Muted text on dark surfaces
    hairline: str = "D8DFD9"      # Crisp divider rule


PRESET_PALETTES = {
    "tea": Palette(),
    "museum_night": Palette(
        bg_dark="101E33", bg_light="F7F9FC", tint="EBF1F8",
        accent="1B6B7A", accent2="E08A3A", gold_soft="F6DFA8",
        text="142133", muted="4F6076", light_muted="C7D3E3", hairline="CFDBE8",
    ),
    "baijiu_blue": Palette(
        bg_dark="0D1B36", bg_light="F9F8F5", tint="ECEFF5",
        accent="1C3E7A", accent2="C8923B", gold_soft="F2DDA8",
        text="141E30", muted="536175", light_muted="C5D0E0", hairline="D3DBE6",
    ),
    "guochao_red": Palette(
        bg_dark="3B1114", bg_light="FAF7F2", tint="F2EBE4",
        accent="A62626", accent2="C9933B", gold_soft="F4DFAF",
        text="231817", muted="6A5A58", light_muted="DFCFCB", hairline="E2D5CC",
    ),
}


class RouteBDeck:
    """High-craft 16:9 native-editable PowerPoint builder for client pitch scripts."""

    def __init__(
        self,
        brand_name: str = "",
        palette: Palette | str = "tea",
        serif_font: str = "Noto Serif CJK SC",
        sans_font: str = "Noto Sans CJK SC",
    ):
        self.brand_name = brand_name
        self.pal = PRESET_PALETTES[palette] if isinstance(palette, str) else palette
        self.serif = serif_font
        self.sans = sans_font
        self.prs = Presentation()
        self.prs.slide_width = Inches(10.0)
        self.prs.slide_height = Inches(5.625)
        self._blank_layout = self.prs.slide_layouts[6]
        self._tmp_dir = tempfile.mkdtemp(prefix="routeb_")
        self._crop_idx = 0

    # ------------------------------------------------------------------
    # Low-level primitives (also usable for custom wireframes/diagrams)
    # ------------------------------------------------------------------
    def _new_slide(self, dark: bool = False):
        slide = self.prs.slides.add_slide(self._blank_layout)
        bg = slide.background
        fill = bg.fill
        fill.solid()
        fill.fore_color.rgb = _rgb(self.pal.bg_dark if dark else self.pal.bg_light)
        return slide

    @property
    def slide_count(self) -> int:
        return len(self.prs.slides)

    def add_blank_custom(self, dark: bool = False, notes: str = ""):
        s = self._new_slide(dark=dark)
        if notes:
            self.set_notes(s, notes)
        return s

    def set_notes(self, slide, text: str):
        if text:
            slide.notes_slide.notes_text_frame.text = str(text).strip()

    def add_rect(
        self, slide, x: float, y: float, w: float, h: float,
        fill_hex: str, radius: float = 0.04, line_hex: str | None = None, line_pt: float = 0.8,
    ):
        st = MSO_SHAPE.ROUNDED_RECTANGLE if radius > 0 else MSO_SHAPE.RECTANGLE
        shp = slide.shapes.add_shape(st, Inches(x), Inches(y), Inches(w), Inches(h))
        if radius > 0:
            shp.adjustments[0] = radius
        shp.fill.solid()
        shp.fill.fore_color.rgb = _rgb(fill_hex)
        if line_hex:
            shp.line.color.rgb = _rgb(line_hex)
            shp.line.width = Pt(line_pt)
        else:
            shp.line.fill.background()
        return shp

    def add_hline(self, slide, x: float, y: float, w: float, color_hex: str | None = None, thickness_in: float = 0.012):
        shp = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(x), Inches(y), Inches(w), Inches(thickness_in))
        shp.fill.solid()
        shp.fill.fore_color.rgb = _rgb(color_hex or self.pal.hairline)
        shp.line.fill.background()
        return shp

    def add_tb(
        self, slide, x: float, y: float, w: float, h: float, text: str,
        size: float = 10.5, color_hex: str | None = None, bold: bool = False,
        serif: bool = False, align=PP_ALIGN.LEFT, valign=MSO_ANCHOR.TOP, line_spacing: float = 1.28,
    ):
        tb = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
        tf = tb.text_frame
        tf.word_wrap = True
        tf.vertical_anchor = valign
        tf.margin_left = Pt(1)
        tf.margin_right = Pt(1)
        tf.margin_top = Pt(1)
        tf.margin_bottom = Pt(1)
        col = _rgb(color_hex or self.pal.text)
        font_name = self.serif if serif else self.sans
        for idx, line in enumerate(str(text).split("\n")):
            p = tf.paragraphs[0] if idx == 0 else tf.add_paragraph()
            p.alignment = align
            p.line_spacing = line_spacing
            r = p.add_run()
            r.text = line
            r.font.name = font_name
            r.font.size = Pt(size)
            r.font.bold = bold
            r.font.color.rgb = col
        return tb

    def add_serif_hl_title(
        self, slide, x: float, y: float, w: float, h: float, title: str,
        hl: str | None = None, size: float = 24, dark: bool = False,
    ):
        tb = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
        tf = tb.text_frame
        tf.word_wrap = True
        tf.margin_left = Pt(0)
        tf.margin_top = Pt(0)
        p = tf.paragraphs[0]
        p.line_spacing = 1.15
        base_col = _rgb("FFFFFF" if dark else self.pal.text)
        hl_col = _rgb(self.pal.gold_soft if dark else self.pal.accent)
        if hl and hl in title:
            pre, post = title.split(hl, 1)
            segs = [(pre, base_col), (hl, hl_col), (post, base_col)]
        else:
            segs = [(title, base_col)]
        for seg_txt, seg_col in segs:
            if not seg_txt:
                continue
            r = p.add_run()
            r.text = seg_txt
            r.font.name = self.serif
            r.font.size = Pt(size)
            r.font.bold = True
            r.font.color.rgb = seg_col
        return tb

    def add_footer(self, slide, page_num: int | None = None, dark: bool = False, right_x: float = 8.85):
        col = self.pal.light_muted if dark else self.pal.muted
        num = page_num if page_num is not None else self.slide_count
        if self.brand_name:
            self.add_tb(slide, 0.55, 5.26, 4.0, 0.24, self.brand_name, size=8.5, color_hex=col)
        self.add_tb(slide, right_x, 5.26, 0.60, 0.24, f"{num:02d}", size=8.5, color_hex=col, align=PP_ALIGN.RIGHT)

    def add_pic_fit(self, slide, img_path: str, bx: float, by: float, bw: float, bh: float):
        """Place image centered inside box preserving exact native aspect ratio (zero distortion)."""
        with Image.open(img_path) as im:
            iw, ih = im.size
        ratio = iw / ih
        if bw / bh > ratio:
            h, w = bh, bh * ratio
        else:
            w, h = bw, bw / ratio
        slide.shapes.add_picture(
            img_path, Inches(bx + (bw - w) / 2.0), Inches(by + (bh - h) / 2.0),
            width=Inches(w), height=Inches(h),
        )

    def add_pic_cover(self, slide, img_path: str, bx: float, by: float, bw: float, bh: float):
        """Center-crop image to exact target aspect ratio for crisp full-bleed panels."""
        self._crop_idx += 1
        with Image.open(img_path) as im:
            iw, ih = im.size
            target_r, cur_r = bw / bh, iw / ih
            if cur_r > target_r:
                nw = int(ih * target_r)
                left = (iw - nw) // 2
                cropped = im.crop((left, 0, left + nw, ih))
            else:
                nh = int(iw / target_r)
                top = (ih - nh) // 2
                cropped = im.crop((0, top, iw, top + nh))
            ext = os.path.splitext(img_path)[1].lower() or ".png"
            tmp = os.path.join(self._tmp_dir, f"crop_{self._crop_idx}{ext}")
            cropped.save(tmp)
        slide.shapes.add_picture(tmp, Inches(bx), Inches(by), width=Inches(bw), height=Inches(bh))

    # ------------------------------------------------------------------
    # High-level Route B Fusion slide builders
    # ------------------------------------------------------------------
    def add_cover(
        self, title: str, subtitle: str = "", kicker: str = "", meta: str = "",
        image_path: str | None = None, notes: str = "",
    ):
        s = self._new_slide(dark=True)
        if image_path and os.path.exists(image_path):
            self.add_pic_cover(s, image_path, 0, 0, 10.0, 5.625)
        if kicker:
            self.add_tb(s, 0.65, 1.05, 5.4, 0.28, kicker, size=10.5, color_hex=self.pal.gold_soft, bold=True)
        self.add_tb(s, 0.65, 1.48, 5.8, 1.45, title, size=34, color_hex="FFFFFF", bold=True, serif=True, line_spacing=1.22)
        self.add_hline(s, 0.65, 3.05, 0.85, color_hex=self.pal.accent2, thickness_in=0.025)
        if subtitle:
            self.add_tb(s, 0.65, 3.25, 5.2, 0.50, subtitle, size=13, color_hex=self.pal.light_muted)
        if meta:
            self.add_tb(s, 0.65, 4.90, 5.6, 0.30, meta, size=9.5, color_hex=self.pal.light_muted)
        self.set_notes(s, notes)
        return s

    def add_agenda(self, chapters: Sequence[tuple[str, str]], title: str = "目录", en: str = "CONTENTS", notes: str = ""):
        """chapters: list of (cn_name, en_name), 3-5 clean top-level items."""
        s = self._new_slide(dark=False)
        self.add_tb(s, 0.65, 1.25, 2.6, 0.70, title, size=34, color_hex=self.pal.text, bold=True, serif=True)
        self.add_tb(s, 0.65, 2.00, 2.6, 0.30, en, size=10, color_hex=self.pal.muted, bold=True)
        self.add_hline(s, 0.65, 2.38, 0.55, color_hex=self.pal.accent, thickness_in=0.02)
        n = len(chapters)
        step = min(0.92, 3.60 / max(n, 1))
        y0 = 1.18 if n <= 4 else 0.95
        for idx, (cn, en_lbl) in enumerate(chapters):
            cy = y0 + idx * step
            self.add_tb(s, 3.60, cy, 0.70, 0.45, f"{idx + 1:02d}", size=18, color_hex=self.pal.accent, bold=True, serif=True)
            self.add_tb(s, 4.40, cy, 4.80, 0.38, cn, size=16, color_hex=self.pal.text, bold=True, serif=True)
            if en_lbl:
                self.add_tb(s, 4.40, cy + 0.38, 4.80, 0.24, en_lbl, size=8.5, color_hex=self.pal.muted)
            if idx < n - 1:
                self.add_hline(s, 3.60, cy + step - 0.16, 5.65)
        self.add_footer(s)
        self.set_notes(s, notes)
        return s

    def add_grid_2x2(
        self, title: str, cards: Sequence[tuple[str, str]], hl: str | None = None,
        subtitle: str = "", top_banner: tuple[str, str] | None = None, notes: str = "",
    ):
        """2x2 numbered cards with optional dark top recommendation banner (kicker, body)."""
        s = self._new_slide(dark=False)
        self.add_serif_hl_title(s, 0.55, 0.42, 8.9, 0.50, title, hl=hl)
        if top_banner:
            self.add_rect(s, 0.55, 1.06, 8.90, 0.78, self.pal.bg_dark, radius=0.06)
            self.add_tb(s, 0.78, 1.14, 8.45, 0.22, top_banner[0], size=9.2, color_hex=self.pal.gold_soft, bold=True)
            self.add_tb(s, 0.78, 1.38, 8.45, 0.40, top_banner[1], size=10, color_hex="FFFFFF")
            y0, ch, gy = 2.04, 1.36, 0.18
        else:
            if subtitle:
                self.add_tb(s, 0.55, 0.96, 8.9, 0.28, subtitle, size=10.5, color_hex=self.pal.muted)
            y0, ch, gy = 1.48, 1.52, 0.20

        for idx, (ct, cb) in enumerate(cards[:4]):
            col, row = idx % 2, idx // 2
            cx, cy = 0.55 + col * 4.55, y0 + row * (ch + gy)
            self.add_rect(s, cx, cy, 4.35, ch, self.pal.tint, radius=0.05)
            self.add_tb(s, cx + 0.22, cy + 0.18, 0.45, 0.30, f"{idx + 1:02d}", size=14, color_hex=self.pal.accent, bold=True, serif=True)
            self.add_tb(s, cx + 0.70, cy + 0.20, 3.40, 0.30, ct, size=12.5, color_hex=self.pal.text, bold=True, serif=True)
            self.add_hline(s, cx + 0.22, cy + 0.58, 3.90)
            self.add_tb(s, cx + 0.22, cy + 0.68, 3.90, ch - 0.76, cb, size=9.8, color_hex=self.pal.muted, line_spacing=1.32)
        self.add_footer(s)
        self.set_notes(s, notes)
        return s

    def add_trend_bars(
        self, title: str, lead_text: str, takeaways: Sequence[tuple[str, str]],
        chart_title: str, bars: Sequence[tuple[str, float]], hl: str | None = None,
        source: str = "", suffix: str = "%", notes: str = "",
    ):
        s = self._new_slide(dark=False)
        self.add_serif_hl_title(s, 0.55, 0.42, 8.9, 0.50, title, hl=hl)
        self.add_tb(s, 0.55, 1.25, 3.15, 0.92, lead_text, size=14.5, color_hex=self.pal.text, bold=True, serif=True, line_spacing=1.35)
        for idx, (tk, td) in enumerate(takeaways[:2]):
            ty = 2.38 + idx * 1.12
            self.add_hline(s, 0.55, ty, 3.05)
            self.add_tb(s, 0.55, ty + 0.14, 3.05, 0.26, tk, size=11, color_hex=self.pal.accent, bold=True)
            self.add_tb(s, 0.55, ty + 0.42, 3.05, 0.62, td, size=9.8, color_hex=self.pal.muted, line_spacing=1.35)
        if source:
            self.add_tb(s, 0.55, 4.78, 3.15, 0.34, source, size=8.2, color_hex=self.pal.muted)

        self.add_rect(s, 3.95, 1.22, 5.50, 3.72, self.pal.tint, radius=0.05)
        self.add_tb(s, 4.22, 1.38, 5.00, 0.28, chart_title, size=11, color_hex=self.pal.text, bold=True)
        max_v = max((v for _, v in bars), default=1.0) * 1.12
        step = min(0.48, 2.95 / max(len(bars), 1))
        for idx, (blab, bval) in enumerate(bars[:7]):
            by = 1.84 + idx * step
            bcol = self.pal.accent if idx == 0 else (self.pal.accent2 if idx == len(bars) - 1 else self.pal.muted)
            self.add_tb(s, 4.22, by, 1.95, 0.30, blab, size=9.2, color_hex=self.pal.text if idx == 0 else self.pal.muted, bold=(idx == 0), valign=MSO_ANCHOR.MIDDLE)
            bw = max(0.12, (bval / max_v) * 2.55)
            self.add_rect(s, 6.25, by + 0.04, bw, 0.22, bcol, radius=0.25)
            val_txt = f"{bval:.1f}{suffix}" if bval % 1 else f"{int(bval)}{suffix}"
            self.add_tb(s, 6.32 + bw, by, 0.72, 0.30, val_txt, size=9.5, color_hex=self.pal.text, bold=True, valign=MSO_ANCHOR.MIDDLE)
        self.add_footer(s)
        self.set_notes(s, notes)
        return s

    def add_competitor_kpi(
        self, title: str, kpis: Sequence[tuple[str, str]],
        peers: Sequence[tuple[str, str, str]], hl: str | None = None,
        source: str = "", notes: str = "",
    ):
        """kpis: [(value, label), ...] (up to 3); peers: [(name, headline, body), ...] (2-3)."""
        s = self._new_slide(dark=False)
        self.add_serif_hl_title(s, 0.55, 0.42, 8.9, 0.50, title, hl=hl)
        self.add_rect(s, 0.55, 1.15, 8.90, 1.08, self.pal.bg_dark, radius=0.06)
        kn = max(len(kpis[:3]), 1)
        kw = 8.90 / kn
        for idx, (kv, kl) in enumerate(kpis[:3]):
            kx = 0.78 + idx * kw
            if idx > 0:
                self.add_rect(s, 0.55 + idx * kw, 1.38, 0.015, 0.62, self.pal.muted, radius=0)
            self.add_tb(s, kx, 1.24, kw - 0.35, 0.46, kv, size=24, color_hex=self.pal.gold_soft if idx == 0 else "FFFFFF", bold=True, serif=True)
            self.add_tb(s, kx, 1.74, kw - 0.35, 0.34, kl, size=9, color_hex=self.pal.light_muted)

        pn = max(len(peers[:3]), 1)
        gap = 0.35
        pw = (8.90 - gap * (pn - 1)) / pn
        for idx, (pname, phead, pbody) in enumerate(peers[:3]):
            px = 0.55 + idx * (pw + gap)
            pcol = self.pal.accent if idx == 0 else self.pal.accent2
            self.add_hline(s, px, 2.52, pw, color_hex=pcol, thickness_in=0.022)
            self.add_tb(s, px, 2.68, pw, 0.28, pname, size=11, color_hex=pcol, bold=True)
            self.add_tb(s, px, 2.98, pw, 0.36, phead, size=13.5, color_hex=self.pal.text, bold=True, serif=True)
            self.add_hline(s, px, 3.44, pw)
            self.add_tb(s, px, 3.58, pw, 1.35, pbody, size=10, color_hex=self.pal.muted, line_spacing=1.40)
        if source:
            self.add_tb(s, 0.55, 4.96, 8.9, 0.22, source, size=8.2, color_hex=self.pal.muted)
        self.add_footer(s)
        self.set_notes(s, notes)
        return s

    def add_strategy_statement(self, statement: str, proposition: str = "", insight: str = "", notes: str = ""):
        s = self._new_slide(dark=True)
        self.add_tb(s, 0.85, 0.95, 8.3, 0.50, "“", size=48, color_hex=self.pal.accent2, bold=True, serif=True)
        self.add_tb(s, 0.85, 1.55, 8.3, 1.40, statement, size=30, color_hex="FFFFFF", bold=True, serif=True, line_spacing=1.32)
        self.add_hline(s, 0.85, 3.18, 0.90, color_hex=self.pal.accent2, thickness_in=0.025)
        if proposition:
            self.add_tb(s, 0.85, 3.42, 8.3, 0.36, proposition, size=14, color_hex=self.pal.gold_soft, bold=True)
        if insight:
            self.add_tb(s, 0.85, 3.90, 7.8, 0.70, insight, size=11, color_hex=self.pal.light_muted, line_spacing=1.40)
        self.add_footer(s, dark=True)
        self.set_notes(s, notes)
        return s

    def add_split_editorial(
        self, title: str, intro: str, points: Sequence[tuple[str, str]],
        image_path: str, hl: str | None = None, side: str = "left", notes: str = "",
    ):
        """50/50 edge-to-edge full-bleed photo split + clean hairline rationale."""
        s = self._new_slide(dark=False)
        if side == "left":
            if image_path and os.path.exists(image_path):
                self.add_pic_cover(s, image_path, 0.0, 0.0, 4.85, 5.625)
            tx, num_x = 5.35, 8.85
        else:
            if image_path and os.path.exists(image_path):
                self.add_pic_cover(s, image_path, 5.15, 0.0, 4.85, 5.625)
            tx, num_x = 0.60, 4.20

        self.add_serif_hl_title(s, tx, 0.82, 4.15, 0.52, title, hl=hl)
        if intro:
            self.add_tb(s, tx, 1.48, 4.15, 0.56, intro, size=10, color_hex=self.pal.muted, line_spacing=1.38)
        for idx, (pk, pd) in enumerate(points[:4]):
            py = 2.26 + idx * 0.88
            self.add_hline(s, tx, py, 4.10)
            self.add_tb(s, tx, py + 0.14, 1.05, 0.32, pk, size=10, color_hex=self.pal.accent, bold=True)
            self.add_tb(s, tx + 1.15, py + 0.12, 2.95, 0.66, pd, size=9.8, color_hex=self.pal.text, line_spacing=1.35)
        self.add_tb(s, num_x, 5.26, 0.60, 0.24, f"{self.slide_count:02d}", size=8.5, color_hex=self.pal.muted, align=PP_ALIGN.RIGHT)
        self.set_notes(s, notes)
        return s

    def add_gallery_showcase(self, title: str, image_path: str, notes: str = ""):
        """Dark gallery pure-image showcase (fit: contain, zero cropping/stretching)."""
        s = self._new_slide(dark=True)
        self.add_tb(s, 0.55, 0.34, 8.9, 0.42, title, size=18, color_hex="FFFFFF", bold=True, serif=True)
        if image_path and os.path.exists(image_path):
            self.add_pic_fit(s, image_path, 0.80, 0.88, 8.40, 4.26)
        self.add_footer(s, dark=True)
        self.set_notes(s, notes)
        return s

    def add_compare_row(
        self, title: str, items: Sequence[tuple[str, str, str]],
        hl: str | None = None, highlight_index: int | None = None, notes: str = "",
    ):
        """items: [(name, img_path, desc), ...] (2-4 equal-height columns)."""
        s = self._new_slide(dark=False)
        self.add_serif_hl_title(s, 0.55, 0.42, 8.9, 0.50, title, hl=hl)
        n = max(len(items[:4]), 1)
        gap = 0.25
        cw = (8.90 - gap * (n - 1)) / n
        for idx, (cname, cimg, cdesc) in enumerate(items[:4]):
            cx = 0.55 + idx * (cw + gap)
            if cimg and os.path.exists(cimg):
                self.add_pic_fit(s, cimg, cx, 1.12, cw, 2.75)
            is_hl = (highlight_index == idx)
            self.add_hline(s, cx, 4.00, cw, color_hex=self.pal.accent if is_hl else self.pal.hairline, thickness_in=0.018 if is_hl else 0.012)
            self.add_tb(s, cx, 4.10, cw, 0.28, cname, size=11, color_hex=self.pal.text, bold=True, serif=True)
            self.add_tb(s, cx, 4.40, cw, 0.78, cdesc, size=9.2, color_hex=self.pal.muted, line_spacing=1.32)
        self.add_footer(s)
        self.set_notes(s, notes)
        return s

    def add_closing(self, title: str = "感谢观看", subtitle: str = "", meta: str = "", image_path: str | None = None, notes: str = ""):
        s = self._new_slide(dark=True)
        if image_path and os.path.exists(image_path):
            self.add_pic_cover(s, image_path, 0, 0, 10.0, 5.625)
        self.add_tb(s, 0.65, 1.65, 5.2, 0.28, "THANK YOU", size=10, color_hex=self.pal.gold_soft, bold=True)
        self.add_tb(s, 0.65, 2.02, 5.2, 0.85, title, size=38, color_hex="FFFFFF", bold=True, serif=True)
        self.add_hline(s, 0.65, 3.00, 0.85, color_hex=self.pal.accent2, thickness_in=0.025)
        if subtitle:
            self.add_tb(s, 0.65, 3.22, 5.4, 0.50, subtitle, size=12, color_hex=self.pal.light_muted)
        if meta:
            self.add_tb(s, 0.65, 4.90, 5.4, 0.28, meta, size=9.5, color_hex=self.pal.light_muted)
        self.set_notes(s, notes)
        return s

    def save(self, out_path: str) -> str:
        os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
        self.prs.save(out_path)
        return out_path
