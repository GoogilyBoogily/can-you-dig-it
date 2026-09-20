import { test, expect } from "bun:test";
import { K } from "../src/geometry";
import { fitParts, snapshotParts } from "./geo";

const parts = snapshotParts();

// Every plate prints as modelled, so a face that points down and is not on the bed is
// an overhang the slicer will want to support. The flat-pack rule in one number: none
// flatter than 45°. The dovetail rib and groove lean 56°, and the Gridfinity foot's
// chamfers sit on the line at 45° as the spec draws them; those are the only downward
// faces meant to exist. A bridge or a flat underside is a joint on the wrong face - bar
// one: a magnet pocket's ceiling is a 6.5 mm bridge, the way every bin prints it, so a
// magnet part may have flat faces at the pocket depth and nowhere else.
const STEEPEST_OVERHANG = Math.cos(Math.PI / 4) + 1e-4; // |n.z| of a 45° face, 0.01° of noise allowed
const MAGNET_CEILING = -K.unitH + K.magnetDepth; // the unit hangs below the deck, the pocket rises into it
function overhangArea(mesh: (typeof parts)[string], magnets = false): number {
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
    if (magnets && p.every(([, , z]) => Math.abs(z - MAGNET_CEILING) < 1e-3)) continue;
    area += len / 2;
  }
  return area;
}

for (const [name, mesh] of Object.entries(parts)) {
  test(`${name} has no downward face off the bed`, () => {
    expect(overhangArea(mesh, name.includes("magnets"))).toBe(0);
  });
}

// The flat-pack rule has to hold at a widened fit too. fieldBottom is K.deckLo + K.dtCl +
// o.fit + K.padRise for every pattern but hex, so fit moves where the lattice starts and
// can walk a cell onto an ear notch or a bottom border; the notches and pockets it widens
// can turn a wall into a bridge.
for (const [name, mesh] of Object.entries(fitParts())) {
  test(`${name} has no downward face off the bed at fit 0.3`, () => {
    expect(overhangArea(mesh, name.includes("magnets"))).toBe(0);
  });
}
