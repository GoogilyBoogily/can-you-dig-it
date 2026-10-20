import Module from "manifold-3d";
import { estimateSettings, estimateVolume, type EstimateSettings } from "./estimate";
import { DENSITY, Geo, solve, buildAll, partList, type Options, type PartRole } from "./geometry";
import { inspectMesh, packPlan, threeMf, stlZip, meshDataOf, type MeshData, type PackedPlan, type Rect } from "./export";
import { buildMixedGeometry } from "./mixed-geometry";
import { buildIndependentRowsGeometry } from "./rows-geometry";
import type { IndependentRowsLayout } from "./rows";
import type { MixedLayout } from "./solver";

export type Req =
  | { type: "build"; id: number; options: Options; keepOut: Rect[]; estimateSettings?: EstimateSettings } // keepOut: the printer's bed_exclude_area
  | { type: "build-mixed"; id: number; layout: MixedLayout; keepOut: Rect[]; estimateSettings?: EstimateSettings }
  | { type: "build-rows"; id: number; layout: IndependentRowsLayout; keepOut: Rect[]; estimateSettings?: EstimateSettings }
  | { type: "estimate"; id: number; buildId: number; settings: EstimateSettings }
  | { type: "export"; id: number; buildId: number; format: "3mf" | "stl"; profile?: Uint8Array };

// solidGrams: the part printed 100 % dense, which the translucent settings do.
export interface PartOut { name: string; mesh: MeshData; qty: number; grams: number; solidGrams: number; role: PartRole }
export type Res =
  | { type: "built"; id: number; parts: PartOut[]; plan: PackedPlan; nplates: number; ms: number; estimateKey: string }
  | { type: "estimated"; id: number; buildId: number; grams: Record<string, number> }
  | { type: "file"; id: number; buildId: number; name: string; bytes: Uint8Array }
  // fatal: the kernel aborted (WebAssembly.RuntimeError) and this worker's module is
  // unusable for good; the page starts a fresh worker
  | { type: "error"; id: number; of: Req["type"]; message: string; fatal: boolean; buildId?: number };

const wasmP = Module({ locateFile: () => new URL("manifold.wasm", import.meta.url).href }).then((w) => { w.setup(); return w; });
// A load failure rejects before any message arrives; mark it handled here (the first
// request reports it) so the worker does not also raise an unhandled rejection.
wasmP.catch((err) => console.error("geometry engine failed to load", err));

let last: { id: number; parts: PartOut[]; plan: PackedPlan; bed: Options["bed"] } | null = null;
let buildGeneration = 0;

self.onmessage = async (e: MessageEvent<Req>) => {
  const req = e.data;
  const building = req.type === "build" || req.type === "build-mixed" || req.type === "build-rows";
  const generation = building ? ++buildGeneration : buildGeneration;
  if (building) last = null;
  try {
    const wasm = await wasmP.catch((err) => { throw new Error(`the geometry engine failed to load - reload the page (${err instanceof Error ? err.message : err})`); });
    if (req.type === "build" || req.type === "build-mixed" || req.type === "build-rows") {
      if (generation !== buildGeneration) return;
      const t0 = performance.now();
      const o = req.type === "build" ? req.options : req.type === "build-mixed"
        ? req.layout.stacks[0]?.options : req.layout.rows[0]?.lanes[0]?.options;
      if (!o) throw new Error(req.type === "build-rows" ? "Custom rows build has no lanes" : "Mixed build has no stacks");
      const bed = req.type === "build" ? o.bed : req.layout.request.shared.bed;
      const bedMargin = req.type === "build" ? o.bedMargin : req.layout.request.shared.bedMargin;
      const settings = req.estimateSettings ?? estimateSettings();
      const g = new Geo(wasm);
      // Every shape the build makes is freed when the arena closes: builds run on a 250 ms
      // debounce from the form, and the WASM heap does not come back on its own. Only plain
      // data leaves it - meshDataOf copies every vertex, and `last` holds those copies.
      const parts: PartOut[] = g.arena(() => (req.type === "build"
        ? partList(buildAll(g, o, solve(o)), o) : req.type === "build-mixed"
        ? buildMixedGeometry(g, req.layout) : buildIndependentRowsGeometry(g, req.layout)).map((p) => {
        const status = p.mesh.status();
        if (status !== "NoError") throw new Error(`${p.name}: kernel status ${status}`);
        if (p.mesh.decompose().length !== 1) throw new Error(`${p.name}: expected one connected printable part`);
        const mesh = meshDataOf(p.name, p.mesh.getMesh());
        const degenerateFacets = inspectMesh(mesh, true);
        if (degenerateFacets) console.info(`${p.name}: retained ${degenerateFacets} zero-area kernel faces to preserve topology`);
        return {
          name: p.name, mesh, qty: p.qty, role: p.role,
          grams: estimateVolume(p.mesh, settings) / 1000 * settings.density, solidGrams: p.mesh.volume() / 1000 * DENSITY,
        };
      }));
      const plan = packPlan(parts.map((p) => ({ mesh: p.mesh, qty: p.qty })), bed, bedMargin, undefined, req.keepOut);
      const nplates = plan.placements.reduce((count, placement) => Math.max(count, placement.plate + 1), 0);
      last = { id: req.id, parts, plan, bed };
      const res: Res = { type: "built", id: req.id, parts, plan, nplates, ms: performance.now() - t0, estimateKey: JSON.stringify(settings) };
      (self as any).postMessage(res); // copied, not transferred: the worker keeps `last` for export
    } else if (req.type === "estimate") {
      if (!last || last.id !== req.buildId) {
        (self as any).postMessage({ type: "estimated", id: req.id, buildId: req.buildId, grams: {} } satisfies Res);
        return;
      }
      const grams: Record<string, number> = {};
      for (const part of last.parts) {
        const mesh = new wasm.Manifold(new wasm.Mesh({ numProp: 3, vertProperties: part.mesh.pos, triVerts: part.mesh.idx }));
        try { grams[part.name] = estimateVolume(mesh, req.settings) / 1000 * req.settings.density; }
        finally { mesh.delete(); }
      }
      (self as any).postMessage({ type: "estimated", id: req.id, buildId: req.buildId, grams } satisfies Res);
    } else if (req.type === "export") {
      if (!last) throw new Error("nothing built yet");
      if (last.id !== req.buildId) throw new Error("Export belongs to an obsolete build; rebuild the organizer before exporting");
      const bytes = req.format === "3mf"
        ? threeMf(last.plan, last.bed, { profile: req.profile })
        : stlZip(last.parts.map((p) => p.mesh));
      const res: Res = { type: "file", id: req.id, buildId: last.id, name: req.format === "3mf" ? "can-system.3mf" : "can-system-stl.zip", bytes };
      (self as any).postMessage(res, [bytes.buffer]);
    }
  } catch (err) {
    console.error(err); // the message crosses to the page; the stack only lives here
    const message = err instanceof Error ? err.message : String(err);
    const fatal = err instanceof WebAssembly.RuntimeError;
    (self as any).postMessage({ type: "error", id: req.id, of: req.type, message, fatal,
      ...(req.type === "export" ? { buildId: req.buildId } : {}) } satisfies Res);
  }
};
