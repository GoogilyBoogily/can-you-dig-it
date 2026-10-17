---
name: qualifying-printed-joints
description: Design or qualify can-you-dig-it printed snaps, concealed cover catches, seam keys, end-wall retention and PETG fit/load behavior. Use for joint sizing, coupon changes, print-fit diagnosis or loaded-handling claims, beyond isolated solid validity.
---

# Qualify joints and printed assemblies

Read current joint code in `src/features/joints.ts`, host geometry, `coupon.ts`,
and `docs/open-questions.md`. The owner uses P2S, Bambu PETG Translucent, 0.4 mm
nozzle and 0.2 mm layers, with printed joints/keys and a flush patterned shell.
Loaded handling is supported underneath. Confirm any requested departure.

## Separate the evidence levels

1. **Geometry:** actual placed male/female/host meshes seat without unintended
   collisions; keys/catches block required withdrawal; protected roots and
   ligaments remain; each print is connected and support-free by current rules.
2. **Toolpath:** the intended printer/process deposits the functional rails,
   bridges, collars and hook roots in both packed orientations. A fine CAD tip
   does not guarantee an extrusion. Slice diagnostics must be resolved or reported.
3. **Physical fit:** clean printed pairs seat by the intended hand motion and
   retain without visible steps or unwanted play, at the chosen fit/process.
4. **Loaded use:** a complete lane behaves under the agreed can load, dwell and
   bottom-supported handling. Fit, a CAD interference check or a slicer pass
   cannot establish a load rating.

The current joints' physical fit and loaded behavior were still unqualified in
the project record on 2026-10-15. Earlier successful connectors are not evidence
for the current snaps, keys and blind catches. Recheck for newer owner results.

## Size and diagnose the actual mechanism

Read [mechanics and research](references/mechanics.md) for beam assumptions,
anisotropy and creep. Preserve shared clearance and printed-plane flexure. Verify
host material around reliefs, minimum rails and root continuity at fit endpoints.
Check both insertion sequence and retention direction, including uncovered ends.

Regenerate a fresh coupon with `bun run coupon.ts`; use the path it reports.
The script preserves an existing `coupon.3mf` and accepts a fresh output path
after the optional machine name. Read its header for current mating pairs; don't
reimplement simplified samples disconnected from production geometry.

Use [the print protocol](references/print-protocol.md) for coupon/lane trials and
records. Generating and slicing artifacts is separate from sending a printer job;
do not claim a physical result or operate a printer without authorization.
Use [changing-geometry](../changing-geometry/SKILL.md) for implementation/ref checks
and [CLI slicing](../slicing-with-bambu-cli/SKILL.md) for digital qualification.
