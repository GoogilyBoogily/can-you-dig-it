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

test("composeProfile refuses unknown presets", () => {
  expect(() => composeProfile(index, { machine: "nope", process: "x", filament: "y" })).toThrow("unknown preset");
});
