import { afterAll, beforeAll, expect, test } from "bun:test";
import { chromium, type Browser, type Page } from "playwright";
import { serveDist } from "../dev";

let browser: Browser;
let server: ReturnType<typeof serveDist>;
let address: string;

beforeAll(async () => {
  const result = await Bun.spawn(["bun", "run", "build.ts"], { stdout: "ignore", stderr: "inherit" }).exited;
  if (result !== 0) throw new Error("build.ts failed");
  server = serveDist(0);
  address = `http://localhost:${server.port}/index.html`;
  browser = await chromium.launch();
});
afterAll(async () => { await browser?.close(); server?.stop(true); });

function link(fields: Record<string, string> = {}) {
  const stacks = [
    { canDiameter: 66, canHeight: 122.5, depth: 240, tiers: 1, cascade: false },
    { canDiameter: 53, canHeight: 134, depth: 200, tiers: 1, cascade: false },
  ];
  return `${address}#${new URLSearchParams({ v: "3", mode: "mixed", stacks: JSON.stringify(stacks),
    w: "500", d: "520", h: "400", front: "0", bedX: "1000", bedY: "1000", bedZ: "1000",
    cascade: "off", cover: "off", slope: "0", ...fields })}`;
}
const stack = (page: Page, index: number) => page.locator(".stack-card").nth(index);
const depth = (page: Page, index: number) => stack(page, index).locator('[data-stack-field="depth"]');
async function ready(page: Page) {
  await page.waitForFunction(() => !document.getElementById("results")!.hidden
    && !(document.getElementById("dl3mf") as HTMLButtonElement).disabled
    && !document.getElementById("status")!.classList.contains("busy")
    && !/recalculating/i.test(document.getElementById("summary")!.textContent!));
}

test("stack depths are keyboard sliders with individual one-can bounds and live millimetre readouts", async () => {
  const page = await browser.newPage();
  try {
    await page.goto(link()); await ready(page);
    expect(await page.getByRole("slider", { name: "Container depth", exact: true }).count()).toBe(2);
    expect(await depth(page, 0).evaluate(element => (element as HTMLInputElement).labels?.[0].control === element)).toBe(true);
    expect(await depth(page, 0).getAttribute("type")).toBe("range");
    // The printed joints need more room than a single can and its stops for these sizes.
    expect(await depth(page, 0).getAttribute("min")).toBe("112.6");
    expect(await depth(page, 1).getAttribute("min")).toBe("112.6");
    expect(await depth(page, 0).getAttribute("max")).toBe("520");
    await depth(page, 0).focus(); await page.keyboard.press("Home");
    expect(await depth(page, 0).inputValue()).toBe("112.6");
    expect(await stack(page, 0).locator("[data-stack-depth-value]").textContent()).toBe("112.6 mm");
    await ready(page);
    await page.keyboard.press("ArrowRight");
    expect(await depth(page, 0).inputValue()).toBe("112.7");
    expect(await depth(page, 0).getAttribute("aria-valuetext")).toBe("112.7 millimetres");
    await page.keyboard.press("End");
    expect(await depth(page, 0).inputValue()).toBe("520");
    expect(await stack(page, 0).locator("[data-stack-depth-value]").textContent()).toBe("520 mm");
    expect(await depth(page, 1).inputValue()).toBe("200");
    await ready(page);
  } finally { await page.close(); }
}, 120_000);

test("shelf depth remains available while smaller printers add sections instead of shortening stacks", async () => {
  const page = await browser.newPage();
  try {
    await page.goto(link({ bedX: "256", bedY: "256", bedZ: "256" })); await ready(page);
    expect(await depth(page, 1).getAttribute("max")).toBe("520");
    expect(await stack(page, 1).locator("[data-stack-depth-bounds]").textContent()).toContain("Shelf limit 520 mm");
    await depth(page, 1).focus(); await page.keyboard.press("End"); await ready(page);
    expect(await depth(page, 1).inputValue()).toBe("520");
    expect(await page.locator(".stack-summary").nth(1).textContent()).toContain("520 mm");
    expect(await page.locator("#tabs").textContent()).toContain("Section 3");
    expect(await page.locator("#status").textContent()).not.toContain("exceeds this printer");
    await page.waitForFunction(() => (document.getElementById("pickPrinter") as HTMLSelectElement).options.length > 1);
    await page.selectOption("#pickPrinter", "Bambu Lab A1 mini"); await ready(page);
    expect(await depth(page, 1).getAttribute("max")).toBe("520");
    expect(await depth(page, 1).inputValue()).toBe("520");
    expect(await stack(page, 1).locator("[data-stack-depth-value]").textContent()).toBe("520 mm");
    expect(await page.locator("#tabs").textContent()).toContain("Section 4");
    await page.locator('#form [name="bedX"]').fill("1000");
    await page.locator('#form [name="bedY"]').fill("1000");
    expect(await depth(page, 1).getAttribute("max")).toBe("520");
    expect(await stack(page, 1).locator("[data-stack-depth-bounds]").textContent()).toContain("Shelf limit 520 mm");
    await depth(page, 1).focus(); await page.keyboard.press("End"); await ready(page);
    expect(await depth(page, 1).inputValue()).toBe("520");
    await page.locator('#form [name="front"]').fill("100"); await ready(page);
    expect(await depth(page, 1).getAttribute("max")).toBe("420");
    expect(await depth(page, 1).inputValue()).toBe("420");
  } finally { await page.close(); }
}, 120_000);

test("shelf space and can changes update bounds, clamp depths and explain an impossible range", async () => {
  const page = await browser.newPage();
  try {
    await page.goto(link()); await ready(page);
    await page.locator('#form [name="front"]').fill("30");
    expect(await depth(page, 0).getAttribute("max")).toBe("490");
    expect(await depth(page, 0).inputValue()).toBe("240");
    await page.locator('#form [name="d"]').fill("200");
    for (const index of [0, 1]) {
      expect(await depth(page, index).getAttribute("max")).toBe("170");
      expect(await depth(page, index).inputValue()).toBe("170");
      expect(await stack(page, index).locator("[data-stack-depth-value]").textContent()).toBe("170 mm");
    }
    await stack(page, 0).locator('[data-stack-field="canDiameter"]').fill("200");
    expect(await depth(page, 0).getAttribute("min")).toBe("220.5");
    expect(await depth(page, 0).isDisabled()).toBe(true);
    expect(await stack(page, 0).locator("[data-stack-depth-bounds]").textContent()).toContain("only 170 mm");
    expect(await page.locator("#dl3mf").isDisabled()).toBe(true);
    await page.locator('#form [name="d"]').fill("400");
    expect(await depth(page, 0).isEnabled()).toBe(true);
    expect(await depth(page, 0).getAttribute("max")).toBe("370");
    expect(await depth(page, 0).inputValue()).toBe("220.5");
    await page.locator('#form [name="d"]').fill("");
    expect(await depth(page, 0).isDisabled()).toBe(true);
    expect(await depth(page, 0).inputValue()).toBe("220.5");
    await page.locator('#form [name="d"]').fill("500");
    expect(await depth(page, 0).isEnabled()).toBe(true);
    expect(await depth(page, 0).inputValue()).toBe("220.5");
    await ready(page);
  } finally { await page.close(); }
}, 120_000);

test("preset and auto-feed changes update the minimum without resetting another stack", async () => {
  const page = await browser.newPage();
  try {
    await page.goto(link()); await ready(page);
    await stack(page, 0).locator('[data-stack-field="preset"]').selectOption("66.3,115.2");
    expect(await depth(page, 0).getAttribute("min")).toBe("112.6");
    await stack(page, 0).locator(".stack-options > summary").click();
    await stack(page, 0).locator('[data-stack-field="cascade"]').check();
    // 66.3 mm chute plus 12 mm structure, then one diameter and 10 mm stop allowance.
    expect(await depth(page, 0).getAttribute("min")).toBe("154.6");
    expect(await depth(page, 0).inputValue()).toBe("240");
    expect(await depth(page, 1).getAttribute("min")).toBe("112.6");
    expect(await depth(page, 1).inputValue()).toBe("200");
    await stack(page, 0).locator('[data-stack-field="cascade"]').uncheck();
    await ready(page);
  } finally { await page.close(); }
}, 120_000);

test("fractional depth and bounds survive duplication, reordering and shared-link reload", async () => {
  const page = await browser.newPage();
  try {
    await page.goto(link()); await ready(page);
    await depth(page, 0).evaluate(element => {
      const input = element as HTMLInputElement;
      input.value = "361.5"; input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await depth(page, 0).focus(); await page.keyboard.press("ArrowRight");
    expect(await depth(page, 0).inputValue()).toBe("361.6");
    await page.getByRole("button", { name: "Duplicate stack 1", exact: true }).click();
    await page.getByRole("button", { name: "Move stack 3 up", exact: true }).click();
    expect(await page.locator('[data-stack-field="depth"]').evaluateAll(elements => elements.map(element => (element as HTMLInputElement).value))).toEqual(["361.6", "200", "361.6"]);
    await ready(page);
    await page.waitForFunction(() => {
      const rows = JSON.parse(new URLSearchParams(location.hash.slice(1)).get("stacks")!);
      return rows.length === 3 && rows[0].depth === 361.6 && rows[1].depth === 200;
    });
    await page.reload(); await ready(page);
    expect(await page.locator('[data-stack-field="depth"]').evaluateAll(elements => elements.map(element => (element as HTMLInputElement).value))).toEqual(["361.6", "200", "361.6"]);
    expect(await depth(page, 0).getAttribute("min")).toBe("112.6");
    expect(await depth(page, 1).getAttribute("min")).toBe("112.6");
    expect(await depth(page, 2).getAttribute("max")).toBe("520");
  } finally { await page.close(); }
}, 120_000);

test("shared links use their shelf bounds before normalizing depths", async () => {
  const page = await browser.newPage();
  try {
    const stacks = [
      { canDiameter: 66, canHeight: 122.5, depth: 600, tiers: 1, cascade: false },
      { canDiameter: 53, canHeight: 134, depth: 650, tiers: 1, cascade: false },
    ];
    await page.goto(link({ stacks: JSON.stringify(stacks), d: "700", front: "20" })); await ready(page);
    expect(await depth(page, 0).inputValue()).toBe("600");
    expect(await depth(page, 1).inputValue()).toBe("650");
    expect(await depth(page, 0).getAttribute("max")).toBe("680");
    // Incoming shelf dimensions must apply before the range sanitizes carried values.
    const fragment = new URL(link({ stacks: JSON.stringify(stacks), d: "300", front: "20" })).hash;
    await page.evaluate(value => { location.hash = value; }, fragment);
    await page.waitForFunction(() => (document.querySelector('[data-stack-field="depth"]') as HTMLInputElement).max === "280");
    await ready(page);
    for (const index of [0, 1]) {
      expect(await depth(page, index).inputValue()).toBe("280");
      expect(await stack(page, index).locator("[data-stack-depth-value]").textContent()).toBe("280 mm");
    }
    const shared = new URLSearchParams(new URL(page.url()).hash.slice(1));
    expect(JSON.parse(shared.get("stacks")!).map((row: { depth: number }) => row.depth)).toEqual([280, 280]);
    const malformed = new URL(link({ stacks: "not-json", d: "300", front: "20" })).hash;
    await page.evaluate(value => { location.hash = value; }, malformed);
    await page.waitForFunction(() => document.getElementById("status")!.textContent!.includes("Couldn't read this mixed-organizer link"));
    expect(await depth(page, 0).getAttribute("min")).toBe("112.6");
    expect(await depth(page, 0).getAttribute("max")).toBe("280");
    expect(await page.locator("#results").isHidden()).toBe(true);
    expect(await page.locator("#dl3mf").isDisabled()).toBe(true);
  } finally { await page.close(); }
}, 120_000);
