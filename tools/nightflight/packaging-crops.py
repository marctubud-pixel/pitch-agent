"""Render overlapping regions of one packaging original for the detail read."""
import sys
from pathlib import Path

from PIL import Image, ImageOps

source, target, *regions = sys.argv[1:]
windows = {
    "左上": (0, 0, .60, .55), "右上": (.40, 0, 1, .55),
    "左下": (0, .45, .60, 1), "右下": (.40, .45, 1, 1),
    "中央": (.20, .22, .80, .78),
}
with Image.open(source) as opened:
    original = ImageOps.exif_transpose(opened)
    width, height = original.size
    for index, region in enumerate(regions):
        left, top, right, bottom = windows[region]
        box = (int(left*width), int(top*height), max(1, round(right*width)), max(1, round(bottom*height)))
        detail = original.crop(box).convert("RGBA")
        background = Image.new("RGB", detail.size, "white")
        background.paste(detail, mask=detail.getchannel("A"))
        scale = 1280 / max(background.size)
        size = tuple(max(1, round(side*scale)) for side in background.size)
        background.resize(size, Image.Resampling.LANCZOS).save(Path(target) / f"{index}.png")
