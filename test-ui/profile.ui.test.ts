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
import { serveDist } from "../dev";

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
});

/** Fresh page with a model built, so #results and the profile row are reachable. */
async function buildOnce(): Promise<Page> {
  const page = await browser.newPage();
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

async function downloadTo(page: Page, button: string, path: string) {
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

  const zip = await downloadTo(page, "#dl3mf", "/tmp/cansys-ui-a.3mf");
  expect(strFromU8(zip["Metadata/project_settings.config"]!)).toBe(CONFIG_A);
  expect(zip["Metadata/model_settings.config"]).toBeDefined();
  expect(zip["3D/3dmodel.model"]).toBeDefined();
  await page.close();
});

test("the STL zip ignores the profile entirely", async () => {
  const page = await buildOnce();
  await page.setInputFiles("#profileIn", upload("myprofile.3mf", CONFIG_A));
  await waitForLabel(page, "myprofile.3mf");

  const names = Object.keys(await downloadTo(page, "#dlstl", "/tmp/cansys-ui.zip"));
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

  const zip = await downloadTo(page, "#dl3mf", "/tmp/cansys-ui-b.3mf");
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
  expect(await page.evaluate(() => localStorage.getItem("cansys.profile"))).toBeNull();
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
  await page.evaluate(() => localStorage.setItem("cansys.profile", "{not json"));
  await page.reload();

  await page.waitForSelector(".layout", { timeout: 20000 });
  expect(await label(page)).toContain("slicer's own defaults");
  await page.close();
});

test("a stored profile of the wrong shape does not stop the page loading", async () => {
  const page = await browser.newPage();
  await page.goto(URL_);
  await page.evaluate(() => localStorage.setItem("cansys.profile", JSON.stringify({ name: "x.3mf" })));
  await page.reload();

  await page.waitForSelector(".layout", { timeout: 20000 });
  expect(await label(page)).toContain("slicer's own defaults");
  await page.close();
});
