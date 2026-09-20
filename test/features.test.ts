// Every joint's two halves come from one spec here, so a tab cannot drift from its slot.
// Each pair is checked the same way: the male sits entirely inside the female (their
// intersection is the male), and the shell between them is exactly the clearance.
import { test, expect } from "bun:test";
import type { Manifold as M } from "manifold-3d";
import { K, DEFAULTS, solve, gangInner } from "../src/geometry";
import { clearanceOf, OVER, tabBox, tSlotJoint, gangJoint, tProfile, lipTab, lipPocket, crossLap, pinJoint, earJoint } from "../src/features/joints";
import { stand, lipPose, platePose, lay } from "../src/features/pose";
import { recessDepth } from "../src/features/pocket";
import { geo, overhangArea } from "./geo";

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

test("the corner cross-lap: post inside slot, slot open at the wall top", () => {
  for (const clearance of [K.cl, K.cl + 0.3]) {
    const j = crossLap(geo, { wall: 6, lapZ: 20, H: 80, clearance });
    fits(j);
    expect(j.male.boundingBox().min[2]).toBeCloseTo(20, 6);
    expect(j.male.boundingBox().max[2]).toBeCloseTo(80, 6);
    expect(j.female.boundingBox().max[2]).toBeCloseTo(81, 6);
    expect(j.female.boundingBox().max[0] - j.male.boundingBox().max[0]).toBeCloseTo(clearance, 6);
  }
});

test("the pin: inside the notch above and the cover hole at every clearance", () => {
  for (const clearance of [K.cl, K.cl + 0.3]) {
    const j = pinJoint(geo, { wall: 6, clearance });
    expect(geo.isect(j.pin, j.notch).volume()).toBeCloseTo(j.pin.volume(), 3);
    expect(geo.isect(j.pin, j.hole).volume()).toBeCloseTo(j.pin.volume(), 3);
    expect(j.pin.boundingBox().max[2]).toBeCloseTo(K.pinH, 6);
    // containment alone passes on an oversized female: the shell is the clearance on
    // both in-plane axes, and on the notch's x (its y runs through the wall)
    expect(grownBy(j.pin, j.hole)).toEqual([clearance, clearance]);
    expect(grownBy(j.pin, j.notch)[0]).toBeCloseTo(clearance, 6);
  }
});

/** How far `outer` reaches past `inner` on +x and +y: the clearance a side, if the
 *  female is the male grown by exactly that. */
function grownBy(inner: M, outer: M): [number, number] {
  const a = inner.boundingBox(), b = outer.boundingBox();
  return [round6(b.max[0] - a.max[0]), round6(b.max[1] - a.max[1])];
}
const round6 = (v: number) => Math.round(v * 1e6) / 1e6;

test("the lip tab, stood up, sits inside its pocket", () => {
  for (const clearance of [K.cl, K.cl + 0.3]) {
    const tab = stand(lipTab(geo, 4.4), lipPose(-K.lipInset + K.lipTabT / 2, 0)); // pose puts the pocket's near edge at x = 0 here
    const pocket = lipPocket(geo, clearance, 40, 10).translate([K.lipTabT / 2, 0, 0]);
    expect(geo.isect(tab, pocket).volume()).toBeCloseTo(tab.volume(), 3);
    expect(pocket.boundingBox().max[1] - tab.boundingBox().max[1]).toBeCloseTo(clearance, 6);
  }
});

test("the ear joint: the wall's tab fills the ear's slot, the ear fills the notch", () => {
  for (const clearance of [K.cl, K.cl + 0.3]) {
    const wall = 6, deckLo = K.deckLo;
    const j = earJoint(geo, { wall, through: 30, clearance });
    // what the notch leaves standing in a wall slab is the tab, and it sits in the slot
    const slab = geo.box(60, wall, 40, 0, 0, 20);
    const notched = geo.diff(slab, [j.notch]);
    // bounded to the notch's own footprint (not the whole 60 mm slab): outside it, the
    // slab's untouched sides would count as "standing" too and can't fit in the slot
    const tab = geo.isect(notched, geo.box(K.earW, wall + 1, deckLo + clearance, 0, 0, (deckLo + clearance) / 2));
    expect(geo.isect(tab, j.slot).volume()).toBeCloseTo(tab.volume(), 3);
    expect(tab.boundingBox().max[0] - tab.boundingBox().min[0]).toBeCloseTo(K.tabW, 6);
    expect(grownBy(tab, j.slot)).toEqual([clearance, clearance]);
    // the ear sits in the notch: the deck adds the ear and cuts the slot at the same
    // spot, so what actually reaches the deck is ear-minus-its-own-slot; checked against
    // the notch itself, not a slab, since the ear roots past the wall's own inner face
    // into the deck, past where a finite slab of the wall alone would clip it away
    const earFinal = geo.diff(j.ear, [j.slot]);
    expect(geo.isect(earFinal, j.notch).volume()).toBeCloseTo(earFinal.volume(), 3);
    expect(j.ear.boundingBox().min[1]).toBeCloseTo(-wall / 2 - K.earRoot, 6); // rooted into the deck
    expect(grownBy(j.ear, j.notch)[0]).toBeCloseTo(clearance, 6); // the notch is the ear plus the clearance in x
    // laid flat outer face up, a notched wall has nothing hanging
    expect(overhangArea(lay(notched, platePose("wall-left", 0, 0)))).toBe(0);
  }
});

test("the recess goes down to the web, and not at all on a wall no thicker than it", () => {
  expect(recessDepth(DEFAULTS)).toBeCloseTo(DEFAULTS.wall - K.web, 9);
  expect(recessDepth({ ...DEFAULTS, design: "minimal" })).toBeCloseTo(DEFAULTS.wall - K.ligMin, 9);
  expect(recessDepth({ ...DEFAULTS, wall: K.web + 0.1 })).toBe(0);
});
