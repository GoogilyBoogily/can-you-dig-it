import { test, expect } from "bun:test";
import Module from "manifold-3d";
import { Geo } from "../src/geometry";
import { refParts } from "../ref";

const wasm = await Module(); wasm.setup();
const parts = refParts(new Geo(wasm));

// A part is one solid. A second island is a feature that lost its root to a cut - it
// prints as a loose chip beside the plate and the joint it was for has nothing to hold.
// The minimal deck's interior ears once did exactly that: the strip cut opened the deck
// under them and the tab hole took the last 1 mm neck.
for (const [name, mesh] of Object.entries(parts)) {
  test(`${name} is one piece`, () => {
    expect(mesh.decompose().length).toBe(1);
  });
}
