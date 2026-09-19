import { zipSync, unzipSync, strToU8 } from "fflate";

export interface MeshData {
  name: string;
  pos: Float32Array;   // xyz triples
  idx: Uint32Array;    // triangle indices
  bbox: [number, number, number, number, number, number];
}

export interface Placement extends MeshData {
  plate: number; // 0-based; pos is already on the plate, there is nothing left to apply
}

export function bboxOf(pos: Float32Array): MeshData["bbox"] {
  const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pos.length; i += 3) {
    for (let k = 0; k < 3; k++) { if (pos[i + k] < b[k]) b[k] = pos[i + k]; if (pos[i + k] > b[3 + k]) b[3 + k] = pos[i + k]; }
  }
  return b as MeshData["bbox"];
}

const EPS = 1e-6;

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
function seatOnPlate(shelves: Shelf[], alongX: number, alongY: number, usableWidth: number, usableDepth: number, gap: number): { shelf: Shelf; offsetAlongShelf: number } | null {
  for (const shelf of shelves) {
    const offsetAlongShelf = shelf.width === 0 ? 0 : shelf.width + gap;
    if (offsetAlongShelf + alongX <= usableWidth + EPS && alongY <= shelf.height + EPS) return { shelf, offsetAlongShelf };
  }
  const last = shelves[shelves.length - 1];
  const depth = last ? last.depth + last.height + gap : 0;
  if (depth + alongY > usableDepth + EPS) return null;
  const shelf: Shelf = { depth, height: alongY, width: 0 };
  shelves.push(shelf);
  return { shelf, offsetAlongShelf: 0 };
}

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
export function pack(parts: { mesh: MeshData; qty: number }[], bed: [number, number, number], margin: number, gap = 6): Placement[] {
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
    const orientations: [number, number, boolean][] = [[width, depth, false], [depth, width, true]];
    let seat: Seat | null = null;
    // One past the last plate is a fresh one, opened only once every existing plate is full.
    for (let plate = 0; plate <= plates.length && !seat; plate++) {
      const shelves = plates[plate] ?? [];
      for (const [alongX, alongY, rotated] of orientations) {
        if (alongX > usableWidth + EPS || alongY > usableDepth + EPS) continue;
        const spot = seatOnPlate(shelves, alongX, alongY, usableWidth, usableDepth, gap);
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

  // One centring offset per plate, front to back; the across-bed one is per shelf.
  const frontPad = plates.map((shelves) => {
    const last = shelves[shelves.length - 1];
    return margin + (usableDepth - (last.depth + last.height)) / 2;
  });

  return seats.map(({ name, mesh, plate, shelf, offsetAlongShelf, rotated }) => {
    const bb = mesh.bbox;
    // Turning is -90° about Z (x' = -y, y' = x), so the turned box starts at -maxY, minX.
    const low = rotated ? [-bb[4], bb[0]] : [bb[0], bb[1]];
    const alongY = rotated ? bb[3] - bb[0] : bb[4] - bb[1];
    const dx = margin + (usableWidth - shelf.width) / 2 + offsetAlongShelf - low[0];
    const dy = frontPad[plate] + shelf.depth + (shelf.height - alongY) / 2 - low[1];
    const pos = new Float32Array(mesh.pos.length);
    for (let i = 0; i < pos.length; i += 3) {
      pos[i] = (rotated ? -mesh.pos[i + 1] : mesh.pos[i]) + dx;
      pos[i + 1] = (rotated ? mesh.pos[i] : mesh.pos[i + 1]) + dy;
      pos[i + 2] = mesh.pos[i + 2] - bb[2];
    }
    return { name, pos, idx: mesh.idx, bbox: bboxOf(pos), plate };
  });
}

/** The part a placed copy came from: `lane-deck-02` → `lane-deck`. */
export const stripCopy = (name: string) => name.replace(/-\d{2}$/, "");

/**
 * What sits on a plate, biggest part first: `2x lane-deck, end-lip`. The Plates panel
 * and the 3MF plate name both come from here, so what the page says is on a plate is
 * what the slicer calls it. ASCII `x`, not `×`: Bambu Studio puts the plate name into
 * the gcode file it exports.
 */
export function plateSummary(items: Placement[]): string {
  const names = items.map((i) => stripCopy(i.name));
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
  for (const p of parts) files[`${p.name}.stl`] = stlBinary(p);
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

function objXml(id: number, m: MeshData, dx: number, dy: number): string {
  const parts: string[] = [`<object id="${id}" type="model" name="${m.name}"><mesh><vertices>`];
  const p = m.pos;
  for (let i = 0; i < p.length; i += 3) parts.push(`<vertex x="${(p[i] + dx).toFixed(4)}" y="${(p[i + 1] + dy).toFixed(4)}" z="${p[i + 2].toFixed(4)}"/>`);
  parts.push("</vertices><triangles>");
  const ix = m.idx;
  for (let i = 0; i < ix.length; i += 3) parts.push(`<triangle v1="${ix[i]}" v2="${ix[i + 1]}" v3="${ix[i + 2]}"/>`);
  parts.push("</triangles></mesh></object>");
  return parts.join("");
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
  const entry = unzipSync(bytes, { filter: (f) => f.name === PROFILE && f.originalSize! < 4e6 })[PROFILE];
  if (!entry) throw new Error(`no ${PROFILE} in that file - save a project from Bambu Studio or Orca, not an exported plate`);
  if (!entry.length) throw new Error(`${PROFILE} in that file is empty - the slicer may not have finished saving`);
  return entry;
}

/** Multi-plate Bambu/Orca project: geometry baked onto Bambu's plate grid + model_settings.config. */
export function threeMf(placed: Placement[], bed: [number, number, number], opts: { profile?: Uint8Array } = {}): Uint8Array {
  const { profile } = opts;
  const nplates = Math.max(...placed.map((p) => p.plate)) + 1;
  const objs: string[] = [], build: string[] = [], cfg: string[] = [];
  const plates = new Map<number, number[]>(); // plate -> indices into placed; object id is index + 1
  placed.forEach((p, i) => {
    const id = i + 1;
    const [ox, oy] = plateOrigin(p.plate, nplates, bed);
    objs.push(objXml(id, p, ox, oy));
    build.push(`<item objectid="${id}" transform="1 0 0 0 1 0 0 0 1 0 0 0" printable="1"/>`);
    cfg.push(`<object id="${id}"><metadata key="name" value="${p.name}"/><metadata key="extruder" value="1"/><part id="${id}" subtype="normal_part"><metadata key="name" value="${p.name}"/><metadata key="matrix" value="1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1"/><mesh_stat edges_fixed="0" degenerate_facets="0" facets_removed="0" facets_reversed="0" backwards_edges="0"/></part></object>`);
    if (!plates.has(p.plate)) plates.set(p.plate, []);
    plates.get(p.plate)!.push(i);
  });
  for (const k of [...plates.keys()].sort((a, b) => a - b)) {
    const indices = plates.get(k)!;
    cfg.push(`<plate><metadata key="plater_id" value="${k + 1}"/><metadata key="plater_name" value="${plateSummary(indices.map((i) => placed[i]))}"/><metadata key="locked" value="false"/>`);
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
