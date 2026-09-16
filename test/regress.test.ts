import { test, expect } from "bun:test";
import Module from "manifold-3d";
import { Geo, DEFAULTS, solve, buildAll, filamentGrams } from "../src/geometry";
import ref from "../ref.json";

const wasm = await Module(); wasm.setup();
const g = new Geo(wasm);
const d = solve(DEFAULTS);

test("derived numbers match Python", () => {
  const s = ref.spec as any;
  for (const [k, v] of Object.entries({ n: d.n, n_bottom: d.nBottom, L: d.L, IW: d.IW, OW: d.OW, H: d.H, H_b: d.Hb, inset: d.inset, xd: d.xd, px: d.px, py: d.py, gang_pitch: d.gangPitch })) {
    expect(v, k).toBeCloseTo(s[k], 2);
  }
});

const parts = buildAll(g, DEFAULTS, d);
const parts3 = buildAll(g, { ...DEFAULTS, tiers: 3 }, d);
const lane = (set: typeof parts, role: string) => set.lanes.find((l) => l.role === role)!;
const map: Record<string, any> = {
  "lane-top-front": lane(parts, "top").front, "lane-top-rear": lane(parts, "top").rear,
  "lane-mid-front": lane(parts3, "mid").front, "lane-mid-rear": lane(parts3, "mid").rear,
  "lane-bottom-front": lane(parts, "bottom").front, "lane-bottom-rear": lane(parts, "bottom").rear,
  "cover-front": parts.cover[0], "cover-rear": parts.cover[1],
  "end-lip": parts.lip, "riser-08": parts.riser08, "riser-24": parts.riser24,
};
for (const [name, m] of Object.entries(map)) {
  test(`${name} matches Python volume and bounds`, () => {
    const r = (ref as any)[name];
    const bb = m.boundingBox();
    expect(m.volume() / r.vol).toBeCloseTo(1, 2);          // within 1 %
    for (let i = 0; i < 3; i++) { expect(bb.min[i]).toBeCloseTo(r.bbox[0][i], 0); expect(bb.max[i]).toBeCloseTo(r.bbox[1][i], 0); }
    expect(m.status()).toBe("NoError");
  });
}
test("filament estimate is sane", () => {
  const gr = filamentGrams(lane(parts, "top").front!) + filamentGrams(lane(parts, "top").rear!);
  console.log("upper lane est", gr.toFixed(0), "g");
  expect(gr).toBeGreaterThan(180); expect(gr).toBeLessThan(320);
});
