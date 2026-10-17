# UX audit verification

Application source and existing tests were not changed. Added files are the audit, screenshots and reproducible measurement scripts. Existing uncommitted application work was retained.

## Current commands

- `bun run check`: exit 0, `tsc -p .` passed.
- `bun run build`: exit 0; main.js 648 KB, worker.js 115 KB reported by build.ts.
- `bun test test/`: **1407 pass, 0 fail**, 326223 assertions across 47 files, 285.11 s. Log: `/tmp/cyd-ux-audit-unit.log`.
- `git diff --check`: exit 0 at the audit documentation checkpoint.
- `bun run test:ui`: **73 pass, 0 fail**, 169568 assertions across 8 files, 348.57 s. Log: `/tmp/cyd-ux-audit-ui.log`.

There is no separate lint script in package.json. The optional stricter unused-symbol probe used for structural evidence is not the normal project check; it produced 13 diagnostics outside main.ts/viewer.ts and was not repaired in this audit.

Previous session runs recorded drag edge-scroll and estimate-queue failures, including isolated reproductions. Both passed unchanged in this complete run: drag check 35.54 s and estimate queue 3.58 s. No root cause was established and no fix was made; the separate UI verification follow-up remains open. This audit's pass establishes the current result, not that the historical failures were harmless or resolved.

## Observable checks

Fresh Chromium contexts were used for default desktop light/dark and 390 × 844 phone measurements, with no CPU/network throttling. Both default modes, custom printer dimensions, a named small printer, mixed fit rejection, width recovery and generated output were inspected. See `01-evidence.md` and `evidence/visual-weight-findings.md` for exact conditions and limitations.

Direct checks reproduced:

- Named printer choice changes earlier bed dimensions. A1 mini followed by default mixed mode produces the exact-depth printer-limit error and hides the named printer picker along with results.
- With two tallboys and the tested settings, the app reports that 356.0 mm shelf width is needed; editing width to 356 with a suitable entered build volume produces a complete preview again.
- Cover unchecked still produces uniform loading text mentioning a cover window.
- Depth 100 mm produces width/height-only no-fit advice with already-sufficient 300 mm width and 240 mm height.
- ArrowRight on focused Assembly does not change part-tab focus/selection. Canvas has no name or tabindex.
- Loading disables export, empty/input failures show a centered message, focus has a visible outline, reduced motion stops the busy spinner and Share reports Link copied.

This is expert inspection with source corroboration. It does not establish novice task completion, comprehensive screen-reader support, physical printed performance or production/mobile-hardware performance.
