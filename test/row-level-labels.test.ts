import { expect, test } from "bun:test";
import { DEFAULTS, type IndependentRowRequest } from "../src/model";
import { resolveIndependentRows } from "../src/rows";

function row(overrides: Partial<IndependentRowRequest> = {}): IndependentRowRequest {
  return { lanes: [{ canDiameter: 66, canHeight: 122.5, depth: 240, slope: 3, lipGap: 5 }],
    repeat: 1, rowHeight: "auto", rowSpan: "auto", alignment: "centre", rearLoad: false, ...overrides };
}
const shelf = { w: 600, d: 600, h: 500, front: 0 };
const shared = { ...DEFAULTS, base: "flat" as const };

test("resolved height errors identify the editor row after earlier row repetition", () => {
  expect(() => resolveIndependentRows(shelf, { shared, rows: [row({ repeat: 2 }), row({ rowHeight: 1 })],
    shareCompatibleWalls: false, topCover: true })).toThrow("Level 3 (Row 2): row height 1 mm");
});

test("transition errors identify both physical levels and the repeated editor copy", () => {
  const upper = row(); upper.lanes[0].depth = 250;
  expect(() => resolveIndependentRows(shelf, { shared, rows: [row({ repeat: 2 }), upper],
    shareCompatibleWalls: false, topCover: true }))
    .toThrow("Levels 2 → 3 (Row 1, copy 2 of 2 → Row 2): different row depths");
});

test("sharing diagnostics identify expanded levels separately from editor row numbers", () => {
  const request = { shared, rows: [row({ repeat: 2,
    lanes: [row().lanes[0], { ...row().lanes[0], canDiameter: 53 }] })],
    shareCompatibleWalls: true, topCover: true };
  const layout = resolveIndependentRows(shelf, request);
  expect(layout.warnings.some(warning => warning.startsWith("Level 1 (Row 1, copy 1 of 2):"))).toBe(true);
  expect(layout.warnings.some(warning => warning.startsWith("Level 2 (Row 1, copy 2 of 2):"))).toBe(true);
  expect(() => resolveIndependentRows({ ...shelf, w: 50 }, request))
    .toThrow("Level 2 (Row 1, copy 2 of 2), lanes 1 and 2:");
});
