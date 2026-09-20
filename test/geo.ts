// One WASM boot and one snapshot build for every geometry test file. bun runs the whole
// suite in one process and caches modules, so this evaluates once however many files
// import it.
import Module, { type Manifold } from "manifold-3d";
import { K, Geo } from "../src/geometry";
import { refParts } from "../ref";

const wasm = await Module(); wasm.setup();
export const geo = new Geo(wasm);

let snapshot: ReturnType<typeof refParts> | undefined;
/** The snapshot parts, built once and shared by regress, islands and overhang. */
export const snapshotParts = () => (snapshot ??= refParts(geo));

// Every clearance in the file is K.cl + o.fit, and no built part has ever seen a
// non-zero fit: ref.json is all fit 0, so the six call sites are snapshotted at one
// value. A widened fit moves tab holes, wall notches, both lip pockets, both splice
// sockets and - through fieldBottom - the lattice start on four of five patterns. These
// are held to properties, not to stored numbers, so no snapshot key is added.
let fitted: ReturnType<typeof refParts> | undefined;
export const fitParts = () => (fitted ??= refParts(geo, { fit: 0.3 }));

// Every plate prints as modelled, so a face that points down and is not on the bed is
// an overhang the slicer will want to support. The flat-pack rule in one number: none
// flatter than 45°. The Gridfinity foot's chamfers sit on the line at 45° as the spec
// draws them, and those are the only downward faces meant to exist; every joint is
// straight-sided. A bridge or a flat underside is a joint on the wrong face - bar
// one: a magnet pocket's ceiling is a 6.5 mm bridge, the way every bin prints it, so a
// magnet part may have flat faces at the pocket depth and nowhere else.
const STEEPEST_OVERHANG = Math.cos(Math.PI / 4) + 1e-4; // |n.z| of a 45° face, 0.01° of noise allowed
const MAGNET_CEILING = -K.unitH + K.magnetDepth; // the unit hangs below the deck, the pocket rises into it
export function overhangArea(mesh: Manifold, magnets = false): number {
  const { vertProperties: v, triVerts: t, numProp } = mesh.getMesh();
  const zMin = mesh.boundingBox().min[2];
  let area = 0;
  for (let i = 0; i < t.length; i += 3) {
    const p = [0, 1, 2].map((k) => {
      const at = t[i + k] * numProp;
      return [v[at], v[at + 1], v[at + 2]];
    });
    const [ax, ay, az] = [p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2]];
    const [bx, by, bz] = [p[2][0] - p[0][0], p[2][1] - p[0][1], p[2][2] - p[0][2]];
    const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    const len = Math.hypot(nx, ny, nz);
    // a sliver of three near-collinear points (a kumiko diagonal meeting a pad edge, 1e-4
    // mm²) has a normal that is float noise, not a face
    if (len < 2e-3 || nz / len > -STEEPEST_OVERHANG) continue; // degenerate, up, vertical, or steeper than 45°
    if (p.every(([, , z]) => Math.abs(z - zMin) < 1e-3)) continue; // on the bed
    if (magnets && p.every(([, , z]) => Math.abs(z - MAGNET_CEILING) < 1e-3)) continue;
    area += len / 2;
  }
  return area;
}
