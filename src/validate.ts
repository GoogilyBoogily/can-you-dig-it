// Validate form and shared-link inputs. Mixed slope and lip headroom are checked
// after per-stack overrides are applied, before any geometry is solved.

import { DEFAULTS, DESIGNS, PATTERNS, BASES, ACROSS, ALONG, SIDES, type Design, type Pattern, type Base, type Across, type Along, type Side, type Options, type MixedBuildRequest, type MixedStackRequest, INDEPENDENT_ROWS_LIMITS, type IndependentLaneRequest, type IndependentRowRequest, type IndependentRowsBuildRequest } from "./model";
import type { Space } from "./solver";

interface Limit { min: number; max: number; label: string }

export const LIMITS: Record<string, Limit> = {
  w: { min: 50, max: 2000, label: "shelf width" },
  d: { min: 50, max: 2000, label: "shelf depth" },
  h: { min: 50, max: 2000, label: "shelf height" },
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
      throw new Error(`${limit.label} must be between ${limit.min} and ${limit.max} ${key === "slope" ? "degrees" : "mm"}`);
  }
  return values;
}

export interface FormValues { space: Space; base: Options; cascade: boolean }

/** The form's fields, as strings the way FormData hands them over (a checkbox is "on" or
 *  absent), turned into what the solver takes. Throws naming the field that is wrong:
 *  a shared hash with an unknown design leaves the select blank, and that is said the
 *  same way as a number out of range. */
export function optionsFrom(field: (name: string) => string | null): FormValues {
  const { space, base, cascade, numbers } = sharedFormFrom(field, false);
  return { space, base: { ...base, canD: numbers.canD, canL: numbers.canL }, cascade };
}

/** Mixed rows are validated directly; hidden legacy can inputs do not participate. */
export function mixedOptionsFrom(field: (name: string) => string | null, stacks: unknown): { space: Space; request: MixedBuildRequest } {
  const { space, base, cascade } = sharedFormFrom(field, true);
  if (base.base !== "flat") throw new Error("Mixed stacks currently require a flat base");
  const shareWalls = field("shareWalls");
  if (shareWalls !== null && shareWalls !== "on" && shareWalls !== "off")
    throw new Error("Wall sharing must be on or off");
  const { length, tiers, lanesWide, left, right, base: standsOn, magnets, across, along, shelfCells, ...shared } = base;
  return { space, request: { shared: { ...shared, base: "flat", cascade }, stacks: mixedStacksFrom(stacks), ...(shareWalls === "on" ? { shareCompatibleWalls: true } : {}) } };
}

/** A shared gate for form rows and typed callers of the mixed shelf resolver. */
export function mixedStacksFrom(stacks: unknown): MixedStackRequest[] {
  if (!Array.isArray(stacks) || stacks.length < 2 || stacks.length > 8)
    throw new Error("A connected organizer needs two to eight stacks");
  return stacks.map((value, index) => {
    const label = `Stack ${index + 1}`;
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label}: enter the can size, depth and tiers`);
    const row = value as Record<string, unknown>;
    const dimension = (key: string, limitKey: string, dimensionLabel: string): number => {
      const number = row[key];
      const limit = LIMITS[limitKey];
      if (typeof number !== "number" || !Number.isFinite(number)) throw new Error(`${label}: ${dimensionLabel} needs a number`);
      if (number < limit.min || number > limit.max)
        throw new Error(`${label}: ${dimensionLabel} must be between ${limit.min} and ${limit.max} ${key === "slope" ? "degrees" : "mm"}`);
      return number;
    };
    const tiers = row.tiers;
    if (tiers !== "auto" && (typeof tiers !== "number" || !Number.isSafeInteger(tiers) || tiers < 1))
      throw new Error(`${label}: tiers must be Auto or a positive whole number`);
    const request: MixedStackRequest = { canDiameter: dimension("canDiameter", "canD", "can diameter"), canHeight: dimension("canHeight", "canL", "can height"), depth: dimension("depth", "d", "container depth"), tiers };
    for (const key of ["slope", "lipGap"] as const) if (Object.hasOwn(row, key))
      request[key] = dimension(key, key, LIMITS[key].label);
    const labels = { cascade: "auto-feed", cover: "cover", rearLoad: "rear loading", stackable: "stackable top" } as const;
    for (const key of ["cascade", "cover", "rearLoad", "stackable"] as const) if (Object.hasOwn(row, key)) {
      if (typeof row[key] !== "boolean") throw new Error(`${label}: ${labels[key]} must be true or false`);
      request[key] = row[key];
    }
    return request;
  });
}

function sharedFormFrom(field: (name: string) => string | null, mixed: boolean) {
  const raw: Record<string, number> = {};
  for (const k of Object.keys(LIMITS)) {
    if (mixed && (k === "canD" || k === "canL")) continue;
    raw[k] = parseFloat(String(field(k)));
  }
  if (mixed) {
    const { slope, lipGap, ...sharedNumbers } = raw;
    readNumbers(sharedNumbers);
  } else readNumbers(raw);
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
  // the side selects are disabled on a grid, where the baseplate joins the lanes, and a
  // disabled field is absent from the form
  const side = (k: "left" | "right"): Side => {
    const value = field(k) ?? "none";
    if (!SIDES.includes(value as Side)) throw new Error(`${k} side: pick Tongue, Socket or Nothing`);
    return value as Side;
  };
  const { canD, canL, ...sharedDefaults } = DEFAULTS;
  const base: Omit<Options, "canD" | "canL"> = {
    ...sharedDefaults,
    bed: [num("bedX"), num("bedY"), num("bedZ")],
    cover: on("cover"), rearLoad: on("rearLoad"), stackable: on("stackable"), left: side("left"), right: side("right"), solid: on("solid"), design, pattern, base: standsOn, magnets: on("magnets"), across, along, fit: num("fit"),
    hexR: num("hexR"), hexAuto: on("hexAuto"), slope: num("slope"), lipGap: num("lipGap"),
  };
  return { space: { w: num("w"), d: num("d"), h: num("h"), front: num("front") }, base, cascade: on("cascade"), numbers: raw };
}

/** Independent rows have their own schema; legacy tiers and cascade never participate. */
export function independentRowsFrom(rows: unknown): IndependentRowRequest[] {
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > INDEPENDENT_ROWS_LIMITS.requestedRows)
    throw new Error(`Custom rows need one to ${INDEPENDENT_ROWS_LIMITS.requestedRows} rows`);
  let expandedRows = 0, expandedLanes = 0;
  const requests = rows.map((value, rowIndex): IndependentRowRequest => {
    const label = `Row ${rowIndex + 1}`;
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label}: enter the row settings and lanes`);
    const row = value as Record<string, unknown>;
    for (const key of Object.keys(row)) if (!["lanes", "repeat", "rowHeight", "rowSpan", "alignment", "rearLoad"].includes(key))
      throw new Error(`${label}: unsupported setting ${key}`);
    const repeat = row.repeat;
    if (typeof repeat !== "number" || !Number.isSafeInteger(repeat) || repeat < 1 || repeat > INDEPENDENT_ROWS_LIMITS.repetitions)
      throw new Error(`${label}: repeat must be a whole number from 1 to ${INDEPENDENT_ROWS_LIMITS.repetitions}`);
    const dimension = (key: "rowHeight" | "rowSpan", dimensionLabel: string, maximum: number): number | "auto" => {
      const number = row[key];
      if (number === "auto") return number;
      if (typeof number !== "number" || !Number.isFinite(number) || number <= 0 || number > maximum)
        throw new Error(`${label}: ${dimensionLabel} must be Auto or a positive number up to ${maximum} mm`);
      return number;
    };
    const alignment = row.alignment;
    if (alignment !== "left" && alignment !== "centre" && alignment !== "right") throw new Error(`${label}: alignment must be left, centre or right`);
    if (typeof row.rearLoad !== "boolean") throw new Error(`${label}: rear loading must be true or false`);
    if (!Array.isArray(row.lanes) || row.lanes.length < 1 || row.lanes.length > INDEPENDENT_ROWS_LIMITS.lanesPerRow)
      throw new Error(`${label}: enter one to ${INDEPENDENT_ROWS_LIMITS.lanesPerRow} lanes`);
    const lanes: IndependentLaneRequest[] = row.lanes.map((value, laneIndex) => {
      const laneLabel = `${label}, Lane ${laneIndex + 1}`;
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${laneLabel}: enter the can size and lane settings`);
      const lane = value as Record<string, unknown>;
      for (const key of Object.keys(lane)) if (!["canDiameter", "canHeight", "depth", "slope", "lipGap"].includes(key))
        throw new Error(`${laneLabel}: unsupported setting ${key}`);
      const number = (key: string, limitKey: string): number => {
        const number = lane[key], limit = LIMITS[limitKey];
        if (typeof number !== "number" || !Number.isFinite(number)) throw new Error(`${laneLabel}: ${limit.label} needs a number`);
        if (number < limit.min || number > limit.max)
          throw new Error(`${laneLabel}: ${limit.label} must be between ${limit.min} and ${limit.max} ${key === "slope" ? "degrees" : "mm"}`);
        return number;
      };
      return { canDiameter: number("canDiameter", "canD"), canHeight: number("canHeight", "canL"),
        depth: number("depth", "d"), slope: number("slope", "slope"), lipGap: number("lipGap", "lipGap") };
    });
    expandedRows += repeat; expandedLanes += repeat * lanes.length;
    return { lanes, repeat, rowHeight: dimension("rowHeight", "row height", LIMITS.h.max),
      rowSpan: dimension("rowSpan", "row span", LIMITS.w.max), alignment, rearLoad: row.rearLoad };
  });
  if (expandedRows > INDEPENDENT_ROWS_LIMITS.expandedRows) throw new Error(`Custom rows expand to more than ${INDEPENDENT_ROWS_LIMITS.expandedRows} rows; reduce repetition`);
  if (expandedLanes > INDEPENDENT_ROWS_LIMITS.expandedLanes) throw new Error(`Custom rows expand to more than ${INDEPENDENT_ROWS_LIMITS.expandedLanes} lanes; reduce rows, lanes or repetition`);
  return requests;
}

/** Read only the controls belonging to the independent-row contract. */
export function independentRowsOptionsFrom(field: (name: string) => string | null, rows: unknown): { space: Space; request: IndependentRowsBuildRequest } {
  const numbers: Record<string, number> = {};
  for (const key of ["w", "d", "h", "front", "bedX", "bedY", "bedZ", "hexR", "fit"])
    numbers[key] = parseFloat(String(field(key)));
  readNumbers(numbers);
  const design = field("design") as Design, pattern = field("pattern") as Pattern;
  if (!DESIGNS.includes(design)) throw new Error("design: pick Standard or Minimal");
  if (!PATTERNS.includes(pattern)) throw new Error("pattern: pick Hex, Circles, Kumiko, Slats or Breeze block");
  const checkbox = (key: string): boolean => {
    const value = field(key);
    if (value !== null && value !== "on" && value !== "off") throw new Error(`${key}: choose on or off`);
    return value === "on";
  };
  return { space: { w: numbers.w, d: numbers.d, h: numbers.h, front: numbers.front }, request: {
    shared: { base: "flat", wall: DEFAULTS.wall, clearance: DEFAULTS.clearance, fit: numbers.fit,
      hexR: numbers.hexR, hexAuto: checkbox("hexAuto"), solid: checkbox("solid"), design, pattern,
      bed: [numbers.bedX, numbers.bedY, numbers.bedZ], bedMargin: DEFAULTS.bedMargin },
    rows: independentRowsFrom(rows), shareCompatibleWalls: checkbox("rowsShareWalls"), topCover: checkbox("rowsTopCover"),
  } };
}
