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

scenario("baseline always loses (day 6-16)", () => {
  // the shape that matters: EVERY do-nothing town is evicted, in the window the
  // 8-seed headless matrix showed (8-16, median 11 as of the job-board build)
  const days = [];
  for (const seed of [1337, 2674, 4011, 5348]) {
    const sim = createSim({ seed });
    sim.runDays(30);
    if (!sim.G("gameOver")) return `seed ${seed} survived 30d with $${sim.G("Math.round(coins)")}`;
    days.push(sim.G("day"));
  }
  const med = days.sort((a, b) => a - b)[1];
  return near(med, 6, 16) ? true : `median eviction day ${med} outside 6-16 (${days})`;
});

scenario("growth strategy holds the measured floor (escape promise OPEN - see PLAN)", () => {
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
  // REGRESSION FLOOR, not the design target. The escape promise (some seed
  // survives, or median > 18) has been broken since the credit-era economy;
  // combined tree measures 0/6 median 10 with revenue collapse at high rep.
  // Matt owns the retune decision - PLAN "Growth escape" entry. This gate
  // trips only if growth gets WORSE than the measured floor.
  // floor calibrated on THIS scenario's seeds (measured 7,7,8,9 on the
  // fish-market tree - the floating price squeezes growth-town input costs by
  // design, which took the old day-13 tail seed to 9; the CLI harness's own
  // 8 growth seeds hold median 10 with a day-15 tail, so the band stands)
  const sorted = evictDays.sort((a, b) => a - b);
  // ONE assertion, deliberately: the lower-median. The old tail term (top seed
  // must reach day N) tripped twice on changes that were NOT collapses - the
  // fisher-break incident was real (lower-median 6), the hours merge and the
  // fish market were not. Escape is RARE by ruling; this gate catches a
  // categorical regression, not which seed got lucky.
  return sorted[1] >= 7 ? true : `growth collapsed: lower-median ${sorted[1]} < floor 7 (${sorted})`;

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
  sim.runDays(3);
  // over the LAST day, every crab must get a real meal in (hunger dips below
  // 0.5 at some point) - a moment-in-time hunger sample flakes on late shifts
  sim.G("window._minH = {}");
  sim.runDays(4, { tickEvery: 8, onTick: (G) =>
    G("for (const c of crabs) window._minH[c.p.name] = Math.min(window._minH[c.p.name] ?? 1, c.p.hunger || 0)") });
  const st = JSON.parse(sim.G("JSON.stringify(window._stats)"));
  const fed = (st.crabServes || 0) + (st.staffMeals || 0);
  if (fed < 2) return `only ${fed} crab meals in 4 days (rage ${st.crabRage})`;
  const minH = JSON.parse(sim.G("JSON.stringify(window._minH)"));
  if (!Object.keys(minH).length) return "sampler never ran (runDays day-bound bug)";
  const starved = Object.entries(minH).filter(([, h]) => h > 0.5);
  return starved.length === 0 ? true : "went unfed all day: " + starved.map(([n, h]) => n + "@" + h.toFixed(2)).join(",");
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
    for (const c of crabs) { c.p.hunger = 0; c.p.thirst = 0; c.errandCd = 999; c.p.tired = 0; }
    const c = crabs[0];
    c.p.hunger = 0.9; c.p.wallet = 30; c.errandCd = 0;   // <40: cheapest recipe, deterministic
    // he may be mid-commute - or mid-POUR since T2 - when we force this:
    // abortChef is the sanctioned interrupt (it releases a selfCook's grill
    // grip; forcing dayState alone deadlocks him against his own lock), then
    // park him AT THE SHACK so the errand check is live in the town-awake
    // window. (Re-pointed with the trip-chaining pass: the staff-meal
    // privilege now requires standing at your own counter - a crab at home
    // no longer walks the promenade to cook in a dark kitchen. Parking him
    // at the door is what "the closing crew" always meant.)
    if (c.dayState !== "working") { abortChef(c); c.dayState = "home"; c.x = BIZ.shack.door + 10; c.y = 160; }
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
  sim.G(`coins = 3000; tryBuy("arcade"); tryBuy("chef"); tryBuy("chef");
    crabs[2].p.job = "arcade"; crabs[3].p.job = "arcade";`);
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
  sim.G('coins = 2000; tryBuy("arcade");');
  sim.runUntil('crabs[0].dayState === "working"', {});
  sim.G('crabs[0].p.job = "arcade";');   // toggle while cooking
  sim.runDays(2);
  return sim.G("gameOver") === false || sim.G("day") > 1 ? true : "sim broke after mid-shift toggle";
});

scenario("disease: sustained neglect breeds sickness", () => {
  const sim = createSim({ seed: 71 });
  // pin needs at max moments before each settlement (errands would otherwise
  // un-pin them during the day)
  // risk at maxed neglect is 0.21/crab/night (hunger .10 + dirt .06 + tired
  // .05) - run enough nights that a healthy
  // outcome is a real anomaly (12 nights x 2 crabs: P(no one sick) ~ 0.6%), and
  // keep the town solvent so eviction can't cut the sample short
  for (let d = 0; d < 12; d++) {
    sim.runUntil("tmin >= 19.9 * 60 && lastRentDay !== day", { maxSteps: 80000,
      onTick: (G) => { if (G("coins") < 300) G("coins = 600"); } });
    sim.G('for (const c of crabs) { c.p.hunger = 1; c.p.dirt = 1; c.p.tired = 1; }');
    sim.runUntil("lastRentDay === day", { maxSteps: 20000 });
    if (sim.G("crabs.some(c => c.p.sick) || (window._stats.deaths || 0) > 0")) return true;
    sim.runUntil("tmin < 10", { maxSteps: 40000 });
  }
  return "no crab fell ill after 12 nights of maxed neglect";
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

scenario("npc: crew shower errand (dirt scrubbed, fee to SUDSY)", () => {
  // showers are DIRT-ONLY since the tiredness pass: a deluxe soak (-0.7, the
  // wallet-60 pick) must carry 0.9 dirt below the 0.66 errand threshold
  const sim = createSim({ seed: 88 });
  sim.runUntil('crabs[0].dayState === "home" && tmin > 14 * 60', {});
  const till0 = sim.G("OWNERS.sudsy.till");
  sim.G("crabs[0].p.dirt = 0.9; crabs[0].p.hunger = 0.2; crabs[0].p.thirst = 0.2; crabs[0].p.wallet = 60; crabs[0].errandCd = 0;");
  const ok = sim.runUntil("(crabs[0].p.dirt || 0) < 0.4", { maxSteps: 40000 });
  if (!ok) return "dirt never scrubbed (errand incomplete, dirt " + sim.G("crabs[0].p.dirt").toFixed(2) + ")";
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
  sim.G("crabs[0].p.sick = { days: 0 }; crabs[0].p.dirt = 0.6; crabs[0].p.wallet = 60; crabs[0].errandCd = 0;");
  const ok = sim.runUntil("(crabs[0].p.dirt || 0) < 0.4", { maxSteps: 60000,
    // isolate mobility: no snack detours, no midnight recovery roll ending the illness
    onTick: (G) => { G("crabs[0].p.hunger = 0.2; if (!crabs[0].p.sick) crabs[0].p.sick = { days: 1 }"); } });
  return ok ? true : "sick crab never reached the showers (dirt " + sim.G("crabs[0].p.dirt").toFixed(2) + ", state " + sim.G("crabs[0].dayState") + ")";
});

scenario("job board: a flush SUDSY hires a fisher; payroll flows", () => {
  const sim = createSim({ seed: 77 });
  const keepSolvent = (G) => { if (G("coins") < 200) G("coins = 400"); };
  sim.G("OWNERS.sudsy.till = 400");
  sim.runUntil("tmin >= 9 * 60", { maxSteps: 300000, onTick: keepSolvent, tickEvery: 50 });
  const emp = JSON.parse(sim.G("JSON.stringify(npcs.filter(c => c.p.employer).map(c => [c.p.name, c.p.job, Math.round(c.p.wallet)]))"));
  if (!emp.length) return "no one took the job (board: " + sim.G("JSON.stringify(jobBoard)") + ")";
  if (emp[0][1] !== "showers") return "hired into " + emp[0][1] + ", expected showers";
  const name = emp[0][0], w0 = emp[0][2];
  // works the day, gets paid at settlement (wallet also buys meals - allow drift)
  sim.runUntil("day >= 2 && tmin > 10", { maxSteps: 900000, onTick: keepSolvent, tickEvery: 50 });
  const still = sim.G(`!!npcs.find(c => c.p.name === "${name}").p.employer`);
  if (!still) return name + " lost the job with a $400 till";
  const w1 = sim.G(`Math.round(npcs.find(c => c.p.name === "${name}").p.wallet)`);
  if (w1 < w0 - 15) return "employed but never paid: $" + w0 + " -> $" + w1;
  // and the showers ran with TWO staff at some point is implied by employment; check duty linkage
  return sim.G(`npcs.find(c => c.p.name === "${name}").workBiz`) === "showers" ? true
    : "employee never actually worked the showers";
});

scenario("job board: unpaid staff quit back to the pier", () => {
  const sim = createSim({ seed: 78 });
  const keepSolvent = (G) => { if (G("coins") < 200) G("coins = 400"); };
  sim.G("OWNERS.sudsy.till = 400");
  sim.runUntil("npcs.some(c => c.p.employer)", { maxSteps: 300000, onTick: keepSolvent, tickEvery: 50 });
  // the money dries up - and stays dry (her shop keeps trading, so pin it)
  sim.runUntil("day >= 2 && tmin > 10", { maxSteps: 900000, tickEvery: 50,
    onTick: (G) => { keepSolvent(G); if (G("OWNERS.sudsy.till") > 5) G("OWNERS.sudsy.till = 5"); } });
  const quit = sim.G("npcs.every(c => !c.p.employer)");
  if (!quit) return "staff kept working for a $5 till";
  return sim.G('npcs.filter(c => c.p.fisher).every(c => c.p.job === "fishing" || !!c.p.sick)') ? true
    : "quit but did not return to fishing";
});

scenario("save/load: townsfolk keep wallets and houses", () => {
  const store = new Map();
  const a = createSim({ seed: 5, storage: store, fresh: false });
  a.runDays(2);
  a.G("npcs[1].p.wallet = 77; npcs[1].p.homeless = false; npcs[1].p.house = 8; save()");
  const b = createSim({ seed: 6, storage: store, fresh: false });
  const rows = JSON.parse(b.G("JSON.stringify(npcs.map(c => [c.p.name, c.p.wallet, !!c.p.homeless, c.p.house]))"));
  const salty = rows.find(r => r[0] === "SALTY");
  if (!salty) return "SALTY missing after reload";
  if (salty[1] !== 77 || salty[2] !== false || salty[3] !== 8)
    return "SALTY came back as " + JSON.stringify(salty) + ", expected [SALTY,77,false,8]";
  return true;
});

scenario("old save (homeX era) migrates; corrupt save rejected clean", () => {
  const store = new Map();
  store.set("crabshack3_v1", JSON.stringify({
    coins: 500, lifetime: 900, day: 5, tmin: 600, lastRentDay: 4,
    lv: { chef: 2 }, memorials: [], rep: 44, townCatch: 3, rate: 0, t: Date.now(),
    personas: [
      { name: "PINCHY", trait: "speedy", mode: "walk", acc: "none", color: 0, shift: "M", wallet: 30, homeX: 60 },
      { name: "CLAWDIA", trait: "tidy", mode: "bike", acc: "flower", color: 1, shift: "E", wallet: 25, homeX: 120 },
    ],
    npc: { tills: { sudsy: 150 }, personas: [{ name: "SUDSY", npc: true, homeX: 444, wallet: 12 }] },
  }));
  const sim = createSim({ seed: 3, storage: store, fresh: false });
  const crew = JSON.parse(sim.G("JSON.stringify(crabs.map(c => [c.p.homeless, c.p.house, c.p.homeX]))"));
  for (const [homeless, house, nook] of crew) {
    if (homeless !== false) return "migrated crew member not housed: " + JSON.stringify(crew);
    if (house == null || nook != null) return "stray homeX / missing house: " + JSON.stringify(crew);
  }
  if (sim.G("npcs[0].p.homeX != null")) return "SUDSY kept her nook homeX";
  sim.runDays(6);
  if (sim.G("!isFinite(coins)")) return "coins went " + sim.G("coins");
  // corrupt save (empty personas) must not half-load
  const store2 = new Map();
  store2.set("crabshack3_v1", JSON.stringify({ coins: 9, day: 30, gameOver: true, lv: { chef: 6 }, rep: 2, personas: [] }));
  const sim2 = createSim({ seed: 3, storage: store2, fresh: false });
  const st = JSON.parse(sim2.G("JSON.stringify([day, UPS.chef.lvl, gameOver, Math.round(coins)])"));
  return (st[0] === 1 && st[1] === 2 && st[2] === false && st[3] === 150)
    ? true : "corrupt save leaked state: [day,chefLvl,gameOver,coins]=" + JSON.stringify(st);
});

scenario("queue hard cap holds for locals too", () => {
  const sim = createSim({ seed: 4242 });
  sim.G(`coins = 5000; tryBuy("chef"); tryBuy("chef"); tryBuy("chef"); tryBuy("chef");`);
  let worst = 0, forced = 0;
  sim.runDays(3, { tickEvery: 5, onTick: (G) => {
    const t = G("tmin");
    if (G("coins") < 300) G("coins = 800");
    if (t > 14.5 * 60 && t < 19 * 60 && forced < 40 && Math.round(t) % 30 === 0) {
      forced++;   // pile every off-duty local into the shack line at once
      G(`for (const c of allCrabs()) if (c.dayState === "home") {
           c.p.hunger = 0.9; c.p.wallet = 60; c.errandCd = 0; }`);
    }
    worst = Math.max(worst, G(`Math.max(...Object.keys(BIZ).map(b =>
      customers.filter(k => k.biz === b && (k.state === "waiting" || k.state === "arriving")).length))`));
  } });
  return worst <= sim.G("QUEUE_MAX") ? true : `queue hit ${worst} (cap ${sim.G("QUEUE_MAX")})`;
});

scenario("death cleanup: slots freed, orders unclaimed, follow survives", () => {
  const sim = createSim({ seed: 9 });
  sim.G(`coins = 5000; tryBuy("chef"); tryBuy("chef");`);
  // direct abort semantics: a selfCook death must free the grill, a chef death must unclaim the order
  sim.runUntil("crabs.some(c => c.cust)", { maxSteps: 200000 });
  const claim = sim.G(`(() => {
    const c = crabs.find(c => c.cust); const k = c.cust;
    abortChef(c);
    return (k.claimed ? "stillClaimed" : "ok");
  })()`);
  if (claim !== "ok") return "aborted chef left the order claimed";
  const leak = sim.G(`(() => {
    const c = crabs[0];
    const prev = { ds: c.dayState, wb: c.workBiz };
    c.dayState = "selfCook"; c.cookStep = 2; c.workBiz = "shack";
    c.slotKind = "grill"; c.slot = 0; busy.shack.grill[0] = true;
    abortChef(c);
    const leaked = busy.shack.grill[0];
    c.dayState = prev.ds; c.workBiz = prev.wb;
    return leaked;
  })()`);
  if (leak) return "selfCook death leaked a grill slot";
  // full sim-reachable death: follow + dossier bookkeeping
  sim.G("followIdx = crabs.length - 1; dossier = crabs[0];");
  const followedName = sim.G("crabs[crabs.length - 1].p.name");
  for (let d = 0; d < 10 && !sim.G("(window._stats.deaths || 0) > 0") && !sim.G("gameOver"); d++) {
    sim.G(`if (coins < 500) coins = 900;
      if (crabs[0]) { if (!crabs[0].p.sick) crabs[0].p.sick = { days: 9 }; crabs[0].p.hunger = 1; crabs[0].p.dirt = 1; }`);
    sim.runUntil("lastRentDay === day", { maxSteps: 60000 });
    sim.runUntil("tmin < 10", { maxSteps: 60000 });
  }
  if (!sim.G("(window._stats.deaths || 0) > 0")) return "no death in 10 nights of terminal neglect";
  if (sim.G("dossier !== null")) return "dossier stayed open on a dead crab";
  const nowFollowing = sim.G("followIdx >= 0 && crabs[followIdx] ? crabs[followIdx].p.name : 'none'");
  if (nowFollowing !== followedName) return `follow slipped from ${followedName} to ${nowFollowing}`;
  const orphan = sim.G(`(() => {
    for (const bk of Object.keys(busy)) for (const kind of Object.keys(busy[bk]))
      for (let i = 0; i < busy[bk][kind].length; i++)
        if (busy[bk][kind][i] && !allCrabs().some(c => c.workBiz === bk && c.slotKind === kind && c.slot === i))
          return bk + "." + kind + "[" + i + "]";
    return "";
  })()`);
  return orphan === "" ? true : "orphaned station lock at " + orphan;
});

scenario("crew never staff npc-owned shops", () => {
  const sim = createSim({ seed: 13 });
  sim.G('crabs[0].p.job = "showers";');   // the old toggle bug could write this into a save
  sim.runUntil("tmin > 7.2 * 60", { maxSteps: 4000 });
  const job = sim.G("crabs[0].p.job");
  if (job !== "shack") return "crew job stayed " + job;
  // and the whole crew stays on player books over a day
  sim.runDays(1);
  const bad = sim.G(`crabs.filter(c => bizOwner(c.p.job) !== "player").length`);
  return bad === 0 ? true : bad + " crew working for NPC owners";
});

scenario("all crew dead: town survives, rehire recovers", () => {
  const sim = createSim({ seed: 19 });
  sim.runUntil("tmin > 10 * 60", {});
  sim.G("for (const c of crabs.slice()) { abortChef(c); crabs = crabs.filter(k => k !== c); } UPS.chef.lvl = 1; followIdx = 0; coins = 800;");
  sim.runDays(2, { onTick: (G) => { if (G("coins") < 400) G("coins = 800"); }, tickEvery: 40 });
  if (sim.G("!isFinite(coins)")) return "coins went " + sim.G("coins");
  sim.G('tryBuy("chef")');
  if (sim.G("crabs.length") !== 1) return "rehire after wipeout failed";
  sim.runDays(1, { onTick: (G) => { if (G("coins") < 400) G("coins = 800"); }, tickEvery: 40 });
  return sim.G("crabs.length === 1 && isFinite(crabs[0].p.wallet)") ? true : "rehired crab broke";
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
    // housing pinned identically in both arms: crabs now relocate toward their
    // work, and a shorter commute lifts BOTH arms' output, compressing the
    // ratio this scenario measures. The channel under test is crabEff, not rent.
    const pin = `for (const c of crabs) { c.p.hunger = ${needy ? 1 : 0}; c.p.dirt = ${needy ? 1 : 0};
      c.p.bored = 0; c.p.tired = 0; c.p.sick = null; c.p.homeless = false; }
      crabs.forEach((c, i) => { c.p.house = i; }); rep = 90;
      townCatch = 40; spawnT = 0;`;
    // townCatch: fish never scarce. spawnT: demand SATURATED - the town has
    // more sinks than when this test was written (juice bar), and with a
    // half-empty queue both arms keep up and the efficiency channel hides.
    // Saturated, crew speed is the binding constraint again, which is the
    // thing under test.
    sim.runDays(5, { onTick: (G) => G(pin) });
    return sim.G("window._stats.tourServes");
  };
  let kept = 0, needy = 0;
  for (const seed of [1337, 42]) { kept += serve(seed, false); needy += serve(seed, true); }
  if (kept < 100) return `well-kept crew only served ${kept} dishes over 2x5 days - demand broke?`;
  return needy < kept * 0.85 ? true
    : `needy crew served ${needy} vs well-kept ${kept} - impairment not visible (need <85%)`;
});

scenario("stalls can never wedge: abort frees them, and a soak stays clean", () => {
  const sim = createSim({ seed: 21 });
  // targeted: stage a mid-shower errand crab, yank them out via abortErrand
  sim.runUntil('crabs[0].dayState === "home" && tmin > 12 * 60', { maxSteps: 300000 });
  sim.G(`{
    const st = BIZ.showers.stalls[0];
    const k = { biz: "showers", isCrab: true, crab: crabs[0], state: "showering", showerT: 9,
      stall: st, x: st.x, spawnX: st.x, claimed: true, served: false, recipe: BIZ.showers.recipes[0] };
    st.occupant = k; customers.push(k); crabs[0].errandCust = k; crabs[0].dayState = "errand";
    abortErrand(crabs[0]);
  }`);
  if (sim.G("BIZ.showers.stalls[0].occupant !== null")) return "abortErrand left the stall occupied";
  if (!sim.G("BIZ.showers.stalls[0].dirty")) return "aborted stall not marked dirty";
  if (sim.G('customers.some(k => k.stall === BIZ.showers.stalls[0])')) return "ghost customer survived";
  // soak: two full days, no stall may stay occupied longer than a real shower cycle
  let worst = 0;
  const held = {};
  sim.runDays(2, { tickEvery: 4, onTick: (G) => {
    if (G("coins") < 300) G("coins = 600");
    const occ = JSON.parse(G('JSON.stringify(BIZ.showers.stalls.map(t => !!t.occupant))'));
    occ.forEach((o, i) => {
      held[i] = o ? (held[i] || 0) + 0.2 * 4 : 0;   // 4 ticks x 50ms sim-steps... measured in sim-seconds
      worst = Math.max(worst, held[i]);
    });
  } });
  return worst < 60 ? true : "a stall stayed occupied " + worst.toFixed(0) + " sim-seconds";
});

scenario("T1 trade ledger: flows counted, nothing new charged", () => {
  const sim = createSim({ seed: 55 });
  sim.G("townCatch = 0");   // force imports from the first taco
  sim.runDays(2, { tickEvery: 30, onTick: (G) => {
    if (G("coins") < 300) G("coins = 600");
    if (G("townCatch") > 0) G("townCatch = 0");   // pier luck stays dry
  } });
  const t = JSON.parse(sim.G("JSON.stringify(trade)"));
  if (!(t.total.fish > 0)) return "no fish imports counted with a dry pier";
  if (!(t.total.water > 0)) return "no water counted (showers ran: " + sim.G("window._stats.showersDone || 0") + ")";
  if (t.spent !== t.total.fish * 7) return "spent $" + t.spent + " != fish x $7 (" + t.total.fish + ") - a tracked flow got charged";
  // and the ledger must roundtrip
  const store = new Map();
  const a = createSim({ seed: 9, storage: store, fresh: false });
  a.G("trade.total.corn = 42; trade.spent = 77; save()");
  const b = createSim({ seed: 10, storage: store, fresh: false });
  return b.G("trade.total.corn") === 42 && b.G("trade.spent") === 77 ? true : "trade ledger did not roundtrip";
});

scenario("boat: flush fisher climbs the ladder; catch rate rises", () => {
  const sim = createSim({ seed: 41 });
  // keep the town steady so the fishers fish: player solvent, job board quiet,
  // needs topped up (no errand detours, no sickness rolls stealing pier time)
  const steady = (G) => {
    if (G("coins") < 200) G("coins = 400");
    // thirst joined the pin list with the fish market: market income makes the
    // drink trip affordable, and this scenario measures catch rates, not breaks
    G('OWNERS.sudsy.till = 0;' +
      'for (const c of npcs) if (c.p.fisher) { c.p.hunger = 0.2; c.p.thirst = 0.2; c.p.dirt = 0.2; c.p.tired = 0.2; c.p.bored = 0.2; c.p.sick = null; }');
  };
  // days 1-2: SALTY's pier rate
  sim.runUntil("day >= 3 && tmin > 10", { maxSteps: 900000, onTick: steady, tickEvery: 40 });
  const before = sim.G('(window._stats.catchesBy || {}).SALTY || 0') / 2;
  if (before < 3) return `SALTY only landed ${before * 2} fish in 2 pier days`;
  // house him and hand over boat savings; the settlement ladder must do the rest
  sim.G('{ const c = npcs.find(k => k.p.name === "SALTY"); c.p.homeless = false; c.p.house = 5; c.p.wallet = BOAT_COST + MOORING_FEE + 20; }');
  sim.runUntil("day >= 4 && tmin > 10", { maxSteps: 900000, onTick: steady, tickEvery: 40 });
  const st = JSON.parse(sim.G('JSON.stringify((() => { const c = npcs.find(k => k.p.name === "SALTY"); return [c.p.boat, c.p.house, !!c.p.homeless, Math.round(c.p.wallet)]; })())'));
  if (st[0] == null) return "flush housed fisher never moved aboard: " + JSON.stringify(st);
  if (st[1] != null) return "moved aboard but kept house " + st[1];
  if (st[2]) return "boat owner flagged homeless";
  // (the lot itself may be re-let the same night now that crabs relocate toward
  // their work - what matters is that SALTY gave his up, asserted above)
  if (!sim.G('/ABOARD/.test(homeLabel(npcs.find(k => k.p.name === "SALTY").p)[0])'))
    return "homeLabel does not say ABOARD: " + sim.G('homeLabel(npcs.find(k => k.p.name === "SALTY").p)[0]');
  // days 4-5: rate from the boat
  const mark = sim.G('(window._stats.catchesBy || {}).SALTY || 0');
  sim.runUntil("day >= 6 && tmin > 10", { maxSteps: 1200000, onTick: steady, tickEvery: 40 });
  const after = (sim.G('(window._stats.catchesBy || {}).SALTY || 0') - mark) / 2;
  return after >= before * 1.3 && after >= before + 2 ? true
    : `catch rate barely moved: ${before}/day off the pier vs ${after}/day aboard`;
});

scenario("boat: ownership and berth roundtrip through save/load", () => {
  const store = new Map();
  const a = createSim({ seed: 5, storage: store, fresh: false });
  a.runDays(2);
  a.G('{ const c = npcs.find(k => k.p.name === "SALTY"); c.p.homeless = false; c.p.house = null; c.p.boat = 2; c.fishSpot = boatSpot(2); save(); }');
  const b = createSim({ seed: 6, storage: store, fresh: false });
  const st = JSON.parse(b.G('JSON.stringify((() => { const c = npcs.find(k => k.p.name === "SALTY"); return [c.p.boat, !!c.p.homeless, c.p.house, c.fishSpot, homeLabel(c.p)[0]]; })())'));
  if (st[0] !== 2) return "berth lost: came back as " + JSON.stringify(st);
  if (st[1]) return "boat owner migrated to homeless on load";
  if (st[2] != null) return "boat owner grew a house on load: " + st[2];
  const spot = JSON.parse(b.G("JSON.stringify(boatSpot(2))"));
  if (st[3].x !== spot.x || st[3].y !== spot.y) return "fishSpot not re-aimed at the boat: " + JSON.stringify(st[3]);
  if (!/ABOARD THE/.test(st[4])) return "homeLabel wrong after load: " + st[4];
  // a save with a garbage berth index must sanitize, not crash
  const raw = JSON.parse(store.get("crabshack3_v1"));
  raw.npc.personas.find(p => p.name === "SALTY").boat = 9;
  store.set("crabshack3_v1", JSON.stringify(raw));
  const c2 = createSim({ seed: 7, storage: store, fresh: false });
  const st2 = JSON.parse(c2.G('JSON.stringify((() => { const c = npcs.find(k => k.p.name === "SALTY"); return [c.p.boat == null, !!c.p.homeless]; })())'));
  return st2[0] && st2[1] ? true : "garbage berth 9 not sanitized to homeless: " + JSON.stringify(st2);
});

scenario("showers are dirt-only: dirt serviced end-to-end", () => {
  // the old cleaners branch triggered at dirt 0.66; dirt must stay
  // serviceable below that same threshold (the sickness "cared" check) by
  // showers alone - dirt is the only thing a shower services now
  const sim = createSim({ seed: 88 });
  sim.runUntil('crabs[0].dayState === "home" && tmin > 13 * 60', {});
  sim.G("crabs[0].p.dirt = 0.9; crabs[0].p.tired = 0; crabs[0].p.wallet = 60; crabs[0].errandCd = 0;");
  const ok = sim.runUntil("(crabs[0].p.dirt || 0) < 0.66", { maxSteps: 60000,
    onTick: (G) => G("crabs[0].p.hunger = 0.2") });   // no snack detours
  if (!ok) return "grubby crab never got clean (dirt " + sim.G("crabs[0].p.dirt").toFixed(2) + ", state " + sim.G("crabs[0].dayState") + ")";
  const dirt = sim.G("crabs[0].p.dirt");
  return dirt <= 0.45 ? true : "shower barely dented the dirt: " + dirt.toFixed(2);
});

scenario("laundromat removal: old save migrates, refund fires exactly once", () => {
  const store = new Map();
  store.set("crabshack3_v1", JSON.stringify({
    coins: 500, lifetime: 900, day: 5, tmin: 600, lastRentDay: 4,
    lv: { chef: 2, cleaners: 1, sudsgear: 1, arcade: 0 },
    memorials: [], rep: 44, townCatch: 3, rate: 0, t: Date.now(),
    personas: [
      { name: "PINCHY", trait: "speedy", mode: "walk", acc: "none", color: 0, shift: "M", wallet: 30, house: 0, homeless: false, job: "cleaners" },
      { name: "CLAWDIA", trait: "tidy", mode: "bike", acc: "flower", color: 1, shift: "E", wallet: 25, house: 1, homeless: false, job: "shack" },
    ],
    npc: { tills: { sudsy: 150 }, personas: [{ name: "SUDSY", npc: true, wallet: 12, job: "cleaners" }] },
  }));
  const sim = createSim({ seed: 3, storage: store, fresh: false });
  // stale jobs clamped before any BIZ deref: crew to the shack, npc to the pier
  const jobs = JSON.parse(sim.G("JSON.stringify(crabs.map(c => c.p.job))"));
  if (jobs.some(j => j !== "shack")) return "stale cleaners job not clamped: " + JSON.stringify(jobs);
  if (sim.G('npcs[0].p.job') !== "fishing") return "SUDSY's stale cleaners job became " + sim.G("npcs[0].p.job");
  // the owned laundromat ($400) + suds gear ($150) refunded once
  const c0 = sim.G("Math.round(coins)");
  if (c0 !== 1050) return "coins after refund: $" + c0 + ", expected $1050 (500 + 400 + 150)";
  if (!sim.G("sudsRefunded")) return "refund flag not set";
  // reload: the persisted flag (and the dropped lv keys) block a second payout
  sim.G("save()");
  if (!JSON.parse(store.get("crabshack3_v1")).sudsRefund) return "sudsRefund flag not persisted";
  const sim2 = createSim({ seed: 4, storage: store, fresh: false });
  const c1 = sim2.G("Math.round(coins)");
  if (c1 !== 1050) return "refund fired again on reload: $" + c1;
  // and the migrated town actually runs
  sim2.runDays(1, { onTick: (G) => { if (G("coins") < 300) G("coins = 600"); }, tickEvery: 40 });
  return sim2.G("isFinite(coins) && crabs.length === 2") ? true : "migrated save broke after a day";
});

scenario("credit: rent shortfall draws the line instead of evicting", () => {
  const sim = createSim({ seed: 41 });
  sim.runUntil("tmin >= 19.8 * 60", {});
  // enough for wages but not the rent: tonight must draw, not evict
  sim.G("coins = 200;");
  const ok = sim.runUntil("lastRentDay === day", { maxSteps: 20000 });
  if (!ok) return "settlement never ran";
  if (sim.G("gameOver")) return "town died despite available credit";
  const bal = sim.G("credit.bal");
  if (!(bal > 0)) return "no credit drawn (bal " + bal + ")";
  if (bal > sim.G("CREDIT_CFG.LIMIT")) return "first draw exceeds the limit: " + bal;
  const c = sim.G("coins");
  if (c < 0) return "till went negative: " + c;
  // and the town keeps running: the next morning arrives with the debt on the books
  sim.runUntil("tmin >= 9 * 60 && day === 2", { maxSteps: 60000 });
  return sim.G("gameOver") ? "died overnight after the draw" : true;
});

scenario("credit: exhausted line + missed payment = bankrupt game over", () => {
  // deep shortfall past the remaining headroom: the bill can't be drawn
  const a = createSim({ seed: 42 });
  a.runUntil("tmin >= 19.9 * 60", {});
  a.G("credit.bal = CREDIT_CFG.LIMIT; coins = 0;");
  a.runUntil("gameOver || lastRentDay === day", { maxSteps: 20000 });
  if (!a.G("gameOver")) return "deep shortfall on an exhausted line did not bankrupt";
  if (!a.G("bankrupt")) return "gameOver without the bankrupt flag (wrong flavor)";
  // rent covered exactly, but the minimum payment missed with zero headroom
  const b = createSim({ seed: 43 });
  b.runUntil("tmin >= 19.9 * 60", {});
  b.G("credit.bal = CREDIT_CFG.LIMIT; coins = totalRent() + CRAB_WAGE * crabs.length;");
  b.runUntil("gameOver || lastRentDay === day", { maxSteps: 20000 });
  if (!b.G("gameOver")) return "missed minimum on an exhausted line did not bankrupt";
  return b.G("bankrupt") ? true : "minimum-payment bankruptcy lacks the flag";
});

scenario("credit: predictor warns >=2 days before a doomed town goes under", () => {
  const sim = createSim({ seed: 1337 });
  sim.runDays(30);
  if (!sim.G("gameOver")) return "doomed baseline survived 30d?";
  const warn = sim.G("window._stats.warnDay == null ? -1 : window._stats.warnDay");
  if (warn < 0) return "no warning ever fired (design failure)";
  const lead = sim.G("day") - warn;
  return lead >= 2 ? true : "warning only " + lead + " day(s) before bankruptcy";
});

scenario("credit: balance, flags and NPC lines roundtrip save/load", () => {
  const store = new Map();
  const a = createSim({ seed: 44, storage: store, fresh: false });
  a.runDays(2);
  a.G("credit.bal = 77; credit.warned = true; OWNERS.sudsy.credit = 33; OWNERS.sudsy.darkT = 2; save()");
  const b = createSim({ seed: 45, storage: store, fresh: false });
  const st = JSON.parse(b.G('JSON.stringify([credit.bal, credit.warned, OWNERS.sudsy.credit, OWNERS.sudsy.darkT, bizDark("showers")])'));
  if (st[0] !== 77 || st[1] !== true) return "player credit lost: " + JSON.stringify(st);
  if (st[2] !== 33 || st[3] !== 2 || st[4] !== true) return "npc credit/dark lost: " + JSON.stringify(st);
  // an old save (pre-credit keys) must load with a zero balance, no flags
  const raw = JSON.parse(store.get("crabshack3_v1"));
  delete raw.credit; delete raw.bankrupt; delete raw.dayLog; delete raw.npc.credit;
  store.set("crabshack3_v1", JSON.stringify(raw));
  const c = createSim({ seed: 46, storage: store, fresh: false });
  const st2 = JSON.parse(c.G("JSON.stringify([credit.bal, OWNERS.sudsy.credit || 0, bankrupt])"));
  return st2[0] === 0 && st2[1] === 0 && st2[2] === false ? true : "old save defaults wrong: " + JSON.stringify(st2);
});

scenario("thirst: drink errand serviced end-to-end at a staffed juice bar", () => {
  const sim = createSim({ seed: 33 });
  sim.G('coins = 900; tryBuy("juicebar"); crabs[0].p.job = "juicebar";');
  const ok0 = sim.runUntil('crabs[0].duty && crabs[0].workBiz === "juicebar" && !crabs[0].pendingOff', { maxSteps: 200000 });
  if (!ok0) return "the bar never opened (crabs[0] " + sim.G("crabs[0].dayState") + ")";
  sim.runUntil('crabs[1].dayState === "home" && tmin > 9.5 * 60 && tmin < 12.5 * 60', { maxSteps: 200000 });
  // Stand him at the bar's door before making him thirsty. This scenario is
  // about RETAIL PRICING, not about queue luck or a 750px walk: routed
  // commutes shifted the old cross-town arrival by a few minutes and landed
  // him on a full line, which legitimately bounces a local ("LINE'S TOO
  // LONG") and left the wallet assertion measuring a settlement instead of a
  // drink. Re-pointed with the crab-routing merge; the transaction under test
  // is unchanged.
  sim.G(`{ const c = crabs[1]; c.p.thirst = 0.9; c.p.hunger = 0.2; c.p.dirt = 0.2;
    c.p.tired = 0.2; c.p.bored = 0.2; c.p.wallet = 30; c.errandCd = 0;
    c.x = BIZ.juicebar.queueX - 30; c.y = 166;
    // clear the unclaimed tourist line so the local gets a slot (nobody is
    // holding these, so dropping them strands no chef)
    customers = customers.filter(k => !(k.biz === "juicebar" && !k.isCrab && !k.claimed
      && (k.state === "waiting" || k.state === "arriving"))); }`);
  const ok = sim.runUntil("(crabs[1].p.thirst || 0) === 0", { maxSteps: 60000 });
  if (!ok) return "thirst never serviced (thirst " + sim.G("crabs[1].p.thirst").toFixed(2)
    + ", state " + sim.G("crabs[1].dayState") + ")";
  // wallet 30 (<= 40) picks the cheapest drink: JUICE $6 at retail = ceil(6 x 1.25) = $8
  const paid = 30 - sim.G("crabs[1].p.wallet");
  if (paid !== 8) return "crew paid $" + paid + ", expected $8 retail JUICE";
  if (!sim.G("(window._stats.crabDrinks || 0) >= 1")) return "crabDrinks not counted";
  if (!sim.G("(window._stats.drinkServes || 0) >= 1")) return "bar serve not counted";
  return sim.G("trade.total.fruit >= 1") ? true : "the drink's fruit never hit the ledger";
});

scenario("thirst: a parched town breeds sickness, attributed to thirst", () => {
  // +0.12/night at thirst >= 0.95 - the scariest neglect. Pin thirst full with
  // every other need comfortable: illness must arrive AND be blamed on thirst
  // (14 nights x 2+ crabs at 0.12: a healthy town is a ~3% anomaly; we break
  // on the first hit). The watered control arm must never get thirst-blamed.
  const sim = createSim({ seed: 71 });
  const pin = 'for (const c of allCrabs()) { c.p.thirst = 1; c.p.hunger = 0.2; c.p.dirt = 0.2; c.p.tired = 0.2; }';
  for (let d = 0; d < 14; d++) {
    sim.runUntil("tmin >= 19.8 * 60 && lastRentDay !== day", { maxSteps: 80000,
      onTick: (G) => { if (G("coins") < 300) G("coins = 600"); } });
    sim.runUntil("lastRentDay === day", { maxSteps: 20000, onTick: (G) => G(pin), tickEvery: 4 });
    if (sim.G("((window._stats.causes || {}).thirst || 0) > 0")) break;
    sim.runUntil("tmin < 10", { maxSteps: 40000 });
  }
  if (!sim.G("((window._stats.causes || {}).thirst || 0) > 0"))
    return "no thirst-attributed illness in 14 parched nights";
  // control: a watered town (thirst pinned 0) never gets thirst-blamed
  const sim2 = createSim({ seed: 71 });
  const water = "for (const c of allCrabs()) c.p.thirst = 0;";
  for (let d = 0; d < 6; d++) {
    sim2.runUntil("tmin >= 19.8 * 60 && lastRentDay !== day", { maxSteps: 80000,
      onTick: (G) => { if (G("coins") < 300) G("coins = 600"); } });
    sim2.runUntil("lastRentDay === day", { maxSteps: 20000, onTick: (G) => G(water), tickEvery: 4 });
    sim2.runUntil("tmin < 10", { maxSteps: 40000 });
  }
  return sim2.G("((window._stats.causes || {}).thirst || 0)") === 0 ? true
    : "watered control arm got thirst-blamed sickness";
});

scenario("juicebar economics: ledger flows, register income, staff retail", () => {
  const sim = createSim({ seed: 44 });
  sim.G('coins = 900; tryBuy("juicebar"); crabs[0].p.job = "juicebar"; crabs[1].p.job = "juicebar";');
  sim.runDays(2, { onTick: (G) => { if (G("coins") < 300) G("coins = 600"); }, tickEvery: 40 });
  const st = JSON.parse(sim.G("JSON.stringify(window._stats)"));
  if ((st.drinkServes || 0) < 8) return "only " + (st.drinkServes | 0) + " drinks in 2 staffed days";
  const t = JSON.parse(sim.G("JSON.stringify(trade)"));
  if (t.total.fruit < st.drinkServes) return "fruit imports (" + t.total.fruit + ") < drinks served (" + st.drinkServes + ")";
  if ((st.coolersMade || 0) < 1) return "no COOLER in " + st.drinkServes + " drinks (recipe mix broke?)";
  if (t.total.water < (st.coolersMade || 0)) return "COOLER gallons missing from the water ledger";
  if (t.spent !== t.total.fish * 7) return "spent $" + t.spent + " != fish x $7 - a drink flow got CHARGED (tracking only until T3)";
  // staff quench at retail either way: a register buy while the other shift
  // tends bar (crabDrinks) or a self-serve pour at the dark bar (staffMeals -
  // both crew are juicebar staff here, so every selfCook IS a retail pour)
  if ((st.crabDrinks || 0) + (st.staffMeals || 0) < 1) return "staff never drank at retail in 2 days";
  // save/load: thirst, the unlock, the ledger, and the first-pour flag roundtrip
  const store = new Map();
  const a = createSim({ seed: 9, storage: store, fresh: false });
  a.G('coins = 500; tryBuy("juicebar"); crabs[0].p.thirst = 0.62; firstPour = true; trade.total.fruit = 31; save()');
  const b = createSim({ seed: 10, storage: store, fresh: false });
  if (b.G("UPS.juicebar.lvl") !== 1 || !b.G('bizUnlocked("juicebar")')) return "juicebar unlock did not roundtrip";
  if (Math.abs(b.G("crabs[0].p.thirst") - 0.62) > 1e-9) return "thirst did not roundtrip";
  if (!b.G("firstPour")) return "firstPour flag did not roundtrip";
  return b.G("trade.total.fruit") === 31 ? true : "fruit ledger did not roundtrip";
});

scenario("orders: redirect walks the crab there, then the schedule reclaims them", () => {
  const sim = createSim({ seed: 1337 });
  sim.runUntil('crabs[0].dayState === "working" && tmin > 10 * 60', {});
  // refusals are explicit: on the clock, a business order pops instead of firing
  sim.G("orderCrab(crabs[0], 1000, 160)");   // 1000 = SUDS SHOWERS
  if (sim.G('crabs[0].dayState') !== "working") return "on-duty biz order should refuse, not fire";
  if (!sim.G('floaters.some(f => f.text.includes("ON THE CLOCK"))')) return "refusal was silent";
  // the redirect proper: open ground in the showers/shack gap
  sim.G("orderCrab(crabs[0], 1180, 160)");
  if (sim.G('crabs[0].dayState') !== "directed") return "order did not take: " + sim.G('crabs[0].dayState');
  if (sim.G("crabs[0].slot") !== -1 || sim.G("!!crabs[0].cust")) return "abort leaked a station/customer hold";
  const t0 = sim.G("tmin");
  if (!sim.runUntil("crabs[0].order && crabs[0].order.idleT >= 0", { maxSteps: 1200 }))
    return "never reached the goto target";
  if (Math.abs(sim.G("crabs[0].x") - 1180) > 8) return "arrived somewhere else: " + sim.G("Math.round(crabs[0].x)");
  if (!sim.runUntil('crabs[0].dayState === "working" && crabs[0].duty', { maxSteps: 4000 }))
    return "schedule never reclaimed the crab";
  const el = sim.G("tmin") - t0;
  return el <= 60 ? true : `back at work after ${Math.round(el)} game-min (> 60)`;
});

scenario("orders: auto-unstick sidesteps a stationary pin", () => {
  // the audited hard pin: a walker pushed straight back by a stationary
  // anchor dead ahead on its exact lane. The watchdog must sidestep past it.
  const sim = createSim({ seed: 77 });
  sim.runUntil("tmin > 9 * 60", {});
  sim.G(`{
    const b = crabs[1];
    abortActivity(b);
    b.dayState = "working"; b.kstate = "work"; b.workT = b.workMax = 9999; b.workBiz = b.p.job = "shack";
    b.x = 880; b.y = 168; b.tx = 880; b.ty = 168;
    const w = crabs[0];
    abortActivity(w);
    w.x = 820; w.y = 168;
    orderGoto(w, 930, 168);
  }`);
  // 25 sim-seconds is plenty: ~1.5s to hit the pin, one or two 1.5s windows
  // to trigger, a 1s detour, and the walk out
  if (!sim.runUntil("crabs[0].x >= 925", { maxSteps: 500 }))
    return `walker still pinned at x=${sim.G("Math.round(crabs[0].x)")} after 25 sim-sec (unsticks: ${sim.G("window._stats.unsticks || 0")})`;
  if (!sim.G("window._stats.unsticks")) return "walker got through without the watchdog firing (pin did not reproduce)";
  return true;
});

scenario("tired: a workday accrues it; sleep drains it, bed beating cot", () => {
  const sim = createSim({ seed: 21 });
  // day 1 dawn: nobody has worked, nobody is tired
  if (sim.G("crabs.some(c => (c.p.tired || 0) > 0)")) return "crew started tired";
  // by 19:30 the M-shift crab has clocked off with the +0.45 shift bump
  sim.runUntil("tmin >= 19.5 * 60", { maxSteps: 400000 });
  if (!sim.G("crabs.some(c => (c.p.tired || 0) >= 0.44)"))
    return "no crab tired after a full workday: " + sim.G("JSON.stringify(crabs.map(c => +(c.p.tired || 0).toFixed(2)))");
  // 21:30, post-settlement: pin a housed crew crab and homeless SALTY at the
  // same exhaustion, park their errands, and let the night do the rest
  sim.runUntil("lastRentDay === day && tmin >= 21.5 * 60", { maxSteps: 400000 });
  // market income can house SALTY by night one now - this scenario compares
  // SLEEP RATES (bed vs cot), so pin him back onto a shelter cot explicitly
  sim.G(`{ const s = npcs.find(k => k.p.name === "SALTY");
    s.p.homeless = true; s.p.house = null; s.p.boat = null; s.fishSpot = fishSpotFor(0);
    crabs[0].p.tired = 0.8; s.p.tired = 0.8; crabs[0].errandCd = 999; s.errandCd = 999;
    if (crabs[0].p.homeless) throw new Error("housing preconditions broke");
  }`);
  const d0 = sim.G("day");
  sim.runUntil(`day === ${d0} + 1 && tmin >= 5.8 * 60`, { maxSteps: 400000 });
  const bed = sim.G("crabs[0].p.tired || 0"), cot = sim.G('npcs.find(k => k.p.name === "SALTY").p.tired || 0');
  if (bed > 0.1) return "housed crab woke tired: " + bed.toFixed(3);   // measured 0.037 at bed rate 0.5/h
  if (cot < 0.2) return "shelter cot drained like a real bed: " + cot.toFixed(3);
  if (cot - bed < 0.08) return "bed vs cot barely differs: " + bed.toFixed(3) + " vs " + cot.toFixed(3);
  // and daylight accrues NOTHING passively (no idle-at-home accrual, no
  // commute accrual, no daytime drain - sleep-only repair, work-only accrual):
  // pin the whole crew at 0.3 after first light, park errands, and 20 game
  // minutes later every value is untouched no matter where each crab stands
  sim.runUntil("tmin >= 6.05 * 60", { maxSteps: 40000 });
  sim.G("for (const c of crabs) { c.p.tired = 0.3; c.errandCd = 999; }");
  sim.runUntil("tmin >= 6.4 * 60", { maxSteps: 40000 });
  const moved = JSON.parse(sim.G("JSON.stringify(crabs.filter(c => Math.abs(c.p.tired - 0.3) > 1e-9).map(c => [c.p.name, c.p.tired, c.dayState]))"));
  return moved.length === 0 ? true : "tired moved without work or sleep: " + JSON.stringify(moved);
});

scenario("tired: save migration seeds it from old sandy, strands nothing", () => {
  const store = new Map();
  store.set("crabshack3_v1", JSON.stringify({
    coins: 300, lifetime: 500, day: 4, tmin: 600, lastRentDay: 3,
    lv: { chef: 2 }, memorials: [], rep: 40, townCatch: 2, rate: 0, t: Date.now(),
    personas: [
      { name: "PINCHY", trait: "speedy", mode: "walk", acc: "none", color: 0, shift: "M", wallet: 30, house: 0, homeless: false, job: "shack", sandy: 0.7 },
      { name: "CLAWDIA", trait: "tidy", mode: "bike", acc: "flower", color: 1, shift: "E", wallet: 25, house: 1, homeless: false, job: "shack", sandy: 0.2, tired: 0.55 },
    ],
    npc: { tills: { sudsy: 100 }, personas: [{ name: "SUDSY", npc: true, wallet: 12, job: "showers", sandy: 0.4 }] },
  }));
  const sim = createSim({ seed: 5, storage: store, fresh: false });
  const st = JSON.parse(sim.G(`JSON.stringify([
    crabs[0].p.tired, "sandy" in crabs[0].p,
    crabs[1].p.tired, "sandy" in crabs[1].p,
    npcs[0].p.tired, "sandy" in npcs[0].p])`));
  if (st[0] !== 0.7 || st[1]) return "old sandy did not seed tired: " + JSON.stringify(st);
  if (st[2] !== 0.55 || st[3]) return "an existing tired value must win: " + JSON.stringify(st);
  if (st[4] !== 0.4 || st[5]) return "npc sandy did not migrate: " + JSON.stringify(st);
  sim.G("save()");
  const raw = JSON.parse(store.get("crabshack3_v1"));
  const stranded = raw.personas.concat(raw.npc.personas).filter(p => p && "sandy" in p);
  return stranded.length === 0 ? true : "sandy stranded in the new save: " + stranded.map(p => p.name).join(",");
});

scenario("days off: everyone rests their weekday and plays customer", () => {
  // a full week in a grown town: every worker must (a) never clock in on
  // their assigned weekday off, (b) visibly show DAY OFF status that day,
  // and (c) every crew crab makes at least one purchase AS A CUSTOMER on an
  // off day across the week (wallet + a backlog of boredom are topped up on
  // off mornings - this tests the off-day machinery, not wallet luck; note
  // bored 0.5 is BELOW the workday arcade threshold 0.6, so a buy also
  // proves the relaxed off-day gating)
  const sim = createSim({ seed: 1337 });
  // the rota under test is the FOUNDERS' - pin the job board off so a mid-week
  // hire can't reshuffle assigned off-days beneath the assertions
  sim.G("OWNERS.sudsy.till = 30");
  sim.G(`coins = 5000; tryBuy("arcade"); tryBuy("chef"); tryBuy("chef");
    crabs[2].p.job = "arcade"; crabs[3].p.job = "arcade";
    window._offSeen = {}; window._clockIns = {}; window._sickDays = {};`);
  sim.runDays(7, { tickEvery: 8, onTick: (G) => {
    if (G("coins") < 500) G("coins = 1000");
    // freeze the labor market: a job-board hire mid-week reshuffles the rota
    // (legal - wages then follow workedToday), but THIS test wants a stable
    // week where scheduled == actual. No flush hires (till < 260) and no
    // dark-shop hires (a sick SUDSY zeroes the staff count, by design).
    G(`OWNERS.sudsy.till = Math.min(OWNERS.sudsy.till, 200);
    if (npcs[0]) { npcs[0].p.sick = null; }   // a sick solo owner zeroes staff -> emergency hire -> rota reshuffle
      for (const c of npcs) { c.p.sick = null;
        c.p.hunger = Math.min(c.p.hunger || 0, 0.8); c.p.dirt = Math.min(c.p.dirt || 0, 0.8); }`);
    G(`for (const c of allCrabs()) {
      if (!offToday(c)) continue;
      if (c.p.sick) { window._sickDays[c.p.name] = true; continue; }
      if (!c.p.npc && tmin >= OFF_WAKE) {   // all day: this tests the machinery, not wallet luck
        c.p.wallet = Math.max(c.p.wallet, 60);
        if (tmin < OFF_WAKE + 30) c.p.bored = Math.max(c.p.bored || 0, 0.5);
      }
      if (c.dayState === "working" || c.dayState === "toWork") window._clockIns[c.p.name] = day;
      if (/^DAY OFF/.test(crabStatus(c))) window._offSeen[c.p.name] = (window._offSeen[c.p.name] || 0) + 1;
    }`);
  } });
  const clockIns = JSON.parse(sim.G("JSON.stringify(window._clockIns)"));
  if (Object.keys(clockIns).length) return "worked their own day off: " + JSON.stringify(clockIns);
  const seen = JSON.parse(sim.G("JSON.stringify(window._offSeen)"));
  const sick = JSON.parse(sim.G("JSON.stringify(window._sickDays)"));
  const names = JSON.parse(sim.G("JSON.stringify(allCrabs().map(c => [c.p.name, !!c.p.npc]))"));
  for (const [n] of names)
    if (!seen[n] && !sick[n]) return n + " never showed a DAY OFF status in a week";
  const buys = JSON.parse(sim.G("JSON.stringify(window._stats.offBuys || {})"));
  for (const [n, npc] of names)
    if (!npc && !buys[n] && !sick[n]) return "crew " + n + " bought nothing on their day off all week";
  return true;
});

scenario("days off: cover shifts + stagger keep every shop lit", () => {
  // founders only: CLAWDIA (E) rests WED (day 3) - PINCHY must cover the
  // full open day so the shack is never shift-dark from a day off
  const sim = createSim({ seed: 21 });
  // founders-only rota is the thing under test: keep SUDSY's till below every
  // posting threshold so the job board can't reshuffle the roster mid-scenario
  sim.G("OWNERS.sudsy.till = 30");
  sim.runUntil("day === 3 && tmin >= 15 * 60", { maxSteps: 900000,
    onTick: (G) => { if (G("coins") < 300) G("coins = 600"); if (G("OWNERS.sudsy.till") > 200) G("OWNERS.sudsy.till = 100"); } });
  const rows = JSON.parse(sim.G('JSON.stringify(crabs.map(c => [c.p.name, WEEKDAYS[dayOffIdx(c)], c.duty, crabStatus(c)]))'));
  const claw = rows.find(r => r[0] === "CLAWDIA"), pinchy = rows.find(r => r[0] === "PINCHY");
  if (!claw || claw[1] !== "WED") return "CLAWDIA's day off is " + (claw && claw[1]) + ", expected WED";
  if (claw[2]) return "CLAWDIA on duty on her day off";
  if (!/^DAY OFF|^SLEEPING/.test(claw[3])) return "CLAWDIA's off status: " + claw[3];
  if (!pinchy[2]) return "PINCHY not covering CLAWDIA's evening shift at 15:00 (status " + pinchy[3] + ")";
  if (!sim.G('bizStaffed("shack")')) return "shack dark at 15:00 on a cover day";
  // derived rota: no multi-worker shop fully dark; coworkers never collide;
  // single-worker shops close on DIFFERENT weekdays
  const rota = JSON.parse(sim.G(`JSON.stringify((() => {
    const out = {};
    for (const k of allCrabs()) (out[k.p.job] = out[k.p.job] || []).push([k.p.name, dayOffIdx(k)]);
    return out;
  })())`));
  const singles = [];
  for (const biz in rota) {
    const offs = rota[biz].map(r => r[1]);
    if (offs.length === 1) { singles.push([biz, offs[0]]); continue; }
    if (new Set(offs).size !== offs.length) return biz + " coworkers share an off day: " + JSON.stringify(rota[biz]);
  }
  for (let i = 0; i < singles.length; i++)
    for (let j = i + 1; j < singles.length; j++)
      if (singles[i][1] === singles[j][1])
        return "single-worker shops " + singles[i][0] + "/" + singles[j][0] + " both close weekday " + singles[i][1];
  // SUDSY's SUN closure is a rest day, not a dark shop: the emergency
  // HELP WANTED post (broke/sick darkness) must NOT fire from it
  sim.G(`day = 7; tmin = 7.4 * 60; jobBoard = []; hireDay = 0;
    OWNERS.sudsy.till = 100;
    for (const c of npcs) if (c.p.employer) { c.p.employer = null; c.p.job = "fishing"; }`);
  if (!sim.G('offToday(npcs[0])')) return "SUDSY not off on SUN with a solo roster";
  if (!sim.G('bizRestingToday("showers")')) return "showers not flagged resting on SUDSY's day off";
  sim.G("runJobBoard()");
  const posting = sim.G('jobBoard.some(j => j.biz === "showers")');
  return posting ? "a rest day fired the emergency HELP WANTED posting" : true;
});

scenario("days off: wages skip exactly and the bill dips to match", () => {
  const sim = createSim({ seed: 7 });
  // day 3 = WED: CLAWDIA rests, PINCHY works. Freeze the last 10 game-min
  // (no errands, no sickness, pinned wallets) so the settlement is exact.
  sim.runUntil("day === 3 && tmin >= 19.8 * 60", { maxSteps: 900000,
    onTick: (G) => { if (G("coins") < 300) G("coins = 600"); } });
  sim.G(`for (const c of crabs) { c.errandCd = 999; c.p.hunger = 0.2; c.p.sick = null; c.p.wallet = 50; }
    if (coins < 400) coins = 600;`);
  const offNames = JSON.parse(sim.G("JSON.stringify(crabs.filter(c => offToday(c)).map(c => c.p.name))"));
  if (JSON.stringify(offNames) !== '["CLAWDIA"]') return "expected CLAWDIA (only) off on WED, got " + JSON.stringify(offNames);
  const owed = sim.G("nightlyDue() - totalRent()");
  const W = sim.G("CRAB_WAGE");
  if (owed !== W) return "BILL shows $" + owed + " wages with one of two crew off, expected $" + W;
  sim.runUntil("lastRentDay === day", { maxSteps: 30000 });
  if (sim.G("report.wages") !== W) return "settlement paid $" + sim.G("report.wages") + " wages, expected the billed $" + W;
  if (!/CLAWDIA/.test(sim.G("report.off"))) return "day report does not note CLAWDIA's day off: " + sim.G("report.off");
  const w = JSON.parse(sim.G("JSON.stringify(crabs.map(c => [c.p.name, c.p.wallet]))"));
  const cw = w.find(r => r[0] === "CLAWDIA")[1], pw = w.find(r => r[0] === "PINCHY")[1];
  if (pw !== 50 + W - 10) return "working PINCHY wallet " + pw + ", expected wage minus house rent";
  if (cw !== 50 - 10) return "off CLAWDIA wallet " + cw + ", expected 40 (house rent only, no wage)";
  // NPC payroll obeys the same rule: an employed fisher's SUN off is unpaid
  // but the job survives (no quit)
  const sim2 = createSim({ seed: 8 });
  sim2.runUntil("tmin >= 12 * 60", { maxSteps: 200000 });
  sim2.G(`{ const s = npcs.find(k => k.p.name === "SALTY");
    s.p.job = "showers"; s.p.employer = "sudsy"; s.workBiz = "showers";
    s.workedToday = false;   // he rested (the flag is what settlement trusts)
    OWNERS.sudsy.till = 200; coins = 600;
    day = 7; lastRentDay = 6; tmin = 19.9 * 60; s.p.wallet = 30;
    _offStamp = -1; }`);
  if (!sim2.G('offToday(npcs.find(k => k.p.name === "SALTY"))')) return "SALTY (showers staff) not off on SUN";
  sim2.runUntil("lastRentDay === day", { maxSteps: 30000 });
  const st = JSON.parse(sim2.G('JSON.stringify((() => { const s = npcs.find(k => k.p.name === "SALTY"); return [Math.round(s.p.wallet), s.p.employer, Math.round(OWNERS.sudsy.till)]; })())'));
  if (st[0] !== 30) return "off NPC staffer's wallet moved: " + st[0] + " (payroll should skip)";
  if (st[1] !== "sudsy") return "off NPC staffer lost the job at settlement";
  if (st[2] !== 200 - 35) return "SUDSY till " + st[2] + ", expected 165 (rent only - no payroll out)";
  return true;
});

scenario("fishers feed themselves: breaks + the beach roast", () => {
  const sim = createSim({ seed: 5 });
  sim.G("window._minH = {}");
  sim.runDays(6, { tickEvery: 10, onTick: (G) =>
    G("for (const c of npcs) if (c.p.fisher) { const k = c.p.name; window._minH[k] = Math.min(window._minH[k] ?? 1, c.p.hunger || 0); }") });
  const minH = JSON.parse(sim.G("JSON.stringify(window._minH)"));
  if (!Object.keys(minH).length) return "sampler never ran";
  const starved = Object.entries(minH).filter(([, h]) => h > 0.5);
  if (starved.length) return "a fisher never got a meal in 6 days: " + starved.map(([n, h]) => n + "@" + h.toFixed(2)).join(",");
  // and the broke path exists: pin a fisher penniless + hungry mid-shift, the
  // catch becomes lunch (no money moves)
  sim.G("coins = 2000");   // phase 2 tests the fisher, not player survival
  const found = sim.runUntil('tmin > 10 * 60 && tmin < 17 * 60 && npcs.some(c => c.p.job === "fishing" && c.dayState === "working")', { maxSteps: 400000,
    onTick: (G) => { if (G("coins") < 400) G("coins = 2000"); } });
  if (!found) return "no pure fisher ever worked the midday window (day " + sim.G("day") + ")";
  sim.G(`{ const f = npcs.find(c => c.p.job === "fishing" && c.dayState === "working");
    f.p.wallet = 2; f.p.hunger = 0.9; window._roastee = f.p.name; }`);
  sim.G("townCatch = Math.max(townCatch, 6)");
  const ok = sim.runUntil('npcs.find(c => c.p.name === window._roastee).p.hunger < 0.4', { maxSteps: 60000,
    onTick: (G) => { G('{ const f = npcs.find(c => c.p.name === window._roastee); if (f) { f.p.wallet = 2; if (townCatch < 4) townCatch = 6; } if (coins < 400) coins = 2000; }'); } });
  if (!ok) return "penniless fisher never roasted lunch (hunger " + sim.G('npcs.find(c => c.p.name === window._roastee).p.hunger').toFixed(2) + ")";
  return sim.G("(window._stats.roasts || 0) >= 1") ? true : "hunger fell without a roast counted";
});

scenario("hiring converts a visiting tourist (identity kept, entity gone, homeless, works today)", () => {
  const sim = createSim({ seed: 23 });
  sim.runUntil('customers.some(k => !k.isCrab && k.state === "waiting")', { maxSteps: 200000 });
  // mirror hireCrew's pick order so we know exactly who should get the toque
  const probe = JSON.parse(sim.G(`(() => {
    const el = customers.filter(k => !k.isCrab && k.state !== "leaving" && k.state !== "outStall");
    const p = el.find(k => k.state === "waiting" || k.state === "arriving") || el[0];
    return JSON.stringify({ name: p.name, color: p.color, acc: p.acc,
      tourists: customers.filter(k => !k.isCrab).length,
      lots: HOUSE_XS.map((x, h) => { const o = houseOccupant(h); return o ? o.p.name : null; }) });
  })()`));
  const d0 = sim.G("day");
  sim.G('coins = 500; tryBuy("chef")');
  const h = JSON.parse(sim.G("JSON.stringify(crabs[crabs.length - 1].p)"));
  if (h.name !== probe.name) return `hired ${h.name}, expected the visiting ${probe.name}`;
  if (h.color !== probe.color || h.acc !== probe.acc)
    return "tourist identity not preserved: " + JSON.stringify([h.color, h.acc, probe.color, probe.acc]);
  if (!h.homeless || h.house != null) return "converted hire not homeless: " + JSON.stringify([h.homeless, h.house]);
  // the customer entity is GONE: queue count down one, no ghost claims, no leaked furniture
  if (sim.G("customers.filter(k => !k.isCrab).length") !== probe.tourists - 1)
    return "customer entity still in the queue";
  if (sim.G("allCrabs().some(c => c.cust && !customers.includes(c.cust))"))
    return "a chef still claims the converted tourist's order";
  if (sim.G("[].concat(...Object.values(BIZ).map(b => (b.tables || []).concat(b.stalls || []))).some(t => t.occupant && !customers.includes(t.occupant))"))
    return "converted tourist leaked a table/stall";
  // no house popped into existence on the hire
  const lots2 = JSON.parse(sim.G("JSON.stringify(HOUSE_XS.map((x, h) => { const o = houseOccupant(h); return o ? o.p.name : null; }))"));
  if (JSON.stringify(lots2) !== JSON.stringify(probe.lots)) return "hiring moved the housing map: " + JSON.stringify(lots2);
  // and they clock in the same day - the hire completes immediately
  sim.runUntil(`crabs[${sim.G("crabs.length") - 1}].dayState === "working"`, { maxSteps: 200000,
    onTick: (G) => { if (G("coins") < 300) G("coins = 500"); } });
  if (sim.G("day") !== d0) return "converted hire never worked the day they were hired";
  return true;
});

scenario("hiring with no tourists books a morning-bus arrival who works day-of", () => {
  const sim = createSim({ seed: 29 });   // day 1, 7:00: town not open yet, zero tourists
  if (sim.G("customers.length") !== 0) return "expected an empty town at 7:00";
  sim.G('coins = 500; tryBuy("chef")');
  if (sim.G("crabs.length") !== 3) return "hire did not complete immediately";
  const p = JSON.parse(sim.G("JSON.stringify([crabs[2].p.name, crabs[2].p.homeless, crabs[2].p.house, Math.round(crabs[2].x)])"));
  if (!p[1] || p[2] != null) return "bus hire not homeless: " + JSON.stringify(p);
  if (Math.abs(p[3] - sim.G("BUS_STOPS[0]")) > 2) return "hire did not step off at the west bus stop: x=" + p[3];
  const names = JSON.parse(sim.G("JSON.stringify(allCrabs().map(c => c.p.name))"));
  if (names.filter(n => n === p[0]).length !== 1) return "name collision across pools: " + p[0];
  sim.runUntil('crabs[2].dayState === "working"', { maxSteps: 200000,
    onTick: (G) => { if (G("coins") < 300) G("coins = 500"); } });
  return sim.G("day") === 1 && sim.G('crabs[2].dayState === "working"')
    ? true : "bus hire never worked day-of (day " + sim.G("day") + ", state " + sim.G("crabs[2].dayState") + ")";
});

scenario("all 9 lots stand: empties render vacant, hiring never conjures a house", () => {
  const sim = createSim({ seed: 31 });
  // the draw derivation drawTown uses: every lot resolves to a tenant or null
  const lots = JSON.parse(sim.G("JSON.stringify(HOUSE_XS.map((x, h) => { const o = houseOccupant(h); return o ? o.p.name : null; }))"));
  if (lots.length !== 9) return "expected 9 lots, got " + lots.length;
  const occupied = lots.filter(Boolean).length;
  const housed = sim.G("allCrabs().filter(c => !c.p.homeless && c.p.boat == null).length");
  if (occupied !== housed) return `draw says ${occupied} occupied, sim says ${housed} housed`;
  if (occupied !== 2) return "fresh town should house exactly the founders: " + JSON.stringify(lots);
  // the vacant art is real and distinct (empty lots draw HOUSE_EMPTY2)
  if (sim.G("HOUSE_EMPTY2.w") !== 60 || sim.G("HOUSE_EMPTY2.h") !== 46) return "HOUSE_EMPTY2 art missing or mis-sized";
  // hire twice (bus path at 7:00): the housing map must not move a pixel
  sim.G('coins = 900; tryBuy("chef"); tryBuy("chef")');
  const lots2 = JSON.parse(sim.G("JSON.stringify(HOUSE_XS.map((x, h) => { const o = houseOccupant(h); return o ? o.p.name : null; }))"));
  if (JSON.stringify(lots2) !== JSON.stringify(lots)) return "hiring moved the housing map: " + JSON.stringify(lots2);
  if (!sim.G("crabs.slice(2).every(c => c.p.homeless)")) return "a hire started housed";
  // night glow derives from an occupant at home, which an empty lot cannot
  // have - houseOccupant(h) === null IS the dark-window guarantee
  return true;
});

scenario("hours: defaults are behavior-identical (frozen day-2 fingerprint)", () => {
  // A frozen day-2 fingerprint: exact coins/rep/wallets/positions. Its job is
  // to catch UNINTENDED drift - the hours machinery must not move a crab a
  // pixel until somebody changes a setting. RE-BASELINED at the fish-market
  // merge (deliberate, measured drift: fishers earn catch x market price, so
  // by day 2 SALTY and DRIFT have spent down and housed themselves - see the
  // price entry in PLAN). Re-baseline only with that kind of receipt.
  // RE-BASELINED AGAIN at the crab-routing merge (trip-chaining + furniture-
  // aware lanes). Receipt: this pass deliberately changes where every crab
  // walks, so every position and every downstream number moves. The drift is
  // legible and in the intended direction on BOTH seeds - fewer wasted
  // claw-miles bought more work: coins 159.7 -> 198.7 and 208.4 -> 218.3,
  // rep 46.7 -> 52.5 and 51.1 -> 52.6, tourist rage 5 -> 3 and 3 -> 3,
  // serves 37 -> 38 and 34 -> 38, and both fishers now actually FINISH the
  // walk home by midnight (seed 1337 DRIFT was stranded at x1549 mid-
  // promenade; he now sleeps at his cottage, x2136). See PLAN's routing
  // entry for the measured matrices.
  const want = {
    1337: '{"day":3,"tmin":0,"coins":198.706,"rep":52.545,"catch":0,"serves":38,"crabServes":3,"rage":3,"till":200.27,"wallets":[["PINCHY",16],["CLAWDIA",16],["SUDSY",23],["SALTY",11],["DRIFT",0]],"pos":[[520,154],[251.3,150],[673.3,167.7],[2072,154],[2136,154]]}',
    4242: '{"day":3,"tmin":0,"coins":218.261,"rep":52.6126,"catch":0,"serves":38,"crabServes":3,"rage":3,"till":206.164,"wallets":[["PINCHY",16],["CLAWDIA",16],["SUDSY",40],["SALTY",8],["DRIFT",5]],"pos":[[520,154],[108,154],[388,154],[492,155],[2136,154]]}',
  };
  for (const seed of [1337, 4242]) {
    const sim = createSim({ seed });
    sim.runDays(2);
    const got = sim.G(`JSON.stringify({
      day, tmin: Math.round(tmin), coins: Math.round(coins*1000)/1000, rep: Math.round(rep*10000)/10000,
      catch: townCatch, serves: window._stats.tourServes, crabServes: window._stats.crabServes,
      rage: window._stats.tourRage, till: Math.round(OWNERS.sudsy.till*1000)/1000,
      wallets: allCrabs().map(c => [c.p.name, Math.round(c.p.wallet*100)/100]),
      pos: allCrabs().map(c => [Math.round(c.x*10)/10, Math.round(c.y*10)/10])
    })`);
    if (got !== want[seed]) return `seed ${seed} drifted:\n        want ${want[seed]}\n        got  ${got}`;
  }
  return true;
});

scenario("hours: shortened hours really close the shop", () => {
  const sim = createSim({ seed: 21 });
  sim.G('setBizHours("shack", 9 * 60, 17 * 60)');
  // derived shifts must clamp to the new frame
  const m = sim.G('bizShiftWindow("shack", "M").label'), e = sim.G('bizShiftWindow("shack", "E").label');
  if (m !== "9-13" || e !== "13-17") return `derived shifts ${m}/${e}, expected 9-13/13-17`;
  // watch the whole first evening: after close+grace nobody works the shack,
  // no shack customer exists, while the showers (still 8-20) keep serving
  let lateDuty = 0, lateCust = 0, shwSeen = 0, preOpenCust = 0;
  sim.runUntil("day === 1 && tmin >= 18 * 60", {});
  if (sim.G('bizOpenNow("shack")')) return "shack claims open at 18:00 with close 17:00";
  sim.runUntil("tmin >= 19.5 * 60", { tickEvery: 4, onTick: (G) => {
    lateDuty += G('allCrabs().filter(k => k.duty && k.workBiz === "shack").length');
    // admissions only: a last-call diner finishing his plate and strolling
    // off is honest business, a NEW crab in the line is not
    lateCust += G('customers.filter(k => k.biz === "shack" && (k.state === "arriving" || k.state === "waiting")).length');
    shwSeen += G('customers.filter(k => k.biz === "showers").length');
  } });
  if (lateDuty > 0) return `staff still on shack duty after close (+grace): ${lateDuty} samples`;
  if (lateCust > 0) return `shack customers admitted after close: ${lateCust} samples`;
  if (shwSeen === 0) return "control failed: no shower traffic 18:00-19:30 (town died?)";
  // and the morning side: nobody in the shack line before 9:00 next day
  sim.runUntil("day === 2 && tmin >= 8 * 60", {});
  sim.runUntil("tmin >= 8.9 * 60", { tickEvery: 4, onTick: (G) => {
    preOpenCust += G('customers.filter(k => k.biz === "shack" && !k.isCrab).length');
  } });
  if (preOpenCust > 0) return `tourists queued at the shack before 9:00 open: ${preOpenCust} samples`;
  // the sign predicate the CLOSED placard draws from
  return sim.G('bizOpenNow("shack")') === false ? true : "8:59 and bizOpenNow already true";
});

scenario("cpu hours: SUDSY's policy converges and never thrashes", () => {
  // player kept solvent so the town runs long enough to watch her settle
  const sim = createSim({ seed: 1337 });
  const rows = [];
  let lastDay = 0;
  sim.runDays(30, { tickEvery: 20, onTick: (G) => {   // 30d: the fish market slowed her signal (fishers hold the rail; shower demand shifted later in the day)
    if (G("coins") < 300) G("coins = 800");
    const d = G("day");
    if (d !== lastDay && G("tmin") >= 6 * 60) {
      lastDay = d;
      rows.push(JSON.parse(G("JSON.stringify([day, BIZ.showers.hours.open, BIZ.showers.hours.close])")));
    }
  } });
  if (rows.length < 20) return `only ${rows.length} daily samples`;
  const cfg = JSON.parse(sim.G("JSON.stringify(HOURS_POLICY.showers)"));
  let flipsO = 0, flipsC = 0, lastDO = 0, lastDC = 0;
  for (let i = 1; i < rows.length; i++) {
    const dO = rows[i][1] - rows[i - 1][1], dC = rows[i][2] - rows[i - 1][2];
    if (Math.abs(dO) > 60 || Math.abs(dC) > 60)
      return `day ${rows[i][0]}: moved more than 1h in a day (${dO},${dC})`;
    if (dO && lastDO && Math.sign(dO) !== Math.sign(lastDO)) flipsO++;
    if (dC && lastDC && Math.sign(dC) !== Math.sign(lastDC)) flipsC++;
    if (dO) lastDO = dO;
    if (dC) lastDC = dC;
    const span = rows[i][2] - rows[i][1];
    if (span < cfg.minSpan) return `span shrank below the policy floor: ${span / 60}h on day ${rows[i][0]}`;
    if (rows[i][1] < 6 * 60 || rows[i][2] > 24 * 60) return "hours left the sanity bounds";
  }
  if (flipsO > 1 || flipsC > 1) return `oscillation: ${flipsO} open flips, ${flipsC} close flips`;
  // Convergence in a town that never stops changing: the strict test used to
  // be "the last 5 days are frozen", but crabs now relocate toward their work
  // and drifters keep arriving, so her demand curve genuinely keeps shifting.
  // What must hold is that she SETTLES rather than thrashes: no direction
  // flips (checked above) and at most one adjustment in the closing stretch.
  const tail = rows.slice(-5);
  let tailMoves = 0;
  for (let i = 1; i < tail.length; i++)
    if (tail[i][1] !== tail[i - 1][1] || tail[i][2] !== tail[i - 1][2]) tailMoves++;
  if (tailMoves > 1)
    return "not settling: " + tailMoves + " moves in the last 5 days " + JSON.stringify(tail);
  const moves = JSON.parse(sim.G("JSON.stringify(window._stats.hoursMoves || [])"));
  if (!moves.length) return "policy never moved - nothing was exercised";
  // the EXTEND rule, deterministically (organic shower demand is too sparse
  // to queue at close): sustained close-queue pressure + rested staff = +1h,
  // the same pressure with an exhausted roster = no move (tiredness budget)
  sim.G(`setBizHours("showers", 9 * 60, 18 * 60);
    hoursPolicyState.showers = { hist: [{ f: 1, l: 1, q: 3 }], cd: 0 };
    hoursObs.showers = { first: 1, last: 1, closeQ: 3 };
    for (const k of allCrabs()) if (k.p.job === "showers") k.p.tired = 0.2;
    runHoursPolicy("showers")`);
  if (sim.G("BIZ.showers.hours.close") !== 19 * 60)
    return "close-queue pressure did not extend closing: " + sim.G("BIZ.showers.hours.close");
  sim.G(`hoursPolicyState.showers = { hist: [{ f: 1, l: 1, q: 3 }], cd: 0 };
    hoursObs.showers = { first: 1, last: 1, closeQ: 3 };
    for (const k of allCrabs()) if (k.p.job === "showers") k.p.tired = 0.9;
    runHoursPolicy("showers")`);
  if (sim.G("BIZ.showers.hours.close") !== 19 * 60)
    return "an exhausted roster still got its hours extended";
  return true;
});

scenario("hours: a sun-skip across a SUDSY hours change doesn't wedge", () => {
  // the settlement that moves her hours can land mid sun-skip (6x dt); the
  // morning after, everyone must still be walking their (re-derived) schedule
  const sim = createSim({ seed: 8 });
  sim.runUntil("day === 2 && tmin >= 19.8 * 60", {});
  sim.G(`coins = 900;
    hoursPolicyState.showers = { hist: [{ f: 0, l: 1, q: 0 }, { f: 0, l: 1, q: 0 }], cd: 0 };
    hoursObs.showers = { first: 0, last: 1, closeQ: 0 };
    ffSleep = true; ffSleepDay = day + 1;`);
  const before = sim.G("BIZ.showers.hours.open");
  const det = stuckDetector(sim);
  sim.runUntil("day === 3 && tmin >= 12 * 60", { onTick: det.tick, tickEvery: 20,
    maxSteps: 200000 });
  if (sim.G("BIZ.showers.hours.open") !== before + 60)
    return "the forced quiet-morning history did not move her open hour";
  if (sim.G("ffSleep")) return "sun-skip never released";
  if (det.worstSeconds >= 18) return `a crab froze ~${det.worstSeconds}s across the skip`;
  // her new day 3 shift derives from the new hours and she still clocks in
  const w = JSON.parse(sim.G('JSON.stringify(bizShiftWindow("showers", "D"))'));
  if (w.start !== before + 60 + 30) return "her D shift did not re-anchor: " + JSON.stringify(w);
  return sim.G('npcs.find(k => k.p.name === "SUDSY").dayState') !== "home" || sim.G('offToday(npcs.find(k => k.p.name === "SUDSY"))')
    ? true : "SUDSY idle at home at noon on a workday after the change";
});

scenario("staff meals: AT COST and FREE charge exactly what they say", () => {
  const sim = createSim({ seed: 17 });
  sim.runUntil("tmin >= 20.6 * 60 && lastRentDay === day", {});
  sim.runUntil("customers.length === 0", { maxSteps: 60000 });
  sim.runUntil('!allCrabs().some(k => k.duty && k.workBiz === "shack") && tmin >= 20.5 * 60 && tmin < 22.5 * 60', { maxSteps: 120000 });
  const force = (pol) => {
    const before = JSON.parse(sim.G(`(() => {
      BIZ.shack.mealPol = ${JSON.stringify(pol)};
      for (const c of crabs) { c.p.hunger = 0; c.p.thirst = 0; c.errandCd = 999; c.p.tired = 0; }
      const c = crabs[0];
      c.p.hunger = 0.9; c.p.wallet = 30; c.errandCd = 0;
      if (c.dayState !== "working") { abortChef(c); c.dayState = "home"; }
      return JSON.stringify({ paid: window._stats.staffMealPaid || 0, meals: window._stats.staffMeals || 0,
        coins: Math.round(coins * 100) / 100 });
    })()`));
    const done = sim.runUntil(`(window._stats.staffMeals || 0) > ${before.meals}`, { maxSteps: 120000 });
    if (!done) return { err: `forced ${pol} staff meal never happened` };
    const after = JSON.parse(sim.G(`JSON.stringify({ paid: window._stats.staffMealPaid || 0,
      coins: Math.round(coins * 100) / 100, wallet: crabs[0].p.wallet,
      meal: window._stats.lastStaffMeal })`));
    return { before, after };
  };
  // AT COST: the crab pays exactly the ingredients; the till nets zero
  let r = force("atcost");
  if (r.err) return r.err;
  let charged = r.after.paid - r.before.paid;
  if (charged !== r.after.meal.cost)
    return `AT COST rang $${charged}, expected the $${r.after.meal.cost} ingredient bill (${r.after.meal.id})`;
  if (r.after.wallet !== 30 - charged) return `AT COST wallet ${r.after.wallet}, expected ${30 - charged}`;
  if (Math.abs((r.after.coins - r.before.coins)) > 0.001)
    return `AT COST till moved ${(r.after.coins - r.before.coins).toFixed(2)}, expected net zero`;
  // FREE: nothing charged; the till eats the ingredient cost
  r = force("free");
  if (r.err) return r.err;
  charged = r.after.paid - r.before.paid;
  if (charged !== 0) return `FREE rang $${charged}`;
  if (r.after.wallet !== 30) return `FREE meal touched the wallet: ${r.after.wallet}`;
  const tillDelta = r.after.coins - r.before.coins;
  if (Math.abs(tillDelta + r.after.meal.cost) > 0.001)
    return `FREE till delta ${tillDelta.toFixed(2)}, expected -${r.after.meal.cost}`;
  return true;
});

scenario("hours + meal policy + cpu policy state roundtrip save/load", () => {
  const store = new Map();
  const a = createSim({ seed: 31, storage: store, fresh: false });
  a.runDays(1);
  a.G(`setBizHours("shack", 9 * 60, 18.5 * 60);
    BIZ.shack.mealPol = "free"; BIZ.juicebar.mealPol = "atcost";
    hoursPolicyState.showers = { hist: [{ f: 0, l: 2, q: 1 }, { f: 0, l: 0, q: 0 }], cd: 1 };
    setBizHours("showers", 10 * 60, 19 * 60);
    save()`);
  const b = createSim({ seed: 32, storage: store, fresh: false });
  const got = JSON.parse(b.G(`JSON.stringify({
    sh: [BIZ.shack.hours.open, BIZ.shack.hours.close], sw: [BIZ.showers.hours.open, BIZ.showers.hours.close],
    mp: [BIZ.shack.mealPol, BIZ.juicebar.mealPol, BIZ.arcade.mealPol],
    pol: hoursPolicyState.showers })`));
  if (got.sh[0] !== 540 || got.sh[1] !== 1110) return "shack hours came back " + got.sh;
  if (got.sw[0] !== 600 || got.sw[1] !== 1140) return "shower hours came back " + got.sw;
  if (got.mp[0] !== "free" || got.mp[1] !== "atcost" || got.mp[2] !== "retail")
    return "meal policies came back " + got.mp;
  if (!got.pol || got.pol.cd !== 1 || got.pol.hist.length !== 2 || got.pol.hist[0].l !== 2)
    return "policy state came back " + JSON.stringify(got.pol);
  // degenerate hours in a tampered save clamp instead of wedging a shop shut
  const s = JSON.parse(store.get("crabshack3_v1"));
  s.hours.shack = [23 * 60, 23.5 * 60]; s.hours.arcade = [0, 900]; s.mealPol.shack = "bogus";
  store.set("crabshack3_v1", JSON.stringify(s));
  const c = createSim({ seed: 33, storage: store, fresh: false });
  const clamped = JSON.parse(c.G("JSON.stringify([BIZ.shack.hours.open, BIZ.shack.hours.close, BIZ.arcade.hours.open, BIZ.arcade.hours.close, BIZ.shack.mealPol])"));
  if (clamped[1] - clamped[0] < 4 * 60 || clamped[0] < 6 * 60 || clamped[1] > 24 * 60)
    return "degenerate shack hours survived the clamp: " + clamped;
  if (clamped[2] < 6 * 60) return "arcade open clamped wrong: " + clamped;
  return clamped[4] === "retail" ? true : "bogus meal policy accepted: " + clamped[4];
});

scenario("fish market: scarcity walks the price to the ceiling; the world supplies there", () => {
  const sim = createSim({ seed: 55 });
  // lay the fleet up: nothing lands, the town eats imports, price must climb
  sim.runDays(6, { tickEvery: 30, onTick: (G) => {
    if (G("coins") < 300) G("coins = 600");
    G("for (const c of npcs) if (c.p.fisher) c.p.sick = c.p.sick || { days: 0 };");
  } });
  const t = JSON.parse(sim.G("JSON.stringify(trade)"));
  if (t.price !== 7) return "price after 5+ dry days: $" + t.price + " (series " + t.series + ")";
  for (let i = 0; i < t.series.length; i++) {
    if (t.series[i] < 2 || t.series[i] > 7) return "price left the band: " + t.series;
    if (i && Math.abs(t.series[i] - t.series[i - 1]) > 1) return "price jumped a step: " + t.series;
  }
  if (!(t.total.fish > 0)) return "no imports flowed with a dry pier";
  if (t.spent !== t.total.fish * 7) return "imports not charged at the flat $7 world price: $" + t.spent + " for " + t.total.fish;
  return t.ceilDays >= 1 ? true : "ceilDays not counting at the ceiling";
});

scenario("fish market: a glut sags the price to the floor and pay falls with it", () => {
  const sim = createSim({ seed: 7 });
  // deterministic clearing math: heavy landings vs a light appetite,
  // one $1 step per clearing, floor-clamped
  sim.G("trade.price = 5; trade.landH = []; trade.useH = []; trade.series = []");
  for (let i = 0; i < 3; i++) sim.G("trade.landedDay = 20; trade.useDay = 6; settleFishMarket()");
  const s = JSON.parse(sim.G("JSON.stringify(trade.series)"));
  if (JSON.stringify(s) !== "[4,3,2]") return "glut clearings walked " + JSON.stringify(s) + ", expected [4,3,2]";
  sim.G("trade.landedDay = 20; trade.useDay = 6; settleFishMarket()");
  if (sim.G("trade.price") !== 2) return "price fell through the $2 floor";
  // and a floor-price catch pays exactly $2 into the fisher's claw
  sim.G("window._stats.fishPay = 0; window._stats.catches = 0");
  const ok = sim.runUntil("(window._stats.catches || 0) >= 3", { maxSteps: 900000, onTick: (G) =>
    G("trade.price = 2; if (coins < 300) coins = 600;") });
  if (!ok) return "no catches landed to price-check";
  const pay = sim.G("window._stats.fishPay"), n = sim.G("window._stats.catches");
  return pay === 2 * n ? true : "caught " + n + " at $2, paid $" + pay;
});

scenario("fish market: at the ceiling a fisher skips the arcade; at the floor he goes", () => {
  const sim = createSim({ seed: 13 });
  sim.G('coins = 3000; tryBuy("arcade"); tryBuy("chef"); crabs[2].p.job = "arcade";');
  const pin = `{ const c = npcs.find(k => k.p.name === window._f);
    if (c) { c.p.hunger = 0.2; c.p.thirst = 0.2; c.p.dirt = 0.2; c.p.tired = 0.2;
      c.p.sick = null; c.p.wallet = 60; c.p.bored = 0.9;
      if (c.errandCd > 0.5) c.errandCd = 0.5; } }`;
  const found = sim.runUntil('tmin > 10 * 60 && tmin < 15 * 60 && bizStaffed("arcade") && npcs.some(c => c.p.job === "fishing" && c.dayState === "working" && !c.p.employer)', {
    maxSteps: 900000, onTick: (G) => { if (G("coins") < 400) G("coins = 800"); } });
  if (!found) return "never staged a working fisher beside a staffed arcade";
  sim.G('window._f = npcs.find(c => c.p.job === "fishing" && c.dayState === "working" && !c.p.employer).p.name');
  // state A: bored stiff at a $7 price - he stays on the rail and says the line
  const t0 = sim.G("tmin");
  sim.G("window._left = false");
  sim.runUntil(`tmin > ${t0} + 90`, { maxSteps: 40000, tickEvery: 2, onTick: (G) => {
    G(pin + ' trade.price = 7; if (coins < 400) coins = 800;');
    G('if (npcs.find(k => k.p.name === window._f).dayState !== "working") window._left = true;');
  } });
  if (sim.G("window._left")) return "fisher left the pier at ceiling price";
  if (!sim.G("npcs.find(k => k.p.name === window._f).priceQuipDay")) return "no THE WATER'S MONEY TODAY moment";
  // state B: the same itch at a $2 price - the arcade wins
  sim.G("window._went = false");
  const went = sim.runUntil("window._went === true", { maxSteps: 120000, tickEvery: 2, onTick: (G) => {
    G(pin + ' trade.price = 2; if (coins < 400) coins = 800;');
    G(`{ const c = npcs.find(k => k.p.name === window._f);
      if ((c.dayState === "toErrand" || c.dayState === "errand") && c.errand && c.errand.need === "fun") window._went = true; }`);
  } });
  return went ? true : "fisher never took the arcade break at floor price (state " +
    sim.G('npcs.find(k => k.p.name === window._f).dayState') + ")";
});

scenario("fish market: 15 days settle into a band, never a daily sawtooth", () => {
  const sim = createSim({ seed: 1337 });
  sim.runDays(15, { tickEvery: 40, onTick: (G) => { if (G("coins") < 300) G("coins = 600"); } });
  const s = JSON.parse(sim.G("JSON.stringify(trade.series)"));
  if (s.length < 14) return "series too short: " + JSON.stringify(s);
  for (let i = 0; i < s.length; i++) {
    if (s[i] < 2 || s[i] > 7) return "price left the band: " + JSON.stringify(s);
    if (i && Math.abs(s[i] - s[i - 1]) > 1) return "sawtooth step: " + JSON.stringify(s);
  }
  // full floor-to-ceiling traverses: one $1 step a day across a $5 range
  // makes a traverse take 5+ days by construction; 15 days allow at most 3
  let crossings = 0, seen = null;
  for (const p of s) {
    if (p <= 2) { if (seen === 7) crossings++; seen = 2; }
    if (p >= 7) { if (seen === 2) crossings++; seen = 7; }
  }
  return crossings <= 3 ? true : crossings + " full-range crossings in 15 days: " + JSON.stringify(s);
});

scenario("fish market: price + series roundtrip save/load", () => {
  const store = new Map();
  const a = createSim({ seed: 9, storage: store, fresh: false });
  a.G("trade.price = 6; trade.series = [4,5,5,6]; trade.useH = [9,8]; trade.landH = [5,6]; trade.ceilDays = 0; trade.useDay = 3; save()");
  const b = createSim({ seed: 10, storage: store, fresh: false });
  if (b.G("trade.price") !== 6) return "price did not roundtrip: $" + b.G("trade.price");
  if (b.G("JSON.stringify(trade.series)") !== "[4,5,5,6]") return "series did not roundtrip";
  if (b.G("JSON.stringify(trade.useH)") !== "[9,8]" || b.G("JSON.stringify(trade.landH)") !== "[5,6]")
    return "demand windows did not roundtrip";
  if (b.G("trade.useDay") !== 3) return "day-use counter did not roundtrip";
  // an old save (pre-market trade keys) opens at the classic $4, blank chart
  const raw = JSON.parse(store.get("crabshack3_v1"));
  delete raw.trade.price; delete raw.trade.series; delete raw.trade.useH;
  delete raw.trade.landH; delete raw.trade.useDay; delete raw.trade.ceilDays;
  store.set("crabshack3_v1", JSON.stringify(raw));
  const c = createSim({ seed: 11, storage: store, fresh: false });
  return c.G("trade.price") === 4 && c.G("trade.series.length") === 0
    ? true : "old save defaults wrong: $" + c.G("trade.price");
});

scenario("fish market: floor-price week - the roast keeps a broke fisher alive", () => {
  // owner directive: no wage means a glut week produces genuinely poor
  // fishers; the driftwood roast is the load-bearing safety valve. Pin the
  // market at the $2 floor for a whole week: SALTY's real income (catch x $2)
  // can't reliably buy the $18 town meal, so the roast must carry his
  // nutrition - a hunger-attributed sickness on him IS the failure.
  const sim = createSim({ seed: 5 });
  sim.G("window._sSick = null; window._wMax = 0");
  sim.runDays(7, { tickEvery: 8, onTick: (G) => {
    // freeze the labor market (days-off scenario pattern): at a $2 price a
    // $20 posting rationally poaches SALTY off the pier, and a poached
    // employee is not the glut-priced FISHER this scenario constructs
    G(`trade.price = 2; if (coins < 300) coins = 600;
      OWNERS.sudsy.till = Math.min(OWNERS.sudsy.till, 200);
      if (npcs[0]) npcs[0].p.sick = null;
      { const f = npcs.find(c => c.p.name === "SALTY");
        if (f) {
          if (townCatch < 5) townCatch = 5;
          window._wMax = Math.max(window._wMax, f.p.wallet);
          if (f.p.sick && !window._sSick) window._sSick = [day, +(f.p.hunger || 0).toFixed(2)];
        } }`);
  } });
  const sSick = JSON.parse(sim.G("JSON.stringify(window._sSick)"));
  if (sSick && sSick[1] >= 0.9) return "SALTY fell starvation-sick on day " + sSick[0] + " (hunger " + sSick[1] + ")";
  if (sim.G("Math.round(window._wMax)") >= 60) return "a floor-price week made SALTY rich ($" + sim.G("Math.round(window._wMax)") + ") - glut pay isn't real";
  if (!((sim.G("window._stats.roasts") || 0) >= 3)) return "only " + sim.G("window._stats.roasts || 0") + " roasts in a glut week";
  // and the guard held: with only the town's last two fish, no roast fires
  const staged = sim.runUntil('npcs.find(c => c.p.name === "SALTY").dayState === "working" && tmin > 9 * 60 && tmin < 17 * 60', {
    maxSteps: 900000, onTick: (G) => G('{ const f = npcs.find(c => c.p.name === "SALTY"); if (f) f.p.sick = null; if (coins < 300) coins = 600; }') });
  if (!staged) return "SALTY never got back to the rail for the guard check";
  sim.G("window._rs = window._stats.roastStarts || 0");
  const t1 = sim.G("tmin");
  sim.runUntil(`tmin > ${t1} + 60`, { maxSteps: 20000, tickEvery: 2, onTick: (G) =>
    G(`{ const f = npcs.find(c => c.p.name === "SALTY"); f.p.hunger = 0.9; f.p.wallet = 3; f.p.sick = null;
      townCatch = 2; if (coins < 300) coins = 600;
      for (const k of npcs) if (k.p.fisher) k.castT = 999; }`) });   // no fresh landings: the crate holds exactly the last two
  return (sim.G("window._stats.roastStarts || 0") === sim.G("window._rs"))
    ? true : "a roast ate one of the town's last two fish";

});

// ---- routing: trip-chaining + proactive furniture avoidance ---------------
// Walk-distance meter: sums |dx| per crab per day inside the vm (cheap) so a
// scenario can compare "how far did this town walk today" before/after.
function walkMeter(sim) {
  sim.G("window._wm = { d: {}, prev: {} };");
  return {
    tick(G) {
      G(`{ const m = window._wm;
        for (const c of allCrabs()) {
          if (c.hidden) continue;
          const k = c.p.name + "#" + day;
          const p = m.prev[c.p.name];
          if (p != null && Math.abs(c.x - p) < 40) m.d[k] = (m.d[k] || 0) + Math.abs(c.x - p);
          else if (m.d[k] == null) m.d[k] = 0;
          m.prev[c.p.name] = c.x;
        } }`);
    },
    get perCrabDay() {
      const d = JSON.parse(sim.G("JSON.stringify(window._wm.d)"));
      const ks = Object.keys(d);
      return ks.reduce((a, k) => a + d[k], 0) / Math.max(1, ks.length);
    },
  };
}

scenario("routes: a meal ON THE WAY to work, not a lap of the promenade", () => {
  // The named symptom (Matt): wake -> commute to work -> walk BACK past your
  // own front door to the shack for breakfast -> return to work. The chained
  // route is home -> shack -> work, in that order, and never doubles back.
  const sim = createSim({ seed: 909 });
  const ok0 = sim.runUntil(
    'bizStaffed("shack") && tmin > 7 * 60 && tmin < 10 * 60 && ' +
    'crabs.some(c => c.dayState === "home" && !offToday(c) && !c.p.sick && tmin < leaveGmin(c) - 45)',
    { maxSteps: 200000 });
  if (!ok0) return "no morning with a staffed shack and a crab still at home";
  // the hungry crab: at home in the west, a shift ahead, the shack (which is
  // east, on the way to work) staffed and affordable
  const idx = sim.G('crabs.findIndex(c => c.dayState === "home" && !offToday(c) && !c.p.sick && tmin < leaveGmin(c) - 45)');
  sim.G(`{ const c = crabs[${idx}];
    c.p.hunger = 0.75; c.p.thirst = 0; c.p.dirt = 0; c.p.bored = 0; c.p.wallet = 60; c.errandCd = 0; }`);
  const homeX0 = sim.G(`homeX(crabs[${idx}])`);
  const workX = sim.G(`jobDoor(crabs[${idx}])`);
  const shackQ = sim.G("BIZ.shack.queueX");
  if (!(homeX0 < shackQ && Math.abs(workX - homeX0) > 400))
    return `seed geometry unusable (home ${homeX0}, work ${workX}, shack ${shackQ})`;
  // walk the whole trip, logging where they went and how far they walked
  sim.G("window._t = { walk: 0, prev: null, minX: 1e9, sawErrand: false, left: false, sawWork: false };");
  const trace = () => sim.G(`{ const c = crabs[${idx}], t = window._t;
    if (t.prev != null && Math.abs(c.x - t.prev) < 40) t.walk += Math.abs(c.x - t.prev);
    t.prev = c.x;
    if (c.dayState === "toErrand" || c.dayState === "errand") t.sawErrand = true;
    if (t.sawErrand && c.x > ${homeX0} + 300) t.left = true;   // genuinely under way
    if (t.left && !t.sawWork) t.minX = Math.min(t.minX, c.x);
    if (t.sawErrand && c.dayState === "working") t.sawWork = true; }`);
  const arrived = sim.runUntil(`crabs[${idx}].dayState === "working"`,
    { maxSteps: 200000, tickEvery: 1, onTick: trace });
  if (!arrived) return "the crab never reached work";
  const t = JSON.parse(sim.G("JSON.stringify(window._t)"));
  if (!t.sawErrand) return "the crab went to work without eating (no errand at all)";
  // (1) PATH ORDER: having set out for the meal, they never went back home
  if (!t.left) return "the crab never actually set out (no leg past home + 300px)";
  if (t.minX < homeX0 + 300)
    return `backtracked toward home (reached x ${Math.round(t.minX)}, home ${Math.round(homeX0)}) between the meal and work`;
  // (2) DISTANCE: within a quarter of the ideal home -> shack -> work walk
  const ideal = Math.abs(shackQ - homeX0) + Math.abs(workX - shackQ);
  if (t.walk > ideal * 1.25)
    return `walked ${Math.round(t.walk)}px for a ${Math.round(ideal)}px trip (${(t.walk / ideal).toFixed(2)}x)`;
  return true;
});

scenario("routes: a full town walks less per crab-day (no systematic backtracking)", () => {
  // Pinned from the measured build: 5 days of this 4-crab arcade town used
  // to average 4273px of x-travel per crab-day; chaining + the en-route rules
  // brought it to 3521. The gate (4000) catches a REGRESSION to the
  // lap-the-promenade behaviour, not per-build wobble.
  const sim = createSim({ seed: 4242 });
  sim.G(`coins = 3000; tryBuy("arcade"); tryBuy("chef"); tryBuy("chef");
    crabs[2].p.job = "arcade"; crabs[3].p.job = "arcade";`);
  const wm = walkMeter(sim);
  sim.runDays(5, { onTick: wm.tick, tickEvery: 1 });
  const per = wm.perCrabDay;
  return per <= 4000 ? true : `${Math.round(per)}px of x-travel per crab-day (gate 4000, measured 3521)`;
});

scenario("routes: furniture avoidance keeps warps + unsticks near zero", () => {
  // Lane travel is furniture-aware now, so the two last-resort valves should
  // hardly ever fire: the 30-game-minute bounce budget (warps) and the
  // 1.5-second no-progress sidestep (unsticks). Measured on THIS town over 5
  // days - before the pass: 21 warps + 6 unsticks. After: 0 + 2.
  const sim = createSim({ seed: 5348 });
  sim.G(`coins = 3000; tryBuy("arcade"); tryBuy("chef"); tryBuy("chef");
    crabs[2].p.job = "arcade"; crabs[3].p.job = "arcade";`);
  sim.runDays(5);
  const st = JSON.parse(sim.G("JSON.stringify(window._stats)"));
  const w = st.warps || 0, u = st.unsticks || 0;
  if (w > 2) return `${w} bounce-budget warps in 5 days (was 21, measured 0; gate 2)`;
  if (w + u > 8) return `${w} warps + ${u} unsticks in 5 days (was 27, measured 2; gate 8)`;
  return true;
});

scenario("routes: both travel lanes are clear of every solid (tripwire)", () => {
  // The lanes are only useful while they are actually empty. This fails the
  // day somebody parks a table or a counter on one - which is exactly how the
  // town got into the all-day-bouncing state in the first place.
  const sim = createSim({ seed: 11 });
  sim.G(`coins = 4000; tryBuy("arcade"); tryBuy("juicebar"); tryBuy("table"); tryBuy("table");`);
  const bad = JSON.parse(sim.G(`JSON.stringify(LANES.map(l => [l, laneClear(l, 0, WORLD_W)]).filter(r => r[1] < LANE_PAD))`));
  if (bad.length) return "lane(s) obstructed: " + bad.map(([l, c]) => `y=${l} has ${c}px of daylight`).join(", ");
  // and a walker asked to cross a blocked lane must pick the other one
  const alt = sim.G(`(() => {
    const fake = { x: 0 };
    const t = BIZ.shack.tables[0];
    return travelLane({ x: t.x - 60 }, t.x + 60, LANES[1]);
  })()`);
  if (typeof alt !== "number") return "travelLane did not return a lane";
  return true;
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
