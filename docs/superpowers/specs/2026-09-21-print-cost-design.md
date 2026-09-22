# Print cost: time, error, travel

## Amended 2026-09-22, after review

Where this block and the text below disagree, this block wins.

- **Built: the sampling fix**, stronger than written below. `filamentGrams` cuts the
  height into whole steps of at most 0.5 mm, never fewer than eight, sampled at their
  middles. At 1.5 mm with `n = ceil(h/dz)` alone the cover was still +15 %: at two samples,
  `skin` puts both probes off the faces of a 2.4 mm plate and it counts solid. The old
  cover error was +43 %, not +25 %. The count formula below is also wrong: the old loop
  took `ceil(h/dz − ½)` samples, not `ceil(h/dz)`. The constant that moved is
  `coverGrams` on `solver.ts:111` (130 → 85, minimal 90 → 60), not `laneGrams` on
  `:110`, though the gang fix moved that too (325 → 315, minimal 250 → 260).
  `test/regress.test.ts` holds five parts to 8 % of a 0.1 mm sampling.
- **Hours: the loop term is dropped. Keep the duty factor** from
  `2026-09-20-print-estimate-design.md`. Fitted on hex, the loop model came out
  −10.5 % on slat and +13.9 % on kumiko against a plausible truth, and the duty factor
  ±1 %. The time a printer is not extruding tracks path length (acceleration), not loop
  count: hex to slat cuts loops 46 % and perimeter path 3.7 %. The 0.6 s seed, the
  0.17 s a loop actually costs, and the 8.15 s/loop that `DUTY` 0.45 implies are 13×
  apart. Show hours with the constant's source job in its comment, or grams only.
- **Flow arithmetic below is 10–11 % high.** An extrusion is `h·(w − h(1 − π/4))`,
  0.0754 mm² at 0.42 × 0.2, not 0.084. The cap is 198.9 mm/s, not 178.6, and the outer
  wall and top surface at 200 mm/s are at the cap (15.08 mm³/s), not over it. PETG Basic
  on the X1C retracts 0.4 mm (the filament overrides the machine's 0.8). Layout-order
  travel on the default job is about 16 minutes, not a minute. `pack()` still stays.
- **Dropped:** slabs on layers. They land on the layer grid at 0.20 only, one of six
  stock heights, and `precise_z_height` rescales layers and breaks the alignment.
  `reduce_crossing_wall`: a honeycomb has no wall-free route between cells, and
  `max_travel_detour_distance` 0 means an unlimited detour.
- **`wall_generator = arachne` only with `wall_distribution_count = 1`** pinned in the
  same record, or "touches no mating face" has no mechanism behind it. Its headline
  sliver was computed at two walls. At three the ligament has 0.025 mm left.
- **Not in any spec yet, and the largest lever found:** `outer_wall_acceleration` is 5000
  where `default_acceleration` is 10000. At 10000, a 15.7 mm hex edge's perimeter time
  drops about 17 %. That comes from kinematics arithmetic, not a slice. Slice before
  baking it.
- Any baked key must exist in BambuStudio's `PrintConfig.cpp`. On the 3MF's JSON config
  path, one unknown key aborts the whole load (`Config.cpp`: one try around every key; the
  INI path catches per key). Keys sourced from another fork's catalogue are how that
  happens.

What the slicer does with our plates, measured against the installed Bambu Studio, and
the four things that follow from it: two process keys baked into every export, slabs
that land on layers, an hours estimate that counts holes, and a layout finding that
closes a question for good.

### Decided 2026-09-22, second interview

| question | answer |
|---|---|
| hours | duty factor, calibrated: `DUTY` from one Bambu Studio slice of the default job, the job named in the constant's comment. Hidden until that number exists |
| baked keys | none yet. `outer_wall_acceleration` 10000 is tried in the same slice session against 5000 and baked only if time drops and the outer face previews clean. Arachne stays out |

## Why

Nothing here has been sliced with a stopwatch. The default build is 34 prints on 18
plates and the only time the app gives is the translucent one. Three goals were set -
least print time, least error, least wasted travel - and the honest answer starts with
what actually costs time on these parts, which is not what the speed keys say.

Everything below was read off Bambu Studio 02.08.02.61: the `0.20mm Standard @BBL X1C`
chain (`fdm_process_common` → `fdm_process_single_common` → `fdm_process_single_0.20` →
the X1C file) and the `Bambu PETG Basic @BBL X1C` chain, plus BambuStudio and OrcaSlicer
source and wikis for the ordering questions.

## What costs time

**PETG is flow-capped.** `filament_max_volumetric_speed` is 15 mm³/s. At 0.42 × 0.2 every
speed in the process asks for more - outer wall 200 mm/s is 16.8, top 200 is 16.8, solid
250 is 21, sparse 270 is 22.7, inner 300 is 25.2 - so every extrusion runs at about
178 mm/s whatever the key says. Speed overrides are dead levers on PETG. Time is
extruded volume over 15, plus everything that is not extruding.

**What is not extruding is holes.** Every closed loop pays a retract (0.8 mm at 30 mm/s),
a z-hop (0.4, auto lift), a travel, a wipe and a seam, every layer, about 0.5–1 s and
independent of the loop's size. The default build has 41 hex cells in every side wall,
28 in a cover and 6 in an end wall, about 396 loops. A side wall is 30 layers but the
recess opens the field above the 3.5 mm web, so the cells are loops for about 18 of
them: 41 × 18 × 8 walls is about 5,900 loop-layers, 1–1.6 h of overhead on walls alone,
before the covers. Cell *count* is the tax. Cell size is not.

**Layer height stays 0.2.** Pins and the cover are 2.4, tabs 3, ears 4 - all integer
layers at 0.2 and none at 0.28. And 0.28 on PETG is capped at 127 mm/s by the same flow
limit, so the layer-count saving is 20–30 % in practice, not 40 %. Adaptive layers do
nothing for a flat plate.

**Bambu ships `wall_generator=classic`.** At a 0.42 outer and 0.45 inner line, two walls
each side of a 2.665 mm hex ligament is 1.74 mm, and the 0.92 mm left in the middle is
a gap-fill line: one more extrusion, one more retract, in every ligament on every
layer. The 2.5 mm ties and the minimal design's 1.7 mm web get the same. Arachne
varies the bead width to fill the feature and leaves no sliver.

**The fake fillet is off the layer grid.** `roundTop` stacks eight slabs: 0.15 mm each on
the 2.4 mm cover, 0.25 on the 5 mm lip. The slicer samples each 0.2 mm layer at its
midpoint, so cover layers land on slab boundaries and the round comes out as uneven
steps. No time cost to speak of - one loop a layer either way - but it is an error for
free.

## What does not cost time

**Layout order.** In by-layer mode Bambu Studio visits the objects on a plate in a
nearest-neighbour chain inherited from PrusaSlicer (`chain_print_object_instances`).
The object list does not change it and there is no key for it - BambuStudio #9174 is the
open request. Orca has `print_order` (`snake`, `best_of`) and Bambu does not. The travel
between objects on the whole default job is about six objects × 150 mm × 30 layers ×
18 plates at 500 mm/s: a minute. By-object mode removes it and needs
`extruder_clearance_max_radius` 65 mm between objects, which is three or four to a
256 plate. `pack()` stays exactly as it is. This section exists so nobody re-opens it.

**Everything the speed keys do.** See flow cap.

## Baked into every export

Two process keys, always on, on top of the mechanism the fit-calibration spec sets up:
`composeProfile` merges override records from more than one source and emits
`different_settings_to_system` once from the merged keys. These two join
`accuracyOverrides()`:

| key | value | why |
|---|---|---|
| `wall_generator` | `arachne` | no gap-fill sliver in 2.665 / 2.5 / 1.7 mm features - fewer moves, cleaner ligaments |
| `reduce_crossing_wall` | `1` | PETG strings across about 400 open cells a layer. Travel skirts the walls instead. `max_travel_detour_distance` stays 0, unlimited |

Both are scalars in `fdm_process_common.json`, so no `perSlot` and nothing for the
H2D's second slot. Translucent still merges last: its single 0.5 mm wall under arachne
is one bead, and crossing-avoidance over 100 % aligned infill has nothing to avoid.
Neither key touches a mating face, so a calibrated `fit` survives.

Looked at and left alone:

- `infill_combination` - a 3.5 mm web is eight solid layers and about nine sparse. Saves
  seconds a plate and can rough up the layer under the top skin.
- `xy_hole_compensation` - `fit` is the knob, and a PETG tab and its slot shrink
  together.
- `small_perimeter_speed` - threshold is 0 in the catalogue, so it never fires. Turning
  it on slows every cell for surface finish nobody sees inside a lattice.
- `sparse_infill_pattern` - grid to line saves little on parts that are mostly wall.
- Per-object keys in `model_settings.config` - every part is the same kind of plate.
- `wall_loops` 3 from the fit spec is the one thing here with a time cost, and it is a
  fit decision, not this spec's.

## Slabs on layers

`roundTop(..., steps)` defaults to `Math.round(r / LAYER)` with `LAYER = 0.2` exported
from `geometry.ts` beside `DENSITY`. The cover's 1.2 mm round is six slabs, the lip's 2 mm
is ten. Slab midpoints sit on layer midpoints, so the inset each layer prints is the arc
at its own height. `bun run ref` moves the cover and lip volumes and nothing else. Bounds
do not move.

## Hours

Supersedes the Hours section of `2026-09-20-print-estimate-design.md`: the `DUTY` factor
there was a stand-in for exactly this, the share of time the printer is not extruding,
and on these parts that share is holes and can be counted.

    mm³    = Σ grams / density × 1000
    flow   = min(filament.maxFlow, layerHeight × lineWidth × outerWallSpeed)
    hours  = ( mm³ / flow  +  loops × LOOP_S ) / 3600

`maxFlow` and `density` are scraped as that spec says. `loops` comes from the same slice
loop that weighs the part: `filamentGrams` becomes `filamentCost(m, …): { grams, loops }`
and adds `s.numContour() × (step / LAYER)` per sample - contours in the slice times the
layers the slice stands for. One extra call on a cross-section already in hand, no second
pass through the WASM heap. `PartOut` carries `loops`.

`LOOP_S` starts at 0.6 s and is set once against a real slice: export the default job,
slice it, `τ = (Bambu's seconds − Σ mm³ / flow) / Σ loops × qty`, and the measured number
and the job it came from go in the constant's comment. Checked on default, minimal and
slat afterwards - three builds with very different loop counts and similar grams, which
is the case a duty factor cannot tell apart.

The translucent path is the same formula with `translucentFeed` as the flow and the loop
term kept: at 20 mm/s the loop tax is a smaller share, not zero.

Shown as `about N h` on the Filament row and as `g · h` on every plate button. Loops are
not shown. Hours is what a user reads, and switching hex to slat or standard to minimal
moves it for the right reason.

### The sampling bug

`filamentGrams` steps `z` from `min + dz/2` while `z < max`, so a part `h` tall gets
`ceil(h / dz)` samples each weighted `dz`: the 2.4 mm cover is weighed as 3.0 (+25 %),
the 4 mm deck edge as 4.5, the 5 mm lip as 4.5 (−10 %). Fixed in the same rewrite:
`n = ceil(h / dz)`, `step = h / n`, sample at `min + step × (k + ½)`, weight `step`.
`ref.json` is volume and bounds and does not move. Reported grams on thin parts do, and
the solver's hand constants at `solver.ts:110` get remeasured.

## Tests

- `test/profiles.test.ts`: the non-translucent config has `wall_generator` `arachne` and
  `reduce_crossing_wall` `1`, and `different_settings_to_system[0]` lists them with the
  accuracy keys. The translucent config keeps `wall_loops` `1`.
- `test/regress.test.ts`: `filamentCost(cover-front).loops` between 300 and 500 (about 29
  contours × 12 layers), `loops > 0` on every part, the `laneGrams` window unchanged.
- `bun run ref` diff after the slab change: cover and lip variants only, volume only.
- `test/overhang.test.ts` is unaffected: slabs make up-faces and verticals.
- `test-ui/profile.ui.test.ts`: the Filament row matches `about \d+ h` with translucent
  off, and the existing `solid, about \d+ h at 20 mm/s` with it on.

## Checked by hand, once

Export the default 3MF and open it. The process reads "(modified)". Slice a wall plate:
no gap-fill lines in the ligaments, travel paths run round the cells, the cover's top
edge is six even steps. Read Bambu's total, set `LOOP_S`, re-export, compare - within
10 % on the three builds above.
