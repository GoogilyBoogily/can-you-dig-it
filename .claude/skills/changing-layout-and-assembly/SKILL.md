---
name: changing-layout-and-assembly
description: Change can capacity, shelf-fit ranking, tier roles, rear loading, ganging, part identities or assembly poses in can-you-dig-it. Use for queue, layout, assembly and solver contracts, including mixed-size feature design.
---

# Change layout and assembly

Trace the affected behavior through `src/queue.ts`, `layout.ts`, `assembly.ts`,
`geometry.ts` (`solve`, `check`, `laneOf`) and `solver.ts`. The manifest is the
source of printable identities, quantities and standing placements. Read
[the contracts and validation cases](references/contracts.md) for detailed work.

## Keep the definitions shared

- Capacity, the shortest lane for a can count and preview positions use the same
  queue. Test just below and at the length threshold; preserve can clearance at
  the lip/end stop, normal offset from the sloping deck and ceiling headroom.
- `fitSpace` is pure arithmetic. Charge the shelf for actual base, finished cover
  or reserved top pins, outer gang tongues and lane/floor footprint. A part's
  standing dimensions are not its printable bed envelope.
- Left/right options are world sides. Alternate cascade tiers rotate 180°; their
  printable ganged decks must be reflected in Y before standing so internal
  tongue/socket pairs and selected outer connectors retain their world sides.
- Extend `PartSource` and manifest logic only as needed; do not reconstruct
  identities from filename suffixes in new consumers. Preserve one mesh per
  physically distinct source and exact quantities in previews, packing and 3MF.
- `rearTier`, stackability, terminal/closed/open wall variants and cover loading
  window must agree. Omit unused parts through the manifest rather than hide a
  required printable object only in the viewer.
- Keep preview sampling confined to display. The lazy can iterator and
  `PREVIEW_INSTANCE_LIMIT` bound allocation without reducing capacity/exports.

## Demonstrate the contract

Inspect/run `solver`, `assembly-contracts`, `cascade-gang-assembly`, `parts`,
`bed-orientation`, `rear`, `stackable`, `front` and any affected geometry suites
under `test/`. Construct actual meshes with production placements for collision
and retention checks. Include repeated mid roles in both parities; two tiers
alone cannot exercise that case.

Use [changing-geometry](../changing-geometry/SKILL.md) if solids or references
change; use [changing-browser-ui](../changing-browser-ui/SKILL.md) when exposing
new options or altering worker/display contracts. Existing fixture/count changes
need the project's normal approval and an independent quantity derivation.
