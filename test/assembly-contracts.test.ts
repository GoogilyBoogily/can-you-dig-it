import { test, expect } from "bun:test";
import { DEFAULTS, K, solve, laneOf, buildDeck, buildEndWall, buildLip, buildCover, stand, lipPose, buildAll, partList, type Options } from "../src/geometry";
import { queueGeometry, minimumQueueLength } from "../src/queue";
import { assemblyCans, assemblyPlacements, partManifest, previewCounts, PREVIEW_INSTANCE_LIMIT } from "../src/assembly";
import { geo } from "./geo";

test("capacity, shortest lane and poses use the same queue", () => {
  for (const cascade of [false, true]) for (const bottom of [false, true]) for (const canD of [20, 66, 200]) for (const slope of [0, 3, 10]) for (const count of [1, 3, 7]) {
    const options = { ...DEFAULTS, cascade, canD, slope };
    const length = minimumQueueLength(options, count, bottom);
    expect(queueGeometry(options, length, bottom).count).toBe(count);
    expect(queueGeometry(options, length - 0.001, bottom).count).toBe(count - 1);
    const queue = queueGeometry(options, length, bottom);
    expect(queue.position(count - 1)[0]).toBeLessThanOrEqual(queue.last + 1e-8);
  }
  const options = { ...DEFAULTS, cascade: false, canD: 20, canL: 80, slope: 0, length: 137 };
  expect(solve(options).n).toBe(5);
});

test("stored cylinders clear deck, lip, end wall, and ceiling across sizes and slopes", () => {
  for (const cascade of [false, true]) for (const bottom of cascade ? [false, true] : [false]) for (const canD of [20, 66, 200]) for (const slope of [0, 3, 10]) {
    const options: Options = { ...DEFAULTS, cascade, canD, canL: 80, slope, lanesWide: 1, tiers: 3, left: "none", right: "none", solid: true, bed: [1000, 1000, 1000], length: 0 };
    options.length = minimumQueueLength(options, 3, bottom);
    const derived = solve(options);
    const queue = queueGeometry(options, derived.L, bottom);
    geo.arena(() => {
      const role = bottom ? "bottom" : cascade ? "mid" : "top";
      const lane = laneOf(options, derived, role);
      const deck = buildDeck(geo, options, derived, lane, ["none", "none"]);
      const end = buildEndWall(geo, options, derived, lane);
      const cover = buildCover(geo, options, derived)[0].translate([0, 0, lane.H]);
      const lip = !cascade || bottom ? stand(buildLip(geo, options, derived), lipPose(-derived.L / 2, derived.tan)) : undefined;
      const cylinder = geo.cyl(canD / 2, options.canL, 0, 0, -options.canL / 2, 128).rotate([90, 0, 0]);
      const context = JSON.stringify({ cascade, bottom, canD, slope });
      for (let index = 0; index < queue.count; index++) {
        const can = cylinder.translate(queue.position(index));
        for (const obstacle of [deck, end, cover, ...(lip ? [lip] : [])]) expect(geo.isect(can, obstacle).volume(), context).toBeLessThan(1e-5);
        expect(can.boundingBox().max[2], context).toBeLessThanOrEqual(lane.H + 1e-8);
      }
    });
  }
}, 60_000);

test("manifest, assembled instances and print quantities agree for every product variant", () => {
  for (const cascade of [false, true]) for (const base of ["flat", "feet", "gridfinity"] as const) for (const rearLoad of [false, true]) for (const cover of [false, true]) for (const tiers of [1, 2, 3, 4]) {
    const options = { ...DEFAULTS, cascade, base, rearLoad, cover, tiers, lanesWide: 3, left: "none" as const, right: "none" as const };
    const derived = solve(options);
    const actual = new Map<string, number>();
    for (const placement of assemblyPlacements(options, derived)) actual.set(placement.name, (actual.get(placement.name) ?? 0) + 1);
    const descriptors = partManifest(options, derived);
    expect(new Map(descriptors.map((part) => [part.name, part.qty]))).toEqual(actual);
    expect([...assemblyCans(options, derived)].length).toBe(options.lanesWide * (cascade ? derived.nBottom + (tiers - 1) * derived.n : derived.n * tiers));
  }
});

test("large previews have bounded instance storage while retaining exact counts", () => {
  const options = { ...DEFAULTS, cascade: false, canD: 20, canL: 40, length: 1900, tiers: 40, lanesWide: 35, slope: 0, bed: [1000, 1000, 1000] as Options["bed"] };
  const derived = solve(options);
  const counts = previewCounts(options, derived);
  expect(counts.cans).toBeGreaterThan(100_000);
  expect(counts.sampled).toBe(true);
  const descriptors = partManifest(options, derived);
  const allocated = Math.ceil(counts.cans / counts.stride) + descriptors.reduce((sum, descriptor) => sum + Math.ceil(descriptor.qty / counts.stride), 0);
  expect(allocated).toBeLessThanOrEqual(PREVIEW_INSTANCE_LIMIT + descriptors.length);
});

test("builders omit unrequested support and shelf deck meshes", () => {
  for (const base of ["flat", "feet", "gridfinity"] as const) geo.arena(() => {
    const options = { ...DEFAULTS, cascade: false, tiers: 1, lanesWide: 1, rearLoad: true, base };
    const derived = solve(options);
    const set = buildAll(geo, options, derived);
    expect(!!set.riser).toBe(base === "feet");
    expect(set.lanes.flatMap((lane) => lane.plates).some((plate) => plate.name === "end-wall")).toBe(false);
    if (base === "gridfinity") expect(set.lanes.flatMap((lane) => lane.plates).some((plate) => plate.name === "deck")).toBe(false);
    expect(partList(set, options).map(({ name, qty }) => [name, qty])).toEqual(partManifest(options, derived).map(({ name, qty }) => [name, qty]));
  });
}, 60_000);
