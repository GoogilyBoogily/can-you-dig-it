import { test, expect } from "bun:test";
import Module from "manifold-3d";
import { Geo, DEFAULTS, solve, buildLanePlates, type LaneRole } from "../src/geometry";

const wasm = await Module(); wasm.setup();
const geo = new Geo(wasm);

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
