"""Keep the full original framing and a common height for comparative reading."""
import hashlib
import io
import json
import sys
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageOps


if sys.argv[1] == "--crop-box":
    source, destination, expected_hash = sys.argv[2:5]
    left, top, right, bottom = map(int, sys.argv[5:])
    if not (0 <= left < right <= 1000 and 0 <= top < bottom <= 1000):
        raise ValueError("Invalid normalized crop bounds")
    original_bytes = Path(source).read_bytes()
    if hashlib.sha256(original_bytes).hexdigest() != expected_hash:
        raise ValueError("Original image hash does not match crop input")
    with Image.open(io.BytesIO(original_bytes)) as original:
        image = ImageOps.exif_transpose(original)
        width, height = image.size
        crop = image.crop((width * left // 1000, height * top // 1000,
                           (width * right + 999) // 1000, (height * bottom + 999) // 1000))
        with tempfile.NamedTemporaryFile(dir=Path(destination).parent, delete=False) as target:
            temporary = Path(target.name)
        try:
            crop.save(temporary, format="PNG")
            temporary.replace(destination)
        finally:
            temporary.unlink(missing_ok=True)
    print(json.dumps(crop.size))
    raise SystemExit(0)

if sys.argv[1] == "--review-previews":
    paths = sys.argv[2:]
    for source, destination in zip(paths[::2], paths[1::2]):
        with Image.open(source) as original:
            image = ImageOps.exif_transpose(original).convert("RGBA")
            image.thumbnail((1536, 1536), Image.Resampling.LANCZOS)
            background = Image.new("RGB", image.size, "white")
            background.paste(image, (0, 0), image.getchannel("A"))
            background.save(destination, format="JPEG", quality=91, optimize=True)
    raise SystemExit(0)

target, *paths = sys.argv[1:]
tiles = []
for path in paths:
    with Image.open(path) as original:
        image = ImageOps.exif_transpose(original).convert("RGBA")
        image.thumbnail((520, 275), Image.Resampling.LANCZOS)
        tiles.append(image)

widths = [max(140, image.width + 12) for image in tiles]
board = Image.new("RGB", (sum(widths), 310), "white")
draw = ImageDraw.Draw(board)
left = 0
for index, (image, width) in enumerate(zip(tiles, widths), 1):
    board.paste(image, (left + (width - image.width) // 2, (280 - image.height) // 2),
                image.getchannel("A"))
    draw.text((left + width // 2, 286), str(index), fill="black", anchor="mt")
    left += width
board.save(target)
