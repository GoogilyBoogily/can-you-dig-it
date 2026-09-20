// bun run profiles  →  profiles/index.json, every Bambu Lab preset Bambu Studio ships.
//
// The browser composes a project_settings.config that mostly names presets (see
// docs/superpowers/specs/2026-09-17-print-settings-picker-design.md for why the values
// do not matter), so all it needs is the catalogue: which machines exist, what bed and
// nozzles they have, and which processes and filaments fit each one. Presets inherit
// from parents, so each chain is flattened here. Needs Bambu Studio installed, or
// BAMBU_PROFILES=<checkout>/resources/profiles/BBL BAMBU_VERSION=02.08.02.61 from a tag
// of github.com/bambulab/BambuStudio; rerun after a Bambu update and read the diff.
//
// The one place values do matter: the translucent speeds are per extruder variant
// (Standard, High Flow, ...) and Bambu Studio keeps a value only in the slots whose
// variant name and extruder id match, so each process carries its print_extruder_variant
// and print_extruder_id.
import { readdirSync } from "node:fs";
import { join } from "node:path";
import type { ProfileIndex, Machine } from "./src/profiles";

const APP = "/Applications/BambuStudio.app/Contents";
const PRESETS = process.env.BAMBU_PROFILES ?? `${APP}/Resources/profiles/BBL`;

type Preset = Record<string, any>;

// Presets refer to each other by the `name` inside the file, which is not always the
// file name ("Bambu Support For PA/PET @base" lives in "Bambu Support For PA PET @base.json").
const files = new Map<string, Preset>();
async function presetNames(kind: string): Promise<string[]> {
  const names: string[] = [];
  for (const file of readdirSync(join(PRESETS, kind)).filter((f) => f.endsWith(".json")).sort()) {
    const preset = await Bun.file(join(PRESETS, kind, file)).json();
    files.set(`${kind}/${preset.name}`, preset);
    names.push(preset.name);
  }
  return names;
}

function flattenPreset(kind: string, name: string): Preset {
  const preset = files.get(`${kind}/${name}`);
  if (!preset) throw new Error(`no ${kind} preset named ${name}`);
  const { inherits, ...own } = preset;
  return inherits ? { ...flattenPreset(kind, inherits), ...own } : own;
}


const version = process.env.BAMBU_VERSION ?? await bundleVersion();
/** Bambu Studio's own version, off the macOS bundle. Anywhere else, BAMBU_VERSION says it. */
async function bundleVersion(): Promise<string> {
  const plist = await Bun.file(`${APP}/Info.plist`).text().catch(() => "");
  const found = /CFBundleShortVersionString<\/key>\s*<string>([^<]+)/.exec(plist)?.[1];
  if (!found) throw new Error(`no ${APP}/Info.plist to read the version from - set BAMBU_VERSION (see the header of this file)`);
  return found;
}

const machines: Machine[] = [];
for (const name of await presetNames("machine")) {
  const match = name.match(/^(.+) ([\d.]+) nozzle$/);
  if (!match) continue; // printer model files and gcode templates
  const preset = flattenPreset("machine", name);
  if (preset.instantiation === "false") continue;
  const model = flattenPreset("machine", preset.printer_model);
  machines.push({
    name, printer: preset.printer_model, nozzle: match[2],
    nozzleDiameters: preset.nozzle_diameter, extruderTypes: preset.extruder_type,
    printableArea: preset.printable_area, printableHeight: preset.printable_height, bedType: model.default_bed_type,
  });
}
const machineIndex = new Map(machines.map((m, i) => [m.name, i]));
const compatible = (preset: Preset) => (preset.compatible_printers ?? []).map((n: string) => machineIndex.get(n)).filter((i: number | undefined) => i !== undefined);

const processes = [];
for (const name of await presetNames("process")) {
  const preset = flattenPreset("process", name);
  if (preset.instantiation !== "true") continue;
  const printers = compatible(preset);
  if (!printers.length) continue;
  processes.push({ name, layerHeight: Number(preset.layer_height), printers, extruderVariants: preset.print_extruder_variant, extruderIds: preset.print_extruder_id });
}

const filaments = [];
for (const name of await presetNames("filament")) {
  const preset = flattenPreset("filament", name);
  if (preset.instantiation !== "true") continue;
  const printers = compatible(preset);
  if (!printers.length) continue;
  filaments.push({ name, label: name.replace(/ @.*$/, ""), vendor: preset.filament_vendor?.[0] ?? "Other", colour: preset.default_filament_colour?.[0] ?? "#00AE42", printers });
}

const index: ProfileIndex = { version, machines, processes, filaments };
const json = JSON.stringify(index);
await Bun.write(new URL("profiles/index.json", import.meta.url), json); // not CWD-relative
console.log(`profiles/index.json ${(json.length / 1024).toFixed(0)} KB: ${machines.length} machines, ${processes.length} processes, ${filaments.length} filaments`);
