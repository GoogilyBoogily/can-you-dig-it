# can-you-dig-it

Printable can storage, sized to your shelf. Enter the space, the can, and your
printer bed; get a multi-plate 3MF (Bambu Studio / Orca) or an STL zip with every
part placed. Runs entirely in the browser: geometry on the
[manifold-3d](https://github.com/elalish/manifold) WASM kernel in a Web Worker,
viewer in three.js, no server.

    bun install
    bun test test/      # unit + geometry regression against ref.json
    bun run test:ui     # Playwright against a real build (bunx playwright install chromium once)
    bun run check       # tsc: the only type check, the bundler doesn't read types
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

Every lane is four flat plates, each printed outer face up and stood up only when you
assemble it. That's what lets the wall patterns print as straight vertical holes with
no supports.

- **deck**: the sloped floor. An ear under each wall with a slot in it.
- **wall-left / wall-right**: patterned side walls (honeycomb, circles, kumiko, slats or
  breeze block). They notch over the deck's ears and drop a tab through each slot into
  the wall below. Pins on the wall tops locate the tier above.
- **end-wall**: closes the high end. Cross-laps into both side walls and drops in last.

Names say the tier: `lane-bottom-deck`, `lane-mid-wall-left`, `lane-top-end-wall` and so
on (a flat stack is just `lane-deck` etc., since every tier is the same). Alternate
tiers are rotated 180° so cans cascade down when you pull one. The bottom deck runs full
length to the **end-lip**. Upper decks stop a can short to leave the drop chute.

- Plates longer than the bed split into **-front** / **-rear** halves. Decks join with
  an in-plane T-slot, walls just butt and the tier above bridges the seam. Everything
  drops together in Z, nothing slides in sideways, no glue.
- **Ganging**: lanes side by side lock through the decks. Tongues off one deck drop into
  T sockets in the next.
- **riser-24**: feet under the wall pins, with Base = Feet.
- **grid-deck**: with Base = Gridfinity, the bottom deck on a 7 mm unit of Gridfinity feet
  (optional magnet pockets). Drops into any baseplate, with the lane on a skirt where the
  shelf has fewer cells than the lane covers.
- **cover**: grille top in the same pattern so the stack is a shelf, with a can-sized
  window over the top tier's high end. That's where cans go in: drop one through and it
  rolls to the chute.

Two designs: Standard, and Minimal (thin webs, open deck, same joints, about 17 %
less filament). One `fit` value is added to every clearance.

## 3MF layout

Plates follow Bambu Studio's own grid (`compute_colum_count` = ceil√n columns,
stride = bed × 1.2, rows toward −Y) and are declared in
`Metadata/model_settings.config`, so the file opens with parts already on plates.
Load a project 3MF saved from your slicer and its `project_settings.config` rides into the export, so the file opens on your printer and filament. Import nothing and the slicer's own defaults apply.

## Known gaps, in order

1. Print an `end-lip` and one `-rear` half before anything else. The `fit` slider
   exists because tolerance is the #1 complaint on every comparable model, and nothing
   here has been checked against a real printer yet (sliced in Bambu Studio, yes. Printed, no).
2. Mixed-width ganging (slim + standard side by side). Bigger than it looks: `gangPitch`
   in `src/geometry.ts` derives from a single `canD`/`canL`, so this wants a second can
   spec threaded through `solve()`, not just a gang-joint change.
3. Odd cascade tier counts put the cover window at the back. Warn harder, or let the
   shelf depth pick an even count.
4. Packing is a shelf sort (first fit across every plate, each part tried turned 90°).
   A real 2D packer might save a plate or two.

Left undone on purpose: no OpenSCAD port for MakerWorld's Parametric Model Maker.
