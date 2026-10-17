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

const mixedStacks = [
  { canDiameter: 66, canHeight: 157, depth: 480, tiers: 1 },
  { canDiameter: 53, canHeight: 134, depth: 300, tiers: 1 },
];
function mixedLink(fields: Record<string, string> = {}) {
  return `${address}#${new URLSearchParams({ v: "2", mode: "mixed", stacks: JSON.stringify(mixedStacks),
    w: "500", d: "520", h: "400", cascade: "off", cover: "off", slope: "0", ...fields })}`;
}
async function ready(page: Page) {
  await page.waitForSelector("#dl3mf:not([disabled])", { timeout: 90_000 });
  await page.waitForSelector("#results:not([hidden])");
  await page.waitForFunction(() => {
    const summary = document.getElementById("summary");
    return !!summary?.textContent && !/recalculating/i.test(summary.textContent) && !document.getElementById("status")?.classList.contains("busy");
  });
}
async function localFonts(page: Page) {
  await page.route("https://fonts.googleapis.com/**", route => route.fulfill({ contentType: "text/css", body: "" }));
}
async function focusedHeadingInView(page: Page, headingIdentifier: string) {
  expect(await page.locator(`#${headingIdentifier}`).evaluate(element => element === document.activeElement)).toBe(true);
  const heading = await page.locator(`#${headingIdentifier}`).boundingBox();
  const navigation = await page.locator("nav.task-navigation button:not(.skip-preview)[data-navigate='preview']").boundingBox();
  expect(heading).not.toBeNull();
  expect(navigation).not.toBeNull();
  expect(heading!.y).toBeGreaterThanOrEqual(navigation!.y + navigation!.height);
  expect(heading!.y + heading!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
}

test("an exact mixed design can recover from a small printer without changing modes or stacks", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  try {
    await localFonts(page);
    await page.goto(mixedLink({ bedX: "180", bedY: "180", bedZ: "180",
      stacks: JSON.stringify(mixedStacks.map((stack, index) => index === 0 ? { ...stack, canHeight: 180 } : stack)) }), { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => (document.getElementById("pickPrinter") as HTMLSelectElement).options.length > 1);
    await page.selectOption("#pickPrinter", "Bambu Lab A1 mini");
    await page.waitForFunction(() => document.getElementById("viewerMessage")?.textContent?.includes("neither orientation"));
    expect(await page.locator("#results").isHidden()).toBe(true);
    expect(await page.locator("#dl3mf").isDisabled()).toBe(true);
    expect(await page.locator("#pickPrinter").isVisible()).toBe(true);
    expect(await page.locator("#profileIn").isEnabled()).toBe(true);
    expect(await page.locator("#form [name='bedX']").isVisible()).toBe(true);
    expect(await page.evaluate(() => (window as unknown as { viewerInfo(): { instances: number } }).viewerInfo().instances)).toBe(0);
    await page.locator("nav.task-navigation button:not(.skip-preview)[data-navigate='print']").click();
    expect(await page.locator("#printHeading").evaluate(element => element === document.activeElement)).toBe(true);
    expect(await page.locator("#printRecovery").isVisible()).toBe(true);
    await page.locator("nav.task-navigation button:not(.skip-preview)[data-navigate='setup']").click();
    await page.selectOption("#pickPrinter", "Bambu Lab P2S");
    await ready(page);
    expect(await page.locator("#buildMode").inputValue()).toBe("mixed");
    expect(await page.locator(".stack-card [data-stack-field='depth']").evaluateAll(elements => elements.map(element => (element as HTMLInputElement).value))).toEqual(["480", "300"]);
    expect(await page.locator(".stack-card [data-stack-field='canHeight']").evaluateAll(elements => elements.map(element => (element as HTMLInputElement).value))).toEqual(["180", "134"]);
    expect(await page.locator("#form [name='bedX']").inputValue()).toBe("256");
    expect(await page.locator("#viewerMessage").isHidden()).toBe(true);
    expect(await page.locator("#assemblyParts button").count()).toBeGreaterThan(0);
    await page.locator("#form [name='d']").fill("700");
    await page.locator(".stack-card [data-stack-field='canHeight']").first().fill("400");
    await page.waitForSelector("#results[hidden]", { state: "attached" });
    expect(await page.locator("#assemblyParts button").count()).toBe(0);
    const currentError = await page.locator("#status").textContent();
    expect(currentError).toContain("Stack 1");
    expect(await page.locator("#printRecovery p").textContent()).toContain(currentError!);
    expect(await page.locator("#viewerMessage").textContent()).toBe(currentError);
    expect(await page.locator("#dl3mf").isDisabled()).toBe(true);
    await page.locator(".stack-card [data-stack-field='canHeight']").first().fill("180"); await ready(page);
  } finally { await page.close(); }
}, 120_000);

test("choosing print settings preserves an actionable worker startup failure", async () => {
  const page = await browser.newPage();
  try {
    await localFonts(page);
    await page.route("**/worker.js", route => route.abort("failed"));
    await page.goto(`${address}#w=160&d=305&h=254`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.getElementById("status")?.textContent?.includes("geometry engine failed to start"));
    const workerFailure = await page.locator("#status").textContent();
    await page.waitForFunction(() => (document.getElementById("pickPrinter") as HTMLSelectElement).options.length > 1);
    await page.selectOption("#pickPrinter", "Bambu Lab P2S");
    await page.waitForFunction(() => new URLSearchParams(location.hash.slice(1)).get("machine") === "Bambu Lab P2S 0.4 nozzle");
    expect(await page.locator("#profileNow").textContent()).toContain("Using settings from Bambu Lab P2S");
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("can-you-dig-it.profile")!).name)).toContain("Bambu Lab P2S");
    expect(await page.locator("#form [name='bedX']").inputValue()).toBe("256");
    expect(await page.locator("#form [name='bedY']").inputValue()).toBe("256");
    expect(await page.locator("#status").textContent()).toBe(workerFailure);
    expect(await page.locator("#status").textContent()).not.toContain("Print settings loaded");
    expect(await page.locator("#results").isHidden()).toBe(true);
    expect(await page.locator("#dl3mf").isDisabled()).toBe(true);
    expect(await page.locator("#dlstl").isDisabled()).toBe(true);
    expect(await page.locator("#printRecovery p").textContent()).toContain(workerFailure!);
  } finally { await page.close(); }
}, 120_000);

test("downloads precede every plate and mixed stack detail in the reading and visual order", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  try {
    await localFonts(page);
    await page.goto(mixedLink(), { waitUntil: "domcontentloaded" }); await ready(page);
    expect(await page.locator("#dl3mf").count()).toBe(1);
    expect(await page.locator("#dlstl").count()).toBe(1);
    expect(await page.locator("#plates .plate").count()).toBeGreaterThan(1);
    expect(await page.locator(".stack-summary").count()).toBe(2);
    expect(await page.evaluate(() => {
      const actions = document.getElementById("printActions")!;
      return [...document.querySelectorAll("#plates .plate, .stack-summary")].every(element =>
        !!(actions.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING));
    })).toBe(true);
    const actions = await page.locator("#printActions").boundingBox();
    const firstPlate = await page.locator("#plates .plate").first().boundingBox();
    expect(actions).not.toBeNull(); expect(firstPlate).not.toBeNull();
    expect(actions!.y + actions!.height).toBeLessThanOrEqual(firstPlate!.y);
    expect(await page.locator("#summary > dl").textContent()).toContain("11 cans");
  } finally { await page.close(); }
}, 120_000);

test("phone task navigation scrolls and focuses destinations while preserving the design", async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  try {
    await localFonts(page);
    await page.goto(`${address}#w=160&d=305&h=254&pattern=slat&slope=1&cover=off`, { waitUntil: "domcontentloaded" }); await ready(page);
    await page.waitForFunction(() => new URLSearchParams(location.hash.slice(1)).get("pattern") === "slat");
    await page.locator("nav.task-navigation button:not(.skip-preview)[data-navigate='setup']").click();
    const shelfWidth = page.locator("#form [name='w']");
    await shelfWidth.fill("170"); await ready(page);
    expect(await shelfWidth.evaluate(element => element === document.activeElement)).toBe(true);
    const editedWidth = await shelfWidth.boundingBox();
    const navigation = await page.locator("nav.task-navigation").boundingBox();
    expect(editedWidth!.y).toBeGreaterThanOrEqual(navigation!.y + navigation!.height);
    expect(editedWidth!.y + editedWidth!.height).toBeLessThanOrEqual(844);
    await page.waitForFunction(() => new URLSearchParams(location.hash.slice(1)).get("w") === "170");
    const designHash = new URL(page.url()).hash;
    const enteredValues = await page.locator("#form").evaluate(element => [...new FormData(element as HTMLFormElement).entries()]);
    for (const destination of ["preview", "print", "setup", "preview"]) {
      await page.locator(`nav.task-navigation button:not(.skip-preview)[data-navigate='${destination}']`).click();
      await focusedHeadingInView(page, `${destination}Heading`);
      expect(new URL(page.url()).hash).toBe(designHash);
      expect(await page.locator("#form").evaluate(element => [...new FormData(element as HTMLFormElement).entries()])).toEqual(enteredValues);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    expect((await page.locator("#viewer").boundingBox())!.height).toBeGreaterThanOrEqual(200);
  } finally { await page.close(); }
}, 120_000);

test("optional settings start closed and disclose the retained feeding, appearance, base and fit controls", async () => {
  const page = await browser.newPage();
  try {
    await localFonts(page);
    await page.goto(`${address}#w=160&d=305&h=254&pattern=slat&design=minimal&slope=1&fit=0.1`, { waitUntil: "domcontentloaded" }); await ready(page);
    const groups = [
      { identifier: "feedingOptions", fields: ["cascade", "cover", "rearLoad", "slope", "lipGap"] },
      { identifier: "appearanceOptions", fields: ["design", "pattern", "solid", "hexR", "hexAuto"] },
      { identifier: "baseOptions", fields: ["base", "stackable", "left", "right"] },
      { identifier: "fitOptions", fields: ["fit"] },
    ];
    for (const group of groups) {
      const disclosure = page.locator(`#${group.identifier}`);
      expect(await disclosure.getAttribute("open")).toBeNull();
      const values = await Promise.all(group.fields.map(name => disclosure.locator(`[name='${name}']`).inputValue()));
      await disclosure.locator("summary").click();
      for (const name of group.fields) expect(await disclosure.locator(`[name='${name}']`).isVisible(), name).toBe(true);
      expect(await Promise.all(group.fields.map(name => disclosure.locator(`[name='${name}']`).inputValue()))).toEqual(values);
    }
    expect(await page.locator("[name='pattern'] option").count()).toBe(5);
    expect(await page.locator("[name='base'] option").count()).toBe(3);
    expect(await page.locator("[name='pattern']").inputValue()).toBe("slat");
    expect(await page.locator("[name='fit']").inputValue()).toBe("0.1");
    expect(await page.locator("[name='hexR']").isEnabled()).toBe(true);
    expect(await page.locator("[name='hexR']").getAttribute("readonly")).not.toBeNull();
    await page.locator("[name='hexAuto']").uncheck();
    expect(await page.locator("[name='hexR']").getAttribute("readonly")).toBeNull();
    await page.locator("[name='base']").selectOption("feet");
    expect(await page.locator("[name='magnets']").isVisible()).toBe(true);
    await page.locator("[name='base']").selectOption("gridfinity");
    expect(await page.locator("#gridAlignment").isVisible()).toBe(true);
    expect(await page.locator("[name='left']").isDisabled()).toBe(true);
    expect(await page.locator("[name='right']").isDisabled()).toBe(true);
    await ready(page);
  } finally { await page.close(); }
}, 120_000);

test("loading guidance respects a missing cover and shallow shelves explain their usable depth", async () => {
  const page = await browser.newPage();
  try {
    await localFonts(page);
    await page.goto(`${address}#w=300&d=520&h=300&cascade=on&cover=off`, { waitUntil: "domcontentloaded" }); await ready(page);
    await page.locator(".layout").filter({ hasText: "auto-feed" }).first().click(); await ready(page);
    const summary = await page.locator("#summary").textContent();
    expect(summary).toContain("Load from");
    expect(summary).toContain("the top");
    expect(summary).not.toContain("cover window");
    expect(summary).not.toContain("roll to the front on their own");
    await page.locator("#form [name='d']").fill("100");
    await page.waitForFunction(() => document.getElementById("viewerMessage")?.textContent?.startsWith("Nothing fits"));
    const explanation = await page.locator("#viewerMessage").textContent();
    expect(explanation).toMatch(/depth/i);
    expect(explanation).toContain("100 mm");
    expect(await page.locator("#status").textContent()).toBe(explanation);
    expect(await page.locator("#results").isHidden()).toBe(true);
    expect(await page.locator("#dl3mf").isDisabled()).toBe(true);
  } finally { await page.close(); }
}, 120_000);

// A rendered image is independent evidence that camera alternatives move the view;
// the renderer's existing diagnostic hook deliberately exposes no camera state.
test("real part tabs support keyboard selection and the camera works without pointer gestures", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  try {
    await localFonts(page);
    await page.goto(`${address}#w=160&d=305&h=254`, { waitUntil: "domcontentloaded" }); await ready(page);
    const tabs = page.locator("#tabs [role='tab']");
    const assembly = page.locator("#tabs [data-key='assembly']");
    expect(await tabs.count()).toBeGreaterThan(2);
    expect(await page.locator("#tabs [tabindex='0']").count()).toBe(1);
    await assembly.focus(); await page.keyboard.press("ArrowRight");
    expect(await tabs.nth(1).getAttribute("aria-selected")).toBe("true");
    expect(await tabs.nth(1).evaluate(element => element === document.activeElement)).toBe(true);
    expect(await tabs.nth(1).getAttribute("aria-controls")).toBe("viewer");
    expect(await page.locator("#viewer").getAttribute("aria-labelledby")).toBe(await tabs.nth(1).getAttribute("id"));
    await page.keyboard.press("End");
    expect(await tabs.last().getAttribute("aria-selected")).toBe("true");
    await page.keyboard.press("Home");
    expect(await assembly.getAttribute("aria-selected")).toBe("true");
    expect(await page.locator("#tabs [tabindex='0']").count()).toBe(1);
    await page.locator("#partSearch").fill("no part has this name");
    expect(await page.locator("#tabs button:visible").count()).toBe(1);
    expect(await assembly.isVisible()).toBe(true);
    await page.locator("#partSearch").fill("");
    expect(await page.locator("#tabs button:visible").count()).toBe(await tabs.count());
    const canvas = page.locator('canvas[aria-label="3D organizer preview"]');
    expect(await canvas.getAttribute("tabindex")).toBe("0");
    expect(await canvas.getAttribute("aria-describedby")).toContain("viewer-camera-help");
    await page.getByRole("button", { name: "Front view", exact: true }).click();
    const frontView = await canvas.screenshot();
    await page.getByRole("button", { name: "Side view", exact: true }).click();
    expect((await canvas.screenshot()).equals(frontView)).toBe(false);
    await page.getByRole("button", { name: "Reset view", exact: true }).click();
    const resetView = await canvas.screenshot();
    await canvas.focus(); await page.keyboard.press("ArrowRight");
    expect((await canvas.screenshot()).equals(resetView)).toBe(false);
    await page.keyboard.press("Home");
    const beforeZoom = await canvas.screenshot();
    await page.keyboard.press("+");
    expect((await canvas.screenshot()).equals(beforeZoom)).toBe(false);
    await page.getByRole("button", { name: "Zoom out", exact: true }).click();
    await page.getByRole("button", { name: "Zoom in", exact: true }).click();
    expect(await page.locator("#status").getAttribute("role")).toBe("status");
    expect(await page.locator("#status").getAttribute("aria-live")).toBe("polite");
  } finally { await page.close(); }
}, 120_000);

test("the front-view stack map follows reordered can sizes from right to left", async () => {
  const page = await browser.newPage();
  try {
    await localFonts(page);
    await page.goto(mixedLink(), { waitUntil: "domcontentloaded" }); await ready(page);
    const map = page.locator("#mixedOrder");
    expect(await map.getAttribute("aria-label")).toMatch(/front/i);
    expect(await page.locator("#mixedEditor").textContent()).toContain("viewed from the front");
    const firstPosition = await map.locator("[data-stack-number='1']").boundingBox();
    const secondPosition = await map.locator("[data-stack-number='2']").boundingBox();
    expect(firstPosition!.x).toBeGreaterThan(secondPosition!.x);
    expect(await map.locator("[data-stack-number='1']").textContent()).toContain("157");
    expect(await map.locator("[data-stack-number='2']").textContent()).toContain("134");
    await page.getByRole("button", { name: "Move stack 1 down", exact: true }).click();
    expect(await map.locator("[data-stack-number='1']").textContent()).toContain("134");
    expect(await map.locator("[data-stack-number='2']").textContent()).toContain("157");
    expect(await page.locator(".stack-card [data-stack-field='canHeight']").evaluateAll(elements => elements.map(element => (element as HTMLInputElement).value))).toEqual(["134", "157"]);
    await ready(page);
  } finally { await page.close(); }
}, 120_000);

test("a process-only edit in Setup updates estimates without requesting new geometry", async () => {
  const page = await browser.newPage();
  try {
    await localFonts(page);
    await page.addInitScript(() => {
      const state = window as unknown as { geometryRequests: number; estimateRequests: number; holdEstimate: boolean;
        waitingEstimate: boolean; releaseEstimate(): void };
      state.geometryRequests = 0; state.estimateRequests = 0;
      state.holdEstimate = false; state.waitingEstimate = false;
      let heldEstimate: (() => void) | null = null;
      state.releaseEstimate = () => {
        if (!heldEstimate) throw new Error("No estimate reply is held for delivery");
        const deliver = heldEstimate; heldEstimate = null; state.holdEstimate = false; deliver();
      };
      const NativeWorker = window.Worker;
      window.Worker = class extends NativeWorker {
        override postMessage(message: { type: string }) {
          if (message.type === "build" || message.type === "build-mixed") state.geometryRequests++;
          if (message.type === "estimate") state.estimateRequests++;
          super.postMessage(message);
        }
        override set onmessage(callback: ((this: Worker, event: MessageEvent) => unknown) | null) {
          super.onmessage = event => {
            if (!callback) return;
            if (event.data.type === "estimated" && state.holdEstimate) {
              if (heldEstimate) throw new Error("A second estimate arrived before the held reply was delivered");
              heldEstimate = () => callback.call(this, event); state.waitingEstimate = true;
            } else callback.call(this, event);
          };
        }
      };
    });
    await page.goto(`${address}#w=160&d=305&h=254`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => (document.getElementById("pickPrinter") as HTMLSelectElement).options.length > 1);
    await page.selectOption("#pickPrinter", "Bambu Lab P2S");
    await page.waitForFunction(() => (document.getElementById("pickProcess") as HTMLSelectElement).options.length > 1);
    await ready(page);
    await page.locator("#dimensionDetails > summary").click();
    expect(await page.locator("#dimensionDetails").getAttribute("open")).not.toBeNull();
    const before = await page.evaluate(() => ({ geometry: (window as unknown as { geometryRequests: number }).geometryRequests,
      estimates: (window as unknown as { estimateRequests: number }).estimateRequests }));
    const nextProcess = await page.locator("#pickProcess").evaluate(element => {
      const select = element as HTMLSelectElement;
      return [...select.options].find(option => option.value !== select.value)!.value;
    });
    await page.evaluate(() => { (window as unknown as { holdEstimate: boolean }).holdEstimate = true; });
    await page.selectOption("#pickProcess", nextProcess);
    await page.waitForFunction(() => (window as unknown as { waitingEstimate: boolean }).waitingEstimate);
    await page.locator("#dl3mf").focus();
    expect(await page.locator("#dl3mf").evaluate(element => element === document.activeElement)).toBe(true);
    await page.evaluate(() => (window as unknown as { releaseEstimate(): void }).releaseEstimate());
    await ready(page);
    expect(await page.locator("#dl3mf").evaluate(element => element === document.activeElement)).toBe(true);
    await page.waitForFunction(value => new URLSearchParams(location.hash.slice(1)).get("process") === value, nextProcess);
    expect(await page.evaluate(() => (window as unknown as { geometryRequests: number }).geometryRequests)).toBe(before.geometry);
    expect(await page.evaluate(() => (window as unknown as { estimateRequests: number }).estimateRequests)).toBeGreaterThan(before.estimates);
    expect(await page.locator("#pickProcess").inputValue()).toBe(nextProcess);
    expect(await page.locator("#dimensionDetails").getAttribute("open")).not.toBeNull();
    expect(await page.locator("#estimateDetails").textContent()).toContain("approximate");
  } finally { await page.close(); }
}, 120_000);
