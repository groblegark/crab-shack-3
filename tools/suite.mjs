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
  // risk at maxed neglect is 0.19/crab/night - run enough nights that a healthy
  // outcome is a real anomaly (12 nights x 2 crabs: P(no one sick) ~ 0.6%), and
  // keep the town solvent so eviction can't cut the sample short
  for (let d = 0; d < 12; d++) {
    sim.runUntil("tmin >= 19.9 * 60 && lastRentDay !== day", { maxSteps: 80000,
      onTick: (G) => { if (G("coins") < 300) G("coins = 600"); } });
    sim.G('for (const c of crabs) { c.p.hunger = 1; c.p.dirt = 1; c.p.sandy = 1; }');
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
    G('OWNERS.sudsy.till = 0;' +
      'for (const c of npcs) if (c.p.fisher) { c.p.hunger = 0.2; c.p.dirt = 0.2; c.p.sandy = 0.2; c.p.bored = 0.2; c.p.sick = null; }');
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
  if (sim.G('allCrabs().filter(c => !c.p.homeless && c.p.house === 5).length') !== 0)
    return "old house 5 did not free up";
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
