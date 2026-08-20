# CRAB SHACK 3 — working notes for Claude

**Read PLAN.md first.** It is the project brain: systems map, verified balance
numbers, backlog, and conventions. Don't duplicate it — update it there.

## The sim contract (load-bearing)
- `tools/simlib.mjs` executes the REAL game files (font.js, ppu.js, sprites.js,
  crabs.js, game.js) inside a Node vm with stubbed browser APIs and a seeded
  RNG. The headless sim IS the browser game engine — never fork or reimplement
  game logic inside tools/.
- Corollary: if game.js starts using a new browser API, stub it in
  simlib.mjs (and the matching stubs in tools/headless.mjs) or the whole
  headless toolchain breaks.

## Perf expectations
- ~5–10 sim-days/sec per core, single-threaded per seed.
- Seed matrices: `node tools/headless.mjs --days N --seeds K [--jobs J]`.
  `--jobs` forks one worker per seed (default: min(seeds, cores−1));
  `--jobs 1` is the exact sequential path. Seeds are deterministic either way.
- Don't run two sims concurrently when benchmarking, or timings lie.

## Suite discipline
- `node tools/suite.mjs` (all scenarios) must be green before any commit.
- Balance changes need a headless matrix re-run. Baseline (buy nothing):
  0/N survive, median eviction ~14. Growth (`--buy chef,table`): **1/16**, and
  that is the intended difficulty as of 2026-08-20, not a regression to fix —
  see STATE OF PLAY in PLAN.md. Compare against the verified numbers there.
- **The 8-seed growth block is noisy — run the second one.** Measured on the
  visitor pass: the same build reads 2/8 on the default seeds and 4/8 on
  `--seedbase 8`, and the pre-pass build reads 4/8 and 2/8 on the same two
  blocks. Sixteen growth seeds is the honest number; eight is a coin.
- **Measure against the tree you are landing on, not against the number in
  PLAN.** Four passes in one day each cost ~1 growth escape, each measured
  honestly at 8 seeds, each a coin flip on its own — and together they took the
  pillar from ~5/16 to 1/16. A pillar can be eroded entirely by changes that
  are each individually defensible.
- **The matrix measures the FLOOR, not the ceiling.** `headless.mjs` buys a
  fixed list and trades on autopilot: it never re-prices against a rival, moves
  an hours sign, fires a bad hire or reads the departure card. It is a
  regression detector, not a difficulty dial — never make the game easier for a
  bot that is not trying.
