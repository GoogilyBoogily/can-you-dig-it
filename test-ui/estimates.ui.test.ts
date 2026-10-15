import { afterAll, beforeAll, expect, test } from "bun:test";
import { chromium, type Browser } from "playwright";
import { serveDist } from "../dev";
let browser: Browser;
let server: ReturnType<typeof serveDist>;
beforeAll(async () => {
  if (await Bun.spawn(["bun","run","build.ts"], {stdout:"ignore",stderr:"inherit"}).exited) throw new Error("build failed");
  server = serveDist(0); browser = await chromium.launch();
});
afterAll(async () => { await browser?.close(); server?.stop(true); });

test("profile edits during an in-flight build use latest settings without rebuilding geometry", async () => {
  const page = await browser.newPage();
  try {
    await page.addInitScript(() => {
      const state = window as any; state.requests = [];
      const NativeWorker = window.Worker;
      window.Worker = class extends NativeWorker {
        override postMessage(message: any) { state.requests.push(structuredClone(message)); super.postMessage(message); }
        override set onmessage(callback: ((this:Worker,event:MessageEvent)=>unknown)|null) {
          super.onmessage = (event) => {
            if (!callback) return;
            if(event.data.type === "built") { state.waitingBuild = true; setTimeout(() => callback.call(this,event),1500); }
            else callback.call(this,event);
          };
        }
      };
    });
    await page.goto(`http://localhost:${server.port}/index.html#w=160&d=305&h=254`);
    await page.waitForFunction(() => (window as any).waitingBuild);
    await page.waitForFunction(() => (document.getElementById("pickPrinter") as HTMLSelectElement).options.length > 1);
    await page.selectOption("#pickPrinter", "Bambu Lab P2S");
    await page.check("#pickTranslucent");
    await page.waitForFunction(() => document.getElementById("summary")?.textContent?.includes("solid;") && !document.getElementById("summary")?.textContent?.includes("recalculating"), null, {timeout:90000});
    const requests = await page.evaluate(() => (window as any).requests);
    expect(requests.filter((request:any) => request.type === "build")).toHaveLength(1);
    expect(requests.filter((request:any) => request.type === "estimate").at(-1).settings.infill).toBe(1);
    expect(await page.isDisabled("#dl3mf")).toBe(false);
  } finally { await page.close(); }
},120000);

test("custom unresolved profiles expose estimate assumptions and actual density", async () => {
  const page = await browser.newPage();
  try {
    const config = Buffer.from(JSON.stringify({print_settings_id:"unknown custom process",filament_density:["1.04"]})).toString("base64");
    await page.addInitScript((config) => localStorage.setItem("can-you-dig-it.profile",JSON.stringify({v:2,name:"custom",configBase64:config})),config);
    await page.goto(`http://localhost:${server.port}/index.html#w=160&d=305&h=254`);
    await page.waitForFunction(() => document.getElementById("summary")?.textContent?.includes("assumed") && !document.getElementById("summary")?.textContent?.includes("recalculating"), null, {timeout:90000});
    const summary = await page.textContent("#summary");
    expect(summary).toContain("sparse_infill_density=6");
    expect(summary).not.toContain("filament_density=1.27");
    expect(summary).not.toContain("about");
  } finally { await page.close(); }
},120000);

test("settings estimates keep only the in-flight request and latest edit", async () => {
  const page = await browser.newPage();
  try {
    await page.addInitScript(() => {
      const state = window as any; state.requests = [];
      const NativeWorker = window.Worker;
      let delayed = false;
      window.Worker = class extends NativeWorker {
        override postMessage(message:any) { state.requests.push(structuredClone(message)); super.postMessage(message); }
        override set onmessage(callback:((this:Worker,event:MessageEvent)=>unknown)|null) {
          super.onmessage = (event) => {
            if(!callback) return;
            if(event.data.type === "estimated" && !delayed) {
              delayed = true; state.waitingEstimate = true;
              setTimeout(() => callback.call(this,event),1500);
            } else callback.call(this,event);
          };
        }
      };
    });
    await page.goto(`http://localhost:${server.port}/index.html#w=160&d=305&h=254`);
    await page.waitForSelector("#dl3mf:not([disabled])",{timeout:90000});
    await page.waitForFunction(() => (document.getElementById("pickPrinter") as HTMLSelectElement).options.length > 1);
    await page.selectOption("#pickPrinter","Bambu Lab P2S");
    await page.waitForFunction(() => (window as any).waitingEstimate);
    await page.check("#pickTranslucent");
    await page.uncheck("#pickTranslucent");
    await page.check("#pickTranslucent");
    await page.waitForFunction(() => document.getElementById("summary")?.textContent?.includes("solid;") && !document.getElementById("summary")?.textContent?.includes("recalculating"),null,{timeout:90000});
    const requests = await page.evaluate(() => (window as any).requests);
    expect(requests.filter((request:any) => request.type === "build")).toHaveLength(1);
    const estimates = requests.filter((request:any) => request.type === "estimate");
    expect(estimates).toHaveLength(2);
    expect(estimates.at(-1).settings.infill).toBe(1);
  } finally { await page.close(); }
},120000);
