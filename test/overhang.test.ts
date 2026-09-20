import { test, expect } from "bun:test";
import { fitParts, snapshotParts, overhangArea } from "./geo";

const parts = snapshotParts();

for (const [name, mesh] of Object.entries(parts)) {
  test(`${name} has no downward face off the bed`, () => {
    expect(overhangArea(mesh, name.includes("magnets"))).toBe(0);
  });
}

// The flat-pack rule has to hold at a widened fit too. fieldBottom is K.deckLo + K.cl +
// o.fit + K.padRise for every pattern but hex, so fit moves where the lattice starts and
// can walk a cell onto an ear notch or a bottom border; the notches and pockets it widens
// can turn a wall into a bridge.
for (const [name, mesh] of Object.entries(fitParts())) {
  test(`${name} has no downward face off the bed at fit 0.3`, () => {
    expect(overhangArea(mesh, name.includes("magnets"))).toBe(0);
  });
}
