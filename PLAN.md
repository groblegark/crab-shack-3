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
crabs spend their own wallets on meals, laundry, showers, arcade → reputation
compounds or collapses → the landlord collects at 20:00 either way.

### Systems (all in game.js unless noted)
- **Businesses** (`BIZ` table, data-driven): CRAB SHACK (player), SUDS N
  BUBBLES laundromat ($400 unlock), THE CLAWCADE ($650), SUDS SHOWERS
  (NPC-owned by SUDSY). Each: stations, recipes, queue, rent, owner.
- **Owner layer**: `OWNERS` registry + `creditBiz`/`debitBiz`/`ownerFunds`.
  The player's till IS `coins`. NPC revenue never touches player books.
- **Crabs**: personas (name, trait, commute mode, accessory, shift, wallet,
  house), needs FED/CLN/FUN/SPA, homes they live inside, the shelter for the
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
  sick still buy food and drag themselves to the cleaners/showers (half
  speed), which feeds the `cared` check that improves cure and death odds.
  Arcade nights stay off-limits. This closed the calibration-flagged spiral
  where the sick couldn't re-clean.
- **UI**: title → lease-signing intro (Mr. Pincherton) → play. CREW / SHOP /
  MENU tabs, BILL chip (itemized nightly bill), follow-cam on ANY crab
  including NPCs, fast-forward >>/>>>/>>>> = 2/3/6x (F), master mute (M).
- **Crab dossier**: clicking the follow card opens a full-screen record —
  job, shift, wallet, housing, health, need bars, claims to fame. Click or
  Esc closes. Works for every crab, crew and townsfolk alike.

### Verified balance (8 seeds, tools/headless.mjs)
- Baseline (buy nothing): **0/8 survive, evicted day 9–15, median 12**. The job
  board added labor competition (a hired-away fisher lowers townCatch, pushing
  the shack onto $7 import fish) — SUDSY's flush-hire threshold sits at
  till ≥ 260 to keep that pressure off the earliest days.
- Hire-and-seat strategy (`--buy chef,table`): **2/6 alive at day 40**.
- Constants: shack rent 230, wage 22, house rent 10, hires 60×2.0,
  showers 5/10, fish pay 13. **Rent is charged from night one** — you open
  with $150 in your pocket and have to trade your way to the first payment.
- **Queue**: 5 slots, of which tourists may fill 4 — the 5th is reserved for
  locals (crew + neighbours). Staff claim paying guests first and serve locals
  in the lulls.
- History worth knowing: an earlier build measured 7/8 escape, but that number
  was inflated by a bug — at saturated reputation tourists filled every slot
  and locals never got served (free revenue, no service cost, and a quiet
  sickness spiral). Fixing it made growth genuinely harder. If escape needs to
  come up, prefer capacity/throughput levers over re-hiding the locals.
- Causal notes from calibration: rep saturates for every town so *capacity*
  (chef count) binds; crew deaths were the escape-killer (sick crabs can't
  re-clean, so cheap showers matter); buy *timing* beat buy prices.

## Tools (the load-bearing part)
- `node tools/suite.mjs` — **22 scenarios, must stay green before any push.**
  Covers balance curves, dishes/dining, errands, staff meals, stuck-crab
  detection (baseline + full town), 6x-dt stability, homeless recovery,
  NPC housing ladder, sick-crab mobility, job-board hire/payroll/quit,
  disease infection/cure/mortality, showers turnover, NPC economics,
  save/load, no-inflation wallet bounds.
- `node tools/headless.mjs --days N --seeds K [--buy list] [--quiet]` — CLI.
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

## Backlog (rough priority)
1. **Business settings** — per-business config (staff-meal pricing
   retail/at-cost/free is already TODO-marked in game.js; then prices, hours,
   staffing rules). Matt: "seems obvious now".
2. **More peer owners moving in** — the owner layer makes this content, not
   surgery: an OWNERS entry + BIZ entry + an NPC crab. Fish market buying
   wholesale off the pier is the natural next one.
3. **Player-avatar crab** — make `owner: "player"` also a walkable crab.
4. **Fishing expansion** — hire fishers directly; fired/unhired crew return to
   the pier; weather/catch variance; quotas; a boat.
5. **NPC eviction / move-outs** — NPC owners currently skip rent when short
   (TODO in the settlement block); no mortality for NPCs either.
6. Staff-bused table service for a fancier restaurant tier.
7. Cosmetics: closed-eye sleep sprites, taller shower-stall art (curtain reads
   as a wall fixture at the y136 row), followable-NPC polish, and **pier plank
   art** — PIER_X0/X1/Y exist and fishers stand there, but no planks were ever
   drawn; they fish standing on the road's far edge.
8. ~~Secret mobile merge mode~~ — **shipped**: touch-only hidden mode (hold a
   crab until the thought bubble fills), per-crab boards, goal ladder pays
   into the till ($60/session cap). Lives in merge.js, desktop-inert.
9. **Portrait-phone canvas** — the screen fills a phone's width but the 256x240
   aspect leaves dead space above/below on tall screens. A real fix is a taller
   canvas in portrait (e.g. 256x288, extra rows going to the UI panel): `H` is
   baked into ppu.js and panel draw coordinates, so it's a contained but real
   refactor. Wheel/trackpad panning, no-zoom, no pull-to-refresh, and crisp
   half-step scaling are already in.

## Conventions
- Suite green before push; economy changes need a matrix re-run.
- Big features → fork subagents in git worktrees (they don't push; the parent
  reviews screenshots + suite output, merges, re-verifies, pushes).
- Balance work happens in the sim, not by intuition — measure, then tune.
