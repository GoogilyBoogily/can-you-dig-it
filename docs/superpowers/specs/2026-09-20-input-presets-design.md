# Input presets and can play

Three preset selects and one exposed number. Nothing new in the solver or the geometry:
every preset writes into fields that already exist, and can play is an `Options` field
that already exists and was never on the form.

## Why

The two complaints on every comparable dispenser are "it didn't fit my shelf" and "the
cans bind". The first is a measuring problem, and the form makes the user measure twice:
once for the shelf and once for the printer bed, both typed in by hand. The second is
`clearance`, 3.5 mm of play along the lane between the can's ends and the wall faces,
hard-coded in `DEFAULTS` since the first cut. A published dispenser was widened 2 mm after
its comments filled with cans that stuck; another notes that a can resting on its rim sits
tilted and is longer across than its spec says. That number is the user's.

## Can presets

The select at `index.html` "Can" gains seven entries, in the `Ø,L` string form the five it
has already use:

| label | value |
|---|---|
| 12 oz sleek | `58,157` |
| 16 oz sleek | `57,181` |
| 500 ml | `66,168` |
| Wide 16 oz (Monster) | `68,158` |
| 400 g food tin | `75,112` |
| 15 oz food tin | `79,111` |
| 3 oz cat food | `66,37` |

Diameters cluster at 53, 57, 66, 68, 75, 79 and 86 across every can and jar people store;
this list covers the ones a lane holds. Mason jars and bottles stay out: a jar's lid is
wider than its body and does not roll true.

`LIMITS.canL` drops from 40 to 30 so the cat food tin passes the gate. Nothing below it
changes: `insetFor` and the ear pin rule already handle a 37 mm can (commit `ead474a`).

## Shelf presets

A `shelfPreset` select at the top of the Shelf fieldset, wired exactly as `preset` is at
`src/main.ts:54-62`: a pick writes `w`, `d`, `h`; an edit to any of the three flips it to
Custom; `loadHash` forces Custom; the select is not in `KEYS`.

| label | w × d × h |
|---|---|
| IKEA KALLAX cube | 335 × 370 × 335 |
| IKEA BILLY shelf | 360 × 265 × 300 |
| IKEA IVAR 30 shelf | 420 × 300 × 300 |
| IKEA IVAR 50 shelf | 830 × 500 × 300 |
| Wire shelf 12 in | 600 × 300 × 300 |
| Wire shelf 16 in | 900 × 400 × 300 |
| Fridge shelf, counter-depth | 450 × 400 × 250 |
| Fridge shelf, standard | 600 × 480 × 250 |
| Custom | — |

Heights on the adjustable shelves (BILLY, IVAR, wire) are a starting point, not a fact,
and the hint under the select says so: "Height is whatever you set the shelf above to.
Depth and width are the unit's." KALLAX's inside is 335 square; its depth is 390 outside,
370 usable. The fridge numbers are usable shelf depths from manufacturer pages (16–20 in
standard, 13–16 in counter-depth); the width is one shelf of a two-shelf-wide fridge.

## Bed presets

A `bedPreset` select in the Printer fieldset writing `bedX`, `bedY`, `bedZ`, same wiring.
Entries are the 14 Bambu models (from `profiles/index.json` at load, so the list cannot
drift from the picker) followed by the common non-Bambu beds:

| label | X × Y × Z |
|---|---|
| Prusa MK4S / MK3S | 250 × 210 × 220 |
| Prusa Core One | 250 × 220 × 270 |
| Prusa MINI | 180 × 180 × 180 |
| Creality Ender-3 V3 | 220 × 220 × 250 |
| Creality K1 | 220 × 220 × 250 |
| Creality K1 Max | 300 × 300 × 300 |
| Creality K2 Plus | 350 × 350 × 350 |
| Elegoo Neptune 4 | 225 × 225 × 265 |
| Voron 2.4 300 | 300 × 300 × 300 |
| Voron 2.4 350 | 350 × 350 × 350 |

The print-settings picker stays Bambu-only; a bed is all the solver needs from anyone
else. `applyPicks` (`src/main.ts:318`) keeps writing the bed when a Bambu printer is picked
and sets `bedPreset` to that model's entry so the two never disagree on screen. When the
index fetch fails (the case `main.ts:345` already handles) the select carries the
non-Bambu rows and Custom; nothing waits on it.

## Can play

A number input "Can play" in the Can fieldset, `min 1 max 10 step 0.5 value 3.5`, with the
hint: "Room along the lane, split between the can's ends. Cans vary a millimetre; a can
on its rim sits tilted and takes more. Raise it if they bind." It goes into `LIMITS` as
`clearance` 1–10, into `optionsFrom()`, and into `KEYS`.

This is not a joint knob. `fit` is added to every clearance between two printed parts and
stays the one knob for that (CLAUDE.md). Can play is between the print and the can, the way
`lipGap` is between the print and the can leaving it.

`IW = round1(canL + clearance)` (`src/geometry.ts`), so a change moves `OW`, `gangPitch`,
the lane's width on the shelf and every part's Y extent. The layout list re-ranks on edit
as it does for any field. `ref.json` does not move: the snapshot is `clearance` 3.5.

## Tests

- `test/validation.test.ts`: `clearance` outside 1–10 is refused by name; `canL` 30 passes,
  29 does not.
- `test/solver.test.ts`: `clearance` 5.5 on the default shelf gives `IW` 128 and one fewer
  lane across a 290 mm shelf than 3.5 does.
- `test-ui/share.ui.test.ts`: the hash round-trip case adds `clearance`; picking a shelf
  preset writes the three fields and typing in one flips the select to Custom; the bed
  preset and the printer picker agree after either is used.
