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
  // THE CANVAS REMEMBERS ITS LISTENERS, which is the whole of `tap` below. The
  // game's click handler is an anonymous arrow inside addEventListener, so
  // with a noop stub there was NO WAY to reach it from a scenario: a draw and
  // its hit test could disagree about where a control was and 200 scenarios
  // would all pass. Recording the handlers costs nothing and is not a new
  // browser API - it is the same addEventListener that was always there.
  const canvasListeners = {};
  // width/height are the REAL canvas's, not zero: evPos scales a click by
  // cv.width / boundingRect.width, and at width 0 every tap in the game landed
  // on pixel (0,0). Read only by evPos, so nothing about the sim's behaviour
  // moves - it is the difference between `tap` working and `tap` lying.
  const mkCanvas = () => ({ width: 256, height: screenH || 240, getContext: () => ctxStub,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 256, height: 240 }),
    addEventListener: (type, fn) => { (canvasListeners[type] = canvasListeners[type] || []).push(fn); } });
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
    // DRIVE THE REAL CLICK HANDLER. `tap(x, y)` is a canvas-space click - the
    // getBoundingClientRect stub above is 1:1 with the 256px canvas, so a
    // world/card coordinate goes straight in. `tapRect(r)` aims at a rect's
    // centre, which is how a scenario proves that a control a DRAW put at
    // manageRects().foo is the control the HIT TEST acts on: the two read the
    // same table, and this is the only thing that can catch them drifting.
    tap(x, y) {
      const ls = canvasListeners.click || [];
      if (!ls.length) throw new Error("no click listener registered on the canvas");
      for (const fn of ls) fn({ clientX: x, clientY: y, preventDefault: noop });
      return ls.length;
    },
    tapRect(r) { return this.tap(r.x + r.w / 2, r.y + r.h / 2); },
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
