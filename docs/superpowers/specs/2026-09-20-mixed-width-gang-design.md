# A second can on the shelf

A "Second can" block on the form. On, the solver fills the shelf's width with two lane
types side by side - so many of the first can, so many of the second - and the build,
plates, viewer and files carry both. No geometry changes: the two types are two gangs
standing next to each other, not one gang.

## Why

A fridge shelf holds seltzer and beer. README gap #2 has said since the first cut that
a stack holding two SKUs is "bigger than it looks" because `gangPitch` derives from one
`canD`/`canL`. What actually couples two neighbouring lanes, with the numbers for a 12 oz
(66 × 122.5) beside a slim (53 × 134) at L 480:

| coupling | 12 oz | slim | shared? |
|---|---|---|---|
| tier height H / Hb | 94 / 98 | 81 / 85 | the rib on the +Y face runs `RIB_Z` to H − 12 and the groove opposite takes it; tier 2 of the 12 oz lane starts at z 98, the slim's at 85, and the 12 oz rib crosses the slim's solid band between its grooves - the two cannot slide together |
| rib and pin x | L/2 − 25, L/2 − 40 | same L → same | through L only |
| cover, lip, window | per lane | per lane | no |
| wall spacing | IW 126 / OW 138 | 137.5 / 149.5 | the rib mates any −Y face; only the scalar `gangPitch` assumes equal OW |

One real blocker, H. Forcing a shared H (the taller one) would let the two types clip
together, and would cost the slim stack a tier on a real shelf: 254 mm takes two 12 oz
tiers (98 + 94) or three slim ones (85 + 81 + 81), and a slim lane at 98 + 94 takes two.
An interlock that loses a tier is the wrong trade for a first cut. So the two types do not
clip to each other. Each type is its own gang with its own rib, groove and clips inside
it; between the gangs a 3 mm gap and the shelf. That is the same standing the lanes on
either side of a Gridfinity floor have today. The interlock can come later on top of this
plumbing, as an optional `tierH` override in `solve()`, if anyone asks.

Today a user can do this with two tabs and two 3MFs. What the feature adds is one
solver pass over the shared width, one file, one assembly on screen.

## Solver

`fitSpace(space, base, { cascade, second? })`. With `second`, inside the existing style
loop, for `nB` from 1 to the most that fit across: `nA = ⌊(w − 2·SIDE_GAP − nB·pitchB) /
pitchA⌋`, skip when `nA < 1`. Per type, the best length by the existing `candidateLengths`
and `layoutFor`, each with its own tier count from the height. Combine: `cans = A + B`,
footprint `[A.w + gap + B.w, max d, max h]`, warnings concatenated, `gramsEst` summed.
`Layout.second?: { options, derived, cans }`. The comparator is unchanged (cans, then
stack height, then lane length) and so is two-per-style. Length is chosen per type, not
jointly: `// ponytail: best length per type; a joint search if a split ever ranks wrong`.
The Cascade checkbox stays one box for both types.

A shelf too narrow for one of each offers only single-type layouts, as it does now, and
the second block's hint says so: "Nothing fits both. The layouts below are for the first
can."

## Build and files

`worker.ts` build `Req` gains `second?: Options`. The worker builds both sets, prefixes
every second-type part name `can2-`, concatenates, and runs one `pack()`. `last` holds the
concatenation, so export needs nothing new. `stripCopy` and `plateSummary` see `can2-lane-top-deck`
as one more name; the prefix is a word, not a digit, so a plate summary's `2x` stays a count.

## Viewer

`showAssembly` is one loop over `lanesWide` at pitch `G` from `y = 0`. Its body becomes
`placeGang(by, o, d, y0, prefix)`; the first gang goes at `y0 = 0`, the second at
`y0 = (nA − 1)·pitchA + (pitchA + pitchB) / 2`, its names looked up with the prefix.
Clips are placed inside a gang only, as they are built.

## Form and hash

A second Can fieldset under the first: a `mix` checkbox "Second can beside it", then
`preset2`, `canD2`, `canL2`, greyed until the box is on. The preset handler keys on the
name's suffix. `LIMITS` gains `canD2`, `canL2` with the first pair's ranges; `optionsFrom()`
reads them only when `mix` is on, so a blank second block is not an error;
`FormValues.second?: Options` is the base options with the second pair swapped in. `KEYS`
adds `mix`, `canD2`, `canL2`. Can play (`clearance`) is one number for both.

Layout card: `2 × 66 × 122.5 + 1 × 53 × 134`. Summary Lane row lists both lanes' sizes;
Capacity says `10 + 6 cans`.

## Tests

- `test/validation.test.ts`: `mix` off ignores an empty `canD2`; on, it is gated by name.
- `test/solver.test.ts`: w 300, 12 oz + slim, offers 1 + 1 with footprint width
  141 + 152.5 and cans the sum of each type's; w 140 offers only single-type layouts.
- `test/parts.test.ts`: the concatenated list has every `can2-` name and the counts of a
  one-lane gang of the second type (no `can2-gang-clip` at `nB` 1).
- `test-ui/share.ui.test.ts`: the hash round trip carries the second block; the assembly
  tab shows two gangs.
- `ref.json` does not move: no geometry changes and `DEFAULTS` is extended, not changed.

README gap #2 becomes a line in the parts list: "two can sizes side by side; the two
types stand next to each other and do not clip".
