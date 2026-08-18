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
  0/N survive, median eviction ~11–13. Growth check: `--buy chef,table`
  can escape. Compare against the verified numbers in PLAN.md.
