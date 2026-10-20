// Check functional first-layer deposition in a recorded multi-seam export.
// Usage: bun check-toolpaths.ts [evidence.json] [sliced-directory] [report.json]
import { parseDepositedSegments, distanceToSegment, type DepositedSegment } from "./prototypes/toolpath-deposition";
import { solve } from "./src/geometry";
const [evidencePath = ".slice/multiple-seams-20261017/lane-520-three-sections.json",
  sliced = ".slice/lane-520-three-sections-Ki0bgY",
  reportPath = ".slice/multiple-seams-fixes-20261017/toolpath-probes.json"] = Bun.argv.slice(2);
const evidence = await Bun.file(evidencePath).json();
const derived = solve(evidence.options);
if (derived.seams.length < 2) throw new Error("Toolpath evidence requires at least three printable sections");
const interiorPin = (derived.seams[0] + derived.seams[1]) / 2;
const paths = new Map<number, DepositedSegment[]>();
for (const plate of new Set<number>(evidence.placements.map((placement: { plate: number }) => placement.plate))) {
  const source = await Bun.file(`${sliced}/plate_${plate + 1}.gcode`).text();
  const sourceLines = source.split(/\r?\n/);
  for (const setting of ["enable_support = 0", "layer_height = 0.2", "line_width = 0.5", "sparse_infill_density = 100%", "hot_plate_temp = 60"])
    if (!sourceLines.includes(`; ${setting}`)) throw new Error(`Plate ${plate + 1}: missing ${setting}`);
  const segments = parseDepositedSegments(source, `Plate ${plate + 1}`, [0, 0.2001]);
  paths.set(plate, segments);
}
const probes: { part: string; label: string; points: number[][] }[] = [
  { part: "lane-deck-section-2", label: "interior T tongue, supporting root and opposite socket shoulders",
    points: [[derived.seams[0] - 5, 0], [derived.seams[0] + 3, 0], [derived.seams[1] - 5, -24], [derived.seams[1] - 5, 24]] },
  { part: "lane-wall-left-closed-section-2", label: "both interior pin roots and both seam frames",
    points: [[-interiorPin - 7.2, derived.H - 0.4], [-interiorPin + 7.2, derived.H - 0.4], [-derived.seams[0] - 2, derived.H / 3], [-derived.seams[1] + 2, derived.H / 3]] },
  { part: "seam-key", label: "two first-layer rails and both end bridges", points: [[3.5, -0.6], [3.5, 0.6], [-5.5, 0], [5.5, 0]] },
];
const report = [];
for (const probe of probes) {
  const placements = evidence.placements.filter((placement: any) => placement.part === probe.part);
  if (!placements.length) throw new Error(`No ${probe.part}`);
  for (const placement of placements) {
    const measurements = probe.points.map(point => {
      const transformed = [placement.rotation90 ? -point[1] : point[0], placement.rotation90 ? point[0] : point[1]]
        .map((value, axis) => value + placement.translation[axis]);
      const firstLayer = paths.get(placement.plate)!.filter(segment => segment.height > 0 && segment.height <= 0.2001);
      const nearest = firstLayer.reduce((nearest, segment) => Math.min(nearest, distanceToSegment(transformed, segment)), Infinity);
      if (nearest > 0.27) throw new Error(`${probe.part}, plate ${placement.plate + 1}, ${point}: nearest deposited line ${nearest} mm`);
      return { localPoint: point, printerPoint: transformed, nearestCenterline: nearest };
    });
    report.push({ name: placement.name, plate: placement.plate + 1, purpose: probe.label, measurements });
  }
}
await Bun.write(reportPath, JSON.stringify({ slicer: "BambuStudio 02.08.02.61", sliced,
  method: "First-layer linear and I/J arc extrusion centerline distance <= 0.27 mm for nominal 0.5 mm bead; layer interval 0..0.2 mm. Single extruder_offset restored to model/plate coordinates. Arc sampling interval <= 0.02 mm; unsupported arc modes fail explicitly. Probe evidence only, not complete bead reconstruction or physical qualification.", report }, null, 2));
console.log(`Verified ${report.length} placed parts at ${report.reduce((sum, item) => sum + item.measurements.length, 0)} functional first-layer probes.`);
