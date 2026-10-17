# Architecture and feature routing

Verified against the source on 2026-10-15. Paths below are relative to repository
root. The source and current user decisions take precedence over this map.

## Data flow

```text
index.html + saved profile + URL fragment
  → main.ts → validate.optionsFrom → solver.fitSpace
  → selected Layout {options, derived, footprint, capacity}
  → worker build {id, options, keepOut, estimateSettings}
  → model / queue / layout / assembly manifest
  → geometry + features + kernel arena
  → plain unique meshes + quantities → export.packPlan
  → viewer / results / worker cached export
selected profile change → estimateSettings → cached-mesh estimate
bed or keep-out change → layout/build/packing invalidation
```

## Ownership

| Owner | Responsibility and non-obvious coupling |
|---|---|
| `src/model.ts` | Product types, `DEFAULTS`, `K`, derived dimensions; no kernel dependency. `geometry.ts` re-exports its public contracts for compatibility. |
| `src/kernel.ts` | `Geo`, synchronous non-nesting shape arenas, batched booleans; returns shapes inside the scope and copies plain data out. |
| `src/queue.ts` | Can capacity, minimum length and cylinder centres from one geometry definition. |
| `src/layout.ts` | Tier roles, world-side connector choices, mirrored decks, rear-load and finished wall variants. |
| `src/assembly.ts` | Explicit `PartSource` manifest, exact quantities, poses, lazy can iterator and bounded preview sampling. |
| `src/features/` | Local joint pairs, lattice fields, shared poses, print-face pockets/rounds, Gridfinity units. Import model/kernel directly, not the composer. |
| `src/geometry.ts` | `solve`, `check`, lane rules, part composition and demand-driven builds from the manifest. `partList` resolves sources to meshes and fails on missing parts. |
| `src/solver.ts` | Pure shelf-fit candidates/ranking; includes finished cover/top-pin headroom, base and outer connector reach. Layout-card grams are coarse reference values. |
| `src/export.ts` | Kernel mesh conversion, material-oriented shell checks, shared geometry packing, printable boundary validation, binary STL, 3MF and selective profile extraction. |
| `src/estimate.ts` | Process/filament/override resolution and section-based material estimate. Explicit assumptions and asymmetric skins; no universal time prediction. |
| `src/profile.ts` | Versioned base64 byte storage. Storage can fail before JSON parsing begins. |
| `src/profiles.ts` | Compatible preset selection, config composition, raw-config parsing, bed and keep-outs. |
| `src/worker.ts` | WASM lifetime, build/estimate/export protocol and cached `last` meshes/plan; exports transfer output bytes only. |
| `src/main.ts` | Form, hash navigation, profile and estimate state, stale-response rejection, one in-flight/latest pending build, downloads and results. |
| `src/viewer.ts` | Shared-mesh instances; standing poses, explode vectors, floor/camera and GPU resource ownership. |

Coordinates are millimetres, Z up, lane front −X, high end +X, left +Y viewed from
the front. Printable meshes are laid flat; standing poses belong to the assembly.

## Tools and generated files

- `ref.ts` produces tracked `ref.json`; `refParts` covers roles, patterns, designs,
  whole/split, finished walls and base variants. It is a drift snapshot generated
  by this implementation, not an independent geometric oracle.
- `profiles.ts` produces tracked `profiles/index.json` from a versioned Bambu preset
  catalogue; `bun.lock` fixes installed libraries. Never hand-maintain the catalogue.
- `coupon.ts` cuts joint samples from real parts. Existing output is preserved.
- `slice.ts` exports the default PETG Basic job for historical reference
  measurements. The skill helper slices a specified project with its modified keys.
- `zfiller-repro.ts` isolates an upstream slicer diagnostic using a direct convex
  wedge without Manifold or product geometry.
- `build.ts` alone emits `dist/`; `dev.ts` serves it and serializes rebuilds.
  Entry scripts are `main.js`, `worker.js`; WASM and profiles are copied alongside.
- `.github/workflows/pages.yml` gates deploy on check/unit/build, with UI tests in a
  separate job. No framework, API service, database or application server is needed.

## Feature boundaries worth investigating before design

Mixed can widths need a second can specification through solving, manifest and
geometry; one gang-joint tweak cannot supply that contract. Packing optimization
must preserve rigid orientation, all copies, bed margins and exclusions. Rear-load
behavior depends on tier parity and stackability. A new pattern affects auto-radius,
whole-cell containment, keep-outs, cover behavior and minimum ligaments. Physical
performance remains conditional on printer, material, orientation and process.
