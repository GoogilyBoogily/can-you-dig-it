import { afterAll, beforeAll, expect, test } from "bun:test";
import { chromium, type Browser, type Page } from "playwright";
import { unzipSync } from "fflate";
import { serveDist } from "../dev";

let browser: Browser;
let server: ReturnType<typeof serveDist>;
let address: string;
beforeAll(async () => {
  const exitCode = await Bun.spawn(["bun", "run", "build.ts"], { stdout: "ignore", stderr: "inherit" }).exited;
  if (exitCode !== 0) throw new Error("build.ts failed");
  server = serveDist(0); address = `http://localhost:${server.port}/index.html`;
  browser = await chromium.launch();
});
afterAll(async () => { await browser?.close(); server?.stop(true); });

async function ready(page: Page) {
  await page.waitForFunction(() => !document.getElementById("results")!.hidden
    && !(document.getElementById("dl3mf") as HTMLButtonElement).disabled
    && !document.getElementById("status")!.classList.contains("busy"), null, { timeout: 90_000 });
}
async function exportedNames(page: Page) {
  const download = page.waitForEvent("download"); await page.click("#dlstl");
  const stream = await (await download).createReadStream();
  if (!stream) throw new Error("download has no stream");
  const chunks: Buffer[] = []; for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Object.keys(unzipSync(Buffer.concat(chunks)));
}
const mixedRows = [
  { canDiameter: 66, canHeight: 230, depth: 710, tiers: 1, cascade: false, slope: 0, cover: true },
  { canDiameter: 53, canHeight: 134, depth: 200, tiers: 1, cascade: false, slope: 0, cover: true },
];

for (const mode of ["mixed", "uniform"]) test(`${mode} profile changes replan seams and clearing exclusions restores the previous count`, async () => {
  const page = await browser.newPage();
  try {
    await page.addInitScript(() => {
      const state = window as unknown as { printerBuilds: any[] }; state.printerBuilds = [];
      const NativeWorker = window.Worker;
      window.Worker = class extends NativeWorker {
        override postMessage(message: any) {
          if (message.type === "build" || message.type === "build-mixed") state.printerBuilds.push({
            type: message.type, keepOut: message.keepOut,
            constraints: message.options?.bedKeepOut ?? message.layout.request.shared.bedKeepOut,
          });
          super.postMessage(message);
        }
      };
    });
    const hash = new URLSearchParams({ w: mode === "mixed" ? "500" : "260", d: "710", h: "110", front: "0",
      canD: "66", canL: "230", bedX: "256", bedY: "256", bedZ: "256", left: "none", right: "none",
      cascade: "off", cover: "on", slope: "0", ...(mode === "mixed" ? { v: "3", mode: "mixed", stacks: JSON.stringify(mixedRows) } : {}) });
    await page.goto(`${address}#${hash}`); await ready(page);
    const prefix = mode === "mixed" ? "Stack 1 · Lane Deck" : "Lane Deck";
    const third = page.getByRole("tab", { name: `${prefix} Section 3`, exact: true });
    const fourth = page.getByRole("tab", { name: `${prefix} Section 4`, exact: true });
    expect(await third.count()).toBe(1); expect(await fourth.count()).toBe(0);
    await page.waitForFunction(() => (document.getElementById("pickPrinter") as HTMLSelectElement).options.length > 1);
    await page.selectOption("#pickPrinter", "Bambu Lab X1 Carbon"); await ready(page);
    expect(await fourth.count()).toBe(1);
    const request = await page.evaluate(() => (window as unknown as { printerBuilds: any[] }).printerBuilds.at(-1));
    expect(request.keepOut).toEqual([[0, 0, 18, 28]]);
    expect(request.constraints).toEqual(request.keepOut);
    expect((await exportedNames(page)).some(name => /deck-section-4\.stl$/.test(name))).toBe(true);
    if (mode === "mixed") expect(await page.locator('[data-stack-field="depth"]').first().inputValue()).toBe("710");
    await page.click("#profileClear"); await ready(page);
    expect(await third.count()).toBe(1); expect(await fourth.count()).toBe(0);
    expect(await page.evaluate(() => (window as unknown as { printerBuilds: any[] }).printerBuilds.at(-1).constraints)).toEqual([]);
  } finally { await page.close(); }
}, 120_000);

test("a decimal custom bed produces a downloadable exact-depth mixed organizer", async () => {
  const page = await browser.newPage();
  try {
    const rows = [
      { canDiameter: 66, canHeight: 80, depth: 378.3, tiers: 1, cascade: false, slope: 0 },
      { canDiameter: 53, canHeight: 80, depth: 200, tiers: 1, cascade: false, slope: 0 },
    ];
    const hash = new URLSearchParams({ v: "3", mode: "mixed", stacks: JSON.stringify(rows), w: "300", d: "378.3", h: "120", front: "0",
      bedX: "140.1", bedY: "140.1", bedZ: "256", cascade: "off", cover: "on", slope: "0" });
    await page.goto(`${address}#${hash}`); await ready(page);
    expect(await page.locator('[data-stack-field="depth"]').first().inputValue()).toBe("378.3");
    expect(await page.getByRole("tab", { name: "Stack 1 · Lane Deck Section 4", exact: true }).count()).toBe(1);
    expect((await exportedNames(page)).some(name => /stack-1-lane-deck-section-4\.stl$/.test(name))).toBe(true);
    expect(await page.locator("#status").textContent()).not.toContain("FAIL");
  } finally { await page.close(); }
}, 120_000);
