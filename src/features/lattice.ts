// The pattern cells cut into a wall, end wall or cover panel: hex, circle, kumiko, breeze
// and slat. Pure functions of the kernel (g: Geo); geometry.ts places the panel and the
// keep-outs and calls cellsOf to dispatch on the chosen pattern.
import type { CrossSection as CS } from "manifold-3d";
import { K, type Geo, type Pattern, type Vec2 } from "../geometry";

/** Cell pitch and half-extents for Geo.cells; `stagger` offsets odd rows by dx/2. */
export interface Lattice { dx: number; dy: number; hw: number; hh: number; stagger: boolean }

/** How far three whole rows of a pattern span, as a·R + b·lig; autoR inverts it. */
export const ROWS: Record<Pattern, readonly [number, number]> = {
  hex: [5, Math.sqrt(3)], // 2R + 2 * 1.5P, P = R + lig / sqrt(3)
  circle: [2 + 2 * Math.sqrt(3), Math.sqrt(3)], // 2R + 2 * (sqrt(3) / 2)(2R + lig)
  kumiko: [6, 2], breeze: [6, 2], // three 2R squares, two bars
  slat: [6, 4], // three 2R openings, two 2·lig rails
};

/** Ligament grows with the cell so the bars stay in proportion; never under four 0.42 mm lines. */
export const ligFor = (R: number) => Math.max(K.ligMin, K.ligRatio * R);

/** The radius at which three whole rows fill a panel of height `panelH`, where three
 *  rows span a·R + b·lig (hex: 2R + 2 * 1.5P with P = R + lig / sqrt(3), so [5, √3]).
 *  1 mm spare so float noise cannot drop the top row. Same cells on every tier, sized
 *  from the upper deck. */
export function autoR(panelH: number, [a, b]: readonly [number, number]): number {
  let R = (panelH - 1) / (a + b * K.ligRatio);
  if (K.ligRatio * R < K.ligMin) R = (panelH - 1 - b * K.ligMin) / a;
  return Math.min(K.hexMax, Math.max(K.hexMin, R));
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
export function hexCells(g: Geo, R: number, t: number, bounds: CS, holes: CS[] = []): CS | null {
  const P = R + t / Math.sqrt(3);
  const hexa: Vec2[] = [];
  for (let k = 0; k < 6; k++) {
    const a = ((90 + 60 * k) * Math.PI) / 180;
    hexa.push([R * Math.cos(a), R * Math.sin(a)]);
  }
  const lat = { dx: Math.sqrt(3) * P, dy: 1.5 * P, hw: (Math.sqrt(3) * R) / 2, hh: R, stagger: true };
  return cells(g, lat, bounds, holes, (cx, cy) => g.poly(hexa.map(([px, py]) => [px + cx, py + cy] as Vec2)));
}

/**
 * Cells of one shape on a lattice inside `bounds`: whole cells only (a cell is `hw`
 * by `hh` about its centre), the grid centred in the field, a cell touching one of
 * the `holes` keep-outs dropped. `cell` draws the shape at a centred centre and gets
 * the lattice indices, for patterns that alternate.
 */
export function cells(g: Geo, lat: Lattice, bounds: CS, holes: CS[], cell: (cx: number, cy: number, i: number, j: number) => CS): CS | null {
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
  const blocked = holes.length ? g.cs2d(...holes) : null;
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
  const field = out.length ? g.cs2d(...out) : null;
  for (const c of out) c.delete();
  blocked?.delete();
  return field;
}

/** The chosen pattern's holes in `panel`, radius R, ligament t, clear of `keep`. */
export function cellsOf(g: Geo, p: Pattern, R: number, t: number, panel: CS, keep: CS[]): CS | null {
  const square = { dx: 2 * R + t, dy: 2 * R + t, hw: R, hh: R, stagger: false };
  switch (p) {
    case "hex":
      return hexCells(g, R, t, panel, keep);
    case "circle": // round perforation on the same 60° stagger, holes 2R across, t apart
      return cells(g, { dx: 2 * R + t, dy: (Math.sqrt(3) / 2) * (2 * R + t), hw: R, hh: R, stagger: true }, panel, keep,
        (cx, cy) => g.circle(R, 48).translate([cx, cy]));
    case "kumiko": {
      // goma: a square with one diagonal bar. The diagonal alternates so the two walls
      // read the same from outside and the bars brace both shear directions
      const bar = g.rect(-(R * Math.SQRT2 + t), -t / 2, R * Math.SQRT2 + t, t / 2);
      return cells(g, square, panel, keep, (cx, cy, i, j) =>
        g.rect(cx - R, cy - R, cx + R, cy + R).subtract(bar.rotate((i + j) % 2 ? 45 : -45).translate([cx, cy])));
    }
    case "breeze": {
      // screen block: one quatrefoil per cell, lobe tips at ±R so the bar between cells is t
      const lobe = g.circle(0.6 * R, 48);
      return cells(g, square, panel, keep, (cx, cy) =>
        g.cs2d(...[-1, 1].flatMap((sx) => [-1, 1].map((sy) => lobe.translate([cx + sx * 0.4 * R, cy + sy * 0.4 * R])))));
    }
    case "slat":
      return slats(g, R, t, panel, keep);
  }
}

/**
 * Stadium openings 2R tall between 2t rails, one per row, each running the width of
 * its field component. One opening spans the field, so a keep-out cannot drop it whole:
 * the field is split at the keep-outs first and a component narrower than 4R is left
 * solid, which keeps the strips beside the splice band and the end notch blank.
 */
export function slats(g: Geo, R: number, t: number, panel: CS, keep: CS[]): CS | null {
  const rows: CS[] = [];
  const field = keep.length ? panel.subtract(g.cs2d(...keep)) : panel;
  for (const comp of field.decompose()) {
    const { min: [x0], max: [x1] } = comp.bounds();
    const w = x1 - x0;
    if (w < 4 * R) continue;
    const stadium = (cx: number, cy: number) => g.cs2d(
      g.rect(cx - w / 2 + R, cy - R, cx + w / 2 - R, cy + R),
      g.circle(R, 48).translate([cx - w / 2 + R, cy]),
      g.circle(R, 48).translate([cx + w / 2 - R, cy]),
    );
    const cut = cells(g, { dx: w + 1, dy: 2 * R + 2 * t, hw: w / 2, hh: R, stagger: false }, comp, [], stadium);
    if (cut) rows.push(cut.intersect(comp));
  }
  return rows.length ? g.cs2d(...rows) : null;
}
