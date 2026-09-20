# Feature library: joints and features as reusable procedural pieces

**Status: shipped 2026-09-20** (`main` 1b550f8, 25 commits from 37ab0b5). The Context
and Decisions below are as written before the work; "As built" is what landed and where
it differs.

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

## As built

### Files
- `src/features/joints.ts` — every joint from one spec, built at a local origin, placed by
  `geometry.ts`.
- `src/features/pose.ts` — where each plate stands; `lay` flattens, `stand` is its inverse,
  the viewer builds its three.js Euler from the same numbers.
- `src/features/lattice.ts` — the pattern cells, `ROWS`, `ligFor`, `rowsRadius`, `autoR`.
- `src/features/pocket.ts` — `recessDepth`, `roundOver`, `roundTop`.
- `src/features/gridfinity.ts` — `buildFoot`, `gridUnit`.
- `src/geometry.ts` — `Options`, `K`, `solve`, `check`, `laneOf`, `Geo` (kernel wrappers plus
  `assemble(adds, cuts)` and `circle`), the `build*`/`split*` composers, `partList`,
  `freeSet`, `filamentGrams`. 1066 → 830 lines.
- `test/features.test.ts` (joint pairs), `test/pose.test.ts` (round trip, laid-flat
  orientation, lip flush); `overhangArea` lives in `test/geo.ts`.

### Placement
```ts
export const clearanceOf = (o: Options) => K.cl + o.fit   // the only spelling
export const OVER = 1                                      // fuse/overshoot margin
export const earNotchH = (clearance: number) => K.deckLo + clearance
export function placeSide(m: M, sy: number, x: number, y: number, z: number): M
```
The wall joints (`earJoint`, `pinJoint`, `crossLap`) share one frame: x along the lane, y
the wall's centreline with +y toward the wall's outer face, z = 0 at the deck underside
/ wall bottom. `tSlotJoint` sits at the seam, `gangJoint` at the tongue's root,
`lipTab`/`lipPocket` in the lip's and the deck's own frames. A side-dependent piece (its
y offset to the inner face is signed) goes on with `placeSide`, which mirrors for the
−Y wall and frees the intermediate; a symmetric piece with `.translate()`. The planned
`Frame`/`place()` was not built: no feature needs a rotation.

### Joints
```ts
export interface Pair { male: M; female: M }
export const tabBox = (g, len, wall, z0): M                       // the one tab cross-section, flush with the inner face
export const tProfile = (g, neck, head, grow = 0): CS             // the T; grown, it is the socket
export function tSlotJoint(g, { neck, head, clearance, zb, H }): Pair
export function gangJoint(g, { run, clearance, through }): Pair   // male = run + T; female = grown T only
export function crossLap(g, { wall, lapZ, H, clearance }): Pair   // end-wall post / side-wall slot
export const lipTab = (g, len): M                                 // lying, the lip's frame
export const lipPocket = (g, clearance, h, zc): M                 // standing, the deck's frame
export function pinJoint(g, { wall, clearance }): { pin, notch, hole }
export function earJoint(g, { wall, through, clearance }): { ear, slot, notch }
```
Rules: the female is the male grown by `clearance` in-plane (miter offset for the T,
`2·clearance` per axis for boxes) and run `OVER` past the faces it cuts; the male is the
exact shape. `earJoint.notch` is the pocket minus the tab it leaves standing. New `K`:
`lipTabT 5`, `lipTabW 12`, `earRoot 1`, `coverInset 14`, `coverBar 0.5`, `coverSeam 6`,
`riserL 20`. `Lane` gained `lapZ`; `Derived` lost `piny` (every pin piece is placed at
`d.py` with its own offset).

### Pose
```ts
export interface Pose { rotate: Vec3; translate: Vec3 }   // degrees; manifold order X, Y, Z, then move
export const stand = (m, p): M; export const lay = (m, p): M   // exact inverses
export function platePose(plate: PlateName, IW: number, xe: number): Pose
export const lipPose = (xd: number, tan: number): Pose
```
three.js `rotation.set(rx, ry, rz, "ZYX")` is `Rz·Ry·Rx` — X first, the same as manifold —
so the viewer converts degrees to radians and nothing else.

### Where it differs from the plan
- `panel()` and `recess()` helpers not built: the three border-inset rectangles and the
  two recesses share a depth and nothing else.
- Joint tests assert containment plus the bounding-box shell on both in-plane axes
  (`grownBy`), not the analytic shell volume; `ref.json` pins the real dimensions.
- The gang-anchor identity `gangInner(o,d) === d.gangPitch − d.IW/2` is asserted in
  `test/features.test.ts`, not `check()` — `check()` is user-facing FAIL strings.
- `tab`/`tabHole` retired; `buildWall` no longer adds its own ear tab (the notch leaves it).

### Snapshot
Phase 1 (23 commits) left `ref.json` byte-identical: every `+1/+2/+4` margin became
`OVER`, and `A ∪ (B ∪ extra-inside-A) = A ∪ B`, `A − (C ∪ extra-outside-A) = A − C`.
Phase 2 moved one part on purpose: the lip blade is `d.IW − 2·clearanceOf(o)` (0.25 a
side like every joint; was 0.5), so `end-lip` grew ±0.25 in y, +49 mm³.

### Phase 2 record
1. Lip blade → `clearanceOf` form. Done (above).
2. Cover grille radius → `rowsRadius(panelH, rows, k)` shared with `autoR`; the cover's
   `k` is `K.coverBar` (bars half the radius by design — a grille, not a lattice).
3. Cover inset and seam band → `K.coverInset`, `K.coverSeam`.
4. Riser length → `K.riserL`.
5. `d.piny` retired.
6. Ear root → `K.earRoot`. The minimal deck's `plinth` stays a named local (one site).
7. Flat-pack spec no longer names the 56° dovetail.
8. `Geo.assemble` names the adds-then-cuts protocol five builders used.

## Verification (as run)
- `bun run check` clean; `bun test test/` 840 pass; `bun run test:ui` 29 pass.
- `ref.json` identical through phase 1; phase 2 diff read: `end-lip` only.
