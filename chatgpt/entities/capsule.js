import { TAU } from "../config.js";
import { rand, clamp } from "../utils.js";
import { Entity } from "./entity.js";

export class Capsule extends Entity {
  constructor(x, y) {
    super();
    this.x = x; this.y = y;
    this.vx = -120;
    this.vy = rand(-20, 20);
    this.r = 8;
    this.phase = rand(0, TAU);
  }

  update(dt, w) {
    this.phase += dt * 4.5;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.vy += Math.sin(this.phase) * 18 * dt;

    const ceil = w.terrain.ceilingAt(this.x);
    const floor = w.terrain.floorAt(this.x);
    this.y = clamp(this.y, ceil + 22, floor - 22);

    if (this.x < -60) this.dead = true;

    const p = w.player;
    if (p && !p.dead) {
      const dx = this.x - p.x, dy = this.y - p.y;
      if (dx * dx + dy * dy <= (this.r + 14) * (this.r + 14)) {
        this.dead = true;
        w.audio.beep("square", 920, 0.06, 0.12);
        w.powerUp.gainCapsule();
      }
    }
  }

  draw(g) {
    g.save();
    g.translate(this.x, this.y);
    const bob = Math.sin(this.phase) * 2.5;
    g.translate(0, bob);
    g.shadowColor = "rgba(120,240,255,.75)";
    g.shadowBlur = 16;
    g.fillStyle = "rgba(120,240,255,1)";
    g.beginPath(); g.roundRect(-10, -8, 20, 16, 6); g.fill();
    g.shadowBlur = 0;
    g.fillStyle = "rgba(5,10,20,.9)";
    g.beginPath(); g.roundRect(-7, -5, 14, 10, 4); g.fill();
    g.restore();
  }
}
