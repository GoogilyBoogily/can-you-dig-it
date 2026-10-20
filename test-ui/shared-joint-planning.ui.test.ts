import { afterAll, beforeAll, expect, test } from "bun:test";
import { chromium, type Browser } from "playwright";
import { strFromU8, unzipSync } from "fflate";
import { serveDist } from "../dev";

let browser: Browser;
let server: ReturnType<typeof serveDist>;
beforeAll(async () => {
  const exitCode = await Bun.spawn(["bun", "run", "build.ts"], { stdout: "ignore", stderr: "inherit" }).exited;
  if (exitCode !== 0) throw new Error("build.ts failed");
  server = serveDist(0);
  browser = await chromium.launch();
});
afterAll(async () => { await browser?.close(); server?.stop(true); });

function link(cascade = false, depth = 292.1) {
  const stacks = [122.5, 122.5, 157].map(canHeight => ({ canDiameter: 66, canHeight, depth,
    tiers: 2, slope: cascade ? 3 : 5, lipGap: 5, cascade, cover: true, rearLoad: false, stackable: false }));
  return `http://localhost:${server.port}/#${new URLSearchParams({ w: "457.2", d: String(depth), h: "241", front: "0",
    canD: "66", canL: "122.5", bedX: "256", bedY: "256", bedZ: "256", cascade: "on", cover: "on",
    rearLoad: "off", stackable: "off", left: "tongue", right: "socket", solid: "off", design: "minimal", pattern: "hex",
    base: "flat", magnets: "off", across: "centre", along: "centre", hexR: "13", hexAuto: "off", slope: "3", lipGap: "5",
    fit: "0", v: "4", mode: "mixed", stacks: JSON.stringify(stacks), shareWalls: "on",
    machine: "Bambu Lab P2S 0.4 nozzle", process: "0.20mm Standard @BBL P2S", filament: "Bambu PETG Translucent @BBL P2S 0.4 nozzle" })}`;
}

test("reported 292.1 mm link previews and exports the complete two-tier shared assembly", async () => {
  const page = await browser.newPage();
  try {
    await page.goto(link());
    await page.waitForSelector("#dl3mf:not([disabled])", { timeout: 90000 });
    expect(await page.locator("#summary").textContent()).toContain("24 cans in 3 stacks");
    expect(await page.locator("#summary").textContent()).toContain("436.5 × 292.1");
    expect(await page.locator("#wallSharingResult").textContent()).toContain("18.0 mm width saved");
    expect(await page.evaluate(() => (window as unknown as { viewerInfo(): { geometries: number } }).viewerInfo().geometries)).toBeGreaterThan(0);
    for (const card of await page.locator(".stack-card").all()) {
      expect(await card.locator('[data-stack-field="tiers"]').inputValue()).toBe("2");
      expect(await card.locator('[data-stack-field="cascade"]').isChecked()).toBe(false);
      expect(await card.locator('[data-stack-field="depth"]').inputValue()).toBe("292.1");
    }
    const completed = page.waitForEvent("download");
    await page.locator("#dl3mf").click();
    const stream = await (await completed).createReadStream();
    if (!stream) throw new Error("Missing 3MF download stream");
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    const files = unzipSync(new Uint8Array(Buffer.concat(chunks)));
    const model = strFromU8(files["3D/3dmodel.model"]), metadata = strFromU8(files["Metadata/model_settings.config"]);
    const settings = JSON.parse(strFromU8(files["Metadata/project_settings.config"]));
    expect([...model.matchAll(/<object /g)]).toHaveLength(68);
    expect([...model.matchAll(/<item /g)]).toHaveLength(68);
    expect([...metadata.matchAll(/<model_instance>/g)]).toHaveLength(68);
    expect(model).not.toContain("connection-1-spline");
    expect(model).not.toContain("connection-2-spline");
    expect(settings.printer_settings_id).toBe("Bambu Lab P2S 0.4 nozzle");
    expect(settings.filament_settings_id).toEqual(["Bambu PETG Translucent @BBL P2S 0.4 nozzle"]);
  } finally { await page.close(); }
});

test("unresolved sharing gives a manufacturing explanation and disables exports", async () => {
  const page = await browser.newPage();
  try {
    await page.goto(link(true, 279.4));
    await page.waitForFunction(() => document.querySelector("#status")?.textContent?.includes("planner could not find"));
    expect(await page.locator("#status").textContent()).toContain("fit your shelf with shared walls");
    expect(await page.locator("#status").textContent()).toContain("supports, cover clips and part splits");
    expect(await page.locator("#status").textContent()).toContain("462.5 mm");
    expect(await page.locator("#dl3mf").isDisabled()).toBe(true);
  } finally { await page.close(); }
});
