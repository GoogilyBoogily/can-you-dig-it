import type { Manifold } from "manifold-3d";
import { mixedPartManifest, type MixedPartSource } from "./assembly";
import { buildLanePlates, buildLip, buildCover, type PartRole, type WallPinFeatures } from "./geometry";
import type { Geo } from "./kernel";
import type { MixedLayout } from "./solver";
import { buildSeamKey } from "./features/joints";
import { buildMixedSpline } from "./features/mixed-connection";
import { K } from "./model";
import { buildSharedPart } from "./shared-wall-geometry";

export interface MixedPrintablePart { name: string; mesh: Manifold; qty: number; role: PartRole }

/** Resolve only the manifest's explicit physical sources. A facing bottom wall is
 * a distinct source from the ordinary wall reused by higher flat tiers. */
export function buildMixedGeometry(geometry: Geo, layout: MixedLayout, wallPins?: WallPinFeatures): MixedPrintablePart[] {
  const meshes = new Map<string, Manifold>();
  return mixedPartManifest(layout).map(descriptor => ({ name: descriptor.name,
    mesh: buildMixedPart(geometry, layout, descriptor.source, meshes, wallPins), qty: descriptor.qty, role: descriptor.role }));
}

/** Resolve one explicit source, sharing its section cache with the caller. */
export function buildMixedPart(geometry: Geo, layout: MixedLayout, source: MixedPartSource,
  meshes: Map<string, Manifold>, wallPins?: WallPinFeatures): Manifold {
  if (wallPins && layout.boundaries?.some(boundary => boundary.kind === "shared"))
    throw new Error("Custom wall receivers currently require separate row walls");
  if (source.kind === "spline") {
    const boundary = layout.connections.find(connection => connection.firstStackIndex === source.boundaryIndex);
    if (!boundary) throw new Error(`Missing connection boundary ${source.boundaryIndex + 1}`);
    return buildMixedSpline(geometry, layout.stacks[boundary.firstStackIndex].options, K.gangGap,
      boundary.firstHeight, boundary.secondHeight, source.length);
  }
  if (source.kind === "shared-divider" || source.kind === "shared-key" || source.sharedSides)
    return buildSharedPart(geometry, layout, source, meshes);
  return stackMesh(geometry, layout, source, meshes, wallPins);
}

function stackMesh(geometry: Geo, layout: MixedLayout, request: Extract<MixedPartSource, { kind: "stack" }>,
  meshes: Map<string, Manifold>, wallPins?: WallPinFeatures): Manifold {
  const stack = layout.stacks[request.stackIndex];
  if (!stack) throw new Error(`Missing mixed stack ${request.stackIndex + 1}`);
  const { options, derived } = stack, source = request.source;
  const identity = `${request.stackIndex}|${source.kind}|${source.laneRole ?? ""}|${source.plate ?? ""}|${request.connection ? `${request.connection.endFromFront},${request.connection.height}` : ""}`;
  const halfIdentity = `${identity}|${source.section ?? source.half ?? "whole"}`;
  const existing = meshes.get(halfIdentity);
  if (existing) return existing;
  if (source.kind === "lane") {
    if (!source.laneRole || !source.plate) throw new Error("Mixed lane source requires its role and plate");
    const connections = request.connection ? { left: request.connection, right: request.connection } : undefined;
    const plate = buildLanePlates(geometry, options, derived, source.laneRole, new Set([source.plate]), connections, wallPins)[0];
    if (!plate) throw new Error(`Missing mixed lane plate ${source.plate}`);
    for (const half of ["whole", "front", "rear"] as const) if (plate[half]) meshes.set(`${identity}|${half}`, plate[half]);
    for (const [index, section] of (plate.sections ?? []).entries()) meshes.set(`${identity}|${index}`, section);
  } else if (source.kind === "cover") {
    const cover = buildCover(geometry, options, derived);
    if (cover.length > 2) {
      for (const [index, section] of cover.entries()) meshes.set(`${identity}|${index}`, section);
    } else if (derived.split) {
      if (cover[0]) meshes.set(`${identity}|front`, cover[0]);
      if (cover[1]) meshes.set(`${identity}|rear`, cover[1]);
    } else if (cover[0]) meshes.set(`${identity}|whole`, cover[0]);
  } else if (source.kind === "key") meshes.set(halfIdentity, buildSeamKey(geometry, options));
  else if (source.kind === "lip") meshes.set(halfIdentity, buildLip(geometry, options, derived));
  else throw new Error(`Mixed organizers do not support printable source ${source.kind}`);
  const mesh = meshes.get(halfIdentity);
  if (!mesh) throw new Error(`Missing mixed printable source ${halfIdentity}`);
  return mesh;
}
