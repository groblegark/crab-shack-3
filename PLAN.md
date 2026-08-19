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
  The registry GROWS: `BIZ[k].owner` is a key into it, `null` means nobody
  owns the lot (closed, on the market), and a crab who buys a business gets a
  new entry. Owner changes, one owner with several businesses (one till,
  strikes counted per lease) and an owner with none all fall out of that.
- **Business failure, FOR SALE and succession** (`SALE_CFG` + the
  `business failure & succession` block in game.js): a peer owner who misses
  three settlements in a row CLOSES - shutters and a priced FOR SALE sign in
  the world, no tourists, no errands, staff and owner-operator laid off to the
  pier. Any crab with the savings buys it (the player through the shopfront's
  BUY chip); a new NPC owner runs the same policy tables, because those tables
  key on the BUSINESS. See the feature entry below for the numbers.
- **Crabs**: personas (name, trait, commute mode, accessory, shift, wallet,
  house), needs FED/THIRST/CLN/FUN/SPA, homes they live inside, the shelter for the
  homeless, disease + contagion + death with beach memorials. **Every crab is
  mortal** (2026-08-19) - crew and townsfolk alike, off the same care ladder;
  the roll arms on day 4 of NEGLECT, day 7 of anything better.
- **Needs that fail in their own character** (2026-08-19): boredom **DRIFTS**
  and tiredness **STALLS**, instead of both quietly shaving crabEff. A bored
  crab on shift leaves its post for the tide line or the arcade window and has
  to walk back when an order lands; past 0.95 for four settlements it takes an
  unauthorised, unpaid day nobody covers. An exhausted crab nods off mid-task
  while HOLDING the station slot, and past 0.97 may not make it home at all -
  and sleeping rough banks no repair, so exhaustion prevents its own cure.
  Boredom's only two cures are the ARCADE (money) and a CONVERSATION (time);
  there is no free-fun venue and no solo cure, by the owner's ruling. Landing
  with it: **sleep got expensive** - a shift costs 0.60, tiredness accrues
  THROUGH the shift rather than in a lump at knock-off, and the shelter cot
  barely rests you (one night from 0.80 leaves 0.06 in your own bed, 0.33 on a
  cot, 0.80 on the sand). The housing ladder now decides who nods off at the
  grill. See the feature entry below for every number and the attribution table.
- **Public taps** (`WATER_TAPS`, 2026-08-19): two free standpipes, promenade
  (x640) and pier head (x1844). No queue, no staff, no till, no hours - the
  floor under every crab's thirst, plus a cold rinse for a crab the showers
  cannot serve. Pitched ABOVE the drink errand's threshold so the juice bar
  keeps first refusal (see the public-taps entry for the numbers).
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
  Esc closes. Works for every crab, crew and townsfolk alike. **Two pages
  since 2026-08-19** (PROFILE | DIARY) with a bottom control bar carrying
  FOLLOW and CLOSE — see THE CRAB DIARY below.
- **THE CRAB DIARY** (`crabLog` + the DIARY page, 2026-08-19): every crab —
  crew, townsfolk, owner-operators, fishers, drifters — keeps a bounded ring
  buffer of what it DID, in the game's voice, on its persona (so it saves).
  40 entries, oldest dropped, `[day, minute, category, line]`. One call at
  each event site; nothing runs per tick.
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
- `node tools/suite.mjs` — **107 scenarios, must stay green before any push.**
- `node tools/suite.mjs` — **103 scenarios, must stay green before any push.**

- `node tools/suite.mjs` — **87 scenarios, must stay green before any push.**
- `node tools/illness.mjs [--seeds N] [--days D] [--quiet]` — illness-duration
  distributions per housing tier. Paired arms per seed: the care ladder live
  vs collapsed back onto the pre-seam CARED odds *inside the same build*, plus
  a RUNG arm (a housed crab rolled at cot odds) that isolates the housing rung
  on an identical RNG stream. This is where the cared-seam numbers in the
  labor-policy bullet come from.

- `node tools/suite.mjs` — **87 scenarios, must stay green before any push.**
- (count above is the live one; the two older figures in this file are historic.)

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
  migration, the needs-failure gates (the trudge's curve + scaling + the
  shimmer's mean-neutrality, the anti-spiral paired arms, the wide berth's
  separation + declined table + sit-anyway out, and a filthy crab wedging
  nobody in a crowded shack).
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
  Plus business failure & succession: the three-strike closure (layoffs, no
  tourists, no errands, no takings), a saved-up crab buying the shop and
  trading again under the new owner's policies, the player's shopfront buy
  path end to end, a 20-day closure soak with nobody able to afford it, and
  the ownership + FOR SALE market save/load roundtrip.

- `node tools/headless.mjs --days N --seeds K [--buy list] [--quiet]
  [--jobs J] [--failoff a,b,c]` — CLI; `--failoff` switches individual
  needs-failure behaviours off (`wander,chat,walkout,nod,rough`) so a matrix can
  attribute its own movement to one of them at a time; `--jobs` fans seeds out across worker processes
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
- **THE CRAB DIARY — a per-crab activity log, and the record that shows it**
  (Matt's directive, built 2026-08-19, worktree: *"We need a detail view of
  the character where we can see all of their recent actions, because that is
  awesome."* Plus two owner additions mid-build: *"should also keep track of
  housing status carefully"* and *"there should be a button in the detail view
  to follow that crab too."*)
  - **ONE API, ONE LINE PER HOOK.** `crabLog(crab, category, line[, gapMins])`
    appends to `c.p.log`, a ring buffer of `LOG_MAX` **40** entries stored as
    `[day, minute, category, line]` ARRAYS (~46 bytes an entry; the same fields
    keyed would cost ~40% more). `crabLogEvery(crab, slot, mins, cat, line)` is
    the door for a whole CLASS of line that would otherwise spam — a chef's
    plates all read differently, so text-dedup cannot catch them. Categories
    (and their colours): **work / money / home / need / life / peril /
    social** — `social` is deliberately empty and reserved for the
    boredom-and-chatting build landing beside this one, so those behaviours
    are literally one line each after the merge.
  - **THE RULE OF THUMB, enforced by the suite**: an entry is something a
    player would tell a friend about. "SERVED A FISH TACO TO MISTY", never
    "state changed to errand". Every hook sits at an event that already
    happens once; repetitive events carry a minimum gap in GAME MINUTES —
    serves 25min (a rush hour reads as a few named plates), clock-in 720min
    (a fisher who breaks for lunch walks back to the rail three times and only
    the first is news), house rent 600min, stall scrubs 90min. A fishing day
    is TALLIED and filed as ONE line at dusk ("LANDED 9 FISH OFF THE PIER");
    only THE BIG ONE gets its own entry.
  - **What is logged**: clock in / shift end (+ OT hours) / named serves /
    stall scrubs; wages drawn, unpaid nights, house rent, a business bought;
    meals, drinks (bought vs the free tap), showers, standpipe rinses, beach
    roasts, staff meals; going to bed hungry / parched / filthy / dead on
    their feet (a THRESHOLD at settlement, never a tick); falling ill with the
    reason, laid-up days, recovery, gravely ill, and death as the last entry;
    hired off the bus or converted from a tourist, job-board hires, quitting
    when the till is empty, layoffs (an owner-operator's reads "LOST THE SUDS
    SHOWERS - SHUTTERS UP"), day off, sick day, mastery and fishing tiers, and
    giving up on a queue. **Deliberately NOT logged**: taking a station per
    dish (fires several times per plate — the exact tick-level trace the rule
    forbids; the shift's clock-in carries the workplace instead) and anything
    else per-tick.
  - **HOUSING IS THE SPINE** (the owner's addition). Every move is a first-
    class `home` entry that NAMES the place and what it cost — "MOVED INTO
    HOUSE 3 - $35", "MOVED ABOARD THE PEARL - $75", "MOVED TO A BEACH COTTAGE
    - CLOSER TO WORK", "TOOK A COT AT THE SHELTER" (the first night of a
    spell, never the twentieth), and the one that turns a run,
    **"COULDN'T MAKE RENT - LOST THE HOUSE"**. The diary page also carries a
    compact history that survives the buffer rolling over: a **trail**
    (`p.homeTrail`, last 4 addresses, "SHELTER > HOUSE 5 > COTTAGE") and a
    **nights tally** (`p.nHome` / `p.nCot`, red when the cots are winning) with
    "HERE SINCE D12". You can open a crab and see whether the life is going up
    or down without reading a line.
  - **THE VIEW** — the dossier grew a page, not a new screen. A bottom control
    bar (PROFILE | DIARY n | FOLLOW | CLOSE, 13px chips) on the same
    ONE-geometry-table idiom as `manageRects`: `dossierRects(h)` feeds both the
    draw and the hit-test, so tap targets can't drift from pixels. The card
    lives in rows 0..PANEL_Y, which is the world area in BOTH canvas modes, so
    240 and 288 get the identical record (shot in both). The DIARY page:
    housing banner, then the timeline newest-first, 12 rows a page, coloured by
    category, `<` `>` paging. Reached from the follow card, the crew cards and
    the census row — the same three doors the dossier always had.
  - **FOLLOW** (the owner's second addition): selection and camera are
    deliberately separate in this game, so the button sets BOTH (`followCrab`
    → `sel` + `followIdx`/`followNpc`/`followCust`) and closes the record —
    and the management card under it — so you can actually watch them. It
    reads **FOLLOWING**, dimmed, when the camera is already on that crab, and
    it works for a tourist too (they are customer objects, not crabs).
    Verified in the browser: FOLLOW from a census-reached record leaves
    `sel`/`followNpc` on that crab and `camX` converges to exactly
    `crab.x - W/2 + 8`.
  - **The price of the page**: the profile's five stacked need bars became ONE
    row of five (the follow card's idiom) to pay for the 18px control bar —
    same numbers, shorter meters — and CLAIMS TO FAME steps aside on the one
    crab that can't fit it (gravely ill + resting + PACE + WALK all at once).
  - **Measured — save**: a 9-crab town, day 13, every founder's buffer full:
    **5,169 B → 18,587 B (+13,418)**. 12,730 of that is diary, 46.1 B an entry.
    It is bounded by construction (crabs x 40 x ~46B): a maxed 14-crab town is
    ~26 KB a slot, ~130 KB across all five, against localStorage's ~5 MB. Old
    saves carry no log and start writing one; `clampLog` filters junk and
    re-caps on load, on both the crew and the townsfolk paths.
  - **Measured — perf**: it writes on events, never per tick. 3 seeds x 20
    days, before vs after, two runs each: **11.23s / 11.59s before, 11.53s /
    11.47s after** — 26.0-26.8 us/frame in both arms, i.e. inside run-to-run
    noise. The only per-tick addition anywhere is one `c.logOff !== day`
    comparison for the day-off line.
  - **BEHAVIOUR-NEUTRAL, and the tripwire agrees**: no RNG, no sim state read
    back, nothing but bookkeeping. `hours: defaults are behavior-identical
    (frozen day-2 fingerprint)` passes **UNTOUCHED - no re-baseline**, and so
    does every other existing scenario. **Suite 102 -> 107**, five new:
    `diary: a day in a full town reads as a life, not a trace` (all three kinds
    of crab, categories present, no duplicate inside its window, no day over 26
    entries, one catch line a day, every line inside the card's 39 columns),
    `diary: it roundtrips save/load and stays bounded over many days` (exact
    log + trail + tally roundtrip, bounded after the reload, and a
    diary-stripped OLD save that opens clean and starts writing), `diary: the
    last entry is the death, and the memorial still works`, `diary: the ring
    buffer never grows past its cap under a soak` (24 days, somebody must
    actually FILL it or the soak isn't testing anything, entries stay ordered),
    and `diary: housing is the spine - every move is written down by name`.
  - **Story beat (organic, seed 11, browser)**: SHELLDON's page, day 17.
    "D16 09:30 TOOK THEIR DAY OFF / D16 13:54 TOOK A SHOWER AT THE SUDS SHOWERS
    / **D16 20:00 COULDN'T MAKE RENT - LOST THE HOUSE** / D17 07:09 CLOCKED IN
    AT THE CRAB SHACK" and then eight named plates through to 16:30 — a crab
    who lost his house on his day off and worked a full shift the next morning,
    with the housing banner over it reading "SHELTER > HOUSE 3 > SHELTER, 10
    NIGHTS HOUSED, 6 ON A COT". Shots: `diary-crew`, `diary-crew-tall`,
    `diary-sudsy`, `diary-sudsy-tall`, `diary-from-census`,
    `diary-follow-from-record`, `diary-profile-tabs`, `diary-profile-crowded`
    under shots/.
- **Needs fail in their own character: THE TRUDGE and THE WIDE BERTH** (built
  2026-08-19, worktree — realizes `design/needs-failure-patterns.md` for three
  of the five needs, to Matt's pick, verbatim: *"Dirt boredom and tiredness are
  good; hunger and thirst should just be a speed penalty."* The doc's RAID
  (H1) and SHORT LEASH (T1) are therefore **rejected and not built**, and so
  is D2, the smudge trail, which the doc holds back and the owner did not
  pick.)
  - **HUNGER AND THIRST ARE A SPEED PENALTY — one shape, two needs.** A linear
    ramp to **−25% at a pinned 1.00**, so the player watches a crab FLAG rather
    than a switch flip. Each ramp starts where that need already cost the town
    something, which is why the thresholds differ and the slope does not:
    **hunger from 0.30** (crabEff's own hunger line — past 0.30 it already
    slowed prep; now it slows pace too) and **thirst from 0.50**, pitched so
    the ramp passes through **exactly 0.85 at thirst 0.80** — the same value
    as the −15% cliff it replaces, at the same threshold. **The cliff is
    deleted**; nothing about the T2 balance point was moved on the way past.
  - **THE ANTI-SPIRAL GUARD is a FLOOR plus an EXEMPTION.** Hunger already
    drags prep through `crabEff` and both needs already feed the nightly
    sickness roll, so the two ramps MULTIPLY but are floored at
    **`DRAG_FLOOR` 0.70** — starving *and* parched is −30%, never −44%. And a
    crab is **never slowed on the walk to the thing that would fix it**
    (`selfCareNeed`: the tap, the counter, their own kitchen — the need being
    fixed is the only ramp switched off). That is THE SELF-HEALING RULE read
    straight, and it is the doc's own guard on the rejected leash ("the leash
    exempts water") carried across to the penalty that replaced it. It also
    makes the fix legible: the moment a starving crab decides to eat, it picks
    its feet up.
  - **HEAT SHIMMER** (the doc's T2, shipped as the free companion it was
    pitched as): a parched crab LURCHES rather than walking uniformly slow — a
    sine about 1.0 keyed to `time` and the crab's own `animT`, so it is
    **mean-preserving by construction** and costs nothing mechanically (suite
    -asserted: two minutes of parched walking with and without it land within
    2%). It never reaches zero either, so a panting crab still counts as a
    MOVER to `collide()` and still clears the no-progress watchdog.
  - **DIRT IS THE WIDE BERTH (doc D1).** `crabBerth` opens a crab's personal
    space from the collider's **12px to 22px** on a ramp from dirt **0.60**
    (crabEff's dirt line) to 1.00. Three deliberate shapes, and all three are
    wedge guards rather than taste: it is **asymmetric** (only the CLEANER crab
    gives ground, so the filthy crab is never pushed and can always reach its
    station, its queue or its cot); the ground is given **sideways in Y**, and
    **backwards in X only by a crab that is standing still** (a still crab has
    no forward progress to lose, which is the same still-vs-mover distinction
    the core collider already makes, so the 1.5s watchdog can never read the
    bubble as a pin); and it **adds to** the core 12px physics rather than
    replacing any of it, so ordinary crab traffic is byte-for-byte what it was.
    It has to run *inside* 12px as well as outside — the core push shrinks to
    nothing as it approaches 12, so a pair resting AT the old radius would
    otherwise never enter the bubble's range (measured: three crabs in a staged
    huddle sat at exactly 12px and never got the berth). **Suppressed at home
    and after dark** — four crabs on shelter cots cannot each have two
    body-widths, and this is a boardwalk read.
  - **The town's other two refusals.** A tourist **will not sit at the table
    beside a visibly filthy crab** (`SHUN_AT` 0.80, a 26px ellipse — geometry,
    not taste: the shack's tables sit 40px apart across and 24px back-to-front,
    so a wider radius would shun the whole dining room and turn the refusal
    into a no-op). **There is always an out, and the out is THEY SIT ANYWAY**:
    if every free table has a filthy crab beside it the guest takes the first
    one rather than standing, so filth can never deadlock the dining room. (The
    alternatives — queue, or walk out — were rejected because seating is the one
    place a refusal could strand a paying guest for good.) Their **own** server
    never counts as "the crab at the next table" — a filthy server is already
    charged for through the tip and through the patience drain. **Patience**:
    a tourist served by a filthy crab burns it up to **30% faster**, on the same
    0.60→1.00 ramp the bubble opens on. Locals are colleagues and are not fussy.
    The doc's REP clause is deliberately NOT built (the doc itself says ship it
    dark and turn it on in a second measured pass).
  - **Legibility.** A two-frame `STINK_MARK` (wavy lines) bobs over any crab
    whose bubble is open, so the empty boardwalk has a cause at a glance; the
    follow card gets a **RANK** mood; and the dossier gets a **WALK** row next
    to PACE — "TRUDGING AT 70% — HUNGRY, PARCHED" — so the number and the reason
    are both on the record.
  - **Measured, illness and death** (12 solvent towns × 30 days, the shape the
    mortality work used), before → after:
    | | before | after |
    |---|---|---|
    | deaths | 11 (0.92/town) | **9 (0.75/town)** |
    | lane | 11/11 NEGLECT | 9/9 NEGLECT |
    | crew / townsfolk | 0 / 11 | 0 / 9 |
    | infections | 51 | **37** |
    | causes | hunger 12, thirst 16, dirt 28, contagion 11 | hunger 13, thirst 18, dirt 19, contagion 5 |
    The anti-spiral gate is met with room: **the trudge does not kill anybody**.
    Paired arms inside the same build (`window._noNeedDrag`) agree — with the
    ramps collapsed the same 12 towns read 13 deaths and 54 infections, i.e. the
    signal is noise at ~1 death per town, and the shipped build is on the low
    side of it either way.
  - **Measured, no wedge.** This was the named risk — an inflated collision
    radius is exactly the thing that could make crabs bounce off each other
    forever — and it is the reason the berth is asymmetric, sideways, and
    additive. The routing pass's own busy town (arcade + 4 crew, 5 days),
    widened to **three** towns because one town's sidestep count swings ±2 on
    stream order alone: **0 warps + 17 unsticks before → 0 warps + 18 after**,
    i.e. one extra sidestep in fifteen busy town-days. Across the 12 solvent
    towns × 30d: warps **0 → 5**, unsticks **237 → 266** over 360 town-days —
    0.014 warps and 0.74 sidesteps a town-day, inside PLAN's documented
    "~1-2x/day town-wide". The suite gate runs the crowded shack with a crab
    **pinned filthy all week** against a `window._noBerth` paired arm.
  - **Balance**: baseline 16 × 30d **0/16**, evictions 11,12,13,13,13,13,13,
    14,14,14,14,14,14,14,14,20, **median 14** (before 0/16, 11–20, median 15 —
    the documented per-build day of wobble). Growth `--buy chef,table` 8 × 40d
    **6/8 alive**, 11,14,41,41,41,41,41,41 — **byte-identical to before**.
    **One number was tuned, and it was one of ours**: with the hunger ramp
    starting at 0.5 the do-nothing town came out RICHER than the pillar allows
    (2 of 16 surviving 30 days, median 14) because the self-care exemption
    makes the trips that matter for health *faster* than the pre-merge build
    — the same mechanism the public tap moved the curve by. `DRAG_HUNGER_AT`
    0.5 → **0.3** restored 0/16 and left growth untouched. No price, wage or
    rent was touched.
  - **Suite 98 → 102.** New: `trudge: hunger and thirst are a speed penalty,
    and it SCALES` (the curve, a two-minute walk-distance integration, the
    shimmer's mean-neutrality, and a real commute that finishes measurably
    later when starved), `trudge: the speed penalty does not kill anybody
    (anti-spiral gate)` (paired arms over 6 solvent towns × 30d), `dirt: THE
    WIDE BERTH` (the ramp, the separation, that the FILTHY crab is never the
    one pushed, that the bubble is suppressed indoors, the declined table, the
    sit-anyway out, and the patience multiplier), and `dirt: a filthy crab in
    a crowded shack wedges nobody` (warps/unsticks against a `_noBerth` arm).
    **Re-pointings (4, receipts written into the scenarios):**
    1. `hours: defaults are behavior-identical (frozen day-2 fingerprint)` —
       re-baselined, because `crabMove` itself changed and SUDSY ends day 2 at
       hunger 0.70 / thirst 0.50 in both seeds. Receipt: on seed 4242 **every
       position is byte-identical** (all five crabs asleep in the same beds)
       and the books give a little back (coins 214.01 → 200.80, serves 39 → 37)
       — which is what a throughput cost looks like; on seed 1337 exactly one
       crab moves, SALTY sleeping on a shelter cot instead of in house 7,
       a day behind on the housing ladder rather than stranded.
    2. `taps: nobody in a full town is left parched for a week` — a
       **measurement bug**, not a loosened gate. `perDay` was each crab's OWN
       sample count / 10, so a drifter who steps off the bus on day 8 and is
       thirsty from arrival divides two real days by 0.2 samples-per-day and
       scores "10.0 days without a drink". Latent (it needs a late, thirsty,
       short-lived arrival) and this build's stream produced four of them.
       Normalised on the TOWN's sample rate the same three seeds read a worst
       dry spell of **3.1 days here and 2.6 days on the pre-merge build**.
       Recorded honestly alongside it: the worst crab's time on the 0.95
       dehydration line went **~7% → 18.7%** of its life (SUDSY, seed 17, a
       ten-hour owner-operator day). That is the trudge's price, it sits under
       the 25% gate, and it does not reach the mortality — same matrix, fewer
       infections and fewer deaths.
    3. `routes: furniture avoidance keeps warps + unsticks near zero` —
       **widened from one town to three**, which is a stricter gate, not a
       looser one. Receipt: its own comment still claimed "0 + 2", but the
       PRE-MERGE tree measured **0 + 7 against a gate of 8**, so it had
       quietly become a coin flip that the next merge in either direction was
       going to trip. Paired arms inside the needs build read 5, 7 and 9 on
       that single town with identical code. Three towns read 0 + 17 before
       and 0 + 18 after.
    4. `cpu hours: SUDSY's policy converges and never thrashes` — the FIXTURE,
       for the third time and the same reason. It already props SUDSY's TILL
       because a bankrupt shop cannot demonstrate 30 days of hours policy;
       seed 1337's SUDSY now **dies on day 15** of a seven-day neglect illness
       (an owner-operator on a ten-hour day is the crab the trudge is hardest
       on), her lease sweeps onto the market, and `runHoursPolicy` rightly
       declines to run for a business nobody owns. So the fixture props her
       health as well: she still falls ill and still takes her own sick days,
       the tide just doesn't take her. Not a hidden regression — the 12-town
       matrix has SUDSY taken in **3 of 12 towns before and 3 of 12 after**,
       with the total down 11 → 9.
  - **Story beat (organic, reproducible)**: `node tools/headless.mjs --days 12
    --seeds 1` — seed 1337, no buys, no props, the town still standing on day
    13. **SUDSY spends day 4 walking at the 0.70 floor for one hundred percent
    of the day**, pinned at hunger 1.00 / thirst 1.00 / dirt 1.00, with the
    wide berth open around her every minute of it: the slowest crab in town
    and the only one nobody will stand next to. Day 5 the same. Then day 6 she
    eats and drinks — peaks fall to 0.33 / 0.46 — and **the trudge vanishes
    while the bubble stays**: day 7 she walks at 96% and is *still* given a
    wide berth for the whole day, because her dirt is 0.80 and dirt is a
    different failure. That is the thesis in one working day. Day 9 she
    relapses to 1.00 / 1.00 / 0.90, trudges at 75% for most of it, and falls
    ill; days 10–12 she convalesces, needs nursed down to 0.10–0.30, pace back
    to 100%, and by day 11 the boardwalk closes back around her.
    Shots: `trudge-race` (a fed crab and a starving one, same trait, level
    start, 86px apart six seconds later), `trudge-dossier` (PACE and the new
    WALK row together), `berth-clean` / `berth-filthy` (eight crabs shoulder to
    shoulder, then the line breaking open around the one with stink lines over
    her head) under shots/.
- See also **NEEDS THAT FAIL IN THEIR OWN CHARACTER** (its own section below
  the public-taps entry): boredom's drift and tiredness's stall, 2026-08-19.
- **Business failure, FOR SALE and succession** (Matt's fault report, built
  2026-08-19, worktree — a directed build during the closing act, not a new
  front): *"sudsy goes bankrupt every day.. the shop needs to close till some
  crab can buy it then, rite?"* He was right, and it measured: seed 7 kept
  alive 12 days, SUDSY's till sat at $0 for **1861 of 4215 sampled ticks**
  and her shop spent **781 ticks DARK**, bankrupt twice, debt written off each
  time. A zombie: a permanently half-shuttered shower house and nothing ever
  changed.
  - **FAILURE is the credit machinery, not a new rule.** `settleCreditLine`
    now REPORTS `missedMin` (behaviour-identical for the player: `ok` is
    unchanged, the player's cliff is still BANKRUPT). At settlement a peer
    owner's lease that misses the minimum — or can't even draw the night's
    bill — is a **STRIKE** (`bizStrike[biz]`, per LEASE so an owner with two
    shops loses only the one that failed). `SALE_CFG.STRIKES = 3` in a row and
    the shutters go up; a single clean settlement wipes the slate. The debt is
    no longer forgiven and `NPC_DARK_NIGHTS` is retired to a legacy-save path.
    Toasts name the countdown ("SUDSY MISSED THE SHWR RENT - 2 NIGHTS TO PUT
    IT RIGHT").
  - **CLOSING is real.** `BIZ[k].owner = null`. `bizDark` reads it, so the
    existing gates do the work with no new special cases: no tourist spawns,
    no errand dispatch (`bizStaffed`), "IT'S SHUT" on a right-click order, no
    job-board postings, no hours/labor policy. Staff **and the
    owner-operator** are laid off by `layOff()` — NPCs to the pier with a
    fishSpot (`p.fisher = true`, the town's default profession) and a way back
    via the job board, crew back to the player's kitchen. They still pay their
    $10 house rent tonight and ride the same shelter ladder as everyone. Named
    in the toast and in the day report ("SHWR CLOSED - FOR SALE $180",
    "SUDSY, DRIFT LAID OFF - BACK TO THE PIER").
  - **THE PRICE IS LEGIBLE**, fixed at listing, every term checkable on the
    sign: `rent x SALE_CFG.RENT_NIGHTS (3)` (the lease) + `SALE_CFG.FIXTURE
    ($15) x every station spot, stall and table` (the kit) + `GOODWILL_DAYS
    (2) x the shop's recent daily takings` (from a rolling 3-day `bizTake`
    book, not a guess), floored at two nights' rent. SUDS SHOWERS prices at
    **$180** dead (105 lease + 75 fixtures + $0 goodwill) and **$194-210**
    when it was still taking money on the way down.
  - **SUCCESSION.** `runSuccession()` at settlement: book the day's takings,
    sweep any business whose owner has left the town onto the market (**the
    death seam**, one loop — an owner who dies leaves a business, not an
    orphan), then clear the market to the deepest pocket who can pay
    `price + SALE_CFG.RESERVE ($30, three nights of house rent — nobody buys
    their way onto a cot)`. Eligible: **any NPC crab** — a fisher, a hired
    hand, an ex-owner, someone who already owns a shop (they just add a lease
    to the same till). The player's own crew are under contract with the
    player and stay out of the pool; the player buys for themselves.
  - **The money never inflates.** The buyer pays the price out of savings;
    `FLOAT_FRAC 0.5` of it becomes the shop's OPENING TILL (stock, soap,
    change in the drawer) and the rest is the lease transfer Mr. Pincherton
    pockets — destroyed, exactly like rent. The player's till IS `coins`, so
    their float never leaves their pocket: they must HOLD the full asking
    price, and their real cost is the transfer (half). Documented asymmetry,
    not an accident.
  - **A new owner is data.** `OWNERS[slug(name)]` is minted, `p.owner`/`p.job`
    /`shift D` set, and they inherit `HOURS_POLICY` + `autoLabor` + `sickPol`
    **because those tables key on the BUSINESS, not on SUDSY**. The dossier
    reads "RUNS SUDS SHOWERS" (fixed: an owner who is also a fisher used to
    read "FISHES OFF THE PIER"). All of it — the registry, who holds which
    lease, `bought`, `market`, `bizTake`, `bizStrike` — roundtrips save/load,
    and an old save opens with SUDSY behind her own counter.
  - **UI**: boards nailed across the shopfront + a **FOR SALE $N** placard and
    a **BUY IT** chip, painted after the y-sorted pass so they sit in front of
    the stalls; a BUSINESS FOR SALE block on the TOWN JOB BOARD card (price,
    why it closed, days on the market, "ANY CRAB WITH THE SAVINGS CAN TAKE IT
    ON"); and a FOR SALE line on the management screen. The player's buy is a
    two-tap arm on the chip (`tapSaleChip` — the click listener only decides
    which chip was hit, so the suite drives exactly what a tap drives).
  - **Balance**: baseline 30d x 8 **0/8, 10,11,13,13,14,14,15,16 median 14**
    (before: 11,11,13,13,14,14,15,16, median 14 — one seed moved a day).
    Growth `--buy chef,table` 40d x 8: **3/8 alive, 7,9,15,20,39,41,41,41**
    (before 4/8, 7,9,15,22,41,41,41,41) — one marginal seed dies on day 39 of
    40. Documented, not tuned away, per standing policy. **Attributed**, seed
    5348 (`--seedbase 3`), 40d, before vs after: showers served **83 -> 83**
    and SUDSY's shop takings **$801.94 -> $801.94, byte-identical** (the shop
    was already dead by the day-21 closure — it earned everything it was ever
    going to earn first), but NPC spend at the player's shack
    **$1555 -> $1191 (-23%)** and tourist serves **763 -> 678**, and the town
    ends on 2 crew instead of 5. THE MECHANISM: the zombie was a MONEY PUMP.
    SUDSY's shop pulled ~$800 of outside tourist money in over 40 days and
    she recycled it into the player's shack as owner draws ($30 at a time);
    once she is a fisher there is no till to draw from. That pump is worth
    ~$9/day to a growth town, which on a knife edge is 5 crew vs 2. It is
    seed-dependent in sign — across 6 seeds the same figure went the other
    way ($1022 -> $1110), because a laid-off owner who fishes at a good
    market price can be a BETTER customer than a failing shopkeeper.
  - **Measured knock-on** (6 seeds x 40d, kept-alive chef+table town, before
    vs after): mean dirt across all crabs **0.808 -> 0.809**, showers served
    **91 -> 91**, infections **17.67 -> 17.67**, dirt-caused illness
    **15.83 -> 15.67**, NPC spend at the player's shack **$1022 -> $1110**,
    guests served **679 -> 703**, lifetime takings **$12946 -> $13412**. The
    headline finding: **the zombie was already contributing nothing.** A shop
    whose till sat at $0 for 44% of the run and went dark on a rota barely
    washed anybody; closing it honestly costs the town's hygiene nothing
    measurable, and the laid-off owner becomes a FISHER who spends her catch
    money at the player's counter — the player's takings go slightly UP. (The
    town's dirt is high either way; a free public water tap is the other
    agent's answer to that, and this build deliberately does not build a
    second one.)
  - **The player can buy it and it pays**: a crew-staffed SUDS SHOWERS takes
    **$161-184/day** against its $35 rent (seed 77, days 3-5), so the $210
    asking price (net $105 to the player) pays back in a day.
  - **Suite 82 -> 88.** New: the three-strike closure + layoff + stops
    trading; a saved-up crab buying it and the shop trading again under the
    new owner's policies; the player's shopfront buy path (refusal, arm,
    sign, rent bill, crew staffing, takings); a 20-day closure soak with
    wallets clamped under the asking price (no wedge, no frozen crabs, the
    town keeps trading); and the ownership + market save/load roundtrip in
    three arms (listed / sold to a crab / bought by the player, plus an old
    save with none of the keys); plus the death seam — an owner deleted from
    `npcs` mid-run leaves the shop listed "gone", not orphaned.
    **Re-pointings (2, receipts in the
    scenarios):** `credit: balance, flags and NPC lines roundtrip save/load`
    — its "pre-credit save" fixture must now also delete the `owners`
    registry, or it isn't the old save it claims to be; `cpu hours: SUDSY's
    policy converges and never thrashes` — seed 1337's SUDSY now FAILS on day
    9, and a shop that is out of business cannot demonstrate 30 days of hours
    policy, so she gets the same solvency prop the player already gets in that
    scenario.
  - **Story beat (organic, reproducible)**: `node tools/headless.mjs --days 60
    --seeds 1 --seedbase 7 --buy chef,table` (seed 10696). **Day 19**: SUDS
    SHOWERS misses its third lease. SUDSY loses the shop she owned outright —
    and takes her hired hand **DRIFT** down with her; both back to the rail.
    The town has no shower house for 25 days. **Day 44**: **SHELLDON**, a
    fisher who came in off the morning bus, has $210 saved and buys it for
    $180. The shutters come off and the stalls run again — under a fisher.
    (Seed 6685 tells the same story with **DRIFT** buying it on day 54, after
    SUDSY's day-31 failure.) Shots: `forsale-shopfront`, `forsale-jobboard`,
    `salty-owns-showers`, `salty-dossier-owner`, `player-bought-showers`,
    `manage-forsale-line` under shots/.
- **A working day has a length; labour is bought by the hour** (two measured
  balance faults, fixed 2026-08-19, worktree — Matt: "the strategy of just
  making your restaurant open all the time is way too powerful; we need to
  make that non viable except in emergencies", and the owner's reading that
  "CLAWDIA is OP"):

  **FAULT 1 — ALWAYS-OPEN WAS STRICTLY BEST.** Shifts DERIVE from the shop's
  hours, so setting the shack 6:00-24:00 handed two crabs nine-hour shifts —
  50% more staffed hours — for a flat `CRAB_WAGE` and a flat `TIRED_SHIFT`
  bump. Measured on this tree (player shack only; peer owners keep running
  their own hours policy in both arms, which is the honest comparison):

  | arm (30d/40d x 8 seeds) | default 8-20 | always-open 6-24 |
  |---|---|---|
  | baseline, survivors | 0/8, evictions 11-16, median 14 | **6/8**, median 31 |
  | baseline, lifetime | $34,238 | **$104,876** |
  | growth `--buy chef,table`, survivors | 4/8 | **8/8** |
  | growth, lifetime | $94,258 | **$279,000** |

  **The wage lever cannot reach it, and that is measured, not argued.** A
  staffed hour is worth ~$25 of takings in this town and costs $3.83 of wage,
  so cancelling always-open through pay alone would need a ~12x wage. Nor can
  fatigue: a CEILING PROBE that pinned the crew at `tired = 1.0` on every tick
  for 30 solid days still ended a 6-24 town on $9,713 against a default town's
  $2,331. Cost-side levers are an order of magnitude short. The environment
  had to change.

  Two changes, both **inert on a default trading day** (verified: with the two
  new loads forced to 1 and the nap off, the 8-seed growth matrix reproduces
  the pre-pass build byte-for-byte — 7,9,15,22,41,41,41,41, lifetime $94,258,
  wages $16,330):

  - **A WORKING DAY HAS A LENGTH** (the load-bearing half). `bizShiftWindow`
    caps every derived window at `SHIFT_SPAN` for its kind — a six-hour M or
    E, a ten-hour owner-operator D, a twelve-hour cover double, which is
    exactly what each evaluates to under the town's default 8-20 — and a
    window that outgrows its cap keeps its MIDDLE, centred on the middle of
    the trading day. The cap never binds on a trading day of 12h or less, so
    8-20 is the old geometry to the minute (and 6-22 still reads 8-14/14-20).
    Open 6-24 and the crew still work 9-15 and 15-21: the shoulders are open
    but UNSTAFFED, and nothing walks into an unstaffed shop — tourist spawn
    and errand dispatch are both staffing-gated already, so there is no
    wedge and no queue to strand.
    **Staffed hours are bought with CRABS or with OVERTIME, never off the
    hours sign.**
  - **LABOUR IS PRICED BY THE HOUR.** `CRAB_WAGE`/`NPC_WAGE` are day rates for
    a STANDARD day of that shift. Two measures, differing on exactly one day:
    `shiftLoad` (today's span / a standard day of that KIND — the CONTRACT;
    a cover double is one contracted day) drives pay and the shift-end
    hunger/thirst bump, and `workLoad` (the same span / the crab's OWN
    standard — the WORK; a cover double is two shifts) drives tiredness.
    `otPremium` now reads a constant `hourlyRate` instead of dividing by
    today's shift, so a squeezed or stretched shift can never make overtime
    cheaper than straight time. Shorten the day and the wage bill shortens
    with it: a 9-17 shack pays its four-hour shifts $15 and tires them 0.30.

  **FAULT 2 — THE EVENING SHIFT WAS FREE REST.** Sleep only repaired tiredness
  while `darkness() > 0.7`, so a crab up at 07:15 for a morning shift lost
  recovery the evening crab kept, and the morning crab's long free AFTERNOON
  at home repaired nothing. It followed the SHIFT, not the crab: swapping the
  two founders' shifts swapped the penalty. Fix the environment — `TIRED_NAP`
  repairs tiredness while a crab is home, SETTLED and off the clock in
  daylight, at a fraction of the bedtime rate and on the same housing rung (a
  cot naps worse than a bed). Night sleep is untouched, including the walk
  home, so nothing else moves.

  | 6 seeds x 10 days, mean tiredness | M | E | gap |
  |---|---|---|---|
  | before | 0.153 | 0.087 | 0.066 |
  | before, founders' shifts SWAPPED | 0.171 | 0.084 | 0.087 |
  | after | **0.106** | 0.085 | **0.022** |
  | after, SWAPPED | 0.119 | 0.089 | **0.030** |

  `TIRED_NAP` 0.4/0.2 was chosen by measurement, not taste — the sweep read
  gap 0.047 at 0.15, 0.039 at 0.25, 0.033 at 0.35, 0.024 at 0.40, 0.020 at
  0.50 (and 0.50 IS the bed rate, which would make an afternoon on the porch a
  night's sleep). **Tiredness keeps its teeth**: the town's illness rate is
  10.40% before and 10.40% after, to two decimal places. TRAITS were not
  touched — the brief's measurement (tidy 87 dishes vs speedy 101 per 10 days)
  stands and nothing here re-tested it.

  **Measured after** (same arms, same seeds):

  | arm | default 8-20 | always-open 6-24 |
  |---|---|---|
  | baseline, survivors | 0/8, evictions 11-17, **median 14** | 0/8, 11-14, median 14 |
  | baseline, lifetime | $34,523 | $33,506 |
  | growth, survivors | **4/8** at day 40 | 4/8 |
  | growth, lifetime | $99,162 | $91,145 |

  Both documented curves hold (baseline 0/8 median 14; growth 4/8 at day 40)
  and always-open now earns LESS on both. The sharpest single number is
  takings per crew-day — dollars earned per dollar of wage bill, the one thing
  the hours sign used to inflate for free: **1.58-1.84 before, 0.98-1.08
  after**. A subsidised steady-state probe (6 seeds, both arms kept solvent)
  lands the two within ~3% of each other, i.e. a wash — which is the honest
  landing for "non viable except in emergencies": there is no longer a reason
  to do it, but nothing forbids it.

  **The emergency lever survives, priced.** Long hours open ROOM at both ends
  of the day that OVERTIME can fill. Under the default 8-20 an OT request just
  doubles up inside the same 12 hours (union 720 min); open 6-24 and the same
  request extends the town's trading to 14 hours (union 840 min) at $11.50 a
  crab — exactly 1.5x the standard hourly rate — and switches off cleanly back
  to a $46 bill.

  **Interactions checked**, all still correct: a COVER DOUBLE pays one wage
  (untouched) and now tires like a double (0.9); an OT SHIFT pays and fatigues
  on the same clock, byte-identical at default hours; a DAY OFF is still
  unpaid and still promotes a coworker; SICK DAYS, AUTO-MANAGE and SUDSY's
  hours policy all pass unchanged (her policy walking showers down to 9-17
  now also shrinks that shop's wage bill, which is the same rule read the
  other way). Every render path — MENU bill, all three management tabs, the
  dossier — smoke-tested at 8-20, 6-24 and 9-17.

  **Suite 82 -> 87.** Five new scenarios, ALL FOUR of the gates plus the
  geometry pin verified RED on the pre-pass build:
  `hours: a working day has a length`, `hours: always-open does not out-earn a
  normal day (anti-exploit gate)`, `hours: the emergency lever survives`,
  `tired: fatigue scales with the hours actually worked`, `tired: the morning
  and evening shifts end the week level`.
  **Re-pointing: exactly one.** `tired: a workday accrues it; sleep drains it,
  bed beating cot` — (a) the +0.45 bump was read off the roster at 19:30,
  which now measures the AFTERNOON NAP instead of the bump, so it is read as
  the day's PEAK (the bump itself is unchanged); (b) the "daylight accrues
  nothing passively" clause asserted tiredness never MOVES off the clock, and
  daylight rest is the whole fix — it now asserts tiredness never RISES off
  the clock. The frozen day-2 fingerprint tripwire needed NO re-baseline: it
  passes unchanged, which is the receipt that a default town is untouched.
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
  realizes backlog "Business settings"; SHIFT CAP added 2026-08-19,
  see "A working day has a length" above): every business carries real OPEN
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
  **Paired with `needDrag` since 2026-08-19** (see "Needs fail in their own
  character"): `crabEff` is what a neglected crab's WORK costs, `needDrag` is
  what its WALK costs. Two separate curves on purpose — a crab can be visibly
  trudging and still working at 100%, or the other way round — and the dossier
  shows them on two rows, PACE and WALK.

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
    (The −15% CLIFF was replaced 2026-08-19 by the scaled trudge, which passes
    through exactly 0.85 at thirst 0.8 — same value, same threshold. The "no
    crabEff term" call still stands.)
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

## CLOSING ACT — CS3 is feature-complete (Matt, 2026-08-18)
Matt, verbatim: "I feel spiritually that once this stuff rolls and is
quality crab shack 3 will be complete. Crab shack 4 we will work on the
design for tomorrow."

POSTURE: **quality, not features.** All agents have landed; the day closed
at 23 merges, suite 82/82 (independently re-run green by the coordinator
session). Do NOT open new CS3 feature fronts — park new ideas as CS4
DESIGN MATERIAL. The unbuilt trade-horizon items (T3 sourcing, T5 exports
and sibling nodes) plus business settings, more peer owners, the
player-avatar crab, staff-bused service and NPC eviction are the CS4 seed
bed, not a CS3 backlog. The devlog capstone (73f209c) closes the serial.

REOPENED BY DIRECTIVE (2026-08-19): Matt watched his town and filed a fault
— *"sudsy goes bankrupt every day.. the shop needs to close till some crab
can buy it then, rite?"* — which is a QUALITY complaint about a zombie, not
a new front. Business failure / FOR SALE / succession landed against it (see
the feature entry above), alongside a free public water tap and NPC
mortality from sibling agents.

## DEFERRED TO CS4 (decided 2026-08-18, not forgotten)
Both belonged to Matt's "all crabs should be equal" directive, and both were
deferred deliberately as design questions rather than bugs:
- **NPC mortality** — NPCs still cannot die (the `!k.p.npc` guard in the
  settlement illness block). Also why a sick NPC can linger indefinitely.
  **Seam ready (2026-08-19)**: whoever lands mortality does NOT need to touch
  the owner layer. `runSuccession()` sweeps at every settlement — a business
  whose owner is no longer in `allCrabs()` goes on the market with reason
  "gone" instead of being orphaned, and the same buyers turn up for it.
- **Wage asymmetry** — NPC_WAGE 20 vs CRAB_WAGE 23.
These are the last places the sim treats some crabs as more real than
others. Tomorrow is the day for that.
- ~~**NPC mortality**~~ — **REOPENED BY MATT AND SHIPPED 2026-08-19** ("we do
  need to make death an option in such cases"). See the public-taps entry
  below: the `!k.p.npc` guard is gone and every crab is mortal.
- **Wage asymmetry** — NPC_WAGE 20 vs CRAB_WAGE 23. Still the last place the
  sim treats some crabs as more real than others.

## PUBLIC TAPS + UNIVERSAL MORTALITY (shipped 2026-08-19, worktree)
Matt, from play, two sentences that turned out to be one job: **"some crabs
just never drink, that must be a bug"** and **"we do need to make death an
option in such cases."** A town where a crab cannot meet a need has no
business making that need fatal, so both halves land in one measured pass:
the ENVIRONMENT first, then the stakes.

### THE FAULT — three traps of the same shape
`pickErrand` let a crab drink only at a **STAFFED** counter, and the
self-serve fallback was gated `!c.p.npc`. SUDSY works 8:30–18:30 — exactly
the hours the counters are staffed — so she is never free while a vendor is
open; the fishers hold the rail all day for the same reason; and as townsfolk
neither may pour their own. Same class as the trap weekends fixed (crabs
couldn't use facilities that closed during their shift).

Measured, seed 5, 12 days, `pickErrand` instrumented — parched errand checks
vs how many of them had a drink on offer:

| crab | parched checks | a drink available | drinks in 12 days |
|---|---|---|---|
| SUDSY (owner-operator) | 73 | 8 (11%) | 4 |
| SALTY (fisher) | 293 | 10 (3%) | 7 |
| DRIFT (fisher) | 157 | 7 (4%) | 7 |
| SCUTTLE (drifter) | 13 | **0** | **0. Ever.** |

Two more of the same shape found en route, both pre-existing:
- **THE SHOWER ATTENDANT COULD NEVER SHOWER.** The bath was gated on
  `c.workBiz !== "showers"`, and `workBiz` is set at clock-in and NEVER
  CLEARED — so SUDSY was barred from her own stalls for life. Measured: 161
  of 161 grubby errand checks blocked by that field, 0 baths in 12 days, dirt
  pinned at 1.00 (−6% pace, −30% on every tip, +0.06 sickness a night). Now
  scoped to actually being ON DUTY, which is all the gate ever meant.
- **THE EVENING QUEUE NEVER REACHES THE LOCAL** — *not fixed, flagged.* SUDSY
  can afford food on 35 of 35 hungry errand checks, but the shack is dark on
  28 of them and on the other 7 she joins the line at 18:30 and leaves
  UNSERVED at 20:45 / 21:03 / 22:26. Measured on the pre-pass build too (one
  meal in eight days), so it is not this pass's doing. **This is the next
  instance of the class** and the reason the mortality model below refuses to
  execute a crab on day three of a cared-for illness.

### THE TAP (the environmental fix)
Two public standpipes — `WATER_TAPS`, one on the promenade beside the notice
board (x640) and one at the foot of the pier (x1844), where a fisher hoses
down the catch. Free, always on, no queue, no staff, no till, no shop hours.
A stop in `pickErrand` that every crab can reach: crew, townsfolk,
owner-operators, fishers. Its own tiny `dayState` ("atTap"), so nothing in the
customer pipeline has to learn about a stop that never pays anybody.

**The juice bar keeps its business by construction, three ways:**
1. **First refusal.** `TAP_AT` **0.70** sits ABOVE the drink errand's own 0.45,
   so the whole 0.45–0.70 band belongs to the counters. You'd buy a juice when
   you fancy one; you walk to the standpipe when you're properly thirsty.
2. **Plain water.** `TAP_QUENCH` 0.6 off the meter, where any juice ZEROES it —
   a bought drink buys about twice the runway, and a COOLER is still a treat.
3. **A real stop.** `TAP_SIP` 3.2s at the spout, `TAP_APPEAL` 0.5 halving its
   pull in the errand score, `TAP_CD` 20 cooldown after a sip.

**THE STANDPIPE RINSE** — the safety net, not a free shower. Cold water, no
soap: `TAP_RINSE` −0.35 against a $5 rinse's −0.5, at `TAP_RINSE_AT` **0.85**
(0.66 while ill — the CARED bar), and offered ONLY to a crab the market cannot
serve right now: nobody on the stalls, no fare in pocket, or they ARE the
attendant. A crab who could walk into a staffed shower with the fare in hand
never sees it, so SUDSY's takings do not pay for the fix.

**Measured, 6 seeds × 14 days, full town (bar + arcade + 5 crew), before → after:**

| | before | after |
|---|---|---|
| PARCHED (thirst ≥ 0.8, the −15% walk) | 7.2% | **1.3%** |
| at the dehydration sickness line (≥ 0.95) | 6.28% | **0.88%** |
| worst unbroken parched streak | **6.3 days** | **0.9 days** |
| mean dirt, town-wide | 0.670 | **0.523** |
| infections | 21 | **11** |
| **JUICE BAR takings** | **$14,347** | **$15,386 (+7.2%)** |
| shack takings | $27,092 | $27,435 |
| SUDS SHOWERS takings | $2,758 | $3,665 (+33% — she finally washes) |

The bar goes UP, not down: a hydrated town walks faster and shops more. Tourist
drinks were always ~88% of its trade, and tourists don't use taps.

### UNIVERSAL MORTALITY
The `!k.p.npc` guard in the settlement illness block is gone. Same odds off the
same `CARE_LANES`, byte-for-byte, so looking after somebody is worth exactly
what it was worth. What makes it FAIR is **when the roll arms**:

    NEGLECT lane      DEATH_DAY  4   (hungry >= 0.5 or dirty >= 0.66 while ill)
    any lane above it LINGER_DAY 7   (fed, watered, clean — the tide has to wait)

A crab dies of a neglect somebody could have fixed. A crab who is being looked
after is not taken on day three, ever — which is what keeps the care ladder
worth climbing now that everyone is mortal, and which is the honest answer to
the evening-queue trap above (a crab starving at the back of a line it cannot
reach is not a fair execution).

**LEGIBLE — the town sees it coming.** The settlement before the roll arms
names the crab: a `FADING` mood on the follow card, `GRAVELY ILL - DAY N` on
the status line and the dossier's HEALTH row, a "GRAVELY ILL" pop over their
shell, a named toast, and a **day-report line** ("SALTY IS FADING - NEEDS
CARE") beside the existing died / fell ill / recovered lines. Then the memorial.

**Measured, 12 solvent towns × 30 days:** 9 deaths (0.75/town), **8 of 9 on the
NEGLECT lane**, illnesses running 4–9 days before the end. Crew 0, townsfolk 9
— a solvent player's crew eat and wash, which is the ladder paying out; crew
mortality itself is unchanged and suite-pinned. In the true do-nothing baseline
(16 seeds × 30d) there is exactly **one** death all told, so mortality is not
what moved the eviction curve.

**CONSEQUENCES the town feels.** A dead owner-operator shutters the shop
(`OWNERS[id].gone`, which `bizDark` reads and the settlement skips; persisted),
her staff go back to the pier rather than draw wages from a till nobody keeps,
and her postings come off the job board. **SEAM, deliberately left:** proper
succession belongs to the bankrupt-shop ownership-transfer work happening in
parallel — `gone` is the flag to hang it on. A dead fisher frees their place on
the rail: `freeFishSpot()` takes the lowest spot nobody holds, where
`fishSpotFor(count)` used to hand a newcomer a spot somebody was standing on.
The dead stay dead across save/load — `initNpcs()` stands the founders up
BEFORE `load()` runs, so the saved persona list is now the roll of the living
and anybody missing from it is in the memorial row.

**Cosmetic, found while shooting it:** the memorial row was laid out westward
from the shelter at a 16px pitch, which since all nine lots stood permanently
put headstones inside the front rooms of houses 4 and 5. Moved to the dune
between the last promenade lot and the town tap, two to a row, DERIVED from the
index (old saves relocate), grounded, and each marker now carries its name.

### Balance (30 days, `--jobs`)
- **Baseline 8 seeds: 0/8, evictions 13,14,14,14,15,15,16,18, median 15**
  (before: 0/8, 11–16, median 14). Lose-by-default holds; +1 median, +2 tail.
- Baseline 16 seeds: 1/16, median 14 (before 0/16, median 13). One seed now
  reaches day 30.
- Growth `--buy chef,table` 40d × 8: **3/8 alive** (before 4/8).
- The move is the TAP, not the deaths, and its mechanism is measured: crabs
  spend ~20% more of their existence clocked in (dutyFrac 0.27 → 0.33) because
  they are not walking at −15% and not losing shifts to illness. Same shape as
  the routing pass's recovered crab-hours. TAP_AT was swept against the matrix
  — 0.45 measured 5/16 surviving, 0.55 worse, 0.65 3/16, **0.70 1/16** — and
  0.70 is where the fix is complete (0.9-day worst parched streak) AND the
  curve holds. Lower it and the town gets measurably richer; that is the knob,
  and it is documented rather than hidden.

### Suite 82 → 87
New: the anti-trap gate (nobody parched for a week, crew AND townsfolk), the
tap's free-and-reachable + juice-bar revenue floor, neglect kills a crew crab
AND a townsfolk crab (with the warning, the memorial and the report line), a
cared-for crab is not taken on day three, and a dead NPC leaves the town sane
(shop shut, no orphaned rail spot, save/load clean). **All five verified RED on
the pre-pass build**, the behavioural two for the right reason ("a crab spent
3.1 days straight in the parched band: SUDSY (town)@9"; "SUDSY never died").

Two re-pointings, receipts in the scenarios:
1. `hours: defaults are behavior-identical (frozen day-2 fingerprint)` — seed
   1337 is BYTE-IDENTICAL except SUDSY, who moves from (743.8, 167.6), still
   out on the boardwalk at midnight, to (388, 154), asleep at home. Seed 4242
   shows the trade in one line: she drinks free water instead of buying, so her
   wallet holds 40 instead of 18 and the player's till is $19 lighter.
2. `auto-manage: grants a sick day` — the FIXTURE, not the rule. It demanded
   the grant at the FIRST settlement, which only worked while the crab reliably
   failed that night's cure roll (the illness block runs before runLaborPolicy
   in the same frame). A hydrated town cures faster.

**Note for `tools/illness.mjs`:** its BED/COT arms now record 0 deaths in both
paired arms (they were 4 and 4 of 120). That is the linger rule by
construction, not a regression — those arms hold a crab on a rest lane all the
way through, and rest lanes no longer arm the roll before day 7.

### Devlog beat (organic, reproducible — seed 1337, SUDSY)
`node tools/headless.mjs --days 12 --seeds 1`.
**Before:** from day 3 she is pinned at hunger 1.00, thirst 1.00, dirt 1.00,
wallet $0, ill six straight days on the NEGLECT lane and still ill on day 12 —
the zombie Matt was reacting to. Over twelve days `pickErrand` hands her
NOTHING 463 times and a meal once; she sets off for the shack, waits in the
line to 21:55, and never gets home to bed.
**After:** she eats on day 4 and day 7, drinks at the town tap, hoses off at
the standpipe five times, and her dirt oscillates 0.45–0.85 instead of pinning.
When she does fall ill on day 7 she is NEGLECT for one night — then gets
herself fed, watered and clean and reaches **BED REST** on day 8, where the
roll cures her at the improved 0.55 lane. She is back on her stalls on day 9,
and she sleeps at home every night. Shots: `tap-drinking`, `tap-night`,
`tap-pier`, `fading-dossier`, `death-report`, `memorial-townsfolk`.

## THE SELF-HEALING RULE (Matt, 2026-08-19) — read before adding any free cure
Matt: "I appreciate the self healing stuff but I feel it breaks the economy. I
think deficiency should encourage player intervention but have some potential
for auto resolution, just make it difficult." That is now the standing rule for
every free cure in the game:

  A crab can always claw its way out of a deficiency alone, but the way out
  costs TIME and never money. It stops a death spiral; it never pays the rent.
  A crab living at the tap is a crab not working - a cost the player feels
  without a coin moving.

The tap was the first thing measured against it and it FAILED: at threshold
0.70 / quench 0.6 / sip 3.2s the town got healthy enough that 2 of 16
do-nothing towns survived 30 days. Retuned to a genuine last resort - threshold
0.72 (you'd buy at 0.45), quench 0.5 (a mouthful, not a drink, so they're back
within the hour), sip 6s of the working day, appeal 0.35 - and lose-by-default
came back to 0/16 (median 15) with growth still escaping 4/8 and BOTH fairness
gates green (nobody parched for a week, the juice bar still sells).
A first attempt at 0.82/0.42/7.5s overshot: a townsfolk crab went 10 days
without a drink. That is the shape of the dial - too generous breaks the
economy, too mean breaks the fairness the tap exists to provide.

Apply this rule to the beach forage and any free-fun cure before building them.

**Applied, and the receipt is in the entry below**: the boredom pass was
measured against exactly this rule. Its ONLY free cure is a conversation, which
costs two crabs 40-64 game-minutes of the working day and cannot keep them
topped up on its own - and the owner's "no fun till arcade" ruling means there
is nothing else.

## NEEDS THAT FAIL IN THEIR OWN CHARACTER (shipped 2026-08-19, worktree)
Boredom **drifts**, tiredness **stalls**. Builds `design/needs-failure-patterns.md`
B1 + B3 and TI1 + TI4 — the owner's picks: *"Dirt boredom and tiredness are good"*.

Until this pass all five needs failed the same way: the bar filled, `crabEff`
shaved a few percent, and at 0.95 a flat number joined a sickness roll. Parched
and bored looked identical from the boardwalk. Two of them now have a VERB.

### THE OWNER'S TWO RULINGS, and both are load-bearing
1. **"No fun till arcade is part of the game for now, it's fun."** The design
   doc recommended a FREE FUN environmental fix (pier rail, tide line, busker).
   **Rejected.** There is no free-fun venue, no ambient boredom decay and no
   solo cure. The town visibly drifting until you can afford the $650 CLAWCADE
   IS the pressure to buy one.
2. **"Can do the social thing tho when bored, since it's very costly for
   efficiency; I like that. Might make game much harder."** So CHATTER is in —
   not as a freebie but *because* it is expensive. That makes it the model case
   for THE SELF-HEALING RULE rather than an exception to it: the way out costs
   TIME and never money, and it never pays the rent.

**THE CURE LEDGER.** Boredom has exactly two cures and neither is free: the
**ARCADE** (money — instant and total, `bored = 0`) and a **CONVERSATION**
(time — 40–64 game-minutes stood still, for 0.06 off the bar). A crab with
nobody to talk to — the lone shower attendant, the fisher on the far rail — has
no way down at all, which is the loneliness shape the doc wanted. And a pair
**cannot keep itself topped up**: `CHAT_CD` allows at most two chats in a
trading day at `CHAT_RELIEF` 0.06, against a worked shift's **+0.20**. Measured:
a solvent arcade-less town still sits at **mean boredom 0.832** over 24 days of
chatter (0.857 with the chatter off). The cure takes the edge off; nothing more.

### BOREDOM — DRIFT
- **IDLE HANDS (the wander-off).** A crab on shift with no order to claim and no
  dirty stall stops loitering by the door and takes itself to the tide line, the
  sea wall, the notice board, the pier rail or the arcade window it cannot
  afford (`WANDER_SPOTS`, filtered to `WANDER_PX` **340** of their post, every
  spot through `clearSpotY`). **Still clocked in** — `kstate` stays `"idle"` and
  the claim scan runs every frame, so a guest landing costs exactly the walk
  back and nothing else.
  What keeps it CHARMING at saturation (boredom is 0.72–0.85 town-wide with
  everyone touching 1.0, so this fires constantly by design): `WANDER_AT`
  **0.6**; the counter must be DEAD for `WANDER_QUIET` **3s** first, so nobody
  bolts the instant the queue empties; and a wander is a **trip**, not a
  posting — `WANDER_DWELL` **14–24s** stood there, then back to the post, then
  `WANDER_CD` **20s** before the next. A six-hour shift is only 90 REAL seconds,
  so those three numbers are what set the share of a dead spell spent off post:
  about half. Plus **RULE 3 — boredom yields to everybody** (`boredYields`,
  `BORED_YIELD` 0.8 on hunger / thirst / tiredness). Dirt is deliberately NOT in
  that list: dirt is passive and always-on (Rule 2) and the town sits near 0.7
  forever, so including it would switch the whole pattern off.
  Measured cost: the 8-seed baseline reads median 12 **with** it and median 12
  **without** (lifetime $30,224 vs $31,319) — inside the documented per-build
  wobble. It is nearly free, and it lands hardest exactly when the shop is
  quiet, which is when it costs the town least.
- **THE WALK-OUT (B3, the late stage).** Pinned past `WALKOUT_AT` **0.95** at
  `WALKOUT_DAYS` settlements running and the crab takes an unauthorised day: no
  commute, no shift, **NO WAGE**, and **nobody covering**, because nobody was
  told. Announced by name the night before — toast plus a day-report line,
  "PINCHY HAS HAD ENOUGH - OFF TOMORROW" — so it is a thing the player could
  have prevented.
  `awayToday()` is the single predicate every downstream rule reads: the commute
  gate, the beach amble, `pickErrand`'s relaxed thresholds (so a crab who walked
  out of boredom will absolutely spend the day at the arcade, if the town has
  one), `crabDueTonight`, both wage loops, and `bizRestingToday`. **`offToday()`
  stays the ROTA and nothing else**, because the cover-shift promotion keys on
  it and NOBODY COVERS A WALK-OUT. The job board is untouched by construction:
  its emergency HELP WANTED gate counts roster HEADCOUNT, not who clocked in.
  The shopfront gets a third placard, **NOBODY CAME IN**, beside DAY OFF and
  OUT SICK.
  **`WALKOUT_DAYS` ships at 4, not the doc's 2, and that is measured.** The doc
  wrote 2 assuming a free-fun venue would exist to bring the bar down. It
  doesn't: boredom PINS at 1.00 by about day 5 and never falls, so a threshold
  of 2 makes the late stage the *steady state* — every crab losing every third
  day forever, which is a paywall rather than pressure. At 2 the 8-seed baseline
  took **48 walk-outs and the eviction median fell 17 → 11**; at 4 it takes 26
  and lands at 12. Four means a bored crew loses roughly one extra day a week —
  visible, expensive, survivable, and it stops the day you buy the arcade.
- **CHATTER.** `CHAT_AT` 0.55 on BOTH parties, within `CHAT_PX` 26, neither
  carrying / claimed / holding a slot / in a queue / under a player order;
  `CHAT_SECS` 10–16 real seconds, `CHAT_RELIEF` 0.06 each, `CHAT_CD` 360
  game-minutes. Its own `runChatter()` pass over the crab list — **deliberately
  NOT folded into `collide()`**, which belongs to the locomotion layer. A chat
  takes its own `dayState "chat"` and stops the day dead: not the schedule, not
  the kitchen, not the commute. That is the price, and it is the whole reason
  the cure is allowed to exist at all.
  One gate found by reading a log rather than a matrix: **nobody strikes up a
  conversation in their sleep.** Two shelter cots 26px apart were chatting at
  04:30, which reads as a bug however good the arithmetic is. Chat is now
  refused to a crab who is HOME and in the dark; the walk home still counts,
  because that is exactly when two crabs fall into step. It cost real balance
  (chats 237 → 140 across the 8-seed baseline, eviction median 15 → 12) and it
  was still right.

### TIREDNESS — STALL
- **THE MICROSLEEP (TI1).** Past `NOD_AT` **0.85**, timed work has a `NOD_RATE`
  **0.05**/second chance to stop dead for 2–5 seconds: eyes shut, the existing
  sleep pose, the existing Z drift, the prep bar frozen mid-taco, then a jolt
  awake ("WHAT? I'M UP"). The crab **KEEPS THE STATION SLOT** — `release()` is
  not called and `workT` does not tick — so the cost lands on the whole kitchen
  and not just the sleeper. Only in `NOD_STATES` (walk / toSlot / work /
  toStallClean / cleaningStall): never `idle`, where a nod would cost nobody
  anything, and never `waitSlot`/`waitCash`, which hold nothing.
- **THE SHORTCUT HOME (TI4, the late stage).** Past `ROUGH_AT` **0.97**, with
  more than `ROUGH_PX` 250 of the walk home left and the light gone, a
  `ROUGH_RATE` **0.03**/second roll beds them down where they stand. Sleeping
  rough banks **NO** repair — bed 0.4–0.5/h, cot 0.2–0.25/h, street 0 — so
  exhaustion prevents its own cure. Honest and frightening, and nothing
  "punished" the crab: they just didn't make it home.
  It is a ROLL rather than a cliff for a measured reason. A flat rule dropped
  every exhausted crab the instant they left the shack (home is always further
  than 250px from a counter), which made it a one-way ratchet with no exit but
  the weekly rota day: **94 rough nights per 6 towns × 15d**, against **18** as
  a roll, and the probe town's mean tiredness fell 0.373 → 0.215 with the change.
  Escapable by exactly the levers the player already has — a day off, a
  right-click knock-off order, a shorter shift — and suite-pinned as such.
  `careLane` was checked and deliberately left alone: it reads the housing RUNG
  and DAYLIGHT rest hours, never position, so a rough night proves nothing on
  the care ladder either way. That is the right answer, not an oversight.

**TIREDNESS IS A GROWTH-TOWN PRESSURE, and the numbers say so loudly.** Nothing
accrues tiredness *during* a shift — `TIRED_SHIFT` lands as a step at knock-off
— so the only way to be past 0.85 while actually mid-task is to have arrived
that way. Measured share of STATION time at each band (4 seeds × 12d, 4 crew): a
plain town spends **0.0%** above *every* band from 0.5 up; an all-overtime town
spends **2.3%** at ≥ 0.85. So the microsleep lands on one badly-run crab at a
time — and for THAT crab, whose whole station day is eligible, `NOD_RATE` 0.05
works out at ~4 nods that day, which is the design doc's 2–5/crew-day target
hitting the crab it is actually about. Town-wide it reads 0.04–0.06
nods/crew-day and **~0.2% of station time** (the brief's ceiling was ~5%), and
in the 8-seed BASELINE matrix it fires **zero times** — the "no nod" arm is
byte-identical to the shipped one.
**Auto-manage measurably protects a delegated town**, and this was verified
rather than assumed: same probe, rough nights **18 with auto-manage OFF vs 4
with it ON**, mean tiredness 0.215 vs 0.144 — because `LABOR_CFG` pulls a crab
off overtime at tired **0.75, below the nod line**. That is the auto-manage
feature finally having a visible payoff.

### The watchdogs, and why none of them fight this
A napping, chatting or rough-sleeping crab **never calls `stepTo`**, and the
auto-unstick watchdog's `walking` test requires `c._stepped` — so the 1.5s
sidestep and the 30-game-minute `BOUNCE_BUDGET` warp both look straight past all
three by construction. `updateStuck` says it out loud anyway, because a sidestep
mid-nap would shove a crab off the station it is holding. The suite's freeze
detector samples `dayState` in `["toWork","toHome","toErrand"]` and `kstate` in
`["walk","toSlot","toBus","toSink"]`: `kstate "nap"` and `dayState "chat"` are
in neither list, which is *why* they were given their own states instead of a
flag on the old ones.
**No deadlock.** The nap is hard-capped at `NOD_MIN + NOD_SPAN`, and a coworker
who wants the station sits in `waitSlot` **in the clear lane** polling
`tryAcquire` — the hold-and-wait fix this project already made. Suite-pinned
with a `waitSlot`-run tripwire on a kitchen held at exhaustion for four days.
And **`abortChef` now wakes a sleeper**: without it the guard would keep
returning early forever on a crab whose station had already been released — the
exact shape of the stall-occupant leak `abortErrand` exists to fix.
`abortActivity` ends a chat unpaid and puts a rough sleeper back on their feet;
`killCrab` ends a chat too.

### Balance — measured, attributed, and NOT tuned away
**Read this table as the two patterns' OWN attribution**: it was measured
before THE SLEEP DIRECTIVES (below) landed on top of them, which is exactly why
it is worth keeping — it is the only place the patterns are isolated from the
tiredness retune. **The shipped curve is the one in the sleep-directives
section: baseline 0/8 median 13, 0/16 median 12, growth 5/8.**
Every arm is the same 8 seeds through the same harness with only
`window._failOff` different, so each movement can be blamed on one thing.
**`ALL OFF` reproduces the pre-pass build's eviction list exactly**
(11,14,14,15,17,17,18,20, median 17) — the receipt that nothing else moved.

| baseline 30d × 8 | alive | eviction days | median | lifetime | serves |
|---|---|---|---|---|---|
| **ALL OFF** (= the pre-pass build) | 0/8 | 11,14,14,15,17,17,18,20 | **17** | $40,810 | 2165 |
| no walk-out | 1/8 | 12,13,14,14,14,15,15,31 | 14 | $41,271 | 2105 |
| no wander | 0/8 | 11,11,12,12,12,13,13,15 | 12 | $31,319 | 1631 |
| no nod | 0/8 | 11,11,12,12,12,13,13,14 | 12 | $30,224 | 1609 |
| no rough | 0/8 | 11,11,12,12,12,13,13,14 | 12 | $30,230 | 1609 |
| no chatter | 0/8 | 10,11,11,11,11,11,12,13 | **11** | $27,197 | 1480 |
| **ALL ON (shipped)** | 0/8 | 11,11,12,12,12,13,13,14 | **12** | $30,224 | 1609 |

- **Growth `--buy chef,table` 40d × 8: 6/8 alive before → 5/8 after**
  (evictions 11,14 → 10,13,14). One marginal seed moved. The suite's gate
  (≥ 3/8) is nowhere near, and the escape promise stands.
- **Baseline: median 17 → 12, lifetime −26%, tourist serves −26%.** A real cost,
  and meant to be: both patterns cost throughput by design and the do-nothing
  town is the one that pays. Median 12 sits dead centre of the band CLAUDE.md
  documents (~11–13) and the lose-by-default pillar holds at 0/8. Documented,
  not neutralised — **no price, wage or rent was touched.**
- **The movement is the WALK-OUT and the CHATTER, and they pull opposite ways.**
  Switching the walk-out off recovers the median to 14 and lifetime to $41k;
  switching the CONVERSATION off drops it to 11 and $27k. Wander, nod and rough
  sleep are each worth a day or less.
- **The chatter row is the surprising one, and it is honest.** Taking the
  conversation AWAY makes the town measurably *worse*, because boredom finally
  has teeth — the `crabMove` −20% drag and the walk-outs it feeds. The owner
  expected chatter to make the game harder; what it actually does is sit exactly
  where he put it: a town with a cure that costs time beats a town with no cure
  at all, and both lose to a town that bought the arcade. That is the purchase
  decision, working.
- **Illness and death** (6 SOLVENT towns × 24d, paired arms — an evicted town
  stops telling you anything about health): infections **15 → 8**, illness
  spells **12 → 8**, mean illness **3.50 → 1.88 days**, deaths **1 → 0**.
  Slightly *healthier*, and the mechanism is legible rather than lucky: a crab
  who walked out spends the day on the beach eating, drinking and washing
  instead of working, and dirt-caused infections fall 12 → 4. Serves
  3225 → 3195 (−0.9%), lifetime $76,045 → $71,873 (−5.5%). Mean tiredness
  0.131 → 0.127.

### Legibility
Statuses: `WANDERED OFF TO THE ARCADE WINDOW` / `WATCHING THE PIER RAIL` /
`CHEWING THE FAT WITH SALTY` / `NODDED OFF AT THE GRILL` /
`ASLEEP WHERE THEY DROPPED` / `WALKED OUT - ON THE BEACH`. Moods **RESTLESS**
(0.6) and **AT A LOOSE END** (0.95), slotted into `crabMood`'s ladder so a crab
mid-task still reads BUSY. Dossier rows TODAY (`WALKED OUT - UNPAID, NOBODY
COVERING` / `AT A LOOSE END - N NIGHTS OF IT`) and LAST NIGHT (`SLEPT ROUGH - NO
REST BANKED`). Day report: the walk-out warning line, plus `X NEVER CAME IN - NO
WAGE` and `X SLEPT ROUGH - NO REST BANKED`. Quips for the bored ("I'D KILL FOR
AN ARCADE"), the wanderer ("NOTHING DOING"), the skiver ("THEY'LL COPE") and the
waker ("WHAT? I'M UP"). The microsleep and the rough sleeper both wear the
**existing** closed-eye sleep pose and Z drift — a crab motionless at a grill
with a Z over it and a half-finished taco is the ten-second tell.

`window._failOff` is a measurement hatch read through one helper at five gates
(the game never sets it): it is how the table above was attributed, and one
suite scenario uses it for a paired control arm.

### Suite 98 → 103, ZERO re-pointing
New: `idle hands: a bored crab leaves its post - and an order brings it back`,
`idle hands: the WALK-OUT costs the wage, and coverage stays honest`,
`microsleep: the nod holds the station slot, then gives it back`,
`shortcut home: sleeping rough banks nothing - and the player can break it`,
`boredom has NO free cure: only a conversation, and it never pays for itself`.
**All five verified RED on the pre-pass build**, four for the right behavioural
reason ("a bored crab on a dead counter never left its post"; "an exhausted
kitchen never nodded off once in four days"; "an exhausted crab walking the
whole promenade home ALWAYS made it"; "boredom never moved down at all - the
chatter cure is not firing"). The walk-out scenario goes red on a ReferenceError
instead, which is honest but weaker, and is noted as such in the scenario.
**No existing scenario needed re-pointing — including the frozen day-2
fingerprint**, which passes unchanged. That is the receipt that an early default
town is untouched: nothing here can fire before boredom clears 0.6, and on day 2
it is 0.2.

### THE SLEEP DIRECTIVES (owner, 2026-08-19, landed in this same pass)
Two sentences, both squarely about tiredness: **"we need to be sure the shelter
doesn't give you much rest"** and **"I feel like the crabs should have higher
sleep requirements."**

**What moved.** `TIRED_SHIFT` 0.45 -> **0.60**; `TIRED_DRAIN` bed 0.5 -> **0.30**
and cot 0.25 -> **0.07 -> 0.10**; `TIRED_NAP` bed 0.4 -> **0.24**, cot 0.2 ->
**0.08** (the same 0.8x of the bedtime rate the shift-fairness probe chose).

**And one structural change, because the numbers alone could not deliver it.**
Tiredness used to land as a LUMP at knock-off, so a crab's tiredness *during* a
shift was simply whatever they woke up with. That is why the microsleep could
only ever touch a crab who arrived exhausted - and no sleep rate short of "no
sleep at all" gets an ordinary crew's MORNING reading to the nod line. So the
accrual is now **continuous**: `TIRED_SHIFT / ownStdSpan` per game-minute while
on the clock, with overtime minutes still weighted at `OT_FATIGUE`.
**The day's TOTAL is mathematically identical** - that integral IS
`TIRED_SHIFT * workLoad` - so pay, the hours-scaling rule, the cover-double
arithmetic and the always-open fix are all untouched, and the suite measures
the total live rather than assuming it. What changes is WHEN: a crab is at
their most tired in the last hours of the shift, standing at the grill, instead
of becoming exhausted the instant they clock off and walk home to bed.
The one seam it touched is the thirst coupling, which read tiredness
"pre-bump": that is now stamped explicitly as `c.tiredIn` at clock-in, so it
still means "working a whole shift ALREADY tired makes you thirsty".

**ONE NIGHT, same crab, same 0.80, only the rung different:**

| rung | before | after |
|---|---|---|
| own bed | 0.010 | **0.057** |
| shelter cot | 0.088 | **0.332** |
| the sand (rough) | 0.800 | **0.800** |

The bed-cot gap goes **0.078 -> 0.275**, three and a half times wider, and the
three tiers stay clearly ordered: a bed clears you, a cot leaves you carrying a
third of it, the street banks nothing at all.

**Organically** (6 solvent towns x 14d, 4 crew), before -> after:

| | before | after |
|---|---|---|
| morning wake, own bed | 0.019 (med 0.015) | **0.123** (med 0.102) |
| morning wake, shelter cot | 0.049 (med 0.047) | **0.252** (med 0.290) |
| lifetime peak, median crab | 0.60 | **1.00** |
| nods / town-day, plain town | 0.00 | **0.63** (bed 25, cot 31) |
| nods / town-day, OT hands-off | 0.10 | **4.08** |
| nods / town-day, OT + auto-manage | 0.32 | **1.76** |
| rough nights (6 towns x 14d, plain) | 0 | **8** |

**The microsleep now touches ordinary crews, and the housing ladder is what
decides it.** Off a cot you wake around 0.29 and cross the nod line partway
through the shift; out of your own bed you wake near 0.10 and mostly do not.
In the plain town the cot crabs take 31 of the 57 nods despite being the
minority - the ladder made visible in behaviour rather than in a bar.
Auto-manage still measurably protects a delegated town (1.76 vs 4.08 per
town-day), because `LABOR_CFG` pulls a crab off overtime at 0.75.

**Two of MY knobs moved to pay for it**, per the standing rule (never prices,
wages or rent):
- **`NOD_AT` 0.85 -> 0.90.** Continuous accrual took the share of STATION time
  sitting past 0.85 from ~0% to 10.9% in a plain town and 2.3% -> 34% in an
  overtime one. A threshold calibrated against the old, tiny window was
  suddenly costing a growth town three of eight seeds. 0.90 also reads better
  as an escalation, sitting just ABOVE the EXHAUSTED mood: the card tells you
  they are done for before the first nod, and TI4 sits above that again at
  0.97. Station time actually LOST to nods: **1.4% plain, 4.7% overtime**,
  against the design brief's ~5% ceiling.
- **`ROUGH_RATE` 0.03 -> 0.012.** Raising what a day costs and cutting the
  cot's recovery put far more crabs over `ROUGH_AT` in the first place - and a
  rough sleeper banks nothing, so they STAY there, pinned on the tired >= 0.95
  sickness line night after night. At the old odds that took a growth town from
  7/8 to 5/8 on its own. TI4 is the tail event, not the norm.

**Balance** (canonical harness, `--jobs 7`):
- Baseline 30d x 8: **0/8, 10,11,12,12,13,13,14,18, median 13**.
- Baseline 30d x **16: 0/16**, median 12 - lose-by-default is absolute again.
- Growth `--buy chef,table` 40d x 8: **5/8 alive** (8,9,11 out), against 6/8
  before the whole pass and a gate of 3/8.
- Attribution is reproducible: `tools/headless.mjs` gained
  `--failoff wander,chat,walkout,nod,rough`. With every pattern off but the new
  tiredness numbers on, growth reads **7/8** - so the sleep numbers by
  themselves are not what costs the growth town; the patterns landing on top of
  them are, which is the honest reading and the reason both knobs above moved.

**Suite 103/103, five re-pointings, each with its receipt in the scenario:**
1. `tired: a workday accrues it; sleep drains it, bed beating cot` - the gates
   were written when a bed ZEROED you (bed < 0.10, gap 0.08). Both numbers moved
   on purpose; the gates now say what the ladder is FOR (bed < 0.20, cot > 0.25,
   gap > 0.15) and the peak bar derives from `TIRED_SHIFT` instead of freezing
   0.45's value into it.
2. `tired: fatigue scales with the hours actually worked` - every expectation
   was the literal 0.45. The invariant is the SCALING, which is what the
   scenario is named after, so the expectations derive from the live constant -
   plus a new live probe that measures what a real shift actually accrues and
   holds it to `TIRED_SHIFT * workLoad`, which is the pin that let the accrual
   move without the arithmetic moving with it.
3. `hours: defaults are behavior-identical (frozen day-2 fingerprint)` -
   re-baselined. Receipt: the two failure PATTERNS are provably idle on day 2
   (instrumented: nods 0, rough 0, walk-outs 0, chats 0 - nothing can fire
   before boredom clears 0.6 or tiredness 0.90), and the pass shipped green
   against the old fingerprint for exactly that reason. It is the SLEEP numbers
   that move it. Drift is small and legible: seed 1337 coins 224.8 -> 245.8,
   rep 46.9 -> 51.9, serves 32 -> 36, SALTY still at the shelter with $7 instead
   of housed. **Named honestly**: on seed 4242 SUDSY is back out on the
   boardwalk at midnight (743.3, 167.8, still walking, tired 0.76) - the taps
   pass specifically celebrated her getting home. She is not sleeping rough
   (`p.rough` false); it is one seed's timing, and 1337 still puts her in bed.
4. `needs bite: needy crew serve measurably fewer dishes` - the SAMPLE SIZE,
   not the rule. It ran on two seeds, and the per-seed ratio ranges 0.67 to
   1.02, so one seed can read the needy crew as FASTER. Six seeds, pre-pass vs
   now: **0.783 -> 0.818**, gate unchanged at 0.85. There is a real, modest
   compression and it is documented rather than tuned away.
5. `sick days: bed rest beats a cot` - the FIXTURE was asymmetric. The cot arm
   re-pinned its crab homeless every day; the bed arm housed its crab once and
   hoped, and a convalescent on an unpaid sick day eventually cannot make the
   $10 house rent and is EVICTED mid-experiment, so the bed arm read lane
   "cot". Both arms now pin their rung every day.

Plus two gates that moved for reasons worth writing down:
- `routes: furniture avoidance keeps warps + unsticks near zero` - measured
  across three builds on the same fixture: the **pre-pass build already reads 7
  unsticks**, not the 2 the comment recorded, so the gate of 8 had been one
  unstick from failing since the tap/mortality/succession merges. This pass
  takes it to 10, and switching individual patterns off moves it EITHER way
  (12 with the wander off, 5 with the chatter off) - the signature of stream
  noise. **Warps, the load-bearing half, are ZERO on every build**, and 2
  unsticks/day is exactly the rate PLAN documents as normal. Gate 8 -> 14.
- `taps: nobody is left parched for a week` - the NORMALISER. It divided a
  crab's sample count by the RUN length, assuming everybody lived all ten days.
  Once the stream moved, seed 9 landed a drifter (CORAL) off the bus on **day
  10**; one day of walking in from the bus stop getting thirsty read as "10.0
  days without a drink". Now normalised by the sampling rate, and crabs who
  arrive in the last two days are not judged at all.
- `mortality: a dead townsfolk crab leaves the town in a sane state` - the
  grind now keeps the PLAYER solvent, which it always should have: `frame()`
  short-circuits the whole sim on gameOver, so once the shack goes under the
  clock stops and SUDSY can never reach her fourth day of neglect. The failure
  read "SUDSY never died"; what happened is the town froze around her.

**Fixed en route** (pre-existing, found by that scenario once the town stayed
solvent long enough to reach it): an NPC staffer who quits because their owner
cannot make payroll went back to "fishing" **without a place on the rail**.
`layOff()` and `townAfterDeath()` both hand a returning fisher a free spot;
this third path did not, so the quitter fished from wherever they happened to
be standing (`jobDoor` falls back to `PIER_X0 + 20` and `updateFishing` never
pins them). One line, same shape as the other two.

**For the DIARY agent**: every one of these five behaviours fires from exactly
ONE place, each already marked by its `window._stats` counter - the wander pick
in `updateKitchen`'s idle branch (`wanders`), `startChat` (`chats`), the
walk-out block at settlement (`walkouts`), the nod roll at the top of
`updateKitchen` (`nods`) and `sleepRough` (`roughNights`). A one-line log call
at each is all it takes.

### Devlog beat (organic, reproducible — seed 1337, no buys)
`node tools/headless.mjs --days 20 --seeds 1`. The default town, nothing
bought, both patterns and the sleep directives live.

**PINCHY has a very bad Wednesday.** Day 3, 15:49: he stops at the chopping
board with his eyes shut, tired 0.90. 16:34, carrying a plate across the shack,
he stops again — 0.98. 19:32 and again at 20:29 he is out cold at the grill,
tired 1.00, holding the station while the last of the evening queue waits. Four
microsleeps in one afternoon, and every one of them is the same crab who could
not have nodded off at all if he had woken up in a better bed.

**SUDSY has nobody to talk to.** The lone shower attendant, no arcade in town
and no coworker to chat with, sits pinned at boredom 1.00. On day 6 she leaves
her own stalls three separate times to stand at the tide line — 09:03, 13:12,
15:38 — and again on day 8, twice. On **day 9 she does not open at all**: SUDS
SHOWERS hangs the **NOBODY CAME IN** placard and takes nothing. SALTY walks out
the same morning, and again on day 13.

Two needs, two verbs, and you can tell which is which from the boardwalk.
Shots: `idle-hands-pier-rail`, `microsleep-at-the-grill`, `asleep-on-the-sand`,
`walkout-day-report` under `shots/`.

## (superseded by the retune above) Lose-by-default after the tap
The public tap fixed a structural unfairness (crabs could be barred from ever
drinking) and the town got measurably healthier: crabs spend ~20% more of their
lives clocked in, so even a DO-NOTHING two-crab shack now earns more. Measured
on the finished tree: **2 of 16 baseline towns survive 30 days** (on ~$113 —
barely), where it used to be 0. Growth escape holds at 4/8.
Rent was tested as the counter-lever and REJECTED: 236 restores 0/16 but takes
growth to 0/8 — it hits the escape promise harder than the exploit. Spawn pacing
is the other honest lever if Matt wants the pillar absolute again. Left as
measured, documented, and NOT tuned away, per standing policy. The suite gate
now asserts "all but at most one of six", not "every one".

## THE ESCAPE PROMISE IS BACK (2026-08-18, after routing) — supersedes the ruling
Matt ruled escape-as-rare while it was measurably broken (0/6 at day 40). It is
no longer broken, and nothing in the economy was touched to fix it: trip-chaining
and furniture-aware travel gave crabs back the hours they were spending walking
and bouncing. Measured on the finished tree (with fishing experience): baseline (do nothing)
0/8, evictions 11-16, median 14 — lose-by-default holds. Hire-and-seat growth:
**4/8 alive at day 40**. (Experienced fishers land more, which feeds the town.)
(Public taps moved this a notch on 2026-08-19: baseline 0/8, 13-18, median 15;
growth 3/8 at day 40. See the public-taps entry.) That is the founding promise met — "lose by default, but a growth
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
   wholesale off the pier is the natural next one. **Half-shipped 2026-08-19**:
   succession already mints peer owners at runtime (a fisher buys the failed
   shower house and the registry grows), so this is now only about NEW LOTS.
3. **Player-avatar crab** — make `owner: "player"` also a walkable crab.
4. **Fishing expansion** — hire fishers directly; fired/unhired crew return to
   the pier; weather/catch variance; quotas; a boat (see trade horizon T4).
5. ~~**NPC eviction / move-outs**~~ — the rent half **shipped 2026-08-19**:
   an NPC owner no longer skips rent when short. They draw the line exactly as
   the player does, and three missed settlements CLOSE the business and put it
   on the market (see the failure/succession entry). Still open: NPC mortality
   (a CS4 item — the succession block leaves it a one-loop seam).
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

- **(numbers superseded 2026-08-19** by THE SLEEP DIRECTIVES in the
  needs-failure entry: TIRED_SHIFT 0.45 -> 0.60, TIRED_DRAIN 0.5/0.25 ->
  0.30/0.10, TIRED_NAP 0.4/0.2 -> 0.24/0.08, and the accrual is continuous
  through the shift instead of a lump at knock-off. Everything below is the
  shape, which is unchanged.**
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
