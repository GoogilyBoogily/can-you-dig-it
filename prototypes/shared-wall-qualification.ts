// Frozen mechanical prototype qualification. No application generator uses this script.
// bun prototypes/shared-wall-qualification.ts generate <fresh-directory>
// bun prototypes/shared-wall-qualification.ts check <evidence.json> <sliced-directory> <fresh-report.json>
// check-reported uses exact browser stock settings; retains a failed diagnostic report and exits nonzero on slicer errors.
import { mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import type { Manifold } from "manifold-3d";
import { unzipSync, strFromU8 } from "fflate";
import { sharedWallCrestPrototype as sharedWallPrototype, SHARED_CREST_MECHANICS as SHARED_MECHANICS, type PrototypePart } from "./shared-wall-mechanics-v2";
import { parseDepositedSegments, depositionAtMaterialHeight, distanceToSegment } from "./toolpath-deposition";
import { geo, overhangArea } from "../test/geo";
import { K } from "../src/model";
import { laneOf } from "../src/geometry";
import { clearanceOf, coverThicknessOf, pinSnap } from "../src/features/joints";
import { meshDataOf, inspectMesh, packPlan, threeMf, type PackedPlacement, type MeshData } from "../src/export";
import { composeProfile, defaultPicks, filamentsFor, keepOutFromConfig, bedFromConfig, type ProfileIndex } from "../src/profiles";

interface Probe { label: string; point: number[] }
interface Sample { name: string; source: string; fit: number; turned: boolean; mesh: MeshData; probes: Probe[] }
interface Evidence {
  project: string;
  projectSha256: string;
  sourceSha256: Record<string, string>;
  placements: PackedPlacement[];
  samples: Omit<Sample, "mesh">[];
  purpose: string;
  requiredFeatures?: string[];
  browserProject?: string;
  browserProjectSha256?: string;
}

/** Independent read-back of serialized coordinates, not supplied mesh bounding boxes. */
async function inspectProject(evidence: Evidence) {
  const archive = unzipSync(await Bun.file(evidence.project).bytes());
  const profile = archive["Metadata/project_settings.config"];
  const bed = bedFromConfig(profile), keepOut = keepOutFromConfig(profile);
  const metadata = strFromU8(archive["Metadata/model_settings.config"]);
  const plates = [...metadata.matchAll(/<plate>([\s\S]*?)<\/plate>/g)];
  const objectPlates = new Map<number, number>();
  for (const plate of plates) {
    const index = Number(plate[1].match(/key="plater_id" value="(\d+)"/)?.[1]) - 1;
    if (!Number.isSafeInteger(index) || index < 0) throw new Error("Unrecognized serialized plate index");
    for (const object of plate[1].matchAll(/key="object_id" value="(\d+)"/g)) objectPlates.set(Number(object[1]), index);
  }
  const columns = Math.ceil(Math.sqrt(plates.length));
  const objects = [...strFromU8(archive["3D/3dmodel.model"]).matchAll(/<object id="(\d+)"[^>]*name="([^"]*)"[^>]*>([\s\S]*?)<\/object>/g)].map(object => {
    const plate = objectPlates.get(Number(object[1]));
    if (plate === undefined) throw new Error(`Unassigned serialized object ${object[2]}`);
    const origin = [(plate % columns) * bed[0] * 1.2, -Math.floor(plate / columns) * bed[1] * 1.2];
    const points = [...object[3].matchAll(/<vertex x="([^"]+)" y="([^"]+)" z="([^"]+)"\/>/g)]
      .map(point => [Number(point[1]) - origin[0], Number(point[2]) - origin[1], Number(point[3])]);
    const minimum = [Infinity, Infinity, Infinity], maximum = [-Infinity, -Infinity, -Infinity];
    for (const point of points) for (let axis = 0; axis < 3; axis++) {
      if (!Number.isFinite(point[axis]) || point[axis] < (axis === 2 ? 0 : 3) - 1e-5 || point[axis] > bed[axis] - (axis === 2 ? 0 : 3) + 1e-5)
        throw new Error(`${object[2]}: serialized coordinate outside bed/margin`);
      minimum[axis] = Math.min(minimum[axis], point[axis]);
      maximum[axis] = Math.max(maximum[axis], point[axis]);
    }
    let volume = 0;
    for (const triangle of object[3].matchAll(/<triangle v1="(\d+)" v2="(\d+)" v3="(\d+)"\/>/g)) {
      const vertices = triangle.slice(1).map(index => points[Number(index)]);
      if (vertices.some(vertex => !vertex)) throw new Error(`${object[2]}: invalid serialized triangle`);
      const [first, second, third] = vertices.map(vertex => vertex.map((value, axis) => value - points[0][axis]));
      volume += (first[0] * (second[1] * third[2] - second[2] * third[1])
        + first[1] * (second[2] * third[0] - second[0] * third[2])
        + first[2] * (second[0] * third[1] - second[1] * third[0])) / 6;
    }
    if (!(volume > 0)) throw new Error(`${object[2]}: nonpositive serialized volume`);
    for (const rectangle of keepOut) if (!(maximum[0] <= rectangle[0] - 3 + 1e-5 || minimum[0] >= rectangle[2] + 3 - 1e-5
      || maximum[1] <= rectangle[1] - 3 + 1e-5 || minimum[1] >= rectangle[3] + 3 - 1e-5))
      throw new Error(`${object[2]}: serialized keep-out violation`);
    return { name: object[2], plate, minimum, maximum, volume };
  });
  if (objects.length !== evidence.placements.length || plates.length !== 1 + Math.max(...evidence.placements.map(item => item.plate)))
    throw new Error("Serialized plate or object count differs from manifest");
  for (const placement of evidence.placements) if (!objects.some(object => object.name === placement.name && object.plate === placement.plate))
    throw new Error(`Missing serialized manifest copy ${placement.name}`);
  for (let first = 0; first < objects.length; first++) for (let second = first + 1; second < objects.length; second++) {
    const left = objects[first], right = objects[second];
    if (left.plate !== right.plate) continue;
    const gap = Math.max(...[0, 1].map(axis => Math.max(left.minimum[axis] - right.maximum[axis], right.minimum[axis] - left.maximum[axis])));
    if (gap < 6 - 1e-5) throw new Error(`${left.name}/${right.name}: serialized separation below six millimetres`);
  }
  return { copies: objects.length, plates: plates.length, objects };
}
const hash = async (path: string) => createHash("sha256").update(await Bun.file(path).bytes()).digest("hex");
const CREST_HEIGHT = 0.6;
const REQUIRED_FEATURES = ["follower closed far-face collar", "follower full-depth bearing root", "follower closed-slot shoulder",
  "primary ear outer bearing rail", "primary closed-slot shoulder", "primary rail behind follower collar relief",
  "divider lower snap prong/root", "divider upper pin root", "divider upper pin hook", "shared pin finite crest centre",
  "blind socket closed upper roof", "cover bearing and finger root", "cover closed free-edge collar", "blind socket hook chamber side root",
  "split end-wall post retained half ligament", "split end-wall post upper bearing", "split end-wall post body root"];
const [operation, first, sliced, reportPath] = Bun.argv.slice(2);
const reported = operation === "check-reported";
if (!first || !["generate", "check", "check-reported"].includes(operation)) throw new Error("Expected generate <fresh-directory> or check <evidence.json> <slice-directory> <fresh-report.json>");

async function sources() {
  const paths = ["profiles/index.json", "bun.lock", "prototypes/shared-wall-mechanics.ts", "prototypes/shared-wall-mechanics-v2.ts",
    "prototypes/shared-wall-crest.ts", "prototypes/shared-wall-qualification.ts",
    "prototypes/toolpath-deposition.ts", "test/geo.ts", "test/shared-wall-mechanics.test.ts", "test/toolpath-deposition.test.ts",
    "test/toolpath-qualification.test.ts", "test/shared-wall-mechanics-v2.test.ts", "test/shared-wall-crest.test.ts",
    "prototypes/shared-wall-mechanics.md", "check-toolpaths.ts", ".claude/skills/slicing-with-bambu-cli/slice-3mf.ts"];
  for await (const path of new Bun.Glob("src/**/*.ts").scan(".")) paths.push(path);
  return Object.fromEntries(await Promise.all(paths.sort().map(async path => [path, await hash(path)])));
}

function validate(name: string, mesh: Manifold) {
  if (mesh.status() !== "NoError" || mesh.decompose().length !== 1 || overhangArea(mesh) > 1e-6)
    throw new Error(`${name}: invalid, disconnected or unsupported geometry`);
  if (Math.abs(mesh.boundingBox().min[2]) > 1e-6) throw new Error(`${name}: printable source is above/below the bed`);
  const converted = meshDataOf(name, mesh.getMesh());
  const degenerateFacets = inspectMesh(converted, true);
  if (degenerateFacets) console.info(`${name}: retained ${degenerateFacets} zero-area kernel facets`);
  return converted;
}

function validateProbeMaterial(name: string, mesh: Manifold, probes: Probe[]) {
  for (const probe of probes) {
    const [x, y, z] = probe.point;
    const sample = geo.box(0.02, 0.02, 0.02, x, y, z);
    if (geo.isect(mesh, sample).volume() < 0.0000079)
      throw new Error(`${name}: ${probe.label} at ${probe.point} is outside its source material`);
  }
}

function probesFor(part: PrototypePart, result: ReturnType<typeof sharedWallPrototype>): Probe[] {
  const probes: Probe[] = [];
  const add = (label: string, x: number, y: number, z: number) => probes.push({ label, point: [x, y, z] });
  const heights = [0.1, K.deckLo - 0.3];
  if (part.name.endsWith("-deck")) {
    const stack = part.stack!, lane = result.lanes[stack], clearance = clearanceOf(lane.options);
    if (stack > 0) for (const position of SHARED_MECHANICS.followerEars) for (const height of heights) {
      add("follower closed far-face collar", position, -lane.derived.py - 3 - clearance - K.ligMin / 2, height);
      add("follower full-depth bearing root", position, -lane.derived.py + 3.5, height);
      for (const side of [-1, 1]) add("follower closed-slot shoulder", position + side * 11, -lane.derived.py - 1.5, height);
    }
    if (stack < result.lanes.length - 1) {
      for (const position of SHARED_MECHANICS.primaryEars) for (const height of heights) {
        add("primary ear outer bearing rail", position, lane.derived.py + 1.5, height);
        for (const side of [-1, 1]) add("primary closed-slot shoulder", position + side * 11, lane.derived.py - 1.5, height);
      }
      for (const position of SHARED_MECHANICS.followerEars) for (const height of heights)
        add("primary rail behind follower collar relief", position, lane.derived.py - 3 - result.collar - 2 * clearance - 1 - K.ligMin / 2, height);
    }
  } else if (part.name.startsWith("boundary-")) {
    const lane = result.lanes[0], clearance = clearanceOf(lane.options), snap = pinSnap(clearance);
    for (const position of [...SHARED_MECHANICS.primaryEars, ...SHARED_MECHANICS.followerEars])
      for (const height of [0.1, K.tabT - 0.3]) for (const side of [-1, 1])
        add("divider lower snap prong/root", -position + side * (K.tabW / 2 - K.snapT / 2), K.deckLo + clearance + 0.4, height);
    for (const position of SHARED_MECHANICS.pins) for (const height of [0.1, K.tabT - 0.3]) for (const side of [-1, 1]) {
      add("divider upper pin root", -position + side * (K.tabW / 2 - K.snapT / 2), lane.derived.H - 0.4, height);
      // Preserve the v1 failed point exactly; the new plateau must restore it.
      add("divider upper pin hook", -position + side * (K.tabW / 2 + snap.hook / 2), lane.derived.H + snap.peak, height);
      add("shared pin finite crest centre", -position + side * (K.tabW / 2 + snap.hook / 2), lane.derived.H + snap.peak + CREST_HEIGHT / 2, height);
    }
  } else if (part.name.endsWith("-cover")) {
    const stack = part.stack!, lane = result.lanes[stack], clearance = clearanceOf(lane.options);
    const snap = pinSnap(clearance), thickness = coverThicknessOf(lane.options) + CREST_HEIGHT;
    const roofTop = snap.tip + CREST_HEIGHT + clearance + K.tabT / 2 + clearance;
    for (const side of [-1, 1]) {
      if (side === -1 ? stack === 0 : stack === result.lanes.length - 1) continue;
      const boundary = side * lane.derived.py;
      const pins = side === -1 ? SHARED_MECHANICS.followerCoverPins : SHARED_MECHANICS.primaryCoverPins;
      for (const position of pins) {
        add("blind socket closed upper roof", position, boundary - 1.5, roofTop + 0.3);
        for (const height of [0.1, thickness - 0.3]) {
          add("cover bearing and finger root", position, boundary + (side === -1 ? 3.5 : 1.5), height);
          add("cover closed free-edge collar", position, boundary + (side === -1 ? -3 - clearance - K.ligMin / 2 : 1.5), height);
        }
        for (const sign of [-1, 1]) add("blind socket hook chamber side root", position + sign * (K.tabW / 2 + clearance + snap.hook + 0.5), boundary - 1.5, 0.1);
      }
    }
  } else if (part.name.endsWith("-end")) {
    const stack = part.stack!, lane = result.lanes[stack], clearance = clearanceOf(lane.options);
    const role = laneOf(lane.options, lane.derived, "top");
    for (const side of [-1, 1]) {
      if (side === -1 ? stack === 0 : stack === result.lanes.length - 1) continue;
      const postCentre = side * (lane.derived.IW / 2 + (lane.options.wall / 2 - clearance) / 2);
      for (const height of [0.1, lane.options.wall - 0.3]) {
        add("split end-wall post retained half ligament", -(role.H - 4), postCentre, height);
        add("split end-wall post upper bearing", -(role.H - 0.5), postCentre, height);
        add("split end-wall post body root", -(role.lapZ + role.ewh) / 2, side * lane.derived.IW / 2, height);
      }
    }
  }
  return probes;
}

if (operation === "generate") {
  const directory = resolve(first);
  await mkdir(directory);
  const sourceSha256 = await sources();
  const catalogue: ProfileIndex = await Bun.file("profiles/index.json").json();
  const machine = "Bambu Lab P2S 0.4 nozzle";
  const filament = filamentsFor(catalogue, machine).find(item => item.label === "Bambu PETG Translucent");
  if (!filament) throw new Error("Missing P2S PETG Translucent profile");
  const picks = { ...defaultPicks(catalogue, machine), filament: filament.name, translucent: true };
  if (picks.process !== "0.20mm Standard @BBL P2S") throw new Error(`Unexpected process ${picks.process}`);
  const settings = JSON.parse(new TextDecoder().decode(composeProfile(catalogue, picks)));
  const profile = new TextEncoder().encode(JSON.stringify({ ...settings, curr_bed_type: "High Temp Plate" }));
  const bed = bedFromConfig(profile), keepOut = keepOutFromConfig(profile);
  async function write(name: string, samples: Sample[], purpose: string) {
    const plan = packPlan(samples.map(sample => ({ mesh: sample.mesh, qty: 1 })), bed, 3, 6, keepOut);
    const project = join(directory, `${name}.3mf`);
    await Bun.write(project, threeMf(plan, bed, { profile }));
    const evidence: Evidence = { project, projectSha256: await hash(project), sourceSha256, placements: plan.placements,
      samples: samples.map(({ mesh, ...sample }) => sample), purpose, requiredFeatures: REQUIRED_FEATURES };
    await Bun.write(join(directory, `${name}.json`), JSON.stringify(evidence, null, 2));
    console.log(`${name}: ${samples.length} parts, ${1 + Math.max(...plan.placements.map(item => item.plate))} plates`);
  }
  const couponSamples = geo.arena(() => {
    const samples: Sample[] = [];
    for (const fit of [-0.2, 0, 0.3]) {
      const result = sharedWallPrototype(geo, { fit, widths: [122.5, 134, 115], tiers: 2, slope: 3, minimal: true, covered: true, crestHeight: CREST_HEIGHT });
      // A middle stack includes both neighboring mechanisms; cut real printable parts.
      for (const source of ["stack-1-tier-0-deck", "boundary-0-tier-0", "stack-1-cover", "stack-1-tier-0-end"]) {
        const part = result.parts.find(part => part.name === source);
        if (!part) throw new Error(`Missing ${source}`);
        const groups = new Map<string, Probe[]>();
        for (const probe of probesFor(part, result)) {
          const key = `${Math.round(probe.point[0] / 20)}:${Math.round(probe.point[1] / 20)}`;
          groups.set(key, [...groups.get(key) ?? [], probe]);
        }
        for (const [group, probes] of groups) {
          const minimum = [0, 1].map(axis => Math.min(...probes.map(probe => probe.point[axis])) - 9);
          const maximum = [0, 1].map(axis => Math.max(...probes.map(probe => probe.point[axis])) + 9);
          const cut = geo.isect(part.printable, geo.box(maximum[0] - minimum[0], maximum[1] - minimum[1], 1000,
            (minimum[0] + maximum[0]) / 2, (minimum[1] + maximum[1]) / 2, 0));
          validateProbeMaterial(source, cut, probes);
          for (const turned of [false, true]) {
            const name = `fit-${fit}-${source}-${group}-${turned ? "y" : "x"}`;
            const mesh = turned ? cut.rotate([0, 0, 90]) : cut;
            const oriented = probes.map(probe => ({ ...probe, point: turned ? [-probe.point[1], probe.point[0], probe.point[2]] : probe.point }));
            samples.push({ name, source, fit, turned, mesh: validate(name, mesh), probes: oriented });
          }
        }
      }
    }
    return samples;
  });
  await write("shared-wall-coupons", couponSamples, "Actual clipped prototype junctions, both in-plane orientations, all three fits; open window edges do not establish whole-assembly retention");
  for (const widths of [[122.5, 134], [122.5, 134, 115]]) {
    const samples = geo.arena(() => {
      const result = sharedWallPrototype(geo, { fit: 0, widths, tiers: 2, slope: 3, minimal: true, covered: true, crestHeight: CREST_HEIGHT });
      return result.parts.map(part => {
        const probes = probesFor(part, result);
        validateProbeMaterial(part.name, part.printable, probes);
        return { name: part.name, source: part.name, fit: 0, turned: false,
          mesh: validate(part.name, part.printable), probes };
      });
    });
    await write(`shared-wall-${widths.length === 2 ? "pair" : "triple"}`, samples, "Complete covered unequal-width, two-tier mechanical prototype; all source parts and both boundaries retained");
  }
  for (const [path, expected] of Object.entries(sourceSha256)) if (await hash(path) !== expected) throw new Error(`Source changed during export: ${path}`);
} else {
  if (!sliced || !reportPath) throw new Error("check requires evidence, sliced directory and fresh report path");
  if (await Bun.file(reportPath).exists()) throw new Error(`Refusing to overwrite ${reportPath}`);
  const evidence: Evidence = await Bun.file(first).json();
  for (const [path, expected] of Object.entries(evidence.sourceSha256)) if (await hash(path) !== expected) throw new Error(`Source changed since export: ${path}`);
  if (await hash(evidence.project) !== evidence.projectSha256) throw new Error("Exported project hash changed");
  if (reported) {
    if (!evidence.browserProject || evidence.browserProjectSha256 !== evidence.projectSha256
      || await hash(evidence.browserProject) !== evidence.projectSha256)
      throw new Error("Reported qualification must retain the exact browser download");
    const profile = JSON.parse(strFromU8(unzipSync(await Bun.file(evidence.project).bytes())["Metadata/project_settings.config"]));
    if (profile.curr_bed_type !== "Textured PEI Plate" || profile.different_settings_to_system?.some((keys: string) => keys))
      throw new Error("Reported qualification requires the original stock/Textured PEI profile");
  }
  const serializedInspection = await inspectProject(evidence);
  const execution = await Bun.file(join(sliced, "execution.json")).json();
  const result = await Bun.file(join(sliced, "result.json")).json();
  const logs = await Bun.file(join(sliced, "stdout.log")).text() + "\n" + await Bun.file(join(sliced, "stderr.log")).text();
  const diagnostics = logs.split(/\r?\n/).filter(line => /\[(?:error|fatal)\]|\bZFiller:/i.test(line));
  if (!reported && (execution.exitCode !== 0 || result.return_code !== 0 || diagnostics.length))
    throw new Error("Slicer qualification failed; inspect retained execution/result/logs");
  const input = await Bun.file(join(sliced, "input.json")).json();
  if (input.sha256 !== evidence.projectSha256 || await hash(join(sliced, "input.3mf")) !== evidence.projectSha256) throw new Error("Slicer input does not match frozen export");
  const failures: unknown[] = [], measurements: unknown[] = [], artifactSha256: Record<string, string> = {};
  if (reported && (execution.exitCode !== 0 || result.return_code !== 0 || diagnostics.length))
    failures.push({ slicerQualificationFailed: true, execution, returnCode: result.return_code, diagnostics });
  const featuresMeasured = new Set<string>();
  for (const plate of new Set(evidence.placements.map(item => item.plate))) {
    const path = join(sliced, `plate_${plate + 1}.gcode`), source = await Bun.file(path).text(), lines = source.split(/\r?\n/);
    const criticalSettings = reported ? ["printer_settings_id = Bambu Lab P2S 0.4 nozzle", "print_settings_id = 0.20mm Standard @BBL P2S",
      'filament_settings_id = "Bambu PETG Translucent @BBL P2S 0.4 nozzle"', "curr_bed_type = Textured PEI Plate",
      "initial_layer_print_height = 0.2", "layer_height = 0.2", "line_width = 0.42", "initial_layer_line_width = 0.5",
      "outer_wall_line_width = 0.42", "inner_wall_line_width = 0.45", "internal_solid_infill_line_width = 0.42",
      "sparse_infill_line_width = 0.45", "top_surface_line_width = 0.42", "wall_loops = 2", "sparse_infill_density = 15%",
      "top_shell_layers = 5", "bottom_shell_layers = 3", "enable_support = 0", "nozzle_temperature = 245",
      "nozzle_temperature_initial_layer = 250"] : ["printer_settings_id = Bambu Lab P2S 0.4 nozzle", "print_settings_id = 0.20mm Standard @BBL P2S",
      "filament_settings_id = \"Bambu PETG Translucent @BBL P2S 0.4 nozzle\"", "curr_bed_type = High Temp Plate",
      "initial_layer_print_height = 0.2", "layer_height = 0.2", "line_width = 0.5", "wall_loops = 1",
      "sparse_infill_density = 100%", "enable_support = 0", "hot_plate_temp = 60", "hot_plate_temp_initial_layer = 60",
      "nozzle_temperature = 270", "nozzle_temperature_initial_layer = 270"];
    for (const setting of criticalSettings)
      if (!lines.includes(`; ${setting}`)) throw new Error(`Plate ${plate + 1}: missing ${setting}`);
    const segments = parseDepositedSegments(source, `plate ${plate + 1}`);
    const materialLayers = new Map<number, ReturnType<typeof depositionAtMaterialHeight>>();
    artifactSha256[path] = await hash(path);
    for (const placement of evidence.placements.filter(item => item.plate === plate)) {
      const sample = evidence.samples.find(sample => sample.name === placement.part);
      if (!sample) throw new Error(`Unknown source ${placement.part}`);
      for (const probe of sample.probes) {
        const point = [placement.rotation90 ? -probe.point[1] : probe.point[0], placement.rotation90 ? probe.point[0] : probe.point[1], probe.point[2]]
          .map((coordinate, axis) => coordinate + placement.translation[axis]);
        let layer = materialLayers.get(point[2]);
        if (!layer) {
          layer = depositionAtMaterialHeight(segments, point[2]);
          materialLayers.set(point[2], layer);
        }
        const nearest = layer.reduce((distance, segment) => Math.min(distance, distanceToSegment(point.slice(0, 2), segment)), Infinity);
        // This is a nominal centreline screen, not a deposited-width/strength
        // model. Stock uses narrower 0.42 mm nominal roads than the tuned coupon.
        const limit = reported && point[2] > .2 ? .42 / 2 + .02 : .27;
        const measurement = { ...(reported ? { centerlineLimit: limit } : {}), part: placement.part, source: sample.source, fit: sample.fit, orientation90: sample.turned !== placement.rotation90,
          label: probe.label, localPoint: probe.point, plate: plate + 1, printerPoint: point, nearestCenterline: Number.isFinite(nearest) ? nearest : null };
        measurements.push(measurement);
        featuresMeasured.add(probe.label);
        if (nearest > limit) failures.push(measurement);
      }
    }
  }
  for (const feature of evidence.requiredFeatures ?? []) if (!featuresMeasured.has(feature))
    failures.push({ missingCriticalFeature: feature });
  const orientationCoverage = new Map<string, Set<boolean>>();
  if (evidence.purpose.startsWith("Actual clipped")) {
    for (const placement of evidence.placements) {
      const sample = evidence.samples.find(sample => sample.name === placement.part)!;
      for (const probe of sample.probes) {
        const localPoint = sample.turned ? [probe.point[1], -probe.point[0], probe.point[2]] : probe.point;
        const key = JSON.stringify([sample.source, sample.fit, probe.label, localPoint]);
        const orientations = orientationCoverage.get(key) ?? new Set<boolean>();
        orientations.add(sample.turned !== placement.rotation90);
        orientationCoverage.set(key, orientations);
      }
    }
    for (const [key, orientations] of orientationCoverage) if (orientations.size !== 2)
      failures.push({ missingOrientation: key, present: [...orientations] });
  }
  const helperReportExists = await Bun.file(join(sliced, "report.json")).exists();
  if (reported && !helperReportExists) failures.push({ missingHelperReport: "The strict slicing helper stopped on its retained diagnostics before writing report.json" });
  for (const name of ["input.3mf", "input.json", "command.json", "execution.json", "result.json", ...(!reported || helperReportExists ? ["report.json"] : []), "stdout.log", "stderr.log", "machine.json", "process.json", "filament-1.json"])
    artifactSha256[join(sliced, name)] = await hash(join(sliced, name));
  await Bun.write(reportPath, JSON.stringify({ evidence: resolve(first), sliced: resolve(sliced), method: reported ? "Exact browser stock-profile diagnostic: positive extrusion in actual material layer; nominal 0.42mm roads screened at <=0.23mm, first-layer 0.5mm at <=0.27mm; offsets restored; slicer diagnostics always fail qualification; no physical/strength claim" : "Positive extrusion, actual deposited layer interval, linear/IJ arc centrelines <=0.27mm for nominal0.5mm bead; offsets restored; no physical/strength claim",
    slicer: (await Bun.file(join(sliced, "plate_1.gcode")).text()).match(/^; BambuStudio (.+)$/m)?.[1], sourceSha256: evidence.sourceSha256,
    projectSha256: evidence.projectSha256, artifactSha256, measurements, failures,
    couponPointsWithBothOrientations: orientationCoverage.size, serializedInspection,
    plateReports: reported && !helperReportExists ? result.sliced_plates : await Bun.file(join(sliced, "report.json")).json() }, null, 2));
  console.log(reported ? `${measurements.length} functional probes; ${failures.length} qualification failures; evidence ${reportPath}`
    : `${measurements.length} functional probes; ${failures.length} failed; evidence ${reportPath}`);
  if (failures.length) throw new Error(reported ? `Stock-profile qualification failed; inspect retained findings in ${reportPath}`
    : `Functional deposition failed at ${failures.length} probes; inspect ${reportPath}`);
}
