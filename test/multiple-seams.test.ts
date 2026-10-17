import { expect, test } from "bun:test";
import type { Manifold } from "manifold-3d";
import { strFromU8, unzipSync } from "fflate";
import { DEFAULTS, K, solve, check, laneOf, buildDeck, buildWall, splitDeck, buildAll, partList, type Options } from "../src/geometry";
import { assemblyPlacements, assemblyCans, partManifest } from "../src/assembly";
import { stand } from "../src/features/pose";
import { gridUnit } from "../src/features/gridfinity";
import { meshDataOf, packPlan, threeMf, stlZip } from "../src/export";
import { resolveMixedBuild } from "../src/solver";
import { buildMixedGeometry } from "../src/mixed-geometry";
import { mixedAssemblyPlacements } from "../src/assembly";
import { geo, overhangArea } from "./geo";

function overlap(first: Manifold, second: Manifold): number {
  const left = first.boundingBox(), right = second.boundingBox();
  if (![0, 1, 2].every(axis => Math.min(left.max[axis], right.max[axis]) - Math.max(left.min[axis], right.min[axis]) > 1e-6)) return 0;
  return geo.isect(first, second).volume();
}

for (const [length, bed, count] of [[520, 256, 3], [520, 180, 4], [1000, 256, 5], [2000, 256, 9]]) {
  test(`${length} mm lane on ${bed} mm bed retains exact depth in ${count} supported sections`, () => {
    const options: Options = { ...DEFAULTS, length, bed: [bed, bed, 256], slope: 0 };
    const derived = solve(options);
    expect(derived.L).toBe(length);
    expect(derived.seams).toHaveLength(count - 1);
    expect(derived.pinPositions).toHaveLength(count);
    expect(check(options, derived).filter(message => message.startsWith("FAIL"))).toEqual([]);
    expect(derived.plateX).toBeLessThanOrEqual(bed - 6);
    for (let index = 0; index < derived.seams.length; index++)
      expect(derived.seams[index]).toBeCloseTo(-derived.seams.at(-index - 1)!, 8);
    for (const role of ["bottom", "top"] as const) {
      const lane = laneOf(options, derived, role);
      const edges = [lane.xd, ...derived.seams, lane.xe];
      for (let index = 0; index < edges.length - 1; index++)
        expect(lane.tabs.filter(position => position > edges[index] && position < edges[index + 1]).length).toBeGreaterThanOrEqual(1);
      for (const position of lane.tabs) {
        for (const seam of derived.seams) expect(Math.abs(position - seam)).toBeGreaterThanOrEqual(23 - 1e-7);
        for (const pin of derived.pinPositions) expect(Math.abs(position - pin)).toBeGreaterThanOrEqual(23 - 1e-7);
      }
    }
  });
}

test("valid whole and center-split plans retain their existing identities", () => {
  expect(solve({ ...DEFAULTS, length: 240 }).seams).toEqual([]);
  expect(solve(DEFAULTS).seams).toEqual([0]);
  expect(partManifest(DEFAULTS, solve(DEFAULTS)).some(part => part.source.section !== undefined)).toBe(false);
  expect(partManifest(DEFAULTS, solve(DEFAULTS)).some(part => part.name === "lane-bottom-deck-front")).toBe(true);
});

test("section sizing respects rectangular bed orientation and protects features that cannot be divided", () => {
  for (const bed of [[300, 200, 256], [200, 300, 256]] as Options["bed"][]) {
    const options = { ...DEFAULTS, length: 480, canL: 250, bed, lanesWide: 1, left: "none" as const, right: "none" as const };
    const derived = solve(options);
    expect(derived.seams).toHaveLength(2);
    expect(derived.plateX).toBeLessThanOrEqual(194);
    expect(check(options, derived).filter(message => message.startsWith("FAIL"))).toEqual([]);
  }
  const protectedOptions = { ...DEFAULTS, length: 520, canD: 200 };
  expect(check(protectedOptions, solve(protectedOptions)).join(" ")).toContain("preserving the chute, loading window and joint supports");
  const tooWide = { ...DEFAULTS, length: 520, canL: 300 };
  expect(check(tooWide, solve(tooWide)).some(message => message.startsWith("FAIL"))).toBe(true);
  const tooTall = { ...DEFAULTS, length: 1000, bed: [256, 256, 50] as Options["bed"], slope: 10 };
  expect(check(tooTall, solve(tooTall)).join(" ")).toContain("taller");
});

for (const fit of [-0.2, 0, 0.3]) for (const design of ["standard", "minimal"] as const) {
  test(`every new T joint conserves material, has solid roots and locks in X: ${design}, fit ${fit}`, () => geo.arena(() => {
    const options: Options = { ...DEFAULTS, length: 520, lanesWide: 1, left: "none", right: "none", fit, design };
    const derived = solve(options);
    expect(derived.seams).toHaveLength(2);
    for (const role of ["top", "bottom"] as const) {
      const lane = laneOf(options, derived, role);
      const deck = buildDeck(geo, options, derived, lane, ["none", "none"]);
      const sections = splitDeck(geo, options, derived, lane, deck);
      expect(sections).toHaveLength(3);
      // Independent joint outline and half-space: only the negative-X clearance
      // ring is removed. A misplaced/missing tongue cannot pass by conserving volume.
      const profile = geo.poly([[0.5, -15], [0.5, 15], [-3, 15], [-3, 20], [-8, 20], [-8, -20], [-3, -20], [-3, -15]]);
      // Subtract the extruded solids: a second 2D boolean would quantize the
      // clearance outline again before extrusion, inventing a thin material film.
      const clearance = geo.diff(geo.prismZ(profile.offset(0.25 + fit, "Miter"), lane.H + 2, -1),
        [geo.prismZ(profile, lane.H + 2, -1)]);
      const removed = derived.seams.map(seam => geo.isect(
        clearance.translate([seam, 0, 0]),
        geo.box(derived.L * 2, derived.plateY * 2, lane.H * 2, seam - derived.L, 0, lane.H / 2)));
      const expected = geo.diff(deck, removed);
      const reunited = geo.union(sections);
      expect(geo.diff(expected, [reunited]).volume()).toBeLessThan(1e-5);
      expect(geo.diff(reunited, [expected]).volume()).toBeLessThan(1e-5);
      expect(reunited.volume()).toBeCloseTo(expected.volume(), 5);
      for (let index = 0; index < derived.seams.length; index++) {
        const seam = derived.seams[index];
        const root = geo.box(5, 30, 2, seam + 3, 0, 2);
        expect(overlap(sections[index + 1], root) / root.volume()).toBeCloseTo(1, 6);
        const head = geo.box(2, 30, 2, seam - 5, 0, 2);
        expect(overlap(sections[index + 1], head) / head.volume()).toBeCloseTo(1, 6);
        for (const side of [-1, 1]) {
          const shoulder = geo.box(2, 2, 2, seam - 5, side * 24, 2);
          expect(overlap(sections[index], shoulder) / shoulder.volume()).toBeCloseTo(1, 6);
        }
        expect(overlap(sections[index], sections[index + 1])).toBeLessThan(1e-6);
        expect(overlap(sections[index], sections[index + 1].translate([1, 0, 0]))).toBeGreaterThan(10);
      }
    }
  }));
}

const variants: Partial<Options>[] = [
  { fit: -0.2, design: "minimal" }, { fit: 0 }, { fit: 0.3, pattern: "slat" },
  { fit: 0.3, pattern: "circle", design: "minimal" }, { fit: -0.2, pattern: "kumiko" },
  { pattern: "breeze", design: "minimal" },
  { fit: 0.3, design: "minimal", cascade: false }, { base: "feet" },
  { base: "gridfinity", magnets: true, shelfCells: [13, 4] },
  { rearLoad: true, cover: false }, { lanesWide: 2, tiers: 4 },
  { bed: [180, 180, 180], design: "minimal" },
];
for (const changes of variants) {
  test(`multi-section prints and actual assemblies remain connected, supported and collision-free: ${JSON.stringify(changes)}`, () => geo.arena(() => {
    const options: Options = { ...DEFAULTS, length: 520, lanesWide: 1, tiers: 3, left: "none", right: "none", ...changes };
    const derived = solve(options);
    expect(check(options, derived).filter(message => message.startsWith("FAIL"))).toEqual([]);
    const parts = partList(buildAll(geo, options, derived), options);
    const descriptors = partManifest(options, derived);
    const catalogue = new Map(parts.map(part => [part.name, part.mesh]));
    const placed = [...assemblyPlacements(options, derived)].map(placement => ({ ...placement, mesh: stand(catalogue.get(placement.name)!, placement.pose) }));
    const quantities = new Map<string, number>();
    for (const part of placed) quantities.set(part.name, (quantities.get(part.name) ?? 0) + 1);
    expect(quantities).toEqual(new Map(parts.map(part => [part.name, part.qty])));
    expect(parts.map(({ name, qty }) => [name, qty])).toEqual(descriptors.map(({ name, qty }) => [name, qty]));
    expect(parts.find(part => part.name === "seam-key")!.qty).toBe(options.lanesWide * derived.seams.length * (4 * options.tiers + (options.cover ? 2 : 0)));
    if (options.base === "feet") expect(parts.find(part => part.name === "riser-24")!.qty).toBe(2 * derived.pinPositions.length * options.lanesWide);
    for (const part of parts) {
      expect(part.mesh.status(), part.name).toBe("NoError");
      expect(part.mesh.decompose().length, part.name).toBe(1);
      expect(overhangArea(part.mesh, options.magnets), part.name).toBeLessThan(1e-6);
    }
    for (let first = 0; first < placed.length; first++) for (let second = first + 1; second < placed.length; second++)
      expect(overlap(placed[first].mesh, placed[second].mesh), `${placed[first].name}/${placed[second].name}`).toBeLessThan(1e-5);
    const can = geo.cyl(options.canD / 2, options.canL, 0, 0, -options.canL / 2).rotate([90, 0, 0]);
    for (const placement of assemblyCans(options, derived)) {
      const cylinder = stand(can, placement.pose);
      for (const part of placed) expect(overlap(cylinder, part.mesh), `can/${part.name}`).toBeLessThan(1e-5);
    }
    const printable = parts.map(part => ({ mesh: meshDataOf(part.name, part.mesh.getMesh()), qty: part.qty }));
    const plan = packPlan(printable, options.bed, options.bedMargin);
    expect(plan.placements.length).toBe(placed.length);
    for (const placement of plan.placements) {
      const source = plan.geometries[placement.geometry];
      for (let index = 0; index < source.pos.length; index += 3) {
        const x = (placement.rotation90 ? -source.pos[index + 1] : source.pos[index]) + placement.translation[0];
        const y = (placement.rotation90 ? source.pos[index] : source.pos[index + 1]) + placement.translation[1];
        expect(x).toBeGreaterThanOrEqual(3 - 1e-4); expect(x).toBeLessThanOrEqual(options.bed[0] - 3 + 1e-4);
        expect(y).toBeGreaterThanOrEqual(3 - 1e-4); expect(y).toBeLessThanOrEqual(options.bed[1] - 3 + 1e-4);
      }
    }
  }));
}

test("every retained Gridfinity magnet rim belongs entirely to one section", () => geo.arena(() => {
  for (const fit of [-0.2, 0, 0.3]) {
    const options: Options = { ...DEFAULTS, length: 520, base: "gridfinity", magnets: false, fit, shelfCells: [13, 4], lanesWide: 1 };
    const derived = solve(options);
    const sections = buildAll(geo, options, derived).gridDeck!.sections!;
    expect(sections).toHaveLength(3);
    const pockets = gridUnit(geo, derived, true, 0.25 + fit).pockets;
    expect(pockets.length).toBeGreaterThan(0);
    expect(pockets.length).toBeLessThan(derived.floorCells[0] * derived.floorCells[1] * 4);
    for (const pocket of pockets) {
      const bounds = pocket.boundingBox();
      const x = (bounds.min[0] + bounds.max[0]) / 2, y = (bounds.min[1] + bounds.max[1]) / 2;
      const rim = geo.diff(geo.cyl(4.25, 2.4, x, y, -7), [geo.cyl(3.25, 2.4, x, y, -7)]);
      expect(sections.filter(section => geo.diff(rim, [section]).volume() < 1e-5)).toHaveLength(1);
    }
  }
}));

for (const fit of [-0.2, 0, 0.3]) {
  test(`every added wall/cover key blocks withdrawal and interior snap roots stay solid at fit ${fit}`, () => geo.arena(() => {
    const options: Options = { ...DEFAULTS, length: 520, lanesWide: 1, tiers: 2, cascade: false,
      design: "minimal", fit, left: "none", right: "none" };
    const derived = solve(options);
    const printable = partList(buildAll(geo, options, derived), options);
    const catalogue = new Map(printable.map(part => [part.name, part.mesh]));
    const placed = [...assemblyPlacements(options, derived)].map(placement => ({ ...placement, mesh: stand(catalogue.get(placement.name)!, placement.pose) }));
    const descriptors = partManifest(options, derived);
    for (let index = 0; index < derived.seams.length; index++) {
      const seam = derived.seams[index];
      const wallName = descriptors.find(part => part.source.plate?.startsWith("wall-left") && part.source.section === index + 1)!.name;
      const wall = placed.find(part => part.name === wallName && part.pose.translate[2] === 0)!.mesh;
      const wallKeys = placed.filter(part => part.name === "seam-key" && part.pose.rotate[0] === 90
        && Math.abs(part.pose.translate[0] - seam) < 1e-7 && part.pose.translate[1] > 0 && part.pose.translate[2] < derived.H);
      expect(wallKeys).toHaveLength(2);
      for (const displacement of [[0, 0, 0.01], [0, 0, -0.01], [0, 0.01, 0], [0, -0.01, 0]] as [number, number, number][])
        expect(wallKeys.reduce((sum, key) => sum + overlap(wall.translate(displacement), key.mesh), 0)).toBeGreaterThan(1e-5);
      const coverName = descriptors.find(part => part.source.kind === "cover" && part.source.section === index + 1)!.name;
      const cover = placed.find(part => part.name === coverName)!.mesh;
      const coverKeys = placed.filter(part => part.name === "seam-key" && part.pose.rotate[0] === 0
        && Math.abs(part.pose.translate[0] - seam) < 1e-7);
      expect(coverKeys).toHaveLength(2);
      for (const direction of [-1, 1])
        expect(coverKeys.reduce((sum, key) => sum + overlap(cover.translate([0, 0, direction * 0.01]), key.mesh), 0)).toBeGreaterThan(1e-5);
    }
    const wall = buildWall(geo, options, derived, laneOf(options, derived, "top"), 1);
    for (const position of derived.pinPositions) for (const side of [-1, 1]) {
      const root = geo.box(0.2, 3, 0.2, position + side * 7.2, derived.IW / 2 + 1.5, derived.H - 0.2);
      expect(overlap(wall, root) / root.volume()).toBeCloseTo(1, 5);
    }
  }));
}

test("unlike mixed depths use their own section plans and serialize every required copy", () => geo.arena(() => {
  const layout = resolveMixedBuild({ w: 600, d: 1000, h: 400, front: 0 }, {
    shared: { ...DEFAULTS, base: "flat", cascade: false, slope: 0 },
    stacks: [{ canDiameter: 66, canHeight: 122.5, depth: 520, tiers: 2 }, { canDiameter: 53, canHeight: 134, depth: 900, tiers: 3 }],
  });
  expect(layout.stacks.map(stack => stack.derived.L)).toEqual([520, 900]);
  expect(layout.stacks.map(stack => stack.derived.seams.length + 1)).toEqual([3, 4]);
  const parts = buildMixedGeometry(geo, layout);
  const catalogue = new Map(parts.map(part => [part.name, part.mesh]));
  const standing = [...mixedAssemblyPlacements(layout)].map(placement => ({ ...placement, mesh: stand(catalogue.get(placement.name)!, placement.pose) }));
  for (let first = 0; first < standing.length; first++) for (let second = first + 1; second < standing.length; second++)
    expect(overlap(standing[first].mesh, standing[second].mesh), `${standing[first].name}/${standing[second].name}`).toBeLessThan(1e-5);
  const printable = parts.map(part => ({ mesh: meshDataOf(part.name, part.mesh.getMesh()), qty: part.qty }));
  const plan = packPlan(printable, layout.request.shared.bed, 3);
  expect(plan.placements.length).toBe(standing.length);
  const archive = unzipSync(threeMf(plan, layout.request.shared.bed));
  const model = strFromU8(archive["3D/3dmodel.model"]);
  const names = [...model.matchAll(/<object id="\d+" type="model" name="([^"]+)"/g)].map(match => match[1]);
  expect(names).toEqual(plan.placements.map(placement => placement.name));
  expect(Object.keys(unzipSync(stlZip(printable.map(part => part.mesh)))).sort()).toEqual(parts.map(part => `${part.name}.stl`).sort());
}));
