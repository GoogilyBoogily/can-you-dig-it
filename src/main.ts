import { K, DENSITY, type Options } from "./geometry";
import { fitSpace, laneNeeds, type Layout, type Space } from "./solver";
import { Viewer } from "./viewer";
import type { Req, Res, PartOut } from "./worker";
import { extractProfile, plateSummary, type Placement } from "./export";
import { hasStoredProfile, loadStoredProfile, saveStoredProfile, clearStoredProfile, type StoredProfile } from "./profile";
import { optionsFrom, type FormValues } from "./validate";
import { INDEX_URL, printersOf, machinesFor, processesFor, filamentsFor, vendorsOf, defaultPicks, describePicks, composeProfile, picksFromConfig, bedFromConfig, translucentFeed, type ProfileIndex, type Picks } from "./profiles";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const form = $<HTMLFormElement>("form");

function setStatus(text: string, busy = false) { const s = $("status"); s.textContent = text; s.classList.toggle("busy", busy); }
/** Every failure goes on the status line and to the console: the line says what, the console keeps the stack. */
function fail(text: string, err?: unknown) { setStatus(text); console.error(err ?? text); }
const reason = (err: unknown) => (err instanceof Error ? err.message : String(err));

let viewer: Viewer;
try {
  viewer = new Viewer($("viewer"));
} catch (err) {
  // Without WebGL nothing below can show a part; say so instead of a page that never
  // responds. The rethrow is the browser's own uncaught report, stack and all.
  setStatus(`The 3D view needs WebGL, which this browser does not offer: ${reason(err)}`);
  throw err;
}
// A throw inside a change handler (a bad preset, a broken index.json) otherwise dies unseen.
// Registered after the Viewer so its rethrow above keeps its own message.
window.addEventListener("error", (e) => fail(`Something went wrong: ${e.message}`, e.error));
window.addEventListener("unhandledrejection", (e) => fail(`Something went wrong: ${reason(e.reason)}`, e.reason));
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
let workerDead: string | null = null; // the worker script failed to load: the message every build() shows instead

// ------------------------------------------------------------- inputs
/** The form as the solver takes it; throws naming a bad field. */
function readOptions(): FormValues {
  const f = new FormData(form);
  return optionsFrom((name) => { const v = f.get(name); return v === null ? null : String(v); });
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
  queueHash();
});
form.addEventListener("submit", (e) => e.preventDefault());

// ------------------------------------------------------------- layouts
/** Re-rank layouts for the form as it stands and pick `want`, or the best one when that is out of range. */
function refit(want = 0) {
  let space: Space, base: Options, cascade: boolean;
  try {
    ({ space, base, cascade } = readOptions());
  } catch (err) {
    // Say which field is wrong rather than building nothing and staying quiet. Not
    // fail(): this fires on every keystroke while a number is half typed.
    setStatus(`Check your numbers: ${reason(err)}`);
    $("layouts").innerHTML = "";
    dropBuild();
    return;
  }
  layouts = fitSpace(space, base, { cascade });
  const box = $("layouts");
  box.innerHTML = "";
  if (!layouts.length) {
    const need = laneNeeds(base, space);
    const nothing = `Nothing fits. A single lane needs ${need.w.toFixed(0)} mm of width and ${need.h.toFixed(0)} mm of height.`;
    box.innerHTML = `<p class="empty">${nothing}</p>`;
    setStatus(nothing);
    dropBuild();
    return;
  }
  const h = document.createElement("h2"); h.textContent = "Layouts that fit"; box.appendChild(h);
  const start = layouts[want] ? want : 0; // a hash can say layout=-1 or 1.5; both fall back to the best
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
  // Retire the in-flight build here, not when the debounce fires. chosen has already
  // moved on, so a result still carrying the old id would be welded to the new layout:
  // new capacity over old geometry, and the downloads unlocked on top of it.
  buildId++;
  clearTimeout(buildTimer);
  setBuildPending(true);
  buildTimer = window.setTimeout(build, 250);
}

/** The form no longer describes what was built: take the old result off the page so the
 *  downloads cannot hand out geometry for numbers that are gone. */
function dropBuild() {
  chosen = null; chosenIndex = 0; built = null;
  for (const id of ["dl3mf", "dlstl"]) $<HTMLButtonElement>(id).disabled = true; // nothing to export
  $("results").hidden = true;
  $("tabs").innerHTML = "";
  for (const id of ["showCans", "explode", "showGrid", "showBed"]) $(id).hidden = true;
  viewer.reset();
}

/** Downloads export whatever the worker built last, so block them until it matches the screen. */
function setBuildPending(pending: boolean) {
  buildPending = pending;
  for (const id of ["dl3mf", "dlstl"]) $<HTMLButtonElement>(id).disabled = pending;
}

// ------------------------------------------------------------- build
function build() {
  if (!chosen) return;
  if (workerDead) { setStatus(workerDead); return; } // posting to a dead worker would only overwrite the message
  const id = buildId; // choose() already claimed it
  setBuildPending(true);
  setStatus("Building parts…", true);
  const req: Req = { type: "build", id, options: chosen.options };
  worker.postMessage(req);
}

worker.onmessage = (e: MessageEvent<Res>) => {
  const r = e.data;
  if (r.type === "error") {
    // Only the build on screen may re-enable downloads: a superseded build's error, or an
    // export's, must not unlock an export of whatever the worker built before it.
    // The build on screen failed, so take it off: leaving it up re-enables the downloads
    // over the previous build's geometry, under an error about this one.
    if (r.of === "build" && r.id === buildId) { setBuildPending(false); dropBuild(); }
    fail(`Something went wrong: ${r.message}`);
    return;
  }
  if (r.type === "file") {
    // A second download click supersedes the first, and the worker is serial: the first
    // still finishes and arrives here. Dropping it silently means the user asked for a
    // 3MF, waited, and never got one or a word about it.
    if (r.id === exportId) { download(r.name, r.bytes); setStatus("Download ready."); }
    else {
      console.info(`dropped a superseded ${r.name} export (#${r.id}, now on #${exportId})`);
      setStatus(`Skipped the earlier ${r.name} - a newer download replaced it.`);
    }
    return;
  }
  if (r.id !== buildId || !chosen) return; // a newer build is already on its way
  setBuildPending(false);
  built = { parts: r.parts, placed: r.placed, nplates: r.nplates, layout: chosen };
  viewer.reset();
  renderTabs(); renderResults();
  showTab("assembly");
  setStatus(`${built.layout.cans} cans · ${r.nplates} plates · ~${(totalGrams(r.parts) / 1000).toFixed(2)} kg · built in ${(r.ms / 1000).toFixed(1)} s`);
};

// The worker script failing to load or parse. Nothing will ever be built, so every later
// build() shows this instead of "Building parts…". preventDefault keeps the browser from
// re-raising it on window, where the generic handler would overwrite the message.
worker.onerror = (e) => {
  e.preventDefault();
  workerDead = `The geometry engine failed to start (${e.message || "no detail"}) - reload the page.`;
  fail(workerDead, e);
};
worker.onmessageerror = (e) => fail("The geometry engine sent something unreadable - reload the page.", e);

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
  const mm3 = parts.reduce((a, p) => a + p.solidGrams / DENSITY * 1000 * p.qty, 0);
  return `, about ${(mm3 / translucentFeed(Number(machine.nozzle)) / 3600).toFixed(0)} h at 20 mm/s`;
}

/** What the weight is made of. DENSITY is PETG's, so a picked filament that is not PETG
 *  is named with the estimate rather than silently reported as PETG: the mass is right to
 *  within the density difference, and the label no longer contradicts the picker. */
function filamentNote(): string {
  const picked = pick.filament.value;
  if (!picked) return " PETG";
  const family = /PETG|PLA|ABS|ASA|PC|PA|TPU|PVA|HIPS/i.exec(picked)?.[0].toUpperCase();
  return family === "PETG" || !family ? " PETG" : ` ${family} (weighed at PETG's density)`;
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
    <dt>Grab from</dt><dd>the front, over a ${K.lipH} mm lip on ${layout.style === "cascade" ? "the bottom tier" : "every tier"}; ${(d.Hb - K.deckLo - K.lipH - K.lipInset * d.tan - o.canD).toFixed(0)} mm over the can as it clears the lip</dd>
    <dt>Load from</dt><dd>${layout.style === "cascade" ? `the top, through the cover window at the ${o.tiers % 2 === 0 ? "front" : "back (odd tier count)"}` : "the front of each tier"}</dd>
    <dt>Filament</dt><dd>~${(grams / 1000).toFixed(2)} kg${filamentNote()}${pick.translucent.checked ? ` solid${translucentHours(parts)}` : ""}</dd>
    <dt>Plates</dt><dd>${nplates} on a ${o.bed[0]} × ${o.bed[1]} bed</dd></dl>
    ${layout.warnings.length ? `<p class="warn">${layout.warnings.join("<br>")}</p>` : ""}`;
  const pl = $("plates"); pl.innerHTML = "<h2>Plates</h2>";
  const byPlate = new Map<number, Placement[]>();
  for (const p of placed) { if (!byPlate.has(p.plate)) byPlate.set(p.plate, []); byPlate.get(p.plate)!.push(p); }
  const gramsOf = (part: string) => { const p = parts.find((p) => p.name === part); return p ? partGrams(p) : 0; };
  for (const [n, items] of [...byPlate.entries()].sort((a, b) => a[0] - b[0])) {
    const b = document.createElement("button"); b.type = "button"; b.className = "plate"; b.setAttribute("data-key", `plate:${n}`);
    const summary = plateSummary(items);
    b.innerHTML = `<span class="n">${n + 1}</span><span>${summary}</span><span class="g">${g(items.reduce((a, i) => a + gramsOf(i.part), 0))}</span>`;
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
function adoptProfile(loaded: StoredProfile, persist = true) {
  profile = loaded;
  showProfile();
  if (!persist) return; // applied from a link: this session only, the stored profile stands
  const failure = saveStoredProfile(loaded);
  setStatus(failure
    ? `Using ${loaded.name} for this session; couldn't save it for next time: ${failure}`
    : `Print settings loaded from ${loaded.name}.`);
}

function loadProfile() {
  profile = loadStoredProfile();
  // Only when something was there to reject. loadStoredProfile returns null for an absent
  // value and for a localStorage that threw, and clearing the second logs "could not clear
  // the saved profile" at a browser that never had one.
  if (!profile && hasStoredProfile()) clearStoredProfile(); // don't re-read a value we already rejected
  showProfile();
}

// ------------------------------------------------------------- built-in print settings
// Printer → nozzle → process → filament, out of Bambu Studio's own preset catalogue.
// The lower selects only ever list what fits the chosen machine.
let index: ProfileIndex | null = null;
let hashPicks: Picks | null = null; // print settings a shared link carried, waiting for the index
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

function applyPicks(picks: Picks, persist = true) {
  const config = composeProfile(index!, picks);
  adoptProfile({ name: describePicks(index!, picks), config }, persist);
  // The printer picked is the bed the parts must fit, so the form follows.
  const bed = bedFromConfig(config);
  let changed = false;
  (["bedX", "bedY", "bedZ"] as const).forEach((name, axis) => {
    const input = form.elements.namedItem(name) as HTMLInputElement;
    if (Number(input.value) === bed[axis]) return;
    input.value = String(bed[axis]); changed = true;
  });
  // refit(chosenIndex), not refit(): the default resets the choice to 0, and a shared link
  // carrying both a layout and a printer had its layout dropped when the catalogue landed.
  if (changed) refit(chosenIndex);
  queueHash(); // the picks are in the link now, and only the bed change needs a refit
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
  .then((loaded: ProfileIndex) => {
    index = loaded;
    // loadHash ran long before this resolved, so a link's picks are applied here. An
    // unknown machine (a catalogue that moved on) falls through to the stored profile.
    // A link's picks apply for the session but are not written to storage: the recipient
    // may have imported their own 3MF, and that is the one thing a link cannot rebuild.
    // composeProfile throws when a preset name has moved on between Bambu releases, and
    // an uncaught throw here lands in the fetch's catch - which reports the catalogue as
    // unloadable and leaves every select empty, with no way to pick a printer.
    try {
      if (hashPicks && index.machines.some((machine) => machine.name === hashPicks!.machine)) applyPicks(hashPicks, false);
      else showProfile();
    } catch (err) {
      hashPicks = null;
      showProfile();
      setStatus(`That link's print settings are no longer in the catalogue, so your own are in use: ${reason(err)}`);
    }
  })
  .catch((err) => {
    // On the print-settings label, not the status line: the first build lands ~250 ms
    // later and would wipe it before anyone read it.
    console.error(err);
    $("profileNow").textContent += ` Couldn't load the printer list, so only a 3MF can supply print settings: ${reason(err)}`;
  });

$<HTMLInputElement>("profileIn").addEventListener("change", async (e) => {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  let loaded: StoredProfile;
  try {
    loaded = { name: file.name, config: extractProfile(new Uint8Array(await file.arrayBuffer())) };
  } catch (err) {
    // A bad drop keeps whatever profile was already working.
    fail(`Couldn't read that 3MF: ${reason(err)}`, err);
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
// replaceState is rate limited - Chrome drops past ~100 in 30 s, Safari throws - and the
// hash write used to run once per input event while the build was debounced. Holding an
// arrow key in a number field is ~30 events a second, and the writes the browser dropped
// included the one Share makes, so Share copied a stale link and said "Link copied."
let hashTimer = 0;
function queueHash() {
  clearTimeout(hashTimer);
  hashTimer = window.setTimeout(syncHash, 250);
}
function syncHash() {
  clearTimeout(hashTimer); // a queued write would only repeat this one
  const q = new URLSearchParams();
  for (const k of KEYS) {
    const el = form.elements.namedItem(k) as HTMLInputElement;
    q.set(k, el.type === "checkbox" ? (el.checked ? "on" : "off") : el.value);
  }
  if (chosenIndex > 0) q.set("layout", String(chosenIndex));
  // Not the imported 3MF - that is tens of KB - but the built-in picks are four short
  // strings, and translucent changes the filament and time estimates and the exported
  // settings. Without them the recipient reads different numbers off the same link.
  // hashPicks until the catalogue lands: the selects are empty for the first few hundred
  // ms of a page load, and writing the hash from them in that window strips these four
  // keys out of the link that carried them. Permanently, if the fetch then fails.
  const picks = pick.nozzle.value
    ? { machine: pick.nozzle.value, process: pick.process.value, filament: pick.filament.value, translucent: pick.translucent.checked }
    : hashPicks;
  if (picks) {
    q.set("machine", picks.machine);
    q.set("process", picks.process);
    q.set("filament", picks.filament);
    if (picks.translucent) q.set("translucent", "on");
  }
  history.replaceState(null, "", "#" + q.toString());
}
function loadHash() {
  if (!location.hash.length) return;
  const q = new URLSearchParams(location.hash.slice(1));
  for (const k of KEYS) {
    const el = form.elements.namedItem(k) as HTMLInputElement | null; if (!el || !q.has(k)) continue;
    if (el.type === "checkbox") el.checked = q.get(k) === "on"; else el.value = q.get(k)!;
  }
  hashPicks = q.has("machine")
    ? { machine: q.get("machine")!, process: q.get("process") ?? "", filament: q.get("filament") ?? "", translucent: q.get("translucent") === "on" }
    : null;
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
  } catch (err) {
    fail(`Couldn't copy the link: ${reason(err)}`, err);
  }
});

// What the WebGL context holds, for the UI test that watches for a leak.
(window as unknown as { viewerInfo: () => ReturnType<Viewer["info"]> }).viewerInfo = () => viewer.info();

// A range input clamps and step-snaps whatever the hash carried, so the form can end up
// holding different numbers than the link that opened it. Rewrite the hash from the form:
// sender and recipient then see the same design, and Share copies what is on screen.
const arrivedWithHash = location.hash.length > 0;
refit(loadHash());
if (arrivedWithHash) syncHash();
