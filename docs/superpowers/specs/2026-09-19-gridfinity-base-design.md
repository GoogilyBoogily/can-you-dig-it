# Gridfinity base

A third base under the lane, next to flat and 24 mm feet: the lane drops into a
Gridfinity baseplate like any bin. Picked from a Base select; a Magnet pockets checkbox
rides on it.

## What Gridfinity is, in numbers

42 mm pitch, 7 mm height unit. A bin is `n·42 − 0.5` across (0.25 mm to the cell each
side) and carries one foot per cell. A foot, bottom up: a 35.6 mm square flat, a 0.8 mm
45° chamfer, 1.8 mm vertical, a 2.15 mm 45° chamfer, 41.5 mm at the top, 4.75 mm in
all. The corners are concentric: 3.75 mm at the top, 1.6 after the lower chamfer, 0.8
at the flat. Magnets are 6 × 2 mm on a 26 mm square in every cell.

The official page pins only the magnets; the profile is from the community spec on
Printables and the generators that implement it (gridfinity-layout-tool PRs #4251 and
#4291, the Fusion generator, the 1fifoto CNC gadget).

## Where the feet go

Walls print flat, so feet can only grow from the bottom deck's bed face - the one face
of the lane that already prints the way a bin does, underside down. The bottom-tier
deck becomes the base: the ordinary deck on top, a 7 mm unit under it (2.25 mm floor,
4.75 mm feet), as wide as whole cells. Walls stand on the floor, inside its edge, on
the same bosses a riser offers into the wall's bottom notch at ±px. No separate tray:
one part fewer to print and nothing to lose.

Whole cells, not the lane's outline: a floor that overhangs its last foot is a flat
ceiling off the bed, and the baseplate's frame sits under it anyway. So a 138 mm lane
gets a 4-cell floor (167.5) and gang pitch snaps to `ny·42` (141 → 168). Gang
dovetails go away in this mode: the walls are 30 mm apart and the baseplate is the
gang joint. A 305 mm shelf holds one such lane where it held two plain ones; that is
the price of the grid, and the reason this is a select and not the default.

Lane length snaps up to whole cells per can count - under 42 mm of extra deck, less
than a can - and a split lane keeps an even count so the seam is a cell line. On a
256 mm bed a half carries 5 cells, so the lane tops out at 419.5 mm.

## Geometry

`buildGridDeck` is `buildDeck` plus a floor slab from z = −7 to 0, a foot at every
cell centre, four bosses at (±px, ±piny), and the lip pocket carried 1 mm into the
floor (the lip's 5 mm tab stood 0.58 mm proud of the pan; on a shelf nobody noticed).
Every existing cut stops at z = 0 because the deck's underside is one plane there
with the wall bottoms. Feet are hulls of the profile's rounded rectangles, so the 45°
faces are exact and the corners concentric; `extrude` with a scale would square the
top corner and bind in a r4 pocket. The upper chamfer runs on 2 mm past the profile:
neighbouring feet then meet in a 45° ridge across the 0.5 mm gap, the pit between four
rounded corners closes 1.9 mm up, and the floor slab starts above that. Stopped at the
profile, every gap and pit would have had a flat ceiling of floor over it. The run-on
is clipped at the bin's edge, so the outline stays `n·42 − 0.5`.

The split keeps the tongue: `splitDeck` takes the deck's bottom z so the dovetail runs
through floor and pan and the rear half's tongue stands on the bed.

`PartSet.gridDeck` is the deck of the lane on the shelf - `bottom` in a cascade, `top`
in a flat stack. Walls, end wall and lip are the role's own; nothing is duplicated.

## Tests

`test/overhang.test.ts` holds the rule at "flatter than 45°": the foot chamfers sit on
the line and the test now says so (`<` with an epsilon). Magnet pocket ceilings are
6.5 mm bridges, the second intended exception after the dovetail flanks, skipped only
at their own z on the magnet part. `test/gridfinity.test.ts` pins the foot, the outline,
the boss in the notch, the magnet volume and the solver's snapping.
