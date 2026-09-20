# App shell: reset, dark, offline

Three things every comparable web tool has and this one does not. None touches the solver,
the geometry or the files.

## Reset

A "Start over" button at the foot of the form. `form.reset()` puts every field back to the
markup's `value`, the preset selects go to their defaults, the hash is cleared with
`history.replaceState(null, "", location.pathname)`, and `refit()` runs. The slicer profile,
the units choice and the price per kg stay: they are the user's printer, not the design.

Today the only way back is to edit the URL by hand or open a fresh tab.

## Dark

`styles.css` keeps its tokens in `:root`; a `@media (prefers-color-scheme: dark)` block
overrides the surface, ink, line and accent tokens and nothing else. The viewer reads its
background and grid colour from those tokens at construction (`getComputedStyle`), and
listens to the media query so a switch mid-session recolours the canvas without a rebuild.
Part colours (`COL`) do not change: they are the role legend and read on either ground.
Check the layout cards, the `.warn` block and the focus ring for contrast; the accent red
of the can icon wants lifting a step on a dark surface.

No toggle. The system's preference is the preference; a toggle is a second state to carry
and nobody asked for one.

## Offline

A `manifest.webmanifest` (name, short name `can you dig it`, `display: standalone`,
`start_url: ./`, the inline SVG can as a 512 icon rendered once to PNG and committed under
`public/`) and a service worker.

`sw.js`, about forty lines, written by hand: `build.ts` already knows every file in `dist/`,
so it writes the list into the worker as `PRECACHE` with a version string that is the hash
of the bundle bytes. Install precaches the list; activate deletes caches with another
version; fetch is cache-first for everything in the list (`main.js`, `worker.js`,
`manifold.wasm`, `styles.css`, `profiles/index.json`, the icon) and network-first with a
cache fallback for `index.html`, so a deploy shows up on the next load and the one after
that is offline-capable again. Nothing else is cached: the Google Fonts request fails
offline and the fallback font in the stack takes over.

`index.html` links the manifest and registers the worker after load, inside a feature
check; registration failure is logged and otherwise ignored, because a page that builds a
lane cannot depend on a cache.

The pitch is "everything runs in your browser"; this is what makes that true on a plane.
One peer (OpenSCAD Playground) does it; none of the Gridfinity generators do.

## Tests

- `test/build.test.ts` (new): a build writes `sw.js` whose `PRECACHE` lists every file in
  `dist/` except itself and the source maps, and whose version changes when `main.js` does.
- `test-ui/share.ui.test.ts`: Start over after a full edit leaves the default hash and the
  default layout; the profile survives it. `context.setOffline(true)` on a second load still
  builds the default lane and downloads a 3MF.
- Dark: a Playwright screenshot under `colorScheme: "dark"` for the eye, once; no pixel
  assertion.
