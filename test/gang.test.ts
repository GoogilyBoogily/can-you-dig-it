import { test, expect } from "bun:test";
import { K, DEFAULTS, solve, laneOf, dtxOf, buildWall, buildClip, buildLanePlates, type Options } from "../src/geometry";

import { geo } from "./geo";

/** Laid flat, a wall's Z extent is its thickness plus whatever stands off the outer face. */
function wallThickness(o: Options, name: "wall-tongue" | "wall-socket"): number {
  const plate = buildLanePlates(geo, o, solve(o), "top").find((p) => p.name === name)!;
  const box = (plate.whole ?? plate.rear)!.boundingBox();
  return box.max[2] - box.min[2];
}

// The rib, groove and clip pockets only exist to gang lanes. A lane that stands alone
// has nothing to mate with, so its outer faces are flat: no rib in the air on one side,
// no open groove on the other, and no solid band in the lattice where either would have been.
test("a single lane's walls have no gang rib", () => {
  const single: Options = { ...DEFAULTS, lanesWide: 1 };
  expect(wallThickness(single, "wall-tongue")).toBeCloseTo(DEFAULTS.wall, 3);
  expect(wallThickness({ ...DEFAULTS, lanesWide: 2 }, "wall-tongue")).toBeCloseTo(DEFAULTS.wall + K.gangGap, 3);
});

test("a single lane's socket wall is the tongue wall's mirror", () => {
  const single: Options = { ...DEFAULTS, lanesWide: 1 };
  const d = solve(single);
  const plates = buildLanePlates(geo, single, d, "top");
  const vol = (name: string) => plates.find((p) => p.name === name)!.rear!.volume();
  expect(vol("wall-socket")).toBeCloseTo(vol("wall-tongue"), 1);
});

// Two lanes ganged: the +Y wall of one and the -Y wall of the next, gangPitch apart, in
// the lane frame. The rib sits in the groove with nothing touching, and the clip drops
// into the two facing pockets on the wall tops. Pull the lanes apart and a clip foot bears
// on its pocket's inner wall: that is the whole Y-lock, so it has to bind at 1 mm.
test("the rib clears the groove and the clip locks the joint in Y", () => {
  const o: Options = { ...DEFAULTS, lanesWide: 2 };
  const d = solve(o);
  const ln = laneOf(o, d, "top");
  const near = buildWall(geo, o, d, ln, 1);
  const far = buildWall(geo, o, d, ln, -1).translate([0, d.gangPitch, 0]);
  expect(geo.isect(near, far).volume()).toBeCloseTo(0, 6);
  const clip = buildClip(geo, o);
  const seat = (dx: number, dy: number) => clip.translate([dx, d.OW / 2 + K.gangGap / 2 + dy, ln.H - K.pinH / 2]);
  for (const dx of [-dtxOf(d), dtxOf(d)]) {
    expect(geo.isect(seat(dx, 0), geo.union([near, far])).volume()).toBeCloseTo(0, 6);
    expect(geo.isect(seat(dx, 1), far).volume()).toBeGreaterThan(5);
    expect(geo.isect(seat(dx, -1), near).volume()).toBeGreaterThan(5);
  }
});
