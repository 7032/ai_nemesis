export class Input {
  constructor() {
    this.keys = new Map();
    this.pressed = new Set();
    window.addEventListener("keydown", (e) => {
      if (!this.keys.get(e.code)) this.pressed.add(e.code);
      this.keys.set(e.code, true);
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) e.preventDefault();
    }, { passive: false });

    window.addEventListener("keyup", (e) => this.keys.set(e.code, false));
  }
  down(code) { return !!this.keys.get(code); }
  tap(code) { return this.pressed.has(code); }
  endFrame() { this.pressed.clear(); }
}
