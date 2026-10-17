// Isolated fake-consumer checks for the helper's evidence and acceptance boundary.
// bun test ./.claude/skills/slicing-with-bambu-cli/slice-3mf.test.ts
// Fixtures and run evidence are retained; no installed slicer or presets are changed.
import { expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { zipSync, strToU8 } from "fflate";

const repositoryRoot = resolve(import.meta.dir, "../../..");
const fixtures = mkdtempSync(join(tmpdir(), "cyd-skill-slicer-test-"));
const application = join(fixtures, "fake-app");
const presets = join(application, "Resources/profiles/BBL");
const executable = join(application, "MacOS/BambuStudio");
mkdirSync(join(application, "MacOS"), { recursive: true });
for (const kind of ["machine", "process", "filament"]) {
  mkdirSync(join(presets, kind), { recursive: true });
  writeFileSync(join(presets, kind, "base.json"), JSON.stringify({ name: `${kind}-base`, type: kind, baseline: "inherited" }));
  writeFileSync(join(presets, kind, "selected.json"), JSON.stringify({ name: `${kind}-selected`, inherits: `${kind}-base`, marker: kind }));
}
writeFileSync(executable, `#!${process.execPath}
const outputDirectory = process.argv[process.argv.indexOf("--outputdir") + 1];
const mode = process.env.CYD_SKILL_SLICE_MODE;
const [machinePath, processPath] = process.argv[process.argv.indexOf("--load-settings") + 1].split(";");
const filamentPaths = process.argv[process.argv.indexOf("--load-filaments") + 1].split(";");
const loaded = await Promise.all([machinePath, processPath, ...filamentPaths].map(path => Bun.file(path).json()));
if (loaded.some(preset => preset.baseline !== "inherited")) throw new Error("inheritance lost");
if (loaded[0].printable_height !== "250" || loaded[1].wall_loops !== "1"
  || loaded[2].nozzle_temperature[0] !== "270" || loaded[3].nozzle_temperature[0] !== "270")
  throw new Error("modified overrides lost");
await Bun.write(outputDirectory + "/received-input.3mf", Bun.file(process.argv.at(-1)));
if (mode === "diagnostic-stdout") console.log("[error] ZFiller: synthetic regression");
if (mode === "diagnostic-stderr") console.error("[fatal] synthetic slicer failure");
if (mode !== "no-result") await Bun.write(outputDirectory + "/result.json", mode === "bad-result" ? "not-json"
  : JSON.stringify({ return_code: mode === "result-failure" ? -5 : 0, error_string: "synthetic result" }));
const selected = Number(process.argv[process.argv.indexOf("--slice") + 1]);
for (const plate of selected ? [selected] : [1, 2]) {
  if (mode === "missing-gcode" && plate === 2) continue;
  const contents = mode === "empty-gcode" ? "" : mode === "bad-header" ? "; invalid header\\n"
    : "; total estimated time: 1h 2m 3s\\n; total filament weight [g] : 12.5\\nG1 X10 Y10 E1\\n";
  await Bun.write(outputDirectory + "/plate_" + plate + ".gcode", contents);
}
if (mode === "process-failure") process.exit(7);
`);
chmodSync(executable, 0o755);

const profile = {
  printer_settings_id: "machine-selected", print_settings_id: "process-selected",
  filament_settings_id: ["filament-selected", "filament-selected"],
  different_settings_to_system: ["wall_loops", "nozzle_temperature", "nozzle_temperature", "printable_height"],
  wall_loops: "1", nozzle_temperature: ["270"], printable_height: "250",
};
const inputBytes = zipSync({
  "Metadata/project_settings.config": strToU8(JSON.stringify(profile)),
  "Metadata/model_settings.config": strToU8("<config><plate></plate><plate></plate></config>"),
});
const input = join(fixtures, "fixture.3mf");
writeFileSync(input, inputBytes);

function runHelper(mode: string, plate = "0") {
  const run = Bun.spawnSync([process.execPath, join(import.meta.dir, "slice-3mf.ts"), input, plate], {
    cwd: repositoryRoot,
    env: { ...process.env, BAMBU_APP: application, BAMBU_PROFILES: presets, CYD_SKILL_SLICE_MODE: mode },
  });
  const output = new TextDecoder().decode(run.stdout) + new TextDecoder().decode(run.stderr);
  return { exitCode: run.exitCode, output, directory: output.match(/Slice artifacts: ([^\r\n]+)/)?.[1] };
}

test("helper preserves settings, exact input, all plates and earlier run evidence", async () => {
  const first = runHelper("success");
  expect(first.exitCode, first.output).toBe(0);
  const reportPath = join(first.directory!, "report.json");
  const originalReport = readFileSync(reportPath, "utf8");
  expect(JSON.parse(originalReport).map((entry: { plate: number }) => entry.plate)).toEqual([1, 2]);
  expect(new Uint8Array(readFileSync(join(first.directory!, "received-input.3mf")))).toEqual(inputBytes);
  const second = runHelper("success", "2");
  expect(second.exitCode, second.output).toBe(0);
  expect(second.directory).not.toBe(first.directory);
  expect(readFileSync(reportPath, "utf8")).toBe(originalReport);
  expect((await Bun.file(join(second.directory!, "report.json")).json()).map((entry: { plate: number }) => entry.plate)).toEqual([2]);
});

for (const mode of ["diagnostic-stdout", "diagnostic-stderr", "result-failure", "process-failure", "no-result", "bad-result", "missing-gcode", "empty-gcode", "bad-header"]) {
  test(`helper rejects ${mode} and retains diagnostic artifacts`, async () => {
    const run = runHelper(mode);
    expect(run.exitCode, run.output).not.toBe(0);
    expect(run.directory).toBeDefined();
    for (const file of ["input.3mf", "input.json", "command.json", "execution.json", "stdout.log", "stderr.log"])
      expect(await Bun.file(join(run.directory!, file)).exists(), file).toBe(true);
    expect(await Bun.file(join(run.directory!, "report.json")).exists()).toBe(false);
  });
}

test("helper rejects invalid plate selections before launching a consumer", () => {
  for (const plate of ["-1", "1.5", "NaN", "3"]) {
    const run = runHelper("success", plate);
    expect(run.exitCode, run.output).not.toBe(0);
    expect(run.output).toContain("plate");
  }
});
