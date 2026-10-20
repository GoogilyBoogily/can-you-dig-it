import { expect, test } from "bun:test";
import { DEFAULTS, type MixedBuildRequest } from "../src/model";
import { resolveMixedBuild } from "../src/solver";

const asymmetricEnvelopeRequest: MixedBuildRequest = {
  shared: { ...DEFAULTS, base: "flat", cascade: false, slope: 0, fit: -0.1, bed: [256, 63.55, 256] },
  shareCompatibleWalls: true,
  stacks: [
    { canDiameter: 20, canHeight: 40.2, depth: 240, tiers: 1 },
    { canDiameter: 20, canHeight: 40.2, depth: 240, tiers: 1 },
  ],
};

test("shared planner retains walls when an asymmetric collar's serialized span exceeds the bed", () => {
  // Independent actual follower endpoints: the ordinary outer half-width is
  // 27.85 mm; the far-face collar adds 1.85 mm on its negative side only.
  const serializedWidth = Math.fround(27.85) - Math.fround(-29.7);
  expect(serializedWidth).toBeGreaterThan(63.55 - 6 + 0.000001);
  const layout = resolveMixedBuild({ w: 300, d: 240, h: 100, front: 0 }, asymmetricEnvelopeRequest);
  expect(layout.boundaries?.[0].kind).toBe("retained");
  expect(layout.footprint[0]).toBeCloseTo(114.4, 8);
});

test("a retained asymmetric shared envelope receives no speculative shelf-width saving", () => {
  expect(() => resolveMixedBuild({ w: 114, d: 240, h: 100, front: 0 }, asymmetricEnvelopeRequest))
    .toThrow("122.4 mm of shelf width");
});
