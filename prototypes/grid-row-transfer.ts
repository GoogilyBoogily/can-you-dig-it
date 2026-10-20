/** Isolated row-transfer coupon; no application module imports this experiment.
 * bun prototypes/grid-row-transfer.ts [fresh-output-directory]
 * A flat plank bears on two actual wall tops. A separate, flat-printed wall
 * shoe snaps through it and receives an actual upper wall and deck ear.
 * This proves one shifted support only, not a complete independent-row grid.
 */
import { mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import type { Manifold } from 'manifold-3d';
import { geo, overhangArea } from '../test/geo';
import { DEFAULTS, K, type Options, type Vec3 } from '../src/model';
import { buildDeck, buildWallFeatures, laneOf, solve } from '../src/geometry';
import { clearanceOf, coverThicknessOf, endWallSnap, pinJoint, pinSnap } from '../src/features/joints';
import { coverPinSocket } from '../src/features/shared-wall';
import { lay, type Pose } from '../src/features/pose';
import { inspectMesh, meshDataOf, packPlan, threeMf, type MeshData } from '../src/export';
import { bedFromConfig, composeProfile, defaultPicks, filamentsFor, keepOutFromConfig, type ProfileIndex } from '../src/profiles';

const dimensions = {
  lowerSupportCentres: [0, 200], upperSupportCentre: 80,
  plankMinimumX: -120, plankMaximumX: -10,
  plankMinimumY: -12, plankMaximumY: 212, plankThickness: 8,
  shoeMinimumX: -115, shoeMaximumX: -15, shoeHeight: 6,
  shoeTabPositions: [-102, -35], pinPosition: -75,
} as const;
const directory = process.argv[2] ?? `.slice/grid-row-transfer-${Date.now()}`;
await mkdir(directory); // Existing evidence is never overwritten.
const sourcePaths = ['prototypes/grid-row-transfer.ts', 'src/geometry.ts', 'src/model.ts',
  'src/features/joints.ts', 'src/features/shared-wall.ts', 'src/features/pose.ts',
  'src/kernel.ts', 'src/export.ts', 'src/profiles.ts', 'profiles/index.json', 'test/geo.ts'];
const sourceHashes = Object.fromEntries(await Promise.all(sourcePaths.map(async path =>
  [path, createHash('sha256').update(await Bun.file(path).bytes()).digest('hex')])));
const catalogue: ProfileIndex = await Bun.file('profiles/index.json').json();
const machine = 'Bambu Lab P2S 0.4 nozzle';
const filament = filamentsFor(catalogue, machine).find(candidate => candidate.label === 'Bambu PETG Translucent');
if (!filament) throw new Error('Missing P2S PETG Translucent preset');
const picks = { ...defaultPicks(catalogue, machine), filament: filament.name, translucent: true };
const settings = JSON.parse(new TextDecoder().decode(composeProfile(catalogue, picks)));
const profile = new TextEncoder().encode(JSON.stringify({ ...settings, curr_bed_type: 'High Temp Plate' }));
const bed = bedFromConfig(profile), keepOut = keepOutFromConfig(profile);
const printableParts: { mesh: MeshData; qty: number }[] = [];

function requireCondition(condition: boolean, context: string): asserts condition {
  if (!condition) throw new Error(context);
}

function window(minimumX: number, maximumX: number, minimumY: number, maximumY: number,
  minimumZ: number, maximumZ: number): Manifold {
  return geo.box(maximumX - minimumX, maximumY - minimumY, maximumZ - minimumZ,
    (minimumX + maximumX) / 2, (minimumY + maximumY) / 2, (minimumZ + maximumZ) / 2);
}

function overlap(first: Manifold, second: Manifold): number {
  return geo.isect(first, second).volume();
}

function bounds(mesh: Manifold) {
  const { min: minimum, max: maximum } = mesh.boundingBox();
  return { minimum, maximum, size: maximum.map((coordinate, axis) => coordinate - minimum[axis]) };
}

function buildSpecimen(fit: number) {
  const lowerOptions: Options = { ...DEFAULTS, length: 240, canL: 190, tiers: 1, lanesWide: 1,
    cascade: false, slope: 3, fit, left: 'none', right: 'none', solid: true, cover: true, base: 'flat' };
  const upperOptions: Options = { ...lowerOptions, canL: 122.5, canD: 53 };
  const lowerDerived = solve(lowerOptions), lowerLane = laneOf(lowerOptions, lowerDerived, 'top');
  const upperDerived = solve(upperOptions), upperLane = laneOf(upperOptions, upperDerived, 'top');
  requireCondition(!lowerDerived.split && !upperDerived.split, 'Coupon requires actual unsplit 240 mm parts');
  requireCondition(lowerDerived.pinPositions.includes(dimensions.pinPosition)
    && upperDerived.pinPositions.includes(dimensions.pinPosition), 'Production pin schedule changed');
  const plankBottom = lowerLane.H, plankTop = plankBottom + dimensions.plankThickness;
  const upperBase = plankTop + dimensions.shoeHeight;
  const wallFeatures = { gangNotches: false, topPins: true, endLap: true };
  const lowerWall = buildWallFeatures(geo, lowerOptions, lowerDerived, lowerLane, 1, wallFeatures)
    .translate([0, -lowerDerived.py, 0]);
  const lowerWalls = dimensions.lowerSupportCentres.map(centre =>
    geo.isect(lowerWall.translate([0, centre, 0]), window(dimensions.plankMinimumX,
      dimensions.plankMaximumX, centre - 4, centre + 4, lowerLane.H - 20, lowerLane.H + 10)));
  const lowerSocket = coverPinSocket(geo, lowerOptions);
  const lowerCuts = dimensions.lowerSupportCentres.map(centre =>
    lowerSocket.translate([dimensions.pinPosition, centre, plankBottom]));
  const downwardSnap = endWallSnap(geo, { height: dimensions.plankThickness,
    wall: upperOptions.wall, clearance: clearanceOf(upperOptions) });
  const turnDownwardSnap = (part: Manifold, position: number) => part.rotate([0, 0, -90])
    .translate([position, dimensions.upperSupportCentre, plankBottom]);
  const plank = geo.diff(window(dimensions.plankMinimumX, dimensions.plankMaximumX,
    dimensions.plankMinimumY, dimensions.plankMaximumY, plankBottom, plankTop),
  [...lowerCuts, ...dimensions.shoeTabPositions.map(position => turnDownwardSnap(downwardSnap.slot, position))]);
  const upperPin = pinJoint(geo, { wall: upperOptions.wall, clearance: clearanceOf(upperOptions) });
  const shoe = geo.assemble([
    window(dimensions.shoeMinimumX, dimensions.shoeMaximumX,
      dimensions.upperSupportCentre - upperOptions.wall / 2,
      dimensions.upperSupportCentre + upperOptions.wall / 2, plankTop, upperBase),
    ...dimensions.shoeTabPositions.map(position => turnDownwardSnap(downwardSnap.tab, position)),
    upperPin.pin.translate([dimensions.pinPosition, dimensions.upperSupportCentre, upperBase]),
  ], [
    ...dimensions.shoeTabPositions.map(position => turnDownwardSnap(downwardSnap.relief, position)),
    upperPin.relief.translate([dimensions.pinPosition, dimensions.upperSupportCentre, upperBase]),
  ]);
  const upperTranslation: Vec3 = [0, dimensions.upperSupportCentre - upperDerived.py, upperBase];
  const upperWall = geo.isect(buildWallFeatures(geo, upperOptions, upperDerived, upperLane, 1,
    { ...wallFeatures, topPins: false }).translate(upperTranslation),
  window(dimensions.shoeMinimumX, dimensions.shoeMaximumX,
    dimensions.upperSupportCentre - 4, dimensions.upperSupportCentre + 4, upperBase, upperBase + 20));
  const upperDeck = geo.isect(buildDeck(geo, upperOptions, upperDerived, upperLane, ['none', 'none'])
    .translate(upperTranslation), window(dimensions.shoeMinimumX, dimensions.shoeMaximumX,
    dimensions.upperSupportCentre - 20, dimensions.upperSupportCentre + 4, upperBase, upperBase + 30));
  const wallPose = (centre: number): Pose => ({ rotate: [90, 0, 180], translate: [0, centre - upperOptions.wall / 2, 0] });
  const parts = [
    ...lowerWalls.map((standing, index) => ({ name: `lower-wall-${index + 1}`, standing,
      printable: lay(standing, wallPose(dimensions.lowerSupportCentres[index])) })),
    { name: 'transfer-plank', standing: plank, printable: plank.translate([0, 0, -plankBottom]) },
    { name: 'wall-shoe', standing: shoe, printable: lay(shoe, wallPose(dimensions.upperSupportCentre)) },
    { name: 'upper-wall-bottom', standing: upperWall, printable: lay(upperWall, wallPose(dimensions.upperSupportCentre)) },
    { name: 'upper-deck-ear', standing: upperDeck, printable: upperDeck.translate([0, 0, -upperBase]) },
  ];
  const partChecks = parts.map(part => {
    const unsupportedArea = overhangArea(part.printable), bodies = part.printable.decompose().length;
    requireCondition(part.printable.status() === 'NoError' && bodies === 1,
      `fit ${fit}/${part.name}: invalid or disconnected solid (${bodies} bodies)`);
    requireCondition(unsupportedArea < 1e-6, `fit ${fit}/${part.name}: unsupported area ${unsupportedArea}`);
    const mesh = meshDataOf(`fit-${fit}-${part.name}`, part.printable.getMesh());
    const degenerateFacets = inspectMesh(mesh, true);
    if (degenerateFacets) console.warn(`${mesh.name}: retaining ${degenerateFacets} zero-area kernel facets`);
    printableParts.push({ mesh, qty: 1 });
    return { name: part.name, bodies, unsupportedArea, degenerateFacets, volume: part.printable.volume(), bounds: bounds(part.printable) };
  });
  let maximumOverlap = 0;
  for (const [firstIndex, first] of parts.entries()) for (const second of parts.slice(firstIndex + 1)) {
    const volume = overlap(first.standing, second.standing);
    maximumOverlap = Math.max(maximumOverlap, volume);
    requireCondition(volume < 1e-5, `fit ${fit}: ${first.name}/${second.name} initial overlap ${volume}`);
  }
  const lowerBearingAreas = lowerWalls.map(wall => overlap(plank.translate([0, 0, -.01]), wall) / .01);
  const shoeBearingArea = overlap(shoe.translate([0, 0, -.01]), plank) / .01;
  const deckBearingArea = overlap(upperDeck.translate([0, 0, -.01]), shoe) / .01;
  const upperWallBearingArea = overlap(upperWall.translate([0, 0, -.01]), shoe) / .01;
  requireCondition(lowerBearingAreas.every(area => area > 100) && shoeBearingArea > 100
    && deckBearingArea > 1 && upperWallBearingArea > 1, `fit ${fit}: missing direct positive bearing`);
  const plankUpwardObstruction = lowerWalls.reduce((sum, wall) => sum + overlap(plank.translate([0, 0, .8]), wall), 0);
  const shoeUpwardObstruction = overlap(shoe.translate([0, 0, .8]), plank);
  const upperWallUpwardObstruction = overlap(upperWall.translate([0, 0, .8]), shoe);
  requireCondition(plankUpwardObstruction > .1 && shoeUpwardObstruction > .1 && upperWallUpwardObstruction > .1,
    `fit ${fit}: missing positive upward withdrawal obstruction`);
  const lowerGap = dimensions.lowerSupportCentres[1] - dimensions.lowerSupportCentres[0];
  requireCondition(shoe.boundingBox().min[2] >= plankBottom - 1e-6, `fit ${fit}: shoe tabs protrude below plank`);
  const rootFloor = dimensions.shoeHeight - (K.snapLen - pinSnap(clearanceOf(upperOptions)).peak);
  requireCondition(rootFloor >= K.ligMin, `fit ${fit}: upper pin root lacks ${K.ligMin} mm floor`);
  // A shorter support's pin can collide inside the unchanged socket. Exclude
  // that pin when measuring the missing wall-top bearing, and report its
  // unintended interference separately rather than calling it support.
  const lowerWallBody = geo.isect(lowerWalls[1], window(dimensions.plankMinimumX,
    dimensions.plankMaximumX, 196, 204, lowerLane.H - 20, lowerLane.H));
  const unequalHeightBearing = overlap(plank.translate([0, 0, -.01]), lowerWallBody.translate([0, 0, -2])) / .01;
  const unequalHeightPinCollision = overlap(plank, lowerWalls[1].translate([0, 0, -2]));
  const outsideSpanBearing = overlap(shoe.translate([0, 150, -.01]), plank) / .01;
  const rejectedFourMillimetreShoeRootFloor = 4 - (K.snapLen - pinSnap(clearanceOf(upperOptions)).peak);
  requireCondition(unequalHeightBearing < 1e-6 && outsideSpanBearing < 1e-6,
    `fit ${fit}: negative support controls unexpectedly have bearing`);
  requireCondition(rejectedFourMillimetreShoeRootFloor < K.ligMin,
    `fit ${fit}: four millimetre shoe root control no longer fails`);
  return { fit, dimensions, transitionHeight: upperBase - plankBottom, lowerGap,
    lowerRowHeight: lowerLane.H, upperRowHeight: upperLane.H,
    twoRowHeightWithoutTopCover: lowerLane.H + upperBase - plankBottom + upperLane.H,
    twoRowHeightWithOrdinaryTopCover: lowerLane.H + upperBase - plankBottom + upperLane.H + coverThicknessOf(upperOptions),
    upperWallPinRootFloor: rootFloor, shoeTabsMinimumZRelativeToPlankBed: shoe.boundingBox().min[2] - plankBottom,
    negativeControls: { unequalHeightBearing, unequalHeightPinCollision, outsideSpanBearing, rejectedFourMillimetreShoeRootFloor },
    maximumOverlap, lowerBearingAreas, shoeBearingArea, deckBearingArea, upperWallBearingArea,
    plankUpwardObstruction, shoeUpwardObstruction, upperWallUpwardObstruction, parts: partChecks };
}

try {
  const specimens = [-.2, 0, .3].map(fit => geo.arena(() => buildSpecimen(fit)));
  const plan = packPlan(printableParts, bed, 3, 6, keepOut);
  const project = join(directory, 'grid-row-transfer-coupon.3mf');
  const projectBytes = threeMf(plan, bed, { profile });
  await Bun.write(project, projectBytes);
  const report = { purpose: 'One-span actual-joint mechanical prototype; no grid feature or load claim',
    project, projectSha256: createHash('sha256').update(projectBytes).digest('hex'), sourceHashes,
    profile: { machine, process: picks.process, filament: filament.name, bed: 'High Temp Plate', dimensions: bed },
    specimens, placements: plan.placements, plates: 1 + Math.max(...plan.placements.map(placement => placement.plate)),
    notEstablished: [
      'No slicing, physical hand-fit, creep, load rating or full-row assembly qualification.',
      'A second plank beside a shared lower support needs an owned, directly bearing seam and complete catch skins; no unsupported through-T seam.',
      'Different lower wall heights require explicit levelling/support structure before a horizontal transfer plank can bear on both.',
      'Every required upper pin/ear station must be supported within actual lower wall depth and top material; this one coupon does not allocate arbitrary X stations.',
      'Upper support outside the lower support polygon, over bottom catch cavities, on a plank seam, or above a lower loading sweep requires redesign or rejection.',
      'One upper wall-edge coupon does not prove opposite-edge lateral restraint, whole-row torque, rear loading, or the complete 2-below/3-above layout.',
    ],
  };
  await Bun.write(join(directory, 'geometry.json'), JSON.stringify(report, null, 2));
  const log = `${specimens.length} fit cases; ${printableParts.length} connected support-free solids; ${report.plates} plates.\n`
    + specimens.map(specimen => `fit ${specimen.fit}: transition ${specimen.transitionHeight} mm, maximum initial overlap ${specimen.maximumOverlap} mm³, lower bearing ${specimen.lowerBearingAreas.join('/')} mm², shoe bearing ${specimen.shoeBearingArea} mm², deck bearing ${specimen.deckBearingArea} mm², withdrawal ${specimen.plankUpwardObstruction}/${specimen.shoeUpwardObstruction}/${specimen.upperWallUpwardObstruction} mm³`).join('\n')
    + `\nProject: ${project}\nGeometry only; slicing and physical qualification remain open.\n`;
  await Bun.write(join(directory, 'geometry.log'), log);
  console.log(log);
} catch (error) {
  await Bun.write(join(directory, 'failure.json'), JSON.stringify({ sourceHashes,
    message: error instanceof Error ? error.message : String(error), dimensions }, null, 2));
  throw error;
}
