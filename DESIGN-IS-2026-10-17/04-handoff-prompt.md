```text
/make-plan Redesign the can-you-dig-it configurator's information hierarchy and task flow. Current design scored 15/30, with primary weaknesses in useful (#2), understandable (#4), unobtrusive (#5) and minimal (#10).

Verdict:
REDESIGN the configurator's information hierarchy and task flow while preserving every feature, the generator, existing shared links and the established visual identity; the audit scores 15/30 because setup, recovery and export require avoidable detours.

Why redesign: split setup and result-dependent printer controls, export placement after a variable inventory and phone controls preceding feedback require structural changes; cosmetic refinement alone cannot resolve those relationships.

Primary user: a person sizing a printable can organizer to their cans and shelf.
Primary task: enter shelf/can information, choose the real printer, inspect a fitting result, customize if needed and download printable parts with appropriate settings.

Preserve:
- Uniform automatic candidate layouts and opt-in 2–8 connected mixed stacks, exact independent depths and automatic/fixed tiers; index.html:39–88, src/main.ts:109–130, src/solver.ts:39–95.
- Independent presets/custom dimensions, slope, lip clearance, auto-feed, cover, rear loading and top joining for each stack; src/main.ts:109–142.
- Add/duplicate/remove, drag handles, move buttons, focused-handle Up/Down reordering and focus announcements; src/main.ts:94–106,174–201.
- Both design variants, five patterns, solid walls, auto/manual cell sizing, flat/feet/Gridfinity bases, magnets, alignment, side connectors and joint fit; index.html:99–182.
- Custom printer dimensions, named printer/nozzle/process/filament, translucency, imported profile bytes and persistence, 3MF/STL ZIP, sharing and old links; index.html:90–97,196–218.
- Every assembly/part/plate inspection view, visibility toggles and pull-apart; index.html:188–195, src/main.ts:572–704.
- Approximation/sample/physical qualification disclosures and exact latest-build export gating; src/main.ts:408–447,615–617,644–647,700–704, index.html:224–225.
- Existing light/dark/system themes, restrained palette, native controls and readable typography; index.html:28–34, styles.css:1–31. Long-lasting scored 3/3. Verify all themes, contrast and focus after changes.

Discard these presentation patterns:
- Early raw bed dimensions plus late named-printer controls inside results. index.html:90–97,200–218; src/main.ts:426–440 hides the controls on invalid fits. Reproduction: choose A1 mini on valid uniform design, switch mixed at default 480mm depth, observe 332mm printer-limit error and hidden printer picker. Manual depth/bed edits remain possible, but named-printer recovery requires a detour.
- Every plate preceding output. Default has19plate rows; download y1643 inside desktop results, y3924 on390×844 phone. index.html:200–205.
- All advanced settings preceding phone preview. Fresh default phone viewer starts at y2018. styles.css:142–151.
- Raw generated part IDs and estimate configuration keys as primary explanatory copy. Default includes line_width=0.42000000000000004. src/main.ts:579,615–617,644.

Top moves, in priority order:
1. #2 Useful: Unify named printer selection, custom build volume and profile settings in an always-available setup area; keep recovery controls visible when fitting fails. Evidence: E1, index.html:90–97,200–218, src/main.ts:426–440,823–839.
2. #2 Useful and #5 Unobtrusive: Keep capacity, footprint, approximate material, plate count and download actions together ahead of expandable plate/part details; provide direct Preview and Print access on phones. Evidence: E2–E3, default phone preview y=2018 and download y=3924, index.html:200–205, styles.css:142–151.
3. #4 Understandable and #10 Minimal: Organize settings into essentials, feeding/loading, appearance, base/connections and advanced fit; use contextual disclosures and mixed-stack state summaries while preserving every value and control. Evidence: E4, index.html:99–182, src/main.ts:117–126, styles.css:80–81.
4. #4 Understandable and #6 Honest: Standardize plain language, replace raw estimate keys with readable expandable assumptions, correct cover/auto-feed/error-unit mismatches, and connect fit errors and assembly steps to the relevant controls or parts. Evidence: E5, src/main.ts:379–382,615–617,643–644, src/solver.ts:121–129,169–182, src/validate.ts:38–40.
5. #8 Thorough: Make Assembly/Parts/Plates inspection scalable and keyboard usable; add camera alternatives, clear status announcements, a numbered front-view stack map and explicit automatic/manual control states. Evidence: E4/E6, src/main.ts:174–201,572–590, src/viewer.ts:29–38,57–78, index.html:195.

Specific copy behavior: uniform cascade loading claims a cover window even with cover off (main.ts:643); checked uniform auto-feed includes flat alternatives (solver.ts:122), unlike exact mixed mode; no-fit width/height-only guidance omits depth<120mm (main.ts:379–382, solver.ts:182); shared slope bounds say mm (validate.ts:38–40). Keep solver semantics unless separately authorized; align copy with actual behavior.

Design priorities: usefulness, understandable essentials, progressive disclosure preserving all features, accessible task continuity on desktop and phone. Use Setup→Preview→Print navigation or equivalent direct access, not a forced wizard. Native details can be reused. Show only applicable controls while preserving values and required FormData handling.

Deliver a plan before implementation:
- Information architecture and feature-to-location matrix covering every preserved capability.
- Desktop/phone low-fidelity flow, compared side-by-side with current; include invalid fit and printer recovery.
- Per-change files, precise behavior, verification and state checklist: initial/example, loading, invalid input, no-fit, error, success, focus, disabled, stale geometry and export.
- Accessible parts/plates navigation, camera alternatives, status announcements and stack spatial mapping.
- Consolidated type/spacing/control-state decisions while retaining themes and palette.
- Compatibility/migration path: existing hashes and saved/imported print settings reopen unchanged; no indefinite dual UI mode.
- Cutover: all features mapped and reachable; invalid design keeps recovery controls; downloads match newest build; existing tests remain meaningful and new UI acceptance tests cover changed behavior.

Constraints: plain HTML/CSS/TypeScript and existing Three.js viewer; no new dependency/framework, exported signature change, abstraction or solver/geometry change without required authorization. Do not delete user data, weaken tests or overwrite unrelated work. Preserve profile bytes and session-vs-persistent share behavior. Run normal typecheck/build, appropriate units and browser tests with desktop/narrow light/dark and keyboard inspection. Current audit verification: typecheck/build pass,1407unit tests pass,73browser tests pass. Prior runs recorded drag auto-scroll and estimate-queue failures; both passed unchanged in this audit, their cause remains unexplained and the separate diagnosis task remains open. Do not assume those prior failures were harmless or hide failures by editing tests.

Avoid porting the same hierarchy under new styling, cutting features for simplicity, compulsory wizard steps, large rewrites, or adding duplicate controls whose state can drift. Address idle viewer rendering after primary workflow problems; resource measurements are unthrottled local proxies, not battery claims.
```
