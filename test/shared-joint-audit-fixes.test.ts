import { expect, test } from "bun:test";
import type { Manifold } from "manifold-3d";
import { DEFAULTS, type MixedBuildRequest } from "../src/model";
import { resolveMixedBuild, type MixedLayout } from "../src/solver";
import { resolveIndependentRows } from "../src/rows";
import { check, laneOf, solve } from "../src/geometry";
import { mixedAssemblyCans, mixedAssemblyPlacements, mixedPartManifest } from "../src/assembly";
import { buildMixedGeometry } from "../src/mixed-geometry";
import { clearanceOf } from "../src/features/joints";
import { stand } from "../src/features/pose";
import { meshDataOf, packPlan } from "../src/export";
import { geo, overhangArea } from "./geo";

function requestFor(canHeights = [122.5, 122.5, 157], depth = 292.1): MixedBuildRequest {
  return { shared: { ...DEFAULTS, base: "flat", design: "minimal", hexAuto: false, hexR: 13 },
    shareCompatibleWalls: true, stacks: canHeights.map(canHeight => ({ canDiameter: 66, canHeight,
      depth, tiers: 2, cascade: false, slope: 5, lipGap: 5, cover: true, rearLoad: false, stackable: false })) };
}
function overlap(first: Manifold, second: Manifold): number {
  const firstBounds = first.boundingBox(), secondBounds = second.boundingBox();
  return [0, 1, 2].every(axis => Math.min(firstBounds.max[axis], secondBounds.max[axis])
    - Math.max(firstBounds.min[axis], secondBounds.min[axis]) > 1e-6) ? geo.isect(first, second).volume() : 0;
}
function actualParts(layout: MixedLayout) {
  const printables = buildMixedGeometry(geo, layout), manifest = mixedPartManifest(layout);
  const catalogue = new Map(printables.map(part => [part.name, part.mesh]));
  const assembled = [...mixedAssemblyPlacements(layout)].map(placement => ({ ...placement,
    source: manifest.find(part => part.name === placement.name)!.source,
    mesh: stand(catalogue.get(placement.name)!, placement.pose) }));
  return { printables, assembled };
}
function verifyManufacturing(layout: MixedLayout, expectedCopies: number) {
  const { printables, assembled } = actualParts(layout);
  for (const part of printables) {
    expect(part.mesh.status(), part.name).toBe("NoError");
    expect(part.mesh.decompose().length, part.name).toBe(1);
    expect(overhangArea(part.mesh), part.name).toBeLessThan(1e-6);
    expect(part.mesh.boundingBox().min[2], part.name).toBeCloseTo(0, 6);
  }
  for (let first = 0; first < assembled.length; first++) for (let second = first + 1; second < assembled.length; second++)
    expect(overlap(assembled[first].mesh, assembled[second].mesh), `${assembled[first].name}/${assembled[second].name}`).toBeLessThan(1e-5);
  for (const placement of mixedAssemblyCans(layout)) {
    const options = layout.stacks[placement.stackIndex].options;
    const cylinder = geo.cyl(options.canD / 2, options.canL, 0, 0, -options.canL / 2).rotate([90, 0, 0]);
    for (const axial of [-options.clearance / 2, 0, options.clearance / 2]) {
      const can = stand(cylinder, placement.pose).translate([0, axial, 0]);
      for (const part of assembled) expect(overlap(can, part.mesh), `can/${part.name}/${axial}`).toBeLessThan(1e-5);
    }
  }
  const options = layout.request.shared;
  const packed = packPlan(printables.map(part => ({ mesh: meshDataOf(part.name, part.mesh.getMesh()), qty: part.qty })),
    options.bed, options.bedMargin, 6, options.bedKeepOut);
  expect(packed.placements).toHaveLength(expectedCopies);
  expect(assembled).toHaveLength(expectedCopies);
}

test("a tight third printer envelope preserves the valid first shared pair and real retained spline", () => geo.arena(() => {
  const request = requestFor([122.5, 122.5, 180], 300);
  request.shared = { ...DEFAULTS, base: "flat", cascade: false, slope: 5, fit: .3, bed: [164, 256, 256] };
  const layout = resolveMixedBuild({ w: 480, d: 300, h: 241, front: 0 }, request);
  const pair = resolveMixedBuild({ w: 480, d: 300, h: 241, front: 0 }, { ...request, stacks: request.stacks.slice(0, 2) });
  expect(layout.boundaries?.map(boundary => boundary.kind)).toEqual(["shared", "retained"]);
  expect(layout.stacks.slice(0, 2).map(stack => stack.derived)).toEqual(pair.stacks.map(stack => stack.derived));
  expect(layout.stacks[2].derived).toEqual(solve(layout.stacks[2].options));
  expect(layout.footprint[0] + 8).toBeCloseTo(476.5, 8);
  expect(layout.connections).toHaveLength(1);
  expect(layout.boundaries?.[1]).toMatchObject({ kind: "retained", reason: expect.stringContaining("No safe planned bearing") });
  expect(() => resolveMixedBuild({ w: 470, d: 300, h: 241, front: 0 }, request))
    .toThrow(/fit your shelf with shared walls.*planner could not find.*476.5 mm/);
  verifyManufacturing(layout, 83);
}));

test("an adapted printer envelope failure searches cuts before retaining both walls", () => geo.arena(() => {
  const request = requestFor([134.5, 134.5]);
  request.shared = { ...DEFAULTS, base: "flat", cascade: false, slope: 5, bed: [161, 157, 256] };
  const layout = resolveMixedBuild({ w: 305, d: 292.1, h: 241, front: 0 }, request);
  expect(layout.boundaries?.map(boundary => boundary.kind)).toEqual(["shared"]);
  expect(layout.footprint[0] + 8).toBeCloseTo(302, 8);
  for (const stack of layout.stacks) {
    expect(stack.derived.seams[0]).toBeGreaterThan(0);
    expect(check(stack.options, stack.derived).filter(message => message.startsWith("FAIL"))).toEqual([]);
    expect(laneOf(stack.options, stack.derived, "top").tabs).toEqual(laneOf(stack.options, solve(stack.options), "top").tabs);
  }
  verifyManufacturing(layout, 48);
}));

test("moving a neighboring cut preserves the intrinsic can-geometry explanation", () => {
  const request = requestFor();
  request.stacks[2].canDiameter = 74;
  const layout = resolveMixedBuild({ w: 600, d: 292.1, h: 241, front: 0 }, request);
  expect(layout.boundaries?.[0].kind).toBe("shared");
  expect(layout.stacks[0].derived.seams[0]).toBeGreaterThan(0);
  expect(layout.boundaries?.[1]).toMatchObject({ kind: "retained", reason: "Different wall attachment geometry" });
});

test("explicit separated Custom rows keep the original cut and padded lane identity", () => {
  const mixed = requestFor();
  const request = { shared: mixed.shared, shareCompatibleWalls: true, topCover: true,
    rows: [{ lanes: mixed.stacks.map(stack => ({ canDiameter: stack.canDiameter, canHeight: stack.canHeight,
      depth: stack.depth, slope: 5, lipGap: 5 })), repeat: 1, rowHeight: 110,
      rowSpan: 454.5, alignment: "centre" as const, rearLoad: false }] };
  const shelf = { w: 600, d: 292.1, h: 241, front: 0 };
  const enabled = resolveIndependentRows(shelf, request), disabled = resolveIndependentRows(shelf, { ...request, shareCompatibleWalls: false });
  expect(enabled.rows[0].layout.boundaries?.map(boundary => boundary.kind)).toEqual(["retained", "retained"]);
  expect(enabled.rows[0].lanes.map(lane => lane.derived)).toEqual(disabled.rows[0].lanes.map(lane => lane.derived));
  expect(enabled.rows[0].lanes === enabled.rows[0].layout.stacks).toBe(true);
  expect(enabled.rows[0].lanes.map(lane => lane.heightPadding)).toEqual(disabled.rows[0].lanes.map(lane => lane.heightPadding));
});

test("explicit seam overrides reject unsupported section counts and cuts through original joints", () => {
  const options = { ...DEFAULTS, base: "flat" as const, cascade: false, length: 292.1, slope: 5 };
  expect(() => solve(options, 0, [0, 10])).toThrow("one cut");
  expect(() => solve(options, 0, [])).toThrow("one cut");
  const pin = solve(options).pinPositions[1];
  expect(() => solve(options, 0, [pin])).toThrow("original outer-wall bearings and pin roots");
  expect(() => solve({ ...options, length: 240 }, 0, [0])).toThrow("two-section lane");
  expect(() => solve({ ...options, length: 640 }, 0, [0])).toThrow("two-section lane");
  expect(() => solve({ ...options, cascade: true }, 0, [0])).toThrow("non-cascading");
  expect(solve(options, 0, [1.3]).seams).toEqual([1.3]);
});

for (const fit of [-.2, 0, .3]) test(`whole cover and its keys are retained by the intended dividers at fit ${fit}`, () => geo.arena(() => {
  const request = requestFor(); request.shared.fit = fit;
  const layout = resolveMixedBuild({ w: 457.2, d: 292.1, h: 241, front: 0 }, request);
  const { assembled } = actualParts(layout);
  const covers = assembled.filter(part => part.source.kind === "stack" && part.source.stackIndex === 1 && part.source.source.kind === "cover");
  const keys = assembled.filter(part => part.source.kind === "stack" && part.source.stackIndex === 1 && part.source.source.kind === "key");
  const dividers = assembled.filter(part => part.source.kind === "shared-divider");
  expect(covers).toHaveLength(2); expect(keys).toHaveLength(2); expect(dividers.length).toBeGreaterThan(0);
  const subassembly = [...covers, ...keys];
  const seated = geo.union(subassembly.map(part => part.mesh));
  const lifted = seated.translate([0, 0, .8]);
  expect(dividers.reduce((volume, part) => volume + overlap(seated, part.mesh), 0)).toBeLessThan(1e-5);
  expect(dividers.reduce((volume, part) => volume + overlap(lifted, part.mesh), 0)).toBeGreaterThan(.01);
  // Identical tiers instance the same source geometry, whose tierIndex is the
  // representative source index. Physical tier ownership comes from its pose.
  const topElevation = layout.stacks[1].origin[2] + (layout.stacks[1].options.tiers - 1) * layout.stacks[1].derived.H;
  const topDividers = dividers.filter(divider => Math.abs(divider.pose.translate[2] - topElevation) < 1e-8);
  expect(topDividers).toHaveLength(4);
  for (const divider of topDividers) expect(overlap(lifted, divider.mesh), divider.name).toBeGreaterThan(.01);
  // Remove the intended hosts as a negative control, moving every own key with
  // the cover so neither a stationary seam key nor another cover half can pass.
  const withoutHosts = assembled.filter(part => !subassembly.includes(part) && part.source.kind !== "shared-divider");
  expect(withoutHosts.reduce((volume, part) => volume + overlap(lifted, part.mesh), 0)).toBeLessThan(1e-5);
  for (const kind of ["deck", "cover"]) for (const first of [0, 1]) {
    const owners = [first, first + 1].map(index => geo.union(assembled.filter(part => part.source.kind === "stack"
      && part.source.stackIndex === index && (kind === "cover" ? part.source.source.kind === "cover"
        : part.source.source.kind === "lane" && part.source.source.plate === "deck")).map(part => part.mesh)));
    const clearance = clearanceOf(layout.stacks[first].options);
    expect(overlap(owners[0], owners[1].translate([0, -clearance + .0001, 0]))).toBeLessThan(1e-5);
    expect(overlap(owners[0], owners[1].translate([0, -clearance - .01, 0]))).toBeGreaterThan(.01);
  }
}));

test("contiguous partitions keep both valid pairs around a tighter middle lane", () => {
  const request = requestFor([122.5, 122.5, 180, 122.5, 122.5], 300);
  request.shared = { ...DEFAULTS, base: "flat", cascade: false, slope: 5, fit: .3, bed: [164, 256, 256] };
  const layout = resolveMixedBuild({ w: 750, d: 300, h: 241, front: 0 }, request);
  const pair = resolveMixedBuild({ w: 480, d: 300, h: 241, front: 0 }, { ...request, stacks: request.stacks.slice(0, 2) });
  expect(layout.boundaries?.map(boundary => boundary.kind)).toEqual(["shared", "retained", "retained", "shared"]);
  expect(layout.stacks[2].derived).toEqual(solve(layout.stacks[2].options));
  for (const index of [0, 1, 3, 4]) expect(layout.stacks[index].derived).toEqual(pair.stacks[0].derived);
  expect(layout.footprint[0] + 8).toBeCloseTo(749.5, 8);
  expect(layout.cans).toBe(40);
});

test("eight identical exhausted searches retain the same result as a pair within the editor time budget", () => {
  const request = requestFor(Array(8).fill(122.5), 350);
  request.shared = { ...DEFAULTS, base: "flat", cascade: false, slope: 0, fit: .3 };
  request.stacks = request.stacks.map(stack => ({ ...stack, canDiameter: 150, slope: 0 }));
  const shelf = { w: 2000, d: 350, h: 1000, front: 0 };
  const pair = resolveMixedBuild(shelf, { ...request, stacks: request.stacks.slice(0, 2) });
  expect(pair.boundaries?.map(boundary => boundary.kind)).toEqual(["retained"]);
  const started = performance.now();
  const layout = resolveMixedBuild(shelf, request);
  expect(performance.now() - started).toBeLessThan(1000);
  expect(layout.boundaries?.map(boundary => boundary.kind)).toEqual(Array(7).fill("retained"));
  expect(layout.stacks.map(stack => stack.derived)).toEqual(Array(8).fill(pair.stacks[0].derived));
  expect(layout.cans).toBe(pair.cans * 4);
});
