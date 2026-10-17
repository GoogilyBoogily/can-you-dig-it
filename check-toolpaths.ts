// Check functional first-layer deposition in a recorded multi-seam export.
// Usage: bun check-toolpaths.ts [evidence.json] [sliced-directory] [report.json]
import { solve } from "./src/geometry";
const [evidencePath = ".slice/multiple-seams-20261017/lane-520-three-sections.json",
  sliced = ".slice/lane-520-three-sections-Ki0bgY",
  reportPath = ".slice/multiple-seams-fixes-20261017/toolpath-probes.json"] = Bun.argv.slice(2);
const evidence = await Bun.file(evidencePath).json();
const derived = solve(evidence.options);
if (derived.seams.length < 2) throw new Error("Toolpath evidence requires at least three printable sections");
const interiorPin = (derived.seams[0] + derived.seams[1]) / 2;
type Segment = { start: number[]; end: number[]; height: number; feature: string };
const paths = new Map<number, Segment[]>();
for (const plate of new Set<number>(evidence.placements.map((placement: { plate: number }) => placement.plate))) {
  const source = await Bun.file(`${sliced}/plate_${plate + 1}.gcode`).text();
  const sourceLines = source.split(/\r?\n/);
  for (const setting of ["enable_support = 0", "layer_height = 0.2", "line_width = 0.5", "sparse_infill_density = 100%", "hot_plate_temp = 60"])
    if (!sourceLines.includes(`; ${setting}`)) throw new Error(`Plate ${plate + 1}: missing ${setting}`);
  // Bambu's point_to_gcode subtracts extruder_offset. Restore model/plate
  // coordinates before comparing deposition with packed mesh probe positions.
  const offsetSetting = /^; extruder_offset = (.+)$/m.exec(source)?.[1];
  let extruderOffset = [0, 0];
  if (offsetSetting !== undefined) {
    const match = /^(-?[\d.]+)x(-?[\d.]+)$/.exec(offsetSetting.trim());
    if (!match || !match.slice(1).every(value => Number.isFinite(Number(value))))
      throw new Error(`Plate ${plate + 1}: unsupported extruder offsets: ${offsetSetting}`);
    extruderOffset = match.slice(1).map(Number);
  }
  let position = [0, 0, 0], relativeExtrusion = false, relativePosition = false, extrusion = 0, feature = "";
  const segments: Segment[] = [];
  function recordFirstLayer(start: number[], end: number[]) {
    // Clip a helical or linear Z transition to the sampled first-layer interval.
    let from = 0, to = 1;
    const change = end[2] - start[2];
    if (change) {
      const crossings = [(0 - start[2]) / change, (0.2001 - start[2]) / change].sort((left, right) => left - right);
      from = Math.max(from, crossings[0]); to = Math.min(to, crossings[1]);
    } else if (start[2] <= 0 || start[2] > 0.2001) return;
    if (from >= to) return;
    const at = (fraction: number) => [0, 1].map(axis => start[axis] + (end[axis] - start[axis]) * fraction + extruderOffset[axis]);
    const first = at(from), last = at(to);
    if (Math.hypot(last[0] - first[0], last[1] - first[1]) > 1e-6)
      segments.push({ start: first, end: last, height: start[2] + change * to, feature });
  }
  for (const line of sourceLines) {
    if (line.startsWith("; FEATURE:")) feature = line.slice(10).trim();
    if (line.startsWith(";")) continue;
    const command = line.split(";")[0].trim();
    if (/^M83\b/.test(command)) relativeExtrusion = true;
    if (/^M82\b/.test(command)) relativeExtrusion = false;
    if (/^G91(?:\s|$)/.test(command)) relativePosition = true;
    if (/^G90(?:\s|$)/.test(command)) relativePosition = false;
    if (/^G(?:18|19|90\.1|20|5(?:\.\d+)?)\b/.test(command))
      throw new Error(`Plate ${plate + 1}: unsupported motion mode: ${command}`);
    const values = Object.fromEntries([...command.matchAll(/([XYZEIJRP])(-?(?:\d+(?:\.\d*)?|\.\d+))/g)]
      .map(match => [match[1], Number(match[2])]));
    if (/^G92\b/.test(command)) {
      if (["X", "Y", "Z"].some(axis => values[axis] !== undefined))
        throw new Error(`Plate ${plate + 1}: unsupported coordinate reset: ${command}`);
      if (values.E !== undefined) extrusion = values.E;
    }
    if (!/^G[0123](?:\s|$)/.test(command)) continue;
    const next = ["X", "Y", "Z"].map((axis, index) => values[axis] === undefined ? position[index]
      : values[axis] + (relativePosition ? position[index] : 0));
    const deposited = values.E === undefined ? 0 : relativeExtrusion ? values.E : values.E - extrusion;
    if (values.E !== undefined) extrusion = relativeExtrusion ? extrusion + values.E : values.E;
    if (/^G[23](?:\s|$)/.test(command)) {
      // I/J are relative center offsets in the supported G17/G91.1 mode. Do not
      // treat an arc's chord as extrusion, or leave its end position/height stale.
      if (values.R !== undefined || (values.I === undefined && values.J === undefined)
        || (values.P !== undefined && values.P !== 1))
        throw new Error(`Plate ${plate + 1}: unsupported arc: ${command}`);
      const center = [position[0] + (values.I ?? 0), position[1] + (values.J ?? 0)];
      const radius = Math.hypot(position[0] - center[0], position[1] - center[1]);
      if (!radius) throw new Error(`Plate ${plate + 1}: zero-radius arc: ${command}`);
      const startAngle = Math.atan2(position[1] - center[1], position[0] - center[0]);
      const endAngle = Math.atan2(next[1] - center[1], next[0] - center[0]);
      let sweep = endAngle - startAngle;
      if (/^G2(?:\s|$)/.test(command)) { while (sweep >= 0) sweep -= 2 * Math.PI; }
      else { while (sweep <= 0) sweep += 2 * Math.PI; }
      if (deposited > 0 && feature !== "Custom") {
        const steps = Math.max(1, Math.ceil(Math.abs(sweep) * radius / 0.02));
        let previous = position;
        for (let step = 1; step <= steps; step++) {
          const fraction = step / steps, angle = startAngle + sweep * fraction;
          const end = step === steps ? next : [center[0] + radius * Math.cos(angle),
            center[1] + radius * Math.sin(angle), position[2] + (next[2] - position[2]) * fraction];
          recordFirstLayer(previous, end);
          previous = end;
        }
      }
    } else if (deposited > 0 && feature !== "Custom") recordFirstLayer(position, next);
    position = next;
  }
  if (!segments.length) throw new Error(`Plate ${plate + 1}: no deposition`);
  paths.set(plate, segments);
}
function distance(point: number[], segment: Segment) {
  const vector = segment.end.map((value, axis) => value - segment.start[axis]);
  const fraction = Math.max(0, Math.min(1, vector.reduce((sum, value, axis) => sum + value * (point[axis] - segment.start[axis]), 0)
    / vector.reduce((sum, value) => sum + value * value, 0)));
  return Math.hypot(...point.map((value, axis) => value - segment.start[axis] - fraction * vector[axis]));
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
      const nearest = firstLayer.reduce((nearest, segment) => Math.min(nearest, distance(transformed, segment)), Infinity);
      if (nearest > 0.27) throw new Error(`${probe.part}, plate ${placement.plate + 1}, ${point}: nearest deposited line ${nearest} mm`);
      return { localPoint: point, printerPoint: transformed, nearestCenterline: nearest };
    });
    report.push({ name: placement.name, plate: placement.plate + 1, purpose: probe.label, measurements });
  }
}
await Bun.write(reportPath, JSON.stringify({ slicer: "BambuStudio 02.08.02.61", sliced,
  method: "First-layer linear and I/J arc extrusion centerline distance <= 0.27 mm for nominal 0.5 mm bead; layer interval 0..0.2 mm. Single extruder_offset restored to model/plate coordinates. Arc sampling interval <= 0.02 mm; unsupported arc modes fail explicitly. Probe evidence only, not complete bead reconstruction or physical qualification.", report }, null, 2));
console.log(`Verified ${report.length} placed parts at ${report.reduce((sum, item) => sum + item.measurements.length, 0)} functional first-layer probes.`);
