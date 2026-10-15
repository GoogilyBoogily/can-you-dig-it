import { expect, test } from "bun:test";
import { baseHeight, buildCover, check, DEFAULTS, K, laneXe, PATTERNS, solve, type Options } from "../src/geometry";
import { clearanceOf, coverThicknessOf, pinJoint, placeSide, snapTop } from "../src/features/joints";
import { meshDataOf, pack } from "../src/export";
import { fitSpace, laneNeeds } from "../src/solver";
import { geo, overhangArea } from "./geo";

for (const fit of [-0.2, -0.1, 0, 0.1, 0.2, 0.3]) {
  test(`blind cover sockets clear and retain actual pins at fit ${fit}`, () => geo.arena(() => {
    const options = { ...DEFAULTS, length: 240, fit, solid: true, cascade: false };
    const derived = solve(options);
    const [cover] = buildCover(geo, options, derived);
    const joint = pinJoint(geo, { wall: options.wall, clearance: clearanceOf(options) });
    for (const along of [-1, 1]) for (const side of [-1, 1]) {
      const pin = placeSide(joint.pin, side, along * derived.px, side * derived.py, 0);
      expect(geo.isect(cover, pin).volume()).toBeCloseTo(0, 6);
      for (const lift of [0.02, 0.05]) {
        expect(geo.isect(cover.translate([0, 0, lift]), pin).volume(), `fit ${fit}, lift ${lift}`).toBeGreaterThan(0);
      }
      // A full layer of material above each socket conceals the pin from outside.
      const skin = geo.box(1, 1, 0.6, along * derived.px, side * (derived.IW / 2 + K.tabT / 2), coverThicknessOf(options) - 0.3);
      expect(geo.isect(cover, skin).volume()).toBeCloseTo(skin.volume(), 6);
    }
    expect(cover.boundingBox().max[2]).toBeCloseTo(coverThicknessOf(options), 6);
    expect(cover.boundingBox().max[2]).toBeGreaterThan(snapTop(options));
    expect(overhangArea(cover)).toBe(0);
    expect(cover.decompose()).toHaveLength(1);
  }));
}

test("patterned and split covers keep support-free concealed sockets and the loading opening", () => geo.arena(() => {
  for (const pattern of PATTERNS) for (const design of ["standard", "minimal"] as const) for (const length of [240, 480]) {
    const options: Options = { ...DEFAULTS, pattern, design, length, fit: 0.3 };
    const derived = solve(options), covers = buildCover(geo, options, derived);
    const can = geo.cyl(options.canD / 2, options.canL, 0, 0, -options.canL / 2)
      .rotate([90, 0, 0]).translate([laneXe(options, derived) - (options.canD + 8) / 2, 0, coverThicknessOf(options) / 2]);
    for (const cover of covers) {
      expect(overhangArea(cover), `${design} ${pattern} ${length}`).toBe(0);
      expect(cover.decompose(), `${design} ${pattern} ${length}`).toHaveLength(1);
      expect(geo.isect(cover, can).volume()).toBeCloseTo(0, 6);
    }
  }
}));

test("the shelf solver budgets the built cover rather than only the hidden pins", () => {
  for (const fit of [-0.2, 0, 0.3]) for (const base of ["flat", "feet", "gridfinity"] as const) {
    const options = { ...DEFAULTS, fit, base };
    const space = { w: 300, d: 520, h: 240, front: 0 };
    for (const layout of fitSpace(space, options, { cascade: true })) {
      const tierHeight = layout.options.cascade
        ? layout.derived.Hb + (layout.options.tiers - 1) * layout.derived.H
        : layout.options.tiers * layout.derived.H;
      const coverTop = geo.arena(() => Math.max(...buildCover(geo, layout.options, layout.derived).map((cover) => cover.boundingBox().max[2])));
      expect(layout.footprint[2]).toBeCloseTo(baseHeight(layout.options) + tierHeight + coverTop, 6);
      expect(layout.footprint[2]).toBeLessThanOrEqual(space.h + 1e-6);
    }
    const minimum = laneNeeds(options, space);
    expect(fitSpace({ ...space, h: minimum.h }, options, { cascade: false }).length).toBeGreaterThan(0);
    expect(fitSpace({ ...space, h: minimum.h - 0.01 }, options, { cascade: false })).toHaveLength(0);
  }
});

test("uncovered shelf height includes pins only when future expansion is selected", () => {
  for (const stackable of [false, true]) {
    const options = { ...DEFAULTS, cover: false, stackable };
    const space = { w: 300, d: 520, h: 240, front: 0 };
    const layouts = fitSpace(space, options, { cascade: false });
    expect(layouts.length).toBeGreaterThan(0);
    for (const layout of layouts) {
      const expected = layout.options.tiers * layout.derived.H + (stackable ? snapTop(options) : 0);
      expect(layout.footprint[2]).toBeCloseTo(expected, 6);
    }
  }
});

test("packing uses the finished cover height", () => geo.arena(() => {
  const options = { ...DEFAULTS, length: 240, fit: 0.3 };
  const [cover] = buildCover(geo, options, solve(options));
  const mesh = meshDataOf("concealed-cover", cover.getMesh());
  const [placement] = pack([{ mesh, qty: 1 }], [256, 256, 20], 3);
  expect(placement.bbox[5]).toBeCloseTo(coverThicknessOf(options), 5);
  expect(() => pack([{ mesh, qty: 1 }], [256, 256, coverThicknessOf(options) - 0.01], 3)).toThrow(/height/);
}));

test("a short lane for the smallest can budgets its cover on a small printer", () => geo.arena(() => {
  const options: Options = {
    ...DEFAULTS, canD: 20, canL: 40, length: 120, cascade: false, slope: 0, fit: 0.3,
    bed: [100, 100, 50],
  };
  const derived = solve(options);
  expect(check(options, derived).filter((message) => message.startsWith("FAIL"))).toHaveLength(0);
  expect(derived.plateZ).toBeCloseTo(coverThicknessOf(options), 6);
  const covers = buildCover(geo, options, derived);
  for (const cover of covers) {
    expect(cover.decompose()).toHaveLength(1);
    expect(overhangArea(cover)).toBe(0);
  }
  const parts = covers.map((cover, index) => ({ mesh: meshDataOf(`small-cover-${index}`, cover.getMesh()), qty: 1 }));
  expect(pack(parts, options.bed, options.bedMargin)).toHaveLength(covers.length);
}));
