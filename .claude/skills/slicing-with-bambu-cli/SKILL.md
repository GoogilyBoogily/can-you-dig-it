---
name: slicing-with-bambu-cli
description: Use when measuring print time or grams headlessly, re-measuring JOB_FLOW, checking that Bambu Studio accepts an exported 3MF, slicing coupon.3mf, refreshing profiles/index.json after a Bambu Studio update, or when the BambuStudio CLI exits 139/253/254 or segfaults.
---

# Slicing with the Bambu Studio CLI

Two scripts, one per job. Both use the macOS app at `APP` (`/Applications/BambuStudio.app/Contents`; set `BAMBU_APP` for `slice-3mf.ts`). No window opens. About 1 s per plate.

| Job | Command |
|---|---|
| Default job, our estimate vs Bambu's, implied `JOB_FLOW` | `bun run slice.ts [machine] ['{process overrides json}']` |
| Any 3MF this app wrote (coupon, a user's export) | `bun ${CLAUDE_SKILL_DIR}/slice-3mf.ts <file.3mf> [plate]` |

`slice-3mf.ts` reads the three preset names from the 3MF, flattens them, copies the 3MF's "(modified)" keys back on top, slices, and prints the modified keys plus time and grams per plate. Scratch goes to `.slice/<name>/`.

## Why the flattening and the copy-back

- The CLI cannot slice a 3MF that only names system presets. It looks for `machine_full/` and `process_full/`, which only Bambu's CI ships, and segfaults (139).
- **Presets loaded on the command line beat the 3MF.** Precedence is `--key-name=value` (hyphens; the underscore spelling exits 254), then `--load-settings`/`--load-filaments`, then the 3MF. Load flattened presets without the copy-back and every `different_settings_to_system` key is silently lost. The translucent coupon then slices as stock PETG, at well under half its real grams and time. Check the gcode config block (`nozzle_temperature`, `wall_loops`, `sparse_infill_density`) when in doubt.
- The default job carries no `different_settings_to_system`, so `slice.ts` needs no copy-back. It slices PETG Basic on purpose: `JOB_FLOW` is the non-translucent estimate, and translucent hours come from `translucentFeed`. Never measure `JOB_FLOW` on a translucent job.
- A per-extruder process override needs one entry per `extruderVariants` item of the process in `profiles/index.json`. That's 2 or 3 on a P2S, depending on the nozzle.

When `JOB_FLOW` moves, update together: `JOB_FLOW` in `src/main.ts`, the print-cost spec, and `laneGrams`/`coverGrams` in `src/solver.ts` if `filamentGrams` moved.

## Reading a failure

| Exit | `result.json` | Meaning |
|---|---|---|
| 139 | **not written** (an old one survives) | segfault: presets not flattened, or a bad preset combination |
| 253 | `-3`, "input files ... not found" | bad path, or a flag swallowed the next argument (`--min-save` takes no value) |
| 254 | `-2`, "Invalid parameters" | `--slice N` past the plate count, or an unknown flag |
| 251 | `-5`, "preset file is invalid" | preset JSON `from`/`type` wrong, or a duplicate machine/process |
| other | negative `return_code` | exit = `code & 255`; code table in debugging-bambu-3mf-import |

- Rerun with `--debug 5` (stdout only). A 139 there names the missing preset file.
- `result.json` lands in `--outputdir`, or in the cwd if there is none. When `slice.ts` segfaults it throws `ENOENT ... result.json`, or shows a stale `error_string` with `(exit null)` if an old one exists. Treat both as a 139.
- The gcode header's `total filament volume [cm^3]` is actually mm³.

## Profiles refresh (after a Bambu Studio update)

1. Run `bun run profiles`. It rewrites the tracked `profiles/index.json` from `PRESETS` in `profiles.ts`; `BAMBU_PROFILES` and `BAMBU_VERSION` point it at a checkout.
2. Read `git diff --stat profiles/index.json` and look for renamed presets.
3. Run `bun test test/profiles.test.ts test/profile.test.ts`.
4. Run `bun run slice.ts`.

A renamed preset no longer kills the picker (0f3c921; guarded in `test-ui/share.ui.test.ts`), but check that the default picks still resolve. User presets live in `~/Library/Application Support/BambuStudio/user/<uid>/`.
