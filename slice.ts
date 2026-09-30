// Slice the default job with the installed Bambu Studio's CLI and print its time and
// grams beside ours: how JOB_FLOW (src/main.ts) was measured, and how to re-check it.
//
//   bun run slice.ts                                  # P2S 0.4, 0.20mm Standard, PETG Basic
//   bun run slice.ts "Bambu Lab X1 Carbon 0.4 nozzle" '{"outer_wall_acceleration":["10000","10000"]}'
//
// The CLI cannot slice a 3MF that only names system presets: it looks for flattened
// machine_full/ and process_full/ files that only Bambu's CI builds ship, and segfaults.
// So the three presets are flattened here and passed in. The process override is JSON;
// per-extruder values need one entry a slot (the P2S has three). Output goes to .slice/,
// which git ignores. About 15 s for 18 plates.
import Module from "manifold-3d";
import { mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { DEFAULTS, DENSITY, Geo, solve, buildAll, partList, filamentGrams } from "./src/geometry";
import { pack, threeMf, bboxOf, type MeshData } from "./src/export";
import { composeProfile, defaultPicks, filamentsFor, keepOutFromConfig, type ProfileIndex } from "./src/profiles";

const APP = "/Applications/BambuStudio.app/Contents";
const machine = process.argv[2] ?? "Bambu Lab P2S 0.4 nozzle";
const overrides = JSON.parse(process.argv[3] ?? "{}");
const out = ".slice";
mkdirSync(out, { recursive: true });

// the default job, packed and written the way the worker does it
const wasm = await Module(); wasm.setup();
const g = new Geo(wasm), o = DEFAULTS;
const parts = partList(buildAll(g, o, solve(o)), o).map((p) => {
  const mg = p.mesh.getMesh();
  const pos = new Float32Array(mg.vertProperties.length / mg.numProp * 3);
  for (let i = 0, j = 0; i < mg.vertProperties.length; i += mg.numProp, j += 3) { pos[j] = mg.vertProperties[i]; pos[j + 1] = mg.vertProperties[i + 1]; pos[j + 2] = mg.vertProperties[i + 2]; }
  const mesh: MeshData = { name: p.name, pos, idx: new Uint32Array(mg.triVerts), bbox: bboxOf(pos) };
  return { mesh, qty: p.qty, grams: filamentGrams(p.mesh) };
});
const index: ProfileIndex = await Bun.file("profiles/index.json").json();
const picks = { ...defaultPicks(index, machine), filament: filamentsFor(index, machine).find((f) => f.label === "Bambu PETG Basic")!.name };
const profile = composeProfile(index, picks);
const placed = pack(parts, o.bed, o.bedMargin, undefined, keepOutFromConfig(profile));
await Bun.write(join(out, "job.3mf"), threeMf(placed, o.bed, { profile }));

// the three presets, inherits chains flattened
const presets = new Map<string, any>();
for (const kind of ["machine", "process", "filament"])
  for (const file of readdirSync(`${APP}/Resources/profiles/BBL/${kind}`).filter((f) => f.endsWith(".json"))) {
    const preset = await Bun.file(`${APP}/Resources/profiles/BBL/${kind}/${file}`).json();
    presets.set(`${kind}/${preset.name}`, preset);
  }
const flatten = (kind: string, name: string): any => {
  const preset = presets.get(`${kind}/${name}`);
  if (!preset) throw new Error(`no ${kind} preset named ${name}`);
  const { inherits, ...own } = preset;
  return inherits ? { ...flatten(kind, inherits), ...own } : own;
};
const system = { from: "system", instantiation: "true" };
await Bun.write(join(out, "machine.json"), JSON.stringify({ ...flatten("machine", picks.machine), ...system }));
await Bun.write(join(out, "process.json"), JSON.stringify({ ...flatten("process", picks.process), ...overrides, ...system }));
await Bun.write(join(out, "filament.json"), JSON.stringify({ ...flatten("filament", picks.filament), ...system }));

for (const file of readdirSync(out).filter((f) => f.endsWith(".gcode"))) await Bun.file(join(out, file)).delete();
const run = Bun.spawnSync([`${APP}/MacOS/BambuStudio`, "--load-settings", `${out}/machine.json;${out}/process.json`,
  "--load-filaments", `${out}/filament.json`, "--slice", "0", "--outputdir", out, `${out}/job.3mf`]);
const result = await Bun.file(join(out, "result.json")).json();
if (run.exitCode !== 0) throw new Error(`Bambu Studio: ${result.error_string} (exit ${run.exitCode})`);

// Bambu's header against ours, plate by plate
const seconds = (text: string) => text.match(/(\d+)([dhms])/g)!.reduce((sum, part) => sum + Number(part.slice(0, -1)) * { d: 86400, h: 3600, m: 60, s: 1 }[part.at(-1) as "d"], 0);
const gramsOf = new Map(parts.map((p) => [p.mesh.name, p.grams]));
const plates = Math.max(...placed.map((p) => p.plate)) + 1;
let totalSeconds = 0, totalBambu = 0, totalOurs = 0;
console.log(picks, JSON.stringify(overrides));
for (let plate = 1; plate <= plates; plate++) {
  const head = (await Bun.file(join(out, `plate_${plate}.gcode`)).text()).slice(0, 4000);
  const time = seconds(head.match(/total estimated time: ([^\n;]+)/)![1]);
  const bambu = Number(head.match(/total filament weight \[g\] : ([\d.]+)/)![1]);
  const ours = placed.filter((p) => p.plate === plate - 1).reduce((sum, p) => sum + gramsOf.get(p.part)!, 0);
  totalSeconds += time; totalBambu += bambu; totalOurs += ours;
  console.log(`plate ${String(plate).padStart(2)}  ${(time / 60).toFixed(0).padStart(4)} min  Bambu ${bambu.toFixed(1).padStart(6)} g  ours ${ours.toFixed(1).padStart(6)} g  ${(ours / DENSITY * 1000 / time).toFixed(2)} mm³/s`);
}
console.log(`job: ${plates} plates, ${(totalSeconds / 3600).toFixed(2)} h, Bambu ${totalBambu.toFixed(0)} g, ours ${totalOurs.toFixed(0)} g; JOB_FLOW ${(totalOurs / DENSITY * 1000 / totalSeconds).toFixed(2)} mm³/s`);
