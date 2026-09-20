// Pockets in the print face and the rounds on a top edge: the recess a wall's outer
// face takes down to its web, and the two fillet substitutes (manifold has none).
import type { CrossSection as CS, Manifold as M } from "manifold-3d";
import { K, type Geo, type Options } from "../geometry";

/** How deep the outer-face recess goes: the wall less the web it leaves (the ligament
 *  width on the minimal design). Nothing under 0.2 mm: a recess that thin is a skin. */
export const recessDepth = (o: Options): number => {
  const rd = o.wall - (o.design === "minimal" ? K.ligMin : K.web);
  return rd > 0.2 ? rd : 0;
};

/** The material a radius-r fillet removes from a top edge at (u, top); `side` is +1/-1,
 *  the direction the edge's outer face points along u. A 2D cut profile: extrude it
 *  along the edge and subtract. */
export function roundOver(g: Geo, u: number, top: number, side: number, r: number): CS {
  const inner = u - side * r;
  const corner = g.rect(Math.min(inner, u + side), top - r, Math.max(inner, u + side), top + 1);
  return corner.subtract(g.circle(r, 24).translate([inner, top - r]));
}

/**
 * Round the outer top edges of `body` at height `top` by radius r. Manifold has no
 * fillet, so: keep everything below top-r, and above it a stack of thin slabs of
 * `plan` (the part's outline) shrunk by the fillet's inset at that height. A 2D
 * offset follows the outline round its corners, which a straight cut cannot.
 * The slabs are the stair-steps the printer lays down anyway. `pads` stay flat
 * through the whole height: seats and tab roots.
 */
export function roundTop(g: Geo, body: M, plan: CS, top: number, r: number, pads: CS[] = [], steps = 8): M {
  const bb = body.boundingBox();
  const zMin = bb.min[2] - 1, zMax = bb.max[2] + 1;
  const big = Math.max(bb.max[0] - bb.min[0], bb.max[1] - bb.min[1]) + 20;
  const keep: M[] = [g.box(big, big, top - r - zMin, 0, 0, (top - r + zMin) / 2)];
  for (let k = 0; k < steps; k++) {
    const z0 = top - r + (r * k) / steps, z1 = top - r + (r * (k + 1)) / steps;
    const rise = (z0 + z1) / 2 - (top - r);
    const inset = r - Math.sqrt(r * r - rise * rise);
    const shrunk = plan.offset(-inset, "Round", 2, 24);
    keep.push(g.prismZ(shrunk, z1 - z0 + 0.01, z0));
    shrunk.delete(); // the slab has the outline now
  }
  for (const pad of pads) keep.push(g.prismZ(pad, zMax - zMin, zMin));
  // Nine slabs and their union, every time the lip or the cover is rounded.
  const stack = g.union(keep);
  const rounded = g.isect(body, stack);
  stack.delete();
  for (const slab of keep) slab.delete();
  return rounded;
}
