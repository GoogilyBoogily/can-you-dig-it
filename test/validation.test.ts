// The app's whole job is answering "does this fit?". These tests pin the cases
// where it used to answer yes when the honest answer is no.
import { test, expect } from "bun:test";
import { DEFAULTS, K, solve, check, type Options } from "../src/geometry";
import { fitSpace } from "../src/solver";
import { pack, bboxOf, type MeshData } from "../src/export";

const SHELF = { w: 600, d: 600, h: 500, front: 40 };

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
  for (const space of [{ w: 300, d: 520, h: 240, front: 40 }, { w: 100, d: 600, h: 500, front: 0 }, { w: 600, d: 150, h: 500, front: 40 }, { w: 1000, d: 700, h: 900, front: 0 }]) {
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

// Z is a plate's own thickness, not the assembly's height: every plate prints lying down.
// The deck is the tall one because it carries the whole slope as a wedge.
test("check() rejects a plate taller than the printer", () => {
  const options: Options = { ...DEFAULTS, length: 1000, slope: 10, bed: [256, 256, 50] };
  const derived = solve(options);
  expect(derived.plateZ).toBeGreaterThan(derived.usableZ);
  expect(check(options, derived).some((w) => w.startsWith("FAIL") && w.includes("taller"))).toBe(true);
});

// The guard used to compare the assembled tier height against Z, which no part has printed
// at since the flat-pack. It cost a short-Z printer every layout it could actually make.
test("check() passes a tall lane whose plates all print flat", () => {
  const options: Options = { ...DEFAULTS, bed: [256, 256, 80] };
  const derived = solve(options);
  expect(derived.Hb).toBeGreaterThan(derived.usableZ);
  expect(derived.plateZ).toBeLessThan(derived.usableZ);
  expect(check(options, derived)).toEqual([]);
});

// A wall lies down to print, so its height becomes the bed's Y. Nothing else derives that,
// and a lane whose walls overhang the bed used to be offered and then fail in the packer.
test("plateY covers the laid wall, not just the deck", () => {
  const options: Options = { ...DEFAULTS, canD: 150, canL: 100, slope: 10, length: 464, bed: [250, 210, 400] };
  const derived = solve(options);
  expect(derived.plateY).toBe(Math.max(derived.H, derived.Hb) + K.pinH);
  expect(derived.plateY).toBeGreaterThan(derived.OW + K.dovetail);
  expect(check(options, derived).some((w) => w.startsWith("FAIL"))).toBe(true);
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
  // plateZ is the tallest part; put the bed exactly at it so only the margin can reject it.
  const tallest = solve({ ...DEFAULTS, bedMargin: 4 }).plateZ;
  const options: Options = { ...DEFAULTS, bed: [256, 256, tallest], bedMargin: 4 };
  const derived = solve(options);
  expect(derived.plateZ).toBeGreaterThan(derived.usableZ);
  expect(check(options, derived).some((w) => w.startsWith("FAIL") && w.includes("taller"))).toBe(true);
});

test("pack() refuses a part that fits no plate rather than placing it off the bed", () => {
  const pos = new Float32Array([0, 0, 0, 400, 0, 0, 0, 400, 0]);
  const oversized: MeshData = { name: "too-big", pos, idx: new Uint32Array([0, 1, 2]), bbox: bboxOf(pos) };
  expect(() => pack([{ mesh: oversized, qty: 1 }], [256, 256, 256], 3, 6)).toThrow(/too-big/);
});

// Every user number funnels through one helper; bad values must die there.
import { readNumbers, optionsFrom, LIMITS } from "../src/validate";

// optionsFrom() is the form as the solver sees it, fed the way FormData answers: a
// string per field, null for a missing one, "on" for a ticked box.
const SHIPPED: Record<string, string> = {
  w: "300", d: "520", h: "240", front: "0", canD: "66", canL: "122.5", bedX: "256", bedY: "256", bedZ: "256",
  hexR: "13", slope: "3", lipGap: "5", fit: "0", design: "standard", pattern: "hex", base: "flat", across: "centre", along: "centre",
  cascade: "on", cover: "on", hexAuto: "on",
};
const formOf = (over: Record<string, string | null> = {}) => (name: string) => (name in over ? over[name] : SHIPPED[name] ?? null);

test("optionsFrom turns the shipped form into the default options", () => {
  const { space, base, cascade } = optionsFrom(formOf());
  expect(space).toEqual({ w: 300, d: 520, h: 240, front: 0 });
  expect(cascade).toBe(true);
  expect(base.bed).toEqual([256, 256, 256]);
  expect(base).toMatchObject({ canD: 66, canL: 122.5, design: "standard", pattern: "hex", base: "flat", cover: true, solid: false, magnets: false, hexAuto: true });
});

test("an unticked box is absent from the form and reads as off", () => {
  const { base, cascade } = optionsFrom(formOf({ cascade: null, cover: null, solid: "on" }));
  expect(cascade).toBe(false);
  expect(base.cover).toBe(false);
  expect(base.solid).toBe(true);
});

test("optionsFrom names the field that is wrong", () => {
  expect(() => optionsFrom(formOf({ canD: "abc" }))).toThrow(/can diameter needs a number/);
  expect(() => optionsFrom(formOf({ w: "10" }))).toThrow(/shelf width must be between/);
  expect(() => optionsFrom(formOf({ design: "fancy" }))).toThrow(/design: pick Standard or Minimal/);
  expect(() => optionsFrom(formOf({ pattern: "" }))).toThrow(/pattern: pick/);
  expect(() => optionsFrom(formOf({ base: "legs" }))).toThrow(/base: pick/);
  expect(() => optionsFrom(formOf({ across: "middle" }))).toThrow(/grid position/);
});

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
    w: 300, d: 520, h: 240, front: 0, canD: 66, canL: 122.5, bedX: 256, bedY: 256, bedZ: 256, hexR: 13, slope: 3, lipGap: 5, fit: 0,
  })).not.toThrow();
});

test("the fit slider's full range is accepted", () => {
  for (const fit of [-0.2, 0, 0.3]) expect(() => readNumbers({ fit })).not.toThrow();
});

// The browser's own min/max and LIMITS are the same numbers, or a shared link loads a
// value the gate accepts into a field the browser marks invalid. This used to match only
// type="number", and the only two fields that disagreed were the two type="range" ones:
// fit was -2..2 in LIMITS against -0.2..0.3 in the markup, lipGap 0..30 against 0..20.
// A range clamps silently on assignment, so the markup was the real gate and nothing saw it.
test("every bounded input in index.html carries its LIMITS bounds", async () => {
  const html = await Bun.file(new URL("../index.html", import.meta.url)).text();
  const bounded = /<input name="(\w+)" type="(?:number|range)"([^>]*)>/g;
  const inputs = [...html.matchAll(bounded)];
  // Count every bounded input that carries a name, however its attributes are ordered, and
  // require the strict matcher above to have found all of them. A floor written with the
  // same attribute order as the matcher is a tautology: it cannot disagree, and reordering
  // one input's attributes would drop it out of the cross-check silently.
  const named = [...html.matchAll(/<input ([^>]*type="(?:number|range)"[^>]*)>/g)]
    .filter(([, attrs]) => / name="\w+"/.test(` ${attrs}`));
  expect(inputs.map(([, name]) => name).sort())
    .toEqual(named.map(([, attrs]) => /name="(\w+)"/.exec(attrs)![1]).sort());
  // The explode slider is deliberately nameless: it drives the viewer, not the solver.
  expect(named.length).toBeLessThan([...html.matchAll(/<input [^>]*type="(?:number|range)"/g)].length);
  for (const [, name, attrs] of inputs) {
    const limit = LIMITS[name];
    expect(limit, name).toBeDefined();
    expect(Number(/min="([^"]*)"/.exec(attrs)?.[1]), `${name} min`).toBe(limit.min);
    expect(Number(/max="([^"]*)"/.exec(attrs)?.[1]), `${name} max`).toBe(limit.max);
  }
});


// bboxOf seeds with +-Infinity and hands them back for a mesh with no vertices. pack()
// tests every extent with `>`, which -Infinity passes, so the empty part seated, set its
// shelf width to -Infinity, and the centring pushed every part already on that shelf to
// x = Infinity. The 3MF then carried `<vertex x="Infinity">` and the part that looked
// wrong was not the broken one. Unreachable today - the fit slider clamps well above the
// -1.75 where a tab hole goes negative - but the only thing stopping it is markup.
test("pack() refuses a mesh with no geometry instead of poisoning the plate", () => {
  const box = (name: string): MeshData => {
    const pos = new Float32Array([0, 0, 0, 100, 0, 0, 100, 50, 0]);
    return { name, pos, idx: new Uint32Array([0, 1, 2]), bbox: bboxOf(pos) };
  };
  const empty: MeshData = { name: "ghost", pos: new Float32Array(0), idx: new Uint32Array(0), bbox: bboxOf(new Float32Array(0)) };
  expect(bboxOf(new Float32Array(0))[0]).toBe(Infinity);
  expect(() => pack([{ mesh: box("deck"), qty: 1 }, { mesh: empty, qty: 1 }], [256, 256, 256], 3)).toThrow(/ghost/);
  const good = pack([{ mesh: box("deck"), qty: 2 }], [256, 256, 256], 3);
  expect(good.every((p) => p.bbox.every(Number.isFinite))).toBe(true);
});

// laneOf runs its interior tabs through clear(), which keeps them 12 mm off the wall-top
// pins at +-px, but places the two end tabs unconditionally. The front one and the pin
// below it are |inset + 7 - 40| apart whatever the lane length, so a 20-32 mm can drops
// the deck's ear straight onto that pin. Every part is a valid one-piece solid with no
// overhang - the snapshot, the island test and the overhang test all pass - and the tier
// will not seat. Only cascade lanes have a chute, so only they have the clash.
test("a can that puts the deck's front ear on the pin below is rejected", () => {
  for (const canD of [20, 25, 31]) {
    const options = { ...DEFAULTS, canD };
    expect(check(options, solve(options)).some((w) => w.startsWith("FAIL") && w.includes("seat")), `canD ${canD}`).toBe(true);
    // The flat style has no chute, so it keeps working and is still offered.
    expect(fitSpace({ w: 400, d: 400, h: 900, front: 0 }, options, { cascade: true }).every((l) => l.style === "flat")).toBe(true);
  }
  for (const canD of [33, 66, 100]) {
    const options = { ...DEFAULTS, canD };
    expect(check(options, solve(options)).some((w) => w.includes("seat")), `canD ${canD}`).toBe(false);
  }
});
