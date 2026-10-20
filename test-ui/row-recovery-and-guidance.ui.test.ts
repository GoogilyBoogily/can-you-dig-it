import { afterAll, beforeAll, expect, test } from "bun:test";
import { chromium, type Browser, type Page } from "playwright";
import { serveDist } from "../dev";
import type { IndependentRowRequest } from "../src/model";

let browser: Browser;
let server: ReturnType<typeof serveDist>;
let address: string;
const lane = { canDiameter: 66, canHeight: 122.5, depth: 240, slope: 3, lipGap: 5 };
const row = (overrides: Partial<IndependentRowRequest> = {}): IndependentRowRequest => ({
  lanes: [lane], repeat: 1, rowHeight: "auto", rowSpan: "auto", alignment: "centre", rearLoad: false, ...overrides,
});
const stacks = [122.5, 134].map(canHeight => ({ canDiameter: 66, canHeight, depth: 240, tiers: 1,
  cascade: false, cover: true, slope: 3, lipGap: 5, rearLoad: false, stackable: false }));
const preservedRows = [row({ lanes: [{ canDiameter: 53, canHeight: 80, depth: 240, slope: 2, lipGap: 4 }],
  alignment: "left", rearLoad: true })];

beforeAll(async () => {
  const exitCode = await Bun.spawn(["bun", "run", "build.ts"], { stdout: "ignore", stderr: "inherit" }).exited;
  if (exitCode !== 0) throw new Error("build.ts failed, cannot test row recovery");
  server = serveDist(0); address = `http://localhost:${server.port}/index.html`;
  browser = await chromium.launch();
});
afterAll(async () => { await browser?.close(); server?.stop(true); });
const rowParameters = (rows = preservedRows) => new URLSearchParams({ v: "5", mode: "rows", rows: JSON.stringify(rows),
  shareWalls: "off", topCover: "on", w: "600", d: "400", h: "500", front: "0" });
const mixedParameters = () => new URLSearchParams({ v: "4", mode: "mixed", stacks: JSON.stringify(stacks),
  shareWalls: "on", w: "290", d: "400", h: "500", front: "0", base: "flat" });
async function ready(page: Page) {
  await page.waitForSelector("#dl3mf:not([disabled])", { timeout: 90_000 });
  await page.waitForFunction(() => !/recalculating/i.test(document.querySelector("#estimateDetails")?.textContent ?? "recalculating"));
}
async function rejected(page: Page) {
  await page.waitForFunction(() => document.querySelector("#status")!.textContent!.includes("Couldn't read"), undefined, { timeout: 10_000 });
  expect(await page.isDisabled("#dl3mf")).toBe(true);
  expect(await page.isHidden("#results")).toBe(true);
}
async function hashParameters(page: Page) { return new URLSearchParams(new URL(page.url()).hash.slice(1)); }
async function expectPreservedEditor(page: Page) {
  expect(await page.locator(".custom-lane-card").count()).toBe(1);
  for (const [name, value] of Object.entries(preservedRows[0].lanes[0]))
    expect(await page.locator(`[data-lane-field="${name}"]`).inputValue()).toBe(String(value));
  expect(await page.locator('[data-row-field="alignment"]').inputValue()).toBe("left");
  expect(await page.locator('[data-row-field="rearLoad"]').isChecked()).toBe(true);
}

test("manual mode round trips retain sharing while incoming legacy links reset it", async () => {
  const page = await browser.newPage();
  try {
    await page.goto(`${address}#${mixedParameters()}`); await ready(page);
    for (const otherMode of ["rows", "uniform"]) {
      await page.selectOption("#buildMode", otherMode);
      await page.selectOption("#buildMode", "mixed");
      expect(await page.locator('[name="shareWalls"]').isChecked()).toBe(true);
      await ready(page);
      expect(await page.locator("#summary").innerText()).toContain("281.5 × 240.0");
    }
    for (const version of ["2", "3"]) {
      const incoming = mixedParameters(); incoming.set("v", version); incoming.set("w", "600");
      await page.goto(`${address}#${incoming}`); await ready(page);
      expect(await page.locator('[name="shareWalls"]').isChecked()).toBe(false);
    }
    await page.goto(`${address}#w=600&d=400&h=500&cascade=off`); await ready(page);
    await page.selectOption("#buildMode", "mixed");
    expect(await page.locator('[name="shareWalls"]').isChecked()).toBe(false);
  } finally { await page.close(); }
});

test("malformed row flags preserve valid rows and remain blocking until the affected checkbox is chosen", async () => {
  const page = await browser.newPage();
  try {
    for (const corruption of ["invalid sharing", "missing sharing", "duplicate sharing", "invalid cover"]) {
      const parameters = rowParameters();
      if (corruption === "invalid sharing") parameters.set("shareWalls", "true");
      if (corruption === "missing sharing") parameters.delete("shareWalls");
      if (corruption === "duplicate sharing") parameters.append("shareWalls", "on");
      if (corruption === "invalid cover") parameters.set("topCover", "true");
      await page.goto(`${address}#${parameters}`); await rejected(page); await expectPreservedEditor(page);
      const originalHash = new URL(page.url()).hash;
      await page.locator('[name="w"]').fill("601");
      await page.waitForTimeout(400);
      await rejected(page);
      expect(new URL(page.url()).hash).toBe(originalHash);
      if (corruption === "invalid cover") await page.uncheck('[name="rowsTopCover"]');
      else await page.check('[name="rowsShareWalls"]');
      await ready(page);
      await page.waitForFunction(() => new URLSearchParams(location.hash.slice(1)).get("w") === "601");
      const corrected = await hashParameters(page);
      expect(JSON.parse(corrected.get("rows")!)).toEqual(preservedRows);
      expect(corrected.getAll("shareWalls")).toEqual([corruption === "invalid cover" ? "off" : "on"]);
      expect(corrected.getAll("topCover")).toEqual([corruption === "invalid cover" ? "off" : "on"]);
    }
  } finally { await page.close(); }
});

test("each malformed flag needs its own explicit correction", async () => {
  const page = await browser.newPage();
  try {
    const parameters = rowParameters(); parameters.delete("shareWalls"); parameters.append("topCover", "off");
    await page.goto(`${address}#${parameters}`); await rejected(page);
    await page.check('[name="rowsShareWalls"]'); await page.waitForTimeout(400); await rejected(page);
    expect(await page.locator("#status").innerText()).toContain("topCover");
    await page.uncheck('[name="rowsTopCover"]'); await ready(page);
    expect(JSON.parse((await hashParameters(page)).get("rows")!)).toEqual(preservedRows);
  } finally { await page.close(); }
});

test("corrupt row JSON remains blocked across unrelated edits until explicit mode change", async () => {
  const page = await browser.newPage();
  try {
    const parameters = rowParameters(); parameters.set("rows", "{broken");
    await page.goto(`${address}#${parameters}`); await rejected(page);
    expect(await page.locator("#status").innerText()).toContain("Open a valid link or change Build mode to start a new design");
    const originalHash = new URL(page.url()).hash;
    await page.locator('[name="w"]').fill("601"); await page.waitForTimeout(400); await rejected(page);
    expect(new URL(page.url()).hash).toBe(originalHash);
    await page.selectOption("#buildMode", "uniform"); await ready(page);
    expect(await page.locator("#status").innerText()).not.toContain("Couldn't read");
  } finally { await page.close(); }
});

test("malformed flags survive mode round trips until their own checkbox changes", async () => {
  const page = await browser.newPage();
  try {
    for (const flag of ["shareWalls", "topCover"]) {
      const parameters = rowParameters(); parameters.set(flag, "true");
      await page.goto(`${address}#${parameters}`); await rejected(page);
      await page.selectOption("#buildMode", "uniform"); await ready(page);
      await page.selectOption("#buildMode", "rows"); await rejected(page);
      await expectPreservedEditor(page);
      if (flag === "shareWalls") await page.check('[name="rowsShareWalls"]');
      else await page.uncheck('[name="rowsTopCover"]');
      await ready(page);
      await page.waitForFunction(() => new URLSearchParams(location.hash.slice(1)).get("mode") === "rows");
      expect(JSON.parse((await hashParameters(page)).get("rows")!)).toEqual(preservedRows);
    }
    const parameters = mixedParameters(); parameters.set("shareWalls", "true");
    await page.goto(`${address}#${parameters}`); await rejected(page);
    await page.selectOption("#buildMode", "uniform"); await ready(page);
    await page.selectOption("#buildMode", "mixed"); await rejected(page);
    expect(await page.locator('[data-stack-field="canHeight"]').evaluateAll(inputs => inputs.map(input => (input as HTMLInputElement).value))).toEqual(["122.5", "134"]);
    await page.check('[name="shareWalls"]'); await ready(page);
    await page.waitForFunction(() => new URLSearchParams(location.hash.slice(1)).get("mode") === "mixed");
    expect(JSON.parse((await hashParameters(page)).get("stacks")!)).toEqual(stacks);
  } finally { await page.close(); }
});

test("malformed mixed JSON explains explicit recovery without promoting defaults", async () => {
  const page = await browser.newPage();
  try {
    const parameters = mixedParameters(); parameters.set("stacks", "{broken");
    await page.goto(`${address}#${parameters}`); await rejected(page);
    expect(await page.locator("#status").innerText()).toContain("Open a valid link or change Build mode to start a new design");
    await page.locator('[name="w"]').fill("601"); await page.waitForTimeout(400); await rejected(page);
    await page.selectOption("#buildMode", "uniform"); await ready(page);
  } finally { await page.close(); }
});

test("invalid v4 sharing preserves stack settings and blocks unrelated edits", async () => {
  const page = await browser.newPage();
  try {
    const parameters = mixedParameters(); parameters.set("shareWalls", "true");
    await page.goto(`${address}#${parameters}`); await rejected(page);
    expect(await page.locator('[data-stack-field="canHeight"]').evaluateAll(inputs => inputs.map(input => (input as HTMLInputElement).value))).toEqual(["122.5", "134"]);
    await page.locator('[name="w"]').fill("291"); await page.waitForTimeout(400); await rejected(page);
    await page.check('[name="shareWalls"]'); await ready(page);
    await page.waitForFunction(() => new URLSearchParams(location.hash.slice(1)).get("w") === "291");
    expect(JSON.parse((await hashParameters(page)).get("stacks")!)).toEqual(stacks);
  } finally { await page.close(); }
});

test("row source labels identify physical levels and assembly guidance follows physical boundaries", async () => {
  const page = await browser.newPage();
  try {
    await page.goto(`${address}#${rowParameters([row({ repeat: 2 }), row()])}`); await ready(page);
    const topPart = page.locator('#tabs button[data-key^="part:row-3-"]').first();
    expect(await topPart.innerText()).toContain("Level 3");
    expect(await topPart.innerText()).not.toContain("Row 3");
    await page.locator("footer details").evaluate(details => { (details as HTMLDetailsElement).open = true; });
    expect(await page.locator("#rowsAssembly").innerText()).toContain("carrier");
    const carrierStep = page.locator("#rowsAssembly li").filter({ hasText: "Join each front/rear carrier assembly" });
    const shoeStep = page.locator("#rowsAssembly li").filter({ hasText: "Fit every indicated docking shoe" });
    expect(await carrierStep.isVisible()).toBe(true);
    expect(await shoeStep.isVisible()).toBe(true);
    expect(await page.locator('[data-row-assembly="connections"]').isHidden()).toBe(true);
    expect(await page.locator('[data-row-assembly="shared"]').isHidden()).toBe(true);
    const malformed = rowParameters([row()]); malformed.set("shareWalls", "true");
    await page.goto(`${address}#${malformed}`); await rejected(page);
    expect(await carrierStep.isVisible()).toBe(false);
    expect(await shoeStep.isVisible()).toBe(false);
    await page.goto(`${address}#${rowParameters([row({ lanes: [lane, lane] })])}`); await ready(page);
    await page.locator("footer details").evaluate(details => { (details as HTMLDetailsElement).open = true; });
    expect(await page.locator('[data-row-assembly="connections"]').innerText()).toContain("retaining gates");
    expect(await page.locator('[data-row-assembly="connections"]').isHidden()).toBe(false);
    expect(await page.locator('[data-row-assembly="shared"]').isHidden()).toBe(true);
    const shared = rowParameters([row({ lanes: [lane, { ...lane, canHeight: 134 }] })]); shared.set("shareWalls", "on");
    expect(await carrierStep.isVisible()).toBe(false);
    expect(await shoeStep.isVisible()).toBe(false);
    await page.goto(`${address}#${shared}`); await ready(page);
    await page.locator("footer details").evaluate(details => { (details as HTMLDetailsElement).open = true; });
    expect(await page.locator('[data-row-assembly="shared"]').innerText()).toContain("shared divider");
    expect(await page.locator('[data-row-assembly="shared"]').innerText()).toContain("cover fingers");
    expect(await page.locator('[data-row-assembly="shared"]').isHidden()).toBe(false);
    expect(await page.locator('[data-row-assembly="connections"]').isHidden()).toBe(true);
    expect(await carrierStep.isVisible()).toBe(false);
    expect(await shoeStep.isVisible()).toBe(false);
    await page.goto(`${address}#${malformed}`); await rejected(page);
    expect(await page.locator('[data-row-assembly="shared"]').isHidden()).toBe(true);
    expect(await page.locator('[data-row-assembly="connections"]').isHidden()).toBe(true);
  } finally { await page.close(); }
});
