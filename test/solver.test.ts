// A 12 in deep, 10 in tall shelf holds four cans a deck on two tiers. It used to hold
// three: 40 mm was kept for a hand whether the shelf had room to spare or not.
import { test, expect } from "bun:test";
import { DEFAULTS, laneLengthFor, solve } from "../src/geometry";
import { fitSpace, laneNeeds } from "../src/solver";

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

// laneNeeds writes the "Nothing fits" message and had no test at all. It called solve()
// with whatever shelfCells the caller carried - optionsFrom never sets one, so it was
// always the DEFAULTS guess - and then added the side gap that lanesAcross deliberately
// does not apply on a grid. It told a 160 mm shelf it needed 176.
test("laneNeeds is the shelf the solver actually accepts, on every base", () => {
  for (const base of ["flat", "feet", "gridfinity"] as const) for (const canL of [60, 122.5]) {
    const options = { ...DEFAULTS, base, canL };
    const space = { w: 900, d: 400, h: 600, front: 0 };
    const need = laneNeeds(options, space);
    const fits = (over: Partial<typeof space>) => fitSpace({ ...space, ...over }, options, { cascade: false }).length > 0;
    expect(fits({ w: need.w }), `${base} canL ${canL} at the stated width`).toBe(true);
    expect(fits({ w: need.w - 1 }), `${base} canL ${canL} a millimetre under it`).toBe(false);
  }
});

// The height was pinned to a 200 mm lane while H grows with the length the depth allows,
// so at slope 10 it was out by 10 mm in both directions: it turned away shelves that fit,
// and told a user a height was enough when the same message came back at it.
test("laneNeeds states the height the solver accepts, at every slope", () => {
  for (const base of ["flat", "gridfinity"] as const) for (const canD of [40, 66, 100]) for (const slope of [0, 3, 10]) {
    const options = { ...DEFAULTS, base, canD, slope };
    const space = { w: 900, d: 520, h: 600, front: 0 };
    const need = laneNeeds(options, space);
    const fits = (h: number) => fitSpace({ ...space, h }, options, { cascade: false }).length > 0;
    const at = `${base} canD ${canD} slope ${slope}`;
    expect(fits(need.h), `${at} at the stated height`).toBe(true);
    expect(fits(need.h - 1), `${at} a millimetre under it`).toBe(false);
  }
});

// A shelf with no whole cell across made floorCells[1] zero, so lanesAcross divided by it
// and returned NaN. `NaN < 1` is false, so the "not even one lane" guard let it through
// and the user was offered two layouts holding NaN cans.
test("a grid shelf narrower than one cell offers nothing, not NaN", () => {
  const options = { ...DEFAULTS, base: "gridfinity" as const };
  expect(fitSpace({ w: 40, d: 400, h: 600, front: 0 }, options, { cascade: false })).toEqual([]);
  for (const layout of fitSpace({ w: 200, d: 400, h: 600, front: 0 }, options, { cascade: false }))
    expect(Number.isFinite(layout.cans)).toBe(true);
});
