# Gridfinity spec, the short version

Everything the gridfinity base in `src/geometry.ts` leans on, pulled together in one place
so nobody has to go dig through SVGs on GitHub again. Units mm, Z up. The "ours" column
is the `K` constant that carries the number (or how we derive it) so a change here and a
change there get reviewed together.

Pulled 2026-09-19, then attacked by three fact-checkers against the raw sources. Every
number below survived. Zack's own spec page is still marked "work in progress" and
carries almost no numbers in text, so the profile figures come from the community
drawings and from `gridfinity-rebuilt-openscad`, which is the de facto reference
implementation and agrees with the drawings to the hundredth.

## The grid

| Thing | Value | Ours |
|---|---|---|
| Cell pitch | 42 × 42 | `K.gridPitch` |
| Height unit | 7 | `K.unitH` (`baseHeight()` charges one unit) |
| Bin footprint per cell | 41.5 × 41.5 (pitch − 0.5) | `gridSpan(n)` = `n · 42 − 2 · K.gridGap` |
| Cells to cover a span | smallest n with `n · 42 − 0.5 ≥ span` | `gridCells(span)` |
| Gap bin to baseplate wall, per side | 0.25 | `K.gridGap` |
| Bin corner radius, top of foot | 3.75 | `K.footR` |
| Baseplate socket corner radius | 4.0 (= bin radius + gap) | not modelled, we make no baseplate |

Bin outer size for n cells: `n · 42 − 0.5`. The half-mm gap is shared, 0.25 each side, so
a 2-wide bin is 83.5, not 84. (The sources all say "0.5 total"; 0.25 per side is the
derivation, and the layout-tool PR that fixed their socket says it outright.)

## Bin foot profile (bottom of a bin, per cell)

Read bottom up, each chamfer is 45°. The horizontal run of each chamfer equals its rise.

| Segment | Rise | Run | Ours |
|---|---|---|---|
| Lower chamfer | 0.8 | 0.8 | `K.footChamferLo` |
| Vertical | 1.8 | 0 | `K.footWall` |
| Upper chamfer | 2.15 | 2.15 | `K.footChamferHi` |
| **Foot total** | **4.75** | **2.95** | |
| Floor above the feet | 2.25 | | no slab: the upper chamfers run on past 4.75, merge, and clip at z = 0 |
| **One unit** | **7** | | `K.unitH` |

So the flat pad on the very bottom of a foot is `41.5 − 2 · 2.95 = 35.6` square
(`K.footFlat`) with an r 0.8 corner (`K.footR − footChamferHi − footChamferLo`, derived,
no constant). The upper chamfer of a foot is the bit that rides on the baseplate socket's
slope; that is what locates the bin.

Some generators cut the foot 5.0 tall (upper chamfer 2.4) so a multi-cell bin clears the
ridge between sockets more easily. `cq-gridfinity` does; `gridfinity-layout-tool` did
until 2026-09. We do not. 4.75 is the spec number and it is what every stock baseplate is
cut for.

## Baseplate socket profile (what a bin drops into)

The foot profile shifted out 0.25 horizontally, with the bottom 0.1 of height cut off.
That is a *shift*, not a perpendicular offset: across the 45° flanks the actual clearance
is 0.25 / √2 ≈ 0.18, on the vertical band it is 0.25. (Treating it as an offset is the
bug the layout-tool fixed in PR #4291.)

| Segment | Rise | Notes |
|---|---|---|
| Lower chamfer | 0.7 | 45° |
| Vertical | 1.8 | |
| Upper chamfer | 2.15 | 45° |
| **Socket depth** | **4.65** | |

Socket is 42 square at the top with r 4.0 corners. The thinnest plate the references make
is 5.0, not 4.65: `gridfinity-rebuilt` adds 0.35 under the socket so the upper chamfers
seat before the pad bottoms out, and the unofficial-spec drawing labels the plate 5 mm.
Weighted, skeletonised and screw-together styles add more below that. We make no
baseplate: the lane's feet drop into whatever plate the user already has, and the
2026-09-19 design doc says why.

## Stacking lip (top rim of a bin)

Mirrors the socket, not the foot: same 0.7 and 1.8, upper chamfer 0.25 shorter. A bin on
a bin sits the same way as a bin on a baseplate. Only relevant if we ever put something
*on top of* a lane. Read from the inside tip outward and up.

| Segment | Rise | Run |
|---|---|---|
| Lower chamfer | 0.7 | 0.7 |
| Vertical | 1.8 | 0 |
| Upper chamfer | 1.9 | 1.9 |
| **Lip total** | **4.4** | **2.6** |

Bin height with a lip: `7 · units + 4.4`. `gridfinity-rebuilt-openscad`'s docs and height
arithmetic said 3.8 from 2022-10 to 2024-09 (its spiral-vase script still does); the lip it
actually prints is the 4.4 profile with a 0.6 fillet on the tip, so it measures about 3.55
tall and stacks at the spec height regardless. Stu142: the tip shape "doesn't really
matter as long as everything else is the same."

## Magnets and screws

| Thing | Value | Ours |
|---|---|---|
| Magnet | Ø 6 × 2 | |
| Magnet pocket | Ø 6.5 × 2.4 (2 + two 0.2 layers) | `K.magnetR` 3.25, `K.magnetDepth` |
| Pocket centre from the 42 grid line | 8 (7.75 from the 41.5 bin edge, 4.8 from the 35.6 pad) | |
| Pocket-to-pocket square per cell | 26 (= 42 − 2 · 8) | `K.magnetPitch` |
| Screw | M3, hole Ø 3 | not modelled |
| Heat-set insert bore | Ø 4.2 | not modelled |

Pockets are optional in the spec and should be in **all four corners of every cell** so a
bin fits in any rotation. Ours go in every foot on the 26 square and skip any whose edge
comes within 1 mm of the split seam.

Community variants worth knowing exist, none of which we use: "refined" holes at Ø 5.86
sit the magnet on two bottom layers and squeeze it, crush ribs (8 ribs on an inner Ø 5.9)
for a press fit, 45° chamfers on the pocket mouth.

## Walls, floors, extras (bins only, not our problem)

These are `gridfinity-rebuilt`'s defaults, "arbitrarily chosen" by its own comment. They
appear in no spec drawing.

| Thing | Value |
|---|---|
| Minimum wall | 0.95 |
| Internal fillet | 2.8 |
| Divider width | 1.2 |
| Label tab depth into bin | 15.85, supported at 36° |
| Gridfinity Refined thumbscrew | Ø 15, 1.5 pitch (Printables 413761) |

## Where this came from

- Zack Freedman's page, <https://gridfinity.xyz/specification/>, still flagged as draft.
  Magnets 6 × 2, M3, "holes in all four corners of every unit" are quoted from it.
- Community spec repo, <https://github.com/gridfinity-unofficial/specification>. Its
  README has no numbers; its two JPEGs show 41.5 (0.5 tolerance), 4.75, 3.75, 42, 8.0 Ø
  and a 5 mm plate.
- grizzie17's Printables page, <https://www.printables.com/model/417152-gridfinity-specification>,
  a separate write-up (returns 403 to scripts; quoted via search). Source of the 4.65
  socket, 4.0 fillet, 0.25 gap, 2.25 usable floor and the "some use 5.0" note.
- Stu142's drawings, <https://github.com/Stu142/Gridfinity-Documentation>. Dimensioned
  SVG/PDF of every profile, hole datums 7.75 / 4.8 / 26, the 4.2 insert bore.
- `gridfinity-rebuilt-openscad`, <https://github.com/kennetek/gridfinity-rebuilt-openscad>,
  `src/core/standard.scad` and `src/core/gridfinity-baseplate.scad`. Every profile above
  as a polygon with a comment, 8 mm hole offset, 6.5 × 2.4 pocket, the variants.
- `gridfinity-layout-tool` PRs #4251 and #4291, where someone else found the 5.0 foot and
  the offset-vs-shift socket the hard way.

If a number here and a number in `K` ever disagree, the code is wrong or this file is
stale. Fix whichever it is, in the same commit.
