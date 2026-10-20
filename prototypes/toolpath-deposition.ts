/** Shared Bambu motion interpretation for qualification scripts, not a bead/strength model. */
export interface DepositedSegment {
  start: number[];
  end: number[];
  height: number;
  startHeight: number;
  feature: string;
  layerTop: number | null;
  layerBottom: number | null;
}

/** XY centrelines in plate/model coordinates; nozzle heights are lower-exclusive.
 * Layer metadata describes the deposited slab, distinct from travel/nozzle height.
 */
export function parseDepositedSegments(source: string, context: string,
  nozzleHeightInterval: readonly [number, number] = [0, Infinity]): DepositedSegment[] {
  const sourceLines = source.split(/\r?\n/);
  // Bambu's point_to_gcode subtracts extruder_offset. Restore model/plate
  // coordinates before comparing deposition with packed mesh probe positions.
  const offsetSetting = /^; extruder_offset = (.+)$/m.exec(source)?.[1];
  let extruderOffset = [0, 0];
  if (offsetSetting !== undefined) {
    const match = /^(-?[\d.]+)x(-?[\d.]+)$/.exec(offsetSetting.trim());
    if (!match || !match.slice(1).every(value => Number.isFinite(Number(value))))
      throw new Error(`${context}: unsupported extruder offsets: ${offsetSetting}`);
    extruderOffset = match.slice(1).map(Number);
  }
  let position = [0, 0, 0], relativeExtrusion = false, relativePosition = false, extrusion = 0, feature = "";
  const segments: DepositedSegment[] = [];
  let layerTop: number | null = null, layerHeight: number | null = null;
  function recordDeposition(start: number[], end: number[]) {
    // Clip nozzle motion to the requested interval, including depositing Z transitions.
    let from = 0, to = 1;
    const change = end[2] - start[2];
    if (change) {
      const crossings = [(nozzleHeightInterval[0] - start[2]) / change, (nozzleHeightInterval[1] - start[2]) / change].sort((left, right) => left - right);
      from = Math.max(from, crossings[0]); to = Math.min(to, crossings[1]);
    } else if (start[2] <= nozzleHeightInterval[0] || start[2] > nozzleHeightInterval[1]) return;
    if (from >= to) return;
    const at = (fraction: number) => [0, 1].map(axis => start[axis] + (end[axis] - start[axis]) * fraction + extruderOffset[axis]);
    const first = at(from), last = at(to);
    if (Math.hypot(last[0] - first[0], last[1] - first[1]) > 1e-6)
      segments.push({ start: first, end: last, height: start[2] + change * to, startHeight: start[2] + change * from, feature,
        layerTop, layerBottom: layerTop === null || layerHeight === null ? null : layerTop - layerHeight });
  }
  for (const line of sourceLines) {
    const metadata = /^; (Z_HEIGHT|LAYER_HEIGHT): (.+)$/.exec(line);
    if (metadata) {
      const value = Number(metadata[2]);
      if (!Number.isFinite(value) || value <= 0) throw new Error(`${context}: invalid ${metadata[1]}: ${line}`);
      if (metadata[1] === "Z_HEIGHT") layerTop = value;
      else layerHeight = value;
    }
    if (line.startsWith("; FEATURE:")) feature = line.slice(10).trim();
    if (line.startsWith(";")) continue;
    const command = line.split(";")[0].trim();
    if (/^M83\b/.test(command)) relativeExtrusion = true;
    if (/^M82\b/.test(command)) relativeExtrusion = false;
    if (/^G91(?:\s|$)/.test(command)) relativePosition = true;
    if (/^G90(?:\s|$)/.test(command)) relativePosition = false;
    if (/^G(?:18|19|90\.1|20|5(?:\.\d+)?)\b/.test(command))
      throw new Error(`${context}: unsupported motion mode: ${command}`);
    const values = Object.fromEntries([...command.matchAll(/([XYZEIJRP])(-?(?:\d+(?:\.\d*)?|\.\d+))/g)]
      .map(match => [match[1], Number(match[2])]));
    if (/^G92\b/.test(command)) {
      if (["X", "Y", "Z"].some(axis => values[axis] !== undefined))
        throw new Error(`${context}: unsupported coordinate reset: ${command}`);
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
        throw new Error(`${context}: unsupported arc: ${command}`);
      const center = [position[0] + (values.I ?? 0), position[1] + (values.J ?? 0)];
      const radius = Math.hypot(position[0] - center[0], position[1] - center[1]);
      if (!radius) throw new Error(`${context}: zero-radius arc: ${command}`);
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
          recordDeposition(previous, end);
          previous = end;
        }
      }
    } else if (deposited > 0 && feature !== "Custom") recordDeposition(position, next);
    position = next;
  }
  if (!segments.length) throw new Error(`${context}: no deposition`);
  return segments;
}

export function distanceToSegment(point: number[], segment: DepositedSegment) {
  const vector = segment.end.map((value, axis) => value - segment.start[axis]);
  const fraction = Math.max(0, Math.min(1, vector.reduce((sum, value, axis) => sum + value * (point[axis] - segment.start[axis]), 0)
    / vector.reduce((sum, value) => sum + value * value, 0)));
  return Math.hypot(...point.map((value, axis) => value - segment.start[axis] - fraction * vector[axis]));
}

/** Select one material layer, preventing an XY match from another height or brim. */
export function depositionAtMaterialHeight(segments: DepositedSegment[], height: number): DepositedSegment[] {
  if (!Number.isFinite(height) || height <= 0) throw new Error(`Invalid material height ${height}`);
  return segments.filter(segment => segment.layerBottom !== null && segment.layerTop !== null
    && Math.abs(segment.height - segment.layerTop) <= 1e-4
    && Math.abs(segment.startHeight - segment.layerTop) <= 1e-4
    && height > segment.layerBottom + 1e-6 && height <= segment.layerTop + 1e-6
    && !/^(?:Custom|Brim|Skirt|Prime tower|Support)/i.test(segment.feature));
}
