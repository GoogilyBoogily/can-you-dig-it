// The Gridfinity base: a pocketed baseplate for the shelf, and the shelf lane's deck on a
// 7 mm unit of feet that drop into it. Spec in
// docs/superpowers/specs/2026-09-19-gridfinity-base-design.md.
import { test, expect } from "bun:test";
import Module from "manifold-3d";
import { Geo, DEFAULTS, solve, check, buildAll, buildLanePlates, baseHeight, type Options } from "../src/geometry";
import { fitSpace } from "../src/solver";

const wasm = await Module(); wasm.setup();
const geo = new Geo(wasm);

// a 400 × 460 shelf: 10 cells deep, 9 across; a 410 lane (six cans) on 10 × 4 of them
const grid: Options = { ...DEFAULTS, base: "gridfinity", length: 410, baseCells: [10, 9] };
const d = solve(grid);
const set = buildAll(geo, grid, d);
const deck = geo.union([set.gridDeck!.front!, set.gridDeck!.rear!]);
const plate = geo.union(set.baseplate);

test("the lane keeps its length; its floor is the cells that cover it, centred; the baseplate is the shelf's", () => {
  expect(d.L).toBe(410);
  expect(d.floorCells).toEqual([10, 4]);
  expect(d.floor).toEqual([-209.75, -83.75, 209.75, 83.75]);
  expect(d.gangPitch).toBe(168);
  expect(d.plate).toEqual([-210, -84, 210, 294]); // 9 cells: the gang's 8 plus one spare column, centred = below
  expect(solve(DEFAULTS).floorCells).toEqual([0, 0]); // nothing moves on the other bases
  expect(baseHeight(grid)).toBe(7);
  expect(baseHeight({ ...grid, magnets: true })).toBeCloseTo(10.2, 6);
});

test("alignment moves the baseplate round the lanes' cells by whole cells", () => {
  expect(solve({ ...grid, across: "left" }).plate).toEqual([-210, -126, 210, 252]); // lanes flush +Y
  expect(solve({ ...grid, across: "right" }).plate).toEqual([-210, -84, 210, 294]);
  expect(solve({ ...grid, baseCells: [12, 9], along: "front" }).plate[0]).toBe(-210);
  expect(solve({ ...grid, baseCells: [12, 9], along: "back" }).plate[2]).toBe(210);
  expect(solve({ ...grid, baseCells: [13, 9] }).plate).toEqual([-252, -84, 294, 294]); // odd spare: one cell in front, two behind
});

test("the unit hangs 7 mm below the deck; a foot is the profile, 35.6 flat to 41.5 at 4.75", () => {
  const box = deck.boundingBox();
  expect(box.min[2]).toBeCloseTo(-7, 3);
  expect(box.max[1] - box.min[1]).toBeCloseTo(167.5, 3);
  const cell = (z: number) => geo.isect(deck, geo.box(42, 42, 0.01, 4.5 * 42, 1.5 * 42, z)).boundingBox();
  const at = (z: number) => { const b = cell(z); return b.max[0] - b.min[0]; };
  expect(at(-7 + 0.005)).toBeCloseTo(35.6, 1);
  expect(at(-7 + 0.8 + 0.9)).toBeCloseTo(37.2, 1);
  expect(at(-7 + 4.75 - 0.005)).toBeCloseTo(41.5, 1);
});

test("the baseplate is a pocket in every cell, the foot's negative, and the feet drop in", () => {
  const box = plate.boundingBox();
  expect([box.min[0], box.min[1], box.max[0], box.max[1]]).toEqual([-210, -84, 210, 294]);
  expect(box.max[2]).toBeCloseTo(4.65, 3);
  const rim = geo.isect(plate, geo.box(42, 42, 0.01, 21, 21, 4.65 - 0.005)).boundingBox();
  expect(rim.max[0] - rim.min[0]).toBeCloseTo(42, 1); // a knife edge at the rim
  const bottom = geo.isect(plate, geo.box(42, 42, 0.01, 21, 21, 0.005));
  expect(bottom.volume() / 0.01).toBeCloseTo(42 * 42 - 36.3 * 36.3 + (4 - Math.PI) * 1.15 ** 2, -1); // the frame at the bottom, 24-gon corners
  // feet in pockets: lower the deck by 4.65 − 0.1 + 7 − 4.75... the foot top plane meets the rim, and nothing clashes
  const seated = deck.translate([0, 0, 4.65 + 0.1 + 2.25 - 0]); // deck underside 2.35 above the rim
  expect(geo.isect(seated, plate).volume()).toBeLessThan(1);
});

test("magnets: a 3.2 mm floor under the pockets with four 6.5 × 2.4 pockets a cell", () => {
  const m = geo.union(buildAll(geo, { ...grid, magnets: true }, d).baseplate);
  expect(m.boundingBox().max[2]).toBeCloseTo(7.85, 3);
  const floor = geo.isect(m, geo.box(42, 42, 3.2, 21, 21, 1.6)).volume();
  const cylinder = Math.PI * 3.25 ** 2 * 2.4 * (48 / (2 * Math.PI)) * Math.sin(2 * Math.PI / 48);
  expect(floor).toBeCloseTo(42 * 42 * 3.2 - 4 * cylinder, -2);
});

test("the wall stands on the floor and its notch at ±px takes the boss; no gang dovetail on a grid", () => {
  const wall = buildLanePlates(geo, grid, d, "bottom").find((p) => p.name === "wall-tongue")!;
  const boss = geo.isect(deck, geo.box(20, 3, 2.4, d.px, d.piny, 1.2));
  expect(boss.volume()).toBeCloseTo(8 * 3 * 2.4, 0);
  const laid = wall.rear!.boundingBox();
  expect(laid.max[2] - laid.min[2]).toBeCloseTo(DEFAULTS.wall, 3);
});

// A 150 × 304 × 150 shelf: 7 × 3 cells. Four cells (167.5) do not fit across, so the lane's
// floor keeps to three (125.5) and the 138 mm lane overhangs it 6 mm a side on a skirt
// down to the shelf, beside the baseplate. The baseplate is exactly the lane's cells.
test("a shelf narrower than the covering cells: feet on the cells it has, skirts beside the baseplate", () => {
  const layouts = fitSpace({ w: 150, d: 304, h: 150, front: 0 }, { ...DEFAULTS, base: "gridfinity" }, { cascade: true });
  expect(layouts.length).toBeGreaterThan(0);
  const [best] = layouts;
  expect(best.options.baseCells).toEqual([7, 3]);
  expect(best.derived.floorCells).toEqual([7, 3]);
  expect(best.derived.plate).toEqual([-147, -63, 147, 63]);
  expect(best.footprint.slice(0, 2)).toEqual([138, 294]);
  expect(best.cans).toBe(4);
  const parts = buildAll(geo, best.options, best.derived);
  const m = geo.union([parts.gridDeck!.front!, parts.gridDeck!.rear!]);
  const box = m.boundingBox();
  expect(box.max[1] - box.min[1]).toBeCloseTo(138, 3);
  expect(geo.isect(m, geo.box(20, 20, 0.01, 0, 66, -7 + 0.005)).volume()).toBeGreaterThan(0); // the skirt, under the wall, at the bed
  expect(geo.union(parts.baseplate).boundingBox().max[1]).toBe(63);
  // with magnets the baseplate's floor runs out under the skirt
  const floored = geo.union(buildAll(geo, { ...best.options, magnets: true }, best.derived).baseplate);
  expect(floored.boundingBox().max[1]).toBe(69);
  expect(geo.isect(floored, geo.box(10, 6, 0.01, 0, 66, 3.2 - 0.005)).volume()).toBeGreaterThan(0);
});

test("a lane longer than the cells its shelf has keeps its length on a shorter floor", () => {
  const layouts = fitSpace({ w: 200, d: 300, h: 254, front: 0 }, { ...DEFAULTS, base: "gridfinity" }, { cascade: true });
  const long = layouts.find((l) => l.derived.L === 300)!;
  expect(long.derived.floorCells).toEqual([7, 4]);
  expect(long.footprint[1]).toBe(300);
});

test("the seam falls where it falls: lane and floor together fit the bed, or the layout is dropped", () => {
  // a 480 lane on a 12-cell shelf wants 12 cells, 503.5: over 250 a half; on a 10-cell shelf
  // its floor stops at 420 and the lane's own 480 splits to 248 - it fits, ends on skirts
  const twelve: Options = { ...grid, length: 480, baseCells: [12, 9] };
  expect(check(twelve, solve(twelve)).some((w) => w.startsWith("FAIL"))).toBe(true);
  expect(check({ ...grid, length: 480 }, solve({ ...grid, length: 480 }))).toEqual([]);
  const short = solve({ ...grid, length: 240, baseCells: [7, 9] });
  expect(short.floorCells[0]).toBe(6); // six cells cover 240, and 251.5 is over one plate
  expect(short.split).toBe(true);
});

test("tiles fit the bed, butt at cell lines, and lose nothing", () => {
  const tiles = set.baseplate;
  expect(tiles.length).toBeGreaterThan(1);
  for (const t of tiles) {
    const b = t.boundingBox();
    expect(b.max[0] - b.min[0]).toBeLessThanOrEqual(d.usableX + 1e-6);
    expect(b.max[1] - b.min[1]).toBeLessThanOrEqual(d.usableY + 1e-6);
    expect(((b.min[0] + 210) % 42 + 42) % 42).toBeCloseTo(0, 6);
    expect(t.status()).toBe("NoError");
  }
  expect(plate.volume()).toBeCloseTo(tiles.reduce((a, t) => a + t.volume(), 0), 0);
});

test("the solver charges the unit and reports baseplate and lanes together", () => {
  const layouts = fitSpace({ w: 400, d: 460, h: 254, front: 0 }, { ...DEFAULTS, base: "gridfinity" }, { cascade: true });
  expect(layouts.length).toBeGreaterThan(0);
  for (const l of layouts) {
    expect(l.options.baseCells).toEqual([10, 9]);
    expect(l.options.lanesWide).toBe(2);
    expect(l.footprint[0]).toBe(378);
    const stack = l.style === "cascade" ? l.derived.Hb + (l.options.tiers - 1) * l.derived.H : l.options.tiers * l.derived.H;
    expect(l.footprint[2]).toBe(7 + stack);
  }
  expect(fitSpace({ w: 130, d: 304, h: 150, front: 0 }, { ...DEFAULTS, base: "gridfinity" }, { cascade: true })).toEqual([]);
});
