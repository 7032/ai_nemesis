import { CONFIG, TAU } from "../config.js";
import { clamp, lerp, approach0 } from "../utils.js";
import { Entity } from "./entity.js";

export class Player extends Entity {
  constructor(w) {
    super();
    this.w = w;
    this.x = 130; this.y = CONFIG.H / 2;
    this.vx = 0; this.vy = 0;

    this.lives = 3;
    this.score = 0;
    this.mult = 1;
    this.multT = 0;

    this.invulnT = 1.0;
    this.shieldFlashT = 0;

    this.shotT = 0;
    this.missileT = 0;

    this.laserOn = false;
    this.laserGrace = 0;
    this._laserHitStopCooldown = 0;
    this._laserTickAcc = 0;

    this.path = [];
    this.pathMax = 3600;
    this.optionState = [];
    this.optionLock = [];
    this._wasIdle = false;

    this.respawnPending = false;
  }

  canBeHit() { return this.invulnT <= 0 && !this.dead; }
  addScore(pts) { this.score += Math.floor(pts); }

  pushPath() {
    this.path.push({ x: this.x, y: this.y, t: this.w.time });
    if (this.path.length > this.pathMax) this.path.shift();
  }

  isIdle() {
    return Math.abs(this.vx) < CONFIG.PLAYER.idleDeadzone && Math.abs(this.vy) < CONFIG.PLAYER.idleDeadzone;
  }

  optionTarget(index, pu) {
    const form = pu.formation;

    if (form === 0) {
      const delay = CONFIG.OPTION.followDelay * (index + 1);
      const targetT = this.w.time - delay;
      for (let i = this.path.length - 1; i >= 0; i--) {
        if (this.path[i].t <= targetT) return { x: this.path[i].x, y: this.path[i].y };
      }
      return { x: this.x, y: this.y };
    }

    if (form === 1) {
      const k = index - (pu.optionCount - 1) / 2;
      return { x: this.x - 26 - index * 12, y: this.y + k * 42 };
    }

    return { x: this.x - 34 - index * 26, y: this.y };
  }

  getOptionPos(index, pu) {
    const idle = this.isIdle();

    if (idle && !this._wasIdle) {
      for (let i = 0; i < pu.optionCount; i++) {
        const cur = this.optionState[i] ? { x: this.optionState[i].x, y: this.optionState[i].y } : { x: this.x, y: this.y };
        this.optionLock[i] = cur;
      }
    }
    if (!idle && this._wasIdle) this.optionLock = [];
    this._wasIdle = idle;

    if (idle && this.optionLock[index]) return this.optionLock[index];

    const target = this.optionTarget(index, pu);
    if (!this.optionState[index]) this.optionState[index] = { x: target.x, y: target.y };

    const s = this.optionState[index];
    const alpha = 1 - Math.pow(1 - CONFIG.OPTION.followLerp, 60 * this.w.lastDt);
    s.x = lerp(s.x, target.x, alpha);
    s.y = lerp(s.y, target.y, alpha);
    return s;
  }

  takeHit() {
    const pu = this.w.powerUp;
    const a = this.w.audio;
    if (this.invulnT > 0) return;

    if (pu.shield) {
      pu.shield = false;
      this.invulnT = CONFIG.PLAYER.invulnOnShieldBreak;
      this.shieldFlashT = 0.3;
      this.w.camera.shake(10, 0.2);
      a.noiseBurst(0.10, 0.20);
      a.beep("sawtooth", 160, 0.12, 0.12);
      for (let i = 0; i < 18; i++) {
        this.w.spawnSpark(this.x, this.y, 0.35);
      }
      return;
    }

    this.lives -= 1;
    this.w.powerUp.onDeathPenalty();
    this.invulnT = 999;
    this.dead = true;
    this.respawnPending = true;

    a.duckBGM(0.35, 0.25);
    a.noiseBurst(0.12, 0.26);
    a.beep("sawtooth", 120, 0.18, 0.14);
    this.w.camera.shake(16, 0.28);

    for (let i = 0; i < 38; i++) {
      this.w.spawnExplosion(this.x, this.y, 0.6, i % 5 === 0);
    }
  }

  respawn() {
    this.dead = false;
    this.respawnPending = false;
    this.x = 130; this.y = CONFIG.H / 2;
    this.vx = 0; this.vy = 0;
    this.invulnT = CONFIG.PLAYER.respawnIFrames;
    this.w.respawnBoostT = CONFIG.POWERUP.capsuleDropRespawnDuration;
    this.mult = 1; this.multT = 0;

    this.optionState = [];
    this.optionLock = [];
    this._wasIdle = false;
  }

  applyLaserTickFrom(x0, y0, dmgMul, power = 1.0, level = 1) {
    const w = this.w;
    const ramp = clamp(this.laserGrace / CONFIG.LASER.startGrace, 0, 1);
    const dps = CONFIG.LASER.dps * dmgMul * power * (0.35 + 0.65 * ramp);
    const dmg = dps / CONFIG.LASER.tickRate;

    const widthMul = (level >= 2) ? 3.0 : 1.0;
    const maxLen = (level === 1) ? 450 : 2000; // Lvl 1: Short beam

    let hit = false;

    for (const e of w.enemies) {
      if (e.dead) continue;
      // Hitbox X check (Beam is rightward)
      if (e.x + (e.r || 18) < x0) continue;
      if (e.x - (e.r || 18) > x0 + maxLen) continue; // Range limit

      let isHit = false;

      if (typeof e.checkLaserHit === "function") {
        const lw = CONFIG.LASER.widthCore * 0.6 * widthMul;
        if (e.checkLaserHit(x0, y0, lw)) isHit = true;
      } else {
        // Circle / Band check
        const dy = Math.abs(e.y - y0);
        const rr = (e.r || 18);
        if (dy <= (CONFIG.LASER.widthCore * 0.6 * widthMul + rr * 0.7)) isHit = true;
      }

      if (isHit) {
        hit = true;
        if (typeof e.takeLaserDamage === "function") {
          e.takeLaserDamage(dmg, w);
        } else if (typeof e.takeDamage === "function" && e.takeDamage.length >= 3) {
          e.isBoss = true;
          e.takeDamage(dmg, w, e.x - 40, y0);
        } else {
          e.takeDamage?.(dmg, w);
        }
      }
    }

    if (hit && this._laserHitStopCooldown <= 0) {
      this._laserHitStopCooldown = 0.18;
      w.hitStopMs = Math.max(w.hitStopMs, CONFIG.LASER.hitStopMs);
    }
  }

  update(dt, w) {
    if (this.respawnPending) {
      this.invulnT -= dt;
      if (this.invulnT < 998.2 && this.lives >= 0) this.respawn();
      else if (this.lives < 0) w.gameOver = true;
      return;
    }

    this.invulnT = Math.max(0, this.invulnT - dt);
    this.shieldFlashT = Math.max(0, this.shieldFlashT - dt);
    this._laserHitStopCooldown = Math.max(0, this._laserHitStopCooldown - dt);
    this.multT = Math.max(0, this.multT - dt);
    if (this.multT <= 0) this.mult = 1;

    const inp = w.input;
    const pu = w.powerUp;
    pu.update(dt);

    const ix = (inp.down("ArrowRight") || inp.down("KeyD") ? 1 : 0) - (inp.down("ArrowLeft") || inp.down("KeyA") ? 1 : 0);
    const iy = (inp.down("ArrowDown") || inp.down("KeyS") ? 1 : 0) - (inp.down("ArrowUp") || inp.down("KeyW") ? 1 : 0);

    const spMul = pu.speedMultiplier();
    const maxSp = Math.min(CONFIG.PLAYER.maxSpeed, CONFIG.PLAYER.baseSpeed * spMul);

    this.vx += ix * CONFIG.PLAYER.accel * dt;
    this.vy += iy * CONFIG.PLAYER.accel * dt;
    if (ix === 0) this.vx = approach0(this.vx, CONFIG.PLAYER.decel * dt);
    if (iy === 0) this.vy = approach0(this.vy, CONFIG.PLAYER.decel * dt);

    const vlen = Math.hypot(this.vx, this.vy);
    if (vlen > maxSp) {
      const s = maxSp / (vlen || 1);
      this.vx *= s; this.vy *= s;
    }

    this.x += this.vx * dt;
    this.y += this.vy * dt;

    const ceil = w.terrain.ceilingAt(this.x);
    const floor = w.terrain.floorAt(this.x);
    const margin = CONFIG.PLAYER.terrainMargin;

    const minY = ceil + margin;
    const maxY = floor - margin;
    this.y = clamp(this.y, minY, maxY);
    this.x = clamp(this.x, 40, CONFIG.W - 40);

    if (this.canBeHit()) {
      const topHit = (this.y - CONFIG.PLAYER.hitRadiusY) <= (ceil + 4);
      const botHit = (this.y + CONFIG.PLAYER.hitRadiusY) >= (floor - 4);
      if (topHit || botHit) this.takeHit();
    }

    this.pushPath();

    if (inp.tap("KeyC") || inp.tap("Enter")) pu.commit();

    const vHeld = inp.down("KeyV");
    const shotHeld = inp.down("KeyZ") || inp.down("Space") || vHeld;
    const misHeld = inp.down("KeyX") || vHeld;
    const dmgMul = pu.damageMultiplier();

    if (pu.laserLevel > 0) {
      this.laserOn = shotHeld;
      this.laserGrace = lerp(this.laserGrace, this.laserOn ? 1 : 0, 1 - Math.pow(0.0001, dt));
    } else {
      this.laserOn = false;
      this.laserGrace = 0;
    }

    if (pu.laserLevel === 0) {
      if (shotHeld) {
        this.shotT -= dt;
        const level = pu.doubleLevel;
        const rate = (level > 0) ? CONFIG.DOUBLE.rate : CONFIG.SHOT.rate;

        if (this.shotT <= 0) {
          let firedAny = false;
          // Level 0: 1 bullet, Limit 6
          // Level 1: 2 bullets, Limit 6? (User said "Max 3 shots" -> 3 pairs = 6 bullets)
          // Level 2: 3 bullets, Limit 12 (User said "Max 4 shots" -> 4 triplets = 12 bullets)
          const limit = (level === 2) ? 12 : 6;
          const volleySize = (level === 2) ? 3 : (level === 1 ? 2 : 1);

          // 1. Main
          const mainActive = w.bullets.filter(b => b.owner === "player" && b.kind !== "missile" && (!b.sourceId || b.sourceId === "main")).length;
          if (mainActive + volleySize <= limit) {
            const sp = (level > 0 ? CONFIG.DOUBLE.speed : CONFIG.SHOT.speed);
            const dmg = (level > 0 ? 0.85 : 1.0) * dmgMul;

            const mkB = (bx, by, vx, vy, k) => {
              const b = w.spawnBullet(bx, by, vx, vy, 3, dmg, true, k);
              if (b) b.sourceId = "main";
            };

            // Front
            mkB(this.x + 18, this.y, sp, 0, "round");

            if (level === 1) {
              const a = -Math.PI / 4; // 45 deg up
              mkB(this.x + 16, this.y, Math.cos(a) * sp, Math.sin(a) * sp, "needle");
            } else if (level === 2) {
              const a1 = -Math.PI / 6; // 30 deg up
              mkB(this.x + 16, this.y, Math.cos(a1) * sp, Math.sin(a1) * sp, "needle");
              const a2 = -Math.PI / 3; // 60 deg up
              mkB(this.x + 14, this.y, Math.cos(a2) * sp, Math.sin(a2) * sp, "needle");
            }
            firedAny = true;
          }

          // 2. Options
          if (pu.optionCount > 0) {
            for (let i = 0; i < pu.optionCount; i++) {
              const srcId = "opt" + i;
              const optActive = w.bullets.filter(b => b.owner === "player" && b.kind !== "missile" && b.sourceId === srcId).length;

              if (optActive + volleySize <= limit) {
                const op = this.getOptionPos(i, pu);
                const sp = (level > 0 ? CONFIG.DOUBLE.speed : CONFIG.SHOT.speed);
                const dmg = (level > 0 ? 0.55 : 0.55) * dmgMul; // Options have lower dmg? Original code 0.55

                // Helper for Option
                const mkBO = (bx, by, vx, vy, k) => {
                  const b = w.spawnBullet(bx, by, vx, vy, 2.5, dmg, true, k); // r=2.5
                  if (b) b.sourceId = srcId;
                };

                // Front
                mkBO(op.x + 14, op.y, sp, 0, "round");

                if (level === 1) {
                  const a = -Math.PI / 4;
                  mkBO(op.x + 12, op.y, Math.cos(a) * sp, Math.sin(a) * sp, "needle");
                } else if (level === 2) {
                  const a1 = -Math.PI / 6;
                  mkBO(op.x + 12, op.y, Math.cos(a1) * sp, Math.sin(a1) * sp, "needle");
                  const a2 = -Math.PI / 3;
                  mkBO(op.x + 10, op.y, Math.cos(a2) * sp, Math.sin(a2) * sp, "needle");
                }
                firedAny = true;
              }
            }
          }

          if (firedAny) {
            this.shotT = 1 / rate;
            w.audio.beep("square", 520, 0.02, 0.03);
          }
        }
      } else this.shotT = 0;
    }

    if (pu.missileLevel > 0 && misHeld) {
      this.missileT -= dt;
      if (this.missileT <= 0) {
        let fired = false;

        const sp = 210; // Half speed
        const rad60 = Math.PI / 3;
        const rad30 = Math.PI / 6;

        const vx60 = Math.cos(rad60) * sp;
        const vy60 = Math.sin(rad60) * sp; // Down Steep
        const vx30 = Math.cos(rad30) * sp;
        const vy30 = Math.sin(rad30) * sp; // Down Shallow

        // Helper to fire check
        const spawnM = (srcId, countFilterId, vx, vy) => {
          const count = w.bullets.filter(b => b.owner === "player" && b.kind === "missile" && b.sourceId === countFilterId).length;
          // Limit check: Level 2 = 8, else 4
          const limit = (pu.missileLevel >= 2) ? 8 : 4;

          if (count < limit) {
            const m = w.spawnMissile(this.x + 10, this.y + 10, vx, vy, CONFIG.MISSILE.dmg * dmgMul);
            if (m) m.sourceId = srcId;
            return true;
          }
          return false;
        };

        // 1. Main Body
        if (spawnM("main", "main", vx60, vy60)) fired = true;
        // Level 2: Second missile at 30 deg
        if (pu.missileLevel >= 2) {
          if (spawnM("main", "main", vx30, vy30)) fired = true;
        }

        // 2. Options
        for (let i = 0; i < pu.optionCount; i++) {
          const srcId = "opt" + i;
          const op = this.getOptionPos(i, pu);

          const spawnMO = (sId, cId, vx, vy) => {
            const count = w.bullets.filter(b => b.owner === "player" && b.kind === "missile" && b.sourceId === cId).length;
            if (count < 4) {
              const m = w.spawnMissile(op.x, op.y + 10, vx, vy, CONFIG.MISSILE.dmg * dmgMul);
              if (m) m.sourceId = sId;
              return true;
            }
            return false;
          };

          if (spawnMO(srcId, srcId, vx60, vy60)) fired = true;
          if (pu.missileLevel >= 2) {
            if (spawnMO(srcId, srcId, vx30, vy30)) fired = true;
          }
        }

        if (fired) {
          this.missileT = 1.0 / CONFIG.MISSILE.rate;
          w.audio.beep("square", 280, 0.03, 0.04);
        } else {
          this.missileT = 0;
        }
      }
    } else this.missileT = 0;

    // Option fire logic moved to sync with main shot
    // (Laser options are handled in applyLaserTickFrom)

    if (pu.laserLevel > 0 && this.laserGrace > 0.02) {
      this._laserTickAcc += dt;
      const tick = 1 / CONFIG.LASER.tickRate;

      while (this._laserTickAcc >= tick) {
        this._laserTickAcc -= tick;

        // 自機レーザー
        this.applyLaserTickFrom(this.x + 18, this.y, dmgMul, 1.0, pu.laserLevel);

        // オプションレーザー（少し弱め）
        if (pu.optionCount > 0 && (w.input.down("KeyZ") || w.input.down("Space"))) {
          for (let i = 0; i < pu.optionCount; i++) {
            const op = this.getOptionPos(i, pu);
            this.applyLaserTickFrom(op.x + 14, op.y, dmgMul, 0.55, pu.laserLevel);
          }
        }
      }
    } else {
      this._laserTickAcc = 0;
    }
  }

  draw(g, w) {
    const pu = w.powerUp;
    const inv = (this.invulnT > 0);
    const blink = inv && (Math.floor(w.time * 18) % 2 === 0);

    if (!this.dead && pu.optionCount > 0) {
      for (let i = 0; i < pu.optionCount; i++) {
        const op = this.getOptionPos(i, pu);
        g.save();
        g.translate(op.x, op.y);
        g.shadowColor = "rgba(140,240,255,.55)";
        g.shadowBlur = 18;
        g.globalAlpha = 0.82;
        g.fillStyle = "rgba(140,240,255,1)";
        g.beginPath(); g.arc(0, 0, 9, 0, TAU); g.fill();
        g.shadowBlur = 0;
        g.globalAlpha = 1;
        g.fillStyle = "rgba(5,10,20,.85)";
        g.beginPath(); g.arc(0, 0, 5, 0, TAU); g.fill();
        g.restore();
      }
    }

    if (this.dead || blink) return;

    g.save();
    g.translate(this.x, this.y);

    if (pu.shield || this.shieldFlashT > 0) {
      const a = pu.shield ? 0.35 : this.shieldFlashT / 0.3;
      g.save();
      g.globalAlpha = a;
      g.strokeStyle = "rgba(140,240,255,1)";
      g.lineWidth = 3;
      g.shadowColor = "rgba(140,240,255,.8)";
      g.shadowBlur = 18;
      g.beginPath(); g.ellipse(0, 0, 22, 16, 0, 0, TAU); g.stroke();
      g.restore();
    }

    g.shadowColor = "rgba(160,220,255,.35)";
    g.shadowBlur = 22;
    g.fillStyle = "rgba(160,220,255,.95)";
    g.beginPath();
    g.moveTo(22, 0); g.lineTo(-8, -12); g.lineTo(-14, 0); g.lineTo(-8, 12);
    g.closePath(); g.fill();
    g.shadowBlur = 0;

    g.fillStyle = "rgba(5,10,18,.75)";
    g.beginPath(); g.roundRect(-2, -5, 10, 10, 4); g.fill();

    const flame = 10 + Math.sin(w.time * 22) * 2 + (Math.abs(this.vx) + Math.abs(this.vy)) * 0.01;
    g.fillStyle = "rgba(255,210,160,.9)";
    g.beginPath();
    g.moveTo(-16, 0);
    g.lineTo(-16 - flame, -4);
    g.lineTo(-16 - flame, 4);
    g.closePath(); g.fill();

    g.restore();

    if (pu.laserLevel > 0 && this.laserGrace > 0.02) {
      const level = pu.laserLevel;
      const wMul = (level >= 2) ? 3.0 : 1.0;
      const maxLen = (level === 1) ? 450 : CONFIG.W + 200;

      const drawBeam = (sx, sy, power = 1.0) => {
        g.save();
        g.globalAlpha = (0.18 + 0.52 * this.laserGrace) * power;
        g.strokeStyle = "rgba(120,230,255,1)";
        g.lineWidth = CONFIG.LASER.widthGlow * (0.9 + 0.2 * power) * wMul;
        g.shadowColor = "rgba(120,230,255,.8)";
        g.shadowBlur = 22;
        g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx + maxLen, sy); g.stroke();

        g.globalAlpha = (0.85 * this.laserGrace) * power;
        g.shadowBlur = 0;
        g.strokeStyle = "rgba(190,250,255,1)";
        g.lineWidth = CONFIG.LASER.widthCore * (0.9 + 0.2 * power) * wMul;
        g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx + maxLen, sy); g.stroke();
        g.restore();
      };

      // 自機
      drawBeam(this.x + 18, this.y, 1.0);

      // オプション（弱めの光量）
      if (pu.optionCount > 0) {
        for (let i = 0; i < pu.optionCount; i++) {
          const op = this.getOptionPos(i, pu);
          drawBeam(op.x + 14, op.y, 0.55);
        }
      }
    }
  }
}
