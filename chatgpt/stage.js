// chatgpt/stage.js
// StageTimeline: 各ステージの敵出現・ボス出現などの台本管理

import { CONFIG } from "./config.js";
import { lerp, clamp } from "./utils.js";

import { AirEnemy, GroundEnemy, Boss } from "./entities/enemies.js";
import { Capsule } from "./entities/capsule.js";
import { Moai } from "./entities/moai.js";

export class StageTimeline {
  constructor(w, stageIndex) {
    this.w = w;
    this.stageIndex = stageIndex;
    this.t = 0;
    this.events = [];
    this._next = 0;
    this.build(stageIndex);
  }

  add(time, fn) {
    this.events.push({ time, fn });
  }

  build(stageIndex) {
    this.events = [];
    this._next = 0;
    this.t = 0;

    const w = this.w;
    const E = (time, fn) => this.add(time, fn);

    // -----------------------------
    // 共通ヘルパー
    // -----------------------------

    const spawnAirWave = (time, count, y0, y1, vx = -92) => {
      E(time, () => {
        for (let i = 0; i < count; i++) {
          const y =
            count === 1
              ? (y0 + y1) * 0.5
              : lerp(y0, y1, i / (count - 1));
          const e = new AirEnemy(CONFIG.W + 80 + i * 34, y, 1);
          e.vx = vx;
          w.enemies.push(e);
        }
      });
    };

    const spawnGround = (time, list) => {
      E(time, () => {
        for (const it of list) {
          const ge = new GroundEnemy(CONFIG.W + it.x, it.onCeil);
          w.enemies.push(ge);
        }
      });
    };

    const spawnMoai = (time, list) => {
      E(time, () => {
        for (const it of list) {
          const m = new Moai(CONFIG.W + it.x, it.onCeil);
          w.enemies.push(m);
        }
      });
    };

    const spawnCapsule = (time, xOff, y) => {
      E(time, () => {
        const ceil = w.terrain.ceilingAt(CONFIG.W + xOff);
        const floor = w.terrain.floorAt(CONFIG.W + xOff);
        const yy = clamp(y, ceil + 26, floor - 26);
        w.items.push(new Capsule(CONFIG.W + xOff, yy));
      });
    };

    const bossApproach = (time, label = "BOSS APPROACH") => {
      E(time, () => {
        w.showBanner(label, 1.4);
        w.audio.duckBGM(0.55, 0.30);
        w.audio.beep("sawtooth", 130, 0.20, 0.14);
        w.camera.shake(8, 0.22);
      });
    };

    const spawnBoss = (time) => {
      E(time, () => {
        w.enemies.push(
          new Boss(CONFIG.W + 260, CONFIG.H / 2, stageIndex)
        );
      });
    };

    // =====================================================
    // STAGE 1
    // =====================================================
    if (stageIndex === 1) {
      spawnAirWave(1.6, 2, 180, 240, -82);
      spawnAirWave(4.6, 2, 320, 400, -86);
      spawnAirWave(7.4, 3, 150, 420, -84);

      spawnCapsule(6.2, 220, 240);
      spawnCapsule(11.2, 260, 330);
      spawnCapsule(16.2, 280, 200);

      spawnGround(9.0, [
        { x: 120, onCeil: false },
        { x: 300, onCeil: false },
      ]);

      spawnGround(13.2, [{ x: 220, onCeil: true }]);

      spawnAirWave(18.8, 3, 160, 420, -96);
      spawnGround(21.0, [
        { x: 160, onCeil: false },
        { x: 360, onCeil: true },
      ]);

      spawnAirWave(24.8, 2, 200, 280, -104);
      spawnAirWave(27.6, 2, 300, 380, -104);

      spawnCapsule(29.5, 260, 250);
      spawnCapsule(32.0, 290, 320);

      bossApproach(35.0);
      spawnBoss(38.0);
    }

    // =====================================================
    // STAGE 2
    // =====================================================
    else if (stageIndex === 2) {
      spawnAirWave(1.2, 2, 190, 260, -84);
      spawnGround(3.2, [{ x: 160, onCeil: false }]);
      spawnAirWave(4.6, 3, 320, 430, -88);
      spawnGround(6.0, [{ x: 220, onCeil: true }]);

      spawnCapsule(4.0, 240, 230);
      spawnCapsule(8.0, 260, 330);

      spawnAirWave(10.0, 2, 160, 220, -92);
      spawnGround(11.6, [
        { x: 140, onCeil: false },
        { x: 280, onCeil: false },
      ]);

      spawnAirWave(13.4, 2, 360, 420, -92);
      spawnGround(15.0, [{ x: 220, onCeil: true }]);

      spawnAirWave(17.5, 4, 150, 430, -98);
      spawnCapsule(18.6, 260, 260);

      spawnGround(20.4, [
        { x: 150, onCeil: false },
        { x: 300, onCeil: true },
      ]);

      spawnAirWave(22.6, 3, 200, 360, -96);

      spawnCapsule(24.2, 260, 300);
      spawnCapsule(26.0, 300, 230);

      bossApproach(28.0);
      spawnBoss(31.0);
    }

    // =====================================================
    // STAGE 3 — MOAI BASTION
    // =====================================================
    else if (stageIndex === 3) {
      // 序盤：軽い空中敵
      spawnAirWave(1.5, 2, 200, 300, -90);
      spawnCapsule(3.5, 220, 260);

      // モアイ配置
      spawnMoai(4.0, [{ x: 120, onCeil: false }]);
      spawnMoai(7.0, [{ x: 220, onCeil: true }]);
      spawnMoai(10.0, [
        { x: 140, onCeil: false },
        { x: 320, onCeil: false },
      ]);

      spawnAirWave(12.0, 3, 160, 420, -100);
      spawnCapsule(14.0, 260, 300);

      spawnMoai(15.5, [
        { x: 180, onCeil: true },
        { x: 360, onCeil: false },
      ]);

      spawnAirWave(18.5, 4, 180, 400, -105);

      spawnMoai(21.0, [
        { x: 120, onCeil: false },
        { x: 260, onCeil: true },
      ]);

      spawnCapsule(23.0, 280, 240);

      bossApproach(26.0, "MOAI CORE ACTIVATED");
      spawnBoss(30.0);
    }

    // =====================================================
    // STAGE 4 — ABYSSAL CURRENT
    // =====================================================
    else if (stageIndex === 4) {
      spawnAirWave(2.0, 3, 160, 420, -95);
      spawnCapsule(4.5, 240, 280);

      spawnGround(6.0, [
        { x: 200, onCeil: false },
        { x: 340, onCeil: true },
      ]);

      spawnAirWave(8.5, 4, 150, 420, -105);

      spawnCapsule(11.0, 260, 300);

      spawnGround(13.0, [
        { x: 150, onCeil: false },
        { x: 280, onCeil: false },
        { x: 360, onCeil: true },
      ]);

      spawnAirWave(16.0, 5, 140, 420, -110);

      bossApproach(20.0, "DEEP CORE SIGNAL");
      spawnBoss(24.0);
    }

    // =====================================================
    // STAGE 5 — SOLAR RUINS
    // =====================================================
    else if (stageIndex === 5) {
      spawnAirWave(1.5, 3, 180, 380, -100);
      spawnCapsule(3.5, 220, 240);

      spawnGround(5.0, [
        { x: 180, onCeil: false },
        { x: 300, onCeil: true },
      ]);

      spawnAirWave(7.5, 4, 160, 420, -110);
      spawnCapsule(9.5, 260, 280);

      spawnGround(11.5, [
        { x: 200, onCeil: false },
        { x: 360, onCeil: false },
      ]);

      spawnAirWave(14.0, 5, 140, 430, -115);

      bossApproach(18.0, "SOLAR CORE OVERHEAT");
      spawnBoss(22.0);
    }

    // =====================================================
    // STAGE 6 — CORE RAIL
    // =====================================================
    else if (stageIndex === 6) {
      spawnAirWave(2.0, 4, 150, 430, -115);
      spawnCapsule(4.5, 260, 260);

      spawnGround(6.0, [
        { x: 140, onCeil: false },
        { x: 260, onCeil: true },
        { x: 380, onCeil: false },
      ]);

      spawnAirWave(9.0, 6, 130, 440, -125);
      spawnCapsule(12.0, 300, 240);

      spawnGround(13.5, [
        { x: 200, onCeil: false },
        { x: 340, onCeil: true },
      ]);

      spawnAirWave(16.5, 6, 120, 450, -130);

      bossApproach(20.0, "CORE RAIL AI");
      spawnBoss(24.0);
    }

    // =====================================================
    // STAGE 7 — SINGULARITY GATE
    // =====================================================
    else if (stageIndex === 7) {
      spawnAirWave(2.0, 5, 150, 430, -120);
      spawnCapsule(4.0, 260, 260);

      spawnGround(6.0, [
        { x: 160, onCeil: false },
        { x: 320, onCeil: true },
      ]);

      spawnAirWave(8.5, 6, 120, 450, -135);
      spawnCapsule(11.0, 300, 280);

      spawnGround(13.5, [
        { x: 180, onCeil: false },
        { x: 360, onCeil: false },
      ]);

      spawnAirWave(16.5, 7, 110, 460, -140);

      bossApproach(20.0, "SINGULARITY CORE");
      spawnBoss(24.0);
    }

    this.events.sort((a, b) => a.time - b.time);
  }

  update(dt) {
    this.t += dt;

    while (
      this._next < this.events.length &&
      this.t >= this.events[this._next].time
    ) {
      this.events[this._next].fn();
      this._next++;
    }
  }
}
