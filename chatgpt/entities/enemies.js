// chatgpt/entities/enemies.js
import { CONFIG, TAU } from "../config.js";
import { clamp, lerp, rand } from "../utils.js";
import { Entity } from "./entity.js";
import { Particle } from "../particles.js";
import { Tentacle } from "./tentacle.js";

function fireMul(w) {
  return (w && typeof w.enemyFireMul === "function") ? w.enemyFireMul() : 1.0;
}
function bulletMul(w) {
  return (w && typeof w.enemyBulletMul === "function") ? w.enemyBulletMul() : 1.0;
}

export class AirEnemy extends Entity {
  constructor(x, y, hp = 1) {
    super();
    this.x = x;
    this.y = y;
    this.vx = -92;
    this.vy = 0;
    this.r = 16;
    this.hp = hp;
    this.score = 200;
    this.score = 200;
    this._shootT = rand(1.8, 3.4);

    // 行動パターン (0:直進, 1:波打つ, 2:追尾気味)
    this.pattern = Math.floor(rand(0, 3));
    this.age = 0;
    this.baseY = y;
  }

  takeDamage(dmg, w) {
    this.hp -= dmg;
    for (let i = 0; i < 2; i++) {
      w.particles.push(
        new Particle(
          this.x + rand(-6, 6),
          this.y + rand(-6, 6),
          rand(-40, 40),
          rand(-40, 40),
          0.18,
          "spark"
        )
      );
    }
    if (this.hp <= 0) {
      this.dead = true;
      w.onEnemyKilled(this);
    }
  }

  update(dt, w) {
    this.x += this.vx * dt;
    this.age += dt;

    // 編隊IDがないなら独自の動き
    if (!this.formationId) {
      if (this.pattern === 1) {
        // Sine wave
        this.y = this.baseY + Math.sin(this.age * 4) * 40;
      } else if (this.pattern === 2) {
        // 徐々にプレイヤーの高さに寄る
        if (w.player) {
          this.baseY = lerp(this.baseY, w.player.y, dt * 0.5);
          this.y = this.baseY;
        }
      }
      // pattern 0 is straight (default)
    }

    if (this.x < -140) this.dead = true;

    const ceil = w.terrain.ceilingAt(this.x);
    const floor = w.terrain.floorAt(this.x);
    this.y = clamp(this.y, ceil + 30, floor - 30);

    // ---- Shooting ----
    this._shootT -= dt;
    if (this._shootT <= 0) {
      if (this.x < CONFIG.W - 10 && this.x > 10) {

        // Buffed fire rate: Base ~1.0s
        let resetTime = rand(0.7, 1.4);

        // Loop 2+ (loopCount >= 1): 3x faster
        if (w.loopCount >= 1) {
          resetTime /= 3.0;
        }

        // Formation nerf (1/4 rate)
        if (this.formationId) {
          resetTime *= 4.0;
        }

        // Scale by Player Options (User Request)
        // Baseline (High difficulty) is for 2 Options.
        // 0 Opt: 1/3 strength -> Interval x3
        // 1 Opt: 1/2 strength -> Interval x2
        // 2 Opt: 1.0 strength -> Interval x1
        // 3 Opt: 1.5 strength -> Interval / 1.5
        // 4 Opt: 2.0 strength
        // 5 Opt: 2.5 strength
        const opt = (w.powerUp ? w.powerUp.optionCount : 0);
        const strength = (opt === 0) ? 0.33 : (opt * 0.5);
        resetTime /= strength;

        // Apply fireMul (general difficulty scaler)
        this._shootT = resetTime * fireMul(w);

        const p = w.player;
        if (p && p.canBeHit()) {
          const dx = p.x - this.x;
          const dy = p.y - this.y;

          // Simple Aim Shot
          const len = Math.hypot(dx, dy) || 1;
          const sp = CONFIG.ENEMY.bulletSpeed;
          w.spawnBullet(this.x - 10, this.y, (dx / len) * sp, (dy / len) * sp, 4, 1, false, "needle");

          // Extra shot for high difficulty (Loop 2+)
          if (w.loopCount >= 1) {
            w.spawnBullet(this.x - 10, this.y, (dx / len) * sp * 0.8, (dy / len) * sp * 0.8, 4, 1, false, "needle");
          }

          w.audio.beep("triangle", 240, 0.05, 0.04);
        }
      } else {
        // Off-screen, just wait a bit
        this._shootT = 0.5;
      }
    }
  }

  draw(g) {
    g.save();
    g.translate(this.x, this.y);

    g.shadowColor = "rgba(255,150,190,.28)";
    g.shadowBlur = 16;

    g.fillStyle = "rgba(245,160,200,.95)";
    g.beginPath();
    g.moveTo(18, 0);
    g.lineTo(-9, -12);
    g.lineTo(-16, 0);
    g.lineTo(-9, 12);
    g.closePath();
    g.fill();

    g.shadowBlur = 0;
    g.strokeStyle = "rgba(10,10,16,.35)";
    g.lineWidth = 2;
    g.stroke();

    g.globalAlpha = 0.85;
    g.strokeStyle = "rgba(255,235,245,.55)";
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(-2, -6);
    g.lineTo(10, 0);
    g.lineTo(-2, 6);
    g.stroke();

    g.restore();
  }
}

export class GroundEnemy extends Entity {
  constructor(x, onCeil = false) {
    super();
    this.x = x;
    this.onCeil = onCeil;
    this.vx = -CONFIG.STAGE.scrollSpeed;
    this.hp = CONFIG.GROUND.enemyHP;
    this.r = 20;
    this.score = CONFIG.GROUND.enemyScore;
    this.fireAcc = rand(0, 1.2);
    this.phase = rand(0, TAU);
    this.y = onCeil ? 18 : (CONFIG.H - 18);
  }

  takeDamage(dmg, w) {
    this.hp -= dmg;
    for (let i = 0; i < 3; i++) {
      w.particles.push(
        new Particle(
          this.x + rand(-8, 8),
          this.y + rand(-8, 8),
          rand(-60, 60),
          rand(-60, 60),
          0.18,
          "spark"
        )
      );
    }
    if (this.hp <= 0) {
      this.dead = true;
      w.onEnemyKilled(this);
    }
  }

  update(dt, w) {
    this.x += this.vx * dt;
    this.phase += dt * 2.0;
    if (this.x < -140) this.dead = true;

    if (this.onCeil) this.y = w.terrain.ceilingAt(this.x) + 16;
    else this.y = w.terrain.floorAt(this.x) - 16;

    const early = (w.stageIndex === 1 && w.stageTime < CONFIG.STAGE.earlyNoFireTime);
    const rate = (early ? 0.22 : 1.0) * CONFIG.GROUND.bulletRate * (w.stageIndex === 2 ? 0.95 : 1.0);

    // hardLoop: fireMul < 1 => 実質の発射頻度を上げる
    const fm = fireMul(w);
    this.fireAcc += dt * rate * (1 / fm);

    if (this.fireAcc >= 1.0) {
      this.fireAcc = 0;

      const p = w.player;
      if (p && p.canBeHit()) {
        const dy = (p.y - this.y) * 0.32;
        const vy = clamp(dy, -120, 120);

        const vx = -200; // world.spawnBullet が enemyBulletMul を掛ける
        w.spawnBullet(
          this.x - 14,
          this.y + (this.onCeil ? 10 : -10),
          vx,
          vy,
          4,
          1,
          false,
          "round"
        );
        w.audio.beep("triangle", 205, 0.05, 0.036);
      }
    }
  }

  draw(g) {
    g.save();
    g.translate(this.x, this.y);

    // pillar-ish hint to floor/ceiling
    g.globalAlpha = 0.22;
    g.fillStyle = "rgba(120,230,255,1)";
    if (this.onCeil) g.fillRect(-6, -48, 12, 48);
    else g.fillRect(-6, 0, 12, 48);

    g.globalAlpha = 1;
    g.shadowColor = "rgba(140,240,255,.18)";
    g.shadowBlur = 18;

    g.fillStyle = "rgba(140,220,200,.92)";
    g.beginPath();
    g.roundRect(-26, this.onCeil ? -12 : -4, 52, 18, 10);
    g.fill();

    const pulse = 1 + Math.sin(this.phase * 3.2) * 0.10;
    g.shadowColor = "rgba(120,240,255,.55)";
    g.shadowBlur = 16;
    g.fillStyle = "rgba(120,240,255,1)";
    g.beginPath();
    g.arc(10, this.onCeil ? -2 : 6, 4.2 * pulse, 0, TAU);
    g.fill();

    g.shadowBlur = 0;
    g.fillStyle = "rgba(8,10,18,.75)";
    if (this.onCeil) {
      g.beginPath();
      g.roundRect(-7, 2, 14, 24, 7);
      g.fill();
    } else {
      g.beginPath();
      g.roundRect(-7, -26, 14, 24, 7);
      g.fill();
    }

    g.strokeStyle = "rgba(10,10,16,.35)";
    g.lineWidth = 2;
    g.globalAlpha = 0.9;
    g.beginPath();
    g.roundRect(-26, this.onCeil ? -12 : -4, 52, 18, 10);
    g.stroke();

    g.restore();
  }
}

export class Boss extends Entity {
  constructor(x, y, stageIndex = 1) {
    super();
    this.isBoss = true;

    this.x = x;
    this.y = y;
    this.homeY = y; // For Stage 7 movement
    this.movePhase = Math.random() * 10;
    this.vx = -55;

    this.r = 74;

    // stage2 slightly softer, but generally scale up hp
    let hpMul = (stageIndex === 2 ? 0.92 : 1.0) + (stageIndex - 1) * 0.15;
    if (stageIndex === 7) hpMul = 2.0;

    this.hp = CONFIG.BOSS.hp * hpMul;
    this._maxHp = this.hp;
    this.score = 22000;
    this.fireTimer = 2.0; // Initialize for Stage 7 logic

    this.phase = 0;
    this.hitFlashT = 0;
    this.flinchT = 0;
    this.recoil = 0;

    this.state = "enter";
    this.scriptT = 0;
    this.scriptIndex = 0;

    this.weakOpen = 0;
    this.weakOpenTarget = 0;

    this.script = this.makeScript(stageIndex);
  }

  makeScript(stageIndex) {
    const s = CONFIG.BOSS.patternScale;
    const rest = (t) => ({ type: "rest", t });
    const open = (t) => ({ type: "open", t });
    const close = (t) => ({ type: "close", t });
    const fan = (t, every, n) => ({ type: "fan", t, every, n });
    const aim = (t, every) => ({ type: "aim", t, every });
    const ring = (t, every, n) => ({ type: "ring", t, every, n });

    const calm = stageIndex === 2 ? 1.08 : 1.0;
    const densityMul = s * (stageIndex === 2 ? 0.92 : 1.0);

    // ステージが進むほど待機時間が短くなる（難易度アップ）
    // stage1=1.0, stage2=0.85, stage3=0.7 ... min 0.4
    const waitMul = Math.max(0.4, 1.0 - (stageIndex - 1) * 0.15);
    // Fire interval scaler
    const rateMul = Math.max(0.5, 1.0 - (stageIndex - 1) * 0.08);

    return [
      fan(3.6 * calm, (0.78 * rateMul) / densityMul, Math.round((7 + stageIndex) * densityMul)),
      rest((1.0 + CONFIG.BOSS.restPad) * waitMul),

      open(2.4 * waitMul),
      fan(3.6 * calm, (0.78 * rateMul) / densityMul, Math.round((6 + stageIndex) * densityMul)),
      close(0.4 * waitMul),
      rest((1.2 + CONFIG.BOSS.restPad) * waitMul),

      ring(3.8 * calm, 1.05 / densityMul, Math.round((8 + stageIndex) * densityMul)),
      rest((1.2 + CONFIG.BOSS.restPad) * waitMul),

      open(2.6 * waitMul),
      ring(3.8 * calm, 1.05 / densityMul, Math.round((8 + stageIndex) * densityMul)),
      close(0.5 * waitMul),

      rest((1.5 + CONFIG.BOSS.restPad) * waitMul)
    ];
  }

  takeDamage(dmg, w, hitX = 0, hitY = 0) {
    if (this.state === "enter") return; // Invulnerable during entry

    const wx = this.x - 40;
    const wy = this.y;
    const dx = hitX - wx;
    const dy = hitY - wy;
    const d = Math.hypot(dx, dy);

    let mul = 1.0; // Removed resistance (was 0.60)
    if (this.weakOpen > 0.55 && d < 24) mul = 1.35;
    if (this.weakOpen > 0.85 && d < 16) mul = 1.55;

    this.hp -= dmg * mul;

    this.hitFlashT = CONFIG.BOSS.flashTime;
    this.flinchT = CONFIG.BOSS.flinchTime;

    w.camera.shake(4, 0.08);
    w.audio.beep("triangle", 760, 0.02, 0.05);

    for (let i = 0; i < 3; i++) {
      w.particles.push(
        new Particle(
          wx + rand(-10, 10),
          wy + rand(-10, 10),
          rand(-80, 80),
          rand(-60, 60),
          0.20,
          "glow"
        )
      );
    }
  }

  _spawnFan(w, n) {
    const base = Math.PI;
    const spread = 0.68;
    for (let i = 0; i < n; i++) {
      const tt = (n === 1) ? 0 : (i / (n - 1)) * 2 - 1;
      const a = base + tt * spread;
      const sp = CONFIG.BOSS.bulletSpeed + Math.abs(tt) * 26;
      // spawnBullet側で enemyBulletMul が入る
      w.spawnBullet(this.x - 86, this.y, Math.cos(a) * sp, Math.sin(a) * sp, 4, 1, false, "round");
    }
    w.audio.beep("triangle", 185, 0.05, 0.055);
  }

  _spawnAim(w) {
    const p = w.player;
    if (!p || !p.canBeHit()) return;

    const dx = p.x - this.x;
    const dy = p.y - this.y;
    const len = Math.hypot(dx, dy) || 1;

    const sp = (CONFIG.BOSS.bulletSpeed + 30);
    w.spawnBullet(this.x - 92, this.y, (dx / len) * sp, (dy / len) * sp, 4, 1, false, "needle");
    w.audio.beep("triangle", 215, 0.05, 0.05);
  }

  _spawnRing(w, n) {
    const rot = this.phase * 1.2;
    const sp = CONFIG.BOSS.bulletSpeed - 10;
    for (let i = 0; i < n; i++) {
      const a = rot + (i / n) * TAU;
      w.spawnBullet(this.x - 90, this.y, Math.cos(a) * sp, Math.sin(a) * sp, 4, 1, false, "round");
    }
    w.audio.beep("triangle", 195, 0.05, 0.05);
  }

  update(dt, w) {
    this.phase += dt;

    this.hitFlashT = Math.max(0, this.hitFlashT - dt);
    this.flinchT = Math.max(0, this.flinchT - dt);

    this.recoil = lerp(this.recoil, this.flinchT > 0 ? 1 : 0, 1 - Math.pow(0.0001, dt));
    this.weakOpen = lerp(this.weakOpen, this.weakOpenTarget, 1 - Math.pow(0.0001, dt));

    if (this.state === "enter") {
      this.x += this.vx * dt;
      if (this.x < CONFIG.W - 210) {
        this.vx = 0;
        this.state = "script";
        this.scriptT = 0;
        this.scriptIndex = 0;
        w.audio.duckBGM(0.52, 0.25);
        w.camera.shake(7, 0.20);
      }
      this.y = lerp(this.y, CONFIG.H / 2, 1 - Math.pow(0.0001, dt));
      return;
    }

    // Stage 7 special logic
    if (w.stageIndex === 7) {
      const bosses = w.enemies.filter(e => e.isBoss && !e.dead);
      const count = bosses.length;

      // --- Entry ---
      if (this.state === "enter") {
        this.x += this.vx * dt;
        const stopX = CONFIG.W - 150 - (this.s7offsetX || 0);
        if (this.x < stopX) {
          this.vx = 0;
          this.state = "fight";
        }
        this.y = lerp(this.y, this.homeY || CONFIG.H / 2, 1 - Math.pow(0.0001, dt));
        return;
      }

      // --- Retreat (phase transition) ---
      if (this.state === "retreat") {
        this.x += 300 * dt;
        if (this.x > CONFIG.W + 200) this.x = CONFIG.W + 200; // park offscreen
        return;
      }

      // --- Phase 1: 3 bosses circling on right half ---
      if (this.s7phase !== 2 && !this.isFinalForm) {
        const centerX = CONFIG.W * 0.72;
        const centerY = CONFIG.H / 2;
        const radius = 120;
        const speed = 0.8;
        const angle = w.time * speed + this.movePhase;
        this.x = centerX + Math.cos(angle) * radius;
        this.y = centerY + Math.sin(angle) * radius;

        // Ring bullet attack every 2s
        this.fireTimer -= dt;
        if (this.fireTimer <= 0) {
          this.fireTimer = 2.0;
          const n = 10;
          const sp = 160;
          w.audio.beep("triangle", 600, 0.05, 0.1);
          for (let i = 0; i < n; i++) {
            const a = (i / n) * TAU + w.time;
            w.spawnBullet(this.x, this.y, Math.cos(a) * sp, Math.sin(a) * sp, 4, 1, false, "round");
          }
        }
      }

      // --- Phase 2: 2 bosses, independent vertical movement, staggered ---
      if (this.s7phase === 2 && !this.isFinalForm) {
        // Vertical sine movement at 3x stage1-5 speed (0.85*3 ≈ 2.55)
        const amp = 180;
        const spd = 2.55;
        this.y = CONFIG.H / 2 + Math.sin(w.time * spd + this.movePhase) * amp;
        this.x = CONFIG.W - 150 - (this.s7offsetX || 0);

        // Barrage cycle: 30s interval, 5s burst
        if (this.barrageTimer == null) this.barrageTimer = 0;
        this.barrageTimer += dt;
        const cyclePos = this.barrageTimer % 35; // 30s wait + 5s burst
        const inBarrage = cyclePos >= 30;

        if (inBarrage) {
          // Intense 5s barrage — rapid radial bullets every 0.15s
          if (this.barrageShotAcc == null) this.barrageShotAcc = 0;
          this.barrageShotAcc += dt;
          while (this.barrageShotAcc >= 0.15) {
            this.barrageShotAcc -= 0.15;
            const sp = 180;
            const n = 14;
            w.audio.beep("triangle", 300, 0.03, 0.04);
            for (let i = 0; i < n; i++) {
              const a = (i / n) * TAU + w.time * 2;
              w.spawnBullet(this.x, this.y, Math.cos(a) * sp, Math.sin(a) * sp, 4, 1, false, "round");
            }
          }
        } else {
          this.barrageShotAcc = 0;
        }

        // Normal attack: Ring bullets + radial normal bullets every 1.5s
        this.fireTimer -= dt;
        if (this.fireTimer <= 0) {
          this.fireTimer = 1.5;
          const sp = 170;
          // Ring bullets
          const rn = 10;
          w.audio.beep("triangle", 600, 0.05, 0.1);
          for (let i = 0; i < rn; i++) {
            const a = (i / rn) * TAU + w.time;
            w.spawnBullet(this.x, this.y, Math.cos(a) * sp, Math.sin(a) * sp, 4, 1, false, "round");
          }
          // Radial normal bullets
          const nn = 8;
          w.audio.beep("triangle", 250, 0.05, 0.05);
          for (let i = 0; i < nn; i++) {
            const a = (i / nn) * TAU + w.time * -1.5;
            w.spawnBullet(this.x, this.y, Math.cos(a) * sp, Math.sin(a) * sp, 4, 1, false, "round");
          }
        }
      }

      // --- Initialize Final Form when last one standing ---
      if (count === 1 && !this.isFinalForm) {
        this.isFinalForm = true;
        this.hp = this._maxHp;

        const t1 = new Tentacle(this.x, this.y - 40, true, 10);
        const t2 = new Tentacle(this.x, this.y + 40, false, 10);
        w.enemies.push(t1, t2);
        this.tentacles = [t1, t2];
        w.audio.beep("noise", 200, 0.5, 0.5);
      }

      // --- Final Form ---
      if (this.isFinalForm) {
        // Initialize charge state
        if (!this.chargeMode) {
          this.chargeMode = "hover";
          this.chargeTimer = 30.0;
        }

        // --- Hover: normal attack with tentacles ---
        if (this.chargeMode === "hover") {
          // Sync tentacles
          if (this.tentacles) {
            this.tentacles.forEach((t, i) => {
              if (!t.dead) {
                t.x = this.x - 20;
                t.y = this.y + (i === 0 ? -50 : 50);
                t.isCeil = (i === 0);
              }
            });
          }

          this.y = 270 + Math.sin(w.time * 2.0) * 100;
          this.chargeTimer -= dt;

          // Normal attack: ring + radial every 0.5s
          this.fireTimer -= dt;
          if (this.fireTimer <= 0) {
            this.fireTimer = 0.5;
            const n = 24;
            const sp = 240;
            w.audio.beep("triangle", 600, 0.05, 0.1);
            for (let i = 0; i < n; i++) {
              const a = (i / n) * TAU + w.time;
              w.spawnBullet(this.x, this.y, Math.cos(a) * sp, Math.sin(a) * sp, 4, 1, false, "round");
            }
            const rn = 16;
            w.audio.beep("triangle", 250, 0.05, 0.05);
            for (let i = 0; i < rn; i++) {
              const a = (i / rn) * TAU + w.time * -2;
              w.spawnBullet(this.x, this.y, Math.cos(a) * sp, Math.sin(a) * sp, 4, 1, false, "round");
            }
          }

          // Transition to retract
          if (this.chargeTimer <= 0) {
            this.chargeMode = "retract";
            this.chargeTimer = 0.3;
            // Kill tentacles (retract)
            if (this.tentacles) {
              this.tentacles.forEach(t => t.killAll(w));
              this.tentacles = null;
            }
          }
        }

        // --- Retract: tentacles gone, no firing, brief pause ---
        else if (this.chargeMode === "retract") {
          this.chargeTimer -= dt;
          if (this.chargeTimer <= 0) {
            this.chargeMode = "shake";
            this.chargeTimer = 1.0;
            w.audio.beep("noise", 150, 0.3, 0.5);
          }
        }

        // --- Shake: vibrate for 1 second ---
        else if (this.chargeMode === "shake") {
          this.chargeTimer -= dt;
          // Vibrate effect
          this.x += (Math.random() - 0.5) * 12;
          this.y += (Math.random() - 0.5) * 8;
          if (this.chargeTimer <= 0) {
            this.chargeMode = "attack";
            this._chargeBaseY = this.y;
            w.audio.beep("noise", 100, 0.5, 0.4);
          }
        }

        // --- Attack: charge left at 600px/s ---
        else if (this.chargeMode === "attack") {
          this.x -= 600 * dt;
          if (this.x < 100) {
            this.chargeMode = "return";
          }
        }

        // --- Return: go back right at half speed (300px/s) ---
        else if (this.chargeMode === "return") {
          this.x += 300 * dt;
          this.y = lerp(this.y, CONFIG.H / 2, 0.05);
          if (this.x > CONFIG.W - 200) {
            this.x = CONFIG.W - 200;
            this.chargeMode = "regrow";
            this.chargeTimer = 0.5;
          }
        }

        // --- Regrow: spawn new tentacles, return to hover ---
        else if (this.chargeMode === "regrow") {
          this.chargeTimer -= dt;
          if (this.chargeTimer <= 0) {
            const t1 = new Tentacle(this.x, this.y - 40, true, 10);
            const t2 = new Tentacle(this.x, this.y + 40, false, 10);
            w.enemies.push(t1, t2);
            this.tentacles = [t1, t2];
            w.audio.beep("noise", 200, 0.3, 0.3);

            this.chargeMode = "hover";
            this.chargeTimer = 30.0;
          }
        }
      }

      // Hit flash update
      if (this.hitFlashT > 0) this.hitFlashT -= dt;

      // Death check
      if (this.hp <= 0) {
        this.dead = true;
        w.onBossKilled(this);
        if (this.tentacles) {
          this.tentacles.forEach(t => t.killAll(w));
        }
      }
      return;
    }

    const ceil = w.terrain.ceilingAt(this.x);
    const floor = w.terrain.floorAt(this.x);
    const mid = (ceil + floor) * 0.5;
    const amp = Math.min(120, (floor - ceil) * 0.24);
    const targetY = mid + Math.sin(this.phase * 0.85) * amp;
    this.y = lerp(this.y, clamp(targetY, ceil + 70, floor - 70), 1 - Math.pow(0.001, dt));

    // Periodic radial barrage (used by Stage 6 main boss)
    if (this.radialInterval > 0 && this.state === "script") {
      this.radialTimer = (this.radialTimer || 0) + dt;
      if (this.radialTimer >= this.radialInterval) {
        this.radialTimer -= this.radialInterval;
        this._spawnRing(w, 12);
      }
    }

    if (this.state === "script") {
      if (this.scriptIndex >= this.script.length) this.scriptIndex = 0;
      const seg = this.script[this.scriptIndex];

      this.scriptT += dt;

      if (seg.type === "open") this.weakOpenTarget = 1;
      else if (seg.type === "close") this.weakOpenTarget = 0;

      // hardLoop: fireMul < 1 => "every" を短くして頻度UP
      const fm = fireMul(w);
      const effectiveEvery = (seg.every != null) ? (seg.every * fm) : null;

      if (seg.type === "fan" || seg.type === "aim" || seg.type === "ring") {
        if (seg._acc == null) seg._acc = 0;
        seg._acc += dt;

        const step = Math.max(0.06, effectiveEvery || 0.6); // 安全下限
        while (seg._acc >= step) {
          seg._acc -= step;
          if (seg.type === "fan") this._spawnFan(w, Math.max(3, seg.n | 0));
          if (seg.type === "aim") this._spawnAim(w);
          if (seg.type === "ring") this._spawnRing(w, Math.max(6, seg.n | 0));
        }
      }

      if (this.scriptT >= seg.t) {
        if (seg._acc != null) seg._acc = 0;
        this.scriptT = 0;
        this.scriptIndex++;
      }
    }

    if (this.hp <= 0) {
      this.dead = true;
      w.onBossKilled(this);
    }
  }

  draw(g) {
    const flash = this.hitFlashT > 0;
    const recoilPx = CONFIG.BOSS.recoilPx * this.recoil;

    g.save();
    g.translate(this.x - recoilPx, this.y);

    g.shadowColor = flash ? "rgba(255,255,255,.65)" : "rgba(170,140,255,.25)";
    g.shadowBlur = flash ? 26 : 36;

    g.fillStyle = flash ? "rgba(255,240,255,.98)" : "rgba(185,150,255,.92)";
    g.beginPath();
    g.roundRect(-122, -72, 162, 144, 36);
    g.fill();

    g.shadowBlur = 0;
    g.fillStyle = "rgba(8,10,18,.78)";
    g.beginPath();
    g.roundRect(-136, -20, 54, 40, 12);
    g.fill();

    const open = this.weakOpen;

    // weak core shutters
    g.save();
    g.translate(-40, 0);
    g.fillStyle = "rgba(10,12,20,.72)";
    g.beginPath();
    g.roundRect(-24, -24, 48, 18 * (1 - open), 8);
    g.roundRect(-24, 6 + (18 * open), 48, 18 * (1 - open), 8);
    g.fill();

    const pulse = 1 + Math.sin(this.phase * 5) * 0.08;
    g.shadowColor = "rgba(130,240,255,.8)";
    g.shadowBlur = flash ? 28 : 20;
    g.globalAlpha = 0.55 + open * 0.45;
    g.fillStyle = "rgba(130,240,255,1)";
    g.beginPath();
    g.arc(0, 0, 12 * pulse, 0, TAU);
    g.fill();
    g.restore();

    g.globalAlpha = 0.35;
    g.strokeStyle = "rgba(255,255,255,.55)";
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(-110, -50);
    g.lineTo(20, -50);
    g.moveTo(-110, 50);
    g.lineTo(20, 50);
    g.stroke();

    g.restore();
  }
}
