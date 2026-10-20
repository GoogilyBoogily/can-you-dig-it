# Shared walls between adjacent stacks — audited staged plan

## Primary goal

Adjacent stacks can use one printable internal divider where it is mechanically
valid, saving shelf width and material without changing their requested can sizes,
exact depths, tier counts, loading behavior or usable can paths. Independently
configured stacks remain usable when a boundary cannot share a wall.

Status amended 2026-10-17: the user approved branching and implementation with
“Branch and make it so!” The complete mechanical v2 gate passed before production
integration: 24 sliced plates and 1,134 mechanism probes, with no failed probes.
The application now implements compatible whole-boundary sharing on branch
`feat/shared-stack-walls`. Digital verification and fresh production-export slicing
are complete: 1,610 unit tests, 102 browser tests, 47 production plates and 2,872
deposited-material probes pass. Physical hand fit and loaded behavior remain
unqualified; incompatible depths, heights and tier interfaces retain separate walls.
The complete evidence and scope limits are tracked in the
[qualification record](../specs/2026-10-17-shared-stack-walls-qualification.md).
The staged plan below preserves its original investigation and adversarial findings.
The rejected single-owner-ear/T-bridge shortcut was not implemented.

## Phase 0: Documentation discovery and falsification

**How this serves the primary goal:** establish what the generator actually builds
and eliminate shortcuts that discard structural supports.

Sources: `src/model.ts:149`, `src/solver.ts:40`, `src/layout.ts:67`,
`src/assembly.ts:32`, `src/assembly.ts:136`, `src/mixed-geometry.ts:14`,
`src/geometry.ts:300`, `src/geometry.ts:369`, `src/geometry.ts:442`,
`src/geometry.ts:543`, `src/geometry.ts:685`, `src/features/joints.ts:93`,
`src/features/joints.ts:120`, `src/features/joints.ts:152`.
Read the latest amendments in `CLAUDE.md`, `docs/open-questions.md` and
`docs/superpowers/specs/2026-10-17-multiple-seams-design.md` first. The September
mixed-width design is historical and superseded by mandatory ordered stacks.

Allowed existing APIs/patterns: `resolveMixedBuild`, `laneOf`, `tierRole`,
`rearTier`, `wallVariant`, `mixedPartManifest`, `mixedAssemblyPlacements`,
`mixedAssemblyCans`, `buildMixedGeometry`, `buildLanePlates`, `gangJoint`,
`earJoint`, `crossLap`, `stand`, `lay`, `packPlan`. These names exist; there is
no existing shared-divider or two-sided wall-attachment API.

Discovery and independent temporary production-mesh probe complete. Evidence:
`.slice/shared-wall-plan-20261017/probe.ts` and `probe.jsonl`.
The probe translates the second ordinary stack by -(wall + gap), leaves its
stack-specific solids unchanged, and enumerates positive-volume cross-stack
intersections. This falsifies naive collapse; it does not prove a new joint.
Even identical 240 mm flat stacks produce 624 mm³ deck/deck overlap per tier,
2444.18 mm³ end-wall/end-wall overlap per tier, and 8361.92 mm³ cover overlap.
A same-diameter, different-can-length pair has identical wall attachment schedules
at this length, but the same collisions. Standard/slim cans have H=96/83 mm;
unequal depths move the ear, pin and end-wall positions independently.

### Decision chain

1. Walls are structural: each supports the next tier and has deck-ear snaps,
   tier pins/catches, end-wall cross-laps, hidden seam keys and a printed-face recess.
2. Single-wall spacing changes both geometry and assembly, not just mesh counts.
   Two decks currently own the same full-thickness wall region after collapse.
3. Can length changes lane width; can diameter usually changes wall height.
   Test actual resolved attachment geometry, not can preset names or can dimensions
   alone. Never enlarge tier spacing silently to align incompatible stacks.
4. The safe first target is a complete boundary whose mechanical schedules match
   in world X/Z. Share all tiers on that boundary; do not introduce partial-height
   or partial-depth sharing in the first implementation.
5. A boundary-owned wall needs coordinated deck, end-wall and top closures even
   in that target case. A dedicated mechanical prototype is a go/no-go gate.
   Existing ganging T sockets pass completely through the deck: their X/Y
   interlock supplies no vertical bearing to replace a removed ear.
6. Arbitrary unequal heights/depths require a different two-sided attachment system.
   Existing through-wall reliefs/cross-laps cannot simply be combined, and blind
   sockets/projections on both wall faces can violate flat-pack printing.
7. Use a hybrid row: each boundary is either shared or the existing retained-wall
   spline connection. Compute width from actual boundary decisions; no stack is
   dropped, resized or made nonfunctional to obtain savings.

## Proposed product behavior and exact scope

Recommend an explicit opt-in **Share compatible walls** mode for mixed stacks.
Existing links/builds retain their current behavior. An opted-in build reports
which boundaries shared, width saved and any retained-boundary reasons.
The initial mode supports different lane widths/can lengths when resolved
mechanical schedules match; it deliberately preserves full independent settings.
It does not promise that a standard-can/slim-can pair shares a wall.
A requested shared mode may have zero shared boundaries; make this visible rather
than silently claiming success. An optional strict mode is not part of this plan.
Uniform ganging, Gridfinity and feet retain their existing behavior initially.

For N stacks of common thickness t, IW_i is unchanged. With S shared boundaries:

    old width = Σ IW_i + 2Nt + (N−1)gap
    new width = old width − S(t+gap)
    next centre = current centre + (IW_i+IW_next)/2
                  + (shared ? t : 2t+gap)

The outer shelf side clearances remain 4 mm each. At t=6, gap=3, save 9 mm per
shared boundary; two standard 126 mm internal lanes go from 279 to 270 mm.
Part footprint bounds must substantiate the saving, including covers and retainers.
No filament or print-time saving is promised from width alone.

## Phase 1: Prove one complete mechanical boundary

**How this serves the primary goal:** establish that one wall can support and retain
both stacks while every piece remains printable and can be assembled.

This is a small standalone prototype/coupon using production parts, before a
production geometry change. Start with two uncovered one-tier flat stacks, then
covered two-tier stacks; use different IW with otherwise compatible schedules.
Copy the local joint-pair and transform patterns from `features/joints.ts:120`,
`features/joints.ts:164`, `features/pose.ts:7`, `test/features.test.ts`,
`test/mixed-connection.test.ts:38` and `test/mixed-geometry.test.ts:55`.

Candidate to test, not an established mechanism:

- One neutral full-thickness divider, one lattice/keep-out field, no doubled outer
  recess. Use one tier pin/catch schedule and one hidden-key system, not unions of
  opposing snap reliefs that erase each other's roots. Choose a print face and keep
  every pin/tab flush with it; retain current support-free printing rules.
- Preferred support hypothesis: stagger the two decks' full-width ear locations
  along X so each bears directly on the common wall below and snaps into the
  divider above. A boundary schedule assigns each site to exactly one deck and
  preserves the other deck's rail, can path, ties, seams, pins and root keep-outs.
  Moving ears requires coordinated side-specific tabs/slots, not ordinary laneOf()
  output or a viewer transform. Both decks retain their own positive bearing and
  vertical retention at the shared edge; no load is assigned to a through T.
- Keep all divider tabs on the same print face. Mirroring follower tabs to the
  opposite face suspends their 3 mm thickness above the print bed at the notches.
  A follower ear needs its slot relocated to match that common tab face. This is
  a new host/joint variant: simply moving the existing slot to the ear's far edge
  opens the slot through that edge. Prove closed rails, minimum ligaments and the
  root using actual booleans. A far-side collar with an agreed clearance in the
  other rail, or a different bearing/catch joint, may be necessary. Its printable
  envelope and can clearance must be measured; this design is not yet verified.
- Rejected shortcut: remove follower ears and use a shortened existing gang T.
  gangJoint()'s socket passes fully through the follower deck, so it has no
  horizontal bearing to support that edge and permits vertical peel. The code
  explicitly records the earlier unsupported-edge problem at geometry.ts:274–279.
  An independently designed bearing shoulder and vertical catch could be an
  alternative prototype, but the existing T alone is insufficient.
- At each common rear end, allow at most one full shared-wall cross-lap post.
  The other end wall needs a deliberate boundary-side variant retaining its own
  deck snaps and outer-wall cross-lap. Prove lateral bracing and withdrawal when
  uncovered and rear loaded; deleting its post alone is not accepted evidence.
- Two covers cannot retain overlapping full-width wall strips. Prototype an
  explicit common top closure or coordinated adjacent cover edges with direct
  wall-top bearing and vertical retention for BOTH covers. Interdigitated ownership
  along X may keep each live catch whole on one cover; prove that each cover keeps
  enough catches, closed skins and roofs, and that printable roots clear windows
  and longitudinal seams. All-primary catches plus a through-T follower is also
  insufficient against follower-cover peel. Existing hidden keys are only a
  candidate after their orientation, host margins and insertion are checked.
  Verify catch skin/roof/edge margins after trimming; do not bisect a live catch.
  This exact cover arrangement is unresolved and is a required go/no-go result.
- Assembly sequence candidate: join all deck sections; mate adjacent decks in Z;
  slide together keyed divider sections along X before lowering them onto the
  planned deck ears; fit outer walls and end walls; repeat tiers; join and
  lower coordinated cover pieces. Challenge access/order with three neighbors.

Required outputs: dimensioned contact/joint ownership diagram, final insertion
sequence and required free space, precise feature parameters and retained ligaments,
actual connected/flat-printable meshes, collision/withdrawal sweeps at fit
-0.2/0/+0.3, whole-lane roll/peel sweeps about the outer-wall contact, and physical
coupon protocol. If the ear or cover mechanism fails,
stop and redesign this phase; do not paper over it by omitting supports or tests.
No dependency addition or relaxation of flat-pack rules is authorized.

Gate: no full implementation until the complete covered boundary and its two-sided
middle-stack case pass the digital checks. A wall-only CAD demonstration is not
sufficient. Fresh Bambu slicing should validate functional junctions before scaling.
Physical qualification is separately required before a loaded-strength claim.
Slicing needs mechanism-specific probes after dimensions are frozen, at first AND
functional upper layers, in both packed orientations and all three fit values.
Current check-toolpaths.ts requires >=3 sections and names legacy uniform parts;
its first-layer probes cannot qualify this new boundary or its blind cover roofs.

## Phase 2: Resolve boundary compatibility without changing solids

**How this serves the primary goal:** identify safe sharing opportunities and make
shelf-fit decisions agree with the assembly that will actually be generated.

What to implement, after approval: add an explicit opt-in request contract and a
boundary plan consumed by solver, manifest and builders. Reuse the pure arithmetic
pattern of `layout.ts:67` and the full-request resolution in `solver.ts:40`.
Do not overload spline dimensions to mean a shared wall. Boundary identity belongs
to the pair of adjacent stacks, not one arbitrary row. Keep existing spline sources
for retained boundaries and new explicit sources for shared dividers/adapted parts.
The new public types and metadata are proposed changes, not already available APIs.

Conservative first-release eligibility: same exact assembled depth, same feed
style, per-tier X orientation and Z elevation, same tier count and tier base/top elevations,
same slope and lip headroom, same end-wall presence/cross-lap positions,
same rear-load and stackable state, same cover presence/elevation/longitudinal window extent,
same X seam positions/frames and pin positions, same wall thickness/clearance/fit.
Can length/IW may differ. Compare interface-relative joint geometry, not complete
poses or transverse window width: Y origins and those widths must differ for
unequal lanes. Validate each lane's own transverse window width independently.
Unequal IW can also affect bed orientation, section choices and cover seam/key
positions. Production counterexample: flat D66, depth480, bed300×180,
canL122.5 versus190 gives H98 in both, but seams [0] versus [-80,80] and different
pins/ears. Both standalone stacks pass check().
An epsilon may recognize arithmetic noise only; never treat clearance-scale or
rounded-height differences as compatible. Conditions must be independently tested
on equal derived height with unequal slope/headroom and differing seam plans.

Freeze sharing eligibility before computing final Y origins and shelf width.
Resolve exact per-row geometry first, then boundary state, then cumulative origins.
For three+ stacks an interior deck/end-wall/cover may have two shared sides, a shared
side and a retained side, or none: represent both sides explicitly. Reflection and
cascade parity apply in world sides before choosing printable variants.
Any boundary prototype/packing limitation is an explicit retained-boundary reason
before width is charged, or a labelled build failure; never silently change spacing
inside the worker after the solver advertised a smaller footprint.
Compatibility alone is insufficient: allocate disjoint bearing/retention sites
with enough solid roots and closed-slot rails for both decks in every section.
No valid schedule means retain both walls. Current mixed laneOf().tongues is empty
because left/right are none; even legacy gang-enabled depth120 and260, slope0
examples have no tongue sites. A new support schedule cannot assume those exist.
Validate a whole shared run, including both sides of every interior part, before
finalizing pair decisions. If one side conflicts, use a deterministic conservative
retained boundary and recompute origins; no speculative width reduction.

Verification: pure eligibility positive/negative cases, unchanged legacy layout
and links, exact shelf width ±0.001 mm, 2/3/8 stacks, reordered A-B-C versus C-B-A,
and auto tiers unaffected by sharing. Keep existing assertions unchanged.
Anti-patterns: keying on preset names, comparing only H, borrowing one stack's
seam plan without validating both, shrinking capacity or force-aligning tiers.

## Phase 3: Integrate explicit parts, poses and printing

**How this serves the primary goal:** generate exactly the shared parts needed and
preserve the same valid arrangement from preview through exported print files.

Follow `assembly.ts:30` and `assembly.ts:136`: one component iterator yields unique
physical source descriptors, exact quantities and placements. Shared walls and their
keys belong to the boundary, not either stack's wall source. Omit both original facing
walls and their redundant keys only for shared boundaries. Retain ordinary walls and
splines at every retained boundary. Adapt decks/end walls/covers by both side states.
Distinct same-role tiers cannot alias unlike top/bottom/open/closed variants.
Include both side states and any attachment schedule in source and mesh-cache
identity (currently mixed-geometry.ts:36–37). A retained spline must carry its
original adjacency identity; filtering shared boundaries must not shift indices
used by layout.connections lookup or label the wrong neighbors.
Build only requested sources, following `mixed-geometry.ts:14` and fail on missing
sources. Do not deduplicate by volume/bounds or infer identities from filenames.

Two concrete parity traps require explicit changes: assembly.ts:41 reflects
asymmetric decks only when gangs(options) is true, but mixed stacks disable that
flag. Shared side-specific decks need reflection independently of old ganging.
Also assembly.ts:139–144 uses local wallSide, safe only at tier zero; map to world
sides before adapting/removing a wall at every reversed cascade tier. Cover and
end-wall side ownership need the same convention. Exercise six tiers with both
hands of the repeated mid role and a middle stack having two shared sides.

Use each shared divider's agreed common longitudinal section plan. Validate real
print envelopes, Float32 bounds, margins, rectangular bed orientation, keep-outs,
and Z. Existing long-lane section arithmetic cannot split a panel across its height;
reject or retain a boundary before claiming fit if a divider cannot print. Initial
matching-height scope avoids full-height combined panels. Reuse concealed seam keys
only with all required support frames and correct quantity at every seam/tier.

Verification: actual assembly intersections including cans at axial extremes,
static and swept dispense/chute/rear-load/window clearance, assembled can counts,
independent part/keys quantities, support/connectivity/material checks, complete
STL ZIP and serialized 3MF placements, and accurate profile-aware estimates of actual
parts. Reference tests should show unchanged legacy geometry when the mode is off.
Anti-patterns: viewer-only deletion, counting a shared wall twice, missing follower
side decks or cover catches, dropping keys by stack-local heuristic.

## Phase 4: Expose the opt-in mode and its consequences

**How this serves the primary goal:** let users request sharing and understand the
actual boundary result before committing to a print.

Trace the approved option through form/validation/hash, resolver, worker request,
viewer, results and print instructions. Follow current `main.ts:1120` serialization,
`main.ts:1169` validation and `worker.ts:39` atomic mixed build. Preserve old v2/v3
mixed links exactly as sharing off. Sharing requests must emit v4, even if every
boundary is retained: existing v2/v3 code ignores unknown fields but explicitly
rejects an unsupported version. Adding a sharing flag to v3 would silently generate
different geometry in old clients. Test that rejection and the v4 round trip.
No automatic old-link geometry migration.
Show shared boundary count, actual width saved and clear incompatible-boundary
reasons (for example, different tier elevations or depth). Rerender after reorder,
printer/exclusion changes or any row option change. Update assembly instructions
for common walls and paired decks/covers; retain existing instructions where valid.

Verification: browser/share round trip, old hashes, reorder, mixed boundary results,
a narrow shelf made feasible only by proven sharing, estimates/exports matching
preview, stale worker responses and error recovery, desktop/phone visual review.
Anti-patterns: claiming all walls share when some retain two walls, or a control that
forces neighboring can settings into alignment without the user's choice.

## Phase 5: Verify and qualify before claiming completion

**How this serves the primary goal:** demonstrate the savings and correct generation
while keeping digital geometry, sliced toolpaths and physical results distinct.

Use current tests as patterns: `mixed-layout`, `mixed-geometry`, `mixed-stack-options`,
`mixed-connection`, `multiple-seams`, `section-printer-constraints`,
`cascade-gang-assembly`, `joint-retention-and-finish`, `manufacturing-contracts`,
`islands`, `overhang`, `parts`, `packed-plan`, `export`, and affected UI suites.
Independent positive/negative cases, not implementation-shaped expected arrays:

- different can lengths, same mechanics; equal can diameter with unequal mechanics;
- flat/cascade, 1/2/3/5/6 tiers (cascade >=2), repeated mid roles in both parities;
- one/two/three/four printable X sections with keys, unequal IW/bed seam choices;
- short depth120 and260 slope0 cases with no legacy gang sites, and bed300×180
  depth480 equal-height widths that produce different section/pin/ear plans;
- 3+ stacks with a two-shared-sided middle, mixed retained/shared boundaries,
  reordered edges and cover/end-wall ownership;
- cover/no cover, rear-load/no rear-load, stackable/terminal and pattern/minimal/solid;
- fit -0.2/0/+0.3; rectangular/transposed bed, keep-outs and exact shelf-fit boundaries;
- incompatible depths/heights/tier counts/settings remain usable with labelled
  retained boundaries and their original capacities/loading paths.

Run `bun run check`, `bun test test/`, `bun run build`, `bun run test:ui`,
`git diff --check`; no lint script exists. Run UI builds sequentially. New geometry
gets independent invariants and explained reference deltas at existing tolerances.
Existing test assertion changes and public-contract changes require scoped approval.
New opt-in parts need manifest-driven checks for EVERY requested source, following
mixed-geometry.test.ts and multiple-seams.test.ts. Existing overhang/islands tests
iterate default refParts; running them alone does not exercise new shared parts.
Worker checks connectivity/topology, not the flat-pack overhang contract.
Slice fresh coupons and complete representative paired/triple-stack exports with
P2S 0.4 mm, 0.2 mm Standard, PETG Translucent, smooth PEI. Check all plates, diagnostics
and functional bead coverage; record source hashes and evidence, not just screenshots.
Probe first-layer roots and functional upper-layer bearing, catch, collar and roof
regions in both allowed packed orientations and fit -0.2/0/+0.3. Use a new evidence
set keyed to approved shared sources/dimensions: the existing legacy multi-seam
first-layer checker is insufficient. Verify the actual Smooth PEI bed and process
settings in every sliced plate; coupon and app exports can otherwise differ.
Then print the coupon and a fully connected paired/triple assembly, including one
3+-section example, before asserting hand fit or loaded behavior. Agree the can
load and dwell with the owner; test both-full and one-sided loading, feed function,
seam steps, lateral lean, residual set and bottom-supported handling. Shared walls
and keys receive both stacks' loads; old wall ligament dimensions are not a load
rating. Existing current joints also remain physically unqualified.

## Arbitrary unequal-stack extension: separate mechanical project

A shared stepped divider for different heights/depths is possible as a design target,
but is not established by the current implementation. Its domain is the union of the
two front-aligned X/Z wall silhouettes, with an independent attachment schedule on
each face. This requires joints for decks/end walls/covers meeting the middle of a
panel, rather than its bottom/top edge. Opposing cutouts must preserve a central web;
new tongues/retainers must stay outside the other stack's can and loading sweeps.
A divider exceeding either bed axis also needs vertical segmentation, with new seam
load-path/assembly proof; current X-only seam machinery cannot solve that by itself.

Evaluate a through-aperture plus separately printed flush-retainer mechanism rather
than unsupported blind sockets on both faces. Determine required thickness and
physical support before claiming it saves width. Near-aligned attachment elevations
can be harder than widely separated ones because roots/reliefs collide. At a shorter
stack's cover elevation, the taller divider continues above: current top-pin catches
cannot simply be moved into its face. At shorter rear depth, the longer stack's wall
continues; the shorter end-wall cross-lap cannot cut a full-height slot there.
Openings through one side must not let cans/ends cross to the other stack.

Do not quietly substitute a max-height/max-depth solid rectangle, union both original
perforation fields, force a common H, or claim arbitrary independent settings work.
This later project must pass its own joint prototype gate and user-approved contracts;
first-release compatible sharing can remain useful without those promises.

## Review log

Three independent adversarial reviews completed against the draft and current code.
The plan was revised before any production implementation:

| Finding | Disposition |
| --- | --- |
| Blocker: existing through T cannot replace follower ear bearing/retention | Rejected shortcut; first phase now proves staggered direct bearing or a new supported joint. |
| High: mirrored tabs float; relocated far-face slot opens its free edge | One print face; explicitly unverified closed-slot collar/receiver design and root/rail proofs. |
| High: trimmed follower cover plus through T lacks shared-edge bearing/retention | Unresolved prototype gate; each cover must retain direct bearing and positive catches. |
| P1: old clients silently ignore a v3 sharing flag | Require v4 for every sharing request; preserve v2/v3 as off. |
| P1: matching dimensions do not ensure available support sites | Explicit support allocation/section coverage gate; depth120/260 counterexamples retained. |
| P1: legacy first-layer toolpath checker cannot qualify new parts/upper roofs | New mechanism-specific multi-layer evidence set and actual process/bed verification. |
| P2: full pose/window equality wrongly rejects different IW | Normalize boundary geometry; compare X/Z and longitudinal window extent, preserve transverse width. |
| P2: mixed decks bypass old reflection, and local wall sides flip on odd tiers | Name exact assembly.ts paths; demand world-side selection and repeated-mid parity coverage. |
| P2: shared wall/keys carry two lanes; current digital joints lack physical evidence | Asymmetric load/dwell, full multi-section specimen and supported handling protocol. |
| Medium: follower end-wall bracing and insertion access unproven | Whole-assembly yaw/roll/peel and assembly-order gate, including rear-load/open cases. |

Reproduction evidence is retained under `.slice/shared-wall-plan-20261017/`:
probe.ts/probe.jsonl (seven production-mesh collapse cases),
contracts-probe.ts/contracts-probe.json (seam mismatch, widths and cover coordinates),
manufacturing-probe.ts/manufacturing-probe.json (available joint sites across depths).
These use existing code; none builds or verifies the proposed new joint.
The mechanical reviewer reread the revised plan and confirmed that the unsupported
shortcut is rejected and remaining support, cover and insertion uncertainties are
explicit prototype gates. This is a prototype-first investigation plan, not a
production-ready mechanical design.

Baseline checks run on unchanged application/test source during planning:
`bun run check` passed; `bun run build` passed; `bun test test/` passed
1464 tests, zero failures, 1,463,046 assertions across 51 files in 216.95 seconds.
No lint script exists. Browser tests and new slicing were not run for this
planning-only change. No physical tests or current/new strength claim was made.

## Approved implementation and remaining qualification

The user authorized the mixed-only request/v4-link contract, boundary-owned source
metadata, side-specific builders and new joint allocation pattern by directing the
approved staged work to proceed. The complete prototype gate then selected v2's
0.6 mm shared-pin crest before application integration. No dependency addition,
data deletion, existing-test weakening, physical printer operation or load-rating
claim is part of that approval.

Production uses `src/shared-walls.ts` for kernel-free interface checks and bounded
support/catch allocation, followed by manifest-driven `src/shared-wall-geometry.ts`
composition. Each boundary shares completely or retains its original geometry with
an explicit reason. Both owners keep direct bearing and positive retention; outer
and retained-side joints remain unchanged. Sites use the actual seam plan, per-tier
world hand, pin roots, end cross-laps and follower-finger loading keep-outs. The
prototype's 92 mm maximum unsupported end and 126 mm bearing interval constrain
new schedules alongside each original lane's corresponding spans. Additional cover
headroom and asymmetric Float32 printable bounds must fit before width is reduced.
Repeated roles and mechanically identical boundaries reuse arithmetic work.

Focused verification during integration passed the unchanged mixed layout/settings/
geometry suites (31 tests, 20,497 assertions), typecheck, and new pure/manifest and
independent Float32 regressions. Final whole-project test counts, source hashes,
fresh production slice/probe results and limitations belong in the qualification
record rather than being inferred from the prototype. Current physical PETG fit,
creep and loaded behavior remain unqualified. The inherited rounded cascade loading
window can clip a vertically inserted can at full axial displacement; centered
loading and stored-can clearances are separate checks.

Arbitrary unequal heights/depths, partial boundaries and vertical panel segmentation
remain a later mechanical project. No stack is resized, omitted or silently given
fewer tiers to make a boundary share.

## Review corrections completed, 2026-10-18

The post-implementation review found zero-clearance owner interfaces, unsupported
split-cover seam keys at thicker walls, and a primary print envelope incorrectly
charged for a follower collar. Follower rail/cover reliefs now apply the shared fit
clearance while preserving the primary bearing and follower cover-finger root.
Split covered boundaries retain their walls if the remaining seam-key ligament is
below `K.ligMin`; unsplit/uncovered thick-wall variants remain eligible. Printer
envelopes now charge collar width to the follower role only.

Eighteen new regression cases pass without changing existing assertions. Final
verification passed 1,628 unit tests, 102 browser tests, typecheck, build, reference
comparison and diff checks. Fresh production qualification passed 47 plates and
2,872 probes, including both packed axes and all original failed hook frames.
The current evidence, source hash and unchanged physical limits are recorded in
the [qualification record](../specs/2026-10-17-shared-stack-walls-qualification.md).
