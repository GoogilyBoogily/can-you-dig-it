# Bambu floating-infill diagnostics

Investigated 2026-10-15 with installed Bambu Studio **02.08.02.61**. These
diagnostics originate in the slicer's floating-concentric infill, after mesh
import and layer generation. They do not identify a physical Z height.

## Reproduction independent of the generator

`zfiller-repro.ts` constructs a convex wedge directly from eight vertices and
twelve outward triangles. It uses neither product geometry nor Manifold. Its
footprint is 70 × 83.5 mm; the top rises from 4 to 16.34288787841797 mm. Each
indexed edge has an opposite partner and its volume is footprint × mean height.

With the flattened P2S Standard/PETG settings from the tall regression job:

| Input | Slicer exit/result | Internal diagnostics |
| --- | --- | --- |
| Wedge, unrotated | 0 / 0 | 0 |
| Same wedge, rotated 90° | 0 / 0 | `ZFiller: encounter idx from clip` |

The count varies with coordinate precision and runs; it is not a stable oracle.
The standalone committed probe reproduced 16 diagnostics in its Float32 run.
Rotation preserves volume, topology, and triangle area. This establishes that
the diagnostic can occur on a valid convex solid without joints or degenerate
triangles, independently of the product's mesh-generation pipeline.

Run a normal slice to obtain flattened presets and an exported profile:

```sh
bun run slice.ts
# Copy the printed artifact directory, even if slicing validation fails:
bun run zfiller-repro.ts /absolute/path/to/.slice/run-...
```

Each probe retains two 3MFs, flattened settings, exact command arguments,
G-code, stdout/stderr, and `report.json` in `.slice/zfiller-*`. Exit 1 means a
slicer failure or internal diagnostic was reproduced; exit 0 means neither
orientation reported errors. No settings are modified by this probe.

## What the slicer is doing

In [`detect_floating_line`](https://github.com/bambulab/BambuStudio/blob/v02.08.02.61/src/libslic3r/Fill/FillFloatingConcentric.cpp#L389-L494),
each original infill-line vertex receives a nonnegative tag. Floating-area
polygon vertices receive tags beyond the line's range. Intersections normally
receive negative identifiers from the Z-fill callback. The code complains when
a clipping-polygon tag survives in the output, or when the callback sees two
edges from the subject rather than one from each input.

[`Clipper::SetZ`](https://github.com/bambulab/BambuStudio/blob/v02.08.02.61/src/clipper/clipper.cpp#L1625-L1633)
explicitly copies an endpoint tag and bypasses that callback when an
intersection coincides with an endpoint. Thus the tag assumption is too strict
for coincident clipping vertices. This explains a route to the diagnostic; the
installed binary was not instrumented to prove every individual event follows
that route.

The reconstruction code also asserts one merged chain, then uses only the
first chain; Release builds cannot rely on that assertion. A proper upstream
fix needs to preserve line order/segment identity through coincident clipping
and verify continuity and widths, rather than merely suppressing the log.
The floating-concentric source in **2.8.4.57 beta** was byte-identical to this
version when checked; that beta binary was not tested.

## Product cases and toolpath checks

- Tall split layout: isolated rotated `lane-deck-front` reproduced 45 messages;
  the other nine unique parts were clean at their isolated placements.
- Removing all features still reproduced the issue. The same deck unrotated
  was clean. Rotating or moving a part is therefore insufficient as a general
  geometry fix: the app must accept arbitrary valid bed placements.
- X1 case: isolated `lane-top-wall-right-front` reproduced the other message,
  `both point in subject: 1, 2, 1, 0`, twice. Both default X1 and P2S full-job
  runs subsequently reproduced four such messages with exit/result 0.
- Repeating the identical isolated tall deck produced counts 45, 47, and 45.
  Normalized extrusion segments/widths differed at several layers. Approximate
  deposited-area comparisons found small changes (up to about 0.24 mm² gained
  and 0.10 mm² lost at the sampled changed layers), not a demonstrated missing
  whole component.
- Independent mesh cross-sections versus G-code centerlines found no entirely
  unprinted component above 0.05 mm² in 81 deck layers / 88 components. The
  reduced wedge had extrusion near its entire boundary in all 81 layers.
  The isolated X1 wall likewise had no wholly unprinted component in 30
  layers / 95 components, after accounting for the printer's 2 mm extruder
  offset; at most 0.037 mm of a component boundary was farther than 0.65 mm
  from an extrusion centerline.
  This is a limited coverage check, not proof of complete skin coverage,
  correct flow, physical strength, or absence of every slicer defect.
- Disabling floating-shell or narrow-solid-infill detection removed the logs.
  Disabling narrow-solid handling changed sampled deposited areas by several
  mm², so these settings have not been adopted as a workaround.

Raw investigation scripts, per-object jobs, comparisons and logs are retained
at `/tmp/cyd-zfiller-investigation/`. The portable minimal reproducer is in the
repository so an upstream fix can be retested without those temporary files.

[Bambu issue #11751](https://github.com/bambulab/BambuStudio/issues/11751)
reports the same diagnostic alongside extrusion loss on different models. It
supports further investigation, but does not establish that our parts have the
same failure or that every instance of this message loses material.

## Local fix and remaining upstream work

`slice.ts` now retains every run in its own directory, preserves both logs,
uses an isolated slicer data directory, checks both process and result codes,
and rejects internal error/fatal messages (including ZFiller) even on exit 0.
It reports the artifact location instead of silently calling the slice valid.
Previously it discarded stdout/stderr and accepted these runs.

The mesh exporter and user profiles have not been distorted to hide the issue.
The upstream infill implementation still needs a verified fix before affected
slices can be called validated. No upstream issue/comment has been submitted
and no installed application has been patched.

Verification of the local changes: **990 unit tests passed**, typecheck,
production build and whitespace checks passed. Real default P2S and X1 runs
now fail validation on their four internal diagnostics despite slicer exit 0.
An explicit floating-detection-off control completed all 18 plates and exited
0; that was a test of the acceptance path, not an adopted printing preset.
