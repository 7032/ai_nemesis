export function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function rand(a = 0, b = 1) { return a + Math.random() * (b - a); }
export function sign(v) { return v < 0 ? -1 : 1; }
export function approach0(v, dv) { return Math.abs(v) <= dv ? 0 : v - sign(v) * dv; }
