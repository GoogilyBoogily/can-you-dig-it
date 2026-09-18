// A 12 in deep, 10 in tall shelf holds four cans a deck on two tiers. It used to hold
// three: 40 mm was kept for a hand whether the shelf had room to spare or not.
import { test, expect } from "bun:test";
import { DEFAULTS, laneLengthFor, solve } from "../src/geometry";
import { fitSpace } from "../src/solver";

const SHELF = { w: 160, d: 305, h: 254, front: 0 };

const fourByTwo = (layouts: ReturnType<typeof fitSpace>) => layouts.find((l) => l.derived.n === 4 && l.options.tiers === 2);

test("a 12 x 10 in shelf offers four cans a deck on two flat tiers", () => {
  const layout = fourByTwo(fitSpace(SHELF, DEFAULTS, { cascade: false }))!;
  expect(layout).toBeDefined();
  expect(layout.options.lanesWide).toBe(1);
  expect(layout.cans).toBe(8);
});

test("the lane is the shortest that holds its cans, not the longest that fits", () => {
  const layout = fourByTwo(fitSpace(SHELF, DEFAULTS, { cascade: false }))!;
  expect(layout.derived.L).toBe(laneLengthFor({ ...DEFAULTS, cascade: false }, 4));
  expect(layout.derived.L).toBe(278);
});

test("three short tiers of three out-count two of four, and rank first", () => {
  const [best] = fitSpace(SHELF, DEFAULTS, { cascade: false });
  expect(best.options.tiers).toBe(3);
  expect(best.derived.n).toBe(3);
  expect(best.cans).toBe(9);
});

test("the front gap comes off the depth", () => {
  const layouts = fitSpace({ ...SHELF, front: 40 }, DEFAULTS, { cascade: false });
  expect(fourByTwo(layouts)).toBeUndefined();
  for (const layout of layouts) expect(layout.footprint[1]).toBeLessThanOrEqual(SHELF.d - 40);
});

test("a lower slope stacks a third tier", () => {
  const [best] = fitSpace(SHELF, { ...DEFAULTS, slope: 2 }, { cascade: false });
  expect(best.options.slope).toBe(2);
  expect(best.options.tiers).toBe(3);
  expect(best.cans).toBe(12);
});

test("laneLengthFor is the inverse of solve()'s deck count", () => {
  for (const cascade of [true, false]) for (const cans of [2, 3, 5]) {
    const o = { ...DEFAULTS, cascade, length: laneLengthFor({ ...DEFAULTS, cascade }, cans) };
    expect(solve(o).n).toBe(cans);
    expect(solve({ ...o, length: o.length - 1 }).n).toBe(cans - 1);
  }
});
