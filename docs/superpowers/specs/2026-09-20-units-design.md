# Inches on the form

A units select, mm or in, that changes what the form shows and accepts. Everything past the
form stays millimetres: the hash, `optionsFrom()`, `LIMITS`, the solver, the kernel.

## Why

Shelves in the US are sold and measured in inches, and a 12-inch shelf once lost its fourth
can to a conversion done in someone's head (README). The one comparable configurator with
inches shows them only as a readout. Input is where the mistake happens.

Millimetres stay canonical because a Share link is a design, not a locale: a link made in
inches must open in France as the same shelf. One canonical unit also keeps `LIMITS` and
every test in one number system.

## What changes

`<select id="units">` in the masthead, `mm` (default) and `in`. The choice is saved in
`localStorage` under `can-you-dig-it.units`, read and written through the same guarded
access `src/profile.ts` uses, because storage throws in Safari private browsing and this
must never stop the page.

Fields that convert: `w d h front canD canL bedX bedY bedZ hexR lipGap clearance` and the
label pocket's numbers if that lands. Not converted: `slope` (degrees), `fit` (a slicer
tolerance; nobody thinks in thousandths of an inch here).

Conversion lives in `src/main.ts` only, one pair of functions:

    toShown(mm)  = units === "in" ? round(mm / 25.4, 2) : mm
    toMm(shown)  = units === "in" ? round(shown * 25.4, 1) : shown

They wrap the three places a field's value crosses the edge:

- `readOptions()`: `optionsFrom()` reads through a getter today; the getter returns
  `String(toMm(Number(v)))` for converted fields. Validation still runs on millimetres, so a
  9.9 in can is refused as 251 mm by the same rule.
- Writing values in: presets (`preset`, `shelfPreset`, `bedPreset`), `loadHash`, and
  `applyPicks` bed writes go through `toShown`.
- `syncHash`: reads the field, converts with `toMm`, writes millimetres.

Switching units converts what is on screen in place, both ways, and rewrites `min`, `max`,
`step` and the unit `<span>` on each converted input: `step` 1 → 0.05, 0.1 → 0.01, 0.5 →
0.02. The `LIMITS` gate is on millimetres, so the inch `min`/`max`/`step` are display only,
the same relation the comment at `index.html:117-119` describes for the two sliders. A
link made in inches can put 304.8 into a `step 1` field on a mm page; the browser marks it
`:invalid` and nothing else, since the form never submits and the gate does not read `step`.

Rounding: two decimals in inches is 0.25 mm, finer than anything the solver cares about;
one decimal in mm on the way back keeps the hash short and matches `IW`'s own rounding.
A value typed in inches, saved, reloaded and shown again may differ by 0.01 in. Fine.

## Copy

The summary panel and layout cards keep millimetres and add the inches in brackets when the
select says in: `305 × 406 × 229 mm (12 × 16 × 9 in)`. Part dimensions on the plates
stay mm: a slicer bed is a metric thing.

## Tests

`test-ui/share.ui.test.ts`:

- Select in, type 12 / 16 / 9 for the shelf: the hash reads `w=304.8&d=406.4&h=228.6`
  and the layout list is the one the mm form gives for those numbers.
- Reload: the select is still in, the fields show 12 / 16 / 9.
- Open a mm-made link with the select on in: the fields show inches, the hash is unchanged
  after one edit and a revert.
- Storage denied (the existing denied-storage case): the select works for the session and
  the page loads.

No unit test: nothing below `main.ts` changes.
