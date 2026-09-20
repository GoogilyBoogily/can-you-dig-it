// Every joint's two halves come from one spec here, so a tab cannot drift from its slot.
// Each pair is checked the same way: the male sits entirely inside the female (their
// intersection is the male), and the shell between them is exactly the clearance.
import { test, expect } from "bun:test";
import type { Manifold as M } from "manifold-3d";
import { K, DEFAULTS } from "../src/geometry";
import { clearanceOf, OVER, tabBox, tSlotJoint } from "../src/features/joints";
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
