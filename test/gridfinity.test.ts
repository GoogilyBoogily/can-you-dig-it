// The Gridfinity base: the shelf lane's deck on a 7 mm unit of whole 42 mm cells with a
// foot under each, for the baseplate you have. Spec in
// docs/superpowers/specs/2026-09-19-gridfinity-base-design.md.
import { test, expect } from "bun:test";
import { DEFAULTS, solve, check, buildAll, buildLanePlates, baseHeight, gridSpan, gridCells, type Options } from "../src/geometry";
import { fitSpace } from "../src/solver";

import { geo } from "./geo";

// a 400 × 460 shelf, 10 × 9 cells; a 410 lane (six cans) covers 10 × 4 of them
const grid: Options = { ...DEFAULTS, base: "gridfinity", length: 410, shelfCells: [10, 9] };
const d = solve(grid);
const deck = buildAll(geo, grid, d).gridDeck!;
const whole = geo.union([deck.front!, deck.rear!]);

test("a bin is n · 42 − 0.5 across, the half-mm shared between its two sides (docs/gridfinity-spec.md)", () => {
  expect(gridSpan(1)).toBe(41.5);
  expect(gridSpan(2)).toBe(83.5);
  expect(gridCells(83.5)).toBe(2);
  expect(gridCells(83.6)).toBe(3);
});

test("the lane keeps its length; its floor is the cells that cover it, a cell apart from the next", () => {
  expect(d.L).toBe(410);
  expect(d.floorCells).toEqual([10, 4]);
  expect(d.floor).toEqual([-209.75, -83.75, 209.75, 83.75]);
  expect(d.gangPitch).toBe(168);
  expect(solve(DEFAULTS).floorCells).toEqual([0, 0]); // nothing moves on the other bases
  expect(baseHeight(grid)).toBe(7);
  expect(baseHeight({ ...grid, magnets: true })).toBe(7);
});

test("the alignment moves the floor, not the lane: the spare goes to the other side", () => {
  const at = (v: Partial<Options>) => solve({ ...grid, ...v }).floor;
  expect(at({ along: "front" })).toEqual([-205, -83.75, 214.5, 83.75]); // lip end flush
  expect(at({ along: "back" })).toEqual([-214.5, -83.75, 205, 83.75]);
  expect(at({ across: "left" })).toEqual([-209.75, -98.5, 209.75, 69]); // +Y wall flush
  expect(at({ across: "right" })).toEqual([-209.75, -69, 209.75, 98.5]);
});

test("the unit hangs 7 mm below the deck; a foot protrudes with the profile, 35.6 flat to 41.5 at 4.75 up", () => {
  const box = whole.boundingBox();
  expect(box.min[2]).toBeCloseTo(-7, 3);
  expect(box.max[1] - box.min[1]).toBeCloseTo(167.5, 3);
  const cell = (z: number) => geo.isect(whole, geo.box(42, 42, 0.01, 4.5 * 42, 1.5 * 42, z)).boundingBox();
  const at = (z: number) => { const b = cell(z); return b.max[0] - b.min[0]; };
  expect(at(-7 + 0.005)).toBeCloseTo(35.6, 1);
  expect(at(-7 + 0.8 + 0.9)).toBeCloseTo(37.2, 1); // the vertical wall
  expect(at(-7 + 4.75 - 0.005)).toBeCloseTo(41.5, 1);
  // between feet, below the floor, is air: the feet stand proud
  expect(geo.isect(whole, geo.box(0.3, 30, 4, 4 * 42, 1.5 * 42, -5)).volume()).toBeCloseTo(0, 6);
});

test("the wall stands on the floor and its notch at ±px takes the boss; no gang rib on a grid", () => {
  const wall = buildLanePlates(geo, grid, d, "bottom").find((p) => p.name === "wall-tongue")!;
  const boss = geo.isect(whole, geo.box(20, 3, 2.4, d.px, d.piny, 1.2));
  expect(boss.volume()).toBeCloseTo(8 * 3 * 2.4, 0);
  const laid = wall.rear!.boundingBox();
  expect(laid.max[2] - laid.min[2]).toBeCloseTo(DEFAULTS.wall, 3);
});

test("magnet pockets take four 6.5 × 2.4 cylinders a cell, none where the seam would halve one", () => {
  const withMagnets = buildAll(geo, { ...grid, magnets: true }, d).gridDeck!;
  const pockets = whole.volume() - geo.union([withMagnets.front!, withMagnets.rear!]).volume();
  const cylinder = Math.PI * 3.25 ** 2 * 2.4 * (48 / (2 * Math.PI)) * Math.sin(2 * Math.PI / 48); // 48-gon
  expect(pockets).toBeCloseTo(40 * 4 * cylinder, -2); // centred, ten cells: the seam is a cell line
  // flush front the cells sit at x = −184.25 + 42i, so one cell's pockets land at x = −3.25:
  // on the seam, and skipped - four rows, two pockets each
  const front: Options = { ...grid, along: "front", magnets: true };
  const df = solve(front);
  const cutAt = (o: Options) => { const p = buildAll(geo, o, df).gridDeck!; return geo.union([p.front!, p.rear!]).volume(); };
  expect(cutAt({ ...front, magnets: false }) - cutAt(front)).toBeCloseTo((40 * 4 - 8) * cylinder, -2);
});

// A 150 × 304 × 150 shelf: 7 × 3 cells. Four cells (167.5) do not fit across, so the lane's
// floor keeps to three (125.5) and the 138 mm lane overhangs it 6 mm a side on a skirt
// down to the shelf, beside the baseplate. The lane always lands on the grid.
test("a shelf narrower than the covering cells: feet on the cells it has, skirts beside the baseplate", () => {
  const layouts = fitSpace({ w: 150, d: 304, h: 150, front: 0 }, { ...DEFAULTS, base: "gridfinity" }, { cascade: true });
  expect(layouts.length).toBeGreaterThan(0);
  const [best] = layouts;
  expect(best.options.shelfCells).toEqual([7, 3]);
  expect(best.derived.floorCells).toEqual([7, 3]);
  expect(best.derived.floor[1]).toBeCloseTo(-125.5 / 2, 6);
  expect(best.derived.foot[1]).toBeCloseTo(-69, 6);
  expect(best.footprint.slice(0, 2)).toEqual([138, 293.5]);
  expect(best.cans).toBe(4);
  const parts = buildAll(geo, best.options, best.derived).gridDeck!;
  const m = geo.union([parts.front!, parts.rear!]);
  const box = m.boundingBox();
  expect(box.max[1] - box.min[1]).toBeCloseTo(138, 3);
  expect(geo.isect(m, geo.box(20, 20, 0.01, 0, 66, -7 + 0.005)).volume()).toBeGreaterThan(0); // the skirt, under the wall, at the bed
  const flat = geo.isect(m, geo.box(42, 42, 0.01, 0, 0, -7 + 0.005)).boundingBox(); // the middle cell's foot
  expect(flat.max[1] - flat.min[1]).toBeCloseTo(35.6, 1);
});

test("a lane longer than the cells its shelf has keeps its length on a shorter floor", () => {
  const layouts = fitSpace({ w: 200, d: 300, h: 254, front: 0 }, { ...DEFAULTS, base: "gridfinity" }, { cascade: true });
  const long = layouts.find((l) => l.derived.L === 300)!;
  expect(long.derived.floorCells).toEqual([7, 4]);
  expect(long.footprint[1]).toBe(300);
  for (const l of layouts) expect(l.footprint[1]).toBeLessThanOrEqual(300);
});

test("lane and floor together fit the bed, or the layout is dropped", () => {
  // a 480 lane on a 12-cell shelf wants 12 cells, 503.5: over 250 a half; on a 10-cell shelf
  // its floor stops at 420 and the lane's own 480 splits to 248 - it fits, ends on skirts
  const twelve: Options = { ...grid, length: 480, shelfCells: [12, 9] };
  expect(check(twelve, solve(twelve)).some((w) => w.startsWith("FAIL"))).toBe(true);
  expect(check({ ...grid, length: 480 }, solve({ ...grid, length: 480 }))).toEqual([]);
  const short = solve({ ...grid, length: 240, shelfCells: [7, 9] });
  expect(short.floorCells[0]).toBe(6); // six cells cover 240, and 251.5 is over one plate
  expect(short.split).toBe(true);
});

test("the solver charges the unit and reports lane and floor together", () => {
  const layouts = fitSpace({ w: 400, d: 460, h: 254, front: 0 }, { ...DEFAULTS, base: "gridfinity" }, { cascade: true });
  expect(layouts.length).toBeGreaterThan(0);
  for (const l of layouts) {
    expect(l.options.shelfCells).toEqual([10, 9]);
    expect(l.options.lanesWide).toBe(2);
    expect(l.footprint[0]).toBe(168 + 167.5);
    const stack = l.style === "cascade" ? l.derived.Hb + (l.options.tiers - 1) * l.derived.H : l.options.tiers * l.derived.H;
    expect(l.footprint[2]).toBe(7 + stack);
  }
  expect(fitSpace({ w: 130, d: 304, h: 150, front: 0 }, { ...DEFAULTS, base: "gridfinity" }, { cascade: true })).toEqual([]);
});
