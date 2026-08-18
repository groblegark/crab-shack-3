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
- **UI**: title → lease-signing intro (Mr. Pincherton) → play. CREW / SHOP /
  MENU tabs, BILL chip (itemized nightly bill), follow-cam on ANY crab
  including NPCs, fast-forward >>/>>> (F), master mute (M).

### Verified balance (8 seeds, tools/headless.mjs)
- Baseline (buy nothing): **0/8 survive, evicted day 9–20, median 13**.
- Hire-and-seat strategy (`--buy chef,table`): **7/8 alive at day 40**.
- Constants: shack rent 250, wage 22, house rent 10, hires 60×2.0,
  showers 5/10, fish pay 13.
- Causal notes from calibration: rep saturates for every town so *capacity*
  (chef count) binds; crew deaths were the escape-killer (sick crabs can't
  re-clean, so cheap showers matter); buy *timing* beat buy prices.

## Tools (the load-bearing part)
- `node tools/suite.mjs` — **18 scenarios, must stay green before any push.**
  Covers balance curves, dishes/dining, errands, staff meals, stuck-crab
  detection (baseline + full town), 3x-dt stability, homeless recovery,
  disease infection/cure/mortality, showers turnover, NPC economics,
  save/load, no-inflation wallet bounds.
- `node tools/headless.mjs --days N --seeds K [--buy list] [--quiet]` — CLI.
- `tools/simlib.mjs` — the sim core: real game files in a vm with stubbed
  browser APIs, seeded RNG, `runUntil`/`runDays`. ~10 sim-days/sec.
- Dev flags: `?fresh` (no save), `?turbo=N`.
- Browser testing: serve on a spare port, use a playwright route handler to
  bypass cache (`await p.route('**/*', r => r.continue())`) — the dev server
  caches game files hard; only index.html gets a `?t=` bust.

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
   as a wall fixture at the y136 row), followable-NPC polish.

## Conventions
- Suite green before push; economy changes need a matrix re-run.
- Big features → fork subagents in git worktrees (they don't push; the parent
  reviews screenshots + suite output, merges, re-verifies, pushes).
- Balance work happens in the sim, not by intuition — measure, then tune.
