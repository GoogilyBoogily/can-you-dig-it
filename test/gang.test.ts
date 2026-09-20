import { test, expect } from "bun:test";
import { K, DEFAULTS, solve, laneOf, buildDeck, buildWall, buildLanePlates, type Options } from "../src/geometry";

import { geo } from "./geo";

const single: Options = { ...DEFAULTS, lanesWide: 1 };
const ganged: Options = { ...DEFAULTS, lanesWide: 2 };

/** Laid flat, a wall's Z extent is its thickness plus whatever stands off the outer face. */
function wallThickness(o: Options, name: "wall-left" | "wall-right"): number {
  const plate = buildLanePlates(geo, o, solve(o), "top").find((p) => p.name === name)!;
  const box = (plate.whole ?? plate.rear)!.boundingBox();
  return box.max[2] - box.min[2];
}

// The gang joint lives on the deck: a T tongue out of every +Y ear into a socket in the
// neighbour's rail. A lane that stands alone has nothing to mate with, so its deck ends
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
  // the tongue is also the far lane's ear: that wall notches over it and drops its tab through
  expect(geo.isect(farWall, near).volume()).toBeCloseTo(0, 6);
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
