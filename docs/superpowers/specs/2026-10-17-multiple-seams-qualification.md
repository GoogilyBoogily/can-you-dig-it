# Multiple-seam qualification record

## Scope and structural design

Assembled depth is preserved. Bed-aware sections reuse the production 30/40 mm
T joint (3 mm neck depth, 8 mm total depth), two concealed keys per side-wall
seam, and two keys per cover seam. Every new seam retains its full-thickness
frame and solid deck tie band. Interior sections have supporting ears and a
wall-top retaining pin with corresponding wall/cover catches. Feet and
Gridfinity bosses follow all retaining-pin positions. Magnet-pocket ownership
includes the full supporting rim and actual T-joint clearance.

Additional seam positions are symmetric so reversed cascade tiers retain
pin/catch alignment. The planner reserves end space for the chute, cover loading
window, end ears and end pins, and enough interior length for two supporting
ears and a retaining pin. Designs that cannot preserve those regions are rejected.
Valid existing whole and center-split geometries retain their identities.

See [the approved design](2026-10-17-multiple-seams-design.md) and the independent
regressions in `test/multiple-seams.test.ts`. These include actual assembled
collisions and can clearances, joint material conservation in both directions,
solid T roots/heads/socket shoulders, withdrawal restraint, pin-root continuity,
connected prints and the existing support-free contract. Fits -0.2, 0 and +0.3,
both designs, all five patterns, repeated/reversed tiers, ganging, rear loading,
feet, Gridfinity, mixed depths and serialized export quantities are exercised.

## Retained artifacts

All paths below are repository-relative, preserved locally under `.slice/`:

- `multiple-seams-20261017/coupon.3mf`: a fresh production-joint coupon, 30 pieces
  on two plates, including the negative-fit minimal root and mirrored gang pair.
- `multiple-seams-20261017/lane-520-three-sections.3mf`: one complete covered,
  single-tier flat lane, 520 mm assembled depth, three sections, 26 pieces on
  seven plates. Nominal can 66 × 122.5 mm, 3° slope, standard hex design, fit 0.
- `multiple-seams-20261017/lane-520-three-sections-stl.zip`: unique printable STLs;
  use the quantities in the accompanying JSON rather than printing one of each.
- `multiple-seams-20261017/lane-520-three-sections.json`: options, seams,
  retaining-pin positions, unique part quantities and packed placements.
- `lane-520-three-sections-Ki0bgY/` and `coupon-xQ8MiW/`: exact slicer input
  hashes, copied projects, flattened presets, command/execution records, logs,
  result files, G-code and per-plate reports.
- `multiple-seams-20261017/toolpath-probes.json`: functional first-layer checks.

Bambu Studio 02.08.02.61 successfully sliced all seven lane and both coupon
plates with zero process/result errors and no internal error/fatal/ZFiller
diagnostics. The selected profile is P2S 0.4 mm / 0.20 mm Standard / Bambu PETG
Translucent, with the app's translucent modifications and smooth PEI selected.
The emitted configuration records 0.2 mm layers, 0.5 mm nominal line width,
100% infill, one wall and supports disabled.

The maintained deposition checker is `check-toolpaths.ts`; the original artifact
script forwards to it. The review found that the original checker skipped G2/G3
motion state, so its reported linear coverage was unreliable. The original report
is retained for provenance; corrected evidence is in
`.slice/multiple-seams-fixes-20261017/toolpath-probes.json`.

The corrected probe tracks absolute/relative XYZ and extrusion state, samples
I/J arcs at intervals no longer than 0.02 mm, and clips deposited segments to
Z 0..0.2 mm. The single-nozzle offset is restored before comparing G-code with model coordinates;
unsupported arc interpretations or multiple-nozzle offsets fail explicitly. All 56 locations
across 14 placed parts pass: interior T head/root/socket shoulders, interior
wall-pin roots and seam frames, and both rails and end bridges of all 12 keys.
The maximum distance to a deposited centerline is 0.2278173 mm, below the unchanged
0.27 mm limit for the nominal 0.5 mm bead. This is limited functional sampling,
not complete bead reconstruction, dimensional metrology, or a physical strength
result. Full per-layer collar/roof behavior and actual seating still need print
inspection.

## Physical qualification still required

No pieces from this revision have been physically qualified. No numeric load
rating, cover-lifting capability, long-term creep result or printed fit is claimed.

1. Print the coupon with the recorded material, nozzle, layer height, bed and fit.
   Photograph it before removal. Check flatness, warp, strings and bed-edge flare;
   clean ordinary debris without changing the mating surfaces.
2. Assemble the coupon pairs by hand. Check both wall and cover keys seat flush
   without visible steps or unwanted play, that the catches retain, and that the
   pitch pairs seat in both packed orientations. Record the actual observations.
3. After the coupon passes, print the complete three-section lane. Join all deck
   T joints, slide wall sections onto their keys from one end, then snap joined
   walls onto every deck ear. Install the end wall and lip. Key all cover sections
   together before lowering the cover onto every retaining pin. Inspect both
   seams for steps, gaps and movement; test feeding unloaded and then with cans.
4. Agree and record the actual can mass/count and dwell period before a loaded
   trial. Keep the lane supported underneath during handling. Measure seam
   movement during the dwell and residual set after unloading. Repeat at any
   nonzero fit/process actually selected; a nominal-fit result does not qualify
   another material, process or bed orientation.

Use the existing [printed-joint protocol](../../../.claude/skills/qualifying-printed-joints/references/print-protocol.md)
for records and diagnosis. A successful coupon alone does not qualify the loaded
multi-section lane.

## Regression and visual evidence

The complete unit suite passed: 1,438 tests, zero failures, 1,460,448 assertions
across 49 files (`bun test test/`, 259.56 s). This includes all 29 new multi-seam
cases. Strict `bun run check`, production `bun run build`, and `git diff --check`
passed. Regenerating `ref.json` produced the same 194 parts byte for byte, so
existing snapshot geometries, bounds and tolerances are unchanged.

The complete browser suite passed: 88 tests, zero failures, 216,200 assertions
across 10 files (316.20 s). The final command was `bun test --preload
./.slice/multiple-seams-20261017/browser-diagnostics.ts test-ui/ --timeout 120000`.
The preload adds console/request/failure-state diagnostics and preserves all
assertions and timeouts. An earlier run had one initial-build timeout in the
unchanged sharing test; the exact-input probe, all 15 sharing tests, and the final
full run passed. A background dev server rebuilds the same assets on source saves,
which is a possible race, but the earlier failure's exact cause was not captured.
Application sources stayed frozen for the final run.

Desktop 1440 px and phone 390 px views were inspected in light and dark themes,
including the 520 mm slider, assembled organizer and an interior wall section.
All four view/theme combinations have no horizontal overflow and retain a 44 px
slider target. Captures and canvas measurements are retained with `visual.json`
in `multiple-seams-20261017/`.

## Review corrections and additional printer qualification

The review's keep-out and decimal-capacity failures are addressed by the shared
section planner. `Options.bedKeepOut` carries the selected profile's exclusion
rectangles into uniform and mixed layouts. The planner finds the available
rectangle in either orientation with the same bed/exclusion margins as packing,
and checks nominal and emitted Float32 longitudinal bounds before accepting a
section count. It keeps exact assembled depth and the existing protected-end,
minimum-interior, ear, pin and joint rules. No packing tolerances were relaxed.
Changing or clearing an exclusion replans the layout as well as repacking it.

The reproduced 710 mm flat lane with 66 mm diameter / 230 mm long cans on an X1
Carbon now uses four sections instead of three. The fresh project is
`.slice/multiple-seams-fixes-20261017/lane-710-x1-four-sections.3mf` (36 copies,
13 plates). Bambu Studio 02.08.02.61 sliced all 13 plates with process and result
code zero and no internal error/fatal/ZFiller diagnostics. Exact input, presets,
command, execution, results, logs and G-code are retained in
`.slice/lane-710-x1-four-sections-zduKt7/`.

The corrected checker verifies 80 functional first-layer locations across 20
placed parts in that export, including the shifted interior pin and all 18 keys.
Maximum centerline distance is 0.2278452 mm against the unchanged 0.27 mm limit.
The X1 profile records `extruder_offset = 0x2`; raw G-code is therefore compared
with the model only after restoring that offset. Bambu's
[`point_to_gcode` implementation](https://github.com/bambulab/BambuStudio/blob/master/src/libslic3r/GCode.cpp#L7834)
subtracts the nozzle offset, consistent with the emitted coordinates observed
in this exact slice. Multiple-nozzle qualification is outside this checker and
fails explicitly. The original P2S recheck still passes all 56 probes.

Actual mesh exports for the five decimal depths 378.3, 630.5, 756.6, 882.7 and
1008.8 mm on a 140.1 × 140.1 mm custom bed now validate and pack successfully.
New tests also verify real coordinates around all four excluded corners,
complete mixed-stack quantities, connected/support-free solids and assembled
clearance for the exclusion-driven plan. The new browser cases exercise both
layout modes through profile selection and clearing, and download the decimal
mixed organizer. No pre-existing test assertions or geometry references changed.

These are digital checks. The physical-fit and loaded-lane requirements above
remain open.

The review-fix verification passed `bun run check`, `bun run build` and
`git diff --check`. The full unit run passed 1,463 tests, zero failures and
1,463,044 assertions across 51 files (249.04 s). The full browser run passed
91 tests, zero failures and 216,223 assertions across 11 files (324.45 s),
including all three new browser cases. After adding one further coordinate-mode
regression, the final focused checker run passed all 13 cases (24 assertions).
No application source changed after the full runs. Reference regeneration still
produces the same 194 parts byte for byte. All eight pre-existing test files
hashed in the original implementation evidence retain their hashes.

The final source/artifact hashes, exact suite summaries and copied logs are in
`.slice/multiple-seams-fixes-20261017/verification.json` and its neighboring logs.

## P2S follow-up qualification

Fresh projects from the corrected source were tested with Bambu Studio
02.08.02.61 and the P2S 0.4 mm / 0.20 mm Standard / Bambu PETG Translucent
profile on smooth PEI. Every emitted plate records 0.2 mm layers, 0.5 mm nominal
line width, one wall, 100% infill, supports off, 60°C bed and 270°C nozzle.

| Project | Sections | Copies | Plates | Functional first-layer probes |
| --- | ---: | ---: | ---: | ---: |
| 520 mm, standard can, 3° slope | 3 | 26 | 7 | 56 passed |
| 710 mm, 230 mm long can, level deck | 3 | 26 | 10 | 56 passed |
| 900 mm, 230 mm long can, level deck | 4 | 36 | 13 | 80 passed |
| Fresh complete joint coupon | — | 30 | 2 | Sliced; lane probes above cover the seam mechanisms |

All 32 plates sliced with process/result codes zero and no internal error,
fatal or ZFiller diagnostics. All 192 sampled lane locations pass the unchanged
0.27 mm centerline-distance limit; maximum observed distance is 0.2279727 mm.
The P2S has no excluded corner, so the 710 mm design uses three sections where
the X1 case required four. Its assembled depth remains exactly 710 mm.

Independent inspection of the serialized projects verifies all 118 copies,
finite vertices, positive signed volumes, 3 mm bed margins and 6 mm separation.
Actual standing meshes for the three complete lanes have no unintended part
collisions above 1e-5 mm³ and zero can/part intersection. The coupon generator
also verifies connected, support-free meshes and both pitch orientations; its
`tight-*` pair retains the existing -0.2 mm fit endpoint.

`bun run check`, `bun run build` and `git diff --check` pass. The focused section
constraint and toolpath suites pass all 26 cases (2,598 assertions, 2.92 s).
No application code or existing tests changed for this follow-up.

Projects, independent inspectors, functional-probe reports, hashes, aggregate
results and copied check logs are in `.slice/p2s-multi-seam-20261017-1819/`.
The exact all-plate slice inputs/configurations/logs/results/G-code are retained in
`.slice/lane-520-p2s-yxQ0rI/`, `.slice/lane-710-p2s-9u57HB/`,
`.slice/lane-900-p2s-nuJKFz/` and `.slice/coupon-p2s-8k9RFU/`.
These remain digital results; the physical-fit and loaded-use protocol above
still applies.
