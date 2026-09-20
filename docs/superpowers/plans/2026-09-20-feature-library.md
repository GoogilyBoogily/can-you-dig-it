# Feature Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every joint in `src/geometry.ts` gets both halves from one spec in `src/features/`, the plate poses live in one place, and the lattice, recess and Gridfinity code move out of the composer — with `ref.json` byte-identical throughout.

**Architecture:** `src/features/*.ts` are free functions taking the `Geo` kernel wrapper and returning Manifolds built at a local origin (x along the lane, y = the wall's centreline, z = 0 at the deck underside / wall bottom); `geometry.ts` places them with `.translate()` (and `.mirror([0,1,0])` for the −Y wall) and stays the composer. Joints return `{ male, female }` or a named composite. Clearance is `clearanceOf(o)` in one place. The features import `K` and types from `../geometry`; `geometry.ts` imports the features — a module cycle that is safe because nothing in `features/` reads `K` at load time.

**Tech Stack:** Bun, TypeScript strict, manifold-3d (WASM), bun:test.

**Spec:** `docs/superpowers/specs/2026-09-20-feature-library-design.md`

## Global Constraints

- `ref.json` does not change in any task: `git diff --quiet ref.json` must exit 0 after every step. Never run `bun run ref` in this plan.
- `bun run check` (strict tsc) and `bun test test/` green after every task. Keep the trailing slash.
- Existing tests are not edited except `test/front.test.ts` (task 2, replaces its hand-written lip pose) and `test/overhang.test.ts` (task 8, imports `overhangArea` from `test/geo.ts` instead of defining it).
- No new dependencies. No anchor tables. No `Frame` type: no feature needs a rotation, so placement is `.translate()`.
- Every feature frees the intermediates it makes and returns only what the caller owns (manifold-3d has no GC).
- Commit messages: plain imperative, no attribution trailers (user rule).

---

### Task 1: `joints.ts` skeleton — one clearance, one overshoot

**Files:**
- Create: `src/features/joints.ts`
- Modify: `src/geometry.ts:160` (`fieldBottom`), `:556` (`tabHole`), `:581` (`lipPocket`), `:600` (`gangSocket`), `:659` (`buildWall`), `:783` (`splitDeck`)
- Test: `test/features.test.ts`

**Interfaces:**
- Produces: `clearanceOf(o: Options): number`, `OVER = 1`, `tabBox(g: Geo, len: number, wall: number, z0: number): M`

- [ ] **Step 1: Write the failing test**

```ts
// test/features.test.ts
// Every joint's two halves come from one spec here, so a tab cannot drift from its slot.
// Each pair is checked the same way: the male sits entirely inside the female (their
// intersection is the male), and the shell between them is exactly the clearance.
import { test, expect } from "bun:test";
import { K, DEFAULTS } from "../src/geometry";
import { clearanceOf, OVER, tabBox } from "../src/features/joints";
import { geo } from "./geo";

test("clearance is K.cl plus fit, and the overshoot is 1 mm", () => {
  expect(clearanceOf(DEFAULTS)).toBe(K.cl);
  expect(clearanceOf({ ...DEFAULTS, fit: 0.3 })).toBeCloseTo(K.cl + 0.3, 9);
  expect(OVER).toBe(1);
});

test("a tab box is tabW by tabT, flush with the wall's inner face", () => {
  const wall = DEFAULTS.wall;
  const box = tabBox(geo, 5, wall, 0).boundingBox();
  expect(box.max[0] - box.min[0]).toBeCloseTo(K.tabW, 6);
  expect(box.min[1]).toBeCloseTo(-wall / 2, 6); // inner face of a wall centred on y = 0
  expect(box.max[1]).toBeCloseTo(-wall / 2 + K.tabT, 6);
  expect(box.min[2]).toBeCloseTo(0, 6);
  expect(box.max[2]).toBeCloseTo(5, 6);
});
```

- [ ] **Step 2: Run it, expect failure**

Run: `bun test test/features.test.ts`
Expected: FAIL — `Cannot find module '../src/features/joints'`

- [ ] **Step 3: Create the module**

```ts
// src/features/joints.ts
// Joints as pieces: every function here builds both halves of one joint from one spec at
// a local origin - x along the lane, y the wall's centreline (+y toward the wall's outer
// face), z = 0 at the deck underside and the wall bottom - and geometry.ts places them.
// The female is the male grown by `clearance` in-plane and run OVER past the faces it
// cuts through; the male is the exact shape. That is the whole guarantee: a slot cannot
// drift from its tab because there is no second copy of the numbers.
import type { Manifold as M } from "manifold-3d";
import { K, type Geo, type Options } from "../geometry";

/** Every joint's clearance a side: the design's, plus the user's fit. */
export const clearanceOf = (o: Options) => K.cl + o.fit;

/** How far a cut runs past the face it opens on, and a fuse past the face it grows from.
 *  A union with extra inside the host, or a difference with extra outside it, is the same
 *  solid - so the number is free, and 1 mm keeps every boolean off a coplanar face. */
export const OVER = 1;

/** The one tab cross-section, tabW along x by tabT, flush with the inner face of a
 *  `wall`-thick wall centred on y = 0, from z0 up `len`. Pins, bosses and the tab a
 *  notch leaves standing are all this box. */
export const tabBox = (g: Geo, len: number, wall: number, z0: number): M =>
  g.box(K.tabW, K.tabT, len, 0, (K.tabT - wall) / 2, z0 + len / 2);
```

- [ ] **Step 4: Replace the six clearance spellings in `geometry.ts`**

Add the import at the top of `src/geometry.ts` after the manifold import:

```ts
import { clearanceOf } from "./features/joints";
```

Then, keeping every other character the same:

- `fieldBottom` (line 160): `K.deckLo + K.cl + o.fit + K.padRise` → `K.deckLo + clearanceOf(o) + K.padRise`
- `tabHole` (line 556): `const c = 2 * (K.cl + o.fit);` → `const c = 2 * clearanceOf(o);`
- `lipPocket` (line 581): `g.box(5 + 2 * (K.cl + o.fit), 12 + 2 * (K.cl + o.fit), h, x, y, z0)` → `g.box(5 + 2 * clearanceOf(o), 12 + 2 * clearanceOf(o), h, x, y, z0)`
- `gangSocket` (line 600): `K.cl + o.fit` → `clearanceOf(o)`
- `buildWall` (line 659): `const c = K.cl + o.fit;` → `const c = clearanceOf(o);`
- `splitDeck` (line 783): `const cl = K.cl + o.fit;` → `const cl = clearanceOf(o);`

Leave line 813 (`d.IW - 1 - 2 * o.fit`) alone: it is a different number and changing it moves the snapshot (phase 2).

- [ ] **Step 5: Run everything**

Run: `bun run check && bun test test/ && git diff --quiet ref.json && echo REF-OK`
Expected: tsc silent, all tests pass, `REF-OK`.

- [ ] **Step 6: Commit**

```bash
git add src/features/joints.ts src/geometry.ts test/features.test.ts
git commit -m "Feature library: clearanceOf and the tab box, one spelling of the clearance"
```

---

### Task 2: `pose.ts` — one pose per plate, used forward and inverse

**Files:**
- Create: `src/features/pose.ts`
- Modify: `src/geometry.ts:750-757` (`layWall`, `layEndWall`), `src/geometry.ts` exports
- Modify: `src/viewer.ts:172-179`, `src/viewer.ts:219`
- Modify: `test/front.test.ts:39-41`
- Test: `test/pose.test.ts`

**Interfaces:**
- Produces: `interface Pose { rotate: Vec3; translate: Vec3 }` (degrees; manifold order: X, then Y, then Z, then translate), `stand(m, pose)`, `lay(m, pose)`, `platePose(plate: PlateName, IW: number, xe: number): Pose`, `lipPose(xd: number, tan: number): Pose`. `geometry.ts` re-exports all of them.
- Consumes: `K.lipInset`, `K.deckLo` from geometry. `K.lipTabT` does not exist yet; task 5 adds it — until then `lipPose` uses the literal `5` with a comment.

- [ ] **Step 1: Write the failing test**

```ts
// test/pose.test.ts
// One pose per plate: geometry lays a plate flat with its inverse, the viewer stands it
// up with it, and this is the round trip that keeps those two the same function.
import { test, expect } from "bun:test";
import { DEFAULTS, solve, laneOf, buildDeck, buildWall, buildEndWall, buildLip, laneXe, K, type PlateName } from "../src/geometry";
import { platePose, lipPose, lay, stand } from "../src/features/pose";
import { geo } from "./geo";

const o = DEFAULTS, d = solve(o), ln = laneOf(o, d, "top");

const bounds = (m: ReturnType<typeof buildDeck>) => {
  const b = m.boundingBox();
  return [...b.min, ...b.max];
};

test("lay then stand returns every plate to where it was built", () => {
  const built: [PlateName, ReturnType<typeof buildDeck>][] = [
    ["deck", buildDeck(geo, o, d, ln)],
    ["wall-left", buildWall(geo, o, d, ln, 1)],
    ["wall-right", buildWall(geo, o, d, ln, -1)],
    ["end-wall", buildEndWall(geo, o, d, ln)],
  ];
  for (const [plate, m] of built) {
    const pose = platePose(plate, d.IW, laneXe(o, d));
    const back = stand(lay(m, pose), pose);
    const a = bounds(m), b = bounds(back);
    for (let i = 0; i < 6; i++) expect(b[i]).toBeCloseTo(a[i], 6);
  }
});

// laid flat the pins lie in-plane, so a wall's Z extent is its thickness alone
test("a laid wall lies outer face up on the bed", () => {
  const pose = platePose("wall-left", d.IW, laneXe(o, d));
  const flat = lay(buildWall(geo, o, d, ln, 1), pose).boundingBox();
  expect(flat.min[2]).toBeCloseTo(0, 6);
  expect(flat.max[2]).toBeCloseTo(o.wall, 6);
});

test("the lip stood up has its tab ending flush with the deck underside", () => {
  for (const slope of [0, 3, 10]) {
    const oo = { ...DEFAULTS, slope }, dd = solve(oo);
    const stood = stand(buildLip(geo, oo, dd), lipPose(-dd.L / 2, dd.tan));
    expect(stood.boundingBox().min[2]).toBeCloseTo(0, 6);
    expect(stood.boundingBox().min[0]).toBeCloseTo(-dd.L / 2 + 5.5, 6); // the pocket's near edge: lipx - lipTabT / 2
  }
});
```

- [ ] **Step 2: Run it, expect failure**

Run: `bun test test/pose.test.ts`
Expected: FAIL — `Cannot find module '../src/features/pose'`

- [ ] **Step 3: Create the module**

```ts
// src/features/pose.ts
// Where a plate stands in the lane frame. Every plate is modelled the way it prints;
// `lay` takes a lane-frame build flat for the bed and `stand` is its inverse, and the
// viewer builds its three.js pose from the same numbers - one place, not three.
import type { Manifold as M } from "manifold-3d";
import { K, type PlateName, type Vec3 } from "../geometry";

/** A standing transform: rotate about X, then Y, then Z (manifold's order), then move. */
export interface Pose { rotate: Vec3; translate: Vec3 }

export const stand = (m: M, p: Pose): M => m.rotate(p.rotate).translate(p.translate);

/** The inverse of `stand`: undo the move, then the rotations in reverse order. Each
 *  single-axis rotate is exact in manifold, so the round trip is clean. */
export const lay = (m: M, p: Pose): M => {
  const [rx, ry, rz] = p.rotate, [tx, ty, tz] = p.translate;
  return m.translate([-tx, -ty, -tz]).rotate([0, 0, -rz]).rotate([0, -ry, 0]).rotate([-rx, 0, 0]);
};

/** The deck is built flat. A side wall lies outer face up: the left one turns 180° so
 *  its outer face (+Y) comes up, both drop to y = 0 at their inner face. The end wall
 *  turns about Y and moves to the lane end. */
export function platePose(plate: PlateName, IW: number, xe: number): Pose {
  switch (plate) {
    case "deck": return { rotate: [0, 0, 0], translate: [0, 0, 0] };
    case "wall-left": return { rotate: [90, 0, 180], translate: [0, IW / 2, 0] };
    case "wall-right": return { rotate: [90, 0, 0], translate: [0, -IW / 2, 0] };
    case "end-wall": return { rotate: [0, 90, 0], translate: [xe, 0, 0] };
  }
}

/** The lip is built lying on its back with the blade at x ≤ 0; standing, the blade rises
 *  from the deck at the lip pocket, whose near edge is lipInset - half the 5 mm tab in
 *  from the deck start. (5 becomes K.lipTabT when the lip joint moves here.) */
export const lipPose = (xd: number, tan: number): Pose =>
  ({ rotate: [0, 90, 0], translate: [xd + K.lipInset - 5 / 2, 0, K.deckLo + K.lipInset * tan] });
```

- [ ] **Step 4: Use it in `geometry.ts`**

Replace lines 750–757 (`layWall`, `layEndWall`) with:

```ts
export { platePose, lipPose, lay, stand, type Pose } from "./features/pose";

/** Lay a side wall flat, outer face up. The viewer stands it back up with the same pose. */
export const layWall = (m: M, sy: number, IW: number): M => lay(m, platePose(sy > 0 ? "wall-left" : "wall-right", IW, 0));
export const layEndWall = (m: M, xe: number): M => lay(m, platePose("end-wall", 0, xe));
```

and add to the import block at the top of `geometry.ts`:

```ts
import { lay, platePose } from "./features/pose";
```

Why it is the same solid: today `layWall` is `rotate Z 180 → translate +IW/2 → rotate X −90`; `lay` is `translate −IW/2 → rotate Z −180 → rotate X −90`. `Rz(180)·p + (0, IW/2, 0)` equals `Rz(180)·(p − (0, IW/2, 0))` because `Rz(180)` negates y. Both are 90°-multiple rotations, which manifold applies exactly.

- [ ] **Step 5: Use it in the viewer**

In `src/viewer.ts` change the import (line 3) to add `platePose, lipPose, type Pose`, then replace lines 172–179 with:

```ts
    const IW = d.IW, xe = laneXe(o, d);
    const rad = (deg: number) => (deg * Math.PI) / 180;
    // plate -> lane frame: the same pose geometry lays the plate flat with. three.js
    // "ZYX" is manifold's order - X first, seen from the model
    const posed = (m: THREE.Object3D, p: Pose) => {
      m.rotation.set(rad(p.rotate[0]), rad(p.rotate[1]), rad(p.rotate[2]), "ZYX");
      m.position.set(...p.translate);
    };
    const pose: Record<string, (m: THREE.Object3D) => void> = {
      "deck": () => {},
      "wall-left": (m) => posed(m, platePose("wall-left", IW, xe)),
      "wall-right": (m) => posed(m, platePose("wall-right", IW, xe)),
      "end-wall": (m) => posed(m, platePose("end-wall", IW, xe)),
    };
```

and replace line 219 (`if (isBottom || !cascade) put(lane, "end-lip", -d.L / 2 + 5.5, 0, K.deckLo + K.lipInset * d.tan, false, [-2 * STEP, 0, 0], Math.PI / 2);`) with:

```ts
        if (isBottom || !cascade) { const lp = lipPose(xd, d.tan); put(lane, "end-lip", ...lp.translate, false, [-2 * STEP, 0, 0], rad(lp.rotate[1])); }
```

(`xd` is already computed on line 218, just above.)

- [ ] **Step 6: Use it in `test/front.test.ts`**

Replace lines 39–41:

```ts
    const stood = stand(buildLip(geo, o, d), lipPose(-d.L / 2, d.tan));
    expect(stood.boundingBox().min[2]).toBeCloseTo(0, 6);
```

and add `stand, lipPose` to its geometry import on line 5.

- [ ] **Step 7: Run everything**

Run: `bun run check && bun test test/ && git diff --quiet ref.json && echo REF-OK`
Expected: green, `REF-OK`. Then `bun run test:ui` once (the viewer changed).

- [ ] **Step 8: Commit**

```bash
git add src/features/pose.ts src/geometry.ts src/viewer.ts test/front.test.ts test/pose.test.ts
git commit -m "One pose per plate: geometry lays with it, the viewer and front test stand with it"
```

---

### Task 3: `tSlotJoint` — the deck splice

**Files:**
- Modify: `src/features/joints.ts`
- Modify: `src/geometry.ts:770-789` (`tSlot`, `splitDeck`)
- Test: `test/features.test.ts`

**Interfaces:**
- Produces: `interface Pair { male: M; female: M }`, `tProfile(g, neck, head, grow): CS`, `tSlotJoint(g, spec: { neck: number; head: number; clearance: number; zb: number; H: number }): Pair`
- `tProfile` is `tSlot` with `vc` dropped: every caller passed `0`.

- [ ] **Step 1: Write the failing test**

Append to `test/features.test.ts`:

```ts
import { tSlotJoint } from "../src/features/joints";

/** The male sits entirely inside the female: their intersection is the male. */
const fits = (j: { male: M; female: M }) =>
  expect(geo.isect(j.male, j.female).volume()).toBeCloseTo(j.male.volume(), 3);

test("the splice T: tongue inside socket, socket wider by the clearance", () => {
  for (const clearance of [K.cl, K.cl + 0.3]) {
    const j = tSlotJoint(geo, { neck: K.spliceBase, head: K.spliceTip, clearance, zb: 0, H: 100 });
    fits(j);
    const s = j.female.boundingBox(), t = j.male.boundingBox();
    expect(s.max[1] - t.max[1]).toBeCloseTo(clearance, 6);
    expect(t.min[0]).toBeCloseTo(-K.spliceDepth, 6);
    expect(s.min[0]).toBeCloseTo(-K.spliceDepth - clearance, 6);
  }
});
```

Add `import type { Manifold as M } from "manifold-3d";` at the top of the test file.

- [ ] **Step 2: Run it, expect failure**

Run: `bun test test/features.test.ts`
Expected: FAIL — `tSlotJoint` is not exported.

- [ ] **Step 3: Move the T into `joints.ts`**

Delete `tSlot` (geometry.ts lines 770–777) and add to `joints.ts`:

```ts
import type { CrossSection as CS } from "manifold-3d";

export interface Pair { male: M; female: M }

/** The T in profile, pointing -X from the seam: a `neck`-wide neck spliceNeck deep, then a
 *  `head`-wide head to spliceDepth, centred on y = 0. Grown by `grow`, it is the socket: a
 *  miter offset of a right-angled outline is the same outline, bigger. */
export const tProfile = (g: Geo, neck: number, head: number, grow = 0): CS => {
  const n = neck / 2, h = head / 2, xn = -K.spliceNeck, xh = -K.spliceDepth;
  const t = g.poly([[0.5, -n], [0.5, n], [xn, n], [xn, h], [xh, h], [xh, -h], [xn, -h], [xn, -n]]);
  if (!grow) return t;
  const grown = t.offset(grow, "Miter");
  t.delete();
  return grown;
};

/** The x = 0 splice: the tongue is the T through the plate from `zb` (the underside) to
 *  H; the caller intersects it with the plate so it carries the deck's slope. The socket
 *  is the grown T, OVER taller each way. */
export function tSlotJoint(g: Geo, spec: { neck: number; head: number; clearance: number; zb: number; H: number }): Pair {
  const { neck, head, clearance, zb, H } = spec;
  const male = g.prismZ(tProfile(g, neck, head), H - zb, zb - OVER);
  const female = g.prismZ(tProfile(g, neck, head, clearance), H + 2 * OVER - zb, zb - OVER);
  return { male, female };
}
```

- [ ] **Step 4: Use it in `splitDeck`**

Replace `splitDeck` (lines 782–789) with:

```ts
export function splitDeck(g: Geo, o: Options, d: Derived, ln: Lane, deck: M, zb = 0): [M, M] {
  const w = d.plateY; // wider than any tongue; the floor of a grid deck is this wide
  const wedge = g.prismY(deckProfile(g, d, ln, zb), w, -w / 2);
  const t = tSlotJoint(g, { neck: K.spliceBase, head: K.spliceTip, clearance: clearanceOf(o), zb, H: ln.H });
  const tongue = g.isect(wedge, t.male);
  return splitPlate(g, deck, tongue, t.female);
}
```

Extend the joints import in geometry.ts: `import { clearanceOf, tSlotJoint } from "./features/joints";`. Also fix `gangT` (line 585–586), which called `tSlot`:

```ts
const gangT = (g: Geo, tx: number, y0: number, grow = 0): CS =>
  tProfile(g, K.earW, K.gangHead, grow).rotate(-90).translate([tx, y0]);
```

and import `tProfile` too. (Task 4 replaces this line again.)

- [ ] **Step 5: Run everything**

Run: `bun run check && bun test test/ && git diff --quiet ref.json && echo REF-OK`
Expected: green, `REF-OK`.

- [ ] **Step 6: Commit**

```bash
git add src/features/joints.ts src/geometry.ts test/features.test.ts
git commit -m "tSlotJoint: the deck splice tongue and socket from one T"
```

---

### Task 4: `gangJoint` — tongue and socket, plus the anchor identity

**Files:**
- Modify: `src/features/joints.ts`
- Modify: `src/geometry.ts:583-600` (`gangT`, `gangTongue`, `gangSocket`), `:617-618` (`buildDeck`)
- Test: `test/features.test.ts`

**Interfaces:**
- Produces: `gangJoint(g, spec: { run: number; clearance: number; through: number }): Pair` at origin = the T's root line (y = 0 where the neck starts, T pointing +Y). `male` = the ear-wide run from y = −run to 0 plus the T, `K.deckLo` tall from z = 0; `female` = the grown T from z = −OVER through `through + OVER`.
- Exports `gangInner` from geometry (it was private) so the anchor identity can be tested.

- [ ] **Step 1: Write the failing test**

Append to `test/features.test.ts`:

```ts
import { gangJoint } from "../src/features/joints";
import { solve, gangInner } from "../src/geometry";

test("the gang T: tongue inside socket at every clearance", () => {
  for (const clearance of [K.cl, K.cl + 0.3]) {
    const j = gangJoint(geo, { run: 10, clearance, through: 20 });
    fits(j);
    expect(j.male.boundingBox().min[1]).toBeCloseTo(-10, 6); // the run reaches back to the ear root
    expect(j.male.boundingBox().max[1]).toBeCloseTo(K.spliceDepth, 6); // the T's head, +Y
    expect(j.female.boundingBox().max[2]).toBeCloseTo(21, 6);
  }
});

// The tongue is placed at gangInner in its own lane and the socket at -IW/2 in the
// neighbour's; they meet only because gangPitch = OW + gangGap. Nothing in geometry.ts
// asserts that, so this does.
test("the gang anchors agree across the pitch", () => {
  const d = solve(DEFAULTS);
  expect(gangInner(DEFAULTS, d) - d.gangPitch).toBeCloseTo(-d.IW / 2, 9);
});
```

- [ ] **Step 2: Run it, expect failure**

Run: `bun test test/features.test.ts`
Expected: FAIL — `gangJoint` / `gangInner` not exported.

- [ ] **Step 3: Add `gangJoint`**

In `joints.ts`:

```ts
/** The gang joint the deck carries: an ear-wide run back to the ear root, then a T
 *  (ear-wide neck, gangHead head, the splice depths) pointing +Y from the origin. The
 *  socket is the grown T cut through the neighbour's rail from below the deck. */
export function gangJoint(g: Geo, spec: { run: number; clearance: number; through: number }): Pair {
  const { run, clearance, through } = spec;
  const t = (grow = 0) => tProfile(g, K.earW, K.gangHead, grow).rotate(-90);
  const runBox = g.box(K.earW, run, K.deckLo, 0, -run / 2, K.deckLo / 2);
  const head = g.prismZ(t(), K.deckLo);
  const male = g.union([runBox, head]);
  runBox.delete(); head.delete();
  const female = g.prismZ(t(clearance), through + 2 * OVER, -OVER);
  return { male, female };
}
```

- [ ] **Step 4: Use it in `buildDeck`**

Delete `gangT`, `gangTongue`, `gangSocket` (geometry.ts lines 583–600). Export `gangInner`: change `const gangInner =` to `export const gangInner =` (line 568). In `buildDeck`, replace lines 617–619:

```ts
    const inner = gangInner(o, d);
    const gang = gangJoint(g, { run: inner - (IW / 2 - 1), clearance: clearanceOf(o), through: ln.dhi });
    adds.push(gang.male.translate([tx, inner, 0]));
    cuts.push(gang.female.translate([tx, -IW / 2, 0]));
    gang.male.delete(); gang.female.delete();
    cuts.push(tabHole(g, o, "x", ln.dhi + 4, tx, inner - K.tabT / 2, -1));
```

Check against the old code: the run was `box(K.earW, inner - root, K.deckLo, tx, (root + inner)/2, ...)` with `root = IW/2 - 1`, i.e. y from `root` to `inner`; the T sat at `y0 = inner`. Placing the joint's origin at `inner` gives the run y ∈ [inner − run, inner] = [root, inner]. The socket was `prismZ(gangT(tx, -IW/2, cl), dhi + 4, -1)`, z ∈ [−1, dhi + 3]; now z ∈ [−1, dhi + 1] — still above the deck top (`te < dhi`), so the cut is the same.

Import `gangJoint` in geometry.ts and drop `tProfile` from the import if nothing else uses it.

- [ ] **Step 5: Run everything**

Run: `bun run check && bun test test/ && git diff --quiet ref.json && echo REF-OK`
Expected: green (`test/gang.test.ts` included), `REF-OK`.

- [ ] **Step 6: Commit**

```bash
git add src/features/joints.ts src/geometry.ts test/features.test.ts
git commit -m "gangJoint: tongue and socket from one T, and the anchor identity under test"
```

---

### Task 5: the lip tab — `5 × 12` gets a name

**Files:**
- Modify: `src/geometry.ts:75-108` (`K`), `:575-581` (`lipPocket`), `:804-818` (`buildLip`)
- Modify: `src/features/joints.ts`, `src/features/pose.ts`
- Test: `test/features.test.ts`

**Interfaces:**
- Produces: `K.lipTabT = 5`, `K.lipTabW = 12`; `lipTab(g, len): M` (the tab as the lip lies: `len` along x, `lipTabW` across, `lipTabT` thick from z = 0); `lipPocket(g, clearance, h, zc): M` (the pocket in the deck, centred on z = zc — the deck cuts it at z = 10, the grid deck at 0).
- This joint's two halves live in different plate frames, so they are two functions reading one pair of constants rather than a `Pair`.

- [ ] **Step 1: Write the failing test**

Append to `test/features.test.ts`:

```ts
import { lipTab, lipPocket } from "../src/features/joints";
import { stand, lipPose } from "../src/features/pose";

test("the lip tab, stood up, sits inside its pocket", () => {
  for (const clearance of [K.cl, K.cl + 0.3]) {
    const tab = stand(lipTab(geo, 4.4), lipPose(-K.lipInset + K.lipTabT / 2, 0)); // pose puts the pocket's near edge at x = 0 here
    const pocket = lipPocket(geo, clearance, 40, 10).translate([K.lipTabT / 2, 0, 0]);
    expect(geo.isect(tab, pocket).volume()).toBeCloseTo(tab.volume(), 3);
    expect(pocket.boundingBox().max[1] - tab.boundingBox().max[1]).toBeCloseTo(clearance, 6);
  }
});
```

- [ ] **Step 2: Run it, expect failure**

Run: `bun test test/features.test.ts`
Expected: FAIL — `lipTab` not exported / `K.lipTabT` undefined.

- [ ] **Step 3: Add the constants and the two functions**

In `K` (geometry.ts, after `tabW: 16, ... earW: 24,`):

```ts
  // the lip's tab is its own shape, 5 thick by 12 wide, and its pocket is turned 90° from
  // it: the lip lies on its back to print and stands on the deck
  lipTabT: 5, lipTabW: 12,
```

In `joints.ts`:

```ts
/** The lip's tab, as the lip lies to print: `len` along x from 0, lipTabW across y,
 *  lipTabT thick from z = 0. */
export const lipTab = (g: Geo, len: number): M =>
  g.box(len, K.lipTabW, K.lipTabT, len / 2, 0, K.lipTabT / 2);

/** The pocket that tab drops into, cut in the deck with the tab standing: lipTabT along x,
 *  lipTabW along y, each plus the clearance a side, `h` tall centred on z = zc. */
export const lipPocket = (g: Geo, clearance: number, h: number, zc: number): M =>
  g.box(K.lipTabT + 2 * clearance, K.lipTabW + 2 * clearance, h, 0, 0, zc);
```

- [ ] **Step 4: Use them in `geometry.ts`**

Delete the old `lipPocket` (lines 575–581). In `buildDeck` line 647:

```ts
    cuts.push(lipPocket(g, clearanceOf(o), 40, 10).translate([ln.lipx, sy * d.lipy, 0]));
```

In `buildGridDeck` line 888:

```ts
  for (const sy of [1, -1]) cuts.push(lipPocket(g, clearanceOf(o), 2, 0).translate([ln.lipx, sy * d.lipy, 0]));
```

In `buildLip`, replace `const t = 5;` with `const t = K.lipTabT;` and line 815 with:

```ts
  for (const sy of [1, -1]) parts.push(lipTab(g, tabLen).translate([0, sy * d.lipy, 0]));
```

In `pose.ts`, `lipPose`: replace `5 / 2` with `K.lipTabT / 2` and delete the parenthetical in its comment.

Import `lipTab, lipPocket` in geometry.ts.

- [ ] **Step 5: Run everything**

Run: `bun run check && bun test test/ && git diff --quiet ref.json && echo REF-OK`
Expected: green, `REF-OK`. `test/spec.test.ts` checks `K` against the Gridfinity doc only; the new keys do not touch it.

- [ ] **Step 6: Commit**

```bash
git add src/features/joints.ts src/features/pose.ts src/geometry.ts test/features.test.ts
git commit -m "Lip tab and pocket read one pair of constants, K.lipTabT and K.lipTabW"
```

---

### Task 6: `crossLap` — the corner post and its slot

**Files:**
- Modify: `src/features/joints.ts`
- Modify: `src/geometry.ts:675-683` (`wallNotches`), `:727-733` (`buildEndWall`)
- Test: `test/features.test.ts`

**Interfaces:**
- Produces: `crossLap(g, spec: { wall: number; lapZ: number; H: number; clearance: number }): Pair` at origin x = the end wall's inner face, y = the side wall's centreline. `male` = the end wall's post, `wall × wall`, from `lapZ` to `H`; `female` = the side wall's slot, wider by the clearance, `OVER` deeper each side in y and `OVER` past the top.

- [ ] **Step 1: Write the failing test**

```ts
import { crossLap } from "../src/features/joints";

test("the corner cross-lap: post inside slot, slot open at the wall top", () => {
  for (const clearance of [K.cl, K.cl + 0.3]) {
    const j = crossLap(geo, { wall: 6, lapZ: 20, H: 80, clearance });
    fits(j);
    expect(j.male.boundingBox().min[2]).toBeCloseTo(20, 6);
    expect(j.male.boundingBox().max[2]).toBeCloseTo(80, 6);
    expect(j.female.boundingBox().max[2]).toBeCloseTo(81, 6);
    expect(j.female.boundingBox().max[0] - j.male.boundingBox().max[0]).toBeCloseTo(clearance, 6);
  }
});
```

- [ ] **Step 2: Run it, expect failure**

Run: `bun test test/features.test.ts`
Expected: FAIL — `crossLap` not exported.

- [ ] **Step 3: Add `crossLap`**

```ts
/** The corner: the end wall keeps a wall-square post from the lap line to the tier top,
 *  and the side wall is slotted from its top edge down to that line to take it. The
 *  origin is the end wall's inner face on the side wall's centreline. */
export function crossLap(g: Geo, spec: { wall: number; lapZ: number; H: number; clearance: number }): Pair {
  const { wall, lapZ, H, clearance } = spec;
  const male = g.box(wall, wall, H - lapZ, wall / 2, 0, (H + lapZ) / 2);
  const female = g.box(wall + 2 * clearance, wall + 2 * OVER, H - lapZ + OVER, wall / 2, 0, (H + lapZ + OVER) / 2);
  return { male, female };
}
```

- [ ] **Step 4: Use it**

`wallNotches` (line 679–680) becomes:

```ts
  cuts.push(crossLap(g, { wall: o.wall, lapZ: ln.te + K.lap, H: ln.H, clearance: c }).female.translate([ln.xe, sy * d.py, 0]));
```

(the male is unused here — build only what is needed: split `crossLap` into the pair but have this call site keep the male reference and delete it, or accept one stray Manifold per wall; do the former:)

```ts
  const lap = crossLap(g, { wall: o.wall, lapZ: ln.te + K.lap, H: ln.H, clearance: c });
  cuts.push(lap.female.translate([ln.xe, sy * d.py, 0])); lap.male.delete(); lap.female.delete();
```

`buildEndWall` (lines 731–733) becomes:

```ts
  const lap = crossLap(g, { wall: o.wall, lapZ: te + K.lap, H, clearance: clearanceOf(o) });
  const adds = [g.box(o.wall, IW, ewh - te, xe + o.wall / 2, 0, (ewh + te) / 2)];
  for (const sy of [1, -1]) adds.push(lap.male.translate([xe, sy * d.py, 0]));
  lap.male.delete(); lap.female.delete();
```

Remove the now-unused `const lapZ = te + K.lap;` from `buildEndWall`.

- [ ] **Step 5: Run everything**

Run: `bun run check && bun test test/ && git diff --quiet ref.json && echo REF-OK`
Expected: green (`test/splice.test.ts` corner tests included), `REF-OK`.

- [ ] **Step 6: Commit**

```bash
git add src/features/joints.ts src/geometry.ts test/features.test.ts
git commit -m "crossLap: the corner post and slot from one spec"
```

---

### Task 7: `pinJoint` — pin, notch above, cover hole

**Files:**
- Modify: `src/features/joints.ts`
- Modify: `src/geometry.ts` — `buildWall:664`, `wallNotches:681`, `buildRiser:823-826`, `buildGridDeck:887`, `buildCover:897`
- Test: `test/features.test.ts`

**Interfaces:**
- Produces: `pinJoint(g, spec: { wall: number; clearance: number }): { pin: M; notch: M; hole: M }`, all at origin (pin x, wall centreline, z = 0 at the pin's root). `pin` = `tabBox(K.pinH)` from z = 0; `notch` = the wall above's notch, `tabW + 2c` wide, `wall + 2·OVER` deep in y (centred on the wall, which is why it swallows the pin's 1.5 mm inner-face offset), `pinH + c` tall from `−OVER`; `hole` = the cover's through hole, `tabW + 2c × tabT + 2c` at the pin's y, `coverT + 2·OVER` tall from `−OVER`.

- [ ] **Step 1: Write the failing test**

```ts
import { pinJoint } from "../src/features/joints";

test("the pin: inside the notch above and the cover hole at every clearance", () => {
  for (const clearance of [K.cl, K.cl + 0.3]) {
    const j = pinJoint(geo, { wall: 6, clearance });
    expect(geo.isect(j.pin, j.notch).volume()).toBeCloseTo(j.pin.volume(), 3);
    expect(geo.isect(j.pin, j.hole).volume()).toBeCloseTo(j.pin.volume(), 3);
    expect(j.pin.boundingBox().max[2]).toBeCloseTo(K.pinH, 6);
    expect(j.hole.boundingBox().max[0] - j.pin.boundingBox().max[0]).toBeCloseTo(clearance, 6);
  }
});
```

- [ ] **Step 2: Run it, expect failure**

Run: `bun test test/features.test.ts`
Expected: FAIL — `pinJoint` not exported.

- [ ] **Step 3: Add `pinJoint`**

```ts
/** A pin on a wall top (or a boss on a riser or a grid deck) and what receives it: the
 *  notch in the bottom of the wall above, centred on the wall so the pin's offset to the
 *  inner face is inside it, and the hole through the cover. */
export function pinJoint(g: Geo, spec: { wall: number; clearance: number }): { pin: M; notch: M; hole: M } {
  const { wall, clearance: c } = spec;
  const pin = tabBox(g, K.pinH, wall, 0);
  const notch = g.box(K.tabW + 2 * c, wall + 2 * OVER, K.pinH + c + OVER, 0, 0, (K.pinH + c - OVER) / 2);
  const hole = g.box(K.tabW + 2 * c, K.tabT + 2 * c, K.coverT + 2 * OVER, 0, (K.tabT - wall) / 2, K.coverT / 2);
  return { pin, notch, hole };
}
```

- [ ] **Step 4: Use it at all five sites**

The pin used to overlap its host by 1 mm (`K.pinH + 1` from `H − 1`); now it stands on the host's face from z = H. A union across a shared face is the same solid, and manifold's boolean is exact on coplanar faces.

`buildWall` line 664:

```ts
  const pinJ = pinJoint(g, { wall: o.wall, clearance: c });
  for (const sx of [1, -1]) adds.push(pinJ.pin.translate([sx * d.px, sy * d.py, H]));
```

`wallNotches` line 681:

```ts
  for (const sx of [1, -1]) cuts.push(pinJ.notch.translate([sx * d.px, sy * d.py, 0]));
```

— pass `pinJ` into `wallNotches` as a parameter (`pinJ: ReturnType<typeof pinJoint>`) from `buildWall`, and after `buildWall`'s final `g.diff` free it: `pinJ.pin.delete(); pinJ.notch.delete(); pinJ.hole.delete();`. Delete the local `notch` helper's pin use (the ear notch on line 678 still uses `notch(K.earW, ...)` until task 8).

`buildRiser` (lines 823–826):

```ts
export function buildRiser(g: Geo, o: Options, h: number): M {
  const side = 20; // the foot's length along the lane; it was a parameter no caller set
  const pinJ = pinJoint(g, { wall: o.wall, clearance: 0 }); // the boss is the male: clearance is the notch's
  // the boss is centred on the riser, not flush with an inner face - a riser has none
  const boss = pinJ.pin.translate([0, (o.wall - K.tabT) / 2, h]);
  const riser = g.union([g.box(side, o.wall, h, 0, 0, h / 2), boss]);
  pinJ.pin.delete(); pinJ.notch.delete(); pinJ.hole.delete(); boss.delete();
  return riser;
}
```

`buildGridDeck` line 887:

```ts
  const pinJ = pinJoint(g, { wall: o.wall, clearance: 0 });
  for (const sx of [1, -1]) for (const sy of [1, -1]) adds.push(pinJ.pin.translate([sx * d.px, sy * d.py, 0]));
```

then free `pinJ` after the final `g.diff`. Check: `d.py + (K.tabT − o.wall)/2 = IW/2 + wall/2 + tabT/2 − wall/2 = IW/2 + tabT/2 = d.piny` ✓ the old y.

`buildCover` line 897:

```ts
  const pinJ = pinJoint(g, { wall: o.wall, clearance: clearanceOf(o) });
  for (const sx of [1, -1]) for (const sy of [1, -1]) cuts.push(pinJ.hole.translate([sx * d.px, sy * d.py, 0]));
```

then free `pinJ` after `const m = g.diff(plate, cuts);`. Old hole: z ∈ [−1, t + 1]; new: `coverT + 2·OVER` centred at `coverT/2` → z ∈ [−1, t + 1] ✓.

- [ ] **Step 5: Run everything**

Run: `bun run check && bun test test/ && git diff --quiet ref.json && echo REF-OK`
Expected: green, `REF-OK`. If `regress` reports a wall or cover volume moved by more than 1e-4 relative, the coplanar pin union is the suspect: put the `OVER` overlap back on the wall pin (`tabBox(g, K.pinH + OVER, wall, -OVER)` placed at `H`) and re-run — do not regenerate.

- [ ] **Step 6: Commit**

```bash
git add src/features/joints.ts src/geometry.ts test/features.test.ts
git commit -m "pinJoint: pin, notch above and cover hole from one spec"
```

---

### Task 8: `earJoint` — ear, slot, notch, tab

**Files:**
- Modify: `src/features/joints.ts`
- Modify: `src/geometry.ts` — `tab`/`tabHole` (548–559, delete), `buildDeck:612-619, 646`, `buildWall:663`, `wallNotches:676-678`
- Modify: `test/overhang.test.ts:16-37` (move `overhangArea` to `test/geo.ts`), `test/geo.ts`
- Test: `test/features.test.ts`

**Interfaces:**
- Produces: `earJoint(g, spec: { wall: number; through: number; clearance: number }): { ear: M; slot: M; notch: M }` at origin (tab x, wall centreline, z = 0). `ear` = deck add, `earW × (wall + OVER)` rooted `OVER` into the deck, `deckLo` tall; `slot` = deck cut, the tab hole `tabW + 2c × tabT + 2c` at the tab's y, from `−OVER` to `through + OVER`; `notch` = wall cut, `earW + 2c` wide, `wall + 2·OVER` deep, `deckLo + c` tall from `−OVER`, minus the tab it leaves standing.
- The gang tongue's own tab hole (`buildDeck:619`) is the same `slot` placed at `gangInner − wall/2`.
- `overhangArea(mesh, magnets?)` exported from `test/geo.ts`.

- [ ] **Step 1: Move `overhangArea` to the fixture**

Cut lines 14–37 of `test/overhang.test.ts` (from `const STEEPEST_OVERHANG` through the end of `overhangArea`) into `test/geo.ts`, prefix the function with `export`, add `import { K } from "../src/geometry";` there if missing, and in `test/overhang.test.ts` import it: `import { fitParts, snapshotParts, overhangArea } from "./geo";`. Run `bun test test/overhang.test.ts` — still green.

- [ ] **Step 2: Write the failing test**

```ts
import { earJoint } from "../src/features/joints";
import { platePose, lay } from "../src/features/pose";
import { overhangArea } from "./geo";

test("the ear joint: the wall's tab fills the ear's slot, the ear fills the notch", () => {
  for (const clearance of [K.cl, K.cl + 0.3]) {
    const wall = 6, deckLo = K.deckLo;
    const j = earJoint(geo, { wall, through: 30, clearance });
    // what the notch leaves standing in a wall slab is the tab, and it sits in the slot
    const slab = geo.box(60, wall, 40, 0, 0, 20);
    const notched = geo.diff(slab, [j.notch]);
    const tab = geo.isect(notched, geo.box(60, wall + 1, deckLo + clearance, 0, 0, (deckLo + clearance) / 2));
    expect(geo.isect(tab, j.slot).volume()).toBeCloseTo(tab.volume(), 3);
    expect(tab.boundingBox().max[0] - tab.boundingBox().min[0]).toBeCloseTo(K.tabW, 6);
    // the ear sits in the notch
    expect(geo.isect(j.ear, geo.diff(slab, [notched])).volume()).toBeCloseTo(j.ear.volume(), 3);
    expect(j.ear.boundingBox().min[1]).toBeCloseTo(-wall / 2 - 1, 6); // rooted 1 mm into the deck
    // laid flat outer face up, a notched wall has nothing hanging
    expect(overhangArea(lay(notched, platePose("wall-left", 0, 0)))).toBe(0);
  }
});
```

- [ ] **Step 3: Run it, expect failure**

Run: `bun test test/features.test.ts`
Expected: FAIL — `earJoint` not exported.

- [ ] **Step 4: Add `earJoint`**

```ts
/** The joint that carries a deck on a wall: the deck puts an ear out under the wall with
 *  a slot through it; the wall notches over the ear and leaves its tab standing in the
 *  notch to drop through the slot to the wall top below. Origin at the tab's x on the
 *  wall's centreline; +y is out through the wall. The ear roots OVER into the deck. */
export function earJoint(g: Geo, spec: { wall: number; through: number; clearance: number }): { ear: M; slot: M; notch: M } {
  const { wall, through, clearance: c } = spec;
  const ear = g.box(K.earW, wall + OVER, K.deckLo, 0, -OVER / 2, K.deckLo / 2);
  const slot = g.box(K.tabW + 2 * c, K.tabT + 2 * c, through + 2 * OVER, 0, (K.tabT - wall) / 2, through / 2);
  const notchH = K.deckLo + c;
  const pocket = g.box(K.earW + 2 * c, wall + 2 * OVER, notchH + OVER, 0, 0, (notchH - OVER) / 2);
  const tab = tabBox(g, notchH + 2 * OVER, wall, -OVER);
  const notch = g.diff(pocket, [tab]);
  pocket.delete(); tab.delete();
  return { ear, slot, notch };
}
```

Check against today: ear `box(earW, wall + 1, deckLo, tx, sy·(IW/2 + wall/2 − 0.5), deckLo/2)` → centre y = py − 0.5 ✓ (`−OVER/2`); slot = `tabHole(…, dhi + 4, tx, sy·piny, −1)` → z ∈ [−1, dhi + 3] then, [−1, dhi + 1] now, both above the deck top; notch = `box(earW + 2c, wall + 2, notchH + 1, tx, sy·py, (notchH − 1)/2)` minus `tab(…, notchH + 2, tx, piny, −1)` ✓ identical.

- [ ] **Step 5: Use it, and delete `tab` / `tabHole`**

`buildDeck`: replace the `ear` lambda (line 612) and the loop (615–620) with:

```ts
  const earJ = earJoint(g, { wall: o.wall, through: ln.dhi, clearance: clearanceOf(o) });
  const at = (m: M, tx: number, sy: number) => (sy < 0 ? m.mirror([0, 1, 0]) : m).translate([tx, sy * d.py, 0]);
  const keyed = (tx: number) => gangs(o) && Math.abs(tx - ln.lipx) > 20;
  const cuts: M[] = [];
  for (const tx of ln.tabs) {
    if (!keyed(tx)) { adds.push(at(earJ.ear, tx, 1), at(earJ.ear, tx, -1)); continue; }
    const inner = gangInner(o, d);
    const gang = gangJoint(g, { run: inner - (IW / 2 - 1), clearance: clearanceOf(o), through: ln.dhi });
    adds.push(gang.male.translate([tx, inner, 0]));
    cuts.push(gang.female.translate([tx, -IW / 2, 0]));
    gang.male.delete(); gang.female.delete();
    cuts.push(earJ.slot.translate([tx, inner - o.wall / 2, 0])); // the neighbour wall's tab, through the tongue
  }
```

and line 646 with `for (const tx of ln.tabs) cuts.push(at(earJ.slot, tx, sy));`, and before the final `return g.diff(...)`: `const deck = g.diff(g.union(adds), cuts); earJ.ear.delete(); earJ.slot.delete(); earJ.notch.delete(); return deck;`.

Why `mirror` is safe: the ear and the slot are boxes symmetric in x and z; mirroring in y negates y coordinates exactly, so `at(m, tx, −1)` lands where `sy · (…)` put the old box. The gang slot: old `tabHole(…, tx, inner − K.tabT/2, −1)` centred y = `inner − tabT/2`; new: slot centre `(tabT − wall)/2` + `inner − wall/2` = `inner + tabT/2 − wall` ✗ — **not the same**. Use instead:

```ts
    cuts.push(earJ.slot.translate([tx, inner - K.tabT / 2 - (K.tabT - o.wall) / 2, 0]));
```

which is `inner − tabT/2` ✓. Write it as `inner + (o.wall - 2 * K.tabT) / 2` with a comment: the neighbour wall's inner face is at `inner`, its tab flush inside it.

`buildWall` line 663: delete it (the tab the notch leaves is the wall's own material; the add was always inside the slab). `wallNotches` lines 676–678:

```ts
  const earJ = earJoint(g, { wall: o.wall, through: 0, clearance: c });
  const cuts = ln.tabs.map((tx) => (sy < 0 ? earJ.notch.mirror([0, 1, 0]) : earJ.notch).translate([tx, sy * d.py, 0]));
```

and free `earJ` at the end of `buildWall` alongside `pinJ`. (The notch is symmetric in y; the mirror is there so the code reads the same as the deck's, and costs nothing.)

Delete `tab` and `tabHole` (lines 548–559). `bun run check` will list any remaining caller.

- [ ] **Step 6: Run everything**

Run: `bun run check && bun test test/ && git diff --quiet ref.json && echo REF-OK`
Expected: green (`islands`, `splice`, `gang`, `pattern` all exercise this), `REF-OK`.

- [ ] **Step 7: Commit**

```bash
git add src/features/joints.ts src/geometry.ts test/features.test.ts test/geo.ts test/overhang.test.ts
git commit -m "earJoint: ear, slot and notch from one spec; tab and tabHole retired"
```

---

### Task 9: `lattice.ts` — the pattern cells out of `Geo`

**Files:**
- Create: `src/features/lattice.ts`
- Modify: `src/geometry.ts:9` (`Lattice`), `:21-27` (`ROWS`), `:144-158` (`ligFor`, `autoR`), `:323-436` (`hexCells`, `cells`, `cellsOf`, `slats`), callers at `:697`, `:742`, `:927`, `:930`
- Modify: `test/pattern.test.ts:73` (`geo.cellsOf(...)` → `cellsOf(geo, ...)`)

**Interfaces:**
- Produces: `cellsOf(g, p, R, t, panel, keep)`, `cells(g, lat, bounds, holes, cell)`, `hexCells(g, …)`, `slats(g, …)`, `ROWS`, `ligFor`, `autoR`, `Lattice`. `geometry.ts` re-exports `ROWS`, `ligFor`, `autoR`, `type Lattice`.
- Adds `Geo.circle(r, seg = 48): CS` (the four `this.CrossSection.circle` calls need it from outside the class).

- [ ] **Step 1: Add `Geo.circle`**

```ts
  circle(r: number, seg = 48): CS {
    return this.CrossSection.circle(r, seg);
  }
```

- [ ] **Step 2: Move the code**

Create `src/features/lattice.ts` with the header comment, `import type { CrossSection as CS } from "manifold-3d"; import { K, type Geo, type Pattern, type Vec2 } from "../geometry";`, then paste `Lattice`, `ROWS`, `ligFor`, `autoR`, and the four methods turned into functions: `this.` → `g.`, `this.CrossSection.circle(…)` → `g.circle(…)`, `this.CrossSection.union(x)` → `g.cs2d(...x)`, `this.poly` → `g.poly`, `this.rect` → `g.rect`, recursive calls `this.cells(` → `cells(g, `, `this.hexCells(` → `hexCells(g, `, `this.slats(` → `slats(g, `. Every function's first parameter is `g: Geo`. Export all of them.

In `geometry.ts`: delete the moved code; add `import { cellsOf, ligFor, autoR, ROWS } from "./features/lattice";` and `export { ROWS, ligFor, autoR, type Lattice } from "./features/lattice";`. Replace the four call sites: `g.cellsOf(` → `cellsOf(g, `. `roundOver` still uses `this.CrossSection.circle`; leave it (task 10 moves it).

`test/pattern.test.ts:73`: `import { cellsOf } from "../src/features/lattice";` and `cellsOf(geo, pattern, d.hexR, d.lig, panel, [])`.

- [ ] **Step 3: Run everything**

Run: `bun run check && bun test test/ && git diff --quiet ref.json && echo REF-OK`
Expected: green, `REF-OK`. `test/hex.test.ts` and `test/pattern.test.ts` cover `autoR`/`ROWS` through geometry's re-export.

- [ ] **Step 4: Commit**

```bash
git add src/features/lattice.ts src/geometry.ts test/pattern.test.ts
git commit -m "lattice.ts: the pattern cells as functions of the kernel, out of Geo"
```

---

### Task 10: `pocket.ts` — recess depth, round-over, round-top

**Files:**
- Create: `src/features/pocket.ts`
- Modify: `src/geometry.ts:299-306` (`roundOver`), `:438-466` (`roundTop`), `:706-707` and `:744-745` (the recess block), callers `:665`, `:738-739`, `:814`, `:895`

**Interfaces:**
- Produces: `recessDepth(o): number` — `o.wall − (minimal ? K.ligMin : K.web)`, or `0` when that is ≤ 0.2 (the two copies' guard); `roundOver(g, u, top, side, r): CS`; `roundTop(g, body, plan, top, r, pads?, steps?): M`.

- [ ] **Step 1: Write the failing test**

Append to `test/features.test.ts`:

```ts
import { recessDepth } from "../src/features/pocket";

test("the recess goes down to the web, and not at all on a wall no thicker than it", () => {
  expect(recessDepth(DEFAULTS)).toBeCloseTo(DEFAULTS.wall - K.web, 9);
  expect(recessDepth({ ...DEFAULTS, design: "minimal" })).toBeCloseTo(DEFAULTS.wall - K.ligMin, 9);
  expect(recessDepth({ ...DEFAULTS, wall: K.web + 0.1 })).toBe(0);
});
```

- [ ] **Step 2: Run it, expect failure**

Run: `bun test test/features.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the module and move the two helpers**

```ts
// src/features/pocket.ts
// Pockets in the print face and the rounds on a top edge: the recess a wall's outer
// face takes down to its web, and the two fillet substitutes (manifold has none).
import type { CrossSection as CS, Manifold as M } from "manifold-3d";
import { K, type Geo, type Options } from "../geometry";

/** How deep the outer-face recess goes: the wall less the web it leaves (the ligament
 *  width on the minimal design). Nothing under 0.2 mm: a recess that thin is a skin. */
export const recessDepth = (o: Options): number => {
  const rd = o.wall - (o.design === "minimal" ? K.ligMin : K.web);
  return rd > 0.2 ? rd : 0;
};
```

then paste `roundOver` and `roundTop` from `Geo` as `export function roundOver(g: Geo, …)` / `export function roundTop(g: Geo, …)` with `this.` → `g.` and `this.CrossSection.circle` → `g.circle`. Delete them from `Geo`.

- [ ] **Step 4: Use them**

In `wallPerforation` (706–707): `const rd = recessDepth(o); if (rd) {`. In `buildEndWall` (744–745): `const rd = recessDepth(o); if (rd) cuts.push(…)`. Callers: `g.roundOver(` → `roundOver(g, ` (lines 665, 738, 739); `g.roundTop(` → `roundTop(g, ` (814, 895). Import from `./features/pocket`.

- [ ] **Step 5: Run everything**

Run: `bun run check && bun test test/ && git diff --quiet ref.json && echo REF-OK`
Expected: green, `REF-OK`.

- [ ] **Step 6: Commit**

```bash
git add src/features/pocket.ts src/geometry.ts test/features.test.ts
git commit -m "pocket.ts: recessDepth once, roundOver and roundTop out of Geo"
```

---

### Task 11: `gridfinity.ts` — the unit under the deck

**Files:**
- Create: `src/features/gridfinity.ts`
- Modify: `src/geometry.ts:828-890` (`buildFoot`, `buildGridDeck`)

**Interfaces:**
- Produces: `buildFoot(g, over): M` (moved verbatim) and `gridUnit(g, d, magnets: boolean): { floor: M; skirt: M | null; pockets: M[] }` — everything of `buildGridDeck` between `const z0 = -K.unitH;` and the `adds` array: the outline, the feet clipped to it, the skirt, the magnet pockets. `buildGridDeck` stays in `geometry.ts` as the composer: deck + floor + skirt + bosses − pockets − lip pockets.

- [ ] **Step 1: Create the module**

```ts
// src/features/gridfinity.ts
// The Gridfinity unit a shelf lane's deck grows below z = 0: a floor of whole cells with
// the spec foot proud under every one, a skirt where the lane runs past its floor, and
// magnet pockets in every foot. docs/gridfinity-spec.md has every number and its K.
import type { Manifold as M } from "manifold-3d";
import { K, gridSpan, type Derived, type Geo } from "../geometry";

// buildFoot pasted here verbatim, exported

/** The floor of feet clipped to the bin outline, the skirt beside it, and the magnet
 *  pockets, all in the lane frame with the unit from -unitH to 0. A pocket the seam
 *  would halve is skipped. */
export function gridUnit(g: Geo, d: Derived, magnets: boolean): { floor: M; skirt: M | null; pockets: M[] } {
  const { floorCells: [nx, ny], floor: [fx0, fy0, fx1, fy1] } = d;
  const footH = K.footChamferLo + K.footWall + K.footChamferHi;
  const z0 = -K.unitH;
  const lane = g.rect(-d.L / 2, -d.OW / 2, d.L / 2, d.OW / 2);
  const outline = g.roundedRect(gridSpan(nx), gridSpan(ny), K.footR).translate([(fx0 + fx1) / 2, (fy0 + fy1) / 2]).add(lane);
  const skirtCS = lane.subtract(g.rect(fx0 - 2 * K.gridGap, fy0 - 2 * K.gridGap, fx1 + 2 * K.gridGap, fy1 + 2 * K.gridGap));
  const foot = buildFoot(g, K.unitH - footH + 0.5);
  const cx = (i: number) => fx0 - K.gridGap + (i + 0.5) * K.gridPitch, cy = (j: number) => fy0 - K.gridGap + (j + 0.5) * K.gridPitch;
  const feet: M[] = [], pockets: M[] = [];
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
    feet.push(foot.translate([cx(i), cy(j), z0]));
    if (magnets) for (const sx of [1, -1]) for (const sy of [1, -1]) {
      const mx = cx(i) + sx * K.magnetPitch / 2;
      if (d.split && Math.abs(mx) < K.magnetR + 1) continue;
      pockets.push(g.cyl(K.magnetR, K.magnetDepth + 1, mx, cy(j) + sy * K.magnetPitch / 2, z0 - 1));
    }
  }
  const clip = g.prismZ(outline, K.unitH, z0);
  const floor = g.isect(g.union(feet), clip);
  const skirt = skirtCS.isEmpty() ? null : g.prismZ(skirtCS, K.unitH, z0);
  clip.delete(); foot.delete(); lane.delete(); outline.delete(); skirtCS.delete();
  return { floor, skirt, pockets };
}
```

Carry over the three comment blocks from `buildGridDeck` (the r3.75 corners / skirt, the corner pit, the no-fit-on-magnets note) to their lines in `gridUnit`. Keep the boolean order: `union(feet)` then `isect` with the outline prism, as today.

- [ ] **Step 2: Slim `buildGridDeck`**

```ts
export function buildGridDeck(g: Geo, o: Options, d: Derived, ln: Lane, deck: M): M {
  const unit = gridUnit(g, d, o.magnets);
  const adds = [deck, unit.floor];
  if (unit.skirt) adds.push(unit.skirt);
  const pinJ = pinJoint(g, { wall: o.wall, clearance: 0 });
  for (const sx of [1, -1]) for (const sy of [1, -1]) adds.push(pinJ.pin.translate([sx * d.px, sy * d.py, 0]));
  const cuts = [...unit.pockets];
  for (const sy of [1, -1]) cuts.push(lipPocket(g, clearanceOf(o), 2, 0).translate([ln.lipx, sy * d.lipy, 0]));
  const out = g.diff(g.union(adds), cuts);
  pinJ.pin.delete(); pinJ.notch.delete(); pinJ.hole.delete();
  return out;
}
```

Delete `buildFoot` from geometry.ts; import `gridUnit` from `./features/gridfinity`.

- [ ] **Step 3: Run everything**

Run: `bun run check && bun test test/ && git diff --quiet ref.json && echo REF-OK`
Expected: green (`test/gridfinity.test.ts` measures the foot profile, boss volume, magnet volume, skirts), `REF-OK`.

- [ ] **Step 4: Commit**

```bash
git add src/features/gridfinity.ts src/geometry.ts
git commit -m "gridfinity.ts: the unit under the deck as one feature"
```

---

### Task 12: Docs — CLAUDE.md layout and the spec's phase-2 list

**Files:**
- Modify: `CLAUDE.md` (Layout section)
- Modify: `docs/superpowers/specs/2026-09-18-flat-pack-design.md:25-26` (stale dovetail line)

- [ ] **Step 1: CLAUDE.md**

After the `src/geometry.ts` bullet in Layout, add:

```
- `src/features/` — the pieces `geometry.ts` composes, each built at a local origin (x
  along the lane, y the wall's centreline, z = 0 at the deck underside) and placed with
  `.translate()` / `.mirror([0,1,0])`. `joints.ts`: every joint from one spec — `earJoint`,
  `pinJoint`, `crossLap`, `tSlotJoint`, `gangJoint`, `lipTab`/`lipPocket`; `clearanceOf(o)`
  is the only spelling of `K.cl + o.fit`, `OVER` the only overshoot. `pose.ts`: `platePose`
  / `lipPose`, used by `lay` in geometry and stood back up in the viewer — one set of
  numbers. `lattice.ts` (cells, `ROWS`, `autoR`), `pocket.ts` (`recessDepth`, rounds),
  `gridfinity.ts` (`gridUnit`). `test/features.test.ts` holds every pair to "male inside
  female, shell = clearance". Spec in `docs/superpowers/specs/2026-09-20-feature-library-design.md`.
```

- [ ] **Step 2: Flat-pack spec**

Replace the sentence at lines 25–26 that names the 56° dovetail with: "Every joint is straight-sided; the only downward faces are the Gridfinity foot chamfers at 45° and a magnet pocket's ceiling (see `test/overhang.test.ts`)."

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md docs/superpowers/specs/2026-09-18-flat-pack-design.md
git commit -m "Docs: src/features in the layout; the flat-pack rule without the dovetail"
```

---

## Phase 2 (separate commits, each with `bun run ref` and a read diff — not in this plan)

1. Lip blade width `d.IW - 1 - 2 * o.fit` (`buildLip`) → `clearanceOf(o)` form.
2. Cover grille radius `(OW - 28 - 1) / (a + bb / 2)` → `autoR` with `ligFor`, or a comment on why the cover's ligament is `R/2`.
3. Cover field inset `14` and seam band `6` → `K`.
4. Riser `side = 20` → `K`.
5. `pinJoint.notch` centred on the wall while the pin is flush inside: one anchor.
6. Ear root `OVER` and deck plinth `max(earW, gangHead)/2 + 3` → named.

## Self-review

- Spec coverage: joints (tasks 3–8), lattice (9), recess/rounds (10), gridfinity (11), pose (2), clearance (1), tests (1–8, 10), docs (12). The spec's `Frame`/`place` collapsed to `.translate()` + `.mirror()` because no feature needs a rotation — noted in Global Constraints.
- Names used across tasks: `clearanceOf`, `OVER`, `tabBox`, `Pair`, `tProfile`, `tSlotJoint`, `gangJoint`, `gangInner`, `lipTab`, `lipPocket`, `K.lipTabT`, `K.lipTabW`, `crossLap`, `pinJoint` (`pin`/`notch`/`hole`), `earJoint` (`ear`/`slot`/`notch`), `platePose`, `lipPose`, `lay`, `stand`, `Pose`, `cellsOf`, `Geo.circle`, `recessDepth`, `roundOver`, `roundTop`, `gridUnit`, `buildFoot`, `overhangArea` — each defined before use.
- Task 7's coplanar-union risk and task 8's gang-slot y are the two places a number could move; both have the check spelled out.
