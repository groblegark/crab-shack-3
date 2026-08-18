# CRAB SHACK 3

A simulation-style beach-town economy, built on the snescat toy PPU
(character-map pixel art, the snescat 5x7 font plus a 3x5 micro font,
256x240 canvas, scanlines) — no libraries, no build step.

Play: https://groblegark.github.io/crab-shack-3/

## The town

You run the CRAB SHACK, but you're not the only one who matters. Fisher-crabs
work the pier — fishing is the town's default profession — and the day's catch
stocks your kitchen ($4 fresh off the pier, $7 imported when the bucket runs
dry). SUDSY owns the beach showers outright: her own till, her own rent, her
own dinner at your shack. Every crab has a wallet, needs, a home, a commute,
and opinions.

- **Businesses**: the shack, plus SUDS N BUBBLES (laundromat, $400) and THE
  CLAWCADE (claw machines + skeeball, $650) to buy. SUDS SHOWERS is SUDSY's.
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

**You lose by default, but just barely.** Sim-verified over 8 seeds: doing
nothing gets you evicted around day 9–20 (median 13); hiring and seating
guests survives 7/8 runs past day 40.

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
node tools/suite.mjs                                   # 18 scenarios, keep green
node tools/headless.mjs --days 30 --seeds 8 --quiet    # baseline curve
node tools/headless.mjs --days 40 --seeds 8 --buy chef,table --quiet
```

See PLAN.md for architecture, verified numbers, and the roadmap.

Music by Matt Clanker, made with Suno — a rotating playlist: "Pixel Wave
Waltz", "Regalia of the Surf", "Regalia Waltz", "Butter Pow", and "Carnival of
the Glitch".
