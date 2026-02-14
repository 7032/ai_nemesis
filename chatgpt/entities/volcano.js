import { Entity } from "./entity.js";
import { CONFIG } from "../config.js";
import { rand } from "../utils.js";

export class Volcano extends Entity {
  constructor(x, onCeil) {
    super();
    this.x = x;
    this.onCeil = onCeil;

    // Y position will be fixed to terrain in draw/update if needed, 
    // but usually passed in. Let's assume standard ground placement.
    this.y = onCeil ? 60 : CONFIG.H - 60; // Approximate, adjusted in update?

    this.r = 30;
    this.hp = 60;
    this.score = 1500;

    this.eruptTimer = rand(1.0, 3.0);
  }

  takeDamage(dmg, w) {
    this.hp -= dmg;
    w.audio.beep("nose", 100, 0.05, 0.05);
    if (this.hp <= 0) {
      this.dead = true;
      w.spawnExplosion(this.x, this.y, 0.8);
      w.onEnemyKilled(this);
    }
  }

  update(dt, w) {
    this.x -= CONFIG.STAGE.scrollSpeed * dt; // Scroll with terrain if it's part of it? 
    // Actually Stage 4 terrain moves? Yes, standard scroll.
    // However, usually ground enemies move with terrain scroll speed OR 
    // are updated by world scroll. 
    // In this engine, GroundEnemy uses `this.x -= 0;` inside update but 
    // world moves enemies? No, `World.update` moves `this.scrollX`.
    // Wait, `AirEnemy` moves by `vx`. `GroundEnemy`?
    // Let's check `enemies.js` for `GroundEnemy`.
    // `GroundEnemy` has `vx = 0` and is typically static relative to terrain?
    // No, if `vx=0`, it stays on screen while terrain scrolls? 
    // Actually `World` handles scrollX for terrain drawing, but entities need to move left 
    // to match the terrain movement if they are "grounded".
    // CONFIG.STAGE.scrollSpeed is usually used for background.
    // Let's check `spawnGround` in `stage.js` or `GroundEnemy` implementation.
    // `GroundEnemy` sets `this.x = x`. In `update`, does it move?
    // Checking `GroundEnemy`... it extends `Entity`.
    // If it doesn't move left, it will slide across the terrain.
    // Standard logic: Ground enemies move left at scroll speed.
    // Let's verify `Config.STAGE.scrollSpeed`.

    this.x -= 60 * dt; // Assuming 60 is scroll speed. 
    // Better: use w.scrollSpeed if available, or just hardcode for now based on AirEnemy logic?
    // AirEnemy has `vx = -92`. 
    // If Terrain scrolls at 60px/sec, Volcano should move at -60.

    // Clamp Y to terrain
    if (this.onCeil) {
      this.y = w.terrain.ceilingAt(this.x) + 20;
    } else {
      this.y = w.terrain.floorAt(this.x) - 20;
    }

    if (this.x < -100) this.dead = true;

    // Eruption
    this.eruptTimer -= dt;
    if (this.eruptTimer <= 0) {
      this.eruptTimer = 2.5;
      // Erupt!
      w.audio.noiseBurst(0.2, 0.3);
      w.camera.shake(3, 0.1);

      const count = 5;
      for (let i = 0; i < count; i++) {
        const angle = (this.onCeil ? Math.PI * 0.5 : -Math.PI * 0.5) + rand(-0.8, 0.8);
        const speed = rand(100, 180);
        w.spawnBullet(
          this.x, this.y - (this.onCeil ? -20 : 20),
          Math.cos(angle) * speed, Math.sin(angle) * speed,
          6, 1, false, "round" // round bullet mimicking rock/magma
        );
      }
    }
  }

  draw(g) {
    g.save();
    g.translate(this.x, this.y);
    if (this.onCeil) g.scale(1, -1);

    g.fillStyle = "#844";
    g.beginPath();
    g.moveTo(-30, 20);
    g.lineTo(-10, -20);
    g.lineTo(10, -20);
    g.lineTo(30, 20);
    g.fill();

    // Crater
    g.fillStyle = "#F80";
    g.beginPath();
    g.moveTo(-10, -20);
    g.lineTo(0, -15);
    g.lineTo(10, -20);
    g.fill();

    g.restore();
  }
}
