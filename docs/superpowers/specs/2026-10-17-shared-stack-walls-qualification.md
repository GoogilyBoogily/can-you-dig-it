# Production shared-stack wall qualification

Production manufacturing qualification passed again after the 2026-10-18 review fixes: 47 fresh plates, 516 copies and 2,872 deposited-material probes. No physical printer job has been sent, and hand fit, creep and loaded strength remain unqualified.

The production exporter is `qualify-shared-walls.ts`. It resolves actual mixed requests, consumes `mixedPartManifest` and `buildMixedGeometry`, and derives probes from explicit `MixedPartSource` identities and boundary schedules. Filenames identify archive objects only. All source meshes and probe material windows are checked before export; every planned probe must have a printable section owner. Current source snapshots and SHA-256 hashes are retained under `.slice/shared-wall-review-fixes-20261018/`; the preceding `.slice/shared-wall-production-20261017/` evidence remains preserved.

## Review fixes, 2026-10-18

Neighboring covers and primary-ear/follower-rail interfaces now have `clearanceOf(options)` separation at every supported fit. The follower rail is relieved around primary ears, preserving each primary ear's full bearing width and slot frame. The follower cover's strip cut includes clearance; its fingers extend equally inward to preserve their original root overlap.

A split covered boundary retains its original walls and spline when trimming the follower cover would leave less than `K.ligMin` around its existing seam-key socket. The socket's nearest face is 8.7 mm from the original outer edge, so its remaining ligament is `8.7 - wall - clearanceOf(options)`. This rejects the colliding 10 mm-wall, 480 mm split-cover case without changing its requested dimensions or capacity. Thick unsplit or uncovered variants remain eligible. Printer envelopes now charge the collar only to the follower; the 234/122.5 mm unequal-width pair packs on a P2S bed and requires 389.5 mm of shelf width including side clearance.

Eighteen new regression cases cover actual inter-owner separation across fit endpoints and reversed cascade hands, seam-key collisions and support thresholds, and real packing on square and transposed rectangular beds. The full unit suite passed **1,628 tests, zero failures and 2,090,122 assertions in 292.77 s** (`/tmp/cyd-shared-wall-fixes-full-unit.log`). Existing tests and assertions were preserved. `bun run check`, `bun run build`, reference regeneration and the reference comparison pass; all 194 default reference parts remain byte-identical to `HEAD`.

The final complete browser suite passed **102 tests, zero failures and 216,347 assertions in 359.48 s** (`/tmp/cyd-shared-wall-fixes-full-ui.log`). This includes sharing-mode generation/export, versioned links, reversed/reordered stacks, stale worker/export handling, profiles, estimates and desktop/phone interaction. Unit, browser and slicer workloads were run separately. Final source hashes still match the frozen qualification record, and `git diff --check` passes.

The current aggregate record is `.slice/shared-wall-review-fixes-20261018/verification.json`, SHA-256 `4b7eb5f93f55c0a42b804fea5b65cee080006f0bc45e4575186ae787a6d7be2a`. Independent rehashing checked 182 current/archived source, report and sliced-artifact hashes without a mismatch. The ordinary production coupon was also regenerated as `.slice/shared-wall-review-fixes-20261018/ordinary-coupon.3mf`; the shared coupon matrix and both complete jobs below were freshly generated and sliced from the corrected production sources.

## Jobs and process

| Job | Production copies | Plates | Functional probes | Sliced PETG |
|---|---:|---:|---:|---:|
| Fresh production junction coupon matrix, fits −0.2/0/+0.3 | 390 | 4 | 1,272 | 459.08 g |
| Additional actual X-axis windows resolving six missing orientation keys | 2 | 1 | 6 | 1.17 g |
| 240 mm, two-tier flat pair, unequal can heights 122.5/134 mm | 20 | 9 | 198 | 1,000.11 g |
| 640 mm, two-tier cascade triple, unequal can heights 122.5/134/115 mm | 104 | 33 | 1,396 | 4,235.37 g |

Both complete jobs retain every manifest quantity. The long job exercises three printable sections and both cascade hands. Separate production geometry tests exercise six-tier repeated mid roles, 900 mm lanes with four sections, closures, patterns and numeric boundaries; this slice matrix does not claim sliced coverage for every such combination. The complete run contains 516 copies on 47 plates and 2,872 deposited-material probes. The combined coupon matrix contains 392 copies on five plates and 1,278 probes.

All jobs use P2S 0.4 mm, 0.20 mm Standard, Bambu PETG Translucent, Smooth PEI (`High Temp Plate`), 270 °C nozzle and 60 °C bed. Intended 0.5 mm line width, stock 0.15 mm elephant-foot compensation, positive-extrusion parsing and the existing 0.27 mm centreline threshold remain unchanged. The maintained faithful slicer helper retains exact inputs, flattened presets, commands, exit/result codes, diagnostics and every requested G-code.

## Coverage and retained history

The coupon matrix covers divider snap roots and hooks, the finite crest, closed deck slots/collars, both direct bearing roots, the protected plinth behind follower reliefs, continuous plinth roots, coordinated cover fingers/collars, blind chamber side roots and roofs, and split end-wall post roots, half ligaments and upper bearing. Probes sample first layers and functional upper material intervals. The long complete job additionally probes deck T roots/socket shoulders, divider and cover seam frames, and printed seam-key rails/end bridges.

The shared motion parser follows linear and I/J arc extrusion, restores extruder offsets and selects the actual deposited layer interval; travel Z hops and neighboring layers cannot supply coverage. Results are approximate bead evidence, not complete deposition reconstruction or a strength measurement.

Original prototype failures remain in `.slice/shared-wall-mechanicalgate-20261017/verification.json`. The qualified 0.6 mm crest prototype passed 24 plates and 1,134 probes in `.slice/shared-wall-mechanicalgate-v2-20261017/verification.json`; every original failed point was restored without moving it. Production hook probes preserve the same half-hook offsets and height above their local wall, translated by the actual production pin schedule. No old failure record is rewritten.

## Acceptance record

All 47 fresh production plates sliced with process/result codes 0 and no slicer-helper rejection. All 2,872 deposited-material probes pass. The original coupon report retains six missing-orientation failures: the packer turned two intended X-axis windows onto Y, so both copies of those exact points initially printed along Y. Two additional unchanged production windows were freshly sliced along X; their six original points pass. Final aggregation checks actual axes for every source/fit/point key across both runs; it does not discard the initial failure report.

The current strict aggregate record is `.slice/shared-wall-review-fixes-20261018/verification.json`. The previous `.slice/shared-wall-production-20261017/verification-maintained.json` and its initial `verification.json` remain preserved. Every source/fit/point key has both actual bed axes across the current matrix and supplement: 636 distinct keys. All 16 original hook failures map to passing production measurements at the identical pin-relative offset, height above the wall and material layer. Absolute translations follow the production schedule.

Worst centreline distances are 0.262623 mm for the current coupons, 0.157686 mm for the supplement, 0.226551 mm for the pair and 0.227911 mm for the long cascade triple, below the unchanged 0.27 mm limit. Every plate confirms first/normal line widths, normal/initial temperatures and stock elephant-foot compensation. Serialized manifest quantities, bounds, positive volume, spacing and keep-outs pass independent read-back.

The record retains the exact Bambu binary SHA-256 and bundle metadata, the generated catalogue hash, eleven installed preset inheritance files and every job's flattened preset hashes. The binary/G-code version is **02.08.02.61**; the installed BBL vendor manifest version is **02.08.00.05**, distinct from the generated catalogue version **02.08.02.61**. Binary hashing was captured after slicing; actual G-code headers independently identify the consumer version.

The preceding 2026-10-17 exclusive unit run passed **1,610 tests, zero failures and 2,089,690 assertions in 251.67 s** (`/tmp/cyd-shared-walls-full-unit-exclusive.log`). Earlier concurrent runs exceeded two unchanged five-second prototype test limits; the exclusive rerun passed them without changing timeouts or assertions. No material or print-time saving is claimed without a matched unshared comparison.

The preceding 2026-10-17 application verification passed `bun run check`, `bun run build` and the complete browser suite: **102 tests, zero failures and 216,347 assertions in 376.36 s** (`/tmp/cyd-shared-wall-final-ui-fixed-footer.log`). All 194 default reference parts regenerated byte-identical to `HEAD`. Desktop 1440 px and phone 390 px visual review covered both themes, checked/unchecked sharing, keyboard focus, retained-boundary reasons/status, and actual assembly, part and plate canvases. Expanded assembly guidance exposed a desktop footer overlap; the CSS now reuses the existing normal-flow layout while desktop guidance is open. Actual Share clicks, keyboard disclosure/navigation and a canvas at least 200 px high pass at 1280 × 720, 1280 × 560 and 390 × 844. The 35 inspected captures are `/tmp/cyd-shared-walls-{desktop,phone}-{light,dark}-*.png` and `/tmp/cyd-shared-wall-guidance-*.png`.

## Reproduce with maintained entrypoints

The following commands require the installed Bambu Studio and its named system presets. Choose a directory that does not exist. The tracked exporter, supplementary exporter and recorder preserve existing reports and input projects.

```sh
qualification_directory=.slice/shared-wall-production-fresh
bun qualify-shared-walls.ts generate "$qualification_directory" > "${qualification_directory}-generation.log" 2>&1

for job in production-coupons production-pair-240 production-cascade-triple-640; do
  bun .claude/skills/slicing-with-bambu-cli/slice-3mf.ts "$qualification_directory/$job.3mf" > "$qualification_directory/$job-slice.log" 2>&1
done

for job in production-pair-240 production-cascade-triple-640; do
  sliced_directory=$(sed -n 's/^Slice artifacts: //p' "$qualification_directory/$job-slice.log")
  bun prototypes/shared-wall-qualification.ts check "$qualification_directory/$job.json" "$sliced_directory" "$qualification_directory/$job-toolpaths.json" > "$qualification_directory/$job-check.log" 2>&1
done

sliced_directory=$(sed -n 's/^Slice artifacts: //p' "$qualification_directory/production-coupons-slice.log")
bun prototypes/shared-wall-qualification.ts check "$qualification_directory/production-coupons.json" "$sliced_directory" "$qualification_directory/production-coupons-toolpaths.json" > "$qualification_directory/production-coupons-check.log" 2>&1
```

For the recorded packing plan, the last command exits 1 because six point keys lack X-axis coverage; its 1,272 deposited-material distances pass. Preserve that report. The supplementary exporter rejects deposition failures or any failure other than the missing-X case, then reconstructs the exact production windows and probes and requires their actual packed X orientation.

```sh
bun qualify-shared-wall-axis-supplement.ts "$qualification_directory" > "$qualification_directory/axis-supplement-generation.log" 2>&1
bun .claude/skills/slicing-with-bambu-cli/slice-3mf.ts "$qualification_directory/production-axis-supplement.3mf" > "$qualification_directory/production-axis-supplement-slice.log" 2>&1
sliced_directory=$(sed -n 's/^Slice artifacts: //p' "$qualification_directory/production-axis-supplement-slice.log")
bun prototypes/shared-wall-qualification.ts check "$qualification_directory/production-axis-supplement.json" "$sliced_directory" "$qualification_directory/production-axis-supplement-toolpaths.json" > "$qualification_directory/production-axis-supplement-check.log" 2>&1
bun record-shared-wall-qualification.ts "$qualification_directory"
```

The recorder strictly aggregates original and supplementary actual axes, checks all requested feature/fit/orientation combinations, maps historical hook points and writes a fresh `verification.json`. Optional arguments select a log-path manifest and a fresh report filename; overwriting is refused. Historical hook measurements come from the tracked immutable fixture `prototypes/fixtures/shared-wall-original-hook-failures.json`, copied exactly from the sixteen measured failures with original full-report SHA-256 `f2f461949bd5752976c4ec6a6f8f08baba43d1eeea68003074fdc48b39ab12bd`. A fresh clone needs that fixture and the generated current-run artifacts; the ignored historical `.slice` reports are retained provenance, not runtime dependencies.

The maintained supplementary exporter was replayed into a fresh directory. Every decompressed 3MF entry and every source/probe/placement array matched the already-sliced supplement byte for byte; proof is `.slice/shared-wall-production-20261017/maintainer-axis-replay/replay-proof.json`. No extra slice or printer operation was needed for that tooling promotion.

## Joint-aware two-section planning, 2026-10-20

The reported three-stack design (66 mm diameter, axial lengths 122.5/122.5/157 mm,
292.1 mm depth, two separate tiers, 5° slope, covers) now plans support/clip sites
and the print cut together when the existing schedule fails. At fit −0.2/0/+0.3
the selected cuts are 0/1.3/4.3 mm from centre. Requested can geometry and tiers
remain exact: 24 cans, 436.5 mm assembled width, 444.5 mm including shelf clearance.
Actual part intersections, stored-can axial extremes, catch withdrawal obstruction,
connected/support-free prints and packing pass at all three fits. Existing outer
bearings are unchanged; shared bearings retain the original 126 mm interval and
92 mm unsupported-end limits for this case.

The earlier digital evidence at
`.slice/shared-joint-qualification-final-20261020/digital-qualification.json`
uses **automatic lattice radius 16 mm and modified translucent settings on High
Temp Plate**. It qualifies that recorded configuration, not the reported browser
link's manual 13 mm pattern and stock Textured PEI settings. Its results follow;
the exact-link correction and failed stock qualification are recorded below.
Bambu Studio **02.08.02.61** sliced 696 production sample windows on six plates
at all three fits. All **2,304 deposition probes** pass the unchanged 0.27 mm
centreline threshold. Packing left 24 point keys with only one actual bed axis;
the original failed coverage report is preserved. A six-plate supplement checks
those exact **24 points** in their missing orientations. Strict aggregation proves
both axes for **1,152 distinct source/fit/point keys**, with no remaining failures.
The complete nominal assembly also slices on **23 P2S plates, 68 copies** and
passes **736 functional probes**. The worst distance across all three jobs is
0.262871 mm. No probe coordinates or thresholds were relaxed.

The recorded generator expands sparse lattice coupon windows until they remain
connected production material; its initial disconnected crop and logs are retained
under `.slice/shared-joint-qualification-20261020-105144`. The expanded generator,
axis supplement, aggregate verifier and source hashes are retained alongside the
projects. Production parts were not changed to accommodate coupon extraction.
The sliced inputs, flattened selected P2S/PETG Translucent settings, execution
results, diagnostic logs and G-code remain in the helper's fresh job directories.
These results establish digital geometry/toolpaths, not physical fit or load capacity.


### Audit correction: exact browser export, 2026-10-20

The planner now compares contiguous partitions, allowing valid shared pairs around
a neighbor that needs separate walls. An exhausted identical-stack component skips
redundant subsearches; a 150-case review sweep preserved all results and reduced
worst measured planning time from 1.69 seconds to 88 milliseconds. Adapted printer-envelope failures enter
the cut search. Existing successful schedules remain unchanged. Intrinsic geometry
failures keep their explanation, and a retained edge across different chosen cuts
keeps the underlying manufacturing reason. An explicit separated Custom-row span
skips this search. Explicit seam overrides are restricted to the supported safe
flat, non-cascading two-section case.

New additive regressions build the formerly rejected 476.5 mm partial-sharing
layout and 302 mm printer-envelope layout, including retained spline geometry,
packing, all assembly intersections and stored-can axial extremes. Complete cover
halves and their own seam keys move together: each top divider section obstructs
withdrawal at fits −0.2/0/+0.3, while removing the intended hosts removes obstruction.
The test requires four physical top-divider instances, selected by placement height
because identical tiers reuse representative source geometry.
Existing tests and snapshot references were not weakened.

The fresh clean-storage browser download is
`.slice/joint-aware-audit-fixes-20261020/exact-browser-export.3mf`.
It carries the original manual 13 mm pattern, stock P2S Standard/PETG Translucent
preset references, Textured PEI Plate, and no modified translucent settings.
`generate-reported` emits only the exact nominal full export. It reads the download
once, independently checks its stock profile against the composed catalogue choice,
compares placement metadata and profile byte-for-byte,
checks all 68 actual mesh copies against production material (symmetric difference
below 0.00001 mm³), and uses the exact downloaded bytes for nominal qualification.
Coplanar triangulation can differ between WASM runs; material comparison does not
alter, weld or remove facets from either exported input.

Bambu Studio **02.08.02.61** returned process/result code zero and emitted all 23
plate G-codes, but logged **20 ZFiller internal errors**. The maintained strict
slicing helper correctly failed. All **736 functional nominal centerline probes**
pass the stock-width screen (0.23 mm for 0.42 mm nominal roads, 0.27 mm for the
0.5 mm first layer; worst distance 0.227481 mm). These approximate coverage checks
**do not override the failed slicer qualification**. They do not establish physical
fit, flow, force or strength. The existing [ZFiller investigation](../../zfiller-diagnostics.md)
reproduces the upstream issue with a valid convex wedge independent of this model.
No profile setting, part orientation or geometry was changed to suppress it.

The exact input, flattened presets, execution/result, diagnostics and G-code remain
in `.slice/exact-browser-export-8zUbxQ`. Fresh source hashes, per-copy material
comparisons and explicit failed qualification findings are under
`.slice/joint-aware-exact-qualification-20261020-7`. Earlier attempts and their logs
remain preserved. Reproduce with a fresh output directory:

```sh
bun qualify-shared-walls.ts generate-reported <fresh-directory> <browser-download.3mf>
bun .claude/skills/slicing-with-bambu-cli/slice-3mf.ts <browser-download.3mf>
bun prototypes/shared-wall-qualification.ts check-reported <fresh-directory>/production-reported-292.json <slice-directory> <fresh-report.json>
```

The final command retains a failed diagnostic report and exits nonzero when the
slicer emits internal errors, even when approximate functional coverage passes.
Clean exact-stock toolpath qualification remains open pending a validated slicer
correction. Physical assembly qualification also remains unperformed.
