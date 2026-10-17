import { expect, test } from "bun:test";
import { DEFAULTS, type MixedBuildRequest, type MixedStackRequest } from "../src/model";
import { resolveMixedBuild } from "../src/solver";
import { mixedPartManifest } from "../src/assembly";
import { mixedOptionsFrom, mixedStacksFrom, optionsFrom } from "../src/validate";

const SHELF = { w: 600, d: 520, h: 400, front: 0 };
const LEGACY_STACKS: MixedStackRequest[] = [
  { canDiameter: 66, canHeight: 122.5, depth: 240, tiers: 1 },
  { canDiameter: 53, canHeight: 134, depth: 200, tiers: 2 },
];
const requestOf = (stacks: MixedStackRequest[], shared: Partial<MixedBuildRequest["shared"]> = {}): MixedBuildRequest => ({
  shared: { ...DEFAULTS, base: "flat", cascade: false, cover: false, ...shared }, stacks,
});

test("neighboring stacks resolve their own feed style, slope, headroom, cover and loading", () => {
  const stacks: MixedStackRequest[] = [
    { ...LEGACY_STACKS[0], cascade: false, slope: 0, lipGap: 0, cover: false, rearLoad: false, stackable: false },
    { ...LEGACY_STACKS[1], depth: 300, tiers: 3, cascade: true, slope: 4, lipGap: 8, cover: true, rearLoad: true, stackable: false },
  ];
  const layout = resolveMixedBuild(SHELF, requestOf(stacks, { cascade: true, slope: 7, lipGap: 2, cover: true, rearLoad: true, stackable: true }));
  expect(layout.stacks.map((stack) => stack.options)).toMatchObject([
    { cascade: false, slope: 0, lipGap: 0, cover: false, rearLoad: false, stackable: false, tiers: 1 },
    { cascade: true, slope: 4, lipGap: 8, cover: true, rearLoad: true, stackable: false, tiers: 3 },
  ]);
  // The flat tier needs 4 mm deck + 20 mm lip + 66 mm can. The cascade's
  // full 300 mm bottom run needs five cans; its 65 mm chute leaves four above.
  expect(layout.stacks[0].height).toBe(90);
  expect(layout.stacks[1].derived.Hb).toBe(86);
  expect(layout.stacks[1].derived.H).toBe(76);
  expect(layout.stacks.map((stack) => stack.cans)).toEqual([3, 13]);
  expect(layout.cans).toBe(16);
  const covers = mixedPartManifest(layout).filter((descriptor) => descriptor.source.kind === "stack" && descriptor.source.source.kind === "cover");
  expect(covers.every((descriptor) => descriptor.source.kind === "stack" && descriptor.source.stackIndex === 1)).toBe(true);
  expect(covers.reduce((total, descriptor) => total + descriptor.qty, 0)).toBe(2);
  expect(layout.request.stacks).toEqual(stacks);
});

test("old mixed rows keep omitted controls absent and inherit the carried shared settings", () => {
  const parsed = mixedStacksFrom(JSON.parse(JSON.stringify(LEGACY_STACKS)));
  expect(parsed).toEqual(LEGACY_STACKS);
  for (const row of parsed) for (const key of ["cascade", "slope", "lipGap", "cover", "rearLoad", "stackable"])
    expect(Object.hasOwn(row, key)).toBe(false);
  const layout = resolveMixedBuild(SHELF, requestOf(parsed, { cascade: false, slope: 2, lipGap: 9, cover: true, rearLoad: true, stackable: true }));
  for (const stack of layout.stacks)
    expect(stack.options).toMatchObject({ cascade: false, slope: 2, lipGap: 9, cover: true, rearLoad: true, stackable: true });
});

test("automatic tier counts use each row's style and rear-loading constraint", () => {
  const stacks: MixedStackRequest[] = [
    { ...LEGACY_STACKS[0], tiers: "auto", cascade: false, slope: 0, lipGap: 0, cover: false, rearLoad: false, stackable: false },
    { ...LEGACY_STACKS[1], depth: 300, tiers: "auto", cascade: true, slope: 4, lipGap: 8, cover: true, rearLoad: true, stackable: false },
  ];
  const layout = resolveMixedBuild({ ...SHELF, h: 340 }, requestOf(stacks));
  expect(layout.stacks.map((stack) => stack.options.tiers)).toEqual([3, 3]);
  expect(layout.stacks[0].height).toBe(270);
  // Four cascade tiers would fit geometrically but put the loading chute at the back.
  const frontLoaded = resolveMixedBuild({ ...SHELF, h: 340 }, requestOf([stacks[0], { ...stacks[1], rearLoad: false }]));
  expect(frontLoaded.stacks[1].options.tiers).toBe(4);
  expect(() => resolveMixedBuild(SHELF, requestOf([stacks[0], { ...stacks[1], tiers: 2 }]))).toThrow(/Stack 2.*odd cascade tier count/);
  expect(() => resolveMixedBuild(SHELF, requestOf([stacks[0], { ...stacks[1], stackable: true }]))).toThrow(/Stack 2.*stackable cascade top/);
});

test("a cover and lip headroom consume only the height of their own stack", () => {
  const stacks: MixedStackRequest[] = [
    { ...LEGACY_STACKS[0], cascade: false, slope: 0, lipGap: 0, cover: false },
    { ...LEGACY_STACKS[1], tiers: 1, cascade: false, slope: 0, lipGap: 0, cover: true },
  ];
  const layout = resolveMixedBuild({ ...SHELF, h: 90 }, requestOf(stacks, { cover: true, slope: 10, lipGap: 20 }));
  expect(layout.stacks[0].height).toBe(90);
  expect(layout.stacks[1].height).toBeGreaterThan(77);
  expect(layout.stacks[1].height).toBeLessThan(90);
  expect(layout.footprint[2]).toBe(90);
  expect(() => resolveMixedBuild({ ...SHELF, h: 90 }, requestOf([{ ...stacks[0], cover: true }, stacks[1]]))).toThrow(/Stack 1.*requested 1 tiers.*at most 0 fit/);
  expect(() => resolveMixedBuild({ ...SHELF, h: 90 }, requestOf([stacks[0], { ...stacks[1], lipGap: 20 }]))).toThrow(/Stack 2.*requested 1 tiers.*at most 0 fit/);
});

test("provided row controls are strict, bounded and retained without adding absent fields", () => {
  const row = { ...LEGACY_STACKS[0], cascade: false, slope: 0, lipGap: 20, cover: true, rearLoad: false, stackable: true };
  expect(mixedStacksFrom([row, LEGACY_STACKS[1]])).toEqual([row, LEGACY_STACKS[1]]);
  for (const key of ["cascade", "cover", "rearLoad", "stackable"]) for (const invalid of [0, 1, "true", "false", "on", null, undefined, {}, []])
    expect(() => mixedStacksFrom([LEGACY_STACKS[0], { ...LEGACY_STACKS[1], [key]: invalid }])).toThrow(/Stack 2.*true or false/);
  for (const key of ["slope", "lipGap"]) for (const invalid of [NaN, Infinity, "3", null, undefined, -1, 21])
    expect(() => mixedStacksFrom([LEGACY_STACKS[0], { ...LEGACY_STACKS[1], [key]: invalid }])).toThrow(/Stack 2.*(?:deck slope|lip headroom)/);
  expect(() => mixedStacksFrom([{ ...row, slope: 10, lipGap: 0 }, LEGACY_STACKS[1]])).not.toThrow();
  expect(() => mixedStacksFrom([{ ...row, slope: 10.1 }, LEGACY_STACKS[1]])).toThrow(/Stack 1.*deck slope/);
});

const FORM: Record<string, string> = {
  w: "600", d: "520", h: "400", front: "0", canD: "66", canL: "122.5", bedX: "256", bedY: "256", bedZ: "256",
  hexR: "13", slope: "3", lipGap: "5", fit: "0", design: "standard", pattern: "hex", base: "flat", across: "centre", along: "centre",
  cover: "on", hexAuto: "on", left: "tongue", right: "socket",
};
const fieldOf = (over: Record<string, string | null> = {}) => (name: string) => Object.hasOwn(over, name) ? over[name] : FORM[name] ?? null;

test("valid explicit rows ignore unused invalid hidden legacy slope and headroom", () => {
  const fields = fieldOf({ slope: "invalid", lipGap: "invalid" });
  const rows = LEGACY_STACKS.map((row, index) => ({ ...row, slope: index === 0 ? 0 : 3, lipGap: index === 0 ? 0 : 5 }));
  const parsed = mixedOptionsFrom(fields, rows);
  const layout = resolveMixedBuild(parsed.space, parsed.request);
  expect(layout.stacks.map((stack) => [stack.options.slope, stack.options.lipGap])).toEqual([[0, 0], [3, 5]]);
  expect(layout.request.stacks).toEqual(rows);
  expect(() => optionsFrom(fields)).toThrow(/deck slope/);
  const inheritedSlope = mixedOptionsFrom(fields, [rows[0], { ...LEGACY_STACKS[1], lipGap: 5 }]);
  expect(() => resolveMixedBuild(inheritedSlope.space, inheritedSlope.request)).toThrow(/Stack 2.*deck slope/);
  const inheritedHeadroom = mixedOptionsFrom(fields, [rows[0], { ...LEGACY_STACKS[1], slope: 3 }]);
  expect(() => resolveMixedBuild(inheritedHeadroom.space, inheritedHeadroom.request)).toThrow(/Stack 2.*lip headroom/);
});

test("old mixed links validate their inherited numeric controls with stack context", () => {
  const invalidSlope = mixedOptionsFrom(fieldOf({ slope: "11" }), LEGACY_STACKS);
  expect(() => resolveMixedBuild(invalidSlope.space, invalidSlope.request)).toThrow(/Stack 1.*deck slope/);
  const invalidHeadroom = mixedOptionsFrom(fieldOf({ lipGap: "21" }), LEGACY_STACKS);
  expect(() => resolveMixedBuild(invalidHeadroom.space, invalidHeadroom.request)).toThrow(/Stack 1.*lip headroom/);
  const inherited = mixedOptionsFrom(fieldOf(), LEGACY_STACKS);
  expect(resolveMixedBuild(inherited.space, inherited.request).stacks.map((stack) => [stack.options.slope, stack.options.lipGap])).toEqual([[3, 5], [3, 5]]);
});
