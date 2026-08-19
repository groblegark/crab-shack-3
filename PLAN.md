# CRAB SHACK — project state & roadmap

Three games, all live on GitHub Pages, all built on the snescat toy PPU
(character-map sprites, 5x7 + 3x5 fonts, 256x240 canvas, no build step).

| game | repo | live | status |
|---|---|---|---|
| CRAB SHACK | groblegark/crab-shack | groblegark.github.io/crab-shack | done, in the can |
| CRAB SHACK 2 | groblegark/crab-shack-2 | groblegark.github.io/crab-shack-2 | done + refined |
| CRAB SHACK 3 | groblegark/crab-shack-3 | groblegark.github.io/crab-shack-3 | active |

## CS3: what it is

A simulation-style beach-town economy. Design call (Matt): **simulation, not
arcade** — other actors have the same abilities the player does.

**The loop**: fishers land the catch off the pier → your kitchen buys it →
crabs cook → servers carry plates to *seated* guests → wages go out nightly →
crabs spend their own wallets on meals, showers, arcade → reputation
compounds or collapses → the landlord collects at 20:00 either way.

### Systems (all in game.js unless noted)
- **Businesses** (`BIZ` table, data-driven): CRAB SHACK (player), THE
  CLAWCADE ($650), JUICE BAR ($400, player — shipped with T2 in the old
  laundromat's lot AND shop slot), SUDS SHOWERS (NPC-owned by SUDSY).
  (SUDS N BUBBLES, the $400 laundromat, was removed 2026-08-18 — see the
  shipped note below.) Each: stations, recipes, queue, rent, owner.
- **Owner layer**: `OWNERS` registry + `creditBiz`/`debitBiz`/`ownerFunds`.
  The player's till IS `coins`. NPC revenue never touches player books.
- **Crabs**: personas (name, trait, commute mode, accessory, shift, wallet,
  house), needs FED/THIRST/CLN/FUN/SPA, homes they live inside, the shelter for the
  homeless, disease + contagion + death with beach memorials.
- **Facilities pattern**: guests occupy things. Shower stalls — attendant
  hands out a kit, guest showers, stall goes dirty, staff cleans it. Dining —
  guests are seated when their order is claimed, server carries the plate to
  the table, guests bus their own (outdoor casual; staff-bused table service
  is deferred to "a fancier restaurant").
- **Fishing**: the town's default profession. SALTY + DRIFT cast off the pier,
  earn subsistence pay, spend it in town. `townCatch` stocks the shack:
  fish $4 fresh / $7 imported; catch mostly spoils overnight.
- **Shop**: concrete equipment only — HIRE CRAB, GRILL+, BOARD+, TABLE+, plus
  business unlocks and their gear upgrades. You start with ONE grill, ONE
  board, TWO tables. No abstract multipliers (deleted: knife/flame/shoes/ads/
  expand).
- **Reputation** replaces ads: table service and happy guests build word of
  mouth, rage-quits cost triple, nightly regression to the mean; foot traffic
  scales with rep. Chip in the world's top-right corner.
- **2D movement**: crabs have x/y, soft-body collision, solid stations/tables/
  stalls, lane routing (`routedStep`), head-on passing, y-sorted painter.
- **Housing market (everyone)**: 9 lots — the promenade row (0–5), one by the
  shelter (6), two beach cottages past the pier (7–8). NPCs have no private
  nooks any more: everyone homeless sleeps on shelter cots, pays $10 house
  rent when housed, and moves up at settlement when wallet ≥ move-in ($35) +
  rent. Fishers fund it at $2/catch; SUDSY pays herself a bigger owner draw
  while homeless. World is 2192 wide. **All 9 lots stand permanently**
  (2026-08-18): drawTown walks the lots and asks `houseOccupant(h)` — an
  occupied house wears its tenant's roof color, a vacant one renders as
  HOUSE_EMPTY (weathered grey roof, dark glass, TO LET card, bare interior).
  Night window glow keys on an occupant at home (crew AND townsfolk; boat
  dwellers keep the cabin lamp), so empty lots stay dark. Houses never pop
  into existence — people move into a town that was already there.
- **Hiring is recruitment** (2026-08-18, the directive): the SHOP hire no
  longer mints a persona with a free house. `hireCrew()` recruits — a
  CURRENTLY-VISITING tourist by preference (their customer entity converts
  into a resident crew crab keeping the tourist name/color/accessory, with
  abortErrand-grade cleanup: stall freed+dirtied, table freed+plate cleared,
  mid-claim chefs abortChef'd, entity dropped from the queue, follow/dossier
  transferred), else a new face answers the ad off the morning bus at the
  west stop. Either way the hire completes immediately (`hireShift()` picks
  a shift that can still work today) and starts HOMELESS at the shelter —
  no free house, they climb the ladder on wages. Names dedupe across
  CRAB_NAMES + CUSTOMER_NAMES (a converted tourist keeps their name if
  free); spawnDrifter shares the dedupe. headless `--set chef` calls
  hireCrew() too — no housed-hire fork in tools/.
- **Job board / labor market**: a notice board at x716 (clickable — postings +
  town payrolls). Each morning at 7:30 (`runJobBoard`) NPC owners post when
  flush (till ≥ 260, staff < 2) or when their shop went dark; jobless fishers
  take postings ($20/day, `p.employer`); a posting unfilled for a full day
  pulls a drifter off the morning bus (cap 8 npcs, they start homeless with a
  fishSpot fallback). Owners pay staff from their till at settlement or the
  staff quit back to the pier. Crew reassignment now lives in the dossier
  ("TAP: REASSIGN" on the DOES row) plus a labeled JOB> chip on the follow
  card — the old 13px unlabeled chip was the "can't assign staff" bug.
- **Labor policy** (`SICK_POLS` / `CARE_LANES` / `OT_*` / `LABOR_CFG` in
  game.js): per-business sick-day policy + per-crab override, a graded
  convalescence ladder where resting in your own bed genuinely cures faster,
  a 1.5x overtime premium bounded by the shop's open hours, and an
  auto-manage rule table that peer owners run by default and the player can
  delegate to. Surfaced on the management screen's SCHEDULE tab, the TOWN
  census, and the dossier's SHIFT/HEALTH rows.
- **Sick crabs can move**: bed rest no longer bars essential errands — the
  sick still buy food and drag themselves to the showers (half
  speed), which feeds the `cared` check that improves cure and death odds.
  Arcade nights stay off-limits. This closed the calibration-flagged spiral
  where the sick couldn't re-clean.
- **UI**: title → lease-signing intro (Mr. Pincherton) → play. CREW / SHOP /
  MENU tabs, a three-tab management card (HOURS / SCHEDULE / TOWN census),
  BILL chip (itemized nightly bill), follow-cam on ANY crab
  including NPCs, fast-forward >>/>>>/>>>> = 2/3/6x (F), master mute (M).
- **Right-click orders** (crew only): with a crew crab followed, right-click
  redirects them — open ground = walk there (breaks cleanly from any activity
  via abortActivity, resumes schedule after a ~2.5s linger), their workplace =
  clock in now, their home/shelter = knock off for ~2 game-hours (restDay/
  restUntil), another business = run that errand immediately (forcedErrand
  reuses pickErrand's pricing/staffing gates, queue cap enforced on arrival).
  Every refusal pops ("PINCHY: CAN'T RIGHT NOW") — never silent. Townsfolk
  refuse ("I'VE GOT MY OWN LIFE"): crew-only control is a design choice, NPC
  agency stays intact. Desktop right-click only — touch deferred (long-press
  collides with merge mode's hold gesture). No context menu yet ("at some
  point"). Paired **auto-unstick** watchdog for ALL walkers: <2px net progress
  over 1.5s while genuinely underway (stepTo ran, target >8px away — queues/
  stations/bus/pauses never qualify) triggers a perpendicular sidestep
  (±12px y, 6px back-off, 1.0s waypoint), alternating sides up to 4 retries,
  then a give-up quip (a directed crab abandons the order). This is the
  sanctioned fix for the audited still-vs-mover collision pin. Fires ~1-2x/day
  town-wide in headless runs.
- **Crab dossier**: clicking the follow card opens a full-screen record —
  job, shift, wallet, housing, health, need bars, claims to fame. Click or
  Esc closes. Works for every crab, crew and townsfolk alike.
- **Save slots + SAVED TOWNS screen** (Matt's directive, shipped 2026-08-18):
  five towns, not one. Keys `crabshack3_v1_s1..s5` plus `crabshack3_v1_active`
  (the autosave target, persisted); the legacy single key `crabshack3_v1`
  migrates into slot 1 byte-for-byte on first boot, then retires. A slot holds
  the SAME envelope save() always wrote — **opaque** to the save layer, so new
  fields from any system ride along — plus two sidecars this layer owns:
  `_ver` (import guard) and `_meta` (day, weekday, coins, rep, pop, a crew
  roster snapshot with name/color/accessory/job/housing tier/sick/OT, and a
  real timestamp). `_meta` is fully derivable from the envelope (`slotMeta`),
  so migrated and imported saves get a preview card for free and `slotCard()`
  falls back to deriving it. UI: a SAVED TOWNS button on the title and a SAVE
  chip in the panel tab row (which REPLACED the old panel NEW chip — new games
  are now per-slot, with a confirm, where they belong) open an overlay with its
  own rect table, sized off H so both canvas modes work: five slot rows, then
  the selected town's crew as 2x portraits with name/job/housing/health, then
  LOAD / NEW HERE / DELETE / EXPORT and a global IMPORT FILE. DELETE and
  NEW-HERE-onto-a-town are two-tap confirms (3.5s arm). EXPORT writes the slot
  JSON via an `a[download]` + Blob URL named `crabshack3-slotN-dayD-stamp.json`;
  IMPORT reads a `.json` through a hidden `<input type="file" id="importSave">`
  in index.html, validates shape + version BEFORE anything is written
  (`saveProblem` — not-JSON, wrong app, no crew, unnamed crew, bad day/coins,
  newer `_ver`; the reason prints on the card), stages it, and only writes on
  confirm. An imported old-build save runs the same load() migrations a stored
  one does. Deleting the slot you're playing reboots into it rather than
  leaving a zombie autosave.

### Verified balance (8 seeds, tools/headless.mjs)
- Baseline (buy nothing): **0/8 survive, median eviction ~11-13** — the
  8-seed snapshot moves a day either way per build; at 16 seeds the tails run
  6–20+. Fully combined tree (credit LIMIT 90 + T2 thirst/juice bar, wage
  23, 2026-08-18): 0/8, evictions 12-22, median 14. Credit LIMIT was
  tightened 120→90 at the T2 merge; the later +1 (13→14, tails to 21-22)
  came from town-wide auto-unstick — crabs genuinely work more hours now,
  and LIMIT 70 measured no better, so the QoL win stands undiluted. If
  Matt wants the knife-edge back, spawn pacing or rent are the honest
  levers, chosen deliberately.
  Standing pressures: job-board labor competition (a hired-away fisher lowers
  townCatch, pushing the shack onto $7 import fish; SUDSY's flush-hire
  threshold till ≥ 260 spares the earliest days) and the needs-drag rework
  (hungry/dirty crews work up to ~24% slower). T2 adds the thirst cycle:
  crews sustain retail drinking off the raised wage; wallet-starved NPC
  fishers ride parched near the +0.12/night sickness line — the intended
  new pressure.
- Hire-and-seat strategy (`--buy chef,table`): escape is seed-lucky —
  roughly 0-2 of 6 seeds at day 40 depending on build. The suite's growth
  gate (1 of 4 seeds escapes, or median eviction > 18) is the guard that
  counts.
- Constants: shack rent 230, wage 23 (raised from 22 with T2 — crews drink
  at retail, the wage keeps their wallets liquid, bands 8-32), house rent
  10, hires 60×2.0,
  showers 5/10, fish pay 13. **Rent is charged from night one** — you open
  with $150 in your pocket and have to trade your way to the first payment.
- **Queue**: 5 slots, of which tourists may fill 4 — the 5th is reserved for
  locals (crew + neighbours). Staff claim paying guests first and serve locals
  in the lulls — and a local past HALF patience jumps the line (T2: the juice
  bar's additive tourist stream never lulls on its own; without the jump,
  locals starved in its queue and raged out parched).
- History worth knowing: an earlier build measured 7/8 escape, but that number
  was inflated by a bug — at saturated reputation tourists filled every slot
  and locals never got served (free revenue, no service cost, and a quiet
  sickness spiral). Fixing it made growth genuinely harder. If escape needs to
  come up, prefer capacity/throughput levers over re-hiding the locals.
- Causal notes from calibration: rep saturates for every town so *capacity*
  (chef count) binds; crew deaths were the escape-killer (sick crabs can't
  re-clean, so cheap showers matter); buy *timing* beat buy prices.

## Tools (the load-bearing part)
See also CLAUDE.md: the sim contract (simlib runs the REAL game files in a
vm — never fork game logic into tools/) and perf expectations live there.
- `node tools/suite.mjs` — **69 scenarios, must stay green before any push.**
- `node tools/illness.mjs [--seeds N] [--days D] [--quiet]` — illness-duration
  distributions per housing tier. Paired arms per seed: the care ladder live
  vs collapsed back onto the pre-seam CARED odds *inside the same build*, plus
  a RUNG arm (a housed crab rolled at cot odds) that isolates the housing rung
  on an identical RNG stream. This is where the cared-seam numbers in the
  labor-policy bullet come from.
- `node tools/suite.mjs` — **73 scenarios, must stay green before any push.**

  Covers balance curves, dishes/dining, errands, staff meals, stuck-crab
  detection (baseline + full town), 6x-dt stability, homeless recovery,
  NPC housing ladder, boat rung + catch boost, sick-crab mobility,
  job-board hire/payroll/quit, stall-wedge soak, T1 trade-ledger flows,
  line-of-credit draw/bankruptcy/predictor-lead/roundtrip,
  disease infection/cure/mortality, showers turnover, NPC economics,
  save/load (incl. boat berths), save SLOTS (legacy-key migration into
  slot 1, two independent towns across a switch, import refusal + staged
  commit + old-build import re-migration, the preview card), no-inflation wallet bounds, needs-drag
  crab routing (chained trip, town walk-distance, warps+unsticks floor,
  travel-lane clearance tripwire),
  save/load (incl. boat berths), no-inflation wallet bounds, needs-drag
  visibility, laundromat-removal migration (one-shot refund) + dirt
  serviced by showers alone, thirst serviced end-to-end at the bar,
  parched-spiral sickness attribution (with a watered control arm),
  juicebar economics (ledger flows charged-vs-tracked, staff retail,
  save/load roundtrip of thirst + unlock + firstPour), tired
  accrual/sleep-repair (bed vs cot rates) and the sandy->tired save
  migration.
  serviced by showers alone, days-off rota (weekly rest + off-day
  spending, cover-shift/stagger coverage, exact wage-skip bill math),
  hiring-as-recruitment (tourist conversion with clean entity teardown,
  bus-arrival fallback working day-of, all-9-lots occupancy derivation
  with no house conjured on hire), and shop hours (frozen day-2 default
  fingerprint, shortened hours really close, SUDSY policy convergence +
  extend rule + tiredness budget, sun-skip across an hours change,
  AT COST/FREE staff-meal accounting, hours/mealPol/policy save roundtrip
  with degenerate-save clamping).
  Plus the labor policy suite: sick-day GRANT/REQUIRE, the bed-vs-cot
  recovery shift, OT's exact 1.5x rate + geometry + needs acceleration, the
  OT marker rendering and clearing, auto-manage convergence (one move a day,
  a real cooldown, no thrash over a fortnight), SUDSY running the same
  policy with an OUT SICK placard and no panic posting, census derivation +
  every sort and filter, and the labor-settings save/load roundtrip.

- `node tools/headless.mjs --days N --seeds K [--buy list] [--quiet]
  [--jobs J]` — CLI; `--jobs` fans seeds out across worker processes
  (default cores−1, deterministic either way, ~3x faster on 4 seeds).
  Its buyer models a sensible player: hourly purchase checks, reserve = cost +
  tonight's bill + cushion, saves (doesn't skip) for the big unlocks, rehires
  after a death, and only staffs a side business if the shack keeps shift
  coverage.
- `tools/simlib.mjs` — the sim core: real game files in a vm with stubbed
  browser APIs, seeded RNG, `runUntil`/`runDays`. ~10 sim-days/sec.
- Dev flags: `?fresh` (no save), `?turbo=N`.
- Browser testing: serve on a spare port, use a playwright route handler to
  bypass cache (`await p.route('**/*', r => r.continue())`) — the dev server
  caches game files hard; only index.html gets a `?t=` bust.

## Gameplay features (recent)
- **Labor policy suite: sick days + overtime + scheduling + town census**
  (shipped 2026-08-18, worktree — realizes the "Labor policy suite" and
  "Town census" feature requests and the parked **Overtime** backlog entry):
  - **SICK DAYS are a policy now.** A sick crab always stayed home unpaid;
    what was missing was that it *meant* anything. `BIZ[k].sickPol` is
    GRANT (default = the old behavior, inert) or REQUIRE WORK, with a
    per-crab override `p.sickPol`. A required crab drags themselves in at
    half speed, earns full wage, and finally makes the settlement block's
    long-dormant coworker-contagion term fire (until sick days were a
    policy, no crab could ever be at work to trigger it). Fishers and
    owner-operators always grant themselves. A granted sick day takes
    effect the moment it's granted — a crab mid-commute turns around.
    Coverage behaves exactly like the weekends placard: `bizRestingToday`
    counts sick-day crabs, the sign reads **OUT SICK**, and the job board's
    emergency posting deliberately does NOT fire (a bout of flu is not a
    vacancy — the same reasoning that spared rest days).
  - **THE CARED SEAM IS CLOSED.** Recovery's `cared` check read only hunger
    and dirt — it predated thirst and tiredness, so a day in bed bought
    nothing. Recovery is now a graded ladder (`CARE_LANES`), keyed to the
    same housing quality the sleep ladder uses:
    NEGLECT 0.12/0.25 and CARED 0.40/0.08 are **byte-for-byte the old
    odds** (nobody got worse), and two new lanes sit above them, reachable
    only by actually staying home on a granted sick day, fed AND hydrated
    (thirst < 0.5) for `REST_HOURS` 9 daylight hours: **COT REST 0.48/0.06,
    BED REST 0.55/0.04**. `p.restT` banks daylight hours at home while ill
    and resets at each settlement.
    **Measured** (`node tools/illness.mjs --seeds 120`, paired arms — the
    care table is collapsed back onto the old odds *inside the same build*,
    so the comparison can only differ on the seam):
    | arm | mean | median | p90 | deaths |
    |---|---|---|---|---|
    | own bed, before | 2.63d | 2d | 5d | 12 |
    | own bed, after | **2.28d** | 2d | **4d** | **4** |
    | shelter cot, before | 2.43d | 2d | 4d | 7 |
    | shelter cot, after | **2.18d** | 2d | 4d | **4** |
    | bed lot rolled at COT odds (rung, paired) | 2.57d | 2d | 5d | 5 |
    Bed rest cuts 0.35 days off an illness, cot rest 0.25, and the housing
    RUNG itself is worth **0.29 days** on identical seeds. 74 of 120
    convalescents reach a rest lane; the other 46 never clear the
    fed/clean/hydrated bar and sit on the untouched CARED odds.
    Organically (6 solvent towns x 24d) most illness is still NEGLECT —
    the rest lanes are what a *managed* town gets.
  - **OVERTIME.** `p.ot` lengthens today's shift by up to `OT_SPAN` 120min
    at `OT_RATE` 1.5x the crab's normal hourly rate (= wage / their own
    contracted shift, never the cover double), paid on top of the flat day
    at settlement. **Shop-hours coupling (the documented choice):** OT
    lives strictly INSIDE the shop's open hours — hours gate admission and
    the CLOSED sign, so an hour past close is premium pay for nothing. The
    window takes room at the END first, then borrows from the START, so an
    E-shift crab whose shift already ends at close comes in EARLY — exactly
    the shape that plugs a missing morning. A crab covering a full-open
    double has no room at all, by construction. Health cost: no parallel
    system — the existing end-of-shift accrual scales with the longer day
    (hunger proportional, tiredness at `OT_FATIGUE` 1.5x that share).
    Minutes are MEASURED (`c.otMin`), not assumed, so knocking off early
    pays less. BILL chip + MENU breakdown both read `crabDueTonight`, so
    the column adds up; the bankruptcy forecaster deliberately keeps
    billing BASE wages as steady state (same rationale as the day-off
    skips — episodic, and noise over a 10-settlement horizon).
  - **VISIBLE OT POWERUP.** A chunky coffee cup with curling steam
    (`OT_MARK`, two frames) bobs over any crab clocked in past their
    contracted hours, plus an OT tag on the follow card and an OT row on
    the dossier. All of it reads `onOvertimeNow` / `otMinutes` — derived
    from live state, so it clears itself with nothing to reset.
  - **SCHEDULE + TOWN tabs on the management screen.** The manage card
    grew a tab strip: HOURS (as it was), SCHEDULE (AUTO-MANAGE and SICK
    DAYS chips, then one row per staffer with four tap targets — name opens
    the dossier, SHIFT cycles M/E/D, OT toggles, SICK cycles shop-rule ->
    grant -> require) and TOWN (the census). Days off stay derived and are
    shown, not set. The dossier's SHIFT row is the OT control and its
    HEALTH row the sick-day control, beside TAP: REASSIGN as specced.
  - **AUTO-MANAGE** (`LABOR_CFG` + `runLaborPolicy`, the SUDSY hours
    pattern): one move per settlement, a cooldown day after each, a named
    toast every time. Rules in order — **REST** (an ill crab under a
    REQUIRE policy is sent home), **OT OFF** (a crab on OT who is over the
    tiredness budget, ill, or no longer needed), **OT ON** (tomorrow leaves
    a shift uncovered AND a rested candidate exists). Converges because the
    tiredness triggers are a HYSTERESIS BAND (0.55 on / 0.75 off), never a
    knife edge, and OT itself pushes tiredness up — every ON move weakens
    its own trigger; on the coverage axis the regimes are disjoint.
    `coverGapTomorrow` keys on SICKNESS, not days off, because the day-off
    cover double already fills those for free. Default OFF for the player,
    ON for peer owners — SUDSY grants herself sick days by this table.
    Suite-proved over a fortnight: never two moves in a day, never two
    consecutive days.
  - **TOWN CENSUS.** Every crab in town, one 16px two-line row: shell
    portrait, name, job/employer, wallet, housing, health, then shift, day
    off, OT, PACE and five mini need bars — all derived live. Sort
    NAME/JOB/HOME/HEALTH/WALLET, filter ALL/CREW/TOWN/SICK/OT, six rows a
    page with `<` `>` paging (the card idiom's answer to a 12+ crab town —
    no scrollbar). Tap a row for that crab's dossier, which now draws ON
    TOP of the management card so closing it drops you back in the census.
    Reachable from the job board's TOWN CENSUS chip too: the board
    advertises the labor the town wants, the census reads the labor it has.
  - **Measured balance** (30d x 8 seeds): baseline 0/8 evictions
    7,8,10,10,11,11,12,14 **median 11** (before: 7,8,10,11,11,11,12,14,
    median 11 — one seed moved one day); growth `--buy chef,table` 0/8
    6,7,8,9,10,10,10,16 **median 10** (before: 6,7,7,9,10,10,11,16, median
    10). Both medians UNCHANGED, no price or policy lever touched. The
    player-facing defaults are near-inert by construction: sick days GRANT
    (the old behavior), auto-manage OFF, `p.ot` false.
    OT uptake, 6 solvent towns x 24d: **auto-manage OFF measures literally
    zero** OT minutes and zero moves; delegated it runs 29 crew-hours of
    overtime town-wide for $166 of premium ($5.77/OT-hour = exactly 1.5x
    the $3.83 base hourly), 2.8 moves per town, and evening crew tiredness
    moves 0.20 -> 0.21 — the fatigue cost is real but bounded, because the
    rota pulls crabs off at 0.75. SUDSY's till is a wash (mean $38 -> $27,
    driven entirely by one seed; five of six seeds sit at $0-1 either way,
    exactly as the fixed-hours control does).
  - **Suite 65 -> 73, with ZERO re-pointing.** Every existing sickness pin
    ("disease: care cures, neglect can kill", "sick crabs can still wash")
    held unchanged, because the seam was built additively — the NEGLECT and
    CARED lanes keep their exact old odds. Eight new scenarios cover the
    bed-vs-cot duration shift, GRANT vs REQUIRE, the exact 1.5x rate + OT
    geometry + needs acceleration, marker render/clear, auto-manage
    convergence, SUDSY running the same policy, census derivation +
    sort/filter, and save/load roundtrip with clamping.
  - Fixed en route: `font.js` was missing `%`, `<`, `(`, `)`, `=` and `*`
    from the 3x5 small font — all six fell back to `?`, which means every
    PACE chip in the game has been reading "100?" since the needs-drag
    build. Added.
  - **Devlog beat (organic, seed 1337, no buys):** SUDSY runs herself
    ragged on day 2 — thirst 0.85, hunger 0.6 — and the settlement lands
    her ill. Days 3 and 4 she hangs OUT SICK on her own shopfront and stays
    in house 5: 14 game-hours abed each day, needs nursed back to zero,
    care lane BED REST. The day-4 roll cures her at the 0.55 lane and the
    town's only shower attendant is back on her stalls on day 5. She
    granted herself that sick day by exactly the rule the player's SCHEDULE
    tab exposes. Shots: `census-town-tab`, `schedule-tab`, `ot-powerup`,
    `sick-day-placard`, `dossier-sick-day`, `dossier-overtime`, plus
    `census-portrait` / `schedule-portrait` under shots/.
- **Shop hours + management screen + CPU owner policy** (shipped 2026-08-18,
  realizes backlog "Business settings"): every business carries real OPEN
  HOURS (`BIZ[k].hours`, default 8-20 = the old hard-coded day; bounds
  6:00-24:00, min 4h, `setBizHours` clamps). Hours gate tourist admission
  (spawn filter + `anyBizOpenNow`), home-errand dispatch (per target biz),
  the CLOSED sign, and ANCHOR the shifts: `bizShiftWindow` derives M = first
  half, E = second half, D = open+30..close-90, cover = full window - the
  SHIFTS table keeps the shape, hours give it a frame (defaults evaluate to
  the exact old windows). Deliberately staffing-gated, not hours-gated: the
  fisher-breakfast and after-shift-dinner paths, so a staffed counter still
  serves the early/late crowd (bit-identity depends on this). MANAGEMENT
  screen: tap a player-owned shop's sign/MANAGE chip - hour steppers (30min),
  today's per-biz takings/costs (`today.biz` via creditBiz/debitBiz), roster
  with derived shifts + days off, and staff-meal policy RETAIL/AT COST/FREE
  (`BIZ[k].mealPol`, wired at the selfCook charge site; retail default).
  CPU owners: `HOURS_POLICY` table + `runHoursPolicy` at settlement - dead
  first hours 3 days -> open 1h later; dead last hours + clean closes ->
  close 1h earlier (span floor 6h); queue at close 2 days -> extend 1h within
  the staff-tiredness budget (tired < 0.75). One move/day max, history resets
  after a move + 1-day cooldown -> converges, never thrashes (suite-proved
  over 24 days; SUDSY typically walks 8-20 down to ~9-17/8-14 because her
  boundary hours genuinely see no traffic; toast "SUDSY NOW OPENS AT 9").
  All of hours/mealPol/policy state save-roundtrip with clamping migration.
  Measured: defaults BYTE-IDENTICAL to the pre-feature build (8 seeds x 30d,
  full stats blobs, policy disabled via `window._noHoursPolicy`); with the
  policy live the baseline is 0/8, 7-11 median 10 vs 7-14 median 10 (only
  the day-14 tail seed moved) and growth chef,table reads median 9 vs 10 -
  one seed-day, the documented per-build wobble; an 8h-floor damping probe
  measured the identical growth list (the shift is stream chaos from her
  first move, not the shrink depth), so the 6h floor stays. Her till:
  seed-dependent (one seed way up, one down, two a wash - the fixed-hours
  control drains to ~$0 in 3/4 seeds too over 24 kept-alive days).
- **Weekends / days off** (shipped 2026-08-18): a 7-day week derived from
  `day` (day 1 = MON, weekday in the clock). Every working crab — crew, NPC
  staff, owner-operators, fishers — rests one weekday, derived at runtime
  from day + roster (per-biz base weekday, name-sorted stride-3 fan-out; no
  save change, nobody rests MON/TUE). Off day: no commute/duty/pay (wage
  loops + BILL/MENU skip via the same predicate; `workedToday` keeps pay
  truthful across mid-day rota reshuffles from job-board hires), sleep-in
  to 9:30, then errands all day at relaxed thresholds (FUN 0.35 vs 0.6 —
  E-shift crabs finally get arcade mornings) as full retail customers,
  beachcombing between errands. Coverage: an uncovered shift promotes the
  on-duty coworker to a full-open 8-20 double (M/E never overlap, so this
  is revenue-neutral); single-worker shops honestly close — showers SUN,
  a one-crab arcade FRI, staggered apart — under a DAY OFF placard, which
  deliberately does NOT fire the job board's dark-shop posting. Fisher off
  days thin `townCatch` (~half supply that day with 2 fishers: DRIFT THU,
  SALTY SUN). Dossier shows OFF: <WEEKDAY>S, follow card shows OFF <WD> +
  DAY OFF statuses, day report names the resters. Measured: baseline 0/8,
  evictions 11-15, median 13 (pre-feature: 10-19, median 13); growth
  chef,table 0/6, 7-14, median 12 (pre: 10-18, median 13).
- **Day report card** at closing: guests served, takings, walkouts, wages,
  rent, till, word-of-mouth swing, busiest crab, and the day's illnesses,
  recoveries, deaths and moves. Click to dismiss.
- **Accomplishments**, not XP: crabs count the dishes they've served; at 25 /
  100 / 250 of a dish they get the knack (−5%), get famous (−12%), or master
  it (−20% prep time) for that dish only, announced in a toast and shown on
  their follow card. Rewards watching a specific crab grow into a specialist.
- **Needs drive performance** (`crabEff` in game.js): a well-kept crab works
  at 1.0; hunger past 0.3 costs up to −18%, dirt past 0.6 up to −6% (floor
  0.76). Applies to station prep, stall cleaning, and — gently, with a kicker
  below eff 0.85 — kitchen hustle speed. Pinned-needy crews serve ~25–45%
  fewer dishes over 5 days than well-kept ones (suite: "needs bite").
  Surfaced as a PACE % chip on the follow card and a "WORKING AT N%" dossier
  row when impaired. Fishing casts are deliberately NOT coupled: the whole
  town eats the catch, and any measurable drag there re-tilts the calibrated
  economy (tried at full and half weight; both broke the knife-edge one-crab
  states). Tune only against the matrices + suite, never by feel.

## The trade horizon (Matt, 2026-08-18) — land it by degrees

**North star**: the town is one **node** in a wider trade network. Everything
is produced *idle-style* — like Overcooked, crabs must go to stations to keep
things running (this eventually reaches power stations, but that's far off).
The town imports what it can't make and will eventually export what it can;
other idle economies get built as sibling nodes and connected together
slowly, as the infrastructure builds itself out.

**Current target: a complete and beautiful "fishing town node" with
external-facing stubs.** Everything below serves that.

Staged landings (each stage ships alone, suite-green, balance re-verified):

- ~~T1~~ **shipped 2026-08-18** — IMPORTS table (fish $7 / corn $3 / water $1
  gal / power $2 kwh), tradeImport() counters (today + all-time + $ spent),
  wired: import-fish at consumeIngredient (the only charged flow, as before),
  water per shower (8/14 gal) and wash cycle (12; flow removed with the laundromat), corn per taco, power per
  arcade serve. Ledger renders on the town notice board. Save/load
  roundtrips. Zero new charges by construction (suite scenario asserts
  spent === fish x $7 exactly).
- **T1 — Trade ledger (bookkeeping only, zero balance change)** (original spec): an `IMPORTS`
  commodity table with *fixed prices* — corn, fresh water, electricity,
  imported fish (already exists at $7) — and running counters for quantities
  imported (exports later). Wire existing flows in: import-fish purchases,
  showers/laundry consume water, arcade consumes electricity. A TRADE ledger
  view (notice board or MENU tab). Not connected to anything yet — the point
  is the tracked flows exist before anything depends on them.
- ~~T2 — Thirst + juice bar~~ **shipped 2026-08-18** (built to the spec
  below; measured deltas):
  - Landed exactly as spec'd: accrual +0.35 shift end / +0.15 nightly /
    +50% while sandy > 0.5; drink errand at 0.45 between food and clean;
    landing risk +0.12/night at 0.95; −15% walk at 0.8; NO crabEff term.
    JUICE $6 / COOLER $9 (first two-input recipe via optional `raw2`),
    juicer x2 + counter in the old cleaners lot at 752-880 (the job board
    at x716 keeps its sliver), rent 55, $400 in the vacated shop slot.
    IMPORTS gains fruit $2; every drink counts fruit, each COOLER a gallon
    of water — tracking only, spent still === fish × $7 by suite assert.
  - Fallbacks the spec was silent on, decided by the systems map: with no
    bar, a drink errand buys the shack's own juice ($10, unchanged); staff
    of a dark shack/bar pour their own at retail (selfCook generalized to
    biz+need). Any juice quenches, even one bought as lunch.
  - **Tourist drinks are ADDITIVE demand** (weight 0.3): beachgoers who'd
    never queue for a plate grab a drink; the spawn interval shrinks so
    every other biz keeps its exact pre-bar flow. Pure weight-splitting
    made the bar a strictly-bad buy (it traded $13-17 plates for $6-9
    drinks); additive demand is the "new demand stream" reading.
  - Knobs: **wage 22 → 23** (the sanctioned raise — with wage 22 the drink
    recycle stretched the baseline to median 14 with a 20 tail; a $1 raise
    landed it at median 11-13 with wallets bounded 8-32). Shack juice price
    and all spec numbers untouched.
  - Measured: baseline 0/8, evictions 8-14, median 11 (16 seeds 8-18,
    median 13; was 8-16 median 12). Growth `--buy chef,table` 1/6 escapes,
    eviction days identical pre/post; `chef,table,juicebar` 1/6 (same
    days — the late-game bar is roughly neutral); `chef,juicebar` 0/6 but
    the bar-first seeds run to median 22 vs baseline 11 — the bar roughly
    doubles runway without escaping alone. Suite 38/38.
  - Also fixed en route: a hold-and-wait kitchen deadlock (waitSlot/waitCash
    chefs squatted ON the station spot the slot-holder was walking to —
    night pours made it common; waiters now step into the clear lane).
- **T2 spec (draft, 2026-08-18, pending Matt's read)** — thirst + juice bar
  land as ONE measured pass, immediately after laundry removal merges:
  - **THIRST need**: parallel to FED, faster cycle (casual, frequent): +0.35
    at shift end, +0.15 nightly, +50% accrual while sandy > 0.5 (beach heat).
    Drink errand at thirst ≥ 0.45, priority between food and clean. At
    LANDING thirst adds sickness risk (≥ 0.95 → +0.12/night, the scariest
    neglect) and a parched walk penalty (≥ 0.8 → −15%), but deliberately NO
    new crabEff prep-drag term — one new death-spiral pressure at a time;
    coupling into crabEff is a later loosening with its own matrix run.
  - **JUICE BAR**: the $400 rung in the vacated _biz1 shop slot and the
    vacated cleaners lot (~680-860). Player-owned shopfront, rent ~55,
    juicer x2 + counter, recipes JUICE $6 (fruit) and COOLER $9 (fruit +
    fresh water), prep 1.5-2.5s — cheap, fast, high-throughput. Tourists
    order drinks too (new demand stream on the rep curve). Staff drink at
    retail, same policy as meals.
  - **Ledger (T1 hooks)**: new IMPORTS entry fruit $2; every drink counts
    fruit and 1 gal water through tradeImport(); still tracking-only until
    T3 charges sourcing.
  - **Matrix plan**: measure the COMBINED removal+juicebar curve (removal
    lands measured-inert first, so movement attributes to T2): target
    median 11-13, evictions 7-17, via --jobs matrix; watch crew wallets —
    thirst spend at retail is a real drain, and the precedent is RAISE THE
    WAGE (22 → measured value) rather than discount drinks. Growth check
    gains a juicebar buy strategy in the headless buyer. Suite adds: thirst
    serviced end-to-end, parched-spiral risk, juicebar economics + ledger
    flows, and the no-inflation guard re-run.
- **T3 — Ingredient sourcing for everything**: recipes get real ingredient
  lists (corn → tortillas → FISH TACO is the pilot; the `raw:` field and
  `consumeIngredient()` are the embryo). A pantry + a receiving station where
  imports physically arrive (morning delivery), and a crab has to work the
  station to restock — production is idle-style, not a passive rate.
- **T4 — The boat** — **shipped**: a live-aboard boat as the fisher-only top
  housing rung (shelter → house → boat), bought at the same nightly
  settlement that runs the rest of the ladder. Numbers: $75 + $2/night
  mooring fee (vs $35 move-in + $10 rent); 3 named berths (PEARL, GULLWING,
  SQUALL) moored off the pier's seaward rail, hull trim in the owner's
  color. A boat is owned outright — a broke night runs a tab, never an
  eviction — and the vacated house frees for the next climber. Owners fish
  from their own deck: ~12 fish/day vs ~5-6 off the pier (faster casts +
  20% double hauls). Sim-verified: fishers reach the boat organically
  ~day 23-25 (3 of 4 seeds), and the baseline eviction curve is untouched
  (0/8, median 11, identical day list) because boats land after the
  do-nothing window. The player's boat waits on backlog "player-avatar
  crab" + "fishing expansion".
- **T5 — Exports + external-facing stubs**: an export dock — surplus catch
  (and later goods) sold off-node at fixed prices, both directions visible in
  the ledger. Every commodity flows through named ledger entries so future
  sibling nodes (farm, power station) can plug in without surgery.

Sequencing rule: fixed prices and untracked externalities are *fine* — track
first, connect later. Don't build the network before the node is beautiful.

- **Hiring-as-recruitment + standing lots** (Matt's directive, built
  2026-08-18, worktree): "hiring new crabs shouldn't make a house pop into
  existence; we should recruit them from the tourist pool or something, and
  the houses just exist empty already." Systems bullets above have the
  mechanics. Measured: baseline 30d x 8 seeds BIT-IDENTICAL (0/8,
  evictions 7,8,9,9,10,10,10,14, median 10 — baseline never hires, as
  expected); growth `--buy chef,table` also bit-identical eviction days
  (0/8, 7-10, median 10) — homeless hires (no $10 house rent, cot-rate
  sleep) and the occasional converted-away paying tourist net out to
  nothing measurable on the eviction curve. No price tuning. Suite 53/53
  (3 new scenarios; zero existing pins needed re-pointing — the rehire and
  rota scenarios only pin "hire completes immediately", which holds).

- **Fisher self-sufficiency** (Matt 2026-08-18, shipped): self-employed
  fishers take breaks whenever a need presses (the errand loop re-commutes
  them to the pier after), and a hungry fisher who can't afford town food
  roasts one of the day's catch on the beach (never the town's last 2 fish —
  no money moves). Measured: fisher min-hunger 0 weekly, no starvation
  sickness. Baseline settled at 0/8, evictions 8-12, median 10 (roasts +
  break-time trim fish supply slightly).

- **Shop hours + management screen** (Matt 2026-08-18): agent building.
  Per-biz open hours as real data (defaults behavior-identical), a
  management overlay for player bizes (hours steppers, per-biz takings,
  staff list, staff-meal pricing policy RETAIL/AT COST/FREE finally wired),
  and CPU owners adjusting their own hours via a small convergent policy
  with named toasts ("SUDSY NOW OPENS AT 9").
- **Tourists become recruits; houses stand empty** (Matt 2026-08-18): agent
  building. Hiring no longer mints a persona + house from thin air: hires
  convert from the visiting tourist pool (name preserved) or arrive on the
  morning bus, start homeless at the shelter, and climb the ladder like
  everyone else. All 9 house lots render permanently - vacant ones look
  vacant. Another brick in the all-crabs-equal wall.

- **Save management** (Matt 2026-08-18): agent building. Multiple save slots
  (5, migrating today's single key into slot 1), IMPORT/EXPORT of save files
  (upload a town, download a town), and a save screen whose slot preview
  shows the CREW in detail — portraits, names, jobs, housing, health — "for
  easy remembering" which town is which. Validate-before-mutate on import;
  a bad file must never touch the running game.

## THE ESCAPE PROMISE IS BACK (2026-08-18, after routing) — supersedes the ruling
Matt ruled escape-as-rare while it was measurably broken (0/6 at day 40). It is
no longer broken, and nothing in the economy was touched to fix it: trip-chaining
and furniture-aware travel gave crabs back the hours they were spending walking
and bouncing. Measured on the finished tree: baseline (do nothing) 0/8, evictions
7-14, median 12 — lose-by-default holds exactly. Hire-and-seat growth: **5/8 alive
at day 40**. That is the founding promise met — "lose by default, but a growth
strategy can escape" — arrived at by fixing the environment rather than the
numbers. If Matt wants it harder, the honest levers stay spawn pacing and rent,
chosen deliberately; do NOT re-cripple the routing to get there.

## (superseded) DECIDED — growth escape is RARE for now (Matt, 2026-08-18)
Matt's call on the open question: **option 2 — escape-as-rare stands as the
design for the moment.** "We'll choose (2) for the moment, we can calibrate
again once we've told some new stories." The promise is redefined, not
repaired: the town loses by default and even bought growth usually fails;
survival stories are the game until further notice. A fresh calibration
campaign is DEFERRED, to be run after the next content wave (new stories:
more peer owners, T3 sourcing, exports). The suite's growth gate stays a
regression FLOOR (median >= 9) so it can't silently get worse, and the
parked escape assertion below is the contract for whenever calibration runs.
Historical context preserved: chef+table towns die day 7-12 of revenue
collapse at HIGH rep (0/6 at 40d, median 10) across the credit/wage-23/
weekends economy; financing probed and ruled out (proportional minimum,
payroll-scaled limit 90 + 70/crew, both inert); the collapse is growth-town
unit economics.

## Backlog (rough priority)
1. ~~**Business settings**~~ — **shipped 2026-08-18** as shop hours + the
   management screen (see the systems bullet). Remaining loosenings from the
   original idea: per-business PRICES and staffing rules.
2. **More peer owners moving in** — the owner layer makes this content, not
   surgery: an OWNERS entry + BIZ entry + an NPC crab. Fish market buying
   wholesale off the pier is the natural next one.
3. **Player-avatar crab** — make `owner: "player"` also a walkable crab.
4. **Fishing expansion** — hire fishers directly; fired/unhired crew return to
   the pier; weather/catch variance; quotas; a boat (see trade horizon T4).
5. **NPC eviction / move-outs** — NPC owners currently skip rent when short
   (TODO in the settlement block); no mortality for NPCs either.
6. Staff-bused table service for a fancier restaurant tier.
7. Cosmetics — mostly **shipped**: pier plank art (boardwalk over the east
   break, pilings, railing, night lamp, perched gull), closed-eye sleep
   sprites with breathing + Z drift, taller shower stalls (curtain with a
   feet gap), grill smoke, shower suds, beach memorials now actually drawn,
   dossier portrait/flavor-line polish, gull-cry + catch-splash sfx.
   Post-ship incident (Matt: "crabs stuck in the shower", fixed same day):
   (a) the bather vignette drew from claim time, showing a head in an empty
   stall during the walk-over — now gated on state === "showering" (ea65082,
   which also added the real walk-in/out movement); (b) a crab dying
   mid-errand (or NPC-hired mid-errand) leaked stall.occupant forever —
   cleaners require !occupant, so the stall deadlocked for the run. New
   abortErrand() releases stall/table/claim/ghost customer on both paths
   (ef5b5a6); suite soaks 2 days asserting no stall stays occupied past a
   real cycle (30/30).
   Remaining: followable-NPC polish. ~~Shower stall entry~~ — **shipped**
   (Matt 2026-08-18): the bather is now visible in the stall — head bobbing
   over the curtain in their own shell colors, white eyes, feet in the gap
   (already there), suds rising while the water runs. The crab entity stays
   hidden=true during showerT (out of collision/painter); the stall draw
   renders the bather from t.occupant.
8. ~~Secret mobile merge mode~~ — **shipped**: touch-only hidden mode (hold a
   crab until the thought bubble fills), per-crab boards, goal ladder pays
   into the till ($60/session cap). Lives in merge.js, desktop-inert.
9. ~~Portrait-phone canvas~~ — **shipped**: portrait viewports get a 256x288
   canvas (index.html sets `SCREEN_H` before ppu.js derives `H`; a mode-flip
   on rotate reloads, losslessly, after a 250ms settle). The world keeps rows
   0..PANEL_Y in every mode; the extra 48 rows go to the panel — 16px tabs,
   34x34 crew cards with 2x portraits, 80x26 shop buttons, 8px menu pitch —
   via TALL/TAB_Y/ROW_Y/CARD/BTN_H consts that evaluate to the old numbers on
   240 (desktop frame is pixel-identical; verified byte-identical
   screenshots). Merge mode's cell height and button lanes now derive from H
   too. Headless sim never sets SCREEN_H, so the suite runs on classic 240.

## Feature requests (Matt, 2026-08-18, unscheduled)
- **Fishing experience** (Matt: "fish-catching should give experience").
  Fold into the existing accomplishments framework (dishes: knack at 25 /
  famous at 100 / master at 250, toast + follow-card line) — count each
  crab's lifetime catches (catchesBy already tracks per-name in stats;
  make it per-crab persona state so it saves) and grant fishing tiers at
  the same milestone shape: e.g. knack = a touch faster casts, famous =
  +double-haul odds, master = the rare BIG ONE (bonus fish / bonus price).
  Under floating fish prices an experienced fisher earns visibly more —
  which feeds the housing ladder and the boat, and gives SALTY vs DRIFT
  a career arc the devlog can follow. Tourists at the pier watching a
  master land the BIG ONE wouldn't hurt either. Natural build slot: the
  price-discovery agent (fishing economics, same code) or immediately
  after it.
- ~~**Town census — all-crab character menu**~~ — **shipped 2026-08-18**
  as the TOWN tab of the management screen (see the labor policy suite
  bullet). Original request preserved:
- **Town census — all-crab character menu** (Matt: "need an all-crab
  character menu to review basic stats of whole pop"). A population
  screen: every crab in town — crew, townsfolk, NPC owners — one row
  each with the basics at a glance: name/portrait, job + employer, shift
  & day off, wallet, housing (house/boat/cot), health (sick day N /
  well), need bars in miniature, PACE, OT/day-off status. Sort/filter by
  job, housing, sickness, wallet. Tap a row → that crab's dossier (and
  selects them, per the selection decouple). Natural home: a POP/TOWN tab
  next to CREW/SHOP/MENU, or reachable from the job board. Pairs with the
  scheduling menu — census for reviewing, scheduling for acting.
- **Decouple selection from camera follow** (Matt: "we can't order crabs
  around cause when you drag it deselects them; need to be able to select
  a crab without it focusing basically; should focus till click away, then
  keep select but lose camera"). Today follow-cam IS selection (followIdx)
  and any drag/pan clears it — so you can't line up a right-click order
  while panning to the destination; the order system fights the camera.
  Spec per Matt: clicking a crab SELECTS it and focuses the camera;
  clicking/dragging away releases the CAMERA but keeps the SELECTION
  (visible highlight — ring/outline under the crab + their card stays up);
  right-click orders go to the selected crab from anywhere on the map.
  Click empty ground / Esc / selecting another crab changes selection.
  Follow-cam can be re-engaged from the selected card. UI-layer only, no
  matrix; touches the same input layer as right-click orders and merge-mode
  hold — mind the 6px drag threshold lessons.
- ~~**Labor policy suite: sick days + overtime + scheduling menu**~~ —
  **shipped 2026-08-18** (see the systems bullet above for what landed and
  what it measured). Original request preserved:
- **Labor policy suite: sick days + overtime + scheduling menu** (Matt).
  Three pieces, one family, built on the management screen:
  - **Sick days** — a sick crab can take the day off, UNPAID, to care for
    themselves. Rest at home should genuinely help: this is the moment to
    close the known "cared" seam (recovery's cared check reads only
    hunger+dirt — predates thirst/tiredness; a sick day in a real bed,
    hydrated, should hit the 40% recovery lane, else staying home is
    theater). Interacts with shift coverage exactly like weekends'
    single-worker DAY OFF placard.
  - **Overtime** — already specced this morning (see earlier entry: ~1.5x
    premium, needs/health cost, dossier control, visible OT powerup marker
    + follow-card tag). Its prerequisites (stats→performance, T1) landed
    long ago; it rides in this bundle.
  - **Scheduling menu + auto-management** — a scheduling screen (likely a
    management-screen tab): shift assignments, days off, OT requests, sick
    day approvals. Ships WITH an auto-manage mode built on legible
    convergent rules (the SUDSY hours pattern) so CPU owners run the same
    policies the player can — and lazy players can delegate. CPU
    participation is the point: NPC shops grant sick days and post OT by
    the same rules the player sees in the menu.
  All balance-moving (labor supply changes on every axis) → full matrix;
  sick days probably shift the illness-duration distribution left, which
  is the intended payoff — measure it for the devlog.
- **Music off by default, but sell it** (Matt): ship with music muted for
  new players (SFX stays on), and actively encourage flipping it on — e.g.
  a small pulse/glow on the MUS toggle early on, or a one-time toast at a
  calm moment ("THE BAND IS WARMED UP - MUS TO LISTEN"), plus the NOW
  PLAYING banner already selling track titles. Existing saves keep their
  current choice; the encouragement shows only while music is off and
  gives up after a few sessions rather than nagging.
- ~~Stop the table-bumping~~ + ~~Route optimization / trip-chaining~~ —
  **shipped together (worktree, 2026-08-19)** as ONE pass over the
  locomotion/errand-dispatch layer (both directives are the same code; the
  originals are kept below for the record).

  **The chaining rule, as shipped** — one comparison per candidate stop, no
  path search. `pickErrand` now GATHERS every stop the crab could make right
  now (the old priority order survives as `ERRAND_RANK` food 4 / drink 3 /
  clean 2 / fun 1) and takes the best

      score = (rank + need level) / (1 + detour / DETOUR_SCALE)     [400px]

  where the DETOUR is only what the stop ADDS to the walk that was happening
  anyway:

      detour = |here → stop| + |stop → anchor| − |here → anchor|

  `anchorX(c)` is where the trip ends regardless: the workplace while a shift
  is coming or under way, home the rest of the time. A stop ON the route
  scores its full urgency (detour 0); a stop the other way costs twice the
  backtrack. Escape hatches, both deliberate: a need past **DIRE (0.9)**
  ignores geography entirely (desperate crabs walk), and the
  "don't-backtrack-the-promenade-before-9-AM" rule drops any stop more than
  **DETOUR_MAX (900px)** out of the way *while a crab is at home with a shift
  ahead* — it will still be there tonight. Three companion rules do the rest
  of the work:
  - `afterErrand()` sends **anyone** with a shift ahead on to WORK (it was a
    fisher-only shortcut). This single line is what turns "eat, walk all the
    way home, turn round, walk back past the shack" into "eat en route".
  - `afterErrand()` also **CHAINS**: a second stop within `CHAIN_PX` (260px)
    of the way onward happens now instead of after a lap home. Two stops per
    outing, then the schedule takes over — imperfection is charming, a third
    lap is not. A bounced queue never chains (you were not served).
  - A **shift-end crab takes their staff meal at the counter they are standing
    at** (`startSelfCook` at the pendingOff branch). Refusing it there was the
    entire reason a crab walked home across town at 15:00 and back to the same
    dark kitchen at 20:00 to cook it.

  **The avoidance mechanism** — lane travel was furniture-BLIND, and commutes
  did not route at all: `stepTo(dest, y=167)` drew a straight diagonal from
  the front room (y≈155) to a shop door, which crosses the entire front row of
  counters *for the whole trip*. That one line was most of the town's bouncing.
  Now `solidBands()` mirrors `collide()`'s two furniture passes EXACTLY (same
  x/y tolerances, cached on unlocks + table level), `laneClear(lane, x0, x1)`
  reports a lane's daylight over a span, and `travelLane()` reads
  `LANE_LOOK` (64px) ahead — one comparison — taking the other lane only when
  the near one is under `LANE_PAD` (2px) of daylight and the other is better.
  Commutes, walk-home, the day-off amble and the idle loiter all route through
  it. Two constants moved with measured receipts: the **aisle 147 → 146** (the
  centre of the corridor the furniture leaves — 147 sat 2px off the picnic
  tables) and the **lane merge 3px → 1.5px** so walkers hold their lane
  instead of drifting into the counters over a thousand pixels (that drift was
  a 44-unstick pin on one town). `clearSpotY()` keeps loitering spots out of
  the furniture — the lower idle spot (y=156) sat squarely inside the front-row
  band, which is why SUDSY spent her shift being shoved off her own towel
  counter. The shipped BOUNCE_BUDGET/WARP_PX valve is untouched and now
  almost never fires.

  **Measured — locomotion** (5 days × 4 seeds):

  | town | metric | before | after |
  |---|---|---|---|
  | plain | warps | 34 | **0** |
  | plain | unsticks | 19 | **6** |
  | plain | frames deflected by furniture | 12239 | **2265** (−81%) |
  | plain | distance walked / crab-day | 5115px | **4438px** (−13%) |
  | plain | x-walk / crab-day | 4140px | **3563px** (−14%) |
  | plain | "laps" of own territory (mean / median) | 2.20 / 1.79 | **1.91 / 1.32** |
  | arcade (4 crabs, 4 seeds) | warps | 19–25 | **0** |
  | arcade | unsticks | 6–11 | **2–9** |
  | arcade | x-walk / crab-day | 4147–4286px | **3506–3706px** |

  A "lap" is `x-distance walked that day ÷ 2 × (that day's x-span)`: home →
  work → home is exactly 1. The median crab-day went from nearly two laps to
  1.32.

  Scripted single-crab probe, the SAME hungry-crab-at-home construction driven
  in the browser on both builds (CLAWDIA, home x134, shack queue x1570, shack
  door x1247, shift 14-20):
  - **before**: home → shack (1436px) → **all the way home again** (x141, at
    15:21) → then out to work (2948px cumulative when the work leg starts) —
    about **4050px** to eat a plate of fish and clock in.
  - **after**: home → shack (1436px) → straight on to work (1513px cumulative
    at the work leg) — about **1840px**, and she is on the bike to the door,
    fed, at 13:29 for a 14:00 shift. **2.2x less walking for the same day.**
    (shots/before-chained-trip.png vs shots/after-chained-trip.png.)

  Scripted single-crab probe, same walk both builds (x890 → x977, straight
  past SUDSY's towel counter): **before 421 frames, 222 of them deflected
  (53%), 412 spent inside the counter's solid band, 50 GAME-MINUTES for 90
  pixels, ending shoved up over the counter at y=148.6. After: 49 frames, 0
  deflected, 6 game-minutes, out on the boardwalk at y=167.4.** That 8.6×
  is the "all day" Matt was watching. (shots/before-towel-counter.png vs
  shots/after-towel-counter.png — the clock in the corner reads 09:56 vs
  09:06.)

  **Measured — balance** (`--jobs 4`, this tree, before vs after):
  - Baseline 30d × 8: 0/8 both. Evictions **7,8,10,11,11,11,12,14 (median 11)
    → 9,10,10,11,12,12,12,13 (median 12)**. +1 median, tails tightened at both
    ends. This is the documented drift: commute time is work time, so saved
    claw-miles are recovered crab-hours — same shape as the auto-unstick fix.
  - Growth 40d × 8 `--buy chef,table`: **0/8, evictions 6,7,7,9,10,10,11,16
    (median 10) → 2/8 survive, evictions 11,11,12,27,33,37,41,41 (median
    33).** This is a BIG move and it is NOT tuned away (standing policy: a
    behaviour fix's balance consequence gets documented, not neutralised).
    **FLAG FOR MATT**: this bumps hard against "escape-as-rare stands for the
    moment". A growth town that no longer spends a third of its crew-hours
    walking in circles is simply a better-run town, and the honest levers if
    escape should come back down are the deliberate ones named in the
    escape-as-rare entry (spawn pacing / rent), chosen on purpose — not
    re-crippling the routing.
  - Six-seed 8-day service probe: **5/6 → 6/6 towns alive, 881 → 905 tourist
    serves, mean crew hunger 0.174 → 0.190** (crabs eat marginally later
    because they no longer make a special trip for it, but they eat).

  **Suite: 69/69**, four new `routes:` scenarios, all four verified RED on the
  pre-pass build:
  - `routes: a meal ON THE WAY to work, not a lap of the promenade` — builds
    the named symptom (hungry crab at home, shift ahead, shack on the way) and
    asserts BOTH the path order (never turns back toward home between the meal
    and work) and the distance (≤ 1.25 × the ideal home→shack→work walk).
  - `routes: a full town walks less per crab-day` — 4-crab arcade town, 5 days:
    was 4273px of x-travel per crab-day, now 3521; gate 4000.
  - `routes: furniture avoidance keeps warps + unsticks near zero` — same town:
    was 21 warps + 6 unsticks, now 0 + 2; gates 2 and 8.
  - `routes: both travel lanes are clear of every solid (tripwire)` — fails the
    day somebody parks a table or a counter on a travel lane, which is exactly
    how the town got into the all-day-bouncing state in the first place.

  **Re-pointings (3, each with its receipt written into the scenario):**
  1. `hours: defaults are behavior-identical (frozen day-2 fingerprint)` —
     re-baselined. Receipt: this pass deliberately moves where every crab
     walks, so every position and every downstream number moves, and the drift
     runs the right way on BOTH seeds — coins 159.7→198.7 and 208.4→218.3,
     rep 46.7→52.5 and 51.1→52.6, tourist rage 5→3 and 3→3, serves 37→38 and
     34→38 — and both fishers now actually FINISH the walk home by midnight
     (seed 1337's DRIFT used to be stranded at x1549 mid-promenade; he now
     sleeps at his cottage).
  2. `thirst: drink errand serviced end-to-end at a staffed juice bar` —
     the fixture, not the assertion. Routed commutes shifted its 750px
     cross-town walk by a few minutes and landed the crab on a full line,
     which legitimately bounces a local ("LINE'S TOO LONG") and left the
     wallet check measuring a settlement instead of a drink. The crab is now
     stood at the bar's door with the unclaimed tourist line cleared; the
     retail-pricing transaction under test is unchanged.
  3. `staff meals: closing crew cooks their own dinner, at retail` — the
     fixture parks the crab AT THE SHACK instead of at home, which is what
     "the closing crew" always meant. (Kept honest: an earlier draft of this
     pass ALSO gated the staff meal on standing at your own counter; measured
     6-seed, that starved crews whose kitchen goes dark — 5/6 towns alive vs
     6/6, mean hunger 0.233 vs 0.190 — so the gate was dropped and only the
     fixture moved.)

  **Devlog beat (organic, reproducible)**: seed 1337 (`node tools/headless.mjs
  --days 5 --seeds 1`), **PINCHY, day 3**. Before: clocks off at 21:10, walks
  1011px home to his lot at x520, arrives at 22:25 — and immediately turns
  round and walks 860px BACK to the shack grill at x1382 to cook himself
  dinner, getting there after midnight. After: he cooks it at the counter he
  was already standing at and makes exactly one walk home, in bed by 21:43.
  Shots: `shots/before-towel-counter.png`, `shots/after-towel-counter.png`,
  `shots/before-picnic-tables.png`, `shots/after-picnic-tables.png`,
  `shots/after-chained-trip.png`.

  **Left on the table** (measured, deliberately not taken): the boardwalk lane
  has only 2px of daylight under the front row because `FLOOR_MAX` is 168 and
  the counters' solid band ends at 166. A probe at `FLOOR_MAX` 170 with the
  boardwalk at 169 cut the residual deflection a further 25%, but that changes
  the walkable floor of the whole town (framing + the draw layer), which is
  outside a locomotion pass. Worth a look if the bouncing ever reads as
  "still too much".

- **Stop the table-bumping** (Matt: "crabs keep running into tables...
  too much. It's cute if it's just for like 10 minutes but all day? that's
  terrible"). Root cause is structural: routedStep travels exactly two
  lanes (y=147/168) chosen with NO furniture awareness, and solids are
  resolved REACTIVELY (walk into table → get pushed out) rather than
  avoided — so any table on/near a lane makes every passing trip a visible
  bounce, forever. Direction: proactive avoidance — make lane travel
  furniture-aware (pick the lane, or a brief detour-y within the lane
  band, that clears the solids ahead), or carve stable gap waypoints
  through the picnic area. Keep the occasional bump (charm), kill the
  constant plowing (terrible). PLUS Matt's last-resort valve: a crab that
  has been obstructed ~30 IN-GAME MINUTES cumulative on one trip gets a
  tiny warp — a few pixels, just past the blocker, ideally on a frame
  where they're behind furniture so it reads as squeezing through, maybe
  with an "EXCUSE ME" quip. (Different scale than the 1.5-real-second
  unstick watchdog: that breaks pins; this caps a trip's bounce budget.) Coordinates with the trip-chaining agent
  (same locomotion layer) — likely same worktree or immediately adjacent
  in the queue.
- **Route optimization / trip-chaining** (Matt: "folks are taking weird
  routes, like waking up, going to work, then going to the crab shack;
  folks should optimize their routes a bit!"). Crabs pick errands by
  need-priority alone and ignore geography — classic symptom: wake →
  commute to work → walk BACK past home to the shack for breakfast →
  return to work. Direction: trip-chaining, not TSP — next stop = best
  urgency/detour-cost ratio, eat en route when the shack lies along the
  commute, don't cross the town twice for chainable stops. Imperfection is
  charming; backtracking the full promenade before 9 AM is not. Behavior
  change only, but re-run the matrix: commute time is work time under the
  performance system, so saved claw-miles are recovered crab-hours —
  expect median drift like the unstick fix; document, don't tune away.
  AGENT SPAWNS after price-discovery lands (both touch errand dispatch;
  builds serialized).
- **Fish price discovery** (Matt, on the fishers-break-for-anything collapse:
  "we can't force folks to work like that! This is a sign that the price of
  fish is artificially low"). Directive: replace the lunch-and-thirst-only
  labor restriction with a PRICE mechanism — the restriction was a
  command-economy patch on a price problem. Design sketch:
  - Pier fish price FLOATS with scarcity (townCatch vs recent demand),
    bounded above by the $7 import price — the world price is the natural
    ceiling, which is the trade-horizon stub doing real economic work.
  - Fisher WAGES ARE ABOLISHED (Matt: "it's not a real thing. I've never
    heard of it before; they're always paid based on catch as free agents").
    The flat $13/day subsistence goes away entirely — a fisher's income is
    the catch sold at market price, full stop (keep the $2/catch
    housing-fund flow). Output = income: a scarce-fish day is a lucrative
    day and a lazy week is a hungry one, so free crabs return to the pier
    because it pays, not because they're forced. NOTE the safety valve
    already exists: a broke, hungry fisher roasts one of the catch — the
    driftwood fire is what makes zero-wage survivable at the bottom.
  - RESTORE full fisher freedom (breaks for fun too — self-employed means
    self-employed; "I'VE GOT MY OWN LIFE" applies to fishers most of all).
  - Job board already provides labor-supply response: fishing postings when
    price runs high pull drifters to the pier.
  - Watch for: price oscillation (hog cycle) in the sim; shack margin under
    floating input costs; interaction with the escape-as-rare baseline.
    Full matrix. First real price mechanism in the game — the doorway to T5
    exports (exports need prices to mean anything).
- ~~Fish price discovery~~ — **shipped (worktree, 2026-08-18)**, built to the
  directive (price mechanism replaces the labor restriction; fisher wages
  ABOLISHED outright per the follow-up — "they're always paid based on catch
  as free agents"). The game's first real price mechanism:
  - **Clearing rule** (`settleFishMarket`, once a day at midnight): 3-day
    windows of landings (`trade.landH`) vs fish eaten (`trade.useH` — local +
    shipped-in + beach roasts; an import IS unmet local demand). Demand
    outrunning landings by >1/day steps the price +$1; landings piling up
    >2/day past demand steps it −$1. Band $2 (floor) to $7 (FISH_IMPORT —
    at the ceiling the world market supplies and imports still charge a flat
    $7, so local can never exceed world). Starts at the classic $4.
    FISH_LOCAL is gone; `ingredientCost` charges `trade.price` while the
    pier has fish.
  - **Money flow**: the market-stall abstraction buys every landed fish at
    `trade.price` (fisher wallet credit at the splash — no wage, no floor,
    no housing stipend) and sells to any fish-consuming kitchen at the same
    price via ingredientCost. Its fee is absorbing spoilage (fish paid for
    that rot at the 4-crate midnight clamp) and the fishers' own roasts;
    injection is bounded by price x (landed − eaten), self-damping because a
    glut is exactly when the price is at the floor. Consumers pay $13-16
    retail > $7 max fisher take per fish: no infinite loop.
  - **Full fisher freedom** restored: the pressing-needs gate is deleted; a
    fisher breaks for ANY need. The price pulls them back: (1) fun breaks
    are skipped at price >= $6 (one comparison; hunger/thirst always walk)
    with the "THE WATER'S MONEY TODAY" quip, once a day; (2) a WORKING
    fisher's lunch is the roast — eating a $2-7 fish on the spot beats a
    $15 town lunch plus hours of walking at any price, and it's the safety
    valve that makes zero-wage glut weeks survivable (never the town's last
    2 fish, unchanged); (3) `afterErrand()` sends a mid-shift fisher
    straight back to the rail — the old errand→home→pier odyssey (~3000px)
    was the measured cause of the original supply collapse.
  - **Labor answers price both ways**: a job-board posting only tempts a
    fisher while the wage beats ~5 fish at market (ties go to the steady
    paycheck, so the flush-SUDSY hire still works at launch prices); a
    price pinned at the ceiling a full day posts HELP WANTED: THE PIER,
    and a day unfilled pulls a drifter off the bus (fishSpotFor() grows
    the rail past 3 spots, 14px per wrap).
  - **UI**: notice-board trade card gains PIER FISH PRICE + a 30-clearing
    sparkline (green in-band, orange at ceiling); catches pop "CATCH! +$N".
    Price/series/windows/ceilDays roundtrip save/load; old saves open $4.
  - **Stability measured** (8 solvent seeds x 30d): band held 2-7 on every
    seed, $1 max daily step by construction, mean price 4.4-5.7; full
    floor-to-ceiling traverses after day 5: 0-2 per seed in 3.6 weeks
    (bound asked: <= ~2/WEEK). The hog cycle exists but swells over
    ~10-14 days, damped by the 3-day window + $1 steps + drifter entry.
  - **Balance measured**: baseline 30d x 8: 0/8, evictions 8,8,8,9,9,10,
    10,11, median 9 (was median 10 — one inside the ±2 band); growth
    chef,table: 0/8, 7,8,8,9,10,10,10,15, median 10 (unchanged, and a new
    day-15 tail). Growth towns DO get squeezed by design (scarcity pins
    their price at $7; the suite growth floor recalibrated 6,7,9,13 →
    7,7,8,9 on its own seeds). Fisher income 1.7-5.4x the old $2/catch
    (avg $4.2-5.7/fish); both founding fishers house themselves at day-2
    settlement now (was day 5-8 or never); SUDSY's take dips ~10% (fishers
    hold the pier more). Suite 59/59 — re-pointing: boat scenario pins
    thirst, tired scenario pins SALTY to a cot, growth floor above; 6 new
    fish-market scenarios (ceiling+imports, glut+pay, opportunity cost,
    15-day band, save/load, roast-carried glut week).
  - **Devlog beat (organic)**: seed 6685, arcade-town (coins 3000, arcade +
    2 chefs day 1), day 9 ~9:56 — SALTY, bored 0.8, wallet $16, price $7,
    skips the arcade for the rail: THE WATER'S MONEY TODAY. Shots:
    fish-price-trade-card, fish-price-ceiling-posting, waters-money-today,
    catch-at-market-price under shots/.

- ~~Tiredness replaces sandiness~~ — **built (worktree branch, 2026-08-18),
  after the T2 merge as sequenced**: `p.sandy` renamed `p.tired` with save
  migration (old sandy seeds tired, crew + townsfolk paths, nothing strands).
  Accrual: +0.45 shift end, +0.05 nightly ONLY on days worked (workedToday
  flag; fishers/NPCs/owners identical — equality directive), +0.03 per
  errand, nothing from idling. SLEEP repairs it: proportional drain while
  bedded down at night — own bed (house/boat) 0.5/game-hour, shelter cot
  half that. Same-schedule contrast from 0.8: housed wakes 0.037, cot 0.213
  (suite-pinned); organic 4-seed steady state: housed wake med ~0.07,
  evening peak med ~0.59 (SUDSY's arcade nights pin her at 1.0 — she sleeps
  4.5h). Showers are DIRT-ONLY (needsBath drops the sandy term, errand files
  under clean, stall no longer resets sandy); SUDSY's economy holds — dirt
  alone keeps her stalls busy (449 vs 453 showers / 4x20d). Sickness: tired
  ≥ 0.95 → +0.05 (was sandy +0.03), blamed "exhaustion"; T2's thirst
  coupling rewired to tired > 0.5 checked PRE-bump at shift end (same firing
  rate as the sandy original); tip-fumble term follows the rename at 0.85
  (evenings routinely reach the old 0.66). Deliberately NO crabEff tired
  term — a future loosening with its own matrix run. UI: ZZZ bar on the
  follow card (both canvas modes), RESTED in the dossier, EXHAUSTED mood at
  0.85, DEAD ON MY FEET quips; the old darkness "TIRED" mood renamed UP
  LATE. Measured: baseline 16 seeds 11-23 med 15 (was 10-21 med 14), 8
  seeds 11-23 med 15 (was 10-16 med 13) — runway eases ~1-2 days because
  crew keep the shower money sandy forced out while sleep is free; growth
  chef,table 1/6 escapes, same eviction days. Suite 44/44.
- **Per-owner everything; all crabs equal** (Matt 2026-08-18): "no public
  utilities, no town payroll — per-owner … all crabs should be equal in the
  simulation, they just start with different stuff." Language pass done
  (job-board card now reads WHO WORKS FOR WHOM, PAID BY <owner>). **Brick
  laid 2026-08-18 — hiring-as-recruitment**: a hire is no longer minted
  with a free house; a tourist, a drifter and a new hire all enter the sim
  the same way (homeless at the shelter, climbing on wages), and a tourist
  can now BECOME a crab (conversion keeps their name/shell/accessory) —
  founders differ only in starting stuff (they open housed in lots 0/1,
  sanctioned). Still unequal after this pass: NPCs CANNOT die (crew can);
  NPC_WAGE 20 vs CRAB_WAGE 23; tourists while merely visiting remain a
  separate entity class (no needs/wallet/trait until converted). Direction:
  one simulation contract for every crab, differing only in starting
  assets/relationships.
- ~~Click-to-nav + right-click redirect~~ — **shipped 2026-08-18** (see the
  "Right-click orders" systems bullet). Suite 41/41 (scripted-redirect
  round trip + a deterministic still-vs-mover pin the watchdog must beat —
  verified the pin reproduces with the watchdog disabled). Balance: 8-seed
  baseline 0/8 both, evictions 10-19 med 13 -> 9-19 med 15 — inside the
  documented per-build wobble, direction consistent with fewer lost
  crab-hours; no price tuning. Later loosenings if wanted: townsfolk orders,
  touch gesture, a real context menu.

- **Line of credit** — **built (worktree branch, 2026-08-18), tight landing**:
  all knobs in game.js CREDIT_CFG (LIMIT 120 ~ half a night's shack rent,
  RATE 0.25/night compounding, MIN_PAY 80 auto-collected). Rent shortfalls
  draw on the line via one settlement hook (settleCreditLine, pure math shared
  by player + NPC + forecaster); exhausted line + missed obligations =
  BANKRUPT (the new game-over; NPC owners instead go dark 2 nights, debt
  written off). Bankruptcy prediction: forecastBankruptcy() replays upcoming
  settlements at the day-ledger run rate (pessimistic min(3-day avg, latest));
  chip at horizon <= 5 days, toast at <= 3. Measured 30d x 8 seeds: baseline
  median 12 (8-16) -> 13 (10-19), 0/8 both; toast lead >= 2 days in 7/8
  doomed seeds, chip lead >= 3 in 8/8. Suite 37/37 (4 new credit scenarios).
  Loosening stays stepwise per the original spec below.
- *(original spec)* **Line of credit** (Matt): business owners (player and NPC alike) can take
  a default *compounding* line of credit at a standard rate (rate is a play
  knob, tuned later). Deliberately SHORT — small limit, quick repayment.
  **Missing a loan payment = bankrupt** (this replaces/absorbs the current
  miss-rent-and-die: rent shortfalls draw on credit, so the loan becomes the
  real cliff). Must include **bankruptcy prediction**: project till + income
  rate against upcoming bills + debt service and show the player a warning
  IN ADVANCE of the cliff (the headless buyer's reserve math — cost +
  tonight's bill + cushion — is the seed of the predictor). Rollout knob:
  start financing so tight it's barely different from today's curve
  (measured — the landing commit should be near-inert like T1), then loosen
  release by release until it's fun. Balance-critical: eviction-day metrics
  are THE baseline stat, so every loosening step needs its own matrix run.
- ~~REMOVE the laundry mechanic~~ — **shipped 2026-08-18** (Matt: "not
  natural in any way now that we have showers"). SUDS N BUBBLES is gone:
  BIZ/UPS/busy entries, recipes, towel/uniform items, washer/dryer/basket
  art, the merge-mode laundry chain, the intro lease line, the tourist
  weight, the wash-cycle water flow. CLN servicing folded into showers —
  pickErrand sends a grubby crab to the taps at dirt ≥ 0.66 (the old
  cleaners threshold; a shower's −0.5/−0.7 keeps dirt below the sickness
  "cared" line). Shop grid: _biz1 is now arcade/cadegear; the vacated slot
  is EMPTY until the **juice bar lands with T2 thirst** (next pass, which
  also owns the retune). Save migration: stale lv keys ignored, stale job
  "cleaners" clamps before any BIZ deref (crew → shack, npc → pier), an
  owned laundromat refunds $400 (+$150 sudsgear) exactly once via a
  persisted sudsRefund flag. Measured: the eviction curve is BIT-IDENTICAL
  before/after (0/8, evictions 8-16, median 12; growth 0/6, 8-12, median
  11) — dirt accrues in 0.25 steps and showers subtract 0.5/0.7, so no
  crab ever organically landed in the old 0.66-0.75 gap; the fold is a
  safety net, not a curve change. Suite 35/35.
- ~~**Overtime**~~ — **shipped 2026-08-18** inside the labor policy suite
  (1.5x premium, needs cost via the existing accrual, dossier + SCHEDULE
  controls, coffee-cup powerup + follow-card/dossier tags). Original spec:
- **Overtime**: the player can request a crew crab work overtime for extra
  pay. Design seams: shifts already exist (shift D/N on personas), wage is a
  constant (22) paid at settlement — overtime = staying past shift end at a
  premium rate (say 1.5x), at a needs/health cost so it's a real trade-off
  (tired crabs get dirty/hungry/sick faster — the stats→performance work
  slots straight in here). Control could live in the dossier next to
  TAP: REASSIGN. Balance-moving → needs the headless matrix; sequence it
  after T1 with the other economy stages. **Visible OT powerup**: a crab on
  overtime must be readable at a glance to everyone — a little powerup
  marker on the sprite (think coffee-cup / lightning bolt over the shell,
  same family as the merge-mode thought bubble), plus an OT tag on the
  follow card / dossier.

## Conventions
- **Devlog** (DEVLOG.md + devlog/img/, owned by the coordinator session):
  patch-notes-as-little-stories in the Minecraft-notes voice — bugs and
  features framed as things that happened to the town. Each entry carries
  lots of screenshots (playwright driver in the coordinator's scratchpad;
  serve on :8931, arrow keys pan the cam 24px/press) and a "Tales from the
  sim" section narrated from a seeded headless run. **Editorial rule from
  Matt: keep the focus on INDIVIDUAL crabs — named crabs doing specific
  things beat aggregate stats for stories.** Build sessions: ping the
  coordinator after merge batches so entries stay current.
- Suite green before push; economy changes need a matrix re-run.
- Big features → fork subagents in git worktrees (they don't push; the parent
  reviews screenshots + suite output, merges, re-verifies, pushes).
- Balance work happens in the sim, not by intuition — measure, then tune.
