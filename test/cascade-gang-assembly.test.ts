import { test, expect } from "bun:test";
import type { Manifold } from "manifold-3d";
import { DEFAULTS, SIDES, solve, laneOf, buildDeck, splitDeck, buildAll, partList, type Options, type Side } from "../src/geometry";
import { tierRole } from "../src/layout";
import { assemblyPlacements, partManifest } from "../src/assembly";
import { stand } from "../src/features/pose";
import { meshDataOf, packPlan } from "../src/export";
import { geo } from "./geo";

// These checks stand the printable meshes using the actual manifest and poses. Checking
// buildDeck alone misses the side swap introduced when a cascade tier turns around.
for (const left of SIDES) for (const right of SIDES) {
  test(`cascade assembled connectors preserve world left ${left}, right ${right}`, () => {
    for (const lanesWide of [1, 2, 3, 4]) for (const tiers of [4, 5]) geo.arena(() => {
      const options: Options = { ...DEFAULTS, lanesWide, tiers, left, right };
      const derived = solve(options);
      const parts = partList(buildAll(geo, options, derived), options);
      const catalogue = new Map(parts.map((part) => [part.name, part.mesh]));
      const deckNames = new Set(partManifest(options, derived).filter((part) => part.source.plate?.startsWith("deck")).map((part) => part.name));
      const rows = new Map<string, Manifold[]>();
      const quantities = new Map<string, number>();
      for (const placement of assemblyPlacements(options, derived)) {
        quantities.set(placement.name, (quantities.get(placement.name) ?? 0) + 1);
        expect(catalogue.has(placement.name), placement.name).toBe(true);
        if (!deckNames.has(placement.name)) continue;
        const key = `${placement.pose.translate[2]},${placement.pose.translate[1]}`;
        rows.set(key, [...(rows.get(key) ?? []), stand(catalogue.get(placement.name)!, placement.pose)]);
      }
      expect(quantities).toEqual(new Map(parts.map((part) => [part.name, part.qty])));
      expect(rows.size).toBe(lanesWide * tiers);
      for (let tier = 0; tier < tiers; tier++) {
        const reversed = tier % 2 === 1;
        const height = tier === 0 ? 0 : derived.Hb + (tier - 1) * derived.H;
        const decks = Array.from({ length: lanesWide }, (_, lane) => geo.union(rows.get(`${height},${lane * derived.gangPitch}`)!));
        for (let lane = 0; lane < lanesWide; lane++) {
          const worldSides: [Side, Side] = [lane === lanesWide - 1 ? left : "tongue", lane === 0 ? right : "socket"];
          const localSides: [Side, Side] = reversed ? [worldSides[1], worldSides[0]] : worldSides;
          const laneGeometry = laneOf(options, derived, tierRole(options, tier));
          const expectedDeck = buildDeck(geo, options, derived, laneGeometry, localSides);
          const printable = derived.split ? geo.union(splitDeck(geo, options, derived, laneGeometry, expectedDeck)) : expectedDeck;
          const expected = printable.rotate([0, 0, reversed ? 180 : 0]).translate([0, lane * derived.gangPitch, height]);
          const context = `${lanesWide} lanes, ${tiers} tiers, tier ${tier}, lane ${lane}`;
          expect(geo.diff(decks[lane], [expected]).volume(), context).toBeLessThan(1e-5);
          expect(geo.diff(expected, [decks[lane]]).volume(), context).toBeLessThan(1e-5);
          if (!lane) continue;
          expect(geo.isect(decks[lane - 1], decks[lane]).volume(), context).toBeLessThan(1e-5);
          // The T head retains outward Y motion, and its neck locates both X directions.
          for (const shift of [[0, 1, 0], [1, 0, 0], [-1, 0, 0]] as [number, number, number][]) {
            expect(geo.isect(decks[lane - 1], decks[lane].translate(shift)).volume(), `${context}, shift ${shift}`).toBeGreaterThan(10);
          }
        }
      }
      const plan = packPlan(parts.map((part) => ({ mesh: meshDataOf(part.name, part.mesh.getMesh()), qty: part.qty })), options.bed, options.bedMargin);
      expect(plan.placements.length).toBe(parts.reduce((count, part) => count + part.qty, 0));
      for (const placement of plan.placements) {
        expect(catalogue.has(placement.part), placement.part).toBe(true);
        expect(placement.bbox[0]).toBeGreaterThanOrEqual(options.bedMargin - 1e-3);
        expect(placement.bbox[1]).toBeGreaterThanOrEqual(options.bedMargin - 1e-3);
        expect(placement.bbox[3]).toBeLessThanOrEqual(options.bed[0] - options.bedMargin + 1e-3);
        expect(placement.bbox[4]).toBeLessThanOrEqual(options.bed[1] - options.bedMargin + 1e-3);
        expect(placement.bbox[2]).toBeCloseTo(0, 3);
      }
      for (const [index, first] of plan.placements.entries()) for (const second of plan.placements.slice(index + 1)) {
        if (first.plate !== second.plate) continue;
        const separate = first.bbox[3] <= second.bbox[0] || second.bbox[3] <= first.bbox[0]
          || first.bbox[4] <= second.bbox[1] || second.bbox[4] <= first.bbox[1];
        expect(separate, `${first.name} overlaps ${second.name}`).toBe(true);
      }
    });
  }, 60_000);
}

test("repeated mid tiers print both deck hands, with exact quantities", () => {
  const options: Options = { ...DEFAULTS, tiers: 6, lanesWide: 3 };
  const manifest = partManifest(options, solve(options));
  for (const half of ["front", "rear"]) {
    expect(manifest.find((part) => part.name === `lane-mid-deck-${half}`)?.qty).toBe(6);
    expect(manifest.find((part) => part.name === `lane-mid-deck-mirrored-${half}`)?.qty).toBe(6);
  }
});

test("whole minimal reversed decks mate, and Gridfinity retains its plain deck catalogue", () => {
  for (const base of ["flat", "feet", "gridfinity"] as const) geo.arena(() => {
    const options: Options = { ...DEFAULTS, length: 280, bed: [400, 400, 400], design: "minimal", tiers: 4, lanesWide: 3, left: "none", right: "none", base };
    const derived = solve(options);
    expect(derived.split).toBe(false);
    const parts = partList(buildAll(geo, options, derived), options);
    const reflected = parts.filter((part) => part.name.includes("mirrored"));
    expect(reflected.length > 0).toBe(base !== "gridfinity");
    const catalogue = new Map(parts.map((part) => [part.name, part.mesh]));
    const decks = [...assemblyPlacements(options, derived)].filter((placement) => placement.name.includes("deck") && placement.pose.translate[2] === derived.Hb)
      .map((placement) => stand(catalogue.get(placement.name)!, placement.pose));
    expect(decks.length).toBe(3);
    for (let lane = 1; lane < decks.length; lane++) {
      expect(geo.isect(decks[lane - 1], decks[lane]).volume()).toBeLessThan(1e-5);
      if (base !== "gridfinity") expect(geo.isect(decks[lane - 1], decks[lane].translate([0, 1, 0])).volume()).toBeGreaterThan(10);
    }
  });
});
