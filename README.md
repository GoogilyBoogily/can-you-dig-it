# can-you-dig-it

Printable can storage, sized to your shelf. Enter the space, the can, and your
printer bed; get a multi-plate 3MF (Bambu Studio / Orca) or an STL zip with every
part placed. Runs entirely in the browser: geometry on the
[manifold-3d](https://github.com/elalish/manifold) WASM kernel in a Web Worker,
viewer in three.js, no server.

    bun install
    bun test            # unit + geometry regression against ref.json
    bun run ref         # regenerate ref.json after a deliberate geometry change
    bun run build.ts    # → dist/  (static; open dist/index.html or serve it)
    bun run dev         # build + local server

Deploys to GitHub Pages from `main` via `.github/workflows/pages.yml`
(Settings → Pages → Source: GitHub Actions).

## Layout

    src/geometry.ts   parts: lanes (upper / bottom, split halves), lip, risers, cover
    src/solver.ts     shelf W×D×H + can → ranked layouts (pure arithmetic)
    src/export.ts     plate packing, binary STL, Bambu multi-plate 3MF
    src/worker.ts     runs geometry + export off the UI thread
    src/viewer.ts     three.js: parts, assembled stack with cans, individual plates
    src/main.ts       form → solver → worker → viewer / downloads; state in the URL hash
    ref.ts            builds ref.json: volumes/bounds pinned by test/regress.test.ts

## The parts

- **lane** (upper tiers): sloped deck, patterned walls (honeycomb, circles, kumiko, slats or breeze block), open drop chute at the low end.
  Alternate tiers are rotated 180° so cans cascade down when you pull one.
- **lane-bottom**: full-length deck, stops at the **end-lip**.
- Lanes longer than the bed split into **-front** / **-rear** halves joined by a deck
  dovetail tongue and wall half-laps; slide together vertically, no glue.
- **riser-08 / -24**: peg-and-socket feet; stack for height.
- **cover**: grille top in the same pattern so the stack is a shelf, with a can-sized window over the
  top tier's high end. That is where cans go in: drop one through, it rolls to the chute.

Lateral dovetails at the lane ends gang lanes side by side. Pegs on the wall tops
locate the tier above. One `fit` value is added to every clearance.

## 3MF layout

Plates follow Bambu Studio's own grid (`compute_colum_count` = ceil√n columns,
stride = bed × 1.2, rows toward −Y) and are declared in
`Metadata/model_settings.config`, so the file opens with parts already on plates.
Load a project 3MF saved from your slicer and its `project_settings.config` rides into the export, so the file opens on your printer and filament. Import nothing and the slicer's own defaults apply.

## Known gaps, in order

1. Print plate 13 (the lips) and one `lane-rear` before anything else. The `fit` slider
   exists because tolerance is the #1 complaint on every comparable model, and nothing
   here has been checked against a real printer yet.
2. Mixed-width ganging (slim + standard side by side). Bigger than it looks: `gangPitch`
   in `src/geometry.ts` derives from a single `canD`/`canL`, so this wants a second can
   spec threaded through `solve()`, not just a dovetail-height change.
3. Odd cascade tier counts put the cover window at the back. Warn harder, or let the
   shelf depth pick an even count.
4. Packing is a shelf sort. `maxrects-packer` with rotation would tighten plates 9–13.

Two things left undone on purpose: no side-printed lane variant (thin-sheet, lighter —
it conflicts with upright honeycomb, and would be a separate part architecture), and no
OpenSCAD port for MakerWorld's Parametric Model Maker.
