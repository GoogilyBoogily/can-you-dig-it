import { test, expect } from "bun:test";
import { chromium } from "playwright";
import { DEFAULTS, solve, type Options } from "../src/geometry";
import { partManifest, PREVIEW_INSTANCE_LIMIT } from "../src/assembly";

test("maximum scale assembly allocates bounded instances and survives explode and view changes", async () => {
  const bundle = await Bun.build({ entrypoints: [new URL("../src/viewer.ts", import.meta.url).pathname], target: "browser" });
  if (!bundle.success) throw new Error(bundle.logs.map(String).join("\n"));
  const source = await bundle.outputs[0].text();
  const server = Bun.serve({ port: 0, fetch: (request) => new URL(request.url).pathname === "/viewer.js" ? new Response(source, { headers: { "Content-Type": "application/javascript" } }) : new Response('<div id="viewer" style="width:600px;height:500px"></div>', { headers: { "Content-Type": "text/html" } }) });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`http://localhost:${server.port}`);
    const options: Options = { ...DEFAULTS, cascade: false, canD: 20, canL: 40, length: 1900, tiers: 40, lanesWide: 35, slope: 0, bed: [1000, 1000, 1000] };
    const derived = solve(options);
    const manifest = partManifest(options, derived);
    const result = await page.evaluate(async ({ options, derived, manifest }) => {
      const { Viewer } = await import(`${location.origin}/viewer.js`);
      const viewer = new Viewer(document.getElementById("viewer")!);
      const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
      const indices = new Uint32Array([0, 1, 2]);
      const parts = manifest.map((part) => ({ ...part, grams: 0, solidGrams: 0, mesh: { name: part.name, pos: positions, idx: indices, bbox: [0, 0, 0, 1, 1, 0] } }));
      const summary = viewer.showAssembly(parts, options, derived);
      const first = viewer.info();
      viewer.explode(1); viewer.explode(0); viewer.showCans(false); viewer.showCans(true);
      viewer.showPart(parts[0], options.bed);
      viewer.showAssembly(parts, options, derived);
      const second = viewer.info();
      viewer.reset();
      return { summary, first, second, empty: viewer.info() };
    }, { options, derived, manifest });
    expect(result.summary.totalCans).toBeGreaterThan(100_000);
    expect(result.summary.sampled).toBe(true);
    expect(result.first.instances).toBeLessThanOrEqual(PREVIEW_INSTANCE_LIMIT + manifest.length);
    expect(result.first.objects).toBeLessThan(100);
    expect(result.second.instances).toBe(result.first.instances);
    expect(result.empty.instances).toBe(0);
    expect(errors).toEqual([]);
  } finally { await browser.close(); server.stop(true); }
}, 120_000);
