# Browser, rendering and accessibility sources

Reviewed 2026-10-15. These are rolling primary documentation; check installed
library versions/types for version-specific APIs. Project contracts are in the
source and `test-ui/`, not in an upstream example application's architecture.

| Source | Use in this project |
|---|---|
| [Three.js BufferGeometry](https://threejs.org/docs/pages/BufferGeometry.html) | Explicit GPU buffer disposal and indexed attributes. Follow the project's per-build cache ownership. |
| [Three.js InstancedMesh](https://threejs.org/docs/pages/InstancedMesh.html) | Shared geometry, matrix updates, `needsUpdate`, instance bounds and instance disposal. |
| [MDN worker guide](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers) | Message cloning versus transfer and worker termination/error behavior. Do not transfer the worker's cached build buffers. |
| [MDN replaceState](https://developer.mozilla.org/en-US/docs/Web/API/History/replaceState) | History mutation constraints and errors; retain debounced hash updates and navigation precedence. |
| [Playwright auto-waiting](https://playwright.dev/docs/actionability) | Actionability does not mean worker estimates or export preparation have finished. Wait for their real signals. |
| [Playwright downloads](https://playwright.dev/docs/downloads) | Register the download event before initiating it; inspect the saved artifact. |
| [W3C text contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) | WCAG AA text targets: 4.5:1 normal text and 3:1 qualifying large text, subject to the criterion's exceptions. |
| [W3C non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html) | Required component/state indicators need 3:1 against adjacent colors, subject to exceptions. Evaluate real rendered states. |

For a theme change, inspect `--paper`, `--paper-2`, `--ink`, `--ink-2`, `--rule`,
`--lattice`, `--can`, `--can-dark`, `--warn` and hard-coded colors in CSS/viewer.
Check actual foreground/background pairs, especially muted notes, warnings, focus,
selected tabs and red primary buttons. A 3:1 component target is not a universal
rule for every decorative border. Preserve visible keyboard focus and usable
labels; color must not be the only indication of a state.

No accessibility assertion is established merely by choosing a named palette.
