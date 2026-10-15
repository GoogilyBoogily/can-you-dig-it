import { zipSync, unzipSync, strToU8 } from "fflate";

export interface MeshData {
  name: string;
  pos: Float32Array;   // xyz triples
  idx: Uint32Array;    // triangle indices
  bbox: [number, number, number, number, number, number];
}

export interface Placement extends MeshData {
  plate: number; // 0-based; pos is already on the plate, there is nothing left to apply
  part: string; // the part this is a copy of, carried rather than parsed back out of `name`
}

/** A copy references shared geometry and applies a rigid +90 degree Z rotation before translation. */
export interface PackedPlacement {
  name: string;
  part: string;
  geometry: number;
  plate: number;
  rotation90: boolean;
  translation: [number, number, number];
  bbox: MeshData["bbox"];
}

export interface PackedPlan {
  geometries: MeshData[];
  placements: PackedPlacement[];
}

export function materializePlacement(mesh: MeshData, placement: PackedPlacement): Placement {
  const pos = new Float32Array(mesh.pos.length);
  const [translationX, translationY, translationZ] = placement.translation;
  for (let index = 0; index < pos.length; index += 3) {
    pos[index] = (placement.rotation90 ? -mesh.pos[index + 1] : mesh.pos[index]) + translationX;
    pos[index + 1] = (placement.rotation90 ? mesh.pos[index] : mesh.pos[index + 1]) + translationY;
    pos[index + 2] = mesh.pos[index + 2] + translationZ;
  }
  return { name: placement.name, part: placement.part, plate: placement.plate, pos, idx: mesh.idx, bbox: bboxOf(pos) };
}

/** Compatibility boundary for consumers that require baked Float32 coordinates. */
export function pack(parts: { mesh: MeshData; qty: number }[], bed: [number, number, number], margin: number, gap = 6, keepOut: Rect[] = []): Placement[] {
  const plan = packPlan(parts, bed, margin, gap, keepOut);
  return plan.placements.map((placement) => materializePlacement(plan.geometries[placement.geometry], placement));
}

/** Inspect the coordinates actually written. Zero-area faces can be emitted by the
 * kernel while preserving indexed manifold topology; report them, never drop faces. */
export function inspectMesh(mesh: { name: string; pos: ArrayLike<number>; idx: Uint32Array }, closed = false): number {
  const { name, pos, idx } = mesh;
  if (!pos.length || pos.length % 3 || !idx.length || idx.length % 3)
    throw new Error(`${name}: incomplete mesh coordinates or triangles`);
  for (let index = 0; index < pos.length; index++)
    if (!Number.isFinite(pos[index])) throw new Error(`${name}: non-finite coordinate at ${index}`);
  for (const index of idx)
    if (index >= pos.length / 3) throw new Error(`${name}: vertex index ${index} is out of bounds`);
  const edges = new Map<string, { count: number; direction: number; triangle: number }>();
  const parents = closed ? Int32Array.from({ length: idx.length / 3 }, (_, index) => index) : new Int32Array();
  const rootOf = (triangle: number): number => {
    while (parents[triangle] !== triangle) {
      parents[triangle] = parents[parents[triangle]];
      triangle = parents[triangle];
    }
    return triangle;
  };
  let degenerateFacets = 0, volumeTimesSix = 0;
  for (let triangle = 0; triangle < idx.length; triangle += 3) {
    const vertices = [idx[triangle], idx[triangle + 1], idx[triangle + 2]];
    const [first, second, third] = vertices.map((vertex) => vertex * 3);
    const firstX = pos[second] - pos[first], firstY = pos[second + 1] - pos[first + 1], firstZ = pos[second + 2] - pos[first + 2];
    const secondX = pos[third] - pos[first], secondY = pos[third + 1] - pos[first + 1], secondZ = pos[third + 2] - pos[first + 2];
    const normalX = firstY * secondZ - firstZ * secondY;
    const normalY = firstZ * secondX - firstX * secondZ;
    const normalZ = firstX * secondY - firstY * secondX;
    if (normalX === 0 && normalY === 0 && normalZ === 0) degenerateFacets++;
    // Use a nearby origin to avoid cancellation on translated plates.
    volumeTimesSix += (pos[first] - pos[0]) * normalX + (pos[first + 1] - pos[1]) * normalY + (pos[first + 2] - pos[2]) * normalZ;
    if (closed) for (let edge = 0; edge < 3; edge++) {
      const start = vertices[edge], end = vertices[(edge + 1) % 3];
      const key = `${Math.min(start, end)},${Math.max(start, end)}`;
      const record = edges.get(key) ?? { count: 0, direction: 0, triangle: triangle / 3 };
      parents[rootOf(triangle / 3)] = rootOf(record.triangle);
      record.count++; record.direction += start < end ? 1 : -1;
      edges.set(key, record);
    }
  }
  if (closed) {
    for (const [edge, record] of edges)
      if (record.count !== 2 || record.direction !== 0) throw new Error(`${name}: edge ${edge} is not oppositely paired`);
    if (!(volumeTimesSix > 0) || !Number.isFinite(volumeTimesSix)) throw new Error(`${name}: mesh has no positive finite volume`);
    const shells = new Map<number, number[]>();
    for (let triangle = 0; triangle < idx.length / 3; triangle++) {
      const root = rootOf(triangle);
      const shell = shells.get(root) ?? [];
      shell.push(triangle * 3);
      shells.set(root, shell);
    }
    // The normal generated part is one shell: no containment work is needed.
    if (shells.size > 1) inspectShellOrientation(name, pos, idx, [...shells.values()]);
  }
  return degenerateFacets;
}


/** Check material orientation by nesting depth: outside shells face out, cavities in,
 * and islands inside cavities out again. Like the indexed manifold check, this assumes
 * non-intersecting surfaces; it does not prove arbitrary meshes free of self-intersections.
 * Solid angles avoid ray/edge coincidences. Bounding boxes skip disjoint shell pairs. */
function inspectShellOrientation(name: string, positions: ArrayLike<number>, indices: Uint32Array, shells: number[][]): void {
  const records = shells.map((triangles) => {
    const origin = indices[triangles[0]] * 3;
    const bounds = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    let volumeTimesSix = 0;
    for (const triangle of triangles) {
      const vertices = [indices[triangle], indices[triangle + 1], indices[triangle + 2]].map((vertex) => vertex * 3);
      for (const vertex of vertices) for (let axis = 0; axis < 3; axis++) {
        bounds[axis] = Math.min(bounds[axis], positions[vertex + axis]);
        bounds[axis + 3] = Math.max(bounds[axis + 3], positions[vertex + axis]);
      }
      const [first, second, third] = vertices.map((vertex) => [0, 1, 2].map((axis) => positions[vertex + axis] - positions[origin + axis]));
      volumeTimesSix += first[0] * (second[1] * third[2] - second[2] * third[1])
        + first[1] * (second[2] * third[0] - second[0] * third[2])
        + first[2] * (second[0] * third[1] - second[1] * third[0]);
    }
    return { triangles, origin, bounds, volumeTimesSix };
  });
  for (const [shellIndex, shell] of records.entries()) {
    let depth = 0;
    for (const container of records) {
      if (container === shell || shell.bounds.some((value, axis) => axis < 3
        ? value < container.bounds[axis] : value > container.bounds[axis])) continue;
      let solidAngle = 0;
      for (const triangle of container.triangles) {
        const [first, second, third] = [0, 1, 2].map((corner) => [0, 1, 2].map((axis) =>
          positions[indices[triangle + corner] * 3 + axis] - positions[shell.origin + axis]));
        const firstLength = Math.hypot(...first), secondLength = Math.hypot(...second), thirdLength = Math.hypot(...third);
        const determinant = first[0] * (second[1] * third[2] - second[2] * third[1])
          + first[1] * (second[2] * third[0] - second[0] * third[2])
          + first[2] * (second[0] * third[1] - second[1] * third[0]);
        const dot = (left: number[], right: number[]) => left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
        solidAngle += 2 * Math.atan2(determinant, firstLength * secondLength * thirdLength
          + dot(first, second) * thirdLength + dot(second, third) * firstLength + dot(third, first) * secondLength);
      }
      if (!Number.isFinite(solidAngle)) throw new Error(`${name}: shell ${shellIndex} has indeterminate containment`);
      if (Math.abs(solidAngle) > 2 * Math.PI) depth++;
    }
    if (!Number.isFinite(shell.volumeTimesSix) || !(depth % 2 ? shell.volumeTimesSix < 0 : shell.volumeTimesSix > 0))
      throw new Error(`${name}: shell ${shellIndex} orientation does not match material nesting depth ${depth}`);
  }
}

export function bboxOf(pos: Float32Array): MeshData["bbox"] {
  const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pos.length; i += 3) {
    for (let k = 0; k < 3; k++) { if (pos[i + k] < b[k]) b[k] = pos[i + k]; if (pos[i + k] > b[3 + k]) b[3 + k] = pos[i + k]; }
  }
  return b as MeshData["bbox"];
}

/** A kernel mesh as flat xyz triples and triangle indices: what the packer, the file
 *  writers and the viewer take. Structural, so this file needs no manifold import. */
export function meshDataOf(name: string, mesh: { vertProperties: Float32Array; triVerts: Uint32Array; numProp: number; mergeFromVert?: Uint32Array; mergeToVert?: Uint32Array }): MeshData {
  const { vertProperties: props, numProp } = mesh;
  if (!Number.isInteger(numProp) || numProp < 3 || props.length % numProp)
    throw new Error(`${name}: invalid kernel vertex properties`);
  const count = props.length / numProp;
  const representatives = Uint32Array.from({ length: count }, (_, index) => index);
  const representativeOf = (vertex: number): number => {
    let root = vertex;
    while (representatives[root] !== root) root = representatives[root];
    while (representatives[vertex] !== vertex) {
      const next = representatives[vertex]; representatives[vertex] = root; vertex = next;
    }
    return root;
  };
  const from = mesh.mergeFromVert ?? [], to = mesh.mergeToVert ?? [];
  if (from.length !== to.length) throw new Error(`${name}: mismatched kernel vertex merges`);
  for (let index = 0; index < from.length; index++) {
    if (from[index] >= count || to[index] >= count) throw new Error(`${name}: invalid kernel vertex merge`);
    representatives[representativeOf(from[index])] = representativeOf(to[index]);
  }
  const positions: number[] = [];
  const compact = new Map<number, number>();
  const indices = mesh.triVerts.map((vertex) => {
    if (vertex >= count) throw new Error(`${name}: vertex index ${vertex} is out of bounds`);
    const root = representativeOf(vertex);
    let index = compact.get(root);
    if (index === undefined) {
      index = compact.size; compact.set(root, index);
      positions.push(props[root * numProp], props[root * numProp + 1], props[root * numProp + 2]);
    }
    return index;
  });
  const pos = new Float32Array(positions);
  const result = { name, pos, idx: indices, bbox: bboxOf(pos) };
  inspectMesh(result, true);
  return result;
}

const EPS = 1e-6;

/** A rectangle on the bed, x0 y0 x1 y1 from the front-left corner. */
export type Rect = [number, number, number, number];

/** Whether a box, moved by (dx, dy), comes within `clear` of any of `rects`. */
const hitsAny = (rects: Rect[], clear: number, [x0, y0, x1, y1]: Rect, dx = 0, dy = 0) =>
  rects.some(([kx0, ky0, kx1, ky1]) => x0 + dx < kx1 + clear - EPS && x1 + dx > kx0 - clear + EPS && y0 + dy < ky1 + clear - EPS && y1 + dy > ky0 - clear + EPS);

/** A row of parts across a plate. `height` is set by its first part and never grows. */
interface Shelf { depth: number; height: number; width: number }

/** Where one part ended up: which plate, which shelf, how far along it, and whether it was turned. */
interface Seat { name: string; mesh: MeshData; plate: number; shelf: Shelf; offsetAlongShelf: number; rotated: boolean }

/**
 * The first shelf on this plate with room for a part `alongX × alongY`, or a new shelf
 * behind the last one. Null when neither fits, which is the caller's signal to move to
 * the next plate.
 *
 * A shelf never grows past the height of the part that opened it. Parts arrive sorted
 * by Y extent descending, so the part that opens a shelf is the deepest that will ever
 * want it - letting shelves grow packs no configuration any tighter.
 */
function seatOnPlate(shelves: Shelf[], alongX: number, alongY: number, usableWidth: number, usableDepth: number, gap: number, keep: KeepOut): { shelf: Shelf; offsetAlongShelf: number } | null {
  for (const shelf of shelves) {
    const offsetAlongShelf = keep.along(shelf, shelf.width === 0 ? 0 : shelf.width + gap, alongX, shelf.height);
    if (offsetAlongShelf + alongX <= usableWidth + EPS && alongY <= shelf.height + EPS) return { shelf, offsetAlongShelf };
  }
  const last = shelves[shelves.length - 1];
  // a part too wide to slide past a keep-out opens its shelf behind it instead
  for (const depth of [last ? last.depth + last.height + gap : 0, ...keep.behind(last ? last.depth + last.height + gap : 0)]) {
    if (depth + alongY > usableDepth + EPS) return null;
    const shelf: Shelf = { depth, height: alongY, width: 0 };
    const offsetAlongShelf = keep.along(shelf, 0, alongX, alongY);
    if (offsetAlongShelf + alongX > usableWidth + EPS) continue;
    shelves.push(shelf);
    return { shelf, offsetAlongShelf };
  }
  return null;
}

/** The printer's keep-out areas (`bed_exclude_area`: an 18 × 28 mm corner on the X1 and
 *  P1 series, where the nozzle is wiped), which the slicer refuses to print over. Packing
 *  works in the plate's uncentred frame - shelf 0 at the front margin, offset 0 at the
 *  left - and keeps every part `margin` clear of them there, the same floor as the bed's
 *  edge, by sliding it along its shelf past one. Centring afterwards only moves a part
 *  where it stays clear, so the uncentred layout is always a valid fallback. */
interface KeepOut {
  along(shelf: Shelf, offset: number, alongX: number, bandHeight: number): number;
  /** Shelf depths past `from` that start clear behind a keep-out, nearest first. */
  behind(from: number): number[];
}
const keepOutFor = (rects: Rect[], margin: number): KeepOut => ({
  behind: (from) => rects.map((k) => k[3]).filter((depth) => depth > from).sort((a, b) => a - b),
  along(shelf, offset, alongX, bandHeight) {
    for (let moved = true; moved;) {
      moved = false;
      const box: Rect = [margin + offset, margin + shelf.depth, margin + offset + alongX, margin + shelf.depth + bandHeight];
      for (const [, , kx1] of rects.filter((k) => hitsAny([k], margin, box))) { offset = kx1; moved = true; /* the box starts at margin + offset: one margin past the keep-out */ }
    }
    return offset;
  },
});

/**
 * Shelf-pack into bed-sized plates, then centre what landed on each one.
 *
 * First fit across every plate opened so far, not just the newest: a part small enough
 * to sit behind a lane goes there instead of claiming a plate of its own. Each part is
 * tried flat and then turned 90°, so an end-lip that is 125 mm deep and would miss the
 * strip behind a lane fits it turned.
 *
 * Nothing is left in a corner. Each shelf is centred across the bed on its own width and
 * the stack of shelves is centred front to back, so a plate holding one 250 mm lane puts
 * it on the centreline. The margin stays a hard floor - centring only ever adds to it.
 *
 * `gap` is separation on the bed, not a clearance between parts that touch, so it does
 * not take `fit`. 6 mm is the top of the free range: plate counts are identical from
 * 1 mm to 6 mm and 8 mm costs a plate on a 300 x 300 bed, so growing it is not free.
 * Nor is shrinking it - Bambu's outer brim is 5 mm per side, and two brims across a
 * 6 mm gap meet, which comes off the plate as one joined part. Brim is off by default
 * and the packer cannot see the profile, so this is a floor to respect, not a check.
 */
export function packPlan(parts: { mesh: MeshData; qty: number }[], bed: [number, number, number], margin: number, gap = 6, keepOut: Rect[] = []): PackedPlan {
  if (!bed.every((dimension) => Number.isFinite(dimension) && dimension > 0)) throw new Error("bed dimensions must be finite and positive");
  if (!Number.isFinite(margin) || margin < 0 || !Number.isFinite(gap) || gap < 0 || bed[0] <= 2 * margin || bed[1] <= 2 * margin)
    throw new Error("bed margin and gap must leave a positive printable area");
  for (const rectangle of keepOut)
    if (!rectangle.every(Number.isFinite) || rectangle[2] < rectangle[0] || rectangle[3] < rectangle[1]) throw new Error("invalid bed keep-out rectangle");
  for (const { mesh, qty } of parts) {
    if (!Number.isSafeInteger(qty) || qty <= 0) throw new Error(`${mesh.name}: quantity must be a positive integer`);
    const bounds = bboxOf(mesh.pos);
    const dimensions = [0, 1, 2].map((axis) => bounds[axis + 3] - bounds[axis]);
    if (!dimensions.every((dimension) => Number.isFinite(dimension) && dimension >= 0)) throw new Error(`${mesh.name} has no geometry to pack - it came out of the kernel empty`);
    if (dimensions[2] > bed[2] + EPS) throw new Error(`${mesh.name}: height ${dimensions[2]} mm exceeds build height ${bed[2]} mm`);
    if (mesh.bbox.some((value, index) => value !== bounds[index])) throw new Error(`${mesh.name}: bounding box does not match mesh coordinates`);
  }
  const geometries = [...new Set(parts.map(({ mesh }) => mesh))];
  if (!keepOut.length) return { geometries, placements: packFrame(parts, geometries, bed, margin, gap, []) };
  // The packer fills a plate from the front-left, so a front-left keep-out costs the first
  // slot of every plate - four plates on some jobs. Pack in the frame turned so the
  // keep-out lands where the packer finishes, and mirror the placements back: the parts
  // move, none is turned or mirrored. Fewest plates wins, the plain frame on a tie.
  const [W, D] = bed;
  const frames = [[false, false], [false, true], [true, false], [true, true]].map(([fx, fy]) => {
    const flip = ([x0, y0, x1, y1]: Rect): Rect => [fx ? W - x1 : x0, fy ? D - y1 : y0, fx ? W - x0 : x1, fy ? D - y0 : y1];
    const placed = packFrame(parts, geometries, bed, margin, gap, keepOut.map(flip));
    const plates = placed.reduce((count, placement) => Math.max(count, placement.plate + 1), 0);
    return { plates, placed: placed.map((p) => {
      const [x0, y0] = flip([p.bbox[0], p.bbox[1], p.bbox[3], p.bbox[4]]);
      const dx = x0 - p.bbox[0], dy = y0 - p.bbox[1];
      if (!dx && !dy) return p;
      const translation: [number, number, number] = [p.translation[0] + dx, p.translation[1] + dy, p.translation[2]];
      const bbox: MeshData["bbox"] = [x0, y0, p.bbox[2], x0 + p.bbox[3] - p.bbox[0], y0 + p.bbox[4] - p.bbox[1], p.bbox[5]];
      return { ...p, translation, bbox };
    }) };
  });
  return { geometries, placements: frames.reduce((best, frame) => (frame.plates < best.plates ? frame : best)).placed };
}

function packFrame(parts: { mesh: MeshData; qty: number }[], geometries: MeshData[], bed: [number, number, number], margin: number, gap: number, keepOut: Rect[]): PackedPlacement[] {
  const keep = keepOutFor(keepOut, margin);
  const usableWidth = bed[0] - 2 * margin, usableDepth = bed[1] - 2 * margin;
  const flat: { name: string; mesh: MeshData }[] = [];
  for (const { mesh, qty } of parts)
    for (let k = 0; k < qty; k++) flat.push({ name: qty > 1 ? `${mesh.name}-${String(k + 1).padStart(2, "0")}` : mesh.name, mesh });
  flat.sort((a, b) => (b.mesh.bbox[4] - b.mesh.bbox[1]) - (a.mesh.bbox[4] - a.mesh.bbox[1]));

  // Place boxes first, vertices later: the extents are all the packing needs, and
  // holding off on the copy is what makes the centring below a pair of offsets.
  const plates: Shelf[][] = [];
  const seats: Seat[] = [];
  for (const { name, mesh } of flat) {
    const width = mesh.bbox[3] - mesh.bbox[0], depth = mesh.bbox[4] - mesh.bbox[1];
    // bboxOf seeds with +-Infinity and returns them for a mesh with no vertices, so width
    // is -Infinity. Every test below is a `>`, which -Infinity passes: the part seats, its
    // shelf width becomes -Infinity, and the centring drags every part already on that
    // shelf out to x = Infinity - a 3MF full of `Infinity` vertices, from one bad part
    // that is not the one that looks wrong.
    if (!Number.isFinite(width) || !Number.isFinite(depth))
      throw new Error(`${name} has no geometry to pack - it came out of the kernel empty`);
    const orientations: [number, number, boolean][] = [[width, depth, false], [depth, width, true]];
    let seat: Seat | null = null;
    // One past the last plate is a fresh one, opened only once every existing plate is full.
    for (let plate = 0; plate <= plates.length && !seat; plate++) {
      const shelves = plates[plate] ?? [];
      for (const [alongX, alongY, rotated] of orientations) {
        if (alongX > usableWidth + EPS || alongY > usableDepth + EPS) continue;
        const spot = seatOnPlate(shelves, alongX, alongY, usableWidth, usableDepth, gap, keep);
        if (!spot) continue;
        spot.shelf.width = spot.offsetAlongShelf + alongX;
        if (plate === plates.length) plates.push(shelves);
        seat = { name, mesh, plate, shelf: spot.shelf, offsetAlongShelf: spot.offsetAlongShelf, rotated };
        break;
      }
    }
    if (!seat)
      throw new Error(`${name} is ${width.toFixed(0)} × ${depth.toFixed(0)} mm and fits no plate on a ${bed[0]} × ${bed[1]} mm bed`);
    seats.push(seat);
  }

  // Centre, then move each plate's stack and each shelf only where every part stays clear
  // of the keep-outs: the nearest such shift to centred, with the uncentred layout the
  // packer checked as the fallback. No keep-outs, and this is plain centring.
  const alongOf = ({ mesh, rotated }: Seat) => {
    const bb = mesh.bbox;
    return rotated ? [bb[4] - bb[1], bb[3] - bb[0]] : [bb[3] - bb[0], bb[4] - bb[1]];
  };
  /** Where a seat sits with no centring: x0 y0 x1 y1. */
  const uncentred = (seat: Seat): Rect => {
    const [alongX, alongY] = alongOf(seat);
    const x0 = margin + seat.offsetAlongShelf, y0 = margin + seat.shelf.depth + (seat.shelf.height - alongY) / 2;
    return [x0, y0, x0 + alongX, y0 + alongY];
  };
  /** The shift in [0, 2 × centred] nearest centred that keeps `boxes` clear, 0 at worst. */
  const nearest = (centred: number, boxes: Rect[], axis: 0 | 1, dOther: number) => {
    const lo = axis, hi = axis + 2;
    const candidates = [centred, 0, ...boxes.flatMap((b) => keepOut.flatMap((k) => [k[hi] + margin - b[lo], k[lo] - margin - b[hi]]))]
      .filter((shift) => shift >= -EPS && shift <= 2 * centred + EPS)
      .sort((a, b) => Math.abs(a - centred) - Math.abs(b - centred));
    return candidates.find((shift) => boxes.every((b) => !hitsAny(keepOut, margin, b, axis === 0 ? shift : dOther, axis === 1 ? shift : dOther))) ?? 0;
  };
  const shelfShift = new Map<Shelf, number>();
  const plateShift = plates.map((shelves, plate) => {
    const last = shelves[shelves.length - 1];
    const onPlate = seats.filter((seat) => seat.plate === plate);
    const centredY = (usableDepth - (last.depth + last.height)) / 2;
    // the stack moves first, with every shelf where the packer left it; each shelf then
    // centres across the bed as far as it stays clear at that depth
    const dy = nearest(centredY, onPlate.map(uncentred), 1, 0);
    for (const shelf of shelves)
      shelfShift.set(shelf, nearest((usableWidth - shelf.width) / 2, onPlate.filter((seat) => seat.shelf === shelf).map(uncentred), 0, dy));
    return dy;
  });

  return seats.map((seat) => {
    const { name, mesh, plate, shelf, rotated } = seat;
    const bb = mesh.bbox;
    // Turning is +90° about Z (x' = -y, y' = x), so the turned box starts at -maxY, minX.
    const low = rotated ? [-bb[4], bb[0]] : [bb[0], bb[1]];
    const [x0, y0] = uncentred(seat);
    const dx = x0 + shelfShift.get(shelf)! - low[0];
    const dy = y0 + plateShift[plate] - low[1];
    const [alongX, alongY] = alongOf(seat);
    return { name, part: mesh.name, geometry: geometries.indexOf(mesh), plate, rotation90: rotated,
      translation: [dx, dy, -bb[2]] as [number, number, number],
      bbox: [low[0] + dx, low[1] + dy, 0, low[0] + dx + alongX, low[1] + dy + alongY, bb[5] - bb[2]] as MeshData["bbox"] };
  });
}

/**
 * What sits on a plate, biggest part first: `2x lane-deck, end-lip`. The Plates panel
 * and the 3MF plate name both come from here, so what the page says is on a plate is
 * what the slicer calls it. ASCII `x`, not `×`: Bambu Studio puts the plate name into
 * the gcode file it exports.
 */
export function plateSummary(items: { part: string }[]): string {
  const names = items.map((i) => i.part);
  return [...new Set(names)].map((nm) => { const c = names.filter((x) => x === nm).length; return c > 1 ? `${c}x ${nm}` : nm; }).join(", ");
}

// ---------------------------------------------------------------- Bambu plate grid
// PartPlate.hpp: compute_colum_count(n) = ceil(sqrt(n)); PartPlateList::compute_origin:
// col along +X, row along -Y, stride = bed * (1 + 1/5).
export function plateCols(n: number): number { const v = Math.sqrt(n), r = Math.round(v); return v > r ? r + 1 : r; }
export function plateOrigin(i: number, n: number, bed: [number, number, number]): [number, number] {
  const cols = plateCols(n);
  return [(i % cols) * bed[0] * 1.2, -Math.floor(i / cols) * bed[1] * 1.2];
}

// ---------------------------------------------------------------- STL
export function stlBinary(m: MeshData): Uint8Array {
  inspectMesh(m);
  const nt = m.idx.length / 3;
  const buf = new ArrayBuffer(84 + nt * 50);
  const dv = new DataView(buf);
  dv.setUint32(80, nt, true);
  let o = 84;
  const p = m.pos, ix = m.idx;
  for (let t = 0; t < nt; t++) {
    const a = ix[t * 3] * 3, b = ix[t * 3 + 1] * 3, c = ix[t * 3 + 2] * 3;
    const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
    const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    dv.setFloat32(o, nx, true); dv.setFloat32(o + 4, ny, true); dv.setFloat32(o + 8, nz, true); o += 12;
    for (const k of [a, b, c]) { dv.setFloat32(o, p[k], true); dv.setFloat32(o + 4, p[k + 1], true); dv.setFloat32(o + 8, p[k + 2], true); o += 12; }
    o += 2;
  }
  return new Uint8Array(buf);
}

export function stlZip(parts: MeshData[]): Uint8Array {
  const files: Record<string, Uint8Array> = {};
  for (const p of parts) { inspectMesh(p, true); files[`${p.name}.stl`] = stlBinary(p); }
  return zipSync(files, { level: 6 });
}

// ---------------------------------------------------------------- 3MF
const CT = `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="config" ContentType="text/xml"/></Types>`;
const RELS = `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>`;
const NS = "http://schemas.microsoft.com/3dmanufacturing/core/2015/02";

// Bambu Studio's importer (bbs_3mf.cpp, _handle_end_metadata) treats a 3MF as a
// project only when the Application metadata starts with "BambuStudio-", and reads
// the rest as the generator version. Any other name is a third-party file: it skips
// project_settings.config and reports "load geometry data only". So the file claims
// to come from Bambu Studio 2.0.0: new enough to dodge the legacy plate-size and
// prime-tower rewrites (< 1.5.9, < 2.0.0), old enough that no 2.x app calls it newer.
const BAMBU_IDENTITY = `<metadata name="Application">BambuStudio-02.00.00.00</metadata><metadata name="BambuStudio:3mfVersion">1</metadata>`;

const escapeXml = (value: string): string => value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character]!);

function objXml(id: number, m: MeshData, dx: number, dy: number, placement?: PackedPlacement): { xml: string; degenerateFacets: number } {
  const parts: string[] = [`<object id="${id}" type="model" name="${escapeXml(placement?.name ?? m.name)}"><mesh><vertices>`];
  // Only this serialization boundary bakes a copy, released after this object.
  const p = Float64Array.from(m.pos, (value, index) => {
    const axis = index % 3;
    const rotated = placement?.rotation90 && axis < 2 ? (axis === 0 ? -m.pos[index + 1] : m.pos[index - 1]) : value;
    return rotated + (placement?.translation[axis] ?? 0) + (axis === 0 ? dx : axis === 1 ? dy : 0);
  });
  const degenerateFacets = inspectMesh({ ...m, pos: p }, true);
  for (let i = 0; i < p.length; i += 3) parts.push(`<vertex x="${p[i]}" y="${p[i + 1]}" z="${p[i + 2]}"/>`);
  parts.push("</vertices><triangles>");
  const ix = m.idx;
  for (let i = 0; i < ix.length; i += 3) parts.push(`<triangle v1="${ix[i]}" v2="${ix[i + 1]}" v3="${ix[i + 2]}"/>`);
  parts.push("</triangles></mesh></object>");
  return { xml: parts.join(""), degenerateFacets };
}

const PROFILE = "Metadata/project_settings.config";

/**
 * Lift the print profile out of a 3MF the user saved from their slicer.
 * Returns the raw bytes: decoding them to a string and re-encoding on the way out
 * eats a UTF-8 BOM and mangles anything that is not UTF-8, so the profile the slicer
 * gets back would not be the one it wrote.
 */
export function extractProfile(bytes: Uint8Array): Uint8Array {
  // Inflate only the entry we want, and only if it is a plausible size: a 1 MB
  // zip of nested zeroes expands to gigabytes and takes the tab with it.
  let tooLarge = false;
  const entry = unzipSync(bytes, {
    filter: (f) => {
      if (f.name !== PROFILE) return false;
      tooLarge = f.originalSize! >= 4e6;
      return !tooLarge;
    },
  })[PROFILE];
  if (tooLarge) throw new Error(`${PROFILE} in that file is over 4 MB - no slicer profile is that big`);
  if (!entry) throw new Error(`no ${PROFILE} in that file - save a project from Bambu Studio or Orca, not an exported plate`);
  if (!entry.length) throw new Error(`${PROFILE} in that file is empty - the slicer may not have finished saving`);
  return entry;
}

/** Multi-plate Bambu/Orca project: geometry baked onto Bambu's plate grid + model_settings.config. */
export function threeMf(job: Placement[] | PackedPlan, bed: [number, number, number], opts: { profile?: Uint8Array } = {}): Uint8Array {
  // Bambu mesh_stat records repairs previously performed, not extant defects.
  // No repairs are performed here, so omit that optional provenance record.
  const { profile } = opts;
  const placed = Array.isArray(job) ? job : job.placements;
  if (!placed.length) throw new Error("cannot export an empty manufacturing job");
  if (!bed.every((dimension) => Number.isFinite(dimension) && dimension > 0)) throw new Error("bed dimensions must be finite and positive");
  for (const placement of placed) {
    if (!Number.isSafeInteger(placement.plate) || placement.plate < 0) throw new Error(`${placement.name}: invalid plate index`);
    let bounds: MeshData["bbox"];
    if ("pos" in placement) bounds = bboxOf(placement.pos);
    else {
      const mesh = (job as PackedPlan).geometries[placement.geometry];
      if (!mesh || !Number.isSafeInteger(placement.geometry)) throw new Error(`${placement.name}: invalid geometry reference`);
      if (typeof placement.rotation90 !== "boolean" || placement.translation.length !== 3 || !placement.translation.every(Number.isFinite))
        throw new Error(`${placement.name}: invalid rigid placement transform`);
      const source = bboxOf(mesh.pos);
      const [translationX, translationY, translationZ] = placement.translation;
      bounds = placement.rotation90
        ? [-source[4] + translationX, source[0] + translationY, source[2] + translationZ, -source[1] + translationX, source[3] + translationY, source[5] + translationZ]
        : [source[0] + translationX, source[1] + translationY, source[2] + translationZ, source[3] + translationX, source[4] + translationY, source[5] + translationZ];
      if (placement.bbox.some((value, index) => !Number.isFinite(value) || Math.abs(value - bounds[index]) > EPS))
        throw new Error(`${placement.name}: packed bounds do not match transformed geometry`);
    }
    if (!bounds.every(Number.isFinite)) throw new Error(`${placement.name}: geometry has non-finite bounds`);
    if (bounds[0] < -EPS || bounds[1] < -EPS || bounds[2] < -EPS || bounds[3] > bed[0] + EPS || bounds[4] > bed[1] + EPS || bounds[5] > bed[2] + EPS)
      throw new Error(`${placement.name}: geometry exceeds printable build volume`);
  }
  const nplates = placed.reduce((count, placement) => Math.max(count, placement.plate + 1), 0);
  const objs: string[] = [], build: string[] = [], cfg: string[] = [];
  const plates = new Map<number, number[]>(); // plate -> indices into placed; object id is index + 1
  placed.forEach((p, i) => {
    const id = i + 1;
    const [ox, oy] = plateOrigin(p.plate, nplates, bed);
    const object = "pos" in p ? objXml(id, p, ox, oy) : objXml(id, (job as PackedPlan).geometries[p.geometry], ox, oy, p);
    objs.push(object.xml);
    build.push(`<item objectid="${id}" transform="1 0 0 0 1 0 0 0 1 0 0 0" printable="1"/>`);
    cfg.push(`<object id="${id}"><metadata key="name" value="${escapeXml(p.name)}"/><metadata key="extruder" value="1"/><part id="${id}" subtype="normal_part"><metadata key="name" value="${escapeXml(p.name)}"/><metadata key="matrix" value="1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1"/></part></object>`);
    if (!plates.has(p.plate)) plates.set(p.plate, []);
    plates.get(p.plate)!.push(i);
  });
  for (const k of [...plates.keys()].sort((a, b) => a - b)) {
    const indices = plates.get(k)!;
    cfg.push(`<plate><metadata key="plater_id" value="${k + 1}"/><metadata key="plater_name" value="${escapeXml(plateSummary(indices.map((i) => placed[i])))}"/><metadata key="locked" value="false"/>`);
    for (const i of indices) cfg.push(`<model_instance><metadata key="object_id" value="${i + 1}"/><metadata key="instance_id" value="0"/></model_instance>`);
    cfg.push("</plate>");
  }
  const model = `<?xml version="1.0" encoding="UTF-8"?><model unit="millimeter" xml:lang="en-US" xmlns="${NS}">${BAMBU_IDENTITY}<resources>${objs.join("")}</resources><build>${build.join("")}</build></model>`;
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(CT),
    "_rels/.rels": strToU8(RELS),
    "3D/3dmodel.model": strToU8(model),
    "Metadata/model_settings.config": strToU8(`<?xml version="1.0" encoding="UTF-8"?><config>${cfg.join("")}</config>`),
  };
  if (profile !== undefined) files[PROFILE] = profile; // byte for byte, exactly as the slicer wrote it
  return zipSync(files, { level: 6 });
}
