// Turns "the space I have" into ranked layouts. Pure arithmetic - runs live
// in the UI before any geometry is built.
import { K, solve, check, laneLengthFor, baseHeight, type Options, type Derived } from "./geometry";

export interface Space { w: number; d: number; h: number; front: number } // front: mm kept free for a hand

export interface Layout {
  options: Options;  // lanesWide, tiers and the rest live here - never copied out
  derived: Derived;  // L, and every other dimension solve() produced
  cans: number;
  footprint: [number, number, number]; // w, d, h of the assembly incl. the base
  gramsEst: number; // rough, from the lane count (refined after geometry)
  warnings: string[];
  style: Style;
}
export type Style = "cascade" | "flat";

const SIDE_GAP = 4;    // per side, so a lane does not scrape the shelf's sides

/** The least shelf one lane needs, for the empty state: one flat tier on its base. */
export function laneNeeds(base: Options): { w: number; h: number } {
  const d = solve({ ...base, cascade: false, length: 200 });
  return { w: d.gangPitch + 2 * SIDE_GAP, h: baseHeight(base) + d.H };
}

export function fitSpace(space: Space, base: Options, opts: { cascade: boolean }): Layout[] {
  const styles: Style[] = opts.cascade ? ["cascade", "flat"] : ["flat"];
  const out: Layout[] = [];
  for (const style of styles) {
    const usableD = space.d - space.front;
    // each lane's feet take the cells that cover it, or all the shelf has room for when
    // that is fewer, and lanes go a floor apart on the baseplate
    const shelfCells: [number, number] = [Math.floor(usableD / K.gridPitch), Math.floor(space.w / K.gridPitch)];
    const seed: Options = { ...base, cascade: style === "cascade", length: 480, shelfCells };
    const lanesMax = lanesAcross(space, seed);
    if (lanesMax < 1) continue; // not even one lane fits across; say so by offering nothing
    const seen = new Set<number>();
    for (const length of candidateLengths(usableD, seed)) {
      const layout = layoutFor({ ...seed, length, lanesWide: lanesMax, tiers: 1 }, space, style);
      if (!layout || seen.has(layout.derived.L)) continue;
      seen.add(layout.derived.L);
      out.push(layout);
    }
  }
  return rank(out, styles);
}

/** How many lanes fit side by side: by gang pitch on a shelf, by whole floors on a grid. */
function lanesAcross(space: Space, seed: Options): number {
  const seedD = solve(seed);
  if (seed.base !== "gridfinity") return Math.floor((space.w - 2 * SIDE_GAP) / seedD.gangPitch);
  let lanes = Math.floor(seed.shelfCells[1] / seedD.floorCells[1]);
  while (lanes > 0 && lanes * seedD.gangPitch - 2 * K.gridGap > space.w) lanes--; // a lane wider than its cells
  return lanes;
}

/** Lane lengths worth trying: as long as fits, the single-plate size, and the shortest
 *  lane for every whole-can count under that - deck that holds no can is filament and
 *  shelf spent on nothing, and what it frees at the front is where a hand goes. */
function candidateLengths(usableD: number, seed: Options): number[] {
  const lengths = new Set<number>();
  const maxLen = Math.min(usableD, 2 * (seed.bed[0] - 2 * seed.bedMargin - 10)); // 10: 2 mm inside solve()'s spliceDepth cap
  lengths.add(Math.floor(maxLen));
  // The single-plate size is only a candidate while it still fits the shelf.
  lengths.add(Math.floor(Math.min(maxLen, seed.bed[0] - 2 * seed.bedMargin)));
  for (const bottom of seed.cascade ? [false, true] : [false]) {
    for (let cans = 1; laneLengthFor(seed, cans, bottom) <= maxLen; cans++) lengths.add(Math.ceil(laneLengthFor(seed, cans, bottom)));
  }
  return [...lengths].filter((length) => length >= 120);
}

/** The layout of `o` with as many tiers as the shelf's height takes, or null when it
 *  cannot be built: no tier fits, a cascade of one, or check() fails it. */
function layoutFor(o: Options, space: Space, style: Style): Layout | null {
  const d = solve(o);
  const cascade = o.cascade;
  const riser = baseHeight(o);
  const tierH = space.h - riser;
  const tiers = cascade
    ? (tierH >= d.Hb ? 1 + Math.floor((tierH - d.Hb) / d.H) : 0)
    : Math.floor(tierH / d.H);
  if (tiers < 1) return null;
  if (cascade && tiers < 2) return null; // a one-tier cascade is just a flat lane with a chute
  o.tiers = tiers;
  const w = check(o, d);
  if (w.some((x) => x.startsWith("FAIL"))) return null;
  const grid = o.base === "gridfinity";
  const lanesMax = o.lanesWide;
  const perLane = cascade ? d.nBottom + (tiers - 1) * d.n : d.n * tiers;
  const height = riser + (cascade ? d.Hb + (tiers - 1) * d.H : tiers * d.H);
  const lanes = lanesMax * tiers;
  // per 480 mm lane and per cover, from filamentGrams on the default parts; the lip is ~9 g
  const laneGrams = o.design === "minimal" ? 250 : 325;
  const coverGrams = o.cover ? (o.design === "minimal" ? 90 : 130) : 0;
  return {
    options: o, derived: d, cans: perLane * lanesMax,
    footprint: [grid ? (lanesMax - 1) * d.gangPitch + d.foot[3] - d.foot[1] : lanesMax * d.gangPitch, grid ? d.foot[2] - d.foot[0] : d.L, height],
    gramsEst: (lanes * laneGrams + lanesMax * coverGrams) * (d.L / 480) + lanesMax * 9,
    warnings: w, style,
  };
}

/** Most cans, then the lowest stack, then the shortest lane; the two best of each style
 *  so the flat/cascade trade-off is always visible. The style the user asked for comes
 *  first - a flat stack holds more cans, and ranking on that alone put it ahead of the
 *  cascade the ticked box was asking to see. */
function rank(layouts: Layout[], styles: Style[]): Layout[] {
  const ranked = layouts.sort((a, b) => b.cans - a.cans || a.footprint[2] - b.footprint[2] || a.derived.L - b.derived.L);
  return styles.flatMap((style) => ranked.filter((l) => l.style === style).slice(0, 2));
}
