export const CONFIG = {
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
    terrainMargin: 18,
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

  ENEMY: { bulletSpeed: 230 },

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
    patternScale: 0.60,
    restPad: 0.10,
  },

  TERRAIN: {
    bandAlpha: 0.18,
    lineAlpha: 0.25,
  },
};

export const TAU = Math.PI * 2;
