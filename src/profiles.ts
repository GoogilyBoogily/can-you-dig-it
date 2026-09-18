// Built-in print settings, so nobody has to save a project from Bambu Studio first.
// Each entry names three Bambu system presets; `bun run profiles` (profiles.ts) turns
// them into profiles/<id>.config, the project_settings.config Bambu Studio itself
// would write. The browser only reads id and label.

export interface BuiltInProfile {
  id: string;
  label: string;
  machine: string;
  process: string;
  filament: string;
}

export const BUILT_IN_PROFILES: BuiltInProfile[] = [
  {
    id: "bambu-p2s-0.4-pla-basic-0.20",
    label: "Bambu Lab P2S · 0.4 nozzle · Bambu PLA Basic · 0.20mm Standard",
    machine: "Bambu Lab P2S 0.4 nozzle",
    process: "0.20mm Standard @BBL P2S",
    filament: "Bambu PLA Basic @BBL P2S",
  },
];

export const profileUrl = (id: string) => `profiles/${id}.config`;

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
