import { afterAll, beforeAll, expect, test } from "bun:test";
import { chromium, type Browser } from "playwright";
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

function link(width = "457.2") {
  const stacks = [122.5, 122.5, 157].map(canHeight => ({ canDiameter: 66, canHeight, depth: 279.4,
    tiers: "auto", cascade: true, slope: 3, lipGap: 5, cover: true, rearLoad: false, stackable: false }));
  return `http://localhost:${server.port}/#${new URLSearchParams({ v: "4", mode: "mixed", shareWalls: "on",
    stacks: JSON.stringify(stacks), w: width, d: "279.4", h: "241", front: "0", cascade: "on", cover: "on",
    design: "minimal", pattern: "hex", hexAuto: "off", hexR: "13", base: "flat", slope: "3", lipGap: "5" })}`;
}

test("reported narrow shelf explains why the selected shared-wall request retains both walls", async () => {
  const page = await browser.newPage();
  try {
    await page.goto(link());
    await page.waitForFunction(() => document.querySelector("#status")?.textContent?.includes("462.5 mm"));
    expect(await page.locator("#status").textContent()).toContain("Stacks 1 and 2 retain both walls");
    expect(await page.locator("#status").textContent()).toContain("Stacks 2 and 3 retain both walls");
    expect(await page.locator("#dl3mf").isDisabled()).toBe(true);
  } finally { await page.close(); }
});

test("Fixed 1 builds a single tier and preserves the optional multi-tier feeding choice", async () => {
  const page = await browser.newPage();
  try {
    await page.goto(link("500"));
    await page.waitForSelector("#dl3mf:not([disabled])", { timeout: 90000 });
    const card = page.locator(".stack-card").first();
    const feeding = card.locator('[data-stack-field="cascade"]');
    await card.locator('[data-stack-field="tierMode"]').selectOption("fixed");
    await card.locator('[data-stack-field="tiers"]').fill("1");
    await page.waitForFunction(() => {
      const stacks = JSON.parse(new URLSearchParams(location.hash.slice(1)).get("stacks")!);
      return stacks[0].tiers === 1 && stacks[0].cascade === false;
    });
    await page.waitForSelector("#dl3mf:not([disabled])", { timeout: 90000 });
    expect(await feeding.isChecked()).toBe(false);
    expect(await feeding.isDisabled()).toBe(true);
    expect(await card.locator("[data-stack-feeding-note]").textContent()).toContain("A single tier loads from the front");
    expect(await page.locator("#status").textContent()).not.toContain("Check your design");
    await card.locator('[data-stack-field="tiers"]').fill("2");
    expect(await feeding.isEnabled()).toBe(true);
    expect(await feeding.isChecked()).toBe(true);
    await page.waitForSelector("#dl3mf:not([disabled])", { timeout: 90000 });
  } finally { await page.close(); }
});

test("the reported shelf previews shared walls after all three stacks become single tiers", async () => {
  const page = await browser.newPage();
  try {
    await page.goto(link());
    await page.waitForFunction(() => document.querySelector("#status")?.textContent?.includes("462.5 mm"));
    for (let index = 0; index < 3; index++) {
      const card = page.locator(".stack-card").nth(index);
      await card.locator('[data-stack-field="tierMode"]').selectOption("fixed");
      await card.locator('[data-stack-field="tiers"]').fill("1");
    }
    await page.waitForFunction(() => {
      const stacks = JSON.parse(new URLSearchParams(location.hash.slice(1)).get("stacks")!);
      return stacks.every((stack: { tiers: number; cascade: boolean }) => stack.tiers === 1 && !stack.cascade);
    });
    await page.waitForSelector("#dl3mf:not([disabled])", { timeout: 90000 });
    expect(await page.locator("#status").textContent()).not.toContain("Check your design");
    expect(await page.locator("#wallSharingResult").textContent()).toContain("18.0 mm width saved");
    expect(await page.evaluate(() => (window as unknown as { viewerInfo(): { geometries: number } }).viewerInfo().geometries)).toBeGreaterThan(0);
  } finally { await page.close(); }
});
