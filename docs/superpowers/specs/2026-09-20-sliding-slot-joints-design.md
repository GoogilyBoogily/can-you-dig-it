# Sliding-slot joints

## Why

Two dovetails held the flat-pack together, and both were the awkward joint in their family.

The gang dovetail was a 56° rib on the +Y wall face sliding into a 56° groove in the −Y face
of the next lane. It was the one downward face `test/overhang.test.ts` let through, and the
one place a wall was not a rectangle with holes in it: the slicer wanted its overhang fan on
for that flank and a frosted band showed where it ran. The splice dovetail was an in-plane
trapezoid at x = 0. It printed fine; it was the second joint shape in a design that
otherwise has one, the tab and its hole.

Every joint is straight-sided now. The overhang rule has no exception left.

## Splice: T-slot

Same topology as before. The rear half keeps the tongue, the front half gets the socket, the
tongue points −X. A neck first, then a wider head behind it.

| plate | neck | head | depth |
|---|---|---|---|
| deck | `spliceBase` 30 wide | `spliceTip` 40 wide | `spliceNeck` 3 + 5 = `spliceDepth` 8 |
| wall | 0.4·H tall | 0.55·H tall | the same 3 + 5, centred at H/2 |

The deck tongue is still the wedge inside that outline, so it carries the slope, and drops
into the socket from above. The head locks X, the socket's sides lock Y. Wall halves slide
together in Y as before; the head locks X and the socket locks Z. The tie band at −14..6 was
already wide enough.

`tSlot()` is the eight-point outline. The socket grows by `cl + fit` with a miter offset,
which at right angles is an exact square offset, so the hand-grown trapezoid is gone.

## Gang: rib, groove and clip

The rib on the +Y face at ±dtx is an 8 × 3 box, `RIB_Z` to H − 12 as before. The groove in
the −Y face is the rib plus clearance, open at the top. Lanes still slide down onto each
other. That locates X along the whole height. It does not hold the lanes together in Y, and
nothing on a wall face can: any profile that locks Y is an undercut when the wall prints outer
face up.

So a clip does it. A dogbone plate, `pinH` 2.4 thick, printed flat: two feet `clipFoot` 14 wide
× 4 deep, joined by an 8-wide bar `gangGap` 3 long. Each wall gets a pocket for a foot at ±dtx
in its top border: 14 + 2c wide, 4 + c in from the outer face, `pinH` deep from the top edge.
Open at the top edge and at the outer face. Printed outer face up that is a pocket in the
print face whose floor sits 2 mm above the bed, which the rule allows. The two pockets face
each other across the gap and the clip drops in from the top. Pull the lanes apart and each
foot bears on the inner wall of its pocket. The tier above, or the cover, holds the clip down.
A top tier with no cover keeps it by friction.

The pocket lives above the recess (the top border is 5 mm of full-thickness wall) and above
the rib. The lattice keep-out band at ±dtx is the foot's half-width plus 2.5, the same 9.5 mm
it was for the dovetail tip.

Rib, groove, pockets and clip exist only when lanes gang: `lanesWide > 1` and not on a
Gridfinity base, where the baseplate joins them. `gang-clip` prints 2 per joint per tier.

## Constants

`dovetail` is `gangGap`. `dtCl` is `cl`: it was every tab's clearance, never the dovetail's.
`dtBase` and `dtTip` are gone; the rib is `tabW` wide. New: `clipFoot` 14, `spliceNeck` 3.

## Viewer

`showAssembly` places a clip at (±dtx, the joint's y, H − pinH) on every tier of every joint
and pushes it across with the gang when exploded.
