# Mixed-depth wall connection

The production candidate in `src/features/mixed-connection.ts` replaces the heavy
lower-frame experiment for mixed organizers. The old prototype and its evidence
remain unchanged. This candidate has geometry evidence; toolpath, physical fit,
creep, loaded strength and handling qualification remain open.

Facing bottom walls reserve whole lattice cells around a full-thickness band.
Blind diamond channels stay in the outer portion of each wall: radius 2.85 mm,
centre 1.2 mm inside the outer face, with at least 1.7 mm remaining inner material.
Mixed mode therefore requires a flat base and walls at least 5.75 mm thick. The
existing 3 mm gap remains; there is no added shelf height or width. No feature
protrudes beyond either inner wall face into the can path, including a can shifted
to either end of its available axial clearance.

Each wall chooses its band clear of its original seam keys and lower catches.
When neighboring heights differ, the spline steps within the gap. Its two heads
and every connecting stem stay connected by a 1.7 mm ligament. At fit +0.3 mm,
the head remains 0.422 mm larger than the channel mouth in its retaining direction;
this is geometric obstruction, not a measured bearing capacity.

The channel ends 18 mm before the shorter stack's rear. Identical spline segments
fill it from `14 + clearance` to `channelEnd - clearance`. Their count is
`ceil(totalLength / 40)` and all have equal lengths, with no internal clearance.
They print standing on their X end, at most 40 mm high, using the shared arithmetic
print-to-standing pose. The complete train has only the specified two end
clearances. A printed wall-plane spring gate blocks forward withdrawal, and a
closed blind channel end blocks backward withdrawal. The original wall catches
connect each wall to its deck.

Assemble the organizer outside the shelf. Align and assemble its bottom decks and
walls without cans or upper tiers. Feed the spline segments into each boundary
from the dispensing front, pushing the previous segments toward the blind rear
stop. The gate deflects as each segment passes and returns behind the final
segment. Check both gates have returned, then complete the normal upper-tier and
cover assembly. The gate slot is accessible at the empty dispensing front; repeated
disassembly is not a requirement. Move a loaded organizer with its bottom supported.

For the 480 / 360 / 300 mm three-stack example, solid-volume estimates are:

- Independent stacks: 4,625.21 g PETG.
- Added wall material: 132.27 g; spline material: 36.64 g.
- Total addition: 168.90 g (3.65%), compared with 1,332.10 g for the archived frame.
- First boundary: heights 21.5 / 34.1 mm, channel end 342 mm, nine segments
  covering 327.5 mm from 14.25 to 341.75 mm.
- Second boundary: heights 34.1 / 21.5 mm, channel end 282 mm, seven segments
  covering 267.5 mm from 14.25 to 281.75 mm.

These numbers use the real generated solids and the existing PETG density; they
are not slicer measurements. Focused tests cover fit -0.2 / 0 / +0.3, actual
seating, six translation directions, whole printable walls and spline validity,
zero unsupported faces, freed-gate clearance through 8.5 degrees, exact insertion
sweeps, original lower catch and seam material, segment packing, the 381 mm depth,
and unlike heights for 20 / 25 mm cans. The rotation is a geometric opening
approximation, not a prediction of elastic strain or insertion force.

## Integration and digital qualification

`src/mixed-geometry.ts` builds explicit mixed-manifest sources, including distinct
bottom-only wall identities for flat stacks. The worker builds and packs the whole
organizer before publishing its cache, and export requests must name that build.
A failed replacement build clears the previous export cache. Focused integration
checks decode 100 physical copies and 41 sources for the independent three-stack
flat fixture, check 108 physical copies for its cascade variant, and exercise real
worker boot ordering, failure recovery, source build IDs and exports.

The deliberate fit clearance permits angular play. In the actual complete bottom
subassemblies, the first geometric roll obstruction measured on a 0.25-degree grid
occurs at 0.75 / 0.75 degrees for fit -0.2, 3 / 3.25 degrees at fit 0, and
3 / 3.75 degrees at fit +0.3, depending on direction. Upper walls can obstruct
sooner. These are geometric barriers before the spline head can fit through the
mouth, not stiffness, insertion-force, zero-play, or loaded-strength measurements.
The new wall-only test initially assumed obstruction by two degrees at every fit;
the +0.3 case disproved that assumption. The test now compares the actual obstruction
with the head's required escape angle, and a separate test checks actual complete
bottom subassemblies with the production segmented splines.

Generate fresh actual front-window samples with:

```sh
bun prototypes/export-mixed-wall-spline.ts
```

The qualification file is
`.slice/mixed-wall-spline-1792198291182/wall-spline-samples.3mf`, SHA-256
`18ebf4a2de24c8b368fb229209b5e0af05dd219f59a4366c15999e6041dd4566`.
Its nine pieces cover fit -0.2, 0 and +0.3, with real front walls and one actual
production segment per fit. Its cut rear edges remain open; the sample does not
include the full rear stop or the complete spline train.

The faithful Bambu Studio slice is retained in
`.slice/wall-spline-samples-KyB4w0/`: zero process/result codes, no internal errors,
68.92 g, 8 h 33 m 30 s. G-code confirms 0.2 mm layers, 270 degrees C nozzle,
60 degrees C smooth PEI, one wall, 100% infill and supports disabled.
`toolpath-inspection.py` and `functional-sections.json` in that folder preserve
an approximate centreline-bead inspection with brim excluded. All three splines
have 182 deposition layers and a single connected bead region at 0.2, 18.2 and
36.2 mm. All six gate roots retain a 1.3 mm deposited first-layer section and
1.6 mm at 3.0 and 5.8 mm. This selected-section analysis is not full-volume
coverage or printed fit/strength qualification. No printer job was sent.
