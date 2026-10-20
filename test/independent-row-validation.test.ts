import { expect, test } from "bun:test";
import { independentRowsFrom, independentRowsOptionsFrom } from "../src/validate";
import { INDEPENDENT_ROWS_LIMITS, type IndependentLaneRequest, type IndependentRowRequest } from "../src/model";

const lane: IndependentLaneRequest = { canDiameter: 66, canHeight: 157, depth: 279.4, slope: 3, lipGap: 5 };
const row: IndependentRowRequest = { lanes: [lane], repeat: 1, rowHeight: "auto", rowSpan: "auto", alignment: "centre", rearLoad: false };
const fields: Record<string, string> = { w: "457.2", d: "279.4", h: "241", front: "0", bedX: "256", bedY: "256", bedZ: "256",
  hexR: "13", fit: "0", design: "minimal", pattern: "hex", rowsTopCover: "on" };
const fieldOf = (overrides: Record<string, string | null> = {}) => (name: string) => Object.hasOwn(overrides, name) ? overrides[name] : fields[name] ?? null;

test("independent rows preserve singleton lanes, exact dimensions, canonical order and explicit repetition", () => {
  const request: IndependentRowRequest[] = [row, { ...row, lanes: [{ ...lane, canHeight: 122.5 }, { ...lane, canDiameter: 53, canHeight: 80 }], repeat: 2,
    rowHeight: 110, rowSpan: 420, alignment: "left", rearLoad: true }];
  const original = JSON.stringify(request), parsed = independentRowsFrom(request);
  expect(parsed).toEqual(request); expect(JSON.stringify(request)).toBe(original);
  expect(parsed[0]).not.toBe(request[0]); expect(parsed[0].lanes[0]).not.toBe(lane);
  expect(parsed.map(value => value.lanes.length)).toEqual([1, 2]);
  expect(parsed[1].lanes.map(value => value.canHeight)).toEqual([122.5, 80]);
});

test("row form ignores unrelated legacy column controls and has independent sharing/top-cover flags", () => {
  const parsed = independentRowsOptionsFrom(fieldOf({ canD: "bad", canL: "bad", slope: "bad", lipGap: "bad", base: "feet",
    cascade: "on", cover: "on", shareWalls: "on", rowsShareWalls: "on", rowsTopCover: null }), [row]);
  expect(parsed.space).toEqual({ w: 457.2, d: 279.4, h: 241, front: 0 });
  expect(parsed.request.rows).toEqual([row]); expect(parsed.request.shareCompatibleWalls).toBe(true); expect(parsed.request.topCover).toBe(false);
  expect(parsed.request.shared.base).toBe("flat");
  for (const key of ["canD", "canL", "cascade", "cover", "tiers", "stackable", "left", "right"])
    expect(Object.hasOwn(parsed.request.shared, key)).toBe(false);
  const defaults = independentRowsOptionsFrom(fieldOf(), [row]).request;
  expect(defaults.shareCompatibleWalls).toBe(false); expect(defaults.topCover).toBe(true);
  for (const name of ["rowsShareWalls", "rowsTopCover"]) for (const value of ["true", "false", "1", ""])
    expect(() => independentRowsOptionsFrom(fieldOf({ [name]: value }), [row])).toThrow(`${name}: choose on or off`);
});

test("row form validates actual shared dimensions and enum controls", () => {
  for (const [field, value, message] of [["w", "NaN", "shelf width"], ["bedX", "10", "bed X"], ["fit", "0.31", "fit"],
    ["design", "other", "design"], ["pattern", "other", "pattern"]])
    expect(() => independentRowsOptionsFrom(fieldOf({ [field]: value }), [row])).toThrow(message);
});

test("row input bounds are named, and total expansion is validated independently of each request", () => {
  for (const rows of [null, {}, [], Array.from({ length: INDEPENDENT_ROWS_LIMITS.requestedRows + 1 }, () => row)])
    expect(() => independentRowsFrom(rows)).toThrow("one to");
  for (const lanes of [null, [], Array.from({ length: INDEPENDENT_ROWS_LIMITS.lanesPerRow + 1 }, () => lane)])
    expect(() => independentRowsFrom([{ ...row, lanes }])).toThrow("Row 1: enter one to");
  for (const repeat of [0, -1, 1.5, NaN, Infinity, "2", INDEPENDENT_ROWS_LIMITS.repetitions + 1])
    expect(() => independentRowsFrom([{ ...row, repeat }])).toThrow("Row 1: repeat");
  expect(() => independentRowsFrom(Array.from({ length: 3 }, () => ({ ...row, repeat: 11 })))).toThrow("32 rows");
  expect(() => independentRowsFrom(Array.from({ length: 2 }, () => ({ ...row, repeat: 9, lanes: Array.from({ length: 8 }, () => lane) })))).toThrow("128 lanes");
  const maximum = independentRowsFrom(Array.from({ length: 4 }, () => ({ ...row, repeat: 8, lanes: Array.from({ length: 4 }, () => lane) })));
  expect(maximum.reduce((total, value) => total + value.repeat, 0)).toBe(32);
  expect(maximum.reduce((total, value) => total + value.repeat * value.lanes.length, 0)).toBe(128);
});

test("row and lane errors preserve their identity and never ignore legacy tiers or cascade", () => {
  for (const setting of [{ rowHeight: 0 }, { rowHeight: Infinity }, { rowHeight: "100" }, { rowSpan: -1 }, { rowSpan: 2000.1 },
    { alignment: "middle" }, { rearLoad: "on" }, { cascade: false }])
    expect(() => independentRowsFrom([row, { ...row, ...setting }])).toThrow("Row 2:");
  for (const setting of [{ canDiameter: NaN }, { canHeight: 401 }, { depth: "279.4" }, { slope: 10.1 }, { lipGap: -1 }, { tiers: 1 }, { cascade: false }])
    expect(() => independentRowsFrom([row, { ...row, lanes: [lane, { ...lane, ...setting }] }])).toThrow("Row 2, Lane 2:");
  const shortRow = independentRowsFrom([{ ...row, rowHeight: 42, rowSpan: 100 }]);
  expect(shortRow[0].rowHeight).toBe(42); expect(shortRow[0].rowSpan).toBe(100);
});
