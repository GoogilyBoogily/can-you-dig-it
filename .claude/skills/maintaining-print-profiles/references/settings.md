# Profile contracts and evidence

## Catalogue and composition

`profiles.ts` flattens `inherits` chains by each preset's internal `name`, not
filename. Machine compatibility is stored by catalogue index. Each process
also retains extruder variant/id arrays and the settings needed for estimates.
`composeProfile` includes machine identity, bed size/height/type, exclusions,
filament color/count and preset IDs. The generated catalogue's version and the
installed slicer binary should be recorded during qualification.

The Bambu preset loader can reset values to their named base unless they are
listed in `different_settings_to_system`. Entries are process, one per filament,
then printer. Speeds are written across the process's extruder variant slots.
Do not write `filament_extruder_variant` speculatively: the GUI validates its
length against per-filament bookkeeping. See the import-debugging skill before
changing this private config contract.

Custom imported settings stay custom even if some names match the catalogue.
`picksFromConfig` identifies supported selections; it does not normalize arbitrary
bytes. Sharing serializes short catalogue picks, never the imported archive.

## Estimate model

`estimateSettings` resolves process and filament settings then project overrides.
The wall band combines outer width with the remaining inner loops; automatic
per-wall widths inherit the generic line width, including nozzle percentages.
Top and bottom skin thickness each take the maximum of layer count×height and
explicit thickness. Density affects grams after volume integration.

`estimateVolume` uses midpoint section samples, at least eight, with maximum step
0.5 mm by default. It subtracts the core surviving perimeter shrink and both skin
probes, applying infill only there. At 100% infill it returns solid volume. It
does not reproduce slicer path overlap, bridging, adhesion, supports or purge.
Compare profile-resolved settings, density, exact geometry and copy counts before
calling an estimate inaccurate; legacy reference assumptions are a different model.

## Translucent process choices

Current project choices include 0.2 mm layers, one wall, no shells, 100% aligned
infill at 45°, 20 mm/s, widened lines, fan off and reduced retraction. PETG gets
270 °C and 60 °C on the applicable hot/engineering/textured plate settings; cool
and SuperTack presets retain their settings. The coupon explicitly chooses
`High Temp Plate` (smooth PEI); ordinary app output follows printer defaults.

These are project choices, not universally validated material settings. In
particular 0.2 mm differs from the 0.4 mm-nozzle transparency demo's 0.1 mm layer
choice. Other materials must retain their own temperatures. A process change
can change fit, elephant foot, bonding and clarity; qualify with actual prints.

## Primary resources

Reviewed 2026-10-15:

- [Bambu preset source, pinned catalogue](https://github.com/bambulab/BambuStudio/tree/v02.08.02.61/resources/profiles/BBL):
  inherited system machine/process/filament data; match the binary version.
- [PresetBundle.cpp](https://github.com/bambulab/BambuStudio/blob/v02.08.02.61/src/libslic3r/PresetBundle.cpp)
  and [PrintConfig.cpp](https://github.com/bambulab/BambuStudio/blob/v02.08.02.61/src/libslic3r/PrintConfig.cpp):
  GUI preset validation and modified-key/variant behavior. These implementation
  details are version-specific rather than promises of the 3MF standard.
- [Bambu transparent-PETG guide](https://wiki.bambulab.com/en/knowledge-sharing/transparent-petg):
  upstream demonstration resource cited by the source/specs. Live retrieval was
  blocked during this research pass; re-open the guide and its exact demo project
  before claiming a newly verified recipe. The values above were inspected in
  local production code, not inferred from an inaccessible page.
- [PETG creep study, DOI 10.3390/polym17152075](https://www.mdpi.com/2073-4360/17/15/2075):
  sustained-load and raster-direction effects support physical qualification,
  not direct adoption of another printer's material constants. See the printed
  joint skill for experimental scope and limits.
