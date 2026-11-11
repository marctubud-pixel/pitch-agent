const { readFileSync } = require('node:fs');
const systemFetch = global.fetch;
module.exports = function install(canvasPackage) {
  const { createCanvas, Image: NativeImage, GlobalFonts } = require(canvasPackage);
  if (!GlobalFonts.has('PingFang SC')) {
    const path = require('node:fs').globSync('/System/Library/AssetsV2/com_apple_MobileAsset_Font*/*.asset/AssetData/PingFang.ttc')[0];
    if (!path || !GlobalFonts.registerFromPath(path,'PingFang SC')) throw new Error('Missing local PingFang SC');
  }
  class LocalImage {
    image = new NativeImage();
    set src(url) {
      if (!url.startsWith('blob:')) throw new Error('Only locally generated artwork is accepted');
      systemFetch(url).then(r => r.arrayBuffer()).then(b => {
        this.image.onload = () => this.onload?.();
        this.image.onerror = e => this.onerror?.(e);
        this.image.src = Buffer.from(b);
      }).catch(e => this.onerror?.(e));
    }
  }
  function canvas() {
    const c = createCanvas(1, 1), ctx = c.getContext('2d');
    const draw = ctx.drawImage.bind(ctx);
    ctx.drawImage = (img,...args) => draw(img instanceof LocalImage ? img.image : img,...args);
    return c;
  }
  global.document = { createElement(tag) { if (tag !== 'canvas') throw new Error('CLI only implements canvas'); return canvas(); } };
  global.Image = LocalImage;
  global.fetch = async (url, init) => {
    init?.signal?.throwIfAborted();
    const u = new URL(url);
    if (u.origin !== 'http://localhost' || !u.pathname.startsWith('/research-case/')) throw new Error('No external asset reads');
    return new Response(readFileSync(new URL('../public'+u.pathname, require('node:url').pathToFileURL(__filename))));
  };
};
