# Gridfinity base

A third base under the lane, next to flat and 24 mm feet: a Gridfinity baseplate for the
shelf, with the lanes standing on it. Picked from a Base select; a Magnet pockets
checkbox and two alignment selects ride on it.

## What Gridfinity is, in numbers

42 mm pitch, 7 mm height unit. A baseplate pocket, rim down: 42 wide at the rim, a
2.15 mm 45° chamfer, 1.8 mm vertical, a 0.7 mm 45° chamfer to 36.3 at the bottom,
4.65 mm deep, corners r4 at the rim and concentric below. Magnets are 6 × 2 mm on a
26 mm square in every cell.

The official page pins only the magnets; the profile is from the community spec on
Printables and the generators that implement it (gridfinity-layout-tool PRs #4251 and
#4291, the Fusion generator, the 1fifoto CNC gadget).

## Why a baseplate, not feet

The first cut grew feet on the bottom deck and made the lane a bin. That needed a shelf
at least as wide as the whole cells covering the lane - a 138 mm lane wants four,
167.5 - so a 150 mm shelf got nothing, and a lane overhanging a narrower floor on a
skirt blocked the cells beside it on any wider baseplate. The lane is not a bin: it is
the thing the shelf is for, and the grid is for what goes beside it.

So the grid is its own part. The baseplate is the whole cells the shelf has room for,
`floor(depth / 42) × floor(width / 42)`, grown to the lanes' pad where a lane is bigger
than they are. Under the gang the pad is solid and flush with the rim, with the riser's
boss at every lane's ±px (the wall's bottom notch takes it, as it takes a riser) and a
1 mm pocket for the lip's tabs. Every cell clear of the pad is a standard pocket, so
bins go there. The lane parts are the flat lane's, unchanged; gang dovetails stay.

Alignment: across (left, centre, right - left is +Y, seen from the front) and along
(front, centre, back - front is the lip end) say which edge of the baseplate the pad is
flush with, so the free cells gather on the other side, or in a corner. Centred keeps
it symmetric. On a 150 × 304 shelf three cells are narrower than the lane and seven
along leave 16 mm: the baseplate is 138 × 294 and all pad. On 400 × 460 the default
two-lane gang sits on 10 × 9 cells with two free columns.

Magnets put a 3.2 mm floor under the pockets, with 6.5 × 2.4 pockets on the 26 mm
square in every free cell and 0.8 mm of skin below. The solver charges the baseplate's
height: 4.65, or 7.85 with the floor.

## Geometry

`buildBaseplate` cuts one pocket solid - hulls of the profile's rounded rectangles, so
the chamfers are exact and the corners concentric; the vertical run overlaps both
chamfers by 0.01 mm, since butted exactly float left a membrane that read as a flat
ceiling - from a slab, per free cell, then adds the bosses and cuts the lip pockets.
Printed as it lies, rim up: the lower chamfer is the one downward face, at 45°.

A baseplate bigger than the bed is cut into tiles at cell lines, greedily, so every
tile and its tongue fit. Each cut is keyed with the deck's dovetail wherever it runs
through solid: the plate's extent less every free cell the cut borders (at a cell line
the rim is a knife edge and has nothing to key) and less a 50 mm band round each
crossing cut, so no tongue is itself cut in two. Through pockets the tiles just butt,
and the lane standing across the seam holds them.

`PartSet.baseplate` is the tiles; the worker names them `baseplate-N`, the viewer lays
them under the gang at `−baseHeight`.

## Tests

`test/overhang.test.ts` holds the rule at "flatter than 45°" (`<` with 0.01° of noise
allowed): the pocket's lower chamfer sits on the line. `test/gridfinity.test.ts` pins
the plate's extent and alignment, the pad and its bosses, the pocket profile, the
magnet floor, the tiles against the bed, and the solver's height and footprint.
