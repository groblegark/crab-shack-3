# CRAB SHACK 3

A simulation-style beach-town economy, built on the snescat toy PPU
(character-map pixel art, the snescat 5x7 font plus a 3x5 micro font,
256x240 canvas, scanlines) — no libraries, no build step.

Play: https://groblegark.github.io/crab-shack-3/

## The town

You run the CRAB SHACK, but you're not the only one who matters. Fisher-crabs
work the pier — fishing is the town's default profession — and the day's catch
stocks your kitchen ($4 fresh off the pier, $7 imported when the bucket runs
dry). SUDSY owns the beach showers outright and REEF keeps the hotel: their own
tills, their own rents, their own dinners at your shack. Every crab has a
wallet, needs, a home, a commute, and opinions — and so does every visitor who
steps off the ferry.

And somebody else wants in. A week or so after you open, a crab called **BRASS**
gets off the morning bus, buys the DRIFTWOOD out from under REEF, and starts
running seven rooms for money: the board goes up on a full house, and she pays
over the odds for staff when a guest ends up sleeping on the sand. Every dollar
a guest spends on a room is a dollar that never reaches your counter. You get
two nights' warning, and REEF's price is on the sign the whole time.

- **Businesses**: the shack, plus THE CLAWCADE (claw machines + skeeball,
  $650) to buy. SUDS SHOWERS is SUDSY's, and the DRIFTWOOD HOTEL is REEF's —
  seven rooms at the far end of the promenade, and he'll sell if the offer is
  right. Be quick about it: he is not the only one who thinks so.
- **Visitors**: the ferry runs four times a day. Holidaymakers come ashore in
  batches, walk down the pier into town with real money in their pockets and
  real needs on their bars, spend a day or two here, take a room at the
  Driftwood (or sleep on the sand if it's full) and sail home on a later boat.
  Click one to follow them; open their record to see the purse, the bars and
  the little diary of their visit. A good name fills the boat.
- **Crew**: hire crabs, assign them between your businesses, watch them
  commute (walk / bike / beach buggy / the SAND BUS), work shifts, and live in
  houses you can see inside. Broke crabs move into the shelter and climb back
  out. Neglected crabs get sick, spread it at work and in the shelter, and can
  die — the town keeps memorials on the dune.
- **Service**: guests are seated when their order is claimed and the server
  carries the plate out to the table. Showers hand out a kit, the guest
  showers, and staff turn the stall over.
- **Money**: everything settles at 20:00 — wages out, crew house rent, your
  business rents. Miss the lease and Mr. Pincherton takes the shack.
  Reputation, not advertising, drives foot traffic.

Start small on purpose: one grill, one board, two tables. The shop sells
physical things — HIRE CRAB, GRILL+, BOARD+, TABLE+, unlocks and gear.

**You lose by default, but just barely.** Sim-verified over 16 seeds: doing
nothing gets you evicted around day 9–15 (median 11); hiring and seating
guests escapes on roughly 6 runs in 16 past day 40.

## Controls

Click a crab — crew, SUDSY, or a fisher — to follow them. Drag or arrow keys
to pan, ESC to let go. CREW / SHOP / MENU tabs; the BILL chip opens tonight's
itemized bill. `>>` / `>>>` (or F) fast-forward, M mutes, N music, B skips
track.

## Development

`?fresh` starts a throwaway session, `?turbo=N` speeds the clock. Balance and
regression work happens in the headless simulator, which runs the real game
code at ~10 sim-days/second:

```
node tools/suite.mjs                                   # every scenario, keep green
node tools/headless.mjs --days 30 --seeds 8 --quiet    # baseline curve
node tools/headless.mjs --days 40 --seeds 8 --buy chef,table --quiet
```

See PLAN.md for architecture, verified numbers, and the roadmap.

Music by Matt Clanker, made with Suno — a rotating playlist: "Pixel Wave
Waltz", "Regalia of the Surf", "Regalia Waltz", "Butter Pow", and "Carnival of
the Glitch".
