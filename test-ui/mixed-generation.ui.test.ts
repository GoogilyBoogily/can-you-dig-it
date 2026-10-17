import { afterAll, beforeAll, expect, test } from "bun:test";
import { chromium, type Browser, type Page } from "playwright";
import { serveDist } from "../dev";

let browser: Browser;
let server: ReturnType<typeof serveDist>;
let address: string;

beforeAll(async () => {
  const result = await Bun.spawn(["bun", "run", "build.ts"], { stdout: "ignore", stderr: "inherit" }).exited;
  if (result !== 0) throw new Error("build.ts failed");
  server = serveDist(0); address = `http://localhost:${server.port}/index.html`;
  browser = await chromium.launch();
});
afterAll(async () => { await browser?.close(); server?.stop(true); });

async function ready(page: Page) {
  await page.waitForSelector("#dl3mf:not([disabled])", { timeout: 90_000 });
  expect(await page.locator("#status").textContent()).toContain("built in");
  const information = await page.evaluate(() => (window as unknown as { viewerInfo(): { geometries: number; instances: number } }).viewerInfo());
  expect(information.geometries).toBeGreaterThan(0);
  expect(information.instances).toBeGreaterThan(0);
}

test("every can preset completes generation in either mixed stack with automatic tiers and split parts", async () => {
  const page = await browser.newPage();
  const errors: string[] = [];
  // Generation must not depend on the availability of the remote font service.
  await page.route("https://fonts.googleapis.com/**", route => route.fulfill({ contentType: "text/css", body: "" }));
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  try {
    await page.goto(`${address}#w=500`, { waitUntil: "domcontentloaded" });
    await page.selectOption("#buildMode", "mixed"); await ready(page);
    for (const index of [0, 1]) {
      const card = page.locator(".stack-card").nth(index);
      for (const preset of ["66.3,115.2", "66,157", "53,134", "53.5,92", "66,122.5"]) {
        await card.locator('[data-stack-field="preset"]').selectOption(preset);
        expect(await page.isDisabled("#dl3mf")).toBe(true);
        await ready(page);
        const [diameter, height] = preset.split(",");
        expect(await page.locator(".stack-summary").nth(index).textContent()).toContain(`${diameter} mm diameter × ${height} mm height`);
        expect(await page.locator(".stack-summary").nth(1 - index).textContent()).toContain("66 mm diameter × 122.5 mm height");
        expect(await page.locator('#tabs [data-key="part:connection-1-spline"]').count()).toBe(1);
      }
    }
    expect(errors).toEqual([]);
  } finally { await page.close(); }
}, 120_000);

test("the reported two-tallboy design explains its required width and generates with its original operating and print settings", async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.route("https://fonts.googleapis.com/**", route => route.fulfill({ contentType: "text/css", body: "" }));
  const stack = { canDiameter: 66, canHeight: 157, depth: 480, tiers: "auto", slope: 5, lipGap: 20,
    cascade: false, cover: true, rearLoad: false, stackable: false };
  const fields = new URLSearchParams({ w: "300", d: "520", h: "240", front: "0", canD: "66", canL: "122.5",
    bedX: "256", bedY: "256", bedZ: "256", cascade: "off", cover: "on", rearLoad: "off", stackable: "off",
    left: "none", right: "none", solid: "off", design: "minimal", pattern: "hex", base: "flat", magnets: "off",
    across: "centre", along: "centre", hexR: "13", hexAuto: "on", slope: "5", lipGap: "20", fit: "0",
    v: "3", mode: "mixed", stacks: JSON.stringify([stack, stack]), machine: "Bambu Lab P2S 0.4 nozzle",
    process: "0.20mm Standard @BBL P2S", filament: "Bambu PETG Translucent @BBL P2S 0.4 nozzle" });
  try {
    await page.goto(`${address}#${fields}`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.getElementById("viewerMessage")?.textContent?.includes("356.0 mm"));
    expect(await page.isDisabled("#dl3mf")).toBe(true);
    await page.locator(".stage").screenshot({ path: "/tmp/cyd-reported-tallboys-width-error.png" });
    await page.waitForFunction(() => (document.getElementById("pickPrinter") as HTMLSelectElement).value === "Bambu Lab P2S");
    await page.fill('#form [name="w"]', "356"); await ready(page);
    expect(await page.isHidden("#viewerMessage")).toBe(true);
    expect(await page.locator(".stack-card").count()).toBe(2);
    for (const summary of await page.locator(".stack-summary").all()) {
      expect(await summary.textContent()).toContain("66 mm diameter × 157 mm height");
      expect(await summary.textContent()).toContain("480 mm");
      expect(await summary.textContent()).toContain("5°");
      expect(await summary.textContent()).toContain("20 mm");
    }
    expect((await page.locator("#viewer").boundingBox())!.height).toBeGreaterThanOrEqual(200);
    await page.locator(".stage").screenshot({ path: "/tmp/cyd-reported-tallboys-generated.png" });
  } finally { await page.close(); }
}, 120_000);

test("mixed part tabs leave room for the rendered assembly at laptop and phone sizes", async () => {
  const page = await browser.newPage();
  await page.route("https://fonts.googleapis.com/**", route => route.fulfill({ contentType: "text/css", body: "" }));
  try {
    await page.goto(`${address}#w=500`, { waitUntil: "domcontentloaded" });
    await page.selectOption("#buildMode", "mixed"); await ready(page);
    await page.locator('.stack-card [data-stack-field="preset"]').nth(0).selectOption("53,134"); await ready(page);
    const viewerHeights: { width: number; height: number; viewerHeight: number }[] = [];
    for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 720 }, { width: 1024, height: 768 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      await page.locator("#tabs button").last().focus();
      const tabs = await page.locator("#tabs").boundingBox();
      const lastTab = await page.locator("#tabs button").last().boundingBox();
      expect(lastTab!.y).toBeGreaterThanOrEqual(tabs!.y);
      expect(lastTab!.y + lastTab!.height).toBeLessThanOrEqual(tabs!.y + tabs!.height + 1);
      await page.locator('#tabs [data-key="assembly"]').click();
      const bounds = await page.locator("#viewer").boundingBox();
      expect(bounds, JSON.stringify(viewport)).not.toBeNull();
      viewerHeights.push({ ...viewport, viewerHeight: bounds!.height });
      await page.screenshot({ path: `/tmp/cyd-mixed-generation-${viewport.width}.png`, fullPage: true });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
    for (const size of viewerHeights) expect(size.viewerHeight, JSON.stringify(viewerHeights)).toBeGreaterThanOrEqual(200);
  } finally { await page.close(); }
}, 120_000);

test("a preset that exceeds the shelf explains the empty preview and rebuilding recovers without changing the stacks", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.route("https://fonts.googleapis.com/**", route => route.fulfill({ contentType: "text/css", body: "" }));
  try {
    await page.goto(address, { waitUntil: "domcontentloaded" });
    await page.selectOption("#buildMode", "mixed"); await ready(page);
    const firstPreset = page.locator('.stack-card [data-stack-field="preset"]').nth(0);
    await firstPreset.selectOption("66,157");
    expect(await page.isDisabled("#dl3mf")).toBe(true);
    expect(await page.isHidden("#results")).toBe(true);
    expect(await page.locator("#viewerMessage").isVisible()).toBe(true);
    expect(await page.locator("#viewerMessage").textContent()).toContain("321.5 mm of shelf width");
    expect(await page.locator("#viewerMessage").textContent()).toBe(await page.locator("#status").textContent());
    expect(await page.evaluate(() => (window as unknown as { viewerInfo(): { instances: number } }).viewerInfo().instances)).toBe(0);
    await page.screenshot({ path: "/tmp/cyd-mixed-generation-width-error.png", fullPage: true });
    await page.fill('#form [name="w"]', "322"); await ready(page);
    expect(await page.isHidden("#viewerMessage")).toBe(true);
    expect(await firstPreset.inputValue()).toBe("66,157");
    expect(await page.locator(".stack-summary").nth(0).textContent()).toContain("66 mm diameter × 157 mm height");
    expect(await page.locator(".stack-summary").nth(1).textContent()).toContain("66 mm diameter × 122.5 mm height");
    await page.screenshot({ path: "/tmp/cyd-mixed-generation-width-recovered.png", fullPage: true });
    await page.locator('.stack-card [data-stack-field="depth"]').nth(0).evaluate(element => {
      const input = element as HTMLInputElement;
      input.value = "300"; input.dispatchEvent(new Event("input", { bubbles: true }));
    }); await ready(page);
    await page.locator('.stack-card [data-stack-field="preset"]').nth(1).selectOption("53.5,92"); await ready(page);
    expect(await page.locator(".stack-summary").nth(0).textContent()).toContain("300 mm");
    expect(await page.locator(".stack-summary").nth(1).textContent()).toContain("480 mm");
    await page.locator('#tabs [data-key="part:connection-1-spline"]').click();
    expect(await page.locator('#tabs [data-key="part:connection-1-spline"]').getAttribute("aria-selected")).toBe("true");
    await page.locator('#tabs [data-key="assembly"]').click();
    await page.locator(".plates button").first().click();
    expect(await page.locator("#status").textContent()).not.toContain("Something went wrong");
  } finally { await page.close(); }
}, 120_000);
