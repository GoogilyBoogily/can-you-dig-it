// Slices any 3MF this app wrote with the installed Bambu Studio CLI, faithfully: the
// three presets it names are flattened (the CLI segfaults on bare system preset names)
// and its "(modified)" keys are copied back on top, because presets loaded on the command
// line beat the 3MF and would silently drop them. Prints Bambu's time and grams per plate.
//
//   bun ${CLAUDE_SKILL_DIR}/slice-3mf.ts coupon.3mf            # every plate
//   bun ${CLAUDE_SKILL_DIR}/slice-3mf.ts coupon.3mf 2          # plate 2 only
//
// BAMBU_APP overrides the app bundle, BAMBU_PROFILES the preset folder (as in profiles.ts).
// Scratch goes to <repo>/.slice/<name>/, which git ignores.
import { $ } from "bun";
import { unzipSync, strFromU8 } from "fflate";
import { mkdirSync, readdirSync, rmSync } from "node:fs";
import { basename, join, resolve } from "node:path";

const [file, plate = "0"] = process.argv.slice(2);
if (!file) throw new Error("usage: slice-3mf.ts <file.3mf> [plate]");
const APP = process.env.BAMBU_APP ?? "/Applications/BambuStudio.app/Contents";
const PRESETS = process.env.BAMBU_PROFILES ?? `${APP}/Resources/profiles/BBL`;
const root = (await $`git rev-parse --show-toplevel`.text()).trim();
const out = join(root, ".slice", basename(file, ".3mf"));
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const input = resolve(file);
const archive = unzipSync(await Bun.file(input).bytes(), { filter: (entry) => entry.name === "Metadata/project_settings.config" });
const project = JSON.parse(strFromU8(archive["Metadata/project_settings.config"] ?? new Uint8Array()) || "null");
if (!project) throw new Error(`${file} has no Metadata/project_settings.config - export it with a print profile picked`);

// ponytail: same flatten as slice.ts; lift both into one module if a third copy appears
const presets = new Map<string, any>();
for (const kind of ["machine", "process", "filament"])
  for (const name of readdirSync(`${PRESETS}/${kind}`).filter((f) => f.endsWith(".json"))) {
    const preset = await Bun.file(`${PRESETS}/${kind}/${name}`).json();
    presets.set(`${kind}/${preset.name}`, preset);
  }
const flatten = (kind: string, name: string): any => {
  const preset = presets.get(`${kind}/${name}`);
  if (!preset) throw new Error(`no ${kind} preset named ${name} in ${PRESETS}`);
  const { inherits, ...own } = preset;
  return inherits ? { ...flatten(kind, inherits), ...own } : own;
};

// different_settings_to_system: [0] process, [1..n] filaments, [n+1] printer, each ";"-joined
const modified = (index: number): Record<string, unknown> => Object.fromEntries(
  (project.different_settings_to_system?.[index] ?? "").split(";").filter(Boolean).map((key: string) => [key, project[key]]));
const filaments: string[] = project.filament_settings_id;
const system = { from: "system", instantiation: "true" };
const write = async (name: string, config: object) => { await Bun.write(join(out, name), JSON.stringify(config)); return join(out, name); };
const machine = await write("machine.json", { ...flatten("machine", project.printer_settings_id), ...modified(filaments.length + 1), ...system });
const process_ = await write("process.json", { ...flatten("process", project.print_settings_id), ...modified(0), ...system });
const filamentFiles = await Promise.all(filaments.map((name, index) =>
  write(`filament-${index + 1}.json`, { ...flatten("filament", name), ...modified(index + 1), ...system })));
for (const [label, index] of [["process", 0], ...filaments.map((name, i) => [name, i + 1] as const), ["printer", filaments.length + 1]] as const)
  console.log(`${label}: ${Object.keys(modified(index as number)).join(", ") || "(no modified keys)"}`);

const run = Bun.spawnSync([`${APP}/MacOS/BambuStudio`, "--load-settings", `${machine};${process_}`,
  "--load-filaments", filamentFiles.join(";"), "--slice", plate, "--outputdir", out, input]);
const result = await Bun.file(join(out, "result.json")).json().catch(() => null);
if (run.exitCode !== 0)
  throw new Error(`Bambu Studio exit ${run.exitCode ?? `signal ${run.signalCode}`}: ${result?.error_string ?? "no result.json (crashed)"} - rerun the command with --debug 5`);

for (const gcode of readdirSync(out).filter((f) => /^plate_\d+\.gcode$/.test(f)).sort()) {
  const head = (await Bun.file(join(out, gcode)).text()).slice(0, 4000);
  const time = head.match(/total estimated time: ([^\n;]+)/)?.[1];
  const grams = head.match(/total filament weight \[g\] : ([\d.]+)/)?.[1];
  console.log(`${gcode}: ${time}, ${grams} g`);
}
