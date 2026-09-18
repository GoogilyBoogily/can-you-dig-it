import { test, expect } from "bun:test";
import Module from "manifold-3d";
import { Geo, DEFAULTS, solve, filamentGrams } from "../src/geometry";
import { refParts, refSpec } from "../ref";
import ref from "../ref.json";

const wasm = await Module(); wasm.setup();
const geo = new Geo(wasm);
const derived = solve(DEFAULTS);

// ref.json is generated from this codebase by `bun run ref`, so a part that has not
// changed reproduces its snapshot exactly. What is left for these tolerances to absorb
// is float noise across manifold-3d builds, nothing more - any edit you make on purpose
// moves a dimension far further than this. Widening them to make a red suite go green
// would leave a test that verifies nothing; regenerate the snapshot instead, and read
// the diff.
const VOLUME_TOLERANCE = 1e-4; // 0.01 %
const BOUND_TOLERANCE = 0.01;  // mm

test("derived dimensions match the snapshot", () => {
  const expected = ref.spec as Record<string, number>;
  for (const [key, value] of Object.entries(refSpec(derived)))
    expect(Math.abs(value - expected[key]), key).toBeLessThanOrEqual(BOUND_TOLERANCE);
});

const parts = refParts(geo);
for (const [name, mesh] of Object.entries(parts)) {
  test(`${name} matches the snapshot volume and bounds`, () => {
    const expected = (ref as any)[name];
    const box = mesh.boundingBox();
    expect(Math.abs(mesh.volume() / expected.vol - 1), `${name} volume`).toBeLessThanOrEqual(VOLUME_TOLERANCE);
    for (let i = 0; i < 3; i++) {
      expect(Math.abs(box.min[i] - expected.bbox[0][i]), `${name} min[${i}]`).toBeLessThanOrEqual(BOUND_TOLERANCE);
      expect(Math.abs(box.max[i] - expected.bbox[1][i]), `${name} max[${i}]`).toBeLessThanOrEqual(BOUND_TOLERANCE);
    }
    expect(mesh.status()).toBe("NoError");
  });
}

/** Every snapshot part of one lane role or cover, both halves of every plate. */
const laneVolume = (prefix: string) => Object.entries(parts).filter(([name]) => name.startsWith(prefix + "-")).reduce((sum, [, m]) => sum + m.volume(), 0);
const laneGrams = (prefix: string) => Object.entries(parts).filter(([name]) => name.startsWith(prefix + "-")).reduce((sum, [, m]) => sum + filamentGrams(m), 0);

// 331 g for the four plates of a top lane (305 g as one print, before the flat-pack: the
// wall keeps a solid band along the deck now); the window is a sanity check, not a pin
test("filament estimate is sane", () => {
  const grams = laneGrams("lane-top");
  expect(grams).toBeGreaterThan(250);
  expect(grams).toBeLessThan(400);
});

// The minimal design keeps every joint and takes out the material that carried nothing.
// Solid volume, not the filament model, so the check does not move with print settings.
// Measured when it landed: top 0.51, bottom 0.46, cover 0.69; flat-pack 0.50, 0.47, 0.70 -
// fails when something creeps back.
test("the minimal design is about half the material", () => {
  expect(laneVolume("minimal-lane-top") / laneVolume("lane-top")).toBeLessThan(0.6);
  expect(laneVolume("minimal-lane-bottom") / laneVolume("lane-bottom")).toBeLessThan(0.55);
  expect(laneVolume("minimal-cover") / laneVolume("cover")).toBeLessThan(0.75);
});
