// The Gridfinity base: the bottom deck on a 7 mm unit of whole 42 mm cells with a foot
// under each. Spec in docs/superpowers/specs/2026-09-19-gridfinity-base-design.md.
import { test, expect } from "bun:test";
import Module from "manifold-3d";
import { Geo, DEFAULTS, solve, check, buildAll, buildLanePlates, baseHeight, type Options } from "../src/geometry";
import { fitSpace, laneNeeds } from "../src/solver";

const wasm = await Module(); wasm.setup();
const geo = new Geo(wasm);

const grid: Options = { ...DEFAULTS, base: "gridfinity", length: 410 }; // six cans on the bottom deck
const d = solve(grid);
const deck = buildAll(geo, grid, d).gridDeck!;
const whole = geo.union([deck.front!, deck.rear!]);

test("the lane keeps its length; the floor is whole cells round it: 410 × 138 on 10 × 4, a cell apart", () => {
  expect(d.L).toBe(410);
  expect([d.gridX, d.gridY]).toEqual([10, 4]);
  expect(d.gangPitch).toBe(168);
  expect(d.plateY).toBe(167.5);
  expect(d.floor).toEqual([-209.75, -83.75, 209.75, 83.75]);
  expect(solve(DEFAULTS).floor).toEqual([-240, -69, 240, 69]); // no grid: the lane itself
});

test("the alignment moves the floor, not the lane: the spare goes to the other side", () => {
  const at = (v: Partial<Options>) => solve({ ...grid, ...v }).floor;
  expect(at({ along: "front" })).toEqual([-205, -83.75, 214.5, 83.75]); // lip end flush
  expect(at({ along: "back" })).toEqual([-214.5, -83.75, 205, 83.75]);
  expect(at({ across: "left" })).toEqual([-209.75, -98.5, 209.75, 69]); // +Y wall flush
  expect(at({ across: "right" })).toEqual([-209.75, -69, 209.75, 98.5]);
  expect(at({ along: "front", across: "left", length: 480 })).toEqual([-240, -98.5, 263.5, 69]);
});

test("it is the floor that has to fit the bed, and it splits at x = 0 wherever the seam lands", () => {
  // 480: twelve cells, 503.5 - a half is over 250 however it is aligned
  expect(check({ ...grid, length: 480 }, solve({ ...grid, length: 480 })).some((w) => w.startsWith("FAIL"))).toBe(true);
  // 240 fits one plate but its floor (251.5) does not: the lane splits
  const short = solve({ ...grid, length: 240 });
  expect(short.split).toBe(true);
  expect(short.plateX).toBeCloseTo(251.5 / 2 + 8, 6);
  // flush front on a 410 lane: the rear half carries the spare, 214.5 + 8
  expect(solve({ ...grid, along: "front" }).plateX).toBeCloseTo(222.5, 6);
});

test("the unit hangs 7 mm below the deck, the bin's edge wide, and the solver charges it", () => {
  const box = whole.boundingBox();
  expect(box.min[2]).toBeCloseTo(-7, 3);
  expect(box.max[1] - box.min[1]).toBeCloseTo(167.5, 3);
  expect(box.max[0] - box.min[0]).toBeCloseTo(419.5, 3);
  expect(baseHeight("gridfinity")).toBe(7);
  expect(baseHeight("feet")).toBe(24);
});

test("a corner-aligned deck's feet sit on the cells of its own floor", () => {
  const corner: Options = { ...grid, across: "left", along: "front" };
  const dc = solve(corner);
  const plate = buildAll(geo, corner, dc).gridDeck!;
  const m = geo.union([plate.front!, plate.rear!]);
  const box = m.boundingBox();
  expect([box.min[0], box.min[1], box.max[0], box.max[1]]).toEqual(dc.floor.map((v) => expect.closeTo(v, 3)) as any);
  // the first cell's flat at the bed, 3 mm in from the floor's corner: (x0 + 21 − 0.25 − 17.8)
  const flat = geo.isect(m, geo.box(42, 42, 0.01, dc.floor[0] + 20.75, dc.floor[1] + 20.75, -7 + 0.005)).boundingBox();
  expect(flat.min[0]).toBeCloseTo(dc.floor[0] + 20.75 - 17.8, 1);
  expect(flat.min[1]).toBeCloseTo(dc.floor[1] + 20.75 - 17.8, 1);
});

test("a foot is the profile: 35.6 flat, 41.5 at 4.75 up", () => {
  // slice the corner cell at the bed and just under the floor
  const cell = (z: number) => geo.isect(whole, geo.box(42, 42, 0.01, 4.5 * 42, 1.5 * 42, z)).boundingBox();
  const at = (z: number) => { const b = cell(z); return b.max[0] - b.min[0]; };
  expect(at(-7 + 0.005)).toBeCloseTo(35.6, 1);
  expect(at(-7 + 0.8 + 0.9)).toBeCloseTo(37.2, 1); // the vertical wall
  expect(at(-7 + 4.75 - 0.005)).toBeCloseTo(41.5, 1);
});

test("the wall stands on the floor and its notch at ±px takes the boss", () => {
  const wall = buildLanePlates(geo, grid, d, "bottom").find((p) => p.name === "wall-tongue")!;
  // the boss: 8 × 3 × 2.4 above z = 0 at (px, piny), inside the wall's footprint where
  // the deck has no ear (px is kept clear of the tabs)
  const boss = geo.isect(whole, geo.box(20, 3, 2.4, d.px, d.piny, 1.2));
  expect(boss.volume()).toBeCloseTo(8 * 3 * 2.4, 0);
  // no dovetail rib on a grid, even two lanes wide: laid flat the wall is its own thickness
  const laid = wall.rear!.boundingBox();
  expect(laid.max[2] - laid.min[2]).toBeCloseTo(DEFAULTS.wall, 3);
});

test("magnet pockets take four 6.5 × 2.4 cylinders a cell, none where the seam would halve one", () => {
  const withMagnets = buildAll(geo, { ...grid, magnets: true }, d).gridDeck!;
  const pockets = whole.volume() - geo.union([withMagnets.front!, withMagnets.rear!]).volume();
  const cylinder = Math.PI * 3.25 ** 2 * 2.4 * (48 / (2 * Math.PI)) * Math.sin(2 * Math.PI / 48); // 48-gon
  expect(pockets).toBeCloseTo(40 * 4 * cylinder, -2); // centred, ten cells: the seam is a cell line
  // flush front the cells sit at x = −184.25 + 42i, so one cell's pockets land at
  // x = −3.25: on the seam, and skipped - four rows, two pockets each
  const front: Options = { ...grid, along: "front", magnets: true };
  const df = solve(front);
  const cutAt = (o: Options) => { const p = buildAll(geo, o, df).gridDeck!; return geo.union([p.front!, p.rear!]).volume(); };
  expect(cutAt({ ...front, magnets: false }) - cutAt(front)).toBeCloseTo((40 * 4 - 8) * cylinder, -2);
});

test("the solver reports lane and floor together, inside the shelf, and charges the unit's height", () => {
  const shelf = { w: 200, d: 460, h: 254, front: 0 };
  const layouts = fitSpace(shelf, grid, { cascade: true });
  expect(layouts.length).toBeGreaterThan(0);
  for (const l of layouts) {
    expect(l.footprint[1]).toBeLessThanOrEqual(shelf.d);
    expect(l.footprint[1]).toBeGreaterThanOrEqual(l.derived.L);
    expect(l.footprint[0]).toBe(168 * l.options.lanesWide);
    const stack = l.style === "cascade" ? l.derived.Hb + (l.options.tiers - 1) * l.derived.H : l.options.tiers * l.derived.H;
    expect(l.footprint[2]).toBe(7 + stack);
  }
});

// A 150 × 304 × 150 shelf: four cells (167.5) do not fit across, so the floor keeps to
// three (125.5) and the 138 mm lane overhangs it 6 mm a side on a skirt down to the
// shelf, beside the baseplate. The lane always lands on the grid.
test("a shelf narrower than the covering cells gets a narrower floor and a skirt", () => {
  const layouts = fitSpace({ w: 150, d: 304, h: 150, front: 0 }, grid, { cascade: true });
  expect(layouts.length).toBeGreaterThan(0);
  const [best] = layouts;
  expect(best.options.floorCells).toEqual([0, 3]);
  expect(best.derived.gridY).toBe(3);
  expect(best.derived.floor[1]).toBeCloseTo(-125.5 / 2, 6);
  expect(best.derived.foot[1]).toBeCloseTo(-69, 6); // the lane is what stands on the shelf
  expect(best.footprint[0]).toBeCloseTo(138.5, 6);
  expect(best.cans).toBe(4);
  // the part: the lane's outline, feet on three cells, solid to the bed outside them
  const set = buildAll(geo, best.options, best.derived).gridDeck!;
  const m = geo.union([set.front!, set.rear!]);
  const box = m.boundingBox();
  expect(box.max[1] - box.min[1]).toBeCloseTo(138, 3);
  const skirtSlice = geo.isect(m, geo.box(20, 20, 0.01, 0, 66, -7 + 0.005)); // under the wall, 3 mm past the cells
  expect(skirtSlice.volume()).toBeGreaterThan(0);
  const flat = geo.isect(m, geo.box(42, 42, 0.01, 0, 0, -7 + 0.005)).boundingBox(); // the middle cell's foot
  expect(flat.max[1] - flat.min[1]).toBeCloseTo(35.6, 1);
  expect(laneNeeds(grid).w).toBe(168); // what the empty state would say when even one cell is too many
});

test("a lane longer than the cells its shelf has room for keeps its length on a shorter floor", () => {
  const layouts = fitSpace({ w: 200, d: 300, h: 254, front: 0 }, grid, { cascade: true });
  const long = layouts.find((l) => l.derived.L === 300)!; // the longest that fits: eight cells would be 335.5
  expect(long.options.floorCells).toEqual([7, 0]);
  expect(long.derived.floor[2] - long.derived.floor[0]).toBe(293.5);
  expect(long.footprint[1]).toBe(300);
  for (const l of layouts) expect(l.footprint[1]).toBeLessThanOrEqual(300);
});

test("a shelf too narrow for even the lane offers nothing", () => {
  expect(fitSpace({ w: 130, d: 460, h: 254, front: 0 }, grid, { cascade: true })).toEqual([]);
  expect(fitSpace({ w: 168, d: 460, h: 254, front: 0 }, grid, { cascade: true })[0].derived.gridY).toBe(4);
});
