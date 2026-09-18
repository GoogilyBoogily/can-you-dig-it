# Flat-pack lanes

A lane is no longer one print. It's a deck, two side walls and an end wall, each printed
flat with its outer face up, dropped together from above. No glue, same as before. The
reason is supports: Bambu Studio at its 30° threshold put support under every hex cell,
and it was right to. A regular pointy-top hexagon has ceiling edges at exactly 30° from
horizontal, and any way you turn a 120° hexagon one edge lands at 30° or under. So
"regular hexes" and "self-supporting in a standing wall" can't both be true. Printed flat,
a hex is a vertical hole and the question goes away.

Two other things were quietly overhanging as well: the dovetail tongue on the +Y wall
started at z = 8 on a flat 3 mm cantilever, and the end-lip printed standing on its two
tabs with the blade bridging 80 mm between them.

## The rule

Every feature on a plate is one of three things:

- **in-plane** — a tab, a notch, a dovetail tongue or socket, a slot, a hex cell
- **growing up from the print face** — a rib, a boss, a pin
- **a pocket in the print face** — the recess, a groove

Nothing on the bed face. Nothing under an edge. If a joint needs something else, it's the
wrong joint. `test/overhang.test.ts` walks every triangle of every snapshot part and fails
on a downward face flatter than 45° that isn't sitting on the bed. The dovetail rib and
groove lean 56° and are the only downward faces meant to exist.

## Plates

Units mm, lane frame as before: front of a lane = −X, high end = +X, Z up. `solve()` is
unchanged except that the splice depth replaces the half-lap length in `plateX`.

| plate | printed | carries |
|---|---|---|
| deck | flat, as the wedge always was, OW wide | openings and ties as before, slots for the wall tabs, pin holes at ±px, the end-wall slot, lip pockets, the splice tongue or socket |
| side wall ×2 | flat, outer face up | the lattice and recess pocket, the dovetail rib (+Y) or groove (−Y), tabs down through the deck, pins up at ±px, notches at ±px where there's no deck under the wall, a notch at the end for the end wall's tab, the splice tongue or socket |
| end wall | flat, outer face up | lattice and recess, a tab down into the deck, a tab each side into the side walls |
| cover | as before | pin holes instead of peg sockets |
| end-lip | flat, blade on the bed | tabs in the bed plane, the scoop as a vertical cylinder, the face-up edges rounded |
| riser | as before | a boss instead of a peg |

One tab spec for everything: **8 wide, 3 thick, flush with the plate's inner face**. A
tab is that cross-section run to whatever length the joint needs, a pin is the same thing
2.4 tall (the cover's thickness, so it sits flush through the cover's hole), a boss is a
pin on a riser. Every hole a tab enters is the tab plus `dtCl + fit` a side.

### Wall ↔ deck, and the tier stack

The deck stays OW wide, so it runs under the walls as it always did, and each wall stands
on the rail under it. The wall's bottom edge follows the deck top: z = 0 across the
chute, then `deckLo` at `xd` rising at the slope, flat for the last `wall` mm where the
end wall sits. Tabs hang off that edge and go down through slots in the rail to the bed,
or to the wall top of the tier below. They locate the wall in X and Y. The deck is
sandwiched between the tier below and the wall above and carries load straight through.

Tabs sit in the rail under the wall, which is solid along the whole deck in both designs,
so they need no tie under them: one 7 mm in from each end of the deck, and one at every
interior tie that's more than 12 mm from the seam and from ±px. That gives every half of
a split lane at least one tab. In the minimal design the slot's inner edge meets the open
strip beside the fin, so the tab is held on three sides there. Widening the ties to close
it cost 60 g a lane, and the wall can't go inward without leaving the rail anyway.

The rails' outer faces recess to the same web as the wall above, with pads round the
slots and pin holes, so the wall's recess runs on down the deck instead of stopping on a
ledge. That's 25 cm³ a lane in the standard design and 60 in minimal.

Pins at ±px on the wall tops register the next tier in X and the cover in X and Y. Where
the tier above has deck over the pin it sinks into a hole in that deck. Where it doesn't
(the chute end) it goes into a notch in the upper wall's bottom edge.

### End wall

Stands on the flattened deck end at z = t_e. One tab down into a closed slot in the
deck, one tab each side, 12 tall, into a notch in the side wall's bottom edge. The side
walls drop over those tabs as they drop onto the deck, so the whole tier assembles top
down. A loading-lip end wall (top lane) is the same plate, shorter. Only the outer top
edge rounds: the inner one would be a round on the bed edge, and a can loaded over the
lip slides over the outer edge anyway.

### Splices

Long lanes still split at x = 0. The deck keeps its dovetail tongue and socket. The
walls get the same in-plane dovetail sized to the wall height at the seam, slid together
in Y before the wall goes on the deck. The half-laps are gone: a lap printed face-up is a
10 mm cantilever.

Found on the way: the lip pockets had been 12.4 × 5.4 since cansys.py, turned 90° from
the 4.8 × 12 tabs they were cut for. The lip never fit. They're 5.4 × 12.4 now.

### Gangs

The dovetail rib and groove on the outer wall faces are unchanged in plan. In Z they now
run from 4 mm above the wall's bottom edge at ±dtx to 12 mm below the top (rib), the
groove open at the top as before.

## What the lattice looks like now

Same cells, same `autoHexR`. The wall panel is everything above the wall's bottom edge
plus the 5 mm border, so along the deck the bottom row drops out as the deck rises. From
outside you can read where the deck is. In the chute all three rows fit as before. That
band is what the flat-pack costs: a standard top lane is 575 cm³ against 498 as one
print (331 g against 305 in the filament model), a minimal one 288 against 242.

The recess is a pocket now, vertical sides, no 45° ceiling. Pads stay round the tab
roots, the end-wall notch and the dovetail bands.

## Rounding

`cornerR` is gone: a plan radius can't span two plates. Each plate rounds what a can or a
hand meets: the wall's top outer edge (the seat stays flat), the end wall's, the cover
and the lip's face-up edges. The deck is square.

## Part names

`lane-<role>-deck`, `lane-<role>-wall-tongue`, `lane-<role>-wall-socket`,
`lane-<role>-end-wall`, each with `-front` / `-rear` when split. A two-tier, two-wide
default gang is 34 plates on about 16 beds instead of 14 on 11. Each plate prints flat
and fast, and none of them needs support.

## Viewer

Every plate is modelled in its print orientation. `showAssembly` stands them up: side
walls rotate about X and sit at ±IW/2, the end wall rotates about Y to x = L/2 − wall,
the lip about Y to the deck front. Explode pushes walls outward, the end wall +X, tiers
up, gangs across.
