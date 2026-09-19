import { test, expect } from "bun:test";
import { snapshotParts } from "./geo";

const parts = snapshotParts();

// A part is one solid. A second island is a feature that lost its root to a cut - it
// prints as a loose chip beside the plate and the joint it was for has nothing to hold.
// The minimal deck's interior ears once did exactly that: the strip cut opened the deck
// under them and the tab hole took the last 1 mm neck.
for (const [name, mesh] of Object.entries(parts)) {
  test(`${name} is one piece`, () => {
    expect(mesh.decompose().length).toBe(1);
  });
}
