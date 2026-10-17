import { expect, test } from "bun:test";
import { DEFAULTS, check, minimumLaneLength, solve, type Options } from "../src/geometry";

test("the one-can minimum reserves joint space throughout the allowed fit range", () => {
  const options = { ...DEFAULTS, cascade: false };
  expect(minimumLaneLength(options)).toBeCloseTo(112.6, 8);
  // The 1.6 mm pin thickness sets the floor even at the widest allowed clearance.
  expect(minimumLaneLength({ ...options, fit: -0.2 })).toBeCloseTo(112.6, 8);
  expect(minimumLaneLength({ ...options, fit: 0.3 })).toBeCloseTo(112.6, 8);
  expect(minimumLaneLength({ ...options, cascade: true })).toBe(154);
  expect(minimumLaneLength({ ...options, canD: 200 })).toBe(220.5);
});

test("shortening the minimum loses a can or the ligament between opposing pins", () => {
  for (const canDiameter of [53, 66, 200]) {
    for (const cascade of [false, true]) {
      for (const fit of [-0.2, 0, 0.3]) {
        const options: Options = { ...DEFAULTS, canD: canDiameter, cascade, fit,
          base: "flat", left: "none", right: "none", lanesWide: 1, tiers: cascade ? 2 : 1, bed: [1000, 1000, 1000] };
        const length = minimumLaneLength(options);
        const atMinimum = { ...options, length };
        const derived = solve(atMinimum);
        expect(derived.n).toBeGreaterThanOrEqual(1);
        expect(derived.nBottom).toBeGreaterThanOrEqual(1);
        expect(check(atMinimum, derived).filter(message => message.startsWith("FAIL"))).toEqual([]);
        const shorter = { ...options, length: length - 0.001 };
        const shorterDerived = solve(shorter);
        expect(shorterDerived.n < 1 || check(shorter, shorterDerived).some(message => message.includes("opposing tier pins"))).toBe(true);
      }
    }
  }
});
