# Snap joins

## Why

The kit drops together and stays together by its own weight. Nothing holds in Z
anywhere: a pin locates the wall above in X, the cover's holes locate the top in X and Y,
the gang tongue locates a neighbour in X and Y. Pick a lane up by its top tier and the
bottom deck stays on the shelf.

The owner wants units printed as separate jobs to hook together on the top, the left and
the right, and the result to be one solid unit: lift it by the top and everything comes
with it. Which sides carry a join is a choice per unit.

What limits the answer is the flat-pack rule. A plate printed flat can only hook in its
own plane, and `test/overhang.test.ts` allows no downward face flatter than 45°. A deck
lies in X–Y, so it can never hold anything in Z. A wall lies in X–Z, so every Z hook lives
on a wall, cut in the wall's plane, and its prongs flex in the plane they were printed
in. That is PETG's strong direction: a prong flexing across its layer lines splits.

## Decisions (interview, 2026-10-11)

1. Z is held by snap-fit prongs, not by loose keys or hardware. No extra parts.
2. Left and right are chosen per side: tongue, socket or none.
3. A row of two or more lanes gets end-lane decks when its outer sides differ from the
   inner joints. Up to two more deck parts per lane role.
4. Snaps are always on. They replace the plain pin and the plain tab everywhere: one
   joint, not two variants of it.
5. A single lane defaults to joinable: left tongue, right socket.

The "Room for another tier on top" checkbox (`o.stackable`, earlier the same day)
becomes the Top dropdown. What it does is unchanged: a cascade's top tier gets a mid
tier's full end wall, so the chute of a tier set on it later is closed.

## The snap

### Sizing

A cantilever's peak strain is ε = 1.5·t·y / L² (t its width in the flex direction, y the
deflection, L its length). For PETG, keep ε ≤ 2.5 % so it survives being snapped more
than once. With t = 1.6 mm (four 0.4 mm lines) and a 0.5 mm catch, L ≥ 7 mm.

Today's pin stands 2.4 mm and today's tab 4.25 mm. Neither bends. So every prong is
rooted inside its plate, freed by relief slots cut into the plate edge, and the hook sits
at the far end of a 7 mm cantilever.

### One prong pair

`snapJoint` in `src/features/joints.ts` builds both halves from one spec, like every
other joint there. The male is the 16 mm tab (`K.tabW`) hollowed: a 1.6 mm prong at each
outer edge, the middle cut away so they flex inward, the rest of the tab's footprint
unchanged. Each prong ends in a hook 0.5 mm proud of the tab's edge. The female is the
tab's slot or notch grown by the clearance, as now, plus a catch the hook springs into.

New constants in `K`: `snapT` 1.6, `snapCatch` 0.5, `snapLen` 7. The roots follow from
them: whatever part of `snapLen` the visible tab does not supply is relief slot.

### Where it goes

| Joint | Male | Catch | Hook faces |
|---|---|---|---|
| Wall to the tier above, and to the cover (the pins at ±px) | The pin, hollowed. Prongs rooted `snapLen − coverT − clearance` below the wall top (≈ 4.4 mm), inside the 5 mm top border. | Tier above: its bottom notch becomes a mouth `16 + 2c` wide and `coverT + c` tall, then a chamber `2·snapCatch` wider above it to the prong tip. Cover: the hooks catch on its top face. | Lead-in 30° off the push direction, return 60° off the pull direction. The chamber is cut in the wall's plane, so its faces print vertical and can be any angle. 60°, not square: it holds a full lane and comes apart with a firm pull. |
| Deck to its walls (the tab through the ear slot) | The tab, hollowed. Prongs rooted 3 mm up into the wall past the notch. | A 45° flare, 1.5 mm deep, at the bottom of every ear slot. | Lead-in 30°, return 45° to bear on the flare. The flare is under a deck printed flat, so 45° is as steep as it can be. |
| Lip to deck | The lip's 12 mm tab, hollowed. Prongs rooted 3 mm into the blade. | The same flare under each lip pocket, inside the blind pocket on a grid deck. | As the deck tab. |
| Riser to wall | The boss, hollowed. | The wall's bottom chamber. | As the pin. The riser prints on its side from now on: standing, its boss prongs would flex across their layers. |

Gridfinity deck bosses stay plain pins. The grid deck prints feet down, so a hollowed
boss would flex across its layers, and the deck tab snaps already hold the walls to it.

Nothing hangs below z = 0. The deck-tab hooks sit inside the slot flare, so the bottom
tier still stands flat on the shelf and an upper deck's ears still sit flat on the wall
top below.

### What it costs

- Prong tips stand `snapTop` (≈ coverT + c + 1.2, about 3.85 mm) above the wall top,
  where the pin stood 2.4. The cover sits on the wall top as before and the tips show
  about 1.5 mm above it. Every `K.pinH` that charges height becomes `snapTop(o)`:
  `solver.ts` (the stack height and the top tier's allowance) and `solve()`'s
  `wallPlateY`. A tall stack can lose a tier on a shelf that fit it to the millimetre.
- The relief slots and the chamber add keep-outs to `wallPerforation`, round ±px and
  over each ear notch, the way the end notch is kept out now.
- With no cover and nothing on top, the top tier's end walls lift out: they drop in last
  and only a wall top or a cover above their posts holds them. Logged in
  `docs/open-questions.md`.

## Left and right

### Options

`o.left` and `o.right`: `"tongue" | "socket" | "none"`. Defaults tongue and socket, which
is what a ganged row has today, so a row of two or more lanes does not change. Left is
+Y, seen from the front.

### Which deck each lane gets

Inside a row, a lane's +Y tongue runs into its left neighbour's −Y socket, as now.

| Lane | +Y side | −Y side | Part |
|---|---|---|---|
| Inner | tongue | socket | `…-deck` |
| Left end, row of 2+ | `o.left` | socket | `…-deck-left-end`, when `left ≠ tongue` |
| Right end, row of 2+ | tongue | `o.right` | `…-deck-right-end`, when `right ≠ socket` |
| Single lane | `o.left` | `o.right` | `…-deck` |

`buildDeck` takes the two sides. A tongue on −Y is the gang tongue mirrored, a socket on
+Y the socket mirrored: `gangJoint` itself does not change. `partList` splits each role's
deck count over its variants. The viewer picks a variant by lane index. A split deck
splits each variant the same way.

Walls do not change. Both walls of every lane keep their notches over the tongue
positions, so a "none" side has empty notches under its outer wall. Same trade as the
empty corner slot on 2026-09-30: two more wall parts are worse than a notch nobody sees.

### Z

Free, from the snaps. A tongue runs under the neighbour's wall and stands on the
neighbour's wall below. Those walls are now held to each other, so the tongue is held in
Z between them, and the T already holds X and Y.

### Room

- `gangs(o)` becomes: some lane edge carries a tongue or a socket, and the base is not
  Gridfinity.
- `plateY` charges `gangReach` (17 mm) on each tongued side of the widest deck variant.
- `rowWidth` charges `gangReach − gangGap` (14 mm) for each outer tongue, not only the
  +Y stub. A single lane with the default left tongue needs 14 mm more shelf than today.

### Limits

- Gridfinity: the baseplate joins the lanes, and the side dropdowns are disabled and read
  as none.
- A lane too short for a clear stretch of rail has no tongue. `check()` already warns.
- Units mate only when printed from the same settings - can, length, slope, tier role -
  because the tongue positions come from `laneOf`. The app cannot compare two jobs, so
  the UI says so under the dropdowns.

## UI

A "Joins" row in Options, three selects:

- Top: Another tier / Nothing. `name="stackable"`, values on / off, so `validate.ts`'s
  `on("stackable")` and the hash key stay as they are.
- Left, Right: Tongue / Socket / None. `validate.ts` checks them against a `SIDES` list
  like `ACROSS` / `ALONG`. `main.ts` `KEYS` gets `left` and `right`: a link without them
  loads the defaults.
- Under them: "Units join only when printed from the same settings."
- Left and Right are disabled on a Gridfinity base.

## Tests

- `features.test.ts`: seated, a snap's male and female do not overlap, the shaft keeps
  the clearance a side, and the hook's projection overlaps the mouth by `snapCatch` - a
  catch exists. For the pin, the deck tab, the lip and the riser.
- `overhang.test.ts`: unchanged. The flares are 45°, which `STEEPEST_OVERHANG` allows.
- `gang.test.ts`: every left × right pair at one, two and three lanes. The right deck
  variants come out, and each tongue sits in a socket of the same settings.
- `solver.test.ts`: a single lane costs 14 mm per outer tongue, a stack `snapTop` on top.
- `pack.test.ts`: the plate counts move. Each move gets read and explained before the
  numbers in the test change.
- `stackable.test.ts`: stays as written.
- `test-ui/`: a share link carries left and right and restores them.
- By hand, every time the UI changes: build, open it in Playwright, change each dropdown,
  screenshot, look.

## Snapshot, coupon, slice

- `bun run ref`, then read the diff. Every lane plate, the lip, the cover and the riser
  move. Anything else moving is a bug.
- `coupon.ts` gets a pin snap with its chamber, a deck tab with its flare, a lip tab and
  a tongue / socket pair. Print it on the P2S in translucent PETG on smooth PEI before a
  full lane. The 0.5 catch and the 60° / 45° faces are first guesses until then.
- `bun run slice.ts`: remeasure `JOB_FLOW`, `laneGrams` and `coverGrams`.

## Docs

`CLAUDE.md`: the "one tab for every joint" and gang joint rules. `docs/open-questions.md`:
the end wall lifting out with nothing on top, and the snap numbers unproven until the
coupon prints.

## Order

1. `snapJoint` and its `features.test.ts` cases.
2. Pin, deck tab, lip and riser onto it. `overhang.test.ts` green.
3. Per-side joins: deck variants, `partList`, viewer, solver.
4. UI.
5. `ref.json`, coupon, slice.
6. Docs.

## Status, 2026-10-11

Built on `snap-joins` (plan `docs/superpowers/plans/2026-10-11-snap-joins.md`). Where
the build moved off this spec:

- The pin's lead-in is 45°, not 30°: at 30° the tip stood 4.4 mm and its chamber reached
  the 5 mm hex border. `snapTop` is 3.83.
- The flare is 2 mm deep, not 1.5: the tab's 30° lead-in did not fit under the return
  face at 1.5.
- A prong's root is `snapLen` from the hook's peak, for every snap.
- `tabClear` grew by the hook (px 196 → 195): the shortest lane that keys to its
  neighbour is 265 mm (was 260), split halves 292 (290), cascade cans 43 mm (41).
- Lattice cells beside each snap cut are dropped whole: walls 63 % open (70 %), lanes
  337 g (320) on `filamentGrams`, `JOB_FLOW` 8.12 (7.95), the default job 41.2 h.
- A lone lane's 14 mm tongue stub must fit the shelf: a 152 mm shelf no longer takes
  one with the default left tongue.
