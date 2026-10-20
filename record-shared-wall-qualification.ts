import { createHash } from "node:crypto";
import { basename, dirname, join, resolve } from "node:path";
// Strictly aggregate the original coupon matrix and its actual missing-axis supplement.
// bun record-shared-wall-qualification.ts <evidence-directory> [log-paths.json] [fresh-report.json]
import type { MixedPartSource, MixedPartDescriptor } from "./src/assembly";
import type { PackedPlacement } from "./src/export";
interface StoredProbe { label: string; point: number[]; featureFrame?: { offsetX: number; heightAboveWall: number; materialHeight: number } }
interface StoredSample { name: string; source: string; productionSource: MixedPartSource; fit: number; turned: boolean; qty: number; probes: StoredProbe[] }
interface ProductionEvidence {
  sourceSha256: Record<string, string>; samples: StoredSample[]; productionManifest: MixedPartDescriptor[][];
  placements: PackedPlacement[]; requiredFeatures: string[];
}
interface Measurement { part: string; source: string; fit: number; orientation90: boolean; label: string; localPoint: number[]; nearestCenterline: number | null }
interface CoverageFailure { missingOrientation?: string; present?: boolean[] }
interface SliceReport {
  sliced: string; failures: CoverageFailure[]; measurements: Measurement[]; projectSha256: string; slicer: string;
  artifactSha256: Record<string, string>; serializedInspection: { copies: number; plates: number };
  plateReports: { plate: number; time: string; grams: number }[]; couponPointsWithBothOrientations: number;
}
function distanceOf(measurement: Measurement): number {
  if (measurement.nearestCenterline === null || !Number.isFinite(measurement.nearestCenterline))
    throw new Error(`No finite deposited-line distance for ${measurement.part}/${measurement.label}`);
  return measurement.nearestCenterline;
}
const [inputDirectory, logManifest, freshReport] = Bun.argv.slice(2);
if (!inputDirectory) throw new Error("Usage: bun record-shared-wall-qualification.ts <evidence-directory> [log-paths.json] [fresh-report.json]");
const directory = resolve(inputDirectory);
const outputPath = freshReport ? resolve(freshReport) : join(directory, "verification.json");
if (await Bun.file(outputPath).exists()) throw new Error(`Refusing overwrite ${outputPath}`);
const hash = async (path: string) => createHash("sha256").update(await Bun.file(path).bytes()).digest("hex");
const couponEvidence: ProductionEvidence = await Bun.file(`${directory}/production-coupons.json`).json();
for (const [path, expected] of Object.entries(couponEvidence.sourceSha256)) {
  if (await hash(path) !== expected || await hash(`${directory}/source/${path}`) !== expected)
    throw new Error(`Current/archived source differs from frozen generation: ${path}`);
}
const jobs = [];
for (const name of ["production-coupons", "production-axis-supplement", "production-pair-240", "production-cascade-triple-640"]) {
  const reportPath = `${directory}/${name}-toolpaths.json`;
  const report: SliceReport = await Bun.file(reportPath).json();
  const evidence: ProductionEvidence = await Bun.file(`${directory}/${name}.json`).json();
  if (report.measurements.some((measurement) => distanceOf(measurement) > .27))
    throw new Error(`${name}: failed deposition probes`);
  if (report.failures.length && (name !== "production-coupons" || report.failures.some((failure) => !failure.missingOrientation)))
    throw new Error(`${name}: unresolved qualification failures`);
  const result = await Bun.file(`${report.sliced}/result.json`).json(), execution = await Bun.file(`${report.sliced}/execution.json`).json();
  const logs = await Bun.file(`${report.sliced}/stdout.log`).text() + "\n" + await Bun.file(`${report.sliced}/stderr.log`).text();
  const diagnostics = logs.split(/\r?\n/).filter(line => /\[(?:error|fatal)\]|\bZFiller:/i.test(line));
  if (result.return_code !== 0 || execution.exitCode !== 0 || diagnostics.length) throw new Error(`${name}: slice failed`);
  const sourceCounts = evidence.samples.map((sample) => {
    if (JSON.stringify(JSON.parse(sample.source)) !== JSON.stringify(sample.productionSource)) throw new Error(`${name}: source identity mismatch ${sample.name}`);
    const actual = evidence.placements.filter((placement) => placement.part === sample.name).length;
    if (actual !== sample.qty) throw new Error(`${name}: quantity mismatch ${sample.name}`);
    return { name: sample.name, source: sample.productionSource, expectedQuantity: sample.qty, serializedQuantity: actual };
  });
  if (name !== "production-coupons" && name !== "production-axis-supplement") {
    const manifest = evidence.productionManifest[0];
    if (manifest.length !== evidence.samples.length || manifest.reduce((sum: number, part) => sum + part.qty, 0) !== evidence.placements.length)
      throw new Error(`${name}: manifest totals differ`);
    for (const part of manifest) if (!sourceCounts.some((sample) => sample.name === part.name && sample.expectedQuantity === part.qty
      && JSON.stringify(sample.source) === JSON.stringify(part.source))) throw new Error(`${name}: missing manifest source ${part.name}`);
  }
  for (const plate of report.plateReports) {
    const lines = (await Bun.file(`${report.sliced}/plate_${plate.plate}.gcode`).text()).split(/\r?\n/);
    for (const setting of ["initial_layer_line_width = 0.5", "outer_wall_line_width = 0.5", "inner_wall_line_width = 0.5",
      "sparse_infill_line_width = 0.5", "internal_solid_infill_line_width = 0.5", "elefant_foot_compensation = 0.15"])
      if (!lines.includes(`; ${setting}`)) throw new Error(`${name}, plate ${plate.plate}: missing ${setting}`);
  }
  const featureCounts = Object.fromEntries([...new Set(report.measurements.map((measurement) => measurement.label))]
    .map(label => [label, report.measurements.filter((measurement) => measurement.label === label).length]));
  for (const feature of evidence.requiredFeatures) if (!featureCounts[feature]) throw new Error(`${name}: absent critical feature ${feature}`);
  jobs.push({ name, report: reportPath, reportSha256: await hash(reportPath), projectSha256: report.projectSha256,
    sliced: report.sliced, slicer: report.slicer, processCode: execution.exitCode, resultCode: result.return_code, internalDiagnostics: diagnostics,
    copies: report.serializedInspection.copies, plates: report.serializedInspection.plates, sourceCount: sourceCounts.length, sourceCounts,
    probes: report.measurements.length, failedProbes: 0, maximumNearestCenterline: Math.max(...report.measurements.map((measurement) => distanceOf(measurement))),
    grams: report.plateReports.reduce((sum: number, plate) => sum + plate.grams, 0), featureCounts,
    couponPointsWithBothOrientations: report.couponPointsWithBothOrientations,
    retainedInitialCoverageFailures: report.failures });
}
const coupons: SliceReport = await Bun.file(`${directory}/production-coupons-toolpaths.json`).json();
const supplement: SliceReport = await Bun.file(`${directory}/production-axis-supplement-toolpaths.json`).json();
const supplementEvidence: ProductionEvidence = await Bun.file(`${directory}/production-axis-supplement.json`).json();
const combinedMeasurements = [...coupons.measurements, ...supplement.measurements];
const combinedSamples = [...couponEvidence.samples, ...supplementEvidence.samples];
const orientationCoverage = new Map<string, Set<boolean>>();
for (const measurement of combinedMeasurements) {
  const sample = combinedSamples.find((sample) => sample.name === measurement.part);
  if (!sample) throw new Error("Measured source absent from retained coupon evidence");
  const point = sample.turned ? [measurement.localPoint[1], -measurement.localPoint[0], measurement.localPoint[2]] : measurement.localPoint;
  const key = JSON.stringify([sample.source, sample.fit, measurement.label, point]);
  const orientations = orientationCoverage.get(key) ?? new Set<boolean>();
  orientations.add(measurement.orientation90);
  orientationCoverage.set(key, orientations);
}
for (const [key, orientations] of orientationCoverage) if (orientations.size !== 2) throw new Error(`Actual combined axis coverage still missing: ${key}`);
const resolvedOrientationFailures = coupons.failures.map((failure) => {
  if (typeof failure.missingOrientation !== "string" || orientationCoverage.get(failure.missingOrientation)?.size !== 2)
    throw new Error("Original missing-axis failure is unresolved");
  return { ...failure, resolvedBy: `${directory}/production-axis-supplement-toolpaths.json`, actualAxesNowPresent: [false, true] };
});
for (const feature of couponEvidence.requiredFeatures) for (const fit of [-.2, 0, .3]) for (const orientation of [false, true]) {
  const matches = combinedMeasurements.filter((measurement) => measurement.label === feature && measurement.fit === fit && measurement.orientation90 === orientation);
  if (!matches.length) throw new Error(`Missing feature fit/orientation: ${feature}/${fit}/${orientation}`);
  if (feature.startsWith("split end-wall")) for (const height of [.1, 5.7])
    if (!matches.some((measurement) => measurement.localPoint[2] === height)) throw new Error(`Missing end-post material layer ${height}`);
}
const historicalFixturePath = "prototypes/fixtures/shared-wall-original-hook-failures.json";
const previous: { schemaVersion: number; sourceReportSha256: string; failures: Measurement[] } = await Bun.file(historicalFixturePath).json();
if (previous.schemaVersion !== 1 || previous.failures.length !== 16 || !/^[a-f0-9]{64}$/.test(previous.sourceReportSha256))
  throw new Error("Malformed immutable historical probe fixture");
const originalProbeMappings = previous.failures.map((prior) => {
  const unturned = prior.orientation90 ? [prior.localPoint[1], -prior.localPoint[0], prior.localPoint[2]] : prior.localPoint;
  const oldPin = [-65, 65].find(position => Math.abs(unturned[0] + position) < 12);
  if (oldPin === undefined) throw new Error("Unrecognized original failed pin coordinate");
  const offsetX = unturned[0] + oldPin, heightAboveWall = unturned[1] - 96, materialHeight = unturned[2];
  const matches = combinedMeasurements.filter((measurement) => {
    if (measurement.fit !== prior.fit || measurement.orientation90 !== prior.orientation90 || measurement.label !== prior.label) return false;
    const sample = combinedSamples.find((sample) => sample.name === measurement.part);
    if (sample?.productionSource.kind !== "shared-divider") return false;
    const probe = sample.probes.find((probe) => probe.label === measurement.label && JSON.stringify(probe.point) === JSON.stringify(measurement.localPoint));
    const frame = probe?.featureFrame;
    return frame && Math.abs(frame.offsetX - offsetX) < 1e-8 && Math.abs(frame.heightAboveWall - heightAboveWall) < 1e-8
      && Math.abs(frame.materialHeight - materialHeight) < 1e-8;
  });
  if (!matches.length || matches.some((measurement) => distanceOf(measurement) > .27)) throw new Error("Original failed feature-relative point is not restored");
  return { originalLocalPoint: prior.localPoint, oldPinPosition: oldPin, fit: prior.fit, orientation90: prior.orientation90,
    exactFeatureFrame: { offsetX, heightAboveWall, materialHeight }, before: prior.nearestCenterline,
    productionMatches: matches.map((measurement) => ({ part: measurement.part, localPoint: measurement.localPoint, nearestCenterline: measurement.nearestCenterline })) };
});
const logPaths: Record<string, string> = logManifest ? await Bun.file(logManifest).json() : {
  generation: `${directory}-generation.log`,
  couponSlice: `${directory}/production-coupons-slice.log`, pairSlice: `${directory}/production-pair-240-slice.log`,
  tripleSlice: `${directory}/production-cascade-triple-640-slice.log`,
  couponCheck: `${directory}/production-coupons-check.log`, pairCheck: `${directory}/production-pair-240-check.log`,
  tripleCheck: `${directory}/production-cascade-triple-640-check.log`,
  supplementGeneration: `${directory}/axis-supplement-generation.log`, supplementSlice: `${directory}/production-axis-supplement-slice.log`,
  supplementCheck: `${directory}/production-axis-supplement-check.log`,
};
async function retain(path: string, destination: string) {
  if (await Bun.file(destination).exists()) {
    if (await hash(path) !== await hash(destination)) throw new Error(`Refusing to overwrite different retained evidence ${destination}`);
    return;
  }
  await Bun.write(destination, await Bun.file(path).bytes());
}
for (const [name, path] of Object.entries(logPaths)) await retain(path, `${directory}/${name}.log`);

interface VendorPreset { name: string; sub_path: string }
interface VendorCatalogue { version: string; machine_list: VendorPreset[]; process_list: VendorPreset[]; filament_list: VendorPreset[] }
const sliceInput: { app: string; presets: string } = await Bun.file(`${jobs[0].sliced}/input.json`).json();
const command: string[] = await Bun.file(`${jobs[0].sliced}/command.json`).json();
if (!command.length || typeof command[0] !== "string") throw new Error("Missing exact slicer binary command");
for (const job of jobs) {
  const actual: string[] = await Bun.file(`${job.sliced}/command.json`).json();
  if (actual[0] !== command[0]) throw new Error("Qualification jobs used different slicer binaries");
}
const binaryPath = command[0], bundle = dirname(dirname(binaryPath)), informationPath = join(bundle, "Info.plist");
const versionCommand = Bun.spawnSync(["/usr/bin/plutil", "-extract", "CFBundleShortVersionString", "raw", informationPath]);
if (versionCommand.exitCode !== 0) throw new Error(`Cannot read exact slicer version: ${new TextDecoder().decode(versionCommand.stderr)}`);
const binaryVersion = new TextDecoder().decode(versionCommand.stdout).trim();
if (jobs.some(job => job.slicer !== binaryVersion)) throw new Error("Installed binary version differs from actual emitted G-code");
const vendorPath = `${sliceInput.presets}.json`, vendor: VendorCatalogue = await Bun.file(vendorPath).json();
await retain(informationPath, join(directory, "consumer", "Info.plist"));
await retain(vendorPath, join(directory, "consumer", "BBL.json"));
const presetSources: { kind: string; name: string; path: string; version: string | null; inherits: string | null; sha256: string }[] = [];
const visitedPresets = new Set<string>();
async function retainPreset(kind: "machine" | "process" | "filament", name: string): Promise<void> {
  const identity = `${kind}/${name}`;
  if (visitedPresets.has(identity)) return;
  visitedPresets.add(identity);
  const entry = vendor[`${kind}_list`].find(entry => entry.name === name);
  if (!entry) throw new Error(`Installed vendor manifest does not list ${identity}`);
  const path = resolve(sliceInput.presets, entry.sub_path);
  if (!path.startsWith(`${resolve(sliceInput.presets)}/`)) throw new Error(`Preset path escapes its catalogue: ${entry.sub_path}`);
  const settings: { name: string; inherits?: string; version?: string } = await Bun.file(path).json();
  if (settings.name !== name) throw new Error(`Preset identity mismatch ${path}`);
  await retain(path, join(directory, "consumer", "presets", entry.sub_path));
  presetSources.push({ kind, name, path, version: settings.version ?? null, inherits: settings.inherits ?? null, sha256: await hash(path) });
  if (settings.inherits) await retainPreset(kind, settings.inherits);
}
for (const [kind, filename] of [["machine", "machine.json"], ["process", "process.json"], ["filament", "filament-1.json"]] as const) {
  const settings: { name: string } = await Bun.file(`${jobs[0].sliced}/${filename}`).json();
  await retainPreset(kind, settings.name);
}
const consumer = { binaryPath, binaryVersion, binarySha256: await hash(binaryPath), binaryHashCapturedAfterSlicing: true,
  informationSha256: await hash(informationPath), presetRoot: sliceInput.presets, installedVendorVersion: vendor.version,
  installedVendorSha256: await hash(vendorPath), generatedCatalogueVersion: (await Bun.file("profiles/index.json").json()).version,
  generatedCatalogueSha256: await hash("profiles/index.json"), presetSources,
  flattenedPresetHashes: await Promise.all(jobs.map(async job => ({ job: job.name,
    hashes: Object.fromEntries(await Promise.all(["machine.json", "process.json", "filament-1.json"].map(async name => [name, await hash(`${job.sliced}/${name}`)]))) }))) };
const maintenanceTools = ["qualify-shared-wall-axis-supplement.ts", "record-shared-wall-qualification.ts", historicalFixturePath];
for (const path of maintenanceTools) await retain(path, join(directory, "maintenance-tools", await hash(path), basename(path)));
const record = { state: "Actual production manufacturing/toolpath qualification passed; physical fit/load unqualified",
  profile: "P2S0.4 /0.20mm Standard /PETGTranslucent /SmoothPEI60C /nozzle270C; all relevant widths0.5 /stock elephantfoot0.15",
  threshold: .27, sourceSha256: couponEvidence.sourceSha256, additionalSourceSha256: Object.fromEntries(Object.entries(supplementEvidence.sourceSha256).filter(([path]) => !Object.hasOwn(couponEvidence.sourceSha256, path))), sourceArchive: `${directory}/source`, jobs, consumer,
  maintenanceToolSha256: Object.fromEntries(await Promise.all(maintenanceTools.map(async path => [path, await hash(path)]))),
  totalPlates: jobs.reduce((sum, job) => sum + job.plates, 0), totalProbes: jobs.reduce((sum, job) => sum + job.probes, 0), failedProbes: 0,
  originalProbeMappingMethod: "Identical pin-relative half-hook offset, height above its wall, material layer and packed axis; only translation follows explicit production pin schedules and tier heights. Absolute prototype pin locations are not assumed in production.",
  originalProbeMappings, resolvedOrientationFailures, actualBothAxisPointKeys: orientationCoverage.size,
  originalProbeFixture: { path: historicalFixturePath, sha256: await hash(historicalFixturePath), sourceReportSha256: previous.sourceReportSha256 },
  preservedPrototypeV1: ".slice/shared-wall-mechanicalgate-20261017/verification.json",
  preservedPrototypeV2: ".slice/shared-wall-mechanicalgate-v2-20261017/verification.json", logPaths,
  physical: "No printer operated; no hand fit, insertion force, creep or loaded strength result. Centreline coverage is approximate, not complete bead reconstruction." };
await Bun.write(outputPath, JSON.stringify(record, null, 2));
console.log(JSON.stringify({ path: outputPath, plates: record.totalPlates, probes: record.totalProbes, restoredReferencePoints: originalProbeMappings.length,
  jobs: jobs.map(({ sourceCounts, ...job }) => job) }, null, 2));
