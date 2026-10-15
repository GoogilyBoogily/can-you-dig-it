import { estimateVolume } from "./estimate";
// Geometry for the can-storage system, on the manifold-3d kernel. Units: mm, Z up.
// test/regress.test.ts pins every part to the ref.json snapshot (bun run ref).

import type { CrossSection as CS, Manifold as M } from "manifold-3d";
import { clearanceOf, earNotchH, tSlotJoint, gangJoint, lipSnap, lipPocket, crossLap, pinJoint, placeSide, earJoint, tabBox, snapTop, pinSnap, tabSnap } from "./features/joints";
import { lay, platePose, riserPose } from "./features/pose";
import { cellsOf, ligFor, autoR, rowsRadius, ROWS } from "./features/lattice";
import { recessDepth, roundOver, roundTop } from "./features/pocket";
import { gridUnit } from "./features/gridfinity";
import { Geo } from "./kernel";
import { partManifest } from "./assembly";
import { tierRole, rearTier, stacksOnTop, laneXe, gangs, deckSides, deckVariant, laneName } from "./layout";
export { tierRole, rearTier, laneXe, deckSides, deckVariant, laneName } from "./layout";
import { chuteInset, queueGeometry, minimumQueueLength } from "./queue";
import { K, DENSITY, baseHeight, gridCells, gridSpan, type Vec2, type Vec3, type Options, type Derived, type Side, type LaneRole, type PlateName } from "./model";
export * from "./model";
export { Geo } from "./kernel";

/** Where the end ears sit in from the deck ends: the ear starts 1 mm inside. */
const tabIn = K.earW / 2 + 1;
/** How far an ear keeps from the seam and from a pin: the two solids touch at earW/2
 *  plus the pin's half-width, hooks and chamber included (tabW/2 + snapCatch + 2·cl),
 *  and 2 mm more is clearance, not a hair. On the plain tab's tabW/2 the chamber left a
 *  0.5 mm web beside the end ear's notch at fit 0, and none at fit 0.3. */
const tabClear = K.earW / 2 + K.tabW / 2 + K.snapCatch + 2 * K.cl + 2;
/** How far in from the lane end the wall-top pins sit (±px): just clear of the rear end
 *  ear, which stands tabIn in from the end wall. Was a fixed 40, which the 24 mm ear
 *  reached. */
const pinIn = (o: Options) => o.wall + K.post + tabIn + tabClear;

/** Where a wall's lattice field starts. A hexagon only lands a 60° tip over an ear notch;
 *  a square's or a slat's bottom edge, or a circle's chord, would be a 1.25 mm bridge
 *  across 12.5 mm, so every other pattern starts above the recess pads that guard the
 *  tab roots (notchH + padRise). Hex keeps the border so its snapshot does not move. */
const fieldBottom = (o: Options) => (o.pattern === "hex" ? K.border : earNotchH(clearanceOf(o)) + K.padRise);

/** Drop-chute length at the low end of an upper deck: one can plus play, plus the wall. */
const insetFor = chuteInset;

/** Where a span of whole cells sits round the lane's `size`: flush with one end or
 *  centred, the spare on the other side. */
function alignSpan(size: number, cells: number, at: "lo" | "centre" | "hi"): [number, number] {
  const span = gridSpan(cells);
  const lo = at === "lo" ? -size / 2 : at === "hi" ? size / 2 - span : -span / 2;
  return [lo, lo + span];
}

export function solve(o: Options): Derived {
  const tan = Math.tan((o.slope * Math.PI) / 180);
  const inset = insetFor(o);
  const usableX = o.bed[0] - 2 * o.bedMargin;
  const usableY = o.bed[1] - 2 * o.bedMargin;
  // One margin, not two: a part has an edge at each end of X and Y, but it sits on the
  // bed, so the only thing to keep clear in Z is headroom under the gantry.
  const usableZ = o.bed[2] - o.bedMargin;
  const L = Math.min(o.length, 2 * (Math.max(usableX, usableY) - K.spliceDepth));
  // the end wall and the corner post behind it take the last wall + post of every deck
  const n = queueGeometry(o, L).count;
  const nBottom = queueGeometry(o, L, true).count;
  const IW = Math.round((o.canL + o.clearance) * 10) / 10;
  const OW = IW + 2 * o.wall;
  const run = L - inset;
  const dhi = K.deckLo + run * tan;
  // the front can leaves over the lip, and at the crest its top is crest + canD: the
  // tier is as tall as that plus the lip gap needs too, or a short or level lane held
  // cans it could not give up. Upper cascade decks have no lip (their front is the
  // chute); the bottom deck always does
  const front = K.deckLo + K.lipInset * tan + K.lipH + o.canD + o.lipGap;
  const H = Math.ceil(Math.max(dhi + o.canD + K.topgap, o.cascade ? 0 : front));
  const dhiB = K.deckLo + L * tan;
  const Hb = Math.ceil(Math.max(dhiB + o.canD + K.topgap, front));
  const hexR = o.hexAuto ? autoR(H - K.border - fieldBottom(o), ROWS[o.pattern]) : o.hexR;
  // on a grid the lane's floor is the whole cells that cover it, or as many as the shelf
  // has (shelfCells) with the lane overhanging on a skirt, placed round the lane where
  // the alignment says. Lanes sit a floor apart: the baseplate joins them, not a
  // deck tongue. Lane and floor together have to fit the bed, so that is what splits at
  // x = 0 - through a foot as often as not; a foot cut square by the seam prints as it
  // is and the pocket locks it
  const grid = o.base === "gridfinity";
  const floorCells: [number, number] = grid ? [Math.min(gridCells(L), o.shelfCells[0]), Math.min(gridCells(OW), o.shelfCells[1])] : [0, 0];
  const [fx0, fx1] = grid ? alignSpan(L, floorCells[0], o.along === "front" ? "lo" : o.along === "back" ? "hi" : "centre") : [-L / 2, L / 2];
  const [fy0, fy1] = grid ? alignSpan(OW, floorCells[1], o.across === "right" ? "lo" : o.across === "left" ? "hi" : "centre") : [-OW / 2, OW / 2];
  const foot: Derived["foot"] = [Math.min(fx0, -L / 2), Math.min(fy0, -OW / 2), Math.max(fx1, L / 2), Math.max(fy1, OW / 2)];
  const gangPitch = grid ? Math.max(floorCells[1] * K.gridPitch, OW + 2 * K.gridGap) : OW + K.gangGap;
  // What a plate needs on the bed, not what the assembly measures. layWall lays a wall
  // down, so its height becomes the bed's Y and its thickness the bed's Z; the deck is
  // the tall one, since it carries the whole slope. Getting this wrong either offers a
  // lane that cannot be packed or refuses one that prints flat.
  // A ganged deck's tongues reach past its walls: gangReach on the +Y side alone.
  // gangPitch keeps its gap: that is the spacing between lanes on the shelf, not a
  // plate's own footprint.
  const wallPlateY = Math.max(H, Hb) + snapTop(o);
  const deckPlateY = grid ? foot[3] - foot[1] : OW + (gangs(o) ? widestTongues(o) * gangReach(o) : 0);
  const plateY = Math.max(deckPlateY, wallPlateY);
  const wholePlateX = foot[2] - foot[0];
  const split = !((wholePlateX <= usableX && plateY <= usableY) || (wholePlateX <= usableY && plateY <= usableX));
  const deckPlateZ = K.deckLo + (L - o.wall) * tan + (grid ? K.unitH : 0);
  const wallPlateZ = o.wall;
  return {
    n, nBottom, split, L, IW, OW, H, Hb, dhi, dhiB, tan, inset, hexR, lig: ligFor(hexR),
    xd: -L / 2 + inset, px: L / 2 - pinIn(o), py: IW / 2 + o.wall / 2,
    lipy: IW / 2 - 14, railHy: IW / 2 - 20,
    gangPitch,
    plateX: split ? Math.max(-foot[0], foot[2]) + K.spliceDepth : foot[2] - foot[0],
    plateY,
    plateZ: Math.max(deckPlateZ, wallPlateZ), // a riser prints on its side, as thick as a wall
    usableX, usableY, usableZ, floorCells, floor: [fx0, fy0, fx1, fy1], foot,
  };
}

/** Inverse of the deck count in solve(): the shortest lane whose deck holds `cans` whole
 *  cans. `bottom` is the cascade's bottom deck, which has no chute to make room for. */
export function laneLengthFor(o: Options, cans: number, bottom = false): number {
  return minimumQueueLength(o, cans, bottom);
}

export function check(o: Options, d: Derived): string[] {
  const w: string[] = [];
  const big = Math.max(d.usableX, d.usableY);
  if (d.plateX > big) w.push(`FAIL lane half ${d.plateX.toFixed(0)} mm is longer than the bed - shorten the lane`);
  if (d.plateY > big) w.push(`FAIL lane width ${d.plateY.toFixed(0)} mm is wider than the bed - can is too long for this printer`);
  // Each side can clear the long bed axis while the pair still fits no orientation.
  const fitsSquare = d.plateX <= d.usableX && d.plateY <= d.usableY;
  const fitsTurned = d.plateY <= d.usableX && d.plateX <= d.usableY;
  if (!fitsSquare && !fitsTurned) w.push(`FAIL lane ${d.plateX.toFixed(0)} × ${d.plateY.toFixed(0)} mm fits the ${d.usableX.toFixed(0)} × ${d.usableY.toFixed(0)} mm bed in neither orientation`);
  if (d.plateZ > d.usableZ) w.push(`FAIL plate ${d.plateZ.toFixed(0)} mm is taller than the ${d.usableZ.toFixed(0)} mm of Z this printer leaves clear`);
  // The end wall lies flat as OW by its standing height, H - te: posts to full tier height
  // above the deck line at the lane end. Only the tiers that print one count.
  for (let tier = 0; tier < o.tiers; tier++) {
    if (tier === rearTier(o)) continue;
    const ln = laneOf(o, d, tierRole(o, tier));
    const [along, across] = [ln.H - ln.te, d.OW];
    const fits = (along <= d.usableX && across <= d.usableY) || (across <= d.usableX && along <= d.usableY);
    if (!fits) {
      w.push(`FAIL end wall ${along.toFixed(0)} × ${across.toFixed(0)} mm fits the ${d.usableX.toFixed(0)} × ${d.usableY.toFixed(0)} mm bed in neither orientation - use a smaller can or a bigger printer`);
      break;
    }
  }
  // laneOf filters only the interior tabs through clear(); the two end tabs are placed
  // unconditionally. The rear one clears the pin by construction (pinIn); the front one
  // sits inset + tabIn from the lane end and the tier below's wall-top pin at -px is
  // pinIn in, so they are |inset + tabIn - pinIn| apart whatever the lane's length. The
  // margin is laneOf's own tabClear, so the two rules agree. Every part is a valid
  // solid, one piece, no overhang, and it will not seat.
  if (d.inset && Math.abs(d.inset + tabIn - pinIn(o)) < tabClear)
    w.push(`FAIL a ${o.canD} mm can puts the deck's front ear on the pin below - the tier will not seat`);
  if (d.n < 1) w.push("FAIL no cans fit on a deck - lengthen the lane");
  // a short lane's ears, pins and lip pockets leave no stretch of rail for a gang tongue.
  // It still stands on every ear; it just is not keyed to its neighbour
  if (gangs(o) && (["bottom", "top"] as const).some((role) => !laneOf(o, d, role).tongues.length))
    w.push("Lanes this short have no room for the joint that keys them together - they stand side by side, loose");
  if (d.split && d.xd > -K.spliceDepth - 20) w.push("FAIL chute reaches the splice - lengthen the lane");
  if (o.rearLoad && rearTier(o) < 0)
    w.push(stacksOnTop(o)
      ? "Loading from the back is off: a stackable top keeps its end wall to close the chute of the tier that goes on it"
      : "Loading from the back needs an odd tier count here: the top tier's back is its chute, so every end wall stays");
  return w;
}

// ---------------------------------------------------------------- parts
// Every plate is modelled in the orientation it prints in, outer face up, so the packer
// only has to drop it on the bed. The rule each feature has to pass: it is in-plane (tab,
// notch, slot, T-slot, hex cell), it grows up from the print face (rib, pin, boss), or it
// is a pocket in the print face (recess, groove). Nothing on the bed face, nothing under
// an edge. test/overhang.test.ts holds every snapshot part to it.
export interface Plate { name: PlateName; whole?: M; front?: M; rear?: M }
export interface PartSet {
  lanes: { role: LaneRole; plates: Plate[] }[];
  lip: M; riser?: M; cover: M[];
  gridDeck?: Plate; // the deck of the lane on the shelf, on its Gridfinity unit
}

/** What every plate of one lane shares: where the deck is, how tall the walls are, and
 *  where the ties and tabs sit. bottom: no chute, full deck. top: a loading lip instead
 *  of a full end wall, since nothing drops in from above - unless it is stackable. */
export interface Lane {
  bottom: boolean; top: boolean;
  xd: number; // where the deck starts (-L/2 on the bottom lane)
  xe: number; // inner face of the end wall; the deck top is flat from here to L/2
  dhi: number; te: number; H: number; ewh: number;
  lapZ: number; // the corner cross-lap line: the end wall is slotted up to it, the side wall down to it
  tabs: number[]; // x of every wall tab and deck slot
  tongues: number[]; // x of every gang tongue, when the lanes gang
  edges: number[]; // pairs: the open deck bands between ties
  lipx: number;
}

const round1 = (v: number) => Math.round(v * 10) / 10;

/** Where the gang tongues go: one in the middle of every stretch of rail between the end
 *  ears that is clear of everything else under a wall - an ear's width and a 4 mm web from
 *  each ear (both walls notch over a tongue), the ears' own margin from the pins at ±px
 *  and from a seam, and off the lip pockets. The ears keep their places, so every ear is
 *  an ear on both sides: a tongue in an ear's place left the -Y wall of the row's end
 *  lane with nothing under it, and every deck's -Y edge hanging off one ear. */
function tonguesOf(d: Derived, tabs: number[], lipx: number): number[] {
  const blocked: [number, number][] = [
    ...tabs.map((t): [number, number] => [t - K.earW - 4, t + K.earW + 4]),
    [d.px - tabClear, d.px + tabClear], [-d.px - tabClear, -d.px + tabClear],
    [lipx - 20, lipx + 20],
  ];
  if (d.split) blocked.push([-tabClear, tabClear]);
  blocked.sort((a, b) => a[0] - b[0]);
  const tongues: number[] = [];
  let from = Math.min(...tabs);
  const to = Math.max(...tabs);
  for (const [lo, hi] of blocked) {
    if (lo > from && from < to) tongues.push(round1((from + Math.min(lo, to)) / 2));
    from = Math.max(from, hi);
  }
  if (from < to) tongues.push(round1((from + to) / 2));
  return tongues;
}

export function laneOf(o: Options, d: Derived, role: LaneRole): Lane {
  const bottom = role === "bottom", top = role === "top";
  const { L } = d;
  const xd = bottom ? -L / 2 : d.xd;
  const xe = laneXe(o, d);
  const dhi = bottom ? d.dhiB : d.dhi;
  const H = bottom ? d.Hb : d.H;
  const te = K.deckLo + (xe - xd) * d.tan;
  const lipx = xd + K.lipInset;
  const minimal = o.design === "minimal";

  // deck centre band: open between the rails, cross-ties every ~80 mm, a tie at each end
  const endTie = minimal ? K.minimalT : 6;
  const x0 = xd + endTie, x1 = xe - endTie;
  const nt = Math.max(1, Math.round((x1 - x0) / 80) - 1);
  const interior: number[] = [];
  for (let i = 0; i < nt; i++) interior.push(round1(x0 + ((x1 - x0) * (i + 1)) / (nt + 1)));
  // the deck's ears, and the wall tabs through them: one near each end and one at every
  // interior tie that is clear of the seam (the deck tongue lives there) and of the pins
  // at ±px
  const clear = (t: number) => Math.abs(t) >= tabClear && Math.abs(Math.abs(t) - d.px) >= tabClear;
  const tabs = [xd + tabIn, xe - tabIn, ...interior.filter(clear)];
  const tongues = gangs(o) ? tonguesOf(d, tabs, lipx) : [];
  const ties = new Set<number>([round1(lipx), ...interior]);
  if (d.split) ties.add(round1(-K.spliceDepth / 2));
  const tw = minimal ? K.minimalT : 8;
  // the lip tie holds the lip pockets, the splice tie the deck tongue: 10 mm each side.
  // An interior tie can land inside one of those bands; merge, or its far edge would
  // start the next opening inside the band and leave the tongue rooted on a sliver.
  const edges: number[] = [x0];
  for (const t of [...ties].sort((a, b) => a - b)) {
    const special = Math.abs(t - lipx) < 1 || (d.split && Math.abs(t + K.spliceDepth / 2) < 1);
    const half = special ? 10 : tw / 2;
    const last = edges.length - 1;
    if (last > 0 && t - half <= edges[last]) {
      // both ends: a narrow tie sorted just before the splice tie would otherwise leave
      // the band starting at its own edge, 1.5 mm short of the socket
      edges[last - 1] = Math.min(edges[last - 1], t - half);
      edges[last] = Math.max(edges[last], t + half);
    } else edges.push(t - half, t + half);
  }
  edges.push(x1);
  return { bottom, top, xd, xe, dhi, te, H, ewh: top && !stacksOnTop(o) ? dhi + K.lipH : H, lapZ: te + K.lap, tabs, tongues, edges, lipx };
}

/** The most tongues any one deck carries: what its plate is charged across. */
const widestTongues = (o: Options) =>
  Math.max(...Array.from({ length: o.lanesWide }, (_, lane) => deckSides(o, lane).filter((side) => side === "tongue").length));

/** Tongues on the row's outer sides: each stands gangReach past its wall, less the gap a
 *  pitch already holds. What the solver charges the shelf. */
export const outerTongues = (o: Options) => (gangs(o) ? [o.left, o.right].filter((side) => side === "tongue").length : 0);
/** How far a tongue runs past its own wall's outer face: the gap, the neighbour's wall
 *  and the T inside the neighbour's rail. */
export const gangReach = (o: Options) => K.gangGap + o.wall + K.spliceDepth;
/** The neighbour wall's inner face, where the T starts, in the lane frame. */
export const gangInner = (o: Options, d: Derived) => d.OW / 2 + K.gangGap + o.wall;

/** The deck's (x, z) profile: a wedge from the deck start to the end wall, flat past it,
 *  down to `zb` (below zero when a Gridfinity unit hangs under the pan). */
const deckProfile = (g: Geo, d: Derived, ln: Lane, zb = 0): CS =>
  g.poly([[ln.xd, zb], [d.L / 2, zb], [d.L / 2, ln.te], [ln.xe, ln.te], [ln.xd, K.deckLo]]);

export function buildDeck(g: Geo, o: Options, d: Derived, ln: Lane, sides: [Side, Side] = ["tongue", "socket"]): M {
  const { IW } = d;
  const minimal = o.design === "minimal";
  // the wedge sits between the walls. Under each wall it puts out an ear as tall as the
  // deck's low end, with the slot the wall's tab drops through: that is what holds the
  // deck up on the tier below, and the wall to the deck. Ganged, a tongue between the
  // ears runs out under both walls into a T socket in the neighbour's rail; both walls
  // notch over it and it stands on both wall tops below
  const adds = [g.prismY(deckProfile(g, d, ln), IW, -IW / 2)];
  const earJ = earJoint(g, { wall: o.wall, through: ln.dhi, clearance: clearanceOf(o) });
  const cuts: M[] = [];
  for (const tx of ln.tabs) adds.push(placeSide(earJ.ear, 1, tx, d.py, 0), placeSide(earJ.ear, -1, tx, -d.py, 0));
  if (ln.tongues.length) {
    const inner = gangInner(o, d);
    const gang = gangJoint(g, { run: inner - (IW / 2 - 1), clearance: clearanceOf(o), through: ln.dhi, wall: o.wall });
    // the joint is built for the +Y side; mirrored, the same tongue and socket serve -Y
    for (const [side, sy] of [[sides[0], 1], [sides[1], -1]] as const) {
      for (const gx of ln.tongues) {
        if (side === "tongue") adds.push(placeSide(gang.male, sy, gx, sy * inner, 0));
        if (side === "socket") cuts.push(placeSide(gang.female, -sy, gx, sy * IW / 2, 0));
      }
    }
  }
  if (!o.solid) {
    // minimal: the rail is a 2.5 mm fin at the inner edge of the standard rail, and the
    // strip between fin and wall opens too. A necked can is widest at its body, which
    // ends ~12 mm short of each end; pushed over by the full side play the body edge sits
    // at IW/2 - 15.5, still over the fin. It stands on the bed: compression, no bridging.
    const strip = IW / 2 - d.railHy - K.minimalT;
    // under each ear the strip keeps an ear-high plinth out to the fin, 3 mm past a
    // socket head: an ear is rooted in the deck by earRoot, and inside a 2.5 mm tie the tab
    // hole takes all of it. Six loose 12 × 6 × 4 chips a lane, once
    // Under a tongue it is 3 mm wider again: the -Y side carries the neighbour's socket,
    // and the arms beside the head are what hold the row together in Y - 2.75 mm at the
    // ear's width, 5.75 here
    const plinth = Math.max(K.earW, K.gangHead) / 2 + 3;
    const socketPlinth = plinth + 3;
    const earPads = [
      ...ln.tabs.map((tx) => g.rect(tx - plinth, -IW, tx + plinth, IW)),
      ...ln.tongues.map((tx) => g.rect(tx - socketPlinth, -IW, tx + socketPlinth, IW)),
    ];
    const earPadUnion = g.cs2d(...earPads);
    for (let i = 0; i + 1 < ln.edges.length; i += 2) {
      const a = ln.edges[i], b = ln.edges[i + 1];
      if (b - a <= 12) continue;
      cuts.push(g.box(b - a, 2 * d.railHy, ln.dhi + 4, (a + b) / 2, 0, ln.dhi / 2 + 1));
      if (minimal) for (const sy of [1, -1]) {
        const face = g.rect(a, sy * (IW / 2 - strip), b, sy * IW / 2);
        cuts.push(g.prismZ(face, ln.dhi + 4, K.deckLo));
        const open = face.subtract(earPadUnion); // hoisted: five bands x two sides rebuilt it
        if (!open.isEmpty()) cuts.push(g.prismZ(open, K.deckLo + 1, -1)); // a band a plinth covers whole extrudes to an invalid solid
      }
    }
  }
  const lip = lipSnap(g, lipTabLength(d), clearanceOf(o));
  for (const sy of [1, -1]) {
    for (const tx of ln.tabs) cuts.push(placeSide(earJ.slot, sy, tx, sy * d.py, 0));
    const pocket = lipPocket(g, clearanceOf(o), 40, 10);
    cuts.push(pocket.translate([ln.lipx, sy * d.lipy, 0]), lip.flare.translate([ln.lipx, sy * d.lipy, 0]));
  }
  const deck = g.assemble(adds, cuts);
  return deck;
}

/** A side wall in the lane frame, before it is laid flat: sy = +1 is the left wall, -1
 *  the right. Stands on the shelf or on the wall top of the tier below, full height, and
 *  notches over the deck's ears with a tab down through each. */
export function buildWall(g: Geo, o: Options, d: Derived, ln: Lane, sy: number): M {
  const { L, IW, OW } = d;
  const H = ln.H;
  const y0 = sy > 0 ? IW / 2 : -OW / 2;
  const c = clearanceOf(o);
  const notchH = earNotchH(c);
  const pinJ = pinJoint(g, { wall: o.wall, clearance: c });
  const earJ = earJoint(g, { wall: o.wall, through: 0, clearance: c });
  const adds = [g.box(L, o.wall, H, 0, y0 + o.wall / 2, H / 2)];
  for (const sx of [1, -1]) adds.push(placeSide(pinJ.pin, sy, sx * d.px, sy * d.py, H));
  const cuts: M[] = [g.prismX(roundOver(g, sy * OW / 2, H, sy, K.edgeR), L + 2, -L / 2 - 1)];
  for (const sx of [1, -1]) cuts.push(pinJ.relief.translate([sx * d.px, sy * d.py, H]));
  cuts.push(...wallNotches(g, o, d, ln, sy, c, pinJ, earJ));
  if (!o.solid) cuts.push(...wallPerforation(g, o, d, ln, sy, c, notchH));
  const m = g.assemble(adds, cuts);
  return m;
}

/** What keys the wall: a notch over each deck ear with the wall's own tab left standing in
 *  it (so the ear's slot stays), the corner slot the end wall drops into from the top
 *  edge down to the lap line, and the notches for the tier below's pins or the risers'
 *  bosses. */
function wallNotches(g: Geo, o: Options, d: Derived, ln: Lane, sy: number, c: number, pinJ: ReturnType<typeof pinJoint>, earJ: ReturnType<typeof earJoint>): M[] {
  const cuts = ln.tabs.map((tx) => placeSide(earJ.notch, sy, tx, sy * d.py, 0));
  if (ln.tongues.length) {
    const gang = gangJoint(g, { run: 1, clearance: c, through: 1, wall: o.wall });
    for (const gx of ln.tongues) cuts.push(gang.notch.translate([gx, sy * d.py, 0]));
  }
  const lap = crossLap(g, { wall: o.wall, lapZ: ln.lapZ, H: ln.H, clearance: c });
  cuts.push(lap.female.translate([ln.xe, sy * d.py, 0]));
  for (const sx of [1, -1]) cuts.push(pinJ.notch.translate([sx * d.px, sy * d.py, 0]));
  return cuts;
}

/** What the snaps take out of a wall's edges, grown by the thinnest ligament we print
 *  so no cell runs into them: the relief over each ear tab, the relief under each
 *  wall-top pin, and the chamber over each pin of the tier below. A cell touching one is
 *  dropped, like any keep-out. */
function snapKeepOuts(g: Geo, o: Options, d: Derived, ln: Lane, c: number): CS[] {
  const pin = pinSnap(c), tab = tabSnap(c, earNotchH(c), K.tabW);
  const half = K.tabW / 2 + K.snapT + K.ligMin, chamberHalf = K.tabW / 2 + pin.hook + c + K.ligMin;
  const tabTop = earNotchH(c) + K.snapLen - tab.peak + K.ligMin;
  return [
    ...ln.tabs.map((tx) => g.rect(tx - half, -1, tx + half, tabTop)),
    ...[1, -1].map((sx) => g.rect(sx * d.px - half, ln.H - (K.snapLen - pin.peak) - K.ligMin, sx * d.px + half, ln.H + 1)),
    ...[1, -1].map((sx) => g.rect(sx * d.px - chamberHalf, -1, sx * d.px + chamberHalf, pin.tip + c + K.ligMin)),
  ];
}

/** The lattice through the wall and the recess of its outer face down to a web, both
 *  clear of the seam's border and the corner slot's column. */
function wallPerforation(g: Geo, o: Options, d: Derived, ln: Lane, sy: number, c: number, notchH: number): M[] {
  const { L, IW, OW } = d;
  const H = ln.H, b = K.border;
  const y0 = sy > 0 ? IW / 2 : -OW / 2;
  const keep: CS[] = [];
  if (d.split) keep.push(g.rect(-b, 0, b, H));
  const endNotch = g.rect(ln.xe - 3 - c, -1, L / 2 + 1, H + 1);
  keep.push(endNotch, ...snapKeepOuts(g, o, d, ln, c));
  const panel = g.rect(-L / 2 + b, fieldBottom(o), L / 2 - b, H - b);
  const cuts: M[] = [];
  const wcells = cellsOf(g, o.pattern, d.hexR, d.lig, panel, keep);
  if (wcells) cuts.push(g.prismY(wcells, o.wall + 2, y0 - 1));

  // recess the outer face over the lattice field to a web, inside a frame: the border
  // stays full thickness round it, and along the bottom it runs up past the ear notches
  // by padRise, so every tab root and notch sits in a full-thickness wall and the bottom
  // edge is one straight band. Until 2026-09-22 the recess ran down through the bottom
  // border with a pad left over each notch - eleven posts along the edge of a face you
  // look at. The minimal web is four 0.42 mm lines, the same floor as the ligament
  // width: two perimeters a side, no infill
  const rd = recessDepth(o);
  if (rd) {
    const field = panel.subtract(g.cs2d(...keep));
    for (const comp of field.decompose()) {
      const { min: [gx0], max: [gx1] } = comp.bounds();
      const face = g.rect(gx0, notchH + K.padRise, gx1, H - b).subtract(endNotch);
      cuts.push(g.prismY(face, rd + 1, sy > 0 ? OW / 2 - rd : -OW / 2 - 1));
    }
  }
  return cuts;
}

/** The high-end wall in the lane frame: closes the chute of the tier above, or is a
 *  20 mm loading lip on a top lane. Stands on the flattened deck end and cross-laps the
 *  side walls: a post over each, full tier height whatever the lip, slotted from the
 *  bottom up to the lap line so it sits over the side wall standing on the deck below.
 *  It drops in from the top; the side walls' slots hold it in X both ways, and its body
 *  between them stops them closing in (the deck ears hold them out). */
export function buildEndWall(g: Geo, o: Options, d: Derived, ln: Lane): M {
  const { IW, OW } = d;
  const { xe, te, ewh, H } = ln;
  const b = K.border, xo = xe + o.wall;
  const lap = crossLap(g, { wall: o.wall, lapZ: ln.lapZ, H, clearance: clearanceOf(o) });
  const adds = [g.box(o.wall, IW, ewh - te, xe + o.wall / 2, 0, (ewh + te) / 2)];
  for (const sy of [1, -1]) adds.push(lap.male.translate([xe, sy * d.py, 0]));
  // the outer top edge rounds, like the side walls'. A loading lip's inner edge stays
  // square: printed outer face up it would be a round on the bed edge, and a can loaded
  // over the lip slides over the outer edge anyway
  const cuts: M[] = [g.prismY(roundOver(g, xo, ewh, 1, K.edgeR), IW, -IW / 2)];
  for (const sy of [1, -1]) cuts.push(g.prismY(roundOver(g, xo, H, 1, K.edgeR), o.wall, sy > 0 ? IW / 2 : -OW / 2));
  if (!o.solid) {
    const gy0 = -IW / 2 + b, gy1 = IW / 2 - b;
    const ecells = cellsOf(g, o.pattern, d.hexR, d.lig, g.rect(gy0, te + b, gy1, ewh - b), []);
    if (ecells) cuts.push(g.prismX(ecells, o.wall + 2, xe - 1));
    const rd = recessDepth(o);
    // framed like the side walls': the border stays full thickness along the bottom too
    if (rd) cuts.push(g.prismX(g.rect(gy0, te + b, gy1, ewh - b), rd + 1, xo - rd));
  }
  return g.assemble(adds, cuts);
}

export { platePose, lipPose, riserPose, stand, type Pose } from "./features/pose";

/** Lay a side wall flat, outer face up. The viewer stands it back up with the same pose. */
const layWall = (m: M, sy: number, IW: number): M => lay(m, platePose(sy > 0 ? "wall-left" : "wall-right", IW, 0));
const layEndWall = (m: M, xe: number): M => lay(m, platePose("end-wall", 0, xe));

/** Cut a plate at x=0 into a front and a rear half joined by an in-plane T-slot: the
 *  rear keeps the tongue, the front gets the socket. `tongue` and `socket` are the
 *  T profiles, rear-pointing, already extruded through the plate. */
function splitPlate(g: Geo, plate: M, tongue: M, socket: M): [M, M] {
  const bb = plate.boundingBox();
  const big = Math.max(bb.max[0] - bb.min[0], bb.max[1] - bb.min[1], bb.max[2] - bb.min[2]) * 2 + 20;
  const rear = g.union([g.isect(plate, g.box(big, big, big, big / 2, 0, 0)), g.isect(plate, tongue)]);
  const front = g.diff(g.isect(plate, g.box(big, big, big, -big / 2, 0, 0)), [socket]);
  return [front, rear];
}

/** Deck: the tongue is the wedge itself inside the T, so it carries the slope.
 *  `zb` is the deck's underside: a grid deck's floor and feet hang below the pan, and
 *  the tongue takes them too, so it stands on the bed instead of over the socket. */
export function splitDeck(g: Geo, o: Options, d: Derived, ln: Lane, deck: M, zb = 0): [M, M] {
  const w = d.plateY; // wider than any tongue; the floor of a grid deck is this wide
  const wedge = g.prismY(deckProfile(g, d, ln, zb), w, -w / 2);
  const t = tSlotJoint(g, { neck: K.spliceBase, head: K.spliceTip, clearance: clearanceOf(o), zb, H: ln.H });
  const tongue = g.isect(wedge, t.male);
  return splitPlate(g, deck, tongue, t.female);
}


/** Wall: a plain cut at x = 0, the halves butted. Each half stands on its own ears, which
 *  hold it in X and Y, and the tier above and the cover bridge the seam. A T here had to
 *  slide in Y before the wall went on: the one joint that did not drop in. */
export function splitWall(g: Geo, d: Derived, wall: M): [M, M] {
  const [rear, front] = wall.splitByPlane([1, 0, 0], 0);
  return [front, rear];
}

/** How deep the lip's tab drops: the deck's thickness at the lip pocket, so the tab ends
 *  flush with the underside at every slope. */
const lipTabLength = (d: Derived) => K.deckLo + K.lipInset * d.tan;

/** The dispense lip, flat on its back: blade x ∈ [-lipH, 0], tabs past x = 0 in the bed
 *  plane, the scoop a vertical cylinder past the top edge. The face-up edges round, and
 *  that face goes toward the cans. */
export function buildLip(g: Geo, o: Options, d: Derived): M {
  const t = K.lipTabT;
  // The tab is as long as the deck is thick where it drops through, so it ends flush with
  // the underside at every slope. The viewer stands the lip up with ry = 90 degrees, which
  // maps (x, y, z) to (z, y, -x): this x is the insertion depth, and the t is what has to
  // fit the pocket, lipTabT plus the clearance a side. A fixed 6 protruded by 2 - 8*tan -
  // up to a 2 mm stud at slope 0.
  const tabLen = lipTabLength(d);
  // The blade drops between the wall inner faces, so its width is a clearance like any
  // other: K.cl + fit a side. It was a flat 0.5 mm a side however the fit was set, then
  // 0.5 + fit; now the same 0.25 every other joint gets.
  const outline = g.roundedRect(K.lipH, d.IW - 2 * clearanceOf(o), 2.4).translate([-K.lipH / 2, 0]);
  let blade = roundTop(g, g.prismZ(outline, t), outline, t, 2);
  if (d.tan > 0) {
    // Standing maps print (x, z) to (z, -x). Past the pocket centre,
    // the uphill deck rises into the blade by (z - t/2) * tan.
    // Relieve only the blade, before adding the snap tabs and their roots.
    const seat = g.poly([[0, t / 2], [0, t], [-t / 2 * d.tan, t]]);
    blade = g.diff(blade, [g.prismY(seat, d.IW + 2, -d.IW / 2 - 1)]);
  }
  const parts = [blade];
  const snap = lipSnap(g, tabLen, clearanceOf(o));
  const cuts = [g.cyl(22, t + 2, -K.lipH - 12, 0, -1, 64)]; // the scoop
  for (const sy of [1, -1]) {
    parts.push(snap.tab.translate([0, sy * d.lipy, 0]));
    cuts.push(snap.relief.translate([0, sy * d.lipy, 0]));
  }
  return g.assemble(parts, cuts);
}

/** A foot under a wall at ±px: as thick as the wall, since the deck starts at the wall's
 *  inner face and the next gang 3 mm past its outer one. The boss is the wall-top pin's
 *  snap and goes into the wall's bottom notch. Built standing, laid on its side to print:
 *  stood up, the prongs would flex across their layers. */
function buildRiser(g: Geo, o: Options, h: number): M {
  const pinJ = pinJoint(g, { wall: o.wall, clearance: clearanceOf(o) });
  // the boss stays flush with the face the riser prints on (-y), so it rises off the bed
  // with it; centred, its underside hung in the air
  const boss = pinJ.pin.translate([0, 0, h]);
  const riser = g.assemble([g.box(K.riserL, o.wall, h, 0, 0, h / 2), boss], [pinJ.relief.translate([0, 0, h])]);
  return lay(riser, riserPose);
}

/** The bottom-tier deck as a Gridfinity bin: the ordinary deck on a 7 mm unit that
 *  hangs below it, z −7 to 0 - a floor of whole cells round the lane (`d.floor`, where
 *  the alignment put it), a foot under every cell, and the riser's boss at ±px for the
 *  walls, which stand on the floor. The
 *  deck's underside is one plane with the wall bottoms, so every cut it has stops at
 *  z = 0; the lip's tab now ends flush with the pan, and its pocket keeps 1 mm of
 *  clearance under it for the fit. Prints as it sits, feet down, like every bin. */
function buildGridDeck(g: Geo, o: Options, d: Derived, ln: Lane, deck: M): M {
  const unit = gridUnit(g, d, o.magnets, clearanceOf(o));
  const adds = [deck, unit.floor];
  if (unit.skirt) adds.push(unit.skirt);
  // plain bosses, not snaps: the grid deck prints feet down, so a prong here would flex
  // across its layers, and the walls' tabs already snap them to the deck
  const boss = tabBox(g, K.pinH, o.wall, 0);
  for (const sx of [1, -1]) for (const sy of [1, -1]) adds.push(placeSide(boss, sy, sx * d.px, sy * d.py, 0));
  const cuts = [...unit.pockets];
  for (const sy of [1, -1]) cuts.push(lipPocket(g, clearanceOf(o), 2, 0).translate([ln.lipx, sy * d.lipy, 0]));
  const out = g.assemble(adds, cuts);
  return out;
}

export function buildCover(g: Geo, o: Options, d: Derived): M[] {
  const { L, OW } = d, t = K.coverT;
  const outline = g.rect(-L / 2, -OW / 2, L / 2, OW / 2);
  const plate = roundTop(g, g.prismZ(outline, t), outline, t, t / 2);
  const cuts: M[] = [];
  const pinJ = pinJoint(g, { wall: o.wall, clearance: clearanceOf(o) });
  for (const sx of [1, -1]) for (const sy of [1, -1]) cuts.push(placeSide(pinJ.hole, sy, sx * d.px, sy * d.py, 0));
  // cascade loading window: the top tier loads from above at its high end, so the cover
  // opens there, one can wide and the full inner width (only the wall strips remain).
  // A flat top tier loads from the front over its lip and keeps a whole cover.
  const keep: CS[] = [];
  if (o.cascade) {
    const windowL = o.canD + 8;
    const window = g.roundedRect(windowL, d.IW, 6).translate([laneXe(o, d) - windowL / 2, 0]);
    cuts.push(g.prismZ(window, t + 2, -1));
    keep.push(window.offset(4, "Miter"));
  }
  if (!o.solid) {
    // No keep-out round the pin holes: the field stops coverInset in from OW/2 and the
    // holes are at py + (tabT − wall)/2 = IW/2 + 1.5, 6.5 mm outside it - the cells never
    // reach them. The rectangles that used to be here were centred on d.py, not the
    // holes' own y, and were 2 mm short of the field even so.
    // bigger cells and fat bars than the walls: a grille, not a lattice
    const inset = K.coverInset;
    const field = g.rect(-L / 2 + inset, -OW / 2 + inset, L / 2 - inset, OW / 2 - inset);
    // the grille has its own radius, sized like the walls' so three whole rows fill the
    // field, but with bars coverBar of the radius instead of the wall's ligament rule
    const coverR = rowsRadius(OW - 2 * inset, ROWS[o.pattern], K.coverBar);
    let cells: CS | null;
    if (o.design === "minimal" && o.pattern !== "slat") {
      // a perforated sheet: bigger cells on the ligament rule, running to the frame and
      // clipped there. Whole cells leave the open area to luck - how many fit between the
      // pins and the window swings with the can - where clipping makes it the cell's
      // own 83 % of the field whatever the size. A slat clipped to the grown field is a
      // square-ended slot that ignores the rail count, so slats take the whole-row path.
      const R = 1.5 * coverR;
      const grid = cellsOf(g, o.pattern, R, ligFor(R), field.offset(2 * R, "Miter"), []);
      cells = grid && grid.intersect(field).subtract(g.cs2d(...keep));
    } else {
      cells = cellsOf(g, o.pattern, coverR, coverR / 2, field, keep);
    }
    if (cells) {
      // the seam crosses the field; clip cells at its solid band rather than dropping
      // them, so the pattern carries over the joint instead of leaving a blank
      if (d.split) cells = cells.subtract(g.rect(-K.coverSeam, -OW, K.coverSeam, OW));
      const pieces = cells.decompose().filter((piece) => piece.area() > 40);
      cells = pieces.length ? g.cs2d(...pieces) : null;
    }
    if (cells) cuts.push(g.prismZ(cells, t + 2, -1));
  }
  const m = g.diff(plate, cuts);
  if (d.split) {
    const [rear, front] = m.splitByPlane([1, 0, 0], 0);
    return [front, rear];
  }
  return [m];
}

/** Every deck a row prints, once each, with its sides and how many lanes use it. */
export function deckKinds(o: Options): { name: PlateName; sides: [Side, Side]; count: number }[] {
  const kinds = new Map<PlateName, { name: PlateName; sides: [Side, Side]; count: number }>();
  for (let lane = 0; lane < o.lanesWide; lane++) {
    const name = deckVariant(o, lane);
    const kind = kinds.get(name) ?? { name, sides: deckSides(o, lane), count: 0 };
    kind.count++;
    kinds.set(name, kind);
  }
  return [...kinds.values()];
}

/** The four plates of one lane, laid flat, split at the seam when the lane is long. A row
 *  whose ends join differently from its inner lanes has a deck for each end too. */
export function buildLanePlates(g: Geo, o: Options, d: Derived, role: LaneRole, requested?: ReadonlySet<PlateName>): Plate[] {
  const ln = laneOf(o, d, role);
  const wanted = (name: PlateName) => !requested || requested.has(name);
  const plates: Plate[] = [];
  for (const { name, sides } of deckKinds(o)) {
    if (!wanted(name)) continue;
    const deck = buildDeck(g, o, d, ln, sides);
    if (d.split) {
      const [front, rear] = splitDeck(g, o, d, ln, deck);
      plates.push({ name, front, rear });
    } else plates.push({ name, whole: deck });
  }
  for (const side of [1, -1]) {
    const name = side > 0 ? "wall-left" : "wall-right";
    if (!wanted(name)) continue;
    const wall = buildWall(g, o, d, ln, side);
    if (d.split) {
      const [front, rear] = splitWall(g, d, wall);
      plates.push({ name, front: layWall(front, side, d.IW), rear: layWall(rear, side, d.IW) });
    } else plates.push({ name, whole: layWall(wall, side, d.IW) });
  }
  if (wanted("end-wall")) plates.push({ name: "end-wall", whole: layEndWall(buildEndWall(g, o, d, ln), ln.xe) });
  return plates;
}

export function buildAll(g: Geo, o: Options, d: Derived): PartSet {
  const requested = new Map<LaneRole, Set<PlateName>>();
  for (const descriptor of partManifest(o, d)) {
    if (descriptor.source.kind !== "lane") continue;
    const { laneRole, plate } = descriptor.source;
    const plates = requested.get(laneRole!) ?? new Set<PlateName>();
    plates.add(plate!);
    requested.set(laneRole!, plates);
  }
  return {
    lanes: [...requested].map(([role, plates]) => ({ role, plates: buildLanePlates(g, o, d, role, plates) })),
    lip: buildLip(g, o, d),
    riser: o.base === "feet" ? buildRiser(g, o, 24) : undefined,
    cover: o.cover ? buildCover(g, o, d) : [],
    gridDeck: o.base === "gridfinity" ? buildGridDeckPlate(g, o, d, tierRole(o, 0)) : undefined,
  };
}

/** The shelf lane's deck on its Gridfinity unit, split like any deck when the lane is long. */
function buildGridDeckPlate(g: Geo, o: Options, d: Derived, role: LaneRole): Plate {
  const ln = laneOf(o, d, role);
  const deck = buildGridDeck(g, o, d, ln, buildDeck(g, o, d, ln));
  if (!d.split) return { name: "deck", whole: deck };
  const [front, rear] = splitDeck(g, o, d, ln, deck, -K.unitH);
  return { name: "deck", front, rear };
}

// ---------------------------------------------------------------- the print list
export type PartRole = "lane" | "lip" | "riser" | "cover";
interface Part { name: string; mesh: M; qty: number; role: PartRole }

/** Every part to print, named and counted, in the order they are packed. A split plate
 *  is two parts, -front and -rear. On a Gridfinity base the shelf lane's deck is
 *  grid-deck and its plain deck is not printed; risers only come with feet. */
export function partList(set: PartSet, o: Options): Part[] {
  const split = set.lanes.some((lane) => lane.plates.some((plate) => !!plate.front)) || !!set.gridDeck?.front || set.cover.length > 1;
  const manifest = partManifest(o, { ...solve(o), split });
  return manifest.map(({ name, source, qty, role }) => {
    let mesh: M | undefined;
    if (source.kind === "lane") {
      const plate = set.lanes.find((lane) => lane.role === source.laneRole)?.plates.find((plate) => plate.name === source.plate);
      mesh = source.half ? plate?.[source.half] : plate?.whole;
    } else if (source.kind === "grid") mesh = source.half ? set.gridDeck?.[source.half] : set.gridDeck?.whole;
    else if (source.kind === "cover") mesh = set.cover[source.half === "rear" ? 1 : 0];
    else mesh = source.kind === "lip" ? set.lip : set.riser;
    if (!mesh) throw new Error(`Missing requested part ${name}`);
    return { name, mesh, qty, role };
  });
}


/** Filament estimate: layer-sum of (shell + infill * core), like cansys.py, with skins:
 *  the core is what sits inside the perimeters with `skin` of material above and below.
 *  A slicer prints the rest solid, so a plate thinner than two skins has no core at all
 *  and a sloped deck top is solid along the whole slope, not only at its edge.
 *  The part's height is cut into whole steps of at most `dz`, sampled at their middles,
 *  and never fewer than eight: stepping by `dz` from the bottom weighed the last sample
 *  a whole `dz` however little of the part was left, and a 2.4 mm cover sampled twice
 *  had its skin probes off both faces and counted solid - +43 % on the cover. At 0.5 no
 *  default part is more than 7.3 % off a 0.1 mm sampling and the set is within 3 %; 1.5
 *  was 15 % on the lip and the decks, for 20 ms a build saved. */
export function filamentGrams(m: M, dz = 0.5, shell = 1.26, infill = 0.06, density = DENSITY, skin = 1): number {
  return estimateVolume(m, { shell, infill, density, topSkin: skin, bottomSkin: skin, assumptions: [] }, dz) / 1000 * density;
}
