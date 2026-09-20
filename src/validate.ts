// One gate for every value the user types or arrives with in a shared link.
// Nothing downstream re-checks, so a value that gets past here reaches the
// solver, the WASM kernel and the exported file unexamined.

import { DEFAULTS, DESIGNS, PATTERNS, BASES, ACROSS, ALONG, type Design, type Pattern, type Base, type Across, type Along, type Options } from "./geometry";
import type { Space } from "./solver";

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
  hexR: { min: 6, max: 20, label: "cell size" },
  slope: { min: 0, max: 10, label: "deck slope" },
  lipGap: { min: 0, max: 20, label: "lip headroom" },
  // fit is a tolerance offset, not a dimension: 0 is the default and negative is valid.
  // These are the range input's own bounds, and they have to stay that way. The geometry
  // does not survive the old -2: K.tabT + 2*(cl + fit) goes negative below -1.75, which
  // makes g.box() return an InvalidConstruction with no vertices, and nothing throws.
  fit: { min: -0.2, max: 0.3, label: "fit" },
};

/** Check each number against its limit. Throws naming the first bad field. */
export function readNumbers(values: Record<string, number>): Record<string, number> {
  for (const [key, value] of Object.entries(values)) {
    // hasOwn, not a plain lookup: LIMITS is an object literal, so LIMITS["toString"] and
    // LIMITS["constructor"] are truthy inherited values whose min and max are undefined,
    // and every comparison against undefined is false. A key like that walked straight
    // through the one gate the app has.
    if (!Object.hasOwn(LIMITS, key)) continue; // not a dimension we police
    const limit = LIMITS[key]!;
    if (!Number.isFinite(value)) throw new Error(`${limit.label} needs a number`);
    if (value < limit.min || value > limit.max)
      throw new Error(`${limit.label} must be between ${limit.min} and ${limit.max} mm`);
  }
  return values;
}

export interface FormValues { space: Space; base: Options; cascade: boolean }

/** The form's fields, as strings the way FormData hands them over (a checkbox is "on" or
 *  absent), turned into what the solver takes. Throws naming the field that is wrong:
 *  a shared hash with an unknown design leaves the select blank, and that is said the
 *  same way as a number out of range. */
export function optionsFrom(field: (name: string) => string | null): FormValues {
  const raw: Record<string, number> = {};
  for (const k of Object.keys(LIMITS)) raw[k] = parseFloat(String(field(k)));
  readNumbers(raw);
  const num = (k: string) => raw[k];
  const on = (k: string) => field(k) === "on";
  const design = field("design") as Design;
  if (!DESIGNS.includes(design)) throw new Error("design: pick Standard or Minimal");
  const pattern = field("pattern") as Pattern;
  if (!PATTERNS.includes(pattern)) throw new Error("pattern: pick Hex, Circles, Kumiko, Slats or Breeze block");
  const standsOn = field("base") as Base;
  if (!BASES.includes(standsOn)) throw new Error("base: pick Flat, Feet or Gridfinity");
  const across = field("across") as Across, along = field("along") as Along;
  if (!ACROSS.includes(across) || !ALONG.includes(along)) throw new Error("grid position: pick left, centre or right, and front, centre or back");
  const base: Options = {
    ...DEFAULTS,
    canD: num("canD"), canL: num("canL"),
    bed: [num("bedX"), num("bedY"), num("bedZ")],
    cover: on("cover"), solid: on("solid"), design, pattern, base: standsOn, magnets: on("magnets"), across, along, fit: num("fit"),
    hexR: num("hexR"), hexAuto: on("hexAuto"), slope: num("slope"), lipGap: num("lipGap"),
  };
  return { space: { w: num("w"), d: num("d"), h: num("h"), front: num("front") }, base, cascade: on("cascade") };
}
