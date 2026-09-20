// partList() is the one place a part gets its print name and its count. The worker packs
// it, ref.ts pins it and the viewer stands it up by name, so the scheme is pinned here
// without a geometry build: the manifolds are stand-ins, only names and counts matter.
import { test, expect } from "bun:test";
import type { Manifold } from "manifold-3d";
import { DEFAULTS, PATTERNS, partList, solve, type Options, type PartSet, type Plate, type PlateName } from "../src/geometry";

const m = {} as Manifold;
const PLATES: PlateName[] = ["deck", "wall-tongue", "wall-socket", "end-wall"];
const plates = (split: boolean): Plate[] => PLATES.map((name) => (split && name !== "end-wall" ? { name, front: m, rear: m } : { name, whole: m }));

/** A PartSet shaped like buildAll's for `o`, every mesh the same stand-in. */
function setFor(o: Options, split = false): PartSet {
  const roles = o.cascade ? (o.tiers >= 3 ? ["bottom", "mid", "top"] as const : ["bottom", "top"] as const) : ["top"] as const;
  return {
    lanes: roles.map((role) => ({ role, plates: plates(split) })),
    lip: m, riser: m,
    cover: o.cover ? (split ? [m, m] : [m]) : [],
    gridDeck: o.base === "gridfinity" ? (split ? { name: "deck", front: m, rear: m } : { name: "deck", whole: m }) : undefined,
  };
}

const names = (o: Options, split = false) => partList(setFor(o, split), o).map((p) => [p.name, p.qty, p.role]);

test("a two-tier cascade gang: every plate of both lanes, one lip, covers", () => {
  expect(names(DEFAULTS)).toEqual([
    ["lane-bottom-deck", 2, "lane"], ["lane-bottom-wall-tongue", 2, "lane"], ["lane-bottom-wall-socket", 2, "lane"], ["lane-bottom-end-wall", 2, "lane"],
    ["lane-top-deck", 2, "lane"], ["lane-top-wall-tongue", 2, "lane"], ["lane-top-wall-socket", 2, "lane"], ["lane-top-end-wall", 2, "lane"],
    ["end-lip", 2, "lip"],
    ["cover", 2, "cover"],
  ]);
});

test("a third tier adds one mid lane per lane across; a fourth adds another", () => {
  expect(names({ ...DEFAULTS, tiers: 3 }).filter(([n]) => String(n).startsWith("lane-mid"))).toEqual([
    ["lane-mid-deck", 2, "lane"], ["lane-mid-wall-tongue", 2, "lane"], ["lane-mid-wall-socket", 2, "lane"], ["lane-mid-end-wall", 2, "lane"],
  ]);
  expect(names({ ...DEFAULTS, tiers: 4 }).find(([n]) => n === "lane-mid-deck")).toEqual(["lane-mid-deck", 4, "lane"]);
});

test("a flat stack prints one lane per tier under one name, and a lip for each", () => {
  expect(names({ ...DEFAULTS, cascade: false, tiers: 3, lanesWide: 1 })).toEqual([
    ["lane-deck", 3, "lane"], ["lane-wall-tongue", 3, "lane"], ["lane-wall-socket", 3, "lane"], ["lane-end-wall", 3, "lane"],
    ["end-lip", 3, "lip"],
    ["cover", 1, "cover"],
  ]);
});

test("a long lane's plates and cover come as -front and -rear halves; the end wall stays whole", () => {
  expect(names({ ...DEFAULTS, lanesWide: 1, tiers: 2 }, true)).toEqual([
    ["lane-bottom-deck-front", 1, "lane"], ["lane-bottom-deck-rear", 1, "lane"],
    ["lane-bottom-wall-tongue-front", 1, "lane"], ["lane-bottom-wall-tongue-rear", 1, "lane"],
    ["lane-bottom-wall-socket-front", 1, "lane"], ["lane-bottom-wall-socket-rear", 1, "lane"],
    ["lane-bottom-end-wall", 1, "lane"],
    ["lane-top-deck-front", 1, "lane"], ["lane-top-deck-rear", 1, "lane"],
    ["lane-top-wall-tongue-front", 1, "lane"], ["lane-top-wall-tongue-rear", 1, "lane"],
    ["lane-top-wall-socket-front", 1, "lane"], ["lane-top-wall-socket-rear", 1, "lane"],
    ["lane-top-end-wall", 1, "lane"],
    ["end-lip", 1, "lip"],
    ["cover-front", 1, "cover"], ["cover-rear", 1, "cover"],
  ]);
});

test("on Gridfinity the shelf lane's deck is the grid deck, and the plain one is not printed", () => {
  const cascade = names({ ...DEFAULTS, base: "gridfinity" });
  expect(cascade.find(([n]) => n === "lane-bottom-deck")).toBeUndefined();
  expect(cascade).toContainEqual(["grid-deck", 2, "lane"]);
  expect(cascade).toContainEqual(["lane-top-deck", 2, "lane"]);
  const flat = names({ ...DEFAULTS, base: "gridfinity", cascade: false, tiers: 2 });
  expect(flat).toContainEqual(["lane-deck", 2, "lane"]); // the tier above still needs its deck
  expect(flat).toContainEqual(["grid-deck", 2, "lane"]);
});

test("feet add four risers per lane across; no other base prints them; no cover when off", () => {
  expect(names({ ...DEFAULTS, base: "feet" })).toContainEqual(["riser-24", 8, "riser"]);
  expect(names(DEFAULTS).some(([, , role]) => role === "riser")).toBe(false);
  expect(names({ ...DEFAULTS, cover: false }).some(([, , role]) => role === "cover")).toBe(false);
});

// CLAUDE.md states both of these as load-bearing and nothing checked either.
//
// "Minimal keeps every joint and solve() - same gangPitch, same layouts, gangs with
// standard lanes - and changes only the !o.solid block." If solve() ever diverged, a
// minimal lane would not gang with a standard one and the solver would rank two designs
// differently for the same shelf.
test("the minimal design changes nothing solve() derives", () => {
  expect(solve({ ...DEFAULTS, design: "minimal" })).toEqual(solve(DEFAULTS));
});

// "o.pattern picks the cell shape and nothing else." The one thing it is allowed to move
// is the auto radius, and the ligament that follows it.
test("a pattern changes the cell radius and nothing else solve() derives", () => {
  const { hexR: _r, lig: _l, ...base } = solve(DEFAULTS);
  for (const pattern of PATTERNS) {
    const { hexR, lig, ...rest } = solve({ ...DEFAULTS, pattern });
    expect(rest, pattern).toEqual(base);
    expect(hexR, `${pattern} radius`).toBeGreaterThan(0);
    expect(lig, `${pattern} ligament`).toBeGreaterThan(0);
  }
});
