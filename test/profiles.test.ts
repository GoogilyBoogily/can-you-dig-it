// Every built-in profile must ship as a real file that Bambu Studio 2.8 will accept:
// its Plater rejects a config without nozzle_diameter as "invalid config", and it
// only skips that check for a printer_model it knows as a BBL machine.
import { test, expect } from "bun:test";
import { BUILT_IN_PROFILES, bedFromConfig, profileUrl } from "../src/profiles";

const read = (id: string) => Bun.file(profileUrl(id));

for (const profile of BUILT_IN_PROFILES) {
  test(`${profile.id} ships a config naming its presets`, async () => {
    const parsed = JSON.parse(await read(profile.id).text());
    expect(parsed.printer_settings_id).toBe(profile.machine);
    expect(parsed.print_settings_id).toBe(profile.process);
    expect(parsed.filament_settings_id).toEqual([profile.filament]);
    expect(parsed.printer_model).toMatch(/^Bambu Lab /);
    expect(parsed.nozzle_diameter).toHaveLength(1);
  });
}

test("the P2S profile reports a 256 mm cube bed", async () => {
  const bytes = new Uint8Array(await read("bambu-p2s-0.4-pla-basic-0.20").arrayBuffer());
  expect(bedFromConfig(bytes)).toEqual([256, 256, 256]);
});

test("bedFromConfig refuses a config with no bed", () => {
  expect(() => bedFromConfig(new TextEncoder().encode("{}"))).toThrow("printable_area");
});
