# Layout and assembly contracts

## Queue and shelf solving

`queueGeometry` includes front allowance, stop/post allowance, inter-can pitch
and the cascade chute. `minimumQueueLength` is its inverse. A cylinder centre's
height includes radius normal to the slope, not merely radius in Z. Preserve
the radius/tangent relationship and validate actual can clearance at endpoints.

`candidateLengths` tries the longest fitting lane, whole-bed sizes and whole-can
thresholds. Ranking prefers requested style, capacity, lowest height, then shortest
lane. `laneNeeds` must describe a shelf that solving actually accepts, at the
current depth and slope rather than a fixed reference length.

Print fit needs both X/Y orientations, real end-wall stems/posts, Z height,
margin and Gridfinity floor/skirt. A pair of dimensions each below the largest
bed axis can still fit neither orientation. `check` rejects geometric collisions
such as an ear on the pin below or opposing snap roots lacking a ligament.

## Roles and sources

- Flat tiers share top-role geometry; cascade distinguishes bottom, mid and top.
- Bottom cascade decks retain the full run and lip; upper decks reserve the chute.
- Mirrored deck sources are actual reflected printable geometry, not a viewer
  recoloring/rename. A shared mid role can require both hands at larger tier counts.
- Rear loading omits one eligible end wall. In a cascade, even top-tier parity has
  the chute at the back; stackability retains the wall closing a future tier's chute.
- `wallVariant` closes unused gang notches, removes terminal pins where appropriate,
  and closes the unused corner when there is no end wall. Verify both world ends.
- A split wall uses two hidden keys; two walls use four keys per lane/tier. A split
  cover adds two per lane. Compare production manifest quantities with an independent
  count for the chosen options; do not hard-code a historical global plate count.
- Gridfinity replaces only the shelf deck with `grid-deck`; feet add risers;
  rear-load suppresses the actual unused source. Demand-driven geometry should
  avoid allocating a discarded plain shelf deck or absent end wall.

## Useful variation matrix

Select cases relevant to the change, building on existing tests rather than a new
exhaustive combinatorial suite:

| Boundary | Cases |
|---|---|
| Queue | count threshold ±0.001 mm, 0°/nominal/10° slope, small/standard/large can |
| Tier parity | 1, 2, 3, 4 and a repeated mid role in both parities (5 or 6 tiers) |
| Row connections | lone lane, row interior and both ends; all side choices where affected |
| Tops/load | cover, uncovered terminal, stackable, rear-load eligible/ineligible |
| Manufacturing | whole and split, rectangular bed and its transpose, short Z, keep-out |
| Base | flat, feet, Gridfinity; floor aligned front/centre/back and left/centre/right |
| Scale | large counts with bounded viewer allocation and unchanged full quantities |

For a mating test, stand the catalogue mesh using `assemblyPlacements`, check
initial collision-free seating, then probe constrained withdrawal directions.
An overlap after moving a rigid part proves geometric obstruction only, not
insertion force, elastic snap recovery or printed load capacity.

## Physics versus a capacity model

For mixed-width ganging, establish per-lane can dimensions and cumulative lane
offsets rather than multiplying a single `gangPitch`. Check per-lane capacity and
headroom, and align connector X locations across unlike lane specifications;
equal shelf offsets alone do not make their tongues mate. Part identities must
include the dimensions/features that change a mesh so manifest/name-based
deduplication cannot accidentally share unlike geometry. This spans public
contracts and needs an agreed design before implementation.

The current queue models geometry and capacity, not transient can dynamics.
[OpenStax, rolling motion](https://openstax.org/books/university-physics-volume-1/pages/11-1-rolling-motion)
derives ideal rigid-body rolling under stated no-slip assumptions. It does not
establish a minimum reliable slope for filled cans on printed rails. Treat 3° as
the project's present design choice; real can rims, liquid motion, friction,
surface finish, impacts and chute transitions need physical trials before a new
feeding-performance claim. Source checked 2026-10-15.
