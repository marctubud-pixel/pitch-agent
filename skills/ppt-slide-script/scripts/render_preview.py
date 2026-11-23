#!/usr/bin/env python3
"""Render a .pptx presentation to per-slide PNGs and a contact sheet for visual QA.

Requirements: LibreOffice (`soffice`), `pdftoppm` (poppler-utils), and Pillow (`PIL`).
Usage:
    python3 scripts/render_preview.py path/to/deck.pptx [output_dir]
"""

import glob
import math
import os
import subprocess
import sys
import tempfile
from PIL import Image


def render(pptx_path: str, out_dir: str | None = None):
    pptx_abs = os.path.abspath(pptx_path)
    base = os.path.splitext(os.path.basename(pptx_abs))[0]
    out_dir = os.path.abspath(out_dir or os.path.dirname(pptx_abs))
    os.makedirs(out_dir, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix="ppt_qa_") as tmp:
        lo_profile = os.path.join(tmp, "lo_profile")
        env = {**os.environ, "HOME": "/tmp", "TMPDIR": "/tmp"}
        subprocess.run(
            [
                "soffice", "--headless",
                f"-env:UserInstallation=file://{lo_profile}",
                "--convert-to", "pdf", "--outdir", tmp, pptx_abs,
            ],
            check=True, env=env, timeout=60,
        )
        pdf_path = os.path.join(tmp, base + ".pdf")
        prefix = os.path.join(out_dir, f"{base}_slide")
        subprocess.run(["pdftoppm", "-png", "-r", "150", pdf_path, prefix], check=True, timeout=60)

    slides = sorted(glob.glob(os.path.join(out_dir, f"{base}_slide-*.png")))
    if not slides:
        raise RuntimeError("No slide PNGs generated.")

    imgs = [Image.open(p) for p in slides]
    tw, th = 640, int(640 * imgs[0].height / imgs[0].width)
    cols = 4
    rows = math.ceil(len(imgs) / cols)
    pad = 16
    sheet = Image.new("RGB", (cols * tw + (cols + 1) * pad, rows * th + (rows + 1) * pad), (42, 46, 52))
    for i, im in enumerate(imgs):
        r, c = divmod(i, cols)
        sheet.paste(im.resize((tw, th), Image.LANCZOS), (pad + c * (tw + pad), pad + r * (th + pad)))
    sheet_path = os.path.join(out_dir, f"{base}_sheet.png")
    sheet.save(sheet_path)
    print(f"Rendered {len(slides)} slides -> Contact sheet: {sheet_path}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 render_preview.py <deck.pptx> [out_dir]")
        sys.exit(1)
    render(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None)
