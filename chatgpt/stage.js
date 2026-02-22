// chatgpt/stage.js
// StageTimeline: 各ステージの敵出現・ボス出現などの台本管理

import { CONFIG } from "./config.js";
import { lerp, clamp } from "./utils.js";

import { AirEnemy, GroundEnemy, Boss } from "./entities/enemies.js";
import { Capsule } from "./entities/capsule.js";
import { Moai } from "./entities/moai.js";
import { Tentacle } from "./entities/tentacle.js";
import { Volcano } from "./entities/volcano.js";

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
    // 編隊（Formation）ヘルパー
    // -----------------------------
    const spawnFormation = (time, count, yBase, isTop) => {
      // 編隊ID
      const fid = `form_${stageIndex}_${Math.floor(time * 10)}`;

      E(time, () => {
        w.formationStats = { id: fid, total: count, killed: 0 };

        for (let i = 0; i < count; i++) {
          // 塊感: 少し間隔を詰めて連なって出す
          const delay = i * 0.08;
          const offsetX = 80 + i * 28;
          const y = yBase;

          const e = new AirEnemy(CONFIG.W + offsetX, y, 1);
          e.vx = -200; // 速め
          e.formationId = fid;
          w.enemies.push(e);
        }
      });
    };

    // 編隊シーケンス
    // 「塊」の敵数 = 6 + stageIndex
    const enemyNum = 6 + stageIndex;
    // 「塊」が飛んでくる回数 = 上下3回ずつ計6回
    const waveCount = 6;
    const waveInterval = 2.5; // 塊が通り過ぎる時間を考慮
    let tCursor = 2.0;

    // 宇宙BGM開始
    E(0.1, () => w.audio.playBGM("space"));

    for (let i = 0; i < waveCount; i++) {
      const isTop = (i % 2 === 0);
      const y = isTop ? 100 : CONFIG.H - 100;
      spawnFormation(tCursor, enemyNum, y, isTop);
      tCursor += waveInterval;
    }

    // 地形開始タイミング
    const timeOffset = tCursor + 2.0;

    // 地形スクロール＆地上BGM開始
    E(0, () => {
      w.terrain.scrollX = 0;
      w.terrain.startScrollX = timeOffset * CONFIG.STAGE.scrollSpeed;
      w.terrain._cache.clear();
    });

    const spawnTentacle = (time, xOff, isCeil, len = 6) => {
      offsetSpawn(time, () => {
        const t = new Tentacle(CONFIG.W + xOff, 0, isCeil, len);
        w.enemies.push(t);
      });
    };

    E(timeOffset, () => {
      // ステージ固有BGM
      w.audio.playBGM(stageIndex);
      w.showBanner("ATMOSPHERE ENTRY", 1.5);
    });

    // ヘルパーのラップ（offset適用）
    const offsetSpawn = (time, fn) => E(time + timeOffset, fn);

    // ステージ中の編隊用ヘルパー
    const spawnFormationOffset = (time, count, yBase, isTop) => {
      // 内部で offsetSpawn 的な計算をする、または E() に time+timeOffset を渡す
      const absTime = time + timeOffset;
      const fid = `form_mid_${stageIndex}_${Math.floor(absTime * 10)}`;

      E(absTime, () => {
        w.formationStats = { id: fid, total: count, killed: 0 };
        for (let i = 0; i < count; i++) {
          const offsetX = 80 + i * 28;
          const y = yBase;
          const e = new AirEnemy(CONFIG.W + offsetX, y, 1);
          e.vx = -200;
          e.formationId = fid;
          w.enemies.push(e);
        }
      });
    };

    const spawnComplexFormation = (time, count, type = "normal", yBase) => {
      const fid = `form_cpx_${stageIndex}_${Math.floor(time * 10)}`;
      E(time + timeOffset, () => {
        w.formationStats = { id: fid, total: count, killed: 0 };
        // type: "return" | "wave" | "cross"
        if (type === "return") {
          // High speed, turn back
          for (let i = 0; i < count; i++) {
            const e = new AirEnemy(CONFIG.W + 50 + i * 40, yBase || 100);
            e.vx = -300; // Fast
            e.behavior = "return";
            e.formationId = fid;
            w.enemies.push(e);
          }
        } else if (type === "wave") {
          for (let i = 0; i < count; i++) {
            const e = new AirEnemy(CONFIG.W + i * 30, (yBase || 240) + Math.sin(i) * 50);
            e.vx = -150;
            e.pattern = 1; // Sine
            e.formationId = fid;
            w.enemies.push(e);
          }
        } else {
          // Normal fallback
          for (let i = 0; i < count; i++) {
            const e = new AirEnemy(CONFIG.W + i * 30, yBase);
            e.formationId = fid;
            w.enemies.push(e);
          }
        }
      });
    };

    const spawnVolcano = (time, onCeil) => {
      offsetSpawn(time, () => {
        w.enemies.push(new Volcano(CONFIG.W + 50, onCeil));
      });
    };

    const spawnAirWave = (time, count, y0, y1, vx = -92) => {
      offsetSpawn(time, () => {
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
      offsetSpawn(time, () => {
        for (const it of list) {
          const ge = new GroundEnemy(CONFIG.W + it.x, it.onCeil);
          w.enemies.push(ge);
        }
      });
    };

    const spawnMoai = (time, list) => {
      offsetSpawn(time, () => {
        for (const it of list) {
          const m = new Moai(CONFIG.W + it.x, it.onCeil);
          w.enemies.push(m);
        }
      });
    };

    const spawnCapsule = (time, xOff, y) => {
      offsetSpawn(time, () => {
        const ceil = w.terrain.ceilingAt(CONFIG.W + xOff);
        const floor = w.terrain.floorAt(CONFIG.W + xOff);
        const yy = clamp(y, ceil + 26, floor - 26);
        w.items.push(new Capsule(CONFIG.W + xOff, yy));
      });
    };

    const bossApproach = (time, label = "BOSS APPROACH") => {
      offsetSpawn(time, () => {
        w.showBanner(label, 2.0);
        w.audio.playBGM("warning");
      });
    };

    const spawnBoss = (time) => {
      offsetSpawn(time, () => {
        w.enemies.push(
          new Boss(CONFIG.W + 260, CONFIG.H / 2, stageIndex)
        );
        // Boss登場演出後に playBGM("boss") したいが、簡易的にここで呼ぶか、Bossクラス内で呼ぶ
        // ここでは少し遅延させて呼ぶ
        setTimeout(() => w.audio.playBGM("boss"), 2500);
      });
    };

    // =====================================================
    // STAGE 1
    // =====================================================
    // =====================================================
    // STAGE 1
    // =====================================================
    if (stageIndex === 1) {
      const duration = 30.0;
      const pattern = (tBase) => {
        spawnAirWave(tBase + 1.6, 2, 180, 240, -82);
        spawnAirWave(tBase + 4.6, 2, 320, 400, -86);
        spawnAirWave(tBase + 7.4, 3, 150, 420, -84);

        spawnCapsule(tBase + 6.2, 220, 240);
        spawnCapsule(tBase + 11.2, 260, 330);
        spawnCapsule(tBase + 16.2, 280, 200);

        spawnGround(tBase + 9.0, [
          { x: 120, onCeil: false },
          { x: 300, onCeil: false },
        ]);
        spawnGround(tBase + 13.2, [{ x: 220, onCeil: true }]);

        spawnFormationOffset(tBase + 16.0, 5, 140, true);

        spawnAirWave(tBase + 18.8, 3, 160, 420, -96);
        spawnGround(tBase + 21.0, [
          { x: 160, onCeil: false },
          { x: 360, onCeil: true },
        ]);

        spawnAirWave(tBase + 24.8, 2, 200, 280, -104);
        spawnAirWave(tBase + 27.6, 2, 300, 380, -104);
      };

      for (let i = 0; i < 3; i++) pattern(i * duration);

      const fin = duration * 3;
      spawnCapsule(fin + 1.0, 260, 250);
      bossApproach(fin + 4.0);
      spawnBoss(fin + 7.0);
    }

    // =====================================================
    // STAGE 2
    // =====================================================
    // =====================================================
    // STAGE 2
    // =================================0====================
    else if (stageIndex === 2) {
      const duration = 28.0;
      const pattern = (tBase) => {
        spawnAirWave(tBase + 1.2, 2, 190, 260, -84);
        spawnGround(tBase + 3.2, [{ x: 160, onCeil: false }]);
        spawnAirWave(tBase + 4.6, 3, 320, 430, -88);
        spawnGround(tBase + 6.0, [{ x: 220, onCeil: true }]);
        spawnCapsule(tBase + 4.0, 240, 230);
        spawnCapsule(tBase + 8.0, 260, 330);

        spawnFormationOffset(tBase + 9.0, 6, CONFIG.H - 120, false);

        spawnAirWave(tBase + 10.0, 2, 160, 220, -92);
        spawnGround(tBase + 11.6, [
          { x: 140, onCeil: false },
          { x: 280, onCeil: false },
        ]);
        spawnAirWave(tBase + 13.4, 2, 360, 420, -92);
        spawnGround(tBase + 15.0, [{ x: 220, onCeil: true }]);
        spawnAirWave(tBase + 17.5, 4, 150, 430, -98);
        spawnCapsule(tBase + 18.6, 260, 260);
        spawnGround(tBase + 20.4, [
          { x: 150, onCeil: false },
          { x: 300, onCeil: true },
        ]);
        spawnAirWave(tBase + 22.6, 3, 200, 360, -96);
        spawnCapsule(tBase + 24.2, 260, 300);
      };

      for (let i = 0; i < 3; i++) pattern(i * duration);

      const fin = duration * 3;
      spawnCapsule(fin + 1.0, 300, 230);
      bossApproach(fin + 4.0);
      spawnBoss(fin + 7.0);
    }

    // =====================================================
    // STAGE 3 — MOAI BASTION
    // =====================================================
    // =====================================================
    // STAGE 3 — MOAI BASTION
    // =====================================================
    else if (stageIndex === 3) {
      const duration = 25.0;
      const pattern = (tBase) => {
        spawnAirWave(tBase + 1.5, 2, 200, 300, -90);
        spawnCapsule(tBase + 3.5, 220, 260);
        spawnMoai(tBase + 4.0, [{ x: 120, onCeil: false }]);
        spawnMoai(tBase + 7.0, [{ x: 220, onCeil: true }]);
        spawnMoai(tBase + 10.0, [
          { x: 140, onCeil: false },
          { x: 320, onCeil: false },
        ]);
        spawnAirWave(tBase + 12.0, 3, 160, 420, -100);
        spawnMoai(tBase + 15.5, [
          { x: 180, onCeil: true },
          { x: 360, onCeil: false },
        ]);
        spawnAirWave(tBase + 18.5, 4, 180, 400, -105);
        spawnMoai(tBase + 21.0, [
          { x: 120, onCeil: false },
          { x: 260, onCeil: true },
        ]);
      };

      for (let i = 0; i < 3; i++) pattern(i * duration);

      const fin = duration * 3;
      spawnCapsule(fin + 1.0, 280, 240);
      bossApproach(fin + 4.0, "MOAI CORE ACTIVATED");
      spawnBoss(fin + 8.0);
    }

    // =====================================================
    // STAGE 4 — ABYSSAL CURRENT
    // =====================================================
    // =====================================================
    // STAGE 4 — MAGMA OCEAN (VOLCANO)
    // =====================================================
    else if (stageIndex === 4) {
      const duration = 21.0;
      const pattern = (tBase) => {
        spawnAirWave(tBase + 1.0, 3, 150, 200);
        spawnVolcano(tBase + 3.0, false);
        spawnVolcano(tBase + 5.0, true);
        spawnFormationOffset(tBase + 7.0, 8, 240, true);
        spawnVolcano(tBase + 9.0, false);
        spawnVolcano(tBase + 10.0, false);
        spawnCapsule(tBase + 11.0, 300, 200);
        spawnVolcano(tBase + 13.0, true);
        spawnVolcano(tBase + 15.0, false);
        spawnVolcano(tBase + 17.0, true);
        spawnVolcano(tBase + 18.0, false);
        spawnVolcano(tBase + 19.0, true);
      };

      for (let i = 0; i < 3; i++) pattern(i * duration);

      const fin = duration * 3;
      bossApproach(fin + 2.0, "MAGMA CORE DETECTED");
      spawnBoss(fin + 6.0);
    }

    // =====================================================
    // STAGE 5 — BIO CAVERN (TENTACLES)
    // =====================================================
    // =====================================================
    // STAGE 5 — BIO CAVERN (TENTACLES)
    // =====================================================
    else if (stageIndex === 5) {
      const duration = 22.0;
      const pattern = (tBase) => {
        spawnAirWave(tBase + 1.5, 3, 180, 380, -100);
        spawnCapsule(tBase + 3.5, 220, 240);
        spawnTentacle(tBase + 4.0, 100, true, 12);
        spawnTentacle(tBase + 6.0, 200, false, 12);
        spawnTentacle(tBase + 8.0, 150, true, 14);
        spawnFormationOffset(tBase + 10.0, 6, 240, true);
        spawnTentacle(tBase + 12.0, 100, false, 12);
        spawnTentacle(tBase + 14.0, 180, true, 16);
        spawnAirWave(tBase + 16.0, 4, 160, 420, -110);
        spawnCapsule(tBase + 17.0, 260, 280);
        spawnTentacle(tBase + 18.5, 120, false, 14);
        spawnTentacle(tBase + 20.0, 220, true, 14);
      };

      for (let i = 0; i < 3; i++) pattern(i * duration);

      const fin = duration * 3;
      bossApproach(fin + 2.0, "BIO CORE ALERT");
      spawnBoss(fin + 6.0);
    }

    // =====================================================
    // STAGE 6 — CORE RAIL
    // =====================================================
    // =====================================================
    // STAGE 6 — CORE RAIL
    // =====================================================
    else if (stageIndex === 6) {
      spawnAirWave(2.0, 4, 150, 430, -115);
      spawnCapsule(4.5, 260, 260);

      // Mini-Boss (Weak) - Before ground section
      offsetSpawn(5.5, () => {
        const b = new Boss(CONFIG.W + 200, CONFIG.H / 2, 6);
        b.hp *= 1.5; // Mid-boss
        b._maxHp = b.hp;
        w.enemies.push(b);
      });

      // Delayed Ground section
      spawnGround(15.0, [
        { x: 140, onCeil: false },
        { x: 260, onCeil: true },
        { x: 380, onCeil: false },
      ]);

      // Cleanup Mini-Boss (Self-destruct) if still alive
      offsetSpawn(21.0, () => {
        w.enemies.forEach(e => {
          if (e.isBoss && !e.dead) {
            e.hp = 0;
            e.dead = true;
            w.spawnExplosion(e.x, e.y, 0.8);
            w.onBossKilled(e);
          }
        });
      });

      // Delayed Main Boss (x3 HP, radial barrage every 3s)
      bossApproach(22.0, "CORE RAIL AI");
      offsetSpawn(25.5, () => {
        const b = new Boss(CONFIG.W + 260, CONFIG.H / 2, 6);
        b.hp *= 2;
        b._maxHp = b.hp;
        b.radialTimer = 0;
        b.radialInterval = 3.0;
        w.enemies.push(b);
        setTimeout(() => w.audio.playBGM("boss"), 2500);
      });
    }

    // =====================================================
    // STAGE 7 — SINGULARITY GATE
    // =====================================================
    else if (stageIndex === 7) {
      const duration = 20.0;
      const pattern = (tBase) => {
        // Air waves & Formations
        spawnAirWave(tBase + 1.0, 6, 100, 400);
        spawnComplexFormation(tBase + 2.0, 8, "return", 150);

        // Ground Assault (Volcano + Tentacle)
        spawnVolcano(tBase + 3.0, false);
        spawnVolcano(tBase + 3.5, true);

        spawnTentacle(tBase + 5.0, 120, false, 12);
        spawnTentacle(tBase + 6.0, 200, true, 12);

        // High density wave
        spawnComplexFormation(tBase + 7.5, 10, "wave", 300);

        // Moai from Stage 3
        spawnMoai(tBase + 9.0, [{ x: 100, onCeil: false }, { x: 250, onCeil: true }]);

        spawnCapsule(tBase + 10.0, 250, 250);

        // Combined Assault
        spawnVolcano(tBase + 11.5, false);
        spawnTentacle(tBase + 12.0, 100, true, 14);
        spawnAirWave(tBase + 13.0, 8, 50, 450, -130);

        spawnComplexFormation(tBase + 15.0, 12, "return", 250);
        spawnMoai(tBase + 17.0, [{ x: 150, onCeil: false }]);
      };

      // Loop 3 times
      for (let i = 0; i < 3; i++) pattern(i * duration);

      const fin = duration * 3;

      bossApproach(fin + 2.0, "SINGULARITY CORE");
      // Triple Boss — circling formation (120° apart)
      offsetSpawn(fin + 6.0, () => {
        for (let i = 0; i < 3; i++) {
          const b = new Boss(CONFIG.W + 150, CONFIG.H / 2, 7);
          b.movePhase = (i / 3) * Math.PI * 2; // 0°, 120°, 240°
          w.enemies.push(b);
        }
      });
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
