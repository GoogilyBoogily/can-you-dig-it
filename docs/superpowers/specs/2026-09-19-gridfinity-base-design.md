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

The lane keeps the length its cans need; the floor is whole cells round it, in both
axes, and two selects say where the lane sits on that floor: across (left, centre,
right - left is +Y, seen from the front) and along (front, centre, back - front is
the lip end). Flush with an edge, the spare goes to the other side, so a lane can
stand in the corner of a drawer's baseplate; centred keeps it symmetric. Nine
positions, defaults centre/centre.

The lane always lands on the grid. When the shelf has no room for the cells that
would cover the lane - a 150 mm shelf under a 138 mm lane, which wants four cells,
167.5 - the solver keeps the floor to the cells that fit (`floorCells`, three here)
and the lane overhangs it: the walls stand on a skirt, the lane's outline minus the
cell region, solid from the floor down to the shelf beside the baseplate. Nothing
overhangs, the feet's run-on chamfers merge into it, and the baseplate must end at the
lane's cells on that side. The same rule shortens the floor along the lane when the
shelf is shorter than the cells that would cover it.

Lane and floor together are what has to fit the bed. It splits at x = 0 with the deck, and the
seam runs through a foot as often as not: a foot cut square by the dovetail seam
prints as it is (the cut face is vertical), the tongue carries floor and foot chunk
with it, and the baseplate pocket locks the two halves. Magnet pockets the seam would
halve are skipped. On a 256 mm bed a default can's 480 mm lane needs twelve cells,
503.5 mm, and no alignment gets a half under 250: six cans, 410 mm on ten cells, is
the longest that prints. The solver drops any lane whose floor outruns the shelf and
reports the floor as the footprint.

## Geometry

`buildGridDeck` is `buildDeck` plus a floor slab from z = −7 to 0, a foot at every
cell centre, four bosses at (±px, ±piny), and the lip pocket carried 1 mm into the
floor (the lip's 5 mm tab stood 0.58 mm proud of the pan; on a shelf nobody noticed).
Every existing cut stops at z = 0 because the deck's underside is one plane there
with the wall bottoms. Feet are hulls of the profile's rounded rectangles, so the 45°
faces are exact and the corners concentric; `extrude` with a scale would square the
top corner and bind in a r4 pocket. The upper chamfer runs on 2 mm past the profile:
neighbouring feet then meet in a 45° ridge across the 0.5 mm gap and the pit between
four rounded corners closes 1.9 mm up. The chamfers run through the whole 2.25 mm and
past it, and the outline prism clips them flat at the deck's underside, so the merged
run-ons are the floor: no slab, and nowhere a flat underside. Stopped at the profile,
every gap and pit would have had a flat ceiling of floor over it; a slab starting 0.1 mm
above the last pit left slivers where the 24-segment arcs fell short. The run-on
is clipped at the bin's edge, so the outline stays `n·42 − 0.5`. The outline's r3.75
corners are squared only where the lane's own corner lands on one: flush in a corner,
a deck ear would otherwise hang a square millimetre over the round.

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
