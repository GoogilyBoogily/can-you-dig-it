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

// Three tiers of three used to out-count two of four. They fitted only because a tier
// was sized from its high end: at 3° a short lane's front can could not get over the
// lip, and the tier that can let it out is 96 mm, three of which do not fit 254.
test("two tiers of four rank first: three short tiers cannot dispense", () => {
  const [best] = fitSpace(SHELF, DEFAULTS, { cascade: false });
  expect(best.options.tiers).toBe(2);
  expect(best.derived.n).toBe(4);
  expect(best.cans).toBe(8);
});

test("the front gap comes off the depth", () => {
  const layouts = fitSpace({ ...SHELF, front: 40 }, DEFAULTS, { cascade: false });
  expect(fourByTwo(layouts)).toBeUndefined();
  for (const layout of layouts) expect(layout.footprint[1]).toBeLessThanOrEqual(SHELF.d - 40);
});

test("a lower slope buys no tier: the lip sets the floor of a short lane's height", () => {
  const [best] = fitSpace(SHELF, { ...DEFAULTS, slope: 2 }, { cascade: false });
  expect(best.options.slope).toBe(2);
  expect(best.derived.H).toBe(96);
  expect(best.options.tiers).toBe(2);
  expect(best.cans).toBe(8);
});

test("laneLengthFor is the inverse of solve()'s deck count", () => {
  for (const cascade of [true, false]) for (const cans of [2, 3, 5]) {
    const o = { ...DEFAULTS, cascade, length: laneLengthFor({ ...DEFAULTS, cascade }, cans) };
    expect(solve(o).n).toBe(cans);
    expect(solve({ ...o, length: o.length - 1 }).n).toBe(cans - 1);
  }
});
