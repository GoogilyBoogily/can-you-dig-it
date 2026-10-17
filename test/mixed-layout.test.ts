import { expect, test } from "bun:test";
import { DEFAULTS, K, type MixedBuildRequest, type MixedStackRequest } from "../src/model";
import { resolveMixedBuild, fitSpace, type Space } from "../src/solver";
import { assemblyPlacements, assemblyCans, mixedAssemblyPlacements, mixedAssemblyCans,
  mixedPartManifest, mixedPreviewCounts, PREVIEW_INSTANCE_LIMIT } from "../src/assembly";
import { mixedOptionsFrom, mixedStacksFrom, optionsFrom } from "../src/validate";

const SHELF: Space = { w: 600, d: 520, h: 400, front: 0 };
const STACKS: MixedStackRequest[] = [
  { canDiameter: 66, canHeight: 122.5, depth: 240, tiers: 1 },
  { canDiameter: 53, canHeight: 134, depth: 200, tiers: 2 },
];
const requestOf = (stacks = STACKS, shared: Partial<MixedBuildRequest["shared"]> = {}): MixedBuildRequest => ({
  shared: { ...DEFAULTS, base: "flat", cascade: false, cover: false, ...shared },
  stacks,
});

test("mixed shelf fitting keeps the ordered mix, exact depths and independent capacities", () => {
  const request = requestOf();
  const before = JSON.stringify(request);
  const layout = resolveMixedBuild(SHELF, request);
  // Widths are can lengths + 3.5 clearance + two 6 mm walls; one 3 mm gap.
  expect(layout.footprint).toEqual([290.5, 240, 166]);
  expect(layout.stacks.map((stack) => stack.cans)).toEqual([3, 6]);
  expect(layout.cans).toBe(9);
  expect(layout.stacks.map((stack) => stack.options.length)).toEqual([240, 200]);
  expect(layout.stacks.map((stack) => stack.options.tiers)).toEqual([1, 2]);
  expect(layout.stacks.map((stack) => stack.origin)).toEqual([[120, 0, 0], [100, 146.75, 0]]);
  expect(JSON.stringify(request)).toBe(before);
  expect(layout.stacks.every((stack) => stack.options.lanesWide === 1 && stack.options.left === "none" && stack.options.right === "none")).toBe(true);
});

test("a mixed organizer never shortens a depth or removes a mandatory stack to fit", () => {
  expect(() => resolveMixedBuild(SHELF, requestOf([{ ...STACKS[0], depth: 600 }, STACKS[1]]))).toThrow(/Stack 1: exact depth 600.*shelf/);
  const deeper = resolveMixedBuild({ ...SHELF, d: 600 }, requestOf([{ ...STACKS[0], depth: 600 }, STACKS[1]]));
  expect(deeper.stacks.map(stack => stack.derived.L)).toEqual([600, 200]);
  expect(deeper.stacks[0].derived.seams).toHaveLength(2);
  expect(() => resolveMixedBuild({ ...SHELF, d: 250, front: 20 }, requestOf())).toThrow(/Stack 1.*front gap/);
  expect(() => resolveMixedBuild({ ...SHELF, w: 298.49 }, requestOf())).toThrow(/All 2 stacks need 298.5/);
  expect(resolveMixedBuild({ ...SHELF, w: 298.5 }, requestOf()).stacks.length).toBe(2);
  expect(() => resolveMixedBuild({ ...SHELF, h: 150 }, requestOf([{ ...STACKS[0], tiers: 2 }, STACKS[1]]))).toThrow(/Stack 1.*requested 2 tiers/);
});

test("automatic tiers maximize each requested stack independently without changing fixed tiers", () => {
  const layout = resolveMixedBuild({ ...SHELF, h: 340 }, requestOf(STACKS.map((stack) => ({ ...stack, tiers: "auto" }))));
  expect(layout.stacks.map((stack) => stack.options.tiers)).toEqual([3, 4]);
  expect(layout.stacks.map((stack) => stack.height)).toEqual([288, 332]);
  const fixed = resolveMixedBuild({ ...SHELF, h: 340 }, requestOf([{ ...STACKS[0], tiers: 1 }, { ...STACKS[1], tiers: "auto" }]));
  expect(fixed.stacks.map((stack) => stack.options.tiers)).toEqual([1, 4]);
});

test("mixed rear loading is a constraint on automatic parity and fixed tiers", () => {
  const stacks: MixedStackRequest[] = [
    { ...STACKS[0], depth: 480, tiers: "auto" },
    { ...STACKS[1], depth: 360, tiers: "auto" },
  ];
  const layout = resolveMixedBuild(SHELF, requestOf(stacks, { cascade: true, rearLoad: true }));
  expect(layout.stacks.map((stack) => stack.options.tiers)).toEqual([3, 5]);
  expect(() => resolveMixedBuild(SHELF, requestOf([{ ...stacks[0], tiers: 2 }, stacks[1]], { cascade: true, rearLoad: true }))).toThrow(/Stack 1.*odd cascade tier count/);
  expect(() => resolveMixedBuild(SHELF, requestOf(stacks, { cascade: true, rearLoad: true, stackable: true }))).toThrow(/Stack 1.*stackable cascade top/);
  expect(() => resolveMixedBuild(SHELF, requestOf(STACKS, { cascade: true }))).toThrow(/two cascade tiers/);
  expect(resolveMixedBuild(SHELF, requestOf(STACKS, { rearLoad: true })).stacks.map((stack) => stack.options.tiers)).toEqual([1, 2]);
});

test("mixed shelf fitting rejects invalid host and print geometry before offering a build", () => {
  expect(() => resolveMixedBuild(SHELF, requestOf(STACKS, { wall: 5.5 }))).toThrow(/5.75 mm/);
  expect(() => resolveMixedBuild(SHELF, requestOf(STACKS, { base: "feet" as "flat" }))).toThrow(/flat base/);
  expect(resolveMixedBuild(SHELF, requestOf([{ ...STACKS[0], canHeight: 250 }, STACKS[1]], { bed: [300, 200, 300] })).stacks[0].derived.split).toBe(true);
  const rectangular = resolveMixedBuild(SHELF, requestOf([{ ...STACKS[0], canHeight: 250, depth: 480 }, STACKS[1]], { bed: [300, 200, 300] }));
  expect(rectangular.stacks[0].derived.L).toBe(480);
  expect(rectangular.stacks[0].derived.seams).toHaveLength(2);
  expect(() => resolveMixedBuild(SHELF, requestOf([{ ...STACKS[0], canHeight: 300, depth: 480 }, STACKS[1]], { bed: [300, 200, 300] }))).toThrow(/Stack 1.*neither orientation/);
  expect(() => resolveMixedBuild({ ...SHELF, d: 600 }, requestOf([{ ...STACKS[0], depth: 480 }, STACKS[1]], { slope: 10, bed: [256, 256, 50] }))).toThrow(/Stack 1.*taller/);
});

test("boundary splines fill the shared channel with only the two specified end clearances", () => {
  for (const fit of [-0.2, 0, 0.3]) {
    const layout = resolveMixedBuild(SHELF, requestOf(STACKS, { fit }));
    const connection = layout.connections[0];
    expect(connection.firstStackIndex).toBe(0);
    expect(connection.secondStackIndex).toBe(1);
    expect(connection.endFromFront).toBe(182);
    expect(connection.startFromFront).toBeCloseTo(14.25 + fit, 10);
    expect(connection.segmentCount).toBe(5);
    expect(connection.segmentLength).toBeLessThanOrEqual(40);
    expect(connection.startFromFront + connection.segmentCount * connection.segmentLength).toBeCloseTo(182 - (0.25 + fit), 10);
    const placements = [...mixedAssemblyPlacements(layout)].filter((placement) => placement.name === "connection-1-spline");
    expect(placements.length).toBe(5);
    for (let segment = 0; segment < 5; segment++)
      expect(placements[segment].pose.translate[0]).toBeCloseTo(connection.startFromFront + segment * connection.segmentLength, 10);
  }
});

test("mixed manifests, standing instances and source quantities agree for both tier styles", () => {
  for (const cascade of [false, true]) for (const tiers of [2, 3, 5, 6]) {
    const layout = resolveMixedBuild({ ...SHELF, h: 1000 }, requestOf(STACKS.map((stack) => ({ ...stack, depth: 360, tiers })), { cascade }));
    const descriptors = mixedPartManifest(layout);
    const counts = new Map<string, number>();
    for (const placement of mixedAssemblyPlacements(layout)) counts.set(placement.name, (counts.get(placement.name) ?? 0) + 1);
    expect(new Map(descriptors.map((descriptor) => [descriptor.name, descriptor.qty]))).toEqual(counts);
    expect(new Set(descriptors.map((descriptor) => descriptor.name)).size).toBe(descriptors.length);
    expect(descriptors.filter((descriptor) => descriptor.source.kind === "stack" && descriptor.source.connection).length).toBe(4); // two split facing walls
    const perStack = layout.stacks.map((stack) => [...assemblyPlacements(stack.options, stack.derived)]);
    const placed = [...mixedAssemblyPlacements(layout)];
    let offset = 0;
    for (const [stackIndex, expected] of perStack.entries()) {
      const origin = layout.stacks[stackIndex].origin;
      for (const [index, placement] of expected.entries()) {
        expect(placed[offset + index].pose.rotate).toEqual(placement.pose.rotate);
        expect(placed[offset + index].pose.translate).toEqual([placement.pose.translate[0] + origin[0], placement.pose.translate[1] + origin[1], placement.pose.translate[2] + origin[2]]);
      }
      offset += expected.length;
    }
  }
});

test("facing flat bottom wall sources never replace the same walls on upper tiers", () => {
  const layout = resolveMixedBuild({ ...SHELF, h: 600 }, requestOf(STACKS.map((stack) => ({ ...stack, tiers: 3 })), { cover: true }));
  const descriptors = mixedPartManifest(layout);
  for (const [stackIndex, plate] of ["wall-left-closed", "wall-right-closed"].entries()) {
    const walls = descriptors.filter((descriptor) => descriptor.source.kind === "stack"
      && descriptor.source.stackIndex === stackIndex && descriptor.source.source.plate === plate);
    expect(walls.length).toBe(2);
    expect(walls.filter((wall) => wall.source.kind === "stack" && wall.source.connection).map((wall) => wall.qty)).toEqual([1]);
    expect(walls.filter((wall) => wall.source.kind === "stack" && !wall.source.connection).map((wall) => wall.qty)).toEqual([2]);
    expect(walls[0].name).not.toBe(walls[1].name);
  }
});

test("mixed can positions stay lazy and share the ordinary per-stack queue", () => {
  const layout = resolveMixedBuild(SHELF, requestOf());
  const positions = [...mixedAssemblyCans(layout)];
  expect(positions.length).toBe(9);
  expect(positions.map((position) => position.stackIndex)).toEqual([0, 0, 0, 1, 1, 1, 1, 1, 1]);
  let index = 0;
  for (const stack of layout.stacks) for (const expected of assemblyCans(stack.options, stack.derived)) {
    expect(positions[index++].pose.translate).toEqual([expected.pose.translate[0] + stack.origin[0], expected.pose.translate[1] + stack.origin[1], expected.pose.translate[2] + stack.origin[2]]);
  }
  expect(mixedPartManifest(layout).reduce((total, part) => total + part.qty, 0)).toBe(20);
});

test("mixed previews apply one allocation bound across all eight stacks and their parts", () => {
  const stacks: MixedStackRequest[] = Array.from({ length: 8 }, () => ({ canDiameter: 20, canHeight: 40, depth: 1900, tiers: "auto" }));
  const layout = resolveMixedBuild({ w: 2000, d: 2000, h: 2000, front: 0 }, requestOf(stacks, { slope: 0, bed: [1000, 1000, 1000] }));
  const counts = mixedPreviewCounts(layout);
  expect(counts.cans).toBeGreaterThan(PREVIEW_INSTANCE_LIMIT);
  expect(counts.sampled).toBe(true);
  const descriptors = mixedPartManifest(layout);
  const allocated = descriptors.reduce((total, descriptor) => total + Math.ceil(descriptor.qty / counts.stride), 0)
    + layout.stacks.reduce((total, stack) => total + Math.ceil(stack.cans / counts.stride), 0);
  expect(allocated).toBeLessThanOrEqual(PREVIEW_INSTANCE_LIMIT);
  expect(counts.parts).toBe(descriptors.reduce((total, descriptor) => total + descriptor.qty, 0));
  expect(layout.cans).toBe(counts.cans);
});

const FORM: Record<string, string> = {
  w: "600", d: "520", h: "400", front: "0", canD: "66", canL: "122.5", bedX: "256", bedY: "256", bedZ: "256",
  hexR: "13", slope: "3", lipGap: "5", fit: "0", design: "standard", pattern: "hex", base: "flat", across: "centre", along: "centre",
  cover: "on", hexAuto: "on", left: "tongue", right: "socket",
};
const fieldOf = (over: Record<string, string | null> = {}) => (name: string) => Object.hasOwn(over, name) ? over[name] : FORM[name] ?? null;

test("mixed parsing ignores hidden legacy can values while validating the actual rows", () => {
  const parsed = mixedOptionsFrom(fieldOf({ canD: "invalid", canL: null, cascade: null }), STACKS);
  expect(parsed.request.shared.cascade).toBe(false);
  expect(Object.hasOwn(parsed.request.shared, "canD")).toBe(false);
  expect(Object.hasOwn(parsed.request.shared, "canL")).toBe(false);
  expect(parsed.request.stacks).toEqual(STACKS);
  expect(() => optionsFrom(fieldOf({ canD: "invalid" }))).toThrow(/can diameter/);
  expect(() => mixedOptionsFrom(fieldOf({ canD: "invalid" }), [{ ...STACKS[0], canDiameter: NaN }, STACKS[1]])).toThrow(/Stack 1.*can diameter/);
  expect(() => mixedOptionsFrom(fieldOf({ w: "invalid" }), STACKS)).toThrow(/shelf width/);
  expect(() => mixedOptionsFrom(fieldOf({ base: "feet" }), STACKS)).toThrow(/flat base/);
  expect(mixedOptionsFrom(fieldOf({ cascade: "on" }), STACKS).request.shared.cascade).toBe(true);
});

test("mixed row validation rejects malformed links, missing dimensions and noninteger tiers", () => {
  for (const invalid of [null, {}, [], [STACKS[0]], Array.from({ length: 9 }, () => STACKS[0])])
    expect(() => mixedStacksFrom(invalid)).toThrow(/two to eight stacks/);
  for (const invalid of [NaN, Infinity, "66", 0, 201])
    expect(() => mixedStacksFrom([{ ...STACKS[0], canDiameter: invalid }, STACKS[1]])).toThrow(/Stack 1.*can diameter/);
  for (const tiers of [0, -1, 1.5, Infinity, "2", undefined])
    expect(() => mixedStacksFrom([STACKS[0], { ...STACKS[1], tiers }])).toThrow(/Stack 2.*tiers/);
  expect(() => mixedStacksFrom([STACKS[0], null])).toThrow(/Stack 2/);
});

test("uniform shelf fitting retains ranked alternatives and offers depths beyond the old two-piece cap", () => {
  const layouts = fitSpace({ w: 300, d: 600, h: 240, front: 0 }, DEFAULTS, { cascade: true });
  expect(layouts.length).toBeGreaterThan(1);
  expect(layouts[0].style).toBe("cascade");
  expect(layouts.some((layout) => layout.style === "flat")).toBe(true);
  expect(layouts.every((layout) => layout.derived.L <= 600)).toBe(true);
  expect(layouts.some(layout => layout.derived.L > 484)).toBe(true);
});
