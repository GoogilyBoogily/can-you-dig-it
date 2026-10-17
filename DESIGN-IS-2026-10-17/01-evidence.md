# Can dispenser UX evidence and recommendations

The configurator's capabilities are useful, but its information hierarchy makes the basic job harder than necessary. Keep the generator and every feature; reorganize the workflow around shelf and cans, printer, result, and download. This is an expert audit of the current working tree, supported by desktop and phone browser inspection. It is not a novice usability study.

## Method and scope

The review followed the task sequence: understand the starting point, enter shelf/can information, configure mixed stacks, recover from a constraint, choose print settings, inspect the model, and export. Separate structural, copy and visual evidence passes were consolidated with direct browser checks. `index.html` and `styles.css` matched the served `dist/` files before inspection. The audit adds documentation and evidence only.

Supporting evidence: [copy findings](copy-findings.md), [copy inventory](copy-inventory.md), [visual and resource measurements](evidence/visual-weight-findings.md), [desktop light](evidence/desktop-light.png), [desktop dark](evidence/desktop-dark.png), [full phone page](evidence/mobile-light.png), and [mixed-stack printer error](evidence/mixed-small-printer-error.png).

Priority means: P1 interferes with completing or recovering the primary task; P2 creates avoidable effort or confusion; P3 improves polish or resource use. These are recommendations, not application changes.

## E1 Printer setup and error recovery

**P1 — Keep printer and profile controls available regardless of whether a model fits.**

The first Printer section asks for Bed X, Bed Y and Z (`index.html:90–97`). The named printer picker, nozzle, process, filament and profile import are inside results, after both download buttons (`index.html:200–218`). Choosing a printer overwrites the earlier bed fields and can rebuild the model (`src/main.ts:823–839`).

Reproduced sequence: open the default valid uniform design, choose Bambu Lab A1 mini, then switch to different stacks. The default exact depth of 480 mm exceeds the printer's 332 mm lane limit. `dropBuild()` hides all results (`src/main.ts:426–440`), including the named printer picker and profile controls. The centered error is useful, but changing the named printer is now unavailable. Manual bed/depth edits or switching back to uniform remain recovery routes; this is not a total dead end.

Put the named printer chooser beside build volume before layout generation. Keep a clearly named Custom printer route and editable dimensions. Keep profile import, selected profile state, and a way to change settings available in invalid states. Pair errors with the offending field and a suggested action. Preserve exact mixed-stack dimensions; never silently shrink a stack to recover.

## E2 Result and download hierarchy

**P1 — Put the result summary and download action ahead of the parts inventory.**

At the fresh default design, the results panel contains 19 plate rows before the download buttons (`index.html:200–205`; `src/main.ts:649–658`). At 1440 × 1000, Download 3MF starts at y=1643 inside an independently scrolling results panel. The initial view contains no download action. At 390 × 844, it starts at y=3924 in a 4692 px document. The default produces 22 cans, 19 part/assembly tabs and 19 plates. These quantities describe this design, not all possible configurations.

Show capacity, footprint, approximate filament, plate count and a primary download action together. Put full plates and per-part details in an expandable inspection section. Explain the formats: 3MF contains arranged plates and selected settings when supplied; STL ZIP provides models for other slicer workflows. Print-setting selection must precede the final download decision or be clearly summarized beside it. Keep both export formats and every individual plate selectable.

## E3 Mobile task continuity

**P1 — Make preview and result reachable during editing on a phone.**

The mobile layout places the complete form before the viewer (`styles.css:142–151`). At 390 × 844, the default uniform viewer begins at y=2018. Layout choices begin at y=1604, after all shared options. There is no measured horizontal overflow: document width remains 390 px. The issue is travel distance and loss of feedback, not clipping.

Use a compact persistent result summary with Preview and Download navigation, or direct navigation among Setup, Preview and Print sections that preserves state. Avoid making completion of a rigid wizard mandatory: users need to compare the model while adjusting values. The preview should become reachable after the essential shelf/can entries, without scrolling past the complete advanced form.

## E4 Progressive disclosure and mixed-stack orientation

**P2 — Group controls by user intent and show advanced values on demand.**

Uniform Options exposes 18 controls in one fieldset (`index.html:99–182`), including pattern sizing, slope, loading, Gridfinity alignment, connectors and fit. Some controls are irrelevant to the selected base but remain visible. Automatic cell sizing fades the editable manual input to 45% opacity even though its value is ignored (`styles.css:80–81`).

The mixed editor already uses native disclosure for six operating controls per stack (`src/main.ts:117–126`). Each stack adds 18 potential interactive elements, 11 rendered with automatic tiers and closed options. Eight collapsed stack cards therefore add 88 rendered controls before the surrounding form and result. Keep the native disclosure pattern; summarize the current feed/cover/loading state in its heading. Preset measurements can be compact until Custom or Edit measurements is chosen, while retaining exact values and straightforward editing.

Proposed grouping: essentials (shelf, cans, printer), feeding/loading, appearance, base/connections, and advanced joint/clearance settings. Only show Gridfinity positioning for Gridfinity and magnet controls for applicable bases. Preserve stored values when sections close or become inapplicable; hiding must not erase or silently change settings.

The mixed list runs top-to-bottom but corresponds to right-to-left physical order (`index.html:82–83`). Add a front-view strip with numbered stacks matching the preview and clearly identify rightmost/leftmost positions. Keep drag, move buttons and handle arrow-key controls: they are alternative access methods, not wasteful duplication (`src/main.ts:174–201`).

## E5 Plain language and truthful summaries

**P2 — Use consistent names and show technical detail only where it helps a decision.**

The same can measurement is Length in uniform mode and Can height in mixed (`index.html:76`; `src/main.ts:113`). Bed X/Y/Z, Lip headroom, Fit, Tongue/Socket and Lane on its cells require domain interpretation. Suggested labels include Build width/depth/height, Can height, Ramp angle, Front clearance and Joint tightness, with diagrams or precise help where needed. Keep named patterns and use swatches rather than removing choices.

The default filament summary renders raw configuration keys and `line_width=0.42000000000000004` (`src/main.ts:615–617,644`). This dominates the narrow summary column in [desktop evidence](evidence/desktop-light.png). Show “About 1.44 kg · estimated” with readable assumptions under Details. Keep all assumptions and exclusions available.

Confirmed source mismatches to fix independently of the larger layout work:

- Uniform cascade loading text always mentions a cover window, even when cover is unchecked (`src/main.ts:643`). Mixed copy already conditions this on cover (`src/main.ts:688`).
- Uniform checked auto-feed means include both cascade and flat candidates (`src/solver.ts:121–129`), unlike exact per-stack on/off behavior. Label it “Include auto-feed layouts” and keep the selected result's behavior explicit.
- Uniform no-fit advice gives only width and height (`src/main.ts:379–382`), although usable depths below 120 mm yield no candidates (`src/solver.ts:169–182`). Diagnose the actual blocking dimension.
- Shared slope bound errors use mm (`src/validate.ts:38–40`), while slope is in degrees. Preserve the validation boundary and correct units.

The cover and shallow-depth findings were also reproduced in a fresh browser context. With cover unchecked, the completed uniform result still says “through the cover window.” Changing depth to 100 mm then gives “A single lane needs 159 mm of width and 96 mm of height” with the default 300 mm width and 240 mm height already sufficient. See [phone shallow-depth failure](evidence/mobile-shallow-depth-error.png).

Assembly instructions are dense footer paragraphs (`index.html:224–225`). Convert them to numbered, mode-specific steps connected to labeled preview parts. Put plain part names in the UI while preserving stable engineering identifiers for exports and technical details. Retain physical fit/load qualification caveats. The unconditional rolling claim at 3° should be tied to demonstrated physical evidence or phrased as design intent (`index.html:128`; `src/main.ts:641`).

## E6 Accessible inspection and feedback

**P2 — Shorten keyboard travel and make model/status controls explicit.**

Most actions are native controls and reachable by Tab/Enter. Stack reordering preserves focus and announces movement (`src/main.ts:174–201`). There are four implicit landmarks after generation, but no skip link (`index.html:25,37,200,223`). Every part tab and every plate precedes downloads in the DOM focus order.

Tabs use `role=tab` without roving tabindex, arrow-key navigation, an associated tabpanel or `aria-controls` (`src/main.ts:572–590`). The canvas has pointer/wheel camera controls without an accessible name or keyboard camera route (`src/viewer.ts:29–38,57–78`). Ordinary building/success/share messages use a plain status div rather than a live region (`index.html:195`; `src/main.ts:28–30`). Rejection messages do have `role=status`.

Direct keyboard inspection confirmed that ArrowRight on the focused Assembly tab leaves both focus and selection on Assembly. The rendered canvas has neither `aria-label` nor `tabindex`.

Keep Assembly, Parts and Plates as clear inspection categories, using a searchable or grouped picker for long part inventories. Add camera reset/front/side/zoom controls usable by keyboard, a named preview, gesture help, tab semantics, and politely announced asynchronous status. All existing parts must remain reachable.

Measured auto-cell label contrast is 1.85:1 in light and 2.75:1 in dark because of opacity, while the control remains editable. Excluding this text, lowest measured initial text ratios were 4.94:1 light and 5.79:1 dark. These are sampled computed text ratios, not comprehensive accessibility conformance. Show automatic value/state plainly and make manual editing intentional without dropping required values from FormData.

## E7 Visual restraint and resource use

**P3 — Preserve the quiet visual identity and reduce idle work.**

The light/dark palette, readable type, restrained red action color and large model are worth retaining (`styles.css:1–31,100–129`). No initial modals, notification badges or idle CSS animations were observed. All six state categories exist: initial/empty, loading, error, success, focus and disabled. Busy spinner motion respects reduced motion (`styles.css:110–112`). The main weaknesses are hierarchy, dense engineering text, tiny inspection labels, and consistency of control states rather than a need for a new brand.

Initial measured requests: 8; decoded main+worker JavaScript: 780,736 bytes; total decoded response bodies: 1,820,638 bytes. These are not compressed transfer sizes. One unconditional viewer render loop remains active while idle (`src/viewer.ts:41`). Local unthrottled load-to-built-and-enabled-export was approximately 0.95–1.03 s; this is a readiness proxy, not formal TTI or a phone hardware result. Consider rendering on state/camera changes and loading large catalogues when needed after the primary task issues are fixed. This audit makes no measured battery-savings claim.

## Feature preservation contract

| Capability | Presentation can change | Required preservation |
| --- | --- | --- |
| Uniform automatic layouts | Compact recommendation plus alternatives | Every valid layout and actual auto-feed/flat behavior |
| Mixed connected stacks | Compact cards and spatial order strip | 2–8 stacks; exact depth; presets/custom measurements; automatic/fixed tiers |
| Independent stack behavior | Disclosures with current-state summaries | Slope, lip clearance, auto-feed, cover, rear loading, top joining |
| Stack management | Clearer spatial labels | Add, duplicate, remove, drag, move buttons, handle arrow keys and focus |
| Appearance | Swatches and a focused group | Both designs, five patterns, solid walls, automatic/manual cell sizing |
| Bases and connections | Show applicable controls contextually | Flat/feet/Gridfinity, magnets, alignment, side connectors and joint fit |
| Print setup | Unified early group | Custom volume, printer/nozzle/process/filament, translucency, imported and preserved profile bytes |
| Inspection | Assembly/Parts/Plates navigation | Every part/plate, can/grid/bed visibility, pull-apart, quantities and sampling disclosures |
| Output and navigation | Persistent result/action area | 3MF, STL ZIP, sharing, existing links, themes and latest-build export gating |
| Instructions and limits | Readable steps and details | Assembly order, exact-fit errors, material assumptions and physical qualification caveats |

Source inventory: `index.html:39–218`; `src/main.ts:109–130,278–299,386–397,572–704`.

## Structural counts and limits

Static HTML has 46 native interactive nodes: 15 selects, 25 inputs, 5 buttons and 1 link. Runtime totals vary with layout, saved settings and generated inventories. Root's settled default at 1440 × 900 had 86 rendered interactive selector matches including offscreen and disabled nodes, 82 enabled; the visual pass's native-control selector counted 85 because it excludes the source link. These are different selector inventories, not competing above-the-fold counts. The default form has maximum descendant depth 7 edges. The two-tallboy mixed capture with custom 256 mm bed dimensions had 127 rendered selector matches and 38 part/assembly tabs; it is not comparable to a fresh default mixed design.

No dead component props apply to this direct DOM implementation. An optional strict unused-symbol probe found no main/viewer diagnostics but failed elsewhere; it is separate from the normal project check. No novice comprehension test, screen-reader session, physical print or production-throttled performance benchmark was performed. Runtime catalogue labels and generated identifiers are open-ended; the supporting copy inventory distinguishes static strings from conservative source candidates.
