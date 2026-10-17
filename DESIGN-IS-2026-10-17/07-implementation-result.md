# UX implementation result — verified

The approved redesign is implemented in the working tree. Its purpose is to make setup, model inspection and downloading easy to find while retaining the configurator’s complete feature set. The historical audit and its evidence remain unchanged; this document records the implementation separately.

## What changed for the user

Setup, Preview and Print now have direct navigation with scroll and keyboard focus. This is an open workflow: users can jump between sections without completing a wizard. Phone navigation stays available while scrolling, and navigation preserves the serialized design hash.

Printer selection, custom build volume, imported settings and profile controls now live together in Setup. They remain reachable when a design fails to fit, so users can recover by changing the printer without switching modes or losing entered stacks. Invalid results still clear the model and disable downloads.

Print begins with capacity, footprint, approximate material and plate count, followed by both download formats. Full plate inventory, detailed dimensions and mixed-stack summaries follow the actions. Optional customization is grouped into Feeding and loading, Appearance, Base and connections, and Advanced fit, each with a current-state summary.

The audit measured the default 3MF action at y=1643 on desktop and y=3924 in the phone document. The final desktop capture places it at y=316.0. The phone document places it at y=2701.4; tapping Print brings it to viewport y=243.4 beneath the navigation and focuses the Print heading. The hierarchy improvement is that a user reaches the action before traversing the generated inventory.

The preview has real searchable part tabs with keyboard navigation, readable labels with accessible technical IDs, camera reset/front/side/zoom buttons, and keyboard orbit/pan/zoom. Mixed stacks have an explicit numbered front-view map. Status changes are announced, assembly guidance is numbered, and loading/error text reflects cover state, usable depth and slope units.

## Feature preservation and location

| Capability retained | Implemented location |
| --- | --- |
| Uniform automatic layouts and every ranked alternative | Setup, after shelf/can/printer essentials and before customization. |
| Mixed 2–8 connected stacks, exact depths, independent presets/custom dimensions, automatic/fixed tiers | Setup stack cards, with front-view order map and positional descriptions. |
| Independent slope, lip clearance, auto-feed, cover, rear loading and top joining | Existing per-stack operating-options disclosure; state appears in its summary. |
| Add, duplicate, remove, move buttons, mouse/touch drag, focused-handle arrow keys and cancellation | Existing stack editor; whole-stack values, focus and announcements retained. |
| Both designs, all five patterns, solid walls and automatic/manual cell sizing | Appearance; automatic sizing has explicit state and retains the manual value. |
| Flat/feet/Gridfinity, applicable magnets/alignment, top/side connectors and joint fit | Base and connections, Advanced fit, and per-stack controls where applicable. |
| Custom volume, printer/nozzle/process/filament, translucency and profile import/clear | Always-present Setup printer block; Nozzle, Process and Filament have visible labels, with empty dependent rows hidden. |
| Imported profile bytes and persistence, session-specific shared picks, old uniform and mixed links | Existing profile/hash pipeline; controls moved without duplicating configuration state. |
| Assembly, every part/plate, cans/grid/bed visibility and pull-apart | Preview’s real tab strip and Print’s complete plate inventory. |
| Approximate material, readable assumptions and raw technical details, quantities and sampling disclosures | Compact Print summary plus genuine expandable details; no hidden compatibility-only content. |
| 3MF, STL ZIP and sharing | Print actions before inventories; Share in Preview. |
| Assembly order and physical qualification advice | Mode-specific numbered guidance with part inspection links. |
| Light/dark/system themes, focus/disabled/loading/error states | Existing theme system and palette, expanded focus styling and announced status. |

## Implementation and retained contracts

Application changes are confined to `index.html`, `styles.css`, `src/main.ts`, `src/viewer.ts` and the slope-unit message in `src/validate.ts`. New acceptance coverage is in `test-ui/ux-workflow.ui.test.ts`.

Form profile events are excluded from geometry editing, preserving estimate-only updates for process settings. Profile adoption only replaces ordinary status when the design is ready and the worker is healthy; actionable startup errors remain. Required form values remain available to parsing; the supported Gridfinity side-connector disabled state remains. Downloads retain latest-build gating and build/export identities. Profile imports preserve original bytes and retain a working profile after a bad import. Same-document hash navigation and incoming session picks retain their existing persistence rules.

The approved existing-test updates add 13 interactions to open real disclosures and replace two touch-positioning interactions with centered scrolling before the gestures. All existing assertions, waits, timeouts, skips and the application's five-pixel drag threshold remain unchanged. Every existing assertion line was compared with the pre-redesign snapshots across all eight original browser test files.

Desktop drag scrolling also received a measured root-cause fix. The larger viewer produced 8–17 animation frames per second, making fixed-per-frame scrolling slow; browser scroll anchoring then repeatedly moved the list backward when cards changed position. Scrolling now uses elapsed time at the original 720 pixels per second, caps delayed frames, disables anchoring only during a drag, and stops at the stack editor boundary. Positive fractional edge distances round outward by less than one CSS pixel so native scroll-position rounding cannot stall the final movement. Keyboard, mouse, touch, cancellation and incoming-design behavior all pass unchanged assertions.

No dependency, exported signature, geometry/solver behavior or idle render-loop change is included. The pre-existing working tree was preserved. No commit or deployment has been performed.

## Final verification

- `bun run check`: passed, exit 0.
- `bun test test/`: **1,407 passed, zero failed**, 326,223 assertions across 47 files, 237.90 seconds ([log](/tmp/cyd-ux-workflow-unit.log)).
- `bun run test:ui`: **82 passed, zero failed**, 169,720 assertions across nine files, 365.49 seconds, exit 0 ([final log](/tmp/cyd-ux-workflow-ui-final.log)). This includes all 73 existing cases and nine new UX cases. Touch and desktop edge scrolling pass in full-suite order at 9.08 and 14.28 seconds respectively; estimate cases also pass.
- Final `bun run build`: passed, exit 0, producing actual application and worker assets.
- `git diff --check`: passed. The project has no separate lint command.
- Independent code and interaction reviews found no remaining blockers.

The first full implementation browser run recorded 80 passes and two drag failures ([log](/tmp/cyd-ux-workflow-ui.log)). The touch fixture started at y=820.046875 and moved to y=820, never crossing the drag threshold; the user approved centering the handle before its start and cancellation gestures. The desktop failure led to the measured scrolling fixes above. Focused checks and the final complete run passed without changing any assertion or timeout. The older estimate-queue timing failure remains recorded in the separate follow-up list because its historical cause has not been established; subsequent full runs, including this one, pass.

Final captures were inspected from the final production build: [desktop light](evidence/implementation/desktop-light.png), [desktop dark with printer settings](evidence/implementation/desktop-dark-printer.png), [phone Setup](evidence/implementation/phone-light-setup.png), [phone Print](evidence/implementation/phone-light-print.png), and [phone dark Preview](evidence/implementation/phone-dark-preview.png). All five have no horizontal overflow; canvas heights are 442.1 pixels on desktop and 360 pixels on the phone. [Measured bounds, focus and profile-label visibility](evidence/implementation/measurements.json) accompany the captures. The full browser suite additionally checks intermediate widths, invalid recovery, mixed-stack states, all view types, disabled/loading behavior and focus.
