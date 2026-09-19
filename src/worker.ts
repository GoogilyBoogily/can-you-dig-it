import Module from "manifold-3d";
import type { Manifold } from "manifold-3d";
import { DENSITY, Geo, solve, buildAll, partList, filamentGrams, type Options, type PartRole } from "./geometry";
import { pack, threeMf, stlZip, bboxOf, type MeshData, type Placement } from "./export";

export type Req =
  | { type: "build"; id: number; options: Options }
  | { type: "export"; id: number; format: "3mf" | "stl"; profile?: Uint8Array };

// solidGrams: the part printed 100 % dense, which the translucent settings do.
export interface PartOut { name: string; mesh: MeshData; qty: number; grams: number; solidGrams: number; role: PartRole }
export type Res =
  | { type: "built"; id: number; parts: PartOut[]; placed: Placement[]; nplates: number; ms: number }
  | { type: "file"; id: number; name: string; bytes: Uint8Array }
  | { type: "error"; id: number; of: Req["type"]; message: string };

const wasmP = Module({ locateFile: () => new URL("manifold.wasm", import.meta.url).href }).then((w) => { w.setup(); return w; });
// A load failure rejects before any message arrives; mark it handled here (the first
// request reports it) so the worker does not also raise an unhandled rejection.
wasmP.catch((err) => console.error("geometry engine failed to load", err));

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
    const wasm = await wasmP.catch((err) => { throw new Error(`the geometry engine failed to load - reload the page (${err instanceof Error ? err.message : err})`); });
    if (req.type === "build") {
      const t0 = performance.now();
      const o = req.options;
      const d = solve(o);
      const g = new Geo(wasm);
      const parts: PartOut[] = partList(buildAll(g, o, d), o).map((p) => ({
        name: p.name, mesh: toMesh(p.name, p.mesh), qty: p.qty, role: p.role,
        grams: filamentGrams(p.mesh), solidGrams: p.mesh.volume() / 1000 * DENSITY,
      }));
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
  } catch (err) {
    console.error(err); // the message crosses to the page; the stack only lives here
    const message = err instanceof Error ? err.message : String(err);
    (self as any).postMessage({ type: "error", id: req.id, of: req.type, message } satisfies Res);
  }
};
