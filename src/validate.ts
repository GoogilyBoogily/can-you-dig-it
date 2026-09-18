// One gate for every number the user types or arrives with in a shared link.
// Nothing downstream re-checks, so a value that gets past here reaches the
// solver, the WASM kernel and the exported file unexamined.

export interface Limit { min: number; max: number; label: string }

export const LIMITS: Record<string, Limit> = {
  w: { min: 50, max: 5000, label: "shelf width" },
  d: { min: 50, max: 5000, label: "shelf depth" },
  h: { min: 50, max: 5000, label: "shelf height" },
  front: { min: 0, max: 500, label: "front gap" },
  canD: { min: 20, max: 200, label: "can diameter" },
  canL: { min: 40, max: 400, label: "can length" },
  bedX: { min: 50, max: 1000, label: "bed X" },
  bedY: { min: 50, max: 1000, label: "bed Y" },
  bedZ: { min: 50, max: 1000, label: "bed Z" },
  hexR: { min: 6, max: 20, label: "hex cell" },
  slope: { min: 0, max: 10, label: "deck slope" },
  // fit is a tolerance offset, not a dimension: 0 is the default and negative is valid.
  fit: { min: -2, max: 2, label: "fit" },
};

/** Check each number against its limit. Throws naming the first bad field. */
export function readNumbers(values: Record<string, number>): Record<string, number> {
  for (const [key, value] of Object.entries(values)) {
    const limit = LIMITS[key];
    if (!limit) continue; // not a dimension we police
    if (!Number.isFinite(value)) throw new Error(`${limit.label} needs a number`);
    if (value < limit.min || value > limit.max)
      throw new Error(`${limit.label} must be between ${limit.min} and ${limit.max} mm`);
  }
  return values;
}
