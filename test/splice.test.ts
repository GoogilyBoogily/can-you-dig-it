import { test, expect } from "bun:test";
import { DEFAULTS, solve, laneOf, buildLanePlates, buildDeck, buildWall, buildEndWall, splitDeck, splitWall, type LaneRole } from "../src/geometry";

import { geo } from "./geo";

// laneOf() is pure arithmetic: where the tabs go and where the deck opens between ties.
// Pinned for the default lane so a change there is seen without a geometry build.
// `edges` come in pairs (open band from, to). The first pair on every lane is the lip
// tie's band overrunning the deck start, an empty band buildDeck skips.
// The top lane's interior tie at x = -3.6 lands inside the splice band at -4 ± 10:
// merged, the band reads -14..6.4; unmerged, an opening began at 0.4, on the tongue's
// root. The bottom lane's tie at -4.5 sorts before the splice tie, and the merge has to
// take the lower end too or the band starts at -8.5, inside the socket.
test.each<[LaneRole, number[], number[]]>([
  ["top", [-149, 218, -79.8, 72.6, 148.8], [-156, -164, -144, -83.8, -75.8, -14, 6.4, 68.6, 76.6, 144.8, 152.8, 225]],
  ["mid", [-149, 218, -79.8, 72.6, 148.8], [-156, -164, -144, -83.8, -75.8, -14, 6.4, 68.6, 76.6, 144.8, 152.8, 225]],
  ["bottom", [-227, 218, -157.5, -81, 72, 148.5], [-234, -242, -222, -161.5, -153.5, -85, -77, -14.5, 6, 68, 76, 144.5, 152.5, 225]],
])("laneOf(%s) puts the default lane's tabs and tie bands where the snapshot has them", (role, tabs, edges) => {
  const lane = laneOf(DEFAULTS, solve(DEFAULTS), role);
  expect(lane.tabs).toEqual(tabs);
  expect(lane.edges).toEqual(edges);
});

/** How much of a probe box behind the seam, in the rear deck half, is solid. */
function rearDeckBehindSeam(role: LaneRole): number {
  const derived = solve(DEFAULTS);
  const rear = buildLanePlates(geo, DEFAULTS, derived, role).find((plate) => plate.name === "deck")!.rear!;
  const probe = geo.box(5, 30, 7, 3, 0, 4.5); // x 0.5..5.5, y ±15, z 1..8: inside the wedge on every lane
  return geo.isect(rear, probe).volume() / probe.volume();
}

// The deck splice tongue hangs off the rear half at x = 0. An interior cross-tie lands
// inside the splice band and, unmerged, its far edge started the next open cut at
// x = 1.6 mm (bottom lane: 1.0 mm) - the tongue's whole root.
test("the splice tongue is rooted in solid rear deck", () => {
  expect(rearDeckBehindSeam("top")).toBeCloseTo(1, 2);
  expect(rearDeckBehindSeam("bottom")).toBeCloseTo(1, 2);
});

// The T-slot at the seam: assembled, tongue and socket do not touch; pulled 1 mm apart in
// X the head lands on the socket's shoulders.
test("the deck splice T-slot locks the halves in X", () => {
  const d = solve(DEFAULTS);
  const ln = laneOf(DEFAULTS, d, "top");
  const [front, rear] = splitDeck(geo, DEFAULTS, d, ln, buildDeck(geo, DEFAULTS, d, ln));
  expect(geo.isect(front, rear).volume()).toBeCloseTo(0, 6);
  expect(geo.isect(front, rear.translate([1, 0, 0])).volume()).toBeGreaterThan(10);
});

// The wall halves butt at x = 0: a plain cut loses nothing and leaves nothing shared. Each
// half keeps at least one ear, which is what locates it.
test("the wall splice is a butt cut, each half with an ear", () => {
  const d = solve(DEFAULTS);
  const ln = laneOf(DEFAULTS, d, "top");
  const wall = buildWall(geo, DEFAULTS, d, ln, 1);
  const [front, rear] = splitWall(geo, d, wall);
  expect(geo.isect(front, rear).volume()).toBeCloseTo(0, 6);
  expect(front.volume() + rear.volume()).toBeCloseTo(wall.volume(), 3);
  expect(ln.tabs.some((tx) => tx < 0)).toBe(true);
  expect(ln.tabs.some((tx) => tx > 0)).toBe(true);
});

// The corner cross-lap: end wall and side walls do not touch assembled; the end wall
// pushed 1 mm either way in X meets a side wall's slot side (the post behind it closes
// the slot), and a side wall pushed 1 mm inward meets the end wall's body between them.
// Outward is the deck ears' job.
test("the corner cross-lap locks the end wall in X and stops the side walls closing in", () => {
  const d = solve(DEFAULTS);
  const ln = laneOf(DEFAULTS, d, "top");
  const endWall = buildEndWall(geo, DEFAULTS, d, ln);
  for (const sy of [1, -1]) {
    const side = buildWall(geo, DEFAULTS, d, ln, sy);
    expect(geo.isect(endWall, side).volume()).toBeCloseTo(0, 6);
    for (const s of [1, -1]) expect(geo.isect(endWall.translate([s, 0, 0]), side).volume()).toBeGreaterThan(10);
    expect(geo.isect(endWall, side.translate([0, -sy, 0])).volume()).toBeGreaterThan(10);
  }
});
