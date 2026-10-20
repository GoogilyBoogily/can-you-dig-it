import { afterAll, beforeAll, expect, test } from "bun:test";
import { chromium, type Browser, type Page } from "playwright";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { serveDist } from "../dev";
import type { MixedStackRequest } from "../src/model";

let browser: Browser;
let server: ReturnType<typeof serveDist>;
let address: string;
const compatible: MixedStackRequest[] = [
  { canDiameter: 66, canHeight: 122.5, depth: 240, tiers: 1 },
  { canDiameter: 66, canHeight: 157, depth: 240, tiers: 1 },
];
const incompatible = [compatible[0], { ...compatible[1], depth: 200 }];

beforeAll(async () => {
  const exitCode = await Bun.spawn(["bun", "run", "build.ts"], { stdout: "ignore", stderr: "inherit" }).exited;
  if (exitCode !== 0) throw new Error("build.ts failed, cannot run shared wall UI tests");
  server = serveDist(0); address = `http://localhost:${server.port}/index.html`;
  browser = await chromium.launch();
});
afterAll(async () => { await browser?.close(); server?.stop(true); });

function link(stacks = compatible, fields: Record<string, string> = {}) {
  return `${address}#${new URLSearchParams({ v: "4", mode: "mixed", shareWalls: "on", stacks: JSON.stringify(stacks),
    w: "600", d: "520", h: "400", cascade: "off", cover: "off", rearLoad: "off", slope: "0", lipGap: "5", ...fields })}`;
}
const sharing = (page: Page) => page.getByRole("checkbox", { name: "Share compatible walls", exact: true });
const stackField = (page: Page, index: number, field: string) => page.locator(".stack-card").nth(index).locator(`[data-stack-field="${field}"]`);
async function ready(page: Page) {
  await page.waitForSelector("#dl3mf:not([disabled])", { timeout: 90_000 });
  await page.waitForFunction(() => {
    const estimate = document.getElementById("estimateDetails");
    return !!estimate && !/recalculating/i.test(estimate.textContent ?? "");
  }, null, { timeout: 90_000 });
}
async function navigate(page: Page, url: string) {
  await page.evaluate(fragment => new Promise<void>(resolve => {
    if (location.hash === fragment) { resolve(); return; }
    window.addEventListener("hashchange", () => resolve(), { once: true });
    location.hash = fragment;
  }), new URL(url).hash);
}
async function downloadFiles(page: Page) {
  const completed = page.waitForEvent("download"); await page.click("#dl3mf");
  const stream = await (await completed).createReadStream();
  if (!stream) throw new Error("3MF download has no readable stream");
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return unzipSync(new Uint8Array(Buffer.concat(chunks)));
}

for (const version of ["2", "3"]) test(`legacy v${version} links ignore an injected sharing flag and reset incoming sharing`, async () => {
  const page = await browser.newPage();
  try {
    await page.goto(link()); await ready(page);
    expect(await sharing(page).isChecked()).toBe(true);
    await page.locator("footer details > summary").click();
    expect(await page.isHidden("#sharedWallAssembly")).toBe(false);
    await navigate(page, link(compatible, { v: version }));
    await page.waitForFunction(() => !(document.querySelector('[name="shareWalls"]') as HTMLInputElement).checked);
    await ready(page);
    expect(await page.locator("#wallSharingResult").count()).toBe(0);
    expect(await page.isHidden("#sharedWallAssembly")).toBe(true);
    expect(await page.isHidden("#mixedAssembly")).toBe(false);
    expect(new URLSearchParams(new URL(page.url()).hash.slice(1)).has("shareWalls")).toBe(false);
  } finally { await page.close(); }
});

for (const zeroEligible of [false, true]) test(`v4 sharing round trips ${zeroEligible ? "zero eligible boundaries" : "different can heights"} through Share and reload`, async () => {
  const context = await browser.newContext({ permissions: ["clipboard-read", "clipboard-write"] });
  const page = await context.newPage();
  try {
    await page.goto(link(zeroEligible ? incompatible : compatible)); await ready(page);
    expect(await sharing(page).isChecked()).toBe(true);
    const text = await page.textContent("#wallSharingResult");
    expect(text).toContain(zeroEligible ? "0 of 1" : "1 of 1");
    expect(text).toContain(zeroEligible ? "0.0 mm width saved" : "9.0 mm width saved");
    if (zeroEligible) { expect(text).toContain("No compatible boundaries"); expect(text).toMatch(/Stacks 1 and 2.*depth/i); }
    else {
      expect(await page.textContent("#summary")).toContain("304.5 × 240.0");
      await page.locator("footer details > summary").click();
      expect(await page.isHidden("#sharedWallAssembly")).toBe(false);
    }
    await page.click("#share");
    await page.waitForFunction(() => document.getElementById("status")!.textContent === "Link copied.");
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    const parameters = new URLSearchParams(new URL(copied).hash.slice(1));
    expect(parameters.get("v")).toBe("4"); expect(parameters.get("shareWalls")).toBe("on");
    await page.goto(copied); await ready(page);
    expect(await sharing(page).isChecked()).toBe(true);
    expect(await page.textContent("#wallSharingResult")).toBe(text);
  } finally { await context.close(); }
});

test("version 4 requires exactly one explicit strict sharing flag and malformed links never build defaults", async () => {
  const page = await browser.newPage();
  try {
    for (const flag of [null, "true", "false", "1", "", "ON", "on&shareWalls=off"]) {
      const url = new URL(link()); const parameters = new URLSearchParams(url.hash.slice(1));
      parameters.delete("shareWalls");
      if (flag !== null) for (const [key, value] of new URLSearchParams(`shareWalls=${flag}`)) parameters.append(key, value);
      await page.goto(`${address}#${parameters}`);
      await page.waitForFunction(() => document.getElementById("status")!.textContent!.includes("must be explicitly on or off"));
      expect(await page.isDisabled("#dl3mf")).toBe(true); expect(await page.isHidden("#results")).toBe(true);
    }
    await page.goto(link(compatible, { shareWalls: "off" })); await ready(page);
    expect(await sharing(page).isChecked()).toBe(false);
    await navigate(page, link()); await page.waitForFunction(() => (document.querySelector('[name="shareWalls"]') as HTMLInputElement).checked); await ready(page);
    await navigate(page, `${address}#w=160&d=305&h=254&cascade=off&shareWalls=on`);
    await page.waitForFunction(() => (document.getElementById("buildMode") as HTMLSelectElement).value === "uniform");
    expect(await page.locator('[name="shareWalls"]').isChecked()).toBe(false);
    await page.selectOption("#buildMode", "mixed");
    expect(await sharing(page).isChecked()).toBe(false);
  } finally { await page.close(); }
});

test("a shelf fits only after sharing without reducing either stack capacity", async () => {
  const page = await browser.newPage();
  try {
    const equal = [compatible[0], compatible[0]];
    await page.goto(link(equal, { w: "278", shareWalls: "off" }));
    await page.waitForFunction(() => document.getElementById("status")!.textContent!.includes("width"));
    expect(await page.isDisabled("#dl3mf")).toBe(true);
    await sharing(page).check(); await ready(page);
    expect(await page.textContent("#summary")).toContain("6 cans in 2 stacks");
    expect(await page.textContent("#summary")).toContain("270.0 × 240.0");
    expect(await page.textContent("#wallSharingResult")).toContain("9.0 mm width saved");
    await sharing(page).uncheck();
    expect(await page.isDisabled("#dl3mf")).toBe(true);
    await page.waitForFunction(() => document.getElementById("status")!.textContent!.includes("width"));
  } finally { await page.close(); }
});

test("hybrid boundaries export every shared and retained part with stable adjacency and latest profile bytes", async () => {
  const page = await browser.newPage();
  try {
    await page.goto(link([...compatible, { ...compatible[0], canDiameter: 53, depth: 200 }])); await ready(page);
    expect(await page.textContent("#wallSharingResult")).toContain("1 of 2");
    expect(await page.textContent("#wallSharingResult")).toContain("Stacks 2 and 3");
    const config = JSON.stringify({ filament_density: ["1.27"], task_note: "shared wall latest settings" });
    await page.setInputFiles("#profileIn", { name: "shared.3mf", mimeType: "model/3mf", buffer: Buffer.from(zipSync({ "3D/3dmodel.model": strToU8("<model/>"), "Metadata/project_settings.config": strToU8(config) })) });
    await ready(page);
    const archive = await downloadFiles(page);
    const model = strFromU8(archive["3D/3dmodel.model"]), metadata = strFromU8(archive["Metadata/model_settings.config"]);
    expect(strFromU8(archive["Metadata/project_settings.config"])).toBe(config);
    expect(model).not.toContain("connection-1-spline"); expect(model).toContain("connection-2-spline");
    const splines = [...model.matchAll(/name="connection-2-spline-/g)].length;
    expect(splines).toBeGreaterThan(0);
    // Nine shared-pair pieces: two decks, three walls, two ends, two lips.
    // The retained third stack has five pieces, plus every joining-key segment.
    expect([...model.matchAll(/<object /g)]).toHaveLength(14 + splines);
    expect([...model.matchAll(/<item /g)]).toHaveLength(14 + splines);
    expect([...metadata.matchAll(/<model_instance>/g)]).toHaveLength(14 + splines);
    expect(model).toContain("stack-1-"); expect(model).toContain("stack-2-"); expect(model).toContain("stack-3-");
  } finally { await page.close(); }
});

test("keyboard reorder and row edits recompute each actual boundary", async () => {
  const page = await browser.newPage();
  try {
    await page.goto(link([...compatible, { ...compatible[0], depth: 200 }])); await ready(page);
    expect(await page.textContent("#wallSharingResult")).toContain("1 of 2");
    await page.getByRole("button", { name: "Reorder stack 2", exact: true }).focus(); await page.keyboard.press("ArrowDown");
    expect(await page.isDisabled("#dl3mf")).toBe(true); await ready(page);
    expect(await page.textContent("#wallSharingResult")).toContain("0 of 2");
    await stackField(page, 1, "depth").evaluate(element => { const input = element as HTMLInputElement; input.value = "240"; input.dispatchEvent(new Event("input", { bubbles: true })); });
    await ready(page); expect(await page.textContent("#wallSharingResult")).toContain("2 of 2");
    await page.locator('[name="bedX"]').fill("300"); await ready(page);
    expect(await page.textContent("#wallSharingResult")).toContain("18.0 mm width saved");
    expect(await page.textContent("#summary")).toContain("300 × 256 mm bed");
  } finally { await page.close(); }
});

type HeldWindow = Window & { releaseSharedReply?: () => void; sharedRequests: { type: string; layout?: { request: { shareCompatibleWalls?: boolean } } }[] };
test("a stale failed shared build cannot replace the latest ordinary build or unlock stale exports", async () => {
  const page = await browser.newPage();
  try {
    await page.addInitScript(() => {
      const audited = window as unknown as HeldWindow; audited.sharedRequests = [];
      const NativeWorker = window.Worker; let held = false;
      window.Worker = class extends NativeWorker {
        override postMessage(message: unknown, transfers: Transferable[] | StructuredSerializeOptions = []) {
          audited.sharedRequests.push(structuredClone(message) as HeldWindow["sharedRequests"][number]);
          if (Array.isArray(transfers)) super.postMessage(message, transfers); else super.postMessage(message, transfers);
        }
        override set onmessage(callback: ((this: Worker, event: MessageEvent) => unknown) | null) {
          super.onmessage = event => {
            if (!callback) return;
            if (event.data.type !== "built" || held) { callback.call(this, event); return; }
            held = true;
            audited.releaseSharedReply = () => { delete audited.releaseSharedReply; callback.call(this, new MessageEvent("message", { data: { type: "error", of: "build-mixed", id: event.data.id, message: "obsolete shared failure", fatal: true } })); };
          };
        }
      };
    });
    await page.goto(link()); await page.waitForFunction(() => !!(window as unknown as HeldWindow).releaseSharedReply);
    await sharing(page).uncheck(); expect(await page.isDisabled("#dl3mf")).toBe(true);
    await page.evaluate(() => (window as unknown as HeldWindow).releaseSharedReply!()); await ready(page);
    expect(await page.locator("#wallSharingResult").count()).toBe(0);
    expect(await page.textContent("#status")).not.toContain("obsolete shared failure");
    const requests = await page.evaluate(() => (window as unknown as HeldWindow).sharedRequests.filter(request => request.type === "build-mixed"));
    expect(requests.map(request => request.layout!.request.shareCompatibleWalls === true)).toEqual([true, false]);
    const model = strFromU8((await downloadFiles(page))["3D/3dmodel.model"]);
    expect(model).toContain("connection-1-spline");
  } finally { await page.close(); }
});

test("expanded shared guidance keeps Share, keyboard navigation and the canvas usable on short desktop and phone", async () => {
  for (const viewport of [{ width: 1280, height: 720 }, { width: 1280, height: 560 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport, permissions: ["clipboard-read", "clipboard-write"] });
    const page = await context.newPage();
    try {
      await page.goto(link()); await ready(page);
      const summary = page.locator("footer details > summary");
      await summary.focus(); await page.keyboard.press("Space");
      expect(await page.isHidden("#sharedWallAssembly")).toBe(false);
      expect(await summary.evaluate(element => document.activeElement === element)).toBe(true);
      await page.click("#share");
      await page.waitForFunction(() => document.getElementById("status")!.textContent === "Link copied.");
      expect((await page.locator("#viewer canvas").boundingBox())!.height).toBeGreaterThanOrEqual(200);
      const bounds = await page.evaluate(() => ({
        stageBottom: document.querySelector(".stage")!.getBoundingClientRect().bottom,
        footerTop: document.querySelector("footer")!.getBoundingClientRect().top,
        scrollHeight: document.documentElement.scrollHeight,
      }));
      expect(bounds.footerTop).toBeGreaterThanOrEqual(bounds.stageBottom);
      await page.screenshot({ path: `/tmp/cyd-shared-wall-guidance-${viewport.width}-${viewport.height}.png`, fullPage: true });
      await page.getByRole("button", { name: "1 · Setup", exact: true }).click();
      expect(await page.locator("#setupHeading").evaluate(element => document.activeElement === element)).toBe(true);
      await summary.focus(); await page.keyboard.press("Space");
      expect(await page.isHidden("#sharedWallAssembly")).toBe(true);
      await page.click("#share");
      expect((await page.locator("#viewer canvas").boundingBox())!.height).toBeGreaterThanOrEqual(200);
    } finally { await context.close(); }
  }
});

test("shared wall controls, focus and all preview modes remain usable on desktop and phone in both themes", async () => {
  for (const screen of [{ name: "desktop", width: 1440, height: 1000 }, { name: "phone", width: 390, height: 844 }]) for (const theme of ["light", "dark"]) {
    const page = await browser.newPage({ viewport: { width: screen.width, height: screen.height } });
    try {
      await page.goto(link(compatible, { cover: "on" })); await ready(page); await page.selectOption("#theme", theme);
      const control = sharing(page); await control.focus();
      expect(await control.evaluate(element => getComputedStyle(element).outlineStyle)).not.toBe("none");
      expect(await control.evaluate(element => element.closest("label")!.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.locator("#mixedEditor").screenshot({ path: `/tmp/cyd-shared-walls-${screen.name}-${theme}-controls.png` });
      await page.locator("#wallSharingResult").screenshot({ path: `/tmp/cyd-shared-walls-${screen.name}-${theme}-result.png` });
      await page.locator("#viewer").scrollIntoViewIfNeeded();
      await page.locator("#viewer").screenshot({ path: `/tmp/cyd-shared-walls-${screen.name}-${theme}-assembly.png` });
      await page.locator("#tabs button").nth(1).click(); expect(await page.isHidden("#showCans")).toBe(true);
      await page.locator("#viewer").screenshot({ path: `/tmp/cyd-shared-walls-${screen.name}-${theme}-part.png` });
      await page.locator("#plates button").first().click(); expect(await page.isHidden("#showGrid")).toBe(true);
      await page.locator("#viewer").screenshot({ path: `/tmp/cyd-shared-walls-${screen.name}-${theme}-plate.png` });
      await control.focus(); await page.keyboard.press("Space"); expect(await control.isChecked()).toBe(false); await ready(page);
      await page.locator("#mixedEditor").screenshot({ path: `/tmp/cyd-shared-walls-${screen.name}-${theme}-off.png` });
      expect(await page.locator("#wallSharingResult").count()).toBe(0);
      await navigate(page, link(incompatible, { cover: "on" }));
      await page.waitForFunction(() => (document.querySelector('[name="shareWalls"]') as HTMLInputElement).checked);
      await ready(page);
      await page.locator("#wallSharingResult").screenshot({ path: `/tmp/cyd-shared-walls-${screen.name}-${theme}-retained.png` });
      await page.locator("#status").screenshot({ path: `/tmp/cyd-shared-walls-${screen.name}-${theme}-status.png` });
    } finally { await page.close(); }
  }
});
