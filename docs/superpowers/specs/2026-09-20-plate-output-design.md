# Plates: pack tighter, download one, copies in the zip, even tiers

Four small changes to what comes out. None touches geometry.

## Packing: sort by short side

`pack()` sorts parts by Y extent descending, then first-fits each across every open plate,
flat then turned. A dry run over `ref.json`'s boxes with three sort keys:

| bed | layout | Y desc (now) | short side | plate-area bound |
|---|---|---|---|---|
| 256² | default 2 × 2 cascade | 16 | 15 | 15 |
| 256² | 2 × 3 cascade | 23 | 22 | 22 |
| 256² | flat 1 × 3 short | 6 | 5 | 5 |
| 256² | flat 3 × 2 short | 12 | 11 | 11 |
| 350 × 320 | default | 11 | 11 | 11 |
| 350 × 320 | 2 × 3 cascade | 16 | 15 | 15 |
| 300² | default | 15 | 14 | 14 |

Short side matches or beats the current key everywhere and reaches the bound on every 256²
case. The reason: 28 parts of the default set are ≥ 96 deep and ≥ 162 wide, a 250 mm usable
bed takes two of those per plate and no more, and the two 138-deep end walls fit only in a
slot a wall would otherwise take, so ⌈30 / 2⌉ = 15 is the floor. Y-descending places the
138-deep end walls and lips first, they open shelves the walls needed, and one plate is
lost. Short side sends them last and they drop into the 82 mm strip beside
`lane-top-deck-front`.

The change is one line at `src/export.ts:76`:

    const side = (b) => Math.min(b[3] - b[0], b[4] - b[1]);
    flat.sort((a, b) => side(b.mesh.bbox) - side(a.mesh.bbox));

Stable sort on the same input order, so the result stays deterministic. Flat-then-turned,
the margin floor, the 6 mm gap and the centring do not change. `maxrects-packer`, the
README's suggestion, packs no tighter on any row above, does not produce shelves (the three
centring tests would become bbox tests), and is one more thing in `worker.js`. Not added.

`test/pack.test.ts` `PLATES` goes 16 → 15, the comment at `:101-106` says what fills the
strip now, and one case pins it: an `end-lip` and a `lane-top-end-wall` share a plate with
`lane-top-deck-front`. README gap #4 is deleted; the `pack()` bullet in CLAUDE.md says
"short side".

## Download one plate

A small `3MF` button on each row of `#plates`. `worker.ts`'s export `Req` gains
`plate?: number`; `threeMf` receives `placed.filter((p) => p.plate === n)` with `plate` set
to 0 on each, so it lands on Bambu's first plate origin, and one `<plate>` block. File name
`can-system-plate-3.3mf`. The profile rides along as it does for the whole project. Reprint
the lips without saving thirteen plates.

## STL zip: one file per copy

`stlZip` writes one `<name>.stl` per unique part and nothing says how many to print. It now
writes `name-01.stl … name-NN.stl` when `qty > 1`, the names `pack()` already uses
(`export.ts:75`), and `name.stl` when it is one. Same bytes per copy: deflate finds them.

## Even tier counts in a cascade

An odd tier count puts the loading window at the back, and the summary says so in a
subordinate clause. `rank()` in `src/solver.ts` breaks a tie on cans in favour of even
`tiers` before it falls to stack height; when the odd count wins on cans, the layout card's
last line gets `loads from the back` and the summary's Load-from row is a `.warn`. README
gap #3 closes.

## Tests

- `test/pack.test.ts`: as above; every other case holds unchanged.
- `test/export.test.ts`: `threeMf` on one plate's placements writes a single `<plate>` at
  origin 0; `stlZip` on a qty-2 part yields two entries with the `-01`/`-02` suffix and
  byte-identical bodies.
- `test/solver.test.ts`: a shelf where 2 and 3 tiers hold the same cans ranks 2 first;
  where 3 holds more, 3 ranks first and carries the warning.
- `test-ui/share.ui.test.ts`: the per-plate button downloads a file named for its plate.
