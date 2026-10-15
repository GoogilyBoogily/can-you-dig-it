import { test, expect } from "bun:test";
import { DEFAULTS, K, solve, laneOf, buildDeck, buildAll, buildLip, stand, lipPose } from "../src/geometry";
import { geo, overhangArea } from "./geo";

test("the lip seats without intersecting the deck while its tabs stay flush", () => {
  for (const slope of [0, 3, 7, 10]) for (const fit of [-0.2, 0, 0.3])
    for (const design of ["standard", "minimal"] as const) for (const solid of [false, true])
      for (const cascade of [false, true]) for (const base of ["flat", "gridfinity"] as const) {
        const options = { ...DEFAULTS, slope, fit, design, solid, cascade, base, length: 200 };
        const derived = solve(options);
        geo.arena(() => {
          const lane = laneOf(options, derived, cascade ? "bottom" : "top");
          const deck = base === "gridfinity" ? buildAll(geo, options, derived).gridDeck!.whole! : buildDeck(geo, options, derived, lane);
          const printedLip = buildLip(geo, options, derived);
          const seatedLip = stand(printedLip, lipPose(-derived.L / 2, derived.tan));
          const context = JSON.stringify({ slope, fit, design, solid, cascade, base });
          expect(geo.isect(deck, seatedLip).volume(), context).toBeLessThan(1e-5);
          expect(seatedLip.boundingBox().min[2], context).toBeCloseTo(0, 6);
          expect(seatedLip.boundingBox().max[2], context).toBeCloseTo(K.deckLo + K.lipInset * derived.tan + K.lipH, 6);
          expect(printedLip.status(), context).toBe("NoError");
          expect(printedLip.decompose().length, context).toBe(1);
          expect(overhangArea(printedLip), context).toBe(0);
        });
      }
}, 60_000);
