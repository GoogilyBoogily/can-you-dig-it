# Can dispenser UX verdict

**REDESIGN the configurator's information hierarchy and task flow while preserving every feature, the generator, existing shared links and the established visual identity; the audit scores 15/30 because setup, recovery and export require avoidable detours.**

Changing spacing and labels alone cannot solve a printer picker that disappears during the error it could help resolve, downloads buried after a variable plate inventory, and mobile feedback placed after the whole form. Those are structural relationships. A new rendering framework or generator rewrite is not implied.

## Highest leverage moves

1. **#2 Useful:** Unify named printer selection, custom build volume and profile settings in an always-available setup area; keep recovery controls visible when fitting fails. Evidence: E1, `index.html:90–97,200–218`, `src/main.ts:426–440,823–839`.
2. **#2 Useful and #5 Unobtrusive:** Keep capacity, footprint, approximate material, plate count and download actions together ahead of expandable plate/part details; provide direct Preview and Print access on phones. Evidence: E2–E3, default phone preview y=2018 and download y=3924, `index.html:200–205`, `styles.css:142–151`.
3. **#4 Understandable and #10 Minimal:** Organize settings into essentials, feeding/loading, appearance, base/connections and advanced fit; use contextual disclosures and mixed-stack state summaries while preserving every value and control. Evidence: E4, `index.html:99–182`, `src/main.ts:117–126`, `styles.css:80–81`.
4. **#4 Understandable and #6 Honest:** Standardize plain language, replace raw estimate keys with readable expandable assumptions, correct cover/auto-feed/error-unit mismatches, and connect fit errors and assembly steps to the relevant controls or parts. Evidence: E5, `src/main.ts:379–382,615–617,643–644`, `src/solver.ts:121–129,169–182`, `src/validate.ts:38–40`.
5. **#8 Thorough:** Make Assembly/Parts/Plates inspection scalable and keyboard usable; add camera alternatives, clear status announcements, a numbered front-view stack map and explicit automatic/manual control states. Evidence: E4/E6, `src/main.ts:174–201,572–590`, `src/viewer.ts:29–38,57–78`, `index.html:195`.

## Preserve

- Every capability in the evidence report's feature preservation contract, including all per-stack operating settings and all three reorder methods.
- The underlying layout, geometry, packing, profile preservation and export lifecycle. This audit authorizes no public-contract changes.
- The light/dark/system themes, restrained palette, readable typography, prominent model, native form controls and useful focus/disabled/loading states.
- Strict fit refusals, latest-build export gating, approximate-material/sample disclosures and physical qualification advice.

## Replace

- Split early bed dimensions and late result-dependent named printer selection: E1.
- Export actions placed after every generated plate: E2.
- The entire advanced form preceding the only phone preview: E3.
- An undifferentiated Options block and long engineering identifiers/raw settings used as primary UI copy: E4–E5.

## Target task flow and acceptance

Shelf and cans → printer and build volume → immediate fit/result preview → optional customization → selected print settings and download. Users can move directly between these areas; no required linear wizard. Mixed editing should show numbered spatial order and per-stack summaries.

Success means a fresh user can find the fitting result and download without traversing a plate inventory, choose a new printer while a design is invalid, inspect a preview on a phone without passing every advanced option, and reopen a shared design with all values intact. A side-by-side screen comparison and feature matrix must demonstrate that no capability disappeared. Implement in reviewable steps, starting with error recovery and output hierarchy; do not rebuild the application wholesale.
