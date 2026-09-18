// Turns "the space I have" into ranked layouts. Pure arithmetic - runs live
// in the UI before any geometry is built.
import { solve, check, laneLengthFor, type Options, type Derived } from "./geometry";

export interface Space { w: number; d: number; h: number; front: number } // front: mm kept free for a hand

export interface Layout {
  options: Options;  // lanesWide, tiers and the rest live here - never copied out
  derived: Derived;  // L, and every other dimension solve() produced
  cans: number;
  footprint: [number, number, number]; // w, d, h of the assembly incl. risers
  gramsEst: number; // rough, from the lane count (refined after geometry)
  warnings: string[];
  style: "cascade" | "flat";
}

const SIDE_GAP = 4;    // per side
const RISER = 24;      // riser height when feet are on

export function fitSpace(space: Space, base: Options, opts: { cascade: boolean }): Layout[] {
  const out: Layout[] = [];
  const styles: ("cascade" | "flat")[] = opts.cascade ? ["cascade", "flat"] : ["flat"];
  for (const style of styles) {
    const usableD = space.d - space.front;
    const seed: Options = { ...base, cascade: style === "cascade", length: 480 };
    const seedD = solve(seed);
    const lanesMax = Math.floor((space.w - 2 * SIDE_GAP) / seedD.gangPitch);
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
    for (const length of lengths) {
      if (length < 120) continue;
      const o: Options = { ...base, length, cascade: style === "cascade", lanesWide: lanesMax, tiers: 1 };
      const d = solve(o);
      const cascade = d.inset > 0;
      const riser = base.feet ? RISER : 0;
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
        footprint: [lanesMax * d.gangPitch, d.L, height],
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

