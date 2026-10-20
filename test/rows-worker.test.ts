import { expect, test } from "bun:test";
import { mkdtemp, copyFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { strFromU8, unzipSync } from "fflate";
import { DEFAULTS, type IndependentRowsBuildRequest } from "../src/model";
import { resolveIndependentRows } from "../src/rows";
import { independentRowsPartManifest } from "../src/assembly";
import type { Req, Res } from "../src/worker";

test("custom rows publish one complete latest build and share atomic export ownership with other modes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "cyd-rows-worker-"));
  const bundle = await Bun.build({ entrypoints: [resolve("src/worker.ts")], outdir: directory, target: "browser", format: "esm",
    banner: "const instantiateKernel = WebAssembly.instantiate; WebAssembly.instantiate = async (...arguments_) => { await new Promise(resolve => setTimeout(resolve, 50)); return instantiateKernel(...arguments_); };" });
  expect(bundle.success).toBe(true);
  await copyFile("node_modules/manifold-3d/manifold.wasm", join(directory, "manifold.wasm"));
  const worker = new Worker(new URL(`file://${join(directory, "worker.js")}`), { type: "module" });
  const messages: Res[] = [], waiters = new Map<number, (response: Res) => void>();
  let failure: Error | undefined;
  worker.onmessage = (event: MessageEvent<Res>) => {
    messages.push(event.data); waiters.get(event.data.id)?.(event.data); waiters.delete(event.data.id);
  };
  worker.onerror = event => { failure = new Error(event.message); };
  const send = (request: Req) => new Promise<Res>((resolve, reject) => {
    const timeout = setTimeout(() => reject(failure ?? new Error(`Worker request ${request.id} timed out`)), 15000);
    waiters.set(request.id, response => { clearTimeout(timeout); resolve(response); });
    worker.postMessage(request);
  });
  const request: IndependentRowsBuildRequest = { shared: { ...DEFAULTS, base: "flat" }, shareCompatibleWalls: false,
    topCover: true, rows: [{ lanes: [{ canDiameter: 66, canHeight: 122.5, depth: 240, slope: 3, lipGap: 5 }],
      repeat: 2, rowHeight: "auto", rowSpan: "auto", alignment: "centre", rearLoad: false }] };
  const layout = resolveIndependentRows({ w: 300, d: 300, h: 300, front: 0 }, request);
  const settings = { shell: 1.26, infill: 1, density: 1.27, topSkin: 1, bottomSkin: 1, assumptions: [] };
  try {
    worker.postMessage({ type: "build-rows", id: 100, layout, keepOut: [], estimateSettings: settings } satisfies Req);
    const latest = await send({ type: "build-rows", id: 101, layout, keepOut: [], estimateSettings: settings });
    expect(latest.type).toBe("built");
    expect(messages.some(response => response.id === 100)).toBe(false);
    if (latest.type !== "built") throw new Error(`Custom row build failed: ${JSON.stringify(latest)}`);
    expect(latest.parts.map(({ name, qty }) => ({ name, qty })))
      .toEqual(independentRowsPartManifest(layout).map(({ name, qty }) => ({ name, qty })));
    expect(latest.plan.placements.length).toBe(latest.parts.reduce((count, part) => count + part.qty, 0));
    const exported = await send({ type: "export", id: 1, buildId: 101, format: "3mf" });
    expect(exported.type).toBe("file");
    if (exported.type === "file") {
      expect(exported.buildId).toBe(101);
      const model = strFromU8(unzipSync(exported.bytes)["3D/3dmodel.model"]);
      expect([...model.matchAll(/<item objectid="\d+"/g)]).toHaveLength(latest.plan.placements.length);
    }
    const estimated = await send({ type: "estimate", id: 2, buildId: 101, settings: { ...settings, density: 1.1 } });
    expect(estimated.type).toBe("estimated");
    if (estimated.type === "estimated") expect(Object.keys(estimated.grams).sort()).toEqual(latest.parts.map(part => part.name).sort());
    const invalid = structuredClone(layout);
    invalid.rows = [];
    const rejected = await send({ type: "build-rows", id: 3, layout: invalid, keepOut: [] });
    expect(rejected.type).toBe("error");
    if (rejected.type === "error") {
      expect(rejected.of).toBe("build-rows");
      expect(rejected.message).toContain("no lanes");
    }
    const unavailable = await send({ type: "export", id: 4, buildId: 101, format: "3mf" });
    expect(unavailable.type).toBe("error");
    if (unavailable.type === "error") expect(unavailable.message).toContain("nothing built");
    expect((await send({ type: "build-rows", id: 5, layout, keepOut: [] })).type).toBe("built");
    const uniform = { ...DEFAULTS, base: "flat" as const, cascade: false, lanesWide: 1, tiers: 1,
      length: 240, left: "none" as const, right: "none" as const };
    expect((await send({ type: "build", id: 6, options: uniform, keepOut: [] })).type).toBe("built");
    const obsolete = await send({ type: "export", id: 7, buildId: 5, format: "stl" });
    expect(obsolete.type).toBe("error");
    if (obsolete.type === "error") expect(obsolete.message).toContain("obsolete");
    const current = await send({ type: "export", id: 8, buildId: 6, format: "stl" });
    expect(current.type).toBe("file");
    if (current.type === "file") expect(current.buildId).toBe(6);
  } finally { worker.terminate(); }
}, 30000);
