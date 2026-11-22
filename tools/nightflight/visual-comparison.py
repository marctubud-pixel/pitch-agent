"""Keep the full original framing and a common height for comparative reading."""
import hashlib
import io
import json
import sys
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageOps, ImageStat


def open_verified(source, expected_hash):
    original_bytes = Path(source).read_bytes()
    if hashlib.sha256(original_bytes).hexdigest() != expected_hash:
        raise ValueError("Original image hash does not match input")
    return Image.open(io.BytesIO(original_bytes))


def write_png(image, destination):
    with tempfile.NamedTemporaryFile(dir=Path(destination).parent, delete=False) as target:
        temporary = Path(target.name)
    try:
        image.save(temporary, format="PNG")
        temporary.replace(destination)
    finally:
        temporary.unlink(missing_ok=True)


if sys.argv[1] == "--crop-box":
    source, destination, expected_hash = sys.argv[2:5]
    left, top, right, bottom = map(int, sys.argv[5:])
    if not (0 <= left < right <= 1000 and 0 <= top < bottom <= 1000):
        raise ValueError("Invalid normalized crop bounds")
    with open_verified(source, expected_hash) as original:
        image = ImageOps.exif_transpose(original)
        width, height = image.size
        crop = image.crop((width * left // 1000, height * top // 1000,
                           (width * right + 999) // 1000, (height * bottom + 999) // 1000))
        write_png(crop, destination)
    print(json.dumps(crop.size))
    raise SystemExit(0)

if sys.argv[1] == "--mask-boxes":
    source, destination, expected_hash, data = sys.argv[2:]
    with open_verified(source, expected_hash) as original:
        image = ImageOps.exif_transpose(original).convert("RGB")
    width, height = image.size
    coverage = Image.new("L", image.size)
    draw = ImageDraw.Draw(coverage)
    boxes = []
    for left, top, right, bottom in json.loads(data):
        if not (0 <= left < right <= 1000 and 0 <= top < bottom <= 1000):
            raise ValueError("Invalid normalized mask bounds")
        box = (max(0, width * left // 1000 - 4), max(0, height * top // 1000 - 4),
               min(width, (width * right + 999) // 1000 + 4), min(height, (height * bottom + 999) // 1000 + 4))
        boxes.append(box)
        draw.rectangle((box[0], box[1], box[2]-1, box[3]-1), fill=255)
    covered = coverage.histogram()[255]
    if not boxes or covered > width * height * 0.45:
        print("null")
        raise SystemExit(0)
    clear = ImageOps.invert(coverage)
    masked = image.copy()
    for left, top, right, bottom in boxes:
        nearby = (max(0, left - 8), max(0, top - 8), min(width, right + 8), min(height, bottom + 8))
        sample = clear.crop(nearby)
        if sample.getbbox() is None:
            print("null")
            raise SystemExit(0)
        fill = tuple(ImageStat.Stat(image.crop(nearby), sample).median)
        masked.paste(fill, (left, top, right, bottom))
    write_png(masked, destination)
    print(json.dumps([width, height, covered]))
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
