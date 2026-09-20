# Feature library: joints and features as reusable procedural pieces

## Context

`src/geometry.ts` (1066 lines) builds every plate wholesale. Seven joint families exist;
only two (deck T splice via `tSlot` + `grow`, gang T via `gangT`) derive both halves
from one profile. The other five spell their dimensions twice, 50–250 lines apart:

- ear (`buildDeck:612`, `o.wall + 1` wide at `IW/2 + wall/2 - 0.5`) vs notch
  (`wallNotches:677`, at `d.py`, `notchH = K.deckLo + c`) — only `K.earW` shared
- pin (`buildWall:664`, riser `:825`, grid deck `:887`) vs notch (`wallNotches:681`,
  at `d.py`) vs cover hole (`buildCover:897`, at `d.piny`) — works only because the
  notch is `wall + 2` deep in Y
- cross-lap posts (`buildEndWall:731-733`) vs slot (`wallNotches:679-680`), `lapZ`
  computed twice, clearance only on the slot side
- lip tab (`buildLip:815`, bare `5 × 12`) vs `lipPocket:581` (`5 + 2c, 12 + 2c`, axes
  swapped) — no `K` entry
- `tab`/`tabHole` share `K.tabW/K.tabT` but every call site picks its own length and
  z0 (`notchH+1`, `notchH+2`, `K.pinH+1`, `ln.dhi+4`, z0 `0`/`-1`)

`K.cl + o.fit` is spelled at seven sites (`geometry.ts:160,556,581,600,659,783,813`),
one of them (`813`) as bare `2 * o.fit`. Every builder repeats an unnamed
`adds[]/cuts[] → g.diff(g.union(adds), cuts)` protocol. The viewer hand-writes the
inverse of `layWall`/`layEndWall` (`viewer.ts:174-179`) and `test/front.test.ts:40`
holds a third copy of the lip pose.

Goal (user's ranking): **correctness first** — both halves of every joint from one spec,
fit in one place per joint; then a smaller composer; new parts fast and runtime are not
goals. Research (BOSL2 attachables, build123d joints, boxes.py edge/settings pairs,
Joinery) converges on: *the joint is the unit of authorship, one settings object, two
derived halves, clearance only in the female.* Anchor tables (BOSL2) are overkill for
a fixed joint set; boxes.py's settings-object idiom is the battle-tested match.

## Decisions (interview, 2026-09-20)

| Decision | Choice |
|---|---|
| Primary goal | Correctness: joints from one spec |
| Snapshot | Phase 1 pure refactor, `ref.json` identical; drifts fixed in follow-ups with `bun run ref` |
| Placement | Feature built at local origin; caller places with an axis-aligned `Frame` |
| Joint shape | `{ male, female }`; ear and pin are composites across plates |
| Scope | Joints, lattice, recess/roundover, gridfinity |
| Layout | `src/features/` one file per family; `geometry.ts` stays the composer |
| Tests | New `test/features.test.ts` per joint + existing suites untouched |
| Pose | One `platePose` exported from geometry; viewer and `front.test.ts` use its inverse |

## Design

### Placement (as built: no `frame.ts`)
```ts
export const clearanceOf = (o: Options) => K.cl + o.fit   // joints.ts
export const OVER = 1                                      // fuse/overshoot margin, see "snapshot safety"
export function placeSide(m: M, sy: number, x: number, y: number, z: number): M   // mirror across y for the -Y wall, then move
```
Local frame of the wall joints (`earJoint`, `pinJoint`, `crossLap`): x along the lane,
y the wall's centreline with +y toward the wall's outer face, z = 0 at the deck
underside / wall bottom. `tSlotJoint` sits at the seam, `gangJoint` at the tongue's
root, and `lipTab`/`lipPocket` in the lip's and the deck's own frames. A side-dependent
piece goes on with `placeSide` (its y offset to the inner face is signed), a symmetric
one with `.translate()`. The plan's `Frame`/`place()` was dropped: no feature needs a
rotation.

### `src/features/joints.ts` — one spec, two halves
```ts
export interface Pair { male: M; female: M }
export function tabJoint(g, spec: { len: number; along: "x"|"y"; clearance: number; through: number }): Pair
export function tSlotJoint(g, spec: { neck: number; head: number; clearance: number; depth: number }): Pair   // tSlot() moves here
export function crossLap(g, spec: { wall: number; lapZ: number; H: number; clearance: number }): Pair          // post vs slot
export function lipTab(g, spec: { len: number; t: number; w: number; clearance: number; through: number }): Pair // 5 × 12 → K.lipTabT/K.lipTabW
export function gangJoint(g, spec: { earW: number; head: number; run: number; clearance: number; through: number }): Pair
// composites: every piece at one origin (tab centre x, wall centreline y, z = 0)
export function earJoint(g, spec: { wall: number; root: number; notchH: number; clearance: number; through: number }):
  { deck: { add: M; cut: M }; wall: { add: M; cut: M } }
export function pinJoint(g, spec: { wall: number; clearance: number; coverT: number }):
  { pin: M; notch: M; hole: M }        // wall-top pin / riser boss / grid boss all use `pin`; wall above uses `notch`; cover uses `hole`
```
Rules: female = male grown by `clearance` in-plane (`tSlot` already does this with a
miter offset; boxes grow `2 * clearance` per axis); female extends `OVER` past both faces
of the plate it cuts; male overlaps its host by `OVER`. The ear's `root` (1 mm into the
deck) and the notch's Y depth (`wall + 2`) are spec fields, not literals — phase 1 keeps
every number the same, it only moves where it is written.

### `src/features/lattice.ts`
`Lattice`, `ROWS`, `ligFor`, `autoR`, `Geo.cells/cellsOf/hexCells/slats` move here as
free functions taking `g`. Field rectangle helper `panel(g, x0, y0, x1, y1, border)`
replaces the three border-inset idioms (`695`, `741`, `914`). `ROWS` stays exported
from `geometry.ts` (re-export) for `test/pattern.test.ts`.

### `src/features/pocket.ts`
`recess(g, spec: { face: CS; depth: number; pads: CS[] })` — the recess-to-web block
written at `706-707` and `744-745`. `roundOver`/`roundTop` move here unchanged.

### `src/features/gridfinity.ts`
`buildFoot`, floor cells, magnet pockets, skirt out of `buildGridDeck`. Same signatures,
same numbers; `test/spec.test.ts` keeps checking `K` against `docs/gridfinity-spec.md`.

### `src/features/pose.ts`
```ts
export interface Pose { rotate: [number, number, number]; translate: [number, number, number] }   // degrees, manifold order
export function platePose(plate: PlateName, sy: 1 | -1, IW: number, xe: number): Pose
export const lipPose: Pose
```
`layWall`/`layEndWall` become `lay(m, platePose(...))` (translate then rotate, as
today). Viewer builds its three.js Euler from the same `Pose` inverted; `front.test.ts`
uses `lipPose`. Rotation-order gotcha: manifold `rotate([x,y,z])` applies X then Y then
Z; three's `rotation.set(..., "ZYX")` in the viewer is the inverse order — the helper
in viewer.ts converts, and `test/pose.test.ts` asserts `lay` then inverse-pose returns
the original bounds for all four plates.

### `geometry.ts` after
Keeps `Options`, `K`, `solve`, `check`, `laneOf`, `Geo` (kernel wrappers only: box, cyl,
poly, rect, prism*, union, diff, isect, hull, cs2d), `build*`, `split*`, `partList`,
`freeSet`, `filamentGrams`. Each `build*` reads: place features, collect `adds`/`cuts`,
one `g.diff(g.union(adds), cuts)`. Same export list; tests import nothing new except
`test/features.test.ts` importing `src/features/*`.

## Snapshot safety (why identical geometry is reachable)

- Overshoot: `A ∪ (B ∪ extra-inside-A) = A ∪ B`; `A − (C ∪ extra-outside-A) = A − C`. Every
  `+1/+2/+4` margin today is one of those; standardising to `OVER` moves no surface.
  Exception to check per joint: cut overshoots must stay outside the plate (e.g. tab hole
  `ln.dhi + 4` from `z = -1` — top at `dhi + 3 > te`, safe).
- Boolean order can move float noise. Tolerance is 0.01 % volume, 0.01 mm bounds; the
  cross-kernel switch moved 0.0225 %, so order changes are inside tolerance in practice.
  Run `bun test test/regress.test.ts` after every joint migration; if a part moves,
  that step introduced a real dimension change — find it, do not regenerate.
- The gang anchors line up only because `gangInner(o,d) === d.gangPitch - d.IW/2`
  when `gangs(o)`. Assert it in `check()` and in `test/features.test.ts`.

## Migration order (one commit each, regress green after every one)

1. `frame.ts` + `clearanceOf` + `OVER`; replace the six `K.cl + o.fit` spellings
   (leave `813` — changing it moves geometry). No feature yet.
2. `pose.ts`; `layWall`/`layEndWall` via `lay`; viewer + `front.test.ts` use the inverse;
   `test/pose.test.ts`.
3. `tSlotJoint` (already one-spec) — `splitDeck` uses `.male/.female`. Lowest risk.
4. `gangJoint` — `gangTongue`/`gangSocket` become one call; add the anchor assertion.
5. `lipTab` — `K.lipTabT = 5`, `K.lipTabW = 12`; `buildLip` + both `lipPocket` sites.
6. `crossLap` — `buildEndWall` posts + `wallNotches` slot from one spec.
7. `pinJoint` — wall pin, riser boss, grid boss, wall notch, cover hole.
8. `earJoint` — ear, slot, notch, tab. Highest coupling; last among joints.
9. `lattice.ts` — move `cells*`, `ROWS`, `autoR`, `ligFor`; `panel()` helper.
10. `pocket.ts` — `recess`, `roundOver`, `roundTop`.
11. `gridfinity.ts` — `buildFoot`, floor, magnets, skirt.
12. `test/features.test.ts` grows with each of 3–8; final pass adds per-feature
    overhang check.

Each step: `bun run check`, `bun test test/`, read `git diff --stat`.

## `test/features.test.ts`

Per joint, with `spec.clearance = K.cl` and again at `K.cl + 0.3`:
- **Fits**: `geo.isect(male, complementOf(female)).volume() ≈ 0` — in manifold terms
  `geo.diff(male, [female]).volume()` is `0` (male sits entirely inside female).
- **Clearance is the spec's**: `geo.diff(female, [male])` volume equals the analytic
  shell for the box joints (`(w+2c)(t+2c) − w·t` × through) — catches a female grown
  by the wrong amount.
- **Overhang**: extract `overhangArea` from `test/overhang.test.ts` into `test/geo.ts`
  (smallest change; the existing file imports it back) and assert `0` on each `male`
  placed on its host face and on each composite's add-pieces.
- **Composites**: `earJoint` — deck `add − cut` is one solid; wall `cut` contains
  wall `add` (notch minus own tab leaves the tab).
- **Gang anchor**: `gangInner(o,d) === d.gangPitch - d.IW/2` for `DEFAULTS`.

## Risks

- Manual `.delete()` calls in `cells`, `roundTop`, `wallPerforation`, `buildDeck`,
  `filamentGrams` must move with their code; `test/islands.test.ts` and the leak-free
  worker rely on them. Rule: a feature frees its intermediates, returns only what the
  caller owns.
- `buildLip` is built lying down with axes swapped from the pocket. Keep that: `lipTab`
  returns `male` in the lip's lying frame and `female` in the deck frame, both sized
  from one spec (`K.lipTabT = 5`, `K.lipTabW = 12`). One spec, two frames — no build
  transform changes in phase 1. Guarded by `front.test.ts`.
- `pinJoint` notch at `d.py` vs pin at `d.piny`: composite puts both at one origin; the
  notch's Y extent (`wall + 2`) still swallows the difference, so geometry is identical.
- three.js Euler vs manifold rotate order in `pose.ts` — covered by `test/pose.test.ts`.

## Phase 2 follow-ups (each its own commit with `bun run ref` and a read diff)

1. Lip blade width `d.IW - 1 - 2 * o.fit` (`813`) → `clearanceOf(o)` form.
2. Cover grille radius `(OW - 28 - 1) / (a + bb/2)` (`917`) → `autoR` with `ligFor`,
   or document why the cover's ligament is `R/2`.
3. Cover field inset bare `14` and seam band `6` (`914`, `935`) → `K`.
4. Riser `side = 20` (`824`) → `K`.
5. ~~Pin notch anchored at `d.py` while pin is at `d.piny`: one anchor.~~ Done: `d.piny` is gone; every pin piece is placed at `d.py` with its own offset.
6. Ear `root = 1` and `plinth = max(earW, gangHead)/2 + 3` (`630`) → `K` and derived.
7. ~~Spec drift: `2026-09-18-flat-pack-design.md:25` still names the 56° dovetail.~~ Done.

## Verification

- `bun run check` — strict tsc.
- `bun test test/` — regress identical, overhang, islands, splice, gang, pack (18
  plates), pattern, cover, front, gridfinity, parts, plus new `features` and `pose`.
- `bun run test:ui` once at the end (viewer pose change touches the DOM path).
- `bun run dev`, open the assembly + exploded views, confirm walls/end wall/lip stand
  where they did (pose step).
- `git diff ref.json` must be empty through phase 1.
