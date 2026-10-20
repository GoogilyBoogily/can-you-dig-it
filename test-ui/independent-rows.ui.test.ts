import { afterAll, beforeAll, expect, test } from "bun:test";
import { chromium, type Browser, type Page } from "playwright";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { serveDist } from "../dev";
import type { IndependentLaneRequest, IndependentRowRequest } from "../src/model";

let browser: Browser;
let server: ReturnType<typeof serveDist>;
let address: string;
const lane: IndependentLaneRequest = { canDiameter: 66, canHeight: 122.5, depth: 240, slope: 3, lipGap: 5 };
const row = (lanes: IndependentLaneRequest[] = [lane], fields: Partial<IndependentRowRequest> = {}): IndependentRowRequest => ({
  lanes, repeat: 1, rowHeight: "auto", rowSpan: "auto", alignment: "centre", rearLoad: false, ...fields,
});
const reportedRows = [row(Array.from({ length: 2 }, () => ({ ...lane, depth: 279.4, canHeight: 157 })), { rowSpan: 420 }),
  row(Array.from({ length: 3 }, () => ({ ...lane, depth: 279.4 })))];

beforeAll(async () => {
  const code = await Bun.spawn(["bun", "run", "build.ts"], { stdout: "ignore", stderr: "inherit" }).exited;
  if (code !== 0) throw new Error("build.ts failed, cannot test custom rows");
  server = serveDist(0); address = `http://localhost:${server.port}/index.html`;
  browser = await chromium.launch();
});
afterAll(async () => { await browser?.close(); server?.stop(true); });

function link(rows = [row()], fields: Record<string, string> = {}) {
  return `${address}#${new URLSearchParams({ v: "5", mode: "rows", rows: JSON.stringify(rows), shareWalls: "off", topCover: "on",
    w: "600", d: "400", h: "500", front: "0", base: "flat", ...fields })}`;
}
async function ready(page: Page) {
  await page.waitForSelector("#dl3mf:not([disabled])", { timeout: 90_000 });
  await page.waitForFunction(() => !/recalculating/i.test(document.getElementById("estimateDetails")?.textContent ?? "recalculating"), null, { timeout: 90_000 });
}
async function navigate(page: Page, url: string) {
  await page.evaluate(fragment => new Promise<void>(resolve => {
    if (location.hash === fragment) { resolve(); return; }
    window.addEventListener("hashchange", () => resolve(), { once: true }); location.hash = fragment;
  }), new URL(url).hash);
}
const cards = (page: Page) => page.locator(".custom-row-card");
const rowField = (page: Page, visualRow: number, field: string) => cards(page).nth(visualRow).locator(`[data-row-field="${field}"]`);
const laneField = (page: Page, visualRow: number, visualLane: number, field: string) => cards(page).nth(visualRow).locator(".custom-lane-card").nth(visualLane).locator(`[data-lane-field="${field}"]`);
async function currentRows(page: Page): Promise<IndependentRowRequest[]> {
  return page.evaluate(() => JSON.parse(new URLSearchParams(location.hash.slice(1)).get("rows")!));
}
async function downloadFiles(page: Page) {
  const completed = page.waitForEvent("download"); await page.click("#dl3mf");
  const stream = await (await completed).createReadStream();
  if (!stream) throw new Error("3MF download has no readable stream");
  const chunks: Buffer[] = []; for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return unzipSync(new Uint8Array(Buffer.concat(chunks)));
}

test("v5 singleton round trips explicit flags and exact independent lane settings", async () => {
  const context = await browser.newContext({ permissions: ["clipboard-read", "clipboard-write"] });
  const page = await context.newPage();
  const requests = [row([{ ...lane, canHeight: 157, slope: 0, lipGap: 0 }], { rowHeight: 100.5, rowSpan: 200, alignment: "left", rearLoad: true })];
  try {
    await page.goto(link(requests, { shareWalls: "on", topCover: "off" })); await ready(page);
    expect(await page.locator("#buildMode").inputValue()).toBe("rows");
    expect(await cards(page).count()).toBe(1); expect(await page.locator(".custom-lane-card").count()).toBe(1);
    expect(await page.locator('[name="rowsShareWalls"]').isChecked()).toBe(true);
    expect(await page.locator('[name="rowsTopCover"]').isChecked()).toBe(false);
    expect(await page.textContent("#summary")).toContain("3 cans in 1 row");
    expect(await page.textContent("#summary")).toContain("no eligible shared boundary");
    await page.selectOption("#pickPrinter", "Bambu Lab P2S");
    await page.waitForFunction(() => (document.getElementById("pickNozzle") as HTMLSelectElement).value !== "");
    await page.check("#pickTranslucent");
    await page.locator('[name="front"]').fill("17.2"); await page.locator('[name="w"]').fill("601.5"); await ready(page);
    const selectedProfile = await page.evaluate(() => ({ machine: (document.getElementById("pickNozzle") as HTMLSelectElement).value,
      process: (document.getElementById("pickProcess") as HTMLSelectElement).value, filament: (document.getElementById("pickFilament") as HTMLSelectElement).value }));
    await page.locator("footer details > summary").click(); expect(await page.isHidden("#rowsAssembly")).toBe(false);
    await page.click("#share");
    await page.waitForFunction(() => document.getElementById("status")!.textContent === "Link copied.");
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    const parameters = new URLSearchParams(new URL(copied).hash.slice(1));
    expect(parameters.get("v")).toBe("5"); expect(parameters.get("mode")).toBe("rows");
    expect(parameters.get("front")).toBe("17.2"); expect(parameters.get("w")).toBe("601.5");
    expect(parameters.get("machine")).toBe(selectedProfile.machine); expect(parameters.get("process")).toBe(selectedProfile.process);
    expect(parameters.get("filament")).toBe(selectedProfile.filament); expect(parameters.get("translucent")).toBe("on");
    expect(parameters.get("shareWalls")).toBe("on"); expect(parameters.get("topCover")).toBe("off");
    expect(parameters.has("cascade")).toBe(false); expect(parameters.has("stacks")).toBe(false);
    expect(JSON.parse(parameters.get("rows")!)).toEqual(requests);
    await page.goto(copied); await ready(page); expect(await currentRows(page)).toEqual(requests);
    expect(await page.locator('[name="front"]').inputValue()).toBe("17.2"); expect(await page.locator('[name="w"]').inputValue()).toBe("601.5");
    expect(await page.inputValue("#pickNozzle")).toBe(selectedProfile.machine); expect(await page.inputValue("#pickProcess")).toBe(selectedProfile.process);
    expect(await page.inputValue("#pickFilament")).toBe(selectedProfile.filament); expect(await page.isChecked("#pickTranslucent")).toBe(true);
  } finally { await context.close(); }
});

test("reported two-wide lower and three-narrow upper rows use real support parts and retain exact dimensions", async () => {
  const page = await browser.newPage();
  try {
    await page.goto(link(reportedRows, { w: "457.2", d: "279.4", h: "241", shareWalls: "on", design: "minimal", pattern: "hex", hexAuto: "off", hexR: "13" })); await ready(page);
    expect(await currentRows(page)).toEqual(reportedRows);
    expect(await cards(page).nth(0).locator("h3").textContent()).toContain("Row 2");
    expect(await cards(page).nth(1).locator("h3").textContent()).toContain("Row 1 · bottom");
    expect(await cards(page).nth(0).locator(".custom-lane-card").count()).toBe(3);
    expect(await cards(page).nth(1).locator(".custom-lane-card").count()).toBe(2);
    const summary = await page.textContent("#summary");
    expect(summary).toContain("15 cans in 2 rows"); expect(summary).toContain("438.0 × 279.4");
    expect(summary).toContain("1 carrier transition"); expect(summary).toContain("75.0 mm");
    expect(summary).toContain("keep both walls"); expect(summary).toContain("157 mm height"); expect(summary).toContain("122.5 mm height");
    const archive = await downloadFiles(page); const model = strFromU8(archive["3D/3dmodel.model"]);
    expect(model).toContain("row-1-"); expect(model).toContain("row-2-");
    expect(model).toMatch(/transition-1-carrier-/); expect(model).toMatch(/transition-1-shoe-/); expect(model).toMatch(/transition-1-key-/);
    expect([...model.matchAll(/<object /g)].length).toBeGreaterThan(30);
    expect(await page.evaluate(() => (window as unknown as { viewerInfo(): { geometries: number } }).viewerInfo().geometries)).toBeGreaterThan(0);
  } finally { await page.close(); }
});

test("row padding and unsupported inputs stay visible and recover without losing another lane", async () => {
  const page = await browser.newPage();
  const requests = [row([{ ...lane, canDiameter: 20, slope: 0, lipGap: 0 }, { ...lane, slope: 0, lipGap: 0 }], { rowHeight: 100.5 })];
  try {
    await page.goto(link(requests)); await ready(page);
    expect(await cards(page).locator('[data-lane-resolution]').nth(1).textContent()).toContain("56.5 mm");
    expect(await page.textContent("#summary")).toContain("100.5 mm (exact; minimum 90.0 mm)");
    await laneField(page, 0, 0, "depth").fill("239");
    await page.waitForFunction(() => document.getElementById("status")!.textContent!.includes("common depth"));
    expect(await page.isDisabled("#dl3mf")).toBe(true);
    expect(await laneField(page, 0, 0, "depth").inputValue()).toBe("239");
    expect(await laneField(page, 0, 1, "canDiameter").inputValue()).toBe("20");
    expect(await page.locator(".custom-lane-card").count()).toBe(2);
    await page.locator("#status").screenshot({ path: "/tmp/cyd-custom-rows-unsupported-depth-status.png" });
    await laneField(page, 0, 0, "depth").fill("240"); await ready(page);
    await rowField(page, 0, "rowHeight").fill("89");
    await page.waitForFunction(() => document.getElementById("status")!.textContent!.includes("below the required"));
    expect(await rowField(page, 0, "rowHeight").inputValue()).toBe("89");
    await rowField(page, 0, "rowHeight").fill("100.5"); await ready(page);
  } finally { await page.close(); }
});

test("rows and lanes reorder independently with keyboard focus and canonical serialization", async () => {
  const page = await browser.newPage();
  const requests = [row([{ ...lane, canHeight: 190 }]), row([lane])];
  try {
    await page.goto(link(requests)); await ready(page);
    const move = page.getByRole("button", { name: "Move lower row 2", exact: true });
    await move.focus(); await page.keyboard.press("ArrowDown");
    await page.waitForFunction(() => JSON.parse(new URLSearchParams(location.hash.slice(1)).get("rows")!)[0].lanes[0].canHeight === 122.5);
    expect(await page.textContent("#independentRowOrderStatus")).toContain("order updated");
    expect(await cards(page).nth(1).evaluate(element => element.contains(document.activeElement))).toBe(true);
    await navigate(page, link([row([lane, { ...lane, canHeight: 157 }])])); await ready(page);
    await page.getByRole("button", { name: "Move right lane 2 in row 1", exact: true }).focus(); await page.keyboard.press("ArrowRight");
    await page.waitForFunction(() => JSON.parse(new URLSearchParams(location.hash.slice(1)).get("rows")!)[0].lanes[0].canHeight === 157);
    await ready(page);
    const slope = laneField(page, 0, 0, "slope"); await slope.focus(); await page.keyboard.press("ArrowUp");
    expect(await slope.inputValue()).toBe("3.5");
    expect((await currentRows(page))[0].lanes.map(item => item.canHeight)).toEqual([157, 122.5]);
  } finally { await page.close(); }
});

test("row count, duplication, removal and explicit repetition never fill spare shelf height", async () => {
  const page = await browser.newPage();
  try {
    await page.goto(link()); await ready(page);
    expect(await cards(page).count()).toBe(1);
    await rowField(page, 0, "repeat").fill("2"); await ready(page);
    expect(await page.textContent("#summary")).toContain("6 cans in 2 rows");
    expect(await cards(page).count()).toBe(1); expect((await currentRows(page))[0].repeat).toBe(2);
    await rowField(page, 0, "repeat").fill("1"); await ready(page);
    await page.getByRole("button", { name: "Duplicate row 1", exact: true }).click(); await ready(page);
    expect(await cards(page).count()).toBe(2);
    await page.getByRole("button", { name: "Remove row 2", exact: true }).click(); await ready(page);
    await rowField(page, 0, "laneCount").fill("2"); await ready(page);
    expect(await cards(page).locator(".custom-lane-card").count()).toBe(2);
    expect((await currentRows(page))[0].lanes.map(item => item.depth)).toEqual([240, 240]);
    await page.getByRole("button", { name: "Remove lane 2 in row 1", exact: true }).click(); await ready(page);
    expect(await rowField(page, 0, "laneCount").inputValue()).toBe("1");
    expect(await page.getByRole("button", { name: "Remove lane 1 in row 1", exact: true }).isDisabled()).toBe(true);
    await rowField(page, 0, "laneCount").fill("9");
    await page.waitForFunction(() => document.getElementById("status")!.textContent!.includes("lane count"));
    expect(await rowField(page, 0, "laneCount").inputValue()).toBe("9");
    expect(await page.isDisabled("#dl3mf")).toBe(true);
    await rowField(page, 0, "laneCount").fill("1"); await ready(page);
    expect(await page.textContent("#summary")).toContain("3 cans in 1 row");
  } finally { await page.close(); }
});

test("adding a row above inherits its adjacent row depth instead of the deeper shelf", async () => {
  const page = await browser.newPage();
  const requests = [row([{ ...lane, depth: 300 }, { ...lane, depth: 300 }])];
  try {
    await page.goto(link(requests, { d: "520" })); await ready(page);
    await page.getByRole("button", { name: "Add a row above", exact: true }).click();
    expect(await cards(page).count()).toBe(2);
    const depths = await cards(page).first().locator('[data-lane-field="depth"]').evaluateAll(elements => elements.map(element => (element as HTMLInputElement).value));
    expect(depths).toEqual(["300", "300"]);
    await ready(page);
    const saved = await currentRows(page);
    expect(saved[0]).toEqual(requests[0]); expect(saved[1].lanes.map(item => item.depth)).toEqual([300, 300]);
    expect(await page.textContent("#summary")).toContain("16 cans in 2 rows");
    expect(await page.textContent("#summary")).toContain("1 carrier transition");
  } finally { await page.close(); }
});

test("version 5 rejects ambiguous flags, schema and modes instead of building defaults", async () => {
  const page = await browser.newPage();
  try {
    const corruptions: ((parameters: URLSearchParams) => void)[] = [
      parameters => parameters.delete("shareWalls"), parameters => parameters.set("topCover", "true"),
      parameters => parameters.append("shareWalls", "off"), parameters => parameters.append("topCover", "on"),
      parameters => parameters.set("v", "4"), parameters => parameters.set("mode", "mixed"),
      parameters => parameters.append("rows", "[]"), parameters => parameters.set("rows", "[]"),
      parameters => parameters.set("rows", JSON.stringify([{ ...row(), cascade: true }])),
      parameters => parameters.set("rows", JSON.stringify([row([{ ...lane, depth: 0 }])])),
    ];
    for (const corrupt of corruptions) {
      const parameters = new URLSearchParams(new URL(link()).hash.slice(1)); corrupt(parameters);
      await page.goto(`${address}#${parameters}`);
      await page.waitForFunction(() => document.getElementById("status")!.textContent!.includes("Couldn't read"));
      expect(await page.isDisabled("#dl3mf")).toBe(true); expect(await page.isHidden("#results")).toBe(true);
      expect(await page.textContent("#status")).toContain("custom-row link");
    }
  } finally { await page.close(); }
});

test("navigation resets row flags and leaves legacy uniform and v2-v4 mixed modes intact", async () => {
  const page = await browser.newPage();
  try {
    for (const version of ["2", "3", "4"]) {
      await page.goto(link([row()], { shareWalls: "on", topCover: "off" })); await ready(page);
      const stacks = [122.5, 157].map(canHeight => ({ canDiameter: 66, canHeight, depth: 240, tiers: 1, cascade: false, cover: false }));
      await navigate(page, `${address}#${new URLSearchParams({ v: version, mode: "mixed", stacks: JSON.stringify(stacks), shareWalls: "on", topCover: "off", rows: "malicious", cascade: "off", cover: "off", w: "600", d: "400", h: "500" })}`);
      await page.waitForFunction(() => (document.getElementById("buildMode") as HTMLSelectElement).value === "mixed"); await ready(page);
      expect(await page.locator('[name="shareWalls"]').isChecked()).toBe(version === "4");
      expect(await page.locator('[name="rowsShareWalls"]').isChecked()).toBe(false);
      expect(await page.locator('[name="rowsTopCover"]').isChecked()).toBe(true);
      expect(new URLSearchParams(new URL(page.url()).hash.slice(1)).has("rows")).toBe(false);
    }
    await navigate(page, `${address}#w=320&d=305&h=254&cascade=off&shareWalls=on&topCover=off`);
    await page.waitForFunction(() => (document.getElementById("buildMode") as HTMLSelectElement).value === "uniform"); await ready(page);
    expect(await page.locator('[name="rowsShareWalls"]').isChecked()).toBe(false);
    await page.selectOption("#buildMode", "rows"); await ready(page);
    expect(await page.locator('[name="rowsTopCover"]').isChecked()).toBe(true);
    expect(await cards(page).count()).toBe(1);
  } finally { await page.close(); }
});

test("single-row shared boundaries label real shared walls and exports preserve latest imported settings", async () => {
  const page = await browser.newPage();
  try {
    await page.goto(link([row([lane, { ...lane, canHeight: 134 }])], { shareWalls: "on" })); await ready(page);
    expect(await page.textContent("#summary")).toContain("1 of 1 adjacent boundaries share a wall");
    expect(await page.textContent("#summary")).toContain("shared wall");
    expect(await page.textContent("#summary")).not.toContain("-6.0 mm");
    const config = JSON.stringify({ filament_density: ["1.27"], task_note: "custom rows latest settings" });
    await page.setInputFiles("#profileIn", { name: "rows.3mf", mimeType: "model/3mf", buffer: Buffer.from(zipSync({ "3D/3dmodel.model": strToU8("<model/>"), "Metadata/project_settings.config": strToU8(config) })) }); await ready(page);
    const archive = await downloadFiles(page); const model = strFromU8(archive["3D/3dmodel.model"]);
    expect(strFromU8(archive["Metadata/project_settings.config"])).toBe(config);
    expect(model).toContain("row-1-"); expect(model).not.toContain("connection-1-spline");
    expect([...model.matchAll(/<object /g)]).toHaveLength(11);
  } finally { await page.close(); }
});

type HeldWindow = Window & { releaseRowsReply?: () => void; rowRequests: { type: string; layout?: { request: { rows: IndependentRowRequest[] } } }[] };
test("an obsolete failed row build cannot replace the latest layout or unlock its downloads", async () => {
  const page = await browser.newPage();
  try {
    await page.addInitScript(() => {
      const observed = window as unknown as HeldWindow; observed.rowRequests = [];
      const NativeWorker = window.Worker; let held = false;
      window.Worker = class extends NativeWorker {
        override postMessage(message: unknown, transfers: Transferable[] | StructuredSerializeOptions = []) {
          observed.rowRequests.push(structuredClone(message) as HeldWindow["rowRequests"][number]);
          if (Array.isArray(transfers)) super.postMessage(message, transfers); else super.postMessage(message, transfers);
        }
        override set onmessage(callback: ((this: Worker, event: MessageEvent) => unknown) | null) {
          super.onmessage = event => {
            if (!callback) return;
            if (event.data.type !== "built" || held) { callback.call(this, event); return; }
            held = true; observed.releaseRowsReply = () => { delete observed.releaseRowsReply;
              callback.call(this, new MessageEvent("message", { data: { type: "error", of: "build-rows", id: event.data.id, message: "obsolete row failure", fatal: true } })); };
          };
        }
      };
    });
    await page.goto(link()); await page.waitForFunction(() => !!(window as unknown as HeldWindow).releaseRowsReply);
    await laneField(page, 0, 0, "depth").fill("220"); expect(await page.isDisabled("#dl3mf")).toBe(true);
    await page.evaluate(() => (window as unknown as HeldWindow).releaseRowsReply!()); await ready(page);
    expect(await page.textContent("#status")).not.toContain("obsolete row failure");
    expect(await page.textContent("#summary")).toContain("220.0");
    const depths = await page.evaluate(() => (window as unknown as HeldWindow).rowRequests.filter(item => item.type === "build-rows").map(item => item.layout!.request.rows[0].lanes[0].depth));
    expect(depths).toEqual([240, 220]);
    const model = strFromU8((await downloadFiles(page))["3D/3dmodel.model"]); expect(model).toContain("row-1-");
  } finally { await page.close(); }
});

test("row editor, accessible ordering and assembly/part/plate canvases work in both themes and phone flow", async () => {
  for (const screen of [{ name: "desktop", width: 1440, height: 1000 }, { name: "phone", width: 390, height: 844 }]) for (const theme of ["light", "dark"]) {
    const page = await browser.newPage({ viewport: { width: screen.width, height: screen.height } });
    try {
      await page.goto(link(reportedRows, { w: "457.2", d: "279.4", h: "241", shareWalls: "on" })); await ready(page); await page.selectOption("#theme", theme);
      const checkbox = page.locator('[name="rowsShareWalls"]'); await checkbox.focus();
      expect(await checkbox.evaluate(element => getComputedStyle(element).outlineStyle)).not.toBe("none");
      expect(await checkbox.evaluate(element => element.closest("label")!.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(await page.getByRole("button", { name: "Move lower row 2", exact: true }).evaluate(element => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
      await page.screenshot({ path: `/tmp/cyd-custom-rows-${screen.name}-${theme}-controls.png` });
      await page.locator("#summary h2").scrollIntoViewIfNeeded();
      await page.screenshot({ path: `/tmp/cyd-custom-rows-${screen.name}-${theme}-summary.png` });
      await cards(page).first().locator(".custom-lane-card").first().locator("h4").scrollIntoViewIfNeeded();
      await page.screenshot({ path: `/tmp/cyd-custom-rows-${screen.name}-${theme}-lane.png` });
      await page.locator("#summary .custom-row-result").first().locator("ul").scrollIntoViewIfNeeded();
      await page.screenshot({ path: `/tmp/cyd-custom-rows-${screen.name}-${theme}-retained.png` });
      await page.locator("#viewer").scrollIntoViewIfNeeded(); await page.locator("#viewer").screenshot({ path: `/tmp/cyd-custom-rows-${screen.name}-${theme}-assembly.png` });
      await page.locator("#tabs button").nth(1).click(); await page.locator("#viewer").screenshot({ path: `/tmp/cyd-custom-rows-${screen.name}-${theme}-part.png` });
      await page.locator("#plates button").first().click(); await page.locator("#viewer").screenshot({ path: `/tmp/cyd-custom-rows-${screen.name}-${theme}-plate.png` });
      await checkbox.uncheck(); await ready(page); expect(await checkbox.isChecked()).toBe(false);
      await page.screenshot({ path: `/tmp/cyd-custom-rows-${screen.name}-${theme}-off.png` });
    } finally { await page.close(); }
  }
});

test("expanded row assembly guidance leaves Share, keyboard navigation and minimum canvas reachable", async () => {
  for (const viewport of [{ width: 1280, height: 720 }, { width: 1280, height: 560 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport, permissions: ["clipboard-read", "clipboard-write"] });
    const page = await context.newPage();
    try {
      await page.goto(link()); await ready(page);
      const summary = page.locator("footer details > summary"); await summary.focus(); await page.keyboard.press("Space");
      expect(await page.isHidden("#rowsAssembly")).toBe(false);
      expect(await summary.evaluate(element => document.activeElement === element)).toBe(true);
      await page.click("#share"); await page.waitForFunction(() => document.getElementById("status")!.textContent === "Link copied.");
      expect((await page.locator("#viewer canvas").boundingBox())!.height).toBeGreaterThanOrEqual(200);
      expect(await page.evaluate(() => document.querySelector("footer")!.getBoundingClientRect().top >= document.querySelector(".stage")!.getBoundingClientRect().bottom)).toBe(true);
      await page.screenshot({ path: `/tmp/cyd-custom-rows-guidance-${viewport.width}-${viewport.height}.png`, fullPage: true });
      await page.getByRole("button", { name: "1 · Setup", exact: true }).click();
      expect(await page.locator("#setupHeading").evaluate(element => document.activeElement === element)).toBe(true);
    } finally { await context.close(); }
  }
});
