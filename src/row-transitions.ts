// Kernel-free support plans. Every accepted transition names its physical hosts.
import { K, type Options, type Vec3 } from './model';
import type { Pose } from './features/pose';
import type { ResolvedIndependentRow } from './rows';
import { clearanceOf, coverThicknessOf, pinSnap, seamKeyBedOffset, seamKeyHalfLength,
  seamKeyRadius } from './features/joints';
import { sharedWallSnapTop } from './features/shared-wall';

export interface RowLowerSupport {
  index: number;
  laneIndex: number;
  wallSide: number;
  y: number;
  pinPositions: number[];
}
export interface RowCarrierPanelPlan {
  index: number;
  bay: number;
  xRange: [number, number];
  yRange: [number, number];
  lowerSupportIndices: [number, number];
  ownedCatches: { supportIndex: number; x: number }[];
  seamIndices: number[];
  shoeIndices: number[];
}
export interface RowTransferSeamPlan {
  index: number;
  kind: 'bearing' | 'gap';
  bay: number;
  y: number;
  supportIndex?: number;
  firstPanelIndex: number;
  secondPanelIndex: number;
  ownerPanelIndex?: number;
  keyPositions: number[];
}
export interface RowShoePlan {
  index: number;
  bay: number;
  laneIndex: number;
  wallSide: number;
  panelIndex: number;
  xRange: [number, number];
  y: number;
  pinPositions: number[];
  tabPositions: number[];
}
export interface RowTransitionPartPlan {
  name: string;
  kind: 'carrier' | 'shoe' | 'key';
  pose: Pose;
  push: Vec3;
  panelIndex?: number;
  shoeIndex?: number;
  seamIndex?: number;
  keyPosition?: number;
}
export interface RowTransitionPlan {
  index: number;
  lowerRowIndex: number;
  upperRowIndex: number;
  carrierThickness: number;
  shoeHeight: number;
  bounds: [number, number, number, number, number, number];
  lowerSupports: RowLowerSupport[];
  panels: RowCarrierPanelPlan[];
  seams: RowTransferSeamPlan[];
  shoes: RowShoePlan[];
  parts: RowTransitionPartPlan[];
}

const EPSILON = 1e-8;
const CARRIER_THICKNESS = 8.1;
const SHOE_HEIGHT = 6;
const OUTER_MARGIN = 12;
const MAXIMUM_BEARING_SPAN = 200;

function sameNumbers(first: readonly number[], second: readonly number[]) {
  return first.length === second.length && first.every((number, index) => Math.abs(number - second[index]) <= EPSILON);
}

/** Same two rectangular print orientations and exclusion margins as packPlan. */
function rectangleFits(options: Options, minimumX: number, maximumX: number,
  minimumY: number, maximumY: number, height: number) {
  const margin = options.bedMargin, exclusions = options.bedKeepOut ?? [];
  if (Math.max(height, Math.fround(height)) > options.bed[2] - margin + EPSILON) return false;
  const along = Math.max(maximumX - minimumX, Math.fround(maximumX) - Math.fround(minimumX));
  const across = Math.max(maximumY - minimumY, Math.fround(maximumY) - Math.fround(minimumY));
  return [[along, across], [across, along]].some(([width, depth]) =>
    [margin, ...exclusions.map(rectangle => rectangle[2] + margin)].some(x =>
      [margin, ...exclusions.map(rectangle => rectangle[3] + margin)].some(y =>
        x + width <= options.bed[0] - margin + EPSILON && y + depth <= options.bed[1] - margin + EPSILON
        && exclusions.every(([left, bottom, right, top]) => x + width <= left - margin + EPSILON
          || x >= right + margin - EPSILON || y + depth <= bottom - margin + EPSILON || y >= top + margin - EPSILON))));
}

/** Coordinates are local to lower.origin; the upper Z origin is deliberately ignored. */
export function planIndependentRowTransition(lower: ResolvedIndependentRow, upper: ResolvedIndependentRow,
  index: number): RowTransitionPlan {
  const rowLabels = [lower, upper].map(row =>
    `Row ${row.requestIndex + 1}${row.request.repeat > 1 ? `, copy ${row.repeatIndex + 1} of ${row.request.repeat}` : ""}`);
  const label = `Levels ${lower.index + 1} → ${upper.index + 1} (${rowLabels.join(" → ")})`;
  const fail = (reason: string): never => { throw new Error(`${label}: ${reason}`); };
  const options = lower.lanes[0].options, clearance = clearanceOf(options), wall = options.wall;
  const slotHalfWidth = K.tabW / 2 + clearance + K.snapFlare;
  const depth = lower.lanes[0].derived.L;
  if (lower.layout.boundaries?.some(boundary => boundary.kind === 'shared')
    || upper.layout.boundaries?.some(boundary => boundary.kind === 'shared'))
    fail('carrier and shoe interfaces currently require separate walls');
  if ([...lower.lanes, ...upper.lanes].some(lane => Math.abs(lane.derived.L - depth) > EPSILON))
    fail('different row depths need a separately proven transfer; preserve a common depth for this carrier');
  if ([...lower.lanes, ...upper.lanes].some(lane => lane.options.wall !== wall || lane.options.fit !== options.fit))
    fail('carrier joints require matching wall thickness and fit');
  const seams = lower.lanes[0].derived.seams;
  if (seams.length > 1 || (seams.length === 1 && Math.abs(seams[0]) > EPSILON)
    || [...lower.lanes, ...upper.lanes].some(lane => !sameNumbers(lane.derived.seams, seams)))
    fail('carrier supports currently require matching whole or two-section lane plans');
  if (coverThicknessOf(options) > CARRIER_THICKNESS + EPSILON)
    fail('the selected fit needs more blind-catch roof thickness than the qualified carrier');
  if (SHOE_HEIGHT - (K.snapLen - pinSnap(clearance).peak) < K.ligMin - EPSILON)
    fail('the shoe pin root would lose its minimum ligament');
  const lowerSupports: RowLowerSupport[] = lower.lanes.flatMap(lane => [-1, 1].map(wallSide => ({
    index: lane.index * 2 + (wallSide > 0 ? 1 : 0), laneIndex: lane.index, wallSide,
    y: lane.origin[1] + wallSide * lane.derived.py,
    pinPositions: lane.derived.pinPositions.map(position => position + lane.origin[0]),
  }))).sort((first, second) => first.y - second.y);
  if (lowerSupports.some((support, supportIndex) => support.index !== supportIndex))
    fail('lower wall order does not match the retained row');
  for (let supportIndex = 1; supportIndex < lowerSupports.length; supportIndex++) {
    const span = lowerSupports[supportIndex].y - lowerSupports[supportIndex - 1].y;
    if (span > MAXIMUM_BEARING_SPAN + EPSILON) fail(`lower support span ${span.toFixed(1)} mm exceeds the proven 200 mm carrier span`);
  }
  const compactGaps = lower.lanes.slice(1).map((_, laneIndex) => Math.abs(
    lowerSupports[laneIndex * 2 + 2].y - lowerSupports[laneIndex * 2 + 1].y - wall - K.gangGap) <= EPSILON);
  const segments: { yRange: [number, number]; supports: [number, number] }[] = [];
  for (let laneIndex = 0; laneIndex < lower.lanes.length; laneIndex++) {
    const first = laneIndex * 2, second = first + 1;
    segments.push({ yRange: [laneIndex === 0 ? lowerSupports[first].y - OUTER_MARGIN
      : compactGaps[laneIndex - 1] ? (lowerSupports[first - 1].y + lowerSupports[first].y) / 2 : lowerSupports[first].y,
    laneIndex === lower.lanes.length - 1 ? lowerSupports[second].y + OUTER_MARGIN
      : compactGaps[laneIndex] ? (lowerSupports[second].y + lowerSupports[second + 1].y) / 2 : lowerSupports[second].y],
    supports: [first, second] });
    if (laneIndex < lower.lanes.length - 1 && !compactGaps[laneIndex]) {
      const span = lowerSupports[second + 1].y - lowerSupports[second].y;
      if (span < 2 * (seamKeyHalfLength + clearance) + K.ligMin - EPSILON)
        fail(`the ${span.toFixed(1)} mm separated lower-wall gap cannot retain independent carrier keys`);
      segments.push({ yRange: [lowerSupports[second].y, lowerSupports[second + 1].y], supports: [second, second + 1] });
    }
  }
  const ends = [0, ...seams.map(seam => seam + depth / 2), depth];
  const panels: RowCarrierPanelPlan[] = [], transferSeams: RowTransferSeamPlan[] = [], shoes: RowShoePlan[] = [];
  const parts: RowTransitionPartPlan[] = [];
  const endOffset = K.earW / 2 + K.ligMin + wall;
  const innerOffset = 2 * K.tabW + K.post;
  const carrierMinimumY = lowerSupports[0].y - OUTER_MARGIN;
  const carrierMaximumY = lowerSupports.at(-1)!.y + OUTER_MARGIN;
  for (let bay = 0; bay < ends.length - 1; bay++) {
    const xRange: [number, number] = [ends[bay], ends[bay + 1]];
    const tabPositions = [xRange[0] + (bay === 0 ? endOffset : innerOffset),
      xRange[1] - (bay === ends.length - 2 ? endOffset : innerOffset)];
    const keyPositions = [xRange[0] + (bay === 0 ? endOffset : 25),
      xRange[1] - (bay === ends.length - 2 ? endOffset : 25)];
    if (tabPositions[1] - tabPositions[0] < 2 * (K.tabW / 2 + K.snapT) + K.ligMin - EPSILON)
      fail('the printable X bay has no two separated shoe snap roots');
    for (const [span, segment] of segments.entries()) {
      const panelIndex = panels.length;
      const yRange = segment.yRange;
      const ownedCatches = segment.supports.flatMap(supportIndex => {
        const support = lowerSupports[supportIndex];
        const laneSegment = Math.floor(segment.supports[0] / 2) === Math.floor(segment.supports[1] / 2);
        return laneSegment ? support.pinPositions.filter(position => position > xRange[0] && position < xRange[1])
          .map(x => ({ supportIndex, x })) : [];
      });
      const panel = { index: panelIndex, bay, xRange, yRange, lowerSupportIndices: segment.supports,
        ownedCatches, seamIndices: [] as number[], shoeIndices: [] as number[] };
      panels.push(panel);
      parts.push({ name: `carrier-${panelIndex + 1}`, kind: 'carrier', panelIndex,
        pose: { rotate: [0, 0, 0], translate: [0, 0, lower.height] }, push: [0, (span - (lowerSupports.length - 2) / 2) * 28, 28] });
    }
    for (let boundaryIndex = 0; boundaryIndex < segments.length - 1; boundaryIndex++) {
      const firstPanelIndex = bay * segments.length + boundaryIndex;
      const secondPanelIndex = firstPanelIndex + 1;
      const firstSupport = segments[boundaryIndex].supports[1], secondSupport = segments[boundaryIndex + 1].supports[0];
      const bearing = firstSupport === secondSupport, support = lowerSupports[firstSupport];
      let seamKeys = keyPositions;
      if (!bearing) {
        const protectedPositions = [...tabPositions, ...lowerSupports.flatMap(support => support.pinPositions)
          .filter(position => position > xRange[0] && position < xRange[1])];
        const halfWidth = Math.max(slotHalfWidth,
          K.tabW / 2 + Math.max(K.snapT, pinSnap(clearance).hook + clearance));
        const candidates: number[] = [];
        for (let position = Math.ceil((xRange[0] + seamKeyRadius + K.ligMin) * 10) / 10;
          position <= xRange[1] - seamKeyRadius - K.ligMin + EPSILON; position = Math.round((position + .1) * 10) / 10)
          if (protectedPositions.every(protectedPosition => Math.abs(position - protectedPosition)
            >= halfWidth + seamKeyRadius + K.ligMin - EPSILON)) candidates.push(position);
        if (candidates.length < 2) fail('the compact-gap carrier seam has no key sites clear of catch and shoe roots');
        const nearest = (target: number) => candidates.reduce((selected, candidate) =>
          Math.abs(candidate - target) < Math.abs(selected - target) ? candidate : selected);
        seamKeys = [nearest((xRange[0] + xRange[1]) / 2), nearest(bay === 0 ? xRange[1] - 10 : xRange[0] + 10)].sort((first, second) => first - second);
        if (seamKeys[1] - seamKeys[0] < 2 * seamKeyRadius + K.ligMin - EPSILON)
          fail('the compact-gap seam cannot fit two independent retaining keys');
      }
      const seam: RowTransferSeamPlan = { index: transferSeams.length, kind: bearing ? 'bearing' : 'gap', bay,
        y: segments[boundaryIndex].yRange[1], ...(bearing ? { supportIndex: firstSupport,
          ownerPanelIndex: support.wallSide > 0 ? firstPanelIndex : secondPanelIndex } : {}),
        firstPanelIndex, secondPanelIndex, keyPositions: seamKeys };
      transferSeams.push(seam); panels[firstPanelIndex].seamIndices.push(seam.index); panels[secondPanelIndex].seamIndices.push(seam.index);
      for (const keyPosition of seamKeys) parts.push({ name: `carrier-key-${seam.index + 1}-${keyPosition}`,
        kind: 'key', seamIndex: seam.index, keyPosition,
        pose: { rotate: [0, 0, 90], translate: [keyPosition, seam.y, lower.height + CARRIER_THICKNESS / 2 - seamKeyBedOffset(options)] },
        push: [0, 0, 56] });
    }
    for (const lane of upper.lanes) for (const wallSide of [-1, 1]) {
      const y = upper.origin[1] - lower.origin[1] + lane.origin[1] + wallSide * lane.derived.py;
      const panel = panels.find(candidate => candidate.bay === bay
        && y - wall / 2 >= candidate.yRange[0] - EPSILON && y + wall / 2 <= candidate.yRange[1] + EPSILON);
      if (!panel) return fail('an upper wall shoe falls outside a supported panel or across an unqualified carrier seam');
      const [firstSupport, secondSupport] = panel.lowerSupportIndices.map(supportIndex => lowerSupports[supportIndex]);
      if (y - wall / 2 < firstSupport.y - wall / 2 - EPSILON
        || y + wall / 2 > secondSupport.y + wall / 2 + EPSILON)
        fail('an upper wall shoe overhangs its lower bearing supports; the carrier edge frame is not a qualified cantilever');
      const slotMinimumY = y + (wallSide > 0 ? -wall / 2 : wall / 2 - K.tabT) - clearance;
      const slotMaximumY = y + (wallSide > 0 ? -wall / 2 + K.tabT : wall / 2) + clearance;
      if (slotMinimumY < panel.yRange[0] + K.ligMin - EPSILON
        || slotMaximumY > panel.yRange[1] - K.ligMin + EPSILON)
        fail('an upper shoe slot would lose its closed carrier edge rail');
      // Protect the complete grown slot, including its lower flare, from every
      // hidden key channel. A seated key can otherwise enter an open slot while
      // the shoe and key solids themselves remain collision-free.
      for (const seamIndex of panel.seamIndices) {
        const seam = transferSeams[seamIndex];
        const keyMinimumY = seam.y - seamKeyHalfLength - clearance;
        const keyMaximumY = seam.y + seamKeyHalfLength + clearance;
        if (slotMinimumY >= keyMaximumY + K.ligMin - EPSILON
          || slotMaximumY <= keyMinimumY - K.ligMin + EPSILON) continue;
        if (tabPositions.some(position => seam.keyPositions.some(keyPosition =>
          Math.abs(position - keyPosition) < slotHalfWidth + seamKeyRadius + K.ligMin - EPSILON)))
          fail('an upper shoe slot would remove the ligament around a carrier seam key channel');
      }
      const pinPositions = lane.derived.pinPositions.map(position => position + lane.origin[0])
        .filter(position => position > xRange[0] && position < xRange[1]);
      if (pinPositions.length === 0) fail('an upper wall section has no receiving pin for its retained shoe');
      const snapHalf = K.tabW / 2 + K.snapT;
      const catchHalf = K.tabW / 2 + pinSnap(clearance).hook + clearance;
      const pinHalf = K.tabW / 2 + Math.max(K.snapT, K.snapCatch + 2 * clearance);
      if (tabPositions.some(position => [...pinPositions, ...lowerSupports.flatMap(support => support.pinPositions)]
        .some(pin => Math.abs(position - pin) < snapHalf + Math.max(catchHalf, pinHalf) + K.ligMin - EPSILON)))
        fail('shoe snap stems conflict with an upper pin root or lower carrier catch');
      const shoe: RowShoePlan = { index: shoes.length, bay, laneIndex: lane.index, wallSide,
        panelIndex: panel.index, xRange, y, pinPositions, tabPositions };
      shoes.push(shoe); panel.shoeIndices.push(shoe.index);
      parts.push({ name: `shoe-${shoe.index + 1}`, kind: 'shoe', shoeIndex: shoe.index,
        pose: { rotate: [90, 0, wallSide > 0 ? 180 : 0], translate: [0, y - wallSide * wall / 2, lower.height] },
        push: [0, 0, 42] });
    }
  }
  const fingerExtension = clearance + K.ligMin;
  for (const panel of panels) {
    const ownedSeams = panel.seamIndices.map(seamIndex => transferSeams[seamIndex])
      .filter(seam => seam.ownerPanelIndex === panel.index);
    const minimumY = Math.min(panel.yRange[0], ...ownedSeams.map(seam => seam.y - fingerExtension));
    const maximumY = Math.max(panel.yRange[1], ...ownedSeams.map(seam => seam.y + fingerExtension));
    if (!rectangleFits(options, panel.xRange[0], panel.xRange[1], minimumY, maximumY, CARRIER_THICKNESS))
      fail('a complete carrier panel with its caught fingers does not fit the printer and keep-outs');
    for (const supportIndex of panel.lowerSupportIndices) if (!lowerSupports[supportIndex].pinPositions
      .some(position => position > panel.xRange[0] && position < panel.xRange[1]))
      fail('a carrier X bay lacks a caught lower support');
  }
  for (const shoe of shoes) if (!rectangleFits(options, shoe.xRange[0], shoe.xRange[1],
    0, CARRIER_THICKNESS + SHOE_HEIGHT + sharedWallSnapTop(options), wall)) fail('a retained wall shoe does not fit the printer');
  if (CARRIER_THICKNESS / 2 - seamKeyRadius < K.ligMin - EPSILON) fail('carrier key channels remove their host skins');
  return { index, lowerRowIndex: lower.index, upperRowIndex: upper.index,
    carrierThickness: CARRIER_THICKNESS, shoeHeight: SHOE_HEIGHT,
    bounds: [0, carrierMinimumY, lower.height, depth, carrierMaximumY,
      lower.height + CARRIER_THICKNESS + SHOE_HEIGHT + sharedWallSnapTop(options)],
    lowerSupports, panels, seams: transferSeams, shoes, parts };
}
