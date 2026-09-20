// A can leaves over the 20 mm lip, and at the crest its top is crest + canD. The tier
// used to be sized from the high end alone, so a short or level lane held cans that
// could not get out: 18 mm short at 0°, 2.4 mm short on a 300 mm lane at 3°.
import { test, expect } from "bun:test";
import { K, DEFAULTS, solve, buildLip } from "../src/geometry";
import { geo } from "./geo";

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

// The lip's tab drops through the deck. Its length was a fixed 6 mm while the deck at
// lipx is K.deckLo + K.lipInset*tan thick, so the tab stood 2 - 8*tan proud of the
// underside: a 2 mm stud at slope 0, 1.58 mm at the default 3. On a flat base the lane
// rested on two of them instead of on its deck; on a Gridfinity base it fouled the floor,
// whose pocket was cut 1 mm for a protrusion the comment put at 0.58. No single-part
// snapshot can see it - it only shows up against the deck the tab goes into.
test("the lip tab ends flush with the deck underside at every slope", () => {
  for (const slope of [0, 3, 7, 10]) {
    const o = { ...DEFAULTS, slope };
    const d = solve(o);
    // Stand the lip up the way the viewer does: ry = +90 maps (x, y, z) to (z, y, -x).
    const stood = buildLip(geo, o, d).rotate([0, 90, 0]).translate([0, 0, K.deckLo + K.lipInset * d.tan]);
    expect(stood.boundingBox().min[2]).toBeCloseTo(0, 6);
  }
});
