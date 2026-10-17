---
name: maintaining-print-profiles
description: Maintain can-you-dig-it printer/nozzle/process/filament selections, generated Bambu catalogue, translucent settings, imported profile preservation and profile-aware material estimates. Use for profiles.ts, src/profiles.ts, src/profile.ts and src/estimate.ts.
---

# Maintain print settings and estimates

Read `profiles.ts`, `src/profiles.ts`, `src/profile.ts`, `src/estimate.ts` and
the relevant `main.ts`/worker state before editing. Use
[the settings contracts and sources](references/settings.md) for detailed work.

- Generate `profiles/index.json` from the intended Bambu catalogue; do not patch
  its machine indexes by hand. `BAMBU_PROFILES` and `BAMBU_VERSION` select a
  matching upstream checkout. Read the generated diff for renamed presets,
  compatibility, variant slots and changed defaults.
- Keep printer → nozzle → process/filament compatibility enforced at composition,
  not just by dropdown filtering. Unknown or incompatible shared picks must
  leave a working picker and preserve the saved custom profile.
- Imported configs remain bytes. Parsing to inspect settings does not authorize
  re-encoding on export. Versioned base64 storage and guarded storage access are
  in `profile.ts`; bad imports retain the last working profile.
- Translucent mode is a process/filament override set with tracked modified keys,
  not a material label alone. Respect variant arrays, PETG-only heat overrides,
  and unsupported 0.2 mm nozzle handling in UI, links and direct composition.
- Built-part material estimates resolve selected catalogue settings plus project
  overrides, including density, nozzle-relative line widths, asymmetric skins
  and infill. Missing/unreadable settings must disclose assumptions. Keep
  `estimateVolume`'s scoped per-section cleanup.
- Profile changes that only affect estimates use cached meshes. Bed/keep-out
  changes may repack/rebuild. The layout-card gram heuristic and legacy
  `filamentGrams` helper are different paths; changing one does not calibrate all.
  The UI has no universal `JOB_FLOW` time estimate.

Run `profiles`, `profile`, `profile-consistency`, `estimate-line-width` and relevant
manufacturing unit suites, then browser `profile`, `estimates` and `generation`
cases and normal typecheck/build checks. Verify the downloaded profile bytes,
not just a label. Use [Bambu import debugging](../debugging-bambu-3mf-import/SKILL.md)
for GUI setting read-back and [CLI slicing](../slicing-with-bambu-cli/SKILL.md)
when comparing actual toolpath grams/time.
