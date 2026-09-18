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
`infill_direction 0`, `enable_overhang_speed 0`, and 20 mm/s for outer wall, inner wall,
sparse infill, internal solid infill, initial layer, initial layer infill, gap infill and
bridge.

Process, by nozzle, as the demo files differ: 0.4 gets `layer_height 0.1`,
`initial_layer_print_height 0.1` and 0.5 mm lines; 0.6 and 0.8 keep the picked process's
layer height and get nozzle + 0.02 lines; 0.2 gets neither (Bambu ships no demo).

Filament, every filament: fan min and max 0, `filament_flow_ratio 1.01`. PETG only
(label matches `/PETG/`): `nozzle_temperature 270` and the initial-layer twin. The index
carries no `filament_type`, and 270 would cook PLA Translucent.

Left out on purpose: flow 1.03, adaptive layers, Arachne, scarf seam, ironing. None are in
Bambu's demo, and tabs are the one place over-extrusion bites. `fit` is the user's knob
for that.

## Plumbing

- `src/profiles.ts`: `Picks.translucent`, `translucentOverrides(machine, filament)` spread
  into the config by `composeProfile`, `picksFromConfig` reads the flag back from the
  presence of `different_settings_to_system`, `describePicks` appends "translucent".
- `index.html` / `src/main.ts`: `#pickTranslucent` in the picker block, wired through
  `applyPicks` like the selects. Not in `#form`, not in the hash: a print preference, not
  part of the design a Share link describes. It persists with the composed config.
- An imported 3MF profile is untouched, as before; the checkbox only shapes the composed
  path.

## Tests

- `test/profiles.test.ts`: values present and every override listed; PLA has no
  temperature; 0.6 nozzle keeps layer height and gets 0.62 lines; off writes today's file;
  round-trip and label.
- `test-ui/profile.ui.test.ts`: tick, download, the config lists `wall_loops`; reload,
  still ticked.
- Manual, once: open the 3MF in Bambu Studio 2.8, the Process tab reads "(modified)"
  with Wall loops 1 and Top shell layers 0, the filament tab fan 0 and 270 °C. That is
  the only proof the list is honoured; the writer test proves only that it was written.
