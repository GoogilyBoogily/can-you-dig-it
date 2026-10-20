/** Independent contact, mating and manufacturing measurements for the full specimen. */
import type { Manifold } from 'manifold-3d';
import type { Geo } from '../src/kernel';
import { K, type Vec3 } from '../src/model';
import { clearanceOf, pinSnap } from '../src/features/joints';
import { inspectMesh, meshDataOf, packPlan } from '../src/export';
import { overhangArea } from '../test/geo';
import { COMPLETE_TRANSFER, type CompleteTransferPart, type completeTransferPrototype } from './grid-row-transfer-complete';

function requireValue(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function overlap(geometry: Geo, first: Manifold, second: Manifold) {
  const left = first.boundingBox(), right = second.boundingBox();
  if (![0, 1, 2].every(axis => Math.min(left.max[axis], right.max[axis])
    - Math.max(left.min[axis], right.min[axis]) > 1e-6)) return 0;
  return Math.max(0, geometry.isect(first, second).volume());
}

function wallIndex(part: CompleteTransferPart) {
  const source = part.source;
  if (source?.kind !== 'stack' || source.source.kind !== 'lane'
    || !source.source.plate?.startsWith('wall-')) return undefined;
  return source.stackIndex * 2 + (source.source.plate.startsWith('wall-left') ? 1 : 0);
}

export function checkCompleteTransfer(geometry: Geo, specimen: ReturnType<typeof completeTransferPrototype>) {
  const options = specimen.lower.stacks[0].options, clearance = clearanceOf(options);
  const partChecks = specimen.parts.map(part => {
    const bodies = part.printable.decompose().length, unsupportedArea = overhangArea(part.printable);
    requireValue(part.printable.status() === 'NoError' && bodies === 1,
      `${part.name}: invalid solid or ${bodies} disconnected bodies`);
    requireValue(unsupportedArea < 1e-6, `${part.name}: unsupported area ${unsupportedArea}`);
    const bounds = part.printable.boundingBox();
    requireValue(Math.abs(bounds.min[2]) < 1e-6, `${part.name}: print does not start on bed`);
    const mesh = meshDataOf(part.name, part.printable.getMesh()), degenerateFacets = inspectMesh(mesh, true);
    return { name: part.name, kind: part.kind, bodies, unsupportedArea, degenerateFacets,
      volume: part.printable.volume(), bounds };
  });
  let maximumAssemblyOverlap = 0, assemblyPairs = 0;
  for (const [firstIndex, first] of specimen.parts.entries()) for (const second of specimen.parts.slice(firstIndex + 1)) {
    const volume = overlap(geometry, first.standing, second.standing);
    maximumAssemblyOverlap = Math.max(maximumAssemblyOverlap, volume); assemblyPairs++;
    requireValue(volume < 1e-5, `${first.name}/${second.name}: initial overlap ${volume}`);
  }
  let canChecks = 0;
  for (const can of specimen.cans) for (const part of specimen.parts) {
    const volume = overlap(geometry, can.standing, part.standing); canChecks++;
    requireValue(volume < 1e-5, `Row ${can.row + 1} can axial ${can.axial}/${part.name}: overlap ${volume}`);
  }
  const lowerWalls = COMPLETE_TRANSFER.lowerSupports.map((_, index) => geometry.union(specimen.parts
    .filter(part => part.kind === 'lower-row' && wallIndex(part) === index).map(part => part.standing)));
  const bodyClip = geometry.box(1000, 1000, 1000, 0, 0, specimen.lowerHeight - 500);
  const lowerBodies = lowerWalls.map(wall => geometry.isect(wall, bodyClip));
  const carrierMeasurements = specimen.panels.map(panel => {
    const bearings = panel.supportIndices.map(index => overlap(geometry,
      panel.standing.translate([0, 0, -.01]), lowerBodies[index]) / .01);
    requireValue(bearings.every(area => area > 100), `Panel ${panel.index}: missing two-sided direct bearing ${bearings}`);
    const fixed = geometry.union([...lowerWalls,
      ...specimen.parts.filter(part => part.kind === 'key').map(part => part.standing)]);
    const raisedObstruction = overlap(geometry, panel.standing.translate([0, 0, .8]), fixed);
    requireValue(raisedObstruction > .1, `Panel ${panel.index}: no uplift obstruction`);
    return { index: panel.index, bay: panel.bay, span: panel.span, supportIndices: panel.supportIndices,
      ownedCatches: panel.ownedCatches, bearings, raisedObstruction };
  });
  const footClip = geometry.box(1000, 1000, 1000, 0, 0, specimen.carrierTop + 500);
  const snap = pinSnap(clearance), socketHalf = K.tabW / 2 + snap.hook + clearance + K.ligMin;
  const shoeMeasurements = specimen.shoes.map(shoe => {
    const panel = specimen.panels[shoe.panelIndex].standing;
    const foot = geometry.isect(shoe.standing, footClip);
    const bearing = overlap(geometry, foot.translate([0, 0, -.01]), panel) / .01;
    // Deliberately exclude the entire lower blind-cavity projection. The shoe
    // must retain real solid compression shoulders on both X sides of it.
    const cavityProjection = geometry.box(2 * socketHalf, 1000, 1000,
      specimen.lowerPins[shoe.bay], 0, specimen.carrierTop);
    const shoulders = geometry.diff(foot, [cavityProjection]);
    const shoulderBearing = overlap(geometry, shoulders.translate([0, 0, -.01]), panel) / .01;
    const raisedObstruction = overlap(geometry, shoe.standing.translate([0, 0, .8]), panel);
    requireValue(bearing > 100 && shoulderBearing > 100, `Shoe ${shoe.index}: missing compression shoulders`);
    requireValue(raisedObstruction > .1, `Shoe ${shoe.index}: no lower snap uplift obstruction`);
    requireValue(shoe.standing.boundingBox().min[2] >= specimen.lowerHeight - 1e-6,
      `Shoe ${shoe.index}: retention tab enters lower can headroom`);
    const noFlex = geometry.diff(shoe.standing, shoe.tabs.map(position => geometry.box(30, 20, K.snapLen + 1e-5,
      position, COMPLETE_TRANSFER.upperWalls[shoe.wallIndex], specimen.lowerHeight + K.snapLen / 2)));
    for (const height of [.5, 1, 2, 4, 6, 8]) requireValue(overlap(geometry,
      noFlex.translate([0, 0, height]), panel) < 1e-5, `Shoe ${shoe.index}: rigid stem insertion obstruction at ${height}`);
    return { index: shoe.index, bay: shoe.bay, wallIndex: shoe.wallIndex, panelIndex: shoe.panelIndex,
      bearing, shoulderBearing, raisedObstruction };
  });
  const upperMeasurements = specimen.parts.filter(part => part.kind === 'upper-row').flatMap(part => {
    const source = part.source, index = wallIndex(part);
    const isDeck = source?.kind === 'stack' && source.source.kind === 'lane' && source.source.plate === 'deck';
    if (index === undefined && !isDeck) return [];
    const shoes = specimen.shoes.filter(shoe => index === undefined
      ? source?.kind === 'stack' && Math.floor(shoe.wallIndex / 2) === source.stackIndex : shoe.wallIndex === index);
    const support = geometry.union(shoes.map(shoe => shoe.standing));
    const bearing = overlap(geometry, part.standing.translate([0, 0, -.01]), support) / .01;
    requireValue(bearing > 20, `${part.name}: missing actual upper wall/deck compression bearing`);
    const raisedObstruction = index === undefined ? undefined : overlap(geometry, part.standing.translate([0, 0, .8]), support);
    if (raisedObstruction !== undefined) requireValue(raisedObstruction > .1, `${part.name}: upper pin does not retain wall`);
    return [{ name: part.name, wallIndex: index, bearing, raisedObstruction }];
  });
  requireValue(specimen.carrierRoofSkin >= .8, `Blind roof has only ${specimen.carrierRoofSkin} mm skin`);
  requireValue(specimen.shoePinRootFloor >= K.ligMin, `Shoe root has only ${specimen.shoePinRootFloor} mm ligament`);
  requireValue(specimen.keyHostSkin >= K.ligMin, 'Carrier key channel loses its host skins');
  const moving = geometry.union(specimen.parts.filter(part => part.kind === 'upper-row' || part.kind === 'shoe').map(part => part.standing));
  const fixed = geometry.union(specimen.parts.filter(part => part.kind !== 'upper-row' && part.kind !== 'shoe').map(part => part.standing));
  const rollMeasurements = [-207, 207].flatMap(pivotY => [-1, 1].map(direction => {
    const pivot: Vec3 = [COMPLETE_TRANSFER.depth / 2, pivotY, specimen.carrierTop];
    let firstObstruction: number | undefined, obstructionVolume = 0;
    for (const angle of [.25, .5, 1]) {
      const rotated = moving.translate(pivot.map(value => -value) as Vec3)
        .rotate([direction * angle, 0, 0]).translate(pivot);
      obstructionVolume = overlap(geometry, rotated, fixed);
      if (obstructionVolume > .1) { firstObstruction = angle; break; }
    }
    requireValue(firstObstruction !== undefined, `Upper assembly can roll ${direction} around Y=${pivotY} without obstruction`);
    return { pivotY, direction, firstObstruction, obstructionVolume };
  }));
  const centralPeel = specimen.panels.filter(panel => panel.span === 1).flatMap(panel => [-1, 1].map(direction => {
    const pivot: Vec3 = [(panel.xRange[0] + panel.xRange[1]) / 2, direction > 0 ? -40.5 : 40.5, specimen.lowerHeight];
    const rotated = panel.standing.translate(pivot.map(value => -value) as Vec3).rotate([direction * .25, 0, 0]).translate(pivot);
    const keys = geometry.union(specimen.parts.filter(part => part.kind === 'key' && part.bay === panel.bay).map(part => part.standing));
    const obstruction = overlap(geometry, rotated, keys);
    requireValue(obstruction > .01, `Central panel ${panel.index}: key does not block peel ${direction}`);
    return { panelIndex: panel.index, direction, angle: .25, obstruction };
  }));
  const maximumY = Math.max(...specimen.parts.map(part => part.standing.boundingBox().max[1]));
  const minimumY = Math.min(...specimen.parts.map(part => part.standing.boundingBox().min[1]));
  const width = maximumY - minimumY;
  requireValue(Math.abs(width - 438) < 1e-6 && width + 8 <= 457.2, `Actual width ${width} does not fit shelf`);
  requireValue(specimen.finishedHeight <= 241 && COMPLETE_TRANSFER.depth <= 279.4, 'Actual complete specimen exceeds shelf');
  const packed = packPlan(specimen.parts.map(part => ({ mesh: meshDataOf(part.name, part.printable.getMesh()), qty: 1 })), options.bed, options.bedMargin);
  requireValue(packed.placements.length === specimen.parts.length, 'Printed copy count differs from assembly');
  return { fit: specimen.fit, width, shelfWidthRequired: width + 8, finishedHeight: specimen.finishedHeight,
    transitionHeight: COMPLETE_TRANSFER.carrierThickness + COMPLETE_TRANSFER.shoeHeight,
    carrierRoofSkin: specimen.carrierRoofSkin, shoePinRootFloor: specimen.shoePinRootFloor,
    keyHostSkin: specimen.keyHostSkin, maximumAssemblyOverlap, assemblyPairs, canChecks,
    lowerCans: specimen.lower.cans, upperCans: specimen.upper.cans,
    carrierMeasurements, shoeMeasurements, upperMeasurements, rollMeasurements, centralPeel,
    partChecks, packedCopies: packed.placements.length, plates: 1 + Math.max(...packed.placements.map(placement => placement.plate)) };
}
