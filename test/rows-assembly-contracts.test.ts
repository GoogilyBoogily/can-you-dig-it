import { expect, test } from "bun:test";
import { DEFAULTS, type IndependentLaneRequest, type IndependentRowRequest,
  type IndependentRowsBuildRequest } from "../src/model";
import { resolveIndependentRows } from "../src/rows";
import { independentRowsPartManifest, independentRowsAssemblyPlacements,
  independentRowsAssemblyCans, independentRowsPreviewCounts, PREVIEW_INSTANCE_LIMIT } from "../src/assembly";
import { buildRowTransitionPart } from "../src/row-transition-geometry";
import { buildIndependentRowsGeometry } from "../src/rows-geometry";
import { queueGeometry } from "../src/queue";
import { geo } from "./geo";

const LANE: IndependentLaneRequest = { canDiameter: 66, canHeight: 122.5, depth: 240, slope: 3, lipGap: 5 };
const rowOf = (lanes: IndependentLaneRequest[], overrides: Partial<IndependentRowRequest> = {}): IndependentRowRequest => ({
  lanes, repeat: 1, rowHeight: "auto", rowSpan: "auto", alignment: "centre", rearLoad: false, ...overrides,
});
const requestOf = (rows: IndependentRowRequest[], overrides: Partial<IndependentRowsBuildRequest> = {}): IndependentRowsBuildRequest => ({
  shared: { ...DEFAULTS, base: "flat" }, rows, shareCompatibleWalls: false, topCover: true, ...overrides,
});
const SHELF = { w: 1000, d: 600, h: 1000, front: 0 };

test("repeated rows retain independent physical quantities while reusing transition sources", () => {
  const layout = resolveIndependentRows(SHELF, requestOf([rowOf([LANE], { repeat: 4 })]));
  const manifest = independentRowsPartManifest(layout), placements = [...independentRowsAssemblyPlacements(layout)];
  // Three uncovered five-piece rows, one six-piece top row, and three complete
  // transitions containing one carrier and two shoes each.
  const physicalCopies = 3 * 5 + 6 + 3 * (1 + 2);
  expect(manifest.reduce((count, part) => count + part.qty, 0)).toBe(physicalCopies);
  expect(placements).toHaveLength(physicalCopies);
  const transitionSources = manifest.filter(part => part.source.kind === "row-transition");
  expect(transitionSources).toHaveLength(3);
  expect(transitionSources.map(part => part.qty)).toEqual([3, 3, 3]);
  for (const descriptor of transitionSources) {
    if (descriptor.source.kind !== "row-transition") throw new Error("Expected transition source");
    expect(descriptor.source.transitionIndex).toBe(0);
    const copies = placements.filter(placement => placement.name === descriptor.name);
    expect(copies).toHaveLength(3);
    for (const [index, copy] of copies.entries()) {
      expect(copy.pose.translate[2]).toBeCloseTo(96 + index * 110.1, 8);
      expect(copy.push[2] - copies[0].push[2]).toBe(index * 40);
    }
  }
  const quantities = new Map<string, number>();
  for (const placement of placements) quantities.set(placement.name, (quantities.get(placement.name) ?? 0) + 1);
  expect(quantities).toEqual(new Map(manifest.map(part => [part.name, part.qty])));
});

test("upper crest receivers have separate wall sources while unchanged row decks remain shared", () => geo.arena(() => {
  const layout = resolveIndependentRows(SHELF, requestOf([rowOf([LANE], { repeat: 4 })], { topCover: false }));
  const manifest = independentRowsPartManifest(layout);
  const walls = manifest.filter(part => part.source.kind === "row-part" && part.source.source.kind === "stack"
    && part.source.source.source.kind === "lane" && part.source.source.source.plate === "wall-left-closed");
  expect(walls).toHaveLength(2);
  expect(walls.map(part => part.qty)).toEqual([1, 2]);
  expect(walls.map(part => part.source.kind === "row-part" ? part.source.rowIndex : -1)).toEqual([0, 1]);
  const decks = manifest.filter(part => part.source.kind === "row-part" && part.source.rowIndex === 0 && part.source.source.kind === "stack"
    && part.source.source.source.kind === "lane" && part.source.source.source.plate === "deck");
  expect(decks).toHaveLength(1);
  expect(decks[0].qty).toBe(3);
  const meshes = new Map(buildIndependentRowsGeometry(geo, layout).map(part => [part.name, part.mesh]));
  const bottom = meshes.get(walls[0].name)!, upper = meshes.get(walls[1].name)!;
  expect(geo.diff(bottom, [upper]).volume() + geo.diff(upper, [bottom]).volume()).toBeGreaterThan(.1);
}));

test("different upper support positions keep physically different carrier sources", () => geo.arena(() => {
  const wide = { ...LANE, canHeight: 190 };
  const layout = resolveIndependentRows(SHELF, requestOf([
    rowOf([wide]), rowOf([wide]), rowOf([LANE], { alignment: "left" }),
  ]));
  const carriers = independentRowsPartManifest(layout).filter(part => part.source.kind === "row-transition"
    && layout.transitions[part.source.transitionIndex].parts[part.source.partIndex].kind === "carrier");
  expect(carriers).toHaveLength(2);
  expect(carriers.map(part => part.qty)).toEqual([1, 1]);
  expect(carriers.map(part => part.source.kind === "row-transition" ? part.source.transitionIndex : -1)).toEqual([0, 1]);
  const meshes = layout.transitions.map(transition => {
    const partIndex = transition.parts.findIndex(part => part.kind === "carrier");
    return buildRowTransitionPart(geo, transition, partIndex, layout.rows[transition.lowerRowIndex].lanes[0].options);
  });
  // Only the upper arrangement changes. Its moved retaining slots make the
  // resulting printable carriers physically different, despite matching sizes.
  expect(geo.diff(meshes[0], [meshes[1]]).volume() + geo.diff(meshes[1], [meshes[0]]).volume()).toBeGreaterThan(1);
}));

test("reused ordinary row sources retain each row's distinct physical lane spacing", () => {
  const layout = resolveIndependentRows(SHELF, requestOf([
    rowOf([LANE, LANE], { rowSpan: 420 }), rowOf([LANE, LANE], { rowSpan: 300 }), rowOf([LANE]),
  ]));
  const manifest = independentRowsPartManifest(layout), placements = [...independentRowsAssemblyPlacements(layout)];
  const rightDeck = manifest.find(part => part.source.kind === "row-part" && part.source.rowIndex === 0
    && part.source.source.kind === "stack" && part.source.source.stackIndex === 0
    && part.source.source.source.kind === "lane" && part.source.source.source.plate === "deck");
  if (!rightDeck) throw new Error("Expected an explicit right deck source");
  expect(rightDeck.qty).toBe(2);
  const copies = placements.filter(placement => placement.name === rightDeck.name);
  expect(copies.map(copy => copy.pose.translate[1])).toEqual([-141, -81]);
  expect(copies[0].pose.translate[2]).toBe(0);
  expect(copies[1].pose.translate[2]).toBeCloseTo(110.1, 8);
  const canPositions = new Map<number, Set<number>>();
  for (const placement of independentRowsAssemblyCans(layout)) {
    const positions = canPositions.get(placement.stackIndex) ?? new Set<number>();
    positions.add(placement.pose.translate[1]); canPositions.set(placement.stackIndex, positions);
  }
  expect([...canPositions.values()].map(positions => [...positions])).toEqual([[-141], [141], [-81], [81], [0]]);
});

test("all eight transfer keys share one printable source and retain their separate stations", () => {
  const narrow = { ...LANE, depth: 279.4 }, wide = { ...narrow, canHeight: 157 };
  const layout = resolveIndependentRows(SHELF, requestOf([
    rowOf([wide, wide], { rowSpan: 420 }), rowOf([narrow, narrow, narrow]),
  ]));
  const keys = independentRowsPartManifest(layout).filter(part => part.source.kind === "row-transition"
    && layout.transitions[part.source.transitionIndex].parts[part.source.partIndex].kind === "key");
  expect(keys).toHaveLength(1);
  expect(keys[0].qty).toBe(2 * 2 * 2); // two bearing seams, two X bays, two keys per seam/bay
  const placements = [...independentRowsAssemblyPlacements(layout)].filter(part => part.name === keys[0].name);
  expect(placements).toHaveLength(8);
  const expectedStations = [19.7, 114.7, 164.7, 259.7].flatMap(x => [-40.5, 40.5].map(y => [x, y]));
  for (const [x, y] of expectedStations) expect(placements.some(placement =>
    Math.abs(placement.pose.translate[0] - x) < 1e-8 && Math.abs(placement.pose.translate[1] - y) < 1e-8)).toBe(true);
});

test("can batch indices and positions follow every independent row and its real can dimensions", () => {
  const layout = resolveIndependentRows(SHELF, requestOf([
    rowOf([{ ...LANE, canHeight: 190 }]), rowOf([{ ...LANE, canDiameter: 53 }]),
  ]));
  const placements = [...independentRowsAssemblyCans(layout)];
  expect(placements.map(placement => placement.stackIndex)).toEqual([0, 0, 0, 1, 1, 1, 1]);
  const canSpecifications = layout.rows.flatMap(row => row.lanes.map(lane => [lane.options.canD, lane.options.canL, lane.cans]));
  expect(canSpecifications).toEqual([[66, 190, 3], [53, 122.5, 4]]);
  let placementIndex = 0;
  for (const row of layout.rows) for (const lane of row.lanes) {
    const queue = queueGeometry(lane.options, lane.derived.L);
    for (let index = 0; index < queue.count; index++) {
      const [x, y, z] = queue.position(index), placement = placements[placementIndex++];
      expect(placement.pose.translate).toEqual([x + lane.origin[0] + row.origin[0],
        y + lane.origin[1] + row.origin[1], z + row.origin[2]]);
    }
  }
  expect(placementIndex).toBe(layout.cans);
});

test("an uncovered rear-loaded singleton builds only its four requested physical sources", () => geo.arena(() => {
  const layout = resolveIndependentRows(SHELF, requestOf([rowOf([LANE], { rearLoad: true })], { topCover: false }));
  const manifest = independentRowsPartManifest(layout), parts = buildIndependentRowsGeometry(geo, layout);
  expect(manifest).toHaveLength(4); // deck, two open-corner terminal walls, front lip
  expect(parts).toHaveLength(4);
  expect(parts.map(part => part.qty)).toEqual([1, 1, 1, 1]);
  for (const descriptor of manifest) {
    if (descriptor.source.kind !== "row-part" || descriptor.source.source.kind !== "stack")
      throw new Error("Expected an ordinary singleton source");
    expect(descriptor.source.source.source.kind).not.toBe("cover");
    expect(descriptor.source.source.source.plate).not.toBe("end-wall");
  }
  for (const part of parts) {
    expect(part.mesh.status(), part.name).toBe("NoError");
    expect(part.mesh.decompose().length, part.name).toBe(1);
  }
}));

test("one preview allocation bound covers a legal 128-lane repeated-row request without reducing export counts", () => {
  const lane = { ...LANE, canDiameter: 20, canHeight: 40, depth: 1970, slope: 0, lipGap: 0 };
  const row = rowOf(Array.from({ length: 8 }, () => lane), { repeat: 8 });
  const layout = resolveIndependentRows({ w: 2000, d: 2000, h: 2000, front: 0 }, requestOf([row, row], {
    shared: { ...DEFAULTS, base: "flat", bed: [1000, 1000, 1000] },
  }));
  const descriptors = independentRowsPartManifest(layout), preview = independentRowsPreviewCounts(layout);
  expect(layout.rows).toHaveLength(16);
  expect(layout.rows.reduce((count, row) => count + row.lanes.length, 0)).toBe(128);
  expect(preview.parts + preview.cans).toBeGreaterThan(PREVIEW_INSTANCE_LIMIT);
  expect(preview.sampled).toBe(true);
  const allocated = descriptors.reduce((count, descriptor) => count + Math.ceil(descriptor.qty / preview.stride), 0)
    + layout.rows.reduce((count, row) => count + row.lanes.reduce((laneCount, lane) => laneCount + Math.ceil(lane.cans / preview.stride), 0), 0);
  expect(allocated).toBeLessThanOrEqual(PREVIEW_INSTANCE_LIMIT);
  let physicalParts = 0, physicalCans = 0;
  for (const placement of independentRowsAssemblyPlacements(layout)) physicalParts++;
  for (const placement of independentRowsAssemblyCans(layout)) physicalCans++;
  expect(physicalParts).toBe(preview.parts);
  expect(physicalCans).toBe(preview.cans);
  expect(physicalCans).toBe(128 * 95);
});
