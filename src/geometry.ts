// Geometry for the can-storage system, on the manifold-3d kernel.
// This is a line-for-line port of cansys.py; that file is the reference and
// the regression oracle (see test/regress.test.ts). Units: mm, Z up.

import type { CrossSection as CS, Manifold as M, ManifoldToplevel } from "manifold-3d";

export type Vec2 = [number, number];

// ---------------------------------------------------------------- spec
export interface Options {
  canD: number;
  canL: number;
  length: number; // target lane length; > usable bed → two keyed halves
  perDeck: number; // 0 = derive from length
  tiers: number;
  lanesWide: number;
  chute: number; // -1 auto cascade, 0 flat, else explicit mm
  slope: number; // degrees
  wall: number;
  clearance: number;
  fit: number;
  hexR: number;
  lig: number;
  solid: boolean;
  cover: boolean;
  feet: boolean; // 24 mm risers under the bottom tier (off: lane sits flat on the shelf)
  bed: [number, number, number];
  bedMargin: number;
}

export const DEFAULTS: Options = {
  canD: 66, canL: 122.5, length: 480, perDeck: 0, tiers: 2, lanesWide: 2,
  chute: -1, slope: 3, wall: 6, clearance: 3.5, fit: 0, hexR: 9, lig: 1.7,
  solid: false, cover: true, feet: false, bed: [256, 256, 256], bedMargin: 3,
};

// fixed design constants (same names as cansys.py)
const K = {
  deckLo: 4, topgap: 2, slack: 8, lipH: 20, cornerR: 5, chamfer: 1,
  border: 5, web: 3.5, skin: 1.8,
  dovetail: 3, dtBase: 10, dtTip: 14, dtCl: 0.25,
  pegR: 2, pegH: 4, socR: 2.2, socD: 4.5,
  spliceBase: 30, spliceTip: 40, spliceDepth: 8, lapLen: 10,
  partGap: 6,
};

export interface Derived {
  n: number; nBottom: number; split: boolean;
  L: number; IW: number; OW: number; H: number; Hb: number;
  run: number; dhi: number; dhiB: number; tan: number; inset: number;
  xd: number; px: number; py: number; lipy: number; lipx: number; railHy: number;
  gangPitch: number; plateX: number; plateY: number; usableX: number; usableY: number;
}

export function solve(o: Options): Derived {
  const tan = Math.tan((o.slope * Math.PI) / 180);
  const inset = o.chute === 0 ? 0 : o.chute < 0 ? o.canD + 6 + o.wall : o.chute;
  const usableX = o.bed[0] - 2 * o.bedMargin;
  const usableY = o.bed[1] - 2 * o.bedMargin;
  let n: number, L: number;
  if (o.perDeck > 0) {
    n = o.perDeck;
    L = Math.round((n * o.canD + inset + o.wall + K.slack) * 10) / 10;
  } else {
    L = Math.min(o.length, 2 * (usableX - K.lapLen));
    n = Math.floor((L - inset - o.wall - K.slack) / o.canD);
  }
  const split = L > usableX;
  const nBottom = Math.floor((L - o.wall - K.slack) / o.canD);
  const IW = Math.round((o.canL + o.clearance) * 10) / 10;
  const OW = IW + 2 * o.wall;
  const run = L - inset;
  const dhi = K.deckLo + run * tan;
  const H = Math.ceil(dhi + o.canD + K.topgap);
  const dhiB = K.deckLo + L * tan;
  const Hb = Math.ceil(dhiB + o.canD + K.topgap);
  return {
    n, nBottom, split, L, IW, OW, H, Hb, run, dhi, dhiB, tan, inset,
    xd: -L / 2 + inset, px: L / 2 - 40, py: IW / 2 + o.wall / 2,
    lipy: IW / 2 - 14, lipx: -L / 2 + inset + 8, railHy: IW / 2 - 20,
    gangPitch: OW + K.dovetail,
    plateX: split ? L / 2 + K.lapLen : L, plateY: OW + K.dovetail,
    usableX, usableY,
  };
}

export function check(o: Options, d: Derived): string[] {
  const w: string[] = [];
  const big = Math.max(d.usableX, d.usableY);
  if (d.plateX > big) w.push(`FAIL lane half ${d.plateX.toFixed(0)} mm is longer than the bed - shorten the lane`);
  if (d.plateY > big) w.push(`FAIL lane width ${d.plateY.toFixed(0)} mm is wider than the bed - can is too long for this printer`);
  if (d.inset && d.inset - o.wall < o.canD + 4) w.push(`FAIL chute ${(d.inset - o.wall).toFixed(0)} mm is narrower than a can - cans would jam at the drop`);
  if (d.n < 1) w.push("FAIL no cans fit on a deck - lengthen the lane");
  if (d.split && d.xd > -K.spliceDepth - 20) w.push("FAIL chute reaches the splice - lengthen the lane");
  if (o.wall < K.dovetail + 2.5) w.push(`WARN wall ${o.wall} mm leaves under 2.5 mm behind the dovetail`);
  if (!o.solid && o.lig < 1.6) w.push(`WARN ligament ${o.lig} mm is under four 0.42 mm lines`);
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
  union(parts: M[]): M {
    return parts.length === 1 ? parts[0] : this.Manifold.union(parts);
  }
  diff(a: M, cuts: M[]): M {
    return cuts.length ? this.Manifold.difference([a, ...cuts]) : a;
  }
  isect(a: M, b: M): M {
    return this.Manifold.intersection([a, b]);
  }
  cs2d(...cs: CS[]): CS {
    return this.CrossSection.union(cs);
  }

  /**
   * Hexagon holes on a uniform-gap grid inside `bounds`, returned as one
   * multi-polygon CrossSection. ystretch = sqrt(3) makes the self-supporting
   * cell: vertical side ligaments, 45 deg peaks. Cells cut by the top edge are
   * dropped (a flat-topped hole is a bridge); bottom/side cuts are kept.
   * `holes` are solid keep-outs the cells are clipped around.
   */
  hexCells(R: number, t: number, bounds: CS, ystretch = 1, holes: CS[] = []): CS | null {
    const P = R + t / Math.sqrt(3);
    const dx = Math.sqrt(3) * P, dy = 1.5 * P * ystretch;
    const hw = (Math.sqrt(3) * R) / 2, hh = R * ystretch;
    const hexa: Vec2[] = [];
    for (let k = 0; k < 6; k++) {
      const a = ((90 + 60 * k) * Math.PI) / 180;
      hexa.push([R * Math.cos(a), R * Math.sin(a) * ystretch]);
    }
    const keep = holes.length ? bounds.subtract(this.CrossSection.union(holes)) : bounds;
    const { min: [x0, y0], max: [x1, y1] } = bounds.bounds();
    const minArea = 2.5 * t * t;
    const cells: CS[] = [];
    const nrow = Math.floor((y1 - y0 - 2 * hh) / dy) + 1;
    for (let j = -1; j <= nrow; j++) {
      const cy = y0 + hh + j * dy;
      if (cy + hh > y1 + 1e-6) continue;
      const off = j % 2 ? dx / 2 : 0; // note: JS % keeps sign; -1 % 2 = -1 → truthy, matches Python odd
      for (let i = -1; i <= Math.floor((x1 - x0) / dx) + 2; i++) {
        const cx = x0 + hw + i * dx + off;
        const c = this.poly(hexa.map(([px, py]) => [px + cx, py + cy] as Vec2)).intersect(keep);
        for (const g of c.decompose()) {
          const b = g.bounds();
          if (g.area() >= minArea && b.max[0] - b.min[0] >= 2 * t) cells.push(g);
        }
      }
    }
    return cells.length ? this.CrossSection.union(cells) : null;
  }
}

// ---------------------------------------------------------------- parts
export type LaneRole = "top" | "mid" | "bottom";
export interface PartSet {
  lanes: { role: LaneRole; whole?: M; front?: M; rear?: M }[];
  lip: M; riser08: M; riser24: M; cover: M[];
}

/** bottom: no chute, full deck, dispense lip at the front.
 *  top: nothing drops in from above, so the high end gets a loading lip instead of a wall. */
export function buildLane(g: Geo, o: Options, d: Derived, bottom = false, top = false): M {
  const { L, IW, OW } = d;
  const inset = bottom ? 0 : d.inset;
  const xd = -L / 2 + inset;
  const dhi = bottom ? d.dhiB : d.dhi;
  const H = bottom ? d.Hb : d.H;
  const { px, py, lipy } = d;
  const lipx = xd + 8;
  const fit = o.fit;

  // deck wedge + walls + end wall, then round the vertical corners
  const ewh = top ? dhi + K.lipH : H; // high-end wall height
  const wedge = () => g.prismY(g.poly([[xd, 0], [L / 2, 0], [L / 2, dhi], [xd, K.deckLo]]), OW, -OW / 2);
  let body = g.union([
    wedge(),
    g.box(L, o.wall, H, 0, py, H / 2),
    g.box(L, o.wall, H, 0, -py, H / 2),
    g.box(o.wall, IW, ewh, L / 2 - o.wall / 2, 0, ewh / 2),
  ]);
  if (K.cornerR > 0) body = g.isect(body, g.prismZ(g.roundedRect(L, OW, K.cornerR), H + 2, -1));

  const adds: M[] = [body];
  for (const sx of [1, -1]) for (const sy of [1, -1]) adds.push(g.cyl(K.pegR, K.pegH, sx * px, sy * py, H));
  const dtx = L / 2 - K.dtTip / 2 - K.cornerR - 6;
  for (const dx of [-dtx, dtx]) {
    adds.push(g.prismZ(g.poly([
      [dx - K.dtBase / 2, OW / 2], [dx + K.dtBase / 2, OW / 2],
      [dx + K.dtTip / 2, OW / 2 + K.dovetail], [dx - K.dtTip / 2, OW / 2 + K.dovetail],
    ]), H - 32, 8));
  }
  body = g.union(adds);

  const cuts: M[] = [];
  // top outer edge chamfer
  for (const sy of [1, -1]) {
    const tri: Vec2[] = [[sy * OW / 2, H + 0.01], [sy * (OW / 2 - K.chamfer), H + 0.01], [sy * OW / 2, H - K.chamfer]];
    cuts.push(g.prismX(g.poly(sy > 0 ? tri : tri.slice().reverse()), L + 2, -L / 2 - 1));
  }
  if (!o.solid) {
    const b = K.border;
    const keep: CS[] = [];
    for (const dx of [-dtx, dtx]) keep.push(g.rect(dx - K.dtTip / 2 - 2.5, 0, dx + K.dtTip / 2 + 2.5, H));
    if (d.split) keep.push(g.rect(-K.lapLen - 2.5, 0, 2.5, H));
    const panel = g.rect(-L / 2 + b, b, L / 2 - b, H - b);
    const wcells = g.hexCells(o.hexR, o.lig, panel, Math.sqrt(3), keep);
    if (wcells) for (const sy of [1, -1]) cuts.push(g.prismY(wcells, o.wall + 4, sy * py - (o.wall + 4) / 2));

    // recess the outer face over the lattice field; 45 deg ceiling
    const rd = o.wall - K.web;
    if (rd > 0.2) {
      const field = panel.subtract(g.cs2d(...keep));
      const zt = H - b;
      for (const comp of field.decompose()) {
        const { min: [gx0], max: [gx1] } = comp.bounds();
        for (const sy of [1, -1]) {
          const yo = sy * OW / 2;
          cuts.push(g.prismY(g.rect(gx0, b - 1, gx1, zt - rd), rd + 1, sy > 0 ? yo - rd : yo - 1));
          const tri: Vec2[] = [[yo - sy * rd, zt - rd], [yo + sy * 1, zt - rd], [yo + sy * 1, zt + 1]];
          cuts.push(g.prismX(g.poly(sy > 0 ? tri : tri.slice().reverse()), gx1 - gx0, gx0));
        }
      }
    }
    // end wall (only when tall enough for a row of cells)
    if (ewh - 2 * b > 2 * Math.sqrt(3) * o.hexR) {
      const ecells = g.hexCells(o.hexR, o.lig, g.rect(-IW / 2 + b, b, IW / 2 - b, ewh - b), Math.sqrt(3));
      if (ecells) cuts.push(g.prismX(ecells, o.wall + 4, L / 2 - o.wall - 2));
    }

    // deck centre band: open between the rails, cross-ties every ~80 mm
    const x0 = xd + 6, x1 = L / 2 - o.wall - 6;
    const ties = new Set<number>([Math.round(lipx * 10) / 10]);
    if (d.split) ties.add(Math.round((-K.spliceDepth / 2) * 10) / 10);
    const nt = Math.max(1, Math.round((x1 - x0) / 80) - 1);
    for (let i = 0; i < nt; i++) ties.add(Math.round((x0 + ((x1 - x0) * (i + 1)) / (nt + 1)) * 10) / 10);
    const tw = 8;
    const edges: number[] = [x0];
    for (const t of [...ties].sort((a, b) => a - b)) {
      const extra = Math.abs(t - lipx) < 1 ? 6 : d.split && Math.abs(t + K.spliceDepth / 2) < 1 ? K.spliceDepth / 2 + 2 : 0;
      edges.push(t - (tw / 2 + extra), t + (tw / 2 + extra));
    }
    edges.push(x1);
    for (let i = 0; i + 1 < edges.length; i += 2) {
      const a = edges[i], bb = edges[i + 1];
      if (bb - a > 12) cuts.push(g.box(bb - a, 2 * d.railHy, dhi + 4, (a + bb) / 2, 0, dhi / 2 + 1));
    }
  }
  for (const sx of [1, -1]) for (const sy of [1, -1]) cuts.push(g.cyl(K.socR + fit, K.socD, sx * px, sy * py, -0.01));
  for (const sy of [1, -1]) cuts.push(g.box(12.4 + fit, 5.4 + fit, 40, lipx, sy * lipy, 10));
  const bw = K.dtBase + 2 * (K.dtCl + fit), tw2 = K.dtTip + 2 * (K.dtCl + fit);
  for (const dx of [-dtx, dtx]) {
    cuts.push(g.prismZ(g.poly([
      [dx - bw / 2, -OW / 2], [dx + bw / 2, -OW / 2],
      [dx + tw2 / 2, -OW / 2 + K.dovetail], [dx - tw2 / 2, -OW / 2 + K.dovetail],
    ]), H, 8));
  }
  return g.diff(body, cuts);
}

/** Cut at x=0. Rear half: deck dovetail tongue + outer wall half-laps.
 *  Front half: matching socket + inner half-laps. Slides together vertically. */
export function splitLane(g: Geo, o: Options, d: Derived, lane: M, bottom = false): [M, M] {
  const { L, OW } = d;
  const H = bottom ? d.Hb : d.H;
  const dhi = bottom ? d.dhiB : d.dhi;
  const xd = -L / 2 + (bottom ? 0 : d.inset);
  const cl = K.dtCl + o.fit;
  const big = Math.max(L, OW, H) + 20;
  let rear = g.isect(lane, g.box(big, big, big, big / 2, 0, 0));
  let front = g.isect(lane, g.box(big, big, big, -big / 2, 0, 0));

  const wedge = g.prismY(g.poly([[xd, 0], [L / 2, 0], [L / 2, dhi], [xd, K.deckLo]]), OW, -OW / 2);
  const sb = K.spliceBase, st = K.spliceTip, sd = K.spliceDepth;
  const tongue = g.isect(wedge, g.prismZ(g.poly([[0.5, -sb / 2], [0.5, sb / 2], [-sd, st / 2], [-sd, -st / 2]]), H, -1));
  const socket = g.prismZ(g.poly([[0.5, -(sb / 2 + cl)], [0.5, sb / 2 + cl], [-sd - cl, st / 2 + cl], [-sd - cl, -(st / 2 + cl)]]), H + 2, -1);

  const lapx = -K.lapLen / 2;
  const keeps: M[] = [], cutsF: M[] = [socket];
  for (const sy of [1, -1]) {
    const tk = o.wall / 2 - cl / 2, tc = o.wall / 2 + cl / 2;
    keeps.push(g.isect(lane, g.box(K.lapLen, tk, H + 2, lapx, sy * (OW / 2 - tk / 2), H / 2)));
    cutsF.push(g.box(K.lapLen + 0.5, tc, H + 2, lapx - 0.25, sy * (OW / 2 - tc / 2), H / 2));
  }
  rear = g.union([rear, tongue, ...keeps]);
  front = g.diff(front, cutsF);
  return [front, rear];
}

export function buildLip(g: Geo, o: Options, d: Derived): M {
  const parts = [g.box(5, d.IW - 1, K.lipH, 0, 0, K.lipH / 2)];
  for (const sy of [1, -1]) parts.push(g.box(4.8, 12, 6, 0, sy * d.lipy, -3));
  const scoop = g.cyl(22, 8, 0, 0, -4, 64).rotate([0, 90, 0]).translate([0, 0, K.lipH + 12]);
  return g.diff(g.union(parts), [scoop]);
}

export function buildRiser(g: Geo, o: Options, h: number, side = 20): M {
  const b = g.union([g.box(side, side, h, 0, 0, h / 2), g.cyl(K.pegR, K.pegH, 0, 0, h)]);
  return g.diff(b, [g.cyl(K.socR + o.fit, K.socD, 0, 0, -0.01)]);
}

export function buildCover(g: Geo, o: Options, d: Derived): M[] {
  const { L, OW } = d, t = 2.4;
  const plate = g.prismZ(g.roundedRect(L, OW, K.cornerR), t, 0);
  const cuts: M[] = [];
  for (const sx of [1, -1]) for (const sy of [1, -1]) cuts.push(g.cyl(K.socR + o.fit, t + 1, sx * d.px, sy * d.py, -0.5));
  if (!o.solid) {
    const keep: CS[] = [];
    for (const sx of [1, -1]) for (const sy of [1, -1]) keep.push(g.rect(sx * d.px - 8, sy * d.py - 8, sx * d.px + 8, sy * d.py + 8));
    if (d.split) keep.push(g.rect(-6, -OW, 6, OW));
    const cells = g.hexCells(o.hexR, o.lig, g.rect(-L / 2 + 10, -OW / 2 + 10, L / 2 - 10, OW / 2 - 10), 1, keep);
    if (cells) cuts.push(g.prismZ(cells, t + 2, -1));
  }
  const m = g.diff(plate, cuts);
  if (d.split) {
    const big = L + 20;
    return [g.isect(m, g.box(big, big, 10, -big / 2, 0, 0)), g.isect(m, g.box(big, big, 10, big / 2, 0, 0))];
  }
  return [m];
}

export function buildAll(g: Geo, o: Options, d: Derived): PartSet {
  const cascade = d.inset > 0;
  const roles: LaneRole[] = cascade ? (o.tiers >= 3 ? ["bottom", "mid", "top"] : ["bottom", "top"]) : ["top"];
  const set: PartSet = {
    lanes: [],
    lip: buildLip(g, o, d),
    riser08: buildRiser(g, o, 8), riser24: buildRiser(g, o, 24),
    cover: o.cover ? buildCover(g, o, d) : [],
  };
  for (const role of roles) {
    const m = buildLane(g, o, d, role === "bottom", role === "top");
    if (d.split) { const [front, rear] = splitLane(g, o, d, m, role === "bottom"); set.lanes.push({ role, front, rear }); }
    else set.lanes.push({ role, whole: m });
  }
  return set;
}

/** Filament estimate: layer-sum of (shell + infill * core), like cansys.py. */
export function filamentGrams(m: M, dz = 1.5, shell = 1.26, infill = 0.06, density = 1.27): number {
  const bb = m.boundingBox();
  let solid = 0;
  for (let z = bb.min[2] + dz / 2; z < bb.max[2]; z += dz) {
    const s = m.slice(z);
    const a = s.area();
    if (a <= 0) continue;
    const ia = Math.max(s.offset(-shell, "Miter").area(), 0);
    solid += a - ia + infill * ia;
  }
  return (solid * dz) / 1000 * density;
}
