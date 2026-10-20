import { K, type Options, type Derived, type LaneRole, type PlateName, type Vec3 } from "./model";
import { tierRole, rearTier, laneXe, deckVariant, laneName, gangs, wallVariant } from "./layout";
import { platePose, lipPose, riserPose, type Pose } from "./features/pose";
import { seamKeyBedOffset, wallSeamHeights, coverSeamPositions, coverThicknessOf } from "./features/joints";
import { queueGeometry } from "./queue";
import { mixedSplinePose, type MixedWallConnection } from "./features/mixed-connection";
import type { MixedLayout } from "./solver";
import type { IndependentRowsLayout } from "./rows";
import { SHARED_WALL_PIN_CREST } from "./features/shared-wall";

export type AssemblyRole = "lane" | "lip" | "riser" | "cover";
export interface PartSource { kind: "lane" | "grid" | "lip" | "riser" | "cover" | "key"; laneRole?: LaneRole; plate?: PlateName; half?: "front" | "rear"; section?: number }
export interface PartDescriptor { name: string; role: AssemblyRole; source: PartSource; qty: number }
interface Component { name: string; role: AssemblyRole; source: PartSource; pose: Pose; push: Vec3; tier?: number; wallSide?: "left" | "right"; coverPart?: boolean }
export interface AssemblyPlacement { name: string; pose: Pose; push: Vec3 }
export interface MixedSharedSides { leftBoundaryIndex?: number; rightBoundaryIndex?: number }
export type MixedPartSource =
  | { kind: "stack"; stackIndex: number; source: PartSource; connection?: MixedWallConnection; sharedSides?: MixedSharedSides; sharedTierIndex?: number }
  | { kind: "spline"; boundaryIndex: number; length: number }
  | { kind: "shared-divider"; boundaryIndex: number; tierIndex: number; section?: number; stackIndex?: never; connection?: never }
  | { kind: "shared-key"; boundaryIndex: number; stackIndex?: never; connection?: never };
export interface MixedPartDescriptor { name: string; role: AssemblyRole; source: MixedPartSource; qty: number }
interface MixedComponent extends Omit<Component, "source"> { source: MixedPartSource }
const STEP = 40;

function sectionSources(source: PartSource, count: number) {
  return Array.from({ length: count }, (_, index) => {
    const half = count === 2 ? index === 0 ? "front" as const : "rear" as const : undefined;
    return { suffix: half ? `-${half}` : count > 2 ? `-section-${index + 1}` : "",
      source: count > 2 ? { ...source, section: index } : { ...source, half },
      push: (index - (count - 1) / 2) * 2 * STEP };
  });
}

/** Logical part identities and assembly poses share this iterator. No consumer infers
 * identity from filename suffixes, and a repeated part has one printable mesh. */
function* tierComponents(options: Options, derived: Derived, lane: number, tier: number): Generator<Component> {
  const role = tierRole(options, tier);
  for (const plate of ["deck", "wall-left", "wall-right", "end-wall"] as PlateName[]) {
    if (plate === "end-wall" && tier === rearTier(options)) continue;
    const grid = plate === "deck" && tier === 0 && options.base === "gridfinity";
    const deck = deckVariant(options, lane);
    // A cascade reverses X and Y on alternate tiers. Reflect their printable decks in Y
    // first so the selected row ends and every internal tongue/socket stay on the same
    // world side. X stays unchanged: slope, chute and wall ears still fit this tier.
    const variant: PlateName = plate === "deck" ? options.cascade && tier % 2 === 1 && gangs(options) ? `${deck}-mirrored` as PlateName : deck : plate === "wall-left" || plate === "wall-right" ? wallVariant(options, lane, tier, plate === "wall-left" ? 1 : -1) : plate;
    const name = grid ? "grid-deck" : laneName(options, role, variant);
    const source: PartSource = grid ? { kind: "grid" } : { kind: "lane", laneRole: role, plate: variant };
    const push: Vec3 = plate === "wall-left" ? [0, STEP, 0] : plate === "wall-right" ? [0, -STEP, 0] : plate === "end-wall" ? [STEP, 0, 0] : [0, 0, 0];
    for (const section of sectionSources(source, derived.split && plate !== "end-wall" ? derived.seams.length + 1 : 1)) {
      yield { name: name + section.suffix, role: "lane", source: section.source, pose: platePose(plate, derived.IW, laneXe(options, derived)), push: [push[0] + section.push, push[1], push[2]], wallSide: plate === "wall-left" ? "left" : plate === "wall-right" ? "right" : undefined };
    }
  }
  if (derived.split) {
    const height = role === "bottom" ? derived.Hb : derived.H;
    const bedOffset = seamKeyBedOffset(options);
    for (const seam of derived.seams) for (const side of [1, -1]) for (const keyHeight of wallSeamHeights(height)) yield {
      name: "seam-key", role: "lane", source: { kind: "key" },
      pose: { rotate: [90, 0, side > 0 ? 180 : 0], translate: [seam, side * (derived.py - bedOffset), keyHeight] },
      push: [0, side * 2 * STEP, 0], wallSide: side > 0 ? "left" : "right",
    };
  }
  if (!options.cascade || tier === 0) {
    yield { name: "end-lip", role: "lip", source: { kind: "lip" }, pose: lipPose(-derived.L / 2, derived.tan), push: [-2 * STEP, 0, 0] };
  }
}

function tierHeight(options: Options, derived: Derived, tier: number): number {
  return options.cascade ? tier === 0 ? 0 : derived.Hb + (tier - 1) * derived.H : tier * derived.H;
}

function* components(options: Options, derived: Derived): Generator<Component> {
  for (let lane = 0; lane < options.lanesWide; lane++) {
    const y = lane * derived.gangPitch;
    for (let tier = 0; tier < options.tiers; tier++) {
      const reversed = options.cascade && tier % 2 === 1;
      const sign = reversed ? -1 : 1;
      for (const component of tierComponents(options, derived, lane, tier)) {
        const [x, localY, z] = component.pose.translate;
        yield { ...component, tier, pose: { rotate: [component.pose.rotate[0], component.pose.rotate[1], component.pose.rotate[2] + (reversed ? 180 : 0)], translate: [sign * x, y + sign * localY, tierHeight(options, derived, tier) + z] }, push: [sign * component.push[0], lane * STEP + sign * component.push[1], tier * STEP + component.push[2]] };
      }
    }
    if (options.cover) {
      for (const section of sectionSources({ kind: "cover" }, derived.split ? derived.seams.length + 1 : 1)) yield {
        name: "cover" + section.suffix, role: "cover", source: section.source, coverPart: true,
        pose: { rotate: [0, 0, options.cascade && (options.tiers - 1) % 2 === 1 ? 180 : 0], translate: [0, y, options.cascade ? derived.Hb + (options.tiers - 1) * derived.H : options.tiers * derived.H] }, push: [0, lane * STEP, (options.tiers + 1) * STEP],
      };
    }
    if (options.cover && derived.split) {
      const top = options.cascade ? derived.Hb + (options.tiers - 1) * derived.H : options.tiers * derived.H;
      const reversed = options.cascade && (options.tiers - 1) % 2 === 1;
      for (const seam of derived.seams) for (const position of coverSeamPositions(derived.OW)) yield {
        name: "seam-key", role: "lane", source: { kind: "key" }, coverPart: true,
        pose: { rotate: [0, 0, reversed ? 180 : 0], translate: [reversed ? -seam : seam, y + position, top + coverThicknessOf(options) / 2 - seamKeyBedOffset(options)] },
        push: [0, lane * STEP, (options.tiers + 2) * STEP],
      };
    }
    if (options.base === "feet") for (const position of derived.pinPositions) for (const across of [-1, 1]) yield {
      name: "riser-24", role: "riser", source: { kind: "riser" }, pose: { rotate: riserPose.rotate, translate: [position, y + across * derived.py, -24] }, push: [0, lane * STEP, -STEP],
    };
  }
}

export function* assemblyPlacements(options: Options, derived: Derived): Generator<AssemblyPlacement> {
  for (const { name, pose, push } of components(options, derived)) yield { name, pose, push };
}

export function partManifest(options: Options, derived: Derived): PartDescriptor[] {
  const descriptors = new Map<string, PartDescriptor>();
  for (const { name, role, source } of components(options, derived)) {
    const previous = descriptors.get(name);
    if (previous) previous.qty++;
    else descriptors.set(name, { name, role, source, qty: 1 });
  }
  const roles = { bottom: 0, mid: 1, top: 2 };
  const plates = ["deck", "deck-right-end", "deck-left-end", "deck-mirrored", "deck-right-end-mirrored", "deck-left-end-mirrored", "wall-left", "wall-right", "end-wall"];
  const order = (part: PartDescriptor) => part.source.kind === "lane" ? roles[part.source.laneRole!] * 100 + (part.source.plate!.startsWith("wall-left") ? 6 : part.source.plate!.startsWith("wall-right") ? 7 : plates.indexOf(part.source.plate!)) * 2 + (part.source.half === "rear" ? 1 : 0) : ({ grid: 400, lip: 500, riser: 600, cover: 700, key: 800 } as const)[part.source.kind] + (part.source.half === "rear" ? 1 : 0);
  return [...descriptors.values()].sort((left, right) => order(left) - order(right) || (left.source.section ?? 0) - (right.source.section ?? 0));
}

/** Lazy can positions; large legal capacities never allocate a can object array. */
export function* assemblyCans(options: Options, derived: Derived): Generator<{ pose: Pose; push: Vec3 }> {
  for (let lane = 0; lane < options.lanesWide; lane++) for (let tier = 0; tier < options.tiers; tier++) {
    const queue = queueGeometry(options, derived.L, options.cascade && tier === 0);
    const sign = options.cascade && tier % 2 === 1 ? -1 : 1;
    for (let index = 0; index < queue.count; index++) {
      const [x, , z] = queue.position(index);
      yield { pose: { rotate: [0, 0, 0], translate: [sign * x, lane * derived.gangPitch, tierHeight(options, derived, tier) + z] }, push: [0, lane * STEP, tier * STEP] };
    }
  }
}

export const PREVIEW_INSTANCE_LIMIT = 20_000;
export function previewCounts(options: Options, derived: Derived) {
  const parts = partManifest(options, derived).reduce((total, part) => total + part.qty, 0);
  const cans = options.lanesWide * (options.cascade ? derived.nBottom + (options.tiers - 1) * derived.n : derived.n * options.tiers);
  const stride = Math.max(1, Math.ceil((parts + cans) / PREVIEW_INSTANCE_LIMIT));
  return { parts, cans, stride, sampled: stride > 1 };
}

/** World-side sharing is selected before choosing any printable part variant. */
function sharedSidesOf(layout: MixedLayout, stackIndex: number): MixedSharedSides | undefined {
  const sides: MixedSharedSides = {};
  for (const boundary of layout.boundaries ?? []) if (boundary.kind === "shared") {
    if (boundary.firstStackIndex === stackIndex) sides.leftBoundaryIndex = boundary.firstStackIndex;
    if (boundary.secondStackIndex === stackIndex) sides.rightBoundaryIndex = boundary.firstStackIndex;
  }
  return sides.leftBoundaryIndex !== undefined || sides.rightBoundaryIndex !== undefined ? sides : undefined;
}

function stackTierSignature(layout: MixedLayout, sides: MixedSharedSides, tier: number) {
  return JSON.stringify([sides.leftBoundaryIndex, sides.rightBoundaryIndex].map(index => {
    if (index === undefined) return null;
    const boundary = layout.boundaries?.[index];
    if (boundary?.kind !== "shared") throw new Error(`Missing shared boundary ${index + 1}`);
    const { terminal, open, ...features } = boundary.tiers[tier];
    return features;
  }));
}

function* mixedComponents(layout: MixedLayout): Generator<MixedComponent> {
  for (const stack of layout.stacks) {
    const sharedSides = sharedSidesOf(layout, stack.index);
    for (const component of components(stack.options, stack.derived)) {
      const reversed = component.tier !== undefined && stack.options.cascade && component.tier % 2 === 1;
      const worldSide = component.wallSide ? (component.wallSide === "left" ? 1 : -1) * (reversed ? -1 : 1) : undefined;
      const sharedFacing = sharedSides && (worldSide === 1 ? sharedSides.leftBoundaryIndex !== undefined
        : worldSide === -1 ? sharedSides.rightBoundaryIndex !== undefined : false);
      // Keys carry explicit wall ownership, so omitting a wall omits its own keys.
      if (sharedFacing) continue;
      const boundary = component.tier === 0 && component.source.kind === "lane" && component.wallSide
        ? layout.connections.find(connection => worldSide === 1
          ? connection.firstStackIndex === stack.index : connection.secondStackIndex === stack.index)
        : undefined;
      const connection = boundary ? { endFromFront: boundary.endFromFront,
        height: worldSide === 1 ? boundary.firstHeight : boundary.secondHeight } : undefined;
      const adapted = sharedSides && (component.source.kind === "cover" || component.source.kind === "lane"
        && (component.source.plate === "deck" || component.source.plate === "end-wall"));
      let sharedTierIndex: number | undefined;
      if (adapted) {
        const tier = component.tier ?? stack.options.tiers - 1;
        const signature = stackTierSignature(layout, sharedSides, tier);
        sharedTierIndex = component.source.kind === "cover" ? tier
          : Array.from({ length: tier + 1 }, (_, index) => index).find(index => stackTierSignature(layout, sharedSides, index) === signature)!;
      }
      const name = `stack-${stack.index + 1}-${adapted ? `shared-${sharedTierIndex! + 1}-` : connection ? "connected-" : ""}${component.name}`;
      const source: MixedPartSource = { kind: "stack", stackIndex: stack.index, source: component.source,
        ...(connection ? { connection } : {}), ...(adapted ? { sharedSides, sharedTierIndex } : {}) };
      const coverKeyLift = sharedSides && component.coverPart && component.source.kind === "key" ? SHARED_WALL_PIN_CREST / 2 : 0;
      yield { ...component, name, source,
        pose: { rotate: component.pose.rotate, translate: [component.pose.translate[0] + stack.origin[0],
          component.pose.translate[1] + stack.origin[1], component.pose.translate[2] + stack.origin[2] + coverKeyLift] },
        push: [component.push[0], component.push[1] + stack.index * STEP, component.push[2]] };
    }
  }
  for (const boundary of layout.boundaries ?? []) if (boundary.kind === "shared") {
    const stack = layout.stacks[boundary.firstStackIndex], { options, derived } = stack;
    const boundaryY = stack.origin[1] + derived.py;
    for (const [tier, schedule] of boundary.tiers.entries()) {
      const tierIndex = boundary.tiers.findIndex(candidate => JSON.stringify(candidate) === JSON.stringify(schedule));
      const height = tierHeight(options, derived, tier);
      const wallHeight = schedule.laneRole === "bottom" ? derived.Hb : derived.H;
      for (let section = 0; section <= derived.seams.length; section++) yield {
        name: `boundary-${boundary.firstStackIndex + 1}-shared-divider-${tierIndex + 1}${derived.split ? `-section-${section + 1}` : ""}`,
        role: "lane", source: { kind: "shared-divider", boundaryIndex: boundary.firstStackIndex, tierIndex,
          ...(derived.split ? { section } : {}) },
        pose: { rotate: [90, 0, 180], translate: [stack.origin[0], boundaryY - options.wall / 2, height] },
        push: [(section - derived.seams.length / 2) * 2 * STEP, (boundary.firstStackIndex + .5) * STEP, tier * STEP],
      };
      for (const seam of derived.seams) for (const keyHeight of wallSeamHeights(wallHeight)) yield {
        name: `boundary-${boundary.firstStackIndex + 1}-shared-key`, role: "lane",
        source: { kind: "shared-key", boundaryIndex: boundary.firstStackIndex },
        pose: { rotate: [90, 0, 180], translate: [stack.origin[0] + seam, boundaryY - seamKeyBedOffset(options), height + keyHeight] },
        push: [0, (boundary.firstStackIndex + .5) * STEP, tier * STEP],
      };
    }
  }
  for (const connection of layout.connections) {
    const boundaryIndex = connection.firstStackIndex;
    const first = layout.stacks[connection.firstStackIndex];
    for (let segment = 0; segment < connection.segmentCount; segment++) yield {
      name: `connection-${boundaryIndex + 1}-spline`, role: "lane",
      source: { kind: "spline", boundaryIndex, length: connection.segmentLength },
      pose: mixedSplinePose(first.options, K.gangGap, connection.firstHeight, connection.secondHeight,
        connection.startFromFront + segment * connection.segmentLength, first.origin[1] + first.derived.OW / 2),
      push: [0, (connection.firstStackIndex + 0.5) * STEP, -STEP],
    };
  }
}

export function mixedPartManifest(layout: MixedLayout): MixedPartDescriptor[] {
  const descriptors = new Map<string, MixedPartDescriptor>();
  for (const { name, role, source } of mixedComponents(layout)) {
    const previous = descriptors.get(name);
    if (previous) previous.qty++;
    else descriptors.set(name, { name, role, source, qty: 1 });
  }
  return [...descriptors.values()];
}

export function* mixedAssemblyPlacements(layout: MixedLayout): Generator<AssemblyPlacement> {
  for (const { name, pose, push } of mixedComponents(layout)) yield { name, pose, push };
}

export function* mixedAssemblyCans(layout: MixedLayout): Generator<{ stackIndex: number; pose: Pose; push: Vec3 }> {
  for (const stack of layout.stacks) for (const placement of assemblyCans(stack.options, stack.derived)) yield {
    stackIndex: stack.index,
    pose: { rotate: placement.pose.rotate, translate: [placement.pose.translate[0] + stack.origin[0],
      placement.pose.translate[1] + stack.origin[1], placement.pose.translate[2] + stack.origin[2]] },
    push: [placement.push[0], placement.push[1] + stack.index * STEP, placement.push[2]],
  };
}

/** Count all batches before choosing one global sampling rate, including rounding. */
export function mixedPreviewCounts(layout: MixedLayout) {
  const descriptors = mixedPartManifest(layout);
  const parts = descriptors.reduce((total, descriptor) => total + descriptor.qty, 0);
  const cans = layout.stacks.reduce((total, stack) => total + stack.cans, 0);
  const counts = [...descriptors.map((descriptor) => descriptor.qty), ...layout.stacks.map((stack) => stack.cans)];
  let stride = Math.max(1, Math.ceil((parts + cans) / PREVIEW_INSTANCE_LIMIT));
  while (counts.reduce((total, count) => total + Math.ceil(count / stride), 0) > PREVIEW_INSTANCE_LIMIT) stride++;
  return { parts, cans, stride, sampled: stride > 1 };
}


/** Row sources wrap the existing physical identities; transitions consume the
 * same explicit part plans for printing and standing assembly placement. */
export type IndependentRowsPartSource =
  | { kind: "row-part"; rowIndex: number; source: MixedPartSource }
  | { kind: "row-transition"; transitionIndex: number; partIndex: number };
export interface IndependentRowsPartDescriptor {
  name: string; role: AssemblyRole; source: IndependentRowsPartSource; qty: number;
}
interface IndependentRowsComponent extends Omit<Component, "source"> { source: IndependentRowsPartSource }

function independentRowSourceOwners(layout: IndependentRowsLayout, receivingWalls = false): number[] {
  const owners = new Map<string, number>();
  return layout.rows.map(row => {
    const identity = JSON.stringify({ receivesCrestPins: receivingWalls && row.index > 0,
      lanes: row.lanes.map(lane => ({ options: lane.options, derived: lane.derived })),
      boundaries: row.layout.boundaries, connections: row.layout.connections });
    const owner = owners.get(identity) ?? row.index;
    if (!owners.has(identity)) owners.set(identity, row.index);
    return owner;
  });
}

function* independentRowsComponents(layout: IndependentRowsLayout): Generator<IndependentRowsComponent> {
  const owners = independentRowSourceOwners(layout);
  const wallOwners = independentRowSourceOwners(layout, true);
  for (const row of layout.rows) {
    for (const component of mixedComponents(row.layout)) {
      const wall = component.source.kind === "stack" && component.source.source.kind === "lane"
        && component.source.source.plate?.startsWith("wall-");
      const owner = (wall ? wallOwners : owners)[row.index];
      yield {
        ...component, name: `row-${owner + 1}-${component.name}`,
        source: { kind: "row-part", rowIndex: owner, source: component.source },
        pose: { rotate: component.pose.rotate, translate: [component.pose.translate[0] + row.origin[0],
          component.pose.translate[1] + row.origin[1], component.pose.translate[2] + row.origin[2]] },
        push: [component.push[0], component.push[1], component.push[2] + row.index * STEP],
      };
    }
  }
  const transitionOwners = new Map<string, number>();
  const keyOwners = new Map<string, { transitionIndex: number; partIndex: number }>();
  for (const [transitionIndex, transition] of layout.transitions.entries()) {
    const lower = layout.rows[transition.lowerRowIndex];
    const identity = JSON.stringify({ plan: { ...transition, index: 0, lowerRowIndex: 0, upperRowIndex: 0 },
      options: lower.lanes[0].options });
    const owner = transitionOwners.get(identity) ?? transitionIndex;
    if (!transitionOwners.has(identity)) transitionOwners.set(identity, transitionIndex);
    for (const [partIndex, part] of transition.parts.entries()) {
      let sourceOwner = { transitionIndex: owner, partIndex };
      // A seam key is built only from its options; its assembly station belongs
      // to the placement and never makes another printable key geometry.
      if (part.kind === "key") {
        const keyIdentity = JSON.stringify(lower.lanes[0].options);
        sourceOwner = keyOwners.get(keyIdentity) ?? sourceOwner;
        if (!keyOwners.has(keyIdentity)) keyOwners.set(keyIdentity, sourceOwner);
      }
      yield {
        name: `transition-${sourceOwner.transitionIndex + 1}-${part.kind}-${sourceOwner.partIndex + 1}`,
        role: part.kind === "shoe" ? "riser" : part.kind === "carrier" ? "cover" : "lane",
        source: { kind: "row-transition", transitionIndex: sourceOwner.transitionIndex, partIndex: sourceOwner.partIndex },
        pose: { rotate: part.pose.rotate, translate: [part.pose.translate[0] + lower.origin[0],
          part.pose.translate[1] + lower.origin[1], part.pose.translate[2] + lower.origin[2]] },
        push: [part.push[0], part.push[1], part.push[2] + (transition.lowerRowIndex + .5) * STEP],
      };
    }
  }
}

export function independentRowsPartManifest(layout: IndependentRowsLayout): IndependentRowsPartDescriptor[] {
  const descriptors = new Map<string, IndependentRowsPartDescriptor>();
  for (const { name, role, source } of independentRowsComponents(layout)) {
    const previous = descriptors.get(name);
    if (previous) previous.qty++;
    else descriptors.set(name, { name, role, source, qty: 1 });
  }
  return [...descriptors.values()];
}

export function* independentRowsAssemblyPlacements(layout: IndependentRowsLayout): Generator<AssemblyPlacement> {
  for (const { name, pose, push } of independentRowsComponents(layout)) yield { name, pose, push };
}

export function* independentRowsAssemblyCans(layout: IndependentRowsLayout): Generator<{ stackIndex: number; pose: Pose; push: Vec3 }> {
  let stackOffset = 0;
  for (const row of layout.rows) {
    for (const placement of mixedAssemblyCans(row.layout)) yield {
      stackIndex: stackOffset + placement.stackIndex,
      pose: { rotate: placement.pose.rotate, translate: [placement.pose.translate[0] + row.origin[0],
        placement.pose.translate[1] + row.origin[1], placement.pose.translate[2] + row.origin[2]] },
      push: [placement.push[0], placement.push[1], placement.push[2] + row.index * STEP],
    };
    stackOffset += row.lanes.length;
  }
}

export function independentRowsPreviewCounts(layout: IndependentRowsLayout) {
  const descriptors = independentRowsPartManifest(layout);
  const parts = descriptors.reduce((count, descriptor) => count + descriptor.qty, 0);
  const counts = [...descriptors.map(descriptor => descriptor.qty), ...layout.rows.flatMap(row => row.lanes.map(lane => lane.cans))];
  let stride = Math.max(1, Math.ceil((parts + layout.cans) / PREVIEW_INSTANCE_LIMIT));
  while (counts.reduce((count, quantity) => count + Math.ceil(quantity / stride), 0) > PREVIEW_INSTANCE_LIMIT) stride++;
  return { parts, cans: layout.cans, stride, sampled: stride > 1 };
}
