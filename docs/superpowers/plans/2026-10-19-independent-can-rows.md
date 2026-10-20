# Independent can rows — staged implementation plan

## Primary goal

Audit correction amendment, 2026-10-20: the five findings from the fresh native
and actual Opus audit are fixed. Compact-gap key allocation now uses the unchanged
final slot/flare guard's envelope; all 12 depth/fit cases have production regression
coverage and 1,296 passing both-axis toolpath probes. A complete corrected 240 mm
repeat slices as 42 copies on 11 plates. Mode round trips retain sharing, malformed
flags preserve valid requests until explicit correction, repeated-row diagnostics
name physical Levels and editor Rows, and assembly steps follow actual connections.
The full unit gate passes 1,704 tests and the final browser gate passes 125,
both with zero failures. Typecheck/build pass and the actual Opus closure review
finds no actionable issues in the three follow-up recovery/guidance corrections.
Exact logs, source provenance and review limits are in the qualification record.

Let users place different numbers and sizes of lanes on independently configured
horizontal rows, including two wide lanes below three narrow lanes, with every
upper row supported by real printable parts. Vertical repetition remains optional.

Status amended 2026-10-19: the user approved **Custom rows** and the carrier/shoe
architecture, including its necessary public row contracts. Implementation follows
the gates below; the one-span specimen does not qualify arbitrary supports or
permit exports whose complete support plan fails.

Authoritative proposed behavior and schema:
[independent-row design](../specs/2026-10-19-independent-can-rows.md).
Preserve uniform and mixed-column behavior, including mixed v2/v3/v4 links.
Do not expand this work into a replacement solver, generic scene framework or a
physical load-rating claim.

Implementation amendment, 2026-10-19: phases 0–4 are implemented with actual
whole-row geometry, explicit manifests, strict v5 links and browser controls.
The corrected 8.1 mm carrier plus 6 mm shoe adds 14.1 mm per transition. Actual
Opus findings added fail-loud key-host ligament and bearing-envelope guards;
new rows inherit the existing depth. Final-source shoes pass 624 probes and
carrier/receiver coupons pass 2,400 probes across three fits and both packed axes.
The complete nominal 112-piece/24-plate export also slices successfully. Phase 5's
full regression results and outstanding physical trials are tracked in the
[qualification record](../specs/2026-10-19-independent-can-rows-qualification.md).

## Phase 0: Documentation discovery and adversarial review

**How this serves the primary goal:** distinguish an independently editable row
from a vertical column and identify the supports that shifting dividers remove.

What to do:

- Read current `CLAUDE.md`, `docs/open-questions.md`, the row design above and the
  latest shared-wall/multi-seam amendments. September mixed-width notes are
  historical; do not use their unconnected-gang model as the current contract.
- Trace `MixedStackRequest` → `resolveMixedBuild` → `laneOf` → component manifest →
  `buildMixedGeometry` → worker packing → actual export copies. Confirm that the
  current model has per-column tiers, not independently configured horizontal rows.
- Keep three column-mode cases distinct: Fixed 1 plus cascade is a setting
  conflict; cascade at 279.4 mm has no shared schedule under the currently
  qualified rules, leaving the justified 462.5 mm retained width too large for
  457.2 mm; flat Fixed 1 at that depth has a safe schedule that the original greedy
  candidate family missed. The separately authorized bounded fallback corrects
  that false negative without relaxing joint rules. Expose genuine retained
  reasons before fit errors hide them, retain separate regressions for both
  feeding styles, and do not credit these fixes as an independent-row feature.
- Require adversarial reports on mechanical support, geometry/assembly, schema
  migration and user interaction. Each report names sources/signatures, concrete
  counterexamples, reusable patterns, confidence and missing evidence. Reconcile
  all material findings into the design before asking for concrete approval.

Existing APIs allowed for investigation, not invented future signatures:

```ts
solve(options: Options, minimumWallHeight?: number): Derived
resolveMixedBuild(space: Space, request: MixedBuildRequest): MixedLayout
laneOf(options: Options, derived: Derived, role: LaneRole): Lane
mixedPartManifest(layout: MixedLayout): MixedPartDescriptor[]
mixedAssemblyPlacements(layout: MixedLayout): Generator<AssemblyPlacement>
buildMixedGeometry(geometry: Geo, layout: MixedLayout): MixedPrintablePart[]
pinJoint(geometry: Geo, specification: { wall: number; clearance: number })
earJoint(geometry: Geo, specification: {
  wall: number; through: number; clearance: number
})
endWallSnap(geometry: Geo, specification: {
  height: number; wall: number; clearance: number
})
```

References: `src/model.ts:149–211`; `src/solver.ts:44–107`;
`src/geometry.ts:300–348,369–463,659–718`;
`src/features/joints.ts:89–171,271–286`;
`src/shared-walls.ts:42–68,224–255`;
`test/shared-wall-production.test.ts:39–92,112–130`.

Verify: every claimed joint exists and its actual receiving solid is read; every
source and assumption is linked; current compatibility/fallback behavior agrees
with the tests. Do not change a test or loosen a planner to obtain a convenient
shared boundary. Discovery alone is not a new-geometry verification result.

## Phase 1: Production-derived carrier/shoe prototype

**How this serves the primary goal:** establish an actual load path between rows
whose dividers do not align before presenting that arrangement as generatable.

What to implement, in isolated prototype files only:

- Copy the production pin/receiving pair, blind-cover chamber and end-wall snap
  pieces. Build a carrier with lower-wall bearing and blind catches plus a
  separate shoe printed on its side. The shoe carries upper-wall compression on
  solid shoulders and uses independent retention to the carrier and upper wall.
- Investigate the concrete 8 mm carrier / 6 mm shoe candidate. The initial
  one-span specimen places lower supports at Y=0/200 mm, an upper wall/shoe at
  Y=80 mm, a production wall-top pin at X=-75 mm, and two separated downward shoe
  snaps at X=-102/-35 mm. Carrier plank X=[-120,-10], Y=[-12,212]. These are a
  reproducible coupon, not production defaults or an arbitrary-row guarantee.
- Include actual lower/upper wall roots and deck-ear surroundings. Verify the
  proposed assembly sequence: lower walls → carrier → shoe → upper deck/walls,
  including the stage at which each snap must flex and operator access.
- Preserve the existing K.cl+fit pair throughout. Check the root material around
  both shoe retainers and the upper pin, including the 6 mm body's finite margin.
  If ordinary pins are used, do not claim the raised shared crest was tested.
- Retain generated evidence and source hashes. Generate fresh toolpaths after
  dimensions freeze; inspect functional hooks/roots/roofs on first and upper
  layers in both packing orientations using the existing deposition tooling.

References: `src/features/joints.ts:89–130,203–245,271–286`;
`src/features/shared-wall.ts:14–57`; `src/geometry.ts:659–718`;
`src/features/pose.ts:7–36`; `test/mixed-connection.test.ts:38–125`;
`prototypes/shared-wall-mechanics.md` and its v2 amendment for evidence discipline;
`.agents/skills/qualifying-printed-joints/SKILL.md`.

Verify: NoError, one connected component per print, minimum print Z=0, no forbidden
unsupported faces, actual seating/bearing, rigid insertion clearance with only
specified snap flexure, required translation/peel/roll obstruction, and intact
minimum roots/ligaments at fit -0.2/0/+0.3. Record exactly which cases remain open.

Historical one-span progress: the isolated result is recorded at
`.slice/grid-row-transfer-1792456545015/geometry.json` with the source hashes and
fresh `grid-row-transfer-coupon.3mf`. Three fits produce 18 connected support-free
solids on three plates, actual positive contact and upward obstruction. Negative
controls detect a 2 mm low lower wall, an outside-span shoe and the inadequate
root floor of a 4 mm shoe. The actual passing candidate uses a 6 mm shoe.
This covers static seating and sampled vertical obstruction only; full insertion,
peel/roll, tiled/whole rows and slicing remain pending. See the spec for exact
measurements and limits.

Complete geometry progress (2026-10-19): the production candidate uses an
8.1 mm carrier plus a 6 mm shoe, preserving the blind-socket roof at fit +0.3.
`prototypes/qualify-grid-row-transfer.ts` generates fresh complete two-to-three
projects and compares all transition parts with production geometry. The
pre-crest record `.slice/grid-row-transfer-complete-1792458540269/` includes
actual compact upper connection channels/splines: 112 pieces, 24 plates per fit.
The bounded geometry suite also covers compact lower two-lane repeats, aligned
and shifted singleton rows, and 5.75 mm walls. Compact carrier seams meet between
paired lower walls; each neighboring panel owns its own full caught supports.
Keys retain and locate the panels; direct wall bearing carries compression.

Initial toolpath gate failed: ordinary shoe upper hooks missed 32 of 624
functional probes at fits -0.2 and 0, first layer, both orientations. The other
592 probes passed. Preserve `.slice/row-shoe-toolpath-initial-20261019/toolpaths.json`
and `.slice/production-shoes-tLXCNf`. The corrected shoe uses the existing
`sharedWallPinJoint` finite crest and an incoming upper-wall bottom receiver
derived from the same joint. Top wall pins, finished covers, lower snaps,
free roots, six-millimetre shoe body and 14.1 mm pitch stay unchanged. The raised
0.6 mm tip is internal to the upper wall, with planner print bounds updated.
Corrected actual-part geometry passes 19 tests / 99,036 assertions at all three
fits; re-run the unchanged toolpath probes/thresholds on fresh exports before
claiming this mechanism digitally qualified. Physical trials remain separate.
The corrected complete export record is
`.slice/grid-row-transfer-complete-1792459182120/`: all three fits pass geometry
and packing, with unchanged overall height and all 112 pieces included. It has
not been sliced or printed by the geometry runner.

Anti-pattern guards: a posed upper row is not support; a through T/key is not a
vertical bearing; plain pegs do not prove retention; upright platform-grown snap
pins violate the current printed-plane flexure design. A one-span coupon does
not prove tile joints or whole rows. A failing mechanism is redesigned at this
phase, not hidden by omitting a support or relaxing a probe.

Approval gate passed: the user approved the carrier/shoe design and public row
contracts on 2026-10-19. Applicable complete-geometry gates remain mandatory before
exporting a supported arrangement. Physical strength remains a printed trial.

## Phase 2: Gated complete geometry and support topology

**How this serves the primary goal:** prove the entire two-wide/three-narrow
arrangement, including every seam and support, before generalizing the resolver.

What to implement after the applicable approval:

- Extend the isolated candidate to the exact two-wide-to-three-narrow assembly,
  using real production lane decks/walls/end walls/lips. Keep all row-specific can
  sizes and deck profiles intact. Start with the declared common-depth envelope.
- Include the user's two axial-157 mm lower lanes below three axial-122.5 mm upper
  lanes at D66/depth279.4. The lower row's compact width is 348 mm and the upper's
  is 420 mm. An explicit 420 mm lower row span creates a visible 75 mm central gap
  and support spans 166.5/81/166.5 mm, with actual outer supports at the upper
  row's edges. Prove those carrier spans and gaps; do not reject only from compact
  widths or stretch the old 3 mm connection spline across the new gap.
- Represent carrier tiles and independently supported X bays. Tile seams follow
  lower support lines, not upper dividers. Measure actual lower-wall contact
  patches and upper shoe footprint containment; support must survive wall/pin
  reliefs, cross-laps and printable section frames.
- Exercise a shifted upper wall over a tile interior, directly over a lower wall,
  at a panel seam, and over a lower blind socket. Provide a proven attachment or
  reject the unsupported case. No center-point-only or bounding-box support test.
- Add actual height-padded row walls/end posts where different lane minima share
  one row plane. Recompute pattern keep-outs and print envelopes from that host
  plan; do not overwrite `Derived.H` after dependent values have been calculated.
- Prove within-row shared-divider support separately, including raised crest
  chambers, carrier catch ownership and upper shared shoes. A mechanically
  unsupported sharing request retains separate walls with a concrete reason and
  the corresponding true width, or fails the complete row if width cannot fit.
- Prove singleton rows and repeated rows. A singleton has two real wall lines;
  one lower lane does not automatically support an arbitrarily wider upper row.
  Direct stacking of an identical repeated arrangement is permitted only after
  verifying every reused ear/pin/bearing/corner interface.

References: row spec's support topology; `src/shared-wall-geometry.ts:39–162`;
`src/geometry.ts:551–613,695–767`; `test/shared-wall-production.test.ts:39–130`;
`test/mixed-geometry.test.ts:55–85,218–235`;
`docs/superpowers/specs/2026-10-17-multiple-seams-design.md`.

Verify: full assembled static collisions; positive projected contact for every
load-bearing interface; actual stored cans at both axial extremes; front
dispensing, loading and insertion sweeps; all fits; minimum/narrowest supported
panel; widest intended span; X/Y tile seams; rectangular and small beds; keep-outs;
zero/nominal/maximum supported slopes; padded row heights; top covered/uncovered;
rear loading; and asymmetric/full/one-sided geometric load cases. Check actual
Float32 meshes pack before offering an envelope as supported.

Anti-pattern guards: no floating tile edge, unprinted post, doubled lower cover,
unqualified overhang or partial export. Unsupported user inputs remain intact
and receive a named transition error. Geometry still does not establish creep or
numeric load capacity.

## Phase 3: Pure row requests, resolution and physical identities

**How this serves the primary goal:** make shelf fit, capacities and manufacturing
parts describe the same independent-row arrangement.

What to implement after the geometry envelope is grounded:

- Add only the agreed schema from the design: `IndependentLaneRequest`,
  `IndependentRowRequest`, `IndependentRowsSharedOptions`,
  `IndependentRowsBuildRequest` and resolved row/transition records. Rows are
  bottom-up, lanes right-to-left internally; `repeat: 1` is normal. Do not change
  existing public signatures or old `MixedStackRequest` semantics in passing.
- Make `rowSpan` explicit: auto packs; a larger numeric span spreads complete lane
  modules with visible equal empty gaps in the initial envelope. Resolve physical
  gaps before deciding whether a boundary can share. A wide declared singleton
  span creates no extra supports. Every separated row module needs real carrier
  ties; a spread top row without them is unsupported.
- Add a pure row resolver in the existing solver ownership. Read all requested
  lanes first; compute natural minima, explicit row heights/padding, within-row
  boundary decisions, supported carrier/docking plans, origins and final footprint
  in that order. Validate actual panel envelopes before advertising a fit.
- Reuse `queueGeometry` for capacities and can positions. Never add rows/cans
  automatically, shorten depths or force can-size alignment. Repetition expands
  an exact count; a numeric height below a real lane minimum fails loudly.
- Validate singleton rows independently of the old mixed two-column minimum.
  Reject malformed/nonfinite values, invalid repeats and unsupported transitions
  with row/lane identity. Preserve phase-one unsupported dimensions for editing.
- Copy the existing single component iterator pattern to emit row sources,
  carrier/shoe sources, exact quantities and standing placements. Explicit source
  identity includes all effective row height, side schedules, interface variants
  and printable sections; repeated identical physical sources may reuse one mesh.

References: `src/solver.ts:44–107`; `src/queue.ts:15–39`;
`src/validate.ts:29–41,57–95`; `src/assembly.ts:34–113,140–260`;
`src/mixed-geometry.ts:14–60`; row spec's schema and placement sections.

Verify: exact count/capacity/origin/footprint derivations independent of generated
snapshots; height/width/depth threshold ±0.001 mm; one/multiple/repeated rows;
one/two/three lanes; explicit left/centre/right alignment; reorder rows/lanes;
mixed natural heights with visible padding; invalid support → no build; sharing
fallback → recomputed width; unchanged legacy request results. Independently
compare manifest quantities with standing instances and printable meshes.

Anti-pattern guards: no viewer-owned geometry decisions, filename identity parsing,
dummy singleton neighbor, silent catch fallback, wholesale solver replacement or
unapproved abstraction/dependency. Existing assertions remain intact unless the
user separately approves a demonstrated obsolete contract.

## Phase 4: Row editor, v5 links, worker and export integration

**How this serves the primary goal:** let users specify, review, share and print
the supported independent-row arrangement without losing existing designs.

What to implement:

- Add the separate row mode and editor. Display the highest row first and cells
  left-to-right while labeling Row 1 as bottom. Provide add/remove/duplicate,
  move-higher/lower, move-left/right, per-lane dimensions/depth/slope/headroom,
  explicit repeat and row height. Show resolved row height, every cell's added
  headroom, row span and actual empty gaps, carrier height/material and precise
  unsupported-transition reasons. A larger row span must not enlarge can cells.
- Keep independent cells free of `tiers`/cascade controls. Preserve old column
  mode's repeated same-size stack behavior. Do not populate extra rows/cans from
  shelf capacity or silently convert a column design when switching modes.
- Add `v=5&mode=rows&rows=<JSON>` with one explicit on/off value for sharing and
  top cover. Serialize canonical order; restore editor order correctly. Keep old
  uniform and mixed v2/v3/v4 reads and writes unchanged. Preserve malformed or
  unsupported incoming designs as actionable errors, not defaults that overwrite
  the user's link.
- Extend the worker's request union with the agreed row layout, then reuse its
  existing arena, connected-part checks, estimate, packing and build-bound export
  path. Update viewer placement/can iterators from the same manifest and preserve
  one global preview instance limit across all rows and carrier parts.
- Publish/cache only the complete packed build. A failed replacement clears export
  eligibility. Export every physical carrier, shoe, key and lane source exactly as
  the manufacturing manifest requires; do not export a successful subset.

References: `src/main.ts:1133–1207` and current hash/navigation tests;
`src/worker.ts:8–22,32–95`; `src/assembly.ts:230–260`;
`test/mixed-worker.test.ts`; `test-ui/mixed-generation.ui.test.ts`;
`.agents/skills/changing-browser-ui/SKILL.md`;
`.agents/skills/exporting-printable-models/SKILL.md`.

Verify: top/bottom and left/right order round trips; explicit singletons/repeats;
old-link backward compatibility; invalid v5 schema/duplicate flags; browser back
and forward; profile/bed/keep-out refit; stale response/export rejection; corrected
inputs recover without dropping rows. Decode 3MF object/build/plate references
and STL inventory to match independently counted physical sources/copies.

Anti-pattern guards: no enabling export for a rendered-only layout, hidden height
padding, inherited cascade conflict in row mode, ignored invalid fields, stale
successful build export, or alternate viewer-only row offset model.

## Phase 5: Complete verification and printed-trial handoff

**How this serves the primary goal:** demonstrate the promised arrangement is the
same supported, printable organizer in the editor, geometry and exported files.

What to complete:

- Read the final design against actual code; amend it around the final approved
  mechanism and supported envelope. Retain rejected mechanisms/evidence as dated
  history where they explain a real constraint.
- Run targeted mechanism/row/serialization/worker/browser cases, then the required
  project commands: `bun run check`, `bun test test/`, `bun run build`, and
  `bun test test-ui/ --timeout 120000`. Record real pass/fail counts and logs.
  Diagnose unexpected failures against baseline; do not label them flaky or relax
  assertions to finish. Regenerate geometry references only after justified change
  approval and an independently explained diff.
- Slice fresh complete two-to-three row exports, carrier tiles, all shoe variants
  and the production-derived coupon with P2S / 0.4 mm / 0.2 mm Standard / PETG
  Translucent / Smooth PEI. Verify success codes and absence of internal
  diagnostics, then inspect actual deposition at every new functional junction
  across both packed orientations and all supported fit endpoints.
- Deliver an assembly/printed-trial protocol for the actual generated parts.
  Separate hand fit, full and one-sided loading, agreed dwell, residual set and
  bottom-supported handling from geometry and toolpath claims. No printer job,
  load rating or cover-lifting claim is authorized by generation/slicing.

References: `.agents/skills/maintaining-can-you-dig-it/references/verification.md`;
`.agents/skills/changing-geometry/SKILL.md`;
`.agents/skills/qualifying-printed-joints/references/print-protocol.md`;
`.agents/skills/slicing-with-bambu-cli/SKILL.md`; final evidence source hashes.

Verify: all approved behaviors have explicit evidence; unsupported arrangements
keep their entered data and a clear nonexportable error; old modes remain valid;
all real supports appear in the manifest and files; every claimed toolpath result
has its actual artifact. Search specifically for row-instance offsets outside the
shared assembly owner, filename-based source inference and hard-coded proposed
coupon dimensions in production planners.

Open after digital delivery: physical fit, sustained load/creep and broader
variable-depth/overhanging arrangements until the applicable trials/designs exist.
