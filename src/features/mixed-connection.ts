import type { Manifold } from "manifold-3d";
import type { Geo } from "../kernel";
import { K, type Options } from "../model";
import { clearanceOf, seamKeyRadius, wallSeamHeights } from "./joints";

/** A blind sliding channel on the outer face of one bottom wall. Coordinates are
 * distances from the dispensing front and heights above that wall's bottom. */
export interface MixedWallConnection { endFromFront: number; height: number }
export const MIXED_CONNECTION = { radius: 2.85, inset: 1.2, ligament: K.ligMin,
  gateFront: 10, gateBack: 14, gateRoot: 40, gateThickness: 1.6,
  gateBelow: 9.3, gateTop: 0.8, frontClearance: 0.25, endMargin: 18 } as const;

/** Choose a band clear of the original lower catches and both hidden wall keys.
 * Different neighbors may use different heights; the rigid spline bridges them. */
export function mixedConnectionHeight(wallHeight: number, split: boolean): number {
  const protection = MIXED_CONNECTION.radius + seamKeyRadius + K.ligMin;
  for (let heightTenths = 215; heightTenths <= Math.floor((wallHeight - 12) * 10); heightTenths++) {
    const height = heightTenths / 10;
    if (!split || wallSeamHeights(wallHeight).every((seamHeight) => Math.abs(height - seamHeight) >= protection + 0.01))
      return height;
  }
  throw new Error("Bottom wall has no connection band clear of its existing catches and seam keys");
}

export function mixedConnectionBand(connection: MixedWallConnection, length: number): [number, number, number, number] {
  const margin = MIXED_CONNECTION.radius + K.ligMin;
  return [-length / 2, connection.height - MIXED_CONNECTION.gateBelow - K.ligMin,
    connection.endFromFront - length / 2 + margin, connection.height + margin];
}

/** Cut after the host has reserved its complete, full-thickness band. The gate is
 * freed through the complete thickness, so its flexure lies in the wall print plane. */
export function cutMixedWallConnection(geometry: Geo, options: Options, wall: Manifold,
  length: number, innerWidth: number, side: number, connection: MixedWallConnection): Manifold {
  const specification = MIXED_CONNECTION;
  if (options.wall < specification.radius + specification.inset + K.ligMin)
    throw new Error("Mixed connections require walls at least 5.75 mm thick");
  if (connection.endFromFront <= specification.gateRoot + 2 * K.ligMin || connection.endFromFront > length - 4)
    throw new Error("Mixed connection channel is too short or reaches the end wall");
  const outerFace = innerWidth / 2 + options.wall;
  const centre = outerFace - specification.inset;
  const diamond = geometry.poly([[centre, connection.height - specification.radius],
    [centre + specification.radius, connection.height], [centre, connection.height + specification.radius],
    [centre - specification.radius, connection.height]]);
  const channel = geometry.prismX(diamond, connection.endFromFront + 1, -length / 2 - 1);
  const bottom = connection.height - specification.gateBelow;
  const beamTop = connection.height - specification.radius - 0.2;
  const beamBottom = beamTop - specification.gateThickness;
  // The hook's rear face is perpendicular to withdrawal. The front ramp is only an
  // insertion lead-in, and needs temporary gate deflection during assembly.
  const beam = geometry.poly([[specification.gateFront, beamBottom], [specification.gateRoot + 1, beamBottom],
    [specification.gateRoot + 1, beamTop], [specification.gateBack, beamTop],
    [specification.gateBack, connection.height + specification.gateTop],
    [specification.gateFront, connection.height + specification.gateTop - (specification.gateBack - specification.gateFront)],
  ]).translate([-length / 2, 0]);
  const relief = geometry.box(specification.gateRoot, options.wall + 2,
    connection.height + specification.radius - bottom,
    -length / 2 + specification.gateRoot / 2, outerFace - options.wall / 2,
    (bottom + connection.height + specification.radius) / 2);
  const spring = geometry.prismY(beam, options.wall, innerWidth / 2);
  const local = geometry.union([geometry.diff(wallForPositiveSide(wall, side), [channel, relief]), spring]);
  return side > 0 ? local : local.mirror([0, 1, 0]);
}

function wallForPositiveSide(wall: Manifold, side: number): Manifold {
  return side > 0 ? wall : wall.mirror([0, 1, 0]);
}

/** The profile lies in world YZ, relative to the first outer wall face. Printed on
 * its X end, every section is directly supported even when wall heights differ. */
export function mixedSplineProfile(geometry: Geo, options: Options, gap: number, firstHeight: number, secondHeight: number) {
  const radius = MIXED_CONNECTION.radius - Math.SQRT2 * clearanceOf(options);
  const firstCentre = -MIXED_CONNECTION.inset, secondCentre = gap + MIXED_CONNECTION.inset;
  const diamond = (centre: number, height: number) => geometry.poly([[centre, height - radius], [centre + radius, height],
    [centre, height + radius], [centre - radius, height]]);
  const halfThickness = K.ligMin / 2, middle = gap / 2;
  if (gap < K.ligMin) throw new Error("Mixed connection gap must leave a complete spline bridge ligament");
  // The step stays entirely outside both hosts. Sloping directly between the heads
  // would cross a wall's mouth when unlike stacks require different channel heights.
  const bridge = geometry.cs2d(
    geometry.rect(firstCentre, firstHeight - halfThickness, middle + halfThickness, firstHeight + halfThickness),
    geometry.rect(middle - halfThickness, secondHeight - halfThickness, secondCentre, secondHeight + halfThickness),
    geometry.rect(middle - halfThickness, Math.min(firstHeight, secondHeight) - halfThickness,
      middle + halfThickness, Math.max(firstHeight, secondHeight) + halfThickness),
  );
  return geometry.cs2d(diamond(firstCentre, firstHeight), diamond(secondCentre, secondHeight), bridge);
}

export function buildMixedSpline(geometry: Geo, options: Options, gap: number,
  firstHeight: number, secondHeight: number, length: number): Manifold {
  if (![gap, firstHeight, secondHeight, length].every(Number.isFinite) || gap < 0 || length <= 0)
    throw new Error("Mixed spline dimensions must be finite, with positive length and nonnegative gap");
  const section = mixedSplineProfile(geometry, options, gap, firstHeight, secondHeight);
  const bounds = mixedSplineBounds(options, gap, firstHeight, secondHeight);
  return geometry.prismZ(section.translate([-bounds.min[0], -bounds.min[1]]), length);
}

/** Inverse of the end-on print orientation: printed (u,v,w) becomes world (w,u,v). */
export function mixedSplinePose(options: Options, gap: number,
  firstHeight: number, secondHeight: number, startFromFront: number, firstOuterFace: number) {
  const bounds = mixedSplineBounds(options, gap, firstHeight, secondHeight);
  return { rotate: [90, 0, 90] as [number, number, number], translate: [startFromFront,
    firstOuterFace + bounds.min[0], bounds.min[1]] as [number, number, number] };
}

export function mixedSplineBounds(options: Options, gap: number, firstHeight: number, secondHeight: number) {
  const radius = MIXED_CONNECTION.radius - Math.SQRT2 * clearanceOf(options);
  return { min: [-MIXED_CONNECTION.inset - radius, Math.min(firstHeight, secondHeight) - radius] as [number, number],
    max: [gap + MIXED_CONNECTION.inset + radius, Math.max(firstHeight, secondHeight) + radius] as [number, number] };
}
