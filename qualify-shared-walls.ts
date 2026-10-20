// Production shared-wall qualification. Generation is deliberately explicit:
// bun qualify-shared-walls.ts inspect
// bun qualify-shared-walls.ts generate <fresh-directory>
// bun qualify-shared-walls.ts generate-reported <fresh-directory> <exact-browser-export.3mf>
// Slice each emitted project with the maintained slice-3mf.ts helper, then:
// bun prototypes/shared-wall-qualification.ts check <evidence.json> <slice-directory> <fresh-report.json>
import { unzipSync, strFromU8 } from "fflate";
import { mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import Module, { type Manifold } from "manifold-3d";
import { DEFAULTS, K, type MixedBuildRequest, type SharedWallTierSchedule } from "./src/model";
import { resolveMixedBuild, type MixedLayout } from "./src/solver";
import { mixedPartManifest, type MixedPartSource, type MixedPartDescriptor } from "./src/assembly";
import { buildMixedGeometry } from "./src/mixed-geometry";
import { laneOf } from "./src/geometry";
import { clearanceOf, pinSnap, wallSeamHeights, coverSeamPositions } from "./src/features/joints";
import { sharedWallCollarExtension, sharedWallCoverThickness, SHARED_WALL_PIN_CREST } from "./src/features/shared-wall";
import { meshDataOf, inspectMesh, packPlan, threeMf, type MeshData } from "./src/export";
import { composeProfile, defaultPicks, filamentsFor, bedFromConfig, keepOutFromConfig, type ProfileIndex } from "./src/profiles";
import { geo, overhangArea } from "./test/geo";

interface Probe { label: string; point: number[]; featureFrame?: { offsetX: number; heightAboveWall: number; materialHeight: number } }
interface Sample {
  name: string; source: string; productionSource: MixedPartSource; fit: number; turned: boolean;
  mesh: MeshData; qty: number; probes: Probe[];
}
const REQUIRED_FEATURES = ["follower closed far-face collar", "follower full-depth bearing root", "follower closed-slot shoulder",
  "primary ear outer bearing rail", "primary closed-slot shoulder", "primary rail behind follower collar relief",
  "divider lower snap prong/root", "divider upper pin root", "divider upper pin hook", "shared pin finite crest centre",
  "blind socket closed upper roof", "cover bearing and finger root", "cover closed free-edge collar", "blind socket hook chamber side root",
  "split end-wall post retained half ligament", "split end-wall post upper bearing", "split end-wall post body root", "shared deck plinth continuous root"];
const [operation, output, browserProject] = Bun.argv.slice(2);
const reported = operation === "generate-reported";
if (!["inspect", "generate", "generate-reported"].includes(operation) || operation !== "inspect" && !output || reported && !browserProject)
  throw new Error("Usage: bun qualify-shared-walls.ts inspect | generate <fresh-directory> | generate-reported <fresh-directory> <exact-browser-export.3mf>");

function requestFor(fit: number, depth: number, widths: number[], cascade: boolean, profile: Uint8Array): MixedBuildRequest {
  return { shared: { ...DEFAULTS, base: "flat", wall: 6, slope: reported ? 5 : 3, fit, cascade, cover: true, rearLoad: false,
    stackable: false, design: "minimal", ...(reported ? { hexAuto: false, hexR: 13 } : {}), bed: bedFromConfig(profile), bedKeepOut: keepOutFromConfig(profile) },
    shareCompatibleWalls: true, stacks: widths.map(canHeight => ({ canDiameter: 66, canHeight, depth, tiers: 2 })) };
}

function boundary(layout: MixedLayout, index: number) {
  const result = layout.boundaries?.[index];
  if (result?.kind !== "shared") throw new Error(`Requested shared boundary ${index} was retained: ${JSON.stringify(result)}`);
  return result;
}

function sectionIndex(source: MixedPartSource): number {
  if (source.kind === "shared-divider") return source.section ?? 0;
  if (source.kind === "stack") return source.source.section ?? (source.source.half === "rear" ? 1 : 0);
  return 0;
}

/** Use explicit source ownership and schedule frames. Printable section vertices
 * retain absolute local coordinates; filenames are only archive labels. */
function candidatesFor(source: MixedPartSource, layout: MixedLayout): Probe[] {
  const probes: Probe[] = [];
  const add = (label: string, x: number, y: number, z: number, featureFrame?: Probe["featureFrame"]) =>
    probes.push({ label, point: [x, y, z], ...(featureFrame ? { featureFrame } : {}) });
  if (source.kind === "shared-key" || source.kind === "stack" && source.source.kind === "key") {
    for (const [x, y] of [[3.5, -.6], [3.5, .6], [-5.5, 0], [5.5, 0]]) add("seam key first-layer rail/end bridge", x, y, .1);
    return probes;
  }
  if (source.kind === "shared-divider") {
    const plan = boundary(layout, source.boundaryIndex), stack = layout.stacks[plan.firstStackIndex];
    const schedule = plan.tiers[source.tierIndex], lane = laneOf(stack.options, stack.derived, schedule.laneRole);
    const clearance = clearanceOf(stack.options), snap = pinSnap(clearance);
    for (const position of [...schedule.primaryEars, ...schedule.followerEars]) for (const height of [.1, K.tabT - .3])
      for (const side of [-1, 1]) add("divider lower snap prong/root", -position + side * (K.tabW / 2 - K.snapT / 2), K.deckLo + clearance + .4, height);
    if (!schedule.terminal) for (const position of schedule.pinPositions) for (const height of [.1, K.tabT - .3]) for (const side of [-1, 1]) {
      add("divider upper pin root", -position + side * (K.tabW / 2 - K.snapT / 2), lane.H - .4, height);
      const offset = side * (K.tabW / 2 + snap.hook / 2);
      // This is exactly the v1 failed point in the pin's own frame. Only its host
      // position/height follows the production schedule; no probe moves into the crest.
      add("divider upper pin hook", -position + offset, lane.H + snap.peak, height,
        { offsetX: offset, heightAboveWall: snap.peak, materialHeight: height });
      add("shared pin finite crest centre", -position + offset, lane.H + snap.peak + SHARED_WALL_PIN_CREST / 2, height);
    }
    const index = sectionIndex(source), seams = stack.derived.seams;
    for (const seam of [index > 0 ? seams[index - 1] + 2 : undefined, index < seams.length ? seams[index] - 2 : undefined])
      if (seam !== undefined) for (const height of wallSeamHeights(lane.H)) for (const z of [.1, stack.options.wall - .3])
        add("shared divider seam frame", -seam, height, z);
    return probes;
  }
  if (source.kind !== "stack" || !source.sharedSides || source.sharedTierIndex === undefined) return probes;
  const stack = layout.stacks[source.stackIndex], { options, derived } = stack;
  const sign = options.cascade && source.sharedTierIndex % 2 ? -1 : 1;
  const clearance = clearanceOf(options), collar = sharedWallCollarExtension(options), snap = pinSnap(clearance);
  const contexts: { localSide: number; primary: boolean; schedule: SharedWallTierSchedule }[] = [];
  for (const [worldSide, index] of [[1, source.sharedSides.leftBoundaryIndex], [-1, source.sharedSides.rightBoundaryIndex]] as const)
    if (index !== undefined) contexts.push({ localSide: worldSide * sign, primary: worldSide === 1,
      schedule: boundary(layout, index).tiers[source.sharedTierIndex] });
  const place = (context: typeof contexts[number], label: string, worldX: number, canonicalY: number, z: number) =>
    add(label, sign * worldX, context.localSide * derived.py + sign * canonicalY, z);
  const role = contexts[0].schedule.laneRole, lane = laneOf(options, derived, role);
  for (const context of contexts) {
    if (source.source.kind === "lane" && source.source.plate === "deck") {
      const sites = context.primary ? context.schedule.primaryEars : context.schedule.followerEars;
      for (const position of sites) for (const z of [.1, K.deckLo - .3]) {
        if (context.primary) place(context, "primary ear outer bearing rail", position, options.wall / 2 - K.tabT / 2, z);
        else {
          place(context, "follower closed far-face collar", position, -options.wall / 2 - clearance - K.ligMin / 2, z);
          place(context, "follower full-depth bearing root", position, options.wall / 2 + .5, z);
        }
        for (const side of [-1, 1]) place(context, context.primary ? "primary closed-slot shoulder" : "follower closed-slot shoulder",
          position + side * (K.earW / 2 - 1), (K.tabT - options.wall) / 2, z);
        place(context, "shared deck plinth continuous root", position, (context.primary ? -1 : 1) * (options.wall / 2 + 5), z);
      }
      if (context.primary) for (const position of context.schedule.followerEars) for (const z of [.1, K.deckLo - .3])
        place(context, "primary rail behind follower collar relief", position, -options.wall / 2 - collar - 2 * clearance - 1 - K.ligMin / 2, z);
    } else if (source.source.kind === "cover") {
      const thickness = sharedWallCoverThickness(options), roofTop = snap.tip + SHARED_WALL_PIN_CREST + clearance + K.tabT / 2 + clearance;
      for (const position of context.primary ? context.schedule.primaryCoverPins : context.schedule.followerCoverPins) {
        place(context, "blind socket closed upper roof", position, (K.tabT - options.wall) / 2, roofTop + .3);
        for (const z of [.1, thickness - .3]) {
          place(context, "cover bearing and finger root", position, options.wall / 2 + (context.primary ? -K.tabT / 2 : .5), z);
          place(context, "cover closed free-edge collar", position,
            context.primary ? options.wall / 2 - K.tabT / 2 : -options.wall / 2 - clearance - K.ligMin / 2, z);
        }
        for (const side of [-1, 1]) place(context, "blind socket hook chamber side root",
          position + side * (K.tabW / 2 + clearance + snap.hook + .5), (K.tabT - options.wall) / 2, .1);
      }
    } else if (source.source.kind === "lane" && source.source.plate === "end-wall") {
      const centre = context.localSide * (derived.IW / 2 + (options.wall / 2 - clearance) / 2);
      for (const z of [.1, options.wall - .3]) {
        add("split end-wall post retained half ligament", -(lane.H - 4), centre, z);
        add("split end-wall post upper bearing", -(lane.H - .5), centre, z);
        add("split end-wall post body root", -(lane.lapZ + lane.ewh) / 2, context.localSide * derived.IW / 2, z);
      }
    }
  }
  const index = sectionIndex(source), seams = derived.seams;
  if (source.source.kind === "lane" && source.source.plate === "deck") {
    if (index > 0) for (const x of [seams[index - 1] - 5, seams[index - 1] + 3]) add("shared deck seam tongue and root", x, 0, .1);
    if (index < seams.length) for (const y of [-24, 24]) add("shared deck seam socket shoulders", seams[index] - 5, y, .1);
  } else if (source.source.kind === "cover") {
    for (const seam of [index > 0 ? seams[index - 1] + 2 : undefined, index < seams.length ? seams[index] - 2 : undefined])
      if (seam !== undefined) for (const y of coverSeamPositions(derived.OW)) for (const z of [.1, sharedWallCoverThickness(options) - .3])
        add("shared cover seam frame", seam, y, z);
  }
  return probes;
}

function inSection(probe: Probe, mesh: Manifold) {
  const bounds = mesh.boundingBox();
  return [0, 1].every(axis => probe.point[axis] >= bounds.min[axis] - 1e-5 && probe.point[axis] <= bounds.max[axis] + 1e-5);
}

function validate(name: string, mesh: Manifold, probes: Probe[]) {
  if (mesh.status() !== "NoError" || mesh.decompose().length !== 1 || overhangArea(mesh) > 1e-6 || Math.abs(mesh.boundingBox().min[2]) > 1e-6)
    throw new Error(`${name}: invalid, disconnected, unsupported or non-bed printable`);
  for (const probe of probes) {
    const [x, y, z] = probe.point;
    if (geo.isect(mesh, geo.box(.02, .02, .02, x, y, z)).volume() < .0000079)
      throw new Error(`${name}: ${probe.label} at ${probe.point} is outside production material`);
  }
  const converted = meshDataOf(name, mesh.getMesh());
  const degenerates = inspectMesh(converted, true);
  if (degenerates) console.info(`${name}: retained ${degenerates} zero-area kernel facets`);
  return converted;
}

function sourceFamily(source: MixedPartSource): string {
  if (source.kind === "shared-divider") { const { section, ...identity } = source; return JSON.stringify(identity); }
  if (source.kind === "stack") { const { half, section, ...identity } = source.source; return JSON.stringify({ ...source, source: identity }); }
  return JSON.stringify(source);
}

function buildSamples(layout: MixedLayout, coupons: boolean): Sample[] {
  const manifest = mixedPartManifest(layout), identities = new Map(manifest.map(descriptor => [descriptor.name, descriptor]));
  const families = new Map<string, { expected: Set<string>; assigned: Set<string> }>();
  const samples: Sample[] = [];
  for (const [index, part] of buildMixedGeometry(geo, layout).entries()) {
    const descriptor = identities.get(part.name);
    if (!descriptor || descriptor.qty !== part.qty) throw new Error(`Production manifest mismatch ${part.name}`);
    const candidates = candidatesFor(descriptor.source, layout), probes = candidates.filter(probe => inSection(probe, part.mesh));
    const family = sourceFamily(descriptor.source), tracking = families.get(family) ?? { expected: new Set<string>(), assigned: new Set<string>() };
    for (const probe of candidates) tracking.expected.add(JSON.stringify(probe));
    for (const probe of probes) tracking.assigned.add(JSON.stringify(probe));
    families.set(family, tracking);
    const fit = layout.request.shared.fit;
    if (!coupons) {
      samples.push({ name: part.name, source: JSON.stringify(descriptor.source), productionSource: descriptor.source, fit, turned: false,
        mesh: validate(part.name, part.mesh, probes), qty: part.qty, probes });
      continue;
    }
    if (!probes.length) continue;
    const groups = new Map<string, Probe[]>();
    for (const probe of probes) {
      const key = `${Math.round(probe.point[0] / 20)}:${Math.round(probe.point[1] / 20)}`;
      groups.set(key, [...groups.get(key) ?? [], probe]);
    }
    for (const [group, selected] of groups) {
      // Sparse lattice crops must retain their actual connecting material; the
      // probe coordinates and source geometry never change to fit the window.
      let clipped: Manifold | undefined;
      for (const padding of [9, 12, 18, 27, 40.5, 61, 92, 140, 210, 320, 480, 720, 1080, 2160]) {
        const minimum = [0, 1].map(axis => Math.min(...selected.map(probe => probe.point[axis])) - padding);
        const maximum = [0, 1].map(axis => Math.max(...selected.map(probe => probe.point[axis])) + padding);
        const candidate = geo.isect(part.mesh, geo.box(maximum[0] - minimum[0], maximum[1] - minimum[1], 1000,
          (minimum[0] + maximum[0]) / 2, (minimum[1] + maximum[1]) / 2, 0));
        if (candidate.status() === "NoError" && candidate.decompose().length === 1 && overhangArea(candidate) <= 1e-6
          && Math.abs(candidate.boundingBox().min[2]) <= 1e-6) { clipped = candidate; break; }
      }
      if (!clipped) throw new Error(`No connected production coupon window for ${part.name}/${group}`);
      for (const turned of [false, true]) {
        const name = `production-fit-${fit}-source-${index}-window-${group}-${turned ? "y" : "x"}`;
        const oriented = selected.map(probe => ({ ...probe, point: turned ? [-probe.point[1], probe.point[0], probe.point[2]] : probe.point }));
        const mesh = turned ? clipped.rotate([0, 0, 90]) : clipped;
        samples.push({ name, source: JSON.stringify(descriptor.source), productionSource: descriptor.source, fit, turned,
          mesh: validate(name, mesh, oriented), qty: 1, probes: oriented });
      }
    }
  }
  for (const [family, tracking] of families) for (const candidate of tracking.expected) if (!tracking.assigned.has(candidate))
    throw new Error(`No production section owns ${family}: ${candidate}`);
  return samples;
}

const catalogue: ProfileIndex = await Bun.file("profiles/index.json").json();
const machine = "Bambu Lab P2S 0.4 nozzle";
const filament = filamentsFor(catalogue, machine).find(item => item.label === "Bambu PETG Translucent");
if (!filament) throw new Error("Missing P2S PETG Translucent profile");
const picks = { ...defaultPicks(catalogue, machine), filament: filament.name, translucent: true };
if (picks.process !== "0.20mm Standard @BBL P2S") throw new Error(`Unexpected process ${picks.process}`);
const settings = JSON.parse(new TextDecoder().decode(composeProfile(catalogue, picks)));
const browserBytes = reported ? await Bun.file(browserProject).bytes() : undefined;
const browserProjectSha256 = browserBytes ? createHash("sha256").update(browserBytes).digest("hex") : undefined;
const browserArchive = browserBytes ? unzipSync(browserBytes) : undefined;
const profile = browserArchive ? browserArchive["Metadata/project_settings.config"]
  : new TextEncoder().encode(JSON.stringify({ ...settings, curr_bed_type: "High Temp Plate" }));
if (!profile) throw new Error("Browser export has no print profile");
if (reported) {
  const actual = JSON.parse(new TextDecoder().decode(profile));
  const stock = JSON.parse(new TextDecoder().decode(composeProfile(catalogue, { ...picks, translucent: false })));
  if (!isDeepStrictEqual(actual, stock)) throw new Error("Browser profile differs from the selected stock configuration");
  if (actual.printer_settings_id !== machine || actual.print_settings_id !== picks.process
    || JSON.stringify(actual.filament_settings_id) !== JSON.stringify([filament.name])
    || actual.curr_bed_type !== "Textured PEI Plate" || actual.different_settings_to_system?.some((keys: string) => keys))
    throw new Error("Reported scenario requires the exact stock P2S/PETG Translucent profile and Textured PEI Plate");
}
const bed = bedFromConfig(profile), keepOut = keepOutFromConfig(profile);
const scenarios = reported ? [{ name: "production-reported-292", depth: 292.1, widths: [122.5, 122.5, 157], cascade: false }] : [
  { name: "production-pair-240", depth: 240, widths: [122.5, 134], cascade: false },
  { name: "production-cascade-triple-640", depth: 640, widths: [122.5, 134, 115], cascade: true },
];
const hash = async (path: string) => createHash("sha256").update(await Bun.file(path).bytes()).digest("hex");
if (operation === "inspect") {
  for (const scenario of scenarios) {
    const layout = resolveMixedBuild(reported ? { w: 457.2, d: 292.1, h: 241, front: 0 } : { w: 2000, d: 1200, h: 1600, front: 0 }, requestFor(0, scenario.depth, scenario.widths, scenario.cascade, profile));
    console.log(JSON.stringify({ scenario, boundaries: layout.boundaries, manifest: mixedPartManifest(layout), footprint: layout.footprint }));
  }
} else {
  const directory = resolve(output);
  await mkdir(directory);
  const paths = ["test/shared-joint-audit-fixes.test.ts", "test/shared-joint-planning.test.ts", "test/shared-joint-variants.test.ts", "test-ui/shared-joint-planning.ui.test.ts", "qualify-shared-walls.ts", "prototypes/shared-wall-qualification.ts", "prototypes/shared-wall-mechanics-v2.ts", "prototypes/shared-wall-crest.ts",
    "prototypes/toolpath-deposition.ts", "profiles/index.json", "bun.lock", "ref.ts", "test/geo.ts", "package.json",
    "test/shared-wall-production.test.ts", "test/shared-wall-layout.test.ts", "test/shared-wall-validation.test.ts", "test/shared-wall-independent-review.test.ts", "test/shared-wall-review-fixes.test.ts",
    "test/toolpath-deposition.test.ts", "test/toolpath-qualification.test.ts",
    ".claude/skills/slicing-with-bambu-cli/slice-3mf.ts"];
  for await (const path of new Bun.Glob("src/**/*.ts").scan(".")) paths.push(path);
  const sourceSha256 = Object.fromEntries(await Promise.all(paths.sort().map(async path => [path, await hash(path)])));
  for (const [path, expected] of Object.entries(sourceSha256)) {
    const bytes = await Bun.file(path).bytes();
    if (createHash("sha256").update(bytes).digest("hex") !== expected) throw new Error(`Source changed during archive: ${path}`);
    await Bun.write(join(directory, "source", path), bytes);
  }
  async function verifyBrowserGeometry(samples: Sample[], plan: ReturnType<typeof packPlan>) {
    if (!browserArchive) throw new Error("Missing browser archive");
    const wasm = await Module(); wasm.setup();
    const model = strFromU8(browserArchive["3D/3dmodel.model"]);
    const objects = [...model.matchAll(/<object[^>]*name="([^"]*)"[^>]*>([\s\S]*?)<\/object>/g)];
    if (objects.length !== plan.placements.length) throw new Error("Browser copy count differs from the production manifest");
    const columns = Math.ceil(Math.sqrt(1 + Math.max(...plan.placements.map(placement => placement.plate))));
    const comparisons = [];
    for (const placement of plan.placements) {
      const object = objects.find(object => object[1] === placement.name);
      const sample = samples.find(sample => sample.name === placement.part);
      if (!object || !sample) throw new Error(`Missing browser copy/source ${placement.name}`);
      const origin = [(placement.plate % columns) * bed[0] * 1.2, -Math.floor(placement.plate / columns) * bed[1] * 1.2, 0];
      const positions = [...object[2].matchAll(/<vertex x="([^"]*)" y="([^"]*)" z="([^"]*)"\/>/g)].flatMap(vertex => {
        const point = vertex.slice(1).map((value, axis) => Number(value) - origin[axis] - placement.translation[axis]);
        return placement.rotation90 ? [point[1], -point[0], point[2]] : point;
      });
      const indices = [...object[2].matchAll(/<triangle v1="(\d+)" v2="(\d+)" v3="(\d+)"\/>/g)].flatMap(triangle => triangle.slice(1).map(Number));
      const actual = new wasm.Manifold(new wasm.Mesh({ numProp: 3, vertProperties: new Float32Array(positions), triVerts: new Uint32Array(indices) }));
      const expected = new wasm.Manifold(new wasm.Mesh({ numProp: 3, vertProperties: sample.mesh.pos, triVerts: sample.mesh.idx }));
      try {
        if (actual.status() !== "NoError" || expected.status() !== "NoError") throw new Error(`Invalid comparison mesh ${placement.name}`);
        const removed = expected.subtract(actual), added = actual.subtract(expected);
        try {
          const difference = removed.volume() + added.volume();
          if (difference > 1e-5) throw new Error(`Browser source differs from generated production material ${placement.name}: ${difference} mm³`);
          comparisons.push({ name: placement.name, symmetricDifferenceVolume: difference });
        } finally { removed.delete(); added.delete(); }
      } finally { actual.delete(); expected.delete(); }
    }
    return comparisons;
  }
  async function write(name: string, samples: Sample[], layouts: MixedLayout[], coupons: boolean) {
    const plan = packPlan(samples.map(sample => ({ mesh: sample.mesh, qty: sample.qty })), bed, 3, 6, keepOut);
    const project = join(directory, `${name}.3mf`);
    const bytes = threeMf(plan, bed, { profile });
    if (browserArchive && !coupons) {
      const generated = unzipSync(bytes);
      for (const path of ["Metadata/model_settings.config", "Metadata/project_settings.config"]) {
        if (!browserArchive[path] || !generated[path] || !Buffer.from(browserArchive[path]).equals(Buffer.from(generated[path])))
          { await Bun.write(`${project}.mismatch.3mf`, bytes); throw new Error(`Generated reported scenario differs from the browser export: ${path}`); }
      }
      // Coplanar triangulation can differ between WASM runs. Compare actual
      // material in each original source frame, then retain the download itself.
      await Bun.write(join(directory, "browser-geometry-comparison.json"), JSON.stringify(await verifyBrowserGeometry(samples, plan), null, 2));
      // Slice the actual downloaded bytes, not merely a matching regeneration.
      await Bun.write(project, browserBytes!);
    } else await Bun.write(project, bytes);
    const requiredFeatures = [...REQUIRED_FEATURES];
    if (layouts.some(layout => layout.stacks.some(stack => stack.derived.seams.length)))
      requiredFeatures.push("seam key first-layer rail/end bridge", "shared divider seam frame", "shared deck seam tongue and root", "shared deck seam socket shoulders", "shared cover seam frame");
    await Bun.write(join(directory, `${name}.json`), JSON.stringify({ project, projectSha256: await hash(project), sourceSha256,
      ...(reported ? { browserProject: resolve(browserProject), browserProjectSha256, requestScope: "Manufacturing-equivalent fixture checked against the actual download; original URL recorded by browser capture separately", printProfile: "Exact browser stock P2S/PETG Translucent/Textured PEI; no translucent modifications" } : {}),
      layouts, productionManifest: layouts.map(layout => mixedPartManifest(layout)), placements: plan.placements,
      samples: samples.map(({ mesh, ...sample }) => sample), requiredFeatures,
      purpose: coupons ? "Actual clipped production manifest junctions, all fits and both axes; physical assembly qualification separate"
        : "Complete production shared-wall manifest with full quantities, explicit schedules, ownership and source sections" }, null, 2));
    console.log(JSON.stringify({ project, sources: samples.length, copies: plan.placements.length, plates: 1 + Math.max(...plan.placements.map(item => item.plate)), probes: samples.reduce((sum, sample) => sum + sample.probes.length * sample.qty, 0) }));
  }
  for (const scenario of scenarios) {
    const layout = resolveMixedBuild(reported ? { w: 457.2, d: 292.1, h: 241, front: 0 } : { w: 2000, d: 1200, h: 1600, front: 0 }, requestFor(0, scenario.depth, scenario.widths, scenario.cascade, profile));
    const samples = geo.arena(() => buildSamples(layout, false));
    await write(scenario.name, samples, [layout], false);
  }
  if (!reported) {
    const couponLayouts = [-.2, 0, .3].map(fit => resolveMixedBuild({ w: 2000, d: 1200, h: 1600, front: 0 }, requestFor(fit, 240, [122.5, 134, 115], false, profile)));
    const coupons = geo.arena(() => couponLayouts.flatMap(layout => buildSamples(layout, true)));
    await write("production-coupons", coupons, couponLayouts, true);
  }
  for (const [path, expected] of Object.entries(sourceSha256)) if (await hash(path) !== expected) throw new Error(`Source changed during generation: ${path}`);
}
