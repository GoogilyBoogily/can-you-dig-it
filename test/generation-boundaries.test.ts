import { test, expect } from "bun:test";
import { DEFAULTS, DESIGNS, PATTERNS, buildAll, partList, type Options } from "../src/geometry";
import { fitSpace } from "../src/solver";
import { meshDataOf, pack } from "../src/export";
import { geo } from "./geo";

test("accepted feature combinations produce connected valid parts that fit the shelf and bed", () => {
  const dimensions = [
    { canD: 20, canL: 40, slope: 0, fit: -0.2 },
    { canD: 66, canL: 122.5, slope: 3, fit: 0 },
    { canD: 200, canL: 400, slope: 10, fit: 0.3 },
  ];
  for (const design of DESIGNS) for (const [patternIndex, pattern] of PATTERNS.entries())
    for (const [radiusIndex, radius] of [null, 6, 20].entries())
      for (const [dimensionIndex, dimension] of dimensions.entries()) {
        const options: Options = {
          ...DEFAULTS, ...dimension, design, pattern, hexAuto: radius === null, hexR: radius ?? DEFAULTS.hexR,
          base: (["flat", "feet", "gridfinity"] as const)[dimensionIndex],
          magnets: dimensionIndex === 2,
          across: (["left", "centre", "right"] as const)[radiusIndex],
          along: (["front", "centre", "back"] as const)[patternIndex % 3],
          bed: [500, 500, 256],
        };
        // Keep jobs to a few tiers of one lane. The dimension endpoints and
        // feature combinations matter here, not thousands of repeated copies.
        const space = {
          w: dimension.canL + 70,
          d: [200, 400, 300][dimensionIndex],
          h: [150, 300, 500][dimensionIndex], front: 0,
        };
        const layouts = fitSpace(space, options, { cascade: dimensionIndex === 1 });
        const context = JSON.stringify({ design, pattern, radius, dimension });
        expect(layouts.length, context).toBeGreaterThan(0);
        const layout = layouts[0]!;
        for (const [axis, extent] of layout.footprint.entries())
          expect(extent, context).toBeLessThanOrEqual([space.w, space.d, space.h][axis]);
        const parts = geo.arena(() => partList(buildAll(geo, layout.options, layout.derived), layout.options).map((part) => {
          expect(part.mesh.status(), `${context} ${part.name}`).toBe("NoError");
          expect(part.mesh.decompose().length, `${context} ${part.name}`).toBe(1);
          expect(part.mesh.volume(), `${context} ${part.name}`).toBeGreaterThan(0);
          const mesh = meshDataOf(part.name, part.mesh.getMesh());
          expect(mesh.pos.every(Number.isFinite), `${context} ${part.name}`).toBe(true);
          return { mesh, qty: part.qty };
        }));
        const placed = pack(parts, options.bed, options.bedMargin);
        expect(placed.length, context).toBe(parts.reduce((sum, part) => sum + part.qty, 0));
        for (const part of placed) {
          expect(part.bbox[0], context).toBeGreaterThanOrEqual(options.bedMargin - 1e-4);
          expect(part.bbox[1], context).toBeGreaterThanOrEqual(options.bedMargin - 1e-4);
          expect(part.bbox[3], context).toBeLessThanOrEqual(options.bed[0] - options.bedMargin + 1e-4);
          expect(part.bbox[4], context).toBeLessThanOrEqual(options.bed[1] - options.bedMargin + 1e-4);
          expect(part.bbox[2], context).toBeCloseTo(0, 6);
          expect(part.bbox[5], context).toBeLessThanOrEqual(options.bed[2] - options.bedMargin);
        }
      }
}, 120_000);
