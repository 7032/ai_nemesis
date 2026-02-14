// chatgpt/entities/enemies.js
import { CONFIG, TAU } from "../config.js";
import { clamp, lerp, rand } from "../utils.js";
import { Entity } from "./entity.js";
import { Particle } from "../particles.js";

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
    this._shootT = rand(1.8, 3.4);
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
    if (this.x < -140) this.dead = true;

    const ceil = w.terrain.ceilingAt(this.x);
    const floor = w.terrain.floorAt(this.x);
    this.y = clamp(this.y, ceil + 30, floor - 30);

    // ---- Shooting (baseMin/baseMax are ALWAYS defined here) ----
    this._shootT -= dt;
    if (this._shootT <= 0) {
      const early = (w.stageIndex === 1 && w.stageTime < CONFIG.STAGE.earlyNoFireTime);
      const fireChance = early ? CONFIG.STAGE.earlyFireChanceMul : 0.65;

      // ★必ず定義（ここが無いと "baseMin baseMax が無い"）
      const baseMin = early ? 3.2 : (w.stageIndex === 2 ? 2.8 : 2.2);
      const baseMax = early ? 4.9 : (w.stageIndex === 2 ? 4.6 : 3.6);

      // hardLoop: fireMul < 1 => 次が早い（=頻繁）
      this._shootT = rand(baseMin, baseMax) * fireMul(w);

      // 序盤は控えめ
      if (Math.random() > fireChance) return;

      const p = w.player;
      if (p && p.canBeHit()) {
        const dx = p.x - this.x;
        const dy = p.y - this.y;
        const len = Math.hypot(dx, dy) || 1;

        const spBase = CONFIG.ENEMY.bulletSpeed * (w.stageIndex === 2 ? 0.92 : 1.0);
        const sp = spBase * bulletMul(w);

        w.spawnBullet(
          this.x - 10,
          this.y,
          (dx / len) * sp,
          (dy / len) * sp,
          4,
          1,
          false,
          "needle"
        );
        w.audio.beep("triangle", 235, 0.05, 0.042);
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
    this.vx = -55;

    this.r = 74;

    // stage2 slightly softer
    this.hp = CONFIG.BOSS.hp * (stageIndex === 2 ? 0.92 : 1.0);
    this._maxHp = this.hp;
    this.score = 22000;

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

    return [
      fan(3.6 * calm, 0.78 / densityMul, Math.round(7 * densityMul)),
      rest(1.0 + CONFIG.BOSS.restPad),

      open(2.4),
      aim(3.2 * calm, 0.82 / densityMul),
      close(0.4),
      rest(1.2 + CONFIG.BOSS.restPad),

      ring(3.8 * calm, 1.05 / densityMul, Math.round(8 * densityMul)),
      rest(1.2 + CONFIG.BOSS.restPad),

      open(2.6),
      fan(2.8 * calm, 0.92 / densityMul, Math.round(6 * densityMul)),
      close(0.4),
      rest(1.25 + CONFIG.BOSS.restPad),
    ];
  }

  takeDamage(dmg, w, hitX = 0, hitY = 0) {
    const wx = this.x - 40;
    const wy = this.y;
    const dx = hitX - wx;
    const dy = hitY - wy;
    const d = Math.hypot(dx, dy);

    let mul = 0.60;
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

    const ceil = w.terrain.ceilingAt(this.x);
    const floor = w.terrain.floorAt(this.x);
    const mid = (ceil + floor) * 0.5;
    const amp = Math.min(120, (floor - ceil) * 0.24);
    const targetY = mid + Math.sin(this.phase * 0.85) * amp;
    this.y = lerp(this.y, clamp(targetY, ceil + 70, floor - 70), 1 - Math.pow(0.001, dt));

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
