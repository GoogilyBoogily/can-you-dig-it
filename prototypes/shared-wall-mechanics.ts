/** Mechanical experiment only: no application source consumes this builder.
 * Production deck/wall/end-wall/snap geometry is retained, with explicit boundary
 * ownership. Units mm; flat tiers; 240 mm depth; 6 mm wall; unequal lane widths.
 */
import type { Manifold } from 'manifold-3d';
import { DEFAULTS, K, type Options, type Derived } from '../src/model';
import { Geo } from '../src/kernel';
import { solve, laneOf, buildDeck, buildWall, buildEndWall, buildCover, buildLip } from '../src/geometry';
import { earJoint, clearanceOf, coverThicknessOf, pinSnap, lipPocket, lipSnap, endWallSnap, endWallTabPositions, OVER } from '../src/features/joints';
import { lay, stand, platePose, lipPose } from '../src/features/pose';

export interface PrototypePart { name: string; standing: Manifold; printable: Manifold; stack?: number; tier?: number }
export interface PrototypeLane { options: Options; derived: Derived; centre: number }
export const SHARED_MECHANICS = {
  primaryEars: [-98, 28], followerEars: [-28, 96], pins: [-65, 65],
  primaryCoverPins: [-65], followerCoverPins: [65],
};

/** Same blind chamber and printable tent roof as production buildCover(). */
function coverSocket(geometry: Geo, options: Options): Manifold {
  const clearance = clearanceOf(options), snap = pinSnap(clearance);
  const halfWidth = K.tabW / 2 + clearance, halfDepth = K.tabT / 2 + clearance;
  const flareStart = snap.peak + clearance - snap.hook;
  const roofStart = snap.tip + clearance, roofTop = roofStart + halfDepth;
  const chamber = geometry.prismY(geometry.poly([
    [-halfWidth,-1],[halfWidth,-1],[halfWidth,flareStart],
    [halfWidth + snap.hook,flareStart + snap.hook],[halfWidth + snap.hook,roofTop + 1],
    [-halfWidth - snap.hook,roofTop + 1],[-halfWidth - snap.hook,flareStart + snap.hook],[-halfWidth,flareStart],
  ]),2 * halfDepth,-halfDepth);
  const roof = geometry.prismX(geometry.poly([
    [-halfDepth,-1],[halfDepth,-1],[halfDepth,roofStart],[0,roofTop],[-halfDepth,roofStart],
  ]),2 * (halfWidth + snap.hook + 1),-halfWidth - snap.hook - 1);
  return geometry.isect(chamber,roof).translate([0,(K.tabT-options.wall)/2,0]);
}

export function sharedWallPrototype(geometry: Geo, configuration: {
  fit: number; widths?: number[]; tiers?: number; slope?: number; minimal?: boolean; covered?: boolean;
}) {
  const widths = configuration.widths ?? [122.5,134], tiers = configuration.tiers ?? 2;
  if(!Number.isFinite(configuration.fit) || configuration.fit < -.2 || configuration.fit > .3
    || ![1,2].includes(tiers) || widths.length<2 || widths.length>3
    || widths.some(width=>!Number.isFinite(width)||width<100||width>140)
    || ![0,3].includes(configuration.slope ?? 0))
    throw new Error('Shared-wall mechanical prototype requires 2–3 lanes, 1–2 flat tiers, 100–140 mm cans, slope 0/3 and fit -0.2…0.3');
  const lanes: PrototypeLane[] = [];
  for (const width of widths) {
    const options: Options = { ...DEFAULTS, canL:width, length:240, tiers, lanesWide:1,
      cascade:false, slope:configuration.slope ?? 0, fit:configuration.fit, wall:6,
      left:'none',right:'none',base:'flat',cover:configuration.covered ?? true,
      design:configuration.minimal ? 'minimal' : 'standard' };
    const derived = { ...solve(options), pinPositions:[...SHARED_MECHANICS.pins] };
    const previous = lanes.at(-1);
    const centre = previous ? previous.centre + (previous.derived.IW + derived.IW)/2 + options.wall : 0;
    lanes.push({options,derived,centre});
  }
  const parts: PrototypePart[] = [];
  const add = (name: string, standing: Manifold, printable: Manifold, stack?: number, tier?: number) =>
    parts.push({name,standing,printable,stack,tier});
  const collar = K.ligMin + clearanceOf(lanes[0].options);
  // Protect the wall pin's entire freed-prong root envelope, not merely its
  // chamber: both flanking wall-top bearing shoulders remain under each finger.
  const fingerHalfWidth = K.tabW/2 + K.snapT + 2*clearanceOf(lanes[0].options) + K.snapCatch + K.ligMin;
  const allEars = [...SHARED_MECHANICS.primaryEars,...SHARED_MECHANICS.followerEars].sort((first,second)=>first-second);
  for (let stack=0;stack<lanes.length;stack++) {
    const {options,derived,centre} = lanes[stack], lane = laneOf(options,derived,'top');
    const clearance = clearanceOf(options), ear = earJoint(geometry,{wall:options.wall,through:lane.dhi,clearance});
    const sides = [-1,1].map(side=>({side,shared:side===-1 ? stack>0 : stack<lanes.length-1,
      boundary:centre+side*derived.py, positions:side===-1 ? SHARED_MECHANICS.followerEars : SHARED_MECHANICS.primaryEars}));
    for (let tier=0;tier<tiers;tier++) {
      const elevation=tier*lane.H;
      const lipPart=buildLip(geometry,options,derived);
      add(`stack-${stack}-tier-${tier}-lip`,stand(lipPart,lipPose(lane.xd,derived.tan)).translate([0,centre,elevation]),lipPart,stack,tier);
      let deck=buildDeck(geometry,options,derived,{...lane,tabs:[]},['none','none']).translate([0,centre,0]);
      const additions:Manifold[]=[deck],cuts:Manifold[]=[];
      for (const {side,shared,boundary,positions} of sides) {
        const supportSites=shared ? positions : lane.tabs;
        for (const position of supportSites) {
          // A full rail plinth gives the same root on minimal as on standard decks.
          additions.push(geometry.box(K.earW+6,20+K.earRoot,K.deckLo,position,
            centre+side*(derived.IW/2-(20+K.earRoot)/2),K.deckLo/2));
          if(shared) {
            const minimum=-options.wall/2-(side===-1 ? collar : K.earRoot);
            const maximum=options.wall/2+(side===-1 ? K.earRoot : 0);
            additions.push(geometry.box(K.earW,maximum-minimum,K.deckLo,position,boundary+(minimum+maximum)/2,K.deckLo/2));
            cuts.push(ear.slot.translate([position,boundary,0]));
          } else {
            const placedEar=side===1 ? ear.ear : ear.ear.mirror([0,1,0]);
            const placedSlot=side===1 ? ear.slot : ear.slot.mirror([0,1,0]);
            additions.push(placedEar.translate([position,boundary,0]));
            cuts.push(placedSlot.translate([position,boundary,0]));
          }
        }
        if(shared && side===1) for(const position of SHARED_MECHANICS.followerEars) {
          // The follower's collar must clear a ROOTED rail, even where a minimal
          // deck's ordinary wall-to-fin strip would otherwise be entirely open.
          additions.push(geometry.box(K.earW+6,20+K.earRoot,K.deckLo,position,
            centre+side*(derived.IW/2-(20+K.earRoot)/2),K.deckLo/2));
          cuts.push(geometry.box(K.earW+2*clearance,collar+clearance+OVER,lane.H+2,
            position,boundary-options.wall/2-(collar+clearance+OVER)/2,lane.H/2));
        }
      }
      const lip = lipSnap(geometry,K.deckLo + (lane.lipx-lane.xd)*derived.tan,clearance);
      for(const side of [-1,1]) {
        cuts.push(lipPocket(geometry,clearance,40,10).translate([lane.lipx,centre+side*derived.lipy,0]));
        cuts.push(lip.flare.translate([lane.lipx,centre+side*derived.lipy,0]));
      }
      const endSnap=endWallSnap(geometry,{height:lane.te,wall:options.wall,clearance});
      for(const position of endWallTabPositions(derived.IW)) cuts.push(endSnap.slot.translate([lane.xe,centre+position,0]));
      deck=geometry.assemble(additions,cuts);
      add(`stack-${stack}-tier-${tier}-deck`,deck.translate([0,0,elevation]),deck.translate([0,-centre,0]),stack,tier);
      for(const {side,shared,boundary} of sides) if(!shared) {
        const wall=buildWall(geometry,options,derived,lane,side);
        add(`stack-${stack}-tier-${tier}-outer-${side}`,wall.translate([0,centre,elevation]),
          lay(wall,platePose(side===1 ? 'wall-left':'wall-right',derived.IW,0)),stack,tier);
      }
      // Each end-wall retains half of each shared common post. Both halves are
      // rooted directly to their own body, avoiding the old coincident full posts.
      let endWall=buildEndWall(geometry,options,derived,lane).translate([0,centre,0]);
      const postCuts:Manifold[]=[];
      for(const {side,shared,boundary} of sides) if(shared)
        postCuts.push(geometry.box(options.wall+2,options.wall/2+clearance+OVER,lane.H+2,
          lane.xe+options.wall/2,boundary+side*(options.wall/4-clearance/2+OVER/2),lane.H/2));
      endWall=geometry.diff(endWall,postCuts);
      add(`stack-${stack}-tier-${tier}-end`,endWall.translate([0,0,elevation]),
        lay(endWall.translate([0,-centre,0]),platePose('end-wall',0,lane.xe)),stack,tier);
    }
    if(options.cover) {
      // Start with production grille/window and seams, then allocate each common
      // strip to one cover at a time. A complete socket is never bisected.
      let cover=geometry.union(buildCover(geometry,options,{...derived,pinPositions:[]})).translate([0,centre,0]);
      const additions:Manifold[]=[], cuts:Manifold[]=[];
      const baseCuts:Manifold[]=[];
      const socket=coverSocket(geometry,options), thickness=coverThicknessOf(options);
      for(const {side,shared,boundary} of sides) {
        if(!shared) {
          const outerSocket=side===1 ? socket:socket.mirror([0,1,0]);
          for(const position of derived.pinPositions) cuts.push(outerSocket.translate([position,boundary,0]));
        } else if(side===1) {
          for(const position of SHARED_MECHANICS.followerCoverPins)
            baseCuts.push(geometry.box(2*(fingerHalfWidth+clearance),options.wall+collar+clearance+OVER,thickness+2,
              position,boundary+(OVER-collar-clearance)/2,thickness/2));
          for(const position of SHARED_MECHANICS.primaryCoverPins) cuts.push(socket.translate([position,boundary,0]));
        } else {
          baseCuts.push(geometry.box(300,options.wall+OVER,thickness+2,0,boundary-OVER/2,thickness/2));
          // These fingers grow from the follower's own top skin across the divider;
          // the free-edge collar closes the chamber at the common print-face side.
          for(const position of SHARED_MECHANICS.followerCoverPins) {
            const minimum=-options.wall/2-collar, maximum=options.wall/2+K.earRoot;
            additions.push(geometry.box(2*fingerHalfWidth,maximum-minimum,thickness,
              position,boundary+(minimum+maximum)/2,thickness/2));
            cuts.push(socket.translate([position,boundary,0]));
          }
        }
      }
      cover=geometry.assemble([geometry.diff(cover,baseCuts),...additions],cuts);
      add(`stack-${stack}-cover`,cover.translate([0,0,tiers*lane.H]),cover.translate([0,-centre,0]),stack);
    }
  }
  for(let boundary=0;boundary<lanes.length-1;boundary++) {
    const {options,derived,centre}=lanes[boundary],lane=laneOf(options,derived,'top');
    for(let tier=0;tier<tiers;tier++) {
      const wall=buildWall(geometry,options,derived,{...lane,tabs:allEars},1);
      add(`boundary-${boundary}-tier-${tier}`,wall.translate([0,centre,tier*lane.H]),
        lay(wall,platePose('wall-left',derived.IW,0)),undefined,tier);
    }
  }
  return {lanes,parts,collar,fingerHalfWidth};
}
