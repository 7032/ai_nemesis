import { Entity } from "./entity.js";
import { CONFIG } from "../config.js";
import { rand } from "../utils.js";

export class Tentacle extends Entity {
  constructor(x, y, isCeil, length = 12) { // Length doubled default
    super();
    this.x = x;
    this.y = y;
    this.isCeil = isCeil;
    this.baseAngle = isCeil ? Math.PI * 0.5 : -Math.PI * 0.5;

    this.segments = [];
    this.length = length;
    this.swaySpeed = rand(0.8, 1.4);
    this.swayOffset = rand(0, 10);

    this.fireTimer = rand(1.0, 2.5); // Faster fire start
    this.laserHitFrames = 0;

    // Create segments
    for (let i = 0; i < length; i++) {
      this.segments.push({
        x: x, y: y,
        hp: 8,
        r: Math.max(3, 14 - i), // taper with min size
        dead: false
      });
    }
  }

  checkHit(bx, by, br) {
    for (let i = 0; i < this.segments.length; i++) {
      const seg = this.segments[i];
      if (seg.dead) continue;
      const dist = Math.hypot(seg.x - bx, seg.y - by);
      // Hit if overlaps
      if (dist < seg.r + br) return true;
    }
    return false;
  }

  checkLaserHit(lx, ly, lw) {
    for (const seg of this.segments) {
      if (seg.dead) continue;
      if (seg.x < lx) continue;

      const dy = Math.abs(seg.y - ly);
      if (dy < seg.r + lw) return true;
    }
    return false;
  }

  killAll(w) {
    if (this.dead) return;
    this.dead = true;
    w.audio.beep("noise", 100, 0.2, 0.4);
    w.onEnemyKilled({ score: 2000, x: this.segments[0].x, y: this.segments[0].y, formationId: null });

    for (const seg of this.segments) {
      if (!seg.dead) {
        seg.dead = true;
        w.spawnExplosion(seg.x, seg.y, 0.4);
      }
    }
  }

  takeLaserDamage(dmg, w, laser) {
    const lx = laser.x;
    const tail = lx - laser.length;
    const ly = laser.y;
    const lr = laser.r;

    let anyHit = false;

    for (let i = 0; i < this.segments.length; i++) {
      const seg = this.segments[i];
      if (seg.dead) continue;

      // Check collision with Laser Rect (Relaxed)
      const dy = Math.abs(seg.y - ly);
      // Add significant padding to make it easy to hit
      if (dy < seg.r + lr + 24) {
        // X check with padding
        if (seg.x + seg.r + 15 > tail && seg.x - seg.r - 15 < lx) {
          // Hit
          anyHit = true;
          seg.hp -= dmg * 5.0; // Massive damage multiplier against tentacles

          if (seg.hp <= 0) {
            seg.dead = true;
            w.spawnExplosion(seg.x, seg.y, 0.4);
            w.onEnemyKilled({ score: 100, x: seg.x, y: seg.y, formationId: null });

            // Break outer segments
            for (let k = i + 1; k < this.segments.length; k++) {
              if (!this.segments[k].dead) {
                this.segments[k].dead = true;
                w.spawnExplosion(this.segments[k].x, this.segments[k].y, 0.3);
              }
            }
          }
        }
      }
    }

    if (anyHit) {
      this.laserHitFrames++;
      if (this.laserHitFrames > 30) { // ~0.25 sec
        this.killAll(w);
      }
      // Feedback sound
      if (w.time % 0.1 < 0.02) w.audio.beep("sawtooth", 500, 0.03, 0.03);
    }
  }

  takeDamage(dmg, w, hitX, hitY) {
    // Find closest segment to hit
    let bestDist = 999;
    let bestIdx = -1;

    for (let i = 0; i < this.segments.length; i++) {
      const seg = this.segments[i];
      if (seg.dead) continue;
      const dist = Math.hypot(seg.x - hitX, seg.y - hitY);
      if (dist < seg.r + 10 && dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    }

    if (bestIdx !== -1) {
      const seg = this.segments[bestIdx];
      seg.hp -= dmg;
      w.audio.beep("sawtooth", 400 + bestIdx * 50, 0.05, 0.05);

      if (seg.hp <= 0) {
        seg.dead = true;
        w.spawnExplosion(seg.x, seg.y, 0.4);
        w.onEnemyKilled({ score: 100, x: seg.x, y: seg.y, formationId: null });

        // Break logic: if a segment breaks, all child segments (further out) die too?
        // "関節が壊されちぎれた触手からは弾は出てきません"
        // -> Disconnect logic. 
        // If segment i dies, segments i+1...last are detached/killed.
        for (let k = bestIdx + 1; k < this.segments.length; k++) {
          if (!this.segments[k].dead) {
            this.segments[k].dead = true;
            w.spawnExplosion(this.segments[k].x, this.segments[k].y, 0.3);
          }
        }
      }
    }
  }

  update(dt, w) {
    this.x -= CONFIG.STAGE.scrollSpeed * dt; // Scroll with world

    // Check root
    if (this.segments[0].dead) {
      this.dead = true;
      return;
    }

    // Update segment positions (FK)
    let cx = this.x;
    let cy = this.y;
    // Base position follows terrain or scroll? 
    // Usually fixed to terrain. 
    // Recalculate base y based on terrain?
    if (this.isCeil) cy = w.terrain.ceilingAt(this.x);
    else cy = w.terrain.floorAt(this.x);

    this.segments[0].x = cx;
    this.segments[0].y = cy;

    for (let i = 1; i < this.length; i++) {
      if (this.segments[i].dead) break;

      const sway = Math.sin(w.time * this.swaySpeed + i * 0.4 + this.swayOffset) * 0.3;
      const angle = this.baseAngle + sway;

      cx += Math.cos(angle) * 24;
      cy += Math.sin(angle) * 24;

      this.segments[i].x = cx;
      this.segments[i].y = cy;
    }

    // Collision with player
    const p = w.player;
    if (p && p.canBeHit()) {
      for (let i = 0; i < this.length; i++) {
        const seg = this.segments[i];
        if (seg.dead) continue;
        const dist = Math.hypot(p.x - seg.x, p.y - seg.y);
        // Simple circle collision
        if (dist < seg.r + 6) { // 6 is approx player hit radius
          p.takeHit();
          break;
        }
      }
    }

    // Firing from active tip
    let tip = null;
    for (let i = this.length - 1; i >= 0; i--) {
      if (!this.segments[i].dead) {
        tip = this.segments[i];
        break;
      }
    }

    if (tip) {
      this.fireTimer -= dt;
      if (this.fireTimer <= 0) {
        this.fireTimer = 0.3; // Rapid fire
        if (p) {
          const dx = p.x - tip.x;
          const dy = p.y - tip.y;
          const len = Math.hypot(dx, dy);
          // Faster bullet, aim at player
          w.spawnBullet(tip.x, tip.y, (dx / len) * 140, (dy / len) * 140, 4, 1, false, "round");
        }
      }
    }

    if (this.x < -100) this.dead = true;
  }

  draw(g) {
    g.fillStyle = "rgba(100, 200, 100, 1)";
    g.strokeStyle = "rgba(50, 150, 50, 1)";

    for (let i = 0; i < this.length; i++) {
      const seg = this.segments[i];
      if (seg.dead) continue;

      g.beginPath();
      g.arc(seg.x, seg.y, seg.r, 0, Math.PI * 2);
      g.fill();
      g.stroke();

      // Connect to prev
      if (i > 0) {
        const prev = this.segments[i - 1];
        g.beginPath();
        g.moveTo(prev.x, prev.y);
        g.lineTo(seg.x, seg.y);
        g.lineWidth = seg.r;
        g.stroke();
        g.lineWidth = 1;
      }
    }
  }
}
