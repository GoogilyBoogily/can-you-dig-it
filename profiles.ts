// bun run profiles  →  profiles/<id>.config for every entry in src/profiles.ts.
//
// Bambu Studio's CLI writes the project_settings.config we want, but it does not
// resolve a preset's `inherits` chain (it looks for machine_full/ directories the app
// does not ship), so this flattens each chain first and hands the CLI complete files.
// Needs Bambu Studio installed; rerun after a Bambu update and read the diff.
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { unzipSync } from "fflate";
import { BUILT_IN_PROFILES, profileUrl } from "./src/profiles";
import { stlBinary, bboxOf } from "./src/export";

const APP = "/Applications/BambuStudio.app/Contents";
const PRESETS = `${APP}/Resources/profiles/BBL`;
const SCRATCH = resolve(".profiles-scratch"); // absolute: the CLI resolves relative paths somewhere else

async function flattenPreset(kind: "machine" | "process" | "filament", name: string): Promise<Record<string, unknown>> {
  const leaf = await Bun.file(join(PRESETS, kind, `${name}.json`)).json();
  const { inherits, ...own } = leaf;
  const parent = inherits ? await flattenPreset(kind, inherits) : {};
  return { ...parent, ...own, name, from: "system" };
}

/** The machine preset plus the bed its printer model defaults to; the CLI otherwise leaves "Cool Plate". */
async function machinePreset(name: string): Promise<Record<string, unknown>> {
  const machine = await flattenPreset("machine", name);
  const model = await Bun.file(join(PRESETS, "machine", `${machine.printer_model}.json`)).json();
  return { ...machine, curr_bed_type: model.default_bed_type };
}

function cubeStl(): Uint8Array {
  const pos = new Float32Array([0, 0, 0, 10, 0, 0, 10, 10, 0, 0, 10, 0, 0, 0, 10, 10, 0, 10, 10, 10, 10, 0, 10, 10]);
  const idx = new Uint32Array([0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7]);
  return stlBinary({ name: "cube", pos, idx, bbox: bboxOf(pos) });
}

rmSync(SCRATCH, { recursive: true, force: true }); mkdirSync(SCRATCH); mkdirSync("profiles", { recursive: true });
writeFileSync(join(SCRATCH, "cube.stl"), cubeStl());

for (const profile of BUILT_IN_PROFILES) {
  const files = { machine: profile.machine, process: profile.process, filament: profile.filament };
  const paths: Record<string, string> = {};
  for (const [kind, name] of Object.entries(files) as ["machine" | "process" | "filament", string][]) {
    paths[kind] = join(SCRATCH, `${kind}.json`);
    const preset = kind === "machine" ? await machinePreset(name) : await flattenPreset(kind, name);
    writeFileSync(paths[kind], JSON.stringify(preset, null, 2));
  }
  const outDir = join(SCRATCH, profile.id); mkdirSync(outDir);
  const cli = Bun.spawnSync([
    `${APP}/MacOS/BambuStudio`, "--debug", "1",
    "--load-settings", `${paths.machine};${paths.process}`,
    "--load-filaments", paths.filament,
    "--export-3mf", "out.3mf", "--outputdir", outDir, join(SCRATCH, "cube.stl"),
  ]);
  if (cli.exitCode !== 0) throw new Error(`Bambu Studio CLI failed for ${profile.id} (exit ${cli.exitCode}):\n${cli.stderr}`);
  const config = unzipSync(new Uint8Array(await Bun.file(join(outDir, "out.3mf")).arrayBuffer()))["Metadata/project_settings.config"];
  if (!config?.length) throw new Error(`no project_settings.config in the CLI output for ${profile.id}`);
  writeFileSync(profileUrl(profile.id), config);
  console.log(`${profileUrl(profile.id)} ${(config.length / 1024).toFixed(0)} KB`);
}
rmSync(SCRATCH, { recursive: true, force: true });
