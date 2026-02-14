import { TAU } from "../config.js";
import { Entity } from "./entity.js";

export class Bullet extends Entity {
  constructor(x, y, vx, vy, r = 3, dmg = 1, friendly = true, kind = "round") {
    super();
    this.x = x; this.y = y; this.vx = vx; this.vy = vy;
    this.r = r; this.dmg = dmg; this.friendly = friendly; this.kind = kind;
  }
  update(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
  }
  outOfBounds() {
    return (this.x < -120 || this.x > 960 + 140 || this.y < -160 || this.y > 540 + 160);
  }
  draw(g) {
    g.save();
    if (this.friendly) {
      g.fillStyle = "rgba(150,230,255,1)";
      g.shadowColor = "rgba(100,220,255,.6)";
    } else {
      g.fillStyle = "rgba(255,160,180,1)";
      g.shadowColor = "rgba(255,120,150,.55)";
    }
    g.shadowBlur = 10;
    g.beginPath();
    if (this.kind === "needle" || this.kind === "missile") {
      g.ellipse(this.x, this.y, this.r * 1.8, this.r * 0.9, Math.atan2(this.vy, this.vx), 0, TAU);
    } else {
      g.arc(this.x, this.y, this.r, 0, TAU);
    }
    g.fill();
    g.restore();
  }
}
