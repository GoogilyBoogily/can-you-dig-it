import { test, expect } from "bun:test";
import { K, DEFAULTS, buildWall, buildCover, buildAll, partList, laneOf, splitWall, type Options } from "../src/geometry";
import { fitSpace } from "../src/solver";
import { meshDataOf, pack } from "../src/export";
import { geo } from "./geo";

for (const canL of [80, 220]) for (const slope of [0, 10]) {
  test(`accepted short split preserves walls and cover: can length ${canL}, slope ${slope}`, () => geo.arena(() => {
    const options: Options = { ...DEFAULTS, canD: canL === 220 ? 20 : 100, canL, length: 140, cascade: false,
      lanesWide: 1, left: "none", right: "none", bed: [120, 300, 256], slope, solid: true };
    const layouts = fitSpace({ w: canL + 100, d: 140, h: 400, front: 0 }, options, { cascade: false });
    const layout = layouts.find((candidate) => candidate.derived.L === 140)!;
    expect(layout).toBeDefined();
    const { options: accepted, derived } = layout;
    expect(derived.split).toBe(true);
    for (const side of [-1, 1]) {
      const wall = buildWall(geo, accepted, derived, laneOf(accepted, derived, "top"), side);
      const [front, rear] = splitWall(geo, derived, wall);
      const reunited = geo.union([front, rear]);
      expect(front.volume()).toBeGreaterThan(0);
      expect(rear.volume()).toBeGreaterThan(0);
      expect(front.boundingBox().max[0]).toBeCloseTo(0, 6);
      expect(rear.boundingBox().min[0]).toBeCloseTo(0, 6);
      expect(geo.isect(front, rear).volume()).toBeCloseTo(0, 6);
      expect(reunited.volume()).toBeCloseTo(wall.volume(), 5);
      expect(reunited.boundingBox()).toEqual(wall.boundingBox());
      expect(geo.diff(wall, [reunited]).volume()).toBeCloseTo(0, 6);
    }
    // Joining solid cover halves removes exactly their two internal spline channels.
    // Derive those specified diamonds independently, so conservation still detects an
    // accidental cut outside them or a missing socket in either half.
    const wholeCover = buildCover(geo, accepted, { ...derived, split: false })[0];
    const coverHalves = buildCover(geo, accepted, derived);
    const reunitedCover = geo.union(coverHalves);
    const radius = 1.8, halfLength = 6, clearance = K.cl + accepted.fit;
    const profile = geo.poly([[0, -radius], [radius, 0], [0, radius], [-radius, 0]]);
    const socket = geo.prismX(profile, 2 * (halfLength + clearance), -halfLength - clearance);
    const inset = K.coverInset - radius - K.ligMin;
    const thickness = wholeCover.boundingBox().max[2];
    const channels = geo.union([-1, 1].map((side) => socket.translate([0, side * (derived.OW / 2 - inset), thickness / 2])));
    const expectedCover = geo.diff(wholeCover, [channels]);
    const expectedRemovedVolume = 2 * (2 * radius ** 2) * (2 * (halfLength + clearance));
    expect(geo.isect(wholeCover, channels).volume()).toBeCloseTo(expectedRemovedVolume, 5);
    expect(wholeCover.volume() - reunitedCover.volume()).toBeCloseTo(expectedRemovedVolume, 5);
    expect(reunitedCover.volume()).toBeCloseTo(expectedCover.volume(), 5);
    expect(reunitedCover.boundingBox()).toEqual(wholeCover.boundingBox());
    expect(geo.diff(expectedCover, [reunitedCover]).volume()).toBeCloseTo(0, 6);
    expect(geo.diff(reunitedCover, [expectedCover]).volume()).toBeCloseTo(0, 6);
    expect(geo.diff(reunitedCover, [wholeCover]).volume()).toBeCloseTo(0, 6);
    expect(geo.isect(coverHalves[0], coverHalves[1]).volume()).toBeCloseTo(0, 6);
    const parts = partList(buildAll(geo, accepted, derived), accepted).map((part) => {
      expect(part.mesh.status()).toBe("NoError");
      expect(part.mesh.decompose().length).toBe(1);
      return { mesh: meshDataOf(part.name, part.mesh.getMesh()), qty: part.qty };
    });
    expect(pack(parts, accepted.bed, accepted.bedMargin).length).toBe(parts.reduce((sum, part) => sum + part.qty, 0));
  }));
}
