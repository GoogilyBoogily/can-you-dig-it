import { test, expect } from "bun:test";
import { DEFAULTS, solve, buildCover } from "../src/geometry";
import { fitSpace } from "../src/solver";
import { roundTop } from "../src/features/pocket";
import { geo } from "./geo";

test("rounded thin panels remain connected at an inexact half-space boundary", () => geo.arena(() => {
  const outline = geo.rect(-287 / 2, -138 / 2, 287 / 2, 138 / 2);
  const panel = roundTop(geo, geo.prismZ(outline, 2.4), outline, 2.4, 1.2);
  expect(panel.decompose().length).toBe(1);
  expect(panel.boundingBox().min[2]).toBeCloseTo(0, 10);
  expect(panel.boundingBox().max[2]).toBeCloseTo(2.4, 10);
}));

test("rounded thin panel connectivity is invariant under translation in every axis", () => geo.arena(() => {
  for (const translation of [[0, 0, 0], [1000, -300, 13.7], [-400, 850, -23.4]]) {
    const [x, y, z] = translation;
    const outline = geo.rect(-287 / 2, -138 / 2, 287 / 2, 138 / 2).translate([x, y]);
    const body = geo.prismZ(outline, 2.4, z);
    const panel = roundTop(geo, body, outline, z + 2.4, 1.2);
    expect(panel.decompose().length).toBe(1);
    expect(panel.boundingBox().min[2]).toBeCloseTo(z, 10);
    expect(panel.boundingBox().max[2]).toBeCloseTo(z + 2.4, 10);
  }
}));

test("solver-selected covers retain a single connected part in both halves", () => {
  for (const space of [{ w: 160, d: 305, h: 254, front: 0 }, { w: 600, d: 400, h: 500, front: 0 }]) for (const solid of [false, true]) {
    const layout = fitSpace(space, { ...DEFAULTS, solid }, { cascade: true })[0]!;
    expect(layout).toBeDefined();
    geo.arena(() => {
      const covers = buildCover(geo, layout.options, layout.derived);
      expect(covers.length).toBe(2);
      for (const cover of covers) {
        expect(cover.status()).toBe("NoError");
        expect(cover.decompose().length).toBe(1);
      }
    });
  }
});
