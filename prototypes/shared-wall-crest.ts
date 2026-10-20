/** Shared-wall-only pin experiment. The original return flank, hook reach and
 * free root are unchanged; a straight crest raises the lead-in and tip. */
import type { Manifold } from 'manifold-3d';
import type { Geo } from '../src/kernel';
import { K, type Options } from '../src/model';
import { clearanceOf, pinSnap, snapRelief, coverThicknessOf, OVER } from '../src/features/joints';

export function sharedCrestPinJoint(geometry: Geo, options: Options, crestHeight: number) {
  if(!Number.isFinite(crestHeight) || crestHeight<=0 || crestHeight>1)
    throw new Error('Shared pin crest height must be finite, positive and at most 1 mm');
  const clearance=clearanceOf(options), original=pinSnap(clearance);
  const edge=original.width/2, tip=original.tip+crestHeight;
  const prong=geometry.cs2d(
    geometry.rect(edge-K.snapT,0,edge,tip),
    geometry.poly([
      [edge,original.peak-original.hook*original.returnSlope],
      [edge+original.hook,original.peak],
      [edge+original.hook,original.peak+crestHeight],
      [edge,original.peak+crestHeight+original.hook*original.leadSlope],
    ]),
  );
  const profile=geometry.cs2d(prong,prong.mirror([1,0])).intersect(geometry.rect(-original.width,0,original.width,tip));
  const pin=geometry.prismY(profile,K.tabT,-options.wall/2);
  const mouth=geometry.cs2d(profile,geometry.rect(-edge,-OVER,edge,tip)).offset(clearance,'Miter');
  const notch=geometry.prismY(mouth,options.wall+2*OVER,-options.wall/2-OVER);
  const relief=geometry.prismY(snapRelief(geometry,K.tabW,K.snapLen-original.peak),options.wall+2*OVER,-options.wall/2-OVER);
  const halfWidth=edge+clearance,halfDepth=K.tabT/2+clearance;
  const flareStart=original.peak+clearance-original.hook;
  const roofStart=tip+clearance,roofTop=roofStart+halfDepth;
  const chamber=geometry.prismY(geometry.poly([
    [-halfWidth,-1],[halfWidth,-1],[halfWidth,flareStart],
    [halfWidth+original.hook,flareStart+original.hook],[halfWidth+original.hook,roofTop+1],
    [-halfWidth-original.hook,roofTop+1],[-halfWidth-original.hook,flareStart+original.hook],[-halfWidth,flareStart],
  ]),2*halfDepth,-halfDepth);
  const roof=geometry.prismX(geometry.poly([
    [-halfDepth,-1],[halfDepth,-1],[halfDepth,roofStart],[0,roofTop],[-halfDepth,roofStart],
  ]),2*(halfWidth+original.hook+1),-halfWidth-original.hook-1);
  const coverSocket=geometry.isect(chamber,roof).translate([0,(K.tabT-options.wall)/2,0]);
  return {pin,notch,relief,coverSocket,tip,original,crestHeight,
    coverThickness:coverThicknessOf(options)+crestHeight,
    freeRootDepth:K.snapLen-original.peak};
}

/** Actual pin and root, printed with the standing wall's -Y face on the bed.
 * Coupon print X = standing X, print Y = -standing Z, print Z = standing Y+wall/2.
 * Old peak probes therefore stay at print Y=-pinSnap(c).peak and material Z=.1. */
export function buildSharedCrestPinCoupon(geometry: Geo,options: Options,crestHeight:number): Manifold {
  const joint=sharedCrestPinJoint(geometry,options,crestHeight);
  const stem=geometry.box(30,options.wall,16,0,0,-8);
  const standing=geometry.assemble([stem,joint.pin],[joint.relief]);
  return standing.rotate([90,0,0]).translate([0,0,options.wall/2]);
}
