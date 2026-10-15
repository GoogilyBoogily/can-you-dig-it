# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## can-you-dig-it

Browser-only configurator for 3D-printable can storage. User enters shelf W×D×H,
can Ø×L, printer bed; gets a Bambu/Orca multi-plate 3MF or STL zip. No server.

## Stack and commands
- Bun + TypeScript. `bun install`, `bun test`, `bun run build.ts` → `dist/` (static, GitHub Pages).
- `bun run check` is `tsc -p .` (`noEmit`, strict). Nothing else type-checks: the bundler
  strips types without reading them, so a build passing proves nothing about the types.
- One file at a time: `bun test test/regress.test.ts`. One case: `bun test test/ -t "name"`.
- `bun run dev` — builds, serves `dist/` on :3000, rebuilds on save. `dev.ts` shells out to
  `build.ts` rather than reimplementing it, so dev and Pages serve identical bytes. One
  bundler on purpose: no Vite.
- Two suites. `bun test test/` is the unit and geometry suite (no browser); it and `bun run
  check` are what the deploy gates on (`.github/workflows/pages.yml`). `bun run test:ui` drives `test-ui/` in Playwright against a real build; it
  needs `bunx playwright install chromium` once, and runs as its own CI job so a flaky
  browser can't block a deploy. Keep the trailing slashes — `bun test test` also matches
  `test-ui/`.
- The UI suite exists for what unit tests structurally cannot reach: state read from
  `localStorage` at module load, a file name reaching the DOM, and the bytes a slicer
  actually receives. A corrupt stored profile once white-screened the whole app and no
  unit test saw it.
- `bun run coupon.ts` writes `coupon.3mf` (gitignored), or a unique copy under `.slice/`
  when that file already exists: every joint of the default lane cut
  out of the real parts, plus pitch strips printed along X and along Y, in translucent PETG
  on smooth PEI (how the owner prints the lane), to print before the full lane.
- Geometry: `manifold-3d` (WASM) in a Web Worker. Viewer: three.js. ZIP: fflate.
- `ref.json` is a geometry snapshot generated from this codebase by `bun run ref`
  (`ref.ts`). `test/regress.test.ts` must stay green: every part within 0.01 % volume
  and 0.01 mm of its stored bounds. Those tolerances cover float noise across
  `manifold-3d` builds and nothing else. Change geometry on purpose → regenerate, then
  **read the diff**: every number that moved is a dimension you meant to move, and one
  you cannot explain is the bug. Never widen the tolerance to make the suite pass.
- The snapshot used to come from `cansys.py` (trimesh + shapely), an independent
  implementation, which made the test a cross-kernel parity check. That file was deleted
  on 2026-09-16; `git show python-reference:cansys.py` still has it. At the moment of
  the switch the two agreed to within 0.0225 % volume and 0.000 mm on bounds.

## Open questions
- `docs/open-questions.md` holds every parked concern and deferred decision: what is
  open, what the code does today, where it lives. Add to it when a decision is put off
  or a risk is accepted unverified. When one is settled, mark it resolved with the date
  and record the decision in this file, a spec or a code comment.

## Layout
- `src/model.ts` — product configuration, constants, dimensions and shared contracts.
- `src/kernel.ts` — `Geo` operations and scoped WASM shape ownership (`arena`). Feature
  modules import this layer and product contracts directly, never the composer.
- `src/queue.ts` — one queue geometry for capacity, minimum lane length and can positions;
  centres sit a radius normal to the sloping deck, with explicit stop and can clearance.
- `src/layout.ts` — pure tier, rear-load, deck-variant and joint layout rules.
- `src/assembly.ts` — shared part manifest and assembly placements. Geometry builders,
  quantities and the viewer consume explicit part sources rather than parsing names.
  Repeated geometry uses instances; large assembly previews sample at a labelled limit
  while capacity and manufacturing quantities stay complete.
- `src/geometry.ts` — parts. `solve()` derives every dimension from can + options;
  `laneOf(o,d,role)` the per-role numbers every plate shares (deck line, ties, tab
  positions); `buildDeck`, `buildWall`, `buildEndWall` in the lane frame, `layWall` /
  `layEndWall` to put them flat; `splitDeck`, `splitWall`, `buildLanePlates`, `buildLip`,
  `buildRiser`, `buildCover`, `buildAll`.
- `src/features/` — the pieces `geometry.ts` composes, each built at a local origin (x
  along the lane, y the wall's centreline, z = 0 at the deck underside) and placed with
  `.translate()` / `.mirror([0,1,0])`. `joints.ts`: every joint from one spec — `earJoint`,
  `pinJoint`, `crossLap`, `tSlotJoint`, `gangJoint`, `lipSnap`/`lipPocket`; `placeSide`
  puts a piece on either wall; `clearanceOf(o)` is the only spelling of `K.cl + o.fit`,
  `OVER` the only overshoot. `pose.ts`: `platePose` / `lipPose`, used by `lay` in geometry
  and stood back up in the viewer — one set of numbers. `lattice.ts` (cells, `ROWS`,
  `autoR`), `pocket.ts` (`recessDepth`, rounds), `gridfinity.ts` (`gridUnit`).
  `test/features.test.ts` holds every pair to "male inside female, shell = clearance".
  `teeProfile` accepts explicit dimensions; product joint wrappers supply defaults.
  Discrete lattice cells stay inside the actual panel contour; slats deliberately clip
  to their field components. Magnet pockets retain a supporting rim owned entirely by
  one half according to the actual T tongue/socket and fit clearance.
  Spec in `docs/superpowers/specs/2026-09-20-feature-library-design.md`.
- `src/solver.ts` — `fitSpace(space, base, {cascade})` → ranked layouts. Pure arithmetic.
  Lane length candidates are the longest that fits plus the shortest lane for every whole
  can count (`laneLengthFor`, the inverse of `solve()`'s deck count), so a lane never
  carries deck that holds no can. Hand room is `space.front`, a form field, not a constant:
  40 mm baked in once cost a 12-inch shelf its fourth can. Slope is the user's too.
- `src/export.ts` — mesh validation, shelf packer, binary STL and 3MF writer (Bambu
  plate grid + `model_settings.config`). `packPlan` shares geometry between rigid copy
  placements; `pack` materializes coordinates for compatibility. Validate actual mesh
  coordinates, topological vertex merges, winding and build volume at manufacturing
  boundaries. Do not weld coincident coordinates or silently remove zero-area faces.
- `src/estimate.ts` — resolves catalogue presets plus imported overrides into shell,
  infill, asymmetric skin and density settings. Missing values are explicit assumptions;
  approximate material use excludes supports, adhesion and purge. No universal print-time
  estimate is displayed: obtain time from the slicer.
- `src/worker.ts` — build, estimates and export off-thread; keeps unique meshes and a
  packed plan in `last` for export and settings-only re-estimation (do not transfer buffers).
- `src/validate.ts` — `LIMITS` + `readNumbers()`, the single gate for every number typed
  into the form or arriving in a shared hash. Reusable feature and manufacturing
  boundaries also validate their own contracts. New user dimension → new limit.
- `src/profile.ts` — the imported slicer profile, cached in `localStorage` as versioned
  base64 (`FORMAT_VERSION`). Bytes, not text: a BOM or a cp1252 config does not survive a
  decode/encode round trip. Every access is guarded — reading `localStorage` throws
  outright in Safari private browsing and sandboxed iframes, and this is a convenience
  that may never stop the page loading.
- `src/viewer.ts`, `src/main.ts` — UI. State in the URL hash. Design tokens in `styles.css`.
- `src/profiles.ts` — built-in print settings: printer → nozzle → process → filament out
  of `profiles/index.json`, which `bun run profiles` (`profiles.ts`) scrapes from the
  installed Bambu Studio's preset catalogue (`inherits` chains flattened). The composed
  `project_settings.config` mostly names presets: Bambu Studio 2.8 overwrites every value
  with the named system preset's and then selects it, except keys listed in
  `different_settings_to_system` (one `;`-joined list per preset: process, filament,
  printer), which survive as a "(modified)" preset. The Translucent checkbox rides on
  that with Bambu's own translucent-PETG demo values (`translucentOverrides`). Speeds
  are per extruder variant: one slot per entry of the process's `print_extruder_variant`
  (scraped into the index), and a scalar lands in slot 0 only, which on an H2D is the
  extruder the filament does not print from. `filament_extruder_variant` must not be
  written: the loader checks its length against `filament_self_index`. What it
  reads first, and the config must carry: `printer_model` (a BBL machine),
  `nozzle_diameter` with an `extruder_type` of the same length, and `filament_colour`,
  whose length is the filament count. Design notes in
  `docs/superpowers/specs/2026-09-17-print-settings-picker-design.md` and
  `2026-09-18-translucent-design.md`.
- The 3MF says `Application = BambuStudio-02.00.00.00`. Bambu's importer treats any other
  name as a third-party file and skips the settings entirely.

## Design rules that are not obvious from the code
- Flat-pack (2026-09-18): a lane is four plates — deck, two side walls, end wall — each
  modelled in the orientation it prints in, outer face up, and stood up only in the
  viewer. The rule every feature has to pass: it is in-plane (tab, notch, slot, T-slot,
  hex cell), grows up from the print face (rib, pin, boss), or is a pocket in the print
  face (recess, groove). Nothing on the bed face, nothing under an edge. A hole a tab
  passes through has to be in a plate it crosses face to face (the deck's ears, the
  cover); a notch in a plate's edge is through its thickness and locates X only.
  `test/overhang.test.ts` holds every snapshot part to it (no downward face flatter than
  45° off the bed; no exceptions since 2026-09-20, when the 56° gang dovetail went). This exists
  because regular hexes cannot be self-supporting in a standing wall — every orientation
  of a 120° hexagon has a ceiling edge at ≤ 30° — and Bambu at its 30° threshold supported
  all of them. Spec in `docs/superpowers/specs/2026-09-18-flat-pack-design.md`.
- One tab for every joint: 16 wide, 3 thick, flush with the plate's inner face (the bed
  side when it prints — flush with the outer face it would hang in the air). Walls stack
  on walls, full-height rectangles, so the lattice keeps its three rows end to end. The
  deck sits between them, IW wide, and puts a 24 × 6 × 4 mm ear under each wall with a
  closed slot in it; the wall notches over the ear inside its 5 mm border and drops a
  tab through the slot to the wall top below. That is what locates a wall in X and Y and
  carries the deck on the tier below. The first cut stood the wall on an OW-wide rail
  with a sloped bottom edge and lost a row of cells to it (+15 % volume); ears cost +6 %.
  Pins at ±px on the wall tops go into chambers in the wall above (X) and the cover's
  blind catches (X and Y). Ears go where the deck is solid, not in ties. The three numbers that
  keep an ear off a pin (`tabIn`, `tabClear`, `pinIn`) derive from `earW`, `tabW` and the
  pin's hooks; do not hand-tune them. Ears were 12 and tabs 8 until 2026-09-20.
- Snaps (2026-10-11; assembly target amended 2026-10-15): printed joints retain the
  assembly, but a loaded dispenser is moved with its bottom supported. No numeric
  load rating or lifting by the cover is established. One prong pair
  (`snapProfile` in `joints.ts`): `snapT` prongs at the tab's edges, a hook `snapCatch`
  past the mouth, freed by relief slots so the hook sits `snapLen` from the root (2.5 %
  strain in PETG). The wall-top pin catches in a chamber in the wall above (the pin grown
  by the clearance) or inside the cover's blind chamber. `coverThicknessOf(o)` includes
  the pin, clearance, a self-supporting 45° tent roof and outer skin; `K.coverT` remains
  the nominal pin/catch design dimension, not the finished cover thickness. The ear
  tab, the lip tab and the riser boss catch in a 45°
  `snapFlare` at the bottom of their slot, inside the deck, so nothing hangs below z = 0.
  A prong only flexes in the plane it printed in, so the riser prints on its side and the
  grid deck's bosses stay plain. Lattice cells touching a relief or chamber are dropped
  (walls ~63 % open, was 70 %). `tabClear` carries the hook: on the plain tab the end
  ear's notch and a chamber left a sliver loose at fit 0.3. The catch and the angles are
  unproven until the coupon prints. Spec in `docs/superpowers/specs/2026-10-11-snap-joins-design.md`.
- A head (T, dovetail) only locks when the tongue enters in its own plane: deck splice,
  gang tongue. A wall dropping onto a deck gets a straight tab; two standing plates get
  a cross-lap. The hidden wall and cover seam keys assemble along X before either
  joined plate is lowered onto its catches. The original all-drop-in restriction is
  superseded for these concealed printed keys (owner, 2026-10-15). Earlier spec in
  `docs/superpowers/specs/2026-09-20-drop-in-joints-design.md`.
- Cascade: tiers alternate 180° about Z. Upper decks lose one can-length to the drop
  chute (`inset = canD + 6 + wall`); the bottom deck runs full length to the end-lip.
  Reversed tiers use Y-reflected deck variants before rotating. The row's left/right
  choices are world sides, including when the same mid role appears in both hands;
  every internal row connection remains tongue into socket.
- High-end wall is full height only when a tier sits above it (it closes that tier's
  chute). `top=true` lanes get a 20 mm loading lip instead. Flat layouts use `top` lanes.
  It stands `post` (3 mm) in from the lane end on the flattened deck and cross-laps the
  side walls: slotted from its bottom edge up `lap` (12) over the side wall band, OW
  wide above that with posts to full tier height whatever the lip; the side wall is
  slotted from its top edge down to the same line, closed behind by its own post. The
  end wall drops in after the walls: X from the side wall's slot, the side walls' Y
  from its body and the deck ears, and printed deck catches retain it vertically even
  without a cover. `laneXe` is the one place its x lives (the viewer uses it too).
  `o.stackable` ("Join on top", 2026-10-11, off by default) gives a cascade's top the full
  wall, so a tier can go on it later, and keeps it even with `rearLoad` (`check()` says
  so). A flat stack keeps the same end-wall shape. When that stack is uncovered,
  the option retains its top pins and reserves `snapTop(o)` headroom for a future tier.
- Load from the back (`o.rearLoad`, 2026-09-29, off by default): one tier, `rearTier(o)`,
  prints without its end wall - the only tier, or the top of a stack (a cascade's lower
  tiers fill through it; a flat stack's still load from the front). A cascade's top faces the back on an odd tier count only; on an even one
  its back is the chute, nothing opens and `check()` says so. It is a part count, not a
  shape: the shared assembly manifest omits that instance for both geometry and viewer;
  the manifest selects closed corner variants where no end wall is installed. This
  supersedes the empty-notch acceptance of 2026-09-30. A flat stack opens its top tier
  only; every tier from the back would need per-tier parts, and nobody needs it. A can
  fills the tier over the deck there (~3 mm spare), so no stop, strip or bar fits.
- Long lanes split at x=0. The deck has an in-plane T-slot (`tSlot`: a 30-wide neck 3
  deep, a 40-wide head to 8); the halves drop together in Z and the head locks X. The
  wall and cover halves slide along X onto hidden printed seam keys, seating their
  visible edges before the joined plates snap down. Key channels use self-supporting
  diamond profiles; the key's central taper/collar seats the halves rather than
  relying on clearance alone to align the frame. Join the walls before snapping them
  onto the deck, and join the cover halves before lowering them onto the wall pins.
  Deck dovetails until 2026-09-20. Half-laps are gone: a lap printed face-up is
  a 10 mm cantilever.
- Honeycomb: regular pointy-top cells; printed flat they are vertical holes, which is
  the whole point of the flat-pack. Only whole cells are cut, centred in the panel; a
  cell touching a keep-out (splice, end notch) is dropped, not clipped, so
  every hole is the same shape and the solid bands read as intended. `hexAuto` sizes the radius so three rows fill the
  upper-deck wall; the ligament follows the radius (`ligFor`). The high-end wall gets the
  same lattice and recess. The standard cover is a grille with its own radius (three
  whole rows fill its field, bars half the radius) — it used to borrow the wall's and
  lost a row whenever that changed — and only the seam band clips cells, so the pattern
  carries across the joint.
- Pattern (2026-09-18): `o.pattern` (hex, circle, kumiko, slat, breeze) picks the cell
  shape and nothing else; `cellsOf` dispatches, `cells` in `features/lattice.ts` is the field/keep-out
  loop with the shape passed in, `ROWS` says how far three rows span (`a·R + b·lig`) so
  `autoR` and the cover radius work for every shape. `hexR`/`hexAuto` keep their names
  and mean cell radius. Every pattern but hex starts the wall field at the ear-pad top
  (`fieldBottom`): a square edge or a chord would bridge a notch where a hexagon only
  lands a tip; hex stays at the border so its snapshot did not move. Slats cannot be
  dropped whole, so they are cut per component of `panel − keep` and skip anything under
  4R wide — that is what keeps the splice band solid. Slat cover takes the
  whole-row path on both designs. Spec in
  `docs/superpowers/specs/2026-09-18-pattern-axis-design.md`.
  Outer wall face is recessed to a 3.5 mm web (1.7 minimal), a pocket with vertical
  sides inside a frame: the border stays full thickness all round, and along the bottom
  the frame runs `padRise` above the ear notches so every notch and tab root sits in
  full-thickness wall. The end wall is framed the same way. Until 2026-09-24 the recess
  ran down through the bottom border with a pad over each notch: eleven posts along the
  edge (`test/pattern.test.ts`). The frame put the default job up 1.7 % in volume and
  minimal 6 % (it costs the thin web more), which is why `test/regress.test.ts` allows
  minimal/standard lane volume up to 0.62 top and 0.58 bottom (was 0.6 / 0.55; accepted
  2026-09-30).
  In the minimal deck the fin-to-wall strip keeps an ear-high
  plinth under each ear: rooted by 1 mm inside a 2.5 mm tie, the tab hole took all of
  it and the ears printed loose (`test/islands.test.ts`). Under a gang tongue it is 3 mm
  wider a side: the neighbour's socket is cut through it, and the ~5.75 mm arms beside
  the head hold the row in Y (`test/gang.test.ts`). Deck centre band is open with
  cross-ties, not honeycomb — a hex core prints 100 % dense and weighs more.
  Tie bands merge when they overlap: an interior tie can land inside the splice band,
  and unmerged its far edge started the next opening 1.6 mm behind the seam — the
  tongue's whole root (`test/splice.test.ts`).
- Gang joint (2026-09-20, was a 56° dovetail rib on the walls): the deck carries it, since
  nothing on a wall face can lock Y without an undercut. Tongues run out of the +Y rail
  under both walls into T sockets cut through the neighbour's rail (`gangJoint`: ear-wide
  run and neck, `gangHead` 30 head, the splice depths). They go *between* the ears
  (`laneOf`'s `tongues`, from `tonguesOf`): one in the middle of every stretch of rail
  clear of the ears (an ear width + 4 mm), the pins, the seam and the lip pockets. Both
  walls notch over a tongue (`gangJoint`'s `notch`, the ear's pocket without the tab) and
  it stands on both wall tops below. Every deck keeps an ear under both walls at every
  tab. Until 2026-09-22 the tongue took the +Y ear's place and the −Y ear became the
  socket: every deck's −Y edge hung off the one lip-end ear, and the row's end lane had
  nothing under its −Y wall at four tabs of five. Decks set down onto each other; head
  locks Y, neck locks X. Wall variants omit unused exterior tongue notches; the
  manifest accounts for final world side and tier rotation. A ganged deck is
  `gangReach` (gap + wall + 8) wider on its tongue side; `plateY` charges the widest
  deck. The row's outer sides are the user's (`o.left`, `o.right`:
  tongue, socket or none, 2026-10-11, default tongue and socket), so separately printed
  units join on the left and right; the inner joints stay tongue into socket. A row whose
  ends differ from that prints `deck-left-end` / `deck-right-end` (`deckKinds`; lane 0 is
  the -Y end, as in the viewer), which reverses the 2026-09-30 call against an end deck.
  Expansion features remain only on selected outer edges. The solver charges every outer
  tongue (`rowWidth`, 14 mm each), may use half the 4 mm side gap for it, and refuses a
  shelf a lone lane's stub does not fit; the default 300 mm shelf keeps two lanes. Below
  about 265 mm a lane can have no clear stretch (split halves from 292); `check()` warns
  that such lanes stand loose. Only when `gangs(o)`: some edge has a tongue or socket,
  and not on a grid (`test/gang.test.ts`). Spec in
  `docs/superpowers/specs/2026-09-20-sliding-slot-joints-design.md`.
- Two designs, `o.design`, and `solid` overrides both. Minimal keeps every joint and
  `solve()` — same `gangPitch`, same layouts, gangs with standard lanes — and changes
  only the `!o.solid` block: web 1.7 mm, 2.5 mm deck fins at the inner edge of the
  standard rail with the strip to the wall open, 2.5 mm ties and end ties, the cover a
  perforated sheet (1.5× the grille radius, ligament bars, clipped at the frame). Solid
  volume is 0.56–0.60 of standard on lanes; the filament model says about −17 % because
  what is left is thin and prints dense. Spec in `docs/superpowers/specs/2026-09-18-minimal-design.md`.
- Filament estimates (updated 2026-10-15): `estimateVolume` in `src/estimate.ts`
  samples perimeters, infill and distinct top/bottom skins using resolved profile settings.
  Changing or clearing a profile recalculates material use from cached meshes. Missing
  values use stated reference assumptions (3 walls, 6 % infill, 1 mm skins, density 1.27).
  The legacy `filamentGrams` helper remains for reference scripts and snapshots; the
  solver's layout-card `laneGrams` / `coverGrams` remain rough reference estimates.
- Print hours (resolved 2026-10-15): removed the UI's universal `JOB_FLOW` time estimate.
  Historical P2S measurements remain in dated specs; `bun run slice.ts` still measures
  actual slicer time and reports an implied flow for comparison, not a UI prediction.
- Rounding: manifold has no fillet. `roundTop` in `features/pocket.ts` keeps the lower
  body with a half-space and rounds its top using slabs of the inset outline, preserving
  arbitrary translation. Side- and end-wall tops stay square so the frame remains
  straight and stacked interfaces have no rounded groove. Terminal wall variants omit
  exposed pins when neither a cover nor future top expansion is selected. No bed edge
  is rounded.
- Every clearance gets `fit` added. Don't add per-joint tolerance knobs.
- Bambu plates: `cols = ceil(sqrt(n))`, stride = bed × 1.2, rows toward −Y
  (`compute_colum_count` / `compute_origin` in BambuStudio `PartPlate.cpp`). Objects are
  baked into place at serialization from shared meshes and rigid placements; the config
  declares each plate and its objects.
- `pack()` is shelf packing with first fit across *every* plate opened so far, not just
  the newest, and each part is tried flat then turned 90°. That is what drops an end-lip
  or an end wall into the strip behind a deck instead of giving it a plate of its own. A
  shelf's height is set by the part that opens it and never grows — parts arrive sorted
  by Y extent descending, so growing it packs nothing tighter. Then everything is
  centred: each shelf across the bed on its own width, the stack front to back, and each
  part on its shelf's centreline. `bedMargin` stays a hard floor; centring only adds.
  The X1 and P1 series keep an 18 × 28 mm front-left corner (`bed_exclude_area`, scraped
  into the index as `excludeArea`, read back by `keepOutFromConfig`) and Bambu refuses a
  plate with a part within reach of it. The packer keeps every part `bedMargin` clear of
  it: it packs uncentred with the keep-out in place, tries the four corners the keep-out
  could fall in and keeps the fewest plates, and centring moves a part only as far as
  it stays clear. A 240 mm part cannot pass beside the corner on a 256 bed, so the
  default job is 20 plates there, not 18 (`test/pack.test.ts`).
- `o.base`: flat (default, the lane sits on the shelf), feet, or gridfinity. A riser is a
  wall-thick foot under ±px with a boss into the wall's bottom notch. Gridfinity
  (2026-09-19): the shelf lane's deck grows a 7 mm unit below z = 0 - a floor of whole
  42 mm cells with the spec foot proud under every cell (hulled so the 45° chamfers are
  exact; the upper chamfers run on through the 2.25 mm floor and clip flat at z = 0, so
  the merged run-ons are the floor and no underside is flat) and the riser's boss at
  ±px; the walls stand on the floor. It drops into whatever baseplate the user has; we
  do not make one (a cut did, pockets and all - it made the lane not a bin, and on a
  narrow shelf was a slab). Feet only on the deck's bed face: the one face of the lane
  that prints the way a bin does. `PartSet.gridDeck` replaces that role's deck in the
  worker. `o.shelfCells` (the solver sets it, `floor(depth / 42)`, `floor(width / 42)`)
  caps `d.floorCells`, the cells that cover the lane: fewer, and the lane overhangs its
  feet on a skirt, solid down to the shelf beside the baseplate (a 138 mm lane on 3
  cells in a 150 mm shelf; the baseplate must end at those cells on that side).
  `o.across` / `o.along` (left, centre, right / front, centre, back) say which edge of
  its floor the lane is flush with, the spare going opposite. Lanes go a floor apart
  (`gangPitch = max(floorCells·42, OW + 0.5)`: a skirted lane on fewer cells than cover
  it falls back to its own width), gang joint off. `d.foot` (lane ∪ floor) is what
  stands on the shelf, fits the bed and splits at x = 0 - through a foot as often as
  not; a foot cut square prints as it is and the pocket locks it. `o.magnets` cuts
  6.5 × 2.4 pockets on the 26 mm square in every foot, skipping any the seam would
  divide between printed parts, including the supporting rim at a T boundary: the one bridged ceiling `test/overhang.test.ts` allows. `baseHeight()` is 7,
  what the solver charges. Spec in `docs/superpowers/specs/2026-09-19-gridfinity-base-design.md`.
  The Gridfinity standard itself (pitch, foot and socket profiles, lip, magnet pockets,
  sources) is digested in `docs/gridfinity-spec.md`, with a column mapping each number to
  its `K` constant. Read it before touching a grid dimension; if it and `K` disagree, one
  of them is wrong and both get fixed in the same commit.

## Conventions
- Units mm, Z up, front of a lane = −X (lip end), high end = +X.
- Keep the UI copy plain: "Grab from", "Load from", verbs on buttons.
- Change `src/geometry.ts`, then `bun run ref` in the same commit, so the snapshot diff
  and the code that caused it are reviewed together.
