// Exports the isolated feasibility candidate and joint samples cut from its real decks.
// Usage: bun prototypes/export-mixed-stack-connection.ts [fresh-output-directory]
import { mkdir } from "node:fs/promises";
import { resolve, join, dirname } from "node:path";
import { createHash } from "node:crypto";
import type { Manifold } from "manifold-3d";
import { buildConnectionPrototype, FRAME, SAMPLE_STACKS } from "./mixed-stack-connection";
import { DENSITY, K } from "../src/model";
import { inspectMesh, meshDataOf, packPlan, threeMf, type MeshData } from "../src/export";
import { composeProfile, defaultPicks, filamentsFor, keepOutFromConfig, type ProfileIndex } from "../src/profiles";
// Reuse the project's established geometry/overhang checker for this experimental tool.
import { geo, overhangArea } from "../test/geo";

const output = resolve(process.argv[2] ?? `.slice/mixed-stack-prototype-${Date.now()}`);
await mkdir(dirname(output), { recursive: true });
await mkdir(output); // Exclusive: a previous run, even an incomplete one, is preserved.

const machine = "Bambu Lab P2S 0.4 nozzle";
const index: ProfileIndex = await Bun.file("profiles/index.json").json();
const filament = filamentsFor(index, machine).find((candidate) => candidate.label === "Bambu PETG Translucent");
if (!filament) throw new Error(`${machine}: missing PETG Translucent profile`);
const config = JSON.parse(new TextDecoder().decode(composeProfile(index, {
  ...defaultPicks(index, machine), filament: filament.name, translucent: true,
})));
const profile = new TextEncoder().encode(JSON.stringify({ ...config, curr_bed_type: "High Temp Plate" }));
const keepOut = keepOutFromConfig(profile);

function checkedMesh(name: string, mesh: Manifold) {
  if (mesh.status() !== "NoError" || mesh.isEmpty() || mesh.decompose().length !== 1)
    throw new Error(`${name}: expected a valid connected printable solid`);
  const unsupported = overhangArea(mesh);
  if (unsupported > 1e-6) throw new Error(`${name}: ${unsupported} square mm of unsupported faces`);
  if (Math.abs(mesh.boundingBox().min[2]) > 1e-6) throw new Error(`${name}: print does not start on the bed`);
  const converted = meshDataOf(name, mesh.getMesh());
  const degenerate = inspectMesh(converted, true);
  if (degenerate) console.info(`${name}: retained ${degenerate} zero-area kernel faces`);
  return converted;
}

const data = geo.arena(() => {
  const full = buildConnectionPrototype(geo);
  const fullParts = full.parts.map((part) => ({ mesh: checkedMesh(part.name, part.mesh), qty: part.quantity }));
  const printedVolume = full.parts.reduce((volume, part) => volume + part.mesh.volume() * part.quantity, 0);
  const samples: { mesh: MeshData; qty: number }[] = [];
  for (const fit of [-0.2, 0, 0.3]) {
    const result = buildConnectionPrototype(geo, SAMPLE_STACKS, fit);
    const connection = result.connections[0];
    const fitName = String(fit).replace("-", "minus-").replace(".", "p");
    for (const stackIndex of [0, 1]) {
      const stack = result.stacks[stackIndex];
      const part = result.parts.find((candidate) => candidate.name === `stack-${stackIndex + 1}-lane-bottom-deck-front`);
      if (!part) throw new Error("Prototype sample requires the first two bottom decks to split");
      const acrossFrom = stackIndex === 0 ? stack.derived.OW / 2 - 18 : -stack.derived.OW / 2;
      const acrossTo = stackIndex === 0 ? stack.derived.OW / 2 + K.gangGap + 5 : -stack.derived.OW / 2 + 18;
      const bounds = part.mesh.boundingBox();
      const window = geo.box(FRAME.railWidth, acrossTo - acrossFrom, bounds.max[2] + 2,
        connection.anchor - stack.derived.L / 2, (acrossFrom + acrossTo) / 2, bounds.max[2] / 2);
      const sample = geo.isect(part.mesh, window);
      samples.push({ mesh: checkedMesh(`fit-${fitName}-${stackIndex === 0 ? "tongue" : "socket"}`, sample), qty: 1 });
    }
    for (const name of ["prototype-transverse-key", "prototype-key-keeper"]) {
      const part = result.parts.find((candidate) => candidate.name === name)!;
      samples.push({ mesh: checkedMesh(`fit-${fitName}-${name}`, part.mesh), qty: name.endsWith("keeper") ? 2 : 1 });
    }
  }
  return { fullParts, samples, report: {
    purpose: "Connection feasibility candidate; not integrated into the app or physically qualified",
    stacks: SAMPLE_STACKS, anchors: full.anchors, frameHeightMillimetres: FRAME.height,
    connections: full.connections, originalSolidGrams: full.originalPrintVolume / 1000 * DENSITY,
    prototypeSolidGrams: printedVolume / 1000 * DENSITY,
    addedSolidGrams: (printedVolume - full.originalPrintVolume) / 1000 * DENSITY,
    fullCopies: fullParts.reduce((count, part) => count + part.qty, 0),
    sampleCopies: samples.reduce((count, part) => count + part.qty, 0),
    assembly: "Join bottom-deck halves and lower neighboring Ts together. Insert rear keys from the front first; install their two keepers, then the front keys and keepers. Install bottom walls and the remaining production parts afterward.",
    physicalLimitations: "Insertion force, snap recovery, clearance/play, creep, racking and loaded bottom-supported handling are unverified.",
  } };
});

const files = [];
for (const [filename, parts] of [["organizer.3mf", data.fullParts], ["connection-samples.3mf", data.samples]] as const) {
  const plan = packPlan(parts, [256, 256, 256], 3, undefined, keepOut);
  const bytes = threeMf(plan, [256, 256, 256], { profile });
  await Bun.write(join(output, filename), bytes);
  files.push({ filename, sha256: createHash("sha256").update(bytes).digest("hex"),
    plates: Math.max(...plan.placements.map((placement) => placement.plate)) + 1,
    copies: plan.placements.length, geometries: plan.geometries.length });
}
await Bun.write(join(output, "report.json"), JSON.stringify({ ...data.report, machine, material: filament.label, files }, null, 2));
console.log(JSON.stringify({ output, ...data.report, files }, null, 2));
