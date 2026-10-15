import { test, expect } from "bun:test";
import { INDEX_URL, composeProfile, defaultPicks, picksFromConfig, type ProfileIndex } from "../src/profiles";

const index: ProfileIndex = await Bun.file(INDEX_URL).json();
const smallNozzle = "Bambu Lab P2S 0.2 nozzle";
const normalNozzle = "Bambu Lab P2S 0.4 nozzle";

test("composition rejects known process and filament names incompatible with the machine", () => {
  const compatible = defaultPicks(index, smallNozzle);
  const incompatible = defaultPicks(index, normalNozzle);
  expect(() => composeProfile(index, { ...compatible, process: incompatible.process })).toThrow(/process .* incompatible/);
  expect(() => composeProfile(index, { ...compatible, filament: incompatible.filament })).toThrow(/filament .* incompatible/);
});

test("direct composition rejects translucent mode on a 0.2 nozzle", () => {
  expect(() => composeProfile(index, { ...defaultPicks(index, smallNozzle), translucent: true })).toThrow(/translucent.*0.2/);
});

test("unsupported imported settings stay custom and their bytes remain untouched", () => {
  const compatible = defaultPicks(index, smallNozzle);
  const incompatible = defaultPicks(index, normalNozzle);
  for (const overrides of [
    { print_settings_id: incompatible.process },
    { filament_settings_id: [incompatible.filament] },
    { sparse_infill_pattern: "alignedrectilinear", fan_max_speed: ["0"] },
  ]) {
    const config = new TextEncoder().encode(JSON.stringify({
      ...JSON.parse(new TextDecoder().decode(composeProfile(index, compatible))), ...overrides,
    }));
    const original = new Uint8Array(config);
    expect(picksFromConfig(index, config)).toBeNull();
    expect(config).toEqual(original);
  }
});

test("every machine's supported default picks round-trip", () => {
  for (const machine of index.machines) {
    const picks = defaultPicks(index, machine.name);
    expect(picksFromConfig(index, composeProfile(index, picks))).toEqual(picks);
    if (machine.nozzle !== "0.2") {
      const translucentPicks = { ...picks, translucent: true };
      expect(picksFromConfig(index, composeProfile(index, translucentPicks))).toEqual(translucentPicks);
    }
  }
});
