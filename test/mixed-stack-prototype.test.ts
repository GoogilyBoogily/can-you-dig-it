import { expect, test } from "bun:test";
import type { Manifold } from "manifold-3d";
import { buildConnectionPrototype, FRAME, SAMPLE_STACKS } from "../prototypes/mixed-stack-connection";
import { meshDataOf, packPlan } from "../src/export";
import { stand } from "../src/features/pose";
import { buildAll, buildWall, K, laneOf, partList } from "../src/geometry";
import { geo, overhangArea } from "./geo";

function overlap(first: Manifold, second: Manifold): number {
  const firstBounds = first.boundingBox(), secondBounds = second.boundingBox();
  if (![0, 1, 2].every((axis) => Math.min(firstBounds.max[axis], secondBounds.max[axis])
    - Math.max(firstBounds.min[axis], secondBounds.min[axis]) > 1e-6)) return 0;
  return geo.isect(first, second).volume();
}

function standing(result: ReturnType<typeof buildConnectionPrototype>) {
  const catalogue = new Map(result.parts.map((part) => [part.name, part.mesh]));
  return result.placements.map((placement) => ({ ...placement, mesh: stand(catalogue.get(placement.name)!, placement.pose) }));
}

for (const fit of [-0.2, 0, 0.3]) {
  test(`mixed-depth prototype at fit ${fit}: actual full assembly, printability and exact quantities`, () => geo.arena(() => {
    const result = buildConnectionPrototype(geo, SAMPLE_STACKS, fit);
    const placed = standing(result);
    const counts = new Map<string, number>();
    for (const part of placed) counts.set(part.name, (counts.get(part.name) ?? 0) + 1);
    expect(counts).toEqual(new Map(result.parts.map((part) => [part.name, part.quantity])));
    expect(counts.get("prototype-transverse-key")).toBe(4);
    expect(counts.get("prototype-key-keeper")).toBe(8);
    expect(result.stacks.map((stack) => stack.derived.L)).toEqual([480, 360, 300]);
    for (const part of result.parts) {
      expect(part.mesh.status(), part.name).toBe("NoError");
      expect(part.mesh.decompose().length, part.name).toBe(1);
      expect(overhangArea(part.mesh), part.name).toBeLessThan(1e-6);
      expect(part.mesh.boundingBox().min[2], part.name).toBeCloseTo(0, 6);
    }
    for (let first = 0; first < placed.length; first++) for (let second = first + 1; second < placed.length; second++)
      expect(overlap(placed[first].mesh, placed[second].mesh), `${placed[first].name}/${placed[second].name}`).toBeLessThan(1e-5);
    const plan = packPlan(result.parts.map((part) => ({ mesh: meshDataOf(part.name, part.mesh.getMesh()), qty: part.quantity })), [256, 256, 256], 3);
    expect(plan.placements.length).toBe(placed.length);
    for (const placement of plan.placements) {
      expect(placement.bbox[0]).toBeGreaterThanOrEqual(3 - 1e-6);
      expect(placement.bbox[1]).toBeGreaterThanOrEqual(3 - 1e-6);
      expect(placement.bbox[3]).toBeLessThanOrEqual(253 + 1e-6);
      expect(placement.bbox[4]).toBeLessThanOrEqual(253 + 1e-6);
    }
  }));

  test(`prototype at fit ${fit}: both connections constrain translation with either key ownership`, () => geo.arena(() => {
    const placed = standing(buildConnectionPrototype(geo, SAMPLE_STACKS.slice(0, 2), fit));
    const firstDeck = geo.union(placed.filter((part) => part.name.startsWith("stack-1-lane-bottom-deck")).map((part) => part.mesh));
    const secondDeck = geo.union(placed.filter((part) => part.name.startsWith("stack-2-lane-bottom-deck")).map((part) => part.mesh));
    const keys = placed.filter((part) => part.name === "prototype-transverse-key");
    expect(overlap(firstDeck, secondDeck.translate([0, 0, 2]))).toBeLessThan(1e-5);
    for (const shift of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]] as [number, number, number][]) {
      const deckCollision = overlap(firstDeck, secondDeck.translate(shift));
      const fixedKeys = keys.reduce((volume, key) => volume + overlap(key.mesh, secondDeck.translate(shift)), 0);
      const movingKeys = keys.reduce((volume, key) => volume + overlap(key.mesh.translate(shift), firstDeck), 0);
      expect(deckCollision + fixedKeys, `fixed keys, shift ${shift}`).toBeGreaterThan(1e-5);
      expect(deckCollision + movingKeys, `moving keys, shift ${shift}`).toBeGreaterThan(1e-5);
    }
  }));

  test(`prototype at fit ${fit}: rear-first key insertion is clear and seated keys cannot slide out`, () => geo.arena(() => {
    const placed = standing(buildConnectionPrototype(geo, SAMPLE_STACKS.slice(0, 2), fit));
    const decks = placed.filter((part) => part.name.includes("lane-bottom-deck"));
    const keys = placed.filter((part) => part.name === "prototype-transverse-key").sort((first, second) => second.pose.translate[0] - first.pose.translate[0]);
    const keepers = placed.filter((part) => part.name === "prototype-key-keeper");
    const installed: Manifold[] = [];
    for (const key of keys) {
      // Swept union is an exact translational sweep of this prismatic channel: its
      // convex hull also covers every collar/taper position between sampled endpoints.
      const swept = geo.hull([key.mesh, key.mesh.translate([-key.pose.translate[0] - FRAME.keyLength, 0, 0])]);
      for (const obstacle of [...decks.map((part) => part.mesh), ...installed])
        expect(overlap(swept, obstacle)).toBeLessThan(1e-5);
      installed.push(key.mesh);
      const localKeepers = keepers.filter((keeper) => Math.abs(keeper.pose.translate[0] - key.pose.translate[0]) < FRAME.railWidth / 2);
      expect(localKeepers.length).toBe(2);
      for (const direction of [-1, 1]) expect(localKeepers.reduce((volume, keeper) => volume
        + overlap(key.mesh.translate([direction * 4, 0, 0]), keeper.mesh), 0)).toBeGreaterThan(1e-5);
      for (const keeper of localKeepers) {
        expect(decks.reduce((volume, deck) => volume + overlap(keeper.mesh.translate([0, 0, 0.8]), deck.mesh), 0)).toBeGreaterThan(1e-5);
        expect(decks.reduce((volume, deck) => volume + overlap(keeper.mesh.translate([0, 0, -0.8]), deck.mesh), 0)).toBeGreaterThan(1e-5);
        installed.push(keeper.mesh);
      }
    }
  }));

  test(`prototype at fit ${fit}: every original bottom wall catch keeps its actual bearing material`, () => geo.arena(() => {
    const result = buildConnectionPrototype(geo, SAMPLE_STACKS, fit);
    const placed = standing(result);
    for (const [index, stack] of result.stacks.entries()) {
      const originalParts = partList(buildAll(geo, stack.options, stack.derived), stack.options);
      const offset: [number, number, number] = [stack.derived.L / 2, stack.centreAcross, FRAME.height];
      const original = geo.union(originalParts.filter((part) => part.name.startsWith("lane-bottom-deck")).map((part) => part.mesh)).translate(offset);
      const modified = geo.union(placed.filter((part) => part.name.startsWith(`stack-${index + 1}-lane-bottom-deck`)).map((part) => part.mesh));
      expect(geo.diff(original, [modified]).volume(), `stack ${index + 1}: removed original deck material`).toBeLessThan(1e-5);
      const lane = laneOf(stack.options, stack.derived, "bottom");
      for (const side of [-1, 1]) {
        const wall = buildWall(geo, stack.options, stack.derived, lane, side).translate(offset).translate([0, 0, 0.8]);
        for (const tab of lane.tabs) {
          const region = geo.box(K.earW, stack.options.wall + 2, 8,
            tab + offset[0], offset[1] + side * stack.derived.py, FRAME.height + 2);
          const originalCapture = geo.isect(geo.isect(wall, original), region).volume();
          const modifiedCapture = geo.isect(geo.isect(wall, modified), region).volume();
          expect(originalCapture).toBeGreaterThan(0.1);
          expect(Math.abs(modifiedCapture - originalCapture), `stack ${index + 1}, side ${side}, tab ${tab}`).toBeLessThan(1e-5);
        }
      }
    }
  }));

  test(`prototype at fit ${fit}: axial key play cannot release rotational restraint`, () => geo.arena(() => {
    const result = buildConnectionPrototype(geo, SAMPLE_STACKS.slice(0, 2), fit);
    const placed = standing(result);
    const firstDeck = geo.union(placed.filter((part) => part.name.startsWith("stack-1-lane-bottom-deck")).map((part) => part.mesh));
    const secondDeck = geo.union(placed.filter((part) => part.name.startsWith("stack-2-lane-bottom-deck")).map((part) => part.mesh));
    const keys = placed.filter((part) => part.name === "prototype-transverse-key");
    const keepers = placed.filter((part) => part.name === "prototype-key-keeper");
    const obstacles = [firstDeck, secondDeck, ...keepers.map((part) => part.mesh)];
    // Measure reachable travel against the actual blind channel ends and keepers.
    // A nominal spacing formula incorrectly allowed keys to pass through an end stop.
    const travelLimits = keys.map((key) => [-1, 1].map((direction) => {
      const collision = (distance: number) => obstacles.reduce((volume, obstacle) => volume
        + overlap(key.mesh.translate([direction * distance, 0, 0]), obstacle), 0);
      let low = 0, high = 4;
      expect(collision(high)).toBeGreaterThan(1e-5);
      for (let iteration = 0; iteration < 20; iteration++) {
        const middle = (low + high) / 2;
        if (collision(middle) > 1e-8) high = middle;
        else low = middle;
      }
      return direction * Math.max(0, low - 1e-4);
    }));
    const pivot: [number, number, number] = [(keys[0].pose.translate[0] + keys[1].pose.translate[0]) / 2,
      result.connections[0].socketAcross, FRAME.height / 2];
    const turn = (mesh: Manifold, rotation: [number, number, number]) => mesh.translate(pivot.map((value) => -value) as [number, number, number]).rotate(rotation).translate(pivot);
    for (const firstDirection of [-1, 1]) for (const secondDirection of [-1, 1]) {
      const displacedKeys = keys.map((key, index) => key.mesh.translate([travelLimits[index][(index === 0 ? firstDirection : secondDirection) < 0 ? 0 : 1], 0, 0]));
      for (const key of displacedKeys) expect(overlap(key, firstDeck) + overlap(key, secondDeck)).toBeLessThan(1e-5);
      for (const rotation of [[0.5, 0, 0], [-0.5, 0, 0], [0, 0.5, 0], [0, -0.5, 0], [0, 0, 0.5], [0, 0, -0.5]] as [number, number, number][]) {
        const movedDeck = turn(secondDeck, rotation);
        const deckCollision = overlap(firstDeck, movedDeck);
        expect(deckCollision + displacedKeys.reduce((volume, key) => volume + overlap(key, movedDeck), 0), `fixed keys, ${rotation}`).toBeGreaterThan(1e-5);
        expect(deckCollision + displacedKeys.reduce((volume, key) => volume + overlap(turn(key, rotation), firstDeck), 0), `moving keys, ${rotation}`).toBeGreaterThan(1e-5);
      }
    }
  }));
}

test("prototype preserves whole/split boundaries and rejects impossible exact depths", () => geo.arena(() => {
  const result = buildConnectionPrototype(geo, [SAMPLE_STACKS[0], { ...SAMPLE_STACKS[1], depth: 220 }, SAMPLE_STACKS[2]]);
  expect(result.stacks.map((stack) => stack.derived.split)).toEqual([true, false, true]);
  for (const part of result.parts) {
    expect(part.mesh.decompose().length, part.name).toBe(1);
    expect(overhangArea(part.mesh), part.name).toBeLessThan(1e-6);
  }
  const deeper = buildConnectionPrototype(geo, [{ ...SAMPLE_STACKS[0], depth: 600 }, SAMPLE_STACKS[1]]);
  expect(deeper.stacks[0].derived.L).toBe(600);
  expect(deeper.stacks[0].derived.seams).toHaveLength(2);
  for (const part of deeper.parts) {
    expect(part.mesh.decompose().length, part.name).toBe(1);
    expect(overhangArea(part.mesh), part.name).toBeLessThan(1e-6);
  }
  expect(() => buildConnectionPrototype(geo, [{ ...SAMPLE_STACKS[0], tiers: 1.5 }, SAMPLE_STACKS[1]])).toThrow("two to six");
  expect(() => buildConnectionPrototype(geo, [SAMPLE_STACKS[0], { ...SAMPLE_STACKS[1], depth: 381 }])).toThrow("preserve the receiver");
}));
