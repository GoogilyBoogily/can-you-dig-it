import { test, expect } from "bun:test";
import { DEFAULTS, buildWall, buildCover, buildAll, partList, laneOf, splitWall, type Options } from "../src/geometry";
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
    // Solid covers differ only at their cut; patterned covers deliberately add a seam band.
    const wholeCover = buildCover(geo, accepted, { ...derived, split: false })[0];
    const coverHalves = buildCover(geo, accepted, derived);
    const reunitedCover = geo.union(coverHalves);
    expect(reunitedCover.volume()).toBeCloseTo(wholeCover.volume(), 5);
    expect(reunitedCover.boundingBox()).toEqual(wholeCover.boundingBox());
    expect(geo.diff(wholeCover, [reunitedCover]).volume()).toBeCloseTo(0, 6);
    expect(geo.diff(reunitedCover, [wholeCover]).volume()).toBeCloseTo(0, 6);
    const parts = partList(buildAll(geo, accepted, derived), accepted).map((part) => {
      expect(part.mesh.status()).toBe("NoError");
      expect(part.mesh.decompose().length).toBe(1);
      return { mesh: meshDataOf(part.name, part.mesh.getMesh()), qty: part.qty };
    });
    expect(pack(parts, accepted.bed, accepted.bedMargin).length).toBe(parts.reduce((sum, part) => sum + part.qty, 0));
  }));
}
