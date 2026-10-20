# Independent can rows

## Primary goal

Arrange horizontal rows independently: for example, two wide lanes below three
narrow lanes, without requiring the same can or divider positions above every
lower lane. Repeating a row vertically is optional and explicit.

Status amended 2026-10-19: the user approved **Custom rows** and the carrier/shoe
architecture, including the new public row contracts necessary for that mode.
Production implementation now includes the editor, strict v5 links, resolver,
actual carrier/shoe meshes, shared assembly manifest, preview and exports. Unproved support
arrangements must still fail explicitly rather than export floating geometry.
The complete two-wide/three-narrow arrangement and bounded repeat/singleton
variants now have passing geometry checks. Initial shoe hook toolpaths failed;
the corrected crest/receiver pair passes all 624 unchanged shoe probes across
both packed axes and three fits. Carrier/receiver slicing also passes 2,400 probes;
full regression results are tracked in the
[qualification record](2026-10-19-independent-can-rows-qualification.md).
Printed behavior remains
unqualified. An assembled render alone is not evidence of support or retention.

Implementation sequence: [independent-row plan](../plans/2026-10-19-independent-can-rows.md).

## Current behavior and the reported link

The existing mixed request is an ordered array of vertical **columns**. One
`MixedStackRequest` owns a can size, depth, tier count and feeding controls for its
entire height. Neither `MixedBuildRequest` nor `ResolvedMixedStack` can describe a
different number of lanes on the next horizontal row (`src/model.ts`,
`MixedStackRequest` and `MixedBuildRequest`). Shifting preview instances would
leave upper walls and decks without the supports they use today.

Separate problems were reproduced in the reported 457.2 mm wide,
279.4 mm deep, 241 mm high design, containing D66 columns with axial can lengths
122.5 / 122.5 / 157 mm:

- A column set to Fixed 1 with inherited cascade enabled is rejected because
  `resolveMixedBuild` requires at least two cascade tiers. This is a column-mode
  setting conflict, not evidence that one independent horizontal row cannot fit.
- With cascade enabled at depth 279.4 mm, the split has no shared bearing/catch
  schedule under the currently qualified joint rules. Retaining both walls is
  justified; the complete retained design requires 462.5 mm including side
  clearance, exceeding 457.2 mm. Preserve the concrete retained reason and expose
  it before the width failure hides it. Do not weaken the joint constraints.
- With flat feeding and Fixed 1, a safe schedule does exist at 279.4 mm. The
  planner's greedy candidate family initially missed it: this is a false negative,
  not mechanical infeasibility. A bounded fallback using the same qualified
  bearing/root rules now finds that plan. Fixed 1 disables inapplicable auto-feed
  in the editor, and retained-wall width errors include the actual reason. Do not apply the cascade
  rejection or its 462.5 mm retained-width explanation to this flat case after
  that correction. Keep both cases as distinct regression examples.

Those column-mode corrections are separate authorized work. They do not implement
independent rows or qualify a carrier.

## Product model and ordering

Add a distinct **Independent rows** mode. Preserve uniform mode and existing
mixed-column mode, including old links and their cascade behavior.

The approved request contracts below are defined in `src/model.ts` and used by
the row resolver, support geometry and application flow:

```ts
interface IndependentLaneRequest {
  canDiameter: number;
  canHeight: number; // existing name: axial can length, not diameter
  depth: number;
  slope: number;
  lipGap: number;
}

interface IndependentRowRequest {
  lanes: IndependentLaneRequest[];
  repeat: number; // positive integer; editor default is 1
  rowHeight: number | "auto";
  rowSpan: number | "auto";
  alignment: "left" | "centre" | "right";
  rearLoad: boolean;
}

type IndependentRowsSharedOptions = Pick<Options,
  "wall" | "clearance" | "fit" | "hexR" | "hexAuto" | "solid" |
  "design" | "pattern" | "bed" | "bedMargin" | "bedKeepOut"
> & { base: "flat" };

interface IndependentRowsBuildRequest {
  shared: IndependentRowsSharedOptions;
  rows: IndependentRowRequest[];
  shareCompatibleWalls: boolean;
  topCover: boolean;
}
```

Rows serialize **bottom to top**: Row 1 is the bottom row. Lanes serialize
**right to left**, preserving the existing +Y coordinate convention internally.
The editor displays upper rows above lower rows and cells left to right. Label
Row 1 as the bottom row; moving a row higher/lower changes its actual elevation
and is not merely reordering a form list. Reordering lanes changes their actual
left/right arrangement. Stable editor identifiers must not become geometry keys.

Each lane directly edits its can dimensions, depth, slope and lip headroom. There
is no per-cell `tiers`, `cascade` or automatic vertical fill. Every row feeds its
own cans; different can sizes do not cascade into one another. `repeat: 1` is the
normal case. Repeating a row expands precisely that row's requested arrangement;
it does not create extra rows merely because space remains. No requested lane,
can size or depth is removed or resized to make a layout fit.

One row and one lane are valid. Do not run singleton rows through
`mixedStacksFrom`, whose existing two-to-eight-column rule belongs to the old
model. Reuse the standalone lane builders for the singleton case. Overall count
limits need named validation and bounded preview allocation, not dummy neighbors.

## Row height and placement

Each structural row has one declared wall-top plane. Resolve every lane's natural
minimum height using the current queue, slope and front-dispensing rules.
`rowHeight: "auto"` chooses the largest actual lane minimum in that row. A numeric
row height below that minimum is an error; a larger value is explicit additional
headroom. Always display the resulting row height and each lane's added headroom.

This changes the row enclosure, not the can, slope, queue capacity, deck profile or
lip position. Do not silently rewrite `canDiameter`, `canHeight`, `depth` or
`lipGap`, or treat the enlarged enclosure as a reason to add another can/row.
Use the explicit resolved values `ResolvedIndependentRow.height` and
`ResolvedIndependentLane.heightPadding` from `src/rows.ts`.

Height padding affects real wall/end-post heights, pin elevations, pattern fields,
cross-laps and printable envelopes. Changing only `Derived.H` after `solve()` is
insufficient: automatic lattice sizing, section planning and print fit were
derived from the old geometry. The approved `solve(options, minimumWallHeight)`
extension applies the minimum before lattice and section derivation. The row
resolver and builder must agree on that host plan and verify actual emitted bounds.

Fronts align at world X=0. Horizontal placement follows each row's declared
alignment within the carrier's supported width; a changed lane width must not
silently move another row. `rowSpan: "auto"` uses the compact physical width.
A numeric larger span can spread two or more lane modules apart, distributing
the additional empty space equally between them. Always show the real gap between
modules; it is not additional can clearance or a wider can compartment.

Resolve an explicit spread span against complete retained lane widths first:
`gap = (rowSpan - sum(lane.OW)) / (laneCount - 1)`. In the first spreading envelope,
require that gap to be at least the ordinary 3 mm spacing. Smaller spans need an
explicit proven collapsed-boundary plan, not a fractional/negative empty gap.
For compact auto rows, existing eligible collapsed shared boundaries remain
possible. A separated boundary cannot share a divider; retain it visibly and
charge both walls. Do not stretch the existing fixed-3-mm spline across a new gap.
The carrier must provide the real tie between separated modules.

A single lane with a larger declared span has empty margins, not extra wall
supports. Similarly, a spread top row without a carrier above still needs real
horizontal ties; a declared span alone is not a connected frame. Preserve an
unsupported alignment/span and explain which physical support is missing.

For a transition from row r to r+1:

```text
next row base = current row base + current wall height
                + carrier thickness + docking-shoe bearing height
```

The finished top cover is charged once at the very top. A transition carrier
replaces the lower row's ordinary cover; it is not added on top of a cover that
still exists in the manifest. Lower pins enter the carrier's actual blind
chambers. Upper pins enter the next row's actual receiving chambers and are not
charged again as empty clearance above the next row. Account separately for the
existing shared divider's raised crest when that exact interface is used.

Identical repeated rows can reuse direct wall-on-wall support only when their
resolved wall lines, bearings, pins and loading interfaces actually align. That
optimization has a separate proof gate; until then retain the explicit transition
height/material or report that repetition is unsupported. No invisible spacer or
unprinted support is allowed.

## Mechanical architecture

The smallest proposed addition is a **carrier shelf plus retained docking shoes**
between arrangements whose divider lines change. Keep production lane decks,
lips, side walls, end-wall snaps and eligible within-row shared dividers wherever
their actual interfaces remain valid.

```text
upper cans → upper decks → upper walls → shoe bearing shoulders
           → carrier shelf → lower wall bearing faces → lower row/base
```

Upper-row load must cross the lower lane openings through real printed carrier
material. A current patterned cover is a caught skin, not an established beam.
Using its underside chamber geometry does not transfer a strength qualification.
Neither a through T socket nor a concealed seam key supplies the missing vertical
bearing merely because it locates two parts in X/Y.

The implemented candidate has an 8.1 mm carrier and a 6 mm tall, side-printed
shoe, adding 14.1 mm between rows. The carrier thickness preserves the blind
chamber roof skin at fit +0.3. The shoe bears on the carrier and carries the
existing finite-crest pin into a matching bottom receiver in the upper wall.
The crest adds 0.6 mm inside the upper wall without changing overall row height.
The upper wall's own top pins and finished cover remain ordinary. Two separated
downward end-wall-style snaps retain the shoe in
the carrier. Its support shoulders carry compression; hooks retain uplift and
must not be the sole compressive load path. These dimensions implement the
approved architecture; geometry and toolpaths do not establish a load rating.

Keep snap flexure in the plane the shoe prints in. Do not grow ordinary wall pins
vertically from a horizontally printed carrier: `buildRiser` prints its snap on
its side, and Gridfinity deliberately uses plain bosses for this reason
(`src/geometry.ts`, `buildRiser` and `buildGridDeck`). Plain locating bosses alone
also do not retain a complete upper row against lift/peel.

### Required support topology

- A carrier panel must have actual solid bearing on lower walls on both sides of
  every load-transfer span. Measure the projected contact on production meshes,
  including pin reliefs, cross-laps, end-wall openings and seam frames.
- Plan tile boundaries around lower support lines, not the shifted upper divider
  grid. A Y joint must sit on a real lower support or use a separately proven
  bearing saddle. A seam floating in the middle of a lower lane is rejected.
- Divide long panels in X into bays that each retain their own two-sided wall
  bearing and retention. Do not rely on a key or through T to carry bending across
  a free seam. Every bay must print with its real sockets and keep-outs.
- Each upper wall must have an explicit schedule of retained shoes/bearings under
  it. Shoe locations consume real space: upper wall receiving sockets, upper deck
  ears, lower carrier catches, carrier slots and seam frames must all clear.
- A shoe crossing a panel joint or landing over a lower blind socket needs a
  deliberately proven bridge/attachment variant. It cannot be accepted by checking
  only the shoe center or the combined panel bounding rectangle.
- Within-row shared walls require the actual shared crest pin/receiving chamber,
  carrier catch ownership and two-sided row bearing rules. An ordinary-wall-only
  coupon does not qualify them. If a shared boundary cannot support the carrier,
  retain both walls with a visible reason and recompute width before fitting.
- Upper overhang, greater depth than the supported region, or a single narrow
  lower support under a wider upper arrangement needs real additional posts/frame
  or a separately qualified cantilever. The first envelope may reject it. Merely
  being inside the shelf does not make it supported.
- Include cumulative loads from all rows above, one-sided loading, torsion and
  asymmetric widths. Bearing geometry and a slicer pass cannot establish creep
  resistance or a printed load rating. Handling remains bottom supported.

### Initial manufacturing envelope

Start with front-aligned, common-depth lanes within each row and coplanar row
wall tops. The upper shoe footprints must be contained within independently
supported carrier panels. The support planner must consider an explicitly spread
lower row, not reject a wider upper row merely because the lower row would be
narrower when packed compactly. Deeper upper arrangements and arrangements
outside the actual spread supports have no automatic fallback. Prove the
two-wide-to-three-narrow transition and singleton row cases, then broaden the
envelope only with evidence for the affected mechanism.

These are phase-one manufacturing restrictions, not a claim that the product
supports every arbitrary row arrangement. Preserve unsupported entered depths,
widths and lane settings, explain the precise unsupported transition, and disable
exports for the invalid complete build. A retained within-row boundary can be a
safe fallback; an unsupported upper row cannot fall back to a floating render.

The user's particularly useful case is **two axial-157 mm lanes below three
axial-122.5 mm lanes**, all D66, with 6 mm walls and 3.5 mm can clearance. Without
sharing the compact widths are 348 / 420 mm; rejecting the top solely against the
compact lower width misses an available structural arrangement. Set the lower
row's visible `rowSpan` to 420 mm and spread its complete lane modules with a
75 mm empty central gap instead of 3 mm. Centered lower wall lines are then
Y=-207 / -40.5 / +40.5 / +207 mm, giving candidate transfer spans
166.5 / 81 / 166.5 mm. The empty gap is itself bridged between two real lower
walls; no old mixed spline spans it. Both rows retain their actual can dimensions.

This fits the 457.2 mm shelf's width budget before final manufacturing margins;
the 420 mm row plus existing 4 mm side clearances needs 428 mm. At 279.4 mm depth,
slope 3° and lip gap 5 mm, both natural row heights are 96 mm. A candidate 14 mm
transition plus the current default-fit top cover would total 212.633 mm, within
241 mm. The spans are below the isolated specimen's 200 mm geometric span, but
that does not qualify a multi-span shelf, adjacent panel ownership, upper edge
shoes or cumulative load. This exact spread case is a required full-geometry
gate, not a completed production capability.

Carrier material also counts toward width: retaining the coupon's 12 mm margins
beyond the outer support centerlines would give a 438 mm carrier and a 446 mm
shelf requirement including those side clearances. That still fits 457.2 mm, but
the solver must charge this actual wider part, not advertise only the 420 mm row.
Any narrower edge variant needs its own intact bearing/socket-skin proof.

At 279.4 mm depth, existing arithmetic accepts a flat lower row of two D66 / axial
157 mm lanes and a flat upper row of three D53 / axial 80 mm lanes at slope 3°,
lip gap 5 mm and 6 mm walls. Without sharing, widths are 348 / 292.5 mm, natural
row heights 96 / 83 mm, and capacities 6 / 12 cans. Both standalone checks return
no warnings. A hypothetical 14 mm transition and the existing 6.633 mm top cover
would give 199.633 mm overall height, below 241 mm. This is a dimension-budget
example, not an assembled carrier test or a promise of the final joint size.

## Public flow, links and exports

Propose `v=5&mode=rows&rows=<JSON>` with explicit `shareWalls=on|off` and
`topCover=on|off`. The row JSON carries the schema above in canonical bottom-up,
right-to-left order. Shared machine/process/material settings keep their current
meaning. Validate unknown versions, malformed rows, duplicate semantic flags,
nonfinite dimensions, invalid repeat counts and unsupported combinations loudly.
Restore independently valid row/stack JSON before checking sharing or cover
flags. A malformed flag remains blocking until its specific checkbox changes;
unrelated edits must not overwrite the incoming link or promote defaults.
Unresolved flags survive manual mode round trips and block only their affected
mode. A new valid incoming link resets their recovery state.
Malformed JSON/version errors require valid navigation or an explicit mode change.
Manual mode round trips preserve the mixed sharing choice; incoming legacy links
retain their sharing-off behavior. Expanded instances use physical Level labels,
with editor Row/copy context in diagnostics, while source identities stay stable.
Assembly guidance follows actual retained-wall connections and shared dividers,
as well as the carrier's required sideways joining sequence. Zero-transition
builds hide carrier/shoe steps; structural-link errors explain their recovery action.

Uniform links remain uniform. Mixed v2/v3 retain their inherited settings and
sharing-off behavior; mixed v4 retains its existing explicit sharing contract.
Do not reinterpret an old column as a row or auto-convert old `tiers` into a new
row layout. An explicit future conversion must show the resulting geometry and
preserve can assignments; it is not required for the initial row mode.

Add proposed `ResolvedIndependentRowsLayout` data carrying rows, expanded repeat
instances, origins, capacities, per-lane padding, transition plans and complete
footprint. The resolver remains pure arithmetic. A transition plan names every
lower support, carrier panel, shoe, receiving interface and print section before
the solver advertises its footprint.

Follow the existing shared component-iterator pattern in `src/assembly.ts`.
Proposed source kinds include `row-part` wrapping an explicit existing source and
`row-carrier` / `row-shoe` / transition-key sources with row/transition and section
identities. These are proposals, not current APIs. Do not infer ownership from
filename suffixes or deduplicate unlike geometry by matching bounds/volume.
Repeated identical physical sources may share one mesh only with a complete
effective-geometry identity.

The same manifest must drive printable quantities, standing poses, viewer,
packing, STL inventory and every 3MF physical copy. Preserve the existing atomic
worker rule: publish/cache the complete packed build only after every row and
transition succeeds; a failed replacement invalidates exports from the previous
build. An invalid support plan must not produce partial exports.

## Evidence and approval gates

Before production contracts or geometry are changed, record a dimensioned carrier
and shoe, its assembly order, required free space and all supported/rejected
interfaces. Use production-derived lower walls, catches, upper walls and deck
ears, not simplified solids that omit the conflicting features.

Required digital evidence includes fits -0.2 / 0 / +0.3, positive projected bearing,
static seating, permitted rigid insertion, intended snap flexure, uplift/peel/roll
obstruction, root/ligament conservation, connected support-free print meshes,
Float32 bounds, rectangular beds/keep-outs, actual quantities and serialized
exports. Slice first and functional upper layers in both packed orientations.

The first one-span coupon does not prove a tiled shelf, an entire two-to-three
assembly, unequal padded heights, shared dividers or the full row/print range.
Those need explicit subsequent gates. Physical hand fit, full/one-sided load,
dwell and residual deformation remain separate printed trials.

### Historical one-span evidence

`prototypes/grid-row-transfer.ts` generated
`.slice/grid-row-transfer-1792456545015/geometry.json` and
`grid-row-transfer-coupon.3mf`, SHA-256
`adff1b6d7e9a2cae10c03f0b59161c35ecd70bd0c8f7b249417b6fc00e900871`.
Source hashes and the P2S 0.4 / 0.2 mm Standard / PETG Translucent profile are in
the record. It contains three fits, 18 connected support-free solids and three
packed plates; all initial pair intersections are below 3.6e-13 mm³. The 0.01 mm
downward contact probe measures about 553 mm² at each lower support, 479–502 mm²
under the shoe and 123–148 mm² under the actual deck sample. Upward displacement
of 0.8 mm encounters all three intended retained interfaces.

Negative controls retain missing support: shortening one lower wall by 2 mm
removes its flat bearing and causes about 1.183 mm³ pin/socket interference;
moving the upper shoe outside the plank removes bearing. A 4 mm shoe leaves less
than the required 1.7 mm floor under the upper pin root; the 6 mm candidate
retains 1.768–2.556 mm across fits. These measurements concern an unsplit 240 mm
source lane and one 200 mm transverse span. They do not prove a full row, general
station allocation, permitted insertion flexure, torsional retention, tile joints,
the 279.4 mm source, shared crest interfaces or toolpaths. Adjacent copies of the
coupon overlap at their lower support: simple duplication is not a tiling design.

### Complete geometry and failed initial shoe toolpaths

The complete production-derived runner is
`prototypes/qualify-grid-row-transfer.ts`. Its pre-crest record at
`.slice/grid-row-transfer-complete-1792458540269/` contains three fits of the
actual 112-piece two-to-three assembly, including upper compact-row connection
channels and splines, six carrier panels, twelve shoes and eight seam keys.
Each complete project packs onto 24 P2S plates. Initial posed intersections are
below 1e-5 mm³, every carrier panel has direct two-sided lower-wall bearing,
shoe shoulders bear on real carrier material, and sampled uplift/roll/peel
motions encounter the intended retention. Carrier width is 438 mm, requiring
446 mm with shelf side clearances. These are geometry results, not strength.

Compact lower rows use neighboring independently supported carrier panels meeting
in the gap between their paired walls. They do not introduce a narrow unsupported
panel or require seam keys to transfer compression. The geometry suite also
covers aligned and shifted singleton rows and the 5.75 mm wall endpoint at fits
-0.2, 0 and +0.3. Shoes crossing a carrier seam, insufficient closed-slot edge
rails, different row depths and spans beyond the tested envelope fail explicitly.

Fresh initial shoe slicing then failed 32 of 624 functional probes: ordinary
upper pin hook midpoints at fits -0.2 and 0 on the first layer in both packed
orientations. The other 592 downward-snap/root/shoulder probes passed. Preserve
`.slice/row-shoe-toolpath-initial-20261019/toolpaths.json` and the actual four
plates at `.slice/production-shoes-tLXCNf`; the earlier CAD pass did not qualify
those hooks. The correction reuses `sharedWallPinJoint` for the shoe and its
matching bottom notch for incoming walls. The return flank, hook reach, free
root, six-millimetre body, lower catches and 14.1 mm pitch stay unchanged.
Planner print bounds include the raised tip. The corrected actual-part geometry
suite passes 19 tests and 99,036 assertions. Fresh slicing passes the same 624
functional probes with the same 0.27 mm threshold, all three fits and both actual
packed axes: `.slice/row-shoe-toolpath-final-20261019/toolpaths.json`, actual
slices `.slice/production-shoes-ZyTyeT/`. This qualifies approximate deposited
material coverage at those points, not printed fit or strength.
Final complete exports and source hashes are in
`.slice/grid-row-transfer-final-20261019/`; geometry and packing pass at all
three fits with the same overall heights. The nominal-fit 112-piece, 24-plate
project also slices successfully. After independently reproduced Opus findings,
the planner now rejects shoe slots that would join hidden key channels and shoes
outside their panel's actual lower bearing interval. The edge margin does not
qualify a cantilever. Fresh final-source exports, carrier/receiver and shoe probes,
complete-production slicing and assembly/trial instructions are recorded in the
[qualification record](2026-10-19-independent-can-rows-qualification.md).

## Sources and reuse map

Read on 2026-10-19 against the working tree; symbol names are more stable than
line numbers while the authorized column UI fixes proceed.

| Existing source | Read and reusable fact |
|---|---|
| `src/model.ts:149–211` | Column requests, resolved columns, shared boundary schedules; no independent-row contract. |
| `src/solver.ts:24–107` | Mandatory full request, exact depth, per-column height, boundary decision before width/origins. |
| `src/shared-walls.ts:42–68,224–255` | Whole-column compatibility and bearing/catch allocation; failure retains walls. |
| `src/geometry.ts:53–119,300–348` | Natural height/width/section arithmetic and role-specific deck attachments. |
| `src/geometry.ts:369–463,551–613` | Deck ears, structural walls, end-wall bracing and support-aware section composition. |
| `src/geometry.ts:659–718` | Side-printed riser, plain Gridfinity bosses and blind cover chambers. |
| `src/features/joints.ts:89–171,203–245,271–286` | Exact pin/ear/cross-lap/T pairs, shared clearance, skin/roof dimensions, end-wall snaps. |
| `src/features/shared-wall.ts:7–66` | Actual shared crest, blind socket and collar geometry. |
| `src/shared-wall-geometry.ts:39–162` | Coordinated adapted decks/covers and neutral divider; current covered source identity. |
| `src/assembly.ts:34–113,140–260` | One manifest/pose authority, per-source quantities, shared boundary sources and bounded preview. |
| `src/worker.ts:8–22,32–95` | Request variants, arena lifetime, complete packing and build-bound export cache. |
| `src/validate.ts:57–95` | Old two-to-eight-column gate; preserve it instead of abusing it for singletons. |
| `src/main.ts:1133–1207` | Current mixed v2–v4 serialization/reading; new v5 branch must preserve these. |
| `test/shared-wall-production.test.ts:39–92,112–130` | Actual scene construction, all-part/can checks, Float32 packing and projected bearing. |
| `test/mixed-geometry.test.ts:19–88,218–235` | Exact quantities/export inventory and independent ordinary-source comparison. |
| `prototypes/grid-row-transfer.ts:20–26,63–170` and its recorded `geometry.json` | Actual one-span dimensions, bearing/withdrawal probes and unsupported-case controls; no full-row or toolpath result. |
| `.agents/skills/changing-layout-and-assembly/references/contracts.md` | Role/queue/preview invariants and physical-vs-geometric evidence limits. |
| `docs/open-questions.md:47–77` | Shared production scope, corrected ligaments and unqualified physical behavior. |

The September mixed-width spec is superseded. The shared-wall v1/v2 prototype
notes preserve earlier evidence; production source and the current qualification
record govern what is actually implemented. None contains an independent-row
support mechanism or a transferable loaded-strength qualification.
