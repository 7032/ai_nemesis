export class AudioBus {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.bgmGain = null;
    this.seGain = null;
    this._armed = false;

    // Sequencer state
    this._nextNoteTime = 0;
    this._step = 0;
    this._isPlaying = false;
    this._timerID = null;
    this._currentSong = null; // { name, tempo, tracks: [], ... }
    this._sceneName = "none";

    // Warning state
    this._isWarning = false;
    this._warningTimer = 0;

    const arm = () => {
      if (this._armed) return;
      this._armed = true;

      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.8;

      this.bgmGain = this.ctx.createGain();
      this.bgmGain.gain.value = 0.45;

      this.seGain = this.ctx.createGain();
      this.seGain.gain.value = 0.55;

      this.bgmGain.connect(this.master);
      this.seGain.connect(this.master);
      this.master.connect(this.ctx.destination);

      this._prepareSongs();
    };

    window.addEventListener("pointerdown", arm, { once: true });
    window.addEventListener("keydown", arm, { once: true });
  }

  now() { return this.ctx ? this.ctx.currentTime : 0; }

  // ----------------------------------------------------------------
  // BGM Engine
  // ----------------------------------------------------------------
  _noteToFreq(note) {
    if (!note) return 0;
    if (note === 0) return 0; // rest
    return 440 * Math.pow(2, (note - 69) / 12);
  }

  _prepareSongs() {
    const N = {
      C2: 36, D2: 38, E2: 40, F2: 41, G2: 43, A2: 45, B2: 47,
      C3: 48, D3: 50, E3: 52, F3: 53, G3: 55, A3: 57, B3: 59,
      C4: 60, Cs4: 61, D4: 62, Ds4: 63, E4: 64, F4: 65, Fs4: 66, G4: 67, Gs4: 68, A4: 69, As4: 70, B4: 71,
      C5: 72, Cs5: 73, D5: 74, Ds5: 75, E5: 76, F5: 77, Fs5: 78, G5: 79, Gs5: 80, A5: 81, As5: 82, B5: 83,
      C6: 84, D6: 86, E6: 88
    };
    const R = 0;

    const mkSong = (name, tempo, mel, bass, drum) => ({
      name, tempo,
      tracks: [
        { type: "melody", notes: mel, inst: "sawtooth", vol: 0.12 },
        { type: "bass", notes: bass || [], inst: "triangle", vol: 0.18 },
        { type: "drum", notes: drum || [], inst: "noise", vol: 0.08 }
      ]
    });

    const rep = (arr, n) => Array(n).fill(arr).flat();
    const trans = (arr, diff) => arr.map(n => (n === 0 ? 0 : n + diff));

    // SPACE
    const sSp = mkSong("space", 90,
      [N.E4, R, N.B3, R, N.G3, R, N.E3, R],
      [N.E3, R, R, R, N.B2, R, R, R]
    );
    sSp.tracks[0].inst = "sine";

    // STAGE 1: Can-Can
    const mCanBase = [
      N.G4, N.G4, N.G4, N.G4, N.E4, N.F4, N.G4, N.A4, N.G4, N.E4, N.E4, R, N.G4, N.E4, N.E4, R,
      N.C5, R, N.C5, R, N.A4, N.B4, N.C5, N.A4, N.G4, R, N.G4, N.A4, N.G4, N.F4, N.E4, N.F4,
      N.G4, R, N.E4, R, N.C4, N.D4, N.E4, N.C4, N.D4, R, N.D4, N.E4, N.D4, N.C4, N.B4, N.C4
    ];
    // Extend: A -> A -> B?
    const mCan = [...mCanBase, ...mCanBase, ...trans(mCanBase, 5), ...mCanBase];
    const bCan = rep([N.C4, R, N.G3, R], 64);
    const dCan = rep([1, 0, 1, 0], 64);
    const sSt1 = mkSong("st1", 170, mCan, bCan, dCan);

    // STAGE 2: Eine Kleine
    const mEineA = [
      N.C5, R, N.G4, R, N.C5, R, N.G4, N.C5, N.G4, N.C5, N.G4, N.C5, N.E5, R, R, R,
      N.F4, R, N.D4, R, N.F4, R, N.D4, N.F4, N.D4, N.F4, N.D4, N.F4, N.G4, R, R, R
    ];
    const mEine = [...mEineA, ...trans(mEineA, 7), ...mEineA, ...trans(mEineA, -5)];
    const bEine = rep([N.C3, N.G3, N.C3, N.G3], 32);
    const sSt2 = mkSong("st2", 140, mEine, bEine, rep([1, 0], 128));

    // STAGE 3: Beethoven 5th
    const m5thA = [
      R, N.G4, N.G4, N.G4, N.Eb4, R, R, R, R, N.F4, N.F4, N.F4, N.D4, R, R, R
    ];
    const m5th = [...m5thA, ...trans(m5thA, 2), ...m5thA, ...trans(m5thA, 5)];
    const b5th = rep([N.C3, N.G2, N.C3, N.G2], 32);
    const sSt3 = mkSong("st3", 120, m5th, b5th, rep([1, 0, 0, 0], 64));
    sSt3.tracks[0].inst = "square";

    // STAGE 4: Blue Danube
    const mDanA = [
      N.C4, N.C4, N.E4, N.G4, N.G4, N.E5, N.E5, R, N.E5, N.E5, R,
      N.D5, N.D5, R, N.D5, N.D5, R
    ];
    const mDan = [...mDanA, ...trans(mDanA, 2), ...trans(mDanA, 4), ...mDanA];
    const bDan = rep([N.C3, R, R, N.G3, R, R], 32);
    const sSt4 = mkSong("st4", 160, mDan, bDan, []);

    // STAGE 5: Mountain King
    const mKingA = [
      N.B3, N.Cs4, N.D4, N.E4, N.Fs4, N.D4, N.Fs4, R, N.E4, N.C4, N.E4, R, N.D4, N.B3, N.D4, R
    ];
    const mKing = [...mKingA, ...trans(mKingA, 2), ...trans(mKingA, 4), ...trans(mKingA, 5), ...mKingA, ...trans(mKingA, 7)];
    const bKing = rep([N.B2, R, N.Fs3, R], 64);
    const sSt5 = mkSong("st5", 130, mKing, bKing, rep([1, 0, 0, 0], 128));
    sSt5.tracks[0].inst = "square";
    sSt5.tracks[1].inst = "sawtooth";

    // STAGE 6: William Tell
    const mTellA = [
      N.B4, N.B4, N.B4, N.B4, N.G4, N.A4, N.B4, N.Cs5,
      N.D5, N.D5, N.D5, N.D5, N.B4, N.G4, N.E4, N.D4
    ];
    const mTell = [...mTellA, ...mTellA, ...trans(mTellA, 5), ...mTellA];
    const bTell = rep([N.G3, R], 128);
    const sSt6 = mkSong("st6", 180, mTell, bTell, rep([1, 1, 0, 1], 64));

    // STAGE 7: Ode to Joy
    const mJoyA = [
      N.E4, N.E4, N.F4, N.G4, N.G4, N.F4, N.E4, N.D4,
      N.C4, N.C4, N.D4, N.E4, N.E4, N.D4, N.D4, R
    ];
    const mJoyB = [
      N.E4, N.E4, N.F4, N.G4, N.G4, N.F4, N.E4, N.D4,
      N.C4, N.C4, N.D4, N.E4, N.D4, N.C4, N.C4, R
    ];
    // A -> B -> A' -> B'
    const mJoy = [...mJoyA, ...mJoyB, ...trans(mJoyA, 2), ...trans(mJoyB, 2)];
    const bJoy = rep([N.C3, N.G3, N.C3, N.G3], 64);
    const sSt7 = mkSong("st7", 130, mJoy, bJoy, rep([1, 0, 1, 0], 128));

    // BOSS
    const mBossA = [
      N.E4, N.F4, N.G4, N.As4, R, N.E4, R, N.D4,
      N.C4, N.E4, R, N.D4, R, N.C4, N.B3, N.C4
    ];
    const mBoss = [...mBossA, ...trans(mBossA, 2), ...trans(mBossA, -2), ...mBossA];
    const bBoss = rep([N.C2, N.C2], 64);
    const sBoss = mkSong("boss", 180, mBoss, bBoss, rep([1, 1], 64));
    sBoss.tracks[0].inst = "sawtooth";
    sBoss.tracks[1].inst = "sawtooth";

    // Ending
    const mEnd = [
      ...rep([N.C5, N.G4, N.E4, N.C4], 2),
      ...rep([N.D5, N.B4, N.G4, N.D4], 2),
      N.C5, N.E5, N.G5, N.C6, N.B5, N.G5, N.D5, N.B4, N.C5, R, R, R
    ];
    const bEnd = rep([N.C3, R, N.G3, R], 8);
    const sEnding = mkSong("ending", 70, mEnd, bEnd, []);
    sEnding.tracks[0].inst = "triangle";
    sEnding.tracks[0].vol = 0.15;
    sEnding.tracks[1].vol = 0.10;

    this.songs = {
      space: sSp,
      st1: sSt1, st2: sSt2, st3: sSt3, st4: sSt4, st5: sSt5, st6: sSt6, st7: sSt7,
      boss: sBoss,
      ending: sEnding
    };
  }

  playBGM(nameOrIndex) {
    if (!this.ctx) return;

    // Resolve name
    let name = nameOrIndex;
    if (typeof nameOrIndex === "number") {
      name = `st${nameOrIndex}`;
    }
    // "surface" compatibility -> st1
    if (name === "surface") name = "st1";

    if (this._sceneName === name) return;
    this._sceneName = name;

    // Fade out
    const t = this.now();
    this.bgmGain.gain.cancelScheduledValues(t);
    this.bgmGain.gain.setValueAtTime(this.bgmGain.gain.value, t);
    this.bgmGain.gain.linearRampToValueAtTime(0, t + 0.5);

    if (name === "warning") {
      this._isPlaying = false;
      this._currentSong = null;
      this._isWarning = true;
      this._startWarningSiren(t + 0.5);
      return;
    }
    this._isWarning = false;

    const newSong = this.songs[name] || this.songs["st1"]; // fallback

    if (newSong) {
      setTimeout(() => {
        this._currentSong = newSong;
        this._step = 0;
        this._isPlaying = true;
        this._nextNoteTime = this.now() + 0.1;

        // Fade in
        const t2 = this.now();
        this.bgmGain.gain.cancelScheduledValues(t2);
        this.bgmGain.gain.setValueAtTime(0, t2);
        this.bgmGain.gain.linearRampToValueAtTime(0.45, t2 + 1.0);

        if (!this._timerID) this._scheduler();
      }, 600);
    } else {
      this._isPlaying = false;
      this._currentSong = null;
    }
  }

  _startWarningSiren(startTime) {
    // Red Alert Sound Loop
    const siren = () => {
      if (!this._isWarning) return;
      const t = this.now();
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();

      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(880, t);
      osc.frequency.linearRampToValueAtTime(440, t + 0.8);

      osc.connect(g);
      g.connect(this.seGain); // use SE bus for siren

      g.gain.setValueAtTime(0.15, t);
      g.gain.linearRampToValueAtTime(0.15, t + 0.8);
      g.gain.linearRampToValueAtTime(0, t + 0.9);

      osc.start(t);
      osc.stop(t + 1.0);

      setTimeout(siren, 1000);
    };
    setTimeout(siren, (startTime - this.now()) * 1000);
  }

  _scheduler() {
    this._timerID = requestAnimationFrame(() => this._scheduler());

    if (!this._isPlaying || !this._currentSong) return;

    while (this._nextNoteTime < this.ctx.currentTime + 0.2) {
      this._playStep(this._step);

      // Calculate 16th note duration
      // tempo = BPM (Beats Per Minute, quarter note)
      // 1 beat = 60/tempo
      // 16th = 1/4 beat = 15/tempo
      const secPer16th = 15.0 / this._currentSong.tempo;
      this._nextNoteTime += secPer16th;

      this._step++;
      // Loop check
      // Find longest track length
      let maxLen = 0;
      for (const tr of this._currentSong.tracks) maxLen = Math.max(maxLen, tr.notes.length);
      if (this._step >= maxLen) this._step = 0;
    }
  }

  _playStep(step) {
    if (!this.ctx) return;
    const t = this._nextNoteTime;
    const song = this._currentSong;

    for (const tr of song.tracks) {
      const idx = step % tr.notes.length;
      const note = tr.notes[idx];

      if (tr.type === "drum") {
        if (note !== undefined && note !== 0) this._playNoise(t, tr.vol);
      } else {
        if (note) this._playTone(t, note, tr.inst, 0.12, tr.vol);
      }
    }
  }

  _playTone(time, note, type, len, vol, sus = 0) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = type;
    osc.frequency.value = this._noteToFreq(note);

    osc.connect(gain);
    gain.connect(this.bgmGain);

    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(vol, time + 0.01);
    gain.gain.setValueAtTime(vol, time + len - 0.02);
    gain.gain.linearRampToValueAtTime(0, time + len + sus);

    osc.start(time);
    osc.stop(time + len + sus + 0.05);
  }

  _playNoise(time, vol) {
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.05, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    const src = this.ctx.createBufferSource();
    src.buffer = buf;

    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 1000;

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.bgmGain);

    gain.gain.setValueAtTime(vol, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);

    src.start(time);
  }

  // ----------------------------------------------------------------
  // SE
  // ----------------------------------------------------------------
  duckBGM(amount = 0.6, dur = 0.12) {
    // If warning, no need to duck
    if (this._isWarning) return;
    if (!this.ctx) return;
    const t = this.now();
    const g = this.bgmGain.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(0.45 * amount, t + 0.05);
    g.linearRampToValueAtTime(0.45, t + dur);
  }

  beep(type = "tri", freq = 440, dur = 0.08, gain = 0.2) {
    if (type === "noise") {
      this.noiseBurst(dur, gain);
      return;
    }
    if (!this.ctx) return;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.value = 0;
    o.connect(g);
    g.connect(this.seGain);
    const t = this.now();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  noiseBurst(dur = 0.08, gain = 0.18) {
    if (!this.ctx) return;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * 0.9;
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
    src.start(this.now());
  }
}
