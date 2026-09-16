# Handoff — 2026-09-16

## State
Working, tested, builds to `dist/`. 58 tests pass: 45 unit (`bun test test/`) + 13 browser (`bun run test:ui`). Verified in
headless Chromium: form → layouts → worker build (~1.2 s) → assembly/part/plate views →
3MF + STL downloads. The 3MF was read back with trimesh: 30 objects, all watertight,
all inside Bambu's 4×4 plate grid.

Repo lives at `GoogilyBoogily/can-i-store-it`, **private**. Pages is not enabled, so the
`deploy` job of `pages.yml` fails on every push by design; `build` is the green one that
matters. Enable Pages (needs a public repo on the free plan) to make deploy go green.

## Decisions already made (see CLAUDE.md for the why)
- Client-only static site for GitHub Pages; `.github/workflows/pages.yml` runs test + build.
- Lane variants: `lane-bottom`, `lane-mid`, `lane-top` (cascade) / `lane` (flat); all split
  into `-front`/`-rear` halves when longer than the bed.
- Defaults: 12 oz can, 480 mm lane, wall 6, slope 3°, hex R9 / ligament 1.7, cover on, feet off.
- Solver offers up to two flat and two cascade layouts; flat wins on count, cascade on convenience.

## Known gaps / next steps, in order
1. Print plate 13 (lips) and one `lane-rear` before anything else — the `fit` slider exists
   because tolerance is the #1 complaint on every comparable model.
2. Mixed-width ganging (slim + standard side by side). Bigger than it looks: `gangPitch`
   at `geometry.ts:81` derives from a single `canD`/`canL`, so this wants a second can
   spec threaded through `solve()`, not just a dovetail-height change.
3. Odd cascade tier counts load from the back; either warn harder or offer a "loader slot" cover.
4. Packing: `maxrects-packer` with rotation would tighten plates 9–13.

## Done since last handoff
- `project_settings.config` import: drop a 3MF from your slicer, `extractProfile()` lifts
  `Metadata/project_settings.config`, it rides into the export so it opens with your
  profile. Kept in `localStorage` under `cansys.profile`, not the hash — tens of KB, and
  the hash is the shareable part. Bed size is deliberately *not* autofilled from it.
- `threeMf()` takes `{ single?, profile? }` instead of a positional `single` boolean.
- Footer link now points at the real repo.
- `pages.yml` had a `${{ }}` inside a YAML flow mapping, so the workflow never parsed and
  every run died in 0 s with no logs. Block form now.

## Not done on purpose
- No side-printed lane variant (thin-sheet, lighter) — conflicts with upright honeycomb; a
  separate part architecture if ever attempted.
- No OpenSCAD port for MakerWorld's Parametric Model Maker (`mw_plate_N()`); separate project.

## Start here
    bun install && bun test && bun run build.ts
Then open `dist/index.html` via any static server and try: 300 × 520 × 240, 12 oz.
