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

    src/model.ts      product options, dimensions, constants and shared contracts
    src/kernel.ts     Manifold operations and scoped WASM shape ownership
    src/queue.ts      shared can capacity, minimum lane length and positions
    src/layout.ts     tier roles, deck variants and joint layout rules
    src/assembly.ts   part identities, quantities and assembly placements
    src/features/    reusable joints, poses, lattice, rounds and Gridfinity units
    src/geometry.ts   composes the required parts from the assembly manifest
    src/solver.ts     shelf W×D×H + can → ranked layouts (pure arithmetic)
    src/export.ts     mesh validation, shared-geometry packing, STL and multi-plate 3MF
    src/estimate.ts   approximate filament use from resolved print settings
    src/worker.ts     runs geometry, estimates and export off the UI thread
    src/viewer.ts     three.js instances for assemblies, cans and plate placements
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
- **end-wall**: closes the high end. Cross-laps into both side walls and snaps onto the deck.

Names say the tier: `lane-bottom-deck`, `lane-mid-wall-left`, `lane-top-end-wall` and so
on (a flat stack is just `lane-deck` etc., since every tier is the same). Alternate
tiers are rotated 180° so cans cascade down when you pull one. Reversed tiers use
`deck-mirrored` variants so the selected left and right connectors stay on the same
outer sides. The bottom deck runs full
length to the **end-lip**. Upper decks stop a can short to leave the drop chute.

- Plates longer than the bed split into **-front** / **-rear** halves. Decks join with
  an in-plane T-slot. Hidden printed keys align and retain the wall and cover seams.
- **Ganging**: lanes side by side lock through the decks. Tongues off one deck drop into
  T sockets in the next.
- **riser-24**: feet under the wall pins, with Base = Feet.
- **grid-deck**: with Base = Gridfinity, the bottom deck on a 7 mm unit of Gridfinity feet
  (optional magnet pockets). Drops into any baseplate, with the lane on a skirt where the
  shelf has fewer cells than the lane covers.
- **cover**: grille top in the same pattern so the stack is a shelf, with a can-sized
  window over the top tier's high end. That's where cans go in: drop one through and it
  rolls to the chute. Blind catches conceal the wall pins beneath its outer surface.

For a split lane, drop the deck T together first. Slide each pair of wall halves onto
its hidden keys along the lane, then snap the joined wall down onto the deck ears.
Drop the end wall into the side-wall cross-laps and snap it onto the deck. Assemble
each tier before adding the next. Slide the cover halves onto their keys along the
lane before lowering the joined cover onto the wall pins. Use the printed joints and
keys throughout; no glue or hardware is needed.

Finished exterior frames stay flush and retain their recessed patterns. Unused side
connectors are closed when Left or Right is Nothing; select a connector only where
future expansion is wanted. Support the bottom whenever moving a loaded assembly.
The joints have no validated load rating: qualify the current coupon and a complete
lane on your printer before loading the full dispenser.

Two designs: Standard, and Minimal (thin webs, open deck, same joints, about 17 %
less filament). One `fit` value is added to every clearance.

## 3MF layout

Plates follow Bambu Studio's own grid (`compute_colum_count` = ceil√n columns,
stride = bed × 1.2, rows toward −Y) and are declared in
`Metadata/model_settings.config`, so the file opens with parts already on plates.
Load a project 3MF saved from your slicer and its `project_settings.config` rides into the export, so the file opens on your printer and filament. Import nothing and the slicer's own defaults apply.

Filament estimates resolve selected process and filament settings, including infill,
perimeters, skins and density. Missing values are shown as explicit assumptions.
They exclude supports, adhesion and purge; use the slicer for print time. Geometry is
shared between repeated parts in memory, with placement transforms applied at export.
Large assembly previews show a labelled sample; capacity and exports retain every part.

## Known gaps, in order

1. Print the joint coupon (`bun run coupon.ts`) and then one complete lane before
   printing the full job. Earlier joints have been printed successfully; the current
   concealed catches, seam keys and end-wall snaps still need qualification on the P2S
   with PETG Translucent, a 0.4 mm nozzle and 0.2 mm layers. Remove stringing or clumps
   before judging fit; a larger clearance also allows more seam movement.
2. Mixed-width ganging (slim + standard side by side). Bigger than it looks: `gangPitch`
   in `src/geometry.ts` derives from a single `canD`/`canL`, so this wants a second can
   spec threaded through `solve()`, not just a gang-joint change.
3. Odd cascade tier counts put the cover window at the back. Warn harder, or let the
   shelf depth pick an even count.
4. Packing is a shelf sort (first fit across every plate, each part tried turned 90°).
   A real 2D packer might save a plate or two.

Left undone on purpose: no OpenSCAD port for MakerWorld's Parametric Model Maker.
