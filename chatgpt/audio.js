export class AudioBus {
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
