import { expect, test } from "bun:test";
import { DEFAULTS, K, solve, check, buildAll, partList, type Options } from "../src/geometry";
import { assemblyPlacements } from "../src/assembly";
import { stand } from "../src/features/pose";
import { meshDataOf, packPlan, threeMf, type PackedPlan } from "../src/export";
import { resolveMixedBuild } from "../src/solver";
import { buildMixedGeometry } from "../src/mixed-geometry";
import { geo, overhangArea } from "./geo";

const options: Options = { ...DEFAULTS, length: 710, canL: 230, cascade: false, slope: 0,
  tiers: 1, lanesWide: 1, left: "none", right: "none", bedKeepOut: [[0, 0, 18, 28]] };

function verifyPackedCoordinates(plan: PackedPlan, settings: Options) {
  for (const placement of plan.placements) {
    const mesh = plan.geometries[placement.geometry];
    const minimum = [Infinity, Infinity, Infinity], maximum = [-Infinity, -Infinity, -Infinity];
    for (let index = 0; index < mesh.pos.length; index += 3) {
      const point = [placement.rotation90 ? -mesh.pos[index + 1] : mesh.pos[index],
        placement.rotation90 ? mesh.pos[index] : mesh.pos[index + 1], mesh.pos[index + 2]];
      for (let axis = 0; axis < 3; axis++) {
        const value = point[axis] + placement.translation[axis];
        minimum[axis] = Math.min(minimum[axis], value); maximum[axis] = Math.max(maximum[axis], value);
      }
    }
    for (const axis of [0, 1]) {
      expect(minimum[axis]).toBeGreaterThanOrEqual(settings.bedMargin - 1e-6);
      expect(maximum[axis]).toBeLessThanOrEqual(settings.bed[axis] - settings.bedMargin + 1e-6);
    }
    for (const [left, bottom, right, top] of settings.bedKeepOut ?? []) {
      expect(maximum[0] <= left - settings.bedMargin + 1e-6
        || minimum[0] >= right + settings.bedMargin - 1e-6
        || maximum[1] <= bottom - settings.bedMargin + 1e-6
        || minimum[1] >= top + settings.bedMargin - 1e-6).toBe(true);
    }
  }
}

for (const bedKeepOut of [[[0, 0, 18, 28]], [[238, 0, 256, 28]], [[0, 228, 18, 256]], [[238, 228, 256, 256]]] as NonNullable<Options["bedKeepOut"]>[]) {
  test(`profile exclusion ${JSON.stringify(bedKeepOut)} adds a section and every emitted copy fits`, () => geo.arena(() => {
    const settings = { ...options, bedKeepOut };
    const derived = solve(settings);
    expect(derived.L).toBe(710);
    expect(derived.seams).toHaveLength(3);
    expect(check(settings, derived).filter(message => message.startsWith("FAIL"))).toEqual([]);
    const parts = partList(buildAll(geo, settings, derived), settings);
    const plan = packPlan(parts.map(part => ({ mesh: meshDataOf(part.name, part.mesh.getMesh()), qty: part.qty })),
      settings.bed, settings.bedMargin, 6, bedKeepOut);
    expect(plan.placements).toHaveLength(36);
    verifyPackedCoordinates(plan, settings);
    expect(threeMf(plan, settings.bed).length).toBeGreaterThan(1000);
  }));
}

test("exclusion-driven sections preserve connected material, support faces and assembly clearance", () => geo.arena(() => {
  const derived = solve(options);
  const parts = partList(buildAll(geo, options, derived), options);
  const catalogue = new Map(parts.map(part => [part.name, part.mesh]));
  for (const part of parts) {
    expect(part.mesh.status()).toBe("NoError");
    expect(part.mesh.decompose()).toHaveLength(1);
    expect(overhangArea(part.mesh)).toBeLessThan(1e-6);
  }
  const placed = [...assemblyPlacements(options, derived)].map(placement => stand(catalogue.get(placement.name)!, placement.pose));
  for (let first = 0; first < placed.length; first++) for (let second = first + 1; second < placed.length; second++) {
    const left = placed[first].boundingBox(), right = placed[second].boundingBox();
    if ([0, 1, 2].every(axis => Math.min(left.max[axis], right.max[axis]) - Math.max(left.min[axis], right.min[axis]) > 1e-6))
      expect(geo.isect(placed[first], placed[second]).volume()).toBeLessThan(1e-5);
  }
  expect(derived.pinPositions).toHaveLength(4);
}));

for (const length of [378.3, 630.5, 756.6, 882.7, 1008.8]) {
  test(`decimal capacity ${length} mm survives validation and actual Float32 export`, () => geo.arena(() => {
    const settings: Options = { ...options, length, canL: 80, bed: [140.1, 140.1, 256], bedKeepOut: [] };
    const derived = solve(settings);
    expect(derived.L).toBe(length);
    expect(check(settings, derived).filter(message => message.startsWith("FAIL"))).toEqual([]);
    const edges = [-length / 2, ...derived.seams, length / 2];
    for (let index = 1; index < edges.length; index++) {
      const width = Math.fround(edges[index]) - Math.fround(edges[index - 1] - (index > 1 ? K.spliceDepth : 0));
      expect(width).toBeLessThanOrEqual(134.1);
    }
    const parts = partList(buildAll(geo, settings, derived), settings);
    const plan = packPlan(parts.map(part => ({ mesh: meshDataOf(part.name, part.mesh.getMesh()), qty: part.qty })), settings.bed, settings.bedMargin);
    verifyPackedCoordinates(plan, settings);
    expect(threeMf(plan, settings.bed).length).toBeGreaterThan(1000);
  }));
}

test("mixed exact depths carry the same profile constraints into each stack's geometry", () => geo.arena(() => {
  const layout = resolveMixedBuild({ w: 500, d: 710, h: 300, front: 0 }, { shared: { ...options, base: "flat" }, stacks: [
    { canDiameter: 66, canHeight: 230, depth: 710, tiers: 1 },
    { canDiameter: 53, canHeight: 134, depth: 520, tiers: 1 },
  ] });
  expect(layout.stacks.map(stack => stack.derived.L)).toEqual([710, 520]);
  expect(layout.stacks[0].derived.seams).toHaveLength(3);
  const parts = buildMixedGeometry(geo, layout);
  const plan = packPlan(parts.map(part => ({ mesh: meshDataOf(part.name, part.mesh.getMesh()), qty: part.qty })), options.bed, options.bedMargin, 6, options.bedKeepOut);
  expect(plan.placements.length).toBe(parts.reduce((total, part) => total + part.qty, 0));
  verifyPackedCoordinates(plan, options);
}));

test("valid existing whole and center-split identities retain exactly representable bed boundaries", () => {
  expect(solve({ ...DEFAULTS, length: 250, cascade: false, slope: 0 }).seams).toEqual([]);
  expect(solve({ ...DEFAULTS, length: 484, cascade: false, slope: 0 }).seams).toEqual([0]);
});

test("invalid exclusion coordinates fail explicitly rather than being ignored", () => {
  expect(() => solve({ ...options, bedKeepOut: [[0, 0, NaN, 28]] })).toThrow("invalid bed keep-out rectangle");
  expect(() => solve({ ...options, bedKeepOut: [[18, 0, 0, 28]] })).toThrow("invalid bed keep-out rectangle");
});
