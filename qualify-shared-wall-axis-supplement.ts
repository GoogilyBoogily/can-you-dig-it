import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { unzipSync } from "fflate";
import { geo, overhangArea } from "./test/geo";
import { buildMixedGeometry } from "./src/mixed-geometry";
import { mixedPartManifest } from "./src/assembly";
import { meshDataOf, inspectMesh, packPlan, threeMf } from "./src/export";
import { bedFromConfig, keepOutFromConfig } from "./src/profiles";
// Reproduce missing-X windows using exact production identities and probe coordinates.
// bun qualify-shared-wall-axis-supplement.ts <production-evidence-directory> [fresh-output-directory]
interface StoredProbe { label: string; point: number[]; featureFrame?: { offsetX: number; heightAboveWall: number; materialHeight: number } }
interface StoredSample {
  name: string; source: string; productionSource: import("./src/assembly").MixedPartSource;
  fit: number; turned: boolean; qty: number; probes: StoredProbe[]; originalCouponName?: string;
}
interface ProductionEvidence {
  project: string; sourceSha256: Record<string, string>; layouts: import("./src/solver").MixedLayout[]; samples: StoredSample[];
}
interface CoverageFailure { missingOrientation?: string; present?: boolean[] }
const [inputDirectory, freshOutputDirectory] = Bun.argv.slice(2);
if (!inputDirectory) throw new Error("Usage: bun qualify-shared-wall-axis-supplement.ts <evidence-directory> [fresh-output-directory]");
const directory = resolve(inputDirectory);
const destination = freshOutputDirectory ? resolve(freshOutputDirectory) : directory;
if (freshOutputDirectory) await mkdir(destination);
const project = join(destination, "production-axis-supplement.3mf");
const evidencePath = join(destination, "production-axis-supplement.json");
if (await Bun.file(project).exists() || await Bun.file(evidencePath).exists()) throw new Error("Choose a fresh supplement output path; existing artifacts are preserved");
const evidence: ProductionEvidence = await Bun.file(`${directory}/production-coupons.json`).json();
const failed: { failures: CoverageFailure[] } = await Bun.file(`${directory}/production-coupons-toolpaths.json`).json();
const hash = async (path: string) => createHash("sha256").update(await Bun.file(path).bytes()).digest("hex");
const selected = new Map<string, StoredSample>();
if (!Array.isArray(failed.failures) || !Array.isArray(evidence.samples) || !Array.isArray(evidence.layouts)) throw new Error("Malformed production evidence/coverage report");
for (const failure of failed.failures) {
  if (!failure.missingOrientation || JSON.stringify(failure.present) !== "[true]") throw new Error("Supplement only addresses the retained missing-X coverage failures");
  const [source, fit, label, point]: [string, number, string, number[]] = JSON.parse(failure.missingOrientation);
  if (typeof source !== "string" || !Number.isFinite(fit) || typeof label !== "string" || !Array.isArray(point)
    || point.length !== 3 || !point.every(Number.isFinite)) throw new Error(`Malformed missing-axis point ${failure.missingOrientation}`);
  const sample = evidence.samples.find((sample) => sample.source === source && sample.fit === fit && !sample.turned
    && sample.probes.some((probe) => probe.label === label && JSON.stringify(probe.point) === JSON.stringify(point)));
  if (!sample) throw new Error(`Missing original unchanged source/probe ${failure.missingOrientation}`);
  selected.set(sample.name, sample);
}
if (!selected.size) throw new Error("No missing-X orientation cases; no supplementary job is required");
const profile = unzipSync(await Bun.file(evidence.project).bytes())["Metadata/project_settings.config"];
const bed = bedFromConfig(profile), keepOut = keepOutFromConfig(profile);
const samples = geo.arena(() => {
  const samples: (StoredSample & { mesh: import("./src/export").MeshData })[] = [];
  for (const [index, original] of [...selected.values()].entries()) {
    const layout = evidence.layouts.find((layout) => layout.request.shared.fit === original.fit);
    if (!layout) throw new Error(`Missing production layout for fit ${original.fit}`);
    const descriptor = mixedPartManifest(layout).find(descriptor => JSON.stringify(descriptor.source) === original.source);
    if (!descriptor) throw new Error("Original production source is no longer in its manifest");
    const part = buildMixedGeometry(geo, layout).find(part => part.name === descriptor.name);
    if (!part) throw new Error(`Missing production mesh ${descriptor.name}`);
    const mesh = part.mesh;
    const minimum = [0, 1].map(axis => Math.min(...original.probes.map((probe) => probe.point[axis])) - 9);
    const maximum = [0, 1].map(axis => Math.max(...original.probes.map((probe) => probe.point[axis])) + 9);
    const clipped = geo.isect(mesh, geo.box(maximum[0] - minimum[0], maximum[1] - minimum[1], 1000,
      (minimum[0] + maximum[0]) / 2, (minimum[1] + maximum[1]) / 2, 0));
    if (clipped.status() !== "NoError" || clipped.decompose().length !== 1 || overhangArea(clipped) > 1e-6) throw new Error("Invalid actual source window");
    for (const probe of original.probes) if (geo.isect(clipped, geo.box(.02, .02, .02, ...probe.point as [number, number, number])).volume() < .0000079)
      throw new Error("Original probe outside unchanged source material");
    const name = `production-X-axis-supplement-${index}`;
    const converted = meshDataOf(name, clipped.getMesh());
    inspectMesh(converted, true);
    samples.push({ ...original, name, turned: false, mesh: converted, originalCouponName: original.name, qty: 1 });
  }
  return samples;
});
const plan = packPlan(samples.map(sample => ({ mesh: sample.mesh, qty: 1 })), bed, 3, 6, keepOut);
if (plan.placements.some(placement => placement.rotation90)) throw new Error("Supplement packer changed the required actual X orientation");
await Bun.write(project, threeMf(plan, bed, { profile }));
const sourceSha256 = { ...evidence.sourceSha256, ["qualify-shared-wall-axis-supplement.ts"]: await hash("qualify-shared-wall-axis-supplement.ts") };
for (const [path, expected] of Object.entries(sourceSha256)) if (await hash(path) !== expected) throw new Error(`Source changed ${path}`);
await Bun.write(evidencePath, JSON.stringify({ project, projectSha256: await hash(project), sourceSha256,
  placements: plan.placements, samples: samples.map(({ mesh, ...sample }) => sample), requiredFeatures: [],
  purpose: "Actual production missing-X-axis supplement; combine with retained original both-axis coupon matrix; original points/geometry/profile unchanged",
  resolvesFailedCoverageReport: `${directory}/production-coupons-toolpaths.json`, resolvedMissingOrientationKeys: failed.failures }, null, 2));
console.log(JSON.stringify({ copies: samples.length, plates: 1 + Math.max(...plan.placements.map(placement => placement.plate)),
  probes: samples.reduce((sum, sample) => sum + sample.probes.length, 0) }));
