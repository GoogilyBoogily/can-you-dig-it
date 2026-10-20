import { expect, test } from 'bun:test';
import type { Manifold } from 'manifold-3d';
import { DEFAULTS, type IndependentRowRequest, type IndependentRowsBuildRequest, type Vec3 } from '../src/model';
import { resolveIndependentRows } from '../src/rows';
import { independentRowsAssemblyCans, independentRowsAssemblyPlacements, independentRowsPartManifest } from '../src/assembly';
import { buildIndependentRowsGeometry, rowReceivingPinFeatures } from '../src/rows-geometry';
import { buildRowTransitionPart } from '../src/row-transition-geometry';
import { pinJoint, pinSnap, clearanceOf, seamKeyRadius } from '../src/features/joints';
import { sharedWallPinJoint, sharedWallSnapTop } from '../src/features/shared-wall';
import { stand } from '../src/features/pose';
import { meshDataOf, inspectMesh, packPlan } from '../src/export';
import { completeTransferPrototype } from '../prototypes/grid-row-transfer-complete';
import { geo, overhangArea } from './geo';

const shelf = { w: 457.2, d: 279.4, h: 241, front: 0 };
function row(widths: number[], rowSpan: number | 'auto' = 'auto', alignment: IndependentRowRequest['alignment'] = 'centre'): IndependentRowRequest {
  return { lanes: widths.map(canHeight => ({ canDiameter: 66, canHeight, depth: 279.4, slope: 3, lipGap: 5 })),
    repeat: 1, rowHeight: 'auto', rowSpan, alignment, rearLoad: false };
}
function request(rows: IndependentRowRequest[], fit = 0, wall = 6): IndependentRowsBuildRequest {
  return { shared: { ...DEFAULTS, base: 'flat', fit, wall }, rows, shareCompatibleWalls: false, topCover: true };
}
function overlap(first: Manifold, second: Manifold) {
  const left = first.boundingBox(), right = second.boundingBox();
  if (![0, 1, 2].every(axis => Math.min(left.max[axis], right.max[axis])
    - Math.max(left.min[axis], right.min[axis]) > 1e-6)) return 0;
  return Math.max(0, geo.isect(first, second).volume());
}

for (const fit of [-.2, 0, .3]) for (const configuration of [
  { label: 'spread two wide below three narrow', rows: [row([157, 157], 420), row([122.5, 122.5, 122.5])] },
  { label: 'compact identical two-lane repeat', rows: [{ ...row([157, 157]), repeat: 2 }] },
  { label: 'aligned singleton repeat', rows: [{ ...row([157]), repeat: 2 }] },
  { label: 'shifted narrower singleton', rows: [row([157]), row([122.5], 'auto', 'left')] },
  { label: 'minimum wall thickness spread', rows: [row([157, 157], 420), row([122.5, 122.5, 122.5])], wall: 5.75 },
]) test(`row transfer fit ${fit}: ${configuration.label} has actual support, retention and print fit`, () => geo.arena(() => {
  const layout = resolveIndependentRows(shelf, request(configuration.rows, fit, 'wall' in configuration ? configuration.wall : 6));
  const manifest = independentRowsPartManifest(layout), printables = buildIndependentRowsGeometry(geo, layout);
  expect(printables.map(part => ({ name: part.name, qty: part.qty })))
    .toEqual(manifest.map(part => ({ name: part.name, qty: part.qty })));
  const catalogue = new Map(printables.map(part => [part.name, part.mesh]));
  const sources = new Map(manifest.map(part => [part.name, part.source]));
  for (const part of printables) {
    expect(part.mesh.status(), part.name).toBe('NoError');
    expect(part.mesh.decompose().length, part.name).toBe(1);
    expect(overhangArea(part.mesh), part.name).toBeLessThan(1e-6);
    expect(part.mesh.boundingBox().min[2], part.name).toBeCloseTo(0, 6);
    inspectMesh(meshDataOf(part.name, part.mesh.getMesh()), true);
  }
  const parts = [...independentRowsAssemblyPlacements(layout)].map(placement => ({
    name: placement.name, source: sources.get(placement.name)!, mesh: stand(catalogue.get(placement.name)!, placement.pose),
  }));
  expect(parts.length).toBe(manifest.reduce((total, part) => total + part.qty, 0));
  for (const [firstIndex, first] of parts.entries()) for (const second of parts.slice(firstIndex + 1))
    expect(overlap(first.mesh, second.mesh), `${first.name}/${second.name}`).toBeLessThan(1e-5);
  const lanes = layout.rows.flatMap(resolvedRow => resolvedRow.lanes);
  const cans = lanes.map(lane => geo.cyl(lane.options.canD / 2, lane.options.canL,
    0, 0, -lane.options.canL / 2, 64).rotate([90, 0, 0]));
  let count = 0;
  for (const placement of independentRowsAssemblyCans(layout)) {
    count++;
    for (const axial of [-1.75, 0, 1.75]) {
      const can = stand(cans[placement.stackIndex], placement.pose).translate([0, axial, 0]);
      for (const part of parts) expect(overlap(can, part.mesh), `can/${part.name}`).toBeLessThan(1e-5);
    }
  }
  expect(count).toBe(layout.cans);
  const transition = layout.transitions[0], lower = layout.rows[0], upper = layout.rows[1];
  const transitionParts = new Map(parts.filter(part => part.source.kind === 'row-transition')
    .map(part => [part.source.kind === 'row-transition' ? part.source.partIndex : -1, part.mesh]));
  const lowerWalls = transition.lowerSupports.map(support => geo.union(parts.filter(part => {
    if (part.source.kind !== 'row-part' || part.source.rowIndex !== 0 || part.source.source.kind !== 'stack') return false;
    const source = part.source.source;
    return source.stackIndex === support.laneIndex && source.source.kind === 'lane'
      && source.source.plate?.startsWith(support.wallSide > 0 ? 'wall-left' : 'wall-right');
  }).map(part => part.mesh)));
  const wallBodies = lowerWalls.map(wall => geo.isect(wall, geo.box(1000, 1000, 1000, 0, 0, lower.height - 500)));
  const keyCopies = parts.filter(part => part.source.kind === 'row-transition'
    && transition.parts[part.source.partIndex].kind === 'key');
  expect(keyCopies.length).toBe(transition.parts.filter(part => part.kind === 'key').length);
  const keys = geo.union(keyCopies.map(part => part.mesh));
  const panels = transition.panels.map(panel => transitionParts.get(transition.parts.findIndex(part => part.panelIndex === panel.index))!);
  const shoes = transition.shoes.map(shoe => transitionParts.get(transition.parts.findIndex(part => part.shoeIndex === shoe.index))!);
  for (const panel of transition.panels) {
    for (const supportIndex of panel.lowerSupportIndices) expect(overlap(panels[panel.index].translate([0, 0, -.01]),
      wallBodies[supportIndex]) / .01, `panel ${panel.index}/support ${supportIndex}`).toBeGreaterThan(100);
    const fixed = geo.union([...lowerWalls, ...(transition.seams.length ? [keys] : [])]);
    expect(overlap(panels[panel.index].translate([0, 0, .8]), fixed), `panel ${panel.index} uplift`).toBeGreaterThan(.1);
  }
  const carrierTop = lower.height + transition.carrierThickness;
  for (const shoe of transition.shoes) {
    const foot = geo.isect(shoes[shoe.index], geo.box(1000, 1000, 1000, 0, 0, carrierTop + 500));
    expect(overlap(foot.translate([0, 0, -.01]), panels[shoe.panelIndex]) / .01, `shoe ${shoe.index} compression`).toBeGreaterThan(100);
    expect(overlap(shoes[shoe.index].translate([0, 0, .8]), panels[shoe.panelIndex]), `shoe ${shoe.index} uplift`).toBeGreaterThan(.1);
    expect(shoes[shoe.index].boundingBox().min[2]).toBeGreaterThanOrEqual(lower.height - 1e-6);
    expect(shoes[shoe.index].boundingBox().max[2]).toBeCloseTo(carrierTop + transition.shoeHeight
      + sharedWallSnapTop(lower.lanes[0].options), 6);
    const receivingWall = geo.union(parts.filter(part => {
      if (part.source.kind !== 'row-part' || part.source.rowIndex !== 1 || part.source.source.kind !== 'stack') return false;
      const source = part.source.source;
      return source.stackIndex === shoe.laneIndex && source.source.kind === 'lane'
        && source.source.plate?.startsWith(shoe.wallSide > 0 ? 'wall-left' : 'wall-right');
    }).map(part => part.mesh));
    expect(overlap(receivingWall.translate([0, 0, .8]), shoes[shoe.index]),
      `shoe ${shoe.index}/incoming crest receiver uplift`).toBeGreaterThan(.1);
  }
  const moving = geo.union(parts.filter(part => part.source.kind === 'row-part' && part.source.rowIndex === 1).map(part => part.mesh).concat(shoes));
  const fixed = geo.union(parts.filter(part => part.source.kind !== 'row-part' || part.source.rowIndex !== 1)
    .filter(part => part.source.kind !== 'row-transition' || transition.parts[part.source.partIndex].kind !== 'shoe').map(part => part.mesh));
  for (const pivotY of [transition.lowerSupports[0].y, transition.lowerSupports.at(-1)!.y]) for (const direction of [-1, 1]) {
    const pivot: Vec3 = [139.7, pivotY, carrierTop];
    const rotated = moving.translate(pivot.map(value => -value) as Vec3).rotate([direction * .25, 0, 0]).translate(pivot);
    expect(overlap(rotated, fixed), `roll ${pivotY}/${direction}`).toBeGreaterThan(.1);
  }
  const clearance = clearanceOf(lower.lanes[0].options), snap = pinSnap(clearance);
  expect(transition.carrierThickness - (snap.tip + clearance + 1.5 + clearance)).toBeGreaterThanOrEqual(.8);
  expect(transition.shoeHeight - (7 - snap.peak)).toBeGreaterThanOrEqual(1.7);
  expect(transition.carrierThickness / 2 - seamKeyRadius).toBeGreaterThanOrEqual(1.7);
  const minimum = Math.min(...parts.map(part => part.mesh.boundingBox().min[1]));
  const maximum = Math.max(...parts.map(part => part.mesh.boundingBox().max[1]));
  expect(maximum - minimum).toBeCloseTo(layout.footprint[0], 6);
  expect(maximum - minimum + 8).toBeLessThanOrEqual(shelf.w);
  expect(layout.footprint[2]).toBeLessThanOrEqual(shelf.h);
  const packed = packPlan(printables.map(part => ({ mesh: meshDataOf(part.name, part.mesh.getMesh()), qty: part.qty })),
    lower.lanes[0].options.bed, 3);
  expect(packed.placements.length).toBe(parts.length);
  if (configuration.label.startsWith('spread')) {
    expect(transition.panels).toHaveLength(6); expect(transition.shoes).toHaveLength(12);
    expect(transition.parts.filter(part => part.kind === 'key')).toHaveLength(8);
    const prototype = completeTransferPrototype(geo, fit);
    for (const kind of ['carrier', 'shoe', 'key'] as const) {
      const reference = prototype.parts.filter(part => part.kind === kind);
      const planned = transition.parts.map((part, index) => ({ part, index })).filter(({ part }) => part.kind === kind);
      for (const [index, { part, index: partIndex }] of planned.entries()) {
        const actual = stand(buildRowTransitionPart(geo, transition, partIndex, lower.lanes[0].options), part.pose);
        expect(geo.diff(actual, [reference[index].standing]).volume()).toBeLessThan(1e-5);
        expect(geo.diff(reference[index].standing, [actual]).volume()).toBeLessThan(1e-5);
      }
    }
  }
}));

for (const fit of [-.2, 0, .3]) test(`incoming crest receivers preserve ordinary upper pins at fit ${fit}`, () => geo.arena(() => {
  const options = { ...DEFAULTS, fit };
  const features = rowReceivingPinFeatures(geo, options);
  const ordinary = pinJoint(geo, { wall: options.wall, clearance: clearanceOf(options) });
  const crest = sharedWallPinJoint(geo, options);
  for (const [actual, expected] of [[features.joint.pin, ordinary.pin],
    [features.joint.relief, ordinary.relief], [features.joint.notch, crest.notch]]) {
    expect(geo.diff(actual, [expected]).volume()).toBeLessThan(1e-8);
    expect(geo.diff(expected, [actual]).volume()).toBeLessThan(1e-8);
  }
  expect(features.receivingTip).toBe(sharedWallSnapTop(options));
  expect(features.rootDepth).toBe(crest.freeRootDepth);
}));

test('unproven seam shoes and deeper upper rows fail before offering a physical build', () => {
  expect(() => resolveIndependentRows(shelf, request([row([157, 157], 420), row([71.5])]))).toThrow('across an unqualified carrier seam');
  expect(() => resolveIndependentRows(shelf, request([row([157, 157], 420), row([78.5])]))).toThrow('closed carrier edge rail');
  const deeper = row([122.5]); deeper.lanes[0].depth = 280;
  expect(() => resolveIndependentRows({ ...shelf, d: 300 }, request([row([157]), deeper]))).toThrow('different row depths');
});

for (const fit of [-.2, 0, .3]) test(`unqualified carrier key-slot junctions and outboard loads fail at fit ${fit}`, () => {
  expect(() => resolveIndependentRows(shelf, request([
    row([157, 157], 420), row([152], 'auto', 'left'),
  ], fit))).toThrow('ligament around a carrier seam key channel');
  const lower = row([122.5]), upper = row([140.5]);
  for (const current of [lower, upper]) current.lanes[0].depth = 240;
  expect(() => resolveIndependentRows({ w: 600, d: 600, h: 500, front: 0 }, request([lower, upper], fit)))
    .toThrow('overhangs its lower bearing supports');
});
