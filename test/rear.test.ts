import { test, expect } from "bun:test";
import { DEFAULTS, solve, check, buildAll, partList, freeSet, rearTier, type Options } from "../src/geometry";
import { geo } from "./geo";

// Load from the back: the one tier cans slide into from the shelf's back prints without
// its end wall. A lone tier, or the top of a stack, when its high end faces the back.
const endWalls = (o: Options) => {
  const set = buildAll(geo, o, solve(o));
  const walls = partList(set, o).filter((p) => p.name.endsWith("end-wall")).map((p) => [p.name, p.qty]);
  freeSet(set);
  return walls;
};

test("off: every tier keeps its end wall", () => {
  expect(endWalls({ ...DEFAULTS, tiers: 3 })).toEqual([["lane-bottom-end-wall", 2], ["lane-mid-end-wall", 2], ["lane-top-end-wall", 2]]);
});

test("flat, one tier: the lane opens", () => {
  expect(endWalls({ ...DEFAULTS, cascade: false, tiers: 1, rearLoad: true })).toEqual([]);
});

test("flat, stacked: only the top tier opens, the two below keep theirs", () => {
  expect(endWalls({ ...DEFAULTS, cascade: false, tiers: 3, rearLoad: true })).toEqual([["lane-end-wall", 4]]);
});

test("cascade, 3 tiers: the top's high end faces the back and opens", () => {
  expect(endWalls({ ...DEFAULTS, tiers: 3, rearLoad: true })).toEqual([["lane-bottom-end-wall", 2], ["lane-mid-end-wall", 2]]);
});

test("cascade, 2 tiers: the top's back is its chute, nothing opens and check() says why", () => {
  const o = { ...DEFAULTS, rearLoad: true };
  expect(rearTier(o)).toBe(-1);
  expect(endWalls(o)).toEqual([["lane-bottom-end-wall", 2], ["lane-top-end-wall", 2]]);
  expect(check(o, solve(o)).some((w) => w.startsWith("Loading from the back"))).toBe(true);
  expect(check(DEFAULTS, solve(DEFAULTS)).some((w) => w.startsWith("Loading from the back"))).toBe(false);
});
