// CRAB SHACK 2 — a whole beachside town. Crabs have names, moods, shift
// schedules, and commutes: they walk, bike, ride the bus, or drive their
// beach buggy to work at the shack. Click a crab (or its portrait) to
// follow it around town.

"use strict";

const cv = document.getElementById("screen");
const ctx = cv.getContext("2d");
ctx.imageSmoothingEnabled = false;

// ---------------------------------------------------------------- geometry
// The town grew east in 2026-08-19's visitor pass: past the last beach cottage
// there is now the DRIFTWOOD HOTEL and, off the end of the pier, the mainland
// ferry's berth. Everything west of 2192 is exactly where it always was.
const WORLD_W = 2512;
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
const JOB_BOARD_X = 716;   // the town labor market
// NPC_WAGE (a flat 20 for anybody an NPC employed, against the crew's 23 for
// the same work) is RETIRED. Wages are per-business data now, and a business
// pays what it pays whoever works there - see WAGE_STD / bizWage below. This
// closes the last "some crabs are more real than others" gap PLAN records.
const PIER_X0 = 1870, PIER_X1 = 2040, PIER_Y = 96;   // planks over the east break
const FISHING_SPOTS = [{ x: 1900, y: PIER_Y }, { x: 1956, y: PIER_Y }, { x: 2012, y: PIER_Y }];
// the rail holds more than three: late arrivals shoulder in beside the
// regulars (14px per wrap keeps the last spot at the pier's end post)
function fishSpotFor(i) {
  const b = FISHING_SPOTS[i % FISHING_SPOTS.length];
  return { x: b.x + 14 * Math.floor(i / FISHING_SPOTS.length), y: b.y };
}
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
// ------------------------------------------------------------ the public tap
// WATER IS NOT A LUXURY GOOD. Before this, the only way to quench a thirst was
// to BUY a drink from a STAFFED counter - so a crab whose own shift covered
// every hour the counters were staffed (SUDSY, the fishers, anyone on a long
// day) could go a fortnight without a single drink, and townsfolk had no
// self-serve fallback at all. That is an environment bug, not a crab bug, and
// the fix is environmental: the town has taps. Two standpipes, free, always
// on, no queue, no staff, no till - the floor under every crab's thirst.
//
// The JUICE BAR keeps its business by design, three ways:
//   1. plain water only QUENCHES (TAP_QUENCH off the meter); a juice ZEROES it,
//      so a bought drink buys about twice the runway,
//   2. the tap is no treat - TAP_APPEAL halves its pull in the errand score, so
//      a crab standing near a counter it can afford still buys the juice,
//   3. it is slower: a real stop at the spout, not a plate handed over.
// The taps also carry a COLD RINSE for a crab who is filthy and cannot get to
// a shower - deliberately worse than a $5 rinse and pitched far above the
// shower threshold, so it only ever catches crabs the showers were never
// going to serve (see pickErrand).
const WATER_TAPS = [
  { x: 640, name: "THE TOWN TAP" },    // promenade, beside the notice board
  { x: 1844, name: "THE PIER TAP" },   // foot of the pier, where the catch gets hosed down
];
// THE STANDING RULE FOR SELF-HEALING (Matt, 2026-08-19): "deficiency should
// encourage player intervention but have some potential for auto resolution,
// just make it difficult." So every free cure in this game is a LAST RESORT
// that costs TIME, never money: it stops a death spiral, it never pays the
// rent. A crab who lives at the tap is a crab who isn't working - which is a
// cost the player feels without a single coin changing hands.
const TAP_AT = 0.72;         // you'd BUY a drink at 0.45; you trudge to the standpipe only
                             // when you're genuinely parched. The gap is the whole design:
                             // the juice bar gets first refusal, free water picks up what
                             // the counters could not - and it picks it up SLOWLY.
const TAP_QUENCH = 0.5;     // a mouthful, not a drink: a juice zeroes thirst, water takes
                             // the edge off, so the parched crab is back within the hour
const TAP_SIP = 6;         // a long draw at the spout - minutes of the working day, gone
const TAP_APPEAL = 0.35;      // a poor third to anything a counter can hand you
const TAP_CD = 20;           // errand cooldown after a sip
const TAP_RINSE = 0.35;      // a cold rinse under the spout: worse than a $5 shower
const TAP_RINSE_AT = 0.85;   // ...and only when filthy - the showers own 0.66 upward
const TAP_RINSE_SICK = 0.66; // an ill crab hoses down at the CARED bar, shower or no shower
// ---------------------------------------------------------- the shelter pot
// (Matt, 2026-08-19: "I feel like sick crabs dont get food or clean or
// anything; seems like a problem.") He was right, and the measurement was
// worse than the report: mean hunger while ill ran 0.799 against 0.534 well.
// The cause was not the sickness rules - a sick crab already picks food
// errands - it was MONEY. A sick day pays nothing, the wallet sticks near $12,
// the cheapest local plate is $15, and of every tick where a sick hungry crab
// could not buy food, 1800 were NPCS AND ZERO WERE THE PLAYER'S CREW. It is
// the townsfolk who starve, because they have no wage coming in.
//
// Water already had a floor - the public taps. Food had none. The pot is that
// floor, and it obeys the same standing rule the taps do: a last resort that
// costs TIME rather than money. It is deliberately worse than eating - you
// queue at the far end of the promenade, it takes longer than a mouthful at
// the spout, and it takes the edge off rather than filling you up.
//
// WHAT IS DIFFERENT FROM THE FIRST CUT: it is FUNDED. The first version handed
// out free food and Matt caught it - "these resources don't come from nowhere."
// Every bowl on this step was bought from the shack last night at bowlCost()
// with the town fund's money, and if the fund could not afford one there is
// nothing in the pot (see stockPot / potWarm). A cold pot is the failure mode,
// not an edge case.
const SOUP_X = SHELTER_X + 10;   // the pot is on the shelter's own step
const SOUP_AT = 0.80;        // you would BUY a plate at 0.50; you queue here only when starving
const SOUP_SICK_AT = 0.62;   // ...unless you are ill, when the floor has to be reachable
const SOUP_FILL = 0.45;      // a thin bowl. A real meal zeroes hunger; this takes the edge off
const SOUP_MINS = 11;        // longer than TAP_SIP: it is a queue, not a spout
const SOUP_CD = 20;          // and you cannot live in the line
// the memorial plot: three markers to a row on the dune between the last
// promenade lot (ends x440... the shelter and house 6 fill 444-572) and the
// town tap at 640, rows stacking up the sand
const MEM_X0 = 576, MEM_DX = 32, MEM_PER_ROW = 2, MEM_DY = 16;   // pitch fits the longest crab name without the labels running together
function memorialSpot(i) {
  const j = i % (MEM_PER_ROW * 3);
  return { x: MEM_X0 + (j % MEM_PER_ROW) * MEM_DX,
    y: HOME_BOTTOM - MEMORIAL.h + 1 - ((j / MEM_PER_ROW) | 0) * MEM_DY };
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
    // THE DINING ROOM. Two rows, and every table sits in one of them because
    // the two travel lanes (y=146 and y=168) have to keep their daylight: a
    // table's solid band is y-9..y+6, so the BACK row must end above 144 and
    // the FRONT row must start below 148 and end above 166. The new tables
    // (levels 3 and 4) extend the back row WEST along the free wall between
    // the chopping boards (x<=1325) and the old back pair - the only stretch
    // of the shack with room for a table that is not a station, a queue slot
    // or a lane. Suite tripwire: `routes: both travel lanes are clear`.
    tables: [
      { x: 1492, y: 158, dishes: 0, occupant: null, dirty: false, cleaning: false },
      { x: 1532, y: 158, dishes: 0, occupant: null, dirty: false, cleaning: false },
      { x: 1484, y: 134, dishes: 0, occupant: null, dirty: false, cleaning: false },
      { x: 1524, y: 134, dishes: 0, occupant: null, dirty: false, cleaning: false },
      { x: 1444, y: 134, dishes: 0, occupant: null, dirty: false, cleaning: false },
      { x: 1404, y: 134, dishes: 0, occupant: null, dirty: false, cleaning: false },
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
  juicebar: {
    // the vacated cleaners lot: a squeeze-and-go stand east of the job board
    name: "JUICE BAR", short: "JUICE", sign: "JUICE BAR", kind: "shopfront", rent: 55, owner: "player",
    x0: 752, x1: 880, door: 766,
    stations: {
      fruitbin: [{ x: 758, y: 136 }],
      juicer:   [{ x: 794, y: 136 }, { x: 816, y: 136 }],
      bar:      [{ x: 848, y: 160 }],
    },
    source: "fruitbin", out: "bar", queueX: 884,
    park: 600, rack: 668,
    recipes: [
      { id: "juice", icon: "juice", pay: 6, raw: "fruit",
        steps: [["juicer", 1.8, "juice"]] },
      { id: "cooler", icon: "cooler", pay: 9, raw: "fruit", raw2: "water",
        steps: [["juicer", 2.4, "cooler"]] },
    ],
  },
  // ------------------------------------------------------------ the hotel
  // THE DRIFTWOOD HOTEL. A business like any other - stations, a recipe, a
  // queue, rent, an owner with a till, hours, staff, wages, a policy - whose
  // "dish" is A NIGHT'S STAY: the linen press makes up a room, the front desk
  // hands over the key, and the guest walks to a door on the back wall.
  //
  // THE ROOMS ARE `stalls` ON PURPOSE. Every wedge guard, cleaning dispatch
  // and abort path in this game already knows what to do with a facility that
  // a guest OCCUPIES and staff must CLEAN afterwards - it is the shower
  // stalls' cycle with a longer occupancy. `lodging` is the one bit that says
  // "the guest keeps this until morning" instead of "for showerT seconds".
  hotel: {
    name: "DRIFTWOOD HOTEL", short: "HOTEL", sign: "DRIFTWOOD HOTEL", kind: "shopfront",
    // A ROOM IS THE PRICIEST THING IN TOWN ($22 against a $17 taco), and the
    // rent on a seven-room seafront lease is priced to match: a full house is
    // $154 against $60, five rooms is $110, four is break-even-plus, and a
    // night when housekeeping falls behind genuinely hurts.
    // THE RENT IS ALSO A LABOUR-MARKET KNOB, and that is measured. REEF's till
    // is what decides when he posts on the job board (till >= 260), and the
    // only crabs free to answer are the two FISHERS - so a hotel that got rich
    // by day two took one of them off the rail, the catch halved, and the pier
    // price pinned at the $7 import ceiling from day five, which cost the
    // player's kitchen ~$30 a day at exactly the wrong moment. At rent 60 and
    // an opening float of $140 he reaches the hiring line around day six, by
    // which time the ceiling posting has pulled a drifter in to replace them.
    rent: 35, owner: "reef", lodging: true,
    // REEF has no heir and a fair price will always tempt him: this is the
    // "mechanism for owning it" the directive asked for, and it is DATA - any
    // business that carries `sellable` grows an OFFER chip on its shopfront.
    sellable: true,
    x0: 2200, x1: 2428, door: 2212,
    stations: {
      linen: [{ x: 2206, y: 136 }],
      desk:  [{ x: 2234, y: 160 }],
    },
    // SEVEN rooms along the back wall, on the shower stalls' y so the two
    // travel lanes keep their daylight by construction (band y127..142). Seven
    // is a measured number, not a round one: at five, half of every night's
    // overnighters ended up on the sand and the town's reputation - which is
    // what fills the boat - never recovered. Seven sits just above a saturated
    // town's demand, so the nights somebody sleeps rough are the nights the
    // hotel was BADLY RUN (the owner's day off, housekeeping behind, a shop
    // that has gone dark) rather than a standing fact about the town.
    stalls: [
      { x: 2244, y: 136, occupant: null, dirty: false, cleaning: false },
      { x: 2272, y: 136, occupant: null, dirty: false, cleaning: false },
      { x: 2300, y: 136, occupant: null, dirty: false, cleaning: false },
      { x: 2328, y: 136, occupant: null, dirty: false, cleaning: false },
      { x: 2356, y: 136, occupant: null, dirty: false, cleaning: false },
      { x: 2384, y: 136, occupant: null, dirty: false, cleaning: false },
      { x: 2412, y: 136, occupant: null, dirty: false, cleaning: false },
    ],
    source: "linen", out: "desk", queueX: 2432,
    park: 2180, rack: 2196,
    recipes: [
      { id: "room", icon: "roomkey", pay: 13, raw: "linen",
        steps: [["linen", 2.2, "roomkey"]] },
    ],
  },
  showers: {
    name: "SUDS SHOWERS", short: "SHWR", sign: "SUDS SHOWERS", kind: "shopfront", rent: 35, owner: "sudsy",
    // SUDSY OPENS BELOW THE MARKET, at the old flat NPC_WAGE. That is the ONLY
    // place the retired 20 survives, and it is now a fact about her SHOP, not
    // about the crabs in it - anybody who works there gets $20, crew included,
    // and any crab she hires can grumble, get poached, or watch her wage policy
    // walk her up to the town rate. See WAGE_STD.
    wage: 20,
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

// ---------------------------------------------------------------- open hours
// Every business keeps real OPEN HOURS (default 8:00-20:00 - exactly the old
// hard-coded trading day, so a fresh or migrated save behaves identically
// until somebody changes something). Hours gate tourist admission, errand
// patronage, the CLOSED sign, and anchor the staff shifts (shift windows
// DERIVE from hours - see bizShiftWindow). Sanity bounds keep schedules
// non-degenerate: 6:00-24:00, at least 4h open. Player-owned shops are tuned
// on the MANAGEMENT screen (tap a shop's sign); NPC owners tune their own
// via HOURS_POLICY below.
const HOURS_MIN = 6 * 60, HOURS_MAX = 24 * 60, HOURS_SPAN_MIN = 4 * 60;
// ---------------------------------------------------------------- the wage
// THE WAGE IS A SETTING. Every business carries its own rate - the DAY RATE
// for a standard day of that shift, exactly the currency hourlyRate already
// quotes labour in - and every crab can be paid ABOVE or BELOW it on a private
// deal (Matt: "should be able to pay workers different amounts though, even
// though it's a pain"). Three layers, most specific wins:
//
//   WAGE_STD        the town's standard day        23 (the old CRAB_WAGE)
//   BIZ[b].wage     what THIS shop advertises      defaults to WAGE_STD
//   p.wage          what THIS crab negotiated      defaults to the shop rate
//
// Defaults are inert by construction: every business opens on WAGE_STD and
// nobody carries a private deal, so a fresh or migrated save pays exactly what
// the flat CRAB_WAGE constant paid. The one deliberate change is that NPC
// staff now earn the same 23 as crew - see NPC_WAGE's headstone above.
//
// A PRIVATE DEAL IS A DEAL WITH A BOSS, not a badge the crab wears forever.
// It is stamped with the OWNER who granted it (p.wageOwner) and it travels
// with the crab across every shop that owner runs - reassign a crew crab from
// the shack to the juice bar and their deal comes with them. Work for somebody
// else (quit, poached, laid off, or your shop was sold out from under you) and
// it LAPSES back to the new shop's rate, announced in the day report so it is
// never silent. The alternative - a private rate that survives a change of
// employer - would let a $50 crew crab wander onto SUDSY's payroll and bankrupt
// her with a deal she never made.
const WAGE_STD = 23;
const WAGE_MIN = 8, WAGE_MAX = 60;   // the stepper's band: below the pier's worst day, above its best
const clampWage = (n) => Math.max(WAGE_MIN, Math.min(WAGE_MAX, Math.round(+n || 0)));
function bizWage(b) { return BIZ[b] && BIZ[b].wage != null ? BIZ[b].wage : WAGE_STD; }
function setBizWage(b, n) { if (BIZ[b]) BIZ[b].wage = clampWage(n); }
// the deal, if it is still THIS boss's deal (see the note above)
function privateWage(c) {
  return c.p.wage != null && c.p.wageOwner === bizOwner(c.p.job) ? clampWage(c.p.wage) : null;
}
function onShopRate(c) { return privateWage(c) == null; }
function setCrabWage(c, n) {
  const shop = bizWage(c.p.job), v = clampWage(n);
  if (v === shop) { delete c.p.wage; delete c.p.wageOwner; return shop; }   // back on the shop rate: no deal to keep
  c.p.wage = v; c.p.wageOwner = bizOwner(c.p.job);
  return v;
}
// APPLY TO ALL: the bulk action that makes per-crab bearable. Every staffer of
// this shop goes back onto the shop rate, private deals torn up.
function applyShopWage(b) {
  let n = 0;
  for (const k of allCrabs()) if (k.p.job === b && k.p.wage != null) { delete k.p.wage; delete k.p.wageOwner; n++; }
  return n;
}
const MEAL_POLS = ["retail", "atcost", "free"];   // staff-meal pricing, per biz
const MEAL_POL_LABEL = { retail: "RETAIL", atcost: "AT COST", free: "FREE" };
for (const k in BIZ) {   // one migration point: defaults = today's behavior
  BIZ[k].hours = { open: 8 * 60, close: 20 * 60 };
  BIZ[k].mealPol = "retail";
  // a business pays what it pays, whoever works there. WAGE_STD unless the
  // table names an opening rate (SUDS SHOWERS does - see its entry).
  BIZ[k].wage = BIZ[k].wage != null ? clampWage(BIZ[k].wage) : WAGE_STD;
  // labor policy (see the LABOR POLICY block below). GRANT is what the game
  // already did - a sick crab stayed home unpaid - so the default is inert.
  BIZ[k].sickPol = "grant";
  // auto-manage: OFF for the player (you're the manager), ON for peer owners
  // (SUDSY has always run herself; the same rule table now does it out loud).
  BIZ[k].autoLabor = !!BIZ[k].owner && BIZ[k].owner !== "player";
  // TIP SHARING (see the tips block): the fraction of every tip that goes to
  // the crab who served instead of the till. 0 = how the till has always been
  // paid, so the default moves nothing; the owner opens it on the SCHEDULE
  // tab's PAY row. Peer owners keep their own number and start at 0 too.
  BIZ[k].tipShare = 0;
}
// A HOTEL KEEPS A LATE DESK, and it has to: the last ferry of the day lands at
// 17:30 and its passengers are all overnighters, so a desk on the town's
// standard 8-20 (an owner-operator's shift 8:30-18:30) gave them one hour to
// check in. 10:00-22:00 evaluates to a 10:30-20:30 owner's day - exactly the
// ten-hour SHIFT_SPAN cap, so nothing is left unstaffed - and it covers every
// sailing. Mornings need no desk: checkout is automatic at 7:30.
BIZ.hotel.hours = { open: 10 * 60, close: 22 * 60 };
function setBizHours(b, open, close) {
  const h = BIZ[b].hours;
  open = Math.round(open / 30) * 30; close = Math.round(close / 30) * 30;
  open = Math.max(HOURS_MIN, Math.min(open, HOURS_MAX - HOURS_SPAN_MIN));
  close = Math.max(open + HOURS_SPAN_MIN, Math.min(close, HOURS_MAX));
  h.open = open; h.close = close;
}
function bizOpenNow(b) { const h = BIZ[b].hours; return tmin >= h.open && tmin < h.close; }
function anyBizOpenNow() { return Object.keys(BIZ).some(b => bizUnlocked(b) && bizOpenNow(b)); }
function fmtHr(m) { const h = (m / 60) | 0, mm = m % 60; return h + (mm ? (mm < 10 ? "0" + mm : "" + mm) : ""); }   // 480 -> "8", 510 -> "830" (shift-label style)
function fmtClock(m) { const h = (m / 60) | 0, mm = m % 60 | 0; return h + ":" + (mm < 10 ? "0" : "") + mm; }
// ---------------------------------------------------------------- the price
// THE LAST BUSINESS SETTING. Hours, wages, tip share and staff meals were all
// data already; the MENU PRICE was the one number still frozen into the recipe
// table. `BIZ[k].priceMul` scales every recipe in one shop - the shop-level
// instrument a peer owner can hold too, exactly like the wage. Bounds
// PRICE_MIN..PRICE_MAX in 5% steps; DEFAULT 1 is bit-identical to the frozen
// build (Math.round(pay * 1) === pay for every integer price in BIZ), which is
// what keeps the documented curves and the day-2 fingerprint untouched.
//
// A setting is only real if somebody responds, and two things do: TOURISTS
// choose a cheaper shop (see the spawn weights - the shares move, the town's
// total footfall does not, so cutting your price takes trade off a NEIGHBOUR
// rather than conjuring guests out of the sea) and LOCALS can suddenly afford
// a shop that was out of reach, because every affordability check in
// pickErrand runs through localPrice.
const PRICE_MIN = 0.7, PRICE_MAX = 1.3, PRICE_STEP = 0.05;
const clampPrice = (v) => Math.max(PRICE_MIN, Math.min(PRICE_MAX,
  Math.round((+v || 0) / PRICE_STEP) * PRICE_STEP));
function bizPriceMul(b) { const m = BIZ[b] && BIZ[b].priceMul; return m == null ? 1 : m; }
function setBizPrice(b, v) { if (BIZ[b]) BIZ[b].priceMul = clampPrice(v); }
function menuPrice(b, r) { return Math.max(1, Math.round(r.pay * bizPriceMul(b))); }   // what it says on the board
// TRIM TO FIT, MEASURED. A character count is a guess about a proportional
// budget: "FISH TACO $17  JUICE $10  GRILL FI" is 34 characters, which someone
// sized for a 100px slot and is actually 135 - it printed 13px past the right
// edge of the canvas. Trim by WIDTH, so a long line loses its tail rather than
// the screen losing its margin.
function fitSmall(str, maxW) {
  if (smallTextWidth(str) <= maxW) return str;
  let out = String(str);
  while (out.length && smallTextWidth(out + "..") > maxW) out = out.slice(0, -1);
  return out.replace(/[\s,]+$/, "") + "..";
}
function localPrice(b, r) { return Math.ceil(menuPrice(b, r) * 1.25); }                // ...and locals pay +25% of that
// How attractive this shop's board looks to somebody walking past. Cheap pulls,
// dear pushes, and the curve is flat enough that a 30% cut is worth about a
// third more footfall rather than the whole promenade. Exactly 1 at the default
// price by construction (Math.pow(1, x) === 1), so an untouched town is untouched.
const PRICE_ELAST = 1.2;
// what share of the passing trade a shop pulls before its board is read. These
// are the weights the spawn block has always used; naming them is what lets
// `bizPull` be a function rather than a literal in the middle of a loop.
const TOURIST_PULL = { shack: 0.5, arcade: 0.22, juicebar: 0.3 };
function bizPullBase(b) { return TOURIST_PULL[b] == null ? 0.1 : TOURIST_PULL[b]; }
function bizPull(b) { return bizPullBase(b) * priceAppeal(b); }
function priceAppeal(b) {
  const m = bizPriceMul(b);
  return Math.max(0.6, Math.min(1.6, Math.pow(1 / m, PRICE_ELAST)));
}
function staffMealCharge(b, r) {   // what a selfCooking staffer rings up
  const pol = BIZ[b].mealPol || "retail";
  return pol === "free" ? 0 : pol === "atcost" ? ingredientCost(r.raw) : menuPrice(b, r);
}

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
//   BRASS's bankroll (arrival)     -> outside money IN, ONCE (see THE HOTELIER):
//                                  a crab moves to town with her savings. The
//                                  price of the hotel leaves her wallet the
//                                  same evening and NOTHING of it is destroyed
//                                  - half into the seller's pocket, half into
//                                  the shop's own drawer as its opening float
//                                  (SALE_CFG.FLOAT_FRAC) - and what is left is
//                                  an ordinary crab wallet from then on, which
//                                  the house rent and the counters drain like
//                                  anybody's. Same shape as a visitor's wallet
//                                  stepping off the ferry, and the only other
//                                  place a crab is minted with money.
//   wages (nightly)                player till -> crew wallets
//   crew house rent (nightly)      crew wallet -> DESTROYED (the town keeps it)
//   shack/biz rents (nightly)      owner till  -> DESTROYED (Mr. Pincherton)
// Crew wallets are fed only by wages; every sink above must keep the
// steady-state wallet bounded (see suite: "no wallet inflation").
// OWNERS is a REGISTRY, not a fixture: peer owners are added when a crab buys
// a business and BIZ[k].owner is the key into it. `owner: null` means NOBODY
// owns that business - it is closed and on the market (see the business
// failure & succession block below).
const OWNERS = {
  sudsy: { id: "sudsy", name: "SUDSY", till: 200, credit: 0, darkT: 0 },
  // REEF keeps the DRIFTWOOD HOTEL. A second peer owner, on exactly the same
  // terms SUDSY is on - his own till, his own lease, his own wage and hours
  // policy - because the owner layer is a registry, not a fixture.
  // ...and `soft` is REEF himself: an old crab with no heir who will take a
  // fair price for the Driftwood. It sits on the OWNER, not on the lease,
  // because it is a fact about him - the hotelier who buys him out runs the
  // same seven rooms and will not sell them at a fair price at all. (Same
  // reasoning THE RIVALRY uses in reverse: the ambition keys on the lease
  // because anybody holding it would want the shop next door; a willing
  // seller keys on the crab because not everybody is one.)
  reef: { id: "reef", name: "REEF", till: 140, credit: 0, darkT: 0, soft: true },
};
const bizOwner = (b) => BIZ[b].owner === null ? null : (BIZ[b].owner || "player");
// never let a draw path throw on an owner who has left the registry (sold up,
// or - the death seam - left the town between one frame and the next settlement)
const ownerName = (id) => id === "player" ? "YOU" : (OWNERS[id] && OWNERS[id].name) || "NOBODY";
function ownerFunds(b) {
  const o = bizOwner(b);
  return o === "player" ? coins : o && OWNERS[o] ? OWNERS[o].till : 0;   // an unowned shop has no till
}
function bizDayBook(b) {   // today's per-business takings/costs (management screen + CPU policy signals)
  return today.biz[b] = today.biz[b] || { take: 0, cost: 0 };
}
function creditBiz(b, amt, x, y, quiet) {   // quiet: the caller pops its own label (tips)
  const o = bizOwner(b);
  if (!o) return;                          // a shuttered shop takes no money
  bizDayBook(b).take += amt;
  if (o === "player") {
    today.revenue += amt;
    if (quiet) { coins += amt; lifetime += amt; earnHist.push({ t: time, amt }); sfx.coin(); }
    else earn(amt, x, y);
  }
  else {
    OWNERS[o].till += amt;
    if (!quiet) popText("+$" + Math.floor(amt), x, y, [150, 210, 255]);
    if (window._stats) window._stats.npcEarn = (window._stats.npcEarn || 0) + amt;
  }
}
function debitBiz(b, amt, x, y, label) {
  const o = bizOwner(b);
  if (!o) return;                          // ...and pays no bills
  bizDayBook(b).cost += amt;
  if (o === "player") expense(amt, x, y, label);
  else OWNERS[o].till -= amt;
}
// "unlocked" = this lot exists in the world at all. A business the player
// BOUGHT off the market carries `bought` (there is no shop-grid upgrade rung
// behind it), and one that is FOR SALE stays in the world - shuttered, with a
// sign - because a closed shop is still a building.
const bizUnlocked = (b) => b === "shack" || (!!BIZ[b] && (!!BIZ[b].bought || bizOwner(b) !== "player"
  || !!(UPS[b] && UPS[b].lvl > 0)));

// ===========================================================================
// THE TOWN HALL - the fund, the mayor, and the elections
// (Matt, 2026-08-19: "We are going to need a charity system, these resources
// don't come from nowhere. Same thing for rent on the shelter. Unfortunately
// this means a new mayor character and elections. So far they just manage the
// homeless shelter... Little top hat and all.")
//
// THE IRON RULE: NOTHING IS CONJURED. This town already mints and destroys
// visitor wallets so the money supply cannot inflate, and puts every import on
// the trade ledger. The fund obeys the same law, and it is ENFORCED rather
// than promised: money enters ONLY through fundTake(), which moves it out of a
// named payer's own live balance, and leaves ONLY through fundPay() (into a
// named till) or fundRemit() (destroyed at the landlord, exactly the way the
// shack lease and every crab's house rent already leave this world). There is
// no third door. auditFund() weighs the whole world's money either side of
// every single movement, and the suite asserts the delta on every row - see
// the scenario "the fund moves money and never mints it".
//
// WHAT THE OFFICE IS. One remit, deliberately narrow: the homeless shelter.
// Its RENT (Mr. Pincherton owns that building too) and its POT. Nothing about
// hours, wages, prices or anything else the player already holds. What the
// mayor decides is where the money comes from - Matt, asked exactly that:
// "This is exactly the choice the mayor will make." So the funding mechanism
// is not a constant somebody picked. It is the office's lever, and it is the
// thing an election is actually about.
const SHELTER_RENT = 10;         // Mr. Pincherton owns the shelter too, and he charges for it
const SHELTER_FLOAT = 1;         // ...and the purse is struck to carry this many nights of it IN HAND.
                                 // Same idiom the town already uses everywhere money has to survive a
                                 // bad day (RIVAL_CFG.FLOAT_NIGHTS, BANK_KEEP's "two nights' rent and a
                                 // wage in the till"). MEASURED, and this is what it is for: with no
                                 // float, six solvent towns over 24 days bolted the shelter FIVE times -
                                 // and not one of those was a bad POLICY. Every one was a purse that
                                 // cleared the rent on polling day and came up a dollar short on a
                                 // quiet Tuesday. A failure mode should be about the choice the town
                                 // made, not about variance in the takings three days later.
const SHELTER_STRIKES = 3;       // missed nights running before the door is bolted
const SHELTER_SHUT_NIGHTS = 4;   // ...and how many nights it stays that way
const SOUP_MARGIN = 2;           // the shack's margin on a bowl sold to the town
const POT_MAX = 6;               // the most bowls any mayor may put on for one night
const POLL_WEEKDAY = 6;          // SUNDAY. The town already keeps a week (WEEKDAYS, and the
                                 // staggered rota hangs off it), so polling day rides on that
                                 // rather than inventing a second calendar. Day 1 is a Monday,
                                 // so the first ballot is day 7 - late enough that the town has
                                 // a trading record to vote on, often enough that a do-nothing
                                 // town still holds one before it folds and a 30-day run holds four.

// THE FOUR PURSES. The whole point of an election is that they fall on
// DIFFERENT PEOPLE, so a vote is worth casting. Each carries a rate INDEX 0-4,
// which means four different things depending on the mechanism.
//   LEVY  - the biggest and the bluntest. Every business pays a share of what
//           it took today, the player's shack included. This is the one with
//           the conflict of interest inside it.
//   DUES  - a charge per head on everybody the ferry lands. Nobody in town
//           pays a penny... and every dollar of it is a dollar that never
//           reaches a counter, so the shops feel it anyway.
//   RENTS - Mr. Pincherton concedes points off his RESIDENTIAL book. He would
//           rather have tenants than empty lots, so he will talk about the
//           cottages; he will not give up a point of a commercial lease, which
//           is why this tops out where the shelter's own rent is roughly
//           covered and the pot is thin. The comfortable option. It feeds
//           almost nobody, and it costs nobody in town anything at all.
//   TIN   - a tin on the shelter step. Voluntary, so only crabs who are clear
//           themselves give, and it raises next to nothing on a poor night.
//           Honest about what charity without a tax base actually collects.
const PURSES = {
  levy:  { name: "THE LEVY", short: "LEVY", unit: "% OF TAKINGS",
    who: "EVERY BUSINESS - YOURS TOO", steps: [0, 2, 4, 6, 8] },
  dues:  { name: "HARBOUR DUES", short: "DUES", unit: "$ A HEAD",
    who: "EVERY VISITOR THE FERRY LANDS", steps: [0, 1, 2, 3, 4] },
  rents: { name: "A CUT OF THE RENTS", short: "RENTS", unit: "% OF THE HOUSE RENTS",
    who: "MR. PINCHERTON, OFF HIS OWN BOOK", steps: [0, 10, 20, 30, 40] },
  tin:   { name: "THE COLLECTION TIN", short: "TIN", unit: "$ ASKED OF EACH",
    who: "WHOEVER CAN SPARE IT", steps: [0, 1, 2, 3, 4] },
};
const PURSE_KEYS = ["levy", "dues", "rents", "tin"];
const TIN_KEEP = 30;   // nobody drops a coin in the tin who is not this far clear themselves
const POLL_LINES = 24; // how many written vote reasons a ballot keeps (display + save only)

// The fund is AN ACCOUNT WITH A LEDGER, not a number. Every row names its
// counterparty, because "where did that bowl come from" has to have an answer.
// (`youPaid` / `youGot` are the day's two numbers the PLAYER feels: what the
// office billed their till, and what came back the other way when the shelter
// bought its bowls off their own counter. Both are on the nightly report.)
let townFund = { bal: 0, bowls: 0, strikes: 0, shut: 0, arrears: 0,
  ledger: [], served: 0, cold: 0, wasted: 0, dayIn: 0, dayOut: 0, youPaid: 0, youGot: 0,
  potWhy: "ok" };   // potWhy: why the pot reads the way it does tonight (see stockPot)
// The office. `mayor` is a NAME rather than a crab: personas outlive crab
// objects across a save/load, and a name is what the town actually uses.
// The founding policy is Mr. Pincherton's grudging cut at its cap - the town
// has been keeping the shelter open on it since before the player took the
// lease, and it covers the roof and almost nothing else.
let hall = {
  mayor: null, policy: { mech: "rents", rate: 4, bowls: 2 },
  termDay: 0, poll: null,
  stand: false, nominee: null,                    // is the player on the ballot, and who for
  plat: { mech: "levy", rate: 2, bowls: 3 },      // ...and the platform they run on
};
function mayorCrab() { return hall.mayor ? allCrabs().find(c => c.p.name === hall.mayor) || null : null; }
function isMayor(c) { return !!hall.mayor && c.p.name === hall.mayor; }
// THE PLAYER HOLDS THE OFFICE when the crab in the hat is one of theirs. That
// is the conflict of interest, in one predicate: the same hand sets the levy
// and pays it.
function playerMayor() { const m = mayorCrab(); return !!m && !m.p.npc; }
function purseOf(p) { return PURSES[p.mech] || PURSES.rents; }
function purseRate(p) { const s = purseOf(p).steps; return s[Math.max(0, Math.min(s.length - 1, p.rate | 0))]; }
function policyLine(p) {
  const P = purseOf(p), r = purseRate(p), b = p.bowls | 0;
  return P.short + " " + (p.mech === "rents" || p.mech === "levy" ? r + "%" : "$" + r)
    + " / " + b + " BOWL" + (b === 1 ? "" : "S");
}

// ---------------------------------------------------------------- accounts
// An ACCOUNT is a real balance somewhere in this world: the player's till, a
// peer owner's till, a crab's wallet, a visitor's minted purse. There is
// deliberately no account for "the town" - that is the point. The fund can
// only ever be fed out of one of these four.
function acctBal(a) {
  return !a ? 0
    : a.k === "player" ? coins
    : a.k === "owner" ? (OWNERS[a.id] ? OWNERS[a.id].till : 0)
    : a.k === "crab" ? (a.c.p.wallet || 0)
    : a.k === "vis" ? (a.v.wallet || 0) : 0;
}
function acctMove(a, d) {
  if (a.k === "player") { coins += d; earnHist.push({ t: time, amt: d }); }
  else if (a.k === "owner") { if (OWNERS[a.id]) OWNERS[a.id].till += d; }
  else if (a.k === "crab") a.c.p.wallet = Math.max(0, (a.c.p.wallet || 0) + d);
  else if (a.k === "vis") { a.v.wallet = Math.max(0, (a.v.wallet || 0) + d); if (d < 0) a.v.spent += -d; }
}
function acctName(a) {
  return !a ? "?" : a.k === "player" ? "YOU"
    : a.k === "owner" ? ((OWNERS[a.id] && OWNERS[a.id].name) || "NOBODY")
    : a.k === "crab" ? a.c.p.name : a.k === "vis" ? a.v.name : "?";
}
function bizAcct(b) {   // the till behind a lease, whoever holds it tonight
  const o = bizOwner(b);
  return !o ? null : o === "player" ? { k: "player" } : { k: "owner", id: o };
}

// ---------------------------------------------------------------- the ledger
// EVERY DOLLAR IN THE WORLD, counted the same way either side of a movement:
// crew wallets, townsfolk wallets, the visitors' minted purses, every peer
// owner's till, the player's own coins, the fund itself - and debt as the
// negative it is.
function worldMoney() {
  let m = coins - (credit.bal || 0) + townFund.bal;
  for (const k in OWNERS) m += (OWNERS[k].till || 0) - (OWNERS[k].credit || 0);
  for (const c of allCrabs()) m += c.p.wallet || 0;
  for (const k of customers) if (k.visitor && !k.gone) m += k.wallet || 0;
  return m;
}
// The audit hook, OFF by default: it costs a pass over the whole town per
// movement, which is not a thing to do sixty times a second. `_auditFund`
// turns it on and collects every row, and the suite asserts the delta on all
// of them - a TAKE and a PAY must leave the world's money EXACTLY where it
// was, and a REMIT must lower it by exactly what was remitted and no more.
function auditFund(kind, amt, who, why, before) {
  const A = window._auditFund;
  if (!A) return;
  const want = kind === "remit" ? -amt : 0, delta = worldMoney() - before;
  A.rows = A.rows || [];
  A.rows.push({ day, kind, amt, who, why, delta, want, ok: Math.abs(delta - want) < 1e-6 });
}
function fundRow(kind, amt, who, why) {
  townFund.ledger.push({ day, kind, amt: Math.round(amt * 100) / 100, who, why });
  if (townFund.ledger.length > 48) townFund.ledger.shift();   // a running record, not an archive
}
// MONEY IN, out of a named payer's own balance and nowhere else. The payer is
// handed over as a live ACCOUNT rather than a label, so there is no way to
// write a credit into this fund without a matching debit somewhere real.
function fundTake(a, amt, why) {
  const take = Math.min(Math.max(0, amt), acctBal(a));
  if (take < 0.005) return 0;
  const before = window._auditFund ? worldMoney() : 0;
  acctMove(a, -take);
  townFund.bal += take; townFund.dayIn += take;
  if (a.k === "player") townFund.youPaid += take;
  fundRow("take", take, acctName(a), why);
  auditFund("take", take, acctName(a), why, before);
  return take;
}
// MONEY OUT, and it goes to a BUSINESS, because the only thing this fund ever
// buys is food and food is sold by shops. The sale is rung up through
// creditBiz - the same door a tourist's taco goes through - so the shelter's
// standing order lands in the day book, the takings column and the owner's
// lifetime like any other trade, instead of being a number that appears in a
// till with no sale behind it. That owner is very often the player.
function fundPay(b, amt, why) {
  const a = bizAcct(b);
  const pay = Math.min(Math.max(0, amt), townFund.bal);
  if (!a || pay < 0.005) return 0;
  const before = window._auditFund ? worldMoney() : 0;
  townFund.bal -= pay; townFund.dayOut += pay;
  if (a.k === "player") townFund.youGot += pay;
  creditBiz(b, pay, BIZ[b].door, 112, true);   // quiet: stockPot pops its own label
  fundRow("pay", pay, acctName(a), why);
  auditFund("pay", pay, acctName(a), why, before);
  return pay;
}
// MONEY OUT, to the landlord. Mr. Pincherton has never been modelled as a
// till, so rent leaves the world here exactly the way the shack lease and
// every crab's house rent already leave it. This is the ONE place the fund
// makes the world poorer, it is labelled REMIT, and the audit knows it.
function fundRemit(amt, who, why) {
  const pay = Math.min(Math.max(0, amt), townFund.bal);
  if (pay < 0.005) return 0;
  const before = window._auditFund ? worldMoney() : 0;
  townFund.bal -= pay; townFund.dayOut += pay;
  fundRow("remit", pay, who, why);
  auditFund("remit", pay, who, why, before);
  return pay;
}

// ---------------------------------------------------------------- the bills
// What a bowl costs the town: what the shack pays for the fish, plus the
// shack's margin on it. It FLOATS with the pier price (ingredientCost reads
// trade.price), so a bad week on the water makes the pot dearer to run -
// which is exactly the week the crabs who queue at it need it most.
function bowlCost() { return ingredientCost("fish_raw") + SOUP_MARGIN; }
function shelterShut() { return townFund.shut > 0; }
// THE FUND DOES NOT HOARD. The purse is struck to cover the shelter's bill and
// nothing else, so a generous RATE is a CEILING on what the mayor may reach
// for, not the size of the reach. Without this, "vote for the biggest levy"
// is a runaway and the levy stops being a policy and becomes a number that
// only ever goes up.
// A POT IS MADE FRESH. Last night's bowls do not keep, so a generous mayor
// buys them again every single night - and that is what makes the BOWLS dial a
// fiscal choice instead of a one-off purchase. (It was the other way round
// first and it hollowed the election out: the fund bought two bowls on day
// two, they carried over untouched, and after that the office's entire ongoing
// bill was the $10 rent. A policy nobody has to pay for is not a policy.)
//
// ...AND A KITCHEN COOKS FOR THE BEDS IT HAS. The mayor's number is a CEILING
// on the night's pot, not a standing order for it: the shelter puts on a bowl
// for each crab who is actually ill tonight, plus one spare while anybody is.
// Measured before this cap, on a 35-day growth town: 26 bowls bought and
// THROWN OUT against ONE served. That is not a soup kitchen, it is a town
// buying bin-food out of a levy, and Matt's whole brief is that the resources
// are real. It also keeps the dial honest in the other direction - the nights
// a generous policy costs money are the nights somebody needs it.
function potWant() {
  const ill = allCrabs().reduce((n, c) => n + (c.p.sick ? 1 : 0), 0);
  return Math.max(0, Math.min(POT_MAX, hall.policy.bowls | 0, ill + (ill > 0 ? 1 : 0)));
}
function fundNeed() {
  return Math.max(0, SHELTER_RENT * (1 + SHELTER_FLOAT) + townFund.arrears
    + potWant() * bowlCost() - townFund.bal);
}
// the attribution switch, the same shape as _failOff and _noRival: the balance
// matrix turns the whole office off and reads its own movement back
function hallOn() { return !window._noHall; }

// A CUT OF THE RENTS, taken out of the payment on its way past. The tenant
// pays their same $10 either way - it is Mr. Pincherton's book the town
// negotiated over, not the crab's wallet - so this is a DIVERSION and not a
// second rent. Called from the settlement's house-rent branch with the money
// still IN the wallet, which is the only way to take a share of it without
// minting one: this returns what the fund took, and the caller destroys the
// remainder exactly the way it always did.
function rentCut(c, amt) {
  if (!hallOn() || hall.policy.mech !== "rents") return 0;
  if (purseRate(hall.policy) <= 0) return 0;
  return fundTake({ k: "crab", c }, Math.min(amt * purseRate(hall.policy) / 100, fundNeed()), "RENT CUT");
}
// HARBOUR DUES, on the plank. Charged per head to a wallet that was minted
// this instant and will be destroyed when they sail, so no local pays a penny
// - and every dollar of it is a dollar that never reaches a counter, which is
// how a mechanism nobody in town pays still costs the shops. Lifted the moment
// the shelter is covered: the town does not charge tolls it has no use for, so
// a visitor landing on a full fund walks past free.
function harbourDues(v) {
  if (!hallOn() || hall.policy.mech !== "dues") return 0;
  if (purseRate(hall.policy) <= 0) return 0;
  return fundTake({ k: "vis", v }, Math.min(purseRate(hall.policy), fundNeed()), "HARBOUR DUE");
}
// One pass at settlement for the purses collected in the evening: the LEVY off
// the day's takings, and the TIN off whoever can spare it. (RENTS rides the
// house-rent payment and DUES ride the gangway - both are taken where the
// money already is, which is the only place they can be taken from.)
function collectPurse() {
  const p = hall.policy, rate = purseRate(p);
  const need = fundNeed();
  let got = 0;
  if (rate <= 0 || need <= 0) return 0;
  if (p.mech === "levy") {
    // A SHARE OF WHAT YOU TOOK TODAY, so a shop that sold nothing pays
    // nothing: that is the whole difference between a levy and a second rent.
    // And it never takes a business below ITS OWN rent - the town does not levy
    // a shop into the ground, because there would be no shop to levy next week.
    // The player's shack is in this loop on exactly SUDSY's terms.
    // KNOWN EDGE, written down rather than papered over: a peer owner has one
    // till per lease, but the PLAYER's several shops all draw on `coins`, so a
    // multi-shop player's floor here is the LAST shop's rent rather than the
    // sum of them. The exposure is bounded by `need` (a night's shelter bill)
    // and the credit line is what that cliff is for, so it only ever bites a
    // player who was already a shelter's rent away from missing one.
    //
    // TWO PASSES, and the second one is the fair one. Walking BIZ in key order
    // and stopping at `need` billed the SHACK - which is first in the table and
    // the biggest earner - for the town's whole bill while the shops next door
    // paid nothing, and that is a bias against the player hidden inside an
    // object literal's ordering. So: everybody's share is worked out first, and
    // if the total overshoots the bill every shop is scaled back by the same
    // fraction. A levy is a rate on takings, and it has to read like one from
    // any till in town.
    const bills = [];
    let gross = 0;
    for (const b of Object.keys(BIZ)) {
      if (!bizUnlocked(b)) continue;
      const a = bizAcct(b);
      if (!a) continue;
      const due = Math.min((today.biz[b] ? today.biz[b].take : 0) * rate / 100,
        Math.max(0, acctBal(a) - BIZ[b].rent));
      if (due <= 0) continue;
      bills.push({ a, b, due }); gross += due;
    }
    const scale = gross > need ? need / gross : 1;
    for (const e of bills) got += fundTake(e.a, e.due * scale, "LEVY: " + BIZ[e.b].short);
  } else if (p.mech === "tin") {
    // VOLUNTARY, and that is the finding rather than the flavour: only crabs
    // who are TIN_KEEP clear themselves give, so on a poor night the tin is
    // empty and the pot goes cold. Name order keeps it deterministic - a
    // collection is not a dice roll - but the tin STARTS at a different name
    // each night, because a fund that stops the moment it has enough would
    // otherwise ask the same crab at the top of the alphabet every single time.
    const givers = allCrabs().filter(c => (c.p.wallet || 0) >= TIN_KEEP + rate)
      .sort((a, b) => (a.p.name < b.p.name ? -1 : 1));
    for (let i = 0; i < givers.length && got < need; i++) {
      const c = givers[(i + day) % givers.length];
      got += fundTake({ k: "crab", c }, Math.min(rate, need - got), "TIN: " + c.p.name);
    }
  }
  return got;
}

// ---------------------------------------------------------------- the pot
// STOCKING IT. The bowls are BOUGHT, from a business, at a price, the night
// before - which is the whole reason this feature exists. Matt, on the free
// version: "these resources don't come from nowhere." So the shack carries a
// standing order for the shelter: the fund's money lands in the shack owner's
// till (very often the player's own), and the shack buys the fish for those
// bowls out of that till exactly the way it buys the fish for a paying
// customer, on the same trade ledger. Every bowl the pot serves is food
// somebody sold. If the fund cannot afford one, it does not get one.
const SOUP_BIZ = "shack";
function stockPot() {
  // yesterday's is thrown out first - see fundNeed. What nobody came for is
  // money the town spent on nothing, which is the honest price of running a
  // pot bigger than the queue, and it is counted so the player can see it.
  townFund.wasted += townFund.bowls; townFund.bowls = 0;
  const want = potWant();
  const a = bizAcct(SOUP_BIZ);
  // WHY THE POT IS THE WAY IT IS TONIGHT, for the placard and the HALL tab -
  // "cold" and "nobody is ill" are very different things to tell a player, and
  // only one of them is the office failing.
  townFund.potWhy = shelterShut() ? "shut" : !a ? "noshop"
    : (hall.policy.bowls | 0) <= 0 ? "policy" : want <= 0 ? "nocall" : "ok";
  if (want <= 0 || !a || shelterShut()) return 0;
  const each = bowlCost();
  const n = Math.min(want, Math.floor(townFund.bal / Math.max(1, each)));
  if (n <= 0) { townFund.potWhy = "funds"; return 0; }
  fundPay(SOUP_BIZ, n * each, n + " BOWLS FROM " + BIZ[SOUP_BIZ].short);
  for (let i = 0; i < n; i++) {                    // ...and the shack buys the fish for them
    debitBiz(SOUP_BIZ, ingredientCost("fish_raw"), BIZ[SOUP_BIZ].door, 118, "POT");
    consumeIngredient("fish_raw", null);
  }
  townFund.bowls += n;
  popText(n + " BOWLS FOR THE POT", SHELTER_X + 4, 120, [255, 210, 140]);
  return n;
}
// IS THERE ANYTHING IN IT. The whole charity system, in one predicate: the
// shelter has to be open, and somebody has to have paid for a bowl.
function potWarm() { return hallOn() && !shelterShut() && townFund.bowls > 0; }
// ONE PHRASE, used by the placard on the shelter, the HALL tab and the nightly
// report, so all three tell the same story. "COLD" is the office failing;
// "nobody is ill tonight" is not, and a player should never have to guess which
// one they are looking at.
function potLine() {
  if (!hallOn()) return "NO TOWN HALL";
  if (shelterShut()) return "CLOSED - RENT UNPAID";
  if (townFund.bowls > 0) return "POT ON: " + townFund.bowls + " BOWL" + (townFund.bowls === 1 ? "" : "S");
  const w = townFund.potWhy;
  return w === "nocall" ? "NOTHING ON - NOBODY ILL"
    : w === "policy" ? "NO POT - THE MAYOR PUTS NONE ON"
    : w === "noshop" ? "NO KITCHEN TO BUY FROM"
    : "THE POT IS COLD - NO FUNDS";
}
function potOk() { return shelterShut() ? 0 : townFund.bowls > 0 || townFund.potWhy === "nocall" ? 1 : -1; }
// ...and serving one. `p.bowls` on the crab is a persona field on purpose: a
// crab who has eaten here votes differently afterwards (potStake), which is
// the feedback loop that makes an election about something that happened.
function takeBowl(c) {
  if (!potWarm()) { townFund.cold++; if (window._stats) window._stats.potCold = (window._stats.potCold || 0) + 1; return false; }
  townFund.bowls--; townFund.served++;
  c.p.bowls = (c.p.bowls || 0) + 1;
  if (window._stats) window._stats.soupBowls = (window._stats.soupBowls || 0) + 1;
  return true;
}

// ---------------------------------------------------------------- the vote
// WHAT A CRAB WANTS is worked out from their own circumstances, never rolled.
// potStake is what they stand to GAIN from a full pot; purseCost is what they
// stand to LOSE from each way of paying for it. Both are small readable
// numbers and both are printed beside the vote on the HALL tab, so a result
// can be argued with rather than just watched.
function potStake(c) {
  let s = 0.05;                            // everybody would rather the shelter stayed open
  if (c.p.homeless) s += 0.55;             // ...but if you sleep there it is your address
  if (c.p.sick) s += 0.20;                 // and a sick day pays nothing at all
  if ((c.p.bowls || 0) > 0) s += 0.25;     // you have actually stood in that queue
  if (c.p.fisher) s -= 0.30;               // a fisher roasts their own catch (measured - PLAN)
  if (!c.p.npc) s -= 0.15;                 // of 1800 ticks where a sick crab could not buy food,
                                           // ZERO were the player's crew: they draw a wage
  return Math.max(0, Math.min(1, s));
}
function purseCost(c, mech) {
  const owns = !!(c.p.owner && OWNERS[c.p.owner]);
  const paid = !c.p.npc || !!c.p.employer;   // somebody's wage comes out of somebody's till
  if (mech === "levy") return owns ? 1.0 : paid ? 0.28 : 0.04;
  if (mech === "dues") return owns ? 0.50 : paid ? 0.12 : 0.02;
  if (mech === "tin") return (c.p.wallet || 0) >= TIN_KEEP ? 0.34 : 0.03;
  return 0.04;   // RENTS: Mr. Pincherton pays, and Mr. Pincherton does not vote
}
// WHAT A PLATFORM WOULD ACTUALLY RAISE, off what the town did today. This is
// the number that makes the election worth holding: a homeless crab does not
// vote for the most generous promise, they vote for the one that will put a
// bowl in front of them, and a promise its purse cannot fund is worth nothing
// to them at all.
function purseYield(p) {
  const rate = purseRate(p);
  if (rate <= 0) return 0;
  if (p.mech === "levy")
    return Object.keys(BIZ).filter(b => bizUnlocked(b) && bizOwner(b))
      .reduce((s, b) => s + (today.biz[b] ? today.biz[b].take : 0), 0) * rate / 100;
  if (p.mech === "rents")
    return allCrabs().filter(c => !c.p.homeless && c.p.boat == null).length * HOUSE_RENT * rate / 100;
  if (p.mech === "dues") return (today.heads || 0) * rate;
  if (p.mech === "tin") return allCrabs().filter(c => (c.p.wallet || 0) >= TIN_KEEP + rate).length * rate;
  return 0;
}
// ...and what it would actually TAKE, which is not the same thing, because the
// fund does not hoard (fundNeed). Two platforms whose rates differ but whose
// bills are identical cost a voter exactly the same, and voters price them
// that way - which is true, so they should.
// The RECURRING bill is what is priced here: a night's rent and a night's
// bowls. SHELTER_FLOAT is deliberately left out, because it is a stock rather
// than a flow - the purse collects that one night of rent once and then carries
// it, so it is not part of what a policy costs you week after week.
function platTake(p) { return Math.min(purseYield(p), SHELTER_RENT + (p.bowls | 0) * bowlCost()); }
function platBowls(p) {   // bowls the purse can actually pay for, after the roof
  return Math.max(0, Math.min(p.bowls | 0, Math.floor((purseYield(p) - SHELTER_RENT) / Math.max(1, bowlCost()))));
}
// THE ROOF IS WORTH MORE THAN THE POT, and the town knows it. A platform whose
// purse cannot even cover the shelter's rent is a platform that closes the
// shelter, and closing the shelter puts crabs on the sand - which this game
// already prices in lost rest, exhaustion and the next morning's sickness roll.
//
// It is also ADAPTIVE, and that is the part that makes the politics move: while
// the lease is in arrears or the door is actually bolted, everybody weighs the
// roof at double. The town can vote itself into losing the shelter, and then it
// votes itself back out - a corrective loop rather than a ratchet.
// MEASURED, and this is why the weights are what they are: at 0.35/0.08 flat,
// six solvent towns over 24 days shut the shelter FIVE times and paid 75 rough
// nights against 35 with no town hall at all. The office was making crab
// welfare worse and buying nothing with it.
function roofWeight(c) {
  const seen = townFund.strikes > 0 || shelterShut() ? 2 : 1;
  return (c.p.homeless ? 0.60 : 0.20) * seen;
}
function platValue(c, p) {
  const roof = purseYield(p) >= SHELTER_RENT ? 1 : 0;
  return potStake(c) * (platBowls(p) / POT_MAX)
    + roofWeight(c) * roof
    - purseCost(c, p.mech) * (platTake(p) / 60);   // 60 = a big night for this fund
}
// every platform on the grid, scored once an election and shared by every
// voter (the yields depend on the town, never on who is reading them)
function allPlatforms() {
  const out = [];
  for (const mech of PURSE_KEYS)
    for (let rate = 0; rate <= 4; rate++)
      for (let bowls = 0; bowls <= POT_MAX; bowls++) out.push({ mech, rate, bowls });
  return out;
}
// the platform this crab would stand on. Ties go to the SMALLER ask: nobody
// campaigns for a bigger levy than the pot they are promising actually needs,
// and without the tie-break the ballot fills up with platforms that differ
// only in a rate that never binds.
function idealPlatform(c, grid) {
  let best = null, bv = -Infinity;
  for (const p of grid || allPlatforms()) {
    const v = platValue(c, p);
    if (v > bv + 1e-9
        || (Math.abs(v - bv) <= 1e-9 && best && (p.rate < best.rate
            || (p.rate === best.rate && p.bowls < best.bowls)))) { bv = v; best = p; }
  }
  return best || { mech: "rents", rate: 0, bowls: 0 };
}
// ONE LINE PER VOTER, in their own terms. This is the whole legibility bar for
// the feature: a result has to be arguable from the roster, not just watched.
function voteReason(c, p) {
  const bits = [c.p.homeless ? "SLEEPS AT THE SHELTER"
    : c.p.owner ? "KEEPS A TILL"
    : !c.p.npc ? "ON YOUR PAYROLL"
    : c.p.fisher ? "FISHES FOR THEMSELF" : "HAS A WAGE AND A ROOF"];
  if (c.p.sick) bits.push("ILL");
  const b = platBowls(p);
  bits.push(b > 0 ? b + " BOWL" + (b === 1 ? "" : "S") : "NO POT");
  bits.push(purseCost(c, p.mech) * platTake(p) >= 12 ? "AND PAYS FOR IT" : "AND PAYS LITTLE");
  return bits.join(", ");
}
// THE BALLOT. Everybody has an ideal; the crabs who STAND are the ones who
// want theirs most - measured as how much better their own platform is FOR
// THEM than the one the town is living under. One candidate per distinct
// platform, so the ballot is a choice between policies rather than a list of
// names, and never more than four of them plus the player's nominee.
function buildBallot() {
  // ONLY TOWNSFOLK PUT THEMSELVES FORWARD. The player's crew are on a payroll
  // and stand only when the player NOMINATES one of them - "the player can
  // stand and win" is a decision the player makes, not something that happens
  // to them. Without this the hat lands on a crew crab the player never chose
  // and whose policy they cannot set, which reads as a bug rather than a
  // government.
  const grid = allPlatforms(), town = allCrabs().filter(c => c.p.npc);
  const byPlat = {};
  for (const c of town) {
    const p = idealPlatform(c, grid);
    const key = policyLine(p), gain = platValue(c, p) - platValue(c, hall.policy);
    if (!byPlat[key] || gain > byPlat[key].gain) byPlat[key] = { c, plat: p, gain, key };
  }
  const cands = Object.keys(byPlat).map(k => byPlat[k])
    .sort((a, b) => b.gain - a.gain || (a.c.p.name < b.c.p.name ? -1 : 1))
    .slice(0, 4)
    .map(e => ({ name: e.c.p.name, plat: e.plat, votes: 0 }));
  // THE INCUMBENT ALWAYS GETS A SEAT ON THE BALLOT - on their own ideal, like
  // everybody else, not on the record. A mayor is a crab with an opinion, and
  // a year in the hat can change it. They are only ADDED here when the ranking
  // squeezed them out; an election missing the crab currently doing the job
  // reads as a bug even when the arithmetic is right.
  const inc = mayorCrab();
  if (inc && inc.p.npc && !cands.some(k => k.name === inc.p.name))
    cands.unshift({ name: inc.p.name, plat: idealPlatform(inc, grid), votes: 0, inc: true });
  else for (const k of cands) if (inc && k.name === inc.p.name) k.inc = true;
  // ...AND THE PLAYER STANDS, if they said so (Matt: the player can stand and
  // win, "with the conflict of interest that follows"). Their nominee is one
  // of their own crew - somebody has to wear the hat - and the platform is
  // whatever the player set on the HALL tab.
  if (hall.stand) {
    const nom = crabs.find(c => c.p.name === hall.nominee) || crabs[0];
    if (nom) {
      // ONE CANDIDATE PER POLICY - the line above says the ballot is a choice
      // between platforms rather than a list of names, and this is where that
      // has to be honoured. If a townsfolk crab was already standing on
      // EXACTLY the platform the player put their crab up on, the seat goes to
      // the player's nominee instead of the ballot running two identical
      // candidates and splitting their own supporters on a tie-break. That is
      // the player's one real advantage in an election and it is a fair one:
      // an NPC stands on what they personally want, while the player can read
      // the whole town and stand on what will actually carry it. The sitting
      // mayor is never displaced this way - they defend their seat themselves.
      const line = policyLine(hall.plat);
      const seat = cands.find(k => k.name === nom.p.name || (!k.inc && policyLine(k.plat) === line));
      if (seat) { seat.name = nom.p.name; seat.plat = Object.assign({}, hall.plat); seat.you = true; }
      else cands.push({ name: nom.p.name, plat: Object.assign({}, hall.plat), votes: 0, you: true });
    }
  }
  return cands;
}
// POLLING DAY. Every crab in town votes their own interest - no blocs, no
// loyalty, and the player's own crew will vote against their employer's
// platform if the shelter is where they sleep. Visitors do not vote: they are
// tourists, and they are gone on Tuesday.
function runElection() {
  const cands = buildBallot();
  if (!cands.length) return null;
  const town = allCrabs(), lines = [];
  for (const c of town) {
    let pick = null, pv = -Infinity;
    for (const k of cands) {
      const v = platValue(c, k.plat);
      // a dead heat in a voter's head goes to the crab already doing the job,
      // then alphabetically - so the same town votes the same way every run
      if (v > pv + 1e-9 || (Math.abs(v - pv) <= 1e-9 && pick
          && !pick.inc && (k.inc || k.name < pick.name))) { pv = v; pick = k; }
    }
    if (!pick) continue;
    pick.votes++;
    lines.push(c.p.name + " -> " + pick.name + ": " + voteReason(c, pick.plat));
  }
  let win = cands[0];
  for (const k of cands)
    if (k.votes > win.votes || (k.votes === win.votes && !win.inc && (k.inc || k.name < win.name))) win = k;
  const changed = hall.mayor !== win.name || policyLine(hall.policy) !== policyLine(win.plat);
  hall.mayor = win.name;
  hall.policy = { mech: win.plat.mech, rate: win.plat.rate | 0, bowls: win.plat.bowls | 0 };
  hall.termDay = day;
  hall.poll = { day, winner: win.name, you: !!win.you, turnout: town.length,
    cands: cands.map(k => ({ name: k.name, line: policyLine(k.plat), votes: k.votes })),
    // one written line per voter, and the cap is generous rather than tidy: a
    // grown town votes 14+ and the whole point of these is that a result can
    // be argued with from the roster
    lines: lines.slice(0, POLL_LINES) };
  if (window._stats) (window._stats.polls = window._stats.polls || []).push({
    day, winner: win.name, you: !!win.you, policy: policyLine(hall.policy),
    tally: hall.poll.cands.map(k => k.name + " " + k.votes).join(" "),
  });
  return { win, changed };
}

// ---------------------------------------------------------------- the office's night
// ONE PASS AT SETTLEMENT, in the order a town hall actually works: strike the
// purse, pay the landlord, buy tomorrow's bowls with whatever is left, and on
// a Sunday hand the whole thing over to whoever the town just voted for.
//
// THE FAILURE MODE IS THE POINT. If the purse cannot cover the shelter's rent
// the shortfall goes on the arrears and the lease takes a strike; three
// strikes running and Mr. Pincherton bolts the door for SHELTER_SHUT_NIGHTS.
// The crabs who live there then sleep rough - a state this game already models
// with real teeth (no rest banked at all, which feeds straight into the next
// morning's exhaustion and the settlement's sickness roll). The office's
// failure lands on exactly the people the office exists for.
function runTownHall() {
  if (!hallOn()) return;
  // THE OFFICE IS NEVER VACANT. The mayor can die like anybody else in this
  // town (universal mortality), so if the hat has nobody under it the crab
  // with the strongest claim takes it until the next Sunday.
  if (!mayorCrab()) { hall.mayor = null; seatFoundingMayor(); }
  if (townFund.shut > 0) townFund.shut--;
  collectPurse();
  // 1. the rent, which comes before the pot: a shelter with no roof serves
  //    nobody, and a mayor who buys soup before paying the lease is not a
  //    mayor for very long.
  const owed = SHELTER_RENT + townFund.arrears;
  const paid = fundRemit(owed, "MR. PINCHERTON", "SHELTER RENT");
  if (paid >= owed - 0.005) { townFund.arrears = 0; townFund.strikes = 0; }
  else {
    townFund.arrears = Math.round((owed - paid) * 100) / 100;
    townFund.strikes++;
    today.moved.push("THE SHELTER'S RENT WENT SHORT - $" + Math.ceil(townFund.arrears) + " OWED");
    if (townFund.strikes >= SHELTER_STRIKES && townFund.shut <= 0) {
      townFund.shut = SHELTER_SHUT_NIGHTS; townFund.strikes = 0; townFund.bowls = 0;
      toast = { text: "THE SHELTER IS BOLTED - THE TOWN FUND MISSED THE RENT", t: 8 };
      popText("SHELTER CLOSED", SHELTER_X + 8, 118, [255, 120, 120]);
      if (window._stats) window._stats.shelterShuts = (window._stats.shelterShuts || 0) + 1;
      sfx.angry();
    }
  }
  // 2. tomorrow's bowls, bought from a real business at a real price
  stockPot();
  // 3. ...and on polling day, the office changes hands (or doesn't)
  if (weekdayIdx(day) === POLL_WEEKDAY && hall.poll && hall.poll.day === day) return;
  if (weekdayIdx(day) !== POLL_WEEKDAY) return;
  const r = runElection();
  if (!r) return;
  const you = r.win.you ? "YOUR " : "";
  toast = { text: you + hall.mayor + " TAKES THE HAT - " + policyLine(hall.policy), t: 8 };
  today.moved.push(hall.mayor + " ELECTED MAYOR - " + policyLine(hall.policy));
  const m = mayorCrab();
  if (m) { popText("MAYOR!", m.x - 8, FLOOR_Y - 40, [255, 216, 96]); crabLog(m, "life", "ELECTED MAYOR - " + policyLine(hall.policy), 0); }
  sfx.ding();
}
// A FRESH TOWN IS NOT AN EMPTY ONE. The shelter has been open since before the
// player signed the lease, so somebody has been keeping it that way: the crab
// with the strongest claim to the office on day one is the one who most needs
// it to exist, on the founding cut of Mr. Pincherton's book. First ballot is
// day 7 - the town needs a week's trading before it has anything to vote on.
function seatFoundingMayor() {
  if (hall.mayor && mayorCrab()) return;
  const town = allCrabs().filter(c => c.p.npc);
  if (!town.length) return;
  let best = town[0], bs = -Infinity;
  for (const c of town) {
    const s = potStake(c);
    if (s > bs + 1e-9 || (Math.abs(s - bs) <= 1e-9 && c.p.name < best.p.name)) { bs = s; best = c; }
  }
  hall.mayor = best.p.name; hall.termDay = 1;
}

// ---------------------------------------------------------------- cpu owner hours policy
// NPC owners tune their own OPEN HOURS with a small, legible state machine,
// evaluated once per settlement. Table-driven: a future peer owner gets the
// same instincts by adding a row to HOURS_POLICY. Signals observed per day:
// customers who ARRIVED in the first/last open hour, and the queue left
// standing when the doors shut (turned away at close).
//   EXTEND   close +1h  after `pressureDays` straight days of a real queue at
//                       close (>= extendQ) - only within the staff-tiredness
//                       budget (nobody on the roster past tiredCap)
//   LATER    open  +1h  after `quietDays` straight DEAD first hours
//   EARLIER  close -1h  after `quietDays` straight dead last hours + clean closes
// At most one move per settlement, the observation history resets after a
// move and a cooldown day follows - the schedule walks, it never thrashes.
// Converges because the shrink rules need sustained ZERO demand at a boundary
// while extend needs sustained queue pressure: the regimes are disjoint and
// each move weakens its own trigger (proved over 20 days in the suite).
const HOURS_POLICY = {
  // Measured (2026-08-18): with her policy live the baseline matrix is
  // UNCHANGED (0/8 median 10, tail 14->11) and growth chef,table reads
  // median 9 vs 10 - exactly the documented per-build wobble. A damping
  // probe (minSpan 8h) measured the identical growth list, proving the
  // 1-day shift is stream chaos from her first move, not the shrink depth -
  // so the floor stays at 6h where her schedule has room to be interesting.
  showers: { quietDays: 3, pressureDays: 2, extendQ: 2, minSpan: 6 * 60, tiredCap: 0.75 },
  // ...and the juice bar, for the day a PEER owner holds its lease (see THE
  // RIVALRY). Inert while the player owns it - the caller only ever runs this
  // for a business somebody else is running.
  juicebar: { quietDays: 3, pressureDays: 2, extendQ: 2, minSpan: 6 * 60, tiredCap: 0.75 },
};
let hoursPolicyState = {};        // biz -> { hist: [{f,l,q}...], cd }  (persisted)
let hoursObs = {}, _wasOpen = {}; // per-day boundary observations (transient)
function noteArrival(b) {         // somebody joined a queue: which hour was it?
  const h = BIZ[b].hours;
  const o = hoursObs[b] = hoursObs[b] || { first: 0, last: 0, closeQ: 0 };
  if (tmin < h.open + 60) o.first++;
  else if (tmin >= h.close - 60 && tmin < h.close) o.last++;
}
function trackCloseQueues() {     // the moment a shop's hours end, count who was left standing
  for (const b of Object.keys(BIZ)) {
    const open = bizUnlocked(b) && bizOpenNow(b);
    if (_wasOpen[b] && !open) {
      const q = customers.filter(k => k.biz === b && (k.state === "waiting" || k.state === "arriving")).length;
      if (q) (hoursObs[b] = hoursObs[b] || { first: 0, last: 0, closeQ: 0 }).closeQ += q;
    }
    _wasOpen[b] = open;
  }
}
function runHoursPolicy(b) {      // one NPC owner reads the day's signals at settlement
  const cfg = HOURS_POLICY[b];
  if (!cfg || window._noHoursPolicy || forSale(b)) return;
  const st = hoursPolicyState[b] = hoursPolicyState[b] || { hist: [], cd: 0 };
  const obs = hoursObs[b] || { first: 0, last: 0, closeQ: 0 };
  hoursObs[b] = { first: 0, last: 0, closeQ: 0 };
  st.hist.push({ f: obs.first, l: obs.last, q: obs.closeQ });
  if (st.hist.length > 4) st.hist.shift();
  if (st.cd > 0) { st.cd--; return; }
  const h = BIZ[b].hours, span = h.close - h.open;
  const quiet = st.hist.slice(-cfg.quietDays), press = st.hist.slice(-cfg.pressureDays);
  // ONE LEVER, ONE OWNER OF IT: an owner fighting a price war for the shop
  // next door does not shut early because last Tuesday's first hour was quiet.
  // The rivalry's hours move and this policy's shrink rules are the same
  // control, so the shrinks stand down while she is competing (see THE RIVALRY).
  const fighting = b === RIVAL_CFG.SHOP && (rival.stage === "compete" || rival.stage === "offer");
  const staffRested = allCrabs().filter(k => k.p.job === b).every(k => (k.p.tired || 0) < cfg.tiredCap);
  let open = h.open, close = h.close, line = null;
  if (press.length >= cfg.pressureDays && press.every(d => d.q >= cfg.extendQ)
      && staffRested && h.close + 60 <= HOURS_MAX) {
    close += 60; line = "NOW CLOSES AT " + fmtHr(close);          // customers at the door: stay open later
  } else if (!fighting && quiet.length >= cfg.quietDays && quiet.every(d => d.f === 0) && span - 60 >= cfg.minSpan) {
    open += 60; line = "NOW OPENS AT " + fmtHr(open);             // dead mornings: sleep in
  } else if (!fighting && quiet.length >= cfg.quietDays && quiet.every(d => d.l === 0 && d.q === 0) && span - 60 >= cfg.minSpan) {
    close -= 60; line = "NOW CLOSES AT " + fmtHr(close);          // dead evenings: shut early
  }
  if (!line) return;
  setBizHours(b, open, close);
  st.hist = []; st.cd = 1;   // fresh eyes on the new schedule, and a day to breathe
  const who = OWNERS[bizOwner(b)].name;
  toast = { text: who + " " + line + " (" + BIZ[b].short + " " + fmtHr(h.open) + "-" + fmtHr(h.close) + ")", t: 7 };
  today.moved.push(who + " " + line);
  if (window._stats) (window._stats.hoursMoves = window._stats.hoursMoves || [])
    .push({ day, biz: b, open: h.open, close: h.close });
}

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
  LIMIT: 90,           // base line (tightened from 120 when T2 landed - runways compound)
  LIMIT_PER_CREW: 70,  // the bank lends against payroll: extra headroom per crew beyond the founders
  RATE: 0.25,          // nightly compounding interest on the drawn balance
  MIN_FRAC: 0.35,      // minimum payment: interest + this share of principal...
  MIN_BASE: 12,        // ...plus a floor - proportional, so small debts don't crush a growing town
  WARN_DAYS: 4,        // forecast horizon that fires the bankruptcy toast
  CHIP_DAYS: 6,        // forecast horizon that shows the warning chip
  DEBT_WARN: 0.6,      // share of the line drawn that warns on its own, run rate or not
  NPC_DARK_NIGHTS: 2,  // LEGACY: peer bankruptcy used to shutter a shop for two
                       // nights and write the debt off - a zombie that closed
                       // and reopened forever. It now CLOSES and goes up for
                       // sale (see SALE_CFG). Kept only so a save taken
                       // mid-dark loads and its timer still runs out.
};
// ==========================================================================
let credit = { bal: 0, warned: false };   // the player's line (NPCs: OWNERS[o].credit)
let bankrupt = false;                     // gameOver flavor: the bank, not the landlord
// One owner's nightly credit settlement (pure math - shared by the player
// hook, the NPC hook and the forecaster): interest compounds on the carried
// balance, the night's bill draws on the line when funds are short, then the
// minimum payment auto-collects from what's left. ok:false = BANKRUPT
// (obligations missed with the line exhausted); funds are left untouched.
function creditLimit() { return CREDIT_CFG.LIMIT + CREDIT_CFG.LIMIT_PER_CREW * Math.max(0, crabs.length - 2); }
function settleCreditLine(bal, funds, due) {
  const r = { bal, funds, drew: 0, interest: 0, paid: 0, ok: true, missedMin: false };
  if (r.bal > 0) { r.interest = Math.ceil(r.bal * CREDIT_CFG.RATE); r.bal += r.interest; }
  const minDue = r.bal > 0 ? Math.min(r.bal, r.interest + Math.ceil((r.bal - r.interest) * CREDIT_CFG.MIN_FRAC) + CREDIT_CFG.MIN_BASE) : 0;
  if (r.funds < due) {
    const need = Math.ceil(due - r.funds);
    if (need <= creditLimit() - r.bal) { r.bal += need; r.funds += need; r.drew = need; }
    else { r.ok = false; return r; }              // can't even draw the bill
  }
  r.funds -= due;
  if (minDue > 0) {
    if (r.funds >= minDue) { r.funds -= minDue; r.bal -= minDue; r.paid = minDue; }
    else {
      // missedMin is REPORTED, never acted on here: the player's cliff is
      // unchanged (ok:false), but a peer owner's business failure counts
      // these misses (see noteLeaseMiss) - repeated misses, not one bad night
      r.missedMin = true;
      if (creditLimit() - r.bal < minDue) r.ok = false;   // missed + exhausted
      // else: payment missed but headroom remains - the balance just compounds
    }
  }
  return r;
}
function creditDueTonight() {   // cash the bank will auto-collect at 20:00
  if (credit.bal <= 0) return 0;
  const int2 = Math.ceil(credit.bal * CREDIT_CFG.RATE);
  return Math.min(credit.bal + int2, int2 + Math.ceil(credit.bal * CREDIT_CFG.MIN_FRAC) + CREDIT_CFG.MIN_BASE);
}
function bizDark(b) {   // shut: nobody owns it, the owner died, or (legacy saves) a dark-night timer runs
  if (forSale(b)) return true;
  const o = OWNERS[bizOwner(b)];
  return !!(o && ((o.darkT || 0) > 0 || o.gone));
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
  // run rate = AVERAGE income (Matt: one bad day shouldn't cry wolf over a
  // healthy average); the replay bills FULL wages every night - tonight's
  // day-off skips are noise over a 10-settlement horizon
  const g = sum / n, due = totalRent() + crabs.reduce((s2, c2) => s2 + Math.round(contractPay(c2)), 0);
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
  // A SECOND, STRUCTURAL TRIGGER. The run-rate forecast reads the day ledger's
  // AVERAGE (the owner's call: one bad day must not cry wolf), and since the
  // town's income got lumpy - walk-outs, microsleeps, illness swings - a slide
  // can outrun the average and leave only a day's notice. But a town cannot
  // reach bankruptcy without first eating its credit line, and THAT is smooth:
  // a line past DEBT_WARN full is a slide already well under way, whatever
  // this week's takings looked like. Warn on either signal.
  const drowning = credit.bal >= creditLimit() * CREDIT_CFG.DEBT_WARN;
  if (drowning && bankHorizon > CREDIT_CFG.WARN_DAYS && !credit.warned) {
    credit.warned = true;
    toast = { text: "THE LINE IS " + Math.round(100 * credit.bal / creditLimit()) + "% DRAWN - THE BANK IS WATCHING", t: 8 };
    sfx.angry();
    if (window._stats && window._stats.warnDay == null) window._stats.warnDay = day;
  }
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

// ------------------------------------------- business failure & succession
// A business that cannot service its obligations no longer limps on as a
// zombie (dark two nights, debt forgiven, repeat forever). It FAILS, CLOSES,
// goes UP FOR SALE, and CHANGES HANDS.
//
// FAILURE is defined out of the credit machinery that was already here: each
// settlement, a lease whose minimum payment is missed - or whose bill cannot
// even be drawn on the line - is a STRIKE against that business. SALE_CFG
// .STRIKES in a row (they reset the moment a night settles clean) and the
// shutters go up. One bad night is not a failure; three in a row is.
//
// Everything here is DATA, never a special case for SUDSY: BIZ[k].owner keys
// into the OWNERS registry, `null` means nobody owns it, and a new owner is
// simply a new registry entry. So this supports an owner changing, an owner
// with two businesses (one till, two leases, strikes counted per lease), an
// owner with none (they lost it - the pier and the job board are their
// livelihood, same as any crab), and - the death seam - an owner who is no
// longer in the town at all: runSuccession sweeps their business onto the
// market rather than leaving it orphaned.
const SALE_CFG = {
  STRIKES: 3,          // missed settlements in a row before the shutters go up
  RENT_NIGHTS: 3,      // asking price: the landlord wants this many nights up front...
  FIXTURE: 15,         // ...plus this per fixture (every station spot, stall and table)...
  GOODWILL_DAYS: 2,    // ...plus this many days of what the place has been taking
  FLOAT_FRAC: 0.5,     // half the price becomes the new owner's opening till
  RESERVE: 30,         // ...and a buyer keeps 3 nights of house rent back: nobody buys their way onto a cot
};
let market = {};       // bizKey -> { price, day, why } - the live FOR SALE listings (persisted)
let bizTake = {};      // bizKey -> the last 3 days' takings (persisted; the goodwill half of a price)
let bizStrike = {};    // bizKey -> consecutive missed settlements (persisted)
function forSale(b) { return !!BIZ[b] && BIZ[b].owner === null; }
function saleList() { return Object.keys(BIZ).filter(forSale); }
// the BUY chip on a shuttered shopfront - the same "the sign is the owner's
// office door" idiom the MANAGE chip uses. One geometry function so the draw
// and the hit-test can never drift apart; fixed width so the label can change.
let saleArm = null, saleArmT = 0;   // two-tap confirm: a business is not a misclick
function saleChipRect(b) {
  const w = 42, z = BIZ[b];
  return { x: Math.round((z.x0 + z.x1) / 2 - w / 2), y: 133, w, h: 11 };
}
// THE PLAYER'S BUY PATH, whole. The world click handler only decides WHICH
// chip was hit and hands over to this - so the suite drives exactly the code
// a tap drives, with nothing forked into tools/.
function tapSaleChip(b) {
  if (!forSale(b)) return false;
  const price = salePrice(b);
  if (coins < price) {
    toast = { text: "YOU CAN'T COVER $" + fmt(price) + " FOR " + BIZ[b].name, t: 5 };
    if (typeof sfx !== "undefined" && sfx.angry) sfx.angry();
    return false;
  }
  if (saleArm !== b) {   // a business is not a misclick: arm, then confirm
    saleArm = b; saleArmT = 3.5;
    toast = { text: "TAP AGAIN TO BUY " + BIZ[b].name + " FOR $" + fmt(price), t: 4 };
    if (typeof sfx !== "undefined" && sfx.ding) sfx.ding();
    return false;
  }
  saleArm = null; saleArmT = 0;
  const ok = buyBusiness(b, null);
  if (ok) save();
  return ok;
}
// ---- BUYING A BUSINESS THAT IS STILL TRADING ------------------------------
// The failure path above already lets the player take on a SHUTTERED shop.
// The owner's directive on the hotel asks for something the town did not have:
// "a mechanism for owning it" that does not require waiting for the owner to
// go under. So a business can carry `sellable` - REEF is an old crab with a
// hotel and no heir, and he will take a fair offer - and the shopfront grows an
// OFFER chip beside the sign, on exactly the same two-tap arm the BUY chip uses.
//
// IT IS THE SAME PATH, NOT A SECOND ONE. `buyOutOwner` lists the shop (which
// lays the owner and his staff off, kills his postings, and puts the lease on
// the market exactly as a failure does), prices the listing at the going-concern
// price, and then runs the ordinary player purchase. The one thing it adds is
// that somebody is on the other side of this deal: the seller BANKS what the
// player parts with, and walks down to the pier a rich crab.
const OFFER_MULT = 1.5;   // a shop that is still taking money costs more than a shuttered one
function offerPrice(b) { return Math.round(askingPrice(b) * OFFER_MULT); }
function ownerIsSoft(b) {          // is the crab holding this lease a willing seller?
  const o = OWNERS[bizOwner(b)];
  return !!(o && o.soft && !o.gone);
}
function canOffer(b) {
  return !!BIZ[b] && !!BIZ[b].sellable && ownerIsSoft(b) && bizUnlocked(b) && !forSale(b)
    && bizOwner(b) !== "player" && !bizDark(b);
}
function offerChipRect(b) {
  const w = 54, z = BIZ[b];
  return { x: Math.round((z.x0 + z.x1) / 2 - w / 2), y: 105, w, h: 10 };
}
function tapOfferChip(b) {
  if (!canOffer(b)) return false;
  const price = offerPrice(b);
  if (coins < price) {
    toast = { text: "YOU CAN'T COVER $" + fmt(price) + " FOR " + BIZ[b].name, t: 5 };
    if (typeof sfx !== "undefined" && sfx.angry) sfx.angry();
    return false;
  }
  if (saleArm !== b) {
    saleArm = b; saleArmT = 3.5;
    toast = { text: "TAP AGAIN TO BUY " + BIZ[b].name + " FOR $" + fmt(price), t: 4 };
    if (typeof sfx !== "undefined" && sfx.ding) sfx.ding();
    return false;
  }
  saleArm = null; saleArmT = 0;
  const ok = buyOutOwner(b);
  if (ok) save();
  return ok;
}
// `buyer` is a crab, or null for the player tapping the OFFER chip. A peer
// buyer walks the SAME path - list the shop at the willing seller's price,
// then run the ordinary purchase - because "somebody else got there first" has
// to be the same transaction the player would have made, or the two prices
// drift apart and the race stops being a race. Nothing renders between the
// listing and the purchase (this is one settlement call), so the lease is
// never seen unowned and never seen owned twice.
function buyOutOwner(b, buyer) {
  if (!canOffer(b)) return false;
  const price = offerPrice(b);
  if (buyer ? buyer.p.wallet < price + SALE_CFG.RESERVE : coins < price) return false;
  const oid = bizOwner(b);
  const seller = allCrabs().find(k => k.p.owner === oid) || null;
  if (seller === buyer) return false;            // nobody buys a hotel off themselves
  if (!listForSale(b, "soldup")) return false;
  market[b].price = price;                       // at the going-concern price, not the fire-sale one
  if (!buyBusiness(b, buyer || null)) return false;   // the player's own path: pays price, keeps the float
  const banked = price - Math.floor(price * SALE_CFG.FLOAT_FRAC);
  if (seller) {
    seller.p.wallet += banked;                   // conserved: exactly what left the player's pocket
    crabLog(seller, "money", "SOLD THE " + BIZ[b].name + " FOR $" + price, 0);
    crabLog(seller, "life", "OUT OF THE HOTEL TRADE - BACK TO THE WATER", 0);
    today.moved.push(seller.p.name + " SOLD UP - $" + banked + " IN THE BANK");
  }
  if (window._stats) (window._stats.buyouts = window._stats.buyouts || [])
    .push({ day, biz: b, price, seller: seller ? seller.p.name : null,
      buyer: buyer ? buyer.p.name : "YOU" });
  return true;
}
function bizFixtures(b) {
  const z = BIZ[b];
  let n = 0;
  for (const k in z.stations) n += z.stations[k].length;
  return n + (z.stalls || []).length + ((bizTables(b) || []).length);
}
// The asking price, every term of it legible on the sign: the LEASE
// (RENT_NIGHTS nights of rent up front), the FIXTURES (every station spot,
// stall and table at SALE_CFG.FIXTURE apiece) and GOODWILL (what the shop has
// genuinely been taking, from the day book - not a guess). Fixed at listing
// time: a shop sitting dark for a fortnight doesn't get cheaper, because what
// you are buying is the lease and the kit.
function askingPrice(b) {
  const h = bizTake[b] || [];
  const avg = h.length ? h.reduce((s, v) => s + v, 0) / h.length : 0;
  return Math.max(BIZ[b].rent * 2, Math.round(
    BIZ[b].rent * SALE_CFG.RENT_NIGHTS + bizFixtures(b) * SALE_CFG.FIXTURE
    + avg * SALE_CFG.GOODWILL_DAYS));
}
function salePrice(b) { return market[b] ? market[b].price : askingPrice(b); }
// Out of a job, not out of the simulation. The pier is the town's default
// profession and the job board is the way back off it - a laid-off crab still
// pays their $10 house rent tonight, and climbs (or slips) the same ladder
// everyone else does.
function layOff(k) {
  logLaidOff(k);   // DIARY: read the old job BEFORE it is cleared below
  abortChef(k); abortErrand(k);
  k.duty = false; k.pendingOff = false; k.kstate = "idle"; k.carrying = null;
  k.dayState = "home"; k.cstate = "";
  k.p.employer = null; k.p.owner = null; k.p.ot = false;
  if (k.p.npc) {
    k.p.job = "fishing"; k.workBiz = "fishing"; k.p.fisher = true;
    k.fishSpot = k.p.boat != null ? boatSpot(k.p.boat)
      : fishSpotFor(npcs.filter(x => x.p.fisher && x !== k).length);
  } else {
    k.p.job = "shack"; k.workBiz = "shack";   // your crew come back to your kitchen
  }
}
// THE SHUTTERS GO UP. Staff (and the owner-operator, who is staff too) are
// laid off, the postings die with the shop, and the lot stands in the world
// wearing a FOR SALE sign until somebody can afford it.
function listForSale(b, why) {
  if (!BIZ[b] || forSale(b) || bizOwner(b) === "player") return false;   // the player's own failure is BANKRUPT, not a sale
  const o = OWNERS[bizOwner(b)];
  const price = askingPrice(b);
  const laid = [];
  for (const k of allCrabs().slice()) {
    if (k.p.job !== b && !(o && k.p.employer === o.id)) continue;
    // an owner-operator who still holds ANOTHER lease steps down to that
    // counter rather than out of business - clearing p.owner outright would
    // orphan the other shop at the next settlement (the death seam reads
    // exactly that field)
    if (o && k.p.owner === o.id) stepDownOwner(k, o.id, b);
    else layOff(k);
    laid.push(k.p.name);
  }
  BIZ[b].owner = null;
  BIZ[b].autoLabor = false;
  bizStrike[b] = 0;
  market[b] = { price, day, why: why || "bankrupt" };
  jobBoard = jobBoard.filter(j => j.biz !== b);
  const who = o ? o.name : "THE OWNER";
  // "soldup" is a WILLING seller, not a failure: same machinery, different news
  const sold = why === "soldup";
  toast = { text: sold ? who + " IS SELLING UP - " + BIZ[b].name + " CHANGES HANDS"
    : BIZ[b].name + " HAS CLOSED - FOR SALE, $" + price, t: 8 };
  today.moved.push(sold ? who + " SOLD " + BIZ[b].short : BIZ[b].short + " CLOSED - FOR SALE $" + price);
  if (laid.length) today.moved.push(laid.join(", ") + " LAID OFF - BACK TO THE PIER");
  if (!sold) popText("FOR SALE $" + price, (BIZ[b].x0 + BIZ[b].x1) / 2 - 20, 100, [255, 190, 90]);
  if (!sold && typeof sfx !== "undefined" && sfx.angry) sfx.angry();
  if (window._stats) (window._stats.closures = window._stats.closures || [])
    .push({ day, biz: b, price, why: why || "bankrupt", owner: who, laid: laid.slice() });
  return true;
}
// a strike, or the third strike. Returns true when the shop closed tonight.
function noteLeaseMiss(b, o) {
  const n = bizStrike[b] = (bizStrike[b] || 0) + 1;
  if (n >= SALE_CFG.STRIKES) return listForSale(b, "bankrupt");
  const left = SALE_CFG.STRIKES - n;
  toast = { text: (o ? o.name : "THE OWNER") + " MISSED THE " + BIZ[b].short + " RENT - "
    + left + " NIGHT" + (left === 1 ? "" : "S") + " TO PUT IT RIGHT", t: 6 };
  today.moved.push((o ? o.name : "THE OWNER") + " MISSED RENT (" + n + "/" + SALE_CFG.STRIKES + ")");
  return false;
}
// a stable registry key for a crab-turned-owner (never "player")
function ownerIdFor(c) {
  let id = String(c.p.name).toLowerCase().replace(/[^a-z0-9]/g, "") || "owner";
  if (id === "player") id = "owner" + id;
  // a recycled name must not inherit a dead owner's till
  if (OWNERS[id] && !allCrabs().some(k => k.p.owner === id)
      && !Object.keys(BIZ).some(b => bizOwner(b) === id)) delete OWNERS[id];
  return id;
}
// SUCCESSION. `buyer` is a crab, or null for the player buying through the
// shopfront. The price is paid out of savings; SALE_CFG.FLOAT_FRAC of it
// becomes the shop's OPENING TILL (stock, soap, change in the drawer) and the
// remainder is the lease transfer Mr. Pincherton pockets - destroyed, exactly
// like rent, so no money is ever minted here. For the player the two pots are
// one (their till IS `coins`), so the float never leaves their pocket and
// their real cost is the lease transfer - they must still HOLD the full
// asking price to sign.
function buyBusiness(b, buyer) {
  if (!forSale(b)) return false;
  const price = salePrice(b), float = Math.floor(price * SALE_CFG.FLOAT_FRAC);
  let who;
  if (!buyer) {
    if (coins < price) return false;
    coins -= price - float;
    BIZ[b].owner = "player"; BIZ[b].bought = true; BIZ[b].autoLabor = false;
    who = "YOU";
  } else {
    if (buyer.p.wallet < price + SALE_CFG.RESERVE) return false;
    buyer.p.wallet -= price;
    const id = ownerIdFor(buyer);
    OWNERS[id] = OWNERS[id] || { id, name: buyer.p.name, till: 0, credit: 0, darkT: 0 };
    OWNERS[id].till += float;
    BIZ[b].owner = id;
    BIZ[b].autoLabor = true;    // a peer owner runs the same policy table SUDSY does
    if (!buyer.p.owner) {       // their FIRST shop: an owner-operator behind their own counter
      abortChef(buyer); abortErrand(buyer);
      buyer.p.owner = id; buyer.p.job = b; buyer.p.employer = null; buyer.p.shift = "D";
      buyer.duty = false; buyer.pendingOff = false; buyer.kstate = "idle";
      buyer.carrying = null; buyer.dayState = "home"; buyer.cstate = "";
      buyer.workBiz = b; buyer.fishSpot = null;
    }
    who = buyer.p.name;
    crabLog(buyer, "money", "BOUGHT THE " + BIZ[b].name + " FOR $" + price, 0);   // DIARY
    crabLog(buyer, "life", "THEIR OWN BOSS NOW - RUNS THE " + BIZ[b].short, 0);
  }
  delete market[b];
  bizStrike[b] = 0;
  toast = { text: who + " BOUGHT " + BIZ[b].name + " FOR $" + price + "!", t: 8 };
  today.moved.push(who + " BOUGHT " + BIZ[b].short + " ($" + price + ")");
  popText("UNDER NEW OWNERSHIP", (BIZ[b].x0 + BIZ[b].x1) / 2 - 30, 100, [140, 255, 160]);
  if (typeof sfx !== "undefined" && sfx.ding) sfx.ding();
  if (window._stats) (window._stats.sales = window._stats.sales || [])
    .push({ day, biz: b, price, buyer: who, float });
  return true;
}
// One pass at settlement: book the day's takings (they are the goodwill in
// tomorrow's asking prices), sweep up any business whose owner is no longer
// in the town, and let the market clear.
function runSuccession() {
  for (const b of Object.keys(BIZ)) {
    const h = bizTake[b] = bizTake[b] || [];
    h.push(Math.round(((today.biz || {})[b] || {}).take || 0));
    if (h.length > 3) h.shift();
  }
  // THE DEATH SEAM (kept deliberately small): an owner who has left the town -
  // dead, or gone any other way - leaves a business, not an orphan. Nobody
  // holds the key, so the lot goes on the market on the same terms as a
  // failure, and the same buyers turn up.
  for (const b of Object.keys(BIZ)) {
    const oid = bizOwner(b);
    if (!oid || oid === "player") continue;
    if (!allCrabs().some(k => k.p.owner === oid)) listForSale(b, "gone");
  }
  // ...and the market clears. ANY crab with the savings can take a shop on -
  // a fisher who has been saving for a boat can buy a shower house instead
  // and become an owner-operator. The deepest pocket signs; a buyer who
  // already owns a shop simply adds a second lease to the same till. (The
  // player's own crew are under contract with the player and are not in the
  // pool - the player buys through the shopfront themselves.)
  for (const b of saleList()) {
    // ...and one crab jumps the queue: the rival who has been trying to buy
    // this exact shop for a fortnight (see THE RIVALRY). She pays the same
    // market price out of the same pocket - she just gets asked first.
    if (rivalFirstRefusal(b)) continue;
    const price = salePrice(b);
    const cands = allCrabs().filter(k => k.p.npc && !k.p.sick
      && k.p.wallet >= price + SALE_CFG.RESERVE);
    if (!cands.length) continue;
    cands.sort((a, c2) => c2.p.wallet - a.p.wallet || (a.p.name < c2.p.name ? -1 : 1));
    buyBusiness(b, cands[0]);
  }
}

// ------------------------------------------------- THE RIVALRY: SUDSY WANTS THE JUICE BAR
// Peer owners already ran shops, set hours, set wages, hired, and bought a
// FAILED business off the market. Nobody ever came for a business that was
// doing FINE - and the player's juice bar, sixty pixels down the promenade
// from her own shower house, is the obvious prize.
//
// SHE IS A RIVAL WITH A BALANCE SHEET, NOT AN EVENT. Every number below comes
// out of her own books - her till, her three-day takings, her rent record -
// and every move she makes is a lever the player also holds: a price, an
// opening hour, a wage, an offer. Nothing fires out of nowhere: she is SEEN
// eyeing the place for days, then she names a number, and only if she is
// refused does she compete. All of it is survivable, because a price war costs
// HER a till too and she walks it back when she cannot afford it.
//
// THE SHAPE, in one line each:
//   EYEING    intent >= EYE. She stands outside the bar on her breaks, the day
//             report says so every night, the diary logs it, a toast names it.
//   OFFER     intent >= OFFER and she can raise a number worth putting on the
//             table. The card shows what she offers AND what the place is
//             worth, so a lowball reads as a lowball.
//   COMPETE   refused (or ignored for ANSWER_DAYS). One lever every STEP_DAYS,
//             announced, and reversed the moment her own till cannot carry it.
//   ...and she comes back with a better number every REOFFER days, because she
//   has been saving and because competing has made the bar cheaper.
const RIVAL_CFG = {
  PRIZE: "juicebar",     // the shop she wants (the player's, next door to hers)
  SHOP: "showers",       // ...and the balance sheet she reads. THE RIVALRY BELONGS TO
                         // THIS LEASE, NOT TO SUDSY: whoever holds the shower house is
                         // the rival, exactly the way HOURS_POLICY and WAGE_POLICY key
                         // on the BUSINESS. SUDS SHOWERS fails in most long runs and a
                         // fisher buys it off the market; hard-wiring "sudsy" would have
                         // made this dead content the day her lease changed hands, and
                         // the succession layer already says a new owner is just data.
  OWNER: "sudsy",        // (the founding holder - documentation, not a lookup key)
  // AMBITION IS A WAR CHEST, NOT A MOOD. She puts money by out of her own
  // till on nights her shop settles clean and comfortable, and what she has
  // saved against what the bar is worth IS the intent. Measured first: a real
  // SUDS SHOWERS runs a till of $150-220 before the player opens a juice bar
  // next door and $0-45 after, so a keep-back of two nights' rent and a wage
  // means she banks in the good months and banks nothing in the lean ones -
  // which is exactly the pressure this is supposed to model.
  BANK_KEEP: 100,        // she leaves two nights' rent and a wage in the till...
  BANK_FRAC: 0.5,        // ...then puts half of what is over it by...
  BANK_MAX: 60,          // ...up to this a night
  CAP: 1.3,
  EYE: 0.28,             // she is SEEN at the bar once she can raise this share of it...
  DROP: 0.18,            // ...and stops being seen there below THIS. A hysteresis band,
                         // never a knife edge - the same shape auto-manage uses, and the
                         // reason a single dark trading day cannot switch her off.
  OFFER: 0.45,           // she puts a number on it at nearly half...
  WARN_DAYS: 3,          // ...but NEVER before this many settlements of being seen there.
                         // The warning is guaranteed by the CLOCK, not by the money
                         // happening to cross two lines in the right order.
  SMOOTH: 0.3,           // how fast her valuation of the bar follows its takings. A
                         // three-day book on a small shop swings 2x overnight; she runs
                         // an average of it, like anybody pricing a business would.
  LOWBALL: 0.35,         // and she will not insult anybody: no offer under this share
                         // of what the place is worth
  PREMIUM: 0.35,         // a GOING CONCERN costs this much over the shuttered price...
  HEALTH: 0.5,           // ...at half weight for a dead shop, full for a thriving one
  FLOAT_NIGHTS: 1,       // and she keeps this many nights of the NEW shop's rent back -
                         // nobody buys a second shop and cannot open it in the morning
  ANSWER_DAYS: 3,        // an offer left unanswered lapses, and lapsing IS a refusal
  REOFFER: 5,            // days before she comes back with a better number
  STEP_DAYS: 2,          // one competition move every this many days
  // THE THREE COMPETITION LEVERS, all of them settings the player also holds.
  // A price cut and a longer day cost NOTHING up front - they cost margin, and
  // the margin shows up as a missed rent, which is the retreat trigger. Only
  // the wage costs cash on the night. See runRivalCompete.
  CUT: 0.1,              // how much she takes off her own board each cut
  WAGE_OVER: 2,          // a wage push lands this far over the best rate in town
  HOLD: 0.35,            // what SHE wants for HER shop, on top, while her blood is up
  ONLY: 0.4,             // ...and what anybody wants for the ONLY shop they have. An
                         // owner-operator is not selling their livelihood at the price
                         // of a shuttered lot on day two - this is the premium that
                         // keeps a peer's counter out of reach until the player has
                         // genuinely built something.
  STAKEOUT: 0.5,         // how often an idle-hands trip takes her past the bar
};
// stage: none -> eyeing -> offer -> compete (-> offer -> ...), or done (she has it)
function newRival() {
  return { intent: 0, fund: 0, stage: "none", offer: null, offerDay: 0, lastOffer: 0,
    refused: 0, step: 0, stepDay: 0, noDay: 0, eyeDay: 0, val: 0, who: null };
}
let rival = newRival();
const RIVAL_STAGES = ["none", "eyeing", "offer", "compete", "done"];
function loadRival(r) {
  rival = newRival();
  if (!r || typeof r !== "object") return;   // an old save has no rivalry, and "none" IS the old world
  rival.intent = Math.max(0, Math.min(RIVAL_CFG.CAP, +r.intent || 0));
  rival.fund = Math.max(0, Math.round(+r.fund || 0));
  rival.val = Math.max(0, Math.round(+r.val || 0));
  rival.who = typeof r.who === "string" && OWNERS[r.who] ? r.who : null;
  rival.stage = RIVAL_STAGES.includes(r.stage) ? r.stage : "none";
  rival.refused = Math.max(0, Math.round(+r.refused || 0));
  rival.step = Math.max(0, Math.round(+r.step || 0));
  rival.stepDay = Math.max(0, Math.round(+r.stepDay || 0));
  rival.noDay = Math.max(0, Math.round(+r.noDay || 0));
  rival.eyeDay = Math.max(0, Math.round(+r.eyeDay || 0));
  rival.offerDay = Math.max(0, Math.round(+r.offerDay || 0));
  rival.lastOffer = Math.max(0, Math.round(+r.lastOffer || 0));
  if (r.offer && +r.offer.price > 0)
    rival.offer = { price: Math.round(+r.offer.price), worth: Math.round(+r.offer.worth || 0),
      day: Math.round(+r.offer.day || 0) };
  if (rival.stage === "offer" && !rival.offer) rival.stage = "eyeing";   // a half-written save cannot strand a card
}
// WHO THE RIVAL IS TODAY: whoever holds the lease next door. `null` while the
// shop is on the market or in the player's hands - in both cases there is
// nobody across the street to want anything.
function rivalOwnerId() {
  const oid = bizOwner(RIVAL_CFG.SHOP);
  return oid && oid !== "player" ? oid : null;
}
function rivalCrab() {
  const oid = rivalOwnerId();
  return oid ? allCrabs().find(k => k.p.owner === oid) || null : null;
}
function rivalName() { const o = OWNERS[rivalOwnerId()]; return (o && o.name) || "THE OWNER"; }
function rivalOn() {
  if (window._noRival) return false;                  // the measurement hatch (the game never sets it)
  const o = OWNERS[rivalOwnerId()];
  return !!(o && !o.gone && rivalCrab());
}
// THE WAR CHEST BELONGS TO A PERSON. When the lease changes hands the money
// goes back to whoever put it by (it is real money and must not evaporate),
// and the new holder starts their own ambition from nothing.
function rivalOwnerCheck() {
  const oid = rivalOwnerId();
  if (rival.who === oid) return;
  if (rival.fund > 0 && rival.who && OWNERS[rival.who]) OWNERS[rival.who].till += rival.fund;
  const was = rival.who;
  const keep = rival.stage === "done";   // a finished rivalry stays finished
  Object.assign(rival, newRival());
  rival.who = oid;
  if (keep) rival.stage = "done";
  if (was && oid && OWNERS[oid])
    today.rival.push(OWNERS[oid].name + " HAS THE " + BIZ[RIVAL_CFG.SHOP].short + " NOW");
}
function prizeIsPlayers() {
  return bizUnlocked(RIVAL_CFG.PRIZE) && bizOwner(RIVAL_CFG.PRIZE) === "player";
}
// her purse is her TILL plus her own POCKET - the same two pots the housing
// ladder already moves money between, and the only money she has
function rivalPurse() {
  const o = OWNERS[rivalOwnerId()], c = rivalCrab();
  return (o ? Math.max(0, o.till) : 0) + (c ? Math.max(0, c.p.wallet) : 0);
}
// HER LINE OF CREDIT, the same one the player draws on and the same one that
// shuts a shop after three missed settlements. A small operator buying a second
// shop borrows to do it; this is the game's own machinery for that, and the
// risk is real - she services the debt out of both tills afterwards or the
// three-strike rule takes a lease off her.
function rivalCredit() {
  const o = OWNERS[rivalOwnerId()];
  if (!o) return 0;
  // A LINE OF CREDIT IS A BUSINESS LINE. A crab with no lease has no line, so
  // losing her own shop ends the ambition outright rather than leaving a
  // shopless fisher borrowing three hundred dollars for a juice bar. This is
  // also what makes "starve her shop of trade" a real counter and not a mood.
  if (!Object.keys(BIZ).some(b2 => bizOwner(b2) === rivalOwnerId())) return 0;
  return Math.max(0, creditLimit() - Math.max(0, o.credit || 0));
}
// EVERYTHING SHE COULD RAISE: the war chest, the till, her own pocket and what
// the bank would lend her. This is the number the offer is built from and the
// number the day report prints, so nothing about the offer is hidden.
function rivalRaise() { return Math.max(0, rival.fund || 0) + rivalPurse() + rivalCredit(); }
// SHE PUTS MONEY BY, out of her own till, on a night her shop settled clean and
// is carrying more than a working float. Nothing is minted: the money leaves
// the till it came from, which is why the war chest makes her shop leaner and
// why she raids it back the moment a rent is at risk (rivalRaidFund).
function bankRivalFund() {
  const shop = RIVAL_CFG.SHOP, o = OWNERS[rivalOwnerId()];
  if (!o || bizOwner(shop) !== rivalOwnerId() || forSale(shop)) return 0;
  if ((bizStrike[shop] || 0) > 0) return 0;                    // a missed rent is not a good month
  const spare = o.till - RIVAL_CFG.BANK_KEEP;
  if (spare <= 0) return 0;
  const put = Math.min(RIVAL_CFG.BANK_MAX, Math.floor(spare * RIVAL_CFG.BANK_FRAC));
  if (put <= 0) return 0;
  o.till -= put; rival.fund = (rival.fund || 0) + put;
  return put;
}
// ...and she raids it before she misses a rent. A war chest that shuts your own
// shop is not ambition, it is a bug - so this runs BEFORE her lease settles.
function rivalRaidFund(b) {
  if (b !== RIVAL_CFG.SHOP || !(rival.fund > 0)) return 0;
  const o = OWNERS[rivalOwnerId()];
  if (!o) return 0;
  const need = Math.ceil(BIZ[b].rent * 1.5) - o.till;
  if (need <= 0) return 0;
  const take = Math.min(rival.fund, need);
  rival.fund -= take; o.till += take;
  return take;
}
// what she holds back: enough to OPEN the shop she is buying in the morning
function rivalFloat() {
  return RIVAL_CFG.FLOAT_NIGHTS * BIZ[RIVAL_CFG.PRIZE].rent;
}
// war chest, then till, then her pocket, then the BANK. Nothing is minted
// anywhere: a drawn line is a debt she carries into every settlement after.
function payFromRival(amt) {
  const o = OWNERS[rivalOwnerId()], c = rivalCrab();
  let left = Math.max(0, Math.round(amt));
  { const d = Math.min(Math.max(0, rival.fund || 0), left); rival.fund -= d; left -= d; }
  if (o) { const d = Math.min(Math.max(0, o.till), left); o.till -= d; left -= d; }
  if (c) { const d = Math.min(Math.max(0, c.p.wallet), left); c.p.wallet -= d; left -= d; }
  if (o && left > 0) { const d = Math.min(rivalCredit(), left); o.credit = (o.credit || 0) + d; left -= d; }
  return Math.round(amt) - left;
}
function bizTakeAvg(b) {
  const h = bizTake[b] || [];
  return h.length ? h.reduce((s, v) => s + v, 0) / h.length : 0;
}
// how well a shop is ACTUALLY trading, 0..1, off the same three-day book the
// asking price already reads. Two nights of rent a day is a healthy shop.
function bizHealth(b) {
  return Math.max(0, Math.min(1, bizTakeAvg(b) / Math.max(1, BIZ[b].rent * 2)));
}
// THE PRICE OF A GOING CONCERN, and every term of it checkable on the card.
// askingPrice() is the succession layer's own pricer - lease + fixtures +
// goodwill - which is what a SHUTTERED shop fetches. A shop still taking money
// is worth that plus a premium, and the premium scales with how well it trades.
function goingConcern(b, extra) {
  const prem = RIVAL_CFG.PREMIUM * (0.5 + RIVAL_CFG.HEALTH * 2 * bizHealth(b)) + (extra || 0);
  return Math.max(BIZ[b].rent * 2, Math.round(askingPrice(b) * (1 + prem)));
}
function offerTerms(b, extra) {   // the same number, itemized for the card
  const avg = bizTakeAvg(b);
  return {
    lease: BIZ[b].rent * SALE_CFG.RENT_NIGHTS,
    fixtures: bizFixtures(b) * SALE_CFG.FIXTURE,
    goodwill: Math.round(avg * SALE_CFG.GOODWILL_DAYS),
    take: Math.round(avg),
    prem: Math.round((RIVAL_CFG.PREMIUM * (0.5 + RIVAL_CFG.HEALTH * 2 * bizHealth(b)) + (extra || 0)) * 100),
    price: goingConcern(b, extra),
  };
}
// WHAT SHE CAN PUT ON THE TABLE. She offers what the place is worth, or every
// penny she can raise while keeping her shops open - whichever is smaller. A
// lowball is a real outcome and the card shows both numbers, so refusing a
// lowball is easy and refusing a fair offer is a genuine decision. Refuse her
// and she saves; compete with her and the bar's goodwill (and so its price)
// comes down. Either way the next offer is a different number.
// WHAT SHE RECKONS IT IS WORTH: the going-concern price, smoothed. The three
// day book behind it swings twice over on a small shop (one dark trading day
// halves the goodwill), and a number that moves like that cannot be the basis
// of an offer, a headline or a decision. One field, one line, and it is the
// number every surface prints.
function rivalWorth() {
  const now = goingConcern(RIVAL_CFG.PRIZE, 0);
  return Math.round(rival.val > 0 ? rival.val : now);
}
function rivalOfferPrice() {
  const b = RIVAL_CFG.PRIZE;
  const worth = rivalWorth();
  const canRaise = Math.floor(rivalRaise() - rivalFloat());
  return { worth, price: Math.max(0, Math.min(worth, canRaise)) };
}
// HOW BADLY SHE WANTS IT = HOW MUCH OF IT SHE HAS SAVED. Derived, never
// accumulated, so there is no hidden counter anywhere: open her books and you
// can compute this number yourself.
function rivalIntent() {
  if (!prizeIsPlayers()) return 0;
  return Math.max(0, Math.min(RIVAL_CFG.CAP, rivalRaise() / Math.max(1, rivalWorth())));
}
function rivalEyeing(c) {
  return rivalOn() && prizeIsPlayers() && c === rivalCrab()
    && (rival.stage === "eyeing" || rival.stage === "offer" || rival.stage === "compete");
}
// ---- the offer card lives on the bar's own shopfront: the sign is the
// owner's office door, and this is the letter pushed under it. One geometry
// function feeds the draw and the hit-test, exactly like the FOR SALE chip.
// The two lines the management screen prints: what she wants and what it is
// worth on the top row, and HER OWN BOOKS on the row under it - the price on
// her board, her hours, her wage and her till. Every one of those is a lever
// the player holds too, which is what makes them worth printing.
function rivalManageLines() {
  if (!rivalOn() || !prizeIsPlayers() || rival.stage === "none" || rival.stage === "done")
    return [null, null];
  const who = rivalName(), shop = RIVAL_CFG.SHOP, prize = BIZ[RIVAL_CFG.PRIZE].short;
  // 40 characters of 3x5 is what fits left of the management card's DONE chip,
  // so the hours use the shift-label clock (8-21, not 8:00-21:00)
  const nums = "HER " + BIZ[shop].short + ": " + Math.round(bizPriceMul(shop) * 100) + "%  "
    + fmtHr(BIZ[shop].hours.open) + "-" + fmtHr(BIZ[shop].hours.close)
    + "  $" + bizWage(shop) + "/DAY  TILL $" + fmt(Math.round(ownerFunds(shop)));
  if (rivalOfferLive())
    return [who + " OFFERS $" + fmt(rival.offer.price) + " (WORTH $"
      + fmt(rival.offer.worth) + ") - TAP THE SIGN", nums];
  if (rival.stage === "compete")
    return [who + " IS COMPETING FOR THE " + prize, nums];
  return [who + " IS EYEING THE " + prize + " - CAN RAISE $" + fmt(rivalRaise()) + " OF $"
    + fmt(rivalWorth()), nums];
}
function rivalChipRects(b) {
  const cx = Math.round((BIZ[b].x0 + BIZ[b].x1) / 2);
  return { take: { x: cx - 46, y: 133, w: 44, h: 11 },
           no:   { x: cx + 4,  y: 133, w: 34, h: 11 } };
}
function rivalOfferLive() { return rival.stage === "offer" && !!rival.offer && prizeIsPlayers(); }
function makeRivalOffer() {
  const b = RIVAL_CFG.PRIZE, q = rivalOfferPrice();
  rival.offer = { price: q.price, worth: q.worth, day };
  rival.stage = "offer"; rival.offerDay = day; rival.lastOffer = day;
  const who = rivalName();
  toast = { text: who + " OFFERS $" + fmt(q.price) + " FOR THE " + BIZ[b].short + " - TAP ITS SIGN", t: 9 };
  today.rival.push(who + " OFFERS $" + fmt(q.price) + " FOR THE " + BIZ[b].short
    + (q.price < q.worth ? " (WORTH $" + fmt(q.worth) + ")" : ""));
  const c = rivalCrab();
  if (c) crabLog(c, "money", "OFFERED $" + q.price + " FOR THE " + BIZ[b].short, 0);
  popText("OFFER $" + fmt(q.price), (BIZ[b].x0 + BIZ[b].x1) / 2 - 24, 100, [255, 216, 96]);
  if (typeof sfx !== "undefined" && sfx.ding) sfx.ding();
  if (window._stats) (window._stats.rivalOffers = window._stats.rivalOffers || [])
    .push({ day, price: q.price, worth: q.worth });
}
// ACCEPT: take the money, lose the bar. The whole price moves from her pots to
// yours - a sale between two owners is a TRANSFER, not the lease re-letting
// that destroys half at the FOR SALE sign (there is a seller here, and the
// seller is you). The bar keeps trading: she owns it, she runs the same policy
// tables, and she posts for staff on the same job board.
function acceptRivalOffer() {
  if (!rivalOfferLive()) return false;
  const b = RIVAL_CFG.PRIZE, price = rival.offer.price;
  if (rivalPurse() < price) {
    toast = { text: rivalName() + " CAN'T COVER $" + fmt(price) + " TONIGHT", t: 5 };
    return false;
  }
  payFromRival(price);
  // straight into the till, but NOT through earn(): a business sale is not
  // trading revenue, so it must not inflate `lifetime` or the income-rate chip
  coins += price;
  popText("+$" + fmt(price), (BIZ[b].x0 + BIZ[b].x1) / 2 - 12, 110, [255, 230, 120]);
  if (typeof sfx !== "undefined" && sfx.coin) sfx.coin();
  handOverBiz(b, rivalOwnerId());
  rival.stage = "done"; rival.offer = null; rival.intent = 0;
  const who = rivalName();
  toast = { text: "SOLD - " + who + " OWNS THE " + BIZ[b].name + " NOW. +$" + fmt(price), t: 9 };
  today.rival.push("SOLD THE " + BIZ[b].short + " TO " + who + " FOR $" + fmt(price));
  const c = rivalCrab();
  if (c) { crabLog(c, "money", "BOUGHT THE " + BIZ[b].name + " FOR $" + price, 0);
    crabLog(c, "life", "TWO SHOPS ON THE PROMENADE NOW", 0); }
  if (typeof sfx !== "undefined" && sfx.buy) sfx.buy();
  if (window._stats) (window._stats.rivalSales = window._stats.rivalSales || [])
    .push({ day, biz: b, price, to: who });
  save();
  return true;
}
// hand a player-owned business to a peer owner: the lease moves, the people do
// not. Your crew are under contract to YOU, so they come back to your kitchen;
// anybody on the shop's own payroll goes back to the pier the way a closure
// sends them.
function handOverBiz(b, oid) {
  for (const k of allCrabs().slice()) {
    if (k.p.job !== b) continue;
    if (k.p.npc) { layOff(k); continue; }
    abortChef(k); abortErrand(k);
    k.duty = false; k.pendingOff = false; k.kstate = "idle"; k.carrying = null;
    k.dayState = "home"; k.cstate = "";
    k.p.job = "shack"; k.workBiz = "shack";
    crabLog(k, "work", "MOVED TO THE CRAB SHACK - THE " + BIZ[b].short + " WAS SOLD", 0);
    today.moved.push(k.p.name + " BACK TO THE SHACK");
  }
  BIZ[b].owner = oid;
  BIZ[b].autoLabor = true;    // a peer owner runs the same policy tables SUDSY does
  bizStrike[b] = 0;
  delete market[b];
  popText("UNDER NEW OWNERSHIP", (BIZ[b].x0 + BIZ[b].x1) / 2 - 30, 100, [140, 255, 160]);
}
// REFUSE: nothing punitive happens. She competes, on levers the player also
// holds, and she comes back with a number later.
function refuseRivalOffer(why) {
  if (rival.stage !== "offer") return false;
  const b = RIVAL_CFG.PRIZE, who = rivalName();
  rival.refused++;
  // `step` is NOT reset: escalation is cumulative across refusals, so a second
  // no lands on the next lever rather than starting the argument over
  rival.stage = "compete"; rival.stepDay = day; rival.noDay = day;
  rival.offer = null;
  toast = { text: who + ": THEN I'LL TAKE THE TRADE INSTEAD", t: 8 };
  today.rival.push((why === "lapsed" ? "NO ANSWER FOR " + who + " - " : "TURNED " + who + " DOWN - ")
    + "SHE'LL COMPETE");
  const c = rivalCrab();
  if (c) crabLog(c, "life", "TURNED DOWN OVER THE " + BIZ[b].short + " - COMPETING", 0);
  if (typeof sfx !== "undefined" && sfx.angry) sfx.angry();
  if (window._stats) (window._stats.rivalRefusals = window._stats.rivalRefusals || [])
    .push({ day, why: why || "refused" });
  return true;
}
function tapRivalChip(which) {
  if (!rivalOfferLive()) return false;
  return which === "take" ? acceptRivalOffer() : refuseRivalOffer("refused");
}
// ---- COMPETITION. Three levers, all of them settings that already exist and
// that the player holds too, escalating one move at a time with a named toast
// on every single one. There is no hidden term anywhere: what she does to her
// board, her hours and her wage is exactly what the player can do back.
const RIVAL_MOVES = ["price", "hours", "wage"];
function runRivalCompete() {
  const shop = RIVAL_CFG.SHOP, o = OWNERS[rivalOwnerId()], who = rivalName();
  if (!o || bizOwner(shop) !== rivalOwnerId() || forSale(shop)) return false;
  if (day - rival.stepDay < RIVAL_CFG.STEP_DAYS) return false;
  rival.stepDay = day;
  // A PRICE WAR COSTS THE ONE WHO STARTED IT. When her own till cannot carry
  // the fight she walks the last move BACK, in public - which is the player's
  // counter working, and the reason this can never become a death sentence.
  // THE TRIGGER IS A MISSED RENT, not a thin till. A shower house settles most
  // nights on $0-45 whatever it is doing, so reading the till instantly would
  // make a rival that never fights - which is not "survivable", it is inert.
  // What actually says the war is costing her more than it is worth is the
  // strike counter the succession layer already keeps.
  if ((bizStrike[shop] || 0) > 0) {
    let line = null;
    if (bizPriceMul(shop) < 1) {
      setBizPrice(shop, bizPriceMul(shop) + RIVAL_CFG.CUT);
      line = "PUTS THE " + BIZ[shop].short + " PRICE BACK TO " + Math.round(bizPriceMul(shop) * 100) + "%";
    } else if (BIZ[shop].hours.close > 20 * 60) {
      setBizHours(shop, BIZ[shop].hours.open, BIZ[shop].hours.close - 60);
      line = "SHUTS THE " + BIZ[shop].short + " AT " + fmtClock(BIZ[shop].hours.close);
    } else if (bizWage(shop) > WAGE_STD) {
      setBizWage(shop, bizWage(shop) - 1);
      line = "TRIMS THE " + BIZ[shop].short + " WAGE TO $" + bizWage(shop);
    }
    if (line) {
      toast = { text: who + " " + line + " - SHE CAN'T CARRY THE FIGHT", t: 7 };
      today.rival.push(who + " " + line + " (BACKING OFF)");
      if (window._stats) (window._stats.rivalMoves = window._stats.rivalMoves || [])
        .push({ day, move: "retreat", line });
    }
    return !!line;
  }
  // ...otherwise one lever, in order, cycling
  for (let tries = 0; tries < RIVAL_MOVES.length; tries++) {
    const move = RIVAL_MOVES[rival.step % RIVAL_MOVES.length];
    rival.step++;
    let line = null;
    if (move === "price" && bizPriceMul(shop) - RIVAL_CFG.CUT >= PRICE_MIN - 1e-9) {
      setBizPrice(shop, bizPriceMul(shop) - RIVAL_CFG.CUT);
      line = "CUTS THE " + BIZ[shop].short + " PRICE TO " + Math.round(bizPriceMul(shop) * 100) + "%"
        + " (" + BIZ[shop].recipes.map(r0 => "$" + menuPrice(shop, r0)).join("/") + ")";
    } else if (move === "hours") {
      const h = BIZ[shop].hours;
      if (h.close + 60 <= HOURS_MAX) {
        setBizHours(shop, h.open, h.close + 60);
        line = "KEEPS THE " + BIZ[shop].short + " OPEN TO " + fmtClock(BIZ[shop].hours.close);
      } else if (h.open - 30 >= HOURS_MIN) {
        setBizHours(shop, h.open - 30, h.close);
        line = "OPENS THE " + BIZ[shop].short + " AT " + fmtClock(BIZ[shop].hours.open);
      }
    } else if (move === "wage") {
      const best = Math.max(WAGE_STD, townWage(shop), bizWage(shop));
      const want = Math.min(WAGE_MAX, Math.max(bizWage(shop) + 1, best + RIVAL_CFG.WAGE_OVER));
      const staffN = Math.max(1, allCrabs().filter(k => k.p.job === shop && !k.p.owner).length);
      // ...and only the WAGE costs cash on the night: a price cut and a longer
      // day are paid for out of margin, which is what the retreat rule reads
      if (want > bizWage(shop) && o.till + (rival.fund || 0) >= want * staffN) {
        setBizWage(shop, want);
        for (const j of jobBoard) if (j.biz === shop) j.wage = bizWage(shop);
        line = "POSTS $" + bizWage(shop) + " AT THE " + BIZ[shop].short;
      }
    }
    if (!line) continue;
    toast = { text: who + " " + line, t: 8 };
    today.rival.push(who + " " + line);
    const c = rivalCrab();
    if (c) crabLog(c, "money", line.slice(0, 39), 0);
    if (window._stats) (window._stats.rivalMoves = window._stats.rivalMoves || [])
      .push({ day, move, line, price: bizPriceMul(shop), wage: bizWage(shop), close: BIZ[shop].hours.close });
    return true;
  }
  return false;
}
// ---- ONE PASS AT SETTLEMENT. Reads her books, moves the stage, and never
// does two things in a night.
function runRivalAmbition() {
  rivalOwnerCheck();   // the lease may have changed hands since last night
  if (!rivalOn()) return;
  const shop = RIVAL_CFG.SHOP, prize = RIVAL_CFG.PRIZE, o = OWNERS[rivalOwnerId()];
  if (rival.stage === "done") return;                      // she has it; there is nothing left to want
  if (!prizeIsPlayers()) {                                 // it is not yours to sell any more
    if (rival.stage !== "none") { rival.stage = "none"; rival.offer = null; }
    rival.intent = 0;
    return;
  }
  // SHE READS HER OWN BOOKS AND NOTHING ELSE: a good night puts money by, a
  // lean one puts nothing by, and what she has saved against what the bar is
  // worth IS how badly she wants it. Squeeze her takings and the whole thing
  // stalls - which is the player's cheapest counter, and it costs nothing.
  const hers = bizOwner(shop) === rivalOwnerId() && !forSale(shop);
  // SHE PUTS MONEY BY ONLY WHEN THERE IS SOMETHING TO SAVE FOR. This gate is
  // load-bearing and it is measured: a till is not an inert number - the job
  // board reads it to post a vacancy, the wage policy reads it before a raise,
  // and `ownerFunds` reads it to buy the next bar of soap. Banking from day one
  // moved SUDSY's till by $39 on day 2 of a town with no juice bar in it, which
  // tripped the frozen day-2 fingerprint and two other pins for a perfectly
  // good reason. Gated here, a town that never opens a juice bar is untouched.
  // (The war chest is not load-bearing either way: in the 8-seed organic probe
  // the whole arc fires with the fund reading 0 throughout, because the LINE OF
  // CREDIT is what a small operator actually buys a shop with. What the chest
  // adds is a rival whose shop is doing WELL getting there faster - which is
  // exactly the handle the player's own price stepper has on her.)
  bankRivalFund();
  const gc = goingConcern(prize, 0);
  rival.val = rival.val > 0 ? Math.round(rival.val * (1 - RIVAL_CFG.SMOOTH) + gc * RIVAL_CFG.SMOOTH) : gc;
  rival.intent = rivalIntent();
  const who = rivalName();
  // a live offer runs out of road
  if (rival.stage === "offer") {
    if (day - rival.offerDay >= RIVAL_CFG.ANSWER_DAYS) refuseRivalOffer("lapsed");
    else today.rival.push(who + " IS WAITING ON YOUR ANSWER - $" + fmt(rival.offer.price));
    return;
  }
  if (rival.stage === "compete") {
    if (!hers) {   // she lost her own shop: the fight is over and she says so
      rival.stage = "none"; rival.intent = 0;
      today.rival.push(who + " HAS OTHER PROBLEMS - THE " + BIZ[shop].short + " CAME FIRST");
      return;
    }
    // ...and she only comes back with a number once she has actually spent
    // REOFFER days competing. Without this the re-offer lands on the same
    // settlement as her first move and she never gets to make one.
    if (rival.intent >= RIVAL_CFG.OFFER && day - (rival.noDay || 0) >= RIVAL_CFG.REOFFER
        && day - rival.lastOffer >= RIVAL_CFG.REOFFER) {
      const q = rivalOfferPrice();
      if (q.price >= q.worth * RIVAL_CFG.LOWBALL) { makeRivalOffer(); return; }
    }
    if (!runRivalCompete()) today.rival.push(who + " IS COMPETING WITH THE " + BIZ[prize].short);
    return;
  }
  // ...and the two quiet stages
  if (rival.intent >= RIVAL_CFG.OFFER && rival.stage === "eyeing"
      && day - (rival.eyeDay || day) >= RIVAL_CFG.WARN_DAYS) {
    const q = rivalOfferPrice();
    if (q.price >= q.worth * RIVAL_CFG.LOWBALL) { makeRivalOffer(); return; }
    // she wants it and cannot raise a number worth naming: that IS the warning,
    // and it is written down, with the arithmetic, every night she is short
    if (rival.stage !== "eyeing") startEyeing();
    today.rival.push(who + " CAN RAISE $" + fmt(rivalRaise()) + " FOR THE " + BIZ[prize].short
      + " - $" + fmt(q.worth));
    return;
  }
  if (rival.intent >= (rival.stage === "eyeing" ? RIVAL_CFG.DROP : RIVAL_CFG.EYE)) {
    if (rival.stage !== "eyeing") startEyeing();
    else today.rival.push(who + " CAN RAISE $" + fmt(rivalRaise()) + " - THE "
      + BIZ[prize].short + " IS WORTH $" + fmt(rivalWorth()));
    return;
  }
  if (rival.stage === "eyeing") {
    rival.stage = "none";
    today.rival.push(who + " HAS STOPPED LOOKING AT THE " + BIZ[prize].short);
  }
}
function startEyeing() {
  const prize = RIVAL_CFG.PRIZE, who = rivalName();
  rival.stage = "eyeing"; rival.eyeDay = day;
  toast = { text: who + " HAS BEEN EYEING YOUR " + BIZ[prize].short + " ALL WEEK", t: 8 };
  today.rival.push(who + " IS EYEING THE " + BIZ[prize].short);
  const c = rivalCrab();
  if (c) crabLog(c, "life", "STOOD LOOKING AT THE " + BIZ[prize].name, 0);
  if (window._stats) (window._stats.rivalEyed = window._stats.rivalEyed || []).push({ day });
}
// FIRST IN THE QUEUE. If the bar ever FAILS, the crab who has been trying to
// buy it for a fortnight does not wait her turn behind the deepest pocket in
// town - that is the antagonism paying off. She still pays the market price
// out of her own money, and she still has to be able to afford it.
function rivalFirstRefusal(b) {
  if (b !== RIVAL_CFG.PRIZE || rival.stage === "none" || !rivalOn()) return false;
  const c = rivalCrab();
  if (!c || c.p.sick) return false;
  const price = salePrice(b), o = OWNERS[rivalOwnerId()];
  if (rivalPurse() < price + SALE_CFG.RESERVE) return false;
  // the buy path pays out of a crab's POCKET, so she draws the till down into
  // it first - the owner draw the housing ladder already uses. Nothing minted.
  const need = price + SALE_CFG.RESERVE - c.p.wallet;
  if (need > 0 && o) { const d = Math.min(Math.max(0, o.till), need); o.till -= d; c.p.wallet += d; }
  if (!buyBusiness(b, c)) return false;
  rival.stage = "done"; rival.offer = null; rival.intent = 0;
  today.rival.push(rivalName() + " WAS FIRST IN THE QUEUE FOR THE " + BIZ[b].short);
  crabLog(c, "life", "GOT THE " + BIZ[b].short + " IN THE END", 0);
  if (window._stats) (window._stats.rivalFirstRefusal = window._stats.rivalFirstRefusal || [])
    .push({ day, biz: b, price });
  return true;
}
// ---- ...AND THE OTHER WAY ROUND. The ownership layer is symmetric, so the
// player can buy a shop that is NOT for sale, off an owner who is still
// running it. Her ask is PUBLIC - painted on her own shopfront, itemized on
// the job board - and it MOVES with her books: the going-concern price plus a
// hold-out premium that scales with how much she fancies her chances. There is
// no haggling minigame because the number IS the negotiation: out-compete her,
// watch the ask fall, and buy her out. Two taps, because a shop is not a
// misclick.
let askArm = null, askArmT = 0;
function rivalAsk(b) {
  const oid = bizOwner(b);
  const hold = oid === rivalOwnerId()
    ? RIVAL_CFG.HOLD * Math.max(rival.intent, rival.stage === "compete" ? 1 : 0) : 0;
  // ...and nobody sells the only shop they have at scrap-plus-a-bit
  const only = oid && oid !== "player"
    && Object.keys(BIZ).filter(b2 => bizOwner(b2) === oid).length === 1 ? RIVAL_CFG.ONLY : 0;
  return goingConcern(b, hold + only);
}
function askChipRect(b) {
  // the shoulder under the sign - the exact slot a player-owned shop's MANAGE
  // chip occupies, because it is the same thing: the door into that owner's
  // office. Clear of the CLOSED placard (118) and the stall tops.
  const w = 54, z = BIZ[b];
  return { x: Math.round((z.x0 + z.x1) / 2 - w / 2), y: 104, w, h: 11 };
}
function peerBizList() {   // shops somebody else is running - the ones you can make an offer on
  // ...MINUS the ones whose owner is a willing seller and already wears an
  // OFFER chip. Both chips live in the shoulder under the sign (y104/y105) and
  // both are hit-tested here, so a shop that qualified for both drew two
  // labels on top of each other and gave the tap to the DEARER of the two
  // prices - which is exactly what REEF's hotel did from the day it shipped.
  // One shop, one price, one chip: a willing seller's own number wins.
  return Object.keys(BIZ).filter(b => bizUnlocked(b) && !forSale(b)
    && bizOwner(b) && bizOwner(b) !== "player" && !canOffer(b));
}
function tapAskChip(b) {
  if (!peerBizList().includes(b)) return false;
  const price = rivalAsk(b), oid = bizOwner(b), o = OWNERS[oid];
  if (coins < price) {
    toast = { text: ownerName(oid) + " WANTS $" + fmt(price) + " FOR " + BIZ[b].name, t: 6 };
    if (typeof sfx !== "undefined" && sfx.angry) sfx.angry();
    return false;
  }
  if (askArm !== b) {
    askArm = b; askArmT = 3.5;
    toast = { text: "TAP AGAIN TO BUY " + BIZ[b].name + " FOR $" + fmt(price), t: 4 };
    if (typeof sfx !== "undefined" && sfx.ding) sfx.ding();
    return false;
  }
  askArm = null; askArmT = 0;
  coins -= price;   // ...and out of it the same way, off the trading books
  popText("-$" + fmt(price), (BIZ[b].x0 + BIZ[b].x1) / 2 - 12, 110, [255, 120, 120]);
  if (o) o.till += price;     // the seller is PAID: a transfer between two owners, nothing minted
  // her people are hers, not yours: the owner-operator steps down (to another
  // counter if she holds one) and the payroll goes back to the pier
  for (const k of allCrabs().slice()) {
    if (k.p.job !== b && k.p.employer !== oid) continue;
    if (k.p.owner === oid) stepDownOwner(k, oid, b);
    else layOff(k);
  }
  BIZ[b].owner = "player"; BIZ[b].bought = true; BIZ[b].autoLabor = false;
  bizStrike[b] = 0; delete market[b];
  jobBoard = jobBoard.filter(j => j.biz !== b);
  toast = { text: "YOU BOUGHT " + BIZ[b].name + " FROM " + ownerName(oid) + " FOR $" + fmt(price), t: 9 };
  today.moved.push("BOUGHT " + BIZ[b].short + " FROM " + ownerName(oid) + " ($" + fmt(price) + ")");
  popText("UNDER NEW OWNERSHIP", (BIZ[b].x0 + BIZ[b].x1) / 2 - 30, 100, [140, 255, 160]);
  if (b === RIVAL_CFG.SHOP) {   // she has no balance sheet to be ambitious with any more
    rival.stage = "none"; rival.intent = 0; rival.offer = null;
    today.rival.push(rivalName() + " HAS NO SHOP TO BUILD ON NOW");
  }
  if (typeof sfx !== "undefined" && sfx.buy) sfx.buy();
  if (window._stats) (window._stats.playerBuyouts = window._stats.playerBuyouts || [])
    .push({ day, biz: b, price, from: ownerName(oid) });
  save();
  return true;
}
// An owner-operator who loses ONE lease is not out of business if they hold
// another: they go and stand behind that counter instead. Clearing p.owner
// unconditionally would ORPHAN the other shop at the next settlement (the
// death seam reads exactly that field) - a latent fault from the day a peer
// owner could hold two leases, and reachable now that one routinely does.
function stepDownOwner(k, oid, exceptBiz) {
  const other = Object.keys(BIZ).find(b2 => b2 !== exceptBiz && bizOwner(b2) === oid);
  if (!other) { layOff(k); return; }
  abortChef(k); abortErrand(k);
  k.duty = false; k.pendingOff = false; k.kstate = "idle"; k.carrying = null;
  k.dayState = "home"; k.cstate = "";
  k.p.job = other; k.workBiz = other; k.p.shift = "D"; k.p.employer = null;
  k.fishSpot = null;
  crabLog(k, "work", "BACK BEHIND THE " + BIZ[other].short + " COUNTER", 0);
}

// ------------------------------------------------- THE HOTELIER: BRASS TAKES THE DRIFTWOOD
// REEF opened the Driftwood and REEF is a SOFT TOUCH - an old crab with no
// heir, and `soft` on his owner row says so. That made the hotel a shop the
// player BUYS rather than somebody the player has to contend with, and the
// owner asked for the other thing ("a new crab needs to own the hotel...
// probably competition").
//
// SO SOMEBODY ELSE BUYS IT FIRST. BRASS gets off the morning bus with the
// price of the place in her bag and takes it off him through the player's own
// OFFER chip - the same listing, at the same price, in the same transaction
// the player would have made - and then runs seven rooms like a business
// instead of like a hobby. Nothing about her is scripted: every move she makes
// is one of the settings the management screen exposes, made for a reason
// that is printed in the day report on the night she makes it.
//
// WHY SHE IS COMPETITION, in the two places it costs the player money:
//   THE PURSE   a visitor's wallet is minted on the boat and spent down in
//               this town. `visPick` holds the BOARD price of a bed back
//               before it will buy anything else (roomReserve -> roomPrice),
//               so every step BRASS puts on her own board is a step off the
//               town's supper money. Zero sum, exactly like the promenade.
//   THE LABOUR  she pays over the odds when her rooms go unturned, and
//               `townWage()` is a MEAN over the shops that are hiring. Her
//               raise moves every crab's goingRate, which moves the crew's
//               payRatio, which is the grievance ladder that already existed.
//               She poaches by moving the market, not by a special case.
// Both levers cost HER too - the wage leaves her till on the night, a dear
// room empties beds - so when the Driftwood misses a lease payment she walks
// the last move back in public, on the rivalry's own retreat rule.
//
// AND SHE IS NOT A SOFT TOUCH. The moment she signs, the OFFER chip on the
// hotel's sign (REEF's fair price) is replaced by the ASK chip every peer
// shop wears - `goingConcern` plus the hold-out premium for the only shop she
// has - in the same slot on the same sign. What she costs the player is a
// number painted on the shopfront from her first night.
const HOTELIER_CFG = {
  SHOP: "hotel",         // the lease she comes for, and the only one she runs
  NAME: "BRASS",
  MIN_DAY: 5,            // nobody buys a seafront hotel in a town they landed in yesterday
  WORTH: 60,             // ...and she only comes for a house that is TAKING money: the
                         // three-day book the asking price already reads. A town whose
                         // hotel never gets going never meets her, which is most of why
                         // the do-nothing baseline is untouched by her (measured: PLAN).
  WARN_DAYS: 2,          // SHE IS HEARD OF BEFORE SHE IS SEEN. The day report names the
                         // interest, with the price on it, for this many settlements
                         // before she lands - the rivalry's rule that the warning is
                         // guaranteed by the CLOCK and not by money crossing a line.
  BANKROLL: 800,         // what she brings. A fixed number, not "whatever it costs": a
                         // hotel trading well enough is genuinely out of her reach, and
                         // the report says so rather than quietly inventing the money.
  FULL: 0.70,            // rooms LET tonight against rooms on the hook: a full house...
  SLACK: 0.30,           // ...and beds going begging. A wide dead band between them so
                         // the board cannot ping-pong - the same disjoint-regimes shape
                         // HOURS_POLICY and WAGE_POLICY converge on, for the same reason.
                         // It self-limits either way: a dearer room sells fewer beds.
  REMIND: 5,             // ...and if she cannot afford the place, how often the report
                         // says so. A standing fact is not news every night.
  STEP_DAYS: 2,          // one move every this many nights, the rivalry's own pacing: a
                         // board that moved every single settlement walked the full
                         // 1.00 -> 1.30 band inside a week and stopped being readable
  WAGE_OVER: 2,          // a wage push lands this far over the best rate in town
  TILL_FLOOR: 40,        // ...and only if the till can carry the night after it
};
// heard: the day the town first heard of her. day: the day she signed.
// id: her owner-registry key, which is how every surface finds her.
function newHotelier() { return { heard: 0, day: 0, id: null, moves: 0, moveDay: 0, missed: 0, nag: 0 }; }
let hotelier = newHotelier();
function loadHotelier(h) {
  hotelier = newHotelier();
  if (!h || typeof h !== "object") return;   // an old save never met her, and that IS the old world
  hotelier.heard = Math.max(0, Math.round(+h.heard || 0));
  hotelier.day = Math.max(0, Math.round(+h.day || 0));
  hotelier.moves = Math.max(0, Math.round(+h.moves || 0));
  hotelier.moveDay = Math.max(0, Math.round(+h.moveDay || 0));
  hotelier.missed = Math.max(0, Math.round(+h.missed || 0));
  hotelier.nag = Math.max(0, Math.round(+h.nag || 0));
  hotelier.id = typeof h.id === "string" && OWNERS[h.id] ? h.id : null;
  if (!hotelier.id) hotelier.day = 0;        // a half-written save cannot strand her
}
function hotelierOn() { return !window._noHotelier; }   // the measurement hatch (the game never sets it)
function hotelierCrab() {
  return hotelier.id ? allCrabs().find(k => k.p.owner === hotelier.id) || null : null;
}
// SHE IS THE HOTELIER ONLY WHILE SHE HOLDS THE LEASE. Buy her out, or watch
// the lease take her under, and everything below stops dead: there is nothing
// left in her the town cannot answer.
function hotelierRuns() {
  return !!(hotelier.id && bizOwner(HOTELIER_CFG.SHOP) === hotelier.id
    && !forSale(HOTELIER_CFG.SHOP) && hotelierCrab());
}
// The free lot nearest a door, or -1. This is the housing ladder's own rule
// (see the settlement pass: nobody rents the far end of town from their own
// job), asked at the moment she signs rather than at the next settlement - an
// owner-operator who spent her first day walking 1700px in from the shelter
// would leave the desk dark on the one day the town is watching her.
function freeLotFor(door) {
  const used = new Set(allCrabs().filter(k => !k.p.homeless).map(k => k.p.house));
  let free = -1, bestD = Infinity;
  for (let h = 0; h < HOUSE_XS.length; h++) {
    if (used.has(h)) continue;
    const d = Math.abs(HOUSE_XS[h] - door);
    if (d < bestD) { bestD = d; free = h; }
  }
  return free;
}
// WHAT SHE HAS TO FIND: the willing seller's own price, the reserve every
// buyer in this game keeps back, and the cost of getting off a cot. Derived
// from the same function the OFFER chip prints, so the number in the day
// report and the number on the shopfront can never disagree.
function hotelierCost() {
  return offerPrice(HOTELIER_CFG.SHOP) + SALE_CFG.RESERVE + MOVE_IN_COST + HOUSE_RENT;
}
// ...and the town she is interested in: a hotel with a willing seller behind
// the desk, still trading, taking real money over its last three nights.
function hotelierWants() {
  const b = HOTELIER_CFG.SHOP;
  return hotelierOn() && !hotelier.day && day >= HOTELIER_CFG.MIN_DAY
    && bizUnlocked(b) && canOffer(b) && bizTakeAvg(b) >= HOTELIER_CFG.WORTH;
}
function hotelierArrive() {
  const b = HOTELIER_CFG.SHOP, price = offerPrice(b);
  const keeper = allCrabs().find(k => k.p.owner === bizOwner(b));
  const sold = keeper ? keeper.p.name : "THE KEEPER";
  // she gets off the west-end bus like everybody else who moved to this town,
  // and drives the length of the promenade to the door she has just bought
  // A RED SHELL IN SUNGLASSES, and a BEACH BUGGY - which is not just money on
  // wheels. The lot next door to the hotel is usually free and she takes it,
  // but if it is not, the nearest free lot is the far side of town and an
  // owner-operator who walks it spends her whole ten-hour day on the road.
  // The buggy is what makes the bad case survivable. TIDY, like REEF: the
  // difference between them is not that she keeps a worse house.
  const p = { name: freeCrewName(HOTELIER_CFG.NAME), npc: true, fisher: false,
    trait: "tidy", mode: "buggy", acc: "shades", color: 0, shift: "D",
    homeless: true, house: null, wallet: HOTELIER_CFG.BANKROLL, job: "fishing",
    hunger: 0.15, dirt: 0.2, bored: 0.1, tired: 0.2 };
  const c = newCrab(p);
  c.x = BUS_STOPS[0]; c.y = 158;
  npcs.push(c);
  // the player's own buy-out path, from the other side of the counter. If it
  // refuses for any reason she was never here at all: a half-bought hotel is
  // worse than no hotelier.
  if (!buyOutOwner(b, c)) { npcs = npcs.filter(k => k !== c); return false; }
  hotelier.id = c.p.owner; hotelier.day = day;
  const lot = freeLotFor(BIZ[b].door);
  if (lot >= 0 && c.p.wallet >= MOVE_IN_COST + HOUSE_RENT) {
    c.p.wallet -= MOVE_IN_COST; c.p.house = lot; c.p.homeless = false;
    logHome(c, "MOVED INTO " + placeName(c.p) + " - $" + MOVE_IN_COST);
  }
  c.x = BIZ[b].door - 40;   // ...and she is behind the desk the same evening
  toast = { text: c.p.name + " HAS BOUGHT THE " + BIZ[b].name + " - $" + fmt(price), t: 9 };
  today.rival.push(c.p.name + " BOUGHT THE " + BIZ[b].short + " OFF " + sold + " - $" + fmt(price));
  crabLog(c, "life", "CAME TO TOWN AND BOUGHT THE " + BIZ[b].short, 0);
  crabLog(c, "money", "PAID $" + price + " FOR SEVEN ROOMS", 0);
  popText("UNDER NEW MANAGEMENT", (BIZ[b].x0 + BIZ[b].x1) / 2 - 34, 96, [255, 216, 96]);
  if (typeof sfx !== "undefined" && sfx.ding) sfx.ding();
  if (window._stats) window._stats.hotelier = { day, price, name: c.p.name, from: sold, moves: [] };
  return true;
}
// ---- HER POLICY IS HER PERSONALITY. One move a night, out of the settings
// the management screen exposes, each one announced by name with the signal
// that caused it. Read the day report for a week and you know exactly who she
// is: she prices the board off the beds she sold last night, and she pays
// whatever it takes to have them made up in the morning.
function runHotelierPolicy() {
  const b = HOTELIER_CFG.SHOP, o = OWNERS[hotelier.id], c = hotelierCrab();
  const rooms = BIZ[b].stalls || [];
  const lets = today.roomsLet || 0;          // beds actually sold today, counted at check-in
  const lost = today.roomsLost || 0;         // ...and beds lost to unmade linen, counted on the sand
  // ...and every line below is MEASURED against the day report's own card
  // (176px wide, drawn at x+6, so 164px) rather than counted in characters.
  // Suite-pinned, because a report line is the only place the town speaks.
  const say = (line, cat) => {
    toast = { text: c.p.name + " " + line, t: 7 };
    today.rival.push(c.p.name + " " + line);
    crabLog(c, cat || "money", line.slice(0, 39), 0);
    hotelier.moves++; hotelier.moveDay = day;
    if (window._stats && window._stats.hotelier)
      window._stats.hotelier.moves.push({ day, line, price: bizPriceMul(b), wage: bizWage(b) });
  };
  // THE RETREAT, and the trigger is a MISSED RENT rather than a thin till -
  // the rivalry measured that lesson and it holds here for the same reason. A
  // seven-room lease settles all over the place, so a till gate would make a
  // hotelier who never moves at all; what says her policy is costing her more
  // than it is worth is the strike counter the succession layer already keeps.
  // The wage goes first: it is the only one of the two that costs cash tonight.
  if ((bizStrike[b] || 0) > 0) {
    hotelier.missed++;
    if (bizWage(b) > WAGE_STD) {
      setBizWage(b, bizWage(b) - 1);
      for (const j of jobBoard) if (j.biz === b) j.wage = bizWage(b);
      say("CUTS THE WAGE TO $" + bizWage(b) + " - MISSED RENT", "life");
    } else if (bizPriceMul(b) > 1) {
      setBizPrice(b, bizPriceMul(b) - PRICE_STEP);
      say("DROPS THE ROOM TO $" + roomPrice() + " - MISSED RENT", "life");
    }
    return;
  }
  // ---- SHORT OF HANDS, and the signal is a guest asleep on the beach with a
  // bed standing unmade behind her. That is a sale her LAUNDRY cost her, not
  // her demand - so she answers it with money, over the best rate in town. It
  // is the same move the rivalry's wage lever makes and it lands in the same
  // place: townWage(), and every payslip in this town that is measured
  // against it, the player's crew included.
  if (day - hotelier.moveDay < HOTELIER_CFG.STEP_DAYS) {
    today.rival.push(c.p.name + ": " + lets + "/" + rooms.length + " BEDS AT $"
      + roomPrice() + ", $" + bizWage(b) + "/DAY");
    return;
  }
  const post = jobBoard.find(j => j.biz === b);
  const staff = allCrabs().filter(k => k.p.job === b && !k.p.owner);
  if (lost > 0 || (post && day - post.day >= 1)) {
    const best = Math.max(WAGE_STD, townWage(b), bizWage(b));
    const want = Math.min(WAGE_MAX, Math.max(bizWage(b) + 1, best + HOTELIER_CFG.WAGE_OVER));
    const n = Math.max(1, staff.length);
    if (want > bizWage(b) && o.till >= HOTELIER_CFG.TILL_FLOOR + want * n) {
      setBizWage(b, want);
      for (const j of jobBoard) if (j.biz === b) j.wage = bizWage(b);
      say("POSTS $" + bizWage(b)
        + (lost > 0 ? " - " + lost + " BEDS WENT UNMADE" : " - NOBODY ANSWERED"));
      return;
    }
  }
  // ---- THE BOARD MOVES WITH THE HOUSE, and that is the whole of her. Beds
  // sold is the only number she needs: a house that nearly filled says the
  // room is underpriced, beds going begging say it is dear. She never touches
  // anybody else's board - only her own, one step, on the player's own stepper.
  // ...and a day the desk never opened is NOT a day the room was too dear. Her
  // own rest day, a shift nobody covered, a shop that went dark on a missed
  // rent - all of them read as "nought beds sold" and none of them is a price
  // signal. The day book is the honest test: no takings, no reading.
  const traded = bizDayBook(b).take > 0;
  if (traded && lets >= HOTELIER_CFG.FULL * rooms.length
      && bizPriceMul(b) + PRICE_STEP <= PRICE_MAX + 1e-9) {
    setBizPrice(b, bizPriceMul(b) + PRICE_STEP);
    say("PUTS THE ROOM UP TO $" + roomPrice() + " - " + lets + "/" + rooms.length + " SOLD");
    return;
  }
  if (traded && lets <= HOTELIER_CFG.SLACK * rooms.length
      && bizPriceMul(b) - PRICE_STEP >= PRICE_MIN - 1e-9) {
    setBizPrice(b, bizPriceMul(b) - PRICE_STEP);
    say("DROPS THE ROOM TO $" + roomPrice() + " - "
      + (lets ? lets + "/" + rooms.length + " SOLD" : "NONE SOLD"));
    return;
  }
  // ...and a quiet night is still a line in the report, carrying the two
  // numbers that decide her next move. Nothing about her is ever hidden.
  // (The report prints the first TWO lines of today.rival and THE RIVALRY runs
  // first, so on the rare night both are talking, the rarer event - a peer
  // owner coming for the player's bar - keeps the room.)
  today.rival.push(c.p.name + ": " + lets + "/" + rooms.length + " BEDS AT $"
    + roomPrice() + ", $" + bizWage(b) + "/DAY");
}
// ---- ONE PASS AT SETTLEMENT, after the market has cleared: she is either on
// her way here, or she is running seven rooms.
function runHotelier() {
  if (!hotelierOn()) return;
  if (!hotelier.day) {
    if (!hotelierWants()) return;
    const b = HOTELIER_CFG.SHOP;
    if (hotelierCost() > HOTELIER_CFG.BANKROLL) {
      // priced out, and the town hears exactly why - but a standing fact is
      // not news every night the way a stage change is, so this one is on a
      // leash. A hotel doing well enough to be out of her reach can stay that
      // way for the rest of the run.
      if (day - hotelier.nag >= HOTELIER_CFG.REMIND) {
        hotelier.nag = day;
        today.rival.push("A BUYER CAN'T MEET THE " + BIZ[b].short + "'S $" + fmt(offerPrice(b)));
      }
      return;
    }
    if (!hotelier.heard) {
      hotelier.heard = day;
      toast = { text: "SOMEBODY HAS BEEN ASKING AFTER THE " + BIZ[b].name, t: 8 };
      today.rival.push("A BUYER WANTS THE " + BIZ[b].short + " - $" + fmt(offerPrice(b)));
      return;
    }
    today.rival.push("THE " + BIZ[b].short + " HAS A BUYER WAITING - $" + fmt(offerPrice(b)));
    if (day - hotelier.heard >= HOTELIER_CFG.WARN_DAYS) hotelierArrive();
    return;
  }
  if (!hotelierRuns()) return;   // she sold up, or the lease took her under
  runHotelierPolicy();
}

// ---------------------------------------------------------------- clock
const TS = 4;                     // game minutes per real second
let day = 1, tmin = 7 * 60;      // start day 1, 7:00
function clockStr() {
  const h = (tmin / 60) | 0, m = tmin % 60 | 0;
  return (h < 10 ? "0" : "") + h + ":" + (m < 10 ? "0" : "") + m;
}
// the town's fixed day rhythm (errand windows, the tourist season's outer
// bounds via anyBizOpenNow) - individual shops open/close inside it or past
// it on their own BIZ hours
function townOpen() { return tmin >= 8 * 60 && tmin < 20 * 60; }

// ---------------------------------------------------------------- week / days off
// A 7-day week derived from the day counter (day 1 = MON). Nothing new is
// persisted: the weekday - and everyone's weekly day off - derive from
// day + the live roster, so old saves pick the schedule up for free.
const WEEKDAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
const WEEKDAY_FULL = ["MONDAYS", "TUESDAYS", "WEDNESDAYS", "THURSDAYS",
  "FRIDAYS", "SATURDAYS", "SUNDAYS"];
function weekdayIdx(d) { return (d - 1) % 7; }
const OFF_WAKE = 9.5 * 60;   // a day off starts with a lie-in
// STAGGERED days off, not a town-wide Sunday: each business's workers are
// sorted by name and fanned across the week with a stride of 3 (coprime to
// 7), so no two coworkers share an off day until a shop has 8+ staff and no
// multi-worker shop ever goes fully dark from days off alone. Per-biz base
// weekdays keep the single-worker shops (SUDSY's showers, a one-crab
// arcade) closed on DIFFERENT days - and keep the whole town on deck for
// the brutal first two days of a new lease (nobody rests MON or TUE).
// THE REST-DAY TABLE, and it needs a row per business: a shop with no entry
// falls through to base 0, which is MONDAY - and day 1 is a Monday, so the
// whole point of the rule ("nobody rests MON/TUE") is lost for that shop on the
// one day a new town cannot afford it. Measured when the hotel landed without a
// row: REEF took day one off, the Driftwood was unstaffed from 07:00 to
// midnight, and EVERY overnighter off the first day's boats slept on the sand.
// (`juicebar` is still missing a row - a pre-existing fault of the same shape,
// left alone here because fixing it moves the measured juice-bar curves and
// this pass has enough numbers of its own. Flagged in PLAN.)
const OFF_BASE = { shack: 2, arcade: 4, showers: 6, fishing: 3, hotel: 5 };
let _offMap = {}, _needCover = {}, _offStamp = -1, _offN = "";
function refreshDaysOff() {
  // THE CACHE KEYS ON WHO WORKS WHERE, not on how many crabs there are. It
  // used to key on (time, headcount), and a business changing hands moves
  // people between rosters without moving the headcount much: when BRASS
  // bought the Driftwood, REEF and DRIFT went back to the pier and she took
  // the desk, and the map kept the old hotel roster. `dayOffIdx` then fell
  // through to its 0 default, so THE NEW OWNER NEVER GOT A DAY OFF - silently,
  // because a missing key reads as "Monday" rather than as an error. The
  // fingerprint is a dozen short strings; the sort it saves costs more.
  const sig = allCrabs().map(k => k.p.name + "|" + k.p.job).join(",");
  if (_offStamp === time && _offN === sig) return;
  _offStamp = time; _offN = sig; _offMap = {}; _needCover = {};
  const byBiz = {};
  for (const k of allCrabs()) (byBiz[k.p.job] = byBiz[k.p.job] || []).push(k);
  const wd = weekdayIdx(day);
  for (const b in byBiz) {
    const roster = byBiz[b].sort((a, c2) => a.p.name < c2.p.name ? -1 : 1);
    const base = OFF_BASE[b] != null ? OFF_BASE[b] : 0;
    // keyed name|job: a crew hire may legally share a townsfolk's name
    for (let i = 0; i < roster.length; i++) _offMap[roster[i].p.name + "|" + b] = (base + i * 3) % 7;
    if (b === "fishing") continue;   // the pier has no opening hours to cover
    // cover days: if a resting worker's shift has nobody else on it today,
    // the on-duty crew work a full-open double so the shop never goes
    // shift-dark from a day off
    const on = roster.filter(k => _offMap[k.p.name + "|" + b] !== wd);
    const off = roster.filter(k => _offMap[k.p.name + "|" + b] === wd);
    _needCover[b] = off.length > 0 && on.length > 0 &&
      off.some(o => !on.some(w2 => w2.p.shift === o.p.shift || w2.p.shift === "D"));
  }
}
function dayOffIdx(c) {
  refreshDaysOff();
  const v = _offMap[c.p.name + "|" + c.p.job];
  return v != null ? v : 0;
}
// "not working today" - the rota's weekday off, or a WALKOUT over pay (see
// walkoutToday). One predicate, so both reasons skip the commute, the duty and
// the wage together and nothing downstream needs a second rule.
function offToday(c) { return dayOffIdx(c) === weekdayIdx(day) || walkoutToday(c); }
function coveringToday(c) {
  refreshDaysOff();
  return c.p.shift !== "D" && !offToday(c) && !!_needCover[c.p.job];
}
// a crab's shift for TODAY: their own, or a full-open double shift on a day
// they cover for a resting coworker (M and E never overlap, so the covering
// crab IS the whole roster that day - shorter hours would just be dark hours).
// Shift windows DERIVE from the workplace's open hours - the least-invasive
// coupling: the SHIFTS table keeps the SHAPE (M = first half, E = second
// half, D = owner-operator open+30 to close-90, cover = the whole window)
// and the biz hours give it a frame. Under the default 8-20 hours these
// evaluate to exactly the old fixed SHIFTS. Fishing has no storefront, so
// pier shifts stay the fixed table.
//
// A WORKING DAY HAS A LENGTH. The hours sign says WHERE a shift sits; it does
// not say how long a crab works. Every derived window is capped at SHIFT_SPAN
// for its kind - exactly what that kind evaluates to under the town's default
// 8:00-20:00 day - and a window that outgrows its cap keeps its middle,
// centred on the middle of the trading day. So a trading day of 12h or less
// is BYTE-FOR-BYTE the old geometry (the cap never binds), while a shop open
// 6:00-24:00 still gets two six-hour shifts, 9-15 and 15-21: the shoulders
// are open but UNSTAFFED, and nobody walks into an unstaffed shop.
//
// This is the load-bearing half of the always-open fix. Wages scaling with
// hours (see hourlyRate) is the honest price of a longer shift, but it can
// never be the whole answer: a staffed hour is worth ~$25 of takings in this
// town and costs $3.83 of wage, so no plausible wage - and no fatigue model,
// measured with the crew PINNED at exhaustion for 30 days - makes buying
// hours off the hours sign a bad deal. Staffed hours have to be bought with
// CRABS (hire another one and it gets its own shift) or with OVERTIME (up to
// OT_SPAN, at OT_RATE, inside the open hours) - which is the emergency lever,
// priced and bounded, exactly as Matt asked.
// THE STANDARD WORKING DAY, for the crew's ordinary M/E shifts. Labour is
// bought by the hour against it (see hourlyRate / basePayToday) and a shift
// tires the crab by the same measure (the accrual in updateSchedule). 360 is
// what M and E evaluate to under the default 8-20 hours, so a default town is
// byte-for-byte the flat-wage game this replaced.
const STD_SHIFT = 6 * 60;
const SHIFT_SPAN = { M: STD_SHIFT, E: STD_SHIFT, D: 10 * 60, cover: 2 * STD_SHIFT };
function capWindow(start, end, cap, mid) {
  if (end - start <= cap) return { start, end };   // inert on any normal trading day
  const s = Math.max(start, Math.min(end - cap, mid - Math.round(cap / 2 / 30) * 30));
  return { start: s, end: s + cap };
}
function bizShiftWindow(b, kind) {
  const h = BIZ[b].hours;
  const mid = h.open + Math.round((h.close - h.open) / 2 / 30) * 30;
  const raw = kind === "M" ? { start: h.open, end: mid }
    : kind === "E" ? { start: mid, end: h.close }
    : kind === "D" ? { start: h.open + 30, end: h.close - 90 }
    : { start: h.open, end: h.close };   // covering double: the full window
  const w = capWindow(raw.start, raw.end, SHIFT_SPAN[kind] || SHIFT_SPAN.cover, mid);
  w.label = fmtHr(w.start) + "-" + fmtHr(w.end);
  return w;
}
function baseShift(c) { return c.p.job === "fishing" ? SHIFTS[c.p.shift] : bizShiftWindow(c.p.job, c.p.shift); }
// the shift they're CONTRACTED to work today: their own, or the cover double.
// effShift (below) adds overtime on top - it's "the hours they actually work".
function dutyShift(c) { return coveringToday(c) ? bizShiftWindow(c.p.job, "cover") : baseShift(c); }

// ================================================================ LABOR POLICY
// Sick days, overtime, and the rules a manager - player or CPU - applies to
// both. Everything is DERIVED from persona state plus per-business policy: no
// parallel scheduler, and only three new persona fields (sickPol, ot, restT).
//
// ---- SICK DAYS -------------------------------------------------------------
// A sick crab stays home, UNPAID, and cares for themselves. That was already
// the behavior; what's new is that it is a POLICY, so it can be taken away:
//   GRANT   (default = the old behavior) the crab rests and earns nothing
//   REQUIRE the crab drags themselves in at half speed, earns the full wage,
//           and coughs on the coworkers. (The contagion term in the settlement
//           epidemiology has always keyed on standing at work beside a sick
//           colleague - until sick days were a policy, no crab could ever be
//           there to trigger it.)
// Per-business default plus a per-crab override (dossier row / SCHEDULE tab).
// Self-employed fishers and owner-operators always grant: no boss, no policy.
const SICK_POLS = ["grant", "require"];
const SICK_POL_LABEL = { grant: "GRANT SICK DAYS", require: "REQUIRE WORK" };
function sickPolFor(c) {
  if (c.p.sickPol && SICK_POLS.includes(c.p.sickPol)) return c.p.sickPol;
  if (c.p.owner || c.p.job === "fishing" || !BIZ[c.p.job]) return "grant";
  return BIZ[c.p.job].sickPol || "grant";
}
// THE predicate: the commute gate, both wage loops, the BILL forecast, the
// coverage math and the placard all read it.
function onSickDay(c) { return !!c.p.sick && sickPolFor(c) === "grant"; }
// far enough into an illness that tonight's settlement can take them. One
// predicate, three surfaces: the status line, the follow card's tag and the
// dossier's HEALTH row - the town SEES it coming.
function gravelyIll(c) { return !!c.p.sick && (c.p.sick.days || 0) >= deathArmsAt(careLane(c)) - 1; }

// ---- THE CARED SEAM (closed 2026-08-18) ------------------------------------
// Recovery's care check read only hunger and dirt - it predated thirst and
// tiredness, so a crab who spent the whole day in bed got nothing for it and
// "take a sick day" was theater. Convalescence is now a graded ladder, keyed
// to the same housing quality the sleep ladder uses (own bed 0.5/h, cot 0.25/h):
//
//   lane       cure  die   what it takes
//   NEGLECT    0.12  0.25  fails fed-and-clean                    (unchanged)
//   CARED      0.40  0.08  hunger < 0.5 AND dirt < 0.66           (unchanged:
//                          the old bar still pays exactly what it always did)
//   COT REST   0.48  0.06  CARED + thirst < 0.5 + a day's rest on a cot
//   BED REST   0.55  0.04  CARED + thirst < 0.5 + a day's rest in their OWN
//                          bed (house or boat)
// Nobody's odds got worse - rest is a NEW, better lane, reachable only by
// actually staying home on a granted sick day. That is what makes it real.
const REST_HOURS = 9;   // daylight game-hours at home, ill and excused, to count as a day's rest
const CARE_LANES = {
  neglect: { cure: 0.12, die: 0.25, label: "NEGLECTED" },
  cared:   { cure: 0.40, die: 0.08, label: "CARED FOR" },
  cot:     { cure: 0.48, die: 0.06, label: "COT REST" },
  bed:     { cure: 0.55, die: 0.04, label: "BED REST" },
};
function careLane(k) {
  if ((k.p.hunger || 0) >= 0.5 || (k.p.dirt || 0) >= 0.66) return "neglect";
  if ((k.p.restT || 0) < REST_HOURS || (k.p.thirst || 0) >= 0.5 || !onSickDay(k)) return "cared";
  return k.p.homeless ? "cot" : "bed";
}

// ---- OVERTIME --------------------------------------------------------------
// A standing per-crab request (p.ot) that lengthens TODAY'S shift by up to
// OT_SPAN minutes, paid at OT_RATE x the crab's normal hourly rate on top of
// the flat daily wage, at a proportional needs cost.
//
// SHOP-HOURS COUPLING (the choice, documented): overtime lives strictly INSIDE
// the shop's open hours. Hours gate tourist admission, errand dispatch and the
// CLOSED sign, so an hour past close is an hour with the doors shut - premium
// pay for nothing. The extension takes whatever room is left at the END of the
// shift first, then borrows from the START: an E-shift crab whose shift already
// ends at close comes in EARLY instead, which is exactly the shape that plugs a
// missing morning. Want more OT room? Extend the shop's hours - one tab away.
// A crab already covering a full-open double has no room at all, by
// construction - you cannot work overtime on a day you work open to close.
const OT_SPAN = 120;      // up to two extra hours
const OT_RATE = 1.5;      // premium multiplier on the hourly rate
const OT_FATIGUE = 1.5;   // tiredness accrues at 1.5x the proportional share (the health cost)
function otEligible(c) {
  return !!c.p.ot && !c.p.sick && !offToday(c)
    && c.p.job !== "fishing" && !!BIZ[c.p.job] && !c.p.owner;   // wage-earners only: fishers sell fish, owners draw from the till
}
function otWindow(c) {
  if (!otEligible(c)) return null;
  const sh = dutyShift(c), h = BIZ[c.p.job].hours;
  const after = Math.min(OT_SPAN, Math.max(0, h.close - sh.end));
  const before = Math.min(OT_SPAN - after, Math.max(0, sh.start - h.open));
  if (after + before <= 0) return null;
  return { start: sh.start - before, end: sh.end + after, mins: after + before };
}
function otMinutes(c) { const w = otWindow(c); return w ? w.mins : 0; }
// the hours they actually work today = contracted shift + overtime
function effShift(c) {
  const w = otWindow(c);
  if (!w) return dutyShift(c);
  return { start: w.start, end: w.end, label: fmtHr(w.start) + "-" + fmtHr(w.end), ot: w.mins };
}
// on the clock, right now, in overtime? (the powerup marker + the OT tags read
// this, so they clear the instant OT ends - nothing to reset)
function onOvertimeNow(c) {
  if (!c.duty || c.dayState !== "working") return false;
  const w = otWindow(c);
  if (!w) return false;
  const sh = dutyShift(c);
  return tmin < sh.start || tmin >= sh.end;
}
// what THIS crab is paid for a standard day: their private deal, else their
// shop's rate. One function, and every pay path in the game already runs
// through it - basePayToday, contractPay, hourlyRate and otPremium all read
// it, so the settlement, the BILL chip, the MENU column and the bankruptcy
// forecaster total per-crab rates without any of them learning a new rule.
function wageRate(c) {
  const deal = privateWage(c);
  return deal != null ? deal : bizWage(c.p.job);
}
// ---- THE HOURLY RATE (one clock for all labor) -----------------------------
// CRAB_WAGE / NPC_WAGE are DAY RATES FOR A STANDARD DAY OF THAT SHIFT - the
// span the shift has under the town's default 8:00-20:00 hours (SHIFT_SPAN: a
// six-hour M or E, a ten-hour owner-operator D, a twelve-hour cover double).
// Everything is then priced off the hourly rate they imply, so ordinary hours
// and overtime hours are quoted in the same currency:
//   ordinary  wage x (today's contracted span / that standard)   basePayToday
//   overtime  hourlyRate x OT_RATE x minutes worked              otPremium
// Labour is bought by the hour: shorten the trading day and the shifts inside
// it shorten, and the wage bill shortens with them. Lengthen it and the shift
// CAP (bizShiftWindow) holds a working day to a working day - you buy extra
// staffed hours with another crab or with overtime, never off the hours sign.
// Every one of these evaluates to the pre-hourly flat numbers on a default
// trading day, by construction.
function ownStdSpan(c) {   // the crab's own contracted standard, never the cover double
  if (c.p.job === "fishing") { const s = SHIFTS[c.p.shift]; return Math.max(60, s.end - s.start); }
  return SHIFT_SPAN[c.p.shift] || SHIFT_SPAN.cover;
}
function dutyStdSpan(c) { return coveringToday(c) ? SHIFT_SPAN.cover : ownStdSpan(c); }
// what today's shift COSTS the crab, in standard days of their own shift. Pay
// and fatigue part company on exactly one day: a full-open cover double is one
// contract (SHIFT_SPAN.cover, one wage - the rota generosity that has always
// filled a coworker's day off for free) but it is TWO shifts of work, and the
// end-of-shift accrual says so.
function workLoad(c) { const s = dutyShift(c); return Math.max(0, s.end - s.start) / ownStdSpan(c); }
function hourlyRate(c) { return wageRate(c) / ownStdSpan(c); }
// today's contracted hours as a share of a standard day of that shift: 1.0 on
// any trading day long enough to hold it, less when the shop's hours squeeze it.
function shiftLoad(c, sh) {
  const s = sh || dutyShift(c);
  return Math.max(0, s.end - s.start) / (sh ? ownStdSpan(c) : dutyStdSpan(c));
}
// the flat day, priced by the hours actually contracted (callers handle the
// day-off and sick-day skips)
function basePayToday(c) { return wageRate(c) * shiftLoad(c); }
// the crab's OWN contracted day, ignoring today's cover double - what the
// bankruptcy forecaster bills as steady state, on the same reasoning it
// already bills through day-off skips: covers are episodic, and noise over a
// ten-settlement horizon.
function contractPay(c) { return wageRate(c) * shiftLoad(c, baseShift(c)); }
// OT minutes at OT_RATE x that same hourly rate. The rate comes from the
// crab's OWN standard day, never the cover double - a cover day is a separate,
// pre-existing generosity and must not dilute the premium - and from the
// STANDARD span rather than today's, so a squeezed shift cannot quietly make
// overtime cheaper than straight time. Byte-for-byte the old formula on a
// default trading day.
function otPremium(c, mins) { return hourlyRate(c) * OT_RATE * mins; }
function otPayToday(c) { return otPremium(c, c.otMin || 0); }        // truthful: minutes actually worked
// tonight's forecast: scheduled while they're still on OT, else what they worked
function otPayForecast(c) { return otEligible(c) ? otPremium(c, otMinutes(c)) : otPayToday(c); }

// ---- WHAT THE REST OF TOWN PAYS -------------------------------------------
// A wage is only a lever if a crab can tell whether it is a good one, so every
// employed crab measures theirs against three offers it could actually take:
//
//   THE WATER  a day's casting is about five fish at today's market price -
//              the same rule the job board already uses to decide whether a
//              fisher signs. It FLOATS ($2-7 a fish), so the outside option is
//              a real, moving number rather than a constant. Discounted by
//              PIER_TOUGH because a paycheck is a paycheck: a crab in work
//              only envies the rail when it is properly beating them.
//   NEXT DOOR  the mean rate of every OTHER employing shop in town (mean, not
//              max, so one rich shop cannot drag the whole town's demands up).
//   THE CRAB   the best-paid other staffer AT THEIR OWN SHOP. This is the
//     BESIDE   sharp one, and it is the one Matt asked for: being the
//     THEM     worst-paid crab in the room stings more than a low number does.
//
// ...and under all three, THE TOWN'S STANDARD DAY (WAGE_STD x KEEP), which is
// the one number a boss cannot argue down. MEASURED, and it is the reason it
// exists: without it a player who cut EVERY shop to $20 moved the going rate
// down with them - the player IS most of the town's payroll - and the cut was
// free. It measured 2 of 16 do-nothing towns surviving 30 days against the
// pillar's 0, i.e. "cut the wage on day one" would have been the obviously
// correct opening move and the whole lever a fake. A crab knows what a day's
// work is worth in this town: it is the number on Mr. Pincherton's lease.
// Inert by construction - at WAGE_STD the ratio is exactly 1.0.
//
// At the shipped defaults all three sit at or below WAGE_STD (the pier tops
// out at 7 x 5 x 0.6 = 21 against a wage of 23), so nobody is aggrieved in a
// default town and the whole layer is inert until somebody moves a stepper.
const WAGE_CFG = {
  FISH_DAY: 5,        // fish landed in a day on the rail (the job board's own figure)
  PIER_TOUGH: 0.6,    // a steady wage is worth this much of a lucky day's fishing
  KEEP: 1.0,          // the town's standard day, as a share of WAGE_STD: the floor no boss can argue down
  PEER_TOL: 0.85,     // how much of the best crab's deal the rest expect: a premium under ~1/0.85 goes unremarked
  GRACE: 2,           // nights on a new job before anybody starts counting
  GAIN: 1.0,          // grievance per night, per full unit of shortfall
  CALM: 0.34,         // grievance shed per night when the pay is fair (3 good nights clears a bad week)
  MAKEUP: 3,          // ...and much faster when the fix is generous: a real raise buys peace overnight
  CAP: 1.3,           // grievance never banks more than a third of a night past LEAVE, so a fixed wage is FELT
  GRUMBLE: 0.35,      // a quip, a mood, a line on the dossier
  WARN: 0.70,         // a named toast and a day-report line: they are asking around
  LEAVE: 1.0,         // NPC staff walk; crew refuse the shift
  POACH: 0.5,         // grievance at which a better-paying vacancy turns a head
};
function pierDay() { return (trade.price || FISH_START) * WAGE_CFG.FISH_DAY; }
function pierClaim() { return pierDay() * WAGE_CFG.PIER_TOUGH; }
function townWage(exceptBiz) {   // the mean rate of the other shops hiring in town
  const rates = Object.keys(BIZ).filter(b => b !== exceptBiz && bizUnlocked(b) && bizOwner(b)).map(bizWage);
  return rates.length ? rates.reduce((s, r) => s + r, 0) / rates.length : WAGE_STD;
}
// The best-paid OTHER crab on the same roster, discounted by PEER_TOL. The
// discount is what makes a private deal a usable instrument rather than a
// mutiny: a star can be carried at a premium of about a sixth before the rest
// of the room starts counting. Measured - at full weight a single crab on
// $35 in a $23 shack made EVERY colleague demand $35, and the growth matrix
// went to a median eviction of day 7. A big premium still costs you.
function peerWage(c) {
  let best = 0;
  for (const k of allCrabs()) if (k !== c && k.p.job === c.p.job && !k.p.owner) best = Math.max(best, wageRate(k));
  return best * WAGE_CFG.PEER_TOL;
}
// the number a crab thinks it is worth tonight
function goingRate(c) {
  return Math.max(WAGE_STD * WAGE_CFG.KEEP, pierClaim(), townWage(c.p.job), peerWage(c));
}
function payRatio(c) { const g = goingRate(c); return g > 0 ? wageRate(c) / g : 1; }
// wage-earners only: fishers sell fish and owners draw from their own till,
// so neither has a boss to be aggrieved at.
function onPayroll(c) { return !c.p.owner && c.p.job !== "fishing" && !!BIZ[c.p.job] && !!bizOwner(c.p.job); }
function wageGripe(c) { return onPayroll(c) ? (c.p.gripe || 0) : 0; }
function wageMoodLabel(c, short) {
  const g = wageGripe(c);
  return g >= WAGE_CFG.LEAVE ? (short ? "WALKING!" : "WALKING OUT")
    : g >= WAGE_CFG.WARN ? (short ? "ASKING" : "ASKING AROUND")
    : g >= WAGE_CFG.GRUMBLE ? (short ? "GRUMBLES" : "UNDERPAID")
    : payRatio(c) > 1.08 ? (short ? "HAPPY" : "WELL PAID") : "";
}
// A CREW CRAB DOES NOT RESIGN, IT WALKS OUT FOR THE DAY. The player's crew are
// under contract - the same reasoning that keeps them out of the pool of crabs
// who can buy a failed business - so an aggrieved crew crab does not vanish
// into the townsfolk. They refuse tomorrow's shift instead: unpaid, no
// commute, no duty, and repeated every night the pay stays wrong. That costs
// the player the one currency the hours pass proved is expensive (a staffed
// hour), it is decided at settlement so there is a whole evening to fix it,
// and it is fully reversible - raise the wage and they clock back on. Routing
// it through offToday is deliberate: a walkout IS an unauthorised day off, so
// the wage skip, the BILL dip, the placard and the errands-all-day behaviour
// all come for free, while `coveringToday` (which reads the ROTA, not this)
// correctly refuses to hand the shop a free cover double for it.
// (walkoutToday lives with the away-day predicates below - both reasons, one rule)
function bizRestingToday(b) {   // nobody on the roster works today (rest day, sick day, or a walk-out)

  const staff = allCrabs().filter(k => k.p.job === b);
  return staff.length > 0 && staff.every(k => awayToday(k) || onSickDay(k));
}
// What the placard says. A rota day, a bout of flu and a crab who simply did
// not turn up are three different stories, and the shopfront tells them apart.
// NOTE the job board is untouched by all three: its emergency HELP WANTED gate
// counts HEADCOUNT on the roster, not who clocked in, so a walk-out can never
// masquerade as a vacancy.
function restingLabel(b) {
  const staff = allCrabs().filter(k => k.p.job === b);
  if (staff.some(k => walkoutToday(k)) && staff.every(k => walkoutToday(k) || offToday(k)))
    return "NOBODY CAME IN";

  return staff.some(k => onSickDay(k)) && staff.every(k => onSickDay(k) || offToday(k))
    && staff.some(k => !offToday(k)) ? "OUT SICK" : "DAY OFF";
}

// ---- AUTO-MANAGE -----------------------------------------------------------
// Built on the exact pattern SUDSY's hours policy uses: a small state machine
// read once per settlement, AT MOST ONE MOVE PER DAY, a cooldown day after a
// move, and a named toast for every move so the player can watch the manager
// think. Peer owners run it by default; the player can delegate with the
// AUTO-MANAGE toggle on the SCHEDULE tab (default OFF - you're the manager).
//
//   rule        move                       fires when
//   REST        sickPol -> grant           a staffer is ill under a REQUIRE
//                                          policy: send them home
//   OT OFF      p.ot = false               a crab on OT is over the tiredness
//                                          budget, sick, or no longer needed
//   OT ON       p.ot = true                tomorrow leaves a shift uncovered
//                                          AND a rested candidate exists
//
// CONVERGENCE. OT ON needs (gap tomorrow AND tired < OT_ON_TIRED); OT OFF needs
// (tired >= OT_OFF_TIRED) OR (no gap). The tiredness triggers are a HYSTERESIS
// BAND (0.55 / 0.75), never a knife edge, and overtime itself pushes tiredness
// UP at OT_FATIGUE - so every ON move weakens its own trigger. On the coverage
// axis the two regimes are disjoint by construction. With one move a day, a
// cooldown after each, and a roster-sized cap on how many crabs can be on OT,
// the machine settles into a duty cycle instead of thrashing (suite-proved
// over 21 days).
const LABOR_CFG = { OT_ON_TIRED: 0.55, OT_OFF_TIRED: 0.75, OT_ON_HUNGER: 0.5 };
let laborPolicyState = {};   // biz -> { cd } (persisted)
// does tomorrow leave a shift with nobody on it? Days off already promote a
// coworker to a full-open double (revenue-neutral, free), so the honest gap is
// SICKNESS - an excused crab's window simply goes dark. That is the hole
// overtime is for, and it is why the OT extension borrows from the START when
// there is no room at the end: an E crab coming in early plugs a lost morning.
function coverGapTomorrow(b) {
  const roster = allCrabs().filter(k => k.p.job === b && !k.p.owner);
  if (roster.length < 2) return null;   // a one-crab shop honestly closes - that's the placard, not an OT problem
  const wd = weekdayIdx(day + 1);
  const out = roster.filter(k => dayOffIdx(k) === wd || onSickDay(k));
  const on = roster.filter(k => !out.includes(k));
  if (!on.length || !out.length) return null;
  const hole = out.find(o => !on.some(w => w.p.shift === o.p.shift || w.p.shift === "D"));
  return hole || null;
}
function runLaborPolicy(b) {
  if (!BIZ[b] || !BIZ[b].autoLabor || window._noLaborPolicy) return;
  if (b === "fishing" || forSale(b)) return;   // nobody manages a shuttered shop
  const st = laborPolicyState[b] = laborPolicyState[b] || { cd: 0 };
  if (st.cd > 0) { st.cd--; return; }
  const roster = allCrabs().filter(k => k.p.job === b);
  const who = bizOwner(b) === "player" ? "THE ROTA" : OWNERS[bizOwner(b)].name;
  const move = (line) => {
    st.cd = 1;
    toast = { text: line, t: 6 };
    today.moved.push(line);
    if (window._stats) (window._stats.laborMoves = window._stats.laborMoves || [])
      .push({ day, biz: b, line });
  };
  // 1. REST: nobody works a shift ill if the manager can help it
  const forced = roster.find(k => k.p.sick && sickPolFor(k) === "require");
  if (forced) {
    forced.p.sickPol = "grant";
    return move(who + " SENDS " + forced.p.name + " HOME TO REST");
  }
  // 2. OT OFF: over budget, ill, or the gap has closed
  const gap = coverGapTomorrow(b);
  const stop = roster.find(k => k.p.ot &&
    ((k.p.tired || 0) >= LABOR_CFG.OT_OFF_TIRED || k.p.sick || !gap));
  if (stop) {
    stop.p.ot = false;
    const why = (stop.p.tired || 0) >= LABOR_CFG.OT_OFF_TIRED || stop.p.sick
      ? " OFF OVERTIME - THEY'RE SPENT" : " OFF OVERTIME - COVERED AGAIN";
    return move(who + " TAKES " + stop.p.name + why);
  }
  // 3. OT ON: a real gap tomorrow and a crab healthy enough to fill it
  if (gap) {
    const cand = roster.filter(k => !k.p.ot && k !== gap && otEligibleTomorrow(k)
      && (k.p.tired || 0) < LABOR_CFG.OT_ON_TIRED && (k.p.hunger || 0) < LABOR_CFG.OT_ON_HUNGER)
      .sort((a, c2) => (a.p.tired || 0) - (c2.p.tired || 0))[0];
    if (cand) {
      cand.p.ot = true;
      return move(who + " ASKS " + cand.p.name + " TO WORK OVERTIME");
    }
  }
}
// the eligibility test without today's transient state (tomorrow's roster)
function otEligibleTomorrow(c) {
  return !c.p.sick && c.p.job !== "fishing" && !!BIZ[c.p.job] && !c.p.owner
    && dayOffIdx(c) !== weekdayIdx(day + 1);
}

// ---- WAGE RELATIONS --------------------------------------------------------
// Read once per settlement, right after the night's wages are actually paid,
// so every crab is reacting to the money that just did (or didn't) land in
// their wallet. THREE THINGS HAPPEN HERE AND NOTHING ELSE IN THE GAME MOVES
// PAY: grievance accrues, the town says so out loud, and only then does
// anybody act. There is never a silent snap - a crab grumbles, then asks
// around, then goes, with at least GRACE + 3 nights between a wage cut and
// anybody's feet.
//
// A CRAB WHO IS PAID ABOVE THE GOING RATE CANNOT BE POACHED, by construction:
// grievance is the only thing that turns a head, and a crab on the best deal
// in the room has a payRatio >= 1 and sheds grievance every night.
function poachTarget(c) {
  // a vacancy somewhere that pays this crab strictly more than they get now.
  // Peer shops only: an NPC on the PLAYER's payroll would be a new class of
  // crab (the player buys labour with the SHOP's hire, not the job board), and
  // that is a bigger change than a wage setting should smuggle in.
  const mine = wageRate(c);
  let best = null;
  for (const b of Object.keys(BIZ)) {
    if (b === c.p.job || !bizUnlocked(b) || forSale(b)) continue;
    const oid = bizOwner(b);
    if (!oid || oid === "player") continue;
    const o = OWNERS[oid];
    if (!o || o.gone || (o.darkT || 0) > 0) continue;
    if (allCrabs().filter(k => k.p.job === b).length >= 2) continue;   // no room on the roster
    const w = bizWage(b);
    if (w <= mine || (best && w <= bizWage(best))) continue;
    if (o.till < w * 2) continue;                                      // they have to be able to pay it
    best = b;
  }
  return best;
}
function quitOverPay(c, why) {
  const to = poachTarget(c), from = c.p.job;
  c.p.gripe = 0; c.p.wageJob = null;
  noteWageLoss(from);   // the boss they left remembers, and their policy answers it
  if (to) {
    const oid = bizOwner(to);
    abortErrand(c); abortChef(c);
    c.duty = false; c.pendingOff = false; c.kstate = "idle"; c.carrying = null;
    c.dayState = "home"; c.cstate = "";
    c.p.job = to; c.p.employer = oid; c.workBiz = to; c.p.fisher = false;
    delete c.p.wage; delete c.p.wageOwner;   // a new boss, a new rate
    toast = { text: c.p.name + " LEFT FOR " + BIZ[to].name + " - $" + bizWage(to) + " BEATS $" + Math.round(wageRate(c)), t: 8 };
    today.moved.push(c.p.name + " POACHED BY " + BIZ[to].short + " OVER PAY");   // DIARY HOOK: poached
  } else {
    layOff(c);
    toast = { text: c.p.name + " QUIT OVER THE PAY - BACK TO THE PIER", t: 8 };
    today.moved.push(c.p.name + " QUIT OVER PAY - BACK TO THE PIER");   // DIARY HOOK: quit over pay
  }
  if (typeof sfx !== "undefined" && sfx.angry) sfx.angry();
  if (window._stats) (window._stats.wageQuits = window._stats.wageQuits || [])
    .push({ day, name: c.p.name, to: to || "fishing", why: why || "pay" });
}
function runWageRelations() {
  if (window._noWageRelations) return;
  const leavers = [];
  for (const c of allCrabs()) {
    // a private deal is a deal with a BOSS: it lapses the moment somebody else
    // signs the cheque, and it says so rather than quietly evaporating
    if (c.p.wage != null && c.p.wageOwner !== bizOwner(c.p.job)) {
      delete c.p.wage; delete c.p.wageOwner;
      today.moved.push(c.p.name + " IS BACK ON THE SHOP RATE - $" + bizWage(c.p.job));   // DIARY HOOK: deal lapsed
    }
    if (!onPayroll(c)) { c.p.gripe = 0; c.p.wageJob = null; continue; }
    if (c.p.wageJob !== c.p.job) {   // a new job restarts the clock: nobody resents a boss they met yesterday
      c.p.wageJob = c.p.job; c.p.wageDay = day; c.p.gripe = 0; continue;
    }
    if (day - (c.p.wageDay || 0) < WAGE_CFG.GRACE) continue;
    const r = payRatio(c), was = c.p.gripe || 0, rate = Math.round(wageRate(c));
    // fair pay sheds grievance; a GENEROUS fix sheds it fast, so a player who
    // puts it right sees the crab back on the clock the next morning rather
    // than sulking through a week they already paid for
    c.p.gripe = Math.max(0, Math.min(WAGE_CFG.CAP, r < 1 ? was + (1 - r) * WAGE_CFG.GAIN
      : was - WAGE_CFG.CALM - (r - 1) * WAGE_CFG.MAKEUP));
    const g = c.p.gripe;
    // ---- the warnings, in order, each fired once on the way up
    if (was < WAGE_CFG.GRUMBLE && g >= WAGE_CFG.GRUMBLE) {
      c.quip = { text: "$" + rate + "? THE PIER PAYS BETTER", t: 6 };
      today.moved.push(c.p.name + " IS GRUMBLING ABOUT $" + rate);   // DIARY HOOK: first grumble
    } else if (was < WAGE_CFG.WARN && g >= WAGE_CFG.WARN) {
      toast = { text: c.p.name + " IS ASKING AROUND - $" + rate + " ISN'T ENOUGH", t: 8 };
      today.moved.push(c.p.name + " IS ASKING AROUND ABOUT PAY");   // DIARY HOOK: second warning
      popText("ASKING AROUND", c.x - 14, FLOOR_Y - 34, [255, 190, 90]);
    }
    // ---- and only then, feet
    if (g >= WAGE_CFG.LEAVE) {
      if (c.p.npc) { leavers.push(c); continue; }
      // crew: tomorrow's shift is refused, and the refusal repeats until the
      // pay is right. Announced tonight, so there is a whole evening to fix it.
      if (c.p.walkout !== day + 1) {
        c.p.walkout = day + 1; c.p.walkoutWhy = "pay";
        toast = { text: c.p.name + " WON'T WORK TOMORROW AT $" + rate, t: 8 };
        today.moved.push(c.p.name + " REFUSES TOMORROW'S SHIFT OVER $" + rate);   // DIARY HOOK: walkout
        if (typeof sfx !== "undefined" && sfx.angry) sfx.angry();
        if (window._stats) (window._stats.walkouts = window._stats.walkouts || [])
          .push({ day: day + 1, name: c.p.name, rate, why: "pay" });
      }
    } else if (c.p.walkout != null && g < WAGE_CFG.GRUMBLE) {
      delete c.p.walkout;   // fixed: back on the clock, no lingering grudge state
    } else if (g >= WAGE_CFG.POACH && c.p.npc) {
      const to = poachTarget(c);
      if (to) leavers.push(c);   // somebody better is hiring and they've had enough to listen
    }
  }
  for (const c of leavers) quitOverPay(c);
}

// ---- CPU OWNERS RUN THE SAME LEVER -----------------------------------------
// Built on the HOURS_POLICY pattern, table-driven, one move per settlement, a
// cooldown day after each, a named toast every time. Deliberately SHOP-LEVEL:
// a peer owner sets ONE rate for their shop and never negotiates per crab.
// That is more machinery than the town needs, and the player having the finer
// instrument is a fair asymmetry - the same shape as the player being the only
// one who can give right-click orders.
//
//   RAISE  +$1  a post they cannot fill, or a staffer asking around, or they
//               lost somebody over pay in the last LOSS_MEMORY days
//   TRIM   -$1  fully staffed, nobody aggrieved, and paying more than TRIM_OVER
//               times what the rest of the market asks
//
// CONVERGENCE, by the same argument the hours policy uses: the two regimes are
// DISJOINT with a dead band between them. RAISE needs somebody's grievance (or
// an empty post) and every raise cuts that grievance; TRIM needs zero
// grievance AND a rate above going x TRIM_OVER, and every trim walks the rate
// toward that ceiling and stops at it. Between goingRate and goingRate x 1.12
// nothing fires at all, so the rate cannot ping-pong across a knife edge.
const WAGE_POLICY = {
  showers: { postDays: 1, trimOver: 1.12, tillFloor: 40, lossMemory: 3 },
  juicebar: { postDays: 1, trimOver: 1.12, tillFloor: 40, lossMemory: 3 },   // same reason as HOURS_POLICY
};
let wagePolicyState = {};   // biz -> { cd, lost }  (persisted)
function noteWageLoss(b) {  // somebody walked: the owner remembers for a few days
  const st = wagePolicyState[b] = wagePolicyState[b] || { cd: 0, lost: 0 };
  st.lost = day;
}
function runWagePolicy(b) {
  const cfg = WAGE_POLICY[b];
  if (!cfg || window._noWagePolicy || forSale(b)) return;
  const oid = bizOwner(b);
  if (!oid || oid === "player") return;
  const o = OWNERS[oid];
  if (!o || o.gone) return;
  const st = wagePolicyState[b] = wagePolicyState[b] || { cd: 0, lost: 0 };
  if (st.cd > 0) { st.cd--; return; }
  const rate = bizWage(b);
  const staff = allCrabs().filter(k => k.p.job === b && !k.p.owner);
  const post = jobBoard.find(j => j.biz === b);
  const stale = !!post && day - post.day >= cfg.postDays;          // advertised, nobody came
  const aggrieved = staff.some(k => wageGripe(k) >= WAGE_CFG.WARN);
  const lostRecently = st.lost && day - st.lost <= cfg.lossMemory;
  // the same market the STAFF read, floor included - an owner who trimmed
  // below the town's standard day would just be manufacturing her own
  // grievance, and the policy would fight itself
  const going = Math.max(WAGE_STD * WAGE_CFG.KEEP, pierClaim(), townWage(b));
  let line = null;
  if ((stale || aggrieved || lostRecently) && rate < WAGE_MAX
      && o.till >= cfg.tillFloor + (rate + 1) * Math.max(1, staff.length)) {
    setBizWage(b, rate + 1);
    line = "RAISES THE WAGE TO $" + bizWage(b);
  } else if (!post && staff.length >= 2 && !staff.some(k => wageGripe(k) > 0.1)
      && rate > going * cfg.trimOver && rate - 1 >= WAGE_MIN) {
    setBizWage(b, rate - 1);
    line = "TRIMS THE WAGE TO $" + bizWage(b);
  }
  if (!line) return;
  st.cd = 1;
  for (const j of jobBoard) if (j.biz === b) j.wage = bizWage(b);   // the posting is the advert: keep it honest
  const who = OWNERS[oid].name;
  toast = { text: who + " " + line, t: 7 };
  today.moved.push(who + " " + line);   // DIARY HOOK: a peer owner moved the wage
  if (window._stats) (window._stats.wageMoves = window._stats.wageMoves || [])
    .push({ day, biz: b, rate: bizWage(b), line });
}
function darkness() { // 0 = day, 1 = full night
  const t = tmin;
  if (t >= 5.5 * 60 && t < 7 * 60) return 1 - (t - 5.5 * 60) / 90;
  if (t >= 7 * 60 && t < 18.5 * 60) return 0;
  if (t >= 18.5 * 60 && t < 20.5 * 60) return (t - 18.5 * 60) / 120;
  return 1;
}

// ---------------------------------------------------------------- recipes
const INGREDIENT_COST = { fish_raw: 5, fruit: 3, token: 1, soap: 1, linen: 2 };
// ---- fish price discovery: the pier price FLOATS with scarcity. The $7
// world price is the natural ceiling (at $7 imports supply the gap, so the
// local price can never exceed it); a glut sags toward the $2 floor. The
// binary FISH_LOCAL(4)/FISH_IMPORT(7) switch is gone - trade.price is the
// one pier price, cleared once a day at midnight (settleFishMarket).
const FISH_FLOOR = 2, FISH_IMPORT = 7, FISH_START = 4;
// ---- T1 trade ledger: the town is a NODE. Imports tracked at fixed prices;
// only fish actually charges money today (it always did, via ingredientCost) -
// corn/water/power are tracked flows awaiting T2/T3. Bookkeeping ONLY.
const IMPORTS = {
  fish:  { name: "FISH",  unit: "EA",  price: FISH_IMPORT },
  corn:  { name: "CORN",  unit: "EA",  price: 3 },
  water: { name: "WATER", unit: "GAL", price: 1 },
  power: { name: "POWER", unit: "KWH", price: 2 },
  fruit: { name: "FRUIT", unit: "EA",  price: 2 },
};
let trade = { total: { fish: 0, corn: 0, water: 0, power: 0, fruit: 0 },
  day: { fish: 0, corn: 0, water: 0, power: 0, fruit: 0 }, spent: 0,
  landedDay: 0, landed: 0,   // pier production - NOT an import
  // the fish market: today's price, fish eaten today (demand), 3-day
  // supply/demand windows, days pinned at the ceiling, and the price series
  // (one entry per clearing, last 60) for the notice-board sparkline
  price: FISH_START, useDay: 0, landH: [], useH: [], ceilDays: 0, series: [] };
function tradeImport(kind, qty, dollars) {
  trade.total[kind] += qty; trade.day[kind] += qty;
  if (dollars) trade.spent += dollars;
}
// One clearing a day, at midnight: the last 3 days' landings vs the fish the
// town actually ate (local, shipped-in, and beach roasts alike - an import IS
// unmet local demand). $1 steps inside a deadband, so the price walks rather
// than sawtooths; hog-cycle damping is the window + the small step.
function settleFishMarket() {
  trade.landH.push(trade.landedDay); if (trade.landH.length > 3) trade.landH.shift();
  trade.useH.push(trade.useDay); if (trade.useH.length > 3) trade.useH.shift();
  const avg = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const S = avg(trade.landH), D = avg(trade.useH);
  if (D > S + 1) trade.price = Math.min(FISH_IMPORT, trade.price + 1);        // fish ran short: the pier price firms
  else if (S > D + 2) trade.price = Math.max(FISH_FLOOR, trade.price - 1);    // fish piled up: the pier price sags
  trade.ceilDays = trade.price >= FISH_IMPORT ? (trade.ceilDays || 0) + 1 : 0;
  trade.series.push(trade.price);
  if (trade.series.length > 60) trade.series.shift();
  trade.useDay = 0;
}
function ingredientCost(raw) {
  if (raw === "fish_raw") return townCatch > 0 ? trade.price : FISH_IMPORT;
  return INGREDIENT_COST[raw];
}
function consumeIngredient(raw, recipe) {
  if (raw === "fruit") tradeImport("fruit", 1);                   // every drink counts its fruit (T1 tracking)
  if (recipe && recipe.raw2 === "water") {
    tradeImport("water", 1); // the COOLER's gallon of fresh water
    if (window._stats) window._stats.coolersMade = (window._stats.coolersMade || 0) + 1;
  }
  if (raw !== "fish_raw") return;
  trade.useDay++;   // every fish eaten is the market's demand signal
  if (townCatch > 0) townCatch--;
  else tradeImport("fish", 1, FISH_IMPORT);   // shipped in - the $7 was already charged upstream
}
const ITEM_NAMES = {
  fish_raw: "FISH", fish_cut: "CUT FISH", fruit: "FRUIT",
  taco: "FISH TACO", juice: "JUICE", cooler: "COOLER", plate_fish: "GRILL FISH",
  token: "TOKENS", plush: "CLAW PLUSH", tickets: "TICKET RUN", gold_plush: "GOLD PLUSH",
  soap: "SOAP", suds: "DELUXE SOAK", shine: "QUICK RINSE", dirty_dishes: "DIRTY DISHES",
  linen: "FRESH LINEN", roomkey: "A ROOM FOR THE NIGHT",
};

const DRINKS = { juice: 1, cooler: 1 };   // recipes that quench THIRST wherever they're bought

// ---------------------------------------------------------------- upgrades
const UPS = {
  chef:  { name: "HIRE CRAB", base: 60, mult: 2.0, max: 6, lvl: 2 },
  grill: { name: "GRILL+",    base: 120, mult: 1.6, max: 2, lvl: 0 },
  board: { name: "BOARD+",    base: 90, mult: 1.6, max: 2, lvl: 0 },
  table: { name: "TABLE+",    base: 60, mult: 1.5, max: 4, lvl: 0 },   // 2 to start, 4 more to buy: $60/90/135/203
  juicebar: { name: "JUICE BAR", base: 400, mult: 1, max: 1, lvl: 0 },
  arcade:   { name: "ARCADE",   base: 650, mult: 1, max: 1, lvl: 0 },
  cadegear: { name: "CADE GEAR+", base: 180, mult: 1, max: 1, lvl: 0 },
};
for (const k in UPS) UPS[k].key = k;
function upCost(u) { return Math.ceil(u.base * Math.pow(u.mult, u.key === "chef" ? u.lvl - 2 : u.lvl)); }

function stationCap(bizKey, kind) {
  if (bizKey === "shack" && kind === "grill") return 1 + UPS.grill.lvl;
  if (bizKey === "shack" && kind === "board") return 1 + UPS.board.lvl;
  if (bizKey === "arcade" && (kind === "claw" || kind === "skee")) return 1 + UPS.cadegear.lvl;
  if (bizKey === "juicebar" && kind === "juicer") return 2;
  return 1;
}
// RETUNED AT THE MERGE. Busing is a real labour cost and it stacked on the
// needs-failure work: growth escape read 2/8 with the branch's own 1.5s /
// $9. The response is chaotic seed to seed (1.0/$9 -> 5/8, 1.2/$10 -> 8/8,
// 1.5/$12 -> 8/8), so these two were chosen where the curve sits: 4/8 at day
// 40 with baseline still 0/16. Only the feature's own knobs moved.
const BUS_SECS = 1.3;   // clearing a table is a swipe of the plates, not a shower-stall scrub
// The shack opens with TABLE_BASE tables; more are bought. TABLE_BASE stays
// at TWO through the busing pass, and that was measured rather than assumed:
// a third starting table was tried as compensation for the labour cost and
// bought back only one day of the do-nothing curve (median eviction 5 -> 6),
// because the crew, not the furniture, is what busing consumes. The
// compensation that worked is the raised TABLE_TIP - see the tips block.
const TABLE_BASE = 2;
function bizTables(key) {
  const t = BIZ[key].tables;
  if (!t) return null;
  return key === "shack" ? t.slice(0, TABLE_BASE + UPS.table.lvl) : t;
}
// (`spawnEvery` - the reputation-paced tourist timer - RETIRED 2026-08-19 with
//  the visitor pass. Word of mouth still drives foot traffic; it now drives the
//  SIZE OF THE FERRY'S BATCH rather than the gap between two anonymous
//  spawns. See ferryBatch().)


// ---------------------------------------------------------------- state
let coins = 0, lifetime = 0, time = 0;
let crabs = [], customers = [], floaters = [];
let toast = null, soundOn = true, ffMode = 0;   // 0=1x, 1=2x, 2=3x, 3=6x
// PAUSE. From the game's first outside playtest (2026-08-19): "Meanwhile
// theres a clock ticking. PAUSE ANYONE? I'm losing time here". He is right and
// it was a straight omission - the speed chips went 1x/2x/3x/6x and never
// stopped, so a new player reading the shop or a crab's dossier was being
// charged rent for the privilege. Pausing freezes the SIM (dt is zeroed) and
// nothing else: the frame still draws, every card still opens, and every chip
// still takes a click, because half the reason to pause is to go and read
// something. `last` is still advanced, so unpausing does not fast-forward the
// hours you spent paused.
let paused = false;
const FF_SPEED = [1, 2, 3, 6];
let camX = 1180, followIdx = -1, followNpc = null, followCust = null, tab = "crew";
// SELECTION is not the camera. Click a crab to select (and focus) them; pan
// away and the camera lets go but the selection - and its card, and the right-
// click orders that read it - stay with the crab you picked.
let sel = null;
let ffSleep = false, ffSleepDay = 0, ffChain = 0;   // the little sun: skip to morning
let lastRentDay = 0, gameOver = false, newConfirmT = 0;
// ---------------------------------------------------------------- the ferry
// THE ONE THING IN THIS GAME YOU CANNOT AFFORD. The ticket office has stood at
// the pier head as long as the town has; the boat it sells passage on lies up
// across the water and the fare on its board has never once been paid. Buying
// her ENDS the run - a third ending beside EVICTED and BANKRUPT, and the only
// one that is a win. gameOver is "the run is over"; bankrupt and won are its
// two flavours, so every existing stop-the-world guard applies for free.
//
// THE PRICE IS MEASURED, not felt (see PLAN). A do-nothing town is gone by day
// 13 with a few hundred dollars; the documented growth run (--buy chef,table,
// 40 days) ends its best seed on $3,637. A town that survives AND then trades
// well banks about $230 a night once the crew is deep and the room is full,
// and crosses $20,000 somewhere around day 105-130. So: absurd on day one,
// out of reach for anybody merely surviving, and a hundred good days away for
// a town that has genuinely mastered the economy.
const FERRY_PRICE = 20000;
const FERRY_X = 1806;        // the office, on the sand between the arcade lot and the pier
const FERRY_SIGN_X = 1148;   // the fingerpost on the promenade, where the player already looks
const FERRY_DAY = 3;         // she works the far shore on THURSDAYS (weekdayIdx)
let won = false, winT = 0, ferryArm = 0;
// snapshotted the moment she is bought, so the ending reads the same after a
// reload as it did the night it happened (personas churn; an ending must not)
let winRec = null;
function commas(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ","); }
function ferryFare() { return commas(FERRY_PRICE); }
// YOU DO NOT GET TO SEE THE WAY OUT UNTIL YOU HAVE BUILT SOMETHING. The boat
// herself crosses the far channel every Thursday from the first morning - the
// world is bigger than the town and always was. But the OFFICE, the fingerpost,
// the fare, and her name arrive only once the town has fitted the arcade: the
// last thing on the lot, and the proof this is a going concern rather than a
// crab treading water. Until then a player who pans east finds sand.
function ferryKnown() { return won || UPS.arcade.lvl > 0; }
let memorials = [];   // { x, name } - the town remembers
let today = newDayLog();
let report = null, reportT = 0, dossier = null, boardView = false, dossierHit = {};
let manage = null;   // key of the player-owned business whose MANAGEMENT card is open
let jobBoard = [], hireDay = 0;   // postings: {biz, wage, day}
function newDayLog() {
  return { served: 0, revenue: 0, rage: 0, sick: [], died: [], recovered: [],
    critical: [], walked: [], moved: [], rival: [], byCrab: {}, repStart: 30, catchStart: 0, biz: {},
    tipsShared: 0, bused: 0, heads: 0 };   // heads: visitors the ferry landed today (the dues base)
}
let screen = "title", hasSave = false, wiping = false;
// SAVED TOWNS screen state (its own overlay, its own rect table)
let saveView = false, saveSel = 1;
let saveConfirm = null, saveConfirmT = 0;   // { kind: "del"|"new", slot } - the second tap
let pendingImport = null;                   // { env, meta, name } - validated, written nowhere yet
let saveMsg = null;                         // { text, t, bad }
function reloadGame() { if (location && typeof location.reload === "function") location.reload(); }
function newGame(slot) {
  wiping = true;                            // nothing writes between here and the reload
  const i = slot == null ? activeSlot : slot;
  clearSlot(i); setActiveSlot(i);
  reloadGame();
}
// Switching towns: the one you're leaving keeps its progress, then a clean boot
// loads the target - no partial swap of live state, ever.
function loadSlot(i) {
  if (!slotCard(i)) return;
  if (i === activeSlot && hasSave) {
    saveView = false;
    if (screen === "title") { screen = "play"; startMusic(); sfx.ding(); }
    return;
  }
  save();
  wiping = true;
  setActiveSlot(i);
  reloadGame();
}
// CRAB_WAGE is now the STANDARD rate a business opens on, not the rate anybody
// is stuck with - see WAGE_STD / bizWage / wageRate. Kept as the name the rest
// of the file (and the tools) already say when they mean "the town's wage".
const CRAB_WAGE = WAGE_STD, HOUSE_RENT = 10;   // wage raised 22 -> 23 with T2 thirst: crews drink at retail, the wage keeps their wallets liquid
function rentAmount() { return BIZ.shack.rent; }   // shack lease (legacy name); due from night one
function totalRent() {   // the PLAYER's nightly property bill, due from night one
  return Object.keys(BIZ).filter(b => bizUnlocked(b) && bizOwner(b) === "player")
    .reduce((s, b) => s + BIZ[b].rent, 0);
}
// tonight's actual wage bill: crabs on a granted sick day and crabs on their
// day off skip pay, and anyone on overtime adds their premium (exactly the
// settlement loop's rule, so the BILL chip and MENU math match). A crab
// REQUIRED to work while sick is on the bill like anyone else.
function crabDueTonight(c) {
  if (onSickDay(c) && !c.workedToday) return 0;
  if (awayToday(c) && !c.workedToday) return 0;   // rota day off, or an unauthorised one
  return Math.round(basePayToday(c)) + Math.round(otPayForecast(c));
}
function wagesOwedTonight() { return crabs.reduce((s, c) => s + crabDueTonight(c), 0); }
function nightlyDue() { return totalRent() + wagesOwedTonight(); }
const busy = {
  shack: { board: [false, false, false], grill: [false, false, false] },
  juicebar: { juicer: [false, false] },
  arcade: { claw: [false, false], skee: [false, false] },
  showers: {},
  hotel: { linen: [false] },
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
const HOUSE_EMPTY2 = scale2(HOUSE_EMPTY);
const SHELTER2 = scale2(SHELTER);
const NOTICE2 = scale2(NOTICE_BOARD);
const STANDPIPE2 = scale2(STANDPIPE);
const BUS2 = scale2(BUS);
const BUGGIES2 = BUGGIES.map(scale2);

let npcs = [];
function allCrabs() { return npcs.length ? crabs.concat(npcs) : crabs; }
function initNpcs() {
  const p = { name: "SUDSY", npc: true, owner: "sudsy", trait: "cheery", mode: "walk",
    acc: "showercap", color: CRAB_COLORS.length - 1, shift: "D", house: 0, homeless: true,
    wallet: 25, job: "showers", hunger: 0, dirt: 0, bored: 0, tired: 0 };
  const c = newCrab(p);
  c.workBiz = "showers"; c.x = 1148; c.y = 158;
  // REEF keeps the DRIFTWOOD HOTEL, and LIVES IN THE COTTAGE NEXT DOOR - the
  // hotel sits at the far east end of the promenade, and an owner-operator
  // commuting 1700px from the shelter would spend his whole ten-hour day on
  // the road. Founders differ only in the stuff they start with (PLAN's
  // "all crabs equal" reading), and a proprietor with a cottage by his own
  // front door is a fact about his starting assets, not a rule about him.
  const rp = { name: "REEF", npc: true, owner: "reef", trait: "tidy", mode: "walk",
    acc: "cap", color: 3, shift: "D", house: 8, homeless: false,
    wallet: 30, job: "hotel", hunger: 0.1, dirt: 0.1, bored: 0, tired: 0.2 };
  const rc = newCrab(rp);
  rc.workBiz = "hotel"; rc.x = 2210; rc.y = 158;
  // THE RAIL HOLDS THREE NOW, and that is the hotel's doing rather than a
  // flavour change. The job board lets a flush NPC owner hire a jobless fisher,
  // and with a SECOND peer owner in town both of the founding pair were signed
  // on the same morning: measured on seed 1337, SALTY went to the hotel and
  // DRIFT to the showers on day 4, the pier landed ZERO fish for the rest of
  // the run, and the shack was buying $7 import fish from day nine. The price
  // mechanism does correct it (a $7 ceiling posts HELP WANTED: THE PIER and a
  // drifter answers) but it corrects a week late, which is the whole do-nothing
  // window. A town with a hotel, twice the visitors and twice the appetite
  // supports three fishers - so it has three, and the labour market has slack.
  const fishers = [
    { name: "SALTY", trait: "grumpy", acc: "cap", color: 4, x0: 1840, spot: 0 },
    { name: "DRIFT", trait: "dreamy", acc: "none", color: 2, x0: 2010, spot: 1 },
    { name: "KELP", trait: "lazy", acc: "flower", color: 5, x0: 1962, spot: 2 },
  ].map((f, i) => {
    const fp = { name: f.name, npc: true, fisher: true, trait: f.trait, mode: "walk",
      acc: f.acc, color: f.color, shift: "D", house: 0, homeless: true,
      wallet: 18, job: "fishing", hunger: 0.3, dirt: 0.2, bored: 0, tired: 0.3 };
    const fc = newCrab(fp);
    fc.fishSpot = fishSpotFor(f.spot);
    fc.x = f.x0; fc.y = 158;
    return fc;
  });
  npcs = [c, rc].concat(fishers);
  seatFoundingMayor();   // the shelter was open before you signed the lease; somebody keeps it that way
}
// TIRED (replaces SANDY): accrued by shift work and errand legwork - never by
// idling at home - and repaired only by SLEEP. The drain is proportional (an
// exhausted crab crashes hardest) so it self-limits, and bed quality is a
// real housing-ladder rung: your own bed (house or boat) drains at full rate,
// a shelter cot at half. Steady state is measured, not felt - see the
// "tired:" suite scenarios before touching these numbers.
// WHAT A DAY TAKES OUT OF YOU, and how little of it you get back on a cot.
// Both moved on the owner's directive (2026-08-19): "we need to be sure the
// shelter doesn't give you much rest" and "I feel like the crabs should have
// higher sleep requirements."
//   TIRED_SHIFT 0.45 -> 0.60: a standard six-hour shift now costs 0.60, so a
//     crab who sleeps badly is still carrying it into the next day.
//   TIRED_DRAIN cot 0.25 -> 0.10: a shelter cot was HALF a bed, which is not
//     what a cot is. The drain is proportional, so what matters is what is
//     LEFT in the morning. Same crab, same 0.80, one night, only the rung
//     different: own bed 0.010 -> 0.057, shelter cot 0.088 -> 0.332, the sand
//     0.800 either way. The bed-cot gap goes 0.078 -> 0.275, three and a half
//     times wider - the housing ladder made visible rather than a rounding
//     difference. Organically (6 towns x 14d) a crab wakes at 0.10 out of
//     their own bed and 0.29 off a cot.
// THREE TIERS, clearly ordered: own bed > shelter cot > the sand, where the
// sand banks NOTHING at all (see sleepRough).
const TIRED_SHIFT = 0.60, TIRED_ERRAND = 0.03, TIRED_NIGHT = 0.05;
const TIRED_DRAIN = { bed: 0.30, cot: 0.10 };   // fraction drained per game hour, asleep
// ...and while merely HOME, settled and off the clock in daylight: a nap, not
// a night. Same housing rung, a fraction of the rate - chosen by measurement
// (the M/E shift-fairness probe), not by feel. Too fast and tiredness stops
// mattering; too slow and the morning shift stays the punishing one.
// Measured on the M-vs-E probe (6 seeds x 10 days, mean tiredness): before the
// nap M 0.153 / E 0.087 (gap 0.066); at 0.15 gap 0.047, 0.25 -> 0.039,
// 0.35 -> 0.033, 0.40 -> 0.024, 0.50 -> 0.020 (and 0.50 IS the bed rate, which
// would make an afternoon on the porch a night's sleep). 0.40 is the slowest
// rate that clears the 0.03 tolerance, and the town's illness rate is
// untouched by it (10.40% -> 9.39%), so tiredness keeps its teeth.
const TIRED_NAP = { bed: 0.24, cot: 0.08 };   // the same 0.8x of the bedtime rate
                                             // the shift-fairness probe chose, on the new numbers

// ===========================================================================
// NEEDS THAT FAIL IN THEIR OWN CHARACTER - boredom "drifts", tiredness "stalls"
// (design/needs-failure-patterns.md, the owner's picks: B1 + B3, TI1 + TI4)
//
// Until now every need failed the same way: the bar filled, crabEff shaved a
// few percent and a flat number joined a sickness roll. Parched and bored
// looked identical from the boardwalk. These two get a VERB instead.
//
//   BOREDOM -> DRIFT.  IDLE HANDS: a restless crab on shift with no order to
//     claim stops loitering by the door and takes itself somewhere better -
//     the foot of the pier to watch the fishers, the tide line, the arcade
//     window it cannot afford. STILL CLOCKED IN: the claim scan runs every
//     frame, so a guest arriving costs exactly the walk back, and nothing
//     else. Past WALKOUT_AT for WALKOUT_DAYS running they take an
//     unauthorised day (B3, the late stage): no commute, no shift, NO WAGE.
//     Real stakes, no death.
//   TIREDNESS -> STALL.  THE MICROSLEEP: past NOD_AT, timed work has a
//     per-second chance to stop dead - eyes shut, a Z drifting up, 2-5
//     seconds, then a jolt awake. The crab KEEPS THE STATION SLOT while it
//     sleeps, so the cost lands on the whole kitchen and not just the
//     sleeper. Past ROUGH_AT a crab walking home doesn't make it: they bed
//     down where they stand, and sleeping rough banks NO repair (TI4), so
//     exhaustion prevents its own cure. Nothing punished the crab.
//
// ---------------------------------------------------------------------------
// THE CURE LEDGER FOR BOREDOM - the owner's ruling, and it is load-bearing.
// Boredom has exactly TWO cures in this game and NEITHER of them is free:
//
//   THE ARCADE - MONEY.  $650 to unlock, $13 a go, and it zeroes the bar on
//     the spot. Fast and total.
//   A CONVERSATION - TIME.  Two bored crabs who pass close enough stop and
//     talk for CHAT_SECS and come away CHAT_RELIEF less bored each. Two crabs
//     stood chatting are two crabs not working: that is PLAN's SELF-HEALING
//     RULE read exactly as written - "the way out costs TIME and never money.
//     It stops a death spiral; it never pays the rent."
//
// There is deliberately NO free-fun venue, NO ambient decay, and NO solo
// cure. A crab with nobody to talk to - the lone shower attendant, the fisher
// alone on the far rail - has no way out at all except the arcade. Boredom is
// therefore also a LONELINESS need, which is the shape the design doc wanted.
//
// AND A CHATTING PAIR CANNOT KEEP ITSELF TOPPED UP. A worked shift adds +0.2
// boredom. CHAT_CD lets a crab talk at most twice in a trading day, for
// CHAT_RELIEF 0.06 each: 0.12 of relief against 0.20 of accrual, so even a
// crew that does nothing but gossip still drifts UPWARD across a working
// week. Talking buys you days. Only the arcade buys the bar back.
// ---------------------------------------------------------------------------

// MEASUREMENT HATCH. Every one of these five behaviours moves the balance
// curve, so the build has to be able to attribute the movement to each of them
// separately - and one suite scenario needs a control arm with the chatter
// switched off to prove boredom has no OTHER way down. `window._failOff` is
// read through one helper at five gates; the game never sets it.
const patOff = (k) => !!(window._failOff && window._failOff[k]);

// ---- IDLE HANDS (the wander-off) -----------------------------------------
const WANDER_AT = 0.6;        // restless enough to leave the post
const WANDER_PX = 340;        // how far off post a wander may take them
const WANDER_QUIET = 3;       // real seconds the counter must be DEAD first - a
                              // crab doesn't bolt the instant the queue empties
const WANDER_DWELL = 14;      // ...then 14-24s stood there watching
const WANDER_CD = 20;         // real seconds back at the post before the next one
                              // (a six-hour shift is only 90 REAL seconds, so these
                              //  three numbers are what set the share of a dead
                              //  spell a crab spends off post: about half)
// Landmarks worth drifting to. Absolute x's, so the same table serves every
// shop; each crab takes whichever ones lie within WANDER_PX of their post, and
// the nearest-is-likeliest weighting keeps them roughly in their own quarter.
const WANDER_SPOTS = [
  { x: 640,  label: "THE TOWN TAP" },        // beside the notice board
  { x: 716,  label: "THE NOTICE BOARD" },    // reading postings they'd never take
  { x: 908,  label: "THE TIDE LINE" },       // the sand between the bar and the showers
  { x: 1145, label: "THE SEA WALL" },
  { x: 1180, label: "THE TIDE LINE" },       // the gap between the showers and the shack
  { x: 1578, label: "THE ARCADE WINDOW" },   // nose to the glass, no token in pocket
  { x: 1858, label: "THE PIER RAIL" },       // watching the fishers cast (clear of FISHING_SPOTS)
];
// RULE 3 from the design doc: BOREDOM YIELDS TO EVERYBODY. Boredom is the need
// of a crab whose life is otherwise fine. A crab who is starving, parched or
// dead on their feet has no business wandering off to watch the sea, and this
// is what stops idle hands firing on a crab who is dying. Dirt is deliberately
// NOT in the list: dirt is passive and always-on (Rule 2), it never competes
// for the crab's behaviour - and the town sits near 0.7 dirt permanently, so
// including it would switch the whole pattern off.
const BORED_YIELD = 0.8;
function boredYields(c) {
  return (c.p.hunger || 0) >= BORED_YIELD || (c.p.thirst || 0) >= BORED_YIELD
    || (c.p.tired || 0) >= BORED_YIELD;
}
function wanderSpot(c, post) {
  // A RIVAL EYEING A SHOP GOES AND STANDS OUTSIDE IT. Not a new behaviour -
  // the same idle-hands trip every bored crab takes, aimed on purpose. This is
  // the tell on the boardwalk, days before anything reaches a report.
  if (rivalEyeing(c) && Math.random() < RIVAL_CFG.STAKEOUT) {
    const z = BIZ[RIVAL_CFG.PRIZE];
    return { x: z.queueX + 10, y: clearSpotY(z.queueX + 10, 156), label: "THE " + z.name, eyeing: true };
  }
  const near = WANDER_SPOTS.filter(s => Math.abs(s.x - post) <= WANDER_PX);
  if (!near.length) return null;
  const s = near[(Math.random() * near.length) | 0];
  return { x: s.x, y: clearSpotY(s.x, 150 + ((Math.random() * 3) | 0) * 6), label: s.label };
}
const WANDER_QUIPS = ["NOTHING DOING", "JUST STRETCHING MY LEGS",
  "WONDER IF THEY'RE BITING", "BACK IN A TICK"];

// ---- IDLE HANDS, late stage: THE WALK-OUT ---------------------------------
const WALKOUT_AT = 0.95;      // pinned this bored...
// ...at this many settlements running, and they've had enough. The design doc
// wrote 2, but it wrote it assuming a FREE FUN venue would exist to bring the
// bar down. It doesn't: in an arcade-less town boredom PINS at 1.00 by about
// day 5 and never falls, so a threshold of 2 makes the late stage the steady
// state - every crab losing every third day, forever, which is a paywall
// rather than pressure. MEASURED, 8 seeds x 30d baseline: at 2 the town takes
// 48 walk-outs and the eviction median falls 17 -> 11; at 4 it takes 20 and
// lands at 14. Four means a bored crew loses roughly one extra day a week -
// visible, expensive, survivable, and it stops the moment you buy the arcade.
const WALKOUT_DAYS = 4;
function walkoutToday(c) { return c.p.walkout === day; }
// "not working today", for every rule that has to agree about it: the rota's
// day off OR an unauthorised one. offToday() stays the ROTA and nothing else -
// the cover-shift promotion keys on it, and nobody covers a walk-out.
function awayToday(c) { return offToday(c) || walkoutToday(c); }

// ---- THE BEACH BALL (Matt, 2026-08-19: "we should also have a better sources
// of limited fun, e.g. throwing a beach ball") ------------------------------
// LIMITED is the load-bearing word in that request, and it is limited three
// different ways, on purpose:
//   1. THERE IS ONE BALL. Two crabs can play, a third cannot - the cap is a
//      physical object lying on the sand rather than a rule in a table.
//   2. IT ONLY TAKES THE EDGE OFF. A game of catch is 0.22 of boredom where
//      the arcade ZEROES it. You cannot live out here.
//   3. IT COSTS THE DAY. You walk to the middle of the beach and stand there
//      throwing for twelve seconds - which is the standing rule for every free
//      cure in this game: TIME, never money (see THE SELF-HEALING RULE).
// And it is offered LAST, after any arcade the crab could actually afford,
// because of what the shelter pot taught us the hard way: a free option
// standing beside a paid one does not relieve the need, it takes the takings.
// Early on there IS no arcade, which is exactly the hole Matt was pointing at.
//
// ALONE IS WORSE THAN TOGETHER, and that falls out of the geometry rather than
// a special case: relief is decided when the timer ends by looking at who else
// is standing at the ball. Nobody there, you were bouncing it off your own
// claw and it shows.
const BALL_X = 1290;          // open sand between the showers and the shack
const BALL_AT = 0.66;         // you'd BUY fun at 0.45; you walk out here when properly bored
const BALL_JOIN = 0.48;       // ...but a game already going is worth joining at much less
const BALL_YIELD = 0.55;      // ...and any real need outranks it well before boredYields' 0.8
const BALL_LEAD = 90;         // game-minutes of clear air needed before a shift: the game is ~48
const BALL_Y = 157;           // up the sand, clear of BOTH travel lanes (146/168, 9px of blocking each)
const BALL_SECS = 12;         // real seconds stood throwing - ~48 game-minutes
const BALL_PAIR = 0.22;       // a real game of catch
const BALL_SOLO = 0.08;       // ...and knocking it about on your own
const BALL_CD = 300;          // game minutes: not a career
const BALL_PX = 30;           // close enough to be in the same game
const BALL_LINES = ["OVER HERE!", "MY CLAW!", "NICE ONE", "TOO HIGH!", "AGAIN!"];
function ballPlayers() { return allCrabs().filter(k => k.dayState === "atBall"); }
function ballHasRoom(c) { return ballPlayers().filter(k => k !== c).length < 2; }
function startBallStop(c) {
  c.dayState = "atBall"; c.ballT = 0;
  // NO TIRED_ERRAND HERE, and that is measured rather than sentimental. That
  // charge models a chore - the trudge out and back with the shopping - and
  // adding it to a game of catch pushed the MORNING/EVENING fatigue gap from
  // level (-0.007 as shipped) to 0.054, past the 0.04 the shift-fairness
  // scenario allows. Which shift you happen to draw must not decide how tired
  // you are, and an optional game must not be what decides it. The ball still
  // costs the thing every free cure in this game costs: the walk, and twelve
  // seconds of a working day.
  // UP THE BEACH, CLEAR OF BOTH TRAVEL LANES. LANES are y146 and y168 and a
  // parked crab blocks a lane within 9px of it, so a game at the tap stops'
  // y163 walls off the southern lane in the middle of the promenade for
  // twelve seconds at a time - and the whole town has to route around it.
  // That is not theoretical: it took SUDSY, who never plays, from 9.8% of her
  // life on the dehydration line to 31.4%, because the ball sat between her
  // showers and the pier tap. y157 clears 146 by 11 and 168 by 11.
  setT(c, BALL_X + (ballPlayers().length ? 18 : -6), BALL_Y);
}
function updateBall(c, dt) {
  if (c.ballT <= 0) {                       // still walking out to it
    if (routedStep(c, crabMove(c), dt)) {
      c.ballT = BALL_SECS + Math.random() * 4;
      c.quip = { text: BALL_LINES[(Math.random() * BALL_LINES.length) | 0], t: 2.4 };
    }
    return;
  }
  c.ballT -= dt;
  if (((c.ballT * 2) | 0) % 7 === 0 && Math.random() < 0.02)
    c.quip = { text: BALL_LINES[(Math.random() * BALL_LINES.length) | 0], t: 2.0 };
  if (c.ballT > 0) return;
  // WHO ELSE IS OUT HERE decides what it was worth
  const mate = ballPlayers().find(k => k !== c && k.ballT > 0 && Math.abs(k.x - c.x) <= BALL_PX);
  const relief = mate ? BALL_PAIR : BALL_SOLO;
  c.p.bored = Math.max(0, (c.p.bored || 0) - relief);
  crabLog(c, "need", mate ? "PLAYED CATCH WITH " + mate.p.name : "KNOCKED THE BEACH BALL ABOUT", 0);
  popText(mate ? "GAME OF CATCH" : "A FEW THROWS", c.x - 16, FLOOR_Y - 30, [255, 210, 140]);
  c.quip = { text: mate ? "SAME TIME TOMORROW" : "NEEDED A PARTNER", t: 2.4 };
  if (window._stats) {
    window._stats.ballGames = (window._stats.ballGames || 0) + 1;
    if (mate) window._stats.ballPairs = (window._stats.ballPairs || 0) + 1;
  }
  c.ballT = 0; c.errandCd = 4; c.ballCd = BALL_CD;
  c.dayState = "home";
  afterErrand(c, true);
}
// ---- CHATTER (the time-priced cure) ---------------------------------------
const CHAT_AT = 0.55;         // both parties have to actually want the company
const CHAT_PX = 26;           // close enough to fall into step
const CHAT_SECS = 10;         // 10-16 real seconds = 40-64 GAME-MINUTES of the day
const CHAT_RELIEF = 0.06;     // modest, and deliberately under half a shift's +0.2
const CHAT_CD = 360;          // game minutes: at most twice in a trading day
const CHAT_LINES = ["YOU'LL NEVER GUESS", "SHE DIDN'T!", "...ANYWAY",
  "NO, GO ON", "THAT'S THE THIRD TIME", "BETTER GET BACK"];
// Who is free to stop and talk. Anyone holding something the town depends on -
// a claimed order, a station slot, a place in a queue, a player's order - is
// not, so a chat can never strand a resource.
function chatReady(c) {
  if (patOff("chat")) return false;
  if (c.p.sick || c.hidden || c.carrying || c.errandCust || c.cust) return false;
  if (c.slot >= 0 || c.order || (c.napT || 0) > 0 || (c.chatCd || 0) > 0) return false;
  if ((c.p.bored || 0) < CHAT_AT || boredYields(c)) return false;
  const ds = c.dayState;
  if (ds === "working") return !c.pendingOff && (c.p.job === "fishing" || c.kstate === "idle" || c.kstate === "wander");
  // ...and NOBODY strikes up a conversation in their sleep. Without this a
  // pair of shelter cots 26px apart chat at 04:30, which reads as a bug even
  // though the arithmetic is fine. The walk home in the dark still counts:
  // that is exactly when two crabs fall into step.
  if (ds === "home" && darkness() > 0.6) return false;
  return ds === "home" || ds === "toWork" || ds === "toHome";
}
function startChat(a, b) {
  for (const [c, o] of [[a, b], [b, a]]) {
    c.chatFrom = c.dayState; c.dayState = "chat";
    c.chatWith = o; c.chatT = CHAT_SECS + Math.random() * 6;
    c.chatCd = CHAT_CD; c.chatLine = 0;
    c.wander = null; c.wanderT = 0;   // the conversation IS the wander now
    c.stuckT = 0; c.stuckRef = null; c.stuckN = 0;
    setT(c, c.x, c.y);
  }
  a.quip = { text: CHAT_LINES[(Math.random() * CHAT_LINES.length) | 0], t: 2.6 };
  if (window._stats) window._stats.chats = (window._stats.chats || 0) + 1;
}
function endChat(c, paid) {
  if (c.dayState !== "chat") return;
  if (paid) {
    c.p.bored = Math.max(0, (c.p.bored || 0) - CHAT_RELIEF);
    if (window._stats) window._stats.chatRelief = (window._stats.chatRelief || 0) + CHAT_RELIEF;
  }
  c.dayState = c.chatFrom || "home";
  c.chatFrom = null; c.chatWith = null; c.chatT = 0;
  setT(c, c.x, c.y);
}
// A chat holds POSITION and nothing else: no stepTo runs, so the auto-unstick
// watchdog never sees it (it only looks at crabs that genuinely stepped), and
// dayState "chat" is not one of the moving states the suite's freeze detector
// samples. Both exemptions are by construction rather than by special case.
function updateChat(c, dt) {
  const o = c.chatWith;
  if (!o || o.dayState !== "chat" || o.chatWith !== c) { endChat(c, false); return; }
  c.chatT -= dt;
  // alternate the bubbles so it reads as a conversation, not two monologues
  const beat = Math.floor((CHAT_SECS + 6 - c.chatT) / 3.5);
  if (beat > c.chatLine && !c.quip && !o.quip) {
    c.chatLine = beat;
    c.quip = { text: CHAT_LINES[(beat + (c.p.name.length % 3)) % CHAT_LINES.length], t: 2.4 };
  }
  if (c.chatT <= 0) endChat(c, true);
}
// One O(n^2) sweep over a dozen crabs, in its own pass - deliberately NOT
// folded into collide(), which belongs to the locomotion layer.
function runChatter(dt) {
  const all = allCrabs();
  for (const c of all) {
    if ((c.chatCd || 0) > 0) c.chatCd -= dt * TS;
    if ((c.ballCd || 0) > 0) c.ballCd -= dt * TS;
  }
  for (let i = 0; i < all.length; i++) {
    const a = all[i];
    if (!chatReady(a)) continue;
    for (let j = i + 1; j < all.length; j++) {
      const b = all[j];
      if (!chatReady(b)) continue;
      if (Math.abs(a.x - b.x) > CHAT_PX || Math.abs(a.y - b.y) > 14) continue;
      startChat(a, b);
      break;
    }
  }
}

// ---- THE MICROSLEEP -------------------------------------------------------
// The nod line, raised 0.85 -> 0.90 when tiredness started accruing THROUGH
// the shift instead of landing as a lump at knock-off. That change took the
// share of station time sitting past 0.85 from ~0% to 10.9% in a plain town
// and 2.3% -> 34% in an overtime one, so a threshold calibrated against the
// old, tiny window was suddenly costing a growth town three of eight seeds.
// 0.90 also reads better as an escalation, because it sits just ABOVE the
// EXHAUSTED mood: the card tells you they are done for before the first nod,
// and TI4 (not making it home at all) sits above that again at 0.97.
// Auto-manage still pulls a crab off overtime at tired 0.75 - well below the
// line - so a delegated town measurably nods less: 1.76 vs 4.08 per town-day.
// RETUNED AT THE MERGE (0.90 -> 0.96). Each pattern was measured alone, but
// the stack - boredom drift, walk-outs, microsleeps, sleeping rough AND the
// harder sleep numbers the owner asked for - compounded: growth escape fell
// 6/8 -> 2/8 with towns dying at a median of day 9. Attribution (--failoff)
// put the tiredness pair at the top: switching nods+rough off alone restored
// 4/8. The sleep REQUIREMENTS stay exactly as the owner set them; what gives
// is the nod line, which now sits above the EXHAUSTED mood rather than on it.
// Nods stay visible at 0.42 a town-day (from 0.63) and growth returns to 4/8.
const NOD_AT = 0.96;
// per second of timed work past NOD_AT. MEASURED against the design brief's
// ~5% ceiling on station time lost: a plain 4-crew town loses 1.4% of its
// station time to nods and an all-overtime one 4.7%, at 0.63 and 4.08 nods per
// town-day. The rate has never been what makes nods rare - being past the nod
// line while actually mid-task is, and the housing rung is what decides that.
const NOD_RATE = 0.03;
const NOD_MIN = 2, NOD_SPAN = 3;   // 2-5 seconds, hard-capped: a stall, never a jam
// the states where a nod actually COSTS something - mid-task, mid-carry, or
// holding a station. Never "idle" (a nod on a dead counter costs nobody
// anything) and never waitSlot/waitCash (they hold nothing).
const NOD_STATES = ["walk", "toSlot", "work", "toStallClean", "cleaningStall"];
const NOD_WAKE = ["WHAT? I'M UP", "JUST RESTING MY EYES", "WHERE WAS I"];

// ---- THE SHORTCUT HOME ----------------------------------------------------
const ROUGH_AT = 0.97;        // this far gone and the walk home is too far
const ROUGH_PX = 250;         // ...if there's still this much of it left
// ...and then it is a CHANCE per second, not a cliff. A flat rule dropped every
// exhausted crab the instant they left the shack (home is always further than
// 250px from a counter), which made rough sleeping a one-way ratchet with no
// exit but the weekly rota day. As a per-second roll, a crab three-quarters of
// the way home usually makes it and the same crab leaving the pier usually
// does not - which is the difference between a spiral and a wall.
// ...and RETUNED 0.03 -> 0.012 when the sleep directives landed. Raising what
// a day costs and cutting the cot's recovery put far more crabs over ROUGH_AT
// in the first place, and a crab who sleeps rough banks nothing, so they stay
// there - pinned on the tired >= 0.95 sickness line night after night. At 0.03
// that took a growth town from 7/8 to 5/8 on its own. TI4 is the tail event,
// not the norm.
const ROUGH_RATE = 0.012;
// Bed down where they stand. dayState "home" with p.rough set: updateHome
// skips BOTH repair branches, so the night banks nothing at all (bed 0.4-0.5
// an hour, cot 0.2-0.25, street 0). Exhaustion prevents its own cure, which is
// the honest spiral - and the player can break it with a day off, a rest
// order, or simply a shorter shift.
function sleepRough(c) {
  c.p.rough = true; c.p.roughLast = day;
  c.hidden = false; c.cstate = ""; c.busFrom = -1; c.busTo = -1;
  c.dayState = "home"; c.duty = false; c.pendingOff = false;
  c.y = clampY(c.y); setT(c, c.x, c.y);
  c.quip = { text: "JUST... FIVE MINUTES", t: 3.2 };
  popText("TOO TIRED TO GET HOME", c.x - 22, c.y - 26, [190, 160, 230]);
  if (window._stats) window._stats.roughNights = (window._stats.roughNights || 0) + 1;
}

// who lives at lot h (boat owners have house === null and match nothing).
// This is THE draw-side derivation too: drawTown renders every lot and asks
// here whether it's occupied - houses exist first, occupants second.
function houseOccupant(h) {
  return allCrabs().find(c => !c.p.homeless && c.p.boat == null && c.p.house === h) || null;
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
  // SLEEPING ROUGH (TI4). They are already down, wherever "here" turned out
  // to be - a bench, the sand, the shack floor. No walk home, and NO REPAIR
  // on either ladder: the street is not a bed and it is not even a cot. Come
  // morning they get up exactly as tired as they lay down and start the day
  // that way, which is how exhaustion prevents its own cure.
  if (c.p.rough) {
    if (darkness() >= 0.5) { setT(c, c.x, c.y); return; }
    c.p.rough = false;   // up with the light, stiff, and none the better for it
    c.quip = { text: ["SLEPT WHERE I FELL", "MY SHELL ACHES", "THAT WAS NO BED"][(Math.random() * 3) | 0], t: 3 };
  }
  // a day off is for the beach: after the lie-in, amble the sand near home
  // between errands instead of pacing the porch. A WALK-OUT spends the day
  // exactly the same way - that is the whole point of taking one.
  if (awayToday(c) && !c.p.sick && tmin >= OFF_WAKE && darkness() < 0.5) {
    if (c._offPause > 0) { c._offPause -= dt; return; }
    if (c._offWt == null) {
      c._offWt = Math.max(24, Math.min(WORLD_W - 40, homeX(c) + Math.random() * 240 - 120));
      c._offWy = clearSpotY(c._offWt, 150 + Math.random() * 16);   // amble on the sand, not through the picnic tables
      setT(c, c._offWt, c._offWy);
    }
    if (routedStep(c, crabMove(c) * 0.55, dt)) {
      c._offWt = null; c._offPause = 2 + Math.random() * 5;
    }
    return;
  }
  c._offWt = null;
  // THE DOOR IS BOLTED. The fund missed the shelter's rent three settlements
  // running and Mr. Pincherton locked it, so the crabs who live there walk the
  // whole way home and bed down on the step. sleepRough is not a new state - it
  // banks NOTHING on either ladder, and the exhaustion it leaves behind arms
  // tomorrow's sickness roll - which is exactly why the office failing has to
  // land here rather than in a number on a panel.
  if (c.p.homeless && shelterShut() && darkness() > 0.7 && !c.p.rough
      && Math.abs(c.x - homeX(c)) < 40) { sleepRough(c); return; }
  // convalescence: DAYLIGHT hours spent at home while ill are what the care
  // ladder reads (night sleep is everyone's, so it would prove nothing). A
  // crab who commuted in and worked banks a couple of hours either side of
  // their shift and never reaches REST_HOURS; a crab who stayed home does.
  if (c.p.sick && darkness() < 0.7) c.p.restT = (c.p.restT || 0) + dt * TS / 60;
  const s = homeSpot(c);
  // SLEEP repairs TIRED: bedded down for the night, exhaustion drains away -
  // full rate in your own bed (house/boat), half on a shelter cot
  if (darkness() > 0.7 && (c.p.tired || 0) > 0) {
    const rate = c.p.homeless ? TIRED_DRAIN.cot : TIRED_DRAIN.bed;
    c.p.tired = Math.max(0, (c.p.tired || 0) * (1 - rate * dt * TS / 60));
  } else if ((c.p.tired || 0) > 0 && Math.abs(c.x - s.x) < 20) {
    // ...AND SO DOES A DAYTIME NAP. Rest was gated on the SUN, not on being
    // home: a morning crab's long free afternoon indoors repaired nothing
    // while an evening crab banked the whole night, so the shift you drew -
    // not the crab you were - decided your fatigue. A crab who is actually
    // home, settled, and off the clock now recovers at TIRED_NAP, which is a
    // fraction of the bedtime rate (a nap on the porch is not a night's
    // sleep) and keeps the same housing rung: a cot naps worse than a bed.
    const rate = c.p.homeless ? TIRED_NAP.cot : TIRED_NAP.bed;
    c.p.tired = Math.max(0, (c.p.tired || 0) * (1 - rate * dt * TS / 60));
  }
  routedWalk(c, s.x, s.y, crabMove(c) * 0.7, dt);
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
  // TIRED replaced SANDY: old saves seed tired from their sandy value, and the
  // stale field is dropped so nothing strands in future saves
  if (persona.tired == null) persona.tired = persona.sandy || 0;
  delete persona.sandy;
  if (persona.thirst == null) persona.thirst = 0;
  // labor policy state: no overtime standing, no per-crab sick override, no
  // convalescence banked. Old saves land here and behave exactly as before.
  if (persona.ot == null) persona.ot = false;
  if (persona.restT == null) persona.restT = 0;
  if (persona.sickPol != null && !SICK_POLS.includes(persona.sickPol)) delete persona.sickPol;
  clampLog(persona);   // THE CRAB DIARY: old saves have none, a degenerate one can't grow
  // needs-failure state: settlements at WALKOUT_AT boredom, the day an
  // unauthorised one is being taken, and whether they slept rough. Old saves
  // land on zeroes and behave exactly as before.
  if (persona.boredDays == null) persona.boredDays = 0;
  if (persona.walkout == null) persona.walkout = 0;
  if (persona.rough == null) persona.rough = false;
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
    // needs-failure fields (all transient - derived behaviour, nothing to save)
    idleT: 0, wander: null, wanderT: 0, wanderCd: 0,
    chatT: 0, chatCd: 0, chatWith: null, chatFrom: null, chatLine: 0,
    napT: 0, napFrom: null,
    quip: null, quipT: 8 + Math.random() * 15,
  };
}
// ---- THE TRUDGE: hunger and thirst fail as a SPEED PENALTY (Matt's call:
// "dirt boredom and tiredness are good; hunger and thirst should just be a
// speed penalty" - the design doc's RAID and SHORT LEASH are both rejected).
// ONE SHAPE, TWO NEEDS: a linear ramp to -DRAG_MAX at a pinned 1.00, so what
// the player sees is a crab FLAGGING rather than a switch flipping - a crab
// that just got peckish walks normally, a crab an hour past its lunch is
// visibly labouring, a starving one trudges. Each ramp STARTS where that need
// already started costing the town something, which is why the two thresholds
// differ (see each constant); the slope and the depth are shared, so the two
// read as one family from the boardwalk.
// Thirst's old -15% CLIFF at 0.8 is GONE, replaced by a ramp that passes
// through EXACTLY 0.85 at thirst 0.8 - same value, same threshold - so the T2
// balance point is not quietly moved on the way past.
// DRAG_FLOOR is the anti-spiral guard. Hunger already drags prep through
// crabEff and both needs already feed the nightly sickness roll; a crab that
// is starving AND parched must not compound into one that can no longer walk
// to the food and water that would fix it. The two multiply, floored at 0.70.
const DRAG_HUNGER_AT = 0.3;   // = crabEff's own hunger line: past 0.3 hunger
                              // already costs prep, and now it costs pace too.
                              // Swept against the baseline matrix: at 0.5 the
                              // do-nothing town got RICHER than it is meant to
                              // be (2 of 16 surviving 30 days against the
                              // documented 0 of 16), at 0.3 it reads 0/16 again
const DRAG_THIRST_AT = 0.5;   // pitched so the ramp passes through 0.85 at
                              // thirst 0.8 - the EXACT value of the -15% cliff
                              // it replaces, at the exact threshold it fired
                              // at. Swept against the tap's anti-trap probe,
                              // which is where thirst's fairness is measured:
                              // 0.45 put the worst crab on the 0.95 dehydration
                              // line for 21% of its life against 6% at 0.5.
                              // (The shipped build reads 18.7% on that probe -
                              // the hunger ramp's own move to 0.3 costs the
                              // same crab errand hours. Under the 25% gate,
                              // documented in the scenario, and this is the
                              // knob if it ever climbs past it.)
const DRAG_MAX = 0.25;        // each need, at a pinned 1.00
const DRAG_FLOOR = 0.70;      // the two TOGETHER can never go below this
// ...and the ONE exemption, which is THE SELF-HEALING RULE read straight: the
// way out of a deficiency costs TIME, but it can never be closed off. A crab
// is not slowed on the walk to the very thing that would fix it - the trudge
// is what a neglected crab does on the way to WORK, not on the way to lunch.
// (This is the doc's own guard on the rejected SHORT LEASH - "the leash
// exempts water" - carried across to the penalty that replaced it. Measured,
// and it is not decoration: WITHOUT it the tap's anti-trap gate breaks, a
// townsfolk crab going 7.0 days without a drink because it was too slow to
// reach free water 100px away. It also makes the fix LEGIBLE - the moment a
// starving crab decides to eat, it picks its feet up.)
function selfCareNeed(c) {
  if (c.dayState === "atTap") return c.tapStop ? c.tapStop.need : null;
  if (c.dayState === "selfCook") return c.cookNeed || "food";
  if ((c.dayState === "toErrand" || c.dayState === "errand") && c.errand) return c.errand.need;
  return null;
}
function needDrag(c) {
  if (window._noNeedDrag) return 1;   // paired-arm probe (see the anti-spiral suite gate)
  const fixing = window._noSelfCareExempt ? null : selfCareNeed(c);
  const ramp = (v, at, off) => off ? 1 : 1 - DRAG_MAX * Math.min(1, Math.max(0, (v - at) / (1 - at)));
  return Math.max(DRAG_FLOOR, ramp(c.p.hunger || 0, DRAG_HUNGER_AT, fixing === "food")
    * ramp(c.p.thirst || 0, DRAG_THIRST_AT, fixing === "drink"));
}
// HEAT SHIMMER (the doc's T2, shipped as the cheap visual companion it was
// pitched as): a parched crab does not walk uniformly slow, it LURCHES -
// stride, flag, stride. Mean-preserving by construction (a sine about 1.0),
// so it costs nothing mechanically: the ramp above is the whole penalty.
// It never reaches zero either, so a panting crab still counts as a MOVER to
// collide() and still clears the no-progress watchdog's 2px in 1.5s.
const SHIMMER_AT = 0.6, SHIMMER_AMP = 0.5, SHIMMER_HZ = 4.0;
function heatShimmer(c) {
  if (window._noShimmer) return 1;
  const f = Math.min(1, Math.max(0, ((c.p.thirst || 0) - SHIMMER_AT) / (1 - SHIMMER_AT)));
  return f <= 0 ? 1 : 1 + SHIMMER_AMP * f * Math.sin(time * SHIMMER_HZ + c.animT * 6.3);
}
function crabMove(c) {
  const t = TRAITS[c.p.trait];
  return 40 * t.move * (1 - 0.2 * Math.max(0, (c.p.bored || 0) - 0.5)) * (c.p.sick ? 0.5 : 1)
    * needDrag(c) * heatShimmer(c);
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
// ---- THE WIDE BERTH (design doc D1, Matt's pick): dirt is the town's one
// SOCIAL need, so it fails socially. A filthy crab's personal space inflates -
// the 12px separation radius in collide() grows to 22px, tourists take the far
// table, and a tourist served by one runs out of patience quicker. The tell is
// a bubble of empty boardwalk that follows one crab around.
// (The doc's D2, the smudge trail, is deliberately NOT built - the doc holds
// it back until dirt is reliably serviceable and the owner did not pick it.)
const BERTH_AT = 0.6;     // where the bubble starts to open (= crabEff's dirt line)
const BERTH_PX = 10;      // full bubble at dirt 1.00: 12px personal space -> 22px
const SHUN_AT = 0.8;      // a tourist takes the FAR table - binary, and pitched
                          // high on purpose so seating does not churn on a 0.61
const PATIENCE_FILTH = 0.3;   // up to +30% patience drain from a filthy server
function crabBerth(c) {
  return BERTH_PX * Math.min(1, Math.max(0, ((c.p.dirt || 0) - BERTH_AT) / (1 - BERTH_AT)));
}

// ---------------------------------------------------------------- sound (from CS1)
const PLAYLIST = [
  { src: "music/pixel-wave-waltz.mp3", name: "PIXEL WAVE WALTZ" },
  { src: "music/regalia-of-the-surf.mp3", name: "REGALIA OF THE SURF" },
  { src: "music/regalia-waltz.mp3", name: "REGALIA WALTZ" },
  { src: "music/butter-pow.mp3", name: "BUTTER POW" },
  { src: "music/carnival-of-the-glitch.mp3", name: "CARNIVAL OF THE GLITCH" },
  { src: "music/pixomatic-moon.mp3", name: "PIXOMATIC MOON" },
  { src: "music/dense-portal.mp3", name: "DENSE PORTAL" },
  { src: "music/dance-up.mp3", name: "DANCE UP" },
  { src: "music/lantern-circuit.mp3", name: "LANTERN CIRCUIT" },
  { src: "music/marble-rain.mp3", name: "MARBLE RAIN" },
  { src: "music/rain-circuit-lullaby.mp3", name: "RAIN CIRCUIT LULLABY" },
  { src: "music/goat-circuit.mp3", name: "GOAT CIRCUIT" },
];
let musicOn = false, music = null, muted = false;   // opt-IN for new players (SFX stays on)
let musNudges = 0, musNudged = false;               // invite, don't nag: gives up after 3 sessions
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
// N SLOTS, not one key. Every slot holds the SAME envelope save() has always
// written - treated here as an OPAQUE blob so other systems can keep adding
// fields to it - plus two sidecar keys this layer owns:
//   _ver   the format guard an import is checked against
//   _meta  the at-a-glance card (day, till, rep, pop, crew roster) the SAVED
//          TOWNS screen renders without loading anything
// _meta is always derivable from the envelope alone (slotMeta), so migrated and
// imported saves get one for free and a stale one can never lie.
const SAVE_KEY = "crabshack3_v1";        // the legacy single-slot key: migration source only
const SAVE_VER = 1;
const SLOTS = 5;
const ACTIVE_KEY = SAVE_KEY + "_active";
function slotKey(i) { return SAVE_KEY + "_s" + i; }
function nowMs() { try { return Date.now(); } catch (e) { return 0; } }   // headless sandboxes may not have a clock
let activeSlot = 1;                      // autosave goes here; persisted in ACTIVE_KEY
const FRESH = location.search.includes("fresh");
const TURBO = Math.max(1, parseInt((location.search.match(/turbo=(\d+)/) || [0, 1])[1]) || 1);

// The one gate every save passes - stored, migrated or imported. Returns null
// when the blob really is a CRAB SHACK 3 town, else a short reason to show on
// canvas. Nothing in the game may be mutated before this says yes.
function saveProblem(s) {
  if (!s || typeof s !== "object" || Array.isArray(s)) return "NOT A SAVE FILE";
  if (s._ver != null && (typeof s._ver !== "number" || s._ver > SAVE_VER)) return "FROM A NEWER CRAB SHACK";
  if (!Array.isArray(s.personas) || !s.personas.length) return "NO CREW - NOT A CRAB SHACK 3 SAVE";
  for (const p of s.personas)
    if (!p || typeof p !== "object" || typeof p.name !== "string") return "THE CREW RECORD IS DAMAGED";
  if (s.day != null && (typeof s.day !== "number" || !isFinite(s.day) || s.day < 1)) return "BAD DAY COUNTER";
  if (s.coins != null && (typeof s.coins !== "number" || !isFinite(s.coins))) return "BAD TILL";
  return null;
}
function homeOf(p) {   // housing tier + a label, from a persona alone
  if (p.boat != null && BOAT_NAMES[p.boat]) return { tier: 2, label: "THE " + BOAT_NAMES[p.boat] };
  if (p.homeless || p.house == null) return { tier: 0, label: "SHELTER COT" };
  return { tier: 1, label: p.house >= 7 ? "COTTAGE" : "HOUSE " + (p.house + 1) };
}
// The preview card: derived from the envelope, no game state touched.
function slotMeta(s) {
  const crew = (Array.isArray(s.personas) ? s.personas : []).slice(0, 8).map(p => {
    const h = homeOf(p || {});
    return {
      name: String((p && p.name) || "?"), color: ((p && p.color) | 0) % CRAB_COLORS.length,
      acc: (p && p.acc) || "none", job: (p && p.job) || "shack",
      home: h.label, tier: h.tier,
      sick: !!(p && p.sick), sickDays: (p && p.sick && p.sick.days) || 0, ot: !!(p && p.ot),
    };
  });
  const npcN = s.npc && Array.isArray(s.npc.personas) ? s.npc.personas.length : 0;
  const d = s.day || 1;
  // the money + ownership picture (Matt): what you own, what you owe, what the
  // town's worth. Derived from the envelope, so slots saved before this exist
  // get it too the moment they're read.
  const lv = s.lv || {};
  const owned = Object.keys(BIZ).filter(b => BIZ[b].owner === "player" &&
    (b === "shack" || (lv[b] || 0) > 0));
  const rentDue = owned.reduce((n, b) => n + BIZ[b].rent, 0);
  // labor is priced by the hour: a town saved with a long trading day carries
  // a proportionally bigger payroll, and the preview card must say so. Shifts
  // tile the open window, so the whole roster's bill scales with its span.
  const shackH = s.hours && Array.isArray(s.hours.shack) ? s.hours.shack : null;
  const span = shackH ? Math.max(0, (+shackH[1] || 0) - (+shackH[0] || 0)) : 2 * STD_SHIFT;
  const shiftLen = Math.min(STD_SHIFT, Math.round(span / 2) || STD_SHIFT);
  // ...and at whatever rate that town pays: the preview card totals each
  // saved crab's own deal, falling back to the shack's rate then WAGE_STD.
  const savedWage = (p) => clampWage(p && p.wage != null ? p.wage
    : (s.wage && s.wage.shack != null ? s.wage.shack : WAGE_STD));
  const crewWages = Math.round((Array.isArray(s.personas) ? s.personas : [])
    .reduce((n, p) => n + savedWage(p), 0) * shiftLen / STD_SHIFT);
  const purse = (Array.isArray(s.personas) ? s.personas : [])
    .reduce((n, p) => n + Math.max(0, (p && p.wallet) || 0), 0);
  const boats = (Array.isArray(s.personas) ? s.personas : [])
    .concat(s.npc && Array.isArray(s.npc.personas) ? s.npc.personas : [])
    .filter(p => p && p.boat != null).length;
  const housed = (Array.isArray(s.personas) ? s.personas : [])
    .filter(p => p && !p.homeless).length;
  return { ver: SAVE_VER, day: d, weekday: WEEKDAYS[weekdayIdx(d)], won: !!s.won,
    coins: Math.round(s.coins || 0), rep: Math.round(s.rep != null ? s.rep : 30),
    pop: crew.length + npcN, crew, t: s.t || 0,
    debt: Math.round((s.credit && s.credit.bal) || 0),
    owned: owned.map(b => BIZ[b].short), nightly: rentDue + crewWages,
    purse: Math.round(purse), boats, housed,
    ups: Object.keys(lv).filter(k => (lv[k] || 0) > 0 && UPS[k] && UPS[k].max > 1)
      .map(k => UPS[k].name.split(" ")[0] + " x" + lv[k]) };
}
function readSlotEnv(i) {   // parsed + validated, or null - never a half-read
  let s = null;
  try { s = JSON.parse(localStorage.getItem(slotKey(i))); } catch (e) {}
  return s && !saveProblem(s) ? s : null;
}
// What the SAVED TOWNS screen draws for one row. The screen asks for all five
// every frame, so the parse is memoized against the raw string - a stale card
// is impossible (the string changes the moment the slot does) and a redraw
// costs five map lookups instead of five JSON.parse.
const _cardCache = {};
function slotCard(i) {
  let raw = null;
  try { raw = localStorage.getItem(slotKey(i)); } catch (e) {}
  const hit = _cardCache[i];
  if (hit && hit.raw === raw) return hit.card;
  let s = null;
  try { s = JSON.parse(raw); } catch (e) {}
  if (s && saveProblem(s)) s = null;
  const card = s ? (s._meta && Array.isArray(s._meta.crew) ? s._meta : slotMeta(s)) : null;
  _cardCache[i] = { raw, card };
  return card;
}
function writeSlotEnv(i, env) { localStorage.setItem(slotKey(i), JSON.stringify(env)); }
function clearSlot(i) { localStorage.removeItem(slotKey(i)); }
function setActiveSlot(i) { activeSlot = i; try { localStorage.setItem(ACTIVE_KEY, String(i)); } catch (e) {} }
function readActiveSlot() {
  let v = NaN;
  try { v = parseInt(localStorage.getItem(ACTIVE_KEY), 10); } catch (e) {}
  return v >= 1 && v <= SLOTS ? v : 1;
}
// One-time lift of the old single-key save into slot 1. The envelope is stored
// exactly as it was - nothing is dropped, nothing is reshaped - and only then
// is the legacy key retired, so a crash mid-migration costs nothing.
function migrateLegacy() {
  let raw = null;
  try { raw = localStorage.getItem(SAVE_KEY); } catch (e) {}
  if (raw == null) return false;
  let s = null;
  try { s = JSON.parse(raw); } catch (e) {}
  const ok = s && !saveProblem(s) && localStorage.getItem(slotKey(1)) == null;
  if (ok) { s._ver = SAVE_VER; s._meta = slotMeta(s); writeSlotEnv(1, s); }
  localStorage.removeItem(SAVE_KEY);
  return !!ok;
}
function save() {
  if (FRESH || wiping) return;
  const lv = {}; for (const k in UPS) lv[k] = UPS[k].lvl;
  const env = {
    coins, lifetime, lv, day, tmin, lastRentDay, gameOver, memorials, rep, townCatch, t: nowMs(),   // (no `rate`: nothing accrues offline)
    bankrupt, credit: { bal: Math.round(credit.bal), warned: credit.warned },
    won, winRec,   // the ferry ending, snapshotted: a reloaded win reads identically
    dayLog: (window.dayLog || []).slice(-6),   // keeps the forecaster warm across reloads
    personas: crabs.map(c => c.p),
    npc: { tills: { sudsy: OWNERS.sudsy.till },
      credit: { sudsy: { bal: OWNERS.sudsy.credit || 0, darkT: OWNERS.sudsy.darkT || 0,
        gone: OWNERS.sudsy.gone || 0 } },
      personas: npcs.map(c => c.p) },
    // OWNERSHIP IS DATA: the whole owner registry, who holds which lease, what
    // the player has bought off the market, and the live FOR SALE listings
    owners: (() => { const m = {}; for (const k in OWNERS) m[k] = { name: OWNERS[k].name,
      till: Math.round(OWNERS[k].till || 0), credit: Math.round(OWNERS[k].credit || 0),
      darkT: OWNERS[k].darkT || 0, soft: !!OWNERS[k].soft }; return m; })(),
    bizOwner: (() => { const m = {}; for (const k in BIZ) m[k] = bizOwner(k); return m; })(),
    bizBought: (() => { const m = {}; for (const k in BIZ) if (BIZ[k].bought) m[k] = true; return m; })(),
    market, bizTake, bizStrike,
    // THE TOWN HALL. The fund's balance and its stocked bowls are real money
    // and real food, so they ride in the envelope; the LEDGER does too, because
    // "who paid for that" losing its answer on a reload would be the one bug
    // this whole feature exists to prevent. The election record comes along so
    // a reloaded town can still show you why the crab in the hat is in it.
    fund: { bal: Math.round(townFund.bal * 100) / 100, bowls: townFund.bowls,
      strikes: townFund.strikes, shut: townFund.shut,
      arrears: Math.round(townFund.arrears * 100) / 100,
      served: townFund.served, cold: townFund.cold, wasted: townFund.wasted,
      ledger: townFund.ledger.slice(-24) },
    hall: { mayor: hall.mayor, policy: hall.policy, termDay: hall.termDay, poll: hall.poll,
      stand: hall.stand, nominee: hall.nominee, plat: hall.plat },
    board: jobBoard, hireDay, trade, sudsRefund: sudsRefunded, firstPour,
    musicOn, musNudges,
    hours: (() => { const h = {}; for (const k in BIZ) h[k] = [BIZ[k].hours.open, BIZ[k].hours.close]; return h; })(),
    mealPol: (() => { const m = {}; for (const k in BIZ) m[k] = BIZ[k].mealPol; return m; })(),
    tipShare: (() => { const m = {}; for (const k in BIZ) m[k] = BIZ[k].tipShare || 0; return m; })(),
    // THE PRICE: one multiplier per shop (1 = the board price in the recipe
    // table), plus the rivalry's whole state machine - see RIVAL_CFG
    price: (() => { const m = {}; for (const k in BIZ) m[k] = bizPriceMul(k); return m; })(),
    rival: rival,   // ...including her war chest, which is real money
    hotelier,       // ...and the hotelier: who she is, when she landed, what she has moved
    hoursPol: hoursPolicyState,
    // THE VISITORS MID-STAY. A visit spans nights, so it has to survive a
    // reload or "stay for a day or two" is a lie the moment you close the tab.
    // Only the visit is written - never the shop pipeline's live objects
    // (recipe, table, server): anybody who was standing in a line when you
    // saved is put back on the promenade, which is honest and cannot wedge.
    visitors: customers.filter(k => k.visitor && !k.gone).map(k => ({
      n: k.name, c: k.color, a: k.acc, x: Math.round(k.x), y: Math.round(k.wy),
      // ...and only the states that survive WITHOUT an errand attached: see
      // load(). A guest mid-walk is written down as roaming and re-decides.
      s: VIS_SAVE_STATES[k.state] ? k.state : "roam",
      w: Math.round(k.wallet), p: k.purse, sp: Math.round(k.spent),
      ni: k.nights, nh: k.nightsHad, rn: k.roughNights, un: k.unhoused,
      ar: k.arrived, lt: Math.round(k.leaveT), b: k.buys,
      rm: k.room ? hotelRooms().indexOf(k.room) : -1,
      hu: k.hunger, th: k.thirst, di: k.dirt, bo: k.bored, ti: k.tired,
      log: k.log || [],
    })),
    ferry: { t: Math.round(ferryT), sail: ferrySail, d: ferryDay },
    _vis: 1,   // "this save knows about the ferry" - see load()'s founder guard
    // THE WAGE: per-business rates here, per-crab deals (p.wage/p.wageOwner)
    // and grievance (p.gripe/p.wageJob/p.wageDay/p.walkout) inside the
    // personas above, and the CPU owners' move ledger.
    wage: (() => { const m = {}; for (const k in BIZ) m[k] = bizWage(k); return m; })(),
    wagePol: wagePolicyState,
    // labor policy: per-biz sick-day setting + auto-manage delegation, and the
    // auto-manager's cooldown ledger (per-crab ot/sickPol/restT ride along
    // inside the personas above)
    sickPol: (() => { const m = {}; for (const k in BIZ) m[k] = BIZ[k].sickPol; return m; })(),
    autoLabor: (() => { const m = {}; for (const k in BIZ) m[k] = !!BIZ[k].autoLabor; return m; })(),
    laborPol: laborPolicyState,
  };
  env._ver = SAVE_VER;
  env._meta = slotMeta(env);   // written at save time; re-derivable if it ever goes missing
  writeSlotEnv(activeSlot, env);
}
let sudsRefunded = false;   // laundromat-removal migration: refund paid out (persisted)
let firstPour = false;      // the juice bar's first-ever drink (persisted: one headline per town)
function load(slot) {
  if (FRESH) return false;
  const s = readSlotEnv(slot == null ? activeSlot : slot);
  if (!s) return false;
  if (!Array.isArray(s.personas) || !s.personas.length) return false;   // reject before touching state
  coins = s.coins || 0; lifetime = s.lifetime || 0;
  day = s.day || 1; tmin = s.tmin != null ? s.tmin : 7 * 60;
  lastRentDay = s.lastRentDay || 0;
  if (s.gameOver) { gameOver = true; screen = "play"; }
  bankrupt = !!s.bankrupt;
  // the ferry ending. An old save has neither field and is simply a town that
  // never bought her; a save that DID gets its card back, past the beat, with
  // the numbers it ended on (a corrupt/absent record falls back to live state).
  won = !!s.won;
  winRec = null;
  if (won && s.winRec && typeof s.winRec === "object") {
    const R = s.winRec;
    winRec = { day: Math.max(1, Math.round(+R.day || 1)),
      lifetime: Math.max(0, Math.round(+R.lifetime || 0)),
      crew: Array.isArray(R.crew) ? R.crew.filter(n => typeof n === "string").slice(0, 8) : [],
      pop: Math.max(0, Math.round(+R.pop || 0)), housed: Math.max(0, Math.round(+R.housed || 0)),
      hand: String(R.hand || "SOMEBODY").slice(0, 14) };
  }
  if (won) { gameOver = true; screen = "play"; winT = WIN_BEAT + 2; camX = clampCam(PIER_X0 - 96); }
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
  // OWNERSHIP first: the personas below carry p.owner, and those ids have to
  // resolve into the registry. Old saves have none of this - the defaults
  // above (SUDSY owns the showers, the player owns the rest) ARE the old world.
  if (s.owners) for (const k in s.owners) {
    const so = s.owners[k];
    if (!so || typeof so !== "object" || k === "player") continue;
    OWNERS[k] = { id: k, name: String(so.name || k).toUpperCase().slice(0, 12),
      till: Math.max(0, Math.round(+so.till || 0)), credit: Math.max(0, Math.round(+so.credit || 0)),
      darkT: Math.max(0, Math.min(9, +so.darkT || 0)),
      // a save written before willing sellers moved onto the owner: REEF was
      // the only one, and BIZ.sellable was the whole of it
      soft: so.soft != null ? !!so.soft : k === "reef" };
  }
  if (s.bizOwner) for (const b in s.bizOwner) {
    if (!BIZ[b]) continue;
    const o2 = s.bizOwner[b];
    if (o2 === null) BIZ[b].owner = null;                      // was on the market when they saved
    else if (o2 === "player" || OWNERS[o2]) BIZ[b].owner = o2;  // an unknown id would strand the lot: keep the default
  }
  if (s.bizBought) for (const b in s.bizBought) if (BIZ[b]) BIZ[b].bought = !!s.bizBought[b];
  bizTake = {};
  if (s.bizTake) for (const b in s.bizTake) if (BIZ[b] && Array.isArray(s.bizTake[b]))
    bizTake[b] = s.bizTake[b].slice(-3).map(v => Math.max(0, Math.round(+v || 0)));
  market = {};
  if (s.market) for (const b in s.market) {
    const m2 = s.market[b];
    if (!BIZ[b] || !m2 || !forSale(b)) continue;   // a listing only means anything for an unowned lot
    market[b] = { price: Math.max(1, Math.round(+m2.price || 0)) || askingPrice(b),
      day: Math.max(1, Math.round(+m2.day || 1)), why: String(m2.why || "bankrupt").slice(0, 12) };
  }
  bizStrike = {};
  if (s.bizStrike) for (const b in s.bizStrike) if (BIZ[b])
    bizStrike[b] = Math.max(0, Math.min(SALE_CFG.STRIKES - 1, Math.round(+s.bizStrike[b] || 0)));
  if (s.npc) {
    if (s.npc.tills && s.npc.tills.sudsy != null) OWNERS.sudsy.till = s.npc.tills.sudsy;
    if (s.npc.credit && s.npc.credit.sudsy) {
      OWNERS.sudsy.credit = s.npc.credit.sudsy.bal || 0;
      OWNERS.sudsy.darkT = s.npc.credit.sudsy.darkT || 0;
      OWNERS.sudsy.gone = s.npc.credit.sudsy.gone || 0;   // a shop whose owner died stays shut
    }
    // every townsfolk persona comes back (wallet, homeless, house), matched by
    // name; unmatched ones are drifters who moved to town mid-save - rebuild them
    if (Array.isArray(s.npc.personas)) for (const sp of s.npc.personas) {
      if (!sp) continue;
      const n = npcs.find(k => k.p.name === sp.name);
      if (n) {
        Object.assign(n.p, sp);
        clampLog(n.p);   // townsfolk skip newCrab on this path: bound their diary here
        if (sp.tired == null) n.p.tired = sp.sandy || 0;   // TIRED replaced SANDY (old townsfolk saves seed from it)
        delete n.p.sandy;
        if (n.p.job !== "fishing" && !BIZ[n.p.job]) { n.p.job = "fishing"; n.p.employer = null; }   // removed-business jobs: back to the pier
        delete n.p.homeX;   // pre-housing-market nook field
        if (n.p.boat != null && BOAT_BERTHS[n.p.boat] == null) n.p.boat = null;
        if (!n.p.homeless && n.p.boat == null && (n.p.house == null || HOUSE_XS[n.p.house] == null)) n.p.homeless = true;
        if (n.p.boat != null) n.fishSpot = boatSpot(n.p.boat);   // fish from their own deck
      } else {
        const c = newCrab(Object.assign({ npc: true }, sp));
        if (c.p.fisher) c.fishSpot = c.p.boat != null ? boatSpot(c.p.boat) : freeFishSpot();
        c.x = homeX(c); npcs.push(c);
      }
    }
    // THE DEAD STAY DEAD. initNpcs() has already stood SUDSY and the founding
    // fishers up before load() runs, so a townsfolk crab who died would walk
    // back out of the sea on the next reload. The saved persona list IS the
    // roll of the living: anybody missing from it is in the memorial row.
    // ...with ONE exception, and it is a migration rather than a loophole: a
    // save written before the hotel existed cannot possibly list REEF, and
    // deleting him would orphan a hotel that same save has never heard of.
    const preVis = !s._vis;
    if (Array.isArray(s.npc.personas))
      npcs = npcs.filter(n => (preVis && n.p.owner === "reef")
        || s.npc.personas.some(sp => sp && sp.name === n.p.name));
  }
  jobBoard = Array.isArray(s.board) ? s.board : [];
  // pre-toggle saves had music on by default - keep their experience
  musicOn = s.musicOn !== undefined ? !!s.musicOn : true;
  musNudges = (s.musNudges || 0) + 1;
  hireDay = s.hireDay || 0;
  // ---- THE TOWN HALL. Everything is clamped on the way in, because a save is
  // an untrusted file (see the importer): a bad mechanism falls back to Mr.
  // Pincherton's cut, a bad rate clamps to the table, and a ledger that is not
  // an array is simply an empty one. An OLD save has no hall at all and gets
  // the founding arrangement, seated below once the crabs exist.
  townFund = { bal: 0, bowls: 0, strikes: 0, shut: 0, arrears: 0,
    ledger: [], served: 0, cold: 0, wasted: 0, dayIn: 0, dayOut: 0, youPaid: 0, youGot: 0,
    potWhy: "ok" };
  hall = { mayor: null, policy: { mech: "rents", rate: 4, bowls: 2 }, termDay: 0, poll: null,
    stand: false, nominee: null, plat: { mech: "levy", rate: 2, bowls: 3 } };
  if (s.fund && typeof s.fund === "object") {
    townFund.bal = Math.max(0, +s.fund.bal || 0);
    townFund.bowls = Math.max(0, Math.min(POT_MAX, Math.round(+s.fund.bowls || 0)));
    townFund.strikes = Math.max(0, Math.min(SHELTER_STRIKES, Math.round(+s.fund.strikes || 0)));
    townFund.shut = Math.max(0, Math.min(SHELTER_SHUT_NIGHTS, Math.round(+s.fund.shut || 0)));
    townFund.arrears = Math.max(0, +s.fund.arrears || 0);
    townFund.served = Math.max(0, Math.round(+s.fund.served || 0));
    townFund.cold = Math.max(0, Math.round(+s.fund.cold || 0));
    townFund.wasted = Math.max(0, Math.round(+s.fund.wasted || 0));
    if (Array.isArray(s.fund.ledger)) townFund.ledger = s.fund.ledger
      .filter(r => r && typeof r === "object" && +r.amt >= 0)
      .slice(-24)
      .map(r => ({ day: Math.max(1, Math.round(+r.day || 1)),
        kind: r.kind === "pay" || r.kind === "remit" ? r.kind : "take",
        amt: Math.round((+r.amt || 0) * 100) / 100,
        who: String(r.who || "?").slice(0, 16), why: String(r.why || "").slice(0, 24) }));
  }
  if (s.hall && typeof s.hall === "object") {
    const H = s.hall, pol = H.policy || {};
    hall.mayor = typeof H.mayor === "string" ? H.mayor.slice(0, 14) : null;
    hall.policy = { mech: PURSES[pol.mech] ? pol.mech : "rents",
      rate: Math.max(0, Math.min(4, Math.round(+pol.rate || 0))),
      bowls: Math.max(0, Math.min(POT_MAX, Math.round(+pol.bowls || 0))) };
    hall.termDay = Math.max(0, Math.round(+H.termDay || 0));
    hall.stand = !!H.stand;
    hall.nominee = typeof H.nominee === "string" ? H.nominee.slice(0, 14) : null;
    const pl = H.plat || {};
    hall.plat = { mech: PURSES[pl.mech] ? pl.mech : "levy",
      rate: Math.max(0, Math.min(4, Math.round(+pl.rate || 0))),
      bowls: Math.max(0, Math.min(POT_MAX, Math.round(+pl.bowls || 0))) };
    if (H.poll && typeof H.poll === "object" && Array.isArray(H.poll.cands)) hall.poll = {
      day: Math.max(1, Math.round(+H.poll.day || 1)),
      winner: String(H.poll.winner || "").slice(0, 14), you: !!H.poll.you,
      turnout: Math.max(0, Math.round(+H.poll.turnout || 0)),
      cands: H.poll.cands.slice(0, 6).map(k => ({ name: String((k && k.name) || "").slice(0, 14),
        line: String((k && k.line) || "").slice(0, 28), votes: Math.max(0, Math.round(+(k && k.votes) || 0)) })),
      lines: (Array.isArray(H.poll.lines) ? H.poll.lines : []).slice(0, POLL_LINES).map(l => String(l).slice(0, 72)),
    };
  }
  if (s.trade && s.trade.total) trade = { total: Object.assign({ fish: 0, corn: 0, water: 0, power: 0, fruit: 0 }, s.trade.total),
    day: Object.assign({ fish: 0, corn: 0, water: 0, power: 0, fruit: 0 }, s.trade.day), spent: s.trade.spent || 0,
    landed: s.trade.landed || 0, landedDay: s.trade.landedDay || 0,
    // fish market state; pre-market saves open at the old $4 with a blank chart
    price: typeof s.trade.price === "number"
      ? Math.max(FISH_FLOOR, Math.min(FISH_IMPORT, Math.round(s.trade.price))) : FISH_START,
    useDay: s.trade.useDay || 0,
    landH: Array.isArray(s.trade.landH) ? s.trade.landH.slice(-3) : [],
    useH: Array.isArray(s.trade.useH) ? s.trade.useH.slice(-3) : [],
    ceilDays: s.trade.ceilDays || 0,
    series: Array.isArray(s.trade.series) ? s.trade.series.slice(-60) : [] };
  firstPour = !!s.firstPour;
  // business settings: hours + staff-meal policy + CPU policy state. Old
  // saves have none - the defaults above ARE the old behavior. setBizHours
  // clamps, so a degenerate save can't wedge a shop shut.
  if (s.hours) for (const b in s.hours)
    if (BIZ[b] && Array.isArray(s.hours[b])) setBizHours(b, +s.hours[b][0] || 0, +s.hours[b][1] || 0);
  if (s.mealPol) for (const b in s.mealPol)
    if (BIZ[b] && MEAL_POLS.includes(s.mealPol[b])) BIZ[b].mealPol = s.mealPol[b];
  // the wage settings. Old saves have none: every business opens on WAGE_STD,
  // which is exactly the flat rate they were playing with. clampWage keeps a
  // hand-edited or degenerate save inside the stepper's own band.
  if (s.wage) for (const b in s.wage)
    if (BIZ[b] && s.wage[b] != null) setBizWage(b, s.wage[b]);
  if (s.wagePol) for (const b in s.wagePol)
    if (BIZ[b] && s.wagePol[b]) wagePolicyState[b] = { cd: s.wagePol[b].cd || 0, lost: s.wagePol[b].lost || 0 };
  // tip sharing: an old save has none, and 0 is the old behavior. Clamped and
  // quantized on the way in, so a hand-edited 7.5 can't hand a crab 750%.
  if (s.tipShare) for (const b in s.tipShare)
    if (BIZ[b]) BIZ[b].tipShare = setTipShare(b, +s.tipShare[b] || 0);
  // THE PRICE: an old save has no key at all, and 1 is the old board price.
  // Clamped and 5%-snapped on the way in, so a hand-edited 9 can't charge $153
  // for a taco. The rivalry rides in beside it - see loadRival().
  for (const b in BIZ) BIZ[b].priceMul = 1;
  if (s.price) for (const b in s.price)
    if (BIZ[b] && s.price[b] != null) setBizPrice(b, +s.price[b]);
  loadRival(s.rival);
  loadHotelier(s.hotelier);
  if (s.hoursPol) for (const b in s.hoursPol)
    if (BIZ[b] && s.hoursPol[b] && Array.isArray(s.hoursPol[b].hist))
      hoursPolicyState[b] = { hist: s.hoursPol[b].hist.slice(-4), cd: s.hoursPol[b].cd || 0 };
  // labor policy. Old saves have none: the defaults above ARE the old
  // behavior (grant sick days, auto-manage off for the player / on for peers).
  if (s.sickPol) for (const b in s.sickPol)
    if (BIZ[b] && SICK_POLS.includes(s.sickPol[b])) BIZ[b].sickPol = s.sickPol[b];
  if (s.autoLabor) for (const b in s.autoLabor)
    if (BIZ[b]) BIZ[b].autoLabor = !!s.autoLabor[b];
  if (s.laborPol) for (const b in s.laborPol)
    if (BIZ[b] && s.laborPol[b]) laborPolicyState[b] = { cd: s.laborPol[b].cd || 0 };
  // THE VISITORS COME BACK. Rooms are re-linked by index (and the occupant
  // re-hung on the room, which is what makes "asleep upstairs" survive a
  // reload); anybody who was in a queue is stood back on the promenade with
  // their needs, their wallet and their diary intact. An old save has no
  // visitors at all and simply waits for the next ferry.
  customers = customers.filter(k => !k.visitor);
  if (Array.isArray(s.visitors)) for (const v of s.visitors) {
    if (!v || typeof v.n !== "string") continue;
    const k = newVisitor(false);
    k.name = String(v.n).toUpperCase().slice(0, 14);
    k.color = Math.max(0, Math.min(CRAB_COLORS.length - 1, +v.c || 0));
    if (ACC_KEYS.includes(v.a)) k.acc = v.a;
    k.x = Math.max(0, Math.min(WORLD_W, +v.x || 0));
    k.wy = Math.max(FLOOR_MIN, Math.min(FLOOR_MAX, +v.y || FLOOR_Y));
    k.state = VIS_SAVE_STATES[v.s] ? v.s : "roam";   // never an errand we cannot restore
    k.wallet = Math.max(0, Math.round(+v.w || 0)); k.purse = Math.max(1, Math.round(+v.p || k.wallet));
    k.spent = Math.max(0, Math.round(+v.sp || 0));
    k.nights = Math.max(0, Math.min(3, +v.ni || 0)); k.nightsHad = Math.max(0, +v.nh || 0);
    k.roughNights = Math.max(0, +v.rn || 0); k.unhoused = Math.max(0, +v.un || 0);
    k.arrived = Math.max(1, +v.ar || day); k.leaveT = +v.lt || (gnow() + 600);
    k.buys = Math.max(0, +v.b || 0);
    for (const [key, sk] of [["hunger", "hu"], ["thirst", "th"], ["dirt", "di"], ["bored", "bo"], ["tired", "ti"]])
      k[key] = Math.max(0, Math.min(1, +v[sk] || 0));
    k.log = Array.isArray(v.log) ? v.log.filter(e => Array.isArray(e) && e.length >= 4
      && typeof e[3] === "string").slice(-VIS_LOG_MAX)
      .map(e => [+e[0] || 1, +e[1] || 0, LOG_CATS[e[2]] ? e[2] : "life", e[3].slice(0, LOG_TEXT)]) : [];
    const ri = +v.rm;
    const rooms = hotelRooms();
    if (ri >= 0 && rooms[ri] && !rooms[ri].occupant) { k.room = rooms[ri]; rooms[ri].occupant = k; k.roomN = ri + 1; }
    else if (k.state === "inRoom" || k.state === "toRoom") k.state = "roam";
    if (k.state === "onSand") { k.rough = true; k.roughFlag = true; }
    k.spawnX = k.x; k.y = k.wy; k.biz = null; k.recipe = null;
    customers.push(k);
  }
  if (s.ferry) {
    ferryT = Math.max(0, Math.min(FERRY_STAY, +s.ferry.t || 0));
    ferrySail = Math.max(-1, Math.min(FERRY_TIMES.length - 1, s.ferry.sail == null ? -1 : +s.ferry.sail));
    ferryDay = Math.max(0, +s.ferry.d || 0);
  }
  // NO OFFLINE EARNINGS (owner, 2026-08-19: "eliminate that whole mechanic").
  // The town used to pay out for the hours the tab was closed - "WELCOME BACK!
  // THE CRABS MADE $35,000" - which is money nobody watched anybody earn, in a
  // game whose entire premise is watching crabs earn it. Nothing accrues while
  // you are away; the town is exactly where you left it.
  // ...and the office is never vacant: a save from before the town hall, or one
  // whose mayor has since left town, gets the founding arrangement seated now
  // that the crab list is real again.
  seatFoundingMayor();
  return true;
}

// ------------------------------------------------------- import / export
function saveFileName(i, m) {
  let stamp = "";
  try {
    const d = new Date(m.t || nowMs());
    if (isFinite(d.getTime())) {
      const pad = (n) => (n < 10 ? "0" : "") + n;
      stamp = "-" + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + "-" + pad(d.getHours()) + pad(d.getMinutes());
    }
  } catch (e) {}
  return "crabshack3-slot" + i + "-day" + m.day + stamp + ".json";
}
function exportSlot(i) {
  let raw = null;
  try { raw = localStorage.getItem(slotKey(i)); } catch (e) {}
  const m = slotCard(i);
  if (!raw || !m) { saveMsg = { text: "NOTHING IN SLOT " + i + " TO EXPORT", t: 4, bad: true }; return; }
  if (typeof Blob === "undefined" || typeof URL === "undefined" || !URL.createObjectURL) {
    saveMsg = { text: "THIS BROWSER CAN'T DOWNLOAD FILES", t: 5, bad: true }; return;
  }
  const url = URL.createObjectURL(new Blob([raw], { type: "application/json" }));
  // a real in-document anchor: Firefox ignores .click() on a detached one
  const a = (document.getElementById && document.getElementById("exportSave")) || document.createElement("a");
  a.href = url; a.download = saveFileName(i, m);
  if (a.click) a.click();
  setTimeout(() => { try { URL.revokeObjectURL(url); } catch (e) {} }, 4000);
  saveMsg = { text: "SAVED " + a.download, t: 6, bad: false };
}
// Parse + validate ONLY. Nothing is written to a slot and no game state is
// touched until the player confirms the target (commitImport).
function importJson(text, name) {
  let s = null;
  try { s = JSON.parse(text); } catch (e) { return "THAT FILE ISN'T JSON"; }
  const bad = saveProblem(s);
  if (bad) return bad;
  s._ver = SAVE_VER;
  s._meta = slotMeta(s);   // a hand-made or older file gets its card derived here
  pendingImport = { env: s, meta: s._meta, name: String(name || "") };
  return null;
}
function commitImport(i) {
  if (!pendingImport) return;
  // straight into the slot, envelope untouched: the migrations in load() run on
  // it exactly as they do for a save this build wrote itself
  writeSlotEnv(i, pendingImport.env);
  const d = pendingImport.meta.day;
  pendingImport = null;
  saveSel = i;
  saveMsg = { text: "IMPORTED A DAY " + d + " TOWN INTO SLOT " + i, t: 6, bad: false };
  sfx.ding();
}
{  // the hidden file input in index.html is the whole "upload" surface
  const fi = typeof document !== "undefined" && document.getElementById && document.getElementById("importSave");
  if (fi && fi.addEventListener) fi.addEventListener("change", (ev) => {
    const f = ev.target && ev.target.files && ev.target.files[0];
    ev.target.value = "";                  // so the same file can be picked twice
    if (!f) return;
    const r = new FileReader();
    r.onerror = () => { saveMsg = { text: "COULDN'T READ THAT FILE", t: 5, bad: true }; };
    r.onload = () => {
      const why = importJson(String(r.result), f.name);
      if (why) { pendingImport = null; saveMsg = { text: why, t: 6, bad: true }; sfx.angry && sfx.angry(); }
      else { saveMsg = null; saveView = true; }
    };
    r.readAsText(f);
  });
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
    if (offToday(c) && !c.p.sick && quipContext(c) === "home" && !isNight && tmin >= OFF_WAKE)
      lines = ["DAY OFF!", "BEACH DAY", "THE SAND'S ALL MINE", "NOT COOKING TODAY"];
    if (walkoutToday(c) && !c.p.sick && !isNight && tmin >= OFF_WAKE)
      lines = ["THEY'LL COPE", "I NEEDED THIS", "NOT TODAY", "SOMEONE ELSE'S TURN"];
    if ((c.p.bored || 0) >= WANDER_AT && !isNight && !walkoutToday(c))
      lines = ["SAME OLD SAME OLD", "IS IT HOME TIME", "NOTHING EVER HAPPENS", "I'D KILL FOR AN ARCADE"];
    if ((c.p.tired || 0) >= 0.8 && !isNight)
      lines = ["DEAD ON MY FEET", "SO... SLEEPY", "NEED MY BED"];
    if ((c.p.thirst || 0) >= 0.8 && !isNight)
      lines = ["PARCHED...", "SO DRY", "JUICE. PLEASE."];
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
  return effShift(c).start - commuteGmin(c) - 20 + late;
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
// THE WIDE BERTH, in the collider. Deliberately ASYMMETRIC and SIDEWAYS, and
// both of those are wedge guards rather than taste:
//   - only the CLEANER crab gives ground, so the filthy crab is never pushed
//     by the berth and can always reach its own station, queue or cot;
//   - the ground is given in Y (step around, toward whichever side of the
//     boardwalk has more room), so the passer-by keeps its forward progress
//     and the 1.5s no-progress watchdog never reads the bubble as a pin;
//   - it ADDS to the core 12px physics rather than replacing any of it, so
//     ordinary crab traffic is byte-for-byte what it always was (crabBerth is
//     0 below BERTH_AT, so a clean pair returns on the first line). It has to
//     run inside 12px as well as outside: the core push shrinks to nothing as
//     it approaches 12, so a pair resting AT the old radius would otherwise
//     never enter the bubble's range at all - measured, three crabs in a
//     staged huddle sat at exactly 12px and never got the berth.
// Suppressed at home and after dark: four crabs on shelter cots cannot each
// have two body-widths, and this is a boardwalk read, not a bedroom one.
// A crab standing in its station slot is exempt too - shoving a chef off the
// grill is not "the town parts for him", it is a bug.
function giveBerth(a, b, d, dt) {
  const ra = crabBerth(a), rb = crabBerth(b);
  const r = Math.max(ra, rb);
  if (r <= 0 || d >= 12 + r || window._noBerth) return;   // _noBerth: the paired-arm wedge probe
  const dirty = ra >= rb ? a : b, clean = ra >= rb ? b : a;
  if (darkness() > 0.6) return;
  if (dirty.dayState === "home" || clean.dayState === "home") return;
  if (clean.slotKind && clean.slot >= 0) return;
  let away = clean.y - dirty.y;
  if (Math.abs(away) < 1) away = (dirty.y - FLOOR_MIN < FLOOR_MAX - dirty.y) ? 1 : -1;
  const push = Math.min((12 + r - d) * 0.5 * Math.min(1, dt * 12), 3);
  clean.y = clampY(clean.y + Math.sign(away) * push);
  // a crab who is STANDING there also steps BACK, which is what gives the
  // bubble its width. Only a still crab: it has no forward progress to lose,
  // so the no-progress watchdog can never read this as a pin (the same
  // still-vs-mover distinction the core collider already makes).
  if (!clean._stepped) clean.x += Math.sign(clean.x - dirty.x || 1) * push;
}
// soft-radius separation + station bodies: nobody stands inside anybody
function collide(dt) {
  const bodies = [];
  for (const c of allCrabs()) {
    c._blocked = false;   // set again below by furniture deflections; read next frame
    if (!c.hidden && c.cstate !== "drive" && !c.errandCust) bodies.push(c);
  }
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
      if (d > 0.01 && d < 12 + BERTH_PX) giveBerth(a, b, d, dt);
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
          c._blocked = true;   // furniture is in the way: the bounce budget ticks
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
            c._blocked = true;
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
  // a commute that straddles midnight into a day off turns around - long walk
  // commutes (a fisher's is ~3 game-hours) can legally start before the day
  // flips and must not deliver anyone to work on their Sunday
  if (toWork && ((offToday(c) && !coveringToday(c)) || walkoutToday(c))) { startCommute(c, false); return; }
  const dest = toWork ? jobDoor(c) : homeX(c);
  // THE SHORTCUT HOME. Past ROUGH_AT, a crab with a real walk still ahead of
  // them simply does not make it. They stop where they are and sleep there -
  // and bank nothing for it (see updateHome). Only on the way HOME and only
  // after dark: nobody keels over on the morning commute.
  if (!toWork && !c.p.rough && !patOff("rough") && (c.p.tired || 0) >= ROUGH_AT
      && darkness() >= 0.5 && Math.abs(c.x - dest) > ROUGH_PX && !c.hidden
      && Math.random() < ROUGH_RATE * dt) {
    sleepRough(c);
    return;
  }
  const m = c.p.mode, tr = TRAITS[c.p.trait];
  const wspd = crabMove(c), vspd = MODES[m].speed * tr.move;

  if (tr.pauses && c.pauseT <= 0 && Math.random() < dt * 0.06) c.pauseT = 1.3;
  if (c.pauseT > 0) { c.pauseT -= dt; return; }

  if (c.cstate === "travel") {           // walking the whole way
    if (routedWalk(c, dest, 167, wspd, dt)) arriveCommute(c, toWork);
  } else if (c.cstate === "drive") {     // bike/buggy: ride to park spot, walk rest
    const b = BIZ[c.p.job];
    const park = toWork ? (m === "buggy" ? b.park + (c.p.house % 6) * 18 : b.rack + (c.p.house % 6) * 7) : homeX(c);
    if (stepTo(c, park, vspd, dt, 150)) {   // on the road, out of collide entirely
      if (toWork) { c.cstate = "walkFromPark"; }
      else arriveCommute(c, false);
    }
  } else if (c.cstate === "walkFromPark") {
    if (routedWalk(c, dest, 167, wspd, dt)) arriveCommute(c, true);
  } else if (c.cstate === "walkToVehicle") {   // heading home: fetch parked ride
    const b = BIZ[c.p.job];
    const park = m === "buggy" ? b.park + (c.p.house % 6) * 18 : b.rack + (c.p.house % 6) * 7;
    if (routedWalk(c, park, 150, wspd, dt)) c.cstate = "drive";
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
    if (routedWalk(c, dest, 167, wspd, dt)) arriveCommute(c, toWork);
  }
}

function arriveCommute(c, atWork) {
  if (atWork) {
    c.dayState = "working"; c.duty = true; c.kstate = "idle"; c.workBiz = c.p.job;
    c.tiredIn = c.p.tired || 0;   // how tired they turned UP: the thirst coupling reads this, not the shift's own accrual
    c.workedToday = true;   // wages follow actual work: a mid-day rota reshuffle (job-board hire) can't unpay a worked shift
    logClockIn(c);   // DIARY
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
    // day-off AND sick-day staff still count here: neither a rest day nor a
    // bout of flu is a vacancy, so a weekly closure or a granted sick day
    // never triggers the emergency HELP WANTED posting (that gate is for a
    // shop that has genuinely lost its people)
    const staff = allCrabs().filter(k => k.p.job === b).length;
    // THE POSTING ADVERTISES THE SHOP'S OWN RATE - it is the wage setting made
    // public, and it is what the fisher weighs against the water below.
    if ((o.till >= 260 && staff < 2) || (staff === 0 && o.till >= bizWage(b) * 2))
      jobBoard.push({ biz: b, wage: bizWage(b), day });
  }
  // the macro response: a fish price pinned at the ceiling for a full day is
  // the town asking for more fishers - the pier posts on the same board
  if ((trade.ceilDays || 0) >= 1 && !jobBoard.some(j => j.biz === "fishing") && npcs.length < 8)
    jobBoard.push({ biz: "fishing", wage: 0, day });
  for (const j of jobBoard.slice()) {
    if (j.biz === "fishing") {
      // nobody in town is free to take it (the jobless already fish), so the
      // posting reaches a drifter after a day on the board - who fishes for
      // themselves at market price, like every fisher
      if (trade.price < FISH_IMPORT) {
        jobBoard.splice(jobBoard.indexOf(j), 1);   // price came back down; so does the posting
      } else if (j.day < day && npcs.length < 8) {
        const hire = spawnDrifter();
        hire.quip = { text: "HEARD THE FISH ARE PAYING", t: 4 };
        jobBoard.splice(jobBoard.indexOf(j), 1);
      }
      continue;
    }
    // a free agent weighs the posting against the pier: a day's casting is
    // about five fish, so when that strictly beats the wage, nobody signs
    // (ties go to the steady paycheck - pier luck is still luck)
    j.wage = bizWage(j.biz);   // the board always shows today's rate, not the day it was pinned up
    const cands = trade.price * WAGE_CFG.FISH_DAY > j.wage ? [] :
      npcs.filter(k => k.p.fisher && k.p.job === "fishing" && !k.p.sick && !k.p.employer);
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
      crabLog(hire, "life", "TOOK THE " + BIZ[j.biz].short + " JOB - $" + j.wage + " A DAY", 0);   // DIARY
      today.moved.push(hire.p.name + " HIRED AT " + BIZ[j.biz].name);
      toast = { text: hire.p.name + " TOOK THE " + BIZ[j.biz].name + " JOB", t: 5 };
      popText("HIRED!", hire.x - 6, FLOOR_Y - 34, [140, 255, 160]);
      sfx.ding();
    }
  }
}
function spawnDrifter() {
  const p2 = makeCrabPersona((Math.random() * 12) | 0);
  p2.name = freeCrewName(p2.name);   // deduped across BOTH name pools (converted tourists live here too)
  Object.assign(p2, { npc: true, fisher: true, homeless: true, wallet: 12, job: "fishing", shift: "D", mode: "walk" });
  const c = newCrab(p2);
  c.fishSpot = freeFishSpot();   // a hole on the rail (somebody died, somebody took a job) gets filled first
  c.x = BUS_STOPS[0]; c.y = 158;   // stepped off the morning bus with one bag
  npcs.push(c);
  crabLog(c, "life", "GOT OFF THE MORNING BUS, NEW IN TOWN", 0);   // DIARY
  today.moved.push(c.p.name + " NEW IN TOWN");
  toast = { text: c.p.name + " GOT OFF THE BUS - NEW IN TOWN", t: 5 };
  return c;
}

// ---------------------------------------------------------------- hiring
// The directive: hiring must not make a house pop into existence. A hire is
// RECRUITED, not minted - preferably a tourist who's in town right now
// (their customer entity converts into a resident crab: same name, shell
// color, accessory - the guest you served yesterday joining the crew), else
// a new face answers the ad and rides in on the morning bus. Either way the
// hire completes immediately (they start working today), starts HOMELESS at
// the shelter like everyone else, and climbs the housing ladder on wages.
function freeCrewName(preferred) {
  const used = new Set(allCrabs().map(k => k.p.name));
  if (preferred && !used.has(preferred)) return preferred;
  return CRAB_NAMES.concat(CUSTOMER_NAMES).find(n => !used.has(n)) || preferred || "CRAB";
}
// alternate M/E like makeCrabPersona always did - but a hire starts TODAY,
// so if the parity shift is already over while the other still has hours,
// take the shift that can actually work
function hireShift() {
  const par = crabs.length % 2 === 0 ? "M" : "E";
  const oth = par === "M" ? "E" : "M";
  return (tmin >= SHIFTS[par].end - 30 && tmin < SHIFTS[oth].end - 30) ? oth : par;
}
// tourist -> resident: release everything the visit holds (abortErrand's
// checklist, tourist-side: stall, table + plate, any chef mid-claim), drop
// the customer entity from the queue, and stand a crew crab up in its place
function convertTourist(k) {
  if (k.room) { k.room.occupant = null; k.room.dirty = true; k.room = null; }   // they've checked out for good
  if (k.stall) { k.stall.occupant = null; k.stall.dirty = true; k.stall = null; }
  if (k.table) { k.table.occupant = null; k.table.dishes = 0; k.table = null; }
  for (const w of allCrabs()) if (w.cust === k) abortChef(w);   // unclaim a mid-prep order
  k.done = true; k.state = "leaving"; k.claimed = false;
  customers = customers.filter(q => q !== k);
  const p2 = makeCrabPersona(2 + ((Math.random() * 10) | 0));   // fresh trait/mode roll; identity comes from the tourist
  p2.name = freeCrewName(k.name);
  p2.color = k.color; p2.acc = k.acc;
  p2.shift = hireShift(); p2.homeless = true; p2.house = null;
  const c = newCrab(p2);
  c.x = k.x; c.y = 166;
  crabs.push(c);
  // the person you were watching is still the person you're watching
  if (followCust === k) { followCust = null; followIdx = crabs.length - 1; followNpc = null; }
  if (dossier === k) dossier = c;
  c.quip = { text: "I LIVE HERE NOW!", t: 3 };
  crabLog(c, "life", "TRADED A HOLIDAY FOR AN APRON - HIRED", 0);   // DIARY
  return c;
}
// THE PLAYER COMPETES FOR LABOUR TOO. The SHOP's hire is recruitment, not a
// vending machine: the ad carries the shack's advertised rate, and a recruit
// weighs it against the pier exactly as a fisher weighs a job-board posting -
// the same PIER_TOUGH discount, because a wage is steady and the water is not.
// INERT AT DEFAULTS BY CONSTRUCTION: the pier's claim tops out at
// FISH_IMPORT x FISH_DAY x PIER_TOUGH = 7 x 5 x 0.6 = $21, under WAGE_STD 23,
// so a shop on the standard rate can always hire. Undercut it and, on a day
// the fish are paying, nobody answers the ad.
function recruitBites(b) { return bizWage(b) >= pierClaim(); }
function hireCrew() {
  // a tourist mid-visit is the preferred recruit - they're right there in
  // the queue or at a table. Skip locals (k.isCrab: they have their own
  // lives) and anyone already walking out; prefer someone standing in line
  // over someone mid-shower
  const eligible = customers.filter(k => !k.isCrab && k.state !== "leaving" && k.state !== "outStall");
  const pick = eligible.find(k => k.state === "waiting" || k.state === "arriving")
    || eligible.find(k => k.state !== "showering" && k.state !== "toStall" && k.state !== "waitStall")
    || eligible[0];
  let c;
  if (pick) {
    c = convertTourist(pick);
    today.moved.push(c.p.name + " JOINED THE CREW (WAS VISITING)");
    toast = { text: c.p.name + " LOVED IT HERE - JOINED THE CREW!", t: 6 };
  } else {
    // nobody's visiting: the ad goes out and a new face answers, riding the
    // morning bus in - mechanically the hire completes now, so they walk
    // straight off the bus and into today's shift
    const p2 = makeCrabPersona(2 + ((Math.random() * 10) | 0));
    p2.name = freeCrewName(null);
    p2.shift = hireShift(); p2.homeless = true; p2.house = null; p2.mode = "walk";
    c = newCrab(p2);
    c.x = BUS_STOPS[0]; c.y = 158;   // one bag, one toque
    crabs.push(c);
    crabLog(c, "life", "ANSWERED THE AD AND RODE THE BUS IN", 0);   // DIARY
    today.moved.push(c.p.name + " JOINED THE CREW (OFF THE BUS)");
    toast = { text: c.p.name + " ANSWERED THE AD - JUST OFF THE BUS", t: 6 };
  }
  popText(c.p.name + " JOINS THE CREW!", c.x - 20, FLOOR_Y - 30, [140, 255, 160]);
  return c;
}

// ---------------------------------------------------------------- day schedule
function updateSchedule(c, dt) {
  const sh = effShift(c);   // own shift, or the long cover shift on a coworker's day off
  if (c.p.job !== "fishing" && !bizUnlocked(c.p.job)) c.p.job = "shack";
  if (!c.p.npc && c.p.job !== "fishing" && bizOwner(c.p.job) !== "player") c.p.job = "shack";   // crew can't staff NPC shops
  // one weekday in seven: no commute, no duty, no pay - and the same for a
  // crab who has walked out (B3). The rota's day off is scheduled and covered;
  // an unauthorised one is neither, which is exactly what makes it cost.
  const off = awayToday(c);
  // a granted sick day takes effect the MOMENT it is granted - a crab already
  // walking in (or already on the clock, because the boss just relented) turns
  // around and goes home. Without this the dossier's TAP: REST would only
  // work at dawn, and the day the illness lands mid-commute would be a
  // full shift worked while ill.
  if (onSickDay(c) && (c.dayState === "toWork" || c.dayState === "working")) {
    if (c.dayState === "working") { c.duty = false; c.pendingOff = false; abortChef(c); }
    crabLog(c, "life", "TOOK A SICK DAY AND WENT HOME", 1200);   // DIARY
    startCommute(c, false);
  }
  if (off && tmin >= OFF_WAKE && c.logOff !== day) { c.logOff = day; crabLog(c, "life", "TOOK THEIR DAY OFF", 0); }   // DIARY
  if (c.dayState === "home" && !off && tmin >= leaveGmin(c) && tmin < sh.end - 30 && !onSickDay(c)
      && !(c.restDay === day && c.restUntil > tmin)) {   // ordered home: a real break before the schedule re-dispatches
    startCommute(c, true);
  }
  if (c.dayState === "working") {
    c.workedToday = true;   // fisher or shopkeep alike: tonight's tired bump is earned, not blanket
    // overtime is measured, not assumed: minutes clocked in OUTSIDE the
    // contracted window are the ones that earn the premium, so a crab who
    // knocks off early is paid for what they actually did
    const ds = dutyShift(c);
    const onOT = otEligible(c) && (tmin < ds.start || tmin >= ds.end);
    if (onOT) c.otMin = (c.otMin || 0) + dt * TS;
    // TIREDNESS ACCRUES WHILE YOU WORK, not in a lump at knock-off. The TOTAL
    // is mathematically identical - TIRED_SHIFT / ownStdSpan per game-minute,
    // integrated across the shift, IS TIRED_SHIFT * workLoad, and the overtime
    // minutes still ride at OT_FATIGUE - so pay, the hours-scaling rule and
    // the cover-double arithmetic are all untouched. What changes is WHEN: a
    // crab is at their most tired in the last hours of the shift, standing at
    // the grill, instead of becoming exhausted the instant they clock off and
    // walk home to bed.
    //
    // This is the load-bearing half of "higher sleep requirements". Under the
    // old step model, tiredness DURING a shift was simply whatever you woke
    // up with - so the microsleep could only ever touch a crab who arrived
    // exhausted, and no sleep rate short of "no sleep at all" gets an ordinary
    // crew's MORNING reading to 0.85. Now the housing ladder decides it: off a
    // cot you wake around 0.5 and cross the nod line halfway through every
    // shift; out of your own bed you wake near 0.05 and never do.
    c.p.tired = Math.min(1, (c.p.tired || 0)
      + TIRED_SHIFT / ownStdSpan(c) * (onOT ? OT_FATIGUE : 1) * dt * TS);
  }
  if (c.dayState === "working" && tmin >= sh.end) c.pendingOff = true;
  if (c.dayState === "working" && c.pendingOff && c.kstate === "idle") {
    // last call: stick around while anyone's still waiting in the grace window
    const lingering = tmin < sh.end + 45 &&
      customers.some(k => k.biz === c.workBiz && k.state === "waiting" && !k.served);
    if (lingering) return;
    c.duty = false; c.pendingOff = false;
    if (c.carrying) c.carrying = null;
    // THE COST OF THE DAY, scaled by the hours worked. A flat bump was the
    // other half of the always-open exploit: 50% more staffed hours used to
    // cost 0% more crab. Two measures, and they differ on exactly one day:
    //   contract (shiftLoad) - today's shift against a standard day of that
    //     KIND, so a full-open cover double is one contracted day. Pay and
    //     appetite read this: you eat your meals and draw your wage as usual.
    //   work (workLoad)      - the same span against the crab's OWN standard,
    //     so a cover double is TWO shifts. Tiredness reads this: twelve hours
    //     on your claws is twelve hours, whoever's day off it filled.
    // Measured receipt for the split: putting hunger/thirst on the work
    // measure too spiked a covering crab to +0.5 hunger and a clamped 1.0
    // thirst, and they spent the evening running the errands their DAY OFF
    // is for - the days-off scenario fell from 3/4 crew shopping to 2/4.
    // `otF` is the overtime minutes on top, weighted at OT_FATIGUE for
    // tiredness because the last two hours are the ones that break you.
    // Under default hours with no cover this is byte-for-byte the old numbers.
    logShiftEnd(c);   // DIARY
    const load = shiftLoad(c), otF = (c.otMin || 0) / ownStdSpan(c);
    c.p.hunger = Math.min(1, (c.p.hunger || 0) + 0.25 * (load + otF));  // a shift works up an appetite - a long one, more
    // ...and thirst still reads how tired they were CLOCKING IN, never how
    // tired the shift left them. That is exactly what the old "checked
    // pre-bump" comment meant; now that tiredness accrues THROUGH the day it
    // has to be said with a field - c.tiredIn, stamped at arriveCommute. Same
    // rule, same firing rate, stated where it cannot drift.
    c.p.thirst = Math.min(1, (c.p.thirst || 0) + 0.35 * (load + otF) * ((c.tiredIn || 0) > 0.5 ? 1.5 : 1));  // working a whole shift ALREADY tired makes you thirsty
    // (the day's tiredness accrued through the shift itself - see the working
    //  branch of updateSchedule. The total is still TIRED_SHIFT * workLoad.)
    c.p.dirt = Math.min(1, (c.p.dirt || 0) + 0.25);      // and grubbies up the shell
    c.p.bored = Math.min(1, (c.p.bored || 0) + 0.2);     // all work and no play...
    // grab dinner on the way home instead of trekking back later (gated on
    // STAFFING, not hours: a staffed counter serves the after-shift crowd).
    // The staff meal counts too: refusing it here was the whole reason a crab
    // walked home across town at 15:00 and back to the same dark kitchen at
    // 20:00 to cook it - they are STANDING at the counter, let them eat.
    const e = !c.p.sick && pickErrand(c);
    if (!beginErrand(c, e, false)) startCommute(c, false);
  }
  // self-employed: a fisher answers to nobody - break for ANY need, whenever
  // they like (the old lunch-and-thirst-only gate was a command-economy patch
  // on a price problem). What pulls them back to the pier is the PRICE: at a
  // near-ceiling fish price a rational fisher lets the arcade wait - one
  // comparison, not a utility function. Hunger and thirst always walk;
  // crabs aren't robots. The errand machinery handles the trip; the home
  // branch re-commutes them to the pier afterward.
  if (c.p.job === "fishing" && c.dayState === "working" && !c.p.employer && c.errandCd <= 0) {
    // FULL freedom (the pressing-needs gate is gone - it was a command-economy
    // patch on a price problem). Price is what pulls them back to the rail.
    // NOTE: gated on STAFFING, not hours - the early crowd gets served while
    // the crew sets up (pre-hours behavior, kept bit-for-bit)
    const e = pickErrand(c);
    if (e && e.need === "food" && townCatch > 2) {
      c.errandCd = 3;   // lunch is in the crate - updateFishing roasts it at 0.55
    } else if (e && e.need === "fun" && trade.price >= FISH_IMPORT - 1) {
      // opportunity cost: skip the fun break while the water's paying
      if (c.priceQuipDay !== day) {
        c.priceQuipDay = day;
        c.quip = { text: "THE WATER'S MONEY TODAY", t: 3 };
      }
      c.errandCd = 8;
    } else if (e && !e.selfCook) {
      c.duty = false; c.errandCd = 6;
      c.dayState = "home";
      beginErrand(c, e, false);   // a fisher's water stop is the pier tap, ten paces off the rail
    } else c.errandCd = 3;
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
  // A SICK DAY IS NOT A SHIFT (Matt, 2026-08-19: "I feel like sick crabs dont
  // get food or clean or anything"). `off` deliberately excludes illness, so
  // that a sick crab does not get a day-off crab's SPENDING thresholds - they
  // are not on holiday. But it was also feeding the errand WINDOW, which meant
  // an ill crab sitting at home all day was treated as mid-shift and could not
  // leave the house between the morning commute and the end of a shift they
  // were not working. Measured: of every tick where a sick, broke, starving
  // crab was at home, 83 in 137 were refused by this window and NOT ONE ever
  // passed it. Their time is their own; the thresholds stay strict.
  const ownTime = off || !!c.p.sick;
  const errandWindow = ownTime ? tmin >= OFF_WAKE   // day off (or a sick day): the whole town is yours
    : (tmin < leaveGmin(c) - 30 || tmin >= sh.end);   // workday: before leaving, or after shift
  const townAwake = townOpen() || (tmin >= 20 * 60 && tmin < 23 * 60) || (tmin >= 5.5 * 60 && tmin < 8 * 60);
  if (c.dayState === "home" && townAwake && c.errandCd <= 0 && errandWindow) {
    const e = pickErrand(c);
    if (!beginErrand(c, e, true)) c.errandCd = 2;
  }
}

// ---------------------------------------------------------------- errands
function bizStaffed(b) { return bizUnlocked(b) && !bizDark(b) && allCrabs().some(k => k.duty && !k.pendingOff && k.workBiz === b); }
// ------------------------------------------------------------ trip-chaining
// Crabs used to pick an errand on need-priority alone and ignore the map
// completely - which is how you get "wake up, walk the promenade to work,
// then walk BACK past your own front door for breakfast". Now every stop the
// crab could make right now is scored
//
//     urgency / (1 + detour / DETOUR_SCALE)
//
// and the best one wins. The DETOUR is only what the stop ADDS to the walk
// this crab was going to make anyway:
//
//     detour = |here -> stop| + |stop -> anchor| - |here -> anchor|
//
// A stop that lies along the route is FREE (detour 0, full urgency); a stop
// the other way costs twice the backtrack. The anchor is wherever the trip
// ends regardless - the workplace while a shift is coming, otherwise home.
// One comparison per candidate, no path search, and imperfection survives:
// a genuinely desperate crab (need >= DIRE) still ignores the map entirely.
const ERRAND_RANK = { food: 4, drink: 3, clean: 2, fun: 1 };   // the old priority order, as a number
const DETOUR_SCALE = 400;   // px of added walking that halves a stop's appeal
const DETOUR_MAX = 900;     // ~half the promenade: not before a shift, it can wait
const DIRE = 0.9;           // this needy and geography stops mattering
const CHAIN_PX = 260;       // a second stop this close beats walking home and back out
function needLevel(c, need) {
  return need === "food" ? (c.p.hunger || 0) : need === "drink" ? (c.p.thirst || 0)
    : need === "clean" ? (c.p.dirt || 0) : (c.p.bored || 0);
}
// where this trip ends no matter what: the job while a shift is still coming
// (or under way), home the rest of the time
function anchorX(c) {
  const sh = effShift(c);
  const bound = !offToday(c) && !c.p.sick && tmin >= leaveGmin(c) - 60 && tmin < sh.end - 30
    && !(c.restDay === day && c.restUntil > tmin);
  return bound ? jobDoor(c) : homeX(c);
}
// where a candidate stop physically is: a tap post, a shop's own door (staff
// self-serve) or the public side of its counter
function errandStopX(e) {
  if (e.ball) return BALL_X;
  if (e.soup) return SOUP_X;
  if (e.tap != null) return WATER_TAPS[e.tap].x;
  const b = e.biz || "shack";
  return e.selfCook ? BIZ[b].door : BIZ[b].queueX;
}
function errandDetour(c, e) {
  const stop = errandStopX(e), a = anchorX(c);
  return Math.abs(c.x - stop) + Math.abs(stop - a) - Math.abs(c.x - a);
}
function errandScore(c, e) {
  const lvl = needLevel(c, e.need || "food");
  // APPEAL is what keeps free water from eating the juice bar: a tap scores at
  // half a bought drink's pull, so the counter wins whenever the crab can
  // reach and afford one. It never zeroes out, so the tap is always THERE.
  const ap = e.appeal != null ? e.appeal : 1;
  if (lvl >= DIRE) return ap * (99 + ERRAND_RANK[e.need]);   // desperate: walk it, wherever it is
  const d = errandDetour(c, e);
  // the "don't backtrack the whole promenade before 9 AM" rule: on the way
  // out to a shift, a stop clear across town waits for the trip home
  if (d > DETOUR_MAX && c.dayState === "home" && anchorX(c) !== homeX(c)) return -1;
  return ap * (ERRAND_RANK[e.need] + lvl) / (1 + d / DETOUR_SCALE);
}
function pickErrand(c) {
  const staffed = bizStaffed;
  const cand = [];
  const take = (e) => cand.push(e);   // gather every stop, then score - see errandScore
  // a day off is for spending: lower need thresholds, so the off crab eats
  // out, soaks, and finally gets that arcade morning their shift always ate.
  // Full retail, full queue rules - off crabs are customers, not staff.
  // ...and a WALK-OUT is a day off the crab granted themselves, so it spends
  // like one: the crab who walked out because they were bored out of their
  // shell will absolutely spend it at the arcade, if the town has one.
  const off = awayToday(c) && !c.p.sick;
  const wantFood = (c.p.hunger || 0) >= (off ? 0.4 : 0.5);
  // restaurant staff privilege: cook your own meal when the kitchen is
  // unstaffed. Charged per the shop's staff-meal POLICY (management screen):
  // RETAIL by default, AT COST or FREE if the owner says so.
  if (wantFood && !staffed("shack") && c.p.job === "shack" && !c.p.npc) {
    const affordable = BIZ.shack.recipes.filter(r => c.p.wallet >= staffMealCharge("shack", r) + 2);
    if (affordable.length) {
      affordable.sort((a, b) => a.pay - b.pay);
      const r = c.p.wallet > 40 ? affordable[(Math.random() * affordable.length) | 0] : affordable[0];
      take({ selfCook: true, recipe: r, need: "food" });
    }
  }
  if (wantFood && staffed("shack")) {
    const affordable = BIZ.shack.recipes.filter(r => c.p.wallet >= localPrice("shack", r) + 2);
    if (affordable.length) {
      // treat yourself when flush, eat cheap when broke
      affordable.sort((a, b) => a.pay - b.pay);
      const r = c.p.wallet > 40 ? affordable[(Math.random() * affordable.length) | 0] : affordable[0];
      take({ biz: "shack", recipe: r, need: "food" });
    }
  }
  // thirst sits between food and clean: cheap, casual, frequent. The juice
  // bar is the spot when staffed; the shack pours its own juice otherwise -
  // and staff can pour their own at a dark bar, charged retail like meals
  // THE BALL IS THE LAST WORD ON FUN. Gathered after any arcade this crab
  // could actually afford and get into, for the reason the shelter pot proved:
  // a free option beside a paid one takes the takings rather than the need.
  // Before the arcade is built - which is most of the early game - it is the
  // only answer boredom has that is not a very expensive chat.
  // ...and the bar to JOIN one is lower than the bar to start one. A crab who
  // would not walk out to the middle of the beach on their own will absolutely
  // wander over to a game already happening, which is both true to life and
  // the only way pairs stop being a coincidence.
  const ballAt = ballPlayers().some(k => k.ballT > 0) ? BALL_JOIN : BALL_AT;
  // NOBODY PLAYS BALL PARCHED. `boredYields` defers at 0.8, which is the right
  // bar for a 10-second chat you fall into on the way home and much too lax
  // for twelve seconds stood in the middle of the beach: measured, 447 of
  // ~3100 ticks at the ball were crabs already past 0.6 thirst, and SUDSY
  // spent 31% of her life on the dehydration line because of it. A game is
  // what you do when nothing else is wrong.
  // FUN IS THE LOWEST NEED, so the ball yields to each of the others AT THAT
  // NEED'S OWN BAR - the exact point the crab would have gone and dealt with
  // it. Thirst 0.45 is where a drink becomes an errand, hunger 0.50 where a
  // plate does, dirt 0.66 where the showers do. Tuning these as one number
  // (0.55 for everything) still left SUDSY 27% of her life on the dehydration
  // line, because 0.45-0.55 thirst is precisely the window where she wanted a
  // drink and went to play instead.
  const ballYields = (c.p.thirst || 0) >= 0.45 || (c.p.hunger || 0) >= 0.50
    || (c.p.tired || 0) >= BALL_YIELD || (c.p.dirt || 0) >= 0.66;
  // AND YOU DO NOT PLAY BALL ON THE CLOCK. pickErrand also serves the
  // on-shift paths - the fisher's break, the walk home past the counter - and
  // letting a game in there took its twelve seconds out of the working day of
  // whoever had the least to spare. Measured: SUDSY, an owner-operator on a
  // ten-hour day, went from 18.7% of her life on the dehydration line to 25%,
  // because the minutes the ball spent were the same minutes she drinks in.
  // Leisure is for crabs who are actually off.
  // ...AND NOT WITH A SHIFT COMING UP. A game is ~48 game-minutes once you
  // count the walk out and back, and the errand window only holds errands off
  // for the last 30 - so a crab could start one 35 minutes before leaving and
  // turn up late. That is not a cosmetic problem: a late crab is an UNSTAFFED
  // COUNTER, and the rivalry scenario measures exactly that (matching a
  // rival's price cut stopped winning share back, because the bar kept opening
  // late). Play when your day is actually done, or on a day off.
  const shEnd = effShift(c).end;
  const ballFree = !c.duty && c.dayState !== "working"
    && (awayToday(c) || tmin >= shEnd || tmin + BALL_LEAD < leaveGmin(c));
  if ((c.p.bored || 0) >= ballAt && (c.ballCd || 0) <= 0 && !boredYields(c) && !ballYields
      && ballFree && !c.p.sick && ballHasRoom(c) && !cand.some(e2 => e2.need === "fun"))
    take({ ball: true, need: "fun",
      // A GAME IN PROGRESS PULLS. Left to pure coincidence only 3 of 22 games
      // had two crabs in them; somebody already out there throwing is the
      // whole difference between 0.22 of relief and 0.08, so it should be
      // worth crossing the beach for.
      appeal: TAP_APPEAL * (ballPlayers().length ? 2.4 : 1) });
  if ((c.p.thirst || 0) >= 0.45) {
    const drinkAt = staffed("juicebar") ? "juicebar" : staffed("shack") ? "shack" : null;
    if (drinkAt) {
      const drinks = BIZ[drinkAt].recipes.filter(r => DRINKS[r.id] && c.p.wallet >= localPrice(drinkAt, r) + 2);
      if (drinks.length) {
        drinks.sort((a, b) => a.pay - b.pay);
        const r = c.p.wallet > 40 ? drinks[drinks.length - 1] : drinks[0];   // a COOLER when flush
        take({ biz: drinkAt, recipe: r, need: "drink" });
      }
    } else if (!c.p.npc && (c.p.job === "shack" || c.p.job === "juicebar")
        && bizUnlocked(c.p.job) && !staffed(c.p.job)) {
      const drinks = BIZ[c.p.job].recipes.filter(r => DRINKS[r.id] && c.p.wallet >= staffMealCharge(c.p.job, r) + 2);
      if (drinks.length) {
        drinks.sort((a, b) => a.pay - b.pay);
        take({ selfCook: true, biz: c.p.job, recipe: drinks[0], need: "drink" });
      }
    }
    // ...and THE TAP, for everyone: crew, townsfolk, owner-operators, fishers.
    // No staffing gate, no wallet gate, no shop hours - the whole point is
    // that this stop can never be unavailable. Both posts are offered and the
    // detour score picks the near one.
    if ((c.p.thirst || 0) >= TAP_AT)
      for (let i = 0; i < WATER_TAPS.length; i++) take({ tap: i, need: "drink", appeal: TAP_APPEAL });

  }
  // dirt is serviced at the showers too (the laundromat is gone): a grubby
  // crab heads for the taps at the same 0.66 threshold that fed the sickness
  // "cared" check - a shower takes dirt down 0.5 (0.7 deluxe), well below it
  const needsBath = (c.p.dirt || 0) >= (off ? 0.5 : 0.66)
    || (c.p.sick && (c.p.dirt || 0) >= 0.4);   // the sick drag themselves to the taps - staying clean is the cure
  // ON DUTY at the stalls, not "has ever worked a shift here": this gate used
  // to read c.workBiz, which is set at clock-in and NEVER CLEARED, so the
  // shower attendant was barred from her own stalls for life. SUDSY's dirt
  // pinned at 1.00 every seed - a -6% crabEff, -30% on every tip and +0.06
  // sickness a night, forever. The gate only ever meant "don't take a stall
  // while you're the one handing out the kits".
  const rinseR = BIZ.showers.recipes[c.p.wallet > 40 ? 1 : 0];   // deluxe soak when flush
  const showerOpen = staffed("showers") && !(c.duty && c.workBiz === "showers");
  const canShower = showerOpen && c.p.wallet >= localPrice("showers", rinseR) + 2;
  if (needsBath && canShower) take({ biz: "showers", recipe: rinseR, need: "clean" });
  // THE STANDPIPE RINSE - the SAFETY NET, not a free shower. Cold water, no
  // soap, no towel: -0.35 against a $5 rinse's -0.5, pitched far above the
  // shower threshold (0.85 vs 0.66), and offered ONLY to a crab the market
  // cannot serve right now - nobody on the stalls, no money in the pocket, or
  // they ARE the attendant. A crab who could walk into a staffed shower with
  // the fare in hand has no business hosing off in the street, and SUDSY's
  // takings should not pay for this fix. What it does buy is fairness: no
  // crab is pinned on the 0.95 sickness line by an environment that has no
  // route to soap - which is the ground the death roll now stands on.
  if (!canShower && (c.p.dirt || 0) >= (c.p.sick ? TAP_RINSE_SICK : TAP_RINSE_AT))
    for (let i = 0; i < WATER_TAPS.length; i++) take({ tap: i, need: "clean", appeal: TAP_APPEAL });
  // THE SHELTER POT IS A FLOOR UNDER ILLNESS, and it is deliberately narrow:
  // SICK crabs only, offered LAST, only when the town has nothing to sell them
  // right now, and only when the fund actually bought a bowl last night. Every
  // one of those limits was measured, not guessed.
  //   - SICK ONLY: with the pot open to anybody, growth fell to 1/8 + 1/8; ill
  //     only, it read 2/8 + 2/8 against the build's 2/8 + 3/8 - and the ill end
  //     up BETTER fed (mean hunger 0.434 vs 0.514), because the well keep the
  //     counters busy instead of queueing here.
  //   - LAST: an earlier cut offered it alongside the counter and the player's
  //     own crew ate at the shelter instead of buying a plate.
  //   - NOT MEANS-TESTED: the crabs who starved right through an illness worked
  //     at the SHOWERS or the HOTEL and mostly HAD money - they starved because
  //     nothing was open to sell them food. (Every crab who came through fine
  //     was a fisher, who roasts their own catch.)
  //   - FUNDED: potWarm() is the whole charity system in one predicate. No
  //     bowls in the pot, no bowl for you.
  // What a WELL crab who cannot afford lunch gets is nothing, on purpose: work
  // pays, and the player already has a lever for it - the staff meal policy.
  {
    const at = c.p.sick ? SOUP_SICK_AT : SOUP_AT;
    if (c.p.sick && potWarm() && (c.p.hunger || 0) >= at && !cand.some(e2 => e2.need === "food"))
      take({ soup: true, need: "food", appeal: TAP_APPEAL });
  }
  // bed rest otherwise: no arcade nights while ill
  if (!c.p.sick && (c.p.bored || 0) >= (off ? 0.35 : 0.6) && staffed("arcade")) {
    const r = BIZ.arcade.recipes[c.p.wallet > 40 ? 2 : 1];   // splurge on game night when flush
    if (c.p.wallet >= localPrice("arcade", r) + 2) take({ biz: "arcade", recipe: r, need: "fun" });
  }
  let best = null, bestScore = 0;   // the chaining pick: best urgency per unit of detour
  for (const e of cand) {
    const s = errandScore(c, e);
    if (s > bestScore) { bestScore = s; best = e; }
  }
  return best;
}
function startSelfCook(c, e) {
  c.dayState = "selfCook"; c.cookStep = 0; c.cookRecipe = e.recipe;
  c.cookBiz = e.biz || "shack"; c.cookNeed = e.need || "food";
  const s0 = sourceSpot(c.cookBiz, c); setT(c, s0.x, s0.y);   // same rule for a staff meal
}
function updateSelfCook(c, dt) {
  const sb = c.cookBiz || "shack", wk = sb === "juicebar" ? "juicer" : "grill";
  if (c.cookStep === 0) {                      // to the source bin: ring yourself up first
    if (routedStep(c, crabMove(c), dt)) {
      const r = c.cookRecipe;
      const pay = staffMealCharge(sb, r);   // the shop's meal policy sets the price (retail/at-cost/free)
      c.p.wallet = Math.max(0, c.p.wallet - pay);
      if (pay > 0) creditBiz(sb, pay, c.x, FLOOR_Y - 40);      // the charge into the till
      debitBiz(sb, ingredientCost(r.raw), c.x, FLOOR_Y - 34);  // till buys the ingredients either way
      consumeIngredient(r.raw, r);
      if (window._stats) {
        window._stats.staffMealPaid = (window._stats.staffMealPaid || 0) + pay;
        window._stats.staffMealCost = (window._stats.staffMealCost || 0) + INGREDIENT_COST[r.raw];
        window._stats.lastStaffMeal = { id: r.id, pay, cost: INGREDIENT_COST[r.raw] };
      }
      c.carrying = r.raw; c.cookStep = 1; c.workT = 0.6;
    }
  } else if (c.cookStep === 1) {               // grab
    c.workT -= dt;
    if (c.workT <= 0) {
      const g = tryAcquire(sb, wk);
      if (g >= 0) {
        c.slotKind = wk; c.slot = g;
        const sp = stationSpot(sb, wk, g); setT(c, sp.x, sp.y);
        c.workBiz = sb; c.cookStep = 2;
      }
    }
  } else if (c.cookStep === 2) {               // to the grill (or the juicer)
    if (routedStep(c, crabMove(c), dt)) { c.workT = c.cookNeed === "drink" ? 1.5 : 3; c.cookStep = 3; }
  } else if (c.cookStep === 3) {               // cook + eat (or blend + drink)
    c.workT -= dt;
    if (c.workT <= 0) {
      release(c); c.carrying = null;
      if (c.cookNeed === "drink" || DRINKS[c.cookRecipe.id]) c.p.thirst = 0;
      if (c.cookNeed !== "drink") c.p.hunger = 0;
      c.cookStep = 0;
      popText(c.cookNeed === "drink" ? "STAFF POUR!" : "STAFF MEAL!", c.x - 8, FLOOR_Y - 30, [140, 255, 160]);
      if (window._stats) window._stats.staffMeals = (window._stats.staffMeals || 0) + 1;
      c.quip = { text: c.cookNeed === "drink" ? "BARKEEP'S PRIVILEGE" : "CHEF'S PRIVILEGE", t: 2.4 };
      crabLog(c, "need", c.cookNeed === "drink" ? "POURED THEMSELVES A DRINK AT WORK"   // DIARY
        : "COOKED THEMSELVES A STAFF MEAL", 0);
      c.errandCd = 25; c.dayState = "home";
      startCommute(c, false);
    }
  }
}
function startErrand(c, e) {
  c.dayState = "toErrand"; c.errandBiz = e.biz; c.errand = e;
  c.p.tired = Math.min(1, (c.p.tired || 0) + TIRED_ERRAND);   // errand legwork tires, a little
  // WALK TO THE BACK OF THE LINE. Aiming at the counter meant a local coming
  // from the east walked THROUGH everybody already queued, reached the window,
  // and only then slid back out to their own place - which is the one thing
  // that reads worse than a huddle, because it reads as pushing in. The line's
  // far end is where a newcomer stands, and aiming at the SLOT rather than
  // four pixels past it (the old queueX + 4) means that if the line is the
  // same length when they get there - the common case - they walk straight
  // into their place and never shuffle at all.
  setT(c, queueSlotX(e.biz, queueLen(e.biz)), 166);
}
// A STOP AT THE TAP. No queue entity, no till, no staff to wait on - walk up,
// use it, walk on. Deliberately its own tiny state so nothing in the customer
// pipeline has to learn about a stop that never pays anybody.
function startTapStop(c, e) {
  c.dayState = "atTap"; c.tapStop = e; c.tapT = 0;
  c.p.tired = Math.min(1, (c.p.tired || 0) + TIRED_ERRAND);
  setT(c, e.soup ? SOUP_X : WATER_TAPS[e.tap].x + 6, 163);
}
function updateTap(c, dt) {
  const e = c.tapStop;
  if (!e) { c.dayState = "home"; return; }
  if (c.tapT <= 0) {                      // still walking over
    if (routedStep(c, crabMove(c), dt)) c.tapT = e.soup ? SOUP_MINS : TAP_SIP;
    return;
  }
  c.tapT -= dt;
  if (c.tapT > 0) return;
  if (e.soup) {
    // ...and the bowl only exists if the fund bought one. A crab who walked
    // the promenade to a COLD POT gets nothing and says so - which is the
    // failure mode the player is meant to see happen to somebody by name.
    if (!takeBowl(c)) {
      crabLog(c, "peril", "THE SHELTER POT WAS COLD", 0);   // DIARY
      popText("THE POT IS COLD", c.x - 16, FLOOR_Y - 30, [190, 80, 80]);
      c.quip = { text: ["NOTHING LEFT", "NOT A DROP", "MAYBE TOMORROW"][(Math.random() * 3) | 0], t: 2.6 };
    } else {
      c.p.hunger = Math.max(0, (c.p.hunger || 0) - SOUP_FILL);
      crabLog(c, "need", "ATE AT THE SHELTER POT", 0);   // DIARY
      popText("SHELTER POT", c.x - 14, FLOOR_Y - 30, [255, 210, 140]);
      c.quip = { text: ["THIN, BUT HOT", "BEATS NOTHING", "MUCH OBLIGED"][(Math.random() * 3) | 0], t: 2.4 };
    }
  } else if (e.need === "clean") {
    c.p.dirt = Math.max(0, (c.p.dirt || 0) - TAP_RINSE);
    crabLog(c, "need", "RINSED OFF AT " + WATER_TAPS[e.tap].name, 0);   // DIARY
    popText("RINSED OFF", c.x - 12, FLOOR_Y - 30, [150, 210, 255]);
    c.quip = { text: "COLD! BUT CLEANER", t: 2.4 };
    if (window._stats) window._stats.tapRinses = (window._stats.tapRinses || 0) + 1;
  } else {
    c.p.thirst = Math.max(0, (c.p.thirst || 0) - TAP_QUENCH);
    crabLog(c, "need", "DRANK AT " + WATER_TAPS[e.tap].name, 0);   // DIARY
    popText("FREE WATER", c.x - 12, FLOOR_Y - 30, [150, 210, 255]);
    c.quip = { text: ["GLUG GLUG", "THAT'LL DO", "STRAIGHT FROM THE TAP"][(Math.random() * 3) | 0], t: 2.4 };
    if (window._stats) window._stats.tapDrinks = (window._stats.tapDrinks || 0) + 1;
  }
  c.tapStop = null; c.tapT = 0; c.errandCd = e.soup ? SOUP_CD : TAP_CD;
  c.dayState = "home";
  afterErrand(c, true);   // free water is a stop like any other: chain on from it
}
// One door for every kind of stop pickErrand can hand back: a counter, your
// own kitchen, or a tap. Returns false if the stop can't be started right now.
// (requireOpen mirrors the old call sites exactly: the after-shift grab is
// STAFFING-gated, not hours-gated - bit-identity depends on that - while the
// at-home dispatch checks the shop's hours. A tap has neither.)
function beginErrand(c, e, requireOpen) {
  if (!e) return false;
  if (e.ball) { startBallStop(c); return true; }
  if (e.soup || e.tap != null) { startTapStop(c, e); return true; }
  if (e.selfCook) { startSelfCook(c, e); return true; }
  if (requireOpen && !bizOpenNow(e.biz)) return false;
  startErrand(c, e);
  return true;
}
// Where to head when an errand ends. Two rules, both about not walking the
// promenade twice:
//   1. CHAIN - if another stop worth making is right here (small detour off
//      the way home / to work), do it now rather than walk home, come back
//      out and cross town again. Two stops to an outing, then the schedule
//      takes over; imperfection is charming, a third lap is not.
//   2. GO WHERE THE TRIP WAS GOING - if a shift is coming (or under way),
//      carry on to WORK. This used to be a fisher-only shortcut (the pier
//      pays, and the old home-then-pier round trip measured at hours of lost
//      casting); it is the same argument for everyone, and it is what turns
//      "eat, walk all the way home, turn around, walk back past the shack"
//      into "eat on the way in".
function afterErrand(c, chain) {
  const sh = effShift(c);
  if (chain && !c.p.sick && (c.chainN || 0) < 2) {
    const e = pickErrand(c);
    // three kinds of free stop now - the taps, the shelter pot and the beach
    // ball - and none of them is "the same stop" as a shop counter
    const free = (x) => !!x && (x.ball || x.soup || x.tap != null);
    const sameStop = e && (free(e) ? false : e.biz === c.errandBiz);
    if (e && !e.selfCook && !sameStop && (free(e) || bizOpenNow(e.biz))
        && errandDetour(c, e) <= CHAIN_PX) {
      c.chainN = (c.chainN || 0) + 1; c.errandCd = 0;
      if (e.ball) startBallStop(c);
      else if (e.soup || e.tap != null) startTapStop(c, e);
      else startErrand(c, e);
      return;
    }
  }
  c.chainN = 0;
  if (!offToday(c) && !c.p.sick && tmin >= leaveGmin(c) && tmin < sh.end - 30 &&
      !(c.restDay === day && c.restUntil > tmin)) startCommute(c, true);
  else startCommute(c, false);
}
function updateErrand(c, dt) {
  if (c.dayState === "toErrand") {
    // THE LINE IS ALIVE WHILE YOU WALK TO IT. startErrand aims at the back of
    // the line as it stood when the crab set off; three guests can form up in
    // the time it takes to cross the promenade, and a fixed aim then lands the
    // crab inside whoever is standing there. Re-aim only when the tail has
    // actually moved (a shop's line changes a handful of times an hour, not
    // every frame), so this is a comparison per crab and nothing re-plans.
    const tail = queueSlotX(c.errandBiz, queueLen(c.errandBiz));
    if (c.tx !== tail) setT(c, tail, 166);
    if (routedStep(c, crabMove(c), dt)) {
      // the 5-slot line is a hard cap for locals too: full line, come back later
      const q = customers.filter(k => k.biz === c.errandBiz && (k.state === "waiting" || k.state === "arriving")).length;
      if (q >= QUEUE_MAX) {
        c.quip = { text: "LINE'S TOO LONG", t: 2.4 };
        c.errandCd = 12; c.dayState = "home";
        afterErrand(c, false);   // no chaining off a bounced queue: you never got served
        return;
      }
      const cust = { biz: c.errandBiz, recipe: c.errand.recipe, isCrab: true, crab: c,
        need: c.errand.need, x: c.x, spawnX: c.x, state: "waiting",
        patience: 90, maxPatience: 90, claimed: false, served: false, server: null };   // locals will wait
      queueJoin(cust);   // a neighbour takes their ticket like anybody else
      customers.push(cust); noteArrival(c.errandBiz);
      c.errandCust = cust; c.dayState = "errand";
    }
  } else if (c.dayState === "errand") {
    const k = c.errandCust;
    if (!k) { c.dayState = "home"; afterErrand(c, false); return; }
    const open = allCrabs().some(w => w.duty && w.workBiz === k.biz &&
      (!w.pendingOff || tmin < effShift(w).end + 45));
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
    if (!k.served) crabLog(c, "peril", "QUEUED AT THE " + BIZ[k.biz].name + " AND GAVE UP", 0);   // DIARY
    if (!k.served) c.quip = { text: "LINE WAS TOO LONG", t: 2.4 };
    c.dayState = "home";
    afterErrand(c, k.served);   // a served crab may chain on; a rage-quit just leaves
  }
}

// ---------------------------------------------------------------- kitchen (CS1 port)
function stationSpot(bizKey, kind, slot) {
  const xs = BIZ[bizKey].stations[kind];
  const st = xs[slot] != null ? xs[slot] : xs[0];
  return { x: st.x + 2, y: st.y + 7 };   // stand just in front of the appliance
}
// TWO CHEFS, ONE CRATE. Every crab that claims an order walks to source slot
// ZERO - the same pixel - and the source is the one station nothing acquires,
// so when two of them converge on it they simply shove each other off it. The
// standoff is invisible to every guard we have: the crab is three pixels short
// of its target, which is inside STUCK_FAR, so the no-progress watchdog reads
// it as "arrived" and the bounce budget never ticks because no FURNITURE is in
// the way. Measured on seed 4242, two shack chefs, 28 seconds nose to nose.
// So the second crab stands a body-width BEHIND the first, out on the walkway
// where no counter band reaches - the same "everybody gets their own place"
// rule the line outside the window is built on. It cannot deadlock: the crab
// on the spot is never the one that yields, and the pickup happens on arrival
// at whatever spot the crab was sent to.
// SCOPED AS TIGHTLY AS THE FAULT: only a crab working THIS shop counts, and
// only one actually STANDING on the spot. A passer-by on the boardwalk must
// never push an attendant off her own counter - a wider test cost SUDSY her
// drink window and took her time on the dehydration line from 10% to 36% - and
// this way a ONE-STAFF shop is bit-identical to the shipped build, because
// there is never anybody to yield to.
// It is also decided LATE, every frame of the walk rather than once at claim
// time, and that is what makes it free: reserving the back spot up front made
// the second chef of every busy service walk an extra body-width whether or not
// anybody was there, and measured -9% of lifetime take over 48 towns. Deciding
// on arrival costs the extra steps only in the case that actually goes wrong.
// The two radii are hysteresis: a crab that has already stepped back holds its
// place until the spot is properly clear, so a shuffling occupant cannot make
// it flip-flop between two targets.
const SOURCE_BACK = 13;   // one body, the same step a queue uses
function sourceSpot(bizKey, c) {
  const s = stationSpot(bizKey, BIZ[bizKey].source, 0);
  const r = c._srcBack ? 11 : 7;
  const taken = allCrabs().some(w => w !== c && !w.hidden && w.workBiz === bizKey &&
    Math.abs(w.x - s.x) < r && Math.abs(w.y - s.y) < 8);
  c._srcBack = taken;
  return taken ? { x: s.x, y: clampY(s.y + SOURCE_BACK) } : s;
}
function setT(c, x, y) { c.tx = x; c.ty = y; }

// ------------------------------------------------- furniture-aware travel
// Lane travel used to be furniture-BLIND: routedStep picked one of two lane
// y's with no idea what stood on them, so any counter beside a lane made
// every passing trip a visible bounce, forever ("cute for ten minutes; all
// day, terrible"). solidBands() mirrors collide()'s two furniture passes
// EXACTLY - same x and y tolerances - so "clear here" means "collide will
// not touch me there". Furniture never moves during a day, so the corridors
// it leaves are stable waypoints, not a search problem.
function solidBandsKey() {
  return Object.keys(BIZ).map(b => (bizUnlocked(b) ? 1 : 0)).join("") + ":" + UPS.table.lvl;
}
let _bands = null, _bandsKey = "";
function solidBands() {
  const key = solidBandsKey();
  if (_bands && _bandsKey === key) return _bands;
  const out = [];
  for (const b of Object.keys(BIZ)) {
    if (!bizUnlocked(b)) continue;
    for (const t of (bizTables(b) || []).concat(BIZ[b].stalls || []))
      out.push({ x0: t.x - 12, x1: t.x + 16, y0: t.y - 9, y1: t.y + 6 });   // collide(): |c.x+8-(t.x+10)|<14, -9<dy<6
    const sts = BIZ[b].stations;
    for (const kind of Object.keys(sts)) for (const st of sts[kind])
      out.push({ x0: st.x - 11, x1: st.x + 15, y0: st.y - 10, y1: st.y + 6 });   // |c.x+8-(st.x+10)|<13, -10<dy<6
  }
  _bands = out; _bandsKey = key;
  return out;
}
// daylight this lane has over the stretch of x it is about to cross (0 = the
// lane runs straight through a solid)
function laneClear(lane, x0, x1, self) {
  const a = Math.min(x0, x1), b = Math.max(x0, x1);
  let min = 99;
  for (const s of solidBands()) {
    if (s.x1 < a || s.x0 > b) continue;
    const gap = lane < s.y0 ? s.y0 - lane : lane > s.y1 ? lane - s.y1 : 0;
    if (gap < min) min = gap;
  }
  // A CRAB PARKED IN THE LANE IS AN OBSTACLE TOO. Furniture was the only thing
  // this looked at, but a crab working a station stands still for minutes at a
  // time, and the towel counter at the showers sits right on the boardwalk: a
  // homebound crab ground against the attendant every night and was sidestepped
  // over and over (36 unsticks in a five-day town, all of them the same pair).
  // Anyone stationary counts - they are not going to move for you. Only when a
  // specific walker asks, though: with no `self` this function answers the
  // FURNITURE question (the lane tripwire uses it that way, and crabs are not
  // town planning).
  if (self) for (const k of allCrabs()) {
    if (k === self || k.hidden || k._stepped) continue;   // movers sort themselves out
    if (k.x + 8 < a - 6 || k.x + 8 > b + 6) continue;
    const gap = Math.abs(lane - k.y) - 9;                 // shoulder room past a standing crab
    if (gap < min) min = gap;
  }
  return min;
}
// a loitering spot (day-off amble, idling) that is not inside the furniture:
// nudge y to the nearer edge of whatever solid it landed in
function clearSpotY(x, y) {
  for (const s of solidBands()) {
    if (x < s.x0 || x > s.x1 || y <= s.y0 || y >= s.y1) continue;
    const up = s.y0 - 1, down = s.y1 + 1;
    y = (y - s.y0 < s.y1 - y ? up : down);
    if (y < FLOOR_MIN || y > FLOOR_MAX) y = (y < FLOOR_MIN ? down : up);
  }
  return Math.max(FLOOR_MIN, Math.min(FLOOR_MAX, y));
}
// The two lanes: the AISLE between the back and front rows of a shop, and the
// BOARDWALK below the front row. Their y's are the CENTRES of the corridors
// the furniture leaves - the back row's solids end at y=142 and the front
// row's begin at y=149, so the aisle sits at 146 (was 147, two pixels off the
// picnic tables, close enough that one jostle put a walker inside them); the
// boardwalk gets the sliver between the front row's y=166 and the floor.
// LANE_LOOK is how far ahead a walker reads the furniture - a shade more than
// the 2:1 merge needs to slide the 22px between lanes, so a sidestep happens
// BEFORE the counter rather than on it. The suite pins the lane clearances,
// so a table parked on a lane fails a test instead of bouncing crabs forever.
const LANES = [146, 168];
const LANE_PAD = 2;      // a lane needs this much daylight to be worth walking
const LANE_LOOK = 64;    // px of lookahead
function travelLane(c, tx, ty) {
  const near = Math.abs(LANES[0] - ty) <= Math.abs(LANES[1] - ty) ? LANES[0] : LANES[1];
  const ahead = c.x + Math.sign(tx - c.x) * LANE_LOOK;   // from here to just past the next obstacle
  const clearNear = laneClear(near, c.x, ahead, c);
  if (clearNear >= LANE_PAD) return near;                // the usual case: wide open, carry on
  const alt = near === LANES[0] ? LANES[1] : LANES[0];   // one comparison, then commit
  return laneClear(alt, c.x, ahead, c) > clearNear ? alt : near;
}
// kitchen + town walking: travel a clear lane horizontally, cut in at the end
function routedStep(c, spd, dt) {
  const tx = c.tx, ty = c.ty;
  if (Math.abs(c.x - tx) <= 5) return stepTo(c, tx, spd, dt, ty);   // final approach: straight in
  const lane = travelLane(c, tx, ty);
  if (Math.abs(c.y - lane) > 1.5) {
    // merge at a 2:1 slope: reaches the lane quickly, keeps x-motion to slide off colliders
    stepTo(c, c.x + Math.sign(tx - c.x) * Math.abs(c.y - lane) * 2, spd, dt, lane);
    return false;
  }
  stepTo(c, tx, spd, dt, lane);   // travel the lane
  return false;
}
// walk somewhere across town: same lanes, used by commutes and the walk home.
// (These used to be raw stepTo calls - a straight diagonal from the front
// room at y~155 to a shop door at y=167, which crosses the ENTIRE front row
// of counters on the way. That single line was most of the town's bouncing.)
function routedWalk(c, tx, ty, spd, dt) { setT(c, tx, ty); return routedStep(c, spd, dt); }
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
  // a table is now bused by staff, so it is released exactly like the stall:
  // occupant off FIRST (busing requires !occupant), then flagged dirty so a
  // crab is guaranteed to come and clear it. Leaving plates on an unflagged
  // table would strand it - unseatable (dishes) and unbuseable (not dirty).
  if (k.table) { k.table.occupant = null; k.table.dirty = true; k.table = null; }
  k.done = true; k.state = "leaving"; k.claimed = false;
  customers = customers.filter(q => q !== k);
  c.errandCust = null;
}
// ---------------------------------------------------------------- mortality
// EVERY CRAB CAN DIE. Until now the settlement's death roll carried a
// `!k.p.npc` guard, so a townsfolk crab could be parched, filthy and ill
// forever - the zombie state the owner reacted to ("we do need to make death
// an option in such cases"). The guard is gone; the odds are the SAME odds
// the crew always rolled, straight off the care ladder, so looking after
// somebody is worth exactly what it was worth before.
//
// It is only fair because the environment finally lets a crab meet the need:
// the public taps ship in this same pass, and the shower attendant is no
// longer barred from her own stalls. A crab dies of neglect they had a real
// chance to fix - never of a shop rota they could not escape.
// WHEN THE ROLL ARMS. Neglect kills on the third day; a crab the town is
// actually looking after has to LINGER a week before the tide is even allowed
// to take them - and then only at their lane's gentle odds. That gap is the
// fairness rule, and it is why making death universal is not a coin flip: you
// die of a neglect somebody could have fixed, and the pass that makes you
// mortal is the same pass that hands you a tap to drink from and gives the
// shower attendant her own stalls back. It is also what keeps the care ladder
// worth climbing now that everyone can die - a fed, watered, clean crab in
// their own bed is not dying on day three, ever.
const DEATH_DAY = 4;     // ...neglected
const LINGER_DAY = 7;    // ...cared for (any lane above NEGLECT)
function deathArmsAt(lane) { return lane === "neglect" ? DEATH_DAY : LINGER_DAY; }
// One removal path for crew and townsfolk alike. Releases everything the crab
// held, files the memorial, and settles what their death does to the town.
function killCrab(k) {
  crabLog(k, "peril", "PASSED AWAY ON DAY " + day + " OF THE TOWN", 0);   // DIARY: the last entry anyone writes
  abortChef(k); abortErrand(k); endChat(k, false);   // the conversation ends here too
  memorials.push({ x: SHELTER_X - 40 - memorials.length * 16, name: k.p.name });
  today.died.push(k.p.name);
  const followed = followIdx >= 0 ? crabs[followIdx] : null;
  crabs = crabs.filter(c2 => c2 !== k);
  npcs = npcs.filter(c2 => c2 !== k);
  if (!k.p.npc) UPS.chef.lvl = Math.max(1, crabs.length);   // the crew roster shrinks; the town's does not
  followIdx = followed ? crabs.indexOf(followed) : -1;   // keep following the same crab, not the same slot
  if (followNpc === k) followNpc = null;
  if (sel === k) sel = null;
  if (dossier === k) dossier = null;   // no records for ghosts
  toast = { text: k.p.name + " HAS PASSED AWAY. THE TOWN GRIEVES.", t: 8 };
  if (window._stats) window._stats.deaths = (window._stats.deaths || 0) + 1;
  sfx.angry();
  townAfterDeath(k);
}
// What a death COSTS the town. Two cases the sim has to answer for:
//   - a dead OWNER-OPERATOR: the shop has nobody. It shutters (bizDark reads
//     `gone`), and the staff go back to the pier rather than draw wages from
//     a till nobody keeps. SEAM: proper succession - a bankrupt or ownerless
//     shop changing hands - belongs to the ownership-transfer work happening
//     in parallel; this is deliberately the minimum that leaves the town in a
//     sane state, and `gone` is the flag that work should hang succession on.
//   - a dead FISHER: their place on the rail is simply free. fishSpotFor used
//     to hand new arrivals a spot by COUNTING fishers, which after a death
//     hands the newcomer a spot somebody else is already standing on -
//     freeFishSpot() takes the lowest one nobody holds.
function townAfterDeath(k) {
  if (!k.p.owner) return;
  const o = OWNERS[k.p.owner];
  if (!o || o.gone) return;
  o.gone = day;
  const b = Object.keys(BIZ).find(b2 => bizOwner(b2) === k.p.owner);
  if (b) {
    today.moved.push(BIZ[b].short + " HAS NO OWNER - CLOSED");
    toast = { text: BIZ[b].name + " IS CLOSED. " + k.p.name + " IS GONE.", t: 8 };
    for (const w of allCrabs()) {
      if (w.p.employer !== k.p.owner) continue;
      w.p.job = "fishing"; w.p.employer = null; w.workBiz = null;
      if (!w.fishSpot) w.fishSpot = freeFishSpot();
      today.moved.push(w.p.name + " LOST THEIR JOB - BACK TO THE PIER");
    }
    jobBoard = jobBoard.filter(j => j.biz !== b);
  }
}
// the lowest rail position nobody is standing on (deaths and departures leave
// holes; counting heads would double-book them)
function freeFishSpot() {
  const held = new Set(allCrabs().filter(c => c.fishSpot && c.p.boat == null)
    .map(c => c.fishSpot.x + "," + c.fishSpot.y));
  for (let i = 0; i < 40; i++) {
    const sp = fishSpotFor(i);
    if (!held.has(sp.x + "," + sp.y)) return sp;
  }
  return fishSpotFor(0);
}
function abortChef(c) {
  release(c);   // covers kitchen work AND a selfCook grip on a grill (e.g. death mid-meal)
  if (c.cust && !c.cust.served) { c.cust.claimed = false; c.cust.server = null; }   // let another chef pick the order up
  if (c.cleanStall) { c.cleanStall.cleaning = false; c.cleanStall = null; }
  // ...and a crab yanked out MID-NAP or MID-WANDER wakes up here. Without
  // this, kstate would be forced to "idle" while napT kept the microsleep
  // guard returning early forever - a station released but a crab that never
  // works again. Same shape as the stall-occupant leak abortErrand fixed.
  c.napT = 0; c.napFrom = null;
  c.wander = null; c.wanderT = 0; c.idleT = 0;
  // ...and the table they were clearing: a table left flagged `cleaning` by a
  // crab who died or got yanked mid-bus would stay dirty and unseatable for
  // the rest of the run - the stall wedge, one furniture type over.
  if (c.cleanTable) { c.cleanTable.cleaning = false; c.cleanTable = null; }
  c.kstate = "idle"; c.cust = null; c.carrying = null; c.stepIdx = 0;
}

// ---------------------------------------------------------------- player orders (right-click)
// SELECTION = the crab you're following. Right-click gives orders to CREW
// crabs only - the townsfolk have their own lives (design choice: NPC agency
// stays intact; see PLAN). Desktop right-click only this pass: long-press
// would collide with merge mode's hold gesture, so touch is deferred.
const ORDER_IDLE = 2.5;   // seconds a directed crab lingers before the schedule reclaims them
// Break from ANY current activity, releasing every held resource: station
// slot + claimed order + cleaning stall (abortChef), errand stall/table/
// queue ghost (abortErrand), then bus/commute and selfCook state. A chef
// whose claimed customer we ghost recovers on their own (updateKitchen
// aborts on state "leaving"). Ends parked in dayState "home" so
// updateSchedule can re-dispatch from a known-safe state.
function abortActivity(c) {
  abortChef(c);
  abortErrand(c);
  endChat(c, false);   // mid-sentence: the conversation is off, and unpaid
  c.p.rough = false;   // a directed crab is on their feet again
  c.cookStep = 0; c.cookRecipe = null;
  c.tapStop = null; c.tapT = 0;   // a tap holds nothing, but don't leave the stop armed
  c.duty = false; c.pendingOff = false;
  c.cstate = ""; c.busFrom = -1; c.busTo = -1;
  c.hidden = false; c.pauseT = 0;
  c.y = clampY(c.y);   // yanked off a bus/stall: back into the walk band
  c.order = null;
  c.dayState = "home";
}
function orderPop(c, ok, verdict) {
  popText(c.p.name + ": " + verdict, c.x - 12, c.y - 26, ok ? [140, 255, 160] : [255, 150, 130]);
  if (ok) sfx.ding(); else sfx.angry();
}
function orderGoto(c, x, y) {
  abortActivity(c);
  c.order = { kind: "goto", x: Math.max(12, Math.min(WORLD_W - 24, x)), y: clampY(y), idleT: -1 };
  c.dayState = "directed";
  setT(c, c.order.x, c.order.y);
  orderPop(c, true, "ON IT!");
}
function updateDirected(c, dt) {
  const o = c.order;
  if (!o) { c.dayState = "home"; return; }
  if (o.idleT >= 0) {   // arrived: linger a beat, then the schedule reclaims them
    o.idleT -= dt;
    if (o.idleT <= 0) { c.order = null; c.dayState = "home"; c.errandCd = Math.max(c.errandCd, 1); }
    return;
  }
  if (routedStep(c, crabMove(c), dt)) o.idleT = ORDER_IDLE;
}
// pickErrand's recipe/pricing/staffing gates, sans the need thresholds - a
// directed crab runs the errand NOW if the till, wallet and line allow it
// (the 5-slot queue cap is enforced on arrival, same as any errand)
function forcedErrand(c, b) {
  if (b === "shack") {
    if (!bizStaffed("shack")) {
      if (c.p.job === "shack" && !c.p.npc) {   // staff privilege: cook your own, at the shop's meal policy
        const aff = BIZ.shack.recipes.filter(r => c.p.wallet >= staffMealCharge("shack", r) + 2);
        if (aff.length) { aff.sort((a, b2) => a.pay - b2.pay); return { selfCook: true, recipe: aff[0] }; }
      }
      return null;
    }
    const aff = BIZ.shack.recipes.filter(r => c.p.wallet >= localPrice("shack", r) + 2);
    if (!aff.length) return null;
    aff.sort((a, b2) => a.pay - b2.pay);
    return { biz: "shack", recipe: c.p.wallet > 40 ? aff[(Math.random() * aff.length) | 0] : aff[0], need: "food" };
  }
  if (!bizStaffed(b)) return null;
  if (b === "showers") {
    const r = BIZ.showers.recipes[c.p.wallet > 40 ? 1 : 0];
    return c.p.wallet >= localPrice(b, r) + 2 ? { biz: b, recipe: r, need: "spa" } : null;
  }
  if (b === "arcade") {
    if (c.p.sick) return null;   // bed rest: no game nights while ill
    const r = BIZ.arcade.recipes[c.p.wallet > 40 ? 2 : 1];
    return c.p.wallet >= localPrice(b, r) + 2 ? { biz: b, recipe: r, need: "fun" } : null;
  }
  return null;
}
// What a right-click at world (wx, wy) means for this crew crab. Priority:
// their workplace (clock in) > their home (knock off) > a business (errand)
// > open ground (walk there). Every refusal pops - never silent.
function orderCrab(c, wx, wy) {
  const sh = effShift(c);
  const jb = c.p.job === "fishing" ? null : BIZ[c.p.job];
  const atWorkplace = jb ? wx >= jb.x0 && wx <= jb.x1
    : wx >= PIER_X0 - 8 && wx <= PIER_X1 + 24;
  if (atWorkplace && !c.p.sick && tmin < sh.end - 30) {
    if (c.dayState === "working" && c.duty) return orderPop(c, false, "ALREADY ON THE CLOCK");
    abortActivity(c);
    startCommute(c, true);
    return orderPop(c, true, c.p.job === "fishing" ? "GONE FISHING!" : "BACK TO WORK!");
  }
  if (atWorkplace && c.p.sick && c.p.job !== "shack")   // sick + own shack falls through: they may still buy food there
    return orderPop(c, false, "TOO SICK TO WORK");
  // their home (house lot or shelter) -> knock off and take a real break
  const atHome = c.p.homeless
    ? wx >= SHELTER_X - 2 && wx <= SHELTER_X + 70
    : c.p.boat == null && wx >= HOUSE_XS[c.p.house] - 2 && wx <= HOUSE_XS[c.p.house] + 62;
  if (atHome) {
    abortActivity(c);
    c.restDay = day; c.restUntil = tmin + 120;   // ~2 game-hours before the schedule re-dispatches to work
    startCommute(c, false);
    return orderPop(c, true, "HEADING HOME");
  }
  // a business -> run that errand now (their own workplace reaches here only
  // off-shift or sick, which is exactly when dinner beats clocking in)
  for (const b of Object.keys(BIZ)) {
    if (!bizUnlocked(b) || wx < BIZ[b].x0 || wx > BIZ[b].x1) continue;
    if (c.duty || c.dayState === "working") return orderPop(c, false, "ON THE CLOCK");
    if (bizDark(b)) return orderPop(c, false, "IT'S SHUT");
    if (!bizOpenNow(b) && b !== c.p.job) return orderPop(c, false, "IT'S CLOSED");   // own shop: selfCook privilege still applies
    const e = forcedErrand(c, b);
    if (!e) return orderPop(c, false, "CAN'T RIGHT NOW");
    abortActivity(c);
    c.errandCd = 0;
    if (e.selfCook) startSelfCook(c, e); else startErrand(c, e);
    return orderPop(c, true, "ON IT!");
  }
  // open ground: a natural click-to-nav feel predominates
  orderGoto(c, wx, wy);
}

// ---------------------------------------------------------------- auto-unstick
// The collision field has one rare hard pin: a walker shoved by a stationary
// anchor is pushed straight back along its own line of travel and grinds in
// place (documented: a commuter pinned against an idle chef). Crabs are
// crabs - when one makes no progress it takes a little perpendicular
// sidestep and tries again. Conservative by design: only crabs that MOVED
// via stepTo this frame count (deliberate waits - queues, station work, bus
// stops, trait pauses - never call stepTo), and only with real distance
// still to cover.
const STUCK_WINDOW = 1.5;   // seconds of no net progress before a sidestep
const STUCK_DIST = 2;       // "no progress" = net displacement under this many px
const STUCK_FAR = 8;        // only when genuinely underway (target further than this)
const STUCK_RETRIES = 4;    // sidesteps before giving up with a quip
const DETOUR_T = 1.0;       // seconds each sidestep waypoint lives
// Matt's last-resort valve, on a different clock from the sidestep watchdog:
// a trip may spend at most this many GAME-minutes bouncing off furniture in
// total, then the crab squeezes past ("it's cute for ten minutes; all day is
// terrible"). The sidestep breaks pins in real-seconds; this caps a whole
// trip's bounce budget.
const BOUNCE_BUDGET = 30;   // game minutes of obstruction per trip
const WARP_PX = 14;         // a shell's width past the blocker, no more
function updateStuck(c, dt) {
  // A crab who is ASLEEP, NAPPING AT A STATION or STOOD TALKING is not stuck -
  // it is standing still on purpose. All three are already exempt by
  // construction (no stepTo runs, so `walking` below is false), but say it out
  // loud: a microsleep is exactly the shape this watchdog was built to break,
  // and a sidestep mid-nap would shove a crab off the station it is holding.
  // NOTE the rough test is scoped to a crab still LYING there (dayState home).
  // p.rough survives into the morning until updateHome clears it at first
  // light - and a crab dispatched to work before dawn kept the flag, and with
  // it a permanent exemption from this watchdog. One pinned rough sleeper then
  // stood in the road forever with nothing left to rescue him.
  if ((c.napT || 0) > 0 || c.dayState === "chat" || c.wanderT > 0 ||
      (c.p.rough && c.dayState === "home" && darkness() >= 0.5)) {
    c.stuckT = 0; c.stuckRef = null; c.stuckN = 0; c.bounceT = 0;
    return;
  }
  if (c.detour) {   // sidestep in progress: steer for the waypoint, then resume
    c.detour.t -= dt;
    const done = stepTo(c, c.detour.x, crabMove(c) * 1.2, dt, c.detour.y);
    if (done || c.detour.t <= 0) c.detour = null;
    c.stuckT = 0; c.stuckRef = null;
    return;
  }
  const walking = c._stepped && !c.hidden && !c.errandCust &&
    Math.abs((c._mx != null ? c._mx : c.x) - c.x) > STUCK_FAR;
  if (!walking) { c.stuckT = 0; c.stuckRef = null; c.stuckN = 0; c.bounceT = 0; return; }
  // bounce budget: count the game-minutes this trip has spent not getting there
  if (c._blocked) c.bounceT = (c.bounceT || 0) + dt * TS;
  if ((c.bounceT || 0) >= BOUNCE_BUDGET) {
    c.bounceT = 0; c.stuckT = 0; c.stuckRef = null; c.stuckN = 0; c.detour = null;
    const dir2 = Math.sign((c._mx != null ? c._mx : c.x) - c.x) || 1;
    c.x += dir2 * WARP_PX;   // squeeze through, a shell's width
    c.quip = { text: "EXCUSE ME", t: 1.8 };
    if (window._stats) window._stats.warps = (window._stats.warps || 0) + 1;
    return;
  }
  if (!c.stuckRef) { c.stuckRef = { x: c.x, y: c.y }; c.stuckT = 0; return; }
  c.stuckT += dt;
  if (Math.hypot(c.x - c.stuckRef.x, c.y - c.stuckRef.y) >= STUCK_DIST) {
    c.stuckRef = { x: c.x, y: c.y }; c.stuckT = 0; c.stuckN = 0;   // real progress: all clear
    return;
  }
  if (c.stuckT < STUCK_WINDOW) return;
  c.stuckN = (c.stuckN || 0) + 1;
  c.stuckT = 0; c.stuckRef = null;
  if (c.stuckN > STUCK_RETRIES) {
    c.stuckN = 0;
    c.quip = { text: ["DANG TRAFFIC", "I GIVE UP", "WHO PARKED THERE?!"][(Math.random() * 3) | 0], t: 2.4 };
    if (c.order) { c.order = null; c.dayState = "home"; }   // a directed crab abandons the order
    return;
  }
  // perpendicular sidestep: hop to whichever side of the lane has room
  // (alternating on retries), backing off a touch so the collider lets go
  const dir = Math.sign((c._mx != null ? c._mx : c.x) - c.x) || 1;
  let dy = (c.stuckN % 2 ? -1 : 1) * 12;
  if (clampY(c.y + dy) === c.y) dy = -dy;
  c.detour = { x: c.x - dir * 6, y: clampY(c.y + dy), t: DETOUR_T };
  if (window._stats) window._stats.unsticks = (window._stats.unsticks || 0) + 1;
}
function updateFishing(c, dt) {
  // stand at the spot, cast, wait, land one - the town's oldest job
  if (c.fishSpot) { c.x = c.fishSpot.x; c.y = c.fishSpot.y; }
  if (c.roastT > 0) {   // lunch is on the driftwood fire
    c.roastT -= dt;
    if (c.roastT <= 0) {
      c.p.hunger = Math.max(0, (c.p.hunger || 0) - 0.65);
      crabLog(c, "need", "ROASTED A FRESH CATCH ON THE BEACH", 0);   // DIARY
      popText("FRESH CATCH LUNCH", c.x - 12, c.y - 24, [140, 255, 160]);
      c.quip = { text: ["CAN'T BEAT FRESH", "SEA PROVIDES", "STRAIGHT OFF THE LINE"][(Math.random() * 3) | 0], t: 2.4 };
      if (window._stats) window._stats.roasts = (window._stats.roasts || 0) + 1;
    }
    return;
  }
  // a working fisher's lunch is the catch: eating a $2-7 fish on the spot
  // beats a $15 town lunch plus hours of walking, at any price - and for a
  // penniless fisher in a glut it's the safety valve that makes zero-wage
  // survivable. One fish off the day's landings, no money changes claws.
  if ((c.p.hunger || 0) >= 0.55 && townCatch > 2) {   // never the town's last fish
    townCatch--; c.roastT = 5;
    trade.useDay++;   // a roast eats a fish too - the market feels it
    if (window._stats) window._stats.roastStarts = (window._stats.roastStarts || 0) + 1;
    return;
  }
  c.castT = (c.castT || 5) - dt;
  if (c.castT <= 0) {
    // a live-aboard works the deeper water off their own deck: quicker bites,
    // and now and then the net comes up double
    const aboard = c.p.boat != null;
    const tier = fishTier(c);   // experience: quicker casts, better hauls
    c.castT = (aboard ? 9 + Math.random() * 13 : 14 + Math.random() * 18) * tier.cast;
    let haul = Math.random() < (aboard ? 0.2 : 0) + tier.dbl ? 2 : 1;
    if (tier.big && Math.random() < tier.big) haul = 4;   // THE BIG ONE
    townCatch += haul; trade.landed += haul; trade.landedDay += haul;
    creditCatch(c, haul);
    logCatch(c, haul);   // DIARY: tallied all day, filed as ONE line at dusk (the BIG ONE gets its own)
    // free agents: no wage anywhere - the catch sold at the pier's market
    // price IS the income. A scarce-fish day is a lucrative day.
    c.p.wallet += trade.price * haul;
    popText((haul >= 4 ? "THE BIG ONE!! +$" : haul > 1 ? "DOUBLE HAUL! +$" : "CATCH! +$") + trade.price * haul,
      c.x - 8, c.y - 24, haul >= 4 ? [255, 230, 120] : [140, 220, 255]);
    sfx.splash();
    if (window._stats) {
      window._stats.catches = (window._stats.catches || 0) + haul;
      window._stats.fishPay = (window._stats.fishPay || 0) + trade.price * haul;
      const by = window._stats.catchesBy = window._stats.catchesBy || {};
      by[c.p.name] = (by[c.p.name] || 0) + haul;
    }
    if (Math.random() < 0.25) c.quip = {
      text: trade.price >= FISH_IMPORT
        ? ["THE WATER'S MONEY TODAY", "EVERY CAST PAYS", "TOP DOLLAR TODAY"][(Math.random() * 3) | 0]
        : ["BIG ONE!", "THEY'RE BITING", "SEA PROVIDES"][(Math.random() * 3) | 0], t: 2.2 };
  }
}
// A tourist will not sit at the table beside a visibly filthy crab: they take
// the far one. THERE IS ALWAYS AN OUT - if every free table has one beside it
// they sit anyway rather than stand, so a filthy crab can never deadlock the
// dining room (chosen over queueing or walking out: seating is the one place
// in this game where a refusal could strand a paying guest for good).
// Locals are colleagues, not strangers; they are not fussy.
// SHUN_PX is geometry, not taste: the shack's tables sit 40px apart across and
// 24px apart back-to-front, so a radius of 26 (ellipse-corrected the way
// collide() corrects for wide sprites) means "the table you are standing at"
// and never "the whole dining room". Pitch it larger and every table is always
// beside somebody, which turns the refusal into a no-op.
const SHUN_PX = 26;
function tableShunned(t, skip) {
  return allCrabs().some(c => !c.hidden && c !== skip && (c.p.dirt || 0) >= SHUN_AT &&
    Math.hypot(c.x + 8 - (t.x + 10), (c.y - (t.y + 12)) * 1.8) < SHUN_PX);
}
function pickSeat(tables, cust) {
  // a DIRTY table is not a table: it seats nobody until a crab has cleared it
  const free = (tables || []).filter(t => !t.occupant && t.dishes === 0 && !t.dirty);
  if (!free.length) return null;
  if (cust && cust.isCrab) return free[0];
  // their OWN server is not "the crab at the next table": a filthy server is
  // already charged for through the tip and the patience drain, and counting
  // them here would shun every table in the room the moment they walked over.
  const clear = free.find(t => !tableShunned(t, cust && cust.server));
  if (clear) {
    if (clear !== free[0] && window._stats) window._stats.seatDecline = (window._stats.seatDecline || 0) + 1;
    return clear;
  }
  if (window._stats) window._stats.seatSatAnyway = (window._stats.seatSatAnyway || 0) + 1;
  return free[0];   // every table is beside one: sit anyway, never strand a guest
}
// ...and a tourist being served BY one runs out of patience quicker, on the
// same ramp the bubble opens on (up to +30% at a pinned 1.00).
function serverFilth(k) {
  const s = k.server;
  return s && s.p && !k.isCrab ? 1 + PATIENCE_FILTH * (crabBerth(s) / BERTH_PX) : 1;
}
// ------------------------------------------------- busing (the fancier tier)
// A vacated table is DIRTY and seats nobody until a staff crab clears it -
// the shower stalls' dirty/cleaning cycle, one furniture type over.
// `|| t.dishes > 0` is a wedge guard rather than a second rule: it makes the
// invariant "plates on an empty table ALWAYS get cleared" true by
// construction, whatever route left them there.
function messyTable(bizKey) {
  const ts = bizTables(bizKey);
  return ts && ts.find(t => (t.dirty || t.dishes > 0) && !t.cleaning && !t.occupant) || null;
}
function startBus(c, t) {
  t.cleaning = true; c.cleanTable = t; c.kstate = "toTableClean";
  // clampY: a front-row table sits at y=158, so its "at the table" spot is off
  // the bottom of the walkable floor. Clamped it still lands inside collide()'s
  // own exemption box for that table (|dy| < 8), so the busing crab is never
  // shoved off the thing it came to clear.
  setT(c, t.x + 2, clampY(t.y + 10));
}
function updateKitchen(c, dt) {
  if (c.cust && (c.cust.state === "leaving" || c.cust.served)) { abortChef(c); return; }
  const bizKey = c.workBiz, biz = BIZ[bizKey];
  // ---- THE MICROSLEEP -----------------------------------------------------
  // Runs BEFORE anything else in the kitchen, and AFTER the raged-guest abort
  // above so a nap can never outlive the order it was holding.
  //
  // The whole point is the slot: release() is not called, workT does not tick,
  // and the crab is still standing on the station. A coworker who wants that
  // grill waits in the clear lane and polls tryAcquire (the hold-and-wait fix
  // this project already made) - so it is a DELAY, hard-capped at NOD_SPAN+
  // NOD_MIN seconds, and never a jam. And because no stepTo runs while the
  // crab naps, the auto-unstick watchdog and the 30-game-minute furniture
  // bounce budget both look straight past it: they only ever consider a crab
  // that genuinely stepped this frame. kstate "nap" is likewise not one of the
  // moving kstates the suite's freeze detector samples.
  if ((c.napT || 0) > 0) {
    c.napT -= dt;
    if (c.napT <= 0) {
      c.kstate = c.napFrom || "idle"; c.napFrom = null;
      c.quip = { text: NOD_WAKE[(Math.random() * NOD_WAKE.length) | 0], t: 2.2 };
    }
    return;
  }
  if ((c.p.tired || 0) >= NOD_AT && !patOff("nod") && NOD_STATES.includes(c.kstate)
      && Math.random() < NOD_RATE * dt) {
    c.napFrom = c.kstate; c.kstate = "nap";
    c.napT = NOD_MIN + Math.random() * NOD_SPAN;
    if (window._stats) {
      window._stats.nods = (window._stats.nods || 0) + 1;
      window._stats.nodSecs = (window._stats.nodSecs || 0) + c.napT;
    }
    return;
  }
  // hustle: kitchens move quick - but a run-down crab loses the spring in
  // their step: a gentle slope, plus a kicker once seriously neglected
  // (eff < 0.85), totalling ~-18% at rock bottom
  const eff = crabEff(c);
  const spd = crabMove(c) * 1.55 * (1 - 0.3 * (1 - eff) - 1.2 * Math.max(0, 0.85 - eff));
  if (c.kstate === "idle") {
    const lastCall = c.pendingOff && tmin < effShift(c).end + 45;
    if (!c.pendingOff || lastCall) {
      // paying guests first; locals and crew get served in the lulls - but a
      // local past half patience jumps the line: the juice bar's steady
      // tourist stream never lulls on its own, and a starved local walking
      // away parched is the exact spiral the reserved 5th slot exists to stop
      // NOT sorted into queue order, and that is a MEASURED refusal. Serving
      // the front of the line first is the obvious companion to standing in
      // one, and it costs the town real money: the tip is
      // `menuPrice x 0.5 x patience/maxPatience`, so FIFO takes every tip at
      // the BOTTOM of the patience curve. Measured, 30 days x 16 seeds x two
      // blocks: lifetime $53447/$57086 unsorted against $49914/$48958 sorted,
      // -8% and -14%, while the queue geometry alone reads +2%/-1%. Where the
      // crabs STAND is a look; who gets served is the economy. See PLAN.
      const pending = customers.filter(k => k.biz === bizKey &&
        (k.state === "waiting" || k.state === "seatedWaiting") && !k.claimed && !k.served);
      const o = pending.find(k => k.isCrab && k.patience < k.maxPatience * 0.5)
        || pending.find(k => !k.isCrab) || pending[0];
      // TURNING THE ROOM, when the room is what the queue is waiting for.
      // Busing ONLY in the lull measured as a death spiral for table service:
      // a shack with a queue is never idle, so the plates never got cleared,
      // the dining room went permanently dirty and everybody ended up handed
      // a plate at the counter (seed 99, 3 days: 47 guests seated -> 8).
      // So a crab clears a table ahead of taking the next order - but only
      // when there is genuinely nowhere clean left to seat that guest.
      const bts0 = bizTables(bizKey);
      // ...but NEVER ahead of a LOCAL. A neighbour in the line is a crab with
      // a hunger meter and a death roll, and "the evening queue never reaches
      // the local" is already a named trap in this town (see PLAN). Measured:
      // letting a bus-run outrank a waiting local took the trudge's anti-spiral
      // gate from 6 deaths / 12 towns to 15, because a slow crab arrived late
      // AND then waited behind the plates. Tourists can wait; they only lose
      // patience, and a tourist who has nowhere to sit is exactly the guest a
      // cleared table is for.
      const messyFirst = !c.pendingOff && bts0 && o && !o.isCrab && o.state === "waiting" &&
        !bts0.some(t => !t.occupant && t.dishes === 0 && !t.dirty) && messyTable(bizKey);
      if (o && !messyFirst) {
        // an order lands: the wander is over, wherever they got to. The walk
        // back to the crate is the entire cost of having drifted off.
        c.wander = null; c.wanderT = 0; c.idleT = 0; c.wanderCd = WANDER_CD;
        o.claimed = true; c.cust = o; o.server = c; c.stepIdx = -1; c.kstate = "walk";
        // send dine-in guests to a table right away - the server brings it out
        const bts = bizTables(bizKey);
        if (o.state === "waiting" && bts) {
          const seat = pickSeat(bts, o);
          if (seat) { seat.occupant = o; o.table = seat; o.state = "toSeat"; }
        }
        const s0 = sourceSpot(bizKey, c); setT(c, s0.x, s0.y);   // a body back if somebody is already on the crate
        return;
      }
      const grubby = !c.pendingOff && biz.stalls && biz.stalls.find(t => t.dirty && !t.cleaning && !t.occupant);
      if (grubby) {
        c.wander = null; c.wanderT = 0; c.idleT = 0; c.wanderCd = WANDER_CD;
        grubby.cleaning = true; c.cleanStall = grubby; c.kstate = "toStallClean";
        setT(c, grubby.x + 2, grubby.y + 7);
        return;
      }
      // ...and otherwise busing is what a crab does in the lull, the same way
      // it scrubs a stall. A shack with more tables than crabs runs behind.
      const messy = messyFirst || (!c.pendingOff && messyTable(bizKey));
      if (messy) { startBus(c, messy); return; }
    }
    // loiter by the door - but NOT inside the counter. The lower of the two
    // idle spots (y=156) sits squarely in the front-row solid band, which is
    // why SUDSY spent her whole shift being shoved off her own towel counter.
    const ix = biz.door + 4 + (Math.max(0, crabs.indexOf(c)) % 3) * 10;
    // ---- IDLE HANDS: the wander-off ---------------------------------------
    // Nothing to claim and nothing to scrub. A restless crab does not stand
    // by that door for six hours. Three things keep it CHARMING rather than
    // crippling in an arcade-less town where boredom sits at 0.8 town-wide
    // and everybody touches 1.0:
    //   1. the counter has to be DEAD for WANDER_QUIET first - they don't
    //      bolt the second the queue empties;
    //   2. a wander is a TRIP, not a posting: WANDER_DWELL seconds at the
    //      spot, then back to the post, then WANDER_CD before the next one -
    //      so they're at their post a good half of every dead spell;
    //   3. RULE 3 - boredom yields to everybody (boredYields), so a crab who
    //      is starving or dead on their feet never wanders at all.
    // The cost is ONLY ever the walk back, and it lands hardest exactly when
    // the shop is quiet, which is when it costs the town least.
    if (c.wanderT > 0) {                    // stood there, watching the sea
      c.wanderT -= dt;
      if (c.wanderT <= 0) { c.wander = null; c.wanderCd = WANDER_CD; }
      return;                               // holds position: no stepTo, so the
                                            // unstick watchdog never considers them
    }
    if (c.wander) {                         // walking out to it (kstate stays
      setT(c, c.wander.x, c.wander.y);      // "idle": the claim scan above runs
      if (routedStep(c, spd, dt)) {         // every frame, wander or no wander)
        c.wanderT = WANDER_DWELL + Math.random() * 10;
        c.quip = { text: WANDER_QUIPS[(Math.random() * WANDER_QUIPS.length) | 0], t: 2.6 };
      }
      return;
    }
    if (c.wanderCd > 0) c.wanderCd -= dt;
    c.idleT = (c.idleT || 0) + dt;
    if (!c.pendingOff && !c.p.sick && !patOff("wander")
        && (c.p.bored || 0) >= WANDER_AT && !boredYields(c)
        && c.idleT >= WANDER_QUIET && c.wanderCd <= 0) {
      const w = wanderSpot(c, ix);
      if (w) {
        c.wander = w; setT(c, w.x, w.y);
        if (window._stats) window._stats.wanders = (window._stats.wanders || 0) + 1;
        return;
      }
      c.wanderCd = WANDER_CD;   // nowhere within reach: don't re-roll every frame
    }
    setT(c, ix, clearSpotY(ix, 146 + (Math.max(0, crabs.indexOf(c)) % 2) * 10));
    routedStep(c, spd, dt);
  } else if (c.kstate === "walk") {
    // the crate is decided on ARRIVAL, not on claim - see sourceSpot. Only the
    // leg to the source (stepIdx -1) is re-aimed; a station slot is acquired,
    // so nobody else can be standing on one of those.
    if (c.stepIdx === -1) {
      const sp = sourceSpot(bizKey, c);
      if (c.tx !== sp.x || c.ty !== sp.y) setT(c, sp.x, sp.y);
    }
    if (routedStep(c, spd, dt)) {
      if (c.stepIdx === -1) {
        if (ownerFunds(bizKey) < ingredientCost(c.cust.recipe.raw)) { c.kstate = "waitCash"; return; }
        debitBiz(bizKey, ingredientCost(c.cust.recipe.raw), c.x, FLOOR_Y - 40);
        consumeIngredient(c.cust.recipe.raw, c.cust.recipe);
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
      crabLogEvery(c, "stall", 90, "work", "SCRUBBED OUT A SHOWER STALL");   // DIARY
      c.kstate = "idle";
      if (window._stats) window._stats.stallsCleaned = (window._stats.stallsCleaned || 0) + 1;
      popText("SPARKLING", c.x - 6, FLOOR_Y - 30, [140, 220, 255]);
    }
  } else if (c.kstate === "toTableClean") {
    if (routedStep(c, spd, dt)) { c.workMax = c.workT = BUS_SECS / (crabWork(c) * crabEff(c)); c.kstate = "busingTable"; }
  } else if (c.kstate === "busingTable") {
    c.workT -= dt;
    if (c.workT <= 0) {
      if (c.cleanTable) {
        c.cleanTable.dirty = false; c.cleanTable.cleaning = false; c.cleanTable.dishes = 0;
        c.cleanTable = null;
      }
      c.kstate = "idle";
      if (bizOwner(bizKey) === "player") today.bused = (today.bused || 0) + 1;
      if (window._stats) window._stats.tablesBused = (window._stats.tablesBused || 0) + 1;
      popText("CLEARED", c.x - 6, FLOOR_Y - 30, [140, 220, 255]);
    }
  } else if (c.kstate === "waitCash") {
    // step into the clear lane while waiting - squatting on the source spot
    // blocks a selfCook crab heading for the same bin (hold-and-wait deadlock)
    { const st0 = biz.stations[biz.source][0];
      setT(c, st0.x + 2, st0.y + 7 <= 147 ? 168 : 147);
      stepTo(c, c.tx, spd, dt, c.ty); }
    if (ownerFunds(bizKey) >= ingredientCost(c.cust.recipe.raw)) {
      debitBiz(bizKey, ingredientCost(c.cust.recipe.raw), c.x, FLOOR_Y - 40);
      consumeIngredient(c.cust.recipe.raw, c.cust.recipe);
      c.kstate = "work"; c.workMax = c.workT = 0.6; c.slotKind = null; c.slot = -1;
    }
  } else if (c.kstate === "waitSlot") {
    const kind = c.cust.recipe.steps[c.stepIdx][0];
    // wait in the clear lane, not on the station spot: the crab HOLDING the
    // slot may be walking to this exact spot (a night pour made this jam
    // common) - a squatter here deadlocks the kitchen until a guest rages
    { const st0 = biz.stations[kind][0];
      setT(c, st0.x + 2, st0.y + 7 <= 147 ? 168 : 147);
      stepTo(c, c.tx, spd, dt, c.ty); }
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
// Fishing is a trade like any other (Matt: "fish-catching should give
// experience"), so it rides the SAME milestones as dishes - 25 / 100 / 250
// lifetime catches, counted in the persona so it saves. NOTE the counter key
// is 'caught', not 'fish': the shack sells a dish whose recipe id IS 'fish',
// and sharing the key would have a cook's plates teaching a fisher to cast.
// The tiers pay in the only currency a fisher has: time on the water and what
// comes up on the line - quicker casts, better double-haul odds, then THE BIG ONE.
const FISH_TIERS = [
  { at: 250, cast: 0.72, dbl: 0.10, big: 0.05, label: "MASTERED" },
  { at: 100, cast: 0.84, dbl: 0.07, big: 0,    label: "IS FAMOUS FOR" },
  { at: 25,  cast: 0.93, dbl: 0.03, big: 0,    label: "HAS THE KNACK FOR" },
];
const FISH_TIER0 = { cast: 1, dbl: 0, big: 0 };
function fishTier(c) {
  const n = (c.p.made && c.p.made.caught) || 0;
  for (const t of FISH_TIERS) if (n >= t.at) return t;
  return FISH_TIER0;
}
function creditCatch(c, haul) {
  if (!c || !c.p) return;
  if (!c.p.made) c.p.made = {};
  const before = c.p.made.caught || 0;
  c.p.made.caught = before + haul;
  for (const t of FISH_TIERS) {
    if (before < t.at && c.p.made.caught >= t.at) {
      crabLog(c, "life", t.label + " FISHING - " + c.p.made.caught + " LANDED", 0);   // DIARY
      toast = { text: c.p.name + " " + t.label + " FISHING! " + c.p.made.caught + " LANDED", t: 6 };
      popText(t.label + " FISHING", c.x - 26, c.y - 32, [255, 230, 120]);
      c.quip = { text: ["I KNOW THIS WATER", "THEY COME TO ME NOW", "READ THE TIDE"][(Math.random() * 3) | 0], t: 2.6 };
      sfx.ding();
      break;
    }
  }
}
function creditAccomplishment(c, cust) {
  if (!c || !c.p || cust.isCrab) return;   // paying guests only
  const id = cust.recipe.id;
  c.p.made[id] = (c.p.made[id] || 0) + 1;
  const n = c.p.made[id];
  for (const [need, , label] of MASTERY) {
    if (n === need) {
      const dish = ITEM_NAMES[cust.recipe.icon];
      crabLog(c, "life", label + " " + dish + " (X" + n + ")", 0);   // DIARY
      toast = { text: c.p.name + " " + label + " " + dish + "! " + n + " SERVED", t: 6 };
      popText(label + " " + dish, c.x - 24, FLOOR_Y - 36, [255, 230, 120]);
      c.quip = { text: ["I'VE GOT THIS", "MY SPECIALTY", "EASY NOW"][(Math.random() * 3) | 0], t: 2.4 };
      sfx.ding();
      break;
    }
  }
}
// ---------------------------------------------------------------- tips
// TIPS BELONG TO TABLE SERVICE (owner directive, 2026-08-19: "decrease or
// eliminate tips on counter service it makes tables pointless").
// A guest handed a plate over the pass drops the shrapnel in the jar; a guest
// who was SAT DOWN, waited on, and had it brought out to them tips properly.
// TIP_COUNTER is a TOKEN rather than zero on purpose: the jar by the till is
// a real thing, a filthy or exhausted server should still be able to lose it,
// and "the counter earns a little" keeps the comparison a curve instead of a
// switch. The gap it opens IS the case for buying a table.
const TIP_COUNTER = 0.15;
// PAIRED-ARM PROBES (the `_noBerth` / `_noNeedDrag` idiom): `_fullCounterTip`
// pays the counter the old full tip and `_selfBused` puts the outdoor rule
// back, so any measurement in this pass can be reproduced against the build
// it replaced without checking out another tree.
// TIP SHARING is the owner's other lever: what fraction of a tip goes to the
// crab who served it instead of the till. Their share lands in their WALLET -
// the engine of the housing ladder - so a generous split costs the till and
// buys you crew who can afford food, water and rent. Default 0 = how the game
// has always paid, so an untouched town is untouched.
const TIP_SHARE_STEP = 0.05;   // the slider's grain
function bizTipShare(b) { return Math.max(0, Math.min(1, (BIZ[b] && BIZ[b].tipShare) || 0)); }
// THE TABLE TIP - what a guest leaves on the table on their way out - is now
// the headline difference between being waited on and being handed a plate.
// It went $5 -> $9 with staff busing (2026-08-19), and it is the paid-for
// half of that trade rather than a sweetener: clearing tables costs the crew
// real hours, and the do-nothing town (which HAS tables) has to be able to
// buy those hours out of the same guests. Measured: busing alone took the
// baseline from a day-14 eviction to day 5; the raised table tip is what
// brings it back, and it lands entirely on TABLE service, so it widens the
// counter/table gap instead of papering over it.
const TABLE_TIP = 9;
function tableTipOf(b) { return TABLE_TIP; }
// One tip, two pockets. `payTip` is the ONLY place a tip is split, so the
// slider means exactly the same thing for the tip at the table and the tip in
// the jar. The crab's cut lands in their WALLET - the housing ladder's fuel.
function payTip(bizKey, server, amt, x, y) {
  if (!(amt >= 0.5)) return;
  const cut = amt * bizTipShare(bizKey), till = amt - cut;
  // ONE POP PER TIP (owner report: "the tip popup appears twice, one with the
  // word tip and once without"). creditBiz already pops the money going into
  // the till, so the till's share is credited SILENTLY here and labelled once,
  // in gold, as a tip. The crab's share gets its own pop over the crab, which
  // is a different event in a different place - that one is not a duplicate.
  if (till >= 0.5) {
    creditBiz(bizKey, till, x, y, true);
    popText("+$" + Math.round(till) + " TIP", x - 8, y - 8, [255, 216, 96]);
  }
  if (cut > 0 && server && server.p) {
    server.p.wallet += cut;
    if (bizOwner(bizKey) === "player") today.tipsShared = (today.tipsShared || 0) + cut;   // the day report is the PLAYER's books
    if (cut >= 0.5) popText("+$" + Math.round(cut) + " TIP", server.x - 8, server.y - 26, [255, 216, 96]);
  }
  if (window._stats) {
    window._stats.tipTill = (window._stats.tipTill || 0) + till;
    window._stats.tipCrab = (window._stats.tipCrab || 0) + cut;
  }
}
// the one write path: clamp to 0..1 and snap to the slider's grain, so the
// number on the card is always the number the till is paying out
function setTipShare(b, v) {
  // round the product too: 7 x 0.05 is 0.35000000000000003 in binary floating
  // point, and that number would go into the save file and onto the card
  const q = Math.max(0, Math.min(1, Math.round(Math.round((+v || 0) / TIP_SHARE_STEP) * TIP_SHARE_STEP * 100) / 100));
  if (BIZ[b]) BIZ[b].tipShare = q;
  return q;
}
function payAndBenefit(c, cust) {
  today.served++;
  // trade ledger: tracked input flows (T1 bookkeeping - nothing charged here)
  if (cust.recipe) {
    if (cust.recipe.id === "taco") tradeImport("corn", 1);          // tortilla-to-be (T3 pilot)
    if (cust.biz === "arcade") tradeImport("power", 1);             // a machine hour
  }
  creditAccomplishment(c, cust);
  logServe(c, cust);   // DIARY: one line for the whole plate, rate-limited in the rush
  if (cust.isCrab) logTreat(cust);   // DIARY: ...and the crab on the other side of the counter
  if (cust.biz === "juicebar") {
    if (window._stats) {
      window._stats.drinkServes = (window._stats.drinkServes || 0) + 1;
      // ...and split by WHO, because the price war is about the promenade's
      // tourist footfall. Measured on the whole number, a crab's own errands
      // drown the signal: the beach ball (which never touches a visitor)
      // moved crab drink errands enough to flip the rivalry's counter-arm.
      const kk = cust.isCrab ? "drinkServesCrab" : "drinkServesTour";
      window._stats[kk] = (window._stats[kk] || 0) + 1;
    }
    if (!firstPour && c && c.p) {   // the bar's first drink is town news
      firstPour = true;
      toast = { text: c.p.name + " POURED THE JUICE BAR'S FIRST " + ITEM_NAMES[cust.recipe.icon] + "!", t: 6 };
      c.quip = { text: "FRESH SQUEEZED!", t: 2.6 };
    }
  }
  if (c && c.p) today.byCrab[c.p.name] = (today.byCrab[c.p.name] || 0) + 1;
  if (cust.isCrab) {
    const price = localPrice(cust.biz, cust.recipe);   // full retail, always - no broke-crab discounts
    cust.crab.p.wallet = Math.max(0, cust.crab.p.wallet - price);
    creditBiz(cust.biz, price, cust.x, 126);
    if (window._stats && offToday(cust.crab)) {   // day-off spending, per crab (suite visibility)
      const ob = window._stats.offBuys = window._stats.offBuys || {};
      ob[cust.crab.p.name] = (ob[cust.crab.p.name] || 0) + 1;
    }
    if (cust.crab.p.npc && bizOwner(cust.biz) === "player" && window._stats)
      window._stats.npcSpendAtPlayer = (window._stats.npcSpendAtPlayer || 0) + price;
    if (cust.need === "food") cust.crab.p.hunger = 0;
    if (cust.need === "drink") {
      cust.crab.quip = { text: ["AHH, THE GOOD STUFF", "QUENCHED!", "COLD AND SWEET"][(Math.random() * 3) | 0], t: 2.4 };
      if (window._stats) window._stats.crabDrinks = (window._stats.crabDrinks || 0) + 1;
    }
    if (cust.need === "drink" || DRINKS[cust.recipe.id]) cust.crab.p.thirst = 0;   // any juice quenches, even one bought as lunch
    if (cust.need === "fun") { cust.crab.p.bored = 0; cust.crab.quip = { text: "BEST DAY EVER!", t: 2.4 }; }
    popText(ITEM_NAMES[cust.recipe.icon], cust.x - 14, 116, [140, 255, 160]);
  } else {
    const tipMult = TRAITS[c.p.trait].tip * (1 - 0.3 * (c.p.dirt || 0))
      * (1 - ((c.p.tired || 0) >= 0.85 ? 0.15 : 0));   // an EXHAUSTED server fumbles the charm (0.85 = the mood line; evenings routinely reach the old 0.66)
    // TABLE SERVICE KEEPS THE WHOLE TIP; the counter keeps a token of it.
    // `seatedWaiting` is exactly "this plate is going out to a seated guest" -
    // serve() calls us before it flips them to dining.
    const seated = cust.state === "seatedWaiting";
    let tip = menuPrice(cust.biz, cust.recipe) * 0.5 * (cust.patience / cust.maxPatience) * tipMult
      * (seated || window._fullCounterTip ? 1 : TIP_COUNTER);   // the flag is the paired-arm probe
    // A VISITOR PAYS OUT OF THEIR OWN POCKET. The wallet was checked before
    // they ever joined the line (visPick), so the price always clears; the TIP
    // is whatever is left of it, which is why a nearly-broke guest tips
    // nothing and a flush one tips the lot. This is the only place outside
    // money becomes town money now - see the ferry block's audit note.
    if (cust.visitor) {
      const paid = menuPrice(cust.biz, cust.recipe);   // the board price, not the base
      cust.wallet = Math.max(0, cust.wallet - paid);
      cust.spent += paid;
      tip = Math.max(0, Math.min(tip, cust.wallet));
      cust.wallet -= tip; cust.spent += tip;
      visBenefit(cust);
    }
    // one price on the menu, one price on the pop: the base. The tip is its
    // own little moment (Matt: 'are tacos 17 or 23? there are discrepancies')
    creditBiz(cust.biz, menuPrice(cust.biz, cust.recipe), cust.x, 126);
    if (window._stats) window._stats.basePay = (window._stats.basePay || 0) + menuPrice(cust.biz, cust.recipe);
    if (window._stats) {
      window._stats[seated ? "tipTableN" : "tipCounterN"] = (window._stats[seated ? "tipTableN" : "tipCounterN"] || 0) + 1;
      window._stats.tipGross = (window._stats.tipGross || 0) + tip;
      const gk = seated ? "tipGrossTable" : "tipGrossCounter";
      window._stats[gk] = (window._stats[gk] || 0) + tip;
    }
    payTip(cust.biz, c, tip, cust.x, 108);   // credited separately, popped separately
    popText(ITEM_NAMES[cust.recipe.icon], cust.x - 14, 116, [140, 255, 160]);
  }
}
// WHAT A VISITOR GOT FOR THEIR MONEY. Same vocabulary the crabs' errands use
// (a meal zeroes hunger, any juice quenches, the arcade zeroes boredom) so a
// visitor's bars mean exactly what a crab's bars mean - the dossier can show
// them side by side and the player only has to learn one thing.
function visBenefit(k) {
  const r = k.recipe;
  if (!r) return;
  if (k.need === "room") return;                       // paid at the desk; the bed is the benefit
  if (DRINKS[r.id]) k.thirst = 0;
  if (k.need === "food" || (!DRINKS[r.id] && k.biz === "shack")) k.hunger = 0;
  if (k.need === "fun" || k.biz === "arcade") k.bored = 0;
  visLog(k, "need", "BOUGHT " + (ITEM_NAMES[r.icon] || "SOMETHING")
    + " AT THE " + BIZ[k.biz].short + " - $" + menuPrice(k.biz, r));
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
    // CLEAR THE NEXT TABLE ON THE WAY BACK. The server is standing IN the
    // dining room with an empty tray - the one moment in the day when busing
    // costs a few steps instead of a lap of the shack. Measured: with busing
    // dispatched only from the idle loop the crab walked from the crate (x1232)
    // to the tables (x1490) and back for every single plate, and the baseline
    // town died on day 5 instead of day 14. Doing it here is the same labour,
    // paid at the honest price.
    if (!c.pendingOff) { const nxt = messyTable(cust.biz); if (nxt) startBus(c, nxt); }
    return;
  }
  if (cust && cust.state === "waiting") {
    payAndBenefit(c, cust);
    cust.served = true; cust.happy = true; sfx.ding();
    if (!cust.isCrab) rep = Math.min(100, rep + 0.4);
    const tables = bizTables(cust.biz), stalls = BIZ[cust.biz].stalls;
    const seat = tables ? pickSeat(tables, cust) : null;
    const stall = stalls ? stalls.find(t => !t.occupant && !t.dirty) : null;
    // LODGING: the key is handed over and the guest walks to their own door.
    // The room was reserved before they joined the line (nobody sells the last
    // room twice), so there is nothing to find here - `leaving` sends them
    // through visAfterCounter, which checks them in.
    if (BIZ[cust.biz].lodging) { cust.state = "leaving"; }
    else if (stalls) {
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

// ===========================================================================
// THE FERRY, AND VISITORS WHO ARE PEOPLE  (owner directive, 2026-08-19)
//
// Verbatim: "tourists become real; real money, come in on a cruise ship with
// status bars in various conditions, disembark, stay for a day or two. New
// business is hotel, run by an NPC (tho we should have a mechanism for owning
// it)" - with his correction a minute later, "say ferry, forget about cruise
// ships".
//
// WHAT WAS WRONG. A tourist used to blink into existence beside a queue on a
// reputation-paced timer, wait, eat, and walk off the right-hand edge of the
// world. There was no such person: the "spawn" WAS the demand curve, wearing a
// name for four characters' worth of queue label.
//
// WHAT DEMAND IS NOW: A POPULATION. Visitors land in BATCHES off the ferry
// (batch size scales with reputation - a town with a good name draws a fuller
// boat), walk down the pier into town, and stay a day or two. They carry a
// WALLET of real money and spend it down; when it is gone they stop buying,
// and whatever they did not spend goes home in their pocket. They carry the
// same five NEEDS every crab carries, in various conditions off the boat, and
// those needs are what sends them to a counter - a ferry-load of hungry,
// filthy visitors is a good day for the shack and for SUDSY. At night they
// need somewhere to sleep, which is what the DRIFTWOOD HOTEL is for.
//
// A VISITOR IS A CUSTOMER OBJECT THAT PERSISTS. That is the whole trick, and
// it is why this pass is small: the queue, patience, seating, table service,
// tipping, busing, the reserved local slot, click-to-follow and the tourist
// dossier all already operate on customer objects, so a VISIT is a longer life
// with the shop pipeline as its sub-machine. `k.visitor` marks them, the
// states listed in VIS_STATES are theirs, and every state the counter owns is
// untouched.
//
// THE MONEY NEVER INFLATES. A wallet is minted when the ferry lands (this is
// the outside money that has always entered this town through tourists - it
// used to be minted one plate at a time) and is destroyed when the ferry takes
// it away again. Between those two moments the only thing that happens to it
// is `creditBiz`. Add it to the audit in the OWNERS block as:
//     visitor wallets (ferry in)   -> outside money IN, only as it is spent
//     unspent wallets (ferry out)  -> DESTROYED, exactly like rent
// ===========================================================================

// ---- THE FERRY -------------------------------------------------------------
// THE SEAM, DELIBERATELY SMALL: another agent owns the island's horizon and the
// run to the mainland. Everything this system needs from a ferry is two events
// - SHE IS ALONGSIDE, and SHE HAS SAILED - so they are one call each, and
// `window.onFerry(kind, info)` is the hook to hang art, sound or a win
// condition off. If a richer ferry lands later it should call `ferryDock()` /
// `ferrySail()` and delete FERRY_TIMES; nothing else here needs to know.
const FERRY = {
  hull: 2074,      // where she lies alongside, off the end of the pier
  hullY: 46,
  gangway: 2046,   // the pier's east end: the plank comes down here
  shore: 1852,     // foot of the pier, where the deck meets the promenade
  deckY: 100,      // visitors walk the planks at rail height
};
// FOUR SAILINGS, NOT TWO, and that is a measured number rather than a
// timetable someone liked. A boat is a BURST where the retired spawn timer was
// a trickle, and this town's tables are what it is short of: with two big
// sailings a day the whole boat hit one counter at once, every table was taken
// by the third guest, and the rest were handed a plate over the pass - the
// SEATED share fell from 88% to 61% and with it the $9 table tip that is most
// of a guest's value. Four smaller boats put the same people through the same
// dining room and the share comes back.
const FERRY_TIMES = [8 * 60, 10.5 * 60, 13 * 60, 15.5 * 60];
const FERRY_STAY = 75;                   // game-minutes tied up
const FERRY_CALL = 165;                  // ...and how long before a sailing a leaver sets off
                                         // for the pier (the whole promenade, at a stroll)
// A GOOD NAME FILLS THE BOAT. This replaces `spawnEvery`, and it makes the same
// statement about reputation the old timer made: a rep-30 town gets about two a
// sailing, a rep-100 town nearly three.
const FERRY_BASE = 2.0, FERRY_REP = 0.013, FERRY_MAX = 6;
// The morning boats are the busy ones, and the LAST sailing is the hotel's
// whole demand: its passengers are overnighters by construction, because there
// is no later boat for them to catch. So the size of that boat is what the
// Driftwood's seven rooms are sized against.
const FERRY_LOAD = [1.2, 1.1, 0.9, 0.8];
let ferryT = 0;        // game-minutes she has left alongside (0 = at sea)
let ferrySail = -1;    // index of the sailing already run today (-1 = none yet)
let ferryDay = 0;
function ferryHere() { return ferryT > 0; }
function ferryNotify(kind) {
  if (typeof window.onFerry === "function") { try { window.onFerry(kind, { day, tmin }); } catch (e) {} }
}
function gnow() { return day * 1440 + tmin; }
function ferryBatch() {
  const n = FERRY_BASE + rep * FERRY_REP + (Math.random() - 0.5);
  return Math.max(1, Math.min(FERRY_MAX, Math.round(n)));
}
// ---- THE VISITOR -----------------------------------------------------------
const VIS_STATES = { ashore: 1, roam: 1, toBiz: 1, toRoom: 1, inRoom: 1, onSand: 1, toPier: 1 };
// WHICH OF THOSE A SAVE MAY CARRY. `toBiz` is deliberately absent: it is the
// only state whose whole meaning lives in fields the envelope does not store
// (biz/recipe/target), so restoring it hands updateVisitor an errand to nowhere.
const VIS_SAVE_STATES = { ashore: 1, roam: 1, toRoom: 1, inRoom: 1, onSand: 1, toPier: 1 };
const VIS_SPEED = 42;            // a stroll: a shade under a walking crab's 40 x trait
// A VISITOR WAITS LONGER THAN A PASSER-BY. The old anonymous tourist had 50;
// somebody who crossed on a boat to be here and is staying the night will give
// your kitchen half again as long. It is also a measured necessity: ferry
// batches are BURSTY where the old spawn timer was a trickle, so five guests
// hit one counter at once - at 50 the burst cost 2 seated guests a day their
// $9 table tip and put rage 62% above the pre-pass build.
const VIS_PATIENCE = 100;
const VIS_THINK = 1.6;           // real seconds between "what do I fancy" checks
// needs per GAME HOUR while awake. Pitched off the crabs' own cycle but a
// little gentler: a visitor is not working a shift, and a visitor who needed
// something every hour would simply queue all day.
// (dirt runs faster than a crab's because a visitor spends the whole day on a
//  beach; it is also what keeps SUDSY's stalls busy now that the anonymous
//  spawn is gone - measured at 0.030 her shop washed 11 guests in 8 days.)
// HUNGER LEADS. An early draft ran thirst faster than hunger and the town's
// takings fell 30% a guest without a single price changing: a visitor's day
// filled up with $10 juices instead of $17 tacos, the dining room saturated,
// and the overflow was served over the pass for a token tip. Fewer, hungrier
// visitors are worth more than more, thirstier ones, because SEATS are what
// this town is short of.
const VIS_RATE = { hunger: 0.115, thirst: 0.055, dirt: 0.090, bored: 0.045, tired: 0.048 };
const VIS_WANT = { food: 0.45, drink: 0.40, clean: 0.45, fun: 0.45 };
// A VISITOR'S PRIORITIES ARE NOT A LOCAL'S. ERRAND_RANK puts washing third
// because a crab washes when the day allows; a holidaymaker who has spent the
// afternoon on a beach goes and has a shower, and SUDSY's whole business used
// to be 10% of an anonymous spawn table. Measured: at the crabs' rank of 2 she
// washed 2.9 guests a day against the pre-pass build's 4.3 and lost the shop in
// 4 towns of 6.
const VIS_RANK = { food: 4, drink: 3, clean: 2.4, fun: 1.5 };
const VIS_BED_DRAIN = 0.30;      // a hotel bed drains tiredness at TIRED_DRAIN.bed
// THE STROLL IS LOCAL. An early draft picked a target anywhere in this span
// and a visitor spent most of their holiday walking the length of the town
// instead of buying anything (1.6 purchases a visit). A stroll is a few
// hundred pixels of promenade; the shops are what pull them further.
const VIS_ROAM = [700, 1900];    // the stretch of promenade a visitor will stroll
const VIS_STROLL = 340;          // ...and how far from here one stroll takes them
// the room rate is the hotel's menu price, read off the recipe so the price on
// the sign and the money a visitor holds back can never disagree
const ROOM_RATE = BIZ.hotel.recipes[0].pay;
const ROOM_HOUR = 15 * 60;       // past this the bed outranks everything - the desk
                                 // shuts with REEF's shift, and the sand is the alternative
// ...and BEFORE it, a bed is the LAST thing on a holidaymaker's mind, which is
// also the only setting that leaves the town any trade. Measured with the room
// ranked above a meal (6 against food's 4): a visitor came off the boat and
// walked the length of the promenade to the hotel first, dropped their bag,
// and had half a day left to spend - the shack's peak till fell $70 and the
// growth town could no longer afford its first chef. Ranked below everything,
// the bed simply waits for the afternoon, when ROOM_HOUR makes it absolute.
const ROOM_RANK = 1.5;
const ROOM_URGE = 5;             // ...climbing all afternoon until it outranks lunch
const BED_HOUR = 21 * 60;        // ...and turns in
const WAKE_HOUR = 7.5 * 60;      // checkout: the room goes dirty and housekeeping gets it
const VIS_DAYTRIP = 0.60;        // share of every boat BUT THE LAST who go home the same day
                                 // (the last boat is overnighters by construction). Between
                                 // this and FERRY_LOAD it is what sizes the hotel's demand.
                                 // (the afternoon boat is overnighters by construction -
                                 //  there is no later sailing for them to catch)
const SAND_SPOTS = [600, 1160, 1590, 1836, 2110];   // where a visitor with no room beds down
const VIS_LOG_MAX = 24;          // a visit is short; the diary is shorter than a crab's
function visLog(k, cat, line) {
  if (!k || !line) return;
  const log = k.log || (k.log = []);
  const txt = String(line).slice(0, LOG_TEXT);
  if (log.length && log[log.length - 1][3] === txt) return;
  log.push([day, Math.round(tmin), LOG_CATS[cat] ? cat : "life", txt]);
  if (log.length > VIS_LOG_MAX) log.splice(0, log.length - VIS_LOG_MAX);
}
function visitorsInTown() { return customers.filter(k => k.visitor && !k.gone); }
// names dedupe against everybody currently in town, crabs included, so no two
// MISTYs are ever on the boardwalk at once - the whole point is a recognisable
// face ("that's MISTY, she's been here since Tuesday")
function freeVisitorName() {
  const used = new Set(allCrabs().map(c => c.p.name));
  for (const k of customers) if (k.visitor) used.add(k.name);
  const free = CUSTOMER_NAMES.filter(n => !used.has(n));
  if (!free.length) return CUSTOMER_NAMES[(Math.random() * CUSTOMER_NAMES.length) | 0];
  return free[(Math.random() * free.length) | 0];
}
// STATUS BARS IN VARIOUS CONDITIONS (the directive's own words). Everybody
// comes off the boat with a low baseline and ONE OR TWO needs genuinely
// pressing, which is what makes a batch legible from the pier: this one is
// starving, that one has been on a boat all morning and wants a wash.
function visNeeds() {
  const n = { hunger: 0, thirst: 0, dirt: 0, bored: 0, tired: 0 };
  const keys = Object.keys(n);
  for (const key of keys) n[key] = 0.08 + Math.random() * 0.32;
  const loaded = 1 + ((Math.random() * 2) | 0);
  for (let i = 0; i < loaded; i++) {
    const key = keys[(Math.random() * keys.length) | 0];
    n[key] = 0.55 + Math.random() * 0.40;
  }
  return n;
}
function newVisitor(overnightOnly) {
  const nights = overnightOnly ? (Math.random() < 0.80 ? 1 : 2)
    : Math.random() < VIS_DAYTRIP ? 0 : Math.random() < 0.78 ? 1 : 2;
  const n = visNeeds();
  // THE PURSE. A day-tripper brings lunch money; somebody staying two nights
  // brings two nights' worth plus the room. A third of the boat is FLUSH and a
  // few are down to their last few dollars - the "some flush and some nearly
  // broke" the directive asked for, and the reason a full queue is not the
  // same thing as a full till.
  // The floor matters more than the mean, and it is measured: at 20 the broke
  // tail of every boat ran out mid-meal and the $9 TABLE TIP was clipped to
  // whatever was left, so a fifth of the shack's table money quietly vanished.
  let wallet = 32 + Math.random() * 44 + nights * (ROOM_RATE + 24);
  if (Math.random() < 0.30) wallet += 24 + Math.random() * 30;    // a flush third of the boat
  if (Math.random() < 0.12) wallet *= 0.6;                        // ...and a few travelling light
  const leaveT = nearestSail(gnow() + (nights === 0 ? 300 + Math.random() * 90
    : nights * 1440 - 60 - Math.random() * 60));
  return {
    visitor: true, gone: false,
    name: freeVisitorName(),
    color: (Math.random() * CRAB_COLORS.length) | 0,
    acc: ACC_KEYS[(Math.random() * ACC_KEYS.length) | 0],
    animT: Math.random() * 9,
    // they come off the boat ON THE PLANKS, at rail height, and walk down
    x: FERRY.gangway, y: FERRY.deckY, wy: FERRY.deckY, leg: 0,
    state: "ashore",
    // the shop pipeline's own fields, dormant until they join a line
    biz: null, recipe: null, patience: VIS_PATIENCE, maxPatience: VIS_PATIENCE,
    claimed: false, served: false, happy: false, server: null, table: null, stall: null,
    // the visit
    wallet: Math.round(wallet), purse: Math.round(wallet), spent: 0,
    nights, nightsHad: 0, rough: false, roughNights: 0, unhoused: 0,
    arrived: day, leaveT, room: null, buys: 0, thinkT: Math.random() * VIS_THINK,
    idleT: 0, target: null, log: [],
    hunger: n.hunger, thirst: n.thirst, dirt: n.dirt, bored: n.bored, tired: n.tired,
  };
}
// THE TOWN IS NOT EMPTY WHEN YOU SIGN THE LEASE. A cold start with nobody
// ashore costs a whole trading day while the first boats build a population -
// measured at -29% revenue on day 1 - and it is also simply wrong: people were
// holidaying here before you took the shack on. So a new town (and an old save
// that predates the ferry) opens with a boat-load already mid-visit.
function seedVisitors() {
  if (customers.some(k => k.visitor)) return;
  const n = ferryBatch() + 6;   // a day-and-a-bit: yesterday's overnighters and this morning's crowd
  for (let i = 0; i < n; i++) {
    // about half of them are mid-stay rather than day-tripping, so the town
    // still has a population on DAY 2 (measured: seeding day-trippers only left
    // day 2 thirty percent down on takings while the first boats rebuilt one)
    const v = newVisitor(Math.random() < 0.45);
    v.state = "roam"; v.leg = 1;
    v.x = Math.round(VIS_ROAM[0] + Math.random() * (VIS_ROAM[1] - VIS_ROAM[0]));
    v.wy = FLOOR_Y; v.y = FLOOR_Y;
    v.wallet = Math.round(v.wallet * (0.55 + Math.random() * 0.45));   // part-way through the money
    v.spent = Math.max(0, v.purse - v.wallet);
    customers.push(v);
    visLog(v, "life", "CAME OVER ON AN EARLIER FERRY");
  }
}
// SHE IS ALONGSIDE. Land the batch, and call anybody whose visit is up.
function ferryDock(n, idx) {
  ferryT = FERRY_STAY;
  // THE LAST BOAT OF THE DAY carries overnighters by construction - there is
  // nothing left for them to catch - so the timetable, not a dice roll, is what
  // decides how many beds the town needs tonight.
  const i0 = idx == null ? Math.max(0, FERRY_TIMES.findIndex(t => tmin < t + FERRY_STAY)) : idx;
  const last = i0 >= FERRY_TIMES.length - 1;
  const count = n != null ? n
    : Math.max(1, Math.round(ferryBatch() * (FERRY_LOAD[i0] != null ? FERRY_LOAD[i0] : 1)));
  const landed = [];
  for (let i = 0; i < count; i++) {
    const v = newVisitor(last);
    v.x = FERRY.gangway - 4 - i * 7;   // down the plank and along the deck, in a line
    v.thinkT = i * 3 + Math.random() * 8;   // ...and they do not all want lunch at 9:01
    customers.push(v);
    visLog(v, "life", "CAME ASHORE OFF THE FERRY");
    // HARBOUR DUES, if that is the purse the town voted for. Charged at the
    // gangway, out of a wallet that was minted two lines ago and will be
    // destroyed when they sail - so it is a live balance moving, not a coin
    // appearing, and the money they hand over is money the counters never see.
    today.heads = (today.heads || 0) + 1;
    const due = harbourDues(v);
    if (due > 0) visLog(v, "money", "PAID $" + Math.round(due) + " HARBOUR DUE");
    landed.push(v.name);
  }
  if (window._stats) {
    window._stats.ferries = (window._stats.ferries || 0) + 1;
    window._stats.arrivals = (window._stats.arrivals || 0) + count;
  }
  if (landed.length) {
    toast = { text: "THE FERRY IS IN - " + landed.length + " VISITOR"
      + (landed.length === 1 ? "" : "S") + " ASHORE", t: 5 };
    popText("FERRY IN", FERRY.gangway - 20, 84, [140, 220, 255]);
  }
  ferryNotify("dock");
  return landed;
}
// YOU BOOK A BOAT, NOT AN HOUR. A visitor's departure is pinned to an actual
// SAILING the moment they land - the one nearest the end of the stay they came
// for - which is what makes "a day or two" mean a day or two. (Rounding to the
// NEXT sailing instead turned a quarter of every morning's day-trippers into
// accidental overnighters twenty minutes past the boat, and every one of them
// then wanted a bed nobody had built.)
function nearestSail(want) {
  let best = null, bd = Infinity;
  const floor = gnow() + 60;   // has to be far enough off to walk to the pier
  for (let d0 = 0; d0 <= 3; d0++) for (const t of FERRY_TIMES) {
    const abs = (day + d0) * 1440 + t;
    if (abs <= floor) continue;
    const dd = Math.abs(abs - want);
    if (dd < bd) { bd = dd; best = abs; }
  }
  return best == null ? want : best;
}
// how long this visitor needs to reach the boat from where they are standing,
// in game minutes, with a little slack for the queue at the plank
function visWalkMins(k) {
  return Math.abs(k.x - FERRY.gangway) / VIS_SPEED * TS + 25;
}
// WHO IS GOING HOME ON THIS ONE - and, just as importantly, WHEN THEY SET OFF.
// `minsLeft` is how long until she sails; a guest leaves when the walk needs
// them to and not a minute before. A flat call was tried first and it read
// wrong in the diary: a guest with a room 200px from the pier was checking out
// at 05:15 for an 08:00 boat, because the call had to be sized for somebody at
// the far end of the promenade.
function ferryDepartCall(sailAbs, minsLeft) {
  for (const k of visitorsInTown()) {
    if (k.state === "toPier" || k.leaveT > sailAbs) continue;
    if (!VIS_STATES[k.state] || k.state === "toBiz") continue;   // finish what you're queueing for
    if (minsLeft != null && minsLeft > visWalkMins(k)) continue;
    visLeave(k);
  }
}
function visLeave(k) {
  // a guest called to the boat straight out of their bed has still SLEPT
  // there: check them out properly so the night is credited and the room goes
  // back to housekeeping, then send them down the pier
  if (k.room) checkOut(k);
  k.state = "toPier"; k.leg = 0; k.target = null;
  visLog(k, "life", "HEADING BACK TO THE FERRY");
}
// SHE HAS SAILED. Anybody who made it aboard goes home with whatever is left
// in their pocket - and that money leaves the town, which is what keeps the
// wallet from being an inflation hole.
function ferryGo() {
  ferryT = 0;
  const last = ferrySail >= FERRY_TIMES.length - 1;
  for (const k of visitorsInTown()) {
    if (k.state !== "toPier" || k.x < FERRY.gangway - 12) continue;
    visBoard(k);
  }
  // MISSED THE LAST BOAT. A day-tripper who dawdled is an overnighter now,
  // whether they packed for it or not - so they go looking for a room like
  // everybody else rather than being quietly filed as "unhoused".
  if (last) for (const k of visitorsInTown()) {
    if (k.gone || k.nights > 0) continue;
    k.nights = 1; k.leaveT = nearestSail(gnow() + 900);
    visLog(k, "life", "MISSED THE LAST BOAT - STAYING OVER");
  }
  ferryNotify("sail");
}
function visBoard(k) {
  k.gone = true;
  if (k.room) { k.room.occupant = null; k.room.dirty = true; k.room = null; }
  // WORD OF MOUTH IS THE WHOLE POINT OF A VISIT. A guest who ate, washed and
  // slept somewhere talks the town up; one who spent the night on the sand
  // talks it down harder. Small numbers on purpose - rep already saturates,
  // and the serve/rage swings remain the loud ones.
  // Deliberately SMALL and mostly one-sided. Word of mouth is already a
  // calibrated currency (a serve is +0.4, a table serve +0.8, a rage-quit -3),
  // and an early draft that also docked every merely-unremarkable visit -0.6
  // put a systematic -4/day on a town that lives on this number: reputation
  // collapsed to 43 by day 5, which shrank the boat, which shrank the takings.
  // What ships is the one thing a player can actually fix.
  const rough = k.roughNights > 0;
  rep = Math.max(0, Math.min(100, rep + (rough ? -1.2 : k.buys >= 2 ? 0.5 : 0)));
  if (window._stats) {
    const s = window._stats;
    s.visDepart = (s.visDepart || 0) + 1;
    s.visSpend = (s.visSpend || 0) + k.spent;
    s.visUnspent = (s.visUnspent || 0) + Math.max(0, Math.round(k.wallet));
    s.visStayMin = (s.visStayMin || 0) + Math.max(0, gnow() - (k.arrived * 1440));
    s.visBuys = (s.visBuys || 0) + k.buys;
    s.visNights = (s.visNights || 0) + k.nightsHad;
    s.visRough = (s.visRough || 0) + k.roughNights;
    if (rough) s.visRoughGuests = (s.visRoughGuests || 0) + 1;
  }
  if (followCust === k) followCust = null;
  if (sel === k) sel = null;
  if (dossier === k) dossier = null;
}
// One clock, called from updateCustomers. Docks her on the timetable, calls
// the leavers early enough to walk the promenade, and sails her.
function runFerry(dtMin) {
  if (ferryDay !== day) { ferryDay = day; ferrySail = -1; }
  for (let i = 0; i < FERRY_TIMES.length; i++) {
    if (i <= ferrySail) continue;
    const abs = day * 1440 + FERRY_TIMES[i];
    if (tmin >= FERRY_TIMES[i] - FERRY_CALL && tmin < FERRY_TIMES[i])
      ferryDepartCall(abs, FERRY_TIMES[i] - tmin);
    if (tmin >= FERRY_TIMES[i]) { ferrySail = i; ferryDock(null, i); ferryDepartCall(abs); }
  }
  if (ferryT > 0) {
    ferryT -= dtMin;
    // board anybody standing on the plank while she is alongside
    for (const k of visitorsInTown())
      if (k.state === "toPier" && k.leg === 1 && k.x >= FERRY.gangway - 12) visBoard(k);
    if (ferryT <= 0) ferryGo();
  }
}
// ---- THE ROOMS -------------------------------------------------------------
// THE ROOMS ARE `stalls`, so the housekeeping dispatch, the cleaning wedge
// guards and the abort paths all already know what to do with them. What is
// new is only the LENGTH of the occupancy: a shower is showerT seconds, a room
// is until morning.
function hotelRooms() { return (BIZ.hotel && BIZ.hotel.stalls) || []; }
function freeRoom() { return hotelRooms().find(r => !r.occupant && !r.dirty && !r.cleaning) || null; }
// THE INVARIANT, TRUE BY CONSTRUCTION (the tables' `dishes > 0` guard, one
// facility over): a room whose guest is no longer in town is an empty room
// with an unmade bed. Whatever route left it that way - a rage-quit, a
// conversion to crew, a save reload, a bug I have not thought of - the sweep
// hands it back to housekeeping instead of stranding it for the run.
function sweepRooms() {
  for (const r of hotelRooms()) {
    const o = r.occupant;
    if (!o) continue;
    if (o.visitor && !o.gone && o.room === r) continue;
    r.occupant = null; r.dirty = true;
  }
}
// CHECKING IN IS NOT GOING TO BED. They take the key in the afternoon and go
// back out into the town with a bed waiting for them - which is exactly what
// makes the room worth its $22: an evening in town instead of a walk to the
// last ferry.
function checkIn(k) {
  const r = k.room;
  if (!r) return;
  k.roomN = hotelRooms().indexOf(r) + 1;
  visLog(k, "home", "CHECKED IN - ROOM " + k.roomN + " AT THE DRIFTWOOD");
  if (window._stats) window._stats.roomLets = (window._stats.roomLets || 0) + 1;
  today.roomsLet = (today.roomsLet || 0) + 1;
}
function checkOut(k) {
  if (k.room) { k.room.occupant = null; k.room.dirty = true; k.room = null; }
  k.nightsHad++;
  k.state = "roam"; k.biz = null; k.target = null;
  k.wy = FLOOR_Y; k.y = FLOOR_Y;
  visLog(k, "home", "CHECKED OUT - SLEPT WELL");
}
// THE ANSWER TO A FULL HOUSE, and it is an ENVIRONMENT answer, not a scripted
// sulk (PLAN's standing thesis). A visitor with nowhere to sleep does not
// misbehave: they bed down on the sand, exactly the way an exhausted crab
// does, and the sand banks NO rest - the same rule sleepRough() already
// applies to crabs. The consequences fall out of that one fact: they wake
// tired and grubby, they take the next ferry rather than a second night, and
// they talk the town down on the way out. Nothing is scripted; the fix is to
// have rooms free, which is a staffing and ownership problem the player can
// actually solve.
function sleepOnSand(k) {
  let best = SAND_SPOTS[0];
  for (const s of SAND_SPOTS) if (Math.abs(s - k.x) < Math.abs(best - k.x)) best = s;
  k.state = "onSand"; k.target = best + ((Math.random() * 18) | 0) - 9;
  k.rough = true;
  if (!k.roughFlag) {
    k.roughFlag = true; k.roughNights++;
    k.unhoused++;
    // they came for two nights; one on the sand is enough - the next boat will do
    k.leaveT = Math.min(k.leaveT, nearestSail(gnow() + 540));
    visLog(k, "peril", "NO ROOM AT THE HOTEL - SLEPT ON THE BEACH");
    today.moved.push(k.name + " SLEPT ON THE BEACH - HOTEL FULL");
    // ...and whether the room they could not have was LET or merely UNMADE.
    // freeRoom() refuses a dirty or half-cleaned room, so a guest on the sand
    // with linen still on the floor is a bed the hotel lost to its own
    // housekeeping rather than to demand - which is a LABOUR problem, and the
    // signal the hotelier answers with money (see THE HOTELIER).
    if (hotelRooms().some(r => r.dirty || r.cleaning))
      today.roomsLost = (today.roomsLost || 0) + 1;
    popText("NO ROOM!", k.x - 10, FLOOR_Y - 34, [255, 150, 130]);
    if (window._stats) window._stats.unhoused = (window._stats.unhoused || 0) + 1;
  }
}
// ---- WHAT A VISITOR FANCIES ------------------------------------------------
// The crabs' own errand scorer, cut down to what a visitor has: no shift to
// anchor the trip on, no self-cook privileges, no free tap (a visitor buys
// their water like anybody on holiday). Urgency per unit of walking, with the
// ROOM MONEY HELD BACK - which is the wallet mechanic in one line: a visitor
// who still needs a bed will not spend their last $14 on a taco.
function wantsRoom(k) {
  return k.nights > 0 && !k.room && !k.rough && k.nightsHad < k.nights;
}
// WHAT A ROOM COSTS TONIGHT, off the board rather than the recipe table.
// ROOM_RATE is the printed rate; the hotel's own price multiplier is a setting
// its owner moves (and the hotelier below moves it most weeks), so a visitor
// who holds back the RECIPE price walks up to a desk asking more than they
// kept - and payAndBenefit charges the board price and credits the till with
// it whatever the wallet holds, which MINTS the difference. All of it reads
// this one function now.
function roomPrice() { return menuPrice("hotel", BIZ.hotel.recipes[0]); }
function roomReserve(k) { return wantsRoom(k) ? roomPrice() : 0; }
function visLevel(k, need) {
  return need === "food" ? k.hunger : need === "drink" ? k.thirst
    : need === "clean" ? k.dirt : k.bored;
}
function visOpen(b) {
  return bizUnlocked(b) && !bizDark(b) && bizOpenNow(b) && bizStaffed(b);
}
function visRoomFor(k, b) {   // is there a slot left in that line for a tourist?
  const tourQ = customers.filter(c => c.biz === b && !c.isCrab && c !== k && c.state !== "leaving"
    && (c.state === "arriving" || c.state === "waiting" || c.state === "toBiz")).length;
  const allQ = customers.filter(c => c.biz === b && c !== k
    && (c.state === "arriving" || c.state === "waiting" || c.state === "toBiz")).length;
  return tourQ < TOURIST_QUEUE_MAX && allQ < QUEUE_MAX;
}
function visPick(k) {
  const cand = [], res = roomReserve(k);
  // the BOARD price, not the recipe table's. Every till in this game charges
  // menuPrice; a shop that has repriced itself upward would otherwise pull in
  // a visitor who cannot clear the counter, and the counter would credit the
  // owner the full price out of a wallet that never held it. (The crabs' own
  // pickErrand has always read localPrice - this was the one check that did
  // not, and the hotel is the shop most likely to move its board.)
  const afford = (b) => (r) => k.wallet >= menuPrice(b, r) + res;
  const add = (b, need, pickR) => {
    if (!visOpen(b) || !visRoomFor(k, b)) return;
    const rs = BIZ[b].recipes.filter(afford(b));
    if (!rs.length) return;
    cand.push({ biz: b, need, recipe: pickR(rs) });
  };
  const cheap = (rs) => rs.slice().sort((a, b) => a.pay - b.pay)[0];
  // exactly the crabs' own rule (pickErrand): treat yourself when flush, eat
  // cheap when you are watching the money - measured against the same $40 line
  // A VISITOR ORDERS WHAT THEY FANCY. The crabs' own "eat cheap when you are
  // under $40" line is a LOCAL's rule - they have rent to make - and applying
  // it here quietly turned the whole boat into a fish-and-juice crowd and took
  // the average ticket down with it. Somebody on holiday orders off the menu;
  // the only thing that stops them is not being able to afford it at all,
  // which `add` has already checked (price + the room money held back).
  const treat = (rs) => rs[(Math.random() * rs.length) | 0];
  const plate = (rs) => { const f = rs.filter(r => !DRINKS[r.id]); return treat(f.length ? f : rs); };
  if (k.hunger >= VIS_WANT.food) add("shack", "food", plate);
  if (k.thirst >= VIS_WANT.drink) {
    if (visOpen("juicebar")) add("juicebar", "drink", treat);
    else add("shack", "drink", (rs) => cheap(rs.filter(r => DRINKS[r.id]).length ? rs.filter(r => DRINKS[r.id]) : rs));
  }
  if (k.dirt >= VIS_WANT.clean) add("showers", "clean", treat);
  if (k.bored >= VIS_WANT.fun) add("arcade", "fun", treat);
  // A BED IS AN ERRAND LIKE ANY OTHER, and putting it in this scorer rather
  // than in a separate "it's five o'clock" block is what makes the hotel work
  // at all. It sits at the far east end of the promenade, and the desk is only
  // staffed while REEF is on his shift - an earlier build that sent visitors
  // looking at 15:00 gave them a 3.5-hour window and a 1500px walk, and SIX IN
  // TEN overnighters ended up on the sand. Now an overnighter drops their bag
  // on the way in from the boat if nothing is more pressing, and past ROOM_HOUR
  // the bed outranks geography outright - the same escape hatch a DIRE need has.
  if (wantsRoom(k) && k.wallet >= roomPrice() && visOpen("hotel") && visRoomFor(k, "hotel") && freeRoom())
    cand.push({ biz: "hotel", need: "room", recipe: BIZ.hotel.recipes[0] });
  let best = null, bestScore = 0;
  for (const e of cand) {
    const d = Math.abs(k.x - BIZ[e.biz].queueX);
    let s;
    if (e.need === "room") {
      if (tmin >= ROOM_HOUR) s = 99;   // the desk shuts before the town does: go now, wherever you are
      else s = (ROOM_RANK + ROOM_URGE * Math.min(1, Math.max(0, (tmin - 9 * 60) / (ROOM_HOUR - 9 * 60))))
        / (1 + d / DETOUR_SCALE);
    } else {
      // THE BOARD PRICE MOVES THE SHARE. The retired spawn timer carried the
      // price war in its weights (`bizPull` = pull x priceAppeal); the demand
      // model that replaced it chooses by NEED and DISTANCE, so without this
      // term a rival could cut her price all day and take nothing off the shop
      // next door - and the rivalry that ships with it measures exactly that.
      // It is zero sum by construction now: the boat decides HOW MANY guests
      // land, this decides WHOSE door they walk through. priceAppeal is
      // exactly 1 at the default price, so a town nobody has repriced behaves
      // bit-identically.
      s = (VIS_RANK[e.need] + visLevel(k, e.need)) * priceAppeal(e.biz) / (1 + d / DETOUR_SCALE);
    }
    if (s > bestScore) { bestScore = s; best = e; }
  }
  return best;
}
function visGo(k, e) {
  // the room is RESERVED the moment they set off for it - nobody sells the
  // last room twice, and a held room is not a room housekeeping can strip
  if (e.biz === "hotel" && !k.room) { const r = freeRoom(); if (!r) return; r.occupant = k; k.room = r; }
  k.biz = e.biz; k.recipe = e.recipe; k.need = e.need;
  k.state = "toBiz"; k.target = BIZ[e.biz].queueX + 46;
  k.claimed = false; k.served = false; k.happy = false; k.server = null;
}
// ---- MOVEMENT + THE DAY ----------------------------------------------------
function visStep(k, tx, ty, dt) {
  const sp = VIS_SPEED * dt;
  const dx = tx - k.x, dy = (ty == null ? k.wy : ty) - k.wy;
  if (Math.abs(dx) > 1) { k.x += Math.sign(dx) * Math.min(sp, Math.abs(dx)); k.face = Math.sign(dx); }
  if (Math.abs(dy) > 1) k.wy += Math.sign(dy) * Math.min(sp, Math.abs(dy));
  return Math.abs(tx - k.x) <= 1 && Math.abs((ty == null ? k.wy : ty) - k.wy) <= 1;
}
// needs, the clock, and the wallet's own ticking - runs for EVERY visitor,
// whatever state they are in, so a visitor stood in a queue still gets hungry
function visTick(k, dt) {
  const hrs = dt * TS / 60;
  if (k.state === "inRoom") {
    k.tired = Math.max(0, k.tired - VIS_BED_DRAIN * hrs);
    if (tmin >= WAKE_HOUR && tmin < 12 * 60) checkOut(k);
    return;
  }
  if (k.state === "onSand") {
    // THE SAND BANKS NOTHING (sleepRough's rule, verbatim): exhaustion
    // prevents its own cure, and a night out here is a night of it.
    k.dirt = Math.min(1, k.dirt + VIS_RATE.dirt * hrs * 1.5);
    if (tmin >= WAKE_HOUR && tmin < 12 * 60) {
      k.state = "roam"; k.rough = false; k.roughFlag = false; k.target = null;
      visLog(k, "peril", "WOKE UP ON THE SAND - NOT A GREAT NIGHT");
    }
    return;
  }
  for (const n of ["hunger", "thirst", "dirt", "bored", "tired"])
    k[n] = Math.min(1, (k[n] || 0) + VIS_RATE[n] * hrs);
}
function updateVisitor(k, dt) {
  if (k.state === "ashore") {
    // down the planks and into town: along the deck, then onto the promenade
    if (k.leg === 0) { if (visStep(k, FERRY.shore, FERRY.deckY, dt)) k.leg = 1; return; }
    if (visStep(k, FERRY.shore - 18, FLOOR_Y, dt)) { k.state = "roam"; k.target = null; k.y = FLOOR_Y; }
    return;
  }
  if (k.state === "toPier") {
    if (k.leg === 0) {
      if (visStep(k, FERRY.shore, FLOOR_Y, dt)) { k.leg = 1; }
      return;
    }
    visStep(k, FERRY.gangway + 4, FERRY.deckY, dt);
    return;
  }
  if (k.state === "toRoom") {
    const r = k.room;
    if (!r) { k.state = "roam"; return; }
    if (visStep(k, r.x + 2, 148, dt)) { k.state = "inRoom"; visLog(k, "home", "TURNED IN FOR THE NIGHT"); }
    return;
  }
  // ASLEEP, AND THERE IS NOWHERE TO WALK. This guard is not decoration: with
  // no `inRoom` case the state fell through to the ROAM block at the bottom,
  // which reads "it is past BED_HOUR and they have a key" and sends them back
  // to `toRoom` - and they are already stood at their own door, so the very
  // next frame put them back to `inRoom`. That two-state loop ran EVERY FRAME
  // all night: the guest blinked in and out of the world (the door draws an
  // inRoom guest, so drawCustomer skips them) and their card alternated
  // between OFF TO ROOM n and ASLEEP IN ROOM n. It also cost them the bed:
  // visTick's needs loop ran on every `toRoom` frame, so a paid room accrued
  // hunger, thirst, dirt and boredom overnight and drained tiredness at half
  // rate. visTick owns the night - the bed drain and the morning checkout -
  // so there is nothing for the mover to do here.
  if (k.state === "inRoom") return;
  if (k.state === "onSand") { visStep(k, k.target == null ? k.x : k.target, FLOOR_Y, dt); return; }
  if (k.state === "toBiz") {
    if (!visOpen(k.biz)) { k.state = "roam"; k.biz = null; k.target = null; return; }
    if (!visStep(k, k.target, FLOOR_Y, dt)) return;
    if (!visRoomFor(k, k.biz)) {   // the line filled while they walked: come back later
      k.state = "roam"; k.biz = null; k.target = null; k.thinkT = VIS_THINK * 4;
      return;
    }
    k.state = "arriving"; k.spawnX = k.x; k.y = FLOOR_Y;
    // visStep settles within a pixel of its target y, and a line standing on
    // five different y values reads as a huddle however even the spacing is.
    // Everybody in a line stands ON the boardwalk line.
    k.wy = FLOOR_Y;
    k.patience = VIS_PATIENCE; k.maxPatience = VIS_PATIENCE;
    queueJoin(k);   // the ticket is stamped HERE, not when their ferry docked
    noteArrival(k.biz);
    return;
  }
  // ---- ROAM: the whole rest of a visit lives here ---------------------------
  k.thinkT -= dt;
  // TURNING IN. A visitor with a key walks to their door; one without takes
  // the beach, because the desk has shut and there is nowhere else to go.
  if (tmin >= BED_HOUR || tmin < WAKE_HOUR) {
    if (k.room) { k.state = "toRoom"; return; }
    // ...and a visitor only beds down on the sand at ACTUAL BEDTIME. The town
    // opens at 07:00, which is on the wrong side of WAKE_HOUR: without this
    // clause the boat-load a new town starts with was filed as sleeping rough
    // for the first half hour of the game, and docked the town a point of
    // reputation each for a bed nobody could have sold them yet.
    if (!k.rough && tmin >= BED_HOUR) sleepOnSand(k);
    return;
  }
  if (k.thinkT <= 0) {
    k.thinkT = VIS_THINK;
    const e = visPick(k);
    if (e) { visGo(k, e); return; }
  }
  // nothing to buy: stroll the promenade. Imperfection is charming; standing
  // still for eleven hours is not.
  if (k.target == null || Math.abs(k.x - k.target) < 4) {
    if (k.idleT > 0) { k.idleT -= dt; return; }
    k.target = Math.round(Math.max(VIS_ROAM[0], Math.min(VIS_ROAM[1],
      k.x + (Math.random() - 0.5) * 2 * VIS_STROLL)));
    k.idleT = 0;
  }
  if (visStep(k, k.target, FLOOR_Y, dt)) k.idleT = 2 + Math.random() * 5;
}
// A VISIT DOES NOT END AT THE COUNTER. The shop pipeline's `leaving` state
// means "walk away from this counter" for a visitor, not "walk out of the
// world" - they have a day or two left to spend.
function visAfterCounter(k) {
  if (!k.served && k.biz === "hotel" && k.room) { k.room.occupant = null; k.room = null; }
  if (k.served) {
    k.buys++;
    if (k.need === "room") checkIn(k);
  } else {
    visLog(k, "peril", "GAVE UP WAITING AT THE " + (BIZ[k.biz] ? BIZ[k.biz].short : "COUNTER"));
    k.bored = Math.min(1, k.bored + 0.05);
  }
  k.state = "roam"; k.biz = null; k.recipe = null; k.need = null;
  k.table = null; k.stall = null; k.server = null; k.claimed = false; k.served = false;
  k.target = null; k.thinkT = VIS_THINK;
  k.y = FLOOR_Y; k.wy = FLOOR_Y;
}

// ------------------------------------------------------------ standing in line
// A QUEUE IS AN ORDER, NOT AN ARRAY. Places used to be handed out by position
// in `customers` - and a visitor lives in that array for their WHOLE STAY, so
// the line was sorted by which ferry you came off rather than by when you
// joined it. A guest who landed on the 09:00 boat and strolled up fourth took
// the spot at the window and pushed everyone already standing there back a
// place; and because the shuffle was one-way (`if (k.x > slot)`), nobody who
// was pushed back ever moved. They just stood INSIDE the crab in front.
// Measured, seed 4242 x 3 days, waiting pairs: 25.5% in the wrong order, 58%
// closer than half a body, 7900 pair-frames at the same pixel.
// So: your place is stamped when you JOIN the line and never changes, and the
// shuffle steps both ways. `qSeq` is monotonic across the town rather than per
// counter - a single counter is one comparison and the numbers never collide.
let qSeqN = 0;
function queueJoin(k) { k.qSeq = ++qSeqN; }
function inLine(k) { return k.state === "arriving" || k.state === "waiting"; }
// Everyone standing in one business's line, nearest the counter first. It
// stamps a ticket on anything that got into a line without one (a suite
// fixture setting `state` by hand, a save that predates this) so the order is
// always total and the sort is always stable.
function queueOrder(bizKey) {
  const q = customers.filter(k => k.biz === bizKey && inLine(k));
  for (const k of q) if (!k.qSeq) queueJoin(k);
  return q.sort((a, b) => a.qSeq - b.qSeq);
}
function queueLen(bizKey) { return customers.filter(k => k.biz === bizKey && inLine(k)).length; }
// Where the Nth crab in a line stands. Lines run EAST from their counter, one
// place per QUEUE_DX - a shade over the collider's own 12px body, so a queue is
// spaced exactly the way crabs stand everywhere else in town.
function queueSlotX(bizKey, i) { return BIZ[bizKey].queueX + i * QUEUE_DX; }
const QUEUE_STEP = 45;   // px/s of shuffle: the speed the one-way clamp used

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
    qSeq: ++qSeqN,   // a walk-in joins the line the moment it is built
    claimed: false, served: false, server: null };
}
function updateCustomers(dt) {
  trackCloseQueues();   // hours-policy signal: who was still in line when a shop shut
  runFerry(dt * TS);    // the timetable: she docks, lands a batch, and sails
  sweepRooms();         // a room whose guest has left town is an empty room, always
  // one pass over every line, so a place is a POSITION IN THE QUEUE rather than
  // a position in the array. Rebuilt each frame, which is what compacts the
  // line when the front is served: everybody behind moves up exactly one place.
  const qslot = new Map();
  for (const b of Object.keys(BIZ)) queueOrder(b).forEach((k, i) => qslot.set(k, queueSlotX(b, i)));
  for (const k of customers) {
    if (k.visitor) {
      visTick(k, dt);                                        // needs run wherever they are
      if (VIS_STATES[k.state]) { updateVisitor(k, dt); continue; }
    }
    if (k.state === "arriving" || k.state === "waiting") {
      // joined DURING this pass (a visitor whose walk ended a few lines up):
      // stand still, take a place next frame. One frame, and it is the frame
      // they stopped walking on.
      const slot = qslot.has(k) ? qslot.get(k) : k.x;
      // SHUFFLE, BOTH WAYS. The step is clamped to the distance left, so it can
      // never overshoot its slot - which is the whole anti-jitter argument: with
      // no overshoot there is nothing to correct on the next frame, and a place
      // that only ever moves TOWARD the counter can never flip direction either.
      const dxq = slot - k.x;
      if (Math.abs(dxq) <= QUEUE_STEP * dt) { k.x = slot; k.qWalk = false; k.face = -1; }
      else { k.x += Math.sign(dxq) * QUEUE_STEP * dt; k.qWalk = true; k.face = Math.sign(dxq); }
      if (k.state === "arriving") {
        if (k.x === slot) {
          k.state = "waiting";
          popText((k.isCrab ? k.crab.p.name : k.name.split(" ")[0]) + ": " + ITEM_NAMES[k.recipe.icon] + "?", k.x - 26, FLOOR_Y - 42, [255, 255, 255]);
        }
      } else {
        k.patience -= dt * (bizStaffed(k.biz) ? 1 : 6) * serverFilth(k);   // nobody home? give up quick
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
        if (k.visitor) k.dirt = Math.max(0, k.dirt - (k.recipe.deep ? 0.7 : 0.5));   // same soap, same numbers
        if (k.isCrab) {   // dirt-only: TIRED is slept off, not scrubbed off
          k.crab.p.dirt = Math.max(0, (k.crab.p.dirt || 0) - (k.recipe.deep ? 0.7 : 0.5));
          crabLog(k.crab, "need", "TOOK A " + (k.recipe.deep ? "LONG SOAK" : "SHOWER")   // DIARY
            + " AT THE " + BIZ[k.biz].name, 0);
          k.crab.quip = { text: "SQUEAKY CLEAN!", t: 2.4 };
        }
        if (window._stats) {
          window._stats.showersDone = (window._stats.showersDone || 0) + 1;
          const kk = k.crab ? "showersDoneCrab" : "showersDoneTour";   // same split, same reason
          window._stats[kk] = (window._stats[kk] || 0) + 1;
        }
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
      k.patience -= dt * 0.35 * serverFilth(k);   // seated guests relax
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
        // THE FANCIER TIER ARRIVED (owner directive: "add table cleanup").
        // Guests used to bus their own - the outdoor-casual rule. Now they
        // leave the plates where they lie and a STAFF crab clears the table
        // before it can seat again, exactly the shower stalls' dirty/cleaning
        // cycle. Dirty tables idle your seating, so more tables means more
        // busing, which means more staff or slower service: that labour cost
        // is what makes a table a decision instead of a free upgrade.
        // occupant is released FIRST and unconditionally - a table that stayed
        // occupied could never be cleaned (busing requires !occupant), which
        // is the exact shape of the old stall wedge.
        k.table.occupant = null;
        if (window._selfBused) k.table.dishes = 0;        // paired-arm probe: the old outdoor rule
        else { k.table.dishes = 1; k.table.dirty = true; }   // the plates stay on the table
        if (!k.isCrab) {
          // the table tip comes out of the same pocket the plate did: a guest
          // who has spent down to their last dollar leaves what they have
          const tt = k.visitor ? Math.max(0, Math.min(tableTipOf(k.biz), k.wallet)) : tableTipOf(k.biz);
          if (k.visitor) { k.wallet -= tt; k.spent += tt; }
          payTip(k.biz, k.server, tt, k.x, 130);   // table tip on the way out (tourists), split like any other
          if (window._stats) window._stats.tableTip = (window._stats.tableTip || 0) + tt;
          // (payTip pops the gold "+$N TIP" - a second label here was the
          //  third pop on one tip)
        }
        k.state = "leaving";
      }
    } else if (k.state === "leaving") {
      k.x += (k.happy ? 50 : 75) * dt;
      if (k.isCrab) { finishErrand(k); continue; }
      // A VISITOR IS NOT LEAVING TOWN, they are leaving a COUNTER. A few paces
      // clear of the line and the visit picks up where it left off.
      if (k.visitor && Math.abs(k.x - (k.spawnX == null ? k.x : k.spawnX)) > 26) { visAfterCounter(k); continue; }
    }
  }
  // A visitor stays until the ferry takes them; everybody else goes as before.
  customers = customers.filter(k => k.visitor ? !k.gone : k.isCrab ? !k.done : k.x < (k.spawnX || WORLD_W) + 20);
  // (THE OLD SPAWN TIMER LIVED HERE.) Tourist demand is no longer a clock: it
  // is the visitors who are actually in town, deciding what they fancy. The
  // reputation term the timer carried now sets the SIZE OF THE BOAT instead -
  // see ferryBatch(). newCustomer() survives as the anonymous walk-in builder
  // the suite's fixtures use to stage a queue.
}

// ---------------------------------------------------------------- status text
function tapStatus(c) {
  const e = c.tapStop, nm = !e ? "THE TAP" : e.soup ? "THE SHELTER POT" : WATER_TAPS[e.tap].name;
  if (!e || c.tapT <= 0) return "WALKING TO " + nm;
  if (e.soup) return "IN THE LINE AT " + nm;
  return e.need === "clean" ? "RINSING OFF AT " + nm : "DRINKING AT " + nm;
}
const NAP_WHERE = { grill: "AT THE GRILL", board: "AT THE BOARD", juicer: "AT THE JUICER",
  crate: "AT THE CRATE", pass: "AT THE PASS" };
function crabStatus(c) {
  // THE TEN-SECOND TELLS come first: what the eyes just saw has to be what the
  // card says (design doc Rule 4). A nodding crab is not "ON SHIFT".
  if ((c.napT || 0) > 0)
    return "NODDED OFF " + (c.napFrom === "cleaningStall" || c.napFrom === "toStallClean"
      ? "OVER A STALL" : NAP_WHERE[c.slotKind] || "ON THE JOB");
  if (c.dayState === "chat")
    return "CHEWING THE FAT" + (c.chatWith ? " WITH " + c.chatWith.p.name : "");
  if (c.p.rough) return darkness() > 0.6 ? "ASLEEP WHERE THEY DROPPED" : "SLEPT ROUGH LAST NIGHT";
  if (c.p.sick) return (gravelyIll(c) ? "GRAVELY ILL - DAY " : "SICK - DAY ") + ((c.p.sick.days || 0) + 1)
    + (onSickDay(c) ? " - RESTING UP" : " - WORKING THROUGH IT");
  if (walkoutToday(c)) {   // an unauthorised day: same beach, no wage, nobody covering
    const why = c.p.walkoutWhy === "pay" ? " OVER THE PAY" : "";
    if (c.dayState === "toErrand") return "WALKED OUT - OFF TO " + BIZ[c.errandBiz].short;
    if (c.dayState === "errand") return "WALKED OUT - AT " + BIZ[c.errandBiz].name;
    if (c.dayState === "home" && darkness() > 0.7) return c.p.homeless ? "SLEEPING AT THE SHELTER" : "SLEEPING";
    if (c.dayState === "home") return tmin < OFF_WAKE ? "WALKED OUT - LYING IN" : "WALKED OUT" + why + " - ON THE BEACH";
  }

  if (offToday(c)) {   // sick beats off; off beats everything but the commute home
    if (c.dayState === "toErrand") return "DAY OFF - OFF TO " + BIZ[c.errandBiz].short;
    if (c.dayState === "errand") return "DAY OFF - AT " + BIZ[c.errandBiz].name;
    if (c.dayState === "selfCook") return "DAY OFF - RAIDING THE PANTRY";
    if (c.dayState === "atBall") return "DAY OFF - BEACH BALL";
    if (c.dayState === "atTap") return "DAY OFF - " + tapStatus(c);
    if (c.dayState === "toHome") return "DAY OFF - STROLLING HOME";
    if (c.dayState === "home") {
      if (darkness() > 0.7) return c.p.homeless ? "SLEEPING AT THE SHELTER" : "SLEEPING";
      if (tmin < OFF_WAKE) return "DAY OFF - SLEEPING IN";
      return "DAY OFF - BEACHCOMBING";
    }
  }
  if (c.p.job === "fishing" && c.dayState === "working") return "FISHING OFF THE PIER";
  if (c.dayState === "home") {
    if (darkness() > 0.7) return c.p.homeless ? "SLEEPING AT THE SHELTER" : "SLEEPING";
    return c.p.homeless ? "AT THE SHELTER" : "CHILLING AT HOME";
  }
  if (c.dayState === "working") {
    // IDLE HANDS: still clocked in, just not standing where you left them
    // the rival's stakeout reads as what it is, not as a stroll
    if (c.wanderT > 0 && c.wander) return (c.wander.eyeing ? "SIZING UP " : "WATCHING ") + c.wander.label;
    if (c.wander) return (c.wander.eyeing ? "WALKING OVER TO " : "WANDERED OFF TO ") + c.wander.label;
    if (c.kstate === "work" && c.slotKind === "board") return "CHOPPING";
    if (c.kstate === "work" && c.slotKind === "grill") return "GRILLING";
    if (c.kstate === "toStallClean" || c.kstate === "cleaningStall") return "SCRUBBING A STALL";
    if (c.kstate === "toTableClean" || c.kstate === "busingTable") return "BUSING A TABLE";
    if (c.kstate === "work") return "GRABBING FOOD";
    if (c.carrying) return "CARRYING " + ITEM_NAMES[c.carrying];
    if (c.kstate === "waitCash") return "SHORT ON CASH!";
    if (c.kstate === "waitSlot") return "WAITING FOR A SPOT";
    return coveringToday(c) ? "COVERING A COWORKER'S SHIFT" : "ON SHIFT";
  }
  if (c.dayState === "directed") return c.order && c.order.idleT >= 0 ? "TAKING A BREATHER" : "AS ORDERED";
  if (c.dayState === "selfCook") {
    if (c.cookNeed === "drink") return c.cookStep >= 3 ? "POURING A DRINK" : "RAIDING THE FRUIT BIN";
    return c.cookStep >= 3 ? "COOKING A STAFF MEAL" : "RAIDING THE PANTRY";
  }
  if (c.dayState === "toErrand") return "OFF TO " + BIZ[c.errandBiz].name;
  if (c.dayState === "errand") return "IN LINE AT " + BIZ[c.errandBiz].name;
  if (c.dayState === "atBall") return c.ballT > 0 ? "PLAYING BEACH BALL" : "OFF TO THE BEACH BALL";
  if (c.dayState === "atTap") return tapStatus(c);
  const toWork = c.dayState === "toWork";
  if (c.cstate === "waitBus") return "WAITING FOR THE BUS";
  if (c.cstate === "onBus") return "RIDING THE BUS";
  if (c.cstate === "walkToStop") return "WALKING TO THE BUS";
  if (c.cstate === "drive") return (c.p.mode === "bike" ? "BIKING" : "DRIVING") + (toWork ? " TO WORK" : " HOME");
  return (toWork ? "WALKING TO WORK" : "HEADING HOME");
}

// ---------------------------------------------------------------- THE CRAB DIARY
// Every crab in town keeps its own diary: what it DID, in the town's voice,
// oldest first, bounded. One API - crabLog(crab, category, line) - so a new
// behaviour anywhere in the game is a ONE-LINE hook where that behaviour
// already lives, and nothing has to be refactored to make a life legible.
//
// The rules, in order of importance:
//   1. AN ENTRY IS SOMETHING YOU'D TELL A FRIEND. "SERVED A FISH TACO TO
//      MISTY", never "state changed to errand". Past tense, named, specific.
//      One line for the whole serve - not three for approach/cook/deliver.
//   2. IT IS BOUNDED, AND IT RIDES THE SAVE FOR FREE. LOG_MAX entries per
//      crab, oldest dropped; each entry is a 4-element ARRAY
//      [day, minute, category, line] rather than an object, because save()
//      writes the personas wholesale and array entries cost ~40% fewer bytes
//      than the same fields keyed. Old saves simply have no log.
//   3. IT NEVER RUNS ON A TICK. Every hook sits at an event that already
//      happens exactly once. Anything repetitive carries a minimum gap in
//      GAME MINUTES (crabLog's 4th arg, or crabLogEvery for a whole class of
//      line) so a rush hour reads as a few named plates and a fishing day as
//      one tally - not forty identical entries.
//   4. IT IS BEHAVIOUR-NEUTRAL. No RNG, no sim state, nothing read back by
//      the simulation. The frozen day-2 fingerprint must not move.
const LOG_MAX = 40;          // ~2-4 days for a busy chef, a fortnight for a quiet fisher
const LOG_GAP = 45;          // default: the same line again within the hour is the same event
const LOG_SERVE_GAP = 25;    // ...and a chef in a rush files a named plate about every half hour
const LOG_TEXT = 39;         // characters that fit the diary column at the 3x5 font
// the colour a category reads in: work is business, money is coin, home is the
// housing ladder (the spine of a crab's run), need is self-care, life is the
// big turns, peril is the trouble, social is reserved for the crabs-chatting
// work landing alongside this one.
const LOG_CATS = {
  work:   [70, 90, 130],
  money:  [150, 115, 40],
  home:   [70, 140, 200],
  need:   [40, 150, 70],
  life:   [140, 100, 175],
  peril:  [190, 80, 80],
  social: [200, 110, 160],
};
const SHIFT_WORD = { M: "MORNING", E: "EVENING", D: "OPEN-TO-CLOSE" };
// the load-side guard: an old save has no log, an imported one might have
// anything. Keep only well-formed entries, keep only the last LOG_MAX.
function clampLog(p) {
  if (!Array.isArray(p.log)) { if (p.log != null) delete p.log; return; }
  const ok = p.log.filter(e => Array.isArray(e) && e.length >= 4 && typeof e[3] === "string");
  p.log = ok.slice(-LOG_MAX).map(e => [+e[0] || 1, +e[1] || 0, LOG_CATS[e[2]] ? e[2] : "life", e[3].slice(0, LOG_TEXT)]);
}
function crabLog(c, cat, line, gap) {
  if (!c || !c.p || !line) return;
  const log = c.p.log || (c.p.log = []);
  const txt = String(line).slice(0, LOG_TEXT);
  const now = day * 1440 + tmin, win = gap == null ? LOG_GAP : gap;
  for (let i = log.length - 1; i >= 0; i--) {          // rate limit: only ever scans the window
    const e = log[i];
    if (now - (e[0] * 1440 + e[1]) > win) break;
    if (e[2] === cat && e[3] === txt) return;
  }
  log.push([day, Math.round(tmin), cat, txt]);
  if (log.length > LOG_MAX) log.splice(0, log.length - LOG_MAX);
}
// ...and the same door for a whole CLASS of line that would otherwise spam:
// a chef's plates all read differently (different guest, different dish), so
// the text-dedup above can't catch them. The slot stamp is transient state on
// the entity, never the persona - a reload costs at most one extra entry.
function crabLogEvery(c, slot, mins, cat, line) {
  if (!c || !c.p) return;
  const now = day * 1440 + tmin, seen = c._logAt || (c._logAt = {});
  if (seen[slot] != null && now - seen[slot] < mins) return;
  seen[slot] = now;
  crabLog(c, cat, line, 0);
}
// ---- HOUSING IS THE SPINE (owner: "should also keep track of housing status
// carefully"). Every move names the PLACE, and the diary also keeps a compact
// trail + a nights tally on the persona, so a crab whose log has rolled over
// still shows whether their life has been going up or down at a glance.
// short on purpose: a diary line has 39 characters, and the full address
// ("HOUSE 3 ON THE PROMENADE") already lives on the profile's HOME row
function placeName(p) {
  if (p.boat != null) return "THE " + BOAT_NAMES[p.boat];
  if (p.homeless) return "THE SHELTER";
  if (p.house >= 7) return "A BEACH COTTAGE";
  return "HOUSE " + (p.house + 1);
}
function placeTag(p) {   // the trail's short form: SHELTER > HOUSE 3 > COTTAGE
  if (p.boat != null) return BOAT_NAMES[p.boat];
  if (p.homeless) return "SHELTER";
  if (p.house >= 7) return "COTTAGE";
  return "HOUSE " + (p.house + 1);
}
function logHome(c, line) {
  const p = c.p, tag = placeTag(p), t = p.homeTrail || (p.homeTrail = []);
  if (t[t.length - 1] !== tag) t.push(tag);
  if (t.length > 4) t.shift();          // the last four addresses; the tally carries the rest
  p.homeSince = day;
  crabLog(c, "home", line, 0);
}
function homeTrail(p, n) {
  const t = p.homeTrail && p.homeTrail.length ? p.homeTrail : [placeTag(p)];
  return t.slice(-(n || 4)).join(" > ");   // the last few addresses; the tally carries the rest
}
// ---- the composite hooks: one call at each event site, all the shaping here
// ONCE A DAY, not once per return: a fisher who breaks for lunch walks back
// out to the rail two or three times, and only the first is news.
function logClockIn(c) {
  crabLogEvery(c, "clockin", 720, "work", c.p.job === "fishing"
    ? (c.p.boat != null ? "CAST OFF FROM THE " + BOAT_NAMES[c.p.boat] : "TOOK UP A SPOT ON THE PIER")
    : "CLOCKED IN AT THE " + BIZ[c.p.job].name);
}
function logShiftEnd(c) {
  crabLog(c, "work", c.p.job === "fishing" ? "CAME OFF THE WATER FOR THE DAY"
    : coveringToday(c) ? "COVERED A DOUBLE SHIFT AT THE " + BIZ[c.p.job].short
    : "FINISHED THE " + (SHIFT_WORD[c.p.shift] || "") + " SHIFT", 0);
  if ((c.otMin || 0) >= 15)
    crabLog(c, "work", "WORKED " + Math.round(c.otMin / 6) / 10 + "H OF OVERTIME", 0);
}
function logServe(c, cust) {
  if (!c || !c.p || !cust.recipe) return;
  const who = cust.isCrab ? (cust.crab && cust.crab.p.name) || "A NEIGHBOUR"
    : (cust.name || "A TOURIST").split(" ")[0];   // a guest without a name is still a sale
  crabLogEvery(c, "serve", LOG_SERVE_GAP, "work",
    "SERVED A " + (ITEM_NAMES[cust.recipe.icon] || "PLATE") + " TO " + who);
}
function logTreat(cust) {   // the crab on the OTHER side of the counter
  const c = cust.crab;
  if (!c || !c.p || !cust.recipe) return;
  if (cust.need === "clean") return;   // the wash is filed when they step OUT of the stall, not when the kit is handed over
  const what = ITEM_NAMES[cust.recipe.icon] || "SOMETHING", where = BIZ[cust.biz].name;
  const drank = cust.need === "drink" || DRINKS[cust.recipe.id];   // a juice bought as lunch is still a drink
  crabLog(c, "need", cust.need === "fun" ? "BLEW OFF STEAM AT THE " + where
    : (drank ? "DRANK A " : "ATE A ") + what + " AT THE " + where, 0);
}
function logCatch(c, haul) {
  c.caughtToday = (c.caughtToday || 0) + haul;                 // tallied, filed once at dusk
  if (haul >= 4) crabLog(c, "work", "LANDED THE BIG ONE - $" + trade.price * haul, 0);
}
function logLaidOff(k) {   // called from layOff BEFORE the job fields are cleared
  const b = k.p.owner ? Object.keys(BIZ).find(b2 => bizOwner(b2) === k.p.owner) : null;
  crabLog(k, "life", b ? "LOST THE " + BIZ[b].name + " - SHUTTERS UP"
    : k.p.npc ? "WAS LAID OFF - BACK TO THE PIER" : "WAS LAID OFF - BACK TO THE KITCHEN", 0);
}
function logFellIll(c) {
  const p = c.p, why = [];
  if ((p.hunger || 0) >= 0.9) why.push("STARVED");
  if ((p.thirst || 0) >= 0.9) why.push("PARCHED");
  if ((p.dirt || 0) >= 0.9) why.push("FILTHY");
  if ((p.tired || 0) >= 0.9) why.push("WORN OUT");
  crabLog(c, "peril", "FELL ILL" + (why.length ? " - " + why.join(", ") : ""), 0);
}
// One pass per crab at settlement: the nights tally the housing banner reads,
// the day's fishing filed as ONE line, and the needs a crab took to bed. This
// is the "crossed a threshold" entry - once a night, never per tick.
function logNightly(c) {
  const p = c.p, tr = p.homeTrail;
  if (p.homeless) p.nCot = (p.nCot || 0) + 1; else p.nHome = (p.nHome || 0) + 1;
  // the FIRST night of a cot spell, never the twentieth (an eviction has
  // already written its own line, which leaves SHELTER on the trail)
  if (p.homeless && (!tr || !tr.length || tr[tr.length - 1] !== "SHELTER")) logHome(c, "TOOK A COT AT THE SHELTER");
  if (!p.homeTrail || !p.homeTrail.length) { p.homeTrail = [placeTag(p)]; if (!p.homeSince) p.homeSince = day; }
  if (c.caughtToday) {
    crabLog(c, "work", "LANDED " + c.caughtToday + " FISH"
      + (p.boat != null ? " FROM THE " + BOAT_NAMES[p.boat] : " OFF THE PIER"), 0);
    c.caughtToday = 0;
  }
  // a convalescent day looks like silence from the outside - say what it was
  if (p.sick) crabLog(c, "peril", "SPENT THE DAY LAID UP - DAY " + ((p.sick.days || 0) + 1), 0);
  if ((p.hunger || 0) >= 0.9) crabLog(c, "peril", "WENT TO BED HUNGRY", 0);
  if ((p.thirst || 0) >= 0.9) crabLog(c, "peril", "WENT TO BED PARCHED", 0);
  if ((p.dirt || 0) >= 0.9) crabLog(c, "peril", "WENT TO BED FILTHY", 0);
  if ((p.tired || 0) >= 0.9) crabLog(c, "peril", "WENT TO BED DEAD ON THEIR FEET", 0);
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
  if (b.key === "_biz2") return "juicebar";   // the laundromat's old slot: squeeze, don't scrub
  return b.key;
}
function tryBuy(key) {
  const u = UPS[key];
  if (!u || u.lvl >= u.max || coins < upCost(u)) return;
  if (key === "chef" && !recruitBites("shack")) {   // refused BEFORE the money moves
    toast = { text: "NOBODY'S BITING AT $" + bizWage("shack") + " - THE FISH ARE PAYING $"
      + Math.round(pierDay()) + " A DAY", t: 8 };
    if (typeof sfx !== "undefined" && sfx.angry) sfx.angry();
    return;
  }
  coins -= upCost(u); u.lvl++;
  if (key === "arcade") {
    toast = { text: "THE CLAWCADE IS YOURS! CLICK A CRAB, THEN ITS CARD, TO STAFF IT", t: 8 };
    popText("GRAND OPENING!", BIZ.arcade.x0 + 40, 100, [140, 255, 160]);
  }
  if (key === "juicebar") {
    toast = { text: "THE JUICE BAR IS YOURS! REASSIGN A CRAB TO WORK THE JUICERS", t: 8 };
    popText("GRAND OPENING!", BIZ.juicebar.x0 + 20, 100, [140, 255, 160]);
  }
  if (key === "chef") hireCrew();   // recruited from the tourist pool (or the bus), never minted with a house
  sfx.buy(); save();
}

// THE FERRY'S BUY PATH, whole - the same shape as tapSaleChip, for the same
// reason: the world click handler decides only WHICH chip was hit, so the
// suite drives exactly the code a tap drives and nothing forks into tools/.
// Two taps, because $20,000 is emphatically not a misclick.
function tapFerryChip() {
  if (won || !ferryKnown()) return false;
  if (coins < FERRY_PRICE) {
    toast = { text: "THE FARE IS $" + ferryFare() + " - YOU HAVE $" + fmt(Math.round(coins)), t: 5 };
    ferryArm = 0;
    if (typeof sfx !== "undefined" && sfx.angry) sfx.angry();
    return false;
  }
  if (ferryArm <= 0) {
    ferryArm = 4;
    toast = { text: "TAP AGAIN TO BUY THE FERRY FOR $" + ferryFare(), t: 4 };
    if (typeof sfx !== "undefined" && sfx.ding) sfx.ding();
    return false;
  }
  return winFerry();
}
// The win. It does NOT stop the world mid-frame and put a card over it: the
// camera swings to the pier, she comes alongside, and the ending only lands
// once winT has run (drawEnding). Everything about it is snapshotted here so
// a reloaded save shows the identical ending.
function winFerry() {
  if (won || coins < FERRY_PRICE) return false;
  coins -= FERRY_PRICE;
  ferryArm = 0; won = true; winT = 0;
  const town = allCrabs().filter(k => !k.hidden);
  winRec = {
    day, lifetime: Math.round(lifetime),
    crew: crabs.map(c => c.p.name).slice(0, 8),
    pop: town.length,
    housed: town.filter(k => !k.p.homeless).length,
    // whoever takes the rope is a real crab from this town, picked at the
    // moment it happens - a fisher first, because they have waited longest
    hand: (town.find(k => k.p.job === "fishing") || town[0] || { p: { name: "SOMEBODY" } }).p.name,
  };
  gameOver = true; toast = null; report = null; reportT = 0;
  camX = clampCam(FERRY.hull - W / 2 + 14);   // she is at her own berth; go and look at her
  followIdx = -1; followNpc = null; followCust = null;
  manage = null; dossier = null; boardView = false; saveView = false;
  popText("THE FERRY IS YOURS", PIER_X0 - 20, 70, [255, 240, 170]);   // the day boat says "IS IN" four times a day
  if (music) { music.pause(); music = null; }
  sfx.ding(); sfx.coin();
  save();
  return true;
}

// THE TIP SLIDER is a real slider: tap anywhere on the track to set it, or
// hold and drag the thumb. One write path (setTipShare) does the clamping and
// the 5% snap, so the number drawn is always the number being paid.
let tipDrag = false;
function tipSliderTo(bizKey, px) {
  const tr = manageRects().tipTrack;
  setTipShare(bizKey, (px - tr.x - 3) / (tr.w - 7));
}
function tipTrackHit(p) {
  if (!manage || manageTab !== "SCHEDULE" || dossier || saveView) return false;
  const tr = manageRects().tipTrack;
  return p.x >= tr.x - 4 && p.x < tr.x + tr.w + 4 && p.y >= tr.y - 3 && p.y < tr.y + tr.h + 3;
}
let dragging = false, dragStartX = 0, dragCamX = 0, dragMoved = false;
// SCRUBBING THE NAV STRIP is its own grab, exactly as the tip slider is: a
// finger on the map must move the CAMERA, never pan the town underneath it.
let navDrag = false, navDragX = 0;
cv.addEventListener("mousedown", (ev) => {
  if (ev.button !== 0) return;   // right button is for orders - it must not pan or drop the follow
  const p = evPos(ev);
  if (tipTrackHit(p)) { tipDrag = true; return; }   // grabbing the thumb must never pan the town behind the card
  if (navTrackHit(p)) { navDrag = true; navDragX = p.x; return; }
  if (p.y < PANEL_Y) { dragging = true; dragStartX = p.x; dragCamX = camX; dragMoved = false; }
});
addEventListener("mousemove", (ev) => {
  if (tipDrag) { tipSliderTo(manage, evPos(ev).x); return; }
  if (navDrag) {
    const p = evPos(ev);
    // past the same 4px the town's own pan uses this is a SCRUB, not a tap:
    // dragMoved swallows the click that follows, so it never also snaps
    if (Math.abs(p.x - navDragX) > 4) { dragMoved = true; navScrubTo(p.x); }
    return;
  }
  if (!dragging) return;
  const p = evPos(ev);
  if (Math.abs(p.x - dragStartX) > 4) { dragMoved = true; followIdx = -1; followNpc = null; followCust = null; }   // camera only: sel survives the pan
  if (dragMoved) camX = clampCam(dragCamX - (p.x - dragStartX));
});
addEventListener("mouseup", () => {
  if (tipDrag) { tipDrag = false; sfx.buy(); save(); }
  navDrag = false;
  dragging = false; setTimeout(() => { dragMoved = false; }, 50);
});
cv.addEventListener("touchstart", (ev) => {
  const t = ev.touches[0];
  const p = evPos(t);
  if (window.MergeMode && MergeMode.touchStart(p)) return;
  if (tipTrackHit(p)) { tipDrag = true; return; }
  if (navTrackHit(p)) { navDrag = true; navDragX = p.x; return; }
  if (p.y < PANEL_Y) { dragging = true; dragStartX = p.x; dragCamX = camX; dragMoved = false; }
}, { passive: true });
cv.addEventListener("touchmove", (ev) => {
  if (tipDrag) { ev.preventDefault(); tipSliderTo(manage, evPos(ev.touches[0]).x); return; }
  if (window.MergeMode && MergeMode.touchMove(evPos(ev.touches[0]))) { ev.preventDefault(); return; }
  if (navDrag) {
    ev.preventDefault();
    const p = evPos(ev.touches[0]);
    if (Math.abs(p.x - navDragX) > 6) { dragMoved = true; navScrubTo(p.x); }
    return;
  }
  if (!dragging) return;
  ev.preventDefault();
  const p = evPos(ev.touches[0]);
  if (Math.abs(p.x - dragStartX) > 6) { dragMoved = true; followIdx = -1; followNpc = null; followCust = null; }   // camera only: sel survives the pan
  if (dragMoved) camX = clampCam(dragCamX - (p.x - dragStartX));
}, { passive: false });
cv.addEventListener("touchcancel", () => {
  tipDrag = false; navDrag = false;
  dragging = false; dragMoved = false;
  if (window.MergeMode && MergeMode.touchCancel) MergeMode.touchCancel();
}, { passive: true });
cv.addEventListener("touchend", (ev) => {
  if (tipDrag) { tipDrag = false; dragging = false; dragMoved = false; sfx.buy(); save(); return; }
  const t = ev.changedTouches && ev.changedTouches[0];
  if (window.MergeMode && MergeMode.touchEnd(t ? evPos(t) : null)) { dragging = false; dragMoved = false; return; }
  navDrag = false;
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
  if (saveView) { handleSaveClick(evPos(ev)); return; }   // the towns card swallows every click
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
      if (p.y >= ny + 20 && p.y < ny + 36) { openSaveView(); sfx.ding(); return; }
    }
    return;
  }
  if (screen === "intro") {
    const p = evPos(ev);
    if (p.x >= W / 2 - 56 && p.x < W / 2 + 56 && p.y >= 152 && p.y < 170) { screen = "play"; sfx.ding(); }
    return;
  }
  // the ending swallows the click that starts the next town - but not until it
  // has actually finished arriving, or an eager tap eats the whole ending
  if (gameOver) { if (!won || winT >= WIN_BEAT + 0.9) newGame(); return; }
  if (dossier) {
    // the DOES row doubles as the reassignment control for crew crabs; the
    // SHIFT and HEALTH rows are the labor-policy controls (OT / sick day)
    const pt = evPos(ev);
    const owned = Object.keys(BIZ).filter(b => bizUnlocked(b) && bizOwner(b) === "player");
    const c = dossier;
    const inRow = (r) => r && pt.x >= r.x && pt.x < r.x + r.w && pt.y >= r.y && pt.y < r.y + r.h;
    // the bottom control bar first - it is live on BOTH pages and for tourists
    const DR = dossierRects(c.p ? DOSS_H : c.visitor ? VIS_H : CUST_H);
    if (inRow(DR.follow)) {   // camera AND selection, then get out of the way
      followCrab(c); dossier = null; manage = null; boardView = false; sfx.ding(); return;
    }
    if (inRow(DR.close)) { dossier = null; if (manage) sfx.ding(); return; }
    if (c.p) {
      for (const t of DOSS_TABS) if (inRow(DR.tab[t])) { dossierTab = t; diaryPage = 0; sfx.ding(); return; }
      if (dossierTab === "DIARY") {   // paging only; the profile's row controls are that page's
        const pages = Math.max(1, Math.ceil(((c.p.log || []).length) / DIARY_ROWS));
        if (inRow(DR.prev)) { diaryPage = (diaryPage + pages - 1) % pages; sfx.ding(); return; }
        if (inRow(DR.next)) { diaryPage = (diaryPage + 1) % pages; sfx.ding(); return; }
        dossier = null; if (manage) sfx.ding();
        return;
      }
    }
    if (c.p && !c.p.npc && owned.length > 1 && pt.y >= 47 && pt.y < 57 && pt.x >= 24 && pt.x < 232) {
      c.p.job = owned[(owned.indexOf(c.p.job) + 1) % owned.length];
      sfx.buy();
      popText("NEW JOB: " + BIZ[c.p.job].name, c.x - 20, FLOOR_Y - 34, [140, 255, 160]);
      return;
    }
    if (c.p && inRow(dossierHit.ot)) {
      c.p.ot = !c.p.ot; sfx.buy(); save();
      popText(c.p.ot ? "OVERTIME REQUESTED" : "OFF OVERTIME", c.x - 22, FLOOR_Y - 34,
        c.p.ot ? [255, 216, 96] : [180, 170, 190]);
      return;
    }
    if (c.p && inRow(dossierHit.sick)) {
      c.p.sickPol = onSickDay(c) ? "require" : "grant"; sfx.buy(); save();
      popText(onSickDay(c) ? "GO HOME AND REST" : "WE NEED YOU IN", c.x - 22, FLOOR_Y - 34,
        onSickDay(c) ? [140, 255, 160] : [255, 150, 130]);
      return;
    }
    dossier = null;
    if (manage) sfx.ding();   // opened from the census: fall back to the card underneath
    return;
  }
  if (manage) {
    // the management card swallows every click; only its controls act
    const pt = evPos(ev), R = manageRects(), b = BIZ[manage], h = b.hours;
    const hit = (r) => pt.x >= r.x && pt.x < r.x + r.w && pt.y >= r.y && pt.y < r.y + r.h;
    for (const t of MANAGE_TABS) if (hit(R.tab[t])) { manageTab = t; sfx.ding(); return; }
    if (manageTab === "HOURS") {
      if (hit(R.om)) { setBizHours(manage, h.open - 30, h.close); sfx.buy(); save(); return; }
      if (hit(R.op)) { setBizHours(manage, Math.min(h.open + 30, h.close - HOURS_SPAN_MIN), h.close); sfx.buy(); save(); return; }
      if (hit(R.cm)) { setBizHours(manage, h.open, Math.max(h.close - 30, h.open + HOURS_SPAN_MIN)); sfx.buy(); save(); return; }
      if (hit(R.cp)) { setBizHours(manage, h.open, h.close + 30); sfx.buy(); save(); return; }
      if (hit(R.pm)) { setBizPrice(manage, bizPriceMul(manage) - PRICE_STEP); sfx.buy(); save(); return; }
      if (hit(R.pp)) { setBizPrice(manage, bizPriceMul(manage) + PRICE_STEP); sfx.buy(); save(); return; }
      if ((manage === "shack" || manage === "juicebar") && hit(R.meal)) {
        b.mealPol = MEAL_POLS[(MEAL_POLS.indexOf(b.mealPol) + 1) % MEAL_POLS.length];
        sfx.ding(); save(); return;
      }
    } else if (manageTab === "SCHEDULE") {
      if (hit(R.auto)) {
        b.autoLabor = !b.autoLabor; sfx.buy(); save();
        toast = { text: b.autoLabor ? BIZ[manage].short + ": THE ROTA MANAGES ITSELF NOW"
          : BIZ[manage].short + ": YOU'RE CALLING THE SHIFTS", t: 5 };
        return;
      }
      if (hit(R.tipTrack)) { tipSliderTo(manage, pt.x); sfx.buy(); save(); return; }
      if (hit(R.sickPol)) {
        b.sickPol = b.sickPol === "require" ? "grant" : "require"; sfx.buy(); save();
        toast = { text: BIZ[manage].short + " SICK DAYS: " + SICK_POL_LABEL[b.sickPol], t: 5 };
        return;
      }
      // the shop rate: what the board advertises, what a new hire starts on,
      // and the default every crab falls back to
      if (hit(R.wm)) { setBizWage(manage, bizWage(manage) - 1); sfx.buy(); save(); return; }
      if (hit(R.wp)) { setBizWage(manage, bizWage(manage) + 1); sfx.buy(); save(); return; }
      if (hit(R.wall)) {   // APPLY TO ALL: tear up every private deal at this shop
        const n = applyShopWage(manage);
        toast = { text: n ? BIZ[manage].short + ": " + n + " BACK ON $" + bizWage(manage)
          : BIZ[manage].short + ": EVERYONE'S ALREADY ON $" + bizWage(manage), t: 5 };
        sfx.buy(); save(); return;
      }
      const staff = allCrabs().filter(c => c.p.job === manage);
      for (let i = 0; i < Math.min(staff.length, R.rows.length); i++) {
        const c = staff[i], cell = R.cells[i];
        if (hit(cell.wdn) || hit(cell.wup)) {   // a private deal, above or below the shop rate
          setCrabWage(c, Math.round(wageRate(c)) + (hit(cell.wup) ? 1 : -1));
          sfx.buy(); save(); return;   // DIARY HOOK: the player moved this crab's rate
        }
        if (hit(cell.name)) { dossier = c; sfx.ding(); return; }
        if (hit(cell.shift)) {   // M -> E -> D -> M: the roster's one real assignment
          const order = ["M", "E", "D"];
          c.p.shift = order[(order.indexOf(c.p.shift) + 1) % order.length];
          sfx.buy(); save(); return;
        }
        if (hit(cell.ot)) {
          if (c.p.owner || c.p.job === "fishing") { toast = { text: c.p.name + " WORKS FOR THEMSELVES", t: 4 }; sfx.angry(); return; }
          c.p.ot = !c.p.ot; sfx.buy(); save(); return;
        }
        if (hit(cell.sick)) {   // per-crab override cycles: shop rule -> always grant -> must work
          c.p.sickPol = c.p.sickPol == null ? "grant" : c.p.sickPol === "grant" ? "require" : null;
          if (c.p.sickPol == null) delete c.p.sickPol;
          sfx.buy(); save(); return;
        }
      }
    } else if (manageTab === "HALL") {
      // THE TOWN HALL. Reading surface plus one decision - do you stand? -
      // and the platform you would stand on. While your crab holds the hat
      // the same three dials ARE the town's policy, and they bill you first.
      if (hit(R.hview)) {
        // ONE CHIP, and on the ROLL it also turns the page - BOOKS, the BALLOT,
        // then every page of the roll, then back to BOOKS. A card this full has
        // no room for a pair of arrows, and the roll is a thing you read
        // straight through rather than jump around in.
        const pages = Math.max(1, Math.ceil(((hall.poll && hall.poll.lines.length) || 0) / ROLL_ROWS));
        if (hallView === "ROLL" && hallRollPage + 1 < pages) hallRollPage++;
        else {
          hallRollPage = 0;
          hallView = HALL_VIEWS[(HALL_VIEWS.indexOf(hallView) + 1) % HALL_VIEWS.length];
        }
        sfx.ding(); return;
      }
      if (hit(R.stand)) {
        if (playerMayor()) { toast = { text: hall.mayor + " ALREADY WEARS THE HAT", t: 4 }; sfx.angry(); return; }
        if (!crabs.length) { toast = { text: "YOU HAVE NOBODY TO PUT UP", t: 4 }; sfx.angry(); return; }
        hall.stand = !hall.stand;
        if (hall.stand && !crabs.some(c => c.p.name === hall.nominee)) hall.nominee = crabs[0].p.name;
        toast = { text: hall.stand ? hall.nominee + " IS STANDING FOR MAYOR" : "YOU WITHDREW FROM THE BALLOT", t: 5 };
        sfx.buy(); save(); return;
      }
      if (hit(R.nom)) {   // cycle the crew: somebody has to actually wear it
        if (playerMayor()) { toast = { text: "NOT MID-TERM - " + hall.mayor + " IS MAYOR", t: 4 }; sfx.angry(); return; }
        const i = crabs.findIndex(c => c.p.name === hall.nominee);
        if (crabs.length) hall.nominee = crabs[(i + 1 + crabs.length) % crabs.length].p.name;
        sfx.ding(); save(); return;
      }
      {
        // ONE SET OF DIALS, and `hall.plat` is the only copy of them. While
        // your crab wears the hat it is mirrored straight onto the town's live
        // policy - so a change bills the whole town at tonight's settlement,
        // your own till first - and it is also the record you defend at the
        // next ballot, because an incumbent runs on what they actually did.
        const ed = hall.plat;
        const apply = () => { if (playerMayor()) hall.policy = Object.assign({}, ed); sfx.buy(); save(); };
        const bump = (k, d, lo, hi) => { ed[k] = Math.max(lo, Math.min(hi, (ed[k] | 0) + d)); apply(); };
        if (hit(R.pmech)) {
          ed.mech = PURSE_KEYS[(PURSE_KEYS.indexOf(ed.mech) + 1) % PURSE_KEYS.length];
          toast = { text: purseOf(ed).name + " - " + purseOf(ed).who, t: 5 };
          apply(); return;
        }
        if (hit(R.prm)) { bump("rate", -1, 0, 4); return; }
        if (hit(R.prp)) { bump("rate", 1, 0, 4); return; }
        if (hit(R.pbm)) { bump("bowls", -1, 0, POT_MAX); return; }
        if (hit(R.pbp)) { bump("bowls", 1, 0, POT_MAX); return; }
      }
    } else {   // TOWN census
      if (hit(R.csort)) { censusSort = (censusSort + 1) % CENSUS_SORTS.length; censusPage = 0; sfx.ding(); return; }
      if (hit(R.cfilt)) { censusFilter = (censusFilter + 1) % CENSUS_FILTERS.length; censusPage = 0; sfx.ding(); return; }
      if (hit(R.cprev)) { censusPage = (censusPage + censusPages() - 1) % censusPages(); sfx.ding(); return; }
      if (hit(R.cnext)) { censusPage = (censusPage + 1) % censusPages(); sfx.ding(); return; }
      const list = censusList();
      for (let i = 0; i < CENSUS_ROWS; i++) {
        const c = list[censusPage * CENSUS_ROWS + i];
        if (c && hit(R.crows[i])) { dossier = c; sfx.ding(); return; }
      }
    }
    const owned = ownedBizList();
    if (manageBizCycler() && hit(R.next)) { manage = owned[(owned.indexOf(manage) + 1) % owned.length]; sfx.ding(); return; }
    const onCard = pt.x >= R.x - 2 && pt.x < R.x + R.w + 2 && pt.y >= R.y - 2 && pt.y < R.y + R.h + 2;
    if (hit(R.done) || !onCard) manage = null;
    return;
  }
  if (boardView) {
    const pt = evPos(ev), r = jobBoardCensusRect();
    if (pt.x >= r.x && pt.x < r.x + r.w && pt.y >= r.y && pt.y < r.y + r.h) {
      boardView = false; manage = ownedBizList()[0] || null; manageTab = "TOWN"; sfx.ding(); return;
    }
    boardView = false; return;
  }
  if (reportT > 0) { reportT = 0; return; }
  startMusic();
  const p = evPos(ev);
  if (dragMoved) return;
  // panel
  if (p.y >= PANEL_Y) {
    if (p.y < TAB_Y - 1) {
      // ONE UNBROKEN CHAIN, HIGHEST x FIRST, and every band matches the thing
      // drawn in it. Written out as boundaries rather than a `>` ladder with a
      // new case wedged in at the top: that is how the pause chip ended up
      // eating SND's clicks, because a band inserted above the chain silently
      // takes its pixels from whatever was underneath.
      if (p.x >= 238) { ffMode = ffMode === 3 ? 0 : 3; sfx.ding(); return; }   // >>>>
      if (p.x >= 224) { ffMode = ffMode === 2 ? 0 : 2; sfx.ding(); return; }   // >>>
      if (p.x >= 213) { ffMode = ffMode === 1 ? 0 : 1; sfx.ding(); return; }   // >>
      if (p.x >= 202) { paused = !paused; sfx.ding(); return; }                // the pause chip
      if (p.x >= 189) { soundOn = !soundOn; if (soundOn) sfx.ding(); return; } // SND
      if (p.x >= 168) { toggleMusic(); return; }                               // MUS
      if (p.x >= 145) { toggleMute(); if (!muted) sfx.ding(); return; }        // the speaker
    }
    if (p.y >= TAB_Y && p.y < TAB_Y + TAB_H) {
      if (p.x >= 4 && p.x < 36) { tab = "crew"; return; }
      if (p.x >= 38 && p.x < 70) { tab = "shop"; return; }
      // SAVE opens the towns shelf - NEW GAME lives there now, per slot
      if (p.x >= 128 && p.x < 158) { openSaveView(); sfx.ding(); return; }
      if (p.x >= 168) { tab = tab === "menu" ? "crew" : "menu"; sfx.ding(); return; }
    }
    if (tab === "shop") {
      for (const b of BUTTONS)
        if (p.x >= b.x && p.x < b.x + b.w && p.y >= b.y && p.y < b.y + b.h) { tryBuy(buttonKey(b)); return; }
    } else if (tab === "crew") {   // menu tab: no invisible crew cards to click
      for (let i = 0; i < crabs.length; i++) {
        const bx = 4 + i * CARD_STEP;
        if (p.x >= bx && p.x < bx + CARD && p.y >= ROW_Y && p.y < ROW_Y + CARD) {
          followIdx = followIdx === i ? -1 : i; followNpc = null; followCust = null;
          sel = followIdx >= 0 ? crabs[i] : null; return;
        }
      }
    }
    return;
  }
  // THE NAV STRIP is painted over the bottom rows of the world, so it answers
  // for them: its chips first, then the map, then the town underneath.
  if (navTapChip(p)) return;
  if (navTrackHit(p)) { navJumpTo(p.x); sfx.ding(); return; }
  // follow-card job toggle
  if (followIdx >= 0 && !followNpc
      && Object.keys(BIZ).filter(b => bizUnlocked(b) && bizOwner(b) === "player").length > 1
      && p.x >= 56 && p.x < 90 && p.y >= 33 && p.y < 46) {
    const c = crabs[followIdx];
    // crew work only the player's businesses - never an NPC-owned shop
    const owned = Object.keys(BIZ).filter(b => bizUnlocked(b) && bizOwner(b) === "player");
    c.p.job = owned[(owned.indexOf(c.p.job) + 1) % owned.length];
    sfx.buy();
    popText("NEW JOB: " + BIZ[c.p.job].name, c.x - 20, FLOOR_Y - 34, [140, 255, 160]);
    return;
  }
  // a click on the follow card itself opens the crab's full record - but the
  // cycler chevrons live IN its header, so they get first refusal
  if (tapCycler(p)) return;
  {
    if (sel && p.x >= 5 && p.x < 26 && p.y >= 6 && p.y < 33) {   // portrait: bring the camera back
      if (sel.p) { if (sel.p.npc) { followNpc = sel; followIdx = -1; } else { followIdx = crabs.indexOf(sel); followNpc = null; } followCust = null; }
      else { followCust = sel; followIdx = -1; followNpc = null; }
      sfx.ding(); return;
    }
    if (sel && p.x >= 2 && p.x < 130 && p.y >= 2 && p.y < 60) { dossier = sel; sfx.ding(); return; }
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
  // the ferry office: the whole kiosk is the target, the chip is the label
  if (!won && ferryKnown() && wx >= FERRY_X - 6 && wx <= FERRY_X + FERRY_W + 6 && p.y >= 112 && p.y < 162) {
    tapFerryChip(); return;
  }
  // and the fingerpost points at it, in both senses
  if (ferryKnown() && wx >= FERRY_SIGN_X - 4 && wx <= FERRY_SIGN_X + 72 && p.y >= 116 && p.y < 146) {
    toast = { text: won ? "SHE SAILS FROM THE PIER"
      : "THE FERRY OFFICE IS DOWN AT THE PIER - $" + ferryFare(), t: 5 };
    sfx.ding(); return;
  }
  // A STANDING OFFER on one of YOUR shopfronts: TAKE IT / NO. The sign is the
  // owner's office door and this is the letter pushed under it, so it answers
  // in the same place the MANAGE chip lives.
  if (rivalOfferLive()) {
    const R = rivalChipRects(RIVAL_CFG.PRIZE);
    for (const which of ["take", "no"]) {
      const r = R[which];
      if (wx >= r.x - 3 && wx <= r.x + r.w + 3 && p.y >= r.y - 2 && p.y < r.y + r.h + 2) {
        tapRivalChip(which); return;
      }
    }
  }
  // ...and the mirror of it: a PEER owner's shopfront carries their ASK, and
  // the player can buy a shop that was never for sale. Two taps, same idiom.
  for (const b of peerBizList()) {
    const r = askChipRect(b);
    if (wx >= r.x - 3 && wx <= r.x + r.w + 3 && p.y >= r.y - 2 && p.y < r.y + r.h + 2) {
      tapAskChip(b); return;
    }
  }
  // a shuttered shop's BUY chip: the player takes a failed business on through
  // the same shopfront the MANAGE chip lives on. Two taps - $200-odd is not a
  // misclick - and every refusal says why.
  for (const b of saleList()) {
    const r = saleChipRect(b);
    if (wx >= r.x - 3 && wx <= r.x + r.w + 3 && p.y >= r.y - 2 && p.y < r.y + r.h + 2) {
      tapSaleChip(b); return;
    }
  }
  // ...and a TRADING shop whose owner would sell: the OFFER chip, same two-tap
  // arm, in the slot the MANAGE chip occupies on a shop you already own
  for (const b of Object.keys(BIZ)) {
    if (!canOffer(b)) continue;
    const r = offerChipRect(b);
    if (wx >= r.x - 3 && wx <= r.x + r.w + 3 && p.y >= r.y - 2 && p.y < r.y + r.h + 2) {
      tapOfferChip(b); return;
    }
  }
  // a player-owned shop's sign (and its MANAGE chip) is the owner's office door
  for (const b of ownedBizList()) {
    const bz = BIZ[b], signW = textWidth(bz.sign) + 14;
    const sx = (bz.x0 + bz.x1) / 2 - signW / 2;
    if (wx >= sx - 4 && wx <= sx + signW + 4 && p.y >= 88 && p.y < 116) {
      manage = b; sfx.ding(); return;
    }
  }
  // world: click any crab - crew or townsfolk - to follow them
  for (const c of allCrabs()) {
    if (!c.hidden && Math.abs(wx - (c.x + 8)) < 12 && Math.abs(p.y - (c.y - 6)) < 14) {
      sel = c;
      if (c.p.npc) { followNpc = c; followIdx = -1; }
      else { followIdx = crabs.indexOf(c); followNpc = null; }
      followCust = null;
      return;
    }
  }
  // tourists are people too: click to follow them around their visit
  for (const k of customers) {
    if (k.isCrab || k.state === "showering" || k.state === "inRoom") continue;
    const ky = custY(k) - 4 - 26 * (k.climb || 0);
    if (Math.abs(wx - (k.x + 8)) < 12 && Math.abs(p.y - ky) < 14) {
      sel = k; followCust = k; followIdx = -1; followNpc = null;
      return;
    }
  }
});
// right-click: give the followed CREW crab an order (orderCrab resolves the
// target). The browser menu is suppressed on the canvas so the world owns
// the gesture. No context menu yet - that's "at some point", not now.
cv.addEventListener("contextmenu", (ev) => {
  ev.preventDefault();
  if (screen !== "play" || gameOver) return;
  if (dossier || boardView || manage || reportT > 0) return;
  if (window.MergeMode && MergeMode.active()) return;
  const p = evPos(ev);
  if (p.y >= PANEL_Y) return;   // the panel is left-click country
  if (!sel) return;   // nobody selected: nothing to order
  if (!sel.p) { popText(sel.name.split(" ")[0] + ": JUST VISITING!", sel.x - 12, 120, [255, 150, 130]); return; }
  if (sel.p.npc) { orderPop(sel, false, "I'VE GOT MY OWN LIFE"); return; }
  orderCrab(sel, p.x + camX, p.y);
});
addEventListener("keydown", (e) => {
  if (e.key === "m") { toggleMute(); if (!muted) sfx.ding(); }
  if (e.key === "n") toggleMusic();
  if (e.key === "b" && musicOn) playTrack(trackIdx + 1);   // next track
  if (e.key === "f") ffMode = (ffMode + 1) % 4;            // fast-forward 1x/2x/3x/6x
  if (e.key === " " || e.key === "p") {                    // the key everybody tries first
    paused = !paused; sfx.ding();
    if (e.key === " " && e.preventDefault) e.preventDefault();   // space must not scroll the page
  }
  // [ and ] step the selection through the town, exactly what the little crab
  // cycler's chevrons do - the camera comes along, unlike an arrow-key pan
  if (e.key === "[" && cyclerLive()) { cycleSel(-1); sfx.ding(); return; }
  if (e.key === "]" && cyclerLive()) { cycleSel(1); sfx.ding(); return; }
  if (e.key === "ArrowLeft") { camX = clampCam(camX - 24); followIdx = -1; followNpc = null; followCust = null; }
  if (e.key === "ArrowRight") { camX = clampCam(camX + 24); followIdx = -1; followNpc = null; followCust = null; }
  if (e.key === "Escape") { if (saveView) { closeSaveView(); return; } if (dossier) { dossier = null; return; } if (manage) { manage = null; return; } sel = null; followIdx = -1; followNpc = null; followCust = null; }
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

// ------------------------------------------------------------- the far shore
// Nothing in this game ever says where the town IS. It is said by what you can
// see from it: across the water there is another coast - hills behind hills, a
// light on the point, a scatter of blocks that comes on after dark - and most
// evenings the mist comes in off the sea and takes it away again. On a clear
// night you can pick out the windows over there. That is the whole statement,
// and it is made entirely in pixels.
//
// EVERY LINE OF THIS IS DRAW-ONLY. It reads day/tmin/time/camX/trade and writes
// nothing back, and it never touches Math.random - every wobble is a sine or an
// integer hash of the day - so the sim is byte-identical with the layer on or
// off. window._noHorizon / window._noMist switch it off; the suite proves the
// fingerprint doesn't move.
const HZ_Y = SKY_H;          // the waterline the far coast stands on
const HZ_PAR = 0.04;         // parallax: far enough that a whole town's pan barely shifts it
const HZ_LIGHT_X = 84;       // the light on the point
const HZ_TOWN_X = 168;       // and the town along the shore from it
function hzRidge(x) {        // the near headland, quantised to 2px for the chunky look
  const h = 9.5 + Math.sin(x * 0.0140 + 0.7) * 5.5
                + Math.sin(x * 0.0345 + 2.3) * 2.5
                + Math.sin(x * 0.0910 + 4.1) * 1.2;
  return HZ_Y - 2 * Math.max(1, Math.round(h / 2));
}
function hzBack(x) {         // the blue ridge standing behind it
  const h = 15 + Math.sin(x * 0.0079 + 3.4) * 5 + Math.sin(x * 0.0231 + 1.1) * 2.6;
  return HZ_Y - 2 * Math.max(2, Math.round(h / 2));
}
// one run-length pass per ridge: the profile is quantised, so a whole coast
// costs a few dozen fills instead of 256
function hzBand(fn, hx, body, top) {
  let x0 = 0, y0 = fn(hx);
  for (let sx = 1; sx <= W; sx++) {
    const y = sx < W ? fn(sx + hx) : -999;
    if (y === y0) continue;
    rect(ctx, x0, y0, sx - x0, HZ_Y - y0, body);
    rect(ctx, x0, y0, sx - x0, 1, top);
    x0 = sx; y0 = y;
  }
}
function drawHorizon() {
  if (window._noHorizon) return;
  const hx = camX * HZ_PAR, night = darkness() > 0.55;
  hzBand(hzBack, hx, night ? [46, 54, 90] : [156, 180, 210], night ? [58, 66, 106] : [182, 202, 226]);
  hzBand(hzRidge, hx, night ? [24, 30, 56] : [92, 124, 164], night ? [34, 42, 72] : [116, 148, 184]);
  // the town across the water: blocks by day, windows after dark
  for (let i = 0; i < 13; i++) {
    const bx = Math.round(HZ_TOWN_X + i * 5 - hx);
    if (bx < -4 || bx > W) continue;
    const bh = 3 + ((i * 7 + 3) % 4) + (i === 4 || i === 9 ? 3 : 0);
    rect(ctx, bx, HZ_Y - bh, 4, bh, night ? [22, 26, 52] : [128, 152, 186]);
    if (night && (i * 3 + 1 + ((time * 0.2) | 0)) % 4)
      px(ctx, bx + 1, HZ_Y - bh + 1, [255, 214, 128]);
  }
  // harbour lights strung along the rest of the shore, only after dark
  if (night) for (let i = 0; i < 26; i++) {
    const lx = Math.round(((i * 47 + 11) % 300) - 22 - hx);
    if (lx < 0 || lx >= W) continue;
    if ((i * 5 + ((time * 0.15) | 0)) % 7 === 0) continue;   // one or two are out
    px(ctx, lx, HZ_Y - 1 - (i % 2), [255, 206, 120]);
  }
  // THE LIGHT ON THE POINT. It turns whether or not anybody in this town is
  // watching, which is rather the idea.
  const lx = Math.round(HZ_LIGHT_X - hx);
  if (lx > -4 && lx < W + 4) {
    const base = hzRidge(HZ_LIGHT_X);
    rect(ctx, lx, base - 9, 3, 9, night ? [126, 130, 156] : [240, 244, 250]);
    rect(ctx, lx, base - 5, 3, 2, night ? [112, 62, 72] : [212, 84, 84]);
    const lit = ((time * 0.85) % 4) < 1.2;
    rect(ctx, lx, base - 11, 3, 2, lit ? [255, 242, 172] : night ? [78, 82, 108] : [150, 160, 180]);
    if (lit) {
      px(ctx, lx - 1, base - 10, [255, 232, 144]);
      px(ctx, lx + 3, base - 10, [255, 232, 144]);
      if (night) { px(ctx, lx - 2, base - 10, [190, 168, 96]); px(ctx, lx + 4, base - 10, [190, 168, 96]); }
    }
  }
}
// SOMEWHERE ELSE IS A PLACE, NOT A BACKDROP. The tourists arrive from somewhere
// and so does everything the trade ledger counts as an IMPORT - so on a day the
// town actually shipped something in, a little freighter works the far channel,
// and on Thursdays another crossing works the far channel entirely - not yours;
// yours is alongside your own pier - so the water out there is always somebody
// else's business right up until the morning some of it is not. Drawn after the sea (a boat floats ON the water) and before the
// mist (a boat out there goes when the shore goes).
function drawHorizonTraffic() {
  if (window._noHorizon) return;
  const night = darkness() > 0.55;
  const imported = trade.day.fish + trade.day.corn + trade.day.water + trade.day.power + trade.day.fruit;
  if (imported > 0 && tmin > 6 * 60 && tmin < 19.5 * 60) {
    const p = (tmin - 6 * 60) / (13.5 * 60);
    const bx = Math.round(-14 + p * (W + 28)), by = HZ_Y + 1;
    const hull = night ? [30, 40, 66] : [70, 92, 120];
    rect(ctx, bx, by, 12, 2, hull);
    rect(ctx, bx + 2, by - 2, 3, 2, hull);
    rect(ctx, bx + 8, by - 3, 2, 3, night ? [40, 30, 40] : [90, 70, 70]);
    px(ctx, bx + 8, by - 4, night ? [60, 62, 80] : [200, 205, 214]);   // a smudge of smoke
    if (night) px(ctx, bx + 3, by - 2, [255, 206, 120]);
  }
  if (weekdayIdx(day) === FERRY_DAY && tmin > 8 * 60 && tmin < 18 * 60 && !won) {
    // NOT HER. Under canon (a) your ferry is alongside your own pier four times
    // a day, so the boat on the far channel is the mainland's own traffic -
    // long, low, dark, and masted where yours has a funnel, so the two can
    // never be confused at a glance across the water.
    const p = (tmin - 8 * 60) / (10 * 60);
    const bx = Math.round(-22 + p * (W + 44)), by = HZ_Y + 2;
    const hull = night ? [40, 46, 72] : [96, 112, 140];
    rect(ctx, bx, by, 24, 3, hull);
    rect(ctx, bx + 4, by - 2, 9, 2, night ? [34, 40, 64] : [116, 132, 158]);
    rect(ctx, bx + 16, by - 5, 1, 5, night ? [50, 56, 80] : [140, 152, 176]);   // a mast, not a funnel
    for (let i = 1; i < 5; i++) px(ctx, bx - i * 4, by + 2, [200, 226, 240]);  // wake
  }
}
// THE MIST. Some evenings you can see across; most evenings you cannot. How
// thick it comes is an integer hash of the DAY - no RNG, nothing stored, no
// save field - so the weather is a fact about the calendar, the same on every
// machine, and a clear night is a small event rather than a coin flip.
function mistPeak(d) {
  let h = Math.imul(d | 0, 2654435761) >>> 0;
  h ^= h >>> 15; h = Math.imul(h, 2246822519) >>> 0; h ^= h >>> 13;
  // biased THICK on purpose: about a third of evenings the shore is simply
  // gone, about a quarter are clear enough to count the windows, and the rest
  // sit in between - so "I can see across tonight" is news
  return Math.min(1, 0.18 + 1.25 * Math.pow((h >>> 8) / 16777216, 0.85));
}
// how much of it is out there right now: it comes in off the sea through the
// late afternoon, sits all night, and burns off through the morning. The small
// hours belong to YESTERDAY's mist, or it would change thickness at midnight.
function mistNow() {
  const t = tmin;
  if (t < 6.5 * 60) return mistPeak(day - 1);
  if (t < 9.5 * 60) return mistPeak(day - 1) * (1 - (t - 6.5 * 60) / (3 * 60));
  if (t < 16.5 * 60) return 0;
  if (t < 20 * 60) return mistPeak(day) * ((t - 16.5 * 60) / (3.5 * 60));
  return mistPeak(day);
}
function drawMist() {
  if (window._noMist) return;
  const m = mistNow();
  if (m <= 0.02) return;
  const d = darkness();
  const c = Math.round(230 - 78 * d) + "," + Math.round(238 - 74 * d) + "," + Math.round(246 - 54 * d);
  // THE PROFILE MATTERS. Thickest through the band the far shore stands in and
  // easing off again toward the beach - mist that whited out the near water too
  // would just read as a broken renderer.
  for (let y = 26; y < SHORE_Y; y++) {
    const v = y < 42 ? (y - 26) / 16 : y < 66 ? 1 : 1 - 0.6 * (y - 66) / (SHORE_Y - 66);
    const a = Math.min(1, m * (0.10 + 0.95 * v) * (0.86 + 0.14 * Math.sin(y * 0.55 - time * 0.5)));
    if (a <= 0.01) continue;
    ctx.fillStyle = `rgba(${c},${a.toFixed(3)})`;
    ctx.fillRect(0, y, W, 1);
  }
  // banks of it rolling through, at their own speeds - the motion is what
  // makes it weather instead of a filter
  for (let i = 0; i < 5; i++) {
    const wy = 40 + i * 8 + ((Math.sin(time * 0.17 + i * 2.3) * 2) | 0);
    if (wy >= SHORE_Y) continue;
    const ww = 70 + i * 26;
    const wx = ((time * (5 + i * 3) + i * 130) % (W + ww * 2)) - ww;
    ctx.fillStyle = `rgba(${c},${(0.30 * m).toFixed(3)})`;
    ctx.fillRect(wx | 0, wy, ww, 2 + (i % 2));
  }
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
  // the far shore, standing on the horizon (drawn over the stars, under the
  // weather - the hills are nearer than the sky and further than everything)
  drawHorizon();
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
  drawHorizonTraffic();   // boats float ON the water, so: after it
  drawMist();             // and the weather takes the water and the shore together
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

// THE MAINLAND FERRY, alongside. Deliberately one hull in one function - the
// horizon and the run out to sea belong to the agent building them; this is
// only the boat the visitors walk off. She rides a little at her lines while
// she is tied up, and the gangway is a plank down to the pier's east end.
// CANON (a), settled by Matt 2026-08-19: THE BOAT YOU BUY IS THE BOAT THAT HAS
// BEEN BRINGING YOU TOURISTS. So there is exactly ONE hull in this function and
// the win does not draw a second one somewhere else - she is the same sprite,
// at the same berth, that the player has watched come and go four times a day
// since the first morning. All that changes is whose she is, and that she stays.
function drawFerry() {
  if (!ferryHere() && !won) return;
  const x = FERRY.hull, y = FERRY.hullY;
  if (x + 60 - camX < 0 || x - 60 - camX > W) return;
  const bob = Math.sin(time * 0.9) > 0 ? 1 : 0;
  wblit(FERRY_ART[0], x, y + bob);
  wblit(FERRY_SMOKE[((time * 3) | 0) % 2], x + 11, y - 3 + bob);
  // mooring lines + the gangway down to the planks
  wrect(FERRY.gangway + 2, y + 10 + bob, x - FERRY.gangway - 2, 1, [140, 90, 50]);
  for (let i = 0; i < 5; i++)
    wrect(FERRY.gangway - 2 + i * 3, y + 11 + bob + i * 2, 4, 1, [206, 156, 94]);
  // ...and her NAME goes on at the win. Until then she is somebody else's boat
  // and the town calls her what a timetable calls her.
  const lbl = won ? "CRABALINA" : "FERRY";
  const lx = x + 13 - smallTextWidth(lbl) / 2 - camX;
  if (lx > -20 && lx < W) {
    smallText(ctx, lbl, lx + 1, y - 11, [30, 20, 36]);
    smallText(ctx, lbl, lx, y - 12, [235, 248, 255]);
  }
}

// THE BALL ON THE SAND. It lies where it was left until somebody wants it,
// and during a game it arcs between the two of them - a parabola on a 1.4s
// cycle, drawn from the game's own timer so it is not a separate animation
// that can drift out of step with the thing it represents.
function drawBeachBall() {
  const players = ballPlayers().filter(k => k.ballT > 0);
  let bx = BALL_X, by = BALL_Y + 3;
  if (players.length >= 2) {
    const a = players[0], b = players[1];
    const t = (time % 1.4) / 1.4;
    bx = a.x + 8 + (b.x - a.x) * t;
    by = BALL_Y + 1 - Math.sin(t * Math.PI) * 22;   // up and over
  } else if (players.length === 1) {
    const a = players[0];
    const t = (time % 0.8) / 0.8;
    bx = a.x + 10;
    by = BALL_Y - 1 - Math.sin(t * Math.PI) * 10;   // bounced off your own claw
  }
  const sx = Math.round(bx) - camX;
  if (sx < -8 || sx > W + 8) return;
  const y = Math.round(by);
  rect(ctx, sx - 2, y - 3, 5, 7, [252, 248, 240]);      // the ball
  rect(ctx, sx - 3, y - 2, 7, 5, [252, 248, 240]);
  rect(ctx, sx - 1, y - 3, 1, 7, [230, 90, 80]);        // stripes
  rect(ctx, sx + 1, y - 3, 1, 7, [96, 170, 220]);
  px(ctx, sx - 2, y - 2, [255, 255, 255]);
  if (!players.length) rect(ctx, sx - 3, BALL_Y + 5, 7, 1, [214, 196, 156]);   // a little shadow at rest
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

// ------------------------------------------------------- the ferry, in world
// The office is a kiosk at the foot of the pier with the fare painted on the
// front, and the fingerpost outside the shack repeats it every single day.
// Neither of them explains anything: they are what a real town writes down.
const FERRY_W = 60;
function ferryChipRect() { return { x: FERRY_X + 7, y: 147, w: 46, h: 11 }; }
function drawFerryOffice() {
  if (!ferryKnown()) return;
  const x = FERRY_X;
  if (x + FERRY_W - camX < -8 || x - camX > W + 8) return;
  const afford = coins >= FERRY_PRICE;
  wrect(x - 4, 114, FERRY_W + 8, 6, [64, 104, 148]);          // roof
  wrect(x - 4, 114, FERRY_W + 8, 1, [120, 172, 214]);
  wrect(x - 4, 120, FERRY_W + 8, 1, [36, 64, 104]);
  wrect(x, 121, FERRY_W, 39, [244, 238, 224]);                // kiosk front
  wrect(x, 121, 1, 39, [176, 164, 140]);
  wrect(x + FERRY_W - 1, 121, 1, 39, [176, 164, 140]);
  wrect(x, 121, FERRY_W, 8, [40, 72, 112]);                   // fascia
  wrect(x, 158, FERRY_W, 2, [200, 190, 168]);
  const sx = x - camX;
  if (sx > -FERRY_W && sx < W) {
    smallText(ctx, "MAINLAND FERRY", sx + 2, 123, [235, 245, 255]);
    smallText(ctx, "TO THE MAINLAND", sx + 2, 132, [120, 100, 80]);
    const fare = won ? "PAID" : "$" + ferryFare();
    text(ctx, fare, sx + (FERRY_W - textWidth(fare)) / 2, 138,
      won || afford ? [40, 130, 70] : [180, 60, 40], 6);
  }
  const r = ferryChipRect(), armed = ferryArm > 0;
  wrect(r.x, r.y, r.w, r.h, [30, 20, 36]);
  wrect(r.x + 1, r.y + 1, r.w - 2, r.h - 2,
    won ? [150, 140, 140] : afford ? (armed ? [255, 200, 90] : [96, 200, 120]) : [150, 140, 140]);
  if (r.x - camX > -r.w && r.x - camX < W) {
    const lbl = won ? "SHE'S OURS" : armed ? "TAP AGAIN" : "BUY HER";
    smallText(ctx, lbl, r.x + ((r.w - smallTextWidth(lbl)) >> 1) - camX, r.y + 3, [30, 20, 36]);
  }
}
// The fingerpost on the promenade: the way out, and what it
// costs, where the player already looks. The dream in the corner of the eye -
// but only from the morning the arcade opens.
function drawFerrySign() {
  if (!ferryKnown()) return;
  const x = FERRY_SIGN_X;
  if (x + 70 - camX < 0 || x - camX > W) return;
  wrect(x + 22, 120, 4, 36, [150, 104, 62]);
  wrect(x + 22, 120, 1, 36, [190, 142, 92]);
  wrect(x + 18, 154, 12, 2, [176, 150, 108]);
  wrect(x, 118, 48, 11, [30, 20, 36]);
  wrect(x + 1, 119, 46, 9, [246, 240, 222]);
  // THE ONE STATE THIS SIGN HAS: the day the town can actually cover the fare,
  // the bottom arm goes green. A player who never once panned east still finds
  // out, from the sign outside their own shack, on the morning it becomes true.
  const afford = coins >= FERRY_PRICE && !won;
  wrect(x, 132, 66, 11, [30, 20, 36]);
  wrect(x + 1, 133, 64, 9, afford ? [222, 250, 226] : [246, 240, 222]);
  for (let i = 0; i < 5; i++) wrect(x + 66 + i, 132 + i, 1, 11 - i * 2, [30, 20, 36]);   // the arm's point
  const sx = x - camX;
  if (sx > -70 && sx < W) {
    smallText(ctx, "THE PIER", sx + 8, 121, [70, 60, 70]);
    smallText(ctx, won ? "FERRY - SAILING" : "FERRY $" + ferryFare(), sx + 4, 135,
      afford ? [30, 120, 60] : [40, 72, 112]);
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
  drawFerry();
  drawBeachBall();
  drawBoats();
  // houses face the promenade - ALL nine lots stand, always: an occupied
  // house wears its tenant's roof color, an empty one sits weathered-grey
  // with dark windows and a TO LET card. Draw derives from the lots, not
  // from the occupants (the directive: houses exist first, hires move in)
  for (let h = 0; h < HOUSE_XS.length; h++) {
    const o = houseOccupant(h);
    wblit(o ? HOUSES2[o.p.color % HOUSES2.length] : HOUSE_EMPTY2, HOUSE_XS[h], HOME_BOTTOM - HOUSES2[0].h);
  }
  // the town job board
  wblit(NOTICE2, JOB_BOARD_X, HOME_BOTTOM - NOTICE2.h);
  if (JOB_BOARD_X - camX > -60 && JOB_BOARD_X - camX < W) {
    smallText(ctx, "JOBS", JOB_BOARD_X + 5 - camX, HOME_BOTTOM - NOTICE2.h - 7, [30, 20, 36]);
    smallText(ctx, "JOBS", JOB_BOARD_X + 4 - camX, HOME_BOTTOM - NOTICE2.h - 8, [255, 230, 120]);
    if (jobBoard.length)
      smallText(ctx, "" + jobBoard.length, JOB_BOARD_X + 26 - camX, HOME_BOTTOM - NOTICE2.h - 8, [255, 150, 60]);
  }
  // the public taps: town infrastructure, drawn like it. The spout runs only
  // while somebody is actually stood there drinking, so a dry tap reads dry.
  for (let i = 0; i < WATER_TAPS.length; i++) {
    const t = WATER_TAPS[i];
    wblit(STANDPIPE2, t.x, HOME_BOTTOM - STANDPIPE2.h);
    if (t.x - camX > -60 && t.x - camX < W) {
      const lx = t.x + ((STANDPIPE2.w - smallTextWidth("WATER")) >> 1) - camX;
      smallText(ctx, "WATER", lx + 1, HOME_BOTTOM - STANDPIPE2.h - 8, [30, 20, 36]);
      smallText(ctx, "WATER", lx, HOME_BOTTOM - STANDPIPE2.h - 9, [235, 248, 255]);
    }
    if (allCrabs().some(c => c.dayState === "atTap" && c.tapStop && !c.tapStop.soup && c.tapStop.tap === i && c.tapT > 0))
      wblit(TAP_FLOW[((time * 6) | 0) % 2], t.x + 15, HOME_BOTTOM - STANDPIPE2.h + 12);
  }
  // the crab shelter
  wblit(SHELTER2, SHELTER_X, HOME_BOTTOM - SHELTER2.h);
  if (SHELTER_X - camX > -80 && SHELTER_X - camX < W) {
    smallText(ctx, "SHELTER", SHELTER_X + 22 - camX, HOME_BOTTOM - SHELTER2.h + 3, [30, 20, 36]);
    smallText(ctx, "SHELTER", SHELTER_X + 21 - camX, HOME_BOTTOM - SHELTER2.h + 2, [240, 235, 220]);
    // THE POT, AND THE NOTICE ABOVE IT. The office's whole remit is legible
    // from the boardwalk: who holds it, what they levied, and whether there is
    // anything in the pot this morning. Three states and they are the three
    // that matter - bolted, cold, or a count you can watch go down.
    // THE NOTICE. Hung above the shelter's own sign rather than over it - the
    // sign says what the building is and the notice says who is running it, and
    // a screenshot with the word SHELTER half under a board is worse than
    // either. Two 7px rows, so it clears the roof line at HOME_BOTTOM - h.
    const sx = SHELTER_X + 4 - camX, sy = HOME_BOTTOM - SHELTER2.h - 21;
    const shut = shelterShut(), ok = potOk();
    wrect(SHELTER_X + 2, sy - 2, 78, 18, [30, 20, 36]);
    wrect(SHELTER_X + 3, sy - 1, 76, 16, shut ? [120, 50, 50] : [58, 42, 38]);
    smallText(ctx, fitSmall("MAYOR " + (hall.mayor || "-"), 72), sx + 2, sy + 1, [255, 216, 96]);
    smallText(ctx, fitSmall(potLine(), 72), sx + 2, sy + 8,
      ok > 0 ? [200, 235, 200] : ok < 0 ? [255, 190, 150] : [255, 190, 190]);
    // ...AND THE POT ITSELF. OUT ON THE BOARDWALK, immediately left of where
    // the queue stands (errandStopX puts a crab at SOUP_X, and a crab is 16
    // wide), because the first cut drew it inside among the cots and it read as
    // a black slab rather than a pot. A belly, a rim, a trestle and embers -
    // and STEAM only when there is something in it, which is the one glance
    // from the boardwalk that says whether the office is working.
    const px0 = SOUP_X - 15, py = 157;
    wrect(px0, py + 7, 12, 1, [92, 62, 40]);                              // trestle
    wrect(px0 + 1, py + 6, 2, 2, [92, 62, 40]); wrect(px0 + 9, py + 6, 2, 2, [92, 62, 40]);
    wrect(px0 + 1, py + 1, 10, 5, shut ? [72, 64, 70] : [96, 88, 116]);   // belly
    wrect(px0 + 2, py + 2, 8, 3, shut ? [56, 50, 58] : [70, 62, 92]);
    wrect(px0, py, 12, 2, [30, 20, 36]);                                  // rim
    if (!shut && townFund.bowls > 0) {
      wrect(px0 + 1, py + 1, 10, 1, [180, 130, 70]);                      // soup, just under the rim
      wrect(px0 + 2, py + 6, 8, 1, [255, 150, 60]);                       // embers under it
      for (let i = 0; i < 3; i++)
        wrect(px0 + 2 + i * 4, py - 3 - ((time * 4 + i * 2) | 0) % 4, 1, 2, [235, 225, 205]);
    }
  }
  // THE TOWN REMEMBERS. Driftwood markers, now on the little dune between the
  // last promenade lot and the town tap - the only clear sand on this side of
  // the road. They used to be laid out westward from the shelter at a 16px
  // pitch, which put them floating inside the front rooms of houses 4 and 5
  // once every lot stood permanently; nobody noticed while only crew could
  // die. Townsfolk die now, so this row gets read: the layout is DERIVED from
  // the index (the stored x rides along for old saves) and each stone carries
  // its name.
  for (let i = 0; i < memorials.length; i++) {
    const m = memorials[i], sp = memorialSpot(i);
    wblit(MEMORIAL, sp.x, sp.y);
    if (sp.x - camX > -40 && sp.x - camX < W) {
      const nx = sp.x + ((MEMORIAL.w - smallTextWidth(m.name)) >> 1) - camX;
      smallText(ctx, m.name, nx + 1, sp.y - 6, [30, 20, 36]);
      smallText(ctx, m.name, nx, sp.y - 7, [225, 220, 235]);
    }
  }
  // bus stops on the shoulder
  for (const s of BUS_STOPS) wblit(BUS_STOP, s - 3, ROAD_Y1 + 3);
  // scenery fills the beach pockets between lots
  wblit(PALM, 534, 134); wblit(PALM, 960, 132, true); wblit(PALM, 1035, 136); wblit(PALM, 1560, 134); wblit(PALM, 1900, 130, true); wblit(PALM, 1965, 136);
  wblit(UMBRELLA, 1050, 150); wblit(UMBRELLA, 1620, 152); wblit(UMBRELLA, 1782, 151);   // moved 1830 -> 1782: the ferry office stands there now
  // the crossing you cannot afford, and the sign that says so every morning
  drawFerrySign();
  drawFerryOffice();
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
  booth: TOKEN_BOOTH, claw: null, skee: SKEEBALL, prize: PRIZE_COUNTER,
  fruitbin: FRUIT_BIN, juicer: null, bar: JUICE_COUNTER,
  linen: LINEN_PRESS, desk: HOTEL_DESK };

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
  wrect(signX + 1, 93, signW - 2, 10, key === "shack" ? [190, 140, 80] : key === "juicebar" ? [255, 150, 60] : [96, 170, 220]);
  if (signX + signW - camX > 0 && signX - camX < W)
    textShadow(ctx, b.sign, signX + 7 - camX, 95, [255, 250, 240], [70, 50, 40]);
  if (bizOwner(key) === "player") {
    // MANAGE chip: the sign doubles as the owner's office door (tap to open
    // the management screen - the chip is the discoverable half of the target)
    const mw = smallTextWidth("MANAGE") + 6;
    const mx = signX + signW / 2 - mw / 2;
    wrect(mx, 105, mw, 9, [30, 20, 36]);
    wrect(mx + 1, 106, mw - 2, 7, [96, 170, 220]);
    if (mx - camX > -mw && mx - camX < W)
      smallText(ctx, "MANAGE", mx + 3 - camX, 107, [255, 255, 255]);
  } else if (canOffer(key)) {
    // THE OFFER CHIP. A trading shop whose owner would sell, priced on the
    // sign, in the same slot the MANAGE chip lives in - so "the sign is the
    // owner's office door" reads the same whether the office is yours yet.
    const price = offerPrice(key), lbl = saleArm === key ? "TAP AGAIN" : "OFFER $" + fmt(price);
    const r = offerChipRect(key);
    wrect(r.x, r.y, r.w, r.h, [30, 20, 36]);
    wrect(r.x + 1, r.y + 1, r.w - 2, r.h - 2,
      coins >= price ? (saleArm === key ? [255, 200, 90] : [96, 200, 120]) : [150, 140, 140]);
    if (r.x - camX > -r.w && r.x - camX < W)
      smallText(ctx, lbl, r.x + ((r.w - smallTextWidth(lbl)) >> 1) - camX, r.y + 3, [30, 20, 36]);
  }
  if (forSale(key)) {
    // the shutters, the placard and the BUY chip are painted LAST (see
    // drawForSaleSigns) - boards nailed across a shopfront go in front of the
    // furniture, not behind the stalls
  } else if (!bizOpenNow(key)) {
    wrect(signX + signW / 2 - 23, 118, 46, 11, [30, 20, 36]);
    text(ctx, "CLOSED", signX + signW / 2 - 18 - camX, 120, [255, 120, 120]);
  } else if (bizRestingToday(key)) {
    // the whole roster is out today: an honest smalltown closed-sign day, hung
    // over the roofline where the stalls can't hide it. A sick day reads
    // differently from a rota day, but hangs the same placard.
    const lbl = restingLabel(key), sick = lbl === "OUT SICK", awol = lbl === "NOBODY CAME IN";
    const lw = Math.max(50, textWidth(lbl) + 6);
    wrect(signX + signW / 2 - lw / 2 - 1, 79, lw + 2, 12, [30, 20, 36]);
    wrect(signX + signW / 2 - lw / 2, 80, lw, 10, [255, 250, 235]);
    text(ctx, lbl, signX + signW / 2 - textWidth(lbl) / 2 - camX, 82,
      sick ? [120, 150, 90] : awol ? [180, 70, 70] : [40, 110, 190]);
  }
}

// THE SHUTTERS. Painted after the whole y-sorted pass: boards nailed across a
// closed shopfront belong in FRONT of its stalls and counters, and the
// placard is the one thing in the scene that has to be readable from the
// street - price and all, with the BUY chip the player taps.
function drawForSaleSigns() {
  for (const key of saleList()) {
    if (!bizUnlocked(key)) continue;
    const b = BIZ[key];
    if (b.x1 - camX < 0 || b.x0 - camX > W) continue;
    for (let i = 0; i < 3; i++) {
      wrect(b.x0 + 5, 130 + i * 12, b.x1 - b.x0 - 10, 3, [176, 132, 84]);
      wrect(b.x0 + 5, 133 + i * 12, b.x1 - b.x0 - 10, 1, [128, 92, 56]);
    }
    const price = salePrice(key), lbl = "FOR SALE  $" + fmt(price);
    const pw = textWidth(lbl) + 12, px2 = Math.round((b.x0 + b.x1) / 2 - pw / 2);
    wrect(px2, 116, pw, 13, [30, 20, 36]);
    wrect(px2 + 1, 117, pw - 2, 11, [255, 244, 210]);
    if (px2 + pw - camX > 0 && px2 - camX < W)
      text(ctx, lbl, px2 + 6 - camX, 119, [180, 60, 40]);
    const r = saleChipRect(key), armed = saleArm === key;
    wrect(r.x, r.y, r.w, r.h, [30, 20, 36]);
    wrect(r.x + 1, r.y + 1, r.w - 2, r.h - 2,
      coins >= price ? (armed ? [255, 200, 90] : [96, 200, 120]) : [150, 140, 140]);
    if (r.x - camX > -r.w && r.x - camX < W)
      smallText(ctx, armed ? "TAP AGAIN" : "BUY IT", r.x + (armed ? 3 : 8) - camX, r.y + 3, [30, 20, 36]);
  }
}

// THE RIVALRY, PAINTED ON THE STREET. Same treatment as the FOR SALE boards:
// drawn after the whole y-sorted pass, so a banner and its chips sit in FRONT
// of the counters they belong to. Three things can be up at once and they
// never share a row: the OFFER banner rides over the roofline at y=64, the
// answer chips sit at counter height where a thumb already goes (the FOR SALE
// chip's own slot - a shop cannot be both for sale and offered for), and a
// peer owner's ASK takes the shoulder slot the MANAGE chip uses on your own
// shops, because it is the same thing: the door into that owner's office.
// Every rect comes out of the same geometry function the hit-test reads, so a
// tap target can never drift from its pixels.
function drawRivalSigns() {
  const banner = (b, lbl, fg, bg) => {
    const z = BIZ[b];
    if (z.x1 - camX < 0 || z.x0 - camX > W) return;
    const w2 = textWidth(lbl) + 12, x2 = Math.round((z.x0 + z.x1) / 2 - w2 / 2);
    wrect(x2, 64, w2, 13, [30, 20, 36]);
    wrect(x2 + 1, 65, w2 - 2, 11, bg);
    if (x2 + w2 - camX > 0 && x2 - camX < W) text(ctx, lbl, x2 + 6 - camX, 67, fg);
  };
  const chip = (r, lbl, bg, fg) => {
    wrect(r.x, r.y, r.w, r.h, [30, 20, 36]);
    wrect(r.x + 1, r.y + 1, r.w - 2, r.h - 2, bg);
    if (r.x - camX > -r.w && r.x - camX < W)
      smallText(ctx, lbl, r.x + ((r.w - smallTextWidth(lbl)) >> 1) - camX, r.y + 3, fg || [30, 20, 36]);
  };
  const prize = RIVAL_CFG.PRIZE;
  if (bizUnlocked(prize) && prizeIsPlayers() && rivalOn()) {
    if (rivalOfferLive()) {
      banner(prize, rivalName() + " OFFERS $" + fmt(rival.offer.price), [40, 24, 16], [255, 216, 96]);
      const R = rivalChipRects(prize);
      chip(R.take, "TAKE IT", [96, 200, 120]);
      chip(R.no, "NO", [235, 150, 140]);
    } else if (rival.stage === "compete") {
      banner(prize, rivalName() + " IS COMPETING", [255, 240, 230], [180, 60, 40]);
    } else if (rival.stage === "eyeing") {
      banner(prize, rivalName() + " IS INTERESTED", [40, 24, 16], [222, 212, 196]);
    }
  }
  // ...and every shop somebody else runs wears its price, so the player can
  // always see what a buyout would cost before tapping anything
  for (const b of peerBizList()) {
    const z = BIZ[b];
    if (z.x1 - camX < 0 || z.x0 - camX > W) continue;
    const price = rivalAsk(b), armed = askArm === b;
    chip(askChipRect(b), armed ? "TAP AGAIN" : "BUY $" + fmt(price),
      coins >= price ? (armed ? [255, 200, 90] : [96, 200, 120]) : [190, 180, 180]);
  }
}

function drawStation(key, kind, i) {
  const st = BIZ[key].stations[kind][i];
  const isBusy = busy[key] && busy[key][kind] && busy[key][kind][i];
  let art = STATION_ART[kind];
  if (kind === "claw") art = CLAW_MACHINE[isBusy ? ((time * 4) | 0) % 2 : 0];
  if (kind === "juicer") art = JUICER[isBusy ? ((time * 6) | 0) % 2 : 0];
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
// THE HAT OUTRANKS THE TOQUE. A mayor in this town still works their shift -
// SUDSY still hands out shower kits, a fisher mayor still stands on the rail -
// so if the office only showed up off the clock you would almost never see it.
// It goes on over everything, and it comes off the moment they lose.
function crabHat(c) { return isMayor(c) ? "tophat" : c.duty && !c.p.fisher ? "toque" : c.p.acc; }

function drawCrab(c) {
  if (c.hidden) return;
  const arts = CRAB_ARTS[c.p.color];
  const riding = c.cstate === "drive" && (c.dayState === "toWork" || c.dayState === "toHome");
  if (riding && c.p.mode === "buggy") {
    wblit(BUGGIES2[c.p.color], c.x - 16, ROAD_Y1 - BUGGIES2[0].h, c.flip);
    return;
  }
  // (both features touched these three: the nap/chat/rough poses from the
  //  needs work, and busing as a working pose from the table work)
  const napping = (c.napT || 0) > 0;
  const chatting = c.dayState === "chat";
  const working = !napping &&
    (c.kstate === "work" || c.kstate === "cleaningStall" || c.kstate === "busingTable") &&
    c.dayState === "working";
  const moving = !napping && !chatting &&
    (c.dayState !== "home" || Math.hypot((c.tx || c.x) - c.x, (c.ty || c.y) - c.y) > 2);
  const sleeping = napping || (!moving && c.dayState === "home" && (darkness() > 0.7 || c.p.rough));
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
  // THE WIDE BERTH's badge: the bubble of empty boardwalk needs a visible
  // cause, so a crab whose personal space has inflated wears stink lines.
  if (crabBerth(c) > 0 && darkness() <= 0.6 && c.dayState !== "home")
    wblit(STINK_MARK[((time * 3.1) | 0) % 2], c.x + 12, y - 7);
  if (sleeping) {   // a little Z drifts up from the shell
    const ph = (time * 0.45 + c.animT * 0.37) % 1;
    if (ph < 0.75) {
      const zx = c.x + 13 + ((Math.sin(ph * 9 + c.animT) * 2) | 0) - camX;
      if (zx > -4 && zx < W) smallText(ctx, "Z", zx, y - 2 - ph * 13, ph < 0.4 ? [200, 210, 235] : [150, 160, 195]);
    }
  }
  if (c.p.sick && ((c.animT * 2) | 0) % 2) wblit(SICK_MARK, c.x + 10, y - 8);
  // the OVERTIME POWERUP: readable at a glance to everyone, from live state,
  // so it appears the minute they clock past their shift and clears itself the
  // minute overtime ends. Bobs so it reads as a marker, not a hat.
  if (onOvertimeNow(c)) {
    const bobb = Math.sin(time * 3 + c.animT) > 0 ? 0 : 1;
    wblit(OT_MARK[((time * 2.2) | 0) % 2], c.x + 5, y - 18 - bobb);   // clear of the toque AND the work-progress bar
  }
  if (c.p.job === "fishing" && c.dayState === "working") wblit(ROD[((c.animT * 2) | 0) % 2], c.x + 12, y - 3, c.flip);
  if (c.carrying) wblit(ITEMS[c.carrying], c.x + 4, y - 7);
  if ((working || (napping && (c.napFrom === "work" || c.napFrom === "cleaningStall"))) && c.workMax > 0.7) {
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

// the ground a customer is standing on: FLOOR_Y for anybody in a line, but a
// visitor walking the pier planks is 66px higher up the screen
function custY(k) { return k.visitor && k.wy != null ? k.wy : FLOOR_Y; }
function drawCustomer(k) {
  {
    if (!k.isCrab) {
      k.animT += 0.016;
      const arts = CRAB_ARTS[k.color];
      if (k.state === "showering") return;   // behind the curtain (stall draws the bather)
      if (k.state === "inRoom") return;      // upstairs with the lamp on (the door draws them)
      // a crab shuffling up the line is WALKING, and legs sell it. Without this
      // the whole line slid up the boardwalk on its belly when the front left.
      const moving = (k.state !== "waiting" && k.state !== "onSand") || (k.state === "waiting" && k.qWalk);
      const art = moving && ((k.animT * 8) | 0) % 2 ? arts.b : arts.a;
      // a visitor faces the way they are walking; the old anonymous tourist
      // only ever walked one way, which is why this used to be a state test
      const flip = k.visitor ? (k.face == null ? true : k.face < 0) : k.state !== "leaving";
      const base = custY(k);
      const cy = base - 12 - 26 * (k.climb || 0);
      wblit(art, k.x, cy, flip);
      const acc = ACCESSORIES[k.acc];
      if (acc) {
        const ax = flip ? 16 - acc.dx - acc.art.w : acc.dx;
        wblit(acc.art, k.x + ax, cy + acc.dy, flip);
      }
      if (k.state === "onSand") {   // a night on the beach, and it shows
        const ph = ((time * 0.7 + k.x * 0.01) % 1);
        smallText(ctx, "Z", k.x + 11 - camX, cy - 4 - ph * 5, [200, 210, 255]);
      }
      if (k.state === "waiting" || (k.visitor && k.state === "roam" && k.idleT > 0)) {
        // a NAME on the boardwalk is the whole point of making them real: you
        // are meant to recognise MISTY on her second day in town
        const nm = k.name.split(" ")[0].slice(0, k.state === "waiting" ? 4 : 8);
        const nx = k.x + 8 - smallTextWidth(nm) / 2 - camX;
        if (nx > -30 && nx < W) smallText(ctx, nm, nx, base + 2, [100, 80, 55]);
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
    // windows glow only where somebody is actually home: an empty lot's
    // house stays dark all night (crew and townsfolk light up alike; boat
    // dwellers get their cabin lamp below instead)
    for (const c of allCrabs()) {
      if (c.dayState !== "home" || c.hidden || c.p.boat != null) continue;
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
  if (gravelyIll(c)) return ["FADING", [220, 60, 60]];   // the town SEES it: the death roll is armed
  if (wageGripe(c) >= WAGE_CFG.WARN) return ["SORE ABOUT PAY", [200, 60, 60]];   // one warning short of the door
  if (c.p.homeless) return ["DOWN", [190, 80, 80]];
  if (c.p.wallet < 10) return ["BROKE", [190, 80, 80]];
  if (c.p.wallet > 120) return ["FLUSH", [180, 140, 30]];
  if ((c.p.hunger || 0) > 0.7) return ["HUNGRY", [200, 110, 40]];
  if ((c.p.thirst || 0) > 0.8) return ["PARCHED", [200, 110, 40]];
  if ((c.p.dirt || 0) >= SHUN_AT) return ["RANK", [150, 110, 60]];   // the wide berth, named
  if ((c.p.tired || 0) > 0.85) return ["EXHAUSTED", [190, 80, 80]];
  // boredom's two moods, slotted to match the design doc's ranking: the crab
  // who has genuinely had enough outranks the clock, the merely restless one
  // does not outrank actually being mid-task
  if ((c.p.bored || 0) >= WALKOUT_AT) return ["AT A LOOSE END", [110, 120, 175]];
  if (darkness() > 0.7 && c.dayState !== "home") return ["UP LATE", [120, 120, 140]];
  if (darkness() > 0.7 && c.dayState === "home") return ["COZY", [180, 120, 60]];
  if (c.dayState === "working" && c.kstate === "work") return ["BUSY", [40, 110, 190]];
  if ((c.p.bored || 0) >= WANDER_AT) return ["RESTLESS", [125, 135, 180]];
  return ["SUNNY", [40, 150, 70]];
}
function custStatus(k) {
  const b = BIZ[k.biz] ? BIZ[k.biz].name : "TOWN";
  if (k.state === "ashore") return "WALKING DOWN THE PIER";
  if (k.state === "toPier") return ferryHere() ? "BOARDING THE FERRY" : "WAITING FOR THE FERRY";
  if (k.state === "toBiz") return "ON THEIR WAY TO THE " + BIZ[k.biz].short;
  if (k.state === "toRoom") return "OFF TO ROOM " + (k.roomN || "?");
  if (k.state === "inRoom") return "ASLEEP IN ROOM " + (k.roomN || "?");
  if (k.state === "onSand") return "NO ROOM - OUT ON THE SAND";
  if (k.state === "roam") return k.wallet < 6 ? "OUT OF MONEY, TAKING IT IN"
    : k.idleT > 0 ? "WATCHING THE TOWN GO BY" : "STROLLING THE PROMENADE";
  if (k.state === "arriving") return "HEADING TO THE " + b;
  if (k.state === "waiting") return "IN LINE AT THE " + b;
  if (k.state === "toSeat") return "FINDING A SEAT";
  if (k.state === "seatedWaiting") return "WAITING ON THEIR ORDER";
  if (k.state === "dining") return "EATING " + (ITEM_NAMES[k.recipe.icon] || "LUNCH");
  if (k.state === "waitStall" || k.state === "toStall" || k.state === "outStall") return "AT THE SHOWERS";
  if (k.state === "leaving") return k.happy ? "HEADING HOME HAPPY" : k.served ? "HEADING HOME" : "LEAVING IN A HUFF";
  return "ENJOYING THE BEACH";
}
// how long they have been here, in the words a player would use
function visStayLabel(k) {
  const d = day - k.arrived;
  return d <= 0 ? "ARRIVED TODAY" : d === 1 ? "HERE SINCE YESTERDAY" : "HERE " + (d + 1) + " DAYS";
}
// the one thing about this visitor you would say first
function visCondition(k) {
  if (k.roughNights > 0 && k.state !== "inRoom") return ["SLEPT ROUGH", [190, 80, 80]];
  if (k.wallet < 6) return ["SPENT UP", [150, 120, 90]];
  if (k.hunger > 0.75) return ["STARVING", [200, 110, 40]];
  if (k.thirst > 0.75) return ["PARCHED", [200, 110, 40]];
  if (k.dirt > 0.75) return ["GRUBBY", [150, 110, 60]];
  if (k.tired > 0.75) return ["WORN OUT", [110, 120, 175]];
  if (k.bored > 0.75) return ["BORED STIFF", [110, 120, 175]];
  if (k.wallet > 70) return ["FLUSH", [180, 140, 30]];
  return ["ON HOLIDAY", [40, 150, 70]];
}
// the five bars, in the follow card's one-row idiom - the SAME five a crab
// carries, in the same order, so the player learns one thing and reads two
const VIS_BAR = [["FED", "hunger"], ["THR", "thirst"], ["CLN", "dirt"], ["FUN", "bored"], ["SPA", "tired"]];
function visBars(k, x, y, w) {
  const cw = ((w - 16) / 5) | 0;   // four gaps of 4px: five meters have to read as five
  for (let i = 0; i < VIS_BAR.length; i++) {
    const [lbl, key] = VIS_BAR[i], v = Math.max(0, Math.min(1, k[key] || 0));
    const bx = x + i * (cw + 4);
    smallText(ctx, lbl, bx, y, [120, 110, 125]);
    rect(ctx, bx, y + 6, cw, 3, [30, 20, 36]);
    rect(ctx, bx, y + 6, Math.round(cw * (1 - v)), 3,
      v > 0.8 ? [235, 90, 90] : v > 0.5 ? [235, 200, 90] : [96, 200, 120]);
  }
}
function drawCustCard(k) {
  const wcard = 128;
  rect(ctx, 2, 2, wcard, 58, [30, 20, 36]);
  rect(ctx, 3, 3, wcard - 2, 56, [255, 250, 235]);
  rect(ctx, 5, 6, 20, 26, [245, 225, 200]);
  blit(ctx, CRAB_ARTS[k.color].a, 7, 14);
  const acc = ACCESSORIES[k.acc];
  if (acc) blit(ctx, acc.art, 7 + acc.dx, 14 + acc.dy);
  text(ctx, k.name.split(" ")[0].slice(0, 9), 29, 5, [40, 30, 40]);
  const mood = !k.served && k.recipe && k.patience < 15 ? ["STEAMED", [190, 80, 80]]
    : k.visitor ? visCondition(k)
    : k.happy || k.served ? ["HAPPY", [40, 150, 70]] : ["VISITING", [110, 110, 130]];
  smallText(ctx, mood[0], 104 - smallTextWidth(mood[0]), 6, mood[1]);
  if (k.visitor) {
    smallText(ctx, "VISITOR - " + visStayLabel(k), 29, 13, [120, 90, 60]);
    smallText(ctx, custStatus(k).slice(0, 26), 29, 21, [30, 110, 60]);
    smallText(ctx, "$" + Math.round(k.wallet) + " LEFT OF $" + k.purse
      + (k.room ? "  ROOM " + k.roomN : ""), 29, 28, [140, 110, 40]);
    visBars(k, 6, 37, 118);
    smallText(ctx, "MORE>", 126 - smallTextWidth("MORE>"), 52, [150, 140, 160]);
    return;
  }
  smallText(ctx, "TOURIST - IN TOWN FOR THE DAY", 29, 13, [120, 90, 60]);
  smallText(ctx, custStatus(k).slice(0, 26), 29, 21, [30, 110, 60]);
  smallText(ctx, "WANTS: " + (ITEM_NAMES[k.recipe.icon] || "?") + " $" + menuPrice(k.biz, k.recipe), 29, 28, [140, 110, 40]);
  smallText(ctx, "PATIENCE", 6, 44, [110, 110, 130]);
  rect(ctx, 40, 45, 60, 4, [30, 20, 36]);
  const pf = Math.max(0, Math.min(1, k.patience / (k.maxPatience || 50)));
  rect(ctx, 41, 46, Math.round(58 * pf), 2, pf > 0.5 ? [96, 200, 120] : pf > 0.25 ? [235, 200, 90] : [235, 90, 90]);
  smallText(ctx, "MORE>", 126 - smallTextWidth("MORE>"), 52, [150, 140, 160]);   // its own row: the need bars own y44-49
}
function drawFollowCard() {
  // any full-screen card owns the view: the little crab card must never sit on
  // top of the ledger, the census, the save screen or the day report
  if (dossier || manage || boardView || saveView || reportT > 0) return;
  if (tab === "menu") return;      // the MENU tab is a reading surface too
  if (sel && !sel.p) { drawCustCard(sel); return; }
  const c = sel;
  if (!c || !c.p) return;
  const p = c.p;
  const wcard = 128;
  rect(ctx, 2, 2, wcard, 58, [30, 20, 36]);
  rect(ctx, 3, 3, wcard - 2, 56, [255, 250, 235]);
  rect(ctx, 5, 6, 20, 26, [200, 230, 245]);
  blit(ctx, CRAB_ARTS[p.color].a, 7, 14);
  const acc = ACCESSORIES[crabHat(c)];
  if (acc) blit(ctx, acc.art, 7 + acc.dx, 14 + acc.dy);
  text(ctx, p.name, 29, 5, [40, 30, 40]);
  const [mood, mcol] = crabMood(c);
  smallText(ctx, mood, 104 - smallTextWidth(mood), 6, mcol);   // 104: the cycler chevrons own 106..127
  smallText(ctx, "MORE>", 126 - smallTextWidth("MORE>"), 52, [150, 140, 160]);   // its own row: the need bars own y44-49
  smallText(ctx, TRAITS[p.trait].label + " " + MODES[p.mode].label, 29, 13, [120, 90, 60]);
  smallText(ctx, crabStatus(c).slice(0, 26), 29, 21, [30, 110, 60]);
  // SHIFT reads the hours they ACTUALLY work today, so an OT day shows the
  // longer window with the OT tag right beside it
  const ot = otMinutes(c) > 0;
  const shiftTxt = "SHIFT " + (ot ? effShift(c).label : baseShift(c).label);
  smallText(ctx, shiftTxt, 29, 28, ot ? [200, 110, 40] : [110, 110, 130]);
  const wTxt = "$" + fmt(Math.max(0, p.wallet));
  const wx3 = 126 - textWidth(wTxt, 5);
  {   // the OT tag, else the weekly day off, when the row has room for it
    const tag = ot ? "OT +" + Math.round(otMinutes(c) / 60) + "H" : "OFF " + WEEKDAYS[dayOffIdx(c)];
    const ox = 29 + smallTextWidth(shiftTxt) + 5;
    if (ox + smallTextWidth(tag) < wx3 - 2)
      smallText(ctx, tag, ox, 28, ot ? [255, 190, 90] : [70, 140, 200]);
  }
  text(ctx, wTxt, wx3, 28, p.homeless ? [190, 80, 80] : [140, 110, 40], 5);
  const trend = p.walletPrev == null ? 0 : p.wallet - p.walletPrev;
  if (trend) smallText(ctx, trend > 0 ? "+" : "-", wx3 - 6, 29, trend > 0 ? [40, 150, 70] : [190, 80, 80]);
  // job + needs
  const jobTag = p.owner ? "OWN" : p.job === "fishing" ? "PIER" : BIZ[p.job].short;   // live job, not the old trade
  smallText(ctx, "JOB:" + jobTag, 6, 36, [70, 90, 130]);
  if (Object.keys(BIZ).filter(b => bizUnlocked(b) && bizOwner(b) === "player").length > 1) {
    rect(ctx, 58, 35, 28, 8, [96, 170, 220]);
    smallText(ctx, "JOB>", 60, 36, [255, 255, 255]);
  }
  const eff = crabEff(c) * (p.sick ? 0.5 : 1);   // illness halves everything - show it
  if (eff < 0.995)
    smallText(ctx, "PACE " + Math.round(eff * 100) + "%", 74, 36, eff < 0.8 ? [190, 80, 80] : [200, 110, 40]);
  const bars = [["FED", 1 - (p.hunger || 0), 6], ["SIP", 1 - (p.thirst || 0), 30],
    ["CLN", 1 - (p.dirt || 0), 54], ["FUN", 1 - (p.bored || 0), 78], ["ZZZ", 1 - (p.tired || 0), 102]];
  for (const [label, frac, bx] of bars) {
    smallText(ctx, label, bx, 44, [110, 110, 130]);
    rect(ctx, bx + 11, 45, 13, 4, [30, 20, 36]);
    rect(ctx, bx + 12, 46, Math.round(11 * frac), 2,
      frac > 0.5 ? [96, 200, 120] : frac > 0.25 ? [235, 200, 90] : [235, 90, 90]);
  }
}

// ---------------------------------------------------------------- the nav strip
// THE TOWN IS 2512 PIXELS WIDE AND THE WINDOW IS 256. Before this the only way
// to learn the shape of the place was to hold an arrow key down: no map, no
// index, and the two screens that matter most were reached by CLICKING A
// PICTURE OF A BUILDING - the management card off a shopfront's sign, and the
// census filed as a TAB INSIDE that card, so the whole town lived inside one
// shop. Matt: "i know the town view needs to be more obvious; that's hard to
// get to", "the management screen is too important to be a graphic in the
// game, needs more central positioning", "a minimap nav thingy would be nice".
//
// So: the town drawn to scale in the only rows the world has never used.
// FLOOR_MAX is 168 and the panel starts at 176 - nothing has ever been painted
// between them - which is where the whole strip fits without covering a single
// crab. It is a CROSS-SECTION, not a floorplan: water, shore, promenade, lots,
// top to bottom, the same order your eye reads the real screen in, so the map
// and the town agree about which way is out to sea.
//
// ONE WORD IS PRINTED ON IT AND IT IS "SHACK". At 1:9.8 the shack's 340px lot
// is 35 strip pixels - the only building both wide enough to carry a name and
// tall enough to hold one - and pure geography lands it within a pixel of the
// middle of the map. That is the answer to "maybe it's not obvious enough that
// the crab shack is the central place money comes from": on the map it is the
// tallest thing, the only gold thing and the only named thing, dead centre.
//
// MONEY ARRIVING, ON THE MAP. Matt: "maybe it's not obvious enough that the
// crab shack is the central place money comes from". The map answers the WHERE
// (tallest, goldest, named, dead centre); this answers the WHAT. Every time one
// of your shops takes money its block on the strip flashes, so a player who has
// never opened a ledger watches the coins land on the middle of the town.
//
// It is READ-ONLY BOOKKEEPING: the draw watches today.biz[key].take, which the
// till already keeps for the management card, and remembers what it saw. The
// sim does not know this exists and cannot be changed by it - note the plain
// lookup rather than bizDayBook(), which would CREATE a day-book entry for a
// shop that has not traded and put a phantom line in the night's report.
const NAV_FLASH = 0.22;                     // long enough to catch, short enough not to strobe
const navTake = {}, navFlash = {};
function navTill(key) { const bk = today.biz[key]; return bk ? bk.take || 0 : 0; }
function navFlashing(key) {
  const take = navTill(key);
  const seen = navTake[key];
  if (seen != null && take > seen) navFlash[key] = time;
  navTake[key] = take;                      // ...and a day rollover resets it to 0 without a flash
  return navFlash[key] != null && time - navFlash[key] < NAV_FLASH;
}
const NAV_H = 7;                            // the free rows between FLOOR_MAX and the panel
const NAV_CHIP_H = 11;                      // ...and a thumb-sized chip row above them
// The map is the full width of the canvas and cannot be anything else, so it is
// a const rather than a fresh object per call - navToScreen is on the hot path
// (once per landmark and once per crab, every frame).
const NAV_MAP = { x: 0, y: PANEL_Y - NAV_H, w: W, h: NAV_H };
// MANAGE and TOWN are the two screens that were only ever reachable by finding
// the right building. They sit on the LEFT of the chip row above the map,
// because the RIGHT of that row is already spoken for: the debt and bankruptcy
// warnings stack up from there.
function navRects() {
  const cy = NAV_MAP.y - NAV_CHIP_H - 1;
  const mw = smallTextWidth("MANAGE") + 8, tw = smallTextWidth("TOWN") + 8;
  return {
    map: NAV_MAP,
    manage: { x: 2, y: cy, w: mw, h: NAV_CHIP_H },
    town: { x: 4 + mw, y: cy, w: tw, h: NAV_CHIP_H },
  };
}
// world x <-> strip x. Rounded on the way out so a building's block and its
// hit test land on the same pixel column.
function navToScreen(wx) { return NAV_MAP.x + Math.round(wx * NAV_MAP.w / WORLD_W); }
function navToWorld(px) { return (px - NAV_MAP.x) * WORLD_W / NAV_MAP.w; }
// ONE TABLE, THREE READERS: the draw, the hit test and the camera jump all walk
// this list, so nothing can be drawn somewhere you cannot click and nothing can
// be clickable that was never drawn. Shops come straight out of BIZ, which is
// what makes a new lot appear on the map the day it opens.
function navMarks() {
  const M = [];
  for (const k of Object.keys(BIZ)) {
    if (!bizUnlocked(k)) continue;
    const b = BIZ[k];
    M.push({ x0: b.x0, x1: b.x1, kind: k === "shack" ? "shack" : "biz", key: k,
      mine: bizOwner(k) === "player" });
  }
  M.push({ x0: SHELTER_X, x1: SHELTER_X + SHELTER2.w, kind: "shelter" });
  M.push({ x0: PIER_X0 - 4, x1: PIER_X1 + 4, kind: "pier" });
  M.push({ x0: FERRY.hull - 14, x1: FERRY.hull + 14, kind: "boat" });
  for (const hx of HOUSE_XS) M.push({ x0: hx, x1: hx + HOUSES2[0].w, kind: "house" });
  return M;
}
// the strip is live on exactly the terms the crab cycler is: the town is on
// screen and nothing is being read on top of it
function navLive() {
  return screen === "play" && !gameOver
    && !(dossier || manage || boardView || saveView || reportT > 0)
    && !(window.MergeMode && MergeMode.active());
}
// ...and the two chips need somewhere to go: a player with no shop left has no
// management card to open, and the census is drawn on one.
function navChipsLive() { return navLive() && ownedBizList().length > 0; }

// A CLICK ON THE STRIP PUTS THE CAMERA THERE, and on a landmark it centres the
// LANDMARK rather than the pixel you hit - a beach cottage is six strip pixels
// wide and nobody can aim at that. The slop is exactly one strip pixel of world,
// so the target is the block you can see plus the rounding that drew it.
function navPlaceAt(px) {
  const wx = navToWorld(px), grab = WORLD_W / NAV_MAP.w;
  let best = null, bestD = 1e9;
  for (const mk of navMarks()) {
    if (wx < mk.x0 - grab || wx > mk.x1 + grab) continue;
    const d = Math.abs((mk.x0 + mk.x1) / 2 - wx);
    if (d < bestD) { bestD = d; best = mk; }
  }
  return best;
}
function navCamFor(px) {
  const mk = navPlaceAt(px);
  const cx = mk ? (mk.x0 + mk.x1) / 2 : navToWorld(px);
  return clampCam(Math.round(cx - W / 2));
}
function navJumpTo(px) {
  camX = navCamFor(px);
  followIdx = -1; followNpc = null; followCust = null;   // you asked for a place, not a crab
}
// dragging along the strip SCRUBS the town past the window - no snapping, the
// camera tracks the finger
function navScrubTo(px) {
  camX = clampCam(Math.round(navToWorld(px) - W / 2));
  followIdx = -1; followNpc = null; followCust = null;
}
function navTrackHit(p) {
  if (!navLive()) return false;
  const m = NAV_MAP;
  // two rows of slop above the strip: it is seven pixels tall and a thumb is not
  const y0 = m.y - 2;
  return p.x >= m.x && p.x < m.x + m.w && p.y >= y0 && p.y < m.y + m.h;
}
function navTapChip(p) {
  if (!navChipsLive()) return false;
  const R = navRects();
  const hit = (r) => p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h;
  if (hit(R.manage)) {
    // WHICH SHOP? The one you are looking at, if you own it - the chip answers
    // for the business on screen - and the SHACK otherwise, because the shack is
    // the business this game is about. NEXT> on the card reaches the rest.
    const owned = ownedBizList(), mid = camX + W / 2;
    manage = owned.find(b => mid >= BIZ[b].x0 - 48 && mid <= BIZ[b].x1 + 48)
      || (owned.includes("shack") ? "shack" : owned[0]);
    manageTab = "HOURS"; sfx.ding(); return true;
  }
  if (hit(R.town)) {
    // THE TOWN IS NOT A PAGE OF A SHOP. It is still drawn on the management
    // card - one card, three tabs - but you no longer have to go through a
    // shopfront to reach it, and the card retitles itself when you arrive here.
    manage = ownedBizList().includes("shack") ? "shack" : ownedBizList()[0];
    manageTab = "TOWN"; sfx.ding(); return true;
  }
  return false;
}

function drawNav() {
  if (!navLive()) return;
  const R = navRects(), m = NAV_MAP, sx = navToScreen, marks = navMarks();
  // ---- the cross-section. Four bands, end to end, so the strip reads as a
  // coastline before a single building is on it.
  rect(ctx, m.x, m.y, m.w, 1, [40, 140, 220]);           // out to sea
  rect(ctx, m.x, m.y + 1, m.w, 1, [246, 222, 170]);      // the shore
  rect(ctx, m.x, m.y + 2, m.w, 1, [96, 92, 110]);        // the promenade, end to end
  rect(ctx, m.x, m.y + 3, m.w, m.h - 3, [232, 208, 162]);  // the lots
  // ---- what is on it. Heights ARE the legend: the taller it is the more it
  // matters, and only one thing reaches the water.
  for (const mk of marks) {
    const x0 = sx(mk.x0), w = Math.max(1, sx(mk.x1) - x0);
    if (mk.kind === "pier") { rect(ctx, x0, m.y, w, 1, [236, 214, 170]); continue; }
    if (mk.kind === "boat") { rect(ctx, x0 + ((w - 3) >> 1), m.y, 3, 1, [240, 246, 255]); continue; }
    if (mk.kind === "house") {
      rect(ctx, x0, m.y + 5, w, 1, [150, 92, 70]);       // roof
      rect(ctx, x0, m.y + 6, w, 1, [206, 158, 118]);     // and the wall under it
      continue;
    }
    if (mk.kind === "shelter") { rect(ctx, x0, m.y + 4, w, 3, [128, 150, 186]); continue; }
    if (mk.kind === "shack") continue;                   // drawn last, over everything
    rect(ctx, x0, m.y + 3, w, m.h - 3, !mk.mine ? [108, 100, 140]
      : navFlashing(mk.key) ? [255, 244, 210] : [212, 142, 56]);
  }
  const shack = marks.find(mk => mk.kind === "shack");
  if (shack) {
    const x0 = sx(shack.x0), w = Math.max(1, sx(shack.x1) - x0);
    rect(ctx, x0, m.y + 1, w, m.h - 1,
      navFlashing("shack") ? [255, 250, 230] : [255, 216, 96]);   // through the promenade and onto the sand
    // the one word on the map. It only prints if the lot is genuinely wide
    // enough to hold it - measured, never counted - so a future shack that
    // shrinks loses its label instead of spilling onto its neighbours.
    const lbl = "SHACK", lw = smallTextWidth(lbl);
    if (lw + 2 <= w) smallText(ctx, lbl, x0 + ((w - lw) >> 1), m.y + 1, [70, 48, 20]);
  }
  // ---- WHERE THE CREW ARE. One pixel each, in their own shell colour, on the
  // promenade line: the answer to "where did PINCHY go" without a card.
  for (const c of crabs) {
    if (c.hidden) continue;
    const pal = CRAB_COLORS[c.p.color % CRAB_COLORS.length];
    rect(ctx, Math.max(m.x, Math.min(m.x + m.w - 1, sx(c.x + 8))), m.y + 2, 1, 1, pal[0]);
  }
  // ---- THE WINDOW. Everything you are NOT looking at goes under a wash, so the
  // bright slice of coast IS the screen above it - no legend needed.
  const cx0 = sx(camX), cw = Math.max(4, sx(camX + W) - cx0);
  ctx.fillStyle = "rgba(20,14,34,0.2)";
  ctx.fillRect(m.x, m.y, cx0 - m.x, m.h);
  ctx.fillRect(cx0 + cw, m.y, m.x + m.w - (cx0 + cw), m.h);
  rect(ctx, cx0, m.y, 1, m.h, [255, 255, 255]);
  rect(ctx, cx0 + cw - 1, m.y, 1, m.h, [255, 255, 255]);
  rect(ctx, cx0, m.y + m.h - 1, cw, 1, [255, 255, 255]);   // ...and underlined, so it reads as a frame
  // whoever is picked - crab, townsfolk or tourist - goes on top of the wash, so
  // the strip answers "where are they" even when they are three screens away
  if (sel && sel.x != null && !sel.hidden) {
    const px2 = Math.max(m.x, Math.min(m.x + m.w - 1, sx(sel.x + 8)));
    rect(ctx, px2, m.y + 2, 1, 1, [255, 255, 255]);
  }
  // ---- and the two screens that used to be buildings
  if (!navChipsLive()) return;
  const chip = (r, label) => {
    rect(ctx, r.x, r.y, r.w, r.h, [30, 20, 36]);
    rect(ctx, r.x + 1, r.y + 1, r.w - 2, r.h - 2, [235, 225, 205]);
    smallText(ctx, label, r.x + ((r.w - smallTextWidth(label)) >> 1), r.y + 3, [90, 60, 40]);
  };
  chip(R.manage, "MANAGE");
  chip(R.town, "TOWN");
}

function drawPanel() {
  rect(ctx, 0, PANEL_Y, W, H - PANEL_Y, [58, 42, 38]);
  rect(ctx, 0, PANEL_Y, W, 1, [120, 90, 70]);
  blit(ctx, COIN, 4, PANEL_Y + 2);
  textShadow(ctx, "$" + fmt(coins), 13, PANEL_Y + 2, [255, 230, 120], [30, 20, 20]);
  smallText(ctx, WEEKDAYS[weekdayIdx(day)], 71, PANEL_Y + 3, [190, 175, 160]);
  text(ctx, "D" + day + " " + clockStr(), 84, PANEL_Y + 2, [220, 210, 190]);
  rect(ctx, 146, PANEL_Y + 1, 19, 11, muted ? [140, 50, 50] : [30, 20, 20]);
  rect(ctx, 147, PANEL_Y + 2, 17, 9, muted ? [90, 35, 35] : [90, 70, 60]);
  blit(ctx, muted ? SPEAKER_OFF : SPEAKER_ON, 150, PANEL_Y + 3);
  {
    const invite = !musicOn && !muted && musNudges < 3;
    const pulse = invite && (time % 2) < 1.2;
    smallText(ctx, "MUS", 169, PANEL_Y + 3,
      !muted && musicOn ? [140, 220, 140] : pulse ? [255, 216, 96] : [140, 120, 110]);
    if (invite && !musNudged && screen === "play" && tmin > 9.5 * 60 && !toast && reportT <= 0) {
      toast = { text: "THE BAND IS WARMED UP - MUS TO LISTEN", t: 6 };
      musNudged = true;
    }
  }
  smallText(ctx, "SND", 190, PANEL_Y + 3, !muted && soundOn ? [140, 220, 140] : [140, 120, 110]);
  // the pause chip sits FIRST in the speed row, because it is the same
  // question the row answers: how fast is time going?
  // IT LIVES AT THE HEAD OF THE SPEED GROUP, and the speeds shifted right to
  // make the room. The first cut put it at x191, which is ON TOP OF "SND" -
  // the label draws at 190..201 and the chip painted over it, while the click
  // band (`p.x >= 191`, tested before sound's) left SND two live pixels. That
  // row has NO free space: mute, music and sound own every pixel from 145 to
  // 203 in one unbroken `>` chain, so the only honest fix is to move the
  // speeds along rather than squat in a gap that only LOOKS empty.
  {
    const on = paused;
    rect(ctx, 203, PANEL_Y + 1, 9, 9, on ? [255, 230, 120] : [70, 58, 54]);
    rect(ctx, 205, PANEL_Y + 3, 2, 5, on ? [40, 24, 16] : [190, 176, 166]);
    rect(ctx, 208, PANEL_Y + 3, 2, 5, on ? [40, 24, 16] : [190, 176, 166]);
  }
  smallText(ctx, ">>", 214, PANEL_Y + 3, ffMode === 1 ? [255, 230, 120] : [150, 132, 122]);
  smallText(ctx, ">>>", 226, PANEL_Y + 3, ffMode === 2 ? [255, 230, 120] : [150, 132, 122]);
  smallText(ctx, ">>>>", 240, PANEL_Y + 3, ffMode === 3 ? [255, 230, 120] : [150, 132, 122]);
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
    rect(ctx, 128, TAB_Y, 30, TAB_H, saveView ? [190, 140, 80] : [90, 70, 60]);
    smallText(ctx, "SAVE", 128 + 6, TAB_TX, saveView ? [40, 24, 16] : [160, 140, 130]);
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
      if (!bizUnlocked(key) || bizOwner(key) !== "player") continue;   // your menu, your books
      for (const r of BIZ[key].recipes) {
        smallText(ctx, ITEM_NAMES[r.icon], 4, my, [190, 175, 160]);
        smallText(ctx, "$" + menuPrice(key, r) + " / $" + INGREDIENT_COST[r.raw], 72, my,
          bizPriceMul(key) === 1 ? [140, 200, 150] : [255, 190, 90]);
        my += MROW;
      }
    }
    smallText(ctx, "LOCALS PAY +25%", 4, my + 1, [170, 150, 135]);   // under the last menu row
    smallText(ctx, "TONIGHT AT 20:00", 132, ROW_Y, [230, 215, 195]);
    let by = ROW_Y + MROW + 1;
    // one predicate, three surfaces: this list, the BILL chip and the
    // settlement loop all read crabDueTonight, so the column always adds up
    const owed = crabs.filter(c => crabDueTonight(c) > 0);
    const owedN = owed.length;
    // labor is priced by the hour now, so the rate is quoted per STANDARD
    // shift and the column sums what each crab's own contracted hours cost
    const baseBill = owed.reduce((s, c) => s + Math.round(basePayToday(c)), 0);
    // the rate quoted here is the crew's OWN rate when they all share one, and
    // MIXED the moment somebody is on a private deal - the column below is
    // always the exact per-crab total either way
    const rates = Array.from(new Set(owed.map(c => Math.round(wageRate(c)))));
    const rateTxt = rates.length === 1 ? "$" + rates[0] : "MIXED";
    smallText(ctx, "WAGES " + owedN + "X" + rateTxt + "/" + (STD_SHIFT / 60) + "H" + (owedN < crabs.length ? " (" + (crabs.length - owedN) + " OUT)" : ""), 132, by, [190, 175, 160]);
    smallText(ctx, "$" + baseBill, 224, by, [235, 160, 130]); by += MROW;
    const otBill = owed.reduce((s, c) => s + Math.round(otPayForecast(c)), 0);
    if (otBill > 0) {
      const otN = owed.filter(c => otPayForecast(c) > 0).length;
      smallText(ctx, "OVERTIME " + otN + "X AT " + OT_RATE + "X", 132, by, [190, 175, 160]);
      smallText(ctx, "$" + otBill, 224, by, [235, 160, 130]); by += MROW;
    }
    for (const key of Object.keys(BIZ)) {
      if (!bizUnlocked(key) || bizOwner(key) !== "player") continue;   // only rents YOU pay tonight
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
      const picked = sel === c;
      rect(ctx, bx, ROW_Y, CARD, CARD, picked ? [255, 230, 120] : [30, 20, 20]);
      rect(ctx, bx + 1, ROW_Y + 1, CARD - 2, CARD - 2, [200, 230, 245]);
      const hat = isMayor(c) ? "tophat" : c.duty ? "toque" : c.p.acc, acc = ACCESSORIES[hat];
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
// MR. PINCHERTON'S TERMS, hoisted out of the draw so the suite can measure
// them. The card is 200px wide and the 5x7 font is 6px a character, so a term
// gets 31 characters INCLUDING its "- " - and four of the six shipped over
// that, printing off the card and, in one case, off the canvas entirely. The
// prices are interpolated, so the margin has to survive a three-digit wage and
// a four-digit rent too; the scenario checks the rendered width, not the
// character count.
const LEASE_SIGNOFF = "GOOD LUCK. I'LL COME COLLECT.";
function leaseTerms() {
  return [
    ["THE SHACK IS YOURS TO RUN", [70, 70, 90]],
    ["RENT $" + BIZ.shack.rent + ", NIGHTLY AT 20:00", [170, 50, 50]],
    ["IT IS DUE TONIGHT. GOOD LUCK.", [170, 50, 50]],
    ["WAGES $" + bizWage("shack") + " A SHIFT, YOUR CALL", [70, 70, 90]],
    ["CREW PAY $" + HOUSE_RENT + " HOME RENT EACH", [70, 70, 90]],
    ["MISS RENT AND I TAKE IT BACK", [170, 50, 50]],
  ];
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
  const terms = leaseTerms();
  for (let i = 0; i < terms.length; i++)
    text(ctx, "- " + terms[i][0], cx2 + 6, 60 + i * 11, terms[i][1]);
  text(ctx, LEASE_SIGNOFF, cx2 + 6, 60 + terms.length * 11 + 3, [110, 90, 80]);
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
  // the towns shelf: multiple saves, import, export
  const sy = ny + 20;
  rect(ctx, bx, sy, 100, 16, [30, 20, 36]);
  rect(ctx, bx + 1, sy + 1, 98, 14, [90, 130, 160]);
  text(ctx, "SAVED TOWNS", bx + 14, sy + 5, [245, 250, 255]);
  {
    let n = 0;
    for (let i = 1; i <= SLOTS; i++) if (slotCard(i)) n++;
    smallText(ctx, n === 1 ? "1 TOWN SAVED" : n + " TOWNS SAVED", W / 2 - smallTextWidth(n + " TOWNS SAVED") / 2,
      sy + 19, [200, 190, 180]);
  }
  smallText(ctx, "MUSIC: PIXEL WAVE WALTZ - MATT CLANKER", 14, PANEL_Y + 8, [170, 150, 135]);
  smallText(ctx, "BUILT ON THE SNESCAT TOY PPU", 44, PANEL_Y + 20, [140, 120, 105]);
}
// THE THIRD ENDING. EVICTED and BANKRUPT are the landlord and the bank; this
// one is the boat. It does not slam a card over a frozen town: for the first
// couple of seconds you just watch her come alongside the pier (winFerry swung
// the camera there), and only then does the card come up, fading in, so the
// last thing the run does is show you the thing you paid for.
const WIN_BEAT = 2.2;
function drawEnding() {
  const R = winRec || { day, lifetime: Math.round(lifetime), crew: [], pop: 0, housed: 0, hand: "SOMEBODY" };
  if (winT < WIN_BEAT) {
    const t2 = Math.max(0, winT - 1.0) / (WIN_BEAT - 1.0);
    ctx.fillStyle = `rgba(16,12,30,${(0.55 * t2).toFixed(3)})`;
    ctx.fillRect(0, 0, W, H);
    const hd = "SHE IS IN";
    const hw = textWidth(hd) + 12;
    rect(ctx, (W - hw) / 2, 158, hw, 13, [30, 20, 36]);
    text(ctx, hd, (W - textWidth(hd)) / 2, 161, [255, 240, 170]);
    return;
  }
  const fade = Math.min(1, (winT - WIN_BEAT) / 0.9);
  ctx.fillStyle = `rgba(16,12,30,${(0.55 + 0.25 * fade).toFixed(3)})`;
  ctx.fillRect(0, 0, W, H);
  const x = 10, y = 10, w2 = 236, h2 = 162;
  rect(ctx, x - 2, y - 2, w2 + 4, h2 + 4, [30, 20, 36]);
  rect(ctx, x, y, w2, h2, [255, 250, 235]);
  rect(ctx, x, y, w2, 3, [96, 170, 220]);
  const ttl = "THE CRABALINA";
  textShadow(ctx, ttl, (W - textWidth(ttl)) / 2, y + 8, [40, 110, 190], [190, 215, 235]);
  const crew = R.crew.slice(0, 4).join(", ") + (R.crew.length > 4 ? " +" + (R.crew.length - 4) : "");
  const body = [
    ["YOU PAID FOR HER IN FISH SUPPERS. $" + ferryFare() + ",", 0],
    ["ONE PLATE AT A TIME.", 0],
    ["", 0],
    ["SHE COMES ROUND THE POINT ON THE MORNING TIDE,", 1],
    ["LOW AND WHITE, AND THE WHOLE TOWN IS ON THE PIER", 1],
    ["BEFORE THE ROPE IS THROWN. " + R.hand + " TAKES IT.", 1],
    ["THEY HAD BEEN WAITING YEARS TO DO THAT.", 1],
    ["", 0],
    ["YOU DID NOT BUY A WAY OUT. YOU BOUGHT THE", 0],
    ["CROSSING, AND A CROSSING RUNS BOTH WAYS. THE", 0],
    ["SHACK OPENS AT SEVEN TOMORROW. THE MIST WILL", 0],
    ["COME IN TONIGHT LIKE IT ALWAYS DOES, AND FOR", 0],
    ["ONCE IT WILL HIDE SOMEWHERE THE TOWN CAN GO.", 0],
  ];
  let ly = y + 22;
  for (const [line, tone] of body) {
    if (line) smallText(ctx, line, x + 6, ly, tone ? [90, 80, 95] : [58, 48, 58]);
    ly += line ? 8 : 4;
  }
  rect(ctx, x + 4, ly + 1, w2 - 8, 1, [222, 212, 196]);
  ly += 6;
  smallText(ctx, "ABOARD  " + crew, x + 6, ly, [40, 110, 190]); ly += 8;
  smallText(ctx, "DAY " + R.day + " - $" + commas(R.lifetime) + " TAKEN - "
    + R.pop + " CRABS, " + R.housed + " HOUSED", x + 6, ly, [140, 110, 40]); ly += 10;
  const tag = "CRABALINA IS ON THE MAP";
  smallText(ctx, tag, x + ((w2 - smallTextWidth(tag)) >> 1), ly, [40, 130, 70]);
  if (((time * 2) | 0) % 2)
    smallText(ctx, "CLICK TO START OVER", x + ((w2 - smallTextWidth("CLICK TO START OVER")) >> 1), y + h2 - 9, [120, 110, 120]);
}
function drawGameOver() {
  if (won) return drawEnding();
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
// ---------------------------------------------------------------- the record
// The dossier is now a two-page record with a bottom control bar - PROFILE
// (who they are right now) and DIARY (what they have been doing), plus a
// FOLLOW button that puts the camera on them and gets out of the way.
// Same idiom as manageRects: ONE geometry table feeds both the draw and the
// hit-test, so the tap targets can never drift from the pixels. Every offset
// derives from the card, and the card sits inside rows 0..PANEL_Y, which is
// the world area in BOTH canvas modes - so 240 and 288 get the same record.
const DOSS_H = 168, CUST_H = 120, VIS_H = 162;   // the crab record, the walk-in card, the visitor's
const DOSS_TABS = ["PROFILE", "DIARY"];
let dossierTab = "PROFILE", diaryPage = 0, diaryFor = null;
const DIARY_ROWS = 12;
function dossierRects(h2) {
  const x = 24, y = 6, w2 = 208;
  const by = y + h2 - 16;
  const R = { x, y, w: w2, h: h2, tab: {},
    follow: { x: x + 100, y: by, w: 54, h: 13 },
    close:  { x: x + 158, y: by, w: 46, h: 13 },
    prev:   { x: x + 152, y: y + 33, w: 14, h: 11 },
    next:   { x: x + 190, y: y + 33, w: 14, h: 11 },
    rows: [] };
  DOSS_TABS.forEach((t, i) => R.tab[t] = { x: x + 4 + i * 46, y: by, w: 44, h: 13 });
  for (let i = 0; i < DIARY_ROWS; i++) R.rows.push({ x: x + 4, y: y + 50 + i * 8, w: w2 - 8, h: 8 });
  return R;
}
function isFollowing(c) {
  return c ? (followCust === c || followNpc === c || (followIdx >= 0 && crabs[followIdx] === c)) : false;
}
// SELECTION and CAMERA are deliberately separate in this game (a drag drops the
// camera and keeps the selection). FOLLOW sets BOTH, so right-click orders go
// to the crab you just chose to watch - and it works for a tourist too, who is
// a customer object rather than a crab.
function followCrab(c) {
  if (!c) return;
  sel = c;
  if (!c.p) { followCust = c; followIdx = -1; followNpc = null; }
  else if (c.p.npc) { followNpc = c; followIdx = -1; followCust = null; }
  else { followIdx = crabs.indexOf(c); followNpc = null; followCust = null; }
}

// ---------------------------------------------------------------- CYCLE THE FOCUS
// A pictorial next/prev: a little crab between two chevrons, no words, so it
// reads the same in any language and at any canvas height. It steps the
// SELECTION through the town and takes the CAMERA with it (followCrab sets
// both), which is the whole point - you flick from crab to crab and watch each
// one work.
//
// WHAT IT CYCLES: every resident crab, crew first then townsfolk - literally
// allCrabs(), the town's own roster order. Visiting TOURISTS are deliberately
// out: they are customer objects that arrive and go home mid-cycle, so a list
// containing them has no stable length and "wrap around" stops meaning
// anything. You can still click a tourist to follow one; the cycler then treats
// them as "nothing selected" and steps to the first (or last) crab in town.
//
// WHERE IT LIVES: ON THE CHARACTER CARD (Matt, 2026-08-19: "the new character
// selector thing takes up too much room: make it just little buttons on the
// character info window"). Two 9x11 chevrons in the card's own header, right
// of the name, costing the HUD nothing - it was a 48x17 chip under the sun and
// now it is part of the thing it steps. Consequences, both deliberate:
//   - no card, no chevrons. You pick a crab first (click any crab), and THEN
//     you flick through them, which is the order a player does it in anyway.
//     The [ and ] keys still cycle with nothing selected, and take the first
//     or last crab in town - that is what cyclerLive() is for.
//   - a TOURIST's card gets them too. Tourists are not in the cycle list, so
//     the chevrons are the way back out of one and into the town roster.
// It hides behind any full-screen reading surface on exactly the same terms
// the card does: the ledger, the management card, the census, the save screen
// and the day report own the screen.
function cycleList() { return allCrabs(); }
const CYCLE_W = 21, CYCLE_H = 12;
function cyclerRects() {
  const x = 106, y = 3;          // the card's own header row, right of the name
  return { x, y, w: CYCLE_W, h: CYCLE_H,
    prev: { x, y, w: 10, h: CYCLE_H },
    next: { x: x + 11, y, w: 10, h: CYCLE_H } };
}
// the cycle is LIVE (keyboard) whenever the town is on screen and nothing is
// being read...
function cyclerLive() {
  return screen === "play" && !gameOver
    && !(dossier || manage || boardView || saveView || reportT > 0) && tab !== "menu"
    && cycleList().length > 0;
}
// ...and SHOWN (chevrons drawn, tappable) only where they live: on the card,
// which is only up when something is selected.
function cyclerShown() { return cyclerLive() && !!sel; }
// step the selection (and the camera with it) by dir, wrapping at both ends.
// With nothing selected - or with a tourist selected, who is not in the list -
// `>` takes the first crab in town and `<` takes the last.
function cycleSel(dir) {
  const list = cycleList();
  if (!list.length) return null;
  const i = list.indexOf(sel);
  const next = i < 0 ? (dir > 0 ? list[0] : list[list.length - 1])
    : list[((i + dir) % list.length + list.length) % list.length];
  followCrab(next);
  return next;
}
function tapCycler(p) {
  if (!cyclerShown()) return false;
  const R = cyclerRects();
  const hit = (r) => p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h;
  if (hit(R.prev)) { cycleSel(-1); sfx.ding(); return true; }
  if (hit(R.next)) { cycleSel(1); sfx.ding(); return true; }
  return false;
}
function drawCycler() {
  if (!cyclerShown()) return;
  const R = cyclerRects();
  const chip = (r, dir) => {
    rect(ctx, r.x, r.y, r.w, r.h, [30, 20, 36]);
    rect(ctx, r.x + 1, r.y + 1, r.w - 2, r.h - 2, [235, 225, 205]);
    // the chevron, drawn as pixels rather than typed: no words anywhere
    const cx = r.x + (dir > 0 ? 3 : 6), cy = r.y + 6;
    for (let i = 0; i < 3; i++) {
      px(ctx, cx + i * dir, cy - i, [90, 60, 40]);
      px(ctx, cx + i * dir, cy + i, [90, 60, 40]);
      px(ctx, cx + i * dir + dir, cy - i, [90, 60, 40]);
      px(ctx, cx + i * dir + dir, cy + i, [90, 60, 40]);
    }
  };
  chip(R.prev, 1);    // "<" : apex on the left, arms opening right
  chip(R.next, -1);   // ">" : apex on the right
}
function dossierBar(R, c, diary) {
  const chip = (r, label, hot, dim) => {
    rect(ctx, r.x, r.y, r.w, r.h, [30, 20, 36]);
    rect(ctx, r.x + 1, r.y + 1, r.w - 2, r.h - 2, hot ? [190, 140, 80] : dim ? [222, 212, 196] : [235, 225, 205]);
    smallText(ctx, label, r.x + ((r.w - smallTextWidth(label)) >> 1), r.y + 4,
      hot ? [40, 24, 16] : dim ? [140, 130, 130] : [90, 60, 40]);
  };
  if (diary) for (const t of DOSS_TABS)
    chip(R.tab[t], t === "DIARY" ? "DIARY " + ((c.p.log && c.p.log.length) || 0) : t, dossierTab === t, false);
  const on = isFollowing(c);
  chip(R.follow, on ? "FOLLOWING" : "FOLLOW", false, on);
  chip(R.close, "CLOSE", false, false);
}
function logStamp(e) {
  const h = (e[1] / 60) | 0, m = e[1] % 60 | 0;
  return "D" + e[0] + " " + (h < 10 ? "0" : "") + h + ":" + (m < 10 ? "0" : "") + m;
}
// THE DIARY PAGE. Housing banner first - where a crab has slept is the spine
// of its run, and the trail plus the nights tally answer "has this life been
// going up or down?" without reading a single line - then the timeline,
// newest first, coloured by category, paged for a thumb.
function drawDiary(c, R) {
  const { x, y } = R, w2 = R.w, p = c.p;
  const log = Array.isArray(p.log) ? p.log : [];
  smallText(ctx, "HOME", x + 6, y + 35, [110, 100, 110]);
  smallText(ctx, homeTrail(p, 3).slice(0, 30), x + 28, y + 35, [70, 140, 200]);
  const nh = p.nHome || 0, nc = p.nCot || 0;
  smallText(ctx, nh + " NIGHTS HOUSED, " + nc + " ON A COT"
    + (p.homeSince ? " - HERE SINCE D" + p.homeSince : ""), x + 6, y + 43,
    nc > nh ? [190, 80, 80] : [110, 100, 110]);
  const pages = Math.max(1, Math.ceil(log.length / DIARY_ROWS));
  if (diaryPage >= pages) diaryPage = pages - 1;
  if (pages > 1) {
    smallText(ctx, "<", R.prev.x + 5, R.prev.y + 3, [96, 170, 220]);
    smallText(ctx, ">", R.next.x + 5, R.next.y + 3, [96, 170, 220]);
    const lbl = (diaryPage + 1) + "/" + pages;
    smallText(ctx, lbl, R.next.x - 12 - smallTextWidth(lbl) / 2, R.next.y + 3, [150, 140, 160]);
  }
  if (!log.length) {
    smallText(ctx, "NOTHING WORTH WRITING DOWN YET.", x + 6, y + 56, [150, 140, 160]);
    smallText(ctx, "COME BACK AFTER A DAY'S WORK.", x + 6, y + 64, [150, 140, 160]);
    return;
  }
  for (let i = 0; i < DIARY_ROWS; i++) {
    const e = log[log.length - 1 - (diaryPage * DIARY_ROWS + i)];
    if (!e) break;
    const ry = R.rows[i].y;
    if (i % 2 === 0) rect(ctx, R.rows[i].x, ry - 1, R.rows[i].w, 8, [246, 241, 228]);
    smallText(ctx, logStamp(e), x + 6, ry, [140, 132, 148]);
    smallText(ctx, e[3], x + 48, ry, LOG_CATS[e[2]] || [60, 55, 65]);
  }
}
// THE VISITOR'S RECORD. A crab's dossier is a life; a visitor's is a VISIT -
// who they are, what they came with, what they have spent it on, where they
// slept, and the little diary of their two days in town. Same card geometry as
// the tourist card it replaces, same bottom control bar (FOLLOW / CLOSE), so
// nothing new had to be invented to inspect one.
function drawVisDossier(k) {
  const x = 24, y = 6, w2 = 208, h2 = VIS_H;
  rect(ctx, x - 2, y - 2, w2 + 4, h2 + 4, [30, 20, 36]);
  rect(ctx, x, y, w2, h2, [255, 250, 235]);
  rect(ctx, x, y, w2, 32, [58, 42, 38]);
  rect(ctx, x + 4, y + 4, 40, 30, [245, 225, 200]);
  blit(ctx, art2("c" + k.color, CRAB_ARTS[k.color].a), x + 8, y + 8);
  const acc = ACCESSORIES[k.acc];
  if (acc) blit(ctx, art2("a" + k.acc, acc.art), x + 8 + acc.dx * 2, y + 8 + acc.dy * 2);
  text(ctx, k.name, x + 48, y + 5, [255, 240, 210]);
  const cond = visCondition(k);
  smallText(ctx, "VISITOR - " + visStayLabel(k), x + 48, y + 15, [210, 190, 170]);
  smallText(ctx, cond[0] + " - " + custStatus(k).slice(0, 26), x + 48, y + 24, [255, 215, 150]);
  let ly = y + 40;
  const row = (label, val, col) => {
    smallText(ctx, label, x + 8, ly, [120, 110, 125]);
    smallText(ctx, val, x + 56, ly, col || [40, 30, 40]);
    ly += 9;
  };
  row("PURSE", "$" + Math.round(k.wallet) + " LEFT OF THE $" + k.purse + " THEY BROUGHT",
    k.wallet < 6 ? [190, 80, 80] : [140, 110, 40]);
  row("SPENT", "$" + Math.round(k.spent) + " IN TOWN OVER " + k.buys + " VISIT" + (k.buys === 1 ? "" : "S"),
    [40, 150, 70]);
  row("SLEEPS", k.room ? "ROOM " + k.roomN + " AT THE DRIFTWOOD"
    : k.roughNights ? "ON THE BEACH - THE HOTEL WAS FULL"
    : k.nights > 0 ? "WANTS A ROOM TONIGHT" : "GOING HOME ON THE NEXT BOAT",
    k.roughNights ? [190, 80, 80] : [70, 140, 200]);
  row("FERRY", "SAILS HOME " + (k.leaveT - gnow() < 0 ? "ON THE NEXT BOAT"
    : "IN " + Math.max(1, Math.round((k.leaveT - gnow()) / 60)) + "H"), [70, 90, 130]);
  ly += 2;
  visBars(k, x + 8, ly, w2 - 16); ly += 14;
  const log = Array.isArray(k.log) ? k.log : [];
  smallText(ctx, "THE VISIT", x + 8, ly, [110, 100, 110]); ly += 8;
  if (!log.length) smallText(ctx, "JUST OFF THE BOAT.", x + 8, ly, [150, 140, 160]);
  for (let i = 0; i < 5; i++) {
    const e = log[log.length - 1 - i];
    if (!e) break;
    if (i % 2 === 0) rect(ctx, x + 4, ly - 1, w2 - 8, 8, [246, 241, 228]);
    smallText(ctx, logStamp(e), x + 6, ly, [140, 132, 148]);
    smallText(ctx, e[3], x + 48, ly, LOG_CATS[e[2]] || [60, 55, 65]);
    ly += 8;
  }
  dossierBar(dossierRects(h2), k, false);
}
function drawCustDossier(k) {
  if (k.visitor) { drawVisDossier(k); return; }
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
  row("ORDER", (ITEM_NAMES[k.recipe.icon] || "?") + " - $" + menuPrice(k.biz, k.recipe) + (k.served ? " - PAID" : ""), [140, 110, 40]);
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
  dossierBar(dossierRects(h2), k, false);   // a tourist has no diary - but you can still follow them
}
function drawDossier() {
  if (!dossier) return;
  if (!dossier.p) { drawCustDossier(dossier); return; }
  const c = dossier, p = c.p;
  const R = dossierRects(DOSS_H);
  const x = R.x, y = R.y, w2 = R.w, h2 = R.h;   // sits fully above the panel, in both canvas modes
  if (diaryFor !== c) { diaryFor = c; diaryPage = 0; }   // a different crab starts at their latest page
  rect(ctx, x - 2, y - 2, w2 + 4, h2 + 4, [30, 20, 36]);
  rect(ctx, x, y, w2, h2, [255, 250, 235]);
  rect(ctx, x, y, w2, 32, [58, 42, 38]);
  // full-body portrait at 2x, wearing their real accessory (no work toque) -
  // except the mayor, whose hat is not an outfit, it is the office
  const hatKey = hall.mayor === p.name ? "tophat" : p.acc;
  rect(ctx, x + 4, y + 4, 40, 30, [200, 230, 245]);
  blit(ctx, art2("c" + p.color, CRAB_ARTS[p.color].a), x + 8, y + 8);
  const acc = ACCESSORIES[hatKey];
  if (acc) blit(ctx, art2("a" + hatKey, acc.art), x + 8 + acc.dx * 2, y + 8 + acc.dy * 2);
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
  dossierHit = {};   // draw and hit-test share one geometry table (see manageRects)
  if (dossierTab === "DIARY") { drawDiary(c, R); dossierBar(R, c, true); return; }
  let ly = y + 42;
  const row = (label, val, col, key) => {
    smallText(ctx, label, x + 8, ly, [120, 110, 125]);
    smallText(ctx, val, x + 56, ly, col || [40, 30, 40]);
    if (key) dossierHit[key] = { x: x, y: ly - 1, w: w2, h: 9 };
    ly += 9;
  };
  // OWNING comes first: a fisher who bought a shop is a shopkeeper now, even
  // though they keep their sea legs (and their berth)
  const doesTxt = p.npc
    ? (p.owner && BIZ[p.job] ? "RUNS " + BIZ[p.job].name
      : p.employer && BIZ[p.job] && OWNERS[p.employer] ? "WORKS AT " + BIZ[p.job].name + " FOR " + OWNERS[p.employer].name
      : p.fisher ? (p.boat != null ? "FISHES OFF THE " + BOAT_NAMES[p.boat] : "FISHES OFF THE PIER")
      : "RUNS " + BIZ[p.job].name)
    : "WORKS " + BIZ[p.job].name;   // short verb: leave room for TAP: REASSIGN
  row("DOES", doesTxt, [70, 90, 130]);
  if (!p.npc && Object.keys(BIZ).filter(b => bizUnlocked(b) && bizOwner(b) === "player").length > 1)
    smallText(ctx, "TAP: REASSIGN", x + w2 - 58, ly - 9, [96, 170, 220]);
  // SHIFT doubles as the OVERTIME control - the other half of the labor suite,
  // sitting right beside TAP: REASSIGN exactly as the backlog asked
  const otM = otMinutes(c), canOT = !p.owner && p.job !== "fishing" && !!BIZ[p.job] && !p.npc;
  row("SHIFT", (otM ? effShift(c).label + "  OT +" + Math.round(otM / 60) + "H"
    : baseShift(c).label + (p.ot ? "  OT (NO ROOM TODAY)" : "")),
    otM ? [200, 110, 40] : [40, 30, 40], canOT ? "ot" : null);
  if (canOT) smallText(ctx, p.ot ? "TAP: NO OT" : "TAP: OT", x + w2 - (p.ot ? 44 : 36), ly - 9, [96, 170, 220]);
  row("OFF", WEEKDAY_FULL[dayOffIdx(c)] + (walkoutToday(c) ? " - WALKED OUT TODAY!"
    : offToday(c) ? " - THAT'S TODAY!" : ""), walkoutToday(c) ? [190, 80, 80] : [70, 140, 200]);
  // PAY: the rate, whose rate it is, and what the crab makes of it
  if (onPayroll(c)) {
    const mood = wageMoodLabel(c), gr = wageGripe(c);
    row("PAY", "$" + Math.round(wageRate(c)) + "/SHIFT " + (onShopRate(c) ? "(SHOP RATE)" : "(PRIVATE DEAL)")
      + (mood ? " - " + mood : ""),
      gr >= WAGE_CFG.WARN ? [190, 80, 80] : gr >= WAGE_CFG.GRUMBLE ? [200, 110, 40]
      : !onShopRate(c) ? [190, 110, 30] : [40, 30, 40]);
    if (gr >= WAGE_CFG.GRUMBLE)
      smallText(ctx, "THE GOING RATE IS $" + Math.round(goingRate(c)) + " (PIER $" + Math.round(pierDay()) + ")",
        x + 56, ly, [110, 100, 110]), ly += 9;
  }
  row("WALLET", "$" + fmt(Math.max(0, p.wallet)), p.wallet < 12 ? [190, 80, 80] : [140, 110, 40]);
  const [hl, hcol] = homeLabel(p);
  row("HOME", hl, hcol);
  // THE OFFICE, on the record of whoever holds it - with the policy, because
  // "MAYOR" on its own tells you nothing and the policy is the whole job.
  if (isMayor(c)) row("OFFICE", "MAYOR - " + policyLine(hall.policy), [190, 110, 40]);
  else if ((p.bowls || 0) > 0) row("THE POT", "ATE AT THE SHELTER " + p.bowls + "x", [200, 130, 40]);
  row("NOW", crabStatus(c).slice(0, 34));
  // the two needs-failure lines: what boredom and exhaustion are costing this
  // crab TODAY, in words, beside the bars that only show a level
  if (walkoutToday(c)) row("TODAY", "WALKED OUT - UNPAID, NOBODY COVERING", [190, 80, 80]);
  else if ((p.boredDays || 0) >= 1)
    row("TODAY", "AT A LOOSE END - " + p.boredDays + " NIGHT" + (p.boredDays > 1 ? "S" : "") + " OF IT", [110, 120, 180]);
  if (p.rough || p.roughLast >= day - 1)
    row("LAST NIGHT", p.rough ? "ASLEEP ROUGH - BANKING NOTHING" : "SLEPT ROUGH - NO REST BANKED", [150, 110, 200]);
  // HEALTH doubles as the SICK DAY control: grant the rest, or require the shift
  if (p.sick) {
    const granted = onSickDay(c);
    row("HEALTH", (gravelyIll(c) ? "GRAVELY ILL, DAY " : "DAY ") + ((p.sick.days || 0) + 1) + " - "
      + (granted ? "RESTING, UNPAID" : "AT WORK, PAID"),
      gravelyIll(c) ? [220, 60, 60] : granted ? [120, 150, 90] : [190, 80, 80], canOT ? "sick" : null);
    if (canOT) smallText(ctx, granted ? "TAP: WORK" : "TAP: REST", x + w2 - 40, ly - 9, [96, 170, 220]);
    if (granted) smallText(ctx, "RESTED " + (p.restT || 0).toFixed(1) + "H/" + REST_HOURS
      + "H - " + CARE_LANES[careLane(c)].label, x + 56, ly, [110, 100, 110]), ly += 9;
  }
  const eff = crabEff(c) * (p.sick ? 0.5 : 1);
  if (eff < 0.995) {
    const why = [];
    if (p.sick) why.push("SICK");
    if ((p.hunger || 0) > 0.3) why.push("HUNGRY");
    if ((p.dirt || 0) > 0.6) why.push("GRUBBY");
    row("PACE", "WORKING AT " + Math.round(eff * 100) + "%" + (why.length ? " - " + why.join(", ") : ""),
      eff < 0.8 ? [190, 80, 80] : [200, 110, 40]);
  }
  // THE TRUDGE, named the way PACE names the prep drag: hunger and thirst fail
  // as a speed penalty, so the card says how slow and says why.
  const walk = needDrag(c);
  if (walk < 0.995) {
    const wwhy = [];
    if ((p.hunger || 0) > DRAG_HUNGER_AT) wwhy.push("HUNGRY");
    if ((p.thirst || 0) > DRAG_THIRST_AT) wwhy.push("PARCHED");
    row("WALK", "TRUDGING AT " + Math.round(walk * 100) + "%" + (wwhy.length ? " - " + wwhy.join(", ") : ""),
      walk < 0.85 ? [190, 80, 80] : [200, 110, 40]);
  }
  ly += 2;
  // the five needs on ONE row (the follow card's idiom): the record grew a
  // control bar along the bottom, and a stack of five labelled bars is the
  // 32px that has to give - the numbers are identical, the meters are shorter
  const bars = [["FED", 1 - (p.hunger || 0)], ["SIP", 1 - (p.thirst || 0)],
    ["CLN", 1 - (p.dirt || 0)], ["FUN", 1 - (p.bored || 0)], ["ZZZ", 1 - (p.tired || 0)]];
  bars.forEach(([label, frac], i) => {
    const bx = x + 6 + i * 40;
    smallText(ctx, label, bx, ly, [110, 110, 130]);
    rect(ctx, bx + 14, ly, 24, 5, [30, 20, 36]);
    rect(ctx, bx + 15, ly + 1, Math.round(22 * Math.max(0, Math.min(1, frac))), 3,
      frac > 0.5 ? [96, 200, 120] : frac > 0.25 ? [235, 200, 90] : [235, 90, 90]);
  });
  ly += 11;
  if (ly > y + h2 - 26) { dossierBar(R, c, true); return; }   // a sick crab's rows fill the card: claims wait
  smallText(ctx, "CLAIMS TO FAME", x + 8, ly, [58, 42, 38]); ly += 8;
  const made = Object.entries(p.made || {}).sort((a, b) => b[1] - a[1]).slice(0, 5);
  if (!made.length) smallText(ctx, "NONE YET - GIVE IT TIME", x + 8, ly, [150, 140, 160]), ly += 8;
  for (let i = 0; i < made.length; i++) {
    if (ly > y + h2 - 26 && i < made.length - 1) {   // keep inside the card, above the control bar
      smallText(ctx, "+" + (made.length - i) + " MORE", x + 8, ly, [150, 140, 160]);
      break;
    }
    const [id, n] = made[i];
    let tier = "";
    for (const [need, , label] of MASTERY) if (n >= need) { tier = label; break; }
    const what = id === "caught" ? "FISH LANDED" : (ITEM_NAMES[id] || id.toUpperCase());
    smallText(ctx, what + " X" + n + (tier ? " - " + tier : ""), x + 8, ly,
      tier ? [140, 110, 40] : [90, 90, 105]);
    ly += 8;
  }
  dossierBar(R, c, true);
}

// ---------------------------------------------------------------- management screen
// The owner's office: tap a player-owned shop's SIGN (or its MANAGE chip) to
// open. Open/close hour steppers, today's takings/costs, the roster with
// shifts + days off, and the staff-meal pricing policy. Same overlay-card
// idiom as the dossier; one geometry table feeds both draw and hit-testing
// so the tap targets stay honest on phones.
// Three tabs now: HOURS (the original), SCHEDULE (the labor policy suite -
// shift assignments, days off, OT toggles, sick-day policy and AUTO-MANAGE)
// and TOWN (the census). Census reviews, scheduling acts: they sit one tap
// apart on purpose.
function ownedBizList() { return Object.keys(BIZ).filter(b => bizUnlocked(b) && bizOwner(b) === "player"); }
const MANAGE_TABS = ["HOURS", "SCHEDULE", "TOWN", "HALL"];
// NEXT> steps to the next SHOP you own, which means nothing at all on a page
// about the TOWN - and the census is now reached straight from the nav strip,
// by players who never picked a business in the first place. One predicate for
// the draw and the hit test, so hiding it never leaves a dead zone behind.
// The HALL is the same case: it is a page about the town, not about a shop.
function manageBizCycler() {
  return manageTab !== "TOWN" && manageTab !== "HALL" && ownedBizList().length > 1;
}
let manageTab = "HOURS";
// HALL tab view state (transient, like the census sort): which of the three
// reading surfaces you are on - the town's books, the last ballot's result, or
// the ROLL, which is every voter's own reason in their own words. The roll gets
// a page of its own because it is the legibility bar for the whole feature and
// three lines of fourteen was underselling it: sharing the card with the
// candidate rows left 34px, and a 3x5 font needs 7 of them per line.
const HALL_VIEWS = ["BOOKS", "BALLOT", "ROLL"];
const HALL_VIEW_LABEL = { BOOKS: "BOOKS", BALLOT: "LAST BALLOT", ROLL: "THE ROLL" };
const ROLL_ROWS = 8;   // voter lines per page of the roll, at 7px in the card's body
let hallView = "BOOKS", hallRollPage = 0;
// census view state (transient: a review surface, not a save concern)
const CENSUS_SORTS = ["NAME", "JOB", "HOME", "HEALTH", "WALLET"];
const CENSUS_FILTERS = ["ALL", "CREW", "TOWN", "SICK", "OT"];
let censusSort = 0, censusFilter = 0, censusPage = 0;
const CENSUS_ROWS = 6;   // 17px two-line rows: phone-thumb targets, ~2-3 pages for a 12+ crab town
function censusList() {
  let all = allCrabs().slice();
  const f = CENSUS_FILTERS[censusFilter];
  if (f === "CREW") all = all.filter(c => !c.p.npc);
  else if (f === "TOWN") all = all.filter(c => c.p.npc);
  else if (f === "SICK") all = all.filter(c => c.p.sick);
  else if (f === "OT") all = all.filter(c => otMinutes(c) > 0 || c.p.ot);
  const homeRank = (c) => c.p.boat != null ? 0 : c.p.homeless ? 2 : 1;
  const s = CENSUS_SORTS[censusSort];
  all.sort((a, b) =>
    s === "JOB" ? (a.p.job < b.p.job ? -1 : a.p.job > b.p.job ? 1 : a.p.name < b.p.name ? -1 : 1)
    : s === "HOME" ? (homeRank(a) - homeRank(b) || (a.p.name < b.p.name ? -1 : 1))
    : s === "HEALTH" ? ((b.p.sick ? (b.p.sick.days || 0) + 1 : 0) - (a.p.sick ? (a.p.sick.days || 0) + 1 : 0)
        || (a.p.name < b.p.name ? -1 : 1))
    : s === "WALLET" ? (b.p.wallet - a.p.wallet)
    : (a.p.name < b.p.name ? -1 : 1));
  return all;
}
function censusPages() { return Math.max(1, Math.ceil(censusList().length / CENSUS_ROWS)); }
function manageRects() {
  const x = 16, y = 6, w2 = 224, h2 = 164;
  const R = {
    x, y, w: w2, h: h2,
    next: { x: x + w2 - 40, y: y + 2, w: 38, h: 11 },
    tab: {},
    // ---- HOURS tab (shifted down by the tab strip)
    om: { x: x + 34, y: y + 44, w: 16, h: 16 },   // open -30
    op: { x: x + 88, y: y + 44, w: 16, h: 16 },   // open +30
    cm: { x: x + 146, y: y + 44, w: 16, h: 16 },  // close -30
    cp: { x: x + 200, y: y + 44, w: 16, h: 16 },  // close +30
    // THE PRICE lives with the takings it changes: big steppers, the board
    // price they imply, and the meal chip pushed down 2px to make room
    pm: { x: x + 40, y: y + 92, w: 16, h: 15 },
    pp: { x: x + 96, y: y + 92, w: 16, h: 15 },
    meal: { x: x + 6, y: y + 110, w: 156, h: 14 },
    // ---- SCHEDULE tab
    auto: { x: x + 6, y: y + 30, w: 104, h: 13 },
    sickPol: { x: x + 114, y: y + 30, w: 104, h: 13 },
    // the shop-wide wage: big steppers, the payroll it implies, and APPLY TO
    // ALL - the bulk action that makes per-crab rates bearable
    wm: { x: x + 40, y: y + 45, w: 16, h: 15 },
    wp: { x: x + 82, y: y + 45, w: 16, h: 15 },
    wall: { x: x + 102, y: y + 45, w: 46, h: 15 },
    // ...and directly under it the PAY row group's tip-share track. The two
    // features were built in parallel and both claimed this band; the wage
    // steppers keep y+45 and the slider takes y+62, with the roster pushed
    // down to y+78 to make room for both.
    tipTrack: { x: x + 46, y: y + 62, w: 120, h: 12 },
    rows: [], cells: [],
    // ---- TOWN tab
    csort: { x: x + 6, y: y + 31, w: 62, h: 13 },
    cfilt: { x: x + 72, y: y + 31, w: 58, h: 13 },
    cprev: { x: x + 170, y: y + 31, w: 14, h: 13 },
    cnext: { x: x + 202, y: y + 31, w: 14, h: 13 },
    crows: [],
    // ---- HALL tab. Two reading surfaces behind one chip (BOOKS / BALLOT),
    // and the player's candidacy underneath: STAND, who for, and the three
    // dials of the platform they would run on. Only the platform is editable
    // and only the platform: the office's remit is the shelter and nothing
    // else, so there is deliberately nothing else on this card to touch.
    hview: { x: x + 148, y: y + 30, w: 70, h: 13 },
    stand: { x: x + 6, y: y + h2 - 34, w: 70, h: 13 },
    nom: { x: x + 78, y: y + h2 - 34, w: 60, h: 13 },
    pmech: { x: x + 140, y: y + h2 - 34, w: 78, h: 13 },
    prm: { x: x + 6, y: y + h2 - 18, w: 15, h: 13 },
    prp: { x: x + 52, y: y + h2 - 18, w: 15, h: 13 },
    pbm: { x: x + 78, y: y + h2 - 18, w: 15, h: 13 },
    pbp: { x: x + 124, y: y + h2 - 18, w: 15, h: 13 },
    done: { x: x + w2 - 46, y: y + h2 - 15, w: 42, h: 13 },
  };
  MANAGE_TABS.forEach((t, i) => R.tab[t] = { x: x + 6 + i * 52, y: y + 16, w: 50, h: 12 });
  for (let i = 0; i < 7; i++) {
    const ry = y + 78 + i * 11;   // below the PAY row group (wage steppers + tip slider)
    R.rows.push({ x: x + 6, y: ry, w: w2 - 12, h: 11 });
    R.cells.push({                                     // one row, six tap targets (OFF is derived: display only)
      name:  { x: x + 6,   y: ry, w: 34, h: 11 },
      shift: { x: x + 40,  y: ry, w: 40, h: 11 },
      off:   { x: x + 80,  y: ry, w: 18, h: 11 },
      ot:    { x: x + 98,  y: ry, w: 30, h: 11 },
      sick:  { x: x + 128, y: ry, w: 42, h: 11 },
      // the per-crab wage stepper: two halves of one cell, "-$23+", so the
      // rate and both directions live in 48px of a 12px row
      wdn:   { x: x + 170, y: ry, w: 22, h: 11 },
      wup:   { x: x + 196, y: ry, w: 22, h: 11 },
      wage:  { x: x + 170, y: ry, w: 48, h: 11 },
    });
  }
  for (let i = 0; i < CENSUS_ROWS; i++) R.crows.push({ x: x + 4, y: y + 47 + i * 16, w: w2 - 8, h: 15 });
  return R;
}
function drawManage() {
  if (!manage) return;
  const key = manage, b = BIZ[key], h = b.hours, R = manageRects();
  const { x, y } = R, w2 = R.w, h2 = R.h;
  ctx.fillStyle = "rgba(16,12,30,0.55)";
  ctx.fillRect(0, 0, W, PANEL_Y);
  rect(ctx, x - 2, y - 2, w2 + 4, h2 + 4, [30, 20, 36]);
  rect(ctx, x, y, w2, h2, [255, 250, 235]);
  rect(ctx, x, y, w2, 14, [58, 42, 38]);
  // THE CENSUS IS THE TOWN'S PAGE, NOT THE SHOP'S. It is still drawn on the
  // management card - one card, three tabs - but the nav strip's TOWN chip
  // opens it directly now, so a player can arrive here without ever choosing a
  // business, and the header has to say what they are actually looking at.
  text(ctx, manageTab === "TOWN" ? "TOWN CENSUS" : b.name + " - MGMT", x + 6, y + 4, [255, 240, 210]);
  if (manageBizCycler()) {
    rect(ctx, R.next.x, R.next.y, R.next.w, R.next.h, [96, 170, 220]);
    smallText(ctx, "NEXT>", R.next.x + 9, R.next.y + 3, [255, 255, 255]);
  }
  const btn = (r, label) => {
    rect(ctx, r.x, r.y, r.w, r.h, [30, 20, 36]);
    rect(ctx, r.x + 1, r.y + 1, r.w - 2, r.h - 2, [190, 140, 80]);
    text(ctx, label, r.x + ((r.w - textWidth(label)) >> 1), r.y + 5, [40, 24, 16]);
  };
  // tab strip
  for (const t of MANAGE_TABS) {
    const r = R.tab[t], on = manageTab === t;
    rect(ctx, r.x, r.y, r.w, r.h, on ? [190, 140, 80] : [222, 212, 196]);
    smallText(ctx, t, r.x + ((r.w - smallTextWidth(t)) >> 1), r.y + 4, on ? [40, 24, 16] : [130, 118, 112]);
  }
  const chip = (r, label, hint, hot) => {   // a wide tap target with its state written on it
    rect(ctx, r.x, r.y, r.w, r.h, [30, 20, 36]);
    rect(ctx, r.x + 1, r.y + 1, r.w - 2, r.h - 2, hot ? [190, 140, 80] : [235, 225, 205]);
    smallText(ctx, label, r.x + 4, r.y + 4, hot ? [40, 24, 16] : [90, 60, 40]);
    if (hint) smallText(ctx, hint, r.x + r.w - smallTextWidth(hint) - 4, r.y + 4, [110, 100, 110]);
  };
  if (manageTab === "HOURS") {
    smallText(ctx, "HOURS", x + 8, y + 33, [58, 42, 38]);
    smallText(ctx, "6:00-24:00, AT LEAST 4H OPEN", x + 44, y + 33, [150, 140, 160]);
    smallText(ctx, "OPEN", x + 8, y + 49, [110, 110, 130]);
    btn(R.om, "-"); btn(R.op, "+");
    text(ctx, fmtClock(h.open), x + 54 + ((32 - textWidth(fmtClock(h.open))) >> 1), y + 49, [40, 30, 40]);
    smallText(ctx, "CLOSE", x + 118, y + 49, [110, 110, 130]);
    btn(R.cm, "-"); btn(R.cp, "+");
    text(ctx, fmtClock(h.close), x + 164 + ((34 - textWidth(fmtClock(h.close))) >> 1), y + 49, [40, 30, 40]);
    smallText(ctx, "SHIFTS  M " + bizShiftWindow(key, "M").label + "   E " + bizShiftWindow(key, "E").label
      + "   COVER " + bizShiftWindow(key, "cover").label, x + 8, y + 65, [70, 90, 130]);
    smallText(ctx, "OVERTIME RUNS INSIDE THESE HOURS", x + 8, y + 74, [150, 140, 160]);
    const bk = today.biz[key] || { take: 0, cost: 0 };
    smallText(ctx, "TODAY", x + 8, y + 84, [58, 42, 38]);
    smallText(ctx, "TOOK $" + fmt(bk.take), x + 44, y + 84, [40, 150, 70]);
    smallText(ctx, "COSTS $" + fmt(bk.cost), x + 104, y + 84, [190, 80, 80]);
    smallText(ctx, "RENT $" + b.rent, x + 166, y + 84, [140, 110, 40]);
    // ---- THE PRICE. One multiplier, the whole board underneath it, and what
    // it costs you: cheap pulls footfall off the shop next door and thins
    // every margin you have. The promenade is zero sum - see the spawn weights.
    {
      const mul = bizPriceMul(key), pct = Math.round(mul * 100);
      smallText(ctx, "PRICE", x + 8, y + 97, [58, 42, 38]);
      btn(R.pm, "-"); btn(R.pp, "+");
      const pTxt = pct + "%";
      text(ctx, pTxt, x + 58 + ((38 - textWidth(pTxt)) >> 1), y + 97,
        pct === 100 ? [40, 30, 40] : pct < 100 ? [190, 110, 40] : [40, 110, 60]);
      const menu = b.recipes.slice(0, 3).map(r => (ITEM_NAMES[r.icon] || "?") + " $" + menuPrice(key, r)).join("  ");
      // the card ends at x + w2; leave 6px of margin and trim to what is left
      smallText(ctx, fitSmall(menu, w2 - 124), x + 118, y + 92, [110, 100, 110]);
      smallText(ctx, pct === 100 ? "THE BOARD PRICE"
        : pct < 100 ? "MORE FEET, THIN MARGIN"
        : "FEWER FEET, FAT MARGIN", x + 118, y + 101,
        pct === 100 ? [150, 140, 160] : [190, 110, 40]);
    }
    if (key === "shack" || key === "juicebar") {
      chip(R.meal, "STAFF MEALS: " + MEAL_POL_LABEL[b.mealPol], "TAP", false);
      smallText(ctx, b.mealPol === "retail" ? "CREW PAY MENU PRICE AT THE PANTRY"
        : b.mealPol === "atcost" ? "CREW PAY ONLY THE INGREDIENTS"
        : "ON THE HOUSE - THE TILL EATS THE COST", R.meal.x + 4, R.meal.y + R.meal.h + 2, [110, 100, 110]);
    }
    // THE RIVALRY, in numbers, on the management screen where the owner asked
    // for them: what she wants, what she is paying, and what she is doing to
    // her own board, hours and wage to take your trade.
    const sale0 = saleList()[0];
    const riv = rivalManageLines(key);
    smallText(ctx, riv[0] || (sale0 ? "FOR SALE: " + BIZ[sale0].name + " $" + fmt(salePrice(sale0)) + " - TAP ITS SIGN"
      : "ROSTER + OT + SICK DAYS: SEE THE SCHEDULE TAB"), x + 8, y + h2 - 26,
      riv[0] ? [180, 60, 40] : sale0 ? [180, 60, 40] : [150, 140, 160]);
    // ...and the numbers under it, kept clear of the DONE chip on the right
    if (riv[1]) smallText(ctx, riv[1].slice(0, 40), x + 8, y + h2 - 17, [110, 100, 110]);
  } else if (manageTab === "SCHEDULE") {
    const auto = !!b.autoLabor;
    chip(R.auto, "AUTO-MANAGE " + (auto ? "ON" : "OFF"), null, auto);
    chip(R.sickPol, "SICK: " + (b.sickPol === "require" ? "MUST WORK" : "GRANT"), null, b.sickPol !== "require");

    // ---- PAY: the tip-share slider (its own row group, above the roster)
    const share = bizTipShare(key), pct = Math.round(share * 100), tr = R.tipTrack;
    smallText(ctx, "TIPS", x + 8, tr.y + 4, [58, 42, 38]);
    rect(ctx, tr.x, tr.y, tr.w, tr.h, [30, 20, 36]);
    rect(ctx, tr.x + 1, tr.y + 1, tr.w - 2, tr.h - 2, [235, 225, 205]);
    rect(ctx, tr.x + 1, tr.y + 1, Math.round((tr.w - 2) * share), tr.h - 2, [190, 140, 80]);   // the crew's share, filled
    const th = tr.x + Math.round((tr.w - 7) * share);
    rect(ctx, th, tr.y - 1, 7, tr.h + 2, [58, 42, 38]);                                        // the thumb
    rect(ctx, th + 1, tr.y, 5, tr.h, [255, 250, 235]);
    // THE SLIDER SAYS IT ITSELF. Matt: "the tips slider is mushed up with the
    // other text". It was: a separate sentence explaining the slider sat at
    // y+60 - on top of the slider's own track at y+62 AND on top of the
    // roster hint at y+61, three strings in one band. The rect table above
    // already records that the wage steppers and this slider "both claimed
    // this band"; the RECTS were rearranged for it and the text never was.
    // The explanation is now the readout, which is where it belonged.
    const cut = pct === 0 ? "ALL TO THE TILL" : pct === 100 ? "ALL TO THE CREW" : pct + "% TO CREW";
    smallText(ctx, cut, tr.x + tr.w + 5, tr.y + 4, pct ? [190, 110, 40] : [110, 100, 110]);
    const rowHint = auto ? "AUTO ROTA" : "TAP A ROW";
    smallText(ctx, rowHint, x + w2 - 6 - smallTextWidth(rowHint), y + 60, [110, 100, 110]);
    const staff = allCrabs().filter(c => c.p.job === key);
    // ---- THE WAGE. Shop rate on the left with real steppers, APPLY TO ALL
    // beside it, and the consequences written out on the right: what tonight's
    // payroll comes to at these rates, and what the rest of town is paying.
    smallText(ctx, "WAGE", x + 8, y + 49, [58, 42, 38]);
    btn(R.wm, "-"); btn(R.wp, "+");
    const wtxt = "$" + bizWage(key);
    text(ctx, wtxt, x + 58 + ((22 - textWidth(wtxt)) >> 1), y + 49, [40, 30, 40]);
    const deals = staff.filter(c => !onShopRate(c)).length;
    chip(R.wall, "ALL $" + bizWage(key), null, deals > 0);
    const bill = staff.reduce((s2, c) => s2 + Math.round(crabDueTonight(c)), 0);
    smallText(ctx, "TONIGHT $" + fmt(bill), x + 152, y + 45, [190, 80, 80]);
    smallText(ctx, "TOWN $" + townWage(key).toFixed(0) + "  PIER $" + Math.round(pierDay()),
      x + 152, y + 54, [110, 100, 110]);
    // ...and the roster's own hint goes UNDER THE ROSTER, at the foot of the
    // card, where there is a whole free row and where it is next to the thing
    // it describes. Trimmed by WIDTH (fitSmall), not by character count: the
    // AUTO line is 216px of 3x5 against 170px of card, and a slice(0, n) is a
    // guess about a proportional budget - see the Conventions note in PLAN.
    smallText(ctx, fitSmall(deals ? deals + " ON A PRIVATE DEAL - ALL PUTS THEM BACK ON $" + bizWage(key)
      : auto ? "AUTO: SICK DAYS GRANTED, OT CALLED WHEN COVER IS SHORT"
      : "TAP A ROW: SHIFT, OT, SICK, OR - / + ON THE WAGE", R.done.x - (x + 6) - 6),
      x + 6, y + h2 - 13, [110, 100, 110]);
    if (!staff.length) smallText(ctx, "NOBODY ASSIGNED - REASSIGN FROM A DOSSIER", x + 8, y + 70, [190, 80, 80]);
    for (let i = 0; i < Math.min(staff.length, R.rows.length); i++) {
      const c = staff[i], cell = R.cells[i], ry = R.rows[i].y;
      if (i % 2 === 0) rect(ctx, R.rows[i].x, ry - 1, R.rows[i].w, 11, [244, 238, 224]);
      const gripe = wageGripe(c);
      smallText(ctx, c.p.name.slice(0, 7), cell.name.x + 1, ry + 2,
        gripe >= WAGE_CFG.WARN ? [190, 80, 80] : [40, 30, 40]);
      const otM = otMinutes(c), cov = coveringToday(c);
      smallText(ctx, (cov ? "CVR " : c.p.shift + " ") + (otM ? effShift(c).label : baseShift(c).label),
        cell.shift.x, ry + 2, cov ? [140, 90, 160] : otM ? [200, 110, 40] : [70, 90, 130]);
      smallText(ctx, walkoutToday(c) ? "OUT!" : WEEKDAYS[dayOffIdx(c)] + (offToday(c) ? "!" : ""),
        cell.off.x, ry + 2, walkoutToday(c) ? [190, 80, 80] : [70, 140, 200]);
      smallText(ctx, c.p.ot ? (otM ? "OT+" + Math.round(otM / 60) + "H" : "OT LTR") : "NO OT",
        cell.ot.x, ry + 2, c.p.ot ? (otM ? [200, 110, 40] : [170, 150, 130]) : [150, 140, 160]);
      const sp = sickPolFor(c);
      smallText(ctx, c.p.sick ? (onSickDay(c) ? "SICK:REST" : "SICK:WORK")
        : gripe >= WAGE_CFG.GRUMBLE ? wageMoodLabel(c, true)
        : sp === "require" ? "MUST WORK" : c.p.sickPol ? "SICK DAY OK" : "SHOP RULE",
        cell.sick.x, ry + 2, c.p.sick ? [190, 80, 80]
        : gripe >= WAGE_CFG.WARN ? [190, 80, 80] : gripe >= WAGE_CFG.GRUMBLE ? [200, 110, 40]
        : sp === "require" ? [200, 110, 40] : [110, 100, 110]);
      // the per-crab rate: highlighted the moment it stops being the shop's
      const rate = Math.round(wageRate(c)), own = !onShopRate(c);
      smallText(ctx, "-", cell.wdn.x + 3, ry + 2, [150, 110, 70]);
      smallText(ctx, "$" + rate, cell.wdn.x + 11, ry + 2, own ? [190, 110, 30] : [90, 80, 90]);
      smallText(ctx, "+", cell.wup.x + 14, ry + 2, [150, 110, 70]);
    }
    if (staff.length > R.rows.length)
      smallText(ctx, "+" + (staff.length - R.rows.length) + " MORE - SEE THE TOWN TAB", x + 8, y + h2 - 26, [150, 140, 160]);
  } else if (manageTab === "TOWN") {
    drawCensus(R);
  } else {
    drawHall(R, chip);
  }
  rect(ctx, R.done.x, R.done.y, R.done.w, R.done.h, [190, 140, 80]);
  text(ctx, "DONE", R.done.x + 9, R.done.y + 3, [40, 24, 16]);
}
// ------------------------------------------------------------- the HALL tab
// The whole office on one card: who wears the hat, what they levied, what the
// fund took and spent tonight and off whom, and whether the pot is on. The
// BALLOT half is the receipt for the last election - one line per voter, in
// their own words, so a result can be argued with rather than just watched.
function drawHall(R, chip) {
  const { x, y } = R, w2 = R.w, h2 = R.h;
  const m = mayorCrab(), p = hall.policy, P = purseOf(p);
  const shut = shelterShut();
  smallText(ctx, "MAYOR", x + 8, y + 33, [58, 42, 38]);
  smallText(ctx, (hall.mayor || "VACANT") + (m && !m.p.npc ? " (YOURS)" : ""), x + 42, y + 33,
    m && !m.p.npc ? [190, 110, 40] : [40, 30, 40]);
  const rollPages = Math.max(1, Math.ceil(((hall.poll && hall.poll.lines.length) || 0) / ROLL_ROWS));
  chip(R.hview, (HALL_VIEW_LABEL[hallView] || "BOOKS")
    + (hallView === "ROLL" && rollPages > 1 ? " " + (hallRollPage + 1) + "/" + rollPages : ""), null, false);
  const nextPoll = day + ((POLL_WEEKDAY - weekdayIdx(day) + 7) % 7 || 7);
  const mine0 = playerMayor();
  const nom0 = (hall.nominee && crabs.some(c => c.p.name === hall.nominee) ? hall.nominee
    : crabs.length ? crabs[0].p.name : "-");
  // TRIM BY WIDTH, NEVER BY CHARACTER COUNT (PLAN, "text is measured, not
  // counted"): "RENTS 40% / 2 BOWLS - MR. PINCHERTON, OFF HIS OWN BOOK" is 55
  // characters and 214px, and it printed its last word off the card.
  smallText(ctx, fitSmall(policyLine(p) + " - " + P.who, w2 - 16), x + 8, y + 44, [70, 90, 130]);
  smallText(ctx, fitSmall("NEXT BALLOT: DAY " + nextPoll + " (" + WEEKDAYS[POLL_WEEKDAY] + ")"
    + (mine0 ? " - YOU HOLD IT, AND IT BILLS YOU" : hall.stand ? " - " + nom0 + " IS STANDING" : ""), w2 - 16),
    x + 8, y + 53, mine0 || hall.stand ? [190, 110, 40] : [110, 100, 110]);
  if (hallView === "BOOKS") {
    // THE FUND, AND WHERE ITS MONEY CAME FROM. Every row names a counterparty
    // because that is the whole promise of this feature: nothing is conjured.
    const ok = potOk(), bar = ok > 0 ? [40, 150, 70] : ok < 0 ? [200, 110, 40] : [190, 80, 80];
    smallText(ctx, "TOWN FUND $" + fmt(Math.round(townFund.bal)), x + 8, y + 66, [58, 42, 38]);
    smallText(ctx, "IN $" + fmt(Math.round(townFund.dayIn)) + "  OUT $" + fmt(Math.round(townFund.dayOut)),
      x + 84, y + 66, [110, 100, 110]);
    // EVERY STRING ON THIS CARD IS TRIMMED BY WIDTH (PLAN's "text is measured,
    // not counted"). These share their rows with a neighbour, so the budget is
    // the gap to that neighbour and not a character count that felt about right.
    smallText(ctx, fitSmall(shut ? "SHELTER BOLTED - " + townFund.shut + " MORE NIGHT" + (townFund.shut === 1 ? "" : "S")
      : potLine() + (townFund.bowls > 0 ? " AT $" + bowlCost() + " EACH" : ""), 116), x + 8, y + 75, bar);
    smallText(ctx, fitSmall("RENT $" + SHELTER_RENT + (townFund.arrears > 0 ? " OWES $" + Math.ceil(townFund.arrears) : "")
      + (townFund.strikes > 0 ? " STRIKE " + townFund.strikes + "/" + SHELTER_STRIKES : ""), w2 - 134),
      x + 128, y + 75, townFund.strikes > 0 ? [190, 80, 80] : [110, 100, 110]);
    smallText(ctx, fitSmall("SERVED " + townFund.served + ", TURNED AWAY " + townFund.cold
      + ", THROWN OUT " + townFund.wasted, w2 - 16), x + 8, y + 84, [110, 100, 110]);
    smallText(ctx, "THE LEDGER - EVERY ROW NAMES WHO PAID", x + 8, y + 93, [58, 42, 38]);
    // FOUR ROWS AT 7px, ending two pixels clear of the candidacy strip below.
    // The card is 164 tall and the strip owns everything from y+130 down; an
    // earlier cut ran six 8px rows straight through both control rows.
    let ly = y + 101;
    const LEDG = 4;
    const rows = townFund.ledger.slice(-LEDG);
    if (!rows.length) smallText(ctx, "NOTHING HAS MOVED YET", x + 8, ly, [150, 140, 160]);
    for (const r of rows) {
      const col = r.kind === "take" ? [40, 150, 70] : r.kind === "pay" ? [190, 110, 40] : [190, 80, 80];
      smallText(ctx, "D" + r.day, x + 8, ly, [150, 140, 160]);
      smallText(ctx, r.kind === "take" ? "FROM" : "TO", x + 26, ly, [150, 140, 160]);
      const v = (r.kind === "take" ? "+$" : "-$") + fmt(Math.round(r.amt));
      smallText(ctx, fitSmall(r.who, 116 - 44 - smallTextWidth(v) - 4), x + 44, ly, [40, 30, 40]);
      smallText(ctx, v, x + 116 - smallTextWidth(v), ly, col);
      smallText(ctx, fitSmall(r.why, w2 - 132), x + 122, ly, [110, 100, 110]);
      ly += 7;
    }
    if (townFund.ledger.length > LEDG)
      smallText(ctx, "+" + (townFund.ledger.length - LEDG) + " EARLIER",
        x + w2 - 6 - smallTextWidth("+" + (townFund.ledger.length - LEDG) + " EARLIER"), y + 93, [150, 140, 160]);
  } else if (hallView === "ROLL") {
    // ONE LINE PER VOTER, in their own terms, with the whole card body to do it
    // in. This is the bar the owner set for the elections - "emergent,
    // measurable, explainable in one line per voter" - so it gets the room.
    const poll = hall.poll;
    if (!poll) smallText(ctx, "NOBODY HAS VOTED YET", x + 8, y + 68, [150, 140, 160]);
    else {
      smallText(ctx, "HOW THE TOWN VOTED - DAY " + poll.day, x + 8, y + 66, [58, 42, 38]);
      if (rollPages > 1)
        smallText(ctx, "TAP THE CHIP FOR THE REST", x + w2 - 6 - smallTextWidth("TAP THE CHIP FOR THE REST"),
          y + 66, [150, 140, 160]);
      let ly = y + 76;
      const p0 = Math.min(hallRollPage, rollPages - 1) * ROLL_ROWS;
      for (const l of poll.lines.slice(p0, p0 + ROLL_ROWS)) {
        smallText(ctx, fitSmall(l, w2 - 16), x + 8, ly, [110, 100, 110]);
        ly += 7;
      }
    }
  } else {
    const poll = hall.poll;
    if (!poll) smallText(ctx, "NO BALLOT HAS BEEN HELD YET", x + 8, y + 68, [150, 140, 160]);
    else {
      smallText(ctx, "DAY " + poll.day + " - " + poll.turnout + " VOTED", x + 8, y + 66, [58, 42, 38]);
      let ly = y + 76;
      for (const k of poll.cands.slice(0, 3)) {
        const won = k.name === poll.winner;
        smallText(ctx, fitSmall((won ? "* " : "  ") + k.name, 46), x + 8, ly, won ? [190, 110, 40] : [90, 80, 90]);
        smallText(ctx, fitSmall(k.line, 108), x + 56, ly, won ? [40, 30, 40] : [110, 100, 110]);
        smallText(ctx, "" + k.votes, x + 168, ly, won ? [190, 110, 40] : [110, 100, 110]);
        ly += 8;
      }
      if (poll.cands.length > 3)
        smallText(ctx, "+" + (poll.cands.length - 3) + " MORE ON THE BALLOT", x + 8, ly, [150, 140, 160]), ly += 8;
      ly += 2;
      // ...and a taste of the roll, with a pointer at the page that holds it
      // all. The BALLOT page is the RESULT; the ROLL page is the argument.
      const room = Math.max(0, Math.floor((y + h2 - 44 - ly) / 7));
      for (const l of poll.lines.slice(0, room)) {
        smallText(ctx, fitSmall(l, w2 - 16), x + 8, ly, [110, 100, 110]);
        ly += 7;
      }
      smallText(ctx, poll.lines.length > room
        ? "+" + (poll.lines.length - room) + " MORE - TAP FOR THE ROLL"
        : "TAP THE CHIP FOR THE ROLL", x + 8, ly, [150, 140, 160]);
    }
  }
  // ---- THE PLAYER'S OWN CANDIDACY. Matt: the player can stand and win, "with
  // the conflict of interest that follows: set the levy and you pay it too."
  // While one of your crew wears the hat these three dials ARE the town's
  // policy and take effect at tonight's settlement, levy and all.
  const mine = playerMayor();
  chip(R.stand, mine ? "IN OFFICE" : hall.stand ? "STANDING" : "STAND?", null, mine || hall.stand);
  chip(R.nom, nom0.slice(0, 8), null, false);
  const ed = hall.plat, EP = purseOf(ed);   // one set of dials; mirrored onto policy while in office
  chip(R.pmech, EP.short + " " + (ed.mech === "rents" || ed.mech === "levy" ? purseRate(ed) + "%" : "$" + purseRate(ed)), null, true);
  chip(R.prm, "-", null, false); chip(R.prp, "+", null, false);
  smallText(ctx, "RATE " + (ed.rate | 0), R.prm.x + 20, R.prm.y + 4, [40, 30, 40]);
  chip(R.pbm, "-", null, false); chip(R.pbp, "+", null, false);
  smallText(ctx, "BOWLS " + (ed.bowls | 0), R.pbm.x + 19, R.pbm.y + 4, [40, 30, 40]);
  // ...and NO fourth caption on this row: the only gap left between the BOWLS
  // stepper and the DONE chip is 32px, and every honest wording of "you are on
  // the ballot" is wider than that. The STAND chip says it, and the NEXT
  // BALLOT line above says when - the row does not need to say it a third time.
}

// ------------------------------------------------- SAVED TOWNS (save/load)
// Its own overlay with its own rect table, drawn last and swallowing every
// click - the same idiom as the management card. Works on both canvas modes:
// every offset derives from H via TALL.
function saveRects() {
  const w2 = 240, x = 8, y = 4;
  const h2 = Math.min(H - 8, TALL ? 272 : 232);
  const rowH = TALL ? 18 : 14, rowY = y + 17;
  const bh = TALL ? 16 : 14, bw = 55, bx = x + 4;
  const b1 = y + h2 - (bh * 2 + 8), b2 = y + h2 - (bh + 4);
  const rows = [];
  for (let i = 0; i < SLOTS; i++) rows.push({ x: x + 4, y: rowY + i * rowH, w: w2 - 8, h: rowH - 1 });
  const detY = rowY + SLOTS * rowH + 3;
  return {
    x, y, w: w2, h: h2, detY, detH: b1 - detY - 3, rows,
    close: { x: x + w2 - 15, y: y + 1, w: 13, h: 12 },
    load: { x: bx, y: b1, w: bw, h: bh },
    newg: { x: bx + 59, y: b1, w: bw, h: bh },
    del: { x: bx + 118, y: b1, w: bw, h: bh },
    exp: { x: bx + 177, y: b1, w: bw, h: bh },
    imp: { x: bx, y: b2, w: 78, h: bh },
    yes: { x: bx + 90, y: b2, w: 68, h: bh },
    no: { x: bx + 164, y: b2, w: 68, h: bh },
  };
}
function stampStr(t) {
  if (!t) return "";
  try {
    const d = new Date(t);
    if (!isFinite(d.getTime())) return "";
    const pad = (n) => (n < 10 ? "0" : "") + n;
    return pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + " " + pad(d.getHours()) + ":" + pad(d.getMinutes());
  } catch (e) { return ""; }
}
function openSaveView() {
  saveView = true; saveConfirm = null; saveMsg = null;
  saveSel = activeSlot;
  if (!slotCard(saveSel)) for (let i = 1; i <= SLOTS; i++) if (slotCard(i)) { saveSel = i; break; }
}
function closeSaveView() { saveView = false; saveConfirm = null; pendingImport = null; }
function openImportPicker() {
  const fi = typeof document !== "undefined" && document.getElementById && document.getElementById("importSave");
  if (fi && fi.click) { fi.click(); saveMsg = { text: "CHOOSE A .JSON CRAB SHACK 3 SAVE", t: 4, bad: false }; }
  else saveMsg = { text: "FILE UPLOAD ISN'T AVAILABLE HERE", t: 5, bad: true };
}
function jobShort(j) { return j === "fishing" ? "PIER" : (BIZ[j] && BIZ[j].short) || "?"; }
function saveBtn(r, label, on, hot) {
  rect(ctx, r.x, r.y, r.w, r.h, [30, 20, 36]);
  rect(ctx, r.x + 1, r.y + 1, r.w - 2, r.h - 2, !on ? [130, 120, 118] : hot ? [190, 60, 60] : [190, 140, 80]);
  smallText(ctx, label, r.x + ((r.w - smallTextWidth(label)) >> 1), r.y + ((r.h - 5) >> 1),
    !on ? [90, 82, 80] : hot ? [255, 220, 220] : [40, 24, 16]);
}
function drawSaveScreen() {
  if (!saveView) return;
  const R = saveRects(), x = R.x, y = R.y, w2 = R.w, h2 = R.h;
  ctx.fillStyle = "rgba(16,12,30,0.72)";
  ctx.fillRect(0, 0, W, H);
  rect(ctx, x - 2, y - 2, w2 + 4, h2 + 4, [30, 20, 36]);
  rect(ctx, x, y, w2, h2, [255, 250, 235]);
  rect(ctx, x, y, w2, 14, [58, 42, 38]);
  text(ctx, "SAVED TOWNS", x + 6, y + 4, [255, 240, 210]);
  // the slot, small, on the right: the town does not get a name until the end
  smallText(ctx, "YOUR TOWN - SLOT " + activeSlot, x + 108, y + 5, [200, 180, 160]);
  rect(ctx, R.close.x, R.close.y, R.close.w, R.close.h, [150, 60, 60]);
  smallText(ctx, "X", R.close.x + 5, R.close.y + 4, [255, 230, 230]);
  // ---- the five slots
  for (let i = 0; i < SLOTS; i++) {
    const r = R.rows[i], n = i + 1, m = slotCard(n), on = saveSel === n;
    rect(ctx, r.x, r.y, r.w, r.h, on ? [255, 230, 120] : [214, 200, 182]);
    rect(ctx, r.x + 1, r.y + 1, r.w - 2, r.h - 2, on ? [255, 252, 240] : [238, 230, 215]);
    if (n === activeSlot) rect(ctx, r.x + 1, r.y + 1, 2, r.h - 2, [96, 200, 120]);
    const ty = r.y + ((r.h - 5) >> 1);
    smallText(ctx, String(n), r.x + 6, ty, [140, 120, 100]);
    if (!m) { smallText(ctx, "EMPTY", r.x + 16, ty, [150, 140, 160]); continue; }
    if (m.won) smallText(ctx, "SAILED D" + m.day, r.x + 16, ty, [40, 130, 70]);
    else smallText(ctx, "DAY " + m.day + " " + m.weekday, r.x + 16, ty, [40, 30, 40]);
    smallText(ctx, "$" + fmt(m.coins), r.x + 78, ty, [140, 110, 40]);
    smallText(ctx, "REP " + m.rep, r.x + 120, ty, [70, 90, 130]);
    smallText(ctx, "POP " + m.pop, r.x + 156, ty, [90, 90, 105]);
    const ts = stampStr(m.t);
    if (ts) smallText(ctx, ts, r.x + r.w - 5 - smallTextWidth(ts), ty, [150, 140, 160]);
  }
  // ---- the detail: who lives in this town (the point of the screen)
  const dy = R.detY, card = slotCard(saveSel);
  if (pendingImport) {
    const m = pendingImport.meta;
    rect(ctx, x + 4, dy, w2 - 8, R.detH, [252, 244, 220]);
    smallText(ctx, "READY TO IMPORT", x + 8, dy + 4, [58, 42, 38]);
    smallText(ctx, pendingImport.name.slice(0, 40).toUpperCase(), x + 8, dy + 13, [110, 100, 110]);
    smallText(ctx, "DAY " + m.day + " " + m.weekday + "   $" + fmt(m.coins) + "   REP " + m.rep + "   POP " + m.pop,
      x + 8, dy + 24, [40, 30, 40]);
    smallText(ctx, "CREW: " + m.crew.map(c => c.name).join(", ").slice(0, 44), x + 8, dy + 34, [70, 90, 130]);
    smallText(ctx, "PICK A SLOT ABOVE, THEN CONFIRM.", x + 8, dy + 48, [90, 90, 105]);
    smallText(ctx, card ? "SLOT " + saveSel + " ALREADY HOLDS A TOWN - IT WILL BE REPLACED"
      : "SLOT " + saveSel + " IS EMPTY - NOTHING IS LOST", x + 8, dy + 57, card ? [190, 80, 80] : [40, 150, 70]);
    saveBtn(R.yes, card ? "REPLACE SLOT " + saveSel : "IMPORT TO " + saveSel, true, !!card);
    saveBtn(R.no, "CANCEL", true, false);
    smallText(ctx, "NOTHING IS WRITTEN UNTIL YOU CONFIRM", x + 6, R.yes.y - 8, [110, 100, 110]);
    return;
  }
  if (!card) {
    rect(ctx, x + 4, dy, w2 - 8, R.detH, [244, 238, 224]);
    smallText(ctx, "SLOT " + saveSel + " IS EMPTY", x + 8, dy + 6, [58, 42, 38]);
    smallText(ctx, "START A TOWN HERE WITH NEW HERE,", x + 8, dy + 18, [110, 100, 110]);
    smallText(ctx, "OR IMPORT A SAVE FILE FROM ANOTHER DEVICE.", x + 8, dy + 27, [110, 100, 110]);
  } else {
    smallText(ctx, "THE CREW OF SLOT " + saveSel, x + 6, dy, [58, 42, 38]);
    smallText(ctx, "DAY " + card.day + " " + card.weekday + " - " + card.crew.length + " CREW, " + card.pop + " IN TOWN",
      x + 92, dy, [110, 100, 110]);
    // the money + ownership line (Matt): what this town owns, owes and holds
    {
      const own = (card.owned && card.owned.length ? card.owned.join(" ") : "SHACK")
        + (card.ups && card.ups.length ? " - " + card.ups.join(" ") : "");
      smallText(ctx, "OWNS", x + 6, dy + 7, [110, 100, 110]);
      smallText(ctx, own.slice(0, 38), x + 30, dy + 7, [70, 90, 130]);
      const till = "TILL $" + fmt(card.coins);
      smallText(ctx, till, x + 6, dy + 14, card.coins > 0 ? [140, 110, 40] : [190, 80, 80]);
      const due = "NIGHTLY $" + fmt(card.nightly || 0);
      smallText(ctx, due, x + 56, dy + 14, [190, 80, 80]);
      if (card.debt > 0) smallText(ctx, "DEBT $" + fmt(card.debt), x + 118, dy + 14, [235, 90, 90]);
      const crewMoney = "CREW PURSES $" + fmt(card.purse || 0);
      smallText(ctx, crewMoney, x + (card.debt > 0 ? 168 : 118), dy + 14, [90, 130, 90]);
      const homes = (card.housed || 0) + "/" + card.crew.length + " HOUSED"
        + (card.boats ? " - " + card.boats + " ABOARD" : "");
      smallText(ctx, homes, x + 6, dy + 21, [90, 130, 90]);
    }
    // +13, not +9: hats and flowers overhang the portrait box upward
    const top = dy + 34, shown = Math.min(card.crew.length, 6);   // below the money block
    for (let i = 0; i < shown; i++) {
      const c = card.crew[i], bx = x + 6 + i * 38;
      rect(ctx, bx, top, 36, 30, [30, 20, 36]);
      rect(ctx, bx + 1, top + 1, 34, 22, c.sick ? [235, 205, 205] : [200, 230, 245]);
      const art = CRAB_ARTS[c.color] || CRAB_ARTS[0];
      blit(ctx, art2("c" + c.color, art.a), bx + 2, top + 2);
      const acc = ACCESSORIES[c.acc];
      if (acc) blit(ctx, art2("a" + c.acc, acc.art), bx + 2 + acc.dx * 2, top + 2 + acc.dy * 2);
      if (c.sick) smallText(ctx, "ILL", bx + 24, top + 3, [200, 50, 50]);
      if (c.ot) smallText(ctx, "OT", bx + 3, top + 3, [255, 200, 60]);
      const nm = c.name.slice(0, 8);
      smallText(ctx, nm, bx + 1 + ((34 - smallTextWidth(nm)) >> 1), top + 25, [255, 240, 210]);
    }
    if (card.crew.length > shown) smallText(ctx, "+" + (card.crew.length - shown), x + 6 + shown * 38, top + 12, [110, 100, 110]);
    let ly = top + 34;
    smallText(ctx, "CRAB", x + 6, ly, [150, 140, 160]);
    smallText(ctx, "DOES", x + 58, ly, [150, 140, 160]);
    smallText(ctx, "LIVES", x + 96, ly, [150, 140, 160]);
    smallText(ctx, "HEALTH", x + 168, ly, [150, 140, 160]);
    ly += 8;
    const maxLines = Math.max(1, Math.floor((dy + R.detH - ly) / 8));
    for (let i = 0; i < Math.min(card.crew.length, maxLines); i++) {
      const c = card.crew[i];
      smallText(ctx, c.name.slice(0, 12), x + 6, ly, [40, 30, 40]);
      smallText(ctx, jobShort(c.job), x + 58, ly, [140, 110, 40]);
      smallText(ctx, c.home, x + 96, ly, c.tier === 0 ? [190, 80, 80] : c.tier === 2 ? [70, 140, 200] : [40, 150, 70]);
      smallText(ctx, c.sick ? "SICK DAY " + (c.sickDays + 1) : c.ot ? "ON OVERTIME" : "WELL",
        x + 168, ly, c.sick ? [190, 80, 80] : c.ot ? [200, 130, 40] : [40, 150, 70]);
      ly += 8;
    }
    if (card.crew.length > maxLines) smallText(ctx, "+" + (card.crew.length - maxLines) + " MORE CREW", x + 6, ly, [110, 100, 110]);
  }
  // ---- actions
  const conf = saveConfirm && saveConfirm.slot === saveSel && saveConfirmT > 0 ? saveConfirm.kind : null;
  saveBtn(R.load, !card ? "LOAD" : saveSel === activeSlot && hasSave ? "RESUME" : "LOAD", !!card, false);
  saveBtn(R.newg, conf === "new" ? "WIPE - SURE?" : "NEW HERE", true, conf === "new");
  saveBtn(R.del, conf === "del" ? "GONE - SURE?" : "DELETE", !!card, conf === "del");
  saveBtn(R.exp, "EXPORT", !!card, false);
  saveBtn(R.imp, "IMPORT FILE", true, false);
  if (saveMsg && saveMsg.t > 0)
    smallText(ctx, saveMsg.text.slice(0, 38), R.imp.x + R.imp.w + 6, R.imp.y + ((R.imp.h - 5) >> 1),
      saveMsg.bad ? [190, 80, 80] : [40, 150, 70]);
  else
    smallText(ctx, "DELETING A TOWN CAN'T BE UNDONE", R.imp.x + R.imp.w + 6, R.imp.y + ((R.imp.h - 5) >> 1), [110, 100, 110]);
}
function handleSaveClick(pt) {
  const R = saveRects();
  const hit = (r) => pt.x >= r.x && pt.x < r.x + r.w && pt.y >= r.y && pt.y < r.y + r.h;
  const onCard = pt.x >= R.x - 2 && pt.x < R.x + R.w + 2 && pt.y >= R.y - 2 && pt.y < R.y + R.h + 2;
  for (let i = 0; i < SLOTS; i++) if (hit(R.rows[i])) {
    if (saveSel !== i + 1) { saveSel = i + 1; saveConfirm = null; sfx.ding(); }
    return;
  }
  if (pendingImport) {
    if (hit(R.yes)) { commitImport(saveSel); return; }
    if (hit(R.no) || !onCard) { pendingImport = null; saveMsg = { text: "IMPORT CANCELLED", t: 3, bad: false }; }
    return;
  }
  if (hit(R.close)) { closeSaveView(); return; }
  const card = slotCard(saveSel);
  if (hit(R.load)) {
    if (card) loadSlot(saveSel);
    else saveMsg = { text: "SLOT " + saveSel + " IS EMPTY", t: 3, bad: true };
    return;
  }
  if (hit(R.newg)) {
    // an occupied slot takes two taps: a town is not thrown away by accident
    if (card && !(saveConfirm && saveConfirm.kind === "new" && saveConfirm.slot === saveSel && saveConfirmT > 0)) {
      saveConfirm = { kind: "new", slot: saveSel }; saveConfirmT = 3.5; sfx.buy(); return;
    }
    newGame(saveSel); return;
  }
  if (hit(R.del)) {
    if (!card) return;
    if (!(saveConfirm && saveConfirm.kind === "del" && saveConfirm.slot === saveSel && saveConfirmT > 0)) {
      saveConfirm = { kind: "del", slot: saveSel }; saveConfirmT = 3.5; sfx.buy(); return;
    }
    clearSlot(saveSel); saveConfirm = null; sfx.angry();
    // the slot you're PLAYING can't be left half-deleted in memory: reboot into it
    if (saveSel === activeSlot) { wiping = true; reloadGame(); return; }
    saveMsg = { text: "SLOT " + saveSel + " DELETED", t: 5, bad: true };
    return;
  }
  if (hit(R.exp)) { exportSlot(saveSel); return; }
  if (hit(R.imp)) { openImportPicker(); return; }
  if (!onCard) closeSaveView();
}

// ---------------------------------------------------------------- town census
// Matt: "need an all-crab character menu to review basic stats of whole pop."
// Every crab in town - crew, townsfolk, peer owners - one two-line row, all of
// it DERIVED live (job, employer, housing, health, OT), never a cached copy.
// Rows are 17px so a thumb can hit them; six to a page with < > paging, which
// is how the card idiom scales past a dozen crabs without a scrollbar.
// Tapping a row opens that crab's dossier ON TOP of this card, so closing it
// drops you back into the census: review here, act there (or on SCHEDULE).
function homeTag(p) { return p.boat != null ? "BOAT" : p.homeless ? "COT" : "HOUSE"; }
function drawCensus(R) {
  const { x, y } = R, w2 = R.w, h2 = R.h;
  const list = censusList(), pages = censusPages();
  if (censusPage >= pages) censusPage = pages - 1;
  const chip = (r, label, hot) => {
    rect(ctx, r.x, r.y, r.w, r.h, [30, 20, 36]);
    rect(ctx, r.x + 1, r.y + 1, r.w - 2, r.h - 2, hot ? [190, 140, 80] : [235, 225, 205]);
    smallText(ctx, label, r.x + ((r.w - smallTextWidth(label)) >> 1), r.y + 4, hot ? [40, 24, 16] : [90, 60, 40]);
  };
  chip(R.csort, "SORT " + CENSUS_SORTS[censusSort], censusSort > 0);
  chip(R.cfilt, CENSUS_FILTERS[censusFilter], censusFilter > 0);
  chip(R.cprev, "<", false); chip(R.cnext, ">", false);
  smallText(ctx, list.length + " CRABS", x + 134, y + 35, [110, 100, 110]);
  smallText(ctx, (censusPage + 1) + "/" + pages, x + 187, y + 35, [90, 60, 40]);
  for (let i = 0; i < CENSUS_ROWS; i++) {
    const c = list[censusPage * CENSUS_ROWS + i];
    if (!c) break;
    const p = c.p, r = R.crows[i], ry = r.y;
    if (i % 2 === 0) rect(ctx, r.x, ry, r.w, 15, [244, 238, 224]);
    // a chunky little shell in their own colors: the row's portrait
    const pal = CRAB_COLORS[p.color] || CRAB_COLORS[0];
    rect(ctx, r.x + 2, ry + 4, 8, 7, pal[1]);
    rect(ctx, r.x + 3, ry + 5, 6, 5, pal[0]);
    px(ctx, r.x + 4, ry + 6, [255, 255, 255]); px(ctx, r.x + 7, ry + 6, [255, 255, 255]);
    px(ctx, r.x + 4, ry + 7, [30, 20, 36]); px(ctx, r.x + 7, ry + 7, [30, 20, 36]);
    // line 1: who they are, who they work for, what they're worth, how they are
    smallText(ctx, p.name.slice(0, 9), r.x + 12, ry + 1, [40, 30, 40]);
    const jobTag = p.job === "fishing" ? "PIER" : BIZ[p.job].short;
    const boss = p.owner ? "OWNER" : p.job === "fishing" ? "SELF"
      : p.employer ? ownerName(p.employer) : "YOU";
    smallText(ctx, jobTag + "/" + boss, r.x + 52, ry + 1, [70, 90, 130]);
    const wTxt = "$" + fmt(Math.max(0, Math.round(p.wallet)));
    smallText(ctx, wTxt, r.x + 136 - smallTextWidth(wTxt), ry + 1, p.wallet < 12 ? [190, 80, 80] : [140, 110, 40]);
    smallText(ctx, homeTag(p), r.x + 140, ry + 1, p.homeless ? [190, 80, 80] : p.boat != null ? [70, 140, 200] : [40, 150, 70]);
    const hp = p.sick ? "SICK D" + ((p.sick.days || 0) + 1) : offToday(c) ? "DAY OFF" : "WELL";
    smallText(ctx, hp, r.x + 164, ry + 1, p.sick ? [190, 80, 80] : offToday(c) ? [70, 140, 200] : [40, 150, 70]);
    // line 2: when they work, how hard, and the five needs at a glance
    const otM = otMinutes(c);
    smallText(ctx, (coveringToday(c) ? "CVR " : "") + (p.job === "fishing" ? baseShift(c).label : effShift(c).label),
      r.x + 12, ry + 8, otM ? [200, 110, 40] : [110, 100, 110]);
    smallText(ctx, WEEKDAYS[dayOffIdx(c)], r.x + 50, ry + 8, [70, 140, 200]);
    if (otM) smallText(ctx, "OT", r.x + 66, ry + 8, [255, 150, 40]);
    const eff = crabEff(c) * (p.sick ? 0.5 : 1);
    smallText(ctx, Math.round(eff * 100) + "%", r.x + 78, ry + 8, eff < 0.8 ? [190, 80, 80] : eff < 0.995 ? [200, 110, 40] : [110, 100, 110]);
    const bars = [1 - (p.hunger || 0), 1 - (p.thirst || 0), 1 - (p.dirt || 0), 1 - (p.bored || 0), 1 - (p.tired || 0)];
    for (let bi = 0; bi < bars.length; bi++) {
      const bx = r.x + 156 + bi * 10, f = Math.max(0, Math.min(1, bars[bi]));
      rect(ctx, bx, ry + 8, 9, 4, [30, 20, 36]);
      rect(ctx, bx + 1, ry + 9, Math.round(7 * f), 2, f > 0.5 ? [96, 200, 120] : f > 0.25 ? [235, 200, 90] : [235, 90, 90]);
    }
  }
  smallText(ctx, "TAP A ROW", x + 6, y + h2 - 11, [150, 140, 160]);
  smallText(ctx, "FED SIP CLN FUN ZZZ", x + 52, y + h2 - 11, [150, 140, 160]);
}

// The ledger used to spell every row out - "WATER  186 / 1864 GAL AT $1" - and
// the tails ran off the card. Commodities get 7px icons instead (fish and fruit
// reuse the item art; corn, water and power are drawn here) and the numbers sit
// in fixed right-aligned columns that cannot overflow whatever the town imports.
function drawCommodity(kind, x, y) {
  if (kind === "fish") { blit(ctx, ITEMS.fish_raw, x - 1, y); return; }
  if (kind === "fruit") { blit(ctx, ITEMS.fruit, x, y); return; }
  if (kind === "corn") {
    rect(ctx, x + 2, y, 3, 6, [255, 216, 96]);
    px(ctx, x + 1, y + 1, [90, 200, 110]); px(ctx, x + 5, y + 2, [90, 200, 110]);
    px(ctx, x + 3, y + 1, [230, 180, 60]); px(ctx, x + 3, y + 4, [230, 180, 60]);
    return;
  }
  if (kind === "water") {                       // a droplet
    px(ctx, x + 3, y, [96, 200, 255]);
    rect(ctx, x + 2, y + 1, 3, 2, [96, 200, 255]);
    rect(ctx, x + 1, y + 3, 5, 3, [96, 200, 255]);
    px(ctx, x + 2, y + 4, [200, 240, 255]);
    return;
  }
  if (kind === "power") {                       // a bolt
    rect(ctx, x + 3, y, 2, 3, [255, 230, 120]);
    rect(ctx, x + 2, y + 2, 2, 2, [255, 230, 120]);
    rect(ctx, x + 3, y + 3, 2, 3, [255, 216, 96]);
    px(ctx, x + 1, y + 3, [255, 230, 120]);
  }
}
function drawJobBoard() {
  if (!boardView) return;
  const x = 30, y = 22, w2 = 196, h2 = 158;
  rect(ctx, x - 2, y - 2, w2 + 4, h2 + 4, [30, 20, 36]);
  rect(ctx, x, y, w2, h2, [255, 250, 235]);
  rect(ctx, x, y, w2, 14, [190, 140, 80]);
  text(ctx, "TOWN JOB BOARD", x + 24, y + 3, [40, 24, 16]);
  let ly = y + 20;
  if (!jobBoard.length) { smallText(ctx, "NO OPENINGS - THE TOWN'S ALL BUSY", x + 6, ly, [110, 110, 130]); ly += 9; }
  for (const j of jobBoard) {
    if (j.biz === "fishing") {
      smallText(ctx, "HELP WANTED: THE PIER", x + 6, ly, [40, 30, 40]); ly += 7;
      smallText(ctx, "FISH AT $" + trade.price + " - SELL WHAT YOU CATCH" + (day > j.day ? " (STILL OPEN)" : ""), x + 12, ly, [140, 110, 40]); ly += 9;
      continue;
    }
    smallText(ctx, "HELP WANTED: " + BIZ[j.biz].name, x + 6, ly, [40, 30, 40]); ly += 7;
    smallText(ctx, "$" + j.wage + "/DAY - SEE " + ownerName(bizOwner(j.biz)) + (day > j.day ? " (STILL OPEN)" : ""), x + 12, ly, [140, 110, 40]); ly += 7;
    // what the posting is competing WITH: a day on the rail at today's price
    smallText(ctx, "A DAY ON THE PIER PAYS ABOUT $" + Math.round(pierDay()), x + 12, ly,
      pierDay() > j.wage ? [180, 60, 40] : [110, 110, 130]); ly += 9;
  }
  {   // THE RIVALRY, in two lines at the top of the wall. This board is a full
      // card already (the payroll block below has carried a bottom guard for
      // exactly that reason), so it takes the headline and the one number that
      // matters and leaves the detail to the management screen. Its ~46
      // characters of 3x5 is what sets the slice.
    const riv = rivalManageLines();
    const peers = peerBizList();
    if (riv[0]) {
      smallText(ctx, riv[0].slice(0, 46), x + 6, ly, [180, 60, 40]); ly += 7;
      smallText(ctx, riv[1].slice(0, 46), x + 6, ly, [140, 110, 40]); ly += 9;
      // (what SHE would take for HER shop is painted on her own shopfront and
      // itemized on the management card - two lines is what this wall has)
    } else if (peers.length) {
      const b = peers[0];
      smallText(ctx, BIZ[b].name + " WOULD SELL FOR $" + fmt(rivalAsk(b)) + " - TAP ITS SIGN",
        x + 6, ly, coins >= rivalAsk(b) ? [40, 150, 70] : [110, 110, 130]); ly += 9;
    }
  }
  {   // BUSINESSES FOR SALE: the board carries the town's opportunities, not
      // just its vacancies. Price, why it closed, and how long it has stood
      // empty - a shop nobody can afford stays here until somebody can.
    const sale = saleList();
    if (sale.length) {
      ly += 2; smallText(ctx, "BUSINESS FOR SALE", x + 6, ly, [58, 42, 38]); ly += 8;
      for (const b of sale.slice(0, 2)) {
        const m2 = market[b] || { day, why: "closed" };
        smallText(ctx, BIZ[b].name + " - $" + fmt(salePrice(b)), x + 6, ly, [180, 60, 40]); ly += 7;
        const days = Math.max(0, day - (m2.day || day));
        smallText(ctx, (m2.why === "gone" ? "NO OWNER" : "CLOSED, RENT UNPAID")
          + " - " + (days === 0 ? "LISTED TODAY" : days + " DAY" + (days === 1 ? "" : "S") + " ON THE MARKET"),
          x + 12, ly, [140, 110, 40]); ly += 7;
        smallText(ctx, "ANY CRAB WITH THE SAVINGS CAN TAKE IT ON", x + 12, ly, [110, 110, 130]); ly += 9;
      }
    }
  }
  {
    ly += 2; smallText(ctx, "TRADE LEDGER, TODAY / ALL TIME", x + 6, ly, [58, 42, 38]); ly += 8;
    smallText(ctx, "LANDED OFF THE PIER", x + 6, ly, [40, 150, 70]);
    {
      const v = trade.landedDay + " / " + trade.landed;
      smallText(ctx, v, x + 140 - smallTextWidth(v), ly, [40, 150, 70]);
    } ly += 7;
    // the pier price + its history: a tiny sparkline, floor $2 to ceiling $7
    smallText(ctx, "PIER FISH PRICE", x + 6, ly, [140, 110, 40]);
    {
      const v = "$" + trade.price + (trade.price >= FISH_IMPORT ? " AT CEILING" : "");
      smallText(ctx, v, x + 140 - smallTextWidth(v), ly,
        trade.price >= FISH_IMPORT ? [200, 110, 40] : [140, 110, 40]);
    } ly += 7;
    {
      const s = trade.series.slice(-30), sh = 8, sx = x + 6;
      rect(ctx, sx - 1, ly - 1, 30 * 3 + 2, sh + 2, [235, 225, 205]);
      for (let i = 0; i < s.length; i++) {
        const hh = 2 + Math.round((s[i] - FISH_FLOOR) / (FISH_IMPORT - FISH_FLOOR) * (sh - 2));
        rect(ctx, sx + i * 3, ly + sh - hh, 2, hh, s[i] >= FISH_IMPORT ? [200, 110, 40] : [40, 150, 70]);
      }
      ly += sh + 3;
    }
    // column heads, so the bare numbers still say what they are
    const cDay = x + 96, cTot = x + 140, cPr = x + 186;
    smallText(ctx, "SHIPPED IN", x + 16, ly, [90, 90, 105]);
    smallText(ctx, "TODAY", cDay - smallTextWidth("TODAY"), ly, [150, 140, 160]);
    smallText(ctx, "ALL", cTot - smallTextWidth("ALL"), ly, [150, 140, 160]);
    smallText(ctx, "EACH", cPr - smallTextWidth("EACH"), ly, [150, 140, 160]);
    ly += 7;
    for (const kind of Object.keys(IMPORTS)) {
      if (ly > y + h2 - 20) break;   // a full board stops at its own frame
      const im = IMPORTS[kind];
      drawCommodity(kind, x + 6, ly - 1);
      smallText(ctx, im.name, x + 16, ly, [90, 90, 105]);
      const d = String(trade.day[kind]), t = String(trade.total[kind]), p = "$" + im.price;
      smallText(ctx, d, cDay - smallTextWidth(d), ly, [110, 110, 130]);
      smallText(ctx, t, cTot - smallTextWidth(t), ly, [110, 110, 130]);
      smallText(ctx, p, cPr - smallTextWidth(p), ly, [140, 110, 40]);
      ly += 8;
    }
    smallText(ctx, "FISH ONLY SHIPS WHEN THE PIER IS DRY", x + 6, ly, [140, 110, 40]); ly += 9;
  }
  const staff = npcs.filter(c => c.p.employer);
  if (staff.length) {
    ly += 2; smallText(ctx, "WHO WORKS FOR WHOM", x + 6, ly, [58, 42, 38]); ly += 8;
    for (const c of staff.slice(0, 4)) {
      if (ly > y + h2 - 16) break;   // the sparkline ate a row or two - keep inside the card
      smallText(ctx, c.p.name + " - " + BIZ[c.p.job].short + " $" + Math.round(wageRate(c))
        + ", PAID BY " + ownerName(c.p.employer) + (wageGripe(c) >= WAGE_CFG.WARN ? " (RESTLESS)" : ""),
        x + 6, ly, wageGripe(c) >= WAGE_CFG.WARN ? [180, 60, 40] : [90, 90, 105]); ly += 7;
    }
  }
  {   // the board advertises the labor the town WANTS; the census reads the
      // labor it already has. One tap between them.
      const r = jobBoardCensusRect();
      rect(ctx, r.x, r.y, r.w, r.h, [30, 20, 36]);
      rect(ctx, r.x + 1, r.y + 1, r.w - 2, r.h - 2, [96, 170, 220]);
      smallText(ctx, "TOWN CENSUS >", r.x + 4, r.y + 4, [255, 255, 255]);
  }
  smallText(ctx, "CLICK TO CLOSE", x + w2 - 62, y + h2 - 9, [150, 140, 160]);
}
function jobBoardCensusRect() { return { x: 46, y: 22 + 158 - 16, w: 60, h: 13 }; }

function drawReport() {
  if (!report || reportT <= 0) return;
  const creditLines = (report.drew ? 1 : 0) + (report.interest ? 1 : 0) +
    (report.loanPaid ? 1 : 0) + (report.debt ? 1 : 0)
    + (report.tipsShared ? 1 : 0) + (report.bused ? 1 : 0)   // the table-service ledger
    + (report.rival || []).length                             // ...and the rivalry
    + (report.hallPaid ? 1 : 0) + (report.hallGot ? 1 : 0)     // ...and the town hall's two
    + 1;                                                       // ...and the mayor's own line
  const w2 = 176, x = ((W - w2) / 2) | 0, y = 24, h2 = 118 + creditLines * 8 + (report.off ? 8 : 0);
  ctx.fillStyle = "rgba(16,12,30,0.55)";
  ctx.fillRect(0, 0, W, PANEL_Y);
  rect(ctx, x - 2, y - 2, w2 + 4, h2 + 4, [30, 20, 36]);
  rect(ctx, x, y, w2, h2, [255, 250, 235]);
  rect(ctx, x, y, w2, 11, [190, 140, 80]);
  text(ctx, WEEKDAYS[weekdayIdx(report.day)] + " - DAY " + report.day + " REPORT", x + 22, y + 2, [40, 24, 16]);
  let ly = y + 16;
  const line = (label, val, col) => {
    smallText(ctx, label, x + 6, ly, [110, 100, 110]);
    smallText(ctx, String(val), x + w2 - 6 - smallTextWidth(String(val)), ly, col || [50, 40, 50]);
    ly += 8;
  };
  line("GUESTS SERVED", report.served, [40, 110, 60]);
  line("TAKINGS", "$" + fmt(report.revenue), [40, 110, 60]);
  if (report.tipsShared) line("TIPS TO THE CREW", "$" + fmt(report.tipsShared), [190, 110, 40]);
  if (report.bused) line("TABLES BUSED", report.bused, [70, 90, 130]);
  line("WALKED OUT ANGRY", report.rage, report.rage > 2 ? [180, 60, 60] : [110, 100, 110]);
  line("WAGES PAID", "-$" + fmt(report.wages), [150, 70, 60]);
  line("RENT", "-$" + fmt(report.rent), [150, 70, 60]);
  if (report.drew) line("DREW ON CREDIT", "+$" + fmt(report.drew), [200, 130, 40]);
  if (report.interest) line("LOAN INTEREST", "+$" + fmt(report.interest), [180, 60, 60]);
  if (report.loanPaid) line("LOAN PAYMENT", "-$" + fmt(report.loanPaid), [150, 70, 60]);
  if (report.debt) line("DEBT OUTSTANDING", "$" + fmt(report.debt), [180, 60, 60]);
  line("IN THE TILL", "$" + fmt(report.coins), [90, 70, 40]);
  if (report.hallPaid) line(report.hallOwn ? "YOUR OWN " + purseOf(hall.policy).short : "TOWN " + (report.hallPol || "").split(" ")[0],
    "-$" + fmt(report.hallPaid), [150, 70, 60]);
  if (report.hallGot) line("SHELTER BOUGHT BOWLS", "+$" + fmt(report.hallGot), [40, 110, 60]);
  const dRep = report.repEnd - report.repStart;
  line("WORD OF MOUTH", report.repEnd + (dRep >= 0 ? "  +" + dRep : "  " + dRep),
    dRep >= 0 ? [40, 110, 60] : [180, 60, 60]);
  ly += 2;
  // THE MAYOR'S LINE. Always there, one row: who holds the office, what their
  // policy is, and whether the shelter has anything on tonight.
  smallText(ctx, fitSmall((report.mayor || "NO MAYOR") + ": " + (report.hallPol || "-"), 106), x + 6, ly,
    report.hallOwn ? [190, 110, 40] : [70, 90, 130]);
  {
    const t = report.potShut ? "SHELTER SHUT" : report.bowls > 0 ? "POT: " + report.bowls
      : report.potWhy === "nocall" ? "NOBODY ILL" : "POT COLD";
    smallText(ctx, t, x + w2 - 6 - smallTextWidth(t), ly,
      report.potShut ? [180, 60, 60] : report.bowls > 0 || report.potWhy === "nocall" ? [40, 110, 60] : [200, 130, 40]);
  }
  ly += 8;
  if (report.off) smallText(ctx, "DAY OFF: " + report.off, x + 6, ly, [70, 140, 200]), ly += 8;
  if (report.best) smallText(ctx, "BUSIEST CLAW: " + report.best + " x" + report.bestN, x + 6, ly, [70, 90, 130]), ly += 8;
  for (const n of report.died) smallText(ctx, n + " HAS PASSED AWAY", x + 6, ly, [180, 60, 60]), ly += 7;
  // the warning line: named, the night BEFORE the death roll arms
  for (const n of (report.critical || [])) smallText(ctx, n + " IS FADING - NEEDS CARE", x + 6, ly, [200, 90, 70]), ly += 7;
  // THE RIVALRY gets its own lane and its own colour: a peer owner coming for
  // one of your shops is the loudest thing that can happen in a day
  for (const n of (report.rival || []))
    // TRIM BY WIDTH (the standing rule): the card is 176 wide and these lines
    // are drawn at x+6, so they get 164px and lose their tail rather than the
    // card losing its margin. Pre-existing: a long rivalry line printed past
    // the edge, and the hotelier writes lines of the same shape every night.
    smallText(ctx, fitSmall(n, w2 - 12), x + 6, ly, [200, 120, 40]), ly += 7;
  // IDLE HANDS' late stage, announced the night BEFORE it costs anything
  for (const n of (report.walked || []))
    smallText(ctx, n + " HAS HAD ENOUGH - OFF TOMORROW", x + 6, ly, [110, 120, 180]), ly += 7;
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
  const dt = paused ? 0
    : Math.max(0, Math.min(0.1, (now - last) / 1000)) * TURBO * (ffSleep ? 6 : FF_SPEED[ffMode]);
  last = now; time += dt;
  if (saveConfirmT > 0) { saveConfirmT -= dt; if (saveConfirmT <= 0) saveConfirm = null; }
  if (saleArmT > 0) { saleArmT -= dt; if (saleArmT <= 0) saleArm = null; }
  if (ferryArm > 0) ferryArm -= dt;
  if (won) winT += dt;   // the beat before the ending card: she comes alongside first
  if (askArmT > 0) { askArmT -= dt; if (askArmT <= 0) askArm = null; }
  if (saveMsg && saveMsg.t > 0) { saveMsg.t -= dt; if (saveMsg.t <= 0) saveMsg = null; }
  if (!gameOver && screen === "play") tmin += dt * TS;
  if (tmin >= 1440) {
    tmin -= 1440; day++;
    settleFishMarket();   // the day's landings vs the day's appetite set tomorrow's pier price
    townCatch = Math.min(townCatch, 4); rep = rep + (30 - rep) * 0.06;
    for (const c of allCrabs()) { c.workedToday = false; c.otMin = 0; }   // a new day's ledger
    trade.day = { fish: 0, corn: 0, water: 0, power: 0, fruit: 0 }; trade.landedDay = 0;
    townFund.dayIn = 0; townFund.dayOut = 0; townFund.youPaid = 0; townFund.youGot = 0;   // the fund's own day book
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
      if (c.p.sick && !c.workedToday) continue;      // sick day: no work, no pay (a REQUIRED crab who worked is paid in full)
      // day off OR a walk-out: same rule - the bill dips, the wallet doesn't.
      // The walk-out is the one that stings, because nobody covered it either.
      if (awayToday(c) && !c.workedToday) continue;
      const prem = Math.round(otPayToday(c));        // overtime premium on top of the flat day
      const due = Math.round(basePayToday(c)) + prem;   // the day, priced by the hours contracted
      if (coins >= due) {
        coins -= due; c.p.wallet += due; wages += due;
        crabLog(c, "money", "DREW $" + due + " IN WAGES", 0);   // DIARY
        if (prem > 0) {
          popText("OT +$" + prem, c.x - 4, FLOOR_Y - 40, [255, 216, 96]);
          if (window._stats) {
            window._stats.otPay = (window._stats.otPay || 0) + prem;
            window._stats.otMin = (window._stats.otMin || 0) + Math.round(c.otMin || 0);
          }
        }
      } else { crabLog(c, "peril", "WENT UNPAID - THE TILL WAS EMPTY", 0); popText("NO PAY?!", c.x, FLOOR_Y - 30, [255, 120, 120]); }   // DIARY
    }
    if (wages > 0) earnHist.push({ t: time, amt: -wages });
    // 2. house rent from each crab's own wallet; broke crabs move to the shelter
    let evictedNames = [];
    for (const c of allCrabs()) {
      logNightly(c);   // DIARY: the nights tally, the day's catch as one line, and what they took to bed
      c.p.thirst = Math.min(1, (c.p.thirst || 0) + 0.15 * ((c.p.tired || 0) > 0.5 ? 1.5 : 1));   // a dry night - drier after a hard day
      if (c.workedToday) { c.p.tired = Math.min(1, (c.p.tired || 0) + TIRED_NIGHT); c.workedToday = false; }   // the day's work catches up at dusk; idlers owe nothing
      if (c.p.homeless) {
        // shelter is free; move into a free house once savings allow
        const used = new Set(allCrabs().filter(k => !k.p.homeless).map(k => k.p.house));
        // nobody rents the far end of town from their own job: take the free
        // lot CLOSEST to where you work. (Fishers were buying the promenade -
        // 1400px from the pier - then spending the week commuting, earning
        // nothing, and losing the house again. The beach cottages exist.)
        let free = -1, bestD = Infinity;
        const door = jobDoor(c);
        for (let h = 0; h < HOUSE_XS.length; h++) {
          if (used.has(h)) continue;
          const d = Math.abs(HOUSE_XS[h] - door);
          if (d < bestD) { bestD = d; free = h; }
        }
        if (free >= 0 && c.p.wallet >= MOVE_IN_COST + HOUSE_RENT) {
          c.p.wallet -= MOVE_IN_COST; c.p.house = free; c.p.homeless = false;
          logHome(c, "MOVED INTO " + placeName(c.p) + " - $" + MOVE_IN_COST);   // DIARY
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
        logHome(c, "MOVED ABOARD THE " + BOAT_NAMES[berth] + " - $" + BOAT_COST);   // DIARY
        c.fishSpot = boatSpot(berth);
        today.moved.push(c.p.name + " MOVED ABOARD THE " + BOAT_NAMES[berth]);
        toast = { text: c.p.name + " MOVED ABOARD!", t: 6 };
        popText("LIVE-ABOARD!", BOAT_BERTHS[berth].x + 2, 58, [140, 220, 255]);
        sfx.ding();
      } else if (c.p.wallet >= HOUSE_RENT) {
        // A CUT OF THE RENTS, if that is the purse the town voted for. It comes
        // out of this payment on its way past, so the tenant pays their same $10
        // either way - the town negotiated with Mr. Pincherton over HIS book, and
        // what the fund does not take is destroyed exactly as it always was.
        const cut = rentCut(c, HOUSE_RENT);
        c.p.wallet -= HOUSE_RENT - cut;
        crabLog(c, "money", "PAID $" + HOUSE_RENT + " HOUSE RENT", 600);   // DIARY: once a night, never twice
        // careers move; so do crabs. A housed crab whose job has drifted far
        // from their door takes a much-closer empty lot when they can cover
        // the move (a quit fisher shouldn't keep the promenade forever)
        // no deposit on a lateral move - you keep your tenancy, you just swap
        // lots. Charging it again would trap the poorest crabs in the exact
        // long commute that keeps them poor.
        if (c.p.boat == null) {
          const door2 = jobDoor(c), used2 = new Set(allCrabs().filter(k => !k.p.homeless).map(k => k.p.house));
          let near = -1, nearD = Math.abs(HOUSE_XS[c.p.house] - door2) - 400;   // only for a real saving
          for (let h = 0; h < HOUSE_XS.length; h++) {
            if (used2.has(h)) continue;
            const d = Math.abs(HOUSE_XS[h] - door2);
            if (d < nearD) { nearD = d; near = h; }
          }
          if (near >= 0) {
            c.p.house = near;
            logHome(c, "MOVED TO " + placeName(c.p) + " - CLOSER TO WORK");   // DIARY
            today.moved.push(c.p.name + " MOVED CLOSER TO WORK");
            popText("CLOSER TO WORK", HOUSE_XS[near] + 8, 100, [140, 255, 160]);
          }
        }
      } else {
        c.p.homeless = true;
        logHome(c, "COULDN'T MAKE RENT - LOST THE HOUSE");   // DIARY: the night a run turns
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
      if (c.p.sick && !c.workedToday) continue;      // sick day: no work, no pay - same deal as the crew
      if (awayToday(c) && !c.workedToday) continue;  // day off (or a walk-out): unpaid, but the job is safe
      const npcDue = Math.round(basePayToday(c)) + Math.round(otPayToday(c));   // peer owners buy hours at the same rate, premium included
      if (o && o.till >= npcDue) { o.till -= npcDue; c.p.wallet += npcDue; crabLog(c, "money", "WAS PAID $" + npcDue + " BY " + o.name, 0); }   // DIARY
      else {
        crabLog(c, "life", "QUIT - " + (o ? o.name : "THE BOSS") + " COULDN'T PAY", 0);   // DIARY
        // ...and they need somewhere to stand when they get there. layOff()
        // and townAfterDeath() both hand a returning fisher a free rail spot;
        // this third path back to the pier - an owner who cannot make payroll
        // - did not, so the quitter fished from wherever they happened to be.
        c.p.job = "fishing"; c.p.employer = null;
        if (!c.fishSpot) c.fishSpot = freeFishSpot();
        today.moved.push(c.p.name + " QUIT - BACK TO THE PIER");
        toast = { text: c.p.name + " QUIT: " + (o ? o.name : "THE BOSS") + " COULDN'T PAY", t: 6 };
      }
    }
    // 2a3. the money has landed (or hasn't): every crab on a payroll compares
    // tonight's wage with what the water, the shop next door and the crab at
    // the next station are getting, and grumbles, asks around or goes.
    runWageRelations();
    // 2a4. THE TOWN HALL settles before the landlords do - the shelter's rent
    // and its pot are the town's bill, and a levy is a cost of trading rather
    // than something a shop pays out of what is left after everything else.
    // Placed here on purpose: the player's own levy lands BEFORE step 3's rent
    // and credit line, which is the conflict of interest with teeth in it.
    runTownHall();
    // 2b. peer owners settle their own books on the same line of credit:
    // shortfalls draw on the line and interest compounds exactly as it does
    // for the player. A settlement that misses the minimum (or can't even
    // draw the night's bill) is a STRIKE against that lease; SALE_CFG.STRIKES
    // in a row and the business CLOSES and goes up for sale (see the business
    // failure & succession block). The debt is no longer quietly written off.
    for (const b of Object.keys(BIZ)) {
      const oid = bizOwner(b);
      if (!oid || oid === "player") continue;
      const o = OWNERS[oid];
      if (!o || day <= 1) continue;
      // an owner who died settles nothing: the shop is shut, not in arrears.
      // runSuccession() below sweeps it onto the market (listForSale "gone").
      if (o.gone) continue;
      if ((o.darkT || 0) > 0) {   // legacy saves only: run the old timer out
        if (--o.darkT === 0) toast = { text: BIZ[b].name + " IS BACK IN BUSINESS", t: 6 };
        continue;
      }
      // a rival's WAR CHEST comes out before a rent is missed: saving up to buy
      // the shop next door must never be the thing that shuts your own
      rivalRaidFund(b);
      const nf = settleCreditLine(o.credit || 0, o.till, BIZ[b].rent);
      o.credit = nf.bal; o.till = Math.max(0, nf.funds);   // interest lands either way; a missed bill stays owed
      if (nf.ok && !nf.missedMin) bizStrike[b] = 0;        // a clean night wipes the slate
      else if (noteLeaseMiss(b, o)) continue;              // shutters up: nothing left to manage tonight
      runHoursPolicy(b);   // books settled: the day's demand signals tune tomorrow's hours
      runWagePolicy(b);    // ...and the day's labour signals tune tomorrow's wage
    }
    // the day's takings are booked, empty shops go on the market, and the
    // market clears - one call, all of it in its own block above
    runSuccession();
    // ...and the peer owner who wants a shop that is NOT for sale reads her
    // own books, one move a night (see THE RIVALRY)
    runRivalAmbition();
    // ...and the one who came for the hotel and got it reads hers (THE HOTELIER)
    runHotelier();
    for (const c of npcs) {
      c.p.hunger = Math.min(1, (c.p.hunger || 0) + 0.1);
    }
    // 2.5 epidemiology: neglect breeds illness; illness spreads; rest + care cures
    {
      const everyone = allCrabs();
      const sickNow = everyone.filter(k => k.p.sick);
      for (const k of everyone) {
        if (k.p.sick) continue;
        let risk = 0;
        if ((k.p.hunger || 0) >= 0.95) risk += 0.10;
        if ((k.p.thirst || 0) >= 0.95) risk += 0.12;   // dehydration: the scariest neglect
        if ((k.p.dirt || 0) >= 0.95) risk += 0.06;
        if ((k.p.tired || 0) >= 0.95) risk += 0.05;   // run ragged - exhaustion is worse than sand ever was
        for (const s2 of sickNow) {
          const coworkers = s2.workBiz === k.workBiz && k.dayState !== "home" && !s2.p.npc;
          const shelterMates = k.p.homeless && s2.p.homeless;
          if (coworkers || shelterMates) risk += 0.08;
        }
        if (risk > 0 && Math.random() < Math.min(0.5, risk)) {
          k.p.sick = { days: 0 }; today.sick.push(k.p.name);
          logFellIll(k);   // DIARY
          if (window._stats) {
            const why = [];
            if ((k.p.hunger || 0) >= 0.9) why.push("hunger");
            if ((k.p.thirst || 0) >= 0.9) why.push("thirst");
            if ((k.p.dirt || 0) >= 0.9) why.push("dirt");
            if ((k.p.tired || 0) >= 0.9) why.push("exhaustion");
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
        // THE CARED SEAM: a graded ladder, not a coin flip (see CARE_LANES).
        // A crab who spent the day resting at home, fed and hydrated, does
        // measurably better - and their own bed beats a shelter cot.
        const lane = careLane(k), care = CARE_LANES[lane];
        const tier = k.p.homeless ? "cot" : k.p.boat != null ? "boat" : "house";
        if (Math.random() < care.cure) {
          const dur = k.p.sick.days;
          k.p.sick = null; today.recovered.push(k.p.name);
          crabLog(k, "need", "GOT BETTER AFTER " + dur + " DAY" + (dur === 1 ? "" : "S") + " ILL", 0);   // DIARY
          popText(k.p.name + " RECOVERED!", k.x - 12, FLOOR_Y - 34, [140, 255, 160]);
          if (window._stats) {
            window._stats.recoveries = (window._stats.recoveries || 0) + 1;
            (window._stats.illness = window._stats.illness || [])
              .push({ day, name: k.p.name, days: dur, lane, tier, out: "well" });
          }
        } else if (k.p.sick.days >= deathArmsAt(lane) &&
            Math.random() < Math.min(0.75, care.die + 0.12 * Math.max(0, k.p.sick.days - 4))) {
          if (window._stats) (window._stats.illness = window._stats.illness || [])
            .push({ day, name: k.p.name, days: k.p.sick.days, lane, tier, out: "died", npc: !!k.p.npc });
          killCrab(k);   // the tide takes them - crew and townsfolk alike
        } else if (k.p.sick.days >= deathArmsAt(lane) - 1) {
          // SEE IT COMING. The roll arms on deathArmsAt(lane); the town is told
          // the night before, by name, so the player has a whole day to act
          // (grant the sick day, get food and water into them, send them to
          // their own bed - the care ladder is what this warning points at).
          if (k.p.gravDay !== day) {
            k.p.gravDay = day;
            crabLog(k, "peril", "GRAVELY ILL - DAY " + (k.p.sick.days + 1) + ", NEEDS CARE", 0);   // DIARY
            today.critical.push(k.p.name);
            toast = { text: k.p.name + " IS FADING - THEY NEED REST AND CARE", t: 8 };
            popText("GRAVELY ILL", k.x - 14, FLOOR_Y - 34, [255, 150, 130]);
          }
        }
      }
      for (const k of allCrabs()) k.p.restT = 0;   // convalescence is banked one day at a time
    }
    // 2.6 IDLE HANDS, THE LATE STAGE: THE WALK-OUT (B3).
    // Boredom is the one need with no free cure and no death roll. What it has
    // instead is this: a crab pinned past WALKOUT_AT at WALKOUT_DAYS
    // settlements running has simply had enough, and takes tomorrow off. No
    // commute, no shift, NO WAGE - and nobody covers it, because nobody was
    // told. Real stakes, no death, and the player gets a full day's warning by
    // name, so it is a thing they could have fixed (an arcade, an errand, a
    // rota change) rather than a thing that happened to them.
    for (const k of allCrabs()) {
      // a rough night bridges midnight, so it is reported at the NEXT
      // settlement - and cleared, so it is reported exactly once
      if (k.p.roughLast && k.p.roughLast >= day - 1) {
        today.moved.push(k.p.name + " SLEPT ROUGH - NO REST BANKED");
        k.p.roughLast = 0;
      }
      if (walkoutToday(k)) today.moved.push(k.p.name + " NEVER CAME IN - NO WAGE");
      k.p.boredDays = (k.p.bored || 0) >= WALKOUT_AT ? (k.p.boredDays || 0) + 1 : 0;
      if ((k.p.boredDays || 0) < WALKOUT_DAYS || k.p.walkout === day + 1 || patOff("walkout")) continue;
      if (k.p.sick || dayOffIdx(k) === weekdayIdx(day + 1)) continue;   // already off - it'd prove nothing
      k.p.walkout = day + 1; k.p.walkoutWhy = "bored"; k.p.boredDays = 0;
      today.walked.push(k.p.name);
      toast = { text: k.p.name + " HAS HAD ENOUGH - TAKING TOMORROW OFF", t: 8 };
      popText("I NEED A DAY", k.x - 14, FLOOR_Y - 34, [150, 150, 210]);
      // ONE SHAPE FOR ONE COUNTER. (Found independently on two branches the
      // same night, which is a fair sign of how load-bearing it was.) The pay walkout (runWageRelations) records a
      // ROW here and this one used to record a COUNT, so a town that took a
      // bored walkout and then a pay walkout threw
      // `_stats.walkouts.push is not a function` and killed the seed - which
      // is a headless-only path, but the headless matrix is how every balance
      // number in PLAN is measured. Both write rows now.
      if (window._stats) (window._stats.walkouts = window._stats.walkouts || [])
        .push({ day: day + 1, name: k.p.name, why: "bored" });
    }
    // the day's labor policy: peer owners (and delegating players) make at
    // most one move each, on the same convergent-rules pattern as SUDSY's hours
    for (const b of Object.keys(BIZ)) if (bizUnlocked(b)) runLaborPolicy(b);
    // 3. property rents + loan service (THE credit hook): a shortfall draws
    // on the line of credit instead of instant eviction; interest compounds
    // and the minimum payment auto-collects inside settleCreditLine.
    // ok:false is the new cliff - BANKRUPT (see CREDIT_CFG).
    const rent = totalRent();
    const fin = settleCreditLine(credit.bal, coins, rent);
    if (fin.ok) {
      credit.bal = fin.bal; coins = fin.funds;
      earnHist.push({ t: time, amt: fin.drew - rent - fin.paid });
      const offNames = allCrabs().filter(c => offToday(c)).map(c => c.p.name);
      report = {
        day, served: today.served, revenue: Math.round(today.revenue), rage: today.rage,
        wages, rent, sick: today.sick.slice(0, 3), died: today.died.slice(0, 2),
        critical: today.critical.slice(0, 2), walked: today.walked.slice(0, 3),
        recovered: today.recovered.slice(0, 2), moved: today.moved.slice(0, 2),
        rival: (today.rival || []).slice(0, 2),
        // THE OFFICE, on the nightly report, because it bills the player now:
        // what the town took off your till, what came back when the shelter
        // bought its bowls off your own counter, and whether the pot is on.
        hallPaid: Math.round(townFund.youPaid), hallGot: Math.round(townFund.youGot),
        bowls: townFund.bowls, potShut: shelterShut(), potWhy: townFund.potWhy, mayor: hall.mayor,
        hallPol: policyLine(hall.policy), hallOwn: playerMayor(),
        off: offNames.slice(0, 4).join(", "),
        repStart: Math.round(today.repStart), repEnd: Math.round(rep),
        best: Object.keys(today.byCrab).sort((a, b) => today.byCrab[b] - today.byCrab[a])[0],
        bestN: 0, coins: Math.round(coins),
        tipsShared: Math.round(today.tipsShared || 0), bused: today.bused || 0,
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
    drawSaveScreen();
    requestAnimationFrame(frame);
    return;
  }
  if (!gameOver) {
  updateBus(dt);
  if (tmin >= 7.5 * 60 && hireDay !== day) { hireDay = day; runJobBoard(); }
  updateCustomers(dt);
  runChatter(dt);   // its own pass over the crab list - NOT folded into collide()
  for (const c of allCrabs()) {
    c.animT += dt;
    c._stepped = false;
    // A CONVERSATION STOPS THE DAY. Nothing else runs while two crabs talk -
    // not the schedule, not the kitchen, not the commute. That is the price of
    // boredom's only free cure, and it is the whole reason the cure is allowed
    // to exist at all (PLAN, THE SELF-HEALING RULE: it costs time, never money).
    if (c.dayState === "chat") { updateChat(c, dt); maybeQuip(c, dt); continue; }
    updateSchedule(c, dt);
    if (c.dayState === "toWork" || c.dayState === "toHome") updateCommute(c, dt);
    else if (c.dayState === "toErrand" || c.dayState === "errand") updateErrand(c, dt);
    else if (c.dayState === "atTap") updateTap(c, dt);
    else if (c.dayState === "atBall") updateBall(c, dt);
    else if (c.dayState === "selfCook") updateSelfCook(c, dt);
    else if (c.dayState === "working" && c.p.job === "fishing") updateFishing(c, dt);
    else if (c.dayState === "working") updateKitchen(c, dt);
    else if (c.dayState === "directed") updateDirected(c, dt);
    else if (c.dayState === "home") updateHome(c, dt);
    updateStuck(c, dt);
    maybeQuip(c, dt);
  }
  if (followCust && !customers.includes(followCust)) followCust = null;   // they went home
  if (dossier && !dossier.p && !customers.includes(dossier)) dossier = null;
  // a selected tourist who leaves town (or a crab who dies) drops the selection
  if (sel && (sel.p ? !allCrabs().includes(sel) : !customers.includes(sel))) sel = null;
  const followed = followNpc || followCust || (followIdx >= 0 && crabs[followIdx]);
  if (followed) {
    const t = clampCam(followed.x - W / 2 + 8);
    camX += (t - camX) * Math.min(1, dt * 5);
  }
  const reading = boardView || manage || saveView || dossier;
  if (reportT > 0 && !ffSleep && !reading) reportT -= dt;   // waits out a sun-skip, and waits behind an open card
  if (toast && reading) toast.t = Math.max(toast.t, 0.4);   // a toast holds while you read, then plays out
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
      // an abandoned table wears the stalls' crumb-flecks, so "waiting to be
      // bused" reads at a glance from across the boardwalk
      if (t.dirty) {
        px(ctx, t.x + 3 - camX, t.y - 2, [200, 180, 120]);
        px(ctx, t.x + 13 - camX, t.y - 1, [180, 160, 110]);
        px(ctx, t.x + 9 - camX, t.y - 3, [200, 180, 120]);
      }
    } });
    const stalls = BIZ[key].stalls;
    // HOTEL ROOMS are stalls too, but they read as doors on a back wall: the
    // lamp is on when a guest is in residence, and an unmade bed (the DIRTY
    // flag housekeeping is about to clear) hangs its own little card.
    if (stalls && BIZ[key].lodging) { for (const t of stalls) paint.push({ base: t.y, f: () => {
      const guest = t.occupant && t.occupant.visitor ? t.occupant : null;
      const lit = guest && (guest.state === "inRoom" || darkness() > 0.4);
      wblit(HOTEL_DOOR[lit ? 1 : 0], t.x, t.y - HOTEL_DOOR[0].h);
      // the room number on the transom, and a Z over the door of an occupied
      // one. Both sit in the 4px of wall between the awning and the door head -
      // anything higher is painted over by the shopfront's own roofline.
      const n = stalls.indexOf(t) + 1;
      const nx = t.x + 7 - camX;
      if (nx > -12 && nx < W) smallText(ctx, "" + n, nx, t.y - HOTEL_DOOR[0].h - 5, [70, 60, 90]);
      if (guest && guest.state === "inRoom") {
        const ph = ((time * 0.7 + t.x * 0.01) % 1);
        smallText(ctx, "Z", t.x + 12 - camX, t.y - HOTEL_DOOR[0].h + 3 - ph * 4, [190, 205, 255]);
      }
      if (t.dirty) {   // the maid hasn't been round
        px(ctx, t.x + 3 - camX, t.y - 2, [220, 190, 130]);
        px(ctx, t.x + 8 - camX, t.y - 1, [200, 170, 120]);
        px(ctx, t.x + 12 - camX, t.y - 2, [220, 190, 130]);
      }
    } }); continue; }
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
  for (const k of customers) paint.push({ base: (k.state === "dining" || k.state === "seatedWaiting") && k.table ? (k.table.y + 1) : (k.isCrab ? 165 : custY(k)), f: () => drawCustomer(k) });
  // ...and the ring goes wherever the body goes. drawCustomer hands a bathing
  // or sleeping guest over to the stall and the hotel door and draws nothing
  // itself, so without these two the ring blinks on bare wall.
  if (sel && !sel.hidden && sel.state !== "showering" && sel.state !== "inRoom") paint.push({ base: sel.y - 0.1, f: () => {
    // a soft ring under whoever you've picked: it stays put while you pan
    const bx = sel.x + 8 - camX, by = (sel.p ? sel.y : custY(sel) - 4 - 26 * (sel.climb || 0)) + 2;
    const blink = 0.55 + 0.45 * Math.sin(time * 4);
    const col = [Math.round(120 + 135 * blink), Math.round(200 + 30 * blink), 120];
    for (let i = -6; i <= 6; i++) {
      const t2 = i / 6, dy = Math.round(2 * (1 - t2 * t2));
      px(ctx, bx + i, by - dy, col); px(ctx, bx + i, by + dy, col);
    }
  } });
  for (const c of allCrabs()) paint.push({ base: c.cstate === "drive" && (c.dayState === "toWork" || c.dayState === "toHome") ? ROAD_Y1 : c.y, f: () => drawCrab(c) });
  paint.push({ base: FLOOR_Y, f: drawLandlord });
  paint.sort((a, b) => a.base - b.base);
  for (const e of paint) e.f();
  drawForSaleSigns();   // boards go over the furniture, and the price has to read from the street
  drawRivalSigns();     // ...and so do a rival's offer, her competition and her own asking price
  drawSwoop();
  drawFloaters(dt);
  {  // directed-crab marker: a bouncing flag where the followed crab was sent
    const fc = followIdx >= 0 && crabs[followIdx];
    if (fc && fc.order && fc.dayState === "directed" && fc.order.idleT < 0) {
      const mx = fc.order.x + 6 - camX;
      if (mx > -8 && mx < W + 8) {
        const my = fc.order.y - 16 - Math.abs(Math.sin(time * 5)) * 3;
        rect(ctx, mx, my, 1, 9, [255, 255, 255]);        // pole
        rect(ctx, mx + 1, my, 5, 4, [255, 216, 96]);     // pennant
        px(ctx, mx + 6, my + 1, [255, 216, 96]);
        px(ctx, mx, fc.order.y - 6, [255, 216, 96]);     // planted spot
      }
    }
  }
  drawNight();
  drawNav();      // HUD, so: after the night wash - the map never goes dark
  drawJobBoard();
  // A READING SURFACE OWNS THE SCREEN (owner report: "events appear at same
  // time as ledger and block it out"). The day report and toasts wait their
  // turn - reportT is paused below rather than burned down behind the card,
  // so nothing is missed, it just arrives when you close what you opened.
  if (!boardView && !manage && !saveView && !dossier) drawReport();
  drawManage();
  drawDossier();   // above the management card: a census row opens a dossier ON TOP of it
  drawFollowCard();
  drawCycler();   // < crab > : step the selection (and the camera) through the town
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
  {  // line-of-credit chips, bottom-right of the world - now stacking up from
     // the nav strip's chip row, whose left end carries MANAGE and TOWN
    let cy = PANEL_Y - NAV_H - 12;
    if (bankHorizon <= CREDIT_CFG.CHIP_DAYS && !gameOver) {
      const wTxt = bankHorizon <= 0 ? "BANKRUPT TONIGHT!" : "BANKRUPT IN " + bankHorizon + "D";
      const ww = smallTextWidth(wTxt) + 8;
      const blink = ((time * 2) | 0) % 2;
      rect(ctx, W - ww - 2, cy, ww, 10, blink ? [150, 30, 30] : [60, 16, 20]);
      smallText(ctx, wTxt, W - ww + 2, cy + 2, blink ? [255, 230, 230] : [235, 130, 130]);
      cy -= 12;
    }
    if (credit.bal > 0) {
      const dTxt = "DEBT $" + fmt(Math.round(credit.bal)) + "/" + creditLimit();
      const dw = smallTextWidth(dTxt) + 8;
      rect(ctx, W - dw - 2, cy, dw, 10, [30, 20, 36]);
      smallText(ctx, dTxt, W - dw + 2, cy + 2, [255, 190, 90]);
    }
  }
  drawPanel();
  if (!boardView && !manage && !saveView && !dossier) drawToast();   // reading surfaces own the screen
  if (gameOver) drawGameOver();
  drawSaveScreen();
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
if (!FRESH) migrateLegacy();   // the old single-key town becomes slot 1, intact
activeSlot = readActiveSlot();
hasSave = load();
if (!hasSave) {
  crabs = [newCrab(makeCrabPersona(0)), newCrab(makeCrabPersona(1))];
  coins = 150;   // a few bux in your pocket - rent is due tonight: ingredients + first rent buffer
}
seedVisitors();   // somebody is always already here (no-op if the save carried its own)
requestAnimationFrame(frame);

// console cheat for tinkering: cheat(500)
window.cheat = (n) => { coins += n || 100; };
