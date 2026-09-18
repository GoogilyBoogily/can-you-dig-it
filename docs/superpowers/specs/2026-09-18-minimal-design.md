# Minimal-filament design

A second lane design, picked from a Design select next to the honeycomb options. Same
joints, same dimensions, same solver output as the standard design; what carried nothing
is gone. Solid volume per lane is about half. The lane still has its hexagons.

## Why the standard design is heavier than it looks

The standard lane is already a lattice, but three of its members are sized for looks or
for margin rather than for load:

- The deck rails are 20 mm wide. A necked can is widest at its body, which stops about
  12 mm short of each end, so with the full 3.5 mm of side play the body edge lands at
  `IW/2 − 15.5`: only the inner 5 mm of each rail ever carries a can.
- The wall web is 3.5 mm. The tier above rests on the top chord and goes down the
  vertical hex ligaments; at 1.7 mm (four 0.42 mm lines, two perimeters a side, no
  infill) a 2.2 × 1.7 × 22 mm ligament takes ~37 N before it buckles, and there are
  about thirty per wall against ~30 N of cans.
- The high-end wall is solid, but it only closes the chute of the tier above. A can's
  axis runs along Y, so wherever it touches that wall its contact line crosses every
  vertical ligament; it cannot sag into a cell.

## Geometry

Every divergence is `o.design === "minimal"` inside the `!o.solid` block of `buildLane`
and one branch in `buildCover`. `solve()` is untouched, so `IW`, `OW`, `gangPitch`, `H`
and the hex sizing are shared, the solver ranks the same layouts, and a minimal lane
gangs with a standard one in the same shelf. `solid` overrides `design`.

| member | standard | minimal |
|---|---|---|
| wall web | 3.5 mm | 1.7 mm (`K.ligMin`) |
| deck rails | 20 mm strips against the walls | 2.5 mm fins at the inner edge of the standard rail; the strip between fin and wall is open |
| interior ties | 8 mm | 2.5 mm, wall to wall |
| lip and splice ties | 10 mm each side | same: pocket walls and the tongue live there |
| high-end wall | solid | hex through-cut on the top row, outer face recessed to 1.7 mm with the 45° ceiling |
| cover | whole cells at 1.4 R, bars 0.5 R | cells at 2 R on the ligament rule, running to the frame and clipped there |

The fins stand on the bed, so a can loads them in compression and nothing bridges. The
ties are full wedge height and hold the fins upright every ~80 mm. The end wall's bottom
row is dropped through the keep-out mechanism, since a cell there would notch the deck's
end block; on a top lane the loading lip is too low for any cell and gets the recess only.

Untouched in both designs: top chord (seat and peg pads), bottom border (the peg sockets
sit in it), dovetail bands, splice lap band, pegs, lip, risers, rounding.

The cover clips because whole cells leave the open area to luck: how many fit between
the pegs and the window swings with the can, and a sweep of radii gave anything from
0.62× to 1.19× the standard opening. Clipped, the opening is the cell's own 83 % of the
field at any radius.

## Filament model

`filamentGrams` had no skins: anything wider than two perimeters counted as 6 % infill,
so a 2.4 mm cover plate read 30 g against the ~100 g a slicer prints, and most of what
minimal removes was "6 %" to it. The core is now what sits inside the perimeters with
1 mm of material above and below. With skins the default top lane is 312 g standard and
252 g minimal; bottom 371 / 292; cover 128 / 89. The layout cards' `gramsEst` and the
regression window are re-based on those numbers.

## UI

`<select name="design">` in the Options fieldset, Standard / Minimal filament. Rides the
same FormData, hash and rebuild path as the preset select; an unknown value in a shared
hash leaves the select blank and the status line says so, as it does for a bad number.

## Tests

Unit: `ref.json` gains `minimal-lane-*` and `minimal-cover-*` snapshots; every standard
key is unchanged. Solid-volume ratios minimal/standard are pinned below 0.6 (top lane),
0.55 (bottom) and 0.75 (cover) so material cannot creep back unnoticed. The minimal
cascade cover still opens at the loading end. `test/splice.test.ts` probes the deck
behind the seam, which the tie-band merge this design depended on made solid.
