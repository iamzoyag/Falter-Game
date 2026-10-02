import { settings } from "../settings.js";
import { FLASH_URLS } from "../config.js";

// Full-screen subliminal image flashes — a 1-bit face for a fraction of a
// second, gone before the player is sure they saw it.
export class ImageFlash {
  /** @param {HTMLElement} el the #image-flash element */
  constructor(el) {
    this.el = el;
    this.images = [];
    this._timer = null;
  }

  async preload() {
    const loaded = await Promise.all(FLASH_URLS.map((url) => new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null); // missing files are fine
      img.src = url;
    })));
    this.images = loaded.filter(Boolean);
    return this.images.length;
  }

  randomUrl() {
    return this.images.length ? this.images[Math.floor(Math.random() * this.images.length)].src : null;
  }

  /** Show a random image for `ms`. Returns false if there are no images. */
  flash(ms = 110, { invert = Math.random() < 0.3 } = {}) {
    const url = this.randomUrl();
    if (!url) return false;
    const calm = settings.reduceFlashing; // fade in/out, never inverted, held a little longer
    this.el.style.backgroundImage = `url("${url}")`;
    this.el.classList.toggle("invert", invert && !calm);
    this.el.classList.toggle("calm", calm);
    this.el.classList.add("show");
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this.el.classList.remove("show"), calm ? Math.max(ms, 450) : ms);
    return true;
  }
}