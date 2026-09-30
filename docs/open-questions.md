# Open questions

Concerns and decisions we've parked for later. Each one says what's open, what the code
does today, and where it lives, so whoever picks it up doesn't have to rebuild the context.

When one gets decided, delete it here and put the decision where it belongs: a
design-rules bullet in `CLAUDE.md`, a spec in `docs/superpowers/specs/`, or a code comment.
This file only holds what's still open.

## Load from the back (`o.rearLoad`, added 2026-09-29)

- **Nothing braces the side walls at the open end.** The end wall's body is what stops the
  side walls closing in, and the open tier doesn't have one. The deck ears still hold the
  bottoms apart, and the cover's pin holes hold the tops. Without a cover, I think the
  rear end of the top tier's walls is free to lean in. Unprinted, so we don't actually know
  yet. Options: print one and see, add a tie across the top (it can't go at the bottom,
  that's a stop), or warn when `rearLoad` is on and `cover` is off.
- **The open tier's side walls still have an empty corner slot.** A flat stack's tiers
  share one set of side walls, so the top tier can't be unslotted without its own wall
  parts (two more part names). Cosmetic, I think, but it's a notch in the wall top right
  where you slide cans in. Decide: live with it, or give the rear tier its own walls.
- **Even tier count in a cascade: warn or disable?** The top tier's back is its chute
  there, so nothing opens and `check()` warns. The checkbox stays clickable. Greying it out
  would say it up front, but the form doesn't know the tier count until a layout's picked.
- **~3 mm of headroom.** A can passes over the deck at the open end with about 3 mm to
  spare on the default job (`H = dhi + canD + topgap`). A can a hair over its nominal
  diameter, or a deck printed a bit proud, and it jams at the door. `K.topgap` is the knob
  if a print says so. Don't add a per-feature one.
- **The layout estimate still counts the missing end walls.** `solver.ts` charges a flat
  `laneGrams` per lane. The totals after a build come from the real parts and are right.
  Only the number on the layout card reads high. Fix it if anyone notices.
- **A flat stack only opens its top tier.** Its lower tiers are separate lanes, not fed
  through the top one, so they still load from the front. If loading every tier from
  the back matters, that's per-tier parts again (see the corner-slot item).

## Project-wide

- **Nothing has been printed yet.** Every joint, clearance and `fit` default is untested
  on a real printer. The 2026-09-21 reviewers' consensus was to print one default lane
  before building anything else. That's still the thing that retires the most of this
  list at once.
- **The three 2026-09-21 specs are partly built.** Read the "Amended 2026-09-22" block at
  the top of each before anything else; they carry the review verdicts and the second
  interview's decisions, and they win over the body text.
  - `2026-09-21-sleek-outside-design.md`: the clean-frame recess and the wider minimal
    socket plinth are built (`e58c03d`); `deck-end` was dropped. Nothing left open but the
    minimal ratio below.
  - `2026-09-21-print-cost-design.md`: the `filamentGrams` fix and the hours line are
    built. Loop term, slabs on layers, `reduce_crossing_wall` and baked keys were dropped.
    Arachne only ever with `wall_distribution_count = 1` pinned beside it.
  - `2026-09-21-fit-calibration-design.md`: nothing built, on purpose. It waits on the
    first print (see Next steps).
- **The minimal ratio limits moved on 2026-09-24.** The recess frame costs the 1.7 mm
  minimal web more than the 3.5 mm standard one, so minimal/standard lane volume went to
  0.604 top and 0.563 bottom, and `test/regress.test.ts` now allows 0.62 and 0.58 (was
  0.6 and 0.55). That followed a decision rather than hiding a bug, but it's the one
  test limit loosened in this stretch. Veto it by finding the ~2 % somewhere else in
  minimal.
- **`pack()` turns parts 90° on their own.** A deck and the wall that notches over it can
  print on different bed axes. A printer 0.1 % off between X and Y is about 0.24 mm of
  ear-to-notch pitch over a 240 mm half, which is the whole clearance, and `fit` can't
  fix pitch because it opens every joint equally. Only a print shows whether it matters.
  If it does: never turn a deck or a side wall.
- **`filamentGrams` reads a bit heavy.** Against Bambu Studio on the default job it's
  +4.6 % (at our PETG density 1.27 against Bambu PETG Basic's 1.25, +6 % raw). Decks land
  within ±3 %, walls and covers +8 to +10 %. Good enough for a "~" number. The model
  assumes 6 % infill and the export hint says 6 % gyroid, but the stock 0.20 Standard
  process is 15 % grid and we don't write infill into the config, so the hint and what
  gets printed disagree.
- **One print-hours number for every printer and filament.** `JOB_FLOW` in `src/main.ts`
  is 7.95 mm³/s, measured on the P2S (0.20mm Standard, Bambu PETG Basic): 40.4 h for the
  default job, plates spread ±10 % around it. An X1C came out 7.77. PLA and the H2D's high
  flow entries will be off. Upgrade path: scale by the filament's max volumetric speed once
  the profile scraper pulls it into the index. Re-measure with `bun run slice.ts`.
- **Outer-wall acceleration was the "biggest lever" and isn't.** Raising it to 10000 saved
  0.8 % on the P2S (stock 6000) and 1.1 % on the X1C (stock 5000); PETG time is flow-capped,
  not acceleration-capped. Not baked. Don't re-open it without a slice that says otherwise.
- **The bed keep-out is one rectangle, and it costs two plates.** `keepOutFromConfig` in
  `src/profiles.ts` takes the bounding box of `bed_exclude_area`, exact for every printer
  that has one today (X1, X1C, X1E, P1S, P1P: 18 × 28 mm front-left). An L-shaped area
  would need the polygon split. On those printers the default job is 20 plates, not 18,
  because a 240 mm part can't pass beside the corner on a 256 bed. A smarter packer
  (put the short parts in the corner's row) might win them back.
- **The gang row's end lane keeps a stub of tongue out of its +Y side.** Trimming it means
  a separate end deck and a fifth plate name. We judged it not worth it on 2026-09-22.
- **Lanes under ~260 mm stand loose in a gang.** There's no clear stretch of rail for a
  tongue. `check()` warns and that's all.

## Next steps

In order. The first one decides most of what comes after it.

1. **Print one lane at `fit` 0 on the P2S.** Default shelf (300 × 520 × 240), P2S 0.4,
   0.20mm Standard, Bambu PETG Basic, Download 3MF. Print both top deck halves (plates
   5–8) and the four top wall halves (plates 15–18): the smallest set with a gang joint,
   a splice, ears, tongue notches and the new frame. Check, in this order:
   - plates flat, no warp on the 240 mm halves;
   - each wall drops over the deck's ears and tongues and its tabs go through the slots;
   - the two deck halves drop together at the splice T;
   - two decks set side by side key at the tongues without forcing;
   - the ears at both ends of a half line up with their notches (pitch, see above).
2. **Act on what it shows.**
   - Joints bind or rattle evenly: build the rung strip from the amended fit-calibration
     spec, in the direction the print points.
   - Only the far ears miss: that's pitch. Stop `pack()` turning decks and side walls.
   - Walls lean or warp: that's geometry, not `fit`.
3. **Then the rear-load print questions above** (bracing without a cover, the 3 mm
   headroom), which a print of a rear-load top tier answers the same way.
4. **Small things, whenever:** the layout card's gram estimate for rear-load, the
   6 %-gyroid hint against the 15 % the process prints, scaling `JOB_FLOW` by filament.

## How to re-measure print time

`bun run slice.ts` builds the default job, packs it for the machine given (P2S 0.4 by
default), slices every plate with the installed Bambu Studio's CLI, and prints Bambu's
time and grams per plate beside ours, with the `JOB_FLOW` they imply. The second argument
is a JSON of process overrides, for trying a key before baking it. Output lands in
`.slice/`, git-ignored. The file's header says why the presets are flattened by hand.
