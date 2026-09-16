// The app's whole job is answering "does this fit?". These tests pin the cases
// where it used to answer yes when the honest answer is no.
import { test, expect } from "bun:test";
import { DEFAULTS, solve, check, type Options } from "../src/geometry";
import { fitSpace } from "../src/solver";
import { pack, bboxOf, type MeshData } from "../src/export";

const SHELF = { w: 600, d: 600, h: 500 };

test("a shelf narrower than one lane offers nothing", () => {
  const pitch = solve(DEFAULTS).gangPitch;
  const layouts = fitSpace({ ...SHELF, w: Math.floor(pitch) - 20 }, DEFAULTS, { cascade: true });
  expect(layouts).toEqual([]);
});

test("a lane is never deeper than the shelf it goes on", () => {
  const layouts = fitSpace({ ...SHELF, d: 150 }, DEFAULTS, { cascade: true });
  for (const layout of layouts) expect(layout.footprint[1]).toBeLessThanOrEqual(150);
});

test("every offered layout fits the space it was asked about", () => {
  for (const space of [{ w: 300, d: 520, h: 240 }, { w: 100, d: 600, h: 500 }, { w: 600, d: 150, h: 500 }, { w: 1000, d: 700, h: 900 }]) {
    for (const layout of fitSpace(space, DEFAULTS, { cascade: true })) {
      expect(layout.footprint[0], `width for ${JSON.stringify(space)}`).toBeLessThanOrEqual(space.w);
      expect(layout.footprint[1], `depth for ${JSON.stringify(space)}`).toBeLessThanOrEqual(space.d);
      expect(layout.footprint[2], `height for ${JSON.stringify(space)}`).toBeLessThanOrEqual(space.h);
    }
  }
});

test("check() rejects a lane that fits neither bed orientation", () => {
  const options: Options = { ...DEFAULTS, bed: [300, 200, 300], bedMargin: 3, canL: 250, canD: 66, length: 480 };
  const derived = solve(options);
  expect(check(options, derived).some((warning) => warning.startsWith("FAIL"))).toBe(true);
});

test("check() rejects a lane taller than the printer", () => {
  const options: Options = { ...DEFAULTS, length: 1000, slope: 4, bed: [256, 256, 100] };
  const derived = solve(options);
  expect(check(options, derived).some((w) => w.startsWith("FAIL") && w.includes("taller"))).toBe(true);
});

// Z used to be measured against the raw bed height while X and Y both got their margin,
// so a lane could clear the check and then meet the gantry. One margin in Z, not two:
// the part sits on the bed, so only the headroom above it has to be kept clear.
test("the Z limit leaves the same headroom X and Y get at each edge", () => {
  const derived = solve({ ...DEFAULTS, bed: [256, 256, 256], bedMargin: 3 });
  expect(derived.usableZ).toBe(253);
  expect(derived.usableX).toBe(250);
});

test("check() rejects a lane that fits the bed height but not the margin", () => {
  // Hb is the tallest part; put the bed exactly at it so only the margin can reject it.
  const tallest = solve({ ...DEFAULTS, bedMargin: 4 }).Hb;
  const options: Options = { ...DEFAULTS, bed: [256, 256, tallest], bedMargin: 4 };
  const derived = solve(options);
  expect(derived.Hb).toBeGreaterThan(derived.usableZ);
  expect(check(options, derived).some((w) => w.startsWith("FAIL") && w.includes("taller"))).toBe(true);
});

test("pack() refuses a part that fits no plate rather than placing it off the bed", () => {
  const pos = new Float32Array([0, 0, 0, 400, 0, 0, 0, 400, 0]);
  const oversized: MeshData = { name: "too-big", pos, idx: new Uint32Array([0, 1, 2]), bbox: bboxOf(pos) };
  expect(() => pack([{ mesh: oversized, qty: 1 }], [256, 256, 256], 3, 6)).toThrow(/too-big/);
});

// Every user number funnels through one helper; bad values must die there.
import { readNumbers, LIMITS } from "../src/validate";

test("a finite in-range number passes through untouched", () => {
  expect(readNumbers({ canD: 66, canL: 122.5 })).toEqual({ canD: 66, canL: 122.5 });
});

test("NaN is rejected by name", () => {
  expect(() => readNumbers({ canD: NaN })).toThrow(/can diameter/i);
});

test("a zero or negative dimension is rejected", () => {
  expect(() => readNumbers({ canD: 0 })).toThrow(/can diameter/i);
  expect(() => readNumbers({ w: -5 })).toThrow(/width/i);
});

test("Infinity and absurd magnitudes are rejected", () => {
  expect(() => readNumbers({ w: Infinity })).toThrow(/width/i);
  expect(() => readNumbers({ w: 1e9 })).toThrow(/width/i);
});

test("every limit names a sane range", () => {
  for (const [key, limit] of Object.entries(LIMITS)) {
    expect(Number.isFinite(limit.min), key).toBe(true);
    expect(limit.max, key).toBeGreaterThan(limit.min);
    expect(limit.label, key).toBeTruthy();
  }
});

// The form's own defaults must survive validation, or the page dies on load.
test("the shipped defaults pass validation", () => {
  expect(() => readNumbers({
    w: 300, d: 520, h: 240, canD: 66, canL: 122.5, bedX: 256, bedY: 256, bedZ: 256, fit: 0,
  })).not.toThrow();
});

test("the fit slider's full range is accepted", () => {
  for (const fit of [-0.2, 0, 0.3]) expect(() => readNumbers({ fit })).not.toThrow();
});
