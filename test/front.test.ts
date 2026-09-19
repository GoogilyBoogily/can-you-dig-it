// A can leaves over the 20 mm lip, and at the crest its top is crest + canD. The tier
// used to be sized from the high end alone, so a short or level lane held cans that
// could not get out: 18 mm short at 0°, 2.4 mm short on a 300 mm lane at 3°.
import { test, expect } from "bun:test";
import { K, DEFAULTS, solve } from "../src/geometry";

test("the front can clears the ceiling as it crosses the lip", () => {
  for (const cascade of [false, true]) for (const slope of [0, 1.5, 3, 5]) for (const length of [200, 300, 480]) {
    const o = { ...DEFAULTS, cascade, slope, length };
    const d = solve(o);
    const crest = K.deckLo + K.lipInset * d.tan + K.lipH;
    const ceiling = cascade ? d.Hb : d.H;
    expect(ceiling - crest - o.canD).toBeGreaterThanOrEqual(o.lipGap);
  }
});

test("the lip gap is the user's: more of it is a taller tier where it binds", () => {
  const level = { ...DEFAULTS, cascade: false, slope: 0 };
  expect(solve({ ...level, lipGap: 15 }).H - solve({ ...level, lipGap: 5 }).H).toBe(10);
});

test("the default lane already cleared it, so its tier does not grow", () => {
  const d = solve(DEFAULTS);
  expect(d.H).toBe(94);
  expect(d.Hb).toBe(98);
});
