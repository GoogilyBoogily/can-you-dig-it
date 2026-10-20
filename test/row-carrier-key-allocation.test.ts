import { expect, test } from 'bun:test';
import type { Manifold } from 'manifold-3d';
import { DEFAULTS, K, type IndependentRowsBuildRequest } from '../src/model';
import { resolveIndependentRows } from '../src/rows';
import { buildIndependentRowsGeometry } from '../src/rows-geometry';
import { independentRowsAssemblyPlacements, independentRowsPartManifest } from '../src/assembly';
import { clearanceOf, endWallSnap, seamKeySocket } from '../src/features/joints';
import { stand } from '../src/features/pose';
import { inspectMesh, meshDataOf, packPlan } from '../src/export';
import { geo, overhangArea } from './geo';

function overlap(first: Manifold, second: Manifold): number {
  const firstBounds = first.boundingBox(), secondBounds = second.boundingBox();
  if (![0, 1, 2].every(axis => Math.min(firstBounds.max[axis], secondBounds.max[axis])
    - Math.max(firstBounds.min[axis], secondBounds.min[axis]) > 1e-6)) return 0;
  return Math.max(0, geo.isect(first, second).volume());
}

for (const depth of [180, 200, 240, 250]) for (const fit of [-.2, 0, .3])
  test(`whole-depth compact repeated rows preserve carrier key hosts at depth ${depth}, fit ${fit}`, () => geo.arena(() => {
    const request: IndependentRowsBuildRequest = {
      shared: { ...DEFAULTS, base: 'flat', fit },
      rows: [{ lanes: Array.from({ length: 2 }, () => ({
        canDiameter: 66, canHeight: 122.5, depth, slope: 3, lipGap: 5,
      })), repeat: 2, rowHeight: 'auto', rowSpan: 'auto', alignment: 'centre', rearLoad: false }],
      shareCompatibleWalls: false, topCover: true,
    };
    const layout = resolveIndependentRows({ w: 600, d: 600, h: 500, front: 0 }, request);
    expect(layout.rows.every(row => row.lanes.every(lane => !lane.derived.split))).toBe(true);
    const transition = layout.transitions[0], lower = layout.rows[0];
    expect(transition.seams.map(seam => seam.kind)).toEqual(['gap']);

    const manifest = independentRowsPartManifest(layout), printables = buildIndependentRowsGeometry(geo, layout);
    expect(printables.map(part => ({ name: part.name, qty: part.qty })))
      .toEqual(manifest.map(part => ({ name: part.name, qty: part.qty })));
    const catalogue = new Map(printables.map(part => [part.name, part.mesh]));
    const sources = new Map(manifest.map(part => [part.name, part.source]));
    for (const part of printables) {
      expect(part.mesh.status(), part.name).toBe('NoError');
      expect(part.mesh.decompose().length, part.name).toBe(1);
      expect(overhangArea(part.mesh), part.name).toBeLessThan(1e-6);
      inspectMesh(meshDataOf(part.name, part.mesh.getMesh()), true);
    }
    const parts = [...independentRowsAssemblyPlacements(layout)].map(placement => ({
      name: placement.name, source: sources.get(placement.name)!, mesh: stand(catalogue.get(placement.name)!, placement.pose),
    }));
    expect(parts.length).toBe(manifest.reduce((quantity, part) => quantity + part.qty, 0));
    for (const [firstIndex, first] of parts.entries()) for (const second of parts.slice(firstIndex + 1))
      expect(overlap(first.mesh, second.mesh), `${first.name}/${second.name}`).toBeLessThan(1e-5);

    const transitionMeshes = new Map(parts.filter(part => part.source.kind === 'row-transition')
      .map(part => [part.source.kind === 'row-transition' ? part.source.partIndex : -1, part.mesh]));
    const panels = transition.panels.map(panel => transitionMeshes.get(
      transition.parts.findIndex(part => part.panelIndex === panel.index))!);
    const shoes = transition.shoes.map(shoe => transitionMeshes.get(
      transition.parts.findIndex(part => part.shoeIndex === shoe.index))!);
    const keys = geo.union(parts.filter(part => part.source.kind === 'row-transition'
      && transition.parts[part.source.partIndex].kind === 'key').map(part => part.mesh));
    const lowerWalls = transition.lowerSupports.map(support => geo.union(parts.filter(part => {
      if (part.source.kind !== 'row-part' || part.source.rowIndex !== 0 || part.source.source.kind !== 'stack') return false;
      const source = part.source.source;
      return source.stackIndex === support.laneIndex && source.source.kind === 'lane'
        && source.source.plate?.startsWith(support.wallSide > 0 ? 'wall-left' : 'wall-right');
    }).map(part => part.mesh)));
    const wallBodies = lowerWalls.map(wall => geo.isect(wall,
      geo.box(1000, 1000, 1000, 0, 0, lower.height - 500)));
    const lowerRetainers = geo.union([...lowerWalls, keys]);
    for (const panel of transition.panels) {
      for (const supportIndex of panel.lowerSupportIndices)
        expect(overlap(panels[panel.index].translate([0, 0, -.01]), wallBodies[supportIndex]) / .01,
          `panel ${panel.index}/support ${supportIndex}`).toBeGreaterThan(100);
      expect(overlap(panels[panel.index].translate([0, 0, .8]), lowerRetainers),
        `panel ${panel.index} uplift`).toBeGreaterThan(.1);
    }
    const carrierTop = lower.height + transition.carrierThickness;
    for (const shoe of transition.shoes) {
      const foot = geo.isect(shoes[shoe.index], geo.box(1000, 1000, 1000, 0, 0, carrierTop + 500));
      expect(overlap(foot.translate([0, 0, -.01]), panels[shoe.panelIndex]) / .01,
        `shoe ${shoe.index} bearing`).toBeGreaterThan(100);
      expect(overlap(shoes[shoe.index].translate([0, 0, .8]), panels[shoe.panelIndex]),
        `shoe ${shoe.index} uplift`).toBeGreaterThan(.1);
      const receivingWall = geo.union(parts.filter(part => {
        if (part.source.kind !== 'row-part' || part.source.rowIndex !== 1 || part.source.source.kind !== 'stack') return false;
        const source = part.source.source;
        return source.stackIndex === shoe.laneIndex && source.source.kind === 'lane'
          && source.source.plate?.startsWith(shoe.wallSide > 0 ? 'wall-left' : 'wall-right');
      }).map(part => part.mesh));
      expect(overlap(receivingWall.translate([0, 0, .8]), shoes[shoe.index]),
        `shoe ${shoe.index}/receiver uplift`).toBeGreaterThan(.1);
    }

    // Measure production voids inside the carrier: OVER below its bed face is
    // boolean overshoot, not a loss of printable host material.
    const options = lower.lanes[0].options, clearance = clearanceOf(options);
    const snap = endWallSnap(geo, { height: transition.carrierThickness, wall: options.wall, clearance });
    const carrierDepth = geo.box(2000, 2000, transition.carrierThickness, 0, 0, transition.carrierThickness / 2);
    const slots = transition.shoes.flatMap(shoe => shoe.tabPositions.map(position => {
      const turned = snap.slot.rotate([0, 0, -90]).translate([0, K.tabT - options.wall / 2, 0]);
      const placed = (shoe.wallSide > 0 ? turned : turned.mirror([0, 1, 0])).translate([position, shoe.y, 0]);
      return geo.isect(placed, carrierDepth);
    }));
    const channels = transition.seams.flatMap(seam => seam.keyPositions.map(position =>
      seamKeySocket(geo, options).rotate([0, 0, 90])
        .translate([position, seam.y, transition.carrierThickness / 2])));
    const ligaments: { width: number; material: Manifold }[] = [];
    for (const slot of slots) for (const channel of channels) {
      expect(overlap(slot, channel), 'shoe slot/key channel').toBeLessThan(1e-8);
      const slotBounds = slot.boundingBox(), channelBounds = channel.boundingBox();
      const separation = [0, 1, 2].map(axis => Math.max(0, channelBounds.min[axis] - slotBounds.max[axis],
        slotBounds.min[axis] - channelBounds.max[axis]));
      expect(Math.hypot(...separation), 'conservative slot/key host thickness').toBeGreaterThanOrEqual(K.ligMin - 1e-6);
      if (separation[0] <= 0 || separation[1] !== 0 || separation[2] !== 0) continue;
      const minimumX = Math.min(slotBounds.max[0], channelBounds.max[0]);
      const maximumX = Math.max(slotBounds.min[0], channelBounds.min[0]);
      const minimumY = Math.max(slotBounds.min[1], channelBounds.min[1]);
      const maximumY = Math.min(slotBounds.max[1], channelBounds.max[1]);
      const minimumZ = Math.max(slotBounds.min[2], channelBounds.min[2]);
      const maximumZ = Math.min(slotBounds.max[2], channelBounds.max[2]);
      ligaments.push({ width: separation[0], material: geo.box(maximumX - minimumX - .002,
        maximumY - minimumY - .002, maximumZ - minimumZ - .002,
        (minimumX + maximumX) / 2, (minimumY + maximumY) / 2, (minimumZ + maximumZ) / 2) });
    }
    expect(ligaments.length).toBeGreaterThan(0);
    const nearestLigament = Math.min(...ligaments.map(ligament => ligament.width));
    const carrier = geo.union(panels.map(panel => panel.translate([0, 0, -lower.height])));
    for (const ligament of ligaments.filter(candidate => candidate.width <= nearestLigament + 1e-6))
      expect(geo.diff(ligament.material, [carrier]).volume(), 'material between nearest slot/key voids').toBeLessThan(1e-8);

    const packed = packPlan(printables.map(part => ({ mesh: meshDataOf(part.name, part.mesh.getMesh()), qty: part.qty })),
      request.shared.bed, request.shared.bedMargin);
    expect(packed.placements.length).toBe(parts.length);
  }));
