// chatgpt/world.js
import { CONFIG, TAU } from "./config.js";
import { rand, clamp } from "./utils.js";
import { Input } from "./input.js";
import { AudioBus } from "./audio.js";
import { Camera } from "./camera.js";
import { Terrain } from "./terrain.js";
import { Particle } from "./particles.js";
import { PowerUpSystem } from "./powerup.js";
import { StageTimeline } from "./stage.js";

import { Player } from "./entities/player.js";
import { Bullet } from "./entities/bullet.js";
import { Capsule } from "./entities/capsule.js";

// enemies / objects
import { GroundEnemy, Boss, AirEnemy } from "./entities/enemies.js";
import { Moai } from "./entities/moai.js";
import { RingBullet } from "./entities/ringbullet.js";

export class World {
  constructor(canvas) {
    this.canvas = canvas;
    this.g = canvas.getContext("2d");

    this.input = new Input();
    this.audio = new AudioBus();
    this.camera = new Camera();

    this.time = 0;
    this.stageTime = 0;
    this.scrollX = 0;
    this.hitStopMs = 0;
    this.lastDt = 1 / 60;

    this.bullets = [];   // Bullet / Missile (friendly & enemy)
    this.enemies = [];   // AirEnemy / GroundEnemy / Boss / Moai / RingBullet
    this.particles = [];
    this.items = [];

    this.player = new Player(this);
    this.powerUp = new PowerUpSystem(this);
    this.formationStats = null; // { total, killed, type }
    this.killCount = 0; // 雑魚撃破数カウンター

    this.optionFireAcc = 0;
    this.banner = null;

    this.paused = false;
    this.gameOver = false;

    this.stageIndex = 1;
    this.stageClear = false;
    this.stageClearTimer = 0;

    this.terrain = new Terrain(this.stageIndex);
    this.timeline = new StageTimeline(this, this.stageIndex);

    this.bgStars = Array.from({ length: 140 }, () => ({
      x: rand(0, CONFIG.W),
      y: rand(0, CONFIG.H),
      z: rand(0.2, 1.0),
    }));

    this.nebula = Array.from({ length: 10 }, (_, i) => ({
      y: 40 + i * 46 + rand(-12, 12),
      a: rand(0, TAU),
      s: rand(0.4, 1.0),
    }));

    this.next1up = 100000;
    this.oneUpStep = 150000;

    this.showBanner("STAGE 1: ORBITAL WRECKAGE", 1.8);
    // ---- Ending / Hard loop ----
    this.hardLoop = false;          // 2周目以降 true
    this.ending = null;             // { phase, t, creditsY, escapeX, escapeY }
    this.credits = [
      "STARLINE VECTOR",
      "",
      "DIRECTOR",
      "ChatGPT & You",
      "",
      "GAME DESIGN",
      "Stage Script / Rhythm",
      "",
      "PROGRAMMING",
      "ES Modules Refactor",
      "",
      "ART DIRECTION",
      "Neon Vector Minimal",
      "",
      "SOUND",
      "Tiny Synth & Noise",
      "",
      "SPECIAL THANKS",
      "You (the pilot)",
      "",
      "THANK YOU FOR PLAYING!"
    ];
  }

  // -----------------------------
  // UI helpers
  // -----------------------------
  showBanner(text, dur = 1.2) {
    this.banner = { text, t: dur, max: dur };
  }

  // -----------------------------
  // Particles helpers
  // -----------------------------
  spawnSpark(x, y, life = 0.35) {
    this.particles.push(
      new Particle(
        x + rand(-10, 10),
        y + rand(-10, 10),
        rand(-220, 220),
        rand(-220, 220),
        life,
        "spark"
      )
    );
  }

  spawnExplosion(x, y, life = 0.6, big = false) {
    this.particles.push(
      new Particle(
        x + rand(-10, 10),
        y + rand(-10, 10),
        rand(-300, 300),
        rand(-300, 300),
        life,
        big ? "big" : "spark"
      )
    );
  }

  // -----------------------------
  // Spawners
  // -----------------------------
  spawnBullet(x, y, vx, vy, r, dmg, friendly, kind) {
    const ceil = this.terrain.ceilingAt(x);
    const floor = this.terrain.floorAt(x);
    if (y <= ceil + 4 || y >= floor - 4) return;

    if (!friendly) {
      const m = this.enemyBulletMul();
      vx *= m;
      vy *= m;
    }

    this.bullets.push(new Bullet(x, y, vx, vy, r, dmg, friendly, kind));
  }

  spawnMissile(x, y, dir, dmg) {
    // Speed doubled -> Quadrupled to 400
    const m = new Bullet(x, y, 400 * dir, 120, 4, dmg, true, "missile");
    m.owner = "player";
    m.dir = dir;
    m.hug = false;

    m.update = (dt, w) => {
      m.x += m.vx * dt;

      const ceil = w.terrain.ceilingAt(m.x);
      const floor = w.terrain.floorAt(m.x);

      if (!m.hug) {
        m.y += dir * 480 * dt;
        const targetY = dir < 0 ? ceil + 18 : floor - 18;
        if (dir < 0 && m.y <= targetY) {
          m.y = targetY;
          m.hug = true;
        }
        if (dir > 0 && m.y >= targetY) {
          m.y = targetY;
          m.hug = true;
        }
        m.y = clamp(m.y, ceil + 18, floor - 18);
      } else {
        const targetY = dir < 0 ? ceil + 18 : floor - 18;
        m.y = m.y + (targetY - m.y) * (1 - Math.pow(0.0001, dt));
      }

      if (floor - ceil < 80) m.dead = true;
      if (m.x > CONFIG.W + 90) m.dead = true;
    };

    // keep Bullet default draw (ellipse) — looks fine for missile too
    this.bullets.push(m);
    return m;
  }

  // If you want to spawn ring bullets from anywhere:
  spawnRingBullet(x, y, vx, vy) {
    this.enemies.push(new RingBullet(x, y, vx, vy));
  }

  // -----------------------------
  // Rewards / drops
  // -----------------------------
  dropChanceForEnemy(e) {
    let chance = CONFIG.POWERUP.capsuleDropBase;

    const early =
      this.stageIndex === 1 && this.stageTime < CONFIG.POWERUP.capsuleDropEarlyTime;
    if (early) chance *= CONFIG.POWERUP.capsuleDropEarlyMul;

    if (e instanceof GroundEnemy || e instanceof Moai) chance *= 0.75;
    if (e instanceof Boss) chance = 0.0;

    return clamp(chance, 0, 0.85);
  }

  onEnemyKilled(e) {
    const pts = (e.score || 200) * this.player.mult;
    this.player.addScore(pts);

    this.player.multT = 5.0;
    this.player.mult = Math.min(4, this.player.mult + 1);

    // 編隊処理
    if (e.formationId && this.formationStats && this.formationStats.id === e.formationId) {
      this.formationStats.killed++;
      if (this.formationStats.killed >= this.formationStats.total) {
        // 全滅ボーナス：カプセル
        this.items.push(new Capsule(e.x, e.y));
        this.audio.beep("square", 1200, 0.1, 0.2); // Special sound
        // 編隊リセット
        this.formationStats = null;
        return; // 編隊敵は通常ドロップ判定を行わない
      }
      return; // 編隊敵の途中撃破はドロップなし
    }

    // 通常敵の撃破カウント
    this.killCount++;
    if (this.killCount % 10 === 0) {
      this.items.push(new Capsule(e.x, e.y));
      this.audio.beep("square", 1100, 0.08, 0.15);
    }

    this.audio.noiseBurst(0.05, 0.12);
    this.camera.shake(4, 0.12);
    for (let i = 0; i < 10; i++) this.spawnExplosion(e.x, e.y, 0.35, i % 4 === 0);

    if (this.player.score >= this.next1up) {
      this.player.lives += 1;
      this.next1up += this.oneUpStep;
      this.audio.beep("square", 980, 0.12, 0.12);
      this.showBanner("1UP", 0.9);
    }
  }

  onBossKilled(b) {
    // stage7 logic: Multiple bosses
    if (this.stageIndex === 7) {
      // Check if any other boss is alive
      const others = this.enemies.filter(e => e instanceof Boss && !e.dead && e !== b);
      if (others.length > 0) {
        // Just explosion, no heavy fanfare yet
        this.player.addScore(80000);
        this.audio.noiseBurst(0.4, 0.4);
        this.spawnExplosion(b.x, b.y, 1.0);
        return;
      }

      // Last boss!
      this.player.addScore(100000);
      this.startEndingSequence();
      return;
    }

    // それ以外は従来の STAGE CLEAR
    this.player.addScore(45000);
    this.audio.duckBGM(0.45, 0.35);
    this.audio.beep("sawtooth", 220, 0.22, 0.14);
    this.camera.shake(12, 0.28);

    // ボス撃破で静寂(宇宙)に戻る
    this.audio.playBGM("space");

    this.stageClear = true;
    this.stageClearTimer = 0;

    // 派手な爆発音
    for (let i = 0; i < 5; i++) {
      setTimeout(() => this.audio.noiseBurst(0.4, 0.6), i * 150);
      setTimeout(() => this.camera.shake(20, 0.4), i * 150);
    }

    // 大量の爆発エフェクト
    for (let i = 0; i < 120; i++) {
      // ランダムな遅延で爆発させる
      setTimeout(() => {
        this.spawnExplosion(
          b.x + rand(-60, 60),
          b.y + rand(-60, 60),
          rand(0.5, 1.2), // scale
          i % 3 === 0     // big?
        );
      }, rand(0, 1500)); // 1.5秒かけて爆発し続ける

      this.particles.push(
        new Particle(
          b.x + rand(-60, 60),
          b.y + rand(-60, 60),
          rand(-300, 300),
          rand(-300, 300),
          rand(0.4, 0.95),
          i % 6 === 0 ? "big" : "spark"
        )
      );
    }

    setTimeout(() => this.showBanner("STAGE CLEAR", 1.9), 1000);
  }

  // -----------------------------
  // Stage advance
  // -----------------------------
  advanceStage() {
    this.stageIndex += 1;
    this.stageTime = 0;
    this.scrollX = 0;

    this.bullets = [];
    this.enemies = [];
    this.items = [];

    if (this.stageIndex <= 7) {
      this.terrain.setStage(this.stageIndex);
      this.timeline = new StageTimeline(this, this.stageIndex);

      const name =
        this.stageIndex === 2 ? "NEBULA CAVERN" :
          this.stageIndex === 3 ? "MOAI BASTION" :
            `STAGE ${this.stageIndex}`;
      this.showBanner(`STAGE ${this.stageIndex}: ${name}`, 1.9);
    } else {
      this.showBanner("ALL CLEAR (TO BE CONTINUED)", 2.2);
    }

    // BGMは stage.js のタイムライン冒頭で "space" が再生されるのでここでは呼ばなくてOK、
    // または念の為呼んでおく
    this.audio.playBGM("space");

    this.stageClear = false;
    this.stageClearTimer = 0;

    this.player.x = 130;
    this.player.y = CONFIG.H / 2;
    this.player.vx = 0;
    this.player.vy = 0;
    this.player.invulnT = 1.2;
  }

  // -----------------------------
  // Terrain collision helpers
  // -----------------------------
  pointHitsTerrain(x, y, pad = 2) {
    const ceil = this.terrain.ceilingAt(x);
    const floor = this.terrain.floorAt(x);
    return y <= ceil + pad || y >= floor - pad;
  }

  circleHitsTerrain(x, y, r, pad = 2) {
    const ceil = this.terrain.ceilingAt(x);
    const floor = this.terrain.floorAt(x);
    return (y - r) <= (ceil + pad) || (y + r) >= (floor - pad);
  }

  // -----------------------------
  // Collisions
  // -----------------------------
  handleCollisions() {
    const p = this.player;

    // 1) Enemy projectiles (Bullet non-friendly) -> Player
    if (!p.dead) {
      for (const b of this.bullets) {
        if (b.dead) continue;

        // enemy bullets die on terrain
        if (!b.friendly && this.pointHitsTerrain(b.x, b.y, 2)) {
          b.dead = true;
          continue;
        }

        if (b.friendly) continue;

        const dx = b.x - p.x,
          dy = b.y - p.y;
        const nx = dx / CONFIG.PLAYER.hitRadiusX;
        const ny = dy / CONFIG.PLAYER.hitRadiusY;
        if (nx * nx + ny * ny <= 1.0) {
          b.dead = true;
          p.takeHit();
          break;
        }
      }

      // 2) Ring bullets -> Player (they are enemies array)
      for (const e of this.enemies) {
        if (e.dead) continue;
        if (!(e instanceof RingBullet)) continue;

        // ring dies on terrain too
        if (this.circleHitsTerrain(e.x, e.y, e.r, 2)) {
          e.dead = true;
          continue;
        }

        const dx = e.x - p.x,
          dy = e.y - p.y;
        // treat player as ellipse-ish, ring as circle
        const nx = dx / (CONFIG.PLAYER.hitRadiusX + e.r * 0.55);
        const ny = dy / (CONFIG.PLAYER.hitRadiusY + e.r * 0.55);
        if (nx * nx + ny * ny <= 1.0) {
          e.dead = true;
          p.takeHit();
          break;
        }
      }

      // 3) Player body -> Enemies (ram)
      for (const e of this.enemies) {
        if (e.dead) continue;
        if (e instanceof RingBullet) continue; // already handled

        const er = e.r || 18;
        const dx = e.x - p.x,
          dy = e.y - p.y;
        if (dx * dx + dy * dy <= (er + 12) * (er + 12)) {
          p.takeHit();
          break;
        }
      }
    }

    // 4) Friendly bullets -> Terrain / Enemies / Ring bullets
    for (const b of this.bullets) {
      if (b.dead) continue;

      // friendly bullet dies on terrain
      if (b.friendly && this.pointHitsTerrain(b.x, b.y, 2)) {
        b.dead = true;
        continue;
      }

      if (!b.friendly) continue;

      // hit ring bullets first (so player can shoot them away cleanly)
      for (const e of this.enemies) {
        if (e.dead) continue;
        if (!(e instanceof RingBullet)) continue;

        const dx = e.x - b.x,
          dy = e.y - b.y;
        if (dx * dx + dy * dy <= (e.r + b.r) * (e.r + b.r)) {
          b.dead = true;
          e.takeDamage?.(b.dmg, this);
          break;
        }
      }
      if (b.dead) continue;

      // hit normal enemies
      for (const e of this.enemies) {
        if (e.dead) continue;
        if (e instanceof RingBullet) continue;

        let hit = false;
        // Custom collision check?
        if (typeof e.checkHit === "function") {
          hit = e.checkHit(b.x, b.y, b.r);
        } else {
          // Standard circle
          const er = e.r || 18;
          const dx = e.x - b.x,
            dy = e.y - b.y;
          hit = dx * dx + dy * dy <= (er + b.r) * (er + b.r);
        }

        if (hit) {
          b.dead = true;

          if (e instanceof Boss) e.takeDamage(b.dmg, this, b.x, b.y);
          else e.takeDamage?.(b.dmg, this, b.x, b.y);

          break;
        }
      }
    }
  }

  // -----------------------------
  // Update
  // -----------------------------
  update(dt) {
    this.lastDt = dt;

    if (this.input.tap("Escape")) {
      this.paused = !this.paused;
      this.audio.beep("triangle", this.paused ? 180 : 360, 0.06, 0.06);
    }
    if (this.paused) {
      this.input.endFrame();
      return;
    }

    if (this.gameOver) {
      if (this.input.tap("KeyR")) location.reload();
      this.input.endFrame();
      return;
    }
    // ---- Ending flow ----
    if (this.ending) {
      // hitstopは無視して演出優先
      this.time += dt;
      this.camera.update(dt);

      const e = this.ending;
      e.t += dt;

      if (e.phase === "escape") {
        // 拘束すクルール → 脱出艇っぽい“拘束解除→推進”
        // 右へ抜けていく
        const accel = 520;
        e.escapeX += accel * dt;
        // ほんの少し揺れる
        e.escapeY = e.escapeY + Math.sin(this.time * 8) * 0.6;

        // 演出の粒
        if (Math.random() < 0.35) this.spawnSpark(e.escapeX - 40, e.escapeY, 0.25);

        if (e.escapeX > CONFIG.W + 160) {
          e.phase = "credits";
          e.t = 0;
          this.showBanner("STAFF ROLL", 1.6);
          this.audio.duckBGM(0.55, 0.35);
        }
      } else if (e.phase === "credits") {
        // クレジットスクロール
        const sp = 38; // スクロール速度
        e.creditsY -= sp * dt;

        // 終端判定
        const endY = - (this.credits.length * 26) - 80;
        if (e.creditsY < endY) {
          e.phase = "done";
          e.t = 0;
          this.showBanner("RESTARTING...", 1.4);
        }
      } else if (e.phase === "done") {
        // すぐ1面に戻す
        if (e.t > 0.6) this.startHardLoop();
      }

      this.input.endFrame();
      return;
    }

    if (this.stageClear) {
      this.stageClearTimer += dt;
      if (this.stageClearTimer > 2.2) this.advanceStage();
    }

    // hitstop
    if (this.hitStopMs > 0) {
      const consume = Math.min(this.hitStopMs, dt * 1000);
      this.hitStopMs -= consume;

      const slow = dt * 0.15;
      this.time += slow;
      this.camera.update(slow);

      for (const p of this.particles) p.update(slow);
      this.particles = this.particles.filter((p) => p.life > 0);

      this.input.endFrame();
      return;
    }

    this.time += dt;
    this.stageTime += dt;
    this.scrollX += CONFIG.STAGE.scrollSpeed * dt;

    this.terrain.updateScroll(this.scrollX);

    if (!this.stageClear && this.stageIndex <= 7) this.timeline.update(dt);

    this.camera.update(dt);

    this.player.update(dt, this);

    // bullets
    for (const b of this.bullets) {
      b.update(dt, this);
      if (b.outOfBounds?.()) b.dead = true;
      if (b.x < -140 || b.x > CONFIG.W + 180 || b.y < -220 || b.y > CONFIG.H + 220) b.dead = true;
    }

    // enemies + ring bullets
    for (const e of this.enemies) {
      e.update(dt, this);

      // ring bullets: also die if off-screen right or too far
      if (e instanceof RingBullet) {
        if (e.x < -120 || e.x > CONFIG.W + 220 || e.y < -220 || e.y > CONFIG.H + 220) e.dead = true;
      } else {
        // for normal enemies, let their own update decide; safety:
        if (e.x < -260) e.dead = true;
      }
    }

    // items
    for (const it of this.items) it.update(dt, this);

    // particles
    for (const p of this.particles) p.update(dt, this);

    // collisions
    this.handleCollisions();

    // cleanup
    this.bullets = this.bullets.filter((b) => !b.dead);
    this.enemies = this.enemies.filter((e) => !e.dead);
    this.items = this.items.filter((i) => !i.dead);
    this.particles = this.particles.filter((p) => p.life > 0);

    if (this.banner) {
      this.banner.t -= dt;
      if (this.banner.t <= 0) this.banner = null;
    }

    this.input.endFrame();
  }

  // -----------------------------
  // Draw
  // -----------------------------
  drawBackground(g) {
    // stars
    g.save();
    for (const s of this.bgStars) {
      let x = s.x - (this.scrollX * (0.1 + 0.55 * s.z)) % (CONFIG.W + 40);
      if (x < -20) x += CONFIG.W + 40;
      const y = s.y;
      const r = 1 + 1.8 * s.z;
      g.globalAlpha = 0.22 + 0.55 * s.z;
      g.fillStyle = "rgba(210,240,255,1)";
      g.beginPath();
      g.arc(x, y, r, 0, TAU);
      g.fill();
    }
    g.restore();

    // stage 2 nebula
    if (this.stageIndex === 2) {
      g.save();
      g.globalAlpha = 0.10;
      g.fillStyle = "rgba(190,150,255,1)";
      for (const b of this.nebula) {
        const wob = Math.sin(this.time * 0.35 + b.a) * (14 * b.s);
        g.beginPath();
        g.roundRect(0, b.y + wob, CONFIG.W, 22 + 14 * b.s, 18);
        g.fill();
      }
      g.globalAlpha = 0.06;
      g.fillStyle = "rgba(140,220,255,1)";
      for (const b of this.nebula) {
        const wob = Math.sin(this.time * 0.30 + b.a + 1.3) * (10 * b.s);
        g.beginPath();
        g.roundRect(0, b.y + 26 + wob, CONFIG.W, 12 + 10 * b.s, 16);
        g.fill();
      }
      g.restore();
    }

    // terrain
    this.terrain.draw(g, this.stageIndex, this.time);
  }

  drawOverlayText(g, title, sub, dim = 0.6) {
    g.save();
    g.fillStyle = `rgba(0,0,0,${dim})`;
    g.fillRect(0, 0, CONFIG.W, CONFIG.H);

    g.textAlign = "center";
    g.fillStyle = "rgba(230,240,255,1)";
    g.shadowColor = "rgba(120,230,255,.55)";
    g.shadowBlur = 18;
    g.font = "800 56px system-ui";
    g.fillText(title, CONFIG.W / 2, CONFIG.H / 2 - 18);

    g.shadowBlur = 0;
    g.globalAlpha = 0.85;
    g.font = "16px system-ui";
    g.fillText(sub, CONFIG.W / 2, CONFIG.H / 2 + 26);

    g.restore();
    g.textAlign = "left";
  }

  drawHUD(g) {
    const pu = this.powerUp;
    const p = this.player;

    g.save();
    g.globalAlpha = 0.92;
    g.fillStyle = "rgba(230,240,255,1)";
    g.font = "14px system-ui";
    g.fillText(`STAGE: ${this.stageIndex}`, 14, 22);
    g.fillText(`LIVES: ${Math.max(0, p.lives)}`, 110, 22);
    g.fillText(`SCORE: ${p.score}`, 14, 44);
    g.fillText(`x${p.mult}`, 14, 66);

    // boss bar
    const boss = this.enemies.find((e) => e instanceof Boss);
    if (boss) {
      const ratio = clamp(boss.hp / (boss._maxHp || 1), 0, 1);
      const bx = CONFIG.W / 2 - 180;
      const by = 18;
      g.globalAlpha = 0.85;
      g.fillStyle = "rgba(255,255,255,0.10)";
      g.beginPath();
      g.roundRect(bx, by, 360, 10, 6);
      g.fill();

      g.fillStyle = "rgba(185,150,255,0.75)";
      g.beginPath();
      g.roundRect(bx, by, 360 * ratio, 10, 6);
      g.fill();
    }

    // power gauge
    const slots = CONFIG.POWERUP.gaugeSlots;
    const baseX = 180;
    const y = CONFIG.H - 26;
    const w = 84,
      h = 18,
      pad = 8;

    g.globalAlpha = 0.75;
    g.fillText("POWER-UP", 14, CONFIG.H - 18);

    for (let i = 0; i < slots.length; i++) {
      const x = baseX + i * (w + pad);
      const active = pu.gauge - 1 === i;
      g.save();
      g.translate(x, y);
      g.globalAlpha = 0.9;

      g.fillStyle = active ? "rgba(130,240,255,0.35)" : "rgba(255,255,255,0.06)";
      g.strokeStyle = active ? "rgba(130,240,255,0.9)" : "rgba(255,255,255,0.14)";
      g.lineWidth = active ? 2.5 : 1.2;

      g.beginPath();
      g.roundRect(0, 0, w, h, 8);
      g.fill();
      g.stroke();

      g.fillStyle = "rgba(230,240,255,0.9)";
      g.font = "12px system-ui";
      g.fillText(slots[i], 8, 13);
      g.restore();
    }

    // status
    const rx = CONFIG.W - 320;
    g.globalAlpha = 0.9;
    g.fillText(`SPD:${pu.speedLevel}  OPT:${pu.optionCount}  SHD:${pu.shield ? "ON" : "--"}`, rx, 22);
    g.fillText(
      `WPN:${pu.laser ? "LASER" : pu.double ? "DOUBLE" : "SHOT"}  MIS:${pu.missile ? "ON" : "--"}  OD:${pu.overT > 0 ? pu.overT.toFixed(1) : "--"}`,
      rx,
      44
    );
    g.fillText(`FORM:${["FOLLOW", "SPREAD", "LINE"][pu.formation]}`, rx, 66);

    // banner
    if (this.banner) {
      const tt = clamp(this.banner.t / this.banner.max, 0, 1);
      const a = Math.sin(tt * Math.PI);
      g.save();
      g.globalAlpha = 0.85 * a;
      g.font = "700 44px system-ui";
      g.textAlign = "center";
      g.fillStyle = "rgba(230,240,255,1)";
      g.shadowColor = "rgba(120,230,255,.7)";
      g.shadowBlur = 22;
      g.fillText(this.banner.text, CONFIG.W / 2, 110);
      g.restore();
      g.textAlign = "left";
    }

    g.restore();
  }

  draw() {
    const g = this.g;
    g.clearRect(0, 0, CONFIG.W, CONFIG.H);

    this.drawBackground(g);

    g.save();
    this.camera.apply(g);

    // items
    for (const it of this.items) it.draw(g, this);

    // bullets (player & enemy small bullets)
    for (const b of this.bullets) b.draw(g, this);

    // ground-like enemies first for readability
    for (const e of this.enemies) {
      if (e instanceof GroundEnemy || e instanceof Moai) e.draw(g, this);
    }

    // air enemies + boss
    for (const e of this.enemies) {
      if (e instanceof GroundEnemy || e instanceof Moai || e instanceof RingBullet) continue;
      e.draw(g, this);
    }

    // ring bullets drawn on top (so you can read them)
    for (const e of this.enemies) {
      if (e instanceof RingBullet) e.draw(g, this);
    }

    // particles + player
    for (const p of this.particles) p.draw(g, this);
    this.player.draw(g, this);

    g.restore();

    this.drawHUD(g);
    // ---- Ending visuals ----
    if (this.ending) {
      const e = this.ending;

      // 少し暗転
      g.save();
      g.fillStyle = "rgba(0,0,0,0.35)";
      g.fillRect(0, 0, CONFIG.W, CONFIG.H);
      g.restore();

      if (e.phase === "escape") {
        // “拘束すクルール”っぽい拘束具→脱出艇（抽象表現）
        g.save();
        g.translate(e.escapeX, e.escapeY);

        // 拘束リング（外れる感じ）
        const t = Math.min(1, e.t / 0.9);
        g.globalAlpha = 0.85 * (1 - t * 0.65);
        g.strokeStyle = "rgba(180,150,255,1)";
        g.lineWidth = 5;
        g.shadowColor = "rgba(180,150,255,.7)";
        g.shadowBlur = 18;
        g.beginPath();
        g.arc(-40 - t * 40, 0, 18 + t * 18, 0, TAU);
        g.stroke();

        // 脱出艇
        g.globalAlpha = 1;
        g.shadowBlur = 22;
        g.fillStyle = "rgba(230,240,255,.95)";
        g.beginPath();
        g.roundRect(-28, -10, 56, 20, 10);
        g.fill();
        g.fillStyle = "rgba(10,12,20,.75)";
        g.beginPath();
        g.roundRect(-8, -6, 16, 12, 6);
        g.fill();

        // 推進
        g.shadowBlur = 0;
        g.globalAlpha = 0.85;
        g.fillStyle = "rgba(255,210,160,.9)";
        g.beginPath();
        g.moveTo(-30, 0);
        g.lineTo(-70 - Math.sin(this.time * 22) * 6, -6);
        g.lineTo(-70 - Math.sin(this.time * 22) * 6, 6);
        g.closePath();
        g.fill();

        g.restore();
      }

      if (e.phase === "credits") {
        g.save();
        g.textAlign = "center";
        g.fillStyle = "rgba(230,240,255,0.92)";
        g.shadowColor = "rgba(120,230,255,.45)";
        g.shadowBlur = 18;

        let y = e.creditsY;
        for (let i = 0; i < this.credits.length; i++) {
          const line = this.credits[i];
          g.font = (i === 0) ? "900 40px system-ui" : "700 18px system-ui";
          g.fillText(line, CONFIG.W / 2, y);
          y += 26;
        }

        g.shadowBlur = 0;
        g.textAlign = "left";
        g.restore();
      }
    }

    if (this.paused) this.drawOverlayText(g, "PAUSED", "Rでリロード / Escで復帰", 0.55);
    if (this.gameOver) this.drawOverlayText(g, "GAME OVER", "Rでリロード", 0.75);
  }
  diffMul() {
    return this.hardLoop ? 1.55 : 1.0; // “爆上がり”
  }

  // 敵弾スピード倍率
  enemyBulletMul() {
    return this.hardLoop ? 1.35 : 1.0;
  }

  // 敵の発射頻度倍率（小さいほど頻繁）
  enemyFireMul() {
    return this.hardLoop ? 0.68 : 1.0;
  }
  startEnding() {
    // 画面を整理
    this.bullets = [];
    this.enemies = [];
    this.items = [];

    this.ending = {
      phase: "escape",     // escape -> credits -> done
      t: 0,
      creditsY: CONFIG.H + 80,
      escapeX: this.player.x,
      escapeY: this.player.y
    };

    this.showBanner("ESCAPE!", 1.4);
    this.audio.duckBGM(0.45, 0.35);
    this.audio.beep("sawtooth", 260, 0.22, 0.14);
    this.camera.shake(10, 0.25);

    // プレイヤーを無敵＆操作不能にする（update側で止める）
    this.player.invulnT = 999;
  }

  startHardLoop() {
    this.hardLoop = true;

    // 1面に戻す（ただし hardLoop 継続）
    this.stageIndex = 1;
    this.stageTime = 0;
    this.scrollX = 0;

    this.bullets = [];
    this.enemies = [];
    this.items = [];

    this.terrain.setStage(this.stageIndex);
    this.timeline = new StageTimeline(this, this.stageIndex);

    this.stageClear = false;
    this.stageClearTimer = 0;
    this.ending = null;

    // プレイヤー位置を整える
    this.player.dead = false;
    this.player.respawnPending = false;
    this.player.x = 130;
    this.player.y = CONFIG.H / 2;
    this.player.vx = 0;
    this.player.vy = 0;
    this.player.invulnT = 1.2;

    // “爆上がり”宣言
    this.showBanner("HARD LOOP START", 2.0);
    this.audio.beep("square", 980, 0.10, 0.12);
  }
}
