import { DEFAULTS, type Options } from "./geometry";
import { fitSpace, type Layout, type Space } from "./solver";
import { Viewer } from "./viewer";
import type { Req, Res, PartOut } from "./worker";
import { extractProfile, type Placement } from "./export";
import { loadStoredProfile, saveStoredProfile, clearStoredProfile, type StoredProfile } from "./profile";
import { readNumbers, LIMITS } from "./validate";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const form = $<HTMLFormElement>("form");
const viewer = new Viewer($("viewer"));
const worker = new Worker(new URL("worker.js", document.baseURI), { type: "module" });

let layouts: Layout[] = [];
let chosen: Layout | null = null;
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
  const base: Options = {
    ...DEFAULTS,
    canD: num("canD"), canL: num("canL"),
    bed: [num("bedX"), num("bedY"), num("bedZ")],
    cover: f.get("cover") === "on", solid: f.get("solid") === "on", feet: f.get("feet") === "on", fit: num("fit"),
    hexR: num("hexR"), hexAuto: f.get("hexAuto") === "on",
  };
  return { space: { w: num("w"), d: num("d"), h: num("h") }, base, cascade: f.get("cascade") === "on" };
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
  syncHash();
  refit();
});
form.addEventListener("submit", (e) => e.preventDefault());

// ------------------------------------------------------------- layouts
function refit() {
  let space: Space, base: Options, cascade: boolean;
  try {
    ({ space, base, cascade } = readOptions());
  } catch (err: any) {
    // Say which field is wrong rather than building nothing and staying quiet.
    setStatus(`Check your numbers: ${err?.message ?? err}`);
    $("layouts").innerHTML = "";
    chosen = null;
    return;
  }
  layouts = fitSpace(space, base, { cascade });
  const box = $("layouts");
  box.innerHTML = "";
  if (!layouts.length) {
    box.innerHTML = `<p class="empty">Nothing fits. A single lane needs about ${(base.canL + 16).toFixed(0)} mm of width and ${(base.canD + 30).toFixed(0)} mm of height.</p>`;
    chosen = null; return;
  }
  const h = document.createElement("h2"); h.textContent = "Layouts that fit"; box.appendChild(h);
  layouts.forEach((l, i) => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "layout"; b.setAttribute("aria-pressed", String(i === 0));
    const d = l.derived;
    const perDeck = l.style === "cascade" ? `${d.nBottom} on the bottom deck, ${d.n} per upper deck` : `${d.n} per deck`;
    b.innerHTML = `<span class="cans">${l.cans}<small>cans</small></span>
      <span class="line">${l.options.lanesWide} lane${l.options.lanesWide > 1 ? "s" : ""} wide × ${l.options.tiers} tier${l.options.tiers > 1 ? "s" : ""}, ${l.style === "cascade" ? "auto-feed" : "flat"}</span>
      <span class="line muted">${l.footprint.map((v) => v.toFixed(0)).join(" × ")} mm · ${perDeck} · ~${(l.gramsEst / 1000).toFixed(1)} kg</span>`;
    b.addEventListener("click", () => { box.querySelectorAll(".layout").forEach((x) => x.setAttribute("aria-pressed", "false")); b.setAttribute("aria-pressed", "true"); choose(l); });
    box.appendChild(b);
  });
  choose(layouts[0]);
}

function choose(l: Layout) {
  chosen = l;
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
  const grams = r.parts.reduce((a, p) => a + p.grams * p.qty, 0);
  setStatus(`${built.layout.cans} cans · ${r.nplates} plates · ~${(grams / 1000).toFixed(2)} kg · built in ${(r.ms / 1000).toFixed(1)} s`);
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
  if (key === "assembly") viewer.showAssembly(parts, layout.options, layout.derived);
  else if (key.startsWith("part:")) { const p = parts.find((x) => x.name === key.slice(5)); if (p) viewer.showPart(p); }
  else if (key.startsWith("plate:")) { const n = Number(key.slice(6)); viewer.showPlate(placed.filter((p) => p.plate === n), layout.options.bed); }
}

function renderResults() {
  const { parts, placed, nplates, layout } = built!;
  const d = layout.derived, o = layout.options;
  const grams = parts.reduce((a, p) => a + p.grams * p.qty, 0);
  const g = (n: number) => `${n.toFixed(0)} g`;
  $("summary").innerHTML = `<h2>What you get</h2><dl>
    <dt>Capacity</dt><dd>${layout.cans} cans</dd>
    <dt>Footprint</dt><dd>${layout.footprint.map((v) => v.toFixed(0)).join(" × ")} mm</dd>
    <dt>Lane</dt><dd>${d.L.toFixed(0)} × ${d.OW.toFixed(0)} × ${d.H} mm${d.split ? ", two keyed halves" : ""}</dd>
    <dt>Deck slope</dt><dd>${o.slope}° — cans roll to the front on their own</dd>
    <dt>Grab from</dt><dd>the front, over a ${20} mm lip on ${layout.style === "cascade" ? "the bottom tier" : "every tier"}</dd>
    <dt>Load from</dt><dd>${layout.style === "cascade" ? `the top, through the cover window at the ${o.tiers % 2 === 0 ? "front" : "back (odd tier count)"}` : "the front of each tier"}</dd>
    <dt>Filament</dt><dd>~${(grams / 1000).toFixed(2)} kg PETG</dd>
    <dt>Plates</dt><dd>${nplates} on a ${o.bed[0]} × ${o.bed[1]} bed</dd></dl>
    ${layout.warnings.length ? `<p class="warn">${layout.warnings.join("<br>")}</p>` : ""}`;
  const pl = $("plates"); pl.innerHTML = "<h2>Plates</h2>";
  const byPlate = new Map<number, Placement[]>();
  for (const p of placed) { if (!byPlate.has(p.plate)) byPlate.set(p.plate, []); byPlate.get(p.plate)!.push(p); }
  const gramsOf = (name: string) => parts.find((p) => name === p.name || name.startsWith(p.name + "-"))?.grams ?? 0;
  for (const [n, items] of [...byPlate.entries()].sort((a, b) => a[0] - b[0])) {
    const b = document.createElement("button"); b.type = "button"; b.className = "plate"; b.setAttribute("data-key", `plate:${n}`);
    const names = items.map((i) => i.name.replace(/-\d+$/, ""));
    const summary = [...new Set(names)].map((nm) => { const c = names.filter((x) => x === nm).length; return c > 1 ? `${c}× ${nm}` : nm; }).join(", ");
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
    : "Your 3MF opens with the slicer's own defaults.";
  $("profileClear").hidden = !profile;
}
$("profileClear").addEventListener("click", () => { profile = null; clearStoredProfile(); showProfile(); });

function loadProfile() {
  profile = loadStoredProfile();
  if (!profile) clearStoredProfile(); // don't re-read a value we already rejected
  showProfile();
}

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
  // State and label move together, so the two can never disagree.
  profile = loaded;
  showProfile();
  const failure = saveStoredProfile(loaded);
  setStatus(failure
    ? `Using ${file.name} for this session; couldn't save it for next time: ${failure}`
    : `Print settings loaded from ${file.name}.`);
  input.value = "";
});

loadProfile();

// ------------------------------------------------------------- url state
const KEYS = ["w", "d", "h", "canD", "canL", "bedX", "bedY", "bedZ", "cascade", "cover", "solid", "feet", "hexR", "hexAuto", "fit"];
function syncHash() {
  const f = new FormData(form);
  const q = new URLSearchParams();
  for (const k of KEYS) { const v = f.get(k); if (v != null) q.set(k, String(v)); }
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
}
loadHash();
refit();
