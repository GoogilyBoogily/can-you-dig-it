import { test, expect } from "bun:test";
import { K, DEFAULTS, solve, check, laneOf, buildDeck, buildWall, buildLanePlates, type Options } from "../src/geometry";

import { geo } from "./geo";

const single: Options = { ...DEFAULTS, lanesWide: 1 };
const ganged: Options = { ...DEFAULTS, lanesWide: 2 };

/** Laid flat, a wall's Z extent is its thickness plus whatever stands off the outer face. */
function wallThickness(o: Options, name: "wall-left" | "wall-right"): number {
  const plate = buildLanePlates(geo, o, solve(o), "top").find((p) => p.name === name)!;
  const box = (plate.whole ?? plate.rear)!.boundingBox();
  return box.max[2] - box.min[2];
}

// The gang joint lives on the deck: T tongues out of the +Y rail, between the ears, into
// sockets in the neighbour's rail. A lane that stands alone has nothing to mate with, so its deck ends
// at its ears and both walls are plain, whatever the lane count.
test("a single lane's deck ends at its ears; walls are plain either way", () => {
  const d = solve(single);
  const deck = buildDeck(geo, single, d, laneOf(single, d, "top")).boundingBox();
  expect(deck.max[1]).toBeCloseTo(d.OW / 2, 3);
  expect(deck.min[1]).toBeCloseTo(-d.OW / 2, 3);
  expect(wallThickness(single, "wall-left")).toBeCloseTo(DEFAULTS.wall, 3);
  expect(wallThickness(ganged, "wall-left")).toBeCloseTo(DEFAULTS.wall, 3);
});

test("a single lane's right wall is the left wall's mirror", () => {
  const plates = buildLanePlates(geo, single, solve(single), "top");
  const vol = (name: string) => plates.find((p) => p.name === name)!.rear!.volume();
  expect(vol("wall-right")).toBeCloseTo(vol("wall-left"), 1);
});

// Two decks gangPitch apart: the tongues sit in the sockets with nothing touching, and
// the walls between them clear each other. Pull the far deck 1 mm in Y and the head
// lands on the socket's shoulders; push it 1 mm in X and the neck lands on the socket's
// sides. That is the whole joint, so it has to bind both ways.
test("the deck tongue clears its socket and locks the neighbour in X and Y", () => {
  const d = solve(ganged);
  const ln = laneOf(ganged, d, "top");
  const near = buildDeck(geo, ganged, d, ln);
  const far = buildDeck(geo, ganged, d, ln).translate([0, d.gangPitch, 0]);
  expect(geo.isect(near, far).volume()).toBeCloseTo(0, 6);
  expect(geo.isect(near, far.translate([0, 1, 0])).volume()).toBeGreaterThan(10);
  expect(geo.isect(near, far.translate([1, 0, 0])).volume()).toBeGreaterThan(10);
  const nearWall = buildWall(geo, ganged, d, ln, 1);
  const farWall = buildWall(geo, ganged, d, ln, -1).translate([0, d.gangPitch, 0]);
  expect(geo.isect(nearWall, farWall).volume()).toBeCloseTo(0, 6);
  // both walls the tongue passes under notch over it
  expect(geo.isect(farWall, near).volume()).toBeCloseTo(0, 6);
  expect(geo.isect(nearWall, near).volume()).toBeCloseTo(0, 6);
});

// The lip pockets sit where a socket head would go, so the lip-end ear stays an ear on
// both sides and the deck's plate width is the tongue reach past OW.
test("no tongue at the lip end; plateY charges the tongue reach", () => {
  const d = solve(ganged);
  const ln = laneOf(ganged, d, "top");
  const deck = buildDeck(geo, ganged, d, ln);
  const lipEar = geo.isect(deck, geo.box(K.earW + 2, 40, 10, ln.tabs[0], d.OW / 2 + 20, 0));
  expect(lipEar.volume()).toBeCloseTo(0, 6);
  expect(deck.boundingBox().max[1]).toBeCloseTo(d.OW / 2 + DEFAULTS.wall + K.gangGap + K.spliceDepth, 3);
  expect(d.plateY).toBeGreaterThanOrEqual(d.OW + DEFAULTS.wall + K.gangGap + K.spliceDepth);
});

// The tongues go between the ears, not in their place: ganged, every deck still has an
// ear under both walls at every tab, the same ear a lane standing alone has. In an ear's
// place a tongue left the -Y wall of the row's end lane on one ear of five and every
// deck's -Y edge hanging off that one.
test("a ganged deck keeps an ear under both walls at every tab", () => {
  for (const role of ["top", "bottom"] as const) {
    const earsAt = (o: Options) => {
      const d = solve(o), ln = laneOf(o, d, role);
      const deck = buildDeck(geo, o, d, ln);
      return ln.tabs.map((tx) => [1, -1].map((sy) => geo.isect(deck, geo.box(K.earW + 2, DEFAULTS.wall, K.deckLo, tx, sy * d.py, K.deckLo / 2)).volume()));
    };
    const alone = earsAt(single), ganged_ = earsAt(ganged);
    expect(ganged_.length).toBe(alone.length);
    ganged_.forEach((pair, i) => pair.forEach((vol, j) => expect(vol).toBeCloseTo(alone[i][j], 1)));
  }
});

// A lane from 260 mm gangs, with a tongue on each half from 290 mm when it splits.
// Shorter, its ears, pins and lip pockets can leave no stretch of rail for a tongue, and
// check() says so whenever that happens rather than handing over lanes that stand loose.
test("a lane from 260 mm keys to its neighbour; one that cannot says so", () => {
  for (let length = 150; length <= 520; length += 1) {
    const o: Options = { ...ganged, length };
    const d = solve(o);
    const warnings = check(o, d);
    if (warnings.some((w) => w.startsWith("FAIL"))) continue;
    const tongues = (["top", "bottom"] as const).map((role) => laneOf(o, d, role).tongues);
    expect(warnings.some((w) => w.includes("stand side by side"))).toBe(tongues.some((t) => !t.length));
    if (length >= 260) for (const t of tongues) expect(t.length).toBeGreaterThan(0);
    if (length >= 290 && d.split) for (const t of tongues) expect(t.some((x) => x < 0) && t.some((x) => x > 0)).toBe(true);
  }
  const short: Options = { ...single, length: 220 };
  expect(check(short, solve(short)).some((w) => w.includes("stand side by side"))).toBe(false);
});

// On the minimal deck the neighbour's T head drops into a socket cut through the
// plinth, and the arms beside the head are what hold the row together in Y. Under a
// tongue the plinth is 3 mm wider a side than under an ear, so each arm is ~5.75 mm,
// not the 2.75 an ear-width plinth left.
test("the minimal deck keeps a wide arm each side of every socket", () => {
  const o: Options = { ...ganged, design: "minimal" };
  const d = solve(o);
  const ln = laneOf(o, d, "top");
  const deck = buildDeck(geo, o, d, ln);
  const headY = -d.IW / 2 + (K.spliceNeck + K.spliceDepth) / 2;
  for (const gx of ln.tongues) for (const side of [1, -1]) {
    const probe = geo.box(4, 4, K.deckLo, gx + side * (K.gangHead / 2 + 3.5), headY, K.deckLo / 2);
    expect(geo.isect(deck, probe).volume()).toBeCloseTo(probe.volume(), 3);
  }
});
