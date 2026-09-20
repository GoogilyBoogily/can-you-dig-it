// Every joint's two halves come from one spec here, so a tab cannot drift from its slot.
// Each pair is checked the same way: the male sits entirely inside the female (their
// intersection is the male), and the shell between them is exactly the clearance.
import { test, expect } from "bun:test";
import type { Manifold as M } from "manifold-3d";
import { K, DEFAULTS, solve, gangInner } from "../src/geometry";
import { clearanceOf, OVER, tabBox, tSlotJoint, gangJoint, tProfile } from "../src/features/joints";
import { geo } from "./geo";

test("clearance is K.cl plus fit, and the overshoot is 1 mm", () => {
  expect(clearanceOf(DEFAULTS)).toBe(K.cl);
  expect(clearanceOf({ ...DEFAULTS, fit: 0.3 })).toBeCloseTo(K.cl + 0.3, 9);
  expect(OVER).toBe(1);
});

test("a tab box is tabW by tabT, flush with the wall's inner face", () => {
  const wall = DEFAULTS.wall;
  const box = tabBox(geo, 5, wall, 0).boundingBox();
  expect(box.max[0] - box.min[0]).toBeCloseTo(K.tabW, 6);
  expect(box.min[1]).toBeCloseTo(-wall / 2, 6); // inner face of a wall centred on y = 0
  expect(box.max[1]).toBeCloseTo(-wall / 2 + K.tabT, 6);
  expect(box.min[2]).toBeCloseTo(0, 6);
  expect(box.max[2]).toBeCloseTo(5, 6);
});

/** The male sits entirely inside the female: their intersection is the male. */
const fits = (j: { male: M; female: M }) =>
  expect(geo.isect(j.male, j.female).volume()).toBeCloseTo(j.male.volume(), 3);

test("the splice T: tongue inside socket, socket wider by the clearance", () => {
  for (const clearance of [K.cl, K.cl + 0.3]) {
    const j = tSlotJoint(geo, { neck: K.spliceBase, head: K.spliceTip, clearance, zb: 0, H: 100 });
    fits(j);
    const s = j.female.boundingBox(), t = j.male.boundingBox();
    expect(s.max[1] - t.max[1]).toBeCloseTo(clearance, 6);
    expect(t.min[0]).toBeCloseTo(-K.spliceDepth, 6);
    expect(s.min[0]).toBeCloseTo(-K.spliceDepth - clearance, 6);
  }
});

test("the gang T: tongue inside socket at every clearance", () => {
  for (const clearance of [K.cl, K.cl + 0.3]) {
    const j = gangJoint(geo, { run: 10, clearance, through: 20 });
    // The run is fused into its own deck - it never crosses into a mating part, so it has
    // no female counterpart (test/gang.test.ts's "clears its socket" check is what proves
    // the run never collides with the neighbour's deck). Only the head is the true
    // tab/socket pair, so that is what has to sit inside the grown female.
    const head = geo.prismZ(tProfile(geo, K.earW, K.gangHead).rotate(-90), K.deckLo);
    fits({ male: head, female: j.female });
    head.delete();
    expect(j.male.boundingBox().min[1]).toBeCloseTo(-10, 6); // the run reaches back to the ear root
    expect(j.male.boundingBox().max[1]).toBeCloseTo(K.spliceDepth, 6); // the T's head, +Y
    expect(j.female.boundingBox().max[2]).toBeCloseTo(21, 6);
  }
});

// The tongue is placed at gangInner in its own lane and the socket at -IW/2 in the
// neighbour's; they meet only because gangPitch = OW + gangGap. Nothing in geometry.ts
// asserts that, so this does.
test("the gang anchors agree across the pitch", () => {
  const d = solve(DEFAULTS);
  expect(gangInner(DEFAULTS, d) - d.gangPitch).toBeCloseTo(-d.IW / 2, 9);
});
