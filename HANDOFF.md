# Handoff — 2026-09-16

## State
Working, tested, builds to `dist/`. 13 regression tests pass. Verified in headless
Chromium: form → layouts → worker build (~1.2 s) → assembly/part/plate views →
3MF + STL downloads. The 3MF was read back with trimesh: 30 objects, all watertight,
all inside Bambu's 4×4 plate grid.

## Decisions already made (see CLAUDE.md for the why)
- Client-only static site for GitHub Pages; `.github/workflows/pages.yml` runs test + build.
- Lane variants: `lane-bottom`, `lane-mid`, `lane-top` (cascade) / `lane` (flat); all split
  into `-front`/`-rear` halves when longer than the bed.
- Defaults: 12 oz can, 480 mm lane, wall 6, slope 3°, hex R9 / ligament 1.7, cover on, feet off.
- Solver offers up to two flat and two cascade layouts; flat wins on count, cascade on convenience.

## Known gaps / next steps, in order
1. Print plate 13 (lips) and one `lane-rear` before anything else — the `fit` slider exists
   because tolerance is the #1 complaint on every comparable model.
2. `project_settings.config` import: let the user drop a 3MF saved from their slicer and
   copy its config into the export so it opens with their profile (HueForge does this).
3. Mixed-width ganging (slim + standard side by side): solver change, dovetail height only.
4. Odd cascade tier counts load from the back; either warn harder or offer a "loader slot" cover.
5. Packing: `maxrects-packer` with rotation would tighten plates 9–13.
6. Footer link placeholder → real repo URL.

## Not done on purpose
- No side-printed lane variant (thin-sheet, lighter) — conflicts with upright honeycomb; a
  separate part architecture if ever attempted.
- No OpenSCAD port for MakerWorld's Parametric Model Maker (`mw_plate_N()`); separate project.

## Start here
    bun install && bun test && bun run build.ts
Then open `dist/index.html` via any static server and try: 300 × 520 × 240, 12 oz.
