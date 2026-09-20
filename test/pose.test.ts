// One pose per plate: geometry lays a plate flat with its inverse, the viewer stands it
// up with it, and this is the round trip that keeps those two the same function.
import { test, expect } from "bun:test";
import { DEFAULTS, solve, laneOf, buildDeck, buildWall, buildEndWall, buildLip, laneXe, K, type PlateName } from "../src/geometry";
import { platePose, lipPose, lay, stand } from "../src/features/pose";
import { geo } from "./geo";

const o = DEFAULTS, d = solve(o), ln = laneOf(o, d, "top");

const bounds = (m: ReturnType<typeof buildDeck>) => {
  const b = m.boundingBox();
  return [...b.min, ...b.max];
};

test("lay then stand returns every plate to where it was built", () => {
  const built: [PlateName, ReturnType<typeof buildDeck>][] = [
    ["deck", buildDeck(geo, o, d, ln)],
    ["wall-left", buildWall(geo, o, d, ln, 1)],
    ["wall-right", buildWall(geo, o, d, ln, -1)],
    ["end-wall", buildEndWall(geo, o, d, ln)],
  ];
  for (const [plate, m] of built) {
    const pose = platePose(plate, d.IW, laneXe(o, d));
    const back = stand(lay(m, pose), pose);
    const a = bounds(m), b = bounds(back);
    for (let i = 0; i < 6; i++) expect(b[i]).toBeCloseTo(a[i], 6);
  }
});

// laid flat the pins lie in-plane, so a wall's Z extent is its thickness alone
test("a laid wall lies outer face up on the bed", () => {
  const pose = platePose("wall-left", d.IW, laneXe(o, d));
  const flat = lay(buildWall(geo, o, d, ln, 1), pose).boundingBox();
  expect(flat.min[2]).toBeCloseTo(0, 6);
  expect(flat.max[2]).toBeCloseTo(o.wall, 6);
});

test("the lip stood up has its tab ending flush with the deck underside", () => {
  for (const slope of [0, 3, 10]) {
    const oo = { ...DEFAULTS, slope }, dd = solve(oo);
    const stood = stand(buildLip(geo, oo, dd), lipPose(-dd.L / 2, dd.tan));
    expect(stood.boundingBox().min[2]).toBeCloseTo(0, 6);
    expect(stood.boundingBox().min[0]).toBeCloseTo(-dd.L / 2 + 5.5, 6); // the pocket's near edge: lipx - lipTabT / 2
  }
});
