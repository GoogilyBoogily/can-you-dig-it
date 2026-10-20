import type { Manifold } from "manifold-3d";
import type { Geo } from "./kernel";
import { independentRowsPartManifest } from "./assembly";
import { buildMixedPart, type MixedPrintablePart } from "./mixed-geometry";
import type { IndependentRowsLayout } from "./rows";
import { buildRowTransitionPart } from "./row-transition-geometry";
import { pinJoint, clearanceOf } from "./features/joints";
import { sharedWallPinJoint } from "./features/shared-wall";
import type { Options } from "./model";
import type { WallPinFeatures } from "./geometry";

/** The shoe's qualified crest receives its matching bottom chamber. The wall's
 * own upper pins still mate with the original cover or next carrier sockets. */
export function rowReceivingPinFeatures(geometry: Geo, options: Options): WallPinFeatures {
  const ordinary = pinJoint(geometry, { wall: options.wall, clearance: clearanceOf(options) });
  const receiving = sharedWallPinJoint(geometry, options);
  return { joint: { pin: ordinary.pin, relief: ordinary.relief, notch: receiving.notch },
    receivingTip: receiving.tip, hook: receiving.original.hook, rootDepth: receiving.freeRootDepth };
}

/** Resolve the manifest's real row and transition sources. Repeated row copies
 * share their owner's meshes while every standing placement stays explicit. */
export function buildIndependentRowsGeometry(geometry: Geo, layout: IndependentRowsLayout): MixedPrintablePart[] {
  const rowMeshes = new Map<number, Map<string, Manifold>>();
  const receivers = new Map<number, WallPinFeatures>();
  return independentRowsPartManifest(layout).map(descriptor => {
    const source = descriptor.source;
    let mesh: Manifold;
    if (source.kind === "row-part") {
      const row = layout.rows[source.rowIndex];
      if (!row) throw new Error(`${descriptor.name}: missing row source ${source.rowIndex + 1}`);
      const meshes = rowMeshes.get(source.rowIndex) ?? new Map<string, Manifold>();
      rowMeshes.set(source.rowIndex, meshes);
      let wallPins: WallPinFeatures | undefined;
      if (row.index > 0 && source.source.kind === "stack" && source.source.source.kind === "lane"
        && source.source.source.plate?.startsWith("wall-")) {
        wallPins = receivers.get(row.index) ?? rowReceivingPinFeatures(geometry, row.lanes[0].options);
        receivers.set(row.index, wallPins);
      }
      mesh = buildMixedPart(geometry, row.layout, source.source, meshes, wallPins);
    } else {
      const transition = layout.transitions[source.transitionIndex];
      const part = transition?.parts[source.partIndex];
      if (!part) throw new Error(`${descriptor.name}: missing transition part plan`);
      const options = layout.rows[transition.lowerRowIndex]?.lanes[0]?.options;
      if (!options) throw new Error(`${descriptor.name}: missing lower row settings`);
      mesh = buildRowTransitionPart(geometry, transition, source.partIndex, options);
    }
    return { name: descriptor.name, mesh, qty: descriptor.qty, role: descriptor.role };
  });
}
