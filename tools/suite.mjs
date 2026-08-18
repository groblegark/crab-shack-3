#!/usr/bin/env node
// Regression suite: assertion-based scenarios over the real game code.
//   node tools/suite.mjs            run everything
//   node tools/suite.mjs stuck ff   run scenarios matching any arg substring
import { createSim } from "./simlib.mjs";

const results = [];
function scenario(name, fn) { results.push({ name, fn }); }
const near = (v, lo, hi) => v >= lo && v <= hi;

// ---- movement health helper: detect crabs frozen while in a moving state
function stuckDetector(sim) {
  const last = {}; let worst = 0;
  return {
    tick(G) {
      const rows = JSON.parse(G(`JSON.stringify(crabs.map(c => [c.p.name, c.dayState, c.kstate, c.cstate, Math.round(c.x), Math.round(c.y), !!c.hidden, !!c.errandCust]))`));
      for (const [name, ds, ks, cs, x, y, hidden, queued] of rows) {
        const movingState =
          (["toWork", "toHome", "toErrand"].includes(ds) && !hidden && !queued && cs !== "waitBus") ||
          (ds === "working" && ["walk", "toSlot", "toBus", "toSink"].includes(ks));
        const rec = last[name];
        if (movingState && rec && Math.abs(rec.x - x) < 2 && Math.abs(rec.y - y) < 2) {
          rec.frames++;
          worst = Math.max(worst, rec.frames);
        } else last[name] = { x, y, frames: 0 };
      }
    },
    // each tick ~= 1 sim-second; >18s frozen while "moving" = stuck
    get worstSeconds() { return worst; },
  };
}

scenario("baseline always loses (day 6-14)", () => {
  const days = [];
  for (const seed of [1337, 2674, 4011]) {
    const sim = createSim({ seed });
    sim.runDays(30);
    if (!sim.G("gameOver")) return `seed ${seed} survived 30d with $${sim.G("Math.round(coins)")}`;
    days.push(sim.G("day"));
  }
  const med = days.sort((a, b) => a - b)[1];
  return near(med, 6, 14) ? true : `median eviction day ${med} outside 6-14 (${days})`;
});

scenario("growth strategy can escape", () => {
  // Models the same sensible player the CLI harness does: hourly purchase
  // checks (not noon-only), reserve = cost + tonight's player bill + cushion,
  // and hire-and-seat as the plan. Bar: at least 1 of 4 seeds escapes, or the
  // failures are late (median eviction beyond day 18).
  let survived = 0; const evictDays = [];
  for (const seed of [1337, 2674, 4011, 5348]) {
    const sim = createSim({ seed });
    const buy = () => {
      for (const k of ["chef", "table"]) {
        sim.G(`{ const u = UPS["${k}"];
          const bill = CRAB_WAGE * (crabs.length + ("${k}" === "chef" ? 1 : 0)) +
            Object.keys(BIZ).filter(b2 => bizUnlocked(b2) && bizOwner(b2) === "player")
              .reduce((s2, b2) => s2 + BIZ[b2].rent, 0);
          if (u.lvl < u.max && coins >= upCost(u) + bill + 30) tryBuy("${k}"); }`);
      }
    };
    let lastHour = -1;
    sim.runDays(40, { onTick: (G) => {
      const h = Math.floor(G("tmin") / 60);
      if (h >= 9 && h <= 19 && h !== lastHour) { lastHour = h; buy(); }
    }, tickEvery: 20 });
    if (!sim.G("gameOver")) survived++;
    else evictDays.push(sim.G("day"));
  }
  if (survived >= 1) return true;
  const med = evictDays.sort((a, b) => a - b)[Math.floor(evictDays.length / 2)];
  return med >= 18 ? true : `0/4 survived and median eviction day ${med} < 18`;
});

scenario("dining: outdoor tables, guests bus their own", () => {
  const sim = createSim({ seed: 99 });
  sim.runDays(3);
  const st = JSON.parse(sim.G("JSON.stringify(window._stats)"));
  if (st.tourServes < 20) return `only ${st.tourServes} serves in 3 days`;
  if ((st.seated || 0) < 5) return `only ${st.seated | 0} diners seated in 3 days`;
  // after close, every table should be clear - guests handled their own dishes
  const blocked = sim.G("BIZ.shack.tables.filter(t => t.dishes > 0 && !t.occupant).length");
  return blocked === 0 ? true : `${blocked} tables left with abandoned dishes`;
});

scenario("errands: crabs keep themselves fed", () => {
  const sim = createSim({ seed: 7 });
  sim.runDays(4);
  const st = JSON.parse(sim.G("JSON.stringify(window._stats)"));
  const fed = (st.crabServes || 0) + (st.staffMeals || 0);
  if (fed < 2) return `only ${fed} crab meals in 4 days (rage ${st.crabRage})`;
  const worstHunger = sim.G("Math.max(...crabs.map(c => c.p.hunger || 0))");
  return worstHunger < 1 ? true : `a crab is starving (hunger ${worstHunger})`;
});

scenario("staff meals: closing crew cooks their own dinner, at retail", () => {
  const sim = createSim({ seed: 17 });
  // organic path still works
  sim.runDays(3);
  const st = JSON.parse(sim.G("JSON.stringify(window._stats)"));
  if ((st.staffMeals || 0) < 1) return `no staff meal in 3 days (crabServes ${st.crabServes})`;
  // deterministic retail accounting: after settlement, one hungry broke-ish
  // crab self-cooks the cheapest item (juice: pay 10, ingredient fruit 3)
  sim.runUntil("tmin >= 20.6 * 60 && lastRentDay === day", {});
  sim.runUntil("customers.length === 0", { maxSteps: 60000 });   // lingering diners' tips would pollute the ledger
  // last-call lingering can keep the shack staffed past close: wait for a truly dark kitchen
  sim.runUntil('!allCrabs().some(k => k.duty && k.workBiz === "shack") && tmin >= 20.5 * 60 && tmin < 22.5 * 60', { maxSteps: 120000 });
  const before = JSON.parse(sim.G(`(() => {
    for (const c of crabs) { c.p.hunger = 0; c.errandCd = 999; c.p.sandy = 0; }
    const c = crabs[0];
    c.p.hunger = 0.9; c.p.wallet = 30; c.errandCd = 0;   // <40: cheapest recipe, deterministic
    // he may be mid-commute when we force this - park him at home so the
    // home-errand check is live inside tonight's town-awake window
    if (c.dayState !== "working") { c.dayState = "home"; }
    return JSON.stringify({ paid: window._stats.staffMealPaid || 0, cost: window._stats.staffMealCost || 0,
      meals: window._stats.staffMeals || 0 });
  })()`));
  const done = sim.runUntil(`(window._stats.staffMeals || 0) > ${before.meals}`, { maxSteps: 120000 });
  if (!done) return "forced staff meal never happened";
  const after = JSON.parse(sim.G(`JSON.stringify({ paid: window._stats.staffMealPaid || 0, cost: window._stats.staffMealCost || 0 })`));
  const meal = JSON.parse(sim.G('JSON.stringify(window._stats.lastStaffMeal)'));
  // event-scoped ledger: whatever they cooked rang at that item's retail; till funded its ingredients
  if (after.paid - before.paid !== meal.pay)
    return `meal (${meal.id}) rang up $${after.paid - before.paid}, expected retail ${meal.pay}`;
  if (after.cost - before.cost !== meal.cost)
    return `till paid $${after.cost - before.cost} ingredients, expected ${meal.cost}`;
  return true;
});

scenario("no wallet inflation: crew finances hold a bounded band", () => {
  for (const seed of [1337, 42]) {
    const sim = createSim({ seed });
    let worstMax = 0, worstMin = 1e9, lastDay = 0;
    sim.runDays(12, { onTick: (G) => {
      const t = G("tmin"), d = G("day");
      if (t >= 12 * 60 && t < 12 * 60 + 8 && G("coins") < 400) G("coins = 400");  // wages always flow
      if (t >= 21.5 * 60 && d !== lastDay) {
        lastDay = d;
        worstMax = Math.max(worstMax, G("Math.max(...crabs.map(c => c.p.wallet))"));
        worstMin = Math.min(worstMin, G("Math.min(...crabs.map(c => c.p.wallet))"));
      }
    }, tickEvery: 20 });
    if (worstMax >= 150) return `seed ${seed}: wallet hit ${Math.round(worstMax)} (inflation)`;
    if (worstMin <= -1) return `seed ${seed}: wallet went ${Math.round(worstMin)}`;
  }
  return true;
});

scenario("no crab freezes mid-walk (baseline)", () => {
  const sim = createSim({ seed: 1337 });
  const det = stuckDetector(sim);
  sim.runDays(4, { onTick: det.tick, tickEvery: 20 });
  return det.worstSeconds < 18 ? true : `a crab froze ~${det.worstSeconds}s in a moving state`;
});

scenario("no crab freezes mid-walk (full town)", () => {
  const sim = createSim({ seed: 4242 });
  sim.G(`coins = 3000; tryBuy("cleaners"); tryBuy("arcade"); tryBuy("chef"); tryBuy("chef");
    crabs[2].p.job = "cleaners"; crabs[3].p.job = "arcade";`);
  const det = stuckDetector(sim);
  sim.runDays(5, { onTick: det.tick, tickEvery: 20 });
  return det.worstSeconds < 18 ? true : `a crab froze ~${det.worstSeconds}s in a moving state`;
});

scenario("fast-forward (6x dt) stays stable", () => {
  const sim = createSim({ seed: 55 });
  sim.G("ffMode = 3");   // the real in-game top speed: dt = 0.1 * 6
  const det = stuckDetector(sim);
  sim.runDays(3, { step: 100, onTick: det.tick, tickEvery: 10 });
  const st = JSON.parse(sim.G("JSON.stringify(window._stats)"));
  if (st.tourServes < 15) return `only ${st.tourServes} serves at 3x dt`;
  return det.worstSeconds < 18 ? true : `a crab froze ~${det.worstSeconds}s at 3x dt`;
});

scenario("homeless: eviction to shelter and back", () => {
  const sim = createSim({ seed: 11 });
  sim.runUntil("tmin > 12 * 60", {});
  sim.G("coins = 500; crabs[1].p.wallet = -15;");   // deep enough that the wage cannot cover rent
  sim.runUntil("lastRentDay === day", {});
  if (!sim.G("crabs[1].p.homeless")) return "broke crab did not move to shelter";
  sim.G("crabs[1].p.wallet = 80;");
  sim.runUntil("day >= 3 && lastRentDay === day", {});
  return sim.G("!crabs[1].p.homeless") ? true : "crab with $80 never moved back into a house";
});

scenario("mid-shift job toggle is safe", () => {
  const sim = createSim({ seed: 21 });
  sim.G('coins = 2000; tryBuy("cleaners");');
  sim.runUntil('crabs[0].dayState === "working"', {});
  sim.G('crabs[0].p.job = "cleaners";');   // toggle while cooking
  sim.runDays(2);
  return sim.G("gameOver") === false || sim.G("day") > 1 ? true : "sim broke after mid-shift toggle";
});

scenario("disease: sustained neglect breeds sickness", () => {
  const sim = createSim({ seed: 71 });
  // pin needs at max moments before each settlement (errands would otherwise
  // un-pin them during the day)
  for (let d = 0; d < 6; d++) {
    sim.runUntil("tmin >= 19.9 * 60 && lastRentDay !== day", { maxSteps: 80000 });
    sim.G('for (const c of crabs) { c.p.hunger = 1; c.p.dirt = 1; c.p.sandy = 1; }');
    sim.runUntil("lastRentDay === day", { maxSteps: 20000 });
    if (sim.G("gameOver")) break;
    if (sim.G("crabs.some(c => c.p.sick) || (window._stats.deaths || 0) > 0")) return true;
    sim.runUntil("tmin < 10", { maxSteps: 40000 });
    if (sim.G("gameOver")) break;
  }
  return sim.G("crabs.some(c => c.p.sick) || (window._stats.deaths || 0) > 0")
    ? true : "no crab fell ill after 6 nights of maxed neglect";
});

scenario("disease: care cures, neglect can kill", () => {
  // cared-for sick crab recovers across a few nights on most seeds
  let recovered = 0, died = 0;
  for (const seed of [3, 5, 8, 13, 21, 34]) {
    const sim = createSim({ seed });
    sim.runUntil("tmin > 10 * 60", {});
    sim.G('crabs[0].p.sick = { days: 0 }; crabs[0].p.hunger = 0; crabs[0].p.dirt = 0;');
    for (let d = 0; d < 5 && !sim.G("gameOver"); d++) {
      sim.G('if (coins < 400) coins = 600;');   // testing cure odds, not solvency (a lone founder down = knife-edge till)
      sim.runUntil("lastRentDay === day", {});
      sim.G('if (crabs[0] && crabs[0].p.sick) { crabs[0].p.hunger = 0; crabs[0].p.dirt = 0; }');
      sim.runUntil("tmin < 10", { maxSteps: 40000 });
      if (sim.G("crabs[0] && !crabs[0].p.sick")) { recovered++; break; }
    }
    // neglected sick crab: pin needs high, expect death sometimes
    const sim2 = createSim({ seed: seed + 100 });
    sim2.runUntil("tmin > 10 * 60", {});
    sim2.G('crabs[1].p.sick = { days: 2 }; crabs[1].p.hunger = 1; crabs[1].p.dirt = 1;');
    for (let d = 0; d < 9 && !sim2.G("gameOver"); d++) {
      sim2.G('if (coins < 400) coins = 600;');   // testing mortality, not solvency
      sim2.runUntil("lastRentDay === day", {});
      sim2.G('{ const k = crabs.find(c => c.p.sick); if (k) { k.p.hunger = 1; k.p.dirt = 1; } }');
      sim2.runUntil("tmin < 10", { maxSteps: 40000 });
      if (sim2.G("(window._stats.deaths || 0) > 0")) { died++; break; }
    }
  }
  if (recovered < 4) return `only ${recovered}/6 cared-for crabs recovered within 5 nights`;
  if (died < 1) return `no neglected sick crab died across 6 seeds (memorials should exist)`;
  return true;
});

scenario("showers: guests occupy stalls, staff turn them over", () => {
  const sim = createSim({ seed: 23 });
  sim.runDays(3);
  const st = JSON.parse(sim.G("JSON.stringify(window._stats)"));
  if ((st.showersDone || 0) < 3) return `only ${st.showersDone | 0} completed showers in 3 days`;
  if ((st.stallsCleaned || 0) < 2) return `only ${st.stallsCleaned | 0} stalls cleaned in 3 days`;
  const wedged = sim.G("BIZ.showers.stalls.filter(t => t.dirty && !t.cleaning).length");
  return wedged <= 2 ? true : `${wedged} stalls left permanently dirty`;
});

scenario("save/load roundtrip preserves state", () => {
  const store = new Map();
  const a = createSim({ seed: 31, storage: store, fresh: false });
  a.runDays(2);
  const before = a.G(`JSON.stringify({ c: Math.round(coins), d: day, n: crabs.length, names: crabs.map(c => c.p.name) })`);
  a.G("save()");
  const b = createSim({ seed: 32, storage: store, fresh: false });
  const after = b.G(`JSON.stringify({ c: Math.round(coins), d: day, n: crabs.length, names: crabs.map(c => c.p.name) })`);
  return before === after ? true : `mismatch: ${before} vs ${after}`;
});

scenario("npc: SUDSY runs her showers, player books untouched", () => {
  const sim = createSim({ seed: 77 });
  const coins0 = sim.G("Math.round(coins)");
  sim.runDays(3);
  const st = JSON.parse(sim.G("JSON.stringify(window._stats)"));
  if (!st.npcServes || st.npcServes < 1) return "SUDSY served nobody in 3 days";
  const till = sim.G("OWNERS.sudsy.till");
  if (!isFinite(till)) return "SUDSY till is " + till;
  if (!st.npcEarn || st.npcEarn <= 0) return "no NPC earnings recorded";
  // her serves must not have entered the player's income history
  const histNpc = sim.G("earnHist.filter(e => e.npc).length");
  return histNpc === 0 ? true : "NPC serves leaked into player earnHist";
});

scenario("npc: crew shower errand (sandy resets, fee to SUDSY)", () => {
  const sim = createSim({ seed: 88 });
  sim.runUntil('crabs[0].dayState === "home" && tmin > 14 * 60', {});
  const till0 = sim.G("OWNERS.sudsy.till");
  sim.G("crabs[0].p.sandy = 0.9; crabs[0].p.wallet = 60; crabs[0].errandCd = 0;");
  const ok = sim.runUntil("(crabs[0].p.sandy || 0) === 0", { maxSteps: 40000 });
  if (!ok) return "sandy never reset (errand incomplete)";
  const wallet = sim.G("crabs[0].p.wallet");
  const till1 = sim.G("OWNERS.sudsy.till");
  if (wallet >= 60) return "wallet did not pay the fee";
  return till1 > till0 - 35 ? true : "SUDSY till fell unexpectedly: " + till0 + " -> " + till1;
});

scenario("npc: SUDSY dines at the player shack", () => {
  const sim = createSim({ seed: 66 });
  // this tests SUDSY's behavior, not player survival: keep the town solvent
  sim.runDays(5, { onTick: (G) => { if (G("coins") < 300) G("coins = 500"); }, tickEvery: 40 });
  const st = JSON.parse(sim.G("JSON.stringify(window._stats)"));
  return st.npcSpendAtPlayer >= 1 ? true
    : "SUDSY never bought food at the shack in 5 days (hunger " + sim.G("npcs[0].p.hunger").toFixed(2) + ", wallet " + sim.G("Math.round(npcs[0].p.wallet)") + ")";
});

scenario("housing: npcs sleep at the shelter, then move up", () => {
  const sim = createSim({ seed: 31 });
  // fresh town: all three townsfolk start at the shelter, no nooks
  const flags = JSON.parse(sim.G("JSON.stringify(npcs.map(c => [c.p.name, !!c.p.homeless, c.p.homeX || 0]))"));
  for (const [name, homeless, nook] of flags) {
    if (!homeless) return name + " started housed";
    if (nook) return name + " still has a nook homeX";
  }
  // at midnight everyone homeless is bedded down at the shelter
  sim.runUntil("tmin >= 23.8 * 60", { maxSteps: 400000 });
  const spots = JSON.parse(sim.G("JSON.stringify(allCrabs().filter(c => c.p.homeless && c.cstate === 'none').map(c => [c.p.name, Math.round(c.x)]))"));
  for (const [name, x] of spots)
    if (Math.abs(x - 470) > 60) return name + " slept at x=" + x + ", not the shelter";
  // a flush SUDSY rents a house at the next settlement
  sim.G("npcs[0].p.wallet = 120");
  sim.runUntil("day >= 2 && tmin > 10", { maxSteps: 400000, onTick: (G) => { if (G("coins") < 200) G("coins = 400"); }, tickEvery: 50 });
  if (sim.G("npcs[0].p.homeless")) return "SUDSY stayed homeless with $120 (wallet now " + sim.G("Math.round(npcs[0].p.wallet)") + ")";
  const h = sim.G("npcs[0].p.house");
  const clash = sim.G(`allCrabs().filter(c => !c.p.homeless && c.p.house === ${h}).length`);
  return clash === 1 ? true : "house " + h + " has " + clash + " tenants";
});

scenario("sick crabs can still wash (mobility + cure path)", () => {
  const sim = createSim({ seed: 88 });
  sim.runUntil('crabs[0].dayState === "home" && tmin > 13 * 60', {});
  sim.G("crabs[0].p.sick = { days: 0 }; crabs[0].p.sandy = 0.9; crabs[0].p.dirt = 0.5; crabs[0].p.wallet = 60; crabs[0].errandCd = 0;");
  const ok = sim.runUntil("(crabs[0].p.sandy || 0) === 0", { maxSteps: 60000,
    // isolate mobility: no snack detours, no midnight recovery roll ending the illness
    onTick: (G) => { G("crabs[0].p.hunger = 0.2; if (!crabs[0].p.sick) crabs[0].p.sick = { days: 1 }"); } });
  return ok ? true : "sick crab never reached the showers (sandy " + sim.G("crabs[0].p.sandy").toFixed(2) + ", state " + sim.G("crabs[0].dayState") + ")";
});

scenario("needs bite: needy crew serve measurably fewer dishes", () => {
  // crabEff: a well-kept crab works at 1.0; hunger past 0.5 and dirt past 0.6
  // slow station prep + kitchen hustle. Pin the crew both ways and compare
  // paying dishes served over the same 5 days (rep pinned so demand is equal,
  // sickness cleared so only the efficiency channel differs).
  const sim0 = createSim({ seed: 1 });
  const effs = JSON.parse(sim0.G(`JSON.stringify([
    crabEff({p:{hunger:0,dirt:0}}), crabEff({p:{hunger:1,dirt:0}}),
    crabEff({p:{hunger:0,dirt:1}}), crabEff({p:{hunger:1,dirt:1}})])`));
  if (effs[0] !== 1) return `well-kept eff ${effs[0]}, expected 1.0`;
  if (!near(effs[1], 0.78, 0.86)) return `starving eff ${effs[1]}, expected ~0.82`;
  if (!near(effs[2], 0.90, 0.97)) return `filthy eff ${effs[2]}, expected ~0.94`;
  if (!near(effs[3], 0.72, 0.80)) return `rock-bottom eff ${effs[3]}, expected ~0.76`;
  const serve = (seed, needy) => {
    const sim = createSim({ seed });
    const pin = `for (const c of crabs) { c.p.hunger = ${needy ? 1 : 0}; c.p.dirt = ${needy ? 1 : 0};
      c.p.bored = 0; c.p.sandy = 0; c.p.sick = null; } rep = 90;`;
    sim.runDays(5, { onTick: (G) => G(pin) });
    return sim.G("window._stats.tourServes");
  };
  let kept = 0, needy = 0;
  for (const seed of [1337, 42]) { kept += serve(seed, false); needy += serve(seed, true); }
  if (kept < 100) return `well-kept crew only served ${kept} dishes over 2x5 days - demand broke?`;
  return needy < kept * 0.85 ? true
    : `needy crew served ${needy} vs well-kept ${kept} - impairment not visible (need <85%)`;
});

// ---- runner
const filters = process.argv.slice(2);
const list = filters.length ? results.filter(r => filters.some(f => r.name.includes(f))) : results;
let pass = 0, fail = 0;
const t0 = Date.now();
for (const { name, fn } of list) {
  const s = Date.now();
  let out;
  try { out = fn(); } catch (e) { out = "EXCEPTION: " + (e.stack || e).toString().split("\n")[0]; }
  const ms = Date.now() - s;
  if (out === true) { pass++; console.log(`  PASS  ${name} (${ms}ms)`); }
  else { fail++; console.log(`  FAIL  ${name} (${ms}ms)\n        ${out}`); }
}
console.log(`\n${pass}/${pass + fail} passed in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
process.exit(fail ? 1 : 0);
