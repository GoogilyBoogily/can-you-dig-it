import type { Geo } from "../kernel";
// Joints as pieces: every function here builds both halves of one joint from one spec at
// a local origin, and geometry.ts places them. The wall joints (ear, pin, cross-lap) share
// one frame - x along the lane, y the wall's centreline (+y toward the wall's outer face),
// z = 0 at the deck underside and the wall bottom; the T splice sits at the seam, the gang
// joint at its tongue's root, and the lip tab and pocket in the lip's and the deck's own.
// The female is the male grown by `clearance` in-plane and run OVER past the faces it
// cuts through; the male is the exact shape. That is the whole guarantee: a slot cannot
// drift from its tab because there is no second copy of the numbers.
import type { CrossSection as CS, Manifold as M } from "manifold-3d";
import { K, type Options } from "../model";

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

interface Pair { male: M; female: M }

/** A T pointing along -X from its root. All dimensions are local millimetres;
 *  overlap roots the shape inside its host rather than leaving a coplanar face. */
export interface TeeDimensions { neckWidth: number; headWidth: number; neckDepth: number; depth: number; overlap: number }

export function teeProfile(g: Geo, dimensions: TeeDimensions, clearance = 0): CS {
  const { neckWidth, headWidth, neckDepth, depth, overlap } = dimensions;
  if (![neckWidth, headWidth, neckDepth, depth, overlap, clearance].every(Number.isFinite)
    || neckWidth <= 0 || headWidth < neckWidth || neckDepth <= 0 || depth <= neckDepth || overlap <= 0 || clearance < 0)
    throw new Error("T profile requires finite positive dimensions, head at least neck width, depth beyond neck, and nonnegative clearance");
  const neck = neckWidth / 2, head = headWidth / 2;
  const profile = g.poly([[overlap, -neck], [overlap, neck], [-neckDepth, neck], [-neckDepth, head], [-depth, head], [-depth, -head], [-neckDepth, -head], [-neckDepth, -neck]]);
  return clearance ? profile.offset(clearance, "Miter") : profile;
}

export type TeeDepths = Pick<TeeDimensions, "neckDepth" | "depth" | "overlap">;
const spliceDimensions: TeeDepths = { neckDepth: K.spliceNeck, depth: K.spliceDepth, overlap: 0.5 };

/** The T in profile, pointing -X from the seam: a `neck`-wide neck spliceNeck deep, then a
 *  `head`-wide head to spliceDepth, centred on y = 0. Grown by `grow`, it is the socket: a
 *  miter offset of a right-angled outline is the same outline, bigger. */
export const tProfile = (g: Geo, neck: number, head: number, grow = 0, dimensions: TeeDepths = spliceDimensions): CS =>
  teeProfile(g, { neckWidth: neck, headWidth: head, ...dimensions }, grow);

/** The x = 0 splice: the tongue is the T through the plate from `zb` (the underside) to
 *  H; the caller intersects it with the plate so it carries the deck's slope. The socket
 *  is the grown T, OVER taller each way. */
export function tSlotJoint(g: Geo, spec: { neck: number; head: number; clearance: number; zb: number; H: number; dimensions?: TeeDepths }): Pair {
  const { neck, head, clearance, zb, H, dimensions } = spec;
  const male = g.prismZ(tProfile(g, neck, head, 0, dimensions), H + OVER - zb, zb - OVER);
  const female = g.prismZ(tProfile(g, neck, head, clearance, dimensions), H + 2 * OVER - zb, zb - OVER);
  return { male, female };
}

/** The one tab cross-section, tabW along x by tabT, flush with the inner face of a
 *  `wall`-thick wall centred on y = 0, from z0 up `len`. Pins, bosses and the tab a
 *  notch leaves standing are all this box. */
export const tabBox = (g: Geo, len: number, wall: number, z0: number): M =>
  g.box(K.tabW, K.tabT, len, 0, (K.tabT - wall) / 2, z0 + len / 2);

/** The lip's tab as a snap, as the lip lies to print: x the insertion depth from the
 *  blade (x = 0) to the tip at `len`, y across, lipTabT thick from z = 0; the relief it
 *  needs cut back into the blade; and the flare under its pocket, in the deck's frame
 *  with the pocket centred on the origin. The prongs flex across the lip, in its plane. */
export function lipSnap(g: Geo, len: number, clearance: number): { tab: M; relief: M; flare: M } {
  const snap = tabSnap(clearance, len, K.lipTabW);
  const along = (cs: CS) => cs.rotate(-90); // (v, u) to (x = u, y = -v)
  const tab = g.prismZ(along(withRoots(g, snapProfile(g, snap), K.lipTabW)), K.lipTabT);
  const relief = g.prismZ(along(snapRelief(g, K.lipTabW, K.snapLen - snap.peak)), K.lipTabT + 2 * OVER, -OVER);
  const flare = g.prismX(fromTip(flareProfile(g, K.lipTabW, clearance, len), len), K.lipTabT + 2 * clearance, -K.lipTabT / 2 - clearance);
  return { tab, relief, flare };
}

/** The pocket that tab drops into, cut in the deck with the tab standing: lipTabT along x,
 *  lipTabW along y, each plus the clearance a side, `h` tall centred on z = zc. Was
 *  12.4 × 5.4 since the first cut: a bare `2 * o.fit` on that old magic number put the
 *  clearance at exactly zero at fit -0.2, which the narrowed LIMITS.fit makes one drag
 *  away; every other joint still holds 0.05 mm a side there, hence `clearance` here rather
 *  than `o.fit`. */
export const lipPocket = (g: Geo, clearance: number, h: number, zc: number): M =>
  g.box(K.lipTabT + 2 * clearance, K.lipTabW + 2 * clearance, h, 0, 0, zc);

/** A pin on a wall top (or a boss on a riser) and what receives it: a snap whose prongs
 *  are freed by `relief`, cut down from the wall top; the notch in the bottom of the wall
 *  above, a mouth and a chamber that are the pin grown by the clearance, through the
 *  wall; and the hole through the cover, whose top face the hooks catch. */
export function pinJoint(g: Geo, spec: { wall: number; clearance: number }): { pin: M; notch: M; hole: M; relief: M } {
  const { wall, clearance: c } = spec;
  const snap = pinSnap(c);
  const profile = snapProfile(g, snap);
  const pin = g.prismY(profile, K.tabT, -wall / 2);
  const mouth = g.cs2d(profile, g.rect(-K.tabW / 2, -OVER, K.tabW / 2, snap.tip)).offset(c, "Miter");
  const through = (cs: CS) => g.prismY(cs, wall + 2 * OVER, -wall / 2 - OVER);
  const notch = through(mouth);
  const relief = through(snapRelief(g, K.tabW, K.snapLen - snap.peak));
  const hole = g.box(K.tabW + 2 * c, K.tabT + 2 * c, K.coverT + 2 * OVER, 0, (K.tabT - wall) / 2, K.coverT / 2);
  return { pin, notch, hole, relief };
}

/** A joint piece on one side of the lane: mirrored across y for the -Y side (its y
 *  offset to the wall's inner face is signed), then moved. */
export function placeSide(m: M, sy: number, x: number, y: number, z: number): M {
  if (sy > 0) return m.translate([x, y, z]);
  return m.mirror([0, 1, 0]).translate([x, y, z]);
}

/** The joint that carries a deck on a wall: the deck puts an ear out under the wall with
 *  a slot through it; the wall notches over the ear and leaves its tab standing in the
 *  notch to drop through the slot to the wall top below. The tab is a snap: two prongs,
 *  freed by relief slots up past the notch, whose hooks spring into a 45° flare at the
 *  bottom of the slot - inside the ear, so nothing hangs below the deck. Origin at the
 *  tab's x on the wall's centreline; +y is out through the wall. The ear roots earRoot
 *  into the deck. */
export function earJoint(g: Geo, spec: { wall: number; through: number; clearance: number }): { ear: M; slot: M; notch: M } {
  const { wall, through, clearance: c } = spec;
  const ear = g.box(K.earW, wall + K.earRoot, K.deckLo, 0, -K.earRoot / 2, K.deckLo / 2);
  const notchH = earNotchH(c);
  const snap = tabSnap(c, notchH, K.tabW);
  const slotY = (K.tabT - wall) / 2;
  const flare = g.prismY(fromTip(flareProfile(g, K.tabW, c, notchH), notchH), K.tabT + 2 * c, slotY - K.tabT / 2 - c);
  const slot = g.union([g.box(K.tabW + 2 * c, K.tabT + 2 * c, through + 2 * OVER, 0, slotY, through / 2), flare]);
  const tab = g.prismY(fromTip(withRoots(g, snapProfile(g, snap), K.tabW), notchH), K.tabT, -wall / 2);
  const relief = g.prismY(fromTip(snapRelief(g, K.tabW, K.snapLen - snap.peak), notchH), wall + 2 * OVER, -wall / 2 - OVER);
  return { ear, slot, notch: g.union([g.diff(earPocket(g, wall, c), [tab]), relief]) };
}

/** A hanging snap's (v, u) to a plate's (x, z): u runs down from `tip` above z = 0, so
 *  the tip lands on z = 0. */
const fromTip = (cs: CS, tip: number): CS => cs.mirror([0, 1]).translate([0, tip]);

/** The prongs run on OVER back into their plate, so the cut that leaves them standing
 *  has no face on the plate edge. */
const withRoots = (g: Geo, profile: CS, width: number): CS => {
  const edge = width / 2;
  return g.cs2d(profile, g.rect(edge - K.snapT, -OVER, edge, 0), g.rect(-edge, -OVER, -edge + K.snapT, 0));
};

/** The notch in a wall's bottom edge that an ear-wide piece at deck level passes under:
 *  the ear's own (less the tab it leaves standing), and a gang tongue's. */
const earPocket = (g: Geo, wall: number, c: number, width = K.earW): M =>
  g.box(width + 2 * c, wall + 2 * OVER, earNotchH(c) + OVER, 0, 0, (earNotchH(c) - OVER) / 2);

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
 *  socket is the grown T cut through the neighbour's rail from below the deck; `notch` is
 *  what each wall the run passes under has cut from its bottom edge, at the wall's
 *  centreline. */
export function gangJoint(g: Geo, spec: { run: number; clearance: number; through: number; wall: number; neck?: number; head?: number; dimensions?: TeeDepths }): Pair & { notch: M } {
  const { run, clearance, through, wall, neck = K.earW, head: headWidth = K.gangHead, dimensions } = spec;
  const t = (grow = 0) => tProfile(g, neck, headWidth, grow, dimensions).rotate(-90);
  const runBox = g.box(neck, run, K.deckLo, 0, -run / 2, K.deckLo / 2);
  const head = g.prismZ(t(), K.deckLo);
  const male = g.union([runBox, head]);
  const female = g.prismZ(t(clearance), through + 2 * OVER, -OVER);
  return { male, female, notch: earPocket(g, wall, clearance, neck) };
}

/** One prong pair, in (v, u): v across the tab, the way the prongs flex, u along them
 *  from the plate edge (u = 0) to the tip. Each prong is snapT wide at the tab's edge
 *  and carries a hook `hook` proud of it, peaking at `peak`. Its return face climbs
 *  `returnSlope` in u per unit of v toward the root, its lead-in runs `leadSlope` per
 *  unit of v toward the tip, and the whole is clipped at the tip. */
export interface SnapSpec { width: number; tip: number; peak: number; hook: number; returnSlope: number; leadSlope: number }

export function snapProfile(g: Geo, spec: SnapSpec): CS {
  const { width, tip, peak, hook, returnSlope, leadSlope } = spec;
  const edge = width / 2;
  const prong = g.cs2d(
    g.rect(edge - K.snapT, 0, edge, tip),
    g.poly([[edge, peak - hook * returnSlope], [edge + hook, peak], [edge, peak + hook * leadSlope]]),
  );
  const pair = g.cs2d(prong, prong.mirror([1, 0]));
  return pair.intersect(g.rect(-width, 0, width, tip));
}

/** The slots that free a prong pair, cut into the plate from its edge down `root`: the
 *  middle between the prongs, and one as wide as a prong outside each. */
export function snapRelief(g: Geo, width: number, root: number): CS {
  const edge = width / 2, inner = edge - K.snapT;
  return g.cs2d(
    g.rect(-inner, -root, inner, OVER),
    g.rect(edge, -root, edge + K.snapT, OVER),
    g.rect(-edge - K.snapT, -root, -edge, OVER),
  );
}

/** The wall-top pin as a snap. The return face starts a clearance above the cover's top
 *  face and climbs 30° off square, so it holds a full lane and still comes apart with a
 *  firm pull; the lead-in is 45°, which keeps the tip under 4 mm. The wall above catches
 *  it in the same profile grown by the clearance. */
export function pinSnap(clearance: number): SnapSpec {
  const hook = clearance + K.snapCatch;
  const returnSlope = Math.tan(Math.PI / 6);
  const peak = K.coverT + clearance + hook * returnSlope;
  return { width: K.tabW, tip: peak + hook, peak, hook, returnSlope, leadSlope: 1 };
}

/** How far a pin's tip stands above its wall top: what the stack is charged on top. */
export const snapTop = (o: Options) => pinSnap(clearanceOf(o)).tip;

/** A tab that drops through a slot `length` deep: the hook's return face runs parallel
 *  to the slot's 45° flare, a clearance off it, and the 30° lead-in is clipped at the
 *  tip, which is the slot's far face. */
export function tabSnap(clearance: number, length: number, width: number): SnapSpec {
  const hook = clearance + K.snapCatch;
  return { width, tip: length, peak: length - K.snapFlare + hook, hook, returnSlope: 1, leadSlope: 1 / Math.tan(Math.PI / 6) };
}

/** The flare at the far end of a slot `tip` deep, in the same (v, u) frame: the straight
 *  slot's half-width plus 45° outward over the last snapFlare, run OVER past the face. */
export function flareProfile(g: Geo, width: number, clearance: number, tip: number): CS {
  const start = width / 2 + clearance, from = tip - K.snapFlare, wide = start + K.snapFlare + OVER;
  return g.poly([[-start, from], [start, from], [wide, tip + OVER], [-wide, tip + OVER]]);
}
