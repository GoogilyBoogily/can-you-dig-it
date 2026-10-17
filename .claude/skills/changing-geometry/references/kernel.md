# Manifold ownership and geometric evidence

## Runtime ownership in this project

`Geo` wraps shape-producing methods and factories once per WASM module.
`Geo.arena` owns all resulting Manifold and CrossSection handles during its
synchronous callback, including intermediate transforms, decompositions and slices.
It cannot nest. Return copied `MeshData`, measurements or other plain values;
never return a live shape or make the callback async. Outside an arena, the
caller owns shapes. The estimate integrator deliberately frees slices per layer.

`Geo.union([shape])` and an empty-cut `diff` may return the original object. Do
not delete an operand early assuming a boolean always allocates a new handle.
Cleanup after an aborted WASM heap can itself fail; the code logs that context
while preserving the original failure. A fatal worker module is replaced once
per current build rather than reused or retried indefinitely.

## Transform and construction traps

- `prismY(profile, depth, y0)` extrudes an (x,z) profile along +Y from `y0`.
  `prismX(profile, depth, x0)` extrudes (y,z) along +X. Their signatures differ
  from an ordinary centered box; inspect them before writing a probe.
- `stand` rotates X, then Y, then Z, then translates. `lay` undoes translation
  and reverses rotations. The viewer uses Three.js Euler order `ZYX` to match.
- Bound half-spaces must follow the actual object, including translation. The
  current wall/cover splits use plane operations; avoid fixed giant boxes that
  silently truncate tall or wide inputs.
- `roundTop` preserves the lower body, builds upper outline slabs, overlaps the
  first slab slightly, then intersects the original body. A coplanar-only join
  once produced disconnected cover shells. Test translated shapes as well as
  origin-centred examples.
- Check differences in both directions when proving equivalent solids. For
  split conservation account analytically for intentional sockets/clearance;
  equal total volume or bounding boxes alone can hide material moved elsewhere.

## Mesh boundary

`meshDataOf` reads `numProp` stride, applies the kernel's merge vectors, compacts
referenced positions and checks topology. Equal coordinates alone do not imply
topological identity. Preserve zero-area kernel triangles and diagnose them;
dropping a face can open an otherwise paired indexed surface. Manufacturing
serialization validates the coordinates it actually writes.

Primary references checked 2026-10-15:

- [Manifold Mesh API](https://manifoldcad.org/docs/jsapi/classes/manifold.Mesh.html):
  property vertices can be split; explicit merge vectors restore connectivity.
  A convenience `merge()` operation is best-effort and is not a proof of validity.
- [Manifold API](https://manifoldcad.org/docs/jsapi/classes/manifold.Manifold.html):
  shape construction, status, geometric operations and explicit deletion.
- [Manifold source](https://github.com/elalish/manifold): use the tag matching
  the installed package and its bundled `manifold.d.ts` for version-sensitive work.

The linked generated API is rolling documentation. Do not copy new API fields or
change numeric tolerances without checking this project's installed version.
