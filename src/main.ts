import { previewCounts, mixedPreviewCounts, independentRowsPreviewCounts } from "./assembly";
import { estimateSettings } from "./estimate";
import { DEFAULTS, K, minimumLaneLength, rearTier, type Options } from "./geometry";
import { fitSpace, laneNeeds, resolveMixedBuild, type Layout, type Space, type MixedLayout } from "./solver";
import { INDEPENDENT_ROWS_LIMITS, type MixedStackRequest, type IndependentLaneRequest, type IndependentRowRequest } from "./model";
import { resolveIndependentRows, type IndependentRowsLayout } from "./rows";
import { Viewer } from "./viewer";
import type { Req, Res, PartOut } from "./worker";
import { extractProfile, plateSummary, type PackedPlan, type PackedPlacement } from "./export";
import { hasStoredProfile, loadStoredProfile, saveStoredProfile, clearStoredProfile, type StoredProfile } from "./profile";
import { LIMITS, optionsFrom, mixedOptionsFrom, mixedStacksFrom, independentRowsFrom, independentRowsOptionsFrom, type FormValues } from "./validate";
import { INDEX_URL, printersOf, machinesFor, processesFor, filamentsFor, vendorsOf, defaultPicks, describePicks, composeProfile, parseConfig, picksFromConfig, bedFromConfig, keepOutFromConfig, type ProfileIndex, type Picks } from "./profiles";

type BuildLayout = Layout | MixedLayout | IndependentRowsLayout;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const form = $<HTMLFormElement>("form");
for (const button of document.querySelectorAll<HTMLButtonElement>("[data-navigate]")) {
  button.addEventListener("click", () => {
    const heading = $(`${button.dataset.navigate}Heading`);
    heading.scrollIntoView({ block: "start" });
    heading.focus({ preventScroll: true });
  });
}

const themeSelect = $<HTMLSelectElement>("theme");
themeSelect.value = document.documentElement.dataset.theme ?? "system";
themeSelect.addEventListener("change", () => {
  if (themeSelect.value === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = themeSelect.value;
  try {
    localStorage.setItem("can-you-dig-it.theme", themeSelect.value);
  } catch (error) {
    console.warn("Could not save the theme; using it for this visit.", error);
  }
});

function setStatus(text: string, busy = false) {
  const s = $("status"); s.textContent = text; s.classList.toggle("busy", busy);
  if (!$("viewerMessage").hidden) $("viewerMessage").textContent = text;
  $("printRecovery").querySelector("p")!.textContent = `${text} Review shelf, cans and printer in Setup.`;
}
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
let worker = startWorker();

let layouts: BuildLayout[] = [];
let chosen: BuildLayout | null = null;
let chosenIndex = 0; // position in the ranked list; the hash carries it so a shared link opens on the same layout
let built: { parts: PartOut[]; plan: PackedPlan; nplates: number; layout: BuildLayout } | null = null;
let buildId = 0, exportId = 0, buildTimer = 0;
let buildPending = false; // a build is queued or in flight; exporting now would save stale geometry
let inFlightBuildIdentifier: number | null = null;
let pendingBuild: Extract<Req, { type: "build" | "build-mixed" | "build-rows" }> | null = null;
let workerDead: string | null = null; // the worker script failed to load: the message every build() shows instead
let restartedFor = -1; // the build a kernel abort last restarted the worker on

// ------------------------------------------------------------- inputs
const buildMode = $<HTMLSelectElement>("buildMode");
const shareWalls = form.elements.namedItem("shareWalls") as HTMLInputElement;
const stackEditor = $("mixedStacks");
const canPresets = form.elements.namedItem("preset") as HTMLSelectElement;
let incomingDesignError: string | null = null;
// A malformed link flag needs an explicit choice on its own checkbox; unrelated
// edits must not replace its otherwise valid request with a fallback design.
const incomingFlagErrors = new Map<string, string>();
function incomingLinkError(): string | null {
  const flagNames = buildMode.value === "rows" ? ["rowsShareWalls", "rowsTopCover"]
    : buildMode.value === "mixed" ? ["shareWalls"] : [];
  const flagErrors = flagNames.map(name => incomingFlagErrors.get(name)).filter(error => error !== undefined);
  return incomingDesignError ?? (flagErrors.join("; ") || null);
}
let stacksInitialized = false;
const isMixedLayout = (layout: BuildLayout): layout is MixedLayout => "mode" in layout && layout.mode === "mixed";
const isIndependentRowsLayout = (layout: BuildLayout): layout is IndependentRowsLayout => "mode" in layout && layout.mode === "rows";
// Independent row cards display top-down and left-to-right; requests use the opposite order.
const customRows = $("customRows");
const rowsShareWalls = form.elements.namedItem("rowsShareWalls") as HTMLInputElement;
const rowsTopCover = form.elements.namedItem("rowsTopCover") as HTMLInputElement;
let independentRowsInitialized = false;
function customRowCards() { return [...customRows.querySelectorAll<HTMLElement>(":scope > .custom-row-card")].reverse(); }
function customLaneCards(row: HTMLElement) { return [...row.querySelector<HTMLElement>("[data-row-lanes]")!.children] as HTMLElement[]; }
function defaultIndependentLane(): IndependentLaneRequest {
  const usableDepth = Number((form.elements.namedItem("d") as HTMLInputElement).value) - Number((form.elements.namedItem("front") as HTMLInputElement).value);
  return { canDiameter: DEFAULTS.canD, canHeight: DEFAULTS.canL, depth: Math.min(480, usableDepth), slope: DEFAULTS.slope, lipGap: DEFAULTS.lipGap };
}
function defaultIndependentRow(): IndependentRowRequest {
  return { lanes: [defaultIndependentLane(), defaultIndependentLane()], repeat: 1, rowHeight: "auto", rowSpan: "auto", alignment: "centre", rearLoad: false };
}
function independentRowValues() {
  return customRowCards().map((row, rowIndex) => {
    const field = (name: string) => row.querySelector<HTMLInputElement | HTMLSelectElement>(`[data-row-field="${name}"]`)!;
    const lanes = customLaneCards(row).reverse();
    const requestedCount = Number(field("laneCount").value || NaN);
    if (!Number.isSafeInteger(requestedCount) || requestedCount < 1 || requestedCount > INDEPENDENT_ROWS_LIMITS.lanesPerRow)
      throw new Error(`Row ${rowIndex + 1}: lane count must be a whole number from 1 to ${INDEPENDENT_ROWS_LIMITS.lanesPerRow}`);
    if (requestedCount !== lanes.length) throw new Error(`Row ${rowIndex + 1}: lane count does not match its editable lanes`);
    const dimension = (name: string) => field(`${name}Mode`).value === "auto" ? "auto" : Number(field(name).value || NaN);
    return { lanes: lanes.map(lane => {
      const number = (name: string) => Number(lane.querySelector<HTMLInputElement>(`[data-lane-field="${name}"]`)!.value || NaN);
      return { canDiameter: number("canDiameter"), canHeight: number("canHeight"), depth: number("depth"), slope: number("slope"), lipGap: number("lipGap") };
    }), repeat: Number(field("repeat").value || NaN), rowHeight: dimension("rowHeight"), rowSpan: dimension("rowSpan"),
      alignment: field("alignment").value, rearLoad: (field("rearLoad") as HTMLInputElement).checked };
  });
}
function addIndependentLane(row: HTMLElement, request?: IndependentLaneRequest) {
  if (!request) {
    const existingDepth = row.querySelector<HTMLInputElement>('[data-lane-field="depth"]');
    request = { ...defaultIndependentLane(), ...(existingDepth ? { depth: existingDepth.valueAsNumber } : {}) };
  }
  const lane = document.createElement("section"); lane.className = "custom-lane-card";
  lane.innerHTML = `<h4></h4><label>Can preset<select data-lane-field="preset"></select></label><div class="dims">
    <label>Can diameter<input data-lane-field="canDiameter" type="number" min="20" max="200" step="0.1"><span>mm</span></label>
    <label>Can height<input data-lane-field="canHeight" type="number" min="40" max="400" step="0.1"><span>mm</span></label>
    <label>Exact depth<input data-lane-field="depth" type="number" min="50" max="2000" step="0.1"><span>mm</span></label>
    <label>Deck slope<input data-lane-field="slope" type="number" min="0" max="10" step="0.5"><span>°</span></label>
    <label>Lip headroom<input data-lane-field="lipGap" type="number" min="0" max="20" step="0.1"><span>mm</span></label></div>
    <p class="hint" data-lane-resolution></p><div class="custom-lane-actions">
    <button type="button" class="stack-action" data-lane-action="left">← Left</button><button type="button" class="stack-action" data-lane-action="right">Right →</button>
    <button type="button" class="stack-action" data-lane-action="duplicate">Duplicate</button><button type="button" class="stack-action" data-lane-action="remove">Remove</button></div>`;
  const preset = lane.querySelector<HTMLSelectElement>('[data-lane-field="preset"]')!;
  preset.replaceChildren(...[...canPresets.options].map(option => option.cloneNode(true)));
  preset.value = [...canPresets.options].find(option => option.value === `${request.canDiameter},${request.canHeight}`)?.value ?? "custom";
  for (const field of ["canDiameter", "canHeight", "depth", "slope", "lipGap"] as const)
    lane.querySelector<HTMLInputElement>(`[data-lane-field="${field}"]`)!.value = String(request[field]);
  row.querySelector("[data-row-lanes]")!.prepend(lane);
  row.querySelector<HTMLInputElement>('[data-row-field="laneCount"]')!.value = String(customLaneCards(row).length);
  return lane;
}
function addIndependentRow(request?: IndependentRowRequest) {
  if (!request) {
    request = defaultIndependentRow();
    const adjacentDepth = customRows.firstElementChild?.querySelector<HTMLInputElement>('[data-lane-field="depth"]');
    if (adjacentDepth) for (const lane of request.lanes) lane.depth = adjacentDepth.valueAsNumber;
  }
  const row = document.createElement("section"); row.className = "custom-row-card";
  row.innerHTML = `<h3 tabindex="-1"></h3><div class="custom-row-actions">
    <button type="button" class="stack-action" data-row-action="higher">↑ Higher</button><button type="button" class="stack-action" data-row-action="lower">↓ Lower</button>
    <button type="button" class="stack-action" data-row-action="duplicate">Duplicate row</button><button type="button" class="stack-action" data-row-action="remove">Remove row</button></div>
    <div class="dims">
    <label>Lane count<input data-row-field="laneCount" type="number" min="1" max="${INDEPENDENT_ROWS_LIMITS.lanesPerRow}" step="1"></label>
    <label>Repeat this row<input data-row-field="repeat" type="number" min="1" max="${INDEPENDENT_ROWS_LIMITS.repetitions}" step="1"></label>
    <label>Row height<select data-row-field="rowHeightMode"><option value="auto">Automatic</option><option value="fixed">Exact</option></select></label>
    <label data-row-height-fixed>Exact row height<input data-row-field="rowHeight" type="number" min="0.1" max="2000" step="0.1"><span>mm</span></label>
    <label>Row span<select data-row-field="rowSpanMode"><option value="auto">Compact</option><option value="fixed">Exact</option></select></label>
    <label data-row-span-fixed>Exact row span<input data-row-field="rowSpan" type="number" min="0.1" max="2000" step="0.1"><span>mm</span></label>
    <label>Alignment<select data-row-field="alignment"><option value="left">Left</option><option value="centre">Centred</option><option value="right">Right</option></select></label></div>
    <label class="check"><input data-row-field="rearLoad" type="checkbox"> Load this row from the back</label>
    <p class="hint">Automatic height uses this row’s tallest lane. A larger span creates empty gaps between complete lanes.</p>
    <p class="hint" data-row-resolution></p><div class="custom-row-lanes" data-row-lanes></div>
    <button type="button" class="stack-action" data-row-action="add-lane">Add a lane on the left</button>`;
  for (const [name, value] of [["repeat", request.repeat], ["alignment", request.alignment]] as const)
    row.querySelector<HTMLInputElement | HTMLSelectElement>(`[data-row-field="${name}"]`)!.value = String(value);
  for (const name of ["rowHeight", "rowSpan"] as const) {
    row.querySelector<HTMLSelectElement>(`[data-row-field="${name}Mode"]`)!.value = request[name] === "auto" ? "auto" : "fixed";
    row.querySelector<HTMLInputElement>(`[data-row-field="${name}"]`)!.value = request[name] === "auto" ? (name === "rowHeight" ? "100" : "420") : String(request[name]);
  }
  row.querySelector<HTMLInputElement>('[data-row-field="rearLoad"]')!.checked = request.rearLoad;
  for (const lane of request.lanes) addIndependentLane(row, lane);
  customRows.prepend(row); updateIndependentRowActions();
  return row;
}
function resetIndependentRows(requests = [defaultIndependentRow()]) {
  customRows.replaceChildren();
  for (const request of requests) addIndependentRow(request);
}
function updateIndependentRowActions() {
  const rows = customRowCards();
  for (const [rowIndex, row] of rows.entries()) {
    row.querySelector("h3")!.textContent = `Row ${rowIndex + 1}${rowIndex === 0 ? " · bottom" : rowIndex === rows.length - 1 ? " · top" : ""}`;
    for (const action of ["higher", "lower", "duplicate", "remove", "add-lane"]) {
      const button = row.querySelector<HTMLButtonElement>(`[data-row-action="${action}"]`)!;
      button.disabled = action === "higher" ? rowIndex === rows.length - 1 : action === "lower" ? rowIndex === 0
        : action === "remove" ? rows.length <= 1 : action === "duplicate" ? rows.length >= INDEPENDENT_ROWS_LIMITS.requestedRows
        : customLaneCards(row).length >= INDEPENDENT_ROWS_LIMITS.lanesPerRow;
      button.setAttribute("aria-label", `${action === "higher" ? "Move higher" : action === "lower" ? "Move lower" : action === "duplicate" ? "Duplicate" : action === "remove" ? "Remove" : "Add a lane to"} row ${rowIndex + 1}`);
    }
    const lanes = customLaneCards(row).reverse();
    for (const [laneIndex, lane] of lanes.entries()) {
      lane.querySelector("h4")!.textContent = `Lane ${laneIndex + 1}${laneIndex === 0 ? " · right" : laneIndex === lanes.length - 1 ? " · left" : ""}`;
      for (const action of ["left", "right", "duplicate", "remove"]) {
        const button = lane.querySelector<HTMLButtonElement>(`[data-lane-action="${action}"]`)!;
        button.disabled = action === "left" ? laneIndex === lanes.length - 1 : action === "right" ? laneIndex === 0
          : action === "duplicate" ? lanes.length >= INDEPENDENT_ROWS_LIMITS.lanesPerRow : lanes.length <= 1;
        button.setAttribute("aria-label", `${action === "left" || action === "right" ? `Move ${action}` : action === "duplicate" ? "Duplicate" : "Remove"} lane ${laneIndex + 1} in row ${rowIndex + 1}`);
      }
    }
  }
  $<HTMLButtonElement>("addIndependentRow").disabled = rows.length >= INDEPENDENT_ROWS_LIMITS.requestedRows;
  updateIndependentRowSummaries();
}
function updateIndependentRowSummaries() {
  const rows = customRowCards(), map = $("independentRowOrder");
  map.replaceChildren();
  for (const row of rows.slice().reverse()) {
    const rowIndex = rows.indexOf(row), band = document.createElement("div"); band.className = "custom-row-band";
    const title = document.createElement("strong"); title.textContent = `Row ${rowIndex + 1}`; band.append(title);
    for (const lane of customLaneCards(row)) {
      const label = document.createElement("span");
      label.textContent = `${lane.querySelector<HTMLInputElement>('[data-lane-field="canHeight"]')!.value} mm`;
      band.append(label);
    }
    map.append(band);
    row.querySelector<HTMLElement>("[data-row-height-fixed]")!.hidden = row.querySelector<HTMLSelectElement>('[data-row-field="rowHeightMode"]')!.value === "auto";
    row.querySelector<HTMLElement>("[data-row-span-fixed]")!.hidden = row.querySelector<HTMLSelectElement>('[data-row-field="rowSpanMode"]')!.value === "auto";
  }
}
function cloneIndependentCard(source: HTMLElement): HTMLElement {
  const copy = source.cloneNode(true) as HTMLElement;
  const sourceFields = source.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input,select");
  copy.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input,select").forEach((field, index) => {
    field.value = sourceFields[index].value;
    if (field instanceof HTMLInputElement && field.type === "checkbox") field.checked = (sourceFields[index] as HTMLInputElement).checked;
  });
  return copy;
}
function moveIndependentCard(card: HTMLElement, earlier: boolean) {
  const neighbor = earlier ? card.previousElementSibling : card.nextElementSibling;
  if (!neighbor) return;
  const focused = card.contains(document.activeElement) ? document.activeElement as HTMLButtonElement : null;
  card.parentElement!.insertBefore(card, earlier ? neighbor : neighbor.nextElementSibling);
  updateIndependentRowActions();
  const focus = focused?.disabled ? card.querySelector<HTMLButtonElement>("button:not([disabled])") : focused;
  focus?.focus({ preventScroll: true }); card.scrollIntoView({ block: "nearest" });
  $("independentRowOrderStatus").textContent = "Row and lane order updated. Row 1 is at the bottom; Lane 1 is on the right.";
  editDesign();
}
$("addIndependentRow").addEventListener("click", () => {
  if (customRowCards().length >= INDEPENDENT_ROWS_LIMITS.requestedRows) return;
  addIndependentRow(); editDesign();
});
customRows.addEventListener("click", event => {
  const button = (event.target as Element).closest<HTMLButtonElement>("[data-row-action],[data-lane-action]");
  if (!button || button.disabled) return;
  const row = button.closest<HTMLElement>(".custom-row-card")!, lane = button.closest<HTMLElement>(".custom-lane-card");
  const action = button.dataset.laneAction ?? button.dataset.rowAction;
  if (action === "higher" || action === "left") { moveIndependentCard(lane ?? row, true); return; }
  if (action === "lower" || action === "right") { moveIndependentCard(lane ?? row, false); return; }
  if (action === "duplicate") (lane ?? row).after(cloneIndependentCard(lane ?? row));
  else if (action === "remove") (lane ?? row).remove();
  else if (action === "add-lane") addIndependentLane(row);
  if (lane) row.querySelector<HTMLInputElement>('[data-row-field="laneCount"]')!.value = String(customLaneCards(row).length);
  updateIndependentRowActions(); editDesign();
});
customRows.addEventListener("keydown", event => {
  if (event.altKey || event.ctrlKey || event.metaKey) return;
  const button = (event.target as Element).closest<HTMLButtonElement>("[data-row-action],[data-lane-action]");
  if (!button) return;
  const lane = button.closest<HTMLElement>(".custom-lane-card"), row = button.closest<HTMLElement>(".custom-row-card")!;
  const earlier = lane ? event.key === "ArrowLeft" : event.key === "ArrowUp";
  const later = lane ? event.key === "ArrowRight" : event.key === "ArrowDown";
  if (!earlier && !later) return;
  event.preventDefault(); moveIndependentCard(lane ?? row, earlier);
});
function editIndependentRowInput(input: HTMLInputElement | HTMLSelectElement) {
  const lane = input.closest<HTMLElement>(".custom-lane-card");
  if (lane) {
    if (input.dataset.laneField === "preset" && input.value !== "custom") {
      const [diameter, height] = input.value.split(",");
      lane.querySelector<HTMLInputElement>('[data-lane-field="canDiameter"]')!.value = diameter;
      lane.querySelector<HTMLInputElement>('[data-lane-field="canHeight"]')!.value = height;
    } else if (input.dataset.laneField === "canDiameter" || input.dataset.laneField === "canHeight")
      lane.querySelector<HTMLSelectElement>('[data-lane-field="preset"]')!.value = "custom";
  }
  if (input.dataset.rowField === "laneCount") {
    const row = input.closest<HTMLElement>(".custom-row-card")!, count = Number(input.value || NaN);
    if (Number.isSafeInteger(count) && count >= 1 && count <= INDEPENDENT_ROWS_LIMITS.lanesPerRow) {
      while (customLaneCards(row).length < count) addIndependentLane(row);
      while (customLaneCards(row).length > count) customLaneCards(row)[0].remove();
      updateIndependentRowActions();
    }
  }
  updateIndependentRowSummaries(); editDesign();
}

function sharedStackOptions() {
  const checkbox = (name: string) => (form.elements.namedItem(name) as HTMLInputElement).checked;
  const number = (name: string) => Number((form.elements.namedItem(name) as HTMLInputElement).value || NaN);
  return { cascade: checkbox("cascade"), slope: number("slope"), lipGap: number("lipGap"),
    cover: checkbox("cover"), rearLoad: checkbox("rearLoad"), stackable: (form.elements.namedItem("stackable") as HTMLSelectElement).value === "on" };
}
const defaultStacks = (): MixedStackRequest[] => Array.from({ length: 2 }, () => ({ canDiameter: 66, canHeight: 122.5, depth: 480, tiers: "auto", ...sharedStackOptions() }));

function stackRows() { return [...stackEditor.querySelectorAll<HTMLElement>(".stack-card")]; }

function stackValues() {
  return stackRows().map((row) => {
    const value = (field: string) => row.querySelector<HTMLInputElement | HTMLSelectElement>(`[data-stack-field="${field}"]`)!.value;
    const checked = (field: string) => row.querySelector<HTMLInputElement>(`[data-stack-field="${field}"]`)!.checked;
    return { canDiameter: Number(value("canDiameter") || NaN), canHeight: Number(value("canHeight") || NaN),
      depth: Number(value("depth") || NaN), tiers: value("tierMode") === "auto" ? "auto" : Number(value("tiers") || NaN),
      cascade: checked("cascade"), slope: Number(value("slope") || NaN), lipGap: Number(value("lipGap") || NaN),
      cover: checked("cover"), rearLoad: checked("rearLoad"), stackable: checked("stackable") };
  });
}

function updateStackActions() {
  const rows = stackRows();
  rows.forEach((row, index) => {
    row.querySelector("h3")!.textContent = `Stack ${index + 1}`;
    row.querySelector("[data-stack-handle]")!.setAttribute("aria-label", `Reorder stack ${index + 1}`);
    for (const action of ["earlier", "later", "duplicate", "remove"]) {
      const button = row.querySelector<HTMLButtonElement>(`[data-stack-action="${action}"]`)!;
      button.disabled = action === "earlier" ? index === 0 : action === "later" ? index === rows.length - 1 : action === "duplicate" ? rows.length >= 8 : rows.length <= 2;
      button.setAttribute("aria-label", action === "earlier" ? `Move stack ${index + 1} up` : action === "later" ? `Move stack ${index + 1} down` : `${button.textContent} stack ${index + 1}`);
    }
    const automatic = row.querySelector<HTMLSelectElement>('[data-stack-field="tierMode"]')!.value === "auto";
    row.querySelector<HTMLElement>(".fixed-tiers")!.hidden = automatic;
    const singleTier = !automatic && row.querySelector<HTMLInputElement>('[data-stack-field="tiers"]')!.valueAsNumber === 1;
    const feeding = row.querySelector<HTMLInputElement>('[data-stack-field="cascade"]')!;
    if (singleTier && !feeding.disabled) {
      feeding.dataset.multipleTierChoice = String(feeding.checked);
      feeding.checked = false;
    } else if (!singleTier && feeding.disabled) {
      feeding.checked = feeding.dataset.multipleTierChoice === "true";
      delete feeding.dataset.multipleTierChoice;
    }
    feeding.disabled = singleTier;
    row.querySelector<HTMLElement>("[data-stack-feeding-note]")!.hidden = !singleTier;
  });
  $<HTMLButtonElement>("addStack").disabled = rows.length >= 8;
  updateStackSummaries();
}

function addStack(request: MixedStackRequest, after?: HTMLElement) {
  const row = document.createElement("section"); row.className = "stack-card";
  row.innerHTML = `<div class="stack-heading"><h3></h3><button type="button" class="stack-action stack-handle" data-stack-handle aria-describedby="stackReorderHint">⠿ Reorder</button></div><div class="row"><label class="grow">Can preset<select data-stack-field="preset"></select></label></div><div class="dims">
    <label>Can diameter<input data-stack-field="canDiameter" type="number" min="20" max="200" step="0.1"><span>mm</span></label>
    <label>Can height<input data-stack-field="canHeight" type="number" min="40" max="400" step="0.1"><span>mm</span></label>
    <label class="stack-depth">Container depth<input data-stack-field="depth" aria-label="Container depth" type="range" min="50" max="2000" step="0.1"><output data-stack-depth-value></output><small class="hint" data-stack-depth-bounds></small></label>
    <label>Tiers<select data-stack-field="tierMode"><option value="auto">Automatic</option><option value="fixed">Fixed</option></select></label>
    <label class="fixed-tiers">Tier count<input data-stack-field="tiers" type="number" min="1" step="1"></label>
    </div><p class="stack-position hint"></p><details class="stack-options"><summary>Stack options<span class="option-state"></span></summary>
    <div class="dims">
    <label>Deck slope<input data-stack-field="slope" type="number" min="0" max="10" step="0.5"><span>°</span></label>
    <label>Lip headroom<input data-stack-field="lipGap" type="number" min="0" max="20" step="1"><span>mm</span></label>
    </div>
    <label class="check"><input data-stack-field="cascade" type="checkbox"> Auto-feed between tiers</label>
    <small class="hint" data-stack-feeding-note hidden>A single tier loads from the front. Auto-feed between tiers requires at least two tiers.</small>
    <label class="check"><input data-stack-field="cover" type="checkbox"> Cover on the top tier</label>
    <label class="check"><input data-stack-field="rearLoad" type="checkbox"> Load from the back</label>
    <label class="check"><input data-stack-field="stackable" type="checkbox"> Join another tier on top</label>
    </details><div class="stack-actions">
    <button type="button" class="stack-action" data-stack-action="duplicate">Duplicate</button>
    <button type="button" class="stack-action" data-stack-action="earlier">↑ Move up</button>
    <button type="button" class="stack-action" data-stack-action="later">↓ Move down</button>
    <button type="button" class="stack-action" data-stack-action="remove">Remove</button></div>`;
  for (const field of ["canDiameter", "canHeight", "depth"] as const) row.querySelector<HTMLInputElement>(`[data-stack-field="${field}"]`)!.value = String(request[field]);
  const preset = row.querySelector<HTMLSelectElement>('[data-stack-field="preset"]')!;
  preset.replaceChildren(...[...canPresets.options].map((option) => option.cloneNode(true)));
  preset.value = [...canPresets.options].find((option) => {
    const [diameter, height] = option.value.split(",").map(Number);
    return diameter === request.canDiameter && height === request.canHeight;
  })?.value ?? "custom";
  row.querySelector<HTMLSelectElement>('[data-stack-field="tierMode"]')!.value = request.tiers === "auto" ? "auto" : "fixed";
  row.querySelector<HTMLInputElement>('[data-stack-field="tiers"]')!.value = request.tiers === "auto" ? "2" : String(request.tiers);
  const shared = sharedStackOptions();
  for (const field of ["slope", "lipGap"] as const) row.querySelector<HTMLInputElement>(`[data-stack-field="${field}"]`)!.value = String(request[field] ?? shared[field]);
  for (const field of ["cascade", "cover", "rearLoad", "stackable"] as const) row.querySelector<HTMLInputElement>(`[data-stack-field="${field}"]`)!.checked = request[field] ?? shared[field];
  if (after) after.after(row); else stackEditor.append(row);
  updateStackActions();
}

function resetStacks(requests = defaultStacks()) {
  finishStackDrag(true);
  stackEditor.replaceChildren();
  for (const request of requests) addStack(request);
}

function syncMode() {
  const mixed = buildMode.value === "mixed", rows = buildMode.value === "rows";
  if (!mixed) finishStackDrag(true);
  if (mixed && !stacksInitialized) { resetStacks(); stacksInitialized = true; }
  if (rows && !independentRowsInitialized) { resetIndependentRows(); independentRowsInitialized = true; }
  $("uniformCan").hidden = mixed || rows;
  $("mixedEditor").hidden = !mixed;
  $("rowsEditor").hidden = !rows;
  $("baseOptions").hidden = rows;
  $("outerJoins").hidden = mixed || rows;
  $("outerJoinsHint").hidden = mixed || rows;
  $("gridAlignment").hidden = mixed || rows;
  $("uniformAssembly").hidden = mixed || rows;
  $("mixedAssembly").hidden = !mixed;
  $("sharedWallAssembly").hidden = true;
  $("rowsAssembly").hidden = !rows;
  for (const id of ["sharedCascade", "sharedCover", "sharedRearLoad", "sharedSlope", "sharedLipGap", "sharedStackable"]) $(id).hidden = mixed || rows;
  $("optionsLegend").textContent = rows ? "Customize all rows" : mixed ? "Customize all stacks" : "Customize";
  $("feedingOptions").hidden = mixed || rows;
  updateControlSummaries();
}

function updateStackSummaries() {
  const rows = stackRows();
  $("mixedOrder").replaceChildren(...rows.slice().reverse().map((row) => {
    const number = rows.indexOf(row) + 1;
    const item = document.createElement("span"); item.dataset.stackNumber = String(number);
    const label = document.createElement("strong"); label.textContent = String(number);
    const size = document.createElement("small"); size.textContent = `${row.querySelector<HTMLInputElement>('[data-stack-field="canHeight"]')!.value} mm`;
    item.append(label, size); return item;
  }));
  rows.forEach((row, index) => {
    const value = (field: string) => row.querySelector<HTMLInputElement>(`[data-stack-field="${field}"]`)!;
    row.querySelector("[data-stack-depth-value]")!.textContent = `${value("depth").value} mm`;
    row.querySelector(".stack-position")!.textContent = index === 0 ? "Rightmost stack in the front view" : index === rows.length - 1 ? "Leftmost stack in the front view" : `Front view: ${index + 1} from the right`;
    row.querySelector(".option-state")!.textContent = `${value("slope").value}° slope · ${value("lipGap").value} mm headroom · ${value("cascade").checked ? "auto-feed" : "separate tiers"} · ${value("cover").checked ? "covered" : "uncovered"}${value("rearLoad").checked ? " · rear loading" : ""}${value("stackable").checked ? " · joins on top" : ""}`;
  });
}

function updateStackDepthControls() {
  const shelfDepth = (form.elements.namedItem("d") as HTMLInputElement).valueAsNumber;
  const frontGap = (form.elements.namedItem("front") as HTMLInputElement).valueAsNumber;
  const fit = (form.elements.namedItem("fit") as HTMLInputElement).valueAsNumber;
  for (const row of stackRows()) {
    const depth = row.querySelector<HTMLInputElement>('[data-stack-field="depth"]')!;
    const canDiameter = row.querySelector<HTMLInputElement>('[data-stack-field="canDiameter"]')!.valueAsNumber;
    const bounds = row.querySelector<HTMLElement>("[data-stack-depth-bounds]")!;
    const validNumber = (value: number, name: string) => Number.isFinite(value) && value >= LIMITS[name].min && value <= LIMITS[name].max;
    if (!validNumber(shelfDepth, "d") || !validNumber(frontGap, "front") || !validNumber(canDiameter, "canD")) {
      depth.disabled = true;
      bounds.textContent = "Enter a valid shelf depth, front gap and can diameter to adjust depth.";
      continue;
    }
    const cascade = row.querySelector<HTMLInputElement>('[data-stack-field="cascade"]')!.checked;
    const minimum = Math.max(LIMITS.d.min, Math.ceil((minimumLaneLength({ ...DEFAULTS, canD: canDiameter, cascade, fit }) - 1e-8) * 10) / 10);
    const maximum = shelfDepth - frontGap;
    const previousDepth = depth.valueAsNumber;
    depth.min = String(minimum);
    depth.max = String(maximum);
    depth.value = String(Math.max(minimum, Math.min(maximum, previousDepth)));
    depth.disabled = maximum < minimum;
    depth.setAttribute("aria-valuetext", `${depth.value} millimetres`);
    bounds.textContent = maximum < minimum
      ? `Needs at least ${minimum} mm; only ${maximum} mm is available after the front gap.`
      : `One-can minimum ${minimum} mm · Shelf limit ${maximum} mm`;
  }
  updateStackSummaries();
}

function updateControlSummaries() {
  const value = (name: string) => (form.elements.namedItem(name) as HTMLInputElement).value;
  const checked = (name: string) => (form.elements.namedItem(name) as HTMLInputElement).checked;
  $("feedingSummary").textContent = `${checked("cascade") ? "Auto-feed alternatives" : "Separate tiers"} · ${checked("cover") ? "covered" : "uncovered"}${checked("rearLoad") ? " · rear loading" : ""} · ${value("slope")}°`;
  const pattern = form.elements.namedItem("pattern") as HTMLSelectElement;
  $("appearanceSummary").textContent = `${value("design") === "minimal" ? "Minimal filament" : "Standard"} · ${checked("solid") ? "solid walls" : pattern.selectedOptions[0]?.textContent ?? "Choose a pattern"} · ${checked("hexAuto") ? "automatic cells" : `${value("hexR")} mm cells`}`;
  (form.elements.namedItem("hexR") as HTMLInputElement).readOnly = checked("hexAuto");
  $("patternSample").dataset.pattern = checked("solid") ? "solid" : value("pattern");
  const standsOn = value("base");
  $("baseSummary").textContent = `${standsOn === "flat" ? "Flat on shelf" : standsOn === "feet" ? "24 mm feet" : "Gridfinity"}${checked("magnets") && standsOn !== "flat" ? " · magnet pockets" : ""}`;
  $("gridAlignment").hidden = buildMode.value === "mixed" || buildMode.value === "rows" || standsOn !== "gridfinity";
  (form.elements.namedItem("magnets") as HTMLInputElement).closest("label")!.hidden = standsOn === "flat";
  $("fitSummary").textContent = `${Number(value("fit")).toFixed(2)} mm added clearance`;
}

function editDesign() {
  updateControlSummaries();
  updateStackSummaries();
  updateIndependentRowSummaries();
  refit();
  queueHash();
}

function announceStackOrder(row: HTMLElement) {
  $("stackOrderStatus").textContent = `Stack moved to position ${stackRows().indexOf(row) + 1} of ${stackRows().length}.`;
}

function reorderStack(row: HTMLElement, before: Element | null, announce = true) {
  if (before === row || row.nextElementSibling === before) return;
  const focused = row.contains(document.activeElement) ? document.activeElement as HTMLElement : null;
  stackEditor.insertBefore(row, before);
  updateStackActions();
  const focusTarget = focused instanceof HTMLButtonElement && focused.disabled ? row.querySelector<HTMLButtonElement>("[data-stack-handle]") : focused;
  focusTarget?.focus({ preventScroll: true });
  editDesign();
  if (announce) announceStackOrder(row);
}

function moveStack(row: HTMLElement, direction: "earlier" | "later") {
  const neighbor = direction === "earlier" ? row.previousElementSibling : row.nextElementSibling;
  if (!neighbor) return;
  reorderStack(row, direction === "earlier" ? neighbor : neighbor.nextElementSibling);
  row.scrollIntoView({ block: "nearest" });
}

stackEditor.addEventListener("keydown", (event) => {
  if (!(event.target as Element).closest("[data-stack-handle]") || event.altKey || event.ctrlKey || event.metaKey) return;
  if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
  event.preventDefault();
  if (stackDrag) return;
  moveStack((event.target as Element).closest<HTMLElement>(".stack-card")!, event.key === "ArrowUp" ? "earlier" : "later");
});

let stackDrag: { row: HTMLElement; pointerIdentifier: number; startY: number; currentY: number; originalRows: HTMLElement[]; started: boolean; frame: number; previousFrameTime: number | null } | null = null;

function dragStackFrame(frameTime = performance.now()) {
  if (!stackDrag?.started) return;
  // Keep the existing 12 px at 60 Hz speed independent of the viewer's frame rate.
  // Cap a delayed frame so returning to a stalled tab cannot jump through the list.
  const elapsedSeconds = stackDrag.previousFrameTime === null ? 1 / 60
    : Math.min(0.1, Math.max(0, (frameTime - stackDrag.previousFrameTime) / 1000));
  stackDrag.previousFrameTime = frameTime;
  const { row, currentY } = stackDrag;
  const scrollingControls = form.scrollHeight > form.clientHeight;
  const bounds = scrollingControls ? form.getBoundingClientRect() : { top: 0, bottom: window.innerHeight };
  const top = Math.max(0, bounds.top), bottom = Math.min(window.innerHeight, bounds.bottom);
  const editorBounds = stackEditor.getBoundingClientRect();
  const distance = 720 * elapsedSeconds;
  // Scroll positions may round to whole pixels; cross the fractional stopping edge.
  const scroll = currentY < top + 48 && editorBounds.top < top + 48 ? -Math.min(distance, Math.ceil(top + 48 - editorBounds.top))
    : currentY > bottom - 48 && editorBounds.bottom > bottom - 48 ? Math.min(distance, Math.ceil(editorBounds.bottom - (bottom - 48))) : 0;
  if (scroll) {
    if (scrollingControls) form.scrollTop += scroll;
    else window.scrollBy(0, scroll);
  }
  const before = stackRows().find((candidate) => candidate !== row && currentY < candidate.getBoundingClientRect().top + candidate.offsetHeight / 2) ?? null;
  reorderStack(row, before, false);
  stackDrag.frame = requestAnimationFrame(dragStackFrame);
}

function finishStackDrag(cancelled: boolean) {
  if (!stackDrag) return;
  const { row, originalRows, pointerIdentifier, frame, started } = stackDrag;
  stackDrag = null;
  cancelAnimationFrame(frame);
  row.classList.remove("is-dragging");
  if (stackEditor.hasPointerCapture(pointerIdentifier)) stackEditor.releasePointerCapture(pointerIdentifier);
  if (!started) return;
  if (cancelled) {
    for (const originalRow of originalRows) stackEditor.append(originalRow);
    updateStackActions();
    editDesign();
    $("stackOrderStatus").textContent = "Stack move cancelled.";
  } else announceStackOrder(row);
  row.querySelector<HTMLButtonElement>("[data-stack-handle]")!.focus({ preventScroll: true });
}

stackEditor.addEventListener("pointerdown", (event) => {
  const handle = (event.target as Element).closest<HTMLButtonElement>("[data-stack-handle]");
  if (!handle || event.button !== 0 || !event.isPrimary || stackDrag) return;
  event.preventDefault();
  handle.focus({ preventScroll: true });
  stackDrag = { row: handle.closest<HTMLElement>(".stack-card")!, pointerIdentifier: event.pointerId,
    startY: event.clientY, currentY: event.clientY, originalRows: stackRows(), started: false, frame: 0, previousFrameTime: null };
  // Capture on the stable editor so moving a card cannot release the pointer.
  stackEditor.setPointerCapture(event.pointerId);
});
stackEditor.addEventListener("pointermove", (event) => {
  if (!stackDrag || stackDrag.pointerIdentifier !== event.pointerId) return;
  stackDrag.currentY = event.clientY;
  if (!stackDrag.started && Math.abs(event.clientY - stackDrag.startY) >= 5) {
    stackDrag.started = true;
    stackDrag.row.classList.add("is-dragging");
    dragStackFrame();
  }
});
stackEditor.addEventListener("pointerup", (event) => {
  if (stackDrag?.pointerIdentifier !== event.pointerId) return;
  if (stackDrag.started) {
    cancelAnimationFrame(stackDrag.frame);
    stackDrag.currentY = event.clientY;
    dragStackFrame();
  }
  finishStackDrag(false);
});
stackEditor.addEventListener("pointercancel", (event) => {
  if (stackDrag?.pointerIdentifier === event.pointerId) finishStackDrag(true);
});
stackEditor.addEventListener("lostpointercapture", () => finishStackDrag(true));
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && stackDrag) { event.preventDefault(); finishStackDrag(true); }
});
window.addEventListener("blur", () => finishStackDrag(true));

$("addStack").addEventListener("click", () => {
  if (stackRows().length >= 8) return;
  addStack(defaultStacks()[0]); editDesign();
});
stackEditor.addEventListener("click", (event) => {
  const button = (event.target as Element).closest<HTMLButtonElement>("[data-stack-action]");
  if (!button || button.disabled) return;
  const row = button.closest<HTMLElement>(".stack-card")!;
  switch (button.dataset.stackAction) {
    case "earlier": case "later": moveStack(row, button.dataset.stackAction); return;
    case "remove": row.remove(); break;
    case "duplicate": {
      const copy = row.cloneNode(true) as HTMLElement;
      const sourceFields = row.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-stack-field]");
      copy.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-stack-field]").forEach((field, index) => {
        field.value = sourceFields[index].value;
        if (field instanceof HTMLInputElement && field.type === "checkbox") field.checked = (sourceFields[index] as HTMLInputElement).checked;
      });
      row.after(copy); break;
    }
  }
  updateStackActions(); editDesign();
});
resetStacks(); resetIndependentRows(); syncMode();

/** The form as the solver takes it; throws naming a bad field. */
function readOptions(): FormValues {
  const f = new FormData(form);
  const values = optionsFrom((name) => { const v = f.get(name); return v === null ? null : String(v); });
  values.base.bedKeepOut = keepOut;
  return values;
}

form.addEventListener("input", (e) => {
  const t = e.target as HTMLInputElement | HTMLSelectElement;
  // Profile controls have their own change handlers. Only bed inputs change geometry.
  if (t.closest(".profile")) return;
  if (t.closest("#customRows")) { editIndependentRowInput(t); return; }
  const stack = t.closest<HTMLElement>(".stack-card");
  if (stack) {
    const preset = stack.querySelector<HTMLSelectElement>('[data-stack-field="preset"]')!;
    if (t.dataset.stackField === "preset" && t.value !== "custom") {
      const [diameter, height] = t.value.split(",");
      stack.querySelector<HTMLInputElement>('[data-stack-field="canDiameter"]')!.value = diameter;
      stack.querySelector<HTMLInputElement>('[data-stack-field="canHeight"]')!.value = height;
    } else if (t.dataset.stackField === "canDiameter" || t.dataset.stackField === "canHeight") {
      preset.value = "custom";
    }
  }
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
  if (t.name === "base") syncJoins();
  incomingFlagErrors.delete(t.name);
  if (t.name === "buildMode") {
    incomingDesignError = null;
    syncMode();
  }
  if (t.dataset.stackField === "tierMode" || t.dataset.stackField === "tiers") updateStackActions();
  editDesign(); // first refit resets the chosen layout, which the hash carries
});

/** On a grid the baseplate joins the lanes, so the side selects have nothing to say. */
function syncJoins() {
  const grid = (form.elements.namedItem("base") as HTMLSelectElement).value === "gridfinity";
  for (const side of ["left", "right"]) (form.elements.namedItem(side) as HTMLSelectElement).disabled = grid;
}
form.addEventListener("submit", (e) => e.preventDefault());

// ------------------------------------------------------------- layouts
/** Re-rank layouts for the form as it stands and pick `want`, or the best one when that is out of range. */
function refit(want = 0) {
  exportId++; // any new intent also retires a file already being prepared
  if (buildMode.value === "mixed") updateStackDepthControls();
  if (buildMode.value === "rows") clearIndependentRowsResolution();
  const incomingError = incomingLinkError();
  if (incomingError) { rejectDesign(incomingError); return; }
  if (buildMode.value === "rows") {
    try {
      const fields = new FormData(form);
      const { space, request } = independentRowsOptionsFrom(name => { const value = fields.get(name); return value === null ? null : String(value); }, independentRowValues());
      request.shared.bedKeepOut = keepOut;
      const layout = resolveIndependentRows(space, request);
      renderIndependentRowsResolution(layout);
      layouts = [layout];
      const box = $("layouts"); box.replaceChildren();
      const heading = document.createElement("h2"); heading.textContent = "Your custom rows";
      const details = document.createElement("p"); details.className = "hint";
      details.textContent = `${layout.rows.length} rows · ${layout.cans} cans · ${layout.footprint.map(dimension => dimension.toFixed(1)).join(" × ")} mm`;
      box.append(heading, details); choose(0);
    } catch (error) { rejectDesign(reason(error)); }
    return;
  }
  if (buildMode.value === "mixed") {
    try {
      const fields = new FormData(form);
      const { space, request } = mixedOptionsFrom((name) => { const value = fields.get(name); return value === null ? null : String(value); }, stackValues());
      request.shared.bedKeepOut = keepOut;
      const layout = resolveMixedBuild(space, request);
      layouts = [layout];
      const box = $("layouts"); box.replaceChildren();
      const heading = document.createElement("h2"); heading.textContent = "Your connected organizer";
      const details = document.createElement("p"); details.className = "hint";
      details.textContent = `${layout.stacks.length} stacks · ${layout.cans} cans · ${layout.footprint.map((dimension) => dimension.toFixed(1)).join(" × ")} mm`;
      box.append(heading, details); choose(0);
    } catch (error) { rejectDesign(reason(error)); }
    return;
  }
  let space: Space, base: Options, cascade: boolean;
  try {
    ({ space, base, cascade } = readOptions());
  } catch (err) {
    // Say which field is wrong rather than building nothing and staying quiet. Not
    // fail(): this fires on every keystroke while a number is half typed.
    rejectDesign(reason(err), "Check your numbers");
    return;
  }
  const candidates = fitSpace(space, base, { cascade });
  layouts = candidates;
  const box = $("layouts");
  box.innerHTML = "";
  if (!layouts.length) {
    const need = laneNeeds(base, space);
    const usableDepth = space.d - space.front;
    const nothing = usableDepth < 120
      ? `Nothing fits. Usable depth is ${usableDepth.toFixed(0)} mm after the front gap; lanes need at least 120 mm. Increase shelf depth or reduce the front gap.`
      : `Nothing fits. A single lane needs ${need.w.toFixed(0)} mm of width and ${need.h.toFixed(0)} mm of height. Check usable shelf depth (${usableDepth.toFixed(0)} mm), front gap and printer build volume too.`;
    box.innerHTML = `<p class="empty">${nothing}</p>`;
    setStatus(nothing);
    dropBuild();
    return;
  }
  const h = document.createElement("h2"); h.textContent = "Layouts that fit"; box.appendChild(h);
  const start = layouts[want] ? want : 0; // a hash can say layout=-1 or 1.5; both fall back to the best
  candidates.forEach((l, i) => {
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

function rejectDesign(message: string, prefix = "Check your design") {
  setStatus(`${prefix}: ${message}`);
  $("layouts").replaceChildren();
  dropBuild();
}

function choose(i: number) {
  $("viewerMessage").hidden = true;
  chosen = layouts[i];
  const hasSharedWalls = isMixedLayout(chosen) && chosen.boundaries?.some((boundary) => boundary.kind === "shared") === true;
  $("sharedWallAssembly").hidden = !hasSharedWalls;
  $("mixedAssembly").hidden = !isMixedLayout(chosen) || hasSharedWalls;
  $("rowsAssembly").hidden = !isIndependentRowsLayout(chosen);
  if (isIndependentRowsLayout(chosen)) {
    $("rowsAssembly").querySelector<HTMLElement>('[data-row-assembly="connections"]')!.hidden = !chosen.rows.some(row => row.layout.connections.length > 0);
    $("rowsAssembly").querySelector<HTMLElement>('[data-row-assembly="shared"]')!.hidden = !chosen.rows.some(row => row.layout.boundaries?.some(boundary => boundary.kind === "shared"));
    const hasTransitions = chosen.transitions.length > 0;
    $("rowsAssembly").querySelectorAll<HTMLElement>('[data-row-assembly="transitions"]').forEach(step => { step.hidden = !hasTransitions; });
  }
  chosenIndex = i;
  // Retire the in-flight build here, not when the debounce fires. chosen has already
  // moved on, so a result still carrying the old id would be welded to the new layout:
  // new capacity over old geometry, and the downloads unlocked on top of it.
  buildId++;
  exportId++;
  clearTimeout(buildTimer);
  pendingBuild = null;
  pendingEstimate = null;
  setBuildPending(true);
  buildTimer = window.setTimeout(build, 250);
}

/** The form no longer describes what was built: take the old result off the page so the
 *  downloads cannot hand out geometry for numbers that are gone. */
function dropBuild() {
  buildId++;
  exportId++;
  clearTimeout(buildTimer);
  pendingBuild = null;
  buildPending = false;
  pendingEstimate = null;
  chosen = null; chosenIndex = 0; built = null;
  $("sharedWallAssembly").hidden = true;
  $("mixedAssembly").hidden = buildMode.value !== "mixed";
  $("rowsAssembly").hidden = buildMode.value !== "rows";
  $("rowsAssembly").querySelectorAll<HTMLElement>("[data-row-assembly]").forEach(step => { step.hidden = true; });
  for (const id of ["dl3mf", "dlstl"]) $<HTMLButtonElement>(id).disabled = true; // nothing to export
  $("results").hidden = true;
  $("printRecovery").hidden = false;
  $("tabs").innerHTML = "";
  $("assemblyParts").replaceChildren();
  $("partIdentifier").textContent = "No part selected";
  $("viewer").removeAttribute("aria-labelledby");
  $("viewer").setAttribute("aria-label", "Organizer preview");
  for (const id of ["showCans", "explode", "showGrid", "showBed"]) $(id).hidden = true;
  viewer.reset();
  $("viewerMessage").textContent = $("status").textContent;
  $("viewerMessage").hidden = false;
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
  const settings = estimateSettings(profile?.config, index ?? undefined);
  const req: Req = isIndependentRowsLayout(chosen)
    ? { type: "build-rows", id, layout: chosen, keepOut, estimateSettings: settings }
    : isMixedLayout(chosen)
    ? { type: "build-mixed", id, layout: chosen, keepOut, estimateSettings: settings }
    : { type: "build", id, options: chosen.options, keepOut, estimateSettings: settings };
  pendingBuild = req;
  sendPendingBuild();
}

/** A busy worker keeps one request on the page, replaced by each debounced edit. */
function sendPendingBuild() {
  if (inFlightBuildIdentifier !== null || !pendingBuild) return;
  const request = pendingBuild;
  pendingBuild = null;
  inFlightBuildIdentifier = request.id;
  worker.postMessage(request);
}

/** The geometry worker with the page's handlers on it: at load, and again after a kernel abort. */
function startWorker(): Worker {
  const started = new Worker(new URL("worker.js", document.baseURI), { type: "module" });
  started.onmessage = onWorkerMessage;
  started.onerror = onWorkerError;
  started.onmessageerror = (e) => fail("The geometry engine sent something unreadable - reload the page.", e);
  return started;
}

/** A kernel abort leaves the worker's module unusable, and the build queued behind the
 *  one that aborted died with it. Start a fresh worker and send the build on screen again,
 *  once: a layout that aborts the kernel every time gets an error, not a loop. `last`,
 *  the export source, dies too; the rebuild restores it and the downloads wait for it. */
function restartWorker(r: Extract<Res, { type: "error" }>) {
  worker.terminate();
  inFlightEstimate = null; pendingEstimate = null;
  inFlightBuildIdentifier = null;
  pendingBuild = null;
  clearTimeout(buildTimer);
  worker = startWorker();
  console.warn(`the geometry kernel aborted on ${r.of} #${r.id} (${r.message}); started a fresh worker`);
  if (!chosen) return;
  if (restartedFor === buildId) {
    setBuildPending(false); dropBuild();
    fail(`The geometry engine crashed twice building this layout: ${r.message}`);
    return;
  }
  restartedFor = buildId;
  build();
}

function onWorkerMessage(e: MessageEvent<Res>) {
  const r = e.data;
  if (r.type === "built" || (r.type === "error" && (r.of === "build" || r.of === "build-mixed" || r.of === "build-rows"))) {
    if (r.id === inFlightBuildIdentifier) inFlightBuildIdentifier = null;
    if (!(r.type === "error" && r.fatal)) sendPendingBuild();
  }
  if (r.type === "estimated") {
    if (r.id === inFlightEstimate) inFlightEstimate = null;
    sendPendingEstimate();
    if (r.id !== estimateIdentifier || r.buildId !== buildId || !built || buildPending) return;
    estimatedGrams = r.grams;
    renderResults();
    return;
  }
  if (r.type === "error") {
    if (r.of === "export" && (r.id !== exportId || r.buildId !== buildId || !built || buildPending) && !r.fatal) {
      console.warn(`superseded export #${r.id} failed: ${r.message}`); return;
    }
    if (r.of === "estimate") {
      if (r.id === inFlightEstimate) inFlightEstimate = null;
      if (!r.fatal) sendPendingEstimate();
      if (r.id !== estimateIdentifier && !r.fatal) return;
    }
    if (r.fatal) { restartWorker(r); return; }
    // A superseded build's error is about numbers no longer on screen: it would overwrite
    // "Building parts…" or the build that replaced it with news about neither.
    if ((r.of === "build" || r.of === "build-mixed" || r.of === "build-rows") && r.id !== buildId) { console.warn(`superseded build #${r.id} failed: ${r.message}`); return; }
    // The build on screen failed, so take it off: leaving it up re-enables the downloads
    // over the previous build's geometry, under an error about this one. An export's
    // error leaves the build alone.
    if (r.of === "build" || r.of === "build-mixed" || r.of === "build-rows") { setBuildPending(false); dropBuild(); }
    fail(`Something went wrong: ${r.message}`);
    return;
  }
  if (r.type === "file") {
    // A second download click supersedes the first, and the worker is serial: the first
    // still finishes and arrives here. Dropping it silently means the user asked for a
    // 3MF, waited, and never got one or a word about it.
    if (r.id === exportId && r.buildId === buildId && built && !buildPending) { download(r.name, r.bytes); setStatus("Download ready."); }
    else {
      console.info(`dropped a superseded ${r.name} export (#${r.id}, now on #${exportId})`);
    }
    return;
  }
  if (r.id !== buildId || !chosen) return; // a newer build is already on its way
  setBuildPending(false);
  built = { parts: r.parts, plan: r.plan, nplates: r.nplates, layout: chosen };
  viewer.reset();
  refreshEstimates(r.estimateKey);
  renderTabs(); renderResults();
  showTab("assembly");
  setStatus(`${built.layout.cans} cans · ${r.nplates} plates · ~${(totalGrams(r.parts) / 1000).toFixed(2)} kg · built in ${(r.ms / 1000).toFixed(1)} s`);
}

// The worker script failing to load or parse. Nothing will ever be built, so every later
// build() shows this instead of "Building parts…". preventDefault keeps the browser from
// re-raising it on window, where the generic handler would overwrite the message.
function onWorkerError(e: ErrorEvent) {
  e.preventDefault();
  clearTimeout(buildTimer);
  pendingBuild = null;
  inFlightBuildIdentifier = null;
  inFlightEstimate = null; pendingEstimate = null;
  workerDead = `The geometry engine failed to start (${e.message || "no detail"}) - reload the page.`;
  fail(workerDead, e);
}

// ------------------------------------------------------------- stage
function partLabel(name: string) {
  return name.replace(/^row-(\d+)-stack-(\d+)-/, "Level $1 · Lane $2 · ").replace(/^row-(\d+)-/, "Level $1 · ").replace(/^transition-(\d+)-/, "Transition $1 · ").replace(/^stack-(\d+)-/, "Stack $1 · ").replace(/-/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function filterParts() {
  const query = $<HTMLInputElement>("partSearch").value.trim().toLowerCase();
  const buttons = [...$("tabs").querySelectorAll<HTMLButtonElement>("button")];
  for (const button of buttons) button.hidden = button.dataset.key !== "assembly" && !`${button.textContent} ${button.dataset.key}`.toLowerCase().includes(query);
  const selected = buttons.find((button) => button.getAttribute("aria-selected") === "true" && !button.hidden);
  const tabStop = selected ?? buttons[0];
  for (const button of buttons) button.tabIndex = button === tabStop ? 0 : -1;
}
$("partSearch").addEventListener("input", filterParts);
$("tabs").addEventListener("keydown", (event) => {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key) || event.altKey || event.ctrlKey || event.metaKey) return;
  const buttons = [...$("tabs").querySelectorAll<HTMLButtonElement>("button")].filter((button) => !button.hidden && !button.disabled);
  const current = buttons.indexOf(event.target as HTMLButtonElement);
  if (current < 0) return;
  event.preventDefault();
  const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (current + (event.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length;
  buttons[next].click(); buttons[next].focus(); buttons[next].scrollIntoView({ block: "nearest", inline: "nearest" });
});

function renderTabs() {
  const tabs = $("tabs"); tabs.replaceChildren();
  $<HTMLInputElement>("partSearch").value = "";
  const add = (key: string, label: string) => {
    const button = document.createElement("button"); button.type = "button"; button.textContent = label; button.dataset.key = key;
    button.id = `previewTab-${tabs.children.length}`; button.setAttribute("role", "tab"); button.setAttribute("aria-controls", "viewer");
    button.addEventListener("click", () => showTab(key)); tabs.appendChild(button);
  };
  add("assembly", "Assembly");
  for (const part of built!.parts) add(`part:${part.name}`, partLabel(part.name));
  const inspection = $("assemblyParts"); inspection.replaceChildren();
  for (const kind of ["deck", "wall", "cover", "key", "spline"]) {
    const part = built!.parts.find((candidate) => candidate.name.includes(kind));
    if (!part) continue;
    const button = document.createElement("button"); button.type = "button"; button.textContent = `Inspect ${kind === "spline" ? "stack joining key" : kind}`;
    button.addEventListener("click", () => {
      $<HTMLInputElement>("partSearch").value = ""; filterParts(); showTab(`part:${part.name}`);
      $("previewHeading").scrollIntoView({ block: "start" }); $("previewHeading").focus({ preventScroll: true });
    }); inspection.append(button);
  }
}

function showTab(key: string) {
  if (!built) throw new Error("showTab before a build: dropBuild clears the tabs, so nothing can call it then");
  const tab = $("tabs").querySelector<HTMLButtonElement>(`button[data-key="${CSS.escape(key)}"]`);
  $("tabs").querySelectorAll("button").forEach((button) => button.setAttribute("aria-selected", String(button.dataset.key === key)));
  filterParts();
  if (tab) { $("viewer").setAttribute("aria-labelledby", tab.id); }
  else { $("viewer").removeAttribute("aria-labelledby"); $("viewer").setAttribute("aria-label", `Print plate ${Number(key.slice(6)) + 1}`); }
  $("partIdentifier").textContent = key.startsWith("part:") ? key.slice(5) : key === "assembly" ? "Assembly" : `Plate ${Number(key.slice(6)) + 1}`;
  $("plates").querySelectorAll(".plate").forEach((b) => b.setAttribute("aria-pressed", String(b.getAttribute("data-key") === key)));
  const { layout, parts, plan } = built;
  const bed = isMixedLayout(layout) || isIndependentRowsLayout(layout) ? layout.request.shared.bed : layout.options.bed;
  $("showCans").hidden = $("explode").hidden = key !== "assembly";
  // the plate view is the bed, so its toggles make no sense there
  $("showGrid").hidden = $("showBed").hidden = key.startsWith("plate:");
  if (key === "assembly") {
    if (isIndependentRowsLayout(layout)) viewer.showIndependentRowsAssembly(parts, layout);
    else if (isMixedLayout(layout)) viewer.showMixedAssembly(parts, layout);
    else viewer.showAssembly(parts, layout.options, layout.derived);
  }
  else if (key.startsWith("part:")) { const p = parts.find((x) => x.name === key.slice(5)); if (p) viewer.showPart(p, bed); }
  else if (key.startsWith("plate:")) { const n = Number(key.slice(6)); viewer.showPlate({ geometries: plan.geometries, placements: plan.placements.filter((p) => p.plate === n) }, bed); }
}

let estimateIdentifier = 0;
let estimatedGrams: Record<string, number> | null = null;
let inFlightEstimate: number | null = null;
let pendingEstimate: Extract<Req, {type:"estimate"}> | null = null;
function sendPendingEstimate() {
  if (inFlightEstimate !== null || !pendingEstimate || buildPending) return;
  const request = pendingEstimate; pendingEstimate = null;
  inFlightEstimate = request.id; worker.postMessage(request);
}
let estimateLabel = "reference settings: 3 walls, 6% infill, 1 mm skins, density 1.27 g/cm³";
function refreshEstimates(completedKey?: string) {
  estimatedGrams = null;
  pendingEstimate = null;
  estimateIdentifier++;
  if (!built || buildPending) return;
  const settings = estimateSettings(profile?.config, index ?? undefined);
  estimateLabel = (settings.infill === 1 ? "solid; " : "") + (settings.assumptions.length
    ? `approximate; assumed ${settings.assumptions.join(", ")}`
    : "approximate from selected print settings; excludes supports, adhesion and purge");
  if (completedKey === JSON.stringify(settings)) {
    estimatedGrams = Object.fromEntries(built.parts.map((part) => [part.name, part.grams]));
    return;
  }
  pendingEstimate = { type: "estimate", id: estimateIdentifier, buildId, settings };
  sendPendingEstimate();
}
const partGrams = (part: PartOut) => estimatedGrams?.[part.name] ?? part.grams;
const totalGrams = (parts: PartOut[]) => parts.reduce((sum, part) => sum + partGrams(part) * part.qty, 0);

function renderResults() {
  const { parts, plan, nplates, layout } = built!;
  const printActions = $("printActions");
  const focusedAction = printActions.contains(document.activeElement) ? document.activeElement as HTMLElement : null;
  const estimateWasOpen = $<HTMLDetailsElement>("estimateDetails")?.open ?? false;
  const stackDetailsWereOpen = $<HTMLDetailsElement>("stackDetails")?.open ?? false;
  const dimensionsWereOpen = $<HTMLDetailsElement>("dimensionDetails")?.open ?? false;
  // Retain the actual action nodes and their export listeners across result refreshes.
  printActions.remove();
  const g = (n: number) => `${n.toFixed(0)} g`;
  if (isIndependentRowsLayout(layout)) renderIndependentRowsSummary(layout, parts, nplates);
  else if (isMixedLayout(layout)) renderMixedSummary(layout, parts, nplates);
  else {
  const d = layout.derived, o = layout.options;
  const grams = totalGrams(parts);
  const preview = previewCounts(o, d);
  $("summary").innerHTML = `<h2>What you get</h2><dl>
    <dt>Capacity</dt><dd>${layout.cans} cans</dd>
    <dt>Footprint</dt><dd>${layout.footprint.map((v) => v.toFixed(0)).join(" × ")} mm</dd>
    <dt>Lane</dt><dd>${d.L.toFixed(0)} × ${d.OW.toFixed(0)} × ${d.H} mm${d.split ? `, ${d.seams.length + 1} keyed sections` : ""}</dd>
    ${o.base === "gridfinity" ? `<dt>Base</dt><dd>Gridfinity feet, ${d.floorCells[0]} × ${d.floorCells[1]} cells per lane, lane ${o.along === "centre" && o.across === "centre" ? "centred" : `at the ${[o.along, o.across].filter((p) => p !== "centre").join(" ")}`}${d.foot[3] - d.foot[1] > d.floor[3] - d.floor[1] + 0.01 ? `; ${((d.OW - (d.floor[3] - d.floor[1])) / 2).toFixed(1)} mm skirt a side past the baseplate` : ""}${o.magnets ? "; 6 × 2 mm magnet pockets" : ""}</dd>` : ""}
    <dt>Deck slope</dt><dd>${o.slope}° — ${o.slope >= 3 ? "intended to help cans roll forward; test printed friction" : o.slope > 0 ? "shallow, cans may need a nudge" : "flat, cans stay where you put them"}</dd>
    <dt>Grab from</dt><dd>the front, over a ${K.lipH} mm lip on ${layout.style === "cascade" ? "the bottom tier" : "every tier"}; ${(d.Hb - K.deckLo - K.lipH - K.lipInset * d.tan - o.canD).toFixed(0)} mm over the can as it clears the lip</dd>
    <dt>Load from</dt><dd>${layout.style === "cascade" ? `the top${o.cover ? ", through the cover window" : ""} at the ${o.tiers % 2 === 0 ? "front" : "back (odd tier count)"}` : "the front of each tier"}${rearTier(o) >= 0 ? `, or the back of ${o.tiers > 1 ? "the top tier" : "the lane"}` : ""}</dd>
    <dt>Filament</dt><dd>~${(grams / 1000).toFixed(2)} kg (${estimatedGrams ? "estimated" : "recalculating for print settings"})</dd>
    <dt>Plates</dt><dd>${nplates} on a ${o.bed[0]} × ${o.bed[1]} bed</dd></dl>
    ${preview.sampled ? `<p class="muted">Preview shows ${Math.ceil(preview.cans / preview.stride)} of ${preview.cans} cans; capacity and export quantities include every part.</p>` : ""}
    ${layout.warnings.length ? `<p class="warn">${layout.warnings.join("<br>")}</p>` : ""}`;
  }
  const summary = $("summary");
  const primary = summary.querySelector("dl")!;
  // Keep four useful quantities above downloads; retain the full dimensional detail below.
  const primaryTerms = new Set(["Capacity", "Footprint", "Filament", "Plates"]);
  const supporting = document.createElement("dl");
  for (const term of [...primary.querySelectorAll("dt")]) if (!primaryTerms.has(term.textContent!)) {
    const description = term.nextElementSibling!; supporting.append(term, description);
  }
  primary.after(printActions);
  const settingsReminder = document.createElement("p"); settingsReminder.className = "hint print-settings-reminder";
  settingsReminder.textContent = profile ? `Print settings: ${profile.name}` : "Using reference material assumptions. Choose print settings in Setup before downloading.";
  printActions.append(settingsReminder);
  // The reminder is the only regenerated child of the persistent action block.
  for (const reminder of [...printActions.querySelectorAll(".print-settings-reminder")].slice(0, -1)) reminder.remove();
  const estimate = document.createElement("details"); estimate.id = "estimateDetails"; estimate.className = "result-details"; estimate.open = estimateWasOpen;
  const estimateHeading = document.createElement("summary"); estimateHeading.textContent = "Material estimate and assumptions";
  const settings = estimateSettings(profile?.config, index ?? undefined);
  const readable = document.createElement("p");
  readable.textContent = `${Math.round(settings.infill * 100)}% infill · ${settings.shell.toFixed(2)} mm walls · ${settings.topSkin.toFixed(2)} / ${settings.bottomSkin.toFixed(2)} mm top / bottom skins · ${settings.density.toFixed(2)} g/cm³ material density. Approximate; excludes supports, adhesion and purge.`;
  const technical = document.createElement("p"); technical.className = "technical-settings"; technical.textContent = estimatedGrams ? estimateLabel : "Recalculating for print settings";
  estimate.append(estimateHeading, readable, technical); printActions.after(estimate);
  if (supporting.children.length) {
    const detail = document.createElement("details"); detail.id = "dimensionDetails"; detail.className = "result-details"; detail.open = dimensionsWereOpen;
    const heading = document.createElement("summary"); heading.textContent = "Dimensions and loading"; detail.append(heading, supporting); estimate.after(detail);
  }
  const stackSections = [...summary.querySelectorAll(".stack-summary")];
  if (stackSections.length) {
    const detail = document.createElement("details"); detail.id = "stackDetails"; detail.className = "result-details"; detail.open = stackDetailsWereOpen;
    const heading = document.createElement("summary"); heading.textContent = "Details for each stack"; detail.append(heading, ...stackSections); estimate.after(detail);
  }
  const pl = $("plates"); pl.innerHTML = "<h2>Print plates</h2>";
  const byPlate = new Map<number, PackedPlacement[]>();
  for (const p of plan.placements) { if (!byPlate.has(p.plate)) byPlate.set(p.plate, []); byPlate.get(p.plate)!.push(p); }
  const gramsOf = (part: string) => { const p = parts.find((p) => p.name === part); return p ? partGrams(p) : 0; };
  for (const [n, items] of [...byPlate.entries()].sort((a, b) => a[0] - b[0])) {
    const b = document.createElement("button"); b.type = "button"; b.className = "plate"; b.setAttribute("data-key", `plate:${n}`);
    const summary = plateSummary(items.map((item) => ({ ...item, part: partLabel(item.part) })));
    b.innerHTML = `<span class="n">${n + 1}</span><span>${summary}</span><span class="g">${g(items.reduce((a, i) => a + gramsOf(i.part), 0))}</span>`;
    b.addEventListener("click", () => showTab(`plate:${n}`));
    pl.appendChild(b);
  }
  $("results").hidden = false;
  $("printRecovery").hidden = true;
  focusedAction?.focus({ preventScroll: true });
}

function renderMixedSummary(layout: MixedLayout, parts: PartOut[], plates: number) {
  const preview = mixedPreviewCounts(layout), shared = layout.request.shared;
  const materialEstimate = !estimatedGrams ? "recalculating for print settings"
    : estimateSettings(profile?.config, index ?? undefined).assumptions.length ? "approximate; reference assumptions"
    : "approximate from print settings";
  const summary = $("summary"); summary.replaceChildren();
  const heading = document.createElement("h2"); heading.textContent = "What you get"; summary.append(heading);
  const details = (parent: HTMLElement, entries: [string, string][]) => {
    const list = document.createElement("dl");
    for (const [label, value] of entries) {
      const term = document.createElement("dt"); term.textContent = label;
      const description = document.createElement("dd"); description.textContent = value;
      list.append(term, description);
    }
    parent.append(list);
  };
  details(summary, [["Capacity", `${layout.cans} cans in ${layout.stacks.length} stacks`],
    ["Footprint", `${layout.footprint.map((dimension) => dimension.toFixed(1)).join(" × ")} mm`],
    ["Filament", `~${(totalGrams(parts) / 1000).toFixed(2)} kg (${estimatedGrams ? "estimated" : materialEstimate})`],
    ["Plates", `${plates} on a ${shared.bed[0]} × ${shared.bed[1]} mm bed`]]);
  if (layout.request.shareCompatibleWalls) {
    const boundaries = layout.boundaries;
    if (!boundaries) throw new Error("Wall sharing is missing its resolved boundary plan");
    const sharedCount = boundaries.filter((boundary) => boundary.kind === "shared").length;
    const result = document.createElement("section"); result.id = "wallSharingResult"; result.className = "wall-sharing-result";
    const description = document.createElement("p");
    description.textContent = `${sharedCount} of ${boundaries.length} adjacent boundaries share a wall · ${(sharedCount * (shared.wall + K.gangGap)).toFixed(1)} mm width saved.${sharedCount === 0 ? " No compatible boundaries; both walls are retained at every boundary." : ""}`;
    result.append(description);
    const retained = document.createElement("ul");
    for (const boundary of boundaries) if (boundary.kind === "retained") {
      const item = document.createElement("li");
      item.textContent = `Stacks ${boundary.firstStackIndex + 1} and ${boundary.secondStackIndex + 1} keep both walls: ${boundary.reason}`;
      retained.append(item);
    }
    if (retained.children.length) result.append(retained);
    summary.append(result);
  }
  for (const [index, stack] of layout.stacks.entries()) {
    const options = stack.options;
    const section = document.createElement("section"); section.className = "stack-summary";
    const title = document.createElement("h3"); title.textContent = `Stack ${index + 1}`; section.append(title);
    const loading = options.cascade
      ? `the top at the ${options.tiers % 2 === 0 ? "front" : "back"}${options.cover ? ", through the cover window" : ""}`
      : "the front of each tier";
    details(section, [["Can", `${options.canD} mm diameter × ${options.canL} mm height`],
      ["Depth", `${stack.derived.L} mm`], ["Tiers", `${options.tiers}${layout.request.stacks[index].tiers === "auto" ? " (automatic)" : " (fixed)"}`],
      ["Capacity", `${stack.cans} cans`],
      ["Deck slope", `${options.slope}°`], ["Lip headroom", `${options.lipGap} mm`],
      ["Auto-feed", options.cascade ? "between tiers" : "off; load each tier separately"],
      ["Cover", options.cover ? "on the top tier" : "none"], ["Join on top", options.stackable ? "another tier" : "nothing"],
      ["Grab from", `the front of ${options.cascade ? "the bottom tier" : "each tier"}`],
      ["Load from", `${loading}${rearTier(options) >= 0 ? ", or the back of the top tier" : ""}`]]);
    summary.append(section);
  }
  if (preview.sampled) {
    const note = document.createElement("p"); note.className = "hint";
    note.textContent = `Preview samples the assembly; capacity and export quantities include every part and all ${preview.cans} cans.`; summary.append(note);
  }
  for (const warning of layout.warnings) { const note = document.createElement("p"); note.className = "warn"; note.textContent = warning; summary.append(note); }
}

function clearIndependentRowsResolution() {
  for (const row of customRowCards()) {
    row.querySelector("[data-row-resolution]")!.textContent = "";
    for (const lane of customLaneCards(row)) lane.querySelector("[data-lane-resolution]")!.textContent = "";
  }
}
function independentRowGaps(row: IndependentRowsLayout["rows"][number]): string {
  return row.gaps.map((gap, index) => row.layout.boundaries?.[index]?.kind === "shared" ? "shared wall" : `${gap.toFixed(1)} mm`).join(" / ") || "one lane; no internal gap";
}
function renderIndependentRowsResolution(layout: IndependentRowsLayout) {
  const cards = customRowCards();
  for (const row of layout.rows) {
    if (row.repeatIndex !== 0) continue;
    const card = cards[row.requestIndex];
    if (!card) throw new Error(`Resolved Row ${row.requestIndex + 1} has no editor card`);
    card.querySelector("[data-row-resolution]")!.textContent = `Resolved height ${row.height.toFixed(1)} mm · span ${row.span.toFixed(1)} mm · ${independentRowGaps(row)}`;
    const lanes = customLaneCards(card).reverse();
    for (const lane of row.lanes) lanes[lane.index].querySelector("[data-lane-resolution]")!.textContent = `Natural height ${lane.naturalHeight.toFixed(1)} mm · added headroom ${lane.heightPadding.toFixed(1)} mm · ${lane.cans} cans`;
  }
}
function renderIndependentRowsSummary(layout: IndependentRowsLayout, parts: PartOut[], plates: number) {
  const summary = $("summary"); summary.replaceChildren();
  const heading = document.createElement("h2"); heading.textContent = "What you get"; summary.append(heading);
  const details = (parent: HTMLElement, entries: [string, string][]) => {
    const list = document.createElement("dl");
    for (const [label, value] of entries) {
      const term = document.createElement("dt"); term.textContent = label;
      const description = document.createElement("dd"); description.textContent = value; list.append(term, description);
    }
    parent.append(list);
  };
  details(summary, [["Capacity", `${layout.cans} cans in ${layout.rows.length} row${layout.rows.length === 1 ? "" : "s"}`],
    ["Footprint", `${layout.footprint.map(dimension => dimension.toFixed(1)).join(" × ")} mm`],
    ["Filament", `~${(totalGrams(parts) / 1000).toFixed(2)} kg (${estimatedGrams ? "estimated" : "recalculating for print settings"})`],
    ["Plates", `${plates} on a ${layout.request.shared.bed[0]} × ${layout.request.shared.bed[1]} mm bed`]]);
  const transition = document.createElement("p"); transition.className = "hint";
  const heights = layout.transitions.map((item, index) => `Transition ${index + 1}: ${item.carrierThickness.toFixed(1)} mm carrier + ${item.shoeHeight.toFixed(1)} mm shoes`).join("; ");
  transition.textContent = `${layout.transitions.length} carrier transition${layout.transitions.length === 1 ? "" : "s"}${heights ? ` · ${heights}` : ""}. Every support is included in the footprint, filament estimate and downloads. Top cover ${layout.request.topCover ? "on" : "off"}.`;
  summary.append(transition);
  for (const row of layout.rows.slice().reverse()) {
    const section = document.createElement("section"); section.className = "custom-row-result"; section.dataset.resolvedRow = String(row.index);
    const title = document.createElement("h3");
    title.textContent = `Level ${row.index + 1} · Row ${row.requestIndex + 1}${row.request.repeat > 1 ? `, copy ${row.repeatIndex + 1} of ${row.request.repeat}` : ""}`;
    section.append(title);
    details(section, [["Height", `${row.height.toFixed(1)} mm (${row.request.rowHeight === "auto" ? "automatic" : "exact"}; minimum ${row.minimumHeight.toFixed(1)} mm)`],
      ["Span", `${row.span.toFixed(1)} mm (${row.request.rowSpan === "auto" ? "compact" : "exact"})`],
      ["Gaps between lanes", independentRowGaps(row)], ["Alignment", row.request.alignment], ["Loading", row.request.rearLoad ? "from the back" : "from the front of this row"]]);
    for (const lane of row.lanes.slice().reverse()) {
      const title = document.createElement("h4"); title.textContent = `Lane ${lane.index + 1}`; section.append(title);
      details(section, [["Can", `${lane.options.canD} mm diameter × ${lane.options.canL} mm height`],
        ["Depth", `${lane.derived.L} mm`], ["Capacity", `${lane.cans} cans`],
        ["Headroom added to fit row", `${lane.heightPadding.toFixed(1)} mm`], ["Deck slope", `${lane.options.slope}°`], ["Lip headroom", `${lane.options.lipGap} mm`]]);
    }
    if (layout.request.shareCompatibleWalls) {
      const boundaries = row.layout.boundaries;
      if (!boundaries) throw new Error(`Row ${row.requestIndex + 1} is missing its wall-sharing plan`);
      const sharing = document.createElement("p");
      const count = boundaries.filter(boundary => boundary.kind === "shared").length;
      sharing.textContent = `${count} of ${boundaries.length} adjacent boundaries share a wall${count === 0 ? "; no eligible shared boundary in this row" : ""}.`;
      section.append(sharing);
      const reasons = document.createElement("ul");
      for (const boundary of boundaries) if (boundary.kind === "retained") {
        const item = document.createElement("li"); item.textContent = `Lanes ${boundary.firstStackIndex + 1} and ${boundary.secondStackIndex + 1} keep both walls: ${boundary.reason}`; reasons.append(item);
      }
      if (reasons.children.length) section.append(reasons);
    }
    summary.append(section);
  }
  const preview = independentRowsPreviewCounts(layout);
  if (preview.sampled) {
    const note = document.createElement("p"); note.className = "hint";
    note.textContent = `Preview samples the assembly; capacity and export quantities include every row, support and all ${preview.cans} cans.`; summary.append(note);
  }
  for (const warning of layout.warnings) {
    const note = document.createElement("p"); note.className = "warn"; note.textContent = warning; summary.append(note);
  }
}

// ------------------------------------------------------------- downloads
function download(name: string, bytes: Uint8Array) {
  const url = URL.createObjectURL(new Blob([bytes as unknown as BlobPart], { type: "application/octet-stream" }));
  const a = document.createElement("a"); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
$("dl3mf").addEventListener("click", () => { if (!built || buildPending) return; setStatus("Packing 3MF…", true); worker.postMessage({ type: "export", id: ++exportId, buildId, format: "3mf", profile: profile?.config } satisfies Req); });
$("dlstl").addEventListener("click", () => { if (!built || buildPending) return; setStatus("Packing STL zip…", true); worker.postMessage({ type: "export", id: ++exportId, buildId, format: "stl" } satisfies Req); });

// ------------------------------------------------------------- slicer profile
// Kept out of the hash on purpose: it is tens of KB, and the hash is the shareable part.
let profile: StoredProfile | null = null;
let profileNote = "";
/** The loaded printer's keep-out area, which the packer has to leave clear. */
let keepOut: [number, number, number, number][] = [];

// textContent, not innerHTML: the file name is whatever the user named the file.
function showProfile() {
  exportId++; // profile bytes already captured by an older export are obsolete too
  // The plates are packed round the printer's keep-out, so a new one repacks them. A
  // profile that cannot say where it is packs as if there were none, and says why.
  let next: typeof keepOut = [], picks: Picks | null = null, note = "";
  if (profile) {
    try { next = keepOutFromConfig(profile.config); } catch (err) {
      console.warn("ignoring the profile's keep-out area", err);
      note = ` Its keep-out area is unreadable (${reason(err)}), so plates are packed as if it had none.`;
    }
    // a profile stored before imports were checked can still be one no parser reads
    try { picks = index && picksFromConfig(index, profile.config); } catch (err) { console.warn("the profile names no presets we can read", err); }
  }
  const changed = JSON.stringify(next) !== JSON.stringify(keepOut);
  keepOut = next;
  if (changed) refit(chosenIndex); // seam counts and layout validity depend on the exclusion too
  $("profileNow").textContent = profile
    ? `Using settings from ${profile.name}.${note}${profileNote}`
    // Bambu Studio 2.8 calls a project with no settings "invalid config" and pops a
    // dialog, but still loads every plate and part. Say so, or the dialog reads as failure.
    : `No print settings loaded. Bambu Studio will warn about an invalid config and fall back to the slicer's own defaults; plates and parts still load.${profileNote}`;
  $("profileClear").hidden = !profile;
  if (index) showPicks(picks);
  refreshEstimates();
  if (built && !buildPending) renderResults();
}
$("profileClear").addEventListener("click", () => { profile = null; profileNote = ""; clearStoredProfile(); showProfile(); });

/** State and label move together, so the two can never disagree. */
function adoptProfile(loaded: StoredProfile, persist = true) {
  profile = loaded;
  profileNote = "";
  showProfile();
  if (!persist) return; // applied from a link: this session only, the stored profile stands
  const failure = saveStoredProfile(loaded);
  const message = failure
    ? `Using ${loaded.name} for this session; couldn't save it for next time: ${failure}`
    : `Print settings loaded from ${loaded.name}.`;
  // A profile can change during an invalid design, build or worker failure.
  // Keep that actionable status; the profile line already confirms adoption.
  if (chosen && !buildPending && !workerDead) setStatus(message);
  else if (failure) $("profileNow").textContent += ` ${message}`;
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
  const settingLabel = select.closest<HTMLElement>(".profile-setting");
  if (settingLabel) settingLabel.hidden = !options.length;
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
  const machine = index!.machines.find((candidate) => candidate.name === picks.machine);
  const turnedOffTranslucent = !!picks.translucent && machine?.nozzle === "0.2";
  const acceptedPicks = turnedOffTranslucent ? { ...picks, translucent: false } : { ...picks };
  const config = composeProfile(index!, acceptedPicks);
  adoptProfile({ name: describePicks(index!, acceptedPicks), config }, persist);
  hashPicks = null;
  if (turnedOffTranslucent) {
    profileNote = " Translucent mode was turned off because it is unavailable for a 0.2 mm nozzle.";
    showProfile();
  }
  // The printer picked is the bed the parts must fit, so the form follows.
  followBed(bedFromConfig(config));
  if (built && !buildPending) renderResults();
}

/** Put a profile's bed in the form, refit if it moved, and put it in the link. refit(chosenIndex),
 *  not refit(): the default resets the choice to 0, and a shared link carrying both a layout
 *  and a printer had its layout dropped when the catalogue landed. */
function followBed(bed: [number, number, number]) {
  let changed = false;
  (["bedX", "bedY", "bedZ"] as const).forEach((name, axis) => {
    const input = form.elements.namedItem(name) as HTMLInputElement;
    if (Number(input.value) === bed[axis]) return;
    input.value = String(bed[axis]); changed = true;
  });
  if (changed) refit(chosenIndex);
  queueHash(); // the picks or the bed are in the link now
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

function applyHashProfile() {
  try {
    if (hashPicks) applyPicks(hashPicks, false);
    else showProfile();
  } catch (err) {
    console.warn("rejected the link's print settings", err);
    hashPicks = null;
    const rejectedSettingsMessage = `That link's print settings are unavailable or incompatible, so your own are in use: ${reason(err)}`;
    profileNote = ` ${rejectedSettingsMessage}`;
    showProfile();
    setStatus(rejectedSettingsMessage);
    queueHash();
  }
}

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
    applyHashProfile();
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
    parseConfig(loaded.config); // before it is stored: a profile nothing can read is refused here
  } catch (err) {
    // A bad drop keeps whatever profile was already working.
    fail(`Couldn't read that 3MF: ${reason(err)}`, err);
    input.value = "";
    return;
  }
  adoptProfile(loaded);
  input.value = "";
  // The project is the printer the parts go to, so its bed is the one they must fit. A
  // project that does not say keeps the bed typed in, and the profile line says so.
  try { followBed(bedFromConfig(loaded.config)); } catch (err) {
    console.warn("the imported profile gives no bed size", err);
    $("profileNow").textContent += ` It gives no bed size (${reason(err)}), so the bed below stays as typed.`;
  }
});

loadProfile();

// ------------------------------------------------------------- url state
// Every field readOptions() consumes, plus the layout the user clicked. Checkboxes are
// written as on/off rather than through FormData, which omits an unchecked box entirely,
// so a link with cascade turned off used to load with it back on.
const ROW_KEYS = ["w", "d", "h", "front", "bedX", "bedY", "bedZ", "solid", "design", "pattern", "hexR", "hexAuto", "fit"];
const KEYS = ["w", "d", "h", "front", "canD", "canL", "bedX", "bedY", "bedZ", "cascade", "cover", "rearLoad", "stackable", "left", "right", "solid", "design", "pattern", "base", "magnets", "across", "along", "hexR", "hexAuto", "slope", "lipGap", "fit"];
// replaceState is rate limited - Chrome drops past ~100 in 30 s, Safari throws - and the
// hash write used to run once per input event while the build was debounced. Holding an
// arrow key in a number field is ~30 events a second, and the writes the browser dropped
// included the one Share makes, so Share copied a stale link and said "Link copied."
let hashTimer = 0;
let appliedHash = location.hash;
function queueHash() {
  clearTimeout(hashTimer);
  hashTimer = window.setTimeout(syncHash, 250);
}
function syncHash() {
  clearTimeout(hashTimer); // a queued write would only repeat this one
  // Navigation changes location before hashchange runs. A queued edit must not
  // replace that incoming link while its event is still waiting in the task queue.
  if (location.hash !== appliedHash) { loadHashNavigation(); return !incomingLinkError(); }
  if (incomingLinkError()) return false;
  const q = new URLSearchParams();
  for (const k of buildMode.value === "rows" ? ROW_KEYS : KEYS) {
    const el = form.elements.namedItem(k) as HTMLInputElement;
    q.set(k, el.type === "checkbox" ? (el.checked ? "on" : "off") : el.value);
  }
  if (buildMode.value === "rows") {
    try {
      const fields = new FormData(form);
      const { request } = independentRowsOptionsFrom(name => { const value = fields.get(name); return value === null ? null : String(value); }, independentRowValues());
      q.set("v", "5"); q.set("mode", "rows"); q.set("rows", JSON.stringify(request.rows));
      q.set("shareWalls", request.shareCompatibleWalls ? "on" : "off"); q.set("topCover", request.topCover ? "on" : "off");
    } catch (error) { console.info(`Shared link is waiting for valid row inputs: ${reason(error)}`); return false; }
  } else if (buildMode.value === "mixed") {
    try {
      const fields = new FormData(form);
      const { request } = mixedOptionsFrom((name) => { const value = fields.get(name); return value === null ? null : String(value); }, stackValues());
      q.set("v", request.shareCompatibleWalls ? "4" : "3"); q.set("mode", "mixed"); q.set("stacks", JSON.stringify(request.stacks));
      if (request.shareCompatibleWalls) q.set("shareWalls", "on");
    } catch (error) {
      console.info(`Shared link is waiting for valid stack inputs: ${reason(error)}`);
      return false;
    }
  } else if (chosenIndex > 0) q.set("layout", String(chosenIndex));
  // Not the imported 3MF - that is tens of KB - but the built-in picks are four short
  // strings, and translucent changes the filament and time estimates and the exported
  // settings. Without them the recipient reads different numbers off the same link.
  // hashPicks until the catalogue lands: the selects are empty for the first few hundred
  // ms of a page load, and writing the hash from them in that window strips these four
  // keys out of the link that carried them. Permanently, if the fetch then fails.
  const picks = hashPicks ?? (pick.nozzle.value
    ? { machine: pick.nozzle.value, process: pick.process.value, filament: pick.filament.value, translucent: pick.translucent.checked }
    : null);
  if (picks) {
    q.set("machine", picks.machine);
    q.set("process", picks.process);
    q.set("filament", picks.filament);
    if (picks.translucent) q.set("translucent", "on");
  }
  history.replaceState(null, "", "#" + q.toString());
  appliedHash = location.hash;
  return true;
}
function loadHash() {
  hashPicks = null;
  incomingDesignError = null;
  incomingFlagErrors.clear();
  stacksInitialized = false; independentRowsInitialized = false;
  shareWalls.checked = false; rowsShareWalls.checked = false; rowsTopCover.checked = true;
  buildMode.value = "uniform";
  resetStacks(); resetIndependentRows();
  syncMode();
  if (!location.hash.length) return;
  const q = new URLSearchParams(location.hash.slice(1));
  for (const k of q.get("mode") === "rows" ? ROW_KEYS : KEYS) {
    const el = form.elements.namedItem(k) as HTMLInputElement | null; if (!el || !q.has(k)) continue;
    if (el.type === "checkbox") el.checked = q.get(k) === "on"; else el.value = q.get(k)!;
  }
  hashPicks = q.has("machine")
    ? { machine: q.get("machine")!, process: q.get("process") ?? "", filament: q.get("filament") ?? "", translucent: q.get("translucent") === "on" }
    : null;
  (form.elements.namedItem("preset") as HTMLSelectElement).value = "custom";
  (form.elements.namedItem("fitOut") as HTMLOutputElement).value = Number((form.elements.namedItem("fit") as HTMLInputElement).value).toFixed(2);
  (form.elements.namedItem("lipGapOut") as HTMLOutputElement).value = (form.elements.namedItem("lipGap") as HTMLInputElement).value;
  if (q.get("mode") === "rows" || q.get("v") === "5") {
    buildMode.value = "rows";
    try {
      if (q.getAll("mode").length !== 1 || q.getAll("v").length !== 1 || q.get("mode") !== "rows" || q.get("v") !== "5")
        throw new Error("This custom-row link has an unsupported version or mode");
      if (q.getAll("rows").length !== 1) throw new Error("A version-5 link must contain one row request");
      resetIndependentRows(independentRowsFrom(JSON.parse(q.get("rows")!)));
      independentRowsInitialized = true;
      for (const [name, input, label] of [["shareWalls", rowsShareWalls, "Share compatible walls"],
        ["topCover", rowsTopCover, "Cover the top row"]] as const) {
        try {
          const values = q.getAll(name);
          if (values.length !== 1 || !["on", "off"].includes(values[0]))
            throw new Error(`${name} in a version-5 link must be explicitly on or off`);
          input.checked = values[0] === "on";
        } catch (error) {
          console.warn(`Rejected the custom-row link's ${name} flag`, error);
          incomingFlagErrors.set(input.name, `Couldn't read this custom-row link: ${reason(error)}. Change “${label}” to choose its value.`);
        }
      }
    } catch (error) {
      console.warn("Rejected the custom-row link", error);
      incomingDesignError = `Couldn't read this custom-row link: ${reason(error)}. Open a valid link or change Build mode to start a new design.`;
    }
    syncMode();
  } else if (q.has("mode") || q.has("v")) {
    buildMode.value = "mixed";
    try {
      if (q.get("mode") !== "mixed" || !["2", "3", "4"].includes(q.get("v") ?? "")) throw new Error("This mixed-organizer link has an unsupported version or mode");
      // Restore independently valid stack settings before checking link flags.
      resetStacks(mixedStacksFrom(JSON.parse(q.get("stacks") ?? "null")));
      stacksInitialized = true;
      if (q.get("v") === "4") {
        try {
          const flags = q.getAll("shareWalls");
          if (flags.length !== 1 || !["on", "off"].includes(flags[0]))
            throw new Error("Wall sharing in a version-4 link must be explicitly on or off");
          shareWalls.checked = flags[0] === "on";
        } catch (error) {
          console.warn("Rejected the mixed-organizer link's wall-sharing flag", error);
          incomingFlagErrors.set(shareWalls.name, `Couldn't read this mixed-organizer link: ${reason(error)}. Change “Share compatible walls” to choose its value.`);
        }
      }
    } catch (error) {
      console.warn("Rejected the mixed-organizer link", error);
      incomingDesignError = `Couldn't read this mixed-organizer link: ${reason(error)}. Open a valid link or change Build mode to start a new design.`;
    }
    syncMode();
  }
  return Number(q.get("layout") ?? 0);
}

/** Fragment navigation is a new shared design, just as opening it in a fresh tab is. */
function loadHashNavigation() {
  if (location.hash === appliedHash) return;
  exportId++;
  clearTimeout(hashTimer);
  appliedHash = location.hash;
  form.reset();
  const layout = loadHash();
  profile = loadStoredProfile();
  profileNote = "";
  showProfile();
  refit(layout);
  syncJoins();
  updateControlSummaries();
  if (index) applyHashProfile();
  syncHash();
}
window.addEventListener("hashchange", loadHashNavigation);

$("share").addEventListener("click", async () => {
  if (!syncHash()) { setStatus("Fix the design inputs before sharing this organizer."); return; }
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
syncJoins();
updateControlSummaries();
if (arrivedWithHash) syncHash();
