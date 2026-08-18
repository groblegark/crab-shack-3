# CRAB SHACK 3

The town gets an economy. Same snescat toy-PPU engine (character-map
sprites, the snescat 5x7 font, 256x240 canvas, scanlines) — now with a
2048px world and more than one storefront on the boardwalk.

## What's new over CS2

- **Multiple businesses.** You start with the CRAB SHACK; save up $400
  and open SUDS N BUBBLES, the laundromat down the road — washers,
  dryers, a pickup counter, and its own $60/night rent on top of the
  shack's $115. Tourists queue at whichever staffed business they need.
- **Staffing.** Every crab has a JOB (shown on the follow card — click
  the > to reassign them between shack and cleaners). Same shifts and
  commutes as CS2: walk, bike, beach buggy, or the SAND BUS, which now
  runs three stops across the longer coast road.
- **Needs and errands.** Working a shift builds an appetite and stains
  the uniform (FED and CLN bars on the follow card, smudges on the
  sprite). Off duty, crabs run errands with their own wallets: buy a
  meal at the shack, drop the uniform at the cleaners. Your wage money
  comes back through your own registers — if you staff the town well.
  Hungry crabs work slower; dirty uniforms earn worse tips; a long line
  sends them home grumbling with their needs unmet.

Everything else carries over: personalities, houses and the shelter
safety net, daily wages/house rent/shack rent settling at 20:00,
lose-by-default balance, the follow-cam, the home screen, and the
5-track Suno playlist by Matt Clanker.

Static page, no build step — GitHub Pages from main/root. `?fresh` for a
throwaway session, `?turbo=N` for dev speed. Balance work happens in
`tools/headless.mjs` (the real game against stubbed browser APIs at
~1000x, seeded, multi-run).
