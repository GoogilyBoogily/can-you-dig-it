# Multiple printable sections

The assembled depth belongs to the shelf. The printer constrains each printable
section, including its joints, rather than shortening the requested organizer.

## Shared plan

Extend the existing derived dimensions with seam coordinates and wall-pin
positions. Geometry, manifest identities, assembly placements and export quantities
consume that one plan. Preserve existing whole/front/rear identities and the center
seam for valid one- and two-section designs. Additional sections have explicit
zero-based source indices and human-facing numbered names.

Choose a bed orientation that accommodates the full transverse envelope. Prefer
the fewest sections. Include the deck tongue in the longitudinal allowance and
include the actual Gridfinity floor in the footprint. Additional seams are symmetric
about the lane center so reversing cascade tiers preserves pin/catch alignment.
The end sections can be longer than the interior sections to protect the chute,
loading window, end ears and existing end pins. If those protected regions cannot
fit, reject the design explicitly instead of cutting through a functional feature.

## Structure

- Reuse the production T joint at every deck seam. Preserve its full sloping
  thickness and solid supporting tie band on both sides of each socket/root.
- Reuse two concealed keys per wall seam and two per cover seam, with the same
  shared fit and protected full-thickness frames used today.
- Keep every new section seated on deck ears: add ears on both sides of additional
  seams, keeping their notches/roots clear of the seam frame and other catches.
- Add a wall-top pin/catch position to each interior section. Keep the plan
  symmetric so the wall above, including reversed cascade tiers, and the cover
  receive every pin. Preserve end-pin positions.
- Require sufficient section length for both supporting ears and an interior
  retaining pin. Never create a small unsupported intermediate strip.
- Protect the cover loading window and the cascade deck start. Keep lattice cuts,
  recessed webs, gang joints and magnet pockets clear of every new seam.
- A magnet pocket and its supporting rim must remain owned by one complete section
  according to the actual T profile and clearance, not just its center coordinate.

## Verification

Keep existing regression assertions unless their contract specifically assumes the
retired two-section cap. Replace those obsolete expectations only with approval,
retaining genuine shelf/width/height/structural rejection and recovery coverage.

Add independent multi-section checks for exact assembled depth; bed orientation;
valid, connected, support-free prints; deck material conservation with only the
specified joint clearance removed; solid tongue roots and socket shoulders;
key-channel containment and retention; all supporting ears/catches; seated and
reversed-tier mating; Gridfinity pocket ownership; manifest and placed-copy counts;
and serialized STL/3MF manufacturing boundaries. Include fits -0.2, 0 and +0.3,
both designs, representative patterns, covers/rear loading/ganging, and three or
more sections. Run typecheck, complete unit and browser suites, and build.

Generate a fresh production-joint coupon and retain a complete multi-section lane
artifact and physical trial instructions. Slice representative new parts with the
installed Bambu CLI if available. Geometry and toolpaths establish digital evidence
only: physical fit, creep and loaded strength require printed trials with the
actual PETG/process. Continue bottom-supported handling; no cover-lifting or numeric
load rating is established by this work.
