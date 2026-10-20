import { expect, test } from "bun:test";
import { parseDepositedSegments, depositionAtMaterialHeight, distanceToSegment } from "../prototypes/toolpath-deposition";

const header = ["; extruder_offset = 0x2", "G90", "M83", "; FEATURE: Outer wall"];
const layer = (height: number, thickness = 0.2) => [`; Z_HEIGHT: ${height}`, `; LAYER_HEIGHT: ${thickness}`];
const parse = (commands: string[]) => parseDepositedSegments([...header, ...commands].join("\n"), "fixture");

test("material probes use each actual deposited slab rather than XY coverage from another layer", () => {
  const segments = parse([
    ...layer(0.2), "G0 X0 Y0 Z0.2", "G1 X10 E1",
    ...layer(0.4), "G0 X20 Y0 Z0.4", "G1 X30 E1",
  ]);
  expect(depositionAtMaterialHeight(segments, 0.1).map(segment => segment.start)).toEqual([[0, 2]]);
  expect(depositionAtMaterialHeight(segments, 0.3).map(segment => segment.start)).toEqual([[20, 2]]);
  expect(depositionAtMaterialHeight(segments, 0.2).map(segment => segment.start)).toEqual([[0, 2]]);
  expect(depositionAtMaterialHeight(segments, 0.4).map(segment => segment.start)).toEqual([[20, 2]]);
  expect(depositionAtMaterialHeight(segments, 0.5)).toHaveLength(0);
});

test("a Z hop and extrusion at the wrong nozzle height cannot qualify tagged material", () => {
  const segments = parse([...layer(0.4), "G0 X0 Y0 Z0.8", "G1 X10 E1"]);
  expect(segments).toHaveLength(1);
  expect(depositionAtMaterialHeight(segments, 0.3)).toHaveLength(0);
});

test("retraction, travel and extrusion-only commands cannot count as functional bead coverage", () => {
  const segments = parse([...layer(0.4), "G0 X0 Y0 Z0.4", "G1 X10 E-1", "G0 X20", "G1 E1", "G1 X30 E1"]);
  expect(segments.map(segment => [segment.start, segment.end])).toEqual([[[20, 2], [30, 2]]]);
});

test("absolute extrusion reset and nondepositing arc endpoints remain correct above the first layer", () => {
  const segments = parse([...layer(0.6), "M82", "G92 E10", "G0 X0 Y0 Z0.6",
    "G3 X2 Y0 I1 J0 E10", "G1 X3 E11"]);
  expect(segments.map(segment => segment.start)).toEqual([[2, 2]]);
  expect(depositionAtMaterialHeight(segments, 0.5)).toHaveLength(1);
});

test("upper-layer clockwise arcs follow their curve with restored extruder offsets", () => {
  const segments = parse([...layer(0.6), "G0 X-1 Y-1 Z0.6", "G2 X1 Y-1 I1 J0 E1"]);
  const upper = depositionAtMaterialHeight(segments, 0.5);
  expect(upper.length).toBeGreaterThan(100);
  expect(Math.min(...upper.map(segment => distanceToSegment([0, 2], segment)))).toBeLessThan(0.0001);
});

test("first-layer clipping preserves depositing linear Z transitions", () => {
  const segments = parseDepositedSegments([...header, "G0 X0 Y0 Z0.1", "G1 X10 Z0.3 E1"].join("\n"), "fixture", [0, 0.2001]);
  expect(segments).toHaveLength(1);
  expect(segments[0].end[0]).toBeCloseTo(5.005, 6);
  expect(segments[0].height).toBeCloseTo(0.2001, 6);
});

test("actual variable layer thickness determines the deposited interval", () => {
  const segments = parse([...layer(0.5, 0.1), "G0 X0 Y0 Z0.5", "G1 X10 E1"]);
  expect(depositionAtMaterialHeight(segments, 0.45)).toHaveLength(1);
  expect(depositionAtMaterialHeight(segments, 0.35)).toHaveLength(0);
});

test("custom starts, brim and support do not qualify functional material", () => {
  const segments = parse([...layer(0.2), "G0 X0 Y0 Z0.2", "; FEATURE: Brim", "G1 X10 E1",
    "; FEATURE: Support", "G1 X20 E1", "; FEATURE: Custom", "G1 X30 E1"]);
  expect(depositionAtMaterialHeight(segments, 0.1)).toHaveLength(0);
});

test("missing layer metadata cannot establish upper-layer coverage", () => {
  expect(depositionAtMaterialHeight(parse(["G0 X0 Y0 Z0.4", "G1 X10 E1"]), 0.3)).toHaveLength(0);
});

test("invalid layer metadata and unsupported coordinate resets fail explicitly", () => {
  expect(() => parse(["; LAYER_HEIGHT: invalid"])).toThrow("invalid LAYER_HEIGHT");
  expect(() => parse(["G92 Z0"])).toThrow("unsupported coordinate reset");
});
