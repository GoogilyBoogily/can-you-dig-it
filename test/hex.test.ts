import { test, expect } from "bun:test";
import { DEFAULTS, solve, type Options } from "../src/geometry";

// Two full stretched rows of cells span sqrt(3) * (2R + 1.5P) with P = R + lig / sqrt(3).
const twoRows = (R: number, lig: number) => Math.sqrt(3) * 3.5 * R + 1.5 * lig;

test("auto hex fills the wall panel with two whole rows", () => {
  const derived = solve({ ...DEFAULTS, hexAuto: true });
  const panel = derived.H - 10; // K.border each side
  expect(derived.hexR).toBeGreaterThanOrEqual(8);
  expect(derived.hexR).toBeLessThanOrEqual(16);
  expect(twoRows(derived.hexR, derived.lig)).toBeLessThanOrEqual(panel);
  expect(twoRows(derived.hexR, derived.lig)).toBeGreaterThan(panel - 3);
});

test("auto hex clamps at the small end and the ligament never goes under 1.7 mm", () => {
  const small: Options = { ...DEFAULTS, hexAuto: true, canD: 30 };
  const derived = solve(small);
  expect(derived.hexR).toBe(8);
  expect(derived.lig).toBe(1.7);
});

test("manual hex uses the typed radius", () => {
  const derived = solve({ ...DEFAULTS, hexAuto: false, hexR: 10 });
  expect(derived.hexR).toBe(10);
});
