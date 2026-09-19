// Turns "the space I have" into ranked layouts. Pure arithmetic - runs live
// in the UI before any geometry is built.
import { solve, check, laneLengthFor, baseHeight, type Options, type Derived } from "./geometry";

export interface Space { w: number; d: number; h: number; front: number } // front: mm kept free for a hand

export interface Layout {
  options: Options;  // lanesWide, tiers and the rest live here - never copied out
  derived: Derived;  // L, and every other dimension solve() produced
  cans: number;
  footprint: [number, number, number]; // w, d, h of the assembly incl. the base
  gramsEst: number; // rough, from the lane count (refined after geometry)
  warnings: string[];
  style: "cascade" | "flat";
}

const SIDE_GAP = 4;    // per side, so a lane does not scrape the shelf's sides
const GRID = 42;       // Gridfinity cell pitch

/** Shelf width kept beside a gang. On a grid the floor already sits 0.25 mm inside its
 *  cells and the baseplate is what touches the shelf, so a 4-cell floor fits a 168 mm shelf. */
const sideRoom = (base: Options) => (base.base === "gridfinity" ? 0 : 2 * SIDE_GAP);

/** The least shelf one lane needs, for the empty state: one flat tier on its base. */
export function laneNeeds(base: Options): { w: number; h: number; cells?: number } {
  const d = solve({ ...base, cascade: false, length: 200 });
  return { w: d.gangPitch + sideRoom(base), h: baseHeight(base.base) + d.H, cells: base.base === "gridfinity" ? d.gridY : undefined };
}

export function fitSpace(space: Space, base: Options, opts: { cascade: boolean }): Layout[] {
  const out: Layout[] = [];
  const styles: ("cascade" | "flat")[] = opts.cascade ? ["cascade", "flat"] : ["flat"];
  for (const style of styles) {
    const usableD = space.d - space.front;
    const seed: Options = { ...base, cascade: style === "cascade", length: 480 };
    let seedD = solve(seed);
    let lanesMax = Math.floor((space.w - sideRoom(base)) / seedD.gangPitch);
    // a grid floor shrinks to the cells the shelf has room for and the lane overhangs it
    // on a skirt: a 138 mm lane on three cells in a 150 mm shelf
    if (lanesMax < 1 && base.base === "gridfinity") {
      seed.floorCells = [0, Math.floor(space.w / GRID)];
      seedD = solve(seed);
      lanesMax = Math.floor(space.w / seedD.gangPitch);
    }
    if (lanesMax < 1) continue; // not even one lane fits across; say so by offering nothing
    // candidate lengths: as long as fits, the single-plate size, and the shortest lane for
    // every whole-can count under that - deck that holds no can is filament and shelf
    // spent on nothing, and what it frees at the front is where a hand goes
    const lengths = new Set<number>();
    const maxLen = Math.min(usableD, 2 * (base.bed[0] - 2 * base.bedMargin - 10));
    lengths.add(Math.floor(maxLen));
    // The single-plate size is only a candidate while it still fits the shelf.
    lengths.add(Math.floor(Math.min(maxLen, base.bed[0] - 2 * base.bedMargin)));
    for (const bottom of style === "cascade" ? [false, true] : [false]) {
      for (let cans = 1; laneLengthFor(seed, cans, bottom) <= maxLen; cans++) lengths.add(Math.ceil(laneLengthFor(seed, cans, bottom)));
    }
    const seen = new Set<number>(); // on a grid several candidates snap to one lane
    for (const length of lengths) {
      if (length < 120) continue;
      const o: Options = { ...seed, length, lanesWide: lanesMax, tiers: 1 };
      let d = solve(o);
      if (seen.has(d.L)) continue;
      seen.add(d.L);
      // on a grid the floor runs past the lane; when the shelf has no room for that, the
      // floor keeps to the cells that fit and the lane overhangs it at the ends
      if (d.foot[2] - d.foot[0] > usableD) {
        o.floorCells = [Math.floor(usableD / GRID), o.floorCells[1]];
        d = solve(o);
        if (d.foot[2] - d.foot[0] > usableD) continue;
      }
      const footL = d.foot[2] - d.foot[0];
      const cascade = d.inset > 0;
      const riser = baseHeight(base.base);
      const tierH = space.h - riser;
      let tiers = cascade
        ? (tierH >= d.Hb ? 1 + Math.floor((tierH - d.Hb) / d.H) : 0)
        : Math.floor(tierH / d.H);
      if (tiers < 1) continue;
      if (cascade && tiers < 2) continue; // a one-tier cascade is just a flat lane with a chute
      o.tiers = tiers;
      const w = check(o, d);
      if (w.some((x) => x.startsWith("FAIL"))) continue;
      const perLane = cascade ? d.nBottom + (tiers - 1) * d.n : d.n * tiers;
      const cans = perLane * lanesMax;
      const height = riser + (cascade ? d.Hb + (tiers - 1) * d.H : tiers * d.H);
      const lanes = lanesMax * tiers;
      // per 480 mm lane and per cover, from filamentGrams on the default parts; the lip is ~9 g
      const laneGrams = base.design === "minimal" ? 250 : 325;
      const coverGrams = base.cover ? (base.design === "minimal" ? 90 : 130) : 0;
      out.push({
        options: o, derived: d, cans,
        footprint: [lanesMax * d.gangPitch, footL, height],
        gramsEst: (lanes * laneGrams + lanesMax * coverGrams) * (d.L / 480) + lanesMax * 9,
        warnings: w, style,
      });
    }
  }
  // most cans, then the lowest stack, then the shortest lane; the two best of each style
  // so the flat/cascade trade-off is always visible. The style the user asked for comes
  // first - a flat stack holds more cans, and ranking on that alone put it ahead of the
  // cascade the ticked box was asking to see.
  const ranked = out.sort((a, b) => b.cans - a.cans || a.footprint[2] - b.footprint[2] || a.derived.L - b.derived.L);
  const picked: Layout[] = [];
  for (const style of styles) picked.push(...ranked.filter((l) => l.style === style).slice(0, 2));
  return picked;
}

