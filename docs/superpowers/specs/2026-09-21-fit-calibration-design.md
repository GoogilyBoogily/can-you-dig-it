# Fit calibration

## Amended 2026-09-22, after review

Where this block and the text below disagree, this block wins. Nothing here is built.

- **`accuracyOverrides()` is dropped, all six keys.** `xy_hole_compensation` and
  `xy_contour_compensation` are already 0 across the catalogue. `elefant_foot_compensation`
  0.15 is what the default P2S process already flattens to, and it touches one layer of a
  tab's fifteen. `precise_outer_wall` is `comDevelop` (the user cannot see or reset it)
  and has an open bug, BambuStudio #8030, that moves every wall inward. A `fit`
  calibrated on that bug is wrong the day it is fixed. `precise_z_height`'s reason is
  wrong: `pinH` is a print-Y dimension (`tabBox`), not Z. `wall_loops` 3 halves the six
  walls of a Strength preset.
- **If any pin ever comes back:** bump `FORMAT_VERSION` (a cached profile is composed
  bytes and never recomposes), decide what an imported 3MF gets (`export.ts` writes it
  byte for byte, so `composeProfile` never sees it), and test that every written key
  exists in BambuStudio's `PrintConfig.cpp`. On the JSON path one unknown key aborts the
  whole config load. Keys sourced from Anker's catalogue are exactly how an unknown key
  gets in.
- **The coupon is replaced by a rung strip on a real lane's plates.** Print all 11
  detents of the slider, not a 5-window: the window clamped at the slider's ends, gave
  identical rungs different tallies, and a coarse-then-fine second pass cannot exist at
  a fixed 0.05 step. Pin the strip's orientation (no 90° turn in `pack()`) and pack it
  into the strip behind a deck, so it prints under the same thermal history as the
  joint it calibrates.
- **The tab is 3 mm in print Z in the real wall** (`platePose("wall-right")` rotates
  lane-y to Z) and mates with an XY slot. A coupon that grows every male +Z measures XY
  against XY. The rung's male tab has to lie the way the wall's does.
- **The test assertion below does not hold.** Ear, pin and cross-lap grow in x only (y is
  a through-cut, z one-sided), and `test/features.test.ts` already asserts `[0]` alone.
  Its `grownBy` is not exported.
- **What no coupon sees:** `pack()` may turn a deck and its wall 90° from each other. A
  0.1 % bed-axis mismatch over 240 mm is 0.24 mm of ear-to-notch pitch, the whole
  clearance, and `fit` opens every joint equally and cannot correct pitch. Print one
  default lane first.

### Decided 2026-09-22, second interview

Print first. Export the default two-wide job at fit 0 and print at least two top decks
and their walls, the smallest set that exercises the gang joint. The rung strip is built
only if that print shows joints binding or rattling, and in the direction it shows.

## Why

Nothing here has been printed. `o.fit` is the only tolerance knob - `clearanceOf(o)` is
`K.cl + o.fit` and every joint goes through it - and the only guidance for setting it is
the slider hint, "Nudge + if joints bind, − if they rattle." The check the drop-in joints
spec asks for is a 240 mm lane, four plates, hours, judged by feel, at one `fit` value a
print. Finding a printer's number that way is a day.

Two problems, and they are not the same problem.

The loop is too slow to close. A printer's XY error is one number and the slider has
eleven detents. Sampling five of them should be one print, not five.

A right `fit` does not repeat. `composeProfile` names three presets and lets Bambu Studio
fill in every value from them, so whatever moves a printed dimension rides on the process
preset the user picked. `elefant_foot_compensation` is 0, 0.075 or 0.15 across the BBL
catalogue. `precise_outer_wall` is off in all of it, and without it a two-wall shell
prints about 0.086 mm thin at 0.2 mm layers - straight off the mating face of a 3 mm tab.
Calibrate under one process, export under another, and the joints move.

## The coupon

The female is the male grown by `clearance`; the male is the exact shape. `tabBox` is
nominal and `tProfile` grows only the female. So a ladder of fit values is **one male and
one female a rung**, not a pair a rung. Six parts:

- `fit-male` - one plate, every male as a boss growing +Z, all nominal: the ear (24 ×
  `wall + earRoot` × 4), a 16 × 3 tab, a pin (16 × 3 × 2.4), a cross-lap post (`wall` ×
  `wall`), the splice tongue (`spliceBase` 30 neck, `spliceTip` 40 head).
- `fit-female-1` … `-5` - the same five features as their females, cut at `K.cl + fitN`,
  plus N tally holes.

The ladder is five rungs at the slider's own 0.05 step, centred on the current `fit` and
clamped into `LIMITS`. At the default that is −0.10, −0.05, 0.00, +0.05, +0.10, so what
the coupon reports is a slider position and not a number to interpolate.

Every male is a prism off the print face and every female a hole or a pocket in it, so
the coupon is flat-pack by construction and `test/overhang.test.ts` covers it with no
special case. It goes through `pack()` and `threeMf()` like any other part - a new
`format: "fit"` in the worker, a third button, no layout code.

The splice T carries the gang joint too: both are `tProfile(grow)`, and the splice head
is the larger of the two. Marking is tally holes because there is no text geometry in the
repo and manifold has no glyph.

## Reading it

Press each rung onto the male. The one that goes without persuasion and does not rattle
is the number. Set the slider to it.

Run the printer's flow-rate and flow-dynamics calibration for that filament first.
Tolerance is calibrated last, after the extrusion is already right - chasing fit numbers
through an untuned K value is measuring a moving target.

## Pinning what it was measured under

`different_settings_to_system` moves out of `translucentOverrides` and up into
`composeProfile`, which merges the override records from more than one source and emits
the list once from the merged keys. `accuracyOverrides()` is the second source and is
always on:

| key | value | why |
|---|---|---|
| `xy_hole_compensation` | 0 | 0 across the catalogue, pinned so an imported project cannot carry a different one into a calibrated `fit` |
| `xy_contour_compensation` | 0 | same |
| `elefant_foot_compensation` | 0.15 | the one that varies, and the one that would quietly invalidate the coupon |
| `precise_outer_wall` | 1 | off in every BBL preset, and the 0.086 mm is per shell, on the mating face |
| `precise_z_height` | 1 | `pinH` and `coverT` are 2.4, which not every layer height divides |
| `wall_loops` | 3 | perimeters and not infill on every mating face. The only one here with a print-time cost |

All six are scalars in the catalogue, so this path needs no `perSlot` and no
`print_extruder_variant`. Accuracy merges first and translucent last: translucent's
`wall_loops` 1 is deliberate and wins.

`precise_outer_wall` and `precise_z_height` appear in no BBL process preset. They are in
the BambuStudio binary and in Anker's `fdm_process_common.json`, so they are schema keys
sitting at a built-in default, and writing them is the only way to turn them on.

The process preset now always opens as "(modified)". That is the point of the mechanism
and there is no switch for it.

Not pinned, on purpose: `layer_height` and `line_width`, which are the user's process
choice, and `filament_shrink`, which is per material and which `fit` already absorbs.

## Tests

`test/fittest.test.ts` is new and pure: six parts, the male identical across rungs, and
for every rung `grownBy(male, female)` equal to `K.cl + fitN` on both in-plane axes -
the helper from `test/features.test.ts`, which is what makes the assertion mean
something, since containment alone passes on an oversized female. Tally count equals the
rung. Every part fits a 256 bed.

`test/profiles.test.ts` asserts today that `different_settings_to_system` is absent when
translucent is off. Accuracy overrides make it always present, so that assertion changes
to the accuracy keys being listed and to translucent's `wall_loops` winning. A behaviour
change, not an assertion loosened to get a pass.

`ref.json` is not regenerated. No existing geometry moves, and the coupon's own clearance
assertions are a tighter check than a volume snapshot.

## Not in this

Feature thicknesses are not whole line widths. `tabT` 3, `pinH` 2.4 and `web` 3.5 are
7.14, 5.71 and 8.33 lines at 0.42. Real, and worth doing, and it moves every number in
`ref.json`, so it is its own change. A warning instead would fire on every configuration
and be noise.

One `fit`, one slider - no per-axis and no per-material split until a coupon shows a
machine that needs one. No store of calibrated values either: `fit` already rides the
URL hash, and a database for one number is a database for one number.

## Status, 2026-09-21

Designed, not built.

Not done:

- All of it.
- Nothing printed, still. The coupon is the first thing to print, and until one comes off
  a bed the six numbers in the table above are read off a catalogue and a binary, not off
  a part.
