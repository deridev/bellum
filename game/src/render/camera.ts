import { Y_MAX, Y_MIN } from '../geo';
/** View over the projected world. x wraps around the globe; y is clamped. */
export class Camera {
  x = 20; y = 25; upp = 0.12; // world units per CSS pixel
  w = 1; h = 1; dpr = 1;
  toScreen(x: number, y: number): [number, number] {
    let dx = x - this.x; dx -= Math.round(dx / 360) * 360;
    return [dx / this.upp + this.w / 2, (this.y - y) / this.upp + this.h / 2];
  }
  toWorld(sx: number, sy: number): [number, number] { return [this.x + (sx - this.w / 2) * this.upp, this.y - (sy - this.h / 2) * this.upp]; }
  clamp() {
    const maxUpp = Math.min(360 / this.w, (Y_MAX - Y_MIN) / this.h) * 1.02;
    this.upp = Math.min(maxUpp, Math.max(0.0015, this.upp));
    this.x = ((this.x + 180) % 360 + 360) % 360 - 180;
    const half = this.h / 2 * this.upp;
    this.y = Y_MAX - Y_MIN < 2 * half ? (Y_MAX + Y_MIN) / 2 : Math.min(Y_MAX - half, Math.max(Y_MIN + half, this.y));
  }
  zoomAt(sx: number, sy: number, f: number) {
    const [wx, wy] = this.toWorld(sx, sy); this.upp /= f; this.clamp();
    const [nx, ny] = this.toWorld(sx, sy); this.x += wx - nx; this.y += wy - ny; this.clamp();
  }
  /** world units visible horizontally */
  get spanX() { return this.w * this.upp; }
}
