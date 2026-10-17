import { K, type Options, type Derived, type LaneRole, type PlateName, type Vec3 } from "./model";
import { tierRole, rearTier, laneXe, deckVariant, laneName, gangs, wallVariant } from "./layout";
import { platePose, lipPose, riserPose, type Pose } from "./features/pose";
import { seamKeyBedOffset, wallSeamHeights, coverSeamPositions, coverThicknessOf } from "./features/joints";
import { queueGeometry } from "./queue";
import { mixedSplinePose, type MixedWallConnection } from "./features/mixed-connection";
import type { MixedLayout } from "./solver";

export type AssemblyRole = "lane" | "lip" | "riser" | "cover";
export interface PartSource { kind: "lane" | "grid" | "lip" | "riser" | "cover" | "key"; laneRole?: LaneRole; plate?: PlateName; half?: "front" | "rear"; section?: number }
export interface PartDescriptor { name: string; role: AssemblyRole; source: PartSource; qty: number }
interface Component { name: string; role: AssemblyRole; source: PartSource; pose: Pose; push: Vec3; tier?: number; wallSide?: "left" | "right" }
export interface AssemblyPlacement { name: string; pose: Pose; push: Vec3 }
export type MixedPartSource =
  | { kind: "stack"; stackIndex: number; source: PartSource; connection?: MixedWallConnection }
  | { kind: "spline"; boundaryIndex: number; length: number };
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
      push: [0, side * 2 * STEP, 0],
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
        name: "cover" + section.suffix, role: "cover", source: section.source,
        pose: { rotate: [0, 0, options.cascade && (options.tiers - 1) % 2 === 1 ? 180 : 0], translate: [0, y, options.cascade ? derived.Hb + (options.tiers - 1) * derived.H : options.tiers * derived.H] }, push: [0, lane * STEP, (options.tiers + 1) * STEP],
      };
    }
    if (options.cover && derived.split) {
      const top = options.cascade ? derived.Hb + (options.tiers - 1) * derived.H : options.tiers * derived.H;
      const reversed = options.cascade && (options.tiers - 1) % 2 === 1;
      for (const seam of derived.seams) for (const position of coverSeamPositions(derived.OW)) yield {
        name: "seam-key", role: "lane", source: { kind: "key" },
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

/** Delegate the standing stack geometry, changing only tier-zero facing sources. */
function* mixedComponents(layout: MixedLayout): Generator<MixedComponent> {
  for (const stack of layout.stacks) for (const component of components(stack.options, stack.derived)) {
    const boundary = component.tier === 0 && component.wallSide
      ? layout.connections.find((connection) => component.wallSide === "left"
        ? connection.firstStackIndex === stack.index : connection.secondStackIndex === stack.index)
      : undefined;
    const connection = boundary ? { endFromFront: boundary.endFromFront,
      height: component.wallSide === "left" ? boundary.firstHeight : boundary.secondHeight } : undefined;
    yield { ...component, name: `stack-${stack.index + 1}-${connection ? "connected-" : ""}${component.name}`,
      source: { kind: "stack", stackIndex: stack.index, source: component.source, ...(connection ? { connection } : {}) },
      pose: { rotate: component.pose.rotate, translate: [component.pose.translate[0] + stack.origin[0],
        component.pose.translate[1] + stack.origin[1], component.pose.translate[2] + stack.origin[2]] },
      push: [component.push[0], component.push[1] + stack.index * STEP, component.push[2]] };
  }
  for (const [boundaryIndex, connection] of layout.connections.entries()) {
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
