# Gridfinity base

A third base under the lane, next to flat and 24 mm feet: the bottom deck on Gridfinity
feet, so the lane drops into a baseplate like a bin. Picked from a Base select; a Magnet
pockets checkbox and two alignment selects ride on it.

## What Gridfinity is, in numbers

42 mm pitch, 7 mm height unit. A bin is `n·42 − 0.5` across (0.25 mm to the cell each
side) and carries one foot per cell. A foot, bottom up: a 35.6 mm square flat, a 0.8 mm
45° chamfer, 1.8 mm vertical, a 2.15 mm 45° chamfer, 41.5 mm at the top, 4.75 mm in
all; corners concentric, 3.75 at the top. Magnets are 6 × 2 mm on a 26 mm square in
every cell.

The official page pins only the magnets; the profile is from the community spec on
Printables and the generators that implement it (gridfinity-layout-tool PRs #4251 and
#4291, the Fusion generator, the 1fifoto CNC gadget).

## The feet, and only the feet

The grid is the user's: a stock baseplate, or one they print. We make the part that
drops into it. A cut in between generated a baseplate too, pockets and all, once with a
solid pad under the lanes; it made the lane something that only fit our plate, and on a
150 × 304 shelf the plate was a slab with nothing Gridfinity about it. Gone.

The lane's feet grow from the bottom deck's underside - the one face of the lane that
already prints the way a bin does, feet down. Walls print flat and cannot carry them.
The deck rides on a 7 mm unit: 4.75 of foot proud under every cell of its floor, 2.25
of floor, with the riser's boss at ±px for the walls, which stand on the floor and
locate as they do on a riser. The floor is the whole cells that cover the lane (a
138 mm lane wants four, 167.5), or as many as the shelf has when that is fewer: then
the lane overhangs its feet and the walls stand on a skirt, the lane's outline minus the
cell region, solid down to the shelf beside the baseplate's edge. A 138 mm lane goes on
three cells in a 150 mm shelf; the baseplate must end at those cells on that side.
Lanes go a floor apart (`floorCells · 42`); the gang dovetails are off, the baseplate is
the joint.

Alignment: across (left, centre, right - left is +Y, seen from the front) and along
(front, centre, back - front is the lip end) say which edge of its floor the lane is
flush with; the spare goes to the other side, so a lane can sit against the cells its
neighbours use. Centred keeps it symmetric.

Lane and floor together are what has to fit the bed. They split at x = 0 with the
deck, through a foot as often as not: a foot cut square by the dovetail seam prints as
it is, the tongue carries floor and foot chunk with it, and the pocket locks the halves.
Magnet pockets the seam would halve are skipped. On a 256 mm bed a default can's 480 mm
lane wants twelve cells, 503.5, too long in halves; on a ten-cell shelf its floor stops
at 420 and the lane's own 480 splits to 248, ends on skirts. The solver charges the
unit's height, 7 mm.

Magnets are 6 × 2 on the 26 mm square, 6.5 × 2.4 pockets in every foot, opening down
like every bin's. Their ceilings are 6.5 mm bridges, the one flat underside the lane
has, and the overhang test allows exactly those on the magnet part.

## Geometry

Feet are hulls of the profile's rounded rectangles, so the 45° faces are exact and the
corners concentric; `extrude` with a scale would square the top corner and bind in a
r4 pocket. The upper chamfer runs on through the whole 2.25 mm floor and past it, and
the outline prism clips it flat at the deck's underside: neighbouring feet meet in a
45° ridge across the 0.5 mm gap, the pit between four rounded corners closes 1.9 mm up,
and the merged run-ons are the floor - no slab, nowhere a flat underside. A slab that
started 0.1 mm above the last pit left slivers where the 24-segment arcs fell short. The
run-on is clipped at the bin's edge, so the outline stays `n·42 − 0.5`; where the lane
overhangs, the skirt fills to the lane's edge and the run-on merges into it.

`splitDeck` takes the deck's bottom z so the dovetail runs through floor and pan and the
rear half's tongue stands on the bed. `PartSet.gridDeck` is the deck of the lane on the
shelf - `bottom` in a cascade, `top` in a flat stack.

## Tests

`test/overhang.test.ts` holds the rule at "flatter than 45°" (`<` with 0.01° of noise
allowed): the foot's chamfers sit on the line. Magnet pocket ceilings are skipped only
at their own z on the magnet part. `test/gridfinity.test.ts` pins the floor and its
alignment, the foot profile, the boss in the wall's notch, the skirt, the magnet volume
and the seam skip, and the solver's height and footprint.
