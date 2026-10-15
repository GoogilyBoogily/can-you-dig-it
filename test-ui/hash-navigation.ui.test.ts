import { test, expect, beforeAll, afterAll } from "bun:test";
import { chromium, type Browser } from "playwright";
import { serveDist } from "../dev";

let browser: Browser;
let server: ReturnType<typeof serveDist>;
let address: string;
const sharedSettings = "machine=Bambu+Lab+P2S+0.4+nozzle&process=0.20mm+Standard+%40BBL+P2S&filament=Bambu+PLA+Basic+%40BBL+P2S";

beforeAll(async () => {
  const exitCode = await Bun.spawn(["bun", "run", "build.ts"], { stdout: "ignore", stderr: "inherit" }).exited;
  if (exitCode !== 0) throw new Error("build.ts failed, cannot run hash navigation tests");
  server = serveDist(0);
  address = `http://localhost:${server.port}/index.html`;
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser?.close();
  server?.stop(true);
});

test("an incoming fragment wins over an overdue edit before hashchange, even during generation", async () => {
  const context = await browser.newContext({ permissions: ["clipboard-read", "clipboard-write"] });
  const page = await context.newPage();
  // Hold the geometry worker busy while the main thread handles a new design.
  await page.route("**/worker.js", async (route) => {
    const original = await (await route.fetch()).text();
    await route.fulfill({ contentType: "text/javascript", body: `self.addEventListener("message", (event) => {
      if (event.data.type === "build") { const deadline = performance.now() + 600; while (performance.now() < deadline) {} }
    });\n${original}` });
  });
  await page.addInitScript(() => {
    const originalSetTimeout = window.setTimeout.bind(window);
    const originalClearTimeout = window.clearTimeout.bind(window);
    const pendingCallbacks = new Map<number, () => void>();
    window.clearTimeout = ((identifier?: number) => {
      if (identifier !== undefined) pendingCallbacks.delete(identifier);
      originalClearTimeout(identifier);
    }) as typeof window.clearTimeout;
    window.setTimeout = ((callback: TimerHandler, delay?: number, ...arguments_: unknown[]) => {
      if (typeof callback !== "function") return originalSetTimeout(callback, delay, ...arguments_);
      const identifier = originalSetTimeout(() => {
        pendingCallbacks.delete(identifier);
        callback(...arguments_);
      }, delay);
      if (delay === 250) pendingCallbacks.set(identifier, () => callback(...arguments_));
      return identifier;
    }) as typeof window.setTimeout;
    // Force an overdue debounce to run after location changes but before hashchange.
    // The browser can naturally produce this ordering when its task queue is busy.
    (window as unknown as { flushDebouncedEdits: () => void }).flushDebouncedEdits = () => {
      const callbacks = [...pendingCallbacks];
      pendingCallbacks.clear();
      for (const [identifier, callback] of callbacks) { clearTimeout(identifier); callback(); }
    };
  });
  await page.goto(`${address}#w=600&d=400&h=500`);
  await page.selectOption("#pickPrinter", "Bambu Lab X1 Carbon");
  const saved = await page.evaluate(() => localStorage.getItem("can-you-dig-it.profile"));
  await page.fill("#form [name=w]", "610");
  await page.evaluate((settings) => {
    location.hash = `w=160&d=305&h=254&cascade=off&base=gridfinity&layout=1&${settings}`;
    (window as unknown as { flushDebouncedEdits: () => void }).flushDebouncedEdits();
  }, sharedSettings);
  await page.waitForFunction(() => document.getElementById("profileNow")!.textContent!.includes("P2S"));
  expect(await page.inputValue("#form [name=w]")).toBe("160");
  expect(await page.isChecked("#form [name=cascade]")).toBe(false);
  expect(await page.isDisabled("#form [name=left]")).toBe(true);
  expect(await page.locator(".layout").nth(1).getAttribute("aria-pressed")).toBe("true");
  expect(await page.inputValue("#form [name=bedX]")).toBe("256");
  expect(await page.evaluate(() => localStorage.getItem("can-you-dig-it.profile"))).toBe(saved);
  await page.click("#share");
  await page.waitForFunction(() => document.getElementById("status")!.textContent === "Link copied.");
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(new URLSearchParams(new URL(copied).hash.slice(1)).get("machine")).toBe("Bambu Lab P2S 0.4 nozzle");
  await page.reload();
  await page.waitForFunction(() => document.getElementById("profileNow")!.textContent!.includes("P2S"));
  expect(await page.evaluate(() => localStorage.getItem("can-you-dig-it.profile"))).toBe(saved);
  await page.evaluate(() => { location.hash = ""; });
  await page.waitForFunction(() => document.getElementById("profileNow")!.textContent!.includes("X1 Carbon"));
  expect(await page.inputValue("#form [name=w]")).toBe("300");
  await context.close();
}, 90_000);

test("same-document links keep their pending settings while the catalogue is delayed or unavailable", async () => {
  for (const unavailable of [false, true]) {
    const context = await browser.newContext({ permissions: ["clipboard-read", "clipboard-write"] });
    const page = await context.newPage();
    let releaseCatalogue!: () => void;
    const catalogueGate = new Promise<void>((resolve) => { releaseCatalogue = resolve; });
    await page.route("**/profiles/index.json", async (route) => {
      await catalogueGate;
      if (unavailable) await route.abort();
      else await route.continue();
    });
    await page.goto(`${address}#w=600&d=400&h=500`);
    await page.fill("#form [name=w]", "610");
    await page.evaluate((settings) => { location.hash = `w=160&d=305&h=254&${settings}&translucent=on`; }, sharedSettings);
    await page.waitForFunction(() => (document.querySelector("#form [name=w]") as HTMLInputElement).value === "160");
    await page.click("#share");
    await page.waitForFunction(() => document.getElementById("status")!.textContent === "Link copied.");
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    const parameters = new URLSearchParams(new URL(copied).hash.slice(1));
    expect(parameters.get("machine")).toBe("Bambu Lab P2S 0.4 nozzle");
    expect(parameters.get("translucent")).toBe("on");
    releaseCatalogue();
    await page.waitForFunction((failed) => document.getElementById("profileNow")!.textContent!.includes(failed ? "Couldn't load" : "P2S"), unavailable);
    expect(new URLSearchParams(new URL(page.url()).hash.slice(1)).get("machine")).toBe("Bambu Lab P2S 0.4 nozzle");
    expect(await page.evaluate(() => localStorage.getItem("can-you-dig-it.profile"))).toBeNull();
    await context.close();
  }
}, 90_000);
