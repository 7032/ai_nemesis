import { Entity } from "./entity.js";
import { RingBullet } from "./ringbullet.js";
import { clamp } from "../utils.js";

export class Moai extends Entity {
  constructor(x, onCeil=false) {
    super();
    this.x = x;
    this.onCeil = onCeil;
    this.hp = 22;
    this.fireTimer = 2.0;
    this.r = 28;
  }

  takeDamage(dmg, w) {
    this.hp -= dmg;
    if (this.hp <= 0) {
      this.dead = true;
      w.onEnemyKilled(this);
    }
  }

  update(dt, w) {
    this.x -= 120 * dt;

    if (this.onCeil)
      this.y = w.terrain.ceilingAt(this.x) + 28;
    else
      this.y = w.terrain.floorAt(this.x) - 28;

    this.fireTimer -= dt;
    if (this.fireTimer <= 0) {
      this.fireTimer = 3.0;

      const p = w.player;
      const dx = p.x - this.x;
      const dy = p.y - this.y;
      const len = Math.hypot(dx,dy) || 1;

      const vx = (dx/len)*180;
      const vy = (dy/len)*180;

      w.enemies.push(new RingBullet(this.x-20, this.y, vx, vy));
    }

    if (this.x < -100) this.dead = true;
  }

  draw(g) {
    g.save();
    g.translate(this.x, this.y);

    g.fillStyle = "rgba(140,140,150,1)";
    g.beginPath();
    g.roundRect(-24,-36,48,72,12);
    g.fill();

    g.fillStyle = "black";
    g.fillRect(-8,-10,6,6);
    g.fillRect(2,-10,6,6);

    g.restore();
  }
}
