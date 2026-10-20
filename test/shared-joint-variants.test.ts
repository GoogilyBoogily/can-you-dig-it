import { expect, test } from "bun:test";
import type { Manifold } from "manifold-3d";
import { DEFAULTS, K, type MixedBuildRequest, type Options } from "../src/model";
import { laneOf, sharedPrintSeamRanges, solve } from "../src/geometry";
import { jointSitePlans } from "../src/shared-joint-planner";
import { clearanceOf } from "../src/features/joints";
import { resolveMixedBuild } from "../src/solver";
import { mixedAssemblyCans, mixedAssemblyPlacements, mixedPartManifest } from "../src/assembly";
import { buildMixedGeometry } from "../src/mixed-geometry";
import { meshDataOf, packPlan } from "../src/export";
import { stand } from "../src/features/pose";
import { geo, overhangArea } from "./geo";

function overlap(first: Manifold, second: Manifold) {
  const firstBounds = first.boundingBox(), secondBounds = second.boundingBox();
  return [0, 1, 2].every(axis => Math.min(firstBounds.max[axis], secondBounds.max[axis])
    - Math.max(firstBounds.min[axis], secondBounds.min[axis]) > 1e-6) ? geo.isect(first, second).volume() : 0;
}

function verifyAssembly(request: MixedBuildRequest) {
  const layout = resolveMixedBuild({ w: 2000, d: 1000, h: 500, front: 0 }, request);
  const parts = buildMixedGeometry(geo, layout), manifest = mixedPartManifest(layout);
  expect(parts.map(({ name, qty }) => ({ name, qty }))).toEqual(manifest.map(({ name, qty }) => ({ name, qty })));
  for (const part of parts) {
    expect(part.mesh.status(), part.name).toBe("NoError");
    expect(part.mesh.decompose().length, part.name).toBe(1);
    expect(overhangArea(part.mesh), part.name).toBeLessThan(1e-6);
  }
  const catalogue = new Map(parts.map(part => [part.name, part.mesh]));
  const placed = [...mixedAssemblyPlacements(layout)].map(placement => ({ name: placement.name,
    mesh: stand(catalogue.get(placement.name)!, placement.pose) }));
  for (let first = 0; first < placed.length; first++) for (let second = first + 1; second < placed.length; second++)
    expect(overlap(placed[first].mesh, placed[second].mesh), `${placed[first].name}/${placed[second].name}`).toBeLessThan(1e-5);
  const cans = layout.stacks.map(stack => geo.cyl(stack.options.canD / 2, stack.options.canL,
    0, 0, -stack.options.canL / 2).rotate([90, 0, 0]));
  for (const placement of mixedAssemblyCans(layout)) {
    const stack = layout.stacks[placement.stackIndex];
    for (const axial of [-stack.options.clearance / 2, stack.options.clearance / 2]) {
      const can = stand(cans[placement.stackIndex], placement.pose).translate([0, axial, 0]);
      for (const part of placed) expect(overlap(can, part.mesh), `can/${part.name}`).toBeLessThan(1e-5);
    }
  }
  const plan = packPlan(parts.map(part => ({ mesh: meshDataOf(part.name, part.mesh.getMesh()), qty: part.qty })),
    request.shared.bed, request.shared.bedMargin, 6, request.shared.bedKeepOut);
  expect(plan.placements).toHaveLength(placed.length);
  return layout;
}

for (const configuration of [
  { depth: 285, fit: -.2, design: "standard", pattern: "slat", slope: 0 },
  { depth: 300, fit: .3, design: "minimal", pattern: "circle", slope: 10 },
  { depth: 310, fit: 0, design: "minimal", pattern: "kumiko", cover: false, rearLoad: true, stackable: true },
  { depth: 295, fit: 0, design: "minimal", pattern: "hex", bed: [266, 250, 256] },
  { depth: 295, fit: 0, design: "minimal", pattern: "hex", bed: [250, 266, 256] },
] satisfies (Partial<Options> & { depth: number })[]) test(`joint-aware actual manufacturing variant ${JSON.stringify(configuration)}`, () => geo.arena(() => {
  const { depth, ...settings } = configuration;
  const layout = verifyAssembly({ shared: { ...DEFAULTS, base: "flat", cascade: false, slope: 5, ...settings },
    shareCompatibleWalls: true, stacks: [122.5, 157].map(canHeight => ({ canDiameter: 66, canHeight, depth, tiers: 2 })) });
  expect(layout.boundaries?.[0].kind).toBe("shared");
}));

test("changed cuts coexist with retained spline connections between independently planned groups", () => geo.arena(() => {
  const layout = verifyAssembly({ shared: { ...DEFAULTS, base: "flat", cascade: false, slope: 5, fit: .3, design: "minimal" },
    shareCompatibleWalls: true, stacks: [292.1, 292.1, 279.4, 292.1, 292.1].map(depth => ({
      canDiameter: 66, canHeight: 122.5, depth, tiers: 2 })) });
  expect(layout.boundaries?.map(boundary => boundary.kind)).toEqual(["shared", "retained", "retained", "shared"]);
  expect(layout.connections.map(connection => connection.firstStackIndex)).toEqual([1, 2]);
}));

test("eight failing one-cut stacks remain within the live planning time budget", () => {
  const started = performance.now();
  const layout = resolveMixedBuild({ w: 2000, d: 1000, h: 500, front: 0 }, {
    shared: { ...DEFAULTS, base: "flat", cascade: false, slope: 5, fit: .3 }, shareCompatibleWalls: true,
    stacks: Array.from({ length: 8 }, () => ({ canDiameter: 66, canHeight: 122.5, depth: 292.1, tiers: 2 })) });
  expect(layout.boundaries?.every(boundary => boundary.kind === "shared")).toBe(true);
  expect(performance.now() - started).toBeLessThan(3000);
  expect(layout.cans).toBe(64);
});

for (const fit of [-.2, 0, .3]) test(`rear loading preserves lower-tier end-wall root clearance in every candidate at fit ${fit}`, () => {
  const options: Options = { ...DEFAULTS, base: "flat", cascade: false, rearLoad: true, cover: false, fit, length: 280, tiers: 2 };
  const derived = solve(options), lane = laneOf(options, derived, "top");
  const stack = { index: 0, options, derived, origin: [140, 0, 0] as [number, number, number], height: 200, cans: 0 };
  const clearance = clearanceOf(options);
  const protectedRoot = K.tabW / 2 + Math.max(K.snapT, K.snapCatch + 2 * clearance) + K.ligMin;
  let count = 0;
  for (const plan of jointSitePlans(stack, lane, sharedPrintSeamRanges(options, derived, derived.plateY))) {
    count++;
    for (const pin of plan.sites.pins) expect(pin.position + protectedRoot).toBeLessThanOrEqual(lane.xe - clearance + 1e-8);
  }
  expect(count).toBeGreaterThan(0);
});
