import { expect, test } from "bun:test";
import { DEFAULTS, type IndependentLaneRequest, type IndependentRowRequest,
  type IndependentRowsBuildRequest } from "../src/model";
import { solve, check } from "../src/geometry";
import { coverThicknessOf, snapTop } from "../src/features/joints";
import { resolveIndependentRows } from "../src/rows";
import { resolveMixedBuild } from "../src/solver";
import { buildMixedGeometry } from "../src/mixed-geometry";
import { mixedAssemblyPlacements } from "../src/assembly";
import { stand } from "../src/features/pose";
import { geo, overhangArea } from "./geo";

const SHELF = { w: 600, d: 600, h: 500, front: 0 };
const LANE: IndependentLaneRequest = { canDiameter: 66, canHeight: 122.5, depth: 240, slope: 3, lipGap: 5 };
const rowOf = (lanes: IndependentLaneRequest[] = [LANE], overrides: Partial<IndependentRowRequest> = {}): IndependentRowRequest => ({
  lanes, repeat: 1, rowHeight: "auto", rowSpan: "auto", alignment: "centre", rearLoad: false, ...overrides,
});
const requestOf = (rows: IndependentRowRequest[], overrides: Partial<IndependentRowsBuildRequest> = {}): IndependentRowsBuildRequest => ({
  shared: { ...DEFAULTS, base: "flat" }, rows, shareCompatibleWalls: false, topCover: true, ...overrides,
});

test("independent singleton is a real single lane without changing the old mixed minimum", () => {
  const layout = resolveIndependentRows(SHELF, requestOf([rowOf()]));
  expect(layout.rows).toHaveLength(1);
  expect(layout.rows[0].layout.stacks).toHaveLength(1);
  expect(layout.rows[0].lanes === layout.rows[0].layout.stacks).toBe(true);
  expect(layout.rows[0].origin).toEqual([0, 0, 0]);
  expect(layout.rows[0].lanes[0].origin).toEqual([120, 0, 0]);
  expect(layout.rows[0].height).toBe(96);
  expect(layout.cans).toBe(3);
  expect(layout.transitions).toEqual([]);
  expect(layout.footprint).toEqual([138, 240, 96 + coverThicknessOf(DEFAULTS)]);
  expect(() => resolveMixedBuild(SHELF, { shared: { ...DEFAULTS, base: "flat" },
    stacks: [{ canDiameter: 66, canHeight: 122.5, depth: 240, tiers: 1 }] })).toThrow(/two to eight/);
});

test("row height padding leaves each requested can, deck and queue unchanged", () => {
  const lanes = [{ ...LANE, canDiameter: 20, slope: 0, lipGap: 0 }, { ...LANE, slope: 0, lipGap: 0 }];
  const request = requestOf([rowOf(lanes)], { topCover: false });
  const before = JSON.stringify(request);
  const layout = resolveIndependentRows(SHELF, request), row = layout.rows[0];
  expect(row.minimumHeight).toBe(90);
  expect(row.height).toBe(90);
  expect(row.lanes.map(lane => lane.naturalHeight)).toEqual([44, 90]);
  expect(row.lanes.map(lane => lane.heightPadding)).toEqual([46, 0]);
  expect(row.lanes.map(lane => lane.options.canD)).toEqual([20, 66]);
  expect(row.lanes.map(lane => lane.derived.H)).toEqual([90, 90]);
  expect(row.lanes.map(lane => lane.derived.dhi)).toEqual([4, 4]);
  expect(row.lanes.map(lane => lane.cans)).toEqual([10, 3]);
  expect(row.lanes[0].derived.hexR).toBeGreaterThan(solve(row.lanes[0].options).hexR);
  expect(layout.footprint[2]).toBe(90);
  expect(JSON.stringify(request)).toBe(before);
});

test("an explicit fractional row height is respected and insufficient height fails", () => {
  const layout = resolveIndependentRows(SHELF, requestOf([rowOf([LANE], { rowHeight: 100.5 })]));
  expect(layout.rows[0].height).toBe(100.5);
  expect(layout.rows[0].lanes[0].derived.H).toBe(100.5);
  expect(layout.rows[0].lanes[0].heightPadding).toBe(4.5);
  expect(() => resolveIndependentRows(SHELF, requestOf([rowOf([LANE], { rowHeight: 95.999 })]))).toThrow(/below the required 96/);
});

test("height-padded row walls and covers occupy the resolved physical planes", () => geo.arena(() => {
  const lanes = [{ ...LANE, canDiameter: 20, slope: 0, lipGap: 0 }, { ...LANE, slope: 0, lipGap: 0 }];
  const row = resolveIndependentRows(SHELF, requestOf([rowOf(lanes)])).rows[0];
  const parts = buildMixedGeometry(geo, row.layout), catalogue = new Map(parts.map(part => [part.name, part.mesh]));
  for (const part of parts) {
    expect(part.mesh.status(), part.name).toBe("NoError");
    expect(part.mesh.decompose().length, part.name).toBe(1);
    expect(overhangArea(part.mesh), part.name).toBeLessThan(1e-6);
  }
  const placed = [...mixedAssemblyPlacements(row.layout)].map(placement => ({
    name: placement.name, mesh: stand(catalogue.get(placement.name)!, placement.pose),
  }));
  const walls = placed.filter(part => part.name.includes("wall-left") || part.name.includes("wall-right"));
  expect(walls).toHaveLength(4);
  for (const wall of walls) expect(wall.mesh.boundingBox().max[2], wall.name).toBeCloseTo(90 + snapTop(DEFAULTS), 7);
  expect(Math.max(...placed.map(part => part.mesh.boundingBox().max[2]))).toBeCloseTo(row.layout.footprint[2], 7);
}));

test("minimum wall height is applied before section and pattern derivation", () => {
  const options = { ...DEFAULTS, length: 480, cascade: false, tiers: 1, lanesWide: 1,
    left: "none" as const, right: "none" as const, bed: [256, 160, 256] as [number, number, number] };
  const natural = solve(options), padded = solve(options, 200);
  expect(solve(options, 0)).toEqual(natural);
  expect(natural.seams).toEqual([0]);
  expect(padded.seams).toEqual([-120, 0, 120]);
  expect(padded.pinPositions).toEqual([-195, -60, 60, 195]);
  expect(padded.H).toBe(200);
  expect(padded.Hb).toBe(200);
  expect(padded.plateY).toBe(200 + snapTop(options));
  expect([padded.n, padded.dhi, padded.OW, padded.tan]).toEqual([natural.n, natural.dhi, natural.OW, natural.tan]);
  expect(check(options, padded)).toEqual([]);
  for (const height of [-1, NaN, Infinity]) expect(() => solve(options, height)).toThrow(/finite and nonnegative/);
});

test("single physical rows can reuse existing compatible shared walls", () => {
  const layout = resolveIndependentRows(SHELF, requestOf([rowOf([LANE, { ...LANE, canHeight: 134 }])], { shareCompatibleWalls: true }));
  expect(layout.rows[0].layout.boundaries?.map(boundary => boundary.kind)).toEqual(["shared"]);
  expect(layout.rows[0].layout.connections).toEqual([]);
  expect(layout.rows[0].span).toBe(281.5);
  expect(layout.footprint[0]).toBe(281.5);
});

test("independent rows charge actual side clearance at the shelf boundary", () => {
  const request = requestOf([rowOf([LANE, LANE])]);
  expect(resolveIndependentRows({ ...SHELF, w: 287 }, request).footprint[0]).toBe(279);
  expect(() => resolveIndependentRows({ ...SHELF, w: 286.999 }, request)).toThrow(/287.0 mm/);
});

test("different depths within a row and unconnected spread-only rows fail explicitly", () => {
  expect(() => resolveIndependentRows(SHELF, requestOf([rowOf([LANE, { ...LANE, depth: 239 }])]))).toThrow(/common depth/);
  expect(() => resolveIndependentRows(SHELF, requestOf([rowOf([LANE, LANE], { rowSpan: 300 })]))).toThrow(/real carrier/);
  expect(() => resolveIndependentRows(SHELF, requestOf([rowOf([LANE], { rowSpan: 137.9 })]))).toThrow(/smaller than/);
});

test("singleton span margins reserve space without inventing supporting walls", () => {
  const layout = resolveIndependentRows(SHELF, requestOf([rowOf([LANE], { rowSpan: 200 })]));
  expect(layout.rows[0].span).toBe(200);
  expect(layout.rows[0].layout.footprint[0]).toBe(138);
  expect(layout.rows[0].layout.stacks).toHaveLength(1);
  expect(layout.footprint[0]).toBe(200);
});

test("explicit row repetition creates exactly the requested copies and real transitions", () => {
  const layout = resolveIndependentRows(SHELF, requestOf([rowOf([LANE], { repeat: 2 })]));
  expect(layout.rows.map(row => [row.requestIndex, row.repeatIndex])).toEqual([[0, 0], [0, 1]]);
  expect(layout.rows.map(row => row.lanes.length)).toEqual([1, 1]);
  expect(layout.transitions).toHaveLength(1);
  expect(layout.rows[1].origin[2]).toBeCloseTo(96 + 8.1 + 6, 10);
  expect(layout.rows[0].lanes[0].options).toMatchObject({ cover: false, stackable: true, cascade: false });
  expect(layout.rows[1].lanes[0].options).toMatchObject({ cover: true, stackable: false, cascade: false });
  expect(layout.cans).toBe(6);
});

test("row alignment moves actual upper supports within the common physical frame", () => {
  for (const [alignment, offset] of [["left", 33.75], ["centre", 0], ["right", -33.75]] as const) {
    const layout = resolveIndependentRows(SHELF, requestOf([
      rowOf([{ ...LANE, canHeight: 190 }]), rowOf([LANE], { alignment }),
    ]));
    expect(layout.rows[1].origin[1]).toBe(offset);
    expect(layout.transitions[0].shoes.map(shoe => shoe.y)).toEqual([offset - 66, offset + 66]);
    expect(layout.footprint[0]).toBe(223.5);
  }
});

test("a wide declared singleton span cannot support a wider upper arrangement", () => {
  const request = requestOf([rowOf([LANE], { rowSpan: 420 }), rowOf([LANE, LANE, LANE])]);
  expect(() => resolveIndependentRows(SHELF, request)).toThrow(/outside a supported panel/);
});

test("the reported two-wide lower and three-narrow upper rows retain exact requested sizes", () => {
  const depth = 279.4;
  const request = requestOf([
    rowOf(Array.from({ length: 2 }, () => ({ ...LANE, canHeight: 157, depth })), { rowSpan: 420 }),
    rowOf(Array.from({ length: 3 }, () => ({ ...LANE, depth }))),
  ], { shareCompatibleWalls: true });
  const layout = resolveIndependentRows({ w: 457.2, d: depth, h: 241, front: 0 }, request);
  expect(layout.rows.map(row => row.lanes.length)).toEqual([2, 3]);
  expect(layout.rows.map(row => row.height)).toEqual([96, 96]);
  expect(layout.rows[0].gaps).toEqual([75]);
  expect(layout.rows[0].lanes.map(lane => lane.options.canL)).toEqual([157, 157]);
  expect(layout.rows[1].lanes.map(lane => lane.options.canL)).toEqual([122.5, 122.5, 122.5]);
  expect(layout.rows[0].layout.connections).toEqual([]);
  expect(layout.rows[1].layout.connections).toHaveLength(2);
  expect(layout.rows.flatMap(row => row.layout.boundaries ?? []).every(boundary => boundary.kind === "retained")).toBe(true);
  expect(layout.transitions).toHaveLength(1);
  expect(layout.transitions[0].carrierThickness).toBe(8.1);
  expect(layout.transitions[0].shoeHeight).toBe(6);
  expect(layout.rows[1].origin[2]).toBeCloseTo(110.1, 10);
  expect(layout.footprint[0]).toBe(438);
  expect(layout.footprint[2]).toBeCloseTo(212.73301270189222, 8);
  expect(layout.cans).toBe(15);
});
