// Built-in print settings for every Bambu Lab printer, without saving a project from
// the slicer first. profiles/index.json (bun run profiles) is the catalogue of Bambu's
// own presets; composeProfile turns a choice of four into a project_settings.config.
//
// The config only names presets. Bambu Studio replaces every value in it with the named
// system preset's and then selects that preset, so the values would be ignored anyway.
// What it does read first: printer_model (must be a BBL machine), nozzle_diameter and a
// matching extruder_type, and filament_colour, whose length is the filament count.

export interface Machine {
  name: string;            // "Bambu Lab P2S 0.4 nozzle", the printer_settings_id
  printer: string;         // "Bambu Lab P2S", the printer_model
  nozzle: string;          // "0.4"
  nozzleDiameters: string[];
  extruderTypes?: string[];
  printableArea: string[]; // Bambu's "256x256" corner strings
  printableHeight: string;
  bedType: string;
}
export interface Process { name: string; layerHeight: number; printers: number[] }
export interface Filament { name: string; label: string; vendor: string; colour: string; printers: number[] }
export interface ProfileIndex { version: string; machines: Machine[]; processes: Process[]; filaments: Filament[] }

export interface Picks { machine: string; process: string; filament: string }

export const INDEX_URL = "profiles/index.json";

export const printersOf = (index: ProfileIndex) => [...new Set(index.machines.map((m) => m.printer))];
export const machinesFor = (index: ProfileIndex, printer: string) => index.machines.filter((m) => m.printer === printer);

const forMachine = <T extends { printers: number[] }>(index: ProfileIndex, machine: string, list: T[]) => {
  const at = index.machines.findIndex((m) => m.name === machine);
  return list.filter((item) => item.printers.includes(at));
};
export const processesFor = (index: ProfileIndex, machine: string) =>
  forMachine(index, machine, index.processes).sort((a, b) => a.layerHeight - b.layerHeight || a.name.localeCompare(b.name));
export const filamentsFor = (index: ProfileIndex, machine: string) => forMachine(index, machine, index.filaments);

/** Vendors in the order the list should read: Bambu first, Generic second, the rest alphabetically. */
export function vendorsOf(filaments: Filament[]): string[] {
  const front = ["Bambu Lab", "Generic"];
  const rest = [...new Set(filaments.map((f) => f.vendor))].filter((v) => !front.includes(v)).sort();
  return [...front.filter((v) => filaments.some((f) => f.vendor === v)), ...rest];
}

/** A sensible starting point for a machine: 0.20mm Standard and Bambu PLA Basic when they exist. */
export function defaultPicks(index: ProfileIndex, machine: string): Picks {
  const processes = processesFor(index, machine), filaments = filamentsFor(index, machine);
  return {
    machine,
    process: (processes.find((p) => p.name.startsWith("0.20mm Standard")) ?? processes[0]).name,
    filament: (filaments.find((f) => f.label === "Bambu PLA Basic") ?? filaments[0]).name,
  };
}

export const describePicks = (index: ProfileIndex, picks: Picks) => {
  const machine = index.machines.find((m) => m.name === picks.machine)!;
  const filament = index.filaments.find((f) => f.name === picks.filament)!;
  return `${machine.printer} · ${machine.nozzle} nozzle · ${filament.label} · ${picks.process.replace(/ @.*$/, "")}`;
};

export function composeProfile(index: ProfileIndex, picks: Picks): Uint8Array {
  const machine = index.machines.find((m) => m.name === picks.machine);
  const filament = index.filaments.find((f) => f.name === picks.filament);
  if (!machine || !filament) throw new Error(`unknown preset in ${JSON.stringify(picks)}`);
  const config = {
    version: index.version,
    printer_technology: "FFF",
    printer_model: machine.printer,
    printer_settings_id: machine.name,
    print_settings_id: picks.process,
    filament_settings_id: [filament.name],
    filament_colour: [filament.colour],
    nozzle_diameter: machine.nozzleDiameters,
    ...(machine.extruderTypes && { extruder_type: machine.extruderTypes }),
    printable_area: machine.printableArea,
    printable_height: machine.printableHeight,
    curr_bed_type: machine.bedType,
  };
  return new TextEncoder().encode(JSON.stringify(config, null, 2));
}

/** The picks a stored config was composed from, or null when it came from somewhere else. */
export function picksFromConfig(index: ProfileIndex, config: Uint8Array): Picks | null {
  let parsed: any;
  try { parsed = JSON.parse(new TextDecoder().decode(config)); } catch { return null; }
  const picks = { machine: parsed?.printer_settings_id, process: parsed?.print_settings_id, filament: parsed?.filament_settings_id?.[0] };
  const known = index.machines.some((m) => m.name === picks.machine)
    && index.processes.some((p) => p.name === picks.process)
    && index.filaments.some((f) => f.name === picks.filament);
  return known ? picks : null;
}

/** Bed X, Y, Z from a project_settings.config: the far corner of printable_area and printable_height. */
export function bedFromConfig(config: Uint8Array): [number, number, number] {
  const parsed = JSON.parse(new TextDecoder().decode(config));
  const corners: string[] = parsed.printable_area;
  const height = Number(parsed.printable_height);
  if (!Array.isArray(corners) || !corners.length || !Number.isFinite(height)) throw new Error("profile has no printable_area or printable_height");
  const xs = corners.map((corner) => Number(corner.split("x")[0]));
  const ys = corners.map((corner) => Number(corner.split("x")[1]));
  return [Math.max(...xs), Math.max(...ys), height];
}
