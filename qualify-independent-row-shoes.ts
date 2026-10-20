// Actual production shoe hooks and roots, all fits and both actual packed axes.
// bun qualify-independent-row-shoes.ts <fresh-directory>
// Slice the emitted project, then use prototypes/shared-wall-qualification.ts check.
import { mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { DEFAULTS, K, type IndependentRowRequest, type Vec3 } from "./src/model";
import { resolveIndependentRows } from "./src/rows";
import { buildRowTransitionPart } from "./src/row-transition-geometry";
import { clearanceOf, pinSnap, tabSnap } from "./src/features/joints";
import { lay } from "./src/features/pose";
import { meshDataOf, inspectMesh, materializePlacement, packPlan, threeMf, type MeshData, type PackedPlan } from "./src/export";
import { composeProfile, defaultPicks, filamentsFor, bedFromConfig, keepOutFromConfig, type ProfileIndex } from "./src/profiles";
import { geo, overhangArea } from "./test/geo";

interface Probe { label: string; point: number[] }
interface Sample { name: string; source: string; fit: number; turned: boolean; mesh: MeshData; probes: Probe[] }
const output = Bun.argv[2];
if (!output) throw new Error("Usage: bun qualify-independent-row-shoes.ts <fresh-directory>");
const directory = resolve(output);
await mkdir(directory);
const hash = async (path: string) => createHash("sha256").update(await Bun.file(path).bytes()).digest("hex");
const sourcePaths = ["qualify-independent-row-shoes.ts", "prototypes/shared-wall-qualification.ts", "prototypes/toolpath-deposition.ts",
  "test/geo.ts", "profiles/index.json", "bun.lock", "package.json", ".claude/skills/slicing-with-bambu-cli/slice-3mf.ts"];
for await (const path of new Bun.Glob("src/**/*.ts").scan("."))
  if (!["src/main.ts", "src/viewer.ts", "src/worker.ts"].includes(path)) sourcePaths.push(path);
const sourceSha256: Record<string, string> = {};
for (const path of sourcePaths) {
  sourceSha256[path] = await hash(path);
  await Bun.write(join(directory, "source", path), await Bun.file(path).bytes());
}
const catalogue: ProfileIndex = await Bun.file("profiles/index.json").json();
const machine = "Bambu Lab P2S 0.4 nozzle";
const filament = filamentsFor(catalogue, machine).find(item => item.label === "Bambu PETG Translucent");
if (!filament) throw new Error("Missing P2S PETG Translucent profile");
const picks = { ...defaultPicks(catalogue, machine), filament: filament.name, translucent: true };
const settings = JSON.parse(new TextDecoder().decode(composeProfile(catalogue, picks)));
const profile = new TextEncoder().encode(JSON.stringify({ ...settings, curr_bed_type: "High Temp Plate" }));
const bed = bedFromConfig(profile), keepOut = keepOutFromConfig(profile);
if (bed[0] !== bed[1]) throw new Error("The paired whole-plate quarter turn requires a square bed");
const row = (widths: number[], rowSpan: number | "auto" = "auto"): IndependentRowRequest => ({
  lanes: widths.map(canHeight => ({ canDiameter: 66, canHeight, depth: 279.4, slope: 3, lipGap: 5 })),
  repeat: 1, rowHeight: "auto", rowSpan, alignment: "centre", rearLoad: false,
});

const samples = geo.arena(() => {
  const samples: Sample[] = [];
  for (const fit of [-.2, 0, .3]) {
    const layout = resolveIndependentRows({ w: 457.2, d: 279.4, h: 241, front: 0 }, {
      shared: { ...DEFAULTS, base: "flat", fit, bed, bedKeepOut: keepOut },
      rows: [row([157, 157], 420), row([122.5, 122.5, 122.5])], shareCompatibleWalls: true, topCover: true,
    });
    const transition = layout.transitions[0], options = layout.rows[0].lanes[0].options;
    const clearance = clearanceOf(options), pin = pinSnap(clearance), downward = tabSnap(clearance, K.snapLen, K.tabW);
    for (const bay of [0, 1]) for (const wallSide of [-1, 1]) {
      const partIndex = transition.parts.findIndex(part => part.kind === "shoe"
        && transition.shoes[part.shoeIndex!].bay === bay && transition.shoes[part.shoeIndex!].wallSide === wallSide);
      if (partIndex < 0) throw new Error(`Missing actual shoe at fit ${fit}, bay ${bay}, side ${wallSide}`);
      const part = transition.parts[partIndex], shoe = transition.shoes[part.shoeIndex!];
      const mesh = buildRowTransitionPart(geo, transition, partIndex, options), probes: Probe[] = [];
      const probe = (label: string, x: number, relativeHeight: number, printHeight: number) => {
        const point: Vec3 = [x, shoe.y - wallSide * options.wall / 2 + wallSide * printHeight,
          layout.rows[0].height + relativeHeight];
        const box = lay(geo.box(.002, .002, .002, ...point), part.pose).boundingBox();
        const printablePoint = box.min.map((number, axis) => (number + box.max[axis]) / 2);
        if (geo.isect(mesh, geo.box(.02, .02, .02, ...printablePoint as Vec3)).volume() < .0000079)
          throw new Error(`${label}: probe outside actual shoe material (${fit}/${bay}/${wallSide})`);
        probes.push({ label, point: printablePoint });
      };
      for (const printHeight of [.1, K.tabT - .3]) {
        for (const position of shoe.pinPositions) for (const side of [-1, 1]) {
          probe("shoe upper pin hook midpoint", position + side * (K.tabW / 2 + pin.hook / 2),
            transition.carrierThickness + transition.shoeHeight + pin.peak, printHeight);
          probe("shoe upper pin prong root", position + side * (K.tabW / 2 - K.snapT / 2),
            transition.carrierThickness + transition.shoeHeight - .4, printHeight);
        }
        for (const position of shoe.tabPositions) for (const side of [-1, 1]) {
          probe("shoe downward snap hook midpoint", position + side * (K.tabW / 2 + downward.hook / 2),
            K.snapLen - downward.peak, printHeight);
          probe("shoe downward snap stem root", position + side * (K.tabW / 2 - K.snapT / 2),
            transition.carrierThickness - .4, printHeight);
        }
      }
      for (const printHeight of [.1, options.wall - .3]) probe("shoe compression shoulder",
        (shoe.xRange[0] + shoe.xRange[1]) / 2, transition.carrierThickness + transition.shoeHeight / 2, printHeight);
      if (mesh.status() !== "NoError" || mesh.decompose().length !== 1 || overhangArea(mesh) > 1e-6)
        throw new Error("Actual shoe is not one connected support-free solid");
      const name = `shoe-fit-${fit}-bay-${bay}-side-${wallSide}`;
      const source = JSON.stringify({ kind: "row-transition", transitionIndex: 0, partIndex });
      const converted = meshDataOf(name, mesh.getMesh()); inspectMesh(converted, true);
      const rotated = meshDataOf(`${name}-axis90`, mesh.rotate([0, 0, 90]).getMesh()); inspectMesh(rotated, true);
      samples.push({ name, source, fit, turned: false, mesh: converted, probes },
        { name: rotated.name, source, fit, turned: true, mesh: rotated,
          probes: probes.map(probe => ({ label: probe.label, point: [-probe.point[1], probe.point[0], probe.point[2]] })) });
    }
  }
  return samples;
});

const primary = samples.filter(sample => !sample.turned), rotatedByName = new Map(samples.filter(sample => sample.turned).map(sample => [sample.name, sample]));
const plan = packPlan(primary.map(sample => ({ mesh: sample.mesh, qty: 1 })), bed, 24, 6, keepOut);
const plates = 1 + Math.max(...plan.placements.map(placement => placement.plate));
// Rotate an entire square plate, retaining the packer's gaps and every rigid copy.
// The independently read-back checker also checks actual exclusions and coordinates.
const paired: PackedPlan = { geometries: [...plan.geometries, ...plan.geometries.map(mesh => rotatedByName.get(`${mesh.name}-axis90`)!.mesh)],
  placements: [...plan.placements, ...plan.placements.map(placement => ({ ...placement,
    name: `${placement.name}-axis90`, part: `${placement.part}-axis90`, geometry: placement.geometry + plan.geometries.length,
    plate: placement.plate + plates, translation: [bed[0] - placement.translation[1], placement.translation[0], placement.translation[2]] as Vec3,
    bbox: [bed[0] - placement.bbox[4], placement.bbox[0], placement.bbox[2], bed[0] - placement.bbox[1], placement.bbox[3], placement.bbox[5]] as MeshData["bbox"],
  }))] };
for (const placement of paired.placements) {
  const actual = materializePlacement(paired.geometries[placement.geometry], placement);
  inspectMesh(actual, true);
  for (const [left, bottom, right, top] of keepOut) if (!(actual.bbox[3] <= left - 3 || actual.bbox[0] >= right + 3
    || actual.bbox[4] <= bottom - 3 || actual.bbox[1] >= top + 3)) throw new Error("Quarter-turned coupon enters the printer keep-out");
}
const project = join(directory, "production-shoes.3mf");
await Bun.write(project, threeMf(paired, bed, { profile }));
const evidence = { project, projectSha256: await hash(project), sourceSha256, placements: paired.placements,
  samples: samples.map(({ mesh, ...sample }) => sample), requiredFeatures: [...new Set(samples.flatMap(sample => sample.probes.map(probe => probe.label)))],
  purpose: "Actual clipped production mechanism matrix: complete uncut shoes at all three fits; every source/point in both actual packed axes; no physical or loaded-strength claim" };
await Bun.write(join(directory, "production-shoes.json"), JSON.stringify(evidence, null, 2));
for (const [path, expected] of Object.entries(sourceSha256)) if (await hash(path) !== expected) throw new Error(`Source changed during shoe export: ${path}`);
console.log(JSON.stringify({ project, plates: plates * 2, copies: paired.placements.length,
  probes: samples.reduce((count, sample) => count + sample.probes.length, 0) }));
