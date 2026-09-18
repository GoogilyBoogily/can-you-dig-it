// bun run ref  →  regenerate ref.json, the geometry snapshot test/regress.test.ts pins.
//
// Run this only when you have changed geometry on purpose, and read the diff before
// committing it: every number that moves is a dimension you meant to move. A diff you
// cannot explain is the bug, not the snapshot.
//
// These values used to come from cansys.py — trimesh and shapely, a second
// implementation of the same drawings — which made the test a parity check between
// two kernels. That file is gone; `git show python-reference:cansys.py` still has it.
// The snapshot is generated from this codebase now, so the test catches drift rather
// than disagreement, and the tolerances in regress.test.ts are tight to match.
import Module from "manifold-3d";
import type { Manifold } from "manifold-3d";
import { Geo, DEFAULTS, solve, buildAll, type Derived, type Options, type PartSet, type LaneRole } from "./src/geometry";

/** The dimensions solve() derives from DEFAULTS, pinned so a change to the arithmetic shows up. */
export function refSpec(derived: Derived): Record<string, number> {
  const { n, nBottom, L, IW, OW, H, Hb, inset, xd, px, py, gangPitch } = derived;
  return { n, nBottom, L, IW, OW, H, Hb, inset, xd, px, py, gangPitch };
}

/**
 * Every part the snapshot covers, by the name it is stored under.
 * Two tiers give the top and bottom lanes; three are needed before a mid lane exists.
 * The minimal design shares the lip and risers, so only its lanes and cover are stored.
 */
export function refParts(geo: Geo): Record<string, Manifold> {
  const derived = solve(DEFAULTS);
  const minimal: Options = { ...DEFAULTS, design: "minimal" };
  const twoTiers = buildAll(geo, DEFAULTS, derived);
  const threeTiers = buildAll(geo, { ...DEFAULTS, tiers: 3 }, derived);
  const minimalTwo = buildAll(geo, minimal, derived);
  const minimalThree = buildAll(geo, { ...minimal, tiers: 3 }, derived);
  const lane = (set: PartSet, role: LaneRole) => set.lanes.find((l) => l.role === role)!;
  return {
    "lane-top-front": lane(twoTiers, "top").front!,
    "lane-top-rear": lane(twoTiers, "top").rear!,
    "lane-mid-front": lane(threeTiers, "mid").front!,
    "lane-mid-rear": lane(threeTiers, "mid").rear!,
    "lane-bottom-front": lane(twoTiers, "bottom").front!,
    "lane-bottom-rear": lane(twoTiers, "bottom").rear!,
    "cover-front": twoTiers.cover[0],
    "cover-rear": twoTiers.cover[1],
    "end-lip": twoTiers.lip,
    "riser-08": twoTiers.riser08,
    "riser-24": twoTiers.riser24,
    "minimal-lane-top-front": lane(minimalTwo, "top").front!,
    "minimal-lane-top-rear": lane(minimalTwo, "top").rear!,
    "minimal-lane-mid-front": lane(minimalThree, "mid").front!,
    "minimal-lane-mid-rear": lane(minimalThree, "mid").rear!,
    "minimal-lane-bottom-front": lane(minimalTwo, "bottom").front!,
    "minimal-lane-bottom-rear": lane(minimalTwo, "bottom").rear!,
    "minimal-cover-front": minimalTwo.cover[0],
    "minimal-cover-rear": minimalTwo.cover[1],
  };
}

if (import.meta.main) {
  const wasm = await Module();
  wasm.setup();
  const geo = new Geo(wasm);

  const snapshot: Record<string, unknown> = { spec: refSpec(solve(DEFAULTS)) };
  for (const [name, mesh] of Object.entries(refParts(geo))) {
    if (mesh.status() !== "NoError") throw new Error(`${name} is not a valid solid: ${mesh.status()}`);
    const box = mesh.boundingBox();
    snapshot[name] = {
      vol: Number(mesh.volume().toFixed(1)),
      bbox: [[...box.min], [...box.max]].map((corner) => corner.map((v) => Number(v.toFixed(3)))),
    };
  }

  await Bun.write("ref.json", JSON.stringify(snapshot, null, 1) + "\n");
  console.log(`wrote ref.json: ${Object.keys(snapshot).length - 1} parts`);
}
