# Needs that fail in their own character — design proposal

*Design exploration, 2026-08-19. No code written. Matt picks; the build follows.*

## Summary

Today all five needs fail the same way: the bar fills, the crab runs an errand
if it can afford one, `crabEff` shaves a few percent, and at 0.95 a flat number
gets added to a sickness roll. Parched and starving look identical from the
boardwalk. The proposal below gives each need a **distinct verb** — hunger
*takes*, thirst *stops*, dirt *repels*, boredom *drifts*, tiredness *stalls* —
so that ten seconds of watching tells you which one it is. Every pattern is
written as the crab pursuing its own interest, never as a punishment: a hungry
chef eats the fish because it is right there and he is hungry; a bored server
walks to the pier because the sea is more interesting than an empty counter.
Three of the five come paired with an **environmental fix** (a public tap, a
beach forage, free fun) — because the sim probe below shows that four of the
five needs are currently unservable for large parts of the town, and a failure
pattern layered on an unfair environment is cruelty, not drama.

**Sequencing recommendation: land the environmental fixes first, measured, then
spend the runway they buy on the failure patterns.** The escape promise was
restored two days ago (4/8 at day 40); most of these patterns cost throughput,
and the fixes are what pay for them.

---

## Recommendations at a glance

| need | recommended pattern | one-line why |
|---|---|---|
| **HUNGER** | **THE RAID** — a starving crab eats the stock it is standing in | Hunger's verb is *take*. Costs the player inventory and a guest's plate, not the crab's health — endearing early, and the crab with nothing to raid is the one who starves. |
| **THIRST** | **THE SHORT LEASH** — a parched crab stops travelling | Exact opposite of hunger: hunger walks anywhere, thirst walks nowhere. One crab stood dead still in the shade while the town moves around them is the most legible tell in the set. |
| **DIRT** | **THE WIDE BERTH** — the town physically gives a filthy crab room | Dirt is a *social* need, so it should fail socially. Readable at a glance as a bubble of empty space that follows one crab around. |
| **BOREDOM** | **IDLE HANDS** — bored crabs wander off post, and two who meet stop and talk | Boredom's verb is *drift*. The chatter half is its own cure, which turns boredom into a loneliness need — and finally makes it something other than a $650 paywall. |
| **TIREDNESS** | **THE MICROSLEEP** — an exhausted crab nods off at the station, holding the slot | Tiredness stalls rather than slows. The Z-drift sprite already exists; the late stage (sleeping where you fall, banking no rest) is a genuine spiral that prevents its own cure. |

Paired environmental fixes, in priority order: **public tap** (thirst),
**free fun** (boredom), **beach forage** (hunger). See each section.

---

## What the sim actually does today (measured, don't take my word for it)

`tools/simlib.mjs`, 3 seeds, baseline town (no buys), evening snapshot of every
crab every day to eviction (day 11 / 14 / 15):

| crab | FED | SIP | DIRT | BORED | TIRED |
|---|---|---|---|---|---|
| PINCHY (crew, M) | 0.32 | 0.29 | 0.68 | **0.83** | 0.35 |
| CLAWDIA (crew, E) | 0.13 | 0.05 | 0.63 | **0.72** | 0.03 |
| SUDSY (owner-operator) | **0.66** | **0.73** | **0.79** | **0.74** | 0.31 |
| SALTY / DRIFT (fishers) | 0.43 | 0.40 | 0.71 | **0.78** | 0.44 |

(means of the daily evening reading, averaged across the three seeds; every crab
in every seed touched **1.00 dirt and 1.00 bored** at some point.)

Five things fall out of that table, and they matter more than any pattern below:

1. **Boredom is already broken.** It sits at 0.7–0.85 town-wide, forever,
   because the only cure is a $650 arcade the baseline town never buys. Its
   only consequence is a −20% walk speed (`crabMove`). So the whole town has
   been walking one-fifth slow for the entire history of the game and nobody
   could see it. Whatever we do here, boredom needs a *free* outlet.
2. **Thirst is the only need that actually kills.** Sickness causes across the
   three seeds: `thirst` ×3, `dirt` ×2. Never hunger, never exhaustion.
3. **"Some crabs just never drink" is a money gate, not an hours gate.** With
   the juice bar locked, the only drink in town is the shack's JUICE at $10 →
   $13 retail, and `pickErrand` requires `wallet ≥ ceil(pay×1.25)+2` = **$15**.
   SUDSY's wallet averages $21–34 but she tops up from a till that is usually
   near zero, and food (rank 4) outbids drink (rank 3) for every dollar she
   has. Town-wide drinks over ~13 days: **12–15**. There is no free water
   anywhere in the world.
4. **The shower attendant can never shower.** `pickErrand` gates the bath on
   `c.workBiz !== "showers"`, and `workBiz` is *sticky* — set on clock-in
   (game.js:1635, and :902 for SUDSY at spawn) and never cleared. SUDSY is
   excluded from her own stalls twenty-four hours a day, for life. Her dirt
   pins at 1.00 → −6% `crabEff`, **−30% on every tip she takes**, +0.06
   sickness a night, permanently. This is a bug, not a design choice, and it
   is worth fixing whichever pattern wins.
5. **Tiredness never gets dangerous in a baseline town.** Sleep drain (0.5/h
   in a bed) is strong enough that the peak is 0.5 for crew, 0.78 for fishers
   — the `≥0.95` sickness term essentially never fires. A tiredness failure
   pattern only exists in OT towns, covering doubles, and boat-dwelling
   fishers. That is fine, but it means tiredness is a *growth-town* pressure
   by construction, and it will land on exactly the strategy that escapes.

---

## HUNGER — "take"

### Candidates

**H1. THE RAID (recommended).** A crab past hunger ~0.8 who is *standing in a
kitchen* eats the kitchen. A chef at the crate takes a fish and eats it raw at
the counter; a server carrying a plate to a table stops, hunches, and eats it.
Hunger drops, the ingredient is gone, the guest waits.

**H2. FOOD TUNNEL VISION.** Past DIRE, hunger blanks out every other errand and
the crab jumps any food queue, cutting in front of tourists. Rejected as
primary: the queue-jump is a reputation weapon and rep is a compounding system —
it makes hunger the single most punishing need in the game, which is the
opposite of "endearing early". Worth keeping as a *small* piece of the raid:
past DIRE a crab ignores all non-food stops. (That is nearly free — `errandScore`
already returns `99 + rank` at DIRE.)

**H3. FUMBLED PLATES.** A hungry server drops carried dishes with rising odds,
then eats them off the boardwalk. Charming once, grating the fourth time, and
it duplicates tiredness's error-shaped failure. Rejected.

**H4. THE BEACH FORAGE (recommended as H1's environmental fix, not as the
pattern).** A hungry crab with no money and no kitchen walks to the tide line
and forages: ~25 game-minutes crouched at the water's edge, hunger −0.4, no
money moves, nothing enters the economy. This is the fisher's driftwood roast
(`updateFishing`, game.js:2483) generalised to everyone.

### The recommendation, in world

PINCHY is on the grill at 15:40, hunger 0.84, wallet $6 — nothing he can buy,
and CLAWDIA's line is four deep. He walks a fish from the crate to the board,
stops, looks at it, and eats it standing up. `−1 FISH` pops in red over the
counter. The tourist at table 2 watches her taco not arrive.

- quips: `"JUST THE ONE"` · `"I'LL PAY IT BACK"` · `"NOBODY SAW THAT"` ·
  (caught by another crab within 40px) `"...WHAT."`
- mood: **RAIDING** (orange), above HUNGRY on the ladder
- status line: `SNEAKING A FISH` / `EATING THE STOCK`
- late stage, no kitchen in reach: the forage — status `COMBING THE TIDE
  LINE`, quips `"SEAWEED AGAIN"` · `"THE SEA PROVIDES"` (SALTY's line already)

### Mechanical hook

- `updateKitchen` — new `kstate: "raiding"`, entered from `walk`/`toSlot` when
  `hunger ≥ RAID_AT (0.8)` and the crab is inside their own biz. Consumes the
  raw the crab is carrying (or one from `biz.source`), `debitBiz` the
  ingredient cost with no `creditBiz`, `hunger -= 0.5`, releases the slot,
  aborts the claim (reuse `abortChef` so the guest goes back in the pool
  rather than stranding — the abort path is already correct for this).
- `pickErrand` / `errandScore` — DIRE already ignores geography; add "and
  ignores non-food candidates", one filter.
- `updateHome` / a new `updateForage` — the forage is a dayState like
  `selfCook`: walk to `FLOOR_MAX` at the nearest sand, timer, `hunger -= 0.4`.
  Gate on `wallet < cheapest affordable meal` so it never competes with a real
  sale.

### Cost / risk

- **Costs the player money, not the crab's life** — that is the point. One raid
  is the ingredient ($2–7 at market price) plus one delayed serve plus the tip
  decay on that guest's patience. Two raids in a service is a walkout.
- **Degenerate case**: a permanently-broke crew raids the crate every shift and
  the kitchen never earns. Guard: `RAID_CD` (one per crab per shift), and the
  raid does *not* fully clear hunger (−0.5, not to zero) so the errand system
  still wants a real meal.
- **Interacts with**: the fish market (a raid counts as `trade.useDay`, so it
  pushes the pier price up — correct and legible); staff-meal policy (a shop on
  FREE meals should almost never see a raid, which makes `mealPol` a real
  decision for the first time); auto-manage (nothing); sick days (a sick crab
  at home can't raid — the forage covers them).
- **Balance direction**: shortens runway. Baseline crew hunger peaks at 0.5
  today, so raids will be *rare* in baseline towns and common in understaffed
  growth towns — it taxes exactly the strategy that escapes. Expect the growth
  matrix to move; the forage pushes the other way.

### Measurement

- `_stats.raids` per town-day, split crew/NPC; target **< 1 per crew-day** in a
  well-run town, > 3 in a neglected one.
- Ingredient loss as a share of `debitBiz` volume; gate at ~5% baseline.
- Suite scenario: a hungry, broke chef at a staffed counter raids exactly once,
  the guest is re-pooled (not stranded), and the stall/slot is released
  (the `abortErrand` soak already has the shape).
- Suite scenario: a penniless crab far from any kitchen forages and does not
  starve to sickness — the fairness pin.
- Matrix: baseline 8×30d (expect median −0 to −1), growth `--buy chef,table`
  8×40d (expect the real movement).

---

## THIRST — "stop"

### Candidates

**T1. THE SHORT LEASH (recommended).** Thirst collapses a crab's willingness to
travel. Past ~0.6, `DETOUR_SCALE` and `DETOUR_MAX` shrink with thirst; past
~0.85 the crab will not *start* any trip over ~200px — they will not commute,
will not chain, will not cross town for a $6 juice. They plant themselves in
the nearest shade and wait. The one thing they will still walk to is water,
inside that radius.

**T2. HEAT SHIMMER.** Parched movement becomes stuttering rather than slow —
walk four steps, stop, pant, walk four steps. Visually distinct from tiredness
(slow and steady). Good flavour; cheap; **recommended as a rendering companion
to T1, not as the pattern** — on its own it's a reskin of the existing −15%.

**T3. THE SNAPPISH SERVER.** Parched crabs lose their charm: tip multiplier
collapses and guests within their service radius lose patience faster.
Rejected as primary — it duplicates dirt's social failure and puts a second
compounding rep drain in the game.

**T4. THE BENDER.** A parched crab that finally reaches a bar drinks *again*,
and again, blowing the wallet on COOLERs and falling off the housing ladder.
Charming, economic rather than medical, and a nice second-order effect — worth
keeping as a small rider on T1 (a crab who was past 0.9 buys twice).

### The recommendation, in world

SUDSY, 16:10, thirst 0.88, $19 in her apron. The shack is 300px east and it is
open. She does not go. She stands in the shadow of her own stall sign and does
not move for forty minutes. Her stalls go dirty behind her. The town keeps
walking past.

- quips (already exist, keep them): `"PARCHED..."` · `"SO DRY"` ·
  `"JUICE. PLEASE."` · new: `"NOT ONE MORE STEP"` · `"TOO FAR"`
- mood: **PARCHED** (exists), and the follow card wants a `LEASH 200PX` line
  the way OT gets a tag
- status line: `TOO PARCHED TO WALK IT` (this is the ten-second tell — the
  follow card names the reason the crab is idle)
- the tell without the card: **one crab standing still while the boardwalk
  moves.** Nothing else in the game does that.

### Mechanical hook

- `errandScore` — `DETOUR_SCALE` and `DETOUR_MAX` become functions of
  `thirst`: `SCALE * (1 - 0.8*t)`, `MAX * (1 - 0.9*t)`. Two lines, and it uses
  the trip-chaining machinery *as designed* rather than bolting a new system on.
- `startCommute` / `updateSchedule` — past `LEASH_AT (0.85)`, refuse to start a
  commute longer than `LEASH_PX`; the crab holds `dayState: "home"` (or stays
  on post) and pops the refusal ("TOO FAR") the same way a directed-order
  refusal pops. **Never silently.**
- `crabMove` — keep the existing −15%; add T2's stutter as a render/step
  cadence, not a new speed term.
- Deliberately **no `crabEff` term** — PLAN parks that on purpose and the leash
  is a better expression of the same pressure.

### The environmental fix that must ship with it: THE PUBLIC TAP

A standpipe. Free, unstaffed, no queue, no shop hours: walk up, drink, thirst
→ 0.3 (not 0 — juice still quenches fully, so the bar keeps its value), five
seconds, one gallon through `tradeImport("water", 1)` so the ledger sees it.
**Two of them: one at the shelter, one on the pier.** Cost: nothing to the
player, a walk to the crab.

This is the honest fix for "some crabs just never drink." Today thirst is a
**wallet** problem — $15 minimum, and food outranks drink for every dollar —
so the poorest crabs in town (broke owner-operators, homeless fishers, a new
hire on their first night) are structurally unable to drink and then die of it.
That is unfair, not dramatic. With taps in the world, thirst becomes a **time
and distance** problem, which is exactly what the short leash makes interesting:
the leash is only cruel if there is no water inside it, and the taps guarantee
there is water inside it for anyone who acts before 0.85.

### Cost / risk

- **The taps will lengthen the runway** — PLAN calls the parched-fisher
  sickness line "the intended new pressure" from T2, and free water removes a
  chunk of it. Expect baseline median to move up 1–2 days. The leash pushes
  back (lost commutes = lost work hours), and the two should be measured
  *together*, in one matrix, or neither number means anything.
- **Degenerate case**: a crab leashed at 0.85 whose nearest water is 400px away
  never drinks and dies stood still — the exact unfairness we are trying to
  delete. Guard: the leash **exempts water**. `LEASH_PX` bounds every
  destination *except* a drink stop, which keeps its DIRE exemption. The crab
  will always walk to water; they just won't walk to work.
- **Interacts with**: shop hours (irrelevant now — taps have none, which is the
  point); the reserved 5th queue slot (relieved, taps have no queue); trip
  chaining (the leash shrinks the chain radius naturally); the juice bar
  economy (**watch this** — free water could gut drink sales; mitigation is the
  tap's 0.3 floor plus tourists, who are additive demand and never use taps).
- **Fairness callout**: with taps in, thirst deaths should become *rare and
  earned* — a crab who was too busy, not a crab who was too poor. If the sim
  still shows a crab dying of thirst with a tap 100px away, that's a bug in
  the leash, not a story.

### Measurement

- `_stats.tapDrinks` vs `crabDrinks` (retail). Target: taps carry the poor, the
  bar keeps the flush — retail drinks should **not** fall more than ~25%.
- Per-crab thirst p90 by wallet decile: the bottom decile is the one that must
  move. Today it's 0.9+; target < 0.6.
- Sickness cause histogram (`_stats.causes`): thirst should drop from #1 to
  roughly level with dirt.
- "Leash minutes": crab-minutes spent refusing a trip, per town-day. If it
  exceeds ~30/crab-day the leash is too tight.
- Suite: a broke crab with no bar in town reaches a tap and never crosses 0.9
  (the fairness pin); a leashed crab still walks to water but not to work.

---

## DIRT — "repel"

### Candidates

**D1. THE WIDE BERTH (recommended).** Dirt inflates a crab's personal space.
Other crabs push off harder and further in `collide`; tourists refuse the table
next to them and won't be *served* by them without a patience cost. A visible
bubble of empty boardwalk follows the crab around.

**D2. THE SMUDGE TRAIL.** A filthy crab dirties what they touch: stations they
work pick up grime that slows prep for everyone until someone cleans it; tables
they sit at need busing. Mechanically the strongest idea in this section — it
fits the existing facilities pattern (stall goes dirty → staff cleans it)
exactly, and it makes one crab's dirt a *team* cost. Held back only because,
with SUDSY currently unable to wash and the showers being a single-attendant
NPC shop that closes Sundays, a contagious dirt mechanic today would spiral a
town in a week. **Recommended as the loosening after D1 lands and the shower
access bugs are fixed.**

**D3. THE ITCH.** Periodic stop-and-scratch mid-task. Cheap, mildly legible,
duplicates the microsleep's shape. Rejected.

**D4. SELF-CONSCIOUS.** The crab hides at the back stations and refuses
front-of-house and refuses to queue in public. Reads as "the game punished the
crab" — it's the one candidate in this whole document that fails the thesis
test. Rejected on principle, recorded so nobody re-proposes it.

### The recommendation, in world

DRIFT has not seen a shower in nine days. He walks the promenade and it parts
for him — crabs he passes shove off two body-widths early instead of brushing
by. He takes an order at the pass and the tourist leans back. Her tip is
$0. The picnic table beside him stays empty while the far one fills.

- flavour: a two-frame stink-mark (`DIRT_MARK`, same family as `OT_MARK`) — a
  fly, or two wavy lines — bobbing over the shell
- quips: `"I'VE BEEN BUSY"` · `"IT'S SEA SALT, MOSTLY"` · `"NOBODY MIND ME"`
- passers-by quip: `"...WHOA"` · `"MIND THE BREEZE"`
- mood: **RANK** (brown), sits below HUNGRY on the ladder
- the ten-second tell: **the empty circle that moves with him.**

### Mechanical hook

- `collide` — the 12px separation radius becomes `12 + 10*max(0, dirt-0.6)/0.4`
  for the dirty crab's pairs. That's one expression in an existing loop and it
  costs nothing.
- Tourist seating (`updateKitchen`'s `seat = bts.find(...)`) — prefer a table
  with no filthy crab within ~40px; if none, seat anyway (never strand a
  guest).
- `payAndBenefit` — the tip already scales `(1 - 0.3*dirt)`. Extend to the
  *rep* line: a tourist served by a crab past 0.85 dirt gives **no** rep bump
  instead of +0.8/+0.4 (don't make it negative — that's punishment, not
  indifference).
- Customer patience: `-20%` drain rate while a filthy crab is the one who
  claimed them. Small; this is the piece to cut first if the balance moves.

### The environmental fixes that belong with it

1. **Fix the sticky `workBiz` gate** (game.js:2017). The shower attendant must
   be able to use the showers when off shift — either compare against
   `c.duty && c.workBiz === "showers"` or clear `workBiz` at knock-off. This is
   a bug fix, not a design change, and SUDSY's whole health picture turns on it.
2. **A rinse at the tap.** The standpipes from the thirst section take dirt
   down 0.15 alongside the drink — a splash, not a wash. Keeps SUDS SHOWERS'
   business model intact (0.5/0.7 per proper shower) while ensuring nobody is
   *structurally* unable to get clean when the one shower shop is shut, on
   holiday, or bankrupt.

### Cost / risk

- **Balance direction**: shortens runway, via rep and tips — the two most
  compounding systems in the game. This is the pattern most likely to over-fire.
  Recommend shipping D1 with the *rep* clause dark (a flag) and turning it on
  in a second measured pass.
- **Degenerate case**: a filthy crab whose exclusion radius keeps them from
  reaching a station at all → deadlock. Guard: the inflated radius applies only
  to crab-crab separation, never to station/furniture solids, and it is
  *ignored* by the auto-unstick watchdog's progress test (otherwise it will
  read as a pin and fire sidesteps all day).
- **Interacts with**: SUDSY's hours policy (a filthy town = busier stalls = she
  extends hours = more washing — a nice self-correcting loop, and worth
  watching for oscillation the way the hog cycle was); the shelter (homeless
  crabs share cots — the contagion term already fires there, and a wide-berth
  bubble in a 4-cot shelter is physically absurd, so **suppress it indoors /
  at night**).

### Measurement

- Mean crew dirt in a well-run town should sit *below* 0.6 after the fixes;
  today it is 0.63–0.83.
- Shower serves per town-day before/after (SUDSY's till is the canary —
  PLAN documents it as seed-noisy, so use 6+ seeds).
- Tourist rage count and rep curve, with the rep clause on and off.
- Warps/unsticks per town-day must not move (the collide guard above).
- Suite: a shower attendant off shift can wash (the regression pin for the
  `workBiz` bug); a filthy crab still reaches every station in the shack.

---

## BOREDOM — "drift"

Boredom is the need in the worst shape and the biggest opportunity. It is
pinned near 0.8 town-wide, has zero danger, and its only cure costs $650.

### Candidates

**B1. IDLE HANDS — wander-off + chatter (recommended, both halves, one pass).**
*Wander-off*: a bored crab on shift with no order claimed stops loitering by
the door and takes itself somewhere — the end of the pier to watch the fishers,
the tide line, the arcade window. Still clocked in; when an order lands they
have to walk back. *Chatter*: two crabs who pass within ~30px, both bored past
~0.5, and neither carrying, stop and talk for 20–40 game-seconds. Both lose
0.15 boredom. That is a **free, emergent cure** — and it makes boredom a
loneliness need: the crowded shack is fine, the solo shower attendant and the
lone fisher on the far rail are not.

**B2. MISCHIEF.** Bored crabs play with the equipment — juggling plates, a
free go on the claw machine after hours, drawing in the sand. Occasional
dropped item. Fun, but it reads as scripted misbehaviour and it duplicates the
raid's "crab consumes the shop" shape. Keep one piece: a bored crab on the
arcade shift plays a machine on their break (costs a `power` import, credits
nothing) — that is a crab pursuing its own interest, and it's funny.

**B3. THE WALK-OUT.** Past 0.95 for two days, the crab takes an unauthorised
day: doesn't commute, spends the day on the beach, no wage. Real stakes, no
death. **Recommended as B1's late stage** rather than as its own pattern.

**B4. THE RESIGNATION.** Past 0.95 for four days the crab quits — walks to the
west bus stop and leaves town. Permanent loss of a crew member without a
memorial. Emotionally *heavier* than death in some ways, and it needs its own
conversation; parked as an open question below.

### The recommendation, in world

CLAWDIA's 14:00 shift is dead — rep is low, no tourists. She drifts east past
the pass, off the shack lot entirely, down to the pier rail, and stands next to
SALTY watching him cast. They start talking. Both FUN bars tick up. At 15:20 a
tourist arrives at the shack queue and CLAWDIA has 300px to walk back.

- wander quips: `"NOTHING DOING"` · `"JUST STRETCHING MY LEGS"` ·
  `"WONDER IF THEY'RE BITING"` · `"BACK IN A TICK"`
- chatter quips (alternating, two bubbles): `"YOU'LL NEVER GUESS"` ·
  `"SHE DIDN'T!"` · `"...ANYWAY"` · `"BETTER GET BACK"`
- mood: **RESTLESS** (grey-blue) at 0.6, **AT A LOOSE END** at 0.85
- status: `WANDERED OFF` / `CHEWING THE FAT WITH SALTY`
- the ten-second tell: **a crab in the wrong part of town, standing still,
  facing the sea.** Or two crabs stood together doing nothing, which reads as a
  town rather than a spreadsheet — and that alone might be worth the pass.

### Mechanical hook

- `updateKitchen`'s `idle` branch — instead of always loitering at
  `biz.door + 4`, past `WANDER_AT (0.6)` pick a `wanderSpot()` (pier rail,
  tide line, a shopfront window) within `WANDER_PX`, walk there via
  `routedStep`, and stand. Claim logic is untouched: `kstate: "idle"` still
  scans the queue every frame, so a guest simply costs the walk back.
- Chatter: a pass in `collide` (it already iterates every crab pair and
  measures distance — the check is free) setting `c.chatT` on both; a
  `dayState`/`kstate` that just holds position and quips. `bored -= 0.15` on
  completion, `CHAT_CD` per crab per hour so two crabs don't stand there
  forever.
- `maybeQuip` — alternate the two speakers' bubbles so it reads as a
  conversation rather than two monologues.
- Walk-out (late stage): `updateSchedule`, same shape as `restDay`/`restUntil`
  which already exists for right-click "knock off" orders — reuse it whole.

### The environmental fix that belongs with it: FREE FUN

The arcade cannot be the only fun in town. Cheap, free FUN sources, each worth
~0.2–0.3 with a walk and a cooldown:

- **the pier rail** — watch the fishers (and it puts crabs where the catch
  splash and the gull cries already are)
- **the tide line** — beachcombing, which the *day-off* code already does
  (`updateHome`'s off-day amble) and which nobody else can reach
- **the chatter above** — the social cure, free, emergent
- optional: a busker / the jukebox tied to the existing music toggle, which
  would double as the "sell the music" feature request

That reframes the arcade honestly: not the only cure for boredom, but the
*fast* one — you pay $13 to fix in three minutes what the pier fixes in forty.
That's a purchase decision instead of a paywall.

### Cost / risk

- **Balance direction**: wander-off shortens runway (walk-backs are lost
  serves, and they land hardest on thin crews); free fun lengthens it (a −20%
  town-wide walk penalty finally lifting is a *big* recovered-hours effect, in
  the same family as the trip-chaining pass that moved growth from 0/8 to 2/8).
  **These two must ship and be measured together.** My honest expectation is
  the net is positive for the player, and that's fine — it's the same
  "environment fix pays for itself" shape the devlog is built on.
- **Degenerate cases**: (a) a wandering crab and a chattering crab meet and
  neither ever returns to post → hard cap `WANDER_PX` and force a return the
  moment `pending` is non-empty; (b) chatter as a free boredom fountain that
  makes the arcade worthless → cooldown + the arcade's larger, instant cure +
  chatter requires *both* parties bored, so a well-run crew rarely qualifies;
  (c) wandering crabs cross travel lanes and re-open the bouncing problem →
  `wanderSpot()` must go through `clearSpotY()` and the lane tripwire scenario
  must still pass.
- **Interacts with**: fishers (a wandering crab at the pier is standing where
  `fishSpotFor()` places rails — keep clear); the auto-unstick watchdog
  (a *standing* crab never qualifies, so this is safe by construction); days
  off (already the "errands at relaxed thresholds" path — wander-off should be
  suppressed on days off, they're already beachcombing).

### Measurement

- Mean/p90 boredom town-wide: today 0.78 mean / 1.0 max. Target mean < 0.45
  with free fun in.
- Effective walk speed town-wide (the −20% `crabMove` term) — this is the
  number that pays for everything else.
- Serves lost to walk-backs: `_stats.wanderReturns` and mean return distance.
  Gate: < 1 lost serve per crew-day.
- Arcade revenue before/after free fun — if it falls more than ~30%, the free
  sources are too strong.
- Suite: a bored crab on a dead shift wanders and still claims a guest who
  arrives; two bored crabs who meet both lose boredom exactly once per cooldown.

---

## TIREDNESS — "stall"

### Candidates

**TI1. THE MICROSLEEP (recommended).** Past ~0.85, timed work has a per-second
chance to stall: the crab freezes mid-task, a Z drifts up (the sleep sprite and
Z-drift already exist), 2–5 seconds, then a jolt awake. Crucially they **keep
the station slot** while asleep, so it costs the whole kitchen, not just them.

**TI2. THE WRONG ORDER.** An exhausted server delivers the wrong dish. Guest
gets a taco they didn't order: no tip, small rep ding, another crab remakes it.
Charming and very legible ("THAT'S NOT MY TACO"). Strong second choice —
plugs into `serve`/`payAndBenefit` cleanly. Rejected as primary only because
it's a *rep* failure and dirt already owns that lane.

**TI3. A `crabEff` TIREDNESS TERM.** The obvious move, deliberately parked in
PLAN twice (T2 and the tiredness-replaces-sandiness pass). Rejected — a
multiplier is invisible, which is precisely the complaint this whole document
answers.

**TI4. THE SHORTCUT HOME.** An exhausted crab abandons the schedule and beds
down where they are — a bench, the sand, the shack floor. **Recommended as
TI1's late stage**, and it is the genuinely frightening one: sleeping rough
banks *no* sleep repair (bed 0.5/h, cot 0.25/h, street 0), so exhaustion
prevents its own cure. That is the tiredness death spiral, and it's honest —
nothing punished the crab, the crab just didn't make it home.

### The recommendation, in world

PINCHY, day 12, covering a full-open double, tired 0.91. He's at the grill with
a taco on. He stops. His eyes close. A Z drifts off his shell. Four seconds.
CLAWDIA is stood in the clear lane waiting for that exact grill. Then he jerks
— `"WHAT? I'M UP"` — and carries on. Twenty minutes later he does it again.
At 22:40, tired 0.97, he gets as far as the promenade bench and stops there for
the night.

- quips (exist): `"DEAD ON MY FEET"` · `"SO... SLEEPY"` · `"NEED MY BED"` ·
  new on waking: `"WHAT? I'M UP"` · `"JUST RESTING MY EYES"`
- mood: **EXHAUSTED** (exists, 0.85 — same line, good)
- status: `NODDED OFF AT THE GRILL` / `ASLEEP ON A BENCH`
- the ten-second tell: **a crab motionless at a station with a Z over them
  while work piles up.** Distinct from thirst's standing-still because it's *at
  the post*, with the animation.

### Mechanical hook

- `updateKitchen` — a guard at the top of the timed branches (`work`,
  `cleaningStall`, and the `walk` legs): if `tired ≥ NOD_AT (0.85)` and
  `random() < NOD_RATE * dt`, set `c.nodT = 2 + random()*3` and return early
  each frame while it drains. The slot is *not* released (that's the cost).
  `workT` does not tick down.
- Rendering: reuse the closed-eye sleep sprite + Z drift from the night-time
  home render; it already exists and is already charming.
- Late stage in `startCommute` / `updateCommute`: past `COLLAPSE_AT (0.97)`,
  if the remaining walk home exceeds ~250px, stop at the nearest bench/sand,
  `dayState: "home"` with a `roughSleep` flag → the `updateHome` sleep-repair
  branch is skipped entirely (or given a `TIRED_DRAIN.rough = 0.05`).
- Do **not** touch `crabEff`.

### Cost / risk

- **This lands almost exclusively on growth towns.** Baseline peaks at 0.5
  (crew) and 0.78 (fishers); 0.85+ needs overtime, a covering double, or a boat
  fisher's long day. So the microsleep is a **tax on the escape strategy**, and
  escape was just restored to 4/8 at day 40. Treat the growth matrix as the
  gate, not the baseline one.
- **Interacts with auto-manage**, and beautifully: `LABOR_CFG`'s OT-OFF rule
  already pulls a crab off overtime at tired ≥ 0.75, *below* the nod line. So a
  delegated town rarely sees a microsleep and a hands-off player town does.
  That's the auto-manage feature suddenly having a visible, legible payoff —
  which it currently lacks.
- **Degenerate cases**: (a) a nodding crab holds a slot while another crab
  waits on it → that *is* the cost, but it must not deadlock — the `waitSlot`
  crab waits in the clear lane already, so it's a delay, not a jam; verify the
  hold-and-wait fix still holds with a 5-second freeze in the mix. (b) The
  auto-unstick watchdog sees a station-held crab making no progress — it
  already excludes crabs that aren't `stepTo`-ing, so this is safe, but pin it.
  (c) Rough sleeping + the `cared` recovery ladder: a sick crab who sleeps
  rough should sit on NEGLECT odds — check `careLane` reads housing, not
  position, today, and decide deliberately.
- **Sick-day interaction**: an exhausted crab is a sick-day candidate; REQUIRE
  WORK plus microsleeps is a legibly bad policy, which is a good thing.

### Measurement

- Nods per crew-day, split by OT/no-OT and auto-manage on/off. Target: ~0 with
  auto-manage on, 2–5/crew-day in an OT-heavy hands-off town.
- Station-seconds lost to nods as a share of station time; gate ~5%.
- Rough-sleep nights per town-week, and the next-morning tired reading
  (the spiral evidence: does a rough sleeper wake worse than they went down?).
- Growth matrix `--buy chef,table` 8×40d is **the** gate: if survivors drop
  below 3/8, `NOD_AT` or `NOD_RATE` is wrong.
- Suite: an exhausted crab nods, holds the slot, and the waiting coworker is
  delayed but never deadlocked; a crab who sleeps rough banks no repair.

---

## How the five compose

**Rule 1 — one active failure behaviour at a time.** A crab telling two stories
at once is a crab telling none. At any moment, the *highest-ranked need past
its failure threshold* owns the crab's behaviour; the others are inert until it
resolves. Reuse the ranking the game already trusts — `ERRAND_RANK` — extended
to cover tiredness:

> **food 4 · drink 3 · tired 2.5 · clean 2 · fun 1**

Thirst outranks tiredness because it kills and tiredness doesn't; dirt sits low
because (see Rule 2) it doesn't need to win.

**Rule 2 — dirt is passive and always on.** The wide berth is not an action the
crab takes, it's how the town reacts to them. It stacks with every other
pattern and never competes for the arbitration. A starving, filthy crab raids
the crate *and* has the boardwalk part for them.

**Rule 3 — boredom yields to everybody.** Suppress wander-off and chatter
whenever any other need is past 0.7. Boredom is the need of a crab whose life
is otherwise fine, which is thematically exactly right and mechanically stops
the wander-off from firing on a crab who is dying.

**Rule 4 — the mood/quip layer names the winner.** `crabMood` already has a
priority ladder; re-order it to match the ranking above and add the new moods
(RAIDING, RANK, RESTLESS) so the follow card always agrees with what the eyes
just saw. If the card says PARCHED and the crab is nodding off, we've failed.

**Named blends worth special-casing** — these are stories, not bugs:

- **hunger + thirst** → the raid extends to the bar: a parched barkeep pours
  their own without ringing it. Day report line: *"PINCHY RAN THE PANTRY DRY."*
- **tired + thirst** → already coupled in code (thirst accrues ×1.5 when
  tired > 0.5). This is the measured death spiral; give it a name in the day
  report — **RUN RAGGED** — so the player sees the compound, not two bars.
- **dirt + bored** → the lonely-and-filthy crab: nobody chatters with a crab
  the town is giving a wide berth to, so dirt *blocks* boredom's free cure.
  That's a genuinely nasty, genuinely fair second-order effect and it's free —
  it falls out of the two mechanics touching, with no code to arbitrate it.
- **everything at once** → don't blend. Highest rank wins, the day report names
  the crab, and the dossier is where the full picture lives. That's what the
  dossier is for.

---

## NPC parity

**Recommend: full parity, with a sequencing condition.**

Every pattern above should run on townsfolk, NPC staff, and owner-operators
identically — it is the "all crabs equal" directive, and honestly it's where
most of the *drama* is: SUDSY nodding off on her own stalls, DRIFT wandering
off the rail, SALTY raiding the crate at a shop he doesn't own. The player
feels an NPC's failure through the world (no clean stalls, no fish landing, the
pier price spiking) rather than through their own payroll, which is a more
interesting kind of pressure than a wage line.

**The condition: fix the environment before you turn on NPC danger.** The probe
above shows a solo owner-operator is the most neglected crab in the game today —
SUDSY averages thirst 0.73, hunger 0.66, dirt 0.79, and she is structurally
barred from her own showers. Turn on NPC mortality plus these patterns without
the tap, the forage, free fun, and the `workBiz` fix, and the town will kill her
in a fortnight *every seed*, which is neither charming nor a story. With those
fixes, her death becomes a thing the player could have prevented — which is what
makes it land.

Two further things NPC parity needs, either way:

1. **Succession.** An owner who dies takes their business with them. The job
   board already pulls drifters off the bus; an owner death should go dark and
   post the shop, or transfer to a staffer, not delete SUDS SHOWERS from the
   world forever.
2. **The reaper's asymmetry, named.** Today `!k.p.npc` guards the death roll.
   If that guard comes off, `!k.p.npc` also guards nothing else — but the death
   path calls `abortChef`/`abortErrand` and splices `crabs`, and NPCs live in
   `npcs`. Check that path carefully; a half-removed NPC owner is exactly the
   kind of thing that leaks a stall occupant for the rest of the run.

---

## Sequencing and the balance envelope

Documented curves to protect: baseline **0/8, evictions 11–16, median 14**;
growth `--buy chef,table` **4/8 alive at day 40**.

Every failure pattern here costs throughput; every environmental fix returns it.
Land them in that order and each pass has headroom:

| pass | contents | expected direction |
|---|---|---|
| **0. Bug fixes** | sticky `workBiz` shower gate; verify NPC death path teardown | small, positive, measure as inert |
| **1. Environment** | public taps (+rinse), beach forage, free fun (pier/tide/chatter) | **lengthens runway** — this is the budget for everything after |
| **2. The two cheap patterns** | thirst short leash, boredom wander-off | shortens; should roughly cancel pass 1 |
| **3. The two costly patterns** | hunger raid, dirt wide berth (rep clause dark) | shortens; watch growth |
| **4. Tiredness + loosenings** | microsleep + rough sleep; dirt rep clause on; smudge trail | growth matrix is the gate |

Each pass: suite green, 8×30d baseline, 8×40d growth. Do not tune a price to
absorb a behaviour change (standing policy) — document the movement.

---

## Open questions for Matt

1. **Which needs get to kill, and how fast?** Today: thirst .12 / hunger .10 /
   dirt .06 / tired .05, boredom **nothing**. Should boredom get a term (low
   spirits, ~0.04), or should its late stage be the walk-out and the
   resignation instead — losing a crab without a memorial?
2. **The resignation (B4).** A crew crab who quits and walks to the bus is a
   permanent loss with no grave. Emotionally heavier than a death in some ways.
   In or out?
3. **Are the taps free?** Recommend yes — free water is the difference between
   "thirst is dramatic" and "thirst punishes poverty". But it does soften the
   T2 pressure PLAN calls intended, and it's a one-line lever if we want it
   back (make the tap a $1 coin-op, or take thirst to 0.5 instead of 0.3).
4. **Does the arcade stay the only *fast* fun?** Recommend yes; free sources
   are slow and low-value, the arcade is instant and full. That turns a paywall
   into a purchase.
5. **The `crabEff` question, permanently.** PLAN parks thirst and tiredness
   `crabEff` terms twice. This proposal argues they should stay parked forever
   — behaviour patterns *are* the replacement for invisible multipliers, and
   two systems doing the same job will be tuned against each other.
6. **NPC mortality: on with pass 1, or held to pass 4?** Recommend pass 4 —
   after the environment is fair and succession exists.
