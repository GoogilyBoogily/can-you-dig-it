// The Gridfinity unit a shelf lane's deck grows below z = 0: a floor of whole cells with
// the spec foot proud under every one, a skirt where the lane runs past its floor, and
// magnet pockets in every foot. docs/gridfinity-spec.md has every number and its K.
import type { Manifold as M } from "manifold-3d";
import { K, gridSpan, type Derived, type Geo } from "../geometry";

/** One Gridfinity foot, centred, from z = 0 up: hulls of the profile's rounded
 *  rectangles, so the 45° faces are exact and the corners concentric. An extrude with
 *  a scale would square the top corner and bind in the baseplate's r4 pocket. The
 *  upper chamfer runs on `over` mm past the profile: neighbouring feet then meet in
 *  a 45° ridge and their rounded corners close in a 45° pit, and the floor over them
 *  has no flat underside anywhere. */
export function buildFoot(g: Geo, over: number): M {
  const { footFlat: flat, footChamferLo: lo, footWall: wall, footChamferHi: hi, footR: r } = K;
  const mid = flat + 2 * lo, top = mid + 2 * hi; // 37.2, 41.5
  const ring = (side: number, radius: number, z: number) => g.roundedRect(side, side, radius).toPolygons().flat().map(([x, y]) => [x, y, z] as [number, number, number]);
  return g.union([
    g.hull([...ring(flat, r - hi - lo, 0), ...ring(mid, r - hi, lo)]),
    g.prismZ(g.roundedRect(mid, mid, r - hi), wall, lo),
    g.hull([...ring(mid, r - hi, lo + wall), ...ring(top + 2 * over, r + over, lo + wall + hi + over)]),
  ]);
}

/** The floor of feet clipped to the bin outline, the skirt beside it, and the magnet
 *  pockets, all in the lane frame with the unit from -unitH to 0. A pocket the seam
 *  would halve is skipped. */
export function gridUnit(g: Geo, d: Derived, magnets: boolean): { floor: M; skirt: M | null; pockets: M[] } {
  const { floorCells: [nx, ny], floor: [fx0, fy0, fx1, fy1] } = d;
  const footH = K.footChamferLo + K.footWall + K.footChamferHi;
  const z0 = -K.unitH;
  // the bin's r3.75 corners, except where the lane's own corner lands on one: flush in a
  // corner, a deck ear would hang a square millimetre over the round. Where the lane
  // runs past its floor (a shelf too narrow for the cells that would cover it), the
  // outline is the lane's and a skirt stands under it, bed to floor, beside the
  // baseplate: solid, so nothing overhangs, and the foot chamfers run into it
  const lane = g.rect(-d.L / 2, -d.OW / 2, d.L / 2, d.OW / 2);
  const outline = g.roundedRect(gridSpan(nx), gridSpan(ny), K.footR).translate([(fx0 + fx1) / 2, (fy0 + fy1) / 2]).add(lane);
  const skirtCS = lane.subtract(g.rect(fx0 - 2 * K.gridGap, fy0 - 2 * K.gridGap, fx1 + 2 * K.gridGap, fy1 + 2 * K.gridGap));
  // the corner pit between four feet is the last void to close, sqrt(2)·4 − 3.75 = 1.9 mm
  // above the foot tops. The chamfers run on through the whole 2.25 mm and past it, and
  // the outline prism clips them flat at the deck's underside: the merged run-ons are
  // the floor, and no slab has to start above the last pit - a slab 0.1 mm over it left
  // slivers where the 24-segment corner arcs fell short
  const foot = buildFoot(g, K.unitH - footH + 0.5);
  const cx = (i: number) => fx0 - K.gridGap + (i + 0.5) * K.gridPitch, cy = (j: number) => fy0 - K.gridGap + (j + 0.5) * K.gridPitch;
  const feet: M[] = [], pockets: M[] = [];
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
    feet.push(foot.translate([cx(i), cy(j), z0]));
    // No fit on the magnet pockets: 6.5 x 2.4 is the Gridfinity figure for a 6 x 2 magnet,
    // so the 0.5 and the 0.4 are already the clearance, and a magnet wants interference.
    if (magnets) for (const sx of [1, -1]) for (const sy of [1, -1]) {
      const mx = cx(i) + sx * K.magnetPitch / 2;
      if (d.split && Math.abs(mx) < K.magnetR + 1) continue; // half a pocket a side holds nothing
      pockets.push(g.cyl(K.magnetR, K.magnetDepth + 1, mx, cy(j) + sy * K.magnetPitch / 2, z0 - 1));
    }
  }
  const clip = g.prismZ(outline, K.unitH, z0);
  const floor = g.isect(g.union(feet), clip);
  const skirt = skirtCS.isEmpty() ? null : g.prismZ(skirtCS, K.unitH, z0);
  clip.delete(); foot.delete(); lane.delete(); outline.delete(); skirtCS.delete();
  for (const f of feet) f.delete();
  return { floor, skirt, pockets };
}
