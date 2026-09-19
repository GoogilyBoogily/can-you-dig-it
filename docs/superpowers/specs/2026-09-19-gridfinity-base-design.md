# Gridfinity base

A third base under the lane, next to flat and 24 mm feet: a Gridfinity baseplate for the
shelf, and the lane's bottom deck on Gridfinity feet that drop into it like a bin.
Picked from a Base select; a Magnet pockets checkbox and two alignment selects ride
on it.

## What Gridfinity is, in numbers

42 mm pitch, 7 mm height unit. A bin is `n·42 − 0.5` across (0.25 mm to the cell each
side) and carries one foot per cell. A foot, bottom up: a 35.6 mm square flat, a 0.8 mm
45° chamfer, 1.8 mm vertical, a 2.15 mm 45° chamfer, 41.5 mm at the top, 4.75 mm in
all; corners concentric, 3.75 at the top. A baseplate pocket is the foot in negative
0.25 bigger all round: 42 at the rim, 2.15 chamfer, 1.8 wall, 0.7 chamfer to 36.3,
4.65 deep, r4 at the rim. Magnets are 6 × 2 mm on a 26 mm square in every cell.

The official page pins only the magnets; the profile is from the community spec on
Printables and the generators that implement it (gridfinity-layout-tool PRs #4251 and
#4291, the Fusion generator, the 1fifoto CNC gadget).

## Two parts

**The baseplate** is the whole cells the shelf has room for, `floor(depth / 42) ×
floor(width / 42)`, a pocket in every one, in tiles at cell lines that fit the bed and
just butt - at a cell line the rim is a knife edge, there is nothing to key, and the
lane standing across a seam holds it. Other bins go in the cells the lanes do not use.
With magnets it gets a 3.2 mm floor under the pockets, 6.5 × 2.4 pockets on the 26 mm
square in every cell, 0.8 mm of skin below.

**The lane's feet** grow from the bottom deck's underside - the one face of the lane
that already prints the way a bin does, feet down. Walls print flat and cannot carry
them. The deck rides on a 7 mm unit: 4.75 of foot under every cell of its floor, 2.25
of floor, with the riser's boss at ±px for the walls, which stand on the floor and
locate as they do on a riser. The floor is the whole cells that cover the lane (a
138 mm lane wants four, 167.5), or as many as the shelf has when that is fewer: then
the lane overhangs its feet and the walls stand on a skirt, the lane's outline minus the
cell region, solid down to the shelf beside the baseplate's edge. A 138 mm lane goes on
three cells in a 150 mm shelf. With a magnet floor the baseplate is 3.2 mm taller, so its
floor runs out under the skirt and the skirt stands on that. Lanes go a floor apart
(`floorCells · 42`); the gang dovetails are off, the baseplate is the joint.

Lane and floor together are what has to fit the bed. They split at x = 0 with the
deck, through a foot as often as not: a foot cut square by the dovetail seam prints as
it is, the tongue carries floor and foot chunk with it, and the pocket locks the halves.
On a 256 mm bed a default can's 480 mm lane wants twelve cells, 503.5, too long in
halves; on a ten-cell shelf its floor stops at 420 and the lane's own 480 splits to 248,
ends on skirts. The solver charges the unit's height: 7, or 10.2 with the magnet floor.

**Alignment.** Across (left, centre, right - left is +Y, seen from the front) and along
(front, centre, back - front is the lip end) say which edge of the baseplate the lanes'
cells are flush with, by whole cells so the feet land in pockets, and the free cells
gather on the other side or in a corner. Centred splits an odd spare unevenly, one
cell nearer the front or the right.

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

The pocket is the same construction in negative, cut from a slab per cell; its vertical
run overlaps both chamfers by 0.01 mm, since butted exactly float left a membrane that
read as a flat ceiling. Printed rim up, the lower chamfer is the one downward face, at
45°.

`splitDeck` takes the deck's bottom z so the dovetail runs through floor and pan and the
rear half's tongue stands on the bed. `PartSet.gridDeck` is the deck of the lane on the
shelf - `bottom` in a cascade, `top` in a flat stack; `PartSet.baseplate` the tiles. The
viewer lays the baseplate under the gang at `−baseHeight`.

## Why not a solid pad

A cut in between put a solid pad under the lanes with the bosses on it and pockets only
in the free cells, the lane parts left flat. It held the lane, but the lane was then not
a bin: it could not go on any other baseplate, and on a 150 × 304 shelf the whole
baseplate was pad, a flat slab with nothing Gridfinity about it.

## Tests

`test/overhang.test.ts` holds the rule at "flatter than 45°" (`<` with 0.01° of noise
allowed): the foot's and the pocket's chamfers sit on the line. `test/gridfinity.test.ts`
pins the floor and its alignment, the foot and pocket profiles, the fit of one in the
other, the skirt and the magnet floor under it, the tiles against the bed, and the
solver's height and footprint.
