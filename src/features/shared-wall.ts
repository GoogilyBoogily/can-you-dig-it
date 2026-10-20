/** Qualified shared-wall pin geometry. The return flank, hook reach and free
 * root stay unchanged; a finite straight crest raises the lead-in and tip. */
import type { Geo } from '../kernel';
import { K, type Options } from '../model';
import { clearanceOf, pinSnap, snapRelief, coverThicknessOf, OVER, snapTop, earJoint } from './joints';

export const SHARED_WALL_PIN_CREST = 0.6;
export const sharedWallCollarExtension = (options: Options) => K.ligMin + clearanceOf(options);
export const sharedCoverFingerHalfWidth = (options: Options) =>
  K.tabW / 2 + K.snapT + 2 * clearanceOf(options) + K.snapCatch + K.ligMin;
export const sharedWallCoverThickness = (options: Options) => coverThicknessOf(options) + SHARED_WALL_PIN_CREST;
export const sharedWallSnapTop = (options: Options) => snapTop(options) + SHARED_WALL_PIN_CREST;

export function sharedWallPinJoint(geometry: Geo, options: Options) {
  const clearance = clearanceOf(options), original = pinSnap(clearance);
  const edge = original.width / 2, tip = original.tip + SHARED_WALL_PIN_CREST;
  const prong = geometry.cs2d(
    geometry.rect(edge - K.snapT, 0, edge, tip),
    geometry.poly([
      [edge, original.peak - original.hook * original.returnSlope],
      [edge + original.hook, original.peak],
      [edge + original.hook, original.peak + SHARED_WALL_PIN_CREST],
      [edge, original.peak + SHARED_WALL_PIN_CREST + original.hook * original.leadSlope],
    ]),
  );
  const profile = geometry.cs2d(prong, prong.mirror([1, 0]))
    .intersect(geometry.rect(-original.width, 0, original.width, tip));
  const pin = geometry.prismY(profile, K.tabT, -options.wall / 2);
  const mouth = geometry.cs2d(profile, geometry.rect(-edge, -OVER, edge, tip)).offset(clearance, 'Miter');
  const notch = geometry.prismY(mouth, options.wall + 2 * OVER, -options.wall / 2 - OVER);
  const relief = geometry.prismY(snapRelief(geometry, K.tabW, K.snapLen - original.peak),
    options.wall + 2 * OVER, -options.wall / 2 - OVER);
  return {
    pin, notch, relief, original, tip,
    coverSocket: coverPinSocket(geometry, options, tip),
    crestHeight: SHARED_WALL_PIN_CREST,
    coverThickness: sharedWallCoverThickness(options),
    freeRootDepth: K.snapLen - original.peak,
  };
}

/** Original or raised blind chamber, with the original lower return throat. */
export function coverPinSocket(geometry: Geo, options: Options, tip = snapTop(options)) {
  const clearance = clearanceOf(options), original = pinSnap(clearance);
  const halfWidth = original.width / 2 + clearance, halfDepth = K.tabT / 2 + clearance;
  const flareStart = original.peak + clearance - original.hook;
  const roofStart = tip + clearance, roofTop = roofStart + halfDepth;
  const chamber = geometry.prismY(geometry.poly([
    [-halfWidth, -1], [halfWidth, -1], [halfWidth, flareStart],
    [halfWidth + original.hook, flareStart + original.hook], [halfWidth + original.hook, roofTop + 1],
    [-halfWidth - original.hook, roofTop + 1], [-halfWidth - original.hook, flareStart + original.hook],
    [-halfWidth, flareStart],
  ]), 2 * halfDepth, -halfDepth);
  const roof = geometry.prismX(geometry.poly([
    [-halfDepth, -1], [halfDepth, -1], [halfDepth, roofStart], [0, roofTop], [-halfDepth, roofStart],
  ]), 2 * (halfWidth + original.hook + 1), -halfWidth - original.hook - 1);
  return geometry.isect(chamber, roof).translate([0, (K.tabT - options.wall) / 2, 0]);
}

/** Both decks receive tabs on the neutral boundary's -Y print face. */
export function sharedWallEarJoint(geometry: Geo, options: Options, owner: 'primary' | 'follower', through: number) {
  const joint = earJoint(geometry, { wall: options.wall, through, clearance: clearanceOf(options) });
  const minimum = -options.wall / 2 - (owner === 'follower' ? sharedWallCollarExtension(options) : K.earRoot);
  const maximum = options.wall / 2 + (owner === 'follower' ? K.earRoot : 0);
  const ear = geometry.box(K.earW, maximum - minimum, K.deckLo, 0, (minimum + maximum) / 2, K.deckLo / 2);
  return { ...joint, ear };
}
