import { expect, test } from "bun:test";
import type { Manifold } from "manifold-3d";
import { DEFAULTS, PATTERNS, K, buildAll, buildWall, check, laneOf, partList, solve, type Options } from "../src/geometry";
import { assemblyCans, assemblyPlacements, partManifest } from "../src/assembly";
import { clearanceOf, earNotchH, endWallTabPositions, tabSnap, wallSeamHeights } from "../src/features/joints";
import { lay, platePose, stand } from "../src/features/pose";
import { geo, overhangArea } from "./geo";

function assembledParts(options: Options) {
  const derived = solve(options);
  const printable = partList(buildAll(geo, options, derived), options);
  const catalogue = new Map(printable.map((part) => [part.name, part.mesh]));
  const assembled = [...assemblyPlacements(options, derived)].map((placement) => ({ ...placement, mesh: stand(catalogue.get(placement.name)!, placement.pose) }));
  return { derived, printable, assembled };
}

function overlap(first: Manifold, second: Manifold): number {
  const left = first.boundingBox(), right = second.boundingBox();
  if (![0, 1, 2].every((axis) => Math.min(left.max[axis], right.max[axis]) - Math.max(left.min[axis], right.min[axis]) > 1e-6)) return 0;
  return geo.isect(first, second).volume();
}

for (const pattern of PATTERNS) for (const fit of [-0.2, 0, 0.3]) for (const design of ["standard", "minimal"] as const) {
  test(`${pattern} ${design} at fit ${fit}: actual assembly, hidden keys and printable connected hosts`, () => geo.arena(() => {
    const options: Options = { ...DEFAULTS, pattern, fit, design, tiers: 3, left: "none", right: "none" };
    const { derived, printable, assembled } = assembledParts(options);
    const quantities = new Map<string, number>();
    for (const part of assembled) quantities.set(part.name, (quantities.get(part.name) ?? 0) + 1);
    expect(quantities).toEqual(new Map(printable.map((part) => [part.name, part.qty])));
    expect(printable.find((part) => part.name === "seam-key")!.qty).toBe(options.lanesWide * (4 * options.tiers + 2));
    for (const part of printable) {
      expect(part.mesh.decompose().length, part.name).toBe(1);
      expect(overhangArea(part.mesh), part.name).toBeLessThan(1e-6);
    }
    for (let first = 0; first < assembled.length; first++) for (let second = first + 1; second < assembled.length; second++)
      expect(overlap(assembled[first].mesh, assembled[second].mesh), `${assembled[first].name} / ${assembled[second].name}`).toBeLessThan(1e-5);
    // All exact-contact collars stay inside the shell; finished sides add no projections.
    for (const part of assembled) {
      const bounds = part.mesh.boundingBox();
      expect(bounds.min[1], part.name).toBeGreaterThanOrEqual(-derived.OW / 2 - 1e-6);
      expect(bounds.max[1], part.name).toBeLessThanOrEqual((options.lanesWide - 1) * derived.gangPitch + derived.OW / 2 + 1e-6);
    }
    const key = printable.find((part) => part.name === "seam-key")!.mesh;
    expect(key.boundingBox().min[2]).toBeCloseTo(0, 6);
    const firstLayer = key.slice(0.05);
    expect(firstLayer.area()).toBeGreaterThan(1);
    const firstLayerRails = key.slice(0.01).intersect(geo.rect(3, -5, 4, 5)).decompose();
    expect(firstLayerRails.length).toBe(2);
    for (const rail of firstLayerRails) {
      const bounds = rail.bounds();
      expect(bounds.max[1] - bounds.min[1]).toBeGreaterThanOrEqual(0.5);
    }
  }));
}

for (const changes of [{ base: "gridfinity" }, { base: "feet" }, { rearLoad: true, tiers: 3, cover: false }, { cascade: false, tiers: 3, cover: false }, { slope: 0, cover: false }, { fit: 0.3, slope: 0, design: "minimal", cover: false } ] as Partial<Options>[]) {
  test(`finished joint variants remain printable and collision free: ${JSON.stringify(changes)}`, () => geo.arena(() => {
    const options: Options = { ...DEFAULTS, left: "none", right: "none", ...changes };
    const { printable, assembled } = assembledParts(options);
    for (const part of printable) {
      expect(part.mesh.decompose().length, part.name).toBe(1);
      expect(overhangArea(part.mesh), part.name).toBeLessThan(1e-6);
    }
    for (let first = 0; first < assembled.length; first++) for (let second = first + 1; second < assembled.length; second++)
      expect(overlap(assembled[first].mesh, assembled[second].mesh), `${assembled[first].name} / ${assembled[second].name}`).toBeLessThan(1e-5);
  }));
}

for (const fit of [-0.2, 0, 0.3]) {
  test(`seam keys locate both wall halves and block vertical withdrawal and torque at fit ${fit}`, () => geo.arena(() => {
    const options: Options = { ...DEFAULTS, lanesWide: 1, tiers: 1, cascade: false, fit };
    const { derived, assembled } = assembledParts(options);
    const rear = assembled.find((part) => part.name === "lane-wall-left-rear")!.mesh;
    const keys = assembled.filter((part) => part.name === "seam-key" && part.pose.rotate[0] === 90 && part.pose.translate[1] > 0).map((part) => part.mesh);
    expect(keys.length).toBe(wallSeamHeights(derived.H).length);
    for (const shift of [[0, 0, 0.01], [0, 0, -0.01], [0, 0.01, 0], [0, -0.01, 0]] as [number, number, number][])
      expect(keys.reduce((volume, key) => volume + overlap(rear.translate(shift), key), 0), `${shift}`).toBeGreaterThan(1e-5);
    // Pull the host apart through its allowed X clearance and put the floating key
    // at the opposite axial stop. The locating collar must still bridge the gap.
    const clearance = clearanceOf(options);
    const shiftedWall = rear.translate([clearance, 0, 0]);
    const shiftedKeys = keys.map((key) => key.translate([-clearance, 0, 0]));
    expect(shiftedKeys.reduce((volume, key) => volume + overlap(shiftedWall, key), 0)).toBeLessThan(1e-5);
    for (const direction of [-1, 1])
      expect(shiftedKeys.reduce((volume, key) => volume + overlap(shiftedWall.translate([0, 0, direction * 0.01]), key), 0)).toBeGreaterThan(1e-5);
    const centre: [number, number, number] = [0, derived.py, derived.H / 2];
    for (const angle of [-0.1, 0.1]) {
      const turned = rear.translate(centre.map((value) => -value) as [number, number, number]).rotate([0, angle, 0]).translate(centre);
      expect(keys.reduce((volume, key) => volume + overlap(turned, key), 0)).toBeGreaterThan(1e-5);
    }
    // The previous escape path started by raising every positive-X half together.
    const moving = assembled.filter((part) => { const bounds = part.mesh.boundingBox(); return bounds.min[0] + bounds.max[0] > 1e-6; });
    const fixed = assembled.filter((part) => !moving.includes(part));
    expect(moving.reduce((volume, part) => volume + fixed.reduce((sum, other) => sum + overlap(part.mesh.translate([0, 0, 0.05]), other.mesh), 0), 0)).toBeGreaterThan(0.01);
  }));
}

test("tight minimal ear prongs retain their full three-millimeter thickness", () => geo.arena(() => {
  const options: Options = { ...DEFAULTS, fit: -0.2, design: "minimal" };
  const derived = solve(options), lane = laneOf(options, derived, "top");
  const wall = buildWall(geo, options, derived, lane, 1);
  const notchHeight = earNotchH(clearanceOf(options));
  const rootTop = notchHeight + K.snapLen - tabSnap(clearanceOf(options), notchHeight, K.tabW).peak;
  for (const position of lane.tabs) for (const side of [-1, 1]) {
    const probe = geo.box(0.2, K.tabT, 0.2, position + side * (K.tabW / 2 - K.snapT / 2), derived.IW / 2 + K.tabT / 2, rootTop - 0.2);
    expect(geo.isect(wall, probe).volume() / probe.volume()).toBeCloseTo(1, 5);
  }
}));

test("uncovered end walls have positive downward snap retention at every fit and slope boundary", () => {
  for (const fit of [-0.2, 0, 0.3]) for (const slope of [0, 10]) geo.arena(() => {
    const options: Options = { ...DEFAULTS, lanesWide: 1, tiers: 1, cascade: false, cover: false, fit, slope };
    const { assembled } = assembledParts(options);
    const endWall = assembled.find((part) => part.name === "lane-end-wall")!.mesh;
    const deck = geo.union(assembled.filter((part) => part.name.startsWith("lane-deck")).map((part) => part.mesh));
    expect(overlap(endWall, deck)).toBeLessThan(1e-5);
    expect(overlap(endWall.translate([0, 0, 0.8]), deck)).toBeGreaterThan(0.1);
    expect(endWallTabPositions(solve(options).IW).length).toBe(2);
  });
});

test("finished wall variants close unused side and rear notches and remove terminal pins", () => geo.arena(() => {
  const options: Options = { ...DEFAULTS, tiers: 3, left: "none", right: "none", cover: false, rearLoad: true };
  const { derived, printable } = assembledParts(options);
  const manifest = partManifest(options, derived);
  expect(manifest.some((part) => part.source.plate?.endsWith("-terminal-open"))).toBe(true);
  for (const part of printable.filter((part) => part.name.includes("-terminal"))) expect(part.mesh.boundingBox().max[1] - part.mesh.boundingBox().min[1]).toBeLessThanOrEqual(derived.H + 1e-6);
  const placements = [...assemblyPlacements(options, derived)];
  for (const descriptor of manifest.filter((part) => part.source.plate?.startsWith("wall-"))) {
    const name = descriptor.source.plate!;
    const side = name.startsWith("wall-left") ? 1 : -1;
    const lane = laneOf(options, derived, descriptor.source.laneRole!);
    const mesh = printable.find((part) => part.name === descriptor.name)!.mesh;
    const placement = placements.find((part) => part.name === descriptor.name)!;
    const standing = stand(mesh, placement.pose);
    const basePose = platePose(side > 0 ? "wall-left" : "wall-right", derived.IW, lane.xe);
    for (const position of lane.tongues) {
      if (descriptor.source.half === "front" && position > 0 || descriptor.source.half === "rear" && position < 0) continue;
      const localProbe = geo.box(1, options.wall - 0.02, 1, position, side * derived.py, 2);
      const worldProbe = stand(lay(localProbe, basePose), placement.pose);
      const fraction = overlap(standing, worldProbe) / worldProbe.volume();
      if (name.includes("-closed")) expect(fraction, descriptor.name).toBeCloseTo(1, 5);
      else expect(fraction, descriptor.name).toBeLessThan(1e-5);
    }
    if (descriptor.source.half !== "front") {
      const localProbe = geo.box(1, options.wall - 0.02, 1, lane.xe + options.wall / 2, side * derived.py, (lane.lapZ + lane.H) / 2);
      const worldProbe = stand(lay(localProbe, basePose), placement.pose);
      const fraction = overlap(standing, worldProbe) / worldProbe.volume();
      if (name.includes("-open")) expect(fraction, descriptor.name).toBeCloseTo(1, 5);
      else expect(fraction, descriptor.name).toBeLessThan(1e-5);
    }
  }
}));

test("end wall bed checks include its downward snap stems", () => {
  const options: Options = { ...DEFAULTS, canL: 280, canD: 100, length: 230, slope: 10, tiers: 1, cascade: false, cover: false, bed: [150, 400, 400] };
  const derived = solve(options), lane = laneOf(options, derived, "top");
  expect(lane.H).toBeGreaterThan(derived.usableX);
  expect(lane.H - lane.te).toBeLessThan(derived.usableX);
  expect(derived.OW).toBeGreaterThan(derived.usableX);
  expect(check(options, derived).some((warning) => warning.startsWith("FAIL end wall"))).toBe(true);
});


test("new stems, seam keys and finished frames clear every stored can in the actual assembly", () => {
  for (const changes of [{}, { fit: 0.3, design: "minimal", slope: 0 }, { base: "gridfinity", slope: 10 }, { rearLoad: true, tiers: 3, cover: false }] as Partial<Options>[]) geo.arena(() => {
    const options: Options = { ...DEFAULTS, left: "none", right: "none", ...changes };
    const { derived, assembled } = assembledParts(options);
    const can = geo.cyl(options.canD / 2, options.canL, 0, 0, -options.canL / 2, 64).rotate([90, 0, 0]);
    for (const placement of assemblyCans(options, derived)) {
      const positioned = stand(can, placement.pose);
      for (const part of assembled) expect(overlap(positioned, part.mesh), part.name).toBeLessThan(1e-5);
    }
  });
});

test("short lanes reserve separate pin roots and hidden cover keys", () => {
  for (const fit of [-0.2, 0, 0.3]) for (const bed of [[100, 100, 50], [256, 256, 256]] as [number, number, number][]) geo.arena(() => {
    const base: Options = { ...DEFAULTS, canD: 20, canL: 40, cascade: false, slope: 0, fit, bed };
    for (const length of [100, 109.2, 112]) {
      const rejected = { ...base, length };
      expect(check(rejected, solve(rejected)).some((warning) => warning.startsWith("FAIL opposing tier pins"))).toBe(true);
    }
    for (const length of [112.6, 120]) {
    const options = { ...base, length };
    const { derived, printable, assembled } = assembledParts(options);
    expect(check(options, derived).filter((warning) => warning.startsWith("FAIL"))).toHaveLength(0);
    for (const part of printable) {
      expect(part.mesh.decompose().length, part.name).toBe(1);
      expect(overhangArea(part.mesh), part.name).toBeLessThan(1e-6);
    }
    for (let first = 0; first < assembled.length; first++) for (let second = first + 1; second < assembled.length; second++)
      expect(overlap(assembled[first].mesh, assembled[second].mesh), `${assembled[first].name} / ${assembled[second].name}`).toBeLessThan(1e-5);
    }
  });
});
