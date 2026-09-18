# Top surface pattern in the 3MF

A "Top surface" select next to the print settings. Its value is written on every object
in `Metadata/model_settings.config` as `top_surface_pattern`. The default writes nothing.

## Why

Every plate prints outer face up, so the face you look at in the finished lane is a
slicer top surface. That makes two things true that are not true for an upright print:
fuzzy skin does nothing (Bambu: "it only affects the wall path"), and the top-surface
toolpath is the whole texture. Designers who ship face-up parts set it in the 3MF
(Industrial Organizer, https://makerworld.com/en/models/2470283, Hilbert floor). A
concentric or spiral pattern on a perforated plate centres on each island between the
holes and reads as intended; a Hilbert curve reads as a woven mat; monotonic line reads
as grain.

The imported profile must not be touched: `project_settings.config` is copied byte for
byte and Bambu Studio replaces its values with the named preset's anyway. A per-object
key is the one place a setting survives that, and it is what the reference files do.

## What is written

`threeMf(placed, bed, { profile, topSurface })`. When `topSurface` is set, each `<object>`
gets `<metadata key="top_surface_pattern" value="…"/>` after its `extruder` line. Values
offered:

| label | value | note |
|---|---|---|
| Profile default | (empty) | nothing written; today's file |
| Hilbert curve | `hilbertcurve` | slow, matte, hides seams; best on kumiko and breeze |
| Archimedean chords | `archimedeanchords` | spiral per island; best on circles and hex |
| Monotonic line | `monotonicline` | grain; best on slats and reeded |

Ironing is left out: it needs flow and spacing to go with it and a matte filament to
show, and the research put it behind the pattern in effect. Add `ironing_type` here if a
print asks for it.

## Plumbing

- `index.html`: `<select id="topSurface">` inside the print-settings block, after the
  filament pick. Not in `#form`, not in the hash: it is a print preference like the
  printer, not part of the design a Share link describes. Not persisted.
- `src/main.ts`: the 3MF click reads it and sends `topSurface` on the export `Req`.
- `src/worker.ts`: `Req` export variant gains `topSurface?: string`; passed to `threeMf`.
- `src/export.ts`: the option and the one extra metadata line. Nothing per part: it is
  the same value on every object, so `Placement` does not change.

## Tests

- `test/export.test.ts`: with `topSurface: "hilbertcurve"` the config carries the key on
  every object; without it the string `top_surface_pattern` is absent.
- `test-ui/`: the existing "bytes a slicer receives" case picks Hilbert, downloads, and
  finds the key in `model_settings.config`.
- Manual, once: open the 3MF in Bambu Studio, select an object, confirm the Process
  panel shows a per-object override for Top surface pattern. That is the only proof the
  key is honoured; the writer test proves only that it was written.
