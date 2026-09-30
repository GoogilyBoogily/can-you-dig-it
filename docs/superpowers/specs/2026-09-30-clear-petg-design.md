# Clear PETG: what the MakerWorld "Clear as glass" profile changes

Status: D3 (bed 60 °C) built 2026-09-30. D1 and D2 wait on a tile test on the P2S (see Test plan).

Source: https://makerworld.com/en/models/725342-clear-as-glass-petg, file
`Crystal+clear+petg.3mf` (Bambu Studio 01.10.01.50, A1 0.4, Textured PEI). Compared
against `translucentOverrides` in `src/profiles.ts` and
`2026-09-18-translucent-design.md`, which this would amend.

## What's in the file

One 30 × 30 × 2 mm tile (a 25.6 mm cube scaled flat), 3 mm outer brim. Two presets:

- Process "0.1mm fully transparent petg", inherits `0.20mm Standard @BBL A1`. Its
  `different_settings_to_system` list is key for key Bambu's own 0.4 demo, the one the
  translucent spec quotes. So the process half is nothing new.
- Filament "SLOW PETG Translucent", inherits `Bambu PETG Translucent @BBL A1`. This is
  where the author departs from Bambu.

## Side by side

| Key | MakerWorld | Ours today | P2S system preset | Call |
|---|---|---|---|---|
| wall_loops / top, bottom shells / infill | 1 / 0 / 0 / 100 % aligned | same | – | same |
| every speed | 20 | 20 | – | same |
| line widths | 0.5 | 0.5 on 0.4 | – | same |
| fan min / max | 0 / 0 | 0 / 0 | 10 / 30 | same |
| filament_flow_ratio | 1.01 | 1.01 | 0.95 | same |
| layer_height | **0.1** | 0.2 | – | open (D1) |
| initial_layer_print_height | **0.1** | preset 0.2 | – | keep ours |
| infill_direction | **0** | 45 | – | keep ours |
| nozzle_temperature (+ initial) | **265** | 270 | 245 / 250 | open (D2) |
| hot / textured / eng plate temp (+ initial) | **60** | unset, so 70 | 70 | adopt (D3) |
| filament_max_volumetric_speed | 13 | unset, so 6 | 6 | skip |
| slow_down_layer_time | 12 | unset, so 8 | 8 | skip |
| filament_retraction_length | unset | 0.3 | 0.3 | keep ours |
| enable_overhang_bridge_fan | unset | 0 | – | keep ours |
| brim | 3 mm outer, per object | none | – | skip |

## Decisions

- **D1, layer height: open, leaning 0.2.** 0.1 halves `translucentFeed` (0.5 × 0.1 × 20
  = 1 mm³/s) and doubles every translucent hour estimate. The translucent spec already
  turned it down for that reason. Their proof is a 2 mm tile, and ours are 3.5 mm webs in
  a full-thickness frame, so the tile flatters 0.1 more than our parts would. Only the
  tile test decides it.
- **D2, nozzle 265 vs 270: open, leaning 265.** Bambu's wiki says 270, this author 265.
  At 2 mm³/s both melt through. No structural reason either way, so the tile test picks.
- **D3, bed 60 °C on PETG: adopt.** The system preset is 70. Cooler means less elephant
  foot on the bed face, and every tab is flush with the bed face, so this helps fit for
  free. Set all six keys the file sets (`hot_plate_temp`, `textured_plate_temp`,
  `eng_plate_temp` and each `_initial_layer` twin) inside the same `/PETG/` gate as the
  nozzle temperature. PLA Translucent keeps its preset.
- **Infill stays at 45°.** At 0° the lines run along every wall tab's root with one
  0.5 mm loop across it. A flat plate looks the same at any single angle, so the
  strength wins.
- **First layer stays at the preset's 0.2.** A 0.1 first layer on textured PEI varies by
  half its height.
- **Skipped:** max volumetric speed and slow-down layer time (we extrude 2 mm³/s, and a
  layer of a 200 mm plate at 20 mm/s takes minutes, so neither ever bites), and the brim
  (a per-object model setting, and our plates are big and flat). Revisit the brim only if
  a translucent plate lifts.

## Concerns

- **The tile isn't our part.** 2 mm thick, no holes, no tabs. Clarity falls off with
  thickness whatever the settings, so "clear as glass" on the tile won't look like that on
  a 3.5 mm web. Judge the tile test side by side, not against the MakerWorld photos.
- **Fan off at 60 °C bed.** Fine for flat, overhang-free plates. But the frame's recess
  walls and the lattice cells are vertical faces printed with no cooling. If cell edges
  come out saggy or stringy, that's this, not the temperatures.
- **Tab fit shifts with bed temperature.** Dropping the bed 10 °C changes the elephant
  foot, which is what `fit` compensates. Any `fit` number calibrated on translucent at
  70 °C doesn't carry over. Nothing is calibrated yet (see `docs/open-questions.md`), so
  today this costs nothing.
- **Changing tests.** `test/profiles.test.ts` pins 270 and the sorted list of filament
  overrides (`toEqual`, so every new key moves it) and, if D1 flips, 0.2 layers. Those assertions change on purpose because the spec
  changes. They get reviewed together with this doc, not quietly edited to go green.

## Plan

1. Tile test (below). It settles D1 and D2.
2. `src/profiles.ts`, `translucentOverrides`: in the `/PETG/` block, nozzle to the D2
   winner and the six bed keys at `["60"]` (filament values are arrays). Bed keys done. They land in `different_settings_to_system`
   automatically, since the list is built from `Object.keys(filamentValues)`. If D1 flips,
   `TRANSLUCENT_LAYER = 0.1`, and the hours line in `src/main.ts` follows through
   `translucentFeed`.
3. Rewrite the comment block above `TRANSLUCENT_LAYER` and the "Values" and "Departures"
   sections of `2026-09-18-translucent-design.md`. Credit the MakerWorld file for 265 and
   60.
4. `test/profiles.test.ts`: nozzle to the D2 value. PETG gets all six bed keys at 60 and
   lists them (the sorted filament-key list), cool and SuperTack stay unset, PLA
   Translucent gets none: done. D1 assertions only if it flips.
5. No geometry change, so no `bun run ref`.

## Test plan

Tile test, on the P2S 0.4, textured PEI, Bambu PETG Translucent:

| Step | Expect |
|---|---|
| Open `Crystal+clear+petg.3mf`, switch printer to P2S 0.4, keep its process and filament, print (tile A) | Prints at 0.1 / 0° / 265 / 60, about 40 min |
| Same file, set layer 0.2, first layer 0.2, infill direction 45, nozzle 270, bed 70, print (tile B) | Our current values, about half the time |
| Optional tile C: B but 265 / 60 | Isolates temperature from layer height |
| Hold A, B (and C) over printed text | Pick the clearest. If B is close to A, D1 stays 0.2 |
| Check each tile's bed-face edge | Less flare at 60 °C bed than at 70 |

After the code change:

| Step | Expect |
|---|---|
| `bun run check` | clean |
| `bun test test/` | green, including the new bed-temperature cases |
| `bun run test:ui` | green, the translucent download still lists `wall_loops` |
| App: P2S 0.4, Bambu PETG Translucent, tick Translucent, Download 3MF, open in Bambu Studio 2.8 | Process "(modified)": wall loops 1, top shells 0. Filament "(modified)": nozzle 265 (or 270), hot, textured and engineering plate temps 60 (cool and SuperTack the preset's), fan 0 |
| Same, with Bambu PLA Translucent | Plate temps are the preset's, no 60, no 265/270 |
| Untick Translucent, download | No bed or nozzle overrides in the config |
| `bun run slice.ts` with the translucent overrides | Hours match the app's translucent hours line, roughly |
