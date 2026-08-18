// MERGE MODE — the secret pocket game hiding inside the town.
//
// Only exists on a touch device with a phone-sized screen. Hold onto any crab
// for a moment and you *become* them: their job turns into a board of icons you
// merge two-at-a-time. No timers, no losing, no score — just a little ladder of
// jobs to finish, and when you finish one your crab really does help the town.
//
// Everything here is self-contained; game.js only calls MergeMode.frame() and
// gives the touch handlers first refusal.

(function () {
  "use strict";

  // ---------------------------------------------------------------- the gate
  // Touch + phone-sized, decided once at boot. On a desktop this object still
  // exists but every entry point answers "not mine", so behaviour is unchanged.
  const MOBILE = (function () {
    // primary input is a finger (phones AND iPads) - or any touch on a small screen.
    // Touchscreen laptops report a fine primary pointer, so desktops stay unchanged.
    const coarse = window.matchMedia && matchMedia("(pointer: coarse)").matches;
    const touch = (navigator.maxTouchPoints || 0) > 0;
    return coarse || (touch && Math.min(innerWidth, innerHeight) < 620);
  })();

  // ---------------------------------------------------------------- content
  // Each chain is that job's real work, tier by tier. Sprites come straight
  // from the town's own item art.
  const CHAINS = {
    shack:    { key: "shack",    tiers: ["fish_raw", "fish_cut", "taco", "plate_fish"] },
    fishing:  { key: "shack",    tiers: ["fish_raw", "fish_cut", "taco", "plate_fish"] },
    arcade:   { key: "arcade",   tiers: ["token", "tickets", "plush", "gold_plush"] },
    showers:  { key: "showers",  tiers: ["soap", "suds", "shine"] },
  };
  // Each goal: make N of the item at this tier index. Kid-legible, in order.
  const GOALS = {
    shack:    [[1, 2], [2, 1], [2, 3], [3, 1]],
    arcade:   [[1, 2], [2, 1], [2, 3], [3, 1]],
    showers:  [[1, 2], [2, 1], [2, 4]],
  };
  const CHEERS = ["NICE ONE!", "YES!", "PERFECT!", "LOOK AT THAT!", "SO GOOD!"];

  // ---------------------------------------------------------------- layout
  // Derived from the canvas height so the portrait-phone screen (H=288, see
  // index.html) just gets taller cells; on the classic 240 these come out to
  // the original CH=33 / MSG_Y=191 / buttons at 206.
  const COLS = 4, ROWS = 4;
  const BX = 10, BY = 58, CW = 59;                   // board origin + cell width
  const CH = ((H - BY - 50) / ROWS) | 0;             // cell height: fill down to the button lane
  const CREW_Y = 29, CREW_H = 27;                    // pick-your-crab strip
  const MSG_Y = BY + ROWS * CH + 1;                  // banner / tip lane
  const SPAWN = { x: 10, y: MSG_Y + 15, w: 150, h: 30 };
  const BACK  = { x: 168, y: MSG_Y + 15, w: 78, h: 30 };

  // ---------------------------------------------------------------- state
  let on = false;              // is the board up?
  let crab = null;             // whose shift are we playing?
  let chain = null, chainKey = "shack";
  let cells = [];              // tier index per cell, or -1 for empty
  let sel = -1;                // selected cell
  let goalIdx = 0, goalMade = 0, goalsDone = 0;
  let pops = [];               // celebration bits
  let banner = null, bannerT = 0;
  let fullT = 0;               // "board's full" nudge
  let everMerged = false;      // until then, show the how-to-play nudge
  let gifted = 0;              // coins sent to the till this session (capped)
  let saved = {};              // per-crab board state, so switching resumes
  const GIFT = 6, GIFT_CAP = 60;

  // long-press discovery
  let press = null;            // { crab, t, x, y }
  let swallowUp = false;       // the release that opened the board isn't a tap
  const HINT_AT = 0.42, OPEN_AT = 1.25;

  // ---------------------------------------------------------------- helpers
  const cellX = (i) => BX + (i % COLS) * CW;
  const cellY = (i) => BY + ((i / COLS) | 0) * CH;
  const hit = (b, p) => p.x >= b.x && p.x < b.x + b.w && p.y >= b.y && p.y < b.y + b.h;

  function drawBig(art, x, y, n) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(art.cv, x | 0, y | 0, art.w * n, art.h * n);
  }
  function itemArt(tier) { return ITEMS[chain.tiers[tier]]; }
  function itemName(tier) { return ITEM_NAMES[chain.tiers[tier]] || "?"; }

  function goal() { return GOALS[chainKey][goalIdx] || null; }

  function stripSlots() {
    const crew = (typeof crabs !== "undefined" && crabs.length) ? crabs.slice(0, 8) : [];
    if (crab && !crew.some(c => c.p.name === crab.p.name)) crew.push(crab);
    const w = Math.min(52, ((W - 8) / Math.max(1, crew.length)) | 0);
    const x0 = ((W - w * crew.length) / 2) | 0;
    return crew.map((c, i) => ({ c, x: x0 + i * w, w }));
  }

  function burst(x, y, color) {
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      pops.push({ x, y, vx: Math.cos(a) * 26, vy: Math.sin(a) * 26 - 8, t: 0.7, color });
    }
  }

  // ---------------------------------------------------------------- opening
  function stash() {
    if (crab) saved[crab.p.name] = { cells: cells.slice(), goalIdx, goalMade };
  }
  function open(c) {
    stash();
    crab = c;
    chainKey = (CHAINS[c.p.job] || CHAINS.shack).key;
    chain = CHAINS[c.p.job] || CHAINS.shack;
    const keep = saved[c.p.name];
    if (keep) {
      cells = keep.cells.slice(); goalIdx = keep.goalIdx; goalMade = keep.goalMade;
    } else {
      cells = new Array(COLS * ROWS).fill(-1);
      goalIdx = 0; goalMade = 0;
      for (let i = 0; i < 5; i++) spawn();        // a few to start with
    }
    sel = -1; pops = []; fullT = 0;
    if (!on) { goalsDone = 0; everMerged = false; }   // fresh visit from town
    banner = "YOU ARE " + c.p.name + "!"; bannerT = 2.4;
    on = true;
    if (typeof sfx !== "undefined") sfx.ding();
  }
  function close() {
    stash();
    on = false; sel = -1; press = null;
    if (crab && goalsDone > 0 && typeof popText === "function") {
      popText(crab.p.name + " HELPED!", crab.x - 12, (crab.y || 160) - 30, [255, 230, 120]);
    }
    crab = null;
  }

  function spawn() {
    const free = [];
    for (let i = 0; i < cells.length; i++) if (cells[i] < 0) free.push(i);
    if (!free.length) { fullT = 1.6; return false; }
    cells[free[(Math.random() * free.length) | 0]] = 0;
    return true;
  }

  function merge(a, b) {
    const tier = cells[a];
    if (tier < 0 || cells[b] !== tier) return false;
    if (tier >= chain.tiers.length - 1) {         // already the best there is
      banner = itemName(tier) + " IS THE BEST!"; bannerT = 1.6;
      return false;
    }
    cells[a] = -1;
    cells[b] = tier + 1;
    everMerged = true;
    burst(cellX(b) + CW / 2, cellY(b) + CH / 2, [255, 230, 120]);
    if (typeof sfx !== "undefined") sfx.coin();

    const g = goal();
    if (g && tier + 1 === g[0]) {
      goalMade++;
      if (goalMade >= g[1]) finishGoal();
    }
    return true;
  }

  function finishGoal() {
    goalsDone++;
    goalIdx++; goalMade = 0;
    banner = CHEERS[(Math.random() * CHEERS.length) | 0]; bannerT = 2.6;
    for (let i = 0; i < 3; i++) burst(40 + i * 80, 120, [140, 255, 160]);
    if (typeof sfx !== "undefined") { sfx.ding(); sfx.coin(); }
    if (crab) crab.quip = { text: "I'M ON A ROLL!", t: 2.4 };
    // the town feels it, gently and with a hard ceiling
    if (gifted + GIFT <= GIFT_CAP && typeof coins === "number") {
      coins += GIFT; gifted += GIFT;
    }
    if (crab && crab.p) {
      crab.p.bored = Math.max(0, (crab.p.bored || 0) - 0.5);
      crab.p.hunger = Math.max(0, (crab.p.hunger || 0) - 0.2);
    }
  }

  // ---------------------------------------------------------------- input
  function tapBoard(p) {
    for (let i = 0; i < cells.length; i++) {
      const x = cellX(i), y = cellY(i);
      if (p.x < x || p.x >= x + CW || p.y < y || p.y >= y + CH) continue;
      if (sel < 0) {                              // pick something up
        if (cells[i] >= 0) { sel = i; if (typeof sfx !== "undefined") sfx.buy(); }
      } else if (sel === i) {
        sel = -1;                                 // put it back down
      } else if (cells[i] < 0) {                  // slide it to an empty cell
        cells[i] = cells[sel]; cells[sel] = -1; sel = -1;
        if (typeof sfx !== "undefined") sfx.buy();
      } else if (!merge(sel, i)) {
        sel = i;                                  // different thing? select that
      } else {
        sel = -1;
      }
      return true;
    }
    return false;
  }

  // ---------------------------------------------------------------- drawing
  function drawCrabHead(c, x, y) {
    const art = CRAB_ARTS[c.p.color % CRAB_ARTS.length].a;
    blit(ctx, art, x, y);
    const acc = ACCESSORIES[c.duty ? "toque" : c.p.acc];
    if (acc) blit(ctx, acc.art, x + acc.dx, y + acc.dy);
  }

  function drawBoard(dt) {
    // backdrop: the sea at dusk, so it still feels like the same town
    rect(ctx, 0, 0, W, H, [26, 40, 70]);
    for (let y = 4; y < H; y += 8) rect(ctx, 0, y, W, 1, [32, 50, 86]);

    // header: who you are + what you're making
    rect(ctx, 0, 0, W, 28, [30, 20, 36]);
    rect(ctx, 2, 2, W - 4, 24, [255, 250, 235]);
    if (crab) text(ctx, crab.p.name, 8, 5, [40, 24, 16]);
    const g = goal();
    if (g) {
      smallText(ctx, "MAKE " + g[1] + " " + itemName(g[0]), 8, 16, [70, 90, 130]);
      // progress pips
      for (let i = 0; i < g[1]; i++) {
        const px2 = 8 + (smallTextWidth("MAKE " + g[1] + " " + itemName(g[0])) + 6) + i * 9;
        rect(ctx, px2, 15, 7, 7, [200, 190, 175]);
        if (i < goalMade) rect(ctx, px2 + 1, 16, 5, 5, [96, 200, 120]);
      }
      drawBig(itemArt(g[0]), W - 32, 2, 3);
    } else {
      smallText(ctx, "ALL DONE! KEEP PLAYING - JOBS: " + goalsDone, 8, 16, [40, 110, 60]);
    }

    // crew strip: tap a crab to be them instead
    const strip = stripSlots();
    for (const s of strip) {
      const me = crab && s.c.p.name === crab.p.name;
      rect(ctx, s.x, CREW_Y, s.w - 2, CREW_H, me ? [255, 230, 120] : [30, 20, 36]);
      rect(ctx, s.x + 1, CREW_Y + 1, s.w - 4, CREW_H - 2, me ? [255, 250, 235] : [46, 66, 104]);
      drawCrabHead(s.c, (s.x + (s.w - 18) / 2) | 0, CREW_Y + 4);
      const nm = s.c.p.name.slice(0, 6);
      smallText(ctx, nm, s.x + (((s.w - 2 - smallTextWidth(nm)) / 2) | 0), CREW_Y + 20,
        me ? [40, 24, 16] : [170, 190, 220]);
    }

    // the board
    for (let i = 0; i < cells.length; i++) {
      const x = cellX(i), y = cellY(i), t = cells[i];
      rect(ctx, x + 1, y + 1, CW - 3, CH - 3, sel === i ? [255, 230, 120] : [46, 66, 104]);
      rect(ctx, x + 2, y + 2, CW - 5, CH - 5, sel === i ? [90, 120, 170] : [38, 56, 92]);
      if (t >= 0) {
        const art = itemArt(t);
        drawBig(art, x + (CW - art.w * 3) / 2, y + (CH - art.h * 3) / 2 - 2, 3);
        // tier pips so a kid can see "this one is further along"
        for (let k = 0; k <= t; k++) rect(ctx, x + 5 + k * 5, y + CH - 8, 3, 3, [255, 230, 120]);
      }
    }

    // buttons
    rect(ctx, SPAWN.x, SPAWN.y, SPAWN.w, SPAWN.h, [30, 20, 36]);
    rect(ctx, SPAWN.x + 2, SPAWN.y + 2, SPAWN.w - 4, SPAWN.h - 4, [96, 200, 120]);
    text(ctx, "MORE!", SPAWN.x + 14, SPAWN.y + 12, [20, 60, 30]);
    drawBig(itemArt(0), SPAWN.x + 100, SPAWN.y + 6, 2);
    rect(ctx, BACK.x, BACK.y, BACK.w, BACK.h, [30, 20, 36]);
    rect(ctx, BACK.x + 2, BACK.y + 2, BACK.w - 4, BACK.h - 4, [190, 140, 80]);
    text(ctx, "TOWN", BACK.x + 18, BACK.y + 12, [40, 24, 16]);

    // celebrations
    for (const b of pops) {
      b.t -= dt; b.x += b.vx * dt; b.y += b.vy * dt; b.vy += 60 * dt;
      if (b.t > 0) rect(ctx, b.x, b.y, 2, 2, b.color);
    }
    pops = pops.filter(b => b.t > 0);

    if (bannerT > 0 && banner) {
      bannerT -= dt;
      const w2 = textWidth(banner) + 12, x = ((W - w2) / 2) | 0;
      rect(ctx, x, MSG_Y, w2, 13, [30, 20, 36]);
      rect(ctx, x + 1, MSG_Y + 1, w2 - 2, 11, [255, 250, 235]);
      text(ctx, banner, x + 6, MSG_Y + 3, [200, 120, 40]);
    }
    if (!everMerged && bannerT <= 0) {
      const tip = "TAP TWO THE SAME!";
      const w3 = textWidth(tip) + 12, x3 = ((W - w3) / 2) | 0;
      rect(ctx, x3, MSG_Y, w3, 13, [30, 20, 36]);
      rect(ctx, x3 + 1, MSG_Y + 1, w3 - 2, 11, [255, 250, 235]);
      text(ctx, tip, x3 + 6, MSG_Y + 3, ((time * 2) | 0) % 2 ? [40, 110, 60] : [80, 150, 90]);
    }
    if (fullT > 0) {
      fullT -= dt;
      smallText(ctx, "BOARD IS FULL - MERGE SOME!", 66, MSG_Y + 4, [255, 200, 120]);
    }
  }

  function drawHint(dt) {
    if (!press) return;
    press.t += dt;
    const c = press.crab;
    const f = Math.min(1, Math.max(0, (press.t - HINT_AT) / (OPEN_AT - HINT_AT)));
    if (press.t < HINT_AT) return;

    // rising beeps as it fills - impossible to miss
    const step = Math.floor(f * 6);
    if (step !== press.beeped) {
      press.beeped = step;
      if (typeof beep === "function") beep(360 + f * 640, 0.06, "square", 0.035);
    }

    const bx = Math.max(30, Math.min(W - 30, (c.x - camX + 8) | 0));
    const by = Math.max(34, (c.y - 44) | 0);
    if (c.x - camX < -20 || c.x - camX > W + 20) return;

    // fat wobbling thought bubble
    const wob = Math.sin(press.t * 10) * 1.5;
    const R = 26 + wob;
    ctx.fillStyle = "rgb(30,20,36)";
    ctx.beginPath(); ctx.arc(bx, by, R + 2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "rgb(255,250,235)";
    ctx.beginPath(); ctx.arc(bx, by, R, 0, Math.PI * 2); ctx.fill();
    // trailing thought dots down to the crab
    rect(ctx, bx - 2, by + R + 3, 5, 5, [255, 250, 235]);
    rect(ctx, bx - 1, by + R + 10, 3, 3, [255, 250, 235]);

    // pie fill around the rim
    ctx.strokeStyle = "rgb(255,200,60)";
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(bx, by, R - 3, -Math.PI / 2, -Math.PI / 2 + f * Math.PI * 2); ctx.stroke();

    // the crab's face hopping with excitement inside the bubble
    const hop = Math.abs(Math.sin(press.t * 12)) * (4 + f * 5);
    const art = CRAB_ARTS[c.p.color % CRAB_ARTS.length].a;
    blit(ctx, art, bx - 8, by - 6 - hop);
    const acc = ACCESSORIES[c.duty ? "toque" : c.p.acc];
    if (acc) blit(ctx, acc.art, bx - 8 + acc.dx, by - 6 - hop + acc.dy);
    // sparkles once it is nearly there
    if (f > 0.6) {
      for (let i = 0; i < 4; i++) {
        const a = press.t * 6 + i * Math.PI / 2;
        px(ctx, bx + Math.cos(a) * (R - 8), by + Math.sin(a) * (R - 8), [255, 230, 120]);
      }
    }
    smallText(ctx, "HOLD!", bx - smallTextWidth("HOLD!") / 2, by + R - 10, [200, 120, 40]);
    if (f >= 1) { open(c); swallowUp = true; press = null; }
  }

  // ---------------------------------------------------------------- exports
  window.MergeMode = {
    enabled: MOBILE,
    active: () => on,

    // called every frame from game.js
    frame(dt) {
      if (!MOBILE) return;
      if (on) drawBoard(dt);
      else drawHint(dt);
    },

    // touch handlers get first refusal; return true to swallow the event
    touchStart(p) {
      if (!MOBILE) return false;
      if (on) return true;
      if (typeof screen !== "undefined" && screen !== "play") return false;
      if (typeof gameOver !== "undefined" && gameOver) return false;   // no pocket game at the eviction hearing
      if (p.y >= PANEL_Y) return false;
      const wx = p.x + camX;
      for (const c of allCrabs()) {
        if (c.hidden) continue;
        if (Math.abs(wx - (c.x + 8)) < 14 && Math.abs(p.y - (c.y - 6)) < 16) {
          press = { crab: c, t: 0, x: p.x, y: p.y, beeped: -1 };
          return false;   // let a normal tap still follow this crab
        }
      }
      press = null;
      return false;
    },
    touchMove(p) {
      if (!MOBILE) return false;
      if (press && (Math.abs(p.x - press.x) > 6 || Math.abs(p.y - press.y) > 6)) press = null;
      return on;          // in merge mode, swallow drags so the town can't pan
    },
    // tiny window for scripted testing; harmless in play
    _debug: () => ({ on, cells: cells.slice(), goalIdx, goalMade, goalsDone, gifted,
      chain: chain && chain.tiers, crab: crab && crab.p.name }),

    touchEnd(p) {
      if (!MOBILE) return false;
      press = null;
      if (!on) return false;
      if (swallowUp) { swallowUp = false; return true; }
      if (p) {
        if (hit(BACK, p)) { close(); return true; }
        if (hit(SPAWN, p)) { if (spawn() && typeof sfx !== "undefined") sfx.buy(); return true; }
        if (p.y >= CREW_Y && p.y < CREW_Y + CREW_H) {
          for (const s of stripSlots()) {
            if (p.x >= s.x && p.x < s.x + s.w) {
              if (!crab || s.c.p.name !== crab.p.name) open(s.c);
              return true;
            }
          }
        }
        tapBoard(p);
      }
      return true;
    },
  };
})();
