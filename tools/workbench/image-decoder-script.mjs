export const originalDecodeScript = `import sys, io, json, warnings
from PIL import Image, ImageFile
warnings.simplefilter('error')
Image.MAX_IMAGE_PIXELS = 20000000
ImageFile.LOAD_TRUNCATED_IMAGES = False
data = sys.stdin.buffer.read(8388609)
if len(data) > 8388608: raise ValueError('image too large')
im = Image.open(io.BytesIO(data))
if im.format not in ('PNG', 'JPEG'): raise ValueError('unsupported image format')
if im.width * im.height > 20000000: raise ValueError('too many pixels')
if getattr(im, 'n_frames', 1) != 1: raise ValueError('animated images unsupported')
fmt, width, height = im.format, im.width, im.height
im.verify()
im = Image.open(io.BytesIO(data))
im.load()
if fmt == 'PNG' and not data.endswith(bytes.fromhex('0000000049454e44ae426082')): raise ValueError('truncated PNG')
if fmt == 'JPEG' and not data.endswith(b'\\xff\\xd9'): raise ValueError('truncated JPEG')
print(json.dumps(dict(mediaType='image/png' if fmt == 'PNG' else 'image/jpeg', width=width, height=height)))`;;
