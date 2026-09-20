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

/** How tall the ear notch is, and so how far the tab it leaves standing reaches: the
 *  deck's low end plus the clearance. The recess pads and the lattice field start
 *  from the same line, so it lives here once. */
export const earNotchH = (clearance: number) => K.deckLo + clearance;

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

/** The lip's tab, as the lip lies to print: `len` along x from 0, lipTabW across y,
 *  lipTabT thick from z = 0. */
export const lipTab = (g: Geo, len: number): M =>
  g.box(len, K.lipTabW, K.lipTabT, len / 2, 0, K.lipTabT / 2);

/** The pocket that tab drops into, cut in the deck with the tab standing: lipTabT along x,
 *  lipTabW along y, each plus the clearance a side, `h` tall centred on z = zc. Was
 *  12.4 × 5.4 since the first cut: a bare `2 * o.fit` on that old magic number put the
 *  clearance at exactly zero at fit -0.2, which the narrowed LIMITS.fit makes one drag
 *  away; every other joint still holds 0.05 mm a side there, hence `clearance` here rather
 *  than `o.fit`. */
export const lipPocket = (g: Geo, clearance: number, h: number, zc: number): M =>
  g.box(K.lipTabT + 2 * clearance, K.lipTabW + 2 * clearance, h, 0, 0, zc);

/** A pin on a wall top (or a boss on a riser or a grid deck) and what receives it: the
 *  notch in the bottom of the wall above, centred on the wall so the pin's offset to the
 *  inner face is inside it, and the hole through the cover. */
export function pinJoint(g: Geo, spec: { wall: number; clearance: number }): { pin: M; notch: M; hole: M } {
  const { wall, clearance: c } = spec;
  const pin = tabBox(g, K.pinH, wall, 0);
  const notch = g.box(K.tabW + 2 * c, wall + 2 * OVER, K.pinH + c + OVER, 0, 0, (K.pinH + c - OVER) / 2);
  const hole = g.box(K.tabW + 2 * c, K.tabT + 2 * c, K.coverT + 2 * OVER, 0, (K.tabT - wall) / 2, K.coverT / 2);
  return { pin, notch, hole };
}

/** A joint piece on one side of the lane: mirrored across y for the -Y side (its y
 *  offset to the wall's inner face is signed), then moved. Returns a fresh Manifold
 *  the caller owns; the mirrored intermediate is freed here. */
export function placeSide(m: M, sy: number, x: number, y: number, z: number): M {
  if (sy > 0) return m.translate([x, y, z]);
  const mirrored = m.mirror([0, 1, 0]);
  const placed = mirrored.translate([x, y, z]);
  mirrored.delete();
  return placed;
}

/** The joint that carries a deck on a wall: the deck puts an ear out under the wall with
 *  a slot through it; the wall notches over the ear and leaves its tab standing in the
 *  notch to drop through the slot to the wall top below. Origin at the tab's x on the
 *  wall's centreline; +y is out through the wall. The ear roots OVER into the deck. */
export function earJoint(g: Geo, spec: { wall: number; through: number; clearance: number }): { ear: M; slot: M; notch: M } {
  const { wall, through, clearance: c } = spec;
  const ear = g.box(K.earW, wall + OVER, K.deckLo, 0, -OVER / 2, K.deckLo / 2);
  const slot = g.box(K.tabW + 2 * c, K.tabT + 2 * c, through + 2 * OVER, 0, (K.tabT - wall) / 2, through / 2);
  const notchH = earNotchH(c);
  const pocket = g.box(K.earW + 2 * c, wall + 2 * OVER, notchH + OVER, 0, 0, (notchH - OVER) / 2);
  const tab = tabBox(g, notchH + 2 * OVER, wall, -OVER);
  const notch = g.diff(pocket, [tab]);
  pocket.delete(); tab.delete();
  return { ear, slot, notch };
}

/** The corner: the end wall keeps a wall-square post from the lap line to the tier top,
 *  and the side wall is slotted from its top edge down to that line to take it. The
 *  origin is the end wall's inner face on the side wall's centreline. */
export function crossLap(g: Geo, spec: { wall: number; lapZ: number; H: number; clearance: number }): Pair {
  const { wall, lapZ, H, clearance } = spec;
  const male = g.box(wall, wall, H - lapZ, wall / 2, 0, (H + lapZ) / 2);
  const female = g.box(wall + 2 * clearance, wall + 2 * OVER, H - lapZ + OVER, wall / 2, 0, (H + lapZ + OVER) / 2);
  return { male, female };
}

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
