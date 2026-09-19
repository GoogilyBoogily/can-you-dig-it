// The Gridfinity base: a baseplate for the shelf with a solid pad under the lanes, which
// stand on it as they stand on the shelf. Spec in
// docs/superpowers/specs/2026-09-19-gridfinity-base-design.md.
import { test, expect } from "bun:test";
import Module from "manifold-3d";
import { Geo, DEFAULTS, solve, buildAll, baseHeight, type Options } from "../src/geometry";
import { fitSpace, laneNeeds } from "../src/solver";

const wasm = await Module(); wasm.setup();
const geo = new Geo(wasm);

// a 400 × 460 shelf: 10 cells deep, 9 across, the default two-lane gang in the middle
const grid: Options = { ...DEFAULTS, base: "gridfinity", baseCells: [10, 9] };
const d = solve(grid);
const tiles = buildAll(geo, grid, d).baseplate;
const whole = geo.union(tiles);

test("the lane is the flat lane: nothing in solve() moves but the baseplate", () => {
  const flat = solve(DEFAULTS);
  for (const k of ["L", "OW", "gangPitch", "H", "Hb", "split", "plateX", "plateY"] as const) expect(d[k]).toBe(flat[k]);
  expect(buildAll(geo, DEFAULTS, flat).baseplate).toEqual([]);
});

test("the baseplate is the cells the shelf takes, centred round the gang's pad", () => {
  // 10 cells are 420 and the 480 lane is longer, so the plate grows to the pad along; 9
  // cells are 378 round a 279 pad across, centred: y −118.5 .. 259.5 about the pad's −69 .. 210
  expect(d.plate).toEqual([-240, -118.5, 240, 259.5]);
  const box = whole.boundingBox();
  expect([box.min[0], box.min[1], box.max[0], box.max[1]].map((v) => Math.round(v * 100) / 100)).toEqual([-240, -118.5, 240, 259.5]);
  expect(box.max[2]).toBeCloseTo(4.65 + 2.4, 3); // rim plus the bosses
  expect(baseHeight(grid)).toBe(4.65);
  expect(baseHeight({ ...grid, magnets: true })).toBeCloseTo(7.85, 6);
});

test("alignment puts the pad flush with an edge and the free cells on the other side", () => {
  expect(solve({ ...grid, across: "left" }).plate[3]).toBe(210); // pad top = plate top
  expect(solve({ ...grid, across: "right" }).plate[1]).toBe(-69);
  expect(solve({ ...grid, along: "front" }).plate[0]).toBe(-240);
  expect(solve({ ...grid, along: "back" }).plate[2]).toBe(240);
});

test("a shelf narrower or shorter than its cells grows the plate to the pad: 150 × 304 is all pad", () => {
  const [best] = fitSpace({ w: 150, d: 304, h: 150, front: 0 }, { ...DEFAULTS, base: "gridfinity" }, { cascade: true });
  expect(best.options.baseCells).toEqual([7, 3]);
  expect(best.derived.plate[3] - best.derived.plate[1]).toBe(138); // 3 cells are 126, the lane is 138
  expect(best.footprint.slice(0, 2)).toEqual([138, 294]);
  expect(best.cans).toBe(4);
  const plate = geo.union(buildAll(geo, best.options, best.derived).baseplate);
  // no pocket anywhere: a flat slab with bosses, 138 × 294 × 4.65, less a key's clearance
  expect(plate.volume()).toBeCloseTo(138 * 294 * 4.65 + 4 * 8 * 3 * 2.4 - 2 * 5.4 * 12.4 * 1, -3);
});

test("pockets only in cells clear of the pad; the pad carries a boss at every lane's ±px", () => {
  // free cells: 9 across × 10 deep = 90, less those the pad (−241 .. 241 × −70 .. 209) touches
  const pocketVol = 42 * 42 * 4.65 - geo.isect(whole, geo.box(42, 42, 4.65, -189, -97.5, 4.65 / 2)).volume(); // the corner cell, free
  expect(pocketVol).toBeGreaterThan(36 * 36 * 4.65 * 0.9);
  const padCell = geo.isect(whole, geo.box(42, 42, 4.65, 0, 0, 4.65 / 2)).volume();
  expect(padCell).toBeCloseTo(42 * 42 * 4.65, -1); // solid under the lane
  for (const i of [0, 1]) for (const sx of [1, -1]) for (const sy of [1, -1]) {
    const boss = geo.isect(whole, geo.box(20, 20, 2.4, sx * d.px, i * d.gangPitch + sy * d.piny, 4.65 + 1.2));
    expect(boss.volume()).toBeCloseTo(8 * 3 * 2.4, 0);
  }
});

test("magnets: a 3.2 mm floor under the pockets with four 6.5 × 2.4 pockets per free cell", () => {
  const withMagnets = buildAll(geo, { ...grid, magnets: true }, d).baseplate;
  const m = geo.union(withMagnets);
  expect(m.boundingBox().max[2]).toBeCloseTo(7.85 + 2.4, 3);
  const floor = geo.isect(m, geo.box(42, 42, 3.2, -189, -97.5, 1.6)).volume(); // the corner cell's floor
  const cylinder = Math.PI * 3.25 ** 2 * 2.4 * (48 / (2 * Math.PI)) * Math.sin(2 * Math.PI / 48);
  expect(floor).toBeCloseTo(42 * 42 * 3.2 - 4 * cylinder, -2);
});

test("tiles fit the bed and key through the pad, not through pockets", () => {
  expect(tiles.length).toBeGreaterThan(1);
  for (const t of tiles) {
    const b = t.boundingBox();
    expect(b.max[0] - b.min[0]).toBeLessThanOrEqual(d.usableX + 1e-6);
    expect(b.max[1] - b.min[1]).toBeLessThanOrEqual(d.usableY + 1e-6);
    expect(t.status()).toBe("NoError");
  }
  expect(whole.volume()).toBeCloseTo(tiles.reduce((a, t) => a + t.volume(), 0), 0); // no overlap, nothing lost
});

test("the solver charges the baseplate's height and reports its size", () => {
  const layouts = fitSpace({ w: 400, d: 460, h: 254, front: 0 }, { ...DEFAULTS, base: "gridfinity" }, { cascade: true });
  expect(layouts.length).toBeGreaterThan(0);
  for (const l of layouts) {
    expect(l.options.baseCells).toEqual([10, 9]);
    expect(l.footprint[0]).toBe(378);
    expect(l.footprint[1]).toBeGreaterThanOrEqual(l.derived.L);
    const stack = l.style === "cascade" ? l.derived.Hb + (l.options.tiers - 1) * l.derived.H : l.options.tiers * l.derived.H;
    expect(l.footprint[2]).toBe(4.65 + stack);
  }
  expect(laneNeeds({ ...DEFAULTS, base: "gridfinity" }).w).toBe(149);
});
