import { CONFIG } from "./config.js";
import { World } from "./world.js";

const canvas = document.getElementById("game");
if (!canvas) {
  alert("canvas #game が見つかりませんでした。HTMLのIDを確認してね。");
  throw new Error("Missing canvas#game");
}

const world = new World(canvas);

let last = performance.now() / 1000;
let acc = 0;

function frame() {
  const now = performance.now() / 1000;
  let dt = now - last;
  last = now;
  dt = Math.min(CONFIG.MAX_FRAME_DT, dt);
  acc += dt;

  while (acc >= CONFIG.FIXED_DT) {
    world.update(CONFIG.FIXED_DT);
    acc -= CONFIG.FIXED_DT;
  }

  world.draw();
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
