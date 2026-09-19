import { test, expect } from "bun:test";
import Module from "manifold-3d";
import { Geo } from "../src/geometry";
import { refParts } from "../ref";

const wasm = await Module(); wasm.setup();
const parts = refParts(new Geo(wasm));

// Every plate prints as modelled, so a face that points down and is not on the bed is
// an overhang the slicer will want to support. The flat-pack rule in one number: none
// flatter than 45°. The dovetail rib and groove lean 56°, and a Gridfinity pocket's
// lower chamfer sits on the line at 45° as the spec draws it; those are the only
// downward faces meant to exist. A bridge or a flat underside is a joint on the wrong face.
const STEEPEST_OVERHANG = Math.cos(Math.PI / 4) + 1e-4; // |n.z| of a 45° face, 0.01° of noise allowed
function overhangArea(mesh: (typeof parts)[string]): number {
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
    if (len < 1e-9 || nz / len > -STEEPEST_OVERHANG) continue; // up, vertical, or steeper than 45°
    if (p.every(([, , z]) => Math.abs(z - zMin) < 1e-3)) continue; // on the bed
    area += len / 2;
  }
  return area;
}

for (const [name, mesh] of Object.entries(parts)) {
  test(`${name} has no downward face off the bed`, () => {
    expect(overhangArea(mesh)).toBe(0);
  });
}
