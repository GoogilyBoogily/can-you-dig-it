# Cleanup plan (2026-09-30)

Companion to `2026-09-30-hardening-plan.md`; the order at the bottom interleaves both. Built from
five Opus planners (geometry core, UI, solver/export/profiles + scripts, tests/docs,
cross-cutting dead code), then attacked by two Opus adversaries (fact-check against the code;
value vs churn and ordering). Their corrections are folded in. Cut steps are listed with reasons
so they are not re-proposed.

Baseline: `src/` + root scripts 3,399 lines, tests 2,084, CLAUDE.md 281, 23 specs + 1 plan.

**What the audit found.** Almost no dead code (~10 lines; every dependency earns its place). The
wins are: the WASM arena making ~55 lines of manual frees and their double-free traps disappear;
a 92-line `packFrame` with a one-implementation interface; builders that construct a whole joint
to keep one piece; copy-pasted UI wiring; and, biggest of all if the owner wants it, **deleting
option axes** rather than refactoring them (section D).

## Safety nets (every step)

- `bun run check && bun test test/`.
- Pure geometry refactor: `bun run ref && git diff --exit-code ref.json`. Last-digit float noise
  inside regress tolerance is acceptable; anything else, revert.
- Pure export/profile refactor: before the first such step, record SHA-256 of every entry in the
  unzipped default 3MF (P2S + PETG, keep-out on) at HEAD, in scratch; each step must match. (The
  zip carries a timestamp, so compare entries, not the zip.)
- UI-touching steps: `bun run test:ui`.
- A step that edits a test file lists the edit in its commit message; no assertion is weakened.

## A. Small, independent

A1. **Dead bits.** `private` on the unread `wasm` field (`geometry.ts:267`); unused `L` (`:460`);
    `Derived.run`; `package.json` `"module": "index.ts"` (no such file); `typescript` →
    devDependencies; `kx1 + margin - margin` → `kx1` (`export.ts:82`); `JOB_FLOW: number | null`
    branch (`main.ts:227-229`); `if (!built)` in `showTab`; viewer `cached` Set → read
    `geoms.values()` in `clear()` (`viewer.ts:106` uses it, so replace, don't just delete); unused
    `--ok` CSS; `build.ts:13` dead `public/` branch; the two CSS merges (field-label rule;
    `button.primary` in a list it never leaves). Un-export file-local symbols: `layWall`,
    `layEndWall`, `buildRiser`, `buildGridDeck`, `Part`, `buildFoot`, `hexCells`, `cells`,
    `slats`, `Process`, `Style`, `Limit`, `Pair`; drop `type Lattice` and `lay` from the
    re-exports. **Keep the `ROWS` re-export** (`test/pattern.test.ts:2` imports it). Unused imports
    in three tests (`pattern`, `pose`, `profile`) go in the same commit, listed. ~−30 lines.
A2. **UI de-duplication.** `field(name)` for 11 casts, `syncOutputs()`, `bindViewerToggle`,
    `setDownloadsEnabled`, `currentPicks()`, `picksForMachine()`; typed `post()` in the worker.
    ~−30/+15.
A3. **One mesh converter.** `meshDataOf` in `export.ts`, used by `worker.ts` and `slice.ts`.
A4. **Root clutter** (DECISION: deletes local, untracked data). `.remember/`, `.superpowers/` into
    the root `.gitignore`; delete `.playwright-mcp/`, `.superpowers/sdd/`, old `.slice/` runs
    (~430 MB). Keep the plugin dirs.

## B. Folded into hardening fixes (same commit as the fix it prepares)

B1+. **Arena (with hardening B1).** One scope per build that frees every shape made inside it:
  - Wrap the shape-returning methods on `Manifold.prototype` and `CrossSection.prototype`
    (`translate`, `rotate`, `mirror`, `add`, `subtract`, `intersect`, `offset`, `extrude`, …).
    ~40 % of handles come from these, not `Geo` factories. Wrappers exist only after
    `Module.setup()`: patch once per module with a guard (the worker makes a `new Geo` per build;
    tests, `ref.ts` and `slice.ts` share one module per process).
  - Scope = the worker's build: `buildAll` → `toMesh` → `filamentGrams`, freed in a `finally`
    that tolerates a kernel abort and skips handles already deleted (`union([x])` and
    `diff(a, [])` return their input; embind throws on a double delete). `last` holds typed
    arrays and the viewer gets `MeshData`, so nothing needed survives.
  - `filamentGrams` keeps its per-layer frees (or a nested scope): one build-wide scope would
    hold ~20 parts × ~270 slices at once.
  - Test snapshots (`snapshotParts`, `fitParts` in `test/geo.ts`) are cached per process: build
    them outside any scope, and B1's memory test must not be the first to touch them.
B2+. **Delete manual frees** right after B1: every `.delete()` in geometry/features and
    `freeSet`, except `filamentGrams`' per-layer frees. ~−50. Touches every geometry file, so it
    goes before any other geometry step.
B3+. **Worker client out of top level (with hardening B2).** `startWorker()` binds `onmessage`,
    `onerror`, `onmessageerror`; `onmessage` → `onBuilt` / `onFile` / `onError`. Respawn is then
    one call.
B4+. **HTML limits from `LIMITS` (with hardening B3).** One loop sets min/max on the 11 number
    inputs, run before `loadHash()` (`main.ts:518`). The `fit` and `lipGap` sliders keep their HTML
    attributes (a range input without them is 0–100 and would clamp `fit=-0.1` on load;
    `validate.ts` says those bounds must match).
B5+. **Bed sync and config parsing (with hardening B8).** `followBedOf(config)`; a note slot in
    `#profileNow` for the keep-out error; `parseConfig` once, `cornersOf` throwing on non-finite
    corners for bed and keep-out; `bedFromConfig` / `keepOutFromConfig` / `picksFromConfig` take
    the parsed object and the bare catch goes. `profiles.test.ts:64` expects `null` for
    "not json": that behaviour changes on purpose; the test edit needs the owner's OK (decision 8).
B6+. **Solver helpers (with hardening B6).** Hoist `usableD`; `laneNeeds.w` and `lanesAcross`
    share one `rowWidth(n, d, o)` (the comment demands they match; B6 changes the rule).
    `tiersFor` and `gramsEstimate` only if B5/B6 leave `layoutFor` hard to read.

## C. Structure (after hardening B4–B6)

C1. **`packFrame` 92 → ~35, and `pack()`'s signature** (DECISION: exported signature).
    `seatPart`, `centringShifts`, `placeSeat`, `translated`; two plain keep-out functions replace
    the one-implementation `KeepOut` interface; `gap` → `PLATE_GAP` constant,
    `pack(parts, bed, margin, keepOut = [])` (five test call sites drop a literal 6). Medium
    risk; `pack.test.ts` and the 3MF digest hold it.
C2. **Break the circular import with one leaf module** (DECISION: new file). `src/options.ts`:
    `Options`, `DEFAULTS`, the enums and `K`. `gridSpan` moves to `features/gridfinity.ts`.
    Features import `K` from `options.ts` and everything else as `import type`. Verified: `K` and
    `gridSpan` are the only runtime imports features take from `geometry.ts`. `geometry.ts`
    re-exports nothing; 28 files import it (16 tests), so importers of `Options`/`DEFAULTS`/`K`
    are edited (listed in the commit). Not `kernel.ts`, `lane.ts`, `estimate.ts`: more files, no
    simpler reading. Revisit only if `geometry.ts` is still over ~700 lines after B2+ and section
    D.
C3. **Stop building joints to keep one piece.** Export `tongueNotch` (today's `earPocket`) and
    `pin(g, wall)` from `joints.ts`: `wallNotches`, `buildRiser` and `buildGridDeck` stop making
    whole joints. One four-pin helper, one wall-outer-y helper. `halveAtSeam(g, m)` replaces only
    the two-way `isect` in `splitPlate`, `splitWall` and the cover, sized from the bounding box
    (the three boxes differ today: `2·max+20`, `L+20` cube, `L+20` × 10 tall); `splitPlate` keeps
    its tongue and socket. The box change can re-triangulate: ref decides.
C4. **Named numbers, only where a number repeats or hides a meaning.** Riser height 24 ×4 →
    `K.riserH` (the part name `riser-24` stays: it is in the 3MF, `parts.test.ts:75`,
    `export.test.ts:122`, `ref.json`). Tie layout (pitch 80, end 6, width 8, band half 10). The
    two plinth `+3`s get two names. Leave single-use numbers at their use. Not merged by value:
    `ln.xe - 3 - c` is a −X margin, not `K.post`; opening minimum 12 is not `K.lap`; the cover's
    40 is an area; `railHy` 20 is not the lip block 20. Open: the cover window's `canD + 8` —
    `K.slack` or its own name? Ask.
C5. **`solve`'s across/along ternary chains → a lookup table.** The other long builders read top
    to bottom and stay.
C6. **Viewer.** `bufferGeometry`, `standardMaterial`, `bedMesh` built once; `showAssembly` (83)
    → `addLane` / `addCans` / `addCoverAndRisers`; `cam`/`ren`/`COL`/`gI`/`xl` renamed. No
    `PLATE_POSE` table: poses live in `features/pose.ts` ("one set of numbers").

## D. Delete option axes (DECISION per axis — the biggest simplification on offer)

Deleting beats refactoring. Decide before sections B2+/C, so nobody refactors code that goes.
Each deletion is its own commit; ref loses keys only.

| Axis | Removes | Users lose |
|---|---|---|
| Magnets | ~8 src + 11 test lines, `grid-deck-magnets`, the only overhang exemption (`test/geo.ts:49`, so "no exceptions" is true again), B1's worst leak site (160 cylinders) | Magnets in Gridfinity feet (glue instead) |
| Patterns circle / kumiko / breeze (slat?) | ~40 of `lattice.ts`'s 149 lines, `fieldBottom`'s special case, slat cover path, 4 of 5 `ROWS` entries, ~24 ref keys, most of `pattern.test.ts`, a CLAUDE.md bullet, a spec | Looks only |
| across / along | `alignSpan` calls, 2 enums, limits, keys, 2 selects, `grid-deck-corner`, 17 test refs | Lane always centred on its cells |
| Manual cell size (`hexR`, `hexAuto`) | 2 inputs, a limit, 2 keys | Auto sizing is already the default |
| Feet base | `buildRiser`, `baseHeight` branch, `plateZ`, viewer line, part list | 24 mm risers for wire shelves |
| Minimal design | ~40 geometry lines in 5 branches, perforated cover, half the lane snapshot, ratio tests, bullet, spec | ~17 % filament |
| rearLoad | solver / `check()` / viewer branches, hardening B7 and C4 | Loading from the back (1 day old, unprinted) |
| Flat stack | solver path, `flat-` ref keys | Shelves too shallow to cascade |
| Gridfinity | `gridfinity.ts` 63, ~36 geometry sites, solver 9, viewer 9, 176 test lines, a spec, `shelfCells` | The Gridfinity use case |

## E. Docs and CLAUDE.md

E1. **Docs** (DECISION). Tag `design-history`, then delete the executed
    `plans/2026-09-20-feature-library.md` and the built specs whose content CLAUDE.md or the code
    already holds: flat-pack, drop-in-joints, sliding-slot-joints, feature-library,
    sleek-outside, print-settings-picker, translucent, gridfinity-base. **Keep** (content exists
    nowhere else): `minimal` (ligament buckling numbers, rail reasoning), `print-cost` (slice
    measurements; CLAUDE.md orders it updated), `plate-output` (sort-key dry run),
    `pattern-axis` (`ROWS` derivation table), `fit-calibration`, `clear-petg`,
    `gridfinity-spec.md` (`test/spec.test.ts` parses its path). Unbuilt specs: delete (the tag
    keeps them) or move to `docs/backlog/` (owner's call; assembly-guide and mixed-width-gang
    describe joints that no longer exist either way). Flatten `docs/superpowers/` →
    `docs/{specs,plans}` and say in CLAUDE.md where new ones go. Fix the links in
    `geometry.ts:22,29`, `profiles.ts:4`, `test/gridfinity.test.ts:3`. Verify: no `docs/…md`
    path in the repo points at a missing file. Replaces hardening B10's "Superseded" headers;
    B10's one-sentence magnet-exemption fix stays (moot if magnets go).
E2. **CLAUDE.md to ~170–180 lines, not 120.** It is this repo's design memory: cutting the
    rejected alternatives invites an agent to propose them again. Keep, compressed: the flat-pack
    in-plane rule and nothing sliding sideways; one tab spec, ears under both walls, `tabIn` /
    `tabClear` / `pinIn` derived; `fit` on every clearance; ref discipline; the Bambu 3MF quirks;
    `validate.ts` as the only gate; guarded `localStorage`; the `pack()` rules; `filamentGrams`
    sampling and the `JOB_FLOW` re-measure; `bun test test/`'s trailing slash; one bundler; the
    open-questions workflow; gridfinity-spec ↔ `K`; and one line per rejected alternative
    (rail-edge wall +15 %, half-laps, wall T in Y, 56° dovetail, trimmed gang stub, a baseplate
    we make, hand room as a constant, borrowed cover radius). Fix stale
    `Geo.cellsOf/cells/roundTop/roundOver`. After the naming step and the print's geometry
    changes, so it isn't stale on arrival. Verify: every backticked identifier greps in `src/`;
    list every dropped claim and where it now lives.
E3. README: link open-questions instead of "Known gaps" (check gap #3 first); drop the file list.

## F. Naming (last code step, one commit)

Glossary comment above `K` and `Derived` for the domain names (`K`, `IW`, `OW`, `L`, `H`, …).
Keep `o`, `d`, `g` as parameter conventions. Rename the cryptic, undocumented fields: `te`,
`ewh`, `xd`, `xe`, `dhi`, `lipx`, `px`/`py`, `lipy`, `railHy`, and locals `nt`, `tw`, `rd`,
`wcells`, `ecells`, `earJ`, `pinJ`, `bb` (~150 sites, CLAUDE.md and specs in the same commit).
Write the rule into CLAUDE.md Conventions; scratch locals get renamed only when touched.

## Cut, with reasons

- `src/pack.ts` split: a 340-line `export.ts` is fine; C1 is the real win.
- `src/summary.ts`: moves `JOB_FLOW` and forces four doc edits for no reading gain.
- `scripts/` + `public/` move and the `profile.ts`/`profiles.ts` renames: touch CI, URLs, test
  spawns and docs, simplify nothing.
- `kernel.ts`, `lane.ts`, `estimate.ts`: one leaf breaks the cycle.
- Splitting `buildDeck`, `laneOf`, `buildCover`: they read top to bottom; helpers used once add
  jumps.
- UI test harness: two files. B1's UI case goes into an existing file.
- Test-file merges (`islands` + `overhang`, `hex` → `pattern`, `spec` → `gridfinity`,
  validation → solver/pack): reshuffles that risk dropping tests. Only the true duplicate
  `front.test.ts:35` goes, after `pose.test.ts:38` widens to slopes `[0,3,7,10]`.
- Hash keys from `form.elements`: would write `preset`, `lipGapOut`, `fitOut` into every link
  and let any future field leak into shared links. `KEYS` stays explicit.
- `state` object for main.ts's 14 `let`s: indirection, same variables. Only `chosen` goes (it is
  always `layouts[chosenIndex]`).
- On-demand viewer rendering: revisit only if battery use gets complaints.

## Interleaved order (both plans)

Before the print: hardening A1 ✓, A2 ✓ → A3 coupon, A4 export → cleanup A1 → A4 (if approved) →
**owner decides section D**.

During the print: D deletions (one commit each) → hardening B1 + B1+ → B2+ → B2 + B3+ → B3 + B4+
→ B8 + B5+ → B5 → B6 + B6+ → B7 (drop if rearLoad goes) → B4 → B9 → cleanup A3, A2 → C1 → C4 →
C2 → C3 → C5 → C6 → E1.

After the print: hardening C1, C2 → C3 (on whatever axes remain) → C4, C5 → naming (F) → E2 → C6
(open-questions prune) → E3.

## Decisions for the owner

| # | Question | Recommended |
|---|---|---|
| 1 | Section D: which option axes to delete | Magnets and the three decorative patterns at least; the rest per your use |
| 2 | A4: delete local clutter (~430 MB, untracked) | Yes |
| 3 | C1: `pack()` loses its `gap` parameter | Yes |
| 4 | C2: one new leaf module `options.ts`, 28 importers edited | Yes |
| 5 | E1: tag, delete executed plan + 8 built specs, flatten docs; unbuilt specs deleted or `docs/backlog/` | Yes; delete the unbuilt ones too |
| 6 | C4: cover window `canD + 8` — `K.slack` or its own name | Its own name unless it is meant to track slack |
| 7 | Riser built only for a feet base (`ref.ts` builds a feet variant under the same key) | Yes (moot if feet go) |
| 8 | B5+: `profiles.test.ts:64` stops expecting `null` for "not json" (a bad config now fails loud) | Yes |
