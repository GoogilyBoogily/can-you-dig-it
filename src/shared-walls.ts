// Pure sharing decisions. Mechanical sites are planned before shelf width is charged.
import { K, type MixedBoundaryPlan, type ResolvedMixedStack, type SharedWallTierSchedule } from "./model";
import { check, laneOf, sharedPrintSeamRanges, solve, type Lane } from "./geometry";
import { tierRole } from "./layout";
import { bearingLimitsFor, jointSitePlans, MAXIMUM_QUALIFIED_BEARING_INTERVAL, MAXIMUM_QUALIFIED_UNSUPPORTED_END } from "./shared-joint-planner";
import { clearanceOf, seamKeyFrameHalfWidth, coverSeamPositions, seamKeyRadius } from "./features/joints";
import { sharedCoverFingerHalfWidth, sharedWallCollarExtension, sharedWallCoverThickness, sharedWallSnapTop, SHARED_WALL_PIN_CREST } from "./features/shared-wall";

const EPSILON = 1e-8;
const PLANNING_GRID = .1;
export const SHARED_JOINT_SEARCH_FAILURE = "No safe planned bearing and cover-catch schedule was found within the planner's supported print-split search";
interface PinDistribution { fractions: readonly [number, number]; adjacentEars: boolean; qualifiedBearingTargets?: boolean }
const PIN_DISTRIBUTIONS: readonly PinDistribution[] = [
  {fractions:[.25,.75],adjacentEars:false}, {fractions:[0,1],adjacentEars:true},
  {fractions:[.1,.6],adjacentEars:false}, {fractions:[.4,.9],adjacentEars:false},
  {fractions:[.2,.8],adjacentEars:false}, {fractions:[.15,.85],adjacentEars:false},
  {fractions:[0,1],adjacentEars:true,qualifiedBearingTargets:true},
];
const equal = (first: number, second: number) => Math.abs(first - second) <= EPSILON;
const sameNumbers = (first: readonly number[], second: readonly number[]) => first.length === second.length && first.every((value, index) => equal(value, second[index]));
const worldSign = (stack: ResolvedMixedStack, tier: number) => stack.options.cascade && tier % 2 === 1 ? -1 : 1;
const elevation = (stack: ResolvedMixedStack, tier: number) => stack.options.cascade
  ? tier === 0 ? 0 : stack.derived.Hb + (tier - 1) * stack.derived.H : tier * stack.derived.H;

/** A rigid rectangle must fit one allowed orientation, including margin/exclusions. */
function rectangleFits(stack: ResolvedMixedStack, minimum: number, maximum: number, width: number, height: number, transverseMinimum = -width) {
  const options = stack.options, margin = options.bedMargin;
  const length = Math.max(maximum - minimum, Math.fround(maximum) - Math.fround(minimum));
  width = Math.max(width, Math.fround(transverseMinimum + width) - Math.fround(transverseMinimum));
  if (Math.max(height, Math.fround(height)) > options.bed[2] - margin + EPSILON) return false;
  const exclusions = options.bedKeepOut ?? [];
  return [[length, width], [width, length]].some(([along, across]) => {
    const startsX = [margin, ...exclusions.map(rectangle => rectangle[2] + margin)];
    const startsY = [margin, ...exclusions.map(rectangle => rectangle[3] + margin)];
    return startsX.some(x => startsY.some(y => x + along <= options.bed[0] - margin + EPSILON
      && y + across <= options.bed[1] - margin + EPSILON
      && exclusions.every(([left, bottom, right, top]) => x + along <= left - margin + EPSILON
        || x >= right + margin - EPSILON || y + across <= bottom - margin + EPSILON || y >= top + margin - EPSILON)));
  });
}

function incompatibility(first: ResolvedMixedStack, second: ResolvedMixedStack, lanes: readonly Lane[][], shelfHeight: number): string | undefined {
  const firstOptions = first.options, secondOptions = second.options;
  if (!equal(first.derived.L, second.derived.L)) return "Different exact depths";
  if (firstOptions.tiers !== secondOptions.tiers) return "Different tier counts";
  if (firstOptions.cascade !== secondOptions.cascade) return "Different feeding styles";
  if (!equal(firstOptions.slope, secondOptions.slope)) return "Different deck slopes";
  if (!equal(firstOptions.lipGap, secondOptions.lipGap)) return "Different lip headroom";
  for (const setting of ["cover", "rearLoad", "stackable"] as const)
    if (firstOptions[setting] !== secondOptions[setting]) return `Different ${setting === "rearLoad" ? "rear-loading" : setting === "stackable" ? "stackable-top" : "cover"} settings`;
  if (!["wall", "fit", "clearance"].every(setting => equal(firstOptions[setting as "wall"], secondOptions[setting as "wall"]))) return "Different wall or clearance settings";
  if (secondOptions.cover && second.derived.seams.length) {
    const keyDistanceFromEdge = second.derived.OW / 2 - Math.abs(coverSeamPositions(second.derived.OW)[0]);
    const remainingFrame = keyDistanceFromEdge - seamKeyRadius - secondOptions.wall - clearanceOf(secondOptions);
    if (remainingFrame < K.ligMin - EPSILON) return "Shared cover would remove the seam-key support ligament";
  }
  const firstLanes = lanes[first.index], secondLanes = lanes[second.index];
  for (let tier = 0; tier < firstOptions.tiers; tier++) {
    if (!equal(elevation(first, tier), elevation(second, tier))) return "Different tier elevations";
    for (const dimension of ["xd", "xe", "dhi", "te", "H", "ewh", "lapZ", "lipx"] as const)
      if (!equal(firstLanes[tier][dimension], secondLanes[tier][dimension])) return "Different wall attachment geometry";
    if (!sameNumbers(firstLanes[tier].tabs, secondLanes[tier].tabs)) return "Different deck support plans";
  }
  if (firstOptions.cover && firstOptions.cascade && !equal(firstOptions.canD, secondOptions.canD)) return "Different cover loading windows";
  if (!sameNumbers(first.derived.seams, second.derived.seams) || !sameNumbers(first.derived.pinPositions, second.derived.pinPositions)) return "Different printable section or pin plans";
  const extra = firstOptions.cover || firstOptions.stackable ? SHARED_WALL_PIN_CREST : 0;
  if (Math.max(first.height, second.height) + extra > shelfHeight + EPSILON) return "Shared pin and cover headroom exceeds the shelf height";
  return undefined;
}

type SiteKind = "primary-ear" | "follower-ear" | "primary-pin" | "follower-pin";
interface Site { kind: SiteKind; position: number; halfWidth: number }

function allocateSites(first: ResolvedMixedStack, lanes: readonly Lane[], distribution: PinDistribution): { pins: Site[]; ears: Site[][] } | undefined {
  const options = first.options, derived = first.derived, clearance = clearanceOf(options);
  const earHalf = K.earW / 2 + clearance;
  const pinHalf = sharedCoverFingerHalfWidth(options) + clearance;
  const frame = seamKeyFrameHalfWidth(options);
  const ends = [-derived.L / 2, ...derived.seams, derived.L / 2];
  if (distribution.qualifiedBearingTargets && ends.length !== 3) return undefined;
  const pins: Site[] = [], ears: Site[][] = [];
  const uniqueTiers = new Map<string,number>();
  const representativeTiers = lanes.map((lane,tier) => {
    const identity = JSON.stringify([worldSign(first,tier),lane]);
    const representative = uniqueTiers.get(identity) ?? tier;
    if (!uniqueTiers.has(identity)) uniqueTiers.set(identity,tier);
    ears.push(representative < tier ? ears[representative] : []);
    return representative;
  });
  const topSign = worldSign(first, options.tiers - 1), topLane = lanes.at(-1)!;
  const windowMinimum = topSign > 0 ? topLane.xe - options.canD - 8 : -topLane.xe;
  const windowMaximum = topSign > 0 ? topLane.xe : -topLane.xe + options.canD + 8;
  const clearOf = (position: number, halfWidth: number, sites: Site[]) => sites.every(site =>
    Math.abs(position - site.position) >= halfWidth + site.halfWidth + K.ligMin - EPSILON);
  for (let section = 0; section < ends.length - 1; section++) {
    const sectionMinimum = ends[section] + (section ? frame : K.border);
    const sectionMaximum = ends[section + 1] - (section < ends.length - 2 ? frame : K.border);
    const pinCandidates = (follower: boolean) => {
      const candidates: number[] = [];
      for (let position = Math.ceil((sectionMinimum + pinHalf) * 10) / 10;
        position <= sectionMaximum - pinHalf + EPSILON; position = Math.round((position + PLANNING_GRID) * 10) / 10) {
        if (!clearOf(position, pinHalf, pins)) continue;
        const pinRootHalfWidth = K.tabW / 2 + Math.max(K.snapT, K.snapCatch + 2 * clearance) + K.ligMin;
        if ([...uniqueTiers.values()].some(tier => {
          if (options.rearLoad && tier === options.tiers - 1) return false;
          const sign = worldSign(first,tier), lane = lanes[tier];
          const firstEnd = sign * lane.xe, secondEnd = sign * (lane.xe + options.wall);
          const minimum = Math.min(firstEnd,secondEnd) - clearance;
          const maximum = Math.max(firstEnd,secondEnd) + clearance;
          return position + pinRootHalfWidth > minimum - EPSILON && position - pinRootHalfWidth < maximum + EPSILON;
        })) continue;
        if (follower && options.cover && options.cascade && position + pinHalf > windowMinimum - K.ligMin
          && position - pinHalf < windowMaximum + K.ligMin) continue;
        candidates.push(position);
      }
      return candidates;
    };
    const primaryCandidates = pinCandidates(false), followerCandidates = pinCandidates(true);
    const adjacentEars = distribution.adjacentEars;
    const pinSpacing = (adjacentEars ? 2 * pinHalf + 4 * earHalf + 3 * K.ligMin : 2 * pinHalf + K.ligMin)
      + (distribution.qualifiedBearingTargets ? 2 * K.ligMin : 0);
    const primaryTarget = adjacentEars
      ? section === 0 ? sectionMaximum - pinHalf - pinSpacing : sectionMinimum + pinHalf
      : sectionMinimum + (sectionMaximum - sectionMinimum) * distribution.fractions[0];
    const followerTarget = adjacentEars ? primaryTarget + pinSpacing
      : sectionMinimum + (sectionMaximum - sectionMinimum) * distribution.fractions[1];
    let pair: [number, number] | undefined, score = Infinity;
    for (const primary of primaryCandidates) {
      let lower = 0, upper = followerCandidates.length;
      while (lower < upper) {
        const middle = Math.floor((lower + upper) / 2);
        if (followerCandidates[middle] < Math.max(primary + pinSpacing, followerTarget)) lower = middle + 1;
        else upper = middle;
      }
      for (const index of [lower - 1, lower]) {
        const follower = followerCandidates[index];
        if (follower === undefined || follower - primary < pinSpacing - EPSILON) continue;
        const candidateScore = Math.abs(primary - primaryTarget) + Math.abs(follower - followerTarget);
        if (candidateScore < score) { pair = [primary, follower]; score = candidateScore; }
      }
    }
    if (!pair) return undefined;
    pins.push({kind: "primary-pin", position: pair[0], halfWidth: pinHalf},
      {kind: "follower-pin", position: pair[1], halfWidth: pinHalf});
    for (const [tier, lane] of lanes.entries()) {
      if (representativeTiers[tier] !== tier) continue;
      const sign = worldSign(first, tier);
      const localMinimum = lane.xd + K.earW / 2 + 1, localMaximum = lane.xe - K.earW / 2 - 3;
      const minimum = Math.max(sectionMinimum + earHalf, sign > 0 ? localMinimum : -localMaximum);
      const maximum = Math.min(sectionMaximum - earHalf, sign > 0 ? localMaximum : -localMinimum);
      const runMinimum = sign > 0 ? lane.xd : -derived.L / 2;
      const runMaximum = sign > 0 ? derived.L / 2 : -lane.xd;
      const bearingSpacing = 2 * earHalf + K.ligMin;
      const bearingTarget = section === 0
        ? Math.floor((runMinimum + MAXIMUM_QUALIFIED_UNSUPPORTED_END) * 10 + EPSILON) / 10
        : Math.ceil((runMaximum - MAXIMUM_QUALIFIED_UNSUPPORTED_END) * 10 - EPSILON) / 10;
      // End-to-end ownership gives both decks a bearing in every section. A whole
      // lane gets two spaced bearings for each deck rather than one cantilever.
      // The final fallback reserves room around the qualified end spans instead
      // of greedily using the first free ear site and then failing span repair.
      const order: [SiteKind, number][] = distribution.qualifiedBearingTargets
        ? [["primary-ear", Math.max(minimum, Math.min(maximum, bearingTarget - (section === 0 ? bearingSpacing : 0)))],
          ["follower-ear", Math.max(minimum, Math.min(maximum, bearingTarget + (section === 0 ? 0 : bearingSpacing)))]]
        : ends.length === 2
        ? [["primary-ear", minimum + options.wall + K.post], ["follower-ear", maximum],
          ["follower-ear", Math.max(minimum + (maximum - minimum) / 3, maximum - MAXIMUM_QUALIFIED_BEARING_INTERVAL)],
          ["primary-ear", Math.min(minimum + 2 * (maximum - minimum) / 3, minimum + options.wall + K.post + MAXIMUM_QUALIFIED_BEARING_INTERVAL)]]
        : [["primary-ear", minimum], ["follower-ear", maximum]];
      for (const [kind, target] of order) {
        let selected: number | undefined, distance = Infinity;
        for (let position = Math.ceil(minimum * 10) / 10; position <= maximum + EPSILON;
          position = Math.round((position + PLANNING_GRID) * 10) / 10) {
          if (!clearOf(position, earHalf, pins) || !clearOf(position, earHalf, ears[tier])) continue;
          if (Math.abs(position - target) < distance) { selected = position; distance = Math.abs(position - target); }
        }
        if (selected === undefined) return undefined;
        ears[tier].push({ kind, position: selected, halfWidth: earHalf });
      }
    }
  }
  // The digital specimen bounded an owner's unsupported ends by 92 mm and
  // bearing intervals by 126 mm. Preserve any stricter existing span only where
  // space permits; never permit a worse span than both measured baselines.
  for (const [tier, lane] of lanes.entries()) {
    if (representativeTiers[tier] !== tier) continue;
    const sign = worldSign(first, tier);
    const runMinimum = sign > 0 ? lane.xd : -derived.L / 2;
    const runMaximum = sign > 0 ? derived.L / 2 : -lane.xd;
    const { maximumInterval, maximumEnd } = bearingLimitsFor(lane, derived.L);
    for (const owner of ["primary-ear", "follower-ear"] as const) {
      for (;;) {
        const owned = ears[tier].filter(site => site.kind === owner).map(site => site.position).sort((first, second) => first - second);
        let gap: [number, number, number] | undefined;
        if (owned[0] - runMinimum > maximumEnd + EPSILON) gap = [runMinimum, owned[0], runMinimum + 13];
        else if (runMaximum - owned.at(-1)! > maximumEnd + EPSILON) gap = [owned.at(-1)!, runMaximum, runMaximum - 15];
        else for (let index = 1; index < owned.length; index++) if (owned[index] - owned[index - 1] > maximumInterval + EPSILON) {
          gap = [owned[index - 1], owned[index], (owned[index - 1] + owned[index]) / 2]; break;
        }
        if (!gap) break;
        const localMinimum = lane.xd + 13, localMaximum = lane.xe - 15;
        const minimum = Math.max(gap[0], sign > 0 ? localMinimum : -localMaximum);
        const maximum = Math.min(gap[1], sign > 0 ? localMaximum : -localMinimum);
        let selected: number | undefined, distance = Infinity;
        for (let position = Math.ceil(minimum * 10) / 10; position <= maximum + EPSILON;
          position = Math.round((position + PLANNING_GRID) * 10) / 10) {
          if (!clearOf(position, earHalf, pins) || !clearOf(position, earHalf, ears[tier])) continue;
          if (derived.seams.some(seam => Math.abs(position - seam) < frame + earHalf - EPSILON)) continue;
          if (Math.abs(position - gap[2]) < distance) { selected = position; distance = Math.abs(position - gap[2]); }
        }
        if (selected === undefined) return undefined;
        ears[tier].push({kind: owner, position: selected, halfWidth: earHalf});
      }
    }
  }
  return { pins, ears };
}

function printableReason(stack: ResolvedMixedStack, lanes: readonly Lane[], follower: boolean): string | undefined {
  const { options, derived } = stack;
  const ends = [-derived.L / 2, ...derived.seams, derived.L / 2];
  for (let section = 0; section < ends.length - 1; section++) {
    const minimum = ends[section], maximum = ends[section + 1];
    const deckMinimum = minimum - (section ? K.spliceDepth : 0);
    // Only the follower protrudes. If this primary also follows an earlier
    // shared boundary, that boundary checks its collar in the follower role.
    const collar = follower ? sharedWallCollarExtension(options) : 0;
    const width = derived.OW + collar;
    if (!rectangleFits(stack, deckMinimum, maximum, width, derived.plateZ, -derived.OW / 2 - collar)) return "Adapted deck envelope does not fit the printer";
    if (options.cover && !rectangleFits(stack, minimum, maximum, width, sharedWallCoverThickness(options), -derived.OW / 2 - collar)) return "Shared cover envelope does not fit the printer";
    for (const lane of lanes) if (!rectangleFits(stack, minimum, maximum, lane.H + sharedWallSnapTop(options), options.wall)) return "Shared divider envelope does not fit the printer";
  }
  return undefined;
}

/** Resolve complete boundaries; a failure retains both original walls and settings. */
export function planSharedWalls(stacks: readonly ResolvedMixedStack[], lanes: readonly Lane[][], shelfHeight: number): MixedBoundaryPlan[] {
  return planBoundaries(stacks, lanes, shelfHeight);
}

function planBoundaries(stacks: readonly ResolvedMixedStack[], lanes: readonly Lane[][], shelfHeight: number,
  plannedSites = new Map<number, NonNullable<ReturnType<typeof allocateSites>>>()): MixedBoundaryPlan[] {
  const allocations = new Map<string,ReturnType<typeof allocateSites>>();
  return stacks.slice(1).map((second, index) => {
    const first = stacks[index];
    let reason = incompatibility(first, second, lanes, shelfHeight);
    if (!reason) reason = printableReason(first, lanes[first.index], false) ?? printableReason(second, lanes[second.index], true);
    // A small fixed family of longitudinal distributions handles interleaved
    // short sections and wider sections without recursive or exhaustive searches.
    const identity = JSON.stringify([first.options,first.derived,lanes[first.index]]);
    let sites = plannedSites.get(first.index) ?? allocations.get(identity);
    if (!reason && !sites && !allocations.has(identity)) {
      for (const distribution of PIN_DISTRIBUTIONS) {
        sites = allocateSites(first,lanes[first.index],distribution);
        if (sites) break;
      }
      allocations.set(identity,sites);
    }
    if (!reason && !sites) reason = SHARED_JOINT_SEARCH_FAILURE;
    if (reason || !sites) return { kind: "retained", firstStackIndex: first.index, secondStackIndex: second.index, reason: reason! };
    const positions = (sites: Site[], kind: SiteKind) => sites.filter(site => site.kind === kind).map(site => site.position).sort((first, second) => first - second);
    const primaryCoverPins = positions(sites.pins, "primary-pin"), followerCoverPins = positions(sites.pins, "follower-pin");
    const pinPositions = [...primaryCoverPins, ...followerCoverPins].sort((first, second) => first - second);
    const tiers: SharedWallTierSchedule[] = lanes[first.index].map((lane, tier) => ({
      laneRole: !first.options.cascade ? "top" : tier === 0 ? "bottom" : tier === first.options.tiers - 1 ? "top" : "mid",
      reversed: worldSign(first, tier) < 0,
      terminal: tier === first.options.tiers - 1 && !first.options.cover && !first.options.stackable,
      open: first.options.rearLoad && tier === first.options.tiers - 1,
      primaryEars: positions(sites.ears[tier], "primary-ear"), followerEars: positions(sites.ears[tier], "follower-ear"), pinPositions,
      primaryCoverPins, followerCoverPins,
    }));
    return { kind: "shared", firstStackIndex: first.index, secondStackIndex: second.index, tiers };
  });
}

/** Resolve manufacturing before width/origins. Only selected shared components
 * adopt a common cut. Existing successful boundaries keep their exact schedules. */
export function planSharedAssembly<Stack extends ResolvedMixedStack>(originalStacks: readonly Stack[], shelfHeight: number): {
  stacks: Stack[]; boundaries: MixedBoundaryPlan[];
} {
  const stacks = [...originalStacks];
  const lanesFor = (stacks: readonly Stack[]) => stacks.map(stack => Array.from({ length: stack.options.tiers },
    (_, tier) => laneOf(stack.options, stack.derived, tierRole(stack.options, tier))));
  const originalLanes = lanesFor(stacks);
  const boundaries = planSharedWalls(stacks, originalLanes, shelfHeight);
  const acceptedSites = new Map<number, NonNullable<ReturnType<typeof allocateSites>>>();
  // Printer envelopes and joint allocation depend on the cut; intrinsic geometry
  // does not. Both manufacturing failures may therefore enter the cut search.
  const searchable = boundaries.map((_, index) => !incompatibility(stacks[index], stacks[index + 1], originalLanes, shelfHeight));
  for (let start = 0; start < boundaries.length;) {
    if (!searchable[start]) { start++; continue; }
    let end = start;
    while (end + 1 < boundaries.length && searchable[end + 1]) end++;
    type Component = { stacks: Stack[]; sites: typeof acceptedSites; sharedCount: number };
    const memo = new Map<string, Component>();
    const resolveComponent = (first: number, last: number): Component => {
      const identity = `${first}:${last}`, cached = memo.get(identity);
      if (cached) return cached;
      const group = stacks.slice(first, last + 1);
      const groupBoundaries = boundaries.slice(first, last);
      if (groupBoundaries.every(boundary => boundary.kind === "shared")) {
        const existing = { stacks: group, sites: new Map(), sharedCount: last - first };
        memo.set(identity, existing);
        return existing;
      }
      let ranges: [number, number][] = [[-Infinity, Infinity]];
      for (const [index, stack] of group.entries()) {
        const transverseSpan = Math.max(stack.derived.plateY,
          stack.derived.OW + (index ? sharedWallCollarExtension(stack.options) : 0),
          originalLanes[stack.index][0].H + sharedWallSnapTop(stack.options));
        const allowed = sharedPrintSeamRanges(stack.options, stack.derived, transverseSpan);
        ranges = ranges.flatMap(([minimum, maximum]) => allowed.map(([lower, upper]): [number, number] =>
          [Math.max(minimum, lower), Math.min(maximum, upper)]).filter(([lower, upper]) => lower <= upper));
      }
      if (groupBoundaries.some(boundary => boundary.kind === "shared")) {
        const seam = group[0].derived.seams[0];
        ranges = ranges.filter(([minimum, maximum]) => seam >= minimum && seam <= maximum).map(() => [seam, seam]);
      }
      for (const plan of jointSitePlans(group[0], originalLanes[group[0].index][0], ranges)) {
        const candidates = [...stacks];
        for (const stack of group) candidates[stack.index] = { ...stack,
          derived: solve(stack.options, stack.derived.H, [plan.seam]) };
        if (group.some(stack => check(stack.options, candidates[stack.index].derived).some(warning => warning.startsWith("FAIL")))) continue;
        const candidateLanes = lanesFor(candidates);
        if (group.some(stack => !sameNumbers(originalLanes[stack.index][0].tabs, candidateLanes[stack.index][0].tabs))) continue;
        const sites = new Map(acceptedSites);
        for (let index = first; index < last; index++) if (boundaries[index].kind === "retained") sites.set(index, plan.sites);
        const planned = planBoundaries(candidates, candidateLanes, shelfHeight, sites);
        if (planned.slice(first, last).some(boundary => boundary.kind !== "shared")) continue;
        if (boundaries.some((boundary, index) => boundary.kind === "shared"
          && JSON.stringify(boundary) !== JSON.stringify(planned[index]))) continue;
        const selected = { stacks: candidates.slice(first, last + 1), sites, sharedCount: last - first };
        memo.set(identity, selected);
        return selected;
      }
      const identical = JSON.stringify([group[0].options, group[0].derived]);
      if (groupBoundaries.every(boundary => boundary.kind === "retained")
        && group.every(stack => JSON.stringify([stack.options, stack.derived]) === identical)) {
        // Every smaller group has the same primary/follower range intersection,
        // site problem and print checks. Repeating an exhausted search cannot
        // discover a partial share among identical stacks.
        const retained = { stacks: group, sites: new Map(), sharedCount: 0 };
        memo.set(identity, retained);
        return retained;
      }
      // Compare contiguous partitions. A tight neighbor must not suppress a valid
      // pair, and choosing the first feasible pair can miss a better partition.
      let best: Component = { stacks: group, sites: new Map(), sharedCount: 0 };
      for (let split = first; split < last; split++) {
        if (boundaries[split].kind === "shared") continue;
        const lower = resolveComponent(first, split), upper = resolveComponent(split + 1, last);
        if (lower.sharedCount + upper.sharedCount <= best.sharedCount) continue;
        best = { stacks: [...lower.stacks, ...upper.stacks], sites: new Map([...lower.sites, ...upper.sites]),
          sharedCount: lower.sharedCount + upper.sharedCount };
      }
      memo.set(identity, best);
      return best;
    };
    const selected = resolveComponent(start, end + 1);
    for (const stack of selected.stacks) stacks[stack.index] = stack;
    for (const [index, sites] of selected.sites) acceptedSites.set(index, sites);
    start = end + 1;
  }
  const planned = planBoundaries(stacks, lanesFor(stacks), shelfHeight, acceptedSites);
  return { stacks, boundaries: planned.map((boundary, index) => {
    const original = boundaries[index];
    // Different cuts on a retained edge are a consequence of selecting a valid
    // smaller component. Keep the underlying manufacturing failure, not that
    // planner-created mismatch, as the explanation for the unresolved edge.
    return boundary.kind === "retained" && original.kind === "retained" && searchable[index]
      ? { ...boundary, reason: original.reason } : boundary;
  }) };

}
