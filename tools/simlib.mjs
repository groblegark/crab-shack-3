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

export function createSim({ seed = 1337, storage = null, fresh = true } = {}) {
  const ctxStub = new Proxy({}, {
    get: (t, k) => {
      if (k === "createImageData") return (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h });
      if (k === "canvas") return { width: 0, height: 0 };
      return noop;
    },
    set: () => true,
  });
  const mkCanvas = () => ({ width: 0, height: 0, getContext: () => ctxStub,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 256, height: 240 }), addEventListener: noop });
  const store = storage || new Map();
  const seededMath = Object.create(Math);
  seededMath.random = mulberry32(seed);
  const sandbox = {
    document: { createElement: () => mkCanvas(), getElementById: () => mkCanvas(), addEventListener: noop, hidden: false },
    location: { search: fresh ? "?fresh" : "" },
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    },
    Audio: class { constructor() { this.loop = false; this.volume = 0; } play() { return { catch: noop }; } pause() {} addEventListener() {} },
    AudioContext: undefined, addEventListener: noop, console,
    Math: seededMath, JSON, rafCb: null, simNow: 0,
  };
  sandbox.window = sandbox;
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
  };
}
