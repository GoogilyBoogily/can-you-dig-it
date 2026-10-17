# Bambu implementation references

Reviewed 2026-10-15 at tag `v02.08.02.61`, matching the project catalogue at that
time. These are vendor implementation details, not requirements imposed by the
3MF core standard. Inspect the same functions at the actual target version before
changing private metadata or treating numeric codes as stable.

| Primary source | Search symbols / question |
|---|---|
| [bbs_3mf.cpp](https://github.com/bambulab/BambuStudio/blob/v02.08.02.61/src/libslic3r/Format/bbs_3mf.cpp) | `_handle_end_metadata`, `BambuStudio-`, `dont_load_config`, `_extract_project_config_from_archive`, `plater_id`: application identity, archive parsing, version and plate gates. |
| [PresetBundle.cpp](https://github.com/bambulab/BambuStudio/blob/v02.08.02.61/src/libslic3r/PresetBundle.cpp) | `load_config_file_config`, `filament_colour`, `filament_extruder_variant`, `filament_self_index`, `inherits_group`: GUI preset loading and list cardinality. |
| [PrintConfig.cpp](https://github.com/bambulab/BambuStudio/blob/v02.08.02.61/src/libslic3r/PrintConfig.cpp) | `update_non_diff_values_to_base_config`, `different_settings_to_system`, `print_extruder_variant`, `print_extruder_id`: restored values and variant matching. |
| [Plater.cpp](https://github.com/bambulab/BambuStudio/blob/v02.08.02.61/src/slic3r/GUI/Plater.cpp) | `is_bbl_vendor_config`, `check_project_config`: printer/nozzle/extruder config acceptance. |
| [PartPlate.cpp](https://github.com/bambulab/BambuStudio/blob/v02.08.02.61/src/slic3r/GUI/PartPlate.cpp), [PartPlate.hpp](https://github.com/bambulab/BambuStudio/blob/v02.08.02.61/src/slic3r/GUI/PartPlate.hpp) | `compute_origin`, `compute_colum_count`: private multi-plate layout. |
| [Print.cpp](https://github.com/bambulab/BambuStudio/blob/v02.08.02.61/src/libslic3r/Print.cpp) | `layered_print_cleareance_valid`, `bed_exclude_area`, `wrapping_exclude_area`: plate exclusion checks. |
| [CLI codes in libslic3r/Utils.hpp](https://github.com/bambulab/BambuStudio/blob/v02.08.02.61/src/libslic3r/Utils.hpp) | Negative CLI result codes. The shell exit can be the low eight bits; inspect the fresh result plus both logs. |

The existing numbered gate table records the project's previous importer
investigation. This maintenance pass reopened the relevant upstream sources;
some GitHub views truncate large files. Prefer raw tagged source for a disputed
branch and an actual consumer read-back for observed behavior. A source symbol
alone does not prove an untested binary took that branch.

The CLI uses flattened command-line presets, which take precedence over project
values. The slicing helper copies modified values on top so its result represents
the selected overrides. That does not test every GUI loader path. A project that
slices with supplied presets can still fail when imported normally in the GUI.
