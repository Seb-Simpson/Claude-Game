/** On-screen captions for sound cues, shown only when subtitles are enabled. */
export class Captions {
  constructor(root) { this.root = root; this.enabled = false; }
  show(text) {
    if (!this.enabled) return;
    const c = document.createElement('div');
    c.className = 'caption';
    c.textContent = text;
    this.root.append(c);
    while (this.root.children.length > 3) this.root.firstChild.remove();
    setTimeout(() => { c.style.opacity = '0'; }, 2200);
    setTimeout(() => c.remove(), 2900);
  }
  clear() { this.root.replaceChildren(); }
}
