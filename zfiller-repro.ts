// Standalone Bambu regression probe: no product geometry or kernel is involved.
// bun run zfiller-repro.ts /absolute/path/to/a/slice-run
// The directory supplies job.3mf and flattened machine/process/filament.json.
import { mkdirSync, mkdtempSync } from "node:fs";
import { join, resolve } from "node:path";
import { unzipSync } from "fflate";
import { bboxOf, pack, threeMf } from "./src/export";

if (!process.argv[2]) throw new Error("Usage: bun run zfiller-repro.ts <slice-run-directory>");
const settingsDirectory = resolve(process.argv[2]);
const files = unzipSync(new Uint8Array(await Bun.file(join(settingsDirectory, "job.3mf")).arrayBuffer()));
const profile = files["Metadata/project_settings.config"];
if (!profile) throw new Error(`${settingsDirectory}/job.3mf: missing project settings`);
mkdirSync(".slice", { recursive: true });
const outputDirectory = mkdtempSync(resolve(".slice", "zfiller-"));
const height = 16.34288787841797;
const coordinates = [0, 0, 0, 70, 0, 0, 70, 83.5, 0, 0, 83.5, 0,
  0, 0, 4, 70, 0, height, 70, 83.5, height, 0, 83.5, 4];
// Six outward faces, each triangulated. Analytic volume: footprint × mean height.
const indices = new Uint32Array([0, 2, 1, 0, 3, 2, 0, 1, 5, 0, 5, 4,
  1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7, 4, 5, 6, 4, 6, 7]);
const results = [];
for (const rotation of [0, 90]) {
  const name = `wedge-${rotation}`;
  const directory = join(outputDirectory, name);
  mkdirSync(directory);
  const positions = new Float32Array(coordinates);
  if (rotation === 90) for (let vertex = 0; vertex < positions.length; vertex += 3) {
    const horizontal = positions[vertex];
    positions[vertex] = -positions[vertex + 1];
    positions[vertex + 1] = horizontal;
  }
  const mesh = { name, pos: positions, idx: indices, bbox: bboxOf(positions) };
  await Bun.write(join(directory, "job.3mf"), threeMf(pack([{ mesh, qty: 1 }], [256, 256, 256], 3), [256, 256, 256], { profile }));
  for (const kind of ["machine", "process", "filament"])
    await Bun.write(join(directory, `${kind}.json`), Bun.file(join(settingsDirectory, `${kind}.json`)));
  const command = ["/Applications/BambuStudio.app/Contents/MacOS/BambuStudio",
    "--datadir", join(directory, "datadir"), "--load-settings", `${directory}/machine.json;${directory}/process.json`,
    "--load-filaments", join(directory, "filament.json"), "--slice", "0", "--outputdir", directory, join(directory, "job.3mf")];
  await Bun.write(join(directory, "command.json"), JSON.stringify(command, null, 2));
  const run = Bun.spawnSync(command, { cwd: directory });
  await Bun.write(join(directory, "stdout.log"), run.stdout);
  await Bun.write(join(directory, "stderr.log"), run.stderr);
  const diagnostics = `${new TextDecoder().decode(run.stdout)}\n${new TextDecoder().decode(run.stderr)}`
    .split(/\r?\n/).filter((line) => /\[(?:error|fatal)\]|\bZFiller:/i.test(line));
  const result = await Bun.file(join(directory, "result.json")).json();
  results.push({ rotation, exitCode: run.exitCode, returnCode: result.return_code, diagnostics,
    vertices: positions.length / 3, triangles: indices.length / 3, analyticVolume: 70 * 83.5 * (4 + height) / 2 });
  console.log(`${name}: exit ${run.exitCode}, result ${result.return_code}, ${diagnostics.length} internal errors`);
}
await Bun.write(join(outputDirectory, "report.json"), JSON.stringify(results, null, 2));
console.log(`Reproduction artifacts: ${outputDirectory}`);
if (results.some((result) => result.exitCode !== 0 || result.returnCode !== 0 || result.diagnostics.length)) process.exitCode = 1;
