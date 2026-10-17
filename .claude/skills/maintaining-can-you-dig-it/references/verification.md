# Verification and dependency maintenance

## Commands from repository root

```sh
bun run check
bun test test/
bun run build
bun run test:ui
git diff --check
```

There is no lint script/config in the current project. Do not invent a passing lint
claim. `check` is strict `tsc -p .`; Bun's build strips types. Keep the trailing
slash in `test/` so the unit invocation does not also select `test-ui/`.

Run focused suites during implementation, then the applicable full checks before
calling it verified. The engineering standards require reporting actual output.
For skills-only edits, validate skills and changed executable helpers as well.

## Select meaningful evidence

| Change | Existing suites to inspect/run |
|---|---|
| Kernel/local features | `arena`, `features`, `reusable-features`, `pose`, `rounded-cover-connectivity` |
| Product dimensions/variants | `regress`, `parts`, `generation-boundaries`, `validation`, `solver`, `bed-orientation` |
| Assembly/queue/connectors | `assembly-contracts`, `cascade-gang-assembly`, `joint-retention-and-finish`, `concealed-cover`, `front`, `rear`, `stackable`, `lip-seat` |
| Splits/patterns/Gridfinity | `split-conservation`, `splice`, `gang`, `pattern`, `hex`, `gridfinity`, `spec`, `islands`, `overhang` |
| Manufacturing/packing | `manufacturing-contracts`, `mesh-export-validation`, `shell-orientation`, `pack`, `packed-plan`, `export` |
| Settings/estimates | `profiles`, `profile`, `profile-consistency`, `estimate-line-width`, `manufacturing-contracts`; browser `profile`, `estimates`, `generation` |
| UI/sharing/lifecycle | Browser `share`, `generation`, `hash-navigation`, `assembly`, plus any affected settings tests |
| Static server/build | `dev`, check/build, and browser suite against actual `dist/` |

Unit filenames are `test/<name>.test.ts`; browser filenames are
`test-ui/<name>.ui.test.ts`. Use their current assertions as contracts, not just
test names. Some historical comments and titles predate the latest architecture.

Browser tests use `bun:test` plus the Playwright library, not `@playwright/test`.
They build real assets and start local servers. Run UI suites sequentially: several
rebuild the same `dist/`, and `profile.ui.test.ts` uses port 3111. Do not launch a
second build while they run. Chromium must already be installed, or installation
must be authorized. If sandboxing prevents server/browser startup, report the
environment failure and use the available approval route; do not weaken tests.

## Snapshot and fixture changes

Read the failing contract and pre-change state before modifying expected values.
Obtain approval for obsolete existing assertions; preserve independent arithmetic
and both accepted/rejected cases. `ref.json` holds volume to 0.01% and bounds to
0.01 mm. `ref-diff.ts` displays bound changes above 0.001 mm, a reporting threshold
that is separate from the test tolerance. Explain additions/removals and every
material delta; kernel upgrades also update the snapshot kernel label.

## Dependency or slicer upgrade

Inspect `package.json`, `bun.lock`, installed package metadata/types and CI Bun
version first. Get approval for dependency additions or public signature changes.
Use official release notes/source for the exact version under consideration.
Avoid an unrelated broad upgrade.

- Manifold: check merge-vector conversion, WASM locateFile path, arena lifetime,
  geometry invariants and reference drift. Do not replace topology with welding.
- Three.js: check renderer compatibility, instance matrices/bounds and disposal;
  run the viewer memory/scale browser cases.
- fflate: check selective extraction/size guard, raw-profile byte round-trip and
  actual archive consumers.
- Bun/TypeScript/Playwright: run separate typecheck, unit, browser and production
  build; confirm worker/WASM/profile URLs on a subpath as used by GitHub Pages.
- Bambu Studio: match binary and preset catalogue versions; refresh generated
  profiles deliberately, inspect renamed presets and perform real import/slicing.

Relevant primary docs, checked 2026-10-15:
[Bun bundler](https://bun.com/docs/bundler),
[Bun test](https://bun.com/docs/test),
[Playwright library](https://playwright.dev/docs/library),
[OpenAI skill discovery](https://learn.chatgpt.com/docs/build-skills).
These are rolling docs; confirm installed APIs before copying an example.
