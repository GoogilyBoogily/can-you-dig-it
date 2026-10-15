// Browser tests for the slicer-profile UI. Kept out of test/ so `bun test test`
// stays fast and needs no browser; run these with `bun run test:ui`.
//
// That script passes --timeout because bun's default is 5 s per test, which
// silently caps the waits below. A CI runner renders WebGL in software and
// takes longer than a laptop to build the geometry, so the default fails there
// while passing locally.
//
// These cover what unit tests structurally cannot: stored state read at module
// load, a file name reaching the DOM, and the real download a slicer receives.
import { test, expect, beforeAll, afterAll } from "bun:test";
import { chromium, type Browser, type Page } from "playwright";
import { zipSync, unzipSync, strToU8, strFromU8 } from "fflate";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serveDist } from "../dev";
import { DEFAULTS } from "../src/geometry";
import { estimateSettings } from "../src/estimate";
import { INDEX_URL, type ProfileIndex } from "../src/profiles";

const index: ProfileIndex = await Bun.file(INDEX_URL).json();

// Downloads land in a directory of their own so the suite does not leave 3MFs in /tmp.
const downloads = mkdtempSync(join(tmpdir(), "can-you-dig-it-ui-"));

const PORT = 3111;
const URL_ = `http://localhost:${PORT}/index.html`;
const CONFIG_A = `{"printer_settings_id":"P1S 0.4","layer_height":"0.28"}`;
const CONFIG_B = `{"printer_settings_id":"X1C 0.6","layer_height":"0.32"}`;

const profileZip = (config: string) =>
  Buffer.from(zipSync({ "3D/3dmodel.model": strToU8("<model/>"), "Metadata/project_settings.config": strToU8(config) }));
const upload = (name: string, config: string) => ({ name, mimeType: "model/3mf", buffer: profileZip(config) });

let browser: Browser;
let server: ReturnType<typeof serveDist>;

beforeAll(async () => {
  const built = await Bun.spawn(["bun", "run", "build.ts"], { stdout: "ignore", stderr: "inherit" }).exited;
  if (built !== 0) throw new Error("build.ts failed, cannot run UI tests");
  server = serveDist(PORT);
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser?.close();
  server?.stop(true);
  rmSync(downloads, { recursive: true, force: true });
});

/** Fresh page with a model built, so #results and the profile row are reachable. */
async function buildOnce(): Promise<Page> {
  const page = await browser.newPage();
  await page.addInitScript(() => {
    const state = window as any;
    state.estimateRequests = [];
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      override postMessage(message: any) {
        if (message.type === "estimate") state.estimateRequests.push(structuredClone(message));
        super.postMessage(message);
      }
    };
  });
  await page.goto(URL_);
  for (const [name, value] of [["w", "300"], ["d", "520"], ["h", "240"]] as const) await page.fill(`#form [name=${name}]`, value);
  await page.waitForSelector(".layout");
  await page.locator(".layout").first().click();
  await page.waitForFunction(() => !document.getElementById("results")!.hidden, { timeout: 90000 });
  await page.waitForFunction(() => !document.getElementById("status")!.classList.contains("busy"), { timeout: 90000 });
  return page;
}

const label = (page: Page) => page.locator("#profileNow").textContent();
const waitForLabel = (page: Page, text: string) =>
  page.waitForFunction((t) => document.getElementById("profileNow")!.textContent!.includes(t), text, { timeout: 15000 });

async function downloadTo(page: Page, button: string, name: string) {
  const path = join(downloads, name);
  const [download] = await Promise.all([page.waitForEvent("download", { timeout: 180000 }), page.click(button)]);
  await download.saveAs(path);
  return unzipSync(new Uint8Array(await Bun.file(path).arrayBuffer()));
}

test("with no profile the page says the slicer defaults apply", async () => {
  const page = await buildOnce();
  expect(await label(page)).toContain("slicer's own defaults");
  expect(await page.locator("#profileClear").isHidden()).toBe(true);
  await page.close();
});

test("an imported profile reaches the exported 3MF byte for byte", async () => {
  const page = await buildOnce();
  await page.setInputFiles("#profileIn", upload("myprofile.3mf", CONFIG_A));
  await waitForLabel(page, "myprofile.3mf");
  expect(await page.locator("#profileClear").isVisible()).toBe(true);

  const zip = await downloadTo(page, "#dl3mf", "a.3mf");
  expect(strFromU8(zip["Metadata/project_settings.config"]!)).toBe(CONFIG_A);
  expect(zip["Metadata/model_settings.config"]).toBeDefined();
  expect(zip["3D/3dmodel.model"]).toBeDefined();
  await page.close();
});

test("the STL zip ignores the profile entirely", async () => {
  const page = await buildOnce();
  await page.setInputFiles("#profileIn", upload("myprofile.3mf", CONFIG_A));
  await waitForLabel(page, "myprofile.3mf");

  const names = Object.keys(await downloadTo(page, "#dlstl", "parts.zip"));
  expect(names.some((n) => n.endsWith(".stl"))).toBe(true);
  expect(names.some((n) => n.includes("project_settings"))).toBe(false);
  await page.close();
});

test("importing a second profile replaces the first", async () => {
  const page = await buildOnce();
  await page.setInputFiles("#profileIn", upload("first.3mf", CONFIG_A));
  await waitForLabel(page, "first.3mf");
  await page.setInputFiles("#profileIn", upload("second.3mf", CONFIG_B));
  await waitForLabel(page, "second.3mf");

  const zip = await downloadTo(page, "#dl3mf", "b.3mf");
  expect(strFromU8(zip["Metadata/project_settings.config"]!)).toBe(CONFIG_B);
  await page.close();
});

test("a profile survives a reload", async () => {
  const page = await buildOnce();
  await page.setInputFiles("#profileIn", upload("myprofile.3mf", CONFIG_A));
  await waitForLabel(page, "myprofile.3mf");
  await page.reload();
  await waitForLabel(page, "myprofile.3mf");
  expect(await label(page)).toContain("myprofile.3mf");
  await page.close();
});

test("a file that is not a 3MF says why and keeps the working profile", async () => {
  const page = await buildOnce();
  await page.setInputFiles("#profileIn", upload("good.3mf", CONFIG_A));
  await waitForLabel(page, "good.3mf");

  await page.setInputFiles("#profileIn", { name: "bad.3mf", mimeType: "model/3mf", buffer: Buffer.from("not a zip") });
  await page.waitForFunction(() => document.getElementById("status")!.textContent!.includes("Couldn't read"), { timeout: 15000 });
  expect(await label(page)).toContain("good.3mf");
  await page.close();
});

test("Clear removes the profile and empties localStorage", async () => {
  const page = await buildOnce();
  await page.setInputFiles("#profileIn", upload("myprofile.3mf", CONFIG_A));
  await waitForLabel(page, "myprofile.3mf");

  await page.click("#profileClear");
  expect(await label(page)).toContain("slicer's own defaults");
  expect(await page.evaluate(() => localStorage.getItem("can-you-dig-it.profile"))).toBeNull();
  await page.close();
});

// Fails if showProfile() ever goes back to innerHTML.
test("a hostile file name renders as text and does not execute", async () => {
  const page = await buildOnce();
  const hostile = `<img src=x onerror="window.__xssFired=1">.3mf`;
  await page.setInputFiles("#profileIn", upload(hostile, CONFIG_A));
  await waitForLabel(page, "onerror");

  expect(await page.evaluate(() => (window as any).__xssFired)).toBeUndefined();
  expect(await page.evaluate(() => document.querySelector("#profileNow img"))).toBeNull();
  expect(await label(page)).toContain(hostile);
  await page.close();
});

// Fails if readStoredProfile() stops guarding the parse: the throw escapes
// main.ts during module init and nothing on the page wires up.
test("a corrupt stored profile does not stop the page loading", async () => {
  const page = await browser.newPage();
  await page.goto(URL_);
  await page.evaluate(() => localStorage.setItem("can-you-dig-it.profile", "{not json"));
  await page.reload();

  await page.waitForSelector(".layout", { timeout: 20000 });
  expect(await label(page)).toContain("slicer's own defaults");
  await page.close();
});

test("a stored profile of the wrong shape does not stop the page loading", async () => {
  const page = await browser.newPage();
  await page.goto(URL_);
  await page.evaluate(() => localStorage.setItem("can-you-dig-it.profile", JSON.stringify({ name: "x.3mf" })));
  await page.reload();

  await page.waitForSelector(".layout", { timeout: 20000 });
  expect(await label(page)).toContain("slicer's own defaults");
  await page.close();
});

// Fails if the localStorage guard moves back to wrapping only the JSON parse:
// reading storage throws outright when cookies are blocked.
test("the page still loads when localStorage access is denied", async () => {
  const page = await browser.newPage();
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      get() { throw new DOMException("The operation is insecure.", "SecurityError"); },
    });
  });
  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  await page.goto(URL_);

  await page.waitForSelector(".layout", { timeout: 20000 });
  expect(pageErrors).toEqual([]);
  expect(await label(page)).toContain("slicer's own defaults");
  await page.close();
});

// Fails if downloads stop being blocked while a build is queued: the worker
// exports whatever it built last, which would not be what the screen shows.
test("downloads are blocked while a build is pending", async () => {
  const page = await buildOnce();
  expect(await page.locator("#dl3mf").isDisabled()).toBe(false);

  await page.fill("#form [name=h]", "600"); // schedules a rebuild behind a 250 ms debounce
  expect(await page.locator("#dl3mf").isDisabled()).toBe(true);

  await page.waitForFunction(() => !(document.getElementById("dl3mf") as HTMLButtonElement).disabled, { timeout: 90000 });
  const shown = (await page.locator("#summary").innerText()).match(/(\d+) cans/)?.[1];
  const zip = await downloadTo(page, "#dl3mf", "race.3mf");
  const objects = (strFromU8(zip["3D/3dmodel.model"]!).match(/<object /g) ?? []).length;
  expect(shown).toBeTruthy();
  expect(objects).toBeGreaterThan(0);
  await page.close();
});

test("a non-numeric dimension names the field instead of building NaN", async () => {
  const page = await buildOnce();
  await page.fill("#form [name=canD]", "");
  await page.waitForFunction(() => document.getElementById("status")!.textContent!.includes("Check your numbers"), { timeout: 15000 });
  expect(await page.locator("#status").innerText()).toMatch(/can diameter/i);
  expect(await page.locator("#layouts .layout").count()).toBe(0);
  await page.close();
});

async function completedSummary(page: Page) {
  await page.waitForFunction(() => document.getElementById("summary")?.textContent?.includes("kg (")
    && !document.getElementById("summary")?.textContent?.includes("recalculating")
    && !document.getElementById("status")?.classList.contains("busy")
    && !(document.getElementById("dl3mf") as HTMLButtonElement).disabled, null, { timeout: 90000 });
  return page.locator("#summary").innerText();
}

function exportedObjects(files: Record<string, Uint8Array>, bed: [number, number, number]) {
  const plates = [...strFromU8(files["Metadata/model_settings.config"]!).matchAll(/<plate>([\s\S]*?)<\/plate>/g)];
  const objectPlates = new Map<number, number>();
  for (const plate of plates) {
    const number = Number(plate[1]!.match(/key="plater_id" value="(\d+)"/)![1]) - 1;
    for (const object of plate[1]!.matchAll(/key="object_id" value="(\d+)"/g)) objectPlates.set(Number(object[1]), number);
  }
  const columns = Math.ceil(Math.sqrt(plates.length));
  return [...strFromU8(files["3D/3dmodel.model"]!).matchAll(/<object id="(\d+)"[^>]*name="([^"]*)"[^>]*>([\s\S]*?)<\/object>/g)].map((object) => {
    const plate = objectPlates.get(Number(object[1]));
    expect(plate).toBeDefined();
    const origin = [(plate! % columns) * bed[0] * 1.2, -Math.floor(plate! / columns) * bed[1] * 1.2];
    const vertices = [...object[3]!.matchAll(/<vertex x="([^"]+)" y="([^"]+)" z="([^"]+)"\/>/g)]
      .map((vertex) => [Number(vertex[1]) - origin[0]!, Number(vertex[2]) - origin[1]!, Number(vertex[3])]);
    const triangles = [...object[3]!.matchAll(/<triangle v1="(\d+)" v2="(\d+)" v3="(\d+)"\/>/g)]
      .map((triangle) => triangle.slice(1).map(Number));
    let volume = 0;
    for (const triangle of triangles) {
      const [a, b, c] = triangle.map((index) => vertices[index]!);
      volume += (a![0]! * (b![1]! * c![2]! - b![2]! * c![1]!)
        + a![1]! * (b![2]! * c![0]! - b![0]! * c![2]!)
        + a![2]! * (b![0]! * c![1]! - b![1]! * c![0]!)) / 6;
    }
    return { name: object[2]!, plate: plate!, vertices, triangles, volume };
  });
}

test("default estimates disclose reference assumptions and respond to density settings", async () => {
  const page = await buildOnce();
  const before = await completedSummary(page);
  expect(before).toContain("approximate; assumed");
  expect(before).toContain("sparse_infill_density=6");
  expect(before).toContain("filament_density=1.27");
  expect(before).not.toContain("about");
  const config = JSON.stringify({ filament_density: ["2.54"] });
  await page.setInputFiles("#profileIn", upload("dense.3mf", config));
  await waitForLabel(page, "dense.3mf");
  const after = await completedSummary(page);
  const kilograms = (summary: string) => Number(summary.match(/~([\d.]+) kg/)![1]);
  expect(Math.abs(kilograms(after) - kilograms(before) * 2)).toBeLessThanOrEqual(0.015);
  expect(after).not.toContain("filament_density=1.27");
  const requests = await page.evaluate(() => (window as any).estimateRequests);
  expect(requests.at(-1).settings.density).toBe(2.54);
  expect(requests.at(-1).settings.infill).toBe(0.06);
  const files = await downloadTo(page, "#dl3mf", "density.3mf");
  expect(strFromU8(files["Metadata/project_settings.config"]!)).toBe(config);
  await page.close();
});

// Check the coordinates the slicer receives, even when the two printers need equal plate counts.
test("picking a printer with a keep-out corner repacks the plates round it", async () => {
  const page = await buildOnce();
  const margin = DEFAULTS.bedMargin;
  const exports = [];
  for (const printer of ["Bambu Lab X1 Carbon", "Bambu Lab P2S"]) {
    await page.selectOption("#pickPrinter", printer);
    await waitForLabel(page, `${printer} · 0.4 nozzle`);
    await completedSummary(page);
    const files = await downloadTo(page, "#dl3mf", `${printer.includes("Carbon") ? "keepout" : "clear-bed"}.3mf`);
    const config = JSON.parse(strFromU8(files["Metadata/project_settings.config"]!));
    const bed: [number, number, number] = [256, 256, Number(config.printable_height)];
    const corners = (config.bed_exclude_area ?? []).map((point: string) => point.split("x").map(Number));
    const exclusion = corners.length ? [Math.min(...corners.map((point: number[]) => point[0])), Math.min(...corners.map((point: number[]) => point[1])), Math.max(...corners.map((point: number[]) => point[0])), Math.max(...corners.map((point: number[]) => point[1]))] : null;
    if (printer.includes("Carbon")) expect(exclusion).toEqual([0, 0, 18, 28]);
    else expect(exclusion).toBeNull();
    const objects = exportedObjects(files, bed);
    expect(objects.length).toBeGreaterThan(0);
    for (const object of objects) {
      const minimumX = Math.min(...object.vertices.map((vertex) => vertex[0]!));
      const minimumY = Math.min(...object.vertices.map((vertex) => vertex[1]!));
      const maximumX = Math.max(...object.vertices.map((vertex) => vertex[0]!));
      const maximumY = Math.max(...object.vertices.map((vertex) => vertex[1]!));
      for (const [x, y, z] of object.vertices) {
        expect(x!).toBeGreaterThanOrEqual(margin - 1e-4);
        expect(y!).toBeGreaterThanOrEqual(margin - 1e-4);
        expect(x!).toBeLessThanOrEqual(bed[0] - margin + 1e-4);
        expect(y!).toBeLessThanOrEqual(bed[1] - margin + 1e-4);
        expect(z!).toBeGreaterThanOrEqual(-1e-4);
        expect(z!).toBeLessThanOrEqual(bed[2] - margin + 1e-4);
      }
      if (exclusion) expect(minimumX >= exclusion[2]! + margin - 1e-4 || maximumX <= exclusion[0]! - margin + 1e-4
        || minimumY >= exclusion[3]! + margin - 1e-4 || maximumY <= exclusion[1]! - margin + 1e-4).toBe(true);
    }
    exports.push(objects);
  }
  const geometry = (objects: ReturnType<typeof exportedObjects>) => objects.map((object) => ({
    name: object.name, vertices: object.vertices.length, triangles: object.triangles.length, volume: Math.round(object.volume * 1000),
  })).sort((first, second) => first.name.localeCompare(second.name));
  expect(geometry(exports[0]!)).toEqual(geometry(exports[1]!));
  expect(exports[0]!.map((object) => [object.name, object.plate, object.vertices[0]]))
    .not.toEqual(exports[1]!.map((object) => [object.name, object.plate, object.vertices[0]]));
  await page.close();
});

// The catalogue is fetched from the site and the selects are wired in main.ts, so this
// is the only test that proves a pick reaches the slicer as a config naming those presets.
const X1C_06 = "Bambu Lab X1 Carbon 0.6 nozzle";
const waitForSelect = (page: Page, id: string, value: string) =>
  page.waitForFunction(([i, v]) => (document.getElementById(i) as HTMLSelectElement).value === v, [id, value] as const, { timeout: 15000 });

test("picking printer, nozzle and filament composes a config naming those presets and sets the bed", async () => {
  const page = await buildOnce();
  await page.selectOption("#pickPrinter", "Bambu Lab X1 Carbon");
  await waitForLabel(page, "Bambu Lab X1 Carbon · 0.4 nozzle");
  await page.selectOption("#pickNozzle", X1C_06);
  await waitForLabel(page, "0.6 nozzle");
  await page.selectOption("#pickFilament", { label: "Generic PETG" });
  await waitForLabel(page, "Generic PETG");
  const sparseSummary = await completedSummary(page);
  await page.check("#pickTranslucent");
  await waitForLabel(page, "translucent");
  const solidSummary = await completedSummary(page);
  expect(solidSummary).toContain("solid;");
  expect(solidSummary).not.toContain("about");
  expect(Number(solidSummary.match(/~([\d.]+) kg/)![1])).toBeGreaterThan(Number(sparseSummary.match(/~([\d.]+) kg/)![1]));
  expect(await page.inputValue("#form [name=bedZ]")).toBe("250");
  await page.waitForFunction(() => !document.getElementById("status")!.classList.contains("busy"), { timeout: 90000 });

  const zip = await downloadTo(page, "#dl3mf", "x1c.3mf");
  const config = JSON.parse(strFromU8(zip["Metadata/project_settings.config"]!));
  expect(config.printer_settings_id).toBe(X1C_06);
  expect(config.filament_settings_id[0]).toMatch(/^Generic PETG/); // some presets are plain "Generic PETG", no @printer suffix
  expect(index.processes.some((p) => p.name === config.print_settings_id)).toBe(true);
  expect(index.filaments.some((f) => f.name === config.filament_settings_id[0])).toBe(true);
  expect(config.different_settings_to_system[0]).toContain("wall_loops");
  expect(config.line_width).toBe("0.62");
  const settings = estimateSettings(zip["Metadata/project_settings.config"]!, index);
  expect(settings.infill).toBe(1);
  expect(settings.density).toBeGreaterThan(0);
  const requests = await page.evaluate(() => (window as any).estimateRequests);
  expect(requests.at(-1).settings).toEqual(settings);
  const volume = exportedObjects(zip, [256, 256, 250]).reduce((total, object) => total + object.volume, 0);
  const kilograms = volume / 1e6 * settings.density;
  expect(Number(solidSummary.match(/~([\d.]+) kg/)![1])).toBeCloseTo(kilograms, 2);

  await page.reload();
  await waitForLabel(page, "translucent");
  expect(await page.isChecked("#pickTranslucent")).toBe(true);
  await page.close();
});

test("the picks survive a reload and Clear puts the selects back", async () => {
  const page = await buildOnce();
  await page.selectOption("#pickPrinter", "Bambu Lab P2S");
  await waitForLabel(page, "Bambu Lab P2S · 0.4 nozzle · Bambu PLA Basic · 0.20mm Standard");
  await page.reload();
  await waitForLabel(page, "Bambu Lab P2S");
  await waitForSelect(page, "pickNozzle", "Bambu Lab P2S 0.4 nozzle");
  expect(await page.inputValue("#pickFilament")).toBe("Bambu PLA Basic @BBL P2S");
  await page.click("#profileClear");
  await waitForSelect(page, "pickPrinter", "");
  expect(await page.locator("#pickNozzle").isDisabled()).toBe(true);
  await page.close();
});

// The imported project is the printer the parts go to, so its bed is the one they must
// fit; only the pickers used to set it, and an A1 mini project packed for a 256 bed.
test("importing a 3MF sets the bed from its printable area", async () => {
  const page = await buildOnce();
  const a1mini = `{"printable_area":["0x0","180x0","180x180","0x180"],"printable_height":"180"}`;
  await page.setInputFiles("#profileIn", upload("a1mini.3mf", a1mini));
  await waitForLabel(page, "a1mini.3mf");
  await page.waitForFunction(() => (document.querySelector("#form [name=bedX]") as HTMLInputElement).value === "180", null, { timeout: 15000 });
  expect(await page.inputValue("#form [name=bedY]")).toBe("180");
  expect(await page.inputValue("#form [name=bedZ]")).toBe("180");
  await page.close();
});

test("a 3MF upload takes the selects back to no pick", async () => {
  const page = await buildOnce();
  await page.selectOption("#pickPrinter", "Bambu Lab P2S");
  await waitForLabel(page, "Bambu Lab P2S");
  await page.setInputFiles("#profileIn", upload("mine.3mf", CONFIG_A));
  await waitForLabel(page, "mine.3mf");
  await waitForSelect(page, "pickPrinter", "");
  await page.close();
});
