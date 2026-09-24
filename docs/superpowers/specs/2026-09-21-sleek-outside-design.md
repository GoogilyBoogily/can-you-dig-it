# Sleek outside: a flat face, and nothing past the wall

## Amended 2026-09-22, after review

Adversarial review, five agents measuring against the code. Where this block and the
text below disagree, this block wins.

- **`deck-end` is dropped.** The stub is 17 mm of a 4 mm tongue at deck level. Trimming it
  costs a fifth `PlateName`, a `partList` rows refactor, the viewer's per-`gI` plate choice,
  `platePose` and `test/pose.test.ts`, and about 25 new ref keys. If it ever comes back it
  is `geo.isect(deck, y ≤ OW/2)` in `buildLanePlates` (measured identical to a `buildDeck`
  flag at every tab), not a second copy of the tab loop.
- **The review found a real defect the stub was hiding, and it is fixed.** The tongue
  took the +Y ear's place, and the −Y ear at the same tab became the socket. So every
  deck's −Y edge hung off the one lip-end ear, and the row's end lane had nothing under
  its −Y wall at four tabs of five. The tongues now go between the ears (`tonguesOf`), both
  walls notch over them, and every deck keeps an ear under both walls at every tab. See
  the gang paragraph in `CLAUDE.md` and `test/gang.test.ts`.
- **Numbers below that were wrong:** the default gang packs on 18 plates, not 19.
  `K.gangHead` is 30, not 18. `refParts` already builds ganged (`DEFAULTS.lanesWide` is 2),
  so a `gang-` variant would copy `lane-top-deck-*` byte for byte. The proposed
  `deck-end` bounds test failed on the default split lane: the rear half had no −Y ear.
- **The recess is not settled.** Deleting it costs about +20 % filament on the default
  job and pushes the minimal/standard lane ratio past the one `minimal` is for. A
  clean-frame recess measured about +3.4 %: the pocket starts above the ear-notch pads,
  so the bottom border stays full thickness and the eleven posts go. Those two numbers
  came from the review agents and have not been re-measured. That is the design call
  left open here: delete the recess, or keep a clean frame.

The outside of a lane is one plane, broken only by what locks a piece to another piece.
Two things break it today and both go: the outer-face recess on every wall, and the
gang tongues that stick out past the last lane in a row. Not an option. This is what
every lane is from now on.

### Decided 2026-09-22, second interview

| question | answer |
|---|---|
| recess | clean frame: the pocket starts above the ear-notch line, the bottom border stays full thickness, no posts. Supersedes "recess goes" below |
| +Y tongue stub on the end lane | accepted; no `deck-end`, no snap-off neck |
| lanes too short to gang | warn only (shipped); no refusal, no squeezed tongue |
| minimal socket slivers | plinth +3 mm a side at the sockets only, arms ~2.75 → ~5.75 mm |

Built 2026-09-24: the frame and the socket plinth, one `bun run ref`. Walls and end walls
rise 5–10 % standard and 12–21 % minimal in volume, no bound moves, minimal decks +1.3–2.1 %,
nothing else changes. The default job is +1.7 % in volume, minimal +6.0 %; the
minimal/standard lane ratio is 0.604 top, 0.563 bottom.

## Why

- The outer face of a side wall and of the end wall is pocketed over the lattice field
  down to a web (3.5 mm standard, 1.7 mm minimal), with pads left standing over every ear
  notch and the end-wall notch. It was a filament saving: the recess alone was ~30 % of
  the standard wall. It also reads as busy. A hex field inside a stepped frame with
  eleven little posts along the bottom edge is a lot of edges for a face you look at.
- Ganged lanes print one deck part × N. Every +Y ear but the lip-end one runs on as a
  tongue under both walls into the neighbour's socket, and the deck is `gangReach`
  (gap + wall + 8) wider on that side to carry it. The lane at the +Y end of a row has
  no neighbour, so its tongues stick out 17 mm past its outer wall at shelf level.
  Cascade tiers turn 180° about Z, so on odd tiers the stub is on the −Y end instead.
  Every row has one lane with a row of Ts sticking out of its side.

Decided in the interview on 2026-09-21, one at a time:

| question | answer |
|---|---|
| flat means | holes stay, recess goes: the pattern cuts through a full-thickness wall |
| minimal design | recess deleted there too; minimal keeps its deck fins, 2.5 mm ties and perforated cover, and its wall is now the standard wall |
| ships as | the default, not a checkbox and not a third design; nothing opts back in |
| pins on wall tops | stay on every tier; a top tier with the cover off shows four 2.4 mm pins, accepted |
| gang stub | a second deck part for the end lane, `deck-end`: sockets on −Y, plain ears on +Y, OW wide |
| outer top-edge rounds (`K.edgeR` 3, `roundTop`) | stay; a rounded top edge is sleek, a stepped face is not |
| the 3 mm gap between ganged lanes | left as-is; two holed faces 3 mm apart |

"Flat outside with the pattern only inside" was considered and is impossible under the
flat-pack rule: a wall prints outer face up, so a blind cell from the inner face is a
pocket in the bed face.

## Geometry

### The recess goes

`wallPerforation` keeps the lattice cut and the end-notch column as a keep-out, and loses
the recess block: the pads, the pad union, the per-component face cut. `buildEndWall`
keeps its cells and loses its recess line. `recessDepth` in `features/pocket.ts` goes,
and `K.web` with it. A wall is `o.wall` thick everywhere but its holes.

`K.padRise` stays as `K.fieldRise`: every pattern but hex starts its wall field
`earNotchH + 4` up from the bottom edge so a square edge or a chord never bridges an
ear notch. The pad it was named for is gone, the reason for the lift is not, and the
hex field keeps the border so its cells do not move.

Everything else on the outside is a joint and stays: pins on the wall tops, the deck's
ears flush in the walls' notches, the end wall's posts, the lip's tabs, feet and
Gridfinity bosses when the base asks for them.

### `deck-end`

`buildDeck(g, o, d, ln, endLane)`. The tab loop treats the two sides on their own:

- −Y: a socket at every keyed tab, an ear at the rest. Unchanged.
- +Y: a tongue at every keyed tab unless `endLane`, in which case an ear. Nothing runs
  past the wall, and the plate is OW wide, not OW + `gangReach`.

`buildLanePlates` emits it as a fifth plate, `deck-end`, when `gangs(o)`, split at x = 0
with `splitDeck` like the deck when the lane is long (`splitDeck`'s wedge is `d.plateY`
wide: wider than any tongue, and wider than the end deck, which is fine). `PlateName`
grows the name; `laneName` prints it as `lane-<role>-deck-end`.

`partList` counts rows per role (bottom 1, mid `tiers − 2`, top 1 in a cascade or `tiers`
flat): `deck` × rows · (lanesWide − 1), `deck-end` × rows, every other plate × rows ·
lanesWide. On a Gridfinity base gangs are off, so no `deck-end` exists and the grid deck
replaces the deck as before.

The viewer puts `deck-end` on the +Y end of even tiers and the −Y end of odd ones, since
the tier's own 180° turn carries the plate's asymmetry with it. Its pose and explode push
are the deck's.

Packing: one deck per row is 17 mm narrower. The default gang packs on fewer than its
19 plates; the new count is read off the packer and pinned.

## What does not change

`solve()`, every joint, `gangPitch`, the solver's layouts and its per-design gram
constants (`solver.ts` ranks with 325 / 250 g a lane; coarse, and `filamentGrams` follows
the mesh on its own). The cover, lip and risers. The Solid checkbox still means no
pattern; it just no longer also means no recess, because nothing does.

## Snapshot

Two commits, each with its own `bun run ref`, so each diff answers one question.

1. Recess. Every `lane-*-wall-left`, `wall-right`, `end-wall` and their `minimal-` and
   pattern-prefixed twins rise in volume; every bound is unchanged (the pocket was inside
   the plate); decks, lips, risers, covers are byte-identical. Anything else moving is a
   bug.
2. `deck-end`. `refParts` gains a `gang-` variant (`lanesWide: 2`) storing the top lane's
   `deck` and `deck-end` halves. Every existing key is unchanged.

The minimal/standard ratios in `test/regress.test.ts` (0.6 top, 0.55 bottom) loosen to
what the fins, ties and cover alone give, with the reason on the line.

## Tests

- `test/features.test.ts`: the `recessDepth` case goes.
- `test/pattern.test.ts`: the "full thickness over every ear notch" case goes (it now
  holds by construction) and the header stops describing a recess; `K.padRise` →
  `K.fieldRise`.
- `test/gang.test.ts`: `deck-end` laid flat is OW in Y and `deck` is OW + `gangReach`;
  `deck-end` has a socket on −Y at every keyed tab and an ear on +Y at every tab; the
  neighbour's tongue clears its socket at fit 0; `partList` for `lanesWide: 3` gives
  `deck` 2 per row and `deck-end` 1; the new plate count.
- `test/overhang.test.ts`, `test/islands.test.ts` and `test/regress.test.ts` pick the
  new parts up from `refParts()`.
- UI: a 2-lane, 2-tier cascade shows no stub past the outer wall on either tier and the
  walls flat with holes.

## Docs

`CLAUDE.md` loses the recess and pad sentences and the minimal "web 1.7 mm" clause, and
the gang paragraph gains `deck-end`. The minimal spec gets a dated note that the wall
web was dropped. The reeded proposal (`2026-09-18-reeded-pattern-design.md`, not built)
is written on top of the recess and would need a new home for its ribs if it is ever
picked up.
