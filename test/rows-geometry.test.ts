import { expect, test } from "bun:test";
import type { Manifold } from "manifold-3d";
import { strFromU8, unzipSync } from "fflate";
import { DEFAULTS, type IndependentLaneRequest, type IndependentRowRequest, type IndependentRowsBuildRequest } from "../src/model";
import { resolveIndependentRows, type IndependentRowsLayout } from "../src/rows";
import { buildIndependentRowsGeometry } from "../src/rows-geometry";
import { independentRowsPartManifest, independentRowsAssemblyPlacements, independentRowsAssemblyCans } from "../src/assembly";
import { stand } from "../src/features/pose";
import { meshDataOf, packPlan, threeMf, stlZip } from "../src/export";
import { geo, overhangArea } from "./geo";

const lane = (canHeight: number, canDiameter = 66, depth = 279.4): IndependentLaneRequest =>
  ({ canDiameter, canHeight, depth, slope: 3, lipGap: 5 });
const row = (lanes: IndependentLaneRequest[], rowSpan: number | "auto" = "auto"): IndependentRowRequest =>
  ({ lanes, rowSpan, rowHeight: "auto", alignment: "centre", repeat: 1, rearLoad: false });
const shelf = { w: 457.2, d: 279.4, h: 241, front: 0 };

function overlap(first: Manifold, second: Manifold): number {
  const firstBounds = first.boundingBox(), secondBounds = second.boundingBox();
  if (![0, 1, 2].every(axis => Math.min(firstBounds.max[axis], secondBounds.max[axis])
    - Math.max(firstBounds.min[axis], secondBounds.min[axis]) > 1e-6)) return 0;
  return geo.isect(first, second).volume();
}

function verifyPhysicalLayout(layout: IndependentRowsLayout, serialize: boolean) {
  const manifest = independentRowsPartManifest(layout), parts = buildIndependentRowsGeometry(geo, layout);
  expect(parts.map(({ name, qty }) => ({ name, qty }))).toEqual(manifest.map(({ name, qty }) => ({ name, qty })));
  expect(new Set(parts.map(part => part.name)).size).toBe(parts.length);
  for (const part of parts) {
    expect(part.mesh.status(), part.name).toBe("NoError");
    expect(part.mesh.decompose().length, part.name).toBe(1);
    expect(overhangArea(part.mesh), part.name).toBeLessThan(1e-6);
    expect(part.mesh.boundingBox().min[2], part.name).toBeCloseTo(0, 6);
  }
  const catalogue = new Map(parts.map(part => [part.name, part.mesh]));
  const placements = [...independentRowsAssemblyPlacements(layout)];
  const quantities = new Map<string, number>();
  for (const placement of placements) quantities.set(placement.name, (quantities.get(placement.name) ?? 0) + 1);
  expect(quantities).toEqual(new Map(parts.map(part => [part.name, part.qty])));
  const standing = placements.map(placement => ({ name: placement.name, mesh: stand(catalogue.get(placement.name)!, placement.pose) }));
  for (let first = 0; first < standing.length; first++) for (let second = first + 1; second < standing.length; second++)
    expect(overlap(standing[first].mesh, standing[second].mesh), `${standing[first].name}/${standing[second].name}`).toBeLessThan(1e-5);
  const actualMinimum = [0, 1, 2].map(axis => Math.min(...standing.map(part => part.mesh.boundingBox().min[axis])));
  const actualMaximum = [0, 1, 2].map(axis => Math.max(...standing.map(part => part.mesh.boundingBox().max[axis])));
  expect(actualMaximum[1] - actualMinimum[1]).toBeCloseTo(layout.footprint[0], 6);
  expect(actualMaximum[0] - actualMinimum[0]).toBeCloseTo(layout.footprint[1], 6);
  expect(actualMaximum[2] - actualMinimum[2]).toBeCloseTo(layout.footprint[2], 6);
  const lanes = layout.rows.flatMap(row => row.lanes);
  const cylinders = lanes.map(lane => geo.cyl(lane.options.canD / 2, lane.options.canL,
    0, 0, -lane.options.canL / 2).rotate([90, 0, 0]));
  let cans = 0;
  for (const placement of independentRowsAssemblyCans(layout)) {
    cans++;
    const options = lanes[placement.stackIndex].options;
    for (const axial of [-options.clearance / 2, 0, options.clearance / 2]) {
      const can = stand(cylinders[placement.stackIndex], placement.pose).translate([0, axial, 0]);
      for (const part of standing) expect(overlap(can, part.mesh), `can/${part.name}/${axial}`).toBeLessThan(1e-5);
    }
  }
  expect(cans).toBe(layout.cans);
  const printable = parts.map(part => ({ mesh: meshDataOf(part.name, part.mesh.getMesh()), qty: part.qty }));
  const shared = layout.request.shared;
  const plan = packPlan(printable, shared.bed, shared.bedMargin, undefined, shared.bedKeepOut);
  expect(plan.placements.length).toBe(placements.length);
  if (serialize) {
    const project = unzipSync(threeMf(plan, shared.bed));
    const model = strFromU8(project["3D/3dmodel.model"]);
    const objects = [...model.matchAll(/<object id="\d+" type="model" name="([^"]+)"/g)].map(match => match[1]);
    expect(objects).toEqual(plan.placements.map(placement => placement.name));
    const configuration = strFromU8(project["Metadata/model_settings.config"]);
    expect([...configuration.matchAll(/<metadata key="object_id" value="(\d+)"/g)].map(match => Number(match[1])).sort((first, second) => first - second))
      .toEqual(Array.from({ length: placements.length }, (_, index) => index + 1));
    expect(Object.keys(unzipSync(stlZip(printable.map(part => part.mesh)))).length).toBe(parts.length);
  }
  return { parts, placements };
}

test("a singleton custom row emits its complete six-piece ordinary lane", () => geo.arena(() => {
  const request: IndependentRowsBuildRequest = { shared: { ...DEFAULTS, base: "flat" },
    rows: [row([lane(122.5, 66, 240)])], shareCompatibleWalls: false, topCover: true };
  const layout = resolveIndependentRows(shelf, request), actual = verifyPhysicalLayout(layout, true);
  expect(actual.parts).toHaveLength(6);
  expect(actual.placements).toHaveLength(6);
  expect(layout.cans).toBe(3);
}));

test("different can diameters in one row keep real headroom and compatible shared walls", () => geo.arena(() => {
  const request: IndependentRowsBuildRequest = { shared: { ...DEFAULTS, base: "flat" },
    rows: [row([lane(122.5, 66, 240), lane(80, 53, 240)])], shareCompatibleWalls: true, topCover: true };
  const layout = resolveIndependentRows(shelf, request);
  expect(layout.rows[0].lanes.map(lane => lane.heightPadding)).toEqual([0, 13]);
  expect(layout.rows[0].layout.boundaries?.map(boundary => boundary.kind)).toEqual(["shared"]);
  verifyPhysicalLayout(layout, true);
}));

for (const fit of [-.2, 0, .3]) test(`independent two-wide to three-narrow production fit ${fit} preserves actual support parts and export inventory`, () => geo.arena(() => {
  const request: IndependentRowsBuildRequest = { shared: { ...DEFAULTS, base: "flat", fit,
    design: "minimal", hexAuto: false, hexR: 13 },
    rows: [row([lane(157), lane(157)], 420), row([lane(122.5), lane(122.5), lane(122.5)])],
    shareCompatibleWalls: true, topCover: true };
  const layout = resolveIndependentRows(shelf, request), actual = verifyPhysicalLayout(layout, fit === 0);
  expect(layout.cans).toBe(15);
  expect(actual.placements).toHaveLength(112);
  const transitions = independentRowsPartManifest(layout).filter(part => part.source.kind === "row-transition");
  expect(transitions.filter(part => part.role === "cover").reduce((total, part) => total + part.qty, 0)).toBe(6);
  expect(transitions.filter(part => part.role === "riser").reduce((total, part) => total + part.qty, 0)).toBe(12);
  expect(transitions.filter(part => part.role === "lane").reduce((total, part) => total + part.qty, 0)).toBe(8);
  expect(layout.footprint[0] + 8).toBe(446);
  expect(layout.footprint[2]).toBeLessThanOrEqual(241);
}), 30000);
