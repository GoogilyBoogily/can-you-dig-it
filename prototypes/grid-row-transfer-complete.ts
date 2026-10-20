/** Complete, retained-wall 2-to-3 experiment. No production consumer imports it. */
import type { Manifold } from 'manifold-3d';
import type { Geo } from '../src/kernel';
import { DEFAULTS, K, type MixedBuildRequest, type Vec3 } from '../src/model';
import { resolveMixedBuild } from '../src/solver';
import { mixedAssemblyCans, mixedAssemblyPlacements, mixedPartManifest, type MixedPartSource } from '../src/assembly';
import { buildMixedGeometry } from '../src/mixed-geometry';
import { clearanceOf, coverThicknessOf, endWallSnap, pinSnap, placeSide,
  buildSeamKey, seamKeySocket, seamKeyBedOffset, seamKeyRadius } from '../src/features/joints';
import { coverPinSocket, sharedWallPinJoint } from '../src/features/shared-wall';
import { rowReceivingPinFeatures } from '../src/rows-geometry';
import { lay, stand, type Pose } from '../src/features/pose';

export interface CompleteTransferPart {
  name: string;
  kind: 'lower-row' | 'upper-row' | 'carrier' | 'shoe' | 'key';
  standing: Manifold;
  printable: Manifold;
  panelIndex?: number;
  wallIndex?: number;
  bay?: number;
  source?: MixedPartSource;
}

export const COMPLETE_TRANSFER = {
  depth: 279.4, carrierThickness: 8.1, shoeHeight: 6,
  lowerSupports: [-207, -40.5, 40.5, 207],
  lowerSides: [-1, 1, -1, 1],
  upperWalls: [-207, -75, -66, 66, 75, 207],
  upperSides: [-1, 1, -1, 1, -1, 1],
  outerCarrierMargin: 12,
} as const;

function box(geometry: Geo, minimumX: number, maximumX: number, minimumY: number,
  maximumY: number, minimumZ: number, maximumZ: number) {
  return geometry.box(maximumX - minimumX, maximumY - minimumY, maximumZ - minimumZ,
    (minimumX + maximumX) / 2, (minimumY + maximumY) / 2, (minimumZ + maximumZ) / 2);
}

export function completeTransferPrototype(geometry: Geo, fit: number) {
  if (![-.2, 0, .3].includes(fit)) throw new Error('Complete transfer prototype requires fit -0.2, 0 or 0.3');
  const shared = { ...DEFAULTS, fit, base: 'flat' as const, cascade: false, slope: 3,
    design: 'standard' as const, hexAuto: true, left: 'none' as const, right: 'none' as const };
  const request = (widths: number[], lower: boolean): MixedBuildRequest => ({ shared: {
    ...shared, cover: !lower, stackable: lower }, stacks: widths.map(canHeight => ({
      canDiameter: 66, canHeight, depth: COMPLETE_TRANSFER.depth, tiers: 1,
    })) });
  const lower = resolveMixedBuild({ w: 1000, d: 1000, h: 1000, front: 0 }, request([157, 157], true));
  const upper = resolveMixedBuild({ w: 1000, d: 1000, h: 1000, front: 0 }, request([122.5, 122.5, 122.5], false));
  lower.connections = []; // The real 75 mm lower gap has no old fixed-gap spline.
  lower.stacks.forEach((stack, index) => { stack.origin[1] = [-123.75, 123.75][index]; });
  upper.stacks.forEach((stack, index) => { stack.origin[1] = [-141, 0, 141][index]; });
  const lowerHeight = lower.stacks[0].derived.H;
  const carrierTop = lowerHeight + COMPLETE_TRANSFER.carrierThickness;
  const upperBase = carrierTop + COMPLETE_TRANSFER.shoeHeight;
  const parts: CompleteTransferPart[] = [];
  for (const [row, kind, height] of [[lower, 'lower-row', 0], [upper, 'upper-row', upperBase]] as const) {
    const meshes = new Map(buildMixedGeometry(geometry, row,
      kind === 'upper-row' ? rowReceivingPinFeatures(geometry, row.stacks[0].options) : undefined)
      .map(part => [part.name, part.mesh]));
    const sources = new Map(mixedPartManifest(row).map(part => [part.name, part.source]));
    let copy = 0;
    for (const placement of mixedAssemblyPlacements(row)) {
      const printable = meshes.get(placement.name);
      if (!printable) throw new Error(`Missing prototype row source ${placement.name}`);
      parts.push({ name: `${kind}-${placement.name}-copy-${copy++}`, kind,
        source: sources.get(placement.name), printable,
        standing: stand(printable, placement.pose).translate([0, 0, height]) });
    }
    if (copy !== mixedPartManifest(row).reduce((total, part) => total + part.qty, 0))
      throw new Error('Complete prototype row manifest copy mismatch');
  }
  const options = lower.stacks[0].options, clearance = clearanceOf(options);
  const lowerPins = lower.stacks[0].derived.pinPositions.map(position => position + COMPLETE_TRANSFER.depth / 2);
  const upperPins = upper.stacks[0].derived.pinPositions.map(position => position + COMPLETE_TRANSFER.depth / 2);
  const halfDepth = K.tabT / 2 + clearance;
  const catchHalfWidth = K.tabW / 2 + pinSnap(clearance).hook + clearance + K.ligMin;
  const shoeSnap = endWallSnap(geometry, { height: COMPLETE_TRANSFER.carrierThickness, wall: options.wall, clearance });
  const shoePin = sharedWallPinJoint(geometry, options);
  const socket = coverPinSocket(geometry, options);
  const panelRanges = [
    [-207 - COMPLETE_TRANSFER.outerCarrierMargin, -40.5], [-40.5, 40.5],
    [40.5, 207 + COMPLETE_TRANSFER.outerCarrierMargin],
  ];
  const xRanges = [[0, COMPLETE_TRANSFER.depth / 2], [COMPLETE_TRANSFER.depth / 2, COMPLETE_TRANSFER.depth]];
  const keyPositions = [[19.7, 114.7], [164.7, 259.7]];
  const shoeTabPositions = [[19.7, 104.7], [174.7, 259.7]];
  const panels: { index: number; bay: number; span: number; xRange: number[]; yRange: number[];
    supportIndices: number[]; ownedCatches: number[]; standing: Manifold }[] = [];
  const shoes: { index: number; bay: number; wallIndex: number; pin: number; tabs: number[];
    standing: Manifold; panelIndex: number }[] = [];
  const rotateSnap = (shape: Manifold, side: number, position: number, y: number) => {
    const turned = shape.rotate([0, 0, -90]);
    return (side > 0 ? turned : turned.mirror([0, 1, 0])).translate([position, y, lowerHeight]);
  };
  for (const [bay, xRange] of xRanges.entries()) {
    for (const [span, yRange] of panelRanges.entries()) {
      const index = bay * 3 + span, additions: Manifold[] = [], cuts: Manifold[] = [];
      const ownedCatches = span === 0 ? [0, 1] : span === 2 ? [2, 3] : [];
      // A complete catch belongs to an outside panel. Its small finger extends
      // beyond the lower-wall centreline; the central panel has matching relief.
      for (const seam of [-40.5, 40.5]) {
        const owner = seam < 0 ? 0 : 2;
        const side = seam < 0 ? 1 : -1;
        const fingerMinimum = seam - clearance - K.ligMin;
        const fingerMaximum = seam + clearance + K.ligMin;
        if (span === owner) additions.push(box(geometry, lowerPins[bay] - catchHalfWidth,
          lowerPins[bay] + catchHalfWidth, fingerMinimum, fingerMaximum, lowerHeight, carrierTop));
        if (span === 1) cuts.push(box(geometry, lowerPins[bay] - catchHalfWidth - clearance,
          lowerPins[bay] + catchHalfWidth + clearance,
          side > 0 ? seam - 1 : fingerMinimum - clearance,
          side > 0 ? fingerMaximum + clearance : seam + 1, lowerHeight - 1, carrierTop + 1));
      }
      for (const supportIndex of ownedCatches) cuts.push(placeSide(socket,
        COMPLETE_TRANSFER.lowerSides[supportIndex], lowerPins[bay], COMPLETE_TRANSFER.lowerSupports[supportIndex], lowerHeight));
      for (const seam of [-40.5, 40.5]) if (span === 1 || span === (seam < 0 ? 0 : 2))
        for (const position of keyPositions[bay]) cuts.push(seamKeySocket(geometry, options)
          .rotate([0, 0, 90]).translate([position, seam, lowerHeight + COMPLETE_TRANSFER.carrierThickness / 2]));
      for (const [wallIndex, y] of COMPLETE_TRANSFER.upperWalls.entries()) {
        const shoeSpan = y < -40.5 ? 0 : y > 40.5 ? 2 : 1;
        if (shoeSpan !== span) continue;
        const side = COMPLETE_TRANSFER.upperSides[wallIndex];
        for (const position of shoeTabPositions[bay]) cuts.push(rotateSnap(shoeSnap.slot, side, position, y));
      }
      const standing = geometry.assemble([box(geometry, xRange[0], xRange[1], yRange[0], yRange[1], lowerHeight, carrierTop), ...additions], cuts);
      panels.push({ index, bay, span, xRange, yRange, supportIndices: [span, span + 1], ownedCatches, standing });
      parts.push({ name: `carrier-bay-${bay}-span-${span}`, kind: 'carrier', panelIndex: index, bay,
        standing, printable: standing.translate([0, 0, -lowerHeight]) });
    }
    for (const seam of [-40.5, 40.5]) for (const position of keyPositions[bay]) {
      const printable = buildSeamKey(geometry, options);
      const standing = printable.translate([0, 0, -seamKeyBedOffset(options)])
        .rotate([0, 0, 90]).translate([position, seam, lowerHeight + COMPLETE_TRANSFER.carrierThickness / 2]);
      parts.push({ name: `carrier-key-${bay}-${seam}-${position}`, kind: 'key', bay, standing, printable });
    }
    for (const [wallIndex, y] of COMPLETE_TRANSFER.upperWalls.entries()) {
      const side = COMPLETE_TRANSFER.upperSides[wallIndex], index = bay * COMPLETE_TRANSFER.upperWalls.length + wallIndex;
      const pin = upperPins[bay], tabs = shoeTabPositions[bay], span = y < -40.5 ? 0 : y > 40.5 ? 2 : 1;
      const standing = geometry.assemble([
        box(geometry, xRange[0], xRange[1], y - options.wall / 2, y + options.wall / 2, carrierTop, upperBase),
        placeSide(shoePin.pin, side, pin, y, upperBase),
        ...tabs.map(position => rotateSnap(shoeSnap.tab, side, position, y)),
      ], [shoePin.relief.translate([pin, y, upperBase]),
        ...tabs.map(position => rotateSnap(shoeSnap.relief, side, position, y))]);
      const pose: Pose = { rotate: [90, 0, side > 0 ? 180 : 0], translate: [0, y - side * options.wall / 2, 0] };
      shoes.push({ index, bay, wallIndex, pin, tabs, standing, panelIndex: bay * 3 + span });
      parts.push({ name: `shoe-bay-${bay}-wall-${wallIndex}`, kind: 'shoe', wallIndex,
        panelIndex: bay * 3 + span, bay, standing, printable: lay(standing, pose) });
    }
  }
  const cans: { row: number; standing: Manifold; axial: number }[] = [];
  for (const [rowIndex, row, height] of [[0, lower, 0], [1, upper, upperBase]] as const)
    for (const placement of mixedAssemblyCans(row)) {
      const stack = row.stacks[placement.stackIndex];
      const cylinder = geometry.cyl(stack.options.canD / 2, stack.options.canL,
        0, 0, -stack.options.canL / 2, 64).rotate([90, 0, 0]);
      for (const axial of [-stack.options.clearance / 2, 0, stack.options.clearance / 2]) cans.push({
        row: rowIndex, axial, standing: stand(cylinder, placement.pose).translate([0, axial, height]),
      });
    }
  return { fit, parts, panels, shoes, cans, lower, upper, lowerHeight, carrierTop, upperBase,
    lowerPins, upperPins, xRanges, keyPositions, shoeTabPositions,
    carrierRoofSkin: COMPLETE_TRANSFER.carrierThickness - (pinSnap(clearance).tip + clearance + halfDepth),
    shoePinRootFloor: COMPLETE_TRANSFER.shoeHeight - (K.snapLen - pinSnap(clearance).peak),
    keyHostSkin: COMPLETE_TRANSFER.carrierThickness / 2 - seamKeyRadius,
    finishedHeight: upperBase + upper.stacks[0].derived.H + coverThicknessOf(options),
  };
}
