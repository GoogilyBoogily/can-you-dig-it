// The catalogue is scraped from an installed Bambu Studio, and the composed config only
// names presets, so what can go wrong is coverage (a printer with nothing to pick) and
// the few keys Bambu Studio 2.8 reads before it swaps in the system preset's values:
// printer_model, nozzle_diameter with a matching extruder_type, filament_colour.
import { test, expect } from "bun:test";
import { INDEX_URL, composeProfile, picksFromConfig, defaultPicks, processesFor, filamentsFor, printersOf, machinesFor, vendorsOf, bedFromConfig, describePicks, type ProfileIndex } from "../src/profiles";

const index: ProfileIndex = await Bun.file(INDEX_URL).json();
const P2S = "Bambu Lab P2S 0.4 nozzle", H2D = "Bambu Lab H2D 0.4 nozzle";
const parse = (bytes: Uint8Array) => JSON.parse(new TextDecoder().decode(bytes));

test("the catalogue covers every Bambu Lab printer with four nozzles each", () => {
  expect(printersOf(index)).toHaveLength(14);
  for (const printer of printersOf(index)) expect(machinesFor(index, printer).map((m) => m.nozzle).sort(), printer).toEqual(["0.2", "0.4", "0.6", "0.8"]);
});

test("every machine has at least one process and one filament to pick", () => {
  for (const m of index.machines) {
    expect(processesFor(index, m.name).length, m.name).toBeGreaterThan(0);
    expect(filamentsFor(index, m.name).length, m.name).toBeGreaterThan(0);
  }
});

test("processes come thinnest layer first", () => {
  const heights = processesFor(index, P2S).map((p) => p.layerHeight);
  expect(heights).toEqual([...heights].sort((a, b) => a - b));
});

test("Bambu and Generic lead the vendor list", () => {
  expect(vendorsOf(filamentsFor(index, P2S)).slice(0, 2)).toEqual(["Bambu Lab", "Generic"]);
});

test("the default picks are 0.20mm Standard and Bambu PLA Basic", () => {
  expect(defaultPicks(index, P2S)).toEqual({ machine: P2S, process: "0.20mm Standard @BBL P2S", filament: "Bambu PLA Basic @BBL P2S" });
});

test("a composed config names the presets and carries what Bambu checks first", () => {
  const config = parse(composeProfile(index, defaultPicks(index, P2S)));
  expect(config.printer_settings_id).toBe(P2S);
  expect(config.print_settings_id).toBe("0.20mm Standard @BBL P2S");
  expect(config.filament_settings_id).toEqual(["Bambu PLA Basic @BBL P2S"]);
  expect(config.printer_model).toBe("Bambu Lab P2S");
  expect(config.nozzle_diameter).toEqual(["0.4"]);
  expect(config.extruder_type).toHaveLength(1);
  expect(config.filament_colour).toHaveLength(1);
  expect(config.curr_bed_type).toBe("Textured PEI Plate");
});

test("a dual-nozzle machine lists two nozzles and two extruder types", () => {
  const config = parse(composeProfile(index, defaultPicks(index, H2D)));
  expect(config.nozzle_diameter).toHaveLength(2);
  expect(config.extruder_type).toHaveLength(2);
});

test("the bed follows the machine", () => {
  expect(bedFromConfig(composeProfile(index, defaultPicks(index, P2S)))).toEqual([256, 256, 256]);
  expect(bedFromConfig(composeProfile(index, defaultPicks(index, "Bambu Lab A1 mini 0.4 nozzle")))).toEqual([180, 180, 180]);
});

test("picks round-trip through the config, and a foreign config yields none", () => {
  const picks = defaultPicks(index, H2D);
  expect(picksFromConfig(index, composeProfile(index, picks))).toEqual(picks);
  expect(picksFromConfig(index, new TextEncoder().encode(`{"printer_settings_id":"X1C 0.4"}`))).toBeNull();
  expect(picksFromConfig(index, new TextEncoder().encode("not json"))).toBeNull();
});

test("the label reads like the dropdowns", () => {
  expect(describePicks(index, defaultPicks(index, P2S))).toBe("Bambu Lab P2S · 0.4 nozzle · Bambu PLA Basic · 0.20mm Standard");
});

// Translucent: the overrides Bambu's own demo 3MFs carry, and the different_settings_to_system
// list that stops Bambu Studio replacing them with the system preset's values.
const PETG = "Bambu PETG Translucent @BBL P2S 0.4 nozzle", PLA = "Bambu PLA Translucent @BBL P2S 0.4 nozzle";
const translucent = (machine: string, filament: string) => parse(composeProfile(index, { ...defaultPicks(index, machine), filament, translucent: true }));

test("translucent PETG on a 0.4 nozzle carries the demo's process and filament overrides, each listed", () => {
  const config = translucent(P2S, PETG);
  expect(config.wall_loops).toBe("1");
  expect(config.top_shell_layers).toBe("0");
  expect(config.bottom_shell_layers).toBe("0");
  expect(config.sparse_infill_density).toBe("100%");
  expect(config.sparse_infill_pattern).toBe("alignedrectilinear");
  expect(config.outer_wall_speed).toBe("20");
  expect(config.layer_height).toBe("0.1");
  expect(config.line_width).toBe("0.5");
  expect(config.fan_max_speed).toEqual(["0"]);
  expect(config.filament_flow_ratio).toEqual(["1.01"]);
  expect(config.nozzle_temperature).toEqual(["270"]);
  const [process, filament, printer] = config.different_settings_to_system;
  // Every listed key is one the config sets, and every override is listed: an unlisted
  // value is silently replaced by the system preset's.
  for (const key of [...process.split(";"), ...filament.split(";")]) expect(config[key], key).toBeDefined();
  expect(process.split(";")).toEqual(expect.arrayContaining(["wall_loops", "top_shell_layers", "sparse_infill_pattern", "layer_height", "line_width", "outer_wall_speed"]));
  expect(filament.split(";").sort()).toEqual(["fan_max_speed", "fan_min_speed", "filament_flow_ratio", "nozzle_temperature", "nozzle_temperature_initial_layer"]);
  expect(printer).toBe("");
});

test("translucent PLA keeps its own temperature", () => {
  const config = translucent(P2S, PLA);
  expect(config.nozzle_temperature).toBeUndefined();
  expect(config.fan_max_speed).toEqual(["0"]);
  expect(config.different_settings_to_system[1]).not.toContain("nozzle_temperature");
});

test("a wider nozzle keeps its process's layer height and widens the line", () => {
  const config = translucent("Bambu Lab P2S 0.6 nozzle", "Bambu PETG Translucent @BBL P2S 0.6 nozzle");
  expect(config.layer_height).toBeUndefined();
  expect(config.line_width).toBe("0.62");
  expect(config.different_settings_to_system[0]).not.toContain("layer_height");
});

test("translucent off writes today's file", () => {
  const config = parse(composeProfile(index, defaultPicks(index, P2S)));
  expect(config.different_settings_to_system).toBeUndefined();
  expect(config.wall_loops).toBeUndefined();
  expect(config.fan_max_speed).toBeUndefined();
});

test("translucent round-trips through the config and shows in the label", () => {
  const picks = { ...defaultPicks(index, P2S), filament: PETG, translucent: true };
  expect(picksFromConfig(index, composeProfile(index, picks))).toEqual(picks);
  expect(describePicks(index, picks)).toBe("Bambu Lab P2S · 0.4 nozzle · Bambu PETG Translucent · 0.20mm Standard · translucent");
});

test("composeProfile refuses unknown presets", () => {
  expect(() => composeProfile(index, { machine: "nope", process: "x", filament: "y" })).toThrow("unknown preset");
});
