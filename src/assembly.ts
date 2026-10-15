import { K, type Options, type Derived, type LaneRole, type PlateName, type Vec3 } from "./model";
import { tierRole, rearTier, laneXe, deckVariant, laneName, gangs, wallVariant } from "./layout";
import { platePose, lipPose, riserPose, type Pose } from "./features/pose";
import { seamKeyBedOffset, wallSeamHeights, coverSeamPositions, coverThicknessOf } from "./features/joints";
import { queueGeometry } from "./queue";

export type AssemblyRole = "lane" | "lip" | "riser" | "cover";
export interface PartSource { kind: "lane" | "grid" | "lip" | "riser" | "cover" | "key"; laneRole?: LaneRole; plate?: PlateName; half?: "front" | "rear" }
export interface PartDescriptor { name: string; role: AssemblyRole; source: PartSource; qty: number }
interface Component { name: string; role: AssemblyRole; source: PartSource; pose: Pose; push: Vec3 }
export interface AssemblyPlacement { name: string; pose: Pose; push: Vec3 }
const STEP = 40;

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
    for (const half of derived.split && plate !== "end-wall" ? ["front", "rear"] as const : [undefined]) {
      yield { name: half ? `${name}-${half}` : name, role: "lane", source: { ...source, half }, pose: platePose(plate, derived.IW, laneXe(options, derived)), push: [push[0] + (half === "front" ? -STEP : half === "rear" ? STEP : 0), push[1], push[2]] };
    }
  }
  if (derived.split) {
    const height = role === "bottom" ? derived.Hb : derived.H;
    const bedOffset = seamKeyBedOffset(options);
    for (const side of [1, -1]) for (const keyHeight of wallSeamHeights(height)) yield {
      name: "seam-key", role: "lane", source: { kind: "key" },
      pose: { rotate: [90, 0, side > 0 ? 180 : 0], translate: [0, side * (derived.py - bedOffset), keyHeight] },
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
        yield { ...component, pose: { rotate: [component.pose.rotate[0], component.pose.rotate[1], component.pose.rotate[2] + (reversed ? 180 : 0)], translate: [sign * x, y + sign * localY, tierHeight(options, derived, tier) + z] }, push: [sign * component.push[0], lane * STEP + sign * component.push[1], tier * STEP + component.push[2]] };
      }
    }
    if (options.cover) {
      for (const half of derived.split ? ["front", "rear"] as const : [undefined]) yield {
        name: half ? `cover-${half}` : "cover", role: "cover", source: { kind: "cover", half },
        pose: { rotate: [0, 0, options.cascade && (options.tiers - 1) % 2 === 1 ? 180 : 0], translate: [0, y, options.cascade ? derived.Hb + (options.tiers - 1) * derived.H : options.tiers * derived.H] }, push: [0, lane * STEP, (options.tiers + 1) * STEP],
      };
    }
    if (options.cover && derived.split) {
      const top = options.cascade ? derived.Hb + (options.tiers - 1) * derived.H : options.tiers * derived.H;
      const reversed = options.cascade && (options.tiers - 1) % 2 === 1;
      for (const position of coverSeamPositions(derived.OW)) yield {
        name: "seam-key", role: "lane", source: { kind: "key" },
        pose: { rotate: [0, 0, reversed ? 180 : 0], translate: [0, y + position, top + coverThicknessOf(options) / 2 - seamKeyBedOffset(options)] },
        push: [0, lane * STEP, (options.tiers + 2) * STEP],
      };
    }
    if (options.base === "feet") for (const along of [-1, 1]) for (const across of [-1, 1]) yield {
      name: "riser-24", role: "riser", source: { kind: "riser" }, pose: { rotate: riserPose.rotate, translate: [along * derived.px, y + across * derived.py, -24] }, push: [0, lane * STEP, -STEP],
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
  return [...descriptors.values()].sort((left, right) => order(left) - order(right));
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
