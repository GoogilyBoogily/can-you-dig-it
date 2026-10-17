---
name: exporting-printable-models
description: Maintain can-you-dig-it mesh conversion, rigid plate packing, STL ZIP or multi-plate 3MF serialization. Use for topology, winding, precision, quantities, build-volume and keep-out failures; use Bambu import debugging for dropped preset settings.
---

# Export printable models

Read `src/export.ts`, the relevant worker boundary and tests. Use
[manufacturing contracts and primary sources](references/manufacturing.md) for
format, topology or packing work.

## Preserve manufacturing boundaries

- Use `meshDataOf` for kernel meshes. Respect `numProp` stride and explicit merge
  vectors; do not weld by position, round coordinates to fix output, or remove
  degenerate faces. Validate the actual serialized data.
- High-level `stlZip` and `threeMf` require closed, consistently material-oriented,
  positive-volume models. `stlBinary` is also a low-level facet writer; preserve
  that existing distinction rather than changing its public contract silently.
- Preserve one source geometry per distinct printable part and all manifest
  quantities in `PackedPlan`. Placements use rigid +90° Z rotation and translation.
  `pack()` is the compatibility materialization path, not a second packing model.
- Measure actual coordinates and transformed extents, not supplied boxes alone.
  Enforce finite coordinates, valid indices, positive integer quantities, XYZ bed
  fit, margins, separation and printer keep-outs. Framing optimization may move
  placements without reflecting their geometry.
- Keep Bambu's multi-plate origin/grid, object-to-plate metadata and displayed
  `plateSummary` consistent. STL ZIP contains unique part files; 3MF contains
  all packed copies. Do not apply preview sampling to manufacturing outputs.
- Preserve imported `project_settings.config` byte for byte. Selectively extract
  it with the existing size boundary; don't inflate every ZIP member just to read
  one setting file.

Run relevant `export`, `pack`, `packed-plan`, `manufacturing-contracts`,
`mesh-export-validation` and `shell-orientation` suites, typecheck and build.
Inspect generated archive coordinates, names/counts and metadata using an
independent oracle where appropriate. Retain invalid-input rejection coverage.

For actual slicer acceptance, use
[slicing-with-bambu-cli](../slicing-with-bambu-cli/SKILL.md); for project-settings
read-back, use [debugging-bambu-3mf-import](../debugging-bambu-3mf-import/SKILL.md).
A structurally valid 3MF does not establish Bambu GUI preset behavior or printed
toolpath coverage. Do not assert Orca interoperability from Bambu-only testing.
