// chatgpt-namesis.js
// STARLINE VECTOR — Single-file browser shooter (file:// OK, non-module)
// Controls: Move WASD/Arrows, Shot Z/Space, Missile X, Commit PowerUp C/Enter, Formation V, Pause Esc

(() => {
  const TAU = Math.PI * 2;

  const CONFIG = {
    W: 960,
    H: 540,
    FIXED_DT: 1 / 120,
    MAX_FRAME_DT: 1 / 20,

    PLAYER: {
      baseSpeed: 220,
      maxSpeed: 360,
      accel: 2400,
      decel: 2600,
      hitRadiusX: 10,
      hitRadiusY: 7,
      invulnOnShieldBreak: 0.35,
      respawnIFrames: 1.0,
      idleDeadzone: 0.85,
      terrainMargin: 18, // 床/天井との最低距離（見た目と当たりの余白）
    },

    POWERUP: {
      gaugeSlots: ["SPEED", "MISSILE", "DOUBLE", "LASER", "OPTION", "SHIELD", "OVERDRIVE"],
      capsuleDropBase: 0.22,
      capsuleDropEarlyMul: 3.2,
      capsuleDropEarlyTime: 28.0,
      overdriveDuration: 8.0,
      overdrivePowerMul: 1.35,
      overdriveEndSlow: 0.90,
      overdriveEndSlowDuration: 2.0,
      speedSteps: [1.12, 1.12, 1.10, 1.08],
    },

    SHOT: { rate: 12, dmg: 1.0, speed: 640 },
    DOUBLE: { rate: 10, dmg: 0.85, speed: 620 },
    LASER: {
      tickRate: 60,
      dps: 11.5,
      widthCore: 4,
      widthGlow: 12,
      hitStopMs: 10,
      startGrace: 0.06,
    },
    MISSILE: { rate: 6, dmg: 1.35, speed: 420 },

    OPTION: {
      max: 4,
      followDelay: 0.14,
      followLerp: 0.14,
    },

    ENEMY: {
      bulletSpeed: 230,
    },

    STAGE: {
      scrollSpeed: 120,
      earlyNoFireTime: 34.0,
      earlyFireChanceMul: 0.04,
    },

    GROUND: {
      enemyHP: 14,
      enemyScore: 280,
      bulletRate: 0.48,
    },

    BOSS: {
      hp: 220,
      bulletSpeed: 205,
      flinchTime: 0.10,
      flashTime: 0.12,
      recoilPx: 10,
      // 台本：弾量はこの辺で調整
      patternScale: 0.60, // 全体の“密度”倍率（低いほど少ない）
      restPad: 0.10,      // 休符をより“休符”にする微調整
    },

    TERRAIN: {
      // 描画用の厚み（当たり判定は中心線で行う）
      bandAlpha: 0.18,
      lineAlpha: 0.25,
    }
  };

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function rand(a = 0, b = 1) { return a + Math.random() * (b - a); }
  function sign(v) { return v < 0 ? -1 : 1; }
  function approach0(v, dv) { return Math.abs(v) <= dv ? 0 : v - sign(v) * dv; }

  class Input {
    constructor() {
      this.keys = new Map();
      this.pressed = new Set();
      window.addEventListener("keydown", (e) => {
        if (!this.keys.get(e.code)) this.pressed.add(e.code);
        this.keys.set(e.code, true);
        if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) e.preventDefault();
      }, { passive: false });
      window.addEventListener("keyup", (e) => this.keys.set(e.code, false));
    }
    down(code) { return !!this.keys.get(code); }
    tap(code) { return this.pressed.has(code); }
    endFrame() { this.pressed.clear(); }
  }

  class AudioBus {
    constructor() {
      this.ctx = null;
      this.master = null;
      this.bgmGain = null;
      this.seGain = null;
      this._bgmNode = null;
      this._bgmLP = null;
      this._armed = false;

      const arm = () => {
        if (this._armed) return;
        this._armed = true;
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.8;
        this.bgmGain = this.ctx.createGain();
        this.bgmGain.gain.value = 0.35;
        this.seGain = this.ctx.createGain();
        this.seGain.gain.value = 0.55;

        this.bgmGain.connect(this.master);
        this.seGain.connect(this.master);
        this.master.connect(this.ctx.destination);

        this._bgmLP = this.ctx.createBiquadFilter();
        this._bgmLP.type = "lowpass";
        this._bgmLP.frequency.value = 900;
        this._bgmLP.Q.value = 0.7;
        this._bgmLP.connect(this.bgmGain);

        this.startBGM();
      };

      window.addEventListener("pointerdown", arm, { once: true });
      window.addEventListener("keydown", arm, { once: true });
    }

    now() { return this.ctx ? this.ctx.currentTime : 0; }

    startBGM() {
      if (!this.ctx || this._bgmNode) return;
      const osc = this.ctx.createOscillator();
      osc.type = "sawtooth";
      const gain = this.ctx.createGain();
      gain.gain.value = 0.0;

      osc.connect(gain);
      gain.connect(this._bgmLP);

      const t = this.now();
      gain.gain.setValueAtTime(0.0, t);
      gain.gain.linearRampToValueAtTime(0.18, t + 1.4);

      let step = 0;
      const base = 110;
      const scale = [0, 3, 5, 7, 10, 12, 15, 17];
      const timer = setInterval(() => {
        if (!this.ctx || this.ctx.state !== "running") return;
        const semi = scale[step % scale.length];
        osc.frequency.setTargetAtTime(base * Math.pow(2, semi / 12), this.now(), 0.03);
        step++;
      }, 380);

      osc.start();
      this._bgmNode = { osc, gain, timer };
    }

    duckBGM(amount = 0.6, dur = 0.12) {
      if (!this.ctx) return;
      const t = this.now();
      const g = this.bgmGain.gain;
      const cur = g.value;
      g.cancelScheduledValues(t);
      g.setValueAtTime(cur, t);
      g.linearRampToValueAtTime(cur * amount, t + 0.01);
      g.linearRampToValueAtTime(cur, t + dur);
    }

    beep(type = "tri", freq = 440, dur = 0.08, gain = 0.2) {
      if (!this.ctx) return;
      const o = this.ctx.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      const g = this.ctx.createGain();
      g.gain.value = 0.0;
      o.connect(g);
      g.connect(this.seGain);
      const t = this.now();
      g.gain.setValueAtTime(0.0, t);
      g.gain.linearRampToValueAtTime(gain, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.start(t);
      o.stop(t + dur + 0.02);
    }

    noiseBurst(dur = 0.08, gain = 0.18) {
      if (!this.ctx) return;
      const sr = this.ctx.sampleRate;
      const len = Math.floor(sr * dur);
      const buf = this.ctx.createBuffer(1, len, sr);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) {
        const tt = i / len;
        data[i] = (Math.random() * 2 - 1) * (1 - tt) * 0.9;
      }
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const g = this.ctx.createGain();
      g.gain.value = gain;
      const hp = this.ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 500;
      src.connect(hp);
      hp.connect(g);
      g.connect(this.seGain);
      src.start();
    }
  }

  class Camera {
    constructor() { this.shakeT = 0; this.shakeA = 0; }
    shake(amount = 6, t = 0.18) {
      this.shakeA = Math.max(this.shakeA, amount);
      this.shakeT = Math.max(this.shakeT, t);
    }
    update(dt) {
      if (this.shakeT > 0) {
        this.shakeT -= dt;
        if (this.shakeT <= 0) { this.shakeT = 0; this.shakeA = 0; }
      }
    }
    apply(ctx) {
      if (this.shakeT <= 0) return;
      const a = this.shakeA * (this.shakeT / 0.18);
      ctx.translate(rand(-a, a), rand(-a, a));
    }
  }

  class Particle {
    constructor(x, y, vx, vy, life, kind = "spark") {
      this.x = x; this.y = y; this.vx = vx; this.vy = vy;
      this.life = life; this.maxLife = life; this.kind = kind;
      this.r = kind === "big" ? 5 : kind === "glow" ? 10 : 2;
    }
    update(dt) {
      this.life -= dt;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.vx *= Math.pow(0.12, dt);
      this.vy *= Math.pow(0.12, dt);
    }
    draw(g) {
      const t = clamp(this.life / this.maxLife, 0, 1);
      g.save();
      g.globalAlpha = t;
      if (this.kind === "spark") {
        g.fillStyle = "rgba(200,240,255,1)";
        g.beginPath(); g.arc(this.x, this.y, this.r, 0, TAU); g.fill();
      } else if (this.kind === "big") {
        g.fillStyle = "rgba(255,220,160,1)";
        g.beginPath(); g.arc(this.x, this.y, this.r * (1 + (1 - t) * 1.8), 0, TAU); g.fill();
      } else {
        g.fillStyle = "rgba(120,220,255,1)";
        g.beginPath(); g.arc(this.x, this.y, this.r * (1 + (1 - t) * 2.5), 0, TAU); g.fill();
      }
      g.restore();
    }
  }

  class Entity { constructor() { this.dead = false; } update(dt, w) { } draw(g, w) { } }

  class Bullet extends Entity {
    constructor(x, y, vx, vy, r = 3, dmg = 1, friendly = true, kind = "round") {
      super();
      this.x = x; this.y = y; this.vx = vx; this.vy = vy;
      this.r = r; this.dmg = dmg; this.friendly = friendly; this.kind = kind;
      this.flags = 0;
    }
    update(dt) {
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      if (this.x < -120 || this.x > CONFIG.W + 140 || this.y < -160 || this.y > CONFIG.H + 160) this.dead = true;
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

  class Capsule extends Entity {
    constructor(x, y) {
      super();
      this.x = x; this.y = y; this.vx = -120; this.vy = rand(-20, 20); this.r = 8;
      this.phase = rand(0, TAU);
    }
    update(dt, w) {
      this.phase += dt * 4.5;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.vy += Math.sin(this.phase) * 18 * dt;

      // terrain safe clamp (capsule should not spawn inside walls)
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

  // -----------------------------
  // Terrain (ceiling/floor)
  // -----------------------------
  class Terrain {
    constructor(stageIndex) {
      this.stageIndex = stageIndex;
      this.seed = Math.floor(rand(1, 999999));
      this.scrollX = 0;
      this._cache = new Map();
      this.theme = this._makeTheme(stageIndex);
    }

    _makeTheme(stageIndex) {
      if (stageIndex === 1) {
        return {
          topBase: 18,
          bottomBase: CONFIG.H - 18,
          topAmp: 8,
          bottomAmp: 10,
          // "ほぼ平ら" + ちょい変化
          topFreq: 0.008,
          bottomFreq: 0.006,
          gapMin: 360,
          wobble: 0.0
        };
      }
      // STAGE 2: cave-ish
      return {
        topBase: 50,
        bottomBase: CONFIG.H - 50,
        topAmp: 46,
        bottomAmp: 58,
        topFreq: 0.010,
        bottomFreq: 0.012,
        gapMin: 240,
        wobble: 0.45
      };
    }

    setStage(stageIndex) {
      this.stageIndex = stageIndex;
      this._cache.clear();
      this.seed = Math.floor(rand(1, 999999));
      this.theme = this._makeTheme(stageIndex);
    }

    updateScroll(scrollX) {
      this.scrollX = scrollX;
      // cache is keyed by worldX bucket, safe to keep small
      if (this._cache.size > 1400) this._cache.clear();
    }

    // deterministic pseudo noise based on integer x bucket
    _hash(n) {
      // xorshift-ish
      let x = (n ^ this.seed) | 0;
      x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
      return (x >>> 0) / 4294967295;
    }

    _smoothstep(t) { return t * t * (3 - 2 * t); }

    _noise1D(x) {
      // value noise
      const xi = Math.floor(x);
      const xf = x - xi;
      const a = this._hash(xi);
      const b = this._hash(xi + 1);
      return lerp(a, b, this._smoothstep(xf));
    }

    _profileAt(worldX) {
      // cache in buckets of 2px for speed
      const key = (worldX * 0.5) | 0;
      const cached = this._cache.get(key);
      if (cached) return cached;

      const t = this.theme;
      // base sine + noise for cave
      const nTop = this._noise1D(worldX * 0.02) * 2 - 1;
      const nBot = this._noise1D((worldX + 999) * 0.02) * 2 - 1;

      let top = t.topBase
        + Math.sin(worldX * t.topFreq + 0.6) * t.topAmp
        + nTop * t.topAmp * t.wobble;

      let bot = t.bottomBase
        + Math.sin(worldX * t.bottomFreq + 2.1) * t.bottomAmp
        + nBot * t.bottomAmp * t.wobble;

      // ensure gap
      const minGap = t.gapMin;
      if (bot - top < minGap) {
        const mid = (bot + top) * 0.5;
        top = mid - minGap * 0.5;
        bot = mid + minGap * 0.5;
      }

      // clamp
      top = clamp(top, 8, CONFIG.H - 120);
      bot = clamp(bot, 120, CONFIG.H - 8);

      const out = { top, bot };
      this._cache.set(key, out);
      return out;
    }

    ceilingAt(screenX) {
      // screenX -> worldX
      const worldX = this.scrollX + screenX;
      return this._profileAt(worldX).top;
    }

    floorAt(screenX) {
      const worldX = this.scrollX + screenX;
      return this._profileAt(worldX).bot;
    }

    // For drawing: sample across screen
    draw(g, stageIndex, time) {
      const tint = (stageIndex === 2)
        ? { fill: "rgba(170,140,255,1)", line: "rgba(200,180,255,1)", glow: "rgba(170,140,255,.45)" }
        : { fill: "rgba(120,230,255,1)", line: "rgba(170,250,255,1)", glow: "rgba(120,230,255,.45)" };

      g.save();
      g.globalAlpha = CONFIG.TERRAIN.bandAlpha;

      // Fill top and bottom
      g.fillStyle = tint.fill;

      // top fill
      g.beginPath();
      g.moveTo(0, 0);
      for (let x = 0; x <= CONFIG.W; x += 8) {
        const y = this.ceilingAt(x) + Math.sin(time * 0.6 + x * 0.01) * 1.2;
        g.lineTo(x, y);
      }
      g.lineTo(CONFIG.W, 0);
      g.closePath();
      g.fill();

      // bottom fill
      g.beginPath();
      g.moveTo(0, CONFIG.H);
      for (let x = 0; x <= CONFIG.W; x += 8) {
        const y = this.floorAt(x) + Math.sin(time * 0.6 + x * 0.01 + 1.2) * 1.2;
        g.lineTo(x, y);
      }
      g.lineTo(CONFIG.W, CONFIG.H);
      g.closePath();
      g.fill();

      // lines
      g.globalAlpha = CONFIG.TERRAIN.lineAlpha;
      g.strokeStyle = tint.line;
      g.lineWidth = 2;

      // top line
      g.beginPath();
      for (let x = 0; x <= CONFIG.W; x += 6) {
        const y = this.ceilingAt(x);
        if (x === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke();

      // bottom line
      g.beginPath();
      for (let x = 0; x <= CONFIG.W; x += 6) {
        const y = this.floorAt(x);
        if (x === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke();

      // subtle inner glow for ST2 cave vibe
      if (stageIndex === 2) {
        g.globalAlpha = 0.08;
        g.strokeStyle = tint.glow;
        g.lineWidth = 10;
        g.beginPath();
        for (let x = 0; x <= CONFIG.W; x += 8) {
          const y = this.ceilingAt(x) + 12;
          if (x === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        g.stroke();
        g.beginPath();
        for (let x = 0; x <= CONFIG.W; x += 8) {
          const y = this.floorAt(x) - 12;
          if (x === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        g.stroke();
      }

      g.restore();
    }
  }

  // -----------------------------
  // Enemies
  // -----------------------------
  class AirEnemy extends Entity {
    constructor(x, y, hp = 1) {
      super();
      this.x = x; this.y = y;
      this.vx = -92; this.vy = 0;
      this.r = 16;
      this.hp = hp;
      this.score = 200;
      this._shootT = rand(1.8, 3.4);
    }
    takeDamage(dmg, w) {
      this.hp -= dmg;
      for (let i = 0; i < 2; i++) w.particles.push(new Particle(this.x + rand(-6, 6), this.y + rand(-6, 6), rand(-40, 40), rand(-40, 40), 0.18, "spark"));
      if (this.hp <= 0) {
        this.dead = true;
        w.onEnemyKilled(this);
      }
    }
    update(dt, w) {
      this.x += this.vx * dt;
      if (this.x < -140) this.dead = true;

      // keep inside terrain corridor a bit
      const ceil = w.terrain.ceilingAt(this.x);
      const floor = w.terrain.floorAt(this.x);
      this.y = clamp(this.y, ceil + 30, floor - 30);

      const early = w.stageTime < CONFIG.STAGE.earlyNoFireTime && w.stageIndex === 1;
      const fireChanceMul = early ? CONFIG.STAGE.earlyFireChanceMul : 0.65;

      this._shootT -= dt;
      if (this._shootT <= 0) {
        const baseMin = early ? 3.2 : (w.stageIndex === 2 ? 2.8 : 2.2);
        const baseMax = early ? 4.9 : (w.stageIndex === 2 ? 4.6 : 3.6);
        this._shootT = rand(baseMin, baseMax);

        if (Math.random() > fireChanceMul) return;

        const p = w.player;
        if (p && p.canBeHit()) {
          const dx = p.x - this.x, dy = p.y - this.y;
          const len = Math.hypot(dx, dy) || 1;
          const sp = CONFIG.ENEMY.bulletSpeed * (w.stageIndex === 2 ? 0.92 : 1.0);
          w.spawnBullet(this.x - 10, this.y, (dx / len) * sp, (dy / len) * sp, 4, 1, false, "needle");
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
      g.moveTo(-2, -6); g.lineTo(10, 0); g.lineTo(-2, 6);
      g.stroke();

      g.restore();
    }
  }

  class GroundEnemy extends Entity {
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
      this.y = onCeil ? 18 : (CONFIG.H - 18); // will snap to terrain on update
    }
    takeDamage(dmg, w) {
      this.hp -= dmg;
      for (let i = 0; i < 3; i++) w.particles.push(new Particle(this.x + rand(-8, 8), this.y + rand(-8, 8), rand(-60, 60), rand(-60, 60), 0.18, "spark"));
      if (this.hp <= 0) {
        this.dead = true;
        w.onEnemyKilled(this);
      }
    }
    update(dt, w) {
      this.x += this.vx * dt;
      this.phase += dt * 2.0;
      if (this.x < -140) this.dead = true;

      // ★地形に“本当に張り付く”
      if (this.onCeil) {
        this.y = w.terrain.ceilingAt(this.x) + 16;
      } else {
        this.y = w.terrain.floorAt(this.x) - 16;
      }

      const early = w.stageTime < CONFIG.STAGE.earlyNoFireTime && w.stageIndex === 1;
      const rate = (early ? 0.22 : 1.0) * CONFIG.GROUND.bulletRate * (w.stageIndex === 2 ? 0.95 : 1.0);

      this.fireAcc += dt * rate;
      if (this.fireAcc >= 1.0) {
        this.fireAcc = 0;
        const p = w.player;
        if (p && p.canBeHit()) {
          const dy = (p.y - this.y) * 0.32;
          const vy = clamp(dy, -120, 120);
          const vx = -200;
          w.spawnBullet(this.x - 14, this.y + (this.onCeil ? 10 : -10), vx, vy, 4, 1, false, "round");
          w.audio.beep("triangle", 205, 0.05, 0.036);
        }
      }
    }
    draw(g) {
      g.save();
      g.translate(this.x, this.y);

      // 支柱（地形と接続してる“感じ”）
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
      g.beginPath(); g.arc(10, this.onCeil ? -2 : 6, 4.2 * pulse, 0, TAU); g.fill();

      g.shadowBlur = 0;
      g.fillStyle = "rgba(8,10,18,.75)";
      if (this.onCeil) {
        g.beginPath(); g.roundRect(-7, 2, 14, 24, 7); g.fill();
      } else {
        g.beginPath(); g.roundRect(-7, -26, 14, 24, 7); g.fill();
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

  // -----------------------------
  // Boss (scripted w/ rests)
  // -----------------------------
  class Boss extends Entity {
    constructor(x, y, stageIndex = 1) {
      super();
      this.x = x; this.y = y;
      this.vx = -55;
      this.r = 74;
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

      // “休符のある美しさ”台本
      this.script = this.makeScript(stageIndex);
      this.weakOpen = 0;
      this.weakOpenTarget = 0;
    }

    makeScript(stageIndex) {
      const s = CONFIG.BOSS.patternScale;
      const rest = (t) => ({ type: "rest", t });
      const open = (t) => ({ type: "open", t });
      const close = (t) => ({ type: "close", t });
      const fan = (t, every, n) => ({ type: "fan", t, every, n });
      const aim = (t, every) => ({ type: "aim", t, every });
      const ring = (t, every, n) => ({ type: "ring", t, every, n });

      // stage 2: slightly calmer
      const calm = stageIndex === 2 ? 1.08 : 1.0;
      const densityMul = s * (stageIndex === 2 ? 0.92 : 1.0);

      return [
        // A: 扇状→休→弱点開→狙い撃ち→休
        fan(3.6 * calm, 0.78 / densityMul, Math.round(7 * densityMul)),
        rest(1.0 + CONFIG.BOSS.restPad),
        open(2.4),
        aim(3.2 * calm, 0.82 / densityMul),
        close(0.4),
        rest(1.2 + CONFIG.BOSS.restPad),

        // B: リング少なめ→休→弱点開→扇状控えめ→休
        ring(3.8 * calm, 1.05 / densityMul, Math.round(8 * densityMul)),
        rest(1.2 + CONFIG.BOSS.restPad),
        open(2.6),
        fan(2.8 * calm, 0.92 / densityMul, Math.round(6 * densityMul)),
        close(0.4),
        rest(1.25 + CONFIG.BOSS.restPad),
      ];
    }

    takeDamage(dmg, w, hitX = 0, hitY = 0) {
      const wx = this.x - 40, wy = this.y;
      const dx = hitX - wx, dy = hitY - wy;
      const d = Math.hypot(dx, dy);

      let mul = 0.60;
      if (this.weakOpen > 0.55 && d < 24) mul = 1.35;
      if (this.weakOpen > 0.85 && d < 16) mul = 1.55;

      this.hp -= dmg * mul;

      // feedback: flinch + flash
      this.hitFlashT = CONFIG.BOSS.flashTime;
      this.flinchT = CONFIG.BOSS.flinchTime;
      w.camera.shake(4, 0.08);
      w.audio.beep("triangle", 760, 0.02, 0.05);

      for (let i = 0; i < 3; i++) {
        w.particles.push(new Particle(wx + rand(-10, 10), wy + rand(-10, 10), rand(-80, 80), rand(-60, 60), 0.20, "glow"));
      }
    }

    _spawnFan(w, n) {
      const base = Math.PI;
      const spread = 0.68;
      for (let i = 0; i < n; i++) {
        const tt = (n === 1) ? 0 : (i / (n - 1)) * 2 - 1;
        const a = base + tt * spread;
        const sp = CONFIG.BOSS.bulletSpeed + Math.abs(tt) * 26;
        w.spawnBullet(this.x - 86, this.y, Math.cos(a) * sp, Math.sin(a) * sp, 4, 1, false, "round");
      }
      w.audio.beep("triangle", 185, 0.05, 0.055);
    }

    _spawnAim(w) {
      const p = w.player;
      if (!p || !p.canBeHit()) return;
      const dx = p.x - this.x, dy = p.y - this.y;
      const len = Math.hypot(dx, dy) || 1;
      const sp = CONFIG.BOSS.bulletSpeed + 30;
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

      // weak open lerp
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

      // movement within terrain corridor
      const ceil = w.terrain.ceilingAt(this.x);
      const floor = w.terrain.floorAt(this.x);
      const mid = (ceil + floor) * 0.5;
      const amp = Math.min(120, (floor - ceil) * 0.24);
      const targetY = mid + Math.sin(this.phase * 0.85) * amp;
      this.y = lerp(this.y, clamp(targetY, ceil + 70, floor - 70), 1 - Math.pow(0.001, dt));

      // scripted attacks with rests
      if (this.state === "script") {
        if (this.scriptIndex >= this.script.length) this.scriptIndex = 0;
        const seg = this.script[this.scriptIndex];

        this.scriptT += dt;

        if (seg.type === "open") {
          this.weakOpenTarget = 1;
        } else if (seg.type === "close") {
          this.weakOpenTarget = 0;
        }

        if (seg.type === "fan" || seg.type === "aim" || seg.type === "ring") {
          // run a local timer for intervals
          if (seg._acc == null) seg._acc = 0;
          seg._acc += dt;
          while (seg._acc >= seg.every) {
            seg._acc -= seg.every;
            if (seg.type === "fan") this._spawnFan(w, Math.max(3, seg.n | 0));
            if (seg.type === "aim") this._spawnAim(w);
            if (seg.type === "ring") this._spawnRing(w, Math.max(6, seg.n | 0));
          }
        }

        if (this.scriptT >= seg.t) {
          // reset acc to keep crisp rhythms
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
      g.beginPath(); g.roundRect(-122, -72, 162, 144, 36); g.fill();

      g.shadowBlur = 0;
      g.fillStyle = "rgba(8,10,18,.78)";
      g.beginPath(); g.roundRect(-136, -20, 54, 40, 12); g.fill();

      const open = this.weakOpen;
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
      g.beginPath(); g.arc(0, 0, 12 * pulse, 0, TAU); g.fill();
      g.restore();

      g.globalAlpha = 0.35;
      g.strokeStyle = "rgba(255,255,255,.55)";
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(-110, -50); g.lineTo(20, -50);
      g.moveTo(-110, 50); g.lineTo(20, 50);
      g.stroke();

      g.restore();
    }
  }

  // -----------------------------
  // PowerUp
  // -----------------------------
  class PowerUpSystem {
    constructor(w) {
      this.w = w;
      this.gauge = 0;
      this.speedLevel = 0;
      this.missile = false;
      this.double = false;
      this.laser = false;
      this.optionCount = 0;
      this.shield = false;

      this.overT = 0;
      this.overEndSlowT = 0;
      this.formation = 0;
    }
    gainCapsule() {
      this.gauge = (this.gauge + 1) % (CONFIG.POWERUP.gaugeSlots.length + 1);
      if (this.gauge === 0) this.gauge = 1;
    }
    commit() {
      const idx = this.gauge - 1;
      if (idx < 0) return;
      const slot = CONFIG.POWERUP.gaugeSlots[idx];
      const a = this.w.audio;

      switch (slot) {
        case "SPEED":
          if (this.speedLevel < 4) { this.speedLevel++; a.beep("square", 520, 0.06, 0.10); }
          else a.beep("triangle", 240, 0.05, 0.06);
          break;
        case "MISSILE":
          this.missile = true; a.beep("square", 420, 0.06, 0.10); break;
        case "DOUBLE":
          this.double = true; this.laser = false; a.beep("square", 470, 0.06, 0.10); break;
        case "LASER":
          this.laser = true; this.double = false; a.beep("square", 620, 0.06, 0.11); break;
        case "OPTION":
          if (this.optionCount < CONFIG.OPTION.max) { this.optionCount++; a.beep("square", 740, 0.07, 0.10); }
          else a.beep("triangle", 240, 0.05, 0.06);
          break;
        case "SHIELD":
          this.shield = true; a.beep("square", 880, 0.08, 0.09); break;
        case "OVERDRIVE":
          this.overT = CONFIG.POWERUP.overdriveDuration;
          a.duckBGM(0.55, 0.22);
          a.beep("sawtooth", 220, 0.12, 0.12);
          a.noiseBurst(0.10, 0.20);
          break;
      }
      this.gauge = 0;
    }
    toggleFormation() {
      this.formation = (this.formation + 1) % 3;
      this.w.audio.beep("triangle", 520 + this.formation * 90, 0.06, 0.06);
    }
    speedMultiplier() {
      let mul = 1.0;
      for (let i = 0; i < this.speedLevel; i++) mul *= CONFIG.POWERUP.speedSteps[i];
      if (this.overEndSlowT > 0) mul *= CONFIG.POWERUP.overdriveEndSlow;
      return mul;
    }
    damageMultiplier() {
      return this.overT > 0 ? CONFIG.POWERUP.overdrivePowerMul : 1.0;
    }
    update(dt) {
      if (this.overT > 0) {
        this.overT -= dt;
        if (this.overT <= 0) {
          this.overT = 0;
          this.overEndSlowT = CONFIG.POWERUP.overdriveEndSlowDuration;
          this.w.audio.beep("triangle", 180, 0.08, 0.08);
        }
      }
      if (this.overEndSlowT > 0) {
        this.overEndSlowT -= dt;
        if (this.overEndSlowT < 0) this.overEndSlowT = 0;
      }
    }
    onDeathPenalty() {
      this.speedLevel = Math.max(0, this.speedLevel - 1);
      this.optionCount = Math.max(0, this.optionCount - 1);
      this.shield = false;
    }
  }

  // -----------------------------
  // Player
  // -----------------------------
  class Player extends Entity {
    constructor(w) {
      super();
      this.w = w;
      this.x = 130; this.y = CONFIG.H / 2;
      this.vx = 0; this.vy = 0;
      this.lives = 3;
      this.score = 0;
      this.mult = 1; this.multT = 0;
      this.invulnT = 1.0;
      this.shieldFlashT = 0;

      this.shotT = 0; this.missileT = 0;
      this.laserOn = false; this.laserGrace = 0;
      this._laserHitStopCooldown = 0;
      this._laserTickAcc = 0;

      this.path = []; this.pathMax = 3600;
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
      if (!idle && this._wasIdle) {
        this.optionLock = [];
      }
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
          this.w.particles.push(new Particle(this.x + rand(-10, 10), this.y + rand(-10, 10), rand(-220, 220), rand(-220, 220), 0.35, "spark"));
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
        this.w.particles.push(new Particle(this.x + rand(-10, 10), this.y + rand(-10, 10), rand(-300, 300), rand(-300, 300), 0.6, i % 5 === 0 ? "big" : "spark"));
      }
    }

    respawn() {
      this.dead = false;
      this.respawnPending = false;
      this.x = 130; this.y = CONFIG.H / 2;
      this.vx = 0; this.vy = 0;
      this.invulnT = CONFIG.PLAYER.respawnIFrames;
      this.mult = 1; this.multT = 0;

      this.optionState = [];
      this.optionLock = [];
      this._wasIdle = false;
    }

    applyLaserTick(dmgMul) {
      const w = this.w;
      const ramp = clamp(this.laserGrace / CONFIG.LASER.startGrace, 0, 1);
      const dps = CONFIG.LASER.dps * dmgMul * (0.35 + 0.65 * ramp);
      const dmg = dps / CONFIG.LASER.tickRate;

      const x0 = this.x + 18;
      const y0 = this.y;

      let hit = false;
      for (const e of w.enemies) {
        if (e.dead) continue;

        if (e.x + (e.r || 18) < x0) continue;
        const dy = Math.abs(e.y - y0);
        const rr = (e.r || 18);
        if (dy > (CONFIG.LASER.widthCore * 0.6 + rr * 0.7)) continue;

        hit = true;
        if (e instanceof Boss) e.takeDamage(dmg, w, e.x - 40, y0);
        else if (e.takeDamage) e.takeDamage(dmg, w);
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

      // ★地形当たり（壁）
      const ceil = w.terrain.ceilingAt(this.x);
      const floor = w.terrain.floorAt(this.x);
      const margin = CONFIG.PLAYER.terrainMargin;

      // corridor clamp for movement feel (prevents "stuck" jitter)
      const minY = ceil + margin;
      const maxY = floor - margin;
      this.y = clamp(this.y, minY, maxY);

      // true collision: if we were clamped and still invuln is off -> treat as hit
      // (Because clamp already keeps us inside, we detect “pressing” by comparing desired y)
      const desiredY = this.y;
      // Actually we already clamped; if player's ellipse would overlap boundary, count as hit
      if (this.canBeHit()) {
        const topHit = (this.y - CONFIG.PLAYER.hitRadiusY) <= (ceil + 4);
        const botHit = (this.y + CONFIG.PLAYER.hitRadiusY) >= (floor - 4);
        if (topHit || botHit) {
          this.takeHit();
        }
      }

      this.x = clamp(this.x, 40, CONFIG.W - 40);

      this.pushPath();

      if (inp.tap("KeyC") || inp.tap("Enter")) pu.commit();
      if (inp.tap("KeyV")) pu.toggleFormation();

      const shotHeld = inp.down("KeyZ") || inp.down("Space");
      const misHeld = inp.down("KeyX");
      const dmgMul = pu.damageMultiplier();

      if (pu.laser) {
        this.laserOn = shotHeld;
        this.laserGrace = lerp(this.laserGrace, this.laserOn ? 1 : 0, 1 - Math.pow(0.0001, dt));
      } else {
        this.laserOn = false;
        this.laserGrace = 0;
      }

      if (!pu.laser) {
        if (shotHeld) {
          this.shotT -= dt;
          const rate = pu.double ? CONFIG.DOUBLE.rate : CONFIG.SHOT.rate;
          if (this.shotT <= 0) {
            this.shotT += 1 / rate;
            if (pu.double) {
              w.spawnBullet(this.x + 18, this.y, CONFIG.DOUBLE.speed, 0, 3, 0.85 * dmgMul, true, "round");
              const a = -Math.PI / 6;
              w.spawnBullet(this.x + 16, this.y, Math.cos(a) * CONFIG.DOUBLE.speed, Math.sin(a) * CONFIG.DOUBLE.speed, 3, 0.85 * dmgMul, true, "needle");
            } else {
              w.spawnBullet(this.x + 18, this.y, CONFIG.SHOT.speed, 0, 3, 1.0 * dmgMul, true, "round");
            }
            w.audio.beep("square", 520, 0.02, 0.03);
          }
        } else this.shotT = 0;
      }

      if (pu.missile && misHeld) {
        this.missileT -= dt;
        if (this.missileT <= 0) {
          this.missileT += 1 / CONFIG.MISSILE.rate;
          const toFloor = (floor - margin) - this.y;
          const toCeil = this.y - (ceil + margin);
          const dir = (toCeil < toFloor) ? -1 : 1;
          w.spawnMissile(this.x + 10, this.y + 10 * dir, dir, CONFIG.MISSILE.dmg * dmgMul);
          w.audio.beep("square", 280, 0.03, 0.04);
        }
      } else this.missileT = 0;

      if (pu.optionCount > 0 && shotHeld) {
        const fireMul = (pu.overT > 0) ? 1.25 : 1.0;
        w.optionFireAcc += dt * fireMul;
        const step = pu.laser ? 1 / 18 : 1 / 12;
        if (w.optionFireAcc >= step) {
          w.optionFireAcc = 0;
          for (let i = 0; i < pu.optionCount; i++) {
            const op = this.getOptionPos(i, pu);
            if (pu.laser) {
              w.spawnBullet(op.x + 14, op.y, 720, 0, 2.5, 0.55 * dmgMul, true, "needle");
            } else if (pu.double) {
              w.spawnBullet(op.x + 14, op.y, 650, 0, 2.5, 0.65 * dmgMul, true, "round");
              const a = -Math.PI / 6;
              w.spawnBullet(op.x + 12, op.y, Math.cos(a) * 640, Math.sin(a) * 640, 2.5, 0.55 * dmgMul, true, "needle");
            } else {
              w.spawnBullet(op.x + 14, op.y, 680, 0, 2.5, 0.55 * dmgMul, true, "round");
            }
          }
        }
      } else w.optionFireAcc = 0;

      if (pu.laser && this.laserGrace > 0.02) {
        this._laserTickAcc += dt;
        const tick = 1 / CONFIG.LASER.tickRate;
        while (this._laserTickAcc >= tick) {
          this._laserTickAcc -= tick;
          this.applyLaserTick(dmgMul);
        }
      } else this._laserTickAcc = 0;
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

      if (pu.laser && this.laserGrace > 0.02) {
        const x0 = this.x + 18, y0 = this.y;
        g.save();
        g.globalAlpha = 0.20 + 0.55 * this.laserGrace;
        g.strokeStyle = "rgba(120,230,255,1)";
        g.lineWidth = CONFIG.LASER.widthGlow;
        g.shadowColor = "rgba(120,230,255,.8)";
        g.shadowBlur = 22;
        g.beginPath(); g.moveTo(x0, y0); g.lineTo(CONFIG.W + 200, y0); g.stroke();
        g.globalAlpha = 0.9 * this.laserGrace;
        g.shadowBlur = 0;
        g.strokeStyle = "rgba(190,250,255,1)";
        g.lineWidth = CONFIG.LASER.widthCore;
        g.beginPath(); g.moveTo(x0, y0); g.lineTo(CONFIG.W + 200, y0); g.stroke();
        g.restore();
      }
    }
  }

  // -----------------------------
  // Stage scripts (proper Stage2)
  // -----------------------------
  class StageTimeline {
    constructor(w, stageIndex) {
      this.w = w;
      this.stageIndex = stageIndex;
      this.t = 0;
      this.events = [];
      this._next = 0;
      this.build(stageIndex);
    }

    add(time, fn) { this.events.push({ time, fn }); }

    build(stageIndex) {
      this.events = [];
      this._next = 0;
      this.t = 0;

      const E = (time, fn) => this.add(time, fn);

      const spawnAirWave = (time, count, y0, y1, vx = -92) => {
        E(time, () => {
          for (let i = 0; i < count; i++) {
            const y = lerp(y0, y1, (count === 1 ? 0.5 : i / (count - 1)));
            const e = new AirEnemy(CONFIG.W + 80 + i * 34, y, 1);
            e.vx = vx;
            // stage2: extra chill
            if (stageIndex === 2) e._shootT = rand(2.6, 4.8);
            this.w.enemies.push(e);
          }
        });
      };

      const spawnGround = (time, list) => {
        E(time, () => {
          for (const it of list) {
            const ge = new GroundEnemy(CONFIG.W + it.x, it.onCeil);
            this.w.enemies.push(ge);
          }
        });
      };

      const spawnCapsule = (time, xOff, y) => {
        E(time, () => {
          // clamp to corridor
          const ceil = this.w.terrain.ceilingAt(CONFIG.W + xOff);
          const floor = this.w.terrain.floorAt(CONFIG.W + xOff);
          const yy = clamp(y, ceil + 26, floor - 26);
          this.w.items.push(new Capsule(CONFIG.W + xOff, yy));
        });
      };

      const bossApproach = (time, label = "BOSS APPROACH") => {
        E(time, () => {
          this.w.showBanner(label, 1.3);
          this.w.audio.duckBGM(0.55, 0.30);
          this.w.audio.beep("sawtooth", 130, 0.20, 0.14);
          this.w.camera.shake(8, 0.22);
        });
      };

      const spawnBoss = (time) => {
        E(time, () => {
          this.w.enemies.push(new Boss(CONFIG.W + 260, CONFIG.H / 2, stageIndex));
        });
      };

      if (stageIndex === 1) {
        // Stage 1: gentle, wide corridor
        spawnAirWave(1.6, 2, 180, 240, -82);
        spawnAirWave(4.6, 2, 320, 400, -86);
        spawnAirWave(7.4, 3, 150, 420, -84);

        // early guaranteed growth
        spawnCapsule(6.2, 220, 240);
        spawnCapsule(11.2, 260, 330);
        spawnCapsule(16.2, 280, 200);

        // ground turrets — teach missiles
        spawnGround(9.0, [{ x: 120, onCeil: false }, { x: 300, onCeil: false }]);
        spawnGround(13.2, [{ x: 220, onCeil: true }]);

        // mid
        spawnAirWave(18.8, 3, 160, 420, -96);
        spawnGround(21.0, [{ x: 160, onCeil: false }, { x: 360, onCeil: true }]);
        spawnAirWave(24.8, 2, 200, 280, -104);
        spawnAirWave(27.6, 2, 300, 380, -104);

        // pre-boss gifts
        spawnCapsule(29.5, 260, 250);
        spawnCapsule(32.0, 290, 320);

        bossApproach(35.0);
        spawnBoss(38.0);

      } else if (stageIndex === 2) {
        // Stage 2: cave corridor, more ground, rhythmical waves
        // opener: slow air + ground accents
        spawnAirWave(1.2, 2, 190, 260, -84);
        spawnGround(3.2, [{ x: 160, onCeil: false }]);
        spawnAirWave(4.6, 3, 320, 430, -88);
        spawnGround(6.0, [{ x: 220, onCeil: true }]);

        // guaranteed capsules again (because cave is tighter)
        spawnCapsule(4.0, 240, 230);
        spawnCapsule(8.0, 260, 330);

        // staggered sequence (resty feeling)
        spawnAirWave(10.0, 2, 160, 220, -92);
        spawnGround(11.6, [{ x: 140, onCeil: false }, { x: 280, onCeil: false }]);
        spawnAirWave(13.4, 2, 360, 420, -92);
        spawnGround(15.0, [{ x: 220, onCeil: true }]);

        // mid setpiece: two lanes
        spawnAirWave(17.5, 4, 150, 430, -98);
        spawnCapsule(18.6, 260, 260);

        // tighten then breathe
        spawnGround(20.4, [{ x: 150, onCeil: false }, { x: 300, onCeil: true }]);
        spawnAirWave(22.6, 3, 200, 360, -96);

        // pre-boss gifts
        spawnCapsule(24.2, 260, 300);
        spawnCapsule(26.0, 300, 230);

        bossApproach(28.0, "BOSS APPROACH");
        spawnBoss(31.0);
      }

      this.events.sort((a, b) => a.time - b.time);
    }

    update(dt) {
      this.t += dt;
      while (this._next < this.events.length && this.t >= this.events[this._next].time) {
        this.events[this._next].fn();
        this._next++;
      }
    }
  }

  // -----------------------------
  // World
  // -----------------------------
  class World {
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

      this.bullets = [];
      this.enemies = [];
      this.particles = [];
      this.items = [];

      this.player = new Player(this);
      this.powerUp = new PowerUpSystem(this);

      this.optionFireAcc = 0;
      this.banner = null;

      this.paused = false;
      this.gameOver = false;

      this.stageIndex = 1;
      this.stageClear = false;
      this.stageClearTimer = 0;

      this.terrain = new Terrain(this.stageIndex);
      this.timeline = new StageTimeline(this, this.stageIndex);

      this.bgStars = Array.from({ length: 140 }, () => ({ x: rand(0, CONFIG.W), y: rand(0, CONFIG.H), z: rand(0.2, 1.0) }));
      this.nebula = Array.from({ length: 10 }, (_, i) => ({ y: 40 + i * 46 + rand(-12, 12), a: rand(0, TAU), s: rand(0.4, 1.0) }));

      this.next1up = 100000;
      this.oneUpStep = 150000;

      this.showBanner("STAGE 1: ORBITAL WRECKAGE", 1.8);
    }

    showBanner(text, dur = 1.2) { this.banner = { text, t: dur, max: dur }; }

    spawnBullet(x, y, vx, vy, r, dmg, friendly, kind) {
      // terrain: enemy bullets that spawn in wall should die (rare, but safe)
      const ceil = this.terrain.ceilingAt(x);
      const floor = this.terrain.floorAt(x);
      if (y <= ceil + 4 || y >= floor - 4) return;
      this.bullets.push(new Bullet(x, y, vx, vy, r, dmg, friendly, kind));
    }

    spawnMissile(x, y, dir, dmg) {
      const m = new Bullet(x, y, CONFIG.MISSILE.speed, 0, 4, dmg, true, "missile");
      m.dir = dir; m.hug = false;

      m.update = (dt, w) => {
        m.x += m.vx * dt;

        const ceil = w.terrain.ceilingAt(m.x);
        const floor = w.terrain.floorAt(m.x);

        if (!m.hug) {
          m.y += dir * 240 * dt;

          // if reaches terrain boundary -> hug
          const targetY = (dir < 0) ? (ceil + 18) : (floor - 18);
          if (dir < 0 && m.y <= targetY) { m.y = targetY; m.hug = true; }
          if (dir > 0 && m.y >= targetY) { m.y = targetY; m.hug = true; }

          // clamp inside corridor
          m.y = clamp(m.y, ceil + 18, floor - 18);

        } else {
          // hug terrain line
          const targetY = (dir < 0) ? (ceil + 18) : (floor - 18);
          m.y = lerp(m.y, targetY, 1 - Math.pow(0.0001, dt));
        }

        // if terrain closes too tight, missile dies
        if (floor - ceil < 80) m.dead = true;

        if (m.x > CONFIG.W + 90) m.dead = true;
      };

      m.draw = (g) => {
        g.save();
        g.translate(m.x, m.y);
        g.shadowColor = "rgba(160,230,255,.6)";
        g.shadowBlur = 14;
        g.fillStyle = "rgba(160,230,255,1)";
        g.beginPath(); g.ellipse(0, 0, 8, 3.5, 0, 0, TAU); g.fill();
        g.restore();
      };

      this.bullets.push(m);
    }

    dropChanceForEnemy(e) {
      let chance = CONFIG.POWERUP.capsuleDropBase;

      // stage 1 early boost only
      const early = (this.stageIndex === 1) && (this.stageTime < CONFIG.POWERUP.capsuleDropEarlyTime);
      if (early) chance *= CONFIG.POWERUP.capsuleDropEarlyMul;

      if (e instanceof GroundEnemy) chance *= 0.75;
      if (e instanceof Boss) chance = 0.0;

      return clamp(chance, 0, 0.85);
    }

    onEnemyKilled(e) {
      const pts = (e.score || 200) * this.player.mult;
      this.player.addScore(pts);

      this.player.multT = 5.0;
      this.player.mult = Math.min(4, this.player.mult + 1);

      const chance = this.dropChanceForEnemy(e);
      if (Math.random() < chance) this.items.push(new Capsule(e.x, e.y));

      this.audio.noiseBurst(0.05, 0.12);
      this.camera.shake(4, 0.12);
      for (let i = 0; i < 10; i++) {
        this.particles.push(new Particle(e.x + rand(-10, 10), e.y + rand(-10, 10), rand(-120, 120), rand(-120, 120), 0.35, i % 4 === 0 ? "big" : "spark"));
      }

      if (this.player.score >= this.next1up) {
        this.player.lives += 1;
        this.next1up += this.oneUpStep;
        this.audio.beep("square", 980, 0.12, 0.12);
        this.showBanner("1UP", 0.9);
      }
    }

    onBossKilled(b) {
      this.player.addScore(45000);
      this.audio.duckBGM(0.45, 0.35);
      this.audio.beep("sawtooth", 220, 0.22, 0.14);
      this.camera.shake(12, 0.28);

      this.stageClear = true;
      this.stageClearTimer = 0;

      for (let i = 0; i < 100; i++) {
        this.particles.push(new Particle(b.x + rand(-60, 60), b.y + rand(-60, 60), rand(-300, 300), rand(-300, 300), rand(0.4, 0.95), i % 6 === 0 ? "big" : "spark"));
      }
      this.showBanner("STAGE CLEAR", 1.9);
    }

    advanceStage() {
      this.stageIndex += 1;
      this.stageTime = 0;
      this.scrollX = 0;

      this.bullets = [];
      this.enemies = [];
      this.items = [];

      if (this.stageIndex <= 2) {
        this.terrain.setStage(this.stageIndex);
        this.timeline = new StageTimeline(this, this.stageIndex);
        this.showBanner(`STAGE ${this.stageIndex}: ${this.stageIndex === 2 ? "NEBULA CAVERN" : "UNKNOWN"}`, 1.9);
      } else {
        this.showBanner("ALL CLEAR (TO BE CONTINUED)", 2.2);
      }

      this.stageClear = false;
      this.stageClearTimer = 0;

      this.player.x = 130;
      this.player.y = CONFIG.H / 2;
      this.player.vx = 0;
      this.player.vy = 0;
      this.player.invulnT = 1.2;
    }

    // Terrain collision for bullets: if bullet crosses wall, delete
    bulletHitsTerrain(b) {
      const ceil = this.terrain.ceilingAt(b.x);
      const floor = this.terrain.floorAt(b.x);
      return (b.y <= ceil + 2) || (b.y >= floor - 2);
    }

    handleCollisions() {
      const p = this.player;

      // enemy bullets hit player
      if (!p.dead) {
        for (const b of this.bullets) {
          if (b.dead) continue;

          // terrain removes bullets too
          if (!b.friendly && this.bulletHitsTerrain(b)) {
            b.dead = true;
            continue;
          }

          if (b.friendly) continue;
          const dx = b.x - p.x, dy = b.y - p.y;
          const nx = dx / CONFIG.PLAYER.hitRadiusX;
          const ny = dy / CONFIG.PLAYER.hitRadiusY;
          if (nx * nx + ny * ny <= 1.0) {
            b.dead = true;
            p.takeHit();
            break;
          }
        }

        // player collide with enemies
        for (const e of this.enemies) {
          if (e.dead) continue;
          const ex = e.x, ey = e.y;
          const er = e.r || 18;
          const dx = ex - p.x, dy = ey - p.y;
          if (dx * dx + dy * dy <= (er + 12) * (er + 12)) {
            p.takeHit();
            break;
          }
        }
      }

      // friendly bullets hit enemies + terrain
      for (const b of this.bullets) {
        if (b.dead) continue;

        // friendly bullets also vanish on wall (laser is separate)
        if (b.friendly && this.bulletHitsTerrain(b)) {
          b.dead = true;
          continue;
        }

        if (!b.friendly) continue;
        for (const e of this.enemies) {
          if (e.dead) continue;
          const ex = e.x, ey = e.y;
          const er = e.r || 18;
          const dx = ex - b.x, dy = ey - b.y;
          if (dx * dx + dy * dy <= (er + b.r) * (er + b.r)) {
            b.dead = true;
            if (e instanceof Boss) e.takeDamage(b.dmg, this, b.x, b.y);
            else if (e.takeDamage) e.takeDamage(b.dmg, this);
            break;
          }
        }
      }
    }

    update(dt) {
      this.lastDt = dt;

      if (this.input.tap("Escape")) {
        this.paused = !this.paused;
        this.audio.beep("triangle", this.paused ? 180 : 360, 0.06, 0.06);
      }
      if (this.paused) { this.input.endFrame(); return; }

      if (this.gameOver) {
        if (this.input.tap("KeyR")) location.reload();
        this.input.endFrame(); return;
      }

      if (this.stageClear) {
        this.stageClearTimer += dt;
        if (this.stageClearTimer > 2.2) {
          this.advanceStage();
        }
      }

      if (this.hitStopMs > 0) {
        const consume = Math.min(this.hitStopMs, dt * 1000);
        this.hitStopMs -= consume;
        const slow = dt * 0.15;
        this.time += slow;
        this.camera.update(slow);
        for (const p of this.particles) p.update(slow);
        this.particles = this.particles.filter(p => p.life > 0);
        this.input.endFrame();
        return;
      }

      this.time += dt;
      this.stageTime += dt;
      this.scrollX += CONFIG.STAGE.scrollSpeed * dt;

      this.terrain.updateScroll(this.scrollX);

      if (!this.stageClear && this.stageIndex <= 2) this.timeline.update(dt);

      this.camera.update(dt);

      this.player.update(dt, this);

      for (const b of this.bullets) b.update(dt, this);
      for (const e of this.enemies) e.update(dt, this);
      for (const it of this.items) it.update(dt, this);
      for (const p of this.particles) p.update(dt, this);

      this.handleCollisions();

      this.bullets = this.bullets.filter(b => !b.dead);
      this.enemies = this.enemies.filter(e => !e.dead);
      this.items = this.items.filter(i => !i.dead);
      this.particles = this.particles.filter(p => p.life > 0);

      if (this.banner) {
        this.banner.t -= dt;
        if (this.banner.t <= 0) this.banner = null;
      }

      this.input.endFrame();
    }

    drawBackground(g) {
      const stageTint = (this.stageIndex === 2)
        ? { laneA: "rgba(180,140,255,1)", laneB: "rgba(140,210,255,1)", bar: "rgba(170,140,255,1)" }
        : { laneA: "rgba(140,200,255,1)", laneB: "rgba(140,230,255,1)", bar: "rgba(120,230,255,1)" };

      // stars
      g.save();
      for (const s of this.bgStars) {
        let x = s.x - (this.scrollX * (0.1 + 0.55 * s.z)) % (CONFIG.W + 40);
        if (x < -20) x += CONFIG.W + 40;
        const y = s.y;
        const r = 1 + 1.8 * s.z;
        g.globalAlpha = 0.22 + 0.55 * s.z;
        g.fillStyle = "rgba(210,240,255,1)";
        g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
      }
      g.restore();

      // stage2 nebula bands (proper background identity)
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

      // lanes
      g.save();
      g.globalAlpha = 0.08;
      g.strokeStyle = stageTint.laneA;
      g.lineWidth = 2;
      for (let i = 0; i < 6; i++) {
        const y = 60 + i * 80 + Math.sin(this.time * 0.4 + i) * 10;
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(CONFIG.W, y + Math.sin(this.time * 0.5 + i) * 18);
        g.stroke();
      }
      g.restore();

      // terrain itself
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

      const boss = this.enemies.find(e => e instanceof Boss);
      if (boss) {
        const ratio = clamp(boss.hp / (boss._maxHp || 1), 0, 1);
        const bx = CONFIG.W / 2 - 180;
        const by = 18;
        g.globalAlpha = 0.85;
        g.fillStyle = "rgba(255,255,255,0.10)";
        g.beginPath(); g.roundRect(bx, by, 360, 10, 6); g.fill();
        g.fillStyle = "rgba(185,150,255,0.75)";
        g.beginPath(); g.roundRect(bx, by, 360 * ratio, 10, 6); g.fill();
      }

      const slots = CONFIG.POWERUP.gaugeSlots;
      const baseX = 180;
      const y = CONFIG.H - 26;
      const w = 84, h = 18, pad = 8;

      g.globalAlpha = 0.75;
      g.fillText("POWER-UP", 14, CONFIG.H - 18);

      for (let i = 0; i < slots.length; i++) {
        const x = baseX + i * (w + pad);
        const active = (pu.gauge - 1 === i);
        g.save();
        g.translate(x, y);
        g.globalAlpha = 0.9;
        g.fillStyle = active ? "rgba(130,240,255,0.35)" : "rgba(255,255,255,0.06)";
        g.strokeStyle = active ? "rgba(130,240,255,0.9)" : "rgba(255,255,255,0.14)";
        g.lineWidth = active ? 2.5 : 1.2;
        g.beginPath(); g.roundRect(0, 0, w, h, 8); g.fill(); g.stroke();
        g.fillStyle = "rgba(230,240,255,0.9)";
        g.font = "12px system-ui";
        g.fillText(slots[i], 8, 13);
        g.restore();
      }

      const rx = CONFIG.W - 320;
      g.globalAlpha = 0.9;
      g.fillText(`SPD:${pu.speedLevel}  OPT:${pu.optionCount}  SHD:${pu.shield ? "ON" : "--"}`, rx, 22);
      g.fillText(`WPN:${pu.laser ? "LASER" : (pu.double ? "DOUBLE" : "SHOT")}  MIS:${pu.missile ? "ON" : "--"}  OD:${pu.overT > 0 ? pu.overT.toFixed(1) : "--"}`, rx, 44);
      g.fillText(`FORM:${["FOLLOW", "SPREAD", "LINE"][pu.formation]}`, rx, 66);

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

      for (const it of this.items) it.draw(g, this);
      for (const b of this.bullets) b.draw(g, this);

      // Ground enemies behind air enemies for readability
      for (const e of this.enemies.filter(e => e instanceof GroundEnemy)) e.draw(g, this);
      for (const e of this.enemies.filter(e => !(e instanceof GroundEnemy))) e.draw(g, this);

      for (const p of this.particles) p.draw(g, this);
      this.player.draw(g, this);

      g.restore();

      this.drawHUD(g);

      if (this.paused) this.drawOverlayText(g, "PAUSED", "Rでリロード / Escで復帰", 0.55);
      if (this.gameOver) this.drawOverlayText(g, "GAME OVER", "Rでリロード", 0.75);
    }
  }

  // -----------------------------
  // Boot
  // -----------------------------
  const canvas = document.getElementById("game");
  if (!canvas) {
    alert("canvas #game が見つかりませんでした。HTMLのIDを確認してね。");
    return;
  }

  const world = new World(canvas);

  let last = performance.now() / 1000;
  let acc = 0;

  function frame() {
    const now = performance.now() / 1000;
    let dt = now - last;
    last = now;
    dt = Math.min(CONFIG.MAX_FRAME_DT, dt);
    acc += dt;

    while (acc >= CONFIG.FIXED_DT) {
      world.update(CONFIG.FIXED_DT);
      acc -= CONFIG.FIXED_DT;
    }

    world.draw();
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
})();
