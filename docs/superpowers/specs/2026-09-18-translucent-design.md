# Translucent print settings

A "Translucent" checkbox under the filament pick. Ticked, the composed
`project_settings.config` carries the values from Bambu's translucent-PETG guide
(https://wiki.bambulab.com/en/knowledge-sharing/transparent-petg) and lists them in
`different_settings_to_system`, so Bambu Studio keeps them instead of swapping in the
system preset's.

## Why it works

The picker spec says Bambu Studio replaces every value in the config with the named
preset's. That is true of unlisted keys only. `PresetBundle::load_config_file_config`
reads `different_settings_to_system` — a Strings option, one entry per preset in the
order process, filament(s), printer, each a `;`-joined key list — and passes each set to
`PresetCollection::load_external_preset`, whose `update_non_diff_values_to_base_config`
overwrites only keys not in the set. Listed keys survive and the preset opens as
"0.20mm Standard (modified)". Bambu's own demo 3MFs on that wiki page (X1C, 0.4 / 0.6 /
0.8) do exactly this, with `from: "project"` and the system preset names.

The 0.4 demo's list, for reference:

```
["bottom_shell_layers;bridge_speed;enable_overhang_speed;gap_infill_speed;infill_direction;initial_layer_infill_speed;initial_layer_print_height;initial_layer_speed;inner_wall_line_width;inner_wall_speed;internal_solid_infill_line_width;internal_solid_infill_speed;layer_height;line_width;outer_wall_line_width;outer_wall_speed;sparse_infill_density;sparse_infill_line_width;sparse_infill_pattern;sparse_infill_speed;support_line_width;top_shell_layers;wall_loops",
 "fan_max_speed;fan_min_speed;filament_flow_ratio;filament_retraction_length;nozzle_temperature;nozzle_temperature_initial_layer",
 ""]
```

Why it suits these parts: every plate prints flat and overhang-free by the flat-pack
rule, so fan-off has no droop to cause. One wall, no shells and 100 % aligned rectilinear
infill in one direction turn each plate into a stack of parallel lines, which is the
structure the guide is after.

## Values

Process, every nozzle: `wall_loops 1`, `top_shell_layers 0`, `bottom_shell_layers 0`,
`sparse_infill_density 100%`, `sparse_infill_pattern alignedrectilinear`,
`infill_direction 45`, `enable_overhang_speed 0`, `layer_height 0.2`, and 20 mm/s for
outer wall, inner wall, sparse infill, internal solid infill, initial layer, initial layer
infill, gap infill and bridge. Line width 0.5 on a 0.4 nozzle, nozzle + 0.02 above that
(the demos' numbers). No option on a 0.2 nozzle: Bambu ships no demo and at 20 mm/s it
would run for months.

Departures from the demos, on purpose:
- Layers 0.2 on the 0.4 nozzle, not the demo's 0.1. Bambu's demo is a 25 mm cube; a
  default shelf is 2.5 L of solid plate, and at 0.5 × 0.1 × 20 = 1 mm³/s that is four
  weeks. 0.2 halves it and is what the 0.6 and 0.8 demos print anyway.
- Infill at 45°, not 0°. Every wall's tabs and pins cantilever across the bed's Y after
  packing, and 0° ran the lines along each tab root with one 0.5 mm loop crossing it. A
  flat plate looks the same at any single angle.
- The first layer keeps the preset's 0.2 (the 0.4 demo's 0.1 varies by half its height on
  textured PEI).
- Speeds are arrays, one slot per entry of the process's `print_extruder_variant`, and the
  config carries that list and `print_extruder_id`. Bambu Studio restores a listed value
  only into slots whose variant and extruder id it finds in the file's own list, and a
  scalar lands in slot 0 alone: on an H2D that is extruder 1 while the filament prints
  from extruder 2. `profiles/index.json` carries the two arrays per process.

Filament, every filament: fan min and max 0, `enable_overhang_bridge_fan 0` (the
dovetail groove's flank is 13 % overhang, past the 10 % threshold, and would get a frosted
band), `filament_flow_ratio 1.01`, `filament_retraction_length 0.3` (all three demos;
a long retraction at 270 °C across every cell pulls air into the melt). PETG only (label
matches `/PETG/`): `nozzle_temperature 270` and the initial-layer twin. The index carries
no `filament_type`, and 270 would cook PLA Translucent. Flow and temperature are per
variant too, but a 3MF's `filament_extruder_variant` is the per-filament list and must
match `filament_self_index` or the loader throws, so they stay in slot 0, the Standard
nozzle. A High Flow nozzle keeps the preset's own.

Left out on purpose: flow 1.03, adaptive layers, Arachne, scarf seam, ironing. None are in
Bambu's demo, and tabs are the one place over-extrusion bites. `fit` is the user's knob
for that.

## Readout

The filament estimate assumes 6 % infill. Ticked, the summary and the per-plate grams
switch to solid volume (`solidGrams` on `PartOut`) and the Filament line adds the hours
at 20 mm/s from `translucentFeed(nozzle)`. Expect roughly 2× the grams and ten times a
standard print's hours; a 0.8 nozzle is the fast path.

## Plumbing

- `src/profiles.ts`: `Picks.translucent`, `translucentOverrides(machine, process, filament)`
  spread into the config by `composeProfile`, `picksFromConfig` reads the flag back from
  the override itself (every project Bambu Studio saves carries
  `different_settings_to_system`, so its presence proves nothing), `describePicks`
  appends "translucent".
- `profiles.ts` (scraper): `extruderVariants` and `extruderIds` per process, from
  `print_extruder_variant` / `print_extruder_id`. `BAMBU_PROFILES` and `BAMBU_VERSION`
  point it at a checkout of a BambuStudio tag when there is no macOS install.
- `index.html` / `src/main.ts`: `#pickTranslucent` in the picker block, wired through
  `applyPicks` like the selects. Not in `#form`, not in the hash: a print preference, not
  part of the design a Share link describes. It persists with the composed config.
- An imported 3MF profile is untouched, as before; the checkbox only shapes the composed
  path.

## Tests

- `test/profiles.test.ts`: values present and every override listed; speeds fill every
  variant slot, seven on the H2D; PLA has no temperature; 0.6 nozzle gets 0.62 lines; off
  writes today's file; round-trip and label, and a Studio-saved config does not read as
  translucent.
- `test-ui/profile.ui.test.ts`: tick, download, the config lists `wall_loops`; reload,
  still ticked.
- Manual, once: open the 3MF in Bambu Studio 2.8, the Process tab reads "(modified)"
  with Wall loops 1 and Top shell layers 0, the filament tab fan 0 and 270 °C. That is
  the only proof the list is honoured; the writer test proves only that it was written.
