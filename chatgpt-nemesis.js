// chatgpt-nemesis.js (ESM / dependency-free)
// STARLINE VECTOR — “Gradius-like soul” browser STG prototype (playable complete core)
// Controls: Move WASD/Arrows, Shot Z/Space, Missile X, PowerUp C/Enter, Option formation V, Pause Esc
// Notes: Placeholder vector art + procedural audio. Swap with assets later.

const TAU = Math.PI * 2;

const CONFIG = {
  W: 960,
  H: 540,
  FIXED_DT: 1 / 120,
  MAX_FRAME_DT: 1 / 20,
  TARGET_FPS: 60,

  PLAYER: {
    baseSpeed: 220,
    maxSpeed: 360,
    accel: 2400,
    decel: 2600,
    hitRadiusX: 10,
    hitRadiusY: 7,
    invulnOnShieldBreak: 0.35,
    respawnIFrames: 1.0,
  },

  POWERUP: {
    capsuleDropChance: 0.18,
    gaugeSlots: ["SPEED", "MISSILE", "DOUBLE", "LASER", "OPTION", "SHIELD", "OVERDRIVE"],
    overdriveDuration: 8.0,
    overdrivePowerMul: 1.35,
    overdriveEndSlow: 0.90,
    overdriveEndSlowDuration: 2.0,
    speedSteps: [1.12, 1.12, 1.10, 1.08], // multiplicative steps
  },

  SHOT: {
    rate: 12, // bullets per second
    dmg: 1.0,
    speed: 640,
  },

  DOUBLE: {
    rate: 10,
    dmg: 0.85,
    speed: 620,
    angle: -Math.PI / 6, // up-left? Actually forward/up; since horizontal scrolling, up is negative y.
  },

  LASER: {
    tickRate: 60,        // damage ticks per second
    dps: 11.5,           // base DPS
    widthCore: 4,
    widthGlow: 12,
    maxLen: 1200,
    hitStopMs: 10,       // "initial hit" tiny stop
    startGrace: 0.06,    // small ramp-in
  },

  MISSILE: {
    rate: 6,
    dmg: 1.35,
    speed: 420,
  },

  OPTION: {
    max: 4,
    followDelay: 0.11, // seconds of path delay per option index base
    fireMul: 1.0,
  },

  ENEMY: {
    bulletSpeed: 280,
  },

  STAGE1: {
    length: 130, // seconds
    scrollSpeed: 120, // px/s baseline
  }
};

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function lerp(a, b, t) { return a + (b - a) * t; }
function rand(a = 0, b = 1) { return a + Math.random() * (b - a); }
function sign(v) { return v < 0 ? -1 : 1; }

class Input {
  constructor() {
    this.keys = new Map();
    this.pressed = new Set();
    this.released = new Set();
    window.addEventListener("keydown", (e) => {
      if (!this.keys.get(e.code)) this.pressed.add(e.code);
      this.keys.set(e.code, true);
      // prevent page scrolling
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) e.preventDefault();
    }, { passive: false });
    window.addEventListener("keyup", (e) => {
      this.keys.set(e.code, false);
      this.released.add(e.code);
    });
  }
  down(code) { return !!this.keys.get(code); }
  tap(code) { return this.pressed.has(code); }
  up(code) { return this.released.has(code); }
  endFrame() { this.pressed.clear(); this.released.clear(); }
}

class AudioBus {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.bgmGain = null;
    this.seGain = null;
    this._bgmNode = null;
    this._bgmLP = null;
    this.enabled = true;
    this._initOnce();
  }
  _initOnce() {
    const tryInit = () => {
      if (this.ctx) return;
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

      // simple BGM: filtered saw pad
      this._bgmLP = this.ctx.createBiquadFilter();
      this._bgmLP.type = "lowpass";
      this._bgmLP.frequency.value = 900;
      this._bgmLP.Q.value = 0.7;
      this._bgmLP.connect(this.bgmGain);

      this.startBGM();
    };

    // unlock audio on first interaction
    window.addEventListener("pointerdown", tryInit, { once: true });
    window.addEventListener("keydown", tryInit, { once: true });
  }
  now() { return this.ctx ? this.ctx.currentTime : 0; }
  startBGM() {
    if (!this.ctx) return;
    if (this._bgmNode) return;

    const osc = this.ctx.createOscillator();
    osc.type = "sawtooth";
    const gain = this.ctx.createGain();
    gain.gain.value = 0.0;

    osc.connect(gain);
    gain.connect(this._bgmLP);

    const t = this.now();
    gain.gain.setValueAtTime(0.0, t);
    gain.gain.linearRampToValueAtTime(0.18, t + 1.4);

    // subtle "melody" via detune stepping
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
  stopBGM() {
    if (!this.ctx || !this._bgmNode) return;
    clearInterval(this._bgmNode.timer);
    const t = this.now();
    this._bgmNode.gain.gain.linearRampToValueAtTime(0.0, t + 0.6);
    this._bgmNode.osc.stop(t + 0.65);
    this._bgmNode = null;
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
      const t = i / len;
      data[i] = (Math.random() * 2 - 1) * (1 - t) * 0.9;
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
  constructor() {
    this.x = 0;
    this.y = 0;
    this.shakeT = 0;
    this.shakeA = 0;
  }
  shake(amount = 6, t = 0.18) {
    this.shakeA = Math.max(this.shakeA, amount);
    this.shakeT = Math.max(this.shakeT, t);
  }
  update(dt) {
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      if (this.shakeT <= 0) {
        this.shakeT = 0;
        this.shakeA = 0;
      }
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
    this.life = life; this.maxLife = life;
    this.kind = kind;
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
    } else if (this.kind === "glow") {
      g.fillStyle = "rgba(120,220,255,1)";
      g.beginPath(); g.arc(this.x, this.y, this.r * (1 + (1 - t) * 2.5), 0, TAU); g.fill();
    }
    g.restore();
  }
}

class Entity {
  constructor() {
    this.dead = false;
  }
  update(dt, world) { }
  draw(g, world) { }
}

class Bullet extends Entity {
  constructor(x, y, vx, vy, r = 3, dmg = 1, friendly = true, kind = "round") {
    super();
    this.x = x; this.y = y; this.vx = vx; this.vy = vy;
    this.r = r; this.dmg = dmg; this.friendly = friendly;
    this.kind = kind;
  }
  update(dt, world) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (this.x < -80 || this.x > CONFIG.W + 80 || this.y < -80 || this.y > CONFIG.H + 80) this.dead = true;
  }
  draw(g) {
    g.save();
    if (this.friendly) {
      g.fillStyle = "rgba(150,230,255,1)";
      g.shadowColor = "rgba(100,220,255,.6)";
      g.shadowBlur = 10;
    } else {
      g.fillStyle = "rgba(255,160,180,1)";
      g.shadowColor = "rgba(255,120,150,.6)";
      g.shadowBlur = 10;
    }
    g.beginPath();
    if (this.kind === "needle") {
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
    this.x = x; this.y = y;
    this.vx = -120;
    this.vy = rand(-20, 20);
    this.r = 8;
    this.phase = rand(0, TAU);
  }
  update(dt, world) {
    this.phase += dt * 4.5;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.vy += Math.sin(this.phase) * 18 * dt;
    if (this.x < -60) this.dead = true;

    const p = world.player;
    if (p && !p.dead) {
      const dx = this.x - p.x;
      const dy = this.y - p.y;
      const d2 = dx * dx + dy * dy;
      if (d2 <= (this.r + 14) * (this.r + 14)) {
        this.dead = true;
        world.audio.beep("square", 920, 0.06, 0.12);
        world.powerUp.gainCapsule();
      }
    }
  }
  draw(g) {
    g.save();
    g.translate(this.x, this.y);
    const bob = Math.sin(this.phase) * 2.5;
    g.translate(0, bob);
    g.shadowColor = "rgba(120,240,255,.7)";
    g.shadowBlur = 14;
    g.fillStyle = "rgba(120,240,255,1)";
    g.beginPath(); g.roundRect(-9, -7, 18, 14, 5); g.fill();
    g.shadowBlur = 0;
    g.fillStyle = "rgba(5,10,20,.9)";
    g.beginPath(); g.roundRect(-6, -4, 12, 8, 3); g.fill();
    g.restore();
  }
}

class Enemy extends Entity {
  constructor(x, y, hp = 8) {
    super();
    this.x = x; this.y = y;
    this.vx = -80; this.vy = 0;
    this.r = 16;
    this.hp = hp;
    this.score = 200;
    this._shootT = rand(0.4, 1.4);
  }
  takeDamage(dmg, world) {
    this.hp -= dmg;
    for (let i = 0; i < 2; i++) world.particles.push(new Particle(this.x + rand(-6, 6), this.y + rand(-6, 6), rand(-40, 40), rand(-40, 40), 0.18, "spark"));
    if (this.hp <= 0) {
      this.dead = true;
      world.onEnemyKilled(this);
    }
  }
  update(dt, world) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (this.x < -120) this.dead = true;

    this._shootT -= dt;
    if (this._shootT <= 0) {
      this._shootT = rand(1.2, 2.1);
      // simple aimed burst (max 2 consecutive "aimed" is enforced via pattern design in timelines; here just single shot)
      const p = world.player;
      if (p && p.canBeHit()) {
        const dx = (p.x - this.x);
        const dy = (p.y - this.y);
        const len = Math.hypot(dx, dy) || 1;
        const sp = CONFIG.ENEMY.bulletSpeed;
        world.spawnBullet(this.x - 10, this.y, (dx / len) * sp, (dy / len) * sp, 4, 1, false, "needle");
        world.audio.beep("triangle", 260, 0.05, 0.06);
      }
    }
  }
  draw(g) {
    g.save();
    g.translate(this.x, this.y);
    g.shadowColor = "rgba(255,140,170,.25)";
    g.shadowBlur = 16;
    g.fillStyle = "rgba(240,160,190,.95)";
    g.beginPath();
    g.moveTo(18, 0);
    g.lineTo(-10, -12);
    g.lineTo(-14, 0);
    g.lineTo(-10, 12);
    g.closePath();
    g.fill();
    g.shadowBlur = 0;
    g.strokeStyle = "rgba(10,10,16,.35)";
    g.lineWidth = 2;
    g.stroke();
    g.restore();
  }
}

class MidBoss extends Enemy {
  constructor(x, y) {
    super(x, y, 180);
    this.r = 44;
    this.score = 6000;
    this.vx = -60;
    this.phase = 0;
    this._patternT = 0.5;
    this._mode = 0;
  }
  update(dt, world) {
    // enter then hold
    if (this.x > CONFIG.W - 220) this.x += this.vx * dt;
    else this.vx = 0;

    this.phase += dt;
    this.y = lerp(this.y, CONFIG.H / 2 + Math.sin(this.phase * 1.4) * 90, 1 - Math.pow(0.0001, dt));

    this._patternT -= dt;
    if (this._patternT <= 0) {
      this._mode = (this._mode + 1) % 3;
      if (this._mode === 0) this._patternT = 1.2;
      if (this._mode === 1) this._patternT = 1.6;
      if (this._mode === 2) this._patternT = 1.0;
    }

    // patterns with "rest"
    if (this._mode === 0) {
      // slow ring
      if (Math.random() < dt * 2.8) {
        const n = 8;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * TAU + this.phase * 0.8;
          const sp = 170;
          world.spawnBullet(this.x - 25, this.y, Math.cos(a) * sp, Math.sin(a) * sp, 4, 1, false, "round");
        }
        world.audio.beep("triangle", 210, 0.06, 0.07);
      }
    } else if (this._mode === 1) {
      // 2-aim shots (not continuous)
      if (Math.random() < dt * 3.6) {
        const p = world.player;
        if (p && p.canBeHit()) {
          for (let k = 0; k < 2; k++) {
            const dx = p.x - this.x;
            const dy = p.y - this.y + (k ? 28 : -28);
            const len = Math.hypot(dx, dy) || 1;
            const sp = 260;
            world.spawnBullet(this.x - 30, this.y + (k ? 12 : -12), (dx / len) * sp, (dy / len) * sp, 4, 1, false, "needle");
          }
          world.audio.beep("triangle", 240, 0.05, 0.07);
        }
      }
    } else {
      // rest: no bullets, just menacing sparks
      if (Math.random() < dt * 10) {
        world.particles.push(new Particle(this.x + rand(-20, 20), this.y + rand(-20, 20), rand(-30, 30), rand(-30, 30), 0.2, "spark"));
      }
    }

    if (this.hp <= 0) this.dead = true;
  }
  draw(g) {
    g.save();
    g.translate(this.x, this.y);
    g.shadowColor = "rgba(255,180,210,.35)";
    g.shadowBlur = 28;
    g.fillStyle = "rgba(255,180,210,.92)";
    g.beginPath();
    g.roundRect(-56, -30, 112, 60, 18);
    g.fill();

    // core
    const corePulse = 1 + Math.sin(this.phase * 4) * 0.08;
    g.shadowColor = "rgba(140,240,255,.7)";
    g.shadowBlur = 18;
    g.fillStyle = "rgba(140,240,255,1)";
    g.beginPath();
    g.arc(20, 0, 10 * corePulse, 0, TAU);
    g.fill();
    g.restore();
  }
}

class Boss extends Enemy {
  constructor(x, y) {
    super(x, y, 420);
    this.r = 70;
    this.score = 20000;
    this.vx = -55;
    this.phase = 0;
    this.state = "enter";
    this.timer = 0;
    this.weakOpen = 0; // 0..1
  }
  update(dt, world) {
    this.phase += dt;
    if (this.state === "enter") {
      this.x += this.vx * dt;
      if (this.x < CONFIG.W - 210) {
        this.vx = 0;
        this.state = "patternA";
        this.timer = 0;
        world.audio.duckBGM(0.45, 0.25);
        world.camera.shake(8, 0.22);
      }
      this.y = lerp(this.y, CONFIG.H / 2, 1 - Math.pow(0.0001, dt));
      return;
    }

    // gentle tracking
    const targetY = CONFIG.H / 2 + Math.sin(this.phase * 0.9) * 120;
    this.y = lerp(this.y, targetY, 1 - Math.pow(0.001, dt));

    this.timer += dt;

    // open/close weakpoint windows
    const open = (this.state === "patternB" || this.state === "patternC");
    this.weakOpen = lerp(this.weakOpen, open ? 1 : 0, 1 - Math.pow(0.0001, dt));

    if (this.state === "patternA") {
      // fan bursts, then rest
      if (this.timer < 6.5) {
        if (Math.random() < dt * 2.2) {
          const n = 9;
          const base = Math.PI; // left
          const spread = 0.8;
          for (let i = 0; i < n; i++) {
            const t = (i / (n - 1)) * 2 - 1;
            const a = base + t * spread;
            const sp = 230 + Math.abs(t) * 40;
            world.spawnBullet(this.x - 80, this.y, Math.cos(a) * sp, Math.sin(a) * sp, 4, 1, false, "round");
          }
          world.audio.beep("triangle", 190, 0.05, 0.07);
        }
      } else {
        // rest
        if (this.timer > 8.0) {
          this.state = "patternB";
          this.timer = 0;
        }
      }
    } else if (this.state === "patternB") {
      // aimed double shots with pauses; weakpoint open (reward)
      if (this.timer < 7.5) {
        if (Math.random() < dt * 2.4) {
          const p = world.player;
          if (p && p.canBeHit()) {
            const dx = p.x - this.x;
            const dy = p.y - this.y;
            const len = Math.hypot(dx, dy) || 1;
            const sp = 280;
            for (let k = 0; k < 2; k++) {
              const off = (k ? +1 : -1) * 22;
              world.spawnBullet(this.x - 84, this.y + off, (dx / len) * sp, (dy / len) * sp, 4, 1, false, "needle");
            }
            world.audio.beep("triangle", 240, 0.05, 0.07);
          }
        }
      } else {
        if (this.timer > 9.2) {
          this.state = "patternC";
          this.timer = 0;
        }
      }
    } else if (this.state === "patternC") {
      // rotating ring, then rest
      if (this.timer < 6.0) {
        if (Math.random() < dt * 3.2) {
          const n = 10;
          const sp = 180;
          const rot = this.phase * 1.8;
          for (let i = 0; i < n; i++) {
            const a = rot + (i / n) * TAU;
            world.spawnBullet(this.x - 84, this.y, Math.cos(a) * sp, Math.sin(a) * sp, 4, 1, false, "round");
          }
          world.audio.beep("triangle", 205, 0.05, 0.07);
        }
      } else {
        if (this.timer > 8.3) {
          this.state = "patternA";
          this.timer = 0;
        }
      }
    }

    if (this.hp <= 0) {
      this.dead = true;
      world.onBossKilled(this);
    }
  }
  // Boss has armored body; weakpoint takes more dmg when open.
  takeDamage(dmg, world, hitX = 0, hitY = 0) {
    // Determine weakpoint zone (front core area)
    const wx = this.x - 40;
    const wy = this.y;
    const dx = hitX - wx;
    const dy = hitY - wy;
    const d = Math.hypot(dx, dy);

    let mul = 0.35; // armored
    if (this.weakOpen > 0.5 && d < 22) mul = 1.25; // weak open
    if (this.weakOpen > 0.85 && d < 16) mul = 1.45; // sweet spot

    super.takeDamage(dmg * mul, world);

    if (mul > 1.0) {
      world.particles.push(new Particle(wx + rand(-6, 6), wy + rand(-6, 6), rand(-50, 50), rand(-50, 50), 0.25, "glow"));
    }
  }
  draw(g) {
    g.save();
    g.translate(this.x, this.y);
    g.shadowColor = "rgba(255,160,200,.25)";
    g.shadowBlur = 36;

    // body
    g.fillStyle = "rgba(255,160,200,.92)";
    g.beginPath();
    g.roundRect(-120, -70, 160, 140, 34);
    g.fill();

    // "mouth" / cannon
    g.shadowBlur = 0;
    g.fillStyle = "rgba(8,10,18,.75)";
    g.beginPath();
    g.roundRect(-132, -18, 54, 36, 12);
    g.fill();

    // weakpoint shutters
    const open = this.weakOpen;
    const wx = -40, wy = 0;
    g.save();
    g.translate(wx, wy);
    // shutters
    g.fillStyle = "rgba(10,12,20,.7)";
    g.beginPath();
    g.roundRect(-22, -22, 44, 18 * (1 - open), 8);
    g.roundRect(-22, 4 + (18 * open), 44, 18 * (1 - open), 8);
    g.fill();

    // core
    const pulse = 1 + Math.sin(this.phase * 5) * 0.07;
    g.shadowColor = "rgba(130,240,255,.75)";
    g.shadowBlur = 20;
    g.globalAlpha = 0.55 + open * 0.45;
    g.fillStyle = "rgba(130,240,255,1)";
    g.beginPath();
    g.arc(0, 0, 12 * pulse, 0, TAU);
    g.fill();
    g.restore();

    // HP bar (above boss)
    g.restore();
  }
}

class PowerUpSystem {
  constructor(world) {
    this.world = world;
    this.gauge = 0; // 0..7 inclusive but display as steps
    this.speedLevel = 0; // 0..4
    this.missile = false;
    this.double = false;
    this.laser = false;
    this.optionCount = 0; // 0..4
    this.shield = false;
    this.overdrive = false;

    this.overT = 0;
    this.overEndSlowT = 0;

    this.formation = 0; // 0 follow 1 spread 2 line
  }

  gainCapsule() {
    this.gauge = (this.gauge + 1) % (CONFIG.POWERUP.gaugeSlots.length + 1);
    // gauge loops at 0 if you miss timing; classic vibe
    if (this.gauge === 0) this.gauge = 1; // keep progress (no empty bounce), feels better in modern play
  }

  commit() {
    const idx = this.gauge - 1;
    if (idx < 0) return;
    const slot = CONFIG.POWERUP.gaugeSlots[idx];
    const a = this.world.audio;

    switch (slot) {
      case "SPEED":
        if (this.speedLevel < 4) {
          this.speedLevel++;
          a.beep("square", 520, 0.06, 0.10);
        } else a.beep("triangle", 240, 0.05, 0.06);
        break;
      case "MISSILE":
        this.missile = true;
        a.beep("square", 420, 0.06, 0.10);
        break;
      case "DOUBLE":
        this.double = true;
        this.laser = false; // mutually exclusive in this design
        a.beep("square", 470, 0.06, 0.10);
        break;
      case "LASER":
        this.laser = true;
        this.double = false;
        a.beep("square", 620, 0.06, 0.11);
        break;
      case "OPTION":
        if (this.optionCount < CONFIG.OPTION.max) {
          this.optionCount++;
          a.beep("square", 740, 0.07, 0.10);
        } else a.beep("triangle", 240, 0.05, 0.06);
        break;
      case "SHIELD":
        this.shield = true;
        a.beep("square", 880, 0.08, 0.09);
        break;
      case "OVERDRIVE":
        this.overdrive = true;
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
    this.world.audio.beep("triangle", 520 + this.formation * 90, 0.06, 0.06);
  }

  speedMultiplier() {
    let mul = 1.0;
    for (let i = 0; i < this.speedLevel; i++) mul *= CONFIG.POWERUP.speedSteps[i];
    // overdrive end slow window
    if (this.overEndSlowT > 0) mul *= CONFIG.POWERUP.overdriveEndSlow;
    return mul;
  }

  damageMultiplier() {
    if (this.overT > 0) return CONFIG.POWERUP.overdrivePowerMul;
    return 1.0;
  }

  update(dt) {
    if (this.overT > 0) {
      this.overT -= dt;
      if (this.overT <= 0) {
        this.overT = 0;
        this.overdrive = false;
        this.overEndSlowT = CONFIG.POWERUP.overdriveEndSlowDuration;
        this.world.audio.beep("triangle", 180, 0.08, 0.08);
      }
    }
    if (this.overEndSlowT > 0) {
      this.overEndSlowT -= dt;
      if (this.overEndSlowT < 0) this.overEndSlowT = 0;
    }
  }

  // damage on death: lose 1 speed level and 1 option
  onDeathPenalty() {
    this.speedLevel = Math.max(0, this.speedLevel - 1);
    this.optionCount = Math.max(0, this.optionCount - 1);
    this.shield = false;
    // keep weapon mode; modern fairness choice consistent with spec
  }
}

class Player extends Entity {
  constructor(world) {
    super();
    this.world = world;
    this.x = 130;
    this.y = CONFIG.H / 2;
    this.vx = 0;
    this.vy = 0;

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

    // option path buffer (for FOLLOW)
    this.path = [];
    this.pathMax = 3000;

    this.respawnPending = false;
  }

  canBeHit() {
    return this.invulnT <= 0 && !this.dead;
  }

  addScore(pts) {
    this.score += Math.floor(pts);
  }

  pushPath(dt) {
    this.path.push({ x: this.x, y: this.y, t: this.world.time });
    if (this.path.length > this.pathMax) this.path.shift();
  }

  getOptionPos(index, powerUp) {
    const form = powerUp.formation;
    if (form === 0) {
      // FOLLOW: delayed along path
      const delay = CONFIG.OPTION.followDelay * (index + 1);
      const targetT = this.world.time - delay;
      // find nearest in buffer
      for (let i = this.path.length - 1; i >= 0; i--) {
        if (this.path[i].t <= targetT) return { x: this.path[i].x, y: this.path[i].y };
      }
      return { x: this.x, y: this.y };
    }
    if (form === 1) {
      // SPREAD: fixed offsets up/down
      const k = index - (powerUp.optionCount - 1) / 2;
      return { x: this.x - 26 - index * 12, y: this.y + k * 42 };
    }
    // LINE: inline behind
    return { x: this.x - 34 - index * 26, y: this.y };
  }

  takeHit() {
    const pu = this.world.powerUp;
    const a = this.world.audio;

    if (this.invulnT > 0) return;

    if (pu.shield) {
      // break shield
      pu.shield = false;
      this.invulnT = CONFIG.PLAYER.invulnOnShieldBreak;
      this.shieldFlashT = 0.3;
      this.world.camera.shake(10, 0.2);
      a.noiseBurst(0.10, 0.20);
      a.beep("sawtooth", 160, 0.12, 0.12);
      for (let i = 0; i < 18; i++) {
        this.world.particles.push(new Particle(this.x + rand(-10, 10), this.y + rand(-10, 10), rand(-220, 220), rand(-220, 220), 0.35, "spark"));
      }
      return;
    }

    // die
    this.lives -= 1;
    this.world.powerUp.onDeathPenalty();
    this.invulnT = 999; // during death
    this.dead = true;

    a.duckBGM(0.35, 0.25);
    a.noiseBurst(0.12, 0.26);
    a.beep("sawtooth", 120, 0.18, 0.14);
    this.world.camera.shake(16, 0.28);

    for (let i = 0; i < 38; i++) {
      this.world.particles.push(new Particle(this.x + rand(-10, 10), this.y + rand(-10, 10), rand(-300, 300), rand(-300, 300), 0.6, i % 5 === 0 ? "big" : "spark"));
    }

    this.respawnPending = true;
  }

  respawn() {
    this.dead = false;
    this.respawnPending = false;
    this.x = 130;
    this.y = CONFIG.H / 2;
    this.vx = 0; this.vy = 0;
    this.invulnT = CONFIG.PLAYER.respawnIFrames;
    this.mult = 1;
    this.multT = 0;
  }

  update(dt, world) {
    // handle respawn
    if (this.respawnPending) {
      // wait a moment then respawn if lives remain
      this.invulnT -= dt;
      if (this.invulnT < 998.2 && this.lives >= 0) {
        this.respawn();
      } else if (this.lives < 0) {
        world.gameOver = true;
      }
      return;
    }

    // timers
    this.invulnT = Math.max(0, this.invulnT - dt);
    this.shieldFlashT = Math.max(0, this.shieldFlashT - dt);
    this._laserHitStopCooldown = Math.max(0, this._laserHitStopCooldown - dt);
    this.multT = Math.max(0, this.multT - dt);
    if (this.multT <= 0) this.mult = 1;

    const pu = world.powerUp;
    pu.update(dt);

    // movement
    const inp = world.input;
    const ix = (inp.down("ArrowRight") || inp.down("KeyD") ? 1 : 0) - (inp.down("ArrowLeft") || inp.down("KeyA") ? 1 : 0);
    const iy = (inp.down("ArrowDown") || inp.down("KeyS") ? 1 : 0) - (inp.down("ArrowUp") || inp.down("KeyW") ? 1 : 0);

    const spMul = pu.speedMultiplier();
    const base = CONFIG.PLAYER.baseSpeed;
    const maxSp = Math.min(CONFIG.PLAYER.maxSpeed, base * spMul);
    const ax = ix * CONFIG.PLAYER.accel;
    const ay = iy * CONFIG.PLAYER.accel;

    // accelerate
    this.vx += ax * dt;
    this.vy += ay * dt;

    // decel when no input
    if (ix === 0) this.vx = approach0(this.vx, CONFIG.PLAYER.decel * dt);
    if (iy === 0) this.vy = approach0(this.vy, CONFIG.PLAYER.decel * dt);

    // clamp speed (diagonal normalize)
    const vlen = Math.hypot(this.vx, this.vy);
    if (vlen > maxSp) {
      const s = maxSp / (vlen || 1);
      this.vx *= s; this.vy *= s;
    }

    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.x = clamp(this.x, 40, CONFIG.W - 40);
    this.y = clamp(this.y, 34, CONFIG.H - 34);

    // path buffer for options
    this.pushPath(dt);

    // powerup commit / formation
    if (inp.tap("KeyC") || inp.tap("Enter")) {
      pu.commit();
    }
    if (inp.tap("KeyV")) {
      pu.toggleFormation();
    }

    // firing
    const shotHeld = inp.down("KeyZ") || inp.down("Space");
    const misHeld = inp.down("KeyX");

    const dmgMul = pu.damageMultiplier();

    // laser vs bullets
    if (pu.laser) {
      this.laserOn = shotHeld;
      this.laserGrace = lerp(this.laserGrace, this.laserOn ? 1 : 0, 1 - Math.pow(0.0001, dt));
    } else {
      this.laserOn = false;
      this.laserGrace = 0;
    }

    if (!pu.laser) {
      // normal/double bullets
      if (shotHeld) {
        this.shotT -= dt;
        const rate = pu.double ? CONFIG.DOUBLE.rate : CONFIG.SHOT.rate;
        if (this.shotT <= 0) {
          this.shotT += 1 / rate;
          if (pu.double) {
            // forward shot
            world.spawnBullet(this.x + 18, this.y, CONFIG.DOUBLE.speed, 0, 3, CONFIG.DOUBLE.dmg * dmgMul, true, "round");
            // diagonal up shot
            const a = -Math.PI / 6;
            world.spawnBullet(this.x + 16, this.y, Math.cos(a) * CONFIG.DOUBLE.speed, Math.sin(a) * CONFIG.DOUBLE.speed, 3, CONFIG.DOUBLE.dmg * dmgMul, true, "needle");
          } else {
            world.spawnBullet(this.x + 18, this.y, CONFIG.SHOT.speed, 0, 3, CONFIG.SHOT.dmg * dmgMul, true, "round");
          }
          world.audio.beep("square", 520, 0.02, 0.03);
        }
      } else {
        this.shotT = 0;
      }
    } else {
      // laser: ticks handled below
      if (this.laserOn && Math.random() < dt * 10) world.particles.push(new Particle(this.x + 20, this.y + rand(-6, 6), rand(10, 60), rand(-30, 30), 0.12, "spark"));
    }

    // missiles
    if (pu.missile && misHeld) {
      this.missileT -= dt;
      if (this.missileT <= 0) {
        this.missileT += 1 / CONFIG.MISSILE.rate;
        // crawler-like: choose nearest wall direction (floor/ceiling)
        const toFloor = (CONFIG.H - 18) - this.y;
        const toCeil = this.y - 18;
        const dir = (toCeil < toFloor) ? -1 : 1;
        world.spawnMissile(this.x + 10, this.y + 10 * dir, dir, CONFIG.MISSILE.dmg * dmgMul);
        world.audio.beep("square", 280, 0.03, 0.04);
      }
    } else {
      this.missileT = 0;
    }

    // options firing
    if (pu.optionCount > 0 && shotHeld) {
      // options mirror current weapon
      // (laser: options also laser-ish but simplified: they fire bullets rapidly to avoid heavy line-laser math)
      const fireMul = (pu.overT > 0) ? 1.25 : 1.0;
      world.optionFireAcc += dt * fireMul;
      const step = pu.laser ? 1 / 18 : 1 / 12;
      while (world.optionFireAcc >= step) {
        world.optionFireAcc -= step;
        for (let i = 0; i < pu.optionCount; i++) {
          const op = this.getOptionPos(i, pu);
          if (pu.laser) {
            world.spawnBullet(op.x + 14, op.y, 720, 0, 2.5, 0.55 * dmgMul, true, "needle");
          } else if (pu.double) {
            world.spawnBullet(op.x + 14, op.y, 650, 0, 2.5, 0.65 * dmgMul, true, "round");
            const a = -Math.PI / 6;
            world.spawnBullet(op.x + 12, op.y, Math.cos(a) * 640, Math.sin(a) * 640, 2.5, 0.55 * dmgMul, true, "needle");
          } else {
            world.spawnBullet(op.x + 14, op.y, 680, 0, 2.5, 0.55 * dmgMul, true, "round");
          }
        }
        break; // keep it lighter (one burst per frame) — still feels good
      }
    } else {
      world.optionFireAcc = 0;
    }

    // LASER collision/damage ticks
    if (pu.laser && this.laserGrace > 0.02) {
      this._laserTickAcc += dt;
      const tick = 1 / CONFIG.LASER.tickRate;
      while (this._laserTickAcc >= tick) {
        this._laserTickAcc -= tick;
        this.applyLaserTick(dmgMul);
      }
    } else {
      this._laserTickAcc = 0;
    }
  }

  applyLaserTick(dmgMul) {
    const world = this.world;
    const pu = world.powerUp;
    const ramp = clamp(this.laserGrace / CONFIG.LASER.startGrace, 0, 1);
    const dps = CONFIG.LASER.dps * dmgMul * (0.35 + 0.65 * ramp);
    const dmg = dps / CONFIG.LASER.tickRate;

    // Laser is a horizontal ray from player to right
    const x0 = this.x + 18;
    const y0 = this.y;

    let hitSomething = false;
    // check enemies
    for (const e of world.enemies) {
      if (e.dead) continue;
      // quick reject: if enemy is behind laser start
      if (e.x + e.r < x0) continue;
      // distance from point to horizontal line segment (infinite segment here)
      const dy = Math.abs(e.y - y0);
      const within = dy <= (CONFIG.LASER.widthCore * 0.6 + e.r * 0.7);
      if (!within) continue;

      // hit!
      hitSomething = true;
      // boss needs hit point info for weakpoint logic
      if (e instanceof Boss) e.takeDamage(dmg, world, e.x - 40, y0);
      else e.takeDamage(dmg, world);

      // sparks along hit
      if (Math.random() < 0.25) {
        world.particles.push(new Particle(e.x - e.r + rand(-4, 4), y0 + rand(-6, 6), rand(-80, 80), rand(-40, 40), 0.16, "spark"));
      }
    }

    // micro hit-stop on initial contact (cooldown)
    if (hitSomething && this._laserHitStopCooldown <= 0) {
      this._laserHitStopCooldown = 0.18;
      world.hitStopMs = Math.max(world.hitStopMs, CONFIG.LASER.hitStopMs);
      world.audio.beep("triangle", 760, 0.02, 0.05);
    }
  }

  draw(g, world) {
    const pu = world.powerUp;
    const inv = (this.invulnT > 0);
    const blink = inv && (Math.floor(world.time * 18) % 2 === 0);

    // options
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

    if (this.dead) return;
    if (blink) return;

    g.save();
    g.translate(this.x, this.y);

    // shield ring
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

    // ship body
    g.shadowColor = "rgba(160,220,255,.35)";
    g.shadowBlur = 22;
    g.fillStyle = "rgba(160,220,255,.95)";
    g.beginPath();
    g.moveTo(22, 0);
    g.lineTo(-8, -12);
    g.lineTo(-14, 0);
    g.lineTo(-8, 12);
    g.closePath();
    g.fill();
    g.shadowBlur = 0;

    // cockpit
    g.fillStyle = "rgba(5,10,18,.75)";
    g.beginPath(); g.roundRect(-2, -5, 10, 10, 4); g.fill();

    // thruster
    const t = world.time;
    const flame = 10 + Math.sin(t * 22) * 2 + (Math.abs(this.vx) + Math.abs(this.vy)) * 0.01;
    g.fillStyle = "rgba(255,210,160,.9)";
    g.beginPath();
    g.moveTo(-16, 0);
    g.lineTo(-16 - flame, -4);
    g.lineTo(-16 - flame, 4);
    g.closePath();
    g.fill();

    g.restore();

    // laser draw (visual only)
    if (!this.dead && pu.laser && this.laserGrace > 0.02) {
      const x0 = this.x + 18;
      const y0 = this.y;
      const glowA = 0.20 + 0.55 * this.laserGrace;
      g.save();
      g.globalAlpha = glowA;
      g.strokeStyle = "rgba(120,230,255,1)";
      g.lineWidth = CONFIG.LASER.widthGlow;
      g.shadowColor = "rgba(120,230,255,.8)";
      g.shadowBlur = 22;
      g.beginPath();
      g.moveTo(x0, y0);
      g.lineTo(CONFIG.W + 200, y0);
      g.stroke();
      g.globalAlpha = 0.9 * this.laserGrace;
      g.shadowBlur = 0;
      g.strokeStyle = "rgba(190,250,255,1)";
      g.lineWidth = CONFIG.LASER.widthCore;
      g.beginPath();
      g.moveTo(x0, y0);
      g.lineTo(CONFIG.W + 200, y0);
      g.stroke();
      g.restore();
    }
  }
}

function approach0(v, dv) {
  if (Math.abs(v) <= dv) return 0;
  return v - sign(v) * dv;
}

class Stage1Timeline {
  constructor(world) {
    this.world = world;
    this.t = 0;
    this.events = [];
    this._build();
    this._next = 0;
  }
  _build() {
    // Orbital Wreckage: gentle ramps; teach missiles + gauge
    // times are in seconds since stage start
    const E = (time, fn) => this.events.push({ time, fn });
    const spawnWave = (time, count, y0, y1, sp = -80) => {
      E(time, () => {
        for (let i = 0; i < count; i++) {
          const y = lerp(y0, y1, (count === 1 ? 0.5 : i / (count - 1)));
          const e = new Enemy(CONFIG.W + 40 + i * 28, y, 10);
          e.vx = sp;
          e._shootT = rand(0.6, 1.5);
          this.world.enemies.push(e);
        }
      });
    };

    // Intro trickle
    spawnWave(1.5, 3, 140, 220, -90);
    spawnWave(3.7, 4, 320, 420, -95);
    spawnWave(6.2, 5, 120, 420, -85);

    // “teach capsule”: slightly higher drop by adding a few weak enemies
    E(9.0, () => {
      for (let i = 0; i < 6; i++) {
        const e = new Enemy(CONFIG.W + 60 + i * 36, 100 + i * 55, 6);
        e.vx = -105;
        e.score = 120;
        e._shootT = rand(1.2, 2.0);
        this.world.enemies.push(e);
      }
    });

    // Mid section (more geometry feel via background; enemy patterns)
    spawnWave(16.0, 5, 90, 450, -110);
    spawnWave(19.5, 3, 160, 220, -120);
    spawnWave(22.2, 3, 320, 380, -120);

    // Midboss warning
    E(28.0, () => {
      this.world.showBanner("WARNING", 1.2);
      this.world.audio.duckBGM(0.55, 0.25);
      this.world.audio.beep("sawtooth", 140, 0.18, 0.12);
    });
    E(30.0, () => {
      const m = new MidBoss(CONFIG.W + 120, CONFIG.H / 2);
      this.world.enemies.push(m);
    });

    // After midboss: breather then waves
    spawnWave(44.0, 5, 100, 440, -120);
    E(49.0, () => {
      // small "turret line"
      for (let i = 0; i < 5; i++) {
        const e = new Enemy(CONFIG.W + 60 + i * 48, 90 + (i % 2) * 320, 12);
        e.vx = -75;
        e._shootT = 0.6 + i * 0.25;
        e.score = 260;
        this.world.enemies.push(e);
      }
    });
    spawnWave(56.0, 6, 140, 420, -130);

    // Boss warning
    E(76.0, () => {
      this.world.showBanner("BOSS APPROACH", 1.3);
      this.world.audio.duckBGM(0.5, 0.35);
      this.world.audio.beep("sawtooth", 120, 0.22, 0.14);
      this.world.camera.shake(10, 0.25);
    });
    E(79.0, () => {
      const b = new Boss(CONFIG.W + 220, CONFIG.H / 2);
      this.world.enemies.push(b);
    });

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

    this.entities = [];
    this.bullets = [];
    this.enemies = [];
    this.particles = [];
    this.items = [];

    this.player = new Player(this);
    this.powerUp = new PowerUpSystem(this);

    this.timeline = new Stage1Timeline(this);

    this.optionFireAcc = 0;

    this.banner = null;

    this.paused = false;
    this.gameOver = false;
    this.stageClear = false;

    this.bgStars = Array.from({ length: 140 }, () => ({
      x: rand(0, CONFIG.W),
      y: rand(0, CONFIG.H),
      z: rand(0.2, 1.0),
    }));

    // score milestones for 1UP
    this.next1up = 100000;
    this.oneUpStep = 150000;
  }

  showBanner(text, dur = 1.2) {
    this.banner = { text, t: dur, max: dur };
  }

  spawnBullet(x, y, vx, vy, r, dmg, friendly, kind) {
    this.bullets.push(new Bullet(x, y, vx, vy, r, dmg, friendly, kind));
  }

  spawnMissile(x, y, dir, dmg) {
    // crawler: moves forward and drifts to wall then hugs
    const m = new Bullet(x, y, CONFIG.MISSILE.speed, 0, 4, dmg, true, "needle");
    m.kind = "missile";
    m.dir = dir;
    m.hug = false;
    m.update = (dt, world) => {
      m.x += m.vx * dt;
      // drift to wall until hugging
      if (!m.hug) {
        m.y += dir * 240 * dt;
        if (m.y < 18) { m.y = 18; m.hug = true; }
        if (m.y > CONFIG.H - 18) { m.y = CONFIG.H - 18; m.hug = true; }
      } else {
        // slight wave while hugging
        m.y += Math.sin(world.time * 10 + m.x * 0.02) * 8 * dt;
        m.y = clamp(m.y, 18, CONFIG.H - 18);
      }
      if (m.x > CONFIG.W + 80) m.dead = true;
    };
    m.draw = (g) => {
      g.save();
      g.translate(m.x, m.y);
      g.shadowColor = "rgba(160,230,255,.6)";
      g.shadowBlur = 14;
      g.fillStyle = "rgba(160,230,255,1)";
      g.beginPath();
      g.ellipse(0, 0, 8, 3.5, 0, 0, TAU);
      g.fill();
      g.restore();
    };
    this.bullets.push(m);
  }

  onEnemyKilled(e) {
    // score + mult system
    const base = e.score;
    const pts = base * this.player.mult;
    this.player.addScore(pts);

    // chain window 5 seconds
    this.player.multT = 5.0;
    this.player.mult = Math.min(4, this.player.mult + 1);

    // drop capsule chance (midboss/boss also can drop a couple)
    let chance = CONFIG.POWERUP.capsuleDropChance;
    if (e instanceof MidBoss) chance = 0.85;
    if (e instanceof Boss) chance = 0.0;

    if (Math.random() < chance) {
      this.items.push(new Capsule(e.x, e.y));
    }

    // explosions
    this.audio.noiseBurst(0.05, 0.12);
    this.camera.shake(4, 0.12);
    for (let i = 0; i < 10; i++) {
      this.particles.push(new Particle(e.x + rand(-10, 10), e.y + rand(-10, 10), rand(-120, 120), rand(-120, 120), 0.35, i % 4 === 0 ? "big" : "spark"));
    }

    // 1UP check
    if (this.player.score >= this.next1up) {
      this.player.lives += 1;
      this.next1up += this.oneUpStep;
      this.audio.beep("square", 980, 0.12, 0.12);
      this.showBanner("1UP", 0.9);
    }
  }

  onBossKilled(b) {
    this.player.addScore(40000);
    this.showBanner("STAGE CLEAR", 2.2);
    this.stageClear = true;
    this.audio.duckBGM(0.45, 0.35);
    this.audio.beep("sawtooth", 220, 0.22, 0.14);
    this.camera.shake(14, 0.3);
    for (let i = 0; i < 80; i++) {
      this.particles.push(new Particle(b.x + rand(-50, 50), b.y + rand(-50, 50), rand(-260, 260), rand(-260, 260), rand(0.4, 0.9), i % 6 === 0 ? "big" : "spark"));
    }
  }

  update(dt) {
    // pause toggle
    if (this.input.tap("Escape")) {
      this.paused = !this.paused;
      this.audio.beep("triangle", this.paused ? 180 : 360, 0.06, 0.06);
    }
    if (this.paused) {
      this.input.endFrame();
      return;
    }

    if (this.gameOver) {
      // restart
      if (this.input.tap("KeyR")) {
        location.reload();
      }
      this.input.endFrame();
      return;
    }

    // hit stop
    if (this.hitStopMs > 0) {
      const consume = Math.min(this.hitStopMs, dt * 1000);
      this.hitStopMs -= consume;
      // still update very small things (particles) for feel
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

    // background scroll
    this.scrollX += CONFIG.STAGE1.scrollSpeed * dt;

    // timeline (spawns)
    if (!this.stageClear) this.timeline.update(dt);

    this.camera.update(dt);

    // update player
    this.player.update(dt, this);

    // update bullets
    for (const b of this.bullets) b.update(dt, this);

    // update enemies
    for (const e of this.enemies) e.update(dt, this);

    // update items
    for (const it of this.items) it.update(dt, this);

    // collisions: bullets vs enemies / enemy bullets vs player
    this.handleCollisions();

    // update particles
    for (const p of this.particles) p.update(dt);
    this.particles = this.particles.filter(p => p.life > 0);

    // cleanup
    this.bullets = this.bullets.filter(b => !b.dead);
    this.enemies = this.enemies.filter(e => !e.dead);
    this.items = this.items.filter(i => !i.dead);

    // banner
    if (this.banner) {
      this.banner.t -= dt;
      if (this.banner.t <= 0) this.banner = null;
    }

    this.input.endFrame();
  }

  handleCollisions() {
    const p = this.player;
    if (!p.dead) {
      // enemy bullets hit player
      for (const b of this.bullets) {
        if (b.dead || b.friendly) continue;
        const dx = b.x - p.x;
        const dy = b.y - p.y;
        // elliptical hitbox
        const nx = dx / CONFIG.PLAYER.hitRadiusX;
        const ny = dy / CONFIG.PLAYER.hitRadiusY;
        if (nx * nx + ny * ny <= 1.0) {
          b.dead = true;
          p.takeHit();
          break;
        }
      }
      // player collides with enemies
      for (const e of this.enemies) {
        if (e.dead) continue;
        const dx = e.x - p.x;
        const dy = e.y - p.y;
        if (dx * dx + dy * dy <= (e.r + 12) * (e.r + 12)) {
          p.takeHit();
          break;
        }
      }
    }

    // friendly bullets hit enemies
    for (const b of this.bullets) {
      if (b.dead || !b.friendly) continue;
      for (const e of this.enemies) {
        if (e.dead) continue;
        const dx = e.x - b.x;
        const dy = e.y - b.y;
        const rr = (e.r + b.r);
        if (dx * dx + dy * dy <= rr * rr) {
          b.dead = true;
          if (e instanceof Boss) e.takeDamage(b.dmg, this, b.x, b.y);
          else e.takeDamage(b.dmg, this);
          break;
        }
      }
    }
  }

  draw() {
    const g = this.g;
    g.clearRect(0, 0, CONFIG.W, CONFIG.H);

    // background
    this.drawBackground(g);

    g.save();
    // camera shake
    this.camera.apply(g);

    // entities
    for (const it of this.items) it.draw(g, this);
    for (const b of this.bullets) b.draw(g, this);
    for (const e of this.enemies) e.draw(g, this);
    for (const p of this.particles) p.draw(g, this);

    this.player.draw(g, this);

    g.restore();

    // HUD / overlays
    this.drawHUD(g);

    if (this.paused) {
      this.drawOverlayText(g, "PAUSED", "Rでリロード / Escで復帰", 0.55);
    }
    if (this.gameOver) {
      this.drawOverlayText(g, "GAME OVER", "Rでリロード", 0.75);
    }
  }

  drawBackground(g) {
    // parallax stars
    g.save();
    g.fillStyle = "rgba(0,0,0,0)";
    for (const s of this.bgStars) {
      const sp = 20 + 120 * s.z;
      let x = s.x - (this.scrollX * (0.1 + 0.55 * s.z)) % (CONFIG.W + 40);
      if (x < -20) x += CONFIG.W + 40;
      const y = s.y;
      const r = 1 + 1.8 * s.z;
      g.globalAlpha = 0.25 + 0.55 * s.z;
      g.fillStyle = "rgba(210,240,255,1)";
      g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
    }
    g.restore();

    // subtle "wreckage lanes"
    g.save();
    const t = this.time;
    g.globalAlpha = 0.08;
    g.strokeStyle = "rgba(140,200,255,1)";
    g.lineWidth = 2;
    for (let i = 0; i < 6; i++) {
      const y = 60 + i * 80 + Math.sin(t * 0.4 + i) * 10;
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(CONFIG.W, y + Math.sin(t * 0.5 + i) * 18);
      g.stroke();
    }
    g.restore();
  }

  drawHUD(g) {
    const pu = this.powerUp;
    const p = this.player;

    // top-left lives
    g.save();
    g.globalAlpha = 0.9;
    g.fillStyle = "rgba(230,240,255,1)";
    g.font = "14px system-ui";
    g.fillText(`LIVES: ${Math.max(0, p.lives)}`, 14, 22);

    // score / mult
    g.fillText(`SCORE: ${p.score}`, 14, 44);
    g.fillText(`x${p.mult}`, 14, 66);

    // powerup gauge bottom
    const slots = CONFIG.POWERUP.gaugeSlots;
    const baseX = 180;
    const y = CONFIG.H - 26;
    const w = 84;
    const h = 18;
    const pad = 8;

    // label
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

    // current loadout right-top
    const rx = CONFIG.W - 260;
    g.globalAlpha = 0.9;
    g.fillText(`SPD:${pu.speedLevel}  OPT:${pu.optionCount}  SHD:${pu.shield ? "ON" : "--"}`, rx, 22);
    g.fillText(`WPN:${pu.laser ? "LASER" : (pu.double ? "DOUBLE" : "SHOT")}  MIS:${pu.missile ? "ON" : "--"}  OD:${pu.overT > 0 ? pu.overT.toFixed(1) : "--"}`, rx, 44);
    const f = ["FOLLOW", "SPREAD", "LINE"][pu.formation];
    g.fillText(`FORM:${f}`, rx, 66);

    // banner
    if (this.banner) {
      const t = clamp(this.banner.t / this.banner.max, 0, 1);
      const a = Math.sin(t * Math.PI); // ease in/out
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
  }
}

// Main loop with fixed update
const canvas = document.getElementById("game");
const world = new World(canvas);

let last = performance.now() / 1000;
let acc = 0;

function frame() {
  const now = performance.now() / 1000;
  let dt = now - last;
  last = now;
  dt = Math.min(CONFIG.MAX_FRAME_DT, dt);

  acc += dt;

  // fixed updates (120Hz)
  while (acc >= CONFIG.FIXED_DT) {
    world.update(CONFIG.FIXED_DT);
    acc -= CONFIG.FIXED_DT;
  }

  world.draw();
  requestAnimationFrame(frame);
}

world.showBanner("STAGE 1: ORBITAL WRECKAGE", 1.8);
requestAnimationFrame(frame);

