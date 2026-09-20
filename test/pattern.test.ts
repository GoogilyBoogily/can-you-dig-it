import { test, expect } from "bun:test";
import { K, DEFAULTS, PATTERNS, ROWS, solve, laneOf, buildWall, buildEndWall, buildCover, type Options } from "../src/geometry";
import { cellsOf } from "../src/features/lattice";

import { geo } from "./geo";

const shortLane: Options = { ...DEFAULTS, length: 240 }; // unsplit, fast

// The pattern picks the perforation and nothing else: every pattern cuts cells out of
// the walls, the end wall and the cover, and `solid` still blanks them all.
//
// The baseline has to be a wall with no cells, not a solid one. `solid: true` turns off
// the lattice AND the recess to the 3.5 mm web, and the recess alone is ~30 % of the
// wall: measured against solid, a wall and an end wall with zero cells came in at 0.702
// and 0.656, under the 0.85 bar this test used. Ten of these fifteen assertions passed
// whatever cellsOf returned. Blanking through Derived.hexR - no whole cell of radius
// 1000 fits - leaves the recess, the borders and the ligament exactly as they were, so
// the ratio below is the lattice and nothing else. The cover has no recess, so solid is
// the honest baseline there, and it has its own radius that d.hexR does not touch.
test.each([...PATTERNS])("%s cuts the walls, the end wall and the cover", (pattern) => {
  const o: Options = { ...shortLane, pattern };
  const d = solve(o);
  const blank = { ...d, hexR: 1000 };
  const solidO: Options = { ...o, solid: true };
  const top = laneOf(o, d, "top"), bottom = laneOf(o, d, "bottom");
  expect(buildWall(geo, o, d, top, 1).volume()).toBeLessThan(buildWall(geo, o, blank, top, 1).volume() * 0.85);
  expect(buildEndWall(geo, o, d, bottom).volume()).toBeLessThan(buildEndWall(geo, o, blank, bottom).volume() * 0.85);
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
  const notchH = K.deckLo + K.cl + o.fit;
  for (const tx of ln.tabs) {
    const probe = geo.box(K.earW + 2 * K.cl, o.wall, 4, tx, d.IW / 2 + o.wall / 2, notchH + 2);
    expect(geo.isect(wall, probe).volume()).toBeCloseTo(probe.volume(), 3);
  }
});

// Slats run the width of their field component, so they have to stop at the seam's border
// or the halves would butt on a slotted edge. Cells drop there as before.
test.each([...PATTERNS])("%s keeps the splice band of a long wall full thickness", (pattern) => {
  const o: Options = { ...DEFAULTS, pattern }; // 480 mm: split
  const d = solve(o);
  expect(d.split).toBe(true);
  const ln = laneOf(o, d, "top");
  const wall = buildWall(geo, o, d, ln, 1);
  const probe = geo.box(2 * K.border, o.wall, ln.H - 2 * K.border, 0, d.IW / 2 + o.wall / 2, ln.H / 2);
  expect(geo.isect(wall, probe).volume()).toBeCloseTo(probe.volume(), 3);
});

// Three whole rows of the pattern fill the wall panel, as the hexagons' do.
//
// This used to assert a*hexR + b*lig against the panel, which is autoR inverted against
// the same ROWS entry it was defined from: the value is panel - 1 by construction, for
// every pattern, and the window allowed 3 mm. It could not fail, and it never counted a
// row. A wrong ROWS entry - the regression the cover radius is documented as having had -
// went straight through. Count what actually lands instead. Cluster on the cell radius:
// kumiko's bar splits a cell into two polygons within one row.
test.each([...PATTERNS])("%s auto radius puts three rows in the panel", (pattern) => {
  const o: Options = { ...DEFAULTS, pattern, hexAuto: true };
  const d = solve(o);
  const lift = pattern === "hex" ? 0 : K.deckLo + K.cl + K.padRise - K.border;
  const panel = geo.rect(-100, -d.H / 2 + K.border + lift, 100, d.H / 2 - K.border);
  expect(d.hexR).toBeGreaterThanOrEqual(8);
  expect(d.hexR).toBeLessThanOrEqual(16);

  const field = cellsOf(geo, pattern, d.hexR, d.lig, panel, []);
  expect(field, `${pattern} cut no cells at all`).not.toBeNull();
  const centres = field!.decompose().map((cell) => { const b = cell.bounds(); return (b.min[1] + b.max[1]) / 2; }).sort((x, y) => x - y);
  const rows = centres.filter((y, i) => i === 0 || y - centres[i - 1]! > d.hexR);
  expect(rows.length, `${pattern} rows`).toBe(3);
});
