import { test, expect } from "bun:test";
import { DEFAULTS, solve, check, buildAll, partList, rearTier, type Options } from "../src/geometry";
import { geo } from "./geo";

// Stackable top: a cascade's top tier gets the full end wall a mid tier has, the one that
// closes the chute of a tier above, so another tier can go on it later. A flat stack is
// stack-ready already: every tier is the same lane.
const endWalls = (o: Options) => geo.arena(() =>
  Object.fromEntries(partList(buildAll(geo, o, solve(o)), o)
    .filter((p) => p.name.endsWith("end-wall"))
    .map((p) => {
      const { min, max } = p.mesh.boundingBox();
      return [p.name, { qty: p.qty, volume: p.mesh.volume(), size: max.map((v, i) => v - min[i]) }];
    })));

test("off: the cascade's top tier ends in a loading lip, shorter than a mid tier's wall", () => {
  const walls = endWalls({ ...DEFAULTS, tiers: 3 });
  expect(walls["lane-top-end-wall"].volume).toBeLessThan(walls["lane-mid-end-wall"].volume);
});

test("on: the cascade's top end wall is a mid tier's", () => {
  const walls = endWalls({ ...DEFAULTS, tiers: 3, stackable: true });
  const top = walls["lane-top-end-wall"], mid = walls["lane-mid-end-wall"];
  expect(top.volume).toBeCloseTo(mid.volume, 3);
  top.size.forEach((v, i) => expect(v).toBeCloseTo(mid.size[i], 3));
});

test("flat: nothing changes, the stack is stack-ready already", () => {
  const flat = { ...DEFAULTS, cascade: false, tiers: 1 };
  expect(endWalls({ ...flat, stackable: true })).toEqual(endWalls(flat));
});

test("with load from the back, a cascade keeps its top end wall and check() says why", () => {
  const o = { ...DEFAULTS, tiers: 3, rearLoad: true, stackable: true };
  expect(rearTier(o)).toBe(-1);
  expect(endWalls(o)["lane-top-end-wall"].qty).toBe(2);
  expect(check(o, solve(o)).some((w) => w.includes("stackable top"))).toBe(true);
  expect(check(o, solve(o)).some((w) => w.includes("odd tier count"))).toBe(false);
});

test("a flat stack still opens its top tier from the back: nothing drops into it from above", () => {
  expect(rearTier({ ...DEFAULTS, cascade: false, tiers: 2, rearLoad: true, stackable: true })).toBe(1);
});
