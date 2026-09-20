// Joints as pieces: every function here builds both halves of one joint from one spec at
// a local origin - x along the lane, y the wall's centreline (+y toward the wall's outer
// face), z = 0 at the deck underside and the wall bottom - and geometry.ts places them.
// The female is the male grown by `clearance` in-plane and run OVER past the faces it
// cuts through; the male is the exact shape. That is the whole guarantee: a slot cannot
// drift from its tab because there is no second copy of the numbers.
import type { CrossSection as CS, Manifold as M } from "manifold-3d";
import { K, type Geo, type Options } from "../geometry";

/** Every joint's clearance a side: the design's, plus the user's fit. */
export const clearanceOf = (o: Options) => K.cl + o.fit;

/** How far a cut runs past the face it opens on, and a fuse past the face it grows from.
 *  A union with extra inside the host, or a difference with extra outside it, is the same
 *  solid - so the number is free, and 1 mm keeps every boolean off a coplanar face. */
export const OVER = 1;

export interface Pair { male: M; female: M }

/** The T in profile, pointing -X from the seam: a `neck`-wide neck spliceNeck deep, then a
 *  `head`-wide head to spliceDepth, centred on y = 0. Grown by `grow`, it is the socket: a
 *  miter offset of a right-angled outline is the same outline, bigger. */
export const tProfile = (g: Geo, neck: number, head: number, grow = 0): CS => {
  const n = neck / 2, h = head / 2, xn = -K.spliceNeck, xh = -K.spliceDepth;
  const t = g.poly([[0.5, -n], [0.5, n], [xn, n], [xn, h], [xh, h], [xh, -h], [xn, -h], [xn, -n]]);
  if (!grow) return t;
  const grown = t.offset(grow, "Miter");
  t.delete();
  return grown;
};

/** The x = 0 splice: the tongue is the T through the plate from `zb` (the underside) to
 *  H; the caller intersects it with the plate so it carries the deck's slope. The socket
 *  is the grown T, OVER taller each way. */
export function tSlotJoint(g: Geo, spec: { neck: number; head: number; clearance: number; zb: number; H: number }): Pair {
  const { neck, head, clearance, zb, H } = spec;
  const male = g.prismZ(tProfile(g, neck, head), H - zb, zb - OVER);
  const female = g.prismZ(tProfile(g, neck, head, clearance), H + 2 * OVER - zb, zb - OVER);
  return { male, female };
}

/** The one tab cross-section, tabW along x by tabT, flush with the inner face of a
 *  `wall`-thick wall centred on y = 0, from z0 up `len`. Pins, bosses and the tab a
 *  notch leaves standing are all this box. */
export const tabBox = (g: Geo, len: number, wall: number, z0: number): M =>
  g.box(K.tabW, K.tabT, len, 0, (K.tabT - wall) / 2, z0 + len / 2);

/** The gang joint the deck carries: an ear-wide run back to the ear root, then a T
 *  (ear-wide neck, gangHead head, the splice depths) pointing +Y from the origin. The
 *  socket is the grown T cut through the neighbour's rail from below the deck. */
export function gangJoint(g: Geo, spec: { run: number; clearance: number; through: number }): Pair {
  const { run, clearance, through } = spec;
  const t = (grow = 0) => tProfile(g, K.earW, K.gangHead, grow).rotate(-90);
  const runBox = g.box(K.earW, run, K.deckLo, 0, -run / 2, K.deckLo / 2);
  const head = g.prismZ(t(), K.deckLo);
  const male = g.union([runBox, head]);
  runBox.delete(); head.delete();
  const female = g.prismZ(t(clearance), through + 2 * OVER, -OVER);
  return { male, female };
}
