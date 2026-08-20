// IS "MAX PRICE + MAX HOURS" AN OVERPOWERED STRATEGY?  (Matt, 2026-08-20:
// "jacking up prices to the max and increasing hours to the max shouldn't be an
// overpowered strategy, just a sometimes thing that works for a while")
//
// Four arms over the same seeds, changing NOTHING but the two settings a player
// can actually reach from the management card:
//   base    leave both alone
//   price   shack priceMul -> PRICE_MAX from day one
//   hours   shack open 06:00-24:00 from day one
//   both    both
//
// Reported per arm: how many towns survive, the median eviction day, and the
// two things that are supposed to be the brakes - what the town takes, and what
// it costs in rage-quits and unaffordable counters.
//
// `--buy` crosses all four arms with the GROWTH player the suite already
// models (hourly purchase checks for a chef and tables, reserve = cost +
// tonight's whole bill + a cushion). That is the arm that answers the question
// as asked: an "overpowered STRATEGY" means a player who is also building, not
// a do-nothing town that dies on day 12 whatever its board says.
//
//   node tools/pricehours.mjs [--days 30] [--seeds 16] [--buy]
import { createSim } from "./simlib.mjs";

const arg = (k, d) => {
  const i = process.argv.indexOf("--" + k);
  return i >= 0 ? +process.argv[i + 1] : d;
};
const DAYS = arg("days", 30), SEEDS = arg("seeds", 16), BASE = arg("seedbase", 0);

const ARMS = {
  base: "",
  price: `setBizPrice("shack", PRICE_MAX);`,
  hours: `setBizHours("shack", 6 * 60, 24 * 60);`,
  both: `setBizPrice("shack", PRICE_MAX); setBizHours("shack", 6 * 60, 24 * 60);`,
};

const seeds = [];
for (let i = 0; i < SEEDS; i++) seeds.push(1337 + (BASE + i) * 991);

const BUY = process.argv.includes("--buy");
// the suite's own growth player, verbatim in shape: check hourly, keep a
// reserve of the cost plus tonight's whole bill plus a cushion
const BUY_SRC = `{
  for (const k of ["chef", "table"]) {
    const u = UPS[k];
    const bill = CRAB_WAGE * (crabs.length + (k === "chef" ? 1 : 0)) +
      Object.keys(BIZ).filter(b2 => bizUnlocked(b2) && bizOwner(b2) === "player")
        .reduce((s2, b2) => s2 + BIZ[b2].rent, 0);
    if (u.lvl < u.max && coins >= upCost(u) + bill + 30) tryBuy(k);
  }
}`;

function run(setup, seed) {
  const sim = createSim({ seed });
  if (setup) sim.G(setup);
  // re-assert every morning: the auto-manager and the rivalry both move these
  // settings, and the question is about a player who HOLDS them at the max
  let lastDay = 0, lastHour = -1;
  sim.runDays(DAYS, {
    onTick: (G) => {
      const d = G("day");
      if (setup && d !== lastDay) { lastDay = d; G(setup); }
      if (BUY) {
        const h = Math.floor(G("tmin") / 60);
        if (h >= 9 && h <= 19 && h !== lastHour) { lastHour = h; G(BUY_SRC); }
      }
    },
    tickEvery: BUY ? 20 : 200,
  });
  return JSON.parse(sim.G(`JSON.stringify({
    alive: !gameOver, day, lifetime: Math.round(lifetime), coins: Math.round(coins),
    rep: Math.round(rep),
    rage: (window._stats.tourRage || 0),
    serves: (window._stats.tourServes || 0),
    broke: (window._stats.visBroke || 0), shut: (window._stats.visShut || 0),
    full: (window._stats.visFull || 0), tables: (window._stats.visTables || 0),
    spend: Math.round(window._stats.visSpend || 0),
    unspent: Math.round(window._stats.visUnspent || 0),
    depart: (window._stats.visDepart || 0)
  })`));
}

const med = (a) => a.slice().sort((x, y) => x - y)[a.length >> 1];
console.log(`days ${DAYS}, seeds ${SEEDS}${BUY ? ", GROWTH player (buys chef+table)" : ", do-nothing town"}\n`);
const table = [];
for (const [name, setup] of Object.entries(ARMS)) {
  const rows = seeds.map(s => run(setup, s));
  const dead = rows.filter(r => !r.alive);
  const sum = (k) => rows.reduce((a, r) => a + r[k], 0);
  table.push({
    arm: name,
    survived: `${rows.filter(r => r.alive).length}/${rows.length}`,
    medianEvict: dead.length ? med(dead.map(r => r.day)) : "-",
    evictions: dead.map(r => r.day).sort((a, b) => a - b).join(","),
    lifetime: Math.round(sum("lifetime") / rows.length),
    servesPerDay: (sum("serves") / sum("day")).toFixed(1),
    ragePerDay: (sum("rage") / sum("day")).toFixed(2),
    spentShare: (sum("spend") / (sum("spend") + sum("unspent"))).toFixed(2),
    cantAfford: sum("broke"), lineFull: sum("full"), wasShut: sum("shut"),
  });
}
for (const r of table) console.log(JSON.stringify(r));
console.log("\nspentShare = of every dollar a visitor brought, the share the town got.");
console.log("cantAfford = think-ticks where a visitor wanted a thing and could not afford it.");
