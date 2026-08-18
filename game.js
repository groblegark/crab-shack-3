// CRAB SHACK 2 — a whole beachside town. Crabs have names, moods, shift
// schedules, and commutes: they walk, bike, ride the bus, or drive their
// beach buggy to work at the shack. Click a crab (or its portrait) to
// follow it around town.

"use strict";

const cv = document.getElementById("screen");
const ctx = cv.getContext("2d");
ctx.imageSmoothingEnabled = false;

// ---------------------------------------------------------------- geometry
const WORLD_W = 2192;
const SKY_H = 58, SHORE_Y = 86, FLOOR_Y = 166, PANEL_Y = 176;
// Portrait phones get a taller canvas (index.html sets SCREEN_H before ppu.js
// derives H). The world always keeps rows 0..PANEL_Y - every extra row goes to
// the panel below, so tabs and crew cards get real tap targets on a phone.
const TALL = H > 240;                                       // portrait-phone panel
const TAB_Y = PANEL_Y + 11, TAB_H = TALL ? 16 : 10;         // crew/shop/new/bill row
const ROW_Y = TAB_Y + TAB_H + 2;                            // panel content top
const TAB_TX = TAB_Y + ((TAB_H - 5) >> 1);                  // small-text baseline in that row
const CARD = TALL ? 34 : 24, CARD_STEP = TALL ? 37 : 27;    // crew card size + pitch
const BTN_H = TALL ? 26 : 18, BTN_STEP = TALL ? 30 : 20;    // shop button size + pitch
const MROW = TALL ? 8 : 6;                                  // menu-tab line pitch
const ROAD_Y0 = 90, ROAD_Y1 = 112, LOT_BOTTOM = 152;
const HOUSE_XS = [30, 100, 170, 240, 310, 380, 512, 2064, 2128];   // promenade row, one by the shelter, two beach cottages past the pier
const BUS_STOPS = [163, 660, 1180];
const BUS_TERMINUS = [100, 1240];
const STATION_BOTTOM = 152;
const QUEUE_DX = 13, QUEUE_MAX = 5, TOURIST_QUEUE_MAX = 4;   // tourists keep 4; the 5th slot is reserved for locals
const SHELTER_X = 444, MOVE_IN_COST = 35;
const JOB_BOARD_X = 716, NPC_WAGE = 20;   // the town labor market
const PIER_X0 = 1870, PIER_X1 = 2040, PIER_Y = 96;   // planks over the east break
const FISHING_SPOTS = [{ x: 1900, y: PIER_Y }, { x: 1956, y: PIER_Y }, { x: 2012, y: PIER_Y }];
// live-aboard boats moor off the seaward rail - a fisher's top housing rung
const BOAT_BERTHS = [{ x: 1862 }, { x: 1910 }, { x: 1958 }];
const BOAT_Y = 62;                          // hull rides the surf band above the pier
const BOAT_COST = 75, MOORING_FEE = 2;      // vs $35 house move-in + $10/night rent
const BOAT_NAMES = ["PEARL", "GULLWING", "SQUALL"];   // one per berth
function boatSpot(i) { return { x: BOAT_BERTHS[i].x + 10, y: 76 }; }   // on deck by the mast
function freeBerth() {
  const used = new Set(allCrabs().filter(k => k.p.boat != null).map(k => k.p.boat));
  for (let i = 0; i < BOAT_BERTHS.length; i++) if (!used.has(i)) return i;
  return -1;
}
let townCatch = 6;   // the day's landed fish, crate-side
let rep = 30;        // word of mouth (0-100): happy guests talk, rage-quits talk louder
const HOME_BOTTOM = 160;   // house/shelter interiors reach the floor

// ---------------------------------------------------------------- businesses
const BIZ = {
  shack: {
    name: "CRAB SHACK", short: "SHACK", sign: "CRAB SHACK 3", kind: "palapa", rent: 230, owner: "player",
    x0: 1220, x1: 1560, door: 1247,
    stations: {
      crate: [{ x: 1232, y: 136 }],
      board: [{ x: 1268, y: 136 }, { x: 1289, y: 136 }, { x: 1310, y: 136 }],
      grill: [{ x: 1380, y: 160 }, { x: 1402, y: 160 }, { x: 1424, y: 160 }],
      pass:  [{ x: 1452, y: 160 }],
    },
    tables: [
      { x: 1492, y: 158, dishes: 0, occupant: null },
      { x: 1532, y: 158, dishes: 0, occupant: null },
      { x: 1484, y: 134, dishes: 0, occupant: null },
      { x: 1524, y: 134, dishes: 0, occupant: null },
    ],
    source: "crate", out: "pass", queueX: 1566,
    park: 1130, rack: 1208,
    recipes: [
      { id: "taco", icon: "taco", pay: 17, raw: "fish_raw",
        steps: [["board", 3.0, "fish_cut"], ["grill", 4.0, "taco"]] },
      { id: "juice", icon: "juice", pay: 10, raw: "fruit",
        steps: [["board", 2.5, "juice"]] },
      { id: "fish", icon: "plate_fish", pay: 13, raw: "fish_raw",
        steps: [["grill", 5.0, "plate_fish"]] },
    ],
  },
  arcade: {
    name: "CLAWCADE", short: "CADE", sign: "THE CLAWCADE", kind: "shopfront", rent: 80, owner: "player",
    x0: 1620, x1: 1800, door: 1636,
    stations: {
      booth: [{ x: 1630, y: 136 }],
      claw:  [{ x: 1666, y: 136 }, { x: 1688, y: 136 }],
      skee:  [{ x: 1718, y: 160 }, { x: 1740, y: 160 }],
      prize: [{ x: 1772, y: 160 }],
    },
    source: "booth", out: "prize", queueX: 1804,
    park: 1590, rack: 1604,
    recipes: [
      { id: "clawgame", icon: "plush", pay: 13, raw: "token",
        steps: [["claw", 3.5, "plush"]] },
      { id: "skeerun", icon: "tickets", pay: 9, raw: "token",
        steps: [["skee", 2.8, "tickets"]] },
      { id: "gamenight", icon: "gold_plush", pay: 18, raw: "token",
        steps: [["skee", 2.5, "tickets"], ["claw", 3.0, "gold_plush"]] },
    ],
  },
  showers: {
    name: "SUDS SHOWERS", short: "SHWR", sign: "SUDS SHOWERS", kind: "shopfront", rent: 35, owner: "sudsy",
    x0: 940, x1: 1120, door: 954,
    stations: {
      taps:  [{ x: 946, y: 136 }],
      towel: [{ x: 972, y: 160 }],
    },
    stalls: [
      { x: 996, y: 136, occupant: null, dirty: false, cleaning: false },
      { x: 1026, y: 136, occupant: null, dirty: false, cleaning: false },
      { x: 1056, y: 136, occupant: null, dirty: false, cleaning: false },
    ],
    source: "taps", out: "towel", queueX: 1126,
    park: 896, rack: 924,
    recipes: [
      { id: "rinse", icon: "shine", pay: 5, raw: "soap", showerT: 5, deep: false,
        steps: [] },
      { id: "soak", icon: "suds", pay: 10, raw: "soap", showerT: 8, deep: true,
        steps: [] },
    ],
  },
};

// ---------------------------------------------------------------- owners
// The simulation layer: every business has an owner with their own till.
// The player's till IS `coins`; peer owners (NPCs) keep theirs here.
//
// MONEY FLOWS (the inflation audit - keep this current):
//   tourist sales/tips/table tips  -> business owner's till   (outside money IN)
//   ingredient costs               <- business owner's till   (money DESTROYED)
//   crew register purchases        crew wallet -> owner till  (recycles wages)
//   staff meals (retail)           crew wallet -> shack till; till pays ingredients
//   crew shower fees               crew wallet -> SUDSY till  (leaves player loop)
//   SUDSY's own meals              SUDSY wallet -> player till
//   wages (nightly)                player till -> crew wallets
//   crew house rent (nightly)      crew wallet -> DESTROYED (the town keeps it)
//   shack/biz rents (nightly)      owner till  -> DESTROYED (Mr. Pincherton)
// Crew wallets are fed only by wages; every sink above must keep the
// steady-state wallet bounded (see suite: "no wallet inflation").
const OWNERS = { sudsy: { id: "sudsy", name: "SUDSY", till: 200, credit: 0, darkT: 0 } };
const bizOwner = (b) => BIZ[b].owner || "player";
function ownerFunds(b) { return bizOwner(b) === "player" ? coins : OWNERS[bizOwner(b)].till; }
function creditBiz(b, amt, x, y) {
  if (bizOwner(b) === "player") { today.revenue += amt; earn(amt, x, y); }
  else {
    OWNERS[bizOwner(b)].till += amt;
    popText("+$" + Math.floor(amt), x, y, [150, 210, 255]);
    if (window._stats) window._stats.npcEarn = (window._stats.npcEarn || 0) + amt;
  }
}
function debitBiz(b, amt, x, y, label) {
  if (bizOwner(b) === "player") expense(amt, x, y, label);
  else OWNERS[bizOwner(b)].till -= amt;
}
const bizUnlocked = (b) => b === "shack" || bizOwner(b) !== "player"
  || UPS.arcade.lvl > 0;

// ---------------------------------------------------------------- line of credit
// Every business owner (player and NPC alike) carries a small compounding
// line of credit: a rent/bill shortfall at settlement DRAWS on the line
// instead of instant eviction, interest compounds nightly, and a minimum
// payment is auto-collected. Missing the minimum with the line exhausted =
// BANKRUPT: the game-over cliff for the player (this is the new eviction);
// NPC owners go dark for a couple nights instead.
// ======================= CREDIT CONFIG (play knobs) =======================
// Deliberately SHORT and SMALL on landing: limit ~ one night's shack rent,
// tuned so the eviction/bankruptcy curve sits within +1 day of the
// documented no-credit baseline (PLAN.md). Loosen stepwise, one knob at a
// time, with a fresh headless matrix per step - eviction-day is THE stat.
const CREDIT_CFG = {
  LIMIT: 120,          // max drawn balance (~half a night's shack rent)
  RATE: 0.25,          // nightly compounding interest on the drawn balance
  MIN_PAY: 80,         // minimum payment auto-collected nightly while drawn
  WARN_DAYS: 3,        // forecast horizon that fires the bankruptcy toast
  CHIP_DAYS: 5,        // forecast horizon that shows the warning chip
  NPC_DARK_NIGHTS: 2,  // NPC bankruptcy: shop shuttered this many nights
};
// ==========================================================================
let credit = { bal: 0, warned: false };   // the player's line (NPCs: OWNERS[o].credit)
let bankrupt = false;                     // gameOver flavor: the bank, not the landlord
// One owner's nightly credit settlement (pure math - shared by the player
// hook, the NPC hook and the forecaster): interest compounds on the carried
// balance, the night's bill draws on the line when funds are short, then the
// minimum payment auto-collects from what's left. ok:false = BANKRUPT
// (obligations missed with the line exhausted); funds are left untouched.
function settleCreditLine(bal, funds, due) {
  const r = { bal, funds, drew: 0, interest: 0, paid: 0, ok: true };
  if (r.bal > 0) { r.interest = Math.ceil(r.bal * CREDIT_CFG.RATE); r.bal += r.interest; }
  const minDue = r.bal > 0 ? Math.min(r.bal, CREDIT_CFG.MIN_PAY) : 0;
  if (r.funds < due) {
    const need = Math.ceil(due - r.funds);
    if (need <= CREDIT_CFG.LIMIT - r.bal) { r.bal += need; r.funds += need; r.drew = need; }
    else { r.ok = false; return r; }              // can't even draw the bill
  }
  r.funds -= due;
  if (minDue > 0) {
    if (r.funds >= minDue) { r.funds -= minDue; r.bal -= minDue; r.paid = minDue; }
    else if (CREDIT_CFG.LIMIT - r.bal < minDue) r.ok = false;   // missed + exhausted
    // else: payment missed but headroom remains - the balance just compounds
  }
  return r;
}
function creditDueTonight() {   // cash the bank will auto-collect at 20:00
  if (credit.bal <= 0) return 0;
  return Math.min(credit.bal + Math.ceil(credit.bal * CREDIT_CFG.RATE), CREDIT_CFG.MIN_PAY);
}
function bizDark(b) {   // an NPC shop shuttered by the bank after a bankruptcy
  const o = OWNERS[bizOwner(b)];
  return !!(o && (o.darkT || 0) > 0);
}
// Bankruptcy prediction (design rule: the player is warned IN ADVANCE).
// Seeded by the headless buyer's reserve math (cost + tonight's bill +
// cushion), rolled forward: take the recent net-per-day run rate from the
// day ledger and replay the upcoming settlements - wages + rents + debt
// service, drawing on the line exactly as settleCreditLine will. Returns
// how many settlements away the line fails (0 = the next one), or Infinity.
let bankHorizon = Infinity;
function forecastBankruptcy() {
  const log = window.dayLog || [];
  let sum = 0, n = 0, latest = null;
  for (let i = Math.max(1, log.length - 3); i < log.length; i++) {
    const prev = log[i - 1];
    if (prev && prev.after != null) { sum += latest = log[i].close - prev.after; n++; }
  }
  if (!n) return Infinity;               // no run rate on the books yet
  // pessimistic run rate: a sharp break (crew death, sickness spiral) should
  // move the forecast the day it shows, not after the average catches up
  const g = Math.min(sum / n, latest), due = nightlyDue();
  // income still to come before the next settlement (the town trades 8:00-20:00)
  const frac = lastRentDay === day ? 1 : Math.max(0, Math.min(1, (20 * 60 - tmin) / (12 * 60)));
  let c = coins, b = credit.bal;
  for (let d = 0; d < 10; d++) {
    c += g * (d === 0 ? frac : 1);
    const r = settleCreditLine(b, c, due);
    if (!r.ok) return d;
    b = r.bal; c = r.funds;
  }
  return Infinity;
}
function updateBankWarning() {
  bankHorizon = forecastBankruptcy();
  if (bankHorizon <= CREDIT_CFG.WARN_DAYS) {
    if (!credit.warned) {
      credit.warned = true;
      toast = { text: bankHorizon <= 0 ? "ON THIS COURSE: BANKRUPT TONIGHT!"
        : "ON THIS COURSE: BANKRUPT IN " + bankHorizon + " DAY" + (bankHorizon === 1 ? "" : "S"), t: 8 };
      sfx.angry();
      if (window._stats && window._stats.warnDay == null) window._stats.warnDay = day;
    }
    if (window._stats && window._stats.chipDay == null) window._stats.chipDay = day;
  } else if (bankHorizon > CREDIT_CFG.WARN_DAYS + 2) credit.warned = false;   // re-arm after real recovery
  if (bankHorizon <= CREDIT_CFG.CHIP_DAYS && window._stats && window._stats.chipDay == null) window._stats.chipDay = day;
}

// ---------------------------------------------------------------- clock
const TS = 4;                     // game minutes per real second
let day = 1, tmin = 7 * 60;      // start day 1, 7:00
function clockStr() {
  const h = (tmin / 60) | 0, m = tmin % 60 | 0;
  return (h < 10 ? "0" : "") + h + ":" + (m < 10 ? "0" : "") + m;
}
function shackOpen() { return tmin >= 8 * 60 && tmin < 20 * 60; }
function darkness() { // 0 = day, 1 = full night
  const t = tmin;
  if (t >= 5.5 * 60 && t < 7 * 60) return 1 - (t - 5.5 * 60) / 90;
  if (t >= 7 * 60 && t < 18.5 * 60) return 0;
  if (t >= 18.5 * 60 && t < 20.5 * 60) return (t - 18.5 * 60) / 120;
  return 1;
}

// ---------------------------------------------------------------- recipes
const INGREDIENT_COST = { fish_raw: 5, fruit: 3, token: 1, soap: 1 };
const FISH_LOCAL = 4, FISH_IMPORT = 7;   // fresh off the pier vs shipped in
// ---- T1 trade ledger: the town is a NODE. Imports tracked at fixed prices;
// only fish actually charges money today (it always did, via ingredientCost) -
// corn/water/power are tracked flows awaiting T2/T3. Bookkeeping ONLY.
const IMPORTS = {
  fish:  { name: "FISH",  unit: "EA",  price: FISH_IMPORT },
  corn:  { name: "CORN",  unit: "EA",  price: 3 },
  water: { name: "WATER", unit: "GAL", price: 1 },
  power: { name: "POWER", unit: "KWH", price: 2 },
};
let trade = { total: { fish: 0, corn: 0, water: 0, power: 0 },
  day: { fish: 0, corn: 0, water: 0, power: 0 }, spent: 0,
  landedDay: 0, landed: 0 };   // pier production - NOT an import
function tradeImport(kind, qty, dollars) {
  trade.total[kind] += qty; trade.day[kind] += qty;
  if (dollars) trade.spent += dollars;
}
function ingredientCost(raw) {
  if (raw === "fish_raw") return townCatch > 0 ? FISH_LOCAL : FISH_IMPORT;
  return INGREDIENT_COST[raw];
}
function consumeIngredient(raw) {
  if (raw !== "fish_raw") return;
  if (townCatch > 0) townCatch--;
  else tradeImport("fish", 1, FISH_IMPORT);   // shipped in - the $7 was already charged upstream
}
const ITEM_NAMES = {
  fish_raw: "FISH", fish_cut: "CUT FISH", fruit: "FRUIT",
  taco: "FISH TACO", juice: "JUICE", plate_fish: "GRILL FISH",
  token: "TOKENS", plush: "CLAW PLUSH", tickets: "TICKET RUN", gold_plush: "GOLD PLUSH",
  soap: "SOAP", suds: "DELUXE SOAK", shine: "QUICK RINSE", dirty_dishes: "DIRTY DISHES",
};

// ---------------------------------------------------------------- upgrades
const UPS = {
  chef:  { name: "HIRE CRAB", base: 60, mult: 2.0, max: 6, lvl: 2 },
  grill: { name: "GRILL+",    base: 120, mult: 1.6, max: 2, lvl: 0 },
  board: { name: "BOARD+",    base: 90, mult: 1.6, max: 2, lvl: 0 },
  table: { name: "TABLE+",    base: 60, mult: 1.5, max: 2, lvl: 0 },
  arcade:   { name: "ARCADE",   base: 650, mult: 1, max: 1, lvl: 0 },
  cadegear: { name: "CADE GEAR+", base: 180, mult: 1, max: 1, lvl: 0 },
};
for (const k in UPS) UPS[k].key = k;
function upCost(u) { return Math.ceil(u.base * Math.pow(u.mult, u.key === "chef" ? u.lvl - 2 : u.lvl)); }

function stationCap(bizKey, kind) {
  if (bizKey === "shack" && kind === "grill") return 1 + UPS.grill.lvl;
  if (bizKey === "shack" && kind === "board") return 1 + UPS.board.lvl;
  if (bizKey === "arcade" && (kind === "claw" || kind === "skee")) return 1 + UPS.cadegear.lvl;
  return 1;
}
// the shack opens with two tables; more are bought
function bizTables(key) {
  const t = BIZ[key].tables;
  if (!t) return null;
  return key === "shack" ? t.slice(0, 2 + UPS.table.lvl) : t;
}
const spawnEvery = () => 7.5 / (0.7 + 0.01 * rep);   // word of mouth drives foot traffic


// ---------------------------------------------------------------- state
let coins = 0, lifetime = 0, time = 0;
let crabs = [], customers = [], floaters = [];
let spawnT = 3, toast = null, soundOn = true, ffMode = 0;   // 0=1x, 1=2x, 2=3x, 3=6x
const FF_SPEED = [1, 2, 3, 6];
let camX = 1180, followIdx = -1, followNpc = null, followCust = null, tab = "crew";
let ffSleep = false, ffSleepDay = 0, ffChain = 0;   // the little sun: skip to morning
let lastRentDay = 0, gameOver = false, newConfirmT = 0;
let memorials = [];   // { x, name } - the town remembers
let today = newDayLog();
let report = null, reportT = 0, dossier = null, boardView = false;
let jobBoard = [], hireDay = 0;   // postings: {biz, wage, day}
function newDayLog() {
  return { served: 0, revenue: 0, rage: 0, sick: [], died: [], recovered: [],
    moved: [], byCrab: {}, repStart: 30, catchStart: 0 };
}
let screen = "title", hasSave = false, wiping = false;
function newGame() { wiping = true; localStorage.removeItem(SAVE_KEY); location.reload(); }
const CRAB_WAGE = 22, HOUSE_RENT = 10;
function rentAmount() { return BIZ.shack.rent; }   // shack lease (legacy name); due from night one
function totalRent() {   // the PLAYER's nightly property bill, due from night one
  return Object.keys(BIZ).filter(b => bizUnlocked(b) && bizOwner(b) === "player")
    .reduce((s, b) => s + BIZ[b].rent, 0);
}
function nightlyDue() { return totalRent() + CRAB_WAGE * crabs.length; }
const busy = {
  shack: { board: [false, false, false], grill: [false, false, false] },
  arcade: { claw: [false, false], skee: [false, false] },
  showers: {},
};
const bus = { x: 360, dir: 1, state: "drive", dwellT: 0, riders: [] };
let earnHist = [];

const CRAB_ARTS = CRAB_COLORS.map(c => crabArt(c[0], c[1]));
const TOURIST_ARTS = TOURIST_STYLES.map(touristArt);
const LANDLORD_ART = crabArt([255, 200, 80], [190, 140, 30]);
const HOUSES = CRAB_COLORS.map(c => houseArt(c[0]));
const BOATS = CRAB_COLORS.map(c => boatArt(c[0]));
const BUGGIES = CRAB_COLORS.map(c => buggyArt(c[0]));

function scale2(art) {
  const c = document.createElement("canvas");
  c.width = art.w * 2; c.height = art.h * 2;
  const x = c.getContext("2d");
  x.imageSmoothingEnabled = false;
  x.drawImage(art.cv, 0, 0, art.w * 2, art.h * 2);
  return { cv: c, fv: c, w: art.w * 2, h: art.h * 2 };
}
const HOUSES2 = HOUSES.map(scale2);
const SHELTER2 = scale2(SHELTER);
const NOTICE2 = scale2(NOTICE_BOARD);
const BUS2 = scale2(BUS);
const BUGGIES2 = BUGGIES.map(scale2);

let npcs = [];
function allCrabs() { return npcs.length ? crabs.concat(npcs) : crabs; }
function initNpcs() {
  const p = { name: "SUDSY", npc: true, owner: "sudsy", trait: "cheery", mode: "walk",
    acc: "showercap", color: CRAB_COLORS.length - 1, shift: "D", house: 0, homeless: true,
    wallet: 25, job: "showers", hunger: 0, dirt: 0, bored: 0, sandy: 0 };
  const c = newCrab(p);
  c.workBiz = "showers"; c.x = 1148; c.y = 158;
  const fishers = [
    { name: "SALTY", trait: "grumpy", acc: "cap", color: 4, x0: 1840, spot: 0 },
    { name: "DRIFT", trait: "dreamy", acc: "none", color: 2, x0: 2010, spot: 1 },
  ].map((f, i) => {
    const fp = { name: f.name, npc: true, fisher: true, trait: f.trait, mode: "walk",
      acc: f.acc, color: f.color, shift: "D", house: 0, homeless: true,
      wallet: 18, job: "fishing", hunger: 0.3, dirt: 0.2, bored: 0, sandy: 0.3 };
    const fc = newCrab(fp);
    fc.fishSpot = FISHING_SPOTS[f.spot];
    fc.x = f.x0; fc.y = 158;
    return fc;
  });
  npcs = [c].concat(fishers);
}
function homeX(c) { return homeSpot(c).x; }
function homeSpot(c) {
  if (c.p.boat != null) return boatSpot(c.p.boat);   // on deck, rain or shine
  if (c.p.homeless) {
    const cot = [6, 20, 34, 48][Math.max(0, allCrabs().indexOf(c)) % 4];
    return { x: SHELTER_X + cot, y: 155 };
  }
  const hx = HOUSE_XS[c.p.house];
  return darkness() > 0.7
    ? { x: hx + 8, y: 154 }    // asleep on the bed
    : { x: hx + 34, y: 156 };  // up and about in the front room
}
// once a commute drops them at the lot, home crabs wander in and settle
function updateHome(c, dt) {
  const s = homeSpot(c);
  setT(c, s.x, s.y);
  stepTo(c, s.x, crabMove(c) * 0.7, dt, s.y);
}

function newCrab(persona) {
  if (persona.wallet == null) persona.wallet = 10;
  if (persona.job == null) persona.job = "shack";
  // stale jobs from removed businesses (e.g. the old laundromat) clamp BEFORE
  // anything derefs BIZ[p.job] (jobDoor, updateSchedule, drawing): crew fall
  // back to the shack, townsfolk to the pier
  if (persona.job !== "fishing" && !BIZ[persona.job]) {
    persona.job = persona.npc ? "fishing" : "shack";
    delete persona.employer;
  }
  if (persona.hunger == null) persona.hunger = 0;
  if (persona.dirt == null) persona.dirt = 0;
  if (persona.bored == null) persona.bored = 0;
  if (persona.sick === undefined) persona.sick = null;
  if (persona.homeless === undefined) persona.homeless = !!persona.npc;   // old saves: crew were housed, npcs slept rough
  delete persona.homeX;   // pre-housing-market nook field
  if (persona.boat != null && BOAT_BERTHS[persona.boat] == null) persona.boat = null;
  if (!persona.homeless && persona.boat == null && (persona.house == null || HOUSE_XS[persona.house] == null)) persona.homeless = true;
  if (!persona.made) persona.made = {};   // dish id -> lifetime count
  if (persona.sandy == null) persona.sandy = 0;
  return {
    p: persona,
    x: homeX({ p: persona }), y: 160, tx: 0, ty: 160,
    flip: false, hidden: false, animT: Math.random() * 9,
    dayState: "home", cstate: "", target: 0, busFrom: -1, busTo: -1, workBiz: "shack",
    errandBiz: null, errandCust: null, errandCd: 0,
    duty: false, pendingOff: false, pauseT: 0,
    // kitchen fields
    kstate: "idle", cust: null, carrying: null, stepIdx: 0,
    workT: 0, workMax: 0, slot: -1, slotKind: null,
    quip: null, quipT: 8 + Math.random() * 15,
  };
}
function crabMove(c) {
  const t = TRAITS[c.p.trait];
  return 40 * t.move * (1 - 0.2 * Math.max(0, (c.p.bored || 0) - 0.5)) * (c.p.sick ? 0.5 : 1);
}
function crabWork(c) { return TRAITS[c.p.trait].work; }
// needs -> output: a well-kept crab works at 1.0. Let hunger or dirt slide
// and the crew's timed work slows (station prep, kitchen hustle, stall
// cleaning): hunger past 0.3 costs up to -18%, dirt past 0.6 up to -6%
// (floor 0.76). Tuned against the baseline eviction curve - see the
// "needs bite" scenario in tools/suite.mjs before touching these numbers.
// (Fishing casts deliberately NOT coupled: the whole town eats the catch,
// and any measurable drag there re-tilts the calibrated economy.)
function crabEff(c) {
  const hungry = Math.max(0, (c.p.hunger || 0) - 0.3) / 0.7;
  const grubby = Math.max(0, (c.p.dirt || 0) - 0.6) / 0.4;
  return 1 - 0.18 * Math.min(1, hungry) - 0.06 * Math.min(1, grubby);
}

// ---------------------------------------------------------------- sound (from CS1)
const PLAYLIST = [
  { src: "music/pixel-wave-waltz.mp3", name: "PIXEL WAVE WALTZ" },
  { src: "music/regalia-of-the-surf.mp3", name: "REGALIA OF THE SURF" },
  { src: "music/regalia-waltz.mp3", name: "REGALIA WALTZ" },
  { src: "music/butter-pow.mp3", name: "BUTTER POW" },
  { src: "music/carnival-of-the-glitch.mp3", name: "CARNIVAL OF THE GLITCH" },
];
let musicOn = true, music = null, muted = false;
function toggleMute() {
  muted = !muted;
  if (muted) { if (music) music.pause(); }
  else if (musicOn) { if (music) music.play().catch(() => {}); else startMusic(); }
}
let trackIdx = (Math.random() * PLAYLIST.length) | 0;
function playTrack(i) {
  if (music) { music.pause(); music = null; }
  trackIdx = ((i % PLAYLIST.length) + PLAYLIST.length) % PLAYLIST.length;
  const t = PLAYLIST[trackIdx];
  music = new Audio(t.src);
  music.volume = 0.55;
  music.addEventListener("ended", () => { music = null; if (musicOn) playTrack(trackIdx + 1); });
  music.play().then(() => { if (!toast) toast = { text: "NOW PLAYING: " + t.name, t: 4 }; })   // don't stomp a live toast (e.g. the migration refund)
    .catch(() => { music = null; });
}
function startMusic() { if (!music && musicOn && !muted) playTrack(trackIdx); }
function toggleMusic() {
  musicOn = !musicOn;
  if (!musicOn && music) { music.pause(); music = null; } else if (musicOn) startMusic();
}
let AC = null;
function beep(freq, dur, type, vol, when) {
  if (!soundOn || muted) return;
  if (!AC) try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
  const t = AC.currentTime + (when || 0);
  const o = AC.createOscillator(), g = AC.createGain();
  o.type = type || "square"; o.frequency.value = freq;
  g.gain.setValueAtTime(vol || 0.04, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(AC.destination); o.start(t); o.stop(t + dur);
}
const sfx = {
  coin: () => { beep(880, .08); beep(1320, .12, "square", .04, .07); },
  buy: () => { beep(520, .06); beep(700, .08, "square", .04, .05); },
  angry: () => { beep(220, .15, "sawtooth", .03); beep(160, .2, "sawtooth", .03, .12); },
  ding: () => beep(1560, .1, "triangle", .05),
  bus: () => beep(300, .2, "triangle", .04),
  // ambient color, kept very quiet
  gull: () => { beep(1760, .12, "triangle", .02); beep(1320, .16, "triangle", .018, .12); },
  splash: () => { beep(520, .05, "sine", .03); beep(300, .09, "sine", .025, .05); },
};

// ---------------------------------------------------------------- economy
function fmt(n) {
  n = Math.floor(n);
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e4) return (n / 1e3).toFixed(1) + "K";
  return String(n);
}
function popText(txt, x, y, color) {
  floaters.push({ x, y, t: 1.6, text: txt, color: color || [255, 255, 255] });
}
function earn(amt, x, y) {
  coins += amt; lifetime += amt;
  earnHist.push({ t: time, amt });
  popText("+$" + Math.floor(amt), x, y, [255, 230, 120]);
  sfx.coin();
}
function expense(amt, x, y, label) {
  coins -= amt;
  earnHist.push({ t: time, amt: -amt });   // income rate is net
  popText("-$" + amt + (label ? " " + label : ""), x, y, [255, 120, 120]);
}
function incomeRate() {
  while (earnHist.length && earnHist[0].t < time - 60) earnHist.shift();
  if (!earnHist.length) return 0;
  return earnHist.reduce((s, e) => s + e.amt, 0) / Math.max(10, time - earnHist[0].t);
}

// ---------------------------------------------------------------- save
const SAVE_KEY = "crabshack3_v1";
const FRESH = location.search.includes("fresh");
const TURBO = Math.max(1, parseInt((location.search.match(/turbo=(\d+)/) || [0, 1])[1]) || 1);
function save() {
  if (FRESH || wiping) return;
  const lv = {}; for (const k in UPS) lv[k] = UPS[k].lvl;
  localStorage.setItem(SAVE_KEY, JSON.stringify({
    coins, lifetime, lv, day, tmin, lastRentDay, gameOver, memorials, rep, townCatch, rate: incomeRate(), t: Date.now(),
    bankrupt, credit: { bal: Math.round(credit.bal), warned: credit.warned },
    dayLog: (window.dayLog || []).slice(-6),   // keeps the forecaster warm across reloads
    personas: crabs.map(c => c.p),
    npc: { tills: { sudsy: OWNERS.sudsy.till },
      credit: { sudsy: { bal: OWNERS.sudsy.credit || 0, darkT: OWNERS.sudsy.darkT || 0 } },
      personas: npcs.map(c => c.p) },
    board: jobBoard, hireDay, trade, sudsRefund: sudsRefunded,
  }));
}
let sudsRefunded = false;   // laundromat-removal migration: refund paid out (persisted)
function load() {
  if (FRESH) return false;
  let s = null;
  try { s = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) {}
  if (!s) return false;
  if (!Array.isArray(s.personas) || !s.personas.length) return false;   // reject before touching state
  coins = s.coins || 0; lifetime = s.lifetime || 0;
  day = s.day || 1; tmin = s.tmin != null ? s.tmin : 7 * 60;
  lastRentDay = s.lastRentDay || 0;
  if (s.gameOver) { gameOver = true; screen = "play"; }
  bankrupt = !!s.bankrupt;
  if (s.credit) { credit.bal = s.credit.bal || 0; credit.warned = !!s.credit.warned; }   // old saves: zero balance
  if (Array.isArray(s.dayLog)) window.dayLog = s.dayLog;
  memorials = Array.isArray(s.memorials) ? s.memorials : [];
  if (typeof s.rep === "number") rep = s.rep;
  if (typeof s.townCatch === "number") townCatch = s.townCatch;
  for (const k in UPS) if (s.lv && s.lv[k] != null) UPS[k].lvl = s.lv[k];
  // laundromat-removal migration: SUDS N BUBBLES closed. Stale lv keys
  // (cleaners/sudsgear) are simply ignored above; an owned laundromat refunds
  // its purchase price ONCE (flag persists so a reload can't re-pay it).
  sudsRefunded = !!s.sudsRefund;
  if (!sudsRefunded && s.lv && s.lv.cleaners > 0) {
    let refund = 400;                            // the old CLEANERS rung
    if (s.lv.sudsgear > 0) refund += 150;        // and its SUDS GEAR+ upgrade
    coins += refund;
    toast = { text: "LAUNDROMAT CLOSED - SHOWERS TOOK OVER. +$" + refund, t: 9 };
    sudsRefunded = true;
  }
  crabs = s.personas.map((p2, i) => {
    const base = makeCrabPersona(i);
    return newCrab(Object.assign(base, p2));   // missing fields fall back to sane defaults
  });
  if (s.npc) {
    if (s.npc.tills && s.npc.tills.sudsy != null) OWNERS.sudsy.till = s.npc.tills.sudsy;
    if (s.npc.credit && s.npc.credit.sudsy) {
      OWNERS.sudsy.credit = s.npc.credit.sudsy.bal || 0;
      OWNERS.sudsy.darkT = s.npc.credit.sudsy.darkT || 0;
    }
    // every townsfolk persona comes back (wallet, homeless, house), matched by
    // name; unmatched ones are drifters who moved to town mid-save - rebuild them
    if (Array.isArray(s.npc.personas)) for (const sp of s.npc.personas) {
      if (!sp) continue;
      const n = npcs.find(k => k.p.name === sp.name);
      if (n) {
        Object.assign(n.p, sp);
        if (n.p.job !== "fishing" && !BIZ[n.p.job]) { n.p.job = "fishing"; n.p.employer = null; }   // removed-business jobs: back to the pier
        delete n.p.homeX;   // pre-housing-market nook field
        if (n.p.boat != null && BOAT_BERTHS[n.p.boat] == null) n.p.boat = null;
        if (!n.p.homeless && n.p.boat == null && (n.p.house == null || HOUSE_XS[n.p.house] == null)) n.p.homeless = true;
        if (n.p.boat != null) n.fishSpot = boatSpot(n.p.boat);   // fish from their own deck
      } else {
        const c = newCrab(Object.assign({ npc: true }, sp));
        if (c.p.fisher) c.fishSpot = c.p.boat != null ? boatSpot(c.p.boat)
          : FISHING_SPOTS[npcs.filter(k => k.p.fisher).length % FISHING_SPOTS.length];
        c.x = homeX(c); npcs.push(c);
      }
    }
  }
  jobBoard = Array.isArray(s.board) ? s.board : [];
  hireDay = s.hireDay || 0;
  if (s.trade && s.trade.total) trade = { total: Object.assign({ fish: 0, corn: 0, water: 0, power: 0 }, s.trade.total),
    day: Object.assign({ fish: 0, corn: 0, water: 0, power: 0 }, s.trade.day), spent: s.trade.spent || 0,
    landed: s.trade.landed || 0, landedDay: s.trade.landedDay || 0 };
  const away = (Date.now() - (s.t || Date.now())) / 1000;
  if (away > 60 && s.rate > 0) {
    const gain = Math.floor(s.rate * Math.min(away, 8 * 3600) * 0.5);
    if (gain > 0) { coins += gain; lifetime += gain; toast = { text: "WELCOME BACK! THE CRABS MADE $" + fmt(gain), t: 7 }; }
  }
  return true;
}

// ---------------------------------------------------------------- quips
function quipContext(c) {
  if (c.dayState === "working") return "work";
  if (c.dayState === "home") return "home";
  return "commute";
}
function maybeQuip(c, dt) {
  if (c.quip) { c.quip.t -= dt; if (c.quip.t <= 0) c.quip = null; }
  c.quipT -= dt;
  if (c.quipT <= 0 && !c.hidden) {
    const isNight = darkness() > 0.7 && c.dayState === "home";
    let lines = isNight ? ["ZZZ..."] : TRAITS[c.p.trait].quips[quipContext(c)];
    if (c.p.homeless && quipContext(c) === "home" && !isNight)
      lines = ["SAVING FOR A PLACE", "SHELTER SOUP AGAIN", "I'LL BOUNCE BACK"];
    c.quip = { text: lines[(Math.random() * lines.length) | 0], t: 2.6 };
    c.quipT = 14 + Math.random() * 18;
  }
}

// ---------------------------------------------------------------- commute
function nearestStop(x) {
  let best = 0, bd = 1e9;
  for (let i = 0; i < BUS_STOPS.length; i++) {
    const d = Math.abs(x - BUS_STOPS[i]);
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}
function jobDoor(c) { return c.p.job === "fishing" ? (c.fishSpot ? c.fishSpot.x : PIER_X0 + 20) : BIZ[c.p.job].door; }
function commuteGmin(c) {
  const dist = Math.abs(jobDoor(c) - homeX(c));
  const m = c.p.mode;
  if (m === "bus") return 100;                       // walk + wait + ride, rough
  return dist / (MODES[m].speed * TRAITS[c.p.trait].move) * TS + 12;
}
function leaveGmin(c) {
  const late = TRAITS[c.p.trait].lateMin || 0;
  return SHIFTS[c.p.shift].start - commuteGmin(c) - 20 + late;
}

const FLOOR_MIN = 126, FLOOR_MAX = 168;
function stepTo(c, tx, speed, dt, ty) {
  if (ty == null) ty = c.ty != null ? c.ty : 160;
  const dx = tx - c.x, dy = ty - c.y;
  const d = Math.hypot(dx, dy);
  if (d <= 2.2) { c.x = tx; c.y = ty; return true; }
  if (Math.abs(dx) > 1) c.flip = dx < 0;
  const step = Math.min(speed * dt, d);
  c.x += dx / d * step;
  c.y += dy / d * step;
  c._stepped = true;   // moved this frame (anchors are crabs that did not)
  c._mx = tx;          // actual motion target this frame (collision uses this, not c.tx)
  return false;
}
// soft-radius separation + station bodies: nobody stands inside anybody
function collide(dt) {
  const bodies = [];
  for (const c of allCrabs()) if (!c.hidden && c.cstate !== "drive" && !c.errandCust) bodies.push(c);
  for (let i = 0; i < bodies.length; i++)
    for (let j = i + 1; j < bodies.length; j++) {
      const a = bodies[i], b = bodies[j];
      const dx = b.x - a.x, dy = (b.y - a.y) * 1.8;   // wide sprites: ellipse
      const d = Math.hypot(dx, dy);
      if (d < 12 && d > 0.01) {
        const still = (c) => !c._stepped;
        const aStill = still(a), bStill = still(b);
        const push = Math.min((12 - d) / 2 * Math.min(1, dt * 12), 4);
        const ux = dx / d, uy = dy / d / 1.8;
        if (aStill && !bStill) { b.x += ux * push * 2; b.y = clampY(b.y + uy * push * 2); }
        else if (bStill && !aStill) { a.x -= ux * push * 2; a.y = clampY(a.y - uy * push * 2); }
        else if (Math.sign((a._mx != null ? a._mx : a.x) - a.x) !== Math.sign((b._mx != null ? b._mx : b.x) - b.x) && Math.abs(dx) > 2) {
          // head-on: step around each other, not into each other
          a.y = clampY(Math.max(FLOOR_MIN, a.y - push * 2));
          b.y = clampY(b.y + push * 2);
          if (b.y >= FLOOR_MAX - 0.5) b.y = clampY(b.y - push * 4);   // no room below: b passes above instead
        }
        else {
          a.x -= ux * push; a.y = clampY(a.y - uy * push);
          b.x += ux * push; b.y = clampY(b.y + uy * push);
        }
      }
    }
  // solid tables: nobody walks through the picnic area
  for (const bizKey of Object.keys(BIZ)) {
    if (!bizUnlocked(bizKey)) continue;
    const furniture = (bizTables(bizKey) || []).concat(BIZ[bizKey].stalls || []);
    for (const t of furniture) {
      for (const c of bodies) {
        if (Math.abs((c.tx || 0) - (t.x + 2)) < 8 && Math.abs((c.ty || 0) - (t.y + 12)) < 8) continue;
        const dx = c.x + 8 - (t.x + 10), dy = c.y - t.y;
        if (Math.abs(dx) < 14 && dy > -9 && dy < 6) {
          const push = Math.min(95 * dt, 5);
          if (Math.abs(dx) > Math.abs(dy) * 1.6) c.x += (dx > 0 ? 1 : -1) * push;
          else c.y = clampY(c.y + (dy > -2 ? 1 : -1) * push);
        }
      }
    }
  }
  // solid stations: walk around, not through (except the crab working that spot)
  for (const bizKey of Object.keys(BIZ)) {
    if (!bizUnlocked(bizKey)) continue;
    const sts = BIZ[bizKey].stations;
    for (const kind of Object.keys(sts))
      for (let i = 0; i < sts[kind].length; i++) {
        const st = sts[kind][i];
        for (const c of bodies) {
          // a crab headed for (or working at) this exact spot may stand there
          if (Math.abs((c.tx || 0) - (st.x + 2)) < 6 && Math.abs((c.ty || 0) - (st.y + 7)) < 6) continue;
          const cx = st.x + 10;
          const dx = c.x + 8 - cx, dy = c.y - st.y;
          if (Math.abs(dx) < 13 && dy > -10 && dy < 6) {
            // deflect briskly (faster than walk speed, so nobody grinds on a counter)
            const push = Math.min(95 * dt, 5);   // stable at fast-forward
            if (Math.abs(dx) > Math.abs(dy) * 1.6) c.x += (dx > 0 ? 1 : -1) * push;
            else c.y = clampY(c.y + (dy > -2 ? 1 : -1) * push);
          }
        }
      }
  }
}
function clampY(y) { return Math.max(FLOOR_MIN, Math.min(FLOOR_MAX, y)); }

function startCommute(c, toWork) {
  c.dayState = toWork ? "toWork" : "toHome";
  const m = c.p.mode;
  const dest = toWork ? jobDoor(c) : homeX(c);
  if (m === "bus") {
    c.busFrom = nearestStop(c.x); c.busTo = nearestStop(dest);
    c.cstate = c.busFrom === c.busTo ? "travel" : "walkToStop";
  }
  else if (m === "walk" || c.p.job === "fishing") c.cstate = "travel";   // no bike rack on the pier
  else c.cstate = toWork ? "drive" : "walkToVehicle";  // bike/buggy parked at work
}

function updateCommute(c, dt) {
  const toWork = c.dayState === "toWork";
  const dest = toWork ? jobDoor(c) : homeX(c);
  const m = c.p.mode, tr = TRAITS[c.p.trait];
  const wspd = crabMove(c), vspd = MODES[m].speed * tr.move;

  if (tr.pauses && c.pauseT <= 0 && Math.random() < dt * 0.06) c.pauseT = 1.3;
  if (c.pauseT > 0) { c.pauseT -= dt; return; }

  if (c.cstate === "travel") {           // walking the whole way
    if (stepTo(c, dest, wspd, dt, 167)) arriveCommute(c, toWork);
  } else if (c.cstate === "drive") {     // bike/buggy: ride to park spot, walk rest
    const b = BIZ[c.p.job];
    const park = toWork ? (m === "buggy" ? b.park + (c.p.house % 6) * 18 : b.rack + (c.p.house % 6) * 7) : homeX(c);
    if (stepTo(c, park, vspd, dt, 150)) {
      if (toWork) { c.cstate = "walkFromPark"; }
      else arriveCommute(c, false);
    }
  } else if (c.cstate === "walkFromPark") {
    if (stepTo(c, dest, wspd, dt, 167)) arriveCommute(c, true);
  } else if (c.cstate === "walkToVehicle") {   // heading home: fetch parked ride
    const b = BIZ[c.p.job];
    const park = m === "buggy" ? b.park + (c.p.house % 6) * 18 : b.rack + (c.p.house % 6) * 7;
    if (stepTo(c, park, wspd, dt, 150)) c.cstate = "drive";
  } else if (c.cstate === "walkToStop") {
    setT(c, BUS_STOPS[c.busFrom], 148);
    if (routedStep(c, wspd, dt)) c.cstate = "waitBus";
  } else if (c.cstate === "waitBus") {
    if (bus.state === "dwell" && Math.abs(bus.x + BUS2.w / 2 - BUS_STOPS[c.busFrom]) < 6) {
      c.hidden = true; c.cstate = "onBus"; sfx.bus();
    }
  } else if (c.cstate === "onBus") {
    c.x = bus.x + BUS2.w / 2;
    if (bus.state === "dwell" && Math.abs(bus.x + BUS2.w / 2 - BUS_STOPS[c.busTo]) < 6) {
      c.hidden = false; c.x = BUS_STOPS[c.busTo]; c.cstate = "walkOff";
    }
  } else if (c.cstate === "walkOff") {
    if (stepTo(c, dest, wspd, dt, 167)) arriveCommute(c, toWork);
  }
}

function arriveCommute(c, atWork) {
  if (atWork) {
    c.dayState = "working"; c.duty = true; c.kstate = "idle"; c.workBiz = c.p.job;
    if (c.p.job === "fishing" && c.fishSpot) { c.x = c.fishSpot.x; c.y = c.fishSpot.y; c.castT = 3 + Math.random() * 6; }
  }
  else { c.dayState = "home"; }
}

function updateBus(dt) {
  if (bus.state === "dwell") {
    bus.dwellT -= dt;
    if (bus.dwellT <= 0) { bus.state = "drive"; bus.passed = false; }
    return;
  }
  const prevCx = bus.x + BUS2.w / 2;
  bus.x += bus.dir * 100 * dt;
  const cx = bus.x + BUS2.w / 2;
  for (const s of BUS_STOPS) {
    const crossed = (prevCx - s) * (cx - s) <= 0;   // stop lies within this frame's travel
    if (crossed && bus.lastStop !== s) {
      bus.state = "dwell"; bus.dwellT = 2.0; bus.lastStop = s;
      bus.x = s - BUS2.w / 2;
      return;
    }
  }
  if (cx > BUS_TERMINUS[1] + 40) { bus.dir = -1; bus.lastStop = -1; }
  if (cx < BUS_TERMINUS[0] - 40) { bus.dir = 1; bus.lastStop = -1; }
}

// ---------------------------------------------------------------- job board
// Owners post when the till supports a second claw (or the shop went dark);
// fishers take steady wages over pier luck; a posting nobody wants for a full
// day reaches a drifter, who rolls in on the morning bus.
function runJobBoard() {
  for (const b of Object.keys(BIZ)) {
    if (bizOwner(b) === "player") continue;
    const o = OWNERS[bizOwner(b)];
    if (!o || (o.darkT || 0) > 0 || jobBoard.some(j => j.biz === b)) continue;
    const staff = allCrabs().filter(k => k.p.job === b && !k.p.sick).length;
    if ((o.till >= 260 && staff < 2) || (staff === 0 && o.till >= NPC_WAGE * 2))
      jobBoard.push({ biz: b, wage: NPC_WAGE, day });
  }
  for (const j of jobBoard.slice()) {
    const cands = npcs.filter(k => k.p.fisher && k.p.job === "fishing" && !k.p.sick && !k.p.employer);
    let hire = null;
    if (cands.length) {
      cands.sort((a, b2) => a.p.wallet - b2.p.wallet);   // the broke sign up first
      hire = cands[0];
    } else if (j.day < day && npcs.length < 8) {
      hire = spawnDrifter();
    }
    if (hire) {
      hire.p.job = j.biz; hire.p.employer = bizOwner(j.biz);
      // clock out of the old life cleanly - updateSchedule will commute them to the new job
      abortErrand(hire);
      hire.duty = false; hire.pendingOff = false; hire.kstate = "idle";
      hire.carrying = null; hire.dayState = "home"; hire.cstate = ""; hire.workBiz = j.biz;
      jobBoard.splice(jobBoard.indexOf(j), 1);
      today.moved.push(hire.p.name + " HIRED AT " + BIZ[j.biz].name);
      toast = { text: hire.p.name + " TOOK THE " + BIZ[j.biz].name + " JOB", t: 5 };
      popText("HIRED!", hire.x - 6, FLOOR_Y - 34, [140, 255, 160]);
      sfx.ding();
    }
  }
}
function spawnDrifter() {
  const p2 = makeCrabPersona((Math.random() * 12) | 0);
  const used = new Set(allCrabs().map(k => k.p.name));
  if (used.has(p2.name)) {
    const free = CRAB_NAMES.find(n => !used.has(n));
    if (free) p2.name = free;
  }
  Object.assign(p2, { npc: true, fisher: true, homeless: true, wallet: 12, job: "fishing", shift: "D", mode: "walk" });
  const c = newCrab(p2);
  c.fishSpot = FISHING_SPOTS[npcs.filter(k => k.p.fisher).length % FISHING_SPOTS.length];
  c.x = BUS_STOPS[0]; c.y = 158;   // stepped off the morning bus with one bag
  npcs.push(c);
  today.moved.push(c.p.name + " NEW IN TOWN");
  toast = { text: c.p.name + " GOT OFF THE BUS - NEW IN TOWN", t: 5 };
  return c;
}

// ---------------------------------------------------------------- day schedule
function updateSchedule(c, dt) {
  const sh = SHIFTS[c.p.shift];
  if (c.p.job !== "fishing" && !bizUnlocked(c.p.job)) c.p.job = "shack";
  if (!c.p.npc && c.p.job !== "fishing" && bizOwner(c.p.job) !== "player") c.p.job = "shack";   // crew can't staff NPC shops
  if (c.dayState === "home" && tmin >= leaveGmin(c) && tmin < sh.end - 30 && !c.p.sick) {
    startCommute(c, true);
  }
  if (c.dayState === "working" && tmin >= sh.end) c.pendingOff = true;
  if (c.dayState === "working" && c.pendingOff && c.kstate === "idle") {
    // last call: stick around while anyone's still waiting in the grace window
    const lingering = tmin < sh.end + 45 &&
      customers.some(k => k.biz === c.workBiz && k.state === "waiting" && !k.served);
    if (lingering) return;
    c.duty = false; c.pendingOff = false;
    if (c.carrying) c.carrying = null;
    c.p.hunger = Math.min(1, (c.p.hunger || 0) + 0.25);  // a shift works up an appetite
    c.p.dirt = Math.min(1, (c.p.dirt || 0) + 0.25);      // and grubbies up the shell
    c.p.bored = Math.min(1, (c.p.bored || 0) + 0.2);     // all work and no play...
    c.p.sandy = Math.min(1, (c.p.sandy || 0) + 0.15);    // beach work is gritty work
    // grab dinner on the way home instead of trekking back later
    const e = !c.p.sick && pickErrand(c);
    if (e && !e.selfCook) startErrand(c, e);
    else startCommute(c, false);
  }
  // owner-operators top their pocket up from the till
  if (c.p.npc) {
    const o = OWNERS[c.p.owner];
    const need = c.p.homeless ? 60 : 15;   // save up for a place of her own
    if (o && c.p.wallet < need && o.till >= 90) { o.till -= 30; c.p.wallet += 30; }
    else if (o && c.p.wallet < 15 && o.till >= 30) { o.till -= 30; c.p.wallet += 30; }
  }
  // off-duty errands, while town is open and it's not almost shift time
  if (c.errandCd > 0) c.errandCd -= dt;
  const errandWindow = tmin < leaveGmin(c) - 30 || tmin >= sh.end;   // before leaving, or after shift
  const townAwake = shackOpen() || (tmin >= 20 * 60 && tmin < 23 * 60) || (tmin >= 5.5 * 60 && tmin < 8 * 60);
  if (c.dayState === "home" && townAwake && c.errandCd <= 0 && errandWindow) {
    const e = pickErrand(c);
    if (e && e.selfCook) startSelfCook(c, e);
    else if (e && !e.selfCook && shackOpen()) startErrand(c, e);
    else c.errandCd = 2;
  }
}

// ---------------------------------------------------------------- errands
function bizStaffed(b) { return bizUnlocked(b) && !bizDark(b) && allCrabs().some(k => k.duty && !k.pendingOff && k.workBiz === b); }
function pickErrand(c) {
  const staffed = bizStaffed;
  // restaurant staff privilege: cook your own meal when the kitchen is unstaffed.
  // Charged at RETAIL, same as the register.
  // TODO: business settings - staff-meal pricing (retail/at-cost/free) becomes a per-business setting
  if ((c.p.hunger || 0) >= 0.5 && !staffed("shack") && c.p.job === "shack" && !c.p.npc) {
    const affordable = BIZ.shack.recipes.filter(r => c.p.wallet >= r.pay + 2);
    if (affordable.length) {
      affordable.sort((a, b) => a.pay - b.pay);
      const r = c.p.wallet > 40 ? affordable[(Math.random() * affordable.length) | 0] : affordable[0];
      return { selfCook: true, recipe: r };
    }
  }
  if ((c.p.hunger || 0) >= 0.5 && staffed("shack")) {
    const affordable = BIZ.shack.recipes.filter(r => c.p.wallet >= Math.ceil(r.pay * 1.25) + 2);
    if (affordable.length) {
      // treat yourself when flush, eat cheap when broke
      affordable.sort((a, b) => a.pay - b.pay);
      const r = c.p.wallet > 40 ? affordable[(Math.random() * affordable.length) | 0] : affordable[0];
      return { biz: "shack", recipe: r, need: "food" };
    }
  }
  // dirt is serviced at the showers too (the laundromat is gone): a grubby
  // crab heads for the taps at the same 0.66 threshold that fed the sickness
  // "cared" check - a shower takes dirt down 0.5 (0.7 deluxe), well below it
  const needsBath = (c.p.sandy || 0) >= 0.6 || (c.p.dirt || 0) >= 0.66
    || (c.p.sick && (c.p.dirt || 0) >= 0.4);   // the sick drag themselves to the taps - staying clean is the cure
  if (needsBath && staffed("showers") && c.workBiz !== "showers") {
    const r = BIZ.showers.recipes[c.p.wallet > 40 ? 1 : 0];   // deluxe soak when flush
    if (c.p.wallet >= Math.ceil(r.pay * 1.25) + 2) return { biz: "showers", recipe: r, need: "spa" };
  }
  if (c.p.sick) return null;   // bed rest otherwise: no arcade nights while ill
  if ((c.p.bored || 0) >= 0.6 && staffed("arcade")) {
    const r = BIZ.arcade.recipes[c.p.wallet > 40 ? 2 : 1];   // splurge on game night when flush
    if (c.p.wallet >= Math.ceil(r.pay * 1.25) + 2) return { biz: "arcade", recipe: r, need: "fun" };
  }
  return null;
}
function startSelfCook(c, e) {
  c.dayState = "selfCook"; c.cookStep = 0; c.cookRecipe = e.recipe;
  const s0 = stationSpot("shack", "crate", 0); setT(c, s0.x, s0.y);
}
function updateSelfCook(c, dt) {
  if (c.cookStep === 0) {                      // to the crate: ring yourself up first
    if (routedStep(c, crabMove(c), dt)) {
      const r = c.cookRecipe;
      c.p.wallet = Math.max(0, c.p.wallet - r.pay);
      creditBiz("shack", r.pay, c.x, FLOOR_Y - 40);          // retail into the till
      debitBiz("shack", ingredientCost(r.raw), c.x, FLOOR_Y - 34);  // till buys the ingredients
      consumeIngredient(r.raw);
      if (window._stats) {
        window._stats.staffMealPaid = (window._stats.staffMealPaid || 0) + r.pay;
        window._stats.staffMealCost = (window._stats.staffMealCost || 0) + INGREDIENT_COST[r.raw];
        window._stats.lastStaffMeal = { id: r.id, pay: r.pay, cost: INGREDIENT_COST[r.raw] };
      }
      c.carrying = r.raw; c.cookStep = 1; c.workT = 0.6;
    }
  } else if (c.cookStep === 1) {               // grab
    c.workT -= dt;
    if (c.workT <= 0) {
      const g = tryAcquire("shack", "grill");
      if (g >= 0) {
        c.slotKind = "grill"; c.slot = g;
        const sp = stationSpot("shack", "grill", g); setT(c, sp.x, sp.y);
        c.workBiz = "shack"; c.cookStep = 2;
      }
    }
  } else if (c.cookStep === 2) {               // to the grill
    if (routedStep(c, crabMove(c), dt)) { c.workT = 3; c.cookStep = 3; }
  } else if (c.cookStep === 3) {               // cook + eat
    c.workT -= dt;
    if (c.workT <= 0) {
      release(c); c.carrying = null;
      c.p.hunger = 0; c.cookStep = 0;
      popText("STAFF MEAL!", c.x - 8, FLOOR_Y - 30, [140, 255, 160]);
      if (window._stats) window._stats.staffMeals = (window._stats.staffMeals || 0) + 1;
      c.quip = { text: "CHEF'S PRIVILEGE", t: 2.4 };
      c.errandCd = 25; c.dayState = "home";
      startCommute(c, false);
    }
  }
}
function startErrand(c, e) {
  c.dayState = "toErrand"; c.errandBiz = e.biz; c.errand = e;
  setT(c, BIZ[e.biz].queueX + 4, 166);
}
function updateErrand(c, dt) {
  if (c.dayState === "toErrand") {
    if (routedStep(c, crabMove(c), dt)) {
      // the 5-slot line is a hard cap for locals too: full line, come back later
      const q = customers.filter(k => k.biz === c.errandBiz && (k.state === "waiting" || k.state === "arriving")).length;
      if (q >= QUEUE_MAX) {
        c.quip = { text: "LINE'S TOO LONG", t: 2.4 };
        c.errandCd = 12; c.dayState = "home";
        startCommute(c, false);
        return;
      }
      const cust = { biz: c.errandBiz, recipe: c.errand.recipe, isCrab: true, crab: c,
        need: c.errand.need, x: c.x, spawnX: c.x, state: "waiting",
        patience: 90, maxPatience: 90, claimed: false, served: false };   // locals will wait
      customers.push(cust);
      c.errandCust = cust; c.dayState = "errand";
    }
  } else if (c.dayState === "errand") {
    const k = c.errandCust;
    if (!k) { c.dayState = "home"; startCommute(c, false); return; }
    const open = allCrabs().some(w => w.duty && w.workBiz === k.biz &&
      (!w.pendingOff || tmin < SHIFTS[w.p.shift].end + 45));
    if (!open && k.state === "waiting" && !k.claimed) {
      k.state = "leaving"; k.happy = false;   // kitchen's dark - go home
      c.quip = { text: "CLOSED?! HMPH", t: 2.2 };
      return;
    }
    if ((k.state === "dining" || k.state === "seatedWaiting" || k.state === "toSeat") && k.table) { c.x = k.table.x + 2; c.y = k.table.y + 1; }
    else if (k.state === "showering" && k.stall) { c.x = k.stall.x + 2; c.y = k.stall.y + 4; c.hidden = true; }
    else if ((k.state === "toStall" || k.state === "outStall") && k.climb)
      { c.hidden = false; c.x = k.x; c.y = 166 - 26 * k.climb; }   // stepping up/down
    else { c.hidden = false; c.x = k.x; c.y = 166; }
  }
}
function finishErrand(k) {
  k.done = true;
  const c = k.crab;
  if (c.errandCust === k) {
    c.hidden = false;
    c.errandCust = null; c.errandCd = 25;
    if (!k.served) c.quip = { text: "LINE WAS TOO LONG", t: 2.4 };
    c.dayState = "home";
    startCommute(c, false);
  }
}

// ---------------------------------------------------------------- kitchen (CS1 port)
function stationSpot(bizKey, kind, slot) {
  const xs = BIZ[bizKey].stations[kind];
  const st = xs[slot] != null ? xs[slot] : xs[0];
  return { x: st.x + 2, y: st.y + 7 };   // stand just in front of the appliance
}
function setT(c, x, y) { c.tx = x; c.ty = y; }
// kitchen walking: use the clear lanes (aisle y=147 between rows, boardwalk
// y=168 below the front row) for horizontal travel, cut in at the end
function routedStep(c, spd, dt) {
  const tx = c.tx, ty = c.ty;
  if (Math.abs(c.x - tx) <= 5) return stepTo(c, tx, spd, dt, ty);   // final approach: straight in
  const lane = ty <= 147 ? 147 : 168;
  if (Math.abs(c.y - lane) > 3) {
    // merge at a 2:1 slope: reaches the lane quickly, keeps x-motion to slide off colliders
    stepTo(c, c.x + Math.sign(tx - c.x) * Math.abs(c.y - lane) * 2, spd, dt, lane);
    return false;
  }
  stepTo(c, tx, spd, dt, lane);   // travel the lane
  return false;
}
function tryAcquire(bizKey, kind) {
  const cap = stationCap(bizKey, kind);
  for (let i = 0; i < cap; i++) if (!busy[bizKey][kind][i]) { busy[bizKey][kind][i] = true; return i; }
  return -1;
}
function release(c) {
  if (c.slotKind && c.slot >= 0) busy[c.workBiz][c.slotKind][c.slot] = false;
  c.slot = -1; c.slotKind = null;
}
function abortErrand(c) {
  // a crab yanked out of an errand (death, sudden hire) must release everything
  // the errand held: a stall left occupied is NEVER cleaned or reused (stall
  // cleaning requires !occupant), a table likewise, and the ghost order pollutes the queue
  const k = c.errandCust;
  if (!k) return;
  if (k.stall) { k.stall.occupant = null; k.stall.dirty = true; k.stall = null; }
  if (k.table) { k.table.occupant = null; k.table = null; }
  k.done = true; k.state = "leaving"; k.claimed = false;
  customers = customers.filter(q => q !== k);
  c.errandCust = null;
}
function abortChef(c) {
  release(c);   // covers kitchen work AND a selfCook grip on a grill (e.g. death mid-meal)
  if (c.cust && !c.cust.served) c.cust.claimed = false;   // let another chef pick the order up
  if (c.cleanStall) { c.cleanStall.cleaning = false; c.cleanStall = null; }
  c.kstate = "idle"; c.cust = null; c.carrying = null; c.stepIdx = 0;
}
function updateFishing(c, dt) {
  // stand at the spot, cast, wait, land one - the town's oldest job
  if (c.fishSpot) { c.x = c.fishSpot.x; c.y = c.fishSpot.y; }
  c.castT = (c.castT || 5) - dt;
  if (c.castT <= 0) {
    // a live-aboard works the deeper water off their own deck: quicker bites,
    // and now and then the net comes up double
    const aboard = c.p.boat != null;
    c.castT = aboard ? 9 + Math.random() * 13 : 14 + Math.random() * 18;
    const haul = aboard && Math.random() < 0.2 ? 2 : 1;
    townCatch += haul; trade.landed += haul; trade.landedDay += haul;
    c.p.wallet += 2 * haul;   // the market pays small money for each landed fish
    popText(haul > 1 ? "DOUBLE HAUL!" : "CATCH!", c.x - 4, c.y - 24, [140, 220, 255]);
    sfx.splash();
    if (window._stats) {
      window._stats.catches = (window._stats.catches || 0) + haul;
      const by = window._stats.catchesBy = window._stats.catchesBy || {};
      by[c.p.name] = (by[c.p.name] || 0) + haul;
    }
    if (Math.random() < 0.25) c.quip = { text: ["BIG ONE!", "THEY'RE BITING", "SEA PROVIDES"][(Math.random() * 3) | 0], t: 2.2 };
  }
}
function updateKitchen(c, dt) {
  if (c.cust && (c.cust.state === "leaving" || c.cust.served)) { abortChef(c); return; }
  const bizKey = c.workBiz, biz = BIZ[bizKey];
  // hustle: kitchens move quick - but a run-down crab loses the spring in
  // their step: a gentle slope, plus a kicker once seriously neglected
  // (eff < 0.85), totalling ~-18% at rock bottom
  const eff = crabEff(c);
  const spd = crabMove(c) * 1.55 * (1 - 0.3 * (1 - eff) - 1.2 * Math.max(0, 0.85 - eff));
  if (c.kstate === "idle") {
    const lastCall = c.pendingOff && tmin < SHIFTS[c.p.shift].end + 45;
    if (!c.pendingOff || lastCall) {
      // paying guests first; locals and crew get served in the lulls
      const pending = customers.filter(k => k.biz === bizKey &&
        (k.state === "waiting" || k.state === "seatedWaiting") && !k.claimed && !k.served);
      const o = pending.find(k => !k.isCrab) || pending[0];
      if (o) {
        o.claimed = true; c.cust = o; c.stepIdx = -1; c.kstate = "walk";
        // send dine-in guests to a table right away - the server brings it out
        const bts = bizTables(bizKey);
        if (o.state === "waiting" && bts) {
          const seat = bts.find(t => !t.occupant && t.dishes === 0);
          if (seat) { seat.occupant = o; o.table = seat; o.state = "toSeat"; }
        }
        const s0 = stationSpot(bizKey, biz.source, 0); setT(c, s0.x, s0.y);
        return;
      }
      // (outdoor dining: guests bus their own tables - a staff-bused dining
      //  room returns with a fancier restaurant later)
      const grubby = !c.pendingOff && biz.stalls && biz.stalls.find(t => t.dirty && !t.cleaning && !t.occupant);
      if (grubby) {
        grubby.cleaning = true; c.cleanStall = grubby; c.kstate = "toStallClean";
        setT(c, grubby.x + 2, grubby.y + 7);
        return;
      }
    }
    setT(c, biz.door + 4 + (Math.max(0, crabs.indexOf(c)) % 3) * 10, 146 + (Math.max(0, crabs.indexOf(c)) % 2) * 10);
    stepTo(c, c.tx, spd, dt, c.ty);
  } else if (c.kstate === "walk") {
    if (routedStep(c, spd, dt)) {
      if (c.stepIdx === -1) {
        if (ownerFunds(bizKey) < ingredientCost(c.cust.recipe.raw)) { c.kstate = "waitCash"; return; }
        debitBiz(bizKey, ingredientCost(c.cust.recipe.raw), c.x, FLOOR_Y - 40);
        consumeIngredient(c.cust.recipe.raw);
        c.kstate = "work"; c.workMax = c.workT = 0.6; c.slotKind = null; c.slot = -1;
      }
      else if (c.stepIdx >= c.cust.recipe.steps.length) serve(c);
      else {
        const [kind] = c.cust.recipe.steps[c.stepIdx];
        const s = tryAcquire(bizKey, kind);
        if (s < 0) c.kstate = "waitSlot";
        else {
          c.slotKind = kind; c.slot = s;
          const sp = stationSpot(bizKey, kind, s); setT(c, sp.x, sp.y);
          c.kstate = "toSlot";
        }
      }
    }
  } else if (c.kstate === "toStallClean") {
    if (routedStep(c, spd, dt)) { c.workMax = c.workT = 2.5 / (crabWork(c) * crabEff(c)); c.kstate = "cleaningStall"; }
  } else if (c.kstate === "cleaningStall") {
    c.workT -= dt;
    if (c.workT <= 0) {
      if (c.cleanStall) { c.cleanStall.dirty = false; c.cleanStall.cleaning = false; c.cleanStall = null; }
      c.kstate = "idle";
      if (window._stats) window._stats.stallsCleaned = (window._stats.stallsCleaned || 0) + 1;
      popText("SPARKLING", c.x - 6, FLOOR_Y - 30, [140, 220, 255]);
    }
  } else if (c.kstate === "waitCash") {
    if (ownerFunds(bizKey) >= ingredientCost(c.cust.recipe.raw)) {
      debitBiz(bizKey, ingredientCost(c.cust.recipe.raw), c.x, FLOOR_Y - 40);
      consumeIngredient(c.cust.recipe.raw);
      c.kstate = "work"; c.workMax = c.workT = 0.6; c.slotKind = null; c.slot = -1;
    }
  } else if (c.kstate === "waitSlot") {
    const kind = c.cust.recipe.steps[c.stepIdx][0];
    const s = tryAcquire(bizKey, kind);
    if (s >= 0) {
      c.slotKind = kind; c.slot = s;
      const sp = stationSpot(bizKey, kind, s); setT(c, sp.x, sp.y);
      c.kstate = "toSlot";
    }
  } else if (c.kstate === "toSlot") {
    if (routedStep(c, spd, dt)) {
      const [, secs] = c.cust.recipe.steps[c.stepIdx];
      const mult = masteryMult(c, c.cust.recipe.id) / (crabWork(c) * crabEff(c));
      c.workMax = c.workT = secs * mult;
      c.kstate = "work";
    }
  } else if (c.kstate === "work") {
    c.workT -= dt;
    if (c.workT <= 0) {
      if (c.stepIdx === -1) {
        c.carrying = c.cust.recipe.raw;   // paid for at grab start
      }
      else { c.carrying = c.cust.recipe.steps[c.stepIdx][2]; release(c); }
      popText(ITEM_NAMES[c.carrying] + "!", c.x - 8, FLOOR_Y - 28, [255, 255, 255]);
      c.stepIdx++;
      if (c.stepIdx >= c.cust.recipe.steps.length) {
        if (c.cust.table) setT(c, c.cust.table.x + 2, c.cust.table.y + 10);   // bring it out
        else { const so = stationSpot(bizKey, biz.out, 0); setT(c, so.x, so.y); }
        c.kstate = "walk";
      }
      else {
        const st0 = biz.stations[c.cust.recipe.steps[c.stepIdx][0]][0];
        setT(c, st0.x + 2, st0.y + 7);
        c.kstate = "walk";
      }
    }
  }
}
const MASTERY = [[250, 0.20, "MASTERED"], [100, 0.12, "IS FAMOUS FOR"], [25, 0.05, "HAS THE KNACK FOR"]];
function masteryMult(c, id) {
  const n = (c.p.made && c.p.made[id]) || 0;
  for (const [need, bonus] of MASTERY) if (n >= need) return 1 - bonus;
  return 1;
}
function creditAccomplishment(c, cust) {
  if (!c || !c.p || cust.isCrab) return;   // paying guests only
  const id = cust.recipe.id;
  c.p.made[id] = (c.p.made[id] || 0) + 1;
  const n = c.p.made[id];
  for (const [need, , label] of MASTERY) {
    if (n === need) {
      const dish = ITEM_NAMES[cust.recipe.icon];
      toast = { text: c.p.name + " " + label + " " + dish + "! " + n + " SERVED", t: 6 };
      popText(label + " " + dish, c.x - 24, FLOOR_Y - 36, [255, 230, 120]);
      c.quip = { text: ["I'VE GOT THIS", "MY SPECIALTY", "EASY NOW"][(Math.random() * 3) | 0], t: 2.4 };
      sfx.ding();
      break;
    }
  }
}
function payAndBenefit(c, cust) {
  today.served++;
  // trade ledger: tracked input flows (T1 bookkeeping - nothing charged here)
  if (cust.recipe) {
    if (cust.recipe.id === "taco") tradeImport("corn", 1);          // tortilla-to-be (T3 pilot)
    if (cust.biz === "arcade") tradeImport("power", 1);             // a machine hour
  }
  creditAccomplishment(c, cust);
  if (c && c.p) today.byCrab[c.p.name] = (today.byCrab[c.p.name] || 0) + 1;
  if (cust.isCrab) {
    const price = Math.ceil(cust.recipe.pay * 1.25);   // full retail, always - no broke-crab discounts
    cust.crab.p.wallet = Math.max(0, cust.crab.p.wallet - price);
    creditBiz(cust.biz, price, cust.x, 126);
    if (cust.crab.p.npc && bizOwner(cust.biz) === "player" && window._stats)
      window._stats.npcSpendAtPlayer = (window._stats.npcSpendAtPlayer || 0) + price;
    if (cust.need === "food") cust.crab.p.hunger = 0;
    if (cust.need === "fun") { cust.crab.p.bored = 0; cust.crab.quip = { text: "BEST DAY EVER!", t: 2.4 }; }
    popText(ITEM_NAMES[cust.recipe.icon], cust.x - 14, 116, [140, 255, 160]);
  } else {
    const tipMult = TRAITS[c.p.trait].tip * (1 - 0.3 * (c.p.dirt || 0))
      * (1 - ((c.p.sandy || 0) >= 0.66 ? 0.15 : 0));
    const tip = cust.recipe.pay * 0.5 * (cust.patience / cust.maxPatience) * tipMult;
    creditBiz(cust.biz, cust.recipe.pay + tip, cust.x, 126);
    popText(ITEM_NAMES[cust.recipe.icon], cust.x - 14, 116, [140, 255, 160]);
  }
}
function serve(c) {
  const cust = c.cust;
  if (cust && cust.state === "toSeat") return;   // guest still walking to the table: wait a beat, retry next frame
  if (cust && cust.state === "seatedWaiting") {
    // table delivery: payment + benefits as usual, then straight to dining
    payAndBenefit(c, cust);
    cust.served = true; cust.happy = true; sfx.ding();
    if (!cust.isCrab) rep = Math.min(100, rep + 0.8);   // table service impresses
    cust.state = "dining"; cust.dineT = 6 + Math.random() * 4;
    if (cust.table) cust.table.dishes = 1;   // plate on the table while they eat
    if (window._stats) window._stats.seated = (window._stats.seated || 0) + 1;
    if (window._stats) window._stats[cust.isCrab ? "crabServes" : "tourServes"]++;
    if (window._stats && bizOwner(cust.biz) !== "player")
      window._stats.npcServes = (window._stats.npcServes || 0) + 1;
    c.cust = null; c.carrying = null; c.kstate = "idle"; c.stepIdx = 0;
    return;
  }
  if (cust && cust.state === "waiting") {
    payAndBenefit(c, cust);
    cust.served = true; cust.happy = true; sfx.ding();
    if (!cust.isCrab) rep = Math.min(100, rep + 0.4);
    const tables = bizTables(cust.biz), stalls = BIZ[cust.biz].stalls;
    const seat = tables ? tables.find(t => !t.occupant && t.dishes === 0) : null;
    const stall = stalls ? stalls.find(t => !t.occupant && !t.dirty) : null;
    if (stalls) {
      if (stall) { stall.occupant = cust; cust.state = "toStall"; cust.stall = stall; }
      else { cust.state = "waitStall"; cust.waitT = 30; }
    }
    else if (seat) { seat.occupant = cust; cust.state = "toTable"; cust.table = seat; }
    else cust.state = "leaving";
    if (window._stats) window._stats[cust.isCrab ? "crabServes" : "tourServes"]++;
    if (window._stats && bizOwner(cust.biz) !== "player")
      window._stats.npcServes = (window._stats.npcServes || 0) + 1;
  }
  c.cust = null; c.carrying = null; c.kstate = "idle"; c.stepIdx = 0;
}

// ---------------------------------------------------------------- customers
function newCustomer(bizKey) {
  const biz = BIZ[bizKey];
  const r = biz.recipes[(Math.random() * biz.recipes.length) | 0];
  const spawnX = biz.queueX + 150;
  return { biz: bizKey, recipe: r,
    name: CUSTOMER_NAMES[(Math.random() * CUSTOMER_NAMES.length) | 0],
    color: (Math.random() * CRAB_COLORS.length) | 0,
    acc: ACC_KEYS[(Math.random() * ACC_KEYS.length) | 0],
    animT: Math.random() * 9,
    x: spawnX, spawnX, state: "arriving", patience: 50, maxPatience: 50,
    claimed: false, served: false };
}
function updateCustomers(dt) {
  const qi = {};
  for (const b of Object.keys(BIZ)) qi[b] = 0;
  for (const k of customers) {
    if (k.state === "arriving" || k.state === "waiting") {
      const slot = BIZ[k.biz].queueX + (qi[k.biz]++) * QUEUE_DX;
      if (k.state === "arriving") {
        k.x -= 45 * dt;
        if (k.x <= slot) {
          k.x = slot; k.state = "waiting";
          popText((k.isCrab ? k.crab.p.name : k.name.split(" ")[0]) + ": " + ITEM_NAMES[k.recipe.icon] + "?", k.x - 26, FLOOR_Y - 42, [255, 255, 255]);
        }
      } else {
        if (k.x > slot) k.x = Math.max(slot, k.x - 45 * dt);
        k.patience -= dt * (bizStaffed(k.biz) ? 1 : 6);   // nobody home? give up quick
        if (k.patience <= 0) {
          k.state = "leaving"; k.happy = false; k.claimed = false;
          if (window._stats) window._stats[k.isCrab ? "crabRage" : "tourRage"]++;
          popText("!!", k.x, 120, [255, 80, 80]); sfx.angry();
        }
      }
    } else if (k.state === "toStall") {
      const st = k.stall;
      const dxs = st.x + 3 - k.x;
      if (Math.abs(dxs) > 2) k.x += Math.sign(dxs) * Math.min(45 * dt, Math.abs(dxs));
      else {
        k.climb = Math.min(1, (k.climb || 0) + dt * 1.8);   // step up into the stall
        if (k.climb >= 1) { k.state = "showering"; k.showerT = k.recipe.showerT || 5; }
      }
    } else if (k.state === "outStall") {   // hop back down to the floor, towel-fresh
      k.climb = Math.max(0, (k.climb || 0) - dt * 2.2);
      if (k.climb <= 0) k.state = "leaving";
    } else if (k.state === "showering") {
      k.showerT -= dt;
      if (k.showerT <= 0) {
        const st = k.stall;
        st.occupant = null; st.dirty = true; k.stall = null;
        if (k.isCrab) {
          k.crab.p.sandy = 0;
          k.crab.p.dirt = Math.max(0, (k.crab.p.dirt || 0) - (k.recipe.deep ? 0.7 : 0.5));
          k.crab.quip = { text: "SQUEAKY CLEAN!", t: 2.4 };
        }
        if (window._stats) window._stats.showersDone = (window._stats.showersDone || 0) + 1;
        tradeImport("water", k.recipe.deep ? 14 : 8);
        popText("AHHH", k.x, 126, [140, 220, 255]);
        k.state = "outStall";
      }
    } else if (k.state === "waitStall") {
      k.waitT -= dt;
      const st = BIZ[k.biz].stalls.find(t => !t.occupant && !t.dirty);
      if (st) { st.occupant = k; k.stall = st; k.state = "toStall"; }
      else if (k.waitT <= 0) { k.state = "leaving"; k.happy = false; }
    } else if (k.state === "toSeat") {
      const t = k.table;
      const dxs2 = t.x + 10 - k.x;
      if (Math.abs(dxs2) > 2) k.x += Math.sign(dxs2) * Math.min(45 * dt, Math.abs(dxs2));
      else k.state = "seatedWaiting";
    } else if (k.state === "seatedWaiting") {
      k.patience -= dt * 0.35;   // seated guests relax
      if (k.patience <= 0) {
        k.state = "leaving"; k.happy = false; k.claimed = false;
        if (k.table) { k.table.occupant = null; k.table = null; }
        if (!k.isCrab) { rep = Math.max(0, rep - 3); today.rage++; }
        if (window._stats) window._stats[k.isCrab ? "crabRage" : "tourRage"]++;
        popText("!!", k.x, 120, [255, 80, 80]); sfx.angry();
      }
    } else if (k.state === "toTable") {
      const t = k.table;
      const dxt = t.x + 10 - k.x;
      if (Math.abs(dxt) > 2) k.x += Math.sign(dxt) * Math.min(45 * dt, Math.abs(dxt));
      else { k.state = "dining"; k.dineT = 6 + Math.random() * 4; k.table.dishes = 1; if (window._stats) window._stats.seated = (window._stats.seated || 0) + 1; }
    } else if (k.state === "dining") {
      k.dineT -= dt;
      if (k.dineT <= 0) {
        k.table.dishes = 0;              // outdoor spot: everyone buses their own table
        k.table.occupant = null;
        if (!k.isCrab) {
          creditBiz(k.biz, 5, k.x, 130); // table tip on the way out (tourists)
          popText("TABLE TIP", k.x - 10, 122, [140, 255, 160]);
        }
        k.state = "leaving";
      }
    } else if (k.state === "leaving") {
      k.x += (k.happy ? 50 : 75) * dt;
      if (k.isCrab) { finishErrand(k); continue; }
    }
  }
  customers = customers.filter(k => k.isCrab ? !k.done : k.x < (k.spawnX || WORLD_W) + 20);
  spawnT -= dt;
  if (spawnT <= 0 && shackOpen()) {
    // tourists pick a staffed business
    const open = Object.keys(BIZ).filter(b => bizUnlocked(b) && !bizDark(b) && allCrabs().some(c => c.duty && c.workBiz === b));
    if (open.length) {
      const weights = open.map(b => b === "shack" ? 0.5 : b === "arcade" ? 0.22 : 0.1);
      let r = Math.random() * weights.reduce((a, v) => a + v, 0), pick = open[0];
      for (let i = 0; i < open.length; i++) { r -= weights[i]; if (r <= 0) { pick = open[i]; break; } }
      // tourists never take the last slot - your own crew and neighbours eat too
      const tourQueue = customers.filter(k => k.biz === pick && !k.isCrab && k.state !== "leaving").length;
      const allQueue = customers.filter(k => k.biz === pick && k.state !== "leaving").length;
      if (tourQueue < TOURIST_QUEUE_MAX && allQueue < QUEUE_MAX) customers.push(newCustomer(pick));
    }
    spawnT = spawnEvery() * (0.7 + Math.random() * 0.6);
  }
}

// ---------------------------------------------------------------- status text
function crabStatus(c) {
  if (c.p.sick) return "SICK - DAY " + ((c.p.sick.days || 0) + 1) + " - NEEDS FOOD + REST";
  if (c.p.job === "fishing" && c.dayState === "working") return "FISHING OFF THE PIER";
  if (c.dayState === "home") {
    if (darkness() > 0.7) return c.p.homeless ? "SLEEPING AT THE SHELTER" : "SLEEPING";
    return c.p.homeless ? "AT THE SHELTER" : "CHILLING AT HOME";
  }
  if (c.dayState === "working") {
    if (c.kstate === "work" && c.slotKind === "board") return "CHOPPING";
    if (c.kstate === "work" && c.slotKind === "grill") return "GRILLING";
    if (c.kstate === "toStallClean" || c.kstate === "cleaningStall") return "SCRUBBING A STALL";
    if (c.kstate === "work") return "GRABBING FOOD";
    if (c.carrying) return "CARRYING " + ITEM_NAMES[c.carrying];
    if (c.kstate === "waitCash") return "SHORT ON CASH!";
    if (c.kstate === "waitSlot") return "WAITING FOR A SPOT";
    return "ON SHIFT";
  }
  if (c.dayState === "selfCook") return c.cookStep >= 3 ? "COOKING A STAFF MEAL" : "RAIDING THE PANTRY";
  if (c.dayState === "toErrand") return "OFF TO " + BIZ[c.errandBiz].name;
  if (c.dayState === "errand") return "IN LINE AT " + BIZ[c.errandBiz].name;
  const toWork = c.dayState === "toWork";
  if (c.cstate === "waitBus") return "WAITING FOR THE BUS";
  if (c.cstate === "onBus") return "RIDING THE BUS";
  if (c.cstate === "walkToStop") return "WALKING TO THE BUS";
  if (c.cstate === "drive") return (c.p.mode === "bike" ? "BIKING" : "DRIVING") + (toWork ? " TO WORK" : " HOME");
  return (toWork ? "WALKING TO WORK" : "HEADING HOME");
}

// ---------------------------------------------------------------- input
const BUTTONS = [];
{
  const keys = ["chef", "grill", "board", "table", "_biz1", "_biz2"];
  for (let i = 0; i < 6; i++)
    BUTTONS.push({ key: keys[i], x: 4 + (i % 3) * 84, y: ROW_Y + ((i / 3) | 0) * BTN_STEP, w: 80, h: BTN_H });
}
function buttonKey(b) {
  if (b.key === "_biz1") return UPS.arcade.lvl === 0 ? "arcade" : "cadegear";
  if (b.key === "_biz2") return null;   // vacated by the laundromat; the juice bar lands here next pass
  return b.key;
}
function tryBuy(key) {
  const u = UPS[key];
  if (!u || u.lvl >= u.max || coins < upCost(u)) return;
  coins -= upCost(u); u.lvl++;
  if (key === "arcade") {
    toast = { text: "THE CLAWCADE IS YOURS! CLICK A CRAB, THEN ITS CARD, TO STAFF IT", t: 8 };
    popText("GRAND OPENING!", BIZ.arcade.x0 + 40, 100, [140, 255, 160]);
  }
  if (key === "chef") {
    const p2 = makeCrabPersona(crabs.length + ((Math.random() * 6) | 0));
    const usedNames = new Set(crabs.map(k => k.p.name));
    if (usedNames.has(p2.name)) {
      const free = CRAB_NAMES.find(n => !usedNames.has(n));
      if (free) p2.name = free;
    }
    const used = new Set(allCrabs().filter(k => !k.p.homeless).map(k => k.p.house));
    p2.homeless = true;
    for (let h = 0; h < HOUSE_XS.length; h++) if (!used.has(h)) { p2.house = h; p2.homeless = false; break; }
    const c = newCrab(p2);
    c.x = homeX(c);
    crabs.push(c);
    popText(c.p.name + " JOINS THE CREW!", c.x - 20, FLOOR_Y - 30, [140, 255, 160]);
  }
  sfx.buy(); save();
}

let dragging = false, dragStartX = 0, dragCamX = 0, dragMoved = false;
cv.addEventListener("mousedown", (ev) => {
  const p = evPos(ev);
  if (p.y < PANEL_Y) { dragging = true; dragStartX = p.x; dragCamX = camX; dragMoved = false; }
});
addEventListener("mousemove", (ev) => {
  if (!dragging) return;
  const p = evPos(ev);
  if (Math.abs(p.x - dragStartX) > 4) { dragMoved = true; followIdx = -1; followNpc = null; followCust = null; }
  if (dragMoved) camX = clampCam(dragCamX - (p.x - dragStartX));
});
addEventListener("mouseup", () => { dragging = false; setTimeout(() => { dragMoved = false; }, 50); });
cv.addEventListener("touchstart", (ev) => {
  const t = ev.touches[0];
  const p = evPos(t);
  if (window.MergeMode && MergeMode.touchStart(p)) return;
  if (p.y < PANEL_Y) { dragging = true; dragStartX = p.x; dragCamX = camX; dragMoved = false; }
}, { passive: true });
cv.addEventListener("touchmove", (ev) => {
  if (window.MergeMode && MergeMode.touchMove(evPos(ev.touches[0]))) { ev.preventDefault(); return; }
  if (!dragging) return;
  ev.preventDefault();
  const p = evPos(ev.touches[0]);
  if (Math.abs(p.x - dragStartX) > 6) { dragMoved = true; followIdx = -1; followNpc = null; followCust = null; }
  if (dragMoved) camX = clampCam(dragCamX - (p.x - dragStartX));
}, { passive: false });
cv.addEventListener("touchend", (ev) => {
  const t = ev.changedTouches && ev.changedTouches[0];
  if (window.MergeMode && MergeMode.touchEnd(t ? evPos(t) : null)) { dragging = false; dragMoved = false; return; }
  setTimeout(() => { dragging = false; dragMoved = false; }, 50);
});
// horizontal wheel / trackpad swipe pans the town (shift+wheel too)
cv.addEventListener("wheel", (ev) => {
  if (screen !== "play") return;
  const dx = Math.abs(ev.deltaX) > Math.abs(ev.deltaY) ? ev.deltaX : (ev.shiftKey ? ev.deltaY : 0);
  if (!dx) return;
  ev.preventDefault();
  const scale = ev.deltaMode === 1 ? 16 : 1;   // some browsers report lines, not pixels
  camX = clampCam(camX + dx * scale * 0.6);
  followIdx = -1; followNpc = null; followCust = null;
}, { passive: false });
function evPos(ev) {
  const r = cv.getBoundingClientRect();
  return { x: (ev.clientX - r.left) * (cv.width / r.width), y: (ev.clientY - r.top) * (cv.height / r.height) };
}
function clampCam(x) { return Math.max(0, Math.min(WORLD_W - W, x)); }

cv.addEventListener("click", (ev) => {
  if (window.MergeMode && MergeMode.active()) return;
  if (screen === "title") {
    const p = evPos(ev);
    const bx = W / 2 - 50;
    if (p.x >= bx && p.x < bx + 100) {
      if (hasSave && p.y >= 118 && p.y < 134) { screen = "play"; startMusic(); sfx.ding(); return; }
      const ny = hasSave ? 138 : 122;
      if (p.y >= ny && p.y < ny + 16) {
        if (!hasSave || newConfirmT > 0) { hasSave ? newGame() : (screen = "intro", startMusic(), sfx.ding()); }
        else { newConfirmT = 3; sfx.buy(); }
        return;
      }
    }
    return;
  }
  if (screen === "intro") {
    const p = evPos(ev);
    if (p.x >= W / 2 - 56 && p.x < W / 2 + 56 && p.y >= 152 && p.y < 170) { screen = "play"; sfx.ding(); }
    return;
  }
  if (gameOver) { newGame(); return; }
  if (dossier) {
    // the DOES row doubles as the reassignment control for crew crabs
    const pt = evPos(ev);
    const owned = Object.keys(BIZ).filter(b => bizUnlocked(b) && bizOwner(b) === "player");
    if (dossier.p && !dossier.p.npc && owned.length > 1 && pt.y >= 47 && pt.y < 57 && pt.x >= 24 && pt.x < 232) {
      const c = dossier;
      c.p.job = owned[(owned.indexOf(c.p.job) + 1) % owned.length];
      sfx.buy();
      popText("NEW JOB: " + BIZ[c.p.job].name, c.x - 20, FLOOR_Y - 34, [140, 255, 160]);
      return;
    }
    dossier = null; return;
  }
  if (boardView) { boardView = false; return; }
  if (reportT > 0) { reportT = 0; return; }
  startMusic();
  const p = evPos(ev);
  if (dragMoved) return;
  // panel
  if (p.y >= PANEL_Y) {
    if (p.y < TAB_Y - 1) {
      if (p.x > 233) { ffMode = ffMode === 3 ? 0 : 3; sfx.ding(); return; }
      if (p.x > 217) { ffMode = ffMode === 2 ? 0 : 2; sfx.ding(); return; }
      if (p.x > 203) { ffMode = ffMode === 1 ? 0 : 1; sfx.ding(); return; }
      if (p.x > 188) { soundOn = !soundOn; if (soundOn) sfx.ding(); return; }
      if (p.x > 168) { toggleMusic(); return; }
      if (p.x >= 145 && p.x <= 166) { toggleMute(); if (!muted) sfx.ding(); return; }
    }
    if (p.y >= TAB_Y && p.y < TAB_Y + TAB_H) {
      if (p.x >= 4 && p.x < 36) { tab = "crew"; return; }
      if (p.x >= 38 && p.x < 70) { tab = "shop"; return; }
      if (p.x >= 128 && p.x < 158) {
        if (newConfirmT > 0) newGame();
        else { newConfirmT = 3; sfx.buy(); }
        return;
      }
      if (p.x >= 168) { tab = tab === "menu" ? "crew" : "menu"; sfx.ding(); return; }
    }
    if (tab === "shop") {
      for (const b of BUTTONS)
        if (p.x >= b.x && p.x < b.x + b.w && p.y >= b.y && p.y < b.y + b.h) { tryBuy(buttonKey(b)); return; }
    } else if (tab === "crew") {   // menu tab: no invisible crew cards to click
      for (let i = 0; i < crabs.length; i++) {
        const bx = 4 + i * CARD_STEP;
        if (p.x >= bx && p.x < bx + CARD && p.y >= ROW_Y && p.y < ROW_Y + CARD) {
          followIdx = followIdx === i ? -1 : i; followNpc = null; followCust = null; return;
        }
      }
    }
    return;
  }
  // follow-card job toggle
  if (followIdx >= 0 && !followNpc && UPS.arcade.lvl > 0 && p.x >= 56 && p.x < 90 && p.y >= 33 && p.y < 46) {
    const c = crabs[followIdx];
    // crew work only the player's businesses - never an NPC-owned shop
    const owned = Object.keys(BIZ).filter(b => bizUnlocked(b) && bizOwner(b) === "player");
    c.p.job = owned[(owned.indexOf(c.p.job) + 1) % owned.length];
    sfx.buy();
    popText("NEW JOB: " + BIZ[c.p.job].name, c.x - 20, FLOOR_Y - 34, [140, 255, 160]);
    return;
  }
  // a click on the follow card itself opens the crab's full record
  {
    const fc2 = followNpc || followCust || (followIdx >= 0 && crabs[followIdx]);
    if (fc2 && p.x >= 2 && p.x < 130 && p.y >= 2 && p.y < 54) { dossier = fc2; sfx.ding(); return; }
  }
  // the little sun: fast-forward to morning
  if (p.x >= W - 26 && p.x < W - 1 && p.y >= 13 && p.y < 28) {
    ffSleep = !ffSleep;
    if (ffSleep) ffSleepDay = tmin < 6.5 * 60 ? day : day + 1;
    sfx.ding(); return;
  }
  const wx = p.x + camX;
  // the job board is readable
  if (wx >= JOB_BOARD_X - 2 && wx < JOB_BOARD_X + 28 && p.y >= HOME_BOTTOM - 40 && p.y < HOME_BOTTOM + 4) {
    boardView = true; sfx.ding(); return;
  }
  // world: click any crab - crew or townsfolk - to follow them
  for (const c of allCrabs()) {
    if (!c.hidden && Math.abs(wx - (c.x + 8)) < 12 && Math.abs(p.y - (c.y - 6)) < 14) {
      if (c.p.npc) { followNpc = c; followIdx = -1; }
      else { followIdx = crabs.indexOf(c); followNpc = null; }
      followCust = null;
      return;
    }
  }
  // tourists are people too: click to follow them around their visit
  for (const k of customers) {
    if (k.isCrab || k.state === "showering") continue;
    const ky = FLOOR_Y - 4 - 26 * (k.climb || 0);
    if (Math.abs(wx - (k.x + 8)) < 12 && Math.abs(p.y - ky) < 14) {
      followCust = k; followIdx = -1; followNpc = null;
      return;
    }
  }
});
addEventListener("keydown", (e) => {
  if (e.key === "m") { toggleMute(); if (!muted) sfx.ding(); }
  if (e.key === "n") toggleMusic();
  if (e.key === "b" && musicOn) playTrack(trackIdx + 1);   // next track
  if (e.key === "f") ffMode = (ffMode + 1) % 4;            // fast-forward 1x/2x/3x/6x
  if (e.key === "ArrowLeft") { camX = clampCam(camX - 24); followIdx = -1; followNpc = null; followCust = null; }
  if (e.key === "ArrowRight") { camX = clampCam(camX + 24); followIdx = -1; followNpc = null; followCust = null; }
  if (e.key === "Escape") { if (dossier) { dossier = null; return; } followIdx = -1; followNpc = null; followCust = null; }
});

// ---------------------------------------------------------------- drawing
const _bigCache = {};
function bigText(c2, s, x, y, color, scale, shadow) {
  const key = s + "#" + color.join() + "#" + scale;
  let cv2 = _bigCache[key];
  if (!cv2) {
    cv2 = document.createElement("canvas");
    cv2.width = textWidth(s) + 2; cv2.height = 9;
    const cx3 = cv2.getContext("2d");
    if (shadow) text(cx3, s, 1, 1, shadow);
    text(cx3, s, 0, 0, color);
    _bigCache[key] = cv2;
  }
  c2.imageSmoothingEnabled = false;
  c2.drawImage(cv2, x | 0, y | 0, cv2.width * scale, cv2.height * scale);
}
const SKY = [[110, 190, 255], [130, 200, 255], [160, 215, 255], [190, 230, 255]];
const STARS = [];
for (let i = 0; i < 40; i++) STARS.push([(i * 61 + 17) % 256, (i * 37 + 5) % 52]);

function wblit(art, wx, y, flip) {
  const x = wx - camX;
  if (x + art.w < 0 || x > W) return;
  blit(ctx, art, x, y, flip);
}
function wrect(wx, y, w, h, color) {
  rect(ctx, wx - camX, y, w, h, color);
}

function drawBG() {
  for (let i = 0; i < 4; i++) rect(ctx, 0, i * 15, W, 15, SKY[i]);
  const dark = darkness();
  // sun / moon (screen fixed)
  if (dark < 0.5) {
    rect(ctx, 16, 8, 14, 14, [255, 240, 160]); rect(ctx, 18, 6, 10, 18, [255, 240, 160]);
    rect(ctx, 14, 10, 18, 10, [255, 240, 160]); rect(ctx, 19, 9, 8, 12, [255, 255, 220]);
  } else {
    blit(ctx, MOON, 20, 8);
    for (const s of STARS) px(ctx, s[0], s[1], [220, 230, 255]);
  }
  // clouds (parallax)
  blit(ctx, CLOUD, ((time * 4 - camX * 0.4) % 320 + 320) % 320 - 30, 12);
  blit(ctx, CLOUD, ((time * 2.5 - camX * 0.3 + 160) % 320 + 320) % 320 - 30, 30);
  const gt = time % 24;
  if (gt < 12 && dark < 0.5) blit(ctx, GULL[((time * 4) | 0) % 2], 256 - gt * 24, 22 + Math.sin(time * 2) * 3);
  // ocean (screen fixed)
  rect(ctx, 0, SKY_H, W, SHORE_Y - SKY_H, [40, 140, 220]);
  for (let y = SKY_H + 2; y < SHORE_Y; y += 5)
    for (let x = -8; x < W; x += 24) {
      const off = ((Math.sin(time * 1.3 + y) * 8) | 0) + ((y * 7) % 13);
      rect(ctx, x + off, y, 10, 1, [96, 200, 255]);
    }
  // glints on the water
  for (let i = 0; i < 6; i++) {
    if (((time * 2 + i * 1.7) | 0) % 3) continue;
    const gx = (i * 89 + ((time * 0.7) | 0) * 37) % W;
    const gy = SKY_H + 3 + (i * 11 + ((time * 0.4) | 0) * 5) % (SHORE_Y - SKY_H - 7);
    px(ctx, gx, gy, [235, 250, 255]);
  }
  const f = (Math.sin(time * 0.9) * 3) | 0;
  rect(ctx, 0, SHORE_Y - 3 + Math.max(0, f), W, 2, [230, 250, 255]);
  // sand (world)
  rect(ctx, 0, SHORE_Y, W, PANEL_Y - SHORE_Y, [246, 222, 170]);
  for (let i = 0; i < 90; i++) {
    const sx = (i * 47 + 13) % WORLD_W, sy = SHORE_Y + 4 + (i * 31) % (PANEL_Y - SHORE_Y - 10);
    if (sx - camX > -2 && sx - camX < W) px(ctx, sx - camX, sy, [226, 198, 140]);
  }
}

function drawPier() {
  // the east break: the sea cuts a channel under the boardwalk, and the
  // coast road crosses it on planks - SALTY and DRIFT fish off the rail.
  const bx0 = PIER_X0 - 4, bx1 = PIER_X1 + 4;      // water channel
  const dx0 = PIER_X0 - 14, dx1 = PIER_X1 + 14;    // plank deck bridging it
  if (bx1 - camX < -20 || dx0 - camX > W + 20) return;
  // channel water, with the same wave dashes as the open sea
  wrect(bx0, SHORE_Y, bx1 - bx0, 124 - SHORE_Y, [40, 140, 220]);
  for (let y = SHORE_Y + 3; y < 120; y += 5)
    for (let x = bx0; x < bx1; x += 24) {
      const off = ((Math.sin(time * 1.3 + y) * 8) | 0) + ((y * 7) % 13);
      if (x + off > bx0 && x + off + 10 < bx1) wrect(x + off, y, 10, 1, [96, 200, 255]);
    }
  // foam where the channel laps the sand
  const f = (Math.sin(time * 0.9 + 2) * 2) | 0;
  wrect(bx0, 122 + Math.max(0, f), bx1 - bx0, 2, [230, 250, 255]);
  wrect(bx0, SHORE_Y, 1, 124 - SHORE_Y, [170, 220, 250]);
  wrect(bx1 - 1, SHORE_Y, 1, 124 - SHORE_Y, [170, 220, 250]);
  // pilings sunk into the water under the deck
  for (let x = dx0 + 16; x < dx1 - 8; x += 34) {
    wrect(x, 104, 4, 13, [120, 80, 45]);
    wrect(x + 3, 104, 1, 13, [90, 60, 35]);
    wrect(x - 1, 115 + (((x / 34) | 0) % 2), 6, 1, [180, 230, 250]);   // waterline ripple
  }
  // railing along the sea side
  for (let x = dx0 + 4; x < dx1 - 4; x += 24) {
    wrect(x, 76, 2, 10, [140, 90, 50]);
    wrect(x, 76, 2, 1, [190, 140, 80]);
  }
  wrect(dx0 + 2, 78, dx1 - dx0 - 4, 2, [160, 110, 60]);
  // plank deck (ends rest on the sand past the channel)
  wrect(dx0, 86, dx1 - dx0, 18, [206, 156, 94]);
  wrect(dx0, 86, dx1 - dx0, 1, [236, 196, 130]);
  for (let r = 0; r < 4; r++) {
    const y = 90 + r * 4;
    wrect(dx0, y, dx1 - dx0, 1, [176, 126, 72]);
    for (let x = dx0 + 5 + ((r * 9) % 16); x < dx1 - 1; x += 16) wrect(x, y - 3, 1, 3, [186, 136, 78]);
  }
  wrect(dx0, 103, dx1 - dx0, 1, [120, 80, 45]);
  wrect(dx0, 104, dx1 - dx0, 1, [90, 60, 35]);
  // bait bucket between the fishing spots
  wblit(BUCKET, 1928, 97);
  // a gull loiters on the rail, eyeing the bucket (it clears off now and then)
  if ((time % 47) < 34 && darkness() < 0.8) {
    const hop = ((time * 2) | 0) % 8 === 0 ? -1 : 0;
    wblit(GULL_SIT, 2020, 73 + hop, ((time / 9) | 0) % 2 === 0);   // east of the berths
  }
  // lamp post on the east end for the night tide
  wrect(dx1 - 8, 66, 2, 20, [70, 60, 90]);
  wrect(dx1 - 9, 62, 4, 4, [30, 20, 36]);
  wrect(dx1 - 8, 63, 2, 2, darkness() > 0.4 ? [255, 230, 120] : [204, 208, 220]);
  if (darkness() > 0.4) {   // soft halo once it's lit
    wrect(dx1 - 10, 63, 1, 2, [190, 160, 80]); wrect(dx1 - 5, 63, 1, 2, [190, 160, 80]);
    wrect(dx1 - 8, 61, 2, 1, [190, 160, 80]); wrect(dx1 - 8, 66, 2, 1, [190, 160, 80]);
  }
}

function drawBoats() {
  // moored live-aboards ride the surf band off the seaward rail, bobbing on
  // their own beat; hull trim wears the owner's color like the house roofs do
  for (const c of allCrabs()) {
    if (c.p.boat == null) continue;
    const b = BOAT_BERTHS[c.p.boat];
    if (b.x - camX < -40 || b.x - camX > W + 40) continue;
    const bob = Math.sin(time * 0.8 + c.p.boat * 2.1) > 0 ? 1 : 0;
    wblit(BOATS[c.p.color % BOATS.length], b.x, BOAT_Y + bob);
    // mooring line from the stern down to the pier rail
    wrect(b.x + 34, 80 + bob, 3, 1, [140, 90, 50]);
    wrect(b.x + 36, 81 + bob, 2, 1, [140, 90, 50]);
  }
}

function drawTown() {
  // coast road runs the full length of town, behind everything
  wrect(0, ROAD_Y0, WORLD_W, ROAD_Y1 - ROAD_Y0, [120, 116, 130]);
  wrect(0, ROAD_Y0, WORLD_W, 2, [90, 86, 100]);
  wrect(0, ROAD_Y1 - 2, WORLD_W, 2, [90, 86, 100]);
  for (let x = 6; x < WORLD_W; x += 22) wrect(x, ROAD_Y0 + 9, 10, 2, [230, 220, 120]);
  wrect(0, ROAD_Y1, WORLD_W, 3, [214, 196, 156]);   // shoulder
  drawPier();
  drawBoats();
  // houses face the promenade (owned ones get the owner's roof color)
  for (const c of allCrabs())
    if (!c.p.homeless) wblit(HOUSES2[c.p.color % HOUSES2.length], HOUSE_XS[c.p.house], HOME_BOTTOM - HOUSES2[0].h);
  // the town job board
  wblit(NOTICE2, JOB_BOARD_X, HOME_BOTTOM - NOTICE2.h);
  if (JOB_BOARD_X - camX > -60 && JOB_BOARD_X - camX < W) {
    smallText(ctx, "JOBS", JOB_BOARD_X + 5 - camX, HOME_BOTTOM - NOTICE2.h - 7, [30, 20, 36]);
    smallText(ctx, "JOBS", JOB_BOARD_X + 4 - camX, HOME_BOTTOM - NOTICE2.h - 8, [255, 230, 120]);
    if (jobBoard.length)
      smallText(ctx, "" + jobBoard.length, JOB_BOARD_X + 26 - camX, HOME_BOTTOM - NOTICE2.h - 8, [255, 150, 60]);
  }
  // the crab shelter
  wblit(SHELTER2, SHELTER_X, HOME_BOTTOM - SHELTER2.h);
  if (SHELTER_X - camX > -80 && SHELTER_X - camX < W) {
    smallText(ctx, "SHELTER", SHELTER_X + 22 - camX, HOME_BOTTOM - SHELTER2.h + 3, [30, 20, 36]);
    smallText(ctx, "SHELTER", SHELTER_X + 21 - camX, HOME_BOTTOM - SHELTER2.h + 2, [240, 235, 220]);
  }
  // the town remembers: driftwood memorials on the dune west of the shelter
  for (const m of memorials) wblit(MEMORIAL, m.x, 150 - MEMORIAL.h);
  // bus stops on the shoulder
  for (const s of BUS_STOPS) wblit(BUS_STOP, s - 3, ROAD_Y1 + 3);
  // scenery fills the beach pockets between lots
  wblit(PALM, 534, 134); wblit(PALM, 960, 132, true); wblit(PALM, 1035, 136); wblit(PALM, 1560, 134); wblit(PALM, 1900, 130, true); wblit(PALM, 1965, 136);
  wblit(UMBRELLA, 1050, 150); wblit(UMBRELLA, 1620, 152); wblit(UMBRELLA, 1830, 151);
  // parked vehicles: buggies pull off on the shoulder, bikes rack on the apron
  for (const c of crabs) {
    if (c.dayState !== "working") continue;
    const b = BIZ[c.p.job];
    if (c.p.mode === "buggy") wblit(BUGGIES2[c.p.color], b.park + c.p.house * 18, ROAD_Y1 - BUGGIES2[0].h + 2);
    if (c.p.mode === "bike") wblit(BIKE, b.rack + c.p.house * 7 - 4, FLOOR_Y - 10);
  }
  // businesses
  for (const key of Object.keys(BIZ)) if (bizUnlocked(key)) drawBusiness(key);
}

const STATION_ART = { crate: CRATE, board: BOARD, grill: GRILL, pass: PASS,
  taps: TAPS, stall: null, scrub: SCRUB, towel: COUNTER,
  booth: TOKEN_BOOTH, claw: null, skee: SKEEBALL, prize: PRIZE_COUNTER };

function drawBusiness(key) {
  const b = BIZ[key];
  if (b.x1 - camX < -30 || b.x0 - camX > W + 30) return;
  // --- the lot: one continuous apron from the road shoulder past the walk line ---
  const ax0 = b.x0 - 6, ax1 = b.x1 + 6;
  const apron = b.kind === "palapa" ? [226, 190, 138] : [214, 226, 234];
  const apronDark = b.kind === "palapa" ? [204, 168, 116] : [192, 206, 216];
  wrect(ax0, ROAD_Y1 + 3, ax1 - ax0, 170 - ROAD_Y1 - 3, apron);
  if (b.kind === "palapa") {           // deck planks
    for (let y = ROAD_Y1 + 5; y < 168; y += 5) wrect(ax0, y, ax1 - ax0, 1, apronDark);
  } else {                             // checker tile
    for (let y = ROAD_Y1 + 3; y < 168; y += 6)
      for (let x = ax0 + (((y / 6) | 0) % 2) * 6; x < ax1; x += 12) wrect(x, y, 6, 6, apronDark);
  }
  wrect(ax0, ROAD_Y1 + 3, 1, 170 - ROAD_Y1 - 3, [170, 145, 105]);   // curb edges
  wrect(ax1 - 1, ROAD_Y1 + 3, 1, 170 - ROAD_Y1 - 3, [170, 145, 105]);

  // --- open-front building: back wall + roof; stations sit inside on the lot floor ---
  if (b.kind === "palapa") {
    // thatch roof over an open pavilion, grounded on the deck
    wrect(b.x0 - 4, 110, b.x1 - b.x0 + 8, 2, [246, 214, 140]);
    wrect(b.x0 - 4, 112, b.x1 - b.x0 + 8, 8, [230, 190, 110]);
    for (let x = b.x0 - 4; x < b.x1 + 4; x += 5) {
      wrect(x + 1, 114, 1, 5, [200, 160, 90]);
      wrect(x, 120, 3, 2 + ((x * 7) % 3), [230, 190, 110]);
    }
    // back railing between the posts (with a gap on the road side for deliveries)
    wrect(b.x0 + 2, 128, b.x1 - b.x0 - 6, 2, [170, 120, 70]);
    for (let x = b.x0 + 4; x < b.x1 - 6; x += 9) wrect(x, 128, 1, 8, [150, 100, 60]);
    wrect(b.x0 + 2, 136, b.x1 - b.x0 - 6, 1, [150, 100, 60]);
    wrect(b.x0 + 2, 122, 3, LOT_BOTTOM - 122, [140, 90, 50]);       // posts
    wrect(b.x1 - 5, 122, 3, LOT_BOTTOM - 122, [140, 90, 50]);
    wrect((b.x0 + b.x1) / 2 - 1, 122, 3, LOT_BOTTOM - 122, [140, 90, 50]);
  } else {
    // flat roof + back wall with high windows; no front wall (dollhouse cutaway)
    wrect(b.x0 - 2, 104, b.x1 - b.x0 + 4, 4, [70, 60, 90]);
    wrect(b.x0 - 2, 108, b.x1 - b.x0 + 4, 2, [30, 20, 36]);
    wrect(b.x0, 110, b.x1 - b.x0, LOT_BOTTOM - 110, [235, 245, 250]);
    wrect(b.x0, LOT_BOTTOM - 2, b.x1 - b.x0, 2, [190, 205, 215]);
    for (let x = b.x0 + 8; x < b.x1 - 14; x += 30) {   // windows on the back wall
      wrect(x, 114, 16, 12, [30, 20, 36]);
      wrect(x + 1, 115, 14, 10, [150, 215, 240]);
      wrect(x + 2, 116, 5, 3, [220, 245, 255]);
    }
    for (let x = b.x0; x < b.x1; x += 8)               // awning across the open front
      wrect(x, 110, 8, 5, ((x / 8) | 0) % 2 ? [96, 200, 255] : [250, 250, 255]);
    wrect(b.x0, 110, 1, LOT_BOTTOM - 110, [30, 20, 36]);   // side walls
    wrect(b.x1 - 1, 110, 1, LOT_BOTTOM - 110, [30, 20, 36]);
  }

  // --- sign riding the roofline ---
  const signW = textWidth(b.sign) + 14;
  const signX = (b.x0 + b.x1) / 2 - signW / 2;
  wrect(signX + 6, 104, 3, 12, [90, 60, 40]);          // sign posts down to the shoulder
  wrect(signX + signW - 9, 104, 3, 12, [90, 60, 40]);
  wrect(signX, 92, signW, 12, [140, 90, 50]);
  wrect(signX + 1, 93, signW - 2, 10, key === "shack" ? [190, 140, 80] : [96, 170, 220]);
  if (signX + signW - camX > 0 && signX - camX < W)
    textShadow(ctx, b.sign, signX + 7 - camX, 95, [255, 250, 240], [70, 50, 40]);
  if (!shackOpen()) {
    wrect(signX + signW / 2 - 23, 118, 46, 11, [30, 20, 36]);
    text(ctx, "CLOSED", signX + signW / 2 - 18 - camX, 120, [255, 120, 120]);
  }
}

function drawStation(key, kind, i) {
  const st = BIZ[key].stations[kind][i];
  const isBusy = busy[key] && busy[key][kind] && busy[key][kind][i];
  let art = STATION_ART[kind];
  if (kind === "claw") art = CLAW_MACHINE[isBusy ? ((time * 4) | 0) % 2 : 0];
  if (kind === "stall") art = STALL[isBusy ? 1 : 0];
  wblit(art, st.x, st.y - art.h);
  if (kind === "grill" && isBusy) {
    wblit(FLAME[((time * 8) | 0) % 2], st.x + 6, st.y - GRILL.h - 4);
    // a wisp of smoke curls off the hot grill
    for (let i = 0; i < 3; i++) {
      const ph = (time * 0.55 + i * 0.37 + st.x * 0.011) % 1;
      if (ph > 0.8) continue;
      const sx = st.x + 7 + i * 2 + ((Math.sin(time * 1.2 + i * 2.1 + st.x) * 2) | 0);
      const sy = st.y - GRILL.h - 8 - ph * 12;
      const s = ph < 0.45 ? 2 : 1;
      wrect(sx, sy, s, s, ph < 0.3 ? [168, 168, 182] : [206, 206, 220]);
    }
  }
}

let _swoopT = 99;
function drawSwoop() {
  // every so often a gull dives at the snack queue
  const T = time % 41;
  if (T < _swoopT && darkness() <= 0.5) sfx.gull();   // one cry per dive
  _swoopT = T;
  if (T > 5.5 || darkness() > 0.5) return;
  const t = T / 5.5;
  const wx2 = BIZ.shack.queueX + 180 - t * 220;
  const gy = 34 + Math.sin(t * Math.PI) * 100;
  wblit(GULL[((time * 6) | 0) % 2], wx2, gy);
}
function drawBus() {
  const by = ROAD_Y1 - BUS2.h - 1;
  wblit(BUS2, bus.x, by, bus.dir < 0);
  const riders = crabs.filter(c => c.cstate === "onBus");
  for (let i = 0; i < Math.min(riders.length, 5); i++) {
    const wx2 = bus.x + 8 + i * 12;
    wrect(wx2, by + 6, 2, 2, [30, 20, 36]);
    wrect(wx2 + 4, by + 6, 2, 2, [30, 20, 36]);
    wrect(wx2 + 1, by + 4, 4, 1, CRAB_COLORS[riders[i].p.color][0]);
  }
}

// toque on duty, personal accessory otherwise; fishers never cook
function crabHat(c) { return c.duty && !c.p.fisher ? "toque" : c.p.acc; }

function drawCrab(c) {
  if (c.hidden) return;
  const arts = CRAB_ARTS[c.p.color];
  const riding = c.cstate === "drive" && (c.dayState === "toWork" || c.dayState === "toHome");
  if (riding && c.p.mode === "buggy") {
    wblit(BUGGIES2[c.p.color], c.x - 16, ROAD_Y1 - BUGGIES2[0].h, c.flip);
    return;
  }
  const working = (c.kstate === "work" || c.kstate === "cleaningStall") && c.dayState === "working";
  const moving = c.dayState !== "home" || Math.hypot((c.tx || c.x) - c.x, (c.ty || c.y) - c.y) > 2;
  const sleeping = !moving && c.dayState === "home" && darkness() > 0.7;
  let art;
  if (sleeping) art = arts.s;
  else if (working) art = ((c.animT * 6) | 0) % 2 ? arts.w : arts.a;
  else if (moving) art = ((c.animT * 8) | 0) % 2 ? arts.a : arts.b;
  else art = arts.a;
  const bob = sleeping ? (Math.sin(time * 1.6 + c.animT) > 0 ? 1 : 0)   // slow breathing
    : working ? -(((c.animT * 6) | 0) % 2) : 0;
  let y = c.y - 12 + bob;
  if (riding && c.p.mode === "bike") {
    wblit(BIKE, c.x - 2, ROAD_Y1 - 8, c.flip);
    y = ROAD_Y1 - 8 - 11;
    wblit(art, c.x, y, c.flip);
  } else {
    wblit(art, c.x, y, c.flip);
  }
  // hat: toque on duty, personal accessory otherwise (fishers keep their own)
  const accKey = crabHat(c);
  const acc = ACCESSORIES[accKey];
  if (acc) {
    const ax = c.flip ? 16 - acc.dx - acc.art.w : acc.dx;
    wblit(acc.art, c.x + ax, y + acc.dy, c.flip);
  }
  if ((c.p.dirt || 0) >= 0.66) wblit(DIRT, c.x, y, c.flip);
  if (sleeping) {   // a little Z drifts up from the shell
    const ph = (time * 0.45 + c.animT * 0.37) % 1;
    if (ph < 0.75) {
      const zx = c.x + 13 + ((Math.sin(ph * 9 + c.animT) * 2) | 0) - camX;
      if (zx > -4 && zx < W) smallText(ctx, "Z", zx, y - 2 - ph * 13, ph < 0.4 ? [200, 210, 235] : [150, 160, 195]);
    }
  }
  if (c.p.sick && ((c.animT * 2) | 0) % 2) wblit(SICK_MARK, c.x + 10, y - 8);
  if (c.p.job === "fishing" && c.dayState === "working") wblit(ROD[((c.animT * 2) | 0) % 2], c.x + 12, y - 3, c.flip);
  if (c.carrying) wblit(ITEMS[c.carrying], c.x + 4, y - 7);
  if (working && c.workMax > 0.7) {
    const frac = 1 - c.workT / c.workMax;
    wrect(c.x, y - 10, 16, 3, [30, 20, 36]);
    wrect(c.x + 1, y - 9, Math.round(14 * frac), 1, [96, 232, 120]);
  }
  // quip bubble
  if (c.quip && c.x - camX > -20 && c.x - camX < W + 20) {
    const tw = textWidth(c.quip.text) + 6;
    let bx = c.x + 8 - tw / 2 - camX;
    bx = Math.max(1, Math.min(bx, W - tw - 1));
    const by = y - 22;
    rect(ctx, bx, by, tw, 11, [30, 20, 36]);
    rect(ctx, bx + 1, by + 1, tw - 2, 9, [255, 255, 255]);
    rect(ctx, c.x + 6 - camX, by + 11, 2, 2, [255, 255, 255]);
    text(ctx, c.quip.text, bx + 3, by + 2, [40, 30, 40]);
  }
}

function drawCustomer(k) {
  {
    if (!k.isCrab) {
      k.animT += 0.016;
      const arts = CRAB_ARTS[k.color];
      if (k.state === "showering") return;   // behind the curtain (stall draws the bather)
      const moving = k.state !== "waiting";
      const art = moving && ((k.animT * 8) | 0) % 2 ? arts.b : arts.a;
      const flip = k.state !== "leaving";
      const cy = FLOOR_Y - 12 - 26 * (k.climb || 0);
      wblit(art, k.x, cy, flip);
      const acc = ACCESSORIES[k.acc];
      if (acc) {
        const ax = flip ? 16 - acc.dx - acc.art.w : acc.dx;
        wblit(acc.art, k.x + ax, cy + acc.dy, flip);
      }
      if (k.state === "waiting") {
        const nm = k.name.split(" ")[0].slice(0, 4);   // 4 chars fits the 13px queue slots
        const nx = k.x + 8 - smallTextWidth(nm) / 2 - camX;
        if (nx > -30 && nx < W) smallText(ctx, nm, nx, FLOOR_Y + 2, [100, 80, 55]);
      }
    }
    if ((k.state === "waiting" || k.state === "seatedWaiting") && !k.served) {
      const bx = k.x - camX - 1, by = FLOOR_Y - 36;
      if (bx > -16 && bx < W) {
        rect(ctx, bx, by, 14, 13, [30, 20, 36]);
        rect(ctx, bx + 1, by + 1, 12, 11, [255, 255, 255]);
        rect(ctx, bx + 5, by + 13, 2, 2, [255, 255, 255]);
        blit(ctx, ITEMS[k.recipe.icon], bx + 2, by + 2);
        const frac = k.patience / k.maxPatience;
        const col = frac > 0.5 ? [96, 232, 120] : frac > 0.25 ? [255, 216, 96] : [255, 80, 80];
        rect(ctx, bx, by - 4, 14, 3, [30, 20, 36]);
        rect(ctx, bx + 1, by - 3, Math.round(12 * frac), 1, col);
      }
    }
  }
}

function drawNight() {
  const dark = darkness();
  if (dark <= 0) return;
  ctx.fillStyle = `rgba(16,20,64,${0.45 * dark})`;
  ctx.fillRect(0, 0, W, PANEL_Y);
  if (dark > 0.5) {
    for (const c of crabs) {
      if (c.dayState !== "home" || c.hidden) continue;
      if (c.p.homeless) { wrect(SHELTER_X + 8, 130, 8, 6, [255, 216, 96]); wrect(SHELTER_X + 50, 130, 8, 6, [255, 216, 96]); }
      else wrect(HOUSE_XS[c.p.house] + 38, 132, 10, 8, [255, 216, 96]);
    }
    // a cabin lamp burns on each occupied live-aboard
    for (const c of allCrabs())
      if (c.p.boat != null && c.dayState === "home" && !c.hidden)
        wrect(BOAT_BERTHS[c.p.boat].x + 7, BOAT_Y + 11, 3, 3, [255, 216, 96]);
    if (dark > 0.65) {
      for (let i = 0; i < 6; i++) {
        if (((time * 3 + i) | 0) % 4 === 0) continue;
        const fx = 480 + i * 260 + Math.sin(time * 0.31 + i * 2.1) * 55;
        const fy = 148 + Math.sin(time * 0.73 + i * 1.3) * 9;
        wrect(fx, fy, 1, 1, [190, 255, 140]);
      }
    }
  }
  // string lights on the shack at night
  if (dark > 0.4) {
    for (let x = BIZ.shack.x0 + 4; x < BIZ.shack.x1; x += 10) {
      const c = [[255, 120, 120], [255, 220, 120], [120, 255, 160], [130, 180, 255]][((x / 10) | 0) % 4];
      const sx = x - camX;
      if (sx > 0 && sx < W) rect(ctx, sx, 115 + ((x / 10) | 0) % 2, 2, 2, c);
    }
  }
}

function crabMood(c) {
  if (c.p.homeless) return ["DOWN", [190, 80, 80]];
  if (c.p.wallet < 10) return ["BROKE", [190, 80, 80]];
  if (c.p.wallet > 120) return ["FLUSH", [180, 140, 30]];
  if ((c.p.hunger || 0) > 0.7) return ["HUNGRY", [200, 110, 40]];
  if (darkness() > 0.7 && c.dayState !== "home") return ["TIRED", [120, 120, 140]];
  if (darkness() > 0.7 && c.dayState === "home") return ["COZY", [180, 120, 60]];
  if (c.dayState === "working" && c.kstate === "work") return ["BUSY", [40, 110, 190]];
  return ["SUNNY", [40, 150, 70]];
}
function custStatus(k) {
  const b = BIZ[k.biz] ? BIZ[k.biz].name : "TOWN";
  if (k.state === "arriving") return "HEADING TO THE " + b;
  if (k.state === "waiting") return "IN LINE AT THE " + b;
  if (k.state === "toSeat") return "FINDING A SEAT";
  if (k.state === "seatedWaiting") return "WAITING ON THEIR ORDER";
  if (k.state === "dining") return "EATING " + (ITEM_NAMES[k.recipe.icon] || "LUNCH");
  if (k.state === "waitStall" || k.state === "toStall" || k.state === "outStall") return "AT THE SHOWERS";
  if (k.state === "leaving") return k.happy ? "HEADING HOME HAPPY" : k.served ? "HEADING HOME" : "LEAVING IN A HUFF";
  return "ENJOYING THE BEACH";
}
function drawCustCard(k) {
  const wcard = 128;
  rect(ctx, 2, 2, wcard, 52, [30, 20, 36]);
  rect(ctx, 3, 3, wcard - 2, 50, [255, 250, 235]);
  rect(ctx, 5, 6, 20, 26, [245, 225, 200]);
  blit(ctx, CRAB_ARTS[k.color].a, 7, 14);
  const acc = ACCESSORIES[k.acc];
  if (acc) blit(ctx, acc.art, 7 + acc.dx, 14 + acc.dy);
  text(ctx, k.name.split(" ")[0].slice(0, 9), 29, 5, [40, 30, 40]);
  const mood = !k.served && k.patience < 15 ? ["STEAMED", [190, 80, 80]]
    : k.happy || k.served ? ["HAPPY", [40, 150, 70]] : ["VISITING", [110, 110, 130]];
  smallText(ctx, mood[0], 126 - smallTextWidth(mood[0]), 6, mood[1]);
  smallText(ctx, "TOURIST - IN TOWN FOR THE DAY", 29, 13, [120, 90, 60]);
  smallText(ctx, custStatus(k).slice(0, 26), 29, 21, [30, 110, 60]);
  smallText(ctx, "WANTS: " + (ITEM_NAMES[k.recipe.icon] || "?") + " $" + k.recipe.pay, 29, 28, [140, 110, 40]);
  smallText(ctx, "PATIENCE", 6, 44, [110, 110, 130]);
  rect(ctx, 40, 45, 60, 4, [30, 20, 36]);
  const pf = Math.max(0, Math.min(1, k.patience / (k.maxPatience || 50)));
  rect(ctx, 41, 46, Math.round(58 * pf), 2, pf > 0.5 ? [96, 200, 120] : pf > 0.25 ? [235, 200, 90] : [235, 90, 90]);
  smallText(ctx, "MORE>", 126 - smallTextWidth("MORE>"), 48, [150, 140, 160]);
}
function drawFollowCard() {
  if (dossier) return;   // the full record is open - don't double up
  if (followCust) { drawCustCard(followCust); return; }
  const c = followNpc || (followIdx >= 0 && crabs[followIdx]);
  if (!c) return;
  const p = c.p;
  const wcard = 128;
  rect(ctx, 2, 2, wcard, 52, [30, 20, 36]);
  rect(ctx, 3, 3, wcard - 2, 50, [255, 250, 235]);
  rect(ctx, 5, 6, 20, 26, [200, 230, 245]);
  blit(ctx, CRAB_ARTS[p.color].a, 7, 14);
  const acc = ACCESSORIES[crabHat(c)];
  if (acc) blit(ctx, acc.art, 7 + acc.dx, 14 + acc.dy);
  text(ctx, p.name, 29, 5, [40, 30, 40]);
  const [mood, mcol] = crabMood(c);
  smallText(ctx, mood, 126 - smallTextWidth(mood), 6, mcol);
  smallText(ctx, "MORE>", 126 - smallTextWidth("MORE>"), 48, [150, 140, 160]);
  smallText(ctx, TRAITS[p.trait].label + " " + MODES[p.mode].label, 29, 13, [120, 90, 60]);
  smallText(ctx, crabStatus(c), 29, 21, [30, 110, 60]);
  smallText(ctx, "SHIFT " + SHIFTS[p.shift].label, 29, 28, [110, 110, 130]);
  const wTxt = "$" + fmt(Math.max(0, p.wallet));
  const wx3 = 126 - textWidth(wTxt, 5);
  text(ctx, wTxt, wx3, 28, p.homeless ? [190, 80, 80] : [140, 110, 40], 5);
  const trend = p.walletPrev == null ? 0 : p.wallet - p.walletPrev;
  if (trend) smallText(ctx, trend > 0 ? "+" : "-", wx3 - 6, 29, trend > 0 ? [40, 150, 70] : [190, 80, 80]);
  // job + needs
  const jobTag = p.owner ? "OWN" : p.job === "fishing" ? "PIER" : BIZ[p.job].short;   // live job, not the old trade
  smallText(ctx, "JOB:" + jobTag, 6, 36, [70, 90, 130]);
  if (UPS.arcade.lvl > 0) {
    rect(ctx, 58, 35, 28, 8, [96, 170, 220]);
    smallText(ctx, "JOB>", 60, 36, [255, 255, 255]);
  }
  const eff = crabEff(c) * (p.sick ? 0.5 : 1);   // illness halves everything - show it
  if (eff < 0.995)
    smallText(ctx, "PACE " + Math.round(eff * 100) + "%", 74, 36, eff < 0.8 ? [190, 80, 80] : [200, 110, 40]);
  const bars = [["FED", 1 - (p.hunger || 0), 6], ["CLN", 1 - (p.dirt || 0), 37],
    ["FUN", 1 - (p.bored || 0), 68], ["SPA", 1 - (p.sandy || 0), 99]];
  for (const [label, frac, bx] of bars) {
    smallText(ctx, label, bx, 44, [110, 110, 130]);
    rect(ctx, bx + 12, 45, 14, 4, [30, 20, 36]);
    rect(ctx, bx + 13, 46, Math.round(12 * frac), 2,
      frac > 0.5 ? [96, 200, 120] : frac > 0.25 ? [235, 200, 90] : [235, 90, 90]);
  }
}

function drawPanel() {
  rect(ctx, 0, PANEL_Y, W, H - PANEL_Y, [58, 42, 38]);
  rect(ctx, 0, PANEL_Y, W, 1, [120, 90, 70]);
  blit(ctx, COIN, 4, PANEL_Y + 2);
  textShadow(ctx, "$" + fmt(coins), 13, PANEL_Y + 2, [255, 230, 120], [30, 20, 20]);
  text(ctx, "D" + day + " " + clockStr(), 84, PANEL_Y + 2, [220, 210, 190]);
  rect(ctx, 146, PANEL_Y + 1, 19, 11, muted ? [140, 50, 50] : [30, 20, 20]);
  rect(ctx, 147, PANEL_Y + 2, 17, 9, muted ? [90, 35, 35] : [90, 70, 60]);
  blit(ctx, muted ? SPEAKER_OFF : SPEAKER_ON, 150, PANEL_Y + 3);
  smallText(ctx, "MUS", 169, PANEL_Y + 3, !muted && musicOn ? [140, 220, 140] : [140, 120, 110]);
  smallText(ctx, "SND", 190, PANEL_Y + 3, !muted && soundOn ? [140, 220, 140] : [140, 120, 110]);
  smallText(ctx, ">>", 206, PANEL_Y + 3, ffMode === 1 ? [255, 230, 120] : [150, 132, 122]);
  smallText(ctx, ">>>", 219, PANEL_Y + 3, ffMode === 2 ? [255, 230, 120] : [150, 132, 122]);
  smallText(ctx, ">>>>", 236, PANEL_Y + 3, ffMode === 3 ? [255, 230, 120] : [150, 132, 122]);
  // tabs
  for (const [i, t] of [["crew", 0], ["shop", 1]].map((v, i) => [i, v[0]])) {
    const x = 4 + i * 34, active = tab === t;
    rect(ctx, x, TAB_Y, 32, TAB_H, active ? [190, 140, 80] : [90, 70, 60]);
    smallText(ctx, t.toUpperCase(), x + 4, TAB_TX, active ? [40, 24, 16] : [160, 140, 130]);
  }
  const rate = incomeRate();
  const rateTxt = rate >= 100 ? "$" + Math.round(rate) + "/S" : "$" + rate.toFixed(1) + "/S";
  text(ctx, rateTxt.slice(0, 7), 84, TAB_TX, [170, 150, 135]);
  {
    const conf = newConfirmT > 0;
    rect(ctx, 128, TAB_Y, 30, TAB_H, conf ? [140, 40, 40] : [90, 70, 60]);
    smallText(ctx, conf ? "SURE?" : "NEW", 128 + (conf ? 3 : 7), TAB_TX, conf ? [255, 200, 200] : [160, 140, 130]);
  }
  const due = nightlyDue() + creditDueTonight();
  const rTxt = "BILL $" + fmt(due) + (credit.bal > 0 ? " D$" + fmt(Math.round(credit.bal)) : "");
  const chipW = textWidth(rTxt, 5) + 8;
  const crunch = coins < due && tmin >= 18 * 60 && tmin < 20 * 60 && ((time * 2) | 0) % 2;
  rect(ctx, 252 - chipW, TAB_Y - 1, chipW, TAB_H + 1, crunch ? [150, 40, 40] : tab === "menu" ? [190, 140, 80] : [90, 70, 60]);
  text(ctx, rTxt, 252 - chipW + 4, TAB_TX - 1, coins < due ? [255, 140, 140] : tab === "menu" ? [40, 24, 16] : [200, 185, 170], 5);

  if (tab === "menu") {
    smallText(ctx, "MENU - PRICE / COST", 4, ROW_Y, [230, 215, 195]);
    let my = ROW_Y + MROW + 1;
    for (const key of Object.keys(BIZ)) {
      if (!bizUnlocked(key)) continue;
      for (const r of BIZ[key].recipes) {
        smallText(ctx, ITEM_NAMES[r.icon], 4, my, [190, 175, 160]);
        smallText(ctx, "$" + r.pay + " / $" + INGREDIENT_COST[r.raw], 72, my, [140, 200, 150]);
        my += MROW;
      }
    }
    smallText(ctx, "TONIGHT AT 20:00", 132, ROW_Y, [230, 215, 195]);
    let by = ROW_Y + MROW + 1;
    smallText(ctx, "WAGES " + crabs.length + "X$" + CRAB_WAGE, 132, by, [190, 175, 160]);
    smallText(ctx, "$" + CRAB_WAGE * crabs.length, 224, by, [235, 160, 130]); by += MROW;
    for (const key of Object.keys(BIZ)) {
      if (!bizUnlocked(key)) continue;
      smallText(ctx, BIZ[key].short + " RENT", 132, by, [190, 175, 160]);
      smallText(ctx, "$" + BIZ[key].rent, 224, by, [235, 160, 130]); by += MROW;
    }
    if (credit.bal > 0) {
      smallText(ctx, "LOAN PAYMENT", 132, by, [190, 175, 160]);
      smallText(ctx, "$" + creditDueTonight(), 224, by, [235, 160, 130]); by += MROW;
      smallText(ctx, "DEBT AT " + Math.round(CREDIT_CFG.RATE * 100) + "%/NT", 132, by, [190, 175, 160]);
      smallText(ctx, "$" + fmt(Math.round(credit.bal)), 224, by, [235, 130, 130]); by += MROW;
    }
    smallText(ctx, "TOTAL", 132, by, [230, 215, 195]);
    smallText(ctx, "$" + fmt(due), 224, by, coins < due ? [255, 140, 140] : [255, 230, 120]);
    smallText(ctx, "CRABS PAY THEIR OWN", 132, by + MROW + 2, [150, 135, 125]);
    smallText(ctx, "$" + HOUSE_RENT + " HOUSE RENT", 132, by + 2 * MROW + 2, [150, 135, 125]);
  } else if (tab === "shop") {
    for (const b of BUTTONS) {
      const key = buttonKey(b);
      if (!key) continue;   // the laundromat's old slot sits empty until the juice bar lands
      const u = UPS[key];
      const maxed = u.lvl >= u.max, cost = upCost(u);
      const afford = coins >= cost && !maxed;
      rect(ctx, b.x, b.y, b.w, b.h, [30, 20, 20]);
      rect(ctx, b.x + 1, b.y + 1, b.w - 2, b.h - 2, afford ? [190, 140, 80] : [96, 78, 68]);
      const nameCol = afford ? [40, 24, 16] : [160, 145, 135];
      const lvl = key === "chef" ? String(u.lvl) : (u.lvl > 0 ? String(u.lvl) : "");
      smallText(ctx, u.name + (lvl ? " " + lvl : ""), b.x + 3, b.y + (TALL ? 5 : 2), nameCol);
      text(ctx, maxed ? "MAX" : "$" + fmt(cost), b.x + 3, b.y + (TALL ? 14 : 10), maxed ? [160, 145, 135] : afford ? [80, 45, 20] : [140, 125, 115], 5);
    }
  } else {
    for (let i = 0; i < crabs.length; i++) {
      const c = crabs[i], bx = 4 + i * CARD_STEP;
      const sel = followIdx === i;
      rect(ctx, bx, ROW_Y, CARD, CARD, sel ? [255, 230, 120] : [30, 20, 20]);
      rect(ctx, bx + 1, ROW_Y + 1, CARD - 2, CARD - 2, [200, 230, 245]);
      const hat = c.duty ? "toque" : c.p.acc, acc = ACCESSORIES[hat];
      if (TALL) {   // room for the full 2x portrait
        blit(ctx, art2("c" + c.p.color, CRAB_ARTS[c.p.color].a), bx + 1, ROW_Y + 7);
        if (acc) blit(ctx, art2("a" + hat, acc.art), bx + 1 + acc.dx * 2, ROW_Y + 7 + acc.dy * 2);
      } else {
        blit(ctx, CRAB_ARTS[c.p.color].a, bx + 4, ROW_Y + 7);
        if (acc) blit(ctx, acc.art, bx + 4 + acc.dx, ROW_Y + 7 + acc.dy);
      }
      rect(ctx, bx + CARD - 6, ROW_Y + 2, 4, 4, c.p.sick ? [130, 220, 110] : c.duty ? [96, 232, 120] : [150, 140, 140]);
      smallText(ctx, c.p.name.slice(0, TALL ? 8 : 5), bx + 1, ROW_Y + CARD + 1, [220, 210, 190]);
    }
    if (!crabs.length) text(ctx, "NO CREW YET", 8, ROW_Y + 7, [190, 170, 150]);
  }
}

function drawFloaters(dt) {
  for (const f of floaters) {
    f.t -= dt; f.y -= 14 * dt;
    const raw = f.x - camX;
    if (raw < -30 || raw > W + 30) continue;   // offscreen event: no ghost text at the edges
    const fx = Math.max(2, Math.min(raw, W - textWidth(f.text) - 2));
    textShadow(ctx, f.text, fx, f.y, f.color, [30, 20, 36]);
  }
  floaters = floaters.filter(f => f.t > 0);
}
function drawIntro() {
  ctx.fillStyle = "rgba(16,20,50,0.5)";
  ctx.fillRect(0, 0, W, H);
  const cw = 200, cx2 = W / 2 - cw / 2;
  rect(ctx, cx2 - 2, 22, cw + 4, 152, [30, 20, 36]);
  rect(ctx, cx2, 24, cw, 148, [255, 250, 235]);
  textShadow(ctx, "THE LEASE", W / 2 - textWidth("THE LEASE") / 2, 30, [120, 70, 30], [220, 200, 170]);
  blit(ctx, LANDLORD_ART.a, cx2 + 8, 42);
  blit(ctx, ACCESSORIES.shades.art, cx2 + 8 + 1, 42 + 1);
  text(ctx, "MR. PINCHERTON'S TERMS:", cx2 + 30, 44, [90, 60, 40]);
  const terms = [
    ["THE SHACK IS YOURS TO RUN", [70, 70, 90]],
    ["RENT: $" + BIZ.shack.rent + ", NIGHTLY AT 20:00", [170, 50, 50]],
    ["RENT IS DUE TONIGHT. GOOD LUCK.", [170, 50, 50]],
    ["CREW WAGES: $" + CRAB_WAGE + " EACH, NIGHTLY", [70, 70, 90]],
    ["CREW PAY THEIR OWN $" + HOUSE_RENT + " HOME RENT", [70, 70, 90]],
    ["MISS RENT AND I TAKE THE SHACK", [170, 50, 50]],
  ];
  for (let i = 0; i < terms.length; i++)
    text(ctx, "- " + terms[i][0], cx2 + 6, 60 + i * 11, terms[i][1]);
  text(ctx, "GOOD LUCK. I'LL COME COLLECT.", cx2 + 6, 60 + terms.length * 11 + 3, [110, 90, 80]);
  const bx = W / 2 - 56;
  rect(ctx, bx, 152, 112, 18, [30, 20, 36]);
  rect(ctx, bx + 1, 153, 110, 16, [190, 140, 80]);
  text(ctx, "SIGN WITH A CLAW", bx + 9, 158, [40, 24, 16]);
}
function drawLandlord() {
  const t0 = 19.5 * 60;
  if (screen !== "play" || tmin < t0 || tmin > 20 * 60 + 30) return;
  const t = Math.min(1, (tmin - t0) / 20);
  const lx = BIZ.shack.stations.pass[0].x + 96 - t * 66;
  const ly = FLOOR_Y - 12;
  wblit(LANDLORD_ART.a, lx, ly, true);
  wblit(ACCESSORIES.shades.art, lx + 1, ly + 1, true);
  if (t >= 1) {
    const msg = tmin < 20 * 60 ? "RENT TIME!" : (coins >= 0 ? "PLEASURE." : "");
    if (msg) {
      const tw = textWidth(msg) + 6;
      let bx = lx + 8 - tw / 2 - camX;
      bx = Math.max(1, Math.min(bx, W - tw - 1));
      rect(ctx, bx, ly - 22, tw, 11, [30, 20, 36]);
      rect(ctx, bx + 1, ly - 21, tw - 2, 9, [255, 240, 200]);
      text(ctx, msg, bx + 3, ly - 20, [120, 70, 20]);
    }
  }
}
function drawTitle() {
  ctx.fillStyle = "rgba(16,20,50,0.35)";
  ctx.fillRect(0, 0, W, H);
  rect(ctx, 0, PANEL_Y, W, H - PANEL_Y, [58, 42, 38]);
  // logo card
  const lw = 168;
  rect(ctx, W / 2 - lw / 2 - 2, 26, lw + 4, 62, [30, 20, 36]);
  rect(ctx, W / 2 - lw / 2, 28, lw, 58, [255, 250, 235]);
  bigText(ctx, "CRAB SHACK", W / 2 - textWidth("CRAB SHACK"), 34, [230, 72, 88], 2, [120, 30, 40]);
  bigText(ctx, "3", W / 2 - 9, 54, [40, 140, 220], 3, [20, 70, 120]);
  blit(ctx, CRAB_ARTS[0].a, W / 2 - 60, 58);
  blit(ctx, ACCESSORIES.toque.art, W / 2 - 60 + 4, 54);
  blit(ctx, CRAB_ARTS[1].a, W / 2 + 44, 58, true);
  blit(ctx, ACCESSORIES.flower.art, W / 2 + 44, 55);
  smallText(ctx, "A WHOLE IDLE BEACH ECONOMY", W / 2 - 64, 76, [110, 90, 80]);
  // menu
  const bx = W / 2 - 50;
  if (hasSave) {
    rect(ctx, bx, 118, 100, 16, [30, 20, 36]);
    rect(ctx, bx + 1, 119, 98, 14, [190, 140, 80]);
    text(ctx, "CONTINUE", bx + 27, 123, [40, 24, 16]);
  }
  const ny = hasSave ? 138 : 122;
  const conf = newConfirmT > 0;
  rect(ctx, bx, ny, 100, 16, [30, 20, 36]);
  rect(ctx, bx + 1, ny + 1, 98, 14, conf ? [150, 60, 60] : [120, 100, 80]);
  text(ctx, conf ? "WIPE SAVE?" : "NEW GAME", bx + (conf ? 21 : 26), ny + 5, conf ? [255, 220, 220] : [235, 225, 210]);
  if (((time * 1.5) | 0) % 2) text(ctx, "CLICK TO PLAY", W / 2 - 38, 162, [255, 250, 235], 6);
  smallText(ctx, "MUSIC: PIXEL WAVE WALTZ - MATT CLANKER", 14, PANEL_Y + 8, [170, 150, 135]);
  smallText(ctx, "BUILT ON THE SNESCAT TOY PPU", 44, PANEL_Y + 20, [140, 120, 105]);
}
function drawGameOver() {
  ctx.fillStyle = "rgba(16,12,30,0.72)";
  ctx.fillRect(0, 0, W, H);
  const cx2 = W / 2;
  rect(ctx, cx2 - 88, 66, 176, 84, [30, 20, 36]);
  rect(ctx, cx2 - 86, 68, 172, 80, [255, 250, 235]);
  if (bankrupt) {
    textShadow(ctx, "BANKRUPT!", cx2 - textWidth("BANKRUPT!") / 2, 76, [230, 60, 70], [120, 30, 40]);
    text(ctx, "THE BANK CALLED IN THE", cx2 - 66, 92, [90, 60, 50], 6);
    text(ctx, "SHACK'S LINE OF CREDIT", cx2 - 65, 101, [90, 60, 50], 6);
    text(ctx, "DEBT UNPAID $" + fmt(Math.round(credit.bal)), cx2 - 66, 114, [140, 60, 60], 6);
  } else {
    textShadow(ctx, "EVICTED!", cx2 - textWidth("EVICTED!") / 2, 76, [230, 60, 70], [120, 30, 40]);
    text(ctx, "THE LANDLORD CRAB TOOK", cx2 - 66, 92, [90, 60, 50], 6);
    text(ctx, "BACK THE SHACK", cx2 - 41, 101, [90, 60, 50], 6);
    text(ctx, "NIGHTLY RENT OWED $" + fmt(totalRent()), cx2 - 66, 114, [140, 60, 60], 6);
  }
  smallText(ctx, "SURVIVED " + day + " DAYS  EARNED $" + fmt(lifetime), cx2 - 78, 124, [90, 90, 110]);
  const bl = ((time * 2) | 0) % 2;
  if (bl) text(ctx, "CLICK TO START OVER", cx2 - 56, 137, [40, 110, 60], 6);
}
function homeLabel(p) {
  if (p.boat != null) return ["LIVES ABOARD THE " + BOAT_NAMES[p.boat], [70, 140, 200]];
  if (p.homeless) return ["SLEEPS AT THE SHELTER", [190, 80, 80]];
  if (p.house >= 7) return ["BEACH COTTAGE BY THE PIER", [90, 140, 190]];
  if (p.house === 6) return ["HOUSE BY THE SHELTER", [90, 130, 90]];
  return ["HOUSE " + (p.house + 1) + " ON THE PROMENADE", [90, 130, 90]];
}
const _art2Cache = {};
function art2(key, art) {   // lazily scaled 2x art for the dossier portrait
  return _art2Cache[key] || (_art2Cache[key] = scale2(art));
}
function drawCustDossier(k) {
  const x = 24, y = 6, w2 = 208, h2 = 120;
  rect(ctx, x - 2, y - 2, w2 + 4, h2 + 4, [30, 20, 36]);
  rect(ctx, x, y, w2, h2, [255, 250, 235]);
  rect(ctx, x, y, w2, 32, [58, 42, 38]);
  rect(ctx, x + 4, y + 4, 40, 30, [245, 225, 200]);
  blit(ctx, art2("c" + k.color, CRAB_ARTS[k.color].a), x + 8, y + 8);
  const acc = ACCESSORIES[k.acc];
  if (acc) blit(ctx, art2("a" + k.acc, acc.art), x + 8 + acc.dx * 2, y + 8 + acc.dy * 2);
  text(ctx, k.name, x + 48, y + 5, [255, 240, 210]);
  smallText(ctx, "VISITING TOURIST", x + 48, y + 15, [210, 190, 170]);
  const lines = ["'WHAT A CUTE LITTLE TOWN'", "'SMELLS LIKE GOOD TACOS'", "'THE GULLS FOLLOWED ME HERE'", "'I'M NEVER GOING HOME'"];
  smallText(ctx, lines[(k.name.length + k.color) % lines.length], x + 48, y + 24, [255, 215, 150]);
  let ly = y + 42;
  const row = (label, val, col) => {
    smallText(ctx, label, x + 8, ly, [120, 110, 125]);
    smallText(ctx, val, x + 56, ly, col || [40, 30, 40]);
    ly += 9;
  };
  row("NOW", custStatus(k).slice(0, 32), [70, 90, 130]);
  row("ORDER", (ITEM_NAMES[k.recipe.icon] || "?") + " - $" + k.recipe.pay + (k.served ? " - PAID" : ""), [140, 110, 40]);
  row("MOOD", !k.served && k.patience < 15 ? "ABOUT TO WALK OUT" : k.happy || k.served ? "HAVING A GREAT TIME" : "WAITING PATIENTLY",
    !k.served && k.patience < 15 ? [190, 80, 80] : [40, 150, 70]);
  ly += 2;
  smallText(ctx, "PATIENCE", x + 8, ly, [110, 110, 130]);
  rect(ctx, x + 44, ly, 100, 5, [30, 20, 36]);
  const pf = Math.max(0, Math.min(1, k.patience / (k.maxPatience || 50)));
  rect(ctx, x + 45, ly + 1, Math.round(98 * pf), 3, pf > 0.5 ? [96, 200, 120] : pf > 0.25 ? [235, 200, 90] : [235, 90, 90]);
  ly += 10;
  smallText(ctx, "WORD OF MOUTH: TOURISTS WHO LEAVE HAPPY", x + 8, ly, [90, 90, 105]); ly += 7;
  smallText(ctx, "TELL THEIR FRIENDS. ANGRY ONES TELL MORE.", x + 8, ly, [90, 90, 105]);
  smallText(ctx, "CLICK TO CLOSE", x + w2 - 62, y + h2 - 9, [150, 140, 160]);
}
function drawDossier() {
  if (!dossier) return;
  if (!dossier.p) { drawCustDossier(dossier); return; }
  const c = dossier, p = c.p;
  const x = 24, y = 6, w2 = 208, h2 = 168;   // sits fully above the panel
  rect(ctx, x - 2, y - 2, w2 + 4, h2 + 4, [30, 20, 36]);
  rect(ctx, x, y, w2, h2, [255, 250, 235]);
  rect(ctx, x, y, w2, 32, [58, 42, 38]);
  // full-body portrait at 2x, wearing their real accessory (no work toque)
  rect(ctx, x + 4, y + 4, 40, 30, [200, 230, 245]);
  blit(ctx, art2("c" + p.color, CRAB_ARTS[p.color].a), x + 8, y + 8);
  const acc = ACCESSORIES[p.acc];
  if (acc) blit(ctx, art2("a" + p.acc, acc.art), x + 8 + acc.dx * 2, y + 8 + acc.dy * 2);
  text(ctx, p.name, x + 48, y + 5, [255, 240, 210]);
  smallText(ctx, TRAITS[p.trait].label + " - " + MODES[p.mode].label + (p.npc ? " - TOWNSFOLK" : " - CREW"), x + 48, y + 15, [210, 190, 170]);
  // what they're saying (their live quip, or a line true to their trait)
  {
    let line = c.quip && c.quip.text;
    if (!line) {
      const lines = TRAITS[p.trait].quips[quipContext(c)] || [];
      if (lines.length) line = lines[(p.name.length * 7 + p.color * 3 + day) % lines.length];
    }
    if (line) smallText(ctx, "'" + line + "'", x + 48, y + 24, [255, 215, 150]);
  }
  let ly = y + 42;
  const row = (label, val, col) => {
    smallText(ctx, label, x + 8, ly, [120, 110, 125]);
    smallText(ctx, val, x + 56, ly, col || [40, 30, 40]);
    ly += 9;
  };
  const doesTxt = p.npc
    ? (p.employer ? "WORKS AT " + BIZ[p.job].name + " FOR " + OWNERS[p.employer].name
      : p.fisher ? (p.boat != null ? "FISHES OFF THE " + BOAT_NAMES[p.boat] : "FISHES OFF THE PIER")
      : "RUNS " + BIZ[p.job].name)
    : "WORKS " + BIZ[p.job].name;   // short verb: leave room for TAP: REASSIGN
  row("DOES", doesTxt, [70, 90, 130]);
  if (!p.npc && Object.keys(BIZ).filter(b => bizUnlocked(b) && bizOwner(b) === "player").length > 1)
    smallText(ctx, "TAP: REASSIGN", x + w2 - 58, ly - 9, [96, 170, 220]);
  row("SHIFT", SHIFTS[p.shift].label);
  row("WALLET", "$" + fmt(Math.max(0, p.wallet)), p.wallet < 12 ? [190, 80, 80] : [140, 110, 40]);
  const [hl, hcol] = homeLabel(p);
  row("HOME", hl, hcol);
  row("NOW", crabStatus(c).slice(0, 34));
  if (p.sick) row("HEALTH", "SICK - DAY " + ((p.sick.days || 0) + 1), [190, 80, 80]);
  const eff = crabEff(c) * (p.sick ? 0.5 : 1);
  if (eff < 0.995) {
    const why = [];
    if (p.sick) why.push("SICK");
    if ((p.hunger || 0) > 0.3) why.push("HUNGRY");
    if ((p.dirt || 0) > 0.6) why.push("GRUBBY");
    row("PACE", "WORKING AT " + Math.round(eff * 100) + "%" + (why.length ? " - " + why.join(", ") : ""),
      eff < 0.8 ? [190, 80, 80] : [200, 110, 40]);
  }
  ly += 2;
  const bars = [["FED", 1 - (p.hunger || 0)], ["CLEAN", 1 - (p.dirt || 0)],
    ["FUN", 1 - (p.bored || 0)], ["UNSANDY", 1 - (p.sandy || 0)]];
  for (const [label, frac] of bars) {
    smallText(ctx, label, x + 8, ly, [110, 110, 130]);
    rect(ctx, x + 44, ly, 100, 5, [30, 20, 36]);
    rect(ctx, x + 45, ly + 1, Math.round(98 * Math.max(0, frac)), 3,
      frac > 0.5 ? [96, 200, 120] : frac > 0.25 ? [235, 200, 90] : [235, 90, 90]);
    ly += 8;
  }
  ly += 3;
  smallText(ctx, "CLAIMS TO FAME", x + 8, ly, [58, 42, 38]); ly += 8;
  const made = Object.entries(p.made || {}).sort((a, b) => b[1] - a[1]).slice(0, 5);
  if (!made.length) smallText(ctx, "NONE YET - GIVE IT TIME", x + 8, ly, [150, 140, 160]), ly += 8;
  for (let i = 0; i < made.length; i++) {
    if (ly > y + h2 - 12 && i < made.length - 1) {   // keep inside the card
      smallText(ctx, "+" + (made.length - i) + " MORE", x + 8, ly, [150, 140, 160]);
      break;
    }
    const [id, n] = made[i];
    let tier = "";
    for (const [need, , label] of MASTERY) if (n >= need) { tier = label; break; }
    smallText(ctx, (ITEM_NAMES[id] || id.toUpperCase()) + " X" + n + (tier ? " - " + tier : ""), x + 8, ly,
      tier ? [140, 110, 40] : [90, 90, 105]);
    ly += 8;
  }
  smallText(ctx, "CLICK TO CLOSE", x + w2 - 62, y + h2 - 9, [150, 140, 160]);
}

function drawJobBoard() {
  if (!boardView) return;
  const x = 40, y = 22, w2 = 176, h2 = 158;
  rect(ctx, x - 2, y - 2, w2 + 4, h2 + 4, [30, 20, 36]);
  rect(ctx, x, y, w2, h2, [255, 250, 235]);
  rect(ctx, x, y, w2, 14, [190, 140, 80]);
  text(ctx, "TOWN JOB BOARD", x + 24, y + 3, [40, 24, 16]);
  let ly = y + 20;
  if (!jobBoard.length) { smallText(ctx, "NO OPENINGS - THE TOWN'S ALL BUSY", x + 6, ly, [110, 110, 130]); ly += 9; }
  for (const j of jobBoard) {
    smallText(ctx, "HELP WANTED: " + BIZ[j.biz].name, x + 6, ly, [40, 30, 40]); ly += 7;
    smallText(ctx, "$" + j.wage + "/DAY - SEE " + OWNERS[bizOwner(j.biz)].name + (day > j.day ? " (STILL OPEN)" : ""), x + 12, ly, [140, 110, 40]); ly += 9;
  }
  {
    ly += 2; smallText(ctx, "TRADE LEDGER, TODAY / ALL TIME", x + 6, ly, [58, 42, 38]); ly += 8;
    smallText(ctx, "FISH LANDED OFF THE PIER", x + 6, ly, [40, 150, 70]);
    smallText(ctx, trade.landedDay + " / " + trade.landed, x + 126, ly, [40, 150, 70]); ly += 7;
    for (const kind of Object.keys(IMPORTS)) {
      const im = IMPORTS[kind];
      smallText(ctx, im.name + (kind === "fish" ? " SHIPPED IN" : ""), x + 6, ly, [90, 90, 105]);
      smallText(ctx, trade.day[kind] + " / " + trade.total[kind] + " " + im.unit + " AT $" + im.price, x + 126, ly, [110, 110, 130]);
      ly += 7;
    }
    smallText(ctx, "SHIPPED-IN FISH ONLY WHEN THE PIER RUNS DRY", x + 6, ly, [140, 110, 40]); ly += 9;
  }
  const staff = npcs.filter(c => c.p.employer);
  if (staff.length) {
    ly += 2; smallText(ctx, "WHO WORKS FOR WHOM", x + 6, ly, [58, 42, 38]); ly += 8;
    for (const c of staff.slice(0, 4)) {
      smallText(ctx, c.p.name + " - " + BIZ[c.p.job].name + ", PAID BY " + OWNERS[c.p.employer].name, x + 6, ly, [90, 90, 105]); ly += 7;
    }
  }
  smallText(ctx, "CLICK TO CLOSE", x + w2 - 62, y + h2 - 9, [150, 140, 160]);
}

function drawReport() {
  if (!report || reportT <= 0) return;
  const creditLines = (report.drew ? 1 : 0) + (report.interest ? 1 : 0) +
    (report.loanPaid ? 1 : 0) + (report.debt ? 1 : 0);
  const w2 = 176, x = ((W - w2) / 2) | 0, y = 24, h2 = 118 + creditLines * 8;
  ctx.fillStyle = "rgba(16,12,30,0.55)";
  ctx.fillRect(0, 0, W, PANEL_Y);
  rect(ctx, x - 2, y - 2, w2 + 4, h2 + 4, [30, 20, 36]);
  rect(ctx, x, y, w2, h2, [255, 250, 235]);
  rect(ctx, x, y, w2, 11, [190, 140, 80]);
  text(ctx, "DAY " + report.day + " REPORT", x + 34, y + 2, [40, 24, 16]);
  let ly = y + 16;
  const line = (label, val, col) => {
    smallText(ctx, label, x + 6, ly, [110, 100, 110]);
    smallText(ctx, String(val), x + w2 - 6 - smallTextWidth(String(val)), ly, col || [50, 40, 50]);
    ly += 8;
  };
  line("GUESTS SERVED", report.served, [40, 110, 60]);
  line("TAKINGS", "$" + fmt(report.revenue), [40, 110, 60]);
  line("WALKED OUT ANGRY", report.rage, report.rage > 2 ? [180, 60, 60] : [110, 100, 110]);
  line("WAGES PAID", "-$" + fmt(report.wages), [150, 70, 60]);
  line("RENT", "-$" + fmt(report.rent), [150, 70, 60]);
  if (report.drew) line("DREW ON CREDIT", "+$" + fmt(report.drew), [200, 130, 40]);
  if (report.interest) line("LOAN INTEREST", "+$" + fmt(report.interest), [180, 60, 60]);
  if (report.loanPaid) line("LOAN PAYMENT", "-$" + fmt(report.loanPaid), [150, 70, 60]);
  if (report.debt) line("DEBT OUTSTANDING", "$" + fmt(report.debt), [180, 60, 60]);
  line("IN THE TILL", "$" + fmt(report.coins), [90, 70, 40]);
  const dRep = report.repEnd - report.repStart;
  line("WORD OF MOUTH", report.repEnd + (dRep >= 0 ? "  +" + dRep : "  " + dRep),
    dRep >= 0 ? [40, 110, 60] : [180, 60, 60]);
  ly += 2;
  if (report.best) smallText(ctx, "BUSIEST CLAW: " + report.best + " x" + report.bestN, x + 6, ly, [70, 90, 130]), ly += 8;
  for (const n of report.died) smallText(ctx, n + " HAS PASSED AWAY", x + 6, ly, [180, 60, 60]), ly += 7;
  for (const n of report.sick) smallText(ctx, n + " FELL ILL", x + 6, ly, [120, 150, 90]), ly += 7;
  for (const n of report.recovered) smallText(ctx, n + " IS BACK ON THEIR CLAWS", x + 6, ly, [40, 110, 60]), ly += 7;
  for (const m of report.moved) smallText(ctx, m, x + 6, ly, [110, 100, 110]), ly += 7;
  if (((time * 1.5) | 0) % 2) smallText(ctx, "CLICK TO CARRY ON", x + 52, y + h2 - 9, [150, 130, 120]);
}
function drawToast() {
  if (!toast) return;
  const sp = textWidth(toast.text) + 12 > 252 ? 5 : 6;
  const w2 = Math.min(252, textWidth(toast.text, sp) + 12);
  const x = Math.max(2, ((W - w2) / 2) | 0), y = 62;
  rect(ctx, x, y, w2, 13, [30, 20, 36]);
  rect(ctx, x + 1, y + 1, w2 - 2, 11, [255, 250, 230]);
  text(ctx, toast.text, x + 6, y + 3, [90, 50, 30], sp);
}

// ---------------------------------------------------------------- main loop
let last = performance.now(), saveT = 0;
function frame(now) {
  const dt = Math.max(0, Math.min(0.1, (now - last) / 1000)) * TURBO * (ffSleep ? 6 : FF_SPEED[ffMode]);
  last = now; time += dt;
  if (!gameOver && screen === "play") tmin += dt * TS;
  if (tmin >= 1440) {
    tmin -= 1440; day++; townCatch = Math.min(townCatch, 4); rep = rep + (30 - rep) * 0.06;
    trade.day = { fish: 0, corn: 0, water: 0, power: 0 }; trade.landedDay = 0;
    today = newDayLog(); today.repStart = rep;
  }
  if (ffSleep && (gameOver || screen !== "play" || (day >= ffSleepDay && tmin >= 6.5 * 60 && tmin < 12 * 60)))
    ffSleep = false;   // morning - or anything that should break the spell
  if (screen === "play" && tmin >= 20 * 60 && lastRentDay !== day) {
    today.repEnd = rep;
    lastRentDay = day;
    for (const c of crabs) c.p.walletPrev = c.p.wallet;
    (window.dayLog = window.dayLog || []).push({ day, close: Math.round(coins) });
    // 1. wages: pay every crab you can afford
    let wages = 0;
    for (const c of crabs) {
      if (c.p.sick) continue;   // no work, no pay
      if (coins >= CRAB_WAGE) { coins -= CRAB_WAGE; c.p.wallet += CRAB_WAGE; wages += CRAB_WAGE; }
      else popText("NO PAY?!", c.x, FLOOR_Y - 30, [255, 120, 120]);
    }
    if (wages > 0) earnHist.push({ t: time, amt: -wages });
    // 2. house rent from each crab's own wallet; broke crabs move to the shelter
    let evictedNames = [];
    for (const c of allCrabs()) {
      if (!c.p.npc) c.p.sandy = Math.min(1, (c.p.sandy || 0) + 0.05);
      if (c.p.homeless) {
        // shelter is free; move into a free house once savings allow
        const used = new Set(allCrabs().filter(k => !k.p.homeless).map(k => k.p.house));
        let free = -1;
        for (let h = 0; h < HOUSE_XS.length; h++) if (!used.has(h)) { free = h; break; }
        if (free >= 0 && c.p.wallet >= MOVE_IN_COST + HOUSE_RENT) {
          c.p.wallet -= MOVE_IN_COST; c.p.house = free; c.p.homeless = false;
          today.moved.push(c.p.name + " GOT A HOUSE");
          toast = { text: c.p.name + " MOVED INTO A HOUSE!", t: 5 };
          popText("HOME SWEET HOME", HOUSE_XS[free] + 8, 100, [140, 255, 160]);
          sfx.ding();
        }
      } else if (c.p.boat != null) {
        // live-aboard: no landlord, just the harbormaster's mooring fee
        // (a boat is owned outright - a broke night runs a tab, never an eviction)
        if (c.p.wallet >= MOORING_FEE) c.p.wallet -= MOORING_FEE;
      } else if (c.p.fisher && freeBerth() >= 0 && c.p.wallet >= BOAT_COST + MOORING_FEE) {
        // top of the ladder: a housed fisher with deep savings trades up to a
        // live-aboard boat; the old house frees for the next climber
        const berth = freeBerth();
        c.p.wallet -= BOAT_COST;
        c.p.boat = berth; c.p.house = null;
        c.fishSpot = boatSpot(berth);
        today.moved.push(c.p.name + " MOVED ABOARD THE " + BOAT_NAMES[berth]);
        toast = { text: c.p.name + " MOVED ABOARD!", t: 6 };
        popText("LIVE-ABOARD!", BOAT_BERTHS[berth].x + 2, 58, [140, 220, 255]);
        sfx.ding();
      } else if (c.p.wallet >= HOUSE_RENT) {
        c.p.wallet -= HOUSE_RENT;
      } else {
        c.p.homeless = true;
        evictedNames.push(c.p.name); today.moved.push(c.p.name + " -> SHELTER");
        popText(c.p.name + " LOST THEIR HOUSE", c.x - 12, FLOOR_Y - 34, [255, 120, 120]);
      }
    }
    if (evictedNames.length) {
      toast = { text: evictedNames.join(", ") + " MOVED TO THE SHELTER", t: 6 };
      sfx.angry();
    }
    // 2a2. npc payroll: owners pay their staff from the till - or lose them to the pier
    for (const c of npcs) {
      const emp = c.p.employer;
      if (!emp) continue;
      const o = OWNERS[emp];
      if (c.p.sick) continue;   // no work, no pay - same deal as the crew
      if (o && o.till >= NPC_WAGE) { o.till -= NPC_WAGE; c.p.wallet += NPC_WAGE; }
      else {
        c.p.job = "fishing"; c.p.employer = null;
        today.moved.push(c.p.name + " QUIT - BACK TO THE PIER");
        toast = { text: c.p.name + " QUIT: " + (o ? o.name : "THE BOSS") + " COULDN'T PAY", t: 6 };
      }
    }
    // 2b. peer owners settle their own books on the same line of credit:
    // shortfalls draw on the line; a busted line shutters the shop (dark)
    // for CREDIT_CFG.NPC_DARK_NIGHTS nights and the bank writes the debt off
    // (survivable - NPC bankruptcy is a setback, not a death)
    for (const b of Object.keys(BIZ)) {
      if (bizOwner(b) === "player") continue;
      const o = OWNERS[bizOwner(b)];
      if (!o || day <= 1) continue;
      if ((o.darkT || 0) > 0) {
        if (--o.darkT === 0) toast = { text: BIZ[b].name + " IS BACK IN BUSINESS", t: 6 };
        continue;
      }
      const nf = settleCreditLine(o.credit || 0, o.till, BIZ[b].rent);
      if (nf.ok) { o.credit = nf.bal; o.till = nf.funds; }
      else {
        o.credit = 0; o.darkT = CREDIT_CFG.NPC_DARK_NIGHTS;
        today.moved.push(o.name + " WENT BANKRUPT - " + BIZ[b].short + " DARK");
        toast = { text: o.name + " WENT BANKRUPT! " + BIZ[b].name + " GOES DARK", t: 7 };
      }
    }
    for (const c of npcs) {
      c.p.hunger = Math.min(1, (c.p.hunger || 0) + 0.1);
      c.p.sandy = Math.min(1, (c.p.sandy || 0) + 0.05);
    }
    // 2.5 epidemiology: neglect breeds illness; illness spreads; rest + care cures
    {
      const everyone = allCrabs();
      const sickNow = everyone.filter(k => k.p.sick);
      for (const k of everyone) {
        if (k.p.sick) continue;
        let risk = 0;
        if ((k.p.hunger || 0) >= 0.95) risk += 0.10;
        if ((k.p.dirt || 0) >= 0.95) risk += 0.06;
        if ((k.p.sandy || 0) >= 0.95) risk += 0.03;
        for (const s2 of sickNow) {
          const coworkers = s2.workBiz === k.workBiz && k.dayState !== "home" && !s2.p.npc;
          const shelterMates = k.p.homeless && s2.p.homeless;
          if (coworkers || shelterMates) risk += 0.08;
        }
        if (risk > 0 && Math.random() < Math.min(0.5, risk)) {
          k.p.sick = { days: 0 }; today.sick.push(k.p.name);
          if (window._stats) {
            const why = [];
            if ((k.p.hunger || 0) >= 0.9) why.push("hunger");
            if ((k.p.dirt || 0) >= 0.9) why.push("dirt");
            if ((k.p.sandy || 0) >= 0.9) why.push("sandy");
            if (why.length === 0) why.push("contagion");
            window._stats.causes = window._stats.causes || {};
            for (const w of why) window._stats.causes[w] = (window._stats.causes[w] || 0) + 1;
          }
          popText(k.p.name + " FELL ILL", k.x - 10, FLOOR_Y - 34, [130, 220, 110]);
          if (window._stats) window._stats.infections = (window._stats.infections || 0) + 1;
        }
      }
      for (const k of everyone) {
        if (!k.p.sick) continue;
        k.p.sick.days++;
        const cared = (k.p.hunger || 0) < 0.5 && (k.p.dirt || 0) < 0.66;
        if (Math.random() < (cared ? 0.4 : 0.12)) {
          k.p.sick = null; today.recovered.push(k.p.name);
          popText(k.p.name + " RECOVERED!", k.x - 12, FLOOR_Y - 34, [140, 255, 160]);
          if (window._stats) window._stats.recoveries = (window._stats.recoveries || 0) + 1;
        } else if (!k.p.npc && k.p.sick.days >= 3 &&
            Math.random() < Math.min(0.75, (cared ? 0.08 : 0.25) + 0.12 * Math.max(0, k.p.sick.days - 4))) {
          // the tide takes them
          abortChef(k); abortErrand(k);
          memorials.push({ x: SHELTER_X - 40 - memorials.length * 16, name: k.p.name });
          today.died.push(k.p.name);
          const followed = followIdx >= 0 ? crabs[followIdx] : null;
          crabs = crabs.filter(c2 => c2 !== k);
          UPS.chef.lvl = Math.max(1, crabs.length);
          followIdx = followed ? crabs.indexOf(followed) : -1;   // keep following the same crab, not the same slot
          if (dossier === k) dossier = null;   // no records for ghosts
          toast = { text: k.p.name + " HAS PASSED AWAY. THE TOWN GRIEVES.", t: 8 };
          if (window._stats) window._stats.deaths = (window._stats.deaths || 0) + 1;
          sfx.angry();
        }
      }
    }
    // 3. property rents + loan service (THE credit hook): a shortfall draws
    // on the line of credit instead of instant eviction; interest compounds
    // and the minimum payment auto-collects inside settleCreditLine.
    // ok:false is the new cliff - BANKRUPT (see CREDIT_CFG).
    const rent = totalRent();
    const fin = settleCreditLine(credit.bal, coins, rent);
    if (fin.ok) {
      credit.bal = fin.bal; coins = fin.funds;
      earnHist.push({ t: time, amt: fin.drew - rent - fin.paid });
      report = {
        day, served: today.served, revenue: Math.round(today.revenue), rage: today.rage,
        wages, rent, sick: today.sick.slice(0, 3), died: today.died.slice(0, 2),
        recovered: today.recovered.slice(0, 2), moved: today.moved.slice(0, 2),
        repStart: Math.round(today.repStart), repEnd: Math.round(rep),
        best: Object.keys(today.byCrab).sort((a, b) => today.byCrab[b] - today.byCrab[a])[0],
        bestN: 0, coins: Math.round(coins),
        drew: fin.drew, interest: fin.interest, loanPaid: fin.paid, debt: Math.round(credit.bal),
      };
      if (report.best) report.bestN = today.byCrab[report.best];
      reportT = 11;
      const dl = (window.dayLog || [])[(window.dayLog || []).length - 1];
      if (dl) dl.after = Math.round(coins);   // forecaster: post-settlement till
      if (rent > 0) popText("-$" + rent + " RENT", BIZ.shack.door, 110, [255, 120, 120]);
      if (fin.drew > 0) popText("+$" + fin.drew + " ON CREDIT", BIZ.shack.door, 100, [255, 190, 90]);
      sfx.buy(); save();
    } else {
      gameOver = true; bankrupt = true; toast = null; save();
      if (music) { music.pause(); music = null; }
      sfx.angry();
    }
  }

  if (screen === "play" && !gameOver) updateBankWarning();

  if (screen === "intro") {
    camX = clampCam(BIZ.shack.x0 - 20);
    drawBG(); drawTown();
    for (const c of crabs) drawCrab(c);
    drawIntro();
    requestAnimationFrame(frame);
    return;
  }
  if (screen === "title") {
    if (newConfirmT > 0) newConfirmT -= dt;
    // attract mode: slow ping-pong pan across the town
    const span = WORLD_W - W, s = (time * 9) % (2 * span);
    camX = s < span ? s : 2 * span - s;
    updateBus(dt);
    for (const c of crabs) {
      c.animT += dt; maybeQuip(c, dt);
      if (c._wt == null || Math.abs(c.x - c._wt) < 2)
        c._wt = Math.max(20, Math.min(WORLD_W - 30, c.x + Math.random() * 90 - 45));
      else stepTo(c, c._wt, 11, dt, 158);
    }
    drawBG(); drawTown(); drawBus();
    for (const c of crabs) drawCrab(c);
    drawNight();
    drawTitle();
    requestAnimationFrame(frame);
    return;
  }
  if (!gameOver) {
  updateBus(dt);
  if (tmin >= 7.5 * 60 && hireDay !== day) { hireDay = day; runJobBoard(); }
  updateCustomers(dt);
  for (const c of allCrabs()) {
    c.animT += dt;
    c._stepped = false;
    updateSchedule(c, dt);
    if (c.dayState === "toWork" || c.dayState === "toHome") updateCommute(c, dt);
    else if (c.dayState === "toErrand" || c.dayState === "errand") updateErrand(c, dt);
    else if (c.dayState === "selfCook") updateSelfCook(c, dt);
    else if (c.dayState === "working" && c.p.job === "fishing") updateFishing(c, dt);
    else if (c.dayState === "working") updateKitchen(c, dt);
    else if (c.dayState === "home") updateHome(c, dt);
    maybeQuip(c, dt);
  }
  if (followCust && !customers.includes(followCust)) followCust = null;   // they went home
  if (dossier && !dossier.p && !customers.includes(dossier)) dossier = null;
  const followed = followNpc || followCust || (followIdx >= 0 && crabs[followIdx]);
  if (followed) {
    const t = clampCam(followed.x - W / 2 + 8);
    camX += (t - camX) * Math.min(1, dt * 5);
  }
  if (reportT > 0 && !ffSleep) reportT -= dt;   // the day report waits out a sun-skip
  if (newConfirmT > 0) newConfirmT -= dt;
  if (toast) { toast.t -= dt; if (toast.t <= 0) toast = null; }
  saveT += dt; if (saveT > 5) { saveT = 0; save(); }
  }

  if (!gameOver && !window._nocollide) collide(dt);
  if (window._headless) { requestAnimationFrame(frame); return; }   // sim-only mode: no rendering
  drawBG();
  drawTown();
  drawBus();
  // painter's pass: stations, customers, crabs interleaved by baseline
  const paint = [];
  for (const key of Object.keys(BIZ)) {
    if (!bizUnlocked(key)) continue;
    const b = BIZ[key];
    for (const kind of Object.keys(b.stations)) {
      const cap = stationCap(key, kind);
      for (let i = 0; i < cap; i++) {
        const st = b.stations[kind][i];
        paint.push({ base: st.y, f: () => drawStation(key, kind, i) });
      }
    }
  }
  for (const key of Object.keys(BIZ)) {
    if (!bizUnlocked(key)) continue;
    const tables = bizTables(key);
    if (tables) for (const t of tables) paint.push({ base: t.y, f: () => {
      wblit(PICNIC_TABLE, t.x, t.y - PICNIC_TABLE.h);
      if (t.dishes > 0) wblit(DISHES[t.dishes - 1], t.x + 6, t.y - PICNIC_TABLE.h - DISHES[t.dishes - 1].h + 1);
    } });
    const stalls = BIZ[key].stalls;
    if (stalls) for (const t of stalls) paint.push({ base: t.y, f: () => {
      const bathing = t.occupant && t.occupant.state === "showering";
      wblit(STALL[bathing ? 1 : 0], t.x, t.y - STALL[0].h);
      if (bathing) {   // feet peeking under the curtain
        const oc = t.occupant, pcol = oc.isCrab ? oc.crab.p.color : (oc.p ? oc.p.color : oc.color);
        const col = CRAB_COLORS[(pcol || 0) % CRAB_COLORS.length][0];
        wrect(t.x + 5, t.y - 3, 2, 2, col);
        wrect(t.x + 9, t.y - 3, 2, 2, col);
      }
      if (bathing) {   // the bather's head bobs over the curtain
        const oc = t.occupant, pcol = oc.isCrab ? oc.crab.p.color : (oc.p ? oc.p.color : oc.color);
        const pal = CRAB_COLORS[(pcol || 0) % CRAB_COLORS.length];
        const bob = Math.round(Math.sin(time * 3 + t.x) * 1.5);
        const hy = t.y - STALL[0].h + 4 + bob;
        wrect(t.x + 5, hy, 6, 3, pal[0]);                    // wet shell dome
        wrect(t.x + 6, hy - 1, 4, 1, pal[0]);
        wrect(t.x + 6, hy - 3, 1, 2, pal[1] || pal[0]);      // eyestalks
        wrect(t.x + 9, hy - 3, 1, 2, pal[1] || pal[0]);
        px(ctx, t.x + 6 - camX, hy - 3, [255, 255, 255]);    // happy wet eyes
        px(ctx, t.x + 9 - camX, hy - 3, [255, 255, 255]);
      }
      if (bathing) {   // suds drift up over the curtain while the water runs
        for (let i = 0; i < 3; i++) {
          const ph = (time * 0.6 + i * 0.33 + t.x * 0.013) % 1;
          if (ph > 0.85) continue;
          const sx = t.x + 3 + i * 4 + ((Math.sin(time * 1.5 + i * 2.1) * 2) | 0);
          const s = ph < 0.5 ? 2 : 1;
          wrect(sx, t.y - STALL[0].h - 2 - ph * 8, s, s, i % 2 ? [96, 200, 255] : [88, 205, 188]);
        }
      }
      if (t.dirty) { px(ctx, t.x + 3 - camX, t.y - 2, [130, 220, 110]); px(ctx, t.x + 7 - camX, t.y - 1, [110, 190, 110]); px(ctx, t.x + 11 - camX, t.y - 2, [130, 220, 110]); }
    } });
  }
  for (const k of customers) paint.push({ base: (k.state === "dining" || k.state === "seatedWaiting") && k.table ? (k.table.y + 1) : (k.isCrab ? 165 : FLOOR_Y), f: () => drawCustomer(k) });
  for (const c of allCrabs()) paint.push({ base: c.cstate === "drive" && (c.dayState === "toWork" || c.dayState === "toHome") ? ROAD_Y1 : c.y, f: () => drawCrab(c) });
  paint.push({ base: FLOOR_Y, f: drawLandlord });
  paint.sort((a, b) => a.base - b.base);
  for (const e of paint) e.f();
  drawSwoop();
  drawFloaters(dt);
  drawNight();
  drawDossier();
  drawJobBoard();
  drawReport();
  drawFollowCard();
  {  // town reputation chip, top-right of the world
    const rTxt = "REP " + Math.round(rep);
    const rw = smallTextWidth(rTxt) + 8;
    rect(ctx, W - rw - 2, 2, rw, 10, [30, 20, 36]);
    smallText(ctx, rTxt, W - rw + 2, 4, rep >= 50 ? [140, 220, 140] : rep >= 25 ? [220, 205, 185] : [235, 130, 130]);
  }
  {  // the little sun: skip to morning (top-right, under the REP chip)
    const on = ffSleep;
    rect(ctx, W - 24, 14, 22, 13, [30, 20, 36]);
    rect(ctx, W - 23, 15, 20, 11, on ? [255, 216, 96] : [70, 58, 66]);
    const sc = on ? [140, 90, 20] : [255, 216, 96];
    rect(ctx, W - 16, 18, 5, 5, sc);                       // sun core
    px(ctx, W - 14, 16, sc); px(ctx, W - 14, 24, sc);      // rays
    px(ctx, W - 18, 20, sc); px(ctx, W - 10, 20, sc);
    px(ctx, W - 17, 17, sc); px(ctx, W - 11, 17, sc);
    px(ctx, W - 17, 23, sc); px(ctx, W - 11, 23, sc);
    if (on) smallText(ctx, "ZZZ", W - 44, 17, [255, 230, 120]);
  }
  {  // line-of-credit chips, bottom-right of the world (right above the BILL chip)
    let cy = PANEL_Y - 12;
    if (bankHorizon <= CREDIT_CFG.CHIP_DAYS && !gameOver) {
      const wTxt = bankHorizon <= 0 ? "BANKRUPT TONIGHT!" : "BANKRUPT IN " + bankHorizon + "D";
      const ww = smallTextWidth(wTxt) + 8;
      const blink = ((time * 2) | 0) % 2;
      rect(ctx, W - ww - 2, cy, ww, 10, blink ? [150, 30, 30] : [60, 16, 20]);
      smallText(ctx, wTxt, W - ww + 2, cy + 2, blink ? [255, 230, 230] : [235, 130, 130]);
      cy -= 12;
    }
    if (credit.bal > 0) {
      const dTxt = "DEBT $" + fmt(Math.round(credit.bal)) + "/" + CREDIT_CFG.LIMIT;
      const dw = smallTextWidth(dTxt) + 8;
      rect(ctx, W - dw - 2, cy, dw, 10, [30, 20, 36]);
      smallText(ctx, dTxt, W - dw + 2, cy + 2, [255, 190, 90]);
    }
  }
  drawPanel();
  drawToast();
  if (gameOver) drawGameOver();
  if (window.MergeMode) MergeMode.frame(dt);
  // sun mode: chain extra 0.6s sim steps synchronously (same per-step bound the
  // suite verifies at 6x) so the night passes in about a second of real time
  if (ffSleep && screen === "play" && !gameOver && ffChain < 6) {
    ffChain++; frame(last + 100); return;
  }
  if (ffChain) { ffChain = 0; last = performance.now(); }   // resync: chained steps ran ahead of the real clock
  requestAnimationFrame(frame);
}

document.addEventListener("visibilitychange", () => { if (document.hidden) save(); else last = performance.now(); });
addEventListener("beforeunload", save);

initNpcs();
hasSave = load();
if (!hasSave) {
  crabs = [newCrab(makeCrabPersona(0)), newCrab(makeCrabPersona(1))];
  coins = 150;   // a few bux in your pocket - rent is due tonight: ingredients + first rent buffer
}
requestAnimationFrame(frame);

// console cheat for tinkering: cheat(500)
window.cheat = (n) => { coins += n || 100; };
