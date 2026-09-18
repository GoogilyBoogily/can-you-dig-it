import Module from "manifold-3d";
import type { Manifold } from "manifold-3d";
import { Geo, solve, buildAll, filamentGrams, type Options, type PartSet } from "./geometry";
import { pack, threeMf, stlZip, bboxOf, type MeshData, type Placement } from "./export";

export type Req =
  | { type: "build"; id: number; options: Options }
  | { type: "export"; id: number; format: "3mf" | "stl"; profile?: Uint8Array };

export interface PartOut { name: string; mesh: MeshData; qty: number; grams: number; role: "lane" | "lip" | "riser" | "cover" }
export type Res =
  | { type: "built"; id: number; parts: PartOut[]; placed: Placement[]; nplates: number; ms: number }
  | { type: "file"; id: number; name: string; bytes: Uint8Array }
  | { type: "error"; id: number; message: string };

const wasmP = Module({ locateFile: () => new URL("manifold.wasm", import.meta.url).href }).then((w) => { w.setup(); return w; });

function toMesh(name: string, m: Manifold): MeshData {
  const mg = m.getMesh();
  const pos = new Float32Array(mg.vertProperties.length / mg.numProp * 3);
  for (let i = 0, j = 0; i < mg.vertProperties.length; i += mg.numProp, j += 3) { pos[j] = mg.vertProperties[i]; pos[j + 1] = mg.vertProperties[i + 1]; pos[j + 2] = mg.vertProperties[i + 2]; }
  return { name, pos, idx: new Uint32Array(mg.triVerts), bbox: bboxOf(pos) };
}

let last: { parts: PartOut[]; placed: Placement[]; options: Options } | null = null;

self.onmessage = async (e: MessageEvent<Req>) => {
  const req = e.data;
  try {
    const wasm = await wasmP;
    if (req.type === "build") {
      const t0 = performance.now();
      const o = req.options;
      const d = solve(o);
      const g = new Geo(wasm);
      const set: PartSet = buildAll(g, o, d);
      const cascade = d.inset > 0;
      const nLip = o.lanesWide * (cascade ? 1 : o.tiers);
      const parts: PartOut[] = [];
      const add = (name: string, m: Manifold | undefined, qty: number, role: PartOut["role"]) => {
        if (!m || qty <= 0) return;
        parts.push({ name, mesh: toMesh(name, m), qty, grams: filamentGrams(m), role });
      };
      const qtyOf = { bottom: o.lanesWide, mid: o.lanesWide * Math.max(0, o.tiers - 2), top: cascade ? o.lanesWide : o.lanesWide * o.tiers };
      for (const ln of set.lanes) {
        const base = cascade ? `lane-${ln.role}` : "lane";
        add(base, ln.whole, qtyOf[ln.role], "lane");
        add(`${base}-front`, ln.front, qtyOf[ln.role], "lane");
        add(`${base}-rear`, ln.rear, qtyOf[ln.role], "lane");
      }
      add("end-lip", set.lip, nLip, "lip");
      if (o.feet) {
        add("riser-24", set.riser24, o.lanesWide * 4, "riser");
        add("riser-08", set.riser08, o.lanesWide * 4, "riser");
      }
      set.cover.forEach((m, i) => add(set.cover.length > 1 ? (i === 0 ? "cover-front" : "cover-rear") : "cover", m, o.lanesWide, "cover"));
      const placed = pack(parts.map((p) => ({ mesh: p.mesh, qty: p.qty })), o.bed, o.bedMargin);
      const nplates = Math.max(...placed.map((p) => p.plate)) + 1;
      last = { parts, placed, options: o };
      const res: Res = { type: "built", id: req.id, parts, placed, nplates, ms: performance.now() - t0 };
      (self as any).postMessage(res); // copied, not transferred: the worker keeps `last` for export
    } else if (req.type === "export") {
      if (!last) throw new Error("nothing built yet");
      const bytes = req.format === "3mf"
        ? threeMf(last.placed, last.options.bed, { profile: req.profile })
        : stlZip(last.parts.map((p) => p.mesh));
      const res: Res = { type: "file", id: req.id, name: req.format === "3mf" ? "can-system.3mf" : "can-system-stl.zip", bytes };
      (self as any).postMessage(res, [bytes.buffer]);
    }
  } catch (err: any) {
    (self as any).postMessage({ type: "error", id: req.id, message: String(err?.message ?? err) } satisfies Res);
  }
};
