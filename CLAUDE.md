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
  `buildLane(g,o,d,bottom,top)`, `splitLane`, `buildLip`, `buildRiser`, `buildCover`, `buildAll`.
- `src/solver.ts` — `fitSpace(space, base, {cascade})` → ranked layouts. Pure arithmetic.
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

## Design rules that are not obvious from the code
- Cascade: tiers alternate 180° about Z. Upper decks lose one can-length to the drop
  chute (`inset = canD + 6 + wall`); the bottom deck runs full length to the end-lip.
- High-end wall is full height only when a tier sits above it (it closes that tier's
  chute). `top=true` lanes get a 20 mm loading lip instead. Flat layouts use `top` lanes.
- Long lanes split at x=0: rear half carries a deck dovetail tongue + outer wall
  half-laps; front half has the socket + inner laps. Slides together vertically, no glue.
- Honeycomb: wall cells are stretched √3 so ligaments are vertical and peaks are 45°
  (self-supporting). Cells cut by the top edge are dropped (flat-topped hole = bridge).
  Outer wall face is recessed to a 3.5 mm web with a 45° ceiling. Deck centre band is
  open with cross-ties, not honeycomb — a hex core prints 100 % dense and weighs more.
- Every clearance gets `fit` added. Don't add per-joint tolerance knobs.
- Bambu plates: `cols = ceil(sqrt(n))`, stride = bed × 1.2, rows toward −Y
  (`compute_colum_count` / `compute_origin` in BambuStudio `PartPlate.cpp`). Objects are
  baked into place; the config is belt-and-braces.
- Feet (risers) are optional and off; the lane sits flat on the shelf.

## Conventions
- Units mm, Z up, front of a lane = −X (lip end), high end = +X.
- Keep the UI copy plain: "Grab from", "Load from", verbs on buttons.
- Change `src/geometry.ts`, then `bun run ref` in the same commit, so the snapshot diff
  and the code that caused it are reviewed together.
