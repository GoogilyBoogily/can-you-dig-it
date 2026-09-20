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

## Gang: a deck tongue in a deck socket

Nothing on a wall face can hold two lanes together in Y. A rib locates X, and any head
on it that would lock Y is an undercut when the wall prints outer face up. So the walls
carry nothing, and the deck does the whole job: Y is in-plane for a deck.

Every +Y ear except the lip-end one runs on as a tongue: ear-wide from its root, under
its own wall, across the gap and under the neighbour's wall, then a T into the
neighbour's rail - an ear-wide neck `spliceNeck` 3 deep and a `gangHead` 18 wide head to
`spliceDepth` 8. The tongue is the neighbour's ear at that tab as well: that wall
notches over it and drops its tab through a second slot in it. On the −Y side the same
tab has no ear; it has the socket, the T grown by the clearance, cut through the deck
like a tab hole. It sits in the outer 8 mm of the rail, under a can's neck, where
nothing rolls.

Assembly: set the second deck down and the first deck's tongues rise into its sockets.
The head locks Y, the neck locks X, at every tie. Walls go on after, as before.

The neck is the ear's width and not the tab's because the neighbour wall's tab hole
crosses it: at 8 wide the neck was all hole and the head printed loose. The lip-end ear
stays an ear on both sides because the lip pockets sit where its socket head would go.

A ganged deck is `gangReach` = gap + wall + 8 = 17 mm wider than OW on its +Y side, and
the last lane's tongues hang free on the outer edge, as the old rib did. On a 256 bed a
155 mm deck no longer takes a wall behind it: the default gang packs on 19 plates, not
16.

Walls are one part whatever the lane count. Their old names, `wall-tongue` and
`wall-socket`, are `wall-left` and `wall-right`.

Gang joints exist only when lanes gang: `lanesWide > 1` and not on a Gridfinity base,
where the baseplate joins them.

## Constants

`dovetail` is `gangGap`. `dtCl` is `cl`: it was every tab's clearance, never the dovetail's.
`dtBase` and `dtTip` are gone. New: `gangHead` 18, `spliceNeck` 3.

## First cut

The first cut kept a rectangular rib and groove on the walls and added a dogbone clip
dropped into pockets on the two wall tops to hold Y. That is two parts sliding into a
third; the ask was one part's tongue into the other's socket, and the deck is the only
plate that can carry it.
