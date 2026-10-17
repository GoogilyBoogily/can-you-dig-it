import { afterAll, beforeAll, expect, test } from "bun:test";
import { chromium, type Browser, type Page } from "playwright";
import { strFromU8, unzipSync } from "fflate";
import { serveDist } from "../dev";
import { DEFAULTS, type MixedStackRequest } from "../src/model";
import { resolveMixedBuild } from "../src/solver";
import { mixedPartManifest, PREVIEW_INSTANCE_LIMIT } from "../src/assembly";

let browser: Browser;
let server: ReturnType<typeof serveDist>;
let address: string;
const stacks: MixedStackRequest[] = [
  { canDiameter: 66, canHeight: 122.5, depth: 240, tiers: 1 },
  { canDiameter: 53, canHeight: 134, depth: 200, tiers: 2 },
];

beforeAll(async () => {
  const result = await Bun.spawn(["bun", "run", "build.ts"], { stdout: "ignore", stderr: "inherit" }).exited;
  if (result !== 0) throw new Error("build.ts failed");
  server = serveDist(0); address = `http://localhost:${server.port}/index.html`;
  browser = await chromium.launch();
});
afterAll(async () => { await browser?.close(); server?.stop(true); });

function link(rows = stacks, fields: Record<string, string> = {}) {
  return `${address}#${new URLSearchParams({ v: "2", mode: "mixed", stacks: JSON.stringify(rows),
    w: "500", d: "520", h: "400", cascade: "off", cover: "off", slope: "0", ...fields })}`;
}
const row = (page: Page, index: number) => page.locator(".stack-card").nth(index);
const field = (page: Page, index: number, name: string) => row(page, index).locator(`[data-stack-field="${name}"]`);
async function setStackDepth(page: Page, index: number, depth: string) {
  await field(page, index, "depth").evaluate((element, value) => {
    const input = element as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }, depth);
}
async function openStackOptions(page: Page, index: number) {
  const options = row(page, index).locator("details");
  if (await options.getAttribute("open") === null) await options.locator("summary").click();
}
async function operatingValues(page: Page, index: number) {
  return { cascade: await field(page, index, "cascade").isChecked(), slope: Number(await field(page, index, "slope").inputValue()),
    lipGap: Number(await field(page, index, "lipGap").inputValue()), cover: await field(page, index, "cover").isChecked(),
    rearLoad: await field(page, index, "rearLoad").isChecked(), stackable: await field(page, index, "stackable").isChecked() };
}
async function ready(page: Page) { await page.waitForSelector("#dl3mf:not([disabled])", { timeout: 90_000 }); }
async function downloadFiles(page: Page, selector: string) {
  const completed = page.waitForEvent("download"); await page.click(selector);
  const stream = await (await completed).createReadStream();
  if (!stream) throw new Error("download has no readable stream");
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return unzipSync(new Uint8Array(Buffer.concat(chunks)));
}

function stlSize(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const triangles = view.getUint32(80, true), minimum = [Infinity, Infinity, Infinity], maximum = [-Infinity, -Infinity, -Infinity];
  expect(bytes.length).toBe(84 + triangles * 50);
  for (let triangle = 0; triangle < triangles; triangle++) for (let vertex = 0; vertex < 3; vertex++) for (let axis = 0; axis < 3; axis++) {
    const coordinate = view.getFloat32(84 + triangle * 50 + 12 + vertex * 12 + axis * 4, true);
    minimum[axis] = Math.min(minimum[axis], coordinate); maximum[axis] = Math.max(maximum[axis], coordinate);
  }
  return maximum.map((value, axis) => value - minimum[axis]);
}

const reorderStacks: Required<MixedStackRequest>[] = [
  { ...stacks[0], cascade: false, slope: 0, lipGap: 0, cover: false, rearLoad: false, stackable: true },
  { ...stacks[1], depth: 300, tiers: 3, cascade: true, slope: 3, lipGap: 7, cover: true, rearLoad: true, stackable: false },
  { canDiameter: 53.5, canHeight: 92, depth: 200, tiers: 2, cascade: false, slope: 1, lipGap: 5, cover: false, rearLoad: false, stackable: false },
];
async function enteredStacks(page: Page) {
  return Promise.all(Array.from({ length: await page.locator(".stack-card").count() }, async (_, index) => ({
    canDiameter: Number(await field(page, index, "canDiameter").inputValue()), canHeight: Number(await field(page, index, "canHeight").inputValue()),
    depth: Number(await field(page, index, "depth").inputValue()),
    tiers: await field(page, index, "tierMode").inputValue() === "auto" ? "auto" : Number(await field(page, index, "tiers").inputValue()),
    ...await operatingValues(page, index),
  })));
}

test("stack arrow buttons and focused Up/Down keys reorder whole stacks without changing numeric-input keys", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1600 } });
  try {
    await page.goto(link(reorderStacks, { v: "3", w: "700", h: "500" })); await ready(page);
    await row(page, 0).getByRole("button", { name: "Move stack 1 down", exact: true }).click();
    expect(await enteredStacks(page)).toEqual([reorderStacks[1], reorderStacks[0], reorderStacks[2]]);
    await row(page, 1).getByRole("button", { name: "Move stack 2 up", exact: true }).click();
    expect(await enteredStacks(page)).toEqual(reorderStacks);
    await row(page, 0).getByRole("button", { name: "Reorder stack 1", exact: true }).focus();
    await page.keyboard.press("ArrowUp"); expect(await enteredStacks(page)).toEqual(reorderStacks);
    await page.keyboard.press("ArrowDown"); await page.keyboard.press("ArrowDown");
    expect(await enteredStacks(page)).toEqual([reorderStacks[1], reorderStacks[2], reorderStacks[0]]);
    expect(await row(page, 2).locator("[data-stack-handle]").evaluate(element => element === document.activeElement)).toBe(true);
    await page.keyboard.press("ArrowDown"); expect(await enteredStacks(page)).toEqual([reorderStacks[1], reorderStacks[2], reorderStacks[0]]);
    await page.keyboard.press("ArrowUp");
    expect(await enteredStacks(page)).toEqual([reorderStacks[1], reorderStacks[0], reorderStacks[2]]);
    expect(await page.locator("#stackOrderStatus").textContent()).toContain("position 2 of 3");
    expect(await page.locator(".stack-card h3").allTextContents()).toEqual(["Stack 1", "Stack 2", "Stack 3"]);
    expect(await row(page, 0).locator('[data-stack-action="earlier"]').isDisabled()).toBe(true);
    expect(await row(page, 2).locator('[data-stack-action="later"]').isDisabled()).toBe(true);
    await field(page, 1, "canDiameter").focus(); await page.keyboard.press("ArrowUp");
    expect(await field(page, 1, "canDiameter").inputValue()).toBe("66.1");
    expect(await field(page, 0, "canDiameter").inputValue()).toBe("53");
    expect(await field(page, 2, "canDiameter").inputValue()).toBe("53.5");
    await ready(page);
  } finally { await page.close(); }
});

test("mouse dragging stacks preserves settings, shared order and focus, and Escape restores the original order", async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1800 }, permissions: ["clipboard-read", "clipboard-write"] });
  const page = await context.newPage();
  try {
    await page.goto(link(reorderStacks, { v: "3", w: "700", h: "500" })); await ready(page);
    const handle = await row(page, 0).locator("[data-stack-handle]").boundingBox();
    const last = await row(page, 2).boundingBox();
    if (!handle || !last) throw new Error("Stack drag targets are missing");
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2); await page.mouse.down();
    await page.mouse.move(handle.x + handle.width / 2, last.y + last.height - 20, { steps: 12 });
    await page.waitForFunction(() => (document.querySelector('.stack-card:last-child [data-stack-field="canDiameter"]') as HTMLInputElement).value === "66");
    expect(await page.locator(".is-dragging").count()).toBe(1);
    await page.mouse.up();
    expect(await enteredStacks(page)).toEqual([reorderStacks[1], reorderStacks[2], reorderStacks[0]]);
    expect(await page.locator(".is-dragging").count()).toBe(0);
    expect(await row(page, 2).locator("[data-stack-handle]").evaluate(element => element === document.activeElement)).toBe(true);
    await ready(page);
    await page.click("#share"); await page.waitForFunction(() => document.getElementById("status")!.textContent === "Link copied.");
    const shared = page.url();
    expect(JSON.parse(new URLSearchParams(new URL(shared).hash.slice(1)).get("stacks")!)).toEqual([reorderStacks[1], reorderStacks[2], reorderStacks[0]]);
    await page.goto(shared); await ready(page);
    expect(await enteredStacks(page)).toEqual([reorderStacks[1], reorderStacks[2], reorderStacks[0]]);
    const bottomHandle = await row(page, 2).locator("[data-stack-handle]").boundingBox();
    const first = await row(page, 0).boundingBox();
    if (!bottomHandle || !first) throw new Error("Stack cancel targets are missing");
    await page.mouse.move(bottomHandle.x + bottomHandle.width / 2, bottomHandle.y + bottomHandle.height / 2); await page.mouse.down();
    await page.mouse.move(bottomHandle.x + bottomHandle.width / 2, first.y + 10, { steps: 12 });
    await page.waitForFunction(() => (document.querySelector('[data-stack-field="canDiameter"]') as HTMLInputElement).value === "66");
    await page.keyboard.press("Escape"); await page.mouse.up();
    expect(await enteredStacks(page)).toEqual([reorderStacks[1], reorderStacks[2], reorderStacks[0]]);
    expect(await page.locator("#stackOrderStatus").textContent()).toBe("Stack move cancelled.");
    expect(await page.locator(".is-dragging").count()).toBe(0);
    await ready(page);
    await page.waitForFunction(() => JSON.parse(new URLSearchParams(location.hash.slice(1)).get("stacks")!)[0].canDiameter === 53);
  } finally { await context.close(); }
});

test("touch dragging can reorder past the visible viewport and cancellation leaves a usable editor", async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  try {
    await page.goto(link(reorderStacks, { v: "3", w: "700", h: "500" })); await ready(page);
    const touch = await page.context().newCDPSession(page);
    await row(page, 0).locator("[data-stack-handle]").evaluate(element => element.scrollIntoView({ block: "center" }));
    const handle = await row(page, 0).locator("[data-stack-handle]").boundingBox();
    if (!handle) throw new Error("Touch drag handle is missing");
    const x = handle.x + handle.width / 2, y = handle.y + handle.height / 2;
    await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    await touch.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: 820 }] });
    await page.waitForFunction(() => (document.querySelector('.stack-card:last-child [data-stack-field="canDiameter"]') as HTMLInputElement).value === "66");
    await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    expect(await enteredStacks(page)).toEqual([reorderStacks[1], reorderStacks[2], reorderStacks[0]]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await row(page, 0).locator("[data-stack-handle]").evaluate(element => element.scrollIntoView({ block: "center" }));
    const nextHandle = await row(page, 0).locator("[data-stack-handle]").boundingBox();
    if (!nextHandle) throw new Error("Touch cancellation handle is missing");
    await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: nextHandle.x + 10, y: nextHandle.y + 10 }] });
    await touch.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: nextHandle.x + 10, y: 820 }] });
    await page.waitForFunction(() => (document.querySelector('.stack-card:last-child [data-stack-field="canDiameter"]') as HTMLInputElement).value === "53");
    await touch.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
    expect(await enteredStacks(page)).toEqual([reorderStacks[1], reorderStacks[2], reorderStacks[0]]);
    expect(await page.locator(".is-dragging").count()).toBe(0);
    await row(page, 0).locator("[data-stack-handle]").focus(); await page.keyboard.press("ArrowDown");
    expect(await enteredStacks(page)).toEqual([reorderStacks[2], reorderStacks[1], reorderStacks[0]]);
    await ready(page);
  } finally { await page.close(); }
});

test("desktop drag edge scrolling stops at the stacks and incoming designs cancel a pending drag", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  try {
    const expanded = [...reorderStacks, ...reorderStacks];
    await page.goto(link(expanded, { v: "3", w: "1400", h: "500" })); await ready(page);
    await row(page, 0).locator("[data-stack-handle]").scrollIntoViewIfNeeded();
    const handle = await row(page, 0).locator("[data-stack-handle]").boundingBox();
    const controls = await page.locator("#form").boundingBox();
    if (!handle || !controls) throw new Error("Desktop scroll drag targets are missing");
    const originalScroll = await page.locator("#form").evaluate(element => element.scrollTop);
    await row(page, 0).evaluate(element => element.dataset.dragTestSource = "true");
    await page.mouse.move(handle.x + 10, handle.y + 10); await page.mouse.down();
    await page.mouse.move(handle.x + 10, controls.y + controls.height - 10, { steps: 12 });
    await page.waitForFunction(() => document.querySelector(".stack-card:last-child")?.getAttribute("data-drag-test-source") === "true");
    expect(await page.locator("#form").evaluate(element => element.scrollTop)).toBeGreaterThan(originalScroll);
    await page.waitForFunction(() => {
      const editor = document.getElementById("mixedStacks")!.getBoundingClientRect();
      const controls = document.getElementById("form")!.getBoundingClientRect();
      return editor.bottom <= controls.bottom - 48;
    });
    const settledScroll = await page.locator("#form").evaluate(element => element.scrollTop);
    await page.evaluate(() => new Promise<void>(resolve => {
      let frames = 0;
      function next() { if (++frames === 5) resolve(); else requestAnimationFrame(next); }
      requestAnimationFrame(next);
    }));
    expect(await page.locator("#form").evaluate(element => element.scrollTop)).toBe(settledScroll);
    await page.mouse.up();
    expect(await enteredStacks(page)).toEqual([...expanded.slice(1), expanded[0]]);
    await row(page, 0).locator("[data-stack-handle]").scrollIntoViewIfNeeded();
    const nextHandle = await row(page, 0).locator("[data-stack-handle]").boundingBox();
    if (!nextHandle) throw new Error("Incoming-design drag handle is missing");
    await page.mouse.move(nextHandle.x + 10, nextHandle.y + 10); await page.mouse.down();
    await page.mouse.move(nextHandle.x + 10, nextHandle.y + 40);
    await page.waitForSelector(".is-dragging");
    await page.screenshot({ path: "/tmp/cyd-reordering-desktop-dragging.png" });
    const incoming = link(stacks);
    await page.evaluate(url => location.hash = new URL(url).hash, incoming);
    await page.waitForFunction(() => document.querySelectorAll(".stack-card").length === 2);
    await page.mouse.up();
    expect(await page.locator(".is-dragging").count()).toBe(0);
    expect((await enteredStacks(page)).map(({ canDiameter, canHeight, depth, tiers }) => ({ canDiameter, canHeight, depth, tiers }))).toEqual(stacks);
    await ready(page);
  } finally { await page.close(); }
});

test("mixed editing is opt-in; duplicate, reorder, remove and shared links preserve entered requests", async () => {
  const context = await browser.newContext({ permissions: ["clipboard-read", "clipboard-write"] });
  const page = await context.newPage();
  try {
    await page.goto(`${address}#w=1900&d=520&h=800`);
    expect(await page.inputValue("#buildMode")).toBe("uniform");
    expect(await page.isHidden("#mixedEditor")).toBe(true);
    await page.selectOption("#buildMode", "mixed");
    expect(await page.locator(".stack-card").count()).toBe(2);
    expect(await field(page, 0, "canDiameter").inputValue()).toBe("66");
    expect(await field(page, 1, "canDiameter").inputValue()).toBe("66");
    await field(page, 0, "canDiameter").fill("53");
    await field(page, 0, "canHeight").fill("134");
    await setStackDepth(page, 0, "361.5");
    await field(page, 0, "tierMode").selectOption("fixed"); await field(page, 0, "tiers").fill("3");
    await row(page, 0).locator('[data-stack-action="duplicate"]').click();
    await field(page, 1, "canHeight").fill("150");
    expect(await field(page, 0, "canHeight").inputValue()).toBe("134");
    await row(page, 1).locator('[data-stack-action="later"]').click();
    expect(await field(page, 1, "canDiameter").inputValue()).toBe("66");
    expect(await field(page, 2, "canHeight").inputValue()).toBe("150");
    await row(page, 1).locator('[data-stack-action="remove"]').click();
    await page.click("#share");
    await page.waitForFunction(() => document.getElementById("status")!.textContent === "Link copied.");
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    const parameters = new URLSearchParams(new URL(copied).hash.slice(1));
    expect(parameters.get("v")).toBe("3");
    expect(JSON.parse(parameters.get("stacks")!)).toEqual([
      { canDiameter: 53, canHeight: 134, depth: 361.5, tiers: 3, cascade: true, slope: 3, lipGap: 5, cover: true, rearLoad: false, stackable: false },
      { canDiameter: 53, canHeight: 150, depth: 361.5, tiers: 3, cascade: true, slope: 3, lipGap: 5, cover: true, rearLoad: false, stackable: false },
    ]);
    await page.goto(copied);
    expect(await field(page, 0, "depth").inputValue()).toBe("361.5");
    expect(await field(page, 1, "canHeight").inputValue()).toBe("150");
    for (let index = 2; index < 8; index++) await page.click("#addStack");
    expect(await page.isDisabled("#addStack")).toBe(true);
    expect(await row(page, 0).locator('[data-stack-action="duplicate"]').isDisabled()).toBe(true);
    for (let index = 8; index > 2; index--) await row(page, index - 1).locator('[data-stack-action="remove"]').click();
    expect(await row(page, 0).locator('[data-stack-action="remove"]').isDisabled()).toBe(true);
    expect(await row(page, 0).locator('[data-stack-action="earlier"]').isDisabled()).toBe(true);
    expect(await row(page, 1).locator('[data-stack-action="later"]').isDisabled()).toBe(true);
  } finally { await context.close(); }
});

test("each stack has the uniform can presets with isolated custom, duplicate and shared-link behavior", async () => {
  const context = await browser.newContext({ permissions: ["clipboard-read", "clipboard-write"] });
  const page = await context.newPage();
  try {
    await page.goto(`${address}#w=1200&d=520&h=400`);
    await page.selectOption("#buildMode", "mixed");
    const uniformOptions = await page.locator('#form [name="preset"] option').evaluateAll((options) =>
      options.map((option) => ({ value: (option as HTMLOptionElement).value, label: option.textContent })));
    expect(uniformOptions.map((option) => option.value)).toEqual(["66,122.5", "66.3,115.2", "66,157", "53,134", "53.5,92", "custom"]);
    for (const index of [0, 1]) {
      expect(await field(page, index, "preset").locator("option").evaluateAll((options) =>
        options.map((option) => ({ value: (option as HTMLOptionElement).value, label: option.textContent })))).toEqual(uniformOptions);
      expect(await field(page, index, "preset").inputValue()).toBe("66,122.5");
    }
    await field(page, 0, "preset").selectOption("66.3,115.2");
    expect(await field(page, 0, "canDiameter").inputValue()).toBe("66.3");
    expect(await field(page, 0, "canHeight").inputValue()).toBe("115.2");
    expect(await field(page, 1, "canDiameter").inputValue()).toBe("66");
    expect(await field(page, 1, "canHeight").inputValue()).toBe("122.5");
    expect(await field(page, 0, "depth").inputValue()).toBe("480");
    expect(await field(page, 0, "tierMode").inputValue()).toBe("auto");
    await field(page, 0, "preset").selectOption("custom");
    expect(await field(page, 0, "canDiameter").inputValue()).toBe("66.3");
    expect(await field(page, 0, "canHeight").inputValue()).toBe("115.2");
    await field(page, 0, "preset").selectOption("66.3,115.2");
    await field(page, 0, "canDiameter").fill("66.4");
    expect(await field(page, 0, "preset").inputValue()).toBe("custom");
    expect(await field(page, 1, "preset").inputValue()).toBe("66,122.5");
    await field(page, 0, "preset").selectOption("53,134");
    await field(page, 0, "preset").selectOption("custom");
    await row(page, 0).locator('[data-stack-action="duplicate"]').click();
    expect(await field(page, 1, "preset").inputValue()).toBe("custom");
    expect(await field(page, 1, "canDiameter").inputValue()).toBe("53");
    expect(await field(page, 1, "canHeight").inputValue()).toBe("134");
    await field(page, 0, "preset").selectOption("53,134");
    await field(page, 1, "canHeight").fill("150");
    expect(await field(page, 1, "preset").inputValue()).toBe("custom");
    expect(await field(page, 0, "preset").inputValue()).toBe("53,134");
    expect(await field(page, 0, "canHeight").inputValue()).toBe("134");
    await row(page, 1).locator('[data-stack-action="later"]').click();
    expect(await field(page, 1, "preset").inputValue()).toBe("66,122.5");
    expect(await field(page, 2, "preset").inputValue()).toBe("custom");
    expect(await field(page, 2, "canHeight").inputValue()).toBe("150");
    await row(page, 1).locator('[data-stack-action="remove"]').click();
    await page.click("#share");
    await page.waitForFunction(() => document.getElementById("status")!.textContent === "Link copied.");
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(JSON.parse(new URLSearchParams(new URL(copied).hash.slice(1)).get("stacks")!)).toEqual([
      { canDiameter: 53, canHeight: 134, depth: 480, tiers: "auto", cascade: true, slope: 3, lipGap: 5, cover: true, rearLoad: false, stackable: false },
      { canDiameter: 53, canHeight: 150, depth: 480, tiers: "auto", cascade: true, slope: 3, lipGap: 5, cover: true, rearLoad: false, stackable: false },
    ]);
    await page.goto(copied); await ready(page);
    expect(await field(page, 0, "preset").inputValue()).toBe("53,134");
    expect(await field(page, 1, "preset").inputValue()).toBe("custom");
    expect(await field(page, 1, "canHeight").inputValue()).toBe("150");
    await page.click("#addStack");
    expect(await field(page, 2, "preset").inputValue()).toBe("66,122.5");
  } finally { await context.close(); }
});

test("first mixed entry and new stacks inherit current uniform settings while toggles preserve edited rows", async () => {
  const page = await browser.newPage();
  try {
    await page.goto(`${address}#w=1200&d=520&h=500&cascade=off&cover=off&rearLoad=on&slope=1.5&lipGap=9`);
    await page.selectOption("#buildMode", "mixed");
    const inherited = { cascade: false, slope: 1.5, lipGap: 9, cover: false, rearLoad: true, stackable: false };
    for (const index of [0, 1]) expect(await operatingValues(page, index)).toEqual(inherited);
    for (const identifier of ["sharedCascade", "sharedCover", "sharedRearLoad", "sharedSlope", "sharedLipGap", "sharedStackable"])
      expect(await page.isHidden(`#${identifier}`)).toBe(true);
    await page.locator("#appearanceOptions > summary").click();
    await page.locator("#fitOptions > summary").click();
    expect(await page.isVisible('#form [name="design"]')).toBe(true);
    expect(await page.isVisible('#form [name="fit"]')).toBe(true);
    await openStackOptions(page, 0);
    await field(page, 0, "cascade").check(); await field(page, 0, "slope").fill("4.5"); await field(page, 0, "lipGap").fill("7");
    await field(page, 0, "cover").check(); await field(page, 0, "rearLoad").uncheck(); await field(page, 0, "stackable").check();
    const edited = { cascade: true, slope: 4.5, lipGap: 7, cover: true, rearLoad: false, stackable: true };
    expect(await operatingValues(page, 1)).toEqual(inherited);
    await page.selectOption("#buildMode", "uniform");
    expect(await page.inputValue('#form [name="slope"]')).toBe("1.5");
    await page.locator("#feedingOptions > summary").click();
    await page.fill('#form [name="slope"]', "2.5"); await page.fill('#form [name="lipGap"]', "8");
    await page.selectOption("#buildMode", "mixed");
    expect(await operatingValues(page, 0)).toEqual(edited); expect(await operatingValues(page, 1)).toEqual(inherited);
    await page.click("#addStack");
    expect(await operatingValues(page, 2)).toEqual({ ...inherited, slope: 2.5, lipGap: 8 });
  } finally { await page.close(); }
});

test("unlike stack options stay isolated through duplicate, reorder, version-three sharing and reload", async () => {
  const context = await browser.newContext({ permissions: ["clipboard-read", "clipboard-write"] });
  const page = await context.newPage();
  try {
    await page.goto(link());
    await setStackDepth(page, 0, "300"); await field(page, 0, "tiers").fill("3");
    await openStackOptions(page, 0); await openStackOptions(page, 1);
    await field(page, 0, "cascade").check(); await field(page, 0, "slope").fill("3"); await field(page, 0, "lipGap").fill("7");
    await field(page, 0, "cover").check(); await field(page, 0, "rearLoad").check();
    await field(page, 1, "lipGap").fill("0"); await field(page, 1, "stackable").check();
    const firstOptions = { cascade: true, slope: 3, lipGap: 7, cover: true, rearLoad: true, stackable: false };
    const secondOptions = { cascade: false, slope: 0, lipGap: 0, cover: false, rearLoad: false, stackable: true };
    expect(await operatingValues(page, 0)).toEqual(firstOptions); expect(await operatingValues(page, 1)).toEqual(secondOptions);
    await row(page, 0).locator('[data-stack-action="duplicate"]').click();
    expect(await operatingValues(page, 1)).toEqual(firstOptions);
    await field(page, 1, "cover").uncheck(); expect(await field(page, 0, "cover").isChecked()).toBe(true);
    await row(page, 1).locator('[data-stack-action="later"]').click();
    expect(await operatingValues(page, 1)).toEqual(secondOptions); expect(await operatingValues(page, 2)).toEqual({ ...firstOptions, cover: false });
    await row(page, 2).locator('[data-stack-action="remove"]').click(); await ready(page);
    await page.click("#share"); await page.waitForFunction(() => document.getElementById("status")!.textContent === "Link copied.");
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    const parameters = new URLSearchParams(new URL(copied).hash.slice(1));
    expect(parameters.get("v")).toBe("3");
    expect(JSON.parse(parameters.get("stacks")!)).toEqual([
      { canDiameter: 66, canHeight: 122.5, depth: 300, tiers: 3, ...firstOptions },
      { canDiameter: 53, canHeight: 134, depth: 200, tiers: 2, ...secondOptions },
    ]);
    await page.goto(copied); await ready(page);
    expect(await operatingValues(page, 0)).toEqual(firstOptions); expect(await operatingValues(page, 1)).toEqual(secondOptions);
    expect(await page.locator("#summary > dl dt").allTextContents()).not.toContain("Deck slope");
    const summaries = await page.locator(".stack-summary").allTextContents();
    expect(summaries[0]).toContain("Deck slope3°"); expect(summaries[0]).toContain("Lip headroom7 mm");
    expect(summaries[0]).toContain("Auto-feedbetween tiers"); expect(summaries[0]).toContain("Coveron the top tier");
    expect(summaries[0]).toContain("back of the top tier");
    expect(summaries[1]).toContain("Deck slope0°"); expect(summaries[1]).toContain("Lip headroom0 mm");
    expect(summaries[1]).toContain("Auto-feedoff; load each tier separately"); expect(summaries[1]).toContain("Covernone");
    expect(summaries[1]).toContain("Join on topanother tier"); expect(summaries[1]).not.toContain("back of the top tier");
    await field(page, 0, "tiers").fill("2");
    expect(await page.textContent("#status")).toContain("Stack 1"); expect(await page.isDisabled("#dl3mf")).toBe(true);
    expect(await operatingValues(page, 1)).toEqual(secondOptions);
    await field(page, 0, "tiers").fill("3"); await openStackOptions(page, 0); await field(page, 0, "slope").fill("11");
    expect(await page.textContent("#status")).toContain("Stack 1"); expect(await page.isDisabled("#dl3mf")).toBe(true);
    await field(page, 0, "slope").fill("3"); await field(page, 0, "lipGap").fill("21");
    expect(await page.textContent("#status")).toContain("Stack 1"); expect(await page.isDisabled("#dl3mf")).toBe(true);
  } finally { await context.close(); }
});

test("older mixed links inherit their global options and explicit version-three rows ignore unused invalid globals", async () => {
  const page = await browser.newPage();
  try {
    const oldRows = stacks.map((stack) => ({ ...stack, depth: 300, tiers: 3 }));
    await page.goto(link(oldRows, { cascade: "on", cover: "on", rearLoad: "on", slope: "4", lipGap: "7" })); await ready(page);
    for (const index of [0, 1]) expect(await operatingValues(page, index)).toEqual({ cascade: true, slope: 4, lipGap: 7, cover: true, rearLoad: true, stackable: false });
    const explicitOptions = { cascade: false, slope: 0, lipGap: 0, cover: false, rearLoad: false, stackable: false };
    const explicitRows = stacks.map((stack) => ({ ...stack, ...explicitOptions }));
    await page.evaluate((fragment) => { location.hash = fragment; }, new URL(link(explicitRows, { v: "3", cascade: "on", cover: "on", rearLoad: "on", stackable: "on", slope: "not-a-number", lipGap: "20" })).hash);
    await page.waitForFunction(() => (document.querySelector('.stack-card [data-stack-field="lipGap"]') as HTMLInputElement).value === "0"); await ready(page);
    for (const index of [0, 1]) expect(await operatingValues(page, index)).toEqual(explicitOptions);
    expect(await page.inputValue('#form [name="slope"]')).toBe("");
    expect(await page.textContent("#status")).not.toContain("Check your design");
  } finally { await page.close(); }
});

test("a mixed build exports both actual can widths and all twenty physical pieces", async () => {
  const page = await browser.newPage();
  try {
    await page.goto(link()); await ready(page);
    // Physical stop allowances: 11 mm in front, 9.5 behind; pitch = diameter + 0.5.
    // These rows hold three cans per deck, giving 3 + 2*3 = 9 independently of the resolver.
    expect(await page.textContent("#summary")).toContain("9 cans in 2 stacks");
    expect(await page.locator(".stack-summary").nth(0).textContent()).toContain("240 mm");
    expect(await page.locator(".stack-summary").nth(1).textContent()).toContain("2 (fixed)");
    const archive = await downloadFiles(page, "#dl3mf");
    const model = strFromU8(archive["3D/3dmodel.model"]), metadata = strFromU8(archive["Metadata/model_settings.config"]);
    // Five product pieces per tier, plus five spline segments of 33.5 mm each.
    expect([...model.matchAll(/<object /g)]).toHaveLength(20);
    expect([...model.matchAll(/<item /g)]).toHaveLength(20);
    expect([...metadata.matchAll(/<model_instance>/g)]).toHaveLength(20);
    expect(model).toContain("stack-1-"); expect(model).toContain("stack-2-");
    expect([...model.matchAll(/name="connection-1-spline-/g)]).toHaveLength(5);
    const files = await downloadFiles(page, "#dlstl");
    const firstDeck = files["stack-1-lane-deck.stl"], secondDeck = files["stack-2-lane-deck.stl"];
    expect(firstDeck).toBeDefined(); expect(secondDeck).toBeDefined();
    expect(stlSize(firstDeck)[0]).toBeCloseTo(240, 4); expect(stlSize(secondDeck)[0]).toBeCloseTo(200, 4);
    expect(stlSize(firstDeck)[1]).toBeCloseTo(138, 4); expect(stlSize(secondDeck)[1]).toBeCloseTo(149.5, 4);
    expect(files["connection-1-spline.stl"]).toBeDefined();
  } finally { await page.close(); }
});

test("fixed mixed constraints fail visibly without shortening, removing or switching a stack", async () => {
  const page = await browser.newPage();
  try {
    await page.goto(link()); await ready(page);
    await page.fill('#form [name="d"]', "1500");
    await setStackDepth(page, 0, "1000");
    await ready(page);
    expect(await field(page, 0, "depth").inputValue()).toBe("1000");
    expect(await page.textContent("#tabs")).toContain("Section 5");
    await field(page, 0, "canHeight").fill("400");
    expect(await page.isDisabled("#dl3mf")).toBe(true);
    expect(await field(page, 0, "depth").inputValue()).toBe("1000");
    expect(await page.textContent("#status")).toContain("Stack 1");
    expect(await page.isHidden("#results")).toBe(true);
    await field(page, 0, "canHeight").fill("122.5");
    await setStackDepth(page, 0, "240"); await field(page, 0, "tiers").fill("50");
    expect(await page.isDisabled("#dl3mf")).toBe(true);
    expect(await field(page, 0, "tiers").inputValue()).toBe("50");
    await field(page, 0, "tiers").fill("1");
    await page.locator("#baseOptions > summary").click();
    await page.selectOption('#form [name="base"]', "feet");
    expect(await page.textContent("#status")).toContain("flat base");
    expect(await page.inputValue('#form [name="base"]')).toBe("feet");
    await page.selectOption('#form [name="base"]', "flat"); await ready(page);
    await page.fill('#form [name="h"]', "600"); await ready(page);
    expect(await page.locator(".stack-summary").nth(0).textContent()).toContain("1 (fixed)");
    expect(await page.locator(".stack-summary").nth(1).textContent()).toContain("2 (fixed)");
    expect(await page.locator(".stack-card").count()).toBe(2);
  } finally { await page.close(); }
});

test("rear loading rejects fixed even cascades and automatic tiers honor loading parity", async () => {
  const page = await browser.newPage();
  try {
    const automatic = stacks.map((stack) => ({ ...stack, depth: 300, tiers: "auto" as const }));
    // At zero slope, three tiers need 239/200 mm; five need 383/318 mm.
    // A 300 mm shelf therefore permits exactly three rear-loadable tiers for each size.
    await page.goto(link([{ ...automatic[0], tiers: 2 }, { ...automatic[1], tiers: 2 }], { cascade: "on", rearLoad: "on", h: "300" }));
    await page.waitForFunction(() => document.getElementById("status")!.textContent!.includes("Stack 1"));
    expect(await page.isDisabled("#dl3mf")).toBe(true);
    await field(page, 0, "tierMode").selectOption("auto"); await field(page, 1, "tierMode").selectOption("auto"); await ready(page);
    for (const section of await page.locator(".stack-summary").all()) {
      const text = await section.textContent(); expect(text).toContain("3 (automatic)"); expect(text).toContain("back of the top tier");
    }
    await row(page, 0).locator("summary").click();
    await field(page, 0, "stackable").check();
    expect(await page.isDisabled("#dl3mf")).toBe(true);
    expect(await page.textContent("#status")).toContain("stackable");
  } finally { await page.close(); }
});

test("incoming mixed and legacy links reset their modes; malformed versions never build defaults", async () => {
  const page = await browser.newPage();
  try {
    await page.goto(link()); await ready(page);
    await setStackDepth(page, 0, "230");
    await page.evaluate(() => { location.hash = "w=160&d=305&h=254&cascade=off"; });
    await page.waitForFunction(() => (document.getElementById("buildMode") as HTMLSelectElement).value === "uniform");
    expect(await page.inputValue('#form [name="w"]')).toBe("160");
    expect(await page.isHidden("#mixedEditor")).toBe(true);
    await ready(page);
    await page.evaluate(() => { location.hash = "v=9&mode=mixed&stacks=[]"; });
    await page.waitForFunction(() => document.getElementById("status")!.textContent!.includes("unsupported version"));
    expect(await page.isDisabled("#dl3mf")).toBe(true); expect(await page.isHidden("#results")).toBe(true);
  } finally { await page.close(); }
});

test("fixing an unsupported mixed-link base preserves every stack request on load and navigation", async () => {
  const page = await browser.newPage();
  try {
    const incoming: MixedStackRequest[][] = [stacks, [
      { canDiameter: 53, canHeight: 150, depth: 230, tiers: 2 },
      { canDiameter: 66, canHeight: 115.2, depth: 210, tiers: 1 },
    ]];
    await page.goto(link(incoming[0], { base: "feet" }));
    await page.locator("#baseOptions > summary").click();
    for (const [navigation, requests] of incoming.entries()) {
      if (navigation) await page.evaluate((fragment) => { location.hash = fragment; }, new URL(link(requests, { base: "gridfinity" })).hash);
      await page.waitForFunction(() => document.getElementById("status")!.textContent!.includes("flat base"));
      expect(await page.isDisabled("#dl3mf")).toBe(true);
      for (const [index, request] of requests.entries()) {
        expect(await field(page, index, "canDiameter").inputValue()).toBe(String(request.canDiameter));
        expect(await field(page, index, "canHeight").inputValue()).toBe(String(request.canHeight));
        expect(await field(page, index, "depth").inputValue()).toBe(String(request.depth));
        expect(await field(page, index, "tiers").inputValue()).toBe(String(request.tiers));
      }
      await page.selectOption('#form [name="base"]', "flat"); await ready(page);
      for (const [index, request] of requests.entries()) {
        const summary = await page.locator(".stack-summary").nth(index).textContent();
        expect(summary).toContain(`${request.depth} mm`); expect(summary).toContain(`${request.tiers} (fixed)`);
      }
    }
    await page.evaluate(() => { location.hash = "v=2&mode=mixed&stacks=not-json"; });
    await page.waitForFunction(() => document.getElementById("status")!.textContent!.includes("Couldn't read this mixed-organizer link"));
    expect(await page.isDisabled("#dl3mf")).toBe(true); expect(await page.isHidden("#results")).toBe(true);
  } finally { await page.close(); }
});

type AuditedWindow = Window & { mixedRequests: {type: string; id: number; layout?: {request:{stacks:MixedStackRequest[]}}}[]; releaseMixedReply?: () => void };
async function delayedPage(kind: "built" | "file", responseMode: "success" | "error" | "fatal" = "success") {
  const page = await browser.newPage();
  await page.addInitScript(({ kind, responseMode }) => {
    const audited = window as unknown as AuditedWindow; audited.mixedRequests = [];
    const NativeWorker = window.Worker; let delayed = false;
    window.Worker = class extends NativeWorker {
      override postMessage(message: unknown, transferOrOptions: Transferable[] | StructuredSerializeOptions = []) {
        audited.mixedRequests.push(structuredClone(message) as AuditedWindow["mixedRequests"][number]);
        if (Array.isArray(transferOrOptions)) super.postMessage(message, transferOrOptions); else super.postMessage(message, transferOrOptions);
      }
      override set onmessage(callback: ((this: Worker, event: MessageEvent) => unknown) | null) {
        super.onmessage = (event) => {
          if (!callback) return;
          if (event.data.type !== kind || delayed) { callback.call(this, event); return; }
          delayed = true;
          const response = responseMode === "success" ? event : new MessageEvent("message", {data: {
            type: "error", id: event.data.id, of: "build-mixed", message: "injected obsolete build failure", fatal: responseMode === "fatal",
          }});
          audited.releaseMixedReply = () => { delete audited.releaseMixedReply; callback.call(this, response); };
        };
      }
    };
  }, { kind, responseMode });
  await page.goto(link()); return page;
}

for (const responseMode of ["success", "error", "fatal"] as const) test(`a delayed mixed ${responseMode} only publishes the latest complete organizer`, async () => {
  const page = await delayedPage("built", responseMode);
  try {
    await page.waitForFunction(() => !!(window as unknown as AuditedWindow).releaseMixedReply);
    for (const depth of [230, 220, 210]) { await setStackDepth(page, 0, String(depth)); await page.waitForTimeout(300); }
    expect(await page.isDisabled("#dl3mf")).toBe(true);
    expect(await page.evaluate(() => (window as unknown as AuditedWindow).mixedRequests.filter((request) => request.type === "build-mixed").length)).toBe(1);
    await page.evaluate(() => (window as unknown as AuditedWindow).releaseMixedReply!()); await ready(page);
    const requests = await page.evaluate(() => (window as unknown as AuditedWindow).mixedRequests.filter((request) => request.type === "build-mixed"));
    expect(requests.map((request) => request.layout!.request.stacks[0].depth)).toEqual([240, 210]);
    expect(await page.locator(".stack-summary").first().textContent()).toContain("210 mm");
  } finally { await page.close(); }
});

test("a file started before a stack edit cannot download or overwrite the current build status", async () => {
  const page = await delayedPage("file"); const downloads: string[] = []; page.on("download", (download) => downloads.push(download.suggestedFilename()));
  try {
    await ready(page); await page.click("#dl3mf");
    await page.waitForFunction(() => !!(window as unknown as AuditedWindow).releaseMixedReply);
    await setStackDepth(page, 0, "230");
    await page.evaluate(() => (window as unknown as AuditedWindow).releaseMixedReply!()); await page.waitForTimeout(100);
    expect(downloads).toEqual([]); expect(await page.textContent("#status")).not.toContain("Download ready");
    await ready(page); const files = await downloadFiles(page, "#dlstl");
    expect(stlSize(files["stack-1-lane-deck.stl"])[0]).toBeCloseTo(230, 4);
  } finally { await page.close(); }
});

test("mixed previews share one instance budget and release resources across different can sizes", async () => {
  const bundle = await Bun.build({ entrypoints: [new URL("../src/viewer.ts", import.meta.url).pathname], target: "browser" });
  if (!bundle.success) throw new Error(bundle.logs.map(String).join("\n"));
  const source = await bundle.outputs[0].text();
  const viewerServer = Bun.serve({port:0,fetch:request=>new URL(request.url).pathname === "/viewer.js" ? new Response(source,{headers:{"Content-Type":"text/javascript"}}) : new Response('<div id="viewer" style="width:600px;height:500px"></div>',{headers:{"Content-Type":"text/html"}})});
  const page = await browser.newPage();
  try {
    const errors: string[] = []; page.on("pageerror", error => errors.push(error.message)); await page.goto(`http://localhost:${viewerServer.port}`);
    const { canD, canL, length, tiers, lanesWide, left, right, base, magnets, across, along, shelfCells, ...shared } = DEFAULTS;
    const layout = resolveMixedBuild({w:2000,d:2000,h:2000,front:0}, {shared:{...shared,base:"flat",cascade:false,slope:0,lipGap:0,cover:false,bed:[1000,1000,1000]},
      stacks:Array.from({length:8},(_,index)=>({canDiameter:index%2?25:20,canHeight:index%2?60:40,depth:1900,tiers:40}))});
    const manifest = mixedPartManifest(layout);
    const result = await page.evaluate(async ({layout,manifest}) => {
      const {Viewer} = await import(`${location.origin}/viewer.js`); const viewer = new Viewer(document.getElementById("viewer")!);
      const positions = new Float32Array([0,0,0,1,0,0,0,1,0]), indices = new Uint32Array([0,1,2]);
      const parts = manifest.map(part=>({...part,grams:0,solidGrams:0,mesh:{name:part.name,pos:positions,idx:indices,bbox:[0,0,0,1,1,0]}}));
      const summary = viewer.showMixedAssembly(parts,layout), first = viewer.info(); viewer.explode(1); viewer.explode(0); viewer.showPart(parts[0],layout.request.shared.bed);
      viewer.showMixedAssembly(parts,layout); const second = viewer.info(); viewer.reset(); return {summary,first,second,empty:viewer.info()};
    },{layout,manifest});
    expect(result.summary.totalCans).toBeGreaterThan(20_000); expect(result.summary.sampled).toBe(true);
    expect(result.first.instances).toBeLessThanOrEqual(PREVIEW_INSTANCE_LIMIT); expect(result.second.instances).toBe(result.first.instances);
    expect(result.empty.instances).toBe(0); expect(errors).toEqual([]);
  } finally { await page.close(); viewerServer.stop(true); }
});

test("mixed controls, focus and assembly remain usable on desktop and narrow screens in both themes", async () => {
  const visualStacks: MixedStackRequest[] = [
    { ...stacks[0], cascade: false, slope: 0, lipGap: 0, cover: false, rearLoad: false, stackable: true },
    { ...stacks[1], tiers: 3, cascade: true, slope: 3, lipGap: 7, cover: true, rearLoad: true, stackable: false },
  ];
  for (const screen of [{name:"desktop",width:1440,height:1000},{name:"medium",width:900,height:1000},{name:"narrow",width:390,height:844}]) for (const theme of ["light","dark"]) {
    const page = await browser.newPage({viewport:{width:screen.width,height:screen.height}});
    try {
      await page.goto(link(visualStacks,{v:"3"})); await ready(page); await page.selectOption("#theme",theme);
      await field(page,0,"canDiameter").focus();
      expect(await field(page,0,"canDiameter").evaluate(element=>getComputedStyle(element).outlineStyle)).not.toBe("none");
      await field(page,0,"preset").focus();
      expect(await field(page,0,"preset").evaluate(element=>getComputedStyle(element).outlineStyle)).not.toBe("none");
      await row(page,0).locator("[data-stack-handle]").focus();
      expect(await row(page,0).locator("[data-stack-handle]").evaluate(element=>getComputedStyle(element).outlineStyle)).not.toBe("none");
      await openStackOptions(page,0); await openStackOptions(page,1);
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
      await page.screenshot({path:`/tmp/cyd-mixed-options-${screen.name}-${theme}.png`,fullPage:true});
      for(const index of [0,1]) {
        await row(page,index).locator("details").screenshot({path:`/tmp/cyd-mixed-options-${screen.name}-${theme}-stack-${index+1}.png`});
        expect(await field(page,index,"cascade").evaluate(element=>element.getBoundingClientRect().width)).toBeLessThan(30);
      }
      await page.locator("#viewer").scrollIntoViewIfNeeded();
      await page.locator("#viewer").screenshot({path:`/tmp/cyd-mixed-options-${screen.name}-${theme}-assembly.png`});
      await page.locator("#tabs button").nth(1).click(); expect(await page.isHidden("#showCans")).toBe(true);
      await page.locator("#plates button").first().click(); expect(await page.isHidden("#showGrid")).toBe(true);
    } finally { await page.close(); }
  }
});
