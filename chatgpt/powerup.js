import { CONFIG } from "./config.js";

export class PowerUpSystem {
  constructor(w) {
    this.w = w;
    this.gauge = 0;
    this.speedLevel = 0;
    this.missileLevel = 0;
    this.doubleLevel = 0;
    this.laserLevel = 0;
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

    // 装備済みなら何もしない（ゲージも消費しない）
    if (slot === "MISSILE" && this.missileLevel >= 2) return;
    if (slot === "DOUBLE" && this.doubleLevel >= 2) return;
    if (slot === "LASER" && this.laserLevel >= 2) return;
    if (slot === "OPTION" && this.optionCount >= CONFIG.OPTION.max) return;

    const a = this.w.audio;

    switch (slot) {
      case "SPEED":
        if (this.speedLevel < 4) { this.speedLevel++; a.beep("square", 520, 0.06, 0.10); }
        else a.beep("triangle", 240, 0.05, 0.06);
        break;
      case "MISSILE":
        this.missileLevel = Math.min(2, this.missileLevel + 1);
        a.beep("square", 420, 0.06, 0.10);
        break;
      case "DOUBLE":
        this.doubleLevel = Math.min(2, this.doubleLevel + 1);
        this.laserLevel = 0;
        a.beep("square", 470, 0.06, 0.10);
        break;
      case "LASER":
        this.laserLevel = Math.min(2, this.laserLevel + 1);
        this.doubleLevel = 0;
        a.beep("square", 620, 0.06, 0.11);
        break;
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
    this.doubleLevel = Math.max(0, this.doubleLevel - 1);
    this.missileLevel = Math.max(0, this.missileLevel - 1);
    this.laserLevel = Math.max(0, this.laserLevel - 1);
    this.shield = false;
  }
}
