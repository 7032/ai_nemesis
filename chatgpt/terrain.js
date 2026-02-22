import { CONFIG } from "./config.js";
import { clamp, lerp, rand } from "./utils.js";

export class Terrain {
  constructor(stageIndex) {
    this.stageIndex = stageIndex;
    this.seed = Math.floor(rand(1, 999999));
    this.scrollX = 0;
    this._cache = new Map();
    this.theme = this._makeTheme(stageIndex);

    // 動的地形制御: ampMul で振幅をスケール (1.0=通常, 0=平坦, 2.0=激しい)
    this.ampMul = 1.0;
    this._ampTarget = 1.0;
    this._ampSpeed = 1.5; // 秒あたりの変化速度
  }

  _makeTheme(stageIndex) {
    if (stageIndex === 1) {
      return {
        topBase: 18, bottomBase: CONFIG.H - 18,
        topAmp: 8, bottomAmp: 10,
        topFreq: 0.008, bottomFreq: 0.006,
        gapMin: 360, wobble: 0.0
      };
    }
    if (stageIndex === 2 || stageIndex === 4) {
      return {
        topBase: 50, bottomBase: CONFIG.H - 50,
        topAmp: 92, bottomAmp: 116,
        topFreq: 0.010, bottomFreq: 0.012,
        gapMin: 240, wobble: 0.45
      };
    }
    return {
      topBase: 50, bottomBase: CONFIG.H - 50,
      topAmp: 46, bottomAmp: 58,
      topFreq: 0.010, bottomFreq: 0.012,
      gapMin: 240, wobble: 0.45
    };
  }

  setStage(stageIndex) {
    this.stageIndex = stageIndex;
    this._cache.clear();
    this.seed = Math.floor(rand(1, 999999));
    this.theme = this._makeTheme(stageIndex);
    this.ampMul = 1.0;
    this._ampTarget = 1.0;
  }

  // 地形振幅を動的に変更 (0=平坦, 1=通常, 2=激しい)
  setAmplitude(target, speed = 1.5) {
    this._ampTarget = target;
    this._ampSpeed = speed;
  }

  updateScroll(scrollX, dt) {
    this.scrollX = scrollX;
    if (this._cache.size > 1400) this._cache.clear();

    // ampMulをターゲットに向けてスムーズに変化
    if (dt && this.ampMul !== this._ampTarget) {
      const diff = this._ampTarget - this.ampMul;
      const step = this._ampSpeed * (dt || 1/60);
      if (Math.abs(diff) < step) {
        this.ampMul = this._ampTarget;
      } else {
        this.ampMul += Math.sign(diff) * step;
      }
      this._cache.clear(); // 地形が変化中はキャッシュクリア
    }
  }

  _hash(n) {
    let x = (n ^ this.seed) | 0;
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    return (x >>> 0) / 4294967295;
  }

  _smoothstep(t) { return t * t * (3 - 2 * t); }

  _noise1D(x) {
    const xi = Math.floor(x);
    const xf = x - xi;
    const a = this._hash(xi);
    const b = this._hash(xi + 1);
    return lerp(a, b, this._smoothstep(xf));
  }

  _profileAt(worldX) {
    const key = (worldX * 0.5) | 0;
    const cached = this._cache.get(key);
    if (cached) return cached;

    // 開始地点より前は地形なし
    if (worldX < this.startScrollX) {
      const out = { top: -100, bot: CONFIG.H + 100 };
      this._cache.set(key, out);
      return out;
    }

    const t = this.theme;
    // ampMul で振幅をスケール (0=平坦, 1=通常, 2=激しい)
    const am = this.ampMul;
    let topAmp = t.topAmp * am;
    let bottomAmp = t.bottomAmp * am;
    let wobble = t.wobble * Math.min(am, 1.0); // 平坦時はノイズも減衰

    const nTop = this._noise1D(worldX * 0.02) * 2 - 1;
    const nBot = this._noise1D((worldX + 999) * 0.02) * 2 - 1;

    // Stage 3, 7: 矩形波 (sign of sin)。それ以外: 正弦波
    const useSquare = (this.stageIndex === 3 || this.stageIndex === 7);
    const waveTop = useSquare
      ? Math.sign(Math.sin(worldX * t.topFreq + 0.6))
      : Math.sin(worldX * t.topFreq + 0.6);
    const waveBot = useSquare
      ? Math.sign(Math.sin(worldX * t.bottomFreq + 2.1))
      : Math.sin(worldX * t.bottomFreq + 2.1);

    let top = t.topBase
      + waveTop * topAmp
      + nTop * topAmp * wobble;

    let bot = t.bottomBase
      + waveBot * bottomAmp
      + nBot * bottomAmp * wobble;

    const minGap = t.gapMin;
    if (bot - top < minGap) {
      const mid = (bot + top) * 0.5;
      top = mid - minGap * 0.5;
      bot = mid + minGap * 0.5;
    }

    top = clamp(top, 8, CONFIG.H - 120);
    bot = clamp(bot, 120, CONFIG.H - 8);

    const out = { top, bot };
    this._cache.set(key, out);
    return out;
  }

  ceilingAt(screenX) {
    const worldX = this.scrollX + screenX;
    return this._profileAt(worldX).top;
  }

  floorAt(screenX) {
    const worldX = this.scrollX + screenX;
    return this._profileAt(worldX).bot;
  }

  draw(g, stageIndex, time) {
    const tint = (stageIndex === 2)
      ? { fill: "rgba(170,140,255,1)", line: "rgba(200,180,255,1)", glow: "rgba(170,140,255,.45)" }
      : { fill: "rgba(120,230,255,1)", line: "rgba(170,250,255,1)", glow: "rgba(120,230,255,.45)" };

    g.save();
    g.globalAlpha = CONFIG.TERRAIN.bandAlpha;

    g.fillStyle = tint.fill;

    // top fill
    g.beginPath();
    g.moveTo(0, 0);
    // 描画開始位置調整（画面内かつstartScrollX以降）
    const startX = Math.max(0, this.startScrollX - this.scrollX);
    for (let x = startX; x <= CONFIG.W; x += 8) {
      const y = this.ceilingAt(x) + Math.sin(time * 0.6 + x * 0.01) * 1.2;
      if (x === startX) g.moveTo(x, 0); // 始点移動
      g.lineTo(x, y);
    }
    g.lineTo(CONFIG.W, 0);
    g.closePath();
    g.fill();

    // bottom fill
    g.beginPath();
    g.moveTo(0, CONFIG.H);
    for (let x = startX; x <= CONFIG.W; x += 8) {
      const y = this.floorAt(x) + Math.sin(time * 0.6 + x * 0.01 + 1.2) * 1.2;
      if (x === startX) g.moveTo(x, CONFIG.H);
      g.lineTo(x, y);
    }
    g.lineTo(CONFIG.W, CONFIG.H);
    g.closePath();
    g.fill();

    // lines
    g.globalAlpha = CONFIG.TERRAIN.lineAlpha;
    g.strokeStyle = tint.line;
    g.lineWidth = 2;

    g.beginPath();
    g.beginPath();
    for (let x = startX; x <= CONFIG.W; x += 6) {
      const y = this.ceilingAt(x);
      if (x === startX) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.stroke();

    g.beginPath();
    for (let x = startX; x <= CONFIG.W; x += 6) {
      const y = this.floorAt(x);
      if (x === startX) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.stroke();

    if (stageIndex === 2) {
      g.globalAlpha = 0.08;
      g.strokeStyle = tint.glow;
      g.lineWidth = 10;

      g.beginPath();
      for (let x = startX; x <= CONFIG.W; x += 8) {
        const y = this.ceilingAt(x) + 12;
        if (x === startX) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.stroke();

      g.beginPath();
      for (let x = startX; x <= CONFIG.W; x += 8) {
        const y = this.floorAt(x) - 12;
        if (x === startX) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.stroke();
    }

    g.restore();
  }
}
