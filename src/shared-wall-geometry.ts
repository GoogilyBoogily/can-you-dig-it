/** Demand-driven shared-wall composition. The boundary planner owns every joint
 * site; this module only builds its requested physical source and print sections. */
import type { Manifold } from 'manifold-3d';
import type { MixedPartSource, MixedSharedSides } from './assembly';
import type { MixedLayout } from './solver';
import { K, type MixedBoundaryPlan, type SharedWallTierSchedule, type Options, type Derived } from './model';
import type { Geo } from './kernel';
import { buildDeck, buildEndWall, buildCover, buildWallFeatures, splitDeck, splitWall, laneOf } from './geometry';
import { buildSeamKey, clearanceOf, earJoint, lipSnap, lipPocket, endWallSnap, endWallTabPositions } from './features/joints';
import { sharedWallPinJoint, sharedWallEarJoint, sharedWallCollarExtension, sharedCoverFingerHalfWidth, sharedWallCoverThickness, coverPinSocket } from './features/shared-wall';
import { lay, platePose } from './features/pose';

type SharedPlan = Extract<MixedBoundaryPlan, { kind: 'shared' }>;
type SharedLayout = MixedLayout & { boundaries?: MixedBoundaryPlan[] };
interface SideContext { worldSide: number; localSide: number; owner: 'primary' | 'follower'; schedule: SharedWallTierSchedule }

function sharedPlan(layout: SharedLayout, boundaryIndex: number): SharedPlan {
  const boundary = layout.boundaries?.[boundaryIndex];
  if (!boundary || boundary.kind !== 'shared') throw new Error(`Missing shared boundary ${boundaryIndex + 1}`);
  return boundary;
}

function sideContexts(layout: SharedLayout, sides: MixedSharedSides, tierIndex: number, reversed: boolean): SideContext[] {
  const result: SideContext[] = [];
  for (const [worldSide, boundaryIndex] of [[1,sides.leftBoundaryIndex],[-1,sides.rightBoundaryIndex]] as const) {
    if (boundaryIndex === undefined) continue;
    const schedule = sharedPlan(layout,boundaryIndex).tiers[tierIndex];
    if (!schedule) throw new Error(`Missing shared boundary tier ${boundaryIndex + 1}/${tierIndex + 1}`);
    result.push({ worldSide, localSide: worldSide * (reversed ? -1 : 1), owner: worldSide === 1 ? 'primary' : 'follower', schedule });
  }
  return result;
}

/** Canonical joint's Y points toward world +Y; reverse only for a reversed deck. */
function placeBoundary(shape: Manifold, worldX: number, localBoundary: number, reversed: boolean): Manifold {
  return (reversed ? shape.mirror([0,1,0]) : shape).translate([worldX * (reversed ? -1 : 1),localBoundary,0]);
}

function adaptedDeck(geometry: Geo, options: Options, derived: Derived, tierIndex: number, sides: SideContext[]) {
  const reversed = options.cascade && tierIndex % 2 === 1;
  const role = sides[0].schedule.laneRole, lane = laneOf(options,derived,role);
  const clearance = clearanceOf(options), collar = sharedWallCollarExtension(options);
  const ordinaryEar = earJoint(geometry,{ wall: options.wall,through: lane.dhi,clearance });
  const deckDomain = geometry.box(derived.L/2-lane.xd,2*derived.OW,K.deckLo+2,
    (derived.L/2+lane.xd)/2,0,K.deckLo/2);
  const additions = [buildDeck(geometry,options,derived,{...lane,tabs:[]},['none','none'])];
  const cuts: Manifold[] = [];
  for (const localSide of [-1,1]) {
    const context = sides.find(side => side.localSide === localSide);
    const localBoundary = localSide * derived.py;
    const sites = context ? (context.owner === 'primary' ? context.schedule.primaryEars : context.schedule.followerEars)
      .map(position => position * (reversed ? -1 : 1)) : lane.tabs;
    const plinthDepth = 20 + K.earRoot;
    const addPlinth = (position: number) => additions.push(geometry.isect(
      geometry.box(K.earW+6,plinthDepth,K.deckLo,position,localSide*(derived.IW/2-plinthDepth/2),K.deckLo/2),deckDomain));
    for (const position of sites) {
      addPlinth(position);
      if (context) {
        const joint = sharedWallEarJoint(geometry,options,context.owner,lane.dhi);
        const worldX = position * (reversed ? -1 : 1);
        additions.push(placeBoundary(joint.ear,worldX,localBoundary,reversed));
        cuts.push(placeBoundary(joint.slot,worldX,localBoundary,reversed));
      } else {
        additions.push((localSide === 1 ? ordinaryEar.ear : ordinaryEar.ear.mirror([0,1,0])).translate([position,localBoundary,0]));
        cuts.push((localSide === 1 ? ordinaryEar.slot : ordinaryEar.slot.mirror([0,1,0])).translate([position,localBoundary,0]));
      }
    }
    if (context?.owner === 'primary') for (const worldX of context.schedule.followerEars) {
      addPlinth(worldX * (reversed ? -1 : 1));
      const relief = geometry.box(K.earW+2*clearance,collar+clearance+1,lane.H+2,
        0,-options.wall/2-(collar+clearance+1)/2,lane.H/2);
      cuts.push(placeBoundary(relief,worldX,localBoundary,reversed));
    }
    if (context?.owner === 'follower') for (const worldX of context.schedule.primaryEars) {
      // Keep the primary ear's full bearing/slot frame. Relieve the adjacent
      // follower rail instead of leaving two independently printed faces flush.
      const relief = geometry.box(K.earW+2*clearance,1+clearance,lane.H+2,
        0,options.wall/2+(clearance-1)/2,lane.H/2);
      cuts.push(placeBoundary(relief,worldX,localBoundary,reversed));
    }
  }
  // Root plinths must not fill production lip/end-wall receiving cavities.
  const lip = lipSnap(geometry,K.deckLo+K.lipInset*derived.tan,clearance);
  for (const side of [-1,1]) {
    cuts.push(lipPocket(geometry,clearance,40,10).translate([lane.lipx,side*derived.lipy,0]));
    cuts.push(lip.flare.translate([lane.lipx,side*derived.lipy,0]));
  }
  const endSnap = endWallSnap(geometry,{height:lane.te,wall:options.wall,clearance});
  for (const position of endWallTabPositions(derived.IW)) cuts.push(endSnap.slot.translate([lane.xe,position,0]));
  return splitDeck(geometry,options,derived,lane,geometry.assemble(additions,cuts));
}

function adaptedEndWall(geometry: Geo, options: Options, derived: Derived, tierIndex: number, sides: SideContext[]) {
  const reversed = options.cascade && tierIndex % 2 === 1;
  const lane = laneOf(options,derived,sides[0].schedule.laneRole);
  const clearance = clearanceOf(options), cuts: Manifold[] = [];
  for (const side of sides) {
    // Partition each common post in world Y. A clearance gap keeps independent
    // printed halves apart while each remains rooted in its own end-wall body.
    const minimum = side.owner === 'primary' ? -clearance : -options.wall/2-1;
    const maximum = side.owner === 'primary' ? options.wall/2+1 : clearance;
    const cut = geometry.box(options.wall+2,maximum-minimum,lane.H+2,
      lane.xe+options.wall/2,(minimum+maximum)/2,lane.H/2);
    const localCut = reversed ? cut.mirror([0,1,0]) : cut;
    cuts.push(localCut.translate([0,side.localSide*derived.py,0]));
  }
  const wall = geometry.diff(buildEndWall(geometry,options,derived,lane),cuts);
  return [lay(wall,platePose('end-wall',0,lane.xe))];
}

function adaptedCover(geometry: Geo, options: Options, derived: Derived, tierIndex: number, sides: SideContext[]) {
  const reversed = options.cascade && tierIndex % 2 === 1;
  const clearance = clearanceOf(options), collar = sharedWallCollarExtension(options);
  const fingerHalfWidth = sharedCoverFingerHalfWidth(options), thickness = sharedWallCoverThickness(options);
  const ordinarySocket = coverPinSocket(geometry,options), commonSocket = sharedWallPinJoint(geometry,options).coverSocket;
  const base = geometry.union(buildCover(geometry,options,{...derived,pinPositions:[]},thickness));
  const additions: Manifold[] = [], baseCuts: Manifold[] = [], cuts: Manifold[] = [];
  for (const localSide of [-1,1]) {
    const context = sides.find(side => side.localSide === localSide), localBoundary = localSide*derived.py;
    if (!context) {
      const socket = localSide === 1 ? ordinarySocket : ordinarySocket.mirror([0,1,0]);
      for (const position of derived.pinPositions) cuts.push(socket.translate([position,localBoundary,0]));
      continue;
    }
    if (context.owner === 'primary') {
      for (const worldX of context.schedule.followerCoverPins) {
        const relief = geometry.box(2*(fingerHalfWidth+clearance),options.wall+collar+clearance+1,thickness+2,
          0,(1-collar-clearance)/2,thickness/2);
        baseCuts.push(placeBoundary(relief,worldX,localBoundary,reversed));
      }
    } else {
      // Leave fit clearance to the primary cover, with the original root
      // overlap preserved where each follower finger joins its own cover.
      const strip = geometry.box(derived.L+2,options.wall+1+clearance,thickness+2,0,(clearance-1)/2,thickness/2);
      baseCuts.push(placeBoundary(strip,0,localBoundary,reversed));
      for (const worldX of context.schedule.followerCoverPins) {
        const minimum = -options.wall/2-collar, maximum = options.wall/2+clearance+K.earRoot;
        const finger = geometry.box(2*fingerHalfWidth,maximum-minimum,thickness,
          0,(minimum+maximum)/2,thickness/2);
        additions.push(placeBoundary(finger,worldX,localBoundary,reversed));
      }
    }
    const sites = context.owner === 'primary' ? context.schedule.primaryCoverPins : context.schedule.followerCoverPins;
    for (const worldX of sites) cuts.push(placeBoundary(commonSocket,worldX,localBoundary,reversed));
  }
  return splitWall(geometry,derived,geometry.assemble([geometry.diff(base,baseCuts),...additions],cuts));
}

function dividerSections(geometry: Geo, layout: SharedLayout, boundaryIndex: number, tierIndex: number) {
  const boundary = sharedPlan(layout,boundaryIndex), stack = layout.stacks[boundary.firstStackIndex];
  const schedule = boundary.tiers[tierIndex];
  if (!stack || !schedule) throw new Error(`Missing shared divider source ${boundaryIndex+1}/${tierIndex+1}`);
  const { options,derived } = stack, sign = schedule.reversed ? -1 : 1;
  const lane = laneOf(options,derived,schedule.laneRole), joint = sharedWallPinJoint(geometry,options);
  const wall = buildWallFeatures(geometry,options,{...derived,pinPositions:schedule.pinPositions.map(position=>sign*position)},
    {...lane,tabs:[...schedule.primaryEars,...schedule.followerEars].map(position=>sign*position)},1,
    {gangNotches:false,topPins:!schedule.terminal,endLap:!schedule.open},undefined,
    {joint,receivingTip:joint.tip,hook:joint.original.hook,rootDepth:joint.freeRootDepth});
  const centred = wall.translate([0,-derived.py,0]);
  const neutral = schedule.reversed ? centred.mirror([1,0,0]) : centred;
  const pose = {rotate:[90,0,180] as [number,number,number],translate:[0,-options.wall/2,0] as [number,number,number]};
  return splitWall(geometry,derived,neutral).map(section=>lay(section,pose));
}

export function buildSharedPart(geometry: Geo, layout: SharedLayout, source: MixedPartSource,
  meshes = new Map<string,Manifold>()): Manifold {
  if (source.kind === 'shared-key') {
    const boundary = sharedPlan(layout,source.boundaryIndex);
    const identity = `shared-key|${source.boundaryIndex}`;
    const existing = meshes.get(identity);
    if (existing) return existing;
    const key = buildSeamKey(geometry,layout.stacks[boundary.firstStackIndex].options);
    meshes.set(identity,key);
    return key;
  }
  let identity: string, sectionIndex: number, build: () => Manifold[];
  if (source.kind === 'shared-divider') {
    identity = `shared-divider|${source.boundaryIndex}|${source.tierIndex}`;
    sectionIndex = source.section ?? 0;
    build = () => dividerSections(geometry,layout,source.boundaryIndex,source.tierIndex);
  } else if (source.kind === 'stack' && source.sharedSides && source.sharedTierIndex !== undefined) {
    const stack = layout.stacks[source.stackIndex];
    if (!stack) throw new Error(`Missing adapted shared stack ${source.stackIndex+1}`);
    const reversed = stack.options.cascade && source.sharedTierIndex % 2 === 1;
    const sides = sideContexts(layout,source.sharedSides,source.sharedTierIndex,reversed);
    if (!sides.length) throw new Error('Adapted shared part has no shared side');
    identity = `shared-stack|${source.stackIndex}|${source.sharedTierIndex}|${source.source.kind}|${source.source.plate ?? ''}|${JSON.stringify(source.sharedSides)}`;
    sectionIndex = source.source.section ?? (source.source.half === 'rear' ? 1 : 0);
    if (source.source.kind === 'cover') build = () => adaptedCover(geometry,stack.options,stack.derived,source.sharedTierIndex!,sides);
    else if (source.source.kind === 'lane' && source.source.plate === 'deck')
      build = () => adaptedDeck(geometry,stack.options,stack.derived,source.sharedTierIndex!,sides);
    else if (source.source.kind === 'lane' && source.source.plate === 'end-wall')
      build = () => adaptedEndWall(geometry,stack.options,stack.derived,source.sharedTierIndex!,sides);
    else throw new Error(`Unsupported adapted shared source ${source.source.kind}/${source.source.plate ?? ''}`);
  } else throw new Error(`Source ${source.kind} is not a shared-wall printable`);
  const requested = `${identity}|${sectionIndex}`, existing = meshes.get(requested);
  if (existing) return existing;
  for (const [index,section] of build().entries()) meshes.set(`${identity}|${index}`,section);
  const result = meshes.get(requested);
  if (!result) throw new Error(`Missing shared-wall printable section ${requested}`);
  return result;
}
