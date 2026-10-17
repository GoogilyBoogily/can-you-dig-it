---
name: changing-browser-ui
description: Modify can-you-dig-it controls, responsive styling or themes, URL sharing, Three.js views, and asynchronous worker state. Use for index.html, styles.css, main.ts, viewer.ts and browser regressions; excludes building an unrelated website.
---

# Change the configurator UI

The UI is plain HTML/CSS/TypeScript, built by `build.ts`; no component framework
or second bundler is needed. Inspect `index.html`, `styles.css`, relevant handlers
in `src/main.ts` and the actual browser tests before editing.

- For a geometry control, update model/defaults, validation, HTML constraints,
  `optionsFrom`, hash `KEYS` and derived display together. Disabled controls drop
  out of `FormData`; don't disable an input whose value parsing still requires.
- For theme/visual work, reuse CSS tokens and inspect Three.js colors, transparent
  renderer, grid, bed and lights. The canvas is not styled by CSS text colors.
  Confirm requested preference behavior rather than assuming storage/system mode.
  Preserve `[hidden]`, focus states, selected/disabled states and reduced motion.
- For async work, read [state and lifecycle contracts](references/state.md).
  A new layout invalidates the previous build before the debounce fires. Downloads
  must correspond to the latest built layout and remain disabled while stale.
- Imported file names are text; use `textContent`. Stored profile access can
  throw before parsing. Preserve raw bytes, the working profile after a bad import,
  and the recipient's persistent profile when a shared link applies session picks.
- In the viewer, reuse manifest placements and compact plans. Dispose GPU
  resources according to cache ownership. Keep scale sampling labelled and
  confined to preview; update instance matrices/bounds after transforms.

## Verify observable behavior

Run `bun run check`, relevant units, `bun run build` and `bun run test:ui`.
The browser suite uses `bun:test` and Playwright's library APIs. Serve actual
`dist/`; do not launch another build/UI suite against the same output in parallel.
Wait for the relevant completed state, not just an already-visible results panel.
For estimates, wait until the recalculation indicator clears as well as checking
the new setting. Start download listeners before the click and inspect archive
bytes when export behavior changes.

For visual changes inspect desktop and narrow layouts, keyboard focus, both
selected/unselected controls, status/error messages and assembly/part/plate views.
Use [browser and accessibility references](references/browser-sources.md) as
needed. Automated functional tests alone do not establish contrast or a usable
canvas. Keep testing proportional to the behavior changed.
