import { test, expect } from "bun:test";
import { DEFAULTS, solve, filamentGrams } from "../src/geometry";
import { refSpec } from "../ref";
import { snapshotParts } from "./geo";
import ref from "../ref.json";

const derived = solve(DEFAULTS);

// ref.json is generated from this codebase by `bun run ref`, so a part that has not
// changed reproduces its snapshot exactly. What is left for these tolerances to absorb
// is float noise across manifold-3d builds, nothing more - any edit you make on purpose
// moves a dimension far further than this. Widening them to make a red suite go green
// would leave a test that verifies nothing; regenerate the snapshot instead, and read
// the diff.
const VOLUME_TOLERANCE = 1e-4; // 0.01 %
const BOUND_TOLERANCE = 0.01;  // mm

test("derived dimensions match the snapshot", async () => {
  const { manifold, ...expected } = ref.spec;
  // the kernel the numbers came from: a bump without `bun run ref` leaves the label lying
  const installed = (await Bun.file(new URL("../node_modules/manifold-3d/package.json", import.meta.url)).json()).version;
  expect(manifold).toBe(installed);
  for (const [key, value] of Object.entries(refSpec(derived)))
    expect(Math.abs(value - (expected as Record<string, number>)[key]), key).toBeLessThanOrEqual(BOUND_TOLERANCE);
});

const parts = snapshotParts();

// A part added to refParts() before `bun run ref` used to die on `expected.vol` of
// undefined; a part removed left its key in ref.json for good. Same set, both ways.
test("ref.json holds exactly the parts refParts() builds", () => {
  expect(Object.keys(ref).filter((key) => key !== "spec").sort()).toEqual(Object.keys(parts).sort());
});

for (const [name, mesh] of Object.entries(parts)) {
  test(`${name} matches the snapshot volume and bounds`, () => {
    const expected = (ref as any)[name];
    const box = mesh.boundingBox();
    expect(Math.abs(mesh.volume() / expected.vol - 1), `${name} volume`).toBeLessThanOrEqual(VOLUME_TOLERANCE);
    for (let i = 0; i < 3; i++) {
      expect(Math.abs(box.min[i] - expected.min[i]), `${name} min[${i}]`).toBeLessThanOrEqual(BOUND_TOLERANCE);
      expect(Math.abs(box.max[i] - expected.max[i]), `${name} max[${i}]`).toBeLessThanOrEqual(BOUND_TOLERANCE);
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
