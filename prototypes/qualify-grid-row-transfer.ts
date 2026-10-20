/** Fresh geometry/production export evidence, not slicing or a printer command.
 * bun prototypes/qualify-grid-row-transfer.ts [fresh-directory]
 */
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { DEFAULTS, type IndependentRowRequest } from '../src/model';
import { resolveIndependentRows } from '../src/rows';
import { independentRowsPartManifest } from '../src/assembly';
import { buildIndependentRowsGeometry } from '../src/rows-geometry';
import { buildRowTransitionPart } from '../src/row-transition-geometry';
import { stand } from '../src/features/pose';
import { meshDataOf, packPlan, threeMf } from '../src/export';
import { bedFromConfig, composeProfile, defaultPicks, filamentsFor, keepOutFromConfig, type ProfileIndex } from '../src/profiles';
import { completeTransferPrototype } from './grid-row-transfer-complete';
import { checkCompleteTransfer } from './grid-row-transfer-verification';
import { geo } from '../test/geo';

const directory = Bun.argv[2] ?? `.slice/grid-row-transfer-complete-${Date.now()}`;
await mkdir(directory);
const sourcePaths = ['prototypes/grid-row-transfer.ts', 'prototypes/grid-row-transfer-complete.ts',
  'prototypes/grid-row-transfer-verification.ts', 'prototypes/qualify-grid-row-transfer.ts',
  'test/independent-row-transfer.test.ts', 'test/geo.ts', 'profiles/index.json', 'bun.lock', 'package.json'];
for await (const path of new Bun.Glob('src/**/*.ts').scan('.')) sourcePaths.push(path);
const sourceHashes: Record<string, string> = {};
for (const path of sourcePaths) {
  const bytes = await Bun.file(path).bytes();
  sourceHashes[path] = createHash('sha256').update(bytes).digest('hex');
  const destination = join(directory, 'source', path);
  await mkdir(dirname(destination), { recursive: true });
  await Bun.write(destination, bytes);
}
const catalogue: ProfileIndex = await Bun.file('profiles/index.json').json();
const machine = 'Bambu Lab P2S 0.4 nozzle';
const filament = filamentsFor(catalogue, machine).find(candidate => candidate.label === 'Bambu PETG Translucent');
if (!filament) throw new Error('P2S PETG Translucent preset is unavailable');
const picks = { ...defaultPicks(catalogue, machine), filament: filament.name, translucent: true };
const settings = JSON.parse(new TextDecoder().decode(composeProfile(catalogue, picks)));
const profile = new TextEncoder().encode(JSON.stringify({ ...settings, curr_bed_type: 'High Temp Plate' }));
const bed = bedFromConfig(profile), keepOut = keepOutFromConfig(profile);

function row(widths: number[], rowSpan: number | 'auto' = 'auto'): IndependentRowRequest {
  return { lanes: widths.map(canHeight => ({ canDiameter: 66, canHeight, depth: 279.4, slope: 3, lipGap: 5 })),
    repeat: 1, rowHeight: 'auto', rowSpan, alignment: 'centre', rearLoad: false };
}

try {
  const jobs = [];
  for (const fit of [-.2, 0, .3]) {
    const result = geo.arena(() => {
      const prototype = completeTransferPrototype(geo, fit), measurements = checkCompleteTransfer(geo, prototype);
      const layout = resolveIndependentRows({ w: 457.2, d: 279.4, h: 241, front: 0 }, {
        shared: { ...DEFAULTS, base: 'flat', fit, bed, bedKeepOut: keepOut },
        rows: [row([157, 157], 420), row([122.5, 122.5, 122.5])], shareCompatibleWalls: true, topCover: true,
      });
      const transition = layout.transitions[0];
      let maximumPrototypeDifference = 0;
      for (const kind of ['carrier', 'shoe', 'key'] as const) {
        const expected = prototype.parts.filter(part => part.kind === kind);
        const planned = transition.parts.map((part, index) => ({ part, index })).filter(({ part }) => part.kind === kind);
        if (expected.length !== planned.length) throw new Error('Production transition quantity differs from prototype');
        for (const [index, { part, index: partIndex }] of planned.entries()) {
          const actual = stand(buildRowTransitionPart(geo, transition, partIndex, layout.rows[0].lanes[0].options), part.pose);
          const difference = Math.max(geo.diff(actual, [expected[index].standing]).volume(), geo.diff(expected[index].standing, [actual]).volume());
          maximumPrototypeDifference = Math.max(maximumPrototypeDifference, difference);
          if (difference > 1e-5) throw new Error(`${part.name}: production differs from measured prototype by ${difference} mm³`);
        }
      }
      const parts = buildIndependentRowsGeometry(geo, layout);
      const plan = packPlan(parts.map(part => ({ mesh: meshDataOf(part.name, part.mesh.getMesh()), qty: part.qty })), bed, 3, 6, keepOut);
      return { fit, layout, measurements, maximumPrototypeDifference,
        manifest: independentRowsPartManifest(layout), placements: plan.placements,
        copies: plan.placements.length, plates: 1 + Math.max(...plan.placements.map(placement => placement.plate)),
        projectBytes: threeMf(plan, bed, { profile }) };
    });
    const project = join(directory, `complete-fit-${fit}.3mf`);
    await Bun.write(project, result.projectBytes);
    const { projectBytes, ...details } = result;
    jobs.push({ ...details, project, projectSha256: createHash('sha256').update(projectBytes).digest('hex') });
  }
  const report = { purpose: 'Complete actual-joint row-transfer geometry and production exports; no toolpath or physical qualification',
    sourceHashes, profile: { machine, process: picks.process, filament: filament.name, bed: 'High Temp Plate' }, jobs,
    remaining: ['Slice functional roots/hooks/roofs and both packed orientations with unchanged deposited-material probes.',
      'Shoe upper pins use the existing finite crest and matching incoming bottom receivers; their fresh toolpath qualification remains separate from CAD seating.',
      'Print hand fit, cumulative and one-sided load, dwell, residual set and bottom-supported handling remain unqualified.'],
  };
  await Bun.write(join(directory, 'geometry.json'), JSON.stringify(report, null, 2));
  const log = jobs.map(job => `fit ${job.fit}: ${job.copies} copies, ${job.plates} P2S plates, ${job.layout.footprint.join(' × ')} mm, ${job.measurements.assemblyPairs} assembly pairs, ${job.measurements.canChecks} can checks, maximum production/prototype difference ${job.maximumPrototypeDifference} mm³`).join('\n')
    + `\nEvidence: ${directory}\nGeometry and packing passed; not sliced or printed.\n`;
  await Bun.write(join(directory, 'geometry.log'), log);
  console.log(log);
} catch (error) {
  await Bun.write(join(directory, 'failure.json'), JSON.stringify({ sourceHashes,
    message: error instanceof Error ? error.message : String(error) }, null, 2));
  throw error;
}
