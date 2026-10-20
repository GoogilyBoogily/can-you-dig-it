// Bounded joint/cut co-planning for flat lanes with two printable sections.
// All coordinates and difference constraints use integer 0.1 mm grid units.
import { K, type ResolvedMixedStack } from "./model";
import type { Lane } from "./geometry";
import { clearanceOf, seamKeyFrameHalfWidth } from "./features/joints";
import { sharedCoverFingerHalfWidth } from "./features/shared-wall";

type SiteKind = "primary-ear" | "follower-ear" | "primary-pin" | "follower-pin";
interface Site { kind: SiteKind; position: number; halfWidth: number }
interface Difference { from: number; to: number; distance: number }
const EPSILON = 1e-8;
const gridCeiling = (value: number) => Math.ceil(value * 10 - EPSILON);
const gridFloor = (value: number) => Math.floor(value * 10 + EPSILON);
// Production-derived digital baselines; these are not physical strength ratings.
export const MAXIMUM_QUALIFIED_BEARING_INTERVAL = 126;
export const MAXIMUM_QUALIFIED_UNSUPPORTED_END = 92;

export function bearingLimitsFor(lane: Lane, length: number) {
  const originalTabs = [...lane.tabs].sort((first, second) => first - second);
  return {
    maximumInterval: Math.max(MAXIMUM_QUALIFIED_BEARING_INTERVAL,
      ...originalTabs.slice(1).map((position, index) => position - originalTabs[index])),
    maximumEnd: Math.max(MAXIMUM_QUALIFIED_UNSUPPORTED_END, originalTabs[0] - lane.xd, length / 2 - originalTabs.at(-1)!),
  };
}

function permutations(values: SiteKind[]): SiteKind[][] {
  if (!values.length) return [[]];
  return values.flatMap((value, index) => values.indexOf(value) !== index ? []
    : permutations(values.filter((_, other) => other !== index)).map(rest => [value, ...rest]));
}

const REQUIRED_SITES: SiteKind[] = ["primary-ear", "follower-ear", "primary-pin", "follower-pin"];
// One bearing per owner per section, optionally one additional bearing. The extra
// bearing can bridge an otherwise excessive owner span without weakening its limit.
const SECTION_ORDERS = [undefined, "primary-ear", "follower-ear"].map(extra =>
  permutations(extra ? [...REQUIRED_SITES, extra as SiteKind] : REQUIRED_SITES));
const ORDER_PAIRS = [
  ...SECTION_ORDERS[0].flatMap(first => SECTION_ORDERS[0].map(second => [first, second])),
  ...[1, 2].flatMap(extra => [
    ...SECTION_ORDERS[extra].flatMap(first => SECTION_ORDERS[0].map(second => [first, second])),
    ...SECTION_ORDERS[0].flatMap(first => SECTION_ORDERS[extra].map(second => [first, second])),
  ]),
];

/** Find the earliest grid positions satisfying x[to] >= x[from] + distance.
 * Backward edges impose maximum bearing intervals. Relaxation also detects an
 * inconsistent cycle; rejecting it is a normal infeasible planning candidate. */
function positionsFor(minimum: number[], maximum: number[], constraints: Difference[]): number[] | undefined {
  for (let iteration = 0; iteration < minimum.length; iteration++) {
    let changed = false;
    for (const { from, to, distance } of constraints) if (minimum[to] < minimum[from] + distance) {
      minimum[to] = minimum[from] + distance;
      changed = true;
    }
    if (minimum.some((position, index) => position > maximum[index])) return undefined;
    if (!changed) return minimum;
  }
  return undefined;
}

function solveOrder(stack: ResolvedMixedStack, lane: Lane, orders: SiteKind[][],
  seamRange: readonly [number, number], maximumInterval: number, maximumEnd: number) {
  const { options, derived } = stack, clearance = clearanceOf(options);
  const halfWidth = (kind: SiteKind) => kind.endsWith("ear") ? K.earW / 2 + clearance
    : sharedCoverFingerHalfWidth(options) + clearance;
  const kinds = orders.flat(), seamIndex = kinds.length, sectionBreak = orders[0].length;
  const minimum = new Array<number>(kinds.length + 1), maximum = new Array<number>(kinds.length + 1);
  const constraints: Difference[] = [];
  const frame = seamKeyFrameHalfWidth(options);
  const pinRoot = K.tabW / 2 + Math.max(K.snapT, K.snapCatch + 2 * clearance) + K.ligMin;
  const hasEndWall = !options.rearLoad || options.tiers > 1;
  for (const [index, kind] of kinds.entries()) {
    const half = halfWidth(kind), ear = kind.endsWith("ear");
    minimum[index] = gridCeiling(Math.max(-derived.L / 2 + K.border + half,
      ear ? lane.xd + K.earW / 2 + 1 : -Infinity));
    maximum[index] = gridFloor(Math.min(derived.L / 2 - K.border - half,
      ear ? lane.xe - K.earW / 2 - 3 : hasEndWall ? lane.xe - clearance - pinRoot : Infinity));
    constraints.push(index < sectionBreak
      ? { from: index, to: seamIndex, distance: gridCeiling(frame + half) }
      : { from: seamIndex, to: index, distance: gridCeiling(frame + half) });
    if (index && index !== sectionBreak) constraints.push({ from: index - 1, to: index,
      distance: gridCeiling(halfWidth(kinds[index - 1]) + half + K.ligMin) });
  }
  minimum[seamIndex] = gridCeiling(seamRange[0]);
  maximum[seamIndex] = gridFloor(seamRange[1]);
  for (const owner of ["primary-ear", "follower-ear"] as const) {
    const bearings = kinds.flatMap((kind, index) => kind === owner ? [index] : []);
    const first = bearings[0], last = bearings.at(-1)!;
    maximum[first] = Math.min(maximum[first], gridFloor(lane.xd + maximumEnd));
    minimum[last] = Math.max(minimum[last], gridCeiling(derived.L / 2 - maximumEnd));
    for (let index = 1; index < bearings.length; index++) constraints.push({
      from: bearings[index], to: bearings[index - 1], distance: -gridFloor(maximumInterval) });
  }
  const positions = positionsFor(minimum, maximum, constraints);
  if (!positions) return undefined;
  const sites = kinds.map((kind, index) => ({ kind, position: positions[index] / 10, halfWidth: halfWidth(kind) }));
  const ears = sites.filter(site => site.kind.endsWith("ear"));
  return { seam: positions[seamIndex] / 10, sites: {
    pins: sites.filter(site => site.kind.endsWith("pin")),
    ears: Array.from({ length: options.tiers }, () => ears),
  } };
}

/** This bounded search is not an impossibility proof. It enumerates every site
 * ordering in its supported families, solving cuts and sites together. Successful
 * legacy plans never enter here. Baseline limits come from the ORIGINAL lane. */
export function* jointSitePlans(stack: ResolvedMixedStack, originalLane: Lane,
  seamRanges: readonly (readonly [number, number])[]) {
  if (stack.options.cascade || stack.derived.seams.length !== 1 || !seamRanges.length) return;
  const { maximumInterval, maximumEnd } = bearingLimitsFor(originalLane, stack.derived.L);
  const maximumRadius = Math.max(...seamRanges.flatMap(range => range.map(Math.abs)));
  const radii = [0];
  for (let radius = 1; radius < maximumRadius; radius *= 2) radii.push(radius);
  if (maximumRadius > 0) radii.push(maximumRadius);
  const emitted = new Set<string>();
  for (const radius of radii) for (const range of seamRanges) {
    const clipped: [number, number] = [Math.max(range[0], -radius), Math.min(range[1], radius)];
    if (clipped[0] > clipped[1]) continue;
    for (const orders of ORDER_PAIRS) {
      const plan = solveOrder(stack, originalLane, orders, clipped, maximumInterval, maximumEnd);
      if (!plan) continue;
      const identity = JSON.stringify(plan);
      if (emitted.has(identity)) continue;
      emitted.add(identity);
      yield plan;
    }
  }
}
