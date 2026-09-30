# Hardening and completion plan (2026-09-30)

Baseline: `bun run check` clean, `bun test test/` 860 pass, `bun run test:ui` 31 pass (run twice, no
flakes). Built from five read-only discovery audits (spec status, geometry/solver bug hunt, trust
boundaries, tests/CI, open-questions triage), then attacked by three adversarial audits
(fact-check with re-run repros, sequencing/YAGNI, regression risk). Their corrections are folded
in; where they disagreed, the resolution is stated.

Rules for every step: one commit per step; `bun run check && bun test test/` green before it;
a step that moves geometry carries `bun run ref` and a read diff. No test is loosened to pass —
steps that move a pinned number say so and wait for an OK.

**Sequencing principle.** The first print is the biggest risk reducer, so it goes early. It only
blocks work that *moves geometry the print tests*. Everything else (leaks, solver arithmetic,
error paths, tests, docs) runs while the printer does.

## Track A — before the print

A1. **Clear-PETG spec, corrected, plus its decided part (was 0.1, 0.2, 5.1).** One commit.
  - Spec step 4 also names `test/profiles.test.ts:104` (sorted key list, `toEqual`).
  - Bed values are `["60"]` (`Record<string,string[]>`, `profiles.ts:109`).
  - "every plate temp 60" → hot, textured, eng and their `_initial_layer` keys; cool and
    supertack untouched.
  - Build D3: six keys into the `/PETG/` block (`profiles.ts:111`); tests: line 104, PETG asserts
    `["60"]`, PLA asserts `hot_plate_temp` undefined. Verify with `bun run slice.ts`: gcode has
    `M140 S60`.
  - Hint `index.html:161`: name what prints (process's 2 walls, 15 % grid), drop "6 % gyroid".
    `filamentGrams` keeps 0.06: it already reads +4.6 % heavy against a 15 % slice.
  - Commit with `docs/open-questions.md`.
A2. **Pin Bun** in `.github/workflows/pages.yml` (`bun-version: 1.4.2`, the local version).
A3. **Joint coupon — built 2026-09-30: `bun run coupon.ts`.** ~30 min print: one ear + slot + notch, one
    splice T, one gang tongue/socket, cut from real geometry at fit 0. Catches gross binding
    before ~10 h of plates. Needs a small `coupon` script or export; no app feature.
A4. **Export the default job** from HEAD, confirm plates 5–8 and 15–18 are what the print plan
    names.

## Gate — THE PRINT

Default shelf 300 × 520 × 240, P2S 0.4, 0.20mm Standard, Bambu PETG Basic, fit 0, plates 5–8 and
15–18. Checks in `docs/open-questions.md` Next steps 1. The clear-PETG tile test is a separate
print and is not part of the gate (bed 60 °C moves elephant foot; fit found there doesn't carry).

## Track B — in parallel with the print (does not move tested geometry)

B1. **WASM heap leak (was 1.1). DONE `1a21a15`** (the 20-rebuild UI case was not added; the bun heap test covers the arena, the UI suite the worker wiring). manifold-3d 3.5.3 registers no finalizer on
    `Manifold`; every handle not `.delete()`d stays. Flat leaks ~3–7 MB/build (234 handles),
    Gridfinity ~12.5 MB (magnets off) to ~25 MB (magnets on); the worker aborts after 60–125
    rebuilds. Biggest sites: `buildGridDeckPlate` (`geometry.ts:830-832`, whole deck and
    `buildDeck()` result never freed), `assemble` inputs at `:716` (160 magnet cylinders,
    floor, skirt), `gridfinity.ts:58` union; then ~50 small sites (`splitPlate` boxes,
    `joints.ts:74-76,97-101,117-118,130,135`, lattice unions, `poly` CrossSections).
    - **DECISION: per-build arena vs per-site deletes.** Recommended: arena in `Geo` — every
      `Manifold` made during a build is tracked, and everything but the returned parts is freed
      at the end. Per-site deletes are ~50 edits with an aliasing trap (`Geo.union([x])`
      returns `x`, `diff(a, [])` returns `a` — double free). The arena is a new pattern, hence
      the ask.
    - The arena's design and traps (method-made shapes, patch after `setup()`, `finally` that
      survives an abort, `filamentGrams` per-layer frees, cached test snapshots) are in
      `2026-09-30-cleanup-plan.md` B1+. Build it to that.
    - Test: manifold exposes no live count and is lazy (no `.volume()` → nothing allocated). So:
      build + evaluate every part (`.volume()`) for 3 warm-up builds, then assert RSS growth over
      the next 5 stays under a bound. WASM heap never shrinks: assert a plateau, not a drop.
      Run for flat default and Gridfinity with magnets.
    - UI: one `test-ui/` case, 20 rebuilds, no error in the status line.
    - Spot-check `viewer.ts` disposes three.js geometries across rebuilds (same class, GPU side).
B2. **Worker recovery (was 1.6, shrunk).** With B1 fixed a build is short and `buildId` already
    drops stale results, so no terminate-on-supersede. Two things only:
    - `main.ts:159`: an error from a superseded build (`r.id !== buildId`) goes to
      `console.warn`, not `fail()`.
    - After a kernel abort (`Aborted()` / `RuntimeError`), the module is poisoned: terminate,
      create a new Worker, re-bind `onmessage` / `onerror` / `onmessageerror`, rebuild once.
      `last` is lost, which is safe: downloads are locked while a build is pending.
B3. **Job-size cap (was 2.6).** Lower the shelf maxima in `LIMITS` (`validate.ts`) — recommended
    2000 mm per axis — instead of a new "job size" concept. A 5000³ link today is 7595 plates,
    33 s, 66 MB. Test: `validation.test.ts` rejects 2001. Check no UI preset exceeds it.
B4. **`check()` skips the end wall (was 1.2).** Laid size is OW × (end-wall height − deck line),
    per role (top/bottom). Add it to the bed check in both orientations, through the same
    keep-out-aware rule `pack` uses. Test as a property: for a sweep of narrow beds (incl.
    [120,256,256] canD 120, and a P1S keep-out bed), every layout `check()` passes also packs.
    Include a rearLoad top tier (no end wall there, lower tiers still have one). No ref change.
B5. **Solver: pin height (was 1.4).** The top wall is `H + K.pinH`; `K.coverT === K.pinH`, so
    one `pinH` per stack covers cover or no cover. Add it in `layoutFor` *and* `laneNeeds` in
    the same commit, or `solver.test.ts`'s "fits / 1 mm under doesn't" test breaks. Pinned
    shelves (254, 240 tall) and the 12-inch fourth can are unaffected.
B6. **Solver: gang stub (was 1.3). BLOCKED ON A DECISION.** The +Y end deck reaches `gangReach`
    (17) past its wall; `n·gangPitch` already holds one gap, so the row is 14 mm wider than
    charged. Charging it honestly makes the **default 300 mm shelf drop to 1 lane** (296 >
    300 − 8), halving the default job and breaking `test-ui/profile.ui.test.ts:249/252`
    (20/18 plates) and likely the hours test at 236. Widths that lose a lane: 290–303, 431–444.
    Options:
    - (a) Charge it in full; the default job becomes 1 lane unless the default shelf widens.
    - (b) Let the stub use the side gap: a 296 row on a 300 shelf leaves 2 mm a side. Charge
      the real row (`n·gangPitch + 14`) against `w − SIDE_GAP` (`solver.ts:18`, 4 a side), so
      the row keeps ≥ 2 mm each side. Recommended: it tells the truth and the default job
      survives.
    - (c) Trim the stub (separate end deck, a fifth plate name). Rejected on 2026-09-22.
    Whichever: only when `gangs(o)`, in `lanesAcross` and `footprint[0]`, and n is computed
    with the stub charged, falling back to n = 1 without it.
B7. **Rear-load in the solver.** Even-tier cascades with `rearLoad` on only warn in `check()`.
    Rank them below odd counts in `rank()` (`solver.ts:127`). Retires an open question with no
    print.
B8. **Fail loud at the boundaries (was 2.1–2.4).**
    - Keep-out parse failure (`main.ts:300`): message in `#profileNow`, not `setStatus`
      ("Building parts…" overwrites that at once).
    - `picksFromConfig` bare catch (`profiles.ts:147`): log it. Expect noise in
      `profiles.test.ts:64`.
    - `extractProfile` (`export.ts:304`): an oversize entry says "too large", not "not found".
      The header-lies-about-size case is dropped: fflate truncates silently and length always
      equals the header, so the proposed length check could never fail; a CRC check is not worth
      it for the user's own file.
    - **DECISION 2.5, imported 3MF's bed (recommended: sync it).** Today only `applyPicks` reads
      the bed (`main.ts:315,440`), so an A1 mini 3MF exports plates packed for 256. If yes: run
      `bedFromConfig` in the import path, make it throw on non-finite corners, and validate
      *before* `adoptProfile` stores anything.
B9. **Tests that can fail (was Phase 3).** One commit, after B4–B6 so fixture changes are read
    once.
    - Grid has no tongues: `laneOf(grid, d, "bottom").tongues` is `[]`
      (`gridfinity.test.ts:54-60` asserts nothing about them).
    - Shell = clearance on X for the gang T (`features.test.ts:50`, containment only) and the
      lip pocket (`:111`, Y only). The splice T already checks both axes.
    - Pack count: keep the hand list in `pack.test.ts:24-32` and assert once that `partList`
      matches it (building the expectation from `partList` would be circular).
    - `hex.test.ts:7-14`: delete. It is `ROWS.hex` inverted against itself; `pattern.test.ts:85`
      counts hex rows for real. Keep lines 16-21 (the clamp).
    - `gang.test.ts:24-25`: rewrite to tell single from ganged (ganged deck's +Y extent is
      `gangReach` wider), keep the outer-face flatness check that caught the dovetail rib.
    - Solver gram constants within 5 % of `filamentGrams` on the snapshot parts
      (`solver.ts:112-113`; today <1 %, minimal cover 3.3 %). Keeps "remeasure when it moves"
      honest. (Sequencing audit wanted it cut; kept: it turns a documented obligation into a
      failure.)
    - `loadStoredProfile` when `localStorage.getItem` throws (the rest is already in
      `profile.test.ts:94-109`).
B10. **Docs (was Phase 6).**
    - CLAUDE.md: "no exceptions since 2026-09-20" (`:106`) vs the magnet-ceiling exemption
      (`test/geo.ts:49`, and CLAUDE.md's own Gridfinity bullet). One sentence.
    - "Superseded by …" header only, no number fixes: flat-pack, minimal, gridfinity,
      sliding-slot (status says "not merged"; fd4345e is), print-estimate Hours, plate-output
      baseline, assembly-guide, mixed-width-gang.
    - `open-questions.md` prune waits for the print (half its items are print-answered).

## Track C — after the print

C1. Act on the print (open-questions Next steps 2): rung strip (fit-calibration spec) if joints
    bind or rattle evenly; stop `pack()` turning decks and side walls if only far ears miss;
    geometry if walls lean.
C2. **Seam block in `tonguesOf` (was 1.5).** Chip: split + ganged, canL ≤ ~53, lengths 290–300
    and 440–450 (not 480). Spell the block as derived, `K.gangHead/2 + K.spliceDepth + 4`
    (27 mm, socket half-width + splice reach + a web), not `tabClear + gangHead/2` (`tabClear`
    is the ear-to-pin rule). Moves default tongues −36.9/33.3 → −39.4/35.8; `bun run ref`
    moves deck volumes only (±0.04 %, minimal rear −0.24 %), no bounds. **Needs an OK:**
    `gang.test.ts:95` ("a tongue on each half from 290") fails at 290–292. Add a wall-notch ↔
    tongue alignment check, since regress cannot see a notch move. Islands test at canL 40,
    length 300 and 440.
C3. **Widen the overhang + islands property pass:** canD 53 / canL 100 / wall 4 (clean today, a
    guard), rearLoad top tier, minimal + Gridfinity + magnets. After C2 so it tests final
    geometry.
C4. Rear-load print questions: bracing without a cover (interim: `check()` warns when
    `rearLoad && !cover`), the ~3 mm headroom (`K.topgap`).
C5. Clear-PETG tile test decides D1 (layer 0.1/0.2) and D2 (nozzle 265/270); tests move with it.
C6. Prune `docs/open-questions.md`: acceleration, gang stub, loose lanes, sleek sub-bullet,
    keep-out rectangle, and whatever the print answered.

## Cut, with reasons

- PR trigger in CI: the owner pushes to main. As drafted it would also have deployed PR code
  (upload/deploy ungated, shared `concurrency: pages` cancels main deploys).
- Terminate-on-supersede worker: replaced by B1 + abort recovery (B2).
- `extractProfile` header-trust check: could never fail as drafted.
- `bedFromConfig` hardening on its own: only reachable if 2.5 is yes (folded into B8).
- Unbuilt specs (input-presets, plate-output, print-estimate cost, units, app-shell,
  label-pocket, reeded, top-surface; assembly-guide and mixed-width-gang need a rewrite first):
  not hardening. Pick after the print.

## Decisions (owner, 2026-09-30)

| # | Question | Decided |
|---|---|---|
| 1 | B1 leak fix | Per-build arena in `Geo`, freed in one place |
| 2 | B6 gang stub | (b): the stub uses the side gap; row charged against `w − SIDE_GAP` |
| 3 | B8 imported 3MF sets the bed on the form | Yes |
| 4 | B3 shelf max in `LIMITS` | 2000 mm |
| 5 | A3 joint coupon before the full print | Yes |
| 6 | C2 `gang.test.ts:95` threshold 290 → 293 | Yes, after reading the ref diff |
| 7 | rearLoad corner slot; flat stack opens its top tier only | Live with both |
| 8 | Minimal ratio limits 0.62 / 0.58 | Accepted |
