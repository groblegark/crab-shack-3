// All pixel art hand-drawn as character maps, snescat style. '.' = transparent.

const PAL = {
  K: [30, 20, 36],     // outline
  L: [250, 250, 255],  // bright white (toque, glints)
  W: [255, 255, 255],  // eye white
  B: [30, 20, 36],     // pupil
  M: [204, 208, 220],  // metal grey
  A: [255, 216, 96],   // amber / coin gold
  O: [255, 150, 60],   // orange
  D: [140, 90, 50],    // wood dark
  E: [190, 140, 80],   // wood light
  S: [255, 205, 160],  // skin
  G: [90, 200, 110],   // green
  C: [96, 200, 255],   // cyan / water
  P: [255, 150, 170],  // pink
  Y: [255, 230, 120],  // pale yellow
  R: [230, 72, 88],    // red
  T: [170, 42, 62],    // dark red shade
  N: [70, 60, 90],     // dark slate (grill iron)
  U: [120, 110, 140],  // slate light
  F: [255, 100, 40],   // flame orange
  Z: [90, 170, 90],    // palm green dark
  J: [130, 210, 120],  // palm green light
  Q: [255, 170, 60],   // cheese / taco shell
  V: [120, 220, 190],  // seafoam
  I: [255, 240, 200],  // sand light
};

function swap(pal, from, to) {
  const p = Object.assign({}, pal);
  for (const k in from) p[k] = from[k];
  return p;
}

// ---------------------------------------------------------------- crab chef
// 16 wide; toque between eyestalks; body color R/T swaps per chef.
const _CRAB_TOP = [
  "..KK........KK..",
  ".KWBK......KBWK.",
  ".KWWK......KWWK.",
  "..KK........KK..",
  "..KRRRRRRRRRRK..",
  ".KRTRRRRRRRRTRK.",
  "KRRRRKRRRRKRRRRK",
  "KRRRRRRRRRRRRRRK",
  ".KRRTRRRRRRTRRK.",
];
const _CRAB_LEGS_A = [
  "KRRK.KRK..KRK...",
  "KRRK..KR..RK....",
  ".KK...K....K....",
];
const _CRAB_LEGS_B = [
  "KRRK..KR..RK....",
  "KRRK.KR....RK...",
  ".KK..K......K...",
];
// claw raised (work pose)
const _CRAB_LEGS_W = [
  "KRRK..KRRK......",
  "KRRK...KK.......",
  ".KK.............",
];
// fast asleep: eyestalks drooped, lids shut, legs folded under the shell
const _CRAB_SLEEP = [
  "................",
  "..KK........KK..",
  ".KRRK......KRRK.",
  ".KKKK......KKKK.",
  "..KRRRRRRRRRRK..",
  ".KRTRRRRRRRRTRK.",
  "KRRRRKRRRRKRRRRK",
  "KRRRRRRRRRRRRRRK",
  ".KRRTRRRRRRTRRK.",
  ".KRRK.KRRK.KRRK.",
  "..KK...KK...KK..",
  "................",
];
function crabArt(bodyCol, shadeCol) {
  const p = swap(PAL, { R: bodyCol, T: shadeCol });
  return {
    a: parseArt(_CRAB_TOP.concat(_CRAB_LEGS_A), p),
    b: parseArt(_CRAB_TOP.concat(_CRAB_LEGS_B), p),
    w: parseArt(_CRAB_TOP.concat(_CRAB_LEGS_W), p),
    s: parseArt(_CRAB_SLEEP, p),
  };
}
const CRAB_COLORS = [
  [[230, 72, 88], [170, 42, 62]],    // red
  [[96, 150, 255], [60, 95, 190]],   // blue
  [[90, 200, 110], [50, 140, 80]],   // green
  [[200, 120, 255], [140, 70, 190]], // purple
  [[255, 150, 60], [190, 100, 30]],  // orange
  [[255, 130, 190], [190, 80, 140]], // pink
];

// ---------------------------------------------------------------- tourists
// 12x19, faces left toward the pass window. H hair, T shirt are swapped.
const _TOURIST = [
  "...KKKKKK...",
  "..KHHHHHHK..",
  ".KHHHHHHHHK.",
  ".KHSSSSSSHK.",
  ".KSBSSSBSSK.",
  ".KSSSSSSSSK.",
  ".KSSPSSSSSK.",
  "..KSSSSSSK..",
  "...KKKKKK...",
  "..KTTTTTTK..",
  ".KTSTTTTSTK.",
  ".KTKTTTTKTK.",
  ".KSKTTTTKSK.",
  "...KTTTTK...",
  "...KNNNNK...",
  "...KNKKNK...",
  "...KSKKSK...",
  "...KSKKSK...",
  "..KKKKKKKK..",
];
const TOURIST_STYLES = [
  { H: [90, 60, 40], T: [96, 200, 255] },
  { H: [250, 220, 100], T: [255, 130, 190] },
  { H: [40, 40, 50], T: [90, 200, 110] },
  { H: [220, 120, 60], T: [255, 230, 120] },
  { H: [120, 80, 160], T: [255, 150, 60] },
];
function touristArt(style) { return parseArt(_TOURIST, swap(PAL, style)); }

// ---------------------------------------------------------------- items 9x7
const ITEMS = {};
function defItem(name, rows) { ITEMS[name] = parseArt(rows, PAL); }
defItem("fish_raw", [
  ".........",
  ".KKK.....",
  "KCCKKKKK.",
  "KCCCCCWBK",
  "KCCKKKKK.",
  ".KKK.....",
  ".........",
]);
defItem("fish_cut", [
  ".........",
  ".KK.KK...",
  "KPPKPPKK.",
  "KPPKPPKPK",
  "KPPKPPKK.",
  ".KK.KK...",
  ".........",
]);
defItem("fish_hot", [
  ".........",
  ".KKK.....",
  "KOOKKKKK.",
  "KOOOOOWBK",
  "KOOKKKKK.",
  ".KKK.....",
  ".........",
]);
defItem("taco", [
  ".........",
  "..KGKPK..",
  ".KGPKGPK.",
  "KQQGQPQK.",
  "KQQQQQQK.",
  ".KQQQQK..",
  "..KKKK...",
]);
defItem("fruit", [
  "....KZ...",
  "...KZK...",
  ".KKOKK...",
  "KOOOOK...",
  "KOOOOK...",
  "KOOOOK...",
  ".KKKK....",
]);
defItem("juice", [
  "..K.K....",
  ".KKZK....",
  "KYYKYK...",
  "KYYYYK...",
  ".KYYK....",
  ".KYYK....",
  ".KKKK....",
]);
defItem("cooler", [
  "....KC...",
  "...KC....",
  ".KCCCCK..",
  ".KCYCYK..",
  ".KCCCCK..",
  ".KCCCCK..",
  ".KKKKK...",
]);
defItem("plate_fish", [
  ".........",
  ".KKK.....",
  "KOOKKKKK.",
  "KOOOOOWBK",
  "KOOKKKKK.",
  "KLLLLLLLK",
  ".KKKKKKK.",
]);

// ---------------------------------------------------------------- stations
const CRATE = parseArt([
  "KKKKKKKKKKKKKKKKKKKK",
  "KEEEEEEEEEEEEEEEEEEK",
  "KEDDDDDDDDDDDDDDDDEK",
  "KEDCCKKCCCKKCCKKKDEK",
  "KEDCCCCCCWBCCCCKKDEK",
  "KEDCCKKCCCKKCCKKKDEK",
  "KEDDDDDDDDDDDDDDDDEK",
  "KEEEEEEEEEEEEEEEEEEK",
  "KDEEDDEEEEDDEEEEDDEK",
  "KDEEDDEEEEDDEEEEDDEK",
  "KEEEEEEEEEEEEEEEEEEK",
  "KKKKKKKKKKKKKKKKKKKK",
], PAL);
const BOARD = parseArt([
  "....................",
  "..KKKKKKKKK...KKK...",
  "..KLLLLLLLK..KMMK...",
  "..KLLLLLLLK.KMMK....",
  "..KKKKKKKKK.KDDK....",
  "KKKKKKKKKKKKKKKKKKKK",
  "KEEEEEEEEEEEEEEEEEEK",
  "KEDEEEEDEEEEDEEEEDEK",
  "KKKKKKKKKKKKKKKKKKKK",
  ".KDDK..........KDDK.",
  ".KDDK..........KDDK.",
  ".KDDK..........KDDK.",
], PAL);
const GRILL = parseArt([
  "..KKKKKKKKKKKKKK..",
  ".KNUUUUUUUUUUUUNK.",
  "KNUNKNKNKNKNKNKUNK",
  "KNNNNNNNNNNNNNNNNK",
  ".KNNNNNNNNNNNNNK..",
  "..KNNK......KNNK..",
  "..KNNK......KNNK..",
  "..KKKK......KKKK..",
], PAL);
const FLAME = [
  parseArt(["...F..", ".F.FF.", ".FFOF.", "FOOOF.", ".FAF..", ], PAL),
  parseArt(["..F...", ".FF.F.", ".FOFF.", ".FOOOF", "..FAF.", ], PAL),
];
// pass window: counter + bell + awning handled in bg draw
const PASS = parseArt([
  "........KAAK........",
  ".......KAAAAK.......",
  ".......KAAAAK.......",
  "......KKKKKKKK......",
  "KKKKKKKKKKKKKKKKKKKK",
  "KEEEEEEEEEEEEEEEEEEK",
  "KEDEEEEDEEEEDEEEEDEK",
  "KKKKKKKKKKKKKKKKKKKK",
  ".KDDK..........KDDK.",
  ".KDDK..........KDDK.",
  ".KDDK..........KDDK.",
], PAL);

// ---------------------------------------------------------------- scenery
const PALM = parseArt([
  "....JJJ....JJJ......",
  "..JJZZZJJ.JZZZJJ....",
  ".JZZJJJZZJZZJJZZJ...",
  "JZZJ..JJZZZJJ.JZZJ..",
  "JZJ..JZZZZZZZJ.JZJ..",
  ".J..JZZJKKJZZZJ..J..",
  "....JZJKDDKJZZZJ....",
  ".....J.KDDK.JZJ.....",
  ".......KDKDK.J......",
  ".......KDDK.........",
  "......KDKDK.........",
  "......KDDDK.........",
  ".....KDDKDK.........",
  ".....KDDDDK.........",
  "....KDKDDDK.........",
  "....KDDDDKK.........",
  "...KDDDKDDK.........",
  "...KDDDDDDK.........",
], PAL);
const UMBRELLA = parseArt([
  ".....KKKKK......",
  "...KKRRLRRKK....",
  "..KRRLRRRLRRK...",
  ".KRRLRRKRRLRRK..",
  "KKKKKKKKKKKKKKK.",
  ".......KDK......",
  ".......KDK......",
  ".......KDK......",
  ".......KDK......",
  ".......KDK......",
], PAL);
const CLOUD = parseArt([
  "....LLLL........",
  "..LLLLLLLL.LLL..",
  ".LLLLLLLLLLLLLL.",
  "LLLLLLLLLLLLLLLL",
  ".LLLL..LLLLLLL..",
], PAL);
const GULL = [
  parseArt(["KK.....KK", ".KK...KK.", "..KLKLK..", "....K...."], PAL),
  parseArt([".........", "..K...K..", ".KKLKLKK.", "....K...."], PAL),
];
// a gull at rest, wings folded, sizing up the bait bucket
const GULL_SIT = parseArt([
  "...KK..",
  "..KLLKQ",
  ".KLLLK.",
  "KMMLLK.",
  ".KKKK..",
  "...K.K.",
], PAL);
const COIN = parseArt([
  ".KKKK.",
  "KAALAK",
  "KALAAK",
  "KAAAAK",
  "KAAAAK",
  ".KKKK.",
], PAL);
const BELL = parseArt([
  "..KK..",
  ".KAAK.",
  "KAAAAK",
  "KKKKKK",
  "..KK..",
], PAL);

// ================================================================ CS2 art
// accessories, drawn as overlays at the crab's head (origin = crab blit pos)
const ACCESSORIES = {
  toque: { dx: 4, dy: -4, art: parseArt([
    ".KLLLLK.",
    "KLLLLLLK",
    "KLLLLLLK",
    "KKKKKKKK",
  ], PAL) },
  cap: { dx: 3, dy: -3, art: parseArt([
    ".KRRRRK...",
    "KRRRRRRK..",
    "KKKKKKKKKK",
  ], swap(PAL, { R: [96, 150, 255] })) },
  bow: { dx: 9, dy: -4, art: parseArt([
    "KPK.KPK",
    "KPPKPPK",
    "KPK.KPK",
  ], PAL) },
  shades: { dx: 1, dy: 1, art: parseArt([
    "KNNK......KNNK",
    "KNNKKKKKKKKNNK",
  ], PAL) },
  flower: { dx: 0, dy: -3, art: parseArt([
    ".KPK.",
    "KPAPK",
    ".KPK.",
  ], PAL) },
  // THE MAYOR'S TOP HAT (Matt: "Little top hat and all"). Worn by whoever
  // holds the office and by nobody else - crabHat() puts it on over the
  // toque, so the mayor is the mayor even while they are working a shift,
  // which is most of the day for every crab in this town.
  // GEOMETRY, because a hat that is a pixel out looks like a mistake rather
  // than a joke. Eight wide at dx 4, so the BRIM spans columns 4-11 of a
  // 16-wide crab and passes cleanly between the eyestalks (columns 2-3 and
  // 12-13) instead of sitting on them. dy -6 puts the brim on row -1, which is
  // exactly where the toque's brim sits - so a mayor's hat sits on their head
  // at the same height a chef's does, and swapping between them does not make
  // the crab bob. Five rows of crown against the toque's three is what makes
  // it read as a TOP hat at 1x on a 256px canvas and not as a dark toque, and
  // the amber band is the one bright row: at this size a silhouette needs one
  // piece of colour to be findable in a crowd of nine.
  tophat: { dx: 4, dy: -6, art: parseArt([
    ".KKKKKK.",
    ".KNNNNK.",
    ".KNNNNK.",
    ".KNNNNK.",
    ".KAAAAK.",
    "KKKKKKKK",
  ], PAL) },
  none: null,
};

// beach hut, roof color-swapped per crab; door at bottom center
function houseArt(roofCol) {
  const p = swap(PAL, { R: roofCol });
  // dollhouse cutaway: roof + back wall + side walls, open front,
  // interior floor deep enough for a crab to stand inside (2x -> 60x46)
  return parseArt([
    "......KKKKKKKKKKKKKKKKKK......",
    "....KKRRRRRRRRRRRRRRRRRRKK....",
    "..KKRRRRRRRRRRRRRRRRRRRRRRKK..",
    ".KRRRRRRRRRRRRRRRRRRRRRRRRRRK.",
    "KRRRRRRRRRRRRRRRRRRRRRRRRRRRRK",
    "KKKKKKKKKKKKKKKKKKKKKKKKKKKKKK",
    "KDIIIIIIIIIIIIIIIIIIIIIIIIIIDK",
    "KDIIIIIIIIIIIIIIIIIIIIIIIIIIDK",
    "KDIIIKAAKIIIIIIIIIKKKKKKKIIIDK",
    "KDIIIKAAKIIIIIIIIIKCCCCCKIIIDK",
    "KDIIIKKKKIIIIIIIIIKCCLCCKIIIDK",
    "KDIIIIIIIIIIIIIIIIKCCCCCKIIIDK",
    "KDIIIIIIIIIIIIIIIIKKKKKKKIIIDK",
    "KDIIIIIIIIIIIIIIIIIIIIIIIIIIDK",
    "KDIIIIIIIIIIIIIIIIIIIIIIIIIIDK",
    "KDIIIIIIIIIIIIIIIIIIIIIIIIIIDK",
    "KDIIIIIIIIIIIIIIIIIIIIIIIIIIDK",
    "KD.KLLKPPPPPPK..............DK",
    "KDKLLLLPPPPPPPK.............DK",
    "KDKLLLLPPPPPPPK.............DK",
    "KDKKKKKKKKKKKKK.............DK",
    "KEEEEEEEEEEEEEEEEEEEEEEEEEEEEK",
    "KEDEEDEEDEEDEEDEEDEEDEEDEEDEEK",
  ], p);
}

// a VACANT lot's house: the same hut, standing empty - weathered grey roof,
// dark unlit glass with a pale TO LET card, no picture on the wall, no bed.
// All nine lots exist whether or not anyone's home; people move in, houses
// don't pop into existence (see drawTown's lot loop).
const HOUSE_EMPTY = parseArt([
  "......KKKKKKKKKKKKKKKKKK......",
  "....KKRRRRRRRRRRRRRRRRRRKK....",
  "..KKRRRRRRRRRRRRRRRRRRRRRRKK..",
  ".KRRRRRRRRRRRRRRRRRRRRRRRRRRK.",
  "KRRRRRRRRRRRRRRRRRRRRRRRRRRRRK",
  "KKKKKKKKKKKKKKKKKKKKKKKKKKKKKK",
  "KDIIIIIIIIIIIIIIIIIIIIIIIIIIDK",
  "KDIIIIIIIIIIIIIIIIIIIIIIIIIIDK",
  "KDIIIIIIIIIIIIIIIIKKKKKKKIIIDK",
  "KDIIIIIIIIIIIIIIIIKNNNNNKIIIDK",
  "KDIIIIIIIIIIIIIIIIKNYYYNKIIIDK",
  "KDIIIIIIIIIIIIIIIIKNYYYNKIIIDK",
  "KDIIIIIIIIIIIIIIIIKKKKKKKIIIDK",
  "KDIIIIIIIIIIIIIIIIIIIIIIIIIIDK",
  "KDIIIIIIIIIIIIIIIIIIIIIIIIIIDK",
  "KDIIIIIIIIIIIIIIIIIIIIIIIIIIDK",
  "KDIIIIIIIIIIIIIIIIIIIIIIIIIIDK",
  "KD..........................DK",
  "KD..........................DK",
  "KD..........................DK",
  "KD..........................DK",
  "KEEEEEEEEEEEEEEEEEEEEEEEEEEEEK",
  "KEDEEDEEDEEDEEDEEDEEDEEDEEDEEK",
], swap(PAL, { R: [150, 144, 156] }));

// live-aboard fishing boat, sheer stripe + pennant color-swapped per owner;
// aft mast with the gaff sail furled, little forward cabin, bow to the west
function boatArt(col) {
  const p = swap(PAL, { R: col });
  return parseArt([
    "......................KRRR..........",
    "......................KRR...........",
    "......................K.............",
    "......................K.............",
    "......................KLL...........",
    "......................KLLL..........",
    ".....................KKLLL..........",
    "......................KLLL..........",
    "......................KLL...........",
    "....KKKKKKKKKKK.......KLL...........",
    "....KEEEEEEEEEK.......KLL...........",
    "....KEKCCKEEEEK.......KLL...........",
    "....KEKCCKEEEEK......KKLLK..........",
    "....KEEEEEEEEEK.......KK............",
    "....KEEEEEEEEEK......KDDDDDDDDDK....",
    "..KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK..",
    ".KEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEK.",
    ".KRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRK.",
    "..KDDDDDDDDDDDDDDDDDDDDDADDDDDDDDK..",
    "...KDDDDDDDDDDDDDDDDDDDDDDDDDDDDK...",
    "....KKDDDDDDDDDDDDDDDDDDDDDDDDKK....",
    "......KKKKKKKKKKKKKKKKKKKKKKKK......",
    "....V..C.V....C....V...C....V..C....",
  ], p);
}

const BUS = parseArt([
  ".KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK.",
  "KAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAK",
  "KAKCCCCKAKCCCCKAKCCCCKAKCCCCKAKCCCCKAAAK",
  "KAKCCCCKAKCCCCKAKCCCCKAKCCCCKAKCCCCKAAAK",
  "KAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAK",
  "KOAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAOK",
  ".KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK.",
  "....KNKK....................KNKK........",
  "...KNNNNK..................KNNNNK.......",
  "....KKKK....................KKKK........",
], PAL);

function buggyArt(col) {
  const p = swap(PAL, { R: col });
  return parseArt([
    "......KCCK......",
    ".....KCCCCK.....",
    ".KKKKKKKKKKKKK..",
    "KRRRRRRRRRRRRRK.",
    "KRRKRRRRRRRKRRK.",
    ".KKNKKKKKKKNKK..",
    ".KNNNK...KNNNK..",
    "..KKK.....KKK...",
  ], p);
}

const BIKE = parseArt([
  ".....KK....KK...",
  "..KKKKKKKKKK....",
  ".KNK..KK..KNK...",
  "KN.NK.KK.KN.NK..",
  "KN.NKKKKKKN.NK..",
  ".KNK......KNK...",
  "..K........K....",
], PAL);

const BUS_STOP = parseArt([
  "KKKKKKK",
  "KAAAAAK",
  "KAKKKAK",
  "KAKAKAK",
  "KAKKKAK",
  "KAAAAAK",
  "KKKKKKK",
  "..KMK..",
  "..KMK..",
  "..KMK..",
  "..KMK..",
  "..KMK..",
  "..KMK..",
], PAL);

const MOON = parseArt([
  "...KKKK...",
  ".KKLLLLKK.",
  ".KLLLLMLK.",
  "KLLMLLLLLK",
  "KLLLLLLMLK",
  "KLMLLLLLLK",
  "KLLLLMLLLK",
  ".KLLLLLLK.",
  ".KKLLLLKK.",
  "...KKKK...",
], PAL);

// tiny Zzz + music note + grump cloud for mood bubbles are drawn as text

// community crab shelter: driftwood, wide doorway, patched roof
const SHELTER = parseArt([
  ".KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK.",
  "KMMMMMMMUUMMMMMMMMMMMUUMMMMMMMMMMK",
  "KMMUUMMMMMMMMMUUMMMMMMMMMMMUUMMMMK",
  "KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK",
  "KDEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEDK",
  "KDEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEDK",
  "KDEKKKKKEEEEEEEEEEEEEEEEEKKKKKEEDK",
  "KDEKCCCKEEEEEEEEEEEEEEEEEKCCCKEEDK",
  "KDEKCLCKEEEEEEEEEEEEEEEEEKCLCKEEDK",
  "KDEKKKKKEEEEEEEEEEEEEEEEEKKKKKEEDK",
  "KDEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEDK",
  "KDEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEDK",
  "KDEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEDK",
  "KDEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEDK",
  "KDEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEDK",
  "KDEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEDK",
  "KDEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEDK",
  "KD.KLLKPPPK.KLLKPPPK..KLLKPPPK..DK",
  "KDKLLLLPPPKKLLLLPPPK.KLLLLPPPK..DK",
  "KDKKKKKKKKKKKKKKKKKK.KKKKKKKKK..DK",
  "KEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEK",
  "KEDEEDEEDEEDEEDEEDEEDEEDEEDEEDEEEK",
], PAL);

// ================================================================ CS3 art
// pickup counter with a folded stack
const COUNTER = parseArt([
  "......KLLK..........",
  "......KVVK..........",
  "......KLLK..........",
  "KKKKKKKKKKKKKKKKKKKK",
  "KEEEEEEEEEEEEEEEEEEK",
  "KEDEEEEDEEEEDEEEEDEK",
  "KKKKKKKKKKKKKKKKKKKK",
  ".KDDK..........KDDK.",
  ".KDDK..........KDDK.",
  ".KDDK..........KDDK.",
], PAL);
// juice bar: a bin of oranges, a pair of blenders, and a cup counter
const FRUIT_BIN = parseArt([
  "KKKKKKKKKKKKKKKKKKKK",
  "KEEEEEEEEEEEEEEEEEEK",
  "KEDOOZOODOOZOODOOZEK",
  "KEOOOOODOOOOODOOOOEK",
  "KDEEDDEEEEDDEEEEDDEK",
  "KEEEEEEEEEEEEEEEEEEK",
  "KKKKKKKKKKKKKKKKKKKK",
], PAL);
const JUICER = [
  parseArt([
    "..KKKKK...",
    ".KLYOOYK..",
    ".KYOOYYK..",
    ".KOYYOOK..",
    ".KKKKKKK..",
    "...KMMK...",
    "..KMMMMK..",
    "..KNNNNK..",
    "..KKKKKK..",
  ], PAL),
  parseArt([
    "..KKKKK...",
    ".KOYLYOK..",
    ".KYYOOYK..",
    ".KOOYYOK..",
    ".KKKKKKK..",
    "...KMMK...",
    "..KMMMMK..",
    "..KNNNNK..",
    "..KKKKKK..",
  ], PAL),
];
const JUICE_COUNTER = parseArt([
  "..KYYK....KCCK......",
  "..KYYK....KCCK......",
  "KKKKKKKKKKKKKKKKKKKK",
  "KEEEEEEEEEEEEEEEEEEK",
  "KEDEEEEDEEEEDEEEEDEK",
  "KKKKKKKKKKKKKKKKKKKK",
  ".KDDK..........KDDK.",
  ".KDDK..........KDDK.",
  ".KDDK..........KDDK.",
], PAL);
// smudges overlaid on a grubby crab
const DIRT = parseArt([
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "..D..........D..",
  ".....D..D.......",
  "...D.......D....",
], swap(PAL, { D: [110, 90, 60] }));

// ================================================================ arcade art
// claw machine: glass cab full of plushies, claw on a gantry
const CLAW_MACHINE = [
  parseArt([
    "KKKKKKKKKKKKKK",
    "KPPPPPPPPPPPPK",
    "KPKKKKKKKKKKPK",
    "KPKCCCCCCCKKPK",
    "KPKCC-CCCCKKPK",
    "KPKCCCCCCCKKPK",
    "KPKYGPOYGPKKPK",
    "KPKKKKKKKKKKPK",
    "KPPPPPKAKPPPPK",
    "KPPPPPKKKPPPPK",
    "KKKKKKKKKKKKKK",
    ".KNK......KNK.",
  ], swap(PAL, { P: [200, 120, 255], "-": [250, 250, 255] })),
  parseArt([
    "KKKKKKKKKKKKKK",
    "KPPPPPPPPPPPPK",
    "KPKKKKKKKKKKPK",
    "KPKCCCC-CCKKPK",
    "KPKCCCCCCCKKPK",
    "KPKCCCC+CCKKPK",
    "KPKYGPOYGPKKPK",
    "KPKKKKKKKKKKPK",
    "KPPPPPKAKPPPPK",
    "KPPPPPKKKPPPPK",
    "KKKKKKKKKKKKKK",
    ".KNK......KNK.",
  ], swap(PAL, { P: [200, 120, 255], "-": [250, 250, 255], "+": [255, 216, 96] })),
];
// skeeball lane: sloped ramp with score rings
const SKEEBALL = parseArt([
  "..........KKKK",
  ".......KKKAOAK",
  "....KKKOAOAOAK",
  ".KKKNNNNNNNNNK",
  "KNNNNNNNNNNNNK",
  "KNUNUNUNUNUNUK",
  "KNNNNNNNNNNNNK",
  "KKKKKKKKKKKKKK",
  ".KNK.......KNK",
], PAL);
// token booth (source): ticket window with a coin tray
const TOKEN_BOOTH = parseArt([
  "KKKKKKKKKKKKKKKKKK",
  "KPPPPPPPPPPPPPPPPK",
  "KPKKKKKKKKKKKKKKPK",
  "KPKCCCCCCCCCCCCKPK",
  "KPKCCCAACCAACCCKPK",
  "KPKKKKKKKKKKKKKKPK",
  "KPPPPAAAAAAAAPPPPK",
  "KKKKKKKKKKKKKKKKKK",
  ".KNK..........KNK.",
], swap(PAL, { P: [200, 120, 255] }))
// prize counter (out): plush shelf
const PRIZE_COUNTER = parseArt([
  "KYYK..KGGK..KPPK....",
  "KYYK..KGGK..KPPK....",
  "KKKKKKKKKKKKKKKKKKKK",
  "KEEEEEEEEEEEEEEEEEEK",
  "KEDEEEEDEEEEDEEEEDEK",
  "KKKKKKKKKKKKKKKKKKKK",
  ".KDDK..........KDDK.",
  ".KDDK..........KDDK.",
], PAL);
// prize items
defItem("token", [
  ".........",
  "..KKKK...",
  ".KAALAK..",
  ".KALAAK..",
  ".KAAAAK..",
  "..KKKK...",
  ".........",
]);
defItem("plush", [
  ".KK..KK..",
  "KGGKKGGK.",
  "KGGGGGGK.",
  ".KGBGBGK.",
  ".KGGGGK..",
  "KGGKKGGK.",
  ".KK..KK..",
]);
defItem("tickets", [
  ".........",
  "KAAKAAK..",
  "KLLKLLK..",
  "KAAKAAK..",
  "KLLKLLK..",
  "KAAKAAK..",
  ".........",
]);
defItem("gold_plush", [
  ".KK..KK..",
  "KAAKKAAK.",
  "KAAAAAAK.",
  ".KABABAK.",
  ".KAAAAK..",
  "KAAKKAAK.",
  ".KK..KK..",
]);

// ================================================================ dining art
const SINK = parseArt([
  "......KKK.......",
  "......KMMK......",
  "..KKKKKMMK......",
  "KKMMMMMMMKKKKKKK",
  "KMKCCCCCCCCCCKMK",
  "KMKCVCVCCVCVCKMK",
  "KMKCCCCCCCCCCKMK",
  "KMKKKKKKKKKKKKMK",
  "KMMMMMMMMMMMMMMK",
  "KKKKKKKKKKKKKKKK",
  ".KNK.........KNK",
], PAL);
const PICNIC_TABLE = parseArt([
  "....KKKKKKKKKKKK....",
  "..KKEEEEEEEEEEEEKK..",
  ".KEEEEEEEEEEEEEEEEK.",
  ".KKKKKEEKKKKEEKKKKK.",
  "....KEEK....KEEK....",
  ".KKKKKKKKKKKKKKKKKK.",
  ".KEEEEEK......KEEEEK",
  "..KKKKK........KKKK.",
], PAL);
const DISHES = [
  parseArt(["..KKKK..", ".KLLLLK.", "KKKKKKKK"], PAL),
  parseArt(["..KKKK..", ".KVLLVK.", ".KLLLLK.", "KKKKKKKK"], PAL),
  parseArt([".KKKKKK.", ".KLVLLK.", ".KVLLVK.", ".KLLLLK.", "KKKKKKKK"], PAL),
];
defItem("dirty_dishes", [
  "..KKKK...",
  ".KLDLLK..",
  ".KDLLDK..",
  ".KLLLLK..",
  "KKKKKKKK.",
  ".........",
  ".........",
]);

// speaker icons for the master mute button
const SPEAKER_ON = parseArt([
  "...KK......",
  "..KLK.K....",
  ".KLLK..K.K.",
  "KLLLK.K.K.K",
  ".KLLK..K.K.",
  "..KLK.K....",
  "...KK......",
], PAL);
const SPEAKER_OFF = parseArt([
  "...KK......",
  "..KLK.R..R.",
  ".KLLK..RR..",
  "KLLLK..RR..",
  ".KLLK.R..R.",
  "..KLK......",
  "...KK......",
], PAL);

// ================================================================ showers art
// SUDSY's exclusive teal shell (last index; crew colors top out before it)
CRAB_COLORS.push([[88, 205, 188], [44, 145, 130]]);
// shower cap: white with blue polka dots (SUDSY's off-duty look and her trade)
ACCESSORIES.showercap = { dx: 4, dy: -3, art: parseArt([
  ".KLLLLK.",
  "KLCLLCLK",
  "KLLCLLCK",
  "KKKKKKKK",
], PAL) };
// coin-op taps: shower head on a pipe over a token box
const TAPS = parseArt([
  ".KKKKK..........",
  "KMMMMMK.........",
  "KMKMKMK.........",
  ".KKKKK..........",
  "...KMK..........",
  "...KMK..........",
  ".KKKMKKK........",
  "KAAKMKAAK.......",
  "KACKMKCAK.......",
  "KKKKKKKKK.......",
  ".KNK..KNK.......",
], PAL);
// shower stall: tall frame with a curtain rail; the curtain drops to
// ankle height when a guest is inside (feet gap at the bottom)
const STALL = [
  parseArt([
    "KKKKKKKKKKKKKKKK",
    "KVVVVVVVVVVVVVVK",
    "KVKKKKKKKKKKKKVK",
    "KVK..........KVK",
    "KVK...KMMK...KVK",
    "KVK...KMKK...KVK",
    "KVK..........KVK",
    "KVK....C.....KVK",
    "KVK..........KVK",
    "KVK..........KVK",
    "KVK..........KVK",
    "KVK..........KVK",
    "KVK..........KVK",
    "KVK..........KVK",
    "KVK..........KVK",
    "KKK..........KKK",
  ], PAL),
  parseArt([
    "KKKKKKKKKKKKKKKK",
    "KVVVVVVVVVVVVVVK",
    "KVKKKKKKKKKKKKVK",
    "KVLCLLCLLCLLCLVK",
    "KVLCLLCLLCLLCLVK",
    "KVLCLLCLLCLLCLVK",
    "KVLCLLCLLCLLCLVK",
    "KVLCLLCLLCLLCLVK",
    "KVLCLLCLLCLLCLVK",
    "KVLCLLCLLCLLCLVK",
    "KVLCLLCLLCLLCLVK",
    "KVLCLLCLLCLLCLVK",
    "KVLCLLCLLCLLCLVK",
    "KVKLKKLKKLKKLKVK",
    "KVK..........KVK",
    "KKK..........KKK",
  ], PAL),
];
// scrub bench: towels + soap bar
const SCRUB = parseArt([
  "..KLLK....KPPK..",
  "..KLLK.....KK...",
  "KKKKKKKKKKKKKKKK",
  "KEEEEEEEEEEEEEEK",
  "KKKKKKKKKKKKKKKK",
  ".KDDK......KDDK.",
], PAL);
defItem("soap", [
  ".........",
  ".KKKKK...",
  "KPPLPPK..",
  "KPPPPPK..",
  ".KKKKK...",
  ".........",
  ".........",
]);
defItem("linen", [
  ".........",
  ".KKKKKKK.",
  "KLLLLLLLK",
  "KWWWWWWWK",
  "KCCCCCCCK",
  ".KKKKKKK.",
  ".........",
]);
defItem("roomkey", [
  ".........",
  "..KKK....",
  ".KAAAK...",
  "KAKKKAKKK",
  ".KAAAKAKA",
  "..KKK.KKK",
  ".........",
]);
defItem("suds", [
  "..K.KK...",
  ".KVKLVK..",
  "KLVLVLVK.",
  "KVLVLVLK.",
  ".KLVLVK..",
  "..KKK....",
  ".........",
]);
defItem("shine", [
  "....K....",
  "...KLK...",
  ".KKLLLKK.",
  "..KLLLK..",
  "...KLK...",
  "....K....",
  ".........",
]);

// sickness bubble + beach memorial
const SICK_MARK = parseArt([
  ".GG.G.",
  "G..G.G",
  ".GG.G.",
], swap(PAL, { G: [130, 220, 110] }));
// OVERTIME POWERUP: a chunky little coffee cup that floats over a crab working
// past their contracted hours - same read-at-a-glance family as merge mode's
// thought bubble. Two frames: the steam curls. Derived from live state, so it
// clears itself the moment overtime ends.
const OT_MARK = [
  parseArt([
    "..Y....",
    ".Y.....",
    "KKKKKK.",
    "KWWWWKK",
    "KWWWWKW",
    "KWWWWKK",
    ".KKKK..",
  ], swap(PAL, { Y: [255, 235, 180], W: [180, 110, 60], K: [40, 26, 20] })),
  parseArt([
    "....Y..",
    "...Y...",
    "KKKKKK.",
    "KWWWWKK",
    "KWWWWKW",
    "KWWWWKK",
    ".KKKK..",
  ], swap(PAL, { Y: [255, 235, 180], W: [180, 110, 60], K: [40, 26, 20] })),
];
// THE WIDE BERTH's badge: two wavy lines and a fly, bobbing over a crab whose
// personal space has inflated (dirt past BERTH_AT). Same read-at-a-glance
// family as OT_MARK - live state in, no reset needed. It exists so the bubble
// of empty boardwalk has a legible CAUSE at a glance.
const STINK_MARK = [
  parseArt([
    ".G..G..",
    "G..G..K",
    ".G..G..",
    "G..G...",
    ".G..G..",
  ], swap(PAL, { G: [150, 190, 110], K: [40, 30, 26] })),
  parseArt([
    "..G..G.",
    "K.G..G.",
    "..G..G.",
    ".G..G..",
    "..G..G.",
  ], swap(PAL, { G: [170, 205, 125], K: [40, 30, 26] })),
];
const NOTICE_BOARD = parseArt([
  "KKKKKKKKKKKK",
  "KEEEEEEEEEEK",
  "KELLLKELLLEK",
  "KELKLKELKLEK",
  "KELLLKELKLEK",
  "KELKLKELLLEK",
  "KELLLKEEEEEK",
  "KEEEEEELLLEK",
  "KEYLLKEELKEK",
  "KEYLKKELLLEK",
  "KEEEEEEEEEEK",
  "KKKKKKKKKKKK",
  "..KDD..KDD..",
  "..KDD..KDD..",
  "..KDD..KDD..",
  ".KDDDKKDDDK.",
], PAL);

const MEMORIAL = parseArt([
  "...KKKK...",
  "..KMMMMK..",
  ".KMMLLMMK.",
  ".KMLMMLMK.",
  ".KMMMMMMK.",
  ".KMMLLMMK.",
  ".KMMMMMMK.",
  "KKKKKKKKKK",
  "KGGKGGKGGK",
], PAL);

// ---------------------------------------------------------------- public tap
// The town standpipe: a cast-iron post with a gooseneck spout and a stone
// catch-basin, one on the promenade by the notice board and one at the foot
// of the pier. Free water is a piece of TOWN INFRASTRUCTURE, so it is drawn
// like infrastructure - same weight of outline as the shelter and the board.
const STANDPIPE = parseArt([
  "...KKKK....",
  "..KMLLMK...",
  "..KMMMMK...",
  "..KMMMMKKK.",
  "..KMMMMKMMK",
  "..KMLMMKKKK",
  "..KMMMMK...",
  "..KMMMMK...",
  "..KMMMMK...",
  "..KMMMMK...",
  ".KKMMMMKK..",
  ".KMMMMMMK..",
  "KKMMMMMMKK.",
  "KUCCCCCCUK.",
  "KUUUUUUUUK.",
  "KKKKKKKKKK.",
], PAL);
// two frames of water falling from the spout into the basin - only drawn
// while somebody is actually drinking, so a dry tap reads as a dry tap
const TAP_FLOW = [
  parseArt([
    ".C.",
    ".C.",
    "C.C",
    ".C.",
  ], PAL),
  parseArt([
    ".C.",
    "C.C",
    ".C.",
    "C.C",
  ], PAL),
];

// ================================================================ fishing art
// fishing rod held out over the water (two bob frames)
const ROD = [
  parseArt([
    "..........K",
    ".......KK..",
    ".....KK....",
    "...KK...L..",
    ".KK.....L..",
    "K.......L..",
  ], PAL),
  parseArt([
    "..........K",
    ".......KK..",
    ".....KK....",
    "...KK......",
    ".KK.....L..",
    "K.......L..",
  ], PAL),
];
const BUCKET = parseArt([
  "KKKKKKKK",
  "KCCFCCFK",
  ".KMMMMK.",
  ".KMMMMK.",
  "..KKKK..",
], PAL);
// caught fish flopping (palette-swapped silver)
const CATCH_FISH = parseArt([
  ".KKK.....",
  "KMMKKKKK.",
  "KMMMMMWBK",
  "KMMKKKKK.",
  ".KKK.....",
], PAL);

// ---------------------------------------------------------------- the hotel
// The DRIFTWOOD HOTEL: a room door on the back wall of the lot, numbered by
// its own brass plate. Two frames - shut, and shut-with-the-lamp-on, which is
// how a guest in residence reads from the promenade at night. A DIRTY room
// (bed unmade, the maid hasn't been round) wears the third.
const HOTEL_DOOR = [
  parseArt([
    "KKKKKKKKKKKKKKKK",
    "KEEEEEEEEEEEEEEK",
    "KEKKKKKKKKKKKKEK",
    "KEKDDDDDDDDDDKEK",
    "KEKDMMMMMMMMDKEK",
    "KEKDMKKKKKKMDKEK",
    "KEKDMKNNNNKMDKEK",
    "KEKDMKNNNNKMDKEK",
    "KEKDMKKKKKKMDKEK",
    "KEKDMMMMMMMMDKEK",
    "KEKDDDDDDDDDDKEK",
    "KEKDDDDDDAKDDKEK",
    "KEKDDDDDDDDDDKEK",
    "KEKDDDDDDDDDDKEK",
    "KEKKKKKKKKKKKKEK",
    "KKKKKKKKKKKKKKKK",
  ], PAL),
  parseArt([
    "KKKKKKKKKKKKKKKK",
    "KEEEEEEEEEEEEEEK",
    "KEKKKKKKKKKKKKEK",
    "KEKDDDDDDDDDDKEK",
    "KEKDMMMMMMMMDKEK",
    "KEKDMKKKKKKMDKEK",
    "KEKDMKAAAAKMDKEK",
    "KEKDMKAYYAKMDKEK",
    "KEKDMKKKKKKMDKEK",
    "KEKDMMMMMMMMDKEK",
    "KEKDDDDDDDDDDKEK",
    "KEKDDDDDDAKDDKEK",
    "KEKDDDDDDDDDDKEK",
    "KEKDDDDDDDDDDKEK",
    "KEKKKKKKKKKKKKEK",
    "KKKKKKKKKKKKKKKK",
  ], PAL),
];
// the linen press behind the desk: stacked sheets and towels, the hotel's
// one working station
const LINEN_PRESS = parseArt([
  "KKKKKKKKKKKKKKKK",
  "KEEEEEEEEEEEEEEK",
  "KEKKKKKKKKKKKKEK",
  "KEKLLLLKWWWWKKEK",
  "KEKLLLLKWWWWKKEK",
  "KEKKKKKKKKKKKKEK",
  "KEKCCCCKPPPPKKEK",
  "KEKCCCCKPPPPKKEK",
  "KEKKKKKKKKKKKKEK",
  "KEEEEEEEEEEEEEEK",
  "KKKKKKKKKKKKKKKK",
], PAL);
// the front desk: a counter with a bell and the key rack behind
const HOTEL_DESK = parseArt([
  "..KKKKKKKKKKKK..",
  "..KAKAKAKAKAKK..",
  "KKKKKKKKKKKKKKKK",
  "KEEEEEEEEEEEEEEK",
  "KEDDDDDDDDDDDDEK",
  "KEDDDDDMKDDDDDEK",
  "KEDDDDMMMKDDDDEK",
  "KEEEEEEEEEEEEEEK",
  "KKKKKKKKKKKKKKKK",
], PAL);
// ---------------------------------------------------------------- the ferry
// THE MAINLAND FERRY. Deliberately ONE sprite in ONE function: another agent
// owns the island's horizon and the run to the mainland, so this is the hull
// tied up at the pier and nothing more. Two frames for the wash at the stern.
const FERRY_ART = [
  parseArt([
    "..........KKKKKK..........",
    "..........KWWWWK..........",
    "......KKKKKWWWWKKKKK......",
    "......KWWWWWWWWWWWWK......",
    "......KWCWCWCWCWCWCK......",
    "KKKKKKKWWWWWWWWWWWWKKKKKKK",
    "KRRRRRRRRRRRRRRRRRRRRRRRRK",
    "KRRRRRRRRRRRRRRRRRRRRRRRRK",
    "KTTTTTTTTTTTTTTTTTTTTTTTTK",
    ".KKKKKKKKKKKKKKKKKKKKKKKK.",
  ], PAL),
  parseArt([
    "..........KKKKKK..........",
    "..........KWWWWK..........",
    "......KKKKKWWWWKKKKK......",
    "......KWWWWWWWWWWWWK......",
    "......KWCWCWCWCWCWCK......",
    "KKKKKKKWWWWWWWWWWWWKKKKKKK",
    "KRRRRRRRRRRRRRRRRRRRRRRRRK",
    "KRRRRRRRRRRRRRRRRRRRRRRRRK",
    "KTTTTTTTTTTTTTTTTTTTTTTTTK",
    "KKKKKKKKKKKKKKKKKKKKKKKKKK",
  ], PAL),
];
// the funnel's smoke while she is alongside with the engine ticking over
const FERRY_SMOKE = [
  parseArt([
    "..M.",
    ".MM.",
    ".M..",
  ], PAL),
  parseArt([
    ".M..",
    ".MM.",
    "..M.",
  ], PAL),
];
