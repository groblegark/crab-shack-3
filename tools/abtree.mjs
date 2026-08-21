#!/usr/bin/env node
// A/B FINGERPRINT: is this tree's town the SAME TOWN as another tree's?
//
//   node tools/abtree.mjs --ref HEAD~1 --days 20
//   node tools/abtree.mjs --ref 82095b3 --days 25 --buy chef,table --seeds 1337,909
//
// WHY THIS EXISTS. CLAUDE.md's standing rule is "measure against the tree you
// are landing on", and the 16-seed matrix is the honest way to do that - but it
// takes fifteen minutes, it answers in survival counts, and survival counts are
// noisy enough that a real regression can hide inside one. Very often the claim
// worth making is much stronger and much cheaper: THIS CHANGE DID NOT TOUCH THE
// TOWN AT ALL. A feature confined to a shop the harness never buys, a pure-draw
// pass, a refactor - all of them should produce a bit-identical town, and if
// they do not, the seeds-and-medians run is measuring the wrong thing anyway.
//
// So this runs the same seeded town on both trees and diffs a FINGERPRINT: the
// day, the till, reputation, the crew size and the number of customers in town
// at every midnight, plus how and when it ended. Identical means identical;
// different prints the first midnight they parted company, which is usually
// enough to name the cause on its own.
//
// The control tree is materialised with `git archive` into a temp directory, so
// there is nothing to stage by hand and no second checkout to keep in step.
import { readFileSync, mkdtempSync, rmSync } from "fs";
import { execFileSync } from "child_process";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import vm from "vm";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf("--" + n); return i >= 0 ? args[i + 1] : d; };
const REF = opt("ref", "HEAD");
const DAYS = parseInt(opt("days", "20"));
const BUY = (opt("buy", "") || "").split(",").filter(Boolean);
const SEEDS = (opt("seeds", "1337,909,4242,5348")).split(",").map(Number);
// ...and one escape hatch, because --buy cannot say everything. `--js` runs an
// expression inside BOTH towns before the clock starts, which is how you stage
// a shop that needs STAFFING to do anything (an unstaffed arcade serves nobody,
// so "--buy arcade" on its own compares two empty rooms and calls them equal):
//   --js 'crabs[2].p.job = "arcade"; crabs[3].p.job = "arcade";'
const JS = opt("js", "");
// the five files the sim contract says ARE the game (see CLAUDE.md)
const FILES = ["font.js", "ppu.js", "sprites.js", "crabs.js", "game.js"];

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const noop = () => {};
// the same stubs simlib uses, deliberately duplicated rather than imported:
// this file has to be able to load a tree that predates whatever simlib does
// today, so it must not depend on today's simlib.
function fingerprint(treeRoot, seed, days, buys, js) {
  const ctxStub = new Proxy({}, { get: (t, k) => {
    if (k === "createImageData") return (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h });
    if (k === "canvas") return { width: 0, height: 0 };
    return noop;
  }, set: () => true });
  const mk = () => ({ width: 256, height: 240, getContext: () => ctxStub,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 256, height: 240 }), addEventListener: noop });
  const seeded = Object.create(Math); seeded.random = mulberry32(seed);
  const sb = { document: { createElement: mk, getElementById: mk, addEventListener: noop, hidden: false },
    location: { search: "?fresh" }, localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
    Audio: class { constructor() { this.loop = false; this.volume = 0; } play() { return { catch: noop }; } pause() {} addEventListener() {} },
    AudioContext: undefined, addEventListener: noop, console, Math: seeded, JSON, rafCb: null, simNow: 0 };
  sb.window = sb;
  sb.requestAnimationFrame = (cb) => { sb.rafCb = cb; };
  sb.performance = { now: () => sb.simNow };
  const C = vm.createContext(sb);
  for (const f of FILES) vm.runInContext(readFileSync(join(treeRoot, f), "utf8"), C, { filename: f });
  const G = (e) => vm.runInContext(e, C);
  G(`soundOn = false; musicOn = false; screen = "play"; window._headless = true; window._stats = {};`);
  // buy the list BEFORE the day starts, funded and then un-funded, so both
  // trees open on the same float with the same things standing
  if (buys.length)
    G(`coins += 100000; ${buys.map(b => `tryBuy(${JSON.stringify(b)});`).join(" ")} coins -= 100000;`);
  if (js) G(js);
  const step = new vm.Script(`simNow += 50; rafCb(simNow);`);
  const marks = [];
  let d = G("day");
  while (G("day") <= days && !G("gameOver")) {
    step.runInContext(C);
    const nd = G("day");
    if (nd !== d) {
      d = nd;
      marks.push([d, Math.round(G("coins")), Math.round(G("rep") * 100) / 100,
        G("crabs.length"), G("customers.length")]);
    }
  }
  marks.push(["end", G("day"), Math.round(G("coins")), !!G("gameOver"), Math.round(G("lifetime"))]);
  return marks;
}

const tmp = mkdtempSync(join(tmpdir(), "crabshack-ab-"));
try {
  // materialise the control tree at REF. `git archive | tar -x` keeps this to
  // one command and never touches the working tree or the index.
  const tarball = execFileSync("git", ["archive", REF, ...FILES], { cwd: root, maxBuffer: 1 << 28 });
  execFileSync("tar", ["-x", "-C", tmp], { input: tarball, maxBuffer: 1 << 28 });
  let same = 0;
  for (const s of SEEDS) {
    const fa = fingerprint(tmp, s, DAYS, BUY, JS), fb = fingerprint(root, s, DAYS, BUY, JS);
    const a = JSON.stringify(fa), b = JSON.stringify(fb);
    // A TOWN THAT NEVER LIVED IS NOT EVIDENCE. `--buy` funds itself out of a
    // float it puts back afterwards, so a long buy list can leave the shop
    // opening in debt, dying at the first 20:00, and reading IDENTICAL on both
    // trees because neither of them ever traded. That is the shape of a false
    // pass, so it is said out loud rather than counted quietly.
    const lived = Math.min(fa.length, fb.length) - 1;
    if (lived < 2) console.log(`seed ${s}: WARNING - the town lasted ${lived} midnight(s); `
      + `whatever this compares, it is not a working town (fund it with --js 'coins = N')`);
    if (a === b) { same++; console.log(`seed ${s}: IDENTICAL`); continue; }
    console.log(`seed ${s}: DIFFERS`);
    const A = JSON.parse(a), B = JSON.parse(b);
    for (let i = 0; i < Math.max(A.length, B.length); i++)
      if (JSON.stringify(A[i]) !== JSON.stringify(B[i])) {
        console.log(`   first divergence  ${REF}: ${JSON.stringify(A[i])}   here: ${JSON.stringify(B[i])}`);
        console.log("   (fields: day, coins, rep, crew, customers)");
        break;
      }
    console.log(`   ended  ${REF}: ${JSON.stringify(A[A.length - 1])}   here: ${JSON.stringify(B[B.length - 1])}`);
  }
  console.log(`\n${same}/${SEEDS.length} identical over ${DAYS} days against ${REF}`
    + (BUY.length ? ` (buys: ${BUY.join(",")})` : " (buy nothing)"));
  process.exit(same === SEEDS.length ? 0 : 1);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
