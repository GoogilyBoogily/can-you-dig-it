import { test, expect } from "bun:test";
import Module from "manifold-3d";
import { Geo, DEFAULTS, solve, buildLanePlates, type Options } from "../src/geometry";

const wasm = await Module(); wasm.setup();
const geo = new Geo(wasm);

/** Laid flat, a wall's Z extent is its thickness plus whatever stands off the outer face. */
function wallThickness(o: Options, name: "wall-tongue" | "wall-socket"): number {
  const plate = buildLanePlates(geo, o, solve(o), "top").find((p) => p.name === name)!;
  const box = (plate.whole ?? plate.rear)!.boundingBox();
  return box.max[2] - box.min[2];
}

// The dovetails only exist to gang lanes. A lane that stands alone has nothing to mate
// with, so its outer faces are flat: no rib in the air on one side, no open groove on
// the other, and no solid band in the lattice where either would have been.
test("a single lane's walls have no dovetail rib", () => {
  const single: Options = { ...DEFAULTS, lanesWide: 1 };
  expect(wallThickness(single, "wall-tongue")).toBeCloseTo(DEFAULTS.wall, 3);
  expect(wallThickness({ ...DEFAULTS, lanesWide: 2 }, "wall-tongue")).toBeCloseTo(DEFAULTS.wall + 3, 3);
});

test("a single lane's socket wall is the tongue wall's mirror", () => {
  const single: Options = { ...DEFAULTS, lanesWide: 1 };
  const d = solve(single);
  const plates = buildLanePlates(geo, single, d, "top");
  const vol = (name: string) => plates.find((p) => p.name === name)!.rear!.volume();
  expect(vol("wall-socket")).toBeCloseTo(vol("wall-tongue"), 1);
});
