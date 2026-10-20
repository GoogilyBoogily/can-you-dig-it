import { expect, test } from "bun:test";
import type { Manifold } from "manifold-3d";
import { DEFAULTS, K, type MixedBuildRequest } from "../src/model";
import { resolveMixedBuild } from "../src/solver";
import { check, laneOf, solve } from "../src/geometry";
import { planSharedAssembly, planSharedWalls } from "../src/shared-walls";
import { mixedAssemblyCans, mixedAssemblyPlacements, mixedPartManifest } from "../src/assembly";
import { buildMixedGeometry } from "../src/mixed-geometry";
import { stand } from "../src/features/pose";
import { clearanceOf, seamKeyFrameHalfWidth } from "../src/features/joints";
import { sharedCoverFingerHalfWidth } from "../src/features/shared-wall";
import { meshDataOf, packPlan } from "../src/export";
import { geo, overhangArea } from "./geo";
import { resolveIndependentRows } from "../src/rows";

const shelf = { w: 457.2, d: 292.1, h: 241, front: 0 };
function requestFor(fit = 0): MixedBuildRequest {
  return { shared: { ...DEFAULTS, fit, base: "flat", design: "minimal", hexAuto: false, hexR: 13 },
    shareCompatibleWalls: true, stacks: [122.5, 122.5, 157].map(canHeight => ({
      canDiameter: 66, canHeight, depth: 292.1, tiers: 2, cascade: false,
      slope: 5, lipGap: 5, cover: true, rearLoad: false, stackable: false })) };
}
function overlap(first: Manifold, second: Manifold) {
  const firstBounds = first.boundingBox(), secondBounds = second.boundingBox();
  return [0, 1, 2].every(axis => Math.min(firstBounds.max[axis], secondBounds.max[axis])
    - Math.max(firstBounds.min[axis], secondBounds.min[axis]) > 1e-6) ? geo.isect(first, second).volume() : 0;
}

for (const fit of [-.2, 0, .3]) test(`reported two-tier design co-plans actual joints, cuts, cans and packing at fit ${fit}`, () => geo.arena(() => {
  const request = requestFor(fit), originalRequest = JSON.stringify(request);
  const layout = resolveMixedBuild(shelf, request);
  const original = resolveMixedBuild({ ...shelf, w: 600 }, { ...request, shareCompatibleWalls: false });
  expect(layout.boundaries?.map(boundary => boundary.kind)).toEqual(["shared", "shared"]);
  expect(layout.cans).toBe(24);
  expect(layout.footprint[0] + 8).toBeCloseTo(444.5, 8);
  expect(layout.footprint[1]).toBe(292.1);
  expect(layout.footprint[2]).toBeLessThanOrEqual(shelf.h);
  expect(layout.stacks.map(stack => stack.options)).toEqual(original.stacks.map(stack => stack.options));
  expect(layout.stacks.map(stack => stack.cans)).toEqual(original.stacks.map(stack => stack.cans));
  expect(JSON.stringify(request)).toBe(originalRequest);
  for (const stack of layout.stacks) {
    expect(check(stack.options, stack.derived).filter(message => message.startsWith("FAIL"))).toEqual([]);
    expect(stack.derived.seams).toEqual(layout.stacks[0].derived.seams);
    expect(laneOf(stack.options, stack.derived, "top").tabs).toEqual(laneOf(stack.options, original.stacks[stack.index].derived, "top").tabs);
  }
  for (const boundary of layout.boundaries ?? []) {
    if (boundary.kind !== "shared") throw new Error("Expected shared boundary");
    const stack = layout.stacks[boundary.firstStackIndex], clearance = clearanceOf(stack.options);
    const frame = seamKeyFrameHalfWidth(stack.options), seam = stack.derived.seams[0];
    for (const schedule of boundary.tiers) {
      const sites = [
        ...schedule.pinPositions.map(position => ({ position, half: sharedCoverFingerHalfWidth(stack.options) + clearance })),
        ...[...schedule.primaryEars, ...schedule.followerEars].map(position => ({ position, half: K.earW / 2 + clearance })),
      ];
      for (const site of sites) expect(Math.abs(site.position - seam)).toBeGreaterThanOrEqual(frame + site.half - 1e-8);
      for (let first = 0; first < sites.length; first++) for (let second = first + 1; second < sites.length; second++)
        expect(Math.abs(sites[first].position - sites[second].position)).toBeGreaterThanOrEqual(sites[first].half + sites[second].half + K.ligMin - 1e-8);
      for (const owned of [schedule.primaryEars, schedule.followerEars]) {
        expect(owned.some(position => position < seam)).toBe(true);
        expect(owned.some(position => position > seam)).toBe(true);
        expect(owned[0] + 292.1 / 2).toBeLessThanOrEqual(92 + 1e-8);
        expect(292.1 / 2 - owned.at(-1)!).toBeLessThanOrEqual(92 + 1e-8);
        for (let index = 1; index < owned.length; index++) expect(owned[index] - owned[index - 1]).toBeLessThanOrEqual(126 + 1e-8);
      }
    }
  }
  const manifest = mixedPartManifest(layout), printables = buildMixedGeometry(geo, layout);
  expect(printables.map(({ name, qty }) => ({ name, qty }))).toEqual(manifest.map(({ name, qty }) => ({ name, qty })));
  for (const part of printables) {
    expect(part.mesh.status(), part.name).toBe("NoError");
    expect(part.mesh.decompose().length, part.name).toBe(1);
    expect(overhangArea(part.mesh), part.name).toBeLessThan(1e-6);
    expect(part.mesh.boundingBox().min[2], part.name).toBeCloseTo(0, 6);
  }
  const catalogue = new Map(printables.map(part => [part.name, part.mesh]));
  const parts = [...mixedAssemblyPlacements(layout)].map(placement => ({ placement,
    source: manifest.find(part => part.name === placement.name)!.source,
    mesh: stand(catalogue.get(placement.name)!, placement.pose) }));
  for (let first = 0; first < parts.length; first++) for (let second = first + 1; second < parts.length; second++)
    expect(overlap(parts[first].mesh, parts[second].mesh), `${parts[first].placement.name}/${parts[second].placement.name}`).toBeLessThan(1e-5);
  // The actual hidden keys and divider catches must still obstruct withdrawal.
  for (const part of parts) {
    if (part.source.kind === "shared-divider") {
      const moved = part.mesh.translate([0, 0, .8]);
      expect(parts.some(other => other !== part && overlap(moved, other.mesh) > .01)).toBe(true);
    }
    if (part.source.kind === "stack" && part.source.source.kind === "cover") {
      const moved = part.mesh.translate([0, 0, .8]);
      expect(parts.some(other => other !== part && overlap(moved, other.mesh) > .01)).toBe(true);
    }
  }
  const cylinders = layout.stacks.map(stack => geo.cyl(stack.options.canD / 2, stack.options.canL,
    0, 0, -stack.options.canL / 2).rotate([90, 0, 0]));
  let cans = 0;
  for (const placement of mixedAssemblyCans(layout)) {
    cans++;
    const stack = layout.stacks[placement.stackIndex];
    for (const axial of [-stack.options.clearance / 2, 0, stack.options.clearance / 2]) {
      const can = stand(cylinders[placement.stackIndex], placement.pose).translate([0, axial, 0]);
      for (const part of parts) expect(overlap(can, part.mesh), `can/${part.placement.name}/${axial}`).toBeLessThan(1e-5);
    }
  }
  expect(cans).toBe(layout.cans);
  const packed = packPlan(printables.map(part => ({ mesh: meshDataOf(part.name, part.mesh.getMesh()), qty: part.qty })),
    request.shared.bed, request.shared.bedMargin, 6, request.shared.bedKeepOut);
  expect(packed.placements).toHaveLength(parts.length);
}));

test("separate compatible groups keep their independently planned joints and cuts", () => {
  const request = requestFor(.3);
  request.stacks = [292.1, 292.1, 279.4, 292.1, 292.1].map(depth => ({ ...request.stacks[0], depth }));
  const layout = resolveMixedBuild({ ...shelf, w: 1000 }, request);
  expect(layout.boundaries?.map(boundary => boundary.kind)).toEqual(["shared", "retained", "retained", "shared"]);
  expect(layout.stacks[2].derived).toEqual(solve(layout.stacks[2].options));
  for (const boundary of layout.boundaries ?? []) if (boundary.kind === "shared")
    expect(boundary.tiers.every(schedule => schedule.primaryEars.length >= 2 && schedule.followerEars.length >= 2)).toBe(true);
});

test("working centred and multi-section plans stay byte-identical", () => {
  for (const depth of [240, 279.4, 640]) {
    const request = requestFor();
    request.stacks = request.stacks.map(stack => ({ ...stack, depth, tiers: depth === 640 ? 6 : 2, cascade: depth === 640, slope: 3 }));
    const unshared = resolveMixedBuild({ w: 1000, d: 1000, h: 1000, front: 0 }, { ...request, shareCompatibleWalls: false });
    const before = JSON.stringify(unshared.stacks);
    const lanes = unshared.stacks.map(stack => Array.from({ length: stack.options.tiers }, (_, tier) => laneOf(stack.options, stack.derived,
      !stack.options.cascade ? "top" : tier === 0 ? "bottom" : tier === stack.options.tiers - 1 ? "top" : "mid")));
    const existing = planSharedWalls(unshared.stacks, lanes, 1000);
    expect(existing.every(boundary => boundary.kind === "shared")).toBe(true);
    const planned = planSharedAssembly(unshared.stacks, 1000);
    expect(JSON.stringify(planned.boundaries)).toBe(JSON.stringify(existing));
    expect(JSON.stringify(planned.stacks)).toBe(before);
    expect(JSON.stringify(unshared.stacks)).toBe(before);
  }
});

test("unresolved manufacturing explains sharing before reporting fallback width", () => {
  const request = requestFor();
  request.stacks = request.stacks.map(stack => ({ ...stack, depth: 279.4, cascade: true, slope: 3 }));
  expect(() => resolveMixedBuild(shelf, request)).toThrow(/fit your shelf with shared walls.*planner could not find.*supports, cover clips and part splits.*462.5 mm/);
  expect(() => resolveMixedBuild(shelf, { ...request, shareCompatibleWalls: false })).toThrow("All 3 stacks need 462.5");
});

test("explicit section plans reject malformed, reversed and unprintable cuts", () => {
  expect(() => solve(DEFAULTS, 0, [NaN])).toThrow("finite, ordered");
  expect(() => solve(DEFAULTS, 0, [1, 0])).toThrow("finite, ordered");
  expect(() => solve({ ...DEFAULTS, cascade: true }, 0, [1])).toThrow("symmetric");
  const options = { ...DEFAULTS, cascade: false, length: 292.1 };
  expect(check(options, solve(options, 0, [130])).some(message => message.includes("do not fit"))).toBe(true);
});

test("a single Custom row uses the same joint planner without losing height padding", () => {
  const mixed = requestFor(.3);
  const layout = resolveIndependentRows(shelf, { shared: mixed.shared, shareCompatibleWalls: true, topCover: true,
    rows: [{ lanes: mixed.stacks.map(stack => ({ canDiameter: stack.canDiameter, canHeight: stack.canHeight,
      depth: stack.depth, slope: 5, lipGap: 5 })), repeat: 1, rowHeight: 110, rowSpan: "auto", alignment: "centre", rearLoad: false }] });
  const row = layout.rows[0];
  expect(row.layout.boundaries?.map(boundary => boundary.kind)).toEqual(["shared", "shared"]);
  expect(row.lanes.every(lane => lane.derived.H === 110 && lane.heightPadding === 110 - solve(lane.options).H)).toBe(true);
  expect(row.lanes === row.layout.stacks).toBe(true);
  expect(layout.cans).toBe(12);
  expect(layout.transitions).toEqual([]);
});
