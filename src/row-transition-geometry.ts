// Compose only the explicit, already accepted row-transition physical sources.
import type { Manifold } from 'manifold-3d';
import type { Geo } from './kernel';
import { K, type Options } from './model';
import type { RowTransitionPlan } from './row-transitions';
import { clearanceOf, coverThicknessOf, endWallSnap, pinSnap, placeSide,
  seamKeySocket, buildSeamKey } from './features/joints';
import { coverPinSocket, sharedWallPinJoint } from './features/shared-wall';
import { lay } from './features/pose';

function box(geometry: Geo, minimumX: number, maximumX: number, minimumY: number,
  maximumY: number, minimumZ: number, maximumZ: number) {
  return geometry.box(maximumX - minimumX, maximumY - minimumY, maximumZ - minimumZ,
    (minimumX + maximumX) / 2, (minimumY + maximumY) / 2, (minimumZ + maximumZ) / 2);
}

export function buildRowTransitionPart(geometry: Geo, plan: RowTransitionPlan, partIndex: number,
  options: Options): Manifold {
  const part = plan.parts[partIndex];
  if (!part) throw new Error(`Missing row transition source ${plan.index + 1}/${partIndex + 1}`);
  const clearance = clearanceOf(options), thickness = plan.carrierThickness;
  if (part.kind === 'key') return buildSeamKey(geometry, options);
  const downwardSnap = endWallSnap(geometry, { height: thickness, wall: options.wall, clearance });
  const placeDownwardSnap = (shape: Manifold, side: number, position: number, y: number) => {
    // endWallSnap starts at X=0; after turning it spans Y=-tabT..0.
    // Align it with the same bed face as the wall pin for every wall thickness.
    const turned = shape.rotate([0, 0, -90]).translate([0, K.tabT - options.wall / 2, 0]);
    return (side > 0 ? turned : turned.mirror([0, 1, 0])).translate([position, y, 0]);
  };
  if (part.kind === 'shoe') {
    const shoe = plan.shoes[part.shoeIndex!];
    if (!shoe) throw new Error(`Missing planned row shoe ${part.shoeIndex}`);
    // The finite crest preserves the qualified return flank and flexure root;
    // incoming upper walls receive its matching raised chamber.
    const pin = sharedWallPinJoint(geometry, options), top = thickness + plan.shoeHeight;
    const standing = geometry.assemble([
      box(geometry, shoe.xRange[0], shoe.xRange[1], shoe.y - options.wall / 2,
        shoe.y + options.wall / 2, thickness, top),
      ...shoe.pinPositions.map(position => placeSide(pin.pin, shoe.wallSide, position, shoe.y, top)),
      ...shoe.tabPositions.map(position => placeDownwardSnap(downwardSnap.tab, shoe.wallSide, position, shoe.y)),
    ], [
      ...shoe.pinPositions.map(position => placeSide(pin.relief, shoe.wallSide, position, shoe.y, top)),
      ...shoe.tabPositions.map(position => placeDownwardSnap(downwardSnap.relief, shoe.wallSide, position, shoe.y)),
    ]);
    return lay(standing, { rotate: part.pose.rotate, translate: [0, part.pose.translate[1], 0] });
  }
  const panel = plan.panels[part.panelIndex!];
  if (!panel) throw new Error(`Missing planned carrier panel ${part.panelIndex}`);
  if (thickness < coverThicknessOf(options)) throw new Error('Carrier blind chamber lacks its required roof skin');
  const additions: Manifold[] = [], cuts: Manifold[] = [];
  const socket = coverPinSocket(geometry, options);
  const catchHalf = K.tabW / 2 + pinSnap(clearance).hook + clearance + K.ligMin;
  for (const seamIndex of panel.seamIndices) {
    const seam = plan.seams[seamIndex];
    const fingerMinimum = seam.y - clearance - K.ligMin, fingerMaximum = seam.y + clearance + K.ligMin;
    const support = seam.supportIndex === undefined ? undefined : plan.lowerSupports[seam.supportIndex];
    for (const position of support?.pinPositions.filter(position => position > panel.xRange[0] && position < panel.xRange[1]) ?? []) {
      if (seam.ownerPanelIndex === panel.index) additions.push(box(geometry, position - catchHalf,
        position + catchHalf, fingerMinimum, fingerMaximum, 0, thickness));
      else cuts.push(box(geometry, position - catchHalf - clearance, position + catchHalf + clearance,
        seam.ownerPanelIndex === seam.firstPanelIndex ? seam.y - 1 : fingerMinimum - clearance,
        seam.ownerPanelIndex === seam.firstPanelIndex ? fingerMaximum + clearance : seam.y + 1, -1, thickness + 1));
    }
    for (const position of seam.keyPositions) cuts.push(seamKeySocket(geometry, options)
      .rotate([0, 0, 90]).translate([position, seam.y, thickness / 2]));
  }
  for (const caught of panel.ownedCatches) {
    const support = plan.lowerSupports[caught.supportIndex];
    cuts.push(placeSide(socket, support.wallSide, caught.x, support.y, 0));
  }
  for (const shoeIndex of panel.shoeIndices) {
    const shoe = plan.shoes[shoeIndex];
    for (const position of shoe.tabPositions) cuts.push(placeDownwardSnap(downwardSnap.slot, shoe.wallSide, position, shoe.y));
  }
  return geometry.assemble([box(geometry, panel.xRange[0], panel.xRange[1], panel.yRange[0], panel.yRange[1], 0, thickness),
    ...additions], cuts);
}
