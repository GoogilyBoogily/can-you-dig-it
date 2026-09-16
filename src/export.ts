import { zipSync, unzipSync, strToU8, strFromU8 } from "fflate";

export interface MeshData {
  name: string;
  pos: Float32Array;   // xyz triples
  idx: Uint32Array;    // triangle indices
  bbox: [number, number, number, number, number, number];
}

export interface Placement extends MeshData {
  plate: number;                 // 0-based
  offset: [number, number, number]; // translation applied to place on its plate (plate-local)
}

export function bboxOf(pos: Float32Array): MeshData["bbox"] {
  const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pos.length; i += 3) {
    for (let k = 0; k < 3; k++) { if (pos[i + k] < b[k]) b[k] = pos[i + k]; if (pos[i + k] > b[3 + k]) b[3 + k] = pos[i + k]; }
  }
  return b as MeshData["bbox"];
}

/** Shelf-pack into bed-sized plates (matches cansys.py pack()). Rotates 90° when that is the only way to fit. */
export function pack(parts: { mesh: MeshData; qty: number }[], bed: [number, number, number], margin: number, gap: number): Placement[] {
  const W = bed[0] - 2 * margin, D = bed[1] - 2 * margin;
  const flat: { name: string; mesh: MeshData }[] = [];
  for (const { mesh, qty } of parts)
    for (let k = 0; k < qty; k++) flat.push({ name: qty > 1 ? `${mesh.name}-${String(k + 1).padStart(2, "0")}` : mesh.name, mesh });
  flat.sort((a, b) => (b.mesh.bbox[4] - b.mesh.bbox[1]) - (a.mesh.bbox[4] - a.mesh.bbox[1]));
  const out: Placement[] = [];
  let plate = 0, cx = 0, cy = 0, rowh = 0;
  for (const { name, mesh } of flat) {
    const bb = mesh.bbox;
    let ex = bb[3] - bb[0], ey = bb[4] - bb[1];
    const rot = ex > W && ey <= W && ex <= D;
    let pos = mesh.pos;
    let lo: [number, number, number] = [bb[0], bb[1], bb[2]];
    if (rot) {
      [ex, ey] = [ey, ex];
      pos = new Float32Array(mesh.pos.length);
      for (let i = 0; i < pos.length; i += 3) { pos[i] = -mesh.pos[i + 1]; pos[i + 1] = mesh.pos[i]; pos[i + 2] = mesh.pos[i + 2]; }
      const b2 = bboxOf(pos); lo = [b2[0], b2[1], b2[2]];
    }
    if (ex > W + 1e-6 || ey > D + 1e-6)
      throw new Error(`${name} is ${ex.toFixed(0)} × ${ey.toFixed(0)} mm and fits no plate on a ${bed[0]} × ${bed[1]} mm bed`);
    if (cx + ex > W + 1e-6) { cx = 0; cy += rowh + gap; rowh = 0; }
    if (cy + ey > D + 1e-6) { plate++; cx = 0; cy = 0; rowh = 0; }
    const off: [number, number, number] = [margin + cx - lo[0], margin + cy - lo[1], -lo[2]];
    const placed = new Float32Array(pos.length);
    for (let i = 0; i < pos.length; i += 3) { placed[i] = pos[i] + off[0]; placed[i + 1] = pos[i + 1] + off[1]; placed[i + 2] = pos[i + 2] + off[2]; }
    out.push({ name, pos: placed, idx: mesh.idx, bbox: bboxOf(placed), plate, offset: off });
    cx += ex + gap; rowh = Math.max(rowh, ey);
  }
  return out;
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

/** Lift the print profile out of a 3MF the user saved from their slicer. */
export function extractProfile(bytes: Uint8Array): string {
  // Inflate only the entry we want, and only if it is a plausible size: a 1 MB
  // zip of nested zeroes expands to gigabytes and takes the tab with it.
  const entry = unzipSync(bytes, { filter: (f) => f.name === PROFILE && f.originalSize! < 4e6 })[PROFILE];
  if (!entry) throw new Error(`no ${PROFILE} in that file - save a project from Bambu Studio or Orca, not an exported plate`);
  if (!entry.length) throw new Error(`${PROFILE} in that file is empty - the slicer may not have finished saving`);
  return strFromU8(entry);
}

/** Multi-plate Bambu/Orca project: geometry baked onto Bambu's plate grid + model_settings.config. */
export function threeMf(placed: Placement[], bed: [number, number, number], opts: { single?: boolean; profile?: string } = {}): Uint8Array {
  const { single = false, profile } = opts;
  const nplates = single ? 1 : Math.max(...placed.map((p) => p.plate)) + 1;
  const objs: string[] = [], build: string[] = [], cfg: string[] = [];
  const plates = new Map<number, number[]>();
  placed.forEach((p, i) => {
    const id = i + 1;
    const [ox, oy] = single ? [0, 0] : plateOrigin(p.plate, nplates, bed);
    objs.push(objXml(id, p, ox, oy));
    build.push(`<item objectid="${id}" transform="1 0 0 0 1 0 0 0 1 0 0 0" printable="1"/>`);
    cfg.push(`<object id="${id}"><metadata key="name" value="${p.name}"/><metadata key="extruder" value="1"/><part id="${id}" subtype="normal_part"><metadata key="name" value="${p.name}"/><metadata key="matrix" value="1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1"/><mesh_stat edges_fixed="0" degenerate_facets="0" facets_removed="0" facets_reversed="0" backwards_edges="0"/></part></object>`);
    const k = single ? 0 : p.plate;
    if (!plates.has(k)) plates.set(k, []);
    plates.get(k)!.push(id);
  });
  for (const k of [...plates.keys()].sort((a, b) => a - b)) {
    cfg.push(`<plate><metadata key="plater_id" value="${k + 1}"/><metadata key="plater_name" value=""/><metadata key="locked" value="false"/>`);
    for (const id of plates.get(k)!) cfg.push(`<model_instance><metadata key="object_id" value="${id}"/><metadata key="instance_id" value="0"/></model_instance>`);
    cfg.push("</plate>");
  }
  const model = `<?xml version="1.0" encoding="UTF-8"?><model unit="millimeter" xml:lang="en-US" xmlns="${NS}"><metadata name="Application">cansys-web</metadata><resources>${objs.join("")}</resources><build>${build.join("")}</build></model>`;
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(CT),
    "_rels/.rels": strToU8(RELS),
    "3D/3dmodel.model": strToU8(model),
    "Metadata/model_settings.config": strToU8(`<?xml version="1.0" encoding="UTF-8"?><config>${cfg.join("")}</config>`),
  };
  if (profile !== undefined) files[PROFILE] = strToU8(profile);
  return zipSync(files, { level: 6 });
}
