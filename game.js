// CRAB SHACK 2 — a whole beachside town. Crabs have names, moods, shift
// schedules, and commutes: they walk, bike, ride the bus, or drive their
// beach buggy to work at the shack. Click a crab (or its portrait) to
// follow it around town.

"use strict";

const cv = document.getElementById("screen");
const ctx = cv.getContext("2d");
ctx.imageSmoothingEnabled = false;

// ---------------------------------------------------------------- geometry
const WORLD_W = 2048;
const SKY_H = 58, SHORE_Y = 86, FLOOR_Y = 166, PANEL_Y = 176;
const ROAD_Y0 = 90, ROAD_Y1 = 112, LOT_BOTTOM = 152;
const HOUSE_XS = [30, 100, 170, 240, 310, 380].map(x => x);
const BUS_STOPS = [163, 660, 1180];
const BUS_TERMINUS = [100, 1240];
const STATION_BOTTOM = 152;
const QUEUE_DX = 13, QUEUE_MAX = 4;
const SHELTER_X = 444, MOVE_IN_COST = 35;
const HOME_BOTTOM = 160;   // house/shelter interiors reach the floor

// ---------------------------------------------------------------- businesses
const BIZ = {
  shack: {
    name: "CRAB SHACK", short: "SHACK", sign: "CRAB SHACK 3", kind: "palapa", rent: 135, owner: "player",
    x0: 1220, x1: 1560, door: 1247,
    stations: {
      crate: [{ x: 1232, y: 136 }],
      board: [{ x: 1268, y: 136 }, { x: 1289, y: 136 }, { x: 1310, y: 136 }],
      sink:  [{ x: 1342, y: 136 }],
      grill: [{ x: 1380, y: 160 }, { x: 1402, y: 160 }, { x: 1424, y: 160 }],
      pass:  [{ x: 1452, y: 160 }],
    },
    tables: [{ x: 1492, y: 152, dishes: 0, occupant: null }, { x: 1532, y: 152, dishes: 0, occupant: null }],
    source: "crate", out: "pass", queueX: 1566,
    park: 1130, rack: 1208,
    recipes: [
      { id: "taco", icon: "taco", pay: 17, raw: "fish_raw",
        steps: [["board", 3.0, "fish_cut"], ["grill", 4.0, "taco"]] },
      { id: "juice", icon: "juice", pay: 10, raw: "fruit",
        steps: [["board", 2.5, "juice"]] },
      { id: "fish", icon: "plate_fish", pay: 12, raw: "fish_raw",
        steps: [["grill", 5.0, "plate_fish"]] },
    ],
  },
  cleaners: {
    name: "SUDS N BUBBLES", short: "SUDS", sign: "SUDS N BUBBLES", kind: "shopfront", rent: 60, owner: "player",
    x0: 690, x1: 880, door: 706,
    stations: {
      basket:  [{ x: 700, y: 136 }],
      washer:  [{ x: 736, y: 136 }, { x: 758, y: 136 }],
      dryer:   [{ x: 792, y: 160 }, { x: 814, y: 160 }],
      counter: [{ x: 846, y: 160 }],
    },
    source: "basket", out: "counter", queueX: 874,
    park: 590, rack: 668,
    recipes: [
      { id: "towels", icon: "towel_clean", pay: 11, raw: "towel_dirty",
        steps: [["washer", 3.5, "towel_wet"], ["dryer", 3.0, "towel_clean"]] },
      { id: "uniform", icon: "uniform_clean", pay: 7, raw: "uniform_dirty",
        steps: [["washer", 3.0, "uniform_wet"], ["dryer", 2.5, "uniform_clean"]] },
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
    name: "SUDS SHOWERS", short: "SHWR", sign: "SUDS SHOWERS", kind: "shopfront", rent: 40, owner: "sudsy",
    x0: 950, x1: 1070, door: 964,
    stations: {
      taps:  [{ x: 956, y: 136 }],
      stall: [{ x: 990, y: 136 }, { x: 1012, y: 136 }],
      scrub: [{ x: 1000, y: 160 }],
      towel: [{ x: 1040, y: 160 }],
    },
    source: "taps", out: "towel", queueX: 1076,
    park: 906, rack: 934,
    recipes: [
      { id: "rinse", icon: "shine", pay: 6, raw: "soap",
        steps: [["stall", 2.5, "shine"]] },
      { id: "soak", icon: "suds", pay: 12, raw: "soap",
        steps: [["stall", 3.0, "suds"], ["scrub", 2.0, "shine"]] },
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
const OWNERS = { sudsy: { id: "sudsy", name: "SUDSY", till: 200 } };
const bizOwner = (b) => BIZ[b].owner || "player";
function ownerFunds(b) { return bizOwner(b) === "player" ? coins : OWNERS[bizOwner(b)].till; }
function creditBiz(b, amt, x, y) {
  if (bizOwner(b) === "player") earn(amt, x, y);
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
  || (b === "cleaners" ? UPS.cleaners.lvl > 0 : UPS.arcade.lvl > 0);

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
const INGREDIENT_COST = { fish_raw: 5, fruit: 3, towel_dirty: 1, uniform_dirty: 1, token: 1, soap: 1 };
const ITEM_NAMES = {
  fish_raw: "FISH", fish_cut: "CUT FISH", fruit: "FRUIT",
  taco: "FISH TACO", juice: "JUICE", plate_fish: "GRILL FISH",
  towel_dirty: "TOWELS", towel_wet: "WET TOWELS", towel_clean: "FRESH TOWELS",
  uniform_dirty: "LAUNDRY", uniform_wet: "WET WASH", uniform_clean: "CLEAN PRESS",
  token: "TOKENS", plush: "CLAW PLUSH", tickets: "TICKET RUN", gold_plush: "GOLD PLUSH",
  soap: "SOAP", suds: "DELUXE SOAK", shine: "QUICK RINSE",
};

// ---------------------------------------------------------------- upgrades
const UPS = {
  chef:   { name: "HIRE CRAB", base: 80, mult: 2.4, max: 6, lvl: 2 },
  shoes:  { name: "SHOES",     base: 25, mult: 1.7, max: 8, lvl: 0 },
  knife:  { name: "KNIFE",     base: 30, mult: 1.7, max: 8, lvl: 0 },
  flame:  { name: "FLAME",     base: 30, mult: 1.7, max: 8, lvl: 0 },
  expand: { name: "EXPAND",    base: 90, mult: 2.6, max: 2, lvl: 0 },
  ads:    { name: "ADS",       base: 45, mult: 1.9, max: 8, lvl: 0 },
  cleaners: { name: "CLEANERS", base: 400, mult: 1, max: 1, lvl: 0 },
  arcade:   { name: "ARCADE",   base: 650, mult: 1, max: 1, lvl: 0 },
};
for (const k in UPS) UPS[k].key = k;
function upCost(u) { return Math.ceil(u.base * Math.pow(u.mult, u.key === "chef" ? u.lvl - 2 : u.lvl)); }
const chopMult = () => 1 / (1 + 0.22 * UPS.knife.lvl);
const cookMult = () => 1 / (1 + 0.22 * UPS.flame.lvl);
function stationCap(bizKey, kind) {
  if (bizKey === "shack" && (kind === "board" || kind === "grill")) return 1 + UPS.expand.lvl;
  return BIZ[bizKey].stations[kind].length > 1 ? 2 : 1;
}
const spawnEvery = () => 7.5 / (1 + 0.35 * UPS.ads.lvl);
const shoesMult = () => 1 + 0.12 * UPS.shoes.lvl;

// ---------------------------------------------------------------- state
let coins = 0, lifetime = 0, time = 0;
let crabs = [], customers = [], floaters = [];
let spawnT = 3, toast = null, soundOn = true, ffMode = 0;   // 0=1x, 1=2x, 2=3x
let camX = 1180, followIdx = -1, tab = "crew";
let lastRentDay = 0, gameOver = false, newConfirmT = 0;
let screen = "title", hasSave = false, wiping = false;
function newGame() { wiping = true; localStorage.removeItem(SAVE_KEY); location.reload(); }
const CRAB_WAGE = 28, HOUSE_RENT = 12;
function rentAmount() { return day <= 1 ? 0 : BIZ.shack.rent; }   // shack lease (legacy name)
function totalRent() {   // the PLAYER's nightly property bill
  if (day <= 1) return 0;
  return Object.keys(BIZ).filter(b => bizUnlocked(b) && bizOwner(b) === "player")
    .reduce((s, b) => s + BIZ[b].rent, 0);
}
function nightlyDue() { return totalRent() + CRAB_WAGE * crabs.length; }
const busy = {
  shack: { board: [false, false, false], grill: [false, false, false], sink: [false] },
  cleaners: { washer: [false, false], dryer: [false, false] },
  arcade: { claw: [false, false], skee: [false, false] },
  showers: { stall: [false, false], scrub: [false] },
};
const bus = { x: 360, dir: 1, state: "drive", dwellT: 0, riders: [] };
let earnHist = [];

const CRAB_ARTS = CRAB_COLORS.map(c => crabArt(c[0], c[1]));
const TOURIST_ARTS = TOURIST_STYLES.map(touristArt);
const LANDLORD_ART = crabArt([255, 200, 80], [190, 140, 30]);
const HOUSES = CRAB_COLORS.map(c => houseArt(c[0]));
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
const BUS2 = scale2(BUS);
const BUGGIES2 = BUGGIES.map(scale2);

let npcs = [];
function allCrabs() { return npcs.length ? crabs.concat(npcs) : crabs; }
function initNpcs() {
  const p = { name: "SUDSY", npc: true, owner: "sudsy", trait: "cheery", mode: "walk",
    acc: "showercap", color: CRAB_COLORS.length - 1, shift: "D", house: 0, homeX: 1148,
    wallet: 25, job: "showers", hunger: 0, dirt: 0, bored: 0, sandy: 0 };
  const c = newCrab(p);
  c.workBiz = "showers"; c.x = p.homeX; c.y = 158;
  npcs = [c];
}
function homeX(c) { return homeSpot(c).x; }
function homeSpot(c) {
  if (c.p.homeX) return { x: c.p.homeX, y: 158 };   // owner-operators nook by their stand
  if (c.p.homeless) {
    const cot = [6, 24, 44][Math.max(0, crabs.indexOf(c)) % 3];
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
  if (persona.hunger == null) persona.hunger = 0;
  if (persona.dirt == null) persona.dirt = 0;
  if (persona.bored == null) persona.bored = 0;
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
  return 40 * t.move * shoesMult() * (1 - 0.2 * Math.max(0, (c.p.bored || 0) - 0.5));
}
function crabWork(c) { return TRAITS[c.p.trait].work; }

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
  music.play().then(() => { toast = { text: "NOW PLAYING: " + t.name, t: 4 }; })
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
    coins, lifetime, lv, day, tmin, lastRentDay, gameOver, rate: incomeRate(), t: Date.now(),
    personas: crabs.map(c => c.p),
    npc: { tills: { sudsy: OWNERS.sudsy.till }, personas: npcs.map(c => c.p) },
  }));
}
function load() {
  if (FRESH) return false;
  let s = null;
  try { s = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) {}
  if (!s) return false;
  coins = s.coins || 0; lifetime = s.lifetime || 0;
  day = s.day || 1; tmin = s.tmin != null ? s.tmin : 7 * 60;
  lastRentDay = s.lastRentDay || 0;
  if (s.gameOver) { gameOver = true; screen = "play"; }
  for (const k in UPS) if (s.lv && s.lv[k] != null) UPS[k].lvl = s.lv[k];
  if (Array.isArray(s.personas) && s.personas.length) {
    crabs = s.personas.map((p2, i) => {
      const base = makeCrabPersona(i);
      return newCrab(Object.assign(base, p2));   // missing fields fall back to sane defaults
    });
  } else return false;
  if (s.npc) {
    if (s.npc.tills && s.npc.tills.sudsy != null) OWNERS.sudsy.till = s.npc.tills.sudsy;
    if (s.npc.personas && s.npc.personas[0] && npcs[0]) Object.assign(npcs[0].p, s.npc.personas[0]);
  }
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
function commuteGmin(c) {
  const dist = Math.abs(BIZ[c.p.job].door - homeX(c));
  const m = c.p.mode;
  if (m === "bus") return 100;                       // walk + wait + ride, rough
  return dist / (MODES[m].speed * TRAITS[c.p.trait].move * shoesMult()) * TS + 12;
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
        else {
          a.x -= ux * push; a.y = clampY(a.y - uy * push);
          b.x += ux * push; b.y = clampY(b.y + uy * push);
        }
      }
    }
  // solid tables: nobody walks through the picnic area
  for (const bizKey of Object.keys(BIZ)) {
    if (!bizUnlocked(bizKey) || !BIZ[bizKey].tables) continue;
    for (const t of BIZ[bizKey].tables) {
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
  const dest = toWork ? BIZ[c.p.job].door : homeX(c);
  if (m === "bus") {
    c.busFrom = nearestStop(c.x); c.busTo = nearestStop(dest);
    c.cstate = c.busFrom === c.busTo ? "travel" : "walkToStop";
  }
  else if (m === "walk") c.cstate = "travel";
  else c.cstate = toWork ? "drive" : "walkToVehicle";  // bike/buggy parked at work
}

function updateCommute(c, dt) {
  const toWork = c.dayState === "toWork";
  const dest = toWork ? BIZ[c.p.job].door : homeX(c);
  const m = c.p.mode, tr = TRAITS[c.p.trait];
  const wspd = crabMove(c), vspd = MODES[m].speed * tr.move * shoesMult();

  if (tr.pauses && c.pauseT <= 0 && Math.random() < dt * 0.06) c.pauseT = 1.3;
  if (c.pauseT > 0) { c.pauseT -= dt; return; }

  if (c.cstate === "travel") {           // walking the whole way
    if (stepTo(c, dest, wspd, dt, 167)) arriveCommute(c, toWork);
  } else if (c.cstate === "drive") {     // bike/buggy: ride to park spot, walk rest
    const b = BIZ[c.p.job];
    const park = toWork ? (m === "buggy" ? b.park + c.p.house * 18 : b.rack + c.p.house * 7) : homeX(c);
    if (stepTo(c, park, vspd, dt, 150)) {
      if (toWork) { c.cstate = "walkFromPark"; }
      else arriveCommute(c, false);
    }
  } else if (c.cstate === "walkFromPark") {
    if (stepTo(c, dest, wspd, dt, 167)) arriveCommute(c, true);
  } else if (c.cstate === "walkToVehicle") {   // heading home: fetch parked ride
    const b = BIZ[c.p.job];
    const park = m === "buggy" ? b.park + c.p.house * 18 : b.rack + c.p.house * 7;
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
  if (atWork) { c.dayState = "working"; c.duty = true; c.kstate = "idle"; c.workBiz = c.p.job; }
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

// ---------------------------------------------------------------- day schedule
function updateSchedule(c, dt) {
  const sh = SHIFTS[c.p.shift];
  if (!bizUnlocked(c.p.job)) c.p.job = "shack";
  if (c.dayState === "home" && tmin >= leaveGmin(c) && tmin < sh.end - 30) {
    startCommute(c, true);
  }
  if (c.dayState === "working" && tmin >= sh.end) c.pendingOff = true;
  if (c.dayState === "working" && c.pendingOff && c.kstate === "idle") {
    c.duty = false; c.pendingOff = false;
    if (c.carrying) c.carrying = null;
    c.p.hunger = Math.min(1, (c.p.hunger || 0) + 0.25);  // a shift works up an appetite
    c.p.dirt = Math.min(1, (c.p.dirt || 0) + 0.25);      // and stains the uniform
    c.p.bored = Math.min(1, (c.p.bored || 0) + 0.2);     // all work and no play...
    c.p.sandy = Math.min(1, (c.p.sandy || 0) + 0.25);    // beach work is gritty work
    startCommute(c, false);
  }
  // owner-operators top their pocket up from the till
  if (c.p.npc) {
    const o = OWNERS[c.p.owner];
    if (o && c.p.wallet < 15 && o.till >= 30) { o.till -= 30; c.p.wallet += 30; }
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
function bizStaffed(b) { return bizUnlocked(b) && allCrabs().some(k => k.duty && !k.pendingOff && k.workBiz === b); }
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
    const affordable = BIZ.shack.recipes.filter(r => c.p.wallet >= r.pay + 2);
    if (affordable.length) {
      // treat yourself when flush, eat cheap when broke
      affordable.sort((a, b) => a.pay - b.pay);
      const r = c.p.wallet > 40 ? affordable[(Math.random() * affordable.length) | 0] : affordable[0];
      return { biz: "shack", recipe: r, need: "food" };
    }
  }
  if ((c.p.dirt || 0) >= 0.66 && staffed("cleaners")) {
    const r = BIZ.cleaners.recipes[1];   // uniform service
    if (c.p.wallet >= r.pay + 2) return { biz: "cleaners", recipe: r, need: "clean" };
  }
  if ((c.p.bored || 0) >= 0.6 && staffed("arcade")) {
    const r = BIZ.arcade.recipes[c.p.wallet > 40 ? 2 : 1];   // splurge on game night when flush
    if (c.p.wallet >= r.pay + 2) return { biz: "arcade", recipe: r, need: "fun" };
  }
  if ((c.p.sandy || 0) >= 0.6 && staffed("showers") && !c.p.npc) {
    const r = BIZ.showers.recipes[c.p.wallet > 40 ? 1 : 0];   // deluxe soak when flush
    if (c.p.wallet >= r.pay + 2) return { biz: "showers", recipe: r, need: "spa" };
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
      debitBiz("shack", INGREDIENT_COST[r.raw], c.x, FLOOR_Y - 34);  // till buys the ingredients
      if (window._stats) {
        window._stats.staffMealPaid = (window._stats.staffMealPaid || 0) + r.pay;
        window._stats.staffMealCost = (window._stats.staffMealCost || 0) + INGREDIENT_COST[r.raw];
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
      const cust = { biz: c.errandBiz, recipe: c.errand.recipe, isCrab: true, crab: c,
        need: c.errand.need, x: c.x, spawnX: c.x, state: "waiting",
        patience: 90, maxPatience: 90, claimed: false, served: false };   // locals will wait
      customers.push(cust);
      c.errandCust = cust; c.dayState = "errand";
    }
  } else if (c.dayState === "errand") {
    const k = c.errandCust;
    if (!k) { c.dayState = "home"; startCommute(c, false); return; }
    const open = allCrabs().some(w => w.duty && !w.pendingOff && w.workBiz === k.biz);
    if (!open && k.state === "waiting" && !k.claimed) {
      k.state = "leaving"; k.happy = false;   // kitchen's dark - go home
      c.quip = { text: "CLOSED?! HMPH", t: 2.2 };
      return;
    }
    c.x = k.x; c.y = 166;   // stand in the queue, same line as tourists
  }
}
function finishErrand(k) {
  k.done = true;
  const c = k.crab;
  if (c.errandCust === k) {
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
  stepTo(c, tx, spd, dt, lane);   // diagonal into + along the lane (x-progress escapes colliders)
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
function abortChef(c) {
  if (c.kstate === "work" || c.kstate === "washing" || c.kstate === "toSlot") release(c);
  if (c.busTable) { c.busTable.busing = false; c.busTable = null; }
  c.kstate = "idle"; c.cust = null; c.carrying = null; c.stepIdx = 0;
}
function updateKitchen(c, dt) {
  if (c.cust && (c.cust.state === "leaving" || c.cust.served)) { abortChef(c); return; }
  const bizKey = c.workBiz, biz = BIZ[bizKey];
  const spd = crabMove(c) * 1.55;   // hustle: kitchens move quick
  if (c.kstate === "idle") {
    if (!c.pendingOff) {
      const o = customers.find(k => k.biz === bizKey && k.state === "waiting" && !k.claimed && !k.served);
      if (o) {
        o.claimed = true; c.cust = o; c.stepIdx = -1; c.kstate = "walk";
        const s0 = stationSpot(bizKey, biz.source, 0); setT(c, s0.x, s0.y);
        return;
      }
      // no orders? bus a dirty table
      const dirty = biz.tables && biz.tables.find(t => t.dishes > 0 && !t.busing);
      if (dirty) {
        dirty.busing = true; c.busTable = dirty; c.kstate = "toBus";
        setT(c, dirty.x + 2, dirty.y + 12);
        return;
      }
    }
    setT(c, biz.door + 4 + (Math.max(0, crabs.indexOf(c)) % 3) * 10, 146 + (Math.max(0, crabs.indexOf(c)) % 2) * 10);
    stepTo(c, c.tx, spd, dt, c.ty);
  } else if (c.kstate === "walk") {
    if (routedStep(c, spd, dt)) {
      if (c.stepIdx === -1) {
        if (ownerFunds(bizKey) < INGREDIENT_COST[c.cust.recipe.raw]) { c.kstate = "waitCash"; return; }
        debitBiz(bizKey, INGREDIENT_COST[c.cust.recipe.raw], c.x, FLOOR_Y - 40);
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
  } else if (c.kstate === "toBus") {
    if (routedStep(c, spd, dt)) {
      c.busTable.dishes = 0; c.busTable.busing = false; c.busTable = null;
      c.carrying = "dirty_dishes";
      const sk = stationSpot(bizKey, "sink", 0); setT(c, sk.x, sk.y);
      c.kstate = "toSink";
    }
  } else if (c.kstate === "toSink") {
    if (routedStep(c, spd, dt)) {
      const s = tryAcquire(bizKey, "sink");
      if (s >= 0) { c.slotKind = "sink"; c.slot = s; c.workMax = c.workT = 2.5 / crabWork(c); c.kstate = "washing"; }
    }
  } else if (c.kstate === "washing") {
    c.workT -= dt;
    if (c.workT <= 0) {
      release(c); c.carrying = null; c.kstate = "idle";
      if (window._stats) window._stats.bused = (window._stats.bused || 0) + 1;
      popText("SQUEAKY CLEAN", c.x - 10, FLOOR_Y - 30, [140, 220, 255]);
    }
  } else if (c.kstate === "waitCash") {
    if (ownerFunds(bizKey) >= INGREDIENT_COST[c.cust.recipe.raw]) {
      debitBiz(bizKey, INGREDIENT_COST[c.cust.recipe.raw], c.x, FLOOR_Y - 40);
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
      const speedy = c.slotKind === "board" || c.slotKind === "washer" ? chopMult() : cookMult();
      const mult = speedy / (crabWork(c) * (1 - 0.15 * (c.p.hunger || 0)));
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
        const so = stationSpot(bizKey, biz.out, 0); setT(c, so.x, so.y);
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
function serve(c) {
  const cust = c.cust;
  if (cust && cust.state === "waiting") {
    if (cust.isCrab) {
      const price = Math.min(Math.ceil(cust.recipe.pay * 1.25), Math.floor(cust.crab.p.wallet));
      cust.crab.p.wallet = Math.max(0, cust.crab.p.wallet - price);
      creditBiz(cust.biz, price, cust.x, 126);
      if (cust.crab.p.npc && bizOwner(cust.biz) === "player" && window._stats)
        window._stats.npcSpendAtPlayer = (window._stats.npcSpendAtPlayer || 0) + price;
      if (cust.need === "food") cust.crab.p.hunger = 0;
      if (cust.need === "clean") cust.crab.p.dirt = 0;
      if (cust.need === "fun") { cust.crab.p.bored = 0; cust.crab.quip = { text: "BEST DAY EVER!", t: 2.4 }; }
      if (cust.need === "spa") { cust.crab.p.sandy = 0; cust.crab.quip = { text: "SQUEAKY CLEAN!", t: 2.4 }; }
      popText(ITEM_NAMES[cust.recipe.icon], cust.x - 14, 116, [140, 255, 160]);
    } else {
      const tipMult = TRAITS[c.p.trait].tip * (1 - 0.3 * (c.p.dirt || 0))
        * (1 - ((c.p.sandy || 0) >= 0.66 ? 0.15 : 0));
      const tip = cust.recipe.pay * 0.5 * (cust.patience / cust.maxPatience) * tipMult;
      creditBiz(cust.biz, cust.recipe.pay + tip, cust.x, 126);
      popText(ITEM_NAMES[cust.recipe.icon], cust.x - 14, 116, [140, 255, 160]);
    }
    cust.served = true; cust.happy = true; sfx.ding();
    const tables = BIZ[cust.biz].tables;
    const seat = tables && !cust.isCrab ? tables.find(t => !t.occupant && t.dishes === 0) : null;
    if (seat) { seat.occupant = cust; cust.state = "toTable"; cust.table = seat; }
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
    } else if (k.state === "toTable") {
      const t = k.table;
      const d = Math.hypot(t.x + 10 - k.x, 0);
      if (d > 3) k.x += Math.sign(t.x + 10 - k.x) * 45 * dt;
      else { k.state = "dining"; k.dineT = 6 + Math.random() * 4; }
    } else if (k.state === "dining") {
      k.dineT -= dt;
      if (k.dineT <= 0) {
        k.table.dishes = Math.min(3, k.table.dishes + 1);
        k.table.occupant = null;
        creditBiz(k.biz, 5, k.x, 130);   // table tip on the way out
        popText("TABLE TIP", k.x - 10, 122, [140, 255, 160]);
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
    const open = Object.keys(BIZ).filter(b => bizUnlocked(b) && allCrabs().some(c => c.duty && c.workBiz === b));
    if (open.length) {
      const weights = open.map(b => b === "shack" ? 0.5 : b === "cleaners" ? 0.18 : b === "arcade" ? 0.22 : 0.1);
      let r = Math.random() * weights.reduce((a, v) => a + v, 0), pick = open[0];
      for (let i = 0; i < open.length; i++) { r -= weights[i]; if (r <= 0) { pick = open[i]; break; } }
      const inQueue = customers.filter(k => k.biz === pick && k.state !== "leaving").length;
      if (inQueue < QUEUE_MAX) customers.push(newCustomer(pick));
    }
    spawnT = spawnEvery() * (0.7 + Math.random() * 0.6);
  }
}

// ---------------------------------------------------------------- status text
function crabStatus(c) {
  if (c.dayState === "home") {
    if (darkness() > 0.7) return c.p.homeless ? "SLEEPING AT THE SHELTER" : "SLEEPING";
    return c.p.homeless ? "AT THE SHELTER" : "CHILLING AT HOME";
  }
  if (c.dayState === "working") {
    if (c.kstate === "work" && c.slotKind === "board") return "CHOPPING";
    if (c.kstate === "work" && c.slotKind === "grill") return "GRILLING";
    if (c.kstate === "work" && c.slotKind === "stall") return "RUNNING A SHOWER";
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
  const keys = ["chef", "knife", "flame", "expand", "ads", "_slot6"];
  for (let i = 0; i < 6; i++)
    BUTTONS.push({ key: keys[i], x: 4 + (i % 3) * 84, y: 199 + ((i / 3) | 0) * 20, w: 80, h: 18 });
}
function buttonKey(b) {
  if (b.key !== "_slot6") return b.key;
  if (UPS.cleaners.lvl === 0) return "cleaners";
  if (UPS.arcade.lvl === 0) return "arcade";
  return "shoes";
}
function tryBuy(key) {
  const u = UPS[key];
  if (u.lvl >= u.max || coins < upCost(u)) return;
  coins -= upCost(u); u.lvl++;
  if (key === "cleaners") {
    toast = { text: "SUDS N BUBBLES IS YOURS! ASSIGN A CRAB TO STAFF IT", t: 7 };
    popText("GRAND OPENING!", BIZ.cleaners.x0 + 40, 100, [140, 255, 160]);
  }
  if (key === "arcade") {
    toast = { text: "THE CLAWCADE IS YOURS! THE CREW WILL LOVE THIS", t: 7 };
    popText("GRAND OPENING!", BIZ.arcade.x0 + 40, 100, [140, 255, 160]);
  }
  if (key === "chef") {
    const p2 = makeCrabPersona(crabs.length + ((Math.random() * 6) | 0));
    const usedNames = new Set(crabs.map(k => k.p.name));
    if (usedNames.has(p2.name)) {
      const free = CRAB_NAMES.find(n => !usedNames.has(n));
      if (free) p2.name = free;
    }
    const used = new Set(crabs.filter(k => !k.p.homeless).map(k => k.p.house));
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
  if (Math.abs(p.x - dragStartX) > 4) { dragMoved = true; followIdx = -1; }
  if (dragMoved) camX = clampCam(dragCamX - (p.x - dragStartX));
});
addEventListener("mouseup", () => { dragging = false; setTimeout(() => { dragMoved = false; }, 50); });
cv.addEventListener("touchstart", (ev) => {
  const t = ev.touches[0];
  const p = evPos(t);
  if (p.y < PANEL_Y) { dragging = true; dragStartX = p.x; dragCamX = camX; dragMoved = false; }
}, { passive: true });
cv.addEventListener("touchmove", (ev) => {
  if (!dragging) return;
  ev.preventDefault();
  const p = evPos(ev.touches[0]);
  if (Math.abs(p.x - dragStartX) > 6) { dragMoved = true; followIdx = -1; }
  if (dragMoved) camX = clampCam(dragCamX - (p.x - dragStartX));
}, { passive: false });
cv.addEventListener("touchend", () => { setTimeout(() => { dragging = false; dragMoved = false; }, 50); });
function evPos(ev) {
  const r = cv.getBoundingClientRect();
  return { x: (ev.clientX - r.left) * (cv.width / r.width), y: (ev.clientY - r.top) * (cv.height / r.height) };
}
function clampCam(x) { return Math.max(0, Math.min(WORLD_W - W, x)); }

cv.addEventListener("click", (ev) => {
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
  startMusic();
  const p = evPos(ev);
  if (dragMoved) return;
  // panel
  if (p.y >= PANEL_Y) {
    if (p.y < 186) {
      if (p.x > 228) { ffMode = ffMode === 2 ? 0 : 2; sfx.ding(); return; }
      if (p.x > 212) { ffMode = ffMode === 1 ? 0 : 1; sfx.ding(); return; }
      if (p.x > 188) { soundOn = !soundOn; if (soundOn) sfx.ding(); return; }
      if (p.x > 168) { toggleMusic(); return; }
      if (p.x >= 145 && p.x <= 166) { toggleMute(); if (!muted) sfx.ding(); return; }
    }
    if (p.y >= 187 && p.y < 197) {
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
    } else {
      for (let i = 0; i < crabs.length; i++) {
        const bx = 4 + i * 27;
        if (p.x >= bx && p.x < bx + 24 && p.y >= 199 && p.y < 223) {
          followIdx = followIdx === i ? -1 : i; return;
        }
      }
    }
    return;
  }
  // follow-card job toggle
  if (followIdx >= 0 && (UPS.cleaners.lvl > 0 || UPS.arcade.lvl > 0) && p.x >= 58 && p.x < 71 && p.y >= 33 && p.y < 45) {
    const c = crabs[followIdx];
    const owned = Object.keys(BIZ).filter(bizUnlocked);
    c.p.job = owned[(owned.indexOf(c.p.job) + 1) % owned.length];
    sfx.buy();
    popText("NEW JOB: " + BIZ[c.p.job].name, c.x - 20, FLOOR_Y - 34, [140, 255, 160]);
    return;
  }
  // world: click a crab to follow it
  const wx = p.x + camX;
  for (let i = 0; i < crabs.length; i++) {
    const c = crabs[i];
    if (!c.hidden && Math.abs(wx - (c.x + 8)) < 12 && Math.abs(p.y - (c.y - 6)) < 14) {
      followIdx = i; return;
    }
  }
});
addEventListener("keydown", (e) => {
  if (e.key === "m") { toggleMute(); if (!muted) sfx.ding(); }
  if (e.key === "n") toggleMusic();
  if (e.key === "b" && musicOn) playTrack(trackIdx + 1);   // next track
  if (e.key === "f") ffMode = (ffMode + 1) % 3;            // fast-forward 1x/2x/3x
  if (e.key === "ArrowLeft") { camX = clampCam(camX - 24); followIdx = -1; }
  if (e.key === "ArrowRight") { camX = clampCam(camX + 24); followIdx = -1; }
  if (e.key === "Escape") followIdx = -1;
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

function drawTown() {
  // coast road runs the full length of town, behind everything
  wrect(0, ROAD_Y0, WORLD_W, ROAD_Y1 - ROAD_Y0, [120, 116, 130]);
  wrect(0, ROAD_Y0, WORLD_W, 2, [90, 86, 100]);
  wrect(0, ROAD_Y1 - 2, WORLD_W, 2, [90, 86, 100]);
  for (let x = 6; x < WORLD_W; x += 22) wrect(x, ROAD_Y0 + 9, 10, 2, [230, 220, 120]);
  wrect(0, ROAD_Y1, WORLD_W, 3, [214, 196, 156]);   // shoulder
  // houses face the promenade (owned ones get the owner's roof color)
  for (const c of crabs)
    if (!c.p.homeless) wblit(HOUSES2[c.p.color % HOUSES2.length], HOUSE_XS[c.p.house], HOME_BOTTOM - HOUSES2[0].h);
  // the crab shelter
  wblit(SHELTER2, SHELTER_X, HOME_BOTTOM - SHELTER2.h);
  if (SHELTER_X - camX > -80 && SHELTER_X - camX < W) {
    smallText(ctx, "SHELTER", SHELTER_X + 22 - camX, HOME_BOTTOM - SHELTER2.h + 3, [30, 20, 36]);
    smallText(ctx, "SHELTER", SHELTER_X + 21 - camX, HOME_BOTTOM - SHELTER2.h + 2, [240, 235, 220]);
  }
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

const STATION_ART = { crate: CRATE, board: BOARD, grill: GRILL, pass: PASS, sink: SINK,
  taps: TAPS, stall: null, scrub: SCRUB, towel: COUNTER,
  basket: BASKET, washer: null, dryer: DRYER, counter: COUNTER,
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
  if (kind === "washer") art = WASHER[isBusy ? ((time * 6) | 0) % 2 : 0];
  if (kind === "claw") art = CLAW_MACHINE[isBusy ? ((time * 4) | 0) % 2 : 0];
  if (kind === "stall") art = STALL[isBusy ? 1 : 0];
  wblit(art, st.x, st.y - art.h);
  if (kind === "grill" && isBusy) wblit(FLAME[((time * 8) | 0) % 2], st.x + 6, st.y - GRILL.h - 4);
}

function drawSwoop() {
  // every so often a gull dives at the snack queue
  const T = time % 41;
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

function drawCrab(c) {
  if (c.hidden) return;
  const arts = CRAB_ARTS[c.p.color];
  const riding = (c.cstate === "drive");
  if (riding && c.p.mode === "buggy") {
    wblit(BUGGIES2[c.p.color], c.x - 16, ROAD_Y1 - BUGGIES2[0].h, c.flip);
    return;
  }
  const working = (c.kstate === "work" || c.kstate === "washing") && c.dayState === "working";
  const moving = c.dayState !== "home" || Math.hypot((c.tx || c.x) - c.x, (c.ty || c.y) - c.y) > 2;
  let art;
  if (working) art = ((c.animT * 6) | 0) % 2 ? arts.w : arts.a;
  else if (moving) art = ((c.animT * 8) | 0) % 2 ? arts.a : arts.b;
  else art = arts.a;
  const bob = working ? -(((c.animT * 6) | 0) % 2) : 0;
  let y = c.y - 12 + bob;
  if (riding && c.p.mode === "bike") {
    wblit(BIKE, c.x - 2, ROAD_Y1 - 8, c.flip);
    y = ROAD_Y1 - 8 - 11;
    wblit(art, c.x, y, c.flip);
  } else {
    wblit(art, c.x, y, c.flip);
  }
  // hat: toque on duty, personal accessory otherwise
  const accKey = c.duty ? "toque" : c.p.acc;
  const acc = ACCESSORIES[accKey];
  if (acc) {
    const ax = c.flip ? 16 - acc.dx - acc.art.w : acc.dx;
    wblit(acc.art, c.x + ax, y + acc.dy, c.flip);
  }
  if ((c.p.dirt || 0) >= 0.66) wblit(DIRT, c.x, y, c.flip);
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
      const moving = k.state !== "waiting";
      const art = moving && ((k.animT * 8) | 0) % 2 ? arts.b : arts.a;
      const flip = k.state !== "leaving";
      const cy = FLOOR_Y - 12;
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
    if (k.state === "waiting" && !k.served) {
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
function drawFollowCard() {
  if (followIdx < 0 || !crabs[followIdx]) return;
  const c = crabs[followIdx], p = c.p;
  const wcard = 128;
  rect(ctx, 2, 2, wcard, 52, [30, 20, 36]);
  rect(ctx, 3, 3, wcard - 2, 50, [255, 250, 235]);
  rect(ctx, 5, 6, 20, 26, [200, 230, 245]);
  blit(ctx, CRAB_ARTS[p.color].a, 7, 14);
  const acc = ACCESSORIES[c.duty ? "toque" : p.acc];
  if (acc) blit(ctx, acc.art, 7 + acc.dx, 14 + acc.dy);
  text(ctx, p.name, 29, 5, [40, 30, 40]);
  const [mood, mcol] = crabMood(c);
  smallText(ctx, mood, 126 - smallTextWidth(mood), 6, mcol);
  smallText(ctx, TRAITS[p.trait].label + " " + MODES[p.mode].label, 29, 13, [120, 90, 60]);
  smallText(ctx, crabStatus(c), 29, 21, [30, 110, 60]);
  smallText(ctx, "SHIFT " + SHIFTS[p.shift].label, 29, 28, [110, 110, 130]);
  const wTxt = "$" + fmt(Math.max(0, p.wallet));
  const wx3 = 126 - textWidth(wTxt, 5);
  text(ctx, wTxt, wx3, 28, p.homeless ? [190, 80, 80] : [140, 110, 40], 5);
  const trend = p.walletPrev == null ? 0 : p.wallet - p.walletPrev;
  if (trend) smallText(ctx, trend > 0 ? "+" : "-", wx3 - 6, 29, trend > 0 ? [40, 150, 70] : [190, 80, 80]);
  // job + needs
  smallText(ctx, "JOB:" + BIZ[p.job].short, 6, 36, [70, 90, 130]);
  if (UPS.cleaners.lvl > 0 || UPS.arcade.lvl > 0) {
    rect(ctx, 60, 35, 9, 8, [96, 170, 220]);
    smallText(ctx, ">", 62, 36, [255, 255, 255]);
  }
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
  text(ctx, ">>", 214, PANEL_Y + 2, ffMode === 1 ? [255, 230, 120] : [150, 132, 122]);
  text(ctx, ">>>", 230, PANEL_Y + 2, ffMode === 2 ? [255, 230, 120] : [150, 132, 122]);
  // tabs
  for (const [i, t] of [["crew", 0], ["shop", 1]].map((v, i) => [i, v[0]])) {
    const x = 4 + i * 34, active = tab === t;
    rect(ctx, x, 187, 32, 10, active ? [190, 140, 80] : [90, 70, 60]);
    smallText(ctx, t.toUpperCase(), x + 4, 189, active ? [40, 24, 16] : [160, 140, 130]);
  }
  const rate = incomeRate();
  const rateTxt = rate >= 100 ? "$" + Math.round(rate) + "/S" : "$" + rate.toFixed(1) + "/S";
  text(ctx, rateTxt.slice(0, 7), 84, 189, [170, 150, 135]);
  {
    const conf = newConfirmT > 0;
    rect(ctx, 128, 187, 30, 10, conf ? [140, 40, 40] : [90, 70, 60]);
    smallText(ctx, conf ? "SURE?" : "NEW", 128 + (conf ? 3 : 7), 189, conf ? [255, 200, 200] : [160, 140, 130]);
  }
  const due = nightlyDue();
  const rTxt = "BILL $" + fmt(due);
  const chipW = textWidth(rTxt, 5) + 8;
  const crunch = coins < due && tmin >= 18 * 60 && tmin < 20 * 60 && ((time * 2) | 0) % 2;
  rect(ctx, 252 - chipW, 186, chipW, 11, crunch ? [150, 40, 40] : tab === "menu" ? [190, 140, 80] : [90, 70, 60]);
  text(ctx, rTxt, 252 - chipW + 4, 188, coins < due ? [255, 140, 140] : tab === "menu" ? [40, 24, 16] : [200, 185, 170], 5);

  if (tab === "menu") {
    smallText(ctx, "MENU - PRICE / COST", 4, 199, [230, 215, 195]);
    let my = 206;
    for (const key of Object.keys(BIZ)) {
      if (!bizUnlocked(key)) continue;
      for (const r of BIZ[key].recipes) {
        smallText(ctx, ITEM_NAMES[r.icon], 4, my, [190, 175, 160]);
        smallText(ctx, "$" + r.pay + " / $" + INGREDIENT_COST[r.raw], 72, my, [140, 200, 150]);
        my += 6;
      }
    }
    smallText(ctx, "TONIGHT AT 20:00", 132, 199, [230, 215, 195]);
    let by = 206;
    smallText(ctx, "WAGES " + crabs.length + "X$" + CRAB_WAGE, 132, by, [190, 175, 160]);
    smallText(ctx, "$" + CRAB_WAGE * crabs.length, 224, by, [235, 160, 130]); by += 6;
    for (const key of Object.keys(BIZ)) {
      if (!bizUnlocked(key)) continue;
      smallText(ctx, BIZ[key].short + " RENT", 132, by, [190, 175, 160]);
      smallText(ctx, "$" + (day <= 1 && key === "shack" ? 0 : BIZ[key].rent), 224, by, [235, 160, 130]); by += 6;
    }
    smallText(ctx, "TOTAL", 132, by, [230, 215, 195]);
    smallText(ctx, "$" + fmt(due), 224, by, coins < due ? [255, 140, 140] : [255, 230, 120]);
    smallText(ctx, "CRABS PAY THEIR OWN", 132, by + 8, [150, 135, 125]);
    smallText(ctx, "$" + HOUSE_RENT + " HOUSE RENT", 132, by + 14, [150, 135, 125]);
  } else if (tab === "shop") {
    for (const b of BUTTONS) {
      const key = buttonKey(b);
      const u = UPS[key];
      const maxed = u.lvl >= u.max, cost = upCost(u);
      const afford = coins >= cost && !maxed;
      rect(ctx, b.x, b.y, b.w, b.h, [30, 20, 20]);
      rect(ctx, b.x + 1, b.y + 1, b.w - 2, b.h - 2, afford ? (key === "cleaners" ? [96, 170, 220] : [190, 140, 80]) : [96, 78, 68]);
      const nameCol = afford ? [40, 24, 16] : [160, 145, 135];
      const lvl = key === "chef" ? String(u.lvl) : (u.lvl > 0 && key !== "cleaners" ? String(u.lvl) : "");
      smallText(ctx, u.name + (lvl ? " " + lvl : ""), b.x + 3, b.y + 2, nameCol);
      text(ctx, maxed ? "MAX" : "$" + fmt(cost), b.x + 3, b.y + 10, maxed ? [160, 145, 135] : afford ? [80, 45, 20] : [140, 125, 115], 5);
    }
  } else {
    for (let i = 0; i < crabs.length; i++) {
      const c = crabs[i], bx = 4 + i * 27;
      const sel = followIdx === i;
      rect(ctx, bx, 199, 24, 24, sel ? [255, 230, 120] : [30, 20, 20]);
      rect(ctx, bx + 1, 200, 22, 22, [200, 230, 245]);
      blit(ctx, CRAB_ARTS[c.p.color].a, bx + 4, 206);
      const acc = ACCESSORIES[c.duty ? "toque" : c.p.acc];
      if (acc) blit(ctx, acc.art, bx + 4 + acc.dx, 206 + acc.dy);
      rect(ctx, bx + 18, 201, 4, 4, c.duty ? [96, 232, 120] : [150, 140, 140]);
      smallText(ctx, c.p.name.slice(0, 5), bx + 1, 224, [220, 210, 190]);
    }
    if (!crabs.length) text(ctx, "NO CREW YET", 8, 206, [190, 170, 150]);
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
    ["YOUR FIRST NIGHT IS FREE", [40, 130, 60]],
    ["CREW WAGES: $" + CRAB_WAGE + " EACH, NIGHTLY", [70, 70, 90]],
    ["CREW PAY THEIR OWN $" + HOUSE_RENT + " HOME RENT", [70, 70, 90]],
    ["THE LAUNDROMAT? $" + UPS.cleaners.base + ", RENT $" + BIZ.cleaners.rent, [70, 70, 90]],
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
  textShadow(ctx, "EVICTED!", cx2 - textWidth("EVICTED!") / 2, 76, [230, 60, 70], [120, 30, 40]);
  text(ctx, "THE LANDLORD CRAB TOOK", cx2 - 66, 92, [90, 60, 50], 6);
  text(ctx, "BACK THE SHACK", cx2 - 41, 101, [90, 60, 50], 6);
  text(ctx, "NIGHTLY RENT OWED $" + fmt(totalRent()), cx2 - 66, 114, [140, 60, 60], 6);
  smallText(ctx, "SURVIVED " + day + " DAYS  EARNED $" + fmt(lifetime), cx2 - 78, 124, [90, 90, 110]);
  const bl = ((time * 2) | 0) % 2;
  if (bl) text(ctx, "CLICK TO START OVER", cx2 - 56, 137, [40, 110, 60], 6);
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
  const dt = Math.min(0.1, (now - last) / 1000) * TURBO * (1 + ffMode);
  last = now; time += dt;
  if (!gameOver && screen === "play") tmin += dt * TS;
  if (tmin >= 1440) { tmin -= 1440; day++; }
  if (screen === "play" && tmin >= 20 * 60 && lastRentDay !== day) {
    lastRentDay = day;
    for (const c of crabs) c.p.walletPrev = c.p.wallet;
    (window.dayLog = window.dayLog || []).push({ day, close: Math.round(coins) });
    // 1. wages: pay every crab you can afford
    let wages = 0;
    for (const c of crabs) {
      if (coins >= CRAB_WAGE) { coins -= CRAB_WAGE; c.p.wallet += CRAB_WAGE; wages += CRAB_WAGE; }
      else popText("NO PAY?!", c.x, FLOOR_Y - 30, [255, 120, 120]);
    }
    if (wages > 0) earnHist.push({ t: time, amt: -wages });
    // 2. house rent from each crab's own wallet; broke crabs move to the shelter
    let evictedNames = [];
    for (const c of crabs) {
      c.p.sandy = Math.min(1, (c.p.sandy || 0) + 0.05);
      if (c.p.homeless) {
        // shelter is free; move back into a free house once savings allow
        const used = new Set(crabs.filter(k => !k.p.homeless).map(k => k.p.house));
        let free = -1;
        for (let h = 0; h < HOUSE_XS.length; h++) if (!used.has(h)) { free = h; break; }
        if (free >= 0 && c.p.wallet >= MOVE_IN_COST + HOUSE_RENT) {
          c.p.wallet -= MOVE_IN_COST; c.p.house = free; c.p.homeless = false;
          toast = { text: c.p.name + " MOVED INTO A HOUSE!", t: 5 };
          popText("HOME SWEET HOME", HOUSE_XS[free] + 8, 100, [140, 255, 160]);
          sfx.ding();
        }
      } else if (c.p.wallet >= HOUSE_RENT) {
        c.p.wallet -= HOUSE_RENT;
      } else {
        c.p.homeless = true;
        evictedNames.push(c.p.name);
        popText(c.p.name + " LOST THEIR HOUSE", c.x - 12, FLOOR_Y - 34, [255, 120, 120]);
      }
    }
    if (evictedNames.length) {
      toast = { text: evictedNames.join(", ") + " MOVED TO THE SHELTER", t: 6 };
      sfx.angry();
    }
    // 2b. peer owners settle their own books (no NPC eviction cascade yet - TODO)
    for (const b of Object.keys(BIZ)) {
      if (bizOwner(b) === "player") continue;
      const o = OWNERS[bizOwner(b)];
      if (o && o.till >= BIZ[b].rent && day > 1) o.till -= BIZ[b].rent;
    }
    for (const c of npcs) {
      c.p.hunger = Math.min(1, (c.p.hunger || 0) + 0.1);
      c.p.sandy = Math.min(1, (c.p.sandy || 0) + 0.05);
    }
    // 3. property rents across every business you hold: miss and it's over
    const rent = totalRent();
    if (coins >= rent) {
      coins -= rent;
      earnHist.push({ t: time, amt: -rent });
      if (!evictedNames.length && !toast) toast = { text: rent === 0
        ? "FIRST NIGHT FREE - WELCOME TO THE BOARDWALK!"
        : "PAID $" + fmt(wages) + " WAGES + $" + fmt(rent) + " RENT", t: 5 };
      if (rent > 0) popText("-$" + rent + " RENT", BIZ.shack.door, 110, [255, 120, 120]);
      sfx.buy(); save();
    } else {
      gameOver = true; toast = null; save();
      if (music) { music.pause(); music = null; }
      sfx.angry();
    }
  }

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
  updateCustomers(dt);
  for (const c of allCrabs()) {
    c.animT += dt;
    c._stepped = false;
    updateSchedule(c, dt);
    if (c.dayState === "toWork" || c.dayState === "toHome") updateCommute(c, dt);
    else if (c.dayState === "toErrand" || c.dayState === "errand") updateErrand(c, dt);
    else if (c.dayState === "selfCook") updateSelfCook(c, dt);
    else if (c.dayState === "working") updateKitchen(c, dt);
    else if (c.dayState === "home") updateHome(c, dt);
    maybeQuip(c, dt);
  }
  if (followIdx >= 0 && crabs[followIdx]) {
    const t = clampCam(crabs[followIdx].x - W / 2 + 8);
    camX += (t - camX) * Math.min(1, dt * 5);
  }
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
    const tables = BIZ[key].tables;
    if (!tables || !bizUnlocked(key)) continue;
    for (const t of tables) paint.push({ base: t.y, f: () => {
      wblit(PICNIC_TABLE, t.x, t.y - PICNIC_TABLE.h);
      if (t.dishes > 0) wblit(DISHES[t.dishes - 1], t.x + 6, t.y - PICNIC_TABLE.h - DISHES[t.dishes - 1].h + 1);
    } });
  }
  for (const k of customers) paint.push({ base: k.state === "dining" ? (k.table.y + 1) : (k.isCrab ? 165 : FLOOR_Y), f: () => drawCustomer(k) });
  for (const c of allCrabs()) paint.push({ base: c.cstate === "drive" ? ROAD_Y1 : c.y, f: () => drawCrab(c) });
  paint.push({ base: FLOOR_Y, f: drawLandlord });
  paint.sort((a, b) => a.base - b.base);
  for (const e of paint) e.f();
  drawSwoop();
  drawFloaters(dt);
  drawNight();
  drawFollowCard();
  drawPanel();
  drawToast();
  if (gameOver) drawGameOver();
  requestAnimationFrame(frame);
}

document.addEventListener("visibilitychange", () => { if (document.hidden) save(); else last = performance.now(); });
addEventListener("beforeunload", save);

initNpcs();
hasSave = load();
if (!hasSave) {
  crabs = [newCrab(makeCrabPersona(0)), newCrab(makeCrabPersona(1))];
  coins = 180;   // opening cash: ingredients + first rent buffer
}
requestAnimationFrame(frame);

// console cheat for tinkering: cheat(500)
window.cheat = (n) => { coins += n || 100; };
