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
// `--failoff wander,chat,walkout,nod,rough` switches individual needs-failure
// behaviours off, so the balance matrix can attribute its own movement to one
// of them at a time (game.js reads window._failOff through one helper and
// never sets it). This is how the attribution table in PLAN was built.
const FAILOFF = (opt("failoff", "") || "").split(",").filter(Boolean);
const SEEDS = parseInt(opt("seeds", "1"));
// THE WAGE LEVER. --wage N sets every PLAYER-owned shop's rate (the setting
// the SCHEDULE tab exposes); --star N puts one named crab on a private deal
// at N, which is the "pay your best crab more" strategy the sweep tests
// against "raise everybody". Both go through the game's own setters.
const WAGE = opt("wage", null) != null ? parseInt(opt("wage", null)) : null;
const STAR = opt("star", null) != null ? parseInt(opt("star", null)) : null;
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
     if (${JSON.stringify(k)} === "chef") while (crabs.length < UPS.chef.lvl) hireCrew();`);   // the game's own recruitment path: hires start homeless
}

if (WAGE != null)
  G(`for (const b of Object.keys(BIZ)) if (bizOwner(b) === "player") setBizWage(b, ${WAGE});`);
if (STAR != null)
  G(`if (crabs.length) setCrabWage(crabs[0], ${STAR});`);

// ---- run ----------------------------------------------------------------
G('soundOn = false; musicOn = false; screen = "play"; window._headless = true; window._stats = { tourServes: 0, crabServes: 0, tourRage: 0, crabRage: 0, bused: 0 };');
if (FAILOFF.length) G(`window._failOff = ${JSON.stringify(Object.fromEntries(FAILOFF.map(k => [k, 1])))};`);
const stepScript = new vm.Script(`simNow += ${STEP * 1000}; rafCb(simNow);`);
const buyScript = BUY.length ? new vm.Script(`
  if (tmin >= 9 * 60 && tmin <= 19 * 60 && Math.abs(tmin - Math.round(tmin / 60) * 60) < ${STEP} * TS / 2) {
    // a sensible player: buy anything on the plan you can afford while keeping
    // tonight's bill covered; unlocks get saved for rather than skipped
    // labour is priced per crab now: the reserve totals what THIS crew costs
    // (private deals included) plus a notional wage for the crab being hired
    const playerBill = (extraHire) =>
      crabs.reduce((s, c) => s + Math.round(wageRate(c)), 0) + (extraHire ? bizWage("shack") : 0) +
      totalRent() + 40;   // conservative: keep a real cushion past tonight
    for (const k of ${JSON.stringify(BUY)}) {
      const u = UPS[k];
      if (!u || u.lvl >= u.max) continue;
      const reserve = upCost(u) + playerBill(k === "chef") + 30;
      if (coins >= reserve) tryBuy(k);
      else if (k === "arcade" || k === "juicebar") break;   // save for the big unlocks
    }
    // rehire after a death so a plague doesn't permanently shrink the crew
    window._peakCrew = Math.max(window._peakCrew || 0, crabs.length);
    if (crabs.length < window._peakCrew && UPS.chef.lvl < UPS.chef.max &&
        coins >= upCost(UPS.chef) + playerBill(true) + 30) tryBuy("chef");
    // staff side businesses only if the shack keeps coverage on that crab's
    // shift - and cover BOTH shifts once the crew is deep enough
    for (const biz2 of ["arcade", "juicebar"]) {
      if (!bizUnlocked(biz2)) continue;
      for (const sh of ["M", "E"]) {
        if (crabs.some(c => c.p.job === biz2 && c.p.shift === sh)) continue;
        const mover = crabs.find(c => c.p.job === "shack" && c.p.shift === sh &&
          crabs.some(o => o !== c && o.p.job === "shack" && o.p.shift === sh));
        if (mover) mover.p.job = biz2;
      }
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
// the labour-market picture this run ended on: who ended up where on the
// housing ladder, and what the wage lever actually did to the town
const labour = G(`JSON.stringify({
  rates: Object.keys(BIZ).map(b => b + ":" + bizWage(b)).join(" "),
  crew: crabs.map(c => c.p.name + "$" + Math.round(wageRate(c))).join(" "),
  boat: allCrabs().filter(c => c.p.boat != null).length,
  housed: allCrabs().filter(c => !c.p.homeless && c.p.boat == null).length,
  cot: allCrabs().filter(c => c.p.homeless).length,
  crewHoused: crabs.filter(c => !c.p.homeless).length, crewN: crabs.length,
  purse: Math.round(allCrabs().reduce((s, c) => s + Math.max(0, c.p.wallet), 0)),
  walkouts: ((window._stats.walkouts || []).length) || 0,   // a counter, not a list, on some paths
  quits: (window._stats.wageQuits || []).length,
  wageMoves: (window._stats.wageMoves || []).map(m => "d" + m.day + ":" + m.rate).join(","),
})`);
return { dayRows, wall, labour, lifetime: G("Math.round(lifetime)"), stats: G("JSON.stringify(window._stats)"),
  over: G("gameOver"), bankrupt: G("bankrupt"), debt: G("Math.round(credit.bal)"), day: G("day"), rent: G("rentAmount()"), rep: G("Math.round(rep)"), wal: G("JSON.stringify(window._wal)"),
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
  console.log("   labour:", r.labour);
  console.log(r.over
    ? `${r.bankrupt ? "BANKRUPT" : "EVICTED"} day ${r.day} (rent $${r.rent}, had $${r.coins}, debt $${r.debt}, rep ${r.rep}) — ${r.ups}`
    : `SURVIVED ${DAYS}d, $${r.coins} rep ${r.rep} — ${r.ups}`);
}
if (SEEDS > 1) {
  const evictDays = results.map(r => r.over ? r.day : DAYS + 1).sort((a, b) => a - b);
  const surv = results.filter(r => !r.over).length;
  console.log(`>> survived ${surv}/${SEEDS}; eviction days: ${evictDays.join(",")} (median ${evictDays[SEEDS >> 1]})`);
  const L = results.map(r => JSON.parse(r.labour));
  const sum = (f) => L.reduce((s, l) => s + f(l), 0);
  console.log(`>> lifetime $${results.reduce((s, r) => s + r.lifetime, 0)}`
    + `; housing boat/house/cot ${sum(l => l.boat)}/${sum(l => l.housed)}/${sum(l => l.cot)}`
    + `; crew housed ${sum(l => l.crewHoused)}/${sum(l => l.crewN)}`
    + `; purse $${sum(l => l.purse)}; walkouts ${sum(l => l.walkouts)}; quits ${sum(l => l.quits)}`);
}
console.log(`(${results.reduce((s, r) => s + r.wall, 0)}ms total)`);
