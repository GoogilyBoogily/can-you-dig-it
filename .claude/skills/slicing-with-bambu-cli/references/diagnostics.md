# Slicer diagnostics and measurements

## Failures

Use the fresh run directory, process signal/exit, `result.json` and both logs.
An absent result after a crash is not a previously successful run. Exit 139 is
the shell convention for SIGSEGV; a spawn API may instead report the signal with
a null exit. Missing JSON alone does not identify the signal.

| Typical shell exit / result | Investigate |
|---|---|
| 139 / missing | Signal, flattened presets, preset compatibility and fresh logs |
| 253 / −3 | Absolute input paths, missing files or swallowed flag arguments |
| 254 / −2 | Unknown flags, plate range, hyphenated CLI option spelling |
| 251 / −5 | Preset JSON `from`/`type`, duplicate machine/process |
| 250 / −6 | Model/metadata/XML or plate identity |
| 232 / −24 | File version newer than accepted consumer |
| 192 / −64 | Layer-print collision, including exclusion-area checks; inspect the message and imported bed config |
| 0 / 0 with internal errors | Failed qualification, including ZFiller; output existence is insufficient |

Confirm codes at the target source version; the import-debugging skill has other
known result codes. For a diagnostic rerun, preserve the failed directory and use
another fresh output directory with `--debug 5`; do not overwrite evidence.
Command arguments should be an array, especially semicolon-separated preset
paths, so shell parsing cannot split them into commands.

## ZFiller

Read `docs/zfiller-diagnostics.md` and `zfiller-repro.ts`. A reduced convex wedge
without Manifold or product geometry reproduced the rotated-only diagnostic at
the investigated version, so a message does not by itself identify broken product
geometry. Counts vary and are not a stable regression oracle.

`bun run slice.ts` prints its artifact directory even if qualification fails.
Pass that directory (containing `job.3mf` and flattened machine/process/filament)
to `bun run zfiller-repro.ts /absolute/path/to/run`. It retains both orientations
in a new directory and exits 1 when it reproduces errors. State that as an
expected diagnostic result, not a passing production qualification.

Do not rotate/distort product geometry, suppress error logs or disable floating/
narrow-solid detection merely to clear diagnostics. Prior coverage probes did
not show a wholly absent component in the investigated parts, but did not prove
complete coverage, flow or strength. Version-specific upstream correction or a
separately validated consumer remains the substantive resolution.

Primary implementation:
[FillFloatingConcentric.cpp](https://github.com/bambulab/BambuStudio/blob/v02.08.02.61/src/libslic3r/Fill/FillFloatingConcentric.cpp)
(`detect_floating_line`) and
[Clipper SetZ](https://github.com/bambulab/BambuStudio/blob/v02.08.02.61/src/clipper/clipper.cpp#L1625-L1633).
Endpoint tagging and reconstruction assumptions explain a possible failure route;
source inspection is not binary instrumentation of every observed event.
Sources revisited 2026-10-15; use the actual target tag for new investigations.

## Material/time calibration

Compare exact source geometry, full quantities, density and selected/flattened
process settings. Separate the legacy `filamentGrams` reference model, solver
layout-card heuristic and profile-resolved `estimateVolume` displayed after build.
Supports, adhesion and purge are outside the current estimate model.

`slice.ts` intentionally measures default PETG Basic and prints an implied
`JOB_FLOW` for historical comparison. The UI no longer predicts time from it or
`translucentFeed`; do not add/update a nonexistent `main.ts` time constant.
Translucent jobs need their own actual slice. The historical observation that a
G-code volume header had mislabeled units should be rechecked at the target
version and cross-checked with mass/density before interpreting it numerically.

For geometry changes, remeasure affected solver lane/cover gram heuristics using
their reference assumptions. For estimate accuracy, measure the profile-aware
model with the same job/preset and disclose its remaining approximation.
