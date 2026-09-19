import { test, expect } from "bun:test";
import { DEFAULTS, solve, laneOf, buildLanePlates, type LaneRole } from "../src/geometry";

import { geo } from "./geo";

// laneOf() is pure arithmetic: where the tabs go and where the deck opens between ties.
// Pinned for the default lane so a change there is seen without a geometry build.
// `edges` come in pairs (open band from, to). The first pair on every lane is the lip
// tie's band overrunning the deck start, an empty band buildDeck skips.
// The top lane's interior tie at x = -2.4 lands inside the splice band at -4 ± 10:
// merged, the band reads -14..6; unmerged, an opening began at 1.6, on the tongue's root.
test.each<[LaneRole, number[], number[]]>([
  ["top", [-155, 227, -79.2, 74.4, 151.2], [-156, -164, -144, -83.2, -75.2, -14, 6, 70.4, 78.4, 147.2, 155.2, 228]],
  ["mid", [-155, 227, -79.2, 74.4, 151.2], [-156, -164, -144, -83.2, -75.2, -14, 6, 70.4, 78.4, 147.2, 155.2, 228]],
  ["bottom", [-233, 227, -157, -80, 74, 151], [-234, -242, -222, -161, -153, -84, -76, -14, 6, 70, 78, 147, 155, 228]],
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

// The deck dovetail tongue hangs off the rear half at x = 0. An interior cross-tie lands
// inside the splice band and, unmerged, its far edge started the next open cut at
// x = 1.6 mm (bottom lane: 1.0 mm) - the tongue's whole root.
test("the splice tongue is rooted in solid rear deck", () => {
  expect(rearDeckBehindSeam("top")).toBeCloseTo(1, 2);
  expect(rearDeckBehindSeam("bottom")).toBeCloseTo(1, 2);
});
