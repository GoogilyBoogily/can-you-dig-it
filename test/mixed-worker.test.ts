import { expect, test } from "bun:test";
import { mkdtemp, copyFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DEFAULTS, type MixedBuildRequest } from "../src/model";
import { resolveMixedBuild } from "../src/solver";
import type { Req, Res } from "../src/worker";

// Exercise the real worker and kernel in an isolated bundle. Shared dist/ and the
// browser server are untouched, and no module mocks alter other geometry suites.
test("mixed worker publishes one complete build and rejects obsolete or failed-build exports", async () => {
  const directory = await mkdtemp(join(tmpdir(),"cyd-mixed-worker-"));
  const bundle = await Bun.build({entrypoints:[resolve("src/worker.ts")],outdir:directory,target:"browser",format:"esm",
    // Hold real WASM instantiation long enough to deliver two queued boot requests.
    // The kernel and all geometry remain real; only its completion timing changes.
    banner:"const instantiateKernel = WebAssembly.instantiate; WebAssembly.instantiate = async (...arguments_) => { await new Promise(resolve => setTimeout(resolve, 50)); return instantiateKernel(...arguments_); };",
  });
  expect(bundle.success).toBe(true);
  await copyFile("node_modules/manifold-3d/manifold.wasm",join(directory,"manifold.wasm"));
  const worker = new Worker(new URL(`file://${join(directory,"worker.js")}`),{type:"module"});
  const messages: Res[] = [];
  const waiters = new Map<number,(response:Res) => void>();
  let failure: Error | undefined;
  worker.onmessage = (event:MessageEvent<Res>) => { messages.push(event.data);waiters.get(event.data.id)?.(event.data);waiters.delete(event.data.id); };
  worker.onerror = (event) => { failure = new Error(event.message); };
  const send = (request:Req) => new Promise<Res>((resolve,reject) => {
    const timeout = setTimeout(() => reject(failure ?? new Error(`Worker request ${request.id} timed out`)),15000);
    waiters.set(request.id,(response) => {clearTimeout(timeout);resolve(response);});
    worker.postMessage(request);
  });
  const settings = {shell:1.26,infill:1,density:1.27,topSkin:1,bottomSkin:1,assumptions:[]};
  const request:MixedBuildRequest = {shared:{...DEFAULTS,base:"flat",cascade:false},stacks:[
    {canDiameter:66,canHeight:122.5,depth:300,tiers:1},
    {canDiameter:53,canHeight:134,depth:300,tiers:1},
  ]};
  const layout = resolveMixedBuild({w:500,d:500,h:300,front:40},request);
  try {
    worker.postMessage({type:"build-mixed",id:100,layout,keepOut:[],estimateSettings:settings} satisfies Req);
    const bootLatest = await send({type:"build-mixed",id:101,layout,keepOut:[],estimateSettings:settings});
    expect(bootLatest.type).toBe("built");
    expect(messages.some(({id}) => id === 100)).toBe(false);
    const built = await send({type:"build-mixed",id:1,layout,keepOut:[],estimateSettings:settings});
    expect(built.type).toBe("built");
    if (built.type !== "built") throw new Error(`Mixed worker failed: ${JSON.stringify(built)}`);
    expect(built.plan.placements.length).toBe(built.parts.reduce((count,part) => count + part.qty,0));
    expect(new Set(built.parts.map(({name}) => name)).size).toBe(built.parts.length);
    const exported = await send({type:"export",id:2,buildId:1,format:"3mf"});
    expect(exported.type).toBe("file");
    if (exported.type === "file") {expect(exported.buildId).toBe(1);expect(exported.bytes.length).toBeGreaterThan(1000);}
    const obsolete = await send({type:"export",id:3,buildId:0,format:"3mf"});
    expect(obsolete.type).toBe("error");
    if (obsolete.type === "error") {expect(obsolete.buildId).toBe(0);expect(obsolete.message).toContain("obsolete");}
    const badLayout = structuredClone(layout);
    badLayout.request.shared.bed = [1,1,1];
    const rejected = await send({type:"build-mixed",id:4,layout:badLayout,keepOut:[],estimateSettings:settings});
    expect(rejected.type).toBe("error");
    expect(messages.filter((message) => message.type === "built").map(({id}) => id)).toEqual([101,1]);
    const unavailable = await send({type:"export",id:5,buildId:1,format:"3mf"});
    expect(unavailable.type).toBe("error");
    if (unavailable.type === "error") expect(unavailable.message).toContain("nothing built");
    const recovered = await send({type:"build-mixed",id:6,layout,keepOut:[],estimateSettings:settings});
    expect(recovered.type).toBe("built");
    const stale = await send({type:"export",id:7,buildId:1,format:"stl"});
    expect(stale.type).toBe("error");
    const current = await send({type:"export",id:8,buildId:6,format:"stl"});
    expect(current.type).toBe("file");
    if (current.type === "file") expect(current.buildId).toBe(6);
  } finally { worker.terminate(); }
},30000);
