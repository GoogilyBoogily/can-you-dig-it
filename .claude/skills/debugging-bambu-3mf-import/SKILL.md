---
name: debugging-bambu-3mf-import
description: Diagnose can-you-dig-it 3MF projects that lose Bambu settings, open as geometry only, reset modified values, select the wrong extruder, or fail import/version/exclusion checks. Use for Bambu consumer compatibility; ordinary mesh/packing changes use exporting-printable-models.
---

# Debugging Bambu 3MF import

Bambu Studio can load geometry while dropping project settings. Check settings by
reading them back in the actual target consumer. The gates below describe
`v02.08.02.61`, not all Bambu or Orca releases. Compare `profiles/index.json` with
the binary's bundle version before assuming they match. Source locators and
research limits are in [the source reference](references/sources.md).

## Inspect, then read back

```bash
unzip -l job.3mf
unzip -p job.3mf 3D/3dmodel.model | rg -o 'Application">[^<]*'
unzip -p job.3mf Metadata/project_settings.config | jq '{printer_model, nozzle_diameter, extruder_type, fc: (.filament_colour|length), d: .different_settings_to_system, fev: .filament_extruder_variant}'
bun .claude/skills/slicing-with-bambu-cli/slice-3mf.ts job.3mf
```

**A CLI pass does not clear the GUI-only preset-loader gates 5–7.** Open the file
in the GUI when GUI preset behavior is the claim under test; save a fresh copy
for read-back without overwriting the input. The helper also rejects internal
diagnostics, nonzero result codes, missing G-code and incomplete time/gram headers.

## Gates, in load order

| # | Source | Fails when | GUI | CLI |
|---|---|---|---|---|
| 1 | bbs_3mf.cpp `_handle_end_metadata` | `Application` does not start with `BambuStudio-` (owner: `BAMBU_IDENTITY`, `src/export.ts`) | version becomes 0.0.0.0 and `dont_load_config` is set: settings, plate gcode and thumbnails are skipped, and multi-instance objects are split. Most likely shows "invalid config, load geometry data only" | slices on default settings; e.g. -61 "Cool Plate does not support filament" |
| 2 | same, `model_settings.config` | bad XML in a BBL file | load fails, "Archive does not contain a valid model config" | -6 |
| 3 | same, plate ids | a `plater_id` greater than the plate count | load fails, "invalid plate index" | -6 |
| 4 | `_extract_project_config_from_archive` | project_settings JSON does not parse | only logged, then the empty config trips gate 7: "invalid config" | **139 segfault** |
| 5 | PresetBundle.cpp `load_config_file_config` | `filament_colour` empty | throws "Invalid configuration file" | not checked |
| 6 | same | `extruder_variant_list` present and `filament_extruder_variant` length ≠ `filament_self_index` (default 1..n) or < filament count | throws. Never write `filament_extruder_variant` | not checked |
| 7 | Plater.cpp `is_bbl_vendor_config` / `check_project_config` | `printer_model` not a BBL model **and** (`nozzle_diameter` missing, or ≥2 nozzles with an `extruder_type` length that differs) | "invalid config, load geometry data only" | not checked |
| 8 | version checks (BBL files only) | file major > app major, or same major with a newer minor | "lower version" / Newer3mfVersion dialog | -24 without `--allow-newer-file` |

## Why a value didn't stick (the file loaded)

`update_non_diff_values_to_base_config` (PrintConfig.cpp) resets **every key not in the preset's `different_settings_to_system` entry** to the base preset's value. The base is the `inherits_group` entry if there is one, otherwise the system preset named by `*_settings_id`.
- `different_settings_to_system` has `filament_colour.length + 2` entries: `[0]` process, `[1..n]` filaments, `[n+1]` printer. Each is a `;`-joined key list.
- A top-level `inherits` is ignored; `inherits_group` wins.
- Vector keys in the diff keep only the slots whose variant matches (`print_extruder_variant` + `print_extruder_id`). Fill the process's actual variant slots. A scalar's behavior on a particular dual-extruder setup needs read-back; the historical H2D slot-0 explanation was not independently verified in source.
- Values equal to the preset: selected clean. Different: selected "(modified)".
- Bambu writes `different_settings_to_system` into every project it saves, so its presence proves nothing (719c168).

## Plate refused (CLI -64, "too close to exclusion area")

`layered_print_cleareance_valid` (Print.cpp) intersects each part's 2D convex hull with the `bed_exclude_area` rectangles, with **no margin**. It checks `wrapping_exclude_area` too when `enable_wrapping_detection` is on ("too close to clumping detection area"). `pack()` keeps `bedMargin` clear of the `excludeArea` in `profiles/index.json` (c8a6c6c, `test/pack.test.ts`). `keepOutFromConfig` returns `[]` when the config has no `bed_exclude_area`, so a profile imported without the key packs into the corner with no warning. On -64, check the imported profile first. If the plate grid disagrees with the GUI, check `test/export.test.ts` against `compute_colum_count` / `compute_origin` (PartPlate.cpp).

## CLI codes

Process exit = `code & 255` (-6 gives 250, -61 gives 195, -64 gives 192). `result.json` `return_code` holds the negative value. Full list: `Utils.hpp` in the source.

| Code | Meaning |
|---|---|
| -5 | preset JSON bad: `from` not system/user, bad `type`, duplicate machine/process |
| -6 | model file unreadable: plate index, `model_settings.config` XML |
| -16 / -17 | printer not in the process's `upward_compatible_machine` / process not compatible |
| -24 | file version newer than the CLI |
| -50 | a plate is empty, or nothing sits fully inside it |
| -52 | object over the bed boundary |
| -61 / -62 | filament vs bed type / mixed temperatures |
| -64 | collision in layer printing, including exclusion-area rejection; inspect the actual message |
| -100…-105 | slicing and gcode-path errors (-103: unprintable on the first layer, -105: wrapping-detect area) |

## Known and accepted

`BAMBU_IDENTITY` declares version `02.00.00.00` for the importer compatibility
contract. Review version-triggered migrations (`remove_wrapping_detect`,
`skirt_per_object_reset` and older GUI checks) at the target tag before changing
it. Keep it within the supported consumer range; never bump it merely to suppress
a warning. No profile is also a deliberate path: the UI says slicer defaults
apply. Do not fabricate settings just to remove that dialog.

Retain the input hash, app/preset versions, command/logs, imported/read-back
settings and outcome. Use [maintaining-print-profiles](../maintaining-print-profiles/SKILL.md)
when the root cause is config composition, or
[slicing-with-bambu-cli](../slicing-with-bambu-cli/SKILL.md) for toolpath diagnostics.
