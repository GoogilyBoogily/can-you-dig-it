---
name: changing-geometry
description: Use when editing src/geometry.ts or src/features/*, when test/regress.test.ts fails, when ref.json needs regenerating, or when a snapshot diff has to be judged in can-you-dig-it.
---

# Changing geometry

A red regress suite after a deliberate change is expected. The job is to prove that every moved number was meant to move. The rules (tolerances, commit `ref.json` with the code) are in CLAUDE.md; this is the loop.

## Loop

1. Edit. Run `bun run check && bun test test/`.
2. Only the snapshot-match tests in `regress` may go red. Its filament-sanity and minimal-ratio tests, and every other suite, must stay green untouched. Red there is a real bug, not snapshot drift. The suites most likely to catch a geometry bug (`ls test/` for all of them):

   | Suite | Catches | Failure label |
   |---|---|---|
   | features | male not inside female, shell ≠ clearance | test name (names the joint) |
   | overhang | face flatter than 45° under the part | `<part> has no downward face off the bed` (+ ` at fit 0.3`) |
   | islands | part in more than one piece (loose ear, cut tab root) | `<part> is one piece` / `is still one piece at fit 0.3` |
   | splice / gang | tab, tie, tongue arithmetic | test name |
   | pack / validation | bed fit, plate count, `check()`, `index.html` = `LIMITS` | test name |
   | front | front can vs ceiling, lip tab flush | test name |
   | pattern / hex / cover | cell shape, row count, cover window | test name |
3. `bun run ref`, then `bun ${CLAUDE_SKILL_DIR}/ref-diff.ts`. It compares the working tree to HEAD. Pass `<rev>` to compare against another commit, or `<rev1> <rev2>` for one commit's own change. For each part it prints the volume delta in mm³ and %, and every bound that moved more than 0.001 mm.
4. Explain each line. Derive the expected delta by hand. For example, `266975a~1 266975a` prints `end-lip: vol -189.689 mm³; max.x 6 -> 4.419`, which is exactly `2·(6−4.4193)·5·12`. Checks:
   - Mirrored and sibling parts have equal deltas (`wall-left-*` = `wall-right-*`, and the same across every pattern prefix).
   - Parts you did not touch have zero delta.
   - An in-plane change (tab, slot or notch width) moves volume, not bounds, unless the feature sits on the part's outer edge. A protruding tab moves a bound.
   - A jump of whole cells means a cell touching a keep-out that grew was dropped, not clipped. That's legitimate only if the keep-out grew. Slats are split per component instead, and anything under 4R wide stays solid.
   - `spec.*` moves only when `solve()` inputs change. `spec.manifold` also moves on a kernel bump.
   - A `+` or `-` part line appears only if `refParts()` changed on purpose.
5. Commit the code and `ref.json` together.

## After the snapshot

- Default-job volume moved: re-measure `laneGrams`/`coverGrams` (`src/solver.ts`) and `JOB_FLOW`. **REQUIRED SUB-SKILL:** slicing-with-bambu-cli.
- A dimension that CLAUDE.md quotes changed: update CLAUDE.md in the same commit.
- A joint changed: run `bun run coupon.ts` so the next test print cuts the new joint.

## Mistakes

- Regenerating before reading the diff. Once `ref.json` matches the code, the snapshot can no longer catch the change.
- Trusting single-part tests to catch mating bugs. An ear landing on the pin below, and a lip tab poking out, both passed regress, overhang and islands. Check against the mating part, or add the check to `check()`.
- Freeing shapes by hand. `Geo.arena` owns every shape made inside it, and `union([x])` can hand back `x` itself, so freeing `x` kills the result (244b72c). Only plain data (`meshDataOf`, `src/export.ts`) may leave an arena. The one exception is `filamentGrams`, whose per-layer frees are deliberate.
- Bumping `manifold-3d` without `bun run ref`. The regress test "derived dimensions match the snapshot" fails on the kernel label.
