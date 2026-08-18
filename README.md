# CRAB SHACK 3

The town gets an economy. Same snescat toy-PPU engine (character-map
sprites, the snescat 5x7 font, 256x240 canvas, scanlines) — now with a
2048px world and more than one storefront on the boardwalk.

## What's new over CS2

- **Multiple businesses.** You start with the CRAB SHACK; save up $400
  for SUDS N BUBBLES, the laundromat down the road (washers, dryers,
  pickup counter, $60/night rent), then $650 for THE CLAWCADE at the
  east end of the boardwalk (claw machines, skeeball, prize counter,
  $80/night). Tourists queue at whichever staffed business they fancy.
- **Staffing.** Every crab has a JOB (shown on the follow card — click
  the > to reassign them between shack and cleaners). Same shifts and
  commutes as CS2: walk, bike, beach buggy, or the SAND BUS, which now
  runs three stops across the longer coast road.
- **Needs and errands.** Working a shift builds an appetite, stains
  the uniform, and grinds the crab down (FED, CLN, and FUN bars on the
  follow card). Off duty, crabs run errands with their own wallets:
  a meal at the shack, laundry at the cleaners, a claw-machine session
  at the arcade (flush crabs splurge on GAME NIGHT). Your wage money
  comes back through your own registers — if you staff the town well.
  Hungry crabs work slower, dirty uniforms earn worse tips, bored crabs
  drag their feet everywhere, and a long line sends them home grumbling.

Everything else carries over: personalities, houses and the shelter
safety net, daily wages/house rent/shack rent settling at 20:00,
lose-by-default balance, the follow-cam, the home screen, and the
5-track Suno playlist by Matt Clanker.

Static page, no build step — GitHub Pages from main/root. `?fresh` for a
throwaway session, `?turbo=N` for dev speed. Balance work happens in
`tools/headless.mjs` (the real game against stubbed browser APIs at
~1000x, seeded, multi-run).
