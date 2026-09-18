# Pattern axis: circles, kumiko, slats and breeze block alongside the honeycomb

A `pattern` option next to Design. It picks the perforation of the side walls, the
high-end wall and the cover, and nothing else: the joints, `solve()`, the solver's layouts
and the two designs are untouched. `solid` still blanks every pattern.

## Why

A survey of MakerWorld, Printables, Thingiverse and Cults3D (2026-09-18) found can
dispensers in five looks: a bare open frame, truss or stadium cut-outs in a slab, the
honeycomb, a plain slab, and one X-lattice pantry crate with a label window. Every one is
a single colour. No configurator offers slats, round perforation, a kumiko lattice or a
mid-century screen block, and the kumiko organisers are the best-selling family of desk
storage on MakerWorld. The current lane is one of the five, and the one the most models
already share.

References, for the look each pattern is after:

- Slats: zach13, Stackable Can Dispenser, flat-pack rails, https://makerworld.com/en/models/93222
- Kumiko: KL Worx, https://makerworld.com/en/models/1275973 and Meyui,
  https://makerworld.com/en/models/1258888; the generator at
  https://makerworld.com/en/models/1203766 for the goma and asanoha bar geometry
- Round perforation: Flex Box hole selector, https://makerworld.com/en/models/2403851
- Breeze block: Clay Imports pattern library,
  https://clayimports.com/blogs/blog/introducing-3d-design-files-for-breeze-blocks

Two things the research ruled out for this spec. Fuzzy skin does nothing to a plate
printed face up: Bambu applies it to wall paths only, and the face you see is a top
surface. And a reeded (Japandi) face is a relief, ribs growing up from the print face,
which is a different axis from perforation; it gets its own spec. Per-object slicer
settings (`top_surface_pattern`, ironing, a second extruder) are likewise separate.

## The rule every pattern passes

A pattern is an in-plane through-cut with vertical walls, so it prints flat without
supports and `test/overhang.test.ts` holds it like the hexagons. For the cell patterns the
honeycomb's rules carry over as they are: whole cells only, centred in the panel, and a
cell touching a keep-out (dovetail band, splice band, end notch) is dropped, not clipped.
Slats are the exception; see below.

## Geometry

`Geo.cells(lattice, bounds, holes, cell)` is the honeycomb's field-and-keep-out loop with
the cell shape passed in. `hexCells` is a wrapper over it; its output does not move.
`cellsOf(pattern, R, lig, panel, keep)` dispatches. `R` is `d.hexR`, still named for the
honeycomb, now the cell radius of whatever pattern is chosen; `hexAuto` still sizes it so
three whole rows fill the upper-deck wall. Each pattern states how far three rows span as
`a·R + b·lig`, and `autoR(panelH, [a, b])` inverts it.

| pattern | cell | lattice | rows `[a, b]` |
|---|---|---|---|
| hex | regular pointy-top hexagon, as before | √3·P by 1.5·P, staggered | `[5, √3]` |
| circle | circle of radius R | (2R + lig) by (√3/2)(2R + lig), staggered | `[2 + 2√3, √3]` |
| kumiko | square of side 2R less one diagonal bar, width lig; the diagonal alternates on `(i + j) % 2` | (2R + lig) square | `[6, 2]` |
| breeze | quatrefoil: four circles of 0.6R centred at (±0.4R, ±0.4R), lobe tips at ±R so the bar between cells is exactly lig | (2R + lig) square | `[6, 2]` |
| slat | stadium 2R tall with R end radius, running the width of its field component; rails 2·lig | rows at 2R + 2·lig | `[6, 4]` |

At `DEFAULTS` (panel 84 mm, less the lift below) the radii come out 15.68 (hex, unchanged),
13.85 (circle), 12.58 (kumiko and breeze) and 11.94 (slat, 23.9 mm openings between
4.1 mm rails).

Kumiko alternates its diagonal so the two side walls read the same from outside (one
direction would mirror to `/` on one wall and `\` on the other) and so the bars brace the
panel in both shear directions. The bar is one ligament wide. On the minimal design that
is a 1.7 × 2.1 mm strut 35 mm long; it meets the four-line floor and ships as is. If it
snaps in print, widen the kumiko bar in one place.

Slats cannot be dropped whole, since one opening spans the field, so `buildWall` cuts them
per component of `panel − keep`, the loop the outer recess already runs, and skips any
component narrower than 4R. That is what keeps them out of the 10.5 mm strips beside the
dovetail bands and away from the end notch. Rails are two ligaments, not one: a
200 mm rail on a 3.5 mm web at 2.1 mm wide would flex in the standing wall, and 4 mm is
the reference look.

### The field lift

A wall's ear notches top out at `notchH` = 4.25 mm and the honeycomb field starts at the
5 mm border. The honeycomb gets away with that because only a 60° tip can land over a
notch. A square's or a slat's bottom edge, or a circle's chord, would be a 1.25 mm bridge
across a 12.5 mm notch. So for every pattern but hex the wall field starts at `notchH + 4`,
the top of the recess pads that already guard the tab roots, and `solve()` sizes the
cells for the shorter panel. Hex keeps the border so the snapshot does not move; the two
field bottoms are a deliberate asymmetry, to be collapsed if hex is ever re-snapshotted
for another reason. The end wall has no notches and keeps its border.

### Cover

The grille radius follows the pattern's rows, `coverR = (OW − 29) / (a + b/2)`, bars
`coverR / 2` as now; hex is identical. The minimal design's clipped 1.5× sheet works for
circle, kumiko and breeze. A slat clipped to the grown field is a square-ended slot that
ignores the rail count, so the slat cover takes the standard path on both designs. Slats
run along the cover's length; an unsplit slat cover has no cross-bar and is floppy. That
ships as is; a mid-bar is out of scope.

## Interface

`Options.pattern: Pattern`, default `"hex"`. A `<select name="pattern">` beside Design:
Hex, Circles, Kumiko, Slats, Breeze block. It is in the hash and in Share. `main.ts`
rejects an unknown value the way it rejects an unknown design. "Hex cell" becomes
"Cell size"; "Solid walls instead of honeycomb" becomes "Solid walls, no pattern".
`hexR`/`hexAuto` keep their names in the form, hash and `LIMITS`.

The solver's gram estimates stay per design; a pattern changes the mass by less than the
guess is good for.

## Tests

`ref.ts` snapshots, per new pattern, the top lane and the cover of a two-tier build;
`regress` and `overhang` cover them for free. `test/pattern.test.ts` checks that each
pattern cuts something (volume below the solid part), that a non-hex wall is solid over
every ear notch through `notchH + 4`, that every wall is solid across the splice band at
480 mm, and that the auto radius lands in `[8, 16]` with three rows inside the panel.
`cover.test.ts` runs its dropped-can window check over every pattern.
