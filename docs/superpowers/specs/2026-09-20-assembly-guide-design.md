# Assembly guide

An ordered list of steps under the plates, each naming the parts it uses, each with a Show
button that turns the viewer to that step. A Print guide button prints the list and the
summary on one sheet.

## Why

A flat-pack lane is a deck, two walls, an end wall, a lip, clips and a cover, in an order
that matters: the end wall's side tabs go into the side walls' bottom notches, so the end
wall stands before the walls drop, and the tier above holds the clips down, so the clips go
in before it. None of that is on the page. The footer says "drop together on tabs", the
exploded view shows where things end up, and the user works the rest out on the floor.
No configurator anywhere ships one - the closest ship a PNG of an exploded render - and a
glued box needs one less than this does.

## Steps

`src/assembly.ts`, pure, no kernel:

    interface Step { title: string; parts: string[]; note?: string; tier?: number }
    function assemblySteps(names: string[], o: Options): Step[]

`names` is `partList(...)` mapped to names - the same strings the viewer places, so the
guide cannot name a part the build did not make. A step is emitted only when every part
it names is in the list; a missing cover or riser drops its step rather than lying.
`tier` tells two `lane-deck`s of a flat stack apart.

Per tier t, lanes described once with "× N":

1. split only: "Join the halves" - rear deck into front deck from above (the T-slot head
   locks X), each wall pair slid together in Y. Parts: the six `-front`/`-rear` names.
2. "Set the deck down" - t 0: on the shelf; on a Gridfinity base, `grid-deck` into the
   baseplate, feet in the cells; t > 0: on the wall tops below, ears over the walls.
   Cascade with odd t: note "turned 180°, high end to the front".
3. "Drop the lip into the deck's front pockets" - `end-lip`. Cascade: t 0 only. Flat: every tier.
4. "Stand the end wall on the high end, tab down through the deck" - the tier's end wall.
5. "Lower the side walls over the ears; the end wall's side tabs go into their bottom
   notches" - tongue and socket walls. t > 0: note "tabs through the ear slots into the
   wall tops below".
6. feet, t 0: "Lift the tier onto four risers under the wall ends, boss into each wall's
   bottom notch" - `riser-24`.
7. gang (`lanesWide > 1`, not Gridfinity): "Slide the next lane down beside it, rib into
   groove, then drop a clip into each pair of pockets on the wall tops" - the next lane's
   walls and `gang-clip`. Two clips per joint per tier.

After the last tier: split only, "Join the cover halves"; then "Cover on: the pins on the
wall tops into its holes", note "window over the front" when `(tiers − 1)` is odd, so the
prose agrees with `coverRot` in the viewer. A top tier with no cover: "The top clips stay
by friction; press them home."

With a second can type (mixed-width spec), the steps run once per gang with the gang's
name in the title: "12 oz lanes" / "slim lanes".

## Viewer

`showAssembly` already builds every mesh through `putPlate` and `put`; both push
`{ mesh, name, tier }` onto a `named` list, cleared in `clear()`; clips, risers and the
cover carry `tier` −1. `highlight(parts: string[] | null, tier?: number)`: every named mesh
gets `material.transparent = true; opacity = match ? 1 : 0.12`, cans hidden while a
highlight is on. Materials are one per mesh (`mesh()`), so no sharing. No colour change:
the role colours keep meaning on the print sheet. Copies of one name (two walls, four
risers) all light up; that is the step.

Show does three things: `showTab("assembly")`, `viewer.explode(0.4)` with the slider set to
match, `viewer.highlight(step.parts, step.tier)`. Any tab change rebuilds the assembly and
clears the highlight, so there is no state to leak.

## Page

`renderResults()` appends `<ol class="steps" id="steps">` after `#plates`; each `<li>` has
the title, the parts in `<small>`, the note, and the Show button with `aria-pressed` on the
active one. A "Print guide" button in `.actions` calls `window.print()`.

`styles.css` `@media print`: hide `.masthead p`, `.controls`, `.stage`, `.actions`, `.foot`
and the Show buttons; `body, .app { display: block; height: auto }`; `.results` loses its
border and scroll; `.steps li { break-inside: avoid }`. The summary `<dl>` sits in
`.results` already and prints with it: capacity, footprint, filament, plates, then the
steps. One sheet for a two-tier lane.

## Tests

`test/assembly.test.ts`, fed the same lists `test/parts.test.ts` expects (DEFAULTS 2 and
3 tiers, flat 1 × 3, split, Gridfinity, feet, cover off, lone lane):

- every name appears in at least one step; no step names a part not in the list;
- the cover step is last; the lip appears once in a cascade and `tiers` times flat;
- split: a join step precedes each deck step and names only `-front`/`-rear` parts;
- in every tier the end wall precedes the side walls; risers only with feet and only on
  tier 0; no gang step for a lone lane or on Gridfinity; clips only in gang steps;
- tier 1 of a cascade carries the 180° note, tier 0 does not; the cover note says front
  for an even tier count.

`test-ui/share.ui.test.ts`: Show on step 4 leaves exactly the end-wall meshes opaque.

The prose lives in `assembly.ts` and nowhere else; the CLAUDE.md flat-pack bullet gets one
sentence saying so, because a joint that changes shape changes a sentence here.
