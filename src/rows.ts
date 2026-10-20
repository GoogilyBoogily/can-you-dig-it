// Pure independent-row resolution. All physical transition supports are planned
// before the complete footprint is accepted; no row is a viewer-only offset.
import { DEFAULTS, DESIGNS, PATTERNS, K, type Options, type Vec3,
  type IndependentLaneRequest, type IndependentRowRequest, type IndependentRowsBuildRequest,
  type MixedBoundaryPlan, type MixedBuildRequest, type ResolvedMixedStack } from "./model";
import { solve, check, laneOf } from "./geometry";
import { coverThicknessOf, snapTop } from "./features/joints";
import { SHARED_WALL_PIN_CREST } from "./features/shared-wall";
import { MIXED_CONNECTION } from "./features/mixed-connection";
import { planSharedAssembly, planSharedWalls } from "./shared-walls";
import { mixedConnections } from "./layout";
import { independentRowsFrom, readNumbers } from "./validate";
import { planIndependentRowTransition, type RowTransitionPlan } from "./row-transitions";
import type { MixedLayout, Space } from "./solver";

export interface ResolvedIndependentLane extends ResolvedMixedStack {
  request: IndependentLaneRequest;
  naturalHeight: number;
  heightPadding: number;
}

export interface ResolvedIndependentRow {
  index: number;
  requestIndex: number;
  repeatIndex: number;
  request: IndependentRowRequest;
  origin: Vec3;
  height: number;
  minimumHeight: number;
  span: number;
  gaps: number[];
  lanes: ResolvedIndependentLane[];
  layout: MixedLayout;
}

export interface IndependentRowsLayout {
  mode: "rows";
  request: IndependentRowsBuildRequest;
  rows: ResolvedIndependentRow[];
  transitions: RowTransitionPlan[];
  footprint: [number, number, number];
  cans: number;
  warnings: string[];
}

const EPSILON = 1e-8;
const SIDE_CLEARANCE = 4;
const CARRIER_SHARING_REASON = "Carrier and shoe interfaces currently require separate walls";

function rowLevelLabel(index: number, requestIndex: number, repeatIndex: number, repeat: number): string {
  return `Level ${index + 1} (Row ${requestIndex + 1}${repeat > 1 ? `, copy ${repeatIndex + 1} of ${repeat}` : ""})`;
}

function validatedRequest(request: IndependentRowsBuildRequest): IndependentRowsBuildRequest {
  if (!request || typeof request !== "object") throw new Error("Independent rows need a build request");
  if (typeof request.shareCompatibleWalls !== "boolean" || typeof request.topCover !== "boolean")
    throw new Error("Independent row wall sharing and top cover must be true or false");
  const rows = independentRowsFrom(request.rows), shared = request.shared;
  if (!shared || shared.base !== "flat") throw new Error("Independent rows currently require a flat base");
  if (!Array.isArray(shared.bed) || shared.bed.length !== 3)
    throw new Error("Independent rows need three printer dimensions");
  readNumbers({ fit: shared.fit, hexR: shared.hexR,
    bedX: shared.bed[0], bedY: shared.bed[1], bedZ: shared.bed[2] });
  if (!Number.isFinite(shared.wall) || shared.wall < MIXED_CONNECTION.radius + MIXED_CONNECTION.inset + K.ligMin)
    throw new Error("Independent rows require walls at least 5.75 mm thick");
  if (!Number.isFinite(shared.clearance) || shared.clearance < 0)
    throw new Error("Can clearance must be finite and nonnegative");
  if (!Number.isFinite(shared.bedMargin) || shared.bedMargin < 0)
    throw new Error("Printer margin must be finite and nonnegative");
  if (!DESIGNS.includes(shared.design) || !PATTERNS.includes(shared.pattern))
    throw new Error("Independent rows need a supported design and pattern");
  if (typeof shared.hexAuto !== "boolean" || typeof shared.solid !== "boolean")
    throw new Error("Automatic pattern sizing and solid walls must be true or false");
  if (shared.bedKeepOut !== undefined && (!Array.isArray(shared.bedKeepOut)
    || shared.bedKeepOut.some(rectangle => !Array.isArray(rectangle) || rectangle.length !== 4
      || !rectangle.every(Number.isFinite) || rectangle[2] < rectangle[0] || rectangle[3] < rectangle[1])))
    throw new Error("Independent rows have an invalid printer keep-out rectangle");
  return { rows, shareCompatibleWalls: request.shareCompatibleWalls, topCover: request.topCover,
    shared: { ...shared, bed: [...shared.bed],
      ...(shared.bedKeepOut ? { bedKeepOut: shared.bedKeepOut.map(rectangle => [...rectangle] as [number, number, number, number]) } : {}) } };
}

function laneOptions(request: IndependentRowsBuildRequest, row: IndependentRowRequest,
  lane: IndependentLaneRequest, finalRow: boolean): Options {
  return { ...DEFAULTS, ...request.shared, canD: lane.canDiameter, canL: lane.canHeight,
    length: lane.depth, slope: lane.slope, lipGap: lane.lipGap, tiers: 1, lanesWide: 1,
    cascade: false, rearLoad: row.rearLoad, cover: finalRow && request.topCover,
    stackable: !finalRow, left: "none", right: "none", base: "flat" };
}

function mixedRequest(lanes: ResolvedIndependentLane[], shareCompatibleWalls: boolean): MixedBuildRequest {
  const { canD, canL, length, tiers, lanesWide, left, right, base, magnets, across, along, shelfCells, ...shared } = lanes[0].options;
  return { shared: { ...shared, base: "flat" }, shareCompatibleWalls,
    stacks: lanes.map(lane => ({ ...lane.request, tiers: 1, cascade: false,
      rearLoad: lane.options.rearLoad, cover: lane.options.cover, stackable: lane.options.stackable })) };
}

function retainedBoundaries(lanes: ResolvedIndependentLane[], reason: string): MixedBoundaryPlan[] {
  return lanes.slice(1).map((lane, index) => ({ kind: "retained", firstStackIndex: index,
    secondStackIndex: lane.index, reason }));
}

function resolveRow(space: Space, request: IndependentRowsBuildRequest, rowRequest: IndependentRowRequest,
  requestIndex: number, repeatIndex: number, index: number, expandedCount: number): ResolvedIndependentRow {
  const label = rowLevelLabel(index, requestIndex, repeatIndex, rowRequest.repeat);
  const finalRow = index === expandedCount - 1;
  const natural = rowRequest.lanes.map(lane => {
    const options = laneOptions(request, rowRequest, lane, finalRow);
    return { options, derived: solve(options) };
  });
  const minimumHeight = Math.max(...natural.map(lane => lane.derived.H));
  const height = rowRequest.rowHeight === "auto" ? minimumHeight : rowRequest.rowHeight;
  if (height < minimumHeight - EPSILON)
    throw new Error(`${label}: row height ${height} mm is below the required ${minimumHeight} mm`);
  const depth = rowRequest.lanes[0].depth;
  if (rowRequest.lanes.some(lane => Math.abs(lane.depth - depth) > EPSILON))
    throw new Error(`${label}: different lane depths need a separate carrier plan; keep a common depth within this row`);
  if (depth > space.d - space.front)
    throw new Error(`${label}: exact depth ${depth} mm exceeds the shelf depth after the front gap`);
  const warnings: string[] = [];
  let lanes: ResolvedIndependentLane[] = natural.map((lane, laneIndex) => {
    const derived = height === lane.derived.H ? lane.derived : solve(lane.options, height);
    const checks = check(lane.options, derived), failures = checks.filter(warning => warning.startsWith("FAIL"));
    if (failures.length) throw new Error(`${label}, lane ${laneIndex + 1}: ${failures.join("; ")}`);
    warnings.push(...checks.map(warning => `Lane ${laneIndex + 1}: ${warning}`));
    return { index: laneIndex, request: rowRequest.lanes[laneIndex], options: lane.options, derived,
      origin: [derived.L / 2, 0, 0], naturalHeight: lane.derived.H,
      heightPadding: height - lane.derived.H, cans: derived.n,
      height: height + (lane.options.cover ? coverThicknessOf(lane.options)
        : lane.options.stackable ? snapTop(lane.options) : 0) };
  });
  const unsharedWidth = lanes.reduce((width, lane) => width + lane.derived.OW, 0) + (lanes.length - 1) * K.gangGap;
  const separated = rowRequest.rowSpan !== "auto" && rowRequest.rowSpan >= unsharedWidth - EPSILON;
  const manufacturing = request.shareCompatibleWalls && expandedCount === 1 && !separated ? planSharedAssembly(lanes, space.h) : undefined;
  if (manufacturing) lanes = manufacturing.stacks;
  let boundaries: MixedBoundaryPlan[] = manufacturing?.boundaries ?? (request.shareCompatibleWalls
    ? planSharedWalls(lanes, lanes.map(lane => [laneOf(lane.options, lane.derived, "top")]), space.h)
    : retainedBoundaries(lanes, "Wall sharing is off"));
  if (expandedCount > 1) boundaries = boundaries.map(boundary => boundary.kind === "shared"
    ? { kind: "retained", firstStackIndex: boundary.firstStackIndex,
      secondStackIndex: boundary.secondStackIndex, reason: CARRIER_SHARING_REASON } : boundary);
  const compactWidth = () => lanes.reduce((width, lane) => width + lane.derived.OW, 0)
    + boundaries.reduce((width, boundary) => width + (boundary.kind === "shared" ? -request.shared.wall : K.gangGap), 0);
  let span = compactWidth();
  let gaps = boundaries.map(boundary => boundary.kind === "shared" ? -request.shared.wall : K.gangGap);
  if (rowRequest.rowSpan !== "auto") {
    span = rowRequest.rowSpan;
    if (lanes.length === 1) {
      if (span < lanes[0].derived.OW - EPSILON)
        throw new Error(`${label}: row span ${span} mm is smaller than its ${lanes[0].derived.OW} mm lane`);
    } else if (span >= unsharedWidth - EPSILON) {
      const gap = (span - lanes.reduce((width, lane) => width + lane.derived.OW, 0)) / (lanes.length - 1);
      gaps = boundaries.map(() => gap);
      boundaries = retainedBoundaries(lanes, "An explicit separated lane gap keeps both walls");
    } else if (Math.abs(span - compactWidth()) > EPSILON) {
      throw new Error(`${label}: row span ${span} mm needs either the ${compactWidth().toFixed(1)} mm compact plan or at least ${unsharedWidth.toFixed(1)} mm for separated lanes`);
    }
  }
  if (expandedCount === 1 && gaps.some(gap => gap > K.gangGap + EPSILON))
    throw new Error(`${label}: separated lanes need a real carrier tying the row together`);
  for (let laneIndex = 1; laneIndex < lanes.length; laneIndex++) lanes[laneIndex].origin[1] = lanes[laneIndex - 1].origin[1]
    + (lanes[laneIndex - 1].derived.OW + lanes[laneIndex].derived.OW) / 2 + gaps[laneIndex - 1];
  const minimumY = -lanes[0].derived.OW / 2;
  const maximumY = lanes.at(-1)!.origin[1] + lanes.at(-1)!.derived.OW / 2;
  const centre = (minimumY + maximumY) / 2;
  for (const lane of lanes) {
    lane.origin[1] -= centre;
    if (boundaries.some(boundary => boundary.kind === "shared"
      && (boundary.firstStackIndex === lane.index || boundary.secondStackIndex === lane.index))
      && (lane.options.cover || lane.options.stackable)) lane.height += SHARED_WALL_PIN_CREST;
  }
  const connections = gaps.flatMap((gap, boundaryIndex) => {
    if (Math.abs(gap - K.gangGap) > EPSILON) return [];
    return mixedConnections([lanes[boundaryIndex], lanes[boundaryIndex + 1]])
      .map(connection => ({ ...connection, firstStackIndex: boundaryIndex, secondStackIndex: boundaryIndex + 1 }));
  });
  if (request.shareCompatibleWalls) warnings.push(...boundaries.filter(boundary => boundary.kind === "retained")
    .map(boundary => `Lanes ${boundary.firstStackIndex + 1} and ${boundary.secondStackIndex + 1} retain both walls: ${boundary.reason}`));
  const layout: MixedLayout = { mode: "mixed", request: mixedRequest(lanes, request.shareCompatibleWalls), stacks: lanes,
    boundaries, connections, cans: lanes.reduce((count, lane) => count + lane.cans, 0),
    footprint: [maximumY - minimumY, depth, Math.max(...lanes.map(lane => lane.height))], warnings };
  return { index, requestIndex, repeatIndex, request: rowRequest, origin: [0, 0, 0],
    height, minimumHeight, span, gaps, lanes, layout };
}

/** Resolve the complete explicit request without dropping, resizing or auto-filling rows. */
export function resolveIndependentRows(space: Space, input: IndependentRowsBuildRequest): IndependentRowsLayout {
  readNumbers({ w: space.w, d: space.d, h: space.h, front: space.front });
  const request = validatedRequest(input);
  const expandedCount = request.rows.reduce((count, row) => count + row.repeat, 0);
  const rows: ResolvedIndependentRow[] = [];
  for (const [requestIndex, row] of request.rows.entries()) for (let repeatIndex = 0; repeatIndex < row.repeat; repeatIndex++)
    rows.push(resolveRow(space, request, row, requestIndex, repeatIndex, rows.length, expandedCount));
  const maximumSpan = Math.max(...rows.map(row => row.span));
  for (const row of rows) row.origin[1] = row.request.alignment === "left" ? (maximumSpan - row.span) / 2
    : row.request.alignment === "right" ? -(maximumSpan - row.span) / 2 : 0;
  const transitions: RowTransitionPlan[] = [];
  for (let index = 1; index < rows.length; index++) {
    const lower = rows[index - 1], upper = rows[index];
    const transition = planIndependentRowTransition(lower, upper, index - 1);
    transitions.push(transition);
    upper.origin[2] = lower.origin[2] + lower.height + transition.carrierThickness + transition.shoeHeight;
  }
  const minimumBounds: Vec3 = [0, -maximumSpan / 2, 0];
  const maximumBounds: Vec3 = [Math.max(...rows.map(row => row.layout.footprint[1])), maximumSpan / 2,
    Math.max(...rows.map(row => row.origin[2] + row.layout.footprint[2]))];
  for (const transition of transitions) {
    const lower = rows[transition.lowerRowIndex];
    for (const axis of [0, 1, 2]) {
      minimumBounds[axis] = Math.min(minimumBounds[axis], lower.origin[axis] + transition.bounds[axis]);
      maximumBounds[axis] = Math.max(maximumBounds[axis], lower.origin[axis] + transition.bounds[axis + 3]);
    }
  }
  const footprint: [number, number, number] = [maximumBounds[1] - minimumBounds[1], maximumBounds[0] - minimumBounds[0], maximumBounds[2] - minimumBounds[2]];
  const warnings = rows.flatMap(row => row.layout.warnings.map(warning =>
    `${rowLevelLabel(row.index, row.requestIndex, row.repeatIndex, row.request.repeat)}: ${warning}`));
  if (footprint[0] + 2 * SIDE_CLEARANCE > space.w + EPSILON) {
    const sharingReasons = request.shareCompatibleWalls ? rows.flatMap(row => row.layout.boundaries
      ?.filter(boundary => boundary.kind === "retained")
      .map(boundary => `${rowLevelLabel(row.index, row.requestIndex, row.repeatIndex, row.request.repeat)}, lanes ${boundary.firstStackIndex + 1} and ${boundary.secondStackIndex + 1}: ${boundary.reason}`) ?? []) : [];
    throw new Error(`All rows and carrier supports need ${(footprint[0] + 2 * SIDE_CLEARANCE).toFixed(1)} mm of shelf width including side clearance${sharingReasons.length ? `. Wall sharing: ${sharingReasons.join("; ")}` : ""}`);
  }
  if (footprint[1] > space.d - space.front + EPSILON)
    throw new Error(`Rows and carrier supports need ${footprint[1].toFixed(1)} mm of shelf depth after the front gap`);
  if (footprint[2] > space.h + EPSILON)
    throw new Error(`All ${rows.length} rows and their carrier supports need ${footprint[2].toFixed(1)} mm of shelf height`);
  return { mode: "rows", request, rows, transitions, footprint,
    cans: rows.reduce((count, row) => count + row.layout.cans, 0), warnings };
}
