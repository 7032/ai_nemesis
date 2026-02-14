import { TAU } from "./config.js";
import { clamp } from "./utils.js";

export class Particle {
  constructor(x, y, vx, vy, life, kind = "spark") {
    this.x = x; this.y = y; this.vx = vx; this.vy = vy;
    this.life = life; this.maxLife = life; this.kind = kind;
    this.r = kind === "big" ? 5 : kind === "glow" ? 10 : 2;
  }
  update(dt) {
    this.life -= dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.vx *= Math.pow(0.12, dt);
    this.vy *= Math.pow(0.12, dt);
  }
  draw(g) {
    const t = clamp(this.life / this.maxLife, 0, 1);
    g.save();
    g.globalAlpha = t;
    if (this.kind === "spark") {
      g.fillStyle = "rgba(200,240,255,1)";
      g.beginPath(); g.arc(this.x, this.y, this.r, 0, TAU); g.fill();
    } else if (this.kind === "big") {
      g.fillStyle = "rgba(255,220,160,1)";
      g.beginPath(); g.arc(this.x, this.y, this.r * (1 + (1 - t) * 1.8), 0, TAU); g.fill();
    } else {
      g.fillStyle = "rgba(120,220,255,1)";
      g.beginPath(); g.arc(this.x, this.y, this.r * (1 + (1 - t) * 2.5), 0, TAU); g.fill();
    }
    g.restore();
  }
}
