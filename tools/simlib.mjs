// Shared headless-sim core: the real game files driven in a vm context
// with stubbed browser APIs, a synthetic clock, and no rendering.
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import vm from "vm";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const noop = () => {};

export function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export function createSim({ seed = 1337, storage = null, fresh = true, screenH = 0 } = {}) {
  const ctxStub = new Proxy({}, {
    get: (t, k) => {
      if (k === "createImageData") return (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h });
      if (k === "canvas") return { width: 0, height: 0 };
      return noop;
    },
    set: () => true,
  });
  // EVERY LISTENER THE GAME REGISTERS IS KEPT, so a scenario can drive the real
  // tap handlers instead of only the functions behind them. Before this the
  // stub was `addEventListener: noop` and NO tap path in game.js was testable
  // at all - a whole class of bug (a draw and its click handler disagreeing
  // about which row is which crab) was invisible to 245 scenarios.
  const taps = { click: [], pointerdown: [], pointerup: [], pointermove: [], keydown: [] };
  const listen = (t, fn) => { if (taps[t]) taps[t].push(fn); };
  // THE RECT IS DERIVED FROM THE CANVAS, not hardcoded, so evPos() scales 1:1.
  // It used to report 256x240 for a canvas whose `width` was 0, and game.js
  // computes a tap as (clientX - left) * (cv.width / rect.width) - so EVERY
  // simulated tap landed on (0, 0), which is off every card in the game. That
  // is why sim.tap() appeared to do nothing but close whatever was open.
  const mkCanvas = () => {
    const c = { width: 256, height: 240, getContext: () => ctxStub,
      addEventListener: listen };
    c.getBoundingClientRect = () => ({ left: 0, top: 0,
      width: c.width || 256, height: c.height || 240 });
    return c;
  };
  const store = storage || new Map();
  const seededMath = Object.create(Math);
  seededMath.random = mulberry32(seed);
  const sandbox = {
    document: { createElement: () => mkCanvas(), getElementById: () => mkCanvas(), addEventListener: listen, hidden: false },
    location: { search: fresh ? "?fresh" : "" },
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    },
    Audio: class { constructor() { this.loop = false; this.volume = 0; } play() { return { catch: noop }; } pause() {} addEventListener() {} },
    AudioContext: undefined, addEventListener: listen, console,
    Math: seededMath, JSON, rafCb: null, simNow: 0,
  };
  sandbox.window = sandbox;
  // PORTRAIT PHONES get a 256x288 canvas: index.html sets window.SCREEN_H
  // before ppu.js derives H. A scenario that has to prove a surface fits in
  // BOTH screen heights needs the same switch, so the sandbox honours it.
  // Left unset (the default) the sim is the classic 240 it has always been.
  if (screenH) sandbox.SCREEN_H = screenH;
  sandbox.requestAnimationFrame = (cb) => { sandbox.rafCb = cb; };
  sandbox.performance = { now: () => sandbox.simNow };
  const C = vm.createContext(sandbox);
  for (const f of ["font.js", "ppu.js", "sprites.js", "crabs.js", "game.js"]) {
    vm.runInContext(readFileSync(join(root, f), "utf8"), C, { filename: f });
  }
  const G = (expr) => vm.runInContext(expr, C);
  G(`soundOn = false; musicOn = false; screen = "play"; window._headless = true;
     window._stats = { tourServes: 0, crabServes: 0, tourRage: 0, crabRage: 0, bused: 0 };`);
  const stepScript = (stepMs) => new vm.Script(`simNow += ${stepMs}; rafCb(simNow);`);
  return {
    C, G, sandbox, store,
    // run until a predicate (a G-expression) is true, or maxSteps elapse
    runUntil(expr, { step = 50, maxSteps = 400000, onTick = null, tickEvery = 20 } = {}) {
      const s = stepScript(step);
      const check = new vm.Script(expr);
      for (let i = 0; i < maxSteps; i++) {
        s.runInContext(C);
        if (onTick && i % tickEvery === 0) onTick(G);
        if (i % 20 === 0 && check.runInContext(C)) return true;
      }
      return false;
    },
    runDays(days, { step = 50, onTick = null, tickEvery = 20 } = {}) {
      const s = stepScript(step);
      let i = 0;
      while (G("day") <= days && !G("gameOver")) {
        s.runInContext(C);
        if (onTick && ++i % tickEvery === 0) onTick(G);
      }
    },
    // A REAL TAP, through the game's own click handler, in CANVAS coordinates.
    // The stub's getBoundingClientRect is 256x240 at the origin, so clientX/Y
    // and canvas x/y are the same number and a scenario can hand this a rect
    // straight out of manageRects(). Returns how many listeners saw it, so a
    // scenario can tell "the handler ignored my tap" from "there is no handler".
    tap(x, y) {
      const ev = { clientX: x, clientY: y, preventDefault() {}, stopPropagation() {} };
      for (const fn of taps.click) fn(ev);
      return taps.click.length;
    },
    // ...and the middle of a rect, which is what every scenario actually wants
    tapRect(r) { return this.tap(r.x + r.w / 2, r.y + r.h / 2); },
  };
}
