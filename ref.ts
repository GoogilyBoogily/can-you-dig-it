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
import { Geo, DEFAULTS, PATTERNS, solve, buildAll, partList, type Derived, type Options, type PartSet, type LaneRole } from "./src/geometry";

/** The dimensions solve() derives from DEFAULTS, pinned so a change to the arithmetic shows up. */
export function refSpec(derived: Derived): Record<string, number> {
  const { n, nBottom, L, IW, OW, H, Hb, inset, xd, px, py, gangPitch } = derived;
  return { n, nBottom, L, IW, OW, H, Hb, inset, xd, px, py, gangPitch };
}

/**
 * Every part the snapshot covers, by the name it is stored under.
 * Two tiers give the top and bottom lanes; three are needed before a mid lane exists.
 * The minimal design shares the lip and riser, so only its lanes and cover are stored.
 */
export function refParts(geo: Geo, over: Partial<Options> = {}): Record<string, Manifold> {
  // `over` is not for the snapshot - ref.json is always the bare DEFAULTS. It lets a test
  // build the same part set at a setting nothing is snapshotted at (fit, say) and hold it
  // to properties rather than to stored numbers.
  const base: Options = { ...DEFAULTS, ...over };
  const derived = solve(base);
  const minimal: Options = { ...base, design: "minimal" };
  const three: Options = { ...base, tiers: 3 }, minimalTall: Options = { ...minimal, tiers: 3 };
  const twoTiers = buildAll(geo, base, derived);
  const threeTiers = buildAll(geo, three, derived);
  const minimalTwo = buildAll(geo, minimal, derived);
  const minimalThree = buildAll(geo, minimalTall, derived);
  const parts: Record<string, Manifold> = {
    "cover-front": twoTiers.cover[0],
    "cover-rear": twoTiers.cover[1],
    "end-lip": twoTiers.lip,
    "riser-24": twoTiers.riser,
    "minimal-cover-front": minimalTwo.cover[0],
    "minimal-cover-rear": minimalTwo.cover[1],
  };
  // every plate of every lane role, split halves as their own parts, for both designs,
  // under the names partList() prints them as (every set here is a cascade, so the
  // role is in the name)
  const lanes = (prefix: string, o: Options, set: PartSet, role: LaneRole) => {
    for (const part of partList(set, o)) if (part.name.startsWith(`lane-${role}-`)) parts[prefix + part.name] = part.mesh;
  };
  lanes("", base, twoTiers, "top"); lanes("", three, threeTiers, "mid"); lanes("", base, twoTiers, "bottom");
  lanes("minimal-", minimal, minimalTwo, "top"); lanes("minimal-", minimalTall, minimalThree, "mid"); lanes("minimal-", minimal, minimalTwo, "bottom");
  // solid: no lattice and no recess, the plates as bare slabs; and a 240 mm lane, short
  // enough to print whole, so the unsplit branch of buildLanePlates has a pin too
  for (const [prefix, variant] of [["solid-", { solid: true }], ["short-", { length: 240 }]] as const) {
    const o: Options = { ...base, ...variant };
    const set = buildAll(geo, o, solve(o));
    for (const part of partList(set, o)) if (part.role === "cover") parts[prefix + part.name] = part.mesh;
    lanes(prefix, o, set, "top");
  }
  // every other pattern: the top lane and the cover, since a pattern changes nothing else.
  // solve() per pattern - the auto radius differs
  for (const pattern of PATTERNS.filter((p) => p !== "hex")) {
    const o: Options = { ...base, pattern };
    const set = buildAll(geo, o, solve(o));
    parts[`${pattern}-cover-front`] = set.cover[0];
    parts[`${pattern}-cover-rear`] = set.cover[1];
    lanes(`${pattern}-`, o, set, "top");
  }
  // A single lane: the whole un-ganged wall branch. No dovetail rib, no groove, and no
  // keep-out band in the lattice where they would have been - and not one wall plate in
  // the snapshot was un-ganged, so overhang.test.ts never saw the branch either. A cell
  // landing where the band used to be would have shipped.
  {
    const o: Options = { ...base, lanesWide: 1 };
    const set = buildAll(geo, o, solve(o));
    for (const part of partList(set, o)) if (part.role === "cover") parts["single-" + part.name] = part.mesh;
    lanes("single-", o, set, "top"); lanes("single-", o, set, "bottom");
  }
  // A flat stack: the only style the solver offers when cascade is off, and the snapshot
  // had none of it but a grid deck. Its top-role end wall carries the 20 mm loading lip
  // on every tier and its deck runs full length, which no cascade part does. partList
  // leaves the role out of the name here, so these are lane-deck, not lane-top-deck.
  {
    const o: Options = { ...base, cascade: false };
    const set = buildAll(geo, o, solve(o));
    for (const part of partList(set, o)) if (part.name.startsWith("lane-") || part.role === "cover") parts["flat-" + part.name] = part.mesh;
  }
  // Gridfinity: the shelf lane's deck on its feet - a 410 lane (six cans, ten cells, the
  // longest a 256 bed prints in halves); with magnet pockets; in a corner of its floor;
  // the flat stack's; and on a 150 × 304 shelf (7 × 3 cells), where the lane overhangs
  // three cells on skirts
  const grid: Options = { ...base, base: "gridfinity", length: 410, shelfCells: [10, 9] };
  const gridVariants: Record<string, Partial<Options>> = {
    "grid-deck": {}, "grid-deck-magnets": { magnets: true }, "grid-deck-corner": { across: "left", along: "front" },
    "flat-grid-deck": { cascade: false }, "narrow-grid-deck": { length: 278, shelfCells: [7, 3], lanesWide: 1, cascade: false },
  };
  for (const [name, variant] of Object.entries(gridVariants)) {
    const o: Options = { ...grid, ...variant };
    for (const part of partList(buildAll(geo, o, solve(o)), o)) if (part.name.startsWith("grid-deck")) parts[part.name.replace("grid-deck", name)] = part.mesh;
  }
  return parts;
}

if (import.meta.main) {
  const wasm = await Module();
  wasm.setup();
  const geo = new Geo(wasm);

  // One line per part, so a diff line names its part and says min or max: "lane-top-deck-rear
  // max" moved, not an unlabelled number. The kernel version sits in spec so an upgrade
  // that shifts the float noise shows why.
  const manifoldVersion: string = (await Bun.file(new URL("node_modules/manifold-3d/package.json", import.meta.url)).json()).version;
  const lines = [`"spec": ${JSON.stringify({ ...refSpec(solve(DEFAULTS)), manifold: manifoldVersion })}`];
  for (const [name, mesh] of Object.entries(refParts(geo))) {
    if (mesh.status() !== "NoError") throw new Error(`${name} is not a valid solid: ${mesh.status()}`);
    const box = mesh.boundingBox();
    const round3 = (values: number[]) => values.map((v) => Number(v.toFixed(3)));
    lines.push(`${JSON.stringify(name)}: ${JSON.stringify({ vol: Number(mesh.volume().toFixed(3)), min: round3([...box.min]), max: round3([...box.max]) })}`);
  }

  await Bun.write("ref.json", `{\n${lines.join(",\n")}\n}\n`);
  console.log(`wrote ref.json: ${lines.length - 1} parts`);
}
