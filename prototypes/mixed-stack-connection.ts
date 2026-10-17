// Feasibility prototype only. The browser and its normal geometry do not import this.
// Bottom decks gain a printable lower frame, joined by planar Ts and transverse keys.
// Install each key and its snap keeper before installing the bottom side walls.
import type { Manifold } from "manifold-3d";
import { DEFAULTS, K, buildAll, buildDeck, check, laneOf, partList, solve, splitDeck, type Options } from "../src/geometry";
import type { Geo } from "../src/kernel";
import { assemblyPlacements, partManifest } from "../src/assembly";
import { buildSeamKey, clearanceOf, flareProfile, seamKeyBedOffset, seamKeyHalfLength, seamKeyRadius, snapProfile, tabSnap, tProfile } from "../src/features/joints";
import type { Pose } from "../src/features/pose";

export interface PrototypeStack { canDiameter: number; canHeight: number; depth: number; tiers: number }
export interface PrototypePart { name: string; mesh: Manifold; quantity: number }
export interface PrototypePlacement { name: string; pose: Pose }

export const SAMPLE_STACKS: readonly PrototypeStack[] = [
  { canDiameter: 66, canHeight: 122.5, depth: 480, tiers: 2 },
  { canDiameter: 53, canHeight: 134, depth: 360, tiers: 3 },
  { canDiameter: 66, canHeight: 122.5, depth: 300, tiers: 2 },
];

export const FRAME = {
  height: 10, railWidth: 56, endMargin: 28,
  neckWidth: 10, headWidth: 16, keyLength: 28, keyRadius: seamKeyRadius, channelRoofRise: seamKeyRadius + 0.1,
  keyAcross: 3.75, keeperBefore: 20, keeperWidth: 7, keeperHeadWidth: 12,
  keeperHeadHeight: 2, keeperThickness: 3,
} as const;

function connectionAnchors(options: Options, depth: number): number[] {
  const derived = solve(options);
  const tabs = laneOf(options, derived, "bottom").tabs.map((position) => position + derived.L / 2);
  const clearance = clearanceOf(options);
  const teeKeepOut = K.earW / 2 + FRAME.headWidth / 2 + clearance;
  const keeperKeepOut = K.earW / 2 + FRAME.keeperHeadWidth / 2 + clearance;
  const blocked = tabs.flatMap((position) => [
    [position - teeKeepOut, position + teeKeepOut],
    ...[-1, 1].map((direction) => [position + direction * FRAME.keeperBefore - keeperKeepOut,
      position + direction * FRAME.keeperBefore + keeperKeepOut]),
  ]).sort((first, second) => first[0] - second[0]);
  const regions: number[][] = [];
  let from = FRAME.railWidth / 2;
  const to = depth - FRAME.endMargin;
  for (const [low, high] of blocked) {
    if (low > from && from < to) regions.push([from, Math.min(low, to)]);
    from = Math.max(from, high);
  }
  if (from < to) regions.push([from, to]);
  const candidates = regions.flatMap(([low, high]) => {
    const first = Math.ceil((low + 0.1) * 10) / 10, last = Math.floor((high - 0.1) * 10) / 10;
    return first <= last ? [first, last] : [];
  });
  if (!candidates.length || candidates[candidates.length - 1] - candidates[0] < FRAME.railWidth + 2 * K.ligMin)
    throw new Error("No two separated connection rails preserve the receiver's original deck ears at these depths");
  return [candidates[0], candidates[candidates.length - 1]];
}

function keyChannel(geometry: Geo, options: Options, distanceFromFront: number) {
  const clearance = clearanceOf(options);
  const radius = FRAME.keyRadius;
  // A 46.5-degree roof leaves a real margin above the flat-pack limit, including at
  // skinny triangles where a keeper slot intersects the long channel.
  const profile = geometry.poly([[0, -radius], [radius, 0], [0, FRAME.channelRoofRise], [-radius, 0]]);
  // A continuous front entry clears existing deck-ear feet. Insert the rear key first.
  // Two keepers capture each key locally; a shared entry channel is not an axial stop.
  return geometry.prismX(profile, distanceFromFront + FRAME.keyLength / 2 + clearance + 1, -distanceFromFront - 1);
}

export function prototypeKey(geometry: Geo, options: Options): Manifold {
  const body = buildSeamKey(geometry, options).scale([FRAME.keyLength / (2 * seamKeyHalfLength), 1, 1]);
  const profile = geometry.poly([[0, -FRAME.keyRadius], [FRAME.keyRadius, 0],
    [0, FRAME.keyRadius], [-FRAME.keyRadius, 0]]);
  const bedOffset = seamKeyBedOffset(options);
  // The inherited central collar lies inside the male T. These collars locate the
  // receiving rail as well, rather than leaving it resting on the clearance body.
  const receiverBearings = geometry.union([-1, 1].map((direction) => geometry.prismX(profile, 1.5, direction * 10.5 - 0.75)));
  const relieved = geometry.diff(receiverBearings, [geometry.box(FRAME.keyLength, 0.6, 10)]);
  const printable = geometry.isect(relieved, geometry.box(FRAME.keyLength + 2, 2 * FRAME.keyRadius + 2, 10,
    0, 0, 5 - bedOffset)).translate([0, 0, bedOffset]);
  return geometry.union([body, printable]);
}

function keeperStanding(geometry: Geo, options: Options): Manifold {
  const length = FRAME.height - FRAME.keeperHeadHeight;
  const profile = snapProfile(geometry, tabSnap(clearanceOf(options), length, FRAME.keeperWidth))
    .mirror([0, 1]).translate([0, -FRAME.keeperHeadHeight]);
  return geometry.union([
    geometry.prismY(profile, FRAME.keeperThickness, -FRAME.keeperThickness / 2),
    geometry.box(FRAME.keeperHeadWidth, FRAME.keeperThickness, FRAME.keeperHeadHeight + 0.2,
      0, 0, -(FRAME.keeperHeadHeight + 0.2) / 2),
  ]);
}

export function prototypeKeeper(geometry: Geo, options: Options): Manifold {
  // Like the production wall snaps, the fingers flex in the printed plane.
  return keeperStanding(geometry, options).rotate([90, 0, 0]).translate([0, 0, FRAME.keeperThickness / 2]);
}

function keeperCuts(geometry: Geo, options: Options, height: number): Manifold[] {
  const clearance = clearanceOf(options);
  const width = FRAME.keeperWidth + 2 * clearance;
  const thickness = FRAME.keeperThickness + 2 * clearance;
  return [
    geometry.box(width, thickness, FRAME.height + height + 2, 0, 0, (height + 2 - FRAME.height) / 2),
    geometry.box(FRAME.keeperHeadWidth + 2 * clearance, thickness, FRAME.keeperHeadHeight + 0.2 + clearance + height + 2,
      0, 0, (height + 2 - FRAME.keeperHeadHeight - 0.2 - clearance) / 2),
    geometry.prismY(flareProfile(geometry, FRAME.keeperWidth, clearance, FRAME.height).mirror([0, 1]),
      thickness, -thickness / 2),
  ];
}

export function buildConnectionPrototype(geometry: Geo, requests: readonly PrototypeStack[] = SAMPLE_STACKS, fit = 0) {
  if (requests.length < 2 || requests.length > 8) throw new Error("Prototype needs two to eight stacks");
  if (!Number.isFinite(fit) || fit < -0.2 || fit > 0.3) throw new Error("Prototype fit must be between -0.2 and 0.3 mm");
  for (const [index, request] of requests.entries()) {
    if (![request.canDiameter, request.canHeight, request.depth].every((value) => Number.isFinite(value) && value > 0)
      || !Number.isInteger(request.tiers) || request.tiers < 2 || request.tiers > 6)
      throw new Error(`Stack ${index + 1}: positive dimensions and two to six cascade tiers required`);
  }
  const parts: PrototypePart[] = [];
  const placements: PrototypePlacement[] = [];
  const stacks = requests.map((request, index) => {
    const options: Options = { ...DEFAULTS, canD: request.canDiameter, canL: request.canHeight,
      length: request.depth, tiers: request.tiers, lanesWide: 1, left: "none", right: "none", fit, base: "flat" };
    const derived = solve(options);
    if (derived.L !== request.depth) throw new Error(`Stack ${index + 1}: exact depth ${request.depth} exceeds prototype printer limit ${derived.L}`);
    const failures = check(options, derived).filter((warning) => warning.startsWith("FAIL"));
    if (failures.length) throw new Error(`Stack ${index + 1}: ${failures.join("; ")}`);
    return { options, derived, centreAcross: 0 };
  });
  for (let index = 1; index < stacks.length; index++)
    stacks[index].centreAcross = stacks[index - 1].centreAcross + (stacks[index - 1].derived.OW + stacks[index].derived.OW) / 2 + K.gangGap;

  const connections = stacks.slice(1).flatMap((stack, index) => connectionAnchors(stack.options,
    Math.min(stack.derived.L, stacks[index].derived.L)).map((anchor, anchorIndex) => ({
    name: `connection-${index + 1}-${anchorIndex + 1}`, firstStack: index, secondStack: index + 1,
    anchor, socketAcross: stack.centreAcross - stack.derived.OW / 2,
  })));
  const anchors = [...new Set(connections.map((connection) => connection.anchor))].sort((first, second) => first - second);
  let originalPrintVolume = 0;
  for (const [index, stack] of stacks.entries()) {
    const { options, derived, centreAcross } = stack;
    const lane = laneOf(options, derived, "bottom");
    const originalDeck = buildDeck(geometry, options, derived, lane, ["none", "none"]);
    const bottom = originalDeck.slice(0);
    if (bottom.isEmpty()) throw new Error(`Stack ${index + 1}: bottom-deck footprint is empty`);
    // Extending the existing bed footprint avoids lifting unsupported deck ties off the
    // bed. Socket flares remain open below their original underside at z = 0.
    const additions = [originalDeck, geometry.prismZ(bottom, FRAME.height, -FRAME.height)];
    const cuts: Manifold[] = [];
    const ownAnchors = new Set(connections.filter((connection) => connection.firstStack === index || connection.secondStack === index).map((connection) => connection.anchor));
    for (const anchor of ownAnchors) additions.push(geometry.box(FRAME.railWidth, derived.OW, FRAME.height,
      anchor - derived.L / 2, 0, -FRAME.height / 2));
    for (const connection of connections) {
      if (connection.firstStack !== index && connection.secondStack !== index) continue;
      const anchor = connection.anchor - derived.L / 2;
      const socketAcross = connection.socketAcross - centreAcross;
      const tee = tProfile(geometry, FRAME.neckWidth, FRAME.headWidth,
        connection.secondStack === index ? clearanceOf(options) : 0,
        { neckDepth: 2.5, depth: 5, overlap: 0.5 }).rotate(-90);
      if (connection.firstStack === index) {
        additions.push(geometry.prismZ(tee, FRAME.height, -FRAME.height).translate([anchor, socketAcross, 0]));
        additions.push(geometry.box(FRAME.neckWidth, K.gangGap + 1, FRAME.height,
          anchor, socketAcross - (K.gangGap + 1) / 2, -FRAME.height / 2));
      } else {
        cuts.push(geometry.prismZ(tee, FRAME.height + lane.dhi + 2, -FRAME.height - 1).translate([anchor, socketAcross, 0]));
        for (const direction of [-1, 1]) cuts.push(...keeperCuts(geometry, options, lane.dhi).map((cut) => cut.translate([
          anchor + direction * FRAME.keeperBefore, socketAcross + FRAME.keyAcross, 0,
        ])));
      }
      cuts.push(keyChannel(geometry, options, connection.anchor).translate([anchor, socketAcross + FRAME.keyAcross, -FRAME.height / 2]));
    }
    const deck = geometry.assemble(additions, cuts);
    const deckHalves = derived.split ? splitDeck(geometry, options, derived, lane, deck, -FRAME.height) : [deck];
    const replacements = new Map<string, Manifold>();
    const descriptors = partManifest(options, derived);
    for (const descriptor of descriptors.filter((part) => part.source.laneRole === "bottom" && part.source.plate === "deck"))
      replacements.set(descriptor.name, deckHalves[descriptor.source.section ?? (descriptor.source.half === "rear" ? 1 : 0)].translate([0, 0, FRAME.height]));
    const originalParts = partList(buildAll(geometry, options, derived), options);
    originalPrintVolume += originalParts.reduce((volume, part) => volume + part.mesh.volume() * part.qty, 0);
    for (const part of originalParts) parts.push({ name: `stack-${index + 1}-${part.name}`, mesh: replacements.get(part.name) ?? part.mesh, quantity: part.qty });
    for (const placement of assemblyPlacements(options, derived)) placements.push({
      name: `stack-${index + 1}-${placement.name}`,
      pose: { rotate: placement.pose.rotate, translate: [placement.pose.translate[0] + derived.L / 2,
        placement.pose.translate[1] + centreAcross, placement.pose.translate[2] + (replacements.has(placement.name) ? 0 : FRAME.height)] },
    });
  }
  parts.push({ name: "prototype-transverse-key", mesh: prototypeKey(geometry, stacks[0].options), quantity: connections.length });
  parts.push({ name: "prototype-key-keeper", mesh: prototypeKeeper(geometry, stacks[0].options), quantity: 2 * connections.length });
  for (const connection of connections) {
    placements.push({ name: "prototype-transverse-key", pose: { rotate: [0, 0, 0], translate: [
      connection.anchor, connection.socketAcross + FRAME.keyAcross,
      FRAME.height / 2 - seamKeyBedOffset(stacks[0].options),
    ] } });
    for (const direction of [-1, 1]) placements.push({ name: "prototype-key-keeper", pose: { rotate: [-90, 0, 0], translate: [
      connection.anchor + direction * FRAME.keeperBefore, connection.socketAcross + FRAME.keyAcross - FRAME.keeperThickness / 2, FRAME.height,
    ] } });
  }
  return { parts, placements, connections, stacks, anchors, originalPrintVolume };
}
