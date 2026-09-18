// Built-in print settings for every Bambu Lab printer, without saving a project from
// the slicer first. profiles/index.json (bun run profiles) is the catalogue of Bambu's
// own presets; composeProfile turns a choice of four into a project_settings.config.
//
// The config mostly names presets. Bambu Studio replaces every value in it with the named
// system preset's and then selects that preset, except the keys listed in
// different_settings_to_system (one ";"-joined list per preset: process, filament, printer),
// which survive and open the preset as "(modified)". That is how the translucent option
// rides along, and how Bambu's own demo 3MFs carry their settings. What it reads first:
// printer_model (must be a BBL machine), nozzle_diameter and a matching extruder_type, and
// filament_colour, whose length is the filament count.

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

export interface Picks { machine: string; process: string; filament: string; translucent?: boolean }

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
  return `${machine.printer} · ${machine.nozzle} nozzle · ${filament.label} · ${picks.process.replace(/ @.*$/, "")}${picks.translucent ? " · translucent" : ""}`;
};

// The values in Bambu's translucent-PETG demo 3MFs (wiki.bambulab.com/en/knowledge-sharing/
// transparent-petg): one wall, no shells, 100 % aligned infill in one direction, everything
// at 20 mm/s, fan off, more flow. The 0.4 demo also drops to 0.1 mm layers at 0.5 mm lines;
// the 0.6 and 0.8 keep their layer height and widen the line to nozzle + 0.02. Every plate
// prints flat and overhang-free, so fan off costs nothing here. 270 °C is PETG's number
// and would cook PLA, so it is gated on the filament label.
function translucentOverrides(machine: Machine, filament: Filament) {
  const nozzle = Number(machine.nozzle);
  const lineWidth = nozzle === 0.4 ? "0.5" : nozzle > 0.4 ? (nozzle + 0.02).toFixed(2) : null;
  const process: Record<string, string> = {
    wall_loops: "1", top_shell_layers: "0", bottom_shell_layers: "0",
    sparse_infill_density: "100%", sparse_infill_pattern: "alignedrectilinear", infill_direction: "0",
    enable_overhang_speed: "0",
    outer_wall_speed: "20", inner_wall_speed: "20", sparse_infill_speed: "20", internal_solid_infill_speed: "20",
    initial_layer_speed: "20", initial_layer_infill_speed: "20", gap_infill_speed: "20", bridge_speed: "20",
    ...(nozzle === 0.4 && { layer_height: "0.1", initial_layer_print_height: "0.1" }),
    ...(lineWidth && { line_width: lineWidth, outer_wall_line_width: lineWidth, inner_wall_line_width: lineWidth, sparse_infill_line_width: lineWidth, internal_solid_infill_line_width: lineWidth }),
  };
  const filamentValues: Record<string, string[]> = {
    fan_min_speed: ["0"], fan_max_speed: ["0"], filament_flow_ratio: ["1.01"],
    ...(/PETG/.test(filament.label) && { nozzle_temperature: ["270"], nozzle_temperature_initial_layer: ["270"] }),
  };
  return {
    ...process, ...filamentValues,
    different_settings_to_system: [Object.keys(process).join(";"), Object.keys(filamentValues).join(";"), ""],
  };
}

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
    ...(picks.translucent && translucentOverrides(machine, filament)),
  };
  return new TextEncoder().encode(JSON.stringify(config, null, 2));
}

/** The picks a stored config was composed from, or null when it came from somewhere else. */
export function picksFromConfig(index: ProfileIndex, config: Uint8Array): Picks | null {
  let parsed: any;
  try { parsed = JSON.parse(new TextDecoder().decode(config)); } catch { return null; }
  const picks: Picks = { machine: parsed?.printer_settings_id, process: parsed?.print_settings_id, filament: parsed?.filament_settings_id?.[0] };
  if (parsed?.different_settings_to_system) picks.translucent = true;
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
