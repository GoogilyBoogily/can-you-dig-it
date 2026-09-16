// Turns "the space I have" into ranked layouts. Pure arithmetic - runs live
// in the UI before any geometry is built.
import { solve, check, type Options, type Derived } from "./geometry";

export interface Space { w: number; d: number; h: number }

export interface Layout {
  options: Options;  // lanesWide, tiers and the rest live here - never copied out
  derived: Derived;  // L, and every other dimension solve() produced
  cans: number;
  footprint: [number, number, number]; // w, d, h of the assembly incl. risers
  gramsEst: number; // rough, from the lane count (refined after geometry)
  warnings: string[];
  style: "cascade" | "flat";
}

const HAND_GAP = 40;   // front clearance to grab a can
const SIDE_GAP = 4;    // per side
const RISER = 24;      // riser height when feet are on

export function fitSpace(space: Space, base: Options, opts: { cascade: boolean }): Layout[] {
  const out: Layout[] = [];
  const styles: ("cascade" | "flat")[] = opts.cascade ? ["cascade", "flat"] : ["flat"];
  for (const style of styles) {
    const usableD = space.d - HAND_GAP;
    const seedD = solve({ ...base, chute: style === "flat" ? 0 : -1, length: 480 });
    const lanesMax = Math.floor((space.w - 2 * SIDE_GAP) / seedD.gangPitch);
    if (lanesMax < 1) continue; // not even one lane fits across; say so by offering nothing
    // candidate lengths: as long as fits, then one can shorter, and the single-plate size
    const lengths = new Set<number>();
    const maxLen = Math.min(usableD, 2 * (base.bed[0] - 2 * base.bedMargin - 10));
    lengths.add(Math.floor(maxLen));
    lengths.add(Math.floor(maxLen - base.canD));
    // The single-plate size is only a candidate while it still fits the shelf.
    lengths.add(Math.floor(Math.min(maxLen, base.bed[0] - 2 * base.bedMargin)));
    for (const length of lengths) {
      if (length < 120) continue;
      for (const slope of [3, 3.5, 4]) {
        const o: Options = { ...base, length, perDeck: 0, chute: style === "flat" ? 0 : -1, slope, lanesWide: lanesMax, tiers: 1 };
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
        out.push({
          options: o, derived: d, cans,
          footprint: [lanesMax * d.gangPitch, d.L, height],
          gramsEst: lanes * (d.L / 480) * 250 + lanesMax * 30,
          warnings: w, style,
        });
      }
    }
  }
  // one entry per (style, lanes, tiers, length): keep the lowest stack; then the
  // two best of each style so the flat/cascade trade-off is always visible
  const seen = new Map<string, Layout>();
  for (const l of out) {
    const k = `${l.style}:${l.options.lanesWide}:${l.options.tiers}:${l.derived.L}`;
    const prev = seen.get(k);
    if (!prev || l.footprint[2] < prev.footprint[2]) seen.set(k, l);
  }
  const ranked = [...seen.values()].sort((a, b) => b.cans - a.cans || a.footprint[2] - b.footprint[2]);
  const picked: Layout[] = [];
  for (const style of ["cascade", "flat"] as const) picked.push(...ranked.filter((l) => l.style === style).slice(0, 2));
  return picked.sort((a, b) => b.cans - a.cans || a.footprint[2] - b.footprint[2]);
}

