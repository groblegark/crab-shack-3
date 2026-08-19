#!/usr/bin/env node
// Illness-duration distributions, per housing tier — the centerpiece
// measurement for the sick-day / cared-seam work.
//
//   node tools/illness.mjs [--seeds N] [--days D] [--quiet]
//
// Two arms per seed, identical in every other way:
//   BED  a HOUSED crab falls ill and takes a granted sick day at home
//   COT  the same crab, pinned homeless, convalesces on a shelter cot
// and each arm is run twice — once with the care ladder LIVE (after) and once
// with the two rest lanes collapsed back onto the old CARED odds (before).
// Collapsing the table in the vm means both numbers come from ONE build, so
// the comparison can't drift on anything but the seam itself.
//
// The sim contract holds: this drives the real game files through simlib and
// reimplements nothing.
import { createSim } from "./simlib.mjs";

const arg = (k, d) => {
  const i = process.argv.indexOf(k);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d;
};
const SEEDS = +arg("--seeds", 24), MAXDAYS = +arg("--days", 14);
const QUIET = process.argv.includes("--quiet");

// collapse the rest lanes back onto the old CARED odds = the pre-seam build
const OLD_LANES = `CARE_LANES.cot = { cure: 0.40, die: 0.08, label: "COT" };
                   CARE_LANES.bed = { cure: 0.40, die: 0.08, label: "BED" };`;

// the ladder RUNG, isolated: a housed crab convalescing on cot odds. Same
// seed, same housing, same errands, same RNG stream - only the roll differs,
// so bed-vs-this is a properly paired reading of "your own bed beats a cot".
const RUNG = `CARE_LANES.bed = { cure: CARE_LANES.cot.cure, die: CARE_LANES.cot.die, label: "COT ODDS" };`;

function runOne(seed, { housed, seam, rung }) {
  const sim = createSim({ seed });
  if (!seam) sim.G(OLD_LANES);
  if (rung) sim.G(RUNG);
  // settle into day 2 morning: houses assigned, wallets warm
  sim.runUntil("day >= 2 && tmin >= 7 * 60", { maxSteps: 200000 });
  if (sim.G("gameOver")) return null;
  // the subject: a crew crab, housed or pinned onto a cot, with pocket money
  // for the food-and-water errands the CARED bar has always demanded
  const ok = sim.G(`{
    const c = crabs[0];
    if (!c) false; else {
      c.p.wallet = 80;
      ${housed
        ? `if (c.p.homeless) { const used = new Set(allCrabs().filter(k => !k.p.homeless).map(k => k.p.house));
             for (let h = 0; h < HOUSE_XS.length; h++) if (!used.has(h)) { c.p.house = h; c.p.homeless = false; break; } }`
        : `c.p.homeless = true; c.p.house = null; c.p.boat = null;`}
      c.p.sick = { days: 0 }; c.p.restT = 0;
      c.p.hunger = 0.1; c.p.thirst = 0.1; c.p.dirt = 0.1;
      ${housed ? "!c.p.homeless" : "c.p.homeless"}
    }
  }`);
  if (!ok) return null;
  const N = JSON.stringify(sim.G("crabs[0].p.name"));
  let lane = "?", restT = 0;
  for (let d = 0; d < MAXDAYS; d++) {
    sim.G("if (coins < 500) coins = 900;");   // measuring illness, not solvency
    // the CONTROL has to stay on a cot: the nightly housing ladder would
    // otherwise move a crab with pocket money straight into a house and
    // quietly turn the control arm into a second treatment arm
    if (!housed) sim.G(`{ const c = crabs.find(c2 => c2.p.name === ${N});
      if (c) { c.p.homeless = true; c.p.house = null; c.p.boat = null; } }`);
    // sample the care lane the roll is ABOUT to read (after the roll a
    // recovered crab has no p.sick left and careLane can't tell you anything)
    sim.runUntil("tmin >= 19.9 * 60 && lastRentDay !== day", { maxSteps: 200000 });
    if (sim.G(`crabs.some(c => c.p.name === ${N} && c.p.sick)`)) {
      lane = sim.G(`careLane(crabs.find(c => c.p.name === ${N}))`);
      restT = +sim.G(`crabs.find(c => c.p.name === ${N}).p.restT`).toFixed(1);
    }
    sim.runUntil("lastRentDay === day", { maxSteps: 200000 });
    const gone = sim.G(`!crabs.some(c => c.p.name === ${N})`);
    if (gone) return { days: d + 1, out: "died", lane, restT };
    const well = sim.G(`!crabs.find(c => c.p.name === ${N}).p.sick`);
    if (well) return { days: d + 1, out: "well", lane, restT };
    sim.runUntil("tmin < 10", { maxSteps: 200000 });
    if (sim.G("gameOver")) return null;
  }
  return { days: MAXDAYS, out: "still ill", lane, restT };
}

function stats(rows) {
  const days = rows.map(r => r.days).sort((a, b) => a - b);
  if (!days.length) return null;
  const mean = days.reduce((s, v) => s + v, 0) / days.length;
  const med = days.length % 2 ? days[(days.length - 1) / 2]
    : (days[days.length / 2 - 1] + days[days.length / 2]) / 2;
  const hist = {};
  for (const d of days) hist[d] = (hist[d] || 0) + 1;
  return { n: days.length, mean: +mean.toFixed(2), median: med,
    p90: days[Math.min(days.length - 1, Math.floor(days.length * 0.9))],
    died: rows.filter(r => r.out === "died").length,
    lanes: rows.reduce((m, r) => (r.lane && (m[r.lane] = (m[r.lane] || 0) + 1), m), {}),
    restT: +(rows.reduce((s, r) => s + (r.restT || 0), 0) / rows.length).toFixed(1),
    hist: days.reduce((s, d) => s, "") || Object.entries(hist).map(([d, n]) => d + "d:" + n).join(" ") };
}

const arms = [
  ["BED  (own bed) BEFORE", { housed: true, seam: false }],
  ["BED  (own bed) AFTER ", { housed: true, seam: true }],
  ["COT  (shelter)  BEFORE", { housed: false, seam: false }],
  ["COT  (shelter)  AFTER ", { housed: false, seam: true }],
  ["RUNG (bed on cot odds)", { housed: true, seam: true, rung: true }],
];
const out = {};
for (const [label, cfg] of arms) {
  const rows = [];
  for (let i = 0; i < SEEDS; i++) {
    const r = runOne(1337 + i * 337, cfg);
    if (r) rows.push(r);
    if (!QUIET && r) process.stdout.write(".");
  }
  if (!QUIET) process.stdout.write("\n");
  out[label] = stats(rows);
  const s = out[label];
  console.log(label.padEnd(24) + "n=" + s.n + "  mean " + s.mean + "d  median " + s.median
    + "d  p90 " + s.p90 + "d  died " + s.died + "  [" + s.hist + "]"
    + (Object.keys(s.lanes).length ? "  lanes " + JSON.stringify(s.lanes) + " restT~" + s.restT + "h" : ""));
}
const shift = (a, b) => +(out[a].mean - out[b].mean).toFixed(2);
console.log("\n>> bed rest shifts the mean by " + shift("BED  (own bed) AFTER ", "BED  (own bed) BEFORE") + " days");
console.log(">> cot rest shifts the mean by " + shift("COT  (shelter)  AFTER ", "COT  (shelter)  BEFORE") + " days");
console.log(">> the housing RUNG (paired, same seed + same house): own bed beats cot odds by "
  + shift("RUNG (bed on cot odds)", "BED  (own bed) AFTER ") + " days"
  + "  (deaths " + out["RUNG (bed on cot odds)"].died + " vs " + out["BED  (own bed) AFTER "].died + ")");
