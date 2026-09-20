// Browser tests for the shareable hash. A unit test cannot see FormData drop an
// unchecked box, or what the Share button puts on the clipboard; these can.
import { test, expect, beforeAll, afterAll } from "bun:test";
import { chromium, type Browser } from "playwright";
import { serveDist } from "../dev";

const PORT = 3112;
const URL_ = `http://localhost:${PORT}/index.html`;

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

test("every option survives the hash, including boxes turned off and the layout picked", async () => {
  const page = await browser.newPage();
  await page.goto(URL_);
  await page.uncheck("#form [name=cascade]");
  await page.uncheck("#form [name=cover]");
  await page.selectOption("#form [name=design]", "minimal");
  await page.selectOption("#form [name=pattern]", "slat");
  await page.fill("#form [name=slope]", "5");
  await page.selectOption("#form [name=base]", "gridfinity");
  await page.check("#form [name=magnets]");
  await page.selectOption("#form [name=across]", "left");
  await page.selectOption("#form [name=along]", "front");
  await page.waitForSelector(".layout");
  await page.locator(".layout").nth(1).click();
  const shared = page.url();
  expect(shared).toContain("cascade=off");
  expect(shared).toContain("layout=1");

  const again = await browser.newPage();
  await again.goto(shared);
  expect(await again.isChecked("#form [name=cascade]")).toBe(false);
  expect(await again.isChecked("#form [name=cover]")).toBe(false);
  expect(await again.inputValue("#form [name=design]")).toBe("minimal");
  expect(await again.inputValue("#form [name=pattern]")).toBe("slat");
  expect(await again.inputValue("#form [name=slope]")).toBe("5");
  expect(await again.inputValue("#form [name=base]")).toBe("gridfinity");
  expect(await again.isChecked("#form [name=magnets]")).toBe(true);
  expect(await again.inputValue("#form [name=across]")).toBe("left");
  expect(await again.inputValue("#form [name=along]")).toBe("front");
  await again.waitForSelector(".layout");
  expect(await again.locator(".layout").nth(1).getAttribute("aria-pressed")).toBe("true");
  // Same inputs, same ranking: the recipient sees the layout the sender clicked.
  expect(await again.locator(".layout").nth(1).textContent()).toBe(await page.locator(".layout").nth(1).textContent());
  await page.close(); await again.close();
});

// layouts[-1] is undefined. It used to become the chosen layout: no build, downloads
// disabled, no message. A layout the list does not have falls back to the best one.
test("a hash naming a layout that does not exist opens on the best layout", async () => {
  const page = await browser.newPage();
  await page.goto(`${URL_}#w=160&d=305&h=254&layout=-1`);
  await page.waitForSelector(".layout");
  expect(await page.locator(".layout").first().getAttribute("aria-pressed")).toBe("true");
  await page.waitForSelector("#dl3mf:not([disabled])", { timeout: 90000 });
  await page.close();
});

// A built result used to stay on the page, downloads and all, after the form went
// invalid or stopped fitting: "Download 3MF" handed out geometry for numbers that were gone.
test("an invalid form or a shelf nothing fits takes the old build and its downloads away", async () => {
  const page = await browser.newPage();
  await page.goto(`${URL_}#w=160&d=305&h=254`);
  await page.waitForSelector("#dl3mf:not([disabled])", { timeout: 90000 });
  await page.fill("#form [name=w]", "10");
  await page.waitForFunction(() => document.getElementById("status")!.textContent!.startsWith("Check your numbers"));
  expect(await page.isHidden("#results")).toBe(true);
  expect(await page.locator("#tabs button").count()).toBe(0);
  expect(await page.isVisible("#showCans")).toBe(false);
  // The name of this test promised the downloads went too, and only the panel did: the
  // buttons stayed live over geometry the form no longer describes.
  expect(await page.locator("#dl3mf").isDisabled()).toBe(true);
  expect(await page.locator("#dlstl").isDisabled()).toBe(true);
  await page.fill("#form [name=w]", "60");
  await page.fill("#form [name=h]", "60");
  await page.waitForFunction(() => document.getElementById("status")!.textContent!.startsWith("Nothing fits"));
  expect(await page.isHidden("#results")).toBe(true);
  expect(await page.locator("#dl3mf").isDisabled()).toBe(true);
  await page.close();
});

// The viewer toggles are hidden by setting `hidden`, and `.check { display: flex }` used
// to beat the browser's [hidden]: every toggle stayed on screen in the part and plate views.
test("the viewer toggles the view has no use for are off the screen", async () => {
  const page = await browser.newPage();
  await page.goto(`${URL_}#w=160&d=305&h=254`);
  await page.waitForSelector("#dl3mf:not([disabled])", { timeout: 90000 });
  const visible = async () => Promise.all(["#showCans", "#explode", "#showGrid", "#showBed"].map((id) => page.isVisible(id)));
  expect(await visible()).toEqual([true, true, true, true]);
  await page.locator("#tabs button").nth(1).click(); // a part: cans and explode go, floor stays
  expect(await visible()).toEqual([false, false, true, true]);
  await page.locator("#plates button").first().click(); // a plate is the bed itself
  expect(await visible()).toEqual([false, false, false, false]);
  await page.close();
});

// With the worker script gone, build() used to post into the void and overwrite the
// engine message with "Building parts…" for good.
test("a worker that fails to load keeps its message on the status line", async () => {
  const page = await browser.newPage();
  await page.route("**/worker.js", (route) => route.fulfill({ status: 404 }));
  await page.goto(`${URL_}#w=160&d=305&h=254`);
  await page.waitForTimeout(1500); // past the 250 ms build debounce
  expect(await page.textContent("#status")).toContain("geometry engine failed to start");
  await page.close();
});

test("Share copies the full URL even before anything was typed", async () => {
  const context = await browser.newContext();
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: `http://localhost:${PORT}` });
  const page = await context.newPage();
  await page.goto(URL_);
  await page.click("#share");
  await page.waitForFunction(() => document.getElementById("status")!.textContent === "Link copied.");
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toBe(page.url());
  expect(copied).toContain("#w=300");
  expect(copied).toContain("cascade=on");
  await context.close();
});

// index.html had a <div class="profilePick"> inside a <p class="profile">, and a <div>
// start tag closes an open <p>. The parsed DOM put the whole block beside the paragraph
// instead of inside it, so `.actions .profile button` stopped matching #profileClear and
// the tiny Clear button rendered at full action size. Every test addressed these by id,
// which works at any nesting, so nothing saw it.
test("the print-settings block is one element, not four siblings", async () => {
  const page = await browser.newPage();
  await page.goto(URL_);
  await page.waitForSelector("#pickPrinter");
  const shape = await page.evaluate(() => {
    const clear = document.getElementById("profileClear")!;
    return {
      parent: clear.parentElement!.className,
      contains: document.querySelector(".profile")!.contains(document.querySelector(".profilePick")!),
      fontSize: getComputedStyle(clear).fontSize,
      strayEmpty: document.querySelectorAll(".actions p:empty").length,
    };
  });
  expect(shape.parent).toBe("profile");
  expect(shape.contains).toBe(true);
  expect(shape.fontSize).toBe("12px"); // .actions .profile button, not the 15px .actions button
  expect(shape.strayEmpty).toBe(0);
  await page.close();
});

// The picks change the filament and time estimates on screen and the settings in the
// exported 3MF, so a link without them shows the recipient different numbers. The
// catalogue is fetched, so they are applied when it lands, not when the hash is read.
test("a shared link carries the print settings, translucent included", async () => {
  const page = await browser.newPage();
  await page.goto(`${URL_}#w=600&d=400&h=500`);
  await page.waitForSelector("#pickPrinter");
  await page.selectOption("#pickPrinter", "Bambu Lab P2S");
  await page.waitForFunction(() => (document.getElementById("pickNozzle") as HTMLSelectElement).value !== "");
  await page.check("#pickTranslucent");
  await page.waitForFunction(() => location.hash.includes("translucent=on"), undefined, { timeout: 15000 });
  const shared = await page.evaluate(() => location.href);
  expect(shared).toContain("machine=");
  expect(shared).toContain("process=");
  expect(shared).toContain("filament=");

  const recipient = await browser.newPage();
  await recipient.goto(shared);
  await recipient.waitForFunction(() => (document.getElementById("pickPrinter") as HTMLSelectElement).value !== "", undefined, { timeout: 15000 });
  expect(await recipient.inputValue("#pickPrinter")).toBe("Bambu Lab P2S");
  expect(await recipient.isChecked("#pickTranslucent")).toBe(true);
  await recipient.close();
  await page.close();
});

// replaceState is rate limited, and the hash write used to run once per input event while
// the build was debounced. A held arrow key is ~30 a second; the writes the browser
// dropped included the one Share makes, so Share copied a stale link and said it had not.
test("a burst of edits still leaves Share copying the current numbers", async () => {
  const page = await browser.newPage();
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto(`${URL_}#w=600&d=400&h=500`);
  await page.waitForSelector(".layout");
  await page.focus("#form [name=w]");
  for (let i = 0; i < 60; i++) await page.keyboard.press("ArrowUp");
  const shown = await page.inputValue("#form [name=w]");
  expect(Number(shown)).toBe(660);
  await page.click("#share");
  await page.waitForFunction(() => document.getElementById("status")!.textContent === "Link copied.");
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(new URLSearchParams(new URL(copied).hash.slice(1)).get("w")).toBe(shown);
  await page.close();
});

// three.js frees a GPU buffer only when dispose() is called; dropping the JS reference
// does nothing. clear() built a new group on every view change and reset() emptied the
// geometry cache, both leaving the old buffers allocated, so every rebuild and every
// plate tab leaked a whole model's worth. renderer.info.memory counts what the context
// still holds.
test("switching views does not leak GPU buffers", async () => {
  const page = await browser.newPage();
  await page.goto(`${URL_}#w=600&d=400&h=500`);
  await page.waitForSelector("#dl3mf:not([disabled])", { timeout: 90000 });
  await page.waitForSelector("#tabs button");
  const tabs = await page.locator("#tabs button").count();
  expect(tabs).toBeGreaterThan(2);
  const count = () => page.evaluate(() => (window as unknown as { viewerInfo: () => { geometries: number; textures: number } }).viewerInfo().geometries);

  const round = async (n: number) => { for (let i = 0; i < n; i++) { await page.locator("#tabs button").nth(1).click(); await page.locator("#tabs button").nth(2).click(); } return count(); };
  await round(2); // first visit to each tab fills the geometry cache
  const settled = await round(6);
  const later = await round(6);
  // A cache stops growing; a leak does not. Before the dispose pass this went 31 -> 47.
  expect(later - settled).toBeLessThanOrEqual(1);
  await page.close();
});

// The catalogue is fetched, so for the first few hundred ms of a page load the four pick
// selects are empty. Rewriting the hash from them in that window stripped the very keys
// the link arrived with - and permanently, if the fetch then failed or the preset had
// been renamed. Share, clicked in that window, copied a link that had lost them.
test("a link's print settings survive the load, even if the catalogue never arrives", async () => {
  const page = await browser.newPage();
  await page.route("**/profiles/index.json", (route) => route.abort());
  const shared = `${URL_}#w=600&d=400&h=500&machine=Bambu+Lab+P2S+0.4+nozzle&process=0.20mm+Standard+%40BBL+P2S&filament=Bambu+PLA+Basic+%40BBL+P2S&translucent=on`;
  await page.goto(shared);
  await page.reload(); // a fragment-only goto is same-document; the module has to re-run
  await page.waitForSelector(".layout");
  await page.waitForFunction(() => document.getElementById("profileNow")!.textContent!.includes("Couldn't load"));
  const keys = await page.evaluate(() => {
    const q = new URLSearchParams(location.hash.slice(1));
    return { machine: q.get("machine"), filament: q.get("filament"), translucent: q.get("translucent") };
  });
  expect(keys.machine).toBe("Bambu Lab P2S 0.4 nozzle");
  expect(keys.filament).toBe("Bambu PLA Basic @BBL P2S");
  expect(keys.translucent).toBe("on");
  await page.close();
});

// composeProfile throws when a preset name has moved on between Bambu releases. That throw
// used to land in the fetch's catch, which reports the catalogue as unloadable and leaves
// every select empty - the picker was dead for the session and the message blamed the
// wrong thing, while the catalogue had loaded perfectly.
test("a stale preset in a link leaves the printer picker usable", async () => {
  const page = await browser.newPage();
  await page.goto(`${URL_}#w=600&d=400&h=500&machine=Bambu+Lab+P2S+0.4+nozzle&process=0.20mm+Standard+%40BBL+P2S&filament=Generic+PETG+%40NO+SUCH+PRINTER`);
  await page.reload();
  await page.waitForSelector(".layout");
  await page.waitForFunction(() => (document.getElementById("pickPrinter") as HTMLSelectElement).options.length > 1, undefined, { timeout: 15000 });
  expect(await page.locator("#pickPrinter").locator("option").count()).toBeGreaterThan(5);
  expect(await page.locator("#profileNow").textContent()).not.toContain("Couldn't load the printer list");
  await page.close();
});

// A link applies its print settings for the session. It must not write them to storage:
// the recipient may have imported their own 3MF, which is the one thing a link cannot
// rebuild - it is tens of KB and deliberately not carried.
test("a shared link does not overwrite the print settings already saved", async () => {
  const page = await browser.newPage();
  await page.goto(`${URL_}#w=600&d=400&h=500`);
  await page.waitForSelector("#pickPrinter");
  await page.selectOption("#pickPrinter", "Bambu Lab X1 Carbon");
  await page.waitForFunction(() => document.getElementById("profileNow")!.textContent!.includes("X1 Carbon"));
  const mine = await page.evaluate(() => localStorage.getItem("can-you-dig-it.profile"));

  // goto() with only the fragment changed is a same-document navigation - the module
  // never re-runs and loadHash never sees the link. Force a real load.
  await page.goto(`${URL_}#w=600&d=400&h=500&machine=Bambu+Lab+P2S+0.4+nozzle&process=0.20mm+Standard+%40BBL+P2S&filament=Bambu+PLA+Basic+%40BBL+P2S`);
  await page.reload();
  await page.waitForFunction(() => document.getElementById("profileNow")!.textContent!.includes("P2S"), undefined, { timeout: 20000 });
  expect(await page.evaluate(() => localStorage.getItem("can-you-dig-it.profile"))).toBe(mine);

  await page.goto(URL_); // a later plain visit gets their own settings back
  await page.reload();
  await page.waitForFunction(() => document.getElementById("profileNow")!.textContent!.includes("Carbon"), undefined, { timeout: 20000 });
  await page.close();
});
