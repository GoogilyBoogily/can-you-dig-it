import { test, expect } from "bun:test";
import { fitParts, snapshotParts } from "./geo";

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

// If refParts ignored its override these 216 tests would silently be a second copy of the
// snapshot ones, passing and proving nothing. fit widens every tab hole, so the deck has
// to lose material.
test("the fit 0.3 build is actually a different build", () => {
  expect(fitParts()["lane-top-deck-front"]!.volume()).toBeLessThan(parts["lane-top-deck-front"]!.volume());
});

// Same parts at fit 0.3, which no snapshot covers. fit widens every tab hole, both lip
// pockets and both splice sockets, and any of those can cut a feature off its root: the
// deck's ear is held by 1 mm inside a 2.5 mm tie, and the hole through it grows with fit
// from both sides. Properties, not stored numbers, so ref.json is untouched.
for (const [name, mesh] of Object.entries(fitParts())) {
  test(`${name} is still one piece at fit 0.3`, () => {
    expect(mesh.decompose().length).toBe(1);
  });
}
