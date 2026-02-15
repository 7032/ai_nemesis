import { Entity } from "./entity.js";
import { CONFIG } from "../config.js";

export class Laser extends Entity {
  constructor(x, y, speed, level, sourceId) {
    super();
    this.x = x;
    this.y = y;
    this.vx = speed;
    this.vy = 0;
    this.level = level;
    this.sourceId = sourceId;

    this.friendly = true;
    this.kind = "laser";
    this.dmg = CONFIG.SHOT.dmg * 2.0;
    // User said "2x speed of shot". Damage? "Buff Laser DPS (10x power)" from task list earlier?
    // Task.md says "- [x] Buff Laser DPS (10x power)".
    // Previous `applyLaserTickFrom` used `CONFIG.LASER.dps`.
    // Now it's a projectile. One hit per enemy? Or piercing?
    // "Laser" usually penetrates or hits continuously?
    // Projectile laser in Gradius usually penetrates.
    // If it penetrates, it shouldn't die on contact.
    // But `world.js` `handleCollisions` sets `b.dead = true` on hit.
    // I need to change that if it penetrates.
    // User didn't explicitly say "penetrate".
    // But "Laser" usually implies it.
    // "Buff Laser DPS (10x power)" - if I make it single hit, it needs HUGE damage.
    // Or I make it penetrate.
    // If I make it penetrate, `handleCollisions` needs update.

    // Length
    // Lvl 1: 50% W = 480
    // Lvl 2: 80% W = 768
    this.length = (level >= 2) ? (CONFIG.W * 0.8) : (CONFIG.W * 0.5);

    // Thickness
    // Lvl 2: 3x Thickness
    this.h = (level >= 2) ? CONFIG.LASER.widthGlow * 3 : CONFIG.LASER.widthGlow;
    // Actually visual width vs hitbox width.
    // Hitbox width
    this.r = this.h / 2;
  }

  update(dt) {
    this.x += this.vx * dt;
  }

  outOfBounds() {
    // Tail is at x - length.
    // If tail > CONFIG.W + margin, then it's gone.
    return (this.x - this.length > CONFIG.W + 100);
  }

  draw(g) {
    g.save();
    g.translate(this.x, this.y);

    const glowW = this.h;
    const coreW = glowW * 0.4;

    // Draw from 0 to -length (it moves right, trailing tail left)
    // Or maybe x is head? Yes.

    g.globalAlpha = 0.8;
    g.shadowColor = "rgba(100,220,255,0.8)";
    g.shadowBlur = 12;

    // Core
    g.fillStyle = "rgba(200,255,255,1)";
    g.fillRect(-this.length, -coreW / 2, this.length, coreW);

    // Glow
    g.globalAlpha = 0.4;
    g.fillStyle = "rgba(100,220,255,1)";
    g.fillRect(-this.length, -glowW / 2, this.length, glowW);

    g.restore();
  }
}
