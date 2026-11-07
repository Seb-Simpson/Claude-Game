/** Loads SVG sprites and rasterises them to canvases at a chosen scale. */
const SPRITES = [
  'climber-idle', 'climber-reach', 'climber-pull', 'climber-hang', 'climber-fall', 'climber-breathe',
  'ice-axe', 'rope', 'tent', 'flag', 'piton', 'food', 'oxygen', 'summit-flag', 'crate',
];

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

export class Assets {
  constructor() { this.images = {}; this.raster = {}; }
  async load(base = 'assets/sprites/', onProgress) {
    let done = 0;
    await Promise.all(SPRITES.map(async (name) => {
      this.images[name] = await loadImage(`${base}${name}.svg`);
      done++;
      onProgress && onProgress(done / SPRITES.length);
    }));
    return this;
  }
  /** Rasterised canvas of a sprite at a given pixel height (cached). */
  get(name, height) {
    const key = name + '@' + height;
    let c = this.raster[key];
    if (c) return c;
    const img = this.images[name];
    c = document.createElement('canvas');
    if (!img) { c.width = c.height = 1; this.raster[key] = c; return c; }
    const ratio = (img.naturalWidth || img.width || 1) / (img.naturalHeight || img.height || 1);
    c.height = Math.max(1, Math.round(height));
    c.width = Math.max(1, Math.round(height * ratio));
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    this.raster[key] = c;
    return c;
  }
}
