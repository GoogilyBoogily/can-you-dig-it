// The Gridfinity base: the bottom deck on a 7 mm unit of whole 42 mm cells with a foot
// under each. Spec in docs/superpowers/specs/2026-09-19-gridfinity-base-design.md.
import { test, expect } from "bun:test";
import Module from "manifold-3d";
import { Geo, DEFAULTS, solve, buildAll, buildLanePlates, baseHeight, type Options } from "../src/geometry";
import { fitSpace } from "../src/solver";

const wasm = await Module(); wasm.setup();
const geo = new Geo(wasm);

const grid: Options = { ...DEFAULTS, base: "gridfinity" };
const d = solve(grid);
const deck = buildAll(geo, grid, d).gridDeck!;
const whole = geo.union([deck.front!, deck.rear!]);

test("the lane snaps to whole cells: a 480 lane is 10 × 4 at 419.5 × 167.5, a cell apart", () => {
  expect(d.L).toBe(419.5);
  expect([d.gridX, d.gridY]).toEqual([10, 4]);
  expect(d.gangPitch).toBe(168);
  expect(d.plateY).toBe(167.5);
  expect(solve(DEFAULTS).L).toBe(480); // nothing moves on the other bases
});

test("a split lane keeps an even cell count so the seam is a cell line", () => {
  // 11 cells (461.5) fit two halves but would put a foot on the seam
  expect(solve({ ...grid, length: 461 }).gridX).toBe(10);
  expect(solve({ ...grid, length: 200, bed: [500, 500, 256] }).gridX).toBe(5); // one plate: odd is fine
});

test("the unit hangs 7 mm below the deck, the bin's edge wide, and the solver charges it", () => {
  const box = whole.boundingBox();
  expect(box.min[2]).toBeCloseTo(-7, 3);
  expect(box.max[1] - box.min[1]).toBeCloseTo(167.5, 3);
  expect(box.max[0] - box.min[0]).toBeCloseTo(419.5, 3);
  expect(baseHeight("gridfinity")).toBe(7);
  expect(baseHeight("feet")).toBe(24);
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

test("magnet pockets take four 6.5 × 2.4 cylinders a cell and nothing else", () => {
  const withMagnets = buildAll(geo, { ...grid, magnets: true }, d).gridDeck!;
  const pockets = whole.volume() - geo.union([withMagnets.front!, withMagnets.rear!]).volume();
  const cylinder = Math.PI * 3.25 ** 2 * 2.4 * (48 / (2 * Math.PI)) * Math.sin(2 * Math.PI / 48); // 48-gon
  expect(pockets).toBeCloseTo(40 * 4 * cylinder, -2);
});

test("the solver offers only whole-cell lanes and charges the unit's height", () => {
  const shelf = { w: 200, d: 460, h: 254, front: 0 };
  const layouts = fitSpace(shelf, grid, { cascade: true });
  expect(layouts.length).toBeGreaterThan(0);
  for (const l of layouts) {
    expect((l.derived.L + 0.5) % 42).toBeCloseTo(0, 6);
    expect(l.footprint[0]).toBe(168 * l.options.lanesWide);
    const stack = l.style === "cascade" ? l.derived.Hb + (l.options.tiers - 1) * l.derived.H : l.options.tiers * l.derived.H;
    expect(l.footprint[2]).toBe(7 + stack);
  }
});
