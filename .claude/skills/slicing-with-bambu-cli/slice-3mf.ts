// Slices any 3MF this app wrote with the installed Bambu Studio CLI, faithfully: the
// three presets it names are flattened (the CLI segfaults on bare system preset names)
// and its "(modified)" keys are copied back on top, because presets loaded on the command
// line beat the 3MF and would silently drop them. Prints Bambu's time and grams per plate.
//
//   bun .claude/skills/slicing-with-bambu-cli/slice-3mf.ts coupon.3mf    # all plates
//   bun .claude/skills/slicing-with-bambu-cli/slice-3mf.ts coupon.3mf 2  # plate 2 only
//
// BAMBU_APP overrides the app bundle, BAMBU_PROFILES the preset folder (as in profiles.ts).
// Evidence goes to a fresh <repo>/.slice/<name>-<unique>/; previous runs are preserved.
import { $ } from "bun";
import { unzipSync, strFromU8 } from "fflate";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readdirSync } from "node:fs";
import { basename, join, resolve } from "node:path";

const [file, plate = "0"] = process.argv.slice(2);
if (!file) throw new Error("usage: slice-3mf.ts <file.3mf> [plate]");
const selectedPlate = Number(plate);
if (!Number.isSafeInteger(selectedPlate) || selectedPlate < 0 || !/^\d+$/.test(plate))
  throw new Error("plate must be a nonnegative integer: 0 for all plates, or a one-based plate number");
const APP = process.env.BAMBU_APP ?? "/Applications/BambuStudio.app/Contents";
const PRESETS = process.env.BAMBU_PROFILES ?? `${APP}/Resources/profiles/BBL`;
const root = (await $`git rev-parse --show-toplevel`.text()).trim();
const scratchDirectory = join(root, ".slice");
mkdirSync(scratchDirectory, { recursive: true });
const out = mkdtempSync(join(scratchDirectory, `${basename(file, ".3mf")}-`));
console.log(`Slice artifacts: ${out}`);

const input = resolve(file);
const inputBytes = await Bun.file(input).bytes();
const retainedInput = join(out, "input.3mf");
await Bun.write(retainedInput, inputBytes);
await Bun.write(join(out, "input.json"), JSON.stringify({ path: input, sha256: createHash("sha256").update(inputBytes).digest("hex"), app: APP, presets: PRESETS }, null, 2));
const archive = unzipSync(inputBytes, { filter: (entry) => ["Metadata/project_settings.config", "Metadata/model_settings.config"].includes(entry.name) });
const projectSettings = archive["Metadata/project_settings.config"];
if (!projectSettings) throw new Error(`${file} has no Metadata/project_settings.config - export it with a print profile picked. Artifacts: ${out}`);
const project = JSON.parse(strFromU8(projectSettings));
if (!project || typeof project !== "object" || Array.isArray(project)) throw new Error(`${file}: project settings must be an object. Artifacts: ${out}`);
const modelSettings = strFromU8(archive["Metadata/model_settings.config"] ?? new Uint8Array());
const plateCount = [...modelSettings.matchAll(/<plate>/g)].length;
if (!plateCount || selectedPlate > plateCount) throw new Error(`${file}: requested plate ${plate} but found ${plateCount} declared plates. Artifacts: ${out}`);

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
  (project.different_settings_to_system?.[index] ?? "").split(";").filter(Boolean).map((key: string) => {
    if (!Object.hasOwn(project, key)) throw new Error(`${file}: modified key ${key} has no value. Artifacts: ${out}`);
    return [key, project[key]];
  }));
const filaments: string[] = project.filament_settings_id;
if (!Array.isArray(filaments) || !filaments.length || filaments.some((name) => typeof name !== "string" || !name))
  throw new Error(`${file}: filament_settings_id must name the selected filaments. Artifacts: ${out}`);
const system = { from: "system", instantiation: "true" };
const write = async (name: string, config: object) => { await Bun.write(join(out, name), JSON.stringify(config)); return join(out, name); };
const machine = await write("machine.json", { ...flatten("machine", project.printer_settings_id), ...modified(filaments.length + 1), ...system });
const process_ = await write("process.json", { ...flatten("process", project.print_settings_id), ...modified(0), ...system });
const filamentFiles = await Promise.all(filaments.map((name, index) =>
  write(`filament-${index + 1}.json`, { ...flatten("filament", name), ...modified(index + 1), ...system })));
for (const [label, index] of [["process", 0], ...filaments.map((name, i) => [name, i + 1] as const), ["printer", filaments.length + 1]] as const)
  console.log(`${label}: ${Object.keys(modified(index as number)).join(", ") || "(no modified keys)"}`);

const command = [`${APP}/MacOS/BambuStudio`, "--datadir", join(out, "datadir"), "--load-settings", `${machine};${process_}`,
  "--load-filaments", filamentFiles.join(";"), "--slice", String(selectedPlate), "--outputdir", out, retainedInput];
await Bun.write(join(out, "command.json"), JSON.stringify(command, null, 2));
const run = Bun.spawnSync(command, { cwd: out });
await Bun.write(join(out, "stdout.log"), run.stdout);
await Bun.write(join(out, "stderr.log"), run.stderr);
await Bun.write(join(out, "execution.json"), JSON.stringify({ exitCode: run.exitCode, signalCode: run.signalCode }, null, 2));
const diagnostics = `${new TextDecoder().decode(run.stdout)}\n${new TextDecoder().decode(run.stderr)}`
  .split(/\r?\n/).filter((line) => /\[(?:error|fatal)\]|\bZFiller:/i.test(line));
if (diagnostics.length)
  throw new Error(`Bambu Studio reported ${diagnostics.length} internal error(s), despite exit ${run.exitCode}. Slicing is not validated. Artifacts: ${out}\n${diagnostics.slice(0, 5).join("\n")}`);
const resultFile = Bun.file(join(out, "result.json"));
if (!await resultFile.exists())
  throw new Error(`Bambu Studio exit ${run.exitCode ?? `signal ${run.signalCode}`}: no fresh result.json. Artifacts: ${out}`);
const result = await resultFile.json().catch((error) => {
  throw new Error(`Bambu Studio wrote unreadable result.json. Artifacts: ${out}`, { cause: error });
});
if (run.exitCode !== 0 || result?.return_code !== 0)
  throw new Error(`Bambu Studio exit ${run.exitCode ?? `signal ${run.signalCode}`}, result ${result?.return_code}: ${result?.error_string ?? "no error detail"}. Artifacts: ${out}`);

const requestedPlates = selectedPlate ? [selectedPlate] : Array.from({ length: plateCount }, (_, index) => index + 1);
const report = [];
for (const plateNumber of requestedPlates) {
  const gcode = `plate_${plateNumber}.gcode`;
  const gcodeFile = Bun.file(join(out, gcode));
  if (!await gcodeFile.exists() || gcodeFile.size === 0)
    throw new Error(`Bambu Studio emitted no nonempty ${gcode}. Slicing is not validated. Artifacts: ${out}`);
  const head = (await gcodeFile.text()).slice(0, 4000);
  const time = head.match(/total estimated time: ([^\n;]+)/)?.[1];
  const grams = head.match(/total filament weight \[g\] : ([\d.]+)/)?.[1];
  if (!time || !/^(?:\d+[dhms]\s*)+$/.test(time.trim()) || grams === undefined || !Number.isFinite(Number(grams)))
    throw new Error(`Bambu Studio emitted unreadable time/grams in ${gcode}. Artifacts: ${out}`);
  report.push({ plate: plateNumber, time: time.trim(), grams: Number(grams) });
  console.log(`${gcode}: ${time}, ${grams} g`);
}
await Bun.write(join(out, "report.json"), JSON.stringify(report, null, 2));
