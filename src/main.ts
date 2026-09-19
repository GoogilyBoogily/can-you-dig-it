import { DEFAULTS, DESIGNS, PATTERNS, BASES, ACROSS, ALONG, type Design, type Pattern, type Base, type Across, type Along, type Options } from "./geometry";
import { fitSpace, laneNeeds, type Layout, type Space } from "./solver";
import { Viewer } from "./viewer";
import type { Req, Res, PartOut } from "./worker";
import { extractProfile, plateSummary, type Placement } from "./export";
import { loadStoredProfile, saveStoredProfile, clearStoredProfile, type StoredProfile } from "./profile";
import { readNumbers, LIMITS } from "./validate";
import { INDEX_URL, printersOf, machinesFor, processesFor, filamentsFor, vendorsOf, defaultPicks, describePicks, composeProfile, picksFromConfig, bedFromConfig, translucentFeed, type ProfileIndex, type Picks } from "./profiles";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const form = $<HTMLFormElement>("form");
const viewer = new Viewer($("viewer"));
$("showCans").querySelector("input")!.addEventListener("change", (e) => viewer.showCans((e.target as HTMLInputElement).checked));
$("showGrid").querySelector("input")!.addEventListener("change", (e) => viewer.showGrid((e.target as HTMLInputElement).checked));
$("showBed").querySelector("input")!.addEventListener("change", (e) => viewer.showBed((e.target as HTMLInputElement).checked));
$("explode").querySelector("input")!.addEventListener("input", (e) => viewer.explode(Number((e.target as HTMLInputElement).value)));
const worker = new Worker(new URL("worker.js", document.baseURI), { type: "module" });

let layouts: Layout[] = [];
let chosen: Layout | null = null;
let chosenIndex = 0; // position in the ranked list; the hash carries it so a shared link opens on the same layout
let built: { parts: PartOut[]; placed: Placement[]; nplates: number; layout: Layout } | null = null;
let buildId = 0, exportId = 0, buildTimer = 0;
let buildPending = false; // a build is queued or in flight; exporting now would save stale geometry

// ------------------------------------------------------------- inputs
function readOptions(): { space: Space; base: Options; cascade: boolean } {
  const f = new FormData(form);
  const raw: Record<string, number> = {};
  for (const k of Object.keys(LIMITS)) raw[k] = parseFloat(String(f.get(k)));
  readNumbers(raw); // throws naming the offending field
  const num = (k: string) => raw[k] ?? parseFloat(String(f.get(k)));
  // A shared hash with an unknown design leaves the select blank; say so, as with numbers.
  const design = f.get("design") as Design;
  if (!DESIGNS.includes(design)) throw new Error("design: pick Standard or Minimal");
  const pattern = f.get("pattern") as Pattern;
  if (!PATTERNS.includes(pattern)) throw new Error("pattern: pick Hex, Circles, Kumiko, Slats or Breeze block");
  const standsOn = f.get("base") as Base;
  if (!BASES.includes(standsOn)) throw new Error("base: pick Flat, Feet or Gridfinity");
  const across = f.get("across") as Across, along = f.get("along") as Along;
  if (!ACROSS.includes(across) || !ALONG.includes(along)) throw new Error("grid position: pick left, centre or right, and front, centre or back");
  const base: Options = {
    ...DEFAULTS,
    canD: num("canD"), canL: num("canL"),
    bed: [num("bedX"), num("bedY"), num("bedZ")],
    cover: f.get("cover") === "on", solid: f.get("solid") === "on", design, pattern, base: standsOn, magnets: f.get("magnets") === "on", across, along, fit: num("fit"),
    hexR: num("hexR"), hexAuto: f.get("hexAuto") === "on", slope: num("slope"), lipGap: num("lipGap"),
  };
  return { space: { w: num("w"), d: num("d"), h: num("h"), front: num("front") }, base, cascade: f.get("cascade") === "on" };
}

form.addEventListener("input", (e) => {
  const t = e.target as HTMLInputElement | HTMLSelectElement;
  if (t.name === "preset") {
    if (t.value !== "custom") {
      const [d, l] = t.value.split(",");
      (form.elements.namedItem("canD") as HTMLInputElement).value = d;
      (form.elements.namedItem("canL") as HTMLInputElement).value = l;
    }
  } else if (t.name === "canD" || t.name === "canL") {
    (form.elements.namedItem("preset") as HTMLSelectElement).value = "custom";
  }
  if (t.name === "fit") (form.elements.namedItem("fitOut") as HTMLOutputElement).value = Number(t.value).toFixed(2);
  if (t.name === "lipGap") (form.elements.namedItem("lipGapOut") as HTMLOutputElement).value = t.value;
  refit(); // first: it resets the chosen layout, which the hash carries
  syncHash();
});
form.addEventListener("submit", (e) => e.preventDefault());

// ------------------------------------------------------------- layouts
/** Re-rank layouts for the form as it stands and pick `want`, or the best one when that is out of range. */
function refit(want = 0) {
  let space: Space, base: Options, cascade: boolean;
  try {
    ({ space, base, cascade } = readOptions());
  } catch (err: any) {
    // Say which field is wrong rather than building nothing and staying quiet.
    setStatus(`Check your numbers: ${err?.message ?? err}`);
    $("layouts").innerHTML = "";
    chosen = null; chosenIndex = 0;
    return;
  }
  layouts = fitSpace(space, base, { cascade });
  const box = $("layouts");
  box.innerHTML = "";
  if (!layouts.length) {
    const need = laneNeeds(base);
    box.innerHTML = `<p class="empty">Nothing fits. A single lane needs ${need.w.toFixed(0)} mm of width and ${need.h.toFixed(0)} mm of height.</p>`;
    chosen = null; chosenIndex = 0; return;
  }
  const h = document.createElement("h2"); h.textContent = "Layouts that fit"; box.appendChild(h);
  const start = want < layouts.length ? want : 0;
  layouts.forEach((l, i) => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "layout"; b.setAttribute("aria-pressed", String(i === start));
    const d = l.derived;
    const perDeck = l.style === "cascade" ? `${d.nBottom} on the bottom deck, ${d.n} per upper deck` : `${d.n} per deck`;
    b.innerHTML = `<span class="cans">${l.cans}<small>cans</small></span>
      <span class="line">${l.options.lanesWide} lane${l.options.lanesWide > 1 ? "s" : ""} wide × ${l.options.tiers} tier${l.options.tiers > 1 ? "s" : ""}, ${l.style === "cascade" ? "auto-feed" : "flat"}</span>
      <span class="line muted">${l.footprint.map((v) => v.toFixed(0)).join(" × ")} mm · ${perDeck} · ~${(l.gramsEst / 1000).toFixed(1)} kg</span>`;
    b.addEventListener("click", () => { box.querySelectorAll(".layout").forEach((x) => x.setAttribute("aria-pressed", "false")); b.setAttribute("aria-pressed", "true"); choose(i); syncHash(); });
    box.appendChild(b);
  });
  choose(start);
}

function choose(i: number) {
  chosen = layouts[i];
  chosenIndex = i;
  clearTimeout(buildTimer);
  setBuildPending(true);
  buildTimer = window.setTimeout(build, 250);
}

/** Downloads export whatever the worker built last, so block them until it matches the screen. */
function setBuildPending(pending: boolean) {
  buildPending = pending;
  for (const id of ["dl3mf", "dlstl"]) $<HTMLButtonElement>(id).disabled = pending;
}

// ------------------------------------------------------------- build
function setStatus(text: string, busy = false) { const s = $("status"); s.textContent = text; s.classList.toggle("busy", busy); }

function build() {
  if (!chosen) return;
  const id = ++buildId;
  setBuildPending(true);
  setStatus("Building parts…", true);
  const req: Req = { type: "build", id, options: chosen.options };
  worker.postMessage(req);
}

worker.onmessage = (e: MessageEvent<Res>) => {
  const r = e.data;
  if (r.type === "error") { setBuildPending(false); setStatus(`Something went wrong: ${r.message}`); return; }
  if (r.type === "file") { if (r.id === exportId) { download(r.name, r.bytes); setStatus("Download ready."); } return; }
  if (r.id !== buildId || !chosen) return; // a newer build is already on its way
  setBuildPending(false);
  built = { parts: r.parts, placed: r.placed, nplates: r.nplates, layout: chosen };
  viewer.reset();
  renderTabs(); renderResults();
  showTab("assembly");
  setStatus(`${built.layout.cans} cans · ${r.nplates} plates · ~${(totalGrams(r.parts) / 1000).toFixed(2)} kg · built in ${(r.ms / 1000).toFixed(1)} s`);
};

worker.onerror = (e) => {
  setBuildPending(false);
  setStatus(`The geometry engine failed to start (${e.message || "no detail"}) - reload the page.`);
};
worker.onmessageerror = () => setStatus("The geometry engine sent something unreadable - reload the page.");

// ------------------------------------------------------------- stage
function renderTabs() {
  const tabs = $("tabs"); tabs.innerHTML = "";
  const add = (key: string, label: string) => {
    const b = document.createElement("button"); b.textContent = label; b.dataset.key = key; b.setAttribute("role", "tab");
    b.addEventListener("click", () => showTab(key)); tabs.appendChild(b);
  };
  add("assembly", "Assembly");
  for (const p of built!.parts) add(`part:${p.name}`, p.name);
}

function showTab(key: string) {
  if (!built) return;
  $("tabs").querySelectorAll("button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.key === key)));
  $("plates").querySelectorAll(".plate").forEach((b) => b.setAttribute("aria-pressed", String(b.getAttribute("data-key") === key)));
  const { layout, parts, placed } = built;
  $("showCans").hidden = $("explode").hidden = key !== "assembly";
  // the plate view is the bed, so its toggles make no sense there
  $("showGrid").hidden = $("showBed").hidden = key.startsWith("plate:");
  if (key === "assembly") viewer.showAssembly(parts, layout.options, layout.derived);
  else if (key.startsWith("part:")) { const p = parts.find((x) => x.name === key.slice(5)); if (p) viewer.showPart(p, layout.options.bed); }
  else if (key.startsWith("plate:")) { const n = Number(key.slice(6)); viewer.showPlate(placed.filter((p) => p.plate === n), layout.options.bed); }
}

// The translucent settings print every part solid at 20 mm/s, so the estimate follows the checkbox.
const partGrams = (p: PartOut) => pick.translucent.checked ? p.solidGrams : p.grams;
const totalGrams = (parts: PartOut[]) => parts.reduce((a, p) => a + partGrams(p) * p.qty, 0);
function translucentHours(parts: PartOut[]) {
  const machine = index?.machines.find((m) => m.name === pick.nozzle.value);
  if (!machine) return "";
  const mm3 = parts.reduce((a, p) => a + p.solidGrams / 1.27 * 1000 * p.qty, 0);
  return `, about ${(mm3 / translucentFeed(Number(machine.nozzle)) / 3600).toFixed(0)} h at 20 mm/s`;
}

function renderResults() {
  const { parts, placed, nplates, layout } = built!;
  const d = layout.derived, o = layout.options;
  const grams = totalGrams(parts);
  const g = (n: number) => `${n.toFixed(0)} g`;
  $("summary").innerHTML = `<h2>What you get</h2><dl>
    <dt>Capacity</dt><dd>${layout.cans} cans</dd>
    <dt>Footprint</dt><dd>${layout.footprint.map((v) => v.toFixed(0)).join(" × ")} mm</dd>
    <dt>Lane</dt><dd>${d.L.toFixed(0)} × ${d.OW.toFixed(0)} × ${d.H} mm${d.split ? ", two keyed halves" : ""}</dd>
    ${o.base === "gridfinity" ? `<dt>Base</dt><dd>Gridfinity feet, ${d.floorCells[0]} × ${d.floorCells[1]} cells per lane, lane ${o.along === "centre" && o.across === "centre" ? "centred" : `at the ${[o.along, o.across].filter((p) => p !== "centre").join(" ")}`}${d.foot[3] - d.foot[1] > d.floor[3] - d.floor[1] + 0.01 ? `; ${((d.OW - (d.floor[3] - d.floor[1])) / 2).toFixed(1)} mm skirt a side past the baseplate` : ""}${o.magnets ? "; 6 × 2 mm magnet pockets" : ""}</dd>` : ""}
    <dt>Deck slope</dt><dd>${o.slope}° — ${o.slope >= 3 ? "cans roll to the front on their own" : o.slope > 0 ? "shallow, cans may need a nudge" : "flat, cans stay where you put them"}</dd>
    <dt>Grab from</dt><dd>the front, over a ${20} mm lip on ${layout.style === "cascade" ? "the bottom tier" : "every tier"}; ${(d.Hb - 24 - 8 * d.tan - o.canD).toFixed(0)} mm over the can as it clears the lip</dd>
    <dt>Load from</dt><dd>${layout.style === "cascade" ? `the top, through the cover window at the ${o.tiers % 2 === 0 ? "front" : "back (odd tier count)"}` : "the front of each tier"}</dd>
    <dt>Filament</dt><dd>~${(grams / 1000).toFixed(2)} kg PETG${pick.translucent.checked ? ` solid${translucentHours(parts)}` : ""}</dd>
    <dt>Plates</dt><dd>${nplates} on a ${o.bed[0]} × ${o.bed[1]} bed</dd></dl>
    ${layout.warnings.length ? `<p class="warn">${layout.warnings.join("<br>")}</p>` : ""}`;
  const pl = $("plates"); pl.innerHTML = "<h2>Plates</h2>";
  const byPlate = new Map<number, Placement[]>();
  for (const p of placed) { if (!byPlate.has(p.plate)) byPlate.set(p.plate, []); byPlate.get(p.plate)!.push(p); }
  const gramsOf = (name: string) => { const p = parts.find((p) => name === p.name || name.startsWith(p.name + "-")); return p ? partGrams(p) : 0; };
  for (const [n, items] of [...byPlate.entries()].sort((a, b) => a[0] - b[0])) {
    const b = document.createElement("button"); b.type = "button"; b.className = "plate"; b.setAttribute("data-key", `plate:${n}`);
    const summary = plateSummary(items);
    b.innerHTML = `<span class="n">${n + 1}</span><span>${summary}</span><span class="g">${g(items.reduce((a, i) => a + gramsOf(i.name), 0))}</span>`;
    b.addEventListener("click", () => showTab(`plate:${n}`));
    pl.appendChild(b);
  }
  $("results").hidden = false;
}

// ------------------------------------------------------------- downloads
function download(name: string, bytes: Uint8Array) {
  const url = URL.createObjectURL(new Blob([bytes as unknown as BlobPart], { type: "application/octet-stream" }));
  const a = document.createElement("a"); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
$("dl3mf").addEventListener("click", () => { if (!built || buildPending) return; setStatus("Packing 3MF…", true); worker.postMessage({ type: "export", id: ++exportId, format: "3mf", profile: profile?.config } satisfies Req); });
$("dlstl").addEventListener("click", () => { if (!built || buildPending) return; setStatus("Packing STL zip…", true); worker.postMessage({ type: "export", id: ++exportId, format: "stl" } satisfies Req); });

// ------------------------------------------------------------- slicer profile
// Kept out of the hash on purpose: it is tens of KB, and the hash is the shareable part.
let profile: StoredProfile | null = null;

// textContent, not innerHTML: the file name is whatever the user named the file.
function showProfile() {
  $("profileNow").textContent = profile
    ? `Using settings from ${profile.name}.`
    // Bambu Studio 2.8 calls a project with no settings "invalid config" and pops a
    // dialog, but still loads every plate and part. Say so, or the dialog reads as failure.
    : "No print settings loaded. Bambu Studio will warn about an invalid config and fall back to the slicer's own defaults; plates and parts still load.";
  $("profileClear").hidden = !profile;
  if (index) showPicks(profile ? picksFromConfig(index, profile.config) : null);
}
$("profileClear").addEventListener("click", () => { profile = null; clearStoredProfile(); showProfile(); });

/** State and label move together, so the two can never disagree. */
function adoptProfile(loaded: StoredProfile) {
  profile = loaded;
  showProfile();
  const failure = saveStoredProfile(loaded);
  setStatus(failure
    ? `Using ${loaded.name} for this session; couldn't save it for next time: ${failure}`
    : `Print settings loaded from ${loaded.name}.`);
}

function loadProfile() {
  profile = loadStoredProfile();
  if (!profile) clearStoredProfile(); // don't re-read a value we already rejected
  showProfile();
}

// ------------------------------------------------------------- built-in print settings
// Printer → nozzle → process → filament, out of Bambu Studio's own preset catalogue.
// The lower selects only ever list what fits the chosen machine.
let index: ProfileIndex | null = null;
const pick = {
  printer: $<HTMLSelectElement>("pickPrinter"), nozzle: $<HTMLSelectElement>("pickNozzle"),
  process: $<HTMLSelectElement>("pickProcess"), filament: $<HTMLSelectElement>("pickFilament"),
  translucent: $<HTMLInputElement>("pickTranslucent"),
};

function fillSelect(select: HTMLSelectElement, options: { value: string; label: string; group?: string }[], value: string) {
  select.replaceChildren();
  let group: HTMLOptGroupElement | null = null;
  for (const option of options) {
    const element = new Option(option.label, option.value);
    if (!option.group) { select.append(element); continue; }
    if (group?.label !== option.group) { group = document.createElement("optgroup"); group.label = option.group; select.append(group); }
    group.append(element);
  }
  select.value = value;
  select.disabled = !options.length;
}

/** Redraw the four selects around `picks`, or back to "Pick a printer…" when there are none. */
function showPicks(picks: Picks | null) {
  const machine = picks && index!.machines.find((m) => m.name === picks.machine);
  fillSelect(pick.printer, [{ value: "", label: "Pick a printer…" }, ...printersOf(index!).map((p) => ({ value: p, label: p }))], machine?.printer ?? "");
  // No Bambu recipe for a 0.2 nozzle, and at 20 mm/s it would run for months.
  pick.translucent.disabled = !machine || machine.nozzle === "0.2";
  pick.translucent.checked = !pick.translucent.disabled && !!picks?.translucent;
  if (!machine || !picks) { for (const select of [pick.nozzle, pick.process, pick.filament]) fillSelect(select, [], ""); return; }
  fillSelect(pick.nozzle, machinesFor(index!, machine.printer).map((m) => ({ value: m.name, label: `${m.nozzle} mm nozzle` })), machine.name);
  fillSelect(pick.process, processesFor(index!, machine.name).map((p) => ({ value: p.name, label: p.name.replace(/ @.*$/, "") })), picks.process);
  const filaments = filamentsFor(index!, machine.name);
  fillSelect(pick.filament, vendorsOf(filaments).flatMap((vendor) =>
    filaments.filter((f) => f.vendor === vendor).map((f) => ({ value: f.name, label: f.label, group: vendor }))), picks.filament);
}

function applyPicks(picks: Picks) {
  const config = composeProfile(index!, picks);
  adoptProfile({ name: describePicks(index!, picks), config });
  // The printer picked is the bed the parts must fit, so the form follows.
  const bed = bedFromConfig(config);
  let changed = false;
  (["bedX", "bedY", "bedZ"] as const).forEach((name, axis) => {
    const input = form.elements.namedItem(name) as HTMLInputElement;
    if (Number(input.value) === bed[axis]) return;
    input.value = String(bed[axis]); changed = true;
  });
  if (changed) { refit(); syncHash(); }
}

pick.printer.addEventListener("change", () => {
  const machines = machinesFor(index!, pick.printer.value);
  if (!machines.length) return;
  applyPicks({ ...defaultPicks(index!, (machines.find((m) => m.nozzle === "0.4") ?? machines[0]).name), translucent: pick.translucent.checked });
});
pick.nozzle.addEventListener("change", () => applyPicks({ ...defaultPicks(index!, pick.nozzle.value), translucent: pick.translucent.checked }));
for (const control of [pick.process, pick.filament, pick.translucent])
  control.addEventListener("change", () => applyPicks({ machine: pick.nozzle.value, process: pick.process.value, filament: pick.filament.value, translucent: pick.translucent.checked }));
pick.translucent.addEventListener("change", () => { if (built) renderResults(); });

fetch(INDEX_URL)
  .then((response) => { if (!response.ok) throw new Error(`${response.status} ${response.statusText}`); return response.json(); })
  .then((loaded: ProfileIndex) => { index = loaded; showProfile(); })
  .catch((err) => setStatus(`Couldn't load the printer list, so only a 3MF can supply print settings: ${err?.message ?? err}`));

$<HTMLInputElement>("profileIn").addEventListener("change", async (e) => {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  let loaded: StoredProfile;
  try {
    loaded = { name: file.name, config: extractProfile(new Uint8Array(await file.arrayBuffer())) };
  } catch (err: any) {
    // A bad drop keeps whatever profile was already working.
    setStatus(`Couldn't read that 3MF: ${err?.message ?? err}`);
    input.value = "";
    return;
  }
  adoptProfile(loaded);
  input.value = "";
});

loadProfile();

// ------------------------------------------------------------- url state
// Every field readOptions() consumes, plus the layout the user clicked. Checkboxes are
// written as on/off rather than through FormData, which omits an unchecked box entirely,
// so a link with cascade turned off used to load with it back on.
const KEYS = ["w", "d", "h", "front", "canD", "canL", "bedX", "bedY", "bedZ", "cascade", "cover", "solid", "design", "pattern", "base", "magnets", "across", "along", "hexR", "hexAuto", "slope", "lipGap", "fit"];
function syncHash() {
  const q = new URLSearchParams();
  for (const k of KEYS) {
    const el = form.elements.namedItem(k) as HTMLInputElement;
    q.set(k, el.type === "checkbox" ? (el.checked ? "on" : "off") : el.value);
  }
  if (chosenIndex > 0) q.set("layout", String(chosenIndex));
  history.replaceState(null, "", "#" + q.toString());
}
function loadHash() {
  if (!location.hash.length) return;
  const q = new URLSearchParams(location.hash.slice(1));
  for (const k of KEYS) {
    const el = form.elements.namedItem(k) as HTMLInputElement | null; if (!el || !q.has(k)) continue;
    if (el.type === "checkbox") el.checked = q.get(k) === "on"; else el.value = q.get(k)!;
  }
  (form.elements.namedItem("preset") as HTMLSelectElement).value = "custom";
  (form.elements.namedItem("fitOut") as HTMLOutputElement).value = Number((form.elements.namedItem("fit") as HTMLInputElement).value).toFixed(2);
  (form.elements.namedItem("lipGapOut") as HTMLOutputElement).value = (form.elements.namedItem("lipGap") as HTMLInputElement).value;
  return Number(q.get("layout") ?? 0);
}

$("share").addEventListener("click", async () => {
  syncHash(); // a fresh page has no hash until the first edit
  try {
    await navigator.clipboard.writeText(location.href);
    setStatus("Link copied.");
  } catch (err: any) {
    setStatus(`Couldn't copy the link: ${err?.message ?? err}`);
  }
});

refit(loadHash());
