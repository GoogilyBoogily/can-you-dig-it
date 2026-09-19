import { test, expect } from "bun:test";
import { DEFAULTS, PATTERNS, ROWS, solve, laneOf, buildWall, buildEndWall, buildCover, type Options } from "../src/geometry";

import { geo } from "./geo";

const BORDER = 5, EAR_W = 12, DECK_LO = 4, DT_CL = 0.25;
const shortLane: Options = { ...DEFAULTS, length: 240 }; // unsplit, fast

// The pattern picks the perforation and nothing else: every pattern cuts cells out of
// the walls, the end wall and the cover, and `solid` still blanks them all.
test.each([...PATTERNS])("%s cuts the walls, the end wall and the cover", (pattern) => {
  const o: Options = { ...shortLane, pattern };
  const d = solve(o);
  const solidO: Options = { ...o, solid: true };
  const top = laneOf(o, d, "top"), bottom = laneOf(o, d, "bottom");
  expect(buildWall(geo, o, d, top, 1).volume()).toBeLessThan(buildWall(geo, solidO, d, top, 1).volume() * 0.85);
  expect(buildEndWall(geo, o, d, bottom).volume()).toBeLessThan(buildEndWall(geo, solidO, d, bottom).volume() * 0.85);
  expect(buildCover(geo, o, d)[0].volume()).toBeLessThan(buildCover(geo, solidO, d)[0].volume() * 0.85);
});

// A square's or a slat's bottom edge over an ear notch would be a 1.25 mm bridge across
// 12.5 mm. Every pattern but hex starts its field at the top of the recess pads, so the
// wall is full thickness from the notch top through the pad.
test.each(PATTERNS.filter((p) => p !== "hex"))("%s leaves the wall solid over every ear notch", (pattern) => {
  const o: Options = { ...shortLane, pattern };
  const d = solve(o);
  const ln = laneOf(o, d, "top");
  const wall = buildWall(geo, o, d, ln, 1);
  const notchH = DECK_LO + DT_CL + o.fit;
  for (const tx of ln.tabs) {
    const probe = geo.box(EAR_W + 2 * DT_CL, o.wall, 4, tx, d.IW / 2 + o.wall / 2, notchH + 2);
    expect(geo.isect(wall, probe).volume()).toBeCloseTo(probe.volume(), 3);
  }
});

// Slats run the width of their field component, so they have to stop at the splice band
// or the wall tongue would have a slot through its root. Cells drop there as before.
test.each([...PATTERNS])("%s keeps the splice band of a long wall full thickness", (pattern) => {
  const o: Options = { ...DEFAULTS, pattern }; // 480 mm: split
  const d = solve(o);
  expect(d.split).toBe(true);
  const ln = laneOf(o, d, "top");
  const wall = buildWall(geo, o, d, ln, 1);
  const probe = geo.box(13, o.wall, ln.H - 2 * BORDER, -4, d.IW / 2 + o.wall / 2, ln.H / 2);
  expect(geo.isect(wall, probe).volume()).toBeCloseTo(probe.volume(), 3);
});

// Three whole rows of the pattern fill the wall panel, as the hexagons' do.
test.each([...PATTERNS])("%s auto radius puts three rows in the panel", (pattern) => {
  const d = solve({ ...DEFAULTS, pattern, hexAuto: true });
  const [a, b] = ROWS[pattern];
  const lift = pattern === "hex" ? 0 : DECK_LO + DT_CL + 4 - BORDER;
  const panel = d.H - 2 * BORDER - lift;
  expect(d.hexR).toBeGreaterThanOrEqual(8);
  expect(d.hexR).toBeLessThanOrEqual(16);
  expect(a * d.hexR + b * d.lig).toBeLessThanOrEqual(panel);
  expect(a * d.hexR + b * d.lig).toBeGreaterThan(panel - 3);
});
