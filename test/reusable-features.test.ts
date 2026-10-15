import { expect, test } from "bun:test";
import { Geo as CompatibilityGeo, DEFAULTS, K, buildAll, solve, type Options } from "../src/geometry";
import { Geo } from "../src/kernel";
import { roundTop } from "../src/features/pocket";
import { cellsOf } from "../src/features/lattice";
import { gridUnit } from "../src/features/gridfinity";
import { clearanceOf, teeProfile, tSlotJoint, gangJoint } from "../src/features/joints";
import { geo } from "./geo";

test("the composer preserves the public kernel constructor", () => {
  expect(CompatibilityGeo).toBe(Geo);
});

for (const translation of [[100, -150, 0], [-200, 170, 40], [17, 24, -30]]) {
  test(`roundTop follows translation ${translation}`, () => geo.arena(() => {
    const [x, y, z] = translation;
    const plan = geo.roundedRect(40, 30, 3);
    const pad = geo.rect(-3, -5, 3, 5);
    const body = geo.prismZ(plan, 6);
    const reference = roundTop(geo, body, plan, 6, 2, [pad]);
    const translated = roundTop(geo, body.translate([x, y, z]), plan.translate([x, y]), 6 + z, 2, [pad.translate([x, y])]).translate([-x, -y, -z]);
    expect(reference.volume()).toBeGreaterThan(0);
    expect(geo.diff(reference, [translated]).volume()).toBeLessThan(1e-6);
    expect(geo.diff(translated, [reference]).volume()).toBeLessThan(1e-6);
  }));
}

for (const pattern of ["hex", "circle", "kumiko", "breeze", "slat"] as const) {
  for (const contour of ["circle", "notched"] as const) {
    test(`${pattern} holes stay inside a ${contour} panel`, () => geo.arena(() => {
      const panel = contour === "circle" ? geo.circle(40, 96)
        : geo.rect(-50, -35, 50, 35).subtract(geo.rect(-12, 5, 12, 40));
      const keep = geo.circle(5, 48).translate([15, -10]);
      const holes = cellsOf(geo, pattern, 6, 1.7, panel, [keep]);
      expect(holes).not.toBeNull();
      expect(holes!.area()).toBeGreaterThan(0);
      expect(holes!.subtract(panel).area()).toBeLessThan(1e-6);
      expect(holes!.intersect(keep).area()).toBeLessThan(1e-6);
      if (pattern === "circle" || pattern === "hex") {
        const cell = pattern === "circle" ? geo.circle(6, 48) : geo.poly(Array.from({ length: 6 }, (_, index) => {
          const angle = (90 + index * 60) * Math.PI / 180;
          return [6 * Math.cos(angle), 6 * Math.sin(angle)];
        }));
        for (const component of holes!.decompose()) expect(component.area()).toBeCloseTo(cell.area(), 4);
      }
    }));
  }
}

test("a reusable T joint derives its male and socket from explicit dimensions", () => geo.arena(() => {
  const dimensions = { neckDepth: 5, depth: 14, overlap: 1.5 };
  const profile = teeProfile(geo, { neckWidth: 12, headWidth: 24, ...dimensions });
  expect(profile.bounds().min).toEqual([-14, -12]);
  expect(profile.bounds().max).toEqual([1.5, 12]);
  const joint = tSlotJoint(geo, { neck: 12, head: 24, clearance: 0.4, zb: -4, H: 15, dimensions });
  expect(geo.diff(joint.male, [joint.female]).volume()).toBeLessThan(1e-6);
  expect(joint.male.boundingBox().min[0]).toBe(-14);
  const gang = gangJoint(geo, { run: 20, clearance: 0.4, through: 15, wall: 6, neck: 12, head: 24, dimensions });
  expect(gang.male.boundingBox().max[1]).toBe(14);
  expect(() => teeProfile(geo, { neckWidth: 24, headWidth: 12, ...dimensions })).toThrow("T profile");
}));

for (const length of [300, 410]) for (const along of ["front", "centre", "back"] as const) for (const fit of [-0.2, 0.3]) {
  test(`magnet support belongs to one complete split part at ${length}/${along}/${fit}`, () => geo.arena(() => {
    const options: Options = { ...DEFAULTS, base: "gridfinity", length, along, fit, magnets: true, shelfCells: [10, 9] };
    const derived = solve(options);
    expect(derived.split).toBe(true);
    const pockets = gridUnit(geo, derived, true, clearanceOf(options)).pockets;
    const deck = buildAll(geo, options, derived).gridDeck!;
    let inspected = 0;
    for (const pocket of pockets) {
      const bounds = pocket.boundingBox();
      const x = (bounds.min[0] + bounds.max[0]) / 2, y = (bounds.min[1] + bounds.max[1]) / 2;
      if (Math.abs(x) > 25) continue;
      inspected++;
      const support = geo.diff(geo.cyl(K.magnetR + 0.8, 0.1, x, y, -K.unitH + 0.05), [geo.cyl(K.magnetR + 0.05, 0.3, x, y, -K.unitH)]);
      const supported = [deck.front!, deck.rear!].map((part) => geo.isect(part, support).volume());
      expect(Math.max(...supported) / support.volume()).toBeGreaterThan(0.99999);
      expect(Math.min(...supported)).toBeLessThan(1e-6);
    }
    expect(inspected).toBeGreaterThan(0);
  }));
}

test("a centred T splice omits the two pockets crossing its head edge", () => geo.arena(() => {
  const derived = solve({ ...DEFAULTS, base: "gridfinity", length: 410, shelfCells: [10, 9] });
  const pockets = gridUnit(geo, derived, true).pockets;
  expect(pockets).toHaveLength(158);
  for (const pocket of pockets) {
    const bounds = pocket.boundingBox();
    const x = (bounds.min[0] + bounds.max[0]) / 2, y = (bounds.min[1] + bounds.max[1]) / 2;
    expect(Math.abs(x + 8) < 1e-6 && Math.abs(Math.abs(y) - 8) < 1e-6).toBe(false);
  }
}));

test("reusable surface helpers reject nonterminating or invalid feature dimensions", () => geo.arena(() => {
  const plan = geo.rect(-10, -10, 10, 10), body = geo.prismZ(plan, 5);
  expect(roundTop(geo, body, plan, 5, 0)).toBe(body);
  expect(() => roundTop(geo, body, plan, 5, 2, [], 0)).toThrow("step count");
  expect(() => cellsOf(geo, "hex", 0, 0, plan, [])).toThrow("radius");
  expect(() => cellsOf(geo, "slat", 2, -1, plan, [])).toThrow("ligament");
}));
