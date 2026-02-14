import { Entity } from "./entity.js";
import { TAU } from "../config.js";

export class RingBullet extends Entity {
  constructor(x, y, vx, vy) {
    super();
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;

    this.r = 18;        // 自機と同程度
    this.hp = 3;        // 破壊可能
    this.dead = false;
  }

  takeDamage(dmg, w) {
    this.hp -= dmg;
    if (this.hp <= 0) {
      this.dead = true;
      w.spawnExplosion(this.x, this.y, 0.4, true);
      w.audio.beep("triangle", 800, 0.05, 0.08); // 破壊音
    }
  }

  update(dt, w) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (this.x < -60) this.dead = true;
  }

  draw(g) {
    g.save();
    g.strokeStyle = "rgba(255,160,80,1)";
    g.lineWidth = 5;
    g.shadowColor = "rgba(255,140,40,.8)";
    g.shadowBlur = 20;
    g.beginPath();
    g.arc(this.x, this.y, this.r, 0, TAU);
    g.stroke();
    g.restore();
  }
}
