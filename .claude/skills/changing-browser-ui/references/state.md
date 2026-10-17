# Browser state and resource ownership

## Latest intent wins

`choose()` increments `buildId` immediately and schedules a 250 ms build. The page
permits one in-flight build and one replaceable latest pending request. Superseded
successes/errors cannot attach old meshes to a new layout or unlock downloads.
Invalid input calls `dropBuild`, clearing queued work, results and viewer state.

An export uses the worker's cached `last`, so export gating matters even when the
viewer still looks plausible. `exportId` handles successive download requests;
a superseded output is reported rather than silently disappearing.

Estimate requests have separate identities and carry their source `buildId`.
Profile edits during a build must use the latest settings after it lands. Ordinary
process/filament changes re-estimate cached meshes; bed or exclusion changes can
invalidate layout/packing and require a build. The worker retains mesh buffers
for export/re-estimation: build replies clone data, while final file bytes can
be transferred. Transferring cached buffers would detach the worker's data.

A `WebAssembly.RuntimeError` makes that worker module unusable. Restart/rebuild
once per current build; a repeated abort becomes an error. Worker load failure,
ordinary build error and superseded error are distinct states with distinct UI
effects. Test each using existing delayed-worker patterns.

## Hash and profile precedence

The form's entire design state, including unchecked boxes, plus layout selection
and catalogue picks goes in the hash. Imported profile bytes stay out. A shared
link's picks apply for the session without overwriting saved imported settings.

`hashPicks` survives delayed/unavailable catalogue fetches. Unknown/incompatible
names leave the picker usable and explain the fallback. Same-document navigation
resets the form and restores persistent profile before applying incoming picks.
`appliedHash` prevents an overdue edit's debounced `replaceState` from destroying
an incoming fragment before `hashchange` runs. Share flushes current state before
copying; do not replace that with per-keystroke history writes.

Profile bytes are stored as version-2 base64 (`src/profile.ts`). A parsed config
recognizing some catalogue names is not permission to replace a custom profile
with a newly composed one. Keep arbitrary imported bytes unchanged.

## Viewer ownership

- `geoms` caches one `BufferGeometry` per unique part identity for a build.
- `clear` owns per-view materials, instances, grid/bed/can geometries and removes
  the old group; it preserves cached part geometries.
- `reset` clears the group before disposing and emptying the shared cache.
- `showAssembly` uses shared posed instances, including mirrored printable deck
  sources; `showPlate` consumes rigid packed placements. Avoid per-copy mesh arrays.
- `explode` updates matrices, `needsUpdate`, bounding box and sphere. Frame visible
  objects only: a hidden large bed must not make a small part appear tiny.
- `pointercancel` ends dragging; the renderer is Z up. Theme changes should not
  trigger geometry regeneration or rebuild the entire viewer on every toggle.

Evidence lives in browser `generation`, `estimates`, `hash-navigation`, `share`,
`profile` and `assembly` suites. `window.viewerInfo()` exposes allocation counters
for memory checks; a stable JS object count alone cannot prove GPU cleanup.
