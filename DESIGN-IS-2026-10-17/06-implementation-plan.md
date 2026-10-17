# Implementation plan: a simpler configurator with every feature preserved

This plan implements the approved UX audit. It changes presentation and access to existing capabilities; it preserves generator behavior, exact mixed-stack requests, profile bytes, shared-link formats, and worker/export ownership. The current working tree already includes unrelated and prior feature work: do not revert, commit, or overwrite it.

## 1. Information architecture

Provide persistent **Setup / Preview / Print** buttons and a skip-to-preview link. These move focus and scroll to the existing sections; they do not replace `location.hash`, hide the other sections, reset inputs, or require wizard completion. Design hashes already occupy the fragment, so navigation must use `scrollIntoView` and focus rather than ordinary fragment links.

Desktop keeps the established three-column composition: setup at left, large preview at center, compact result and downloads at right. Keep setup independently scrollable so all mixed-stack drag methods work. At intermediate widths, Print may span beneath setup and preview. On a phone, retain a single document with sticky direct navigation: essentials and printer, layout choices, grouped customization, preview, Print. One tap on Preview or Print must bypass the advanced settings and focus its heading. Do not hide sections behind navigation tabs: existing direct control interaction and error recovery should remain available.

| Current desktop / phone | Proposed desktop / phone |
| --- | --- |
| Setup: shelf, cans, raw bed dimensions, all Options, layouts. Named printer is only in valid results. | Setup: shelf and cans, named printer and custom volume together, fitting layouts, optional groups by intent. Named printer remains available during invalid input, no-fit, build failure and catalogue failure. |
| Center / phone after the whole form: model and every part tab. | Center / one-tap Preview: named model with camera controls, Assembly and a searchable, bounded part strip; real keyboard tab behavior. |
| Right / phone last: detailed summary, every plate, downloads, printer settings. | Right / one-tap Print: capacity, footprint, approximate mass, plate count, selected settings reminder, 3MF/STL actions first; estimate and assembly details and every plate below. |

Invalid fit keeps Setup and its printer/profile controls intact, empties the stale model, hides `#results` as today, and keeps exports disabled. Print navigation in that state should focus an always-present Print section heading/message outside `#results`, with a clear route back to Setup. Do not manufacture a fake result or silently alter dimensions.

## 2. Feature-to-location contract

| Preserved capability | Target location and behavior |
| --- | --- |
| Uniform / mixed mode, shelf width/depth/height and hand clearance | Setup essentials; current IDs/names, constraints and defaults retained. |
| Uniform presets, custom can diameter and height | Setup cans; use consistent “Can height” copy while retaining `canL`. Dimensions stay editable and enabled. |
| Mixed 2–8 stacks, independent presets/dimensions, exact depth, automatic/fixed tiers | Setup numbered stack cards. Keep current card and field selectors, and visible dimensions/tier controls. Add front-view order strip, rightmost/leftmost labels and current operating-state summaries. |
| Add / duplicate / remove / mouse and touch drag / move buttons / handle Up and Down | Existing stack editor and handlers. Preserve exact accessible button names, `h3` text `Stack N`, focus preservation, cancellation and live announcements. Put extra spatial wording in separate text. |
| Uniform automatic ranked layouts and all alternatives | Setup immediately after essentials/printer and before customization; no candidate filtering or solver changes. Keep `.layout` and `aria-pressed`. |
| Feeding, cover, rear loading, slope and lip clearance | Uniform Feeding and loading group; mixed existing per-stack native details, with live state summaries. Uniform auto-feed label explains that it includes auto-feed alternatives. |
| Standard/minimal, five patterns, solid walls and automatic/manual cell size | Appearance group. Keep every option and stored value. Use explicit automatic text and read-only manual number while automatic; do not fade meaningful text. |
| Flat/feet/Gridfinity, magnets, Gridfinity alignment, top and outer joins | Base and connections group; contextual Gridfinity positioning and applicable magnet controls. Preserve unsupported mixed-base selection/error recovery; never coerce it to flat. |
| Joint clearance / tightness | Advanced fit group. Keep current range/value/output behavior and shared-link keys. |
| Printer/nozzle/process/filament, custom volume, translucency, import/clear and persistent profile | Always-present Setup Printer section. Move existing nodes rather than duplicate them. Keep `.profile` wrapper, IDs and 12px Clear treatment. Show custom volume fields together with the printer picker, not as a competing printer configuration. |
| Assembly, every unique part and every packed plate | Preview and Print inventory. Preserve `#tabs` role=tablist and one real button per assembly/part with the same `data-key`; preserve all `#plates .plate` buttons and `plate:` keys. A part search filters actual tabs only after user input; initial inventory remains accessible. |
| Cans/grid/bed toggles and pull-apart | Preview below the model; retain applicability rules and all current IDs. |
| 3MF and STL ZIP, share | Print actions above any variable-length inventory; Share in Preview/persistent task controls with its existing ID. No second download button or duplicated state. |
| Material assumptions, sampling, quantities and physical qualification | Readable estimate disclosure and mode-specific assembly steps below actions. Keep raw technical assumption strings available in genuine expandable details inside `#summary`, alongside readable names/rounded display. Keep sampling and qualification visible where relevant. |
| Light/dark/system theme | Existing masthead control, tokens, preference storage and prepaint behavior. |

## 3. Implementation sequence and ownership

### Main UI owner: `index.html`, `styles.css`, `src/main.ts`, narrowly `src/validate.ts`

1. Add task navigation and focusable section headings without fragment navigation. Move the existing profile block into always-present Setup Printer, retain custom build dimensions, and make profile event ownership explicit. Moving nameless profile controls into `#form` otherwise makes their `input` events call `editDesign()` and rebuild geometry: skip only that block in the form input handler and preserve its current dedicated change listeners. Review `form.reset()` / `showProfile()` ordering so same-document links restore correct session/persistent picks.
2. Reorder Print DOM: compact primary summary, actions, supporting details, then plate inventory. Keep the whole valid-result area under existing `#results`; add an always-present Print destination around it if required. Preserve `#summary` and `.stack-summary` contents and current scientific quantities. Detailed mixed stack summaries must not push download actions below the fold.
3. Replace the monolithic Options block with named native disclosure groups and concise state summaries; intended initial state is collapsed optional groups, not open groups chosen just to satisfy old tests. Keep mode-specific controls contextual. Required numeric values remain enabled/read-only rather than disabled. Existing left/right disabling for Gridfinity is a deliberate special case and remains because parsing and tests already support it.
4. Keep per-stack dimensions/presets directly editable; enhance only the existing operating options disclosure and add a truthful front-view stack order strip. Update strip and summaries on edit, reorder, duplicate/remove, hash restore and mode switch. Keep order right-to-left consistent with geometry.
5. Upgrade existing real tabs with unique IDs, `aria-controls`, a labeled preview tabpanel, selected-state roving `tabindex`, Left/Right/Home/End focus/selection, and scroll-into-view. Add labeled part search and readable part labels while retaining stable IDs for export/technical details. Keep an always-accessible bounded strip so original direct tab clicks and focused last-tab checks remain meaningful; do not add hidden duplicate tabs for compatibility. A separate plate button continues to select plate view and synchronize selected states.
6. Add `role=status` / `aria-live=polite` / atomic status text and focus-visible styling for links, details summaries and the canvas. Avoid moving focus on ordinary recalculation.
7. Correct copy without changing semantics: conditional cover-window text; design-intent slope guidance rather than an unconditional physical guarantee; uniform auto-feed alternatives label; explicit usable-depth guidance for no-fit; degree units for slope bounds in `readNumbers`. Use existing `laneNeeds` plus current solver constraints; do not introduce a guessed new sizing rule. Preserve `Nothing fits` prefix and current error consistency with `#viewerMessage`.
8. Convert existing assembly prose into numbered mode-specific steps while retaining all order/qualification caveats. Use existing part views as inspection destinations where the part identity is known; do not guess identities or add exported viewer methods.

### Viewer owner: `src/viewer.ts` only

Add an accessible name, focusability and gesture/keyboard help to the existing canvas. Build a small camera toolbar locally in the constructor (Reset, Front, Side, Zoom in/out); use existing private `place()` / `frame()` camera math, including Z-up and bounds of visible objects. Confirm front/side directions against the actual assembly coordinates. Canvas arrow keys orbit; plus/minus zoom and Home resets, without intercepting keystrokes from form controls. Preserve pointer, wheel, pan and pointer-cancel behavior. Toolbar buttons must not start canvas drags and must be `type=button`.

There is no render scheduler to reuse: `viewer.ts:41` has an unconditional RAF loop. Keep idle rendering unchanged in this pass, as directed; introduce no scheduling abstraction, public signature change, GPU ownership change or geometry changes. Main UI owner styles the toolbar under agreed classes, so viewer owner does not touch CSS.

### Verification owner: new `test-ui/ux-workflow.ui.test.ts` only

After main owner confirms new selectors/headings, add acceptance tests using the project's `bun:test` + Playwright library/`serveDist` pattern. Do not edit existing tests before scoped approval described below. Do not rebuild or run browser suites while another task writes/runs against the shared `dist/`.

## 4. Existing-test compatibility: preserve versus seek approval

The old suite contains real user interaction assumptions that conflict with newly collapsed optional settings. A plan cannot both collapse these groups and promise all old test interactions remain unchanged. Request explicit approval for only opening the appropriate real disclosures before the existing interactions and visibility assertions. Keep every existing assertion, value, lifecycle, archive, quantitative and focus check unchanged; new acceptance tests verify that optional groups start collapsed.

Concrete affected locations:

- `test-ui/share.ui.test.ts:28–30,51–60`: direct stackable/side joins, feed/cover/rear load, design/pattern/slope/base/magnets/alignment operations. Open the relevant new group before the operation. Same-document initial pages may need their own disclosure opening; do not rely on state from another page.
- `test-ui/share.ui.test.ts:41–44` and `test-ui/hash-navigation.ui.test.ts:69`: left/right must still be disabled on Gridfinity. Do not replace this existing supported state with blanket “never disabled” logic.
- `test-ui/mixed.ui.test.ts:329–330`: explicitly asserts shared design and fit are visible immediately. Proposed interaction update, requiring approval: activate the Appearance and Advanced fit summaries immediately before these unchanged visibility assertions. Add initial-collapse expectations in the new UX acceptance file. Do not replace or remove existing assertions.
- `test-ui/mixed.ui.test.ts:338,448–451,513` and `test-ui/generation.ui.test.ts:174,189`: direct global slope/lipGap/base interactions require opening the proper disclosure. Existing per-stack `openStackOptions()` already models the intended approach; do not add another details element inside each card because several locators assume one `details`/`summary` per card.
- If plate inventory is initially collapsed, existing direct `.plate` clicks in `share.ui.test.ts:130,271`, `mixed.ui.test.ts:629`, and `mixed-generation.ui.test.ts:136` must open that real disclosure first. Prefer leaving the inventory visible below actions in this pass to meet the primary hierarchy goal without an unnecessary interaction change; native collapse may remain user-controlled.

Contracts that need no weakening or replacement:

- `mixed.ui.test.ts:93`: exact stack `h3` text and accessible reorder/move labels must stay. Put new spatial labels outside those identifiers.
- `mixed-generation.ui.test.ts:92–104`: the last real part tab must remain focusable inside `#tabs` bounds; viewer height must remain at least 200px at 1440×900, 1280×720, 1024×768 and 390×844; no horizontal document overflow. A default-closed parts disclosure conflicts with these interactions. Keep the bounded strip initially accessible and make search optional.
- `share.ui.test.ts:128,260–272` and `mixed-generation.ui.test.ts:133–136`: `#tabs button` indexing, `assembly`/`part:` data keys and direct real clicks still select the original views. Keep no extra category buttons inside `#tabs` ahead of legacy part entries.
- `mixed-generation.ui.test.ts:117–120`, `generation.ui.test.ts:195`, `mixed.ui.test.ts:443,491,521`: invalid inputs hide `#results`, disable exports, empty viewer and keep the viewer message synchronized with status. Recoverability is solved by moving Setup controls out of results, not by keeping stale results visible.
- `share.ui.test.ts:184–202`: Clear's parent class is exactly `profile`, first `.profile` contains `.profilePick`, Clear font is 12px, and `.actions` contains no empty paragraph. Moving the whole wrapper and preserving scoped styling is legitimate; duplicating profile nodes is not.
- `profile.ui.test.ts:246–249,279–296` uses `#summary.innerText()` to wait for recalculation and read `approximate; assumed`, `sparse_infill_density=6`, `filament_density=1.27`, and `~X kg`. `estimates.ui.test.ts:34,48–52,84` uses `textContent()` and expects `solid;`, raw assumption tokens and no lowercase `about`. `innerText()` excludes closed details, so moving every token into closed details truly changes those display assumptions: seek approval for opening Estimate details before the existing visible-summary assertions, while keeping readiness waits tied to the visible recalculation indicator. Keep unchanged numerical/density/archive assertions. Do not inject hidden duplicate tokens to satisfy a test. For the initial compact material label use `~X kg · estimated`; readable assumptions and raw settings belong in the real disclosure.
- `mixed.ui.test.ts:375–380`: `.stack-summary` includes exact `Deck slope3°` / `Lip headroom7 mm` etc.; keep those summary labels for this pass even if the editable controls receive plainer explanatory labels. Top-level mixed `#summary > dl` must not claim one shared slope.
- `estimates.ui.test.ts:18–38,59–90`: profile edits must still avoid unnecessary builds and retain only current estimate requests. Moving profile controls into form is specifically dangerous here. Prior unchanged estimate/drag failures are documented; a recurrence needs diagnosis, not larger waits or assertion weakening.

No existing test files are changed by this planning task. The original instruction forbids editing tests without asking; the scope above is the concrete proposal for permission. Main UI/viewer implementation that does not depend on those edits can proceed, but completion requires approval or an explicitly revised disclosure design.

## 5. State and regression checklist

| State | Required observation |
| --- | --- |
| Fresh / shared / saved settings | Same default capacity/candidates and dimensions; all checkbox states, per-stack overrides, layout index and supported v2/v3 hashes round-trip. Navigation never edits hashes. |
| Loading / latest edit | Current geometry may remain while building, downloads disabled immediately on intent; status announces busy; no old success/error unlocks exports. |
| Invalid / no-fit / worker failure | Clear actionable message in preview and status; `#results` hidden and geometry cleared where currently contracted; printer/profile/custom volume remain reachable; no silent dimension coercion. |
| Profile catalogue delayed/unavailable | Existing hash picks survive; import/custom bed remain usable; persistent recipient profile remains unchanged by incoming session picks. |
| Bad import | Existing profile bytes and usable settings survive; file name rendered as text; error logged/reported. |
| Estimate / translucent / clear | Correct density/infill/assumptions and latest profile; no geometry rebuild for process-only change; clear/translucency compatibility preserved. |
| Focus / keyboard / touch | Direct task navigation focuses destination; tab arrows/Home/End and camera alternatives work; detail summaries show focus; mixed reorder focus and cancellation unchanged; document does not overflow. |
| Views / memory | Every assembly/part/plate reachable; toggle applicability correct; pull-apart and bed bounds correct; repeated views do not grow cached/GPU allocations. |
| Download | Actions precede all plate/stack detail inventories; both formats preserve quantities/settings and match newest built intent. |

New acceptance cases: invalid mixed A1-mini recovery by choosing a larger named printer without switching modes; download order before plate inventory; 390px navigation reaches preview and Print immediately without field resets; all optional groups expose the same settings/values; truthful cover/no-cover and shallow-depth copy; accessible tabs and camera keyboard controls; front-view stack strip tracks reorder; profile-only changes do not cause geometry requests.

## 6. Verification and review gates

Run focused new/existing UI cases after implementing and resolving any approved interaction updates; then one sequential pass of `bun run check`, `bun test test/`, `bun run build`, `bun run test:ui`, and `git diff --check`. There is no project lint command. Report actual counts/failures, including any reappearance of unresolved drag/estimate timing failures. Do not run a second build/UI process against shared `dist/` concurrently.

Inspect real browser screenshots against the audit at desktop and 390×844: light and dark, setup and invalid recovery, collapsed/expanded customization, assembly/part/plate, visible focus and disabled/loading states. Verify model stays usable at the four existing viewport sizes and navigation remains reachable with no overlay covering focused fields. Confirm every matrix row in the final UI before declaring complete. No dependency, framework, public API change, solver behavior change, idle scheduler, commit or unrelated cleanup is part of this plan.
