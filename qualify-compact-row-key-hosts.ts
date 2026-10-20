// Generate production-derived whole-depth carrier key/slot coupons; never run a slicer.
// bun qualify-compact-row-key-hosts.ts <fresh-directory>
// bun prototypes/shared-wall-qualification.ts check <production-key-hosts.json> <slice-directory> <fresh-report.json>
import { mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import type { Manifold } from 'manifold-3d';
import { DEFAULTS, K, type IndependentRowsBuildRequest, type Vec3 } from './src/model';
import { resolveIndependentRows } from './src/rows';
import { buildIndependentRowsGeometry } from './src/rows-geometry';
import { independentRowsPartManifest } from './src/assembly';
import { clearanceOf, endWallSnap, seamKeyHalfLength, seamKeyRadius, seamKeySocket } from './src/features/joints';
import { inspectMesh, materializePlacement, meshDataOf, packPlan, threeMf, type MeshData, type PackedPlan } from './src/export';
import { bedFromConfig, composeProfile, defaultPicks, filamentsFor, keepOutFromConfig, type ProfileIndex } from './src/profiles';
import { geo, overhangArea } from './test/geo';

interface Probe { label: string; point: number[] }
interface Sample { name: string; source: string; fit: number; turned: boolean; mesh: MeshData; probes: Probe[] }
const output = Bun.argv[2];
if (!output) throw new Error('Usage: bun qualify-compact-row-key-hosts.ts <fresh-directory>');
const directory = resolve(output);
await mkdir(directory);
const hash = async (path: string) => createHash('sha256').update(await Bun.file(path).bytes()).digest('hex');
const sourcePaths = ['qualify-compact-row-key-hosts.ts', 'qualify-independent-row-carriers.ts',
  'prototypes/shared-wall-qualification.ts', 'prototypes/toolpath-deposition.ts',
  'test/row-carrier-key-allocation.test.ts', 'test/geo.ts', 'profiles/index.json', 'bun.lock', 'package.json',
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

const generated = geo.arena(() => {
  const samples: Sample[] = [], configurations = [];
  let fullProductionProject: Uint8Array | undefined;
  for (const depth of [180, 200, 240, 250]) for (const fit of [-.2, 0, .3]) {
    const request: IndependentRowsBuildRequest = { shared: { ...DEFAULTS, base: 'flat', fit, bed, bedKeepOut: keepOut },
      rows: [{ lanes: Array.from({ length: 2 }, () => ({ canDiameter: 66, canHeight: 122.5,
        depth, slope: 3, lipGap: 5 })), repeat: 2, rowHeight: 'auto', rowSpan: 'auto', alignment: 'centre', rearLoad: false }],
      shareCompatibleWalls: false, topCover: true };
    const layout = resolveIndependentRows({ w: 600, d: 600, h: 500, front: 0 }, request);
    if (layout.rows.some(row => row.lanes.some(lane => lane.derived.split)))
      throw new Error(`${depth}/${fit}: expected whole-depth production lanes`);
    const manifest = independentRowsPartManifest(layout), printables = buildIndependentRowsGeometry(geo, layout);
    const meshes = new Map(printables.map(part => [part.name, part.mesh]));
    const transition = layout.transitions[0], options = layout.rows[0].lanes[0].options;
    const clearance = clearanceOf(options), thickness = transition.carrierThickness;
    const snap = endWallSnap(geo, { height: thickness, wall: options.wall, clearance });
    const carrierDepth = geo.box(2000, 2000, thickness, 0, 0, thickness / 2);
    for (const seam of transition.seams) for (const panelIndex of [seam.firstPanelIndex, seam.secondPanelIndex]) {
      const descriptor = manifest.find(part => part.source.kind === 'row-transition'
        && transition.parts[part.source.partIndex].panelIndex === panelIndex);
      if (!descriptor) throw new Error(`Missing production carrier ${depth}/${fit}/${panelIndex}`);
      const mesh = meshes.get(descriptor.name)!, panel = transition.panels[panelIndex];
      const direction = panelIndex === seam.firstPanelIndex ? -1 : 1;
      const slots = panel.shoeIndices.flatMap(shoeIndex => {
        const shoe = transition.shoes[shoeIndex];
        return shoe.tabPositions.map(position => {
          const turned = snap.slot.rotate([0, 0, -90]).translate([0, K.tabT - options.wall / 2, 0]);
          const slot = geo.isect((shoe.wallSide > 0 ? turned : turned.mirror([0, 1, 0]))
            .translate([position, shoe.y, 0]), carrierDepth);
          return { position, bounds: slot.boundingBox(), mesh: slot };
        });
      });
      for (const position of seam.keyPositions) {
        const channel = seamKeySocket(geo, options).rotate([0, 0, 90]).translate([position, seam.y, thickness / 2]);
        const channelBounds = channel.boundingBox(), middle = thickness / 2;
        const y = seam.y + direction * seamKeyHalfLength / 2;
        const probes: Probe[] = [
          { label: 'carrier seam key host lower skin', point: [position, y, .1] },
          { label: 'carrier seam key host upper skin', point: [position, y, thickness - .3] },
          { label: 'carrier seam key closed roof', point: [position, y, middle + seamKeyRadius + .2] },
          { label: 'carrier seam key closed floor', point: [position, y, middle - seamKeyRadius - .2] },
          { label: 'carrier seam key blind end root', point: [position,
            seam.y + direction * (seamKeyHalfLength + clearance + .5), middle] },
          ...[-1, 1].map(side => ({ label: 'carrier seam key diagonal bearing root',
            point: [position + side * (seamKeyRadius / 2 + .45), y, middle + seamKeyRadius / 2] })),
        ];
        const cropBounds = [channelBounds];
        for (const slot of slots) {
          if (geo.isect(slot.mesh, channel).volume() > 1e-8) throw new Error('Production shoe slot intersects its key channel');
          const separation = [0, 1].map(axis => Math.max(0, channelBounds.min[axis] - slot.bounds.max[axis],
            slot.bounds.min[axis] - channelBounds.max[axis]));
          if (separation[1] !== 0 || separation[0] > 20) continue;
          if (separation[0] < K.ligMin - 1e-6) throw new Error('Production key/slot host is below the minimum ligament');
          cropBounds.push(slot.bounds);
          const minimumX = Math.min(channelBounds.max[0], slot.bounds.max[0]);
          const maximumX = Math.max(channelBounds.min[0], slot.bounds.min[0]);
          const minimumY = Math.max(channelBounds.min[1], slot.bounds.min[1]);
          const maximumY = Math.min(channelBounds.max[1], slot.bounds.max[1]);
          for (const height of [.1, middle, thickness - .3]) probes.push({
            label: 'carrier key shoe-slot separating ligament',
            point: [(minimumX + maximumX) / 2, (minimumY + maximumY) / 2, height],
          });
          for (const side of [-1, 1]) for (const height of [.1, middle, thickness - .3]) probes.push({
            label: 'carrier shoe slot closed end rail',
            point: [slot.position + side * (K.tabW / 2 + clearance + K.snapFlare + .7),
              (slot.bounds.min[1] + slot.bounds.max[1]) / 2, height],
          });
          for (const side of [-1, 1]) for (const height of [.1, thickness - .3]) probes.push({
            label: 'carrier shoe slot closed side rail',
            point: [slot.position, side < 0 ? slot.bounds.min[1] - .7 : slot.bounds.max[1] + .7, height],
          });
        }
        // Include each complete key channel and any neighboring full slot/flare,
        // with the existing carrier harness's 4 mm crop margin around them.
        const minimum = [0, 1].map(axis => Math.min(...cropBounds.map(bounds => bounds.min[axis])) - 4);
        const maximum = [0, 1].map(axis => Math.max(...cropBounds.map(bounds => bounds.max[axis])) + 4);
        const clipped = geo.isect(mesh, geo.box(maximum[0] - minimum[0], maximum[1] - minimum[1], 1000,
          (minimum[0] + maximum[0]) / 2, (minimum[1] + maximum[1]) / 2, 0));
        const name = `depth-${depth}-fit-${fit}-panel-${panelIndex}-key-${position}`;
        if (clipped.status() !== 'NoError' || clipped.decompose().length !== 1
          || overhangArea(clipped) > 1e-6 || Math.abs(clipped.boundingBox().min[2]) > 1e-6)
          throw new Error(`${name}: actual clipped interface is not one bed-seated support-free solid`);
        for (const probe of probes) if (geo.isect(clipped, geo.box(.02, .02, .02, ...probe.point as Vec3)).volume() < .0000079)
          throw new Error(`${name}: ${probe.label} outside production material at ${probe.point}`);
        const source = JSON.stringify({ depth, source: descriptor.source, seamIndex: seam.index, keyPosition: position });
        const converted = meshDataOf(name, clipped.getMesh()); inspectMesh(converted, true);
        const rotated = meshDataOf(`${name}-axis90`, clipped.rotate([0, 0, 90]).getMesh()); inspectMesh(rotated, true);
        samples.push({ name, source, fit, turned: false, mesh: converted, probes },
          { name: rotated.name, source, fit, turned: true, mesh: rotated,
            probes: probes.map(probe => ({ label: probe.label, point: [-probe.point[1], probe.point[0], probe.point[2]] })) });
      }
    }
    const productionPlan = packPlan(printables.map(part => ({ mesh: meshDataOf(part.name, part.mesh.getMesh()), qty: part.qty })),
      bed, 3, 6, keepOut);
    configurations.push({ depth, fit, keys: transition.seams.map(seam => seam.keyPositions),
      copies: productionPlan.placements.length, plates: 1 + Math.max(...productionPlan.placements.map(part => part.plate)),
      footprint: layout.footprint });
    if (depth === 240 && fit === 0) fullProductionProject = threeMf(productionPlan, bed, { profile });
  }
  if (!fullProductionProject) throw new Error('Missing nominal 240 mm complete production export');
  return { samples, configurations, fullProductionProject };
});

const { samples } = generated;
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
const project = join(directory, 'production-key-hosts.3mf');
const fullProductionProject = join(directory, 'complete-depth-240-fit-0.3mf');
await Bun.write(project, threeMf(paired, bed, { profile }));
await Bun.write(fullProductionProject, generated.fullProductionProject);
await Bun.write(join(directory, 'production-key-hosts.json'), JSON.stringify({
  project, projectSha256: await hash(project), sourceSha256, placements: paired.placements,
  samples: samples.map(({ mesh, ...sample }) => sample),
  requiredFeatures: [...new Set(samples.flatMap(sample => sample.probes.map(probe => probe.label)))],
  purpose: 'Actual clipped production whole-depth compact repeat carrier key hosts, complete neighboring slots/flares and separating ligaments: depths 180/200/240/250, three fits, both packed axes. Open coupon edges do not qualify assembly retention or physical strength.',
}, null, 2));
await Bun.write(join(directory, 'production-configurations.json'), JSON.stringify({
  configurations: generated.configurations, fullProductionProject, fullProductionProjectSha256: await hash(fullProductionProject),
  profile: { machine, process: picks.process, filament: filament.name, bed: 'High Temp Plate' },
  remaining: ['Run Bambu and the unchanged deposited-material checker before claiming toolpaths.',
    'Hand fit, cumulative load, creep and bottom-supported handling remain unqualified.'],
}, null, 2));
for (const [path, expected] of Object.entries(sourceSha256)) if (await hash(path) !== expected)
  throw new Error(`Source changed during key-host export: ${path}`);
console.log(JSON.stringify({ project, plates: plates * 2, copies: paired.placements.length,
  probes: samples.reduce((quantity, sample) => quantity + sample.probes.length, 0), fullProductionProject }));
