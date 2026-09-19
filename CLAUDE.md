# can-you-dig-it

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
- Two suites. `bun test test/` is the fast unit one (no browser, ~0.5 s) and is what CI
  gates on. `bun run test:ui` drives `test-ui/` in Playwright against a real build; it
  needs `bunx playwright install chromium` once, and runs as its own CI job so a flaky
  browser can't block a deploy. Keep the trailing slashes — `bun test test` also matches
  `test-ui/`.
- The UI suite exists for what unit tests structurally cannot reach: state read from
  `localStorage` at module load, a file name reaching the DOM, and the bytes a slicer
  actually receives. A corrupt stored profile once white-screened the whole app and no
  unit test saw it.
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

## Layout
- `src/geometry.ts` — parts. `solve()` derives every dimension from can + options;
  `laneOf(o,d,role)` the per-role numbers every plate shares (deck line, ties, tab
  positions); `buildDeck`, `buildWall`, `buildEndWall` in the lane frame, `layWall` /
  `layEndWall` to put them flat; `splitDeck`, `splitWall`, `buildLanePlates`, `buildLip`,
  `buildRiser`, `buildCover`, `buildAll`.
- `src/solver.ts` — `fitSpace(space, base, {cascade})` → ranked layouts. Pure arithmetic.
  Lane length candidates are the longest that fits plus the shortest lane for every whole
  can count (`laneLengthFor`, the inverse of `solve()`'s deck count), so a lane never
  carries deck that holds no can. Hand room is `space.front`, a form field, not a constant:
  40 mm baked in once cost a 12-inch shelf its fourth can. Slope is the user's too.
- `src/export.ts` — shelf packer, binary STL, 3MF writer (Bambu plate grid + `model_settings.config`).
- `src/worker.ts` — build + export off-thread; keeps `last` for export (do not transfer buffers).
- `src/validate.ts` — `LIMITS` + `readNumbers()`, the single gate for every number typed
  into the form or arriving in a shared hash. Nothing downstream re-checks, so a value
  past here reaches the solver and the WASM kernel unexamined. New dimension → new limit.
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
  viewer. The rule every feature has to pass: it is in-plane (tab, notch, slot, dovetail,
  hex cell), grows up from the print face (rib, pin, boss), or is a pocket in the print
  face (recess, groove). Nothing on the bed face, nothing under an edge. A hole a tab
  passes through has to be in a plate it crosses face to face (the deck's ears, the
  cover); a notch in a plate's edge is through its thickness and locates X only.
  `test/overhang.test.ts` holds every snapshot part to it (no downward face flatter than
  45° off the bed; the dovetail flanks lean 56° and are the one exception). This exists
  because regular hexes cannot be self-supporting in a standing wall — every orientation
  of a 120° hexagon has a ceiling edge at ≤ 30° — and Bambu at its 30° threshold supported
  all of them. Spec in `docs/superpowers/specs/2026-09-18-flat-pack-design.md`.
- One tab for every joint: 8 wide, 3 thick, flush with the plate's inner face (the bed
  side when it prints — flush with the outer face it would hang in the air). Walls stack
  on walls, full-height rectangles, so the lattice keeps its three rows end to end. The
  deck sits between them, IW wide, and puts a 12 × 6 × 4 mm ear under each wall with a
  closed slot in it; the wall notches over the ear inside its 5 mm border and drops a
  tab through the slot to the wall top below. That is what locates a wall in X and Y and
  carries the deck on the tier below. The first cut stood the wall on an OW-wide rail
  with a sloped bottom edge and lost a row of cells to it (+15 % volume); ears cost +6 %.
  Pins (2.4 mm tabs) at ±px on the wall tops go into notches in the wall above (X) and
  the cover's holes (X and Y). Ears go where the deck is solid, not in ties.
- Cascade: tiers alternate 180° about Z. Upper decks lose one can-length to the drop
  chute (`inset = canD + 6 + wall`); the bottom deck runs full length to the end-lip.
- High-end wall is full height only when a tier sits above it (it closes that tier's
  chute). `top=true` lanes get a 20 mm loading lip instead. Flat layouts use `top` lanes.
  It stands on the deck end, flattened for the last `wall` mm, with a tab down through
  the deck and one each side into a bottom-edge notch of the side walls, so a tier
  assembles top down.
- Long lanes split at x=0 with in-plane dovetails on the deck and on each wall (the wall
  halves slide together in Y before they go on the deck). Half-laps are gone: a lap
  printed face-up is a 10 mm cantilever.
- Honeycomb: regular pointy-top cells; printed flat they are vertical holes, which is
  the whole point of the flat-pack. Only whole cells are cut, centred in the panel; a
  cell touching a keep-out (dovetail, splice, end notch) is dropped, not clipped, so
  every hole is the same shape and the solid bands read as intended. `hexAuto` sizes the radius so three rows fill the
  upper-deck wall; the ligament follows the radius (`ligFor`). The high-end wall gets the
  same lattice and recess. The standard cover is a grille with its own radius (three
  whole rows fill its field, bars half the radius) — it used to borrow the wall's and
  lost a row whenever that changed — and only the seam band clips cells, so the pattern
  carries across the joint.
- Pattern (2026-09-18): `o.pattern` (hex, circle, kumiko, slat, breeze) picks the cell
  shape and nothing else; `Geo.cellsOf` dispatches, `Geo.cells` is the field/keep-out
  loop with the shape passed in, `ROWS` says how far three rows span (`a·R + b·lig`) so
  `autoR` and the cover radius work for every shape. `hexR`/`hexAuto` keep their names
  and mean cell radius. Every pattern but hex starts the wall field at the ear-pad top
  (`fieldBottom`): a square edge or a chord would bridge a notch where a hexagon only
  lands a tip; hex stays at the border so its snapshot did not move. Slats cannot be
  dropped whole, so they are cut per component of `panel − keep` and skip anything under
  4R wide — that is what keeps the splice and dovetail bands solid. Slat cover takes the
  whole-row path on both designs. Spec in
  `docs/superpowers/specs/2026-09-18-pattern-axis-design.md`.
  Outer wall face is recessed to a 3.5 mm web, a pocket with vertical sides, down
  through the bottom border, with pads left over every ear notch (the notch's own width,
  so ear and pad read as one post) and the end-wall notch. The
  dovetail bands stay full: the −Y face needs 3 mm behind its groove, and the +Y recess
  cut runs 1 mm past the face and would sever the rib. Gang dovetails, their bands and
  grooves exist only when `lanesWide > 1`; a lone lane's outer faces are flat
  (`test/gang.test.ts`). In the minimal deck the fin-to-wall strip keeps an ear-high
  plinth under each ear: rooted by 1 mm inside a 2.5 mm tie, the tab hole took all of
  it and the ears printed loose (`test/islands.test.ts`). Deck centre band is open with
  cross-ties, not honeycomb — a hex core prints 100 % dense and weighs more.
  Tie bands merge when they overlap: an interior tie can land inside the splice band,
  and unmerged its far edge started the next opening 1.6 mm behind the seam — the
  tongue's whole root (`test/splice.test.ts`).
- Two designs, `o.design`, and `solid` overrides both. Minimal keeps every joint and
  `solve()` — same `gangPitch`, same layouts, gangs with standard lanes — and changes
  only the `!o.solid` block: web 1.7 mm, 2.5 mm deck fins at the inner edge of the
  standard rail with the strip to the wall open, 2.5 mm ties and end ties, the cover a
  perforated sheet (1.5× the grille radius, ligament bars, clipped at the frame). Solid
  volume is about half; the filament model says −23 % on lanes because what is left is
  thin and prints dense. Spec in `docs/superpowers/specs/2026-09-18-minimal-design.md`.
- `filamentGrams` has skins: the core is what sits inside the perimeters with 1 mm of
  material above and below. Without them a 2.4 mm plate read as 6 % infill.
- Rounding: manifold has no fillet. `Geo.roundTop` intersects a part with a stack of
  slabs of its outline shrunk by the fillet inset, which follows the plan corners. Walls
  and end walls round the outer top edge only (`Geo.roundOver`), so the 3 mm seat the
  next tier sits on stays flat and nothing is rounded on a bed edge. No plan radius: it
  cannot span two plates.
- Every clearance gets `fit` added. Don't add per-joint tolerance knobs.
- Bambu plates: `cols = ceil(sqrt(n))`, stride = bed × 1.2, rows toward −Y
  (`compute_colum_count` / `compute_origin` in BambuStudio `PartPlate.cpp`). Objects are
  baked into place; the config is belt-and-braces.
- `pack()` is shelf packing with first fit across *every* plate opened so far, not just
  the newest, and each part is tried flat then turned 90°. That is what drops an end-lip
  or an end wall into the strip behind a deck instead of giving it a plate of its own. A
  shelf's height is set by the part that opens it and never grows — parts arrive sorted
  by Y extent descending, so growing it packs nothing tighter. Then everything is
  centred: each shelf across the bed on its own width, the stack front to back, and each
  part on its shelf's centreline. `bedMargin` stays a hard floor; centring only adds.
- `o.base`: flat (default, the lane sits on the shelf), feet, or gridfinity. A riser is a
  wall-thick foot under ±px with a boss into the wall's bottom notch. Gridfinity
  (2026-09-19): a **baseplate** part for the shelf, not feet on the lane - standard 42 mm
  pockets (2.15 / 1.8 / 0.7, 4.65 deep, r4 rim, hulled so the 45° chamfer is exact) in
  every cell clear of the lanes, and under the gang a solid pad flush with the rim
  carrying the riser boss at every lane's ±px and a 1 mm pocket for the lip's tabs.
  Lane parts are the flat lane's, untouched; gang dovetails stay. `o.baseCells` is the
  cells the shelf takes (the solver sets it: `floor(depth / 42)`, `floor(width / 42)`);
  `d.plate` is that grown to the pad when a lane is bigger than the cells (a 150 mm
  shelf under a 138 mm lane is all pad), placed round the pad by `o.across` / `o.along`
  (left, centre, right / front, centre, back: which edge the pad is flush with, so the
  free cells gather on the other side). `o.magnets` puts a 3.2 mm floor under the
  pockets with 6.5 × 2.4 pockets on the 26 mm square in every free cell; `baseHeight(o)`
  is 4.65 or 7.85 and is what the solver charges. Tiles at cell lines to fit the bed,
  keyed with the deck's dovetail wherever a cut runs through solid - at a cell line the
  rim is a knife edge, so through pockets tiles just butt and the lane across the seam
  holds them; a band round each crossing cut keeps a tongue from being cut in two. The
  first cut of this feature grew feet on the bottom deck (a bin); it needed a shelf at
  least as wide as the cells covering the lane, and a lane overhanging a narrower
  floor blocked the cells beside it. Spec in
  `docs/superpowers/specs/2026-09-19-gridfinity-base-design.md`.

## Conventions
- Units mm, Z up, front of a lane = −X (lip end), high end = +X.
- Keep the UI copy plain: "Grab from", "Load from", verbs on buttons.
- Change `src/geometry.ts`, then `bun run ref` in the same commit, so the snapshot diff
  and the code that caused it are reviewed together.
