# Mesh, packing and format contracts

## Topology and precision

`inspectMesh(..., true)` checks every indexed edge is paired in opposite
directions and the material has positive finite volume. Multiple closed shells
also need correct orientation by nesting depth: exterior out, cavity in, island
inside a cavity out again. Positive total volume alone misses an inverted small
shell. The containment algorithm assumes non-intersecting surfaces; it is not a
general self-intersection proof or a printability proof.

Zero-area kernel faces are reported and retained to preserve topology. A test
fixture for manufacturing must be a valid closed solid; use `solidFixture` or a
kernel box. An open triangle is useful only for rejection or low-level facet
tests. Serialized degeneracy and winding should be measured from written
coordinates using independent arithmetic, as in `mesh-export-validation`.

3MF serialization rotates/translates from Float32 sources into Float64 arithmetic
and emits full numeric values. Compatibility `pack()` bakes into Float32 arrays;
use plan serialization when evaluating its higher-precision path. Do not claim
source precision beyond the original vertex buffers. Near-origin volume
arithmetic avoids cancellation for far-away plate origins.

## Packing

`packPlan` stores unique geometry and per-copy placements. Shelf packing tries all
already-open plates and both orientations; shelf depth is fixed when opened.
It evaluates keep-out frames, then centers only where validity remains. A frame
flip changes placement locations, not vertex winding or the physical part's hand.

Validate counts, no same-plate overlap, actual transformed boxes, bed margin,
Z=0 seating, build height and exclusions. `keepOutFromConfig` currently takes a
polygon's bounding box; it is conservative for other shapes, and complex printer
regions may warrant an explicitly designed polygon representation. Brims/supports
are not accounted for by the current packer. Do not silently narrow margins or
introduce reflections to gain a plate.

Plate origins step +X across `ceil(sqrt(n))` columns and −Y between rows with
1.2×bed stride. Internal plates are zero-based; Bambu `plater_id` is one-based.
`threeMf` validates local build volume before adding the plate-grid origin.
Each serialized object is assigned to its actual plate in model metadata.

## Primary references

Checked 2026-10-15:

- [3MF Core Specification, v1.4.0 document](https://github.com/3MFConsortium/spec_core/blob/master/3MF%20Core%20Specification.md):
  packaging, units, resources/build items, indexed manifold-edge requirements,
  face orientation and affine transforms. This is a rolling branch whose document
  version must be rechecked. Standard transforms and Bambu private metadata are
  separate contracts. This app currently bakes object coordinates rather than
  using the Production extension for shared instances.
- [3MF specification catalogue](https://3mf.io/spec/): consult an extension's own
  compatibility requirements before adding it. An extension's existence does not
  prove the target slicer consumes it.
- [Manifold Mesh API](https://manifoldcad.org/docs/jsapi/classes/manifold.Mesh.html):
  kernel property vertices and merge vectors; use the installed typings.
- [fflate author documentation](https://github.com/101arrowz/fflate): filtered
  extraction and ZIP APIs. Keep the project's pre-inflation size check and byte
  preservation tests at the boundary.
- [Bambu PartPlate.cpp at v02.08.02.61](https://github.com/bambulab/BambuStudio/blob/v02.08.02.61/src/slic3r/GUI/PartPlate.cpp)
  and [PartPlate.hpp](https://github.com/bambulab/BambuStudio/blob/v02.08.02.61/src/slic3r/GUI/PartPlate.hpp):
  `compute_origin` / `compute_colum_count`, the implementation governing Bambu's
  plate grid. Recheck the tag when qualifying another slicer version.

Mesh validity, consumer import, slicer deposition and physical strength are
distinct evidence levels; report which were actually established.
