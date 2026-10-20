import { expect, test } from "bun:test";
import { DEFAULTS, K, type MixedBuildRequest } from "../src/model";
import { resolveMixedBuild } from "../src/solver";
import { mixedAssemblyPlacements, mixedPartManifest } from "../src/assembly";
import { buildMixedGeometry } from "../src/mixed-geometry";
import { clearanceOf } from "../src/features/joints";
import { meshDataOf, packPlan } from "../src/export";
import { stand } from "../src/features/pose";
import { geo, overhangArea } from "./geo";

const shelf = { w: 2000, d: 2000, h: 2000, front: 0 };
function requestFor(shared: Partial<MixedBuildRequest["shared"]> = {}, depth = 240, tiers = 1, widths = [122.5, 134]): MixedBuildRequest {
  return { shared: { ...DEFAULTS, base: "flat", cascade: false, ...shared }, shareCompatibleWalls: true,
    stacks: widths.map(canHeight => ({ canDiameter: 66, canHeight, depth, tiers })) };
}

for (const fit of [-.2, 0, .3]) for (const configuration of [
  { wall: 5.75, design: "minimal" as const, cascade: false },
  { wall: 6, design: "standard" as const, cascade: false },
  { wall: 6, design: "minimal" as const, cascade: true },
]) test(`shared owner clearance fit ${fit} ${JSON.stringify(configuration)}`, () => geo.arena(() => {
  const request = requestFor({ ...configuration, fit }, configuration.cascade ? 640 : 240, configuration.cascade ? 6 : 1);
  const layout = resolveMixedBuild(shelf, request);
  expect(layout.boundaries?.[0].kind).toBe("shared");
  const printables = buildMixedGeometry(geo, layout);
  const catalogue = new Map(printables.map(part => [part.name, part.mesh]));
  const sources = new Map(mixedPartManifest(layout).map(part => [part.name, part.source]));
  const parts = [...mixedAssemblyPlacements(layout)].map(placement => ({
    source: sources.get(placement.name)!, mesh: stand(catalogue.get(placement.name)!, placement.pose),
  }));
  const clearance = clearanceOf(layout.stacks[0].options);
  for (const kind of ["deck", "cover"] as const) {
    const owners = [0, 1].map(stackIndex => geo.union(parts.filter(({ source }) => source.kind === "stack"
      && source.stackIndex === stackIndex && (kind === "cover" ? source.source.kind === "cover"
        : source.source.kind === "lane" && source.source.plate === "deck")).map(part => part.mesh)));
    // An overlap-only nominal check misses a zero-clearance butt. Approach by
    // almost the entire fit clearance, then cross the actual mating face.
    expect(geo.isect(owners[0], owners[1].translate([0, -clearance + .0001, 0])).volume(), kind).toBeLessThan(1e-5);
    expect(geo.isect(owners[0], owners[1].translate([0, -clearance - .01, 0])).volume(), kind).toBeGreaterThan(.01);
  }
}));

for (const fit of [-.2, 0, .3]) test(`split shared covers preserve seam-key support at fit ${fit}`, () => geo.arena(() => {
  const request = requestFor({ wall: 10, fit }, 480, 2);
  const layout = resolveMixedBuild(shelf, request);
  const boundary = layout.boundaries?.[0];
  expect(boundary?.kind).toBe("retained");
  if (boundary?.kind !== "retained") throw new Error("Expected an unsupported cover-key frame to retain both walls");
  expect(boundary.reason).toContain("seam-key support");
  const legacy = resolveMixedBuild(shelf, { ...request, shareCompatibleWalls: false });
  expect(layout.footprint).toEqual(legacy.footprint);
  expect(layout.stacks.map(stack => stack.cans)).toEqual(legacy.stacks.map(stack => stack.cans));
  expect(mixedPartManifest(layout)).toEqual(mixedPartManifest(legacy));
  const printables = buildMixedGeometry(geo, layout);
  const catalogue = new Map(printables.map(part => [part.name, part.mesh]));
  const sources = new Map(mixedPartManifest(layout).map(part => [part.name, part.source]));
  const parts = [...mixedAssemblyPlacements(layout)].map(placement => ({
    source: sources.get(placement.name)!, mesh: stand(catalogue.get(placement.name)!, placement.pose),
  }));
  const keys = parts.filter(part => part.source.kind === "stack" && part.source.source.kind === "key");
  const covers = parts.filter(part => part.source.kind === "stack" && part.source.source.kind === "cover");
  expect(keys.length).toBeGreaterThan(0);
  expect(covers.length).toBe(4);
  for (const key of keys) for (const cover of covers)
    expect(geo.isect(key.mesh, cover.mesh).volume()).toBeLessThan(1e-5);
  // The supported unsplit variant still shares; the restriction is the key frame.
  expect(resolveMixedBuild(shelf, requestFor({ wall: 10, fit })).boundaries?.[0].kind).toBe("shared");
  expect(resolveMixedBuild(shelf, requestFor({ wall: 10, fit, cover: false }, 480, 2)).boundaries?.[0].kind).toBe("shared");
}));

for (const fit of [-.2, 0, .3]) test(`cover-key support threshold follows fit ${fit}`, () => {
  // The socket's nearest face is 8.7 mm from the original cover edge; the
  // follower loses wall + clearance and must retain a 1.7 mm solid ligament.
  const maximumWall = 8.7 - (K.cl + fit) - K.ligMin;
  for (const offset of [-.001, 0])
    expect(resolveMixedBuild(shelf, requestFor({ wall: maximumWall + offset, fit }, 480, 2)).boundaries?.[0].kind).toBe("shared");
  expect(resolveMixedBuild(shelf, requestFor({ wall: maximumWall + .001, fit }, 480, 2)).boundaries?.[0].kind).toBe("retained");
});

for (const bed of [[256, 256, 256], [256, 250, 256], [250, 256, 256]] as [number, number, number][])
  test(`wide primary shares and actually packs on ${bed}`, () => geo.arena(() => {
    const request = requestFor({ slope: 0, bed }, 240, 1, [234, 122.5]);
    // Include the reported P2S shelf regression and both print orientations.
    const layout = resolveMixedBuild({ ...shelf, w: 390 }, request);
    expect(layout.boundaries?.[0].kind).toBe("shared");
    expect(layout.footprint[0] + 8).toBeCloseTo(389.5, 8);
    const parts = buildMixedGeometry(geo, layout);
    for (const part of parts) {
      expect(part.mesh.status()).toBe("NoError");
      expect(part.mesh.decompose().length).toBe(1);
      expect(overhangArea(part.mesh)).toBeLessThan(1e-6);
    }
    const packed = packPlan(parts.map(part => ({ mesh: meshDataOf(part.name, part.mesh.getMesh()), qty: part.qty })), bed, request.shared.bedMargin);
    expect(packed.placements.length).toBe(parts.reduce((count, part) => count + part.qty, 0));
    const reversed = { ...request, stacks: [...request.stacks].reverse() };
    expect(resolveMixedBuild(shelf, reversed).boundaries?.[0].kind).toBe("retained");
  }));
