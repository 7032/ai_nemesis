import { rand } from "./utils.js";

export class Camera {
  constructor() { this.shakeT = 0; this.shakeA = 0; }
  shake(amount = 6, t = 0.18) {
    this.shakeA = Math.max(this.shakeA, amount);
    this.shakeT = Math.max(this.shakeT, t);
  }
  update(dt) {
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      if (this.shakeT <= 0) { this.shakeT = 0; this.shakeA = 0; }
    }
  }
  apply(ctx) {
    if (this.shakeT <= 0) return;
    const a = this.shakeA * (this.shakeT / 0.18);
    ctx.translate(rand(-a, a), rand(-a, a));
  }
}
