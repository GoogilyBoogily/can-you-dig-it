# Reeded pattern: the Japandi face

> **Not built.** This design was written and never implemented: nothing in `src/`,
> `index.html` or `test/` refers to it. Read it as a proposal, not as a description of
> the app. (Noted 2026-09-19, during the correctness audit.)

A sixth `pattern`, `reeded`. No holes in the walls: the outer recess keeps a run of
vertical ribs, flush with the border, so the standing wall reads as a framed reeded panel.
The cover is the slat grille. Everything else is the standard or minimal lane.

## Why

The Japandi organisers that sell on MakerWorld are two things: a kumiko lattice, which the
pattern axis already has, and a plain body whose only ornament is fine vertical ribs
(Japandi Tissue Box "Aura", https://makerworld.com/en/models/2624554; Moku rail,
https://makerworld.com/en/models/1972778; the fluted planters). Ribs and holes together
have no reference and would read as busy, so reeded is a pattern value, not a second
axis: one select, no combinations to test or explain.

The one flat-printed reeded reference (Cults3D fluted glass panel) prints the flutes on
the top face, which is exactly a rib growing up from the print face: legal under the
flat-pack rule, no overhang, and it stiffens the web.

## Geometry

Today the outer face of a wall is pocketed over the lattice field to a web of 3.5 mm
(standard) or 1.7 mm (minimal), with pads left round every ear notch and the end-wall
notch. Reeded cuts the same pocket less a comb of ribs:

- Rib width 1.2 mm (three 0.42 mm lines), pitch 3.5 mm, so a 2.3 mm groove between ribs.
  Under 0.8 mm the slicer drops a rib; under a 1 mm groove it fills one.
- Rib height is the recess depth, `rd = wall − web`: 2.5 mm standard, 4.3 mm minimal.
  Rib tops sit in the outer face plane with the border and the pads.
- Ribs run vertically when the wall stands (along Z in the lane frame), the full height
  of the pocket, bottom border included, so they meet the shelf like the reference.
- The comb is one set of stripes centred on x = 0 across the whole wall, subtracted from
  each recess face component in turn (`face.subtract(comb)` where the recess cut takes
  `face` today). Centring on the lane, not the component, keeps the rhythm continuous
  across the splice band and symmetric end to end.
- Nothing is cut through: `cellsOf("reeded", …)` returns `null`, and the wall keeps the
  hex field bottom (there is no edge to bridge a notch).
- End wall: the same comb across its recess, ribs along Z. Cover: `cellsOf` maps
  `reeded` to the slat cells and `ROWS.reeded = ROWS.slat`, so the grille radius and the
  three-row rule are the slat's. Linear top, linear sides.

Standard wall mass lands between the lattice and the solid: the ribs put back about a
third (1.2 / 3.5) of what the pocket removes. `filamentGrams` works from the mesh and
needs no change; the solver's per-design gram guess stays.

`hexR` / "Cell size" still sizes the cover's slats; it does nothing to a reeded wall.
That is the existing behaviour of `solid` and is left alone.

## Tests

- `test/pattern.test.ts`: the "cuts the walls" case excludes `reeded` (no holes); a new
  case pins reeded wall volume strictly between the hex wall and the solid wall, and a
  probe slab 0.5 mm thick in the outer face plane over the field carries 30–40 % of its
  own volume (rib fraction 1.2 / 3.5 = 34 %).
- `ref.ts` loop picks it up (top lane + cover); `overhang.test.ts` holds the ribs to the
  45° rule for free.
- `cover.test.ts` pattern loop picks it up.

## Interface

`PATTERNS` gains `"reeded"`; the select gets "Reeded"; the `main.ts` error string names
it. Hash and Share carry it already. CLAUDE.md pattern bullet: one sentence.

## Order

One commit after the gang/plinth work on `src/geometry.ts` lands: pattern value, comb in
`buildWall` and `buildEndWall`, cover mapping, tests, `bun run ref` with the diff read
(only `reeded-*` keys added).
