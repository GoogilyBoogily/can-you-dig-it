// Geometry for the can-storage system, on the manifold-3d kernel. Units: mm, Z up.
// Started as a line-for-line port of cansys.py; test/regress.test.ts pins the snapshot.

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
 *  shelves, a lip to clear). gridfinity: a Gridfinity baseplate for the shelf with a
 *  solid pad under the lanes; the lanes stand on it as they stand on the shelf. Spec in
 *  docs/superpowers/specs/2026-09-19-gridfinity-base-design.md. */
export type Base = "flat" | "feet" | "gridfinity";
export const BASES: readonly Base[] = ["flat", "feet", "gridfinity"];
/** Where the lanes' pad sits on the baseplate: the free cells go to the other side.
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
  wall: number;
  clearance: number;
  fit: number;
  hexR: number; // cell radius when hexAuto is off
  hexAuto: boolean; // size cells so two whole rows fill the wall
  solid: boolean; // no lattice at all; overrides design and pattern
  design: Design;
  pattern: Pattern;
  cover: boolean;
  base: Base; // what the bottom tier stands on
  magnets: boolean; // a floored baseplate with 6 × 2 mm magnet pockets in every free cell
  across: Across; along: Along; // the lanes' pad on the baseplate
  baseCells: [number, number]; // baseplate cells along and across the lane: what the shelf takes
  bed: [number, number, number];
  bedMargin: number;
}

export const DEFAULTS: Options = {
  canD: 66, canL: 122.5, length: 480, tiers: 2, lanesWide: 2,
  cascade: true, slope: 3, wall: 6, clearance: 3.5, fit: 0, hexR: 13, hexAuto: true,
  solid: false, design: "standard", pattern: "hex", cover: true, base: "flat", magnets: false, across: "centre", along: "centre", baseCells: [10, 7], bed: [256, 256, 256], bedMargin: 3,
};

// fixed design constants (same names as cansys.py)
const K = {
  deckLo: 4, topgap: 2, slack: 8, lipH: 20, edgeR: 3,
  hexMin: 8, hexMax: 16, ligMin: 1.7, ligRatio: 0.17,
  border: 5, web: 3.5,
  dovetail: 3, dtBase: 10, dtTip: 14, dtCl: 0.25,
  // one tab for every joint: 8 wide, 3 thick, flush with the plate's inner face. A pin
  // is a tab as tall as the cover is thick, so it sits flush through the cover's hole
  tabW: 8, tabT: 3, pinH: 2.4, coverT: 2.4, sideTabH: 12, earW: 12,
  spliceBase: 30, spliceTip: 40, spliceDepth: 8,
  // Gridfinity: 42 mm cells. A baseplate pocket, top down: 42 wide at the rim, a 2.15
  // chamfer, 1.8 vertical, a 0.7 chamfer to 36.3 at the bottom, 4.65 deep, corners r4 at
  // the rim and concentric below. Magnets 6 × 2 on a 26 mm square, in a 3.2 mm floor
  // under the pockets when asked for; 0.8 mm of skin stays under a pocket
  gridPitch: 42, pocketD: 4.65, pocketChamferHi: 2.15, pocketWall: 1.8, pocketChamferLo: 0.7, pocketR: 4,
  floorT: 3.2, magnetR: 3.25, magnetDepth: 2.4, magnetPitch: 26, padMargin: 1,
};

/** Height the base adds under the bottom tier: what the solver charges the shelf for. */
export const baseHeight = (o: Options) => (o.base === "feet" ? 24 : o.base === "gridfinity" ? K.pocketD + (o.magnets ? K.floorT : 0) : 0);

export interface Derived {
  n: number; nBottom: number; split: boolean;
  L: number; IW: number; OW: number; H: number; Hb: number;
  run: number; dhi: number; dhiB: number; tan: number; inset: number;
  hexR: number; lig: number;
  xd: number; px: number; py: number; piny: number; lipy: number; lipx: number; railHy: number;
  gangPitch: number; plateX: number; plateY: number; usableX: number; usableY: number; usableZ: number;
  plate: [number, number, number, number]; // the baseplate's x0, y0, x1, y1 in the gang frame (lane 0 at y = 0)
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
 *  tab roots (notchH + 4). Hex keeps the border so its snapshot does not move. */
const fieldBottom = (o: Options) => (o.pattern === "hex" ? K.border : K.deckLo + K.dtCl + o.fit + 4);

/** Drop-chute length at the low end of an upper deck: one can plus play, plus the wall. */
const insetFor = (o: Options) => (o.cascade ? o.canD + 6 + o.wall : 0);

/** Where a `span` sits round `[lo, hi]`: flush with one end or centred, the spare on
 *  the other side. Never shorter than what it is round. */
function alignSpan(lo: number, hi: number, span: number, at: "lo" | "centre" | "hi"): [number, number] {
  span = Math.max(span, hi - lo);
  const x0 = at === "lo" ? lo : at === "hi" ? hi - span : (lo + hi - span) / 2;
  return [x0, x0 + span];
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
  const H = Math.ceil(dhi + o.canD + K.topgap);
  const dhiB = K.deckLo + L * tan;
  const Hb = Math.ceil(dhiB + o.canD + K.topgap);
  const hexR = o.hexAuto ? autoR(H - K.border - fieldBottom(o), ROWS[o.pattern]) : o.hexR;
  const split = L > usableX;
  const gangPitch = OW + K.dovetail;
  // the baseplate: the cells the shelf takes (the solver's baseCells), never smaller than
  // the gang's pad, placed round the pad where the alignment says
  const padTop = (o.lanesWide - 1) * gangPitch + OW / 2;
  const [bx0, bx1] = alignSpan(-L / 2, L / 2, o.baseCells[0] * K.gridPitch, o.along === "front" ? "lo" : o.along === "back" ? "hi" : "centre");
  const [by0, by1] = alignSpan(-OW / 2, padTop, o.baseCells[1] * K.gridPitch, o.across === "right" ? "lo" : o.across === "left" ? "hi" : "centre");
  return {
    n, nBottom, split, L, IW, OW, H, Hb, run, dhi, dhiB, tan, inset, hexR, lig: ligFor(hexR),
    xd: -L / 2 + inset, px: L / 2 - 40, py: IW / 2 + o.wall / 2, piny: IW / 2 + K.tabT / 2,
    lipy: IW / 2 - 14, lipx: -L / 2 + inset + 8, railHy: IW / 2 - 20,
    gangPitch,
    plateX: split ? L / 2 + K.spliceDepth : L, plateY: OW + K.dovetail,
    usableX, usableY, usableZ, plate: [bx0, by0, bx1, by1],
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
  if (d.Hb > d.usableZ) w.push(`FAIL lane ${d.Hb.toFixed(0)} mm is taller than the ${d.usableZ.toFixed(0)} mm of Z this printer leaves clear`);
  if (d.inset && d.inset - o.wall < o.canD + 4) w.push(`FAIL chute ${(d.inset - o.wall).toFixed(0)} mm is narrower than a can - cans would jam at the drop`);
  if (d.n < 1) w.push("FAIL no cans fit on a deck - lengthen the lane");
  if (d.split && d.xd > -K.spliceDepth - 20) w.push("FAIL chute reaches the splice - lengthen the lane");
  if (o.wall < K.dovetail + 2.5) w.push(`WARN wall ${o.wall} mm leaves under 2.5 mm behind the dovetail`);
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
   * multi-polygon CrossSection. ystretch = sqrt(3) makes the self-supporting
   * cell: vertical side ligaments, 45 deg peaks. Only whole cells are kept and
   * the grid is centred in the panel, so every hole is the same shape and the
   * border reads as a frame. A cell touching one of the `holes` keep-outs is
   * dropped rather than clipped, for the same reason.
   */
  hexCells(R: number, t: number, bounds: CS, ystretch = 1, holes: CS[] = []): CS | null {
    const P = R + t / Math.sqrt(3);
    const hexa: Vec2[] = [];
    for (let k = 0; k < 6; k++) {
      const a = ((90 + 60 * k) * Math.PI) / 180;
      hexa.push([R * Math.cos(a), R * Math.sin(a) * ystretch]);
    }
    const lat = { dx: Math.sqrt(3) * P, dy: 1.5 * P * ystretch, hw: (Math.sqrt(3) * R) / 2, hh: R * ystretch, stagger: true };
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
    for (const [cx, cy, i, j] of centres) {
      const c = cell(cx + shiftX, cy + shiftY, i, j);
      if (blocked && c.intersect(blocked).area() > 1e-6) continue;
      out.push(c);
    }
    return out.length ? this.CrossSection.union(out) : null;
  }

  /** The chosen pattern's holes in `panel`, radius R, ligament t, clear of `keep`. */
  cellsOf(p: Pattern, R: number, t: number, panel: CS, keep: CS[]): CS | null {
    const square = { dx: 2 * R + t, dy: 2 * R + t, hw: R, hh: R, stagger: false };
    switch (p) {
      case "hex":
        return this.hexCells(R, t, panel, 1, keep);
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
      keep.push(this.prismZ(plan.offset(-inset, "Round", 2, 24), z1 - z0 + 0.01, z0));
    }
    for (const pad of pads) keep.push(this.prismZ(pad, zMax - zMin, zMin));
    return this.isect(body, this.union(keep));
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
  lip: M; riser08: M; riser24: M; cover: M[];
  baseplate: M[]; // Gridfinity baseplate tiles, each within the bed; empty on another base
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
  const lipx = xd + 8;
  const minimal = o.design === "minimal";

  // deck centre band: open between the rails, cross-ties every ~80 mm, a tie at each end
  const endTie = minimal ? 2.5 : 6;
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
  const tw = minimal ? 2.5 : 8;
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

export function buildDeck(g: Geo, o: Options, d: Derived, ln: Lane): M {
  const { L, IW } = d;
  const minimal = o.design === "minimal";
  const fit = o.fit;
  // the wedge sits between the walls. Under each wall it puts out an ear as tall as the
  // deck's low end, with the slot the wall's tab drops through: that is what holds the
  // deck up on the tier below, and the wall to the deck
  const adds = [g.prismY(g.poly([[ln.xd, 0], [L / 2, 0], [L / 2, ln.te], [ln.xe, ln.te], [ln.xd, K.deckLo]]), IW, -IW / 2)];
  for (const sy of [1, -1]) for (const tx of ln.tabs) adds.push(g.box(K.earW, o.wall + 1, K.deckLo, tx, sy * (IW / 2 + o.wall / 2 - 0.5), K.deckLo / 2));
  const cuts: M[] = [];
  if (!o.solid) {
    // minimal: the rail is a 2.5 mm fin at the inner edge of the standard rail, and the
    // strip between fin and wall opens too. A necked can is widest at its body, which
    // ends ~12 mm short of each end; pushed over by the full side play the body edge sits
    // at IW/2 - 15.5, still over the fin. It stands on the bed: compression, no bridging.
    const strip = IW / 2 - d.railHy - 2.5;
    // under each ear the strip keeps an ear-high plinth out to the fin, as wide as the
    // wall's pad round its notch: an ear is rooted in the deck by 1 mm, and inside a
    // 2.5 mm tie the tab hole takes all of it. Six loose 12 × 6 × 4 chips a lane, once
    const earPads = ln.tabs.map((tx) => g.rect(tx - K.earW / 2 - 3, -IW, tx + K.earW / 2 + 3, IW));
    for (let i = 0; i + 1 < ln.edges.length; i += 2) {
      const a = ln.edges[i], b = ln.edges[i + 1];
      if (b - a <= 12) continue;
      cuts.push(g.box(b - a, 2 * d.railHy, ln.dhi + 4, (a + b) / 2, 0, ln.dhi / 2 + 1));
      if (minimal) for (const sy of [1, -1]) {
        const face = g.rect(a, sy * (IW / 2 - strip), b, sy * IW / 2);
        cuts.push(g.prismZ(face, ln.dhi + 4, K.deckLo));
        cuts.push(g.prismZ(face.subtract(g.cs2d(...earPads)), K.deckLo + 1, -1));
      }
    }
  }
  for (const sy of [1, -1]) {
    for (const tx of ln.tabs) cuts.push(tabHole(g, o, "x", ln.dhi + 4, tx, sy * d.piny, -1));
    // the lip's 5 × 12 tabs (blade thickness along X); the pocket was 12.4 × 5.4 since
    // cansys.py, turned 90° from the tab it was for
    cuts.push(g.box(5.4 + fit, 12.4 + fit, 40, ln.lipx, sy * d.lipy, 10));
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
  const H = ln.H, b = K.border;
  const y0 = sy > 0 ? IW / 2 : -OW / 2;
  const c = K.dtCl + o.fit;
  const gang = o.lanesWide > 1;
  const adds = [g.box(L, o.wall, H, 0, y0 + o.wall / 2, H / 2)];
  const piny = sy * d.piny;
  const notchH = K.deckLo + c;
  for (const tx of ln.tabs) adds.push(tab(g, "x", notchH + 1, tx, piny, 0));
  for (const sx of [1, -1]) adds.push(tab(g, "x", K.pinH + 1, sx * d.px, piny, H - 1));
  const dtx = dtxOf(d);
  const ribZ = 8;
  if (gang && sy > 0) for (const dx of [-dtx, dtx]) {
    adds.push(g.prismZ(g.poly([
      [dx - K.dtBase / 2, OW / 2], [dx + K.dtBase / 2, OW / 2],
      [dx + K.dtTip / 2, OW / 2 + K.dovetail], [dx - K.dtTip / 2, OW / 2 + K.dovetail],
    ]), H - 12 - ribZ, ribZ));
  }
  let body = g.union(adds);

  const cuts: M[] = [g.prismX(g.roundOver(sy * OW / 2, H, sy, K.edgeR), L + 2, -L / 2 - 1)];
  // the notch over each deck ear; the tab stands inside it, leaving the ear's slot
  const notch = (w: number, h: number, x: number) => g.box(w + 2 * c, o.wall + 2, h + 1, x, sy * d.py, (h - 1) / 2);
  for (const tx of ln.tabs) cuts.push(g.diff(notch(K.earW, notchH, tx), [tab(g, "x", notchH + 2, tx, piny, -1)]));
  // the end wall's side tab drops into this as the wall drops on
  cuts.push(notch(K.tabT, ln.te + K.sideTabH + c, ln.xe + K.tabT / 2));
  // the tier below's pins, or the risers' bosses
  for (const sx of [1, -1]) cuts.push(notch(K.tabW, K.pinH + c, sx * d.px));
  if (gang && sy < 0) {
    const bw = K.dtBase + 2 * c, tw = K.dtTip + 2 * c;
    for (const dx of [-dtx, dtx]) {
      cuts.push(g.prismZ(g.poly([
        [dx - bw / 2, -OW / 2], [dx + bw / 2, -OW / 2],
        [dx + tw / 2, -OW / 2 + K.dovetail], [dx - tw / 2, -OW / 2 + K.dovetail],
      ]), H + 2, ribZ - 1));
    }
  }
  if (!o.solid) {
    const minimal = o.design === "minimal";
    const keep: CS[] = [];
    if (gang) for (const dx of [-dtx, dtx]) keep.push(g.rect(dx - K.dtTip / 2 - 2.5, 0, dx + K.dtTip / 2 + 2.5, H));
    if (d.split) keep.push(g.rect(-K.spliceDepth - 2.5, 0, 2.5, H));
    const endNotch = g.rect(ln.xe - 3, -1, L / 2 + 1, ln.te + K.sideTabH + 4);
    keep.push(endNotch);
    const panel = g.rect(-L / 2 + b, fieldBottom(o), L / 2 - b, H - b);
    const wcells = g.cellsOf(o.pattern, d.hexR, d.lig, panel, keep);
    if (wcells) cuts.push(g.prismY(wcells, o.wall + 2, y0 - 1));

    // recess the outer face over the lattice field and down through the bottom border to
    // a web. Pads stay over every tab root and the end notch, so a tab is rooted in a
    // full-thickness wall. A pad is exactly the notch's width: with the ear flush in the
    // notch below it, the two read as one post from the bottom edge up. The minimal web
    // is four 0.42 mm lines, the same floor as the ligament width: two perimeters a
    // side, no infill
    const rd = o.wall - (minimal ? K.ligMin : K.web);
    if (rd > 0.2) {
      const pads = [endNotch, ...ln.tabs.map((tx) => g.rect(tx - K.earW / 2 - c, -1, tx + K.earW / 2 + c, notchH + 4))];
      const field = panel.subtract(g.cs2d(...keep));
      for (const comp of field.decompose()) {
        const { min: [gx0], max: [gx1] } = comp.bounds();
        const face = g.rect(gx0, -1, gx1, H - b).subtract(g.cs2d(...pads));
        cuts.push(g.prismY(face, rd + 1, sy > 0 ? OW / 2 - rd : -OW / 2 - 1));
      }
    }
  }
  return g.diff(body, cuts);
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

/** Deck: the tongue is the wedge itself inside the trapezoid, so it carries the slope. */
export function splitDeck(g: Geo, o: Options, d: Derived, ln: Lane, deck: M): [M, M] {
  const cl = K.dtCl + o.fit;
  const wedge = g.prismY(g.poly([[ln.xd, 0], [d.L / 2, 0], [d.L / 2, ln.te], [ln.xe, ln.te], [ln.xd, K.deckLo]]), d.OW, -d.OW / 2);
  const tongue = g.isect(wedge, g.prismZ(g.poly(trapezoid(K.spliceBase, K.spliceTip, K.spliceDepth, 0)), ln.H, -1));
  const socket = g.prismZ(g.poly(trapezoid(K.spliceBase, K.spliceTip, K.spliceDepth, 0, cl)), ln.H + 2, -1);
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
  const outline = g.roundedRect(K.lipH, d.IW - 1, 2.4).translate([-K.lipH / 2, 0]);
  const parts = [g.roundTop(g.prismZ(outline, t), outline, t, 2)];
  for (const sy of [1, -1]) parts.push(g.box(6, 12, t, 3, sy * d.lipy, t / 2));
  const scoop = g.cyl(22, t + 2, -K.lipH - 12, 0, -1, 64);
  return g.diff(g.union(parts), [scoop]);
}

/** A foot under a wall at ±px: as thick as the wall, since the deck starts at the wall's
 *  inner face and the next gang 3 mm past its outer one. The boss goes into the wall's
 *  bottom notch. */
export function buildRiser(g: Geo, o: Options, h: number, side = 20): M {
  return g.union([g.box(side, o.wall, h, 0, 0, h / 2), tab(g, "x", K.pinH, 0, 0, h)]);
}

/** A Gridfinity baseplate for the shelf, printed as it lies: `d.plate` of whole cells, a
 *  pocket in every cell clear of the lanes' pad, the pad solid and flush with the rim
 *  with a riser boss at every lane's ±px and a pocket for the lip's tabs. The lanes
 *  stand on it exactly as they stand on the shelf. With magnets a floor under the
 *  pockets carries 6 × 2 magnets on the 26 mm square. Tiles at cell lines to fit the
 *  bed, keyed with the deck's dovetail wherever a cut runs through solid: at a cell
 *  line the rim is a knife edge, so a cut through pockets just butts, and the lane
 *  standing across the seam holds it. */
export function buildBaseplate(g: Geo, o: Options, d: Derived): M[] {
  const { L, OW, gangPitch: G, plate: [x0, y0, x1, y1] } = d;
  const H = baseHeight(o), P = K.gridPitch, m = K.padMargin;
  const pad = [-L / 2 - m, -OW / 2 - m, L / 2 + m, (o.lanesWide - 1) * G + OW / 2 + m];
  const free: [number, number, number, number][] = [];
  for (let i = 0; (i + 1) * P <= x1 - x0 + 1e-6; i++) for (let j = 0; (j + 1) * P <= y1 - y0 + 1e-6; j++) {
    const c: [number, number, number, number] = [x0 + i * P, y0 + j * P, x0 + (i + 1) * P, y0 + (j + 1) * P];
    if (c[2] <= pad[0] || c[0] >= pad[2] || c[3] <= pad[1] || c[1] >= pad[3]) free.push(c);
  }
  // the pocket, rim down: hulls of the profile's rounded rectangles, like a bin's foot
  // in negative. A skeleton pocket runs through; a floored one stops on the floor
  const { pocketChamferHi: hi, pocketWall: wall, pocketChamferLo: lo, pocketR: r } = K;
  const mid = P - 2 * hi, bottom = mid - 2 * lo; // 37.7, 36.3
  const ring = (side: number, radius: number, z: number) => g.roundedRect(side, side, radius).toPolygons().flat().map(([x, y]) => [x, y, z] as Vec3);
  const zf = H - K.pocketD;
  // the vertical run overlaps both chamfers by 0.01: butted exactly, float left a
  // membrane between them that read as a flat ceiling
  const pocket = g.union([
    g.prismZ(g.roundedRect(P, P, r), 2, H),
    g.hull([...ring(P, r, H), ...ring(mid, r - hi, H - hi)]),
    g.prismZ(g.roundedRect(mid, mid, r - hi), wall + 0.02, zf + lo - 0.01),
    g.hull([...ring(mid, r - hi, zf + lo), ...ring(bottom, r - hi - lo, zf)]),
    ...(o.magnets ? [] : [g.prismZ(g.roundedRect(bottom, bottom, r - hi - lo), 1.01, -1)]),
  ]);
  const cuts: M[] = [];
  for (const [cx0, cy0, cx1, cy1] of free) {
    const cx = (cx0 + cx1) / 2, cy = (cy0 + cy1) / 2;
    cuts.push(pocket.translate([cx, cy, 0]));
    if (o.magnets) for (const sx of [1, -1]) for (const sy of [1, -1]) {
      cuts.push(g.cyl(K.magnetR, K.magnetDepth + 1, cx + sx * K.magnetPitch / 2, cy + sy * K.magnetPitch / 2, zf - K.magnetDepth));
    }
  }
  const adds = [g.prismZ(g.rect(x0, y0, x1, y1), H)];
  for (let i = 0; i < o.lanesWide; i++) for (const sy of [1, -1]) {
    for (const sx of [1, -1]) adds.push(tab(g, "x", K.pinH, sx * d.px, i * G + sy * d.piny, H));
    cuts.push(g.box(5.4 + o.fit, 12.4 + o.fit, 2, -L / 2 + 8, i * G + sy * d.lipy, H)); // the lip's tabs stand 0.58 mm proud of the deck
  }
  const plate = g.diff(g.union(adds), cuts);

  // tiles: cut at cell lines so every tile and its tongue fit the bed
  const cutsAlong = (lo: number, hi: number, usable: number) => {
    const at: number[] = [];
    for (let start = lo; hi - start > usable - K.spliceDepth;) { start += Math.floor((usable - K.spliceDepth) / P) * P; at.push(start); }
    return at;
  };
  const cutsX = cutsAlong(x0, x1, d.usableX), cutsY = cutsAlong(y0, y1, d.usableY);
  // where a cut runs through solid: the plate's extent less every free cell it borders
  // and less a band round each crossing cut, so no tongue is itself cut in two
  const solidAlong = (axis: "x" | "y", c: number): [number, number][] => {
    const [lo, hi] = axis === "x" ? [y0, y1] : [x0, x1];
    const holes: [number, number][] = free
      .filter((cell) => (axis === "x" ? cell[0] === c || cell[2] === c : cell[1] === c || cell[3] === c))
      .map((cell) => (axis === "x" ? [cell[1], cell[3]] : [cell[0], cell[2]]));
    for (const cc of axis === "x" ? cutsY : cutsX) holes.push([cc - 25, cc + 25]);
    holes.sort((a, b) => a[0] - b[0]);
    const out: [number, number][] = [];
    let at = lo;
    for (const [h0, h1] of holes) { if (h0 > at) out.push([at, h0]); at = Math.max(at, h1); }
    if (hi > at) out.push([at, hi]);
    return out.filter(([a, b]) => b - a >= K.spliceTip + 10);
  };
  const keys = (axis: "x" | "y", c: number, grow: number) => {
    const shapes = solidAlong(axis, c).map(([a, b]) => {
      const pts = trapezoid(K.spliceBase, K.spliceTip, K.spliceDepth, (a + b) / 2, grow);
      return g.poly(axis === "x" ? pts.map(([u, v]) => [u + c, v] as Vec2) : pts.map(([u, v]) => [v, u + c] as Vec2));
    });
    return shapes.length ? g.prismZ(g.cs2d(...shapes), H + 4, -1) : null;
  };
  const cl = K.dtCl + o.fit;
  let tiles = [plate];
  for (const axis of ["x", "y"] as const) {
    for (const c of axis === "x" ? cutsX : cutsY) {
      const tongue = keys(axis, c, 0), socket = keys(axis, c, cl);
      tiles = tiles.flatMap((t) => {
        const bb = t.boundingBox();
        const [lo, hi] = axis === "x" ? [bb.min[0], bb.max[0]] : [bb.min[1], bb.max[1]];
        if (c <= lo + 1 || c >= hi - 1) return [t];
        const big = Math.max(x1 - x0, y1 - y0) * 2 + 20;
        const side = (sign: number) => (axis === "x" ? g.box(big, big, big, c + sign * big / 2, 0, 0) : g.box(big, big, big, 0, c + sign * big / 2, 0));
        const rear = tongue ? g.union([g.isect(t, side(1)), g.isect(t, tongue)]) : g.isect(t, side(1));
        const front = socket ? g.diff(g.isect(t, side(-1)), [socket]) : g.isect(t, side(-1));
        return [front, rear];
      });
    }
  }
  return tiles;
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
  if (d.inset > 0) {
    const windowL = o.canD + 8;
    const window = g.roundedRect(windowL, d.IW, 6).translate([L / 2 - o.wall - windowL / 2, 0]);
    cuts.push(g.prismZ(window, t + 2, -1));
    keep.push(window.offset(4, "Miter"));
  }
  if (!o.solid) {
    for (const sx of [1, -1]) for (const sy of [1, -1]) keep.push(g.rect(sx * d.px - 8, sy * d.py - 8, sx * d.px + 8, sy * d.py + 8));
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

export function buildAll(g: Geo, o: Options, d: Derived): PartSet {
  const cascade = d.inset > 0;
  const roles: LaneRole[] = cascade ? (o.tiers >= 3 ? ["bottom", "mid", "top"] : ["bottom", "top"]) : ["top"];
  return {
    lanes: roles.map((role) => ({ role, plates: buildLanePlates(g, o, d, role) })),
    lip: buildLip(g, o, d),
    riser08: buildRiser(g, o, 8), riser24: buildRiser(g, o, 24),
    cover: o.cover ? buildCover(g, o, d) : [],
    baseplate: o.base === "gridfinity" ? buildBaseplate(g, o, d) : [],
  };
}


/** Filament estimate: layer-sum of (shell + infill * core), like cansys.py, with skins:
 *  the core is what sits inside the perimeters with `skin` of material above and below.
 *  A slicer prints the rest solid, so a plate thinner than two skins has no core at all
 *  and a sloped deck top is solid along the whole slope, not only at its edge. */
export function filamentGrams(m: M, dz = 1.5, shell = 1.26, infill = 0.06, density = 1.27, skin = 1): number {
  const bb = m.boundingBox();
  let solid = 0;
  for (let z = bb.min[2] + dz / 2; z < bb.max[2]; z += dz) {
    const s = m.slice(z);
    const a = s.area();
    if (a <= 0) continue;
    const core = s.offset(-shell, "Miter").intersect(m.slice(z + skin)).intersect(m.slice(z - skin));
    const ia = Math.max(core.area(), 0);
    solid += a - ia + infill * ia;
  }
  return (solid * dz) / 1000 * density;
}
