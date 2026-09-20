// Geometry for the can-storage system, on the manifold-3d kernel. Units: mm, Z up.
// test/regress.test.ts pins every part to the ref.json snapshot (bun run ref).

import type { CrossSection as CS, Manifold as M, ManifoldToplevel } from "manifold-3d";

export type Vec2 = [number, number];
export type Vec3 = [number, number, number];
/** Cell pitch and half-extents for Geo.cells; `stagger` offsets odd rows by dx/2. */
export interface Lattice { dx: number; dy: number; hw: number; hh: number; stagger: boolean }

// ---------------------------------------------------------------- spec
/** standard: the lattice as designed. minimal: same joints and dimensions; wall web, deck
 *  rails, ties and end wall thinned to what the loads need, the cover a perforated sheet. */
export type Design = "standard" | "minimal";
export const DESIGNS: readonly Design[] = ["standard", "minimal"];

/** The perforation of the walls, end wall and cover; orthogonal to the design. Every one
 *  is an in-plane through-cut. Spec in docs/superpowers/specs/2026-09-18-pattern-axis-design.md. */
export type Pattern = "hex" | "circle" | "kumiko" | "slat" | "breeze";
export const PATTERNS: readonly Pattern[] = ["hex", "circle", "kumiko", "slat", "breeze"];
/** How far three whole rows of a pattern span, as a·R + b·lig; autoR inverts it. */
export const ROWS: Record<Pattern, readonly [number, number]> = {
  hex: [5, Math.sqrt(3)], // 2R + 2 * 1.5P, P = R + lig / sqrt(3)
  circle: [2 + 2 * Math.sqrt(3), Math.sqrt(3)], // 2R + 2 * (sqrt(3) / 2)(2R + lig)
  kumiko: [6, 2], breeze: [6, 2], // three 2R squares, two bars
  slat: [6, 4], // three 2R openings, two 2·lig rails
};

/** flat: the lane sits on the shelf. feet: 24 mm risers under the bottom tier (wire
 *  shelves, a lip to clear). gridfinity: the bottom deck grows a 7 mm unit of Gridfinity
 *  feet and drops into the baseplate you have. Spec in
 *  docs/superpowers/specs/2026-09-19-gridfinity-base-design.md. */
export type Base = "flat" | "feet" | "gridfinity";
export const BASES: readonly Base[] = ["flat", "feet", "gridfinity"];
/** Where the lane sits on its floor of whole cells: the spare goes to the other side.
 *  Across the lane, left is +Y (seen from the front); along it, front is the lip end. */
export type Across = "left" | "centre" | "right";
export type Along = "front" | "centre" | "back";
export const ACROSS: readonly Across[] = ["left", "centre", "right"];
export const ALONG: readonly Along[] = ["front", "centre", "back"];

export interface Options {
  canD: number;
  canL: number;
  length: number; // target lane length; > usable bed → two keyed halves
  tiers: number;
  lanesWide: number;
  cascade: boolean; // true: drop chute at the low end, tiers alternate 180°. false: flat decks
  slope: number; // degrees
  lipGap: number; // headroom over the lip crest for the can leaving over it; the tier grows to give it
  wall: number;
  clearance: number;
  fit: number;
  hexR: number; // cell radius when hexAuto is off
  hexAuto: boolean; // size cells so three whole rows fill the wall
  solid: boolean; // no lattice at all; overrides design and pattern
  design: Design;
  pattern: Pattern;
  cover: boolean;
  base: Base; // what the bottom tier stands on
  magnets: boolean; // pockets for 6 × 2 mm magnets (cut 6.5 × 2.4) in every Gridfinity foot
  across: Across; along: Along; // the lane on its Gridfinity floor
  shelfCells: [number, number]; // Gridfinity cells the shelf has room for, along and across the lane
  bed: [number, number, number];
  bedMargin: number;
}

export const DEFAULTS: Options = {
  canD: 66, canL: 122.5, length: 480, tiers: 2, lanesWide: 2,
  cascade: true, slope: 3, lipGap: 5, wall: 6, clearance: 3.5, fit: 0, hexR: 13, hexAuto: true,
  solid: false, design: "standard", pattern: "hex", cover: true, base: "flat", magnets: false, across: "centre", along: "centre", shelfCells: [10, 7], bed: [256, 256, 256], bedMargin: 3,
};

// fixed design constants
export const K = {
  deckLo: 4, topgap: 2, slack: 8, lipH: 20, edgeR: 3,
  lipInset: 8, // the lip pockets, and the first can, this far in from the deck start
  minimalT: 2.5, // the minimal design's fins, ties and end ties
  padRise: 4, // a recess pad stands this far above the notch it guards
  hexMin: 8, hexMax: 16, ligMin: 1.7, ligRatio: 0.17,
  border: 5, web: 3.5,
  dovetail: 3, dtBase: 10, dtTip: 14, dtCl: 0.25,
  // one tab for every joint: 8 wide, 3 thick, flush with the plate's inner face. A pin
  // is a tab as tall as the cover is thick, so it sits flush through the cover's hole
  tabW: 8, tabT: 3, pinH: 2.4, coverT: 2.4, sideTabH: 12, earW: 12,
  spliceBase: 30, spliceTip: 40, spliceDepth: 8,
  // Gridfinity: 42 mm cells, a 7 mm unit; a bin is n·42 − 0.5 across. A foot, bottom
  // up: a 35.6 flat, 0.8 chamfer, 1.8 wall, 2.15 chamfer, 41.5 at the top, corners
  // concentric with r 3.75 at the top. Magnets 6 × 2 on a 26 mm square in every cell
  gridPitch: 42, gridGap: 0.25, unitH: 7, footFlat: 35.6, footChamferLo: 0.8, footWall: 1.8,
  footChamferHi: 2.15, footR: 3.75, magnetR: 3.25, magnetDepth: 2.4, magnetPitch: 26,
};

/** PETG, g/cm³: the filament estimates and the solid-print weight. */
export const DENSITY = 1.27;

/** Height the base adds under the bottom tier: what the solver charges the shelf for. On
 *  a grid the feet sit inside the baseplate, so the unit is the whole of it. */
export const baseHeight = (o: Options) => (o.base === "feet" ? 24 : o.base === "gridfinity" ? K.unitH : 0);
/** Whole Gridfinity cells that cover `span` mm. */
export const gridCells = (span: number) => Math.ceil((span + 2 * K.gridGap) / K.gridPitch);
/** The width of `cells` whole cells, gap included: the bin's edge. */
export const gridSpan = (cells: number) => cells * K.gridPitch - 2 * K.gridGap;

export interface Derived {
  n: number; nBottom: number; split: boolean;
  L: number; IW: number; OW: number; H: number; Hb: number;
  run: number; dhi: number; dhiB: number; tan: number; inset: number;
  hexR: number; lig: number;
  xd: number; px: number; py: number; piny: number; lipy: number; railHy: number;
  gangPitch: number; plateX: number; plateY: number; plateZ: number; usableX: number; usableY: number; usableZ: number;
  floorCells: [number, number]; // the lane's cells along and across: what covers it, or what the shelf has
  floor: [number, number, number, number]; // the floor of feet, x0 y0 x1 y1 in the lane frame
  foot: [number, number, number, number]; // lane and floor together: what stands on the shelf and fits the bed
}

/** Ligament grows with the cell so the bars stay in proportion; never under four 0.42 mm lines. */
const ligFor = (R: number) => Math.max(K.ligMin, K.ligRatio * R);

/** The radius at which three whole rows fill a panel of height `panelH`, where three
 *  rows span a·R + b·lig (hex: 2R + 2 * 1.5P with P = R + lig / sqrt(3), so [5, √3]).
 *  1 mm spare so float noise cannot drop the top row. Same cells on every tier, sized
 *  from the upper deck. */
function autoR(panelH: number, [a, b]: readonly [number, number]): number {
  let R = (panelH - 1) / (a + b * K.ligRatio);
  if (K.ligRatio * R < K.ligMin) R = (panelH - 1 - b * K.ligMin) / a;
  return Math.min(K.hexMax, Math.max(K.hexMin, R));
}

/** Where a wall's lattice field starts. A hexagon only lands a 60° tip over an ear notch;
 *  a square's or a slat's bottom edge, or a circle's chord, would be a 1.25 mm bridge
 *  across 12.5 mm, so every other pattern starts above the recess pads that guard the
 *  tab roots (notchH + padRise). Hex keeps the border so its snapshot does not move. */
const fieldBottom = (o: Options) => (o.pattern === "hex" ? K.border : K.deckLo + K.dtCl + o.fit + K.padRise);

/** Drop-chute length at the low end of an upper deck: one can plus play, plus the wall. */
const insetFor = (o: Options) => (o.cascade ? o.canD + 6 + o.wall : 0);

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
  const L = Math.min(o.length, 2 * (usableX - K.spliceDepth));
  const n = Math.floor((L - inset - o.wall - K.slack) / o.canD);
  const nBottom = Math.floor((L - o.wall - K.slack) / o.canD);
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
  // dovetail. Lane and floor together have to fit the bed, so that is what splits at
  // x = 0 - through a foot as often as not; a foot cut square by the seam prints as it
  // is and the pocket locks it
  const grid = o.base === "gridfinity";
  const floorCells: [number, number] = grid ? [Math.min(gridCells(L), o.shelfCells[0]), Math.min(gridCells(OW), o.shelfCells[1])] : [0, 0];
  const [fx0, fx1] = grid ? alignSpan(L, floorCells[0], o.along === "front" ? "lo" : o.along === "back" ? "hi" : "centre") : [-L / 2, L / 2];
  const [fy0, fy1] = grid ? alignSpan(OW, floorCells[1], o.across === "right" ? "lo" : o.across === "left" ? "hi" : "centre") : [-OW / 2, OW / 2];
  const foot: Derived["foot"] = [Math.min(fx0, -L / 2), Math.min(fy0, -OW / 2), Math.max(fx1, L / 2), Math.max(fy1, OW / 2)];
  const split = foot[2] - foot[0] > usableX;
  const gangPitch = grid ? Math.max(floorCells[1] * K.gridPitch, OW + 2 * K.gridGap) : OW + K.dovetail;
  // What a plate needs on the bed, not what the assembly measures. layWall lays a wall
  // down, so its height becomes the bed's Y and its thickness the bed's Z; the deck is
  // the tall one, since it carries the whole slope. Getting this wrong either offers a
  // lane that cannot be packed or refuses one that prints flat.
  const wallPlateY = Math.max(H, Hb) + K.pinH;
  const deckPlateZ = K.deckLo + (L - o.wall) * tan + (grid ? K.unitH : 0);
  const wallPlateZ = o.wall + (o.lanesWide > 1 && !grid ? K.dovetail : 0);
  return {
    n, nBottom, split, L, IW, OW, H, Hb, run, dhi, dhiB, tan, inset, hexR, lig: ligFor(hexR),
    xd: -L / 2 + inset, px: L / 2 - 40, py: IW / 2 + o.wall / 2, piny: IW / 2 + K.tabT / 2,
    lipy: IW / 2 - 14, railHy: IW / 2 - 20,
    gangPitch,
    plateX: split ? Math.max(-foot[0], foot[2]) + K.spliceDepth : foot[2] - foot[0],
    plateY: Math.max(grid ? foot[3] - foot[1] : OW + K.dovetail, wallPlateY),
    plateZ: Math.max(deckPlateZ, wallPlateZ, o.base === "feet" ? 24 + K.pinH : 0),
    usableX, usableY, usableZ, floorCells, floor: [fx0, fy0, fx1, fy1], foot,
  };
}

/** Inverse of the deck count in solve(): the shortest lane whose deck holds `cans` whole
 *  cans. `bottom` is the cascade's bottom deck, which has no chute to make room for. */
export function laneLengthFor(o: Options, cans: number, bottom = false): number {
  return cans * o.canD + (bottom ? 0 : insetFor(o)) + o.wall + K.slack;
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
  // laneOf filters only the interior tabs through clear(); the two end tabs are placed
  // unconditionally. The front one sits at inset + 7 from the deck start and the tier
  // below's wall-top pin at -px is 40 in, so they are |inset + 7 - 40| apart whatever the
  // lane's length. Inside earW/2 + tabW/2 the deck's ear lands on that pin: every part is
  // a valid solid, one piece, no overhang, and the tier will not seat.
  if (d.inset && Math.abs(d.inset + K.tabW / 2 + 3 - 40) < 12)
    w.push(`FAIL a ${o.canD} mm can puts the deck's front ear on the pin below - the tier will not seat`);
  if (d.n < 1) w.push("FAIL no cans fit on a deck - lengthen the lane");
  if (d.split && d.xd > -K.spliceDepth - 20) w.push("FAIL chute reaches the splice - lengthen the lane");
  return w;
}

// ---------------------------------------------------------------- kernel helpers
export class Geo {
  private Manifold: typeof M;
  private CrossSection: typeof CS;
  constructor(private wasm: ManifoldToplevel) {
    this.Manifold = wasm.Manifold;
    this.CrossSection = wasm.CrossSection;
  }

  box(sx: number, sy: number, sz: number, cx = 0, cy = 0, cz = 0): M {
    return this.Manifold.cube([sx, sy, sz], true).translate([cx, cy, cz]);
  }
  cyl(r: number, h: number, cx = 0, cy = 0, z0 = 0, seg = 48): M {
    return this.Manifold.cylinder(h, r, r, seg, false).translate([cx, cy, z0]);
  }
  poly(pts: Vec2[]): CS {
    return new this.CrossSection([pts], "EvenOdd");
  }
  rect(x0: number, y0: number, x1: number, y1: number): CS {
    return this.poly([[x0, y0], [x1, y0], [x1, y1], [x0, y1]]);
  }
  prismZ(cs: CS, h: number, z0 = 0): M {
    return cs.extrude(h).translate([0, 0, z0]);
  }
  /** Extrude an (x,z) profile along +Y from y0 to y0+depth. */
  prismY(cs: CS, depth: number, y0: number): M {
    return cs.extrude(depth).rotate([90, 0, 0]).translate([0, y0 + depth, 0]);
  }
  /** Extrude a (y,z) profile along +X from x0 to x0+depth. */
  prismX(cs: CS, depth: number, x0: number): M {
    // (u,v,w) -> (w,u,v): columns are images of e_u, e_v, e_w
    return cs.extrude(depth).transform([0, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, x0, 0, 0, 1]);
  }
  roundedRect(L: number, W: number, r: number): CS {
    return this.rect(-L / 2 + r, -W / 2 + r, L / 2 - r, W / 2 - r).offset(r, "Round", 2, 24);
  }
  /** The material a radius-r fillet removes from a top edge at (u, top); `side` is +1/-1,
   *  the direction the edge's outer face points along u. A 2D cut profile: extrude it
   *  along the edge and subtract. */
  roundOver(u: number, top: number, side: number, r: number): CS {
    const inner = u - side * r;
    const corner = this.rect(Math.min(inner, u + side), top - r, Math.max(inner, u + side), top + 1);
    return corner.subtract(this.CrossSection.circle(r, 24).translate([inner, top - r]));
  }
  union(parts: M[]): M {
    return parts.length === 1 ? parts[0] : this.Manifold.union(parts);
  }
  diff(a: M, cuts: M[]): M {
    return cuts.length ? this.Manifold.difference([a, ...cuts]) : a;
  }
  isect(a: M, b: M): M {
    return this.Manifold.intersection([a, b]);
  }
  hull(points: (M | Vec3)[]): M {
    return this.Manifold.hull(points);
  }
  cs2d(...cs: CS[]): CS {
    return this.CrossSection.union(cs);
  }

  /**
   * Hexagon holes on a uniform-gap grid inside `bounds`, returned as one
   * multi-polygon CrossSection. Regular pointy-top cells: printed flat they are
   * vertical holes, which is the whole point of the flat-pack. (A stretched cell
   * was how a standing wall was made self-supporting, before the plates lay down.)
   * Only whole cells are kept and the grid is centred in the panel, so every hole
   * is the same shape and the border reads as a frame. A cell touching one of the
   * `holes` keep-outs is dropped rather than clipped, for the same reason.
   */
  hexCells(R: number, t: number, bounds: CS, holes: CS[] = []): CS | null {
    const P = R + t / Math.sqrt(3);
    const hexa: Vec2[] = [];
    for (let k = 0; k < 6; k++) {
      const a = ((90 + 60 * k) * Math.PI) / 180;
      hexa.push([R * Math.cos(a), R * Math.sin(a)]);
    }
    const lat = { dx: Math.sqrt(3) * P, dy: 1.5 * P, hw: (Math.sqrt(3) * R) / 2, hh: R, stagger: true };
    return this.cells(lat, bounds, holes, (cx, cy) => this.poly(hexa.map(([px, py]) => [px + cx, py + cy] as Vec2)));
  }

  /**
   * Cells of one shape on a lattice inside `bounds`: whole cells only (a cell is `hw`
   * by `hh` about its centre), the grid centred in the field, a cell touching one of
   * the `holes` keep-outs dropped. `cell` draws the shape at a centred centre and gets
   * the lattice indices, for patterns that alternate.
   */
  cells(lat: Lattice, bounds: CS, holes: CS[], cell: (cx: number, cy: number, i: number, j: number) => CS): CS | null {
    const { dx, dy, hw, hh, stagger } = lat;
    const { min: [x0, y0], max: [x1, y1] } = bounds.bounds();
    const centres: [number, number, number, number][] = [];
    for (let j = 0; y0 + hh + j * dy + hh <= y1 + 1e-6; j++) {
      const cy = y0 + hh + j * dy;
      for (let i = 0; ; i++) {
        const cx = x0 + hw + i * dx + (stagger && j % 2 ? dx / 2 : 0);
        if (cx + hw > x1 + 1e-6) break;
        centres.push([cx, cy, i, j]);
      }
    }
    if (!centres.length) return null;
    const xs = centres.map(([x]) => x), ys = centres.map(([, y]) => y);
    const shiftX = (x0 + x1) / 2 - (Math.min(...xs) + Math.max(...xs)) / 2;
    const shiftY = (y0 + y1) / 2 - (Math.min(...ys) + Math.max(...ys)) / 2;
    const blocked = holes.length ? this.CrossSection.union(holes) : null;
    const out: CS[] = [];
    // One cross-section per candidate cell plus one per keep-out test, on a wall with a
    // few hundred candidates, six walls a build. The dropped ones and the test results
    // are garbage the moment they are measured, so free them here rather than leave the
    // WASM heap holding every cell that did not make it.
    for (const [cx, cy, i, j] of centres) {
      const c = cell(cx + shiftX, cy + shiftY, i, j);
      if (blocked) {
        const overlap = c.intersect(blocked);
        const clipped = overlap.area() > 1e-6;
        overlap.delete();
        if (clipped) { c.delete(); continue; }
      }
      out.push(c);
    }
    const field = out.length ? this.CrossSection.union(out) : null;
    for (const c of out) c.delete();
    blocked?.delete();
    return field;
  }

  /** The chosen pattern's holes in `panel`, radius R, ligament t, clear of `keep`. */
  cellsOf(p: Pattern, R: number, t: number, panel: CS, keep: CS[]): CS | null {
    const square = { dx: 2 * R + t, dy: 2 * R + t, hw: R, hh: R, stagger: false };
    switch (p) {
      case "hex":
        return this.hexCells(R, t, panel, keep);
      case "circle": // round perforation on the same 60° stagger, holes 2R across, t apart
        return this.cells({ dx: 2 * R + t, dy: (Math.sqrt(3) / 2) * (2 * R + t), hw: R, hh: R, stagger: true }, panel, keep,
          (cx, cy) => this.CrossSection.circle(R, 48).translate([cx, cy]));
      case "kumiko": {
        // goma: a square with one diagonal bar. The diagonal alternates so the two walls
        // read the same from outside and the bars brace both shear directions
        const bar = this.rect(-(R * Math.SQRT2 + t), -t / 2, R * Math.SQRT2 + t, t / 2);
        return this.cells(square, panel, keep, (cx, cy, i, j) =>
          this.rect(cx - R, cy - R, cx + R, cy + R).subtract(bar.rotate((i + j) % 2 ? 45 : -45).translate([cx, cy])));
      }
      case "breeze": {
        // screen block: one quatrefoil per cell, lobe tips at ±R so the bar between cells is t
        const lobe = this.CrossSection.circle(0.6 * R, 48);
        return this.cells(square, panel, keep, (cx, cy) =>
          this.cs2d(...[-1, 1].flatMap((sx) => [-1, 1].map((sy) => lobe.translate([cx + sx * 0.4 * R, cy + sy * 0.4 * R])))));
      }
      case "slat":
        return this.slats(R, t, panel, keep);
    }
  }

  /**
   * Stadium openings 2R tall between 2t rails, one per row, each running the width of
   * its field component. One opening spans the field, so a keep-out cannot drop it whole:
   * the field is split at the keep-outs first and a component narrower than 4R is left
   * solid, which keeps the strips beside the dovetail bands and the end notch blank.
   */
  slats(R: number, t: number, panel: CS, keep: CS[]): CS | null {
    const rows: CS[] = [];
    const field = keep.length ? panel.subtract(this.cs2d(...keep)) : panel;
    for (const comp of field.decompose()) {
      const { min: [x0], max: [x1] } = comp.bounds();
      const w = x1 - x0;
      if (w < 4 * R) continue;
      const stadium = (cx: number, cy: number) => this.cs2d(
        this.rect(cx - w / 2 + R, cy - R, cx + w / 2 - R, cy + R),
        this.CrossSection.circle(R, 48).translate([cx - w / 2 + R, cy]),
        this.CrossSection.circle(R, 48).translate([cx + w / 2 - R, cy]),
      );
      const cut = this.cells({ dx: w + 1, dy: 2 * R + 2 * t, hw: w / 2, hh: R, stagger: false }, comp, [], stadium);
      if (cut) rows.push(cut.intersect(comp));
    }
    return rows.length ? this.cs2d(...rows) : null;
  }

  /**
   * Round the outer top edges of `body` at height `top` by radius r. Manifold has no
   * fillet, so: keep everything below top-r, and above it a stack of thin slabs of
   * `plan` (the part's outline) shrunk by the fillet's inset at that height. A 2D
   * offset follows the outline round its corners, which a straight cut cannot.
   * The slabs are the stair-steps the printer lays down anyway. `pads` stay flat
   * through the whole height: seats and tab roots.
   */
  roundTop(body: M, plan: CS, top: number, r: number, pads: CS[] = [], steps = 8): M {
    const bb = body.boundingBox();
    const zMin = bb.min[2] - 1, zMax = bb.max[2] + 1;
    const big = Math.max(bb.max[0] - bb.min[0], bb.max[1] - bb.min[1]) + 20;
    const keep: M[] = [this.box(big, big, top - r - zMin, 0, 0, (top - r + zMin) / 2)];
    for (let k = 0; k < steps; k++) {
      const z0 = top - r + (r * k) / steps, z1 = top - r + (r * (k + 1)) / steps;
      const rise = (z0 + z1) / 2 - (top - r);
      const inset = r - Math.sqrt(r * r - rise * rise);
      const shrunk = plan.offset(-inset, "Round", 2, 24);
      keep.push(this.prismZ(shrunk, z1 - z0 + 0.01, z0));
      shrunk.delete(); // the slab has the outline now
    }
    for (const pad of pads) keep.push(this.prismZ(pad, zMax - zMin, zMin));
    // Nine slabs and their union, every time a wall or an end wall is rounded.
    const stack = this.union(keep);
    const rounded = this.isect(body, stack);
    stack.delete();
    for (const slab of keep) slab.delete();
    return rounded;
  }
}

// ---------------------------------------------------------------- parts
// Every plate is modelled in the orientation it prints in, outer face up, so the packer
// only has to drop it on the bed. The rule each feature has to pass: it is in-plane (tab,
// notch, slot, dovetail, hex cell), it grows up from the print face (rib, pin, boss), or it
// is a pocket in the print face (recess, groove). Nothing on the bed face, nothing under
// an edge. test/overhang.test.ts holds every snapshot part to it.
export type LaneRole = "top" | "mid" | "bottom";
export type PlateName = "deck" | "wall-tongue" | "wall-socket" | "end-wall";
export interface Plate { name: PlateName; whole?: M; front?: M; rear?: M }
export interface PartSet {
  lanes: { role: LaneRole; plates: Plate[] }[];
  lip: M; riser: M; cover: M[];
  gridDeck?: Plate; // the deck of the lane on the shelf, on its Gridfinity unit
}

/** What every plate of one lane shares: where the deck is, how tall the walls are, and
 *  where the ties and tabs sit. bottom: no chute, full deck. top: a loading lip instead
 *  of a full end wall, since nothing drops in from above. */
export interface Lane {
  bottom: boolean; top: boolean;
  xd: number; // where the deck starts (-L/2 on the bottom lane)
  xe: number; // inner face of the end wall; the deck top is flat from here to L/2
  dhi: number; te: number; H: number; ewh: number;
  tabs: number[]; // x of every wall tab and deck slot
  edges: number[]; // pairs: the open deck bands between ties
  lipx: number;
}

const round1 = (v: number) => Math.round(v * 10) / 10;

export function laneOf(o: Options, d: Derived, role: LaneRole): Lane {
  const bottom = role === "bottom", top = role === "top";
  const { L } = d;
  const xd = bottom ? -L / 2 : d.xd;
  const xe = L / 2 - o.wall;
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
  const clear = (t: number) => Math.abs(t) >= 12 && Math.abs(Math.abs(t) - d.px) >= 12;
  const tabIn = K.tabW / 2 + 3;
  const tabs = [xd + tabIn, xe - tabIn, ...interior.filter(clear)];
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
    if (last > 0 && t - half <= edges[last]) edges[last] = Math.max(edges[last], t + half);
    else edges.push(t - half, t + half);
  }
  edges.push(x1);
  return { bottom, top, xd, xe, dhi, te, H, ewh: top ? dhi + K.lipH : H, tabs, edges, lipx };
}

/** A tab, pin or boss: the one cross-section every joint uses, flush with the plate's
 *  inner face. `along` is the axis the 8 mm runs on. */
function tab(g: Geo, along: "x" | "y", len: number, cx: number, cy: number, z0: number): M {
  const [sx, sy] = along === "x" ? [K.tabW, K.tabT] : [K.tabT, K.tabW];
  return g.box(sx, sy, len, cx, cy, z0 + len / 2);
}
/** The hole a tab enters, through the full height given. */
function tabHole(g: Geo, o: Options, along: "x" | "y", len: number, cx: number, cy: number, z0: number): M {
  const c = 2 * (K.dtCl + o.fit);
  const [sx, sy] = along === "x" ? [K.tabW + c, K.tabT + c] : [K.tabT + c, K.tabW + c];
  return g.box(sx, sy, len, cx, cy, z0 + len / 2);
}

const dtxOf = (d: Derived) => d.L / 2 - 25; // clear of the end tab band and the pin at px

/** The gang dovetail in plan: `base` wide on the wall face at y, `tip` wide K.dovetail out.
 *  The rib on the +Y wall and the groove in the -Y wall are the same trapezoid. */
const dovetailCS = (g: Geo, dx: number, y: number, base: number, tip: number): CS =>
  g.poly([[dx - base / 2, y], [dx + base / 2, y], [dx + tip / 2, y + K.dovetail], [dx - tip / 2, y + K.dovetail]]);

/** The deck's (x, z) profile: a wedge from the deck start to the end wall, flat past it,
 *  down to `zb` (below zero when a Gridfinity unit hangs under the pan). */
const deckProfile = (g: Geo, d: Derived, ln: Lane, zb = 0): CS =>
  g.poly([[ln.xd, zb], [d.L / 2, zb], [d.L / 2, ln.te], [ln.xe, ln.te], [ln.xd, K.deckLo]]);

/** The pocket the lip's 5 × 12 tab drops into: 12.4 × 5.4 since the first cut, turned 90°
 *  from the tab it was for, plus fit. */
const lipPocket = (g: Geo, o: Options, x: number, y: number, h: number, z0: number): M =>
  g.box(5.4 + o.fit, 12.4 + o.fit, h, x, y, z0);

export function buildDeck(g: Geo, o: Options, d: Derived, ln: Lane): M {
  const { L, IW } = d;
  const minimal = o.design === "minimal";
  // the wedge sits between the walls. Under each wall it puts out an ear as tall as the
  // deck's low end, with the slot the wall's tab drops through: that is what holds the
  // deck up on the tier below, and the wall to the deck
  const adds = [g.prismY(deckProfile(g, d, ln), IW, -IW / 2)];
  for (const sy of [1, -1]) for (const tx of ln.tabs) adds.push(g.box(K.earW, o.wall + 1, K.deckLo, tx, sy * (IW / 2 + o.wall / 2 - 0.5), K.deckLo / 2));
  const cuts: M[] = [];
  if (!o.solid) {
    // minimal: the rail is a 2.5 mm fin at the inner edge of the standard rail, and the
    // strip between fin and wall opens too. A necked can is widest at its body, which
    // ends ~12 mm short of each end; pushed over by the full side play the body edge sits
    // at IW/2 - 15.5, still over the fin. It stands on the bed: compression, no bridging.
    const strip = IW / 2 - d.railHy - K.minimalT;
    // under each ear the strip keeps an ear-high plinth out to the fin, as wide as the
    // wall's pad round its notch: an ear is rooted in the deck by 1 mm, and inside a
    // 2.5 mm tie the tab hole takes all of it. Six loose 12 × 6 × 4 chips a lane, once
    const earPads = ln.tabs.map((tx) => g.rect(tx - K.earW / 2 - 3, -IW, tx + K.earW / 2 + 3, IW));
    const earPadUnion = g.cs2d(...earPads);
    for (let i = 0; i + 1 < ln.edges.length; i += 2) {
      const a = ln.edges[i], b = ln.edges[i + 1];
      if (b - a <= 12) continue;
      cuts.push(g.box(b - a, 2 * d.railHy, ln.dhi + 4, (a + b) / 2, 0, ln.dhi / 2 + 1));
      if (minimal) for (const sy of [1, -1]) {
        const face = g.rect(a, sy * (IW / 2 - strip), b, sy * IW / 2);
        cuts.push(g.prismZ(face, ln.dhi + 4, K.deckLo));
        cuts.push(g.prismZ(face.subtract(earPadUnion), K.deckLo + 1, -1)); // hoisted: five bands x two sides rebuilt it
      }
    }
    earPadUnion.delete();
  }
  for (const sy of [1, -1]) {
    for (const tx of ln.tabs) cuts.push(tabHole(g, o, "x", ln.dhi + 4, tx, sy * d.piny, -1));
    cuts.push(lipPocket(g, o, ln.lipx, sy * d.lipy, 40, 10));
  }
  cuts.push(tabHole(g, o, "y", ln.te + 4, ln.xe + K.tabT / 2, 0, -1));
  return g.diff(g.union(adds), cuts);
}

/** A side wall in the lane frame, before it is laid flat: sy = +1 carries the dovetail
 *  tongue rib, -1 the groove, when lanes gang; a single lane's outer faces stay flat.
 *  Stands on the shelf or on the wall top of the tier below, full height, and notches
 *  over the deck's ears with a tab down through each. */
export function buildWall(g: Geo, o: Options, d: Derived, ln: Lane, sy: number): M {
  const { L, IW, OW } = d;
  const H = ln.H;
  const y0 = sy > 0 ? IW / 2 : -OW / 2;
  const c = K.dtCl + o.fit;
  const gang = o.lanesWide > 1 && o.base !== "gridfinity"; // on a grid the baseplate joins lanes
  const piny = sy * d.piny;
  const notchH = K.deckLo + c;
  const adds = [g.box(L, o.wall, H, 0, y0 + o.wall / 2, H / 2)];
  for (const tx of ln.tabs) adds.push(tab(g, "x", notchH + 1, tx, piny, 0));
  for (const sx of [1, -1]) adds.push(tab(g, "x", K.pinH + 1, sx * d.px, piny, H - 1));
  if (gang && sy > 0) adds.push(...wallDovetailRibs(g, d, H));
  const cuts: M[] = [g.prismX(g.roundOver(sy * OW / 2, H, sy, K.edgeR), L + 2, -L / 2 - 1)];
  cuts.push(...wallNotches(g, o, d, ln, sy, c, notchH));
  if (gang && sy < 0) cuts.push(...wallDovetailGrooves(g, d, H, c));
  if (!o.solid) cuts.push(...wallPerforation(g, o, d, ln, sy, c, notchH, gang));
  return g.diff(g.union(adds), cuts);
}

const RIB_Z = 8; // the gang dovetail starts this far up the wall, clear of the ear notches

/** The dovetail ribs on the +Y face, one each side of the seam, stopping 12 mm short of the top. */
function wallDovetailRibs(g: Geo, d: Derived, H: number): M[] {
  const dtx = dtxOf(d);
  return [-dtx, dtx].map((dx) => g.prismZ(dovetailCS(g, dx, d.OW / 2, K.dtBase, K.dtTip), H - 12 - RIB_Z, RIB_Z));
}

/** The grooves in the -Y face the neighbour's ribs slide into, the rib plus clearance, open at the top. */
function wallDovetailGrooves(g: Geo, d: Derived, H: number, c: number): M[] {
  const dtx = dtxOf(d);
  return [-dtx, dtx].map((dx) => g.prismZ(dovetailCS(g, dx, -d.OW / 2, K.dtBase + 2 * c, K.dtTip + 2 * c), H + 2, RIB_Z - 1));
}

/** What keys the wall: a notch over each deck ear with the wall's own tab left standing in
 *  it (so the ear's slot stays), the slot the end wall's side tab drops into, and the
 *  notches for the tier below's pins or the risers' bosses. */
function wallNotches(g: Geo, o: Options, d: Derived, ln: Lane, sy: number, c: number, notchH: number): M[] {
  const piny = sy * d.piny;
  const notch = (w: number, h: number, x: number) => g.box(w + 2 * c, o.wall + 2, h + 1, x, sy * d.py, (h - 1) / 2);
  const cuts = ln.tabs.map((tx) => g.diff(notch(K.earW, notchH, tx), [tab(g, "x", notchH + 2, tx, piny, -1)]));
  cuts.push(notch(K.tabT, ln.te + K.sideTabH + c, ln.xe + K.tabT / 2));
  for (const sx of [1, -1]) cuts.push(notch(K.tabW, K.pinH + c, sx * d.px));
  return cuts;
}

/** The lattice through the wall and the recess of its outer face down to a web, both
 *  clear of the dovetail bands, the splice band and the end notch. */
function wallPerforation(g: Geo, o: Options, d: Derived, ln: Lane, sy: number, c: number, notchH: number, gang: boolean): M[] {
  const { L, IW, OW } = d;
  const H = ln.H, b = K.border;
  const y0 = sy > 0 ? IW / 2 : -OW / 2;
  const dtx = dtxOf(d);
  const keep: CS[] = [];
  if (gang) for (const dx of [-dtx, dtx]) keep.push(g.rect(dx - K.dtTip / 2 - 2.5, 0, dx + K.dtTip / 2 + 2.5, H));
  if (d.split) keep.push(g.rect(-K.spliceDepth - 2.5, 0, 2.5, H));
  const endNotch = g.rect(ln.xe - 3, -1, L / 2 + 1, ln.te + K.sideTabH + K.padRise);
  keep.push(endNotch);
  const panel = g.rect(-L / 2 + b, fieldBottom(o), L / 2 - b, H - b);
  const cuts: M[] = [];
  const wcells = g.cellsOf(o.pattern, d.hexR, d.lig, panel, keep);
  if (wcells) cuts.push(g.prismY(wcells, o.wall + 2, y0 - 1));

  // recess the outer face over the lattice field and down through the bottom border to
  // a web. Pads stay over every tab root and the end notch, so a tab is rooted in a
  // full-thickness wall. A pad is exactly the notch's width: with the ear flush in the
  // notch below it, the two read as one post from the bottom edge up. The minimal web
  // is four 0.42 mm lines, the same floor as the ligament width: two perimeters a
  // side, no infill
  const rd = o.wall - (o.design === "minimal" ? K.ligMin : K.web);
  if (rd > 0.2) {
    const pads = [endNotch, ...ln.tabs.map((tx) => g.rect(tx - K.earW / 2 - c, -1, tx + K.earW / 2 + c, notchH + K.padRise))];
    const padUnion = g.cs2d(...pads); // the same union for every component; it was rebuilt per iteration
    const field = panel.subtract(g.cs2d(...keep));
    for (const comp of field.decompose()) {
      const { min: [gx0], max: [gx1] } = comp.bounds();
      const face = g.rect(gx0, -1, gx1, H - b).subtract(padUnion);
      cuts.push(g.prismY(face, rd + 1, sy > 0 ? OW / 2 - rd : -OW / 2 - 1));
    }
    padUnion.delete();
  }
  return cuts;
}

/** The high-end wall in the lane frame: closes the chute of the tier above, or is a
 *  20 mm loading lip on a top lane. Stands on the flattened deck end with a tab down
 *  through it and one each side into the side walls. */
export function buildEndWall(g: Geo, o: Options, d: Derived, ln: Lane): M {
  const { L, IW } = d;
  const { xe, te, ewh } = ln;
  const b = K.border;
  const adds = [
    g.box(o.wall, IW, ewh - te, L / 2 - o.wall / 2, 0, (ewh + te) / 2),
    tab(g, "y", te + 1, xe + K.tabT / 2, 0, 0),
  ];
  // side tabs run from the wall top below to `sideTabH` above the deck: they land on that
  // wall as well as keying into the side walls' notches
  for (const sy of [1, -1]) adds.push(g.box(K.tabT, o.wall, te + K.sideTabH, xe + K.tabT / 2, sy * d.py, (te + K.sideTabH) / 2));
  let body = g.union(adds);
  // the outer top edge rounds, like the side walls'. A loading lip's inner edge stays
  // square: printed outer face up it would be a round on the bed edge, and a can loaded
  // over the lip slides over the outer edge anyway
  const cuts: M[] = [g.prismY(g.roundOver(L / 2, ewh, 1, K.edgeR), IW, -IW / 2)];
  if (!o.solid) {
    const gy0 = -IW / 2 + b, gy1 = IW / 2 - b;
    const ecells = g.cellsOf(o.pattern, d.hexR, d.lig, g.rect(gy0, te + b, gy1, ewh - b), []);
    if (ecells) cuts.push(g.prismX(ecells, o.wall + 2, xe - 1));
    const rd = o.wall - (o.design === "minimal" ? K.ligMin : K.web);
    if (rd > 0.2) cuts.push(g.prismX(g.rect(gy0, te - 1, gy1, ewh - b), rd + 1, L / 2 - rd));
  }
  return g.diff(body, cuts);
}

/** Lay a side wall flat, outer face up. Inverse in the viewer's showAssembly. */
export function layWall(m: M, sy: number, IW: number): M {
  const turned = sy > 0 ? m.rotate([0, 0, 180]) : m;
  return turned.translate([0, IW / 2, 0]).rotate([-90, 0, 0]);
}
export function layEndWall(m: M, xe: number): M {
  return m.translate([-xe, 0, 0]).rotate([0, -90, 0]);
}

/** Cut a plate at x=0 into a front and a rear half joined by an in-plane dovetail: the
 *  rear keeps the tongue, the front gets the socket. `tongue` and `socket` are the
 *  trapezoid profiles, rear-pointing, already extruded through the plate. */
function splitPlate(g: Geo, plate: M, tongue: M, socket: M): [M, M] {
  const bb = plate.boundingBox();
  const big = Math.max(bb.max[0] - bb.min[0], bb.max[1] - bb.min[1], bb.max[2] - bb.min[2]) * 2 + 20;
  const rear = g.union([g.isect(plate, g.box(big, big, big, big / 2, 0, 0)), g.isect(plate, tongue)]);
  const front = g.diff(g.isect(plate, g.box(big, big, big, -big / 2, 0, 0)), [socket]);
  return [front, rear];
}

const trapezoid = (base: number, tip: number, depth: number, vc: number, grow = 0): Vec2[] => [
  [0.5, vc - base / 2 - grow], [0.5, vc + base / 2 + grow], [-depth - grow, vc + tip / 2 + grow], [-depth - grow, vc - tip / 2 - grow],
];

/** Deck: the tongue is the wedge itself inside the trapezoid, so it carries the slope.
 *  `zb` is the deck's underside: a grid deck's floor and feet hang below the pan, and
 *  the tongue takes them too, so it stands on the bed instead of over the socket. */
export function splitDeck(g: Geo, o: Options, d: Derived, ln: Lane, deck: M, zb = 0): [M, M] {
  const cl = K.dtCl + o.fit;
  const w = d.plateY; // wider than any tongue; the floor of a grid deck is this wide
  const wedge = g.prismY(deckProfile(g, d, ln, zb), w, -w / 2);
  const tongue = g.isect(wedge, g.prismZ(g.poly(trapezoid(K.spliceBase, K.spliceTip, K.spliceDepth, 0)), ln.H - zb, zb - 1));
  const socket = g.prismZ(g.poly(trapezoid(K.spliceBase, K.spliceTip, K.spliceDepth, 0, cl)), ln.H + 2 - zb, zb - 1);
  return splitPlate(g, deck, tongue, socket);
}


/** Wall: the same dovetail sized to the wall height at the seam, slid together in Y
 *  before the wall goes on the deck. Runs on the wall in the lane frame. */
export function splitWall(g: Geo, o: Options, d: Derived, ln: Lane, wall: M): [M, M] {
  const cl = K.dtCl + o.fit;
  const zc = ln.H / 2, base = 0.4 * ln.H, tip = 0.55 * ln.H;
  const through = (pts: Vec2[]) => g.prismY(g.poly(pts), d.OW + 2, -d.OW / 2 - 1);
  return splitPlate(g, wall, through(trapezoid(base, tip, K.spliceDepth, zc)), through(trapezoid(base, tip, K.spliceDepth, zc, cl)));
}

/** The dispense lip, flat on its back: blade x ∈ [-lipH, 0], tabs past x = 0 in the bed
 *  plane, the scoop a vertical cylinder past the top edge. The face-up edges round, and
 *  that face goes toward the cans. */
export function buildLip(g: Geo, o: Options, d: Derived): M {
  const t = 5;
  // The tab is as long as the deck is thick where it drops through, so it ends flush with
  // the underside at every slope. The viewer stands the lip up with ry = 90 degrees, which
  // maps (x, y, z) to (z, y, -x): this x is the insertion depth, and the t is what has to
  // fit the 5.4 mm pocket. A fixed 6 protruded by 2 - 8*tan - up to a 2 mm stud at slope 0.
  const tabLen = K.deckLo + K.lipInset * d.tan;
  const outline = g.roundedRect(K.lipH, d.IW - 1, 2.4).translate([-K.lipH / 2, 0]);
  const parts = [g.roundTop(g.prismZ(outline, t), outline, t, 2)];
  for (const sy of [1, -1]) parts.push(g.box(tabLen, 12, t, tabLen / 2, sy * d.lipy, t / 2));
  const scoop = g.cyl(22, t + 2, -K.lipH - 12, 0, -1, 64);
  return g.diff(g.union(parts), [scoop]);
}

/** A foot under a wall at ±px: as thick as the wall, since the deck starts at the wall's
 *  inner face and the next gang 3 mm past its outer one. The boss goes into the wall's
 *  bottom notch. */
export function buildRiser(g: Geo, o: Options, h: number): M {
  const side = 20; // the foot's length along the lane; it was a parameter no caller set
  return g.union([g.box(side, o.wall, h, 0, 0, h / 2), tab(g, "x", K.pinH, 0, 0, h)]);
}

/** One Gridfinity foot, centred, from z = 0 up: hulls of the profile's rounded
 *  rectangles, so the 45° faces are exact and the corners concentric. An extrude with
 *  a scale would square the top corner and bind in the baseplate's r4 pocket. The
 *  upper chamfer runs on `over` mm past the profile: neighbouring feet then meet in
 *  a 45° ridge and their rounded corners close in a 45° pit, and the floor over them
 *  has no flat underside anywhere. */
function buildFoot(g: Geo, over: number): M {
  const { footFlat: flat, footChamferLo: lo, footWall: wall, footChamferHi: hi, footR: r } = K;
  const mid = flat + 2 * lo, top = mid + 2 * hi; // 37.2, 41.5
  const ring = (side: number, radius: number, z: number) => g.roundedRect(side, side, radius).toPolygons().flat().map(([x, y]) => [x, y, z] as Vec3);
  return g.union([
    g.hull([...ring(flat, r - hi - lo, 0), ...ring(mid, r - hi, lo)]),
    g.prismZ(g.roundedRect(mid, mid, r - hi), wall, lo),
    g.hull([...ring(mid, r - hi, lo + wall), ...ring(top + 2 * over, r + over, lo + wall + hi + over)]),
  ]);
}

/** The bottom-tier deck as a Gridfinity bin: the ordinary deck on a 7 mm unit that
 *  hangs below it, z −7 to 0 - a floor of whole cells round the lane (`d.floor`, where
 *  the alignment put it), a foot under every cell, and the riser's boss at ±px for the
 *  walls, which stand on the floor. The
 *  deck's underside is one plane with the wall bottoms, so every cut it has stops at
 *  z = 0; the lip's tab now ends flush with the pan, and its pocket keeps 1 mm of
 *  clearance under it for the fit. Prints as it sits, feet down, like every bin. */
export function buildGridDeck(g: Geo, o: Options, d: Derived, ln: Lane, deck: M): M {
  const { floorCells: [nx, ny], floor: [fx0, fy0, fx1, fy1] } = d;
  const footH = K.footChamferLo + K.footWall + K.footChamferHi;
  const z0 = -K.unitH;
  // the bin's r3.75 corners, except where the lane's own corner lands on one: flush in a
  // corner, a deck ear would hang a square millimetre over the round. Where the lane
  // runs past its floor (a shelf too narrow for the cells that would cover it), the
  // outline is the lane's and a skirt stands under it, bed to floor, beside the
  // baseplate: solid, so nothing overhangs, and the foot chamfers run into it
  const lane = g.rect(-d.L / 2, -d.OW / 2, d.L / 2, d.OW / 2);
  const outline = g.roundedRect(gridSpan(nx), gridSpan(ny), K.footR).translate([(fx0 + fx1) / 2, (fy0 + fy1) / 2]).add(lane);
  const skirt = lane.subtract(g.rect(fx0 - 2 * K.gridGap, fy0 - 2 * K.gridGap, fx1 + 2 * K.gridGap, fy1 + 2 * K.gridGap));
  // the corner pit between four feet is the last void to close, sqrt(2)·4 − 3.75 = 1.9 mm
  // above the foot tops. The chamfers run on through the whole 2.25 mm and past it, and
  // the outline prism clips them flat at the deck's underside: the merged run-ons are
  // the floor, and no slab has to start above the last pit - a slab 0.1 mm over it left
  // slivers where the 24-segment corner arcs fell short
  const foot = buildFoot(g, K.unitH - footH + 0.5);
  const cx = (i: number) => fx0 - K.gridGap + (i + 0.5) * K.gridPitch, cy = (j: number) => fy0 - K.gridGap + (j + 0.5) * K.gridPitch;
  const feet: M[] = [], cuts: M[] = [];
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
    feet.push(foot.translate([cx(i), cy(j), z0]));
    if (o.magnets) for (const sx of [1, -1]) for (const sy of [1, -1]) {
      const mx = cx(i) + sx * K.magnetPitch / 2;
      if (d.split && Math.abs(mx) < K.magnetR + 1) continue; // half a pocket a side holds nothing
      cuts.push(g.cyl(K.magnetR, K.magnetDepth + 1, mx, cy(j) + sy * K.magnetPitch / 2, z0 - 1));
    }
  }
  const adds = [
    deck,
    g.isect(g.union(feet), g.prismZ(outline, K.unitH, z0)), // the run-on chamfers stop at the bin's edge
  ];
  if (!skirt.isEmpty()) adds.push(g.prismZ(skirt, K.unitH, z0));
  for (const sx of [1, -1]) for (const sy of [1, -1]) adds.push(tab(g, "x", K.pinH, sx * d.px, sy * d.piny, 0));
  for (const sy of [1, -1]) cuts.push(lipPocket(g, o, ln.lipx, sy * d.lipy, 2, 0));
  return g.diff(g.union(adds), cuts);
}

export function buildCover(g: Geo, o: Options, d: Derived): M[] {
  const { L, OW } = d, t = K.coverT;
  const outline = g.rect(-L / 2, -OW / 2, L / 2, OW / 2);
  const plate = g.roundTop(g.prismZ(outline, t), outline, t, t / 2);
  const cuts: M[] = [];
  for (const sx of [1, -1]) for (const sy of [1, -1]) cuts.push(tabHole(g, o, "x", t + 2, sx * d.px, sy * d.piny, -1));
  // cascade loading window: the top tier loads from above at its high end, so the cover
  // opens there, one can wide and the full inner width (only the wall strips remain).
  // A flat top tier loads from the front over its lip and keeps a whole cover.
  const keep: CS[] = [];
  if (o.cascade) {
    const windowL = o.canD + 8;
    const window = g.roundedRect(windowL, d.IW, 6).translate([L / 2 - o.wall - windowL / 2, 0]);
    cuts.push(g.prismZ(window, t + 2, -1));
    keep.push(window.offset(4, "Miter"));
  }
  if (!o.solid) {
    // No keep-out round the pin holes: the field stops 14 mm in from OW/2 and the holes
    // are at d.piny = IW/2 + 1.5, which is 6.5 mm from that edge - the cells never reach
    // them. The rectangles that used to be here were centred on d.py, not the piny the
    // holes are cut at, and were 2 mm short of the field even so.
    // bigger cells and fat bars than the walls: a grille, not a lattice
    const field = g.rect(-L / 2 + 14, -OW / 2 + 14, L / 2 - 14, OW / 2 - 14);
    // the grille has its own radius, sized like the walls' so three whole rows fill the
    // field with bars R/2: the pattern's rows span a·R + b·lig, lig = R/2
    const [a, bb] = ROWS[o.pattern];
    const coverR = (OW - 28 - 1) / (a + bb / 2);
    let cells: CS | null;
    if (o.design === "minimal" && o.pattern !== "slat") {
      // a perforated sheet: bigger cells on the ligament rule, running to the frame and
      // clipped there. Whole cells leave the open area to luck - how many fit between the
      // pins and the window swings with the can - where clipping makes it the cell's
      // own 83 % of the field whatever the size. A slat clipped to the grown field is a
      // square-ended slot that ignores the rail count, so slats take the whole-row path.
      const R = 1.5 * coverR;
      const grid = g.cellsOf(o.pattern, R, ligFor(R), field.offset(2 * R, "Miter"), []);
      cells = grid && grid.intersect(field).subtract(g.cs2d(...keep));
    } else {
      cells = g.cellsOf(o.pattern, coverR, coverR / 2, field, keep);
    }
    if (cells) {
      // the seam crosses the field; clip cells at its solid band rather than dropping
      // them, so the pattern carries over the joint instead of leaving a blank
      if (d.split) cells = cells.subtract(g.rect(-6, -OW, 6, OW));
      const pieces = cells.decompose().filter((piece) => piece.area() > 40);
      cells = pieces.length ? g.cs2d(...pieces) : null;
    }
    if (cells) cuts.push(g.prismZ(cells, t + 2, -1));
  }
  const m = g.diff(plate, cuts);
  if (d.split) {
    const big = L + 20;
    return [g.isect(m, g.box(big, big, 10, -big / 2, 0, 0)), g.isect(m, g.box(big, big, 10, big / 2, 0, 0))];
  }
  return [m];
}

/** The four plates of one lane, laid flat, split at the seam when the lane is long. */
export function buildLanePlates(g: Geo, o: Options, d: Derived, role: LaneRole): Plate[] {
  const ln = laneOf(o, d, role);
  const deck = buildDeck(g, o, d, ln);
  const walls = [1, -1].map((sy) => buildWall(g, o, d, ln, sy));
  const endWall = layEndWall(buildEndWall(g, o, d, ln), ln.xe);
  if (!d.split) {
    return [
      { name: "deck", whole: deck },
      { name: "wall-tongue", whole: layWall(walls[0], 1, d.IW) },
      { name: "wall-socket", whole: layWall(walls[1], -1, d.IW) },
      { name: "end-wall", whole: endWall },
    ];
  }
  const [deckFront, deckRear] = splitDeck(g, o, d, ln, deck);
  const plates: Plate[] = [{ name: "deck", front: deckFront, rear: deckRear }];
  for (const [i, sy] of [1, -1].entries()) {
    const [front, rear] = splitWall(g, o, d, ln, walls[i]);
    plates.push({ name: sy > 0 ? "wall-tongue" : "wall-socket", front: layWall(front, sy, d.IW), rear: layWall(rear, sy, d.IW) });
  }
  plates.push({ name: "end-wall", whole: endWall });
  return plates;
}

/** Free every mesh a PartSet holds. manifold-3d keeps them on the WASM heap, where the JS
 *  collector sees a handle and not the megabytes behind it, so a caller that is done with
 *  a build has to say so. Walk the set, not partList's output: that skips the plain deck
 *  under a Gridfinity base, the riser unless the base is feet, and the covers when the
 *  cover is off, and those are exactly the ones left behind. */
export function freeSet(set: PartSet): void {
  for (const lane of set.lanes) for (const plate of lane.plates) for (const mesh of [plate.whole, plate.front, plate.rear]) mesh?.delete();
  for (const mesh of [set.lip, set.riser, set.gridDeck?.whole, set.gridDeck?.front, set.gridDeck?.rear]) mesh?.delete();
  for (const mesh of set.cover) mesh.delete();
}

export function buildAll(g: Geo, o: Options, d: Derived): PartSet {
  const cascade = o.cascade;
  const roles: LaneRole[] = cascade ? (o.tiers >= 3 ? ["bottom", "mid", "top"] : ["bottom", "top"]) : ["top"];
  return {
    lanes: roles.map((role) => ({ role, plates: buildLanePlates(g, o, d, role) })),
    lip: buildLip(g, o, d),
    riser: buildRiser(g, o, 24),
    cover: o.cover ? buildCover(g, o, d) : [],
    gridDeck: o.base === "gridfinity" ? buildGridDeckPlate(g, o, d, cascade ? "bottom" : "top") : undefined,
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
export interface Part { name: string; mesh: M; qty: number; role: PartRole }

/** The name a lane plate prints under. A flat stack's tiers are all the same lane, so
 *  the role is left out; the viewer and the snapshot look parts up by this name. */
export const laneName = (o: Options, role: LaneRole, plate: PlateName) =>
  o.cascade ? `lane-${role}-${plate}` : `lane-${plate}`;

/** Every part to print, named and counted, in the order they are packed. A split plate
 *  is two parts, -front and -rear. On a Gridfinity base the shelf lane's deck is
 *  grid-deck and its plain deck is not printed; risers only come with feet. */
export function partList(set: PartSet, o: Options): Part[] {
  const parts: Part[] = [];
  const add = (name: string, mesh: M | undefined, qty: number, role: PartRole) => {
    if (mesh && qty > 0) parts.push({ name, mesh, qty, role });
  };
  const addPlate = (base: string, plate: Plate, qty: number) => {
    add(base, plate.whole, qty, "lane");
    add(`${base}-front`, plate.front, qty, "lane");
    add(`${base}-rear`, plate.rear, qty, "lane");
  };
  const qtyOf: Record<LaneRole, number> = {
    bottom: o.lanesWide, mid: o.lanesWide * Math.max(0, o.tiers - 2), top: o.cascade ? o.lanesWide : o.lanesWide * o.tiers,
  };
  const shelfRole: LaneRole = o.cascade ? "bottom" : "top";
  for (const lane of set.lanes) for (const plate of lane.plates) {
    const onGrid = set.gridDeck && lane.role === shelfRole && plate.name === "deck";
    addPlate(laneName(o, lane.role, plate.name), plate, qtyOf[lane.role] - (onGrid ? o.lanesWide : 0));
  }
  if (set.gridDeck) addPlate("grid-deck", set.gridDeck, o.lanesWide);
  add("end-lip", set.lip, o.lanesWide * (o.cascade ? 1 : o.tiers), "lip");
  if (o.base === "feet") add("riser-24", set.riser, o.lanesWide * 4, "riser");
  set.cover.forEach((mesh, i) => add(set.cover.length > 1 ? (i === 0 ? "cover-front" : "cover-rear") : "cover", mesh, o.lanesWide, "cover"));
  return parts;
}


/** Filament estimate: layer-sum of (shell + infill * core), like cansys.py, with skins:
 *  the core is what sits inside the perimeters with `skin` of material above and below.
 *  A slicer prints the rest solid, so a plate thinner than two skins has no core at all
 *  and a sloped deck top is solid along the whole slope, not only at its edge. */
export function filamentGrams(m: M, dz = 1.5, shell = 1.26, infill = 0.06, density = DENSITY, skin = 1): number {
  const bb = m.boundingBox();
  let solid = 0;
  for (let z = bb.min[2] + dz / 2; z < bb.max[2]; z += dz) {
    // Six cross-sections a layer, and this runs on every part of every build. manifold-3d
    // holds them on the WASM heap and the JS collector only sees a handle, so unfreed they
    // are what fills it: a 400 mm lane is ~270 a part. Freed here, in one place.
    const s = m.slice(z);
    const a = s.area();
    if (a <= 0) { s.delete(); continue; }
    const shrunk = s.offset(-shell, "Miter");
    const above = m.slice(z + skin), below = m.slice(z - skin);
    const capped = shrunk.intersect(above);
    const core = capped.intersect(below);
    const ia = Math.max(core.area(), 0);
    solid += a - ia + infill * ia;
    for (const section of [s, shrunk, above, below, capped, core]) section.delete();
  }
  return (solid * dz) / 1000 * density;
}
