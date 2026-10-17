---
name: slicing-with-bambu-cli
description: Slice can-you-dig-it exports or joint coupons with Bambu Studio CLI, measure real grams/time, qualify toolpaths, and investigate CLI crashes or internal diagnostics including ZFiller. Also use for real slicing after a preset-catalogue refresh.
---

# Slice with Bambu Studio

Run from repository root. Both scripts default to the macOS bundle
`/Applications/BambuStudio.app/Contents`. The arbitrary-project helper supports
`BAMBU_APP` and `BAMBU_PROFILES`; `slice.ts` currently has a fixed bundle path.
Record the binary/preset versions rather than assuming the catalogue matches.

| Job | Command |
|---|---|
| Default PETG Basic job and historical reference comparison | `bun run slice.ts [machine] ['{process overrides JSON}']` |
| Exported project/coupon, all plates | `bun .claude/skills/slicing-with-bambu-cli/slice-3mf.ts path/to/job.3mf` |
| One plate, one-based | `bun .claude/skills/slicing-with-bambu-cli/slice-3mf.ts path/to/job.3mf 2` |
| Fresh coupon from current geometry | `bun run coupon.ts` |

`0` selects all plates. The helper expects this app's project metadata and a
selected print profile whose presets exist in the chosen system catalogue. It
does not silently replace unknown custom/user presets. Keep that limitation clear.

## Preserve the intended settings

The observed Bambu 2.8 CLI needs flattened system presets; bare preset names can
trigger missing `machine_full`/`process_full` files and a crash. Command-line
presets take precedence over project settings. The helper flattens inheritance
and reapplies each `different_settings_to_system` key to the corresponding
process/filament/printer config. Without that copy-back a translucent coupon can
silently become a stock-process measurement. Fill per-process variant arrays
according to the actual catalogue, not a fixed slot count.

Inspect the G-code config for critical settings such as temperature, wall loops,
infill, line width, speed and bed type. A CLI run with supplied presets is not
proof that the GUI imported those settings; see
[debugging-bambu-3mf-import](../debugging-bambu-3mf-import/SKILL.md).

## Acceptance and retained evidence

Every helper run uses a fresh `.slice/<name>-<unique>/` directory. It preserves
the exact input copy/hash, flattened presets, command, execution result, both logs,
fresh `result.json`, G-code and per-plate report. It never deletes the previous run.

Require zero process and result codes, no internal error/fatal/ZFiller diagnostics,
and all requested nonempty plate G-codes with readable time/gram headers. Then
inspect functional deposition before claiming a small joint feature prints.
Approximate centreline coverage is not a physical fit/strength measurement.

Read [diagnostics and calibration](references/diagnostics.md) for result codes,
ZFiller reproduction and fair estimate comparisons. Runtime varies substantially
by process and geometry; do not promise a fixed seconds-per-plate cost.

After editing the helper, run
`bun test ./.claude/skills/slicing-with-bambu-cli/slice-3mf.test.ts`.
Its isolated fake consumer checks modified-key inheritance, input preservation,
repeat-run evidence, plate selection and rejection paths. Follow it with a real
slice when the installed consumer is available; mocks cannot prove its behavior.

## After a slicer/catalogue update

Use [maintaining-print-profiles](../maintaining-print-profiles/SKILL.md) to refresh
`profiles/index.json` deliberately, inspect renamed/incompatible presets, and run
unit/browser selection checks. Slice representative exports with exact intended
settings. Do not regenerate the catalogue just because slicing was requested.
