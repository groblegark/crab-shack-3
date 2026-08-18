#!/usr/bin/env node
// Headless inner simulation: runs the real game.js against stubbed browser
// APIs with a synthetic clock. Used for balance tuning.
//
//   node tools/headless.mjs --days 14
//   node tools/headless.mjs --days 30 --buy knife,flame,ads   (greedy buys, in priority order)
//   node tools/headless.mjs --days 30 --set ads=3,chef=4
import { readFileSync } from "fs";
import vm from "vm";
import os from "os";
import { fork } from "child_process";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf("--" + name);
  return i >= 0 ? args[i + 1] : dflt;
};
const DAYS = parseInt(opt("days", "14"));
const BUY = (opt("buy", "") || "").split(",").filter(Boolean);
const SET = (opt("set", "") || "").split(",").filter(Boolean);
const STEP = parseFloat(opt("step", "0.05"));   // sim timestep, seconds
const QUIET = args.includes("--quiet");
const SEEDS = parseInt(opt("seeds", "1"));
const JOBS = opt("jobs", null) != null
  ? parseInt(opt("jobs", null))
  : Math.min(SEEDS, Math.max(1, os.cpus().length - 1));

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// ---- browser stubs ------------------------------------------------------
const noop = () => {};
const ctxStub = new Proxy({}, {
  get: (t, k) => {
    if (k === "createImageData") return (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h });
    if (k === "canvas") return { width: 0, height: 0 };
    return noop;
  },
  set: () => true,
});
const mkCanvas = () => ({ width: 0, height: 0, getContext: () => ctxStub,
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 256, height: 240 }),
  addEventListener: noop });
function runOnce(seed) {
const seededMath = Object.create(Math);
seededMath.random = mulberry32(seed);
const sandbox = {
  document: { createElement: () => mkCanvas(), getElementById: () => mkCanvas(), addEventListener: noop, hidden: false },
  location: { search: "?fresh" },
  localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
  Audio: class { constructor() { this.loop = false; this.volume = 0; } play() { return { catch: noop }; } pause() {} },
  AudioContext: undefined,
  addEventListener: noop,
  console,
  Math: seededMath, JSON,
  rafCb: null,
  simNow: 0,
};
sandbox.window = sandbox;
sandbox.requestAnimationFrame = (cb) => { sandbox.rafCb = cb; };
sandbox.performance = { now: () => sandbox.simNow };
const C = vm.createContext(sandbox);

// ---- load the real game (context shares one global lexical env, like <script> tags)
for (const f of ["font.js", "ppu.js", "sprites.js", "crabs.js", "game.js"]) {
  vm.runInContext(readFileSync(join(root, f), "utf8"), C, { filename: f });
}
const G = (expr) => vm.runInContext(expr, C);

// apply --set overrides (e.g. ads=3,chef=4; chef also hires crabs)
for (const kv of SET) {
  const [k, v] = kv.split("=");
  G(`UPS[${JSON.stringify(k)}].lvl = ${parseInt(v)};
     if (${JSON.stringify(k)} === "chef") while (crabs.length < UPS.chef.lvl) crabs.push(newCrab(makeCrabPersona(crabs.length)));`);
}

// ---- run ----------------------------------------------------------------
G('soundOn = false; musicOn = false; screen = "play"; window._headless = true; window._stats = { tourServes: 0, crabServes: 0, tourRage: 0, crabRage: 0, bused: 0 };');
const stepScript = new vm.Script(`simNow += ${STEP * 1000}; rafCb(simNow);`);
const buyScript = BUY.length ? new vm.Script(`
  if (tmin >= 9 * 60 && tmin <= 19 * 60 && Math.abs(tmin - Math.round(tmin / 60) * 60) < ${STEP} * TS / 2) {
    // a sensible player: buy anything on the plan you can afford while keeping
    // tonight's bill covered; unlocks get saved for rather than skipped
    const playerBill = (extraHire) => CRAB_WAGE * (crabs.length + (extraHire ? 1 : 0)) +
      totalRent() + 40;   // conservative: keep a real cushion past tonight
    for (const k of ${JSON.stringify(BUY)}) {
      const u = UPS[k];
      if (!u || u.lvl >= u.max) continue;
      const reserve = upCost(u) + playerBill(k === "chef") + 30;
      if (coins >= reserve) tryBuy(k);
      else if (k === "cleaners" || k === "arcade") break;   // save for the big unlocks
    }
    // rehire after a death so a plague doesn't permanently shrink the crew
    window._peakCrew = Math.max(window._peakCrew || 0, crabs.length);
    if (crabs.length < window._peakCrew && UPS.chef.lvl < UPS.chef.max &&
        coins >= upCost(UPS.chef) + playerBill(true) + 30) tryBuy("chef");
    // staff side businesses only if the shack keeps coverage on that crab's shift
    for (const biz2 of ["cleaners", "arcade"]) {
      if (!bizUnlocked(biz2) || crabs.some(c => c.p.job === biz2)) continue;
      const mover = crabs.find(c => c.p.job === "shack" &&
        crabs.some(o => o !== c && o.p.job === "shack" && o.p.shift === c.p.shift));
      if (mover) mover.p.job = biz2;
    }
  }`) : null;
const dayRows = [];
const walletScript = new vm.Script(`
  if (Math.abs(tmin - 6 * 60) < ${STEP} * TS) {
    window._wal = window._wal || { max12: -1e9, min: 1e9 };
    for (const c of crabs) {
      if (day <= 12 && c.p.wallet > window._wal.max12) window._wal.max12 = c.p.wallet;
      if (c.p.wallet < window._wal.min) window._wal.min = c.p.wallet;
    }
  }`);
let lastDay = G("day");
const t0 = Date.now();
while (G("day") <= DAYS && !G("gameOver")) {
  stepScript.runInContext(C);
  if (buyScript) buyScript.runInContext(C);
  walletScript.runInContext(C);
  const d = G("day");
  if (d !== lastDay) {
    dayRows.push({ day: lastDay, endBalance: G("Math.round(coins)"), lifetime: G("Math.round(lifetime)") });
    lastDay = d;
  }
}
const wall = Date.now() - t0;
return { dayRows, wall, stats: G("JSON.stringify(window._stats)"),
  over: G("gameOver"), day: G("day"), rent: G("rentAmount()"), rep: G("Math.round(rep)"), wal: G("JSON.stringify(window._wal)"),
  coins: G("Math.round(coins)"), ups: G(`Object.keys(UPS).map(k => k + ":" + UPS[k].lvl).join(" ")`) };
}

// ---- worker mode: this file is its own worker entry (fork + IPC) ---------
// `--_worker <seed>` runs one seed and sends the result back to the parent.
const WORKER_SEED = opt("_worker", null);
if (WORKER_SEED != null) {
  process.send(runOnce(parseInt(WORKER_SEED)));
  process.exit(0);
}

// ---- seed matrix: sequential (--jobs 1) or a pool of forked workers ------
function runParallel(seedList, jobs) {
  return new Promise((resolve, reject) => {
    const out = new Array(seedList.length);
    let next = 0, done = 0;
    const launch = () => {
      if (next >= seedList.length) return;
      const idx = next++;
      const child = fork(fileURLToPath(import.meta.url),
        [...args, "--_worker", String(seedList[idx])],
        { stdio: ["ignore", "inherit", "inherit", "ipc"] });
      child.on("message", (msg) => { out[idx] = msg; });
      child.on("error", reject);
      child.on("exit", (code) => {
        if (code !== 0 || out[idx] === undefined)
          return reject(new Error(`worker for seed ${seedList[idx]} failed (exit ${code})`));
        if (++done === seedList.length) return resolve(out);
        launch();
      });
    };
    for (let i = 0; i < Math.min(jobs, seedList.length); i++) launch();
  });
}

const SEEDBASE = parseInt(opt("seedbase", "0"));
const seedList = [];
for (let s = 1; s <= SEEDS; s++) seedList.push((s + SEEDBASE) * 1337);
const results = (JOBS <= 1 || SEEDS <= 1)
  ? seedList.map((seed) => runOnce(seed))
  : await runParallel(seedList, JOBS);
const r0 = results[0];
if (!QUIET && SEEDS === 1) {
  console.log("day  end$   lifetime$  (settlement at 20:00 included)");
  for (const r of r0.dayRows) console.log(String(r.day).padStart(3), String(r.endBalance).padStart(6), String(r.lifetime).padStart(9));
}
for (const r of results) {
  console.log("   stats:", r.stats);
  console.log("   wallets:", r.wal);
  console.log(r.over
    ? `EVICTED day ${r.day} (rent $${r.rent}, had $${r.coins}, rep ${r.rep}) — ${r.ups}`
    : `SURVIVED ${DAYS}d, $${r.coins} rep ${r.rep} — ${r.ups}`);
}
if (SEEDS > 1) {
  const evictDays = results.map(r => r.over ? r.day : DAYS + 1).sort((a, b) => a - b);
  const surv = results.filter(r => !r.over).length;
  console.log(`>> survived ${surv}/${SEEDS}; eviction days: ${evictDays.join(",")} (median ${evictDays[SEEDS >> 1]})`);
}
console.log(`(${results.reduce((s, r) => s + r.wall, 0)}ms total)`);
