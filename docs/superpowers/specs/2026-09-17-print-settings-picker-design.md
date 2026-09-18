# Print settings picker

Four dropdowns (printer, nozzle, process, filament) covering every Bambu Lab printer
Bambu Studio ships presets for, replacing the single built-in profile and the need to
save a project from the slicer first.

## Why a reference config, not a full one

Bambu Studio 2.8 (`PresetBundle::load_config_file_config` →
`PresetCollection::load_external_preset`) overwrites every value in a 3MF's
`project_settings.config` with the named system preset's values
(`update_non_diff_values_to_base_config`), then selects that preset because nothing
differs. The file's values are ignored; only the preset names and a few keys checked
before that point matter:

- `printer_model` naming a BBL machine (`is_bbl_vendor_config`)
- `nozzle_diameter`, and `extruder_type` of the same length when there are two nozzles
  (`check_project_config`)
- `filament_colour`, whose length is the filament count (empty throws)
- `printer_settings_id`, `print_settings_id`, `filament_settings_id`

So the browser composes a small JSON naming three system presets. No CLI, no per-combo
files.

Correction (2026-09-18): keys listed in `different_settings_to_system` are exempt from
that overwrite. The translucent option uses it; see
`2026-09-18-translucent-design.md`.

## Data

`bun run profiles` scrapes `/Applications/BambuStudio.app/Contents/Resources/profiles/BBL`
into `profiles/index.json`:

- `machines`: one per `<printer> <nozzle> nozzle.json`, with printer model, nozzle,
  nozzle diameters, extruder types, printable area, printable height, default bed type.
- `processes` and `filaments`: every instantiable preset, with the machine indices it is
  compatible with. Filaments also carry a display label, vendor, and default colour.

Preset `inherits` chains are flattened in the generator, since the values above live in
parents.

## UI

Printer → Nozzle → Process → Filament. Any change recomposes the config and adopts it
through the existing profile path, so storage, export, and the 3MF upload are untouched.
Bed X/Y/Z follow the machine. On reload the selects are restored by reading the preset
names back out of the stored config.

## Tests

Unit: the index covers every printer; every machine has a process and a filament;
`composeProfile` emits every key Bambu checks for a single- and a dual-nozzle machine;
`picksFromConfig` round-trips. UI: pick a non-default combination, download, the config
names those presets and the bed followed the printer.
