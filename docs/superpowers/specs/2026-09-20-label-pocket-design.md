# Label pocket on the end-lip

A Label checkbox. On, the end-lip's outer face gets a shallow pocket either side of the
scoop for a paper or tape label. Nothing else changes.

## Why

The food-tin dispensers on MakerWorld and Printables with the most makes all have a label
plate, and their comment threads ask for one where it is missing: a pantry lane full of
tins is the back of ten identical cans. The lip is the one face of a lane that looks at
the user, and it is already a flat plate printed outer face up, so a pocket in it is legal
under the flat-pack rule and costs no support and no new joint.

A pocket, not a slide channel or a snap-in plate: a channel needs a lip over the label,
which is an overhang on a face-up print, and a plate is one more part with one more fit.
Paper under a strip of tape, or a 12 mm label-maker label, sits in the recess and reads
flush.

## Geometry

The lip (`buildLip`) is `lipH` 20 tall by `IW − 1 − 2·fit` wide by 5 thick, rounded 2 mm
on the outer face, with a r22 scoop centred 12 mm above the top edge that cuts 10 mm deep
into it at the middle and is 36.9 mm wide at the edge. That leaves two fields, one each
side of the scoop, each `(IW − 1 − 36.9) / 2` wide: 44 mm on a 12 oz lane, 49.8 on a slim
one, nothing on a cat-food lane.

One pocket per field, when the field is at least 24 mm wide:

- 1 mm deep into the outer face, 4 mm of blade left. The two tabs sit past the blade's
  bottom edge in x, on their way down through the deck, and never meet the pocket.
- 12 mm tall, from 3 mm below the top edge: clear of the 2 mm round, the height of a
  12 mm label tape, and 5 mm of blade left below it to the deck.
- The scoop's keep-out is its width at the top edge, 36.9; lower down the scoop is
  narrower and the pocket's edge stands further from it, which is the safe side.
- As wide as the field minus 3 mm at the scoop and 3 mm at the outer end, capped at 50.
- Square corners. A blade fits a square corner; a rounded one is a place a label lifts.

Both pockets are cut whether the user labels one side or both. The lip is a rounded prism
so `roundTop` runs first and the pockets are subtracted from the result; the pocket floor
is flat, the sides vertical, no downward face.

A flat stack has a lip on every tier and so a pocket on every tier, which is what a stack
of three different tins wants. A cascade has one lip.

## Interface

`o.label: boolean`, default off, in `Options`, `optionsFrom()`, `KEYS`, and a checkbox in
the Options fieldset: "Label pocket on the lip (12 mm tape)". `DEFAULTS` is extended, not
changed, so no existing `ref.json` key moves.

## Tests

- `ref.ts` builds one `label-end-lip` (default can) and the snapshot pins it; the diff on
  `bun run ref` adds that key and touches nothing else.
- `test/lip.test.ts` (new): the labelled lip is lighter than the plain one by the two
  pockets' volume within 1 %; a probe slab 0.5 mm thick at the outer face plane over each
  pocket is empty; on `canL` 37 (cat food) the labelled and plain lips are identical.
- `test/overhang.test.ts` and `test/islands.test.ts` pick the part up from the snapshot.
