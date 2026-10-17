# Visual, state and resource evidence

Read-only browser audit of existing `dist/`, served at http://127.0.0.1:3017. Separate Playwright Chromium browser, no application code changes. Fresh browser context per desktop light, desktop dark and mobile light capture; no network or CPU throttling. Screenshots and JSON beside this report. Browser launch and navigation executed locally on 2026-10-17.

## Observed layout and discovery distances

| Measurement | Desktop 1440 × 1000 | Mobile 390 × 844 |
|---|---:|---:|
| Controls height | 842 px scroll area | 1898 px |
| Viewer start y | 64.5 px | 2017.7 px |
| Viewer size | 810 × 612.5 px | 390 × 360 px |
| Layout choice list start y | 1606.9 px, inside scroll area | 1603.9 px |
| Primary download start y | 1643.4 px, inside scroll area | 3924.4 px |
| Page scroll height | 1000 px | 4692 px |
| Part buttons, including Assembly | 19 | 19 |
| Plate rows before download | 19 | 19 |

Desktop controls and results scroll independently (`styles.css:38`, `styles.css:114`). Mobile puts controls, stage then results in one document flow (`styles.css:142`). Downloads are structurally after the entire plate list (`index.html:200`). Desktop initial screen shows 48 controls intersecting viewport and ancestor scroll areas; 85 controls exist in rendered non-hidden content, including offscreen content. The 85 count is not an above-the-fold count.

Default summary visibly displays raw estimate assumptions, including `line_width=0.42000000000000004`, before the plate list. Source: `src/main.ts:615`, `src/main.ts:644`, `src/estimate.ts:35`, `src/estimate.ts:50`. Screenshot `desktop-light.png` and full `mobile-light.png` confirm the text as rendered. No visual overflow beyond viewport measured: mobile document scrollWidth was 390px.

## Type, spacing and colors

CSS uses Atkinson Hyperlegible Next / Atkinson Hyperlegible / system fallback (`styles.css:14`), base15px, line-height1.45. Initial rendered text sizes measured: 11,12,12.5,13,13.5,14,15,26,30px. Error viewer text has16px in CSS (`styles.css:104`). Sizes are individual CSS declarations, without a typography token scale. Labels generally13px, hints12.5px, section headings15px, layout capacity30px.

Spacing is similarly hard-coded: label gap4px, ordinary field gap8px, fieldset bottom22px; controls18px20px24px padding, results18px20px; common card/button radii4/5/6/8/10px; pill tabs999px (`styles.css:38`–`styles.css:54`, `styles.css:71`, `styles.css:91`, `styles.css:104`, `styles.css:107`, `styles.css:114`). This is evidence of varied values, not a conclusion that every value is harmful.

Declared light/dark token pairs (`styles.css:3`–`styles.css:13`): paper #e8ebef/#171d25; paper-2 #f4f6f8/#222b36; ink #1f2630/#e6edf5; secondary ink #5b6573/#aab7c7; inverse ink #fff/#171d25; rule #c9d0d9/#485566; lattice #4a6f92/#86afd4; can #c8372d/#f08072; primary #c8372d/#b9362c; can-dark #a32b23/#9e2c24; warning #9a6a12/#efbd68.

Contrast method: computed RGB foreground and nearest opaque background from browser; standard sRGB linearization and relative-luminance ratio `(lighter + .05)/(darker + .05)`. For the faded Cell size label, foreground is composited at ancestor opacity0.45 over paper. Small-text antialiasing is not included. Findings refer to measured initial DOM text, not a complete WCAG audit:

- Lowest initial text: auto-mode `Cell size` label and unit text, light1.85:1; dark2.75:1. The field is visually faded but remains editable and is not HTML-disabled (`styles.css:80`–`styles.css:81`). Its value is ignored while Auto is checked, per source comment.
- Excluding that auto-inactive text, lowest initial light text4.94:1: secondary ink #5b6573 on paper #e8ebef.
- Excluding auto-inactive text, lowest initial dark text5.79:1: primary download white on #b9362c. Dark secondary text on raised paper is7.03:1.
- These are ratios for text nodes in initial rendered content, including content reachable through scrolling. Native form rendering, disabled native option text, all hover/selected combinations and 3D content have not received a comprehensive contrast audit.

Initial part-tab and Share buttons measure28.84px high, gap4px; primary download43.75px high. This is a measured target size; no overall accessibility conformance conclusion is asserted.

## States verified in browser

- Focus: keyboard Tab focuses Theme select with a2px #4a6f92 outline and1px offset (`styles.css:49`).
- Loading: editing width301 triggers `Building parts…`,0.8s spinning status decoration, and disabled download. Source `src/main.ts:455`, `src/main.ts:444`, `styles.css:110`.
- Reduced motion: the busy spinner's computed animation-name becomes `none` when emulated reduced-motion is enabled (`styles.css:112`).
- Success: Share changes status to `Link copied.` (`src/main.ts:1023`).
- Empty/no fit: width50 yields `Nothing fits. A single lane needs159mm of width and103mm of height.` in both status and centered viewer message; results hidden, download disabled. Source `src/main.ts:378`–`src/main.ts:385` and `src/main.ts:424`–`src/main.ts:440`.
- Input error: blank width yields `Check your numbers: shelf width needs a number` in status and viewer message; results hidden and download disabled.
- Error state markup viewer message has role=status (`index.html:188`). Main status line has no live-region role in markup (`index.html:195`). This audit did not run a screen reader.
- Generic runtime failures have status and console handling (`src/main.ts:32`–`src/main.ts:47`); runtime crash display was source-inspected rather than deliberately triggered.

## Initial resource weight and speed proxy

Eight requests observed in each fresh context: document, local CSS, main.js, worker.js, profiles/index.json, manifold.wasm, Google font CSS, one Google woff2 font. All returned200; no browser page errors occurred. JS decoded response bodies: main663094B + worker117642B =780736B (762.4KiB). Other notable bodies: profiles436551B; wasm541470B. Total decoded body bytes across all8 responses1,820,638B (1.74MiB). This is decoded content length, not compressed on-the-wire bytes; no source maps were requested. The profile catalogue and wasm are required/requested initially in the measured default route.

Load-to-ready proxy: from navigation performance time origin until a MutationObserver first sees visible results, enabled Download3MF and a `built in` status. Desktop light1029.5ms; dark953.1ms; mobile viewport1016.4ms. DOMContentLoaded165–273ms, load234–432ms. This is a local unthrottled sample of each setting, not Lighthouse TTI/INP/LCP, a mobile hardware benchmark or a production speed guarantee.

## Distraction / idle work

Initial default screen has0 modals and0 badges (visual review and dialog/badge selector inventory); generated capacity numbers in layout cards are content, not separate notification badges. At settled state `document.getAnimations()` returned0 CSS animations in all3 contexts. Loading has1 spinning decoration; reduced motion disables it.

There is1 unconditional JavaScript requestAnimationFrame rendering loop at `src/viewer.ts:41`, even when the 3D scene is idle. Wrapper instrumentation observed8–19 callbacks per second over one-second samples in this headless environment (12 light desktop,8 dark desktop,19 mobile viewport). These rates are environment-dependent, not a target frame rate or CPU/battery measurement. Dragging creates a separate temporary requestAnimationFrame path (`src/main.ts:221`); no dragging was active during idle measurement.
