# Custom rows: verification and printed-trial handoff

This record applies to the approved independent-row architecture on
`feat/shared-stack-walls`. It separates geometry, slicing and unperformed physical
trials. The [design](2026-10-19-independent-can-rows.md) defines the supported
envelope; the existing uniform and mixed-column modes remain available.

## Supported example and boundaries

The shelf is 457.2 × 279.4 × 241 mm. Its lower row has two D66 × 157 mm lanes
spread over 420 mm; the upper row has three D66 × 122.5 mm lanes. All lanes keep
their requested dimensions, 279.4 mm depth, 3° slope and 5 mm lip headroom.
There are 15 cans and 112 printable pieces, including six carrier panels, twelve
shoes and eight carrier keys. The carrier and shoes add 14.1 mm per transition.
The actual footprint is 438 × 279.4 mm, requiring 446 mm with side clearances.
Finished height is 211.8175 / 212.7330 / 214.1062 mm at fit −0.2 / 0 / +0.3.

Rows can have independent lane counts, can sizes, height, span, alignment and
explicit repetition. A lane's extra headroom enlarges its real enclosure without
changing can dimensions or capacity. Initial supported transitions require common
depth and matching whole or two-section plans. Shoes must have a qualified panel,
bearing interval, closed slot rails and material separating slots from key hosts.
Unsupported seams, overhangs or print envelopes fail before export. Multiple rows
retain separate walls with an explicit carrier-interface reason; a single physical
row can use compatible shared dividers.

## Reproduced defects and corrections

The actual installed Claude Opus review used `claude-opus-5-5` with read-only
tools. Its three confirmed findings were corrected:

- A left-aligned 152 mm upper singleton above two 157 mm lower lanes at span 420
  put a shoe slot inside a bearing seam's key channel. The actual void intersection
  was 9.72 mm³ and the seated key entered 4.139 mm³ of the open slot. The planner
  now protects the full grown slot/flare envelope and a 1.7 mm host ligament around
  every relevant key channel. This cannot be detected by solid collision alone.
- A 140.5 mm upper singleton above a 122.5 mm lower singleton placed both shoes
  outside the lower bearing faces. The planner now rejects that unqualified
  cantilever; its 12 mm carrier edge frame is not counted as an extra load support.
- Adding a row after setting the existing row depth to 300 mm used to seed 480 mm.
  A new row now inherits the current top row depth; explicit linked/reset requests
  remain exact.

The two planner witnesses now reject at all three fits, while the original
two-to-three example remains accepted. A separate source-identity regression
keeps ordinary base walls distinct from upper crest receivers while unchanged
decks retain their shared source. Both the Opus crest/receiver and final
guard/depth follow-ups reported no actionable defect; structured model and source
hashes were verified. The broad review and follow-ups are retained in
`/tmp/cyd-custom-rows-opus-review-summary.md`.

### Fresh adversarial audit corrections, 2026-10-20

The subsequent independent native-agent and actual Opus audit is preserved at
`.slice/fresh-adversarial-audit-20261019-2042/audit.json`. Its five verified
findings are corrected without changing existing geometry references or safety
thresholds:

- Compact two-lane repeats at depths 180/200/240/250 mm had key sites selected
  using a smaller envelope than the final slot/flare guard. Allocation now reserves
  the same full slot/flare envelope and minimum ligament, while keeping lower
  pin/root protection and the final rejection guard. All 12 depth/fit combinations
  pass production geometry, contact, retention, host-material and packing checks.
- Manual mixed → rows/uniform → mixed switches preserve the sharing choice.
  Incoming uniform and v2/v3 links still reset sharing off.
- Malformed v4/v5 flags restore independently valid stack/row JSON first and keep
  builds and hash writes blocked until each affected checkbox changes. Width and
  other unrelated edits cannot replace valid lanes with defaults. The unresolved
  flag survives mode round trips; only the affected mode is blocked. Corrupt JSON
  stays blocked until valid navigation or an explicit mode change, with that
  recovery action explained in the error.
- Resolved diagnostics and part labels distinguish physical Levels from editor
  Rows, including repeat-copy context; internal part/source identities are stable.
- Custom-row assembly guidance now includes retained-wall key/gate steps and
  shared-divider/deck/cover steps when those physical connections are generated.
  Carrier/shoe steps appear only when transitions are generated; their required
  sideways joining sequence remains visible for multi-level builds.

The new regressions first reproduced their defects. The focused final run passed
15 unit tests and eight browser tests; existing assertions and final geometry guards
were not weakened. New host toolpaths and the complete compact export are recorded
below. These checks establish digital behavior, not printed fit or load capacity.

The actual Opus follow-up accepted three residual recovery/guidance corrections:
mode round trips must not accept unknown flags, structural errors need explicit
recovery instructions, and zero-transition builds must hide carrier/shoe steps.
Their behavioral red run passed four and failed four of eight browser tests; after
correction all eight pass with 145 assertions. Logs:
`/tmp/cyd-five-fixes-followup-behavior-red.log` and
`/tmp/cyd-five-fixes-followup-green.log`. Printable-source tabs continue to name
their canonical owning level; repeated identical instances retain their quantities
and poses. This is distinct from editor-row versus physical-level numbering.

The actual Opus closure review reported no actionable findings in those three
corrections, using only Read/Grep/Glob in plan/safe mode. Init, assistant and result
metadata identify `claude-opus-5-5`; artifacts are
`/tmp/cyd-opus-closure-review-20261020-074403/`. A callback narrowing error was caught
by typecheck during review and fixed by capturing `hasTransitions` before the
callback. The reviewer reread the final two lines. The final browser gate starts
after that correction and records fresh source hashes; this is a scoped review,
not a physical or whole-application qualification.

The subsequent visual pass found that rejecting a design retained the previous
layout's conditional footer steps. `dropBuild` now clears all row-specific steps;
the next accepted layout restores only its actual connections and transitions.
A retained-repeat → invalid and shared-singleton → invalid regression first fails,
then the full eight-case focused file passes with 153 assertions. The original
screenshots and snapshot remain preserved; the final visual and evidence bundles
use the `-2` suffix. Logs: `/tmp/cyd-stale-guidance-red.log` and
`/tmp/cyd-stale-guidance-green.log`.
The actual Opus guidance-reset postscript reports no actionable findings;
final source hashes remained unchanged. Its reset/restoration and test-visibility
review is preserved at `/tmp/cyd-opus-guidance-reset-postscript-20261020-075436/`.

## Project regression checks

`bun run check` passes strict TypeScript checking. There is no separate lint
script. The original 2026-10-19 post-review `bun test test/` run passed **1,689 tests, zero
failures, 2,232,909 assertions across 68 files, 288.36 seconds**; log:
`/tmp/cyd-custom-rows-final-unit-after-review.log`. Existing geometry references
remain unchanged. The only preexisting browser-test edit is the user-approved
setup selecting two tiers before enabling auto-feed; all original assertions stay
intact. The production build passes. The complete final `bun test test-ui/ --timeout
120000` run passes **117 tests, zero failures, 216,527 assertions across 14 files,
396.68 seconds**, including all 12 new row cases. Final typecheck and
`git diff --check` also pass. All 120 source/test/build hashes remain unchanged
before and after the browser gate. Logs are `/tmp/cyd-custom-rows-final-build.log`,
`/tmp/cyd-custom-rows-final-ui.log` and `/tmp/cyd-custom-rows-final-typecheck.log`;
hash comparison is `/tmp/cyd-custom-rows-final-source-comparison.json`.

After the five fresh audit corrections, `bun test test/` passes **1,704 tests,
zero failures, 2,244,341 assertions across 70 files, 252.68 seconds**;
log: `/tmp/cyd-five-audit-fixes-full-unit.log`.
The final full `bun test test-ui/ --timeout 120000` run, including the three
follow-up corrections and stale-guidance reset, passes **125 tests, zero failures,
216,680 assertions across 15 files, 374.08 seconds**. Final typecheck and build pass; logs:
`/tmp/cyd-five-audit-fixes-typecheck.log`, `/tmp/cyd-five-audit-fixes-build.log`
and `/tmp/cyd-five-audit-fixes-ui.log`. The earlier clean 123-test browser pass
is preserved with `-firstpass` log suffixes. All 84 test/helper files from the
pre-audit snapshot, `ref.json`, `package.json` and `bun.lock` remain unchanged.
The final evidence bundle is
`.slice/five-audit-fixes-final-verification-20261020-3/verification.json`.
All 119 browser-gate source hashes remain unchanged. Final desktop/light and
phone/dark checks cover twelve states without horizontal overflow, preserve the
53 × 80 mm lane through error recovery and hide all four conditional steps for
invalid designs. Twelve screenshots and measured visibility/canvas evidence are
in `.slice/five-audit-fixes-ui-20261020-2/`.

## Geometry and toolpath evidence

Fresh complete production geometry/source snapshots:
`.slice/grid-row-transfer-complete-1792459611568/`. All three fits have 112 copies
and 24 printable P2S plates. Each complete configuration checks 6,216 assembly
pairs and 5,040 can extremes. Production/prototype bidirectional difference is
at most 2.24e−13 mm³. Additional cases cover compact repeated rows, aligned and
shifted singletons, and the 5.75 mm wall endpoint.

An additional complete mixed-diameter witness uses the same lower row with upper
diameters 53/66/58 mm and axial length 122.5 mm. At all three fits their real height
padding is 13/0/8 mm, without changing the 17-can capacity. All 112 parts pack onto 24
plates; each fit passes 6,216 actual part pairs and 5,712 can extremes, plus actual
bearing, uplift and roll probes. Evidence, executable probe and source hashes:
`.slice/row-mixed-diameter-witness-20261019-1/`. This is geometry evidence, without
an additional slicing or physical claim for that input variant.

The aggregate record is
`.slice/grid-row-transfer-complete-1792459611568/digital-qualification.json`.
It verifies its frozen 2026-10-19 source hashes, exact slicer inputs, every G-code hash, zero
process/result errors, no internal/ZFiller diagnostics, and intended settings on
every complete-production plate. The actual nominal slice is
`.slice/complete-fit-0-M9ON7H/`.

The five-fix follow-up preserves that historical source record. Fresh comparison
at all three fits links current code to the original 279.4 mm spread 2→3 and
compact-repeat geometry: all 381 source meshes have identical raw hashes and zero
bidirectional volume difference, with identical manufacturing manifests and
assembly poses. All 26 archived source dependencies match both original carrier
and shoe toolpath records. Evidence:
`.slice/rows-2794-geometry-equivalence-20261020-aIh7DW/`. Changed whole-depth key
sites have separate fresh qualification below.

| Actual production mechanism | Coverage | Final evidence |
|---|---|---|
| Complete uncut shoes | 624 probes, three fits, both packed axes, zero failures | `.slice/row-shoe-toolpath-reviewed-20261019/toolpaths.json` |
| Carrier catches, key hosts and incoming receiver roots | 2,400 probes, three fits, spread and compact plans, both axes, zero failures | `.slice/row-carrier-toolpath-20261019-5/toolpaths.json` |
| Complete nominal organizer | 112 copies, 24 plates, successful slicing | `.slice/complete-fit-0-M9ON7H/` |
| Corrected compact key/slot hosts, depths 180/200/240/250 mm | 1,296 probes, three fits, both actual packed axes, zero failures | `.slice/compact-row-key-hosts-20261020-1/toolpaths.json` |
| Complete corrected compact repeat, depth 240 mm, fit 0 | 42 copies, 11 plates, exact inventory/settings and clean slicing | `.slice/complete-depth-240-fit-0-wGDpJp/` |

The compact correction's aggregate record is
`.slice/compact-row-key-hosts-20261020-1/digital-qualification.json`.
Its 96 production-derived host coupons occupy two plates and retain complete
channels, neighboring slots/flares and separating ligaments. All 648 unique probe
points pass in both packed axes; worst centreline distance is 0.252398 mm against
the unchanged 0.27 mm limit. All 36 frozen dependencies match after slicing.
The complete 42-copy project passes exact inventory, intended settings on every
plate, exit/result checks and absence of error/fatal/ZFiller diagnostics. Its
summed slicer estimates are 2,547.96 g and 1,112,613 seconds; no printing was done.

Probe acceptance is unchanged: positive extrusion in the actual deposited layer
interval, with restored offsets and linear/arc centreline distance ≤0.27 mm for
the intended nominal 0.5 mm line. Every probe is checked inside its actual CAD
source, and packed coordinates/bed exclusions are independently read back from
the serialized project. Coupon crops come from production parts, not simplified
joint substitutes. The shoe matrix uses the existing checker's matrix label to
require both orientations; the shoes themselves remain complete and uncut.

Initial ordinary shoe hooks failed 32 of 624 unchanged probes; retain
`.slice/row-shoe-toolpath-initial-20261019/toolpaths.json`. The correction uses
the existing finite crest and matching upper-wall bottom chamber. Top wall pins
remain ordinary. No point, tolerance or assertion was moved to hide the failure.

Qualification uses Bambu Studio 02.08.02.61, P2S 0.4 mm, 0.20 mm Standard,
PETG Translucent with the explicit translucent process overrides, Smooth PEI
(`High Temp Plate`), 60°C bed, 270°C nozzle, 0.5 mm lines, one wall, 100% infill
and no supports. This is distinct from stock process settings selected in an
ordinary app export. The full qualification example estimates 4,329.72 g and
1,890,139 seconds of summed print time (21d 21h 2m 19s), not elapsed machine time
measured from printing. Other selected profiles have their own estimates/results.

Reproduce with fresh output paths, preserving every previous run:

```sh
bun qualify-independent-row-shoes.ts <fresh-shoe-directory>
bun qualify-independent-row-carriers.ts <fresh-carrier-directory>
bun qualify-compact-row-key-hosts.ts <fresh-compact-key-host-directory>
bun prototypes/qualify-grid-row-transfer.ts <fresh-complete-directory>
bun .claude/skills/slicing-with-bambu-cli/slice-3mf.ts <project.3mf>
bun prototypes/shared-wall-qualification.ts check <coupon-evidence.json> <slice-directory> <fresh-report.json>
```

## Assembly and physical trial protocol

Digital results establish neither hand fit nor a load rating. Do not send a
printer job as part of this record. Before an owner-run trial, record revision,
exact project/hash, fits, material/spool condition, machine/nozzle, presets and
overrides, plate, axes and any cleanup. Keep process/axis results separate.

1. Print the chosen-fit joint samples first. Inspect warp, strings and bed flare;
   remove ordinary debris and record any alteration to a mating face. Grade
   insertion as hand fit, tool required or unable to seat; inspect roots afterward.
2. Key each lower wall's longitudinal sections together before snapping it onto
   the deck. Install the lower end wall and lip. Confirm feeding and wall seating.
3. Join each carrier bay sideways along Y on its hidden keys before lowering the
   joined panels onto the lower wall catches. Do not rely on inserting keys from
   outside after the panel catches have seated. Check flush seams and full bearing.
4. Seat shoes in their exact planned slots; then assemble the upper lane decks,
   keyed walls, end walls and lips onto the shoe pins. Check all shoulders seat
   fully and that no shoe or receiver is suspended by a hook. Repeat only the
   requested rows and transitions.
5. Join split top covers on their hidden longitudinal keys before lowering them
   last. Check flush faces, normal/vertical play and intended retention without
   forcing repeated disassembly. A cover is not a carrying handle.
6. After hand-fit checks, agree actual full and one-sided can loads and dwell
   duration before a loaded trial. Record deflection, feeding, creep and residual
   set during dwell and after unloading. Support the loaded organizer underneath.
   No sustained-load, drop, cover-lifting or printed-strength claim is established.
