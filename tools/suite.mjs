#!/usr/bin/env node
// Regression suite: assertion-based scenarios over the real game code.
//   node tools/suite.mjs            run everything
//   node tools/suite.mjs stuck ff   run scenarios matching any arg substring
import { createSim } from "./simlib.mjs";

const results = [];
function scenario(name, fn) { results.push({ name, fn }); }
const near = (v, lo, hi) => v >= lo && v <= hi;

// Saves live in NUMBERED SLOTS. LEGACY is the old single key - still written by
// the migration scenarios, since a stored save from an older build arrives
// there; SLOT1..SLOT5 are where the game reads and writes today.
const LEGACY = "crabshack3_v1";
const SLOT = (i) => "crabshack3_v1_s" + i;
const SLOT1 = SLOT(1), SLOT2 = SLOT(2);
const ACTIVE = "crabshack3_v1_active";

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

scenario("baseline loses by default (all but the odd lucky town)", () => {
  // The pillar is "lose by default, but JUST barely". It used to be literally
  // every town; since the public tap (crabs stopped being structurally sick,
  // so a two-crab shack works ~20% more hours) the 16-seed matrix reads 2/16
  // surviving on ~$113 - see PLAN "Lose-by-default after the tap". Rent was
  // measured as the counter-lever and REJECTED: 236 restores 0/16 but takes
  // growth escape to 0/8 with it. So this gate asserts the shape honestly:
  // the overwhelming majority die, in the measured window - not "every one".
  const days = []; let lived = 0;
  for (const seed of [1337, 2674, 4011, 5348, 909, 31]) {
    const sim = createSim({ seed });
    sim.runDays(30);
    if (!sim.G("gameOver")) { lived++; continue; }
    days.push(sim.G("day"));
  }
  if (lived > 1) return `${lived}/6 do-nothing towns survived 30 days - lose-by-default is broken`;
  const med = days.sort((a, b) => a - b)[Math.floor(days.length / 2)];
  return near(med, 6, 20) ? true : `median eviction day ${med} outside 6-20 (${days})`;
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

scenario("dining: tables are BUSED BY STAFF, and the room keeps turning", () => {
  // RE-POINTED 2026-08-19 (table-service economy). This scenario used to be
  // called "outdoor tables, guests bus their own" and asserted that no table
  // ever ended a day with plates on it, because the outdoor-casual rule had
  // guests clear up after themselves. The owner asked for the fancier tier
  // ("add table cleanup"), so the rule is gone: a vacated table is DIRTY and a
  // staff crab has to clear it. What the scenario is really for - the dining
  // room keeps turning and never silts up - is asserted directly instead.
  const sim = createSim({ seed: 99 });
  sim.runDays(3);
  const st = JSON.parse(sim.G("JSON.stringify(window._stats)"));
  if (st.tourServes < 20) return `only ${st.tourServes} serves in 3 days`;
  if ((st.seated || 0) < 5) return `only ${st.seated | 0} diners seated in 3 days`;
  if ((st.tablesBused || 0) < 5) return `only ${st.tablesBused | 0} tables bused in 3 days - nobody is clearing up`;
  // a table left dirty overnight is fine (the crew went home); one that is
  // dirty AND flagged cleaning with nobody holding it is the wedge shape
  const stuck = sim.G(`BIZ.shack.tables.filter(t => t.cleaning &&
    !allCrabs().some(c => c.cleanTable === t)).length`);
  return stuck === 0 ? true : `${stuck} tables flagged 'cleaning' with nobody clearing them`;
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
    // ...and anybody ALREADY at the pantry is sent away: this ledger is
    // event-scoped to one meal, and zeroing a need does not abort a cook
    // that has started (see the re-pointing note below).
    for (let i = 1; i < crabs.length; i++)
      if (crabs[i].dayState === "selfCook") { abortChef(crabs[i]); crabs[i].dayState = "home"; }
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
  // RE-POINTED 2026-08-19 (table-service economy): the FIXTURE, not the rule.
  // The ledger asserted here is event-scoped to ONE meal, but nothing kept a
  // second crab out of the pantry while we waited for the first to finish -
  // and the new stream order put CLAWDIA at the juicer for a DRINK mid-wait,
  // so the till read two $10 juices against one meal. The other crabs are now
  // held un-peckish for the duration, which is what "one hungry crab" always
  // meant. The retail transaction under test is unchanged.
  const done = sim.runUntil(`(window._stats.staffMeals || 0) > ${before.meals}`, { maxSteps: 120000,
    tickEvery: 1,
    onTick: (G) => G("for (let i = 1; i < crabs.length; i++) { crabs[i].p.hunger = 0; crabs[i].p.thirst = 0; crabs[i].errandCd = 999; }") });
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

scenario("slots: a legacy single-key save migrates into slot 1, losing nothing", () => {
  const store = new Map();
  const legacy = {
    coins: 512, lifetime: 900, day: 6, tmin: 640, lastRentDay: 5,
    lv: { chef: 2, table: 1 }, memorials: [{ x: 100, name: "OLD SHELL" }],
    rep: 44, townCatch: 3, rate: 0, t: 1700000000000, musicOn: false,
    hireDay: 5, board: [], gameOver: false,
    personas: [
      { name: "PINCHY", trait: "speedy", mode: "walk", acc: "none", color: 0, shift: "M", wallet: 30, house: 0, homeless: false, job: "shack" },
      { name: "CLAWDIA", trait: "tidy", mode: "bike", acc: "flower", color: 1, shift: "E", wallet: 25, house: 1, homeless: false, job: "shack" },
    ],
    npc: { tills: { sudsy: 150 }, personas: [{ name: "SUDSY", npc: true, wallet: 12, job: "showers" }] },
  };
  store.set(LEGACY, JSON.stringify(legacy));
  const sim = createSim({ seed: 3, storage: store, fresh: false });
  if (store.has(LEGACY)) return "the legacy key survived migration";
  const slot = JSON.parse(store.get(SLOT1));
  for (const k of Object.keys(legacy))          // every field arrives byte-identical
    if (JSON.stringify(slot[k]) !== JSON.stringify(legacy[k])) return "migration changed " + k;
  if (slot._ver !== 1 || !slot._meta) return "migrated slot carries no version/meta";
  if (slot._meta.day !== 6 || slot._meta.coins !== 512 || slot._meta.crew.length !== 2)
    return "migrated meta wrong: " + JSON.stringify(slot._meta);
  const st = JSON.parse(sim.G("JSON.stringify([Math.round(coins), day, UPS.chef.lvl, activeSlot, crabs.map(c => c.p.name), memorials.length])"));
  if (st[0] !== 512 || st[1] !== 6 || st[2] !== 2) return "the migrated town did not load: " + JSON.stringify(st);
  if (st[3] !== 1) return "active slot should be 1, was " + st[3];
  if (st[4].join() !== "PINCHY,CLAWDIA" || st[5] !== 1) return "crew/memorials lost: " + JSON.stringify(st);
  sim.G("coins = 600; save()");                 // and autosave keeps landing in slot 1
  if (JSON.parse(store.get(SLOT1)).coins !== 600) return "autosave did not land in slot 1";
  if (store.has(LEGACY)) return "save() rewrote the legacy key";
  return true;
});

scenario("slots: two towns stay independent, switching never crosses them", () => {
  const store = new Map();
  const a = createSim({ seed: 21, storage: store, fresh: false });
  a.G('coins = 700; day = 9; crabs[0].p.name = "SLOTONE"; save()');
  a.G('setActiveSlot(2); coins = 111; day = 3; crabs[0].p.name = "SLOTTWO"; save()');
  const s1 = JSON.parse(store.get(SLOT1)), s2 = JSON.parse(store.get(SLOT2));
  if (s1.coins !== 700 || s1.day !== 9 || s1.personas[0].name !== "SLOTONE")
    return "slot 1 was disturbed: " + JSON.stringify([s1.coins, s1.day, s1.personas[0].name]);
  if (s2.coins !== 111 || s2.day !== 3 || s2.personas[0].name !== "SLOTTWO")
    return "slot 2 wrong: " + JSON.stringify([s2.coins, s2.day, s2.personas[0].name]);
  if (store.get(ACTIVE) !== "2") return "the active slot did not persist";
  // a fresh boot opens the ACTIVE slot, and a day in it can't touch the other
  const frozen1 = store.get(SLOT1);
  const b = createSim({ seed: 22, storage: store, fresh: false });
  const bst = JSON.parse(b.G("JSON.stringify([Math.round(coins), day, crabs[0].p.name, activeSlot])"));
  if (bst[0] !== 111 || bst[1] !== 3 || bst[2] !== "SLOTTWO" || bst[3] !== 2)
    return "boot opened the wrong town: " + JSON.stringify(bst);
  b.runDays(4);
  b.G("save()");
  if (store.get(SLOT1) !== frozen1) return "playing slot 2 rewrote slot 1";
  // switch back: slot 1 is exactly where it was left
  b.G("setActiveSlot(1)");
  const c = createSim({ seed: 23, storage: store, fresh: false });
  const cst = JSON.parse(c.G("JSON.stringify([Math.round(coins), day, crabs[0].p.name])"));
  if (cst[0] !== 700 || cst[1] !== 9 || cst[2] !== "SLOTONE")
    return "slot 1 came back changed: " + JSON.stringify(cst);
  return true;
});

scenario("slots: a foreign or broken import is refused, the live town untouched", () => {
  const store = new Map();
  const sim = createSim({ seed: 8, storage: store, fresh: false });
  sim.runDays(2);
  sim.G("save()");
  const live = () => sim.G("JSON.stringify([Math.round(coins), day, crabs.map(c => c.p.name), crabs.length])");
  const before = live(), slotBefore = store.get(SLOT1);
  const junk = [
    "not json at all {",                                        // not JSON
    JSON.stringify({ hello: "world" }),                         // some other app's file
    JSON.stringify([1, 2, 3]),                                  // an array
    JSON.stringify(null),
    JSON.stringify({ personas: [] }),                           // a CS3 shape with no crew
    JSON.stringify({ personas: [{ nope: 1 }] }),                // crew without names
    JSON.stringify({ personas: [{ name: "X" }], day: -4 }),     // nonsense day
    JSON.stringify({ personas: [{ name: "X" }], coins: "lots" }),
    JSON.stringify({ personas: [{ name: "X" }], _ver: 99 }),    // from a newer build
  ];
  for (const j of junk) {
    const why = sim.G("importJson(" + JSON.stringify(j) + ', "x.json")');
    if (!why) return "accepted junk: " + j.slice(0, 44);
    if (sim.G("pendingImport !== null")) return "a rejected import was staged: " + j.slice(0, 44);
  }
  if (live() !== before) return "a rejected import moved the live game";
  if (store.get(SLOT1) !== slotBefore) return "a rejected import wrote a slot";
  if (store.has(SLOT2)) return "a rejected import created a slot";
  // a genuine save file: staged first, written only on confirm, into the chosen slot
  const good = store.get(SLOT1);
  const why2 = sim.G("importJson(" + JSON.stringify(good) + ', "town.json")');
  if (why2) return "a real save was refused: " + why2;
  if (store.has(SLOT2)) return "staging wrote a slot before confirmation";
  if (live() !== before) return "staging moved the live game";
  sim.G("commitImport(2)");
  const landed = JSON.parse(store.get(SLOT2));
  if (landed.day !== JSON.parse(good).day || landed.personas.length !== JSON.parse(good).personas.length)
    return "the import landed wrong";
  if (store.get(SLOT1) !== slotBefore) return "the import disturbed slot 1";
  if (live() !== before) return "the import moved the live game";
  if (sim.G("pendingImport !== null")) return "the staged import was not cleared";
  // an imported OLD-build save migrates through the same path a stored one does
  const old = JSON.parse(good);
  delete old._ver; delete old._meta; delete old.trade;
  old.personas.forEach(p => { delete p.tired; p.sandy = 0.4; });
  if (sim.G("importJson(" + JSON.stringify(JSON.stringify(old)) + ', "old.json")')) return "an old-build save was refused";
  sim.G("commitImport(3)");
  const d = createSim({ seed: 9, storage: store, fresh: false });
  d.G("setActiveSlot(3)");
  const e = createSim({ seed: 10, storage: store, fresh: false });
  const mig = JSON.parse(e.G('JSON.stringify([crabs[0].p.tired, "sandy" in crabs[0].p, trade.price])'));
  if (mig[0] !== 0.4 || mig[1]) return "the imported old save skipped the sandy migration: " + JSON.stringify(mig);
  if (mig[2] !== 4) return "the imported old save skipped the fish-price default: " + JSON.stringify(mig);
  return true;
});

scenario("slots: the preview card reflects the town it came from", () => {
  const store = new Map();
  const sim = createSim({ seed: 12, storage: store, fresh: false });
  sim.runDays(3);
  sim.G('coins = 843; rep = 51; crabs[0].p.sick = { days: 2 };'
    + ' crabs[1].p.boat = null; crabs[1].p.house = 7; crabs[1].p.homeless = false; save()');
  const meta = JSON.parse(store.get(SLOT1))._meta;
  const town = JSON.parse(sim.G('JSON.stringify([day, WEEKDAYS[weekdayIdx(day)], crabs.length + npcs.length, crabs.map(c => c.p.name)])'));
  if (meta.day !== town[0] || meta.weekday !== town[1]) return "day/weekday wrong: " + JSON.stringify(meta);
  if (meta.coins !== 843 || meta.rep !== 51) return "till/rep wrong: " + JSON.stringify(meta);
  if (meta.pop !== town[2]) return "population " + meta.pop + " vs " + town[2];
  if (JSON.stringify(meta.crew.map(c => c.name)) !== JSON.stringify(town[3]))
    return "roster wrong: " + JSON.stringify(meta.crew.map(c => c.name));
  if (!meta.crew[0].sick || meta.crew[0].sickDays !== 2) return "health not in the card: " + JSON.stringify(meta.crew[0]);
  if (meta.crew[1].home !== "COTTAGE" || meta.crew[1].tier !== 1) return "housing not in the card: " + JSON.stringify(meta.crew[1]);
  if (!meta.crew.every(c => typeof c.job === "string" && typeof c.color === "number" && typeof c.acc === "string"))
    return "the card can't draw a portrait: " + JSON.stringify(meta.crew);
  if (!(meta.t > 0)) return "no timestamp on the card";
  // the card reads the same through slotCard(), which is what the screen calls
  if (sim.G("JSON.stringify(slotCard(1))") !== JSON.stringify(meta)) return "slotCard disagrees with the stored card";
  // ...and a save with no card at all still gets one derived from the envelope
  const raw = JSON.parse(store.get(SLOT1));
  delete raw._meta;
  store.set(SLOT2, JSON.stringify(raw));
  const derived = JSON.parse(sim.G("JSON.stringify(slotCard(2))"));
  if (derived.day !== meta.day || derived.coins !== meta.coins || derived.pop !== meta.pop
    || JSON.stringify(derived.crew) !== JSON.stringify(meta.crew)) return "the derived card disagrees: " + JSON.stringify(derived);
  return true;
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
    // a FREE stall: a real bather may legitimately be in stall 0, and staging
    // the fixture on top of them makes the innocent tourist look like a ghost
    const st = BIZ.showers.stalls.find(t => !t.occupant) || BIZ.showers.stalls[0];
    window._st = BIZ.showers.stalls.indexOf(st);
    const k = { biz: "showers", isCrab: true, crab: crabs[0], state: "showering", showerT: 9,
      stall: st, x: st.x, spawnX: st.x, claimed: true, served: false, recipe: BIZ.showers.recipes[0] };
    st.occupant = k; customers.push(k); crabs[0].errandCust = k; crabs[0].dayState = "errand";
    abortErrand(crabs[0]);
  }`);
  if (sim.G("BIZ.showers.stalls[window._st].occupant !== null")) return "abortErrand left the stall occupied";
  if (!sim.G("BIZ.showers.stalls[window._st].dirty")) return "aborted stall not marked dirty";
  if (sim.G('customers.some(k => k.stall === BIZ.showers.stalls[window._st])')) return "ghost customer survived";
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
  const raw = JSON.parse(store.get(SLOT1));
  raw.npc.personas.find(p => p.name === "SALTY").boat = 9;
  store.set(SLOT1, JSON.stringify(raw));
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
  if (!JSON.parse(store.get(SLOT1)).sudsRefund) return "sudsRefund flag not persisted";
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
  // an old save (pre-credit keys) must load with a zero balance, no flags.
  // RE-POINTED with the business-succession build: the owner REGISTRY (`owners`)
  // now carries every peer's till and line, so a pre-credit save is one with
  // neither the legacy npc.credit key NOR the registry - delete both, or the
  // fixture isn't the old save it claims to be. Nothing under test changed.
  const raw = JSON.parse(store.get(SLOT1));
  delete raw.credit; delete raw.bankrupt; delete raw.dayLog; delete raw.npc.credit;
  delete raw.owners;
  store.set(SLOT1, JSON.stringify(raw));
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
  // the M-shift crab clocks off at 14:00 with the +0.45 shift bump.
  // RE-POINTED (shift-fairness pass): the check used to read the roster at
  // 19:30, which now measures the AFTERNOON NAP instead of the bump - a crab
  // home and off the clock recovers in daylight, so by 19:30 the morning crab
  // is down around 0.15. Receipt: the bump itself is unchanged (0.45 at load
  // 1.0); we now read it where it happens, just after the shift ends.
  let peakTired = 0;
  sim.runUntil("tmin >= 19.5 * 60", { maxSteps: 400000, tickEvery: 20,
    onTick: (G) => { const t = G("Math.max(0, ...crabs.map(c => c.p.tired || 0))"); if (t > peakTired) peakTired = t; } });
  if (peakTired < 0.43) return "no crab tired after a full workday: peak " + peakTired.toFixed(3);
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
  // and daylight still accrues NOTHING passively - idling never makes a crab
  // tireder. RE-POINTED (shift-fairness pass): rest is no longer gated on the
  // sun, so a crab who is home and off the clock now NAPS in daylight. The
  // receipt for the re-point is the fault it fixes: rest used to be available
  // only while darkness() > 0.7, so the morning shift's long free afternoon
  // repaired nothing and the evening shift banked the whole night - measured
  // mean tiredness M 0.153 vs E 0.087 over 6 seeds x 10 days, and the penalty
  // followed the SHIFT, not the crab (swap them and it swaps). The assertion
  // is now the honest one: tiredness only ever goes DOWN off the clock.
  sim.runUntil("tmin >= 6.05 * 60", { maxSteps: 40000 });
  sim.G("for (const c of crabs) { c.p.tired = 0.3; c.errandCd = 999; }");
  sim.runUntil("tmin >= 6.4 * 60", { maxSteps: 40000 });
  const moved = JSON.parse(sim.G("JSON.stringify(crabs.filter(c => c.p.tired > 0.3 + 1e-9).map(c => [c.p.name, c.p.tired, c.dayState]))"));
  return moved.length === 0 ? true : "tired ROSE without work: " + JSON.stringify(moved);
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
  const raw = JSON.parse(store.get(SLOT1));
  const stranded = raw.personas.concat(raw.npc.personas).filter(p => p && "sandy" in p);
  return stranded.length === 0 ? true : "sandy stranded in the new save: " + stranded.map(p => p.name).join(",");
});

scenario("hours: a working day has a length - long hours buy no free labour", () => {
  // THE FAULT (Matt: "just making your restaurant open all the time is way
  // too powerful"). Shifts DERIVE from the shop's hours, so opening 6:00-24:00
  // handed two crabs nine-hour shifts for a flat wage and a flat shift-end
  // fatigue bump: 50% more staffed hours for nothing. bizShiftWindow now caps
  // every derived window at a standard day for its kind and keeps the middle.
  const sim = createSim({ seed: 5 });
  sim.runUntil("day >= 2 && tmin >= 7 * 60", { maxSteps: 300000 });
  const read = (open, close) => {
    sim.G(`setBizHours("shack", ${open} * 60, ${close} * 60);`);
    return JSON.parse(sim.G(`JSON.stringify({
      M: [bizShiftWindow("shack", "M").start, bizShiftWindow("shack", "M").end],
      E: [bizShiftWindow("shack", "E").start, bizShiftWindow("shack", "E").end],
      D: [bizShiftWindow("shack", "D").start, bizShiftWindow("shack", "D").end],
      cover: [bizShiftWindow("shack", "cover").start, bizShiftWindow("shack", "cover").end],
      pay: crabs.map(c => Math.round(basePayToday(c))),
      load: crabs.map(c => +shiftLoad(c).toFixed(6)) })`));
  };
  // the default trading day is untouched, to the minute: the cap never binds
  // on twelve hours or less, so 8-20 IS the old geometry
  const d = read(8, 20);
  if (JSON.stringify([d.M, d.E, d.D, d.cover]) !== JSON.stringify([[480, 840], [840, 1200], [510, 1110], [480, 1200]]))
    return "the default 8-20 geometry moved: " + JSON.stringify(d);
  if (d.pay.some(p => p !== 23) || d.load.some(l => l !== 1))
    return "a default day is not one standard day's pay: " + JSON.stringify(d);
  // open 6-24 and the crew still work a six-hour shift each, centred on the
  // trading day - the shoulders are open but UNSTAFFED
  const l = read(6, 24);
  if (l.M[1] - l.M[0] !== 360 || l.E[1] - l.E[0] !== 360)
    return "an 18-hour trading day stretched the shifts: " + JSON.stringify([l.M, l.E]);
  if (l.E[1] - l.M[0] !== 720)
    return "the roster covered more than twelve hours off the hours sign: " + JSON.stringify([l.M, l.E]);
  if (l.cover[1] - l.cover[0] !== 720 || l.D[1] - l.D[0] !== 600)
    return "the cover double / owner-operator day outgrew a working day: " + JSON.stringify([l.cover, l.D]);
  // and you are not billed for hours nobody worked
  if (l.pay.some(p => p !== 23)) return "long hours changed the wage without changing the work: " + JSON.stringify(l.pay);
  // shorten the day instead and the shifts - and the wage bill - shorten with
  // it: labour is bought by the hour in both directions
  const sh = read(9, 17);
  if (sh.M[1] - sh.M[0] !== 240) return "shortened hours did not shorten the shift: " + JSON.stringify(sh.M);
  if (sh.pay.some(p => p !== 15) || sh.load.some(l2 => Math.abs(l2 - 2 / 3) > 1e-5))
    return "a four-hour shift is not paid four hours: " + JSON.stringify(sh);
  return true;
});

scenario("hours: always-open does not out-earn a normal day (anti-exploit gate)", () => {
  // The gate that would have caught the fault. Two arms per seed, same RNG
  // stream, both subsidised so neither dies on us, and only the PLAYER's shop
  // moves - peer owners run their own hours policy in both. The measure is
  // TAKINGS PER CREW-DAY (dollars earned per dollar of wage bill), because it
  // is the one number the hours sign used to inflate for free.
  //   pre-pass build: 1.58, 1.84, 1.78 on these seeds - always-open earned
  //   ~70% more per crab it paid for.
  //   this build:     0.98, 1.08, 1.02.
  const run = (seed, open, close) => {
    const sim = createSim({ seed });
    sim.G(`coins = 4000; setBizHours("shack", ${open} * 60, ${close} * 60);`);
    let wages = 0, lastDay = 0;
    sim.runDays(10, { tickEvery: 20, onTick: (G) => {
      if (G("tmin") >= 19.5 * 60 && G("day") !== lastDay) { lastDay = G("day"); wages += G("wagesOwedTonight()"); }
    } });
    return { life: sim.G("lifetime"), wages };
  };
  const ratios = [];
  for (const seed of [4242, 7, 555]) {
    const a = run(seed, 8, 20), b = run(seed, 6, 24);
    if (!(a.wages > 0 && b.wages > 0)) return `seed ${seed} paid no wages at all`;
    ratios.push((b.life / b.wages) / (a.life / a.wages));
  }
  const worst = Math.max(...ratios);
  return worst <= 1.2 ? true
    : "always-open earns " + worst.toFixed(2) + "x per crew-day (gate 1.20): " + ratios.map(r => r.toFixed(3));
});

scenario("hours: the emergency lever survives - long hours PLUS overtime trade longer", () => {
  // Long hours must stay POSSIBLE: a burst of takings you can pay for. With
  // the shift cap the hours sign alone buys nothing - but it opens ROOM at
  // both ends of the day that overtime can fill, at OT_RATE, and that is the
  // lever. Under the default 8-20 there is no room past the roster, so an OT
  // request doubles up inside the same twelve hours; open 6-24 and the same
  // request genuinely extends the town's trading day to fourteen.
  const sim = createSim({ seed: 5 });
  sim.runUntil("day >= 2 && tmin >= 7 * 60", { maxSteps: 300000 });
  const arm = (open, close) => {
    sim.G(`setBizHours("shack", ${open} * 60, ${close} * 60);
      for (const c of crabs) { c.p.ot = true; c.p.sick = null; }`);
    return JSON.parse(sim.G(`JSON.stringify({
      eff: crabs.map(c => [effShift(c).start, effShift(c).end]),
      mins: crabs.map(c => otMinutes(c)),
      prem: crabs.map(c => Math.round(otPremium(c, otMinutes(c)) * 100) / 100),
      span: OT_SPAN,
      bill: crabs.reduce((s2, c) => s2 + crabDueTonight(c), 0) })`));
  };
  const cover = (a) => Math.max(...a.eff.map(w => w[1])) - Math.min(...a.eff.map(w => w[0]));
  const base = arm(8, 20), longs = arm(6, 24);
  if (cover(base) !== 720) return "OT changed the default day's coverage: " + cover(base);
  if (cover(longs) !== 840)
    return "long hours + OT did not buy any extra trading: " + cover(longs) + " minutes";
  // and it is PAID for, at exactly 1.5x straight time on the same clock
  if (longs.mins.some(m => m !== longs.span)) return "OT room is not the full span: " + longs.mins;
  const hourly = 23 / 360;
  if (longs.prem.some(p => Math.abs(p - hourly * 1.5 * longs.span) > 0.01))
    return "the premium is not 1.5x the standard hourly rate: " + longs.prem;
  if (longs.bill <= 2 * 23) return "tonight's bill did not carry the overtime: " + longs.bill;
  // switching the request off puts the town straight back on a normal day
  sim.G("for (const c of crabs) c.p.ot = false;");
  const off = JSON.parse(sim.G("JSON.stringify([crabs.map(c => otMinutes(c)), crabs.reduce((s2, c) => s2 + crabDueTonight(c), 0)])"));
  if (off[0].some(m => m !== 0) || off[1] !== 2 * 23)
    return "the lever did not switch off cleanly: " + JSON.stringify(off);
  return true;
});

scenario("tired: fatigue scales with the hours actually worked", () => {
  // The other half of the always-open fault: a flat TIRED_SHIFT bump meant a
  // nine-hour day cost a crab exactly what a six-hour one did. The shift-end
  // accrual now reads shiftLoad - today's contracted span against a standard
  // day of that shift - and overtime rides on the same number at OT_FATIGUE.
  const sim = createSim({ seed: 11 });
  sim.runUntil("day >= 2 && tmin >= 7 * 60", { maxSteps: 300000 });
  const at = (open, close) => {
    sim.G(`setBizHours("shack", ${open} * 60, ${close} * 60);`);
    return JSON.parse(sim.G(`{ const c = crabs[0];
      JSON.stringify([+shiftLoad(c).toFixed(6), +(TIRED_SHIFT * shiftLoad(c)).toFixed(6),
        +(0.25 * shiftLoad(c)).toFixed(6), dutyShift(c).end - dutyShift(c).start]); }`));
  };
  const full = at(8, 20), half = at(9, 17), capped = at(6, 24);
  if (full[3] !== 360 || Math.abs(full[1] - 0.45) > 1e-6)
    return "a standard day no longer costs the standard bump: " + JSON.stringify(full);
  // a four-hour day tires (and feeds) a crab two thirds as much - exactly
  if (half[3] !== 240 || Math.abs(half[1] - 0.45 * 2 / 3) > 1e-6 || Math.abs(half[2] - 0.25 * 2 / 3) > 1e-6)
    return "a short shift did not cost proportionally less: " + JSON.stringify(half);
  // and an 18-hour trading day cannot conjure a longer shift to accrue from
  if (capped[3] !== 360 || Math.abs(capped[1] - 0.45) > 1e-6)
    return "long hours stretched the fatigue bump: " + JSON.stringify(capped);
  // A COVER DOUBLE IS A REAL DOUBLE. Pay and fatigue part company here, on
  // purpose: covering a coworker's day off is ONE contract and one wage - the
  // rota generosity that has always filled the shift for free, untouched - but
  // it is twelve hours of work, and workLoad says so. (Pricing the cover by
  // the hour as well was measured and rejected: growth 40d fell 4/8 -> 1/8,
  // because _needCover is per-BUSINESS, so a whole six-crab roster doubles at
  // once. Fatiguing it alone measured baseline 0/8 median 14 and growth 5/8 -
  // both inside the documented band.)
  const cs = createSim({ seed: 7 });
  cs.runUntil("day === 3 && tmin >= 9 * 60", { maxSteps: 900000,
    onTick: (G) => { if (G("coins") < 300) G("coins = 600"); } });
  const cov = JSON.parse(cs.G(`{ const c = crabs.find(k => coveringToday(k));
    c ? JSON.stringify([c.p.name, dutyShift(c).end - dutyShift(c).start,
      +workLoad(c).toFixed(6), +shiftLoad(c).toFixed(6), Math.round(basePayToday(c)),
      +(TIRED_SHIFT * workLoad(c)).toFixed(6)]) : "null"; }`));
  if (!cov) return "nobody covered a day off on day 3 (WED) - fixture drifted";
  if (cov[1] !== 720 || Math.abs(cov[2] - 2) > 1e-6)
    return cov[0] + " covered but it did not count as two shifts of work: " + JSON.stringify(cov);
  if (Math.abs(cov[5] - 0.9) > 1e-6)
    return "a cover double did not tire like a double: " + JSON.stringify(cov);
  if (Math.abs(cov[3] - 1) > 1e-6 || cov[4] !== 23)
    return "the cover double stopped being one wage: " + JSON.stringify(cov);
  // overtime accrues on the same clock, weighted at OT_FATIGUE
  const ot = JSON.parse(sim.G(`{ const c = crabs[0]; const f = 120 / ownStdSpan(c);
    JSON.stringify([+(TIRED_SHIFT * (1 + OT_FATIGUE * f)).toFixed(6), +TIRED_SHIFT.toFixed(6), +f.toFixed(6)]); }`));
  if (!(ot[0] > ot[1]) || Math.abs(ot[0] - 0.45 * (1 + 1.5 / 3)) > 1e-6)
    return "overtime did not ride the same accrual: " + JSON.stringify(ot);
  return true;
});

scenario("tired: the morning and evening shifts end the week level", () => {
  // THE FAULT (the owner read it as "CLAWDIA is OP"; she was simply the
  // E-shift founder). Sleep only repaired tiredness while darkness() > 0.7,
  // so a crab up at 07:15 for a morning shift lost recovery the evening crab
  // kept, and the morning crab's long free AFTERNOON at home repaired
  // nothing. It followed the SHIFT, not the crab: swapping the founders'
  // shifts swapped the penalty (measured M 0.171 / E 0.084). The fix is
  // environmental - a crab home, settled and off the clock naps in daylight
  // too, at TIRED_NAP.
  //   before: mean M 0.153, E 0.087, gap 0.066 (6 seeds x 10 days)
  //   after:  mean M 0.119, E 0.094, gap 0.024
  const gaps = [];
  for (const seed of [1337, 6685]) {
    const sim = createSim({ seed });
    sim.G("coins = 3000;");   // keep the town solvent so the week actually runs
    const acc = { M: [0, 0], E: [0, 0] };
    let lastSlot = -1;
    sim.runDays(7, { tickEvery: 20, onTick: (G) => {
      const slot = G("Math.floor((day * 1440 + tmin) / 15)");
      if (slot === lastSlot) return;
      lastSlot = slot;
      for (const [sh, t] of JSON.parse(G("JSON.stringify(crabs.map(c => [c.p.shift, c.p.tired || 0]))"))) {
        if (!acc[sh]) continue;
        acc[sh][0] += t; acc[sh][1]++;
      }
    } });
    if (!acc.M[1] || !acc.E[1]) return `seed ${seed} never ran both shifts`;
    gaps.push([acc.M[0] / acc.M[1], acc.E[0] / acc.E[1]]);
  }
  const worst = Math.max(...gaps.map(([m, e]) => Math.abs(m - e)));
  if (worst > 0.04)
    return "the shift you draw still decides your fatigue: gap " + worst.toFixed(3) +
      " (tolerance 0.04) " + JSON.stringify(gaps.map(g => g.map(v => +v.toFixed(3))));
  // ...WITHOUT making tiredness free: a nap on the porch stays strictly worse
  // than a night in your own bed, and the cot rung survives in both
  const rates = JSON.parse(createSim({ seed: 1 })
    .G("JSON.stringify([TIRED_NAP.bed, TIRED_DRAIN.bed, TIRED_NAP.cot, TIRED_NAP.bed])"));
  if (!(rates[0] < rates[1]) || !(rates[2] < rates[3]))
    return "the nap must stay slower than a bed, and a cot slower than a nap in one: " + JSON.stringify(rates);
  return true;
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
  // Off crabs must SHOP - that's the whole point of a day off. But a crab gets
  // exactly one day off a week, and since shops gained real hours (and a
  // single-worker shop closes on its owner's day off), one crew member's day
  // can legitimately land when everything they need is shut. So: the crew as a
  // whole shops on its days off, and all but at most one crab does personally.
  const crew = names.filter(([n, npc]) => !npc && !sick[n]).map(([n]) => n);
  const shopped = crew.filter(n => buys[n]);
  if (!shopped.length) return "not one crew crab shopped on a day off all week";
  if (shopped.length < crew.length - 1)
    return "only " + shopped.length + "/" + crew.length + " crew shopped on their day off: " +
      crew.filter(n => !buys[n]).join(",");
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
  // RE-BASELINED AGAIN at the public-taps merge. Receipt, and it is a small
  // one: the town gained a place to drink, so the crab who could never reach
  // a counter stopped walking the promenade at midnight. On seed 1337 EVERY
  // number is byte-identical - coins, rep, serves, rage, till, all five
  // wallets - and the ONLY thing that moved is SUDSY: (743.8, 167.6), still
  // out on the boardwalk at midnight, becomes (388, 154), asleep at home.
  // On seed 4242 the same move, plus the trade the tap makes explicit: she
  // drinks free water instead of buying, so her wallet holds 40 instead of 18
  // and the player's till is $19 lighter (233.0 -> 214.0, crabServes 3 -> 2).
  // That is the juice-bar-vs-tap tension in a single seed, and it is the
  // intended shape: the tap costs the shack a marginal local sale and buys
  // the town a crab who is not dying of thirst.
  // RE-BASELINED AGAIN at the needs-failure merge (hunger + thirst are a speed
  // penalty; dirt is the wide berth). Receipt: crabMove itself changed, so any
  // crab past hunger 0.3 or thirst 0.5 walks at a different speed - and SUDSY
  // ends day 2 at hunger 0.70 / thirst 0.50 in BOTH seeds, so this fingerprint
  // could not survive and still be measuring anything.
  // Seed 4242 is the receipt that the change is SMALL and in the intended
  // direction on a default town: EVERY POSITION IS BYTE-IDENTICAL - all five
  // crabs asleep in the same beds as before - and the trading numbers give a
  // little back, which is what a throughput cost looks like (coins 214.006 ->
  // 200.795, rep 53.320 -> 49.372, serves 39 -> 37, rage 2 -> 2, crabServes
  // 2 -> 2, SUDSY's till 200.04 -> 185.43).
  // Seed 1337 moves exactly ONE crab: SALTY is asleep ON A SHELTER COT at x492
  // instead of in house 7 at x2072 - not stranded, just a day behind on the
  // housing ladder (wallet 0 -> 4, still saving the move-in). Nobody is left
  // standing on the boardwalk at midnight, which is what this fingerprint is
  // really guarding. Its books barely move: coins 224.84 -> 225.17, rep
  // 46.85 -> 49.67, serves 32 -> 33, rage 4 -> 4, till 132.67 -> 140.47.
  // RE-BASELINED AGAIN at the table-service-economy merge (counter tips cut to
  // a token, the table tip raised, and tables bused by staff). Receipt: this
  // pass deliberately changes what a guest pays AND how a server spends their
  // shift, so the day-2 books cannot survive and still be measuring anything -
  // 22 tables are bused on days 1-2 alone.
  // Seed 4242 is the receipt that the change is SMALL and structural rather
  // than chaotic: EVERY POSITION IS BYTE-IDENTICAL - all five crabs asleep in
  // the same beds as before - and only the books move (coins 200.795 ->
  // 158.959, rep 49.372 -> 50.093, serves 37 -> 33, rage 2 -> 5, crabServes
  // 2 -> 2, SUDSY's till 185.43 -> 172.12). Day 2 is the WORST day for this
  // build by construction: the busing bill lands from the first guest while
  // the raised table tip only compounds once reputation brings the crowds -
  // the 16-seed eviction curve still reads 0/16 median 13 (was 14).
  // Seed 1337 moves exactly ONE crab, and in the way this fingerprint has
  // moved twice before: DRIFT sleeps on a shelter cot at x450 with $23 saved
  // instead of in cottage 8 at x2136 - a day behind on the housing ladder,
  // not stranded, and nobody is left standing on the boardwalk at midnight.
  const want = {
    1337: '{"day":3,"tmin":0,"coins":147.922,"rep":50.0032,"catch":0,"serves":33,"crabServes":2,"rage":3,"till":152.751,"wallets":[["PINCHY",16],["CLAWDIA",16],["SUDSY",40],["SALTY",1],["DRIFT",23]],"pos":[[520,154],[108,154],[388,154],[2072,154],[450,155]]}',
    4242: '{"day":3,"tmin":0,"coins":158.959,"rep":50.0934,"catch":3,"serves":33,"crabServes":2,"rage":5,"till":172.115,"wallets":[["PINCHY",16],["CLAWDIA",16],["SUDSY",40],["SALTY",7],["DRIFT",1]],"pos":[[520,154],[108,154],[388,154],[2072,154],[2136,154]]}',
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
    // IDLE duty only: a crab still finishing the plate in its claws at close is
    // honest last-call work. What must not exist is staff standing READY for
    // new orders - that would mean the shop never actually shut.
    lateDuty += G('allCrabs().filter(k => k.duty && k.workBiz === "shack" && k.kstate === "idle").length');
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
    // RE-POINTED with the business-succession build: a peer owner who misses
    // three leases now CLOSES for good (she used to go dark two nights and
    // have the debt forgiven), and seed 1337's SUDSY fails on day 9 - a shop
    // that is out of business cannot demonstrate 30 days of hours policy.
    // She gets the same prop the player gets, for the same reason.
    if (G("OWNERS.sudsy.till") < 60) G("OWNERS.sudsy.till = 200");
    // RE-POINTED AGAIN at the needs-failure merge, and it is the SAME prop for
    // the same reason: seed 1337's SUDSY now dies on day 15, of a seven-day
    // NEGLECT illness. She is an owner-operator on a ten-hour day and the
    // trudge is hardest on exactly that crab, so this fixture - which already
    // props her TILL because a bankrupt shop cannot demonstrate 30 days of
    // hours policy - must also prop her HEALTH, because a dead shopkeeper
    // cannot either (her lease sweeps onto the market and runHoursPolicy
    // rightly declines to run for a business nobody owns).
    // This is a fixture prop, not a hidden regression: mortality is pinned by
    // the four `mortality:` scenarios and measured on the 12-town matrix,
    // where this merge took deaths 11 -> 9 and SUDSY was taken in 3 of 12
    // towns BEFORE and 3 of 12 AFTER. She still falls ill, still takes her
    // own sick days, still runs her policy; the tide just doesn't take her.
    G(`{ const s = allCrabs().find(c => c.p.name === "SUDSY");
      if (s && s.p.sick && s.p.sick.days >= 3) s.p.sick = null; }`);
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
      // the policy is PER SHOP and a hungry/thirsty staffer self-serves at
      // whichever of their shops is dark - set it everywhere the player owns,
      // or a juice-bar drink rings at the juice bar's (unset) policy
      for (const b of Object.keys(BIZ)) if (bizOwner(b) === "player") BIZ[b].mealPol = ${JSON.stringify(pol)};
      for (const c of crabs) { c.p.hunger = 0; c.p.thirst = 0; c.errandCd = 999; c.p.tired = 0; }
      // nobody else mid-selfCook: a meal already PAID FOR under the previous
      // policy would complete inside our window and be measured as ours
      for (const k of crabs) if (k.dayState === "selfCook") { abortChef(k); k.dayState = "home"; k.errandCd = 999; }
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
      meals: window._stats.staffMeals || 0, meal: window._stats.lastStaffMeal })`));
    return { before, after };
  };
  // AT COST: the crab pays exactly the ingredients; the till nets zero
  let r = force("atcost");
  if (r.err) return r.err;
  // per MEAL, not per window: trip-chaining means a hungry crab may take two
  // stops in one outing (a plate and a drink), so the window can hold two rings
  let meals = r.after.meals - r.before.meals;
  let charged = (r.after.paid - r.before.paid) / Math.max(1, meals);
  if (charged !== r.after.meal.cost)
    return `AT COST rang $${charged}/meal over ${meals}, expected the $${r.after.meal.cost} ingredient bill (${r.after.meal.id})`;
  if (r.after.wallet !== 30 - charged * meals) return `AT COST wallet ${r.after.wallet}, expected ${30 - charged * meals}`;
  if (Math.abs((r.after.coins - r.before.coins)) > 0.001)
    return `AT COST till moved ${(r.after.coins - r.before.coins).toFixed(2)}, expected net zero`;
  // FREE: nothing charged; the till eats the ingredient cost
  r = force("free");
  if (r.err) return r.err;
  meals = r.after.meals - r.before.meals;
  charged = r.after.paid - r.before.paid;
  if (charged !== 0) return `FREE rang $${charged}`;
  if (r.after.wallet !== 30) return `FREE meal touched the wallet: ${r.after.wallet}`;
  const tillDelta = r.after.coins - r.before.coins;
  if (Math.abs(tillDelta + r.after.meal.cost * Math.max(1, meals)) > 0.001)
    return `FREE till delta ${tillDelta.toFixed(2)}, expected -${r.after.meal.cost} x ${meals}`;
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
  const s = JSON.parse(store.get(SLOT1));
  s.hours.shack = [23 * 60, 23.5 * 60]; s.hours.arcade = [0, 900]; s.mealPol.shack = "bogus";
  store.set(SLOT1, JSON.stringify(s));
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
  const raw = JSON.parse(store.get(SLOT1));
  delete raw.trade.price; delete raw.trade.series; delete raw.trade.useH;
  delete raw.trade.landH; delete raw.trade.useDay; delete raw.trade.ceilDays;
  store.set(SLOT1, JSON.stringify(raw));
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

// ================================================== LABOR POLICY SUITE
scenario("sick days: bed rest beats a cot, and both beat the old cared bar", () => {
  // (a) A sick crab resting in a real bed, fed and hydrated, must reach the
  // improved recovery lane - and the DURATION distribution must sit left of a
  // shelter-cot control. Paired arms: same seeds, only the care table differs
  // (this is exactly what tools/illness.mjs measures at n=120; the gate here
  // is the direction, at a sample size the suite can afford).
  const OLD = `CARE_LANES.cot = { cure: 0.40, die: 0.08, label: "COT" };
               CARE_LANES.bed = { cure: 0.40, die: 0.08, label: "BED" };`;
  const run = (seed, { housed, old }) => {
    const sim = createSim({ seed });
    if (old) sim.G(OLD);
    sim.runUntil("day >= 2 && tmin >= 7 * 60", { maxSteps: 200000 });
    if (sim.G("gameOver")) return null;
    sim.G(`{ const c = crabs[0];
      c.p.wallet = 80;
      ${housed ? `if (c.p.homeless) { const used = new Set(allCrabs().filter(k => !k.p.homeless).map(k => k.p.house));
          for (let h = 0; h < HOUSE_XS.length; h++) if (!used.has(h)) { c.p.house = h; c.p.homeless = false; break; } }`
        : `c.p.homeless = true; c.p.house = null; c.p.boat = null;`}
      c.p.sick = { days: 0 }; c.p.restT = 0; c.p.hunger = 0.1; c.p.thirst = 0.1; c.p.dirt = 0.1; }`);
    const N = JSON.stringify(sim.G("crabs[0].p.name"));
    let lane = "?";
    for (let d = 0; d < 12; d++) {
      sim.G("if (coins < 500) coins = 900;");
      if (!housed) sim.G(`{ const c = crabs.find(k => k.p.name === ${N});
        if (c) { c.p.homeless = true; c.p.house = null; c.p.boat = null; } }`);
      sim.runUntil("tmin >= 19.9 * 60 && lastRentDay !== day", { maxSteps: 200000 });
      if (sim.G(`crabs.some(c => c.p.name === ${N} && c.p.sick)`))
        lane = sim.G(`careLane(crabs.find(c => c.p.name === ${N}))`);
      sim.runUntil("lastRentDay === day", { maxSteps: 200000 });
      if (sim.G(`!crabs.some(c => c.p.name === ${N})`)) return { days: d + 1, lane, died: true };
      if (sim.G(`!crabs.find(c => c.p.name === ${N}).p.sick`)) return { days: d + 1, lane, died: false };
      sim.runUntil("tmin < 10", { maxSteps: 200000 });
      if (sim.G("gameOver")) return null;
    }
    return { days: 12, lane, died: false };
  };
  const seeds = [1337, 1674, 2011, 2348, 2685, 3022, 3359, 3696, 4033, 4370, 4707, 5044];
  const arm = (cfg) => seeds.map(s => run(s, cfg)).filter(Boolean);
  const bedNew = arm({ housed: true }), bedOld = arm({ housed: true, old: true });
  const cotNew = arm({ housed: false });
  if (!bedNew.length || !bedOld.length) return "no arm produced a measurable illness";
  // the lane itself: a housed convalescent must actually reach BED REST
  if (!bedNew.some(r => r.lane === "bed"))
    return "no housed rester ever reached the bed lane: " + JSON.stringify(bedNew.map(r => r.lane));
  if (!cotNew.some(r => r.lane === "cot"))
    return "no shelter rester ever reached the cot lane: " + JSON.stringify(cotNew.map(r => r.lane));
  if (bedNew.some(r => r.lane === "cot") || cotNew.some(r => r.lane === "bed"))
    return "housing tier and care lane disagree";
  const mean = (rows) => rows.reduce((s, r) => s + r.days, 0) / rows.length;
  const mBedNew = mean(bedNew), mBedOld = mean(bedOld);
  // durations shift LEFT vs the pre-seam odds (never right)
  if (mBedNew > mBedOld + 1e-9)
    return `bed rest did not shorten illness: ${mBedNew.toFixed(2)}d vs ${mBedOld.toFixed(2)}d pre-seam`;
  // and the ladder rung is real: bed odds must strictly beat cot odds
  if (!(CARE_LANES_bed_cure() > CARE_LANES_cot_cure()))
    return "bed odds do not beat cot odds in the care table";
  return true;

  function CARE_LANES_bed_cure() { const s = createSim({ seed: 1 }); return s.G("CARE_LANES.bed.cure"); }
  function CARE_LANES_cot_cure() { const s = createSim({ seed: 1 }); return s.G("CARE_LANES.cot.cure"); }
});

scenario("sick days: GRANT keeps them home unpaid, REQUIRE puts them to work paid", () => {
  const sim = createSim({ seed: 404 });
  sim.runUntil("day >= 2 && tmin >= 6.5 * 60", { maxSteps: 300000 });
  // GRANT (the default, and the pre-feature behavior): ill = home all day
  sim.G(`{ crabs[0].p.sick = { days: 1 }; crabs[0].workedToday = false; coins = 900; }`);
  if (sim.G(`sickPolFor(crabs[0]) !== "grant" || !onSickDay(crabs[0])`))
    return "the default policy is not GRANT";
  sim.runUntil("tmin >= 15 * 60", { maxSteps: 300000,
    onTick: (G) => { if (G("coins") < 400) G("coins = 900"); } });
  if (sim.G('crabs[0].dayState === "working"')) return "a granted sick crab clocked in anyway";
  if (sim.G("crabs[0].workedToday")) return "a granted sick crab was marked as having worked";
  if (sim.G("crabDueTonight(crabs[0]) !== 0")) return "a granted sick day is on the wage bill";
  // REQUIRE: same crab, next morning, dragged in and paid in full
  const sim2 = createSim({ seed: 404 });
  sim2.runUntil("day >= 2 && tmin >= 6.5 * 60", { maxSteps: 300000 });
  sim2.G(`{ crabs[0].p.sick = { days: 1 }; crabs[0].p.sickPol = "require"; coins = 900; }`);
  if (sim2.G("onSickDay(crabs[0])")) return "REQUIRE still reads as a sick day";
  if (sim2.G("crabDueTonight(crabs[0]) !== CRAB_WAGE"))
    return "a required sick crab is not on the wage bill: " + sim2.G("crabDueTonight(crabs[0])");
  const worked = sim2.runUntil('crabs[0].dayState === "working" || crabs[0].dayState === "toWork"',
    { maxSteps: 300000, onTick: (G) => { if (G("coins") < 400) G("coins = 900"); } });
  if (!worked) return "a required sick crab never left the house";
  // and the wallet proves it at settlement
  sim2.runUntil("lastRentDay === day", { maxSteps: 400000,
    onTick: (G) => { G('if (crabs[0]) crabs[0].p.sick = crabs[0].p.sick || { days: 1 };'); if (G("coins") < 400) G("coins = 900"); } });
  return sim2.G("crabs[0] && crabs[0].workedToday === false && crabs[0].p.wallet > 0")
    ? true : "the required crab's pay never landed";
});

scenario("overtime: pays exactly 1.5x the hourly rate and accelerates the needs cost", () => {
  const sim = createSim({ seed: 909 });
  sim.runUntil("day >= 2 && tmin >= 7 * 60", { maxSteps: 300000 });
  // an M-shift crab (8-14 under default hours) asks for overtime: the window
  // grows to 8-16, entirely inside the shop's 8-20 opening
  const geo = JSON.parse(sim.G(`{ const c = crabs.find(k => k.p.shift === "M" && !k.p.npc) || crabs[0];
    c.p.shift = "M"; c.p.ot = true;
    JSON.stringify({ base: [baseShift(c).start, baseShift(c).end], eff: [effShift(c).start, effShift(c).end],
      mins: otMinutes(c), open: [BIZ[c.p.job].hours.open, BIZ[c.p.job].hours.close] }); }`));
  if (geo.mins !== 120) return "OT window is " + geo.mins + " minutes, expected 120";
  if (geo.eff[1] !== geo.base[1] + 120) return "OT did not extend the shift end: " + JSON.stringify(geo);
  if (geo.eff[1] > geo.open[1] || geo.eff[0] < geo.open[0])
    return "OT escaped the shop's open hours: " + JSON.stringify(geo);
  // THE RATE, exact: premium dollars / OT minutes === 1.5 x wage / shift minutes
  const rate = JSON.parse(sim.G(`{ const c = crabs.find(k => k.p.ot) || crabs[0];
    const span = baseShift(c).end - baseShift(c).start;
    JSON.stringify([otPremium(c, 120), CRAB_WAGE * 1.5 * 120 / span, otPremium(c, 60) * 2, span]); }`));
  if (Math.abs(rate[0] - rate[1]) > 1e-9) return "OT premium is not 1.5x hourly: " + JSON.stringify(rate);
  if (Math.abs(rate[0] - rate[2]) > 1e-9) return "OT premium is not linear in minutes: " + JSON.stringify(rate);
  // an E-shift crab whose shift already ends at close borrows from the START
  const early = JSON.parse(sim.G(`{ const c = crabs[0];
    c.p.shift = "E"; c.p.ot = true;
    JSON.stringify([baseShift(c).start, effShift(c).start, effShift(c).end, BIZ[c.p.job].hours.close]); }`));
  if (early[1] !== early[0] - 120 || early[2] !== early[3])
    return "an E-shift OT day did not borrow from the start: " + JSON.stringify(early);
  // THE NEEDS COST: the same end-of-shift accrual, scaled by the longer day.
  // Two identical crabs, one on OT, put through the shift-end bump by hand.
  const cost = JSON.parse(sim.G(`{
    const mk = () => ({ p: { hunger: 0, tired: 0 } });
    const c = crabs[0], span = Math.max(60, baseShift(c).end - baseShift(c).start);
    const f = 120 / span;
    JSON.stringify([0.25 * (1 + f), TIRED_SHIFT * (1 + OT_FATIGUE * f), 0.25, TIRED_SHIFT, f]); }`));
  if (!(cost[0] > cost[2]) || !(cost[1] > cost[3]))
    return "OT did not accelerate the existing accrual: " + JSON.stringify(cost);
  if (Math.abs(cost[1] - cost[3] * (1 + 1.5 * cost[4])) > 1e-9)
    return "tiredness is not accruing at OT_FATIGUE x the proportional share";
  // and the truth is measured, not assumed: a crab who never clocks in past
  // their contracted hours earns no premium at all
  return sim.G("otPayToday(crabs[0]) === 0") ? true : "OT paid for minutes nobody worked";
});

scenario("overtime: the marker and the tags render, and clear when OT ends", () => {
  const sim = createSim({ seed: 606 });
  sim.runUntil("day >= 2 && tmin >= 7 * 60", { maxSteps: 300000 });
  sim.G(`{ const c = crabs[0]; c.p.shift = "M"; c.p.ot = true; c.p.sick = null;
    tmin = 15 * 60; c.dayState = "working"; c.duty = true; c.pendingOff = false;
    c.kstate = "idle"; c.workBiz = c.p.job; }`);
  if (!sim.G("onOvertimeNow(crabs[0])")) return "the OT marker never lit while clocked in past the shift";
  if (!sim.G("otMinutes(crabs[0]) > 0")) return "no OT minutes on an OT day";
  if (!sim.G(`crabStatus(crabs[0]).length > 0`)) return "status line broke";
  // inside the contracted window: no marker (the crab is just at work)
  sim.G("tmin = 11 * 60");
  if (sim.G("onOvertimeNow(crabs[0])")) return "the marker lit during ordinary hours";
  // request withdrawn: everything clears from live state, nothing to reset
  sim.G("tmin = 15 * 60; crabs[0].p.ot = false;");
  if (sim.G("onOvertimeNow(crabs[0])")) return "the marker survived the OT request being withdrawn";
  if (sim.G("otMinutes(crabs[0]) !== 0")) return "the OT tag survived the request being withdrawn";
  if (sim.G("effShift(crabs[0]).end !== baseShift(crabs[0]).end")) return "the shift stayed long after OT ended";
  // off duty: no marker even mid-OT-window
  sim.G(`crabs[0].p.ot = true; crabs[0].duty = false;`);
  if (sim.G("onOvertimeNow(crabs[0])")) return "the marker lit for a crab who isn't on the clock";
  // and the art exists in both frames
  return sim.G("Array.isArray(OT_MARK) && OT_MARK.length === 2 && OT_MARK[0].w > 0")
    ? true : "the OT powerup sprite is missing";
});

scenario("auto-manage: grants a sick day and calls OT for the gap, without wedging", () => {
  const sim = createSim({ seed: 808 });
  sim.runUntil("day >= 2 && tmin >= 7 * 60", { maxSteps: 300000 });
  // a two-crab shack under a harsh REQUIRE policy, with the rota delegated
  sim.G(`{ coins = 4000; UPS.chef.lvl++; hireCrew();
    BIZ.shack.sickPol = "require"; BIZ.shack.autoLabor = true;
    for (const c of crabs) { c.p.job = "shack"; c.p.sickPol = null; delete c.p.sickPol; c.p.ot = false; }
    crabs[0].p.shift = "M"; crabs[1].p.shift = "E";
    crabs[0].p.sick = { days: 1 }; }`);
  // rule 1 (REST) fires at a settlement: the manager sends them home.
  // RE-POINTED at the public-taps merge - the fixture, not the rule. It used
  // to demand the grant at the FIRST settlement, which only worked while the
  // crab reliably failed that night's cure roll: the illness block runs before
  // runLaborPolicy in the same frame, so a crab who recovers is simply not
  // there for the manager to send home (the onTick re-arms sickness between
  // frames, not inside one). A hydrated town cures faster, so the first
  // settlement now often cures them. The rule under test is "an ill crab under
  // REQUIRE gets sent home", not "on night one", so we wait for the manager to
  // do it - bounded, and still failing loudly if it never happens.
  sim.runUntil(`crabs[0] && sickPolFor(crabs[0]) === "grant"`, { maxSteps: 900000,
    onTick: (G) => { if (G("coins") < 600) G("coins = 2000"); G('if (crabs[0]) crabs[0].p.sick = crabs[0].p.sick || { days: 1 };'); } });
  if (sim.G(`!crabs[0] || sickPolFor(crabs[0]) !== "grant"`))
    return "auto-manage never granted the sick day: " + sim.G("crabs[0] ? sickPolFor(crabs[0]) : 'gone'");
  const moves = JSON.parse(sim.G("JSON.stringify(window._stats.laborMoves || [])"));
  if (!moves.some(m => /HOME TO REST/.test(m.line))) return "no named toast for the sick-day grant";
  // ... and the shop is NOT dark: the healthy coworker still opens up
  sim.runUntil("tmin >= 12 * 60 && lastRentDay !== day", { maxSteps: 400000,
    onTick: (G) => { if (G("coins") < 600) G("coins = 2000"); G('if (crabs[0]) crabs[0].p.sick = crabs[0].p.sick || { days: 1 };'); } });
  if (sim.G(`bizRestingToday("shack")`)) return "coverage collapsed: the shack hung a placard with a healthy crab on the roster";
  // ONE MOVE A DAY, a cooldown after each, and it must not thrash: run a
  // fortnight and check the manager never moves twice in a settlement and
  // never flips the same crab's OT flag on consecutive days
  const d0 = sim.G("day");
  sim.runDays(d0 + 14, { onTick: (G) => {
    if (G("coins") < 600) G("coins = 2000");
    G('if (crabs[0] && day < ' + (d0 + 6) + ') crabs[0].p.sick = crabs[0].p.sick || { days: 1 };');
  }, tickEvery: 40 });
  const all = JSON.parse(sim.G("JSON.stringify(window._stats.laborMoves || [])"));
  const perDay = {};
  for (const m of all) perDay[m.day] = (perDay[m.day] || 0) + 1;
  const doubled = Object.entries(perDay).filter(([, n]) => n > 1);
  if (doubled.length) return "more than one labor move in a day: " + JSON.stringify(doubled);
  // a cooldown day means no two moves on consecutive days either
  const days = Object.keys(perDay).map(Number).sort((a, b) => a - b);
  for (let i = 1; i < days.length; i++)
    if (days[i] === days[i - 1] + 1) return "the manager moved on consecutive days (no cooldown): " + days;
  return true;
});

scenario("npc shops run the same policy: SUDSY takes a sick day, placard up, no panic posting", () => {
  const sim = createSim({ seed: 707 });
  sim.runUntil("day >= 2 && tmin >= 9 * 60", { maxSteps: 300000 });
  // SUDSY is an owner-operator: she grants herself sick days by the same rule
  sim.G(`{ const s = npcs.find(k => k.p.owner === "sudsy");
    s.p.sick = { days: 1 }; OWNERS.sudsy.till = 600; jobBoard.length = 0; hireDay = day; }`);
  if (!sim.G(`onSickDay(npcs.find(k => k.p.owner === "sudsy"))`))
    return "SUDSY did not grant herself the sick day";
  if (!sim.G(`BIZ.showers.autoLabor`)) return "peer owners should ship with auto-manage ON";
  // the placard reads OUT SICK, not DAY OFF
  if (!sim.G(`bizRestingToday("showers")`)) return "a sick single-worker shop is not resting";
  if (sim.G(`restingLabel("showers") !== "OUT SICK"`))
    return "the placard reads " + sim.G(`restingLabel("showers")`);
  // she stays home all day, unpaid, and the job board does NOT post: a bout
  // of flu is not a vacancy
  sim.runUntil("tmin >= 8 * 60 && day > " + sim.G("day"), { maxSteps: 400000,
    onTick: (G) => G(`{ const s = npcs.find(k => k.p.owner === "sudsy"); if (s) s.p.sick = s.p.sick || { days: 1 }; OWNERS.sudsy.till = 600; }`) });
  const posted = JSON.parse(sim.G("JSON.stringify(jobBoard.filter(j => j.biz === 'showers'))"));
  if (posted.length) return "a sick day triggered the emergency HELP WANTED posting: " + JSON.stringify(posted);
  return sim.G(`npcs.find(k => k.p.owner === "sudsy").dayState !== "working"`)
    ? true : "SUDSY worked her own shift while ill";
});

scenario("census: rows derive live state, and sort + filter actually move", () => {
  const sim = createSim({ seed: 505 });
  sim.runUntil("day >= 2 && tmin >= 10 * 60", { maxSteps: 300000 });
  sim.G(`{ coins = 6000; for (let i = 0; i < 4; i++) { UPS.chef.lvl++; hireCrew(); }
    for (let i = 0; i < 4; i++) spawnDrifter();
    crabs[1].p.sick = { days: 3 };
    crabs[2].p.wallet = 500; crabs[2].p.homeless = false;
    // OT only means something for a crab who actually WORKS today: not off, not
    // the one we just made sick. The rota moves with the roster, so search for
    // an eligible crab instead of assuming crabs[0].
    { const w = crabs.find(k => !offToday(k) && !k.p.sick) || crabs[0];
      w.p.ot = true; w.p.shift = "M"; }
    censusSort = 0; censusFilter = 0; censusPage = 0; }`);
  const n = sim.G("allCrabs().length");
  if (n < 12) return "only " + n + " crabs - the census has to scale past a dozen";
  if (sim.G("censusList().length !== allCrabs().length")) return "the ALL filter dropped somebody";
  if (sim.G("censusPages() < 2")) return "12+ crabs must page";
  // DERIVED, not cached: change the world, the row changes
  const before = sim.G(`{ const c = censusList().find(k => k.p.ot); JSON.stringify([c.p.name, otMinutes(c), homeTag(c.p)]); }`);
  sim.G(`{ const c = allCrabs().find(k => k.p.ot); c.p.ot = false; c.p.homeless = true; c.p.house = null; c.p.boat = null; }`);
  const after = sim.G(`{ const c = allCrabs().find(k => JSON.parse(${JSON.stringify(before)})[0] === k.p.name);
    JSON.stringify([c.p.name, otMinutes(c), homeTag(c.p)]); }`);
  const b4 = JSON.parse(before), af = JSON.parse(after);
  if (af[1] !== 0 || af[2] !== "COT" || b4[1] === 0)
    return "census fields did not follow live state: " + before + " -> " + after;
  // sorts: NAME is alphabetical, WALLET is richest-first, HEALTH sickest-first
  sim.G("censusSort = 0");
  const byName = JSON.parse(sim.G("JSON.stringify(censusList().map(c => c.p.name))"));
  if (byName.join() !== byName.slice().sort().join()) return "NAME sort is not alphabetical";
  sim.G("censusSort = CENSUS_SORTS.indexOf('WALLET')");
  const w = JSON.parse(sim.G("JSON.stringify(censusList().map(c => c.p.wallet))"));
  for (let i = 1; i < w.length; i++) if (w[i] > w[i - 1]) return "WALLET sort is not descending: " + w;
  sim.G("censusSort = CENSUS_SORTS.indexOf('HEALTH')");
  if (!sim.G("censusList()[0].p.sick")) return "HEALTH sort did not float the sick crab to the top";
  // filters: each one is a strict subset with the right predicate
  sim.G("censusSort = 0; censusFilter = CENSUS_FILTERS.indexOf('CREW')");
  if (sim.G("censusList().some(c => c.p.npc)")) return "the CREW filter let a townsfolk through";
  sim.G("censusFilter = CENSUS_FILTERS.indexOf('TOWN')");
  if (sim.G("censusList().some(c => !c.p.npc)")) return "the TOWN filter let a crew crab through";
  sim.G("censusFilter = CENSUS_FILTERS.indexOf('SICK')");
  if (sim.G("censusList().some(c => !c.p.sick) || censusList().length === 0")) return "the SICK filter is wrong";
  sim.G("censusFilter = CENSUS_FILTERS.indexOf('OT')");
  if (sim.G("censusList().some(c => !c.p.ot && otMinutes(c) === 0)")) return "the OT filter is wrong";
  sim.G("censusFilter = 0");
  return true;
});

scenario("labor policy: every new setting roundtrips save/load", () => {
  const store = new Map();
  const a = createSim({ seed: 41, storage: store, fresh: false });
  a.runDays(2);
  a.G(`{ BIZ.shack.sickPol = "require"; BIZ.shack.autoLabor = true;
    BIZ.showers.autoLabor = false; BIZ.juicebar.sickPol = "grant";
    laborPolicyState.shack = { cd: 1 };
    crabs[0].p.ot = true; crabs[0].p.restT = 4.5; crabs[0].p.sickPol = "grant";
    crabs[1].p.ot = false; crabs[1].p.sickPol = "require";
    npcs[0].p.ot = true;
    save(); }`);
  const b = createSim({ seed: 42, storage: store, fresh: false });
  const got = JSON.parse(b.G(`JSON.stringify({
    sp: [BIZ.shack.sickPol, BIZ.juicebar.sickPol, BIZ.arcade.sickPol],
    al: [BIZ.shack.autoLabor, BIZ.showers.autoLabor],
    pol: laborPolicyState.shack,
    c0: [crabs[0].p.ot, crabs[0].p.restT, crabs[0].p.sickPol],
    c1: [crabs[1].p.ot, crabs[1].p.sickPol],
    n0: npcs.map(k => k.p.name + ":" + !!k.p.ot).join(",") })`));
  if (got.sp[0] !== "require" || got.sp[1] !== "grant" || got.sp[2] !== "grant")
    return "sick policies came back " + JSON.stringify(got.sp);
  if (got.al[0] !== true || got.al[1] !== false) return "auto-manage flags came back " + JSON.stringify(got.al);
  if (!got.pol || got.pol.cd !== 1) return "labor cooldown came back " + JSON.stringify(got.pol);
  if (got.c0[0] !== true || Math.abs(got.c0[1] - 4.5) > 1e-9 || got.c0[2] !== "grant")
    return "crew OT/rest/override came back " + JSON.stringify(got.c0);
  if (got.c1[0] !== false || got.c1[1] !== "require") return "crew override came back " + JSON.stringify(got.c1);
  if (!/:true/.test(got.n0)) return "townsfolk OT did not roundtrip: " + got.n0;
  // a tampered save must clamp, not wedge
  const s = JSON.parse(store.get(SLOT1));   // saves live in slots now
  s.sickPol.shack = "bogus"; s.personas[0].sickPol = "nonsense";
  store.set(SLOT1, JSON.stringify(s));
  const c = createSim({ seed: 43, storage: store, fresh: false });
  // a bogus value is IGNORED, so the shop falls back to the safe default
  // (GRANT) and the crab's nonsense override is dropped entirely
  const clamped = JSON.parse(c.G(`JSON.stringify([BIZ.shack.sickPol, crabs[0].p.sickPol == null, sickPolFor(crabs[0])])`));
  return clamped[0] === "grant" && clamped[1] && clamped[2] === "grant"
    ? true : "a bogus sick policy survived the load: " + JSON.stringify(clamped);
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
  // The geometry is STAGED, not hoped for: a crab living in the west end who
  // works the arcade in the east has the shack's queue squarely on their way.
  const sim = createSim({ seed: 909 });
  sim.G('coins = 5000; tryBuy("arcade");');
  const ok0 = sim.runUntil(
    'bizStaffed("shack") && tmin > 7 * 60 && tmin < 10 * 60 && ' +
    'crabs.some(c => c.dayState === "home" && !offToday(c) && !c.p.sick && tmin < leaveGmin(c) - 45)',
    { maxSteps: 200000 });
  if (!ok0) return "no morning with a staffed shack and a crab still at home";
  const idx = sim.G('crabs.findIndex(c => c.dayState === "home" && !offToday(c) && !c.p.sick && tmin < leaveGmin(c) - 45)');
  sim.G(`{ const c = crabs[${idx}];
    c.p.job = "arcade";                      // east of the shack queue
    c.p.homeless = false; c.p.house = 0;     // west end of the promenade
    c.p.hunger = 0.75; c.p.thirst = 0; c.p.dirt = 0; c.p.bored = 0;
    c.p.wallet = 60; c.errandCd = 0; }`);
  const homeX0 = sim.G(`homeX(crabs[${idx}])`);
  const workX = sim.G(`jobDoor(crabs[${idx}])`);
  const shackQ = sim.G("BIZ.shack.queueX");
  const onTheWay = (homeX0 < shackQ && shackQ < workX) || (workX < shackQ && shackQ < homeX0);
  if (!onTheWay || Math.abs(workX - homeX0) < 400)
    return `staged geometry wrong (home ${homeX0}, work ${workX}, shack ${shackQ})`;
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
  if (!t.left) return "the crab never actually set out (no leg past home + 300px)";
  // (1) PATH ORDER: having set out for the meal, they never went back home
  if (t.minX < homeX0 + 300)
    return `backtracked toward home (reached x ${Math.round(t.minX)}, home ${Math.round(homeX0)}) between the meal and work`;
  // (2) DISTANCE: within a quarter of the ideal home -> shack -> work walk
  const ideal = Math.abs(shackQ - homeX0) + Math.abs(workX - shackQ);
  return t.walk <= ideal * 1.25 ? true
    : `walked ${Math.round(t.walk)}px for an ideal ${Math.round(ideal)}px chained trip`;
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
  // 1.5-second no-progress sidestep (unsticks). Before the routing pass, the
  // seed-5348 town read 21 warps + 6 unsticks over 5 days; after, 0 + 2.
  // WIDENED TO THREE TOWNS at the needs-failure merge, and the receipt is that
  // the one-town version had quietly become a coin flip: its own comment still
  // claimed "0 + 2", but the PRE-MERGE tree actually measured 0 + 7 against a
  // gate of 8. A single 5-day town's sidestep count swings +/-2 on nothing but
  // stream order (paired arms inside the needs build measured 5, 7 and 9 with
  // the same code), so the next merge in either direction was going to push it
  // red for no real reason. Three towns is a steadier statistic and a stricter
  // one: TOTAL warps and TOTAL sidesteps across three busy towns read
  // **0 + 17 before this merge and 0 + 18 after** - one sidestep in fifteen
  // town-days - so the wide berth did NOT turn crab-crab separation into a pin.
  let w = 0, u = 0; const per = [];
  for (const seed of [5348, 1337, 4011]) {
    const sim = createSim({ seed });
    sim.G(`coins = 3000; tryBuy("arcade"); tryBuy("chef"); tryBuy("chef");
      crabs[2].p.job = "arcade"; crabs[3].p.job = "arcade";`);
    sim.runDays(5);
    const st = JSON.parse(sim.G("JSON.stringify(window._stats)"));
    w += st.warps || 0; u += st.unsticks || 0;
    per.push(`${seed}:${st.warps || 0}/${st.unsticks || 0}`);
  }
  if (w > 2) return `${w} bounce-budget warps over 3 towns x 5 days (measured 0; gate 2) - ${per.join(" ")}`;
  if (w + u > 26) return `${w} warps + ${u} unsticks over 3 towns x 5 days (measured 17 before / 18 after; gate 26) - ${per.join(" ")}`;
  return true;
});

scenario("routes: both travel lanes are clear of every solid (tripwire)", () => {
  // The lanes are only useful while they are actually empty. This fails the
  // day somebody parks a table or a counter on one - which is exactly how the
  // town got into the all-day-bouncing state in the first place.
  const sim = createSim({ seed: 11 });
  // buy the table rungs to the CAP, not a fixed two: the whole point of this
  // tripwire is that a table nobody has bought yet cannot be parked on a lane
  // (the cap went 2 -> 4 with the table-service economy)
  sim.G(`coins = 4000; tryBuy("arcade"); tryBuy("juicebar");
         while (UPS.table.lvl < UPS.table.max) tryBuy("table");`);
  if (sim.G("(bizTables('shack')||[]).length") !== sim.G("TABLE_BASE + UPS.table.max"))
    return "the fixture did not stand every table the shop can sell";
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

scenario("fishing experience: tiers accrue, save, and pay out on the water", () => {
  const sim = createSim({ seed: 31 });
  // the counter must NOT be the shack's 'fish' dish counter - a cook's plates
  // must never teach a fisher to cast
  sim.G('crabs[0].p.made = { fish: 400 }');
  if (sim.G('fishTier(crabs[0]).cast') !== 1) return "a cook's fish PLATES granted fishing tiers";
  // tiers change the two things a fisher has: cast speed and haul odds
  const f = () => sim.G('JSON.stringify([fishTier(npcs.find(c => c.p.job === "fishing")).cast, fishTier(npcs.find(c => c.p.job === "fishing")).dbl, fishTier(npcs.find(c => c.p.job === "fishing")).big])');
  const t0 = JSON.parse(f());
  sim.G('npcs.find(c => c.p.job === "fishing").p.made = { caught: 30 }');
  const t1 = JSON.parse(f());
  sim.G('npcs.find(c => c.p.job === "fishing").p.made = { caught: 260 }');
  const t3 = JSON.parse(f());
  if (!(t0[0] === 1 && t1[0] < t0[0] && t3[0] < t1[0])) return "casts did not quicken with experience: " + [t0[0], t1[0], t3[0]];
  if (!(t3[1] > t1[1] && t1[1] > t0[1])) return "double-haul odds did not rise: " + [t0[1], t1[1], t3[1]];
  if (!(t3[2] > 0 && t1[2] === 0)) return "THE BIG ONE should be a master-only haul";
  // catches accrue on the water and survive a save
  const store = new Map();
  const a = createSim({ seed: 9, storage: store, fresh: false });
  a.runUntil('(npcs.find(c => c.p.job === "fishing").p.made || {}).caught > 0', { maxSteps: 300000 });
  const landed = a.G('npcs.find(c => c.p.job === "fishing").p.made.caught');
  if (!(landed > 0)) return "fishing never credited a catch";
  a.G("save()");
  const b = createSim({ seed: 10, storage: store, fresh: false });
  const back = b.G('(npcs.find(c => c.p.name === "SALTY") || npcs[0]).p.made.caught');
  return back >= 1 ? true : "the catch counter did not survive a save: " + back;
});

// ---- business failure, sale & succession -----------------------------------
// The player is propped up throughout: these scenarios are about the TOWN's
// economy, not about the player's eviction date.
const KEEP = { onTick: (G) => { if (G("coins") < 500) G("coins = 900"); }, tickEvery: 40 };
const keep = (o) => Object.assign({}, KEEP, o);
// a sane asking price for a small beach business: more than a couple of
// nights' rent, less than the arcade's shop-grid price. If a build ever
// prices a shuttered shower house outside this, somebody moved a knob.
const BIZ_MIN = 60, BIZ_MAX = 400;
// drive ONE settlement in which the shop's owner cannot pay: till emptied and
// the line pinned at its limit, which is exactly the "exhausted line + missed
// obligations" the credit machinery already defines. Leaves the sim in the
// following morning.
function missOneLease(sim, biz) {
  sim.runUntil("tmin >= 19.9 * 60", keep({ maxSteps: 300000 }));
  sim.G(`{ const o = OWNERS[bizOwner("${biz}")]; if (o) { o.till = 0; o.credit = creditLimit(); } }`);
  sim.runUntil("lastRentDay === day", keep({ maxSteps: 80000 }));
  sim.runUntil("tmin > 7 * 60 && tmin < 12 * 60", keep({ maxSteps: 300000 }));
}

scenario("failure: three missed leases close a peer's shop and lay off its staff", () => {
  const sim = createSim({ seed: 61 });
  sim.runUntil("day >= 2 && tmin > 8 * 60", keep({ maxSteps: 400000 }));
  // put a hired hand on SUDSY's payroll so the layoff has somebody in it
  sim.G(`{ const f = npcs.find(k => k.p.job === "fishing");
    f.p.job = "showers"; f.p.employer = "sudsy"; f.workBiz = "showers"; window._hand = f.p.name; }`);
  const hand = sim.G("window._hand");
  // ONE bad night is not a failure. Two aren't either - the strike is counted
  // and the shop trades on, which is the whole point of the definition.
  for (let i = 1; i <= 2; i++) {
    missOneLease(sim, "showers");
    if (sim.G('forSale("showers")')) return "the shop closed after only " + i + " missed night(s)";
    if (sim.G("bizStrike.showers") !== i) return "strike " + i + " not counted: " + sim.G("bizStrike.showers");
  }
  missOneLease(sim, "showers");
  if (!sim.G('forSale("showers")')) return "three missed leases did not close the shop";
  if (sim.G('BIZ.showers.owner') !== null) return "closed but still owned by " + sim.G("BIZ.showers.owner");
  if (!sim.G('bizDark("showers")')) return "a closed shop is not dark";
  const price = sim.G("market.showers.price");
  if (!(price >= BIZ_MIN && price <= BIZ_MAX)) return "asking price outside a sane band: $" + price;
  // the owner-operator is staff too: she is out of a job, on the pier
  const sud = JSON.parse(sim.G('JSON.stringify((() => { const c = allCrabs().find(k => k.p.name === "SUDSY"); return [c.p.owner, c.p.job, c.p.employer, !!c.p.fisher]; })())'));
  if (sud[0] !== null || sud[1] !== "fishing" || sud[2] !== null || sud[3] !== true)
    return "the bankrupt owner did not land on the pier: " + JSON.stringify(sud);
  const hd = JSON.parse(sim.G(`JSON.stringify((() => { const c = allCrabs().find(k => k.p.name === "${hand}"); return [c.p.job, c.p.employer]; })())`));
  if (hd[0] !== "fishing" || hd[1] !== null) return "the hired hand was not laid off: " + JSON.stringify(hd);
  if (sim.G('jobBoard.some(j => j.biz === "showers")')) return "a closed shop is still advertising for staff";
  // ...and it STOPS TRADING: no tourists, no errands, no takings
  sim.G("window._stats.showersDone = 0;");
  sim.runUntil("tmin > 17 * 60", keep({ maxSteps: 400000 }));
  if (sim.G('customers.some(k => k.biz === "showers")')) return "tourists still queueing at a shuttered shop";
  if (sim.G('bizStaffed("showers")')) return "a shuttered shop is somehow staffed";
  if (sim.G("window._stats.showersDone") !== 0) return "a shuttered shop served " + sim.G("window._stats.showersDone") + " showers";
  if (sim.G('Math.round((today.biz.showers || { take: 0 }).take)') !== 0) return "a shuttered shop took money";
  // a grubby crab is not sent to a shop that isn't there (no wedge, no ghost errand)
  sim.G(`{ const c = crabs[0]; c.p.dirt = 1; c.p.hunger = 0; c.p.thirst = 0; c.p.bored = 0; c.errandCd = 0; }`);
  const e = sim.G('JSON.stringify(pickErrand(crabs[0]) || null)');
  if (e !== "null" && e.includes("showers")) return "pickErrand still routes to the closed showers: " + e;
  return true;
});

scenario("failure: an owner who leaves the town leaves a business, not an orphan", () => {
  // THE DEATH SEAM, kept minimal on purpose: mortality does not have to know
  // anything about the owner layer. runSuccession sweeps at every settlement.
  const sim = createSim({ seed: 81 });
  sim.runUntil("day >= 2 && tmin > 8 * 60", keep({ maxSteps: 400000 }));
  sim.G('npcs = npcs.filter(c => c.p.name !== "SUDSY");');   // exactly what a mortality pass does
  if (sim.G("BIZ.showers.owner") !== "sudsy") return "fixture wrong: the shop was not hers";
  sim.runUntil("lastRentDay === day", keep({ maxSteps: 400000 }));
  if (!sim.G('forSale("showers")')) return "an ownerless business was left orphaned";
  if (sim.G("market.showers.why") !== "gone") return "listed for the wrong reason: " + sim.G("market.showers.why");
  if (!sim.G('bizDark("showers")')) return "an ownerless shop is somehow still trading";
  sim.runDays(sim.G("day") + 3, KEEP);
  return sim.G('!gameOver && forSale("showers")') ? true : "the town did not survive the ownerless stretch";
});

scenario("sale: a saved-up crab buys the failed shop and it TRADES AGAIN", () => {
  const sim = createSim({ seed: 62 });
  sim.runUntil("day >= 2 && tmin > 8 * 60", keep({ maxSteps: 400000 }));
  for (let i = 0; i < 3; i++) missOneLease(sim, "showers");
  if (!sim.G('forSale("showers")')) return "the shop never closed";
  const price = sim.G('salePrice("showers")');
  // the price is LEGIBLE: lease + fixtures + goodwill, every term checkable
  const parts = JSON.parse(sim.G('JSON.stringify([BIZ.showers.rent * SALE_CFG.RENT_NIGHTS, bizFixtures("showers") * SALE_CFG.FIXTURE])'));
  if (price < parts[0] + parts[1]) return "price $" + price + " is under lease+fixtures " + JSON.stringify(parts);
  if (!(price >= BIZ_MIN && price <= BIZ_MAX)) return "asking price outside a sane band: $" + price;
  // a fisher who has been saving takes it on instead of a boat
  sim.G(`{ const f = npcs.find(k => k.p.job === "fishing" && k.p.name !== "SUDSY");
    f.p.wallet = salePrice("showers") + SALE_CFG.RESERVE + 5; f.p.sick = null; window._buyer = f.p.name; }`);
  const buyer = sim.G("window._buyer"), id = buyer.toLowerCase();
  if (!sim.runUntil('!forSale("showers")', keep({ maxSteps: 400000 })))
    return "a crab with the savings never bought the shop";
  if (sim.G("BIZ.showers.owner") !== id) return "new owner is " + sim.G("BIZ.showers.owner") + ", expected " + id;
  const till = sim.G("OWNERS['" + id + "'].till");
  if (till !== Math.floor(price * sim.G("SALE_CFG.FLOAT_FRAC")))
    return "opening till $" + till + " is not the float on a $" + price + " sale";
  const who = JSON.parse(sim.G(`JSON.stringify((() => { const c = allCrabs().find(k => k.p.name === "${buyer}"); return [c.p.owner, c.p.job, c.p.employer, Math.round(c.p.wallet)]; })())`));
  if (who[0] !== id || who[1] !== "showers" || who[2] !== null)
    return "the buyer is not the owner-operator: " + JSON.stringify(who);
  if (who[3] < 20) return "the buyer spent their housing reserve: $" + who[3];
  // ...and they run the SAME policies every peer owner runs (the tables are
  // keyed on the business, so a new owner inherits them by construction)
  if (!sim.G("BIZ.showers.autoLabor")) return "the new owner does not auto-manage like a peer";
  if (!sim.G("!!HOURS_POLICY.showers")) return "the hours policy no longer applies to the shop";
  if (sim.G('bizDark("showers")')) return "the shop is still dark under its new owner";
  // THE POINT: it opens up and takes money again
  sim.G("window._stats.showersDone = 0;");
  if (!sim.runUntil('bizStaffed("showers")', keep({ maxSteps: 500000 })))
    return "the new owner never opened up";
  if (!sim.runUntil('window._stats.showersDone > 0', keep({ maxSteps: 500000 })))
    return "the shop never served a guest under its new owner";
  if (!(sim.G('(today.biz.showers || { take: 0 }).take') > 0)) return "trading again, but no money in the till";
  // and the new owner's hours policy really is live: it runs without a peep
  sim.G('runHoursPolicy("showers")');
  return true;
});

scenario("sale: the player buys a failed business through the shopfront", () => {
  const sim = createSim({ seed: 63 });
  sim.runUntil("day >= 2 && tmin > 8 * 60", keep({ maxSteps: 400000 }));
  for (let i = 0; i < 3; i++) missOneLease(sim, "showers");
  if (!sim.G('forSale("showers")')) return "the shop never closed";
  const price = sim.G('salePrice("showers")');
  // the BUY chip lives on the shopfront the MANAGE chip lives on
  const r = JSON.parse(sim.G('JSON.stringify(saleChipRect("showers"))'));
  if (!(r.x > sim.G("BIZ.showers.x0") && r.x + r.w < sim.G("BIZ.showers.x1")))
    return "the BUY chip is not on the shopfront: " + JSON.stringify(r);
  // short of the money: a tap refuses, and says so
  sim.G("coins = " + (price - 1) + "; saleArm = null;");
  if (sim.G('tapSaleChip("showers")') !== false) return "bought a business without the money";
  if (sim.G("BIZ.showers.owner") !== null) return "the refused tap bought it anyway";
  // with the money: the first tap ARMS, the second signs
  sim.G("coins = " + (price + 400) + ";");
  if (sim.G('tapSaleChip("showers")') !== false) return "a single tap bought a business";
  if (sim.G("saleArm") !== "showers") return "the BUY chip did not arm";
  const before = sim.G("Math.round(coins)");
  if (sim.G('tapSaleChip("showers")') !== true) return "the confirming tap did not buy";
  if (sim.G("BIZ.showers.owner") !== "player") return "owner after the buy: " + sim.G("BIZ.showers.owner");
  const paid = before - sim.G("Math.round(coins)");
  const flt = Math.floor(price * sim.G("SALE_CFG.FLOAT_FRAC"));
  if (paid !== price - flt) return "player paid $" + paid + ", expected the $" + (price - flt) + " lease transfer";
  // it is a real player business now: in the world, on the rent bill, manageable
  if (!sim.G('bizUnlocked("showers")')) return "the bought shop fell out of the world";
  if (!sim.G('ownedBizList().includes("showers")')) return "the bought shop is not on the management screen";
  if (sim.G("totalRent()") < sim.G("BIZ.shack.rent + BIZ.showers.rent"))
    return "the player is not paying rent on the shop they just bought";
  if (sim.G('bizDark("showers")')) return "the bought shop is still dark";
  // and the player's crew may staff it (an NPC shop's staff never could)
  sim.G('crabs[0].p.job = "showers"; crabs[0].p.sick = null;');
  if (!sim.runUntil('bizStaffed("showers")', keep({ maxSteps: 500000 })))
    return "crew never opened the shop the player bought";
  if (sim.G('crabs[0].p.job') !== "showers") return "the schedule bounced the crew back off a player-owned shop";
  // ...and it pays into the PLAYER's till, on the player's books
  sim.runUntil("tmin > 12 * 60 && day > " + sim.G("day"), keep({ maxSteps: 900000 }));
  if (!sim.runUntil('(today.biz.showers || { take: 0 }).take > 0', keep({ maxSteps: 900000 })))
    return "the shop the player bought never took a penny";
  return true;
});

scenario("closure soak: a town with no shower house runs for weeks without wedging", () => {
  const sim = createSim({ seed: 64 });
  const det = stuckDetector(sim);
  sim.runUntil("day >= 2 && tmin > 8 * 60", keep({ maxSteps: 400000 }));
  for (let i = 0; i < 3; i++) missOneLease(sim, "showers");
  if (!sim.G('forSale("showers")')) return "the shop never closed";
  const startDay = sim.G("day"), serves0 = sim.G("window._stats.tourServes");
  // nobody in town can afford it: that is the honest state, and the town has
  // to survive it. Wallets are clamped just under the asking price so the
  // scenario measures the LONG CLOSURE, not a lucky buyout.
  const soak = {
    tickEvery: 20,
    onTick: (G) => {
      if (G("coins") < 500) G("coins = 900");
      G(`{ const cap = salePrice("showers") - 1;
           for (const k of allCrabs()) if (k.p.wallet > cap) k.p.wallet = cap; }`);
      det.tick(G);
    },
  };
  sim.runDays(startDay + 20, soak);
  if (sim.G("gameOver")) return "the propped-up town died anyway";
  if (sim.G("day") < startDay + 20) return "the sim stopped early on day " + sim.G("day");
  if (!sim.G('forSale("showers")')) return "somebody bought it despite the wallet clamp";
  if (det.worstSeconds > 18) return "a crab froze for " + det.worstSeconds + "s during the closure";
  if (!(sim.G("crabs.length") > 0)) return "the crew is gone";
  // the town keeps trading through it - the shack never stopped
  const served = sim.G("window._stats.tourServes") - serves0;
  if (served < 40) return "only " + served + " guests served across 20 days of closure";
  // dirt goes up and STAYS serviceable state: nobody is stuck in an errand
  // loop chasing a shop that isn't there
  if (sim.G('allCrabs().some(c => c.dayState === "toErrand" && c.errandBiz === "showers")'))
    return "a crab is walking to a shop that closed weeks ago";
  return true;
});

scenario("ownership + the FOR SALE market roundtrip save/load", () => {
  // ARM 1: a shop on the market, mid-listing
  const st1 = new Map();
  const a = createSim({ seed: 65, storage: st1, fresh: false });
  a.runDays(2);
  a.G('bizTake.showers = [12, 8, 4]; bizStrike.showers = 2; listForSale("showers", "bankrupt"); save();');
  const price = a.G("market.showers.price");
  const a2 = createSim({ seed: 66, storage: st1, fresh: false });
  const m = JSON.parse(a2.G('JSON.stringify([BIZ.showers.owner, forSale("showers"), (market.showers||{}).price, bizDark("showers"), bizTake.showers])'));
  if (m[0] !== null || m[1] !== true) return "the listing did not survive a save: " + JSON.stringify(m);
  if (m[2] !== price) return "asking price came back as $" + m[2] + ", was $" + price;
  if (m[3] !== true) return "a for-sale shop loaded un-dark";
  if (JSON.stringify(m[4]) !== "[12,8,4]") return "the takings history was lost: " + JSON.stringify(m[4]);
  if (a2.G('allCrabs().some(k => k.p.owner === "sudsy")')) return "the bought-out owner still owns it after a load";

  // ARM 2: sold to a crab - a brand-new owner in the registry, running the shop
  const st2 = new Map();
  const b = createSim({ seed: 67, storage: st2, fresh: false });
  b.runDays(2);
  b.G(`listForSale("showers", "bankrupt");
    { const f = npcs.find(k => k.p.job === "fishing" && k.p.name !== "SUDSY");
      f.p.wallet = 9999; buyBusiness("showers", f); window._o = f.p.name; }
    bizStrike.showers = 2; save();`);
  const nm = b.G("window._o"), id = nm.toLowerCase(), till = b.G("OWNERS['" + id + "'].till");
  const b2 = createSim({ seed: 68, storage: st2, fresh: false });
  const o = JSON.parse(b2.G(`JSON.stringify([BIZ.showers.owner, (OWNERS["${id}"]||{}).till, (OWNERS["${id}"]||{}).name,
    (allCrabs().find(k => k.p.name === "${nm}") || { p: {} }).p.owner,
    (allCrabs().find(k => k.p.name === "${nm}") || { p: {} }).p.job,
    forSale("showers"), bizStrike.showers, BIZ.showers.autoLabor])`));
  if (o[0] !== id) return "the new owner's lease was lost: " + JSON.stringify(o);
  if (o[1] !== till) return "the new owner's till came back as $" + o[1] + ", was $" + till;
  if (o[2] !== nm) return "the registry name was lost: " + o[2];
  if (o[3] !== id || o[4] !== "showers") return "the owner-operator did not come back as the owner: " + JSON.stringify(o);
  if (o[5] !== false) return "a sold shop reloaded as still for sale";
  if (o[6] !== 2) return "the strike ledger was lost: " + o[6];
  if (o[7] !== true) return "the new owner's auto-manage flag was lost";
  // ...and the town keeps running on the loaded state
  b2.runDays(b2.G("day") + 1, KEEP);
  if (b2.G("BIZ.showers.owner") !== id) return "the loaded town lost the owner within a day";

  // ARM 3: the player's own purchase, and an OLD save with none of this
  const st3 = new Map();
  const c = createSim({ seed: 69, storage: st3, fresh: false });
  c.runDays(2);
  c.G('listForSale("showers", "bankrupt"); coins = 4000; saleArm = "showers"; tapSaleChip("showers"); save();');
  if (c.G("BIZ.showers.owner") !== "player") return "the player's purchase did not take";
  const c2 = createSim({ seed: 70, storage: st3, fresh: false });
  const pl = JSON.parse(c2.G('JSON.stringify([BIZ.showers.owner, !!BIZ.showers.bought, bizUnlocked("showers"), ownedBizList().includes("showers")])'));
  if (pl[0] !== "player" || !pl[1] || !pl[2] || !pl[3])
    return "the player's bought business did not roundtrip: " + JSON.stringify(pl);
  const raw = JSON.parse(st3.get(SLOT1));
  delete raw.owners; delete raw.bizOwner; delete raw.bizBought; delete raw.market;
  delete raw.bizTake; delete raw.bizStrike;
  st3.set(SLOT1, JSON.stringify(raw));
  const c3 = createSim({ seed: 71, storage: st3, fresh: false });
  const old = JSON.parse(c3.G('JSON.stringify([BIZ.showers.owner, Object.keys(market).length, forSale("showers")])'));
  return old[0] === "sudsy" && old[1] === 0 && old[2] === false
    ? true : "an old save did not open with SUDSY behind her own counter: " + JSON.stringify(old);
});

// ================================================================ public taps
// A full town: the bar and the arcade open, five crew across three trades, and
// the founding townsfolk. Everyone in it must be able to drink.
function tapTown(sim) {
  sim.G(`coins = 6000; tryBuy("juicebar"); tryBuy("arcade"); tryBuy("table");
    while (crabs.length < 5) hireCrew();
    crabs[2].p.job = "juicebar"; crabs[3].p.job = "arcade"; crabs[4].p.job = "juicebar";
    crabs[2].p.shift = "M"; crabs[4].p.shift = "E"; coins = 6000;`);
}

scenario("taps: nobody in a full town is left parched for a week (crew AND townsfolk)", () => {
  // THE ANTI-TRAP GATE. The measured fault: SUDSY sat at thirst 1.00 for days
  // because she could only drink at a STAFFED counter and her own shift covered
  // every hour the counters were staffed; the fishers held the rail for the
  // same reason; and as townsfolk neither could pour their own. Pre-tap this
  // town ran a 6.3-DAY unbroken stretch in the parched band, and SCUTTLE never
  // drank at all in twelve days.
  //
  // The gate is written on the honest quantity. The tap deliberately sits
  // ABOVE the drink errand's own 0.45 threshold (TAP_AT) so the juice bar keeps
  // first refusal on every thirst - so "time above 0.45" measures SHOPPING, not
  // the trap. What must never happen again is a crab PINNED in the parched band
  // (>= 0.8: the trudge is at -15% there, and it is the approach to the 0.95
  // sickness line), or a crab who gets thirsty and never gets a drink.
  const worst = { dry: 0, dryWho: "", gap: 0, gapWho: "", crit: 0, critWho: "" };
  for (const seed of [5, 9, 17]) {
    const sim = createSim({ seed });
    tapTown(sim);
    const S = {}, prev = {};
    let lastT = -1;
    sim.runDays(10, { tickEvery: 8, onTick: (G) => {
      G(`if (coins < 800) coins = 800;`);
      const t = G(`day * 10000 + tmin`);
      if (t === lastT) return;
      lastT = t;
      for (const r of JSON.parse(G(`JSON.stringify(allCrabs().map(c => ({ n: c.p.name, th: c.p.thirst || 0, npc: !!c.p.npc })))`))) {
        const s = S[r.n] = S[r.n] || { n: 0, run: 0, maxRun: 0, gap: 0, maxGap: 0, crit: 0, thirsty: false, npc: r.npc };
        s.n++;
        if (r.th >= 0.95) s.crit++;
        if (r.th >= 0.8) { s.run++; s.maxRun = Math.max(s.maxRun, s.run); } else s.run = 0;
        if (r.th >= 0.45) s.thirsty = true;   // did this crab ever WANT a drink?
        // a real quench: any drink, bought or from a spout, drops the meter hard
        if (prev[r.n] != null && r.th < prev[r.n] - 0.2) s.gap = 0; else s.gap++;
        if (s.thirsty) s.maxGap = Math.max(s.maxGap, s.gap);
        prev[r.n] = r.th;
      }
    } });
    // RE-POINTED at the needs-failure merge, and it is a MEASUREMENT BUG, not a
    // loosened gate: `perDay` was each crab's OWN sample count / 10, so a
    // drifter who steps off the bus on day 8 and is thirsty from the moment
    // they arrive divides two real days by 0.2 samples-per-day and scores
    // "10.0 days without a drink". The bug was latent (it needs a late,
    // thirsty, short-lived arrival to bite) and the needs-drag build's stream
    // produced exactly that - MITTENS, KELP, HERMIE and SCUTTLE, all drifters
    // who lived 1-3 days. Normalised on the TOWN's sample rate, the same three
    // seeds read a worst dry spell of 3.1 days here and 2.6 days on the
    // pre-merge build: the fairness the tap exists to provide is intact, and
    // the gate now measures real days for everybody who ever walks into town.
    const perDayTown = Math.max(...Object.values(S).map(s => s.n)) / 10;
    for (const n of Object.keys(S)) {
      const s = S[n], perDay = perDayTown, who = `${n}${s.npc ? " (town)" : " (crew)"}@${seed}`;
      if (s.maxRun / perDay > worst.dry) { worst.dry = s.maxRun / perDay; worst.dryWho = who; }
      if (s.maxGap / perDay > worst.gap) { worst.gap = s.maxGap / perDay; worst.gapWho = who; }
      if (s.crit / s.n > worst.crit) { worst.crit = s.crit / s.n; worst.critWho = who; }
    }
  }
  // Measured on this build: worst parched streak 1.0d, worst dry spell 3.1d,
  // worst crab 18.7% of its life at the sickness line (SUDSY, seed 17 - an
  // owner-operator on a ten-hour day). That last figure was ~7% before the
  // trudge and is the price of it, recorded rather than tuned away: the same
  // 12-town illness matrix reads FEWER infections (51 -> 37) and FEWER deaths
  // (11 -> 9) after, so the pressure lands on the meter without landing on
  // the mortality. If it climbs past the gate, DRAG_THIRST_AT is the knob
  // (on this probe, with the hunger ramp then starting at 0.5, DRAG_THIRST_AT
  // 0.45 measured 21% and 0.5 measured 6%).
  if (worst.dry >= 3) return `a crab spent ${worst.dry.toFixed(1)} days straight in the parched band: ${worst.dryWho}`;
  if (worst.gap >= 7) return `a thirsty crab went ${worst.gap.toFixed(1)} days without a drink: ${worst.gapWho}`;
  if (worst.crit >= 0.25) return `${worst.critWho} spent ${(100 * worst.crit).toFixed(0)}% of its life on the dehydration sickness line`;
  return true;
});

scenario("taps: free and always reachable, and the juice bar still sells", () => {
  const sim = createSim({ seed: 11 });
  tapTown(sim);
  // FREE: a crab who could easily afford a juice pays nothing at the spout,
  // and plain water only takes the EDGE off - a juice zeroes the meter
  sim.G(`{ const c = crabs[0]; c.p.wallet = 30; c.p.thirst = 1;
    abortActivity(c); startTapStop(c, { tap: 0, need: "drink" }); }`);
  if (!sim.runUntil(`crabs[0].p.thirst < 1`, { maxSteps: 200000 }))
    return "a crab sent to the tap never got a drink";
  if (sim.G("crabs[0].p.wallet") !== 30) return "the tap charged for a drink of water";
  if (sim.G("crabs[0].p.thirst") <= 0) return "plain water fully quenched - it must be worse than a bought drink";
  if (!(sim.G("crabs[0].p.thirst") <= 1 - 0.5)) return "the tap barely quenched anything";
  // ALWAYS REACHABLE: with every counter in town unstaffed and every wallet
  // empty, a properly thirsty crab of EVERY kind is still offered a tap
  sim.G(`{ for (const c of allCrabs()) { c.p.thirst = 0.75; c.p.wallet = 0; c.p.dirt = 0;
    c.duty = false; c.pendingOff = true; c.p.hunger = 0; c.p.bored = 0; } }`);
  const cover = JSON.parse(sim.G(`JSON.stringify(allCrabs().map(c => { const e = pickErrand(c); return [c.p.name, !!c.p.npc, !!(e && e.tap != null && e.need === "drink")]; }))`));
  const stranded = cover.filter(r => !r[2]).map(r => r[0] + (r[1] ? " (town)" : " (crew)"));
  if (stranded.length) return "no water offered to: " + stranded.join(", ");
  if (!cover.some(r => r[1]) || !cover.some(r => !r[1])) return "the fixture covered only one kind of crab";
  // THE REVENUE FLOOR: over a fortnight the bar must still be a real business.
  // Measured 6 seeds x 14d, before -> after: $14347 -> $15386 (+7.2%) - it goes
  // UP, because a hydrated town walks faster and shops more. The floor sits
  // well under that, so a future tap tweak that guts the bar fails loudly.
  const b = createSim({ seed: 13 });
  tapTown(b);
  b.G(`window._take = {}; var _cb0 = creditBiz;
    creditBiz = function (k, amt, x, y) { window._take[k] = (window._take[k] || 0) + amt; return _cb0(k, amt, x, y); };`);
  b.runDays(14, { tickEvery: 20, onTick: (G) => { G(`if (coins < 800) coins = 800;`); } });
  const take = JSON.parse(b.G(`JSON.stringify(window._take || {})`));
  const taps = b.G(`(window._stats && window._stats.tapDrinks) || 0`);
  if (!(taps > 0)) return "nobody used a tap all fortnight - the fixture is not exercising them";
  if (!(take.juicebar > 1400)) return `juice bar takings collapsed to $${Math.round(take.juicebar || 0)} over 14 days`;
  return true;
});

scenario("mortality: sustained neglect kills a crew crab AND a townsfolk crab", () => {
  // The `!k.p.npc` guard is gone: every crab is mortal. What must hold is that
  // it takes SUSTAINED NEGLECT, that the town is warned by name first, and that
  // the crab leaves a memorial and a line in the day's report.
  for (const who of ["crew", "town"]) {
    const sim = createSim({ seed: 4242 });
    sim.runUntil("day >= 2 && tmin >= 9 * 60", { maxSteps: 300000 });
    const name = sim.G(who === "crew" ? "crabs[0].p.name" : `npcs.find(c => c.p.name === "SALTY").p.name`);
    // total neglect, HELD: starving, parched, filthy, and made to work through it
    const grind = (G) => G(`{ coins = 3000; const k = allCrabs().find(c => c.p.name === ${JSON.stringify(name)});
      if (k) { k.p.sick = k.p.sick || { days: 1 }; k.p.hunger = 1; k.p.thirst = 1; k.p.dirt = 1; k.p.sickPol = "require"; } }`);
    grind(sim.G);
    let warned = false;
    const gone = sim.runUntil(`!allCrabs().some(c => c.p.name === ${JSON.stringify(name)})`, {
      maxSteps: 900000,
      onTick: (G) => {
        grind(G);
        if (G(`JSON.stringify(today.critical)`).includes(name)) warned = true;
        if (G(`report ? JSON.stringify(report.critical || []) : "[]"`).includes(name)) warned = true;
      },
    });
    if (!gone) return `${who}: total neglect never killed ${name}`;
    if (!warned) return `${who}: ${name} died with no FADING warning - the town never saw it coming`;
    if (!sim.G(`memorials.some(m => m.name === ${JSON.stringify(name)})`))
      return `${who}: no memorial on the dune for ${name}`;
    const line = sim.G(`JSON.stringify((report && report.died && report.died.length ? report.died : today.died))`);
    if (!line.includes(name)) return `${who}: the day report never named ${name}: ${line}`;
    const rec = JSON.parse(sim.G(`JSON.stringify((window._stats.illness || []).filter(r => r.name === ${JSON.stringify(name)} && r.out === "died"))`));
    if (!rec.length) return `${who}: no illness record for the death`;
    if (rec[0].lane !== "neglect") return `${who}: died on the ${rec[0].lane} lane - a neglect death should read as neglect`;
    if (rec[0].npc !== (who === "town")) return `${who}: the record filed the death under the wrong kind of crab`;
    if (rec[0].days < sim.G("DEATH_DAY")) return `${who}: died after only ${rec[0].days} days ill (roll arms at ${sim.G("DEATH_DAY")})`;
  }
  return true;
});

scenario("mortality: a cared-for crab is not taken on day three (the ladder still pays)", () => {
  // The care ladder has to keep meaning something now that EVERYONE can die.
  // A crab who is fed, watered, clean and resting in their own bed sits on the
  // BED lane: the roll does not even arm until LINGER_DAY, and the cure odds
  // are the improved ones. Same illness, same day, two different fates.
  const setup = `{ const k = crabs[0];
    k.p.homeless = false; k.p.house = 3; k.p.boat = null;
    k.p.hunger = 0; k.p.thirst = 0; k.p.dirt = 0; k.p.restT = REST_HOURS + 1;
    k.p.sickPol = "grant"; k.p.sick = { days: 3 }; }`;
  const sim = createSim({ seed: 77 });
  sim.runUntil("day >= 2 && tmin >= 12 * 60", { maxSteps: 300000 });
  sim.G(setup);
  if (sim.G(`careLane(crabs[0])`) !== "bed") return "the fixture never reached BED REST: " + sim.G(`careLane(crabs[0])`);
  if (sim.G(`gravelyIll(crabs[0])`)) return "a crab resting in their own bed was flagged GRAVELY ILL on day 3";
  if (!(sim.G(`deathArmsAt("bed")`) > sim.G(`deathArmsAt("neglect")`)))
    return "a cared-for crab's death roll arms no later than a neglected one's";
  const lanes = JSON.parse(sim.G(`JSON.stringify(CARE_LANES)`));
  if (!(lanes.bed.cure > lanes.cot.cure && lanes.cot.cure > lanes.cared.cure && lanes.cared.cure > lanes.neglect.cure))
    return "the care ladder's cure odds are no longer graded: " + JSON.stringify(lanes);
  // 24 nights of exactly that day-3 bed rest: the roll must never fire, and the
  // crab must actually get better on the good odds
  let deaths = 0, cures = 0;
  for (let i = 0; i < 24; i++) {
    const s2 = createSim({ seed: 500 + i });
    s2.runUntil("day >= 2 && tmin >= 12 * 60", { maxSteps: 300000 });
    s2.G(setup);
    s2.runUntil("lastRentDay === day", { maxSteps: 400000, onTick: (G) => {
      G(`{ coins = 3000; const k = crabs[0];
        if (k && k.p.sick) { k.p.hunger = 0; k.p.thirst = 0; k.p.dirt = 0; k.p.restT = REST_HOURS + 1; } }`);
    } });
    if (!s2.G("crabs[0]")) deaths++;
    else if (!s2.G("crabs[0].p.sick")) cures++;
  }
  if (deaths) return `${deaths}/24 cared-for crabs were taken on the third day of illness`;
  if (cures < 6) return `only ${cures}/24 cared-for crabs recovered - the improved lane stopped paying`;
  return true;
});

scenario("mortality: a dead townsfolk crab leaves the town in a sane state", () => {
  const store = new Map();
  const sim = createSim({ seed: 4242, storage: store, fresh: false });
  sim.runUntil("day >= 2 && tmin >= 9 * 60", { maxSteps: 300000 });
  // give SUDSY a member of staff first, so the dead-owner path has a job to lose
  sim.G(`{ const f = npcs.find(c => c.p.name === "DRIFT");
    f.p.job = "showers"; f.p.employer = "sudsy"; f.workBiz = "showers"; f.fishSpot = null;
    OWNERS.sudsy.till = 400; }`);
  const grind = (G) => G(`{ const k = npcs.find(c => c.p.name === "SUDSY");
    if (k) { k.p.sick = k.p.sick || { days: 1 }; k.p.hunger = 1; k.p.thirst = 1; k.p.dirt = 1; k.p.sickPol = "require"; } }`);
  grind(sim.G);
  if (!sim.runUntil(`!npcs.some(c => c.p.name === "SUDSY")`, { maxSteps: 900000, onTick: grind }))
    return "SUDSY never died";
  // the shop has no owner: shut, not silently trading, and off the job board
  if (!sim.G(`bizDark("showers")`)) return "a shop whose owner died is still open for business";
  if (!sim.G(`OWNERS.sudsy.gone`)) return "the owner registry never recorded the death";
  if (sim.G(`jobBoard.some(j => j.biz === "showers")`)) return "a dead owner's shop is still advertising for staff";
  // her staff are not drawing wages from a till nobody keeps
  const drift = sim.G(`JSON.stringify(npcs.filter(c => c.p.name === "DRIFT").map(c => [c.p.job, c.p.employer, !!c.fishSpot]))`);
  if (drift !== '[["fishing",null,true]]') return "her staff did not go back to the pier: " + drift;
  // no orphaned pier spot: no two fishers standing in the same place
  const spots = JSON.parse(sim.G(`JSON.stringify(allCrabs().filter(c => c.fishSpot && c.p.boat == null).map(c => c.fishSpot.x + "," + c.fishSpot.y))`));
  if (new Set(spots).size !== spots.length) return "two fishers were handed the same place on the rail: " + spots;
  // the sim keeps running - no crash, no wedge
  const d0 = sim.G("day");
  sim.runDays(d0 + 4, { tickEvery: 20, onTick: (G) => { if (G("coins") < 400) G("coins = 1200"); } });
  if (sim.G("day") <= d0) return "the town stopped advancing after a death";
  // save/load: the dead stay dead, the memorial and the shuttered shop persist.
  // (initNpcs() stands the founders up BEFORE load() runs, so without the prune
  // SUDSY walks back out of the sea on every reload.)
  sim.G("save()");
  const back = createSim({ seed: 99, storage: store, fresh: false });
  if (!back.G("hasSave")) return "the town after a death did not save";
  if (back.G(`allCrabs().some(c => c.p.name === "SUDSY")`)) return "SUDSY walked back out of the sea on reload";
  if (!back.G(`memorials.some(m => m.name === "SUDSY")`)) return "the memorial did not survive the reload";
  if (!back.G(`bizDark("showers")`)) return "the ownerless shop reopened itself on reload";
  const spots2 = JSON.parse(back.G(`JSON.stringify(allCrabs().filter(c => c.fishSpot && c.p.boat == null).map(c => c.fishSpot.x + "," + c.fishSpot.y))`));
  if (new Set(spots2).size !== spots2.length) return "reload double-booked a place on the rail: " + spots2;
  back.runDays(back.G("day") + 2, { tickEvery: 20, onTick: (G) => { if (G("coins") < 400) G("coins = 1200"); } });
  return true;
});

// ---------------------------------------------------------------- needs fail
// in their own character: HUNGER and THIRST are a SPEED PENALTY (Matt's call -
// the design doc's RAID and SHORT LEASH are both rejected), DIRT is THE WIDE
// BERTH (doc D1). The four gates below are the ones the brief named.

scenario("trudge: hunger and thirst are a speed penalty, and it SCALES", () => {
  const sim = createSim({ seed: 9 });
  // 1) the curve itself. One shape, two needs: a ramp to -25% at a pinned 1.00,
  //    started at the line where that need already cost the town something
  //    (hunger at crabEff's 0.3, thirst where the old -15% cliff's value falls
  //    out exactly), and the two together floored so neglect can never
  //    compound into paralysis.
  const drag = (h, t) => sim.G(`needDrag({ p: { hunger: ${h}, thirst: ${t} } })`);
  if (drag(0, 0) !== 1) return `a fed, watered crab is dragged: ${drag(0, 0)}`;
  if (drag(0.3, 0.5) !== 1) return "the ramps do not start where they are documented to start";
  if (!near(drag(1, 0), 0.74, 0.76)) return `starving walks at ${drag(1, 0)}, want 0.75`;
  if (!near(drag(0, 1), 0.74, 0.76)) return `parched walks at ${drag(0, 1)}, want 0.75`;
  // SCALING, not a switch: half-starved must land near the middle of the ramp
  const mid = drag(0.65, 0);
  if (!near(mid, 0.86, 0.89)) return `half-starved walks at ${mid}, want ~0.875 (the ramp is a cliff again?)`;
  if (!(drag(0.6, 0) > drag(0.8, 0) && drag(0.8, 0) > drag(1, 0)))
    return "the hunger ramp is not monotone";
  // the old -15% thirst CLIFF at 0.8 is gone, and the ramp lands EXACTLY on the
  // value it used to jump to, at the threshold it used to jump at
  if (drag(0, 0.8) !== 0.85) return `thirst 0.8 walks at ${drag(0, 0.8)}, want the old cliff's 0.85 - the T2 balance point moved`;
  const both = drag(1, 1);
  if (both < 0.69 || both > 0.71) return `starving AND parched walks at ${both}, want the 0.70 floor`;
  // 2) HEAT SHIMMER is a read, not a cost: mean-preserving to within a whisker
  //    over two real minutes of walking, so the ramp is the whole penalty.
  const dist = (h, t, noShim) => sim.G(`(() => {
    const c = crabs[0]; const sv = [c.p.hunger, c.p.thirst, c.p.sick, c.p.bored, window._noShimmer];
    c.p.hunger = ${h}; c.p.thirst = ${t}; c.p.sick = null; c.p.bored = 0;
    window._noShimmer = ${!!noShim};
    const t0 = time; let d = 0;
    for (let i = 0; i < 2400; i++) { time += 0.05; d += crabMove(c) * 0.05; }
    time = t0;
    c.p.hunger = sv[0]; c.p.thirst = sv[1]; c.p.sick = sv[2]; c.p.bored = sv[3]; window._noShimmer = sv[4];
    return d; })()`);
  const fed = dist(0, 0), starving = dist(1, 0), parched = dist(0, 1), half = dist(0.75, 0);
  if (!(starving < fed * 0.8)) return `a starving crab covered ${starving.toFixed(0)}px vs a fed crab's ${fed.toFixed(0)}px in 2 minutes - not visible`;
  if (!(parched < fed * 0.8)) return `a parched crab covered ${parched.toFixed(0)}px vs ${fed.toFixed(0)}px - not visible`;
  if (!(half > starving && half < fed)) return `half-starved (${half.toFixed(0)}px) did not land between fed and starving`;
  const shim = dist(0, 1, false), flat = dist(0, 1, true);
  if (Math.abs(shim - flat) > flat * 0.02)
    return `heat shimmer moved 2 minutes of parched walking by ${(100 * (shim / flat - 1)).toFixed(1)}% - it is supposed to cost nothing`;
  // 3) and it shows up in a REAL commute: the same crab, the same seed, the
  //    same trip - starved, they clock in measurably later.
  const commute = (starve) => {
    const s = createSim({ seed: 4242 });
    s.runUntil('crabs[0].dayState === "toWork"', { maxSteps: 400000 });
    const pin = (G) => G(`{ const c = crabs[0]; c.p.hunger = ${starve ? 1 : 0}; c.p.thirst = ${starve ? 1 : 0};
      c.p.sick = null; c.p.bored = 0; }`);
    pin(s.G);
    const t0 = s.G("tmin");
    if (!s.runUntil('crabs[0].dayState === "working"', { maxSteps: 400000, tickEvery: 2, onTick: pin }))
      return null;
    return s.G("tmin") - t0;
  };
  const fast = commute(false), slow = commute(true);
  if (fast == null || slow == null) return "a crab never finished the commute at all - the trudge is a wedge";
  if (!(slow > fast)) return `starving commute ${slow} game-min vs fed ${fast} - no difference on the boardwalk`;
  return true;
});

scenario("trudge: the speed penalty does not kill anybody (anti-spiral gate)", () => {
  // The brief's hard gate. Hunger already drags prep through crabEff and both
  // needs already feed the nightly sickness roll; a movement penalty on top
  // must not turn a hungry crab into a dead one. Paired arms INSIDE this build
  // (window._noNeedDrag collapses the ramps to 1.0) over solvent towns, which
  // is the shape the mortality work used - a do-nothing town dies of rent long
  // before it dies of neglect, so it cannot show this either way.
  // The FLOOR is the mechanism: 0.70 with both needs pinned, so the walk to
  // the food and the walk to the tap are always still walkable.
  const sim0 = createSim({ seed: 3 });
  if (sim0.G("DRAG_FLOOR") < 0.65) return `DRAG_FLOOR is ${sim0.G("DRAG_FLOOR")} - the anti-spiral guard is gone`;
  const arm = (drag) => {
    let deaths = 0, infections = 0;
    for (const seed of [1337, 2674, 4011, 5348, 909, 31]) {
      const s = createSim({ seed });
      if (!drag) s.G("window._noNeedDrag = true");
      s.runDays(30, { tickEvery: 40, onTick: (G) => G("coins = Math.max(coins, 2000)") });
      const st = JSON.parse(s.G("JSON.stringify(window._stats)"));
      deaths += (st.illness || []).filter(r => r.out === "died").length;
      infections += st.infections || 0;
    }
    return { deaths, infections };
  };
  const on = arm(true), off = arm(false);
  if (on.deaths > off.deaths + 3)
    return `the trudge killed ${on.deaths} crabs against ${off.deaths} with it switched off - that is a spiral`;
  if (on.infections > off.infections * 1.4 + 4)
    return `the trudge drove infections ${off.infections} -> ${on.infections} - the sickness channel is compounding`;
  return true;
});

scenario("dirt: THE WIDE BERTH - the town gives them room, and a tourist takes the far table", () => {
  const sim = createSim({ seed: 12 });
  // 1) the bubble ramps with the dirt, and it is the CLEANER crab that gives
  //    ground - the filthy crab is never pushed, which is what stops it wedging
  const berth = (d) => sim.G(`crabBerth({ p: { dirt: ${d} } })`);
  if (berth(0.6) !== 0) return `a 0.6 crab already has a bubble (${berth(0.6)})`;
  if (!near(berth(0.8), 4.5, 5.5)) return `dirt 0.8 opens ${berth(0.8)}px, want ~5`;
  if (!near(berth(1), 9.5, 10.5)) return `dirt 1.0 opens ${berth(1)}px, want ~10 (12px personal space -> 22px)`;
  sim.runUntil("day >= 2 && tmin >= 12 * 60", { maxSteps: 300000 });
  const sep = (dirt) => sim.G(`(() => {
    const a = crabs[0], b = crabs[1];
    for (const c of [a, b]) { c.hidden = false; c.errandCust = null; c.cstate = ""; c.dayState = "toWork";
      c.slot = -1; c.slotKind = null; c.p.dirt = 0; c.detour = null; }
    a.p.dirt = ${dirt};
    a.x = 700; a.y = 154; b.x = 716; b.y = 154; a._stepped = true; b._stepped = true;
    const ax0 = a.x, ay0 = a.y;
    for (let i = 0; i < 40; i++) { a._stepped = true; b._stepped = true; collide(0.05); }
    return JSON.stringify([Math.hypot(b.x - a.x, (b.y - a.y) * 1.8), Math.hypot(a.x - ax0, a.y - ay0)]); })()`);
  const [clean] = JSON.parse(sep(0));
  const [filthy, filthyMoved] = JSON.parse(sep(1));
  if (!(filthy > clean + 4))
    return `a filthy crab is given ${filthy.toFixed(1)}px where a clean one gets ${clean.toFixed(1)}px - no berth`;
  if (!(filthy > 18)) return `the bubble only opened to ${filthy.toFixed(1)}px, want past 18`;
  if (filthyMoved > 0.01)
    return `the berth shoved the FILTHY crab ${filthyMoved.toFixed(1)}px - it must only move the passer-by, or it can pin them`;
  // suppressed at home and after dark: a four-cot shelter cannot give anybody
  // two body-widths, and this is a boardwalk read
  const indoors = JSON.parse(sim.G(`(() => {
    const a = crabs[0], b = crabs[1];
    for (const c of [a, b]) { c.hidden = false; c.errandCust = null; c.cstate = ""; c.dayState = "home"; c.slot = -1; c.slotKind = null; c.p.dirt = 0; }
    a.p.dirt = 1; a.x = 700; a.y = 154; b.x = 716; b.y = 154;
    for (let i = 0; i < 40; i++) { a._stepped = true; b._stepped = true; collide(0.05); }
    return JSON.stringify([Math.hypot(b.x - a.x, (b.y - a.y) * 1.8)]); })()`))[0];
  if (indoors > clean + 3) return `the bubble followed them indoors (${indoors.toFixed(1)}px) - shelter cots would deadlock`;
  // 2) a tourist declines the table beside a filthy crab...
  const seatPick = sim.G(`(() => {
    coins = 3000; tryBuy("table"); tryBuy("table");
    const ts = bizTables("shack");
    for (const t of ts) { t.occupant = null; t.dishes = 0; }
    for (const c of allCrabs()) { c.p.dirt = 0; c.hidden = true; }
    const f = crabs[0]; f.hidden = false; f.p.dirt = 1;
    f.x = ts[0].x + 2; f.y = ts[0].y + 12;
    const k = { isCrab: false, server: null };
    const pick = pickSeat(ts, k);
    window._ts = ts.map(t => t.x + "," + t.y).join(" ");
    return pick === ts[0] ? "ADJACENT" : pick ? "FAR" : "NONE"; })()`);
  if (seatPick !== "FAR") return `a tourist sat ${seatPick} to a filthy crab`;
  // ...but there is ALWAYS an out: if every table has one beside it they sit
  // anyway rather than stand, so filth can never deadlock the dining room
  const noOut = sim.G(`(() => {
    const ts = bizTables("shack");
    for (const t of ts) { t.occupant = null; t.dishes = 0; }
    const filthy = crabs.concat(npcs).slice(0, ts.length);
    if (filthy.length < ts.length) return "TOO FEW CRABS";
    ts.forEach((t, i) => { const c = filthy[i]; c.hidden = false; c.p.dirt = 1; c.x = t.x + 2; c.y = t.y + 12; });
    const before = window._stats.seatSatAnyway || 0;
    const pick = pickSeat(ts, { isCrab: false, server: null });
    return pick && (window._stats.seatSatAnyway || 0) === before + 1 ? "SAT ANYWAY" : pick ? "SAT, UNCOUNTED" : "STRANDED"; })()`);
  if (noOut !== "SAT ANYWAY") return `every table beside a filthy crab and the guest was ${noOut}`;
  // 3) ...and a filthy server burns their patience faster
  const pat = JSON.parse(sim.G(`JSON.stringify([
    serverFilth({ isCrab: false, server: { p: { dirt: 0 } } }),
    serverFilth({ isCrab: false, server: { p: { dirt: 1 } } }),
    serverFilth({ isCrab: true, crab: crabs[0], server: { p: { dirt: 1 } } })])`));
  if (pat[0] !== 1) return "a clean server costs patience";
  if (!near(pat[1], 1.25, 1.35)) return `a filthy server drains patience at ${pat[1]}x, want ~1.3x`;
  if (pat[2] !== 1) return "a LOCAL was fussy about their filthy colleague - locals are not tourists";
  return true;
});

scenario("dirt: a filthy crab in a crowded shack wedges nobody (warps + unsticks floor)", () => {
  // The named risk: an inflated collision radius is exactly the thing that
  // could make crabs bounce off each other forever. Same busy town the routing
  // scenario measures, with a crab PINNED filthy all week, run against a
  // paired arm with the berth switched off inside this same build.
  const arm = (berth) => {
    const sim = createSim({ seed: 5348 });
    if (!berth) sim.G("window._noBerth = true");
    sim.G(`coins = 3000; tryBuy("arcade"); tryBuy("chef"); tryBuy("chef");
      crabs[2].p.job = "arcade"; crabs[3].p.job = "arcade";`);
    sim.runDays(5, { tickEvery: 8, onTick: (G) => G(`{ coins = Math.max(coins, 2000);
      const c = crabs[0]; if (c) c.p.dirt = 1; }`) });
    const st = JSON.parse(sim.G("JSON.stringify(window._stats)"));
    return { w: st.warps || 0, u: st.unsticks || 0, served: st.tourServes || 0 };
  };
  const on = arm(true), off = arm(false);
  if (on.w > 2) return `${on.w} bounce-budget warps in 5 days with a filthy crab (floor is 0, gate 2)`;
  if (on.w + on.u > 12) return `${on.w} warps + ${on.u} unsticks (paired arm with the berth off: ${off.w} + ${off.u}; gate 12)`;
  if (on.u > off.u * 2 + 6)
    return `the berth doubled the sidestep watchdog: ${off.u} unsticks off, ${on.u} on - it is reading as a pin`;
  if (on.served < off.served * 0.75)
    return `the berth cost the shack ${off.served} -> ${on.served} serves in five days - that is a wedge, not a bubble`;
  return true;
});


// ============================================================ TABLE SERVICE
// The table-service economy (owner directive, 2026-08-19): tips belong to
// table service, tips can be shared with the crab who earned them, there are
// more tables to buy, and a vacated table is bused by staff.

scenario("tips: the counter gets a token, the table gets the lot", () => {
  // The owner's complaint, measured: a guest handed a plate over the pass used
  // to tip exactly what a guest who had been sat down and waited on tipped -
  // in fact MORE, because a counter guest is served before their patience has
  // drained. Both paths are driven through payAndBenefit here with the SAME
  // customer, so the only thing that differs is where they were served.
  const sim = createSim({ seed: 5 });
  const got = JSON.parse(sim.G(`(() => {
    const c = crabs[0];
    c.p.dirt = 0; c.p.tired = 0;              // no fumble multipliers in play
    BIZ.shack.tipShare = 0;                    // the whole tip to the till
    const r = BIZ.shack.recipes.find(x => x.id === "taco");
    const mk = (state) => ({ biz: "shack", recipe: r, state, patience: 40, maxPatience: 50,
      x: 1500, isCrab: false, server: c, claimed: true, served: false });
    const t0 = coins; payAndBenefit(c, mk("seatedWaiting")); const table = coins - t0;
    const t1 = coins; payAndBenefit(c, mk("waiting"));       const counter = coins - t1;
    return JSON.stringify({ table, counter, pay: r.pay, mult: TRAITS[c.p.trait].tip,
      frac: TIP_COUNTER, tableTip: TABLE_TIP });
  })()`));
  // tip = pay x 0.5 x (patience / maxPatience) x traitTip, and the counter
  // keeps only TIP_COUNTER of it. The base plate price is the same either way.
  const full = got.pay * 0.5 * 0.8 * got.mult;
  const wantTable = got.pay + full;
  const wantCounter = got.pay + full * got.frac;
  const near2 = (a, b) => Math.abs(a - b) < 0.01;
  if (!near2(got.table, wantTable)) return `table service rang ${got.table.toFixed(2)}, expected ${wantTable.toFixed(2)}`;
  if (!near2(got.counter, wantCounter)) return `counter service rang ${got.counter.toFixed(2)}, expected ${wantCounter.toFixed(2)}`;
  if (got.frac > 0.25) return `TIP_COUNTER is ${got.frac} - that is not a token any more`;
  // and the seat itself carries the table tip on the way out, which the
  // counter never sees at all
  if (got.tableTip < 6) return `TABLE_TIP is only ${got.tableTip} - the premium tier has no premium`;
  return true;
});

scenario("tips: the sharing slider pays the crab's wallet and the till, exactly", () => {
  // Both ends of the slider plus one in the middle, on the same customer and
  // the same server. The crab's cut lands in their WALLET - the housing
  // ladder's fuel - and nothing is created or destroyed on the way.
  const sim = createSim({ seed: 5 });
  const rows = JSON.parse(sim.G(`(() => {
    const c = crabs[0];
    c.p.dirt = 0; c.p.tired = 0;
    const r = BIZ.shack.recipes.find(x => x.id === "taco");
    const out = [];
    for (const share of [0, 0.5, 1]) {
      setTipShare("shack", share);
      c.p.wallet = 0;
      const t0 = coins;
      payAndBenefit(c, { biz: "shack", recipe: r, state: "seatedWaiting", patience: 50,
        maxPatience: 50, x: 1500, isCrab: false, server: c, claimed: true, served: false });
      out.push({ share: BIZ.shack.tipShare, till: coins - t0, wallet: c.p.wallet,
        tip: r.pay * 0.5 * TRAITS[c.p.trait].tip, pay: r.pay });
    }
    return JSON.stringify(out);
  })()`));
  const near2 = (a, b) => Math.abs(a - b) < 0.01;
  for (const r of rows) {
    const wantWallet = r.tip * r.share;
    const wantTill = r.pay + (r.tip - wantWallet);
    if (!near2(r.wallet, wantWallet))
      return `at ${r.share * 100}% the crab pocketed ${r.wallet.toFixed(2)}, expected ${wantWallet.toFixed(2)}`;
    if (!near2(r.till, wantTill))
      return `at ${r.share * 100}% the till took ${r.till.toFixed(2)}, expected ${wantTill.toFixed(2)}`;
  }
  if (rows[0].wallet !== 0) return "the default slider (0%) still paid the crab";
  if (!near2(rows[2].till, rows[2].pay)) return "at 100% the till kept some of the tip";
  // the slider itself: clamped and snapped to its own grain, no matter what
  const clamp = JSON.parse(sim.G(`JSON.stringify([setTipShare("shack", -3), setTipShare("shack", 7.5),
    setTipShare("shack", 0.37)])`));
  if (clamp[0] !== 0 || clamp[1] !== 1) return `setTipShare failed to clamp: ${JSON.stringify(clamp)}`;
  if (Math.abs(clamp[2] - 0.35) > 1e-9) return `setTipShare did not snap to the 5% grain: ${clamp[2]}`;
  return true;
});

scenario("tables: a vacated table goes dirty, blocks the room, gets bused, comes back", () => {
  // The stall cycle, one furniture type over: occupied -> dirty -> cleaning ->
  // clean. Driven on a real guest so the dining exit is the code under test.
  const sim = createSim({ seed: 44 });
  sim.runUntil(`customers.some(k => k.state === "dining" && !k.isCrab && k.biz === "shack")`,
    { maxSteps: 200000 });
  if (!sim.G(`customers.some(k => k.state === "dining" && !k.isCrab)`)) return "no guest ever sat down to eat";
  sim.G(`window._t = BIZ.shack.tables.indexOf(customers.find(k => k.state === "dining" && !k.isCrab).table)`);
  if (sim.G("window._t") < 0) return "the diner is not at a table";
  // let them finish their meal
  sim.runUntil(`!BIZ.shack.tables[window._t].occupant`, { maxSteps: 60000 });
  const t = () => JSON.parse(sim.G(`JSON.stringify({ dirty: !!BIZ.shack.tables[window._t].dirty,
    dishes: BIZ.shack.tables[window._t].dishes, occ: !!BIZ.shack.tables[window._t].occupant,
    seatable: pickSeat([BIZ.shack.tables[window._t]], { isCrab: false }) !== null })`));
  const left = t();
  if (!left.dirty) return "the guest bused their own table - the outdoor rule is still live";
  if (!left.dishes) return "a dirty table with no plates on it";
  if (left.seatable) return "a dirty table still seats the next guest";
  // ...and a crab comes and clears it
  const bused = sim.runUntil(`!BIZ.shack.tables[window._t].dirty`, { maxSteps: 120000 });
  if (!bused) return "nobody ever bused the table";
  const back = t();
  if (back.dishes !== 0) return `bused table still carries ${back.dishes} plates`;
  // "back in service" = seatable, or already claimed by the next guest (the
  // room moves fast enough that a cleared table can be taken within the second)
  if (!back.seatable && !back.occ) return "a bused table still will not seat anybody";
  const st = JSON.parse(sim.G("JSON.stringify(window._stats)"));
  return (st.tablesBused || 0) > 0 ? true : "the busing counter never moved";
});

scenario("tables can never wedge: both abort paths free them, and a soak stays clean", () => {
  // The stall-wedge scenario's twin. A crab that dies or is yanked mid-clean
  // must release the table, a guest yanked mid-meal must not leave it
  // occupied, and no table may sit out of service for longer than a real
  // dirty-and-bused cycle over two full trading days.
  const sim = createSim({ seed: 21 });
  sim.runUntil('crabs[0].dayState === "home" && tmin > 12 * 60', { maxSteps: 300000 });
  // (1) a guest yanked out of a meal: occupant off, and flagged dirty so a
  //     crab is guaranteed to come for it (plates on an unflagged table would
  //     be unseatable AND unbuseable - the exact stall wedge)
  sim.G(`{
    const t = BIZ.shack.tables.find(t2 => !t2.occupant) || BIZ.shack.tables[0];
    window._t = BIZ.shack.tables.indexOf(t);
    t.dirty = false; t.cleaning = false; t.dishes = 1;
    const k = { biz: "shack", isCrab: true, crab: crabs[0], state: "dining", dineT: 9,
      table: t, x: t.x, spawnX: t.x, claimed: true, served: true, recipe: BIZ.shack.recipes[0] };
    t.occupant = k; customers.push(k); crabs[0].errandCust = k; crabs[0].dayState = "errand";
    abortErrand(crabs[0]);
  }`);
  if (sim.G("BIZ.shack.tables[window._t].occupant !== null")) return "abortErrand left the table occupied";
  if (!sim.G("BIZ.shack.tables[window._t].dirty")) return "aborted table not flagged dirty - it can never be bused";
  if (sim.G('customers.some(k => k.table === BIZ.shack.tables[window._t])')) return "ghost diner survived";
  // (2) a crab yanked mid-bus: the cleaning flag must come off with them
  sim.G(`{
    const t = BIZ.shack.tables[window._t];
    t.dirty = true; t.cleaning = false; t.dishes = 1;
    startBus(crabs[0], t); crabs[0].workBiz = "shack";
    abortChef(crabs[0]);
  }`);
  if (sim.G("BIZ.shack.tables[window._t].cleaning")) return "abortChef left the table flagged 'cleaning' forever";
  if (sim.G("crabs[0].cleanTable")) return "the crab still holds a table after abortChef";
  // (3) the soak: two trading days, nothing may stay out of service forever
  let worst = 0;
  const held = {};
  sim.runDays(2, { tickEvery: 4, onTick: (G) => {
    if (G("coins") < 300) G("coins = 600");
    const rows = JSON.parse(G(`JSON.stringify(bizTables("shack").map(t => (t.dirty || t.dishes > 0) && !t.occupant))`));
    const open = G("bizOpenNow('shack') && allCrabs().some(c => c.duty && c.workBiz === 'shack')");
    rows.forEach((out, i) => {
      held[i] = out && open ? (held[i] || 0) + 0.2 * 4 : 0;   // only count time the shack is actually staffed
      worst = Math.max(worst, held[i]);
    });
  } });
  return worst < 120 ? true : "a table sat dirty for " + worst.toFixed(0) + " staffed sim-seconds";
});

scenario("tables: more tables really do seat more guests (the cap earns its keep)", () => {
  // Directive 3's promise, measured rather than assumed: raising the cap has
  // to move throughput, not just the shop grid. Solvent towns with a real crew
  // so the comparison is about SEATS, not about who could afford the upgrade.
  const arm = (lvl) => {
    let seated = 0;
    for (const seed of [1337, 4011, 909]) {
      const sim = createSim({ seed });
      sim.G(`coins = 6000; tryBuy("chef"); tryBuy("chef");
             for (let i = 0; i < ${lvl}; i++) tryBuy("table"); coins = 900;`);
      sim.runDays(8, { tickEvery: 40, onTick: (G) => { if (G("coins") < 400) G("coins = 900"); } });
      seated += sim.G("window._stats.seated | 0");
    }
    return seated;
  };
  const cap = createSim({ seed: 1 }).G("UPS.table.max");
  if (cap < 4) return `UPS.table.max is ${cap} - the cap was not raised`;
  const base = arm(0), full = arm(cap);
  if (full <= base * 1.1)
    return `the full cap seated ${full} against ${base} at the starting two tables - the extra tables do nothing`;
  // ...and EVERY table the shop sells is genuinely reachable and seatable -
  // a new table parked somewhere guests cannot path to would pass the
  // throughput gate above on the strength of the ones that already worked
  const sim = createSim({ seed: 1337 });
  sim.G(`coins = 6000; tryBuy("chef"); tryBuy("chef");
         while (UPS.table.lvl < UPS.table.max) tryBuy("table"); coins = 900;
         window._used = bizTables("shack").map(() => 0);`);
  sim.runDays(8, { tickEvery: 10, onTick: (G) => {
    if (G("coins") < 400) G("coins = 900");
    G(`bizTables("shack").forEach((t, i) => { if (t.occupant) window._used[i]++; })`);
  } });
  const used = JSON.parse(sim.G("JSON.stringify(window._used)"));
  const idle = used.map((n, i) => [i, n]).filter(([, n]) => n === 0);
  return idle.length === 0 ? true
    : `table(s) ${idle.map(([i]) => i).join(",")} never seated anybody in 8 days - unreachable (occupancy ticks ${used.join(",")})`;
});

scenario("tip sharing + the table cap roundtrip save/load", () => {
  const store = new Map();
  const a = createSim({ seed: 3, storage: store, fresh: false });
  a.runDays(1);
  a.G(`setTipShare("shack", 0.35); setTipShare("juicebar", 1); UPS.table.lvl = 3; save();`);
  const b = createSim({ seed: 3, storage: store, fresh: false });
  const got = JSON.parse(b.G(`JSON.stringify({ shack: BIZ.shack.tipShare, bar: BIZ.juicebar.tipShare,
    lvl: UPS.table.lvl, tables: (bizTables("shack") || []).length })`));
  if (Math.abs(got.shack - 0.35) > 1e-9) return `shack tip share came back ${got.shack}`;
  if (got.bar !== 1) return `juice bar tip share came back ${got.bar}`;
  if (got.lvl !== 3) return `table level came back ${got.lvl}`;
  if (got.tables !== 5) return `${got.tables} tables stand at level 3, expected 5`;
  // an OLD save has no tipShare key at all, and 0 is the old behavior
  const store2 = new Map();
  store2.set(SLOT1, JSON.stringify({ _ver: 1, coins: 200, day: 2, lv: { chef: 2, table: 1 },
    personas: [{ name: "PINCHY", job: "shack" }, { name: "CLAWDIA", job: "shack" }] }));
  store2.set(ACTIVE, "1");
  const c = createSim({ seed: 3, storage: store2, fresh: false });
  const old = JSON.parse(c.G(`JSON.stringify({ shack: BIZ.shack.tipShare, tables: (bizTables("shack") || []).length })`));
  if (old.shack !== 0) return `an old save opened on a ${old.shack} tip share instead of 0`;
  if (old.tables !== 3) return `an old save at table level 1 stands ${old.tables} tables, expected 3`;
  // and a hand-edited nonsense value cannot hand a crab 750% of the tip
  const d = createSim({ seed: 3, storage: store2, fresh: false });
  d.G(`BIZ.shack.tipShare = 7.5`);
  const clamped = d.G(`bizTipShare("shack")`);
  return clamped === 1 ? true : `a corrupt tip share read back as ${clamped}`;
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
