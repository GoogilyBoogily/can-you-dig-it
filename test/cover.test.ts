import { test, expect } from "bun:test";
import { DEFAULTS, PATTERNS, solve, buildCover, laneXe, type Options } from "../src/geometry";

import { geo } from "./geo";

/** Cover material a can meets when dropped straight down at the lane's loading end. */
function coverHitByDroppedCan(options: Options): number {
  const derived = solve(options);
  const [cover] = buildCover(geo, options, derived);
  const canCentreX = laneXe(options, derived) - (options.canD + 8) / 2; // centred in the window
  const can = geo.cyl(options.canD / 2, options.canL, 0, 0, -options.canL / 2)
    .rotate([90, 0, 0]).translate([canCentreX, 0, 0]); // axis along Y, spanning the cover plate
  return geo.isect(cover, can).volume();
}

const shortLane = { ...DEFAULTS, length: 240, cover: true }; // one cover piece

// The cascade top tier loads through the cover, so the cover has to leave the loading zone
// open. The 20 mm loading lip alone never worked - the gap under a full cover is canD - 18.
test("a can drops through the cover at the loading end of a cascade", () => {
  expect(coverHitByDroppedCan({ ...shortLane, cascade: true })).toBe(0);
  expect(coverHitByDroppedCan({ ...shortLane, cascade: true, design: "minimal" })).toBe(0);
  for (const pattern of PATTERNS) expect(coverHitByDroppedCan({ ...shortLane, cascade: true, pattern })).toBe(0);
});

// A flat top tier loads from the front over its lip; a window there would drop cans onto
// the queue, so the flat cover stays whole.
test("a flat cover has no window", () => {
  expect(coverHitByDroppedCan({ ...shortLane, cascade: false })).toBeGreaterThan(0);
});
