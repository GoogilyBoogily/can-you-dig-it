# Snap joins Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Snap-fit prongs replace the plain pin and tab so a stack lifts as one piece, and each side of a unit picks tongue, socket or none.

**Architecture:** One prong-pair profile in `src/features/joints.ts` (`snapProfile`) drawn in a (u, v) frame - u along the prong toward its tip, v across, the flex direction - and placed by `pinJoint`, `earJoint`, the lip and the riser. The female is the male grown by the clearance (pin) or a 45° flare (tab, lip). Side joins move `gangs(o)` from "more than one lane" to "some edge carries a joint" and give `buildDeck` the two sides it carries.

**Tech Stack:** Bun, TypeScript strict, manifold-3d, three.js, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-11-snap-joins-design.md`

## Global Constraints

- Every clearance is `clearanceOf(o)` (`K.cl + o.fit`). No per-joint tolerance knobs.
- Flat-pack rule: no downward face flatter than 45° off the bed (`test/overhang.test.ts`), no exceptions.
- `ref.json` tolerances are not widened. Regenerate with `bun run ref` and read the diff.
- Identifiers spelled out, no abbreviations. Code comments in the file's existing voice.
- No `Co-Authored-By` or tool attribution in commits.
- UI copy plain. UI changes are checked by eye in Playwright before they are called done.

## Review Focus

- Fit 0.3: the hooks still sit inside their flares and chambers, and the lead-in clamps at the tab's tip instead of going below z = 0. Task 1 tests both clearances.
- A lone lane on a narrow shelf: the default left tongue costs 14 mm; the solver must charge it, not offer a layout `pack()` then refuses. Task 3.
- An old share link with no `left` / `right`: loads the defaults, does not throw. Task 4.
- Gridfinity: left / right read as none whatever the form says, so no tongue is built on a grid deck. Task 3.
- Hex lattice next to a relief slot: a cell touching a keep-out is dropped, not clipped, so no ligament under `K.ligMin`. Task 2 (`test/islands.test.ts` and `overhang.test.ts` stay green).

---

### Task 1: `snapProfile` and the hook numbers

**Files:**
- Modify: `src/geometry.ts` (`K`: `snapT` 1.6, `snapCatch` 0.5, `snapLen` 7, `snapFlare` 2)
- Modify: `src/features/joints.ts`
- Test: `test/features.test.ts`

**Interfaces:**
- Produces:
  - `snapProfile(g, spec: { width: number; tip: number; peak: number; hook: number; returnSlope: number; leadSlope: number }): CS` - two prongs `K.snapT` wide at v = ±width/2, u ∈ [0, tip], each with a hook `hook` proud, peaking at u = `peak`. The return face rises `returnSlope` in u per unit of v (tan of its angle off square), the lead-in falls `leadSlope` u per unit v. Clipped to u ≤ tip.
  - `snapRelief(g, width: number, root: number): CS` - the slots that free the prongs: the middle between them and one `K.snapT`-wide slot outside each, u ∈ [−root, OVER].
  - `snapTop(o): number` - how far the pin's tip stands above the wall top.

- [ ] **Step 1:** Failing tests: `snapProfile` at clearance K.cl and K.cl + 0.3 - its v extent is width/2 + hook, it has two bodies (the prongs), it never reaches u < 0 or u > tip; `snapTop(DEFAULTS)` ≈ 3.83.
- [ ] **Step 2:** `bun test test/features.test.ts` - fails, not exported.
- [ ] **Step 3:** Implement in `joints.ts` as a polygon per prong plus a hook triangle, unioned, mirrored for −v, intersected with `g.rect(-width, 0, width, tip)`.
- [ ] **Step 4:** Tests pass.

### Task 2: Pin, deck tab, lip and riser onto the snap

**Files:**
- Modify: `src/features/joints.ts` (`pinJoint`, `earJoint`, new `lipSnap`), `src/geometry.ts` (`buildWall` keep-outs, `buildLip`, `buildRiser`, `buildGridDeck`, `solve`'s `wallPlateY` / `plateZ`), `src/features/pose.ts` (`riserPose`), `src/viewer.ts` (stand the riser)
- Test: `test/features.test.ts`, `test/overhang.test.ts` (unchanged, must pass)

**Interfaces:**
- Consumes: `snapProfile`, `snapRelief`, `snapTop`.
- Produces: `pinJoint` returns `{ pin, notch, hole, relief }` (`relief` cut from the wall top); `earJoint` returns `{ ear, slot, notch }` with the slot flared and the notch carrying the relief; `K.pinH` stays only for the plain Gridfinity boss.

Pin (u = z up from the wall top, width `K.tabW`): return starts at u = coverT + c, `returnSlope` tan 30°, `leadSlope` 1 (45°), hook = c + snapCatch, tip at the lead-in's end. Notch = (male ∪ the tab rectangle up to the hook) offset by c, extruded through the wall, OVER below. Root = snapLen − peak.

Deck tab (u = notchH − z, tip at z = 0): peak at u = notchH − snapFlare + hook, `returnSlope` 1, `leadSlope` 1/tan 30°, hook = c + snapCatch. Slot flare: a trapezoid in x–z, half-width tabW/2 + c + snapFlare at z = 0 to tabW/2 + c at z = snapFlare, run OVER below, extruded over the slot's y. Root = snapLen − peak, relief from the notch ceiling up.

Lip: the deck tab's numbers with width `K.lipTabW`, tip = the tab's length, flare under each lip pocket in y.

Riser: the pin on its boss; the riser part is laid on its side for printing (`riserPose`), stood up in the viewer.

Lattice: `wallPerforation` keeps out a rectangle round each relief and chamber (tab ± (tabW/2 + snapT + border) in x, the relief's z span + border).

- [ ] **Step 1:** Failing tests in `features.test.ts`: for each joint at both clearances - the male sits inside the female, the shaft keeps the clearance a side, the hook's v reaches past the straight mouth or slot by `K.snapCatch`, the female leaves nothing below z = −OVER. Laid flat, a snapped wall slab has no overhang; a deck slab with a flared slot has none.
- [ ] **Step 2:** Run - fail.
- [ ] **Step 3:** Implement the joints, then wire `buildWall`, `buildDeck` (slots), `buildLip`, `buildRiser`, `buildGridDeck` (keeps `tabBox(K.pinH)` bosses), `solve()` (`wallPlateY` + `snapTop`), solver (`K.pinH` → `snapTop(o)` at the three stack-height sites).
- [ ] **Step 4:** `bun run check`, `bun test test/` - everything but `regress.test.ts` and plate counts in `pack.test.ts` green. `overhang.test.ts` and `islands.test.ts` must be green.
- [ ] **Step 5:** Commit: "Snap prongs replace the plain pin and tab: a stack lifts as one piece".

### Task 3: Per-side joins and end-lane decks

**Files:**
- Modify: `src/geometry.ts` (`Options.left` / `right`, `Side`, `SIDES`, `DEFAULTS`, `gangs`, `laneOf` tongues, `buildDeck(…, sides)`, `deckSides`, `buildLanePlates`, `PlateName`, `partList`, `buildGridDeckPlate`), `src/viewer.ts` (deck variant by lane index), `src/solver.ts` (`rowWidth`)
- Test: `test/gang.test.ts`, `test/solver.test.ts`

**Interfaces:**
- Produces:
  - `type Side = "tongue" | "socket" | "none"`, `SIDES`.
  - `deckSides(o, laneIndex): [Side, Side]` - +Y, −Y for lane `laneIndex` (0 = the +Y end) of `o.lanesWide`.
  - `deckVariant(o, laneIndex): "deck" | "deck-left-end" | "deck-right-end"`.
  - `buildDeck(g, o, d, ln, sides = deckSides(o, 1))`.
  - `gangs(o)`: not a grid, and some lane edge is a tongue or socket.
  - `outerTongues(o): number` - 0, 1 or 2 outer tongues, what `rowWidth` and `plateY` charge.

- [ ] **Step 1:** Failing tests: every left × right at 1, 2, 3 lanes gives the decks the spec's table says (names and counts in `partList`); a −Y tongue sits in a +Y socket at gangPitch with nothing touching; a single lane at left none, right none ends at its ears (the old single-lane test, now with the sides it asserts); `rowWidth` charges 14 per outer tongue.
- [ ] **Step 2:** Run - fail.
- [ ] **Step 3:** Implement. A −Y tongue is `gang.male.mirror([0,1,0])` at −gangInner; a +Y socket is `gang.female.mirror([0,1,0])` at +IW/2.
- [ ] **Step 4:** Green, bar `regress` and `pack` counts.
- [ ] **Step 5:** Commit: "Each side of a unit joins by tongue, socket or nothing".

### Task 4: UI

**Files:**
- Modify: `index.html` (Joins row), `src/validate.ts` (`left`, `right` against `SIDES`), `src/main.ts` (`KEYS`, disable on grid)
- Test: `test/validation.test.ts`, `test-ui/share.ui.test.ts`

- [ ] **Step 1:** Failing tests: `readForm` rejects `left=sideways`; a share link with `left=socket&right=none` restores both selects.
- [ ] **Step 2:** Run - fail.
- [ ] **Step 3:** Implement. Top select `name="stackable"`, values `on` / `off`.
- [ ] **Step 4:** Green. Then by hand: `bun run build.ts`, serve `dist/`, Playwright: change each select, screenshot, look; Gridfinity greys left/right.
- [ ] **Step 5:** Commit: "Joins row: top, left and right in the form and the share link".

### Task 5: Snapshot, coupon, slice, docs

- [ ] `bun run ref`, read the diff: lane plates, lip, cover, riser move, nothing else. `bun test test/regress.test.ts` green.
- [ ] `pack.test.ts`: read why each plate count moved before changing it.
- [ ] `bun run coupon.ts` builds; every piece one body.
- [ ] `bun run slice.ts`: update `JOB_FLOW`, `laneGrams`, `coverGrams` if the default job moved.
- [ ] `CLAUDE.md` tab and gang rules, `docs/open-questions.md` two entries, spec status.
- [ ] Full `bun run check`, `bun test test/`, `bun run test:ui`.
- [ ] Commit: "Snap joins: ref, coupon, docs".
