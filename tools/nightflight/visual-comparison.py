"""Keep the full original framing and a common height for comparative reading."""
import sys
from PIL import Image, ImageDraw, ImageOps

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
