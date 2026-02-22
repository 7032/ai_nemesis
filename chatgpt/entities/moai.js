import { Entity } from "./entity.js";
import { CONFIG } from "../config.js";
import { RingBullet } from "./ringbullet.js";
import { clamp } from "../utils.js";

export class Moai extends Entity {
  constructor(x, onCeil = false) {
    super();
    this.x = x;
    this.onCeil = onCeil;
    this.hp = 22;
    this.r = 28;

    // バースト射撃管理
    this.burstTimer = 2.0;
    this.burstCount = 0;
    this.burstInterval = 0.3;
    this.isFiring = false;
  }

  takeDamage(dmg, w) {
    this.hp -= dmg;
    if (this.hp <= 0) {
      this.dead = true;
      w.onEnemyKilled(this);
    }
  }

  update(dt, w) {
    this.x -= CONFIG.STAGE.scrollSpeed * dt;

    const ceil = w.terrain.ceilingAt(this.x);
    const floor = w.terrain.floorAt(this.x);

    if (this.onCeil) this.y = ceil + 32;
    else this.y = floor - 32;

    this.burstTimer -= dt;
    this.isFiring = false;

    // バースト開始判定
    if (this.burstTimer <= 0) {
      this.isFiring = true;
      this.burstTimer += this.burstInterval;
      this.burstCount++;

      const p = w.player;
      if (p) {
        const dx = p.x - this.x;
        const dy = p.y - this.y;
        const len = Math.hypot(dx, dy) || 1;
        const vx = (dx / len) * 200;
        const vy = (dy / len) * 200;

        // 口の位置から発射
        const mouthY = this.onCeil ? this.y + 10 : this.y - 10;
        w.spawnRingBullet(this.x - 20, mouthY, vx, vy);
        w.audio.beep("triangle", 220, 0.05, 0.05);
      }

      // 3連射したら次の休みへ
      if (this.burstCount >= 3) {
        this.burstCount = 0;
        this.burstTimer = 2.5; // 次のバーストまでの溜め
        this.isFiring = false; // 撃ち終わり
      }
    } else if (this.burstCount > 0) {
      // バースト中は口を開けている扱い
      this.isFiring = true;
    }

    if (this.x < -100) this.dead = true;
  }

  draw(g) {
    g.save();
    g.translate(this.x, this.y);
    // 天井配置なら上下反転
    if (this.onCeil) g.scale(1, -1);

    // モアイ色
    g.fillStyle = "rgba(130,120,110,1)";

    // 全体シルエット
    g.beginPath();
    g.moveTo(-15, -35); // 頭頂左
    g.lineTo(15, -35);  // 頭頂右
    g.lineTo(15, 35);   // 底右
    g.lineTo(-15, 35);  // 底左
    g.closePath();
    g.fill();

    // 陰影（右側を少し暗く）
    g.fillStyle = "rgba(0,0,0,0.15)";
    g.fillRect(0, -35, 15, 70);

    // 額 (Brow)
    g.fillStyle = "rgba(110,100,90,1)";
    g.beginPath();
    g.moveTo(-18, -20);
    g.quadraticCurveTo(0, -15, 18, -20);
    g.lineTo(18, -25);
    g.lineTo(-18, -25);
    g.fill();

    // 鼻 (Nose)
    g.fillStyle = "rgba(140,130,120,1)";
    g.beginPath();
    g.moveTo(0, -20);
    g.lineTo(12, 5);
    g.lineTo(0, 10);
    g.fill();
    // 鼻の影
    g.fillStyle = "rgba(80,70,60,0.5)";
    g.beginPath();
    g.moveTo(0, 10);
    g.lineTo(5, 12);
    g.lineTo(0, 12);
    g.fill();

    // 目 (Eyes) - 深い窪み
    g.fillStyle = "rgba(40,30,20,0.8)";
    g.fillRect(-12, -15, 6, 4); // 左目
    g.fillRect(4, -15, 7, 4);   // 右目

    // 口 (Mouth)
    if (this.isFiring) {
      // 口を開ける (O型)
      g.fillStyle = "rgba(255,100,100,0.6)"; // 内部発光感
      g.beginPath();
      g.ellipse(0, 20, 6, 8, 0, 0, Math.PI * 2);
      g.fill();
    } else {
      // 口を閉じる (一文字)
      g.fillStyle = "rgba(50,40,30,0.8)";
      g.fillRect(-8, 20, 16, 2);
    }

    g.restore();
  }
}
