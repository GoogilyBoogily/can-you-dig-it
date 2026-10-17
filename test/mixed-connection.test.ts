import { expect, test } from "bun:test";
import { DEFAULTS, buildLanePlates, solve, K, type Options } from "../src/geometry";
import { meshDataOf, packPlan } from "../src/export";
import { stand, platePose } from "../src/features/pose";
import { MIXED_CONNECTION, mixedConnectionHeight, buildMixedSpline, mixedSplinePose, type MixedWallConnection } from "../src/features/mixed-connection";
import { geo, overhangArea } from "./geo";

function pair(fit: number, firstDepth = 480, secondDepth = 381, firstDiameter = 66, secondDiameter = 53, slope = 3) {
  const firstOptions: Options = { ...DEFAULTS, lanesWide: 1, left: "none", right: "none", fit, length: firstDepth, canD: firstDiameter, slope };
  const secondOptions: Options = { ...firstOptions, length: secondDepth, canD: secondDiameter, canL: 134 };
  const requests = [firstOptions, secondOptions].map((options) => ({ options, derived: solve(options) }));
  const channelEnd = Math.min(firstDepth, secondDepth) - MIXED_CONNECTION.endMargin;
  const connections: MixedWallConnection[] = requests.map(({ derived }) => ({ endFromFront: channelEnd,
    height: mixedConnectionHeight(derived.Hb, derived.split) }));
  const outerFace = requests[0].derived.OW / 2;
  const secondCentre = outerFace + K.gangGap + requests[1].derived.OW / 2;
  const walls = requests.map(({ options, derived }, index) => {
    const side = index === 0 ? 1 : -1, name = index === 0 ? "wall-left-closed" : "wall-right-closed";
    const plates = buildLanePlates(geo, options, derived, "bottom", new Set([name]),
      index === 0 ? { left: connections[index] } : { right: connections[index] });
    const halves = plates.flatMap((plate) => [plate.front, plate.rear, plate.whole].filter((mesh) => mesh !== undefined));
    for (const half of halves) {
      expect(half.status()).toBe("NoError");
      expect(half.decompose().length).toBe(1);
      expect(overhangArea(half)).toBeLessThan(1e-6);
    }
    return geo.union(halves.map((half) => stand(half, platePose(side > 0 ? "wall-left" : "wall-right", derived.IW, 0))))
      .translate([derived.L / 2, index === 0 ? 0 : secondCentre, 0]);
  });
  const clearance = K.cl + fit, start = MIXED_CONNECTION.gateBack + clearance;
  const length = channelEnd - clearance - start;
  const spline = buildMixedSpline(geo, firstOptions, K.gangGap, connections[0].height, connections[1].height, length);
  const placedSpline = stand(spline, mixedSplinePose(firstOptions, K.gangGap,
    connections[0].height, connections[1].height, start, outerFace));
  return { requests, connections, walls, spline, placedSpline, outerFace, start, length };
}

for (const fit of [-0.2, 0, 0.3]) {
  test(`mixed wall spline fit ${fit}: actual walls seat, retain all translations and print on their end`, () => geo.arena(() => {
    const result = pair(fit);
    expect(result.spline.status()).toBe("NoError");
    expect(result.spline.decompose().length).toBe(1);
    expect(overhangArea(result.spline)).toBeLessThan(1e-6);
    for (const wall of result.walls) expect(geo.isect(wall, result.placedSpline).volume()).toBeLessThan(1e-5);
    for (const movement of [[1.2,0,0],[-1.2,0,0],[0,1.2,0],[0,-1.2,0],[0,0,1.2],[0,0,-1.2]] as [number,number,number][]) {
      for (const wall of result.walls) expect(geo.isect(wall.translate(movement), result.placedSpline).volume(), `move ${movement}`).toBeGreaterThan(1e-5);
    }
  }));

  test(`mixed wall spline fit ${fit}: free gate sweep clears its actual host and opens the insertion path`, () => geo.arena(() => {
    const result = pair(fit), height = result.connections[0].height;
    const outer = result.outerFace, wallThickness = result.requests[0].options.wall;
    const pocket = geo.box(40, wallThickness + 2, MIXED_CONNECTION.gateBelow + MIXED_CONNECTION.radius,
      20, outer - wallThickness / 2, height + (MIXED_CONNECTION.radius - MIXED_CONNECTION.gateBelow) / 2);
    const fixedHost = geo.diff(result.walls[0], [pocket]);
    const gate = geo.isect(result.walls[0], geo.box(37, wallThickness + 2,
      MIXED_CONNECTION.gateBelow + MIXED_CONNECTION.radius, 18.5, outer - wallThickness / 2,
      height + (MIXED_CONNECTION.radius - MIXED_CONNECTION.gateBelow) / 2));
    const pivotHeight = height - MIXED_CONNECTION.radius - 0.2;
    const pivot = [MIXED_CONNECTION.gateRoot, 0, pivotHeight] as [number, number, number];
    const rotateGate = (angle: number) => gate.translate([-pivot[0],0,-pivot[2]]).rotate([0,-angle,0]).translate(pivot);
    for (const angle of [0,2,4,6,8.5])
      expect(geo.isect(rotateGate(angle), fixedHost).volume(), `gate angle ${angle}`).toBeLessThan(1e-5);
    // Exact sweep of the constant profile. A convex hull fills the blind diamond's
    // concave throat and would incorrectly claim collisions through intact walls.
    const insertionSweep = stand(buildMixedSpline(geo,result.requests[0].options,K.gangGap,
      result.connections[0].height,result.connections[1].height,2 * result.length + result.start),
    mixedSplinePose(result.requests[0].options,K.gangGap,result.connections[0].height,
      result.connections[1].height,-result.length,result.outerFace));
    expect(geo.isect(rotateGate(8.5), insertionSweep).volume()).toBeLessThan(1e-5);
    expect(geo.isect(gate, insertionSweep).volume()).toBeGreaterThan(1e-5);
    expect(geo.isect(fixedHost, insertionSweep).volume()).toBeLessThan(1e-5);
  }));

  test(`mixed wall spline fit ${fit}: original lower catch material survives and segments pack with exact total length`, () => geo.arena(() => {
    const result = pair(fit);
    for (const [index, { options, derived }] of result.requests.entries()) {
      const name = index === 0 ? "wall-left-closed" : "wall-right-closed";
      const originals = buildLanePlates(geo, options, derived, "bottom", new Set([name]))
        .flatMap((plate) => [plate.front,plate.rear,plate.whole].filter((mesh) => mesh !== undefined));
      const original = geo.union(originals.map((mesh) => stand(mesh,platePose(index === 0 ? "wall-left" : "wall-right",derived.IW,0))));
      const originalGlobal = original.translate([derived.L / 2,index === 0 ? 0 : result.outerFace + K.gangGap + derived.OW / 2,0]);
      const lowerCatches = geo.isect(originalGlobal,geo.box(derived.L + 2,1000,11.9,derived.L / 2,0,11.9 / 2));
      expect(geo.diff(lowerCatches,[result.walls[index]]).volume()).toBeLessThan(1e-5);
      if (derived.split) for (const height of [derived.Hb / 3,2 * derived.Hb / 3]) {
        const protectedSeam = geo.isect(originalGlobal,geo.box(16,1000,7,derived.L / 2,0,height));
        expect(geo.diff(protectedSeam,[result.walls[index]]).volume()).toBeLessThan(1e-5);
      }
    }
    const count = Math.ceil(result.length / 40), segmentLength = result.length / count;
    const segment = buildMixedSpline(geo,result.requests[0].options,K.gangGap,
      result.connections[0].height,result.connections[1].height,segmentLength);
    const plan = packPlan([{ mesh: meshDataOf("connection-spline",segment.getMesh()), qty: count }],[256,256,256],3);
    expect(plan.placements.length).toBe(count);
    expect(count * segmentLength).toBeCloseTo(result.length,8);
    expect(segment.boundingBox().max[2]).toBeLessThanOrEqual(40);
  }));
  test(`mixed wall spline fit ${fit}: unlike channel heights and ordinary mixed depths seat without host collision`, () => geo.arena(() => {
    for (const dimensions of [[480,360,66,53,3],[360,300,53,66,3],[300,381,25,66,0],[300,381,20,66,0]]) {
      const result = pair(fit,...dimensions as [number,number,number,number,number]);
      for (const wall of result.walls) expect(geo.isect(wall,result.placedSpline).volume()).toBeLessThan(1e-5);
      expect(result.spline.decompose().length).toBe(1);
      expect(overhangArea(result.spline)).toBeLessThan(1e-6);
    }
  }));
  test(`mixed wall spline fit ${fit}: axial stop play retains rotational obstruction before a head can pass the mouth`, () => geo.arena(() => {
    const result = pair(fit), clearance = K.cl + fit;
    const pivot = [result.start + result.length / 2,result.outerFace,result.connections[0].height] as [number,number,number];
    for (const axial of [-clearance,clearance]) for (const rotation of [[0,2,0],[0,-2,0],[0,0,2],[0,0,-2]] as [number,number,number][]) {
      const rotated = result.walls[1].translate([-pivot[0],-pivot[1],-pivot[2]]).rotate(rotation).translate(pivot);
      expect(geo.isect(rotated,result.placedSpline.translate([axial,0,0])).volume(),`rotation ${rotation} at axial ${axial}`).toBeGreaterThan(1e-5);
    }
    // A wall alone can roll inside the deliberate clearance. Its head must meet
    // a barrier before its vertical extent becomes small enough to pass the mouth.
    const bodyRadius = MIXED_CONNECTION.radius - Math.SQRT2 * clearance;
    const escapeAngle = Math.acos((MIXED_CONNECTION.radius - MIXED_CONNECTION.inset) / bodyRadius) * 180 / Math.PI;
    for (const axial of [-clearance,clearance]) for (const direction of [-1,1]) {
      let obstruction: number | undefined;
      for (let angle = 1; angle <= Math.ceil(escapeAngle); angle++) {
        const rotated = result.walls[1].translate([-pivot[0],-pivot[1],-pivot[2]]).rotate([direction * angle,0,0]).translate(pivot);
        if (geo.isect(rotated,result.placedSpline.translate([axial,0,0])).volume() > 1e-5) {obstruction = angle;break;}
      }
      expect(obstruction,`roll ${direction} at axial ${axial}`).toBeDefined();
      expect(obstruction!).toBeLessThan(escapeAngle);
    }
  }));
}

test("mixed wall band planner avoids both existing seam sockets for small and standard cans", () => {
  for (const wallHeight of [49,54,60,75,81,94,110]) {
    const height = mixedConnectionHeight(wallHeight, true);
    for (const seamHeight of [wallHeight / 3, 2 * wallHeight / 3])
      expect(Math.abs(height - seamHeight)).toBeGreaterThanOrEqual(MIXED_CONNECTION.radius + 1.8 + K.ligMin);
    expect(height - MIXED_CONNECTION.gateBelow).toBeGreaterThanOrEqual(12);
  }
});
