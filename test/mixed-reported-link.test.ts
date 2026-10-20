import { expect, test } from "bun:test";
import { DEFAULTS, type MixedBuildRequest } from "../src/model";
import { resolveMixedBuild } from "../src/solver";

const request: MixedBuildRequest = {
  shared: { ...DEFAULTS, base: "flat", cascade: true, cover: true, design: "minimal", hexR: 13, hexAuto: false },
  shareCompatibleWalls: true,
  stacks: [122.5, 122.5, 157].map(canHeight => ({ canDiameter: 66, canHeight, depth: 279.4, tiers: "auto",
    cascade: true, slope: 3, lipGap: 5, cover: true, rearLoad: false, stackable: false })),
};
const shelf = { w: 457.2, d: 279.4, h: 241, front: 0 };

test("the reported shelf explains retained walls even when no complete preview fits", () => {
  expect(() => resolveMixedBuild(shelf, request)).toThrow(/462.5 mm.*Wall sharing: Stacks 1 and 2 retain both walls:.*safe planned bearing/);
  expect(() => resolveMixedBuild(shelf, request)).toThrow(/Stacks 2 and 3 retain both walls:/);
});

test("an explicit single-tier auto-feed conflict names its cause rather than shelf height", () => {
  expect(() => resolveMixedBuild({ ...shelf, w: 500 }, { ...request,
    stacks: request.stacks.map(stack => ({ ...stack, tiers: 1 })),
  })).toThrow(/auto-feed between tiers requires at least two cascade tiers; choose separate tiers/);
  const layout = resolveMixedBuild({ ...shelf, w: 500 }, { ...request,
    stacks: request.stacks.map(stack => ({ ...stack, tiers: 1, cascade: false })),
  });
  expect(layout.stacks.map(stack => stack.options.tiers)).toEqual([1, 1, 1]);
  expect(layout.stacks.every(stack => !stack.options.cascade)).toBe(true);
});
