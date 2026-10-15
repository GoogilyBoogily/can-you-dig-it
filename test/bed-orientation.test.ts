import { test, expect } from "bun:test";
import { DEFAULTS, K, solve, buildAll, partList, type Options } from "../src/geometry";
import { fitSpace } from "../src/solver";
import { meshDataOf, pack } from "../src/export";
import { geo } from "./geo";

test("transposing a rectangular bed preserves the ranked layouts", () => {
  const space = { w: 300, d: 520, h: 400, front: 0 };
  for (const base of ["flat", "feet", "gridfinity"] as const)
    for (const across of ["left", "centre", "right"] as const)
      for (const along of ["front", "centre", "back"] as const)
        for (const bed of [[150, 300, 256], [120, 256, 256], [256, 256, 256]] as Options["bed"][]) {
          const options = { ...DEFAULTS, base, across, along, bed };
          const turnedOptions = { ...options, bed: [bed[1], bed[0], bed[2]] as Options["bed"] };
          const summarize = (input: Options) => fitSpace(space, input, { cascade: true }).map((layout) => ({
            cans: layout.cans, length: layout.derived.L, split: layout.derived.split,
            footprint: layout.footprint, style: layout.style,
          }));
          expect(summarize(options), JSON.stringify(options)).toEqual(summarize(turnedOptions));
        }
});

test("a lane splits only when its whole plate envelope fits neither orientation", () => {
  for (const bed of [[150, 300, 256], [300, 150, 256], [256, 256, 256]] as Options["bed"][]) {
    const usableLength = Math.max(bed[0], bed[1]) - 2 * DEFAULTS.bedMargin;
    const options = { ...DEFAULTS, canL: 100, bed };
    expect(solve({ ...options, length: usableLength }).split).toBe(false);
    expect(solve({ ...options, length: usableLength + 1 }).split).toBe(true);
  }
});

test("the fourteen-can layout without outer joins prints on either orientation of a 150 by 300 bed", () => {
  const space = { w: 160, d: 520, h: 254, front: 0 };
  for (const bed of [[150, 300, 256], [300, 150, 256]] as Options["bed"][]) {
    // A single unjoined lane matches the audited fixture; the newer default
    // outer tongue adds 17 mm and genuinely cannot clear this bed's short axis.
    const layout = fitSpace(space, { ...DEFAULTS, bed, left: "none", right: "none" }, { cascade: false })[0]!;
    expect(layout.cans).toBe(14);
    expect(layout.derived.L).toBe(486);
    const required = K.lipInset + K.lipTabT / 2 + 0.5 + 7 * DEFAULTS.canD
      + 6 * 0.5 + 0.5 + DEFAULTS.wall + K.post;
    expect(layout.derived.L).toBe(Math.ceil(required));
    expect(layout.derived.L - 1).toBeLessThan(required);
    const parts = geo.arena(() => partList(buildAll(geo, layout.options, layout.derived), layout.options)
      .map((part) => ({ mesh: meshDataOf(part.name, part.mesh.getMesh()), qty: part.qty })));
    const keepOut: [number, number, number, number][] = [[0, 0, 18, 28]];
    const placed = pack(parts, bed, layout.options.bedMargin, undefined, keepOut);
    expect(placed.length).toBe(parts.reduce((sum, part) => sum + part.qty, 0));
    for (const part of placed) {
      expect(part.bbox[0]).toBeGreaterThanOrEqual(3 - 1e-5);
      expect(part.bbox[1]).toBeGreaterThanOrEqual(3 - 1e-5);
      expect(part.bbox[3]).toBeLessThanOrEqual(bed[0] - 3 + 1e-5);
      expect(part.bbox[4]).toBeLessThanOrEqual(bed[1] - 3 + 1e-5);
      expect(part.bbox[2]).toBeCloseTo(0, 6);
      expect(part.bbox[5]).toBeLessThanOrEqual(bed[2] - 3);
      expect(part.bbox[0] >= 21 - 1e-5 || part.bbox[1] >= 31 - 1e-5).toBe(true);
    }
  }
});
