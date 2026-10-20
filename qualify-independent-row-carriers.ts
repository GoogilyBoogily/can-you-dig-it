// Clip actual production interfaces; generate only, never invoke the slicer.
// bun qualify-independent-row-carriers.ts <fresh-directory>
// bun prototypes/shared-wall-qualification.ts check <production-carriers.json> <slice-directory> <fresh-report.json>
import { mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import type { Manifold } from 'manifold-3d';
import { DEFAULTS, K, type IndependentRowRequest, type Vec3 } from './src/model';
import { resolveIndependentRows } from './src/rows';
import { buildIndependentRowsGeometry } from './src/rows-geometry';
import { independentRowsPartManifest, independentRowsAssemblyPlacements } from './src/assembly';
import { clearanceOf, pinSnap, seamKeyHalfLength, seamKeyRadius } from './src/features/joints';
import { sharedWallSnapTop } from './src/features/shared-wall';
import { lay } from './src/features/pose';
import { meshDataOf, inspectMesh, materializePlacement, packPlan, threeMf, type MeshData, type PackedPlan } from './src/export';
import { composeProfile, defaultPicks, filamentsFor, bedFromConfig, keepOutFromConfig, type ProfileIndex } from './src/profiles';
import { geo, overhangArea } from './test/geo';

interface Probe { label: string; point: number[] }
interface Sample { name: string; source: string; fit: number; turned: boolean; mesh: MeshData; probes: Probe[] }
const output = Bun.argv[2];
if (!output) throw new Error('Usage: bun qualify-independent-row-carriers.ts <fresh-directory>');
const directory = resolve(output);
await mkdir(directory);
const hash = async (path: string) => createHash('sha256').update(await Bun.file(path).bytes()).digest('hex');
const sourcePaths = ['qualify-independent-row-carriers.ts', 'prototypes/shared-wall-qualification.ts',
  'prototypes/toolpath-deposition.ts', 'test/geo.ts', 'profiles/index.json', 'bun.lock', 'package.json',
  '.claude/skills/slicing-with-bambu-cli/slice-3mf.ts'];
for await (const path of new Bun.Glob('src/**/*.ts').scan('.'))
  if (!['src/main.ts', 'src/viewer.ts', 'src/worker.ts'].includes(path)) sourcePaths.push(path);
const sourceSha256: Record<string, string> = {};
for (const path of sourcePaths) {
  sourceSha256[path] = await hash(path);
  await Bun.write(join(directory, 'source', path), await Bun.file(path).bytes());
}
const catalogue: ProfileIndex = await Bun.file('profiles/index.json').json();
const machine = 'Bambu Lab P2S 0.4 nozzle';
const filament = filamentsFor(catalogue, machine).find(item => item.label === 'Bambu PETG Translucent');
if (!filament) throw new Error('Missing P2S PETG Translucent profile');
const picks = { ...defaultPicks(catalogue, machine), filament: filament.name, translucent: true };
const settings = JSON.parse(new TextDecoder().decode(composeProfile(catalogue, picks)));
const profile = new TextEncoder().encode(JSON.stringify({ ...settings, curr_bed_type: 'High Temp Plate' }));
const bed = bedFromConfig(profile), keepOut = keepOutFromConfig(profile);
if (bed[0] !== bed[1]) throw new Error('Paired whole-plate quarter turns require a square bed');
const row = (widths: number[], rowSpan: number | 'auto' = 'auto'): IndependentRowRequest => ({
  lanes: widths.map(canHeight => ({ canDiameter: 66, canHeight, depth: 279.4, slope: 3, lipGap: 5 })),
  repeat: 1, rowHeight: 'auto', rowSpan, alignment: 'centre', rearLoad: false,
});
const configurations = [
  { name: 'spread', rows: [row([157, 157], 420), row([122.5, 122.5, 122.5])] },
  { name: 'compact', rows: [{ ...row([157, 157]), repeat: 2 }] },
];

const samples = geo.arena(() => {
  const samples: Sample[] = [];
  function add(name: string, source: string, fit: number, mesh: Manifold, probes: Probe[], incomingWall = false) {
    // Incoming-wall windows end at the complete 1.7 mm protected chamber frame.
    // Extending into a neighboring lattice cell can sever an irrelevant web tip.
    const margin = incomingWall ? K.ligMin - .7 : 4;
    const minimum = [0, 1].map(axis => Math.min(...probes.map(probe => probe.point[axis])) - margin);
    const maximum = [0, 1].map(axis => Math.max(...probes.map(probe => probe.point[axis])) + margin);
    if (incomingWall) minimum[1] = 0;
    const clipped = geo.isect(mesh, geo.box(maximum[0] - minimum[0], maximum[1] - minimum[1], 1000,
      (minimum[0] + maximum[0]) / 2, (minimum[1] + maximum[1]) / 2, 0));
    if (clipped.status() !== 'NoError' || clipped.decompose().length !== 1
      || overhangArea(clipped) > 1e-6 || Math.abs(clipped.boundingBox().min[2]) > 1e-6)
      throw new Error(`${name}: actual clipped interface is not one bed-seated support-free solid: ${JSON.stringify({
        status: clipped.status(), components: clipped.decompose().map(component => component.volume()),
        overhang: overhangArea(clipped), bounds: clipped.boundingBox(), minimum, maximum,
      })}`);
    for (const probe of probes) if (geo.isect(clipped,
      geo.box(.02, .02, .02, ...probe.point as Vec3)).volume() < .0000079)
      throw new Error(`${name}: ${probe.label} outside production material at ${probe.point}`);
    const converted = meshDataOf(name, clipped.getMesh()); inspectMesh(converted, true);
    const rotated = meshDataOf(`${name}-axis90`, clipped.rotate([0, 0, 90]).getMesh()); inspectMesh(rotated, true);
    samples.push({ name, source, fit, turned: false, mesh: converted, probes },
      { name: rotated.name, source, fit, turned: true, mesh: rotated,
        probes: probes.map(probe => ({ label: probe.label, point: [-probe.point[1], probe.point[0], probe.point[2]] })) });
  }
  for (const fit of [-.2, 0, .3]) for (const configuration of configurations) {
    const layout = resolveIndependentRows({ w: 457.2, d: 279.4, h: 241, front: 0 }, {
      shared: { ...DEFAULTS, base: 'flat', fit, bed, bedKeepOut: keepOut }, rows: configuration.rows,
      shareCompatibleWalls: true, topCover: true,
    });
    const manifest = independentRowsPartManifest(layout), printables = buildIndependentRowsGeometry(geo, layout);
    const catalogue = new Map(printables.map(part => [part.name, part.mesh]));
    const placements = [...independentRowsAssemblyPlacements(layout)];
    const transition = layout.transitions[0], options = layout.rows[0].lanes[0].options;
    const clearance = clearanceOf(options), pin = pinSnap(clearance);
    const descriptorForPanel = (panelIndex: number) => {
      const descriptor = manifest.find(descriptor => descriptor.source.kind === 'row-transition'
        && transition.parts[descriptor.source.partIndex].panelIndex === panelIndex);
      if (!descriptor) throw new Error(`Missing production carrier ${panelIndex}`);
      return descriptor;
    };
    for (const panel of transition.panels) {
      const descriptor = descriptorForPanel(panel.index), mesh = catalogue.get(descriptor.name)!;
      for (const caught of panel.ownedCatches) {
        const support = transition.lowerSupports[caught.supportIndex];
        const centreY = support.y + support.wallSide * (K.tabT - options.wall) / 2;
        const halfDepth = K.tabT / 2 + clearance;
        const roofTop = pin.tip + clearance + halfDepth;
        const probes: Probe[] = [];
        for (const offset of [-halfDepth / 2, 0, halfDepth / 2]) probes.push({
          label: 'carrier blind catch closed roof',
          point: [caught.x, centreY + offset, roofTop - Math.abs(offset) + .2],
        });
        for (const side of [-1, 1]) for (const height of [.1, transition.carrierThickness - .3]) probes.push({
          label: 'carrier catch bearing rail and finger root',
          point: [caught.x + side * (K.tabW / 2 + pin.hook + clearance + .7), centreY, height],
        });
        add(`${configuration.name}-fit-${fit}-carrier-${panel.index}-catch-${support.index}`, JSON.stringify({
          configuration: configuration.name, source: descriptor.source, catch: caught,
        }), fit, mesh, probes);
      }
    }
    for (const seam of transition.seams) for (const panelIndex of [seam.firstPanelIndex, seam.secondPanelIndex]) {
      const descriptor = descriptorForPanel(panelIndex), mesh = catalogue.get(descriptor.name)!;
      const direction = panelIndex === seam.firstPanelIndex ? -1 : 1;
      for (const position of seam.keyPositions) {
        const middle = transition.carrierThickness / 2;
        const y = seam.y + direction * seamKeyHalfLength / 2;
        const probes: Probe[] = [
          { label: 'carrier seam key host lower skin', point: [position, y, .1] },
          { label: 'carrier seam key host upper skin', point: [position, y, transition.carrierThickness - .3] },
          { label: 'carrier seam key closed roof', point: [position, y, middle + seamKeyRadius + .2] },
          { label: 'carrier seam key closed floor', point: [position, y, middle - seamKeyRadius - .2] },
          { label: 'carrier seam key blind end root', point: [position,
            seam.y + direction * (seamKeyHalfLength + clearance + .5), middle] },
          ...[-1, 1].map(side => ({ label: 'carrier seam key diagonal bearing root',
            point: [position + side * (seamKeyRadius / 2 + .45), y, middle + seamKeyRadius / 2] })),
        ];
        add(`${configuration.name}-fit-${fit}-seam-${seam.index}-panel-${panelIndex}-key-${position}`,
          JSON.stringify({ configuration: configuration.name, source: descriptor.source,
            seamIndex: seam.index, keyPosition: position }), fit, mesh, probes);
      }
    }
    const upper = layout.rows[1];
    for (const shoe of transition.shoes) {
      const wallPlacement = placements.find(placement => {
        const descriptor = manifest.find(descriptor => descriptor.name === placement.name);
        const source = descriptor?.source;
        if (source?.kind !== 'row-part' || source.rowIndex !== 1 || source.source.kind !== 'stack') return false;
        const laneSource = source.source;
        if (laneSource.stackIndex !== shoe.laneIndex || laneSource.source.kind !== 'lane'
          || !laneSource.source.plate?.startsWith(shoe.wallSide > 0 ? 'wall-left' : 'wall-right')) return false;
        const section = laneSource.source.section ?? (laneSource.source.half === 'rear' ? 1 : 0);
        return section === shoe.bay;
      });
      if (!wallPlacement) throw new Error(`Missing production incoming wall for shoe ${shoe.index}`);
      const descriptor = manifest.find(descriptor => descriptor.name === wallPlacement.name)!;
      const mesh = catalogue.get(descriptor.name)!, probes: Probe[] = [];
      const probe = (label: string, x: number, relativeHeight: number, printHeight: number) => {
        const standing: Vec3 = [x, layout.rows[0].origin[1] + shoe.y - shoe.wallSide * options.wall / 2
          + shoe.wallSide * printHeight, upper.origin[2] + relativeHeight];
        const bounds = lay(geo.box(.002, .002, .002, ...standing), wallPlacement.pose).boundingBox();
        probes.push({ label, point: bounds.min.map((minimum, axis) => (minimum + bounds.max[axis]) / 2) });
      };
      for (const position of shoe.pinPositions) for (const printHeight of [.1, options.wall - .3]) {
        probe('incoming crest receiver closed upper root', position, sharedWallSnapTop(options) + clearance + .7, printHeight);
        for (const side of [-1, 1]) probe('incoming crest receiver side ligament',
          position + side * (K.tabW / 2 + pin.hook + clearance + .7), pin.peak, printHeight);
      }
      add(`${configuration.name}-fit-${fit}-incoming-wall-shoe-${shoe.index}`, JSON.stringify({
        configuration: configuration.name, source: descriptor.source, shoeIndex: shoe.index,
      }), fit, mesh, probes, true);
    }
  }
  return samples;
});

const primary = samples.filter(sample => !sample.turned);
const rotatedByName = new Map(samples.filter(sample => sample.turned).map(sample => [sample.name, sample]));
const plan = packPlan(primary.map(sample => ({ mesh: sample.mesh, qty: 1 })), bed, 3, 6, keepOut);
const plates = 1 + Math.max(...plan.placements.map(placement => placement.plate));
const paired: PackedPlan = {
  geometries: [...plan.geometries, ...plan.geometries.map(mesh => rotatedByName.get(`${mesh.name}-axis90`)!.mesh)],
  placements: [...plan.placements, ...plan.placements.map(placement => ({ ...placement,
    name: `${placement.name}-axis90`, part: `${placement.part}-axis90`, geometry: placement.geometry + plan.geometries.length,
    plate: placement.plate + plates,
    translation: [bed[0] - placement.translation[1], placement.translation[0], placement.translation[2]] as Vec3,
    bbox: [bed[0] - placement.bbox[4], placement.bbox[0], placement.bbox[2],
      bed[0] - placement.bbox[1], placement.bbox[3], placement.bbox[5]] as MeshData['bbox'],
  }))],
};
for (const placement of paired.placements) {
  const actual = materializePlacement(paired.geometries[placement.geometry], placement);
  inspectMesh(actual, true);
  for (const [left, bottom, right, top] of keepOut) if (!(actual.bbox[3] <= left - 3 || actual.bbox[0] >= right + 3
    || actual.bbox[4] <= bottom - 3 || actual.bbox[1] >= top + 3)) throw new Error('Quarter-turned coupon enters printer keep-out');
}
const project = join(directory, 'production-carriers.3mf');
await Bun.write(project, threeMf(paired, bed, { profile }));
await Bun.write(join(directory, 'production-carriers.json'), JSON.stringify({
  project, projectSha256: await hash(project), sourceSha256, placements: paired.placements,
  samples: samples.map(({ mesh, ...sample }) => sample),
  requiredFeatures: [...new Set(samples.flatMap(sample => sample.probes.map(probe => probe.label)))],
  purpose: 'Actual clipped production carrier/receiver interfaces: all catches, both halves of every Y-key host and incoming wall roots in spread and compact layouts; all three fits and both actual packed axes. Open coupon edges do not qualify whole-assembly retention or physical strength.',
}, null, 2));
for (const [path, expected] of Object.entries(sourceSha256)) if (await hash(path) !== expected)
  throw new Error(`Source changed during carrier export: ${path}`);
console.log(JSON.stringify({ project, plates: plates * 2, copies: paired.placements.length,
  probes: samples.reduce((count, sample) => count + sample.probes.length, 0) }));
