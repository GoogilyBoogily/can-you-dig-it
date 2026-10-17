import { test, expect, beforeAll, afterAll } from "bun:test";
import { chromium, type Browser, type Page } from "playwright";
import { unzipSync, strFromU8, zipSync, strToU8 } from "fflate";
import { serveDist } from "../dev";
import { INDEX_URL, defaultPicks, composeProfile, type ProfileIndex } from "../src/profiles";

const origin = "http://localhost:3113";
const index: ProfileIndex = await Bun.file(INDEX_URL).json();
let browser: Browser;
let server: ReturnType<typeof serveDist>;

beforeAll(async () => {
  const result = await Bun.spawn(["bun", "run", "build.ts"], { stdout: "ignore", stderr: "inherit" }).exited;
  if (result !== 0) throw new Error("build.ts failed");
  server = serveDist(3113);
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser?.close();
  server?.stop(true);
});

async function exportedConfig(page: Page) {
  await page.waitForSelector("#dl3mf:not([disabled])", { timeout: 90_000 });
  const completed = page.waitForEvent("download");
  await page.click("#dl3mf");
  const stream = await (await completed).createReadStream();
  if (!stream) throw new Error("download has no readable stream");
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const files = unzipSync(new Uint8Array(Buffer.concat(chunks)));
  return { files, config: JSON.parse(strFromU8(files["Metadata/project_settings.config"]!)) };
}

test("clearing translucent settings immediately refreshes print estimates", async () => {
  const page = await browser.newPage();
  try {
    await page.goto(`${origin}/index.html#w=160&d=305&h=254`);
    await page.waitForSelector("#dl3mf:not([disabled])", { timeout: 90_000 });
    await page.waitForFunction(() => (document.getElementById("pickPrinter") as HTMLSelectElement).options.length > 1);
    await page.selectOption("#pickPrinter", "Bambu Lab P2S");
    await page.check("#pickTranslucent");
    await page.waitForFunction(() => document.getElementById("summary")!.textContent!.includes("solid"));
    await page.click("#profileClear");
    expect(await page.isChecked("#pickTranslucent")).toBe(false);
    expect(await page.textContent("#profileNow")).toContain("No print settings loaded");
    expect(await page.textContent("#summary")).not.toContain("solid");
    expect(await page.evaluate(() => localStorage.getItem("can-you-dig-it.profile"))).toBeNull();
    const completed = page.waitForEvent("download");
    await page.click("#dl3mf");
    const stream = await (await completed).createReadStream();
    if (!stream) throw new Error("download has no readable stream");
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    expect(unzipSync(new Uint8Array(Buffer.concat(chunks)))["Metadata/project_settings.config"]).toBeUndefined();
  } finally {
    await page.close();
  }
});

test("changing to a 0.2 nozzle turns translucent mode off everywhere", async () => {
  const page = await browser.newPage();
  await page.goto(`${origin}/index.html#w=160&d=305&h=254`);
  await page.waitForFunction(() => (document.getElementById("pickPrinter") as HTMLSelectElement).options.length > 1);
  await page.selectOption("#pickPrinter", "Bambu Lab P2S");
  await page.check("#pickTranslucent");
  await page.selectOption("#pickNozzle", "Bambu Lab P2S 0.2 nozzle");
  expect(await page.isChecked("#pickTranslucent")).toBe(false);
  expect(await page.isDisabled("#pickTranslucent")).toBe(true);
  expect(await page.textContent("#profileNow")).toContain("Translucent mode was turned off");
  await page.waitForFunction(() => !location.hash.includes("translucent=on"));
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("can-you-dig-it.profile")!));
  const persisted = JSON.parse(Buffer.from(stored.configBase64, "base64").toString());
  expect(persisted.printer_settings_id).toBe("Bambu Lab P2S 0.2 nozzle");
  expect(persisted.sparse_infill_density).toBeUndefined();
  const { config } = await exportedConfig(page);
  expect(config.printer_settings_id).toBe(persisted.printer_settings_id);
  expect(config.sparse_infill_pattern).toBeUndefined();
  expect(config.fan_max_speed).toBeUndefined();
  expect(await page.textContent("#summary")).not.toContain("solid");
  await page.close();
});

test("a shared 0.2 nozzle link turns off unsupported translucent settings", async () => {
  const page = await browser.newPage();
  const picks = defaultPicks(index, "Bambu Lab P2S 0.2 nozzle");
  const query = new URLSearchParams({ ...picks, translucent: "on", w: "160", d: "305", h: "254" });
  await page.goto(`${origin}/index.html#${query}`);
  await page.waitForFunction(() => document.getElementById("profileNow")!.textContent!.includes("Translucent mode was turned off"));
  const { config } = await exportedConfig(page);
  expect(config.printer_settings_id).toBe(picks.machine);
  expect(config.sparse_infill_density).toBeUndefined();
  expect(await page.evaluate(() => localStorage.getItem("can-you-dig-it.profile"))).toBeNull();
  expect(await page.isChecked("#pickTranslucent")).toBe(false);
  expect(page.url()).not.toContain("translucent=on");
  await page.close();
});

test("an incompatible known preset link keeps the stored profile and usable picker", async () => {
  const page = await browser.newPage();
  const original = composeProfile(index, defaultPicks(index, "Bambu Lab P2S 0.4 nozzle"));
  const stored = JSON.stringify({ v: 2, name: "my profile", configBase64: Buffer.from(original).toString("base64") });
  await page.addInitScript((profile) => localStorage.setItem("can-you-dig-it.profile", profile), stored);
  const picks = { ...defaultPicks(index, "Bambu Lab P2S 0.4 nozzle"), machine: "Bambu Lab P2S 0.2 nozzle" };
  await page.goto(`${origin}/index.html#${new URLSearchParams({ machine: picks.machine, process: picks.process, filament: picks.filament, w: "160", d: "305", h: "254" })}`);
  await page.waitForFunction(() => document.getElementById("profileNow")!.textContent!.includes("unavailable or incompatible"));
  expect(await page.inputValue("#pickNozzle")).toBe("Bambu Lab P2S 0.4 nozzle");
  expect(await page.isDisabled("#pickPrinter")).toBe(false);
  expect(await page.evaluate(() => localStorage.getItem("can-you-dig-it.profile"))).toBe(stored);
  const { files } = await exportedConfig(page);
  expect(files["Metadata/project_settings.config"]).toEqual(new Uint8Array(original));
  await page.close();
});

test("imported custom settings retain their bytes even with incompatible known names", async () => {
  const page = await browser.newPage();
  await page.goto(`${origin}/index.html#w=160&d=305&h=254`);
  await page.waitForSelector("#dl3mf:not([disabled])", { timeout: 90_000 });
  const composed = composeProfile(index, defaultPicks(index, "Bambu Lab P2S 0.4 nozzle"));
  const config = new TextEncoder().encode(JSON.stringify({
    ...JSON.parse(new TextDecoder().decode(composed)),
    printer_settings_id: "Bambu Lab P2S 0.2 nozzle",
    custom_setting: "preserve this",
  }));
  await page.setInputFiles("#profileIn", {
    name: "custom.3mf", mimeType: "model/3mf",
    buffer: Buffer.from(zipSync({ "Metadata/project_settings.config": config, "3D/3dmodel.model": strToU8("<model/>") })),
  });
  await page.waitForFunction(() => document.getElementById("profileNow")!.textContent!.includes("custom.3mf"));
  expect(await page.inputValue("#pickPrinter")).toBe("");
  const { files } = await exportedConfig(page);
  expect(files["Metadata/project_settings.config"]).toEqual(config);
  await page.close();
});

type AuditWindow = Window & { auditRequests: { type: string; id: number; options?: { slope: number } }[] };

async function delayedWorkerPage(mode: "success" | "error" | "fatal") {
  const page = await browser.newPage();
  await page.addInitScript((responseMode) => {
    const auditWindow = window as unknown as AuditWindow;
    auditWindow.auditRequests = [];
    const NativeWorker = window.Worker;
    let delayed = false;
    window.Worker = class extends NativeWorker {
      override postMessage(message: unknown, transferOrOptions: Transferable[] | StructuredSerializeOptions = []) {
        auditWindow.auditRequests.push(structuredClone(message) as AuditWindow["auditRequests"][number]);
        if (Array.isArray(transferOrOptions)) super.postMessage(message, transferOrOptions);
        else super.postMessage(message, transferOrOptions);
      }
      override set onmessage(callback: ((this: Worker, event: MessageEvent) => unknown) | null) {
        super.onmessage = (event) => {
          if (!callback) return;
          if (event.data.type !== "built" || delayed) { callback.call(this, event); return; }
          delayed = true;
          const response = responseMode === "success" ? event : new MessageEvent("message", { data: {
            type: "error", id: event.data.id, of: "build", message: "injected first-build failure", fatal: responseMode === "fatal",
          } });
          setTimeout(() => callback.call(this, response), 4000);
        };
      }
    };
  }, mode);
  await page.goto(`${origin}/index.html#w=160&d=305&h=254`);
  await page.waitForFunction(() => (window as unknown as AuditWindow).auditRequests.length === 1);
  return page;
}

for (const mode of ["success", "error", "fatal"] as const) {
  test(`a delayed ${mode} sends only the first and latest build`, async () => {
    const page = await delayedWorkerPage(mode);
    await page.locator("#feedingOptions > summary").click();
    for (const slope of [4, 5, 6]) {
      await page.fill("#form [name=slope]", String(slope));
      await page.waitForTimeout(350); // each edit passes the real 250 ms debounce
      expect(await page.isDisabled("#dl3mf")).toBe(true);
    }
    expect(await page.evaluate(() => (window as unknown as AuditWindow).auditRequests.length)).toBe(1);
    await page.waitForSelector("#dl3mf:not([disabled])", { timeout: 90_000 });
    const requests = await page.evaluate(() => (window as unknown as AuditWindow).auditRequests.filter((request) => request.type === "build"));
    expect(requests.map((request) => request.options!.slope)).toEqual([3, 6]);
    expect(await page.textContent("#summary")).toContain("6°");
    await page.close();
  });
}

test("invalid input discards the pending request and cannot revive a stale build", async () => {
  const page = await delayedWorkerPage("success");
  await page.locator("#feedingOptions > summary").click();
  await page.fill("#form [name=slope]", "5");
  await page.waitForTimeout(350);
  await page.fill("#form [name=w]", "10");
  await page.waitForTimeout(4500);
  expect(await page.evaluate(() => (window as unknown as AuditWindow).auditRequests.length)).toBe(1);
  expect(await page.isDisabled("#dl3mf")).toBe(true);
  expect(await page.isHidden("#results")).toBe(true);
  expect(await page.textContent("#status")).toContain("Check your numbers");
  await page.fill("#form [name=w]", "160");
  await page.waitForSelector("#dl3mf:not([disabled])", { timeout: 90_000 });
  const requests = await page.evaluate(() => (window as unknown as AuditWindow).auditRequests);
  expect(requests.map((request) => request.options!.slope)).toEqual([3, 5]);
  await page.close();
});
