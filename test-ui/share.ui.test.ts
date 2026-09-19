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
  await again.waitForSelector(".layout");
  expect(await again.locator(".layout").nth(1).getAttribute("aria-pressed")).toBe("true");
  // Same inputs, same ranking: the recipient sees the layout the sender clicked.
  expect(await again.locator(".layout").nth(1).textContent()).toBe(await page.locator(".layout").nth(1).textContent());
  await page.close(); await again.close();
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
