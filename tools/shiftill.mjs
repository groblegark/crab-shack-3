#!/usr/bin/env node
// SHIFT vs ILLNESS — does the shift a crab draws predict whether they get sick?
//
//   node tools/shiftill.mjs [--seeds N] [--days D] [--crew N] [--organic]
//                           [--swap] [--dump PATH] [--quiet]
//
// WHY THIS EXISTS. Matt, 2026-08-20: "clawdia still has supercrab powers of
// never getting sick btw, she keeps making all the money." The standing
// diagnosis was a clock artifact: the nightly roll reads every crab's needs at
// the INSTANT of the 20:00 settlement, and 20:00 is a different place in every
// crab's day - six hours after a MORNING crab clocked off, and (the settlement
// runs at the top of frame(), before the crab loop) strictly BEFORE an EVENING
// crab's own clock-off bump lands. PLAN carried a measurement with it: morning
// crabs ill 9.2% of the time against evening's 1.9%.
//
// WHAT THIS TOOL FOUND. The bias in what the roll READS is real and large. The
// bias in the ILLNESS THAT FOLLOWS is not there at all - hunger and thirst
// favour the evening crab, exhaustion favours the morning one, and they
// cancel. See the receipt in game.js above illRisk(). Keep this rig: the
// question comes back, and reasoning about it from the code got it wrong.
//
// WHAT IT REPORTS, per shift kind (M / E / D):
//   RISK      mean risk the roll assembled per at-risk crab-night. The
//             headline: thousands of samples where illness has tens.
//   ill%      prevalence - fraction of crab-nights spent ill
//   incid%    incidence  - new illnesses per at-risk crab-night
//   needs     the mean of each need at the moment of judgement
// and, with --swap, the founders' own numbers with their shifts EXCHANGED,
// which is the experiment that separates "the shift" from "the crab".
//
// The sim contract holds: this drives the real game files through simlib and
// reimplements nothing - the risk numbers come out of the game's own roll,
// through the window._stats.rollLog seam.
import { createSim } from "./simlib.mjs";
import { writeFileSync } from "fs";

const arg = (k, d) => {
  const i = process.argv.indexOf(k);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d;
};
const SEEDS = +arg("--seeds", 12), DAYS = +arg("--days", 24);
const CREW = +arg("--crew", 6);
const DUMP = arg("--dump", null);
// ONLY THE CREW HAS AN M/E SHIFT. Townsfolk and fishers are all "D"
// (8:30-18:30, the owner-operator window), so a two-crab starting town yields
// two M/E crab-nights a day and no signal at all. The rig hires the crew up to
// --crew through the game's own hireCrew(), which alternates M/E by crew size
// (hireShift) - so the arms come out balanced by construction: 3 M and 3 E at
// crew 6, one founder and two hires apiece, the same housing mix on each side.
//
// --organic runs the town as the player actually meets it instead: no crew
// handed to it, no solvency prop, and it stops when the landlord does. That is
// the rig Matt's report lives in - PINCHY on mornings, CLAWDIA on evenings -
// but it yields ~170 crab-nights a side, where the solvent rig yields ~1080.
const ORGANIC = process.argv.includes("--organic");
// --swap EXCHANGES the two founders' shifts on day 2 and changes nothing else.
// If the gap between PINCHY and CLAWDIA follows the SHIFT it is the clock; if
// it follows the CRAB it is founder identity (CLAWDIA rides a bike and is
// TIDY: work 1.1, tip 1.05; PINCHY walks and is SPEEDY: move 1.4, work 1.0).
const SWAP = process.argv.includes("--swap");
const QUIET = process.argv.includes("--quiet");

const NEEDS = ["hunger", "thirst", "dirt", "tired"];

// one seed: walk day by day, sampling every crab just before the roll and
// again just after it, and collect the roll's own log of what it read.
function runSeed(seed) {
  const sim = createSim({ seed });
  const rows = [];          // one row per crab-night (prevalence / incidence)
  sim.G("window._stats.rollLog = [];");
  sim.runUntil("day >= 2 && tmin >= 7 * 60", { maxSteps: 200000 });
  if (!ORGANIC)
    sim.G(`coins = 3000; UPS.chef.lvl = Math.max(UPS.chef.lvl, ${CREW});
           while (crabs.length < ${CREW}) hireCrew();`);
  if (SWAP) sim.G(`{ const a = crabs[0].p.shift; crabs[0].p.shift = crabs[1].p.shift;
                     crabs[1].p.shift = a; }`);
  for (let d = 0; d < DAYS; d++) {
    if (sim.G("gameOver")) break;
    if (!ORGANIC) sim.G("if (coins < 500) coins = 900;");   // measuring illness, not solvency
    if (!sim.runUntil("tmin >= 19.9 * 60 && lastRentDay !== day", { maxSteps: 200000 })) break;
    const pre = JSON.parse(sim.G(`JSON.stringify(allCrabs().map(c => ({
      name: c.p.name, shift: c.p.shift, sick: !!c.p.sick, npc: !!c.p.npc,
      wallet: Math.round(c.p.wallet || 0) })))`));
    if (!sim.runUntil("lastRentDay === day", { maxSteps: 200000 })) break;
    const now = new Map(JSON.parse(sim.G(`JSON.stringify(allCrabs().map(c => [c.p.name, !!c.p.sick]))`)));
    for (const c of pre)
      rows.push({ ...c, fell: now.has(c.name) && !c.sick && now.get(c.name) });
    if (!sim.runUntil("tmin < 10 * 60 && tmin > 6 * 60", { maxSteps: 200000 })) break;
  }
  return { rows, log: JSON.parse(sim.G("JSON.stringify(window._stats.rollLog)")),
    inf: +sim.G("window._stats.infections || 0"),
    causes: JSON.parse(sim.G("JSON.stringify(window._stats.causes || {})")) };
}

const rows = [], log = []; let inf = 0; const causes = {};
for (let i = 0; i < SEEDS; i++) {
  const r = runSeed(1337 + i * 337);
  rows.push(...r.rows); log.push(...r.log); inf += r.inf;
  for (const k in r.causes) causes[k] = (causes[k] || 0) + r.causes[k];
  if (!QUIET) process.stdout.write(".");
}
if (!QUIET) process.stdout.write("\n");
if (DUMP) writeFileSync(DUMP, JSON.stringify(log));

const pct = (a, b) => b === 0 ? "  n/a " : (100 * a / b).toFixed(2).padStart(6);
const mean = (a, f) => a.length ? a.reduce((s, x) => s + f(x), 0) / a.length : 0;

function report(label, keep) {
  const R = rows.filter(keep), L = log.filter(keep);
  console.log("\n== " + label + "   (" + R.length + " crab-nights, "
    + L.length + " at-risk rolls, " + SEEDS + " seeds x " + DAYS + "d"
    + (SWAP ? ", FOUNDERS' SHIFTS SWAPPED" : "") + ")");
  console.log("shift  nights   ill%   new  incid%     RISK    "
    + NEEDS.map(n => n.slice(0, 4).padStart(6)).join(""));
  const out = {};
  for (const k of ["M", "E", "D"]) {
    const r = R.filter(x => x.shift === k), g = L.filter(x => x.shift === k);
    if (!r.length) continue;
    const atRisk = r.filter(x => !x.sick).length, fell = r.filter(x => x.fell).length;
    out[k] = { risk: mean(g, x => x.risk), prev: r.filter(x => x.sick).length / r.length,
      incid: atRisk ? fell / atRisk : 0, n: r.length };
    console.log(" " + k + "   " + String(r.length).padStart(7) + " " + pct(r.filter(x => x.sick).length, r.length)
      + " " + String(fell).padStart(5) + "  " + pct(fell, atRisk)
      + "  " + out[k].risk.toFixed(5).padStart(8)
      + "  " + NEEDS.map(n => mean(g, x => x.now[n]).toFixed(3).padStart(6)).join(""));
  }
  if (out.M && out.E) {
    const rat = (a, b) => b ? (a / b).toFixed(2) : (a ? "inf" : "1.00");
    console.log(">> M/E   RISK x" + rat(out.M.risk, out.E.risk)
      + "   prevalence x" + rat(out.M.prev, out.E.prev)
      + "   incidence x" + rat(out.M.incid, out.E.incid)
      + "    (1.00 = the shift tells you nothing)");
  }
}

report("EVERYONE", () => true);
report("CREW ONLY (M/E is a crew thing; townsfolk are all D)", r => !r.npc);
console.log("   town-wide infections " + inf + "   causes " + JSON.stringify(causes));
// THE FOUNDERS, BY NAME. CLAWDIA is founder #1 and founders alternate M/E by
// index (crabs.js makeCrabPersona), so she is on EVENINGS in every seed there
// has ever been unless --swap says otherwise. That pair IS Matt's report.
for (const n of ["PINCHY", "CLAWDIA"]) {
  const r = rows.filter(x => x.name === n), g = log.filter(x => x.name === n);
  if (!r.length) continue;
  console.log("   " + n.padEnd(8) + "shift " + r[0].shift + "  nights " + r.length
    + "  ill " + pct(r.filter(x => x.sick).length, r.length) + "%"
    + "  fell ill " + r.filter(x => x.fell).length + "x"
    + "  mean risk " + mean(g, x => x.risk).toFixed(5)
    + "  mean wallet $" + mean(r, x => x.wallet).toFixed(0));
}
