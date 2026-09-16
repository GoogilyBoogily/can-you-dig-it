# cansys-web

Browser-only configurator for 3D-printable can storage. User enters shelf W×D×H,
can Ø×L, printer bed; gets a Bambu/Orca multi-plate 3MF or STL zip. No server.

## Stack and commands
- Bun + TypeScript. `bun install`, `bun test`, `bun run build.ts` → `dist/` (static, GitHub Pages).
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
- `ref.json` holds volumes/bounds from the Python reference `cansys.py` (trimesh + the
  same manifold kernel). `test/regress.test.ts` must stay green: every part within 1 %
  volume and exact bounds. If you change geometry on purpose, change `cansys.py` the
  same way and regenerate `ref.json`; never loosen the tolerance.

## Layout
- `src/geometry.ts` — parts. `solve()` derives every dimension from can + options;
  `buildLane(g,o,d,bottom,top)`, `splitLane`, `buildLip`, `buildRiser`, `buildCover`, `buildAll`.
- `src/solver.ts` — `fitSpace(space, base, {cascade})` → ranked layouts. Pure arithmetic.
- `src/export.ts` — shelf packer, binary STL, 3MF writer (Bambu plate grid + `model_settings.config`).
- `src/worker.ts` — build + export off-thread; keeps `last` for export (do not transfer buffers).
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
- Prefer editing `cansys.py` and `src/geometry.ts` together.
