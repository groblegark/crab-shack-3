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
  while homeless. World is 2192 wide.
- **Job board / labor market**: a notice board at x716 (clickable — postings +
  town payrolls). Each morning at 7:30 (`runJobBoard`) NPC owners post when
  flush (till ≥ 260, staff < 2) or when their shop went dark; jobless fishers
  take postings ($20/day, `p.employer`); a posting unfilled for a full day
  pulls a drifter off the morning bus (cap 8 npcs, they start homeless with a
  fishSpot fallback). Owners pay staff from their till at settlement or the
  staff quit back to the pier. Crew reassignment now lives in the dossier
  ("TAP: REASSIGN" on the DOES row) plus a labeled JOB> chip on the follow
  card — the old 13px unlabeled chip was the "can't assign staff" bug.
- **Sick crabs can move**: bed rest no longer bars essential errands — the
  sick still buy food and drag themselves to the showers (half
  speed), which feeds the `cared` check that improves cure and death odds.
  Arcade nights stay off-limits. This closed the calibration-flagged spiral
  where the sick couldn't re-clean.
- **UI**: title → lease-signing intro (Mr. Pincherton) → play. CREW / SHOP /
  MENU tabs, BILL chip (itemized nightly bill), follow-cam on ANY crab
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
- `node tools/suite.mjs` — **44 scenarios, must stay green before any push.**
  Covers balance curves, dishes/dining, errands, staff meals, stuck-crab
  detection (baseline + full town), 6x-dt stability, homeless recovery,
  NPC housing ladder, boat rung + catch boost, sick-crab mobility,
  job-board hire/payroll/quit, stall-wedge soak, T1 trade-ledger flows,
  line-of-credit draw/bankruptcy/predictor-lead/roundtrip,
  disease infection/cure/mortality, showers turnover, NPC economics,
  save/load (incl. boat berths), no-inflation wallet bounds, needs-drag
  visibility, laundromat-removal migration (one-shot refund) + dirt
  serviced by showers alone, thirst serviced end-to-end at the bar,
  parched-spiral sickness attribution (with a watered control arm), and
  juicebar economics (ledger flows charged-vs-tracked, staff retail,
  save/load roundtrip of thirst + unlock + firstPour).
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

## Backlog (rough priority)
1. **Business settings** — per-business config (staff-meal pricing
   retail/at-cost/free is already TODO-marked in game.js; then prices, hours,
   staffing rules). Matt: "seems obvious now".
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
- **Tiredness replaces sandiness** (Matt 2026-08-18): drop the SPA/sandy need;
  in its place TIRED, accrued by work/errands, repaired by SLEEP — faster in
  your own bed (house/boat) than on a shelter cot. Showers become dirt-only.
  SEQUENCE AFTER the T2 thirst merge — T2 is concurrently rewriting the needs
  bars, sickness-risk table, and quips; doing both at once guarantees a
  semantic collision. Touches: needs bars/dossier, sickness risk (sandy ≥
  0.95 term), shower recipes/needsBath, crew shift-end bumps, suite pins.
- **Per-owner everything; all crabs equal** (Matt 2026-08-18): "no public
  utilities, no town payroll — per-owner … all crabs should be equal in the
  simulation, they just start with different stuff." Language pass done
  (job-board card now reads WHO WORKS FOR WHOM, PAID BY <owner>). Mechanical
  equality audit still open: NPCs currently CANNOT die (crew can); NPC_WAGE
  20 vs CRAB_WAGE 22; tourists are a separate entity class rather than crabs
  with a suitcase. Direction: one simulation contract for every crab,
  differing only in starting assets/relationships.
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
