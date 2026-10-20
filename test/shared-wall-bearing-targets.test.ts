import { expect, test } from "bun:test";
import type { Manifold } from "manifold-3d";
import { DEFAULTS, K, type MixedBuildRequest } from "../src/model";
import { resolveMixedBuild } from "../src/solver";
import { mixedAssemblyCans, mixedAssemblyPlacements, mixedPartManifest } from "../src/assembly";
import { buildMixedGeometry } from "../src/mixed-geometry";
import { clearanceOf, seamKeyFrameHalfWidth } from "../src/features/joints";
import { sharedCoverFingerHalfWidth } from "../src/features/shared-wall";
import { stand } from "../src/features/pose";
import { meshDataOf, packPlan } from "../src/export";
import { geo, overhangArea } from "./geo";

const shelf = { w: 457.2, d: 457.2, h: 300, front: 0 };
function requestFor(depth: number, cascade = false): MixedBuildRequest {
  return { shared: { ...DEFAULTS, base: "flat", design: "minimal", hexAuto: false, hexR: 13, cascade },
    shareCompatibleWalls: true,
    stacks: [122.5, 122.5, 157].map(canHeight => ({ canDiameter: 66, canHeight, depth, tiers: cascade ? 2 : 1 })) };
}

function overlap(first: Manifold, second: Manifold): number {
  const firstBounds = first.boundingBox(), secondBounds = second.boundingBox();
  if (![0, 1, 2].every(axis => Math.min(firstBounds.max[axis], secondBounds.max[axis])
    - Math.max(firstBounds.min[axis], secondBounds.min[axis]) > 1e-6)) return 0;
  return geo.isect(first, second).volume();
}

for (const depth of [279.3, 279.4, 279.5, 280]) test(`qualified bearing targets preserve actual shared solids, cans and packing at depth ${depth}`, () => geo.arena(() => {
  const request = requestFor(depth), layout = resolveMixedBuild(shelf, request);
  expect(layout.boundaries?.map(boundary => boundary.kind)).toEqual(["shared", "shared"]);
  expect(layout.footprint[0]).toBeCloseTo(436.5, 8);
  expect(layout.footprint[0] + 8).toBeCloseTo(444.5, 8);
  expect(layout.stacks.map(stack => stack.options.canL)).toEqual([122.5, 122.5, 157]);
  expect(layout.stacks.every(stack => stack.options.tiers === 1 && !stack.options.cascade)).toBe(true);
  expect(() => resolveMixedBuild(shelf, { ...request, shareCompatibleWalls: false })).toThrow("462.5 mm of shelf width");
  for (const boundary of layout.boundaries ?? []) {
    if (boundary.kind !== "shared") throw new Error("Expected a planned shared boundary");
    const stack = layout.stacks[boundary.firstStackIndex], options = stack.options, clearance = clearanceOf(options);
    const earHalf = K.earW / 2 + clearance, pinHalf = sharedCoverFingerHalfWidth(options) + clearance;
    const frame = seamKeyFrameHalfWidth(options), schedule = boundary.tiers[0];
    const pins = schedule.pinPositions.map(position => ({ position, half: pinHalf }));
    const ears = [...schedule.primaryEars, ...schedule.followerEars].map(position => ({ position, half: earHalf }));
    const sites = [...pins, ...ears];
    for (let first = 0; first < sites.length; first++) for (let second = first + 1; second < sites.length; second++)
      expect(Math.abs(sites[first].position - sites[second].position)).toBeGreaterThanOrEqual(sites[first].half + sites[second].half + K.ligMin - 1e-8);
    for (const owned of [schedule.primaryEars, schedule.followerEars]) {
      expect(owned).toHaveLength(2);
      expect(owned[0] + depth / 2).toBeLessThanOrEqual(92 + 1e-8);
      expect(depth / 2 - owned[1]).toBeLessThanOrEqual(92 + 1e-8);
      expect(owned[1] - owned[0]).toBeLessThanOrEqual(126 + 1e-8);
      expect(owned[0]).toBeLessThan(-frame - earHalf + 1e-8);
      expect(owned[1]).toBeGreaterThan(frame + earHalf - 1e-8);
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
  const parts = [...mixedAssemblyPlacements(layout)].map(placement => ({ name: placement.name,
    mesh: stand(catalogue.get(placement.name)!, placement.pose) }));
  for (let first = 0; first < parts.length; first++) for (let second = first + 1; second < parts.length; second++)
    expect(overlap(parts[first].mesh, parts[second].mesh), `${parts[first].name}/${parts[second].name}`).toBeLessThan(1e-5);
  const minimum = Math.min(...parts.map(part => part.mesh.boundingBox().min[1]));
  const maximum = Math.max(...parts.map(part => part.mesh.boundingBox().max[1]));
  expect(maximum - minimum).toBeCloseTo(layout.footprint[0], 6);
  const cylinders = layout.stacks.map(stack => geo.cyl(stack.options.canD / 2, stack.options.canL,
    0, 0, -stack.options.canL / 2).rotate([90, 0, 0]));
  let cans = 0;
  for (const placement of mixedAssemblyCans(layout)) {
    cans++;
    const stack = layout.stacks[placement.stackIndex];
    for (const axial of [-stack.options.clearance / 2, 0, stack.options.clearance / 2]) {
      const can = stand(cylinders[placement.stackIndex], placement.pose).translate([0, axial, 0]);
      for (const part of parts) expect(overlap(can, part.mesh), `can/${part.name}/${axial}`).toBeLessThan(1e-5);
    }
  }
  expect(cans).toBe(layout.cans);
  const packed = packPlan(printables.map(part => ({ mesh: meshDataOf(part.name, part.mesh.getMesh()), qty: part.qty })),
    request.shared.bed, request.shared.bedMargin);
  expect(packed.placements).toHaveLength(parts.length);
}));

test("the reversed two-tier cascade retains both walls when common pins cannot support every printable section", () => {
  const request = requestFor(279.4, true);
  const layout = resolveMixedBuild({ ...shelf, w: 500 }, request);
  expect(layout.boundaries?.map(boundary => boundary.kind)).toEqual(["retained", "retained"]);
  for (const boundary of layout.boundaries ?? []) {
    if (boundary.kind !== "retained") throw new Error("Expected the incompatible common-role schedule to retain its walls");
    expect(boundary.reason).toContain("No safe planned bearing and cover-catch schedule");
  }
  expect(layout.stacks.every(stack => stack.options.tiers === 2 && stack.options.cascade)).toBe(true);
  expect(() => resolveMixedBuild(shelf, request)).toThrow("462.5 mm of shelf width");
});
