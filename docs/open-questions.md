# Open questions

Concerns and decisions we've parked for later. Each one says what's open, what the code
does today, and where it lives, so whoever picks it up doesn't have to rebuild the context.

When one gets decided, mark it resolved with the date and put the decision where it
belongs: a design-rules bullet in `CLAUDE.md`, a spec in `docs/superpowers/specs/`, or a
code comment. Resolved entries retain the original evidence for comparison.

## Snap joins (added 2026-10-11)

- **The snap numbers are first guesses.** `K.snapCatch` 0.5, `snapLen` 7, `snapFlare` 2,
  the pin's 30°-off-square return and 45° lead-in, the tab's 45° return: sized by the
  cantilever strain formula for PETG at 2.5 %, not printed. The coupon (`bun run
  coupon.ts`) carries every snap; print it on the P2S in translucent PETG and check that
  each one goes in by hand and remains seated. Permanent assembly is acceptable
  (owner, 2026-10-15); repeated disassembly is not a requirement. Then qualify a complete
  lane with its intended load, supporting the bottom whenever it is moved.
- **Resolved in geometry 2026-10-15: uncovered end-wall retention.** Printed tabs now
  snap the end wall onto the deck, independently of the cover. Before this change,
  only the cover or next tier prevented upward removal. The new catches still need
  the coupon and a complete lane printed; there is no validated load rating.
- **Resolved design target 2026-10-15: clean shell and supported handling.** Use printed
  joints and hidden printed seam keys, retain recessed patterns inside flush frames,
  and expose expansion features only on selected sides/top. Wall halves join along X
  on their keys before snapping down; the cover halves also key together before they
  lower onto blind pin catches. The owner moves the loaded dispenser from underneath,
  not by its cover. Stringing/clumps have interfered with earlier connectors; those
  prints predate the current snaps. Clean mating surfaces before judging clearance.
- **Digital qualification 2026-10-15; physical fit remains open.** Both final coupon
  plates and all 20 default-job plates slice with the faithful P2S 0.4 mm / 0.2 mm
  Translucent profile, without internal error diagnostics or supports. Exact unchanged
  plate inputs were reused after selective cover/key reslicing. Key probes at fit
  −0.2, 0 and +0.3 in both bed axes retain continuous first-layer rails/end bridges and
  all four collar bearing regions around their midplane. Some upper tips narrower
  than one line terminate early in the slicer. The approximate bead model cannot
  establish zero play or preload at +0.3, where elephant-foot compensation reduces
  the lower bearing area. At fit 0 and every nonzero fit actually chosen, print the
  wall/key and cover/key pairs, seat them by hand, check flush faces/no visible step,
  then try normal and vertical wiggle/pull in both directions without release. This
  does not establish a loaded handling strength rating; bottom support remains the
  design requirement. Local evidence: `.slice/joint-bambu-qqxgHm/qualification-combined.json`.
- **Units mate only when printed from the same settings.** The tongue positions come from
  `laneOf`, so two jobs at different lengths or cans do not line up. The UI says so; the
  app cannot compare two print jobs.

## Shared stack walls (added 2026-10-17)

- **Compatible whole boundaries are implemented as an opt-in.** Matching stacks can
  share one neutral divider with independent deck ears, end-wall half-posts and
  caught cover fingers; different lane widths remain supported. Incompatible or
  unplannable boundaries retain both original walls and their spline with a visible
  reason. Version-4 links carry the request; older mixed links keep sharing off.
  Arbitrary unequal-depth/height or partial-boundary sharing still needs a separate
  mechanism; do not force common tier spacing or resize a stack to obtain savings.
- **Review defects corrected (2026-10-18).** Shared covers and primary-ear/follower-
  rail interfaces now have the selected fit clearance. The follower rail is relieved
  without shortening the primary bearing or slot frame. Thick split covered
  boundaries retain both walls if the original cover-key socket would lose its
  minimum support ligament; unsplit/uncovered variants remain eligible. Primary
  print envelopes no longer include a follower collar. Regression cases cover
  fit endpoints, reversed cascade hands, actual key/cover collisions, and the
  389.5 mm shelf requirement for a printable 234/122.5 mm unequal-width pair.
- **Digital evidence is separate from physical qualification.** The 0.6 mm shared
  pin crest preserves the qualified return/root geometry and requires additional
  top headroom. The mechanical prototype passed its recorded geometry/toolpath
  gate; production generation and final evidence are tracked in the
  [shared-wall qualification record](superpowers/specs/2026-10-17-shared-stack-walls-qualification.md).
  No shared-joint hand fit, creep, load rating or cover-lifting claim is established.
  After printing the fresh coupon, qualify a complete paired/triple assembly with
  both-full and one-sided loading, including a multi-section example. Keep loaded
  handling supported underneath and agree the actual load/dwell before testing.
- **Joint/cut planning expanded (2026-10-20).** Flat two-section sharing failures
  now search cut and support/clip positions together, preserving original outer
  bearings and frozen support-span limits. The reported 292.1 mm, 5° two-tier
  triple passes actual assembly, stored-can extremes, retention and packing at
  fits −0.2, 0 and +0.3. Fresh toolpath qualification is recorded separately from
  physical fit/load testing. The bounded fallback does not yet expand failing
  cascade/multiple-cut plans or reconcile different section counts. Report an
  exhausted search accurately; do not present it as proof of physical impossibility.
- **Inherited cascade loading-window corner play remains open.** Centered vertical
  can loading clears. At the full axial can displacement, rounded window corners
  can clip the cylinder; the same limitation exists without shared walls. Stored
  can extremes clear and shared collars must add no new loading contact. Do not
  treat matching legacy collision volume as a physical loading qualification.

## Independent can rows (added 2026-10-19)

- **Custom rows now have real support parts.** Independent lane counts, can sizes,
  row height/span/alignment and explicit repeats use a carrier and retained shoes,
  adding 14.1 mm per transition. The editor, v5 links, preview and printable export
  share the same physical manifest. Common-depth whole/two-section transitions
  have a bounded support envelope; unqualified seams, overhangs and key/slot host
  conflicts fail explicitly. Multiple rows currently retain separate walls with
  a visible reason; a single physical row can share compatible dividers.
- **Digital coverage is distinct from physical trials.** Fresh three-fit, both-axis
  shoe and carrier/receiver probes pass, and the complete 112-piece example slices
  on 24 P2S plates. Hand fit, loaded dwell/creep and one-sided loading remain open.
  The compact-repeat key allocator now reserves the final slot/flare envelope;
  depths 180/200/240/250 mm pass all three fits and 1,296 new both-axis toolpath
  probes. A corrected 240 mm complete export also slices on 11 plates.
  See the [qualification and assembly protocol](superpowers/specs/2026-10-19-independent-can-rows-qualification.md)
  for exact evidence, process settings and trial order. Agree actual loads/dwell
  before trials and support loaded handling underneath.

## Load from the back (`o.rearLoad`, added 2026-09-29)

- **Nothing braces the side walls at the open end.** The end wall's body is what stops the
  side walls closing in, and the open tier doesn't have one. The deck ears still hold the
  bottoms apart, and the cover's pin holes hold the tops. Without a cover, I think the
  rear end of the top tier's walls is free to lean in. Unprinted, so we don't actually know
  yet. Options: print one and see, add a tie across the top (it can't go at the bottom,
  that's a stop), or warn when `rearLoad` is on and `cover` is off.
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
## Clear PETG settings (proposed 2026-09-30)

Full comparison, plan and test steps in
`docs/superpowers/specs/2026-09-30-clear-petg-design.md`. The MakerWorld "Clear as glass
PETG" 3MF is Bambu's 0.4 demo process plus a cooler filament. What's still open:

- **Layer height, 0.1 or 0.2?** Theirs is 0.1. Ours is 0.2 because 0.1 doubles every
  translucent hour. A tile test on the P2S decides it. I'm leaning 0.2.
- **Nozzle 265 or 270?** Theirs is 265, Bambu's wiki says 270. The same tile test picks.
- **Bed 60 °C on PETG: built 2026-09-30.** It moves the elephant foot, so any `fit` number
  found on translucent at 70 °C won't carry over.
- **Test assertions will move.** `test/profiles.test.ts` pins 270 and, if layer height
  flips, 0.2. They change because the spec does. Review them with the spec.

## Project-wide

- **The lane prints in translucent PETG on the smooth PEI plate (owner, 2026-09-30).** So
  the coupon does too. The app still writes the printer's default plate (textured) and has
  no plate picker; switch it in Bambu Studio, or add a picker if that gets old. The coupon
  prints at today's translucent values (0.2 mm layers, 270 °C): if the tile test flips D1
  or D2 above, the coupon's fit reading may not carry over.

- **Current joints remain unqualified.** The owner has successfully assembled earlier
  printed connectors, aside from stringing/clumps (2026-10-15). Those prints predate
  the current snaps, blind cover catches, seam keys and end-wall retention. The target
  setup is Bambu Lab P2S, Bambu PETG Translucent, 0.4 mm nozzle, 0.2 mm layers; no fit
  measurements have been taken. Print the updated coupon and then one complete lane
  before the full assembly. Geometry tests cannot establish the strength of those prints.
- **The three 2026-09-21 specs are partly built.** Read the "Amended 2026-09-22" block at
  the top of each before anything else; they carry the review verdicts and the second
  interview's decisions, and they win over the body text.
  - `2026-09-21-sleek-outside-design.md`: built (`e58c03d`), `deck-end` dropped. Nothing
    left open.
  - `2026-09-21-print-cost-design.md`: the `filamentGrams` fix and the hours line are
    built at that date. The hours line was removed on 2026-10-15 (see resolved entry
    below). Loop term, slabs on layers, `reduce_crossing_wall` and baked keys were dropped.
    Arachne only ever with `wall_distribution_count = 1` pinned beside it.
  - `2026-09-21-fit-calibration-design.md`: nothing built, on purpose. It waits on the
    first print (see Next steps).
- **`pack()` turns parts 90° on their own.** A deck and the wall that notches over it can
  print on different bed axes. A printer 0.1 % off between X and Y is about 0.24 mm of
  ear-to-notch pitch over a 240 mm half, which is the whole clearance, and `fit` can't
  fix pitch because it opens every joint equally. Only a print shows whether it matters.
  If it does: never turn a deck or a side wall.
- **Resolved 2026-10-15: fixed reference assumptions in material estimates.** The UI
  now uses `src/estimate.ts`, resolving the selected process/filament and project overrides
  for perimeters, infill, distinct skins and density; missing values are shown explicitly.
  Profile changes recalculate from cached meshes. Supports, adhesion and purge remain
  excluded, and accuracy against real sliced jobs still needs calibration. Historical
  reference-model evidence: against Bambu Studio on the default job `filamentGrams` was
  +4.6 % (at our PETG density 1.27 against Bambu PETG Basic's 1.25, +6 % raw). Decks land
  within ±3 %, walls and covers +8 to +10 %. Good enough for a "~" number. The model
  assumed 6 % infill while the stock 0.20 Standard process used 15 % grid, so the hint
  and the selected process disagreed. The UI no longer applies that fixed model to every profile.
- **Resolved 2026-10-15: removed the universal print-hours number.** The UI delegates
  time to the slicer rather than predicting every printer and filament from one flow.
  Historical evidence: `JOB_FLOW` was 7.95 mm³/s, measured on the P2S (0.20mm Standard, Bambu PETG Basic): 40.4 h for the
  default job, plates spread ±10 % around it. An X1C came out 7.77. PLA and the H2D's high
  flow entries were not calibrated. `bun run slice.ts` remains available for real slicer
  measurements; a future time model would need validation beyond volumetric speed scaling.
- **Outer-wall acceleration was the "biggest lever" and isn't.** Raising it to 10000 saved
  0.8 % on the P2S (stock 6000) and 1.1 % on the X1C (stock 5000); PETG time is flow-capped,
  not acceleration-capped. Not baked. Don't re-open it without a slice that says otherwise.
- **The bed keep-out is one rectangle, and it costs two plates.** `keepOutFromConfig` in
  `src/profiles.ts` takes the bounding box of `bed_exclude_area`, exact for every printer
  that has one today (X1, X1C, X1E, P1S, P1P: 18 × 28 mm front-left). An L-shaped area
  would need the polygon split. On those printers the default job is 20 plates, not 18,
  because a 240 mm part can't pass beside the corner on a 256 bed. A smarter packer
  (put the short parts in the corner's row) might win them back.
- **Lanes under ~260 mm stand loose in a gang.** There's no clear stretch of rail for a
  tongue. `check()` warns and that's all.

## Next steps

Multi-section lanes (2026-10-17) reuse the current T joints and hidden seam keys,
with additional ears, interior retaining pins/catches and base supports. Digital
conservation, fit and manufacturing checks do not establish loaded strength or
long-term creep. Print one complete lane with at least three sections after the
coupon passes; check all seams under the actual can load, record dwell and residual
set after unloading, and keep handling supported from underneath. No numeric load
rating or cover-lifting capability is established.

In order. The first one decides most of what comes after it.

1. **Print the coupon.** `bun run coupon.ts`, open the output path it reports in Bambu Studio (P2S 0.4,
   PETG Translucent, smooth PEI, fit 0; check the plate shows Smooth PEI at 60 °C) and
   print every generated plate. An existing `coupon.3mf` is preserved; a fresh output
   goes under `.slice/` instead. Photograph each plate before taking pieces off. Judge in this order,
   destructive check last:
   - **Flat and clean:** every piece lies flat on a table; no strings across cells or notches.
   - **Elephant foot:** run a finger along each bed-face edge; note any flare, and on which
     joints it is the part that binds.
   - **Fit, per pair (the header of `coupon.ts` lists them):** the target is a snug push by
     thumb with no wiggle once seated (owner, 2026-09-30: the shelf is built once, rarely
     taken apart). Grade each pair: *drops in* (too loose), *thumb push* (right), *needs a
     tool or won't go* (too tight).
   - **Pitch:** both same-axis pitch pairs seat all three ears at once; then the crossed
     pair (`pitch-deck-x` + `pitch-wall-y`).
   - **Seams and blind catches:** wall/cover halves slide onto their printed keys by
     hand and seat with flush outer faces and no visible step. The cover catches engage
     inside the solid outer skin. The end-wall tab remains seated in the deck without
     relying on a cover. Wiggle/pull the keyed pairs both normal to the face and
     vertically, in both directions, at fit 0 and any chosen nonzero fit. Check the
     negative-fit minimal wall sample retains its tab root.
   - **Clarity:** how clear the solid pieces come out at 0.2 mm and 270 °C.
   - **Tab strength, last:** on a spare piece (`wall-pin-bottom`), push a tab sideways
     until it gives: bends back, snaps at the root, or splits along a layer.
2. **Act on it.**
   - Every pair right: print every part of one complete lane at fit 0, including its
     seam keys. Use the current manifest rather than historical plate numbers.
   - Every pair off the same way: a ladder coupon - the joint pieces at three or four fit
     values on one plate - picks the value, then the lane. (Not built; `coupon.ts` builds
     one fit today.)
   - One pair off: that joint's geometry, not `fit`.
   - Same-axis pitch pairs fit and the crossed pair does not: stop `pack()` turning decks
     and side walls.
   - Tabs snap at the root or split on a layer: a strength problem for geometry or
     settings, before any lane is printed.
3. **Then the lane**, checked as the coupon was, plus: plates flat with no warp on the
   240 mm halves, and two decks set side by side keying at the tongues.
4. **Then the rear-load print questions above** (bracing without a cover, the 3 mm
   headroom), which a print of a rear-load top tier answers the same way.
5. **Small things, whenever:** the layout card's rough gram estimate for rear-load.
   Calibrate the profile-aware built-part estimate against sliced jobs; the universal
   `JOB_FLOW` UI estimate was retired on 2026-10-15.

## How to re-measure print time

`bun run slice.ts` builds the default job, packs it for the machine given (P2S 0.4 by
default), slices every plate with the installed Bambu Studio's CLI, and prints Bambu's
time and grams per plate beside the legacy reference estimate, with the implied
flow labelled `JOB_FLOW` for historical comparison. The UI no longer uses that constant. The second argument
is a JSON of process overrides, for trying a key before baking it. Output lands in
`.slice/run-*`, git-ignored; every run retains its model, presets, G-code and logs.
Internal slicer errors fail validation even when Bambu returns exit code 0.
The file's header says why the presets are flattened by hand. See
[the ZFiller investigation](zfiller-diagnostics.md) for the reduced convex-wedge
reproducer and the remaining upstream floating-infill defect.


## Exact shared-wall stock-profile slicing (2026-10-20)

The 292.1 mm, two-tier reported link now generates and exports 24 cans with both
shared boundaries. The exact browser download uses manual pattern radius 13 mm
and stock P2S Standard/PETG Translucent/Textured PEI settings. A fresh 23-plate
Bambu 02.08.02.61 run emitted 20 ZFiller internal errors despite exit/result zero;
strict qualification fails. All 736 nominal functional centerline screens pass,
but this does not establish clean toolpaths or physical assembly. The earlier
all-fit/both-axis tuned-profile radius-16 qualification covers its own recorded
configuration. Preserve both scopes; do not present it as exact-link qualification.
See the updated [shared-wall qualification](superpowers/specs/2026-10-17-shared-stack-walls-qualification.md)
and [existing slicer investigation](zfiller-diagnostics.md). No profile disabling,
geometry distortion or installed-app patch has been adopted.
