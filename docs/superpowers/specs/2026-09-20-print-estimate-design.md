# Print time, cost, and honest grams

Two numbers scraped per filament, one field for the price of a spool, and the summary says
how long and how much. Per-part grams show on the part tabs.

## Why

The summary gives a weight, and only a weight, unless the Translucent box is on; then it
gives hours too, because 20 mm/s is the whole story there. For every other pick the user
gets nothing, and a 2-tier default lane is 13–27 hours on the comparable designs' pages -
the number people decide on. Peers show grams per part (Gridfinity Layout Tool, OwlCAD's
BOM); none show time and cost together.

The weight itself is at PETG's density whatever the picker says, and the label admits it
(`main.ts:226-233`). Bambu's filament presets carry `filament_density`; we already scrape
the presets.

## Scraped

`profiles.ts` adds two numbers to each `Filament` in `profiles/index.json`:

- `density` g/cm³ from `filament_density` (1.24 PLA, 1.27 PETG, 1.04 ABS, 1.1 TPU…).
- `maxFlow` mm³/s from `filament_max_volumetric_speed` (Bambu PLA Basic 21 on a 0.4;
  PETG 13; the H2D high-flow entries 30+).

Both are `;`-free scalars in Bambu's files. `bun run profiles` regenerates the index; the
version string moves with the catalogue as it does today.

## Grams

`filamentGrams` runs in the worker at `DENSITY` 1.27 and the result is linear in density, so
the main thread rescales: `grams × filament.density / DENSITY`. No worker change, no rebuild
on a filament pick. The "(weighed at PETG's density)" caveat goes; the label names the
picked filament's family as it does now.

Per part: each part tab's label gains `· 2 × 48 g` (qty × grams, rescaled); the plate
buttons already sum grams and pick the rescaled value up through `partGrams`.

## Hours

    mm³      = Σ grams / density × 1000
    flow     = min(filament.maxFlow, nozzleCap)
    hours    = mm³ / (flow × DUTY) / 3600

`nozzleCap` is `layerHeight × lineWidth × the process's outer wall speed`, the flow a
0.20 mm Standard process actually asks for; that needs `outer_wall_speed` slot 0 and
`line_width` scraped onto `Process`, two more scalars. `DUTY` 0.45 is the share of wall time
a printer spends extruding at full flow once travel, acceleration, small perimeters and
layer changes are in; it is a constant, set once against a real slice, and labelled as
such: `// ponytail: one duty factor; per-feature speeds if anyone lines it up against a slicer`.
The translucent path keeps `translucentFeed` as its flow and drops the duty factor: at
20 mm/s the printer is never accelerating.

For scale: 0.20 mm Standard on a 0.4 nozzle asks for 0.2 × 0.42 × 200 mm/s = 16.8 mm³/s,
under PLA Basic's 21, so a 1.2 kg lane (968 cm³) at 16.8 × 0.45 is about 36 h. The
comparable designs' pages say 20 h for 320 g on slower printers, so that is the right
order.

Shown in the summary as `about 36 h (±30 %)`, only when a machine is picked: with no
machine there is no flow to divide by, and the row says so: "pick a printer for a time".

## Cost

`<input id="pricePerKg" type="number" min 0 step 1>` next to the filament pick, with a
currency-free label "per kg"; empty means no cost line. Saved in `localStorage` under
`can-you-dig-it.pricePerKg`, guarded. The summary's Filament row becomes:

    ~1.21 kg PETG · about 36 h (±30 %) · 25 per kg → about 30

No machine rate, no electricity: those are the user's numbers and the spread on the hours
already swamps them.

## Calibration

Once, by hand: slice the default 2-tier lane's plate 1 in Bambu Studio on 0.20 mm Standard
/ PLA Basic / P1S, read the hours, set `DUTY` so the estimate lands within 10 %. Record the
slice's hours in the `DUTY` comment so the next person can re-check it.

## Tests

- `test/profiles.test.ts`: every filament has `density` in 0.9–2.0 and `maxFlow` in 2–60;
  every process has `lineWidth` and `outerWallSpeed`; PLA Basic's density is 1.24.
- `test/estimate.test.ts` (new, pure): `hours()` on a known mm³ and flow; the translucent
  path equals the old `translucentHours` for the same parts; no machine → empty string.
- `test-ui/profile.ui.test.ts`: picking PETG then PLA changes the kg shown by the density
  ratio; a price typed survives a reload; clearing it removes the cost.
