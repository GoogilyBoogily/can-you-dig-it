# can-you-dig-it

Printable can storage, sized to your shelf. Enter the space, the can, and your
printer bed; get a multi-plate 3MF (Bambu Studio / Orca) or an STL zip with every
part placed. Runs entirely in the browser: geometry on the
[manifold-3d](https://github.com/elalish/manifold) WASM kernel in a Web Worker,
viewer in three.js, no server.

Use **Setup / Preview / Print** to move directly between settings, the model and
downloads; navigation keeps the current design and shared link intact. Printer,
print-profile and custom build-volume controls stay in Setup, including when a
design does not fit. Optional feeding, appearance, base and joint-fit settings
expand in place. Print shows downloads before plate and stack details; the material
estimate expands to show its assumptions.

Choose **Different stacks side by side** to make one connected organizer from
neighboring stacks. Each stack has its own can preset or custom dimensions, exact
container depth, fixed or automatic tier count, auto-feed, deck slope, lip headroom,
cover, rear loading and option to add another tier on top. Printer, material, fit,
design and pattern stay shared. Reorder stacks by dragging their handles, clicking
the up/down buttons, or focusing a handle and pressing the Up/Down arrow keys.
Their dispensing fronts align; the whole requested
mix must fit the shelf and printer. New shared links use version 3; existing version-2
mixed links inherit their original shared stack settings. Mixed builds currently use
a flat base and walls at least 5.75 mm thick. Printed spline segments join the facing
bottom walls; assemble them before adding upper tiers. Fit and loaded strength still
need printed trials.
See [assembly and qualification notes](prototypes/mixed-wall-spline.md).

Each stack's depth slider shows millimetres and runs from the space for one can
(including stops, joint space and an auto-feed chute when enabled) to usable shelf
depth after the front gap. Bounds follow can and shelf changes, adjusting an
out-of-range depth. The same bounds apply to loaded links.

Long organizers automatically gain enough printable sections for the selected
printer. Deck T joints and concealed wall/cover keys repeat at each seam; interior
sections gain supporting ears and retaining pins, with matching feet or Gridfinity
supports. Existing valid one-piece and center-split designs keep their part names.
Section sizing accounts for the printer’s excluded bed areas as well as its build
volume. Each printed piece must still fit in all three dimensions, and seams
must leave the chute, loading window and joint supports intact. Width, height or
protected features that cannot fit produce an explicit error instead of shortening
the requested organizer. See the [multiple-seam design](docs/superpowers/specs/2026-10-17-multiple-seams-design.md).
Geometry checks do not establish printed fit or a load rating; qualify one complete
lane in the intended material/process and support loaded organizers underneath.

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
    src/mixed-geometry.ts explicit mixed-stack sources and retained connection parts
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
on (a uniform flat stack is just `lane-deck` etc., since every tier is the same).
Mixed builds add a `stack-N-` prefix and separate facing bottom walls from upper walls.
Alternate tiers are rotated 180° so cans cascade down when you pull one. Reversed tiers use
`deck-mirrored` variants so the selected left and right connectors stay on the same
outer sides. The bottom deck runs full
length to the **end-lip**. Upper decks stop a can short to leave the drop chute.

- Plates longer than the bed split into printable sections. Two-section designs keep
  **-front** / **-rear** names; longer designs use numbered sections. Decks join with
  an in-plane T-slot. Hidden printed keys align and retain the wall and cover seams.
- **Same-size ganging**: lanes side by side lock through the decks. Tongues off one
  deck drop into T sockets in the next.
- **Mixed-stack connections**: printed spline segments join blind channels in the
  facing bottom walls. These extra parts print on their ends, up to 40 mm high.
- **riser-24**: feet under the wall pins, with Base = Feet.
- **grid-deck**: with Base = Gridfinity, the bottom deck on a 7 mm unit of Gridfinity feet
  (optional magnet pockets). Drops into any baseplate, with the lane on a skirt where the
  shelf has fewer cells than the lane covers.
- **cover**: grille top in the same pattern so the stack is a shelf, with a can-sized
  window over the top tier's high end. That's where cans go in: drop one through and it
  rolls to the chute. Blind catches conceal the wall pins beneath its outer surface.

For a split lane, join the deck sections at every T first. Slide the wall sections onto
its hidden keys along the lane, then snap the joined wall down onto the deck ears.
Drop the end wall into the side-wall cross-laps and snap it onto the deck. Assemble
each tier before adding the next. Slide the cover sections onto their keys along the
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
   For mixed builds, also generate the wall-connection samples with
   `bun prototypes/export-mixed-wall-spline.ts`; qualify their fit and a complete
   connected organizer before loading it.
2. Mixed builds support flat bases only. Can size and container depth can differ
   between neighboring stacks; each vertical stack keeps one size and depth.
   Mixed builds with feet or Gridfinity bases remain unsupported.
3. Odd cascade tier counts put the cover window at the back. Warn harder, or let the
   shelf depth pick an even count.
4. Packing is a shelf sort (first fit across every plate, each part tried turned 90°).
   A real 2D packer might save a plate or two.

Left undone on purpose: no OpenSCAD port for MakerWorld's Parametric Model Maker.
